import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // خروجی مستقل: ایمیج داکر فقط node_modules لازم را می‌برد، نه کل workspace.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // پکیج‌های workspace به‌صورت TypeScript خام مصرف می‌شوند.
  transpilePackages: [
    '@jozveyar/analysis',
    '@jozveyar/contracts',
    '@jozveyar/db',
    '@jozveyar/pricing',
    '@jozveyar/storage',
    '@jozveyar/text',
  ],
  // پکیج‌های سمت سرور (db، storage) به سبک ESM نود import می‌کنند —
  // `./schema.js` برای فایل `schema.ts`. tsc و vitest این را می‌فهمند؛ webpack
  // بدون این نگاشت نمی‌فهمد.
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default config;
