"""
تاریخ شمسی برگهٔ سفارش (برش ۵٫۱): همان متن‌هایی که پنل و سایت با `Intl` می‌سازند.

بردارها را `packages/text/src/parity.test.ts` از خود تابع‌های `dates.ts` می‌سازد؛ برابری دقیق است، نه تقریبی.
"""

import json
from datetime import datetime
from pathlib import Path

import pytest

from docworker.jalali import deadline_day, format_jalali, format_time, format_weekday, to_jalali

VECTORS = Path(__file__).resolve().parents[3] / "packages" / "text" / "parity" / "jalali.json"


def load():
    return json.loads(VECTORS.read_text(encoding="utf-8"))


def at(vector):
    return datetime.fromisoformat(vector["at"].replace("Z", "+00:00"))


@pytest.mark.parametrize("vector", load(), ids=lambda v: v["at"])
def test_same_text_as_the_panel(vector):
    assert format_jalali(at(vector)) == vector["date"]
    assert format_weekday(at(vector)) == vector["weekday"]
    assert format_time(at(vector)) == vector["time"]
    # مهلت انحصاری: روز پایانش، و روی برگه با سال همان روز.
    assert deadline_day(at(vector)) == f'{vector["deadline"]} {vector["deadlineDate"].rsplit(" ", 1)[1]}'


def test_the_vectors_cover_nowruz_and_tehran_midnight():
    vectors = {v["at"]: v for v in load()}
    assert len(vectors) > 400
    # نوروز ۱۴۰۵: نیمه‌شب تهران، ۲۰:۳۰ روز ۲۰ مارس به وقت UTC؛ یک میلی‌ثانیه پیش‌تر هنوز اسفند (شاهد).
    assert vectors["2026-03-20T20:29:59.999Z"]["date"] == "29 اسفند 1404"
    assert vectors["2026-03-20T20:30:00.000Z"]["date"] == "1 فروردین 1405"


def test_known_days():
    # «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران؛ و مهلت «تا پایان دوشنبه» نیمه‌شب آغاز سه‌شنبه است.
    now = datetime.fromisoformat("2026-10-05T07:50:00+00:00")
    assert (format_weekday(now), format_jalali(now), format_time(now)) == ("دوشنبه 13 مهر", "13 مهر 1405", "11:20")
    assert deadline_day(datetime.fromisoformat("2026-10-06T00:00:00+03:30")) == "دوشنبه 13 مهر 1405"
    # ۱۴۰۳ کبیسه است: ۳۰ اسفند دارد، و ۱۴۰۴ نه.
    assert to_jalali(2025, 3, 20) == (1403, 12, 30)
    assert to_jalali(2026, 3, 20) == (1404, 12, 29)
    assert to_jalali(2026, 3, 21) == (1405, 1, 1)
