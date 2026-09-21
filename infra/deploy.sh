#!/usr/bin/env bash
#
# استقرار جزوه‌یار روی VPS.
#
# ایمیج را همین‌جا (روی ماشین توسعه یا سرور خارج) می‌سازد، با SSH منتقل می‌کند
# و روی سرور بالا می‌آورد. دلیل این روش: بیلد از داخل ایران به رجیستری npm
# نمی‌رسد و روی نصب وابستگی‌ها گیر می‌کند. `docker save` کندتر است ولی
# هیچ‌وقت شکست نمی‌خورد.
#
# استفاده:
#   DEPLOY_HOST=user@1.2.3.4 ./infra/deploy.sh
#   DEPLOY_HOST=user@1.2.3.4 TAG=v2 ./infra/deploy.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${TAG:-latest}"
IMAGE="jozveyar/web:${TAG}"
REMOTE_DIR="${REMOTE_DIR:-/opt/jozveyar}"

if [[ -z "${DEPLOY_HOST:-}" ]]; then
  echo "DEPLOY_HOST لازم است. مثال: DEPLOY_HOST=root@1.2.3.4 $0" >&2
  exit 1
fi

step() { printf '\n\033[1;32m==>\033[0m %s\n' "$1"; }

step "بیلد ایمیج ${IMAGE}"
docker build -f "${REPO_ROOT}/apps/web/Dockerfile" -t "${IMAGE}" "${REPO_ROOT}"

step "انتقال ایمیج به ${DEPLOY_HOST}"
# gzip چون پهنای باند تا ایران گران‌تر از CPU است.
docker save "${IMAGE}" | gzip -6 | ssh "${DEPLOY_HOST}" 'gunzip | docker load'

step "همگام‌سازی فایل‌های پیکربندی"
ssh "${DEPLOY_HOST}" "mkdir -p ${REMOTE_DIR}/infra"
scp -r "${REPO_ROOT}/infra/docker-compose.prod.yml" "${REPO_ROOT}/infra/nginx" \
  "${DEPLOY_HOST}:${REMOTE_DIR}/infra/"

# .env عمداً منتقل نمی‌شود: رمزها فقط روی سرور می‌مانند و هیچ‌وقت از
# ماشین توسعه یا ریپو رد نمی‌شوند.
ssh "${DEPLOY_HOST}" "test -f ${REMOTE_DIR}/.env" || {
  echo ""
  echo "⚠  فایل ${REMOTE_DIR}/.env روی سرور نیست."
  echo "   از .env.example یک نسخه بسازید و رمزها را همان‌جا پر کنید."
  exit 1
}

step "بالا آوردن سرویس‌ها"
ssh "${DEPLOY_HOST}" "cd ${REMOTE_DIR} && TAG=${TAG} docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --remove-orphans"

step "بررسی سلامت"
ssh "${DEPLOY_HOST}" "cd ${REMOTE_DIR} && docker compose --env-file .env -f infra/docker-compose.prod.yml ps"

step "پاک کردن ایمیج‌های قدیمی روی سرور"
ssh "${DEPLOY_HOST}" "docker image prune -f --filter 'label!=keep'"

echo ""
echo "✅ استقرار تمام شد. لاگ: ssh ${DEPLOY_HOST} 'cd ${REMOTE_DIR} && docker compose --env-file .env -f infra/docker-compose.prod.yml logs -f web'"
