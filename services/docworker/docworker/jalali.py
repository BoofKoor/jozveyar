"""
تاریخ شمسی و ساعت تهران برای برگهٔ سفارش (برش ۵٫۱، ADR-043).

همان متن‌های `packages/text/src/dates.ts` پنل و سایت: «13 مهر 1405»، «دوشنبه 13 مهر» و «14:05»، با ارقام لاتین. آنجا
`Intl` با تقویم فارسی (ICU) است و اینجا همان حساب ICU به پایتون: تقویم حسابی با چرخهٔ ۳۳ ساله. بردارهای
`packages/text/parity/jalali.json` را همان تابع‌های TS می‌سازند و تست هر دو طرف برابری دقیق را قفل کرده است.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

TEHRAN = ZoneInfo("Asia/Tehran")

MONTHS = (
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
)
# به ترتیب `weekday()` پایتون (۰ دوشنبه).
WEEKDAYS = ("دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه")

# روز ژولینی ۱ فروردین سال ۱، و روزهای پیش از هر ماه (شش ماه ۳۱ روزه، پنج ماه ۳۰ روزه، اسفند ۲۹ یا ۳۰).
_EPOCH = 1948320
_BEFORE_MONTH = (0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336)


def to_jalali(year: int, month: int, day: int) -> tuple[int, int, int]:
    """سال، ماه و روز شمسی یک روز میلادی؛ همان `PersianCalendar::handleComputeFields` ICU."""
    days = datetime(year, month, day).toordinal() + 1721425 - _EPOCH
    jyear = 1 + (33 * days + 3) // 12053
    day_of_year = days - (365 * (jyear - 1) + (8 * jyear + 21) // 33)
    jmonth = day_of_year // 31 if day_of_year < 216 else (day_of_year - 6) // 30
    return jyear, jmonth + 1, day_of_year - _BEFORE_MONTH[jmonth] + 1


def _tehran(instant: datetime) -> datetime:
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    return instant.astimezone(TEHRAN)


def format_jalali(instant: datetime) -> str:
    """«13 مهر 1405»: روز تهران، مثل `formatJalali`."""
    local = _tehran(instant)
    year, month, day = to_jalali(local.year, local.month, local.day)
    return f"{day} {MONTHS[month - 1]} {year}"


def format_weekday(instant: datetime) -> str:
    """«دوشنبه 13 مهر»: روز هفته و تاریخ بی سال، مثل `formatJalaliWeekday`."""
    local = _tehran(instant)
    _, month, day = to_jalali(local.year, local.month, local.day)
    return f"{WEEKDAYS[local.weekday()]} {day} {MONTHS[month - 1]}"


def format_time(instant: datetime) -> str:
    """«09:05»: ساعت و دقیقهٔ تهران، ۲۴ ساعته، مثل `formatTehranTime`."""
    local = _tehran(instant)
    return f"{local.hour:02d}:{local.minute:02d}"


def deadline_day(deadline: datetime) -> str:
    """«دوشنبه 13 مهر 1405»: روزی که مهلت انحصاری (`postHandoffDue`) در آن تمام می‌شود، با سال (مثل `formatDeadlineDay`)."""
    last = deadline - timedelta(milliseconds=1)
    return f"{format_weekday(last)} {format_jalali(last).rsplit(' ', 1)[1]}"
