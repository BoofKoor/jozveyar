"""
نگهداری فایل‌های سفارش (برش ۵٫۱، ADR-044) روی پستگرس و Garage واقعی؛ بی `DATABASE_URL` و `S3_*` رد می‌شود.

هر پاک شدن شاهد دارد: سفارشی که یک روز کمتر گذشته، سفارش باز با پرداخت خیلی قدیمی، و تنظیم خراب هیچ‌کدام پاک نمی‌شوند.
"""

import os
import tempfile

import pytest

from docworker import retention
from docworker.orders import order_prefix

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

ENABLED = all(os.environ.get(k) for k in ("DATABASE_URL", "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"))
pytestmark = pytest.mark.skipif(not ENABLED, reason="DATABASE_URL و S3_* لازم است")

FILES = ("jozve-1.pdf", "print-1-1.pdf", "ticket-0123456789abcdef.pdf", "ticket-0123456789abcdef.png")


@pytest.fixture
def conn():
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c


@pytest.fixture
def storage(monkeypatch):
    from docworker.storage import S3Storage

    monkeypatch.setenv("S3_BUCKET", os.environ.get("S3_BUCKET") or "jozveyar")
    return S3Storage.from_env()


@pytest.fixture(autouse=True)
def days(conn):
    """۳۰ روز، همان پیش‌فرض دادهٔ پایه؛ پس از هر تست همان که بود برمی‌گردد."""
    before = conn.execute("SELECT value FROM settings WHERE key = %s", (retention.SETTING,)).fetchone()
    set_days(conn, 30)
    yield
    if before is None:
        conn.execute("DELETE FROM settings WHERE key = %s", (retention.SETTING,))
    else:
        set_days(conn, before[0])
    conn.commit()


def set_days(conn, value):
    conn.execute(
        """INSERT INTO settings (key, value) VALUES (%s, %s)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value""",
        (retention.SETTING, Jsonb(value)),
    )
    conn.commit()


def order(conn, storage, status, *, days_ago=0, paid_days_ago=1):
    """سفارش پرداخت‌شده با فایل‌هایش زیر `orders/`؛ «تحویل پست شد» یا «لغو شد» `days_ago` روز پیش."""
    version = conn.execute("SELECT version FROM price_lists WHERE is_active").fetchone()[0]
    user_id = conn.execute(
        """INSERT INTO users (mobile) VALUES ('09120000044')
           ON CONFLICT (mobile) DO UPDATE SET last_login_at = now() RETURNING id"""
    ).fetchone()[0]
    order_id, number = conn.execute(
        """INSERT INTO orders (checkout_key, user_id, price_list_version, price_breakdown, subtotal_rials, shipping_rials,
                               total_rials, est_weight_grams, sla_days, shipping_method_id, shipping_zone_id, province_id,
                               recipient_name, recipient_phone, address_text)
           VALUES (gen_random_uuid(), %s, %s, '{}', 1000, 500, 1500, 300, 2, 'post', 'tehran', 8,
                   'سارا احمدی', '09120000044', 'تهران، خیابان ولیعصر')
        RETURNING id::text, order_number""",
        (user_id, version),
    ).fetchone()
    conn.execute(
        """UPDATE orders SET status = 'paid', paid_at = now() - make_interval(days => %s),
                             post_handoff_due_at = now() - make_interval(days => %s) + interval '2 days'
            WHERE id = %s""",
        (paid_days_ago, paid_days_ago, order_id),
    )
    if status in ("printing", "handed_to_post"):
        conn.execute("UPDATE orders SET status = 'printing' WHERE id = %s", (order_id,))
    if status == "handed_to_post":
        conn.execute(
            """UPDATE orders SET status = 'handed_to_post', handed_to_post_at = now() - make_interval(days => %s)
                WHERE id = %s""",
            (days_ago, order_id),
        )
    if status == "cancelled":
        conn.execute("UPDATE orders SET status = 'cancelled' WHERE id = %s", (order_id,))
        conn.execute(
            """INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
               VALUES (%s, 'paid', 'cancelled', now() - make_interval(days => %s), 'system')""",
            (order_id, days_ago),
        )
    conn.commit()
    for name in FILES:
        with tempfile.NamedTemporaryFile() as f:
            f.write(b"%PDF-1.4 x")
            f.flush()
            storage.upload(f"{order_prefix(number)}{name}", f.name, "application/pdf")
    return order_id, number


def files(storage, number):
    return sorted(o.key.rsplit("/", 1)[1] for o in storage.list_objects(order_prefix(number)))


def deleted_at(conn, order_id):
    return conn.execute("SELECT files_deleted_at IS NOT NULL FROM orders WHERE id = %s", (order_id,)).fetchone()[0]


def clear(conn):
    """سفارش‌های سررسیدهٔ تست‌های قبلی، تا هر تست فقط سفارش‌های خودش را ببیند."""
    conn.execute("UPDATE orders SET files_deleted_at = now() WHERE files_deleted_at IS NULL AND status IN ('handed_to_post', 'cancelled')")
    conn.commit()


def test_files_of_a_closed_order_go_after_the_retention_days_and_only_then(conn, storage):
    clear(conn)
    handed, handed_no = order(conn, storage, "handed_to_post", days_ago=31)
    cancelled, cancelled_no = order(conn, storage, "cancelled", days_ago=31)
    # شاهدها: یک روز کمتر، و سفارش باز با پرداخت خیلی قدیمی.
    recent, recent_no = order(conn, storage, "handed_to_post", days_ago=29)
    open_, open_no = order(conn, storage, "printing", paid_days_ago=90)
    assert sorted(retention.sweep(conn, storage)) == sorted([handed_no, cancelled_no])
    assert files(storage, handed_no) == [] and files(storage, cancelled_no) == []
    assert deleted_at(conn, handed) and deleted_at(conn, cancelled)
    assert files(storage, recent_no) == sorted(FILES) and files(storage, open_no) == sorted(FILES)
    assert not deleted_at(conn, recent) and not deleted_at(conn, open_)
    # بار دوم هیچ: پاک‌شده دوباره برداشته نمی‌شود.
    assert retention.sweep(conn, storage) == []
    # سفارشی که فایلش رفت به صف چاپ برنمی‌گردد (تریگر `orders_files_deleted`).
    with pytest.raises(psycopg.errors.CheckViolation) as blocked:
        conn.execute("UPDATE orders SET status = 'paid' WHERE id = %s", (cancelled,))
    conn.rollback()
    assert blocked.value.diag.constraint_name == "orders_files_deleted"


def test_the_last_cancel_counts_not_the_first(conn, storage):
    clear(conn)
    order_id, number = order(conn, storage, "cancelled", days_ago=40)
    # لغو برگشت و دوباره لغو شد، دیروز: از آخرین لغو شمرده می‌شود.
    conn.execute(
        """INSERT INTO order_status_events (order_id, from_status, to_status, at, actor)
           VALUES (%s, 'paid', 'cancelled', now() - interval '1 day', 'system')""",
        (order_id,),
    )
    conn.commit()
    assert retention.sweep(conn, storage) == []
    assert files(storage, number) == sorted(FILES)


@pytest.mark.parametrize("value", [3, 366, "30", True, 30.5, None])
def test_a_retention_setting_out_of_shape_deletes_nothing(conn, storage, value):
    clear(conn)
    order_id, number = order(conn, storage, "handed_to_post", days_ago=400)
    if value is None:
        conn.execute("DELETE FROM settings WHERE key = %s", (retention.SETTING,))
        conn.commit()
    else:
        set_days(conn, value)
    assert retention.sweep(conn, storage) == []
    assert files(storage, number) == sorted(FILES) and not deleted_at(conn, order_id)
    # شاهد: با مقدار درست همان سفارش می‌رود.
    set_days(conn, 7)
    assert retention.sweep(conn, storage) == [number]


def test_each_round_takes_a_limited_batch(conn, storage):
    clear(conn)
    numbers = sorted(order(conn, storage, "handed_to_post", days_ago=31)[1] for _ in range(3))
    assert retention.sweep(conn, storage, batch=2) == numbers[:2]
    assert retention.sweep(conn, storage, batch=2) == numbers[2:]
