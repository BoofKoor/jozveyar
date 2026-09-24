import { jalaliYear } from '@jozveyar/text';
import { Logo } from '@jozveyar/ui';

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
        <div className="site-foot__brand">
          <Logo height={64} loading="lazy" />
          <p>چاپ و صحافی آنلاین جزوه، با ارسال به سراسر ایران. فایل را بینداز، قیمت را همان لحظه ببین.</p>
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
