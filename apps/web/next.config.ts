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
    '@jozveyar/pricing',
    '@jozveyar/text',
  ],
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default config;
