"""
تبدیل خود کارگر (ADR-028): عکس بدون LibreOffice؛ Word و پاورپوینت با LibreOffice
مهارشده — و اینکه فایل آلوده از آن چه چیزی نمی‌گیرد.

تست‌های عکس و مسیرهای بدون LibreOffice همه‌جا اجرا می‌شوند. تست‌های LibreOffice
فقط داخل ایمیج پایه (مثل test_base_image.py) — در CI، همان ایمیجی که روی سرور
می‌رود. هر تست امنیتی یک «شاهد» دارد: همان سند با LibreOffice معمولی، تا معلوم
باشد خطر واقعی است و تست چیزی را می‌سنجد.
"""

import http.server
import io
import os
import shutil
import struct
import subprocess
import threading
import time
import zlib

import fitz
import pytest

Image = pytest.importorskip("PIL.Image")
pytest.importorskip("pillow_heif")

from docworker import convert, formats, sandbox  # noqa: E402
from tests.samples import (  # noqa: E402
    DOCX_CONTENT_TYPES,
    DOCX_RELS,
    docx_paragraph,
    make_docx,
    make_linked_docx,
    make_linked_odt,
    make_macro_odt,
    make_odp,
    make_ole,
    make_zip,
    persian_text,
    word97_stream,
)

IN_BASE_IMAGE = bool(shutil.which("soffice")) and os.path.exists("/etc/fonts/conf.d/61-jozveyar-aliases.conf")
needs_libreoffice = pytest.mark.skipif(not IN_BASE_IMAGE, reason="فقط داخل ایمیج پایهٔ کارگر")


class NoOffice:
    """جای LibreOffice در تست‌هایی که نباید به آن برسند."""

    def to_pdf(self, *args, **kwargs):
        raise AssertionError("LibreOffice نباید اجرا شود")

    def version(self):
        return "none"


def upload(tmp_path, data: bytes) -> str:
    """فایل رسیده، مثل کارگر: بی‌پسوند، در پوشهٔ کار خودش."""
    path = tmp_path / "upload"
    path.write_bytes(data)
    return str(path)


# ── بدون LibreOffice ─────────────────────────────────────────────────────────


def test_pdf_under_any_name_is_not_converted(tmp_path):
    path = upload(tmp_path, b"%PDF-1.4\n...")
    result = convert.to_pdf(path, str(tmp_path), NoOffice())
    assert (result.pdf_path, result.format, result.converted) == (path, "pdf", False)


def test_password_protected_files_never_reach_libreoffice(tmp_path):
    path = str(tmp_path / "upload")
    make_ole(path, {"WordDocument": word97_stream(encrypted=True)})
    with pytest.raises(convert.ConversionFailure) as caught:
        convert.to_pdf(path, str(tmp_path), NoOffice())
    assert caught.value.code == "password_protected"


def test_unknown_content_is_refused_clearly(tmp_path):
    path = str(tmp_path / "upload")
    make_zip(path, {"xl/workbook.xml": "<w/>"})  # اکسل با نام docx
    with pytest.raises(convert.ConversionFailure) as caught:
        convert.to_pdf(path, str(tmp_path), NoOffice())
    assert caught.value.code == "unsupported_format"


def test_only_fonts_that_change_the_layout_are_warned_about():
    """Times New Roman ← Liberation Serif هم‌اندازه است و صفحه‌بندی را عوض نمی‌کند؛
    B Nazanin ← Nazli نه. Calibri بی Carlito (ایمیجی که آن را ندارد) هم نه."""
    substituted = {
        "Times New Roman": "Liberation Serif",
        "B Nazanin": "Nazli",
        "Calibri": "DejaVu Sans",
        "Cambria": "Caladea",
        "Calibri Light": "Noto Sans",  # فقط در پوستهٔ سند؛ در PDF نیامد
    }
    printed = {"nazli", "liberationserif", "dejavusans", "caladea"}
    assert convert.mismatched_fonts(substituted, printed) == ["B Nazanin", "Calibri"]
    assert convert.mismatched_fonts({}, printed) == []
    # PDF خوانده نشد: هشدار زیادی بهتر از هشدار گم‌شده.
    assert convert.mismatched_fonts(substituted, None) == ["B Nazanin", "Calibri", "Calibri Light"]


def test_font_key_matches_pdf_font_names():
    """نام فونت داخل PDF برچسب زیرمجموعه و وزن دارد؛ خانوادهٔ fontconfig فاصله."""
    assert convert.font_key("BAAAAA+NotoSans-Regular") == convert.font_key("Noto Sans") == "notosans"
    assert convert.font_key("CAAAAA+LiberationSerif") == convert.font_key("Liberation Serif")
    assert convert.font_key("DejaVuSans-Bold") == convert.font_key("DejaVu Sans")
    assert convert.font_key("Nazli,Bold") == convert.font_key("Nazli")
    assert convert.font_key("NotoSansArabic-Regular") != convert.font_key("Noto Sans")


# ── عکس ──────────────────────────────────────────────────────────────────────


def jpeg(width, height, color=(240, 230, 200), mode="RGB", orientation=None, block=None) -> bytes:
    img = Image.new(mode, (width, height), color)
    if block:  # مربع قرمز در گوشهٔ بالا-چپِ پیکسل‌های ذخیره‌شده
        img.paste((220, 30, 30), (0, 0, block, block))
    options = {"quality": 90}
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        options["exif"] = exif
    buffer = io.BytesIO()
    img.save(buffer, "JPEG", **options)
    return buffer.getvalue()


def only_image(pdf_path):
    doc = fitz.open(pdf_path)
    page = doc[0]
    images = page.get_images(full=True)
    assert len(images) == 1
    return doc, page, images[0]


def pixel(page, x, y):
    pix = page.get_pixmap(clip=fitz.Rect(x, y, x + 1, y + 1), colorspace=fitz.csRGB, alpha=False)
    return tuple(pix.samples[:3])


def test_phone_jpeg_goes_in_untouched(tmp_path):
    """کیفیت چاپ همان است که کاربر فرستاد: JPEG سالم دوباره فشرده نمی‌شود."""
    data = jpeg(2480, 3508)
    result = convert.to_pdf(upload(tmp_path, data), str(tmp_path), NoOffice())
    assert (result.format, result.source_pages, result.converted) == ("jpeg", 1, True)
    assert result.engine.startswith("pillow-")
    doc, page, image = only_image(result.pdf_path)
    with doc:
        assert (round(page.rect.width), round(page.rect.height)) == (595, 842)
        assert image[8] == "DCTDecode"
        assert doc.xref_stream_raw(image[0]) == data


def test_wide_photo_gets_a_landscape_page(tmp_path):
    result = convert.to_pdf(upload(tmp_path, jpeg(4000, 3000)), str(tmp_path), NoOffice())
    doc, page, _ = only_image(result.pdf_path)
    with doc:
        assert (round(page.rect.width), round(page.rect.height)) == (842, 595)


def test_phone_rotation_is_applied(tmp_path):
    """عکس گوشی افقی ذخیره می‌شود و EXIF می‌گوید «۹۰ درجه بچرخان» (orientation=6)."""
    data = jpeg(400, 300, orientation=6, block=80)
    result = convert.to_pdf(upload(tmp_path, data), str(tmp_path), NoOffice())
    doc, page, image = only_image(result.pdf_path)
    with doc:
        assert (round(page.rect.width), round(page.rect.height)) == (595, 842)
        assert (image[2], image[3]) == (300, 400)
        # بالا-چپ ذخیره‌شده، بعد از چرخش ساعت‌گرد، بالا-راست دیده می‌شود.
        red = pixel(page, 560, 60)
        assert red[0] > 180 and red[1] < 90, red
        paper = pixel(page, 40, 60)
        assert paper[0] > 200 and paper[1] > 200, paper


def test_transparent_screenshot_is_printed_on_white(tmp_path):
    img = Image.new("RGBA", (400, 600), (0, 0, 0, 0))
    img.paste((0, 0, 0, 255), (100, 100, 200, 200))
    buffer = io.BytesIO()
    img.save(buffer, "PNG")
    result = convert.to_pdf(upload(tmp_path, buffer.getvalue()), str(tmp_path), NoOffice())
    assert result.format == "png"
    doc, page, image = only_image(result.pdf_path)
    with doc:
        assert image[1] == 0  # بدون ماسک شفافیت
        assert image[8] == "FlateDecode"  # اسکرین‌شات بی‌افت
        assert pixel(page, 220, 210) == (0, 0, 0)
        assert pixel(page, 400, 700) == (255, 255, 255)


def test_cmyk_jpeg_is_turned_into_rgb(tmp_path):
    data = jpeg(300, 400, color=(0, 255, 255, 0), mode="CMYK")
    result = convert.to_pdf(upload(tmp_path, data), str(tmp_path), NoOffice())
    doc, page, image = only_image(result.pdf_path)
    with doc:
        assert doc.extract_image(image[0])["colorspace"] == 3  # سه کانال، نه چهار
        assert doc.xref_stream_raw(image[0]) != data
        red = pixel(page, 300, 400)
        assert red[0] > 200 and red[1] < 60 and red[2] < 60, red


def test_iphone_heic(tmp_path):
    import pillow_heif

    heif = pillow_heif.from_pillow(Image.new("RGB", (1200, 1600), (200, 200, 200)))
    buffer = io.BytesIO()
    heif.save(buffer, quality=80)
    result = convert.to_pdf(upload(tmp_path, buffer.getvalue()), str(tmp_path), NoOffice())
    assert result.format == "heif"
    doc, page, image = only_image(result.pdf_path)
    with doc:
        assert (round(page.rect.width), round(page.rect.height)) == (595, 842)
        assert (image[2], image[3]) == (1200, 1600)


def test_16_bit_grayscale_scan_keeps_its_tones(tmp_path):
    """اسکنر خاکستری ۱۶ بیتی می‌دهد؛ تبدیل سادهٔ Pillow همه را سفید می‌کرد."""
    buffer = io.BytesIO()
    Image.new("I;16", (300, 400), 40000).save(buffer, "PNG")  # ۶۱٪ روشنایی
    result = convert.to_pdf(upload(tmp_path, buffer.getvalue()), str(tmp_path), NoOffice())
    doc, page, _ = only_image(result.pdf_path)
    with doc:
        gray = pixel(page, 300, 400)
        assert all(150 <= channel <= 162 for channel in gray), gray


def test_truncated_jpeg_is_refused_not_printed_half(tmp_path):
    data = jpeg(1200, 1600)
    with pytest.raises(convert.ConversionFailure) as caught:
        convert.to_pdf(upload(tmp_path, data[: len(data) // 2]), str(tmp_path), NoOffice())
    assert caught.value.code == "image_unreadable"


def test_oversized_image_is_scaled_to_print_resolution(tmp_path):
    buffer = io.BytesIO()
    Image.new("L", (9000, 300), 128).save(buffer, "PNG")
    result = convert.to_pdf(upload(tmp_path, buffer.getvalue()), str(tmp_path), NoOffice())
    doc, _, image = only_image(result.pdf_path)
    with doc:
        assert max(image[2], image[3]) == convert.MAX_IMAGE_SIDE


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


def test_image_bomb_is_refused_before_decoding(tmp_path):
    """سرآیند PNG که ادعای ۴۰۰ مگاپیکسل دارد: باز کردنش ۱٫۲ گیگابایت رم می‌خواست."""
    ihdr = struct.pack(">IIBBBBB", 20000, 20000, 8, 2, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(b"\0" * 64)) + _chunk(b"IEND", b"")
    with pytest.raises(convert.ConversionFailure) as caught:
        convert.to_pdf(upload(tmp_path, data), str(tmp_path), NoOffice())
    assert caught.value.code == "image_too_large"


def test_broken_image_has_a_clear_reason(tmp_path):
    with pytest.raises(convert.ConversionFailure) as caught:
        convert.to_pdf(upload(tmp_path, b"\xff\xd8\xff\xe0" + b"\x13" * 200), str(tmp_path), NoOffice())
    assert caught.value.code == "image_unreadable"


# ── LibreOffice ──────────────────────────────────────────────────────────────

# ۱۲۰ پاراگراف فارسی ۱۴ پوینتی با «B Nazanin» — که در ایمیج نیست و Nazli جایش
# می‌نشیند (ADR-027). تعداد صفحه یعنی قیمت؛ اگر نسخهٔ LibreOffice یا فونت‌ها عوض شود
# و این عدد تکان بخورد، باید دانسته باشد.
PERSIAN_WORD_PAGES = 11


@pytest.fixture(scope="module")
def office(tmp_path_factory):
    return convert.LibreOffice(root=str(tmp_path_factory.mktemp("lo-profile")))


def fc_match(name: str) -> str:
    return subprocess.run(["fc-match", "-f", "%{family[0]}", name], capture_output=True, text=True).stdout.strip()


def plain_libreoffice(source: str, out_dir: str, target: str = "pdf", profile_xcu: str | None = None) -> str:
    """LibreOffice با پروفایل پیش‌فرض — شاهد تست‌های امنیتی، و سازندهٔ doc و ppt نمونه."""
    profile = os.path.join(out_dir, f"plain-profile-{target}")
    if profile_xcu:
        os.makedirs(os.path.join(profile, "user"), exist_ok=True)
        with open(os.path.join(profile, "user", "registrymodifications.xcu"), "w", encoding="utf-8") as f:
            f.write(profile_xcu)
    subprocess.run(
        [convert.SOFFICE, f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
         "--convert-to", target, "--outdir", out_dir, source],
        capture_output=True, timeout=180, env=sandbox.clean_env(out_dir),
    )
    return os.path.join(out_dir, os.path.splitext(os.path.basename(source))[0] + "." + target)


def page_texts(pdf_path: str) -> list[str]:
    with fitz.open(pdf_path) as doc:
        return [page.get_text().strip() for page in doc]


@needs_libreoffice
def test_persian_word_becomes_pdf_and_says_what_happened(tmp_path, office):
    source = str(tmp_path / "upload")
    make_docx(source, [docx_paragraph(persian_text(i + 1, 40), "B Nazanin") for i in range(120)], app_pages=12)
    result = convert.to_pdf(source, str(tmp_path), office)

    record = result.record()
    assert record["format"] == "docx"
    assert record["engine"] == f"libreoffice-{office.version()}"
    assert record["sourcePages"] == 12  # آنچه «Word» نوشته، برای سنجیدن با تبدیل ما
    assert record["fonts"]["requested"] == ["B Nazanin"]
    used = fc_match("B Nazanin")
    assert record["fonts"]["substituted"] == ({} if used == "B Nazanin" else {"B Nazanin": used})
    assert record["fonts"]["mismatched"] == ([] if used == "B Nazanin" else ["B Nazanin"])

    with fitz.open(result.pdf_path) as doc:
        assert (round(doc[0].rect.width), round(doc[0].rect.height)) == (595, 842)
        if used == "Nazli":  # فونت خصوصی واقعی نصب نیست — همان وضعیت CI
            assert doc.page_count == PERSIAN_WORD_PAGES


@needs_libreoffice
def test_latin_text_in_times_new_roman_is_not_a_font_warning(tmp_path, office):
    """جزوهٔ فارسی معمولی: متن B Nazanin، اعداد و کلمه‌های لاتین Times New Roman. فقط
    اولی هشدار می‌گیرد — ایمیج برای دومی جایگزین هم‌اندازه دارد."""
    source = str(tmp_path / "upload")
    make_docx(source, [
        docx_paragraph(persian_text(3, 30), "B Nazanin"),
        docx_paragraph("Fourier series and the heat equation", "Times New Roman", rtl=False),
    ], theme=True)
    fonts = convert.to_pdf(source, str(tmp_path), office).record()["fonts"]
    assert fonts["substituted"].get("Times New Roman") == "Liberation Serif"
    # «Calibri Light» سرتیترهای پوسته در هر Word هست و جایگزینش هم‌اندازه نیست — ولی
    # این سند سرتیتر ندارد و جایگزینش در PDF نیامده: هشدارش فقط سردرگمی بود.
    assert "Calibri Light" in fonts["requested"]
    assert "Calibri Light" not in fonts["mismatched"]
    used = fc_match("B Nazanin")
    assert fonts["mismatched"] == ([] if used == "B Nazanin" else ["B Nazanin"])
    assert "Times New Roman" not in fonts["mismatched"]


@needs_libreoffice
def test_hidden_slides_are_not_printed_or_priced(tmp_path, office):
    deck = str(tmp_path / "deck.odp")
    make_odp(deck, ["یک", "دو", "سه", "چهار"], hidden={2})
    pptx = plain_libreoffice(deck, str(tmp_path), "pptx")

    work = tmp_path / "work"
    work.mkdir()
    shutil.copy(pptx, work / "upload")
    result = convert.to_pdf(str(work / "upload"), str(work), office)
    assert result.format == "pptx"
    assert page_texts(result.pdf_path) == ["یک", "سه", "چهار"]
    with fitz.open(result.pdf_path) as doc:
        assert doc[0].rect.width > doc[0].rect.height  # اسلاید افقی، نه A4


@needs_libreoffice
def test_word_97_and_powerpoint_97(tmp_path, office):
    docx = str(tmp_path / "old.docx")
    make_docx(docx, [docx_paragraph(persian_text(7, 30), "B Nazanin")])
    deck = str(tmp_path / "old.odp")
    make_odp(deck, ["یک", "دو"])
    cases = [(plain_libreoffice(docx, str(tmp_path), "doc"), formats.DOC, 1),
             (plain_libreoffice(deck, str(tmp_path), "ppt"), formats.PPT, 2)]
    for path, fmt, pages in cases:
        assert formats.sniff(path) == fmt
        work = tmp_path / fmt
        work.mkdir()
        shutil.copy(path, work / "upload")
        result = convert.to_pdf(str(work / "upload"), str(work), office)
        assert result.format == fmt
        with fitz.open(result.pdf_path) as doc:
            assert doc.page_count == pages


@needs_libreoffice
def test_broken_word_fails_clearly_and_the_next_file_still_converts(tmp_path, office):
    broken = tmp_path / "broken"
    broken.mkdir()
    make_zip(str(broken / "upload"), {
        "[Content_Types].xml": DOCX_CONTENT_TYPES, "_rels/.rels": DOCX_RELS, "word/document.xml": "not xml <<<",
    })
    with pytest.raises(convert.ConversionFailure) as caught:
        convert.to_pdf(str(broken / "upload"), str(broken), office)
    assert caught.value.code == "convert_failed"

    good = tmp_path / "good"
    good.mkdir()
    make_docx(str(good / "upload"), [docx_paragraph("جزوه", "Vazirmatn")])
    assert page_texts(convert.to_pdf(str(good / "upload"), str(good), office).pdf_path) == ["جزوه"]


def _live_processes_using(profile: str) -> list[int]:
    found = []
    for pid in filter(str.isdigit, os.listdir("/proc")):
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                if profile.encode() in f.read():
                    found.append(int(pid))
        except OSError:
            pass
    return found


@needs_libreoffice
def test_no_libreoffice_survives_a_conversion(tmp_path, office):
    """نمونهٔ ماندهٔ LibreOffice تبدیل بعدی را از لوله‌اش می‌گیرد و سقف زمان را دور
    می‌زند؛ بعد از هر تبدیل هیچ پردازه‌ای با پروفایل ما نباید بماند."""
    make_docx(str(tmp_path / "upload"), [docx_paragraph("جزوه", "Vazirmatn")])
    convert.to_pdf(str(tmp_path / "upload"), str(tmp_path), office)
    print("کشته‌شده‌های بعد از تبدیل:", office.stragglers)  # نشانهٔ LibreOffice جداشده
    assert _live_processes_using(office.profile) == []


@needs_libreoffice
def test_timeout_kills_libreoffice_and_the_next_file_still_converts(tmp_path, office):
    # ۳۰۰۰ پاراگراف (~۵۰۰ صفحه): چند ثانیه روی هر ماشینی، پس سقف ۰٫۵ ثانیه حتماً می‌رسد.
    make_docx(str(tmp_path / "source.docx"), [docx_paragraph(persian_text(i + 1, 60), "B Nazanin") for i in range(3000)])
    assert _live_processes_using(office.profile) == []  # تبدیل قبلی چیزی جا نگذاشته
    with pytest.raises(convert.ConversionFailure) as caught:
        office.to_pdf(str(tmp_path / "source.docx"), formats.DOCX, str(tmp_path), timeout=0.5)
    assert caught.value.code == "convert_timeout"
    deadline = time.monotonic() + 5  # SIGKILL رسیده؛ مردن چند میلی‌ثانیه طول می‌کشد
    while _live_processes_using(office.profile) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert _live_processes_using(office.profile) == []

    good = tmp_path / "good"
    good.mkdir()
    make_docx(str(good / "upload"), [docx_paragraph("جزوه", "Vazirmatn")])
    assert page_texts(convert.to_pdf(str(good / "upload"), str(good), office).pdf_path) == ["جزوه"]


@pytest.fixture
def web_server():
    """سرور HTTP محلی که هر درخواستی را ثبت می‌کند — جای اینترنت و سرویس‌های داخلی."""
    hits: list[str] = []
    pixel_png = io.BytesIO()
    Image.new("RGB", (1, 1), (255, 0, 0)).save(pixel_png, "PNG")

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            hits.append(f"{self.command} {self.path}")
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(pixel_png.getvalue())))
            self.end_headers()
            self.wfile.write(pixel_png.getvalue())

        do_HEAD = do_OPTIONS = do_PROPFIND = do_GET  # noqa: N815

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}", hits
    server.shutdown()


@needs_libreoffice
@pytest.mark.parametrize("make, ext", [(make_linked_docx, "docx"), (make_linked_odt, "odt")], ids=["docx", "odt"])
def test_linked_images_are_never_fetched(tmp_path, office, web_server, make, ext):
    """سند می‌تواند عکسش را از هر آدرسی بخواهد — اینترنت، یا Garage و پستگرس و وب
    روی همین شبکهٔ داکر. LibreOffice معمولی می‌رود و می‌آوردش."""
    base, hits = web_server
    source = str(tmp_path / f"linked.{ext}")
    make(source, f"{base}/linked.png")

    plain_libreoffice(source, str(tmp_path))
    if not hits:
        pytest.skip("LibreOffice این ایمیج حتی بدون پروفایل ما هم لینک را واکشی نکرد")
    hits.clear()

    work = tmp_path / "work"
    work.mkdir()
    shutil.copy(source, work / "upload")
    convert.to_pdf(str(work / "upload"), str(work), office)
    assert hits == []


@needs_libreoffice
def test_local_files_never_end_up_in_the_pdf(tmp_path, office):
    """عکس لینک‌شده به `file:///…`: LibreOffice معمولی فایل محلی را داخل PDF می‌گذارد —
    هر فایلی که کاربر docworker بخواند، مثلاً فایل کاربر دیگری که در حال تبدیل است."""
    secret = tmp_path / "secret.png"
    Image.new("RGB", (64, 64), (255, 0, 0)).save(secret)
    source = str(tmp_path / "linked.docx")
    make_linked_docx(source, f"file://{secret}")

    with fitz.open(plain_libreoffice(source, str(tmp_path))) as doc:
        if not doc[0].get_images():
            pytest.skip("LibreOffice این ایمیج حتی بدون پروفایل ما هم فایل محلی را نگذاشت")

    work = tmp_path / "work"
    work.mkdir()
    shutil.copy(source, work / "upload")
    with fitz.open(convert.to_pdf(str(work / "upload"), str(work), office).pdf_path) as doc:
        assert doc[0].get_images() == []


LOW_MACRO_SECURITY = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>0</value></prop></item>
</oor:items>
"""


@needs_libreoffice
def test_document_macros_never_run(tmp_path, office):
    marker = tmp_path / "macro-ran"
    source = str(tmp_path / "macro.odt")
    make_macro_odt(source, str(marker))

    plain_libreoffice(source, str(tmp_path), profile_xcu=LOW_MACRO_SECURITY)
    if not marker.exists():
        pytest.skip("LibreOffice این ایمیج ماکروی Basic را اصلاً اجرا نمی‌کند (بدون اجراکنندهٔ Basic)")
    marker.unlink()

    work = tmp_path / "work"
    work.mkdir()
    shutil.copy(source, work / "upload")
    convert.to_pdf(str(work / "upload"), str(work), office)
    assert not marker.exists()
