"""
تصویرهای سایت (برش ۱۱٫۲، ADR-067): کار `build_site_image`.

- **قاعده‌ها** (بی پایگاه داده، با Pillow): لوگو با حاشیهٔ شفاف بریده و ۱۲۸ پیکسل ارتفاع، favicon با سه اندازه، آیکون گوشی مات با تصویر درون
  دایرهٔ امن، تصویر اشتراک با رنگ‌های برند؛ نشان برای آیکون‌ها؛ بنر با سقف پهنا و JPEG یا PNG؛ و هر فایلی که پذیرفته نیست شکست قطعی با کد و
  پیام فارسی آماده (کوچک، نسبت، SVG، JPEG برای لوگو، خراب، بزرگ، پیکسل زیاد، تمام شفاف). متادیتای ورودی به خروجی نمی‌رسد.
- **کار** روی پستگرس واقعی (بی `DATABASE_URL` رد می‌شود): فایل‌ها و پایان یک بار روی همان ردیف؛ پذیرفته‌نشده «ساخته نشد» با خطا؛ خطای گذرایی
  که تلاش‌هایش تمام شد هم؛ و پاک شدن بارگذاری‌ای که ۳۰ روز روی سایت نرفت، با فایل‌ها و کارش.
"""

import io
import math
import os
import re
from pathlib import Path

import pytest
from PIL import Image, PngImagePlugin

import docworker.__main__ as main
from docworker import site_images
from docworker.jobs import PermanentFailure
from docworker.site_images import (
    BUILD_SITE_IMAGE,
    banner_files,
    build_site_image,
    kind_of,
    logo_files,
    mark_image_failed,
    purge_images,
)

database = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL لازم است")
REPO = Path(__file__).resolve().parents[3]

BLUE = (30, 80, 200, 255)
RED = (220, 40, 40, 255)


def png(width: int, height: int, color=BLUE, *, margin: int = 0, mode: str = "RGBA", **save) -> bytes:
    """تصویر یک‌رنگ با حاشیهٔ شفاف `margin` پیکسلی دورش."""
    img = Image.new("RGBA", (width + 2 * margin, height + 2 * margin), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (width, height), color), (margin, margin))
    if mode != "RGBA":
        img = img.convert(mode)
    out = io.BytesIO()
    img.save(out, "PNG", **save)
    return out.getvalue()


def encoded(img: Image.Image, fmt: str, **save) -> bytes:
    out = io.BytesIO()
    img.save(out, fmt, **save)
    return out.getvalue()


def files_of(items):
    return {f.name: f for f in items}


def opened(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img.load()
    return img


def failure(call, *args) -> PermanentFailure:
    with pytest.raises(PermanentFailure) as caught:
        call(*args)
    return caught.value


# ── قاعده‌ها ─────────────────────────────────────────────────────────────────


def test_colors_are_the_brand_files_colors():
    css = (REPO / "docs/brand/jozveyar-colors.css").read_text(encoding="utf-8")

    def brand(token: str) -> tuple[int, int, int]:
        hex_value = re.search(rf"--jy-{token}\s*:\s*#([0-9A-Fa-f]{{6}})", css).group(1)
        return tuple(int(hex_value[i : i + 2], 16) for i in (0, 2, 4))

    assert site_images.BAND == brand("green-50")
    assert site_images.EDGE == brand("green-600")
    assert site_images.PAPER == brand("paper")


def test_kind_comes_from_the_bytes_not_the_name():
    assert kind_of(png(2, 2)) == "png"
    assert kind_of(encoded(Image.new("RGB", (2, 2)), "WEBP")) == "webp"
    assert kind_of(encoded(Image.new("RGB", (2, 2)), "JPEG")) == "jpeg"
    assert kind_of(b"\xef\xbb\xbf<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'/>") == "svg"
    assert kind_of(b"  <svg onload='x()'></svg>") == "svg"
    assert kind_of(b"GIF89a....") is None


def test_logo_is_trimmed_and_every_file_is_rebuilt_at_its_size():
    files = files_of(logo_files(png(400, 200, margin=30), None))
    assert sorted(files) == ["apple", "favicon", "icon192", "icon512", "logo", "og"]

    logo = files["logo"]
    # حاشیهٔ شفاف بریده، پس ۴۰۰×۲۰۰ ← ۲۵۶×۱۲۸.
    assert (logo.width, logo.height, logo.content_type, logo.has_alpha) == (256, 128, "image/png", False)
    assert opened(logo.data).size == (256, 128)

    favicon = files["favicon"]
    assert favicon.content_type == "image/x-icon" and (favicon.width, favicon.height) == (48, 48)
    with Image.open(io.BytesIO(favicon.data)) as ico:
        assert sorted(ico.info["sizes"]) == [(16, 16), (32, 32), (48, 48)]

    for name, size in (("apple", 180), ("icon192", 192), ("icon512", 512)):
        icon = opened(files[name].data).convert("RGBA")
        assert icon.size == (size, size) and not files[name].has_alpha
        # گوشه سفید مات (اپل گوشهٔ شفاف را توصیه نمی‌کند)، و هر پیکسل غیر سفید درون دایرهٔ امن (قطر ۸۰٪).
        assert icon.getpixel((0, 0)) == (255, 255, 255, 255)
        center = size / 2
        for x in range(0, size, 4):
            for y in range(0, size, 4):
                if icon.getpixel((x, y))[:3] != (255, 255, 255):
                    assert math.hypot(x - center, y - center) <= 0.4 * size + 1
        assert icon.getpixel((size // 2, size // 2))[:3] == BLUE[:3]

    og = opened(files["og"].data).convert("RGB")
    assert og.size == (1200, 630) and files["og"].content_type == "image/png"
    assert og.getpixel((5, 5)) == site_images.BAND
    assert og.getpixel((600, 629)) == site_images.EDGE and og.getpixel((600, 617)) != site_images.EDGE
    # لوگو وسط ناحیهٔ بالای لبه، در اندازهٔ خودش (۲۰۰ پیکسل، کمتر از سقف ۲۱۲).
    assert og.getpixel((600, 309)) == BLUE[:3]
    column = [og.getpixel((600, y)) == BLUE[:3] for y in range(630)]
    assert sum(column) == 200


def test_the_mark_makes_the_icons_and_the_logo_the_rest():
    files = files_of(logo_files(png(600, 200), png(300, 300, RED)))
    assert opened(files["logo"].data).convert("RGB").getpixel((10, 10)) == BLUE[:3]
    assert opened(files["og"].data).convert("RGB").getpixel((600, 309)) == BLUE[:3]
    for name in ("apple", "icon192", "icon512"):
        icon = opened(files[name].data).convert("RGB")
        assert icon.getpixel((icon.width // 2, icon.height // 2)) == RED[:3]
    with Image.open(io.BytesIO(files["favicon"].data)) as ico:
        ico.size = (48, 48)
        ico.load()
        assert ico.convert("RGB").getpixel((24, 24)) == RED[:3]


def test_a_wide_logo_fits_the_phone_icon_inside_the_safe_circle():
    files = files_of(logo_files(png(512, 128), None))
    icon = opened(files["icon512"].data).convert("RGB")
    xs = [x for x in range(512) if icon.getpixel((x, 256)) != (255, 255, 255)]
    ys = [y for y in range(512) if icon.getpixel((256, y)) != (255, 255, 255)]
    width, height = xs[-1] - xs[0] + 1, ys[-1] - ys[0] + 1
    assert math.hypot(width, height) <= 0.78 * 512 + 2
    assert abs(width / height - 4) < 0.1


def test_webp_logo_and_sixteen_bit_and_animated_inputs_are_read():
    webp = encoded(Image.new("RGBA", (300, 150), BLUE), "WEBP", lossless=True)
    assert files_of(logo_files(webp, None))["logo"].height == 128

    gray16 = encoded(Image.new("I;16", (300, 150), 40000), "PNG")
    logo = opened(files_of(logo_files(gray16, None))["logo"].data).convert("L")
    assert 140 < logo.getpixel((10, 10)) < 170  # ۴۰۰۰۰ از ۶۵۵۳۵، نه سفید

    frames = [Image.new("RGBA", (300, 150), BLUE), Image.new("RGBA", (300, 150), RED)]
    animated = encoded(frames[0], "PNG", save_all=True, append_images=frames[1:], duration=100)
    assert opened(files_of(logo_files(animated, None))["logo"].data).convert("RGB").getpixel((5, 5)) == BLUE[:3]


@pytest.mark.parametrize(
    ("main_bytes", "extra", "code", "words"),
    [
        (png(300, 100), None, "too_small", ("لوگو", "100 پیکسل", "128")),
        (png(1000, 150), None, "ratio", ("لوگو", "6.67", "0.5 تا 4")),
        (png(100, 300), None, "ratio", ("لوگو", "0.33")),
        (png(40, 40, (0, 0, 0, 0)), None, "empty", ("لوگو", "تمام شفاف")),
        (b"<svg xmlns='http://www.w3.org/2000/svg'><script>x()</script></svg>", None, "format", ("SVG", "اسکریپت", "PNG یا WebP")),
        (encoded(Image.new("RGB", (400, 200)), "JPEG"), None, "format", ("لوگو", "PNG یا WebP")),
        (png(400, 200)[:60], None, "unreadable", ("لوگو", "خوانده نشد")),
        (b"\x89PNG\r\n\x1a\n" + b"\0" * (1024 * 1024), None, "too_large", ("لوگو", "1 مگابایت")),
        (png(400, 200), png(150, 150, RED), "too_small", ("نشان", "150×150", "192")),
        (png(400, 200), png(600, 200, RED), "ratio", ("نشان", "3")),
    ],
)
def test_a_logo_that_does_not_fit_fails_with_a_ready_message(main_bytes, extra, code, words):
    caught = failure(logo_files, main_bytes, extra)
    assert caught.code == code
    for word in words:
        assert word in str(caught)
    assert len(f"{caught.code}: {caught}") <= site_images.MAX_ERROR


def test_too_many_pixels_is_refused_before_the_image_is_decoded():
    huge = png(5000, 4000, mode="L")
    assert len(huge) < 1024 * 1024
    caught = failure(logo_files, huge, None)
    assert caught.code == "too_many_pixels" and "5000×4000" in str(caught)


def test_metadata_of_the_upload_never_reaches_the_site():
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "secret-in-text-chunk")
    logo = files_of(logo_files(png(400, 200, pnginfo=info), None))
    assert all(b"secret-in-text-chunk" not in f.data for f in logo.values())

    exif = Image.Exif()
    exif[0x010E] = "secret-in-exif"  # ImageDescription
    photo = encoded(Image.new("RGB", (1600, 400), (10, 120, 60)), "JPEG", exif=exif.tobytes())
    (desktop,) = banner_files(photo, None)
    assert b"secret-in-exif" not in desktop.data
    assert not opened(desktop.data).getexif()


def test_banner_files_have_the_size_rules_and_jpeg_or_png():
    photo = encoded(Image.new("RGB", (1600, 400), (10, 120, 60)), "JPEG")
    phone = encoded(Image.new("RGB", (800, 400), (10, 120, 60)), "WEBP")
    desktop, mobile = banner_files(photo, phone)
    assert (desktop.name, desktop.content_type, desktop.width, desktop.height, desktop.has_alpha) == ("desktop", "image/jpeg", 1600, 400, False)
    assert (mobile.name, mobile.content_type, mobile.width, mobile.height) == ("mobile", "image/jpeg", 800, 400)

    (wide,) = banner_files(encoded(Image.new("RGB", (3000, 750), (1, 2, 3)), "PNG"), None)
    assert (wide.width, wide.height, wide.content_type) == (2160, 540, "image/jpeg")

    clear = Image.new("RGBA", (1200, 300), (10, 120, 60, 255))
    clear.paste((0, 0, 0, 0), (0, 0, 100, 100))
    (alpha,) = banner_files(encoded(clear, "PNG"), None)
    assert (alpha.content_type, alpha.has_alpha) == ("image/png", True)

    # کانال شفافیت که همه‌جا مات است (خروجی معمول نرم‌افزار طراحی) شفافیت نیست: JPEG، چند برابر کوچک‌تر.
    opaque = Image.new("RGBA", (1200, 300), (10, 120, 60, 255))
    (flat,) = banner_files(encoded(opaque, "PNG"), None)
    assert (flat.content_type, flat.has_alpha) == ("image/jpeg", False)

    cmyk = encoded(Image.new("CMYK", (1200, 300), (0, 200, 0, 0)), "JPEG")
    assert opened(banner_files(cmyk, None)[0].data).mode == "RGB"


def test_banner_exif_rotation_is_applied_before_the_rules():
    # تصویر خوابیدهٔ دوربین (۴۰۰×۱۶۰۰ با چرخش ۶) همان ۱۶۰۰×۴۰۰ است.
    exif = Image.Exif()
    exif[0x0112] = 6
    rotated = encoded(Image.new("RGB", (400, 1600), (5, 5, 5)), "JPEG", exif=exif.tobytes())
    (desktop,) = banner_files(rotated, None)
    assert (desktop.width, desktop.height) == (1600, 400)


@pytest.mark.parametrize(
    ("main_bytes", "extra", "code", "words"),
    [
        (encoded(Image.new("RGB", (1000, 300)), "JPEG"), None, "too_small", ("تصویر دسکتاپ", "1000", "1080")),
        (encoded(Image.new("RGB", (1500, 1000)), "JPEG"), None, "ratio", ("تصویر دسکتاپ", "1.5", "2 تا 6")),
        (encoded(Image.new("RGB", (1600, 400)), "JPEG"), encoded(Image.new("RGB", (500, 400)), "JPEG"), "too_small", ("تصویر گوشی", "500", "640")),
        (encoded(Image.new("RGB", (1600, 400)), "JPEG"), encoded(Image.new("RGB", (1600, 400)), "JPEG"), "ratio", ("تصویر گوشی", "4", "1 تا 3")),
        (encoded(Image.new("RGB", (1600, 400)), "GIF"), None, "format", ("تصویر دسکتاپ", "JPEG یا PNG یا WebP")),
    ],
)
def test_a_banner_that_does_not_fit_fails_with_a_ready_message(main_bytes, extra, code, words):
    caught = failure(banner_files, main_bytes, extra)
    assert caught.code == code
    for word in words:
        assert word in str(caught)


# ── کار روی پستگرس ─────────────────────────────────────────────────────────


@pytest.fixture
def conn():
    psycopg = pytest.importorskip("psycopg")
    with psycopg.connect(os.environ["DATABASE_URL"]) as c:
        yield c


@pytest.fixture
def admin(conn):
    row = conn.execute(
        """INSERT INTO admin_users (username, display_name) VALUES ('dw.images', 'کارگر تصویر')
           ON CONFLICT (username) DO UPDATE SET display_name = excluded.display_name RETURNING id::text"""
    ).fetchone()
    conn.commit()
    return row[0]


def new_image(conn, admin, kind: str, main_bytes: bytes, extra: bytes | None = None, *, days_ago: int = 0, max_attempts: int = 3) -> int:
    """بارگذاری «در انتظار ساختن» با کارش، مثل `createSiteImageStore().upload` پنل."""
    version = conn.execute("SELECT coalesce(max(version), 0) + 1 FROM site_images WHERE kind = %s", (kind,)).fetchone()[0]
    image_id = conn.execute(
        """INSERT INTO site_images (kind, version, main, main_name, extra, extra_name, created_by, created_at)
           VALUES (%s, %s, %s, 'main', %s, %s, %s, now() - make_interval(days => %s)) RETURNING id""",
        (kind, version, main_bytes, extra, "extra" if extra is not None else None, admin, days_ago),
    ).fetchone()[0]
    conn.execute("INSERT INTO jobs (kind, site_image_id, max_attempts) VALUES (%s, %s, %s)", (BUILD_SITE_IMAGE, image_id, max_attempts))
    conn.commit()
    return image_id


def worker(monkeypatch):
    for key, value in {"S3_ENDPOINT": "http://s3", "S3_BUCKET": "b", "S3_ACCESS_KEY": "a", "S3_SECRET_KEY": "s"}.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("DOCWORKER_KINDS", BUILD_SITE_IMAGE)
    w = main.Worker()
    w.fonts_due = w.retention_due = math.inf
    return w


def drain(conn, w):
    for _ in range(50):
        if not w.run_once(conn):
            break


def state(conn, image_id):
    return conn.execute("SELECT built_at IS NOT NULL, error FROM site_images WHERE id = %s", (image_id,)).fetchone()


def names(conn, image_id):
    return [row[0] for row in conn.execute("SELECT name FROM site_image_files WHERE image_id = %s ORDER BY name", (image_id,))]


def job_of(conn, image_id):
    return conn.execute("SELECT status, last_error FROM jobs WHERE site_image_id = %s", (image_id,)).fetchone()


@database
def test_the_worker_writes_every_file_once_onto_the_upload(conn, admin, monkeypatch):
    logo = new_image(conn, admin, "logo", png(400, 200, margin=10))
    banner = new_image(conn, admin, "banner", encoded(Image.new("RGB", (1600, 400)), "JPEG"), encoded(Image.new("RGB", (800, 400)), "PNG"))
    drain(conn, worker(monkeypatch))
    assert job_of(conn, logo) == ("done", None) and job_of(conn, banner) == ("done", None)
    assert state(conn, logo) == (True, None) and state(conn, banner) == (True, None)
    assert names(conn, logo) == ["apple", "favicon", "icon192", "icon512", "logo", "og"]
    assert names(conn, banner) == ["desktop", "mobile"]
    sha, data = conn.execute("SELECT sha256, bytes FROM site_image_files WHERE image_id = %s AND name = 'logo'", (logo,)).fetchone()
    import hashlib

    assert sha == hashlib.sha256(bytes(data)).hexdigest()
    # کار دوم همان بارگذاری (اجارهٔ اولی گذشته بود): بی‌اثر؛ و خطای دیرهنگام هم روی بارگذاری ساخته نمی‌نشیند.
    assert build_site_image(conn, logo) == "بارگذاری دیگر در انتظار ساختن نیست"
    conn.commit()
    mark_image_failed(conn, logo, "build_failed: OSError")
    conn.commit()
    assert state(conn, logo) == (True, None) and len(names(conn, logo)) == 6


@database
def test_an_image_that_does_not_fit_is_written_as_the_upload_error(conn, admin, monkeypatch):
    image_id = new_image(conn, admin, "logo", png(300, 100))
    drain(conn, worker(monkeypatch))
    assert job_of(conn, image_id)[0] == "failed"
    built, error = state(conn, image_id)
    assert built and error.startswith("too_small: لوگو: ") and "128" in error
    assert names(conn, image_id) == []


@database
def test_a_transient_failure_that_ran_out_of_attempts_is_build_failed(conn, admin, monkeypatch):
    def broken(conn, image_id):
        raise OSError("disk")

    monkeypatch.setattr(main, "build_site_image", broken)
    image_id = new_image(conn, admin, "logo", png(400, 200), max_attempts=1)
    drain(conn, worker(monkeypatch))
    assert job_of(conn, image_id)[0] == "failed"
    assert state(conn, image_id) == (True, "build_failed: OSError")


@database
def test_uploads_that_never_went_on_the_site_are_purged_after_thirty_days(conn, admin, monkeypatch):
    old = new_image(conn, admin, "logo", png(400, 200), days_ago=31)
    young = new_image(conn, admin, "logo", png(400, 200), days_ago=29)
    published = new_image(conn, admin, "logo", png(400, 200), days_ago=40)
    drain(conn, worker(monkeypatch))
    conn.execute("UPDATE site_images SET published_at = now() WHERE id = %s", (published,))
    conn.commit()
    assert purge_images(conn) >= 1
    alive = {row[0] for row in conn.execute("SELECT id FROM site_images WHERE id = ANY(%s)", ([old, young, published],))}
    assert alive == {young, published}
    assert conn.execute("SELECT count(*) FROM site_image_files WHERE image_id = %s", (old,)).fetchone() == (0,)
    assert conn.execute("SELECT count(*) FROM jobs WHERE site_image_id = %s", (old,)).fetchone() == (0,)
    # بقیهٔ تست‌ها بارگذاری تازه‌شان را پاک نمی‌کنند؛ این یکی آنچه روی سایت نرفته.
    conn.execute("DELETE FROM site_images WHERE id = %s", (young,))
    conn.commit()
