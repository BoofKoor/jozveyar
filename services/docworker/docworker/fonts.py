"""
فونت‌های خصوصی، از پیشوند `fonts/` باکت (ADR-027).

مخزن و بسته‌های منتشرشده عمومی‌اند، پس فونتی که مجوز انتشار ندارد (مثل سری B
که Word ایرانی پر از آن است) هیچ‌وقت در آنها نمی‌رود. صاحب پروژه آن را یک بار در
باکت می‌گذارد (`infra/upload-fonts.sh`) و هر کارگر موقع بالا آمدن — و بعد هر ده
دقیقه — پوشهٔ فونت خودش را با آن هم‌گام می‌کند.

حالت در کارگر نیست: نود دوم با همان `.env` همان فونت‌ها را می‌گیرد. قاعدهٔ
نگهداری باکت فقط روی `uploads/` است، پس `fonts/` پاک نمی‌شود.

بدون این فونت‌ها هم همه‌چیز کار می‌کند — با نزدیک‌ترین فونت آزاد
(`fontconfig/61-jozveyar-aliases.conf`)؛ فقط تعداد صفحه و ظاهر ممکن است فرق کند.

    python -m docworker.fonts upload <پوشه>    فونت‌های یک پوشه را به باکت می‌برد
    python -m docworker.fonts list              فونت‌های باکت
    python -m docworker.fonts sync              هم‌گام‌سازی همین حالا
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from typing import Callable, Protocol

from .storage import StoredObject

log = logging.getLogger("docworker.fonts")

PREFIX = "fonts/"
# در ایمیج پایه به fontconfig معرفی شده (fontconfig/62-jozveyar-private.conf) و مال
# کاربر docworker است.
FONT_DIR = "/var/lib/docworker/fonts"
EXTENSIONS = (".ttf", ".otf", ".ttc")
CONTENT_TYPES = {".ttf": "font/ttf", ".otf": "font/otf", ".ttc": "font/collection"}
MAX_FONT_BYTES = 50 * 1024 * 1024
SYNC_EVERY_SECONDS = 600
STATE_FILE = ".synced.json"
PARTIAL_PREFIX = ".part-"


class FontStorage(Protocol):
    def list_objects(self, prefix: str) -> list[StoredObject]: ...
    def download(self, key: str, destination: str) -> int: ...
    def upload(self, key: str, source: str, content_type: str = ...) -> int: ...


@dataclass
class SyncResult:
    fonts: int
    added: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)


def font_name(key: str, prefix: str = PREFIX) -> str | None:
    """نام فایل محلی از کلید: فقط فونت، فقط سطح اول پیشوند، بدون نام پنهان."""
    if not key.startswith(prefix):
        return None
    name = key[len(prefix) :]
    if not name or "/" in name or "\\" in name or name.startswith("."):
        return None
    return name if name.lower().endswith(EXTENSIONS) else None


def refresh_fontconfig(font_dir: str) -> None:
    """کش fontconfig؛ LibreOffice بعدی فونت تازه را می‌بیند."""
    subprocess.run(["fc-cache", "-f", font_dir], check=False, capture_output=True, timeout=120)


def sync(
    storage: FontStorage,
    font_dir: str | None = None,
    refresh: Callable[[str], None] = refresh_fontconfig,
    prefix: str = PREFIX,
) -> SyncResult:
    """پوشهٔ فونت را دقیقاً هم‌شکل پیشوند `fonts/` باکت می‌کند.

    فقط چیزی که عوض شده دانلود می‌شود (ETag در `.synced.json`)، و هر فایل اول در
    نام موقت نوشته و بعد یکجا جابه‌جا می‌شود: fontconfig هیچ‌وقت نیمهٔ یک فونت را
    نمی‌بیند. فونتی که از باکت برداشته شده، اینجا هم پاک می‌شود.
    """
    font_dir = font_dir or os.environ.get("DOCWORKER_FONT_DIR") or FONT_DIR
    os.makedirs(font_dir, exist_ok=True)
    state_path = os.path.join(font_dir, STATE_FILE)
    try:
        with open(state_path, encoding="utf-8") as f:
            state: dict[str, str] = json.load(f)
    except (OSError, ValueError):
        state = {}

    # تکهٔ نیمه‌کارهٔ کارگری که وسط دانلود مرد.
    for name in os.listdir(font_dir):
        if name.startswith(PARTIAL_PREFIX):
            os.unlink(os.path.join(font_dir, name))

    remote: dict[str, StoredObject] = {}
    for obj in storage.list_objects(prefix):
        name = font_name(obj.key, prefix)
        if name is None:
            continue
        if not 0 < obj.size <= MAX_FONT_BYTES:
            log.warning("فونت %s نادیده گرفته شد: حجم %s بایت", obj.key, obj.size)
            continue
        remote[name] = obj

    result = SyncResult(fonts=len(remote))
    for name, obj in sorted(remote.items()):
        path = os.path.join(font_dir, name)
        if state.get(name) == obj.etag and os.path.exists(path):
            continue
        fd, partial = tempfile.mkstemp(dir=font_dir, prefix=PARTIAL_PREFIX)
        os.close(fd)
        try:
            storage.download(obj.key, partial)
            os.replace(partial, path)
        finally:
            if os.path.exists(partial):
                os.unlink(partial)
        state[name] = obj.etag
        result.added.append(name)

    for name in sorted(os.listdir(font_dir)):
        if name.lower().endswith(EXTENSIONS) and name not in remote:
            os.unlink(os.path.join(font_dir, name))
            state.pop(name, None)
            result.removed.append(name)

    with open(state_path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, sort_keys=True)
    if result.added or result.removed:
        refresh(font_dir)
    return result


def upload(storage: FontStorage, directory: str) -> list[str]:
    """فونت‌های سطح اول یک پوشه را به `fonts/` باکت می‌برد. نام فایل حفظ می‌شود."""
    sent = []
    for name in sorted(os.listdir(directory)):
        path = os.path.join(directory, name)
        if not os.path.isfile(path) or name.startswith(".") or font_name(PREFIX + name) is None:
            continue
        size = os.path.getsize(path)
        if not 0 < size <= MAX_FONT_BYTES:
            print(f"✗ {name}: حجم {size} بایت — رد شد", file=sys.stderr)
            continue
        ext = os.path.splitext(name)[1].lower()
        storage.upload(PREFIX + name, path, CONTENT_TYPES[ext])
        print(f"✓ {name}")
        sent.append(name)
    return sent


def main(argv: list[str]) -> int:
    from .storage import S3Storage

    storage = S3Storage.from_env()
    command = argv[0] if argv else ""
    if command == "upload" and len(argv) == 2:
        sent = upload(storage, argv[1])
        print(f"{len(sent)} فونت در باکت (پیشوند {PREFIX}). کارگر تا ده دقیقهٔ دیگر، یا با ری‌استارت، برشان می‌دارد.")
        return 0 if sent else 1
    if command == "list":
        for obj in storage.list_objects(PREFIX):
            if font_name(obj.key):
                print(f"{obj.size:>10}  {obj.key[len(PREFIX):]}")
        return 0
    if command == "sync":
        result = sync(storage)
        print(f"{result.fonts} فونت؛ تازه: {result.added or '—'}؛ برداشته: {result.removed or '—'}")
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    sys.exit(main(sys.argv[1:]))
