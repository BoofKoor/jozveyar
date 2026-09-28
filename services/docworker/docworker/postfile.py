"""
خواندن فایل پست (برش ۶، ADR-045): بایت ← جدول رشته‌ها، فقط با کتابخانهٔ استاندارد.

کارگر هیچ چیز را تفسیر نمی‌کند: سرستون، کد سفارش، بارکد و حکم هر سطر کار پنل است (TypeScript،
`@jozveyar/db`)، تا قاعده‌های ADR-010 یک پیاده‌سازی داشته باشند. اینجا فقط «کدام جدول‌ها، با کدام خانه‌ها».

فرمت از محتوا، نه پسوند (CLAUDE.md، «فایل پست جدول HTML با پسوند .xls است»):
- جدول HTML: همان فایلی که پست می‌دهد. نمونهٔ واقعی (۱۴۰۵/۰۷/۰۶) فقط یک `<table>` است، بی `<html>` و بی
  `charset`، با UTF-8 بی BOM. رمزگذاری از BOM، بعد `charset` خود فایل، بعد UTF-8، وگرنه windows-1256.
- CSV با ویرگول، نقطه‌ویرگول یا tab؛ همان رمزگذاری‌ها.
- XLSX: zip و XML، با سقف اندازهٔ بازشده و بی DTD.
- `.xls` واقعی (BIFF در OLE2) پذیرفته نیست: Calc در ایمیج پایه نیست، و فایلی که Excel ذخیره کرده بارکد ۲۴ رقمی‌اش
  احتمالاً گرد شده (ADR-045).

خانه‌ها همان‌طور که در فایل‌اند برمی‌گردند؛ خانهٔ عددی XLSX همان متن `<v>` است (مثلاً `1.188E+23`)، تا پنل بارکد
خراب را «خوانده نشد» کند، نه اینکه اینجا به عدد تبدیل و بی‌صدا گرد شود.
"""

from __future__ import annotations

import codecs
import csv
import io
import re
import zipfile
from html.parser import HTMLParser
from xml.etree import ElementTree

from .formats import OLE_MAGIC

# همان سقف ستون `size_bytes` در پایگاه داده (ADR-045): فایل پست ۴۱ بسته‌ای چند ده کیلوبایت است.
MAX_BYTES = 2 * 1024 * 1024
# XLSX بازشده: هیچ فایل پستی به این نمی‌رسد؛ zip بمب پیش از باز شدن رد می‌شود.
MAX_XLSX_UNCOMPRESSED = 32 * 1024 * 1024
MAX_XLSX_MEMBERS = 500
MAX_ROWS = 5000
MAX_CELLS_PER_ROW = 200
MAX_TABLES = 20

# کدهای خطا؛ پنل برای هر کدام پیام روشن دارد.
XLS_BINARY = "xls_binary"
NO_TABLE = "no_table"
TOO_LARGE = "too_large"
BAD_XLSX = "bad_xlsx"
TOO_MANY_ROWS = "too_many_rows"
ERROR_CODES = frozenset({XLS_BINARY, NO_TABLE, TOO_LARGE, BAD_XLSX, TOO_MANY_ROWS})

HTML = "html"
CSV = "csv"
XLSX = "xlsx"


class PostFileError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


Table = list[list[str]]


def read_post_file(raw: bytes) -> tuple[str, list[Table]]:
    """فرمت فایل و جدول‌هایش، هر جدول فهرست سطرها و هر سطر فهرست خانه‌ها؛ یا `PostFileError`."""
    if len(raw) > MAX_BYTES:
        raise PostFileError(TOO_LARGE)
    if raw.startswith(OLE_MAGIC):
        raise PostFileError(XLS_BINARY)
    if raw.startswith(b"PK\x03\x04"):
        return XLSX, _only_tables([_read_xlsx(raw)])
    text = decode(raw)
    if re.search(r"<\s*table\b", text, re.IGNORECASE):
        return HTML, _only_tables(_read_html(text))
    return CSV, _only_tables([_read_csv(text)])


def _only_tables(tables: list[Table]) -> list[Table]:
    """جدول بی سطر پر به کار نمی‌آید؛ اگر هیچ جدولی نماند، «جدول پیدا نشد»."""
    kept = [t for t in tables if any(any(cell.strip() for cell in row) for row in t)]
    if not kept:
        raise PostFileError(NO_TABLE)
    if len(kept) > MAX_TABLES or sum(len(t) for t in kept) > MAX_ROWS:
        raise PostFileError(TOO_MANY_ROWS)
    return kept


# ── رمزگذاری ─────────────────────────────────────────────────────────────────

_CHARSET = re.compile(rb"""charset\s*=\s*["']?\s*([A-Za-z0-9_\-]+)""", re.IGNORECASE)


def decode(raw: bytes) -> str:
    """متن فایل: BOM، بعد `charset` خود فایل، بعد UTF-8، وگرنه windows-1256 (فایل‌های قدیمی پست)."""
    for bom, encoding in ((codecs.BOM_UTF8, "utf-8"), (codecs.BOM_UTF16_LE, "utf-16-le"), (codecs.BOM_UTF16_BE, "utf-16-be")):
        if raw.startswith(bom):
            return raw[len(bom):].decode(encoding, errors="replace")
    declared = _CHARSET.search(raw[:4096])
    if declared:
        try:
            codec = codecs.lookup(declared.group(1).decode("ascii"))
        except LookupError:
            codec = None
        # «charset=utf-8» روی بایت‌های windows-1256 دروغ است؛ آن‌وقت همان راه بی اعلام.
        if codec is not None and codec.name != "utf-8":
            return raw.decode(codec.name, errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1256", errors="replace")


# ── جدول HTML ────────────────────────────────────────────────────────────────


class _Tables(HTMLParser):
    """همهٔ `<table>`ها، هر کدام با سطرها و خانه‌های خودش؛ جدول تو در تو جدای جدول بیرونی."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[Table] = []
        self._stack: list[Table] = []
        self._row: list[list[str] | None] = []  # سطر جاری هر جدول باز
        self._cell: list[list[str] | None] = []  # خانهٔ جاری هر جدول باز
        self._skip = 0  # درون script یا style

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip += 1
        elif tag == "table":
            table: Table = []
            self.tables.append(table)
            self._stack.append(table)
            self._row.append(None)
            self._cell.append(None)
        elif not self._stack:
            return
        elif tag == "tr":
            self._end_row()
            self._row[-1] = []
        elif tag in ("td", "th"):
            self._end_cell()
            if self._row[-1] is None:  # خانه بی tr
                self._row[-1] = []
            self._cell[-1] = []
        elif tag == "br" and self._cell[-1] is not None:
            self._cell[-1].append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        elif not self._stack:
            return
        elif tag == "table":
            self._end_row()
            self._stack.pop()
            self._row.pop()
            self._cell.pop()
        elif tag == "tr":
            self._end_row()
        elif tag in ("td", "th"):
            self._end_cell()

    def handle_data(self, data: str) -> None:
        if self._skip or not self._stack or self._cell[-1] is None:
            return
        self._cell[-1].append(data)

    def _end_cell(self) -> None:
        cell = self._cell[-1]
        if cell is None:
            return
        row = self._row[-1]
        if row is not None and len(row) < MAX_CELLS_PER_ROW:
            row.append("".join(cell))
        self._cell[-1] = None

    def _end_row(self) -> None:
        self._end_cell()
        row = self._row[-1]
        if row is not None:
            if len(self._stack[-1]) >= MAX_ROWS:
                raise PostFileError(TOO_MANY_ROWS)
            self._stack[-1].append(row)
        self._row[-1] = None

    def close(self) -> None:
        super().close()
        while self._stack:  # جدولی که بسته نشد، همان‌قدر که آمد
            self.handle_endtag("table")


def _read_html(text: str) -> list[Table]:
    parser = _Tables()
    parser.feed(text)
    parser.close()
    return parser.tables


# ── CSV ──────────────────────────────────────────────────────────────────────


def _read_csv(text: str) -> Table:
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        raise PostFileError(NO_TABLE)
    delimiter = _delimiter(lines[:20])
    rows: Table = []
    for row in csv.reader(io.StringIO("\n".join(lines)), delimiter=delimiter):
        if len(rows) >= MAX_ROWS:
            raise PostFileError(TOO_MANY_ROWS)
        rows.append(row[:MAX_CELLS_PER_ROW])
    # یک ستون یعنی جداکننده‌ای نبود: متنی که جدول نیست.
    if max(len(row) for row in rows) < 2:
        raise PostFileError(NO_TABLE)
    return rows


def _delimiter(lines: list[str]) -> str:
    """جداکننده‌ای که بیشترین ستونِ یکسان را در سطرهای اول می‌دهد."""
    best, best_score = ",", 0
    for delimiter in (",", ";", "\t"):
        counts = [len(next(csv.reader([line], delimiter=delimiter))) for line in lines]
        common = max(set(counts), key=counts.count)
        score = counts.count(common) * (common - 1)
        if score > best_score:
            best, best_score = delimiter, score
    return best


# ── XLSX ─────────────────────────────────────────────────────────────────────

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _xml(z: zipfile.ZipFile, name: str) -> ElementTree.Element | None:
    try:
        data = z.read(name)
    except KeyError:
        return None
    # DTD در XLSX لازم نیست؛ بی آن، بمب entity و XXE هم نیست.
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise PostFileError(BAD_XLSX)
    try:
        return ElementTree.fromstring(data)
    except ElementTree.ParseError as error:
        raise PostFileError(BAD_XLSX) from error


def _read_xlsx(raw: bytes) -> Table:
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as error:
        raise PostFileError(BAD_XLSX) from error
    with z:
        infos = z.infolist()
        if len(infos) > MAX_XLSX_MEMBERS or sum(info.file_size for info in infos) > MAX_XLSX_UNCOMPRESSED:
            raise PostFileError(TOO_LARGE)
        sheet = _first_sheet(z)
        shared = _shared_strings(z)
        root = _xml(z, sheet)
        if root is None:
            raise PostFileError(BAD_XLSX)
        rows: Table = []
        for row in root.iter(f"{_NS}row"):
            if len(rows) >= MAX_ROWS:
                raise PostFileError(TOO_MANY_ROWS)
            cells: dict[int, str] = {}
            position = 0
            for cell in row.iter(f"{_NS}c"):
                ref = cell.get("r")
                position = _column(ref) if ref else position
                if position < MAX_CELLS_PER_ROW:
                    cells[position] = _cell_text(cell, shared)
                position += 1
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
        return rows


def _first_sheet(z: zipfile.ZipFile) -> str:
    """مسیر اولین برگهٔ کتاب، از workbook و rels؛ اگر نبود، همان نام معمول."""
    workbook = _xml(z, "xl/workbook.xml")
    rels = _xml(z, "xl/_rels/workbook.xml.rels")
    if workbook is not None and rels is not None:
        first = workbook.find(f"{_NS}sheets/{_NS}sheet")
        target_id = first.get(f"{_REL_NS}id") if first is not None else None
        for rel in rels.iter(f"{_PKG_REL}Relationship"):
            if rel.get("Id") == target_id and rel.get("Target"):
                target = rel.get("Target", "").lstrip("/")
                return target if target.startswith("xl/") else f"xl/{target}"
    return "xl/worksheets/sheet1.xml"


def _shared_strings(z: zipfile.ZipFile) -> list[str]:
    root = _xml(z, "xl/sharedStrings.xml")
    if root is None:
        return []
    return ["".join(t.text or "" for t in si.iter(f"{_NS}t")) for si in root.iter(f"{_NS}si")]


def _cell_text(cell: ElementTree.Element, shared: list[str]) -> str:
    kind = cell.get("t")
    if kind == "inlineStr":
        return "".join(t.text or "" for t in cell.iter(f"{_NS}t"))
    value = cell.find(f"{_NS}v")
    text = value.text if value is not None and value.text is not None else ""
    if kind == "s":
        try:
            return shared[int(text)]
        except (ValueError, IndexError):
            return ""
    return text


def _column(ref: str) -> int:
    """«C7» ← ۲."""
    index = 0
    for char in ref:
        if not char.isalpha():
            break
        index = index * 26 + (ord(char.upper()) - ord("A") + 1)
    return max(index - 1, 0)
