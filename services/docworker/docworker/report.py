"""
خروجی PDF گزارش‌های پنل (برش ۱۰٫۲، ADR-061، سؤال‌های ۲۰۲ و ۲۷۸): کار `render_report`.

پنل گزارش را همان‌طور که نشان داد در ردیف `report_exports` می‌نشاند (`context`: عنوان، بازه، کاشی‌ها و جدول‌ها، همه متن آماده از
`apps/admin/lib/reportDocument.ts`) و این کار PDF را با همان موتور قالب برگه‌ها (۹٫۲) می‌سازد: Jinja2 و WeasyPrint در پردازهٔ جدا و
مهارشده (`ticket.render`، `ticket_render.py`). قالب یکی است و بارگذاری‌شدنی نیست (`report_templates/report.html`)، ولی متن‌ها از سفارش
و پنل می‌آیند، پس همان دیوارها: escape خودکار و واکش‌گر فقط `data:`. چاپ مرورگر نشانی محرمانهٔ پنل را در حاشیهٔ کاغذ می‌آورد؛ PDF کارگر
نه (همان دلیل برگه، ADR-043).

- **یک بار:** نتیجه (PDF یا خطا) فقط روی ردیفی نوشته می‌شود که هنوز پایان ندارد (`finished_at IS NULL`، و تریگر
  `report_exports_finish_once`): کار دومی که اجارهٔ اولی را گرفت، PDFی را که شاید دانلود شده رونویسی نمی‌کند.
- **شکست:** قالبی که ساخته نشد شکست قطعی است و خطایش روی ردیف می‌نشیند؛ خطای گذرا دوباره امتحان می‌شود، و پس از آخرین تلاش همان
  (`mark_export_failed`)، تا صفحهٔ خروجی تا ابد «در حال ساختن» نماند.
- **نگهداری:** ردیف، با PDF و کارش، یک روز پس از خواستن پاک می‌شود (`purge_exports`، در همان دور نگهداری کارگر).
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile

import psycopg

from .jobs import PermanentFailure
from .ticket import Template, render

log = logging.getLogger("docworker.report")

RENDER_REPORT = "render_report"
TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_templates", "report.html")
# همان سقف‌های پایگاه داده (`REPORT_EXPORT_MAX_BYTES` و `REPORT_EXPORT_MAX_PAGES`، CHECK `report_exports_result`)؛ صفحه را خود موتور قالب
# هم با همین عدد می‌بُرد (`ticket.MAX_TICKET_PAGES`).
MAX_BYTES = 16 * 1024 * 1024
MAX_PAGES = 200
# همان سقف خطای ردیف (`report_exports_result`).
MAX_ERROR = 500
# خروجی یک روز پس از خواستن پاک می‌شود (سؤال ۲۷۸).
RETENTION_HOURS = 24


def report_template() -> Template:
    with open(TEMPLATE, encoding="utf-8") as f:
        return Template("report", None, f.read())


def render_report(conn: psycopg.Connection, export_id: str | None) -> str:
    """PDF یک خروجی، روی همان ردیف؛ خروجی فقط برای لاگ است، بی محتوای گزارش."""
    if not export_id:
        raise ValueError("کار render_report خروجی ندارد")
    row = conn.execute(
        "SELECT context, file_name FROM report_exports WHERE id = %s AND finished_at IS NULL", (export_id,)
    ).fetchone()
    # تراکنش خواندن پیش از ساختن بسته می‌شود: ساختن چند ثانیه است و ردیف را نگه نمی‌دارد.
    conn.commit()
    if row is None:
        return "خروجی دیگر در حال ساختن نیست"
    context, file_name = row
    if not isinstance(context, dict):
        raise PermanentFailure("context_invalid", "دادهٔ گزارش شیء نیست")
    with tempfile.TemporaryDirectory(prefix="docworker-report-") as workdir:
        rendered = render({"report": report_template()}, [("report", context)], workdir)
        with open(rendered.pdfs[0], "rb") as f:
            pdf = f.read()
    pages = rendered.pages[0]
    if not 1 <= pages <= MAX_PAGES:
        raise PermanentFailure("too_many_pages", f"{pages} صفحه")
    if len(pdf) > MAX_BYTES:
        raise PermanentFailure("too_large", f"{len(pdf)} بایت")
    digest = hashlib.sha256(pdf).hexdigest()
    updated = conn.execute(
        """UPDATE report_exports SET pdf = %s, pages = %s, sha256 = %s, finished_at = now()
            WHERE id = %s AND finished_at IS NULL""",
        (pdf, pages, digest, export_id),
    ).rowcount
    if not updated:
        return "خروجی همین حالا جای دیگری تمام شد"
    return f"PDF {file_name}: {pages} صفحه، {len(pdf)} بایت"


def mark_export_failed(conn: psycopg.Connection, export_id: str, error: str) -> None:
    """ساخته نشد: خطا روی ردیف، فقط اگر هنوز پایان ندارد. فقط کد و پیام کوتاه، بی دادهٔ گزارش."""
    message = " ".join(error.split())[:MAX_ERROR] or "render_failed"
    conn.execute(
        "UPDATE report_exports SET error = %s, finished_at = now() WHERE id = %s AND finished_at IS NULL",
        (message, export_id),
    )


PURGE_SQL = "DELETE FROM report_exports WHERE requested_at <= now() - make_interval(hours => %(hours)s)"


def purge_exports(conn: psycopg.Connection, hours: int = RETENTION_HOURS) -> int:
    """خروجی‌های کهنه، با PDF و کارشان (کلید خارجی `ON DELETE CASCADE`)؛ خروجی شمارشان."""
    try:
        deleted = conn.execute(PURGE_SQL, {"hours": hours}).rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    if deleted:
        log.info("✓ %s خروجی گزارش پاک شد (%s ساعت پس از خواستن)", deleted, hours)
    return deleted
