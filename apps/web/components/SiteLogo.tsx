import { Logo } from '@jozveyar/ui';

import type { MediaFile } from '../lib/server/brand';

/** ارتفاع لوگوی سربرگ و پاورقی (طرح ز)؛ تا ۵۲۰ پیکسل CSS آن را ۵۶ می‌کند. */
const HEIGHT = 64;

/**
 * لوگوی سربرگ و پاورقی: لوگوی مالک (برش ۱۱٫۲) اگر روی سایت است، وگرنه لوگوی برند. فایل مالک را کارگر با ۱۲۸ پیکسل ارتفاع ساخته (دو برابر، برای
 * صفحهٔ پرتراکم) و پهنا از نسبت خودش است، تا چهار برابر ارتفاع؛ پس در پهنای کم CSS کوچکش می‌کند تا ناوبری جا شود (`site-logo--custom`).
 */
export function SiteLogo({ logo, loading }: { logo: MediaFile | null; loading?: 'lazy' }) {
  if (!logo) return <Logo height={HEIGHT} loading={loading} />;
  return (
    <img
      src={logo.src}
      alt="جزوه‌یار"
      width={Math.round((logo.width * HEIGHT) / logo.height)}
      height={HEIGHT}
      loading={loading}
      decoding="async"
    />
  );
}
