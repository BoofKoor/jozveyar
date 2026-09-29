"""
کار `read_post_file` (برش ۶٫۱، ADR-045): بایت خام فایل پست ← جدول رشته‌ها، در همان ردیف `shipment_imports`.

کارگر فقط می‌خواند و تفسیر نمی‌کند: کدام ستون بارکد است، کد سفارش و حکم هر سطر همه در پنل‌اند (`packages/db/src/postfile.ts`)،
پس برابری دو زبان لازم نیست. خواندن با کتابخانهٔ استاندارد پایتون است (`postfile.py`)، بی وابستگی تازه و بی ایمیج پایهٔ تازه.

- فایلی که خوانده نمی‌شود شکست کار نیست: ورود «خوانده نشد» با کدش (`xls_binary`، `no_table`…) و کار «انجام شد»؛ پنل پیام روشنش
  را دارد.
- هر نوشتن فقط از «در حال خواندن» (`WHERE status = 'reading'`): ورودی که همین حالا دور انداخته شد، دست نمی‌خورد و کار بی‌اثر تمام
  می‌شود. خطای دیگری (گذرا) دوباره امتحان می‌شود؛ و پس از آخرین تلاش، ورود «خوانده نشد» با `read_failed` (`mark_import_failed`)،
  تا صفحه‌اش تا ابد «در حال خواندن» نماند.
"""

from __future__ import annotations

import psycopg
from psycopg.types.json import Jsonb

from . import postfile

READ_POST_FILE = "read_post_file"
# خطای کارگر پس از آخرین تلاش؛ همان فهرست کدهای پنل (`shipment_imports.error_code`).
READ_FAILED = "read_failed"


def read_post_file(conn: psycopg.Connection, import_id: str | None) -> str:
    """جدول‌های فایل پست یک ورود؛ خروجی فقط برای لاگ است، بی محتوای فایل."""
    if not import_id:
        raise ValueError("کار read_post_file ورود ندارد")
    row = conn.execute(
        "SELECT raw FROM shipment_imports WHERE id = %s AND status = 'reading'", (import_id,)
    ).fetchone()
    if row is None or row[0] is None:
        return "ورود دیگر «در حال خواندن» نیست"
    try:
        fmt, tables = postfile.read_post_file(bytes(row[0]))
    except postfile.PostFileError as error:
        conn.execute(
            """UPDATE shipment_imports SET status = 'unreadable', error_code = %s, read_at = now()
                WHERE id = %s AND status = 'reading'""",
            (error.code, import_id),
        )
        return f"خوانده نشد: {error.code}"
    conn.execute(
        """UPDATE shipment_imports SET status = 'read', format = %s, tables = %s, read_at = now()
            WHERE id = %s AND status = 'reading'""",
        (fmt, Jsonb(tables), import_id),
    )
    return f"خوانده شد: {fmt}، {len(tables)} جدول، {sum(len(t) for t in tables)} سطر"


def mark_import_failed(conn: psycopg.Connection, import_id: str) -> None:
    """آخرین تلاش هم شکست خورد: «خوانده نشد» با `read_failed`، فقط اگر هنوز «در حال خواندن» است."""
    conn.execute(
        """UPDATE shipment_imports SET status = 'unreadable', error_code = %s, read_at = now()
            WHERE id = %s AND status = 'reading'""",
        (READ_FAILED, import_id),
    )
