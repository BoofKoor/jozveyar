"""
نگهداری فایل‌های سفارش (برش ۵٫۱، ADR-044).

پیشوند `orders/` بیرون از قاعدهٔ سنی باکت است (ADR-024)، چون آن قاعده وضعیت را نمی‌بیند و جزوه‌ای را که هنوز چاپ نشده هم
پاک می‌کرد. به جایش کارگر، بین کارها و مثل هم‌گام‌سازی فونت، فایل‌های هر سفارش (PDF جزوه، فایل‌های چاپ و برگه) را N روز
پس از «تحویل پست شد» یا آخرین «لغو شد» پاک می‌کند و `orders.files_deleted_at` را می‌نشاند؛ ردیف‌ها، مشخصات، تحلیل و
ریز قیمت منجمد می‌مانند. سفارش باز هرگز: هم شرط همین‌جاست، هم CHECK `orders_files_deleted_closed` پایگاه داده.

- N از `settings` (`order.files_retention_days`، همان بازهٔ ۷ تا ۳۶۵ `SETTING_SCHEMAS`). مقدار نبود یا خراب بود؟ هیچ چیز پاک
  نمی‌شود و بلند لاگ می‌شود: پاک کردن برگشت ندارد، و پیش‌فرض حدسی جای تصمیم مالک را نمی‌گیرد.
- هر سفارش در تراکنش خودش، زیر قفل ردیفش (`FOR UPDATE SKIP LOCKED`): دو کارگر یک سفارش را دو بار نمی‌برند، و برگرداندن
  هم‌زمان در پنل پشت قفل می‌ماند و بعد با تریگر `orders_files_deleted` رد می‌شود. پاک کردن بایت‌ها تکرارپذیر است: کارگری که
  وسط کار بمیرد، بار بعد همان را از نو پاک می‌کند.
- فایل پست (برش ۶٫۱، ADR-045)، با همان N و همان دور: N روز پس از ورود، بایت خام و جدول‌ها پاک می‌شوند، پیش‌نویسی که ثبت نشد
  «دور انداخته» می‌شود (بی کننده)، و متن سطرهایی که مرسولهٔ ما نشدند (نام و مقصد مشتری‌های دیگر چاپخانه) هم، از ۶٫۲ با سطرهایی
  که «هیچ‌کدام» خوردند (تصمیم ۸۸). سطری که کدی گرفت، حتی کنارگذاشته یا دستی، و سطر منتظر صف تأیید، حکم‌ها و مرسوله‌ها می‌مانند؛
  تریگرهای 0022 و 0024 جز همین پاک کردن را نمی‌گذارند.
"""

from __future__ import annotations

import logging

import psycopg

from .orders import order_prefix
from .storage import S3Storage

log = logging.getLogger("docworker.retention")

SETTING = "order.files_retention_days"
MIN_DAYS, MAX_DAYS = 7, 365
# هر دور چند سفارش؛ بقیه دور بعد، تا کارهای صف منتظر نمانند.
BATCH = 20

DUE_SQL = """
SELECT o.id::text, o.order_number
  FROM orders o
 WHERE o.files_deleted_at IS NULL
   AND ((o.status = 'handed_to_post' AND o.handed_to_post_at <= now() - make_interval(days => %(days)s))
     OR (o.status = 'cancelled'
         AND (SELECT max(e.at) FROM order_status_events e
               WHERE e.order_id = o.id AND e.to_status = 'cancelled') <= now() - make_interval(days => %(days)s)))
 ORDER BY o.order_number
 LIMIT 1
 FOR UPDATE OF o SKIP LOCKED
"""


def retention_days(conn: psycopg.Connection) -> int | None:
    """روزهای نگهداری، یا None اگر تنظیم نیست یا شکلش درست نیست."""
    row = conn.execute("SELECT value FROM settings WHERE key = %s", (SETTING,)).fetchone()
    value = row[0] if row else None
    if isinstance(value, bool) or not isinstance(value, int) or not MIN_DAYS <= value <= MAX_DAYS:
        return None
    return value


# پیش‌نویس فایل پستی که N روز ثبت نشد: دور انداخته، بی کننده (`discarded_by` null یعنی کارگر).
STALE_IMPORTS_SQL = """
UPDATE shipment_imports
   SET status = 'discarded', discarded_at = now(), raw = NULL, tables = NULL, purged_at = now()
 WHERE status IN ('reading', 'read') AND created_at <= now() - make_interval(days => %(days)s)
"""
# بایت خام و جدول‌های ورودهای دیگر (خوانده نشد، ثبت شد، برگشت).
PURGE_IMPORTS_SQL = """
UPDATE shipment_imports SET raw = NULL, tables = NULL, purged_at = now()
 WHERE purged_at IS NULL AND status NOT IN ('reading', 'read') AND created_at <= now() - make_interval(days => %(days)s)
"""
# متن سطرهایی که مرسولهٔ ما نشدند؛ شماره، بارکد، اعداد و حکم می‌مانند. از ۶٫۲ (تصمیم ۸۸) سطری هم که «هیچ‌کدام» خورد؛ و سطری که
# کدی گرفت، حتی کنارگذاشته یا دستی، هرگز. همان قاعدهٔ تریگر `shipment_import_rows_frozen` (0024)، تا یک سطر آن را نشکند و همه برنگردد.
PURGE_ROWS_SQL = """
UPDATE shipment_import_rows r SET cells = NULL, name_g = NULL, destination = NULL
  FROM shipment_imports i
 WHERE i.id = r.import_id AND i.created_at <= now() - make_interval(days => %(days)s)
   AND (r.verdict IN ('unmatched', 'invalid', 'inactive', 'total') OR r.dismissed_at IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.import_id = r.import_id AND s.row_no = r.row_no)
   AND (r.cells IS NOT NULL OR r.name_g IS NOT NULL OR r.destination IS NOT NULL)
"""


def purge_post_files(conn: psycopg.Connection, days: int) -> tuple[int, int, int]:
    """فایل پست: پیش‌نویس‌های کهنه، بایت خام و جدول‌ها، و متن سطرهای دیگران؛ خروجی شمار هر کدام."""
    try:
        stale = conn.execute(STALE_IMPORTS_SQL, {"days": days}).rowcount
        purged = conn.execute(PURGE_IMPORTS_SQL, {"days": days}).rowcount
        rows = conn.execute(PURGE_ROWS_SQL, {"days": days}).rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    if stale or purged or rows:
        log.info("✓ فایل پست: %s پیش‌نویس دور انداخته، %s فایل خام و %s سطر دیگران پاک شد (%s روز پس از ورود)", stale, purged, rows, days)
    return stale, purged, rows


def sweep(conn: psycopg.Connection, storage: S3Storage, batch: int = BATCH) -> list[int]:
    """فایل‌های سفارش‌های بستهٔ سررسیده، و فایل پست کهنه، را پاک می‌کند؛ خروجی: شمارهٔ همان سفارش‌ها."""
    days = retention_days(conn)
    conn.commit()
    if days is None:
        log.error("✗ تنظیم %s نیست یا شکلش درست نیست؛ هیچ فایل سفارشی پاک نشد.", SETTING)
        return []
    purge_post_files(conn, days)
    purged: list[int] = []
    for _ in range(batch):
        row = conn.execute(DUE_SQL, {"days": days}).fetchone()
        if row is None:
            conn.commit()
            break
        order_id, number = row
        try:
            for stored in storage.list_objects(order_prefix(number)):
                storage.delete(stored.key)
            conn.execute("UPDATE orders SET files_deleted_at = now() WHERE id = %s", (order_id,))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        purged.append(number)
        log.info("✓ فایل‌های سفارش %s پاک شد (%s روز پس از پست یا لغو)", number, days)
    return purged
