import type { MouseEvent, ReactNode } from 'react';
import type { Breakdown, ItemBreakdown } from '@jozveyar/contracts';
import { formatNumber, formatTomans } from '@jozveyar/text';

/*
 * تکه‌های مشترک «جزوه و قیمت» و مسیر خرید (طرح `docs/ui/mockups/checkout.html`، چیدمان در app/checkout.css):
 * قدم‌های سفارش، جمع و ریز قیمت. نه hook دارند و نه API مرورگر، پس هم رابط پس از فایل (کلاینت) آنها را می‌گیرد و
 * هم صفحهٔ سفارش (کامپوننت سرور). تکه‌های مرور جدا در `recap.tsx`اند: این فایل در راه اولین قیمت است و هر خط
 * اضافه‌اش آنجا تجزیه و اجرا می‌شود. عدد تومان و جمع درشت در `sum.tsx`اند. رنگ فقط توکن، و `.num` فقط روی خود عدد.
 */

const COLOR = { color: 'رنگی', bw: 'سیاه‌سفید', mixed: 'رنگی و سیاه‌سفید' } as const;
const SIDES = { double: 'دورو', single: 'یکرو' } as const;
const SIZE = { a4: 'A4', a5: 'A5', a3: 'A3' } as const;

/**
 * «سیاه‌سفید، دورو، A4» (اندازه از ۸٫۳، طرح میز)، و نام کاغذ فقط وقتی جز کاغذ پیش‌فرض است: «رنگی، دورو، A4، گلاسه».
 */
export const printLabel = (
  colorMode: keyof typeof COLOR,
  sidesMode: keyof typeof SIDES,
  paperSize: keyof typeof SIZE,
  paperName: string | null = null,
) => [COLOR[colorMode], SIDES[sidesMode], SIZE[paperSize], paperName].filter(Boolean).join('، ');

/**
 * قدم‌های سفارش: «۱ جزوه و قیمت ← ۲ آدرس ← ۳ پرداخت». قدم انجام‌شده تیک دارد و پیوند است، برای برگشتن
 * (هدف لمسی ۴۴)؛ بعد از پرداخت همه تیک و هیچ‌کدام پیوند نیست.
 */
export function FlowNav({
  current,
  onDesk,
  onAddress,
}: {
  /** قدم جاری؛ `done` یعنی پرداخت شده. */
  current: 1 | 2 | 3 | 'done';
  onDesk?: () => void;
  onAddress?: () => void;
}) {
  const steps = [
    { n: 1, label: 'جزوه و قیمت', go: onDesk },
    { n: 2, label: 'آدرس', go: onAddress },
    { n: 3, label: 'پرداخت', go: undefined },
  ] as const;
  return (
    <nav className="home-flow" aria-label="قدم‌های سفارش">
      <ol className="jy-flow">
        {steps.map(({ n, label, go }) => {
          const done = current === 'done' || n < current;
          if (!done) {
            return (
              <li key={n} aria-current={n === current ? 'step' : undefined}>
                <span className="jy-flow__n num">{n}</span>
                {label}
              </li>
            );
          }
          const mark = (
            <span className="jy-flow__n">
              <span className="jy-icon jy-icon-check" aria-hidden="true" />
            </span>
          );
          return (
            <li key={n} className="is-done">
              {go && current !== 'done' ? (
                <a
                  href="#"
                  onClick={(event: MouseEvent) => {
                    event.preventDefault();
                    go();
                  }}
                >
                  {mark}
                  {label}
                </a>
              ) : (
                <>
                  {mark}
                  {label}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * ردیف «گرد کردن» (برش ۸٫۴): وقتی تعرفه جمع را گرد می‌کند (`roundingStepRials`)، تا ردیف‌های خلاصه با جمع بخوانند؛ کم شدن با «−».
 * صفر و null هیچ. همان `roundingRials` ریز قیمت، بی حساب تازه (قاعدهٔ ۱).
 */
function RoundingLine({ rials }: { rials: number | null | undefined }) {
  if (!rials) return null;
  return (
    <div data-testid="summary-rounding">
      <dt>گرد کردن</dt>
      <dd className="num">
        {rials < 0 ? '−' : ''}
        {formatTomans(Math.abs(rials), false)}
      </dd>
    </div>
  );
}

/** ردیف ارسال خلاصه: «ارسال پست پیشتاز به مشهد» و کرایه‌اش؛ با ارسال رایگان (۱۱٫۴) کرایه صفر و کرایهٔ بخشیده خط‌خورده. */
export interface ShippingLine {
  label: string;
  rials: number;
  /** کرایه‌ای که ارسال رایگان بخشید؛ null یعنی ارسال رایگان نیست. */
  waivedRials?: number | null;
}

/** ردیف تخفیف خلاصه (برش ۱۱٫۴): نامش و مبلغش. */
export interface DiscountLine {
  label: ReactNode;
  rials: number;
}

/**
 * ردیف تخفیف از ریز قیمت (برش ۱۱٫۴، سؤال ۳۰۳): پلهٔ سفارش بزرگ با درصدش، یا کد؛ ارسال رایگانِ بی درصد ردیف خودش را ندارد، چون ردیف
 * ارسال «رایگان» است. همان مبلغ سرور، بی حساب تازه (قاعدهٔ ۱).
 */
export function discountLineOf(breakdown: Pick<Breakdown, 'discount' | 'discountRials'>): DiscountLine | null {
  const discount = breakdown.discount;
  if (!discount || breakdown.discountRials <= 0) return null;
  return {
    label:
      discount.source === 'tier' ? (
        <>
          تخفیف سفارش بزرگ (<span className="num">{formatNumber(discount.percent)}</span>٪)
        </>
      ) : (
        <>
          تخفیف کد <bdi dir="ltr">{discount.code}</bdi>
        </>
      ),
    rials: breakdown.discountRials,
  };
}

/** «۵٪ تخفیف»، «ارسال رایگان»، یا «۵٪ تخفیف و ارسال رایگان»: پاداش یک پلهٔ تخفیف سفارش بزرگ (۱۱٫۴)؛ میز و جدول تعرفهٔ صفحهٔ اصلی. */
export function tierReward(percent: number, freeShipping: boolean): ReactNode {
  const off =
    percent > 0 ? (
      <>
        <span className="num">{formatNumber(percent)}</span>٪ تخفیف
      </>
    ) : null;
  if (off && freeShipping) return <>{off} و ارسال رایگان</>;
  return off ?? 'ارسال رایگان';
}

/** ردیف ارسال از ریز قیمت و نام روش و جا؛ null تا کرایه معلوم نیست. */
export function shippingLineOf(breakdown: Pick<Breakdown, 'discount' | 'shippingRials'>, label: string): ShippingLine | null {
  if (breakdown.shippingRials === null) return null;
  const waived = breakdown.discount?.source === 'tier' && breakdown.discount.freeShipping ? breakdown.discount.waivedShippingRials : null;
  return { label, rials: breakdown.shippingRials, waivedRials: waived };
}

function DiscountRow({ line }: { line: DiscountLine | null | undefined }) {
  if (!line) return null;
  return (
    <div data-testid="summary-discount">
      <dt>{line.label}</dt>
      <dd className="num">−{formatTomans(line.rials, false)}</dd>
    </div>
  );
}

function ShippingRow({ line }: { line: ShippingLine | null | undefined }) {
  if (!line) return null;
  return (
    <div data-testid="summary-shipping">
      <dt>{line.label}</dt>
      {line.waivedRials != null ? (
        <dd>
          <s className="num">{formatTomans(line.waivedRials, false)}</s> رایگان
        </dd>
      ) : (
        <dd className="num">{formatTomans(line.rials, false)}</dd>
      )}
    </div>
  );
}

/**
 * ریز قیمت خلاصه: چاپ، کاغذ (اگر جدا حساب شده)، صحافی، تعداد، تخفیف (۱۱٫۴)، بعد از شهر ردیف ارسال، و گرد کردن اگر هست. همان ریز
 * قیمت سرور، بی حساب تازه (قاعدهٔ ۱).
 */
export function SummaryLines({
  item,
  print,
  bindingName,
  discount,
  shipping,
  rounding,
}: {
  item: ItemBreakdown;
  /** «سیاه‌سفید، دورو». */
  print: string;
  bindingName: string;
  /** تخفیف همان ریز قیمت (۱۱٫۴، `discountLineOf`). */
  discount?: DiscountLine | null;
  /** «ارسال پست پیشتاز به مشهد» و کرایه‌اش؛ null تا شهر معلوم نیست. */
  shipping?: ShippingLine | null;
  /** `roundingRials` همان ریز قیمتی که جمعش زیر این ردیف‌هاست (۸٫۴)؛ null یعنی نه. */
  rounding?: number | null;
}) {
  return (
    <dl className="home-sum__lines">
      <div>
        <dt>
          چاپ {print} · <span className="num">{formatNumber(item.printedSides)}</span> صفحه
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
          صحافی {bindingName} ·{' '}
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
      <DiscountRow line={discount} />
      <ShippingRow line={shipping} />
      <RoundingLine rials={rounding} />
    </dl>
  );
}

/** «سیاه‌سفید، دورو، A4، طلق و سیم»؛ کاغذ فقط وقتی جز کاغذ پیش‌فرض است (طرح میز، سؤال ۲۲۵). */
export function jozveSpecLabel(
  colorMode: keyof typeof COLOR,
  sidesMode: keyof typeof SIDES,
  paperSize: keyof typeof SIZE,
  bindingName: string,
  paperName: string | null = null,
): string {
  return [printLabel(colorMode, sidesMode, paperSize, paperName), bindingName].filter(Boolean).join('، ');
}

/** یک جزوه در خلاصهٔ سفارش چندجزوه (برش ۸٫۲). */
export interface JozveLine {
  /** شمارهٔ جزوه در سفارش، از ۱؛ جزوه‌ای که هنوز قیمت ندارد در خلاصه نیست، پس شماره از ترتیب ردیف‌ها نمی‌آید. */
  n: number;
  /** «سیاه‌سفید، دورو، A4، طلق و سیم» (`jozveSpecLabel`). */
  spec: string;
  pageCount: number;
  copies: number;
  /** قیمت همین جزوه، همهٔ نسخه‌ها؛ از همان ریز قیمت سفارش. */
  totalRials: number;
}

/**
 * خلاصهٔ سفارش چندجزوه (سؤال ۲۲۵): یک ردیف برای هر جزوه، «جزوهٔ 2» و زیرش مشخصات، صفحه و نسخه اگر بیش از یکی، با قیمت همان
 * جزوه؛ بعد از شهر ردیف ارسال. همان ریز قیمت سرور، بی حساب تازه (قاعدهٔ ۱).
 */
export function JozveLines({
  jozves,
  discount,
  shipping,
  rounding,
}: {
  jozves: readonly JozveLine[];
  /** همان `discount` ‏`SummaryLines` (۱۱٫۴). */
  discount?: DiscountLine | null;
  shipping?: ShippingLine | null;
  /** همان `rounding` ‏`SummaryLines` (۸٫۴). */
  rounding?: number | null;
}) {
  return (
    <dl className="home-sum__lines home-sum__lines--jozves">
      {jozves.map((jozve) => (
        <div key={jozve.n} data-testid="summary-jozve">
          <dt>
            <b className="home-sum__name">
              جزوهٔ <span className="num">{formatNumber(jozve.n)}</span>
            </b>
            <span className="home-sum__spec">
              {jozve.spec} · <span className="num">{formatNumber(jozve.pageCount)}</span> صفحه
              {jozve.copies > 1 ? (
                <>
                  {' · '}
                  <span className="num">{formatNumber(jozve.copies)}</span> نسخه
                </>
              ) : null}
            </span>
          </dt>
          <dd className="num">{formatTomans(jozve.totalRials, false)}</dd>
        </div>
      ))}
      <DiscountRow line={discount} />
      <ShippingRow line={shipping} />
      <RoundingLine rials={rounding} />
    </dl>
  );
}
