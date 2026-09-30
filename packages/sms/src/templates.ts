/**
 * متن سه پیامک، یک منبع (برش ۷، ADR-049، سؤال ۱۱۵): همین جدول هم متن پیامک کنسولی و ردیف `sms_messages` را می‌سازد، هم متن قالبی را
 * که مالک در پنل sms.ir می‌سازد و برای تأیید می‌فرستد («تنظیمات» پنل همین را زیر هر شناسهٔ قالب نشان می‌دهد). متنی که دو جا نوشته شود
 * دیر یا زود دو متن است.
 *
 * - **پنل واقعی متن آزاد نمی‌فرستد:** sms.ir قالب تأییدشده را با شناسه‌اش و مقدار پارامترها پر می‌کند (`/v1/send/verify`)، پس آداپتور فقط
 *   پارامترها را به همین ترتیب می‌فرستد و متن را خود sms.ir می‌سازد.
 * - **هر پیامک یک تکه:** فارسی UCS-2 است؛ یک تکه تا ۷۰ نویسه، و پیامک چندتکه ۶۷ نویسه در هر تکه (`smsSegments`). پرداخت و رهگیری با
 *   شمارهٔ سفارش شش رقمی و بلندترین روز تحویل («چهارشنبه 16 اردیبهشت») هم زیر ۷۰ می‌مانند؛ تست همین را قفل کرده.
 * - **مقدار هر پارامتر:** دست‌کم یک نویسه، بی خط تازه، و تا ۵۰ نویسه (سقف sms.ir برای مقدار هر پارامتر).
 *
 * خالص و بی وابستگی؛ پنل ادمین و وب هر دو از همین می‌خوانند.
 */

import type { SmsPurpose } from './index';

/** نام کلید شناسهٔ قالب هر هدف، همان نام `.env` و «تنظیمات» (`service_secrets`). */
export type SmsTemplateKey = 'SMS_OTP_TEMPLATE' | 'SMS_PAID_TEMPLATE' | 'SMS_TRACKING_TEMPLATE';

type Part = string | { readonly param: string };

export interface SmsTemplate {
  readonly purpose: SmsPurpose;
  readonly key: SmsTemplateKey;
  /** نام پارامترها، به ترتیب `SmsMessage.params`. */
  readonly params: readonly string[];
  readonly parts: readonly Part[];
}

export const SMS_TEMPLATES = {
  otp: {
    purpose: 'otp',
    key: 'SMS_OTP_TEMPLATE',
    params: ['CODE'],
    // کد اول می‌آید تا در اعلان گوشی دیده شود.
    parts: ['کد تأیید جزوه‌یار: ', { param: 'CODE' }, '\nاین کد را به کسی نده.'],
  },
  order_paid: {
    purpose: 'order_paid',
    key: 'SMS_PAID_TEMPLATE',
    params: ['ORDER', 'DAY'],
    parts: ['جزوه‌یار: سفارش ', { param: 'ORDER' }, ' پرداخت شد؛ تحویل به پست تا ', { param: 'DAY' }],
  },
  tracking: {
    purpose: 'tracking',
    key: 'SMS_TRACKING_TEMPLATE',
    params: ['ORDER', 'BARCODE'],
    parts: ['جزوه‌یار: سفارش ', { param: 'ORDER' }, ' به پست رسید. کد رهگیری ', { param: 'BARCODE' }],
  },
} as const satisfies Record<SmsPurpose, SmsTemplate>;

/** سقف مقدار هر پارامتر قالب در sms.ir. */
export const SMS_PARAM_MAX = 50;

/** مقدار پارامتر پذیرفتنی: دست‌کم یک نویسه، بی خط تازه، تا `SMS_PARAM_MAX`. */
export const isParamValue = (value: string) => value.length > 0 && value.length <= SMS_PARAM_MAX && !/[\r\n]/.test(value);

function paramsOk(template: SmsTemplate, values: readonly string[]) {
  return values.length === template.params.length && values.every(isParamValue);
}

/** متن پیامک با مقدار پارامترها، همان که گوشی می‌بیند (و پیامک کنسولی نگه می‌دارد). */
export function templateText(purpose: SmsPurpose, values: readonly string[]): string {
  const template: SmsTemplate = SMS_TEMPLATES[purpose];
  if (!paramsOk(template, values)) throw new Error(`پارامترهای پیامک ${purpose} درست نیستند`);
  return template.parts.map((part) => (typeof part === 'string' ? part : values[template.params.indexOf(part.param)]!)).join('');
}

/** جای یک پارامتر در متن قالب sms.ir: `#NAME#` (منتظر مستند sms.ir؛ فقط همین‌جا نوشته شده). */
export const paramMark = (name: string) => `#${name}#`;

/**
 * متن قالب با جای پارامترها، برای ساختنش در پنل sms.ir. شکل جای پارامتر (`mark`) قاعدهٔ خود sms.ir است؛ پیش‌فرض `paramMark`، همان
 * که «تنظیمات» نشان می‌دهد.
 */
export function templateSource(purpose: SmsPurpose, mark: (name: string) => string = paramMark): string {
  return SMS_TEMPLATES[purpose].parts.map((part) => (typeof part === 'string' ? part : mark(part.param))).join('');
}

/** شمار تکهٔ پیامک فارسی (UCS-2): تا ۷۰ نویسه یک تکه، بیشتر ۶۷ نویسه در هر تکه. */
export function smsSegments(text: string): number {
  const length = [...text].length;
  return length <= 70 ? 1 : Math.ceil(length / 67);
}

/* ───────────────────────── پارامترهای هر هدف ───────────────────────── */

/** پارامتر قالب کد تأیید: همان کد، فقط رقم. */
export function otpParams(code: string): [string] {
  if (!/^\d{4,8}$/.test(code)) throw new Error('کد پیامک رقم نیست');
  return [code];
}

/** دو پارامتر قالب پرداخت: شمارهٔ سفارش و روز تحویل به پست («دوشنبه 6 مهر»، `formatDeadlineDay`). */
export function paidParams(orderNumber: number, handoffDay: string): [string, string] {
  const number = String(orderNumber);
  if (!/^\d{1,9}$/.test(number)) throw new Error('شمارهٔ سفارش پیامک پرداخت درست نیست');
  if (!isParamValue(handoffDay)) throw new Error('روز تحویل پیامک پرداخت درست نیست');
  return [number, handoffDay];
}

/** دو پارامتر قالب رهگیری، هر دو بی فاصله: شمارهٔ سفارش و بارکد ۲۴ رقمی. */
export function trackingParams(orderNumber: number, barcode: string): [string, string] {
  const number = String(orderNumber);
  if (!/^\d{1,9}$/.test(number)) throw new Error('شمارهٔ سفارش پیامک رهگیری درست نیست');
  if (!/^\d{24}$/.test(barcode)) throw new Error('کد رهگیری پیامک ۲۴ رقم نیست');
  return [number, barcode];
}

/** متن کد پیامکی. */
export const otpText = (code: string) => templateText('otp', otpParams(code));

/** متن پیامک بعد از پرداخت: شمارهٔ سفارش، و روز تحویل به پست (ADR-013). */
export const orderPaidText = (orderNumber: number, handoffDay: string) => templateText('order_paid', paidParams(orderNumber, handoffDay));

/** متن پیامک رهگیری (ADR-047)، فقط از دو پارامتر. */
export const trackingText = (orderNumber: number, barcode: string) => templateText('tracking', trackingParams(orderNumber, barcode));
