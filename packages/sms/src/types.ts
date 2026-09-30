/** درگاه‌ها و خطای پیامک؛ جدا از `index.ts` تا آداپتورها بی چرخهٔ import از همین‌ها بسازند. */

import type { SmsPurpose } from './templates.js';

/** `logged` (کنسولی)، `sent` (پنل واقعی)، `failed`؛ و فقط برای پیامک از صف (رهگیری و از ۷٫۱ پرداخت) `pending` و `sending`. */
export type SmsStatus = 'logged' | 'sent' | 'failed' | 'pending' | 'sending';

export interface SmsRecord {
  provider: string;
  toMobile: string;
  purpose: SmsPurpose;
  /** null برای پنل واقعی و کد پیامکی: کد زنده در پایگاه داده نمی‌نشیند (ADR-033). */
  body: string | null;
  status: 'logged' | 'sent' | 'failed';
  providerMessageId?: string | null;
  /** هزینه‌ای که پنل واقعی برای همین پیامک گفت (`cost` پاسخ sms.ir)؛ کنسولی null. */
  cost?: number | null;
  error?: string | null;
}

export interface SmsLog {
  insert(message: SmsRecord): Promise<void>;
}

export interface SmsMessage {
  to: string;
  purpose: SmsPurpose;
  /** متن کامل؛ همان که پیامک کنسولی نگه می‌دارد. */
  text: string;
  /** پارامترهای قالب پنل واقعی، به ترتیب `SMS_TEMPLATES` (ADR-049)؛ متن از همین‌ها و قالب ساخته شده. */
  params?: readonly string[];
}

/** نتیجهٔ فرستادن: کنسولی `logged`، پنل واقعی `sent` با شناسه و هزینهٔ پیامکش. شکست پرتاب می‌شود (`SmsError`). */
export interface SmsSent {
  status: 'logged' | 'sent';
  providerMessageId: string | null;
  cost?: number | null;
}

export interface SmsTransport {
  /** همان که در `sms_messages.provider` می‌نشیند. */
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSent>;
}

/** فرستنده‌ای که ردیف `sms_messages` را خودش می‌نویسد (کد پیامکی). */
export interface SmsProvider {
  readonly name: string;
  /** شکستش پرتاب می‌شود؛ فرستنده تصمیم می‌گیرد چه کند. */
  send(message: SmsMessage): Promise<void>;
}

/**
 * علت «نرفت»، کوتاه و بی مقدار کلید: `unavailable` (پنل پیامک جواب نداد: شبکه، سقف زمان، ۵xx یا ۴۲۹)، `rejected` (نپذیرفت)،
 * `interrupted` (نیمه‌کاره ماند)، و از ۷٫۱ `unconfigured` (کلید API یا شناسهٔ قالب خالی، یا خوانده نشد).
 */
export type SmsErrorCode = 'unavailable' | 'rejected' | 'interrupted' | 'unconfigured';

export class SmsError extends Error {
  constructor(
    readonly code: SmsErrorCode,
    message?: string,
    /** کد HTTP پاسخ پنل پیامک، اگر پاسخی آمد. */
    readonly http: number | null = null,
    /** `status` عددی بدنهٔ پاسخ sms.ir، اگر بود. متن پاسخ هرگز نگه داشته نمی‌شود. */
    readonly status: number | null = null,
  ) {
    super(message ?? code);
  }
}

export const smsErrorCode = (error: unknown): SmsErrorCode => (error instanceof SmsError ? error.code : 'unavailable');

/** خطا برای لاگ: فقط علت و کدهای عددی (ADR-049)، هرگز متن پاسخ، سرآیند یا بدنهٔ درخواست. */
export function describeSmsError(error: unknown): string {
  if (!(error instanceof SmsError)) return 'unavailable';
  const codes = [error.http === null ? null : `HTTP ${error.http}`, error.status === null ? null : `کد ${error.status}`].filter(Boolean);
  return codes.length ? `${error.code} (${codes.join('، ')})` : error.code;
}
