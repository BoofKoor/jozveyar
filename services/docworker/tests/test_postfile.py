"""
خواندن فایل پست (برش ۶، ADR-045): بایت ← جدول رشته‌ها، فقط با کتابخانهٔ استاندارد.

همه با فایل‌هایی که همین‌جا ساخته می‌شوند، با همان ساختار فایل واقعی (`tests/postfiles.py`)؛ پایگاه داده لازم نیست.
"""

import io
import zipfile

import pytest

from docworker import postfile
from docworker.formats import OLE_MAGIC
from tests.postfiles import HEADERS, SAMPLE, html, parcel


def read(raw: bytes):
    return postfile.read_post_file(raw)


def code_of(raw: bytes) -> str:
    with pytest.raises(postfile.PostFileError) as caught:
        read(raw)
    return caught.value.code


# ── جدول HTML، همان فایل پست ─────────────────────────────────────────────────


def test_post_file_as_it_comes_utf8_no_bom_no_charset():
    fmt, tables = read(html(SAMPLE).encode("utf-8"))
    assert fmt == postfile.HTML
    assert len(tables) == 1
    table = tables[0]
    # سرستون، سه بسته و «جمع کل»؛ هر سطر ۲۲ خانه، همان‌طور که در فایل است.
    assert len(table) == 5
    assert all(len(row) == 22 for row in table)
    assert table[0] == HEADERS
    assert table[0][2] == "بارکد " and table[0][5] == "تاریخ ثبت "  # فاصلهٔ ته می‌ماند؛ یکدست کردن کار پنل است
    assert table[1][2] == "118832198006260769886668\xa0"  # بارکد با فاصلهٔ نشکن ته، مثل فایل واقعی
    assert table[2][11] == "بيك زاده 10006"  # «ي» و «ك» عربی دست نمی‌خورند
    assert table[4][2] == "جمع کل" and table[4][1] == "\xa0"  # &nbsp; ← فاصلهٔ نشکن


def test_bom_and_declared_charset():
    text = html(SAMPLE)
    for raw in (b"\xef\xbb\xbf" + text.encode("utf-8"), "﻿".encode("utf-16-le") + text.encode("utf-16-le")):
        assert read(raw)[1][0][0] == HEADERS


def test_windows_1256_with_or_without_charset():
    # windows-1256 «ی» فارسی ندارد: فایل قدیمی «ي» عربی دارد، حتی در سرستون («باركد» هم در برخی).
    text = html(SAMPLE).replace("ی", "ي")
    bare = text.encode("cp1256")
    declared = ('<meta http-equiv="Content-Type" content="text/html; charset=windows-1256">' + text).encode("cp1256")
    for raw in (bare, declared):
        fmt, tables = read(raw)
        assert fmt == postfile.HTML
        assert tables[0][0][11] == "نام گ"
        assert tables[0][1][11] == "رحماني 10005"


def test_declared_utf8_that_is_really_1256_falls_back():
    # ادعای «utf-8» روی بایت‌های windows-1256: همان راه بی اعلام، نه متن خراب.
    raw = ('<meta charset="utf-8">' + html(SAMPLE).replace("ی", "ي")).encode("cp1256")
    assert read(raw)[1][0][1][7] == "تهران"


def test_unclosed_rows_and_tables_and_script():
    raw = "<script>var t='<table><tr><td>x</td></tr></table>';</script><table><tr><td>الف<td>ب<tr><td>1<td>2".encode()
    fmt, tables = read(raw)
    assert fmt == postfile.HTML
    assert tables == [[["الف", "ب"], ["1", "2"]]]


def test_nested_tables_are_separate_and_empty_tables_dropped():
    raw = "<table><tr><td>بیرون<table><tr><td>درون</td></tr></table></td></tr></table><table><tr><td> </td></tr></table>".encode()
    tables = read(raw)[1]
    assert tables == [[["بیرون"]], [["درون"]]]


def test_html_without_table_is_no_table():
    assert code_of("<html><body><p>سلام</p></body></html>".encode()) == postfile.NO_TABLE
    assert code_of(b"") == postfile.NO_TABLE


# ── CSV ──────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("delimiter", [",", ";", "\t"])
def test_csv_three_delimiters(delimiter):
    rows = [["بارکد", "نام گ", "مقصد"], ["118832198006260769886668", "رحمانی 10005", "تهران"], ["118834904592470401439273", "بیک زاده، 10006", "کرج"]]
    lines = [delimiter.join(f'"{c}"' if delimiter in c or "،" in c else c for c in row) for row in rows]
    fmt, tables = read("\r\n".join(lines).encode("utf-8"))
    assert fmt == postfile.CSV
    assert tables == [rows]


def test_csv_windows_1256_and_one_column_is_not_a_table():
    fmt, tables = read("باركد;نام گ\r\n118832198006260769886668;رحماني 10005".encode("cp1256"))
    assert fmt == postfile.CSV and tables[0][1][1] == "رحماني 10005"
    assert code_of("فقط یک متن ساده\nبی جداکننده".encode()) == postfile.NO_TABLE


# ── XLSX ─────────────────────────────────────────────────────────────────────


def xlsx(sheet_rows: str, *, shared: list[str] | None = None, extra: dict[str, bytes] | None = None) -> bytes:
    main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("xl/workbook.xml", f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets><sheet name="s" sheetId="1" r:id="rId7"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId7" Target="worksheets/data.xml" Type="x"/></Relationships>')
        z.writestr("xl/worksheets/data.xml", f'<worksheet xmlns="{main}"><sheetData>{sheet_rows}</sheetData></worksheet>')
        if shared is not None:
            items = "".join(f"<si><t>{s}</t></si>" for s in shared)
            z.writestr("xl/sharedStrings.xml", f'<sst xmlns="{main}">{items}</sst>')
        for name, data in (extra or {}).items():
            z.writestr(name, data)
    return buf.getvalue()


def test_xlsx_shared_inline_and_numeric_cells_stay_text():
    raw = xlsx(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'
        '<row r="2"><c r="A2" t="inlineStr"><is><t>118832198006260769886668</t></is></c><c r="C2"><v>1.18832198006261E+23</v></c></row>',
        shared=["بارکد", "نام گ"],
    )
    fmt, tables = read(raw)
    assert fmt == postfile.XLSX
    # ستون B خالی می‌ماند؛ بارکدی که Excel عدد کرده همان متن علمی است، تا پنل «خوانده نشد»ش کند.
    assert tables == [[["بارکد", "", "نام گ"], ["118832198006260769886668", "", "1.18832198006261E+23"]]]


def test_xlsx_bomb_dtd_and_broken_zip():
    bomb = xlsx('<row r="1"><c r="A1" t="inlineStr"><is><t>x</t></is></c><c r="B1" t="inlineStr"><is><t>y</t></is></c></row>',
                extra={"xl/media/zeros.bin": b"\0" * (postfile.MAX_XLSX_UNCOMPRESSED + 1)})
    assert len(bomb) < postfile.MAX_BYTES  # فشرده کوچک است؛ بازشده‌اش رد می‌شود
    assert code_of(bomb) == postfile.TOO_LARGE
    # DTD و entity در XLSX لازم نیست: بمب entity پیش از باز شدن رد می‌شود.
    evil = xlsx('<row r="1"><c r="A1" t="s"><v>0</v></c></row>',
                extra={"xl/sharedStrings.xml": b'<!DOCTYPE x [<!ENTITY a "aaaaaaaa">]><sst>&a;</sst>'})
    assert code_of(evil) == postfile.BAD_XLSX
    assert code_of(b"PK\x03\x04" + b"\0" * 100) == postfile.BAD_XLSX


# ── آنچه پذیرفته نیست ─────────────────────────────────────────────────────────


def test_real_xls_is_refused_with_its_code():
    # Excel قدیمی (BIFF در OLE2): بارکدش احتمالاً گرد شده، و Calc در ایمیج پایه نیست.
    assert code_of(OLE_MAGIC + b"\0" * 4096) == postfile.XLS_BINARY


def test_too_large_and_too_many_rows():
    assert code_of(b" " * (postfile.MAX_BYTES + 1)) == postfile.TOO_LARGE
    many = [parcel(i, "1" * 24, f"نام {10000 + i}", "تهران", 500, 1_295_000) for i in range(postfile.MAX_ROWS + 1)]
    raw = html(many, total=False).encode()
    if len(raw) <= postfile.MAX_BYTES:
        assert code_of(raw) == postfile.TOO_MANY_ROWS
    rows = "\n".join(f"{i};x" for i in range(postfile.MAX_ROWS + 1)).encode()
    assert code_of(rows) == postfile.TOO_MANY_ROWS


def test_error_codes_are_the_ones_the_panel_knows():
    assert postfile.ERROR_CODES == {"xls_binary", "no_table", "too_large", "bad_xlsx", "too_many_rows"}
