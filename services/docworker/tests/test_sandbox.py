"""
مهار پردازهٔ LibreOffice (ADR-028) — با پردازه‌های ساده به‌جای LibreOffice.

فرض امنیتی این است که فایل آلوده روزی از LibreOffice کد اجرا بگیرد. این تست‌ها
نشان می‌دهند آن کد چه چیزی را نمی‌بیند و چه کاری نمی‌تواند بکند. دو تست آخر در
پردازهٔ جدا اجرا می‌شوند، چون وضعیت کل پردازه (dumpable، subreaper) را عوض می‌کنند.
"""

import os
import subprocess
import sys
import textwrap
import time

import pytest

from docworker import sandbox

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pytestmark = pytest.mark.skipif(not sys.platform.startswith("linux"), reason="فقط لینوکس")


def confined(tmp_path, script: str, timeout: float = 10, max_file_bytes: int = 10**6):
    return sandbox.run_confined(
        ["/bin/sh", "-c", script], cwd=str(tmp_path), timeout=timeout, max_file_bytes=max_file_bytes
    )


def test_libreoffice_sees_none_of_the_worker_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://jozveyar:db-password@postgres/jozveyar")
    monkeypatch.setenv("S3_SECRET_KEY", "s3-secret-key")
    out = confined(tmp_path, "env >&2")
    assert out.returncode == 0
    assert "db-password" not in out.stderr and "s3-secret-key" not in out.stderr
    names = {line.split("=", 1)[0] for line in out.stderr.splitlines() if "=" in line}
    assert {"PATH", "HOME", "TMPDIR"} <= names
    assert f"TMPDIR={tmp_path}" in out.stderr


def test_limits_apply_to_the_child(tmp_path):
    out = confined(
        tmp_path,
        "cat /proc/self/oom_score_adj >&2; ulimit -c >&2; head -c 50000 /dev/zero > big; true",
        max_file_bytes=1000,
    )
    lines = out.stderr.split()
    # حافظه که پر شود، هسته اول همین را می‌کشد، نه کارگر را.
    assert lines[0] == "1000"
    assert lines[1] == "0"  # بدون core dump: حافظهٔ LibreOffice روی دیسک نمی‌ریزد
    # zip بمب دیسک را پر نمی‌کند.
    assert os.path.getsize(tmp_path / "big") <= 1000


def _dead(pid: int) -> bool:
    try:
        with open(f"/proc/{pid}/stat", encoding="ascii") as f:
            state = f.read().rsplit(")", 1)[1].split()[0]
    except FileNotFoundError:
        return True
    return state in ("Z", "X")


def test_timeout_kills_the_whole_process_group(tmp_path):
    """LibreOffice پدر و نوه دارد (oosplash ← soffice.bin)؛ کشتن پدر کافی نیست."""
    started = time.monotonic()
    out = confined(tmp_path, "sleep 60 & echo $! > child; sleep 60", timeout=1)
    assert out.timed_out
    assert time.monotonic() - started < 10
    child = int((tmp_path / "child").read_text())
    deadline = time.monotonic() + 5
    while not _dead(child) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert _dead(child)


def test_lingering_grandchild_neither_delays_nor_survives(tmp_path):
    """soffice.bin که بعد از تمام شدن کار زنده بماند (و stderr را باز نگه دارد)،
    تبدیل موفق را «سقف زمان» نمی‌کند و خودش هم نمی‌ماند."""
    started = time.monotonic()
    out = confined(tmp_path, "sleep 60 & echo $! > child; echo done >&2; exit 0", timeout=20)
    assert time.monotonic() - started < 5
    assert (out.timed_out, out.returncode, out.stderr.strip()) == (False, 0, "done")
    child = int((tmp_path / "child").read_text())
    deadline = time.monotonic() + 5
    while not _dead(child) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert _dead(child)


def run_isolated(code: str, env: dict[str, str] | None = None) -> str:
    """کد در پایتون جدا، با کاربر بی‌امتیاز اگر تست با root اجرا شده: root قابلیت
    CAP_SYS_PTRACE دارد و دیوار non-dumpable برایش معنا ندارد — LibreOffice واقعی با
    کاربر docworker اجرا می‌شود، بدون هیچ قابلیتی."""
    prelude = textwrap.dedent(
        """
        import os, sys, tempfile
        from docworker import sandbox
        if os.getuid() == 0:
            os.setgid(65534)
            os.setuid(65534)
        # setuid پردازه را non-dumpable می‌کند؛ پایهٔ مقایسه باید پردازهٔ معمولی باشد.
        sandbox._prctl(sandbox.PR_SET_DUMPABLE, 1)
        work = tempfile.mkdtemp()
        """
    )
    result = subprocess.run(
        [sys.executable, "-c", prelude + textwrap.dedent(code)],
        cwd=ROOT,
        env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "PYTHONDONTWRITEBYTECODE": "1", **(env or {})},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


STEAL = """
    {protect}
    out = sandbox.run_confined(["/bin/sh", "-c", "cat /proc/$PPID/environ >&2"], cwd=work, timeout=10, max_file_bytes=10**6)
    print("LEAK" if "s3-secret-key" in out.stderr else "SAFE")
"""


def test_libreoffice_cannot_read_the_worker_memory_or_environment():
    """کد آلوده در LibreOffice محیط خود را تمیز می‌بیند؛ ولی کارگر پدرش است و
    `/proc/<کارگر>/environ` رمز پایگاه داده و کلید S3 را دارد."""
    secrets = {"S3_SECRET_KEY": "s3-secret-key"}
    control = run_isolated(STEAL.format(protect=""), secrets)
    if control != "LEAK":
        pytest.skip("این محیط خودش /proc پردازهٔ دیگر را می‌بندد؛ تست چیزی نمی‌سنجد")
    assert run_isolated(STEAL.format(protect="sandbox.protect_worker()"), secrets) == "SAFE"


def test_orphans_come_back_to_the_worker_and_are_reaped():
    """نوه‌ای که پدرش زودتر بمیرد (soffice.bin) یتیم می‌شود؛ کارگر — که PID 1
    کانتینر است و init ندارد — آن را جمع می‌کند و زامبی نمی‌ماند."""
    out = run_isolated(
        """
        import time
        walls = sandbox.protect_worker()
        sandbox.run_confined(["/bin/sh", "-c", "(sleep 30 &); exit 0"], cwd=work, timeout=10, max_file_bytes=10**6)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            sandbox.reap_orphans()
            try:
                os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                break
            time.sleep(0.05)
        else:
            raise SystemExit("orphan left behind")
        print(walls["non_dumpable"], walls["subreaper"])
        """
    )
    assert out == "True True"
