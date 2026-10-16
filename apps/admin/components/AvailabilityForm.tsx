'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { partnerAvailabilityAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { AdminErrorCode } from '../lib/server/result';
import { Alert } from './Alert';

/** جای هر خطای فرم، زیر همان فیلد. */
const FIELD_ERRORS: Record<string, 'availability' | 'from' | 'until' | 'note'> = {
  invalid_availability: 'availability',
  invalid_day: 'from',
  invalid_last_day: 'until',
  day_past: 'from',
  day_order: 'until',
  day_too_far: 'until',
  availability_note_too_long: 'note',
};

interface Props {
  gate: string;
  id: string;
  name: string;
  /** `availabilitySeen` حال امروز: «همان که دیده شد». */
  seen: string;
  /** حال امروز و روزهایش، برای مقدار اولیهٔ فرم. */
  current: { availability: 'open' | 'busy' | 'closed'; from: string; until: string; note: string };
  lead: string;
  back: 'dashboard' | 'partners';
  backHref: string;
  /** صفحه پس از فرم کهنه دوباره ساخته شد (`?e=partner_availability_changed`)، حالا با حال تازه. */
  notice: AdminErrorCode | null;
}

const TILES = [
  { value: 'open', title: 'باز', note: 'سفارش تازه با قاعدهٔ همیشه: همان شهر، همان استان، بعد نزدیک‌ترین' },
  { value: 'busy', title: 'شلوغ', note: 'سفارش تازه فقط وقتی چاپخانهٔ باز دیگری در استان مشتری نیست' },
  { value: 'closed', title: 'تعطیل', note: 'از روز اول تا روز آخر سفارش تازه نمی‌گیرد؛ سفارش‌های صفش را جابه‌جا کن' },
] as const;

/**
 * در دسترس بودن یک چاپخانه (برش ۱۰٫۱، سؤال‌های ۲۰۰ و ۲۶۶): «باز»، «شلوغ» یا «تعطیل از … تا …» با یادداشت، بی کد تازه. روزها به تقویم
 * شمسی و دوسرشامل؛ روز و یادداشت فقط با حالی دیده می‌شوند که لازمشان دارد (`:has()`، بی JS)، و سرور هم فقط برای همان می‌خواندشان.
 */
export function AvailabilityForm({ gate, id, name, seen, current, lead, back, backHref, notice }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(partnerAvailabilityAction, {});
  const error = state.error;
  const at = error ? FIELD_ERRORS[error] : undefined;
  const fieldError = (field: string) =>
    at === field ? (
      <p id={`av-${field}-error`} className="jy-error">
        <span className="jy-icon jy-icon-error" aria-hidden="true" />
        {messageOf(error!)}
      </p>
    ) : null;
  const value = (key: keyof Props['current']) => state.values?.[key] ?? current[key];
  const picked = value('availability');

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-availability">
      <h1 id="t-availability" className="jy-card__title">
        در دسترس بودن {name}
      </h1>
      <p className="ad-lead">{lead}</p>
      {error && !at ? <Alert tone="error">{messageOf(error)}</Alert> : !error && notice ? <Alert tone="warning">{messageOf(notice)}</Alert> : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="seen" value={seen} />
        <input type="hidden" name="back" value={back} />
        <div className="ad-form ad-availability-form">
          <fieldset className="jy-field" aria-describedby={at === 'availability' ? 'av-availability-error' : undefined}>
            <legend className="jy-label">حال چاپخانه</legend>
            <div className="jy-tiles ad-roles">
              {TILES.map((tile) => (
                <label key={tile.value} className="jy-tile">
                  <input
                    className={`jy-radio ad-av-${tile.value}`}
                    type="radio"
                    name="availability"
                    value={tile.value}
                    defaultChecked={picked === tile.value}
                  />
                  <span className="jy-tile__title">{tile.title}</span>
                  <span className="jy-tile__note">{tile.note}</span>
                </label>
              ))}
            </div>
            {fieldError('availability')}
          </fieldset>
          <div className="jy-field ad-if-closed">
            <label className="jy-label" htmlFor="av-from">
              روز اول تعطیل
            </label>
            <input
              id="av-from"
              name="from"
              className="jy-input ad-short num"
              dir="ltr"
              inputMode="numeric"
              placeholder="1405/07/25"
              defaultValue={value('from')}
              aria-invalid={at === 'from' ? true : undefined}
              aria-describedby={at === 'from' ? 'av-from-error' : undefined}
            />
            {fieldError('from')}
          </div>
          <div className="jy-field ad-if-closed">
            <label className="jy-label" htmlFor="av-until">
              روز آخر تعطیل
            </label>
            <input
              id="av-until"
              name="until"
              className="jy-input ad-short num"
              dir="ltr"
              inputMode="numeric"
              placeholder="1405/07/28"
              defaultValue={value('until')}
              aria-invalid={at === 'until' ? true : undefined}
              aria-describedby={at === 'until' ? 'av-until-error av-until-hint' : 'av-until-hint'}
            />
            {fieldError('until')}
            <p id="av-until-hint" className="jy-hint">
              خودش هم تعطیل است؛ روز بعدش دوباره سفارش می‌گیرد. تا 90 روز بعد.
            </p>
          </div>
          <div className="jy-field ad-if-away">
            <label className="jy-label" htmlFor="av-note">
              یادداشت (اختیاری)
            </label>
            <input
              id="av-note"
              name="note"
              className="jy-input"
              maxLength={200}
              placeholder="مثلاً: دستگاه چاپ تا پنجشنبه خراب است"
              defaultValue={value('note')}
              aria-invalid={at === 'note' ? true : undefined}
              aria-describedby={at === 'note' ? 'av-note-error av-note-hint' : 'av-note-hint'}
            />
            {fieldError('note')}
            <p id="av-note-hint" className="jy-hint">
              فقط در پنل دیده می‌شود؛ مشتری نمی‌بیند.
            </p>
          </div>
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            ذخیره
          </button>
          <Link href={backHref} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
