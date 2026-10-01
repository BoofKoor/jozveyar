/**
 * درگاه پرداخت، پشت آداپتور (ADR-008؛ مشترک وب و پنل از برش ۷٫۲، ADR-050).
 *
 * - **آداپتور** (`PaymentGateway`): شروع (`start`: شناسهٔ تلاش نزد درگاه و نشانی صفحهٔ پرداخت)، استعلام (`inquire`) و تأیید (`verify`). درگاه
 *   نمونه (`mockGateway`، ADR-035) اینجاست و زیبال در `@jozveyar/payments/zibal`؛ هر دو همان کدهای وضعیت زیبال را می‌گویند (`status.ts`).
 * - **حکم برگشت** (`judge`، `settle.ts`): استعلام پیش از `verify`، و `verify` فقط برای «پرداخت‌شده، تأییدنشده» با مبلغ و شناسهٔ همان تلاش
 *   (سؤال‌های ۱۴۴ تا ۱۴۷). وب (برگشت از درگاه و استعلام خودکار) و پنل («استعلام از درگاه») هر دو همین را زیر قفل `settlePayment` صدا می‌زنند.
 * - **هیچ مقدار کلیدی در خطا:** هر شکست `PaymentError` است با کد خودش و فقط عدد پاسخ (کد HTTP و `result` درگاه)؛ نه متن پاسخ، نه سرآیند، نه
 *   بدنهٔ درخواست (که کد پذیرنده دارد).
 *
 * بی وابستگی: نوشتن و قفل مال `@jozveyar/db` است؛ اینجا فقط درگاه و حکم.
 */

import { randomBytes, randomInt } from 'node:crypto';

import { STATUS_PAID, STATUS_VERIFIED, STATUS_WAITING } from './status';

export * from './status';
export { judge, type AttemptSnapshot, type FailedVerdict, type GatewayCheck, type JudgeInput, type Verdict } from './settle';

/**
 * علت شکست یک درخواست به درگاه، کوتاه و بی مقدار کلید: `unavailable` (درگاه جواب نداد: شبکه، سقف زمان، تغییر مسیر، ۴۲۹ یا ۵xx)،
 * `rejected` (درگاه نپذیرفت؛ با `result` درگاه، مثل ۱۱۵ برای IP)، `malformed` (پاسخ بدشکل)، `unconfigured` (کد پذیرنده خالی است یا خوانده
 * نشد، یا نشانی برگشت نیست).
 */
export type PaymentErrorCode = 'unavailable' | 'rejected' | 'malformed' | 'unconfigured';

/** فقط عدد پاسخ درگاه: کد HTTP و `result` بدنه؛ هرگز متن. */
export interface PaymentErrorDetail {
  http?: number;
  result?: number;
}

export class PaymentError extends Error {
  constructor(
    readonly code: PaymentErrorCode,
    readonly detail: PaymentErrorDetail = {},
  ) {
    super(code);
    this.name = 'PaymentError';
  }
}

export const paymentErrorCode = (error: unknown): PaymentErrorCode => (error instanceof PaymentError ? error.code : 'unavailable');

/**
 * علت شکست برای ستون `payments.gateway_error` و رویدادها: کد، و عدد پاسخ درگاه اگر بود (`rejected:115`)؛ `result` بدنه بر کد HTTP مقدم.
 * هر خطای دیگری (باگ، قطع اتصال پایگاه داده) همان «جواب نداد» است.
 */
export function paymentErrorTag(error: unknown): string {
  const code = paymentErrorCode(error);
  const number = error instanceof PaymentError ? (error.detail.result ?? error.detail.http) : undefined;
  return number === undefined ? code : `${code}:${number}`;
}

/** برعکس `paymentErrorTag`؛ برچسب ناشناس همان «جواب نداد». */
export function parsePaymentErrorTag(tag: string | null | undefined): { code: PaymentErrorCode; number: number | null } {
  const match = /^(unavailable|rejected|malformed|unconfigured)(?::(-?\d{1,9}))?$/.exec(tag ?? '');
  if (!match) return { code: 'unavailable', number: null };
  return { code: match[1] as PaymentErrorCode, number: match[2] === undefined ? null : Number(match[2]) };
}

/** شکل برچسب `gateway_error`، همان که CHECK پایگاه داده می‌خواهد. */
export const isPaymentErrorTag = (tag: string) => /^(unavailable|rejected|malformed|unconfigured)(:-?\d{1,9})?$/.test(tag);

export interface GatewayStart {
  /** همان `payments.amount_rials`، که پایگاه داده برابر جمع منجمد سفارش می‌خواهد. */
  amountRials: number;
  /** نشانی برگشت کامل، با کلید برگشت همین تلاش (سؤال ۱۴۵)؛ درگاه نمونه نسبی. */
  callbackUrl: string;
  /** شناسهٔ سفارش نزد درگاه: «شمارهٔ سفارش-۸ نویسهٔ اول شناسهٔ تلاش» (`payments.gateway_order_id`). */
  orderId: string;
  /** «سفارش 10027 جزوه‌یار»؛ نه موبایل، نه کد ملی (کمینهٔ داده، ADR-050). */
  description: string;
}

export interface GatewayStarted {
  /** شناسهٔ تلاش نزد درگاه (`payments.authority`): `trackId` زیبال، یا `MOCK…` درگاه نمونه. */
  authority: string;
  /** صفحهٔ پرداخت؛ مرورگر با Referer دامنهٔ ما به آن می‌رود. */
  redirectUrl: string;
  raw?: unknown;
}

/** تلاشی که درگاه دربارهٔ آن پرسیده می‌شود: شناسه‌اش، و آنچه ما از آن انتظار داریم. */
export interface GatewayAttempt {
  authority: string;
  amountRials: number;
  /** `payments.gateway_order_id`؛ null فقط برای تلاش درگاه نمونهٔ پیش از ۷٫۲. */
  orderId: string | null;
  /** `payments.raw`؛ درگاه نمونه تصمیم صفحه‌اش را اینجا دارد. */
  raw: unknown;
}

/** پاسخ استعلام: وضعیت با کدهای زیبال، و هر چه درگاه گفت (مبلغ و شناسهٔ سفارش اگر داد). */
export interface GatewayInquiry {
  status: number;
  amountRials: number | null;
  orderId: string | null;
  /** کد پیگیری بانک، پس از پرداخت. */
  refId: string | null;
  /** کارت پوشیده، همان شکلی که درگاه داد. */
  cardMask: string | null;
  /** پاسخ، فقط فیلدهای شناخته (بی کد پذیرنده). */
  raw: unknown;
}

/** پاسخ `verify`: پول نهایی شد، با مبلغ و شناسه‌ای که خود درگاه گفت؛ یا «قبلاً تأیید شده» (۲۰۱) بی جزئیات. */
export type GatewayVerified =
  | { kind: 'verified'; amountRials: number; orderId: string | null; refId: string | null; cardMask: string | null; raw: unknown }
  | { kind: 'already'; raw: unknown };

export interface PaymentGateway {
  /** همان که در `payments.provider` می‌نشیند؛ برگشت و استعلام هر پرداخت با درگاه خود آن پرداخت (ADR-050). */
  readonly name: string;
  start(input: GatewayStart): Promise<GatewayStarted>;
  inquire(attempt: GatewayAttempt): Promise<GatewayInquiry>;
  verify(attempt: GatewayAttempt): Promise<GatewayVerified>;
}

/** نام درگاه برای مشتری و پنل. */
export const GATEWAY_NAMES: Readonly<Record<string, string>> = { mock: 'درگاه نمونه', zibal: 'زیبال' };
export const gatewayName = (provider: string) => GATEWAY_NAMES[provider] ?? provider;

/* ─────────────────────────── درگاه نمونه ─────────────────────────── */

/** Authority درگاه نمونه: ۳۶ نویسه، با پیشوندی که با هیچ درگاه واقعی قاطی نشود. */
export const MOCK_AUTHORITY = /^MOCK[0-9A-F]{32}$/;

/** تصمیم صفحهٔ درگاه نمونه، در `payments.raw`. */
export type MockDecision = 'success' | 'failure' | 'cancel';

const mockRaw = (raw: unknown) => (raw !== null && typeof raw === 'object' ? (raw as { decision?: unknown; verified?: unknown; refId?: unknown }) : {});

/**
 * درگاه نمونه (ADR-035): صفحه‌اش (`/pay/mock/<authority>`) تصمیم را در `payments.raw` می‌نشاند و استعلام همان را می‌خواند، به زبان وضعیت‌های
 * زیبال: بی تصمیم «در انتظار پرداخت»، موفق «پرداخت‌شده، تأییدنشده» تا `verify`، ناموفق «موجودی ناکافی»، انصراف «لغو با کاربر». مبلغ و شناسهٔ
 * سفارش همان انتظار برمی‌گردد: پولی جابه‌جا نمی‌شود. فقط در `CHECKOUT_MODE=mock` و هرگز روی jozveyar.com (`checkoutMode.ts`).
 */
export function mockGateway(options: { newRefId?: () => string } = {}): PaymentGateway {
  const newRefId = options.newRefId ?? (() => String(randomInt(100_000, 1_000_000)));
  return {
    name: 'mock',

    async start() {
      const authority = `MOCK${randomBytes(16).toString('hex').toUpperCase()}`;
      return { authority, redirectUrl: `/pay/mock/${authority}` };
    },

    async inquire(attempt) {
      const raw = mockRaw(attempt.raw);
      const verified = raw.verified === true;
      const status =
        raw.decision === 'success' ? (verified ? STATUS_VERIFIED : STATUS_PAID) : raw.decision === 'failure' ? 5 : raw.decision === 'cancel' ? 3 : STATUS_WAITING;
      return {
        status,
        amountRials: attempt.amountRials,
        orderId: attempt.orderId,
        refId: verified && typeof raw.refId === 'string' ? raw.refId : null,
        cardMask: null,
        raw: attempt.raw,
      };
    },

    async verify(attempt) {
      const raw = mockRaw(attempt.raw);
      if (raw.decision !== 'success') throw new PaymentError('rejected', { result: 202 });
      if (raw.verified === true) return { kind: 'already', raw: attempt.raw };
      const refId = newRefId();
      return {
        kind: 'verified',
        amountRials: attempt.amountRials,
        orderId: attempt.orderId,
        refId,
        cardMask: null,
        raw: { ...raw, verified: true, refId },
      };
    },
  };
}
