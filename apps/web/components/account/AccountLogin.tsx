'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { formatNumber, formatTehranTime, toLatinDigits } from '@jozveyar/text';

import { accountApi } from '../../lib/account/api';
import type { ApiFailure } from '../../lib/checkout/api';
import { formatClock, formatMobile, retryWhen } from '../../lib/checkout/format';

const CODE_DIGITS = 5;

type Closed = 'expired' | 'locked' | 'missing';

interface CodeStage {
  mobile: string;
  expiresAt: number;
  resendAt: number;
  closed: Closed | null;
  /** همین چند لحظه پیش کدی به همین شماره رفت (`resend_too_soon`): همان را بزن. */
  reused: boolean;
}

const api = () => accountApi(window.fetch.bind(window));

/** ساعت صفحه، هر ثانیه، فقط وقتی شمارش معکوسی در کار است. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** پیام شکستی که به فیلد خاصی نمی‌خورد، با راه جلو؛ همان متن‌های قدم کد مسیر خرید. */
function failureText(failure: ApiFailure, retry: string): ReactNode {
  switch (failure.error) {
    case 'network':
      return `ارتباط برقرار نشد. اینترنت را ببین و دوباره «${retry}» را بزن.`;
    case 'too_many_codes': {
      const wait = retryWhen(Number(failure.body.retryAfterSeconds), Date.now());
      const when =
        wait.kind === 'minutes' ? (
          <>
            حدود <span className="num">{formatNumber(wait.minutes)}</span> دقیقهٔ دیگر
          </>
        ) : (
          <>
            از ساعت <span className="num">{formatTehranTime(wait.at)}</span>
          </>
        );
      switch (failure.body.scope) {
        case 'site':
        case 'site_day':
          return <>ارسال کد الان شلوغ است. {when} دوباره «{retry}» را بزن.</>;
        case 'browser':
          return <>از این مرورگر در یک ساعت گذشته کد زیادی خواسته شده. {when} دوباره امتحان کن.</>;
        case 'ip':
          return <>از این اینترنت در یک ساعت گذشته کد زیادی خواسته شده. {when} دوباره امتحان کن.</>;
        case 'mobile_day':
          return <>برای این شماره امروز کد زیادی خواسته شده. {when} دوباره امتحان کن.</>;
        default:
          return <>برای این شماره در یک ساعت گذشته کد زیادی خواسته شده. {when} دوباره امتحان کن.</>;
      }
    }
    default:
      return `الان نشد؛ چند لحظهٔ دیگر دوباره «${retry}» را بزن.`;
  }
}

function Note({ tone, children, testId }: { tone: 'info' | 'warning' | 'error'; children: ReactNode; testId?: string }) {
  return (
    <div className="ck-card-note" role={tone === 'info' ? 'status' : 'alert'}>
      <p className={`jy-note jy-note--${tone}`} data-testid={testId}>
        <span className={`jy-icon jy-icon-${tone}`} aria-hidden="true" />
        <span>{children}</span>
      </p>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="jy-error">
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * ورود «سفارش‌های من» (برش ۱۲٫۱، ADR-068؛ طرح `account.html`، «ورود» و «کد پیامکی»؛ سؤال‌های ۳۰۵ و ۳۰۶): موبایل، بعد کد، با همان نشست ۳۰ روزهٔ
 * مسیر خرید و بی رمز. پاسخ کد برای هر شماره یکی است («اگر با این شماره سفارشی ثبت شده…»)، پس «پیامک نرسید؟» می‌گوید شاید با شمارهٔ دیگری
 * سفارش داده. پس از ورود به `next` (صفحهٔ سفارشی که غریبه دیده بود) یا خود فهرست، با بار شدن دوبارهٔ صفحه، تا صفحهٔ سرور نشست را ببیند.
 */
export function AccountLogin({ next }: { next: string | null }) {
  const [mobile, setMobile] = useState('');
  const [mobileError, setMobileError] = useState<'invalid' | ApiFailure | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<{ kind: 'format' } | { kind: 'wrong'; attemptsLeft: number } | { kind: 'failure'; failure: ApiFailure } | null>(
    null,
  );
  const [resendError, setResendError] = useState<ApiFailure | null>(null);
  const [stage, setStage] = useState<CodeStage | null>(null);
  const [busy, setBusy] = useState<'code' | 'verify' | null>(null);
  const now = useNow(stage !== null);
  const codeRef = useRef<HTMLInputElement>(null);
  const mobileRef = useRef<HTMLInputElement>(null);

  const closed = stage ? (stage.closed ?? (now >= stage.expiresAt ? 'expired' : null)) : null;
  const waiting = stage ? Math.max(0, (stage.resendAt - now) / 1000) : 0;

  useEffect(() => {
    if (stage && !closed) codeRef.current?.focus({ preventScroll: true });
  }, [stage?.mobile, stage?.expiresAt, closed]);

  /** کد تازه؛ `again` یعنی «ارسال دوباره» از قدم کد. */
  async function send(target: string, again: boolean) {
    if (busy) return;
    setBusy('code');
    if (again) setResendError(null);
    else setMobileError(null);
    const result = await api().requestCode(target);
    setBusy(null);
    const at = Date.now();
    if (result.ok) {
      setCode('');
      setCodeError(null);
      setStage({
        mobile: result.value.mobile,
        expiresAt: at + result.value.expiresInSeconds * 1000,
        resendAt: at + result.value.resendInSeconds * 1000,
        closed: null,
        reused: false,
      });
      return;
    }
    if (result.error === 'resend_too_soon') {
      // کدی همین چند لحظه پیش به همین شماره رفت و هنوز زنده است: همان را بزن (همان مسیر خرید).
      const retry = Number(result.body.retryAfterSeconds) || 90;
      setStage((current) => ({
        mobile: current?.mobile ?? toLatinDigits(target).replace(/\D/g, ''),
        expiresAt: current?.expiresAt ?? at + 30_000 + retry * 1000,
        resendAt: at + retry * 1000,
        closed: null,
        reused: true,
      }));
      return;
    }
    if (result.error === 'invalid_mobile' || result.error === 'invalid_request') {
      if (again) setResendError(result);
      else setMobileError('invalid');
      mobileRef.current?.focus();
      return;
    }
    if (again) setResendError(result);
    else setMobileError(result);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stage || closed || busy) return;
    const digits = toLatinDigits(code).replace(/\s/g, '');
    if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(digits)) {
      setCodeError({ kind: 'format' });
      return;
    }
    setBusy('verify');
    setCodeError(null);
    const result = await api().verifyCode(stage.mobile, digits);
    if (result.ok) {
      window.location.assign(next ?? '/orders');
      return;
    }
    setBusy(null);
    switch (result.error) {
      case 'wrong_code': {
        const left = Number(result.body.attemptsLeft) || 0;
        if (left <= 0) setStage({ ...stage, closed: 'locked' });
        else setCodeError({ kind: 'wrong', attemptsLeft: left });
        return;
      }
      case 'code_expired':
        setStage({ ...stage, closed: 'expired' });
        return;
      case 'code_locked':
        setStage({ ...stage, closed: 'locked' });
        return;
      case 'no_code':
        setStage({ ...stage, closed: 'missing' });
        return;
      case 'invalid_code':
        setCodeError({ kind: 'format' });
        return;
      default:
        setCodeError({ kind: 'failure', failure: result });
    }
  }

  function changeMobile() {
    setStage(null);
    setCode('');
    setCodeError(null);
    setResendError(null);
    requestAnimationFrame(() => mobileRef.current?.focus());
  }

  if (!stage) {
    const fieldError =
      mobileError === 'invalid'
        ? 'شمارهٔ موبایل درست نیست؛ یازده رقم، با 09 شروع می‌شود.'
        : mobileError
          ? failureText(mobileError, 'ارسال کد')
          : null;
    return (
      <section className="jy-card" aria-labelledby="ac-login-title" data-testid="account-login">
        <h1 id="ac-login-title" className="jy-card__title">
          سفارش‌های من
        </h1>
        <p className="ck-sub">با موبایلی که با آن سفارش دادی وارد شو. یک کد پیامک می‌کنیم؛ رمز و ثبت‌نام لازم نیست.</p>
        <form
          className="ck-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send(mobile, false);
          }}
        >
          <div className="jy-field">
            <label className="jy-label" htmlFor="ac-tel">
              شمارهٔ موبایل
            </label>
            <input
              ref={mobileRef}
              id="ac-tel"
              className="jy-input jy-input--ltr ck-short"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="09123456789"
              value={mobile}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? 'ac-tel-error' : undefined}
              onChange={(event) => {
                setMobile(event.target.value);
                setMobileError(null);
              }}
            />
            {fieldError ? <FieldError id="ac-tel-error">{fieldError}</FieldError> : null}
          </div>
          <button type="submit" className={`jy-btn jy-btn--primary jy-btn--lg${busy ? ' is-loading' : ''}`} disabled={busy !== null} aria-busy={busy !== null || undefined}>
            ارسال کد
          </button>
        </form>
      </section>
    );
  }

  const number = <span className="num nw">{formatMobile(stage.mobile)}</span>;
  const change = (text: string) => (
    <button type="button" className="jy-link" onClick={changeMobile}>
      {text}
    </button>
  );
  const fieldError =
    codeError?.kind === 'format' ? (
      <>
        کد <span className="num">5</span> رقم است؛ همان را که پیامک شد بزن.
      </>
    ) : codeError?.kind === 'wrong' ? (
      <>
        کد درست نیست. دوباره نگاه کن و بزن؛ <span className="num">{formatNumber(codeError.attemptsLeft)}</span> بار دیگر فرصت هست.
      </>
    ) : codeError?.kind === 'failure' ? (
      failureText(codeError.failure, 'ورود')
    ) : null;

  return (
    <section className="jy-card" aria-labelledby="ac-code-title" data-testid="account-code">
      <h1 id="ac-code-title" className="jy-card__title">
        کد تأیید
      </h1>
      <p className="ck-sub">
        اگر با {number} سفارشی ثبت شده، کدش را پیامک کردیم. {change('شماره را عوض کن')}
      </p>
      {closed ? (
        <Note tone="warning" testId="account-code-closed">
          {closed === 'expired' ? (
            <>
              این کد دیگر اعتبار ندارد؛ هر کد <span className="num">2</span> دقیقه اعتبار دارد. کد تازه بگیر.
            </>
          ) : closed === 'locked' ? (
            'این کد سه بار اشتباه زده شد و دیگر پذیرفته نمی‌شود. کد تازه بگیر.'
          ) : (
            'کدی برای این شماره در همین مرورگر پیدا نشد. کد تازه بگیر.'
          )}
        </Note>
      ) : stage.reused ? (
        <Note tone="info" testId="account-code-reused">
          کد را همین چند لحظه پیش فرستادیم؛ همان را بزن.
        </Note>
      ) : null}
      <form className="ck-form" noValidate onSubmit={(event) => void verify(event)}>
        <div className="jy-field">
          <label className="jy-label" htmlFor="ac-otp">
            کد پیامک
          </label>
          <input
            ref={codeRef}
            id="ac-otp"
            className="jy-input jy-input--code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_DIGITS}
            disabled={closed !== null}
            value={code}
            aria-invalid={!closed && fieldError ? true : undefined}
            aria-describedby={!closed && fieldError ? 'ac-otp-error ac-otp-hint' : 'ac-otp-hint'}
            onChange={(event) => {
              setCode(event.target.value);
              setCodeError(null);
            }}
          />
          {!closed && fieldError ? <FieldError id="ac-otp-error">{fieldError}</FieldError> : null}
          <p id="ac-otp-hint" className="jy-hint">
            هر کد <span className="num">2</span> دقیقه اعتبار دارد.
          </p>
        </div>
        {closed ? null : (
          <button
            type="submit"
            className={`jy-btn jy-btn--primary jy-btn--lg${busy === 'verify' ? ' is-loading' : ''}`}
            disabled={busy !== null}
            aria-busy={busy === 'verify' || undefined}
          >
            ورود
          </button>
        )}
      </form>
      {waiting > 0 ? (
        <p className="ck-resend" data-testid="account-resend-wait">
          {closed ? 'ارسال کد تازه تا' : 'ارسال دوباره تا'} <span className="num">{formatClock(waiting)}</span>
        </p>
      ) : (
        <div className="ck-late" data-testid="account-code-late">
          <p className="ck-late__title">{closed ? 'کد تازه' : 'پیامک نرسید؟'}</p>
          {closed ? null : <p className="ck-late__text">گاهی پیامک تا یک دقیقه دیر می‌رسد. اگر هنوز نیامده:</p>}
          <div className="ck-late__actions">
            <button
              type="button"
              disabled={busy !== null}
              className={`jy-btn jy-btn--secondary${busy === 'code' ? ' is-loading' : ''}`}
              onClick={() => void send(stage.mobile, true)}
            >
              {closed ? 'ارسال کد تازه' : 'ارسال دوباره'}
            </button>
          </div>
          <p className="ck-late__text">
            کد فقط به شماره‌ای می‌رود که با آن سفارشی ثبت شده؛ شاید با شمارهٔ دیگری سفارش داده‌ای. {change('شماره را عوض کن')}.
          </p>
        </div>
      )}
      {resendError ? (
        <Note tone="error" testId="account-resend-error">
          {failureText(resendError, closed ? 'ارسال کد تازه' : 'ارسال دوباره')}
        </Note>
      ) : null}
    </section>
  );
}
