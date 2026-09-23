#!/usr/bin/env bash
#
# شناسهٔ ایمیج پایهٔ کارگر: هش هر فایلی که `Dockerfile.base` داخلش می‌برد (ADR-027).
#
# CI با همین شناسه می‌فهمد پایه را باید بسازد یا نسخهٔ منتشرشده را بردارد، و
# سرور با همین شناسه می‌فهمد پایه را دارد یا باید دانلود کند. پس هر ورودی تازهٔ
# `Dockerfile.base` باید اینجا هم بیاید؛ وگرنه تغییرش بی‌صدا به سرور نمی‌رسد.
#
#   ./services/docworker/base-id.sh   ← ۱۶ رقم hex

set -euo pipefail
cd "$(dirname "$0")"
find Dockerfile.base requirements.txt fonts fontconfig -type f -print0 \
  | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16
