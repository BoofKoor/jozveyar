import Link from 'next/link';

import { panelPath } from '../lib/gate';

/**
 * بخشی که مجوزش را ندارد (طرح پنل): متصدی «این بخش فقط برای مالک است» با برگشت به پیشخوان، کاربر چاپخانه (برش ۵٫۳) «این بخش برای
 * چاپخانه باز نیست» با راه «سفارش‌ها»، که سفارش‌های خودش آنجاست، و حسابدار (برش ۹٫۴) «این بخش برای حسابدار باز نیست» با همان راه. از
 * ۱۰٫۲ گزارش‌ها هم در متن: گزارش تولید برای چاپخانه (خودش) و حسابدار، و گزارش ارسال برای حسابدار؛ از ۱۱٫۴ کدهای تخفیف؛ از ۱۲٫۳ نظر
 * مشتری‌ها، فقط مالک؛ و از ۱۱٫۳ متصدی نوار اعلان را دارد و متن‌های سایت را نه (طرح «این بخش فقط برای مالک است»)، و از ۱۱٫۲ بنر را هم و لوگو
 * را نه. از ۱۲٫۱ پشتیبانی با مالک و متصدی است: چاپخانه و حسابدار ندارندش. از ۱۰٫۳ تسویه: مالک و حسابدار همه، و چاپخانه صورت‌حساب خودش؛
 * درصد سهم با مالک. از ۱۰٫۴ موجودی کاغذ: مالک و متصدی همه، و چاپخانه موجودی خودش؛ حسابدار نه.
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
          سفارش‌هایی که به {partner.name} سپرده شده‌اند در «سفارش‌ها»ست، گزارش تولید و صورت‌حساب تسویه‌شان در «گزارش‌ها»، و موجودی کاغذت در
          «موجودی کاغذ». لغو، ویرایش نشانی، پیام مشتری‌ها، تعرفه و بقیه با جزوه‌یار است.
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
          سفارش‌ها با مبلغ و پرداخت‌ها، بازپرداخت، یادداشت‌ها، گزارش‌ها (تولید، ارسال و تسویهٔ چاپخانه‌ها) و دیدن کدهای تخفیف با توست. چاپ، فایل‌ها،
          ارسال، موجودی کاغذ، پاسخ به پیام مشتری‌ها و تعرفه با متصدی است، و تنظیمات، چاپخانه‌ها و درصد سهمشان، ادمین‌ها، نظر مشتری‌ها و ساختن کد تخفیف با مالک.
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
        تعرفه را می‌توانی ببینی و نوار اعلان و بنر صفحهٔ اصلی را عوض کنی؛ ساختن نسخهٔ تازهٔ تعرفه، متن‌ها و لوگوی سایت، تنظیمات، کلیدها، چاپخانه‌ها،
        ادمین‌ها، رویدادها، نظر مشتری‌ها و برگرداندن ورود فایل پست با مالک پنل است، و گزارش‌ها و کدهای تخفیف با مالک و حسابدار.
      </p>
      <div className="ad-actions">
        <Link href={panelPath(gate)} className="jy-btn jy-btn--secondary">
          پیشخوان
        </Link>
      </div>
    </section>
  );
}
