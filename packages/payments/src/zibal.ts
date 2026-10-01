/**
 * آداپتور زیبال (برش ۷٫۲، ADR-050): پیاده‌سازی `PaymentGateway` با سه درخواست JSON به `gateway.zibal.ir`: `request` (شروع)، `inquiry`
 * (استعلام) و `verify` (تأیید).
 *
 * - **دست‌نویس با `fetch` خود Node**، بی بستهٔ زیبال (قاعدهٔ ۷؛ سؤال ۱۲۰): شکل `request` و `verify`، کدهای `result` و `status`، و نشانی
 *   صفحهٔ پرداخت (`/start/<trackId>`) از بستهٔ رسمی `zibal` ۲٫۰٫۰ خوانده شد؛ پارامترهای برگشت (`trackId`، `success`، `status`، `orderId`)
 *   از README نسخهٔ ۱٫۰٫۲ همان ناشر. `inquiry` در بستهٔ رسمی نیست (README ۲٫۰٫۰: «فعلاً جزو API عمومی این پکیج نیست»)؛ نشانی و بدنه‌اش
 *   (`merchant`، `trackId`) و فیلدهای پاسخ (`status`، `amount`، `orderId`، `refNumber`، `cardNumber`…) از دو بستهٔ غیررسمی، پس هر فیلدی که
 *   نیامد «نگفت» است، نه خطا (حکم با `status`، و مبلغ از `verify` رسمی، سؤال ۱۴۶).
 * - **یک تلاش، سقف ۱۰ ثانیه**، بی تغییر مسیر (`redirect: 'error'`). نشانی پایه از `ZIBAL_API_URL` (پیش‌فرض نشانی واقعی)، تا تست و CI فقط
 *   سرور ساختگی را ببینند (`mock/zibal.mjs`)؛ صفحهٔ پرداخت هم زیر همان نشانی پایه است.
 * - **کد پذیرنده با هر استفاده** (`merchant`، در وب و پنل همان `readServiceKey`)؛ خالی یا «خوانده نشد» یعنی همان درخواست نمی‌رود
 *   (`unconfigured`). کد پذیرنده فقط در بدنهٔ درخواست است: نه در `raw`، نه خطا، نه لاگ.
 * - **هیچ متنی در خطا:** هر شکست `PaymentError` با کد و عدد پاسخ (`result` بدنه یا کد HTTP)؛ خطای خود `fetch` دور ریخته می‌شود.
 */

import { PaymentError, type GatewayAttempt, type GatewayInquiry, type GatewayStart, type GatewayVerified, type PaymentGateway } from './index';

export const ZIBAL_API_URL = 'https://gateway.zibal.ir';
export const ZIBAL_TIMEOUT_MS = 10_000;

/** کد پذیرندهٔ پذیرفتنی: نویسهٔ چاپی ASCII، بی فاصله. جز این به بدنهٔ درخواست نمی‌رود. */
export const isZibalMerchant = (value: string) => /^[\x21-\x7e]{4,128}$/.test(value);

/** شناسهٔ تلاش زیبال (`trackId`): عدد مثبت، همان قاعدهٔ بستهٔ رسمی. */
export const isTrackId = (value: string) => /^[1-9]\d{0,18}$/.test(value);

export interface ZibalOptions {
  /** نشانی پایه (`ZIBAL_API_URL`)؛ پیش‌فرض نشانی واقعی. */
  baseUrl?: string;
  timeoutMs?: number;
  /** برای تست. */
  fetch?: typeof fetch;
}

/**
 * نشانی پایه از `.env`: فقط http یا https، بی رمز، پرسش و `#`؛ نبودن یا شکل نادرست یعنی نشانی واقعی. سرور ساختگی تست
 * `http://127.0.0.1:<پورت>` است.
 */
export function zibalBaseUrl(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) return ZIBAL_API_URL;
  try {
    const url = new URL(raw);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !url.search && !url.hash) {
      return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    }
  } catch {
    // نشانی نادرست
  }
  return ZIBAL_API_URL;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const intOf = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) ? value : null);

/** عدد یا رشتهٔ رقمی، مثل `trackId` و `refNumber`. */
const idOf = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : typeof value === 'string' && /^\d{1,30}$/.test(value)
      ? value
      : null;

/** شناسهٔ سفارش آن‌طور که برگشت؛ رشته یا عدد. */
const orderIdOf = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : null;

/** کارت پوشیده، فقط رقم و نشانهٔ پوشاندن (`*`، `-`، فاصله): هر چیز دیگری نگه داشته نمی‌شود. */
const cardOf = (value: unknown) => (typeof value === 'string' && /^[0-9*xX•\- ]{6,40}$/.test(value) ? value.trim() : null);

/** همان فیلدهای شناختهٔ پاسخ، برای `payments.raw`؛ هیچ متن و هیچ چیز ناشناس. */
function rawOf(body: Record<string, unknown>) {
  const keep: Record<string, unknown> = {};
  for (const key of ['result', 'status', 'amount', 'wage', 'shaparakFee'] as const) {
    const n = intOf(body[key]);
    if (n !== null) keep[key] = n;
  }
  const trackId = idOf(body.trackId);
  if (trackId) keep.trackId = trackId;
  const ref = idOf(body.refNumber);
  if (ref) keep.refNumber = ref;
  const order = orderIdOf(body.orderId);
  if (order) keep.orderId = order;
  const card = cardOf(body.cardNumber);
  if (card) keep.cardNumber = card;
  for (const key of ['createdAt', 'paidAt', 'verifiedAt'] as const) {
    const value = body[key];
    if (typeof value === 'string' && value.length <= 40 && /^[\d\-:T. +Z]+$/.test(value)) keep[key] = value;
  }
  return keep;
}

export function zibalClient(options: ZibalOptions = {}) {
  const base = zibalBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? ZIBAL_TIMEOUT_MS;

  /** یک درخواست؛ خروجی بدنهٔ پاسخ ۲xx با `result` عددی. */
  async function call(path: string, merchant: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!isZibalMerchant(merchant)) throw new PaymentError('unconfigured');
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, ...body }),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // شبکه، سقف زمان، یا تغییر مسیر؛ خود خطا دور ریخته می‌شود.
      throw new PaymentError('unavailable');
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // بدنهٔ ناخوانا
    }
    if (!response.ok) {
      const detail = { http: response.status };
      if (response.status === 429 || response.status >= 500) throw new PaymentError('unavailable', detail);
      throw new PaymentError('rejected', detail);
    }
    const data = record(payload);
    const result = intOf(data?.result);
    if (!data || result === null) throw new PaymentError('malformed', { http: response.status });
    return data;
  }

  /** پاسخ با `result` جز ۱۰۰: درگاه نپذیرفت، با همان کد. */
  const rejectUnless = (data: Record<string, unknown>, ...accepted: number[]) => {
    const result = intOf(data.result)!;
    if (!accepted.includes(result)) throw new PaymentError('rejected', { result });
    return result;
  };

  /** `trackId` به همان شکلی که بستهٔ رسمی می‌فرستد: عدد، اگر در عدد امن جا می‌شود. */
  const trackIdBody = (trackId: string) => {
    if (!isTrackId(trackId)) throw new PaymentError('rejected', { result: 203 });
    const n = Number(trackId);
    return Number.isSafeInteger(n) ? n : trackId;
  };

  return {
    /** شروع: `trackId` و نشانی صفحهٔ پرداخت. مبلغ ریال است و باید بیش از ۱٬۰۰۰ باشد (کد ۱۰۵). */
    async request(input: { merchant: string; amountRials: number; callbackUrl: string; orderId: string; description: string }) {
      if (!Number.isSafeInteger(input.amountRials) || input.amountRials <= 1_000) throw new PaymentError('rejected', { result: 105 });
      const data = await call('/v1/request', input.merchant, {
        amount: input.amountRials,
        callbackUrl: input.callbackUrl,
        orderId: input.orderId,
        description: input.description,
      });
      rejectUnless(data, 100);
      const trackId = idOf(data.trackId);
      if (!trackId || !isTrackId(trackId)) throw new PaymentError('malformed');
      return { trackId, paymentUrl: `${base}/start/${trackId}`, raw: rawOf(data) };
    },

    /** استعلام: وضعیت با کدهای زیبال، و هر چه گفت. */
    async inquiry(input: { merchant: string; trackId: string }): Promise<GatewayInquiry> {
      const data = await call('/v1/inquiry', input.merchant, { trackId: trackIdBody(input.trackId) });
      rejectUnless(data, 100);
      const status = intOf(data.status);
      if (status === null) throw new PaymentError('malformed');
      return {
        status,
        amountRials: intOf(data.amount),
        orderId: orderIdOf(data.orderId),
        refId: idOf(data.refNumber),
        cardMask: cardOf(data.cardNumber),
        raw: rawOf(data),
      };
    },

    /**
     * تأیید: پول نهایی می‌شود. موفق فقط `result` ۱۰۰ با `status` ۱ و مبلغ (همان قاعدهٔ بستهٔ رسمی)؛ ۲۰۱ «قبلاً تأیید شده»؛ هر چیز دیگر
     * «نپذیرفت» با کدش (۲۰۲ پرداخت‌نشده یا ناموفق، ۲۰۳ `trackId` نامعتبر).
     */
    async verify(input: { merchant: string; trackId: string }): Promise<GatewayVerified> {
      const data = await call('/v1/verify', input.merchant, { trackId: trackIdBody(input.trackId) });
      const result = rejectUnless(data, 100, 201);
      if (result === 201) return { kind: 'already', raw: rawOf(data) };
      const amount = intOf(data.amount);
      if (intOf(data.status) !== 1 || amount === null || amount <= 0) throw new PaymentError('malformed');
      return {
        kind: 'verified',
        amountRials: amount,
        orderId: orderIdOf(data.orderId),
        refId: idOf(data.refNumber),
        cardMask: cardOf(data.cardNumber),
        raw: rawOf(data),
      };
    },
  };
}

export type ZibalClient = ReturnType<typeof zibalClient>;

/**
 * درگاه زیبال: کد پذیرنده با هر درخواست از `merchant` (مقدار پنل بر `.env` مقدم، ADR-041). نشانی برگشت را آن که تلاش را می‌سازد می‌دهد
 * (`PAYMENT_CALLBACK_URL` با کلید برگشت همان تلاش).
 */
export function zibalGateway(options: ZibalOptions & { merchant: () => Promise<string | null> }): PaymentGateway {
  const client = zibalClient(options);
  const merchant = async () => {
    const value = await options.merchant();
    if (!value) throw new PaymentError('unconfigured');
    return value;
  };
  const trackIdOf = (attempt: GatewayAttempt) => attempt.authority;
  return {
    name: 'zibal',
    async start(input: GatewayStart) {
      const started = await client.request({ merchant: await merchant(), ...input });
      return { authority: started.trackId, redirectUrl: started.paymentUrl, raw: started.raw };
    },
    async inquire(attempt) {
      return client.inquiry({ merchant: await merchant(), trackId: trackIdOf(attempt) });
    },
    async verify(attempt) {
      return client.verify({ merchant: await merchant(), trackId: trackIdOf(attempt) });
    },
  };
}
