import { formatTomans } from '@jozveyar/text';

/*
 * عدد تومان و جمع درشت، جدا از `parts.tsx` (برش ۸٫۲): صفحهٔ سفارش در مرورگر از تکه‌های مشترک فقط همین را می‌خواهد
 * (`OrderPay.tsx`). اگر از `parts.tsx` بیاید، webpack کل آن را میان رابط پس از فایل و صفحهٔ سفارش مشترک می‌بیند، و از ۲۰
 * کیلوبایت که گذشت تکهٔ جدایی می‌سازد که رابط پس از فایل با درخواست دومی در راه اولین قیمت بار می‌کند (docs/UI.md، «۸٫۲»).
 */

/** «374,750» در span خودش؛ «تومان» بیرون. */
export function Tomans({ rials }: { rials: number }) {
  return <span className="num">{formatTomans(rials, false)}</span>;
}

/** جمع درشت خلاصه و نوار: «374,750» و «تومان» کوچک کنارش. */
export function SumValue({ rials, testId }: { rials: number | null; testId?: string }) {
  return (
    <span className="home-sum__value">
      <span data-testid={testId} className="num">
        {rials === null ? '…' : formatTomans(rials, false)}
      </span>
      <small>تومان</small>
    </span>
  );
}
