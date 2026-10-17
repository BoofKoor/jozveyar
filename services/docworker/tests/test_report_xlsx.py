"""
هم‌ارزی خروجی اکسل گزارش‌های پنل با خوانندهٔ XLSX کارگر (برش ۱۰٫۲، ADR-061، سؤال ۲۰۲).

پنل کتاب اکسل را دست‌نویس می‌سازد (`apps/admin/lib/server/xlsx.ts`)، و کتاب نمونهٔ تست آن در `apps/admin/lib/server/parity/report.xlsx`
است؛ تست پنل بخش‌های آن فایل را با خروجی امروز می‌سنجد. اینجا همان فایل را خوانندهٔ فایل پست (۶٫۱، `postfile.read_post_file`) می‌خواند:
برگهٔ اول همان ردیف‌ها و خانه‌ها، عدد بی جداکننده، و متن فارسی و نویسه‌های ویژه همان‌طور که بود. برگهٔ دوم را خواننده نمی‌خواند (فقط
برگهٔ اول)، پس شکلش جدا سنجیده می‌شود: عدد به شکل عدد (بی `t`)، متن درون‌خطی، و هر دو برگه راست‌به‌چپ.
"""

import io
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from docworker import postfile

FIXTURE = Path(__file__).resolve().parents[3] / "apps" / "admin" / "lib" / "server" / "parity" / "report.xlsx"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def test_first_sheet_reads_back_with_the_post_file_reader():
    raw = FIXTURE.read_bytes()
    kind, tables = postfile.read_post_file(raw)
    assert kind == "xlsx"
    assert tables == [
        [
            ["گزارش تولید"],
            ["پرداخت سه‌شنبه 21 مهر · همهٔ چاپخانه‌ها"],
            ["ساخته شده 22 مهر 1405، 11:20، الهام فرجی"],
            ["⏳ 1 سفارش هنوز آماده نیست (فایل چاپ ساخته نشده): 10031"],
            [],
            ["سفارش", "3"],
            ["برگ", "1234567"],
            [],
            ["صحافی"],
            ["صحافی", "نسخه", "جلد"],
            ["طلق و سیم", "4", "5"],
            ['منگنه <A5> & "گلاسه"', "1"],
            ["جمع", "5", "5"],
        ]
    ]


def test_cells_are_numbers_or_inline_text_and_sheets_are_right_to_left():
    with zipfile.ZipFile(io.BytesIO(FIXTURE.read_bytes())) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert names == [
            "[Content_Types].xml",
            "_rels/.rels",
            "xl/workbook.xml",
            "xl/_rels/workbook.xml.rels",
            "xl/styles.xml",
            "xl/worksheets/sheet1.xml",
            "xl/worksheets/sheet2.xml",
        ]
        assert all(info.compress_type == zipfile.ZIP_DEFLATED for info in z.infolist())
        for sheet in ("xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"):
            root = ElementTree.fromstring(z.read(sheet))
            assert root.find(f"{NS}sheetViews/{NS}sheetView").get("rightToLeft") == "1"
            for cell in root.iter(f"{NS}c"):
                kind = cell.get("t")
                if kind is None:
                    # عدد: فقط `<v>` عددی، و قالب هزارگان برای عدد درست.
                    value = cell.find(f"{NS}v").text
                    float(value)
                    assert cell.get("s") in (None, "1", "3")
                else:
                    assert kind == "inlineStr"
                    assert cell.find(f"{NS}is/{NS}t") is not None
        detail = ElementTree.fromstring(z.read("xl/worksheets/sheet2.xml"))
        cells = {cell.get("r"): cell for cell in detail.iter(f"{NS}c")}
        assert cells["A2"].get("t") is None and cells["A2"].find(f"{NS}v").text == "10027"
        assert cells["C2"].find(f"{NS}v").text == "-5"
        assert cells["C3"].find(f"{NS}v").text == "1.5"
        # نویسهٔ کنترلی که XML نمی‌پذیرد برداشته شده است.
        assert "".join(t.text or "" for t in cells["B3"].iter(f"{NS}t")) == "در حال چاپ"
