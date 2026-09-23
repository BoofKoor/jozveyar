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
# ایمیج پایهٔ قبلی کارگر (~۷۰۰ مگابایت) هم؛ بعد از prune، چون تا ایمیج کارگر
# قدیمی هست، داکر پایه‌اش را پاک نمی‌کند.
if [[ -n "$BASE_ID" ]]; then
  for tag in $(docker images jozveyar/docworker-base --format '{{.Tag}}'); do
    [[ "$tag" == "$BASE_ID" ]] || docker rmi "jozveyar/docworker-base:${tag}" >/dev/null 2>&1 || true
  done
fi
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
