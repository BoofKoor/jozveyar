'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';

import { SMS_TEMPLATES, smsParts, type SmsPurpose } from '@jozveyar/sms';
import { formatNumber } from '@jozveyar/text';

import { keyAction, keyTestAction, type FormState, type KeyTestState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import type { KeyTestView } from '../lib/server/settings';
import { Alert } from './Alert';
import { CodeField } from './CodeField';

interface Props {
  gate: string;
  /** `SMS_API_KEY` یا شناسهٔ یکی از سه قالب. */
  name: string;
  /** `credit`: کلید API، با اعتبار حساب؛ وگرنه هدف قالب، با یک پیامک آزمایشی. */
  kind: 'credit' | SmsPurpose;
  field: string;
  /** راهنمای زیر فیلد مقدار. */
  hint: string;
  /** نسخه‌ای که صفحه نشان داد. */
  seen: string;
  back: string;
}

/** «0912 345 6789» */
const phone = (mobile: string) => (/^09\d{9}$/.test(mobile) ? `${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}` : mobile);

/** متن قالب با پارامترهای برجسته: همان که در پنل sms.ir نوشته می‌شود. */
function TemplateText({ purpose }: { purpose: SmsPurpose }) {
  const parts = SMS_TEMPLATES[purpose].text.split(/(‹[A-Z]+›|\n)/);
  return (
    <p className="ad-tpl" dir="rtl">
      {parts.map((part, i) =>
        part === '\n' ? <br key={i} /> : /^‹[A-Z]+›$/.test(part) ? <span key={i} className="ad-tpl__p">{part}</span> : part,
      )}
    </p>
  );
}

/** نتیجهٔ آزمایش، به زبان مالک (طرح `m-key-test`: درست، رد شد، جواب نداد؛ و «آزموده نشد» بی کلید API). */
function outcomeNote(test: KeyTestView, credit: boolean): { tone: 'success' | 'error' | 'warning'; text: ReactNode } {
  const answer = test.http !== null ? <> (پاسخ <span className="num">{test.http}</span>{test.status !== null ? <>، کد <span className="num">{test.status}</span></> : null})</> : null;
  switch (test.outcome) {
    case 'ok':
      return credit
        ? { tone: 'success', text: <><b>درست است.</b> اعتبار حساب <span className="num">{formatNumber(Math.floor(test.credit ?? 0))}</span> پیامک.</> }
        : {
            tone: 'success',
            text: (
              <>
                <b>درست است.</b> پیامک آزمایشی به <span className="num nw">{phone(test.mobile ?? '')}</span> رفت
                {test.messageId ? <>؛ شناسهٔ پیامک <span className="num">{test.messageId}</span></> : null}
                {test.cost !== null ? <>، هزینه <span className="num">{formatNumber(test.cost)}</span> پیامک</> : null}. روی گوشی ببین متن درست رسیده.
              </>
            ),
          };
    case 'rejected':
      return {
        tone: 'error',
        text: credit ? (
          <><b>sms.ir رد کرد:</b> {test.http === 403 ? 'این کلید دسترسی ندارد؛ شاید به IP دیگری محدود است' : 'کلید درست نیست'}{answer}. رد شده ذخیره نمی‌شود.</>
        ) : (
          <><b>sms.ir رد کرد:</b> این شناسهٔ قالب در حساب نیست، هنوز تأیید نشده، یا نام پارامترهایش همین‌ها نیست{answer}. رد شده ذخیره نمی‌شود؛ قالب را در پنل sms.ir ببین.</>
        ),
      };
    case 'unconfigured':
      return {
        tone: 'warning',
        text: <><b>کلید API sms.ir خالی است؛</b> قالب آزموده نشد. اگر مطمئنی، با کد تازه ذخیره کن و پس از گذاشتن کلید دوباره بیازما.</>,
      };
    default:
      return {
        tone: 'warning',
        text: (
          <>
            <b>sms.ir جواب نداد</b>
            {answer ?? <> (سقف زمان <span className="num">10</span> ثانیه)</>}. {credit ? 'کلید' : 'قالب'} آزموده نشد؛ اگر مطمئنی، با کد تازه ذخیره کن و بعداً دوباره
            بیازما.
          </>
        ),
      };
  }
}

/**
 * مقدار تازهٔ کلید یا قالب sms.ir، با «آزمایش» پیش از ذخیره (۷٫۱، سؤال‌های ۱۱۹ و ۱۳۹؛ طرح `m-key-edit` و `m-key-test`): مقدار، (برای قالب)
 * متن قالب با نام پارامترها و موبایل پیامک آزمایشی، «آزمایش»، و نتیجه زیرش. فقط «درست»، «در دسترس نیست» و «آزموده نشد» به کد تازه و
 * ذخیره می‌رسند، با نشانی‌ای که سرور امضا کرده؛ مقدار عوض شد، آزمایش از نو. مقدار فقط در حافظهٔ همین فرم است و هرگز از سرور برنمی‌گردد.
 */
export function KeyTestForm({ gate, name, kind, field, hint, seen, back }: Props) {
  const [value, setValue] = useState('');
  const [mobile, setMobile] = useState('');
  const [tested, setTested] = useState<{ value: string; mobile: string } | null>(null);
  const [testState, testAction, testing] = useActionState<KeyTestState, FormData>(async (previous, form) => {
    setTested({ value: String(form.get('value') ?? ''), mobile: String(form.get('mobile') ?? '') });
    return keyTestAction(previous, form);
  }, {});
  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(keyAction, {});
  const credit = kind === 'credit';
  // نتیجه فقط برای همان مقداری که آزموده شد؛ مقدار یا شماره عوض شد، آزمایش از نو.
  const test = testState.test && tested && tested.value === value && (credit || tested.mobile === mobile) ? testState.test : null;
  const note = test ? outcomeNote(test, credit) : null;
  const savable = test !== null && test.token !== null;
  const codeError = saveState.error === 'wrong_code' || saveState.error === 'code_used' ? messageOf(saveState.error) : null;
  const valueError =
    testState.error === 'invalid_key_value' || testState.error === 'invalid_template_id' || saveState.error === 'invalid_template_id'
      ? messageOf(testState.error ?? saveState.error)
      : null;
  const mobileError = testState.error === 'invalid_mobile' ? messageOf('invalid_mobile') : null;
  const formError = saveState.error && !codeError ? saveState.error : testState.error && !valueError && !mobileError ? testState.error : null;
  const valueId = `k-${name}`;
  const template = credit ? null : SMS_TEMPLATES[kind];
  const sampleText = template ? template.text.replace(/‹[A-Z]+›/g, (param) => template.sample[template.params.indexOf(param.slice(1, -1))] ?? param) : '';

  return (
    <form autoComplete="off" noValidate data-key-test={name}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="seen" value={seen} />
      <input type="hidden" name="intent" value="set" />
      {test?.token ? <input type="hidden" name="test" value={test.token} /> : null}
      {saveState.error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{saveState.until}</span> بسته است.
        </Alert>
      ) : formError ? (
        <Alert tone="error">{messageOf(formError)}</Alert>
      ) : null}
      {template ? (
        <>
          <p className="ad-hint">متن این قالب در پنل sms.ir، عین همین؛ نام پارامترها همین‌ها:</p>
          <TemplateText purpose={kind as SmsPurpose} />
          <p className="ad-hint">
            {template.params.length === 1 ? 'یک پارامتر' : `${template.params.length === 2 ? 'دو' : template.params.length} پارامتر`}،{' '}
            {template.params.map((param, i) => (
              <span key={param}>
                {i > 0 ? ' و ' : ''}
                <bdi className="ad-ltr">{param}</bdi>
              </span>
            ))}{' '}
            · تا <span className="num">70</span> نویسه، {smsParts(sampleText) === 1 ? 'یک پیامک' : `${smsParts(sampleText)} پیامک`}
          </p>
        </>
      ) : null}
      <div className="ad-form">
        <div className="jy-field">
          <label className="jy-label" htmlFor={valueId}>
            {field}
          </label>
          <input
            id={valueId}
            name="value"
            className={`jy-input jy-input--ltr${credit ? '' : ' ad-short'}`}
            type={credit ? 'password' : 'text'}
            inputMode={credit ? undefined : 'numeric'}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
            maxLength={credit ? 512 : 9}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={valueError ? true : undefined}
            aria-describedby={valueError ? `${valueId}-error ${valueId}-hint` : `${valueId}-hint`}
          />
          {valueError ? (
            <p id={`${valueId}-error`} className="jy-error">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              {valueError}
            </p>
          ) : null}
          <p id={`${valueId}-hint`} className="jy-hint">
            {hint}
            {credit ? (
              <>
                {' '}
                بعد از ذخیره فقط <span className="num">4</span> نویسهٔ آخرش دیده می‌شود.
              </>
            ) : null}
          </p>
        </div>
        {template ? (
          <div className="jy-field">
            <label className="jy-label" htmlFor={`${valueId}-mobile`}>
              موبایل برای پیامک آزمایشی
            </label>
            <input
              id={`${valueId}-mobile`}
              name="mobile"
              className="jy-input jy-input--ltr ad-short"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              required
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              aria-invalid={mobileError ? true : undefined}
              aria-describedby={mobileError ? `${valueId}-mobile-error ${valueId}-mobile-hint` : `${valueId}-mobile-hint`}
            />
            {mobileError ? (
              <p id={`${valueId}-mobile-error`} className="jy-error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {mobileError}
              </p>
            ) : null}
            <p id={`${valueId}-mobile-hint`} className="jy-hint">
              یک پیامک با پارامترهای نمونه («<span dir="rtl">{sampleText.replace('\n', ' ')}</span>») به همین شماره می‌رود؛ روی گوشی ببین متن درست رسیده.
            </p>
          </div>
        ) : null}
      </div>
      {test ? null : (
        <div className="ad-actions">
          <button type="submit" formAction={testAction} className={`jy-btn jy-btn--secondary${testing ? ' is-loading' : ''}`} disabled={testing}>
            آزمایش
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      )}
      {test && note ? (
        <div className="ad-keys__test" data-test-outcome={test.outcome}>
          <p className={`jy-note jy-note--${note.tone}`} role="status">
            <span className={`jy-icon jy-icon-${note.tone === 'success' ? 'success' : note.tone}`} aria-hidden="true" />
            <span>{note.text}</span>
          </p>
          {savable ? (
            <>
              <div className="ad-form">
                <CodeField error={codeError} />
              </div>
              <div className="ad-actions">
                <button
                  type="submit"
                  formAction={saveAction}
                  className={`jy-btn ${test.outcome === 'ok' ? 'jy-btn--primary' : 'jy-btn--secondary'}${saving ? ' is-loading' : ''}`}
                  disabled={saving}
                >
                  {test.outcome === 'ok' ? 'ذخیره' : 'با این حال ذخیره کن'}
                </button>
                <Link href={back} className="jy-btn jy-btn--text">
                  انصراف
                </Link>
              </div>
            </>
          ) : (
            <div className="ad-actions">
              <button type="button" className="jy-btn jy-btn--primary is-status" aria-disabled="true">
                رد شد؛ ذخیره نمی‌شود
              </button>
              <Link href={back} className="jy-btn jy-btn--text">
                انصراف
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </form>
  );
}
