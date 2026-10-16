import Link from 'next/link';

import { panelPath } from '../lib/gate';

/**
 * بخشی که مجوزش را ندارد (طرح پنل): متصدی «این بخش فقط برای مالک است» با برگشت به پیشخوان، کاربر چاپخانه (برش ۵٫۳) «این بخش برای
 * چاپخانه باز نیست» با راه «سفارش‌ها»، که سفارش‌های خودش آنجاست، و حسابدار (برش ۹٫۴) «این بخش برای حسابدار باز نیست» با همان راه. از
 * ۱۰٫۲ گزارش‌ها هم در متن: گزارش تولید برای چاپخانه (خودش) و حسابدار، و گزارش ارسال برای حسابدار؛ و از ۱۱٫۴ کدهای تخفیف.
 */
export function NoAccess({ gate, session }: { gate: string; session: { roles: readonly string[]; partner: { name: string } | null } }) {
  const { partner } = session;
  if (partner) {
    return (
      <section className="jy-card ad-noaccess" aria-labelledby="t-noaccess" data-noaccess="partner">
        <h1 id="t-noaccess" className="jy-card__title">
          این بخش برای چاپخانه باز نیست
        </h1>
        <p className="ad-lead">
          سفارش‌هایی که به {partner.name} سپرده شده‌اند در «سفارش‌ها»ست، و گزارش تولیدشان در «گزارش‌ها». لغو، ویرایش نشانی، تعرفه و بقیه با
          جزوه‌یار است.
        </p>
        <div className="ad-actions">
          <Link href={panelPath(gate, '/orders')} className="jy-btn jy-btn--secondary">
            سفارش‌ها
          </Link>
        </div>
      </section>
    );
  }
  if (session.roles.includes('accountant') && !session.roles.includes('owner') && !session.roles.includes('operator')) {
    return (
      <section className="jy-card ad-noaccess" aria-labelledby="t-noaccess" data-noaccess="accountant">
        <h1 id="t-noaccess" className="jy-card__title">
          این بخش برای حسابدار باز نیست
        </h1>
        <p className="ad-lead">
          سفارش‌ها با مبلغ و پرداخت‌ها، بازپرداخت، یادداشت‌ها، گزارش‌ها (تولید و ارسال) و دیدن کدهای تخفیف با توست. چاپ، فایل‌ها، ارسال و
          تعرفه با متصدی است، و تنظیمات، چاپخانه‌ها، ادمین‌ها و ساختن کد تخفیف با مالک.
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
        تعرفه را می‌توانی ببینی؛ ساختن نسخهٔ تازه، تنظیمات، کلیدها، چاپخانه‌ها، ادمین‌ها، رویدادها و برگرداندن ورود فایل پست با مالک پنل
        است، و گزارش‌ها و کدهای تخفیف با مالک و حسابدار.
      </p>
      <div className="ad-actions">
        <Link href={panelPath(gate)} className="jy-btn jy-btn--secondary">
          پیشخوان
        </Link>
      </div>
    </section>
  );
}
