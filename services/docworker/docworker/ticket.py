"""
برگهٔ سفارش (برش ۵٫۱، ADR-043): یک برگ A4، سیاه روی سفید، جدا از فایل‌های جزوه (نه در قیمت، نه در صحافی).

بالا: شمارهٔ سفارش درشت، مهلت تحویل به پست، و برای هر جزوه فایل‌ها با بازهٔ صفحه، صفحه و برگ، دورو یا یکرو، رنگ، کاغذ،
صحافی و جلدها، و تعداد نسخه. پایین، برای بریدن: برچسب پست با نام گیرنده و شمارهٔ سفارش کنارش («مریم کاظمی 10027»)،
همان که متصدی پست در «نام گ» می‌نویسد و برش ۶ کد رهگیری را با آن پیدا می‌کند (ADR-010)؛ نشانی، کد پستی و موبایل. بی مبلغ.

کار جدای `prepare_ticket`، تا شکستش PDF جزوه را «ساخته نشد» نکند. PDF با وزیرمتن همان ایمیج (`insert_htmlbox`)، و پیش‌نمایش
PNG همان صفحه برای پنل. برگه با دادهٔ امروز سفارش ساخته می‌شود: اثر انگشت آن داده (`order_ticket_stamp`، مهاجرت 0016) پیش از
ثبت، زیر قفل اشتراکی ردیف سفارش، دوباره سنجیده می‌شود؛ ویرایشی که وسط ساختن رسید برگه را از نو می‌سازد، و ویرایشی که بعد
از ثبت برسد کار را خودش دوباره در صف می‌گذارد (`packages/db/src/panel.ts`).
"""

from __future__ import annotations

import hashlib
import html
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime

import fitz  # PyMuPDF
import psycopg

from . import jalali
from .jobs import PermanentFailure
from .orders import ORDERS_PREFIX, PRINTABLE, UNPAID, plan_volumes
from .storage import S3Storage

PREPARE_TICKET = "prepare_ticket"

A4 = fitz.paper_rect("a4")
MARGIN = 42  # حدود ۱۵ میلی‌متر
# برچسب پست و خط بریدن در پایین برگه، همیشه همان‌جا.
LABEL_HEIGHT = 250
PREVIEW_DPI = 150
# ویرایشی که وسط هر ساختن برسد، ساختن را از نو می‌کند؛ بیش از این یعنی چیزی غیرعادی است و کار بعداً دوباره امتحان می‌شود.
MAX_REBUILDS = 3

# وزیرمتن، فقط ۴۰۰ و ۶۰۰ (CLAUDE.md): در ایمیج پایه کنار فونت‌های LibreOffice، و در مخزن برای تست بیرون ایمیج.
FONT_DIRS = (
    "/usr/local/share/fonts/jozveyar/vazirmatn",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts", "vazirmatn"),
)
FONT_FILES = ("Vazirmatn-Regular.ttf", "Vazirmatn-SemiBold.ttf")

VOLUME_WORDS = {1: "یک", 2: "دو", 3: "سه", 4: "چهار", 5: "پنج"}
SIDES = {"double": "دورو", "single": "یکرو"}
# بیشترین فایلی که برگه نام می‌برد؛ بقیه با شمارشان. فایل چاپ همه را دارد، و برگه یک برگ است.
MAX_LISTED_SECTIONS = 12
# اندازهٔ قلم قاب «سیاه‌سفید · دورو»، همان `.mode` در CSS.
MODE_SIZE = 13


def ticket_keys(order_number: int, stamp: str) -> tuple[str, str]:
    """PDF و پیش‌نمایش برگه، به نام اثر انگشت داده‌اش: فایلی که زیر یک کلید نشست دیگر عوض نمی‌شود، پس ردیفی که به آن اشاره
    می‌کند هیچ‌وقت فایل دادهٔ دیگری را نمی‌دهد، حتی وسط ساختن دوباره. برگه‌های کهنه با بقیهٔ فایل‌های سفارش پاک می‌شوند
    (ADR-044)."""
    base = f"{ORDERS_PREFIX}{order_number}/ticket-{stamp[:16]}"
    return f"{base}.pdf", f"{base}.png"


def jozve_file_name(order_number: int, seq: int, volume: int, volumes: int) -> str:
    """نام فایل چاپ، همان که پنل با آن دانلود می‌کند (`apps/admin/lib/orders.ts`)."""
    return f"jozve-{order_number}-{seq}.pdf" if volumes == 1 else f"jozve-{order_number}-{seq}-jeld-{volume}.pdf"


@dataclass
class TicketItem:
    seq: int
    page_count: int
    sheets: int
    copies: int
    sides_mode: str
    color_modes: list[str]
    papers: list[str]
    binding: str
    # (نام فایل، از صفحه، تا صفحه)
    sections: list[tuple[str, int, int]]
    # (از صفحه، تا صفحه، برگ)
    volumes: list[tuple[int, int, int]]


@dataclass
class TicketData:
    order_number: int
    due: datetime
    paid: datetime | None
    recipient_name: str
    recipient_phone: str
    address: str
    postal_code: str | None
    shipping: str
    items: list[TicketItem] = field(default_factory=list)


def font_dir() -> str:
    for directory in FONT_DIRS:
        if all(os.path.isfile(os.path.join(directory, name)) for name in FONT_FILES):
            return directory
    raise PermanentFailure("font_missing", "وزیرمتن پیدا نشد")


def _ltr(text: str) -> str:
    """متن چپ‌به‌راست درون متن فارسی (موبایل با فاصله، نام فایل لاتین)، escape‌شده. موتور HTML MuPDF `direction` و
    `unicode-bidi` یک span را نمی‌خواند و LRI/PDI را هم نه، ولی LRE/PDF را درست می‌خواند؛ بی آن «0915 234 5678» سه
    تکهٔ جدا از راست به چپ می‌شد."""
    return f"&#x202A;{html.escape(text)}&#x202C;"


def _phone(phone: str) -> str:
    """«0915 234 5678»، مثل `phoneText` پنل."""
    return f"{phone[:4]} {phone[4:7]} {phone[7:]}" if len(phone) == 11 and phone.isdigit() else phone


def _color(modes: list[str]) -> str:
    """مثل `colorText` پنل."""
    color, bw = "color" in modes, "bw" in modes
    return "رنگی و سیاه‌سفید" if color and bw else "رنگی" if color else "سیاه‌سفید"


def _pages(first: int, last: int) -> str:
    return f"صفحهٔ {first:,}" if first == last else f"صفحهٔ {first:,} تا {last:,}"


# جدول‌های MuPDF ستون‌ها را همیشه از چپ به راست می‌چینند، پس هر ردیف به ترتیب دیداری نوشته شده: ستون راست آخر.
CSS = """
@font-face { font-family: vz; src: url(Vazirmatn-Regular.ttf); }
@font-face { font-family: vz; src: url(Vazirmatn-SemiBold.ttf); font-weight: bold; }
* { font-family: vz; color: #000000; } /* print-black برند: فقط چاپ تک‌رنگ */
body { direction: rtl; font-size: 10.5pt; line-height: 1.55; margin: 0; }
p { margin: 0; }
.k { font-size: 9pt; }
.no { font-size: 46pt; font-weight: bold; line-height: 1.05; margin-top: 2pt; }
.due { font-size: 14pt; font-weight: bold; margin-top: 8pt; }
.rule { border-top: 1.2pt solid #000000; margin: 12pt 0 10pt 0; }
.item { margin-bottom: 12pt; }
.title { font-size: 12.5pt; font-weight: bold; }
.mode { font-size: 13pt; font-weight: bold; border: 1.4pt solid #000000; padding: 1pt 0; text-align: center; }
table { border-collapse: collapse; width: 100%; }
td { vertical-align: top; padding: 1.5pt 0; }
td.dt { font-weight: bold; width: 62pt; }
td.l { text-align: left; white-space: nowrap; }
.cutline { border-top: 1pt dashed #000000; margin-bottom: 2pt; }
.cut { font-size: 8.5pt; text-align: center; margin-bottom: 8pt; }
.label { border: 1.6pt solid #000000; padding: 10pt 12pt; }
.name { font-size: 17pt; font-weight: bold; line-height: 1.35; }
.addr { font-size: 12pt; margin-top: 4pt; }
.row { font-size: 12pt; margin-top: 6pt; }
.foot { font-size: 8pt; margin-top: 6pt; }
"""


def _item_html(data: TicketData, item: TicketItem, bold: fitz.Font) -> str:
    volumes = len(item.volumes)
    listed = item.sections[:MAX_LISTED_SECTIONS]
    rows = "".join(
        f'<tr><td class="l">{_pages(first, last)}</td><td>{n}. {html.escape(name)}</td></tr>'
        for n, (name, first, last) in enumerate(listed, start=1)
    )
    if len(item.sections) > len(listed):
        rest = item.sections[len(listed):]
        rows += f'<tr><td class="l">{_pages(rest[0][1], rest[-1][2])}</td><td>و {len(rest)} فایل دیگر</td></tr>'
    count = VOLUME_WORDS.get(volumes, str(volumes))
    binding = f"{html.escape(item.binding)} · {count} جلد"
    if volumes == 1:
        # یک جلد: فایل چاپ همان نام جزوه است، در سر.
        title = _ltr(jozve_file_name(data.order_number, item.seq, 1, 1))
    else:
        # هر جلد ردیف خودش: دو نام لاتین در یک خط فارسی را MuPDF جابه‌جا می‌چید.
        title = f"{count} جلد، هر جلد یک فایل"
        binding += "<table>" + "".join(
            f'<tr><td class="l">{_pages(first, last)} · {sheets:,} برگ</td>'
            f"<td>جلد {n} · {_ltr(jozve_file_name(data.order_number, item.seq, n, volumes))}</td></tr>"
            for n, (first, last, sheets) in enumerate(item.volumes, start=1)
        ) + "</table>"
    papers = "، ".join(html.escape(p) for p in item.papers)
    mode = f"{_color(item.color_modes)} · {SIDES.get(item.sides_mode, item.sides_mode)}"
    # قاب به اندازهٔ متن: جدول MuPDF پهنای خانه را از محتوا درست نمی‌گیرد، پس پهنا با خود قلم اندازه گرفته می‌شود (شکل
    # جداِ حرف‌ها، پس کمی گشادتر از متن پیوسته).
    width = bold.text_length(mode, fontsize=MODE_SIZE) + 20
    return f"""
<div class="item">
  <table><tr>
    <td class="l" style="width: {width:.0f}pt"><div class="mode">{mode}</div></td>
    <td><p class="title">جزوهٔ {item.seq} از {len(data.items)} · {title}</p></td>
  </tr></table>
  <table>
    <tr><td><table>{rows}</table></td><td class="dt">فایل‌ها</td></tr>
    <tr><td>{item.page_count:,} صفحه، {item.sheets:,} برگ · {papers}</td><td class="dt">چاپ</td></tr>
    <tr><td>{binding}</td><td class="dt">صحافی</td></tr>
    <tr><td>{item.copies:,} نسخه</td><td class="dt">تعداد</td></tr>
  </table>
</div>"""


def ticket_html(data: TicketData, fonts: str) -> tuple[str, str]:
    """دو تکهٔ برگه: بالا (سر و جزوه‌ها) و پایین (برچسب پست). هر رشته‌ای که از کاربر یا ادمین آمده escape می‌شود."""
    bold = fitz.Font(fontfile=os.path.join(fonts, FONT_FILES[1]))
    paid = f"پرداخت {jalali.format_weekday(data.paid)}، {jalali.format_time(data.paid)}" if data.paid else ""
    top = f"""
<p class="k">جزوه‌یار · برگهٔ سفارش</p>
<p class="no">{data.order_number}</p>
<p class="due">تحویل به پست تا {jalali.deadline_day(data.due)}</p>
<p class="k">{paid}</p>
<div class="rule"></div>
{"".join(_item_html(data, item, bold) for item in data.items)}"""
    row = [f"کد پستی {html.escape(data.postal_code)}"] if data.postal_code else []
    row += [f"موبایل {_ltr(_phone(data.recipient_phone))}", html.escape(data.shipping)]
    bottom = f"""
<div class="cutline"></div>
<p class="cut">برچسب پست: از اینجا ببر</p>
<div class="label">
  <p class="k">گیرنده</p>
  <p class="name">{html.escape(data.recipient_name)} {data.order_number}</p>
  <p class="addr">{html.escape(data.address)}</p>
  <p class="row">{"&#160;&#160;&#160;·&#160;&#160;&#160;".join(row)}</p>
</div>
<p class="foot">شمارهٔ کنار نام را متصدی پست در نام گیرنده می‌نویسد؛ کد رهگیری با همین پیدا می‌شود.</p>"""
    return top, bottom


def render_ticket(data: TicketData, pdf_path: str, png_path: str) -> None:
    fonts = font_dir()
    top, bottom = ticket_html(data, fonts)
    archive = fitz.Archive(fonts)
    doc = fitz.open()
    try:
        # برچسب همیشه پایین برگه و همان اندازه: اول روی سند جدا اندازه گرفته می‌شود، بعد جایش را از پایین می‌گیرد.
        region = fitz.Rect(MARGIN, A4.height - MARGIN - LABEL_HEIGHT, A4.width - MARGIN, A4.height - MARGIN)
        with fitz.open() as scratch:
            spare, _ = scratch.new_page(width=A4.width, height=A4.height).insert_htmlbox(
                region, bottom, css=CSS, archive=archive, scale_low=1
            )
        if spare < 0:
            raise PermanentFailure("ticket_overflow", "برچسب پست در جایش نشد")
        # دو پوینت جای بیشتر: همان اندازهٔ درست گاهی با گرد کردن جا نمی‌شد و MuPDF هیچ چیز نمی‌نوشت.
        label = fitz.Rect(region.x0, region.y0 + max(spare - 2, 0), region.x1, region.y1)
        page = doc.new_page(width=A4.width, height=A4.height)
        if page.insert_htmlbox(label, bottom, css=CSS, archive=archive, scale_low=1)[0] < 0:
            raise PermanentFailure("ticket_overflow", "برچسب پست در جایش نشد")
        # سر و جزوه‌ها بالای آن؛ اگر جا نشدند (جزوه‌های زیاد) کوچک می‌شوند.
        page.insert_htmlbox(fitz.Rect(MARGIN, MARGIN, A4.width - MARGIN, label.y0 - 12), top, css=CSS, archive=archive)
        doc.set_metadata({"title": f"برگهٔ سفارش {data.order_number}", "creator": "jozveyar"})
        doc.save(pdf_path, garbage=3, deflate=True)
        page.get_pixmap(dpi=PREVIEW_DPI, colorspace=fitz.csGRAY).save(png_path)
    finally:
        doc.close()


def _load(conn: psycopg.Connection, order_id: str) -> tuple[TicketData, str]:
    """دادهٔ برگه و اثر انگشتش، در یک تراکنش."""
    order = conn.execute(
        """SELECT o.order_number, o.status::text, o.post_handoff_due_at, o.paid_at, o.recipient_name, o.recipient_phone,
                  o.address_text, o.postal_code, p.name_fa, c.name_fa, coalesce(m.name_fa, o.shipping_method_id),
                  o.price_breakdown, order_ticket_stamp(o)
             FROM orders o
             JOIN provinces p ON p.id = o.province_id
             LEFT JOIN cities c ON c.id = o.city_id
             LEFT JOIN shipping_methods m ON m.price_list_version = o.price_list_version AND m.id = o.shipping_method_id
            WHERE o.id = %s""",
        (order_id,),
    ).fetchone()
    if order is None:
        raise PermanentFailure("order_missing")
    number, status, due, paid, name, phone, address, postal, province, city, shipping, breakdown, stamp = order
    if status in UNPAID:
        raise PermanentFailure("order_not_paid")
    if status not in PRINTABLE:
        # مثل `prepare_order`: جزوه‌ای که دیگر چاپ نمی‌شود برگه نمی‌خواهد.
        raise PermanentFailure("order_closed", status)
    items = conn.execute(
        """SELECT i.id::text, i.seq, i.page_count, i.copies, i.sides_mode::text, coalesce(b.name_fa, i.binding_type_id)
             FROM order_items i
             JOIN orders o ON o.id = i.order_id
             LEFT JOIN binding_types b ON b.price_list_version = o.price_list_version AND b.id = i.binding_type_id
            WHERE i.order_id = %s ORDER BY i.seq""",
        (order_id,),
    ).fetchall()
    sections = conn.execute(
        """SELECT s.order_item_id::text, s.page_count, d.original_name
             FROM order_item_sections s
             JOIN order_items i ON i.id = s.order_item_id
             JOIN documents d ON d.id = s.document_id
            WHERE i.order_id = %s ORDER BY i.seq, s.seq""",
        (order_id,),
    ).fetchall()
    rules = conn.execute(
        """SELECT r.order_item_id::text, r.color_mode::text, coalesce(t.name_fa, r.paper_type_id)
             FROM print_rules r
             JOIN order_items i ON i.id = r.order_item_id
             JOIN orders o ON o.id = i.order_id
             LEFT JOIN paper_types t ON t.price_list_version = o.price_list_version AND t.id = r.paper_type_id
            WHERE i.order_id = %s ORDER BY i.seq, r.seq""",
        (order_id,),
    ).fetchall()
    data = TicketData(
        order_number=number,
        due=due,
        paid=paid,
        recipient_name=name,
        recipient_phone=phone,
        address="، ".join(part for part in (province, city, address) if part),
        postal_code=postal,
        shipping=shipping,
    )
    for item_id, seq, pages, copies, sides, binding in items:
        ranges = plan_volumes(breakdown, seq, pages, sides)
        priced = breakdown["items"][seq - 1]
        listed, first = [], 1
        for owner, section_pages, original_name in sections:
            if owner == item_id:
                listed.append((original_name, first, first + section_pages - 1))
                first += section_pages
        item_rules = [(mode, paper) for owner, mode, paper in rules if owner == item_id]
        data.items.append(
            TicketItem(
                seq=seq,
                page_count=pages,
                sheets=priced["sheets"],
                copies=copies,
                sides_mode=sides,
                color_modes=[mode for mode, _ in item_rules],
                papers=list(dict.fromkeys(paper for _, paper in item_rules)),
                binding=binding,
                sections=listed,
                volumes=[(a, b, sheets) for (a, b), sheets in zip(ranges, priced["sheetsPerVolume"])],
            )
        )
    return data, stamp


def _sha256(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def prepare_ticket(conn: psycopg.Connection, storage: S3Storage, order_id: str) -> dict:
    for _ in range(MAX_REBUILDS):
        data, stamp = _load(conn, order_id)
        # پیش از ساختن و بارگذاری: کار تراکنش بازی نگه نمی‌دارد.
        conn.commit()
        pdf_key, png_key = ticket_keys(data.order_number, stamp)
        with tempfile.TemporaryDirectory(prefix="docworker-ticket-") as workdir:
            pdf, png = os.path.join(workdir, "ticket.pdf"), os.path.join(workdir, "ticket.png")
            render_ticket(data, pdf, png)
            size, digest = os.path.getsize(pdf), _sha256(pdf)
            storage.upload(pdf_key, pdf, "application/pdf")
            storage.upload(png_key, png, "image/png")
        # زیر قفل اشتراکی ردیف سفارش تا «انجام شد»: ویرایش گیرنده (FOR UPDATE) پشت این می‌ماند و بعد کار را خودش دوباره در
        # صف می‌گذارد؛ ویرایشی که پیش‌تر رسید، اینجا دیده می‌شود و برگه از نو ساخته می‌شود.
        current = conn.execute(
            "SELECT order_ticket_stamp(o) FROM orders o WHERE o.id = %s FOR SHARE", (order_id,)
        ).fetchone()
        if current is None:
            raise PermanentFailure("order_missing")
        if current[0] != stamp:
            conn.rollback()
            continue
        conn.execute(
            """INSERT INTO order_tickets (order_id, storage_key, size_bytes, sha256, preview_key, stamp, built_at)
               VALUES (%s, %s, %s, %s, %s, %s, now())
               ON CONFLICT (order_id) DO UPDATE
                  SET storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
                      preview_key = excluded.preview_key, stamp = excluded.stamp, built_at = excluded.built_at""",
            (order_id, pdf_key, size, digest, png_key, stamp),
        )
        return {"orderNumber": data.order_number, "key": pdf_key, "bytes": size}
    # گذرا: کارگر کمی بعد دوباره امتحان می‌کند.
    raise RuntimeError(f"دادهٔ برگهٔ سفارش {order_id} {MAX_REBUILDS} بار وسط ساختن عوض شد")
