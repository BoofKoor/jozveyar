import type { SiteBannerView } from '../lib/server/brand';

/** پهنایی که تا آن تصویر گوشی بنر جای دسکتاپ را می‌گیرد؛ همان مرز گوشی کل سایت (globals.css). */
const PHONE_MAX = 520;

/**
 * بنر صفحهٔ اصلی (برش ۱۱٫۲، سؤال ۲۰۶، «تصویر»): تصویری که مالک یا متصدی از پنل روشن کرده، بالای «چطور کار می‌کند»، با متن جایگزین و پیوند
 * اختیاری به صفحه‌ای از همین سایت. کامپوننت سرور و بی JS؛ تصویر گوشی اگر هست با `<picture>`، و ابعاد هر دو در HTML تا صفحه هنگام بار شدن جابه‌جا
 * نشود. پس از انداختن فایل، مثل بخش‌های دیگر صفحه، کنار می‌رود (home.css).
 */
export function HomeBanner({ banner }: { banner: SiteBannerView }) {
  const { desktop, mobile } = banner;
  const picture = (
    <picture>
      {mobile ? <source media={`(max-width: ${PHONE_MAX}px)`} srcSet={mobile.src} width={mobile.width} height={mobile.height} /> : null}
      <img src={desktop.src} alt={banner.alt} width={desktop.width} height={desktop.height} decoding="async" />
    </picture>
  );
  return (
    <section className="home-banner" aria-label="بنر">
      {banner.href ? (
        <a className="home-banner__link" href={banner.href}>
          {picture}
        </a>
      ) : (
        picture
      )}
    </section>
  );
}
