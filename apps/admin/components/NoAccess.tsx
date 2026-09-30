import Link from 'next/link';

import { panelPath } from '../lib/gate';

/**
 * بخشی که مجوزش را ندارد (طرح پنل): متصدی «این بخش فقط برای مالک است» با برگشت به پیشخوان، و کاربر چاپخانه (برش ۵٫۳) «این بخش
 * برای چاپخانه باز نیست» با راه «سفارش‌ها»، که سفارش‌های خودش آنجاست.
 */
export function NoAccess({ gate, partner }: { gate: string; partner?: { name: string } | null }) {
  if (partner) {
    return (
      <section className="jy-card ad-noaccess" aria-labelledby="t-noaccess" data-noaccess="partner">
        <h1 id="t-noaccess" className="jy-card__title">
          این بخش برای چاپخانه باز نیست
        </h1>
        <p className="ad-lead">
          سفارش‌هایی که به {partner.name} سپرده شده‌اند در «سفارش‌ها»ست. لغو، ویرایش نشانی، تعرفه و بقیه با جزوه‌یار است.
        </p>
        <div className="ad-actions">
          <Link href={panelPath(gate, '/orders')} className="jy-btn jy-btn--secondary">
            سفارش‌ها
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section className="jy-card ad-noaccess" aria-labelledby="t-noaccess">
      <h1 id="t-noaccess" className="jy-card__title">
        این بخش فقط برای مالک است
      </h1>
      <p className="ad-lead">
        تعرفه را می‌توانی ببینی؛ ساختن نسخهٔ تازه، تنظیمات، کلیدها، چاپخانه‌ها، ادمین‌ها، رویدادها، برگرداندن ورود فایل پست و گزارش ارسال
        با مالک پنل است.
      </p>
      <div className="ad-actions">
        <Link href={panelPath(gate)} className="jy-btn jy-btn--secondary">
          پیشخوان
        </Link>
      </div>
    </section>
  );
}
