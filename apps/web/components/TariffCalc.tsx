'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { CatalogPaused, ItemBreakdown, PriceList } from '@jozveyar/contracts';
import { PAPER_SIZES, freeShippingOf, minOrderGapRials, offeredSizes, pausedOf, quote } from '@jozveyar/pricing';
import { formatNumber, formatTomans } from '@jozveyar/text';

import { bindingsFor, effectiveConfig, papersFor } from '../lib/catalog';
import { INITIAL_CONFIG, type OrderConfig } from '../lib/orderConfig';
import { calcSpec, readPages } from '../lib/tariffCalc';
import { ConfigPanel, type ConfigQuote } from './ConfigPanel';
import { Inline } from './Inline';

/** یک منطقهٔ کرایهٔ پست پیشتاز، با نامش («تهران» یعنی استان تهران). */
export interface CalcZone {
  id: string;
  name: string;
}

interface Props {
  /** تعرفهٔ فعال و گزینه‌های موقتاً خاموشش، همان که صفحه با ISR از پایگاه داده خواند (`siteTariff`). */
  priceList: PriceList;
  paused: CatalogPaused;
  /** سقف صفحهٔ هر فایل (`file.max_pages`)، سقف «چند صفحه؟». */
  maxPages: number;
  /** منطقه‌های کرایه به ترتیب تعرفه؛ روی سرور ساخته می‌شود، چون `@jozveyar/content` در باندل مرورگر نیست. */
  zones: readonly CalcZone[];
  /** شمار صفحهٔ اول (سؤال ۴۵۸: 120)، که HTML صفحه با آن رسم می‌شود. */
  initialPages: number;
}

const COLOR_NAMES = { bw: 'سیاه‌سفید', color: 'رنگی' } as const;
const SIDES_NAMES = { single: 'یکرو', double: 'دورو' } as const;

function Num({ value }: { value: number }) {
  return <span className="num">{formatNumber(value)}</span>;
}

function Tomans({ rials }: { rials: number }) {
  return (
    <>
      <span className="num">{formatTomans(rials, false)}</span> تومان
    </>
  );
}

/** «2 جلد (550 و 550 برگ)» یا «100 برگ». */
function SheetsText({ item }: { item: ItemBreakdown }) {
  if (item.volumes <= 1) {
    return (
      <>
        <Num value={item.sheets} /> برگ
      </>
    );
  }
  return (
    <>
      <Num value={item.volumes} /> جلد (
      {item.sheetsPerVolume.map((sheets, i) => (
        <span key={i}>
          {i > 0 ? ' و ' : null}
          <Num value={sheets} />
        </span>
      ))}{' '}
      برگ)
    </>
  );
}

/** «یک جلد 550 برگی» یا «2 جلد (550 و 550 برگ)»، برای یادداشت گزینهٔ ارزان‌تر. */
function VolumesText({ item }: { item: ItemBreakdown }) {
  return item.volumes <= 1 ? (
    <>
      یک جلد <Num value={item.sheets} /> برگی
    </>
  ) : (
    <SheetsText item={item} />
  );
}

function Row({ label, children, total = false }: { label: ReactNode; children: ReactNode; total?: boolean }) {
  return (
    <div className={total ? 'tf-row tf-row--total' : 'tf-row'}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

/** «اندازهٔ A4، کاغذ تحریر 80 گرم و صحافی طلق و سیم»: ردیف‌هایی که امروز فقط یک گزینه دارند و کاشی ندارند (سؤال ۴۵۸). */
function fixedParts(list: PriceList, config: OrderConfig): ReactNode[] {
  const parts: ReactNode[] = [];
  if (offeredSizes(list).length <= 1) {
    parts.push(
      <>
        اندازهٔ <bdi>{PAPER_SIZES[config.paperSize].label}</bdi>
      </>,
    );
  }
  if (papersFor(list, config.paperSize).length <= 1) {
    parts.push(
      <>
        کاغذ <Inline text={list.paperTypes[config.paperTypeId]?.nameFa ?? ''} />
      </>,
    );
  }
  if (bindingsFor(list, config.paperSize).length <= 1) {
    parts.push(
      <>
        صحافی <Inline text={list.bindingTypes[config.bindingTypeId]?.nameFa ?? ''} />
      </>,
    );
  }
  return parts;
}

function joined(parts: readonly ReactNode[]): ReactNode {
  return parts.map((part, i) => (
    <span key={i}>
      {i === 0 ? null : i === parts.length - 1 ? ' و ' : '، '}
      {part}
    </span>
  ));
}

/**
 * ماشین‌حساب «تعرفه» (برش ۱۵٫۲، سؤال ۴۵۸؛ طرح `seo.html`): «چند صفحه؟» و همان کاشی‌ها و یادداشت‌های میز سفارش (`ConfigPanel`: رنگ برای کل
 * جزوه، یکرو یا دورو، و اندازه، کاغذ و صحافی فقط با بیش از یک گزینهٔ روشن، و تعداد نسخه)، و نتیجه همان لحظه با همان `quote()` و همان جایگزینی
 * گزینهٔ نخورده (`effectiveConfig`): پس عدد ماشین‌حساب همان عدد میز است (قاعدهٔ ۱). کرایهٔ هر منطقه با وزن همین جزوه، یادداشت وقتی یکرو یا دوروی
 * دیگر با ارسال ارزان‌تر است، و «فایلت را بینداز» به صفحهٔ اصلی.
 *
 * تنها جزیرهٔ کلاینت «تعرفه»، در تکهٔ JS همان صفحه؛ HTML صفحه با ۱۲۰ صفحه رسم می‌شود، پس بی JS هم عدد دارد. شمار صفحه بیرون از ۱ تا سقف عددی
 * نمی‌دهد و کاشی‌ها با آخرین شمار درست می‌مانند.
 */
export function TariffCalc({ priceList, paused: pausedLists, maxPages, zones, initialPages }: Props) {
  const [text, setText] = useState(String(initialPages));
  const [pages, setPages] = useState(initialPages);
  const [config, setConfig] = useState<OrderConfig>(INITIAL_CONFIG);
  const paused = useMemo(() => pausedOf(priceList, pausedLists), [priceList, pausedLists]);
  const valid = readPages(text, maxPages) !== null;

  const priced = useCallback((next: OrderConfig) => effectiveConfig(next, priceList, pages, paused), [priceList, pages, paused]);
  const { config: effective, replaced } = priced(config);

  const quoteFor = useCallback(
    (next: OrderConfig): ConfigQuote => {
      const breakdown = quote(calcSpec(priced(next).config, pages, null), priceList);
      return { totalRials: breakdown.totalWithoutShippingRials, sheets: breakdown.items[0]!.sheets };
    },
    [priced, pages, priceList],
  );

  const breakdown = quote(calcSpec(effective, pages, null), priceList);
  const item = breakdown.items[0]!;
  const shipped = zones.map((zone) => ({ zone, breakdown: quote(calcSpec(effective, pages, zone.id), priceList) }));
  const gapRials = minOrderGapRials(breakdown, priceList);

  // یکرو یا دوروی دیگر، با ارسال به منطقهٔ اول: وزن هم عوض می‌شود، که اثر کاشی (بی ارسال) نمی‌گوید.
  const otherSides = effective.sidesMode === 'double' ? 'single' : 'double';
  const first = shipped[0];
  const other = first ? quote(calcSpec(priced({ ...config, sidesMode: otherSides }).config, pages, first.zone.id), priceList) : null;
  const cheaper =
    first && other && first.breakdown.shippingRials !== null && other.shippingRials !== null && other.totalRials < first.breakdown.totalRials
      ? { breakdown: other, savedRials: first.breakdown.totalRials - other.totalRials }
      : null;

  const fixed = fixedParts(priceList, effective);
  const bindingName = priceList.bindingTypes[effective.bindingTypeId]?.nameFa ?? '';
  const paperName = priceList.paperTypes[effective.paperTypeId]?.nameFa ?? '';
  const discount = breakdown.discount?.source === 'tier' && breakdown.discountRials > 0 ? breakdown.discount : null;

  return (
    <section className="jy-card tf-calc" aria-labelledby="calc-title" data-testid="tariff-calc">
      <div className="tf-calc__form">
        <div>
          <h2 id="calc-title" className="jy-card__title">
            ماشین‌حساب، بی فایل
          </h2>
          <p className="tf-calc__sub">فایل دستت نیست؟ چند عدد بده. با فایل، صفحه‌ها و صفحه‌های رنگی را خودمان می‌شماریم.</p>
        </div>
        <div className="jy-field tf-calc__pagesfield">
          <label className="jy-label" htmlFor="calc-pages">
            چند صفحه؟
          </label>
          <input
            id="calc-pages"
            className="jy-input num"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            aria-invalid={valid ? undefined : true}
            aria-describedby={valid ? undefined : 'calc-pages-error'}
            onChange={(event) => {
              setText(event.target.value);
              const next = readPages(event.target.value, maxPages);
              if (next !== null) setPages(next);
            }}
          />
          {valid ? null : (
            <p id="calc-pages-error" className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                یک عدد از <Num value={1} /> تا <Num value={maxPages} /> بنویس.
              </span>
            </p>
          )}
        </div>
        <ConfigPanel
          config={config}
          effective={effective}
          replaced={replaced}
          pageCount={pages}
          onChange={setConfig}
          priceList={priceList}
          quoteFor={quoteFor}
          paused={paused}
          colorHint={{ lead: 'برای کل جزوه، مثل میز سفارش؛ فایل که بیندازی، شمار صفحه‌های رنگی‌اش را هم می‌گوییم.', count: null, rest: '' }}
          bare
        />
        {fixed.length > 0 ? (
          <p className="tf-calc__fixed" data-testid="calc-fixed">
            <span className="jy-icon jy-icon-info" aria-hidden="true" />
            <span>{joined(fixed)}؛ امروز گزینهٔ دیگری در تعرفه نیست.</span>
          </p>
        ) : null}
      </div>

      <div className="tf-calc__out" aria-live="polite" data-testid="calc-out">
        {valid ? (
          <>
            <h3>
              جزوهٔ <Num value={pages} /> صفحه‌ای
              {effective.paperSize === 'a4' ? null : (
                <>
                  ، <bdi>{PAPER_SIZES[effective.paperSize].label}</bdi>
                </>
              )}
              {effective.sidesMode === 'single' ? '، یکرو' : null}
              {effective.copies > 1 ? (
                <>
                  ، <Num value={effective.copies} /> نسخه
                </>
              ) : null}
            </h3>
            <Row
              label={
                <>
                  چاپ <Num value={item.printedSides} /> رو، {COLOR_NAMES[effective.colorMode]}
                </>
              }
            >
              <Tomans rials={item.printRials} />
            </Row>
            {item.paperRials > 0 ? (
              <Row
                label={
                  <>
                    کاغذ <Inline text={paperName} />، <Num value={item.sheets} /> برگ
                  </>
                }
              >
                <Tomans rials={item.paperRials} />
              </Row>
            ) : null}
            <Row
              label={
                <>
                  صحافی <Inline text={bindingName} />، <SheetsText item={item} />
                </>
              }
            >
              <Tomans rials={item.bindingRials} />
            </Row>
            {discount ? (
              <Row
                label={
                  <>
                    تخفیف سفارش بزرگ، <Num value={discount.percent} />٪
                  </>
                }
              >
                <span className="num">−{formatTomans(breakdown.discountRials, false)}</span> تومان
              </Row>
            ) : null}
            {breakdown.roundingRials !== 0 ? (
              <Row label="گرد کردن">
                <span className="num">
                  {breakdown.roundingRials < 0 ? '−' : ''}
                  {formatTomans(Math.abs(breakdown.roundingRials), false)}
                </span>{' '}
                تومان
              </Row>
            ) : null}
            <Row label="جمع" total>
              <span data-testid="calc-total">
                <Tomans rials={breakdown.totalWithoutShippingRials} />
              </span>
            </Row>
            {freeShippingOf(breakdown) ? (
              <p className="tf-ship">با ارسال رایگان، به هر شهری.</p>
            ) : shipped.length > 0 && shipped.every(({ breakdown: withShipping }) => withShipping.shippingRials !== null) ? (
              <p className="tf-ship" data-testid="calc-ship">
                با ارسال:{' '}
                {shipped.map(({ zone, breakdown: withShipping }, i) => (
                  <span key={zone.id}>
                    {i === 0 ? null : i === shipped.length - 1 ? ' و ' : '، '}
                    {zone.name} <span className="num">{formatTomans(withShipping.totalRials, false)}</span>
                  </span>
                ))}{' '}
                تومان
              </p>
            ) : null}
            {gapRials > 0 ? (
              <p className="jy-note jy-note--info" data-testid="calc-min">
                <span className="jy-icon jy-icon-info" aria-hidden="true" />
                <span>
                  تا حداقل سفارش <Tomans rials={gapRials} /> مانده.
                </span>
              </p>
            ) : null}
            {cheaper && first ? (
              <p className="jy-note jy-note--info" data-testid="calc-cheaper">
                <span className="jy-icon jy-icon-info" aria-hidden="true" />
                <span>
                  {SIDES_NAMES[otherSides]}: <VolumesText item={cheaper.breakdown.items[0]!} />
                  {otherSides === 'double' ? ' و بستهٔ سبک‌تر' : null}؛ با ارسال به {first.zone.name} <Tomans rials={cheaper.breakdown.totalRials} />،{' '}
                  <Tomans rials={cheaper.savedRials} /> کمتر.
                </span>
              </p>
            ) : null}
          </>
        ) : (
          <p className="tf-note">قیمت با شمار صفحه‌ها می‌آید.</p>
        )}
        <p className="tf-note">قیمت دقیق جزوهٔ خودت، با شمار صفحه‌های رنگی، با انداختن فایل:</p>
        <a className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block" href="/">
          <span className="jy-icon jy-icon-upload" aria-hidden="true" />
          فایلت را بینداز
        </a>
      </div>
    </section>
  );
}
