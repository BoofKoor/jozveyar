"""
سند Office نمونه برای تست، دست‌نویس با zipfile — مثل PDFهای نمونهٔ وب (ADR-018).

هیچ کتابخانه‌ای بین ما و بایت‌ها نیست: docx همان چند فایل XML حداقلی است که
Word و LibreOffice هر دو باز می‌کنند، پس هر چیزی که تست می‌سنجد رفتار خود
LibreOffice است، نه رفتار یک مولد.
"""

from __future__ import annotations

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


def make_docx(path: str, paragraphs: list[str]) -> None:
    """سند A4 با حاشیهٔ ۲٫۵ سانتی؛ `paragraphs` خروجی `docx_paragraph` است."""
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


def make_odp(path: str, slide_titles: list[str]) -> None:
    """ارائهٔ ODF حداقلی؛ LibreOffice خودش از آن pptx می‌سازد."""
    pages = "".join(
        f'<draw:page draw:name="p{i}"><draw:frame svg:x="2cm" svg:y="2cm" svg:width="22cm" svg:height="4cm">'
        f"<draw:text-box><text:p>{escape(title)}</text:p></draw:text-box></draw:frame></draw:page>"
        for i, title in enumerate(slide_titles, start=1)
    )
    content = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
        'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3">'
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
