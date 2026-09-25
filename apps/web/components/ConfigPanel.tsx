'use client';

import type { ReactNode } from 'react';
import { formatNumber, formatTomans } from '@jozveyar/text';
import type { Breakdown, PriceList } from '@jozveyar/contracts';
import type { Sentence } from '../lib/fileCard';
import type { OrderConfig } from '../lib/orderConfig';

interface Props {
  config: OrderConfig;
  onChange: (next: OrderConfig) => void;
  priceList: PriceList;
  /**
   * قیمت همین جزوه با انتخاب‌های دیگر، با همان `quote()` قیمت اصلی: اثر هر گزینه روی قیمت و برگ‌های
   * یکرو و دورو از همین می‌آید، نه از حسابی دیگر (قاعدهٔ ۱). null یعنی هنوز صفحه‌ای شمرده نشده.
   */
  quoteFor: (config: OrderConfig) => Breakdown | null;
  /**
   * صفحه‌های رنگی جزوه، کنار انتخاب رنگ (`colorHint` در lib/fileCard.ts): حکم قطعی فقط بعد از
   * بررسی همهٔ صفحه‌ها. رنگ برای کل جزوه یکی انتخاب می‌شود (ADR-030).
   */
  colorHint: Sentence;
}

interface Option<T extends string> {
  value: T;
  title: string;
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
  children,
}: {
  legend: string;
  name: string;
  value: T;
  options: Option<T>[];
  onSelect: (value: T) => void;
  /** اثر گزینهٔ دیگر روی قیمت، خط جدای زیر کاشی. */
  effectOf?: (value: T) => ReactNode;
  children?: ReactNode;
}) {
  return (
    // جداکننده روی ظرف است، نه روی fieldset: legend همیشه روی لبهٔ بالای fieldset می‌نشیند
    <div className="home-field">
      <fieldset className="min-w-0">
        <legend className="home-field__label">{legend}</legend>
        <div className="jy-tiles home-tiles">
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

/** «1,600 تومان هر صفحه»: فقط عدد در span خودش. */
function perPage(rials: number) {
  return (
    <>
      <span className="num">{formatTomans(rials, false)}</span> تومان هر صفحه
    </>
  );
}

/**
 * «تنظیمات چاپ» (طرح ز، docs/UI.md بخش ۴): رنگ و یکرو یا دورو با کاشی، صحافی به شکل متن وقتی یک
 * گزینه بیشتر ندارد، و شمارندهٔ یک‌تکهٔ تعداد نسخه (`jy-stepper`).
 */
export function ConfigPanel({ config, onChange, priceList, quoteFor, colorHint }: Props) {
  const set = <K extends keyof OrderConfig>(key: K, value: OrderConfig[K]) => onChange({ ...config, [key]: value });
  const current = quoteFor(config);

  /** «+48,000 تومان»، «همان قیمت»، «−48,000 تومان»: قیمت جزوه با یک گزینهٔ دیگر، منهای قیمت امروز. */
  const effectOf =
    <K extends keyof OrderConfig>(key: K) =>
    (value: OrderConfig[K]): ReactNode => {
      const other = quoteFor({ ...config, [key]: value });
      if (!current || !other) return null;
      const deltaRials = other.totalWithoutShippingRials - current.totalWithoutShippingRials;
      if (deltaRials === 0) return 'همان قیمت';
      return (
        <>
          <span className="num">
            {deltaRials > 0 ? '+' : '−'}
            {formatTomans(Math.abs(deltaRials), false)}
          </span>{' '}
          تومان
        </>
      );
    };

  /** برگ‌های جزوه در یکرو یا دورو، از همان `quote()`. */
  const sheets = (sidesMode: OrderConfig['sidesMode']) => quoteFor({ ...config, sidesMode })?.items[0]?.sheets ?? 0;
  const [doubleSheets, singleSheets] = [sheets('double'), sheets('single')];
  /**
   * یادداشت کاشی یکرو و دورو، مثل طرح ز: برگ‌ها، و برای گزینهٔ دیگر اثرش روی قیمت در همان خط («120 برگ،
   * همان قیمت»)؛ دوروی انتخاب‌شده «جزوهٔ نازک‌تر». اثر رنگ جداست، چون عددش درشت است و خودش خبر است.
   */
  const sidesNote = (sidesMode: OrderConfig['sidesMode'], count: number) => {
    const effect = sidesMode === config.sidesMode ? null : effectOf('sidesMode')(sidesMode);
    const thinner = sidesMode === 'double' && doubleSheets < singleSheets;
    return (
      <>
        <span className="num">{formatNumber(count)}</span> برگ
        {effect ? <>، {effect}</> : thinner ? '، جزوهٔ نازک‌تر' : null}
      </>
    );
  };

  const bindings = Object.entries(priceList.bindingTypes).filter(([, binding]) => binding.enabled);
  const papers = Object.entries(priceList.paperTypes);

  return (
    <section className="jy-card" aria-labelledby="print-title">
      <h2 id="print-title" className="jy-card__title">
        تنظیمات چاپ
      </h2>

      <Tiles
        legend="رنگ چاپ"
        name="jozve-color"
        value={config.colorMode}
        onSelect={(value) => set('colorMode', value)}
        effectOf={effectOf('colorMode')}
        options={[
          { value: 'bw', title: 'سیاه‌سفید', note: perPage(priceList.clickRates.bw ?? 0) },
          { value: 'color', title: 'رنگی', note: perPage(priceList.clickRates.color ?? 0) },
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
        value={config.sidesMode}
        onSelect={(value) => set('sidesMode', value)}
        options={[
          { value: 'double', title: 'دورو', note: sidesNote('double', doubleSheets) },
          { value: 'single', title: 'یکرو', note: sidesNote('single', singleSheets) },
        ]}
      />

      {bindings.length > 1 ? (
        <Tiles
          legend="صحافی"
          name="jozve-binding"
          value={config.bindingTypeId}
          onSelect={(value) => set('bindingTypeId', value)}
          effectOf={effectOf('bindingTypeId')}
          options={bindings.map(([id, binding]) => ({ value: id, title: binding.nameFa }))}
        />
      ) : (
        // یک گزینه: متن، نه انتخابی که انتخاب نیست
        <div className="home-field home-row">
          <p className="home-field__label">صحافی</p>
          <p className="home-row__value">
            <span className="jy-icon jy-icon-binding" aria-hidden="true" />
            {priceList.bindingTypes[config.bindingTypeId]?.nameFa}
          </p>
        </div>
      )}

      {papers.length > 1 ? (
        <Tiles
          legend="کاغذ"
          name="jozve-paper"
          value={config.paperTypeId}
          onSelect={(value) => set('paperTypeId', value)}
          effectOf={effectOf('paperTypeId')}
          options={papers.map(([id, paper]) => ({ value: id, title: paper.nameFa, disabled: !paper.enabled }))}
        />
      ) : null}

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
    </section>
  );
}
