"""
تبدیل Word، پاورپوینت و عکس به PDF (ADR-028) — بعدش همان تحلیل و همان قیمت.

- **Word و پاورپوینت** با LibreOffice بدون رابط گرافیکی (ایمیج پایه، ADR-027): یک
  پردازه در هر تبدیل، مهارشده (`sandbox.py`)، با پروفایلی که ماکرو را خاموش و شبکه
  را بسته کرده.
- **عکس** بدون LibreOffice: Pillow (و pillow-heif برای HEIC آیفون) و PyMuPDF. هر
  عکس یک صفحهٔ A4، عمودی یا افقی به تناسب خود عکس، با چرخش EXIF موبایل. JPEG
  سالم بدون فشرده‌سازی دوباره جا می‌گیرد: کیفیت چاپ همان است که کاربر فرستاد.

فرمت از محتواست (`formats.sniff`)، نه از پسوند. PDF‌ای که با نام دیگر آمده تبدیل
نمی‌شود؛ همان مستقیم تحلیل می‌شود.
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field

import fitz

from . import formats, sandbox

log = logging.getLogger("docworker.convert")

SOFFICE = shutil.which("soffice") or "/usr/bin/soffice"
TIMEOUT_SECONDS = float(os.environ.get("DOCWORKER_CONVERT_TIMEOUT", "300"))
# هیچ فایلی بزرگ‌تر از این نوشته نمی‌شود (RLIMIT_FSIZE) — بالاتر از هر جزوهٔ واقعی.
MAX_OUTPUT_BYTES = 4 * 1024**3

A4 = (595.0, 842.0)
# بزرگ‌ترین بُعد عکس روی صفحه: A4 با ۶۰۰ DPI. بیشتر از این در چاپ دیده نمی‌شود و فقط
# رم می‌خورد (عکس ۲۰۰ مگاپیکسلی گوشی‌های امروز).
MAX_IMAGE_SIDE = 7016
# سقف پیکسل، پیش از باز کردن. JPEG با draft ارزان و کوچک‌شده باز می‌شود، پس عکس ۲۰۰
# مگاپیکسلی گوشی امن است؛ بقیهٔ فرمت‌ها کامل باز می‌شوند — ۱۰۰ مگاپیکسل RGBA یعنی
# ۴۰۰ مگابایت رم، با کپی‌هایش حدود یک گیگابایت از سقف ۲ گیگابایتی کانتینر.
MAX_JPEG_PIXELS = 400_000_000
MAX_DECODED_PIXELS = 100_000_000

# خروجی PDF صریح، نه پیش‌فرض نسخه: همان فایل همیشه همان PDF. عکس‌ها تا ۳۰۰ DPI (کیفیت
# چاپ)، اسلاید مخفی و یادداشت سخنران چاپ نمی‌شوند.
PDF_OPTIONS = {
    "ReduceImageResolution": {"type": "boolean", "value": "true"},
    "MaxImageResolution": {"type": "long", "value": "300"},
    "Quality": {"type": "long", "value": "90"},
    "UseTaggedPDF": {"type": "boolean", "value": "false"},
    "ExportNotes": {"type": "boolean", "value": "false"},
    "ExportNotesPages": {"type": "boolean", "value": "false"},
    "ExportHiddenSlides": {"type": "boolean", "value": "false"},
}

# پروفایل مهارشدهٔ LibreOffice (سنجیده در tests/test_convert.py):
# - ماکرو: بالاترین سطح امنیت و اجرای ماکرو کاملاً خاموش.
# - لینک: ارجاع از سند نامطمئن مسدود (BlockUntrustedRefererLinks). LibreOffice معمولی
#   عکس لینک‌شده را هم از اینترنت و سرویس‌های داخلی (پستگرس، Garage، وب) می‌کشد، هم از
#   فایل محلی (`file:///…`) و داخل PDF می‌گذارد؛ این یکی هر دو را می‌بندد.
# - شبکه: همهٔ HTTP/HTTPS/FTP به پراکسی مرده (127.0.0.1:9). دیوار دوم، مستقل از اولی:
#   هر کدام به‌تنهایی جلوی واکشی را می‌گیرد.
# - لینک و فیلد بیرونی هرگز به‌روز نمی‌شود.
HARDENED_PROFILE = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="BlockUntrustedRefererLinks" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetProxyType" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPProxyName" oor:op="fuse"><value>127.0.0.1</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPProxyPort" oor:op="fuse"><value>9</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPSProxyName" oor:op="fuse"><value>127.0.0.1</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetHTTPSProxyPort" oor:op="fuse"><value>9</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetFTPProxyName" oor:op="fuse"><value>127.0.0.1</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetFTPProxyPort" oor:op="fuse"><value>9</value></prop></item>
<item oor:path="/org.openoffice.Inet/Settings"><prop oor:name="ooInetNoProxy" oor:op="fuse"><value></value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Field" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
</oor:items>
"""


class ConversionFailure(Exception):
    """شکست قطعی تبدیل؛ `code` همان کدی است که مرورگر برایش پیام فارسی دارد."""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


@dataclass
class Converted:
    """نتیجهٔ تبدیل. `pdf_path` برای PDF همان فایل ورودی است (تبدیلی لازم نبود)."""

    pdf_path: str
    format: str
    engine: str
    elapsed_ms: int
    source_pages: int | None = None
    fonts: dict = field(default_factory=dict)

    @property
    def converted(self) -> bool:
        return self.engine != "none"

    def record(self) -> dict:
        """ستون `documents.conversion` — خام، برای سنجیدن بعدی."""
        return {
            "format": self.format,
            "engine": self.engine,
            "elapsedMs": self.elapsed_ms,
            "sourcePages": self.source_pages,
            "fonts": self.fonts,
        }


class LibreOffice:
    """پروفایل گرم و مهارشدهٔ LibreOffice، یکی برای هر پردازهٔ کارگر.

    پروفایل در `/tmp` همین کانتینر است، نه جای مشترک: کارگر بی‌حالت می‌ماند و
    ساختن دوباره‌اش فقط اولین تبدیل را چند ثانیه کندتر می‌کند.
    """

    def __init__(self, root: str | None = None):
        self.profile = root or os.path.join(tempfile.gettempdir(), f"docworker-lo-{os.getpid()}")
        self._version: str | None = None
        # پردازه‌هایی که بعد از آخرین تبدیل مانده بودند و کشته شدند — باید همیشه خالی باشد.
        self.stragglers: list[int] = []

    def _ensure_profile(self) -> None:
        user = os.path.join(self.profile, "user")
        os.makedirs(user, exist_ok=True)
        path = os.path.join(user, "registrymodifications.xcu")
        if not os.path.exists(path):
            with open(path, "w", encoding="utf-8") as f:
                f.write(HARDENED_PROFILE)

    def reset(self) -> None:
        """پروفایل خراب (LibreOffice وسط کار مرد) دور ریخته می‌شود."""
        shutil.rmtree(self.profile, ignore_errors=True)

    def version(self) -> str:
        if self._version is None:
            try:
                out = subprocess.run(
                    [SOFFICE, "--version"], capture_output=True, text=True, timeout=60,
                    env=sandbox.clean_env(tempfile.gettempdir()),
                ).stdout
                self._version = out.split()[1] if out.startswith("LibreOffice") else "unknown"
            except (OSError, subprocess.TimeoutExpired, IndexError):
                self._version = "unknown"
        return self._version

    def to_pdf(self, source: str, fmt: str, workdir: str, timeout: float = TIMEOUT_SECONDS) -> str:
        try:
            return self._run(source, fmt, workdir, timeout)
        except ConversionFailure as failure:
            if failure.code != "convert_failed":
                raise  # سقف زمان و حافظه دوباره هم همان می‌شود
        # فایلی که باز نشد معمولاً واقعاً خراب است؛ ولی یک تلاش دیگر با پروفایل تازه
        # ارزان است و شکست گذرا (پروفایل خراب، کرش تصادفی) را از فایل خراب جدا می‌کند.
        return self._run(source, fmt, workdir, timeout)

    def _run(self, source: str, fmt: str, workdir: str, timeout: float) -> str:
        self._ensure_profile()
        export = "writer_pdf_Export" if fmt in formats.WRITER else "impress_pdf_Export"
        cmd = [
            SOFFICE,
            f"-env:UserInstallation=file://{self.profile}",
            "--headless", "--invisible", "--norestore", "--nologo", "--nodefault", "--nolockcheck",
            "--convert-to", f"pdf:{export}:{json.dumps(PDF_OPTIONS, separators=(',', ':'))}",
            "--outdir", workdir,
            source,
        ]
        outcome = sandbox.run_confined(cmd, cwd=workdir, timeout=timeout, max_file_bytes=MAX_OUTPUT_BYTES)
        # کشتن گروه پردازه به LibreOffice‌ای که خودش را جدا کرده نمی‌رسد؛ پروفایل ما در
        # خط فرمان هر پردازهٔ آن هست.
        self.stragglers = sandbox.kill_processes_with(f"-env:UserInstallation=file://{self.profile}\0")
        if self.stragglers:
            log.warning("LibreOffice بعد از تبدیل مانده بود و کشته شد: %s", self.stragglers)
        output = os.path.join(workdir, os.path.splitext(os.path.basename(source))[0] + ".pdf")
        if outcome.timed_out:
            self.reset()
            raise ConversionFailure("convert_timeout", f"بیش از {timeout:.0f} ثانیه")
        if outcome.oom_killed or outcome.returncode in (-9, -25):  # SIGKILL، SIGXFSZ
            self.reset()
            raise ConversionFailure("too_heavy", outcome.stderr)
        if outcome.returncode != 0 or not os.path.exists(output) or os.path.getsize(output) == 0:
            self.reset()
            # LibreOffice فایلی را که نتوانست باز کند بی‌خروجی و گاهی با کد صفر رها می‌کند.
            raise ConversionFailure("convert_failed", outcome.stderr or f"rc={outcome.returncode}")
        return output


def substituted_fonts(requested: list[str]) -> dict[str, str]:
    """فونت خواسته‌شده ← فونتی که واقعاً به کار رفت، فقط برای آنهایی که فرق دارند."""
    out: dict[str, str] = {}
    for name in requested:
        try:
            used = subprocess.run(
                ["fc-match", "-f", "%{family[0]}", name], capture_output=True, text=True, timeout=10
            ).stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            continue
        if used and used.replace(" ", "").lower() != name.replace(" ", "").lower():
            out[name] = used
    return out


def office_to_pdf(office: LibreOffice, source: str, fmt: str, workdir: str) -> Converted:
    started = time.monotonic()
    # نام ساده و پسوند درست: LibreOffice از پسوند هم برای انتخاب فیلتر کمک می‌گیرد.
    named = os.path.join(workdir, f"source.{fmt}")
    if os.path.abspath(source) != named:
        os.replace(source, named)
    requested = formats.requested_fonts(named, fmt)
    pages = formats.office_page_count(named, fmt)
    pdf = office.to_pdf(named, fmt, workdir)
    return Converted(
        pdf_path=pdf,
        format=fmt,
        engine=f"libreoffice-{office.version()}",
        elapsed_ms=round((time.monotonic() - started) * 1000),
        source_pages=pages,
        fonts={"requested": requested, "substituted": substituted_fonts(requested)},
    )


def image_to_pdf(source: str, workdir: str) -> Converted:
    from PIL import Image, ImageOps, UnidentifiedImageError
    import PIL
    import pillow_heif

    pillow_heif.register_heif_opener()
    # پیش‌فرض Pillow بالای ۱۷۸ مگاپیکسل را «بمب» می‌داند و عکس ۲۰۰ مگاپیکسلی گوشی را رد
    # می‌کند؛ سقف واقعی را خودمان، به تفکیک فرمت، پایین‌تر می‌گذاریم.
    Image.MAX_IMAGE_PIXELS = MAX_JPEG_PIXELS
    started = time.monotonic()
    try:
        with Image.open(source) as img:
            kind = (img.format or "image").lower()
            limit = MAX_JPEG_PIXELS if kind == "jpeg" else MAX_DECODED_PIXELS
            if img.width * img.height > limit:
                raise ConversionFailure("image_too_large", f"{img.width}x{img.height}")
            orientation = img.getexif().get(0x0112, 1)
            passthrough = (
                kind == "jpeg"
                and orientation == 1
                and img.mode in ("RGB", "L")
                and max(img.size) <= MAX_IMAGE_SIDE
            )
            if passthrough:
                img.load()  # JPEG بریده همین‌جا رد می‌شود، نه نیمه‌کاره در چاپ
                width, height = img.size
                with open(source, "rb") as f:
                    stream = f.read()
            else:
                if kind == "jpeg" and max(img.size) > MAX_IMAGE_SIDE:
                    img.draft("RGB", (MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))  # کوچک‌سازی ارزان JPEG
                img = ImageOps.exif_transpose(img)
                img = _flatten(img)
                if max(img.size) > MAX_IMAGE_SIDE:
                    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
                width, height = img.size
                buffer = io.BytesIO()
                if kind == "png":
                    img.save(buffer, "PNG", optimize=False)  # اسکرین‌شات: بی‌افت
                else:
                    img.save(buffer, "JPEG", quality=92, optimize=True)
                stream = buffer.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as error:
        code = "image_too_large" if isinstance(error, Image.DecompressionBombError) else "image_unreadable"
        raise ConversionFailure(code, str(error)) from error

    page_w, page_h = A4 if height >= width else (A4[1], A4[0])
    scale = min(page_w / width, page_h / height)
    w, h = width * scale, height * scale
    rect = fitz.Rect((page_w - w) / 2, (page_h - h) / 2, (page_w + w) / 2, (page_h + h) / 2)
    out = os.path.join(workdir, "image.pdf")
    doc = fitz.open()
    try:
        page = doc.new_page(width=page_w, height=page_h)
        page.insert_image(rect, stream=stream)
        doc.save(out, deflate=True)
    finally:
        doc.close()
    return Converted(
        pdf_path=out,
        format=kind,
        engine=f"pillow-{PIL.__version__}+pymupdf-{fitz.VersionBind}",
        elapsed_ms=round((time.monotonic() - started) * 1000),
        source_pages=1,
    )


def _flatten(img):
    """شفافیت روی کاغذ سفید؛ CMYK و بقیه به RGB؛ خاکستری همان خاکستری."""
    from PIL import Image

    if img.mode.startswith("I;16") or img.mode == "I":
        # خاکستری ۱۶ بیتی اسکنر: تبدیل مستقیم Pillow هر مقدار بالای ۲۵۵ را سفید می‌کند.
        return img.convert("I").point(lambda v: v * (1 / 256)).convert("L")
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        white = Image.new("RGB", rgba.size, (255, 255, 255))
        white.paste(rgba, mask=rgba.getchannel("A"))
        return white
    if img.mode in ("L", "RGB"):
        return img
    return img.convert("RGB")


def to_pdf(source: str, workdir: str, office: LibreOffice) -> Converted:
    """فایل رسیده، هر چه باشد، به PDF — یا شکست قطعی با کد روشن."""
    fmt = formats.sniff(source)
    if fmt == formats.PDF:
        return Converted(pdf_path=source, format=fmt, engine="none", elapsed_ms=0)
    if fmt == formats.ENCRYPTED:
        raise ConversionFailure("password_protected")
    if fmt == formats.IMAGE:
        return image_to_pdf(source, workdir)
    if fmt in formats.CONVERTIBLE:
        return office_to_pdf(office, source, fmt, workdir)
    raise ConversionFailure("unsupported_format", fmt)
