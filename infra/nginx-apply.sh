#!/usr/bin/env bash
#
# پیکربندی Nginx مخزن را به کانتینر زنده می‌رساند: اول سنجش، بعد خواندن دوباره بی قطع، یا ساختن دوبارهٔ کانتینر اگر
# لازم است. «✓» فقط وقتی چاپ می‌شود که راست است.
#
# چرا (باگ ۴٫۱، رفع ۱۴۰۵/۰۷/۰۵): compose پیکربندی را تک‌فایل وصل می‌کرد. `git pull` فایل را با فایل تازه عوض می‌کند و
# کانتینری که از قبل بالا بود همان فایل قدیم را می‌دید؛ `nginx -t` و `nginx -s reload` درون همان کانتینر همان قدیمی را
# سنجیدند و خواندند، و بلوک زیردامنهٔ پنل تا ساختن دوبارهٔ دستی کانتینر نیامد. حالا پوشه‌ها وصل‌اند و فایل تازه دیده
# می‌شود؛ این اسکریپت باز هم می‌سنجد که کانتینر همان فایل‌های مخزن را می‌بیند.
#
#   ۱. سنجش در کانتینری یک‌بار مصرف با همان تعریف compose (`run --rm … nginx -t`)؛ نادرست ← Nginx دست نمی‌خورد.
#   ۲. Nginx بالا نیست ← بالا آوردن. تعریف سرویسش در compose عوض شده ← compose از نو می‌سازدش. کانتینر فایل‌هایی جز
#      مخزن می‌بیند ← از نو ساختن، بلند. وگرنه `nginx -s reload`، بی قطع: پیکربندی و گواهی تازه، و نام‌های `web` و
#      `garage` دوباره حل می‌شوند (وب تازه ساخته شده).
#   ۳. سنجش پایانی: سالم و همان فایل‌های مخزن؛ و پس از reload، خواندن دوباره در لاگ خود Nginx.
#
# deploy-bundle.sh و setup-tls.sh صدایش می‌زنند. web و garage باید بالا باشند: Nginx نامشان را هنگام خواندن پیکربندی
# حل می‌کند.
#
#   ./infra/nginx-apply.sh
#
# خروج ۰: Nginx بالاست، با همین پیکربندی مخزن. ۱: نه؛ پیکربندی کارکن قبلی، اگر بود، دست نخورده و چرایش چاپ شده.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/jozveyar}"
COMPOSE="docker compose --env-file ${APP_DIR}/.env -f ${APP_DIR}/infra/docker-compose.prod.yml"

info() { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$1"; }
# fail <پیام> [جزئیات]: بلند، در stderr، با جزئیات (خروجی خود Nginx یا compose) زیرش؛ خروج ۱.
fail() {
  printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2
  if [[ -n "${2:-}" ]]; then printf '%s\n' "$2" | sed '/^[[:space:]]*$/d; s/^/    /' >&2; fi
  exit 1
}

cd "$APP_DIR" || fail "${APP_DIR} پیدا نشد."

# فایل‌هایی که Nginx می‌خواند، هر کدام با اثر انگشت و نام نسبی: یک فهرست در مخزن و درون کانتینر.
FILES='conf.d/*.conf snippets/*.conf'
repo_files() { (cd infra/nginx && sha256sum $FILES) 2>/dev/null | LC_ALL=C sort || true; }
live_files() { $COMPOSE exec -T nginx sh -c "cd /etc/nginx && sha256sum $FILES" 2>/dev/null | LC_ALL=C sort || true; }
running()    { $COMPOSE ps --services --filter status=running 2>/dev/null | grep -qx nginx; }
healthy() {
  for _ in $(seq 1 30); do
    $COMPOSE exec -T nginx wget -qO- http://127.0.0.1/nginx-health >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}
# پس از بالا آوردن یا ساختن دوباره: سالم است و همان فایل‌های مخزن را می‌بیند.
settled() {
  healthy || fail "Nginx بالا نیامد. لاگ: ${COMPOSE} logs nginx" \
    "$($COMPOSE logs --no-log-prefix --tail 10 nginx 2>&1 || true)"
  [[ "$(live_files)" == "$(repo_files)" ]] || fail "کانتینر Nginx هنوز فایل‌هایی جز مخزن می‌بیند:" \
    "$(diff <(live_files) <(repo_files) || true)"
}
# up <آرگومان‌های up>: خروجی compose فقط اگر افتاد.
up() {
  local out
  out=$($COMPOSE up -d --no-deps "$@" nginx 2>&1) || fail "ساختن کانتینر Nginx نشد:" "$out"
}

# ── ۱. سنجش، پیش از هر دست زدنی ─────────────────────────────────────────
[[ -n "$(repo_files)" ]] || fail "پیکربندی Nginx در ${APP_DIR}/infra/nginx/conf.d پیدا نشد."
if ! OUT=$($COMPOSE run --rm --no-deps -T -e NGINX_ENTRYPOINT_QUIET_LOGS=1 nginx nginx -t 2>&1); then
  # سطرهای پیشرفت compose و نسخهٔ زمان‌دار همان خطا در لاگ Nginx کنار می‌روند؛ اگر چیزی نماند، خروجی خام.
  OUT=$(grep -vE '^[[:space:]]*Container |^[0-9]{4}/[0-9]{2}/[0-9]{2} ' <<<"$OUT" || printf '%s' "$OUT")
  running && fail "پیکربندی Nginx مخزن سنجش را نگذراند — Nginx دست نخورد و با پیکربندی قبلی کار می‌کند:" "$OUT"
  fail "پیکربندی Nginx مخزن سنجش را نگذراند — Nginx بالا نیامد:" "$OUT"
fi

# ── ۲. به کار انداختن ────────────────────────────────────────────────────
if ! running; then
  info "Nginx بالا نیست — بالا آوردن…"
  up --force-recreate
  settled
  ok "Nginx بالا آمد، با پیکربندی مخزن"
  exit 0
fi

# تعریف سرویس در compose عوض شده باشد (مثلاً پوشهٔ وصل تازه)، compose همین‌جا از نو می‌سازدش؛ وگرنه کاری نمی‌کند.
BEFORE=$($COMPOSE ps -q nginx)
up
if [[ "$($COMPOSE ps -q nginx)" != "$BEFORE" ]]; then
  settled
  ok "Nginx با تعریف تازهٔ compose از نو ساخته شد (چند ثانیه قطعی)، با پیکربندی مخزن"
  exit 0
fi

# کانتینر فایل‌هایی جز مخزن می‌بیند: وصلی کهنه (تک‌فایل پیش از این رفع، یا پوشه‌ای که پاک و دوباره ساخته شد). reload
# همان فایل‌های کهنه را می‌خواند؛ فقط کانتینر تازه فایل‌های مخزن را می‌بیند.
if [[ "$(live_files)" != "$(repo_files)" ]]; then
  warn "کانتینر Nginx فایل‌هایی جز مخزن می‌بیند — از نو ساخته می‌شود (چند ثانیه قطعی)"
  up --force-recreate
  settled
  ok "Nginx از نو ساخته شد، با پیکربندی مخزن"
  exit 0
fi

# همان فایل‌ها: خواندن دوباره، بی قطع. `nginx -s reload` خودش پیکربندی را کامل می‌سنجد و فقط اگر درست بود به master
# علامت می‌دهد؛ master آن را از نو می‌خواند و در لاگ می‌گوید: کارگرهای تازه، یا خطا و ماندن روی پیکربندی قبلی.
SINCE=$(date +%s.%N)
OUT=$($COMPOSE exec -T nginx nginx -s reload 2>&1) \
  || fail "Nginx پیکربندی را نپذیرفت — با پیکربندی قبلی کار می‌کند:" "$OUT"
for _ in $(seq 1 20); do
  LOG=$($COMPOSE logs --no-log-prefix --since "$SINCE" nginx 2>&1 || true)
  if grep -q '\[emerg\]' <<<"$LOG"; then
    fail "Nginx پیکربندی تازه را نخواند — با پیکربندی قبلی کار می‌کند:" "$(grep '\[emerg\]' <<<"$LOG")"
  fi
  if grep -q 'start worker process' <<<"$LOG"; then
    # master کارگرهای قدیم را ۱۰۰ میلی‌ثانیه پس از تازه‌ها می‌بندد و تا آن موقع آنها هم درخواست تازه می‌گیرند، با نشانی
    # کهنهٔ `web` (سنجیده: درخواستی درست پس از reload ۵۰۲ گرفت). یک ثانیه بعد، هر درخواست تازه با پیکربندی تازه است.
    sleep 1
    ok "Nginx پیکربندی تازه را خواند"
    exit 0
  fi
  sleep 0.5
done
fail "Nginx پس از reload نگفت که پیکربندی را دوباره خواند. لاگ: ${COMPOSE} logs nginx"
