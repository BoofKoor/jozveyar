"""
کارهای کارگر روی یک سند (ADR-025، ADR-028).

- `convert_document`: Word، پاورپوینت یا عکس ← PDF، کنار فایل اصلی در استوریج؛
  بعد همان سند در صف تحلیل.
- `analyze_document`: PDF (اصلی یا تبدیل‌شده) را بخوان، همهٔ صفحات را تحلیل کن،
  ثبت کن.

وضعیت سند: `uploaded` ← (`converting` ←) `analyzing` ← `ready` یا `failed`. مرورگر
همین وضعیت را از `GET /api/uploads/:id` می‌خواند و قیمت را با عدد سرور هم‌تراز می‌کند.

هیچ کاری تراکنش آخرش را خودش commit نمی‌کند: حلقهٔ کارگر همان تراکنش را با «کار
انجام شد» می‌بندد. یا هر دو ثبت می‌شوند یا هیچ‌کدام — کارگری که وسط راه بمیرد،
کار را دوباره برمی‌دارد و کار دوباره همان نتیجه را می‌دهد.
"""

from __future__ import annotations

import json
import os
import tempfile

import psycopg
from psycopg.types.json import Jsonb

from . import convert, formats
from .analysis import DEFAULT_THRESHOLDS
from .pdf import AnalysisFailure, analyze_pdf
from .storage import S3Storage, StorageError

ANALYZE_DOCUMENT = "analyze_document"
CONVERT_DOCUMENT = "convert_document"


class PermanentFailure(Exception):
    """تلاش دوباره فایده ندارد؛ سند با همین `code` شکست می‌خورد."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def thresholds(conn: psycopg.Connection) -> dict[str, float]:
    """آستانه‌ها از `settings` (کلید `detection.thresholds`)، روی پیش‌فرض قرارداد.

    تنظیم آستانه از پنل ادمین نباید دیپلوی لازم داشته باشد (ADR-009).
    """
    row = conn.execute("SELECT value FROM settings WHERE key = 'detection.thresholds'").fetchone()
    merged = dict(DEFAULT_THRESHOLDS)
    if row and isinstance(row[0], dict):
        merged.update({k: v for k, v in row[0].items() if k in merged})
    return merged


def queue_job(conn: psycopg.Connection, kind: str, document_id: str) -> None:
    """کار بعدی همان سند. کاری از همین نوع که قبلاً تمام شده دوباره در صف می‌رود —
    مثلاً تحلیلی که فهمید فایل PDF نیست و راه را به تبدیل داد؛ کار زنده دست نمی‌خورد."""
    conn.execute(
        """INSERT INTO jobs (kind, document_id) VALUES (%s, %s)
           ON CONFLICT (document_id, kind) DO UPDATE
              SET status = 'queued', attempts = 0, run_after = now(), locked_by = NULL,
                  locked_until = NULL, last_error = NULL, finished_at = NULL, updated_at = now()
            WHERE jobs.status IN ('done', 'failed')""",
        (kind, document_id),
    )


def converted_key(storage_key: str) -> str:
    """PDF تبدیل‌شده کنار فایل اصلی، زیر همان پیشوند `uploads/`: قاعدهٔ نگهداری باکت
    (۲ روز) آن را هم پاک می‌کند، حتی اگر هیچ کد پاک‌سازی از ما اجرا نشود."""
    stem, _ = os.path.splitext(storage_key)
    return f"{stem}.converted.pdf"


def _download(storage: S3Storage, key: str, path: str) -> None:
    try:
        storage.download(key, path)
    except StorageError as error:
        if error.missing:
            raise PermanentFailure("file_missing", str(error)) from error
        raise


def convert_document(
    conn: psycopg.Connection, storage: S3Storage, office: convert.LibreOffice, document_id: str
) -> dict:
    doc = conn.execute(
        """SELECT storage_key, status::text, file_deleted_at, conversion
             FROM documents WHERE id = %s""",
        (document_id,),
    ).fetchone()
    if doc is None:
        raise PermanentFailure("document_missing")
    storage_key, status, deleted_at, conversion = doc
    if conversion is not None or status == "ready":
        # کارگر قبلی تبدیل را ثبت کرد و پیش از بستن کار مرد؛ تحلیل همان‌جا در صف رفت.
        return {"skipped": "already_converted"}
    if status not in ("uploaded", "converting"):
        return {"skipped": status}  # مثلاً کاربر انصراف داد
    if deleted_at is not None or not storage_key:
        raise PermanentFailure("file_missing")

    conn.execute(
        "UPDATE documents SET status = 'converting' WHERE id = %s AND status IN ('uploaded', 'converting')",
        (document_id,),
    )
    conn.commit()

    # فایل موقت روی دیسک، نه حافظه؛ همه‌چیز با همین پوشه پاک می‌شود.
    with tempfile.TemporaryDirectory(prefix="docworker-") as workdir:
        source = os.path.join(workdir, "upload")
        _download(storage, storage_key, source)
        try:
            result = convert.to_pdf(source, workdir, office)
        except convert.ConversionFailure as failure:
            raise PermanentFailure(failure.code, str(failure)) from failure
        pdf_key = pdf_bytes = None
        if result.converted:
            pdf_key = converted_key(storage_key)
            pdf_bytes = os.path.getsize(result.pdf_path)
            storage.upload(pdf_key, result.pdf_path, "application/pdf")

    row = conn.execute(
        """UPDATE documents
              SET status = 'analyzing', pdf_storage_key = %s, pdf_size_bytes = %s, conversion = %s
            WHERE id = %s AND status = 'converting'
        RETURNING id""",
        (pdf_key, pdf_bytes, Jsonb(result.record()), document_id),
    ).fetchone()
    if row is None:
        # کاربر وسط تبدیل انصراف داد (یا آپلود منقضی شد): PDF تازه نماند.
        if pdf_key:
            storage.delete(pdf_key)
        return {"skipped": "document_changed"}
    queue_job(conn, ANALYZE_DOCUMENT, document_id)
    return {
        "format": result.format,
        "engine": result.engine,
        "elapsedMs": result.elapsed_ms,
        "pdfBytes": pdf_bytes,
    }


def _reroute_to_conversion(conn: psycopg.Connection, document_id: str) -> dict:
    conn.execute(
        "UPDATE documents SET status = 'uploaded' WHERE id = %s AND status IN ('uploaded', 'analyzing')",
        (document_id,),
    )
    queue_job(conn, CONVERT_DOCUMENT, document_id)
    return {"rerouted": CONVERT_DOCUMENT}


def analyze_document(conn: psycopg.Connection, storage: S3Storage, document_id: str) -> dict:
    doc = conn.execute(
        """SELECT coalesce(pdf_storage_key, storage_key), source_kind::text, status::text,
                  file_deleted_at, conversion
             FROM documents WHERE id = %s""",
        (document_id,),
    ).fetchone()
    if doc is None:
        raise PermanentFailure("document_missing")
    key, source_kind, status, deleted_at, conversion = doc
    if status == "ready":
        return {"skipped": "already_ready"}
    if deleted_at is not None or not key:
        raise PermanentFailure("file_missing")
    if source_kind != "pdf" and conversion is None:
        return _reroute_to_conversion(conn, document_id)  # Word یا عکسی که هنوز تبدیل نشده

    # آستانه‌ها قبل از commit: تحلیل طولانی تراکنش بازی نگه نمی‌دارد.
    limits = thresholds(conn)
    conn.execute(
        "UPDATE documents SET status = 'analyzing' WHERE id = %s AND status IN ('uploaded', 'analyzing')",
        (document_id,),
    )
    conn.commit()

    # فایل موقت روی دیسک، نه حافظه: فایل ۱٫۵ گیگابایتی نباید کانتینر را بکشد.
    with tempfile.TemporaryDirectory(prefix="docworker-") as workdir:
        path = os.path.join(workdir, "source.pdf")
        _download(storage, key, path)
        if conversion is None:
            # پسوند فقط ادعای کاربر است: «جزوه.pdf» که در واقع Word یا عکس است و
            # مرورگر نتوانست بخواندش، بی‌صدا به تبدیل می‌رود.
            actual = formats.sniff(path)
            if actual == formats.ENCRYPTED:
                raise PermanentFailure("password_protected")
            if actual in formats.CONVERTIBLE:
                return _reroute_to_conversion(conn, document_id)
        try:
            analysis = analyze_pdf(path, limits)
        except AnalysisFailure as failure:
            raise PermanentFailure(failure.code, str(failure)) from failure

    save_analysis(conn, document_id, analysis)
    return {"pageCount": analysis["pageCount"], "elapsedMs": analysis["elapsedMs"]}


def save_analysis(conn: psycopg.Connection, document_id: str, analysis: dict) -> None:
    """تحلیل، صفحه‌ها، و وضعیت سند — همه در تراکنشی که حلقهٔ کارگر با «کار انجام شد» می‌بندد."""
    analysis_id = conn.execute(
        """INSERT INTO document_analyses
               (document_id, source, engine, thresholds, page_count, sampled, sample_stride, elapsed_ms)
           VALUES (%s, 'server', %s, %s, %s, %s, %s, %s)
           RETURNING id""",
        (
            document_id,
            analysis["engine"],
            Jsonb(analysis["thresholds"]),
            analysis["pageCount"],
            analysis["sampled"],
            analysis["sampleStride"],
            analysis["elapsedMs"],
        ),
    ).fetchone()[0]

    # COPY: ۱۵۰۰ صفحه در یک رفت‌وبرگشت، نه ۱۵۰۰ INSERT.
    with conn.cursor().copy(
        """COPY document_pages
               (analysis_id, n, width_pt, height_pt, rotation, color, blank, color_ratio,
                colored_ink_ratio, chroma_p95, ink_ratio, paper_cast, estimated_dpi,
                min_margin_mm, warnings)
           FROM STDIN"""
    ) as copy:
        for p in analysis["pages"]:
            copy.write_row(
                (
                    analysis_id, p["n"], p["widthPt"], p["heightPt"], p["rotation"],
                    p["color"], p["blank"], p["colorRatio"], p["coloredInkRatio"],
                    p["chromaP95"], p["inkRatio"], json.dumps(p["paperCast"]),
                    p["estimatedDpi"], p["minMarginMm"], p["warnings"],
                )
            )

    conn.execute(
        "UPDATE documents SET status = 'ready', page_count = %s, failure_reason = NULL WHERE id = %s",
        (analysis["pageCount"], document_id),
    )


def mark_document_failed(conn: psycopg.Connection, document_id: str, code: str) -> None:
    # سندی که قبلاً شکست خورده (مثلاً کاربر انصراف داد و فایلش پاک شد) دلیل خودش را
    # نگه می‌دارد؛ «فایل نیست» کار بعدی آن را نمی‌پوشاند.
    conn.execute(
        """UPDATE documents SET status = 'failed', failure_reason = %s
            WHERE id = %s AND status NOT IN ('ready', 'failed')""",
        (code, document_id),
    )
