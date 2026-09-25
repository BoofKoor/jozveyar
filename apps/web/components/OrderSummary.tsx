'use client';

import { formatNumber, formatTomans } from '@jozveyar/text';
import type { Breakdown, PriceList } from '@jozveyar/contracts';
import type { OrderConfig } from '../lib/orderConfig';
import { Note } from './AnalysisCard';
import { Names } from './JozveFiles';

interface Props {
  breakdown: Breakdown;
  /** تا وقتی تحلیل تمام نشده، قیمت «تا این لحظه» است و «ادامه» در حال کار. */
  provisional: boolean;
  /** فایل‌هایی از جزوه که هنوز شمرده نشده‌اند؛ قیمتشان بعداً اضافه می‌شود (ADR-030). */
  pending: readonly string[];
  /**
   * فایل‌هایی که خوانده نشدند و در این قیمت نیستند. «ادامه» تا حذف یا جایگزینی‌شان بسته
   * است: جزوه‌ای که یک فصلش کم است بی‌صدا سفارش داده نمی‌شود.
   */
  blocked: readonly string[];
}

/** «245,000» و «تومان» کوچک کنارش؛ عدد در span خودش. */
function Total({ rials, testId }: { rials: number; testId: string }) {
  return (
    <span className="home-sum__value">
      <span data-testid={testId} className="num">
        {formatTomans(rials, false)}
      </span>
      <small>تومان</small>
    </span>
  );
}

/**
 * خلاصهٔ سفارش (طرح ز): ریز قیمت، جمع، «ارسال از»، یادداشت‌ها و «ادامه». در دسکتاپ ستون کنار است
 * و تا ته شبکهٔ سفارش می‌چسبد؛ در موبایل در جریان صفحه، و جمع و «ادامه» در نوار پایین (`PriceDock`).
 *
 * ارسال تا مرحلهٔ آدرس معلوم نیست، ولی «از X تومان» نشان داده می‌شود. چون کرایهٔ پست تقریباً ثابت
 * است (کف ~۱۳۵ هزار تومان)، این عدد تخمین مبهم نیست و پرش قیمت در مرحلهٔ آدرس را حذف می‌کند. (ADR-011)
 */
export function OrderSummary({
  breakdown,
  config,
  priceList,
  provisional,
  pending,
  blocked,
}: Props & { config: OrderConfig; priceList: PriceList }) {
  const item = breakdown.items[0];
  const binding = priceList.bindingTypes[config.bindingTypeId]?.nameFa ?? '';

  return (
    <div className="jy-card home-sum">
      <h2 id="summary-title" className="jy-card__title">
        خلاصهٔ سفارش
      </h2>
      {item ? (
        <dl className="home-sum__lines">
          <div>
            <dt>
              چاپ {config.colorMode === 'color' ? 'رنگی' : 'سیاه‌سفید'}، {config.sidesMode === 'double' ? 'دورو' : 'یکرو'} ·{' '}
              <span className="num">{formatNumber(item.printedSides)}</span> صفحه
            </dt>
            <dd className="num">{formatTomans(item.printRials, false)}</dd>
          </div>
          {item.paperRials > 0 ? (
            <div>
              <dt>کاغذ</dt>
              <dd className="num">{formatTomans(item.paperRials, false)}</dd>
            </div>
          ) : null}
          <div>
            <dt>
              صحافی {binding} ·{' '}
              {item.volumes > 1 ? (
                <>
                  <span className="num">{formatNumber(item.volumes)}</span> جلد
                </>
              ) : (
                <>
                  <span className="num">{formatNumber(item.sheets)}</span> برگ
                </>
              )}
            </dt>
            <dd className="num">{formatTomans(item.bindingRials, false)}</dd>
          </div>
          <div>
            <dt>تعداد</dt>
            <dd>
              <span className="num">{formatNumber(item.copies)}</span> نسخه
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="home-sum__total">
        <span className="home-sum__label">{provisional ? 'قیمت تا این لحظه' : 'جمع'}</span>
        <Total rials={breakdown.totalWithoutShippingRials} testId="summary-total" />
      </div>

      {breakdown.shippingFromRials !== null ? (
        <p data-testid="shipping-from" className="home-sum__ship">
          <span className="jy-icon jy-icon-truck" aria-hidden="true" />
          <span>
            + ارسال از <span className="num">{formatTomans(breakdown.shippingFromRials, false)}</span> تومان. شهر
            را در قدم بعد انتخاب می‌کنی.
          </span>
        </p>
      ) : null}

      <div className="home-sum__notes empty:hidden">
        {pending.length > 0 ? (
          <Note tone="info" testId="price-pending">
            قیمت <Names names={pending} /> بعد از بررسی روی سرور به این اضافه می‌شود.
          </Note>
        ) : provisional ? (
          <Note tone="info">بررسی فایل ادامه دارد؛ عدد ممکن است کمی جابه‌جا شود.</Note>
        ) : null}
        {blocked.length > 0 ? (
          <Note tone="error" testId="price-blocked">
            این قیمت بدون <Names names={blocked} /> است که خوانده نشد. حذفش کن یا فایل درستش را جایش بگذار.
          </Note>
        ) : null}
        {breakdown.warnings.includes('below_min_order') ? (
          <Note tone="warning">
            این سفارش از حداقل مبلغ کمتر است. چند جزوه را با هم بفرست تا هزینهٔ ارسال بین‌شان تقسیم شود.
          </Note>
        ) : null}
      </div>

      <button
        type="button"
        disabled={provisional || blocked.length > 0}
        className={`jy-btn jy-btn--primary jy-btn--lg jy-btn--block home-sum__go${provisional ? ' is-loading' : ''}`}
      >
        {provisional
          ? 'در حال بررسی…'
          : blocked.length > 0
            ? 'اول تکلیف فایل خوانده‌نشده را روشن کن'
            : 'ادامه — آدرس و تحویل'}
        {provisional || blocked.length > 0 ? null : <span className="jy-icon jy-icon-arrow" aria-hidden="true" />}
      </button>
      <p className="home-sum__secure">
        <span className="jy-icon jy-icon-lock" aria-hidden="true" />
        ثبت‌نام لازم نیست؛ موبایل فقط موقع پرداخت.
      </p>
    </div>
  );
}

/**
 * ارتفاع نوار قیمت را در `--price-dock` روی پاورقی سایت می‌گذارد. در موبایل نوار ثابت پایین صفحه
 * است و ته صفحه را می‌پوشاند؛ پاورقی (کامپوننت سرور، بی JS) همین‌قدر پایینش خالی می‌گذارد
 * (globals.css). ارتفاع با عرض و شکستن خط‌ها عوض می‌شود، پس اندازه گرفته می‌شود نه حدس زده. در
 * دسکتاپ نوار پنهان است و ارتفاعش صفر. React 19 پاک‌سازیِ ref را موقع برداشتن نوار اجرا می‌کند.
 *
 * روی خود پاورقی، نه `<html>`: متغیر ارث می‌رسد، پس عوض کردنش روی ریشه سبک کل صفحه را دوباره
 * حساب می‌کرد؛ با پردازندهٔ ۴ برابر کند، قیمت سه‌فایلی حدود ۲۵ میلی‌ثانیه دیرتر می‌آمد.
 */
function publishDockHeight(dock: HTMLDivElement | null) {
  if (!dock || typeof ResizeObserver === 'undefined') return;
  const footer = document.querySelector<HTMLElement>('body > footer');
  if (!footer) return;
  const observer = new ResizeObserver(() => footer.style.setProperty('--price-dock', `${dock.offsetHeight}px`));
  observer.observe(dock);
  return () => {
    observer.disconnect();
    footer.style.removeProperty('--price-dock');
  };
}

/**
 * نوار قیمت موبایل و تبلت (تا ۸۶۰ پیکسل، طرح ز): جمع، «ارسال از» و «ادامه»، ثابت پایین صفحه، تا قیمت
 * همیشه روی صفحه باشد. یادداشت‌ها در خلاصهٔ سفارشِ در جریان صفحه‌اند، نه اینجا، تا نوار کوتاه بماند.
 *
 * `fixed` است نه `sticky`: عنصر sticky فقط داخل ظرف خودش می‌چسبد، و با ظرفش از صفحه بیرون می‌رفت.
 * `price-total` جمع همین نوار است، چون در موبایل همین همیشه دیده می‌شود؛ در دسکتاپ نوار پنهان است و
 * جمع دیدنی `summary-total` خلاصهٔ سفارش است.
 */
export function PriceDock({ breakdown, provisional, blocked }: Omit<Props, 'pending'>) {
  const held = provisional || blocked.length > 0;
  return (
    <div ref={publishDockHeight} className="home-dock" role="region" aria-label="قیمت">
      <div className="site-wrap home-dock__in">
        <p className="home-dock__price">
          <span className="home-dock__label">{provisional ? 'قیمت تا این لحظه' : 'جمع'}</span>
          <Total rials={breakdown.totalWithoutShippingRials} testId="price-total" />
          {breakdown.shippingFromRials !== null ? (
            <span className="home-dock__ship">
              + ارسال از <span className="num">{formatTomans(breakdown.shippingFromRials, false)}</span> تومان
            </span>
          ) : null}
        </p>
        <button
          type="button"
          disabled={held}
          // نام همان «ادامه» خلاصهٔ سفارش است؛ متن دیدنی کوتاه، چون نوار جای جملهٔ بلند ندارد
          aria-label={
            provisional ? undefined : blocked.length > 0 ? 'ادامه — اول تکلیف فایل خوانده‌نشده را روشن کن' : 'ادامه — آدرس و تحویل'
          }
          className={`jy-btn jy-btn--primary jy-btn--lg shrink-0${provisional ? ' is-loading' : ''}`}
        >
          {provisional ? 'بررسی…' : 'ادامه'}
          {held ? null : <span className="jy-icon jy-icon-arrow" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
