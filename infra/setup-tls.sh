#!/usr/bin/env bash
#
# صدور و تمدید گواهی TLS با certbot.
#
# مسئلهٔ مرغ و تخم‌مرغ: کانفیگ Nginx فایل گواهی را می‌خواهد، پس بدون گواهی
# بالا نمی‌آید. ولی روش `--webroot` وب‌سروری می‌خواهد که چالش ACME را سرو کند.
# نتیجه: `Connection refused` روی پورت ۸۰.
#
# راه‌حل: certbot دو حالت دارد و این اسکریپت خودش انتخاب می‌کند —
#   • Nginx بالا نیست  → حالت `--standalone`، certbot خودش پورت ۸۰ را می‌گیرد
#   • Nginx بالا هست    → حالت `--webroot`، بدون قطع سرویس
#
# اجرا (روی سرور):
#   ./infra/setup-tls.sh you@example.com

set -euo pipefail

EMAIL="${1:?ایمیل برای هشدار انقضای گواهی لازم است. مثال: $0 you@example.com}"
DOMAIN="${DOMAIN:-jozveyar.com}"
APP_DIR="${APP_DIR:-/opt/jozveyar}"
COMPOSE="docker compose -f ${APP_DIR}/infra/docker-compose.prod.yml"
STAGING="${STAGING:-0}"

info() { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

cd "$APP_DIR"
mkdir -p infra/certs infra/certbot-webroot

# ── ۱. DNS باید درست باشد، وگرنه سهمیهٔ Let's Encrypt هدر می‌رود ──────────
RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
PUBLIC_IP=$(curl -s -m 10 https://api.ipify.org || true)
[[ -n "$RESOLVED" ]] || die "دامنهٔ ${DOMAIN} حل نمی‌شود. DNS را بررسی کنید."
info "دامنه → ${RESOLVED} · IP سرور → ${PUBLIC_IP:-«نامعلوم»}"
if [[ -n "$PUBLIC_IP" && "$RESOLVED" != "$PUBLIC_IP" ]]; then
  die "دامنه به IP دیگری اشاره می‌کند. اول DNS را درست کنید."
fi

# ── ۲. کدام حالت؟ ────────────────────────────────────────────────────────
NGINX_UP=0
$COMPOSE ps --services --filter status=running 2>/dev/null | grep -qx nginx && NGINX_UP=1

CERTBOT_ARGS=(
  certonly
  --email "$EMAIL" --agree-tos --no-eff-email
  --non-interactive
  -d "$DOMAIN" -d "www.${DOMAIN}"
)
[[ "$STAGING" == "1" ]] && CERTBOT_ARGS+=(--staging)

if (( NGINX_UP )); then
  info "Nginx بالاست — حالت webroot، بدون قطع سرویس."
  docker run --rm \
    -v "${APP_DIR}/infra/certs:/etc/letsencrypt" \
    -v "${APP_DIR}/infra/certbot-webroot:/var/www/certbot" \
    certbot/certbot "${CERTBOT_ARGS[@]}" \
    --webroot --webroot-path /var/www/certbot
else
  info "Nginx بالا نیست — حالت standalone، certbot خودش پورت ۸۰ را می‌گیرد."
  # چیز دیگری نباید روی پورت ۸۰ باشد، وگرنه certbot نمی‌تواند bind کند.
  if ss -ltn 2>/dev/null | grep -q ':80 '; then
    die "پورت ۸۰ اشغال است. سرویس رویش را ببندید و دوباره اجرا کنید."
  fi
  docker run --rm -p 80:80 \
    -v "${APP_DIR}/infra/certs:/etc/letsencrypt" \
    certbot/certbot "${CERTBOT_ARGS[@]}" --standalone
fi

[[ -f "infra/certs/live/${DOMAIN}/fullchain.pem" ]] \
  || die "گواهی ساخته نشد. لاگ: infra/certs/../var/log/letsencrypt/"
ok "گواهی صادر شد برای ${DOMAIN} و www.${DOMAIN}"

# ── ۳. بالا آوردن Nginx (یا بارگذاری مجدد) ───────────────────────────────
if (( NGINX_UP )); then
  $COMPOSE exec -T nginx nginx -s reload
  ok "Nginx گواهی جدید را بارگذاری کرد"
else
  info "بالا آوردن Nginx…"
  $COMPOSE up -d nginx
  for _ in $(seq 1 30); do
    $COMPOSE exec -T nginx wget -qO- http://127.0.0.1/nginx-health >/dev/null 2>&1 && break
    sleep 2
  done
  ok "Nginx بالا آمد"
fi

# ── ۴. تمدید خودکار ──────────────────────────────────────────────────────
# از این به بعد Nginx بالاست، پس تمدید با webroot و بدون قطع سرویس انجام
# می‌شود. هفته‌ای یک بار کافی است: certbot فقط گواهی نزدیک انقضا را تمدید می‌کند.
CRON_LINE="0 3 * * 1 cd ${APP_DIR} && docker run --rm -v ${APP_DIR}/infra/certs:/etc/letsencrypt -v ${APP_DIR}/infra/certbot-webroot:/var/www/certbot certbot/certbot renew --quiet --webroot --webroot-path /var/www/certbot && ${COMPOSE} exec -T nginx nginx -s reload"
if crontab -l 2>/dev/null | grep -q 'certbot/certbot renew'; then
  ok "تمدید خودکار از قبل در crontab هست"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  ok "تمدید خودکار به crontab اضافه شد (دوشنبه‌ها ساعت ۳)"
fi

echo ""
ok "https://${DOMAIN} آماده است."
echo ""
echo "بررسی: curl -sI https://${DOMAIN} | head -1"
