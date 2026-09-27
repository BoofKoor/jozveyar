"""
فایل چاپ هر جلد هر جزوه (برش ۵٫۱، ADR-043)، از روی PDF جزوه. فقط PyMuPDF، بی پایگاه داده و استوریج.

- هر صفحه روی A4 عمودی، با حفظ تناسب و وسط‌چین، مثل «Fit» درایور: A5 بزرگ و A3 کوچک می‌شود.
- صفحهٔ افقی ۹۰ درجه می‌چرخد تا کاغذ را پر کند، همه در یک جهت: بالای صفحه لبهٔ چپ کاغذ (سؤال ۴۱ طرح).
- حاشیه‌نویسی‌ها و فرم‌ها پیش از چیدن جزو صفحه می‌شوند (`bake`): همان که تحلیل رنگ دید و قیمت شد، چاپ می‌شود.
- جلدها دقیقاً با `sheetsPerVolume` ریز قیمت منجمد؛ مرز هر جلد مرز برگ است.
- صفحه‌ای که همین حالا A4 عمودی است و حاشیه‌نویسی ندارد، همان‌طور کپی می‌شود (`insert_pdf`)، نه دوباره چیده.

A4 با همان رواداری ۳٪ `paperSizeName` (`packages/analysis`) شناخته می‌شود، پس صفحه‌ای که پنل «A4» می‌نامد اینجا هم A4 است.
صفحهٔ `/Rotate`دار با همان شکلی که دیده می‌شود سنجیده و چیده می‌شود (`remove_rotation` پیش از چیدن).
"""

from __future__ import annotations

from dataclasses import dataclass

import fitz  # PyMuPDF

from .jobs import PermanentFailure

A4 = fitz.paper_rect("a4")  # 595 × 842 پوینت
A4_SHORT, A4_LONG = 595, 842
TOLERANCE = 0.03


@dataclass(frozen=True)
class PageState:
    """یک صفحهٔ جزوه همان‌طور که دیده می‌شود (پس از `/Rotate`)."""

    width: float
    height: float
    annotated: bool

    @property
    def rotated(self) -> bool:
        """افقی است و می‌چرخد."""
        return self.width > self.height

    @property
    def resized(self) -> bool:
        """A4 نیست، پس روی A4 می‌نشیند."""
        short, long = sorted((self.width, self.height))
        return not (abs(short - A4_SHORT) / A4_SHORT < TOLERANCE and abs(long - A4_LONG) / A4_LONG < TOLERANCE)

    @property
    def reshaped(self) -> bool:
        """دوباره چیده می‌شود، نه همان‌طور کپی."""
        return self.rotated or self.resized

    @property
    def changed(self) -> bool:
        return self.reshaped or self.annotated


def page_states(doc: fitz.Document) -> list[PageState]:
    return [
        PageState(page.rect.width, page.rect.height, page.first_annot is not None or page.first_widget is not None)
        for page in doc
    ]


def volume_ranges(page_count: int, sides_mode: str, sheets_per_volume: list[int]) -> list[tuple[int, int]]:
    """بازهٔ صفحهٔ هر جلد، از برگ‌های هر جلد در ریز قیمت منجمد.

    در دورو هر برگ دو صفحه است، پس مرز جلد بعد از صفحهٔ زوج: ۱۶۵۰ صفحه با [413, 412] برگ ← ۱ تا ۸۲۶ و ۸۲۷ تا ۱۶۵۰. جلد
    آخر جزوهٔ فرد یک صفحهٔ کمتر دارد. ریز قیمتی که با صفحه‌های قلم نمی‌خواند شکست قطعی است، نه جلدبندی حدسی.
    """
    per_sheet = 2 if sides_mode == "double" else 1
    if not sheets_per_volume or any(not isinstance(s, int) or s < 1 for s in sheets_per_volume):
        raise PermanentFailure("breakdown_mismatch", f"برگ جلدها: {sheets_per_volume!r}")
    ranges, first = [], 1
    for sheets in sheets_per_volume:
        last = min(first + sheets * per_sheet - 1, page_count)
        if last < first:
            raise PermanentFailure("breakdown_mismatch", f"جلد {len(ranges) + 1} صفحه‌ای ندارد")
        ranges.append((first, last))
        first = last + 1
    if first != page_count + 1 or sum(sheets_per_volume) != -(-page_count // per_sheet):
        raise PermanentFailure("breakdown_mismatch", f"{sheets_per_volume} برگ با {page_count} صفحهٔ {sides_mode} نمی‌خواند")
    return ranges


def _runs(pages: list[int]) -> list[list[int]]:
    """صفحه‌های پشت‌سرهم، بازه‌بازه: [3, 4, 5, 9] ← [[3, 5], [9, 9]]."""
    runs: list[list[int]] = []
    for n in pages:
        if runs and runs[-1][1] == n - 1:
            runs[-1][1] = n
        else:
            runs.append([n, n])
    return runs


def changes_of(states: list[PageState], first: int, last: int) -> dict | None:
    """«چه عوض شد» برای صفحه‌های یک جلد، به صفحهٔ سراسری جزوه (همان شکل `order_print_files.changes`)؛ null یعنی هیچ."""
    resized: list[list[int]] = []
    for n in range(first, last + 1):
        state = states[n - 1]
        if not state.resized:
            continue
        size = [round(state.width), round(state.height)]
        if resized and resized[-1][1] == n - 1 and resized[-1][2:] == size:
            resized[-1][1] = n
        else:
            resized.append([n, n, *size])
    rotated = _runs([n for n in range(first, last + 1) if states[n - 1].rotated])
    annotated = _runs([n for n in range(first, last + 1) if states[n - 1].annotated])
    changes = {key: runs for key, runs in (("resized", resized), ("rotated", rotated), ("annotated", annotated)) if runs}
    return changes or None


def build_volume(doc: fitz.Document, states: list[PageState], first: int, last: int, out_path: str) -> int:
    """صفحه‌های `first` تا `last` (یک‌پایه، هر دو سر شامل) در یک PDF، هر کدام A4 عمودی. `doc` پیش‌تر `bake` شده.

    صفحه‌های پشت‌سرهمی که عوض نمی‌شوند یک‌جا کپی می‌شوند؛ بقیه روی صفحهٔ A4 تازه چیده می‌شوند. خروجی: شمار صفحه‌ها.
    """
    out = fitz.open()
    try:
        index = first - 1
        while index < last:
            if not states[index].reshaped:
                end = index
                while end + 1 < last and not states[end + 1].reshaped:
                    end += 1
                out.insert_pdf(doc, from_page=index, to_page=end)
                index = end + 1
                continue
            page = doc[index]
            if page.rotation:
                # همان شکلی که دیده می‌شود، بی `/Rotate`؛ `show_pdf_page` صفحهٔ چرخیده را بی چرخشش نشان می‌داد.
                page.remove_rotation()
            target = out.new_page(width=A4.width, height=A4.height)
            # ۹۰ درجه پادساعت‌گرد: بالای صفحهٔ افقی لبهٔ چپ کاغذ.
            target.show_pdf_page(target.rect, doc, index, keep_proportion=True, rotate=90 if states[index].rotated else 0)
            index += 1
        out.save(out_path, garbage=3, deflate=True)
        return out.page_count
    finally:
        out.close()
