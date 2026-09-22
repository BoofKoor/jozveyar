"""
صف کار روی جدول `jobs` در پستگرس (ADR-004).

`FOR UPDATE SKIP LOCKED` یعنی چند کارگر — امروز یکی روی همین سرور، روزی چند
تا روی نودهای دیگر — بدون هیچ هماهنگی اضافه کنار هم کار برمی‌دارند و هیچ کاری
دو بار برداشته نمی‌شود.

اجاره (`locked_until`): کارگری که وسط کار بمیرد (OOM، ری‌استارت) کار را قفل نگه
نمی‌دارد. بعد از انقضای اجاره، کار دوباره برداشتنی است و یک تلاش حساب می‌شود.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import psycopg


@dataclass
class Job:
    id: int
    kind: str
    document_id: str | None
    payload: dict[str, Any]
    attempts: int
    max_attempts: int


CLAIM_SQL = """
UPDATE jobs
   SET status = 'running',
       attempts = attempts + 1,
       locked_by = %(worker)s,
       locked_until = now() + make_interval(secs => %(lease)s),
       updated_at = now()
 WHERE id = (
        SELECT id FROM jobs
         WHERE kind = ANY(%(kinds)s)
           AND ((status = 'queued' AND run_after <= now())
                OR (status = 'running' AND locked_until < now()))
         ORDER BY run_after, id
         LIMIT 1
         FOR UPDATE SKIP LOCKED)
RETURNING id, kind, document_id::text, payload, attempts, max_attempts
"""


def claim(conn: psycopg.Connection, worker: str, kinds: list[str], lease_seconds: int) -> Job | None:
    with conn.transaction():
        row = conn.execute(
            CLAIM_SQL, {"worker": worker, "kinds": kinds, "lease": lease_seconds}
        ).fetchone()
    return Job(*row) if row else None


def complete(conn: psycopg.Connection, job: Job) -> None:
    conn.execute(
        """UPDATE jobs SET status = 'done', locked_by = NULL, locked_until = NULL,
                  last_error = NULL, finished_at = now(), updated_at = now()
            WHERE id = %s""",
        (job.id,),
    )


def fail(conn: psycopg.Connection, job: Job, error: str, *, permanent: bool) -> bool:
    """شکست. true یعنی کار برای همیشه شکست خورد (دیگر تلاشی نمی‌ماند).

    عقب‌نشینی نمایی: ۳۰ ثانیه، ۲ دقیقه، ۸ دقیقه… — اگر استوریج یا پایگاه داده
    لحظه‌ای افتاده، تلاش بعدی شانس دارد؛ اگر نه، صف را با تلاش بی‌وقفه پر نمی‌کند.
    """
    final = permanent or job.attempts >= job.max_attempts
    if final:
        conn.execute(
            """UPDATE jobs SET status = 'failed', locked_by = NULL, locked_until = NULL,
                      last_error = %s, finished_at = now(), updated_at = now()
                WHERE id = %s""",
            (error[:2000], job.id),
        )
    else:
        conn.execute(
            """UPDATE jobs SET status = 'queued', locked_by = NULL, locked_until = NULL,
                      last_error = %s, updated_at = now(),
                      run_after = now() + make_interval(secs => %s)
                WHERE id = %s""",
            (error[:2000], 30 * 4 ** (job.attempts - 1), job.id),
        )
    return final
