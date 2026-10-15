"""
قالب برگه‌ها (برش ۹٫۲، ADR-057): ساختن در پردازهٔ مهارشده، دیوارهای قالبی که مالک بارگذاری می‌کند، دادهٔ قالب، و فهرست متغیرهای پنل.

قالب ناشناس است، پس هر دیوار با قالبی که از آن می‌گذرد سنجیده می‌شود: `__class__` و `__globals__` در sandbox Jinja2، واکشی شبکه و فایل
محلی (با سرور HTTP که درخواست‌هایش را می‌شمارد)، حلقهٔ بی‌پایان و حافظهٔ بی‌حد. بی WeasyPrint (بیرون ایمیج پایه) رد می‌شود.
"""

import http.server
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading

import fitz
import pytest

from docworker import sandbox, ticket
from docworker.ticket import Template, TemplateFailure, TicketItem, render
from docworker.ticket_context import BINDING_FLAGS, contexts, sample

# بی import: WeasyPrint با import شدن `ImageFile.LOAD_TRUNCATED_IMAGES` Pillow را سراسری روشن می‌کند، و همان پردازهٔ pytest تست JPEG
# نیمه‌کارهٔ `test_convert.py` را می‌انداخت (شاهد پایین: کارگر هم هرگز import‌ش نمی‌کند).
pytestmark = pytest.mark.skipif(
    importlib.util.find_spec("weasyprint") is None or importlib.util.find_spec("jinja2") is None,
    reason="WeasyPrint و Jinja2 فقط در ایمیج پایه",
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARIABLES = os.path.join(ROOT, "docworker", "templates", "variables.json")


def one(tmp_path, html: str, kind: str = "bijak", data=None):
    """یک قالب با دادهٔ نمونه، فقط صفحه‌های همان نوع، در پوشهٔ کار تازه."""
    workdir = tempfile.mkdtemp(dir=tmp_path)
    return render({kind: Template(kind, 1, html)}, ticket.ticket_pages(data or sample(), (kind,)), workdir)


def text_of(rendered) -> str:
    out = []
    for path in rendered.pdfs:
        with fitz.open(path) as doc:
            out.extend(page.get_text() for page in doc)
    return "\n".join(out)


# ── دیوارها ──────────────────────────────────────────────────────────────────


def test_sandboxed_jinja_refuses_python_internals(tmp_path):
    # راه‌های شناختهٔ بیرون رفتن از قالب: یا قالب با خطای امنیتی ساخته نمی‌شود، یا ویژگی ناامن خالی است، هرگز شیء پایتون.
    for probe in ("{{ ''.__class__.__mro__ }}", "{{ cycler.__init__.__globals__ }}", "{{ order.__class__ }}",
                  "{{ order.files.__class__.__subclasses__() }}", "{{ range.__self__ }}"):
        try:
            rendered = one(tmp_path, f"<p>[{probe}]</p>")
        except TemplateFailure as failure:
            assert failure.error["kind"] in ("security", "template"), probe
            assert failure.code == "template_error"
        else:
            text = text_of(rendered)
            assert "[]" in text and not any(word in text for word in ("class", "function", "module", "dict", "builtin")), probe


def test_every_value_from_the_order_is_text_not_html(tmp_path):
    data = sample()
    data.recipient_name = '<img src="data:image/png;base64,AAAA">مریم'
    data.items[0].sections = [("<b>بولد</b>.pdf", 1, 120)]
    rendered = one(tmp_path, "<p>{{ order.receiver_name }}</p><p>{{ order.files[0].files[0].name }}</p>", data=data)
    text = text_of(rendered)
    # escape خودکار: برچسب‌ها همان‌طور که هستند، متن روی صفحه‌اند.
    assert "<img" in text and "<b>" in text


class Counting(http.server.BaseHTTPRequestHandler):
    hits: list[str] = []

    def do_GET(self):  # noqa: N802 — نام http.server
        Counting.hits.append(self.path)
        self.send_response(200)
        self.send_header("Content-Type", "text/css")
        self.end_headers()
        self.wfile.write(b"body { background: red; }")

    def log_message(self, *args):  # بی‌صدا
        pass


def test_only_data_urls_load_and_the_rest_are_reported(tmp_path):
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Counting)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    secret = tmp_path / "secret.css"
    secret.write_text("body { background: red; }")
    url = f"http://127.0.0.1:{server.server_port}"
    try:
        Counting.hits.clear()
        html = f"""<link rel="stylesheet" href="{url}/style.css"><link rel="stylesheet" href="file://{secret}">
        <style>@import url("{url}/import.css");</style><img src="{url}/logo.png">
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">"""
        rendered = one(tmp_path, html)
    finally:
        server.shutdown()
    assert Counting.hits == []
    assert set(rendered.blocked) >= {f"{url}/style.css", f"file://{secret}", f"{url}/import.css", f"{url}/logo.png"}
    # صفحه بی زمینهٔ قرمز ساخته شد: هیچ CSSی از بیرون نیامد.
    with fitz.open(rendered.pdfs[0]) as doc:
        pixmap = doc[0].get_pixmap(dpi=20)
        assert pixmap.pixel(5, 5)[:3] == (255, 255, 255)


def test_a_template_that_never_ends_is_stopped(tmp_path, monkeypatch):
    monkeypatch.setattr(ticket, "RENDER_TIMEOUT", 3.0)
    with pytest.raises(TemplateFailure) as failure:
        one(tmp_path, "{% for i in range(99999) %}{% for j in range(99999) %}{% endfor %}{% endfor %}")
    assert failure.value.error["kind"] == "timeout"


def test_a_template_that_eats_memory_stops_at_the_cap(tmp_path):
    with pytest.raises(TemplateFailure) as failure:
        one(tmp_path, "{{ 'x' * 3000000000 }}")
    assert failure.value.error["kind"] in ("template", "crash")
    assert "MemoryError" in failure.value.error["message"] or "حافظه" in failure.value.error["message"]


def test_a_template_that_makes_too_many_pages_stops_at_the_cap(tmp_path, monkeypatch):
    """سقف صفحه همان `order_tickets_pages` است و در خود ساختن، پس قالب پرصفحه پیش از هزار صفحه می‌ایستد. شاهد: زیر سقف ساخته می‌شود."""
    monkeypatch.setattr(ticket, "MAX_TICKET_PAGES", 5)
    pages = '{% for i in range(3) %}<p style="break-after: page">{{ jozve.seq }}-{{ i }}</p>{% endfor %}'
    with pytest.raises(TemplateFailure) as failure:
        one(tmp_path, pages, kind="first_page")
    assert failure.value.error["kind"] == "pages" and failure.value.error["template"] == "first_page"
    assert str(failure.value) == "first_page: برگه بیش از 5 صفحه شد"
    monkeypatch.setattr(ticket, "MAX_TICKET_PAGES", 6)
    assert one(tmp_path, pages, kind="first_page").pages == [3, 3]


def test_a_syntax_error_names_the_template_and_line(tmp_path):
    with pytest.raises(TemplateFailure) as failure:
        one(tmp_path, "<p>یک</p>\n<p>دو</p>\n{% if %}", kind="first_page")
    assert failure.value.error["kind"] == "syntax"
    assert (failure.value.error["template"], failure.value.error["line"]) == ("first_page", 3)
    assert str(failure.value).startswith("first_page خط 3:")


def test_the_renderer_runs_isolated_with_memory_and_time_caps(tmp_path, monkeypatch):
    seen = {}

    def spy(cmd, **kwargs):
        seen.update(cmd=cmd, **kwargs)
        return real(cmd, **kwargs)

    real = sandbox.run_confined
    monkeypatch.setattr(sandbox, "run_confined", spy)
    one(tmp_path, "<p>{{ order.number }}</p>")
    # `-I`: بی PYTHONPATH و بی پوشهٔ کار در sys.path؛ اسکریپت جدا، بی بستهٔ کارگر.
    assert seen["cmd"][1:3] == ["-I", ticket.RENDERER]
    assert (seen["max_memory_bytes"], seen["max_file_bytes"], seen["timeout"]) == (
        ticket.RENDER_MEMORY,
        ticket.RENDER_MAX_FILE,
        ticket.RENDER_TIMEOUT,
    )


def test_the_worker_itself_never_imports_weasyprint_or_jinja():
    """WeasyPrint با import شدن `ImageFile.LOAD_TRUNCATED_IMAGES` را سراسری روشن می‌کند؛ در پردازهٔ کارگر یعنی JPEG نیمه‌کاره بی‌صدا
    نیمه چاپ می‌شد (`convert.py`). پس قالب فقط در پردازهٔ جدای `ticket_render.py` ساخته می‌شود، و کارگر و هر ماژولش هیچ‌کدام را
    بار نمی‌کنند. در پردازهٔ تازه، چون همین پردازهٔ pytest ممکن است بار کرده باشد."""
    code = (
        "import sys, docworker.__main__, docworker.ticket, docworker.ticket_context, docworker.convert\n"
        "from PIL import ImageFile\n"
        "assert 'weasyprint' not in sys.modules and 'jinja2' not in sys.modules, sorted(sys.modules)\n"
        "assert ImageFile.LOAD_TRUNCATED_IMAGES is False\n"
    )
    result = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr[-2000:]


# ── قالب‌های پیش‌فرض ─────────────────────────────────────────────────────────


def words(page):
    return [(w[4], w[0], w[1]) for w in page.get_text("words")]


def test_the_default_ticket_is_the_bijak_then_a_first_page_per_jozve(tmp_path):
    templates = {kind: ticket.default_template(kind) for kind in ticket.KINDS}
    pdf, png = str(tmp_path / "t.pdf"), str(tmp_path / "t.png")
    assert ticket.render_ticket(sample(), templates, pdf, png) == 3
    with fitz.open(pdf) as doc:
        assert doc.page_count == 3
        bijak, first, second = (words(page) for page in doc)
        # بیجک: شمارهٔ سفارش درشت بالا و کنار نام گیرنده در برچسب پایین؛ موبایل چپ‌به‌راست؛ نام فایل چاپ هر جزوه.
        numbers = sorted(y for text, _, y in bijak if text == "10027")
        assert len(numbers) == 2 and numbers[0] < 100 and numbers[1] > 560
        phone = {text: x for text, x, _ in bijak if text in ("0915", "234", "5678")}
        assert phone["0915"] < phone["234"] < phone["5678"]
        assert {"9187654321", "jozve-10027-1.pdf", "jozve-10027-2", "14:05", "1405"} <= {text for text, _, _ in bijak}
        # برگهٔ اول هر جزوه: فایل چاپ و صفحه‌ها؛ جزوهٔ دوم دو جلد، A5.
        assert {"jozve-10027-1.pdf", "120", "48", "102"} <= {text for text, _, _ in first}
        assert {"jozve-10027-2-jeld-1.pdf", "jozve-10027-2-jeld-2.pdf", "A5", "61"} <= {text for text, _, _ in second}
    # پیش‌نمایش هر صفحه: ۱۵۰ DPI، خاکستری، کنار هم با همان نام.
    from PIL import Image

    for n in (1, 2, 3):
        with Image.open(ticket.preview_key_of(png, n)) as image:
            # A4 همان ۲۱۰ در ۲۹۷ میلی‌متر: ۱۲۴۰٫۲ در ۱۷۵۳٫۹ پیکسل.
            assert (image.size, image.mode) == ((1241, 1754), "L")


def test_the_label_stays_at_the_bottom_of_page_one_however_long_the_order(tmp_path):
    """۳۰ جزوه و بیشترین نام و نشانی مسیر خرید (`RECIPIENT_LIMITS`، ۱۰۰ و ۵۰۰ نویسه): برچسب پست پایین صفحهٔ اول می‌ماند و فهرست
    جزوه‌ها بالایش، بی روی هم افتادن؛ بقیهٔ فهرست صفحهٔ بعد. شاهد: برچسبی که در جریان صفحه بود، با این فهرست به صفحهٔ سوم رفت."""
    data = sample()
    base = data.items[0]
    data.items = [
        TicketItem(n, 120, 60, 1, "double", "a4", ["bw"], ["تحریر ۸۰ گرم"], "طلق و سیم", "spiral_clear", base.sections, base.volumes)
        for n in range(1, 31)
    ]
    data.recipient_name = ("صادقی‌نیا " * 10)[:100]
    data.address_line = ("خیابان ولیعصر، کوچهٔ بهار، پلاک 12، " * 14)[:500]
    rendered = one(tmp_path, ticket.default_template("bijak").html, data=data)
    with fitz.open(rendered.pdfs[0]) as doc:
        assert doc.page_count >= 2
        page = words(doc[0])
        label = max(y for text, _, y in page if text == "10027")
        rows = [y for text, _, y in page if text.startswith("jozve-10027-")]
        assert rows and max(rows) < label - 120
        assert "9187654321" in {text for text, _, _ in page}
        # بقیهٔ جزوه‌ها در صفحه‌های بعد، و جزوهٔ آخر هم.
        later = {text for p in list(doc)[1:] for text, _, _ in words(p)}
        assert "jozve-10027-30.pdf" in later


# ── دادهٔ قالب و فهرست متغیرهای پنل ─────────────────────────────────────────


def leaves(value, prefix=""):
    """نام متغیرهای داده به شکل فهرست پنل (`a.b`، و برای فهرست `a[].b`): هر مقدار متنی، عددی یا فهرست؛ گروه‌ها (`order`) نه."""
    if isinstance(value, dict):
        out = set()
        for key, child in value.items():
            name = f"{prefix}.{key}" if prefix else key
            if not isinstance(child, dict):
                out.add(name)
            out |= leaves(child, name)
        return out
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return set().union(*(leaves(item, f"{prefix}[]") for item in value))
    return set()


def documented() -> dict[str, set[str]]:
    with open(VARIABLES, encoding="utf-8") as f:
        groups = json.load(f)["groups"]
    names = {"bijak": set(), "first_page": set()}
    for group in groups:
        for field, *_ in group["fields"]:
            for kind in group["in"]:
                prefix = group["prefix"]
                if prefix == "f":
                    # فیلدهای جزوه: هم ردیف‌های order.files و هم، در برگهٔ اول، jozve و print_info.file_info.
                    for base in ("order.files[]",) + (("jozve", "print_info.file_info") if kind == "first_page" else ()):
                        names[kind].add(f"{base}.{field}")
                else:
                    names[kind].add(f"{prefix}.{field}" if prefix else field)
    return names


def test_every_variable_is_documented_for_the_panel_and_every_documented_one_exists():
    bijak, firsts = contexts(sample())
    docs = documented()
    for kind, context in (("bijak", bijak), ("first_page", firsts[0])):
        assert leaves(context) - docs[kind] == set(), kind
        # فهرست پنل دو گروه را هم نام می‌برد (`jozve` و `print_info.file_info`، همان جزوه)؛ بقیه هر کدام یک مقدار داده.
        assert docs[kind] - leaves(context) - {"jozve", "print_info.file_info"} == set(), kind


def test_the_owners_variable_names_from_their_templates_work(tmp_path):
    """نام‌های قالب‌های امروز صاحب پروژه (سؤال ۱۹۴)، بی خود قالب‌ها که لوگو و تلفن دارند: هر نامی که آنجا هست اینجا مقدار دارد."""
    # هر خط فقط لاتین و عدد، تا ترتیب استخراج متن PDF همان ترتیب قالب باشد.
    bijak = (
        "{% for f in order.files %}<p dir=\"ltr\">{{ loop.index }}|{{ f.saved_file_name|replace('.pdf','') if f.saved_file_name else f.file_name }}"
        "|{{ f.pages }}|{{ f.copies }}|{% if f.one_side %}one{% elif f.two_sides %}two{% endif %}"
        "|{% if f.color %}color{% elif f.black_white %}bw{% endif %}|{% if f.a3 %}A3{% elif f.a4 %}A4{% elif f.a5 %}A5{% endif %}"
        "|{% if f.plastic %}PL{% elif f.hot_glue %}HG{% elif f.cover %}CV{% elif f.stapler %}ST{% endif %}</p>{% endfor %}"
        "<p dir=\"ltr\">{{ order.id }}|{{ order.phone }}|{{ order.postal_code }}|{{ order.files|length }}|{{ total_copies }}</p>"
    )
    lines = [line for line in text_of(one(tmp_path, bijak)).splitlines() if line]
    assert lines == ["1|jozve-10027-1|120|2|two|bw|A4|PL", "2|jozve-10027-2|61|1|one|color|A5|HG", "10027|09152345678|9187654321|2|3"]
    first = (
        "<p dir=\"ltr\">{{ print_info.order_id }}|{{ print_info.file_info.pages }}|{{ print_info.file_info.copies }}"
        "|{{ print_info.files_summary.total }}|{{ print_info.files_summary.plastic }}|{{ print_info.files_summary.hot_glue }}"
        "|{{ print_info.files_summary.cover }}|{{ print_info.files_summary.stapler }}"
        "|{% if print_info.file_info.color %}color{% endif %}|{% if print_info.file_info.one_side %}one{% endif %}</p>"
    )
    lines = [line for line in text_of(one(tmp_path, first, kind="first_page")).splitlines() if line]
    assert lines == ["10027|120|2|2|1|1|0|0||", "10027|61|1|2|1|1|0|0|color|one"]


def test_binding_flags_come_from_the_binding_id():
    data = sample()
    for binding_id, flag in (("spiral_clear", "plastic"), ("plastic", "plastic"), ("hot_glue", "hot_glue"), ("cover", "cover"),
                             ("staple", "stapler"), ("stapler", "stapler")):
        data.items[0].binding_id = binding_id
        entry = contexts(data)[0]["order"]["files"][0]
        assert [name for name in BINDING_FLAGS if entry[name]] == [flag], binding_id
    # صحافی‌ای با شناسهٔ دیگر هیچ پرچمی ندارد؛ نامش در `binding`.
    data.items[0].binding_id = "wire_metal"
    entry = contexts(data)[0]["order"]["files"][0]
    assert not any(entry[name] for name in BINDING_FLAGS) and entry["binding_id"] == "wire_metal"


def test_no_money_reaches_a_template():
    bijak, firsts = contexts(sample())
    names = leaves(bijak) | leaves(firsts[0])
    assert not any(word in name.lower() for name in names for word in ("rial", "toman", "price", "total_rials", "amount"))
