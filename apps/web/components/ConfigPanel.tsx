'use client';

import { formatNumber, formatTomans } from '@jozveyar/text';
import type { ColorMode, PriceList, SidesMode } from '@jozveyar/contracts';

export interface OrderConfig {
  colorMode: ColorMode;
  sidesMode: SidesMode;
  bindingTypeId: string;
  paperTypeId: string;
  copies: number;
}

interface Props {
  config: OrderConfig;
  onChange: (next: OrderConfig) => void;
  priceList: PriceList;
  /** برای نشان دادن اثر انتخاب رنگ روی قیمت، قبل از انتخاب. */
  colorPageCount: number;
  /** فایل‌های جزوه؛ رنگ برای کل جزوه یکی انتخاب می‌شود (ADR-030). */
  fileCount?: number;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="mb-3">
        <h3 className="font-semibold text-ink">{label}</h3>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  options,
  value,
  onSelect,
  name,
}: {
  options: { value: T; label: string; note?: string; disabled?: boolean }[];
  value: T;
  onSelect: (value: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onSelect(option.value)}
            className={`flex flex-col items-start gap-0.5 rounded-md text-start text-ink transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-green-50 disabled:text-green-500 ${
              selected
                ? 'border-2 border-accent bg-green-50 px-[15px] py-[9px] font-semibold'
                : 'border border-line bg-card px-4 py-2.5 hover:border-green-400'
            }`}
          >
            <span>{option.label}</span>
            {option.note ? <span className="num text-xs text-muted">{option.note}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ConfigPanel({ config, onChange, priceList, colorPageCount, fileCount = 1 }: Props) {
  const where = fileCount > 1 ? 'در فایل‌های این جزوه' : 'در فایل';
  const set = <K extends keyof OrderConfig>(key: K, value: OrderConfig[K]) =>
    onChange({ ...config, [key]: value });

  const bindingOptions = Object.entries(priceList.bindingTypes).map(([id, binding]) => ({
    value: id,
    label: binding.nameFa,
    disabled: !binding.enabled,
    note: binding.enabled ? undefined : 'فعلاً موجود نیست',
  }));

  const paperOptions = Object.entries(priceList.paperTypes).map(([id, paper]) => ({
    value: id,
    label: paper.nameFa,
    disabled: !paper.enabled,
  }));

  return (
    <section className="jy-card">
      <Field
        label="رنگ چاپ"
        hint={
          colorPageCount > 0
            ? `${formatNumber(colorPageCount)} صفحهٔ رنگی ${where} پیدا شد.`
            : fileCount > 1
              ? 'تا اینجا صفحهٔ رنگی‌ای پیدا نشد.'
              : 'فایل تماماً سیاه‌سفید است.'
        }
      >
        <Choice
          name="رنگ چاپ"
          value={config.colorMode}
          onSelect={(value) => set('colorMode', value)}
          options={[
            {
              value: 'bw',
              label: 'سیاه‌سفید',
              note: `${formatTomans(priceList.clickRates.bw ?? 0, false)} هر صفحه`,
            },
            {
              value: 'color',
              label: 'رنگی',
              note: `${formatTomans(priceList.clickRates.color ?? 0, false)} هر صفحه`,
            },
          ]}
        />
      </Field>

      <Field label="یکرو یا دورو" hint="دورو نصف کاغذ مصرف می‌کند و جزوه نازک‌تر می‌شود.">
        <Choice
          name="یکرو یا دورو"
          value={config.sidesMode}
          onSelect={(value) => set('sidesMode', value)}
          options={[
            { value: 'double', label: 'دورو' },
            { value: 'single', label: 'یکرو' },
          ]}
        />
      </Field>

      <Field label="صحافی">
        <Choice
          name="صحافی"
          value={config.bindingTypeId}
          onSelect={(value) => set('bindingTypeId', value)}
          options={bindingOptions}
        />
      </Field>

      {paperOptions.length > 1 ? (
        <Field label="کاغذ">
          <Choice
            name="کاغذ"
            value={config.paperTypeId}
            onSelect={(value) => set('paperTypeId', value)}
            options={paperOptions}
          />
        </Field>
      ) : null}

      <Field label="تعداد نسخه">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="یکی کمتر"
            disabled={config.copies <= 1}
            onClick={() => set('copies', Math.max(1, config.copies - 1))}
            className="jy-btn jy-btn--secondary jy-btn--icon"
          >
            <span className="jy-icon jy-icon-minus" aria-hidden="true" />
          </button>
          <input
            id="copies"
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={config.copies}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) set('copies', Math.min(1000, Math.max(1, Math.trunc(next))));
            }}
            className="jy-input num w-20 text-center text-lg font-semibold"
          />
          <button
            type="button"
            aria-label="یکی بیشتر"
            disabled={config.copies >= 1000}
            onClick={() => set('copies', Math.min(1000, config.copies + 1))}
            className="jy-btn jy-btn--secondary jy-btn--icon"
          >
            <span className="jy-icon jy-icon-plus" aria-hidden="true" />
          </button>
        </div>
      </Field>
    </section>
  );
}
