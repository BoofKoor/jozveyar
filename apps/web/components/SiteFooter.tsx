import { jalaliYear } from '@jozveyar/text';
import { Logo } from '@jozveyar/ui';

import { footerGroups } from '../lib/staticPages';

/** شناسه و کد نشان اینماد جزوه‌یار، از کدی که اینماد داده (۱۴۰۵/۰۷/۰۳). */
const ENAMAD_ID = '7896821';
const ENAMAD_CODE = 'pyzBITp0WBebVFYdP4CZIvGX69k9oy6R';

/**
 * نشان اینماد (نماد اعتماد الکترونیکی)، عین کدی که اینماد داده: پیوند و تصویر از خود
 * trustseal.enamad.ir، هر دو با `referrerpolicy="origin"` تا اینماد دامنه را ببیند، و بی `rel`؛ به گفتهٔ
 * اینماد `noopener noreferrer` نشان را نمایش‌ناپذیر می‌کند. تنها منبع بیرونی زمان اجرای سایت است
 * (ADR-032). تنها افزوده نام پیوند است، چون `alt` خالی است و صفحه‌خوان بی آن نامی نمی‌خواند.
 */
function EnamadSeal() {
  return (
    <div className="site-foot__seal">
      <a
        referrerPolicy="origin"
        target="_blank"
        href={`https://trustseal.enamad.ir/?id=${ENAMAD_ID}&Code=${ENAMAD_CODE}`}
        aria-label="نماد اعتماد الکترونیکی"
      >
        <img
          referrerPolicy="origin"
          src={`https://trustseal.enamad.ir/logo.aspx?id=${ENAMAD_ID}&Code=${ENAMAD_CODE}`}
          alt=""
          style={{ cursor: 'pointer' }}
          {...{ code: ENAMAD_CODE }}
        />
      </a>
    </div>
  );
}

/**
 * پیوند صفحه‌های ثابت در دو گروه طرح (برش ۷٫۴، قدم ۵؛ «تماس» فقط با اطلاعات تماس واقعی، `lib/staticPages.ts`).
 *
 * در حالت سفارش (جزوه‌ای در کار، در صفحهٔ اصلی یا صفحهٔ سفارش) پیوند در زبانهٔ تازه باز می‌شود تا جزوهٔ نیمه‌کاره و صفحهٔ
 * سفارش پاک نشوند؛ بی جزوه همان زبانه. `target` را CSS عوض نمی‌کند، پس هر پیوند دو بار هست و همان `site-idle` و
 * `site-ordering` سربرگ یکی را نشان می‌دهند (globals.css). `display: none` از درخت دسترسی هم بیرون است، پس صفحه‌خوان هر
 * پیوند را یک بار می‌خواند. بی JS.
 */
function FooterNav() {
  return (
    <nav className="site-foot__nav" aria-label="پیوندهای پاورقی">
      {footerGroups().map(({ heading, pages }) => (
        <div key={heading}>
          <h2>{heading}</h2>
          <ul>
            {pages.flatMap(({ path, label }) => [
              <li key={`${path}:idle`} className="site-idle">
                <a href={path}>{label}</a>
              </li>,
              <li key={`${path}:ordering`} className="site-ordering">
                <a href={path} target="_blank" rel="noopener">
                  {label}
                </a>
              </li>,
            ])}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * پاورقی سایت، از طرح ز (docs/UI.md، قدم ۳). کامپوننت سرور، بی JS.
 *
 * معرفی، پیوند صفحه‌های ثابت (قدم ۵، برش ۷٫۴) و نشان اینماد. سال شمسی موقع ساخت صفحه حساب می‌شود؛ صفحه‌ها ایستا ساخته
 * می‌شوند، پس «©» تا استقرار بعدی همان سال ساخت را دارد.
 */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-wrap">
        <div className="site-foot__top">
          <div className="site-foot__brand">
            <Logo height={64} loading="lazy" />
            <p>چاپ و صحافی آنلاین جزوه، با ارسال به سراسر ایران. فایل را بینداز، قیمت را همان لحظه ببین.</p>
          </div>
          <FooterNav />
          <EnamadSeal />
        </div>
        <div className="site-foot__legal">
          <p>مسئولیت محتوای فایل ارسالی بر عهدهٔ سفارش‌دهنده است.</p>
          <p>
            © <span className="num">{jalaliYear(new Date())}</span> جزوه‌یار
          </p>
        </div>
      </div>
    </footer>
  );
}
