'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { editRecipientAction, type RecipientState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

interface Props {
  gate: string;
  orderNumber: number;
  /** همان سه چیزی که ویرایش می‌شود، از سفارش. */
  initial: { name: string; addressText: string; postalCode: string };
  /** «خراسان رضوی، مشهد»: عوض نمی‌شود. */
  place: string;
  /** «0915 234 5678»: عوض نمی‌شود. */
  phone: string;
  back: string;
}

/** پیام هر فیلد، همان متن‌های قدم نشانی مسیر خرید؛ قاعده خودش یکی است (`checkRecipient`). */
const ERRORS: Record<'recipient.name' | 'recipient.addressText' | 'recipient.postalCode', string> = {
  'recipient.name': 'نام و نام خانوادگی گیرنده را بنویس.',
  'recipient.addressText': 'نشانی را کامل‌تر بنویس: خیابان، کوچه، پلاک و واحد.',
  'recipient.postalCode': 'کد پستی 10 رقم است. اگر نمی‌دانی، خالی بگذار.',
};

/**
 * ویرایش گیرنده (طرح پنل `m-order-edit`): اشتباه تایپی نام، نشانی و کد پستی، تا پیش از پست. استان و شهر و موبایل فقط
 * دیدنی‌اند: کرایه با استان منجمد است و موبایل همان تأییدشدهٔ پرداخت (ADR-034).
 */
export function RecipientForm({ gate, orderNumber, initial, place, phone, back }: Props) {
  const [state, action, pending] = useActionState<RecipientState, FormData>(editRecipientAction, {});
  const values = state.values ?? initial;
  const errorOf = (field: keyof typeof ERRORS) => (state.fields?.includes(field) ? ERRORS[field] : null);
  const described = (id: string, error: string | null) => (error ? `${id}-error` : undefined);
  const name = errorOf('recipient.name');
  const address = errorOf('recipient.addressText');
  const postal = errorOf('recipient.postalCode');

  return (
    <section className="jy-card" aria-labelledby="t-edit">
      <h2 id="t-edit" className="jy-card__title">
        ویرایش نشانی
      </h2>
      <p className="ad-lead">اشتباه تایپی را درست کن. قیمت و کرایه عوض نمی‌شوند.</p>
      {state.error && !state.fields?.length ? <p className="jy-error">{messageOf(state.error)}</p> : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="number" value={orderNumber} />
        <div className="ad-form">
          <div className="jy-field">
            <label className="jy-label" htmlFor="e-name">
              نام گیرنده
            </label>
            <input
              id="e-name"
              name="name"
              className="jy-input"
              autoComplete="off"
              required
              defaultValue={values.name}
              aria-invalid={name ? true : undefined}
              aria-describedby={described('e-name', name)}
            />
            {name ? <FieldError id="e-name-error">{name}</FieldError> : null}
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="e-addr">
              نشانی
            </label>
            <textarea
              id="e-addr"
              name="addressText"
              className="jy-input"
              rows={3}
              required
              defaultValue={values.addressText}
              aria-invalid={address ? true : undefined}
              aria-describedby={described('e-addr', address)}
            />
            {address ? <FieldError id="e-addr-error">{address}</FieldError> : null}
          </div>
          <div className="jy-field">
            <label className="jy-label" htmlFor="e-postal">
              کد پستی <span className="jy-optional">(اختیاری)</span>
            </label>
            <input
              id="e-postal"
              name="postalCode"
              className="jy-input jy-input--ltr ad-short"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              defaultValue={values.postalCode}
              aria-invalid={postal ? true : undefined}
              aria-describedby={described('e-postal', postal)}
            />
            {postal ? <FieldError id="e-postal-error">{postal}</FieldError> : null}
          </div>
          <dl className="ad-facts">
            <div>
              <dt>استان و شهر</dt>
              <dd>
                {place}
                <p className="ad-hint">عوض نمی‌شود: کرایهٔ سفارش با استانش منجمد شده.</p>
              </dd>
            </div>
            <div>
              <dt>موبایل</dt>
              <dd>
                <span className="num">{phone}</span>
                <p className="ad-hint">موبایل تأییدشدهٔ پرداخت است و عوض نمی‌شود.</p>
              </dd>
            </div>
          </dl>
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            ذخیره
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="jy-error">
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      {children}
    </p>
  );
}
