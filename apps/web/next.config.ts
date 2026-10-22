import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // خروجی مستقل: ایمیج داکر فقط node_modules لازم را می‌برد، نه کل workspace.
  output: 'standalone',
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // پکیج‌های workspace به‌صورت TypeScript خام مصرف می‌شوند.
  transpilePackages: [
    '@jozveyar/analysis',
    '@jozveyar/content',
    '@jozveyar/contracts',
    '@jozveyar/db',
    '@jozveyar/geo',
    '@jozveyar/payments',
    '@jozveyar/pricing',
    '@jozveyar/sms',
    '@jozveyar/storage',
    '@jozveyar/text',
    '@jozveyar/ui',
  ],
  // پکیج‌های سمت سرور (db، storage) به سبک ESM نود import می‌کنند —
  // `./schema.js` برای فایل `schema.ts`. tsc و vitest این را می‌فهمند؛ webpack
  // بدون این نگاشت نمی‌فهمد.
  webpack(config, { isServer, dev }) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    /*
     * تکهٔ مشترک فقط میان تکه‌های آغازین صفحه‌ها (برش ۱۵٫۲)، نه تکه‌های تنبل: گروه `default` وب‌پک (همان پیش‌فرضش، که نکست دست نمی‌زند)
     * ماژول‌های مشترک دو تکه را از ۲۰ کیلوبایت به بالا تکهٔ جدا می‌کرد، پس ماشین‌حساب «تعرفه» که همان موتور قیمت و کاشی‌های میز را دارد رابط
     * پس از فایل صفحهٔ اصلی را دو تکه می‌کرد، با درخواست دومی در راه اولین قیمت (`flow.spec`؛ همان که ۸٫۲ با `checkout/sum.tsx` دید). حالا
     * «تعرفه» نسخهٔ خودش را دارد و رابط پس از فایل یک تکه می‌ماند؛ تکه‌های آغازین همان‌اند که بودند.
     */
    const split = config.optimization?.splitChunks;
    if (!isServer && !dev && split && typeof split === 'object' && split.cacheGroups) {
      split.cacheGroups.default = {
        idHint: '',
        reuseExistingChunk: true,
        minChunks: 2,
        priority: -20,
        chunks: (chunk: { canBeInitial(): boolean; name?: string | null }) =>
          chunk.canBeInitial() && !/^(polyfills|main|pages\/_app)$/.test(chunk.name ?? ''),
      };
    }
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default config;
