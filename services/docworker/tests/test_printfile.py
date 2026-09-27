"""
فایل چاپ هر جلد (برش ۵٫۱، ADR-043) با PDF واقعی PyMuPDF، بی سرویس.

هر سنجش شاهد دارد: صفحه‌ای که عوض نمی‌شود کنار صفحه‌ای که می‌شود. «همان که دیده می‌شد» با رندر سنجیده می‌شود، نه با
مختصات متن: متن صفحهٔ `/Rotate`دار مختصات بی‌چرخش دارد و چیزی را که چاپ می‌شود نمی‌گوید.
"""

import io

import fitz
import numpy as np
import pytest
from PIL import Image

from docworker import printfile
from docworker.jobs import PermanentFailure
from docworker.orders import build_print_files, plan_volumes

A4 = fitz.paper_rect("a4")
A4L = fitz.paper_rect("a4-l")
A3L = fitz.paper_rect("a3-l")
A5 = fitz.paper_rect("a5")
LETTER = fitz.paper_rect("letter")
DPI = 36


def pdf(tmp_path, name, pages):
    """PDF با صفحه‌هایی به اندازهٔ داده‌شده؛ روی هر صفحه نوار سیاهی سرتاسر لبهٔ بالا و برچسب صفحه."""
    doc = fitz.open()
    for n, rect in enumerate(pages, start=1):
        page = doc.new_page(width=rect.width, height=rect.height)
        page.draw_rect(fitz.Rect(0, 0, rect.width, rect.height * 0.08), color=None, fill=(0, 0, 0))
        page.insert_text((36, rect.height / 2), f"page-{n}", fontsize=24)
    path = str(tmp_path / name)
    doc.save(path)
    doc.close()
    return path


def render(page) -> Image.Image:
    return Image.open(io.BytesIO(page.get_pixmap(dpi=DPI).tobytes("png"))).convert("L")


def dark(image: Image.Image, box) -> float:
    """سهم پیکسل‌های تیرهٔ یک تکه از تصویر (کسرهای پهنا و ارتفاع)."""
    w, h = image.size
    x0, y0, x1, y1 = box
    region = np.asarray(image.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))), float)
    return float((region < 128).mean())


def looks_like(source_page, print_page) -> float:
    """فاصلهٔ رندر صفحهٔ چاپ با رندر صفحهٔ اصلی که پادساعت‌گرد چرخیده (اگر افقی بود) و روی A4 نشسته، ۰ تا ۲۵۵."""
    expected = render(source_page)
    if source_page.rect.width > source_page.rect.height:
        expected = expected.rotate(90, expand=True)  # PIL: پادساعت‌گرد
    actual = render(print_page)
    scale = min(actual.width / expected.width, actual.height / expected.height)
    fitted = expected.resize((round(expected.width * scale), round(expected.height * scale)))
    canvas = Image.new("L", actual.size, 255)
    canvas.paste(fitted, ((actual.width - fitted.width) // 2, (actual.height - fitted.height) // 2))
    return float(np.abs(np.asarray(canvas, float) - np.asarray(actual, float)).mean())


# ── جلدها از ریز قیمت منجمد ─────────────────────────────────────────────────


def test_volumes_split_exactly_like_the_frozen_breakdown():
    # ۱۶۵۰ صفحهٔ دورو = ۸۲۵ برگ ← [413, 412]: صفحهٔ ۱ تا ۸۲۶ و ۸۲۷ تا ۱۶۵۰ (ADR-043). صریح، نه از کد قیمت.
    assert printfile.volume_ranges(1650, "double", [413, 412]) == [(1, 826), (827, 1650)]
    # جزوهٔ فرد: برگ آخر یک رو دارد.
    assert printfile.volume_ranges(1651, "double", [413, 413]) == [(1, 826), (827, 1651)]
    assert printfile.volume_ranges(900, "single", [450, 450]) == [(1, 450), (451, 900)]
    assert printfile.volume_ranges(120, "double", [60]) == [(1, 120)]
    # جلدبندی مال ریز قیمت منجمد است، نه حساب دوبارهٔ کارگر (قاعدهٔ ۱): تقسیم ناهمسان هم همان‌طور که قیمت شد.
    assert printfile.volume_ranges(1650, "double", [800, 25]) == [(1, 1600), (1601, 1650)]
    # ریز قیمتی که با صفحه‌ها نمی‌خواند: شکست، نه جلدبندی حدسی.
    for pages, sides, sheets in [(1650, "double", [413, 413]), (120, "double", [59]),
                                 (3, "double", [2, 1]), (10, "single", []), (10, "single", [0, 10]), (10, "single", [5.5, 4.5])]:
        with pytest.raises(PermanentFailure) as failure:
            printfile.volume_ranges(pages, sides, sheets)
        assert failure.value.code == "breakdown_mismatch", (pages, sides, sheets)


def test_the_breakdown_item_is_read_by_seq_and_checked_against_the_item():
    breakdown = {"items": [{"pageCount": 120, "sheetsPerVolume": [60]}, {"pageCount": 1650, "sheetsPerVolume": [413, 412]}]}
    assert plan_volumes(breakdown, 2, 1650, "double") == [(1, 826), (827, 1650)]
    with pytest.raises(PermanentFailure) as missing:
        plan_volumes({}, 1, 120, "double")
    assert missing.value.code == "breakdown_missing"
    with pytest.raises(PermanentFailure) as other:
        plan_volumes(breakdown, 1, 121, "double")
    assert other.value.code == "breakdown_mismatch"


# ── کدام صفحه عوض می‌شود ──────────────────────────────────────────────────


def test_only_a4_portrait_without_annotations_is_left_as_it_is(tmp_path):
    near_a4 = fitz.Rect(0, 0, 596, 843)  # خروجی اسکنر و Word، در همان رواداری ۳٪ `paperSizeName`
    path = pdf(tmp_path, "mix.pdf", [A4, near_a4, A5, A4L, A3L, LETTER, fitz.Rect(0, 0, 842, 1191)])
    with fitz.open(path) as doc:
        doc[0].add_highlight_annot(fitz.Rect(30, 300, 200, 330))
        states = printfile.page_states(doc)
    assert [(s.resized, s.rotated, s.annotated) for s in states] == [
        (False, False, True),
        (False, False, False),
        (True, False, False),
        (False, True, False),
        (True, True, False),
        (True, False, False),
        (True, False, False),
    ]
    assert printfile.changes_of(states, 1, 7) == {
        "resized": [[3, 3, 420, 595], [5, 5, 1191, 842], [6, 6, 612, 792], [7, 7, 842, 1191]],
        "rotated": [[4, 5]],
        "annotated": [[1, 1]],
    }
    # بازهٔ یک جلد فقط صفحه‌های خودش را می‌گوید؛ صفحهٔ بی تغییر هیچ.
    assert printfile.changes_of(states, 2, 2) is None
    assert printfile.changes_of(states, 6, 7) == {"resized": [[6, 6, 612, 792], [7, 7, 842, 1191]]}


def test_runs_of_the_same_size_are_merged(tmp_path):
    path = pdf(tmp_path, "letters.pdf", [LETTER, LETTER, A4, LETTER, A5])
    with fitz.open(path) as doc:
        states = printfile.page_states(doc)
    assert printfile.changes_of(states, 1, 5) == {"resized": [[1, 2, 612, 792], [4, 4, 612, 792], [5, 5, 420, 595]]}


# ── ساختن ────────────────────────────────────────────────────────────────


def test_a4_jozve_in_one_volume_is_the_jozve_itself(tmp_path):
    path = pdf(tmp_path, "a4.pdf", [A4] * 5)
    assert build_print_files(path, [(1, 5)], str(tmp_path)) == [
        {"volume": 1, "first": 1, "last": 5, "path": None, "changes": None}
    ]


def test_every_page_lands_on_a4_portrait_and_looks_like_the_original(tmp_path):
    path = pdf(tmp_path, "mix.pdf", [A4, A5, A4L, A3L, LETTER])
    [volume] = build_print_files(path, [(1, 5)], str(tmp_path))
    assert volume["changes"] == {"resized": [[2, 2, 420, 595], [4, 4, 1191, 842], [5, 5, 612, 792]], "rotated": [[3, 4]]}
    with fitz.open(path) as source, fitz.open(volume["path"]) as out:
        assert out.page_count == 5
        assert all((round(p.rect.width), round(p.rect.height)) == (595, 842) for p in out)
        # متن برداری می‌ماند، به همان ترتیب.
        assert [p.get_text().strip() for p in out] == [f"page-{n}" for n in range(1, 6)]
        for n in range(5):
            assert looks_like(source[n], out[n]) < 1.5, n + 1


def test_a_landscape_page_turns_with_its_top_to_the_left_edge(tmp_path):
    """سؤال ۴۱ طرح: همه در یک جهت، بالای صفحهٔ افقی لبهٔ چپ کاغذ. شاهد: صفحهٔ عمودی نوارش بالاست."""
    path = pdf(tmp_path, "land.pdf", [A4L, A5])
    [volume] = build_print_files(path, [(1, 2)], str(tmp_path))
    with fitz.open(volume["path"]) as out:
        landscape, portrait = render(out[0]), render(out[1])
    assert dark(landscape, (0, 0, 0.06, 1)) > 0.9  # نوار بالای صفحه، حالا لبهٔ چپ
    assert dark(landscape, (0.94, 0, 1, 1)) < 0.05
    assert dark(landscape, (0, 0, 1, 0.03)) < 0.1
    assert dark(portrait, (0, 0, 1, 0.06)) > 0.9


def test_a_page_rotated_by_its_rotate_key_is_laid_out_as_it_is_seen(tmp_path):
    """صفحهٔ `/Rotate`دار: همان که دیده می‌شود چیده می‌شود. بی `remove_rotation`، `show_pdf_page` بی‌چرخش نشانش می‌داد."""
    doc = fitz.open()
    # عمودی با `/Rotate 90`: افقی دیده می‌شود. افقی با `/Rotate 90`: عمودی دیده می‌شود، و A4 است (بی تغییر).
    for rect in (A4, A4L):
        page = doc.new_page(width=rect.width, height=rect.height)
        page.draw_rect(fitz.Rect(0, 0, rect.width, 60), color=None, fill=(0, 0, 0))
        page.insert_text((40, 200), "rotated", fontsize=30)
        page.set_rotation(90)
    path = str(tmp_path / "rot.pdf")
    doc.save(path)
    doc.close()
    [volume] = build_print_files(path, [(1, 2)], str(tmp_path))
    assert volume["changes"] == {"rotated": [[1, 1]]}
    with fitz.open(path) as source, fitz.open(volume["path"]) as out:
        assert [(round(p.rect.width), round(p.rect.height)) for p in out] == [(595, 842), (595, 842)]
        assert looks_like(source[0], out[0]) < 1.5
        # صفحهٔ دوم همان‌طور کپی شد، با همان `/Rotate`.
        assert out[1].rotation == 90
        assert looks_like(source[1], out[1]) < 1.5


def test_annotations_are_printed_as_part_of_the_page(tmp_path):
    path = pdf(tmp_path, "hl.pdf", [A4, A4])
    with fitz.open(path) as doc:
        doc[0].add_highlight_annot(fitz.Rect(30, 400, 300, 440))
        doc[1].add_text_annot((300, 600), "یادداشت")
        doc.saveIncr()
    [volume] = build_print_files(path, [(1, 2)], str(tmp_path))
    assert volume["changes"] == {"annotated": [[1, 2]]}
    with fitz.open(volume["path"]) as out:
        # دیگر حاشیه‌نویسی نیست، جزو صفحه است: زرد هایلایت در رندر می‌ماند.
        assert all(page.first_annot is None for page in out)
        pixels = np.asarray(Image.open(io.BytesIO(out[0].get_pixmap(dpi=DPI).tobytes("png"))).convert("RGB"), int)
        yellow = (pixels[..., 0] > 200) & (pixels[..., 1] > 200) & (pixels[..., 2] < 120)
        assert yellow.sum() > 20


def test_volumes_are_split_at_sheet_boundaries_even_when_nothing_else_changes(tmp_path):
    path = pdf(tmp_path, "long.pdf", [A4] * 11)
    # یازده صفحهٔ دورو با [3, 3] برگ: ۱ تا ۶ و ۷ تا ۱۱.
    volumes = build_print_files(path, [(1, 6), (7, 11)], str(tmp_path))
    assert [(v["volume"], v["first"], v["last"], v["changes"]) for v in volumes] == [(1, 1, 6, None), (2, 7, 11, None)]
    with fitz.open(volumes[0]["path"]) as one, fitz.open(volumes[1]["path"]) as two:
        assert [p.get_text().strip() for p in one] == [f"page-{n}" for n in range(1, 7)]
        assert [p.get_text().strip() for p in two] == [f"page-{n}" for n in range(7, 12)]


def test_a_blank_page_of_another_size_becomes_a_blank_a4(tmp_path):
    doc = fitz.open()
    doc.new_page(width=LETTER.width, height=LETTER.height)
    path = str(tmp_path / "blank.pdf")
    doc.save(path)
    doc.close()
    [volume] = build_print_files(path, [(1, 1)], str(tmp_path))
    with fitz.open(volume["path"]) as out:
        assert (round(out[0].rect.width), round(out[0].rect.height)) == (595, 842)
        assert dark(render(out[0]), (0, 0, 1, 1)) == 0


def test_a_jozve_that_is_not_what_the_volumes_cover_is_never_split(tmp_path):
    path = pdf(tmp_path, "short.pdf", [A4] * 4)
    with pytest.raises(PermanentFailure) as failure:
        build_print_files(path, [(1, 5)], str(tmp_path))
    assert failure.value.code == "page_count_mismatch"
