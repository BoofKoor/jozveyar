# syntax=docker/dockerfile:1

# ایمیج اپ وب.
#
# سه مرحله تا ایمیج نهایی فقط شامل چیزی باشد که برای اجرا لازم است:
# بیلد حدود ۱ گیگابایت است، خروجی نهایی چند ده مگابایت.
#
# نکتهٔ ایران: بیلد روی سرور ایرانی کار می‌کند، ولی دو شرط دارد —
# آینهٔ رجیستری داکر (setup-docker-mirror.sh) و آینهٔ npm (setup-npm-mirror.sh).
# اگر هیچ آینه‌ای در دسترس نبود، infra/deploy.sh ایمیج را بیرون می‌سازد و با
# `docker save | ssh … docker load` می‌فرستد.

FROM node:22-alpine AS base

# رجیستری npm قابل تنظیم. رجیستری رسمی از سرور ایرانی در دسترس است؛ اگر
# نبود، setup-npm-mirror.sh آینه پیدا می‌کند و bootstrap.sh همان را می‌فرستد.
ARG NPM_REGISTRY=https://registry.npmjs.org
# تایم‌اوت‌ها عمداً کوتاه‌اند. نسخهٔ قبلی ۳۰۰ ثانیه تایم‌اوت با ۵ تلاش داشت،
# یعنی یک دانلود ناموفق تا ۲۵ دقیقه **ساکت** می‌ماند و بعد خطا می‌داد — و حلقهٔ
# بیرونی هم تکرارش می‌کرد. شکستِ زود، بهتر از انتظارِ کور است.
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    NPM_CONFIG_FETCH_RETRIES=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=3000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=20000 \
    NPM_CONFIG_FETCH_TIMEOUT=60000

# pnpm مستقیم از تارball نصب می‌شود.
#
# سه روش امتحان شد و دو تایش شکست خورد:
#   corepack          نقطهٔ متادیتای امضا را می‌زند — بعضی آینه‌ها ۵۰۰ می‌دهند
#   npm install -g    حل‌کنندهٔ وابستگی npm را صدا می‌زند و دقایق طول می‌کشد
#   wget + tar        ← همین. یک درخواست، همان چیزی که تست آینه می‌سنجد
#
# pnpm بسته‌ای خودبسنده است و هیچ وابستگی‌ای ندارد، پس حل‌کنندهٔ npm هیچ ارزشی
# اضافه نمی‌کند و فقط تأخیر و نقطهٔ شکست می‌آورد. تارball در تست آینه زیر
# ۲ ثانیه دانلود شد.
ARG PNPM_VERSION=10.33.0
RUN set -eux; \
    for attempt in 1 2 3; do \
      if wget -q -T 60 -O /tmp/pnpm.tgz \
           "${NPM_REGISTRY}/pnpm/-/pnpm-${PNPM_VERSION}.tgz"; then \
        mkdir -p /usr/local/lib/pnpm; \
        tar -xzf /tmp/pnpm.tgz -C /usr/local/lib/pnpm --strip-components=1; \
        rm /tmp/pnpm.tgz; \
        ln -sf /usr/local/lib/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm; \
        break; \
      fi; \
      echo "دانلود pnpm — تلاش ${attempt} شکست خورد، ۵ ثانیه صبر…"; \
      sleep 5; \
    done; \
    pnpm --version

WORKDIR /repo

# ── وابستگی‌ها ────────────────────────────────────────────────────────────
# فقط فایل‌های manifest کپی می‌شوند تا تا وقتی وابستگی عوض نشده،
# این لایه از کش بیاید.
FROM base AS deps
# ARG بین مرحله‌ها ارث نمی‌رسد، ولی ENV مرحلهٔ base ارث می‌رسد — پس رجیستری
# همان می‌ماند و لازم نیست دوباره اعلام شود.
# پلی‌رایت وابستگی ریشه است و در نصب می‌آید. بدون این متغیر، اسکریپت نصبش
# تلاش می‌کند حدود ۱۵۰ مگابایت کرومیوم دانلود کند — که روی سرور ایرانی شکست
# می‌خورد و بیلد را بی‌دلیل می‌کشد. مرورگر فقط برای تست لوکال لازم است.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/analysis/package.json packages/analysis/
COPY packages/contracts/package.json packages/contracts/
COPY packages/pricing/package.json packages/pricing/
COPY packages/text/package.json packages/text/
RUN pnpm install --frozen-lockfile

# ── بیلد ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/web/ apps/web/
# سقف هیپ: روی سرور ۲ گیگابایتی، بیلد نکست بدون سقف تا جایی بالا می‌رود که
# OOM killer کل فرایند را می‌کشد و خطا گمراه‌کننده است. ۱۵۳۶ مگابایت برای این
# اندازه پروژه کافی است و برای سرور بزرگ‌تر هم ضرری ندارد.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm --filter @jozveyar/web build

# ── اجرا ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# کاربر غیر-root: اپ هیچ دلیلی برای root بودن ندارد.
RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# خروجی standalone ساختار workspace را نگه می‌دارد:
#
#   /app/node_modules/              ← انبار واقعی pnpm
#   /app/packages/{text,pricing}/   ← پکیج‌های workspace که سرور لازم دارد
#   /app/apps/web/server.js         ← نقطهٔ ورود
#   /app/apps/web/node_modules/     ← فقط symlink به ../../node_modules
#
# پس کل درخت یکجا کپی می‌شود، وگرنه symlink‌ها می‌شکنند.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone/ ./

# این دو را standalone نمی‌آورد و باید کنار server.js بنشینند.
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
