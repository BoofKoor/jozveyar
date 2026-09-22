"""
تحلیل کامل یک PDF روی سرور — همهٔ صفحات، بدون نمونه‌برداری.

همان مراحل کارگر مرورگر (`apps/web/lib/analyze.worker.ts`): رندر با DPI پایین
روی زمینهٔ سفید، آمار پیکسل با الگوریتم مشترک (`analysis.py`)، برآورد DPI
بزرگ‌ترین تصویر، و کوچک‌ترین حاشیه. خروجی شکل `DocumentAnalysis` قرارداد است.

رندر PyMuPDF و pdf.js پیکسل‌به‌پیکسل یکی نیستند (دو موتور رندر)، پس اعداد خام
کمی فرق می‌کنند. الگوریتم یکی است — تست هم‌ارزی ضامنش — و برای همین هر دو
تحلیل ذخیره می‌شوند تا اختلاف واقعی سنجیده شود.
"""

from __future__ import annotations

import time

import fitz  # PyMuPDF
import numpy as np

from .analysis import analyze_pixels, build_page_analysis, pt_to_mm, sample_scale_for

ENGINE = f"server-pymupdf-{fitz.VersionBind}"


class AnalysisFailure(Exception):
    """شکست قطعی: تلاش دوباره فایده ندارد. `code` همان کدهای پیام فارسی مرورگر است."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def _min_margin_mm(
    rgb: np.ndarray, paper_cast: tuple[float, float, float], width_pt: float, height_pt: float
) -> float | None:
    """کوچک‌ترین حاشیهٔ محتوا — همان `measureMinMargin` مرورگر."""
    height, width = rgb.shape[:2]
    if width == 0 or height == 0:
        return None
    delta = (
        np.abs(rgb[:, :, 0].astype(np.float64) - paper_cast[0])
        + np.abs(rgb[:, :, 1].astype(np.float64) - paper_cast[1])
        + np.abs(rgb[:, :, 2].astype(np.float64) - paper_cast[2])
    )
    content = delta > 28
    rows = np.flatnonzero(content.any(axis=1))
    cols = np.flatnonzero(content.any(axis=0))
    if rows.size == 0:
        return None  # صفحهٔ خالی — حاشیه معنا ندارد
    left = cols[0] / width * width_pt
    right = (width - 1 - cols[-1]) / width * width_pt
    top = rows[0] / height * height_pt
    bottom = (height - 1 - rows[-1]) / height * height_pt
    return pt_to_mm(min(left, right, top, bottom))


def _estimated_dpi(doc: fitz.Document, page: fitz.Page, width_pt: float, height_pt: float) -> float | None:
    """DPI بزرگ‌ترین تصویر صفحه — همان فرمول مرورگر. فقط برای هشدار کیفیت."""
    try:
        best = (0, 0, 0)
        for image in page.get_images(full=True):
            w, h = int(image[2]), int(image[3])
            if w * h > best[0]:
                best = (w * h, w, h)
        if best[0] == 0:
            return None
        dpi = min(best[1] / (width_pt / 72), best[2] / (height_pt / 72))
        return float(round(dpi)) if dpi > 0 else None
    except Exception:  # noqa: BLE001 — هشدار کیفیت هرگز نباید تحلیل را بشکند
        return None


def analyze_pdf(path: str, thresholds: dict[str, float], deadline_seconds: float = 1200) -> dict:
    started = time.monotonic()
    try:
        doc = fitz.open(path)
    except Exception as error:  # noqa: BLE001 — PyMuPDF انواع مختلف خطا می‌دهد
        raise AnalysisFailure("corrupt_file", str(error)) from error

    try:
        if doc.needs_pass and not doc.authenticate(""):
            raise AnalysisFailure("password_protected")
        if not doc.is_pdf:
            raise AnalysisFailure("corrupt_file", "not a pdf")
        page_count = doc.page_count
        if page_count == 0:
            raise AnalysisFailure("no_pages")

        pages = []
        failures = 0
        for index in range(page_count):
            if time.monotonic() - started > deadline_seconds:
                raise AnalysisFailure("timeout", f"بیش از {deadline_seconds} ثانیه")
            try:
                page = doc.load_page(index)
                width_pt, height_pt = page.rect.width, page.rect.height
                scale = sample_scale_for(width_pt, height_pt, thresholds["sampleMaxDimension"])
                pix = page.get_pixmap(
                    matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False
                )
                rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                    pix.height, pix.stride
                )[:, : pix.width * 3].reshape(pix.height, pix.width, 3)

                stats = analyze_pixels(rgb, thresholds)
                pages.append(
                    build_page_analysis(
                        n=index + 1,
                        width_pt=width_pt,
                        height_pt=height_pt,
                        rotation=page.rotation,
                        estimated_dpi=_estimated_dpi(doc, page, width_pt, height_pt),
                        min_margin_mm=_min_margin_mm(rgb, stats.paper_cast, width_pt, height_pt),
                        stats=stats,
                        thresholds=thresholds,
                    )
                )
            except AnalysisFailure:
                raise
            except Exception:  # noqa: BLE001
                # یک صفحهٔ خراب کل سند را از دست نمی‌دهد (همان قاعدهٔ مرورگر)،
                # ولی اگر همه بشکنند نتیجه بی‌معناست.
                failures += 1
                if failures > 3 and failures >= len(pages):
                    raise AnalysisFailure("render_failed")

        if not pages:
            raise AnalysisFailure("render_failed")

        return {
            "engine": ENGINE,
            "thresholds": thresholds,
            "pageCount": page_count,
            "pages": pages,
            "sampled": False,
            "sampleStride": 1,
            "elapsedMs": round((time.monotonic() - started) * 1000),
        }
    finally:
        doc.close()
