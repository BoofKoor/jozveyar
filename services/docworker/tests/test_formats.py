"""
تشخیص فرمت از محتوا (ADR-028) — پسوند فقط ادعای کاربر است.

همه با بایت‌هایی که همین‌جا ساخته می‌شوند؛ بدون LibreOffice اجرا می‌شود.
"""

import pytest

from docworker import formats
from tests.samples import (
    OLE_MAGIC,
    app_xml,
    docx_paragraph,
    make_docx,
    make_macro_odt,
    make_odp,
    make_ole,
    make_zip,
    word97_stream,
)


def write(tmp_path, name: str, data: bytes) -> str:
    path = tmp_path / name
    path.write_bytes(data)
    return str(path)


def test_pdf_is_recognised_whatever_the_name(tmp_path):
    assert formats.sniff(write(tmp_path, "جزوه.docx", b"%PDF-1.7\n...")) == formats.PDF
    # زباله قبل از سرآیند تا ۱۰۲۴ بایت مجاز است و فایل واقعی دارد.
    assert formats.sniff(write(tmp_path, "a.pdf", b"\x00" * 900 + b"%PDF-1.4\n")) == formats.PDF
    assert formats.sniff(write(tmp_path, "b.pdf", b"\x00" * 1100 + b"%PDF-1.4\n")) == formats.UNSUPPORTED


def test_office_zip_formats(tmp_path):
    docx = str(tmp_path / "x.pdf")
    make_docx(docx, [docx_paragraph("سلام", "B Nazanin")])
    assert formats.sniff(docx) == formats.DOCX

    odp = str(tmp_path / "x.odp")
    make_odp(odp, ["یک"])
    assert formats.sniff(odp) == formats.ODP

    odt = str(tmp_path / "x.odt")
    make_macro_odt(odt, "/nonexistent")
    assert formats.sniff(odt) == formats.ODT

    pptx = str(tmp_path / "x.pptx")
    make_zip(pptx, {"[Content_Types].xml": "<Types/>", "ppt/presentation.xml": "<p/>"})
    assert formats.sniff(pptx) == formats.PPTX


def test_other_zips_are_not_documents(tmp_path):
    xlsx = str(tmp_path / "x.docx")
    make_zip(xlsx, {"[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<w/>"})
    assert formats.sniff(xlsx) == formats.UNSUPPORTED

    plain = str(tmp_path / "x.zip")
    make_zip(plain, {"a.txt": "x"})
    assert formats.sniff(plain) == formats.UNSUPPORTED

    # mimetype غول‌آسا خوانده نمی‌شود.
    huge = str(tmp_path / "huge.odt")
    make_zip(huge, {"mimetype": "application/vnd.oasis.opendocument.text" + " " * 500})
    assert formats.sniff(huge) == formats.UNSUPPORTED

    # zip بریده‌شده: سرآیند zip دارد، خود zip خراب است.
    assert formats.sniff(write(tmp_path, "cut.docx", b"PK\x03\x04" + b"\x00" * 50)) == formats.UNSUPPORTED


def test_word_97(tmp_path):
    path = str(tmp_path / "old.doc")
    make_ole(path, {"WordDocument": word97_stream(encrypted=False), "1Table": b"t" * 600})
    assert formats.sniff(path) == formats.DOC


def test_password_protected_word_97_is_detected_before_libreoffice(tmp_path):
    path = str(tmp_path / "locked.doc")
    make_ole(path, {"WordDocument": word97_stream(encrypted=True), "1Table": b"t" * 600})
    assert formats.sniff(path) == formats.ENCRYPTED


def test_password_protected_docx_is_an_ole_container(tmp_path):
    """Office فایل OOXML رمزدار را در ظرف OLE2 می‌پیچد — پسوندش همان docx می‌ماند."""
    path = str(tmp_path / "locked.docx")
    make_ole(path, {"EncryptionInfo": b"\x04\x00\x04\x00" + b"i" * 600, "EncryptedPackage": b"e" * 5000})
    assert formats.sniff(path) == formats.ENCRYPTED


def test_powerpoint_97_and_other_ole_files(tmp_path):
    ppt = str(tmp_path / "old.ppt")
    make_ole(ppt, {"PowerPoint Document": b"p" * 5000, "Current User": b"u" * 60})
    assert formats.sniff(ppt) == formats.PPT

    xls = str(tmp_path / "old.xls")
    make_ole(xls, {"Workbook": b"w" * 5000})
    assert formats.sniff(xls) == formats.UNSUPPORTED


def test_broken_ole_never_crashes_or_hangs(tmp_path):
    # فقط امضا، بدون سرآیند کامل.
    assert formats.sniff(write(tmp_path, "a.doc", OLE_MAGIC + b"\x00" * 100)) == formats.UNSUPPORTED

    # زنجیرهٔ FAT حلقه‌ای: خواننده باید بایستد، نه اینکه تا ابد دور بزند.
    path = str(tmp_path / "loop.doc")
    make_ole(path, {"WordDocument": word97_stream(encrypted=False)})
    data = bytearray((tmp_path / "loop.doc").read_bytes())
    fat = 512  # سکتور ۰ = اولین سکتور FAT
    first_dir = int.from_bytes(data[0x30:0x34], "little")
    data[fat + first_dir * 4 : fat + first_dir * 4 + 4] = first_dir.to_bytes(4, "little")  # dir → خودش
    (tmp_path / "loop.doc").write_bytes(bytes(data))
    assert formats.sniff(path) in (formats.DOC, formats.UNSUPPORTED)


@pytest.mark.parametrize(
    "head",
    [
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00",  # JPEG
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR",
        b"RIFF\x10\x00\x00\x00WEBPVP8 ",
        b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00",  # HEIC آیفون
        b"\x00\x00\x00\x1cftypmif1\x00\x00\x00\x00",
        b"GIF89a\x01\x00",
        b"II*\x00\x08\x00\x00\x00",  # TIFF اسکنر
        b"BM\x36\x00\x00\x00",
    ],
)
def test_images(tmp_path, head):
    assert formats.sniff(write(tmp_path, "photo.pdf", head + b"\x00" * 64)) == formats.IMAGE


def test_rtf_and_garbage(tmp_path):
    assert formats.sniff(write(tmp_path, "a.doc", b"{\\rtf1\\ansi hello}")) == formats.RTF
    assert formats.sniff(write(tmp_path, "a.docx", b"hello world")) == formats.UNSUPPORTED
    assert formats.sniff(write(tmp_path, "empty.pdf", b"")) == formats.UNSUPPORTED
    # «ftyp» ویدیو، نه عکس.
    assert formats.sniff(write(tmp_path, "v.heic", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 20)) == formats.UNSUPPORTED


def test_page_count_that_word_wrote(tmp_path):
    path = str(tmp_path / "x.docx")
    make_docx(path, [docx_paragraph("سلام", "B Nazanin")], app_pages=37)
    assert formats.office_page_count(path, formats.DOCX) == 37

    bare = str(tmp_path / "bare.docx")
    make_docx(bare, [docx_paragraph("سلام", "B Nazanin")])
    assert formats.office_page_count(bare, formats.DOCX) is None

    zero = str(tmp_path / "zero.docx")
    make_docx(zero, [docx_paragraph("سلام", "B Nazanin")], app_pages=0)
    assert formats.office_page_count(zero, formats.DOCX) is None


def test_hidden_slides_are_not_counted(tmp_path):
    path = str(tmp_path / "x.pptx")
    make_zip(path, {"ppt/presentation.xml": "<p/>", "docProps/app.xml": app_xml(Slides=24, HiddenSlides=3)})
    assert formats.office_page_count(path, formats.PPTX) == 21

    plain = str(tmp_path / "y.pptx")
    make_zip(plain, {"ppt/presentation.xml": "<p/>", "docProps/app.xml": app_xml(Slides=12)})
    assert formats.office_page_count(plain, formats.PPTX) == 12
    # فرمت‌های دیگر شمارهٔ ذخیره‌شده ندارند.
    assert formats.office_page_count(plain, formats.DOC) is None


def test_requested_fonts_in_word(tmp_path):
    path = str(tmp_path / "x.docx")
    make_docx(path, [
        docx_paragraph("سلام", "B Nazanin"),
        docx_paragraph("x", "Times New Roman", rtl=False),
        docx_paragraph("دو", "B Nazanin"),
        docx_paragraph("سه", "B Titr &amp; Co"),
    ])
    assert formats.requested_fonts(path, formats.DOCX) == ["B Nazanin", "Times New Roman", "B Titr & Co"]


def test_requested_fonts_in_powerpoint(tmp_path):
    slide = (
        '<p:sld xmlns:a="a" xmlns:p="p"><a:rPr><a:latin typeface="Calibri"/><a:cs typeface="B Yekan"/>'
        '<a:ea typeface="MS Mincho"/></a:rPr><a:rPr><a:latin typeface="+mn-lt"/></a:rPr></p:sld>'
    )
    theme = (
        '<a:theme xmlns:a="a"><a:minorFont><a:latin typeface="Calibri"/>'
        '<a:font script="Jpan" typeface="Yu Gothic"/><a:font script="Arab" typeface="Times New Roman"/>'
        "</a:minorFont></a:theme>"
    )
    path = str(tmp_path / "x.pptx")
    make_zip(path, {"ppt/presentation.xml": "<p/>", "ppt/slides/slide1.xml": slide, "ppt/theme/theme1.xml": theme})
    # فقط لاتین و راست‌به‌چپ؛ «+mn-lt» ارجاع به پوسته است و خود پوسته خوانده می‌شود.
    assert formats.requested_fonts(path, formats.PPTX) == ["Calibri", "B Yekan", "Times New Roman"]


def test_oversized_xml_is_never_decompressed(tmp_path, monkeypatch):
    """zip بمب: بخش XML بزرگ‌تر از سقف اصلاً باز نمی‌شود."""
    path = str(tmp_path / "bomb.docx")
    make_docx(path, [docx_paragraph("سلام " * 2000, "B Nazanin")], app_pages=5)
    monkeypatch.setattr(formats, "MAX_XML_BYTES", 1000)
    assert formats.requested_fonts(path, formats.DOCX) == []
    assert formats.office_page_count(path, formats.DOCX) == 5  # app.xml کوچک است
