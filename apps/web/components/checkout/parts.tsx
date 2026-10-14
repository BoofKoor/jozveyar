import type { MouseEvent } from 'react';
import type { ItemBreakdown } from '@jozveyar/contracts';
import { formatNumber, formatTomans } from '@jozveyar/text';

/*
 * تکه‌های مشترک «جزوه و قیمت» و مسیر خرید (طرح `docs/ui/mockups/checkout.html`، چیدمان در app/checkout.css):
 * قدم‌های سفارش، جمع و ریز قیمت. نه hook دارند و نه API مرورگر، پس هم رابط پس از فایل (کلاینت) آنها را می‌گیرد و
 * هم صفحهٔ سفارش (کامپوننت سرور). تکه‌های مرور جدا در `recap.tsx`اند: این فایل در راه اولین قیمت است و هر خط
 * اضافه‌اش آنجا تجزیه و اجرا می‌شود. عدد تومان و جمع درشت در `sum.tsx`اند. رنگ فقط توکن، و `.num` فقط روی خود عدد.
 */

const COLOR = { color: 'رنگی', bw: 'سیاه‌سفید', mixed: 'رنگی و سیاه‌سفید' } as const;
const SIDES = { double: 'دورو', single: 'یکرو' } as const;

/** «سیاه‌سفید، دورو». */
export const printLabel = (colorMode: keyof typeof COLOR, sidesMode: keyof typeof SIDES) =>
  `${COLOR[colorMode]}، ${SIDES[sidesMode]}`;

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
 * ریز قیمت خلاصه: چاپ، کاغذ (اگر جدا حساب شده)، صحافی، تعداد، و بعد از شهر ردیف ارسال. همان ریز قیمت
 * سرور، بی حساب تازه (قاعدهٔ ۱).
 */
export function SummaryLines({
  item,
  print,
  bindingName,
  shipping,
}: {
  item: ItemBreakdown;
  /** «سیاه‌سفید، دورو». */
  print: string;
  bindingName: string;
  /** «ارسال پست پیشتاز به مشهد» و کرایه‌اش؛ null تا شهر معلوم نیست. */
  shipping?: { label: string; rials: number } | null;
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
      {shipping ? (
        <div data-testid="summary-shipping">
          <dt>{shipping.label}</dt>
          <dd className="num">{formatTomans(shipping.rials, false)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** «سیاه‌سفید، دورو، طلق و سیم»؛ کاغذ فقط وقتی جز کاغذ پیش‌فرض است (طرح میز، سؤال ۲۲۵). */
export function jozveSpecLabel(
  colorMode: keyof typeof COLOR,
  sidesMode: keyof typeof SIDES,
  bindingName: string,
  paperName: string | null = null,
): string {
  return [printLabel(colorMode, sidesMode), paperName, bindingName].filter(Boolean).join('، ');
}

/** یک جزوه در خلاصهٔ سفارش چندجزوه (برش ۸٫۲). */
export interface JozveLine {
  /** شمارهٔ جزوه در سفارش، از ۱؛ جزوه‌ای که هنوز قیمت ندارد در خلاصه نیست، پس شماره از ترتیب ردیف‌ها نمی‌آید. */
  n: number;
  /** «سیاه‌سفید، دورو، طلق و سیم» (`jozveSpecLabel`). */
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
export function JozveLines({ jozves, shipping }: { jozves: readonly JozveLine[]; shipping?: { label: string; rials: number } | null }) {
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
      {shipping ? (
        <div data-testid="summary-shipping">
          <dt>{shipping.label}</dt>
          <dd className="num">{formatTomans(shipping.rials, false)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
