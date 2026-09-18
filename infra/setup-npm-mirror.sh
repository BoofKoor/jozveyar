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

# بستهٔ آزمون: همان تارballی که corepack لازم دارد و بیلد روی آن شکست.
TEST_PATH="/pnpm/-/pnpm-10.33.0.tgz"
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

info "آزمایش دانلود واقعی از داخل کانتینر (همان محیط بیلد)…"
echo ""

BEST=""
BEST_MS=999999

for registry in "${REGISTRIES[@]}"; do
  start=$(date +%s%3N)
  # دو نکته که نتیجه را درست می‌کنند:
  #   • شبکهٔ پیش‌فرض bridge، نه host — بیلد داکر هم در همین شبکه اجرا می‌شود،
  #     و host networking مسیر و DNS متفاوتی دارد که با بیلد جور نیست.
  #   • همان ایمیج بیلد (node:22-alpine) با wget بیزی‌باکس، نه یک ایمیج curl
  #     جداگانه — هم از قبل لوکال است و هم دقیقاً محیط بیلد را می‌سنجد.
  if docker run --rm "$BUILD_IMAGE" \
       wget -q -O /dev/null -T "$TIMEOUT" "${registry}${TEST_PATH}" 2>/dev/null; then
    ms=$(( $(date +%s%3N) - start ))
    ok "$(printf '%-42s %5d ms' "$registry" "$ms")"
    if (( ms < BEST_MS )); then
      BEST="$registry"
      BEST_MS=$ms
    fi
  else
    fail "$(printf '%-42s شکست یا تایم‌اوت' "$registry")"
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
