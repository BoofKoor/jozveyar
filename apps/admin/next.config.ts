import type { NextConfig } from 'next';

import { SECURITY_HEADERS } from './lib/security';

/**
 * پنل ادمین (ADR-037): اپ و کانتینر جدا روی زیردامنهٔ خودش، با همان پایگاه داده و همان کیت رابط. مسیر
 * محرمانه `basePath` نیست (آن در build نوشته می‌شود)؛ `middleware.ts` در زمان اجرا از `.env` می‌خواندش.
 */
const config: NextConfig = {
  reactStrictMode: true,
  // خروجی مستقل، مثل سایت (ADR-019): بسته در CI ساخته می‌شود و سرور فقط بازش می‌کند.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // پنل next/image ندارد و config در build خوانده شده؛ sharp (۱۸ مگابایت libvips) و typescript فقط بسته را
  // سنگین می‌کردند که سرور ایران از گیت‌هاب می‌کشد (ADR-019). تست سرتاسری روی همین بسته اجرا می‌شود.
  outputFileTracingExcludes: {
    '*': ['**/node_modules/sharp/**', '**/node_modules/@img/**', '**/node_modules/typescript/**'],
  },
  // پکیج‌های workspace به‌صورت TypeScript خام مصرف می‌شوند؛ geo و contracts از راه db، استوریج برای دانلود PDF جزوه
  // (۴٫۲)، و موتور قیمت برای پیش‌نمایش پیش‌نویس تعرفه (۴٫۵).
  transpilePackages: [
    '@jozveyar/contracts',
    '@jozveyar/db',
    '@jozveyar/geo',
    '@jozveyar/pricing',
    '@jozveyar/storage',
    '@jozveyar/text',
    '@jozveyar/ui',
  ],
  // `./schema.js` برای فایل `schema.ts`، مثل سایت.
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  // فایل پست تا ۲ مگابایت با فرم server action می‌آید (برش ۶٫۱، ADR-045)؛ پیش‌فرض نکست ۱ مگابایت است. کمی بیش از سقف فایل، برای
  // بدنهٔ چندبخشی؛ سقف خود فایل را سرویس می‌سنجد، و Nginx همین ۳ مگابایت را.
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  poweredByHeader: false,
  // سرآیندهای امنیتی روی استاتیک هم (middleware از `/_next/static/` نمی‌گذرد).
  async headers() {
    return [{ source: '/:path*', headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })) }];
  },
};

export default config;
