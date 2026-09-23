"""
ایمیج پایهٔ کارگر (ADR-027): LibreOffice واقعاً Word و پاورپوینت را PDF می‌کند و
متن فارسی با فونت نگاشت‌شده می‌نشیند.

فقط جایی اجرا می‌شود که LibreOffice هست — در CI، داخل همان ایمیجی که روی سرور
می‌رود. تبدیلِ خود کارگر (سقف زمان و حافظه، امنیت، تشخیص فرمت) قدم بعد است؛
اینجا فقط اثبات اینکه ایمیج توان این کار را دارد.
"""

import os
import shutil
import subprocess

import fitz
import pytest

from tests.samples import docx_paragraph, make_docx, make_odp, persian_text

SOFFICE = shutil.which("soffice")
# نشانهٔ ایمیج پایه: نگاشت فونت‌های ما. LibreOffice دستگاه توسعه نه این نگاشت را
# دارد و نه لزوماً Impress را، پس آنجا این تست‌ها چیزی دربارهٔ ایمیج نمی‌گویند.
IN_BASE_IMAGE = os.path.exists("/etc/fonts/conf.d/61-jozveyar-aliases.conf")
pytestmark = pytest.mark.skipif(not (SOFFICE and IN_BASE_IMAGE), reason="فقط داخل ایمیج پایهٔ کارگر")


def convert(source: str, out_dir: str, target: str = "pdf") -> str:
    profile = os.path.join(out_dir, "lo-profile")
    subprocess.run(
        [
            SOFFICE, f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
            "--convert-to", target, "--outdir", out_dir, source,
        ],
        check=True, capture_output=True, timeout=180,
    )
    stem = os.path.splitext(os.path.basename(source))[0]
    return os.path.join(out_dir, f"{stem}.{target}")


def embedded_fonts(pdf_path: str) -> set[str]:
    with fitz.open(pdf_path) as doc:
        return {font[3].split("+")[-1] for i in range(doc.page_count) for font in doc.get_page_fonts(i)}


def has_arabic_script(text: str) -> bool:
    return any(0x0600 <= ord(ch) <= 0x06FF or 0xFB50 <= ord(ch) <= 0xFEFC for ch in text)


def test_persian_word_document_converts_with_the_mapped_font(tmp_path):
    source = tmp_path / "jozve.docx"
    paragraphs = [docx_paragraph(persian_text(i + 1, 40), "B Nazanin") for i in range(60)]
    paragraphs.append(docx_paragraph("Integral of x squared is x cubed over three.", "Times New Roman", rtl=False))
    make_docx(str(source), paragraphs)

    pdf = convert(str(source), str(tmp_path))
    with fitz.open(pdf) as doc:
        assert doc.page_count >= 2
        assert (round(doc[0].rect.width), round(doc[0].rect.height)) == (595, 842)  # A4
        assert has_arabic_script(doc[0].get_text())

    # B Nazanin در ایمیج نیست (مخزن عمومی است)؛ نگاشت باید Nazli بدهد، نه فونت نامربوط.
    # اگر فونت خصوصی واقعی نصب باشد، خود آن.
    want = subprocess.run(
        ["fc-match", "-f", "%{family[0]}", "B Nazanin"], capture_output=True, text=True, check=True
    ).stdout.replace(" ", "")
    fonts = embedded_fonts(pdf)
    assert any(want in name for name in fonts), fonts
    assert any("LiberationSerif" in name for name in fonts), fonts


def test_presentation_survives_pptx_round_trip(tmp_path):
    source = tmp_path / "slides.odp"
    make_odp(str(source), ["اسلاید یک", "اسلاید دو", "اسلاید سه"])
    pptx = convert(str(source), str(tmp_path), "pptx")
    assert os.path.getsize(pptx) > 0

    pdf_dir = tmp_path / "pdf"
    pdf_dir.mkdir()
    pdf = convert(pptx, str(pdf_dir))
    with fitz.open(pdf) as doc:
        assert doc.page_count == 3
        # اسلاید افقی است، نه A4.
        assert doc[0].rect.width > doc[0].rect.height
