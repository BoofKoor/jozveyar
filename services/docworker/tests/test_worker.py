"""حلقهٔ کارگر در برابر پایگاه دادهٔ ناآماده — بدون سرویس واقعی."""

import math

import psycopg
import pytest

from docworker import fonts
from docworker.__main__ import KINDS, Worker, kinds_from_env


@pytest.fixture
def worker(monkeypatch):
    for key, value in {
        "DATABASE_URL": "postgresql://x", "S3_ENDPOINT": "http://s3", "S3_BUCKET": "b",
        "S3_ACCESS_KEY": "a", "S3_SECRET_KEY": "s",
    }.items():
        monkeypatch.setenv(key, value)
    w = Worker()
    w.retry_seconds = 0
    w.fonts_due = math.inf  # استوریج ساختگی است؛ هم‌گام‌سازی فونت جدا تست می‌شود
    return w


def test_font_sync_failure_never_stops_the_worker(worker, monkeypatch):
    """استوریج در دسترس نیست ← هشدار، نه کرش؛ و ده دقیقه بعد دوباره."""
    calls = []

    def broken_sync(storage):
        calls.append(storage)
        raise OSError("storage down")

    monkeypatch.setattr(fonts, "sync", broken_sync)
    worker.fonts_due = 0.0
    worker.sync_fonts_if_due()
    worker.sync_fonts_if_due()  # هنوز وقتش نشده
    assert len(calls) == 1
    assert worker.fonts_due > 0


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


def test_worker_takes_every_kind_by_default(monkeypatch):
    monkeypatch.delenv("DOCWORKER_KINDS", raising=False)
    assert kinds_from_env() == ["convert_document", "analyze_document"] == list(KINDS)


def test_a_node_can_take_only_analysis(monkeypatch):
    """نود دوم با رم کم: همان ایمیج، فقط تحلیل؛ تبدیل‌ها برای نود اصلی می‌ماند."""
    monkeypatch.setenv("DOCWORKER_KINDS", " analyze_document ")
    assert kinds_from_env() == ["analyze_document"]


def test_a_typo_in_kinds_stops_the_worker_loudly(monkeypatch):
    monkeypatch.setenv("DOCWORKER_KINDS", "analyse_document")
    with pytest.raises(SystemExit, match="analyse_document"):
        kinds_from_env()
