#!/usr/bin/env bash
#
# راه‌اندازی استوریج روی سرور — idempotent (ADR-023).
#
# سه کار، هر بار که اجرا شود:
#   ۱. مقادیر **خالی یا نبود** استوریج را در .env پر می‌کند؛ مقدار موجود دست
#      نمی‌خورد. رمزها تصادفی‌اند و هیچ‌جا چاپ نمی‌شوند.
#   ۲. کانتینر Garage را بالا می‌آورد.
#   ۳. چیدمان، باکت و کلید اپ را می‌سازد (infra/garage-init.sh).
#
# deploy-bundle.sh و bootstrap.sh خودشان این را صدا می‌زنند؛ اجرای دستی لازم
# نیست. اگر S3_ENDPOINT به سرویس دیگری (آروان، پارس‌پک) اشاره کند، Garage
# کنار گذاشته می‌شود و این اسکریپت کاری نمی‌کند.
#
#   ./infra/setup-storage.sh

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/jozveyar}"
DOMAIN="${DOMAIN:-jozveyar.com}"
ENV_FILE="${APP_DIR}/.env"
COMPOSE="docker compose --env-file ${ENV_FILE} -f ${APP_DIR}/infra/docker-compose.prod.yml"
GARAGE_ENDPOINT="http://garage:3900"

info() { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "${ENV_FILE} پیدا نشد. اول bootstrap.sh را اجرا کنید."

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

# فقط اگر خالی یا نبود. مقدار از stdin می‌آید تا در فهرست فرایندها دیده نشود.
fill() {
  local key="$1" value
  value=$(cat)
  if [[ -n "$(env_get "$key")" ]]; then return; fi
  if grep -qE "^${key}=" "$ENV_FILE"; then
    local tmp
    tmp=$(mktemp)
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' \
      "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE" && rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
  info "${key} در .env گذاشته شد"
}

# ── ۱. .env ──────────────────────────────────────────────────────────────
ENDPOINT=$(env_get S3_ENDPOINT)
if [[ -n "$ENDPOINT" && "$ENDPOINT" != "$GARAGE_ENDPOINT" ]]; then
  ok "استوریج بیرونی (${ENDPOINT}) — Garage لازم نیست."
  exit 0
fi

echo "$GARAGE_ENDPOINT"              | fill S3_ENDPOINT
echo "https://${DOMAIN}"             | fill S3_PUBLIC_ENDPOINT
echo "us-east-1"                     | fill S3_REGION
echo "jozveyar"                      | fill S3_BUCKET
echo "GK$(openssl rand -hex 12)"     | fill S3_ACCESS_KEY
openssl rand -hex 32                 | fill S3_SECRET_KEY
openssl rand -hex 32                 | fill GARAGE_RPC_SECRET
chmod 600 "$ENV_FILE"

BUCKET=$(env_get S3_BUCKET)
# مسیر هم‌مبدأ در Nginx به نام باکت بسته است.
[[ "$BUCKET" == "jozveyar" ]] \
  || die "S3_BUCKET=${BUCKET} ولی infra/nginx/snippets/storage.conf مسیر /jozveyar/ را می‌شناسد. یکی‌شان کنید."

# ── ۲. کانتینر ───────────────────────────────────────────────────────────
mkdir -p "${APP_DIR}/infra/data/garage/meta" "${APP_DIR}/infra/data/garage/data"
$COMPOSE up -d garage >/dev/null
ok "Garage بالا است"

# ── ۳. چیدمان، باکت، کلید ────────────────────────────────────────────────
GARAGE_CMD="$COMPOSE exec -T garage /garage" \
S3_BUCKET="$BUCKET" \
S3_ACCESS_KEY="$(env_get S3_ACCESS_KEY)" \
S3_SECRET_KEY="$(env_get S3_SECRET_KEY)" \
  "${APP_DIR}/infra/garage-init.sh"
