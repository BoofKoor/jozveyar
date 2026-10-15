"""
برگه‌های سفارش (برش ۵٫۱، ADR-043؛ از ۹٫۲ از قالب HTML، ADR-057): یک PDF برای هر سفارش، جدا از فایل‌های جزوه (نه در قیمت، نه در صحافی).
اول بیجک، یکی برای سفارش، روی بسته: شمارهٔ سفارش، مهلت تحویل به پست، چاپخانه، فهرست جزوه‌ها و برچسب پست با نام گیرنده و شمارهٔ
سفارش کنارش («مریم کاظمی 10027»)، همان که متصدی پست در «نام گ» می‌نویسد و برش ۶ کد رهگیری را با آن پیدا می‌کند (ADR-010). بعد
برگهٔ اول هر جزوه، روی دستهٔ همان جزوه: فایل‌ها با بازهٔ صفحه، رنگ، یکرو یا دورو، اندازه، کاغذ، صحافی و جلدها، و نسخه. بی مبلغ.

هر نوع از قالب فعال خودش (`ticket_templates`، که مالک از پنل بارگذاری و فعال می‌کند)، وگرنه از قالب پیش‌فرض همین بسته
(`templates/`)؛ دادهٔ هر دو از `ticket_context`. ساختن در پردازهٔ جدا و مهارشده است (`ticket_render.py`، `sandbox.run_confined`)، چون قالب
HTML، CSS و فونت ناشناس دارد. پیش‌نمایش PNG هر صفحه برای پنل.

کار جدای `prepare_ticket`، تا شکستش PDF جزوه را «ساخته نشد» نکند. برگه با دادهٔ امروز سفارش ساخته می‌شود: اثر انگشت آن داده
(`order_ticket_stamp`، مهاجرت 0016، و از 0018 با نام و شهر چاپخانه) و قالب‌های فعال پیش از ثبت، زیر قفل اشتراکی ردیف سفارش و ردیف
قالب‌ها، دوباره سنجیده می‌شوند؛ ویرایش یا قالبی که وسط ساختن رسید برگه را از نو می‌سازد، و آنچه بعد از ثبت برسد کار را خودش دوباره
در صف می‌گذارد (`packages/db/src/panel.ts`، `partners.ts` و `templates.ts`).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime

import fitz  # PyMuPDF
import psycopg

from . import sandbox
from .jobs import PermanentFailure
from .orders import ORDERS_PREFIX, PRINTABLE, UNPAID, plan_volumes
from .storage import S3Storage
from .ticket_context import contexts, sample

PREPARE_TICKET = "prepare_ticket"
PREVIEW_TICKET_TEMPLATE = "preview_ticket_template"

# دو نوع قالب، به ترتیب صفحه‌ها در PDF: اول بیجک، بعد برگهٔ اول هر جزوه (سؤال ۱۹۴).
KINDS = ("bijak", "first_page")
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
RENDERER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ticket_render.py")
# بزرگ‌ترین قالب، همان سقف پایگاه داده (`ticket_templates_size`): قالب‌های نمونه با فونت و لوگوی درونی حدود ۲۷۰ کیلوبایت‌اند.
MAX_TEMPLATE_BYTES = 2 * 1024 * 1024
# قفس پردازهٔ قالب: یک سفارش ۳۰ جزوه‌ای (`MAX_ITEMS_PER_ORDER`) حدود ده ثانیه است؛ حافظه و فایل خیلی بالاتر از هر برگهٔ واقعی.
RENDER_TIMEOUT = float(os.environ.get("DOCWORKER_TICKET_TIMEOUT", "90"))
RENDER_MEMORY = 1536 * 1024 * 1024
RENDER_MAX_FILE = 64 * 1024 * 1024
PREVIEW_DPI = 150
# بیشترین صفحهٔ یک برگه، همان سقف پایگاه داده (`order_tickets_pages`): ۳۰ جزوه با بیجک چندصفحه‌ای خیلی کمتر است؛ قالبی که بیشتر بسازد
# همان‌جا می‌ایستد، نه پس از ساختن هزار صفحه.
MAX_TICKET_PAGES = 200
# ویرایشی که وسط هر ساختن برسد، ساختن را از نو می‌کند؛ بیش از این یعنی چیزی غیرعادی است و کار بعداً دوباره امتحان می‌شود.
MAX_REBUILDS = 3
# پیش‌نمایش قالب‌ها، بیرون از `orders/` تا نگهداری فایل‌های سفارش (ADR-044) دستشان نزند.
TEMPLATES_PREFIX = "ticket-templates/"

# وزیرمتن، فقط ۴۰۰ و ۶۰۰ (CLAUDE.md): در ایمیج پایه کنار فونت‌های LibreOffice، و در مخزن برای تست بیرون ایمیج.
FONT_DIRS = (
    "/usr/local/share/fonts/jozveyar/vazirmatn",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "fonts", "vazirmatn"),
)
FONT_FILES = ("Vazirmatn-Regular.ttf", "Vazirmatn-SemiBold.ttf")


def ticket_keys(order_number: int, digest: str) -> tuple[str, str]:
    """PDF و پیش‌نمایش صفحهٔ اول برگه، به نام sha256 خود PDF: فایلی که زیر یک کلید نشست دیگر عوض نمی‌شود، پس ردیفی که به آن
    اشاره می‌کند هیچ‌وقت فایل دیگری را نمی‌دهد، حتی وسط ساختن دوباره با دادهٔ تازه یا قالب تازه (۹٫۲)؛ تا ۹٫۱ اثر انگشت داده بود، که
    قالب تازه با همان داده بازنویسی‌اش می‌کرد. صفحهٔ n ام (از ۲) `-n.png` (`preview_key_of`). برگه‌های کهنه با بقیهٔ فایل‌های سفارش
    پاک می‌شوند (ADR-044)."""
    base = f"{ORDERS_PREFIX}{order_number}/ticket-{digest[:16]}"
    return f"{base}.pdf", f"{base}.png"


def preview_key_of(first: str, page: int) -> str:
    """پیش‌نمایش صفحهٔ `page` (از ۱) کنار پیش‌نمایش صفحهٔ اول، همان که پنل می‌خواند (`apps/admin/lib/orders.ts`)."""
    return first if page == 1 else f"{first[: -len('.png')]}-{page}.png"


@dataclass
class TicketItem:
    seq: int
    page_count: int
    sheets: int
    copies: int
    sides_mode: str
    # اندازهٔ کاغذ جزوه (۸٫۳): «a4»، «a5» یا «a3».
    paper_size: str
    color_modes: list[str]
    papers: list[str]
    binding: str
    # شناسهٔ صحافی در تعرفهٔ سفارش (۹٫۲): پرچم‌های قالب‌های امروز صاحب پروژه از این است (`ticket_context.BINDING_FLAGS`).
    binding_id: str
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
    province: str
    city: str | None
    address_line: str
    postal_code: str | None
    shipping: str
    items: list[TicketItem] = field(default_factory=list)
    # چاپخانهٔ سفارش (برش ۵٫۲): (نام، شهر)؛ None یعنی بی چاپخانه (هنگام پرداخت هیچ چاپخانهٔ فعالی نبود، یا پیش از ۵٫۲).
    partner: tuple[str, str] | None = None

    @property
    def address(self) -> str:
        """استان، شهر و نشانی، همان که برچسب پست دارد."""
        return "، ".join(part for part in (self.province, self.city, self.address_line) if part)


@dataclass
class Template:
    """قالب یک نوع: شناسهٔ ردیف `ticket_templates`، یا None برای قالب پیش‌فرض همین بسته."""

    kind: str
    id: int | None
    html: str


class TemplateFailure(PermanentFailure):
    """قالبی که ساخته نشد: خطای Jinja2 یا WeasyPrint، با نوع قالب و خط، برای پیش‌نمایش پنل و `last_error` کار برگه."""

    def __init__(self, error: dict, template: Template | None) -> None:
        self.error = error
        self.template = template
        where = f" خط {error['line']}" if error.get("line") else ""
        super().__init__("template_error", f"{error.get('template')}{where}: {error.get('message')}")


def font_dir() -> str:
    for directory in FONT_DIRS:
        if all(os.path.isfile(os.path.join(directory, name)) for name in FONT_FILES):
            return directory
    raise PermanentFailure("font_missing", "وزیرمتن پیدا نشد")


def default_template(kind: str) -> Template:
    with open(os.path.join(TEMPLATES_DIR, f"{kind}.html"), encoding="utf-8") as f:
        return Template(kind, None, f.read())


def active_templates(conn: psycopg.Connection, *, lock: bool = False) -> dict[str, Template]:
    """قالب فعال هر نوع، وگرنه پیش‌فرض. `lock`: زیر قفل اشتراکی همان ردیف‌ها، تا فعال کردن هم‌زمان پشت ثبت برگه بماند."""
    rows = conn.execute(
        "SELECT id, kind, html FROM ticket_templates WHERE is_active" + (" FOR SHARE" if lock else "")
    ).fetchall()
    found = {kind: Template(kind, template_id, html) for template_id, kind, html in rows}
    return {kind: found.get(kind) or default_template(kind) for kind in KINDS}


@dataclass
class Rendered:
    """PDFهای هر صفحهٔ برگه به ترتیب، شمار صفحهٔ هر کدام، و نشانی‌هایی که قالب خواست و رد شد (فقط `data:`)."""

    pdfs: list[str]
    pages: list[int]
    blocked: list[str]


def render(templates: dict[str, Template], pages: list[tuple[str, dict]], workdir: str) -> Rendered:
    """`pages`: (نوع قالب، داده) هر صفحه. ساختن در پردازهٔ جدا (`ticket_render.py`): محیط تمیز بی رمز، سقف زمان، حافظه و حجم فایل."""
    kinds = sorted({kind for kind, _ in pages})
    for kind in kinds:
        with open(os.path.join(workdir, f"{kind}.html"), "w", encoding="utf-8") as f:
            f.write(templates[kind].html)
    job = {
        "fonts": font_dir(),
        "templates": {kind: f"{kind}.html" for kind in kinds},
        "pages": [{"template": kind, "context": context} for kind, context in pages],
        "max_pages": MAX_TICKET_PAGES,
    }
    with open(os.path.join(workdir, "job.json"), "w", encoding="utf-8") as f:
        json.dump(job, f, ensure_ascii=False)
    outcome = sandbox.run_confined(
        [sys.executable, "-I", RENDERER, workdir],
        cwd=workdir,
        timeout=RENDER_TIMEOUT,
        max_file_bytes=RENDER_MAX_FILE,
        max_memory_bytes=RENDER_MEMORY,
    )
    result_path = os.path.join(workdir, "result.json")
    if outcome.timed_out:
        raise TemplateFailure({"kind": "timeout", "template": "", "message": f"بیش از {RENDER_TIMEOUT:.0f} ثانیه"}, None)
    if outcome.returncode != 0 or not os.path.isfile(result_path):
        # حافظه یا فایلی که از سقف گذشت هم اینجاست: قالب خیلی سنگین است، نه کارگر خراب.
        heavy = outcome.oom_killed or outcome.returncode in (-9, -25) or "MemoryError" in outcome.stderr
        message = "قالب از سقف حافظه یا حجم فایل گذشت" if heavy else f"پردازهٔ قالب افتاد ({outcome.returncode})"
        raise TemplateFailure({"kind": "crash", "template": "", "message": message}, None)
    with open(result_path, encoding="utf-8") as f:
        result = json.load(f)
    if not result["ok"]:
        error = result["error"]
        raise TemplateFailure(error, templates.get(error.get("template")))
    return Rendered([os.path.join(workdir, f"out-{i}.pdf") for i in range(len(pages))], result["pages"], result["blocked"])


def ticket_pages(data: TicketData, kinds: tuple[str, ...] = KINDS) -> list[tuple[str, dict]]:
    """صفحه‌های برگه به ترتیب: بیجک، بعد برگهٔ اول هر جزوه."""
    bijak, firsts = contexts(data)
    return ([("bijak", bijak)] if "bijak" in kinds else []) + ([("first_page", c) for c in firsts] if "first_page" in kinds else [])


def merge(rendered: Rendered, pdf_path: str, png_base: str, title: str) -> int:
    """همهٔ صفحه‌ها در یک PDF، و پیش‌نمایش خاکستری هر صفحه (`preview_key_of` همان نام‌ها). خروجی: شمار صفحه."""
    doc = fitz.open()
    try:
        for path in rendered.pdfs:
            with fitz.open(path) as part:
                doc.insert_pdf(part)
        doc.set_metadata({"title": title, "creator": "jozveyar"})
        doc.save(pdf_path, garbage=3, deflate=True)
        for n, page in enumerate(doc, start=1):
            page.get_pixmap(dpi=PREVIEW_DPI, colorspace=fitz.csGRAY).save(preview_key_of(png_base, n))
        return doc.page_count
    finally:
        doc.close()


def render_ticket(data: TicketData, templates: dict[str, Template], pdf_path: str, png_path: str) -> int:
    """برگهٔ کامل سفارش: بیجک و برگهٔ اول هر جزوه، با قالب‌های داده‌شده. خروجی: شمار صفحه."""
    with tempfile.TemporaryDirectory(prefix="docworker-render-") as workdir:
        rendered = render(templates, ticket_pages(data), workdir)
        return merge(rendered, pdf_path, png_path, f"برگه‌های سفارش {data.order_number}")


def _load(conn: psycopg.Connection, order_id: str, *, closed_ok: bool = False) -> tuple[TicketData, str]:
    """دادهٔ برگه و اثر انگشتش، در یک تراکنش. `closed_ok`: پیش‌نمایش قالب با سفارشی که پست یا لغو شد هم."""
    order = conn.execute(
        """SELECT o.order_number, o.status::text, o.post_handoff_due_at, o.paid_at, o.recipient_name, o.recipient_phone,
                  o.address_text, o.postal_code, p.name_fa, c.name_fa, coalesce(m.name_fa, o.shipping_method_id),
                  o.price_breakdown, order_ticket_stamp(o), pp.name, pc.name_fa
             FROM orders o
             JOIN provinces p ON p.id = o.province_id
             LEFT JOIN cities c ON c.id = o.city_id
             LEFT JOIN shipping_methods m ON m.price_list_version = o.price_list_version AND m.id = o.shipping_method_id
             LEFT JOIN print_partners pp ON pp.id = o.print_partner_id
             LEFT JOIN cities pc ON pc.id = pp.city_id
            WHERE o.id = %s""",
        (order_id,),
    ).fetchone()
    if order is None:
        raise PermanentFailure("order_missing")
    number, status, due, paid, name, phone, address, postal, province, city, shipping, breakdown, stamp, partner, partner_city = order
    if status in UNPAID:
        raise PermanentFailure("order_not_paid")
    if status not in PRINTABLE and not closed_ok:
        # مثل `prepare_order`: جزوه‌ای که دیگر چاپ نمی‌شود برگه نمی‌خواهد.
        raise PermanentFailure("order_closed", status)
    items = conn.execute(
        """SELECT i.id::text, i.seq, i.page_count, i.copies, i.sides_mode::text, i.paper_size::text,
                  coalesce(b.name_fa, i.binding_type_id), i.binding_type_id
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
        province=province,
        city=city,
        address_line=address,
        postal_code=postal,
        shipping=shipping,
        partner=(partner, partner_city) if partner else None,
    )
    for item_id, seq, pages, copies, sides, size, binding, binding_id in items:
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
                paper_size=size,
                color_modes=[mode for mode, _ in item_rules],
                papers=list(dict.fromkeys(paper for _, paper in item_rules)),
                binding=binding,
                binding_id=binding_id,
                sections=listed,
                volumes=[(a, b, sheets) for (a, b), sheets in zip(ranges, priced["sheetsPerVolume"])],
            )
        )
    return data, stamp


def _sha256(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def _ids(templates: dict[str, Template]) -> tuple[int | None, int | None]:
    return templates["bijak"].id, templates["first_page"].id


def prepare_ticket(conn: psycopg.Connection, storage: S3Storage, order_id: str) -> dict:
    for _ in range(MAX_REBUILDS):
        data, stamp = _load(conn, order_id)
        templates = active_templates(conn)
        # پیش از ساختن و بارگذاری: کار تراکنش بازی نگه نمی‌دارد.
        conn.commit()
        with tempfile.TemporaryDirectory(prefix="docworker-ticket-") as workdir:
            pdf, png = os.path.join(workdir, "ticket.pdf"), os.path.join(workdir, "ticket.png")
            pages = render_ticket(data, templates, pdf, png)
            size, digest = os.path.getsize(pdf), _sha256(pdf)
            pdf_key, png_key = ticket_keys(data.order_number, digest)
            storage.upload(pdf_key, pdf, "application/pdf")
            for n in range(1, pages + 1):
                storage.upload(preview_key_of(png_key, n), preview_key_of(png, n), "image/png")
        # زیر قفل اشتراکی ردیف سفارش و قالب‌های فعال تا «انجام شد»: ویرایش گیرنده (FOR UPDATE) و فعال کردن قالب پشت این می‌مانند و
        # بعد کار را خودشان دوباره در صف می‌گذارند؛ آنچه پیش‌تر رسید، اینجا دیده می‌شود و برگه از نو ساخته می‌شود.
        current = conn.execute(
            "SELECT order_ticket_stamp(o) FROM orders o WHERE o.id = %s FOR SHARE", (order_id,)
        ).fetchone()
        if current is None:
            raise PermanentFailure("order_missing")
        if current[0] != stamp or _ids(active_templates(conn, lock=True)) != _ids(templates):
            conn.rollback()
            continue
        bijak_id, first_id = _ids(templates)
        conn.execute(
            """INSERT INTO order_tickets (order_id, storage_key, size_bytes, sha256, preview_key, stamp, built_at, page_count,
                                          bijak_template_id, first_page_template_id)
               VALUES (%s, %s, %s, %s, %s, %s, now(), %s, %s, %s)
               ON CONFLICT (order_id) DO UPDATE
                  SET storage_key = excluded.storage_key, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
                      preview_key = excluded.preview_key, stamp = excluded.stamp, built_at = excluded.built_at,
                      page_count = excluded.page_count, bijak_template_id = excluded.bijak_template_id,
                      first_page_template_id = excluded.first_page_template_id""",
            (order_id, pdf_key, size, digest, png_key, stamp, pages, bijak_id, first_id),
        )
        return {"orderNumber": data.order_number, "key": pdf_key, "bytes": size, "pages": pages}
    # گذرا: کارگر کمی بعد دوباره امتحان می‌کند.
    raise RuntimeError(f"دادهٔ برگهٔ سفارش {order_id} {MAX_REBUILDS} بار وسط ساختن عوض شد")


def template_preview_keys(template_id: int, order_number: int | None = None) -> tuple[str, str]:
    """PDF و PNG صفحهٔ اول پیش‌نمایش یک نسخهٔ قالب؛ صفحهٔ n ام با `preview_key_of`. پیش‌نمایش با دادهٔ یک سفارش کنار فایل‌های همان
    سفارش است، تا با آنها پاک شود (`retention.py`، ADR-044): نام، نشانی و موبایل گیرنده را دارد."""
    if order_number is None:
        base = f"{TEMPLATES_PREFIX}{template_id}/preview"
    else:
        base = f"{ORDERS_PREFIX}{order_number}/template-{template_id}-preview"
    return f"{base}.pdf", f"{base}.png"


def preview_ticket_template(conn: psycopg.Connection, storage: S3Storage, template_id: int, payload: dict) -> dict:
    """پیش‌نمایش یک نسخهٔ قالب (۹٫۲، پیش از فعال کردن): با دادهٔ سفارشی که مالک داد (`payload.orderNumber`) یا دادهٔ ساختگی، فقط
    صفحه‌های همان نوع. نتیجه روی ردیف همان نسخه: شمار صفحه، فایل‌ها و نشانی‌های ردشده، یا خطای قالب با خط. خطای قالب شکست کار
    نیست: پیش‌نمایش همان را گزارش می‌کند. سفارشی که فایل‌هایش پاک شده پیش‌نمایش نمی‌دهد، چون فایل تازه‌اش را دیگر کسی پاک نمی‌کرد."""
    row = conn.execute("SELECT kind, html FROM ticket_templates WHERE id = %s", (template_id,)).fetchone()
    if row is None:
        raise PermanentFailure("template_missing")
    kind, html = row
    number = payload.get("orderNumber")
    order_id = None
    if number is None:
        data = sample()
    else:
        found = conn.execute("SELECT id::text FROM orders WHERE order_number = %s", (number,)).fetchone()
        if found is None:
            raise PermanentFailure("order_missing", str(number))
        order_id = found[0]
        data, _ = _load(conn, order_id, closed_ok=True)
    conn.commit()
    templates = {kind: Template(kind, template_id, html)}
    pdf_key, png_key = template_preview_keys(template_id, number)
    with tempfile.TemporaryDirectory(prefix="docworker-preview-") as workdir:
        try:
            rendered = render(templates, ticket_pages(data, (kind,)), workdir)
        except TemplateFailure as failure:
            pages, blocked, error = None, [], str(failure)
        else:
            pdf, png = os.path.join(workdir, "preview.pdf"), os.path.join(workdir, "preview.png")
            pages = merge(rendered, pdf, png, f"پیش‌نمایش قالب {template_id}")
            blocked, error = rendered.blocked, None
            if order_id is not None:
                # زیر قفل اشتراکی ردیف سفارش تا commit همین کار: پاک کردن فایل‌های سفارش (`FOR UPDATE SKIP LOCKED`) یا پیش از این
                # بود و اینجا دیده می‌شود، یا پس از این و این فایل‌ها را هم می‌برد. سنجش زودتر، پیش از ساختن، همین را نمی‌افزود.
                gone = conn.execute(
                    "SELECT files_deleted_at IS NOT NULL FROM orders WHERE id = %s FOR SHARE", (order_id,)
                ).fetchone()[0]
                if gone:
                    conn.rollback()
                    raise PermanentFailure("files_deleted", str(number))
            storage.upload(pdf_key, pdf, "application/pdf")
            for n in range(1, pages + 1):
                storage.upload(preview_key_of(png_key, n), preview_key_of(png, n), "image/png")
    done = error is None
    conn.execute(
        """UPDATE ticket_templates
              SET preview_at = now(), preview_order_number = %s, preview_pages = %s, preview_pdf_key = %s, preview_png_key = %s,
                  preview_blocked = %s, preview_error = %s
            WHERE id = %s""",
        (number, pages, pdf_key if done else None, png_key if done else None, blocked, error, template_id),
    )
    return {"template": template_id, "pages": pages, "error": error}
