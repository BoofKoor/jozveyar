#!/usr/bin/env bash
#
# فونت‌های خصوصی به باکت (ADR-027) — یک بار، روی سرور.
#
# مخزن و بسته‌ها عمومی‌اند، پس فونتی که مجوز انتشارش را نداریم (مثل B Nazanin و
# بقیهٔ سری B) هیچ‌وقت در آنها نمی‌رود. به‌جایش در پیشوند خصوصی `fonts/` باکت
# می‌نشیند و هر کارگر اسناد، روی هر نودی، با همان `.env` برش می‌دارد.
#
# اجرا (روی سرور، بعد از کپی کردن فایل‌های فونت در یک پوشه):
#   ./infra/upload-fonts.sh /root/fonts
#
# فقط .ttf و .otf و .ttc سطح اول پوشه برداشته می‌شوند. نام فایل مهم نیست؛
# LibreOffice فونت را با نام داخل خودش (مثلاً «B Nazanin») پیدا می‌کند.
# فهرست: docker compose … run --rm docworker python -m docworker.fonts list

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/jozveyar}"
COMPOSE="docker compose --env-file ${APP_DIR}/.env -f ${APP_DIR}/infra/docker-compose.prod.yml"

ok()  { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
die() { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[[ $# -eq 1 && -d "$1" ]] || die "استفاده: $0 <پوشهٔ فونت‌ها>"
DIR="$(cd "$1" && pwd)"
[[ -f "${APP_DIR}/.env" ]] || die "${APP_DIR}/.env پیدا نشد."

# همان ایمیج و همان .env کارگر: کلید S3 هیچ‌جای دیگری لازم نیست. با root، چون
# فایل‌هایی که با scp آمده‌اند ممکن است فقط برای root خواندنی باشند.
$COMPOSE run --rm --no-deps --user root -v "${DIR}:/fonts:ro" docworker \
  python -m docworker.fonts upload /fonts

# کارگر فونت‌ها را موقع بالا آمدن برمی‌دارد (و بعد هر ده دقیقه)؛ ری‌استارت یعنی همین حالا.
$COMPOSE restart docworker >/dev/null
ok "کارگر اسناد ری‌استارت شد و فونت‌ها را برداشت. لاگ: ${COMPOSE} logs docworker | grep فونت"
