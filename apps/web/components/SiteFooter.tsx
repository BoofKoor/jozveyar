import { jalaliYear } from '@jozveyar/text';
import { Logo } from '@jozveyar/ui';

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
 * پاورقی سایت، از طرح ز (docs/UI.md، قدم ۳). کامپوننت سرور، بی JS.
 *
 * پیوند صفحه‌های ثابت (دربارهٔ ما، تماس، قوانین، حریم خصوصی) در قدم ۵ با خود صفحه‌ها می‌آید.
 * سال شمسی موقع ساخت صفحه حساب می‌شود؛ صفحه‌ها ایستا ساخته می‌شوند، پس «©» تا استقرار بعدی
 * همان سال ساخت را دارد.
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
