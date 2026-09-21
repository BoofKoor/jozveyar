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
# --env-file اجباری است — کامپوز `.env` را از پوشهٔ فایل کامپوز می‌خواند.
COMPOSE="docker compose --env-file ${APP_DIR}/.env -f ${APP_DIR}/infra/docker-compose.prod.yml"
STAGING="${STAGING:-0}"

info() { printf '\033[0;36m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
die()  { printf '\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

cd "$APP_DIR"
mkdir -p infra/certs infra/certbot-webroot

# ── ۱. DNS ───────────────────────────────────────────────────────────────
RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
[[ -n "$RESOLVED" ]] || die "دامنهٔ ${DOMAIN} حل نمی‌شود. DNS را بررسی کنید."

# IPهای واقعی این ماشین، نه آدرس خروجی.
#
# روی هاست ایرانی، ترافیک خروجی معمولاً از یک استخر NAT می‌گذرد و آدرسی که
# سرویس‌های «IP من چیست» برمی‌گردانند با IP ورودی سرور فرق دارد — و حتی بین
# دو درخواست پشت سر هم عوض می‌شود. پس آن آدرس معیار درستی نیست.
LOCAL_IPS=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1)
OUTBOUND_IP=$(curl -s -m 10 https://api.ipify.org || true)

MATCH=0
grep -qx "$RESOLVED" <<<"$LOCAL_IPS" 2>/dev/null && MATCH=1
[[ -n "$OUTBOUND_IP" && "$RESOLVED" == "$OUTBOUND_IP" ]] && MATCH=1

info "دامنه → ${RESOLVED}"
info "IPهای این ماشین → $(echo "$LOCAL_IPS" | tr '\n' ' ')· خروجی → ${OUTBOUND_IP:-«نامعلوم»}"

if (( MATCH )); then
  ok "DNS با این سرور جور است"
elif [[ "${SKIP_DNS_CHECK:-0}" == "1" ]]; then
  info "⚠ تطبیق نشد، ولی SKIP_DNS_CHECK=1 است — ادامه."
else
  # عمداً متوقف نمی‌شویم: پشت NAT نمی‌شود با اطمینان فهمید IP ورودی چیست.
  # certbot خودش قاطعانه جواب می‌دهد و یک تلاش ناموفق سهمیه را نمی‌سوزاند
  # (سقف: ۵ اعتبارسنجی ناموفق در ساعت برای هر دامنه).
  info "⚠ آدرس DNS با هیچ‌کدام از IPهای این ماشین جور نشد."
  info "  اگر سرور پشت NAT است این طبیعی است — ادامه می‌دهیم و certbot"
  info "  خودش قطعی جواب می‌دهد."
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

# نسخهٔ قبلی این بلوک یک خط بود و روی **هر سرور تازه** اسکریپت را می‌کشت:
#
#     (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
#
# روی سرور نو، root هنوز هیچ crontab ندارد و `crontab -l` با کد ۱ بیرون
# می‌آید. ساب‌شل `set -e` را ارث می‌برد، پس همان‌جا کشته می‌شود و هیچ‌وقت به
# `echo` نمی‌رسد؛ `pipefail` شکست را به بیرون می‌دهد و اسکریپت می‌میرد.
#
# بدترین شکل شکست بود، چون **بعد از** گرفتن گواهی و بالا آوردن Nginx اتفاق
# می‌افتاد: سایت کار می‌کرد، همه چیز سبز به نظر می‌رسید، و تنها چیزی که جا
# افتاده بود تمدید خودکار بود — که سه ماه بعد سایت را می‌انداخت، بدون هیچ
# ارتباط قابل‌دیدنی با روزی که مستقر شد.
#
# روی سروری که crontab خالی دارد بازتولید و تست شد.
if ! command -v crontab >/dev/null 2>&1; then
  info "بستهٔ cron نصب نیست — نصبش می‌کنم."
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq cron >/dev/null 2>&1 || true
  systemctl enable --now cron >/dev/null 2>&1 || true
fi

if ! command -v crontab >/dev/null 2>&1; then
  info "⚠ crontab در دسترس نیست — تمدید خودکار تنظیم نشد."
  info "  این خط را دستی به زمان‌بند اضافه کنید:"
  echo "  ${CRON_LINE}"
elif crontab -l 2>/dev/null | grep -q 'certbot/certbot renew'; then
  ok "تمدید خودکار از قبل در crontab هست"
else
  # `|| true` همان مسیری است که قبلاً اسکریپت را می‌کشت. sed خط خالیِ
  # crontabِ خالی را برمی‌دارد.
  CURRENT=$(crontab -l 2>/dev/null || true)
  printf '%s\n%s\n' "$CURRENT" "$CRON_LINE" | sed '/^[[:space:]]*$/d' | crontab - || true

  # ادعا نکن که اضافه شد — بخوانش. همین ادعای بررسی‌نشده بود که قرار بود
  # سه ماه بعد سایت را بیندازد.
  if crontab -l 2>/dev/null | grep -q 'certbot/certbot renew'; then
    ok "تمدید خودکار به crontab اضافه شد (دوشنبه‌ها ساعت ۳)"
  else
    info "⚠ افزودن به crontab نشد. این خط را دستی اضافه کنید:"
    echo "  ${CRON_LINE}"
  fi
fi

echo ""
ok "https://${DOMAIN} آماده است."
echo ""
echo "بررسی سایت:   curl -sI https://${DOMAIN} | head -1"
echo ""
echo "بررسی تمدید (چالش واقعی، بدون دست زدن به گواهی فعلی):"
echo "  docker run --rm -v ${APP_DIR}/infra/certs:/etc/letsencrypt \\"
echo "    -v ${APP_DIR}/infra/certbot-webroot:/var/www/certbot \\"
echo "    certbot/certbot renew --dry-run --no-random-sleep-on-renew \\"
echo "    --webroot --webroot-path /var/www/certbot"
echo ""
echo "  (--no-random-sleep-on-renew لازم است: certbot وقتی تشخیص دهد"
echo "   غیرتعاملی اجرا شده، تا ۸ دقیقه **بی‌صدا** می‌خوابد. در cron این"
echo "   رفتار درست است و بار را پخش می‌کند؛ موقع بررسی دستی شبیه هنگ است.)"
