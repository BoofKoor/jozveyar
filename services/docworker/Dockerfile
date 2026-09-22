# syntax=docker/dockerfile:1

# کارگر اسناد (ADR-005، ADR-025).
#
# مثل ایمیج وب، روی سرور هیچ دانلودی از PyPI نمی‌شود: CI چرخ‌های آماده را
# کنار این فایل می‌گذارد (wheels/) و اینجا فقط `pip install --no-index` است.
# تنها چیزی که از شبکه می‌آید ایمیج پایه است، از همان آینهٔ Docker Hub.
#
# debian نه alpine: چرخ‌های PyMuPDF و numpy برای glibc ساخته شده‌اند.

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY wheels/ /tmp/wheels/
COPY requirements.txt ./
RUN pip install --no-cache-dir --no-index --find-links /tmp/wheels -r requirements.txt \
    && rm -rf /tmp/wheels

COPY docworker/ ./docworker/

# کاربر غیر-root: کارگر فایل کاربر را باز می‌کند و نباید root باشد.
RUN useradd -u 1002 -m docworker
USER docworker

CMD ["python", "-m", "docworker"]
