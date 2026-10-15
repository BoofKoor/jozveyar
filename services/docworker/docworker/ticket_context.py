"""
دادهٔ قالب برگه‌ها (برش ۹٫۲، ADR-057): همان دادهٔ برگهٔ سفارش ۵٫۱ (`ticket.TicketData`)، به شکل متغیرهای Jinja2 بیجک و برگهٔ اول.

نام‌ها نزدیک قالب‌های امروز صاحب پروژه‌اند (سؤال ۱۹۴): بیجک `order.files` و `total_copies`، برگهٔ اول `print_info.file_info` و
`print_info.files_summary`؛ هر «file» آنجا یک جزوهٔ اینجاست، با یک صحافی و یک یا چند فایل. هر متغیر با توضیح فارسی در
`templates/variables.json` است، که پنل نشانش می‌دهد و تست هر دو سو را می‌سنجد. مبلغ هرگز در این داده نیست (چاپخانه برگه را
می‌بیند، ADR-042). همه چیز متن و عدد آماده است، چون قالب در پردازهٔ جدا و بی بستهٔ کارگر ساخته می‌شود.
"""

from __future__ import annotations

from datetime import datetime, timezone

from . import jalali

VOLUME_WORDS = {1: "یک", 2: "دو", 3: "سه", 4: "چهار", 5: "پنج"}
SIDES = {"double": "دورو", "single": "یکرو"}
# پرچم‌های صحافی قالب‌های امروز صاحب پروژه، از شناسهٔ صحافی تعرفه: صحافی‌ای که در پنل با یکی از این شناسه‌ها ساخته شود، پرچم
# همان را روشن می‌کند. «طلق و سیم» دادهٔ پایه `spiral_clear` است.
BINDING_FLAGS = {
    "plastic": ("spiral_clear", "plastic"),
    "hot_glue": ("hot_glue",),
    "cover": ("cover",),
    "stapler": ("stapler", "staple"),
}


def jozve_file_name(order_number: int, seq: int, volume: int, volumes: int) -> str:
    """نام فایل چاپ، همان که پنل با آن دانلود می‌کند (`apps/admin/lib/orders.ts`)."""
    return f"jozve-{order_number}-{seq}.pdf" if volumes == 1 else f"jozve-{order_number}-{seq}-jeld-{volume}.pdf"


def phone_text(phone: str) -> str:
    """«0915 234 5678»، مثل `phoneText` پنل."""
    return f"{phone[:4]} {phone[4:7]} {phone[7:]}" if len(phone) == 11 and phone.isdigit() else phone


def color_text(modes: list[str]) -> str:
    """مثل `colorText` پنل."""
    color, bw = "color" in modes, "bw" in modes
    return "رنگی و سیاه‌سفید" if color and bw else "رنگی" if color else "سیاه‌سفید"


def jozve(order_number: int, item, total: int) -> dict:
    """یک جزوه، برای ردیف بیجک و برای برگهٔ اول خودش."""
    names = [name for name, _, _ in item.sections]
    count = len(item.volumes)
    size = item.paper_size.lower()
    sides = SIDES.get(item.sides_mode, item.sides_mode)
    colors = color_text(item.color_modes)
    return {
        "seq": item.seq,
        "of": total,
        "file_name": names[0] if len(names) == 1 else f"{names[0]} و {len(names) - 1} فایل دیگر",
        # نام فایل چاپ، تا دسته با فایل روی دیسک یکی شود؛ چند جلد: پیشوند مشترک فایل‌های جلدها.
        "saved_file_name": jozve_file_name(order_number, item.seq, 1, 1) if count == 1 else f"jozve-{order_number}-{item.seq}",
        "files": [
            {"n": n, "name": name, "pages": last - first + 1, "first_page": first, "last_page": last}
            for n, (name, first, last) in enumerate(item.sections, start=1)
        ],
        "file_count": len(names),
        "pages": item.page_count,
        "sheets": item.sheets,
        "copies": item.copies,
        "one_side": item.sides_mode == "single",
        "two_sides": item.sides_mode == "double",
        "sides": sides,
        "color": "color" in item.color_modes,
        "black_white": "bw" in item.color_modes,
        "color_text": colors,
        "paper_size": size.upper(),
        "a3": size == "a3",
        "a4": size == "a4",
        "a5": size == "a5",
        "papers": "، ".join(item.papers),
        "binding": item.binding,
        "binding_id": item.binding_id,
        **{flag: item.binding_id in ids for flag, ids in BINDING_FLAGS.items()},
        "volumes": [
            {"n": n, "first_page": first, "last_page": last, "sheets": sheets, "file_name": jozve_file_name(order_number, item.seq, n, count)}
            for n, (first, last, sheets) in enumerate(item.volumes, start=1)
        ],
        "volume_count": count,
        "volume_words": VOLUME_WORDS.get(count, str(count)),
        # دورو با صفحهٔ فرد: پشت برگ آخر سفید (سؤال ۲۳۰).
        "odd": item.sides_mode == "double" and item.page_count % 2 == 1,
        "mode": f"{colors} · {sides} · {size.upper()}",
    }


def contexts(data) -> tuple[dict, list[dict]]:
    """دادهٔ بیجک سفارش، و دادهٔ برگهٔ اول هر جزوه به ترتیب."""
    files = [jozve(data.order_number, item, len(data.items)) for item in data.items]
    total_copies = sum(item.copies for item in data.items)
    order = {
        "id": data.order_number,
        "number": data.order_number,
        "receiver_name": data.recipient_name,
        # همان که متصدی پست در «نام گ» می‌نویسد و کد رهگیری با آن پیدا می‌شود (ADR-010).
        "label_name": f"{data.recipient_name} {data.order_number}",
        "phone": data.recipient_phone,
        "phone_display": phone_text(data.recipient_phone),
        "postal_code": data.postal_code,
        "address": data.address,
        "province": data.province,
        "city": data.city,
        "address_line": data.address_line,
        "shipping": data.shipping,
        "due_day": jalali.deadline_day(data.due),
        "paid_at": f"{jalali.format_weekday(data.paid)}، {jalali.format_time(data.paid)}" if data.paid else None,
        "partner": {"name": data.partner[0], "city": data.partner[1]} if data.partner else None,
        "files": files,
        "jozve_count": len(files),
        "total_copies": total_copies,
    }
    bindings: dict[str, int] = {}
    for entry in files:
        bindings[entry["binding"]] = bindings.get(entry["binding"], 0) + 1
    summary = {
        "total": len(files),
        **{flag: sum(1 for entry in files if entry[flag]) for flag in BINDING_FLAGS},
        "bindings": [{"name": name, "count": count} for name, count in bindings.items()],
    }
    bijak = {"order": order, "total_copies": total_copies}
    firsts = [
        {
            "order": order,
            "total_copies": total_copies,
            "jozve": entry,
            "print_info": {
                "order_id": data.order_number,
                "receiver_name": data.recipient_name,
                "file_info": entry,
                "files_summary": summary,
            },
        }
        for entry in files
    ]
    return bijak, firsts


# داده‌ای ساختگی برای پیش‌نمایش قالب بی سفارش واقعی: همان 10027 طرح پنل، با دو جزوه که هر شاخهٔ قالب را می‌گیرد (چند فایل، یک جلد؛
# و یک فایل، دو جلد، رنگی، A5، با صحافی دیگر).
SAMPLE_DUE = datetime(2026, 10, 5, 20, 30, tzinfo=timezone.utc)  # پایان دوشنبه 13 مهر به وقت تهران
SAMPLE_PAID = datetime(2026, 10, 3, 10, 35, tzinfo=timezone.utc)  # شنبه 11 مهر، 14:05 تهران


def sample():
    from .ticket import TicketData, TicketItem

    return TicketData(
        order_number=10027,
        due=SAMPLE_DUE,
        paid=SAMPLE_PAID,
        recipient_name="مریم کاظمی",
        recipient_phone="09152345678",
        province="خراسان رضوی",
        city="مشهد",
        address_line="بلوار سجاد، سجاد 18، پلاک 42، واحد 6",
        postal_code="9187654321",
        shipping="پست پیشتاز",
        partner=("چاپ نور", "مشهد"),
        items=[
            TicketItem(1, 120, 60, 2, "double", "a4", ["bw"], ["تحریر ۸۰ گرم"], "طلق و سیم", "spiral_clear",
                       [("ریاضی ۲ - جلسه ۱.pdf", 1, 48), ("ریاضی ۲ - جلسه ۲.pdf", 49, 102), ("حل تمرین فصل ۱.docx", 103, 120)],
                       [(1, 120, 60)]),
            TicketItem(2, 61, 61, 1, "single", "a5", ["color"], ["گلاسه"], "چسب گرم", "hot_glue",
                       [("نقشه - پیوست.pdf", 1, 61)],
                       [(1, 31, 31), (32, 61, 30)]),
        ],
    )
