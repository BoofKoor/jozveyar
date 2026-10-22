/**
 * رسم بلوک‌های زنده و جدول‌های تعرفه (برش ۱۵٫۲، سؤال‌های ۴۵۶ و ۴۵۷؛ طرح `seo.html`): همان اجزا در صفحه‌های فرود، «تعرفه» و پیش‌نمایش پنل، با
 * کلاس‌های `@jozveyar/ui/blocks.css`. عدد همیشه در `.num` خودش و تومان (قاعدهٔ ۳: ریال تا لایهٔ نمایش). کامپوننت سرور، بی JS.
 */

import { Fragment, type ReactNode } from 'react';

import type { ColorMode, DiscountTier, PriceList } from '@jozveyar/contracts';
import { NONE_PAUSED, PAPER_SIZES, type PausedOptions } from '@jozveyar/pricing';
import { formatNumber, formatTomans } from '@jozveyar/text';

import {
  bindingTables,
  discountTiers,
  paperNotes,
  parseBlock,
  printTables,
  sampleQuote,
  shippingTable,
  vocabularyOf,
  zoneName,
  type BindingTable,
  type PaperNote,
  type PrintTable,
  type SampleResult,
  type ShippingTable,
} from './blocks.js';
import { NameText, TextContent } from './textContent.js';

/** آنچه بلوک‌ها از سایت امروز لازم دارند. */
export interface BlockData {
  priceList: PriceList;
  paused?: PausedOptions;
  /** سقف صفحهٔ هر فایل، همان سقف جزوهٔ نمونه. */
  maxPages: number;
  /** پیوند «همهٔ قیمت‌ها» زیر قیمت نمونه؛ در خود «تعرفه» و پیش‌نمایش پنل هیچ. */
  tariffHref?: string | null;
  /** کلاس عددهای زنده (پیش‌نمایش پنل: خط‌چین)؛ در سایت هیچ. */
  live?: string;
}

const COLOR_NAMES: Readonly<Record<ColorMode, string>> = { bw: 'سیاه‌سفید', color: 'رنگی' };

function Num({ value, live }: { value: number; live?: string | undefined }) {
  return <span className={live ? `num ${live}` : 'num'}>{formatNumber(value)}</span>;
}

function Tomans({ rials, live }: { rials: number; live?: string | undefined }) {
  return <span className={live ? `num ${live}` : 'num'}>{formatTomans(rials, false)}</span>;
}

/** «تا 150»، «151 تا 300»: بازهٔ برگ صحافی. */
function SheetRange({ min, max, first }: { min: number; max: number; first: boolean }) {
  return first && min <= 1 ? (
    <>
      تا <Num value={max} />
    </>
  ) : (
    <>
      <Num value={min} /> تا <Num value={max} />
    </>
  );
}

/** «تا 1 کیلو»، «1 تا 3 کیلو»، «بالای 3 کیلو»؛ وزنی که کیلوی درست نیست، به گرم. */
function WeightRange({ min, max }: { min: number; max: number | null }) {
  const unit = (grams: number) => (grams % 1000 === 0 ? { value: grams / 1000, unit: 'کیلو' } : { value: grams, unit: 'گرم' });
  if (max === null) {
    const low = unit(min);
    return (
      <>
        بالای <Num value={low.value} /> {low.unit}
      </>
    );
  }
  const high = unit(max);
  if (min === 0) {
    return (
      <>
        تا <Num value={high.value} /> {high.unit}
      </>
    );
  }
  const low = unit(min);
  return low.unit === high.unit ? (
    <>
      <Num value={low.value} /> تا <Num value={high.value} /> {high.unit}
    </>
  ) : (
    <>
      <Num value={low.value} /> {low.unit} تا <Num value={high.value} /> {high.unit}
    </>
  );
}

/** «تحریر 80 گرم، بی هزینهٔ جدا»؛ کاغذی که نرخ دارد با نرخ هر برگ. */
function PaperText({ papers }: { papers: readonly PaperNote[] }): ReactNode {
  return papers.map((paper, i) => {
    const free = paper.rates.every((rate) => rate.rials === 0);
    return (
      <Fragment key={paper.name}>
        {i > 0 ? ' ' : null}
        کاغذ <NameText text={paper.name} />
        {free ? (
          '، بی هزینهٔ جدا.'
        ) : (
          <>
            {'، '}
            {paper.rates.map((rate, j) => (
              <Fragment key={rate.size}>
                {j > 0 ? '، ' : null}
                <bdi>{rate.label}</bdi> <Tomans rials={rate.rials} /> تومان هر برگ
              </Fragment>
            ))}
            .
          </>
        )}
      </Fragment>
    );
  });
}

/** جدول چاپ هر رو یک اندازه (`[[تعرفه]]` و «تعرفه»). */
export function PrintTableView({ table, caption = 'hidden', live }: { table: PrintTable; caption?: 'hidden' | 'shown'; live?: string }) {
  return (
    <table className="tf-table">
      <caption className={caption === 'hidden' ? 'sr-only' : undefined}>
        قیمت چاپ هر رو، کاغذ <bdi>{table.label}</bdi>
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <bdi>{table.label}</bdi>
          </th>
          <th scope="col" className="tf-end">
            یکرو
          </th>
          <th scope="col" className="tf-end">
            دورو
          </th>
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.color}>
            <th scope="row">{COLOR_NAMES[row.color]}</th>
            <td className="tf-end">
              <Tomans rials={row.single} live={live} />
            </td>
            <td className="tf-end">
              <Tomans rials={row.double} live={live} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** جمله زیر جدول چاپ: واحد، دورو و کاغذها. */
export function PrintNote({ papers }: { papers: readonly PaperNote[] }) {
  return (
    <p className="tf-note">
      تومان، هر روی چاپ‌شده. در دورو هر برگ دو رو است. <PaperText papers={papers} />
    </p>
  );
}

/** جدول بازه‌های یک صحافی در یک اندازه. */
export function BindingTableView({ table, caption = 'hidden', live }: { table: BindingTable; caption?: 'hidden' | 'shown'; live?: string }) {
  const size = table.size === 'a4' ? null : table.label;
  return (
    <table className="tf-table">
      <caption className={caption === 'hidden' ? 'sr-only' : undefined}>
        {caption === 'hidden' ? 'قیمت صحافی ' : 'صحافی '}
        <NameText text={table.name} />
        {size ? (
          <>
            ، <bdi>{size}</bdi>
          </>
        ) : null}
        {caption === 'hidden' ? ' بر اساس شمار برگ' : null}
      </caption>
      <thead>
        <tr>
          <th scope="col">برگ</th>
          <th scope="col" className="tf-end">
            تومان
          </th>
        </tr>
      </thead>
      <tbody>
        {table.bands.map((band, i) => (
          <tr key={band.minSheets}>
            <td>
              <SheetRange min={band.minSheets} max={band.maxSheets} first={i === 0} />
            </td>
            <td className="tf-end">
              <Tomans rials={band.priceRials} live={live} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** «بالای 800 برگ خودکار چند جلد می‌شود، هر جلد با قیمت خودش.»، یا سقف صحافی‌ای که چند جلد نمی‌شود. */
export function BindingNote({ table }: { table: BindingTable }) {
  return table.splitsVolumes ? (
    <p className="tf-note">
      بالای <Num value={table.maxSheetsPerVolume} /> برگ خودکار چند جلد می‌شود، هر جلد با قیمت خودش.
    </p>
  ) : (
    <p className="tf-note">
      تا <Num value={table.maxSheetsPerVolume} /> برگ؛ جزوهٔ قطورتر با صحافی دیگری.
    </p>
  );
}

/** جدول کرایهٔ پست پیشتاز: هر بازهٔ وزن در هر منطقه. */
export function ShippingTableView({ table, caption = 'hidden', live }: { table: ShippingTable; caption?: 'hidden' | 'shown'; live?: string }) {
  return (
    <table className="tf-table">
      <caption className={caption === 'hidden' ? 'sr-only' : undefined}>
        {caption === 'hidden' ? 'کرایهٔ پست بر اساس وزن بسته و مقصد' : 'کرایهٔ پست پیشتاز'}
      </caption>
      <thead>
        <tr>
          <th scope="col">وزن بسته</th>
          {table.zones.map((zone) => (
            <th key={zone} scope="col" className="tf-end">
              {zoneName(zone)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.minGrams}>
            <td>
              <WeightRange min={row.minGrams} max={row.maxGrams} />
            </td>
            {row.rials.map((rials, i) => (
              <td key={table.zones[i]} className="tf-end">
                {rials === null ? '—' : <Tomans rials={rials} live={live} />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function tierText(tier: DiscountTier): ReactNode {
  if (tier.percent > 0 && tier.freeShipping) {
    return (
      <>
        <Num value={tier.percent} />٪ و ارسال رایگان
      </>
    );
  }
  return tier.percent > 0 ? (
    <>
      <Num value={tier.percent} />٪
    </>
  ) : (
    'ارسال رایگان'
  );
}

/** پله‌های تخفیف سفارش بزرگ؛ بی پله هیچ. */
export function TiersView({ tiers, caption = 'hidden', live }: { tiers: readonly DiscountTier[]; caption?: 'hidden' | 'shown'; live?: string }) {
  if (tiers.length === 0) return null;
  return (
    <table className="tf-table">
      <caption className={caption === 'hidden' ? 'sr-only' : undefined}>تخفیف سفارش بزرگ</caption>
      <thead>
        <tr>
          <th scope="col">جمع چاپ، کاغذ و صحافی</th>
          <th scope="col" className="tf-end">
            تخفیف
          </th>
        </tr>
      </thead>
      <tbody>
        {tiers.map((tier) => (
          <tr key={tier.fromRials}>
            <td>
              از <Tomans rials={tier.fromRials} live={live} /> تومان
            </td>
            <td className="tf-end">{tierText(tier)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** «جزوهٔ 200 صفحه‌ای، سیاه‌سفید و دورو، طلق و سیم»: همان که نوشته شد، با رنگ و رو همیشه. */
function SampleTitle({ result }: { result: SampleResult }) {
  const spec = result.ok ? result.quote.spec : null;
  if (!result.ok || !spec) return null;
  const { color, sides, size, bindingName, paperName } = result.quote;
  return (
    <p className="lp-sample__title">
      جزوهٔ <Num value={spec.pages} /> صفحه‌ای، {COLOR_NAMES[color]} و {sides === 'double' ? 'دورو' : 'یکرو'}
      {spec.size && size !== 'a4' ? (
        <>
          ، <bdi>{PAPER_SIZES[size].label}</bdi>
        </>
      ) : null}
      {spec.paper ? (
        <>
          ، <NameText text={paperName} />
        </>
      ) : null}
      {spec.binding ? (
        <>
          ، <NameText text={bindingName} />
        </>
      ) : null}
      {spec.copies > 1 ? (
        <>
          ، <Num value={spec.copies} /> نسخه
        </>
      ) : null}
    </p>
  );
}

/** «جزوهٔ 100 صفحه‌ای، A5 و دورو» برای نمونه‌ای که امروز قیمت ندارد: همان که نوشته شد. */
function OffTitle({ raw }: { raw: string }) {
  return (
    <p className="lp-sample__title">
      <TextContent text={raw.replace(/^قیمت\s*[:：]\s*/, 'جزوهٔ ')} />
    </p>
  );
}

/**
 * کارت «قیمت نمونه» (سؤال ۴۵۶): چاپ، کاغذ اگر نرخ دارد، صحافی با برگ و جلد، تخفیف اگر پله‌ای رسید، جمع، و با ارسال به هر منطقه؛ زیرش «از تعرفهٔ
 * امروز». گزینه‌ای که امروز نیست، همان کارت با «فعلاً ارائه نمی‌شود.» بی عدد.
 */
export function SampleCard({ raw, result, data, foot = true }: { raw: string; result: SampleResult; data: BlockData; foot?: boolean }) {
  if (!result.ok) {
    return (
      <div className="jy-card lp-sample lp-sample--off" data-sample="off">
        <OffTitle raw={raw} />
        <p className="lp-sample__foot">فعلاً ارائه نمی‌شود.</p>
      </div>
    );
  }
  const { breakdown, shipping } = result.quote;
  const item = breakdown.items[0]!;
  const live = data.live;
  const free = breakdown.discount?.source === 'tier' && breakdown.discount.freeShipping;
  return (
    <div className="jy-card lp-sample" data-sample="on">
      <SampleTitle result={result} />
      <dl className="lp-sample__rows">
        <div>
          <dt>
            چاپ <Num value={item.printedSides} /> رو
            {item.copies > 1 ? (
              <>
                ، <Num value={item.copies} /> نسخه
              </>
            ) : null}
          </dt>
          <dd>
            <Tomans rials={item.printRials} live={live} /> تومان
          </dd>
        </div>
        {item.paperRials > 0 ? (
          <div>
            <dt>
              کاغذ، <Num value={item.sheets} /> برگ
            </dt>
            <dd>
              <Tomans rials={item.paperRials} live={live} /> تومان
            </dd>
          </div>
        ) : null}
        <div>
          <dt>
            {item.volumes > 1 ? (
              <>
                صحافی، <Num value={item.volumes} /> جلد (
                {item.sheetsPerVolume.map((sheets, i) => (
                  <Fragment key={i}>
                    {i > 0 ? ' و ' : null}
                    <Num value={sheets} />
                  </Fragment>
                ))}{' '}
                برگ)
              </>
            ) : (
              <>
                صحافی، <Num value={item.sheets} /> برگ
              </>
            )}
          </dt>
          <dd>
            <Tomans rials={item.bindingRials} live={live} /> تومان
          </dd>
        </div>
        {breakdown.discountRials > 0 && breakdown.discount?.source === 'tier' ? (
          <div>
            <dt>
              تخفیف سفارش بزرگ، <Num value={breakdown.discount.percent} />٪
            </dt>
            <dd>
              <span className={live ? `num ${live}` : 'num'}>−{formatTomans(breakdown.discountRials, false)}</span> تومان
            </dd>
          </div>
        ) : null}
        {breakdown.roundingRials !== 0 ? (
          // گام گرد کردن تعرفه (۸٫۴)؛ بی این ردیف، ردیف‌ها با جمع نمی‌خواندند.
          <div>
            <dt>گرد کردن</dt>
            <dd>
              <span className={live ? `num ${live}` : 'num'}>
                {breakdown.roundingRials < 0 ? '−' : ''}
                {formatTomans(Math.abs(breakdown.roundingRials), false)}
              </span>{' '}
              تومان
            </dd>
          </div>
        ) : null}
        <div className="lp-sample__total">
          <dt>جمع</dt>
          <dd>
            <Tomans rials={breakdown.totalWithoutShippingRials} live={live} /> تومان
          </dd>
        </div>
      </dl>
      {free ? (
        <p className="lp-sample__ship">با ارسال رایگان، به هر شهری.</p>
      ) : shipping.every((zone) => zone.totalRials !== null) && shipping.length > 0 ? (
        <p className="lp-sample__ship">
          با ارسال:{' '}
          {shipping.map((zone, i) => (
            <Fragment key={zone.zoneId}>
              {i > 0 ? (i === shipping.length - 1 ? ' و ' : '، ') : null}
              {zoneName(zone.zoneId)} <Tomans rials={zone.totalRials!} live={live} />
            </Fragment>
          ))}{' '}
          تومان
        </p>
      ) : null}
      {foot ? (
        <p className="lp-sample__foot">
          از تعرفهٔ امروز؛ با تعرفهٔ تازه خودش عوض می‌شود.
          {data.tariffHref ? (
            <>
              {' '}
              <a className="jy-link" href={data.tariffHref}>
                همهٔ قیمت‌ها
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** یک بلوک زنده در متن صفحه؛ بلوک نادرست (فقط در پیش‌نویس) هیچ، چون انتشار بی خطاست. */
export function PageBlock({ raw, data }: { raw: string; data: BlockData }): ReactNode {
  const paused = data.paused ?? NONE_PAUSED;
  const { block } = parseBlock(raw, vocabularyOf(data.priceList), data.maxPages);
  if (!block) return null;
  switch (block.kind) {
    case 'tariff': {
      const tables = printTables(data.priceList, paused);
      return (
        <div className="lp-block" data-block="tariff">
          {tables.map((table) => (
            <PrintTableView key={table.size} table={table} caption="shown" {...(data.live ? { live: data.live } : {})} />
          ))}
          <PrintNote papers={paperNotes(data.priceList, paused)} />
        </div>
      );
    }
    case 'binding':
      return (
        <div className="lp-block" data-block="binding">
          {bindingTables(data.priceList, paused).map((table) => (
            <div key={`${table.id}:${table.size}`}>
              <BindingTableView table={table} caption="shown" {...(data.live ? { live: data.live } : {})} />
              <BindingNote table={table} />
            </div>
          ))}
        </div>
      );
    case 'shipping':
      return (
        <div className="lp-block" data-block="shipping">
          <ShippingTableView table={shippingTable(data.priceList)} caption="shown" {...(data.live ? { live: data.live } : {})} />
          <p className="tf-note">«تهران» یعنی استان تهران؛ میز سفارش وزن هر جزوه را خودش حساب می‌کند.</p>
        </div>
      );
    case 'discount': {
      const tiers = discountTiers(data.priceList);
      return tiers.length > 0 ? (
        <div className="lp-block" data-block="discount">
          <TiersView tiers={tiers} caption="shown" {...(data.live ? { live: data.live } : {})} />
        </div>
      ) : null;
    }
    case 'price':
      return <SampleCard raw={raw} result={sampleQuote(block.spec, data.priceList, paused)} data={data} />;
  }
}
