"""
تشخیص رنگ صفحه — پورت دقیق `packages/analysis/src/index.ts`.

دو پیاده‌سازی از یک الگوریتم فقط وقتی قابل اعتمادند که چیزی مجبورشان کند
یکی بمانند. آن چیز `packages/analysis/parity/vectors.json` است: تست TS ثابت
می‌کند مرورگر همان خروجی را می‌دهد، و `tests/test_parity.py` ثابت می‌کند این
فایل هم. برابری دقیق است، نه تقریبی.

سه نکته که برابری دقیق را ممکن می‌کند:

- `Math.round` جاوااسکریپت نیم را به بالا گرد می‌کند؛ `round` پایتون به زوج.
  پس همه‌جا `floor(x + 0.5)` — که برای اعداد مثبت همان `Math.round` است.
- عبارت روشنایی دقیقاً با همان ترتیب جمع نوشته شده: اعشار شرکت‌پذیر نیست.
- numpy با float64 همان IEEE 754 جاوااسکریپت است؛ عملیات عنصربه‌عنصر همان
  عدد را می‌دهد.

اگر این فایل عوض شد و تست هم‌ارزی شکست، یعنی قیمت و تشخیص مرورگر و سرور از
هم جدا شده‌اند. تغییر عمدی الگوریتم از TS شروع می‌شود (`UPDATE_PARITY=1`)،
بعد اینجا.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


# همان `DEFAULT_THRESHOLDS` در packages/contracts. تست هم‌ارزی برابری این دو
# را هم می‌سنجد، پس اگر آنجا عوض شد اینجا هم باید عوض شود.
DEFAULT_THRESHOLDS: dict[str, float] = {
    "chromaMin": 36,
    "colorPixelRatioMin": 0.004,
    "coloredInkRatioMin": 0.12,
    "sampleMaxDimension": 400,
    "nearWhiteLuma": 244,
    "nearBlackLuma": 26,
    "paperSampleRatio": 0.1,
    "lowDpiThreshold": 150,
}

MIN_SAFE_MARGIN_MM = 10

# همان `ANALYSIS_REVISION` و `DPI_MIN_PAGE_COVERAGE` در packages/analysis؛ تست هم‌ارزی
# هر دو را می‌سنجد. ۲: DPI از جای واقعی تصویر روی صفحه، نه از اندازهٔ کل صفحه؛ و رندر
# سرور روی همان شبکهٔ پیکسل مرورگر (`pdf.py`، ADR-029). ۳: رنگ کاغذ با همان روشنایی
# گردشدهٔ هیستوگرام (`estimate_paper_cast`)، و تعادل سفیدی فقط روی ته‌رنگ روشن (ADR-009، اصلاح).
ANALYSIS_REVISION = 3
DPI_MIN_PAGE_COVERAGE = 0.2
# همان `PAPER_CAST_MIN_LUMA`: ته‌رنگ تیره‌تر از خاکستری میانی کاغذ نیست (زمینهٔ اسلاید تیره،
# صفحهٔ سیاه) و خنثی نمی‌شود؛ وگرنه زمینهٔ تیره سفید و صفحه «خالی» می‌شد (ADR-026، اصلاح).
PAPER_CAST_MIN_LUMA = 128


def placement_dpi(placement: dict) -> float | None:
    """DPI مؤثر یک تصویر از اندازه‌ای که واقعاً روی صفحه گرفته — همان `placementDpi`.

    `placement`: `widthPx`، `heightPx` و `matrix` (`[a, b, c, d, e, f]` که مربع واحد
    تصویر را روی صفحه به پوینت می‌نشاند)."""
    a, b, c, d = placement["matrix"][:4]
    width_in = math.hypot(a, b) / 72
    height_in = math.hypot(c, d) / 72
    if not (width_in > 0 and height_in > 0 and placement["widthPx"] > 0 and placement["heightPx"] > 0):
        return None
    return min(placement["widthPx"] / width_in, placement["heightPx"] / height_in)


def page_dpi(placements: list[dict], page_width_pt: float, page_height_pt: float) -> float | None:
    """DPI تصویری که بیشترین سطح صفحه را پوشانده — همان `pageDpi`. صفحهٔ بی‌تصویر بزرگ
    (متن، حتی با لوگوی کوچک) None می‌گیرد: کیفیت چاپش را متن تعیین می‌کند."""
    page_area = page_width_pt * page_height_pt
    if not page_area > 0:
        return None
    best, best_area = None, 0.0
    for placement in placements:
        a, b, c, d = placement["matrix"][:4]
        area = abs(a * d - b * c)
        if area > best_area:
            best, best_area = placement, area
    if best is None or best_area / page_area < DPI_MIN_PAGE_COVERAGE:
        return None
    dpi = placement_dpi(best)
    return None if dpi is None else float(math.floor(dpi + 0.5))


@dataclass
class PixelStats:
    paper_cast: tuple[float, float, float]
    color_ratio: float
    colored_ink_ratio: float
    ink_ratio: float
    chroma_p95: int


def _js_round(values: np.ndarray) -> np.ndarray:
    """`Math.round` جاوااسکریپت برای مقادیر نامنفی."""
    return np.floor(values + 0.5)


def _luma(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    # ترتیب جمع همان TS است: (0.299r + 0.587g) + 0.114b
    return 0.299 * r + 0.587 * g + 0.114 * b


def _channels(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """آرایهٔ (N, 3) از uint8 به سه کانال float64."""
    as_float = rgb.reshape(-1, 3).astype(np.float64)
    return as_float[:, 0], as_float[:, 1], as_float[:, 2]


def estimate_paper_cast(rgb: np.ndarray, sample_ratio: float) -> tuple[float, float, float]:
    """میانگین روشن‌ترین دهک — همان `estimatePaperCast`.

    هیستوگرام و انتخاب پیکسل‌ها هر دو با روشنایی گردشده؛ با روشنایی خام، زمینهٔ
    یکدستی که کسر روشنایی‌اش ۰٫۵ یا بیشتر است کلاً از برآورد بیرون می‌افتاد."""
    r, g, b = _channels(rgb)
    pixel_count = r.size
    if pixel_count == 0:
        return (255.0, 255.0, 255.0)

    rounded = _js_round(_luma(r, g, b))
    histogram = np.bincount(rounded.astype(np.int64), minlength=256)

    wanted = max(1, int(np.floor(pixel_count * sample_ratio)))
    cutoff = 255
    seen = 0
    for level in range(255, -1, -1):
        seen += int(histogram[level])
        if seen >= wanted:
            cutoff = level
            break

    mask = rounded >= cutoff
    count = int(mask.sum())
    if count == 0:
        return (255.0, 255.0, 255.0)
    # جمع اعداد صحیح دقیق است؛ تقسیم همان تقسیم TS.
    return (
        float(r[mask].sum()) / count,
        float(g[mask].sum()) / count,
        float(b[mask].sum()) / count,
    )


def analyze_pixels(rgb: np.ndarray, thresholds: dict[str, float]) -> PixelStats:
    """آمار رنگ یک صفحه — همان `analyzePixels`.

    ورودی RGB است، نه RGBA: رندر سرور روی زمینهٔ سفید و بدون آلفا است، پس شرط
    «پیکسل شفاف» مرورگر اینجا هیچ‌وقت برقرار نمی‌شود و حذفش چیزی را عوض نمی‌کند.
    """
    r0, g0, b0 = _channels(rgb)
    pixel_count = r0.size
    if pixel_count == 0:
        return PixelStats((255.0, 255.0, 255.0), 0.0, 0.0, 0.0, 0)

    paper_cast = estimate_paper_cast(rgb, thresholds["paperSampleRatio"])
    # فقط روی کاغذ؛ روشنایی با همان عبارت و ترتیب TS، پس مرز در هر دو طرف یکی است.
    paper = 0.299 * paper_cast[0] + 0.587 * paper_cast[1] + 0.114 * paper_cast[2] >= PAPER_CAST_MIN_LUMA
    gain = [255 / c if paper and c > 1 else 1 for c in paper_cast]

    r = np.minimum(255, r0 * gain[0])
    g = np.minimum(255, g0 * gain[1])
    b = np.minimum(255, b0 * gain[2])

    l = _luma(r, g, b)
    ink = (l <= thresholds["nearWhiteLuma"]) & (l >= thresholds["nearBlackLuma"])
    ink_count = int(ink.sum())

    chroma = _js_round(
        np.maximum(np.maximum(r, g), b)[ink] - np.minimum(np.minimum(r, g), b)[ink]
    ).astype(np.int64)
    colored_count = int((chroma > thresholds["chromaMin"]).sum())

    chroma_p95 = 0
    if ink_count > 0:
        histogram = np.bincount(chroma, minlength=256)
        target = int(np.ceil(ink_count * 0.95))
        seen = 0
        for value in range(256):
            seen += int(histogram[value])
            if seen >= target:
                chroma_p95 = value
                break

    return PixelStats(
        paper_cast=paper_cast,
        color_ratio=colored_count / pixel_count,
        colored_ink_ratio=colored_count / ink_count if ink_count > 0 else 0.0,
        ink_ratio=ink_count / pixel_count,
        chroma_p95=chroma_p95,
    )


def is_color_page(stats: PixelStats, thresholds: dict[str, float]) -> bool:
    if stats.ink_ratio <= 0:
        return False
    return (
        stats.color_ratio >= thresholds["colorPixelRatioMin"]
        or stats.colored_ink_ratio >= thresholds["coloredInkRatioMin"]
    )


def is_blank_page(stats: PixelStats) -> bool:
    return stats.ink_ratio < 0.0005


def sample_scale_for(width_pt: float, height_pt: float, max_dimension: float) -> float:
    longest = max(width_pt, height_pt)
    if longest <= 0:
        return 1.0
    return min(1.0, max_dimension / longest)


def pt_to_mm(pt: float) -> float:
    return (pt * 25.4) / 72


def build_page_analysis(
    *,
    n: int,
    width_pt: float,
    height_pt: float,
    rotation: int,
    estimated_dpi: float | None,
    min_margin_mm: float | None,
    stats: PixelStats,
    thresholds: dict[str, float],
) -> dict:
    """یک `PageAnalysis` (قرارداد packages/contracts) — همان `buildPageAnalysis`."""
    blank = is_blank_page(stats)
    warnings: list[str] = []
    if blank:
        warnings.append("blank_page")
    if estimated_dpi is not None and estimated_dpi < thresholds["lowDpiThreshold"]:
        warnings.append("low_dpi")
    if min_margin_mm is not None and min_margin_mm < MIN_SAFE_MARGIN_MM:
        warnings.append("tight_margin")

    return {
        "n": n,
        "widthPt": width_pt,
        "heightPt": height_pt,
        "rotation": rotation,
        "color": (not blank) and is_color_page(stats, thresholds),
        "colorRatio": stats.color_ratio,
        "coloredInkRatio": stats.colored_ink_ratio,
        "chromaP95": stats.chroma_p95,
        "paperCast": list(stats.paper_cast),
        "inkRatio": stats.ink_ratio,
        "blank": blank,
        "estimatedDpi": estimated_dpi,
        "minMarginMm": min_margin_mm,
        "warnings": warnings,
    }
