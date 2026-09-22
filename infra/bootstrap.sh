#!/usr/bin/env bash
#
# راه‌اندازی کامل جزوه‌یار روی سرور، از صفر.
#
# بیلد روی خود سرور انجام می‌شود، نه انتقال ایمیج — به شرط دو آینه:
#   setup-docker-mirror.sh   رجیستری ایمیج داکر (auth.docker.io بسته است)
#   setup-npm-mirror.sh      رجیستری npm (در دسترس هست ولی کند و بی‌ثبات)
# اگر هیچ آینه‌ای جواب نداد، infra/deploy.sh ایمیج را بیرون می‌سازد و می‌فرستد.
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
# --env-file اجباری است: کامپوز `.env` را از پوشهٔ **فایل کامپوز**
# (یعنی infra/) می‌خواند، نه از ریشهٔ پروژه. بدون این، درون‌یابی
# ${POSTGRES_PASSWORD} خالی می‌ماند و کامپوز با خطا رد می‌شود.
COMPOSE="docker compose --env-file ${APP_DIR}/.env -f infra/docker-compose.prod.yml"

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

# ذخیره‌سازی فایل. خالی بماند: setup-storage.sh برای Garage روی همین سرور
# پرش می‌کند. برای آروان یا پارس‌پک، مقادیر آنها را اینجا بگذارید؛ کد فقط
# S3 حرف می‌زند (ADR-023).
S3_ENDPOINT=
S3_PUBLIC_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=jozveyar
S3_ACCESS_KEY=
S3_SECRET_KEY=
GARAGE_RPC_SECRET=

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
# آینهٔ npm که setup-npm-mirror.sh پیدا کرده. اگر نبود، رسمی.
NPM_REGISTRY="https://registry.npmjs.org"
if [[ -f "${APP_DIR}/.npm-registry" ]]; then
  NPM_REGISTRY=$(cat "${APP_DIR}/.npm-registry")
  info "آینهٔ npm: ${NPM_REGISTRY}"
else
  info "آینهٔ npm تنظیم نشده — رجیستری رسمی."
  info "اگر بیلد روی دانلود بسته گیر کرد: ./infra/setup-npm-mirror.sh"
fi
info "چند دقیقه طول می‌کشد. انبار بسته‌ها روی کش BuildKit می‌ماند، پس"
info "اگر شبکه وسط کار قطع شد فقط دوباره همین اسکریپت را بزنید —"
info "بسته‌های دانلودشده دوباره دانلود نمی‌شوند."
docker build \
  --build-arg "NPM_REGISTRY=${NPM_REGISTRY}" \
  -f apps/web/Dockerfile -t "jozveyar/web:${TAG}" .
ok "ایمیج jozveyar/web:${TAG} ساخته شد"

# ── ۴. استوریج ───────────────────────────────────────────────────────────
step "استوریج"
APP_DIR="$APP_DIR" DOMAIN="$DOMAIN" ./infra/setup-storage.sh

# ── ۵. بالا آوردن ────────────────────────────────────────────────────────
step "بالا آوردن سرویس‌ها"
# nginx تا وقتی گواهی نباشد بالا نمی‌آید (فایل گواهی را در کانفیگ می‌خواهد)،
# پس اول فقط اپ و دیتابیس، بعد گواهی، بعد nginx.
HAS_CERT=0
[[ -f "infra/certs/live/${DOMAIN}/fullchain.pem" ]] && HAS_CERT=1

# کارگر اسناد اینجا ساخته نمی‌شود: ایمیجش چرخ‌های پایتون از CI لازم دارد و
# فقط deploy-bundle.sh می‌سازدش. بعد از bootstrap، یک بار deploy-bundle.sh.
if (( HAS_CERT )); then
  TAG="$TAG" $COMPOSE up -d --remove-orphans nginx postgres redis garage web
else
  info "گواهی TLS هنوز نیست — nginx فعلاً بالا نمی‌آید."
  TAG="$TAG" $COMPOSE up -d --remove-orphans postgres redis garage web
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

# ── ۶. گواهی TLS ─────────────────────────────────────────────────────────
if (( ! HAS_CERT )); then
  step "گواهی TLS"
  RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
  info "دامنه → ${RESOLVED:-«حل نشد»}"

  if [[ -z "$RESOLVED" ]]; then
    info "DNS هنوز منتشر نشده. بعد از انتشار اجرا کنید: ./infra/setup-tls.sh you@email.com"
  else
    # مقایسه با آدرس خروجی اینجا انجام نمی‌شود — پشت NAT گمراه‌کننده است.
    # setup-tls.sh بررسی دقیق‌تر را دارد و certbot حرف آخر را می‌زند.
    info "یک قدم مانده — گواهی و بالا آوردن Nginx:"
    info "  ./infra/setup-tls.sh ایمیل-شما@example.com"
    info "  (certbot خودش پورت ۸۰ را می‌گیرد؛ Nginx بعدش بالا می‌آید)"
  fi
fi

# ── ۷. وضعیت ─────────────────────────────────────────────────────────────
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
