"""
کار `analyze_document`: فایل را از استوریج بخوان، همهٔ صفحات را تحلیل کن، ثبت کن.

وضعیت سند: `uploaded` ← `analyzing` ← `ready` یا `failed`. مرورگر همین وضعیت را
از `GET /api/uploads/:id` می‌خواند و قیمت را با عدد سرور هم‌تراز می‌کند.
"""

from __future__ import annotations

import json
import os
import tempfile

import psycopg
from psycopg.types.json import Jsonb

from .analysis import DEFAULT_THRESHOLDS
from .pdf import AnalysisFailure, analyze_pdf
from .storage import S3Storage, StorageError

ANALYZE_DOCUMENT = "analyze_document"


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


def analyze_document(conn: psycopg.Connection, storage: S3Storage, document_id: str) -> dict:
    doc = conn.execute(
        """SELECT storage_key, source_kind::text, status::text, file_deleted_at
             FROM documents WHERE id = %s""",
        (document_id,),
    ).fetchone()
    if doc is None:
        raise PermanentFailure("document_missing")
    storage_key, source_kind, status, deleted_at = doc
    if status == "ready":
        return {"skipped": "already_ready"}
    if deleted_at is not None or not storage_key:
        raise PermanentFailure("file_missing")
    if source_kind != "pdf":
        # Word، پاورپوینت و عکس: تبدیل با LibreOffice در برش ۲ب.
        raise PermanentFailure("unsupported_kind", source_kind)

    conn.execute(
        "UPDATE documents SET status = 'analyzing' WHERE id = %s AND status IN ('uploaded', 'analyzing')",
        (document_id,),
    )
    conn.commit()

    limits = thresholds(conn)
    # فایل موقت روی دیسک، نه حافظه: فایل ۱٫۵ گیگابایتی نباید کانتینر را بکشد.
    with tempfile.TemporaryDirectory(prefix="docworker-") as workdir:
        path = os.path.join(workdir, "source.pdf")
        try:
            storage.download(storage_key, path)
        except StorageError as error:
            if error.missing:
                raise PermanentFailure("file_missing", str(error)) from error
            raise
        try:
            analysis = analyze_pdf(path, limits)
        except AnalysisFailure as failure:
            raise PermanentFailure(failure.code, str(failure)) from failure

    save_analysis(conn, document_id, analysis)
    return {"pageCount": analysis["pageCount"], "elapsedMs": analysis["elapsedMs"]}


def save_analysis(conn: psycopg.Connection, document_id: str, analysis: dict) -> None:
    """تحلیل، صفحه‌ها، و وضعیت سند — همه در یک تراکنش."""
    with conn.transaction():
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
    conn.execute(
        "UPDATE documents SET status = 'failed', failure_reason = %s WHERE id = %s AND status <> 'ready'",
        (code, document_id),
    )
