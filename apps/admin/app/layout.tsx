import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'پنل جزوه‌یار', template: '%s · پنل جزوه‌یار' },
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: '/icon.svg' },
  referrer: 'no-referrer',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/** همه‌چیز پویا: nonce هر درخواست و نشست؛ هیچ صفحه‌ای از پنل کش یا از پیش ساخته نمی‌شود. */
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
