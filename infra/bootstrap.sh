#!/usr/bin/env bash
#
# راه‌اندازی کامل جزوه‌یار روی سرور، از صفر.
#
# بیلد روی خود سرور انجام می‌شود، نه انتقال ایمیج: رجیستری npm از سرور ایرانی
# جواب می‌دهد، پس دلیلی برای آپلود ۶۰۰ مگابایت از ماشین توسعه نیست. (تنها چیزی
# که بسته است، رجیستری ایمیج داکر است — آن را setup-docker-mirror.sh حل می‌کند.)
#
# اسکریپت idempotent است: هر بار اجرا شود، آخرین کد را می‌گیرد، بیلد می‌کند و
# سرویس‌ها را به‌روز می‌کند. رمزها اگر از قبل باشند دست‌نخورده می‌مانند.
#
# اجرا (روی سرور، با root):
#   ./infra/bootstrap.sh
#
# یا از صفر، بدون اینکه ریپو روی سرور باشد:
#   curl -fsSL https://raw.githubusercontent.com/BoofKoor/jozveyar/main/infra/bootstrap.sh | bash

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/BoofKoor/jozveyar.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/jozveyar}"
DOMAIN="${DOMAIN:-jozveyar.com}"
TAG="${TAG:-latest}"
COMPOSE="docker compose -f infra/docker-compose.prod.yml"

step()  { printf '\n\033[1;32m══ %s\033[0m\n' "$1"; }
info()  { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()    { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
die()   { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "با root اجرا کنید."

# ── ۰. پیش‌نیازها ─────────────────────────────────────────────────────────
step "بررسی پیش‌نیازها"
command -v docker >/dev/null || die "داکر نصب نیست."
docker compose version >/dev/null 2>&1 || die "پلاگین docker compose نصب نیست."
command -v git >/dev/null || { info "نصب git…"; apt-get install -y -qq git; }

# ایمیج پایه باید در دسترس باشد، وگرنه بیلد همان اول می‌شکند و پیام
# داکر («TLS handshake timeout») علت اصلی را روشن نمی‌گوید.
info "آزمایش دسترسی به رجیستری ایمیج…"
if ! timeout 60 docker pull node:22-alpine >/dev/null 2>&1; then
  die "رجیستری ایمیج در دسترس نیست. اول اجرا کنید: ./infra/setup-docker-mirror.sh"
fi
ok "رجیستری ایمیج جواب می‌دهد"

TOTAL_MB=$(free -m | awk '/Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/Swap:/{print $2}')
info "رم: ${TOTAL_MB}MB · swap: ${SWAP_MB}MB"
if (( TOTAL_MB < 1800 )); then
  die "کمتر از ۱.۸ گیگابایت رم. بیلد نکست جا نمی‌شود — سرور را ارتقا دهید."
fi
if (( TOTAL_MB < 3500 && SWAP_MB < 2000 )); then
  info "⚠ رم کم و swap کم. اگر بیلد کشته شد، ابتدا swap اضافه کنید."
fi

# ── ۱. کد ────────────────────────────────────────────────────────────────
step "گرفتن کد"
if [[ -d "${APP_DIR}/.git" ]]; then
  cd "$APP_DIR"
  git fetch --depth 1 origin "$BRANCH"
  git reset --hard "origin/${BRANCH}"
  ok "به آخرین ${BRANCH} به‌روز شد"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
  ok "کلون شد در ${APP_DIR}"
fi

mkdir -p infra/data infra/certs infra/certbot-webroot

# ── ۲. تنظیمات ───────────────────────────────────────────────────────────
step "تنظیمات محیط"
if [[ -f .env ]]; then
  ok ".env از قبل هست — دست نمی‌خورد"
else
  # رمزها یک بار ساخته می‌شوند و در .env می‌مانند. هیچ‌وقت در ریپو یا لاگ.
  POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
  SESSION_SECRET=$(openssl rand -hex 32)
  ADMIN_BASE_PATH="/$(openssl rand -hex 8)"

  cat > .env <<EOF
NEXT_PUBLIC_SITE_URL=https://${DOMAIN}

POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://jozveyar:${POSTGRES_PASSWORD}@postgres:5432/jozveyar
REDIS_URL=redis://redis:6379

# ذخیره‌سازی فایل — از برش ۲ لازم می‌شود.
# مقادیر فضای ابری پارس‌پک را اینجا بگذارید؛ کد فقط S3 حرف می‌زند.
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=jozveyar
S3_ACCESS_KEY=
S3_SECRET_KEY=

# درگاه نمونه تا نماد الکترونیک فعال شود.
PAYMENT_PROVIDER=mock
PAYMENT_MERCHANT_ID=
PAYMENT_CALLBACK_URL=https://${DOMAIN}/pay/callback

# پیامک کنسولی: OTP در دیتابیس می‌نشیند و بدون پنل پیامکی قابل تست است.
SMS_PROVIDER=console
SMS_API_KEY=
SMS_OTP_TEMPLATE=

ADMIN_BASE_PATH=${ADMIN_BASE_PATH}
SESSION_SECRET=${SESSION_SECRET}

# سقف حافظهٔ کانتینرها — روی سرور بزرگ‌تر بالا ببرید.
WEB_MEM_LIMIT=640m
POSTGRES_MEM_LIMIT=512m
EOF
  chmod 600 .env
  ok ".env ساخته شد با رمزهای تصادفی"
  info "مسیر محرمانهٔ پنل ادمین: ${ADMIN_BASE_PATH}"
  info "این مسیر فقط در .env روی همین سرور است — جایی یادداشتش کنید."
fi

# ── ۳. بیلد ──────────────────────────────────────────────────────────────
step "بیلد ایمیج"
info "روی سرور کوچک چند دقیقه طول می‌کشد. اگر کشته شد، swap کم است."
docker build -f apps/web/Dockerfile -t "jozveyar/web:${TAG}" .
ok "ایمیج jozveyar/web:${TAG} ساخته شد"

# ── ۴. بالا آوردن ────────────────────────────────────────────────────────
step "بالا آوردن سرویس‌ها"
# nginx تا وقتی گواهی نباشد بالا نمی‌آید (فایل گواهی را در کانفیگ می‌خواهد)،
# پس اول فقط اپ و دیتابیس، بعد گواهی، بعد nginx.
HAS_CERT=0
[[ -f "infra/certs/live/${DOMAIN}/fullchain.pem" ]] && HAS_CERT=1

if (( HAS_CERT )); then
  TAG="$TAG" $COMPOSE up -d --remove-orphans
else
  info "گواهی TLS هنوز نیست — nginx فعلاً بالا نمی‌آید."
  TAG="$TAG" $COMPOSE up -d --remove-orphans postgres redis web
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

# ── ۵. گواهی TLS ─────────────────────────────────────────────────────────
if (( ! HAS_CERT )); then
  step "گواهی TLS"
  RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
  PUBLIC_IP=$(curl -s -m 10 https://api.ipify.org || true)
  info "دامنه → ${RESOLVED:-«حل نشد»} · IP سرور → ${PUBLIC_IP:-«نامعلوم»}"

  if [[ -z "$RESOLVED" ]]; then
    info "DNS هنوز منتشر نشده. بعد از انتشار اجرا کنید: ./infra/setup-tls.sh you@email.com"
  else
    if [[ -n "$PUBLIC_IP" && "$RESOLVED" != "$PUBLIC_IP" ]]; then
      info "⚠ دامنه به IP دیگری اشاره می‌کند. certbot شکست می‌خورد."
      info "  DNS را درست کنید، بعد: ./infra/setup-tls.sh you@email.com"
    else
      info "DNS درست است. برای گواهی اجرا کنید:"
      info "  ./infra/setup-tls.sh you@email.com"
      info "  (ایمیل برای هشدار انقضای گواهی است)"
    fi
  fi
fi

# ── ۶. وضعیت ─────────────────────────────────────────────────────────────
step "وضعیت"
$COMPOSE ps
echo ""
ok "تمام شد."
echo ""
echo "لاگ زنده:   cd ${APP_DIR} && ${COMPOSE} logs -f web"
echo "به‌روزرسانی: cd ${APP_DIR} && ./infra/bootstrap.sh"
if (( HAS_CERT )); then
  echo "سایت:       https://${DOMAIN}"
else
  echo "تست بدون دامنه: curl -H 'Host: ${DOMAIN}' http://127.0.0.1:3000/api/health"
fi
