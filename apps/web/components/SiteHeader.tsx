import { Logo } from '@jozveyar/ui';

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
 */
export function SiteHeader() {
  return (
    <div className="site-top">
      <header className="site-wrap site-head">
        <a className="site-logo site-idle" href="/" aria-label="جزوه‌یار، صفحهٔ اصلی">
          <Logo height={64} />
        </a>
        <span className="site-logo site-ordering">
          <Logo height={64} />
        </span>
        <nav className="site-nav site-idle" aria-label="پیوندهای صفحه">
          <a className="site-nav__how" href="/#how">
            چطور کار می‌کند
          </a>
          <a href="/#tariff">تعرفه</a>
          <a href="/#faq">سؤال‌ها</a>
        </nav>
      </header>
    </div>
  );
}
