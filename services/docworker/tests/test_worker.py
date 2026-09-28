"""حلقهٔ کارگر در برابر پایگاه دادهٔ ناآماده — بدون سرویس واقعی."""

import math

import psycopg
import pytest

import docworker.__main__ as main
from docworker import fonts
from docworker.__main__ import KINDS, Worker, kinds_from_env

ENV = {
    "DATABASE_URL": "postgresql://x", "S3_ENDPOINT": "http://s3", "S3_BUCKET": "b",
    "S3_ACCESS_KEY": "a", "S3_SECRET_KEY": "s",
}


@pytest.fixture
def worker(monkeypatch):
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    w = Worker()
    w.retry_seconds = 0
    w.fonts_due = math.inf  # استوریج ساختگی است؛ هم‌گام‌سازی فونت جدا تست می‌شود
    w.retention_due = math.inf  # نگهداری هم
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
    """از برش ۳ب ساختن PDF جزوهٔ سفارش پرداخت‌شده (`prepare_order`)، و از ۵٫۱ برگهٔ سفارش (`prepare_ticket`)."""
    monkeypatch.delenv("DOCWORKER_KINDS", raising=False)
    assert kinds_from_env() == ["convert_document", "analyze_document", "prepare_order", "prepare_ticket", "read_post_file"] == list(KINDS)


def test_only_a_node_that_takes_order_jobs_deletes_order_files(monkeypatch):
    """نگهداری (ADR-044) کار نود سفارش است؛ نود فقط‌تحلیل فایل سفارشی پاک نمی‌کند."""
    for key, value in ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("DOCWORKER_KINDS", "analyze_document")
    assert Worker().retention_due == math.inf
    monkeypatch.delenv("DOCWORKER_KINDS")
    assert Worker().retention_due == 0.0


def test_a_retention_failure_never_stops_the_worker(worker, monkeypatch):
    """استوریج یا پایگاه داده در دسترس نیست ← هشدار، نه کرش؛ و دور بعد دوباره."""
    calls = []

    def broken(conn, storage):
        calls.append(conn)
        raise OSError("storage down")

    class Conn:
        rolled_back = 0

        def rollback(self):
            Conn.rolled_back += 1

    monkeypatch.setattr(main, "sweep", broken)
    worker.retention_due = 0.0
    worker.sweep_if_due(Conn())
    worker.sweep_if_due(Conn())  # هنوز وقتش نشده
    assert len(calls) == 1 and Conn.rolled_back == 1
    assert worker.retention_due > 0


def test_a_node_can_take_only_analysis(monkeypatch):
    """نود دوم با رم کم: همان ایمیج، فقط تحلیل؛ تبدیل‌ها برای نود اصلی می‌ماند."""
    monkeypatch.setenv("DOCWORKER_KINDS", " analyze_document ")
    assert kinds_from_env() == ["analyze_document"]


def test_a_typo_in_kinds_stops_the_worker_loudly(monkeypatch):
    monkeypatch.setenv("DOCWORKER_KINDS", "analyse_document")
    with pytest.raises(SystemExit, match="analyse_document"):
        kinds_from_env()
