/**
 * آداپتور sms.ir (ADR-049): `fetch` خود Node، دست‌نویس و بی وابستگی، مثل SigV4 استوریج؛ نه بستهٔ `smsir-js`، که خطای axios پیکربندی
 * درخواست را با سرآیند `X-API-KEY` با خودش دارد.
 *
 * - **فقط دو درخواست:** ارسال با قالب (`POST /v1/send/verify`) و اعتبار حساب (`GET /v1/credit`). ارسال متن آزاد شماره خط می‌خواهد و لازم
 *   نیست؛ گزارش تحویل در برش ۷ خوانده نمی‌شود.
 * - **شکل** از بستهٔ رسمی خود sms.ir (`sms-typescript` 2.0.3 و `IPE.SmsIr` 1.2.7، یافتهٔ ۶): نشانی پایه `https://api.sms.ir`، کلید در
 *   سرآیند `X-API-KEY`، بدنهٔ ارسال `{ mobile, templateId, parameters: [{ name, value }] }`، و پاسخ `{ status, message, data }`؛ داده‌ی ارسال
 *   `{ messageId, cost }` و دادهٔ اعتبار یک عدد. موفق = HTTP 2xx با `status` برابر ۱، همان نمونهٔ مستند.
 * - **خطا:** شبکه، سقف زمان (۱۰ ثانیه)، ۵xx و ۴۲۹ (درخواست زیاد) `unavailable`؛ هر پاسخ دیگر `rejected`، با کد HTTP و `status` عددی
 *   بدنه کنارش. متن پاسخ، سرآیند و بدنهٔ درخواست هرگز به خطا یا لاگ نمی‌روند. یک تلاش، بی تکرار خودکار: پیامک دوبار نمی‌رود.
 * - **نشانی پایه از `SMSIR_API_URL`** (پیش‌فرض نشانی واقعی): تست و CI فقط سرور ساختگی می‌بینند (`fake/smsir.mjs`).
 * - **کلیدها با هر استفاده** (`keys`، همان `readServiceKey` پنل و `.env`، ADR-041): کلید API یا شناسهٔ قالب خالی یا «خوانده نشد» یعنی
 *   همان پیامک نمی‌رود (`unconfigured`)؛ هرگز برگشت بی‌صدا به کنسولی.
 */

import { SMS_TEMPLATES, validParam, type SmsPurpose } from './templates.js';
import { SmsError, type SmsTransport } from './types.js';

/** نشانی واقعی sms.ir؛ فقط وقتی `SMSIR_API_URL` چیزی نگوید. */
export const SMSIR_API_URL = 'https://api.sms.ir';
/** سقف زمان هر درخواست (ADR-049). */
export const SMSIR_TIMEOUT_MS = 10_000;

export interface SmsIrOptions {
  /** `SMSIR_API_URL`؛ خالی یعنی نشانی واقعی. */
  baseUrl?: string | undefined;
  timeoutMs?: number;
  /** فقط تست جایش را می‌گیرد. */
  fetch?: typeof fetch;
}

/** نشانی پایه، بی `/` ته. */
export const smsIrBase = (baseUrl: string | undefined) => (baseUrl?.trim() || SMSIR_API_URL).replace(/\/+$/, '');

/** شناسهٔ قالب sms.ir عدد است، نه نام (بستهٔ رسمی: `templateId: number`)؛ null اگر مقدار کلید عدد مثبت نیست. */
export function templateIdOf(value: string | null | undefined): number | null {
  const text = value?.trim() ?? '';
  if (!/^\d{1,9}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;

/** یک درخواست به sms.ir؛ خروجی `data` پاسخ موفق. */
async function call(options: SmsIrOptions, path: string, apiKey: string, body?: unknown): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const signal = AbortSignal.timeout(options.timeoutMs ?? SMSIR_TIMEOUT_MS);
  let response: Response;
  try {
    response = await doFetch(`${smsIrBase(options.baseUrl)}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'X-API-KEY': apiKey,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal,
    });
  } catch {
    throw new SmsError('unavailable', 'sms.ir جواب نداد');
  }
  // بدنه با همان سقف زمان؛ فقط `status` عددی و `data`ش خوانده می‌شود. بدنهٔ نه‌JSON یعنی بی `status`.
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (signal.aborted) throw new SmsError('unavailable', 'sms.ir جواب نداد', response.status);
  }
  const record = payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const status = numberOf(record.status);
  if (response.status >= 500 || response.status === 429) {
    throw new SmsError('unavailable', 'sms.ir الان جواب نمی‌دهد', response.status, status);
  }
  if (!response.ok || status !== 1) throw new SmsError('rejected', 'sms.ir نپذیرفت', response.status, status);
  return record.data;
}

export interface SmsIrSent {
  messageId: string | null;
  /** هزینه‌ای که sms.ir برای همین پیامک گفت؛ واحدش همان اعتبار حساب. */
  cost: number | null;
}

/** ارسال با قالب (`POST /v1/send/verify`). */
export async function smsIrSendVerify(
  options: SmsIrOptions,
  input: { apiKey: string; templateId: number; mobile: string; parameters: readonly { name: string; value: string }[] },
): Promise<SmsIrSent> {
  const data = await call(options, '/v1/send/verify', input.apiKey, {
    mobile: input.mobile,
    templateId: input.templateId,
    parameters: input.parameters.map(({ name, value }) => ({ name, value })),
  });
  const record = data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const id = numberOf(record.messageId);
  return { messageId: id === null ? null : String(id), cost: numberOf(record.cost) };
}

/** اعتبار حساب (`GET /v1/credit`)؛ بی پیامک و بی هزینه. پاسخی که عدد ندارد «جواب نداد» است. */
export async function smsIrCredit(options: SmsIrOptions, apiKey: string): Promise<number> {
  const credit = numberOf(await call(options, '/v1/credit', apiKey));
  if (credit === null) throw new SmsError('unavailable', 'اعتبار sms.ir خوانده نشد');
  return credit;
}

/** کلید API و شناسهٔ قالب یک هدف، همین حالا (پنل بر `.env` مقدم)؛ null یعنی خالی یا «خوانده نشد». */
export interface SmsIrKeys {
  apiKey: string | null;
  templateId: string | null;
}

/** پیامک با قالب sms.ir، پشت همان `SmsTransport` (ADR-049). */
export function smsIrTransport(options: SmsIrOptions & { keys: (purpose: SmsPurpose) => Promise<SmsIrKeys> }): SmsTransport {
  return {
    name: 'smsir',
    async send(message) {
      const template = SMS_TEMPLATES[message.purpose];
      const params = message.params ?? [];
      // پیامکی که پارامترهایش با قالب نمی‌خواند باگ است، نه خطای sms.ir؛ و نیمه‌پر نمی‌رود.
      if (params.length !== template.params.length || !params.every(validParam)) {
        throw new Error(`پارامترهای پیامک ${message.purpose} با قالب نمی‌خواند`);
      }
      const keys = await options.keys(message.purpose);
      const templateId = templateIdOf(keys.templateId);
      if (!keys.apiKey || templateId === null) throw new SmsError('unconfigured', `کلید یا قالب ${message.purpose} sms.ir خالی است`);
      const sent = await smsIrSendVerify(options, {
        apiKey: keys.apiKey,
        templateId,
        mobile: message.to,
        parameters: template.params.map((name, i) => ({ name, value: params[i]! })),
      });
      return { status: 'sent', providerMessageId: sent.messageId, cost: sent.cost };
    },
  };
}

/** `SMS_PROVIDER` پنل (سؤال ۱۱۴): فقط `smsir` واقعی است؛ هر چیز دیگر، و نبودنش، کنسولی. */
export const smsProviderOf = (value: string | undefined): 'smsir' | 'console' =>
  value?.trim().toLowerCase() === 'smsir' ? 'smsir' : 'console';
