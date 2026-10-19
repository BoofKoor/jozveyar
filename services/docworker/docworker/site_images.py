"""
تصویرهای سایت (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶): کار `build_site_image`.

پنل لوگو (با نشان اختیاری) یا بنر صفحهٔ اصلی (با تصویر گوشی اختیاری) را همان‌طور که بارگذاری شد در ردیف `site_images` می‌نشاند، و این کار
فایل‌هایی را که سایت می‌دهد با Pillow از نو می‌سازد. هیچ بایتی از فایل بارگذاری‌شده بی رمزگشایی و رمزگذاری دوباره به سایت نمی‌رود: بی
متادیتا، بی EXIF، بی هر چیز پنهان دیگر؛ و SVG هرگز، چون اسکریپت می‌پذیرد.

- **لوگو:** حاشیهٔ شفاف بریده می‌شود؛ ارتفاع دست‌کم ۱۲۸ پیکسل (دو برابر سربرگ ۶۴ پیکسلی) و نسبت پهنا به ارتفاع ۰٫۵ تا ۴. ساخته‌ها: `logo` (PNG
  با ۱۲۸ پیکسل ارتفاع)، `favicon` (ICO با ۱۶، ۳۲ و ۴۸ پیکسل، شفاف)، `apple` (۱۸۰) و `icon192` و `icon512` (مربع سفید مات، و تصویر وسط با
  دست‌بالا ۵۸٪ ارتفاع و درون دایرهٔ امن، مثل آیکون‌های امروز `apps/web/scripts/make-icons.mjs`)، همه از نشان یا اگر نشان نیست از خود لوگو؛ و
  `og`، تصویر اشتراک ۱۲۰۰×۶۳۰ (green-50 با لبهٔ ۱۲ پیکسلی green-600 پایین، مثل امروز، و لوگو وسط تا ۲۱۲ پیکسل ارتفاع، بی متن).
- **نشان:** حاشیهٔ شفاف بریده؛ هر ضلع دست‌کم ۱۹۲ پیکسل و نسبت ۰٫۵ تا ۲.
- **بنر:** دسکتاپ پهنای دست‌کم ۱۰۸۰ (پهنای محتوای سایت) و نسبت ۲ تا ۶، تا ۲۱۶۰ پیکسل پهنا؛ گوشی پهنای دست‌کم ۶۴۰ و نسبت ۱ تا ۳، تا ۱۲۸۰.
  JPEG (کیفیت ۸۲) اگر شفافیت ندارد، وگرنه PNG.
- لوگو و نشان فقط PNG یا WebP؛ بنر JPEG، PNG یا WebP؛ نوع از خود بایت‌ها، نه نام. هر فایل تا ۱ مگابایت (همان CHECK پایگاه داده) و تا ۱۶
  مگاپیکسل، پیش از رمزگشایی کامل؛ تصویر متحرک فقط قاب اول.
- **یک بار:** فایل‌ها و پایان در یک تراکنش، فقط اگر هنوز ساخته نشده (`WHERE built_at IS NULL`، و تریگرهای 0056): کار دومی که اجارهٔ اولی را
  گرفت چیزی را عوض نمی‌کند.
- **شکست:** فایلی که پذیرفته نیست شکست قطعی است با کد و پیام فارسی آماده روی همان ردیف (`too_small: لوگو: …`)، برای صفحهٔ همان بارگذاری در
  پنل؛ خطای گذرا دوباره امتحان می‌شود، و پس از آخرین تلاش `build_failed` (`mark_image_failed`).
- **نگهداری:** بارگذاری‌ای که ۳۰ روز روی سایت نرفت، با فایل‌ها و کارش، پاک می‌شود (`purge_images`)؛ آنچه روی سایت رفت هرگز (0056).
"""

from __future__ import annotations

import hashlib
import io
import logging
import math
from dataclasses import dataclass

import psycopg

from .jobs import PermanentFailure

log = logging.getLogger("docworker.site_images")

BUILD_SITE_IMAGE = "build_site_image"

# همان سقف‌های پایگاه داده (`SITE_IMAGE_MAX_BYTES` و `SITE_IMAGE_FILE_MAX_BYTES`، CHECKهای 0055).
MAX_UPLOAD_BYTES = 1024 * 1024
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_PIXELS = 16_000_000
# همان سقف خطای ردیف (`site_images_error`).
MAX_ERROR = 500
# بارگذاری‌ای که روی سایت نرفت این‌قدر روز می‌ماند (`SITE_IMAGE_UNPUBLISHED_DAYS`).
UNPUBLISHED_DAYS = 30

# رنگ‌ها از فایل برند (`docs/brand/jozveyar-colors.css`؛ `test_site_images.py` برابری را می‌سنجد): زمینهٔ تصویر اشتراک green-50، لبه‌اش
# green-600، و زمینهٔ آیکون گوشی کاغذ.
BAND = (0xF2, 0xF7, 0xEE)
EDGE = (0x6C, 0x79, 0x5E)
PAPER = (0xFF, 0xFF, 0xFF)

LOGO_HEIGHT = 128
LOGO_RATIO = (0.5, 4.0)
MARK_MIN_SIDE = 192
MARK_RATIO = (0.5, 2.0)
ICO_SIZES = (16, 32, 48)
# آیکون گوشی: ارتفاع دست‌بالا ۵۸٪ ضلع، و قطر جعبهٔ تصویر دست‌بالا ۷۸٪، تا در دایرهٔ امن «maskable» (قطر ۸۰٪) بماند.
PHONE_HEIGHT_SHARE = 0.58
PHONE_DIAGONAL_SHARE = 0.78
OG_SIZE = (1200, 630)
OG_EDGE = 12
OG_LOGO_HEIGHT = 212
OG_PADDING = 48
JPEG_QUALITY = 82


@dataclass(frozen=True)
class BannerRule:
    label: str
    min_width: int
    ratio: tuple[float, float]
    max_width: int


DESKTOP = BannerRule("تصویر دسکتاپ", 1080, (2.0, 6.0), 2160)
MOBILE = BannerRule("تصویر گوشی", 640, (1.0, 3.0), 1280)

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


@dataclass(frozen=True)
class Built:
    """یک فایل ساخته، همان ردیف `site_image_files`."""

    name: str
    content_type: str
    data: bytes
    width: int
    height: int
    has_alpha: bool

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.data).hexdigest()


def number(value: float) -> str:
    """عدد با ارقام لاتین و بی صفر بیهوده: 2.5، 4، 0.75."""
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text or "0"


def kind_of(data: bytes) -> str | None:
    """نوع از خود بایت‌ها: `png`، `webp`، `jpeg`، `svg`، یا None."""
    if data.startswith(PNG_MAGIC):
        return "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    head = data[:512].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    if head.startswith(b"<?xml") or head.startswith(b"<svg") or b"<svg" in head:
        return "svg"
    return None


def open_image(data: bytes, label: str, allowed: tuple[str, ...]):
    """رمزگشایی کامل یک فایل با Pillow، فقط از نوع‌های پذیرفته، و تا سقف پیکسل پیش از خواندن بدنه؛ تصویر متحرک قاب اول."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    if len(data) > MAX_UPLOAD_BYTES:
        raise PermanentFailure("too_large", f"{label}: {number(len(data) / 1024 / 1024)} مگابایت است؛ دست‌بالا 1 مگابایت.")
    kind = kind_of(data)
    names = {"png": "PNG", "webp": "WebP", "jpeg": "JPEG"}
    wanted = " یا ".join(names[k] for k in allowed)
    if kind == "svg":
        raise PermanentFailure("format", f"{label}: SVG پذیرفته نیست، چون اسکریپت می‌پذیرد؛ همان تصویر را {wanted} بارگذاری کن.")
    if kind not in allowed:
        raise PermanentFailure("format", f"{label}: فقط {wanted} پذیرفته است.")
    try:
        img = Image.open(io.BytesIO(data), formats=[names[kind].upper()])
        if img.width * img.height > MAX_PIXELS:
            raise PermanentFailure(
                "too_many_pixels",
                f"{label}: {img.width}×{img.height} پیکسل است؛ دست‌بالا {MAX_PIXELS // 1_000_000} مگاپیکسل.",
            )
        img.seek(0)
        img.load()
        img = ImageOps.exif_transpose(img)
    except PermanentFailure:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError, EOFError) as error:
        raise PermanentFailure("unreadable", f"{label}: خوانده نشد ({type(error).__name__}).") from error
    return img


def rgba(img):
    """هر حالت Pillow به RGBA؛ خاکستری ۱۶ بیتی با مقیاس، که تبدیل مستقیم بالای ۲۵۵ را سفید می‌کرد."""
    if img.mode.startswith("I;16") or img.mode == "I":
        img = img.convert("I").point(lambda v: v * (1 / 256)).convert("L")
    return img.convert("RGBA")


def trimmed(img, label: str):
    """حاشیهٔ شفاف (آلفا زیر ۸ از ۲۵۵) بریده؛ تصویر تمام شفاف پذیرفته نیست."""
    alpha = img.getchannel("A").point(lambda a: 255 if a >= 8 else 0)
    box = alpha.getbbox()
    if box is None:
        raise PermanentFailure("empty", f"{label}: تمام شفاف است.")
    return img.crop(box)


def has_alpha(img) -> bool:
    return img.mode in ("RGBA", "LA") and img.getchannel("A").getextrema()[0] < 255


def check_ratio(width: int, height: int, ratio: tuple[float, float], label: str) -> None:
    value = width / height
    if not ratio[0] <= value <= ratio[1]:
        raise PermanentFailure(
            "ratio",
            f"{label}: نسبت پهنا به ارتفاع {number(value)} است ({width}×{height})؛ باید {number(ratio[0])} تا {number(ratio[1])} باشد.",
        )


def resized(img, width: int, height: int):
    from PIL import Image

    if (width, height) == img.size:
        return img
    return img.resize((max(1, width), max(1, height)), Image.Resampling.LANCZOS)


def png_bytes(img) -> bytes:
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def built(name: str, content_type: str, data: bytes, img, alpha: bool) -> Built:
    if len(data) > MAX_FILE_BYTES:
        raise PermanentFailure("too_large", f"فایل ساختهٔ {name} {len(data)} بایت است؛ دست‌بالا {MAX_FILE_BYTES} بایت.")
    return Built(name, content_type, data, img.width, img.height, alpha)


def logo_source(data: bytes):
    img = trimmed(rgba(open_image(data, "لوگو", ("png", "webp"))), "لوگو")
    width, height = img.size
    if height < LOGO_HEIGHT:
        raise PermanentFailure(
            "too_small",
            f"لوگو: ارتفاع پس از بریدن حاشیهٔ شفاف {height} پیکسل است؛ دست‌کم {LOGO_HEIGHT} پیکسل لازم است، تا سربرگ در صفحهٔ تیز تار نباشد.",
        )
    check_ratio(width, height, LOGO_RATIO, "لوگو")
    return img


def mark_source(data: bytes):
    img = trimmed(rgba(open_image(data, "نشان", ("png", "webp"))), "نشان")
    width, height = img.size
    if min(width, height) < MARK_MIN_SIDE:
        raise PermanentFailure(
            "too_small",
            f"نشان: پس از بریدن حاشیهٔ شفاف {width}×{height} پیکسل است؛ هر ضلع دست‌کم {MARK_MIN_SIDE} پیکسل لازم است.",
        )
    check_ratio(width, height, MARK_RATIO, "نشان")
    return img


def square(source, size: int, *, background: tuple[int, int, int] | None):
    """تصویر وسط مربع: شفاف و تا لبه برای favicon؛ با زمینهٔ مات و سهم ارتفاع و دایرهٔ امن برای آیکون گوشی."""
    from PIL import Image

    width, height = source.size
    if background is None:
        scale = size / max(width, height)
    else:
        scale = min(PHONE_HEIGHT_SHARE * size / height, PHONE_DIAGONAL_SHARE * size / math.hypot(width, height))
    w, h = max(1, round(width * scale)), max(1, round(height * scale))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if background is None else (*background, 255))
    piece = resized(source, w, h)
    canvas.alpha_composite(piece, ((size - w) // 2, (size - h) // 2))
    return canvas if background is None else canvas.convert("RGB")


def favicon(source) -> Built:
    from PIL import Image

    frames = [square(source, size, background=None) for size in ICO_SIZES]
    out = io.BytesIO()
    biggest = frames[-1]
    biggest.save(out, "ICO", sizes=[(s, s) for s in ICO_SIZES], append_images=frames[:-1])
    data = out.getvalue()
    # ICO خوانده‌شده باید همان سه اندازه را داشته باشد؛ بی آن مرورگر favicon خالی می‌گیرد.
    with Image.open(io.BytesIO(data)) as check:
        sizes = sorted(check.info.get("sizes", set()))
    if [s[0] for s in sizes] != list(ICO_SIZES):
        raise PermanentFailure("ico", f"favicon با اندازه‌های {sizes} ساخته شد.")
    return built("favicon", "image/x-icon", data, biggest, True)


def share_image(logo) -> Built:
    """تصویر اشتراک ۱۲۰۰×۶۳۰، طرح الف بی متن: زمینهٔ green-50، لبهٔ پایین green-600، و لوگو وسط ناحیهٔ بالای لبه."""
    from PIL import Image, ImageDraw

    canvas = Image.new("RGBA", OG_SIZE, (*BAND, 255))
    ImageDraw.Draw(canvas).rectangle((0, OG_SIZE[1] - OG_EDGE, OG_SIZE[0], OG_SIZE[1]), fill=(*EDGE, 255))
    width, height = logo.size
    target = min(OG_LOGO_HEIGHT, height)  # بزرگ‌تر از خود لوگو نه، تا تار نشود
    scale = min(target / height, (OG_SIZE[0] - 2 * OG_PADDING) / width)
    w, h = max(1, round(width * scale)), max(1, round(height * scale))
    area = OG_SIZE[1] - OG_EDGE
    canvas.alpha_composite(resized(logo, w, h), ((OG_SIZE[0] - w) // 2, (area - h) // 2))
    image = canvas.convert("RGB")
    return built("og", "image/png", png_bytes(image), image, False)


def logo_files(main: bytes, extra: bytes | None) -> list[Built]:
    """فایل‌های یک لوگو، به ترتیب نام."""
    logo = logo_source(main)
    icon = mark_source(extra) if extra is not None else logo
    width, height = logo.size
    header = resized(logo, round(width * LOGO_HEIGHT / height), LOGO_HEIGHT)
    files = [built("logo", "image/png", png_bytes(header), header, has_alpha(header)), favicon(icon), share_image(logo)]
    for name, size in (("apple", 180), ("icon192", 192), ("icon512", 512)):
        img = square(icon, size, background=PAPER)
        files.append(built(name, "image/png", png_bytes(img), img, False))
    return sorted(files, key=lambda f: f.name)


def banner_file(name: str, data: bytes, rule: BannerRule) -> Built:
    img = open_image(data, rule.label, ("jpeg", "png", "webp"))
    alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    img = rgba(img) if alpha else rgba(img).convert("RGB")
    width, height = img.size
    if width < rule.min_width:
        raise PermanentFailure("too_small", f"{rule.label}: پهنا {width} پیکسل است؛ دست‌کم {rule.min_width} پیکسل لازم است.")
    check_ratio(width, height, rule.ratio, rule.label)
    if width > rule.max_width:
        img = resized(img, rule.max_width, round(height * rule.max_width / width))
    if alpha and has_alpha(img):
        return built(name, "image/png", png_bytes(img), img, True)
    out = io.BytesIO()
    img.convert("RGB").save(out, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return built(name, "image/jpeg", out.getvalue(), img, False)


def banner_files(main: bytes, extra: bytes | None) -> list[Built]:
    files = [banner_file("desktop", main, DESKTOP)]
    if extra is not None:
        files.append(banner_file("mobile", extra, MOBILE))
    return files


def build_site_image(conn: psycopg.Connection, image_id: int | None) -> str:
    """فایل‌های یک بارگذاری، روی همان ردیف؛ خروجی فقط برای لاگ است."""
    if not image_id:
        raise ValueError("کار build_site_image بارگذاری ندارد")
    row = conn.execute(
        "SELECT kind::text, version, main, extra FROM site_images WHERE id = %s AND built_at IS NULL", (image_id,)
    ).fetchone()
    # تراکنش خواندن پیش از ساختن بسته می‌شود: ساختن چند صد میلی‌ثانیه است و ردیف را نگه نمی‌دارد.
    conn.commit()
    if row is None:
        return "بارگذاری دیگر در انتظار ساختن نیست"
    kind, version, main, extra = row
    main = bytes(main)
    extra = bytes(extra) if extra is not None else None
    files = logo_files(main, extra) if kind == "logo" else banner_files(main, extra)
    with conn.transaction():
        state = conn.execute("SELECT built_at FROM site_images WHERE id = %s FOR UPDATE", (image_id,)).fetchone()
        if state is None or state[0] is not None:
            return "بارگذاری همین حالا جای دیگری ساخته شد"
        for f in files:
            conn.execute(
                """INSERT INTO site_image_files (image_id, name, content_type, bytes, width, height, sha256, has_alpha)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (image_id, f.name, f.content_type, f.data, f.width, f.height, f.sha256, f.has_alpha),
            )
        conn.execute("UPDATE site_images SET built_at = now() WHERE id = %s", (image_id,))
    return f"{'لوگو' if kind == 'logo' else 'بنر'} {version}: " + "، ".join(f"{f.name} {f.width}×{f.height}" for f in files)


def mark_image_failed(conn: psycopg.Connection, image_id: int, error: str) -> None:
    """ساخته نشد: خطا روی ردیف، فقط اگر هنوز ساخته نشده؛ کد و پیام کوتاه."""
    message = " ".join(error.split())[:MAX_ERROR] or "build_failed"
    conn.execute("UPDATE site_images SET error = %s, built_at = now() WHERE id = %s AND built_at IS NULL", (message, image_id))


PURGE_SQL = """
DELETE FROM site_images
 WHERE published_at IS NULL AND created_at <= now() - make_interval(days => %(days)s)
"""


def purge_images(conn: psycopg.Connection, days: int = UNPUBLISHED_DAYS) -> int:
    """بارگذاری‌هایی که روی سایت نرفتند، با فایل‌ها و کارشان (کلید خارجی `ON DELETE CASCADE`)؛ خروجی شمارشان."""
    try:
        deleted = conn.execute(PURGE_SQL, {"days": days}).rowcount
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    if deleted:
        log.info("✓ %s بارگذاری تصویر سایت که روی سایت نرفت پاک شد (%s روز پس از بارگذاری)", deleted, days)
    return deleted
