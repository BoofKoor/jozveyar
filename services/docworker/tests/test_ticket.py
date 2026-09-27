"""
برگهٔ سفارش (برش ۵٫۱، ADR-043): PDF یک برگ A4 با وزیرمتن، و کار `prepare_ticket` روی پستگرس و Garage واقعی (بی
`DATABASE_URL` و `S3_*` رد می‌شود، مثل `test_orders.py`).

متن فارسی را PyMuPDF به شکل‌های نمایشی حرف‌ها برمی‌گرداند، پس سنجش‌ها روی عددها، جای‌شان روی برگه، دادهٔ ساختن، و اثر
انگشت‌اند.
"""

import os
import uuid
from datetime import datetime, timezone

import fitz
import pytest
from PIL import Image

from docworker import ticket
from docworker.jobs import PermanentFailure
from docworker.ticket import PREPARE_TICKET, TicketData, TicketItem, render_ticket, ticket_html, ticket_keys

DUE = datetime.fromisoformat("2026-10-06T00:00:00+03:30")  # «تا پایان دوشنبه 13 مهر»
PAID = datetime.fromisoformat("2026-10-03T14:05:00+03:30")


def sample(**over) -> TicketData:
    data = TicketData(
        order_number=10027,
        due=DUE,
        paid=PAID,
        recipient_name="مریم کاظمی",
        recipient_phone="09152345678",
        address="خراسان رضوی، مشهد، بلوار سجاد، سجاد 18، پلاک 42، واحد 6",
        postal_code="9187654321",
        shipping="پست پیشتاز",
        items=[
            TicketItem(1, 120, 60, 1, "double", ["bw"], ["تحریر ۸۰ گرم"], "طلق و سیم",
                       [("ریاضی ۲ - جلسه ۱.pdf", 1, 48), ("ریاضی ۲ - جلسه ۲.pdf", 49, 102), ("حل تمرین فصل ۱.docx", 103, 120)],
                       [(1, 120, 60)]),
        ],
    )
    for key, value in over.items():
        setattr(data, key, value)
    return data


def words(page):
    return [(w[4], w[0], w[1]) for w in page.get_text("words")]


def test_a_ticket_is_one_a4_page_with_the_label_at_the_bottom(tmp_path):
    pdf, png = str(tmp_path / "t.pdf"), str(tmp_path / "t.png")
    render_ticket(sample(), pdf, png)
    with fitz.open(pdf) as doc:
        assert doc.page_count == 1
        page = doc[0]
        assert (round(page.rect.width), round(page.rect.height)) == (595, 842)
        found = words(page)
        # شمارهٔ سفارش دو جا: درشت بالا، و کنار نام گیرنده در برچسب پایین برگه.
        numbers = sorted(y for text, _, y in found if text == "10027")
        assert len(numbers) == 2 and numbers[0] < 100 and numbers[1] > 600
        # موبایل چپ‌به‌راست، مثل پنل: بی LRE/PDF سه تکه از راست به چپ می‌نشستند.
        phone = {text: x for text, x, _ in found if text in ("0915", "234", "5678")}
        assert phone["0915"] < phone["234"] < phone["5678"]
        assert {"9187654321", "1405", "14:05", "120", "jozve-10027-1.pdf"} <= {text for text, _, _ in found}
    # پیش‌نمایش پنل: همان صفحه، ۱۵۰ DPI، خاکستری.
    with Image.open(png) as image:
        assert (image.size, image.mode) == ((1240, 1755), "L")


def test_every_string_from_a_person_is_escaped():
    data = sample(recipient_name='<img src="x">مریم', address="تهران & <b>شمال</b>", shipping="پست <i>")
    data.items[0].sections = [('<script>a</script>.pdf', 1, 120)]
    data.items[0].binding = "طلق & سیم"
    data.items[0].papers = ["<u>تحریر</u>"]
    top, bottom = ticket_html(data, ticket.font_dir())
    html = top + bottom
    for raw in ("<img", "<b>", "<i>", "<script>", "<u>"):
        assert raw not in html
    assert "&lt;img src=&quot;x&quot;&gt;مریم" in html and "&lt;script&gt;a&lt;/script&gt;.pdf" in html


def test_many_volumes_and_files_stay_on_one_page(tmp_path):
    many = [(f"جلسه {n}.pdf", 2 * n - 1, 2 * n) for n in range(1, 31)]
    data = sample(items=[
        TicketItem(1, 60, 30, 2, "double", ["color"], ["تحریر ۸۰ گرم"], "طلق و سیم", many, [(1, 60, 30)]),
        TicketItem(2, 1650, 825, 1, "double", ["bw"], ["تحریر ۸۰ گرم"], "طلق و سیم", [("Statistics.pdf", 1, 1650)],
                   [(1, 826, 413), (827, 1650, 412)]),
    ])
    top, _ = ticket_html(data, ticket.font_dir())
    # دوازده فایل نام برده می‌شوند و بقیه با شمارشان (شاهد: فایل دوازدهم هست و سیزدهم نه).
    assert "جلسه 12.pdf" in top and "جلسه 13.pdf" not in top and "و 18 فایل دیگر" in top
    pdf, png = str(tmp_path / "t.pdf"), str(tmp_path / "t.png")
    render_ticket(data, pdf, png)
    with fitz.open(pdf) as doc:
        assert doc.page_count == 1
        found = {text for text, _, _ in words(doc[0])}
        assert {"jozve-10027-2-jeld-1.pdf", "jozve-10027-2-jeld-2.pdf", "1,650"} <= found


def test_ticket_keys_carry_the_stamp():
    assert ticket_keys(10027, "0123456789abcdef0123456789abcdef") == (
        "orders/10027/ticket-0123456789abcdef.pdf",
        "orders/10027/ticket-0123456789abcdef.png",
    )


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
        """INSERT INTO order_items (order_id, seq, page_count, copies, sides_mode, binding_type_id)
           VALUES (%s, 1, 120, 1, 'double', 'spiral_clear') RETURNING id""",
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
        """SELECT t.storage_key, t.preview_key, t.size_bytes, t.stamp, t.stamp = order_ticket_stamp(o)
             FROM order_tickets t JOIN orders o ON o.id = t.order_id WHERE t.order_id = %s""",
        (order_id,),
    ).fetchone()


@services
def test_a_paid_order_gets_its_ticket_and_preview_under_orders(tmp_path, conn, worker, monkeypatch):
    rendered = []
    real = ticket.render_ticket
    monkeypatch.setattr(ticket, "render_ticket", lambda data, *paths: (rendered.append(data), real(data, *paths)))
    order_id, number = paid_order(conn)
    drain(worker, conn)
    assert ticket_job(conn, order_id) == ("done", 1, None)
    key, preview, size, stamp, fresh = ticket_row(conn, order_id)
    assert fresh and (key, preview) == ticket_keys(number, stamp)
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
    assert (item.sheets, item.volumes, item.papers, item.binding, item.color_modes) == (
        60, [(1, 120, 60)], ["تحریر ۸۰ گرم"], "طلق و سیم", ["bw"]
    )
    path = str(tmp_path / "ticket.pdf")
    worker.storage.download(key, path)
    assert os.path.getsize(path) == size
    with fitz.open(path) as doc:
        assert doc.page_count == 1 and str(number) in doc[0].get_text()
    worker.storage.download(preview, str(tmp_path / "ticket.png"))
    with open(tmp_path / "ticket.png", "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n"


@services
def test_an_edit_that_arrives_while_the_ticket_is_built_rebuilds_it(conn, worker, monkeypatch):
    """ویرایش گیرنده وسط ساختن (کار در دست کارگر، پس ویرایش آن را دوباره در صف نمی‌گذارد): کارگر پیش از ثبت اثر انگشت را
    زیر قفل ردیف سفارش می‌سنجد و برگه را با دادهٔ تازه از نو می‌سازد. شاهد: بی ویرایش، یک بار."""
    order_id, _ = paid_order(conn)
    names = []
    real = ticket.render_ticket

    def render(data, *paths):
        names.append(data.recipient_name)
        if len(names) == 1:
            with psycopg.connect(os.environ["DATABASE_URL"]) as other:
                other.execute("UPDATE orders SET recipient_name = 'مریم کاظمی‌نژاد' WHERE id = %s", (order_id,))
        real(data, *paths)

    monkeypatch.setattr(ticket, "render_ticket", render)
    drain(worker, conn)
    assert names == ["مریم کاظمی", "مریم کاظمی‌نژاد"]
    assert ticket_job(conn, order_id) == ("done", 1, None)
    assert ticket_row(conn, order_id)[4] is True

    names.clear()
    conn.execute("UPDATE jobs SET status = 'queued', finished_at = NULL WHERE order_id = %s AND kind = %s", (order_id, PREPARE_TICKET))
    conn.commit()
    monkeypatch.setattr(ticket, "render_ticket", lambda data, *paths: (names.append(data.recipient_name), real(data, *paths)))
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
