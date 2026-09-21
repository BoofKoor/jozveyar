#!/usr/bin/env bash
#
# پیدا کردن آینهٔ سالم رجیستری npm — از داخل کانتینر.
#
# درس گران‌قیمت: `curl -sI https://registry.npmjs.org/` از هاست جواب ۲۰۰ داد،
# ولی دانلود واقعی یک تارball از داخل کانتینر داکر تایم‌اوت شد. یک HEAD روی
# ریشهٔ رجیستری هیچ چیزی دربارهٔ دانلود بسته نمی‌گوید.
#
# پس این اسکریپت دقیقاً همان کاری را می‌کند که بیلد می‌کند: از داخل
# node:22-alpine یک تارball واقعی می‌کشد و زمانش را می‌گیرد.
#
# نتیجه در /opt/jozveyar/.npm-registry ذخیره می‌شود و bootstrap.sh آن را
# به‌عنوان build-arg به داکر می‌دهد.
#
# اجرا (روی سرور):
#   ./infra/setup-npm-mirror.sh

set -uo pipefail

# آینه‌هایی که از ایران معمولاً جواب می‌دهند. رسمی اول امتحان می‌شود.
REGISTRIES=(
  "https://registry.npmjs.org"
  "https://registry.npmmirror.com"
  "https://mirror-npm.runflare.com"
  "https://registry.yarnpkg.com"
)

# نصب یک بسته دو درخواست دارد و آینه باید **هر دو** را جواب بدهد.
# آینه‌ای که تارball می‌دهد ولی متادیتا نه، بیلد را با HTTP 500 می‌کشد —
# دقیقاً همان چیزی که یک بار اتفاق افتاد چون فقط تارball سنجیده می‌شد.
META_PATH="/pnpm/10.33.0"
TARBALL_PATH="/pnpm/-/pnpm-10.33.0.tgz"
OUT_FILE="${OUT_FILE:-/opt/jozveyar/.npm-registry}"
BUILD_IMAGE="node:22-alpine"
TIMEOUT=45

info() { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
fail() { printf '\033[0;31m✗\033[0m %s\n' "$1"; }

command -v docker >/dev/null || { fail "داکر نصب نیست."; exit 1; }

# بدون این، اگر ایمیج پایه دانلود نشود همهٔ آینه‌ها «شکست» گزارش می‌شوند و
# اسکریپت اشتباهاً نتیجه می‌گیرد که هیچ آینه‌ای کار نمی‌کند.
if ! docker image inspect "$BUILD_IMAGE" >/dev/null 2>&1; then
  info "دانلود ${BUILD_IMAGE}…"
  docker pull "$BUILD_IMAGE" >/dev/null 2>&1 || {
    fail "ایمیج پایه دانلود نشد. اول اجرا کنید: ./infra/setup-docker-mirror.sh"
    exit 1
  }
fi

info "آزمایش متادیتا و تارball از داخل کانتینر (همان محیط بیلد)…"
echo ""

# شبکهٔ پیش‌فرض bridge، نه host — بیلد داکر هم در همین شبکه اجرا می‌شود.
# و همان ایمیج بیلد، چون از قبل لوکال است و محیط را دقیق می‌سنجد.
probe() {
  docker run --rm "$BUILD_IMAGE" sh -c \
    "wget -q -O /dev/null -T ${TIMEOUT} '${1}${META_PATH}' && \
     wget -q -O /dev/null -T ${TIMEOUT} '${1}${TARBALL_PATH}'" 2>/dev/null
}

BEST=""
BEST_MS=999999

for registry in "${REGISTRIES[@]}"; do
  start=$(date +%s%3N)
  if probe "$registry"; then
    ms=$(( $(date +%s%3N) - start ))
    ok "$(printf '%-42s %5d ms' "$registry" "$ms")"
    # رجیستری رسمی همیشه برنده است اگر کار کند: سرعت بیشتر یک آینه ارزشی
    # ندارد وقتی ممکن است نقطه‌ای را ناقص پیاده کرده باشد. آینه راه پشتیبان
    # است، نه بهینه‌سازی.
    if [[ "$registry" == "${REGISTRIES[0]}" ]]; then
      BEST="$registry"
      BEST_MS=$ms
      info "رجیستری رسمی جواب می‌دهد — آینه لازم نیست."
      break
    fi
    if (( ms < BEST_MS )); then
      BEST="$registry"
      BEST_MS=$ms
    fi
  else
    fail "$(printf '%-42s متادیتا یا تارball را نداد' "$registry")"
  fi
done

echo ""
if [[ -z "$BEST" ]]; then
  fail "هیچ آینه‌ای تارball را تحویل نداد."
  cat <<'EOF'

یعنی بیلد روی این سرور ممکن نیست. راه درست: ایمیج را بیرون بساز و بفرست.

روی ماشینی که دسترسی دارد (WSL روی ویندوز، یا یک سرور خارج):

  git clone https://github.com/BoofKoor/jozveyar.git && cd jozveyar
  DEPLOY_HOST=root@176.97.218.127 ./infra/deploy.sh

deploy.sh ایمیج را لوکال می‌سازد، با docker save روی SSH می‌فرستد، و
سرویس‌ها را بالا می‌آورد. حجم انتقال حدود ۲۵۰ مگابایت فشرده است.
EOF
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"
echo "$BEST" > "$OUT_FILE"
ok "سریع‌ترین آینه: ${BEST} (${BEST_MS} ms)"
ok "در ${OUT_FILE} ذخیره شد — bootstrap.sh خودش برمی‌دارد."
