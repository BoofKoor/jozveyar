"""
حلقهٔ کارگر اسناد.

    python -m docworker

هر ۲ ثانیه صف را نگاه می‌کند (ADR-004)، یک کار برمی‌دارد، انجامش می‌دهد. کارگر
حالت ندارد: همه‌چیز در پستگرس و استوریج است. پس اضافه کردن کارگر دوم — روی
همین سرور یا نود دیگر — فقط اجرای همین فرمان با همان متغیرهای محیطی است.

متغیرها: DATABASE_URL، S3_ENDPOINT، S3_BUCKET، S3_ACCESS_KEY، S3_SECRET_KEY،
S3_REGION (اختیاری)، DOCWORKER_POLL_SECONDS (اختیاری)، DOCWORKER_KINDS (اختیاری؛
مثلاً `analyze_document` برای نودی که فقط تحلیل کند — پیش‌فرض همهٔ کارها: تبدیل، تحلیل، و از برش ۳ب
ساختن PDF جزوهٔ سفارش پرداخت‌شده)، DOCWORKER_CONVERT_TIMEOUT (اختیاری، ثانیه؛ پیش‌فرض ۳۰۰).
"""

from __future__ import annotations

import logging
import os
import signal
import socket
import time

import psycopg

from . import convert, fonts, queue, sandbox
from .jobs import (
    ANALYZE_DOCUMENT,
    CONVERT_DOCUMENT,
    PermanentFailure,
    analyze_document,
    convert_document,
    mark_document_failed,
)
from .orders import PREPARE_ORDER, prepare_order
from .storage import S3Storage

log = logging.getLogger("docworker")

# اجاره بلندتر از سقف زمانی تحلیل (۲۰ دقیقه) و دو بار تبدیل (۲ × ۵ دقیقه) — کار
# سالم هیچ‌وقت وسط کار دزدیده نمی‌شود.
LEASE_SECONDS = 30 * 60

KINDS = (CONVERT_DOCUMENT, ANALYZE_DOCUMENT, PREPARE_ORDER)
# شکست گذرایی که تلاش‌هایش تمام شد؛ مرورگر برای هر دو پیام فارسی دارد.
EXHAUSTED = {CONVERT_DOCUMENT: "convert_failed", ANALYZE_DOCUMENT: "analysis_failed"}


def kinds_from_env() -> list[str]:
    raw = os.environ.get("DOCWORKER_KINDS", "")
    kinds = [k.strip() for k in raw.split(",") if k.strip()]
    unknown = sorted(set(kinds) - set(KINDS))
    if unknown:
        # غلط تایپی یعنی نودی که هیچ کاری برنمی‌دارد؛ بلند بیفتد، نه بی‌صدا بیکار بماند.
        raise SystemExit(f"DOCWORKER_KINDS ناشناس: {', '.join(unknown)} — مجاز: {', '.join(KINDS)}")
    return kinds or list(KINDS)


class Worker:
    def __init__(self) -> None:
        self.id = f"{socket.gethostname()}-{os.getpid()}"
        self.stopping = False
        self.poll = float(os.environ.get("DOCWORKER_POLL_SECONDS", "2"))
        self.retry_seconds = 10.0
        self.kinds = kinds_from_env()
        self.storage = S3Storage.from_env()
        self.office = convert.LibreOffice()
        # اولین هم‌گام‌سازی فونت همان اول کار؛ بعد هر ده دقیقه، بین کارها.
        self.fonts_due = 0.0

    def stop(self, *_: object) -> None:
        # کار جاری تمام می‌شود؛ اگر داکر زودتر بکشد، اجاره کار را برمی‌گرداند.
        self.stopping = True

    def sync_fonts_if_due(self) -> None:
        """فونت‌های خصوصی باکت (ADR-027). شکستش کار را نگه نمی‌دارد: بدون آنها
        تبدیل با نزدیک‌ترین فونت آزاد انجام می‌شود."""
        now = time.monotonic()
        if now < self.fonts_due:
            return
        self.fonts_due = now + fonts.SYNC_EVERY_SECONDS
        try:
            result = fonts.sync(self.storage)
        except Exception as error:  # noqa: BLE001
            log.warning("فونت‌های خصوصی هم‌گام نشدند: %s", error)
            return
        if result.added or result.removed:
            log.info(
                "فونت‌های خصوصی: %s فونت؛ تازه %s، برداشته %s",
                result.fonts, result.added or "—", result.removed or "—",
            )

    def run_once(self, conn: psycopg.Connection) -> bool:
        """یک کار برمی‌دارد و انجام می‌دهد. false یعنی صف خالی بود."""
        job = queue.claim(conn, self.id, self.kinds, LEASE_SECONDS)
        if job is None:
            return False
        target = f"سفارش {job.order_id}" if job.order_id else f"سند {job.document_id}"
        log.info("کار %s (%s) %s — تلاش %s", job.id, job.kind, target, job.attempts)
        try:
            if job.kind == CONVERT_DOCUMENT:
                result = convert_document(conn, self.storage, self.office, job.document_id)
            elif job.kind == PREPARE_ORDER:
                result = prepare_order(conn, self.storage, job.order_id)
            else:
                result = analyze_document(conn, self.storage, job.document_id)
            queue.complete(conn, job)
            conn.commit()
            log.info("✓ کار %s: %s", job.id, result)
        except PermanentFailure as failure:
            conn.rollback()
            queue.fail(conn, job, f"{failure.code}: {failure}", permanent=True)
            # شکست کار سفارش مال سفارش است، نه سندهایش: سند سالم می‌ماند و پنل (برش ۴) کار شکست‌خورده را
            # با `last_error` نشان می‌دهد.
            if job.document_id:
                mark_document_failed(conn, job.document_id, failure.code)
            conn.commit()
            log.warning("✗ کار %s شکست قطعی: %s", job.id, failure.code)
        except Exception as error:  # noqa: BLE001 — هر خطای دیگری گذرا فرض می‌شود
            conn.rollback()
            final = queue.fail(conn, job, repr(error), permanent=False)
            if final and job.document_id:
                mark_document_failed(conn, job.document_id, EXHAUSTED.get(job.kind, "analysis_failed"))
            conn.commit()
            log.exception("✗ کار %s شکست%s", job.id, " — تلاش‌ها تمام شد" if final else "، دوباره تلاش می‌شود")
        return True

    def run(self) -> None:
        log.info("کارگر اسناد %s بالا آمد", self.id)
        while not self.stopping:
            try:
                with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
                    while not self.stopping:
                        self.sync_fonts_if_due()
                        if not self.run_once(conn):
                            sandbox.reap_orphans()
                            time.sleep(self.poll)
            except psycopg.OperationalError as error:
                # پستگرس ری‌استارت شده یا هنوز بالا نیامده: صبر، بعد اتصال تازه.
                log.warning("پایگاه داده در دسترس نیست: %s", error)
                time.sleep(self.retry_seconds)
            except psycopg.Error as error:
                # پایگاه داده هست ولی آماده نیست — مثلاً جدول `jobs` هنوز ساخته
                # نشده چون اپ وب (که مهاجرت را اجرا می‌کند) هنوز بالا نیامده.
                # این در اولین استقرار واقعاً پیش آمد: کارگر زودتر از وب بالا آمد
                # و با کرش پشت کرش، داکر فاصلهٔ ری‌استارت را هی بیشتر کرد. صبر
                # و تلاش دوباره، نه افتادن.
                log.warning("پایگاه داده آماده نیست (%s) — %s ثانیه دیگر", error, self.retry_seconds)
                time.sleep(self.retry_seconds)
        log.info("کارگر اسناد متوقف شد")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    # پیش از هر کار دیگر: LibreOffice آلوده نباید محیط و حافظهٔ کارگر را بخواند (sandbox.py).
    walls = sandbox.protect_worker()
    if not all(walls.values()):
        log.warning("دیوار کارگر کامل نیست: %s", walls)
    worker = Worker()
    log.info("کارها: %s", ", ".join(worker.kinds))
    signal.signal(signal.SIGTERM, worker.stop)
    signal.signal(signal.SIGINT, worker.stop)
    worker.run()


if __name__ == "__main__":
    main()
