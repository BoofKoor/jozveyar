"""
تحلیل PDF واقعی، با PDFهایی که همین‌جا با PyMuPDF ساخته می‌شوند.

دو نوع صفحه، چون دو مسیر رندر متفاوت‌اند: صفحهٔ برداری، و صفحه‌ای که فقط یک
تصویر است — یعنی اسکن واقعی. باگ برش ۱ در مرورگر دقیقاً روی همین دومی بود.
"""

import numpy as np
import pytest
import fitz

from docworker.analysis import DEFAULT_THRESHOLDS
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
