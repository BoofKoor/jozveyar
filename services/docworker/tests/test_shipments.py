"""
کار `read_post_file` و نگهداری فایل پست (برش ۶٫۱، ADR-045) روی پستگرس واقعی؛ بی `DATABASE_URL` رد می‌شود. پایگاه داده باید
مهاجرت‌شده باشد: در CI، `pnpm test` پیش از این اجرا می‌شود. خود خواندن بایت‌ها، بی سرویس، در `test_postfile.py`.

ورود پاک‌نشدنی است (`shipment_imports_no_delete`)، پس هر تست ورودهای خودش را با بایت‌های یکتا می‌سازد و می‌گذارد بماند.
"""

import hashlib
import math
import os
import uuid

import pytest

import docworker.__main__ as main
from docworker import retention
from docworker.formats import OLE_MAGIC
from docworker.shipments import READ_FAILED, READ_POST_FILE, mark_import_failed, read_post_file
from tests.postfiles import HEADERS, SAMPLE, html

psycopg = pytest.importorskip("psycopg")

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL لازم است")


@pytest.fixture
def conn():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c


@pytest.fixture
def admin(conn):
    row = conn.execute(
        """INSERT INTO admin_users (username, display_name) VALUES ('dw.test', 'کارگر آزمایشی')
           ON CONFLICT (username) DO UPDATE SET display_name = excluded.display_name RETURNING id::text"""
    ).fetchone()
    conn.commit()
    return row[0]


def unique(raw: bytes) -> bytes:
    """همان فایل با نشانه‌ای تازه ته آن؛ ورود زندهٔ دیگری همان sha256 را ندارد."""
    return raw + f"<!-- {uuid.uuid4()} -->".encode()


def new_import(conn, admin, raw: bytes, *, days_ago: int = 0, status: str = "reading") -> str:
    """ورود «در حال خواندن»، مثل بارگذاری پنل؛ `days_ago` برای نگهداری."""
    import_id = conn.execute(
        """INSERT INTO shipment_imports (carrier, filename, size_bytes, sha256, raw, created_by, created_at)
           VALUES ('iran_post', 'FileName-1954.xls', %s, %s, %s, %s, now() - make_interval(days => %s))
        RETURNING id::text""",
        (len(raw), hashlib.sha256(raw).hexdigest(), raw, admin, days_ago),
    ).fetchone()[0]
    if status == "read":
        conn.execute(
            """UPDATE shipment_imports SET status = 'read', format = 'html', tables = '[[["x"]]]', read_at = now()
                WHERE id = %s""",
            (import_id,),
        )
    elif status == "unreadable":
        conn.execute(
            "UPDATE shipment_imports SET status = 'unreadable', error_code = 'no_table', read_at = now() WHERE id = %s",
            (import_id,),
        )
    conn.commit()
    return import_id


def state(conn, import_id):
    return conn.execute(
        """SELECT status, format, tables, error_code, read_at IS NOT NULL, raw IS NULL, purged_at IS NOT NULL,
                  discarded_at IS NOT NULL, discarded_by
             FROM shipment_imports WHERE id = %s""",
        (import_id,),
    ).fetchone()


def test_post_file_becomes_tables_in_the_same_row(conn, admin):
    import_id = new_import(conn, admin, unique(html(SAMPLE).encode()))
    result = read_post_file(conn, import_id)
    conn.commit()
    assert result.startswith("خوانده شد: html")
    status, fmt, tables, error, read, purged_raw, purged, discarded, _ = state(conn, import_id)
    assert (status, fmt, error, read, purged_raw, purged, discarded) == ("read", "html", None, True, False, False, False)
    # همان جدول، خانه‌به‌خانه، رشته؛ تفسیر با پنل است.
    assert len(tables) == 1 and tables[0][0] == HEADERS and len(tables[0]) == 5
    assert tables[0][1][2] == "118832198006260769886668\xa0"


def test_a_file_that_is_not_a_post_file_is_unreadable_with_its_code_not_a_failed_job(conn, admin):
    import_id = new_import(conn, admin, unique(OLE_MAGIC + b"\0" * 4096))
    assert read_post_file(conn, import_id) == "خوانده نشد: xls_binary"
    conn.commit()
    status, fmt, tables, error, read, *_ = state(conn, import_id)
    assert (status, fmt, tables, error, read) == ("unreadable", None, None, "xls_binary", True)


def test_an_import_discarded_meanwhile_is_left_alone(conn, admin):
    import_id = new_import(conn, admin, unique(html(SAMPLE).encode()))
    conn.execute(
        """UPDATE shipment_imports SET status = 'discarded', discarded_at = now(), discarded_by = %s, raw = NULL,
                  purged_at = now() WHERE id = %s""",
        (admin, import_id),
    )
    conn.commit()
    assert read_post_file(conn, import_id) == "ورود دیگر «در حال خواندن» نیست"
    mark_import_failed(conn, import_id)
    conn.commit()
    assert state(conn, import_id)[:4] == ("discarded", None, None, None)


def test_the_worker_takes_the_job_and_the_last_failed_attempt_is_read_failed(conn, admin, monkeypatch):
    for key, value in {"S3_ENDPOINT": "http://s3", "S3_BUCKET": "b", "S3_ACCESS_KEY": "a", "S3_SECRET_KEY": "s"}.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("DOCWORKER_KINDS", READ_POST_FILE)
    worker = main.Worker()
    worker.fonts_due = worker.retention_due = math.inf

    def run(import_id):
        conn.execute("INSERT INTO jobs (kind, shipment_import_id) VALUES (%s, %s)", (READ_POST_FILE, import_id))
        conn.commit()
        for _ in range(20):  # کارهای دیگر همین نوع در صف، پیش از این
            if not worker.run_once(conn):
                break
        return conn.execute(
            "SELECT status, last_error FROM jobs WHERE shipment_import_id = %s AND kind = %s", (import_id, READ_POST_FILE)
        ).fetchone()

    ok = new_import(conn, admin, unique(html(SAMPLE).encode()))
    assert run(ok) == ("done", None)
    assert state(conn, ok)[0] == "read"

    # خطای گذرا تا آخرین تلاش: «خوانده نشد» با `read_failed`، نه تا ابد «در حال خواندن».
    def broken(conn, import_id):
        raise OSError("disk")

    monkeypatch.setattr(main, "read_post_file", broken)
    failing = new_import(conn, admin, unique(html(SAMPLE).encode()))
    conn.execute("INSERT INTO jobs (kind, shipment_import_id, max_attempts) VALUES (%s, %s, 1)", (READ_POST_FILE, failing))
    conn.commit()
    for _ in range(20):
        if not worker.run_once(conn):
            break
    job = conn.execute("SELECT status FROM jobs WHERE shipment_import_id = %s", (failing,)).fetchone()
    assert job == ("failed",)
    assert state(conn, failing)[:4] == ("unreadable", None, None, READ_FAILED)


def test_post_files_are_purged_after_the_retention_days_and_only_then(conn, admin):
    stale = new_import(conn, admin, unique(b"<table><tr><td>stale</td></tr></table>"), days_ago=31, status="read")
    unreadable = new_import(conn, admin, unique(b"<p>x</p>"), days_ago=31, status="unreadable")
    fresh = new_import(conn, admin, unique(b"<table><tr><td>fresh</td></tr></table>"), days_ago=29, status="read")
    # ورود ثبت‌شده با سه سطر: «پیدا نشد» و «جمع کل» متنشان می‌رود، «تکراری» (مال ما) نه.
    committed = new_import(conn, admin, unique(b"<table><tr><td>committed</td></tr></table>"), days_ago=31, status="read")
    conn.execute(
        "UPDATE shipment_imports SET status = 'committed', committed_at = now(), committed_by = %s WHERE id = %s", (admin, committed)
    )
    for row_no, verdict, barcode in ((1, "unmatched", None), (2, "duplicate", "118800000000000000000002"), (3, "total", None)):
        conn.execute(
            """INSERT INTO shipment_import_rows (import_id, row_no, cells, barcode, name_g, destination, verdict)
               VALUES (%s, %s, '["a"]', %s, 'طهماسبی 6103', 'مشهد', %s)""",
            (committed, row_no, barcode, verdict),
        )
    conn.commit()

    stale_n, purged_n, rows_n = retention.purge_post_files(conn, 30)
    assert stale_n >= 1 and purged_n >= 2 and rows_n >= 2
    status, fmt, tables, _, _, raw_gone, purged, discarded, by = state(conn, stale)
    assert (status, tables, raw_gone, purged, discarded, by) == ("discarded", None, True, True, True, None)
    assert state(conn, unreadable)[0] == "unreadable" and state(conn, unreadable)[5:7] == (True, True)
    assert state(conn, committed)[0] == "committed" and state(conn, committed)[5:7] == (True, True)
    # شاهد: ورود ۲۹ روزه دست نخورد.
    assert state(conn, fresh)[:3] == ("read", "html", [[["x"]]]) and state(conn, fresh)[5:8] == (False, False, False)
    rows = conn.execute(
        "SELECT row_no, cells, name_g, destination, verdict FROM shipment_import_rows WHERE import_id = %s ORDER BY row_no", (committed,)
    ).fetchall()
    assert rows == [
        (1, None, None, None, "unmatched"),
        (2, ["a"], "طهماسبی 6103", "مشهد", "duplicate"),
        (3, None, None, None, "total"),
    ]
    # دور دوم چیزی از این‌ها برای پاک کردن ندارد.
    retention.purge_post_files(conn, 30)
    assert state(conn, committed)[0] == "committed"
