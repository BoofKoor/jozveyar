"""
سند Office نمونه برای تست، دست‌نویس با zipfile — مثل PDFهای نمونهٔ وب (ADR-018).

هیچ کتابخانه‌ای بین ما و بایت‌ها نیست: docx همان چند فایل XML حداقلی است که
Word و LibreOffice هر دو باز می‌کنند، پس هر چیزی که تست می‌سنجد رفتار خود
LibreOffice است، نه رفتار یک مولد.
"""

from __future__ import annotations

import struct
import zipfile
from xml.sax.saxutils import escape

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

DOCX_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

DOCX_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def docx_paragraph(text: str, font: str, size_pt: float = 14, rtl: bool = True) -> str:
    """یک پاراگراف؛ `w:cs` فونت متن فارسی است، همان‌جا که Word می‌گذارد."""
    half_points = round(size_pt * 2)
    ppr = "<w:pPr><w:bidi/></w:pPr>" if rtl else ""
    rtl_run = "<w:rtl/>" if rtl else ""
    return (
        f"<w:p>{ppr}<w:r><w:rPr>"
        f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:cs="{font}"/>{rtl_run}'
        f'<w:sz w:val="{half_points}"/><w:szCs w:val="{half_points}"/>'
        f'</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
    )


def app_xml(**counts: int) -> str:
    """`docProps/app.xml` — همان جایی که Word تعداد صفحه و پاورپوینت تعداد اسلاید را می‌نویسد."""
    fields = "".join(f"<{name}>{value}</{name}>" for name, value in counts.items())
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
        f"<Application>Microsoft Office Word</Application>{fields}</Properties>"
    )


def make_docx(path: str, paragraphs: list[str], app_pages: int | None = None) -> None:
    """سند A4 با حاشیهٔ ۲٫۵ سانتی؛ `paragraphs` خروجی `docx_paragraph` است.

    `app_pages`: تعداد صفحه‌ای که «Word» موقع ذخیره نوشته (بدون آن، مثل فایل‌هایی که
    برنامه‌های دیگر می‌سازند، `docProps/app.xml` نیست)."""
    document = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}"><w:body>'
        + "".join(paragraphs)
        + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" '
        'w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>'
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", DOCX_CONTENT_TYPES)
        z.writestr("_rels/.rels", DOCX_RELS)
        z.writestr("word/document.xml", document)
        if app_pages is not None:
            z.writestr("docProps/app.xml", app_xml(Pages=app_pages))


def make_odp(path: str, slide_titles: list[str], hidden: set[int] = frozenset()) -> None:
    """ارائهٔ ODF حداقلی؛ LibreOffice خودش از آن pptx می‌سازد. `hidden`: شمارهٔ
    اسلایدهای مخفی (از ۱) — آنها چاپ نمی‌شوند."""
    style = ' draw:style-name="hidden"'
    pages = "".join(
        f'<draw:page draw:name="p{i}"{style if i in hidden else ""}>'
        '<draw:frame svg:x="2cm" svg:y="2cm" svg:width="22cm" svg:height="4cm">'
        f"<draw:text-box><text:p>{escape(title)}</text:p></draw:text-box></draw:frame></draw:page>"
        for i, title in enumerate(slide_titles, start=1)
    )
    content = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
        'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" '
        'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
        'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">'
        '<office:automatic-styles><style:style style:name="hidden" style:family="drawing-page">'
        '<style:drawing-page-properties presentation:visibility="hidden"/></style:style></office:automatic-styles>'
        f"<office:body><office:presentation>{pages}</office:presentation></office:body>"
        "</office:document-content>"
    )
    manifest = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
        '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>'
        '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
        "</manifest:manifest>"
    )
    with zipfile.ZipFile(path, "w") as z:
        # mimetype اول و فشرده‌نشده — قاعدهٔ ODF.
        z.writestr("mimetype", "application/vnd.oasis.opendocument.presentation", zipfile.ZIP_STORED)
        z.writestr("META-INF/manifest.xml", manifest, zipfile.ZIP_DEFLATED)
        z.writestr("content.xml", content, zipfile.ZIP_DEFLATED)


PERSIAN_WORDS = (
    "دانشگاه جزوه درس فصل مسئله معادله انتگرال مشتق تابع پیوسته حد دنباله سری همگرا "
    "ماتریس بردار فضای خطی پایه بعد مقدار ویژه تبدیل استاد ترم امتحان تمرین مثال نکته"
).split()


def persian_text(seed: int, words: int) -> str:
    """متن فارسی قطعی (MINSTD، مثل بردارهای هم‌ارزی): همان ورودی، همان متن."""
    state = seed or 1
    out = []
    for _ in range(words):
        state = (state * 48271) % 2147483647
        out.append(PERSIAN_WORDS[state % len(PERSIAN_WORDS)])
    return " ".join(out) + "."


def make_zip(path: str, members: dict[str, str | bytes]) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in members.items():
            z.writestr(name, data)


# ── ظرف OLE2 (MS-CFB نسخهٔ ۳) — Word و پاورپوینت قدیمی، و Office رمزدار ──────────

OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_FREE, _END, _FATSECT = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD


def make_ole(path: str, streams: dict[str, bytes]) -> None:
    """ظرف OLE2 حداقلی با سکتور ۵۱۲ بایتی: جدول FAT، فهرست پوشه، و جریان‌ها.

    جریان کوچک هم در سکتور عادی می‌نشیند، نه در mini stream؛ Office چنین نمی‌کند،
    ولی تشخیص فرمت فقط فهرست پوشه و سرآغاز جریان WordDocument را می‌خواند —
    همان‌که اینجا ساخته می‌شود."""
    sector = 512
    names = list(streams)
    dir_sectors = -(-(1 + len(names)) * 128 // sector)
    data_sectors = [max(1, -(-len(streams[n]) // sector)) for n in names]
    fat_sectors = 1
    while fat_sectors * 128 < fat_sectors + dir_sectors + sum(data_sectors):
        fat_sectors += 1

    fat = [_FATSECT] * fat_sectors

    def chain(count: int) -> int:
        start = len(fat)
        fat.extend(start + i + 1 if i < count - 1 else _END for i in range(count))
        return start

    first_dir = chain(dir_sectors)
    starts = [chain(count) for count in data_sectors]
    fat.extend([_FREE] * (fat_sectors * 128 - len(fat)))

    def entry(name: str, kind: int, start: int, size: int, child: int = _FREE, right: int = _FREE) -> bytes:
        raw = name.encode("utf-16-le") + b"\0\0"
        e = bytearray(128)
        e[: len(raw)] = raw
        struct.pack_into("<HBB", e, 0x40, len(raw), kind, 1)
        struct.pack_into("<III", e, 0x44, _FREE, right, child)
        struct.pack_into("<IQ", e, 0x74, start, size)
        return bytes(e)

    directory = entry("Root Entry", 5, _END, 0, child=1 if names else _FREE)
    for i, name in enumerate(names):
        directory += entry(name, 2, starts[i], len(streams[name]), right=i + 2 if i + 1 < len(names) else _FREE)
    directory = directory.ljust(dir_sectors * sector, b"\0")

    header = bytearray(sector)
    header[:8] = OLE_MAGIC
    struct.pack_into("<HHHHH", header, 0x18, 0x3E, 3, 0xFFFE, 9, 6)
    struct.pack_into("<II", header, 0x2C, fat_sectors, first_dir)
    struct.pack_into("<IIIII", header, 0x38, 4096, _END, 0, _END, 0)
    struct.pack_into("<109I", header, 0x4C, *range(fat_sectors), *[_FREE] * (109 - fat_sectors))

    with open(path, "wb") as f:
        f.write(bytes(header))
        f.write(struct.pack(f"<{len(fat)}I", *fat))
        f.write(directory)
        for name, count in zip(names, data_sectors):
            f.write(streams[name].ljust(count * sector, b"\0"))


def word97_stream(encrypted: bool, size: int = 8192) -> bytes:
    """جریان WordDocument با FIB واقعی‌نما: wIdent و پرچم fEncrypted (MS-DOC 2.5.2)."""
    flags = 0x0100 if encrypted else 0
    return struct.pack("<HHHHHH", 0xA5EC, 0x00C1, 0, 0x0429, 0, flags).ljust(size, b"\0")


# ── سندهای خطرناک: لینک به بیرون و ماکرو (ADR-028) ─────────────────────────────

R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_RELS = "http://schemas.openxmlformats.org/package/2006/relationships"
_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"


def make_linked_docx(path: str, image_url: str, template_url: str | None = None) -> None:
    """Word با عکسی که نه در فایل، بلکه در `image_url` است (`r:link`) — Word و
    LibreOffice موقع باز کردن واکشی‌اش می‌کنند؛ به‌علاوهٔ فیلد INCLUDEPICTURE و قالب
    بیرونی (`attachedTemplate`)."""
    template_url = template_url or image_url + ".dotx"
    blip = (
        '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="p1"/>'
        f'<a:graphic><a:graphicData uri="{_PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="p1"/><pic:cNvPicPr/>'
        '</pic:nvPicPr><pic:blipFill><a:blip r:link="rId9"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/>'
        '<a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData>'
        "</a:graphic></wp:inline></w:drawing></w:r></w:p>"
    )
    field = (
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> '
        f'INCLUDEPICTURE "{escape(image_url)}.field" \\d </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/>'
        '</w:r><w:r><w:t>x</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
    )
    document = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="{W}" xmlns:r="{R}" '
        f'xmlns:a="{_A}" xmlns:pic="{_PIC}" xmlns:wp="{_WP}"><w:body>{blip}{field}'
        "<w:p><w:r><w:t>سلام</w:t></w:r></w:p><w:sectPr/></w:body></w:document>"
    )
    rels = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="{PKG_RELS}">'
        f'<Relationship Id="rId9" Type="{R}/image" Target="{escape(image_url)}" TargetMode="External"/>'
        f'<Relationship Id="rId8" Type="{R}/attachedTemplate" Target="{escape(template_url)}" TargetMode="External"/>'
        f'<Relationship Id="rId7" Type="{R}/settings" Target="settings.xml"/></Relationships>'
    )
    settings = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="{W}" xmlns:r="{R}">'
        '<w:attachedTemplate r:id="rId8"/></w:settings>'
    )
    types = DOCX_CONTENT_TYPES.replace(
        "</Types>",
        '<Override PartName="/word/settings.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/></Types>',
    )
    make_zip(path, {
        "[Content_Types].xml": types,
        "_rels/.rels": DOCX_RELS,
        "word/document.xml": document,
        "word/_rels/document.xml.rels": rels,
        "word/settings.xml": settings,
    })


ODT_MIMETYPE = "application/vnd.oasis.opendocument.text"


def _odf(path: str, content: str, extra: dict[str, str] | None = None, mimetype: str = ODT_MIMETYPE) -> None:
    extra = extra or {}
    entries = "".join(
        f'<manifest:file-entry manifest:full-path="{name}" manifest:media-type="text/xml"/>'
        for name in ["content.xml", *extra]
    )
    manifest = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
        f'<manifest:file-entry manifest:full-path="/" manifest:media-type="{mimetype}"/>{entries}'
        "</manifest:manifest>"
    )
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("mimetype", mimetype, zipfile.ZIP_STORED)
        z.writestr("META-INF/manifest.xml", manifest, zipfile.ZIP_DEFLATED)
        z.writestr("content.xml", content, zipfile.ZIP_DEFLATED)
        for name, data in extra.items():
            z.writestr(name, data, zipfile.ZIP_DEFLATED)


_ODF_NS = (
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
    'xmlns:script="urn:oasis:names:tc:opendocument:xmlns:script:1.0" '
    'xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3"'
)


def make_linked_odt(path: str, image_url: str) -> None:
    """سند ODF با عکسی که از `image_url` خوانده می‌شود."""
    content = (
        f'<?xml version="1.0" encoding="UTF-8"?><office:document-content {_ODF_NS}><office:body><office:text>'
        '<text:p><draw:frame draw:name="f1" svg:width="3cm" svg:height="3cm">'
        f'<draw:image xlink:href="{escape(image_url)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>'
        "</draw:frame></text:p><text:p>سلام</text:p></office:text></office:body></office:document-content>"
    )
    _odf(path, content)


def make_macro_odt(path: str, marker: str) -> None:
    """سند ODF با ماکروی Basic که موقع باز شدن (`dom:load`) فایل `marker` را می‌سازد."""
    content = (
        f'<?xml version="1.0" encoding="UTF-8"?><office:document-content {_ODF_NS}>'
        '<office:scripts><office:event-listeners><script:event-listener script:language="ooo:script" '
        'script:event-name="dom:load" xlink:type="simple" '
        'xlink:href="vnd.sun.star.script:Standard.Module1.Main?language=Basic&amp;location=document"/>'
        "</office:event-listeners></office:scripts>"
        "<office:body><office:text><text:p>سلام</text:p></office:text></office:body></office:document-content>"
    )
    doctype = '<!DOCTYPE {0} PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "{1}.dtd">'
    module = (
        '<?xml version="1.0" encoding="UTF-8"?>' + doctype.format("script:module", "module")
        + '<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">'
        f'Sub Main\n  n = FreeFile\n  Open "{escape(marker)}" For Output As #n\n  Print #n, "x"\n  Close #n\nEnd Sub\n'
        "</script:module>"
    )
    library = (
        '<?xml version="1.0" encoding="UTF-8"?>' + doctype.format("library:library", "library")
        + '<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" '
        'library:readonly="false" library:passwordprotected="false"><library:element library:name="Module1"/>'
        "</library:library>"
    )
    libraries = (
        '<?xml version="1.0" encoding="UTF-8"?>' + doctype.format("library:libraries", "libraries")
        + '<library:libraries xmlns:library="http://openoffice.org/2000/library" xmlns:xlink="http://www.w3.org/1999/xlink">'
        '<library:library library:name="Standard" library:link="false"/></library:libraries>'
    )
    _odf(path, content, {
        "Basic/script-lc.xml": libraries,
        "Basic/Standard/script-lb.xml": library,
        "Basic/Standard/Module1.xml": module,
    })
