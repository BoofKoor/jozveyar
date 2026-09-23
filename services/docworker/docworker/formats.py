"""
فرمت فایل از محتوا، نه از پسوند (ADR-028) — همان درس فایل پست (CLAUDE.md).

پسوند فقط ادعای کاربر است: «جزوه.docx» ممکن است PDF باشد، «عکس.jpg» ممکن است
PNG، و «درس.docx» ممکن است Word رمزدار باشد که Office آن را در ظرف OLE2 می‌پیچد.
کارگر فقط به همین امضاها اعتماد می‌کند.

بعلاوه دو چیزی که از خود فایل Office خوانده می‌شود، بدون LibreOffice:
- تعداد صفحه‌ای که خود Word یا پاورپوینت موقع ذخیره نوشته (`docProps/app.xml`) —
  با فونت‌های خود کاربر، پس بهترین شاهد برای سنجیدن تبدیل ما.
- فونت‌هایی که سند خواسته — تا معلوم شود کدام جایگزین شد (ADR-027).
"""

from __future__ import annotations

import html
import re
import struct
import zipfile

PDF = "pdf"
DOCX = "docx"
DOC = "doc"
ODT = "odt"
RTF = "rtf"
PPTX = "pptx"
PPT = "ppt"
ODP = "odp"
IMAGE = "image"
# Word یا پاورپوینت رمزدار: Office فایل OOXML رمزدار را در ظرف OLE2 می‌گذارد.
ENCRYPTED = "encrypted"
UNSUPPORTED = "unsupported"

WRITER = frozenset({DOCX, DOC, ODT, RTF})
IMPRESS = frozenset({PPTX, PPT, ODP})
# هر چیزی که کارگر به PDF تبدیل می‌کند.
CONVERTIBLE = WRITER | IMPRESS | {IMAGE}

OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1", b"avif"}

# هیچ بخش XML بزرگ‌تر از این باز نمی‌شود: فایل zip بمب نباید کارگر را بکشد.
MAX_XML_BYTES = 64 * 1024 * 1024


def sniff(path: str) -> str:
    """فرمت واقعی فایل."""
    with open(path, "rb") as f:
        head = f.read(8192)
    # استاندارد PDF زباله قبل از سرآیند را تا ۱۰۲۴ بایت می‌پذیرد، و فایل واقعی دارد.
    if b"%PDF-" in head[:1024]:
        return PDF
    if head.startswith(b"PK\x03\x04"):
        return _zip_kind(path)
    if head.startswith(OLE_MAGIC):
        return _ole_kind(path)
    if head.startswith(b"{\\rtf"):
        return RTF
    if _is_image(head):
        return IMAGE
    return UNSUPPORTED


def _is_image(head: bytes) -> bool:
    return (
        head.startswith(b"\xff\xd8\xff")  # JPEG
        or head.startswith(b"\x89PNG\r\n\x1a\n")
        or (head[:4] == b"RIFF" and head[8:12] == b"WEBP")
        or (head[4:8] == b"ftyp" and head[8:12] in HEIF_BRANDS)  # HEIC آیفون
        or head[:6] in (b"GIF87a", b"GIF89a")
        or head[:4] in (b"II*\x00", b"MM\x00*")  # TIFF خروجی اسکنر
        or head[:2] == b"BM"
    )


def _zip_kind(path: str) -> str:
    try:
        with zipfile.ZipFile(path) as z:
            names = set(z.namelist())
            if "word/document.xml" in names:
                return DOCX
            if "ppt/presentation.xml" in names:
                return PPTX
            if "mimetype" in names and z.getinfo("mimetype").file_size <= 100:
                mimetype = z.read("mimetype")
                if mimetype == b"application/vnd.oasis.opendocument.text":
                    return ODT
                if mimetype == b"application/vnd.oasis.opendocument.presentation":
                    return ODP
    except (zipfile.BadZipFile, OSError, KeyError):
        pass
    return UNSUPPORTED  # اکسل، zip معمولی، یا zip خراب


def _ole_kind(path: str) -> str:
    try:
        streams = ole_streams(path)
    except (ValueError, struct.error, OSError):
        return UNSUPPORTED
    if "EncryptedPackage" in streams and "EncryptionInfo" in streams:
        return ENCRYPTED
    if "WordDocument" in streams:
        return ENCRYPTED if _doc_is_encrypted(path, streams["WordDocument"]) else DOC
    if "PowerPoint Document" in streams:
        return PPT
    return UNSUPPORTED  # اکسل قدیمی و بقیه


# ── ظرف OLE2 (MS-CFB) — فقط فهرست پوشه و سرآغاز یک جریان ─────────────────────

FREE, END_OF_CHAIN = 0xFFFFFFFF, 0xFFFFFFFE


class _Ole:
    def __init__(self, path: str):
        self.f = open(path, "rb")
        header = self.f.read(512)
        if len(header) < 512 or header[:8] != OLE_MAGIC:
            raise ValueError("not ole")
        self.sector = 1 << struct.unpack_from("<H", header, 0x1E)[0]
        if self.sector not in (512, 4096):
            raise ValueError("bad sector size")
        self.f.seek(0, 2)
        self.max_sectors = self.f.tell() // self.sector + 1
        fat_count, self.first_dir = struct.unpack_from("<II", header, 0x2C)
        difat_first, difat_count = struct.unpack_from("<II", header, 0x44)
        difat = list(struct.unpack_from("<109I", header, 0x4C))
        per_sector = self.sector // 4
        sector = difat_first
        for _ in range(min(difat_count, self.max_sectors)):
            if sector >= FREE - 5:
                break
            values = struct.unpack(f"<{per_sector}I", self._read(sector))
            difat.extend(values[:-1])
            sector = values[-1]
        self.fat: list[int] = []
        for fat_sector in difat[: min(fat_count, self.max_sectors)]:
            if fat_sector >= FREE - 5:
                break
            self.fat.extend(struct.unpack(f"<{per_sector}I", self._read(fat_sector)))

    def _read(self, sector: int) -> bytes:
        self.f.seek((sector + 1) * self.sector)
        data = self.f.read(self.sector)
        if len(data) < self.sector:
            raise ValueError("truncated")
        return data

    def chain(self, start: int):
        sector, seen = start, 0
        while sector < len(self.fat) and sector < FREE - 5 and seen < self.max_sectors:
            yield sector
            sector = self.fat[sector]
            seen += 1

    def close(self):
        self.f.close()


def ole_streams(path: str) -> dict[str, tuple[int, int]]:
    """نام جریان‌های ظرف OLE2 ← (سکتور شروع، اندازه)."""
    ole = _Ole(path)
    try:
        streams: dict[str, tuple[int, int]] = {}
        for sector in ole.chain(ole.first_dir):
            data = ole._read(sector)
            for offset in range(0, ole.sector, 128):
                entry = data[offset : offset + 128]
                name_len = struct.unpack_from("<H", entry, 0x40)[0]
                if entry[0x42] != 2 or not 2 <= name_len <= 64:  # فقط جریان
                    continue
                name = entry[: name_len - 2].decode("utf-16-le", errors="replace")
                start, size = struct.unpack_from("<IQ", entry, 0x74)
                streams[name] = (start, size)
        return streams
    finally:
        ole.close()


def _doc_is_encrypted(path: str, stream: tuple[int, int]) -> bool:
    """پرچم fEncrypted در FIB سند Word ۹۷ (MS-DOC 2.5.2)."""
    start, size = stream
    if size < 4096:  # جریان WordDocument همیشه بزرگ است؛ کوچک یعنی غیرعادی
        return False
    ole = _Ole(path)
    try:
        first = ole._read(start)
    finally:
        ole.close()
    ident, _nfib, _unused, _lid, _pnnext, flags = struct.unpack_from("<HHHHHH", first, 0)
    return ident == 0xA5EC and bool(flags & 0x0100)


# ── چیزهایی که از خود فایل Office خوانده می‌شود ──────────────────────────────


def _member(z: zipfile.ZipFile, name: str) -> bytes | None:
    try:
        info = z.getinfo(name)
    except KeyError:
        return None
    if info.file_size > MAX_XML_BYTES:
        return None
    return z.read(info)


def office_page_count(path: str, fmt: str) -> int | None:
    """تعداد صفحه‌ای که Word (یا اسلایدی که پاورپوینت) موقع ذخیره نوشته.

    پاورپوینت اسلاید مخفی را هم می‌شمارد؛ آن چاپ نمی‌شود و کم می‌شود.
    """
    if fmt not in (DOCX, PPTX):
        return None
    try:
        with zipfile.ZipFile(path) as z:
            xml = _member(z, "docProps/app.xml")
    except (zipfile.BadZipFile, OSError):
        return None
    if not xml or len(xml) > 1024 * 1024:
        return None

    def number(tag: bytes) -> int | None:
        match = re.search(rb"<(?:\w+:)?" + tag + rb">\s*(\d+)\s*<", xml)
        return int(match.group(1)) if match else None

    if fmt == DOCX:
        pages = number(b"Pages")
    else:
        slides = number(b"Slides")
        pages = None if slides is None else slides - (number(b"HiddenSlides") or 0)
    return pages if pages and pages > 0 else None


# فقط فونت لاتین و فونت متن راست‌به‌چپ (`cs`) — همان دو که متن جزوهٔ فارسی با
# آنها چیده می‌شود. فونت آسیای شرقی و ده‌ها فونت خط‌های دیگری که پوستهٔ Office
# فهرست می‌کند، در سند فارسی به کار نمی‌روند و فقط هشدار بی‌معنی می‌سازند.
_RFONTS = re.compile(rb'w:(?:ascii|hAnsi|cs)="([^"]+)"')
_RUN_TYPEFACE = re.compile(rb'<a:(?:latin|cs)\b[^>]*?typeface="([^"]+)"')
_THEME_ARABIC = re.compile(rb'<a:font\b[^>]*?script="Arab"[^>]*?typeface="([^"]+)"')


def requested_fonts(path: str, fmt: str, limit: int = 50) -> list[str]:
    """فونت‌هایی که سند Word یا پاورپوینت خواسته، به ترتیب اولین دیده‌شدن."""
    if fmt == DOCX:
        parts = ("word/document", "word/styles", "word/header", "word/footer", "word/footnotes",
                 "word/endnotes", "word/numbering", "word/theme/")
        body = (_RFONTS,)
    elif fmt == PPTX:
        parts = ("ppt/slides/slide", "ppt/slideLayouts/", "ppt/slideMasters/", "ppt/theme/")
        body = (_RUN_TYPEFACE,)
    else:
        return []

    names: list[str] = []
    try:
        with zipfile.ZipFile(path) as z:
            members = sorted(n for n in z.namelist() if n.startswith(parts) and n.endswith(".xml"))
            for member in members:
                data = _member(z, member)
                if not data:
                    continue
                patterns = (_RUN_TYPEFACE, _THEME_ARABIC) if "/theme/" in member else body
                for pattern in patterns:
                    for raw in pattern.findall(data):
                        name = html.unescape(raw.decode("utf-8", errors="replace")).strip()
                        # «+mn-lt» یعنی «فونت پوستهٔ سند»؛ خود پوسته جدا خوانده می‌شود.
                        if name and not name.startswith("+") and name not in names:
                            names.append(name)
                            if len(names) >= limit:
                                return names
    except (zipfile.BadZipFile, OSError):
        return names
    return names
