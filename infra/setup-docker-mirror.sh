#!/usr/bin/env bash
#
# پیدا کردن و تنظیم آینهٔ رجیستری داکر.
#
# مسئله: از سرور ایرانی، `auth.docker.io` با TLS handshake timeout رد می‌شود،
# پس هیچ ایمیجی — حتی `node:22-alpine` — دانلود نمی‌شود. بسته‌های apt و رجیستری
# npm کار می‌کنند، ولی ایمیج‌های داکر از میزبان دیگری می‌آیند.
#
# این اسکریپت آینه‌های ایرانی را یکی‌یکی امتحان می‌کند، اولی که جواب داد را در
# `/etc/docker/daemon.json` می‌گذارد، و با یک pull واقعی تأییدش می‌کند.
#
# آینه‌ها می‌آیند و می‌روند، پس فهرست زیر تضمینی نیست — به همین دلیل اسکریپت
# آزمایش می‌کند و حدس نمی‌زند. اگر هیچ‌کدام جواب نداد، راه پشتیبان چاپ می‌شود.
#
# اجرا (روی سرور، با root):
#   ./infra/setup-docker-mirror.sh

set -uo pipefail

# آینه‌های شناخته‌شدهٔ Docker Hub در ایران.
MIRRORS=(
  "https://docker.arvancloud.ir"
  "https://registry.docker.ir"
  "https://docker.iranserver.com"
  "https://hub.hamdocker.ir"
  "https://registry.hamdocker.ir"
  "https://docker.mobinhost.com"
  "https://docker.host.ir"
  "https://mirror.gcr.io"
)

TEST_IMAGE="alpine:3.21"
DAEMON_JSON="/etc/docker/daemon.json"

info()  { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()    { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
warn()  { printf '\033[0;33m!\033[0m %s\n' "$1"; }
fail()  { printf '\033[0;31m✗\033[0m %s\n' "$1"; }

if [[ $EUID -ne 0 ]]; then
  fail "این اسکریپت باید با root اجرا شود."
  exit 1
fi

# ── ۱. شاید مستقیم کار کند ───────────────────────────────────────────────
info "امتحان اتصال مستقیم به Docker Hub…"
if timeout 45 docker pull "$TEST_IMAGE" >/dev/null 2>&1; then
  ok "Docker Hub مستقیم جواب می‌دهد. آینه لازم نیست."
  exit 0
fi
warn "اتصال مستقیم رد شد — سراغ آینه‌ها می‌رویم."
echo ""

# ── ۲. کدام آینه زنده است؟ ───────────────────────────────────────────────
# نقطهٔ /v2/ هر رجیستری سازگار با OCI باید ۲۰۰ یا ۴۰۱ بدهد. هر چیز دیگری
# (تایم‌اوت، ۵xx، صفحهٔ HTML) یعنی این آینه کار نمی‌کند.
WORKING=()
for mirror in "${MIRRORS[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 8 "${mirror}/v2/" 2>/dev/null || echo "000")
  if [[ "$code" == "200" || "$code" == "401" ]]; then
    ok "${mirror} پاسخ داد (HTTP ${code})"
    WORKING+=("$mirror")
  else
    fail "${mirror} — HTTP ${code}"
  fi
done
echo ""

if [[ ${#WORKING[@]} -eq 0 ]]; then
  fail "هیچ آینه‌ای جواب نداد."
  cat <<'EOF'

راه پشتیبان — انتقال دستی ایمیج‌ها:

روی ماشینی که به Docker Hub دسترسی دارد (ویندوز خودت با WSL، یا یک سرور خارج):

  docker pull node:22-alpine
  docker pull postgres:17-alpine
  docker pull redis:7-alpine
  docker pull nginx:1.27-alpine
  docker save node:22-alpine postgres:17-alpine redis:7-alpine nginx:1.27-alpine \
    | gzip -6 > base-images.tar.gz

  scp base-images.tar.gz root@SERVER:/tmp/
  ssh root@SERVER 'gunzip -c /tmp/base-images.tar.gz | docker load && rm /tmp/base-images.tar.gz'

حجمش حدود ۴۰۰ مگابایت است و فقط یک بار لازم می‌شود.
EOF
  exit 1
fi

# ── ۳. تنظیم و تأیید با pull واقعی ───────────────────────────────────────
# پاسخ دادن /v2/ کافی نیست: آینه باید واقعاً لایه‌ها را هم تحویل بدهد.
mkdir -p /etc/docker
[[ -f "$DAEMON_JSON" ]] && cp "$DAEMON_JSON" "${DAEMON_JSON}.bak.$(date +%s)"

for mirror in "${WORKING[@]}"; do
  info "تنظیم ${mirror} و آزمایش با pull واقعی…"
  cat > "$DAEMON_JSON" <<EOF
{
  "registry-mirrors": ["${mirror}"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
  systemctl restart docker
  # داکر چند لحظه برای آماده شدن سوکت لازم دارد.
  for _ in $(seq 1 20); do docker info >/dev/null 2>&1 && break; sleep 1; done

  docker rmi "$TEST_IMAGE" >/dev/null 2>&1 || true
  if timeout 90 docker pull "$TEST_IMAGE" >/dev/null 2>&1; then
    echo ""
    ok "آینهٔ فعال: ${mirror}"
    ok "پیکربندی در ${DAEMON_JSON} ذخیره شد."
    echo ""
    info "محدودیت لاگ هم تنظیم شد (۱۰ مگابایت × ۳ فایل به‌ازای هر کانتینر)"
    info "— بدون این، لاگ داکر روی سرور کوچک دیسک را پر می‌کند."
    exit 0
  fi
  fail "${mirror} به /v2/ جواب داد ولی لایه تحویل نداد."
done

fail "هیچ آینه‌ای pull واقعی را کامل نکرد."
rm -f "$DAEMON_JSON"
systemctl restart docker
echo "راه پشتیبان بالا (انتقال دستی ایمیج‌ها) را استفاده کن."
exit 1
