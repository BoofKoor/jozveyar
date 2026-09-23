"""
تحلیل PDF واقعی، با PDFهایی که همین‌جا با PyMuPDF ساخته می‌شوند.

دو نوع صفحه، چون دو مسیر رندر متفاوت‌اند: صفحهٔ برداری، و صفحه‌ای که فقط یک
تصویر است — یعنی اسکن واقعی. باگ برش ۱ در مرورگر دقیقاً روی همین دومی بود.
"""

import numpy as np
import pytest
import fitz

from docworker.analysis import ANALYSIS_REVISION, DEFAULT_THRESHOLDS
from docworker.pdf import AnalysisFailure, analyze_pdf

A4 = fitz.paper_rect("a4")


def scan_image(paper, ink, highlight=None, w=300, h=424):
    """تصویر اسکن: کاغذ یکدست + خطوط مرکب + هایلایت اختیاری."""
    img = np.empty((h, w, 3), dtype=np.uint8)
    img[:, :] = paper
    for y in range(30, h - 30, 14):
        img[y : y + 3, 25 : w - 25 - (y * 7) % 60] = ink
    if highlight:
        x0, y0, x1, y1, color = highlight
        img[y0:y1, x0:x1] = color
    return img


def make_pdf(path, pages):
    doc = fitz.open()
    for spec in pages:
        page = doc.new_page(width=A4.width, height=A4.height)
        if isinstance(spec, str):
            page.draw_rect(fitz.Rect(60, 60, 500, 70), color=(0.2, 0.2, 0.2), fill=(0.2, 0.2, 0.2))
        else:
            img = spec
            pix = fitz.Pixmap(fitz.csRGB, img.shape[1], img.shape[0], img.tobytes(), False)
            page.insert_image(page.rect, pixmap=pix)
    doc.save(path)


YELLOW = (250, 240, 200)
GRAPHITE = (40, 40, 42)


def test_yellow_scan_is_not_color(tmp_path):
    path = str(tmp_path / "scan.pdf")
    make_pdf(path, [scan_image(YELLOW, GRAPHITE) for _ in range(5)])

    result = analyze_pdf(path, DEFAULT_THRESHOLDS)
    assert result["pageCount"] == 5
    assert len(result["pages"]) == 5
    assert result["sampled"] is False
    assert [p["color"] for p in result["pages"]] == [False] * 5
    # ته‌رنگ زرد اسکن درست برآورد شده: کانال آبی پایین‌تر.
    cast = result["pages"][0]["paperCast"]
    assert cast[2] < cast[0] - 30
    assert result["engine"].startswith("server-pymupdf-")


def test_real_highlight_is_color(tmp_path):
    path = str(tmp_path / "mixed.pdf")
    red = (230, 40, 40)
    make_pdf(
        path,
        [
            scan_image(YELLOW, GRAPHITE),
            scan_image(YELLOW, GRAPHITE, highlight=(40, 100, 200, 160, red)),
            "vector",
        ],
    )
    result = analyze_pdf(path, DEFAULT_THRESHOLDS)
    assert [p["color"] for p in result["pages"]] == [False, True, False]


def test_low_resolution_scan_warns(tmp_path):
    path = str(tmp_path / "lowres.pdf")
    # ۳۰۰ پیکسل روی عرض A4 (۸٫۲۷ اینچ) ≈ ۳۶ DPI
    make_pdf(path, [scan_image(YELLOW, GRAPHITE)])
    page = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"][0]
    assert page["estimatedDpi"] == pytest.approx(36, abs=1)
    assert "low_dpi" in page["warnings"]


def _pixmap(w, h, value=255):
    img = np.full((h, w, 3), value, dtype=np.uint8)
    img[h // 3 : h // 3 + 4, : w // 2] = 30  # یک خط، تا صفحه سفید نباشد
    return fitz.Pixmap(fitz.csRGB, w, h, img.tobytes(), False)


def test_dpi_is_measured_where_the_image_sits_not_over_the_whole_page(tmp_path):
    """ADR-029: DPI از جای واقعی تصویر روی صفحه. نسخهٔ ۱ لوگوی کوچک را «۴ DPI» می‌دید."""
    path = str(tmp_path / "dpi.pdf")
    doc = fitz.open()
    # ۱) صفحهٔ متنی با لوگوی ۲۰۰×۵۰ پیکسلی در ۲×۰٫۵ اینچ: ۱٪ صفحه، پس DPI صفحه ندارد.
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((60, 200), "Chapter 1", fontsize=14)
    page.insert_image(fitz.Rect(60, 40, 204, 76), pixmap=_pixmap(200, 50))
    # ۲) اسکن کامل ۱۲۴۰×۱۷۵۴ روی A4: ۱۵۰ DPI.
    doc.new_page(width=A4.width, height=A4.height).insert_image(A4, pixmap=_pixmap(1240, 1754))
    # ۳) عکس ۶۴۰×۴۸۰ گوشی، چرخیده و در نیمهٔ بالای صفحه: ۴۲۱ پوینت ارتفاع برای ۶۴۰
    #    پیکسل ≈ ۱۰۹ DPI در هر دو محور — هشدار دارد.
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_image(fitz.Rect(0, 0, 595, 421), pixmap=_pixmap(640, 480), rotate=90)
    doc.save(path)

    result = analyze_pdf(path, DEFAULT_THRESHOLDS)
    pages = result["pages"]
    assert [p["estimatedDpi"] for p in pages] == [None, 150, 109]
    assert ["low_dpi" in p["warnings"] for p in pages] == [False, False, True]
    # ردیف‌های نسخهٔ ۱ (DPI روی کل صفحه) از شناسهٔ موتور جدا می‌شوند.
    assert result["engine"].endswith(f"-r{ANALYSIS_REVISION}")


def test_dpi_follows_the_form_xobject_matrix(tmp_path):
    """صفحه‌ای که داخل صفحهٔ دیگر کوچک نشسته (Form XObject، مثل «چند صفحه در یک برگ»):
    اسکن ۳۰۰ DPI وقتی نصف شود ۶۰۰ DPI است؛ اسکن ۱۵۰ DPI که ربع صفحه بگیرد، ۳۰۰."""
    source = fitz.open()
    source.new_page(width=A4.width, height=A4.height).insert_image(A4, pixmap=_pixmap(1240, 1754))
    path = str(tmp_path / "nup.pdf")
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.show_pdf_page(fitz.Rect(0, 0, A4.width / 2, A4.height / 2), source, 0)
    doc.save(path)

    [only] = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"]
    assert only["estimatedDpi"] == 300
    assert "low_dpi" not in only["warnings"]


def test_dpi_sees_an_image_inside_a_stamp_annotation(tmp_path):
    """اسکنی که در ظاهر یک مهر (حاشیه‌نویسی) نشسته، نه در محتوای صفحه: PyMuPDF آن را با
    جایش روی صفحه می‌بیند، و مرورگر هم با همان جا حساب می‌کند (`stamp-scan-1.pdf`)."""
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.insert_text((60, 100), "Stamped scan", fontsize=14)
    page_xref = page.xref  # صفحهٔ تازه شیء Page قبلی را بی‌اعتبار می‌کند
    scratch = doc.new_page(width=10, height=10)
    image = scratch.insert_image(scratch.rect, pixmap=_pixmap(150, 212))
    form = doc.get_new_xref()
    doc.update_object(
        form,
        f"<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /XObject << /Im0 {image} 0 R >> >> >>",
    )
    doc.update_stream(form, b"/Im0 Do")
    annot = doc.get_new_xref()
    doc.update_object(
        annot, f"<< /Type /Annot /Subtype /Stamp /F 4 /Rect [0 0 595 842] /AP << /N {form} 0 R >> >>"
    )
    doc.xref_set_key(page_xref, "Annots", f"[{annot} 0 R]")
    doc.delete_page(1)
    path = str(tmp_path / "stamp.pdf")
    doc.save(path)

    [only] = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"]
    assert only["estimatedDpi"] == 18  # ۱۵۰ پیکسل روی ۸٫۲۶ اینچ
    assert "low_dpi" in only["warnings"]


def test_solid_dark_page_counts_as_blank(tmp_path):
    """ADR-026: صفحه‌ای که جز زمینهٔ تیرهٔ یکدست چیزی ندارد «سفید» است، و رنگی نیست.
    اگر این عوض شود، تصمیم ADR-026 عوض شده — اول آنجا."""
    path = str(tmp_path / "dark.pdf")
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.draw_rect(page.rect, color=None, fill=(0, 0, 0))
    doc.save(path)

    [dark] = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"]
    assert (dark["blank"], dark["color"]) == (True, False)
    assert "blank_page" in dark["warnings"]
    # ته‌رنگ تیره ذخیره می‌شود؛ درمان روزی لازم شد، از همین جدا می‌شود (ADR-026).
    assert max(dark["paperCast"]) < 40


def test_dark_slide_with_white_text_is_not_blank(tmp_path):
    """ADR-026: اسلاید تیره با متن سفید «سفید» نیست — لبهٔ نرم حروف مرکب شمرده می‌شود.
    یک خط روی زمینهٔ تقریباً سیاه (که خودش مرکب نیست)، و ده خط روی خاکستری تیره."""
    path = str(tmp_path / "slides.pdf")
    doc = fitz.open()
    for lines, background in ((1, (0.08, 0.1, 0.14)), (10, (0.2, 0.2, 0.22))):
        page = doc.new_page(width=960, height=540)
        page.draw_rect(page.rect, color=None, fill=background)
        for i in range(lines):
            page.insert_text((60, 80 + i * 44), "Lecture 3 - Thermodynamics", fontsize=28, color=(1, 1, 1))
    doc.save(path)

    pages = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"]
    assert [p["blank"] for p in pages] == [False, False]
    assert [p["color"] for p in pages] == [False, False]


# نسخهٔ ۲ اسلاید تیره با یک تیتر سفید را روی ۲۰، ۲۴، ۲۵، ۳۰، ۴۵، ۶۰ و ۹۰ «سفید» می‌کرد و روی ۱۰ و ۲۲
# (و رنگ‌های تست بالا) نه، بسته به کسر روشنایی زمینه. روی ۸۳ خاکستری ۸ تا ۹۰ سنجیده شد: نسخهٔ ۲
# برای ۵۵ «سفید»، با اصلاح گرد کردن ولی بی قاعدهٔ کاغذ ۷۱، و حالا صفر.
@pytest.mark.parametrize("gray", [10, 20, 22, 24, 25, 30, 45, 60, 90])
def test_dark_slide_with_a_title_is_never_blank(tmp_path, gray):
    """ADR-026 فقط صفحهٔ یکدست تیره را «سفید» می‌داند. اسلاید تیره با یک خط تیتر سفید سفید نیست،
    چون زمینهٔ تیره کاغذ نیست و خنثی نمی‌شود (`PAPER_CAST_MIN_LUMA`)."""
    path = str(tmp_path / "title.pdf")
    doc = fitz.open()
    page = doc.new_page(width=960, height=540)
    page.draw_rect(page.rect, color=None, fill=(gray / 255, gray / 255, gray / 255))
    page.insert_text((60, 80), "Lecture 3 - Thermodynamics", fontsize=28, color=(1, 1, 1))
    doc.save(path)

    [slide] = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"]
    assert (slide["blank"], slide["color"]) == (False, False)
    assert "blank_page" not in slide["warnings"]


def test_dark_colored_slide_is_color(tmp_path):
    """اسلاید سرمه‌ای با متن سفید رنگی چاپ می‌شود؛ خنثی کردن زمینه‌اش آن را «سیاه‌سفید» می‌کرد."""
    path = str(tmp_path / "navy.pdf")
    doc = fitz.open()
    page = doc.new_page(width=960, height=540)
    page.draw_rect(page.rect, color=None, fill=(0.1, 0.15, 0.35))
    for i in range(3):
        page.insert_text((60, 80 + i * 44), "Lecture 3 - Thermodynamics", fontsize=28, color=(1, 1, 1))
    doc.save(path)

    [slide] = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"]
    assert (slide["blank"], slide["color"]) == (False, True)


@pytest.mark.parametrize("blue", [200, 201])
def test_flat_tinted_paper_is_paper_whatever_its_luma_fraction(tmp_path, blue):
    """زمینهٔ زرد یکدست، مثل PDF برداری. روشنایی (250,240,201) برابر 238.54 است و نسخهٔ ۲ آن را
    از برآورد کاغذ بیرون می‌انداخت: کل صفحه رنگی می‌شد (colorRatio ۰٫۹۱) و حاشیه‌اش صفر، یعنی
    هشدار «حاشیهٔ تنگ» هم. (250,240,200) با روشنایی 238.43 درست بود."""
    path = str(tmp_path / "flat.pdf")
    doc = fitz.open()
    page = doc.new_page(width=A4.width, height=A4.height)
    page.draw_rect(page.rect, color=None, fill=(250 / 255, 240 / 255, blue / 255))
    for i in range(20):
        page.draw_rect(fitz.Rect(60, 60 + i * 35, 500, 64 + i * 35), color=None, fill=(0.18, 0.18, 0.19))
    doc.save(path)

    [flat] = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"]
    assert flat["color"] is False
    assert flat["colorRatio"] == 0
    assert list(flat["paperCast"]) == [250, 240, blue]
    assert "tight_margin" not in flat["warnings"]
    assert flat["minMarginMm"] > 15


def test_page_shape_matches_contract(tmp_path):
    path = str(tmp_path / "one.pdf")
    make_pdf(path, ["vector"])
    page = analyze_pdf(path, DEFAULT_THRESHOLDS)["pages"][0]
    assert set(page) == {
        "n", "widthPt", "heightPt", "rotation", "color", "colorRatio", "coloredInkRatio",
        "chromaP95", "paperCast", "inkRatio", "blank", "estimatedDpi", "minMarginMm", "warnings",
    }
    assert page["n"] == 1
    assert round(page["widthPt"]) == 595


def test_corrupt_file(tmp_path):
    path = tmp_path / "broken.pdf"
    path.write_bytes(b"%PDF-1.4 this is not a real pdf at all")
    with pytest.raises(AnalysisFailure) as failure:
        analyze_pdf(str(path), DEFAULT_THRESHOLDS)
    assert failure.value.code in {"corrupt_file", "no_pages"}


def test_password_protected(tmp_path):
    path = str(tmp_path / "locked.pdf")
    doc = fitz.open()
    doc.new_page()
    doc.save(path, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="secret", owner_pw="owner")
    with pytest.raises(AnalysisFailure) as failure:
        analyze_pdf(path, DEFAULT_THRESHOLDS)
    assert failure.value.code == "password_protected"


def test_147_page_yellow_scan_is_fast_and_not_color(tmp_path):
    """همان اسکن زرد ۱۴۷ صفحه‌ای قفل‌شده در CLAUDE.md، این بار روی سرور.

    روی ماشین توسعه ۱٫۴ ثانیه طول کشید (۳۱ شهریور ۱۴۰۵). سقف ۱۵ ثانیه برای
    ماشین کند CI است؛ این تست جلوی پس‌رفت چندبرابری را می‌گیرد، نه نوسان.
    """
    import time

    path = str(tmp_path / "yellow-147.pdf")
    doc = fitz.open()
    for _ in range(147):
        page = doc.new_page(width=A4.width, height=A4.height)
        page.draw_rect(page.rect, color=None, fill=(0.98, 0.94, 0.78))
        for i in range(28):
            y = 60 + i * 26
            page.draw_rect(fitz.Rect(60, y, 60 + 300 + (i * 37) % 170, y + 4), color=None, fill=(0.18, 0.18, 0.19))
    doc.save(path)

    started = time.monotonic()
    result = analyze_pdf(path, DEFAULT_THRESHOLDS)
    elapsed = time.monotonic() - started
    assert result["pageCount"] == 147
    assert sum(p["color"] for p in result["pages"]) == 0
    assert elapsed < 15, f"{elapsed:.1f}s"
