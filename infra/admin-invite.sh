#!/usr/bin/env bash
#
# پیوند ثبت پنل ادمین، روی سرور (برش ۴، ADR-037، تصمیم ۱۶): اولین ادمین، و کد ورود تازهٔ هر ادمین — مثلاً
# مالکی که گوشی‌اش گم شد. پنل ثبت‌نام و بازیابی پیامکی ندارد: هر که به سرور دسترسی دارد صاحب پنل است.
#
#   ./infra/admin-invite.sh <نام کاربری> [--owner | --operator] [--name "نام"]
#
#   ادمین تازه: پیوند ثبت یک‌باره (۱۵ دقیقه)؛ بی نقش صریح، مالک.
#   ادمین موجود: کد ورود تازه؛ رمز و برنامهٔ تأیید قبلی و نشست‌هایش باطل می‌شوند.
#
# درون کانتینر پنل و با همان .env اجرا می‌شود. پیوند فقط در همین ترمینال چاپ می‌شود؛ نه در لاگ کانتینر، نه
# در پایگاه داده (آنجا فقط هشش). از راهی خصوصی بفرستیدش، یا در مرورگر خودتان باز کنید.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/jozveyar}"
COMPOSE="docker compose --env-file ${APP_DIR}/.env -f ${APP_DIR}/infra/docker-compose.prod.yml"

die() { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[[ $# -ge 1 ]] || die "نام کاربری لازم است. مثال: $0 sara --name \"سارا\""
cd "$APP_DIR" || die "${APP_DIR} پیدا نشد."
$COMPOSE ps --services --filter status=running 2>/dev/null | grep -qx admin \
  || die "کانتینر پنل بالا نیست. اول ./infra/deploy-bundle.sh"

exec $COMPOSE exec -T admin node apps/admin/dist/cli.mjs invite "$@"
