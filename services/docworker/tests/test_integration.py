"""
کارگر روی پستگرس و Garage واقعی — همان دو سرویسی که CI بالا می‌آورد.

بدون `DATABASE_URL` و `S3_ENDPOINT` رد می‌شود (مثل تست‌های TS). پایگاه داده باید
مهاجرت‌شده باشد: در CI، `pnpm test` قبل از این اجرا می‌شود و مهاجرت می‌کند.
"""

import io
import os
import shutil
import tempfile
import uuid

import pytest

psycopg = pytest.importorskip("psycopg")

from docworker import convert, queue  # noqa: E402
from docworker.__main__ import Worker  # noqa: E402
from docworker.jobs import ANALYZE_DOCUMENT, CONVERT_DOCUMENT, convert_document  # noqa: E402
from docworker.storage import S3Storage  # noqa: E402
from tests.samples import docx_paragraph, make_docx, make_ole, make_zip, persian_text, word97_stream  # noqa: E402
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


def new_document(conn, storage_key: str, kind: str = "pdf", doc_id: str | None = None) -> str:
    """سند رسیده، با همان کاری که سرویس آپلود در صف می‌گذارد: PDF تحلیل، بقیه تبدیل."""
    doc_id = doc_id or str(uuid.uuid4())
    conn.execute(
        """INSERT INTO documents (id, original_name, source_kind, mime_type, size_bytes, storage_key,
                                  status, session_hash, uploaded_at)
           VALUES (%s, %s, %s, 'application/octet-stream', 1, %s, 'uploaded', %s, now())""",
        (doc_id, f"جزوه.{kind}", kind, storage_key, "d" * 64),
    )
    job = ANALYZE_DOCUMENT if kind == "pdf" else CONVERT_DOCUMENT
    conn.execute("INSERT INTO jobs (kind, document_id) VALUES (%s, %s)", (job, doc_id))
    conn.commit()
    return doc_id


def upload_document(conn, storage: S3Storage, kind: str, ext: str, body: bytes) -> tuple[str, str]:
    doc_id = str(uuid.uuid4())
    key = f"uploads/{doc_id}.{ext}"
    put_object(storage, key, body)
    return new_document(conn, key, kind, doc_id), key


def jobs_of(conn, doc_id):
    return dict(
        (kind, (status, attempts))
        for kind, status, attempts in conn.execute(
            "SELECT kind, status::text, attempts FROM jobs WHERE document_id = %s", (doc_id,)
        ).fetchall()
    )


def conversion_of(conn, doc_id):
    return conn.execute(
        "SELECT pdf_storage_key, pdf_size_bytes, conversion FROM documents WHERE id = %s", (doc_id,)
    ).fetchone()


def stored_keys(storage: S3Storage, doc_id: str) -> set[str]:
    return {o.key for o in storage.list_objects(f"uploads/{doc_id}")}


def photo() -> bytes:
    image = pytest.importorskip("PIL.Image")
    pytest.importorskip("pillow_heif")
    buffer = io.BytesIO()
    image.new("RGB", (1240, 1754), (250, 240, 200)).save(buffer, "JPEG", quality=85)
    return buffer.getvalue()


def pdf_bytes(tmp_path) -> bytes:
    path = tmp_path / "scan.pdf"
    make_pdf(str(path), [scan_image(YELLOW, GRAPHITE), scan_image(YELLOW, GRAPHITE)])
    return path.read_bytes()


IN_BASE_IMAGE = bool(shutil.which("soffice")) and os.path.exists("/etc/fonts/conf.d/61-jozveyar-aliases.conf")


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


# ── تبدیل (ADR-028) ─────────────────────────────────────────────────────────


@pytest.mark.skipif(not IN_BASE_IMAGE, reason="فقط داخل ایمیج پایهٔ کارگر")
def test_word_is_converted_then_analyzed_end_to_end(tmp_path, conn, worker):
    source = tmp_path / "jozve.docx"
    make_docx(str(source), [docx_paragraph(persian_text(i + 1, 40), "B Nazanin") for i in range(40)], app_pages=4)
    doc_id, key = upload_document(conn, worker.storage, "docx", "docx", source.read_bytes())

    status, page_count, reason = drain(worker, conn, doc_id)
    assert (status, reason) == ("ready", None)
    assert page_count >= 2
    assert jobs_of(conn, doc_id) == {CONVERT_DOCUMENT: ("done", 1), ANALYZE_DOCUMENT: ("done", 1)}

    pdf_key, pdf_size, record = conversion_of(conn, doc_id)
    assert pdf_key == f"uploads/{doc_id}.converted.pdf"
    assert stored_keys(worker.storage, doc_id) == {key, pdf_key}
    assert pdf_size == next(o.size for o in worker.storage.list_objects(pdf_key))
    assert record["format"] == "docx" and record["engine"].startswith("libreoffice-")
    assert record["sourcePages"] == 4
    assert record["fonts"]["requested"] == ["B Nazanin"]


def test_photo_is_converted_without_libreoffice(conn, worker):
    doc_id, key = upload_document(conn, worker.storage, "image", "jpg", photo())
    assert drain(worker, conn, doc_id) == ("ready", 1, None)
    pdf_key, pdf_size, record = conversion_of(conn, doc_id)
    assert (pdf_key, record["format"], record["sourcePages"]) == (f"uploads/{doc_id}.converted.pdf", "jpeg", 1)
    assert pdf_size > 0
    assert stored_keys(worker.storage, doc_id) == {key, pdf_key}


def test_pdf_named_docx_is_analyzed_as_it_is(tmp_path, conn, worker):
    doc_id, key = upload_document(conn, worker.storage, "docx", "docx", pdf_bytes(tmp_path))
    assert drain(worker, conn, doc_id) == ("ready", 2, None)
    pdf_key, pdf_size, record = conversion_of(conn, doc_id)
    assert (pdf_key, pdf_size, record["engine"]) == (None, None, "none")
    assert stored_keys(worker.storage, doc_id) == {key}  # هیچ PDF تازه‌ای ساخته نشد


def test_photo_named_pdf_silently_takes_the_conversion_path(conn, worker):
    """مرورگر «جزوه.pdf» را نتوانست بخواند چون در واقع عکس بود؛ سرور بی‌صدا تبدیلش می‌کند."""
    doc_id, _ = upload_document(conn, worker.storage, "pdf", "pdf", photo())
    assert drain(worker, conn, doc_id) == ("ready", 1, None)
    assert jobs_of(conn, doc_id) == {ANALYZE_DOCUMENT: ("done", 1), CONVERT_DOCUMENT: ("done", 1)}
    assert conversion_of(conn, doc_id)[2]["format"] == "jpeg"


def test_password_protected_word_fails_once_with_a_clear_reason(tmp_path, conn, worker):
    path = tmp_path / "locked.docx"
    make_ole(str(path), {"EncryptionInfo": b"i" * 600, "EncryptedPackage": b"e" * 5000})
    doc_id, _ = upload_document(conn, worker.storage, "docx", "docx", path.read_bytes())
    status, _, reason = drain(worker, conn, doc_id)
    assert (status, reason) == ("failed", "password_protected")
    assert jobs_of(conn, doc_id) == {CONVERT_DOCUMENT: ("failed", 1)}


def test_excel_named_docx_is_refused(tmp_path, conn, worker):
    path = tmp_path / "sheet.docx"
    make_zip(str(path), {"xl/workbook.xml": "<w/>"})
    doc_id, _ = upload_document(conn, worker.storage, "docx", "docx", path.read_bytes())
    assert drain(worker, conn, doc_id)[2] == "unsupported_format"


def test_abort_during_conversion_leaves_no_pdf_behind(conn, worker, monkeypatch):
    doc_id, key = upload_document(conn, worker.storage, "image", "jpg", photo())
    real = convert.to_pdf

    def abort_meanwhile(source, workdir, office):
        result = real(source, workdir, office)
        # همان کاری که انصراف کاربر در وب می‌کند، از اتصال دیگر.
        with psycopg.connect(os.environ["DATABASE_URL"]) as other:
            other.execute(
                "UPDATE documents SET status = 'failed', failure_reason = 'discarded', file_deleted_at = now() WHERE id = %s",
                (doc_id,),
            )
        return result

    monkeypatch.setattr(convert, "to_pdf", abort_meanwhile)
    status, _, reason = drain(worker, conn, doc_id)
    assert (status, reason) == ("failed", "discarded")
    assert conversion_of(conn, doc_id)[0] is None
    assert stored_keys(worker.storage, doc_id) == {key}
    assert jobs_of(conn, doc_id) == {CONVERT_DOCUMENT: ("done", 1)}


def test_worker_dying_after_conversion_does_not_convert_twice(conn, worker, monkeypatch):
    """کارگر تبدیل را ثبت کرد و پیش از بستن کار مرد: کار بعد از اجاره دوباره برداشته
    می‌شود، ولی تبدیل دوباره انجام نمی‌شود و تحلیل همان است که در صف رفته بود."""
    while worker.run_once(conn):
        pass
    doc_id, _ = upload_document(conn, worker.storage, "image", "jpg", photo())
    job = queue.claim(conn, "dying-worker", [CONVERT_DOCUMENT], 60)
    assert job.document_id == doc_id
    convert_document(conn, worker.storage, worker.office, doc_id)
    conn.commit()  # ثبت شد؛ `queue.complete` هرگز نرسید
    conn.execute("UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = %s", (job.id,))
    conn.commit()

    calls = []
    monkeypatch.setattr(convert, "to_pdf", lambda *args: calls.append(args))
    assert drain(worker, conn, doc_id) == ("ready", 1, None)
    assert calls == []
    assert jobs_of(conn, doc_id) == {CONVERT_DOCUMENT: ("done", 2), ANALYZE_DOCUMENT: ("done", 1)}


def test_discarded_document_keeps_its_reason(tmp_path, conn, worker):
    """کاربر وسط تحلیل انصراف داد: وب فایل را پاک کرد؛ کار تحلیل «فایل نیست» می‌گیرد،
    ولی دلیل ثبت‌شدهٔ سند همان انصراف می‌ماند — گزارش‌ها به آن تکیه دارند."""
    doc_id, _ = upload_document(conn, worker.storage, "pdf", "pdf", pdf_bytes(tmp_path))
    conn.execute(
        "UPDATE documents SET status = 'failed', failure_reason = 'discarded', file_deleted_at = now() WHERE id = %s",
        (doc_id,),
    )
    conn.commit()
    assert drain(worker, conn, doc_id) == ("failed", None, "discarded")
    assert jobs_of(conn, doc_id) == {ANALYZE_DOCUMENT: ("failed", 1)}
