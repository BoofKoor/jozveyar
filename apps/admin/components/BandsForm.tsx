'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { saveBandsAction, type BandsState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

interface Props {
  gate: string;
  /** ماه گزارش (`1405-07`)، برای برگشت به همان‌جا. */
  month: string;
  /** همان که صفحه نشان داد؛ «همان که دیده شد». */
  seen: string;
  /** نوشته‌های آغاز فیلدها: مرزهای امروز و فیلدهای خالی برای افزودن (`boundFieldCount`). */
  fields: string[];
  /** «انصراف»: همان گزارش، بی فرم. */
  cancelHref: string;
}

/**
 * «بازه‌ها را عوض کن» (طرح پنل `m-ship-report`، تصمیم‌های ۱۰۱ و ۱۱۰): یک فیلد برای هر مرز به گرم، و خطای هر فیلد زیر خودش با
 * نوشته‌ها. پیام‌ها را سرور می‌سازد (`boundErrorText`)، تا این جزء مرورگری قرارداد و zod را با خودش نیاورد؛ سنجش فقط در سرور،
 * نه حباب مرورگر.
 */
export function BandsForm({ gate, month, seen, fields, cancelHref }: Props) {
  const [state, action, pending] = useActionState<BandsState, FormData>(saveBandsAction, {});
  const values = state.values ?? fields;
  const other = state.error && !state.errors ? messageOf(state.error) : null;

  return (
    <form action={action} className="ad-bounds-form" aria-label="بازه‌های وزن گزارش" noValidate>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="seen" value={seen} />
      {other ? <p className="jy-error">{other}</p> : null}
      <fieldset>
        <legend className="jy-label">مرزهای بازه‌ها، به گرم</legend>
        <div className="ad-bounds">
          {values.map((value, i) => {
            const error = state.errors?.[i] ?? null;
            const id = `rb-${i}`;
            return (
              <div className="jy-field" key={i}>
                <label className="jy-label" htmlFor={id}>
                  مرز <span className="num">{i + 1}</span>
                </label>
                <input
                  id={id}
                  name="b"
                  className="jy-input jy-input--ltr"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
                {error ? (
                  <p id={`${id}-error`} className="jy-error">
                    <span className="jy-icon jy-icon-error" aria-hidden="true" />
                    {error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="jy-hint ad-gap">
          هر بازه از مرز پایینش تا پیش از مرز بعد، مثل کرایهٔ تعرفه؛ فیلد خالی یعنی آن مرز نیست. فقط همین گزارش را می‌چیند: قیمت، کرایه و
          تعرفه عوض نمی‌شوند.
        </p>
      </fieldset>
      <div className="ad-actions">
        <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
          ذخیرهٔ بازه‌ها
        </button>
        <Link href={cancelHref} className="jy-btn jy-btn--text">
          انصراف
        </Link>
      </div>
    </form>
  );
}
