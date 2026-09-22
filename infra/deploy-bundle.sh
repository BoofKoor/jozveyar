#!/usr/bin/env bash
#
# استقرار از بستهٔ از پیش ساخته‌شده — بدون هیچ دانلودی از npm.
#
# چرا این مسیر وجود دارد: بیلد روی سرور ایرانی ۴۹۰ مگابایت بسته از npm لازم
# دارد و اتصال‌ها با ECONNRESET و ERR_SOCKET_TIMEOUT می‌افتند — مخصوصاً روی
# فایل‌های بزرگ مثل typescript و playwright-core. چهار بار تلاش شد و هر بار
# روی همان مرحله شکست خورد.
#
# ولی همین سرور به گیت‌هاب می‌رسد. پس بیلد در گیت‌هاب اکشنز انجام می‌شود و
# اینجا فقط یک فایل ۶۷ مگابایتی دانلود می‌شود — خروجی standalone نکست با
# ۱۹ بستهٔ زمان اجرا، نه ۹۹ بستهٔ بیلد.
#
# اجرا (روی سرور):
#   ./infra/deploy-bundle.sh

set -euo pipefail

REPO="${REPO:-BoofKoor/jozveyar}"
# دو «تگ» متفاوت که نباید قاطی شوند: تگ انتشار در گیت‌هاب، و تگ ایمیج داکر
# که کامپوز با ${TAG} می‌خواند.
RELEASE_TAG="${BUNDLE_TAG:-bundle-latest}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
APP_DIR="${APP_DIR:-/opt/jozveyar}"
DOMAIN="${DOMAIN:-jozveyar.com}"
COMPOSE="docker compose --env-file ${APP_DIR}/.env -f infra/docker-compose.prod.yml"

BASE="https://github.com/${REPO}/releases/download/${RELEASE_TAG}"

step() { printf '\n\033[1;32m══ %s\033[0m\n' "$1"; }
info() { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "با root اجرا کنید."
cd "$APP_DIR" || die "${APP_DIR} پیدا نشد. اول bootstrap.sh را اجرا کنید."
[[ -f .env ]] || die ".env پیدا نشد. اول bootstrap.sh را اجرا کنید."

# ── ۱. دانلود ────────────────────────────────────────────────────────────
step "دریافت بسته"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

info "از ${BASE}"

# دانلود یک دارایی و تأیید اثر انگشتش.
#
# اثر انگشت **اول** خوانده می‌شود و بسته بعد. اگر درست وسط انتشار CI برسیم،
# یکی تازه است و دیگری کهنه و نمی‌خوانند — این دقیقاً پیش آمده. بستهٔ ناجور
# هیچ‌وقت مستقر نمی‌شود؛ صبر می‌کنیم و دوباره می‌گیریم، تا حدود دو دقیقه.
#   fetch_verified <نام> ← اثر انگشت را چاپ می‌کند و بسته در $WORK/<نام>.tar.gz است
fetch_verified() {
  local name="$1" expected actual
  for attempt in 1 2 3 4 5 6; do
    curl -fsSL --retry 3 -o "${WORK}/${name}.sha256" "${BASE}/${name}.sha256" \
      || die "دانلود اثر انگشت ${name} شکست خورد. آیا workflow «build-bundle» اجرا شده؟"
    expected=$(tr -d '[:space:]' < "${WORK}/${name}.sha256")
    curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors \
      -o "${WORK}/${name}.tar.gz" "${BASE}/${name}.tar.gz" \
      || die "دانلود ${name} شکست خورد."
    actual=$(sha256sum "${WORK}/${name}.tar.gz" | cut -d' ' -f1)
    if [[ "$expected" == "$actual" ]]; then
      echo "$actual"
      return 0
    fi
    info "اثر انگشت ${name} نمی‌خواند (تلاش ${attempt}) — شاید CI وسط انتشار است؛ ۲۰ ثانیه صبر…" >&2
    sleep 20
  done
  die "اثر انگشت ${name} بعد از شش تلاش هم نخواند. وضعیت workflow را در گیت‌هاب ببینید."
}

ACTUAL=$(fetch_verified jozveyar-bundle)
ok "بستهٔ وب دریافت و تأیید شد ($(du -h "${WORK}/jozveyar-bundle.tar.gz" | cut -f1))"

# کارگر اسناد جدا منتشر می‌شود (چرخ‌های پایتون، ~۴۵ مگابایت) و فقط وقتی
# عوض شده دوباره دانلود می‌شود.
DW_SHA=$(curl -fsSL --retry 3 "${BASE}/jozveyar-docworker.sha256" | tr -d '[:space:]' || true)
DW_BUILD=1
if [[ -n "$DW_SHA" && -f .docworker-sha256 && "$(cat .docworker-sha256)" == "$DW_SHA" ]] \
   && docker image inspect "jozveyar/docworker:${IMAGE_TAG}" >/dev/null 2>&1; then
  DW_BUILD=0
  ok "کارگر اسناد تغییری نکرده"
else
  DW_SHA=$(fetch_verified jozveyar-docworker)
  ok "بستهٔ کارگر اسناد دریافت و تأیید شد ($(du -h "${WORK}/jozveyar-docworker.tar.gz" | cut -f1))"
fi

# اگر همین نسخه از قبل مستقر است، کار دیگری لازم نیست.
if (( DW_BUILD == 0 )) && [[ -f .bundle-sha256 ]] && [[ "$(cat .bundle-sha256)" == "$ACTUAL" ]]; then
  info "همین نسخه از قبل مستقر است."
  RUNNING=$($COMPOSE ps --services --filter status=running 2>/dev/null || true)
  if grep -qx web <<<"$RUNNING" && grep -qx docworker <<<"$RUNNING"; then
    ok "سرویس‌ها در حال اجرا هستند — کاری لازم نیست."
    exit 0
  fi
  info "ولی سرویس‌ها بالا نیستند — ادامه می‌دهیم."
fi

# ── ۲. ساخت ایمیج‌ها ─────────────────────────────────────────────────────
step "ساخت ایمیج"
# اینجا فقط باز کردن آرشیو و COPY است. هیچ بسته‌ای از npm یا PyPI دانلود نمی‌شود.
rm -rf "${WORK}/ctx" && mkdir -p "${WORK}/ctx/bundle"
tar -xzf "${WORK}/jozveyar-bundle.tar.gz" -C "${WORK}/ctx/bundle"
[[ -f "${WORK}/ctx/bundle/apps/web/server.js" ]] \
  || die "ساختار بسته غیرمنتظره است — نقطهٔ ورود پیدا نشد."

cp apps/web/Dockerfile.bundle "${WORK}/ctx/Dockerfile"
docker build -t "jozveyar/web:${IMAGE_TAG}" "${WORK}/ctx"
ok "ایمیج jozveyar/web:${IMAGE_TAG} ساخته شد"

if (( DW_BUILD )); then
  rm -rf "${WORK}/dw" && mkdir -p "${WORK}/dw"
  tar -xzf "${WORK}/jozveyar-docworker.tar.gz" -C "${WORK}/dw"
  [[ -f "${WORK}/dw/Dockerfile" && -d "${WORK}/dw/wheels" ]] \
    || die "ساختار بستهٔ کارگر اسناد غیرمنتظره است."
  docker build -t "jozveyar/docworker:${IMAGE_TAG}" "${WORK}/dw"
  ok "ایمیج jozveyar/docworker:${IMAGE_TAG} ساخته شد"
fi

# ── ۳. استوریج ───────────────────────────────────────────────────────────
# idempotent: بار اول رمزها را در .env می‌سازد و Garage را آماده می‌کند؛
# بارهای بعد فقط تأیید می‌کند. باید قبل از بالا آمدن اپ باشد تا اپ مقادیر
# S3 را از .env بخواند.
step "استوریج"
APP_DIR="$APP_DIR" DOMAIN="$DOMAIN" ./infra/setup-storage.sh

# ── ۴. بالا آوردن ────────────────────────────────────────────────────────
step "بالا آوردن سرویس‌ها"
HAS_CERT=0
[[ -f "infra/certs/live/${DOMAIN}/fullchain.pem" ]] && HAS_CERT=1

if (( HAS_CERT )); then
  TAG="$IMAGE_TAG" $COMPOSE up -d --remove-orphans
else
  info "گواهی TLS هنوز نیست — nginx فعلاً بالا نمی‌آید."
  TAG="$IMAGE_TAG" $COMPOSE up -d --remove-orphans postgres redis garage web docworker
fi

info "انتظار برای سلامت اپ…"
for i in $(seq 1 60); do
  if $COMPOSE exec -T web node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    ok "اپ سالم است"
    break
  fi
  (( i == 60 )) && die "اپ سالم نشد. لاگ: ${COMPOSE} logs web"
  sleep 2
done

# اپ موقع بالا آمدن مهاجرت‌های پایگاه داده را اجرا می‌کند (instrumentation.ts).
# شکستش اپ را نمی‌کشد — قیمت مرورگر بدون پایگاه داده هم کار می‌کند — پس
# اینجا باید صریح دیده شود، نه اینکه آپلود بی‌صدا خاموش بماند.
if $COMPOSE logs --since 10m web 2>/dev/null | grep -q '✓ مهاجرت'; then
  ok "مهاجرت‌های پایگاه داده اعمال شدند"
else
  printf '\033[0;31m✗ مهاجرت دیده نشد — آپلود کار نمی‌کند تا درست شود.\033[0m\n' >&2
  $COMPOSE logs --since 10m web 2>/dev/null | grep -E 'مهاجرت|Error' | tail -5 >&2 || true
fi

echo "$ACTUAL" > .bundle-sha256
echo "$DW_SHA" > .docworker-sha256

# هر استقرار ایمیج قبلی را بی‌تگ جا می‌گذارد (~۶۷ مگابایت) و کش ساخت هم
# لایه‌های COPY را نگه می‌دارد که دیگر به کار نمی‌آیند. استوریج روی همین
# دیسک است، پس جای خالی اینجا واقعاً مصرف دارد.
docker image prune -f >/dev/null && docker builder prune -f >/dev/null || true
ok "ایمیج‌های کهنه پاک شدند"

# ── ۵. وضعیت ─────────────────────────────────────────────────────────────
step "وضعیت"
$COMPOSE ps
echo ""
ok "تمام شد."
echo ""
if (( HAS_CERT )); then
  echo "سایت: https://${DOMAIN}"
else
  echo "یک قدم مانده — گواهی و بالا آوردن Nginx:"
  echo "  ./infra/setup-tls.sh ایمیل-شما@example.com"
fi
echo "به‌روزرسانی بعدی: cd ${APP_DIR} && git pull && ./infra/deploy-bundle.sh"
