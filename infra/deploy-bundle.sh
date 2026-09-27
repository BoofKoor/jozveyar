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
# ۱۹ بستهٔ زمان اجرا، نه ۹۹ بستهٔ بیلد. ایمیج پایهٔ کارگر اسناد (LibreOffice،
# ~۲۵۰ مگابایت) فقط وقتی می‌آید که عوض شده باشد (ADR-027).
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

# نشانی انتشارها؛ اگر روزی گیت‌هاب از سرور بسته شد، همین تکه‌ها را روی آینهٔ
# دیگری (مثلاً استوریج آروان) گذاشته و اینجا عوضش کنید.
RELEASES_URL="${RELEASES_URL:-https://github.com/${REPO}/releases/download}"
BASE="${RELEASES_URL}/${RELEASE_TAG}"

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

# ایمیج پایهٔ کارگر اسناد (ADR-027): LibreOffice، فونت‌ها و چرخ‌های پایتون.
#
# ~۲۵۰ مگابایت، پس فقط وقتی دانلود می‌شود که این سرور آن شناسه را ندارد — یعنی
# وقتی LibreOffice یا فونت یا چرخ‌ها عوض شده‌اند، نه با هر تغییر کد. تگ انتشارش
# تغییرناپذیر است (`docworker-base-<شناسه>`)، پس CDN کهنه اینجا معنا ندارد.
#
# تکه‌های ۴۰ مگابایتی، هر کدام با اثر انگشت خودش: این لینک روی فایل بزرگ
# می‌افتد (ADR-019). تکهٔ افتاده از همان بایت ادامه می‌گیرد (`curl -C -`) و
# تکه‌های رسیده در پوشهٔ ماندگار می‌مانند، پس اجرای دوبارهٔ همین اسکریپت بعد
# از قطعی، از همان تکه ادامه می‌دهد.
#   ensure_base <شناسه>
ensure_base() {
  local id="$1" image="jozveyar/docworker-base:$1"
  if docker image inspect "$image" >/dev/null 2>&1; then
    ok "ایمیج پایهٔ کارگر ${id} از قبل هست"
    return 0
  fi
  local url="${RELEASES_URL}/docworker-base-${id}"
  local dir="${APP_DIR}/.docworker-base/${id}"
  mkdir -p "$dir"
  info "ایمیج پایهٔ کارگر ${id} تازه است — دانلود تکه‌به‌تکه (یک بار، تا پایه دوباره عوض شود)"
  curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors -o "${dir}/manifest" \
      "${url}/jozveyar-docworker-base.sha256" \
    || die "فهرست تکه‌های ایمیج پایه ${id} نیامد. آیا workflow «build-bundle» روی main تمام شده؟"

  local total n=0 sum name file before after
  total=$(wc -l < "${dir}/manifest")
  while read -r sum name; do
    n=$((n + 1))
    [[ "$name" =~ ^jozveyar-docworker-base\.tar\.gz\.part-[0-9]+$ ]] || die "نام تکهٔ غیرمنتظره: ${name}"
    file="${dir}/${name}"
    for attempt in $(seq 1 10); do
      if [[ -f "$file" ]] && echo "${sum}  ${file}" | sha256sum -c --status; then
        break
      fi
      before=$(stat -c %s "$file" 2>/dev/null || echo 0)
      if curl -fsSL -C - --retry 3 --retry-delay 5 --retry-all-errors -o "$file" "${url}/${name}"; then
        # کامل رسید ولی نخواند: خراب است، از اول.
        echo "${sum}  ${file}" | sha256sum -c --status || { info "تکهٔ ${n} خراب رسید — از اول"; rm -f "$file"; }
      else
        after=$(stat -c %s "$file" 2>/dev/null || echo 0)
        # بی‌پیشرفت یعنی ادامه‌دادن گیر کرده (مثلاً فایل خراب و کامل): از اول.
        (( after > before )) || rm -f "$file"
        info "تکهٔ ${n}/${total} قطع شد (تلاش ${attempt}) — ادامه از همان‌جا"
        sleep $(( attempt * 3 ))
      fi
    done
    echo "${sum}  ${file}" | sha256sum -c --status || die "تکهٔ ${n}/${total} بعد از ده تلاش هم سالم نرسید. دوباره اجرا کنید؛ تکه‌های رسیده می‌مانند."
    info "تکهٔ ${n}/${total} ✓"
  done < "${dir}/manifest"

  info "بارگذاری ایمیج پایه در داکر…"
  cat "${dir}"/jozveyar-docworker-base.tar.gz.part-* | docker load >/dev/null \
    || die "docker load ایمیج پایه شکست خورد."
  docker image inspect "$image" >/dev/null 2>&1 || die "بعد از بارگذاری، ${image} پیدا نشد."
  rm -rf "$dir"
  ok "ایمیج پایهٔ کارگر ${id} بارگذاری شد ($(docker image inspect -f '{{.Size}}' "$image" | numfmt --to=iec))"
}

# بسته باید از **همین** commitی ساخته شده باشد که git pull آورد.
#
# اثر انگشت فقط می‌گوید بسته سالم رسیده، نه اینکه تازه است. در استقرار واقعی
# دو بار نسخهٔ کهنه آمد: یک بار CI هنوز تمام نشده بود، یک بار CDN گیت‌هاب تا
# یکی دو دقیقه بعد از انتشار، بستهٔ قبلی را — با اثر انگشت خودش، پس سالم —
# می‌داد. وب کهنه ماند، مهاجرت اجرا نشد و کارگر تازه بی‌جدول کرش کرد.
# CI حالا commit را داخل خود بسته می‌نویسد؛ تا نخواند، صبر.
#
# DEPLOY_ANY_BUNDLE=1 این چک را رد می‌کند (مثلاً وقتی کد سرور عمداً از main جداست).
HEAD_SHA=$(git rev-parse HEAD)
for round in $(seq 1 20); do
  ACTUAL=$(fetch_verified jozveyar-bundle)
  RELEASE_SHA=$(tar -xzf "${WORK}/jozveyar-bundle.tar.gz" -O ./COMMIT 2>/dev/null | tr -d '[:space:]' || true)
  if [[ "$RELEASE_SHA" == "$HEAD_SHA" || "${DEPLOY_ANY_BUNDLE:-0}" == "1" ]]; then
    break
  fi
  (( round == 20 )) && die "بعد از ده دقیقه، بستهٔ منتشرشده هنوز از ${RELEASE_SHA:0:7} است نه ${HEAD_SHA:0:7}. workflow «build-bundle» را در گیت‌هاب ببینید؛ اگر کد این سرور از main عقب است، اول git pull."
  SHORT=${RELEASE_SHA:0:7}
  info "بستهٔ منتشرشده از ${SHORT:-«نسخهٔ قدیمی»} است، نه ${HEAD_SHA:0:7} — CI یا CDN هنوز نرسیده؛ ۳۰ ثانیه صبر… (${round}/20)"
  sleep 30
done
ok "بستهٔ وب ${HEAD_SHA:0:7} دریافت و تأیید شد ($(du -h "${WORK}/jozveyar-bundle.tar.gz" | cut -f1))"

# پنل ادمین (برش ۴، ADR-037): بستهٔ جدای خودش (خروجی standalone پنل و دستور سرور)، از همان commit و با
# همان سنجش؛ CDN می‌تواند یکی را تازه و دیگری را کهنه بدهد.
for round in $(seq 1 20); do
  ADMIN_SHA=$(fetch_verified jozveyar-admin)
  ADMIN_COMMIT=$(tar -xzf "${WORK}/jozveyar-admin.tar.gz" -O ./COMMIT 2>/dev/null | tr -d '[:space:]' || true)
  if [[ "$ADMIN_COMMIT" == "$HEAD_SHA" || "${DEPLOY_ANY_BUNDLE:-0}" == "1" ]]; then
    break
  fi
  (( round == 20 )) && die "بعد از ده دقیقه، بستهٔ پنل هنوز از ${ADMIN_COMMIT:0:7} است نه ${HEAD_SHA:0:7}. workflow «build-bundle» را در گیت‌هاب ببینید."
  info "بستهٔ پنل از ${ADMIN_COMMIT:0:7} است، نه ${HEAD_SHA:0:7} — ۳۰ ثانیه صبر… (${round}/20)"
  sleep 30
done
ok "بستهٔ پنل ${HEAD_SHA:0:7} دریافت و تأیید شد ($(du -h "${WORK}/jozveyar-admin.tar.gz" | cut -f1))"

# کارگر اسناد جدا منتشر می‌شود و فقط وقتی عوض شده دوباره ساخته می‌شود. بسته‌اش
# فقط کد است (چند کیلوبایت)؛ LibreOffice و فونت‌ها در ایمیج پایه‌اند (ensure_base).
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
if (( DW_BUILD == 0 )) && [[ -f .bundle-sha256 ]] && [[ "$(cat .bundle-sha256)" == "$ACTUAL" ]] \
   && [[ -f .admin-sha256 ]] && [[ "$(cat .admin-sha256)" == "$ADMIN_SHA" ]]; then
  info "همین نسخه از قبل مستقر است."
  RUNNING=$($COMPOSE ps --services --filter status=running 2>/dev/null || true)
  if grep -qx web <<<"$RUNNING" && grep -qx docworker <<<"$RUNNING" && grep -qx admin <<<"$RUNNING"; then
    # Nginx هم، بی قطع: اجرای قبلی شاید پیکربندی مخزن را به آن نرسانده بود.
    if [[ -f "infra/certs/live/${DOMAIN}/fullchain.pem" ]]; then
      APP_DIR="$APP_DIR" ./infra/nginx-apply.sh || die "Nginx پیکربندی مخزن را ندارد (بالا)."
    fi
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

rm -rf "${WORK}/admin" && mkdir -p "${WORK}/admin/bundle"
tar -xzf "${WORK}/jozveyar-admin.tar.gz" -C "${WORK}/admin/bundle"
[[ -f "${WORK}/admin/bundle/apps/admin/server.js" && -f "${WORK}/admin/bundle/apps/admin/dist/cli.mjs" ]] \
  || die "ساختار بستهٔ پنل غیرمنتظره است — نقطهٔ ورود یا دستور سرور پیدا نشد."
cp apps/admin/Dockerfile.bundle "${WORK}/admin/Dockerfile"
docker build -t "jozveyar/admin:${IMAGE_TAG}" "${WORK}/admin"
ok "ایمیج jozveyar/admin:${IMAGE_TAG} ساخته شد"

BASE_ID=""
if (( DW_BUILD )); then
  rm -rf "${WORK}/dw" && mkdir -p "${WORK}/dw"
  tar -xzf "${WORK}/jozveyar-docworker.tar.gz" -C "${WORK}/dw"
  [[ -f "${WORK}/dw/Dockerfile" && -f "${WORK}/dw/BASE" ]] \
    || die "ساختار بستهٔ کارگر اسناد غیرمنتظره است."
  BASE_ID=$(tr -d '[:space:]' < "${WORK}/dw/BASE")
  [[ "$BASE_ID" =~ ^[0-9a-f]{16}$ ]] || die "شناسهٔ ایمیج پایه نامعتبر است: «${BASE_ID}»"
  ensure_base "$BASE_ID"
  # فقط COPY روی پایهٔ محلی: نه PyPI، نه آینهٔ Docker Hub.
  docker build --build-arg "BASE_IMAGE=jozveyar/docworker-base:${BASE_ID}" \
    -t "jozveyar/docworker:${IMAGE_TAG}" "${WORK}/dw"
  ok "ایمیج jozveyar/docworker:${IMAGE_TAG} ساخته شد (پایه ${BASE_ID})"
fi

# ── ۳. استوریج ───────────────────────────────────────────────────────────
# idempotent: بار اول رمزها را در .env می‌سازد و Garage را آماده می‌کند؛
# بارهای بعد فقط تأیید می‌کند. باید قبل از بالا آمدن اپ باشد تا اپ مقادیر
# S3 را از .env بخواند.
step "استوریج"
APP_DIR="$APP_DIR" DOMAIN="$DOMAIN" ./infra/setup-storage.sh

# ── ۴. پنل: سه مقدار .env ────────────────────────────────────────────────
# idempotent و بی چاپ مقدار. فقط وقتی نیستند ساخته می‌شوند؛ مقداری که هست هرگز عوض نمی‌شود — SECRETS_KEY
# تازه رمزهای برنامهٔ تأیید ادمین‌ها را بی‌اثر می‌کرد. مقدار خراب دست نمی‌خورد: پنل بسته می‌ماند و خط لاگش
# (پایین) می‌گوید کدام.
step "پنل: تنظیمات"
env_value() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
# put_env <نام> <مقدار> <توضیح>: فقط وقتی صدا زده می‌شود که مقدار نیست (یا جای‌نگهدار نمونه است). خط خالی
# موجود همان‌جا پر می‌شود؛ نبود، با توضیحش ته فایل می‌آید.
put_env() {
  if grep -qE "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '\n# %s\n%s=%s\n' "$3" "$1" "$2" >> .env
  fi
  ok "${1} ساخته شد (در .env)"
}
[[ -n "$(env_value SECRETS_KEY)" ]] \
  || put_env SECRETS_KEY "$(openssl rand -hex 32)" "مهروموم رمز برنامهٔ تأیید ادمین‌ها (برش ۴)؛ گم شود، ادمین‌ها با admin-invite.sh از نو ثبت می‌کنند. از .env نسخهٔ پشتیبان بگیرید."
ADMIN_PATH_NOW=$(env_value ADMIN_BASE_PATH)
if [[ -z "$ADMIN_PATH_NOW" || "$ADMIN_PATH_NOW" == "/change-this-secret-path" ]]; then
  put_env ADMIN_BASE_PATH "/$(openssl rand -hex 8)" "مسیر محرمانهٔ پنل (برش ۴)؛ پیوند ورود با ./infra/admin-invite.sh"
fi
[[ -n "$(env_value ADMIN_ORIGIN)" ]] || put_env ADMIN_ORIGIN "https://admin.${DOMAIN}" "نشانی پنل (برش ۴)"
chmod 600 .env
ok "تنظیمات پنل در .env هست"

# ── ۵. بالا آوردن ────────────────────────────────────────────────────────
step "بالا آوردن سرویس‌ها"
HAS_CERT=0
[[ -f "infra/certs/live/${DOMAIN}/fullchain.pem" ]] && HAS_CERT=1

# Nginx جدا (پایین): `up -d` همهٔ سرویس‌ها Nginx را هم، اگر تعریفش عوض شده بود، بی سنجش از نو می‌ساخت.
TAG="$IMAGE_TAG" $COMPOSE up -d --remove-orphans postgres redis garage web docworker admin

# پیکربندی Nginx مخزن اول سنجیده می‌شود و فقط درستش جای پیکربندی کارکن را می‌گیرد: بی قطع با reload، یا با ساختن
# دوبارهٔ کانتینر اگر فایل‌های کهنه می‌بیند یا تعریفش عوض شده (nginx-apply.sh). reload نام `web` را هم دوباره حل
# می‌کند، که همین حالا از نو ساخته شد. پیش از این رفع، «✓ خواند» اینجا چاپ می‌شد و Nginx همان فایل قدیم را داشت.
NGINX_OK=1
if (( HAS_CERT )); then
  APP_DIR="$APP_DIR" ./infra/nginx-apply.sh || NGINX_OK=0
else
  info "گواهی TLS هنوز نیست — nginx فعلاً بالا نمی‌آید."
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

# خط‌های بالا آمدن (تصمیم ۲۳): حالت مسیر خرید، مهاجرت و دادهٔ پایه از وب، و حال پنل. هیچ‌کدام مقدار .env یا
# مسیر محرمانه ندارد.
startup_lines() {
  $COMPOSE logs --no-log-prefix --since 10m "$1" 2>/dev/null | grep -E "^(✓|✗|⚠) ($2)" | sed 's/^/  /' || true
}
info "بالا آمدن وب:"
startup_lines web 'مسیر خرید|مهاجرت|دادهٔ پایه'

# صفحهٔ اصلی (برش ۴٫۴، ADR-040): صفحهٔ build تعرفهٔ پایه را دارد تا اولین بازسازی (ISR ۶۰ ثانیه). اولین درخواست همین‌جاست، نه
# با اولین بازدیدکننده، و بعد سنجیده می‌شود که صفحه همان نسخهٔ فعال پایگاه داده را دارد (JSON درون HTML، `#jy-tariff`).
ACTIVE_TARIFF=$($COMPOSE exec -T postgres psql -U jozveyar -d jozveyar -tAc 'select version from price_lists where is_active' 2>/dev/null \
  | tr -d '[:space:]' || true)
PAGE_TARIFF=""
for _ in $(seq 1 15); do
  PAGE_TARIFF=$($COMPOSE exec -T web node -e \
      "fetch('http://127.0.0.1:3000/').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>{})" 2>/dev/null \
    | grep -o '"jy-tariff" type="application/json">{"priceList":{"version":[0-9]*' | grep -o '[0-9]*$' || true)
  [[ -n "$ACTIVE_TARIFF" && "$PAGE_TARIFF" == "$ACTIVE_TARIFF" ]] && break
  sleep 1
done
if [[ -n "$ACTIVE_TARIFF" && "$PAGE_TARIFF" == "$ACTIVE_TARIFF" ]]; then
  ok "صفحهٔ اصلی با تعرفهٔ فعال پایگاه داده (نسخهٔ ${ACTIVE_TARIFF})"
else
  printf '\033[0;33m⚠ صفحهٔ اصلی تعرفهٔ نسخهٔ %s را دارد، نه نسخهٔ فعال %s؛ بازسازی (ISR) با درخواست بعدی دوباره امتحان می‌شود. لاگ: %s logs web\033[0m\n' \
    "${PAGE_TARIFF:-؟}" "${ACTIVE_TARIFF:-؟}" "$COMPOSE" >&2
fi

info "انتظار برای سلامت پنل…"
ADMIN_OK=0
for _ in $(seq 1 30); do
  if $COMPOSE exec -T admin node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
    ADMIN_OK=1
    break
  fi
  sleep 2
done
if (( ADMIN_OK )); then
  info "بالا آمدن پنل:"
  startup_lines admin 'پنل ادمین'
else
  # پنل جداست: سایت با پنل بیمار هم کار می‌کند، پس استقرار نمی‌افتد، ولی بلند گفته می‌شود.
  printf '\033[0;31m✗ پنل سالم نشد — سایت دست نخورده است. لاگ: %s logs admin\033[0m\n' "$COMPOSE" >&2
fi

echo "$ACTUAL" > .bundle-sha256
echo "$DW_SHA" > .docworker-sha256
echo "$ADMIN_SHA" > .admin-sha256

# هر استقرار ایمیج قبلی را بی‌تگ جا می‌گذارد (~۶۷ مگابایت) و کش ساخت هم
# لایه‌های COPY را نگه می‌دارد که دیگر به کار نمی‌آیند. استوریج روی همین
# دیسک است، پس جای خالی اینجا واقعاً مصرف دارد.
docker image prune -f >/dev/null && docker builder prune -f >/dev/null || true
# ایمیج پایهٔ قبلی کارگر (~۷۰۰ مگابایت) هم؛ بعد از prune، چون تا ایمیج کارگر
# قدیمی هست، داکر پایه‌اش را پاک نمی‌کند.
if [[ -n "$BASE_ID" ]]; then
  for tag in $(docker images jozveyar/docworker-base --format '{{.Tag}}'); do
    [[ "$tag" == "$BASE_ID" ]] || docker rmi "jozveyar/docworker-base:${tag}" >/dev/null 2>&1 || true
  done
fi
ok "ایمیج‌های کهنه پاک شدند"

# ── ۶. وضعیت ─────────────────────────────────────────────────────────────
step "وضعیت"
$COMPOSE ps
echo ""
if (( NGINX_OK )); then
  ok "تمام شد."
else
  printf '\033[0;31m✗ تمام شد، جز Nginx: پیکربندی مخزن را ندارد (پیام بالا). پس از رفع: ./infra/nginx-apply.sh\033[0m\n' >&2
fi
echo ""
if (( HAS_CERT )); then
  echo "سایت: https://${DOMAIN}"
  echo "پنل: https://admin.${DOMAIN} — پیوند ورود اولین ادمین (یا کد ورود تازه): ./infra/admin-invite.sh <نام کاربری>"
else
  echo "یک قدم مانده — گواهی و بالا آوردن Nginx:"
  echo "  ./infra/setup-tls.sh ایمیل-شما@example.com"
fi
echo "به‌روزرسانی بعدی: cd ${APP_DIR} && git pull && ./infra/deploy-bundle.sh"
# Nginx جا ماند: استقرار کامل نیست، پس خروج ۱ (پیامش بالاتر).
(( NGINX_OK )) || exit 1
