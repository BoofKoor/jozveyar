"""
کار سفارش بعد از پرداخت (برش ۳ب؛ ADR-024، ADR-030، ADR-034؛ از برش ۵٫۱ ADR-043).

`prepare_order`، برای هر جزوه:

1. **PDF جزوه:** بخش‌ها به ترتیب صحافی (`order_item_sections.seq`) از استوریج خوانده می‌شوند — همان PDF یکدستی که
   تحلیل و قیمت رویش بود (`coalesce(pdf_storage_key, storage_key)`) — و پشت‌سرهم، بی صفحهٔ سفید بینشان، در یک PDF زیر
   `orders/<شماره>/jozve-<قلم>.pdf` می‌نشینند. این پیشوند بیرون از قاعدهٔ نگهداری `uploads/` است: جزوه‌ای که دیرتر از
   روزهای نگهداری چاپ شود، فایلش را از دست نمی‌دهد (ADR-044 آن را N روز پس از پست یا لغو پاک می‌کند).
2. **فایل چاپ هر جلد** (`printfile.py`): از روی همان PDF جزوه، A4 عمودی، جلدها با ریز قیمت منجمد. جزوه‌ای که هیچ صفحه‌اش
   عوض نمی‌شود و یک جلد است، فایل چاپش خود PDF جزوه است، بی کپی دوم؛ بقیه زیر `orders/<شماره>/print-<قلم>-<جلد>.pdf`.

تعداد صفحهٔ هر بخش با همان شمارش سرور سنجیده می‌شود که قیمت از آن آمد، جمعشان با صفحه‌های قلم، و صفحه‌های هر جلد با
بازه‌اش. اختلاف یعنی چیزی که چاپ می‌شود با چیزی که پولش گرفته شد نمی‌خواند: شکست قطعی و بلند، نه چاپ بی‌صدا.

PDF جزوه به محض ساخته شدن ثبت می‌شود و فایل‌های چاپ هر جزوه با هم: فایل‌های `uploads/` دو روز می‌مانند، پس جزوه‌ای که PDFش
ساخته شد، اگر ساختن فایل چاپ شکست خورد، با «دوباره بساز» از همان PDF جزوه ادامه می‌دهد. جزوه‌ای که هر دو را دارد دوباره
ساخته نمی‌شود. کلیدها قطعی‌اند، پس تلاش دوباره همان فایل را بازنویسی می‌کند و فایل یتیم نمی‌ماند؛ حلقهٔ کارگر کار را با
«انجام شد» می‌بندد.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile

import fitz  # PyMuPDF
import psycopg
from psycopg.types.json import Jsonb

from . import printfile
from .jobs import PermanentFailure, download
from .storage import S3Storage

PREPARE_ORDER = "prepare_order"
ORDERS_PREFIX = "orders/"

# وضعیت‌هایی که چاپشان هنوز پیش روست (برش ۴٫۳، ADR-039): «در صف چاپ» و «در حال چاپ». پنل «شروع چاپ» را پیش از
# آماده شدن فایل چاپ نمی‌زند، ولی اگر کار دیرتر برسد (تلاش دوباره، «دوباره بساز») سفارشِ در حال چاپ هم فایل می‌گیرد.
PRINTABLE = ("paid", "printing")
# پیش از پرداخت: کار فقط با پرداخت در صف می‌رود.
UNPAID = ("awaiting_payment", "expired")


def print_key(order_number: int, item_seq: int) -> str:
    """PDF جزوه (نام از برش ۳ب مانده: «فایلی که به چاپ می‌رود»)."""
    return f"{ORDERS_PREFIX}{order_number}/jozve-{item_seq}.pdf"


def volume_key(order_number: int, item_seq: int, volume: int) -> str:
    """فایل چاپ یک جلد، وقتی چیزی عوض شده یا جزوه چند جلد است."""
    return f"{ORDERS_PREFIX}{order_number}/print-{item_seq}-{volume}.pdf"


def order_prefix(order_number: int) -> str:
    """همهٔ فایل‌های یک سفارش؛ `/` آخر: پیشوند 1000 سفارش 10001 را نمی‌گیرد."""
    return f"{ORDERS_PREFIX}{order_number}/"


def _page_count(path: str) -> int:
    try:
        with fitz.open(path) as doc:
            if doc.needs_pass and not doc.authenticate(""):
                raise PermanentFailure("password_protected")
            return doc.page_count
    except PermanentFailure:
        raise
    except Exception as error:  # noqa: BLE001 — PyMuPDF انواع مختلف خطا می‌دهد
        raise PermanentFailure("corrupt_file", str(error)) from error


def merge_sections(paths: list[str], expected_pages: list[int], out_path: str) -> int:
    """بخش‌ها پشت‌سرهم در یک PDF. هر بخش باید همان صفحه‌هایی را داشته باشد که سرور شمرد.

    یک بخش عیناً همان فایل است، بایت‌به‌بایت: بازنویسی چیزی به چاپ اضافه نمی‌کند و فقط خطر عوض شدن
    چیزی را دارد. چند بخش با `insert_pdf` پشت‌سرهم می‌آیند؛ اندازه‌ها و جهت هر صفحه همان می‌ماند و
    فایل چاپ (برش ۵٫۱) آنها را روی A4 می‌چیند. خروجی: تعداد صفحه‌های PDF جزوه.
    """
    if len(paths) != len(expected_pages) or not paths:
        raise PermanentFailure("sections_mismatch")
    for index, (path, pages) in enumerate(zip(paths, expected_pages), start=1):
        found = _page_count(path)
        if found != pages:
            raise PermanentFailure("page_count_mismatch", f"بخش {index}: {found} صفحه، سرور {pages} شمرده بود")
    if len(paths) == 1:
        shutil.copyfile(paths[0], out_path)
        return expected_pages[0]

    merged = fitz.open()
    try:
        for path in paths:
            with fitz.open(path) as source:
                if source.needs_pass:
                    source.authenticate("")
                merged.insert_pdf(source)
        merged.save(out_path)
        return merged.page_count
    finally:
        merged.close()


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def plan_volumes(breakdown: object, seq: int, page_count: int, sides_mode: str) -> list[tuple[int, int]]:
    """بازهٔ جلدهای قلم `seq` از ریز قیمت منجمد سفارش (`items[seq - 1].sheetsPerVolume`)."""
    items = breakdown.get("items") if isinstance(breakdown, dict) else None
    item = items[seq - 1] if isinstance(items, list) and 0 < seq <= len(items) else None
    if not isinstance(item, dict) or not isinstance(item.get("sheetsPerVolume"), list):
        raise PermanentFailure("breakdown_missing", f"قلم {seq} در ریز قیمت جلد ندارد")
    if item.get("pageCount") != page_count:
        raise PermanentFailure("breakdown_mismatch", f"ریز قیمت {item.get('pageCount')} صفحه، قلم {page_count}")
    return printfile.volume_ranges(page_count, sides_mode, item["sheetsPerVolume"])


def build_print_files(jozve_path: str, ranges: list[tuple[int, int]], workdir: str) -> list[dict]:
    """فایل چاپ هر جلد از روی PDF جزوه. `path` null یعنی فایل چاپ خود PDF جزوه است (یک جلد، بی تغییر)."""
    with fitz.open(jozve_path) as doc:
        if doc.needs_pass:
            doc.authenticate("")
        if doc.page_count != ranges[-1][1]:
            raise PermanentFailure("page_count_mismatch", f"PDF جزوه {doc.page_count} صفحه، جلدها {ranges[-1][1]}")
        states = printfile.page_states(doc)
        if len(ranges) == 1 and not any(state.changed for state in states):
            return [{"volume": 1, "first": 1, "last": ranges[0][1], "path": None, "changes": None}]
        if any(state.annotated for state in states):
            doc.bake()
        files = []
        for volume, (first, last) in enumerate(ranges, start=1):
            path = os.path.join(workdir, f"print-{volume}.pdf")
            pages = printfile.build_volume(doc, states, first, last, path)
            if pages != last - first + 1:
                raise PermanentFailure("page_count_mismatch", f"جلد {volume} {pages} صفحه شد، بازه‌اش {last - first + 1}")
            files.append(
                {"volume": volume, "first": first, "last": last, "path": path, "changes": printfile.changes_of(states, first, last)}
            )
    # شمار صفحهٔ هر فایل از خود فایل ذخیره‌شده، نه از سندی که ساختش.
    for file in files:
        if _page_count(file["path"]) != file["last"] - file["first"] + 1:
            raise PermanentFailure("page_count_mismatch", f"جلد {file['volume']} پس از ذخیره")
    return files


def prepare_order(conn: psycopg.Connection, storage: S3Storage, order_id: str) -> dict:
    order = conn.execute(
        "SELECT order_number, status::text, price_breakdown FROM orders WHERE id = %s", (order_id,)
    ).fetchone()
    if order is None:
        raise PermanentFailure("order_missing")
    number, status, breakdown = order
    if status in UNPAID:
        # کار فقط با پرداخت در صف می‌رود؛ رسیدن به اینجا یعنی چیزی جای دیگر غلط است.
        raise PermanentFailure("order_not_paid")
    if status not in PRINTABLE:
        # لغو شد یا به پست رسید: جزوه‌ای چاپ نمی‌شود، پس فایل مشتری هم زیر `orders/` کپی نمی‌شود. اگر لغو برگردانده
        # شود، «دوباره بساز» پنل همین کار را از نو در صف می‌گذارد.
        raise PermanentFailure("order_closed", status)
    items = conn.execute(
        """SELECT i.id::text, i.seq, i.page_count, i.sides_mode::text, i.print_pdf_key, i.print_pdf_sha256,
                  i.print_pdf_ready_at IS NOT NULL,
                  EXISTS (SELECT 1 FROM order_print_files f WHERE f.order_item_id = i.id)
             FROM order_items i WHERE i.order_id = %s ORDER BY i.seq""",
        (order_id,),
    ).fetchall()
    sections = conn.execute(
        """SELECT s.order_item_id::text, s.page_count, coalesce(d.pdf_storage_key, d.storage_key),
                  d.file_deleted_at IS NOT NULL
             FROM order_item_sections s
             JOIN order_items i ON i.id = s.order_item_id
             JOIN documents d ON d.id = s.document_id
            WHERE i.order_id = %s
            ORDER BY i.seq, s.seq""",
        (order_id,),
    ).fetchall()
    # پیش از دانلود و ادغام: کار طولانی تراکنش بازی نگه نمی‌دارد.
    conn.commit()
    # ریز قیمت پیش از هر دانلودی: جلدبندی‌ای که نمی‌خواند، چیزی نمی‌سازد.
    plans = {item_id: plan_volumes(breakdown, seq, pages, sides) for item_id, seq, pages, sides, *_ in items}

    prepared = []
    for item_id, seq, item_pages, _, jozve_key, jozve_sha, jozve_ready, printed in items:
        if jozve_ready and printed:
            continue  # تلاش قبلی همین قلم را ساخت و ثبت کرد
        with tempfile.TemporaryDirectory(prefix="docworker-order-") as workdir:
            jozve = os.path.join(workdir, "jozve.pdf")
            if jozve_ready:
                # PDF جزوه از تلاش قبلی (یا پیش از ۵٫۱)؛ فایل‌های `uploads/` شاید دیگر نباشند.
                download(storage, jozve_key, jozve)
                if _sha256(jozve) != jozve_sha:
                    raise PermanentFailure("file_mismatch", f"PDF جزوهٔ قلم {seq} همان که ثبت شد نیست")
            else:
                parts = [(pages, key, deleted) for owner, pages, key, deleted in sections if owner == item_id]
                if not parts:
                    raise PermanentFailure("sections_missing")
                if any(deleted or not key for _, key, deleted in parts):
                    raise PermanentFailure("file_missing")
                paths = []
                for index, (_, key, _) in enumerate(parts, start=1):
                    path = os.path.join(workdir, f"{index}.pdf")
                    download(storage, key, path)
                    paths.append(path)
                pages = merge_sections(paths, [p for p, _, _ in parts], jozve)
                if pages != item_pages:
                    raise PermanentFailure("page_count_mismatch", f"جزوه {pages} صفحه شد، قلم {item_pages}")
                jozve_key, jozve_sha = print_key(number, seq), _sha256(jozve)
                storage.upload(jozve_key, jozve, "application/pdf")
                conn.execute(
                    """UPDATE order_items
                          SET print_pdf_key = %s, print_pdf_bytes = %s, print_pdf_sha256 = %s, print_pdf_ready_at = now()
                        WHERE id = %s AND print_pdf_ready_at IS NULL""",
                    (jozve_key, os.path.getsize(jozve), jozve_sha, item_id),
                )
                conn.commit()

            volumes = []
            for file in build_print_files(jozve, plans[item_id], workdir):
                if file["path"] is None:
                    key, path = jozve_key, jozve
                else:
                    key, path = volume_key(number, seq, file["volume"]), file["path"]
                    storage.upload(key, path, "application/pdf")
                volumes.append({**file, "key": key, "bytes": os.path.getsize(path), "sha256": _sha256(path)})
        # همهٔ جلدها با هم؛ محافظ معوق `order_print_files_cover` پوشش را در همین COMMIT می‌سنجد.
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO order_print_files
                          (order_item_id, volume, first_page, last_page, storage_key, size_bytes, sha256, changes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                [
                    (item_id, v["volume"], v["first"], v["last"], v["key"], v["bytes"], v["sha256"],
                     Jsonb(v["changes"]) if v["changes"] else None)
                    for v in volumes
                ],
            )
        conn.commit()
        prepared.append({"seq": seq, "pages": item_pages, "volumes": [(v["first"], v["last"], v["key"]) for v in volumes]})
    return {"orderNumber": number, "items": prepared}
