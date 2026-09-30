/**
 * سه قالب پیامک (ADR-049، سؤال ۱۱۵): متن و نام پارامترها **یک منبع** برای کد، پیامک کنسولی و پنل sms.ir. صفحهٔ «تنظیمات» پنل همین
 * متن را کنار فیلد شناسهٔ هر قالب نشان می‌دهد تا در پنل sms.ir عیناً همین نوشته شود، و تست متن هر پیامک را با همین جدول می‌سنجد.
 *
 * - **متن = قالب با پارامتر:** `‹NAME›` فقط جای پارامتر است؛ شکل نوشتنش در پنل sms.ir به قاعدهٔ خود sms.ir. پیامک کنسولی همین متن را با
 *   پارامترها پر می‌کند (`fillTemplate`)؛ پنل واقعی فقط شناسهٔ قالب و پارامترها را می‌گیرد، به همین ترتیب.
 * - **پارامتر:** رشته، یک خط، حداکثر ۵۰ نویسه (یافتهٔ ۹، مستند sms.ir). شمارهٔ سفارش و کد رهگیری بی فاصله‌اند؛ روز تحویل («دوشنبه 6 مهر»)
 *   فاصله دارد، و اینکه sms.ir مقدار با فاصله را می‌پذیرد با «آزمایش» همین قالب روی گوشی مالک سنجیده می‌شود (نمونه‌اش همین فاصله را دارد).
 * - **یک تکه:** هر سه تا ۷۰ نویسه، یک پیامک فارسی (یافتهٔ ۱۰)؛ تست با بلندترین روز و ماه و شمارهٔ سفارش شش‌رقمی قفلش کرده.
 */

export type SmsPurpose = 'otp' | 'order_paid' | 'tracking';

export interface SmsTemplate {
  /** نام کلید شناسهٔ قالب در `.env` و «تنظیمات» پنل (`service_secrets`). */
  key: 'SMS_OTP_TEMPLATE' | 'SMS_PAID_TEMPLATE' | 'SMS_TRACKING_TEMPLATE';
  /** نام پارامترها، به ترتیب `SmsMessage.params`. */
  params: readonly string[];
  /** متن قالب؛ `‹NAME›` جای هر پارامتر. */
  text: string;
  /** پارامترهای نمونه برای پیامک آزمایشی «تنظیمات» (سؤال ۱۱۹). */
  sample: readonly string[];
}

export const SMS_TEMPLATES: { readonly [P in SmsPurpose]: SmsTemplate } = {
  otp: {
    key: 'SMS_OTP_TEMPLATE',
    params: ['CODE'],
    // کد اول می‌آید تا در اعلان گوشی دیده شود.
    text: 'کد تأیید جزوه‌یار: ‹CODE›\nاین کد را به کسی نده.',
    sample: ['12345'],
  },
  order_paid: {
    key: 'SMS_PAID_TEMPLATE',
    params: ['ORDER', 'DAY'],
    text: 'جزوه‌یار: سفارش ‹ORDER› پرداخت شد؛ تحویل به پست تا ‹DAY›',
    sample: ['10027', 'دوشنبه 6 مهر'],
  },
  tracking: {
    key: 'SMS_TRACKING_TEMPLATE',
    params: ['ORDER', 'BARCODE'],
    text: 'جزوه‌یار: سفارش ‹ORDER› به پست رسید. کد رهگیری ‹BARCODE›',
    sample: ['10027', '118800000000000000000101'],
  },
};

export const SMS_PURPOSES = Object.keys(SMS_TEMPLATES) as SmsPurpose[];

/** بیشترین طول مقدار هر پارامتر قالب sms.ir (یافتهٔ ۹). */
export const SMS_PARAM_MAX = 50;

/** مقدار پارامتر پذیرفتنی: یک خط، ۱ تا ۵۰ نویسه، بی فاصلهٔ دو سر. */
export const validParam = (value: string) =>
  value.length > 0 && value.length <= SMS_PARAM_MAX && !/[\r\n\t]/.test(value) && value.trim() === value;

/** متن پیامک: قالب با پارامترها. شمار یا شکل نادرست پارامتر پرتاب می‌شود؛ پیامک نیمه‌پر نمی‌رود. */
export function fillTemplate(purpose: SmsPurpose, params: readonly string[]): string {
  const template = SMS_TEMPLATES[purpose];
  if (params.length !== template.params.length) throw new Error(`پیامک ${purpose} ${template.params.length} پارامتر می‌خواهد`);
  for (const value of params) if (!validParam(value)) throw new Error(`پارامتر پیامک ${purpose} درست نیست`);
  return template.params.reduce((text, name, i) => text.replace(`‹${name}›`, params[i]!), template.text);
}

/** شمارهٔ سفارش، بی فاصله. */
function orderParam(orderNumber: number): string {
  const value = String(orderNumber);
  if (!/^\d{1,9}$/.test(value)) throw new Error('شمارهٔ سفارش پیامک درست نیست');
  return value;
}

/** پارامتر قالب کد تأیید: همان پنج رقم. */
export function otpParams(code: string): [string] {
  if (!/^\d{4,8}$/.test(code)) throw new Error('کد پیامکی درست نیست');
  return [code];
}

/** متن کد پیامکی. */
export const otpText = (code: string) => fillTemplate('otp', otpParams(code));

/** دو پارامتر قالب پرداخت: شمارهٔ سفارش و روز تحویل به پست («دوشنبه 6 مهر»، `formatDeadlineDay`). */
export function orderPaidParams(orderNumber: number, handoffDay: string): [string, string] {
  const day = handoffDay.trim();
  if (!validParam(day)) throw new Error('روز تحویل پیامک پرداخت درست نیست');
  return [orderParam(orderNumber), day];
}

/** متن پیامک بعد از پرداخت (ADR-013، ADR-049). */
export const orderPaidText = (orderNumber: number, handoffDay: string) => fillTemplate('order_paid', orderPaidParams(orderNumber, handoffDay));

/** دو پارامتر قالب رهگیری، هر دو بی فاصله: شمارهٔ سفارش و بارکد ۲۴ رقمی. */
export function trackingParams(orderNumber: number, barcode: string): [string, string] {
  if (!/^\d{24}$/.test(barcode)) throw new Error('کد رهگیری پیامک ۲۴ رقم نیست');
  return [orderParam(orderNumber), barcode];
}

/** متن پیامک رهگیری (ADR-047، ADR-049). */
export const trackingText = (orderNumber: number, barcode: string) => fillTemplate('tracking', trackingParams(orderNumber, barcode));

/**
 * شمار تکه‌های یک پیامک: فارسی (UCS-2) یک تکه تا ۷۰ نویسه و چندتکه ۶۷ در هر تکه؛ لاتین (GSM-7) ۱۶۰ و ۱۵۳. هر نویسه‌ای بیرون از
 * ASCII دیدنی پیامک را فارسی می‌کند. همان حساب هزینه (یافتهٔ ۱۰)؛ برای تست و متن «تنظیمات».
 */
export function smsParts(text: string): number {
  const units = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
  const unicode = /[^\n\x20-\x7e]/.test(text);
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  return units <= single ? 1 : Math.ceil(units / multi);
}
