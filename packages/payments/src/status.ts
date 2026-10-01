/**
 * وضعیت پرداخت نزد درگاه، با کدهای زیبال (بستهٔ رسمی `zibal` ۲٫۰٫۰، `lib/messages.js`؛ ADR-050). درگاه نمونه هم همین کدها را می‌گوید،
 * تا سایت و پنل یک زبان داشته باشند.
 *
 * - **تصمیم فقط با وضعیت صریح** (سؤال‌های ۱۴۶ و ۱۴۷): «در انتظار پرداخت» (−۱) تلاش را نمی‌بندد، «پرداخت‌شده، تأییدنشده» (۲) تنها
 *   وضعیتی است که `verify` می‌خورد، و فقط وضعیت‌های لغو، کارت، بانک و برگشت تلاش را «ناموفق» می‌کنند. کد ناشناس هیچ‌کدام نیست.
 * - **پنج گروه علت برای مشتری** (سؤال ۱۳۱): لغو در درگاه؛ کارت (موجودی، رمز، سقف…) با «با کارت دیگری دوباره پرداخت کن»؛ بانک جواب
 *   نداد؛ پرداخت‌شده ولی تأییدنشده؛ و برگشت‌خورده.
 */

/** «در انتظار پرداخت»: مشتری هنوز نپرداخته (یا هنوز در صفحهٔ پرداخت است). */
export const STATUS_WAITING = -1;
/** «پرداخت‌شده، تأییدشده»: پول نهایی است. */
export const STATUS_VERIFIED = 1;
/** «پرداخت‌شده، تأییدنشده»: پول گرفته شده و فقط `verify` نهایی‌اش می‌کند؛ وگرنه زیبال خودکار برش می‌گرداند. */
export const STATUS_PAID = 2;

/** نام هر وضعیت در پنل («درگاه: …»)، همان جدول بستهٔ رسمی. */
export const STATUS_LABELS: Readonly<Record<number, string>> = {
  [-1]: 'در انتظار پرداخت',
  [-2]: 'خطای داخلی',
  1: 'پرداخت‌شده، تأییدشده',
  2: 'پرداخت‌شده، تأییدنشده',
  3: 'لغو با کاربر',
  4: 'شمارهٔ کارت نامعتبر',
  5: 'موجودی ناکافی',
  6: 'رمز اشتباه',
  7: 'تعداد درخواست بیش از حد',
  8: 'سقف تعداد پرداخت روزانه',
  9: 'سقف مبلغ پرداخت روزانه',
  10: 'صادرکنندهٔ کارت نامعتبر',
  11: 'خطای سوییچ',
  12: 'کارت در دسترس نیست',
  15: 'استردادشده',
  16: 'در حال استرداد',
  18: 'ریورس‌شده',
  21: 'پذیرندهٔ نامعتبر',
};

/** «درگاه: …» پنل؛ کد ناشناس با خود عدد. */
export const statusLabel = (status: number) => STATUS_LABELS[status] ?? `وضعیت ${status}`;

/** علت کارت برای مشتری («پرداخت انجام نشد: …»)، گروه کارت. */
export const CARD_REASONS: Readonly<Record<number, string>> = {
  4: 'شمارهٔ کارت درست نبود',
  5: 'موجودی کارت کافی نبود',
  6: 'رمز کارت اشتباه بود',
  7: 'تعداد تلاش‌های این کارت از سقف گذشت',
  8: 'سقف تعداد پرداخت اینترنتی امروز این کارت پر شده',
  9: 'سقف مبلغ پرداخت اینترنتی امروز این کارت پر شده',
  10: 'بانک صادرکنندهٔ کارت پرداخت را نپذیرفت',
  12: 'کارت در دسترس نبود',
};

/** وضعیت‌هایی که یعنی پول برگشت یا در راه برگشت است. */
const RETURNED = new Set([15, 16, 18]);
/** پول این تلاش گرفته شده و هنوز برنگشته: تأییدنشده، یا در حال استرداد. */
export const MONEY_HELD = new Set([STATUS_PAID, 16]);

/**
 * چرا یک تلاش «ناموفق» است (`payments.failure_code`). سه کد اول از وضعیت درگاه‌اند؛ بقیه تصمیم ما:
 * - `cancelled` (۳)، `declined` (کارت: ۴ تا ۱۰ و ۱۲)، `bank_error` (بانک یا درگاه: −۲، ۱۱، ۲۱)، `returned` (۱۵، ۱۶، ۱۸)؛
 * - `expired`: مهلت تلاش گذشت و `verify` هرگز؛ `order_not_payable`: سفارش دیگر پرداختنی نبود (پرداخت دوم)؛ `amount_mismatch`: مبلغ یا
 *   شناسهٔ سفارش درگاه با این تلاش نخواند. `verify_failed` فقط تلاش‌های پیش از ۷٫۲ است.
 */
export type PaymentFailureCode =
  | 'cancelled'
  | 'declined'
  | 'bank_error'
  | 'returned'
  | 'expired'
  | 'order_not_payable'
  | 'amount_mismatch'
  | 'verify_failed';

/** حکم یک وضعیت: هنوز باز، `verify`، تأییدشده، یا ناموفق با کدش؛ ناشناس هیچ‌کدام. */
export type StatusVerdict =
  | { kind: 'waiting' }
  | { kind: 'paid' }
  | { kind: 'verified' }
  | { kind: 'failed'; code: Extract<PaymentFailureCode, 'cancelled' | 'declined' | 'bank_error' | 'returned'> }
  | { kind: 'unknown' };

export function statusVerdict(status: number): StatusVerdict {
  if (status === STATUS_WAITING) return { kind: 'waiting' };
  if (status === STATUS_PAID) return { kind: 'paid' };
  if (status === STATUS_VERIFIED) return { kind: 'verified' };
  if (status === 3) return { kind: 'failed', code: 'cancelled' };
  if (status in CARD_REASONS) return { kind: 'failed', code: 'declined' };
  if (status === -2 || status === 11 || status === 21) return { kind: 'failed', code: 'bank_error' };
  if (RETURNED.has(status)) return { kind: 'failed', code: 'returned' };
  return { kind: 'unknown' };
}

/**
 * گروه علت ناموفق برای مشتری (سؤال ۱۳۱)، از کد شکست و آخرین وضعیتی که درگاه گفت. `paid_unverified`: مهلت گذشت ولی پول گرفته شده بود
 * (زیبال خودکار برمی‌گرداند)؛ `bank`: هر چیز بی علت روشن، با همان متن برش ۳ («تا 72 ساعت»).
 */
export type FailureGroup = 'cancelled' | 'card' | 'bank' | 'paid_unverified' | 'returned';

export function failureGroup(code: string | null, gatewayStatus: number | null): FailureGroup {
  if (code === 'cancelled') return 'cancelled';
  if (code === 'declined' && gatewayStatus !== null && gatewayStatus in CARD_REASONS) return 'card';
  if (code === 'returned' || (gatewayStatus !== null && RETURNED.has(gatewayStatus) && gatewayStatus !== 16)) return 'returned';
  if (gatewayStatus !== null && MONEY_HELD.has(gatewayStatus)) return 'paid_unverified';
  return 'bank';
}
