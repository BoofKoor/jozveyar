import type { Metadata, Viewport } from 'next';
import { hasContact } from '@jozveyar/content';
import { BAND_COLOR } from '@jozveyar/ui/tokens';
import { SiteBar } from '../components/SiteBar';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { siteIcons, siteShareImage } from '../lib/brand';
import { PREVIEW_BAR_SCRIPT } from '../lib/previewBar';
import { siteBar } from '../lib/server/bar';
import { siteBrand } from '../lib/server/brand';
import { liveText, sitePublished } from '../lib/server/content';
import { SITE_OPEN_GRAPH } from '../lib/staticPages';
import './globals.css';

/**
 * ISR ۶۰ ثانیه برای هر صفحهٔ ایستا (۱۱٫۱): پاورقی متن «تماس و پاورقی» پنل را دارد، پس صفحه‌ای که خودش `revalidate` ندارد (۴۰۴) هم با آن
 * تازه می‌شود. صفحه‌های پویا (سفارش، درگاه نمونه، پیش‌نمایش) همان پویا می‌مانند.
 */
export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

const SITE_METADATA = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'جزوه‌یار — چاپ و صحافی آنلاین جزوه',
    template: '%s | جزوه‌یار',
  },
  description:
    'فایل جزوه‌ات را بینداز، قیمت را فوری ببین. چاپ و صحافی جزوه با ارسال به سراسر ایران، بدون ثبت‌نام و بدون پر کردن فرم.',
  applicationName: 'جزوه‌یار',
  keywords: ['چاپ جزوه', 'صحافی جزوه', 'چاپ آنلاین', 'طلق و سیم', 'چاپ پایان‌نامه'],
  // صفحه‌های ثابت openGraph خودشان را دارند (`pageMetadata`)؛ پایه‌اش یک منبع است.
  openGraph: {
    ...SITE_OPEN_GRAPH,
    title: 'جزوه‌یار — چاپ و صحافی آنلاین جزوه',
    description: 'فایل را بینداز، قیمت را فوری ببین. بدون ثبت‌نام.',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
} satisfies Metadata;

/**
 * نشانک، آیکون گوشی و تصویر اشتراک از لوگوی مالک اگر روی سایت است، وگرنه از فایل‌های برند (۱۱٫۲، `lib/brand.ts`)؛ صفحه‌ها تصویر اشتراک را از همین
 * می‌گیرند (`parent`)، و کارت توییتر هم.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await siteBrand();
  return { ...SITE_METADATA, icons: siteIcons(brand), openGraph: { ...SITE_METADATA.openGraph, images: [siteShareImage(brand)] } };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // نوار مرورگر گوشی هم‌رنگ نوار بالای صفحه (green-50)، تا با سربرگ یکی شود
  themeColor: BAND_COLOR,
};

/**
 * سربرگ و پاورقی در همهٔ صفحه‌ها، از جمله ۴۰۴؛ هر دو کامپوننت سرورند و JS ندارند. بدنه ظرف
 * `site-grow` دارد تا پاورقی در صفحهٔ کوتاه هم ته صفحه بنشیند. معرفی و جملهٔ پایین پاورقی، و پیوند «تماس»، از متن «تماس و پاورقی» (۱۱٫۱)؛
 * همان خواندنِ صفحه (`sitePublished`، یک بار در هر رسم).
 *
 * بالای سربرگ نوار اعلانی که مالک یا متصدی از پنل روشن کرده، یا وقتی همهٔ چاپخانه‌ها تعطیل‌اند پیام تعطیلی جای آن (۱۱٫۳، `SiteBar`)؛ هر دو
 * کامپوننت سرور و بی JS، با همین ISR. لوگوی سربرگ و پاورقی از ۱۱٫۲ لوگوی مالک است اگر روی سایت گذاشته (`siteBrand`).
 *
 * نوار پیش‌نمایش مالک (برش ۷٫۵، `lib/previewBar.ts`): اسکریپت کوچک درون HTML، ته بدنه، که فقط با کوکی نشانهٔ `jy_pv` می‌پرسد و نوار را
 * اول بدنه می‌گذارد؛ باندل اولیه همان می‌ماند.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [published, bar, brand] = await Promise.all([sitePublished(), siteBar(), siteBrand()]);
  const contact = liveText('contact', published).content;
  const logo = brand?.logo ?? null;
  return (
    // `data-restoring` را اسکریپت درون HTML صفحهٔ اصلی پیش از رسم می‌گذارد (۳د)؛ React نباید آن را ناجوری بداند.
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="site">
        {bar ? <SiteBar view={bar} /> : null}
        <SiteHeader logo={logo} />
        <div className="site-grow">{children}</div>
        <SiteFooter intro={contact.footerIntro} legal={contact.footerLegal} contact={hasContact(contact)} logo={logo} />
        <script dangerouslySetInnerHTML={{ __html: PREVIEW_BAR_SCRIPT }} />
      </body>
    </html>
  );
}
