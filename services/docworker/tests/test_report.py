"""
خروجی PDF گزارش‌های پنل (برش ۱۰٫۲، ADR-061، سؤال ۲۷۸): کار `render_report` با همان موتور قفس‌دار قالب برگه‌ها.

- **قالب** (بی پایگاه داده، فقط با WeasyPrint در ایمیج پایه): همان شکل دادهٔ پنل (`pdfContext` در `apps/admin/lib/reportDocument.ts`)، همهٔ
  متن‌ها در PDF، خلاصه عمودی و فهرست سفارش‌ها افقی، و متن پنل escape‌شده، نه HTML.
- **کار** روی پستگرس واقعی (بی `DATABASE_URL` رد می‌شود): PDF و صفحه و هش روی همان ردیف، یک بار؛ قالبی که ساخته نشد «ساخته نشد» با خطا؛
  خطای گذرایی که تلاش‌هایش تمام شد هم؛ و پاک شدن خروجی‌ها یک روز پس از خواستن، با کارشان.
"""

import hashlib
import importlib.util
import json
import math
import os
import uuid

import fitz
import pytest

import docworker.__main__ as main
from docworker import report
from docworker.report import RENDER_REPORT, mark_export_failed, purge_exports, render_report, report_template
from docworker.ticket import render

HAS_WEASYPRINT = importlib.util.find_spec("weasyprint") is not None and importlib.util.find_spec("jinja2") is not None
weasy = pytest.mark.skipif(not HAS_WEASYPRINT, reason="WeasyPrint و Jinja2 فقط در ایمیج پایه")
database = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL لازم است")

# همان شکل `pdfContext` پنل: هر خانه متن آماده، ستون عددی با پرچم، و فهرست سفارش‌ها با یادداشت سقف.
CONTEXT = {
    "title": "گزارش تولید",
    "subtitle": "پرداخت سه‌شنبه 22 مهر · همهٔ چاپخانه‌ها",
    "made": "ساخته شده 22 مهر 1405، 11:20، الهام فرجی",
    "notes": ["⏳ 1 سفارش هنوز آماده نیست (فایل چاپ ساخته نشده): 10031"],
    "stats": [
        {"label": "سفارش", "value": "3"},
        {"label": "جزوه", "value": "4"},
        {"label": "برگ", "value": "1,234,567"},
        {"label": "مبلغ (تومان)", "value": "462,500"},
        {"label": "صفحهٔ رنگی", "value": "12"},
    ],
    "tables": [
        {
            "title": "صحافی",
            "columns": [{"label": "صحافی", "numeric": False}, {"label": "نسخه", "numeric": True}, {"label": "جلد", "numeric": True}],
            "rows": [["طلق و سیم", "4", "5"], ['منگنه <b>A5</b> & "گلاسه"', "1", "1"]],
            "total": ["جمع", "5", "6"],
            "note": "جلد = جلدهای یک نسخه × نسخه.",
        }
    ],
    "detail": {
        "title": "سفارش‌ها",
        "columns": [{"label": "شماره", "numeric": True}, {"label": "وضعیت", "numeric": False}, {"label": "مبلغ (تومان)", "numeric": True}],
        "rows": [[str(10027 + i), "در صف چاپ", "154,000"] for i in range(80)],
        "total": None,
        "note": "300 ردیف اول از 412؛ همه در خروجی اکسل.",
    },
}


def text_of(path: str) -> str:
    """متن PDF بی نیم‌فاصله: استخراج PyMuPDF نیم‌فاصله را نمی‌آورد و ترتیب خط‌های دوجهته را به هم می‌زند، پس سنجش با تکه‌های یک‌جهته است."""
    with fitz.open(path) as doc:
        return "\n".join(page.get_text() for page in doc).replace("\u200c", "")


# ── قالب ─────────────────────────────────────────────────────────────────────


@weasy
def test_report_template_renders_every_text_with_portrait_summary_and_landscape_detail(tmp_path):
    rendered = render({"report": report_template()}, [("report", CONTEXT)], str(tmp_path))
    text = text_of(rendered.pdfs[0])
    for expected in (
        "جزوهیار",
        "گزارش تولید",
        "پرداخت سهشنبه",
        "الهام فرجی",
        "10031",
        "1,234,567",
        "462,500",
        "طلق و سیم",
        "جلدهای یک نسخه",
        "10027",
        "10106",
        "در خروجی اکسل",
    ):
        assert expected in text, expected
    # متن پنل متن است، نه HTML: برچسب `<b>` همان‌طور که بود (در استخراج خط راست‌به‌چپ، `<` و `>` آینه‌ای و جابه‌جا می‌آیند).
    line = next(line for line in text.splitlines() if "منگنه" in line)
    assert "A5" in line and "/b" in line
    with fitz.open(rendered.pdfs[0]) as doc:
        first, last = doc[0].rect, doc[doc.page_count - 1].rect
        assert first.height > first.width
        assert last.width > last.height
        # ۸۰ ردیف فهرست بیش از یک صفحهٔ افقی است، و سرستون در هر صفحهٔ فهرست تکرار می‌شود.
        assert doc.page_count >= 3
        detail_pages = [page.get_text() for page in doc if page.rect.width > page.rect.height]
        assert len(detail_pages) >= 2
        assert all("وضعیت" in page for page in detail_pages)
        # شمارهٔ صفحه با ارقام لاتین در پای هر صفحه.
        assert all(str(doc.page_count) in page.get_text() for page in doc)
        assert rendered.pages == [doc.page_count]


@weasy
def test_report_template_tolerates_an_empty_report(tmp_path):
    empty = {**CONTEXT, "notes": [], "stats": [], "tables": [], "detail": None}
    rendered = render({"report": report_template()}, [("report", empty)], str(tmp_path))
    assert rendered.pages == [1]
    assert "گزارش تولید" in text_of(rendered.pdfs[0])


# ── کار روی پستگرس ─────────────────────────────────────────────────────────


@pytest.fixture
def conn():
    psycopg = pytest.importorskip("psycopg")
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c


@pytest.fixture
def admin(conn):
    row = conn.execute(
        """INSERT INTO admin_users (username, display_name) VALUES ('dw.report', 'کارگر گزارش')
           ON CONFLICT (username) DO UPDATE SET display_name = excluded.display_name RETURNING id::text"""
    ).fetchone()
    conn.commit()
    return row[0]


def new_export(conn, admin, context=None, *, hours_ago: int = 0, max_attempts: int | None = None) -> str:
    """خروجی «در حال ساختن» با کارش، مثل `createReportExportStore().create` پنل."""
    from psycopg.types.json import Jsonb

    export_id = conn.execute(
        """INSERT INTO report_exports (report, context, file_name, money, requested_by, requested_at)
           VALUES ('production', %s, %s, true, %s, now() - make_interval(hours => %s)) RETURNING id::text""",
        (Jsonb(CONTEXT if context is None else context), f"gozaresh-tolid-{uuid.uuid4().hex[:8]}.pdf", admin, hours_ago),
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO jobs (kind, report_export_id, max_attempts) VALUES (%s, %s, %s)",
        (RENDER_REPORT, export_id, max_attempts or 5),
    )
    conn.commit()
    return export_id


def state(conn, export_id):
    return conn.execute(
        "SELECT pdf, pages, sha256, error, finished_at IS NOT NULL FROM report_exports WHERE id = %s", (export_id,)
    ).fetchone()


def worker(monkeypatch):
    for key, value in {"S3_ENDPOINT": "http://s3", "S3_BUCKET": "b", "S3_ACCESS_KEY": "a", "S3_SECRET_KEY": "s"}.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("DOCWORKER_KINDS", RENDER_REPORT)
    w = main.Worker()
    w.fonts_due = w.retention_due = math.inf
    return w


def drain(conn, w):
    for _ in range(50):  # کارهای دیگر همین نوع در صف، پیش از این
        if not w.run_once(conn):
            break


def job_of(conn, export_id):
    return conn.execute("SELECT status, last_error FROM jobs WHERE report_export_id = %s", (export_id,)).fetchone()


@database
@weasy
def test_the_worker_writes_the_pdf_once_onto_the_export_row(conn, admin, monkeypatch):
    export_id = new_export(conn, admin)
    drain(conn, worker(monkeypatch))
    assert job_of(conn, export_id) == ("done", None)
    pdf, pages, digest, error, finished = state(conn, export_id)
    assert finished and error is None and pages >= 3
    assert bytes(pdf).startswith(b"%PDF") and digest == hashlib.sha256(bytes(pdf)).hexdigest()
    # کار دوم همان خروجی (اجارهٔ اولی گذشته بود): بی‌اثر، PDF همان.
    assert render_report(conn, export_id) == "خروجی دیگر در حال ساختن نیست"
    conn.commit()
    assert state(conn, export_id)[2] == digest
    # خطای دیرهنگام هم روی خروجی تمام‌شده نمی‌نشیند.
    mark_export_failed(conn, export_id, "render_failed: OSError")
    conn.commit()
    assert state(conn, export_id)[3] is None


@database
@weasy
def test_a_template_failure_is_written_as_the_export_error(conn, admin, monkeypatch):
    # دادهٔ بدشکل (ستون‌ها شیء نیستند): خطای قالب، قطعی، با کدش روی ردیف.
    broken = {**CONTEXT, "tables": [{"title": "x", "columns": 7, "rows": [["a"]], "total": None, "note": None}]}
    export_id = new_export(conn, admin, broken)
    drain(conn, worker(monkeypatch))
    assert job_of(conn, export_id)[0] == "failed"
    pdf, pages, digest, error, finished = state(conn, export_id)
    assert finished and pdf is None and pages is None and digest is None
    assert error.startswith("template_error: ")
    assert len(error) <= report.MAX_ERROR


@database
def test_a_transient_failure_that_ran_out_of_attempts_is_render_failed(conn, admin, monkeypatch):
    def broken(conn, export_id):
        raise OSError("disk")

    monkeypatch.setattr(main, "render_report", broken)
    export_id = new_export(conn, admin, max_attempts=1)
    drain(conn, worker(monkeypatch))
    assert job_of(conn, export_id)[0] == "failed"
    assert state(conn, export_id)[3:] == ("render_failed: OSError", True)


@database
def test_exports_are_purged_a_day_after_the_request_with_their_job(conn, admin):
    old = new_export(conn, admin, hours_ago=25)
    young = new_export(conn, admin, hours_ago=23)
    assert purge_exports(conn) >= 1
    assert conn.execute("SELECT count(*) FROM report_exports WHERE id = %s", (old,)).fetchone() == (0,)
    assert conn.execute("SELECT count(*) FROM jobs WHERE report_export_id = %s", (old,)).fetchone() == (0,)
    assert conn.execute("SELECT count(*) FROM report_exports WHERE id = %s", (young,)).fetchone() == (1,)
    # بقیهٔ تست‌ها خروجی تازه‌شان را پاک نمی‌کنند؛ این یکی خودش را.
    conn.execute("DELETE FROM report_exports WHERE id = %s", (young,))
    conn.commit()


def test_report_job_is_a_worker_kind_and_the_context_is_plain_json():
    assert RENDER_REPORT in main.KINDS
    # دادهٔ نمونهٔ همین تست همان چیزی است که پنل در jsonb می‌نشاند: فقط رشته، عدد، فهرست و شیء.
    assert json.loads(json.dumps(CONTEXT, ensure_ascii=False)) == CONTEXT
