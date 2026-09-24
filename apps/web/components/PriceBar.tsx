'use client';

import { formatNumber, formatTomans, formatWeight } from '@jozveyar/text';
import type { Breakdown } from '@jozveyar/contracts';
import { Names } from './JozveFiles';

interface Props {
  breakdown: Breakdown | null;
  /** تا وقتی تحلیل تمام نشده، قیمت با نشانگر «در حال بررسی» نشان داده می‌شود. */
  provisional: boolean;
  onContinue: () => void;
  /** فایل‌هایی از جزوه که هنوز شمرده نشده‌اند؛ قیمتشان بعداً اضافه می‌شود (ADR-030). */
  pending?: readonly string[];
  /**
   * فایل‌هایی که خوانده نشدند و در این قیمت نیستند. «ادامه» تا حذف یا جایگزینی‌شان بسته
   * است: جزوه‌ای که یک فصلش کم است بی‌صدا سفارش داده نمی‌شود.
   */
  blocked?: readonly string[];
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={muted ? 'text-muted' : 'text-ink'}>{label}</span>
      <span className={`num ${muted ? 'text-muted' : 'font-semibold text-ink'}`}>{value}</span>
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
export function PriceBar({ breakdown, provisional, onContinue, pending = [], blocked = [] }: Props) {
  if (!breakdown) return null;
  const held = provisional || blocked.length > 0;

  const item = breakdown.items[0];
  const total = breakdown.totalWithoutShippingRials;

  return (
    <div className="jy-card">
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
        <div className="mt-2 border-t border-line pt-2">
          <Line label="وزن برآوردی" value={formatWeight(breakdown.estWeightGrams)} muted />
        </div>
      </div>

      <div className="sm:mt-4 sm:border-t sm:border-line sm:pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{provisional ? 'قیمت تا این لحظه' : 'جمع'}</span>
          <span
            data-testid="price-total"
            className="num text-2xl font-semibold text-ink sm:text-3xl"
          >
            {formatTomans(total, false)}
            <span className="ms-1.5 text-base font-normal text-muted">تومان</span>
          </span>
        </div>

        {breakdown.shippingFromRials !== null ? (
          <p data-testid="shipping-from" className="mt-1 text-end text-sm text-muted">
            + ارسال از <span className="num">{formatTomans(breakdown.shippingFromRials, false)}</span>{' '}
            تومان
          </p>
        ) : null}

        {pending.length > 0 ? (
          <p data-testid="price-pending" className="mt-3 text-sm text-muted">
            قیمت <Names names={pending} /> بعد از بررسی روی سرور به این اضافه می‌شود.
          </p>
        ) : provisional ? (
          <p className="mt-3 text-sm text-muted">
            بررسی فایل ادامه دارد — عدد ممکن است کمی جابه‌جا شود.
          </p>
        ) : null}

        {blocked.length > 0 ? (
          <p data-testid="price-blocked" className="jy-note mt-3">
            این قیمت بدون <Names names={blocked} /> است که خوانده نشد. حذفش کن یا فایل درستش را جایش
            بگذار.
          </p>
        ) : null}

        {breakdown.warnings.includes('below_min_order') ? (
          <p className="jy-note mt-3">
            این سفارش از حداقل مبلغ کمتر است. چند جزوه را با هم بفرست تا هزینهٔ ارسال بین‌شان
            تقسیم شود.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onContinue}
          disabled={held}
          className={`jy-btn jy-btn--primary jy-btn--lg jy-btn--block mt-5${provisional ? ' is-loading' : ''}`}
        >
          {provisional
            ? 'در حال بررسی…'
            : blocked.length > 0
              ? 'اول تکلیف فایل خوانده‌نشده را روشن کن'
              : 'ادامه — آدرس و تحویل'}
          {held ? null : <span className="jy-icon jy-icon-arrow" aria-hidden="true" />}
        </button>
        <p className="mt-2.5 hidden text-center text-xs text-muted sm:block">
          ثبت‌نام لازم نیست. شماره موبایل فقط در لحظهٔ پرداخت گرفته می‌شود.
        </p>
      </div>
    </div>
  );
}
