# syntax=docker/dockerfile:1

# ایمیج اپ وب.
#
# سه مرحله تا ایمیج نهایی فقط شامل چیزی باشد که برای اجرا لازم است:
# بیلد حدود ۱ گیگابایت است، خروجی نهایی چند ده مگابایت.
#
# نکتهٔ ایران: این ایمیج روی سرور خارج یا در CI ساخته می‌شود و با
# `docker save | ssh … docker load` منتقل می‌شود. بیلد از داخل ایران به npm
# نمی‌رسد و روی همین مرحلهٔ deps گیر می‌کند. جزئیات در infra/deploy.sh

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# ── وابستگی‌ها ────────────────────────────────────────────────────────────
# فقط فایل‌های manifest کپی می‌شوند تا تا وقتی وابستگی عوض نشده،
# این لایه از کش بیاید.
FROM base AS deps
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
ENV NEXT_TELEMETRY_DISABLED=1
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
