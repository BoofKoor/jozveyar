"""
کارگر روی پستگرس و Garage واقعی — همان دو سرویسی که CI بالا می‌آورد.

بدون `DATABASE_URL` و `S3_ENDPOINT` رد می‌شود (مثل تست‌های TS). پایگاه داده باید
مهاجرت‌شده باشد: در CI، `pnpm test` قبل از این اجرا می‌شود و مهاجرت می‌کند.
"""

import os
import tempfile
import uuid

import pytest

psycopg = pytest.importorskip("psycopg")

from docworker import queue  # noqa: E402
from docworker.__main__ import Worker  # noqa: E402
from docworker.jobs import ANALYZE_DOCUMENT  # noqa: E402
from docworker.storage import S3Storage  # noqa: E402
from tests.test_pdf import GRAPHITE, YELLOW, make_pdf, scan_image  # noqa: E402

ENABLED = all(os.environ.get(k) for k in ("DATABASE_URL", "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"))
pytestmark = pytest.mark.skipif(not ENABLED, reason="DATABASE_URL و S3_* لازم است")


def put_object(storage: S3Storage, key: str, body: bytes) -> None:
    with tempfile.NamedTemporaryFile() as f:
        f.write(body)
        f.flush()
        storage.upload(key, f.name, "application/pdf")


@pytest.fixture
def conn():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c


@pytest.fixture
def worker(monkeypatch):
    monkeypatch.setenv("S3_BUCKET", os.environ.get("S3_BUCKET") or "jozveyar")
    return Worker()


def new_document(conn, storage_key: str) -> str:
    doc_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key,
                                  status, session_hash, uploaded_at)
           VALUES (%s, 'جزوه.pdf', 'pdf', 'application/pdf', 1, %s, 'uploaded', %s, now())""",
        (doc_id, storage_key, "d" * 64),
    )
    conn.execute("INSERT INTO jobs (kind, document_id) VALUES (%s, %s)", (ANALYZE_DOCUMENT, doc_id))
    conn.commit()
    return doc_id


def drain(worker, conn, doc_id):
    """کار همین سند را برمی‌دارد؛ کارهای دیگر صف (از تست‌های قبلی) را هم تمام می‌کند."""
    for _ in range(50):
        if not worker.run_once(conn):
            break
    return conn.execute(
        "SELECT status::text, page_count, failure_reason FROM documents WHERE id = %s", (doc_id,)
    ).fetchone()


def test_scan_is_analyzed_end_to_end(tmp_path, conn, worker):
    path = tmp_path / "scan.pdf"
    red = (230, 40, 40)
    make_pdf(
        str(path),
        [
            scan_image(YELLOW, GRAPHITE),
            scan_image(YELLOW, GRAPHITE, highlight=(40, 100, 200, 160, red)),
            scan_image(YELLOW, GRAPHITE),
        ],
    )
    key = f"uploads/{uuid.uuid4()}.pdf"
    put_object(worker.storage, key, path.read_bytes())
    doc_id = new_document(conn, key)

    status, page_count, reason = drain(worker, conn, doc_id)
    assert (status, page_count, reason) == ("ready", 3, None)

    analysis = conn.execute(
        "SELECT id, engine, page_count, sampled FROM document_analyses WHERE document_id = %s AND source = 'server'",
        (doc_id,),
    ).fetchone()
    assert analysis[1].startswith("server-pymupdf-")
    assert analysis[2:] == (3, False)

    pages = conn.execute(
        "SELECT n, color, paper_cast, warnings FROM document_pages WHERE analysis_id = %s ORDER BY n",
        (analysis[0],),
    ).fetchall()
    assert [p[1] for p in pages] == [False, True, False]
    # اعداد خام ذخیره شده‌اند، نه فقط بولین (قاعدهٔ ۴).
    assert len(pages[0][2]) == 3
    assert "low_dpi" in pages[0][3]

    job = conn.execute("SELECT status::text, attempts FROM jobs WHERE document_id = %s", (doc_id,)).fetchone()
    assert job == ("done", 1)


def test_missing_file_fails_permanently_without_retry(conn, worker):
    doc_id = new_document(conn, f"uploads/{uuid.uuid4()}.pdf")
    status, _, reason = drain(worker, conn, doc_id)
    assert (status, reason) == ("failed", "file_missing")
    job = conn.execute("SELECT status::text, attempts FROM jobs WHERE document_id = %s", (doc_id,)).fetchone()
    assert job == ("failed", 1)


def test_corrupt_pdf_fails_with_clear_reason(conn, worker):
    key = f"uploads/{uuid.uuid4()}.pdf"
    put_object(worker.storage, key, b"%PDF-1.4 not really")
    doc_id = new_document(conn, key)
    status, _, reason = drain(worker, conn, doc_id)
    assert status == "failed"
    assert reason in {"corrupt_file", "no_pages"}


def test_two_workers_never_take_the_same_job(conn):
    drain_all = Worker()
    while drain_all.run_once(conn):
        pass
    doc_id = new_document(conn, f"uploads/{uuid.uuid4()}.pdf")
    with psycopg.connect(os.environ["DATABASE_URL"]) as other:
        first = queue.claim(conn, "a", [ANALYZE_DOCUMENT], 60)
        second = queue.claim(other, "b", [ANALYZE_DOCUMENT], 60)
    assert first is not None and first.document_id == doc_id
    assert second is None


def test_expired_lease_is_taken_again(conn):
    drain_all = Worker()
    while drain_all.run_once(conn):
        pass
    doc_id = new_document(conn, f"uploads/{uuid.uuid4()}.pdf")
    first = queue.claim(conn, "dead-worker", [ANALYZE_DOCUMENT], 60)
    assert first.attempts == 1
    # کارگر مرد؛ اجاره تمام شد.
    conn.execute("UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = %s", (first.id,))
    conn.commit()
    again = queue.claim(conn, "new-worker", [ANALYZE_DOCUMENT], 60)
    assert again.id == first.id and again.attempts == 2
    assert again.document_id == doc_id


def test_transient_failure_backs_off(conn):
    drain_all = Worker()
    while drain_all.run_once(conn):
        pass
    new_document(conn, "x")
    job = queue.claim(conn, "w", [ANALYZE_DOCUMENT], 60)
    assert queue.fail(conn, job, "boom", permanent=False) is False
    conn.commit()
    row = conn.execute(
        "SELECT status::text, run_after > now() + interval '20 seconds' FROM jobs WHERE id = %s", (job.id,)
    ).fetchone()
    assert row == ("queued", True)
    # تا زمان عقب‌نشینی نرسیده، برداشته نمی‌شود.
    assert queue.claim(conn, "w", [ANALYZE_DOCUMENT], 60) is None
