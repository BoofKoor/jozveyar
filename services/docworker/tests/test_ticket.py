"""
برگه‌های سفارش (برش ۵٫۱، ADR-043؛ از ۹٫۲ از قالب، ADR-057): کار `prepare_ticket` و پیش‌نمایش قالب روی پستگرس و Garage واقعی (بی
`DATABASE_URL` و `S3_*` رد می‌شود، مثل `test_orders.py`). ساختن خود قالب، دیوارهایش و قالب‌های پیش‌فرض در `test_ticket_render.py`.

متن فارسی را PyMuPDF به شکل‌های نمایشی حرف‌ها برمی‌گرداند، پس سنجش‌ها روی عددها، نشانه‌های لاتین قالب، دادهٔ ساختن و اثر انگشت‌اند.
"""

import os
import uuid
from datetime import datetime

import fitz
import pytest

from docworker import ticket
from docworker.jobs import PermanentFailure
from docworker.ticket import PREPARE_TICKET, PREVIEW_TICKET_TEMPLATE, preview_key_of, template_preview_keys, ticket_keys

DUE = datetime.fromisoformat("2026-10-06T00:00:00+03:30")  # «تا پایان دوشنبه 13 مهر»
PAID = datetime.fromisoformat("2026-10-03T14:05:00+03:30")


def test_ticket_keys_carry_the_stamp_and_every_page_has_a_preview():
    pdf, png = ticket_keys(10027, "0123456789abcdef0123456789abcdef")
    assert (pdf, png) == ("orders/10027/ticket-0123456789abcdef.pdf", "orders/10027/ticket-0123456789abcdef.png")
    # صفحهٔ اول همان کلید پیش از ۹٫۲؛ بقیه کنارش.
    assert [preview_key_of(png, n) for n in (1, 2, 3)] == [
        png,
        "orders/10027/ticket-0123456789abcdef-2.png",
        "orders/10027/ticket-0123456789abcdef-3.png",
    ]
    assert template_preview_keys(7) == ("ticket-templates/7/preview.pdf", "ticket-templates/7/preview.png")


def test_without_vazirmatn_the_ticket_fails_clearly(monkeypatch, tmp_path):
    monkeypatch.setattr(ticket, "FONT_DIRS", (str(tmp_path),))
    with pytest.raises(PermanentFailure) as failure:
        ticket.font_dir()
    assert failure.value.code == "font_missing"


# ── روی پستگرس و Garage واقعی ────────────────────────────────────────────────

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

ENABLED = all(os.environ.get(k) for k in ("DATABASE_URL", "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"))
services = pytest.mark.skipif(not ENABLED, reason="DATABASE_URL و S3_* لازم است")


@pytest.fixture
def conn():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c
        # قالب فعال برگهٔ تست‌های بعد را عوض می‌کرد؛ نسخه پاک نمی‌شود (`ticket_templates_append_only`)، پس فقط غیرفعال.
        c.rollback()
        c.execute("UPDATE ticket_templates SET is_active = false WHERE is_active")
        c.commit()


@pytest.fixture
def worker(monkeypatch):
    from docworker.__main__ import Worker

    monkeypatch.setenv("S3_BUCKET", os.environ.get("S3_BUCKET") or "jozveyar")
    w = Worker()
    w.fonts_due = float("inf")
    w.retention_due = float("inf")
    return w


def paid_order(conn, *, status="paid"):
    """سفارش پرداخت‌شدهٔ دو بخشی با ریز قیمت همان شکل سرور، و کار برگه در صف."""
    version = conn.execute("SELECT version FROM price_lists WHERE is_active").fetchone()[0]
    user_id = conn.execute(
        """INSERT INTO users (mobile) VALUES ('09152345678')
           ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id"""
    ).fetchone()[0]
    breakdown = {"items": [{"pageCount": 120, "sheets": 60, "volumes": 1, "sheetsPerVolume": [60]}]}
    order_id, number = conn.execute(
        """INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, shipping_rials,
                               total_rials, est_weight_grams, sla_days, shipping_method_id, shipping_zone_id, province_id,
                               city_id, recipient_name, recipient_phone, address_text, postal_code)
           VALUES (gen_random_uuid(), %s, %s, %s, 1000, 500, 1500, 300, 2, 'post', 'other', 11, 1326,
                   'مریم کاظمی', '09152345678', 'بلوار سجاد، سجاد 18، پلاک 42', '9187654321')
        RETURNING id::text, order_number""",
        (user_id, version, Jsonb(breakdown)),
    ).fetchone()
    item_id = conn.execute(
        """INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, paper_size, binding_type_id)
           VALUES (%s, 1, 120, 1, 'double', 'a5', 'spiral_clear') RETURNING id""",
        (order_id,),
    ).fetchone()[0]
    for seq, (name, pages) in enumerate([("ریاضی ۲ - جلسه ۱.pdf", 48), ("حل تمرین.docx", 72)], start=1):
        doc_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key, status, page_count,
                                      session_hash, uploaded_at, file_expires_at)
               VALUES (%s, %s, 'pdf', 'application/pdf', 1000, %s, 'ready', %s, %s, now(), now() + interval '2 days')""",
            (doc_id, name, f"uploads/{doc_id}.pdf", pages, "t" * 64),
        )
        conn.execute(
            "INSERT INTO order_item_sections (order_item_id, seq, document_id, page_count) VALUES (%s, %s, %s, %s)",
            (item_id, seq, doc_id, pages),
        )
    conn.execute(
        """INSERT INTO print_rules (order_item_id, seq, page_ranges, color_mode, paper_type_id)
           VALUES (%s, 1, %s, 'bw', 'tahrir80')""",
        (item_id, Jsonb([[1, 120]])),
    )
    conn.commit()
    if status != "awaiting_payment":
        conn.execute(
            """UPDATE orders SET status = 'paid', paid_at = %s, post_handoff_due_at = %s WHERE id = %s""",
            (PAID, DUE, order_id),
        )
        if status != "paid":
            conn.execute("UPDATE orders SET status = %s WHERE id = %s", (status, order_id))
    conn.execute("INSERT INTO jobs (kind, order_id) VALUES (%s, %s)", (PREPARE_TICKET, order_id))
    conn.commit()
    return order_id, number


def template(conn, kind: str, html: str, *, active: bool = False) -> int:
    """نسخهٔ تازهٔ قالب، همان که پنل بارگذاری می‌کند؛ `active` همان که فعال کردن می‌کند."""
    import hashlib

    owner = conn.execute(
        """INSERT INTO admin_users (username, display_name) VALUES ('ticket_owner', 'مالک تست')
           ON CONFLICT (username) DO UPDATE SET display_name = excluded.display_name RETURNING id"""
    ).fetchone()[0]
    template_id = conn.execute(
        """INSERT INTO ticket_templates (kind, version, html, sha256, file_name, created_by)
           VALUES (%s, (SELECT coalesce(max(version), 0) + 1 FROM ticket_templates WHERE kind = %s), %s, %s, 'template.html', %s)
           RETURNING id""",
        (kind, kind, html, hashlib.sha256(html.encode()).hexdigest(), owner),
    ).fetchone()[0]
    if active:
        activate(conn, template_id, kind)
    conn.commit()
    return template_id


def activate(conn, template_id: int, kind: str) -> None:
    conn.execute("UPDATE ticket_templates SET is_active = false WHERE kind = %s AND is_active", (kind,))
    conn.execute(
        "UPDATE ticket_templates SET is_active = true, activated_at = coalesce(activated_at, now()) WHERE id = %s", (template_id,)
    )


def drain(worker, conn):
    for _ in range(20):
        if not worker.run_once(conn):
            break


def ticket_job(conn, order_id):
    return conn.execute(
        "SELECT status::text, attempts, last_error FROM jobs WHERE order_id = %s AND kind = %s", (order_id, PREPARE_TICKET)
    ).fetchone()


def ticket_row(conn, order_id):
    return conn.execute(
        """SELECT t.storage_key, t.preview_key, t.size_bytes, t.stamp, t.stamp = order_ticket_stamp(o), t.page_count,
                  t.bijak_template_id, t.first_page_template_id
             FROM order_tickets t JOIN orders o ON o.id = t.order_id WHERE t.order_id = %s""",
        (order_id,),
    ).fetchone()


def pdf_text(worker, key, tmp_path) -> list[str]:
    path = str(tmp_path / f"{uuid.uuid4().hex}.pdf")
    worker.storage.download(key, path)
    with fitz.open(path) as doc:
        return [page.get_text() for page in doc]


def requeue(conn, order_id):
    conn.execute("UPDATE jobs SET status = 'queued', finished_at = NULL WHERE order_id = %s AND kind = %s", (order_id, PREPARE_TICKET))
    conn.commit()


@services
def test_a_paid_order_gets_the_bijak_and_a_first_page_with_a_preview_of_each(tmp_path, conn, worker, monkeypatch):
    rendered = []
    real = ticket.render_ticket
    monkeypatch.setattr(ticket, "render_ticket", lambda data, *rest: (rendered.append(data), real(data, *rest))[1])
    order_id, number = paid_order(conn)
    drain(worker, conn)
    assert ticket_job(conn, order_id) == ("done", 1, None)
    key, preview, size, stamp, fresh, pages, bijak_id, first_id = ticket_row(conn, order_id)
    # بیجک و برگهٔ اول تنها جزوه، با قالب‌های پیش‌فرض (بی نسخهٔ فعال).
    assert fresh and (key, preview) == ticket_keys(number, stamp)
    assert (pages, bijak_id, first_id) == (2, None, None)
    # دادهٔ برگه همان سفارش: شهر و استان، فایل‌ها با بازهٔ صفحه، کاغذ و صحافی همان نسخهٔ تعرفه، و مهلت.
    [data] = rendered
    assert (data.recipient_name, data.address, data.postal_code, data.shipping) == (
        "مریم کاظمی",
        "خراسان رضوی، مشهد، بلوار سجاد، سجاد 18، پلاک 42",
        "9187654321",
        "پست پیشتاز",
    )
    assert data.due == DUE and data.paid == PAID
    [item] = data.items
    assert item.sections == [("ریاضی ۲ - جلسه ۱.pdf", 1, 48), ("حل تمرین.docx", 49, 120)]
    assert (item.sheets, item.volumes, item.papers, item.binding, item.binding_id, item.color_modes, item.paper_size) == (
        60, [(1, 120, 60)], ["تحریر ۸۰ گرم"], "طلق و سیم", "spiral_clear", ["bw"], "a5"
    )
    texts = pdf_text(worker, key, tmp_path)
    assert len(texts) == 2 and all(str(number) in text for text in texts)
    path = str(tmp_path / "ticket.pdf")
    worker.storage.download(key, path)
    assert os.path.getsize(path) == size
    for n in (1, 2):
        worker.storage.download(preview_key_of(preview, n), str(tmp_path / f"{n}.png"))
        with open(tmp_path / f"{n}.png", "rb") as f:
            assert f.read(8) == b"\x89PNG\r\n\x1a\n"


@services
def test_an_active_template_builds_its_pages_and_is_recorded_on_the_ticket(tmp_path, conn, worker):
    bijak = template(conn, "bijak", "<p>BIJAK-V-{{ order.number }}-{{ total_copies }}</p>", active=True)
    first = template(conn, "first_page", "<p>FIRST-{{ jozve.seq }}-{{ print_info.file_info.pages }}</p>", active=True)
    order_id, number = paid_order(conn)
    drain(worker, conn)
    key, _, _, _, fresh, pages, bijak_id, first_id = ticket_row(conn, order_id)
    assert fresh and (pages, bijak_id, first_id) == (2, bijak, first)
    texts = pdf_text(worker, key, tmp_path)
    assert f"BIJAK-V-{number}-1" in texts[0] and "FIRST-1-120" in texts[1]


@services
def test_a_template_activated_while_the_ticket_is_built_rebuilds_it(conn, worker, monkeypatch):
    """فعال کردن قالب وسط ساختن (کار در دست کارگر، پس فعال کردن آن را دوباره در صف نمی‌گذارد): کارگر پیش از ثبت قالب‌های فعال را
    زیر قفل می‌سنجد و برگه را با قالب تازه از نو می‌سازد. شاهد: بی فعال کردن، یک بار."""
    order_id, _ = paid_order(conn)
    late = template(conn, "bijak", "<p>LATE {{ order.number }}</p>")
    used = []
    real = ticket.render_ticket

    def render(data, templates, *paths):
        used.append(templates["bijak"].id)
        if len(used) == 1:
            with psycopg.connect(os.environ["DATABASE_URL"]) as other:
                activate(other, late, "bijak")
        return real(data, templates, *paths)

    monkeypatch.setattr(ticket, "render_ticket", render)
    drain(worker, conn)
    assert used == [None, late]
    assert ticket_job(conn, order_id) == ("done", 1, None)
    assert ticket_row(conn, order_id)[6] == late


@services
def test_a_broken_active_template_fails_the_ticket_with_its_template_and_line(conn, worker):
    template(conn, "first_page", "<p>یک</p>\n<p>{{ 1 + 'a' }}</p>", active=True)
    order_id, _ = paid_order(conn)
    drain(worker, conn)
    status, _, error = ticket_job(conn, order_id)
    # شکست قطعی با نوع قالب: پنل «برگه ساخته نشد» را با همین می‌گوید، و پس از قالب درست «دوباره بساز».
    assert status == "failed" and error.startswith("template_error: first_page") and "TypeError" in error
    assert ticket_row(conn, order_id) is None


@services
def test_an_edit_that_arrives_while_the_ticket_is_built_rebuilds_it(conn, worker, monkeypatch):
    """ویرایش گیرنده وسط ساختن (کار در دست کارگر، پس ویرایش آن را دوباره در صف نمی‌گذارد): کارگر پیش از ثبت اثر انگشت را
    زیر قفل ردیف سفارش می‌سنجد و برگه را با دادهٔ تازه از نو می‌سازد. شاهد: بی ویرایش، یک بار."""
    order_id, _ = paid_order(conn)
    names = []
    real = ticket.render_ticket

    def render(data, *rest):
        names.append(data.recipient_name)
        if len(names) == 1:
            with psycopg.connect(os.environ["DATABASE_URL"]) as other:
                other.execute("UPDATE orders SET recipient_name = 'مریم کاظمی‌نژاد' WHERE id = %s", (order_id,))
        return real(data, *rest)

    monkeypatch.setattr(ticket, "render_ticket", render)
    drain(worker, conn)
    assert names == ["مریم کاظمی", "مریم کاظمی‌نژاد"]
    assert ticket_job(conn, order_id) == ("done", 1, None)
    assert ticket_row(conn, order_id)[4] is True

    names.clear()
    requeue(conn, order_id)
    monkeypatch.setattr(ticket, "render_ticket", lambda data, *rest: (names.append(data.recipient_name), real(data, *rest))[1])
    drain(worker, conn)
    assert names == ["مریم کاظمی‌نژاد"]


@services
def test_an_unpaid_or_cancelled_order_gets_no_ticket(conn, worker):
    unpaid, _ = paid_order(conn, status="awaiting_payment")
    cancelled, _ = paid_order(conn, status="cancelled")
    printing, _ = paid_order(conn, status="printing")
    drain(worker, conn)
    assert ticket_job(conn, unpaid)[0] == "failed" and ticket_job(conn, unpaid)[2].startswith("order_not_paid")
    assert ticket_job(conn, cancelled)[0] == "failed" and ticket_job(conn, cancelled)[2] == "order_closed: cancelled"
    assert ticket_row(conn, unpaid) is None and ticket_row(conn, cancelled) is None
    # شاهد: «در حال چاپ» هنوز چاپ می‌شود و برگه می‌گیرد.
    assert ticket_job(conn, printing) == ("done", 1, None)


@services
def test_the_ticket_names_the_print_partner_and_a_new_partner_rebuilds_it(conn, worker, monkeypatch):
    """برش ۵٫۲: نام و شهر چاپخانهٔ سفارش روی برگه، و در اثر انگشتش؛ پس سفارشی که چاپخانه گرفت، برگهٔ کهنه‌اش دیگر «تازه» نیست
    و ساختن دوباره چاپخانه را دارد. شاهد: پیش از تخصیص، بی چاپخانه."""
    rendered = []
    real = ticket.render_ticket
    monkeypatch.setattr(ticket, "render_ticket", lambda data, *rest: (rendered.append(data.partner), real(data, *rest))[1])
    order_id, _ = paid_order(conn)
    drain(worker, conn)
    assert rendered == [None] and ticket_row(conn, order_id)[4] is True

    name = f"چاپ نور {uuid.uuid4().hex[:6]}"
    partner_id = conn.execute(
        "INSERT INTO print_partners (name, province_id, city_id) VALUES (%s, 11, 1326) RETURNING id", (name,)
    ).fetchone()[0]
    # همان کاری که پرداخت می‌کند: چاپخانه و ردیف تخصیص در یک تراکنش (تریگر معوق `order_assignments_recorded`).
    conn.execute("UPDATE orders SET print_partner_id = %s WHERE id = %s", (partner_id, order_id))
    conn.execute(
        """INSERT INTO order_assignments (order_id, to_partner_id, actor, rule) VALUES (%s, %s, 'system', 'city')""",
        (order_id, partner_id),
    )
    requeue(conn, order_id)
    assert ticket_row(conn, order_id)[4] is False
    drain(worker, conn)
    assert rendered == [None, (name, "مشهد")]
    assert ticket_row(conn, order_id)[4] is True


def preview_job(conn, template_id: int, payload: dict | None = None) -> None:
    """همان کاری که «پیش‌نمایش» پنل می‌کند: یک کار برای هر نسخه، که بار دوم دوباره در صف می‌رود."""
    conn.execute(
        """INSERT INTO jobs (kind, ticket_template_id, payload) VALUES (%s, %s, %s)
           ON CONFLICT (ticket_template_id, kind) DO UPDATE
              SET status = 'queued', attempts = 0, payload = excluded.payload, run_after = now(), last_error = NULL,
                  finished_at = NULL, locked_by = NULL, locked_until = NULL, updated_at = now()""",
        (PREVIEW_TICKET_TEMPLATE, template_id, Jsonb(payload or {})),
    )
    conn.commit()


def preview_row(conn, template_id):
    return conn.execute(
        """SELECT preview_order_number, preview_pages, preview_blocked, preview_error, preview_at IS NOT NULL
             FROM ticket_templates WHERE id = %s""",
        (template_id,),
    ).fetchone()


@services
def test_a_template_preview_with_sample_or_real_data_and_its_errors(tmp_path, conn, worker):
    first = template(conn, "first_page", '<p>PREVIEW-{{ jozve.seq }}</p><img src="https://example.com/logo.png">')
    # دادهٔ ساختگی: دو جزوه، پس دو برگهٔ اول؛ نشانی بیرونی گزارش، نه واکشی.
    preview_job(conn, first)
    drain(worker, conn)
    assert preview_row(conn, first) == (None, 2, ["https://example.com/logo.png"], None, True)
    pdf, png = template_preview_keys(first)
    texts = pdf_text(worker, pdf, tmp_path)
    assert ["PREVIEW-1" in texts[0], "PREVIEW-2" in texts[1]] == [True, True]
    worker.storage.download(preview_key_of(png, 2), str(tmp_path / "p2.png"))

    # همان نسخه با یک سفارش واقعی: یک جزوه؛ نتیجه جای قبلی را می‌گیرد.
    _, number = paid_order(conn)
    preview_job(conn, first, {"orderNumber": number})
    drain(worker, conn)
    assert preview_row(conn, first)[:2] == (number, 1)

    # خطای قالب شکست کار نیست: پیش‌نمایش همان را با نوع و خط می‌گوید.
    broken = template(conn, "bijak", "<p>یک</p>\n{% for %}")
    preview_job(conn, broken)
    drain(worker, conn)
    number_used, pages, _, error, done = preview_row(conn, broken)
    assert (number_used, pages, done) == (None, None, True) and error.startswith("bijak خط 2:")
    status = conn.execute(
        "SELECT status::text FROM jobs WHERE ticket_template_id = %s AND kind = %s", (broken, PREVIEW_TICKET_TEMPLATE)
    ).fetchone()[0]
    assert status == "done"
