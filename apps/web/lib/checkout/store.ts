/**
 * مسیر خرید در مرورگر (۳ج؛ ADR-033 تا ADR-035): حالت قدم‌های شهر، نشانی، موبایل و کد، و مرور و پرداخت.
 *
 * بی React و بی مرورگر، با درخواست‌های تزریقی (`CheckoutApi`)، تا همهٔ حالت‌ها و شکست‌ها تست واحد داشته
 * باشند. رابط (`components/checkout/Checkout.tsx`) فقط نشانش می‌دهد و کارها را صدا می‌زند.
 *
 * - **سرور منبع حقیقت است** (قاعدهٔ ۲): هر عدد این قدم‌ها از `POST /api/checkout/quote` است، نه از
 *   تعرفهٔ درون باندل. از مرورگر فقط شناسهٔ سندها و انتخاب‌ها می‌رود.
 * - **عددی که دیده شد، همان که پرداخت می‌شود:** «پرداخت» جمع روی دکمه را می‌فرستد؛ اگر سرور عدد دیگری حساب
 *   کند، عدد تازه و دلیلش می‌آید و کاربر دوباره می‌زند.
 * - **یک کلیک، یک سفارش:** کلید «پرداخت» تا وقتی جزوه، جا، گیرنده و جمع همان‌اند همان می‌ماند؛ برگشت از
 *   درگاه و زدن دوباره همان سفارش را می‌دهد، نه سفارش دوم.
 * - **حالت در خود ماژول است:** برگشت به «جزوه و قیمت» و آمدن دوباره، نشانی و کد را پاک نمی‌کند.
 */

import type { Breakdown } from '@jozveyar/contracts';
import type { CheckoutItem, CheckoutQuote, DiscountCodeReason, Place } from '@jozveyar/contracts/checkout';
import { toLatinDigits } from '@jozveyar/text';
import { checkRecipient, normalizeIranMobile, type RecipientField, type RecipientInput } from '@jozveyar/text/input';

import type { ApiFailure, ApiResult, CheckoutApi } from './api';
import { newCheckoutKey, priceChange, type PriceChange } from './format';
import type { Step } from './steps';

/** قدم پرداخت سه چهره دارد: موبایل، کد پیامکی، و مرور. */
export type PayStage = 'mobile' | 'code' | 'review';

export interface Otp {
  mobile: string;
  /** لحظه‌ای (میلی‌ثانیه، ساعت مرورگر) که «ارسال دوباره» باز می‌شود. */
  resendAt: number;
  /** لحظه‌ای که سرور دیگر این کد را نمی‌پذیرد. */
  expiresAt: number;
  /** کد بسته شد: منقضی، فرصت‌ها تمام، یا سرور کدی برای این مرورگر نمی‌شناسد. */
  closed: 'expired' | 'locked' | 'missing' | null;
}

export type MobileError = { kind: 'invalid' } | { kind: 'signed_out' } | { kind: 'failure'; failure: ApiFailure };
export type CodeError = { kind: 'format' } | { kind: 'wrong'; attemptsLeft: number } | { kind: 'failure'; failure: ApiFailure };
export type PayNotice =
  | { kind: 'price_changed'; change: PriceChange; totalRials: number }
  | { kind: 'failure'; failure: ApiFailure };

export type Busy = 'start' | 'place' | 'quote' | 'code' | 'verify' | 'logout' | 'pay' | 'discount' | null;

export interface CheckoutState {
  items: CheckoutItem[] | null;
  /** قیمت سرور؛ `quoteItems` و `quotePlace` می‌گویند برای کدام جزوه و جا. */
  quote: CheckoutQuote | null;
  quoteItems: string | null;
  quotePlace: Place | null;
  /** کد تخفیفی که قیمت مرور با آن گرفته شد (برش ۱۱٫۴)؛ null یعنی بی کد. */
  quoteCode: string | null;
  place: Place | null;
  /** جایی که کاربر زد و قیمتش در راه است (دکمهٔ همان شهر در حال کار). */
  pendingPlace: Place | null;
  placeError: ApiFailure | null;
  recipient: RecipientInput;
  recipientErrors: RecipientField[];
  auth: { mobile: string } | null;
  stage: PayStage;
  mobile: string;
  mobileError: MobileError | null;
  otp: Otp | null;
  /** کدی که هنوز زنده بود و دوباره خواسته شد (۹۰ ثانیه نگذشته): «همان کد را بزن». */
  otpReused: boolean;
  code: string;
  codeError: CodeError | null;
  resendError: ApiFailure | null;
  quoteError: ApiFailure | null;
  payNotice: PayNotice | null;
  /**
   * کد تخفیف مرور (برش ۱۱٫۴، سؤال ۲۹۹): فیلد باز است، متنی که تایپ شده، کدی که سرور روی قیمت پذیرفت (یکدست، `WELCOME`)، و چرا کدی که زده
   * شد نخورد. کدِ پذیرفته در قیمت مرور و «پرداخت» می‌رود، و در پیش‌نویس همین زبانه می‌ماند.
   */
  discountOpen: boolean;
  discountInput: string;
  discount: string | null;
  discountError: DiscountCodeReason | null;
  busy: Busy;
}

/**
 * آنچه از مسیر خرید بعد از رفرش برمی‌گردد (۳د، ADR-036): جا، گیرنده، موبایلی که تایپ شده، شمارش معکوس کد (خود
 * کد نه)، و کلید «پرداخت» با آنچه با آن فرستاده شد، تا زدن دوباره همان سفارش را بدهد. قیمت نه: از سرور تازه
 * گرفته می‌شود. `auth` هم نه: از `GET /api/checkout`.
 */
export interface CheckoutDraft {
  place: Place | null;
  recipient: RecipientInput;
  mobile: string;
  otp: Otp | null;
  pay: { payload: string; key: string } | null;
  /** توکن سفارشی که آخرین «پرداخت» ساخت؛ صفحهٔ همان سفارش، وقتی پرداخت شد، پیش‌نویس را پاک می‌کند. */
  order: string | null;
  /** کد تخفیفی که سرور روی قیمت مرور پذیرفت (برش ۱۱٫۴)؛ با رفرش دوباره سنجیده می‌شود. پیش‌نویس پیش از ۱۱٫۴ ندارد. */
  discount: string | null;
}

export interface CheckoutStoreDeps {
  api: CheckoutApi;
  now: () => number;
  /** رفتن به درگاه یا صفحهٔ سفارش؛ صفحه عوض می‌شود. */
  navigate: (url: string) => void;
  newKey?: () => string;
}

/** کد پیامکی ۵ رقم است (ADR-033)؛ سرور هم همین را می‌سنجد. */
export const CODE_DIGITS = 5;
/**
 * کد ۲ دقیقه اعتبار دارد و «ارسال دوباره» پس از ۹۰ ثانیه باز می‌شود (ADR-033). وقتی سرور فقط «زود است»
 * می‌گوید (`resend_too_soon`)، کدی که هست تا ۳۰ ثانیه بعد از بازشدن ارسال دوباره زنده است.
 */
const CODE_OUTLIVES_RESEND_S = 120 - 90;

const itemsKey = (items: readonly CheckoutItem[] | null) => JSON.stringify(items);
const samePlace = (a: Place | null, b: Place | null) =>
  a === b || (a !== null && b !== null && a.provinceId === b.provinceId && a.cityId === b.cityId);
const numberIn = (body: Record<string, unknown>, key: string) =>
  typeof body[key] === 'number' && Number.isFinite(body[key]) ? (body[key] as number) : null;
const noAnswer: ApiFailure = { ok: false, status: 0, error: 'network', body: {} };

export function initialCheckout(): CheckoutState {
  return {
    items: null,
    quote: null,
    quoteItems: null,
    quotePlace: null,
    quoteCode: null,
    place: null,
    pendingPlace: null,
    placeError: null,
    recipient: { name: '', addressText: '', postalCode: '' },
    recipientErrors: [],
    auth: null,
    stage: 'mobile',
    mobile: '',
    mobileError: null,
    otp: null,
    otpReused: false,
    code: '',
    codeError: null,
    resendError: null,
    quoteError: null,
    payNotice: null,
    discountOpen: false,
    discountInput: '',
    discount: null,
    discountError: null,
    busy: null,
  };
}

/**
 * قیمت سرور همین جزوه، برای قدمی که نشانش می‌دهد: بی جای ارسال (قدم شهر؛ هر قیمتی از همین جزوه کرایهٔ هر
 * دو منطقه را دارد) یا با همان جا (نشانی و پرداخت). null یعنی قیمتِ همین‌ها هنوز نرسیده.
 */
export function quoteOf(state: CheckoutState, withPlace: boolean): CheckoutQuote | null {
  if (!state.quote || state.items === null || state.quoteItems !== itemsKey(state.items)) return null;
  if (withPlace && (state.place === null || !samePlace(state.quotePlace, state.place))) return null;
  // مرور با همان کد تخفیفی که پذیرفته شد (برش ۱۱٫۴)؛ قیمت بی کد پس از اعمال کد کهنه است، و برعکس.
  if (withPlace && state.quoteCode !== codeOf(state)) return null;
  return state.quote;
}

/** کد تخفیفی که قیمت مرور با آن خواسته می‌شود (برش ۱۱٫۴): فقط با نشست، چون سرور بی نشست کد را نمی‌سنجد. */
function codeOf(state: CheckoutState): string | null {
  return state.auth ? state.discount : null;
}

/** دلیل شکست کد تخفیف از بدنهٔ سرور (`discount_code_invalid`، `discount_unavailable`)؛ ناشناس یعنی «نیست». */
const DISCOUNT_REASONS: readonly DiscountCodeReason[] = ['unknown', 'disabled', 'not_started', 'ended', 'used_up', 'used_by_you'];
function discountReasonOf(body: Record<string, unknown>): DiscountCodeReason {
  return DISCOUNT_REASONS.includes(body.reason as DiscountCodeReason) ? (body.reason as DiscountCodeReason) : 'unknown';
}

export function createCheckoutStore(deps: CheckoutStoreDeps) {
  let state = initialCheckout();
  const listeners = new Set<() => void>();
  const newKey = deps.newKey ?? newCheckoutKey;
  /** کلید «پرداخت» و آنچه با آن فرستاده شد. */
  let lastPay: { payload: string; key: string } | null = null;
  /** سفارشی که آخرین «پرداخت» ساخت یا پیدا کرد. */
  let placedOrder: string | null = null;
  /** شمارهٔ آخرین درخواست قیمت؛ پاسخ دیررسِ درخواستی کهنه نادیده گرفته می‌شود. */
  let quoteSeq = 0;

  function set(patch: Partial<CheckoutState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  /**
   * قیمت سرور برای جزوهٔ کنونی و این جا؛ فقط پاسخ آخرین درخواست حساب است (بقیه null). با جا، کد تخفیف پذیرفته هم (برش ۱۱٫۴)؛ کدی که دیگر
   * نمی‌خورد (پر شد، روزش گذشت) کنار می‌رود و دلیلش زیر فیلد می‌آید، و قیمت بی کد دوباره خواسته می‌شود.
   */
  async function fetchQuote(place: Place | null): Promise<ApiResult<CheckoutQuote> | null> {
    const items = state.items;
    if (!items) return null;
    const code = place ? codeOf(state) : null;
    const seq = ++quoteSeq;
    const result = await deps.api.quote(items, place, code);
    if (seq !== quoteSeq) return null;
    if (result.ok) set({ quote: result.value, quoteItems: itemsKey(items), quotePlace: place, quoteCode: code });
    if (!result.ok && result.error === 'discount_code_invalid' && code !== null) {
      set({ discount: null, discountError: discountReasonOf(result.body), discountOpen: true });
      return fetchQuote(place);
    }
    return result;
  }

  /** قیمت تازهٔ مرور؛ دکمهٔ پرداخت تا رسیدنش در حال کار است. */
  function refreshQuote() {
    if (!state.place) return;
    set({ busy: state.busy ?? 'quote', quoteError: null });
    void fetchQuote(state.place).then((result) => {
      if (state.busy === 'quote') set({ busy: null });
      if (result && !result.ok) set({ quoteError: result });
    });
  }

  /** چهرهٔ قدم پرداخت: موبایلی که همین گوشی تأیید کرده، کدی که هنوز زنده است، یا موبایل. */
  function payStage(): PayStage {
    if (state.auth) return 'review';
    const otp = state.otp;
    if (otp && !otp.closed && deps.now() < otp.expiresAt) return 'code';
    return 'mobile';
  }

  function codeSent(mobile: string, resendInSeconds: number, expiresInSeconds: number, reused: boolean) {
    const at = deps.now();
    set({
      busy: null,
      stage: 'code',
      otp: { mobile, resendAt: at + resendInSeconds * 1000, expiresAt: at + expiresInSeconds * 1000, closed: null },
      otpReused: reused,
      code: '',
      codeError: null,
      mobileError: null,
      resendError: null,
    });
  }

  /** کد به این شماره؛ از قدم موبایل (`from: 'mobile'`) یا «ارسال دوباره» (`'code'`). */
  async function requestCode(mobile: string, from: 'mobile' | 'code') {
    set({ busy: 'code', mobileError: null, resendError: null });
    const result = await deps.api.requestCode(mobile);
    if (result.ok) {
      codeSent(result.value.mobile, result.value.resendInSeconds, result.value.expiresInSeconds, false);
      return;
    }
    const retryAfter = numberIn(result.body, 'retryAfterSeconds');
    if (result.error === 'resend_too_soon' && retryAfter !== null) {
      // کمتر از ۹۰ ثانیه پیش کدی برای همین شماره رفت، و «فقط آخرین کد» همان است (ADR-033).
      const at = deps.now();
      const known = state.otp?.mobile === mobile ? state.otp : null;
      if (known && !known.closed && from === 'mobile') {
        // همان کد زنده، با همان اعتبار: «همان را بزن».
        codeSent(mobile, retryAfter, (known.expiresAt - at) / 1000, true);
      } else if (known) {
        // کد بسته (سه بار اشتباه) یا «ارسال دوباره»ی زود: همان حال، تا باز شدن ارسال دوباره.
        set({ busy: null, stage: 'code', otp: { ...known, resendAt: at + retryAfter * 1000 } });
      } else {
        // کدی که همین مرورگر جای دیگری خواست (زبانهٔ دیگر): احتمالاً هنوز زنده است.
        codeSent(mobile, retryAfter, retryAfter + CODE_OUTLIVES_RESEND_S, true);
      }
      return;
    }
    if (from === 'mobile') {
      set({ busy: null, mobileError: result.error === 'invalid_mobile' ? { kind: 'invalid' } : { kind: 'failure', failure: result } });
    } else {
      set({ busy: null, resendError: result });
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** پیش‌نویس همین مسیر خرید، برای برگشت بعد از رفرش (`lib/draft.ts`). */
    draft(): CheckoutDraft {
      const { place, recipient, mobile, otp, discount } = state;
      return { place, recipient, mobile, otp, pay: lastPay, order: placedOrder, discount };
    },

    /**
     * مسیر خریدی که بعد از رفرش برگشت (۳د): پیش از «ادامه» و پیش از قیمت سرور. پیش‌نویس سنجیده رسیده است
     * (`lib/restore.ts`، و جا با فهرست شهرها در `restoreCheckout`).
     */
    hydrate(draft: CheckoutDraft) {
      lastPay = draft.pay;
      placedOrder = draft.order;
      set({
        place: draft.place,
        recipient: draft.recipient,
        mobile: draft.mobile,
        otp: draft.otp,
        discount: draft.discount,
        discountInput: draft.discount ?? '',
        discountOpen: draft.discount !== null,
      });
    },

    /** موبایلی که همین مرورگر پیش‌تر تأیید کرده (`GET /api/checkout`). */
    setAuth(auth: { mobile: string } | null) {
      if (auth?.mobile === state.auth?.mobile) return;
      set({ auth });
    },

    /**
     * «ادامه — آدرس و تحویل»: قیمت سرور همین جزوه پیش از رفتن به قدم شهر. جایی که پیش‌تر انتخاب شده
     * می‌ماند؛ آن‌وقت قیمت با همان جا.
     */
    async start(items: CheckoutItem[]): Promise<ApiResult<CheckoutQuote>> {
      set({ items, busy: 'start', quoteError: null, placeError: null, payNotice: null });
      const result = await fetchQuote(state.place);
      set({ busy: null });
      return result ?? noAnswer;
    },

    /**
     * جزوه در همین حین عوض شد (برگشت به قدم ۱ و آمدن با «جلو»ی مرورگر): قیمت تازه، برای همان جایی که
     * قدم لازم دارد.
     */
    sync(items: CheckoutItem[], withPlace: boolean) {
      if (itemsKey(items) === itemsKey(state.items)) return;
      set({ items, quoteError: null, payNotice: null });
      void fetchQuote(withPlace ? state.place : null).then((result) => {
        if (result && !result.ok) set({ quoteError: result });
      });
    },

    /** یک تپ روی شهر یا استان: قیمت با همین جا، و بعد نشانی. true یعنی برو به نشانی. */
    async choosePlace(place: Place): Promise<boolean> {
      if (state.busy === 'place') return false;
      set({ busy: 'place', pendingPlace: place, placeError: null });
      const result = await fetchQuote(place);
      if (!result || !result.ok) {
        set({ busy: null, pendingPlace: null, placeError: result && !result.ok ? result : null });
        return false;
      }
      set({ busy: null, pendingPlace: null, place });
      return true;
    },

    editRecipient(patch: Partial<RecipientInput>) {
      const touched = new Set(Object.keys(patch).map((key) => `recipient.${key}`));
      set({
        recipient: { ...state.recipient, ...patch },
        recipientErrors: state.recipientErrors.filter((field) => !touched.has(field)),
      });
    },

    /** «ادامه — موبایل و پرداخت»: همان قاعدهٔ سرور، همین‌جا؛ true یعنی برو به قدم پرداخت. */
    submitAddress(): boolean {
      const { fields } = checkRecipient(state.recipient);
      set({ recipientErrors: fields });
      return fields.length === 0;
    },

    /** قدم پرداخت باز شد: چهره‌اش، و برای مرور قیمت تازهٔ سرور (قیمت مرور از سرور است، ADR-034). */
    enterPay() {
      const stage = payStage();
      set({ stage, payNotice: null });
      if (stage === 'review') refreshQuote();
    },

    refreshQuote,

    /** صفحه از حافظهٔ مرورگر برگشت (دکمهٔ «برگشت» از درگاه): کاری که داشت صفحه را ترک می‌کرد، تمام است. */
    resume() {
      if (state.busy === 'pay') set({ busy: null });
    },

    editMobile(mobile: string) {
      set({ mobile, mobileError: null });
    },

    /** «کد تخفیف داری؟»: فیلد کد در مرور (برش ۱۱٫۴). */
    openDiscount() {
      set({ discountOpen: true });
    },

    editDiscount(discountInput: string) {
      set({ discountInput, discountError: null });
    },

    /**
     * «اعمال» کد تخفیف (برش ۱۱٫۴): قیمت مرور با همین کد از سرور. پذیرفته، کد یکدستِ سرور جای کد قبلی؛ نپذیرفته، دلیلش زیر فیلد و کد قبلی
     * (اگر بود) با قیمتش می‌ماند.
     */
    async applyDiscount() {
      const { items, place } = state;
      const input = state.discountInput.trim();
      if (!items || !place || !state.auth || state.busy) return;
      if (input === '') {
        set({ discountError: 'unknown' });
        return;
      }
      set({ busy: 'discount', discountError: null, payNotice: null });
      const seq = ++quoteSeq;
      const result = await deps.api.quote(items, place, input);
      if (seq !== quoteSeq) return;
      if (result.ok) {
        const code = result.value.breakdown.code?.code ?? null;
        set({ busy: null, quote: result.value, quoteItems: itemsKey(items), quotePlace: place, quoteCode: code, discount: code, discountInput: code ?? input });
        return;
      }
      if (result.error === 'discount_code_invalid') {
        set({ busy: null, discountError: discountReasonOf(result.body) });
        return;
      }
      if (result.error === 'auth_required') {
        set({ busy: null, auth: null, stage: 'mobile', mobile: state.auth?.mobile ?? state.mobile, mobileError: { kind: 'signed_out' } });
        return;
      }
      set({ busy: null, quoteError: result });
    },

    /** «حذف کد»: قیمت مرور بی کد. */
    removeDiscount() {
      set({ discount: null, discountInput: '', discountError: null, payNotice: null });
      refreshQuote();
    },

    /** «ارسال کد». */
    async sendCode() {
      if (state.busy === 'code') return;
      const mobile = normalizeIranMobile(state.mobile);
      if (!mobile) {
        set({ mobileError: { kind: 'invalid' } });
        return;
      }
      await requestCode(mobile, 'mobile');
    },

    /** «ارسال دوباره» و «ارسال کد تازه»، به همان شماره. */
    async resend() {
      const mobile = state.otp?.mobile;
      if (!mobile || state.busy === 'code') return;
      await requestCode(mobile, 'code');
    },

    editCode(code: string) {
      set({ code, codeError: null });
    },

    /** «تأیید کد»: نشست `jy_auth` و بعد مرور. `onAuth` به رابط پس از فایل خبر می‌دهد. */
    async verifyCode(onAuth?: (auth: { mobile: string }) => void) {
      const otp = state.otp;
      if (!otp || otp.closed || state.busy === 'verify') return;
      if (deps.now() >= otp.expiresAt) {
        set({ otp: { ...otp, closed: 'expired' } });
        return;
      }
      const code = toLatinDigits(state.code).replace(/\s/g, '');
      if (!new RegExp(`^\\d{${CODE_DIGITS}}$`).test(code)) {
        set({ codeError: { kind: 'format' } });
        return;
      }
      set({ busy: 'verify', codeError: null });
      const result = await deps.api.verifyCode(otp.mobile, code);
      if (result.ok) {
        const auth = { mobile: result.value.mobile };
        set({ busy: null, auth, otp: null, code: '', stage: 'review', mobileError: null });
        onAuth?.(auth);
        refreshQuote();
        return;
      }
      switch (result.error) {
        case 'wrong_code': {
          const left = numberIn(result.body, 'attemptsLeft') ?? 0;
          if (left <= 0) set({ busy: null, otp: { ...otp, closed: 'locked' } });
          else set({ busy: null, codeError: { kind: 'wrong', attemptsLeft: left } });
          return;
        }
        case 'code_expired':
          set({ busy: null, otp: { ...otp, closed: 'expired' } });
          return;
        case 'code_locked':
          set({ busy: null, otp: { ...otp, closed: 'locked' } });
          return;
        case 'no_code':
          set({ busy: null, otp: { ...otp, closed: 'missing' } });
          return;
        case 'invalid_code':
          set({ busy: null, codeError: { kind: 'format' } });
          return;
        default:
          set({ busy: null, codeError: { kind: 'failure', failure: result } });
      }
    },

    /**
     * «شماره را عوض کن» و «عوض کن» در مرور. نشستی که هست باطل می‌شود (ADR-033)؛ شماره در فیلد می‌ماند تا
     * فقط رقم غلطش عوض شود.
     */
    async changeMobile() {
      if (state.busy === 'logout') return;
      const previous = state.auth?.mobile ?? state.otp?.mobile ?? state.mobile;
      if (state.auth) {
        set({ busy: 'logout' });
        await deps.api.logout();
      }
      set({ busy: null, auth: null, stage: 'mobile', mobile: previous, mobileError: null, codeError: null, payNotice: null });
    },

    /**
     * «پرداخت X تومان»: سفارش و شروع پرداخت (ADR-034). موفق = رفتن به درگاه. برمی‌گرداند قدمی را که باید
     * به آن برگشت (گیرنده یا جای ارسالی که سرور نپذیرفت)، یا null.
     */
    async pay(): Promise<Step | null> {
      const quote = quoteOf(state, true);
      const { items, place } = state;
      if (!items || !place || !quote || state.busy) return null;
      const { value: recipient, fields } = checkRecipient(state.recipient);
      if (fields.length > 0) {
        set({ recipientErrors: fields });
        return 'address';
      }
      const expectedTotalRials = quote.breakdown.totalRials;
      const discountCode = codeOf(state);
      const payload = JSON.stringify([items, place, recipient, expectedTotalRials, discountCode]);
      if (lastPay?.payload !== payload) lastPay = { payload, key: newKey() };
      set({ busy: 'pay', payNotice: null });
      const result = await deps.api.placeOrder({
        items,
        place,
        recipient,
        checkoutKey: lastPay.key,
        expectedTotalRials,
        quoteSnapshot: quote.breakdown,
        discountCode,
      });
      if (result.ok) {
        const { order, payment } = result.value;
        placedOrder = order.token;
        // صفحه می‌رود؛ دکمه تا رفتن در حال کار می‌ماند (`resume` اگر مرورگر برش گرداند).
        deps.navigate(payment ? payment.redirectUrl : `/order/${order.token}`);
        return null;
      }
      set({ busy: null });
      switch (result.error) {
        case 'price_changed': {
          const after = result.body.breakdown as Breakdown | undefined;
          const totalRials = numberIn(result.body, 'totalRials');
          if (!after || totalRials === null) break;
          set({
            quote: { ...quote, breakdown: after },
            payNotice: { kind: 'price_changed', change: priceChange(quote.breakdown, after), totalRials },
          });
          return null;
        }
        case 'invalid_request': {
          const bad = (Array.isArray(result.body.fields) ? result.body.fields : []).filter(
            (field): field is RecipientField => typeof field === 'string' && field.startsWith('recipient.'),
          );
          if (bad.length > 0) {
            set({ recipientErrors: bad });
            return 'address';
          }
          break;
        }
        case 'invalid_place':
          set({ place: null });
          return 'city';
        case 'auth_required':
          // نشست این گوشی تمام شده یا جای دیگری باطل شد: یک بار دیگر کد.
          set({ auth: null, stage: 'mobile', mobile: state.auth?.mobile ?? state.mobile, mobileError: { kind: 'signed_out' } });
          return null;
        case 'discount_code_invalid':
          // کد میان مرور و «پرداخت» پر شد یا روزش گذشت (برش ۱۱٫۴): کنار می‌رود، دلیلش زیر فیلد، و قیمت تازهٔ بی کد؛ «پرداخت» دوباره زده می‌شود.
          set({ discount: null, discountError: discountReasonOf(result.body), discountOpen: true });
          refreshQuote();
          return null;
        case 'payment_checking': {
          // پرداختی از همین سفارش در حال بررسی است (برش ۷٫۲): صفحهٔ سفارش «در حال بررسی» را نشان می‌دهد، نه تلاش تازه.
          const token = (result.body.order as { token?: unknown } | undefined)?.token;
          if (typeof token === 'string') {
            placedOrder = token;
            deps.navigate(`/order/${token}`);
            return null;
          }
          break;
        }
      }
      set({ payNotice: { kind: 'failure', failure: result } });
      return null;
    },
  };
}

export type CheckoutStore = ReturnType<typeof createCheckoutStore>;
