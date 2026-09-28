"""
فایل پست ساختگی با همان ساختار فایل واقعی (برش ۶، سؤال ۵۹): همان ۲۲ سرستون و همان ترتیب، «بارکد » و «تاریخ ثبت »
با فاصلهٔ ته، فقط یک `<table>` بی `<html>` و بی `charset`، سطرها با CRLF و tab، بارکد با فاصلهٔ نشکن ته، خانهٔ خالی
`&nbsp;`، و سطر «جمع کل» با ردیف 0. نام‌ها، شهرها و بارکدها ساختگی‌اند؛ دادهٔ واقعی مشتری به مخزن نمی‌آید.
"""

from __future__ import annotations

HEADERS = [
    "ردیف", "عنوان مرسوله", "بارکد ", "مخزن", "وضعیت", "تاریخ ثبت ", "خدمات ویژه", "مقصد", "شماره مرجع", "نام ف",
    "آدرس ف", "نام گ", "آدرس گ", "کاربر", "وزن", "مالیات", "بیمه", "کرایه پستی", "هزینه کل", "شماره ثبت",
    "ک ق استانی", "ک ق سراسری",
]


def parcel(n: int, barcode: str, name_g: str, destination: str, grams: int, fare_rials: int, date: str = "1405/07/12",
           status: str = "فعال") -> list[str]:
    tax = (fare_rials + 5) // 10  # مالیات پست: ۱۰٪ کرایه، نیم ریال رو به بالا
    return [
        str(n), "پاکت جوف", f"{barcode}\xa0", "نقش تمبر", status, date, "پیشتاز SMS", destination, "162664",
        "فرستنده نمونه", "نشانی نمونه", name_g, "...", "متصدی نمونه", str(grams), str(tax), "100000", str(fare_rials),
        str(fare_rials + tax), "19921", "0", "0",
    ]


def total_row(parcels: list[list[str]]) -> list[str]:
    s = lambda i: str(sum(int(p[i]) for p in parcels))  # noqa: E731
    return ["0", "&nbsp;", "جمع کل", "&nbsp;", "&nbsp;", "&nbsp;", "&nbsp;", "&nbsp;", "0", "&nbsp;", "&nbsp;",
            "&nbsp;", "&nbsp;", "&nbsp;", s(14), s(15), s(16), s(17), s(18), "0", "0", "0"]


def html(parcels: list[list[str]], *, total: bool = True) -> str:
    """همان شکل فایل پست: متن HTML با CRLF."""
    rows = [HEADERS, *parcels, *([total_row(parcels)] if total else [])]
    out = ['<table cellspacing="1" cellpadding="3" class="css_radius" border="0" id="dataGridView1">']
    for row in rows:
        cells = "".join(f"<td>{cell}</td>" for cell in row)
        out.append(f"\t<tr>\r\n\t\t{cells}\r\n\t</tr>")
    out.append("</table>")
    return "\r\n".join(out)


SAMPLE = [
    parcel(1, "118832198006260769886668", "رحمانی 10005", "تهران", 820, 1_295_000),
    parcel(2, "118834904592470401439273", "بيك زاده 10006", "كرج", 1240, 1_618_120),  # «ي» و «ك» عربی
    parcel(3, "118837671509023346731437", "طهماسبی 6103", "مشهد", 1050, 1_618_125),
]
