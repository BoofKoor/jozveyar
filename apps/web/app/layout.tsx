import type { Metadata, Viewport } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'جزوه‌یار — چاپ و صحافی آنلاین جزوه',
    template: '%s | جزوه‌یار',
  },
  description:
    'فایل جزوه‌ات را بینداز، قیمت را فوری ببین. چاپ و صحافی جزوه با ارسال به سراسر ایران، بدون ثبت‌نام و بدون پر کردن فرم.',
  applicationName: 'جزوه‌یار',
  keywords: ['چاپ جزوه', 'صحافی جزوه', 'چاپ آنلاین', 'طلق و سیم', 'چاپ پایان‌نامه'],
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'جزوه‌یار',
    title: 'جزوه‌یار — چاپ و صحافی آنلاین جزوه',
    description: 'فایل را بینداز، قیمت را فوری ببین. بدون ثبت‌نام.',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F4F4F1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
