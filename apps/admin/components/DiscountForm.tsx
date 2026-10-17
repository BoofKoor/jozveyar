'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { saveDiscountAction, type DiscountState } from '../app/[gate]/actions';
import type { DiscountForm as DiscountFormValues } from '../lib/discounts';
import { messageOf } from '../lib/messages';
import type { Seg } from '../lib/orders';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { Segments } from './Segments';

type Field = NonNullable<DiscountState['field']>;

interface Props {
  gate: string;
  back: string;
  /** ویرایش: شناسه، زمان آخرین تغییری که مالک دید (میلی‌ثانیه) و فرم از روی کد؛ نبودنش یعنی «کد تازه». */
  edit?: {
    id: string;
    seen: string;
    form: DiscountFormValues;
    /** کد سفارش دارد: نوع، مقدار، سقف و حداقل منجمدند و فقط متنشان دیده می‌شود. */
    frozen: boolean;
    /** «10٪ تا 50,000 تومان، از سفارش 300,000 تومان». */
    termsText: readonly Seg[];
    /** «روشن · استفاده: 12 از 100»، زیر عنوان. */
    meta: readonly Seg[];
  };
  /** صفحه پس از فرم کهنه دوباره ساخته شد (`?e=discount_changed`)، حالا با شرط‌های تازه. */
  notice: string | null;
}

const KINDS = [
  { value: 'percent', title: 'درصد', note: 'از جمع چاپ، کاغذ و صحافی؛ با سقف اختیاری برای هر سفارش' },
  { value: 'fixed', title: 'مبلغ ثابت', note: 'از جمع چاپ، کاغذ و صحافی، تا خود همان جمع' },
] as const;

/**
 * «کد تازه» و ویرایش کد تخفیف (برش ۱۱٫۴، سؤال‌های ۲۰۹ و ۲۹۸ تا ۳۰۲). نوع با دو کاشی، و فیلدهای درصد یا مبلغ فقط با همان نوع (`:has()`،
 * بی JS)؛ پول تومان و روز شمسی، هر دو اختیاری جز مقدار تخفیف؛ خطای هر فیلد زیر همان فیلد، با نوشته‌ها. ساختن و هر تغییر کد تازه می‌خواهد
 * و خاموش کردن تنها نه، پس فیلد کد در ویرایش اجباری نیست و سرور می‌سنجد. کدی که سفارش دارد شرط‌هایش را فقط نشان می‌دهد.
 */
export function DiscountForm({ gate, back, edit, notice }: Props) {
  const [state, action, pending] = useActionState<DiscountState, FormData>(saveDiscountAction, {});
  const error = state.error;
  const at = state.field;
  const errorOf = (field: Field) => (at === field && error ? messageOf(error) : null);
  const describedBy = (field: Field, hint: boolean) =>
    [errorOf(field) ? `d-${field}-error` : null, hint ? `d-${field}-hint` : null].filter(Boolean).join(' ') || undefined;
  const fieldError = (field: Field) => {
    const text = errorOf(field);
    return text ? (
      <p id={`d-${field}-error`} className="jy-error">
        <span className="jy-icon jy-icon-error" aria-hidden="true" />
        {text}
      </p>
    ) : null;
  };
  const initial = edit?.form;
  const value = (key: Exclude<keyof DiscountFormValues, 'enabled'>) => state.values?.[key] ?? initial?.[key] ?? (key === 'perCustomer' ? '1' : '');
  const enabled = state.values?.enabled ?? initial?.enabled ?? true;
  const kind = value('kind') || 'percent';
  const other = error && !at ? messageOf(error) : null;
  const money = (field: 'max' | 'amount' | 'minOrder', label: string, hint: string, required = false) => (
    <div className={`jy-field${field === 'max' ? ' ad-if-percent' : field === 'amount' ? ' ad-if-fixed' : ''}`}>
      <label className="jy-label" htmlFor={`d-${field}`}>
        {label}
        {required ? null : <span className="jy-optional"> (اختیاری)</span>}
      </label>
      <div className="ad-unit">
        <input
          id={`d-${field}`}
          name={field}
          className="jy-input ad-short num"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          defaultValue={value(field)}
          aria-invalid={errorOf(field) ? true : undefined}
          aria-describedby={describedBy(field, true)}
        />
        <span className="ad-unit__label">تومان</span>
      </div>
      {fieldError(field)}
      <p id={`d-${field}-hint`} className="jy-hint">
        {hint}
      </p>
    </div>
  );

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-discount">
      <h1 id="t-discount" className="jy-card__title">
        {edit ? (
          <>
            کد <bdi className="ad-ltr ad-code">{edit.form.discount}</bdi>
          </>
        ) : (
          'کد تخفیف تازه'
        )}
      </h1>
      {edit ? (
        <p className="ad-meta" data-discount-uses>
          <Segments segs={edit.meta} />
        </p>
      ) : null}
      <p className="ad-lead">
        مشتری کد را در «مرور و پرداخت»، پس از کد پیامکی، وارد می‌کند. اگر تخفیف سفارش بزرگ همان سفارش بیشتر باشد، همان می‌نشیند و کد مصرف
        نمی‌شود.
      </p>
      {error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : other ? (
        <Alert tone="error">{other}</Alert>
      ) : !error && notice ? (
        <Alert tone="warning">{notice}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        {edit ? (
          <>
            <input type="hidden" name="id" value={edit.id} />
            <input type="hidden" name="seen" value={edit.seen} />
          </>
        ) : null}
        <div className="ad-form ad-discount-form">
          {edit ? null : (
            <div className="jy-field">
              <label className="jy-label" htmlFor="d-discount">
                کد
              </label>
              <input
                id="d-discount"
                name="discount"
                className="jy-input jy-input--ltr ad-short"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                required
                placeholder="MEHR1405"
                defaultValue={value('discount')}
                aria-invalid={errorOf('discount') ? true : undefined}
                aria-describedby={describedBy('discount', true)}
              />
              {fieldError('discount')}
              <p id="d-discount-hint" className="jy-hint">
                3 تا 20 حرف و رقم لاتین. فاصله و خط تیره برداشته می‌شود، و حرف کوچک یا تایپ با صفحه‌کلید فارسی همان کد است. پس از ساختن عوض
                نمی‌شود.
              </p>
            </div>
          )}
          {edit?.frozen ? (
            <div className="jy-field" data-discount-terms="frozen">
              <span className="jy-label">تخفیف</span>
              <p className="ad-discount-terms">
                <Segments segs={edit.termsText} />
              </p>
              <p className="jy-hint">
                نوع، مقدار، سقف و حداقل از اولین سفارش این کد عوض نمی‌شوند. برای شرط دیگر، این را خاموش کن و کد تازه بساز.
              </p>
              {(['kind', 'percent', 'max', 'amount', 'minOrder'] as const).map((key) => (
                <input key={key} type="hidden" name={key} value={edit.form[key]} />
              ))}
              {fieldError('kind')}
            </div>
          ) : (
            <>
              <fieldset className="jy-field" aria-describedby={describedBy('kind', false)}>
                <legend className="jy-label">نوع تخفیف</legend>
                <div className="jy-tiles ad-roles">
                  {KINDS.map((tile) => (
                    <label key={tile.value} className="jy-tile">
                      <input className={`jy-radio ad-kind-${tile.value}`} type="radio" name="kind" value={tile.value} defaultChecked={kind === tile.value} />
                      <span className="jy-tile__title">{tile.title}</span>
                      <span className="jy-tile__note">{tile.note}</span>
                    </label>
                  ))}
                </div>
                {fieldError('kind')}
              </fieldset>
              <div className="jy-field ad-if-percent">
                <label className="jy-label" htmlFor="d-percent">
                  درصد
                </label>
                <div className="ad-unit">
                  <input
                    id="d-percent"
                    name="percent"
                    className="jy-input ad-short num"
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={5}
                    defaultValue={value('percent')}
                    aria-invalid={errorOf('percent') ? true : undefined}
                    aria-describedby={describedBy('percent', false)}
                  />
                  <span className="ad-unit__label">٪</span>
                </div>
                {fieldError('percent')}
              </div>
              {money('max', 'سقف تخفیف هر سفارش', 'خالی یعنی بی سقف. با «20٪ تا 50,000 تومان» سفارش 400,000 تومانی 50,000 تومان تخفیف می‌گیرد، نه 80,000.')}
              {money('amount', 'مبلغ تخفیف', 'از جمع چاپ، کاغذ و صحافی کم می‌شود، و هرگز بیشتر از خود همان جمع نیست.', true)}
              {money('minOrder', 'حداقل سفارش', 'جمع چاپ، کاغذ و صحافی، پیش از کرایه؛ زیرش کد نمی‌خورد و مشتری می‌بیند چقدر مانده.')}
            </>
          )}
          <div className="ad-discount-days">
            <div className="jy-field">
              <label className="jy-label" htmlFor="d-from">
                روز اول <span className="jy-optional">(اختیاری)</span>
              </label>
              <input
                id="d-from"
                name="from"
                className="jy-input ad-short num"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={12}
                placeholder="1405/07/25"
                defaultValue={value('from')}
                aria-invalid={errorOf('from') ? true : undefined}
                aria-describedby={describedBy('from', true)}
              />
              {fieldError('from')}
              <p id="d-from-hint" className="jy-hint">
                خالی یعنی از همین حالا.
              </p>
            </div>
            <div className="jy-field">
              <label className="jy-label" htmlFor="d-until">
                روز آخر <span className="jy-optional">(اختیاری)</span>
              </label>
              <input
                id="d-until"
                name="until"
                className="jy-input ad-short num"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={12}
                placeholder="1405/07/30"
                defaultValue={value('until')}
                aria-invalid={errorOf('until') ? true : undefined}
                aria-describedby={describedBy('until', true)}
              />
              {fieldError('until')}
              <p id="d-until-hint" className="jy-hint">
                خودش هم هست، تا نیمه‌شب تهران. خالی یعنی بی پایان.
              </p>
            </div>
          </div>
          <div className="ad-discount-days">
            <div className="jy-field">
              <label className="jy-label" htmlFor="d-total">
                سقف کل استفاده <span className="jy-optional">(اختیاری)</span>
              </label>
              <input
                id="d-total"
                name="total"
                className="jy-input ad-short num"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={9}
                defaultValue={value('total')}
                aria-invalid={errorOf('total') ? true : undefined}
                aria-describedby={describedBy('total', true)}
              />
              {fieldError('total')}
              <p id="d-total-hint" className="jy-hint">
                خالی یعنی بی سقف.
              </p>
            </div>
            <div className="jy-field">
              <label className="jy-label" htmlFor="d-perCustomer">
                سقف هر مشتری
              </label>
              <input
                id="d-perCustomer"
                name="perCustomer"
                className="jy-input ad-short num"
                dir="ltr"
                inputMode="numeric"
                autoComplete="off"
                maxLength={9}
                required
                defaultValue={value('perCustomer')}
                aria-invalid={errorOf('perCustomer') ? true : undefined}
                aria-describedby={describedBy('perCustomer', true)}
              />
              {fieldError('perCustomer')}
              <p id="d-perCustomer-hint" className="jy-hint">
                هر شمارهٔ موبایل.
              </p>
            </div>
          </div>
          <p className="ad-hint">
            هر سفارش پرداخت‌شده یک استفاده است، و با لغو برنمی‌گردد. سفارشی که در انتظار پرداخت است تا 10 دقیقه جا نگه می‌دارد، و هر تلاش
            پرداخت تازه دوباره؛ پس دو مشتری هرگز آخرین جا را با هم نمی‌گیرند.
          </p>
          <div className="jy-field">
            <label className="jy-label" htmlFor="d-note">
              یادداشت <span className="jy-optional">(اختیاری)</span>
            </label>
            <input
              id="d-note"
              name="note"
              className="jy-input"
              maxLength={200}
              autoComplete="off"
              placeholder="مثلاً: برای کانال تلگرام دانشجویان پزشکی"
              defaultValue={value('note')}
              aria-invalid={errorOf('note') ? true : undefined}
              aria-describedby={describedBy('note', true)}
            />
            {fieldError('note')}
            <p id="d-note-hint" className="jy-hint">
              فقط در پنل دیده می‌شود؛ مشتری نمی‌بیند.
            </p>
          </div>
          <div>
            <label className="ad-size__toggle">
              <input type="checkbox" className="ad-check" name="enabled" value="1" defaultChecked={enabled} aria-describedby="d-enabled-hint" />
              روشن
            </label>
            <p id="d-enabled-hint" className="jy-hint">
              خاموش یعنی در «مرور و پرداخت» پذیرفته نیست؛ روشن، از روز اول.
            </p>
          </div>
          <CodeField
            error={errorOf('code')}
            required={!edit}
            hint={
              edit
                ? 'هر تغییر کد تازه می‌خواهد؛ فقط خاموش کردن بی کد است.'
                : 'کد تخفیف پول است؛ ساختنش کد تازه می‌خواهد، و کدی که با آن وارد شدی دوباره پذیرفته نیست.'
            }
          />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            {edit ? 'ذخیره' : 'ساختن کد'}
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
