"""
کار سفارش (برش ۳ب): PDF جزوه بعد از پرداخت، زیر `orders/`.

دو بخش: ادغام با PDF واقعی PyMuPDF، بی سرویس؛ و کل کار روی پستگرس و Garage واقعی، که بی `DATABASE_URL` و
`S3_*` رد می‌شود (مثل `test_integration.py`). پایگاه داده باید مهاجرت‌شده و دادهٔ پایه‌دار باشد: در CI،
`pnpm test` پیش از این اجرا می‌شود.
"""

import hashlib
import os
import tempfile
import uuid

import fitz
import pytest

from docworker.jobs import PermanentFailure
from docworker.orders import PREPARE_ORDER, merge_sections, print_key

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
    # اندازهٔ هر صفحه همان است که بود: چیدمان کار چاپخانه است (برش ۵).
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


def paid_order(conn, sections, *, pay=True):
    """سفارش همان‌طور که سرور می‌سازد (یک تراکنش)، بعد پرداخت و کار `prepare_order` (یک تراکنش)."""
    active = conn.execute("SELECT version FROM price_lists WHERE is_active").fetchone()
    assert active, "تعرفهٔ فعال نیست — اول `pnpm test` دادهٔ پایه را بنشاند"
    total = sum(pages for _, pages in sections)
    user_id = conn.execute(
        """INSERT INTO users (mobile) VALUES ('09120000000')
           ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id"""
    ).fetchone()[0]
    order_id, number = conn.execute(
        """INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials,
                               shipping_rials, total_rials, est_weight_grams, sla_days, shipping_method_id,
                               shipping_zone_id, province_id, recipient_name, recipient_phone, address_text)
           VALUES (gen_random_uuid(), %s, %s, '{}', 1000, 500, 1500, 300, 2, 'post', 'tehran', 8,
                   'سارا احمدی', '09120000000', 'تهران، خیابان ولیعصر، پلاک 12')
        RETURNING id::text, order_number""",
        (user_id, active[0]),
    ).fetchone()
    item_id = conn.execute(
        """INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
           VALUES (%s, 1, %s, 1, 'double', 'spiral_clear') RETURNING id""",
        (order_id, total),
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
