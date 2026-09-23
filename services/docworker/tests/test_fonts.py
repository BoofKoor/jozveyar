"""
فونت‌های خصوصی از باکت (ADR-027) — منطق هم‌گام‌سازی با استوریج حافظه‌ای، و یک
بار روی استوریج واقعی (بدون S3_* رد می‌شود).
"""

import hashlib
import os
import shutil
import subprocess
import uuid

import pytest

from docworker import fonts
from docworker.storage import S3Storage, StorageError, StoredObject


class MemoryStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.downloads: list[str] = []

    def list_objects(self, prefix):
        return [
            StoredObject(key, len(body), hashlib.md5(body).hexdigest())
            for key, body in sorted(self.objects.items())
            if key.startswith(prefix)
        ]

    def download(self, key, destination):
        if key not in self.objects:
            raise StorageError(key, missing=True)
        self.downloads.append(key)
        with open(destination, "wb") as f:
            f.write(self.objects[key])
        return len(self.objects[key])

    def upload(self, key, source, content_type="application/octet-stream"):
        with open(source, "rb") as f:
            self.objects[key] = f.read()
        return len(self.objects[key])


@pytest.fixture
def storage():
    return MemoryStorage()


@pytest.fixture
def refreshed():
    return []


def run_sync(storage, font_dir, refreshed):
    return fonts.sync(storage, str(font_dir), refresh=refreshed.append)


def test_sync_downloads_new_fonts_and_refreshes_cache(storage, tmp_path, refreshed):
    storage.objects["fonts/B Nazanin.ttf"] = b"nazanin"
    storage.objects["fonts/B Titr.ttf"] = b"titr"
    result = run_sync(storage, tmp_path, refreshed)
    assert (result.fonts, sorted(result.added), result.removed) == (2, ["B Nazanin.ttf", "B Titr.ttf"], [])
    assert (tmp_path / "B Nazanin.ttf").read_bytes() == b"nazanin"
    assert refreshed == [str(tmp_path)]


def test_unchanged_fonts_are_not_downloaded_again(storage, tmp_path, refreshed):
    storage.objects["fonts/a.ttf"] = b"a"
    run_sync(storage, tmp_path, refreshed)
    storage.downloads.clear()
    result = run_sync(storage, tmp_path, refreshed)
    assert storage.downloads == [] and result.added == []
    # بدون تغییر، کش fontconfig هم دوباره ساخته نمی‌شود.
    assert refreshed == [str(tmp_path)]


def test_changed_font_is_replaced_and_removed_font_is_deleted(storage, tmp_path, refreshed):
    storage.objects["fonts/a.ttf"] = b"v1"
    storage.objects["fonts/b.ttf"] = b"b"
    run_sync(storage, tmp_path, refreshed)
    storage.objects["fonts/a.ttf"] = b"v2"
    del storage.objects["fonts/b.ttf"]
    result = run_sync(storage, tmp_path, refreshed)
    assert (result.added, result.removed) == (["a.ttf"], ["b.ttf"])
    assert (tmp_path / "a.ttf").read_bytes() == b"v2"
    assert not (tmp_path / "b.ttf").exists()


def test_only_top_level_font_files_are_taken(storage, tmp_path, refreshed):
    storage.objects.update(
        {
            "fonts/ok.otf": b"x",
            "fonts/nested/evil.ttf": b"x",
            "fonts/.hidden.ttf": b"x",
            "fonts/readme.txt": b"x",
            "fonts/": b"",
            "uploads/other.ttf": b"x",
        }
    )
    result = run_sync(storage, tmp_path, refreshed)
    assert result.added == ["ok.otf"]
    assert sorted(os.listdir(tmp_path)) == [".synced.json", "ok.otf"]


def test_oversized_font_is_skipped(storage, tmp_path, refreshed, monkeypatch):
    monkeypatch.setattr(fonts, "MAX_FONT_BYTES", 3)
    storage.objects["fonts/big.ttf"] = b"1234"
    storage.objects["fonts/small.ttf"] = b"12"
    assert run_sync(storage, tmp_path, refreshed).added == ["small.ttf"]


def test_partial_download_of_a_dead_worker_is_cleaned(storage, tmp_path, refreshed):
    (tmp_path / ".part-abc123").write_bytes(b"half a font")
    run_sync(storage, tmp_path, refreshed)
    assert not (tmp_path / ".part-abc123").exists()


def test_failed_download_leaves_no_partial_file(storage, tmp_path, refreshed):
    storage.objects["fonts/a.ttf"] = b"a"

    def broken(key, destination):
        with open(destination, "wb") as f:
            f.write(b"hal")
        raise StorageError("connection reset")

    storage.download = broken
    with pytest.raises(StorageError):
        run_sync(storage, tmp_path, refreshed)
    assert [n for n in os.listdir(tmp_path) if n.startswith(".part-")] == []
    assert not (tmp_path / "a.ttf").exists()


def test_upload_sends_only_fonts(storage, tmp_path):
    (tmp_path / "B Nazanin.ttf").write_bytes(b"n")
    (tmp_path / "BNazaninBold.TTF").write_bytes(b"b")
    (tmp_path / "notes.txt").write_bytes(b"t")
    (tmp_path / ".DS_Store").write_bytes(b"d")
    (tmp_path / "sub").mkdir()
    assert fonts.upload(storage, str(tmp_path)) == ["B Nazanin.ttf", "BNazaninBold.TTF"]
    assert sorted(storage.objects) == ["fonts/B Nazanin.ttf", "fonts/BNazaninBold.TTF"]


# ── روی استوریج واقعی ────────────────────────────────────────────────────

REAL = all(os.environ.get(k) for k in ("S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"))


@pytest.mark.skipif(not REAL, reason="S3_* لازم است")
def test_round_trip_through_real_storage(tmp_path, monkeypatch, refreshed):
    monkeypatch.setenv("S3_BUCKET", os.environ.get("S3_BUCKET") or "jozveyar")
    storage = S3Storage.from_env()
    # پیشوند یکتا: فونت‌های واقعی باکت (اگر هست) دست نمی‌خورند.
    prefix = f"fonts-test/{uuid.uuid4()}/"
    source = tmp_path / "src"
    source.mkdir()
    (source / "Test Font.ttf").write_bytes(b"\x00\x01\x00\x00fake font body")
    storage.upload(prefix + "Test Font.ttf", str(source / "Test Font.ttf"), "font/ttf")
    try:
        font_dir = tmp_path / "fonts"
        result = fonts.sync(storage, str(font_dir), refresh=refreshed.append, prefix=prefix)
        assert result.added == ["Test Font.ttf"]
        assert (font_dir / "Test Font.ttf").read_bytes() == b"\x00\x01\x00\x00fake font body"
    finally:
        storage.delete(prefix + "Test Font.ttf")
    result = fonts.sync(storage, str(font_dir), refresh=refreshed.append, prefix=prefix)
    assert result.removed == ["Test Font.ttf"]


# ── داخل ایمیج پایه: نگاشت‌ها واقعاً گرفته‌اند ─────────────────────────────

IN_BASE_IMAGE = os.path.exists("/etc/fonts/conf.d/61-jozveyar-aliases.conf") and shutil.which("fc-match")


def fc_match(family: str) -> str:
    return subprocess.run(
        ["fc-match", "-f", "%{family[0]}", family], capture_output=True, text=True, check=True
    ).stdout


@pytest.mark.skipif(not IN_BASE_IMAGE, reason="فقط داخل ایمیج پایهٔ کارگر")
@pytest.mark.parametrize(
    "requested, expected",
    [
        ("B Nazanin", "Nazli"),
        ("IRLotus", "Nazli"),
        ("B Titr", "Titr"),
        ("B Yekan", "Vazirmatn"),
        ("IRANSans", "Vazirmatn"),
        ("Vazirmatn", "Vazirmatn"),
        ("Tahoma", "Tahoma"),
        ("Times New Roman", "Liberation Serif"),
        ("Arial", "Liberation Sans"),
        ("Calibri", "Carlito"),
    ],
)
def test_word_fonts_map_to_the_intended_substitute(requested, expected):
    assert fc_match(requested) == expected


@pytest.mark.skipif(not IN_BASE_IMAGE, reason="فقط داخل ایمیج پایهٔ کارگر")
def test_private_font_directory_is_known_to_fontconfig():
    listed = subprocess.run(["fc-conflist"], capture_output=True, text=True).stdout
    assert "62-jozveyar-private.conf" in listed
