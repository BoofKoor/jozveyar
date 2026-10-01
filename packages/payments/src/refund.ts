/**
 * بازپرداخت سفارش لغوشده، پشت همان آداپتور درگاه (برش ۷٫۳، ADR-051).
 *
 * - **اختیاری برای هر درگاه** (`PaymentGateway.refunds`): درگاهی که بازپرداخت ندارد، فقط «ثبت بازپرداخت دستی» دارد. درگاه نمونه دارد (بی
 *   پول)؛ زیبال تا رسیدن مستند API بازپرداخت ندارد (سؤال ۱۵۲: هیچ شکل حدسی).
 * - **کل مبلغ، به همان کارت**، و کارمزد درگاه از کیف پول ما، نه از مبلغ مشتری (سؤال ۱۳۶)؛ فرم پنل کارمزد را پیش از کد تازه نشان می‌دهد.
 * - **بازپرداخت دوم هرگز** (سؤال ۱۵۴): ردیف `refunds` پیش از درخواست ساخته می‌شود و شناسه‌اش با درخواست می‌رود، تا اگر پاسخ گم شد، استعلام
 *   همان را پیدا کند؛ و پیش از درخواست، استعلام همان پرداخت: وضعیت «استردادشده» یا «در حال استرداد» یعنی درخواست نمی‌رود.
 */

/** کارمزد بازپرداخت زیبال (ADR-051، «افزوده»): ۰٫۱٪ مبلغ، دست‌کم ۱٬۵۰۰ تومان. */
export const REFUND_FEE_MIN_RIALS = 15_000;

/** کارمزد بازپرداخت به ریال: ۰٫۱٪ مبلغ، گرد به بالا تا تومان، دست‌کم ۱٬۵۰۰ تومان (سؤال ۱۵۵). */
export function refundFeeRials(amountRials: number): number {
  if (!Number.isSafeInteger(amountRials) || amountRials <= 0) throw new RangeError(`مبلغ بازپرداخت ${amountRials} نیست`);
  return Math.max(Math.ceil(amountRials / 10_000) * 10, REFUND_FEE_MIN_RIALS);
}

/**
 * چرا درگاه بازپرداخت را نپذیرفت؛ پولی جابه‌جا نشد:
 * - `balance`: موجودی کیف پول درگاه کافی نیست؛
 * - `ip`: IP این سرور در پنل درگاه نیست؛
 * - `token`: کلید یا توکن درگاه درست نیست، یا دسترسی بازپرداخت ندارد؛
 * - `unconfigured`: کلید درگاه خالی است یا خوانده نشد، پس درخواست اصلاً نرفت؛
 * - `not_found`: درخواست گم شد و درگاه چنین بازپرداختی ندارد؛
 * - `other`: هر رد دیگری، با عدد پاسخ درگاه در `gateway_error`.
 */
export type RefundRejection = 'balance' | 'ip' | 'token' | 'unconfigured' | 'not_found' | 'other';

export const REFUND_REJECTIONS: readonly RefundRejection[] = ['balance', 'ip', 'token', 'unconfigured', 'not_found', 'other'];

/** آنچه درگاه دربارهٔ یک بازپرداخت گفت. */
export interface GatewayRefund {
  /** `pending` پذیرفت و پول در راه است؛ `succeeded` به کارت نشست؛ `failed` نپذیرفت و پولی جابه‌جا نشد. */
  state: 'pending' | 'succeeded' | 'failed';
  /** شناسهٔ بازپرداخت نزد درگاه، اگر داد. */
  gatewayRef: string | null;
  /** کد پیگیری بانک، پس از برگشت. */
  reference: string | null;
  /** وضعیت عددی درگاه، اگر داد. */
  status: number | null;
  /** فقط `failed`. */
  reason: RefundRejection | null;
  /** عدد پاسخ درگاه برای ردِ `other` (`rejected:<عدد>` در `refunds.gateway_error`)؛ هرگز متن. */
  result: number | null;
  /** پاسخ، فقط فیلدهای شناخته (بی کلید). */
  raw: unknown;
}

/** پرداختی که برمی‌گردد، همان شکل استعلام پرداخت. */
export interface RefundPayment {
  authority: string;
  amountRials: number;
  orderId: string | null;
  refId: string | null;
  raw: unknown;
}

export interface GatewayRefundRequest {
  payment: RefundPayment;
  amountRials: number;
  /** شناسهٔ بازپرداخت نزد ما (`refunds.id`)؛ درگاه با همین هم پیدایش می‌کند، حتی اگر پاسخ درخواست گم شد. */
  refundId: string;
  /** «بازپرداخت سفارش 10026 جزوه‌یار»؛ بی موبایل و نام. */
  description: string;
}

export interface GatewayRefundLookup {
  payment: RefundPayment;
  amountRials: number;
  refundId: string;
  /** شناسهٔ درگاه، اگر درخواست جواب گرفت. */
  gatewayRef: string | null;
}

export interface GatewayRefunds {
  /** کارمزد این درگاه برای این مبلغ (ریال)، از کیف پول ما. */
  feeRials(amountRials: number): number;
  /**
   * درخواست بازپرداخت. رد روشن درگاه `failed` با علت است؛ بی جواب روشن `PaymentError` (`unavailable`، `malformed`): معلوم نیست درخواست
   * رسید یا نه، پس ردیف «در حال برگشت» با برچسب خطا می‌ماند تا استعلام. `unconfigured` یعنی درخواست نرفت.
   */
  request(input: GatewayRefundRequest): Promise<GatewayRefund>;
  /** وضعیت یک بازپرداخت؛ null یعنی درگاه چنین بازپرداختی ندارد (درخواستش هرگز نرسید). بی جواب روشن `PaymentError`. */
  inquire(input: GatewayRefundLookup): Promise<GatewayRefund | null>;
}

/** وضعیت‌های استعلام پرداخت که یعنی این پرداخت همین حالا بازپرداخت شده یا در راه بازپرداخت است (کدهای زیبال، مستند درگاه). */
export const STATUS_REFUNDED = 15;
export const STATUS_REFUNDING = 16;
export const isRefundedStatus = (status: number | null) => status === STATUS_REFUNDED || status === STATUS_REFUNDING;
