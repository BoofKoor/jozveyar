"""حلقهٔ کارگر در برابر پایگاه دادهٔ ناآماده — بدون سرویس واقعی."""

import psycopg
import pytest

from docworker.__main__ import Worker


@pytest.fixture
def worker(monkeypatch):
    for key, value in {
        "DATABASE_URL": "postgresql://x", "S3_ENDPOINT": "http://s3", "S3_BUCKET": "b",
        "S3_ACCESS_KEY": "a", "S3_SECRET_KEY": "s",
    }.items():
        monkeypatch.setenv(key, value)
    w = Worker()
    w.retry_seconds = 0
    return w


def test_missing_jobs_table_waits_instead_of_crashing(worker, monkeypatch):
    """اولین استقرار واقعی: کارگر زودتر از مهاجرت بالا آمد و کرش کرد."""
    attempts = []

    class Conn:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    def fake_connect(url):
        attempts.append(url)
        if len(attempts) >= 3:
            worker.stop()
        return Conn()

    def fake_run_once(conn):
        raise psycopg.errors.UndefinedTable('relation "jobs" does not exist')

    monkeypatch.setattr(psycopg, "connect", fake_connect)
    monkeypatch.setattr(worker, "run_once", fake_run_once)
    worker.run()  # نباید استثنا بیرون بدهد
    assert len(attempts) == 3


def test_unreachable_database_waits(worker, monkeypatch):
    calls = []

    def fake_connect(url):
        calls.append(url)
        if len(calls) >= 2:
            worker.stop()
        raise psycopg.OperationalError("connection refused")

    monkeypatch.setattr(psycopg, "connect", fake_connect)
    worker.run()
    assert len(calls) == 2
