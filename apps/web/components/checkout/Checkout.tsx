'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PriceList } from '@jozveyar/contracts';
import type { CheckoutItem, CheckoutQuote, Place } from '@jozveyar/contracts/checkout';
import { PROVINCES, findCity, findProvince, placeIsValid, popularCities, searchCities, type City } from '@jozveyar/geo';
import { DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { formatNumber, formatTomans } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';
import { checkoutApi, type ApiFailure } from '../../lib/checkout/api';
import { formatClock, formatMobile, minutesFrom } from '../../lib/checkout/format';
import type { Step } from '../../lib/checkout/steps';
import {
  createCheckoutStore,
  quoteOf,
  type CheckoutDraft,
  type CheckoutState,
  type CheckoutStore,
} from '../../lib/checkout/store';
import { publishDockHeight } from '../../lib/dock';
import type { JozveView } from '../../lib/jozveView';
import type { OrderConfig } from '../../lib/orderConfig';
import { RECIPIENT_LIMITS, checkRecipient, type RecipientField } from '../../lib/recipient';
import { Note, SizeNames } from '../AnalysisCard';
import { FlowNav, SumValue, SummaryLines, Tomans, printLabel } from './parts';
import { JozveBrief, Pieces, Recap, RecapAddress, RecapDelivery, RecapJozveValue, placeName } from './recap';

/*
 * مسیر خرید در همان صفحه (طرح تأییدشدهٔ docs/ui/mockups/checkout.html؛ ADR-033 تا ADR-035): شهر با یک تپ،
 * نشانی، موبایل و کد پیامکی، و مرور و پرداخت. تکهٔ جدای JS است و با «ادامه» (یا نشانهٔ قصد روی آن) می‌آید،
 * با دادهٔ ۱۳۲۳ شهر؛ هیچ‌کدام در باندل اولیه یا تکهٔ «جزوه و قیمت» نیستند.
 *
 * حالت و کارها در `lib/checkout/store.ts`اند (تست واحد)؛ اینجا فقط نمایش. کار بعدی همیشه یک دکمه است، در
 * خلاصه و در نوار موبایل (`<button form>`، و Enter درون فیلد)؛ قدم شهر دکمه ندارد، چون تپ روی شهر خودش کار
 * است. هر عدد این قدم‌ها قیمت سرور است (قاعدهٔ ۲).
 */

let store: CheckoutStore | null = null;

/** یک مسیر خرید در هر بار صفحه؛ با برگشت به «جزوه و قیمت» و آمدن دوباره همان می‌ماند. */
export function checkoutStore(): CheckoutStore {
  store ??= createCheckoutStore({
    api: checkoutApi(window.fetch.bind(window)),
    now: () => Date.now(),
    navigate: (url) => window.location.assign(url),
  });
  return store;
}

/**
 * مسیر خریدی که بعد از رفرش برگشت (۳د، ADR-036). جایی که در فهرست شهرها نیست، یا شهرش مال استان دیگری است،
 * کنار می‌رود و قدم شهر دوباره می‌آید؛ بقیه همان.
 */
export function restoreCheckout(draft: CheckoutDraft) {
  const { place } = draft;
  checkoutStore().hydrate({ ...draft, place: place && placeIsValid(place.provinceId, place.cityId) ? place : null });
}

/** «تحویل به پست تا 2 روز کاری» (ADR-013)؛ عدد سفارش واقعی را صفحهٔ سفارش از خود سفارش می‌گیرد. */
const SLA_DAYS = 2;

interface Destination {
  provinceName: string;
  cityName: string | null;
}

function destinationOf(place: Place): Destination {
  return {
    provinceName: findProvince(place.provinceId)?.name ?? '',
    cityName: place.cityId === null ? null : (findCity(place.cityId)?.name ?? null),
  };
}

/** ساعت دیوار، هر نیم ثانیه، فقط وقتی شمارش معکوسی روی صفحه است. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** با آمدن هر قدم فوکوس همان‌جا: تیتر کارت، یا فیلدی که باید پر شود. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

/* ───────────────────────────── پیام‌ها ───────────────────────────── */

/** پیام شکستی که به فیلد خاصی نمی‌خورد، با راه جلو. `retry` نام دکمه‌ای است که باید دوباره زد. */
function failureText(failure: ApiFailure, retry: string): ReactNode {
  switch (failure.error) {
    case 'network':
      return `ارتباط برقرار نشد. اینترنت را ببین و دوباره «${retry}» را بزن.`;
    case 'too_many_codes': {
      const minutes = minutesFrom(Number(failure.body.retryAfterSeconds) || 60);
      const who =
        failure.body.scope === 'ip'
          ? 'از این اینترنت در یک ساعت گذشته کد زیادی خواسته شده.'
          : failure.body.scope === 'site'
            ? 'الان درخواست کد پیامکی خیلی زیاد است.'
            : 'برای این شماره در یک ساعت گذشته کد زیادی خواسته شده.';
      return (
        <>
          {who} حدود <span className="num">{formatNumber(minutes)}</span> دقیقهٔ دیگر دوباره امتحان کن.
        </>
      );
    }
    case 'sms_unavailable':
      return 'پیامک فرستاده نشد. چند دقیقهٔ دیگر دوباره امتحان کن.';
    case 'shipping_unavailable':
      return 'ارسال پستی الان ممکن نیست. کمی بعد دوباره امتحان کن.';
    case 'invalid_place':
      return 'این جا را نشناختیم؛ شهر را دوباره انتخاب کن.';
    default:
      return `الان نشد؛ چند لحظهٔ دیگر دوباره «${retry}» را بزن.`;
  }
}

/** فایل‌های جزوه دیگر روی سرور نیستند یا تا کمتر از یک ساعت دیگر نمی‌مانند (ADR-034): «دوباره بینداز». */
const FILES_GONE: ReadonlySet<string> = new Set(['files_expiring', 'documents_not_found', 'documents_not_ready', 'order_expired']);

function FilesGone({ onRestart }: { onRestart: () => void }) {
  return (
    <Note tone="error" testId="files-gone">
      فایل‌های این جزوه دیگر روی سرور نمی‌مانند. جزوه را دوباره بینداز تا با فایل تازه سفارش بدهی.
      <div className="mt-3">
        <button type="button" className="jy-btn jy-btn--secondary" onClick={onRestart}>
          دوباره بینداز
        </button>
      </div>
    </Note>
  );
}

/* ───────────────────────────── فیلد ───────────────────────────── */

/**
 * فیلد کیت: برچسب همیشه بالای فیلد، راهنما، و خطا با سه نشانه (لبهٔ دوپیکسلی، آیکون، پیامی که می‌گوید چه
 * کنی). خطا جای راهنما می‌نشیند؛ هر دو با `aria-describedby` به فیلد بسته‌اند (`<id>-note`).
 */
function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode }) {
  return (
    <div className="jy-field">
      <label className="jy-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-note`} className="jy-error" data-testid={`${id}-error`}>
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-note`} className="jy-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const noteOf = (id: string, shown: boolean) => (shown ? `${id}-note` : undefined);

/* ───────────────────────────── قدم شهر ───────────────────────────── */

const byName = new Intl.Collator('fa');

function CityStep({ state, quote, onChosen }: { state: CheckoutState; quote: CheckoutQuote | null; onChosen: (place: Place) => void }) {
  const [query, setQuery] = useState('');
  const [provinces, setProvinces] = useState(false);
  const title = useFocusOnMount<HTMLHeadingElement>();
  const popular = useMemo(() => popularCities(), []);
  const results = useMemo(() => (query.trim() ? searchCities(query, 8) : []), [query]);
  const allProvinces = useMemo(() => [...PROVINCES].sort((a, b) => byName.compare(a.name, b.name)), []);
  const busy = state.busy === 'place';
  const pending = state.pendingPlace;
  const rate = (zoneId: string) => quote?.shippingByZone.find((zone) => zone.zoneId === zoneId);
  const [tehran, other] = [rate('tehran'), rate('other')];

  const choose = (place: Place) => {
    if (!busy) onChosen(place);
  };
  const cityButton = (city: City, className: string, children: ReactNode) => {
    const mine = pending?.cityId === city.id;
    return (
      <button
        type="button"
        disabled={busy}
        aria-busy={mine || undefined}
        onClick={() => choose({ provinceId: city.provinceId, cityId: city.id })}
        className={`${className}${mine ? ' is-loading' : ''}`}
      >
        {children}
      </button>
    );
  };

  return (
    <section className="jy-card" aria-labelledby="ck-title">
      <h1 id="ck-title" ref={title} tabIndex={-1} className="jy-card__title">
        به کدام شهر بفرستیم؟
      </h1>
      <p className="ck-sub" data-testid="zone-rates">
        {tehran?.shippingRials != null && other?.shippingRials != null ? (
          <>
            کرایهٔ پست پیشتاز در {tehran.name} <Tomans rials={tehran.shippingRials} /> و {other.name}{' '}
            <Tomans rials={other.shippingRials} /> تومان
          </>
        ) : (
          'کرایهٔ پست پیشتاز با انتخاب شهر می‌آید.'
        )}
      </p>

      {/* جست‌وجو بالای دکمه‌ها: در گوشی صفحه‌کلید نیمهٔ پایین را می‌گیرد، پس نتیجه باید درست زیر فیلد بیاید */}
      <div className="ck-search">
        <span className="jy-icon jy-icon-search" aria-hidden="true" />
        <input
          id="city-q"
          className="jy-input"
          type="search"
          value={query}
          placeholder="شهر دیگر؟ نامش را بنویس"
          autoComplete="off"
          enterKeyHint="search"
          aria-labelledby="ck-title"
          aria-controls={query.trim() ? 'city-list' : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setProvinces(false);
          }}
          onKeyDown={(event) => {
            // Enter اولین نتیجه را برمی‌دارد؛ همان که با یک تپ هم برداشته می‌شد.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            const first = results[0];
            if (first) choose({ provinceId: first.provinceId, cityId: first.id });
          }}
        />
      </div>

      {provinces ? (
        <>
          <p className="ck-miss">استانت را انتخاب کن؛ نام شهر یا روستا را در نشانی می‌نویسی.</p>
          <ul id="province-list" className="ck-results" aria-label="استان‌ها">
            {allProvinces.map((province) => {
              const mine = pending?.provinceId === province.id && pending.cityId === null;
              return (
                <li key={province.id}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-busy={mine || undefined}
                    onClick={() => choose({ provinceId: province.id, cityId: null })}
                    className={`ck-result${mine ? ' is-loading' : ''}`}
                  >
                    <span>{province.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : query.trim() ? (
        <>
          {results.length > 0 ? (
            <ul id="city-list" className="ck-results" aria-label="شهرهای پیدا شده">
              {results.map((city) => (
                <li key={city.id}>
                  {cityButton(
                    city,
                    'ck-result',
                    <>
                      <span>{city.name}</span>
                      <span className="ck-result__prov">{findProvince(city.provinceId)?.name}</span>
                    </>,
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ck-miss" role="status">
              شهری با این نام پیدا نشد.
            </p>
          )}
          <p className="ck-miss">
            شهرت در فهرست نیست؟{' '}
            <button type="button" className="jy-link" onClick={() => setProvinces(true)}>
              استان را انتخاب کن
            </button>{' '}
            و نام شهر یا روستا را در نشانی بنویس.
          </p>
        </>
      ) : (
        <div className="ck-cities" role="group" aria-label="شهرهای پرتکرار">
          {popular.map((city) => cityButton(city, 'jy-btn jy-btn--secondary jy-btn--lg', city.name))}
        </div>
      )}

      {state.placeError ? (
        <div className="ck-card-note">
          <Note tone="error" testId="place-error">
            {failureText(state.placeError, 'شهر')}
          </Note>
        </div>
      ) : null}
    </section>
  );
}

/* ───────────────────────────── قدم نشانی ───────────────────────────── */

function recipientError(field: RecipientField, value: string): string {
  const length = tidyInputFa(value).length;
  switch (field) {
    case 'recipient.addressText':
      return length > RECIPIENT_LIMITS.addressText.max
        ? `نشانی بیش از ${RECIPIENT_LIMITS.addressText.max} نویسه است؛ کوتاه‌ترش کن.`
        : 'نشانی را کامل‌تر بنویس: خیابان، کوچه، پلاک و واحد.';
    case 'recipient.postalCode':
      return 'کد پستی 10 رقم است. اگر نمی‌دانی، خالی بگذار.';
    case 'recipient.name':
      return length > RECIPIENT_LIMITS.name.max
        ? `نام گیرنده بیش از ${RECIPIENT_LIMITS.name.max} نویسه است.`
        : 'نام و نام خانوادگی گیرنده را بنویس.';
  }
}

const FIELD_IDS: Record<RecipientField, string> = {
  'recipient.addressText': 'ck-address-text',
  'recipient.postalCode': 'ck-postal',
  'recipient.name': 'ck-name',
};

/** اولین فیلد خطادار، به ترتیب فرم، فوکوس می‌گیرد؛ دکمهٔ «ادامه» بیرون از فرم است. */
function focusFirstError(errors: readonly RecipientField[]): boolean {
  const first = (Object.keys(FIELD_IDS) as RecipientField[]).find((field) => errors.includes(field));
  if (!first) return false;
  document.getElementById(FIELD_IDS[first])?.focus();
  return true;
}

function AddressStep({
  state,
  place,
  shippingRials,
  method,
  onSubmit,
  onCity,
}: {
  state: CheckoutState;
  place: Place;
  shippingRials: number | null;
  method: string;
  onSubmit: () => void;
  onCity: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const dest = destinationOf(place);
  const store = checkoutStore();
  const { recipient, recipientErrors } = state;
  const errorOf = (field: RecipientField) =>
    recipientErrors.includes(field) ? recipientError(field, recipient[field.slice('recipient.'.length) as 'name'] ?? '') : null;
  const errors = {
    addressText: errorOf('recipient.addressText'),
    postalCode: errorOf('recipient.postalCode'),
    name: errorOf('recipient.name'),
  };

  // برگشت از «پرداخت» با فیلدی که سرور نپذیرفت: فوکوس روی همان فیلد، نه تیتر.
  useEffect(() => {
    if (!focusFirstError(checkoutStore().getState().recipientErrors)) title.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <section className="jy-card" aria-labelledby="ck-title">
      <div className="jy-card__head">
        <h1 id="ck-title" ref={title} tabIndex={-1} className="jy-card__title">
          نشانی در {placeName(dest)}
        </h1>
        <button type="button" className="jy-btn jy-btn--text ck-head-btn" onClick={onCity}>
          شهر دیگر
        </button>
      </div>
      <p className="ck-sub">
        {dest.provinceName} · {method}
        {shippingRials !== null ? (
          <>
            {' '}
            <Tomans rials={shippingRials} /> تومان
          </>
        ) : null}
      </p>
      <form
        id="ck-address"
        className="ck-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field
          id="ck-address-text"
          label="نشانی"
          hint={place.cityId === null ? 'نام شهر یا روستا را هم بنویس.' : undefined}
          error={errors.addressText}
        >
          <textarea
            id="ck-address-text"
            className="jy-input"
            rows={3}
            autoComplete="street-address"
            placeholder="خیابان، کوچه، پلاک، واحد"
            value={recipient.addressText}
            aria-invalid={errors.addressText ? true : undefined}
            aria-describedby={noteOf('ck-address-text', Boolean(errors.addressText) || place.cityId === null)}
            onChange={(event) => store.editRecipient({ addressText: event.target.value })}
          />
        </Field>
        <Field
          id="ck-postal"
          label={
            <>
              کد پستی <span className="jy-optional">(اختیاری)</span>
            </>
          }
          hint={
            <>
              <span className="num">10</span> رقم. اگر نمی‌دانی، خالی بگذار.
            </>
          }
          error={errors.postalCode}
        >
          <input
            id="ck-postal"
            className="jy-input jy-input--ltr ck-short"
            inputMode="numeric"
            autoComplete="postal-code"
            value={recipient.postalCode ?? ''}
            aria-invalid={errors.postalCode ? true : undefined}
            aria-describedby="ck-postal-note"
            onChange={(event) => store.editRecipient({ postalCode: event.target.value })}
          />
        </Field>
        <Field id="ck-name" label="نام گیرنده" hint="روی بسته همین نام نوشته می‌شود." error={errors.name}>
          <input
            id="ck-name"
            className="jy-input"
            autoComplete="name"
            placeholder="نام و نام خانوادگی"
            value={recipient.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby="ck-name-note"
            onChange={(event) => store.editRecipient({ name: event.target.value })}
          />
        </Field>
      </form>
    </section>
  );
}

/* ───────────────────────────── قدم پرداخت: موبایل ───────────────────────────── */

function MobileStep({ state }: { state: CheckoutState }) {
  const input = useFocusOnMount<HTMLInputElement>();
  const store = checkoutStore();
  const error = state.mobileError;
  const fieldError =
    error?.kind === 'invalid'
      ? 'شمارهٔ موبایل درست نیست؛ 11 رقم است و با 09 شروع می‌شود.'
      : error?.kind === 'failure'
        ? failureText(error.failure, 'ارسال کد')
        : null;

  return (
    <section className="jy-card" aria-labelledby="ck-title">
      <h1 id="ck-title" tabIndex={-1} className="jy-card__title">
        تأیید با پیامک
      </h1>
      <p className="ck-sub">یک کد به موبایلت پیامک می‌کنیم؛ رمز و ثبت‌نام لازم نیست.</p>
      {error?.kind === 'signed_out' ? (
        <div className="ck-card-note">
          <Note tone="warning" testId="signed-out">
            تأیید موبایل این گوشی دیگر معتبر نیست. یک بار دیگر کد بگیر؛ سفارشت همین‌جا مانده.
          </Note>
        </div>
      ) : null}
      <form
        id="ck-mobile"
        className="ck-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void store.sendCode();
        }}
      >
        <Field id="ck-tel" label="شمارهٔ موبایل" hint="کد رهگیری پست هم به همین شماره پیامک می‌شود." error={fieldError}>
          <input
            ref={input}
            id="ck-tel"
            className="jy-input jy-input--ltr ck-short"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="09123456789"
            value={state.mobile}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby="ck-tel-note"
            onChange={(event) => store.editMobile(event.target.value)}
          />
        </Field>
      </form>
    </section>
  );
}

/* ───────────────────────────── قدم پرداخت: کد ───────────────────────────── */

function CodeStep({ state, now }: { state: CheckoutState; now: number }) {
  const store = checkoutStore();
  const otp = state.otp!;
  // بستن کد با گذشتن ۲ دقیقه، بی آنکه منتظر پاسخ سرور بمانیم؛ سرور هم همین را می‌گوید.
  const closed = otp.closed ?? (now >= otp.expiresAt ? 'expired' : null);
  const waiting = Math.max(0, (otp.resendAt - now) / 1000);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!closed) input.current?.focus({ preventScroll: true });
  }, [closed]);

  const error = state.codeError;
  const fieldError =
    error?.kind === 'format' ? (
      <>
        کد <span className="num">5</span> رقم است؛ همان را که پیامک شد بزن.
      </>
    ) : error?.kind === 'wrong' ? (
      <>
        کد درست نیست. دوباره نگاه کن و بزن؛ <span className="num">{formatNumber(error.attemptsLeft)}</span> بار دیگر فرصت هست.
      </>
    ) : error?.kind === 'failure' ? (
      failureText(error.failure, 'تأیید کد')
    ) : null;
  const number = <span className="num">{formatMobile(otp.mobile)}</span>;
  const change = (text: string) => (
    <button type="button" className="jy-link" onClick={() => void store.changeMobile()}>
      {text}
    </button>
  );

  return (
    <section className="jy-card" aria-labelledby="ck-title">
      <h1 id="ck-title" tabIndex={-1} className="jy-card__title">
        کد تأیید
      </h1>
      <p className="ck-sub">
        کد را به {number} پیامک کردیم. {change('شماره را عوض کن')}
      </p>
      {closed ? (
        <div className="ck-card-note">
          <p className="jy-note jy-note--warning" role="alert" data-testid="code-closed">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            <span>
              {closed === 'expired' ? (
                <>
                  این کد دیگر اعتبار ندارد؛ هر کد <span className="num">2</span> دقیقه اعتبار دارد. کد تازه بگیر.
                </>
              ) : closed === 'locked' ? (
                'این کد سه بار اشتباه زده شد و دیگر پذیرفته نمی‌شود. کد تازه بگیر.'
              ) : (
                'کدی برای این شماره در همین مرورگر پیدا نشد. کد تازه بگیر.'
              )}
            </span>
          </p>
        </div>
      ) : state.otpReused ? (
        <div className="ck-card-note">
          <Note tone="info" testId="code-reused">
            کد را همین چند لحظه پیش به همین شماره فرستادیم؛ همان را بزن.
          </Note>
        </div>
      ) : null}
      <form
        id="ck-code"
        className="ck-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void store.verifyCode();
        }}
      >
        <Field
          id="ck-otp"
          label="کد پیامک"
          hint={
            closed ? undefined : (
              <>
                هر کد <span className="num">2</span> دقیقه اعتبار دارد.
              </>
            )
          }
          error={closed ? undefined : fieldError}
        >
          <input
            ref={input}
            id="ck-otp"
            className="jy-input jy-input--code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={5}
            disabled={closed !== null}
            value={state.code}
            aria-invalid={!closed && fieldError ? true : undefined}
            aria-describedby={noteOf('ck-otp', !closed)}
            onChange={(event) => store.editCode(event.target.value)}
          />
        </Field>
      </form>
      {closed ? (
        waiting > 0 ? (
          <p className="ck-resend" data-testid="resend-wait">
            ارسال کد تازه تا <span className="num">{formatClock(waiting)}</span>
          </p>
        ) : null
      ) : waiting > 0 ? (
        <p className="ck-resend" data-testid="resend-wait">
          ارسال دوباره تا <span className="num">{formatClock(waiting)}</span>
        </p>
      ) : (
        <div className="ck-late" data-testid="code-late">
          <p className="ck-late__title">پیامک نرسید؟</p>
          <p className="ck-late__text">گاهی پیامک تا یک دقیقه دیر می‌رسد. اگر هنوز نیامده:</p>
          <div className="ck-late__actions">
            <button
              type="button"
              disabled={state.busy === 'code'}
              className={`jy-btn jy-btn--secondary${state.busy === 'code' ? ' is-loading' : ''}`}
              onClick={() => void store.resend()}
            >
              ارسال دوباره
            </button>
          </div>
          <p className="ck-late__text">
            شماره {number} است؟ اگر نه، {change('عوضش کن')}.
          </p>
        </div>
      )}
      {state.resendError ? (
        <div className="ck-card-note">
          <Note tone="error" testId="resend-error">
            {failureText(state.resendError, closed ? 'ارسال کد تازه' : 'ارسال دوباره')}
          </Note>
        </div>
      ) : null}
    </section>
  );
}

/* ───────────────────────────── قدم پرداخت: مرور ───────────────────────────── */

function ReviewStep({
  state,
  place,
  jozve,
  method,
  onDesk,
  onAddress,
  onRestart,
}: {
  state: CheckoutState;
  place: Place;
  jozve: Parameters<typeof RecapJozveValue>[0]['jozve'];
  method: string;
  onDesk: () => void;
  onAddress: () => void;
  onRestart: () => void;
}) {
  const title = useFocusOnMount<HTMLHeadingElement>();
  const store = checkoutStore();
  const recipient = checkRecipient(state.recipient).value;
  const notice = state.payNotice;
  const failure = notice?.kind === 'failure' ? notice.failure : state.quoteError;

  return (
    <section className="jy-card" aria-labelledby="ck-title">
      <h1 id="ck-title" ref={title} tabIndex={-1} className="jy-card__title">
        مرور و پرداخت
      </h1>
      <p className="ck-sub">یک بار دیگر نگاه کن؛ بعد از پرداخت، جزوه به صف چاپ می‌رود.</p>

      {notice?.kind === 'price_changed' ? (
        <div className="ck-card-note">
          <p className="jy-note jy-note--warning" role="alert" data-testid="price-changed">
            <span className="jy-icon jy-icon-warning" aria-hidden="true" />
            <span>
              قیمت عوض شد: حالا <Tomans rials={notice.totalRials} /> تومان است،{' '}
              {notice.change.kind === 'pages' ? (
                <>
                  چون سرور جزوه را <span className="num">{formatNumber(notice.change.after)}</span> صفحه شمرد، نه{' '}
                  <span className="num">{formatNumber(notice.change.before)}</span>
                </>
              ) : notice.change.kind === 'shipping' ? (
                'چون کرایهٔ ارسال عوض شده'
              ) : notice.change.kind === 'tariff' ? (
                'چون تعرفه به‌روز شده'
              ) : (
                'چون قیمت روی سرور دوباره حساب شد'
              )}
              . اگر موافقی، دوباره «پرداخت» را بزن.
            </span>
          </p>
        </div>
      ) : null}
      {failure ? (
        <div className="ck-card-note">
          {FILES_GONE.has(failure.error) ? (
            <FilesGone onRestart={onRestart} />
          ) : failure.error === 'gateway_unavailable' ? (
            <Note tone="error" testId="pay-failed">
              درگاه پرداخت الان جواب نمی‌دهد. سفارش{' '}
              <span className="num">{String((failure.body.order as { number?: number } | undefined)?.number ?? '')}</span> با
              همین قیمت نگه داشته شد؛ چند دقیقهٔ دیگر دوباره «پرداخت» را بزن.
            </Note>
          ) : failure.error === 'quote_warnings' ? (
            <Note tone="warning" testId="pay-failed">
              این سفارش از حداقل مبلغ کمتر است. چند جزوه را با هم بفرست تا هزینهٔ ارسال بین‌شان تقسیم شود.
            </Note>
          ) : (
            <Note tone="error" testId="pay-failed">
              {failureText(failure, 'پرداخت')}
            </Note>
          )}
        </div>
      ) : null}

      <Recap
        rows={[
          {
            label: 'جزوه',
            testId: 'recap-jozve',
            value: <RecapJozveValue jozve={jozve} />,
            edit: (
              <button type="button" className="jy-link ck-edit" onClick={onDesk}>
                تغییر
              </button>
            ),
          },
          {
            label: 'ارسال به',
            testId: 'recap-address',
            value: (
              <RecapAddress
                name={recipient.name}
                city={placeName(destinationOf(place))}
                addressText={recipient.addressText}
                postalCode={recipient.postalCode}
              />
            ),
            edit: (
              <button type="button" className="jy-link ck-edit" onClick={onAddress}>
                ویرایش
              </button>
            ),
          },
          {
            label: 'موبایل',
            testId: 'recap-mobile',
            value: (
              <>
                <span className="num">{formatMobile(state.auth?.mobile ?? '')}</span>
                <span className="jy-badge jy-badge--success">
                  <span className="jy-icon jy-icon-success" aria-hidden="true" />
                  تأیید شد
                </span>
              </>
            ),
            edit: (
              <button type="button" className="jy-link ck-edit" disabled={state.busy === 'logout'} onClick={() => void store.changeMobile()}>
                عوض کن
              </button>
            ),
          },
          { label: 'تحویل', value: <RecapDelivery method={method} slaDays={SLA_DAYS} /> },
        ]}
      />
    </section>
  );
}

/* ───────────────────────────── کار بعدی: خلاصه و نوار ───────────────────────────── */

interface NextAction {
  /** متن دکمهٔ خلاصه. */
  label: ReactNode;
  /** متن کوتاه نوار موبایل. */
  short: string;
  /** نام دکمهٔ نوار، وقتی متنش کوتاه‌تر از کار است. */
  name?: string;
  /** دکمه‌ای که فرمِ قدم را می‌فرستد (`<button form>`)، یا کاری بی فرم. */
  form?: string;
  onClick?: () => void;
  busy: boolean;
  disabled?: boolean;
}

function NextButton({ action, short }: { action: NextAction; short: boolean }) {
  return (
    <button
      type={action.form ? 'submit' : 'button'}
      form={action.form}
      disabled={action.busy || action.disabled}
      aria-busy={action.busy || undefined}
      aria-label={short ? action.name : undefined}
      onClick={action.onClick}
      className={`jy-btn jy-btn--primary jy-btn--lg${short ? ' shrink-0' : ' jy-btn--block home-sum__go'}${
        action.busy ? ' is-loading' : ''
      }`}
    >
      {short ? action.short : action.label}
      {action.busy ? null : <span className="jy-icon jy-icon-arrow" aria-hidden="true" />}
    </button>
  );
}

/* ───────────────────────────── مسیر خرید ───────────────────────────── */

interface Props {
  /** قدم جاری؛ هرگز `desk`، که رابط پس از فایل خودش نشان می‌دهد. */
  step: Step;
  go: (step: Step, options?: { replace?: boolean }) => void;
  /** همان قلم «جزوه و قیمت»: سندهای روی سرور به ترتیب صحافی، و انتخاب‌ها. */
  items: CheckoutItem[];
  view: JozveView;
  config: OrderConfig;
  priceList: PriceList;
  /** موبایلی که همین مرورگر تأیید کرده، از `GET /api/checkout`. */
  auth: { mobile: string } | null;
  onAuth: (auth: { mobile: string } | null) => void;
  /** فایل‌ها دیگر روی سرور نیستند: «دوباره بینداز». */
  onRestart: () => void;
}

export function Checkout({ step, go, items, view, config, priceList, auth, onAuth, onRestart }: Props) {
  const store = checkoutStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const withPlace = step !== 'city';
  const itemsKey = JSON.stringify(items);

  useEffect(() => store.setAuth(auth), [store, auth]);
  // موبایلی که همین‌جا تأیید یا باطل شد، به رابط پس از فایل هم می‌رسد (با برگشت و آمدن دوباره همان است).
  useEffect(() => {
    const current = store.getState().auth;
    if (current?.mobile !== auth?.mobile) onAuth(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فقط وقتی موبایل همین‌جا عوض شد
  }, [store, state.auth]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- کلید جزوه، نه هویت آرایه
  useEffect(() => store.sync(items, withPlace), [store, itemsKey, withPlace]);
  useEffect(() => {
    if (step === 'pay') store.enterPay();
  }, [store, step]);
  // برگشت از درگاه با دکمهٔ «برگشت» مرورگر، از حافظهٔ مرورگر: «پرداخت» دیگر در حال کار نیست.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) store.resume();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [store]);

  // قدمی که داده‌اش نیست (مثلاً «جلو»ی مرورگر بعد از پاک شدن نشانی): قدم پیش از آن.
  const recipientReady = checkRecipient(state.recipient).fields.length === 0;
  const fallback: Step | null =
    step !== 'city' && !state.place ? 'city' : step === 'pay' && !recipientReady ? 'address' : null;
  useEffect(() => {
    if (fallback) go(fallback, { replace: true });
  }, [fallback, go]);

  const stage = state.stage;
  const now = useNow(step === 'pay' && stage === 'code' && state.otp !== null);
  const quote = quoteOf(state, withPlace);
  const place = state.place;
  const method = priceList.shippingMethods[DEFAULT_SHIPPING_METHOD_ID]?.nameFa ?? 'پست پیشتاز';
  const dest = place ? destinationOf(place) : null;
  const breakdown = quote?.breakdown ?? null;
  const item = breakdown?.items[0];
  const bindingName = priceList.bindingTypes[config.bindingTypeId]?.nameFa ?? '';
  const print = printLabel(config.colorMode, config.sidesMode);
  const files = view.included.map((s) => ({ name: s.name, pageCount: s.pageCount }));
  const shipped = withPlace && breakdown?.shippingRials != null && dest ? breakdown.shippingRials : null;

  if (fallback) return null;

  const otpClosed = state.otp ? (state.otp.closed ?? (now >= state.otp.expiresAt ? 'expired' : null)) : null;
  const action: NextAction | null =
    step === 'city'
      ? null
      : step === 'address'
        ? { label: 'ادامه — موبایل و پرداخت', short: 'ادامه', name: 'ادامه — موبایل و پرداخت', form: 'ck-address', busy: false }
        : stage === 'mobile'
          ? { label: 'ارسال کد', short: 'ارسال کد', form: 'ck-mobile', busy: state.busy === 'code' }
          : stage === 'code'
            ? otpClosed
              ? {
                  label: 'ارسال کد تازه',
                  short: 'کد تازه',
                  name: 'ارسال کد تازه',
                  onClick: () => void store.resend(),
                  busy: state.busy === 'code',
                  // سرور کد تازه را پیش از ۹۰ ثانیه نمی‌دهد (ADR-033)؛ شمارش معکوس زیر فیلد است.
                  disabled: now < state.otp!.resendAt,
                }
              : { label: 'تأیید کد', short: 'تأیید کد', form: 'ck-code', busy: state.busy === 'verify' }
            : {
                label: breakdown ? (
                  <>
                    پرداخت <Tomans rials={breakdown.totalRials} /> تومان
                  </>
                ) : (
                  'پرداخت'
                ),
                short: 'پرداخت',
                name: breakdown ? `پرداخت ${formatTomans(breakdown.totalRials, false)} تومان` : 'پرداخت',
                onClick: () => {
                  void store.pay().then((back) => {
                    if (back) go(back);
                  });
                },
                busy: state.busy === 'pay' || state.busy === 'quote',
                disabled: !quote,
              };

  const card =
    step === 'city' ? (
      <CityStep
        state={state}
        quote={quoteOf(state, false)}
        onChosen={(chosen) => {
          void store.choosePlace(chosen).then((ok) => ok && go('address'));
        }}
      />
    ) : step === 'address' && place ? (
      <AddressStep
        state={state}
        place={place}
        shippingRials={shipped}
        method={method}
        onSubmit={() => {
          if (store.submitAddress()) go('pay');
          else focusFirstError(store.getState().recipientErrors);
        }}
        onCity={() => go('city')}
      />
    ) : stage === 'review' && place ? (
      <ReviewStep
        state={state}
        place={place}
        jozve={{ files, pageCount: view.pageCount, print, bindingName, copies: config.copies }}
        method={method}
        onDesk={() => go('desk')}
        onAddress={() => go('address')}
        onRestart={onRestart}
      />
    ) : stage === 'code' && state.otp ? (
      <CodeStep state={state} now={now} />
    ) : (
      <MobileStep state={state} />
    );

  const brief =
    files.length === 1 ? (
      <Pieces
        parts={[
          <>
            <span className="num">{formatNumber(view.pageCount)}</span> صفحه
          </>,
          ...(view.summary.pageSizes.length > 0 ? [<SizeNames key="sizes" sizes={view.summary.pageSizes} />] : []),
        ]}
      />
    ) : undefined;

  return (
    <>
      {/* نشانهٔ قدم‌های خرید: سؤال‌ها کنار می‌روند (checkout.css) */}
      <span hidden data-checkout="" />
      <FlowNav
        current={step === 'pay' ? 3 : 2}
        onDesk={() => go('desk')}
        onAddress={step === 'pay' ? () => go('address') : undefined}
      />

      <div className="home-desk">
        {card}
        {step !== 'pay' && state.quoteError ? (
          FILES_GONE.has(state.quoteError.error) ? (
            <FilesGone onRestart={onRestart} />
          ) : (
            <Note tone="error" testId="quote-error">
              قیمت سرور نرسید. {failureText(state.quoteError, 'ادامه')}
            </Note>
          )
        ) : null}
      </div>

      <aside className="home-side" aria-labelledby="summary-title">
        <div className="jy-card home-sum">
          <h2 id="summary-title" className="jy-card__title">
            خلاصهٔ سفارش
          </h2>
          <JozveBrief files={files} pageCount={view.pageCount} meta={brief} />
          {item ? (
            <SummaryLines
              item={item}
              print={print}
              bindingName={bindingName}
              shipping={shipped !== null && dest ? { label: `ارسال ${method} به ${placeName(dest)}`, rials: shipped } : null}
            />
          ) : null}
          <div className="home-sum__total">
            <span className="home-sum__label">جمع</span>
            <SumValue
              rials={breakdown ? (withPlace ? breakdown.totalRials : breakdown.totalWithoutShippingRials) : null}
              testId="summary-total"
            />
          </div>
          {withPlace ? (
            <p className="home-sum__ship">
              <span className="jy-icon jy-icon-truck" aria-hidden="true" />
              <span>
                تحویل به پست تا <span className="num">{formatNumber(SLA_DAYS)}</span> روز کاری بعد از پرداخت.
              </span>
            </p>
          ) : breakdown?.shippingFromRials != null ? (
            <p className="home-sum__ship" data-testid="shipping-from">
              <span className="jy-icon jy-icon-truck" aria-hidden="true" />
              <span>
                + ارسال از <Tomans rials={breakdown.shippingFromRials} /> تومان. کرایهٔ دقیق با انتخاب شهر می‌آید.
              </span>
            </p>
          ) : null}
          {action ? <NextButton action={action} short={false} /> : null}
          {step === 'pay' && stage === 'review' ? (
            <>
              <p className="home-sum__secure">
                <span className="jy-icon jy-icon-lock" aria-hidden="true" />
                پرداخت امن با همهٔ کارت‌های بانکی
              </p>
              <p className="home-sum__terms">
                با پرداخت،{' '}
                <a href="/terms" target="_blank" rel="noopener">
                  قوانین جزوه‌یار
                </a>{' '}
                را می‌پذیری.
              </p>
            </>
          ) : (
            <p className="home-sum__secure">
              <span className="jy-icon jy-icon-lock" aria-hidden="true" />
              {step === 'pay' ? 'رمز و ثبت‌نام لازم نیست.' : 'ثبت‌نام لازم نیست؛ موبایل فقط موقع پرداخت.'}
            </p>
          )}
        </div>
      </aside>

      <div ref={publishDockHeight} className="home-dock" role="region" aria-label="قیمت">
        <div className="site-wrap home-dock__in">
          <p className="home-dock__price">
            <span className="home-dock__label">{withPlace ? 'جمع با ارسال' : 'جمع'}</span>
            <SumValue
              rials={breakdown ? (withPlace ? breakdown.totalRials : breakdown.totalWithoutShippingRials) : null}
              testId="price-total"
            />
            <span className="home-dock__ship">
              {withPlace && dest ? (
                `${method} به ${placeName(dest)}`
              ) : breakdown?.shippingFromRials != null ? (
                <>
                  + ارسال از <Tomans rials={breakdown.shippingFromRials} /> تومان
                </>
              ) : null}
            </span>
          </p>
          {action ? <NextButton action={action} short /> : null}
        </div>
      </div>
    </>
  );
}
