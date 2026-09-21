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
curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors \
  -o "${WORK}/bundle.tar.gz" "${BASE}/jozveyar-bundle.tar.gz" \
  || die "دانلود بسته شکست خورد. آیا workflow «build-bundle» اجرا شده؟"

curl -fsSL --retry 3 -o "${WORK}/bundle.sha256" "${BASE}/jozveyar-bundle.sha256" \
  || die "دانلود اثر انگشت شکست خورد."

# بستهٔ نیمه‌دانلودشده باید همین‌جا گیر بیفتد، نه وقتی سایت بالا نیامد.
EXPECTED=$(tr -d '[:space:]' < "${WORK}/bundle.sha256")
ACTUAL=$(sha256sum "${WORK}/bundle.tar.gz" | cut -d' ' -f1)
[[ "$EXPECTED" == "$ACTUAL" ]] || die "اثر انگشت نمی‌خواند — دانلود ناقص است. دوباره اجرا کنید."

SIZE=$(du -h "${WORK}/bundle.tar.gz" | cut -f1)
ok "بسته دریافت و تأیید شد (${SIZE})"

# اگر همین بسته از قبل مستقر است، کار دیگری لازم نیست.
if [[ -f .bundle-sha256 ]] && [[ "$(cat .bundle-sha256)" == "$ACTUAL" ]]; then
  info "همین نسخه از قبل مستقر است."
  if $COMPOSE ps --services --filter status=running 2>/dev/null | grep -qx web; then
    ok "سرویس در حال اجراست — کاری لازم نیست."
    exit 0
  fi
  info "ولی سرویس بالا نیست — ادامه می‌دهیم."
fi

# ── ۲. ساخت ایمیج نازک ───────────────────────────────────────────────────
step "ساخت ایمیج"
# اینجا فقط باز کردن آرشیو و یک COPY است. هیچ بسته‌ای دانلود نمی‌شود.
rm -rf "${WORK}/ctx" && mkdir -p "${WORK}/ctx/bundle"
tar -xzf "${WORK}/bundle.tar.gz" -C "${WORK}/ctx/bundle"
[[ -f "${WORK}/ctx/bundle/apps/web/server.js" ]] \
  || die "ساختار بسته غیرمنتظره است — نقطهٔ ورود پیدا نشد."

cp apps/web/Dockerfile.bundle "${WORK}/ctx/Dockerfile"
docker build -t "jozveyar/web:${IMAGE_TAG}" "${WORK}/ctx"
ok "ایمیج jozveyar/web:${IMAGE_TAG} ساخته شد"

# ── ۳. بالا آوردن ────────────────────────────────────────────────────────
step "بالا آوردن سرویس‌ها"
HAS_CERT=0
[[ -f "infra/certs/live/${DOMAIN}/fullchain.pem" ]] && HAS_CERT=1

if (( HAS_CERT )); then
  TAG="$IMAGE_TAG" $COMPOSE up -d --remove-orphans
else
  info "گواهی TLS هنوز نیست — nginx فعلاً بالا نمی‌آید."
  TAG="$IMAGE_TAG" $COMPOSE up -d --remove-orphans postgres redis web
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

echo "$ACTUAL" > .bundle-sha256

# ── ۴. وضعیت ─────────────────────────────────────────────────────────────
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
