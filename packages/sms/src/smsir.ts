/**
 * آداپتور sms.ir (برش ۷، ADR-049): پیاده‌سازی `SmsTransport`، فقط ارسال با قالب تأییدشده (`POST /v1/send/verify`)، و اعتبار حساب
 * (`GET /v1/credit`) برای «آزمایش» کلید API و کارت «اعتبار پیامک» پنل.
 *
 * - **دست‌نویس با `fetch` خود Node**، بی بستهٔ sms.ir (مثل SigV4 استوریج): بستهٔ رسمی قدیمی (`smsir-js`) axios دارد و خطای axios
 *   پیکربندی درخواست را با سرآیند کلید با خودش می‌برد. شکل درخواست و پاسخ از بسته‌های رسمی خوانده شد (`smsir-js` ۱٫۳٫۳، `sms-typescript`
 *   ۲٫۰٫۳، `IPE.SmsIr` ۱٫۲٫۷): سرآیند `X-API-KEY`؛ پاسخ `{ status, message, data }`؛ ارسال با قالب `data: { messageId, cost }`؛ اعتبار
 *   `data: number`؛ پاسخ ۲xx یعنی sms.ir پذیرفت، و خطا با کد HTTP (۴۰۰ پارامتر یا قالب، ۴۰۱ کلید، ۴۰۳ دسترسی، ۴۲۹ درخواست زیاد، ۵xx).
 * - **یک تلاش، سقف ۱۰ ثانیه**، بی تغییر مسیر (`redirect: 'error'`: سرآیند کلید به میزبان دیگری نمی‌رود). نشانی پایه از `SMSIR_API_URL`
 *   (پیش‌فرض نشانی واقعی)، تا تست و CI فقط سرور ساختگی را ببینند (`mock/smsir.mjs`).
 * - **کلیدها با هر استفاده** (`keys`، در وب و پنل همان `readServiceKey`): کلید یا شناسهٔ قالب خالی یا «خوانده نشد» یعنی همان پیامک نمی‌رود
 *   (`unconfigured`)؛ هرگز برگشت بی‌صدا به کنسولی.
 * - **هیچ مقداری در خطا:** هر شکست `SmsError` است با کد خودش و فقط عدد پاسخ (کد HTTP و `status` بدنه)؛ نه متن پاسخ، نه سرآیند، نه بدنهٔ
 *   درخواست. خطای خود `fetch` هم دور ریخته می‌شود (خطای سرآیند نادرست مقدار سرآیند را در متنش دارد)، و کلید پیش از فرستادن شکلش
 *   سنجیده می‌شود.
 */

import { SmsError, type SmsErrorDetail, type SmsTransport } from './index';
import { SMS_TEMPLATES, isParamValue, type SmsTemplateKey } from './templates';

export const SMSIR_API_URL = 'https://api.sms.ir';
export const SMSIR_TIMEOUT_MS = 10_000;

export type SmsIrKeyName = 'SMS_API_KEY' | SmsTemplateKey;

/** کلید API پذیرفتنی: نویسهٔ چاپی ASCII، بی فاصله. جز این به سرآیند نمی‌رود. */
export const isSmsIrApiKey = (value: string) => /^[\x21-\x7e]{8,512}$/.test(value);

/** شناسهٔ قالب sms.ir: عدد مثبت. راز نیست؛ پنل کاملش را نشان می‌دهد. */
export const isSmsIrTemplateId = (value: string) => /^[1-9]\d{0,9}$/.test(value);

export interface SmsIrOptions {
  /** نشانی پایه (`SMSIR_API_URL`)؛ پیش‌فرض نشانی واقعی. */
  baseUrl?: string;
  timeoutMs?: number;
  /** برای تست. */
  fetch?: typeof fetch;
}

export interface SmsIrParameter {
  name: string;
  value: string;
}

/** ارسالی که sms.ir پذیرفت: شناسهٔ پیامک و هزینه‌اش (به واحد خود sms.ir)، اگر پاسخ داشت. */
export interface SmsIrSent {
  messageId: string | null;
  cost: number | null;
}

/**
 * نشانی پایه از `.env`: فقط http یا https، بی مسیر و پرسش؛ نبودن یا شکل نادرست یعنی نشانی واقعی. سرور ساختگی تست
 * `http://127.0.0.1:<پورت>` است.
 */
export function smsIrBaseUrl(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) return SMSIR_API_URL;
  try {
    const url = new URL(raw);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !url.search && !url.hash) {
      return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    }
  } catch {
    // نشانی نادرست
  }
  return SMSIR_API_URL;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** شکل پاسخ sms.ir، بی متن پیامش: فقط `status` عددی و `data`. */
function envelope(payload: unknown): { status: number | undefined; data: unknown } {
  const body = record(payload);
  const status = body && typeof body.status === 'number' && Number.isInteger(body.status) ? body.status : undefined;
  return { status, data: body?.data };
}

export function smsIrClient(options: SmsIrOptions = {}) {
  const base = smsIrBaseUrl(options.baseUrl);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? SMSIR_TIMEOUT_MS;

  /** یک درخواست؛ خروجی `data` پاسخ ۲xx. */
  async function call(path: string, apiKey: string, body?: unknown, limitMs = timeoutMs): Promise<unknown> {
    if (!isSmsIrApiKey(apiKey)) throw new SmsError('unconfigured');
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'X-API-KEY': apiKey,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(limitMs),
      });
    } catch {
      // شبکه، سقف زمان، یا تغییر مسیر؛ خود خطا دور ریخته می‌شود.
      throw new SmsError('unavailable');
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // بدنهٔ ناخوانا: پاسخ ۲xx همچنان یعنی پذیرفت.
    }
    const { status, data } = envelope(payload);
    if (response.ok) return data;
    const detail: SmsErrorDetail = { http: response.status, ...(status === undefined ? {} : { status }) };
    if (response.status === 429 || response.status >= 500) throw new SmsError('unavailable', detail);
    throw new SmsError('rejected', detail);
  }

  return {
    /** ارسال با قالب. `mobile` همان `09…`؛ پارامترها با نام قالب. */
    async verify(input: { apiKey: string; templateId: string; mobile: string; parameters: readonly SmsIrParameter[] }): Promise<SmsIrSent> {
      if (!isSmsIrTemplateId(input.templateId)) throw new SmsError('unconfigured');
      if (!/^09\d{9}$/.test(input.mobile) || !input.parameters.every((p) => /^[A-Z]{1,20}$/.test(p.name) && isParamValue(p.value))) {
        throw new SmsError('rejected');
      }
      const data = record(
        await call('/v1/send/verify', input.apiKey, {
          mobile: input.mobile,
          templateId: Number(input.templateId),
          parameters: input.parameters.map(({ name, value }) => ({ name, value })),
        }),
      );
      const id = data?.messageId;
      const cost = data?.cost;
      return {
        messageId: typeof id === 'number' && Number.isSafeInteger(id) ? String(id) : typeof id === 'string' && /^\d{1,20}$/.test(id) ? id : null,
        cost: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null,
      };
    },

    /**
     * اعتبار حساب، به واحد خود sms.ir؛ null اگر پاسخ پذیرفته عدد نداشت. `timeoutMs` جدا برای خواندن نمایشی (کارت اعتبار و پیشخوان)، تا sms.ir
     * کند صفحه را نگه ندارد.
     */
    async credit(apiKey: string, timeoutMs?: number): Promise<number | null> {
      const data = await call('/v1/credit', apiKey, undefined, timeoutMs);
      return typeof data === 'number' && Number.isFinite(data) ? data : null;
    },
  };
}

export type SmsIrClient = ReturnType<typeof smsIrClient>;

/**
 * آداپتور پیامک sms.ir: هر هدف با کلید شناسهٔ قالب خودش و پارامترها به ترتیب `SMS_TEMPLATES`. متن پیام (`text`) فرستاده نمی‌شود: sms.ir
 * قالب تأییدشده را پر می‌کند. `keys` با هر پیامک خوانده می‌شود (مقدار پنل بر `.env` مقدم، ADR-041).
 */
export function smsIrTransport(options: SmsIrOptions & { keys: (name: SmsIrKeyName) => Promise<string | null> }): SmsTransport {
  const client = smsIrClient(options);
  return {
    name: 'smsir',
    async send(message) {
      const template = SMS_TEMPLATES[message.purpose];
      const values = message.params ?? [];
      if (values.length !== template.params.length) throw new SmsError('rejected');
      const [apiKey, templateId] = await Promise.all([options.keys('SMS_API_KEY'), options.keys(template.key)]);
      if (!apiKey || !templateId) throw new SmsError('unconfigured');
      const sent = await client.verify({
        apiKey,
        templateId,
        mobile: message.to,
        parameters: template.params.map((name, i) => ({ name, value: values[i]! })),
      });
      return { status: 'sent', providerMessageId: sent.messageId, cost: sent.cost };
    },
  };
}
