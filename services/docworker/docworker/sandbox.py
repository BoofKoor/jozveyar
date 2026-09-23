"""
مهار پردازهٔ LibreOffice (ADR-028).

LibreOffice فایل ناشناس کاربر را باز می‌کند، پس فرض این است که روزی یک فایل
آلوده از او کد اجرا بگیرد. دیوارها، از نزدیک به دور:

- **محیط تمیز:** LibreOffice هیچ متغیر محیطی کارگر را نمی‌بیند — نه رمز پایگاه
  داده، نه کلید S3.
- **کارگر non-dumpable:** پردازهٔ هم‌کاربر (LibreOffice آلوده) نمی‌تواند
  `/proc/<کارگر>/environ` یا حافظهٔ کارگر را بخواند؛ هستهٔ لینوکس این را برای
  پردازهٔ non-dumpable فقط به CAP_SYS_PTRACE می‌دهد که کانتینر ندارد. به همین
  دلیل کارگر خودش PID 1 است و `init` داکر (tini) — که محیط کامل کانتینر را دارد
  و dumpable است — به کار نمی‌رود.
- **subreaper:** نوه‌ای که یتیم شود (soffice.bin وقتی oosplash زودتر بمیرد) به
  کارگر برمی‌گردد و جمع می‌شود؛ بدون init هم زامبی نمی‌ماند.
- **گروه پردازهٔ جدا:** سقف زمان یعنی کشتن کل گروه، نه فقط پدر.
- **oom_score_adj=1000:** وقتی حافظهٔ کانتینر پر شود، هسته LibreOffice را می‌کشد نه
  کارگر را؛ کاربر پیام روشن می‌گیرد و صف سالم می‌ماند.
- **RLIMIT_FSIZE:** هیچ فایلی بزرگ‌تر از سقف نوشته نمی‌شود — zip بمب دیسک را پر
  نمی‌کند.

شبکه در پیکربندی خود LibreOffice بسته است (`convert.py`): پراکسی مرده، لینک‌ها
هرگز به‌روز نمی‌شوند، ماکرو خاموش.
"""

from __future__ import annotations

import ctypes
import ctypes.util
import os
import resource
import signal
import subprocess
import tempfile
from dataclasses import dataclass

PR_SET_DUMPABLE = 4
PR_SET_CHILD_SUBREAPER = 36


def _prctl(option: int, value: int) -> bool:
    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6", use_errno=True)
        return libc.prctl(option, value, 0, 0, 0) == 0
    except OSError:
        return False


def protect_worker() -> dict[str, bool]:
    """یک بار، اول کار کارگر. خروجی برای لاگ: کدام دیوار برقرار شد."""
    return {
        "non_dumpable": _prctl(PR_SET_DUMPABLE, 0),
        "subreaper": _prctl(PR_SET_CHILD_SUBREAPER, 1),
    }


def clean_env(workdir: str) -> dict[str, str]:
    """فقط همان که LibreOffice لازم دارد. HOME می‌ماند چون کش fontconfig
    (فونت‌های خصوصی) زیر آن است."""
    return {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": os.environ.get("HOME") or "/tmp",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "TMPDIR": workdir,
        "SAL_USE_VCLPLUGIN": "svp",
    }


@dataclass
class Outcome:
    returncode: int
    timed_out: bool
    oom_killed: bool
    stderr: str


def _oom_kills() -> int | None:
    """شمار OOM کشته‌شده‌های همین cgroup (cgroup v2)؛ None یعنی خوانده نشد."""
    try:
        with open("/sys/fs/cgroup/memory.events", encoding="ascii") as f:
            for line in f:
                key, _, value = line.partition(" ")
                if key == "oom_kill":
                    return int(value)
    except (OSError, ValueError):
        pass
    return None


def reap_orphans() -> None:
    """یتیم‌هایی که به این پردازه (subreaper) برگشته‌اند."""
    while True:
        try:
            pid, _ = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return
        if pid == 0:
            return


def run_confined(cmd: list[str], *, cwd: str, timeout: float, max_file_bytes: int) -> Outcome:
    def child() -> None:
        try:
            with open("/proc/self/oom_score_adj", "w", encoding="ascii") as f:
                f.write("1000")
        except OSError:
            pass
        resource.setrlimit(resource.RLIMIT_FSIZE, (max_file_bytes, max_file_bytes))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    before = _oom_kills()
    # stderr در فایل، نه لوله: نوه‌ای که لوله را باز نگه دارد، انتظار را تا سقف زمان
    # نمی‌کشاند. انتظار فقط برای خود پردازه است؛ بقیهٔ گروه بعدش کشته می‌شود.
    with tempfile.TemporaryFile(dir=cwd) as err:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            env=clean_env(cwd),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=err,
            start_new_session=True,
            preexec_fn=child,  # noqa: PLW1509 — کارگر تک‌رشته‌ای است
            close_fds=True,
        )
        timed_out = False
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            _kill_group(proc.pid)
            proc.wait()
        finally:
            # soffice.bin گاهی بعد از خروج پدرش زنده می‌ماند؛ کل گروه برود.
            _kill_group(proc.pid)
            reap_orphans()
        size = err.seek(0, os.SEEK_END)
        err.seek(max(0, size - 2000))
        tail = err.read()
    after = _oom_kills()
    return Outcome(
        returncode=proc.returncode,
        timed_out=timed_out,
        oom_killed=before is not None and after is not None and after > before,
        stderr=tail.decode("utf-8", errors="replace"),
    )


def _kill_group(pgid: int) -> None:
    try:
        os.killpg(pgid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
