# syntax=docker/dockerfile:1

# کارگر اسناد (ADR-005، ADR-025، ADR-027): فقط کد، روی ایمیج پایه.
#
# هر چیز سنگین (LibreOffice، فونت‌ها، چرخ‌های پایتون) در `Dockerfile.base` است و
# سرور آن را یک بار، آماده، با `docker load` می‌گیرد. این ایمیج فقط COPY است:
# هیچ دانلودی، نه از PyPI نه از آینهٔ Docker Hub. پس هر تغییر کد کارگر چند
# کیلوبایت است. `deploy-bundle.sh` شناسهٔ پایه را از فایل `BASE` بسته می‌خواند.

ARG BASE_IMAGE=jozveyar/docworker-base:local
FROM ${BASE_IMAGE}

WORKDIR /app
COPY docworker/ ./docworker/

USER docworker
CMD ["python", "-m", "docworker"]
