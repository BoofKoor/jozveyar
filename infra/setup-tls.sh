#!/usr/bin/env bash
#
# صدور و تمدید گواهی TLS با certbot.
#
# Nginx خودش گواهی نمی‌گیرد (برخلاف Caddy)، پس این اسکریپت جایش را می‌گیرد.
# یک بار برای صدور اجرا می‌شود و بعد در cron برای تمدید.
#
# استفاده (روی سرور):
#   ./infra/setup-tls.sh you@example.com

set -euo pipefail

EMAIL="${1:?ایمیل برای هشدار انقضای گواهی لازم است}"
DOMAIN="${DOMAIN:-jozveyar.com}"
DIR="${REMOTE_DIR:-/opt/jozveyar}"

mkdir -p "${DIR}/certs" "${DIR}/certbot-webroot"

docker run --rm \
  -v "${DIR}/certs:/etc/letsencrypt" \
  -v "${DIR}/certbot-webroot:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot --webroot-path /var/www/certbot \
  --email "${EMAIL}" --agree-tos --no-eff-email \
  -d "${DOMAIN}" -d "www.${DOMAIN}"

docker compose -f "${DIR}/infra/docker-compose.prod.yml" exec nginx nginx -s reload

cat <<EOF

✅ گواهی صادر شد.

برای تمدید خودکار، این خط را به crontab سرور اضافه کنید:

  0 3 * * 1 cd ${DIR} && docker run --rm -v ${DIR}/certs:/etc/letsencrypt -v ${DIR}/certbot-webroot:/var/www/certbot certbot/certbot renew --quiet && docker compose -f infra/docker-compose.prod.yml exec -T nginx nginx -s reload

اگر از داخل ایران صدور گواهی گیر کرد، گواهی را از جای دیگری بگیرید و
دستی در ${DIR}/certs/live/${DOMAIN}/ بگذارید — Nginx تفاوتی نمی‌بیند.
EOF
