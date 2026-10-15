"""
ساختن برگه‌های چاپی از قالب HTML (برش ۹٫۲، ADR-057): بیجک و برگهٔ اول، با Jinja2 و WeasyPrint.

این فایل تنها اجرا می‌شود، در پردازهٔ جدا و مهارشده (`sandbox.run_confined` از `ticket.py`): قالب را مالک بارگذاری می‌کند و فونت‌ها و
عکس‌هایش درون خود قالب‌اند، پس پارس HTML، CSS و فونت ناشناس هرگز در خود کارگر نیست، که رمز پایگاه داده و استوریج را دارد. هیچ
import از بستهٔ کارگر ندارد، تا با `python -I` و بی `sys.path` اجرا شود.

دیوارها، جدا از قفس پردازه (محیط تمیز، سقف زمان، حافظه و حجم فایل):
- **Jinja2 در `SandboxedEnvironment`** با escape خودکار: نه `__class__` و `__globals__`، و هر مقدار از سفارش (نام فایل، نشانی) متن است، نه HTML.
- **واکش‌گر فقط `data:`:** هیچ درخواست شبکه و هیچ `file://`؛ نشانی ردشده در خروجی می‌آید تا پیش‌نمایش پنل بگویدش.
- **بی `base_url`:** نشانی نسبی به هیچ جا نمی‌رسد.

ورودی: پوشهٔ کار با `job.json`:
    {"fonts": "<پوشهٔ وزیرمتن>", "templates": {"bijak": "bijak.html", ...}, "pages": [{"template": "bijak", "context": {...}}, ...],
     "max_pages": 200}
خروجی: `out-<i>.pdf` برای هر ردیف `pages`، و `result.json`:
    {"ok": true, "pages": [1, 1, 2], "blocked": ["https://…"]}، یا {"ok": false, "error": {"kind", "template", "line", "message"}}.
کد خروج ۰ یعنی `result.json` نوشته شد (درست یا خطای قالب)؛ هر چیز دیگر یعنی پردازه افتاد.
"""

from __future__ import annotations

import json
import os
import sys

# پیام خطای قالب برای مالک؛ بلندتر بی‌فایده است.
MAX_MESSAGE = 300
# بیشترین نشانی ردشده‌ای که گزارش می‌شود.
MAX_BLOCKED = 10


def _fontconfig(workdir: str, fonts: str) -> None:
    """وزیرمتن برای هر قالب، با نام خانوادهٔ خودش («Vazirmatn»)، کنار فونت‌های ایمیج. پیش از بار شدن Pango."""
    conf = os.path.join(workdir, "fonts.conf")
    with open(conf, "w", encoding="utf-8") as f:
        f.write(
            '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'
            '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n'
            f"  <dir>{_xml(fonts)}</dir>\n"
            f"  <cachedir>{_xml(os.path.join(workdir, 'fc-cache'))}</cachedir>\n"
            "</fontconfig>\n"
        )
    os.environ["FONTCONFIG_FILE"] = conf


def _xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _short(text: object) -> str:
    message = " ".join(str(text).split())
    return message if len(message) <= MAX_MESSAGE else message[: MAX_MESSAGE - 1] + "…"


def main(workdir: str) -> int:
    with open(os.path.join(workdir, "job.json"), encoding="utf-8") as f:
        job = json.load(f)
    _fontconfig(workdir, job["fonts"])

    import jinja2
    import jinja2.sandbox
    import weasyprint
    import weasyprint.urls

    blocked: list[str] = []

    class DataOnly(weasyprint.urls.URLFetcher):
        def fetch(self, url, headers=None):  # noqa: ANN001 — امضای WeasyPrint
            if not url.lower().startswith("data:"):
                if len(blocked) < MAX_BLOCKED and url not in blocked:
                    blocked.append(url[:200])
                raise ValueError("فقط data: پذیرفته است")
            return super().fetch(url, headers)

    fetcher = DataOnly(allowed_protocols=["data"], allow_redirects=False)
    env = jinja2.sandbox.SandboxedEnvironment(autoescape=True)
    templates: dict = {}

    def fail(kind: str, template: str, message: object, line: int | None = None) -> int:
        result = {"ok": False, "error": {"kind": kind, "template": template, "line": line, "message": _short(message)}}
        with open(os.path.join(workdir, "result.json"), "w", encoding="utf-8") as out:
            json.dump(result, out, ensure_ascii=False)
        return 0

    for name, file_name in job["templates"].items():
        with open(os.path.join(workdir, file_name), encoding="utf-8") as f:
            source = f.read()
        try:
            templates[name] = env.from_string(source)
        except jinja2.TemplateSyntaxError as error:
            return fail("syntax", name, error.message, error.lineno)

    counts: list[int] = []
    for i, page in enumerate(job["pages"]):
        name = page["template"]
        try:
            html = templates[name].render(**page["context"])
        except jinja2.exceptions.SecurityError as error:
            return fail("security", name, error)
        except jinja2.TemplateError as error:
            return fail("template", name, error, getattr(error, "lineno", None))
        except Exception as error:  # noqa: BLE001 — خطای اجرای قالب، مثل جمع متن و عدد
            return fail("template", name, f"{type(error).__name__}: {error}")
        try:
            document = weasyprint.HTML(string=html, base_url=None, url_fetcher=fetcher).render()
            document.write_pdf(os.path.join(workdir, f"out-{i}.pdf"))
        except Exception as error:  # noqa: BLE001 — HTML یا CSSی که WeasyPrint نساخت
            return fail("render", name, f"{type(error).__name__}: {error}")
        counts.append(len(document.pages))
        if sum(counts) > job["max_pages"]:
            return fail("pages", name, f"برگه بیش از {job['max_pages']} صفحه شد")

    with open(os.path.join(workdir, "result.json"), "w", encoding="utf-8") as out:
        json.dump({"ok": True, "pages": counts, "blocked": blocked}, out, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
