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
    <div className="border-t border-hairline py-5 first:border-t-0 first:pt-0">
      <div className="mb-3">
        <h3 className="font-semibold text-ink">{label}</h3>
        {hint ? <p className="mt-1 text-sm text-ink-2">{hint}</p> : null}
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
            className={`flex flex-col items-start gap-0.5 rounded-lg border px-4 py-2.5 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? 'border-sage-deep bg-chip font-semibold text-ink'
                : 'border-hairline bg-card text-ink hover:border-sage-mid'
            }`}
          >
            <span>{option.label}</span>
            {option.note ? <span className="num text-xs text-ink-2">{option.note}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ConfigPanel({ config, onChange, priceList, colorPageCount }: Props) {
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
    <section className="rounded-card border border-hairline bg-card p-5 sm:p-6">
      <Field
        label="رنگ چاپ"
        hint={
          colorPageCount > 0
            ? `${formatNumber(colorPageCount)} صفحهٔ رنگی در فایل پیدا شد.`
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
            className="h-11 w-11 rounded-lg border border-hairline text-xl text-ink transition-colors hover:border-sage-mid disabled:opacity-40"
          >
            −
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
            className="num h-11 w-20 rounded-lg border border-hairline bg-card text-center text-lg font-semibold text-ink"
          />
          <button
            type="button"
            aria-label="یکی بیشتر"
            disabled={config.copies >= 1000}
            onClick={() => set('copies', Math.min(1000, config.copies + 1))}
            className="h-11 w-11 rounded-lg border border-hairline text-xl text-ink transition-colors hover:border-sage-mid disabled:opacity-40"
          >
            +
          </button>
        </div>
      </Field>
    </section>
  );
}
