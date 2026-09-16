'use client';

import { formatNumber, formatTomans, formatWeight } from '@jozveyar/text';
import type { Breakdown } from '@jozveyar/contracts';

interface Props {
  breakdown: Breakdown | null;
  /** تا وقتی تحلیل تمام نشده، قیمت با نشانگر «در حال بررسی» نشان داده می‌شود. */
  provisional: boolean;
  onContinue: () => void;
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={muted ? 'text-ink-2' : 'text-ink'}>{label}</span>
      <span className={`num ${muted ? 'text-ink-2' : 'font-semibold text-ink'}`}>{value}</span>
    </div>
  );
}

/**
 * نوار قیمت — در موبایل چسبان پایین، در دسکتاپ ستون کنار.
 *
 * ارسال تا مرحلهٔ آدرس معلوم نیست، ولی «از X تومان» نشان داده می‌شود. چون کرایهٔ
 * پست تقریباً ثابت است (کف ~۱۳۵ هزار تومان)، این عدد تخمین مبهم نیست و پرش قیمت
 * در مرحلهٔ آدرس را حذف می‌کند. (ADR-011)
 */
export function PriceBar({ breakdown, provisional, onContinue }: Props) {
  if (!breakdown) return null;

  const item = breakdown.items[0];
  const total = breakdown.totalWithoutShippingRials;

  return (
    <div className="rounded-card border border-hairline bg-card p-5 sm:p-6">
      <div className="hidden text-sm sm:block">
        {item ? (
          <>
            <Line
              label={`چاپ · ${formatNumber(item.printedSides)} صفحه`}
              value={formatTomans(item.printRials, false)}
              muted
            />
            {item.paperRials > 0 ? (
              <Line label="کاغذ" value={formatTomans(item.paperRials, false)} muted />
            ) : null}
            <Line
              label={
                item.volumes > 1
                  ? `صحافی · ${formatNumber(item.volumes)} جلد`
                  : `صحافی · ${formatNumber(item.sheets)} برگ`
              }
              value={formatTomans(item.bindingRials, false)}
              muted
            />
            {item.copies > 1 ? (
              <Line label={`${formatNumber(item.copies)} نسخه`} value="" muted />
            ) : null}
          </>
        ) : null}
        <div className="mt-2 border-t border-hairline pt-2">
          <Line label="وزن برآوردی" value={formatWeight(breakdown.estWeightGrams)} muted />
        </div>
      </div>

      <div className="sm:mt-4 sm:border-t sm:border-hairline sm:pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-ink-2">{provisional ? 'قیمت تا این لحظه' : 'جمع'}</span>
          <span
            data-testid="price-total"
            className="num text-2xl font-semibold text-ink sm:text-3xl"
          >
            {formatTomans(total, false)}
            <span className="ms-1.5 text-base font-normal text-ink-2">تومان</span>
          </span>
        </div>

        {breakdown.shippingFromRials !== null ? (
          <p data-testid="shipping-from" className="mt-1 text-end text-sm text-ink-2">
            + ارسال از <span className="num">{formatTomans(breakdown.shippingFromRials, false)}</span>{' '}
            تومان
          </p>
        ) : null}

        {provisional ? (
          <p className="mt-3 text-sm text-ink-2">
            بررسی فایل ادامه دارد — عدد ممکن است کمی جابه‌جا شود.
          </p>
        ) : null}

        {breakdown.warnings.includes('below_min_order') ? (
          <p className="mt-3 rounded-lg bg-chip px-3 py-2 text-sm text-ink-2">
            این سفارش از حداقل مبلغ کمتر است. چند جزوه را با هم بفرست تا هزینهٔ ارسال بین‌شان
            تقسیم شود.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onContinue}
          disabled={provisional}
          className="mt-5 w-full rounded-lg bg-sage-button py-3.5 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {provisional ? 'در حال بررسی…' : 'ادامه — آدرس و تحویل'}
        </button>
        <p className="mt-2.5 hidden text-center text-xs text-ink-2 sm:block">
          ثبت‌نام لازم نیست. شماره موبایل فقط در لحظهٔ پرداخت گرفته می‌شود.
        </p>
      </div>
    </div>
  );
}
