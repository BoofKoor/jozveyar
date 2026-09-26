/**
 * قرارداد مسیر خرید (برش ۳؛ ADR-033 تا ADR-035): درخواست‌هایی که مرورگر به سرور می‌فرستد، و شکل
 * پاسخ‌ها.
 *
 * سرور هر درخواست را با همین اسکیماها می‌سنجد. مرورگر (۳ج) از اینجا **فقط type** می‌گیرد، مثل بقیهٔ
 * قرارداد: zod نباید به باندل اولیه برگردد (ADR-018، افزوده).
 *
 * از مسیر جدای `@jozveyar/contracts/checkout`، نه از `index.ts`: این فایل اسکیماهای پایه را از `index.ts`
 * می‌گیرد، و صادر کردنش از همان‌جا حلقهٔ import می‌ساخت (اسکیمای پایه پیش از ساخته شدن خوانده می‌شد).
 *
 * مرورگر عددی دربارهٔ صفحه، قیمت یا قاعدهٔ رنگ نمی‌فرستد که سرور به آن اعتماد کند: فقط شناسهٔ سندها و
 * انتخاب‌ها. سرور تعداد صفحهٔ هر سند را از تحلیل خودش می‌گذارد، قاعدهٔ رنگ را خودش می‌سازد (امروز یک
 * قاعده برای کل جزوه، قاعدهٔ ۵) و با تعرفهٔ فعال پایگاه داده `quote()` می‌کند (قاعده‌های ۱ و ۲).
 */

import { z } from 'zod';

import { MAX_SECTIONS_PER_ITEM } from './constants.js';
import { colorModeSchema, sidesModeSchema, type Breakdown } from './index.js';

/** حالت مسیر خرید (ADR-035). `off` پیش‌فرض و حالت سایت زنده تا برش ۷. */
export type CheckoutMode = 'off' | 'mock' | 'live';

/** سقف جزوه‌های یک سفارش. امروز رابط یک جزوه می‌فرستد؛ مدل داده چند قلم را از اول دارد. */
export const MAX_ITEMS_PER_ORDER = 10;

/** یک جزوه: سندهایش به ترتیب صحافی، و انتخاب‌های چاپ. */
export const checkoutItemSchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(MAX_SECTIONS_PER_ITEM),
  colorMode: colorModeSchema,
  paperTypeId: z.string().min(1).max(40),
  sidesMode: sidesModeSchema,
  bindingTypeId: z.string().min(1).max(40),
  copies: z.number().int().positive().max(1000),
});
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

/** جای ارسال: استان همیشه؛ شهر اگر در فهرست بود (ADR-034). */
export const placeSchema = z.object({
  provinceId: z.number().int().positive(),
  cityId: z.number().int().positive().nullable(),
});
export type Place = z.infer<typeof placeSchema>;

/** قیمت سرور، برای قدم شهر و مرور. بی جای ارسال، کرایه null است. */
export const checkoutQuoteRequestSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(MAX_ITEMS_PER_ORDER),
  place: placeSchema.nullable().default(null),
});
export type CheckoutQuoteRequest = z.infer<typeof checkoutQuoteRequestSchema>;

/**
 * گیرنده. موبایل گیرنده اینجا نیست: همان موبایل تأییدشدهٔ پرداخت است، در نسخهٔ اول (ADR-033). سرور متن
 * را فارسی‌نرمال می‌کند و طولش را می‌سنجد؛ کد پستی اختیاری است و ارقامش هر شکلی می‌تواند باشد.
 */
export const recipientSchema = z.object({
  name: z.string().max(200),
  addressText: z.string().max(2000),
  postalCode: z.string().max(40).nullable().default(null),
});
export type Recipient = z.infer<typeof recipientSchema>;

/**
 * «پرداخت»: سفارش ساخته می‌شود و پرداخت شروع می‌شود (ADR-034).
 *
 * - `checkoutKey`: یکتا برای هر کلیک «پرداخت» در مرورگر؛ تلاش دوباره همان سفارش را برمی‌گرداند.
 * - `expectedTotalRials`: جمعی که مرورگر نشان داده. اگر سرور عدد دیگری حساب کند، سفارش ساخته نمی‌شود.
 * - `quoteSnapshot`: ریز قیمتی که مرورگر نشان داده بود، فقط برای سنجیدن اختلاف (`orders.quote_snapshot`).
 */
export const placeOrderRequestSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(MAX_ITEMS_PER_ORDER),
  place: placeSchema,
  recipient: recipientSchema,
  checkoutKey: z.uuid(),
  expectedTotalRials: z.number().int().positive(),
  quoteSnapshot: z.unknown().optional(),
});
export type PlaceOrderRequest = z.infer<typeof placeOrderRequestSchema>;

/** درخواست کد پیامکی. شماره هر شکلی می‌تواند باشد؛ سرور نرمالش می‌کند (`normalizeIranMobile`). */
export const otpRequestSchema = z.object({ mobile: z.string().min(1).max(40) });

/** تأیید کد، برای همان شماره و در همان مرورگری که کد را خواست. */
export const otpVerifySchema = z.object({
  mobile: z.string().min(1).max(40),
  code: z.string().min(1).max(20),
});

/** تصمیمی که صفحهٔ درگاه نمونه ثبت می‌کند؛ برگشت از درگاه همین را می‌خواند، نه پارامتر نشانی را. */
export const mockDecisionSchema = z.object({ decision: z.enum(['success', 'failure', 'cancel']) });
export type MockDecision = z.infer<typeof mockDecisionSchema>['decision'];

/* ──────────────────────────── پاسخ‌ها ──────────────────────────── */

/** `GET /api/checkout`: مرورگر بعد از اولین قیمت می‌پرسد. */
export interface CheckoutStatus {
  mode: CheckoutMode;
  /** موبایلی که همین مرورگر تأیید کرده (کوکی `jy_auth`)؛ آن‌وقت قدم کد لازم نیست. */
  auth: { mobile: string } | null;
}

export interface CheckoutQuote {
  /** ریز قیمت سرور؛ همان که سفارش با آن منجمد می‌شود. */
  breakdown: Breakdown;
  /** کرایهٔ همین وزن در هر منطقه، برای کارت شهر: «در استان تهران X و بقیهٔ کشور Y». */
  shippingByZone: { zoneId: string; name: string; shippingRials: number | null }[];
}

export type OrderStatus = 'awaiting_payment' | 'paid' | 'expired';

export interface OrderSummary {
  number: number;
  /** نشانی صفحهٔ سفارش: `/order/<token>`. */
  token: string;
  status: OrderStatus;
  totalRials: number;
}

export interface PlacedOrder {
  order: OrderSummary;
  /** نشانی درگاه؛ null اگر سفارش همین کلید از قبل پرداخت شده. */
  payment: { redirectUrl: string } | null;
}

/** کد شکست‌هایی که رابط برایشان پیام فارسی و راه جلو دارد. */
export type CheckoutErrorCode =
  | 'invalid_request'
  | 'not_found'
  | 'invalid_mobile'
  | 'resend_too_soon'
  | 'too_many_codes'
  | 'sms_unavailable'
  | 'invalid_code'
  | 'no_code'
  | 'code_expired'
  | 'code_locked'
  | 'wrong_code'
  | 'auth_required'
  | 'documents_not_found'
  | 'documents_not_ready'
  | 'files_expiring'
  | 'invalid_place'
  | 'shipping_unavailable'
  | 'quote_warnings'
  | 'price_changed'
  | 'checkout_key_conflict'
  | 'order_not_payable'
  | 'order_expired'
  | 'gateway_unavailable'
  | 'unavailable';

/** یک بخش جزوه در صفحهٔ سفارش: نام فایل و صفحه‌هایی که سرور شمرد. */
export interface OrderViewSection {
  name: string;
  pageCount: number;
}

export interface OrderViewItem {
  pageCount: number;
  copies: number;
  sidesMode: 'single' | 'double';
  colorMode: 'color' | 'bw' | 'mixed';
  bindingName: string;
  paperName: string;
  sections: OrderViewSection[];
}

/**
 * صفحهٔ سفارش (ADR-033): شماره، وضعیت و روز تحویل به پست برای همه؛ بقیه فقط برای نشست صاحب سفارش.
 */
export interface OrderView {
  number: number;
  status: OrderStatus;
  /** پایان انحصاری مهلت تحویل به پست (ISO)؛ فقط بعد از پرداخت. */
  postHandoffDueAt: string | null;
  /** «دوشنبه 6 مهر». */
  postHandoffDay: string | null;
  slaDays: number;
  owner: boolean;
  details: OrderViewDetails | null;
}

export interface OrderViewDetails {
  totalRials: number;
  breakdown: Breakdown;
  createdAt: string;
  paidAt: string | null;
  /** کد پیگیری بانک، بعد از پرداخت. */
  refId: string | null;
  /** آخرین تلاش پرداخت، برای «پرداخت انجام نشد» بعد از برگشت از درگاه. */
  lastPayment: { status: 'pending' | 'succeeded' | 'failed'; failureCode: string | null } | null;
  /** «دوباره پرداخت کن»: سفارش در انتظار پرداخت و فایل‌هایش دست‌کم یک ساعت دیگر زنده. */
  canPay: boolean;
  items: OrderViewItem[];
  shipping: {
    methodName: string;
    provinceId: number;
    provinceName: string;
    cityId: number | null;
    cityName: string | null;
  };
  recipient: { name: string; phone: string; addressText: string; postalCode: string | null };
}
