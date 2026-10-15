'use client';

import type { ReactNode } from 'react';
import { formatNumber, formatTomans } from '@jozveyar/text';
import type { PaperSize, PriceList } from '@jozveyar/contracts';
import {
  PAPER_SIZES,
  bandPriceRials,
  bindingMisfit,
  offeredSizes,
  sheetsOf,
  volumesOf,
  type BindingMisfit,
  type PausedOptions,
} from '@jozveyar/pricing';
import { bindingsFor, papersFor, type Replacement } from '../lib/catalog';
import type { Sentence } from '../lib/fileCard';
import type { OrderConfig } from '../lib/orderConfig';
import { Inline } from './Inline';

/** قیمت سفارش و برگ‌های همین جزوه با یک انتخاب، از همان `quote()` قیمت اصلی (`OrderDesk`). */
export interface ConfigQuote {
  /** جمع سفارش بی ارسال؛ اثر هر گزینه روی همین جمع است. */
  totalRials: number;
  /** برگ‌های یک نسخهٔ همین جزوه. */
  sheets: number;
}

interface Props {
  /** انتخاب خود جزوه؛ هر تغییر از همین است، تا انتخابی که امروز نمی‌خورد (منگنهٔ جزوهٔ ۵۷ برگی) گم نشود. */
  config: OrderConfig;
  /** همان که قیمت می‌خورد (`effectiveConfig`، ۸٫۳): کاشی انتخاب‌شده همین است. */
  effective: OrderConfig;
  /** انتخاب‌هایی که جایشان را به پیش‌فرض دادند، با دلیل؛ یادداشت زیر همان ردیف. */
  replaced: readonly Replacement[];
  /** صفحه‌های جزوه، برای برگ و صحافی‌ای که نمی‌خورد. */
  pageCount: number;
  onChange: (next: OrderConfig) => void;
  priceList: PriceList;
  /**
   * قیمت سفارش وقتی همین جزوه انتخاب دیگری دارد، با همان `quote()` قیمت اصلی: اثر هر گزینه روی قیمت و برگ‌های یکرو و
   * دورو از همین می‌آید، نه از حسابی دیگر (قاعدهٔ ۱). null یعنی هنوز صفحه‌ای از این جزوه شمرده نشده.
   */
  quoteFor: (config: OrderConfig) => ConfigQuote | null;
  /** گزینه‌های موقتاً خاموش تعرفهٔ فعال (برش ۸٫۴، سؤال ۱۸۸): کاشی خاموش با «موقتاً در دسترس نیست»، بی اثر قیمت (سؤال ۲۲۰). */
  paused: PausedOptions;
  /**
   * صفحه‌های رنگی جزوه، کنار انتخاب رنگ (`colorHint` در lib/fileCard.ts): حکم قطعی فقط بعد از
   * بررسی همهٔ صفحه‌ها. رنگ برای کل جزوه یکی انتخاب می‌شود (ADR-030).
   */
  colorHint: Sentence;
}

interface Option<T extends string> {
  value: T;
  /** نام کاغذ و صحافی از تعرفه با `Inline` (رقم لاتین، «تحریر 80 گرم»، مثل صفحهٔ اصلی). */
  title: ReactNode;
  note?: ReactNode;
  disabled?: boolean;
}

/**
 * یک انتخاب با کاشی‌های رادیوی واقعی (`jy-tile` و `jy-radio`، طرح ز): کلید جهت بین گزینه‌ها
 * می‌رود و کلیک هر جای کاشی انتخابش می‌کند. زیر هر گزینهٔ دیگر اثرش روی قیمت می‌آید.
 */
function Tiles<T extends string>({
  legend,
  name,
  value,
  options,
  onSelect,
  effectOf,
  three = false,
  children,
}: {
  legend: string;
  name: string;
  value: T;
  options: Option<T>[];
  onSelect: (value: T) => void;
  /** اثر گزینهٔ دیگر روی قیمت، خط جدای زیر کاشی. */
  effectOf?: (value: T) => ReactNode;
  /** ردیف سه‌تایی از ۵۲۱ پیکسل (اندازهٔ کاغذ، سؤال ۲۲۱). */
  three?: boolean;
  children?: ReactNode;
}) {
  return (
    // جداکننده روی ظرف است، نه روی fieldset: legend همیشه روی لبهٔ بالای fieldset می‌نشیند
    <div className="home-field">
      <fieldset className="min-w-0">
        <legend className="home-field__label">{legend}</legend>
        <div className={three ? 'jy-tiles jy-tiles--3 home-tiles' : 'jy-tiles home-tiles'}>
          {options.map((option) => {
            const selected = option.value === value;
            const effect = selected || option.disabled ? null : effectOf?.(option.value);
            return (
              <label key={option.value} className="jy-tile">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={selected}
                  disabled={option.disabled}
                  onChange={() => onSelect(option.value)}
                  className="jy-radio"
                />
                <span className="jy-tile__title">{option.title}</span>
                {option.note ? <span className="jy-tile__note">{option.note}</span> : null}
                {effect ? <span className="jy-tile__delta">{effect}</span> : null}
              </label>
            );
          })}
        </div>
        {children}
      </fieldset>
    </div>
  );
}

/** «+48,000 تومان»، «همان قیمت»، «−48,000 تومان»: اثر یک انتخاب روی قیمت، فقط عدد در span خودش. */
export function PriceDelta({ rials }: { rials: number }) {
  if (rials === 0) return 'همان قیمت';
  return (
    <>
      <span className="num">
        {rials > 0 ? '+' : '−'}
        {formatTomans(Math.abs(rials), false)}
      </span>{' '}
      تومان
    </>
  );
}

/** «1,600 تومان هر صفحه»: فقط عدد در span خودش. */
function perPage(rials: number) {
  return (
    <>
      <span className="num">{formatTomans(rials, false)}</span> تومان هر صفحه
    </>
  );
}

/** «1,500 تومان هر برگ»، «45,000 تومان هر جلد»؛ صفر «بی هزینهٔ اضافه» (طرح میز). */
function perUnit(rials: number, unit: 'برگ' | 'جلد') {
  if (rials === 0) return 'بی هزینهٔ اضافه';
  return (
    <>
      <span className="num">{formatTomans(rials, false)}</span> تومان هر {unit}
    </>
  );
}

/** دلیل کاشی صحافی‌ای که به این جزوه نمی‌خورد (سؤال ۲۲۰): «تا 50 برگ؛ این جزوه 57 برگ است». */
function misfitNote(misfit: BindingMisfit, sheets: number) {
  const limit =
    misfit.reason === 'max' ? (
      <>
        تا <span className="num">{formatNumber(misfit.maxSheets)}</span> برگ
      </>
    ) : misfit.reason === 'min' ? (
      <>
        دست‌کم <span className="num">{formatNumber(misfit.minSheets)}</span> برگ
      </>
    ) : null;
  return (
    <>
      {limit}؛ این جزوه <span className="num">{formatNumber(sheets)}</span> برگ است
    </>
  );
}

/** یادداشت کاشی گزینه‌ای که موقتاً در دسترس نیست (برش ۸٫۴، طرح میز سؤال ۲۲۰). */
const PAUSED_NOTE = 'موقتاً در دسترس نیست';

/** «A4»، با جهت خودش در متن فارسی. */
function sizeName(size: PaperSize) {
  return <bdi>{PAPER_SIZES[size].label}</bdi>;
}

/**
 * یادداشت زیر ردیفی که انتخابش جایش را به پیش‌فرض داد (۸٫۳، سؤال ۲۲۴): چه نشد، چرا، و چه جایش آمد؛ کاشی همان پیش‌فرض
 * انتخاب‌شده است و تغییر دیگر همین‌جاست.
 */
function ReplacedHint({ replacement, priceList, sheets }: { replacement: Replacement; priceList: PriceList; sheets: number }) {
  let text: ReactNode;
  if (replacement.paused) {
    // گزینه‌ای که موقتاً در دسترس نیست (برش ۸٫۴، طرح میز سؤال ۲۲۴): با روشن شدن دوباره، انتخاب خود جزوه برمی‌گردد.
    text =
      replacement.field === 'paperSize' ? (
        <>
          اندازهٔ {sizeName(replacement.from)} موقتاً در دسترس نیست؛ این جزوه {sizeName(replacement.to)} شد.
        </>
      ) : replacement.field === 'paperTypeId' ? (
        <>
          کاغذ «<Inline text={priceList.paperTypes[replacement.from]?.nameFa ?? ''} />» موقتاً در دسترس نیست؛ کاغذ این جزوه «
          <Inline text={priceList.paperTypes[replacement.to]?.nameFa ?? ''} />» شد.
        </>
      ) : (
        <>
          <Inline text={priceList.bindingTypes[replacement.from]?.nameFa ?? ''} /> موقتاً در دسترس نیست؛ صحافی این جزوه «
          <Inline text={priceList.bindingTypes[replacement.to]?.nameFa ?? ''} />» شد. اگر صحافی دیگری می‌خواهی، همین‌جا عوض کن.
        </>
      );
  } else if (replacement.field === 'paperSize') {
    text = (
      <>
        اندازهٔ {sizeName(replacement.from)} دیگر ارائه نمی‌شود؛ این جزوه {sizeName(replacement.to)} شد.
      </>
    );
  } else if (replacement.field === 'paperTypeId') {
    const from = priceList.paperTypes[replacement.from];
    const to = priceList.paperTypes[replacement.to]?.nameFa ?? '';
    text = from?.enabled ? (
      <>
        کاغذ «<Inline text={from.nameFa} />» در این اندازه نیست؛ کاغذ این جزوه «<Inline text={to} />» شد.
      </>
    ) : (
      <>
        کاغذ پیشین این جزوه دیگر نیست؛ «<Inline text={to} />» جایش آمد.
      </>
    );
  } else {
    const from = priceList.bindingTypes[replacement.from];
    const to = priceList.bindingTypes[replacement.to]?.nameFa ?? '';
    const misfit = replacement.misfit;
    text =
      from && misfit?.reason === 'size' ? (
        <>
          صحافی «<Inline text={from.nameFa} />» در این اندازه نیست؛ صحافی این جزوه «<Inline text={to} />» شد.
        </>
      ) : from && misfit ? (
        <>
          «<Inline text={from.nameFa} />» {misfitNote(misfit, sheets)}؛ صحافی‌اش «<Inline text={to} />» شد.
        </>
      ) : (
        <>
          صحافی پیشین این جزوه دیگر نیست؛ «<Inline text={to} />» جایش آمد.
        </>
      );
  }
  return (
    <p data-testid={`replaced-${replacement.field}`} className="home-field__hint">
      <span className="jy-icon jy-icon-info" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}

/**
 * «تنظیمات چاپ» یک جزوه (طرح ز، docs/UI.md بخش ۴؛ طرح میز، قدم ۱۱): رنگ و یکرو یا دورو با کاشی؛ اندازهٔ کاغذ، کاغذ و
 * صحافی با کاشی وقتی بیش از یک گزینه دارند (سؤال ۲۲۰)، صحافی تنها به شکل متن؛ و شمارندهٔ یک‌تکهٔ تعداد نسخه (`jy-stepper`).
 * گزینه‌ای که این اندازه را ندارد اصلاً دیده نمی‌شود، و صحافی‌ای که به این جزوه نمی‌خورد با دلیلش خاموش است (`bindingMisfit`،
 * ۸٫۳). از ۸٫۲ درون کارت همان جزوه است (سؤال ۲۱۷)، پس سرش را کارت می‌گذارد (`JozveSettings`)؛ در هر لحظه فقط یکی روی صفحه
 * است، پس شناسه‌ها یکتا می‌مانند.
 */
export function ConfigPanel({ config, effective, replaced, pageCount, onChange, priceList, quoteFor, colorHint, paused }: Props) {
  const set = <K extends keyof OrderConfig>(key: K, value: OrderConfig[K]) => onChange({ ...config, [key]: value });
  const current = quoteFor(config);

  /** «+48,000 تومان»، «همان قیمت»، «−48,000 تومان»: قیمت جزوه با یک گزینهٔ دیگر، منهای قیمت امروز. */
  const effectOf =
    <K extends keyof OrderConfig>(key: K) =>
    (value: OrderConfig[K]): ReactNode => {
      const other = quoteFor({ ...config, [key]: value });
      if (!current || !other) return null;
      return <PriceDelta rials={other.totalRials - current.totalRials} />;
    };

  /** برگ‌های جزوه در یکرو یا دورو، از همان `quote()`. */
  const sheets = (sidesMode: OrderConfig['sidesMode']) => quoteFor({ ...config, sidesMode })?.sheets ?? 0;
  const [doubleSheets, singleSheets] = [sheets('double'), sheets('single')];
  /**
   * یادداشت کاشی یکرو و دورو، مثل طرح ز: برگ‌ها، و برای گزینهٔ دیگر اثرش روی قیمت در همان خط («120 برگ،
   * همان قیمت»)؛ دوروی انتخاب‌شده «جزوهٔ نازک‌تر». اثر رنگ جداست، چون عددش درشت است و خودش خبر است.
   */
  const sidesNote = (sidesMode: OrderConfig['sidesMode'], count: number) => {
    const effect = sidesMode === effective.sidesMode ? null : effectOf('sidesMode')(sidesMode);
    const thinner = sidesMode === 'double' && doubleSheets < singleSheets;
    return (
      <>
        <span className="num">{formatNumber(count)}</span> برگ
        {effect ? <>، {effect}</> : thinner ? '، جزوهٔ نازک‌تر' : null}
      </>
    );
  };

  const size = effective.paperSize;
  /** نرخ هر رو در همین اندازه و همین یکرو یا دورو. */
  const rates = priceList.printRates[size]?.[effective.sidesMode];
  const sizes = offeredSizes(priceList);
  const papers = papersFor(priceList, size);
  const bindings = bindingsFor(priceList, size);
  const jozveSheets = sheetsOf(pageCount, effective.sidesMode);
  const hint = (field: Replacement['field']) =>
    replaced
      .filter((replacement) => replacement.field === field)
      .map((replacement) => <ReplacedHint key={field} replacement={replacement} priceList={priceList} sheets={jozveSheets} />);
  /** یادداشت ردیفی که کاشی ندارد (یک گزینه): خانهٔ خودش، تا جداکنندهٔ ردیف‌ها سر جایش بماند. */
  const loneHint = (field: Replacement['field']) => {
    const hints = hint(field);
    return hints.length > 0 ? <div className="home-field">{hints}</div> : null;
  };

  return (
    <>
      <Tiles
        legend="رنگ چاپ"
        name="jozve-color"
        value={effective.colorMode}
        onSelect={(value) => set('colorMode', value)}
        effectOf={effectOf('colorMode')}
        options={[
          { value: 'bw', title: 'سیاه‌سفید', note: perPage(rates?.bw ?? 0) },
          { value: 'color', title: 'رنگی', note: perPage(rates?.color ?? 0) },
        ]}
      >
        <p data-testid="color-hint" className="home-field__hint">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>
            {colorHint.lead}
            {colorHint.count === null ? null : <span className="num">{formatNumber(colorHint.count)}</span>}
            {colorHint.rest}
          </span>
        </p>
      </Tiles>

      <Tiles
        legend="یکرو یا دورو"
        name="jozve-sides"
        value={effective.sidesMode}
        onSelect={(value) => set('sidesMode', value)}
        options={[
          { value: 'double', title: 'دورو', note: sidesNote('double', doubleSheets) },
          { value: 'single', title: 'یکرو', note: sidesNote('single', singleSheets) },
        ]}
      />

      {sizes.length > 1 ? (
        <Tiles
          legend="اندازهٔ کاغذ"
          name="jozve-size"
          value={size}
          onSelect={(value) => set('paperSize', value)}
          effectOf={effectOf('paperSize')}
          three
          options={sizes.map((option) => ({
            value: option,
            title: PAPER_SIZES[option].label,
            note: paused.sizes.has(option)
              ? PAUSED_NOTE
              : perPage(priceList.printRates[option]![effective.sidesMode][effective.colorMode]),
            disabled: paused.sizes.has(option),
          }))}
        >
          {hint('paperSize')}
        </Tiles>
      ) : (
        loneHint('paperSize')
      )}

      {papers.length > 1 ? (
        <Tiles
          legend="کاغذ"
          name="jozve-paper"
          value={effective.paperTypeId}
          onSelect={(value) => set('paperTypeId', value)}
          effectOf={effectOf('paperTypeId')}
          options={papers.map(([id, paper]) => ({
            value: id,
            title: <Inline text={paper.nameFa} />,
            note: paused.papers.has(id) ? PAUSED_NOTE : perUnit(paper.sheetRates[size] ?? 0, 'برگ'),
            disabled: paused.papers.has(id),
          }))}
        >
          {hint('paperTypeId')}
        </Tiles>
      ) : (
        loneHint('paperTypeId')
      )}

      {bindings.length > 1 ? (
        <Tiles
          legend="صحافی"
          name="jozve-binding"
          value={effective.bindingTypeId}
          onSelect={(value) => set('bindingTypeId', value)}
          effectOf={effectOf('bindingTypeId')}
          options={bindings.map(([id, binding]) => {
            const misfit = pageCount > 0 ? bindingMisfit(binding, size, jozveSheets) : null;
            const perVolume = bandPriceRials(volumesOf(binding, jozveSheets)[0] ?? 0, binding.bands[size] ?? []);
            return {
              value: id,
              title: <Inline text={binding.nameFa} />,
              note: paused.bindings.has(id)
                ? PAUSED_NOTE
                : misfit
                  ? misfitNote(misfit, jozveSheets)
                  : perVolume === null
                    ? null
                    : perUnit(perVolume, 'جلد'),
              disabled: paused.bindings.has(id) || misfit !== null,
            };
          })}
        >
          {hint('bindingTypeId')}
        </Tiles>
      ) : (
        // یک گزینه: متن، نه انتخابی که انتخاب نیست
        <div className="home-field home-row">
          <p className="home-field__label">صحافی</p>
          <p className="home-row__value">
            <span className="jy-icon jy-icon-binding" aria-hidden="true" />
            <Inline text={priceList.bindingTypes[effective.bindingTypeId]?.nameFa ?? ''} />
          </p>
          {hint('bindingTypeId')}
        </div>
      )}

      <div className="home-field home-row">
        <p id="copies-label" className="home-field__label">
          تعداد نسخه
        </p>
        {/* − و + بسته هم فوکوس را نگه می‌دارند (aria-disabled، نه disabled)، تا کلید پشت‌سرهم تا ۱ فوکوس را گم نکند */}
        <div className="jy-stepper" role="group" aria-labelledby="copies-label">
          <button
            type="button"
            aria-label="یکی کمتر"
            aria-disabled={config.copies <= 1}
            onClick={() => config.copies > 1 && set('copies', config.copies - 1)}
          >
            <span className="jy-icon jy-icon-minus" aria-hidden="true" />
          </button>
          <input
            id="copies"
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            aria-labelledby="copies-label"
            value={config.copies}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) set('copies', Math.min(1000, Math.max(1, Math.trunc(next))));
            }}
            className="num"
          />
          <button
            type="button"
            aria-label="یکی بیشتر"
            aria-disabled={config.copies >= 1000}
            onClick={() => config.copies < 1000 && set('copies', config.copies + 1)}
          >
            <span className="jy-icon jy-icon-plus" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
