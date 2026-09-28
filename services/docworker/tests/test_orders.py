"""
کار سفارش (برش ۳ب، و از ۵٫۱ فایل چاپ هر جلد): PDF جزوه بعد از پرداخت، زیر `orders/`، و فایل چاپ از روی آن.

دو بخش: ادغام با PDF واقعی PyMuPDF، بی سرویس؛ و کل کار روی پستگرس و Garage واقعی، که بی `DATABASE_URL` و
`S3_*` رد می‌شود (مثل `test_integration.py`). پایگاه داده باید مهاجرت‌شده و دادهٔ پایه‌دار باشد: در CI،
`pnpm test` پیش از این اجرا می‌شود. خود چیدن صفحه‌ها بی سرویس در `test_printfile.py`.
"""

import hashlib
import os
import tempfile
import uuid

import fitz
import pytest

from docworker.jobs import PermanentFailure
from docworker.orders import PREPARE_ORDER, merge_sections, order_prefix, print_key, volume_key

A4 = fitz.paper_rect("a4")
A5 = fitz.paper_rect("a5")
LETTER = fitz.paper_rect("letter")


def make_pages(path, rect, count, label):
    """PDF با `count` صفحه به اندازهٔ `rect`، هر صفحه با برچسب خودش تا ترتیب دیدنی باشد."""
    doc = fitz.open()
    for n in range(1, count + 1):
        page = doc.new_page(width=rect.width, height=rect.height)
        page.insert_text((72, 72), f"{label}-{n}")
    doc.save(str(path))
    doc.close()
    return str(path)


def labels(path):
    with fitz.open(path) as doc:
        return [page.get_text().strip() for page in doc]


def test_print_key_is_outside_the_uploads_retention_prefix():
    assert print_key(10001, 1) == "orders/10001/jozve-1.pdf"
    assert not print_key(10001, 1).startswith("uploads/")
    assert volume_key(10001, 2, 3) == "orders/10001/print-2-3.pdf"
    # پیشوند یک سفارش سفارش دیگری را نمی‌گیرد (نگهداری، ADR-044).
    assert order_prefix(1000) == "orders/1000/"
    assert not print_key(10001, 1).startswith(order_prefix(1000))


def test_one_section_is_copied_byte_for_byte(tmp_path):
    source = make_pages(tmp_path / "a.pdf", A4, 3, "a")
    out = str(tmp_path / "out.pdf")
    assert merge_sections([source], [3], out) == 3
    assert open(out, "rb").read() == open(source, "rb").read()


def test_sections_follow_each_other_in_binding_order_without_blank_pages(tmp_path):
    first = make_pages(tmp_path / "1.pdf", A4, 3, "first")
    second = make_pages(tmp_path / "2.pdf", A5, 2, "second")
    third = make_pages(tmp_path / "3.pdf", LETTER, 1, "third")
    out = str(tmp_path / "out.pdf")
    assert merge_sections([first, second, third], [3, 2, 1], out) == 6
    assert labels(out) == ["first-1", "first-2", "first-3", "second-1", "second-2", "third-1"]
    # اندازهٔ هر صفحه همان است که بود: چیدن روی A4 کار فایل چاپ است (برش ۵٫۱، `test_printfile.py`).
    with fitz.open(out) as doc:
        sizes = [(round(p.rect.width), round(p.rect.height)) for p in doc]
    assert sizes == [(595, 842)] * 3 + [(420, 595)] * 2 + [(612, 792)]


def test_a_section_that_is_not_what_the_server_counted_stops_the_job(tmp_path):
    """قیمت از شمارش سرور آمده؛ فایلی که صفحه‌هایش چیز دیگری است چاپ نمی‌شود، نه بی‌صدا."""
    first = make_pages(tmp_path / "1.pdf", A4, 3, "a")
    second = make_pages(tmp_path / "2.pdf", A4, 2, "b")
    with pytest.raises(PermanentFailure) as failure:
        merge_sections([first, second], [3, 3], str(tmp_path / "out.pdf"))
    assert failure.value.code == "page_count_mismatch"
    assert not os.path.exists(tmp_path / "out.pdf")
    with pytest.raises(PermanentFailure) as single:
        merge_sections([first], [4], str(tmp_path / "out.pdf"))
    assert single.value.code == "page_count_mismatch"


def test_corrupt_and_locked_sections_fail_with_a_clear_code(tmp_path):
    corrupt = tmp_path / "corrupt.pdf"
    corrupt.write_bytes(b"%PDF-1.4 not really")
    with pytest.raises(PermanentFailure) as failure:
        merge_sections([str(corrupt)], [1], str(tmp_path / "out.pdf"))
    assert failure.value.code == "corrupt_file"

    locked = str(tmp_path / "locked.pdf")
    doc = fitz.open()
    doc.new_page()
    doc.save(locked, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="owner")
    doc.close()
    with pytest.raises(PermanentFailure) as locked_failure:
        merge_sections([locked], [1], str(tmp_path / "out.pdf"))
    assert locked_failure.value.code == "password_protected"


# ── روی پستگرس و Garage واقعی ────────────────────────────────────────────────

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

ENABLED = all(os.environ.get(k) for k in ("DATABASE_URL", "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"))
services = pytest.mark.skipif(not ENABLED, reason="DATABASE_URL و S3_* لازم است")


@pytest.fixture
def conn():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c


@pytest.fixture
def worker(monkeypatch):
    from docworker.__main__ import Worker

    monkeypatch.setenv("S3_BUCKET", os.environ.get("S3_BUCKET") or "jozveyar")
    w = Worker()
    w.fonts_due = float("inf")  # هم‌گام‌سازی فونت جدا تست می‌شود
    w.retention_due = float("inf")  # نگهداری هم (`test_retention.py`)
    return w


def put(storage, key, body):
    with tempfile.NamedTemporaryFile() as f:
        f.write(body)
        f.flush()
        storage.upload(key, f.name, "application/pdf")


def ready_document(conn, storage, body, pages, *, converted=False):
    """سند آماده، همان‌طور که کارگر تحلیل می‌گذارد. Word تبدیل‌شده PDF خودش را کنار فایل اصلی دارد."""
    doc_id = str(uuid.uuid4())
    if converted:
        key, pdf_key = f"uploads/{doc_id}.docx", f"uploads/{doc_id}.converted.pdf"
        put(storage, key, b"PK not a pdf")
        put(storage, pdf_key, body)
    else:
        key, pdf_key = f"uploads/{doc_id}.pdf", None
        put(storage, key, body)
    conn.execute(
        """INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, pdf_storage_key,
                                  status, page_count, session_hash, uploaded_at, file_expires_at)
           VALUES (%s, %s, %s, 'application/pdf', %s, %s, %s, 'ready', %s, %s, now(), now() + interval '2 days')""",
        (doc_id, "جلسه.pdf", "docx" if converted else "pdf", len(body), key, pdf_key, pages, "o" * 64),
    )
    conn.commit()
    return doc_id


def paid_order(conn, sections, *, pay=True, sheets_per_volume=None, sides="double"):
    """سفارش همان‌طور که سرور می‌سازد (یک تراکنش)، بعد پرداخت و کار `prepare_order` (یک تراکنش).

    ریز قیمت منجمد فقط همان تکه‌ای را دارد که کارگر می‌خواند (`items[0]`: صفحه، برگ و برگ هر جلد)؛ جلدها پیش‌فرض یکی،
    و جزوهٔ بزرگ‌تر با عددهای صریح `quote()` (مثل `[413, 412]` برای ۱۶۵۰ صفحهٔ دورو).
    """
    active = conn.execute("SELECT version FROM price_lists WHERE is_active").fetchone()
    assert active, "تعرفهٔ فعال نیست — اول `pnpm test` دادهٔ پایه را بنشاند"
    total = sum(pages for _, pages in sections)
    sheets = -(-total // 2) if sides == "double" else total
    per_volume = sheets_per_volume or [sheets]
    breakdown = {"items": [{"pageCount": total, "sheets": sheets, "volumes": len(per_volume), "sheetsPerVolume": per_volume}]}
    user_id = conn.execute(
        """INSERT INTO users (mobile) VALUES ('09120000000')
           ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id"""
    ).fetchone()[0]
    order_id, number = conn.execute(
        """INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials,
                               shipping_rials, total_rials, est_weight_grams, sla_days, shipping_method_id,
                               shipping_zone_id, province_id, recipient_name, recipient_phone, address_text)
           VALUES (gen_random_uuid(), %s, %s, %s, 1000, 500, 1500, 300, 2, 'post', 'tehran', 8,
                   'سارا احمدی', '09120000000', 'تهران، خیابان ولیعصر، پلاک 12')
        RETURNING id::text, order_number""",
        (user_id, active[0], Jsonb(breakdown)),
    ).fetchone()
    item_id = conn.execute(
        """INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
           VALUES (%s, 1, %s, 1, %s, 'spiral_clear') RETURNING id""",
        (order_id, total, sides),
    ).fetchone()[0]
    for seq, (doc_id, pages) in enumerate(sections, start=1):
        conn.execute(
            "INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (%s, %s, %s, %s)",
            (item_id, seq, doc_id, pages),
        )
    conn.execute(
        """INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
           VALUES (%s, 1, %s, 'bw', 'tahrir80')""",
        (item_id, Jsonb([[1, total]])),
    )
    conn.commit()
    if pay:
        conn.execute(
            """UPDATE orders SET status = 'paid', paid_at = now(), post_handoff_due_at = now() + interval '2 days'
                WHERE id = %s""",
            (order_id,),
        )
    conn.execute("INSERT INTO jobs (kind, order_id) VALUES (%s, %s)", (PREPARE_ORDER, order_id))
    conn.commit()
    return order_id, number


def pdf_bytes(tmp_path, count, label, rect=A4):
    return open(make_pages(tmp_path / f"{label}.pdf", rect, count, label), "rb").read()


def drain(worker, conn):
    for _ in range(50):
        if not worker.run_once(conn):
            break


def order_job(conn, order_id):
    return conn.execute(
        "SELECT status::text, attempts, last_error FROM jobs WHERE order_id = %s AND kind = %s",
        (order_id, PREPARE_ORDER),
    ).fetchone()


def printed(conn, order_id):
    return conn.execute(
        """SELECT print_pdf_key, print_pdf_bytes, print_pdf_sha256, print_pdf_ready_at IS NOT NULL
             FROM order_items WHERE order_id = %s ORDER BY seq""",
        (order_id,),
    ).fetchall()


@services
def test_paid_order_gets_its_jozve_pdf_under_orders(tmp_path, conn, worker):
    first = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 3, "first"), 3)
    word = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "word", A5), 2, converted=True)
    order_id, number = paid_order(conn, [(first, 3), (word, 2)])

    drain(worker, conn)
    assert order_job(conn, order_id) == ("done", 1, None)
    [(key, size, digest, ready)] = printed(conn, order_id)
    assert (key, ready) == (f"orders/{number}/jozve-1.pdf", True)

    out = str(tmp_path / "downloaded.pdf")
    worker.storage.download(key, out)
    assert os.path.getsize(out) == size
    assert hashlib.sha256(open(out, "rb").read()).hexdigest() == digest
    # Word تبدیل‌شده از PDF خودش آمد، نه از فایل اصلی.
    assert labels(out) == ["first-1", "first-2", "first-3", "word-1", "word-2"]


@services
def test_retry_does_not_rebuild_a_ready_jozve(tmp_path, conn, worker, monkeypatch):
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "once"), 2)
    order_id, _ = paid_order(conn, [(doc_id, 2)])
    drain(worker, conn)
    assert printed(conn, order_id)[0][3] is True

    # کارگر بعد از ثبت مرد و کار دوباره در صف رفت: هیچ دانلود و ادغامی تکرار نمی‌شود.
    conn.execute("UPDATE jobs SET status = 'queued', finished_at = NULL WHERE order_id = %s", (order_id,))
    conn.commit()
    import docworker.orders as orders

    calls = []
    monkeypatch.setattr(orders, "merge_sections", lambda *args: calls.append(args))
    drain(worker, conn)
    assert calls == []
    assert order_job(conn, order_id)[0] == "done"


@services
def test_a_missing_section_file_fails_the_order_job_not_the_document(tmp_path, conn, worker):
    kept = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 1, "kept"), 1)
    lost = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 1, "lost"), 1)
    worker.storage.delete(f"uploads/{lost}.pdf")
    order_id, number = paid_order(conn, [(kept, 1), (lost, 1)])

    drain(worker, conn)
    status, attempts, error = order_job(conn, order_id)
    assert (status, attempts) == ("failed", 1)
    assert error.startswith("file_missing")
    assert printed(conn, order_id)[0][3] is False
    # سند سالم «شکست‌خورده» نمی‌شود: شکست مال کار سفارش است.
    statuses = conn.execute(
        "SELECT status::text FROM documents WHERE id = ANY(%s)", ([kept, lost],)
    ).fetchall()
    assert statuses == [("ready",), ("ready",)]
    assert worker.storage.list_objects(f"orders/{number}/") == []


@services
def test_a_file_that_is_not_what_was_priced_is_never_printed(tmp_path, conn, worker):
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "short"), 3)
    order_id, number = paid_order(conn, [(doc_id, 3)])
    drain(worker, conn)
    status, _, error = order_job(conn, order_id)
    assert status == "failed" and error.startswith("page_count_mismatch")
    assert worker.storage.list_objects(f"orders/{number}/") == []


@services
def test_an_unpaid_order_gets_no_print_file(tmp_path, conn, worker):
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 1, "unpaid"), 1)
    order_id, number = paid_order(conn, [(doc_id, 1)], pay=False)
    drain(worker, conn)
    status, _, error = order_job(conn, order_id)
    assert status == "failed" and error.startswith("order_not_paid")
    assert worker.storage.list_objects(f"orders/{number}/") == []


def set_status(conn, order_id, status):
    """وضعیت پنل (برش ۴٫۳)، از همان گذاری که تریگر `orders_status_flow` می‌پذیرد: «در صف چاپ» به «در حال چاپ» یا «لغو شد»."""
    conn.execute("UPDATE orders SET status = %s WHERE id = %s", (status, order_id))
    conn.commit()


@services
def test_an_order_already_printing_still_gets_its_jozve_pdf(tmp_path, conn, worker):
    """«شروع چاپ» پیش از رسیدن کار به کارگر، یا «دوباره بساز» بعدش: کار نمی‌شکند (برش ۴٫۳)."""
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "printing"), 2)
    order_id, number = paid_order(conn, [(doc_id, 2)])
    set_status(conn, order_id, "printing")
    drain(worker, conn)
    assert order_job(conn, order_id) == ("done", 1, None)
    [(key, _, _, ready)] = printed(conn, order_id)
    assert (key, ready) == (f"orders/{number}/jozve-1.pdf", True)


@services
def test_a_cancelled_order_gets_no_print_file(tmp_path, conn, worker):
    """لغو پیش از ساختن PDF: فایل مشتری زیر `orders/` کپی نمی‌شود، و دلیلش روشن است نه «پرداخت نشده»."""
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 1, "cancelled"), 1)
    order_id, number = paid_order(conn, [(doc_id, 1)])
    set_status(conn, order_id, "cancelled")
    drain(worker, conn)
    status, attempts, error = order_job(conn, order_id)
    assert (status, attempts) == ("failed", 1)
    assert error == "order_closed: cancelled"
    assert printed(conn, order_id)[0][3] is False
    assert worker.storage.list_objects(f"orders/{number}/") == []


# ── فایل چاپ هر جلد (برش ۵٫۱، ADR-043) ───────────────────────────────────────


def print_files(conn, order_id):
    return conn.execute(
        """SELECT f.volume, f.first_page, f.last_page, f.storage_key, f.size_bytes, f.sha256, f.changes
             FROM order_print_files f JOIN order_items i ON i.id = f.order_item_id
            WHERE i.order_id = %s ORDER BY i.seq, f.volume""",
        (order_id,),
    ).fetchall()


def fetched(worker, key, tmp_path):
    path = str(tmp_path / key.replace("/", "_"))
    worker.storage.download(key, path)
    return path


@services
def test_an_a4_jozve_in_one_volume_prints_from_the_jozve_itself(tmp_path, conn, worker):
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 3, "a4"), 3)
    order_id, number = paid_order(conn, [(doc_id, 3)])
    drain(worker, conn)
    assert order_job(conn, order_id) == ("done", 1, None)
    [(key, size, digest, _)] = printed(conn, order_id)
    # همان PDF جزوه، همان کلید و همان بایت‌ها؛ بی کپی دوم.
    assert print_files(conn, order_id) == [(1, 1, 3, key, size, digest, None)]
    assert [o.key for o in worker.storage.list_objects(f"orders/{number}/")] == [f"orders/{number}/jozve-1.pdf"]


@services
def test_a_jozve_with_other_sizes_gets_its_own_print_file_on_a4(tmp_path, conn, worker):
    a4 = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "a4"), 2)
    a5 = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "a5", A5), 2, converted=True)
    order_id, number = paid_order(conn, [(a4, 2), (a5, 2)])
    drain(worker, conn)
    assert order_job(conn, order_id) == ("done", 1, None)
    [(volume, first, last, key, size, digest, changes)] = print_files(conn, order_id)
    assert (volume, first, last, key) == (1, 1, 4, volume_key(number, 1, 1))
    assert changes == {"resized": [[3, 4, 420, 595]]}
    path = fetched(worker, key, tmp_path)
    assert (os.path.getsize(path), hashlib.sha256(open(path, "rb").read()).hexdigest()) == (size, digest)
    with fitz.open(path) as doc:
        assert [(round(p.rect.width), round(p.rect.height)) for p in doc] == [(595, 842)] * 4
    assert labels(path) == ["a4-1", "a4-2", "a5-1", "a5-2"]
    # PDF جزوه همان‌طور که بود می‌ماند (پنل «PDF اصلی جزوه» را می‌دهد).
    [(jozve_key, *_)] = printed(conn, order_id)
    with fitz.open(fetched(worker, jozve_key, tmp_path)) as jozve:
        assert [(round(p.rect.width), round(p.rect.height)) for p in jozve] == [(595, 842)] * 2 + [(420, 595)] * 2


@services
def test_a_long_jozve_is_split_into_volumes_exactly_like_its_breakdown(tmp_path, conn, worker):
    # ۱۶۵۰ صفحهٔ دورو، [413, 412] برگ: صفحهٔ ۱ تا ۸۲۶ و ۸۲۷ تا ۱۶۵۰.
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 1650, "long"), 1650)
    order_id, number = paid_order(conn, [(doc_id, 1650)], sheets_per_volume=[413, 412])
    drain(worker, conn)
    assert order_job(conn, order_id) == ("done", 1, None)
    rows = print_files(conn, order_id)
    assert [(v, f, l, k, c) for v, f, l, k, _, _, c in rows] == [
        (1, 1, 826, volume_key(number, 1, 1), None),
        (2, 827, 1650, volume_key(number, 1, 2), None),
    ]
    first, second = (labels(fetched(worker, row[3], tmp_path)) for row in rows)
    assert (len(first), first[0], first[-1]) == (826, "long-1", "long-826")
    assert (len(second), second[0], second[-1]) == (824, "long-827", "long-1650")


@services
def test_an_order_from_before_print_files_gets_them_from_its_jozve_pdf(tmp_path, conn, worker, monkeypatch):
    """سفارش باز پیش از ۵٫۱ (و «دوباره بساز» پس از شکست فایل چاپ): PDF جزوه هست، فایل‌های `uploads/` شاید نه."""
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "old", A5), 2)
    order_id, number = paid_order(conn, [(doc_id, 2)])
    drain(worker, conn)
    [(key, *_)] = printed(conn, order_id)
    conn.execute(
        "DELETE FROM order_print_files WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = %s)", (order_id,)
    )
    worker.storage.delete(volume_key(number, 1, 1))
    worker.storage.delete(f"uploads/{doc_id}.pdf")
    conn.execute("UPDATE documents SET file_deleted_at = now() WHERE id = %s", (doc_id,))
    conn.execute("UPDATE jobs SET status = 'queued', finished_at = NULL WHERE order_id = %s", (order_id,))
    conn.commit()
    import docworker.orders as orders

    merged = []
    monkeypatch.setattr(orders, "merge_sections", lambda *args: merged.append(args))
    drain(worker, conn)
    assert order_job(conn, order_id)[0] == "done"
    assert merged == []
    [(_, _, _, print_key_, *_)] = print_files(conn, order_id)
    assert labels(fetched(worker, print_key_, tmp_path)) == ["old-1", "old-2"]
    assert printed(conn, order_id)[0][0] == key


@services
def test_a_jozve_pdf_that_is_not_what_was_recorded_is_never_printed(tmp_path, conn, worker):
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 2, "kept", A5), 2)
    order_id, number = paid_order(conn, [(doc_id, 2)])
    drain(worker, conn)
    conn.execute(
        "DELETE FROM order_print_files WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = %s)", (order_id,)
    )
    conn.execute("UPDATE jobs SET status = 'queued', finished_at = NULL WHERE order_id = %s", (order_id,))
    conn.commit()
    put(worker.storage, f"orders/{number}/jozve-1.pdf", pdf_bytes(tmp_path, 2, "other", A5))
    drain(worker, conn)
    status, _, error = order_job(conn, order_id)
    assert status == "failed" and error.startswith("file_mismatch")
    assert print_files(conn, order_id) == []


@services
def test_a_breakdown_that_does_not_match_the_jozve_builds_nothing(tmp_path, conn, worker):
    doc_id = ready_document(conn, worker.storage, pdf_bytes(tmp_path, 4, "four"), 4)
    # ۴ صفحهٔ دورو دو برگ است، نه یک.
    order_id, number = paid_order(conn, [(doc_id, 4)], sheets_per_volume=[1])
    drain(worker, conn)
    status, _, error = order_job(conn, order_id)
    assert status == "failed" and error.startswith("breakdown_mismatch")
    # پیش از هر دانلودی: نه PDF جزوه، نه فایل چاپ.
    assert worker.storage.list_objects(f"orders/{number}/") == []
    assert printed(conn, order_id)[0][3] is False
