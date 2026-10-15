'use client';

import type { ReactNode } from 'react';
import { formatNumber, formatTomans } from '@jozveyar/text';
import type { Breakdown, PriceList } from '@jozveyar/contracts';
import { minOrderGapRials } from '@jozveyar/pricing';
import { DEFAULT_PAPER_TYPE_ID } from '@jozveyar/pricing/seed';
import { publishDockHeight } from '../lib/dock';
import type { OrderConfig } from '../lib/orderConfig';
import { Names, Note } from './AnalysisCard';
import { JozveLines, SummaryLines, printLabel, type JozveLine } from './checkout/parts';
import { SumValue } from './checkout/sum';

/**
 * «ادامه»ی قدم «جزوه و قیمت»، از دید خلاصه و نوار موبایل (`OrderDesk` حسابش می‌کند):
 * - `checking`: بررسی مرورگر تمام نشده، یا هنوز نمی‌دانیم ثبت سفارش باز است (`GET /api/checkout`).
 * - `blocked`: فایلی خوانده نشد؛ جزوه‌ای که یک فصلش کم است بی‌صدا سفارش داده نمی‌شود (ADR-030).
 * - `soon`: ثبت سفارش آنلاین هنوز باز نیست (`CHECKOUT_MODE=off`، سایت زنده تا برش ۷؛ ADR-035).
 * - `paused`: مالک ثبت سفارش را «متوقف» کرده، یا درگاه آماده نیست (برش ۷٫۵، ADR-052، سؤال‌های ۱۳۴ و ۱۶۶).
 * - `sending`: فایلی هنوز به سرور نرسیده یا سرور بررسی‌اش می‌کند؛ سفارش با شمارش سرور است (ADR-034).
 * - `stuck`: فایلی به سرور نرسید؛ یادداشت خلاصه راه جلو را می‌گوید.
 * - `busy`: «ادامه» زده شد و قیمت سرور در راه است.
 * - `waiting`: جزوه بعد از رفرش برگشت و فایلی منتظر انتخاب دوباره است (۳د، ADR-036).
 * - `short`: جمع چاپ، کاغذ و صحافی هنوز به حداقل سفارش تعرفه نرسیده (برش ۸٫۴، سؤال‌های ۱۹۰ و ۲۲۲)؛ متنش مانده را می‌گوید.
 */
export type DeskAction = 'checking' | 'blocked' | 'soon' | 'paused' | 'short' | 'sending' | 'stuck' | 'busy' | 'waiting' | 'go';

const LABEL: Record<DeskAction, string> = {
  checking: 'در حال بررسی…',
  blocked: 'اول تکلیف فایل خوانده‌نشده را روشن کن',
  soon: 'ثبت سفارش آنلاین به‌زودی',
  paused: 'ثبت سفارش موقتاً متوقف است',
  short: 'تا حداقل سفارش مانده',
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
  paused: 'متوقف',
  short: 'ادامه',
  sending: 'ارسال…',
  stuck: 'ادامه',
  busy: 'ادامه',
  waiting: 'ادامه',
  go: 'ادامه',
};

const NAME: Partial<Record<DeskAction, string>> = {
  blocked: 'ادامه — اول تکلیف فایل خوانده‌نشده را روشن کن',
  soon: 'ثبت سفارش آنلاین به‌زودی',
  paused: 'ثبت سفارش موقتاً متوقف است',
  sending: 'ادامه — در حال ارسال فایل',
  stuck: 'ادامه — اول فایل باید به سرور برسد',
  waiting: 'ادامه — اول همان فایل را دوباره انتخاب کن',
};

/** در حال کار: چرخندهٔ کیت و متن خواندنی. */
const LOADING: ReadonlySet<DeskAction> = new Set(['checking', 'sending', 'busy']);

interface ActionProps {
  action: DeskAction;
  /**
   * متن و نام «ادامه» وقتی حالتش عدد یا شمار دارد (برش ۸٫۴): «تا حداقل سفارش 32,400 تومان مانده»، یا «اول تکلیف فایل‌های
   * پذیرفته‌نشده را روشن کن».
   */
  detail?: { label: string; name: string };
  /** «ادامه»: قیمت سرور و قدم شهر (مسیر خرید). */
  onContinue: () => void;
  /** نشانهٔ قصد (اشاره‌گر یا فوکوس روی «ادامه»): تکهٔ مسیر خرید از همین لحظه بار می‌شود. */
  onIntent: () => void;
}

/**
 * دکمهٔ «ادامه»، در خلاصه و در نوار موبایل. «به‌زودی»، «متوقف» و «تا حداقل سفارش … مانده» بسته‌اند ولی در ترتیب Tab می‌مانند
 * (`aria-disabled`)، تا صفحه‌خوان هم بشنود چرا؛ متنشان وضعیت است و خواندنی (`is-status`). بقیهٔ حالت‌های بسته، مثل ۴ب، `disabled`.
 */
function ContinueButton({ action, detail, onContinue, onIntent, short }: ActionProps & { short: boolean }) {
  const soon = action === 'soon' || action === 'paused' || action === 'short';
  const loading = LOADING.has(action);
  const open = action === 'go';
  return (
    <button
      type="button"
      disabled={!open && !soon}
      aria-disabled={soon ? true : undefined}
      aria-busy={action === 'busy' ? true : undefined}
      aria-label={short ? detail?.name ?? NAME[action] ?? (loading && action !== 'busy' ? undefined : LABEL[action]) : undefined}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onClick={() => {
        if (open) onContinue();
      }}
      className={`jy-btn jy-btn--primary jy-btn--lg${short ? ' shrink-0' : ' jy-btn--block home-sum__go'}${
        loading ? ' is-loading' : soon ? ' is-status' : ''
      }`}
    >
      {short ? SHORT[action] : (detail?.label ?? LABEL[action])}
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
  /** آنهایی از `blocked` که پذیرفته نشدند (قاعده‌های فایل یا نوع ناشناس، برش ۸٫۴)، نه اینکه خوانده نشدند. */
  refused: readonly string[];
  /** فایل‌های جزوهٔ برگشته که منتظر انتخاب دوباره‌اند (۳د)؛ در این قیمت نیستند. */
  waiting: readonly string[];
  /**
   * جزوه‌های سفارش چندجزوه، هر کدام با قیمتش (برش ۸٫۲، سؤال ۲۲۵)؛ null در سفارش یک‌جزوه، که ریز قیمت همان یک قلم را دارد.
   * جزوه‌ای که هنوز صفحه‌ای ندارد اینجا نیست.
   */
  jozves: readonly JozveLine[] | null;
}

/** ریال به نزدیک‌ترین تومان رو به بالا: «مانده» هرگز کمتر از آنچه لازم است دیده نمی‌شود. */
export function roundUpToToman(rials: number): number {
  return Math.ceil(rials / 10) * 10;
}

/** «جمع»، «جمع · 3 جزوه»، یا «قیمت تا این لحظه». */
function TotalLabel({ provisional, jozves }: { provisional: boolean; jozves: number | null }) {
  if (provisional) return 'قیمت تا این لحظه';
  if (jozves === null) return 'جمع';
  return (
    <>
      جمع <span className="home-sum__count">· <span className="num">{formatNumber(jozves)}</span> جزوه</span>
    </>
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
  refused,
  waiting,
  jozves,
  notes,
  ...action
}: Props & ActionProps & { config: OrderConfig; priceList: PriceList; notes?: ReactNode }) {
  const unread = blocked.filter((name) => !refused.includes(name));
  const gapRials = minOrderGapRials(breakdown, priceList);
  const item = breakdown.items[0];
  const binding = priceList.bindingTypes[config.bindingTypeId]?.nameFa ?? '';
  const paper = config.paperTypeId === DEFAULT_PAPER_TYPE_ID ? null : (priceList.paperTypes[config.paperTypeId]?.nameFa ?? null);

  return (
    <div className="jy-card home-sum">
      <h2 id="summary-title" className="jy-card__title">
        خلاصهٔ سفارش
      </h2>
      {/* ریز قیمت میز بی ارسال است، پس گرد کردنش همان گرد کردن «جمع» زیرش است (۸٫۴). */}
      {jozves ? (
        <JozveLines jozves={jozves} rounding={breakdown.roundingRials} />
      ) : item ? (
        <SummaryLines
          item={item}
          print={printLabel(config.colorMode, config.sidesMode, config.paperSize, paper)}
          bindingName={binding}
          rounding={breakdown.roundingRials}
        />
      ) : null}

      <div className="home-sum__total">
        <span className="home-sum__label">
          <TotalLabel provisional={provisional} jozves={jozves ? jozves.length : null} />
        </span>
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
        {unread.length > 0 ? (
          <Note tone="error" testId="price-blocked">
            این قیمت بدون <Names names={unread} /> است که خوانده نشد. حذفش کن یا فایل درستش را جایش بگذار.
          </Note>
        ) : null}
        {refused.length > 0 ? (
          <Note tone="error" testId="price-refused">
            {refused.length === 1 ? (
              <>
                این قیمت بدون <Names names={refused} /> است که پذیرفته نشد. حذفش کن یا فایل درستش را جایش بگذار.
              </>
            ) : (
              <>
                این قیمت بدون <Names names={refused} /> است که پذیرفته نشدند. حذفشان کن یا فایل درستشان را جایشان بگذار.
              </>
            )}
          </Note>
        ) : null}
        {gapRials > 0 ? (
          // حداقل سفارش (برش ۸٫۴، طرح میز سؤال ۲۲۲): روی جمع چاپ، کاغذ و صحافی، پیش از ارسال؛ مانده گرد به بالا.
          <Note tone="info" testId="min-order">
            <p>
              حداقل سفارش <span className="num">{formatTomans(priceList.settings.minOrderRials, false)}</span> تومان است، پیش از
              ارسال؛ <span className="num">{formatTomans(roundUpToToman(gapRials), false)}</span> تومان مانده.
            </p>
            <p className="mt-1">نسخهٔ بیشتر بگیر، یا جزوهٔ دیگری اضافه کن.</p>
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
export function PriceDock({
  breakdown,
  provisional,
  jozves,
  gapRials,
  ...action
}: Pick<Props, 'breakdown' | 'provisional'> & ActionProps & { jozves: number | null; gapRials: number }) {
  return (
    <div ref={publishDockHeight} className="home-dock" role="region" aria-label="قیمت">
      <div className="site-wrap home-dock__in">
        <p className="home-dock__price">
          <span className="home-dock__label">
            <TotalLabel provisional={provisional} jozves={jozves} />
          </span>
          <SumValue rials={breakdown.totalWithoutShippingRials} testId="price-total" />
          {gapRials > 0 ? (
            // حداقل سفارش (سؤال ۲۲۲): جای «ارسال از» در نوار
            <span className="home-dock__ship" data-testid="dock-min-order">
              تا حداقل سفارش <span className="num">{formatTomans(roundUpToToman(gapRials), false)}</span> تومان مانده
            </span>
          ) : breakdown.shippingFromRials !== null ? (
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
