"""
کار سفارش بعد از پرداخت (برش ۳ب؛ ADR-024، ADR-030، ADR-034).

`prepare_order`: بخش‌های هر جزوه به ترتیب صحافی (`order_item_sections.seq`) از استوریج خوانده می‌شوند —
همان PDF یکدستی که تحلیل و قیمت رویش بود (`coalesce(pdf_storage_key, storage_key)`) — و پشت‌سرهم، بی
صفحهٔ سفید بینشان، در یک PDF زیر `orders/<شماره>/jozve-<قلم>.pdf` می‌نشینند. این پیشوند بیرون از قاعدهٔ
نگهداری `uploads/` است: جزوه‌ای که دیرتر از روزهای نگهداری چاپ شود، فایلش را از دست نمی‌دهد.

تعداد صفحهٔ هر بخش با همان شمارش سرور سنجیده می‌شود که قیمت از آن آمد، و جمعشان با صفحه‌های قلم.
اختلاف یعنی چیزی که چاپ می‌شود با چیزی که پولش گرفته شد نمی‌خواند: شکست قطعی و بلند، نه چاپ بی‌صدا.

کلید خروجی قطعی است، پس تلاش دوباره همان فایل را بازنویسی می‌کند و فایل یتیم نمی‌ماند. مثل کارهای سند،
تراکنش آخر را خودش commit نمی‌کند: حلقهٔ کارگر همان تراکنش را با «کار انجام شد» می‌بندد.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile

import fitz  # PyMuPDF
import psycopg

from .jobs import PermanentFailure, download
from .storage import S3Storage

PREPARE_ORDER = "prepare_order"
ORDERS_PREFIX = "orders/"


def print_key(order_number: int, item_seq: int) -> str:
    return f"{ORDERS_PREFIX}{order_number}/jozve-{item_seq}.pdf"


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
    چاپخانه (برش ۵) خودش می‌چیند. خروجی: تعداد صفحه‌های PDF جزوه.
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


def prepare_order(conn: psycopg.Connection, storage: S3Storage, order_id: str) -> dict:
    order = conn.execute(
        "SELECT order_number, status::text FROM orders WHERE id = %s", (order_id,)
    ).fetchone()
    if order is None:
        raise PermanentFailure("order_missing")
    number, status = order
    if status != "paid":
        # کار فقط با پرداخت در صف می‌رود؛ رسیدن به اینجا یعنی چیزی جای دیگر غلط است.
        raise PermanentFailure("order_not_paid")
    items = conn.execute(
        """SELECT id::text, seq, page_count, print_pdf_ready_at IS NOT NULL
             FROM order_items WHERE order_id = %s ORDER BY seq""",
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

    prepared = []
    for item_id, seq, item_pages, ready in items:
        if ready:
            continue  # تلاش قبلی همین قلم را ساخت و ثبت کرد
        parts = [(pages, key, deleted) for owner, pages, key, deleted in sections if owner == item_id]
        if not parts:
            raise PermanentFailure("sections_missing")
        if any(deleted or not key for _, key, deleted in parts):
            raise PermanentFailure("file_missing")
        with tempfile.TemporaryDirectory(prefix="docworker-order-") as workdir:
            paths = []
            for index, (_, key, _) in enumerate(parts, start=1):
                path = os.path.join(workdir, f"{index}.pdf")
                download(storage, key, path)
                paths.append(path)
            out = os.path.join(workdir, "jozve.pdf")
            pages = merge_sections(paths, [p for p, _, _ in parts], out)
            if pages != item_pages:
                raise PermanentFailure("page_count_mismatch", f"جزوه {pages} صفحه شد، قلم {item_pages}")
            size = os.path.getsize(out)
            digest = _sha256(out)
            key = print_key(number, seq)
            storage.upload(key, out, "application/pdf")
        conn.execute(
            """UPDATE order_items
                  SET print_pdf_key = %s, print_pdf_bytes = %s, print_pdf_sha256 = %s, print_pdf_ready_at = now()
                WHERE id = %s AND print_pdf_ready_at IS NULL""",
            (key, size, digest, item_id),
        )
        prepared.append({"seq": seq, "key": key, "pages": pages, "bytes": size})
    return {"orderNumber": number, "items": prepared}
