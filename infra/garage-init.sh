#!/usr/bin/env bash
#
# آماده‌سازی Garage: چیدمان تک‌گره، باکت، و کلید اپ. idempotent.
#
# همین یک اسکریپت روی سرور (از setup-storage.sh)، در CI و روی ماشین توسعه
# اجرا می‌شود؛ فقط نحوهٔ صدا زدن garage فرق می‌کند:
#
#   GARAGE_CMD="docker compose ... exec -T garage /garage"   سرور
#   GARAGE_CMD="docker exec garage /garage"                    CI
#
# ورودی (متغیر محیطی):
#   GARAGE_CMD       فرمان اجرای garage
#   S3_BUCKET        نام باکت
#   S3_ACCESS_KEY    شناسهٔ کلید اپ — شکل Garage: GK + ۲۴ رقم hex
#   S3_SECRET_KEY    رمز کلید اپ — ۶۴ رقم hex
#   GARAGE_CAPACITY  ظرفیت اعلامی گره (پیش‌فرض 50G). سقف واقعی نیست؛ Garage
#                    با آن فقط داده را بین گره‌ها تقسیم می‌کند.

set -euo pipefail

: "${GARAGE_CMD:?GARAGE_CMD لازم است}"
: "${S3_BUCKET:?S3_BUCKET لازم است}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY لازم است}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY لازم است}"
CAPACITY="${GARAGE_CAPACITY:-50G}"

garage() { $GARAGE_CMD "$@"; }
info() { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[[ "$S3_ACCESS_KEY" =~ ^GK[0-9a-f]{24}$ ]] \
  || die "S3_ACCESS_KEY شکل کلید Garage را ندارد (GK + ۲۴ رقم hex)."
[[ "$S3_SECRET_KEY" =~ ^[0-9a-f]{64}$ ]] \
  || die "S3_SECRET_KEY شکل رمز Garage را ندارد (۶۴ رقم hex)."

# ── ۱. بالا آمدن ─────────────────────────────────────────────────────────
for i in $(seq 1 30); do
  garage status >/dev/null 2>&1 && break
  (( i == 30 )) && die "Garage جواب نمی‌دهد."
  sleep 1
done

# ── ۲. چیدمان ────────────────────────────────────────────────────────────
# گرهٔ تازه هیچ نقشی ندارد و تا چیدمان اعمال نشود، هیچ درخواست S3 را
# نمی‌پذیرد. فقط بار اول اعمال می‌شود؛ اجرای دوباره به آن دست نمی‌زند.
NODE_ID=$(garage node id -q 2>/dev/null | cut -d@ -f1)
[[ -n "$NODE_ID" ]] || die "شناسهٔ گره پیدا نشد."
if garage layout show 2>/dev/null | grep -q "${NODE_ID:0:16}"; then
  ok "چیدمان از قبل هست"
else
  garage layout assign -z dc1 -c "$CAPACITY" "$NODE_ID" >/dev/null
  garage layout apply --version 1 >/dev/null
  ok "چیدمان تک‌گره اعمال شد"
fi

# ── ۳. باکت ──────────────────────────────────────────────────────────────
if garage bucket info "$S3_BUCKET" >/dev/null 2>&1; then
  ok "باکت ${S3_BUCKET} از قبل هست"
else
  garage bucket create "$S3_BUCKET" >/dev/null
  ok "باکت ${S3_BUCKET} ساخته شد"
fi

# ── ۴. کلید اپ ───────────────────────────────────────────────────────────
# کلید از .env وارد می‌شود، نه اینکه Garage بسازد: .env منبع حقیقت می‌ماند و
# بازسازی کانتینر یا داده کلید اپ را عوض نمی‌کند.
if garage key info "$S3_ACCESS_KEY" >/dev/null 2>&1; then
  ok "کلید اپ از قبل هست"
else
  garage key import --yes -n jozveyar-app "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  ok "کلید اپ وارد شد"
fi

# دسترسی فقط به همین باکت. owner لازم است چون اپ قاعدهٔ نگهداری و CORS را
# خودش روی باکت می‌گذارد. کلید اپ هیچ باکت دیگری نمی‌بیند و نمی‌سازد.
garage bucket allow --read --write --owner "$S3_BUCKET" --key "$S3_ACCESS_KEY" >/dev/null
ok "کلید اپ به باکت ${S3_BUCKET} دسترسی دارد"
