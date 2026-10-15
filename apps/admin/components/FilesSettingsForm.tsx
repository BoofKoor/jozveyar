'use client';

import { useActionState } from 'react';

import type { FileRules } from '@jozveyar/contracts/files';
import { formatNumber } from '@jozveyar/text';

import { saveFilesAction, type FilesState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { FAMILY_NAMES, formatsSeen } from '../lib/settings';

interface Props {
  gate: string;
  /** همان که صفحه نشان داد؛ «همان که دیده شد». */
  files: FileRules;
  /** بازهٔ قرارداد هر عدد (`SETTING_SCHEMAS`)، از صفحه؛ پیام خطا با آن. */
  maxMbError: string;
  maxPagesError: string;
}

const FAMILIES = ['word', 'slides', 'image'] as const;

/**
 * کارت «فایل‌ها» (برش ۸٫۴، سؤال ۱۹۰): فرمت‌هایی که سایت می‌پذیرد (PDF همیشه؛ Word، پاورپوینت و عکس هر کدام با تیک)، سقف حجم و سقف
 * صفحهٔ هر فایل، با یک «ذخیره». مرورگر مشتری همان لحظهٔ انداختن می‌سنجد و سرور آپلود و مسیر خرید دوباره. خطای هر عدد زیر خودش با
 * نوشته‌ها؛ مقدارهایی که صفحه نشان داد با فرم می‌روند.
 */
export function FilesSettingsForm({ gate, files, maxMbError, maxPagesError }: Props) {
  const [state, action, pending] = useActionState<FilesState, FormData>(saveFilesAction, {});
  const bad = (name: 'maxMb' | 'maxPages') => state.error === 'invalid_setting' && (state.invalid ?? []).includes(name);
  const general = state.error && state.error !== 'invalid_setting' ? messageOf(state.error) : null;
  const checked = (family: (typeof FAMILIES)[number]) => state.values?.[family] ?? files.formats[family];

  return (
    <section id="files" className="jy-card" aria-labelledby="t-files" data-setting="file.rules">
      <h2 id="t-files" className="jy-card__title">
        فایل‌ها
      </h2>
      <form action={action} noValidate>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="seenFormats" value={formatsSeen(files.formats)} />
        <input type="hidden" name="seenMaxMb" value={files.maxMb} />
        <input type="hidden" name="seenMaxPages" value={files.maxPages} />
        {general ? (
          <p className="jy-note jy-note--error ad-gap" role="alert">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            <span>{general}</span>
          </p>
        ) : null}
        <div className="ad-form">
          <fieldset className="jy-field" aria-describedby="s-formats-hint">
            <legend className="jy-label">فرمت‌هایی که پذیرفته می‌شوند</legend>
            <div className="ad-toggles">
              {FAMILIES.map((family) => (
                <label key={family} className="ad-size__toggle">
                  <input type="checkbox" className="ad-check" name={family} defaultChecked={checked(family)} />
                  {FAMILY_NAMES[family].name} <span className="ad-muted">({FAMILY_NAMES[family].detail})</span>
                </label>
              ))}
            </div>
            <p id="s-formats-hint" className="jy-hint">
              PDF همیشه پذیرفته است. فرمت خاموش در کارت بارگذاری و انتخاب فایل سایت نمی‌آید، و فایلش «فعلاً پذیرفته نمی‌شود» با راه جلو
              («از Word خروجی PDF بگیر…»). سفارش ثبت‌شده دست نمی‌خورد.
            </p>
          </fieldset>
          <div className="jy-field">
            <label className="jy-label" htmlFor="s-maxmb">
              حجم هر فایل، مگابایت
            </label>
            <input
              id="s-maxmb"
              name="maxMb"
              className="jy-input jy-input--ltr ad-short"
              inputMode="numeric"
              autoComplete="off"
              required
              defaultValue={state.values?.maxMb ?? formatNumber(files.maxMb)}
              aria-invalid={bad('maxMb') ? true : undefined}
              aria-describedby={bad('maxMb') ? 's-maxmb-error' : undefined}
            />
            {bad('maxMb') ? (
              <p id="s-maxmb-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {maxMbError}
              </p>
            ) : null}
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="s-maxpages">
              صفحهٔ هر فایل
            </label>
            <input
              id="s-maxpages"
              name="maxPages"
              className="jy-input jy-input--ltr ad-short"
              inputMode="numeric"
              autoComplete="off"
              required
              defaultValue={state.values?.maxPages ?? formatNumber(files.maxPages)}
              aria-invalid={bad('maxPages') ? true : undefined}
              aria-describedby={bad('maxPages') ? 's-maxpages-error s-files-hint' : 's-files-hint'}
            />
            {bad('maxPages') ? (
              <p id="s-maxpages-error" className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {maxPagesError}
              </p>
            ) : null}
            <p id="s-files-hint" className="jy-hint">
              فایل بزرگ‌تر همان لحظهٔ انداختن «پذیرفته نشد» می‌شود، با عددش و راه جلو («دو تکه‌اش کن…»)؛ قیمت بی آن. صفحهٔ اصلی سایت تا یک
              دقیقه، و سرور آپلود و ثبت سفارش همان لحظه.
            </p>
          </div>
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--secondary${pending ? ' is-loading' : ''}`} disabled={pending}>
            ذخیره
          </button>
        </div>
      </form>
    </section>
  );
}
