'use client';

import type { ReactNode } from 'react';
import { formatTomans } from '@jozveyar/text';
import type { Breakdown, PriceList } from '@jozveyar/contracts';
import { publishDockHeight } from '../lib/dock';
import type { OrderConfig } from '../lib/orderConfig';
import { Names, Note } from './AnalysisCard';
import { SumValue, SummaryLines, printLabel } from './checkout/parts';

/**
 * «ادامه»ی قدم «جزوه و قیمت»، از دید خلاصه و نوار موبایل (`OrderDesk` حسابش می‌کند):
 * - `checking`: بررسی مرورگر تمام نشده، یا هنوز نمی‌دانیم ثبت سفارش باز است (`GET /api/checkout`).
 * - `blocked`: فایلی خوانده نشد؛ جزوه‌ای که یک فصلش کم است بی‌صدا سفارش داده نمی‌شود (ADR-030).
 * - `soon`: ثبت سفارش آنلاین هنوز باز نیست (`CHECKOUT_MODE=off`، سایت زنده تا برش ۷؛ ADR-035).
 * - `sending`: فایلی هنوز به سرور نرسیده یا سرور بررسی‌اش می‌کند؛ سفارش با شمارش سرور است (ADR-034).
 * - `stuck`: فایلی به سرور نرسید؛ یادداشت خلاصه راه جلو را می‌گوید.
 * - `busy`: «ادامه» زده شد و قیمت سرور در راه است.
 * - `waiting`: جزوه بعد از رفرش برگشت و فایلی منتظر انتخاب دوباره است (۳د، ADR-036).
 */
export type DeskAction = 'checking' | 'blocked' | 'soon' | 'sending' | 'stuck' | 'busy' | 'waiting' | 'go';

const LABEL: Record<DeskAction, string> = {
  checking: 'در حال بررسی…',
  blocked: 'اول تکلیف فایل خوانده‌نشده را روشن کن',
  soon: 'ثبت سفارش آنلاین به‌زودی',
  sending: 'در حال ارسال فایل…',
  stuck: 'ادامه — آدرس و تحویل',
  busy: 'ادامه — آدرس و تحویل',
  waiting: 'اول همان فایل را دوباره انتخاب کن',
  go: 'ادامه — آدرس و تحویل',
};

/** متن کوتاه نوار موبایل؛ نامش (`aria-label`) همان متن کامل خلاصه است. */
const SHORT: Record<DeskAction, string> = {
  checking: 'بررسی…',
  blocked: 'ادامه',
  soon: 'به‌زودی',
  sending: 'ارسال…',
  stuck: 'ادامه',
  busy: 'ادامه',
  waiting: 'ادامه',
  go: 'ادامه',
};

const NAME: Partial<Record<DeskAction, string>> = {
  blocked: 'ادامه — اول تکلیف فایل خوانده‌نشده را روشن کن',
  soon: 'ثبت سفارش آنلاین به‌زودی',
  sending: 'ادامه — در حال ارسال فایل',
  stuck: 'ادامه — اول فایل باید به سرور برسد',
  waiting: 'ادامه — اول همان فایل را دوباره انتخاب کن',
};

/** در حال کار: چرخندهٔ کیت و متن خواندنی. */
const LOADING: ReadonlySet<DeskAction> = new Set(['checking', 'sending', 'busy']);

interface ActionProps {
  action: DeskAction;
  /** «ادامه»: قیمت سرور و قدم شهر (مسیر خرید). */
  onContinue: () => void;
  /** نشانهٔ قصد (اشاره‌گر یا فوکوس روی «ادامه»): تکهٔ مسیر خرید از همین لحظه بار می‌شود. */
  onIntent: () => void;
}

/**
 * دکمهٔ «ادامه»، در خلاصه و در نوار موبایل. «به‌زودی» بسته است ولی در ترتیب Tab می‌ماند (`aria-disabled`)،
 * تا صفحه‌خوان هم بشنود چرا؛ متنش وضعیت است و خواندنی (`is-status`). بقیهٔ حالت‌های بسته، مثل ۴ب، `disabled`.
 */
function ContinueButton({ action, onContinue, onIntent, short }: ActionProps & { short: boolean }) {
  const soon = action === 'soon';
  const loading = LOADING.has(action);
  const open = action === 'go';
  return (
    <button
      type="button"
      disabled={!open && !soon}
      aria-disabled={soon ? true : undefined}
      aria-busy={action === 'busy' ? true : undefined}
      aria-label={short ? NAME[action] ?? (loading && action !== 'busy' ? undefined : LABEL[action]) : undefined}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onClick={() => {
        if (open) onContinue();
      }}
      className={`jy-btn jy-btn--primary jy-btn--lg${short ? ' shrink-0' : ' jy-btn--block home-sum__go'}${
        loading ? ' is-loading' : soon ? ' is-status' : ''
      }`}
    >
      {short ? SHORT[action] : LABEL[action]}
      {open ? <span className="jy-icon jy-icon-arrow" aria-hidden="true" /> : null}
    </button>
  );
}

interface Props {
  breakdown: Breakdown;
  /** تا وقتی تحلیل تمام نشده، قیمت «تا این لحظه» است. */
  provisional: boolean;
  /** فایل‌هایی از جزوه که هنوز شمرده نشده‌اند؛ قیمتشان بعداً اضافه می‌شود (ADR-030). */
  pending: readonly string[];
  /**
   * فایل‌هایی که خوانده نشدند و در این قیمت نیستند. «ادامه» تا حذف یا جایگزینی‌شان بسته
   * است: جزوه‌ای که یک فصلش کم است بی‌صدا سفارش داده نمی‌شود.
   */
  blocked: readonly string[];
  /** فایل‌های جزوهٔ برگشته که منتظر انتخاب دوباره‌اند (۳د)؛ در این قیمت نیستند. */
  waiting: readonly string[];
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
  waiting,
  notes,
  ...action
}: Props & ActionProps & { config: OrderConfig; priceList: PriceList; notes?: ReactNode }) {
  const item = breakdown.items[0];
  const binding = priceList.bindingTypes[config.bindingTypeId]?.nameFa ?? '';

  return (
    <div className="jy-card home-sum">
      <h2 id="summary-title" className="jy-card__title">
        خلاصهٔ سفارش
      </h2>
      {item ? <SummaryLines item={item} print={printLabel(config.colorMode, config.sidesMode)} bindingName={binding} /> : null}

      <div className="home-sum__total">
        <span className="home-sum__label">{provisional ? 'قیمت تا این لحظه' : 'جمع'}</span>
        <SumValue rials={breakdown.totalWithoutShippingRials} testId="summary-total" />
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
        ) : provisional && waiting.length === 0 ? (
          <Note tone="info">بررسی فایل ادامه دارد؛ عدد ممکن است کمی جابه‌جا شود.</Note>
        ) : null}
        {waiting.length > 0 ? (
          <Note tone="info" testId="price-waiting">
            قیمت <Names names={waiting} /> بعد از انتخاب دوبارهٔ همان فایل به این اضافه می‌شود.
          </Note>
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
        {notes}
      </div>

      <ContinueButton {...action} short={false} />
      <p className="home-sum__secure">
        <span className="jy-icon jy-icon-lock" aria-hidden="true" />
        ثبت‌نام لازم نیست؛ موبایل فقط موقع پرداخت.
      </p>
    </div>
  );
}

/**
 * نوار قیمت موبایل و تبلت (تا ۸۶۰ پیکسل، طرح ز): جمع، «ارسال از» و «ادامه»، ثابت پایین صفحه، تا قیمت
 * همیشه روی صفحه باشد. یادداشت‌ها در خلاصهٔ سفارشِ در جریان صفحه‌اند، نه اینجا، تا نوار کوتاه بماند.
 *
 * `fixed` است نه `sticky`: عنصر sticky فقط داخل ظرف خودش می‌چسبد، و با ظرفش از صفحه بیرون می‌رفت.
 * `price-total` جمع همین نوار است، چون در موبایل همین همیشه دیده می‌شود؛ در دسکتاپ نوار پنهان است و
 * جمع دیدنی `summary-total` خلاصهٔ سفارش است.
 */
export function PriceDock({ breakdown, provisional, ...action }: Pick<Props, 'breakdown' | 'provisional'> & ActionProps) {
  return (
    <div ref={publishDockHeight} className="home-dock" role="region" aria-label="قیمت">
      <div className="site-wrap home-dock__in">
        <p className="home-dock__price">
          <span className="home-dock__label">{provisional ? 'قیمت تا این لحظه' : 'جمع'}</span>
          <SumValue rials={breakdown.totalWithoutShippingRials} testId="price-total" />
          {breakdown.shippingFromRials !== null ? (
            <span className="home-dock__ship">
              + ارسال از <span className="num">{formatTomans(breakdown.shippingFromRials, false)}</span> تومان
            </span>
          ) : null}
        </p>
        <ContinueButton {...action} short />
      </div>
    </div>
  );
}
