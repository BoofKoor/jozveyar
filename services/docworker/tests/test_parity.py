"""
هم‌ارزی دقیق با مرورگر: همان بردارهای `packages/analysis/parity/vectors.json`.

تولیدکنندهٔ تصویر عیناً همان `renderSpec` در `parity.test.ts` است. اگر این تست
شکست، مرورگر و سرور برای یک صفحه دو جواب متفاوت می‌دهند.
"""

import json
from pathlib import Path

import numpy as np
import pytest

from docworker.analysis import DEFAULT_THRESHOLDS, analyze_pixels, is_blank_page, is_color_page

VECTORS = Path(__file__).resolve().parents[3] / "packages" / "analysis" / "parity" / "vectors.json"
DATA = json.loads(VECTORS.read_text(encoding="utf-8"))


def render_spec(spec: dict) -> np.ndarray:
    width, height, noise = spec["width"], spec["height"], spec["noise"]
    out = np.zeros((height, width, 3), dtype=np.uint8)
    state = spec["seed"]
    highlight = spec.get("highlight")
    for y in range(height):
        for x in range(width):
            c = spec["paper"]
            if spec["lineEvery"] > 0 and y % spec["lineEvery"] < spec["lineHeight"] and 4 <= x < width - 4:
                c = spec["ink"]
            if highlight and highlight["x0"] <= x < highlight["x1"] and highlight["y0"] <= y < highlight["y1"]:
                c = highlight["color"]
            for k in range(3):
                jitter = 0
                if noise > 0:
                    state = (state * 48271) % 2147483647
                    jitter = (state % (2 * noise + 1)) - noise
                out[y, x, k] = max(0, min(255, c[k] + jitter))
    return out


def test_thresholds_match_contracts():
    """آستانه‌های پیش‌فرض پایتون همان `DEFAULT_THRESHOLDS` قرارداد است."""
    assert DEFAULT_THRESHOLDS == DATA["thresholds"]


@pytest.mark.parametrize("vector", DATA["vectors"], ids=lambda v: v["spec"]["name"])
def test_exact_parity(vector):
    stats = analyze_pixels(render_spec(vector["spec"]), DATA["thresholds"])
    expected = vector["stats"]

    # برابری دقیق — نه pytest.approx. اعشار با همان عملیات همان عدد می‌دهد.
    assert list(stats.paper_cast) == expected["paperCast"]
    assert stats.color_ratio == expected["colorRatio"]
    assert stats.colored_ink_ratio == expected["coloredInkRatio"]
    assert stats.ink_ratio == expected["inkRatio"]
    assert stats.chroma_p95 == expected["chromaP95"]

    blank = is_blank_page(stats)
    assert blank == vector["blank"]
    assert ((not blank) and is_color_page(stats, DATA["thresholds"])) == vector["color"]
