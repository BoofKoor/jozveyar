import type { MediaFile } from '../lib/server/brand';
import { SiteLogo } from './SiteLogo';

/**
 * سربرگ سایت، از طرح ز (docs/UI.md، قدم ۳ و ۴الف): لوگوی بی‌شعار و ناوبری. کامپوننت سرور، بی JS.
 *
 * در حالت سفارش ناوبری پنهان است و لوگو پیوند نیست، تا جزوهٔ نیمه‌کاره با یک کلیک پاک نشود. این
 * کامپوننت حالتی نمی‌داند: جزیرهٔ سفارش نشانهٔ `data-jozve` را می‌گذارد و CSS با `:has()` دو لوگو
 * را جابه‌جا می‌کند (globals.css). هر دو `<img>` یک فایل‌اند، پس یک درخواست.
 *
 * پیوندها به بخش‌های صفحهٔ اصلی می‌روند؛ در موبایل «چطور کار می‌کند» جا ندارد و فقط دو تای دیگر
 * می‌مانند. `/#faq` است نه `#faq`، چون همین سربرگ در ۴۰۴ هم هست؛ در خود صفحهٔ اصلی فقط تا همان
 * بخش اسکرول می‌کند و صفحه را دوباره بار نمی‌کند.
 *
 * از ۱۲٫۱ (سؤال ۳۰۵، طرح `account.html`) «سفارش‌های من» چهارمین پیوند است، در هر حالت مسیر خرید: سفارشی که ثبت شد با خاموش شدن خرید گم
 * نمی‌شود. در گوشی کنار «تعرفه» می‌نشیند و «سؤال‌ها» فقط در دسکتاپ می‌ماند؛ در صفحه‌های همان بخش جاری دیده می‌شود (`data-account`،
 * globals.css)، بی JS.
 *
 * لوگو از ۱۱٫۲ لوگوی مالک است اگر روی سایت گذاشته (`SiteLogo`)، با کلاس `site-logo--custom` که کوچک شدنش را در پهنای کم می‌گذارد.
 *
 * از ۱۵٫۲ (سؤال ۴۵۱، طرح `seo.html`) «تعرفه» صفحهٔ خودش است (`/tarefe`)، نه لنگر صفحهٔ اصلی، و پیوند صفحه یا بخش جاری `aria-current` دارد. سربرگ
 * در layout است و نمی‌داند کدام صفحه است، پس هر کدام دو پیوند دارد: عادی، و `site-nav__cur` با `aria-current` که CSS فقط با نشانهٔ همان صفحه
 * (`data-tarefe`، `data-account`) نشانش می‌دهد؛ `display: none` از درخت دسترسی هم بیرون است، پس صفحه‌خوان یکی را می‌خواند. بی JS.
 */
export function SiteHeader({ logo }: { logo: MediaFile | null }) {
  const custom = logo ? ' site-logo--custom' : '';
  return (
    <div className="site-top">
      <header className="site-wrap site-head">
        <a className={`site-logo site-idle${custom}`} href="/" aria-label="جزوه‌یار، صفحهٔ اصلی">
          <SiteLogo logo={logo} />
        </a>
        <span className={`site-logo site-ordering${custom}`}>
          <SiteLogo logo={logo} />
        </span>
        <nav className="site-nav site-idle" aria-label="پیوندهای صفحه">
          <a className="site-nav__how" href="/#how">
            چطور کار می‌کند
          </a>
          <a className="site-nav__tariff" href="/tarefe">
            تعرفه
          </a>
          <a className="site-nav__tariff site-nav__cur" href="/tarefe" aria-current="page">
            تعرفه
          </a>
          <a className="site-nav__faq" href="/#faq">
            سؤال‌ها
          </a>
          <a className="site-nav__orders" href="/orders">
            سفارش‌های من
          </a>
          <a className="site-nav__orders site-nav__cur" href="/orders" aria-current="true">
            سفارش‌های من
          </a>
        </nav>
      </header>
    </div>
  );
}
