/**
 * سفارش و پرداخت در پایگاه داده (برش ۳، ADR-034 و ADR-035).
 *
 * مثل `documents.ts` فقط ذخیره و خواندن است؛ تصمیم‌ها (قیمت، مالکیت سند، زنده بودن فایل، سنجش درگاه)
 * در سرویس مسیر خرید وب گرفته می‌شوند تا با پیاده‌سازی حافظه‌ای هم تست شوند. دو جا بیش از کوئری است،
 * چون درستی‌شان فقط در پستگرس معنا دارد:
 *
 *  - `createOrder` کل سفارش را در **یک تراکنش** می‌سازد: سفارش، قلم‌ها، بخش‌ها، قاعده‌ها و رویداد
 *    وضعیت. محافظ معوق `order_items_cover_pages` در پایان همین تراکنش پوشش صفحه‌ها را می‌سنجد (0006).
 *  - `settlePayment` برگشت از درگاه را زیر قفل ردیف پرداخت و سفارش انجام می‌دهد: دو برگشت هم‌زمان
 *    (رفرش، دو زبانه) پشت‌سرهم اجرا می‌شوند و دومی نتیجهٔ اولی را می‌بیند. از برش ۵٫۲ چاپخانهٔ سفارش هم در همین
 *    تراکنش انتخاب می‌شود (`assignAtPayment`، ADR-042). از برش ۷٫۲ (ADR-050) همین قفل برای برگشت با کلید برگشت، استعلام
 *    خودکار (`SKIP LOCKED`: چند نود، یک استعلام) و «استعلام از درگاه» پنل؛ و «در انتظار» با آنچه از درگاه دانستیم (`settleWith`،
 *    `payments.ts`).
 */

import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Breakdown, PriceList } from '@jozveyar/contracts';
import { formatDeadlineDay } from '@jozveyar/text';

import { adminEventRow } from './admin.js';
import { assignAtPayment } from './assignment.js';
import type { DocumentRow } from './documents.js';
import type { Database } from './index.js';
import {
  adminEvents,
  documents,
  jobs,
  orderItemSections,
  orderItems,
  orderStatusEvents,
  orders,
  payments,
  printRules,
  refunds,
  settings,
  shipments,
  smsMessages,
} from './schema.js';
import { loadActivePriceList, loadPriceList } from './seed.js';
import { queuedPaidSms, shipmentSmsFields, shipmentSmsOf, type ShipmentSms } from './sms.js';

/**
 * کار کارگر اسناد بعد از پرداخت: PDF جزوه زیر `orders/` (ADR-030)، و از برش ۵٫۱ فایل چاپ هر جلد از روی همان (ADR-043).
 * همین رشته در services/docworker.
 */
export const PREPARE_ORDER_JOB = 'prepare_order';
/**
 * برگهٔ سفارش (برش ۵٫۱، ADR-043): کار جدای خودش، تا شکستش PDF جزوه را «ساخته نشد» نکند. با پرداخت در صف می‌رود، و با هر
 * تغییر داده‌اش (ویرایش گیرنده) دوباره. همین رشته در services/docworker.
 */
export const PREPARE_TICKET_JOB = 'prepare_ticket';

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/**
 * کار برگهٔ یک سفارش دوباره در صف، اگر تمام شده یا شکست خورده: دادهٔ روی برگه عوض شد (ویرایش گیرنده، و از ۵٫۲ جابه‌جایی
 * چاپخانه و ویرایش نام یا شهرش). کاری که همین حالا در صف است دادهٔ تازه را می‌خواند؛ کاری که کارگر رویش است، اثر انگشت را
 * پیش از ثبت زیر قفل ردیف سفارش دوباره می‌سنجد و با دادهٔ تازه از نو می‌سازد (`docworker/ticket.py`). مثل `queue_job` کارگر.
 */
export async function requeueTicket(tx: Tx, orderId: string): Promise<void> {
  await tx.execute(sql`
    INSERT INTO jobs (kind, order_id) VALUES (${PREPARE_TICKET_JOB}, ${orderId})
    ON CONFLICT (order_id, kind) DO UPDATE
       SET status = 'queued', attempts = 0, run_after = now(), locked_by = NULL, locked_until = NULL,
           last_error = NULL, finished_at = NULL, updated_at = now()
     WHERE jobs.status IN ('done', 'failed')`);
}

/**
 * پرداخت شروع نمی‌شود اگر کمتر از این تا پاک شدن فایلی مانده باشد (ADR-034). مسیر خرید سایت با همین
 * «دوباره پرداخت کن» را می‌بندد، و پنل با همین سفارش در انتظار را «رهاشده» می‌خواند (برش ۴٫۲).
 */
export const FILE_MARGIN_MS = 60 * 60_000;

/**
 * مهلت هر تلاش پرداخت (سؤال ۱۴۴، برش ۷٫۲؛ پیش از آن نیم ساعت): پس از آن `verify` هرگز، و تلاش «ناموفق، مهلت گذشت». کمتر از ۱۵
 * دقیقه‌ای است که زیبال پول تأییدنشده را خودکار برمی‌گرداند (وبلاگ زیبال)، با ۵ دقیقه حاشیه حتی اگر زیبال از `request` بشمارد؛ و کمتر از
 * حاشیهٔ فایل: پرداختی که پذیرفته شود فایل زنده دارد. پنل تلاشی را که از این گذشته و هنوز در انتظار است «بی برگشت» می‌خواند (برش ۴٫۲،
 * سؤال ۲۲)، که استعلام خودکار می‌بندد.
 */
export const PAYMENT_ATTEMPT_TTL_MS = 10 * 60_000;

/**
 * تلاش بسته‌ای که پولش شاید هنوز نزد درگاه است (برش ۷٫۲): کدهای تصمیم ما که `verify` نخوردند (یا ناهمخوان ماندند)، با وضعیت
 * «پرداخت‌شده، تأییدنشده» (۲) یا «در حال استرداد» (۱۶)، یا هنوز ناپیدا.
 */
export const HELD_FAILURES = ['expired', 'order_not_payable', 'amount_mismatch'] as const;
export const MONEY_HELD_STATUSES = [2, 16] as const;
/**
 * استعلام خودکار پول چنین تلاشی را تا این مدت پس از ساختنش می‌پاید، هر ۲ دقیقه؛ زیبال پول تأییدنشده را ۱۵ دقیقه پس از پرداخت برمی‌گرداند،
 * پس پولی که پس از این هنوز نزد درگاه است دیگر «برمی‌گردد» نیست: هشدار پیشخوان (برش ۷٫۲).
 */
export const HELD_WATCH_MS = 2 * 3_600_000;

/**
 * کدهای ردِ شروع پرداخت که کار مالک‌اند، نه مشتری (برش ۷٫۲، ADR-050): ۱۰۲ تا ۱۰۴ کد پذیرنده، و ۱۱۵ IP سرور در پنل زیبال. هر کدام رویداد
 * سیستم `payments.gateway_rejected` و هشدار پیشخوان است، تا اولین شروع یا «آزمایش» درست.
 */
export const GATEWAY_NOT_READY_RESULTS: readonly number[] = [102, 103, 104, 115];

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type PrintRuleRow = typeof printRules.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type OrderStatus = OrderRow['status'];

/**
 * وضعیت‌های پس از پرداخت (برش ۴٫۳، ADR-039): در صف چاپ، در حال چاپ، تحویل پست شد، و لغو شد. پول گرفته شده، حتی
 * اگر سفارش بعد لغو شد؛ پس نه دوباره پرداخت می‌شود و نه منقضی (تریگر `orders_payment_final`).
 */
export const PAID_STATUSES = ['paid', 'printing', 'handed_to_post', 'cancelled'] as const satisfies readonly OrderStatus[];

export const isPaidStatus = (status: OrderStatus): boolean => (PAID_STATUSES as readonly OrderStatus[]).includes(status);

/** سندی که به سفارش می‌رود: آنچه سرور برای مالکیت، قیمت و زنده بودن فایل لازم دارد. */
export interface CheckoutDocument {
  id: string;
  sessionHash: string;
  originalName: string;
  status: DocumentRow['status'];
  /** شمارش سرور؛ تا تحلیل سرور نیامده null. */
  pageCount: number | null;
  fileExpiresAt: Date | null;
  fileDeletedAt: Date | null;
}

export interface NewOrderItem {
  pageCount: number;
  copies: number;
  sidesMode: 'single' | 'double';
  bindingTypeId: string;
  sections: { documentId: string; pageCount: number }[];
  rules: { pageRanges: [number, number][]; colorMode: 'color' | 'bw'; paperTypeId: string }[];
}

export interface NewOrder {
  checkoutKey: string;
  userId: string;
  /** ریز قیمت سرور، با کرایه؛ ستون‌های پول سفارش تکه‌های همین‌اند. */
  breakdown: Breakdown;
  quoteSnapshot: unknown;
  slaDays: number;
  shippingMethodId: string;
  shippingZoneId: string;
  provinceId: number;
  cityId: number | null;
  recipientName: string;
  recipientPhone: string;
  addressText: string;
  postalCode: string | null;
  items: NewOrderItem[];
}

export interface OrderSectionDetails {
  seq: number;
  documentId: string;
  pageCount: number;
  originalName: string;
  fileExpiresAt: Date | null;
  fileDeletedAt: Date | null;
}

export interface OrderDetails {
  order: OrderRow;
  items: (OrderItemRow & { sections: OrderSectionDetails[]; rules: PrintRuleRow[] })[];
  /** همهٔ تلاش‌های پرداخت، تازه‌ترین اول. */
  payments: PaymentRow[];
  /**
   * کدهای رهگیری زندهٔ سفارش، به ترتیب ثبت، با پیامک هر کدام (برش ۶٫۳، ADR-047). کد کنارگذاشته نه: مشتری دیگر نمی‌بیندش.
   */
  parcels: { barcode: string; createdAt: Date; sms: ShipmentSms | null }[];
  /** بازپرداخت‌های سفارش لغوشده (برش ۷٫۳، ADR-051)، تازه‌ترین اول. */
  refunds: (typeof refunds.$inferSelect)[];
}

/** آنچه این بار از درگاه دانستیم (`payments.gateway_*`، برش ۷٫۲): وضعیت (یا همان قبلی، اگر جوابی نیامد)، علت بی جوابی، و زمان. */
export interface GatewayCheckInput {
  status: number | null;
  error: string | null;
  at: Date;
}

/** چه چیزی تلاش را بست (`payments.settled_via`). */
export type SettledVia = 'callback' | 'auto' | 'panel';

/** نتیجهٔ سنجش درگاه، که `settlePayment` در همان تراکنش اعمال می‌کند. */
export type Settlement =
  | {
      kind: 'succeeded';
      refId: string;
      cardMask: string | null;
      /** مبلغی که درگاه نهایی کرد؛ پایگاه داده برابر مبلغ تلاش می‌خواهد (`payments_success_amount`). */
      verifiedAmountRials: number;
      raw: unknown;
      paidAt: Date;
      postHandoffDueAt: Date;
      check?: GatewayCheckInput;
    }
  | {
      kind: 'failed';
      code: string;
      raw: unknown;
      cardMask?: string | null;
      /** فقط وقتی `verify` پول را نهایی کرد و با تلاش نخواند. */
      verifiedAmountRials?: number | null;
      check?: GatewayCheckInput;
    }
  /** درگاه هنوز «در انتظار پرداخت» است یا جواب روشن نداد (برش ۷٫۲): وضعیت تلاش همان، فقط آنچه از درگاه دانستیم. */
  | { kind: 'pending'; check: GatewayCheckInput };

/**
 * کدام تلاش: با کلید برگشت (برگشت از درگاه، سؤال ۱۴۵) یا شناسه (استعلام خودکار و پنل)، هر دو فقط از درگاه‌هایی که همین حالا در کارند (درگاه
 * نمونه هرگز در `live`)؛ یا درگاه و شناسهٔ تلاش نزد آن.
 */
export type PaymentLookup =
  | { returnKey: string; providers: readonly string[] }
  | { paymentId: string; providers: readonly string[] }
  | { provider: string; authority: string };

export interface SettleOptions {
  via?: SettledVia;
  /** برگشت مرورگر مشتری: `returned_at` اگر هنوز نیست. */
  returned?: Date;
  /** استعلام خودکار: تلاشی که کس دیگری همین حالا قفلش کرده رها می‌شود (`busy`)، نه منتظرش. */
  skipLocked?: boolean;
}

export interface SettledPayment {
  payment: PaymentRow;
  order: OrderRow;
  /** false یعنی پرداخت از قبل نهایی بود (برگشت تکراری) و چیزی عوض نشد. */
  settled: boolean;
  /** ردیف «منتظر» پیامک پرداختی که همین تراکنش نوشت (برش ۷٫۱)؛ بعد از commit فرستاده می‌شود. */
  smsId: number | null;
  /**
   * ردیف «منتظر» پیامک سفارش تازه به چاپخانه‌ای که همین تراکنش سفارش را به آن داد و موبایل اعلان دارد (برش ۷٫۶)؛ بعد از commit با پیامک
   * پرداخت فرستاده می‌شود. null: پرداخت نهایی نشد، چاپخانه‌ای نبود، یا چاپخانه موبایل اعلان ندارد.
   */
  partnerSmsId: number | null;
}

export interface OrderStore {
  documents(ids: readonly string[]): Promise<CheckoutDocument[]>;
  activePriceList(): Promise<PriceList>;
  priceList(version: number): Promise<PriceList>;
  /** مقدار خام یک کلید `settings`؛ undefined یعنی تنظیم نشده. */
  setting(key: string): Promise<unknown>;
  findByCheckoutKey(checkoutKey: string): Promise<OrderRow | null>;
  /**
   * سفارش کامل در یک تراکنش. اگر سفارشی با همین `checkoutKey` هست (دو کلیک، تلاش دوبارهٔ شبکه)، همان
   * برمی‌گردد با `created: false`؛ سرویس صاحبش را می‌سنجد.
   */
  createOrder(order: NewOrder): Promise<{ order: OrderRow; created: boolean }>;
  details(publicToken: string): Promise<OrderDetails | null>;
  insertPayment(payment: {
    /** شناسهٔ تلاش، اگر پیش از درگاه ساخته شد (پسوند `gateway_order_id`). */
    id?: string;
    orderId: string;
    provider: string;
    amountRials: number;
    authority: string;
    /** شناسهٔ سفارش نزد درگاه (برش ۷٫۲)؛ برای زیبال اجباری. */
    gatewayOrderId?: string | null;
    /** کلید برگشت (سؤال ۱۴۵)؛ بی آن پیش‌فرض تصادفی پایگاه داده. */
    returnKey?: string;
    raw: unknown;
  }): Promise<PaymentRow>;
  /** پرداخت یک درگاه با سفارشش؛ برای صفحهٔ درگاه نمونه. */
  gatewayPayment(provider: string, authority: string): Promise<{ payment: PaymentRow; order: OrderRow } | null>;
  /**
   * تصمیم صفحهٔ درگاه نمونه (ADR-035)، فقط یک بار و فقط برای پرداخت در انتظار. برگشت از درگاه همین را
   * می‌خواند، نه پارامتر نشانی را.
   */
  recordMockDecision(authority: string, decision: string, at: Date): Promise<boolean>;
  /**
   * برگشت از درگاه، زیر قفل ردیف پرداخت و سفارش. `decide` فقط برای پرداخت در انتظار صدا زده می‌شود و
   * همان‌جا درگاه را می‌سنجد؛ موفق یعنی در همان تراکنش: پرداخت موفق، سفارش `paid` با تاریخ و مهلت،
   * رویداد وضعیت، چاپخانهٔ سفارش با ردیف تخصیص (برش ۵٫۲؛ بی چاپخانهٔ فعال، بی چاپخانه)، و کارهای `prepare_order` و
   * `prepare_ticket`. null یعنی چنین پرداختی نیست.
   */
  settlePayment(
    provider: string,
    authority: string,
    decide: (current: { payment: PaymentRow; order: OrderRow }) => Promise<Settlement>,
  ): Promise<SettledPayment | null>;
  /**
   * همان `settlePayment` با هر شکل پیدا کردن تلاش (برش ۷٫۲). «در انتظار» (`pending`) فقط آنچه از درگاه دانستیم را می‌نویسد؛ `busy` فقط
   * با `skipLocked`.
   */
  settle(
    lookup: PaymentLookup,
    decide: (current: { payment: PaymentRow; order: OrderRow }) => Promise<Settlement>,
    options?: SettleOptions,
  ): Promise<SettledPayment | 'busy' | null>;
  /**
   * تلاش‌های بازی که استعلام خودکار می‌پرسد (برش ۷٫۲، سؤال ۱۴۴): در انتظار، ساخته پیش از `createdBefore`، و آخرین پرسش‌شان پیش از
   * `checkedBefore`؛ قدیمی‌ترین اول.
   */
  pendingAttempts(input: { providers: readonly string[]; createdBefore: Date; checkedBefore: Date; limit: number }): Promise<string[]>;
  /**
   * تلاش‌های بسته‌ای که پولشان شاید هنوز نزد درگاه است (پرداخت دوم، مهلت گذشته، مبلغ ناهمخوان) و وضعیتشان ۲، ۱۶ یا ناپیداست: استعلام
   * خودکار تا «ریورس‌شده» می‌پایدشان («پول مشتری برمی‌گردد»).
   */
  heldAttempts(input: { providers: readonly string[]; createdAfter: Date; checkedBefore: Date; limit: number }): Promise<PaymentRow[]>;
  /** آنچه استعلام دربارهٔ تلاشی بسته دانست؛ وضعیت تلاش عوض نمی‌شود. */
  recordGatewayCheck(paymentId: string, check: GatewayCheckInput): Promise<void>;
  /**
   * درگاه شروع پرداخت را با کدی رد کرد که کار مالک است (`GATEWAY_NOT_READY_RESULTS`): رویداد سیستم `payments.gateway_rejected` (بی ادمین،
   * روی سفارش)، برای هشدار پیشخوان و رویدادهای سفارش. فقط کد و شمارهٔ سفارش؛ هیچ مقدار کلیدی.
   */
  recordGatewayRejection(input: { orderId: string; orderNumber: number; provider: string; result: number; at: Date }): Promise<void>;
  /** سفارش در انتظاری که فایل‌هایش دیگر زنده نیستند. */
  expireOrder(orderId: string, at: Date): Promise<boolean>;
}

type PgError = { code?: string; constraint_name?: string; cause?: PgError };

/** نام محدودیتی که پستگرس رد کرد؛ drizzle خطای درایور را در `cause` می‌پیچد. */
function constraintOf(error: unknown): string | undefined {
  const pg = error as PgError;
  return pg?.cause?.constraint_name ?? pg?.constraint_name;
}

export function createOrderStore({ db }: Database): OrderStore {
  async function findByCheckoutKey(checkoutKey: string): Promise<OrderRow | null> {
    const [row] = await db.select().from(orders).where(eq(orders.checkoutKey, checkoutKey)).limit(1);
    return row ?? null;
  }

  const settle: OrderStore['settle'] = async (lookup, decide, options = {}) => {
    if ('providers' in lookup && lookup.providers.length === 0) return null;
    const where =
      'returnKey' in lookup
        ? and(eq(payments.returnKey, lookup.returnKey), inArray(payments.provider, [...lookup.providers]))
        : 'paymentId' in lookup
          ? and(eq(payments.id, lookup.paymentId), inArray(payments.provider, [...lookup.providers]))
          : and(eq(payments.provider, lookup.provider), eq(payments.authority, lookup.authority));
    return db.transaction(async (tx) => {
      const query = tx.select().from(payments).where(where).limit(1);
      const [payment] = await (options.skipLocked ? query.for('update', { skipLocked: true }) : query.for('update'));
      if (!payment) {
        if (!options.skipLocked) return null;
        const [exists] = await tx.select({ id: payments.id }).from(payments).where(where).limit(1);
        return exists ? 'busy' : null;
      }
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1).for('update');
      if (payment.status !== 'pending') return { payment, order: order!, settled: false, smsId: null, partnerSmsId: null };

      const outcome = await decide({ payment, order: order! });
      const returned = options.returned && !payment.returnedAt ? { returnedAt: options.returned } : {};
      const gateway = (check: GatewayCheckInput | undefined) =>
        check ? { gatewayStatus: check.status, gatewayError: check.error, gatewayCheckedAt: check.at } : {};
      if (outcome.kind === 'pending') {
        const [row] = await tx
          .update(payments)
          .set({ ...returned, ...gateway(outcome.check) })
          .where(eq(payments.id, payment.id))
          .returning();
        return { payment: row!, order: order!, settled: false, smsId: null, partnerSmsId: null };
      }
      if (outcome.kind === 'failed') {
        const [failed] = await tx
          .update(payments)
          .set({
            status: 'failed',
            failureCode: outcome.code,
            raw: outcome.raw ?? null,
            cardMask: outcome.cardMask ?? null,
            verifiedAmountRials: outcome.verifiedAmountRials ?? null,
            settledVia: options.via ?? null,
            ...returned,
            ...gateway(outcome.check),
          })
          .where(eq(payments.id, payment.id))
          .returning();
        return { payment: failed!, order: order!, settled: true, smsId: null, partnerSmsId: null };
      }

      // پیامک پرداخت (برش ۷٫۱، ADR-049): ردیف «منتظر» در همین تراکنش، و پرداخت موفق به آن وصل (تریگر `payments_sms`)؛ فرستادنش بعد از
      // commit با `deliverQueued`، تا پیامکی که نرفت پرداخت را برنگرداند و در پنل «دوباره بفرست» داشته باشد.
      const smsId = await queuedPaidSms(tx, {
        toMobile: order!.recipientPhone,
        orderNumber: order!.orderNumber,
        handoffDay: formatDeadlineDay(outcome.postHandoffDueAt),
        at: outcome.paidAt,
      });
      const [succeeded] = await tx
        .update(payments)
        .set({
          status: 'succeeded',
          refId: outcome.refId,
          cardMask: outcome.cardMask,
          raw: outcome.raw ?? null,
          verifiedAt: outcome.paidAt,
          verifiedAmountRials: outcome.verifiedAmountRials,
          settledVia: options.via ?? null,
          smsMessageId: smsId,
          ...returned,
          ...gateway(outcome.check),
        })
        .where(eq(payments.id, payment.id))
        .returning();
      const [paid] = await tx
        .update(orders)
        .set({ status: 'paid', paidAt: outcome.paidAt, postHandoffDueAt: outcome.postHandoffDueAt })
        .where(and(eq(orders.id, order!.id), eq(orders.status, 'awaiting_payment')))
        .returning();
      // سرویس وضعیت سفارش را پیش از سنجش درگاه دیده؛ رسیدن به اینجا با سفارش غیرقابل پرداخت باگ است.
      if (!paid) throw new Error(`سفارش ${order!.orderNumber} در انتظار پرداخت نیست.`);
      await tx.insert(orderStatusEvents).values({
        orderId: order!.id,
        fromStatus: 'awaiting_payment',
        toStatus: 'paid',
        at: outcome.paidAt,
        actor: 'gateway',
        note: { paymentId: payment.id, provider: payment.provider, refId: outcome.refId, ...(options.via ? { via: options.via } : {}) },
      });
      // چاپخانه پیش از کار برگه: برگه نام و شهرش را دارد. بی چاپخانهٔ فعال سفارش بی چاپخانه می‌ماند (هشدار پیشخوان). چاپخانهٔ با موبایل
      // اعلان پیامک «منتظر» سفارش تازه را هم در همین تراکنش می‌گیرد (برش ۷٫۶).
      const assigned = await assignAtPayment(tx, paid, outcome.paidAt);
      // برگشت دوباره از درگاه کار دوم نمی‌سازد: شاخص یکتای (سفارش، نوع) جلویش را می‌گیرد.
      await tx
        .insert(jobs)
        .values([
          { kind: PREPARE_ORDER_JOB, orderId: order!.id },
          { kind: PREPARE_TICKET_JOB, orderId: order!.id },
        ])
        .onConflictDoNothing();
      return {
        payment: succeeded!,
        order: assigned ? { ...paid, printPartnerId: assigned.partnerId } : paid,
        settled: true,
        smsId,
        partnerSmsId: assigned?.smsId ?? null,
      };
    });
  };

  return {
    async documents(ids) {
      if (ids.length === 0) return [];
      return db
        .select({
          id: documents.id,
          sessionHash: documents.sessionHash,
          originalName: documents.originalName,
          status: documents.status,
          pageCount: documents.pageCount,
          fileExpiresAt: documents.fileExpiresAt,
          fileDeletedAt: documents.fileDeletedAt,
        })
        .from(documents)
        .where(inArray(documents.id, [...ids]));
    },

    activePriceList: () => loadActivePriceList({ db } as Database),

    priceList: (version) => loadPriceList({ db } as Database, version),

    async setting(key) {
      const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },

    findByCheckoutKey,

    async createOrder(input) {
      const b = input.breakdown;
      if (b.shippingRials === null) throw new Error('سفارش بی کرایه ساخته نمی‌شود.');
      try {
        return await db.transaction(async (tx) => {
          const [order] = await tx
            .insert(orders)
            .values({
              checkoutKey: input.checkoutKey,
              userId: input.userId,
              priceListVersion: b.priceListVersion,
              priceBreakdown: b,
              quoteSnapshot: input.quoteSnapshot ?? null,
              subtotalRials: b.subtotalRials,
              discountRials: b.discountRials,
              shippingRials: b.shippingRials!,
              vatRials: b.vatRials,
              roundingRials: b.roundingRials,
              totalRials: b.totalRials,
              estWeightGrams: b.estWeightGrams,
              slaDays: input.slaDays,
              shippingMethodId: input.shippingMethodId,
              shippingZoneId: input.shippingZoneId,
              provinceId: input.provinceId,
              cityId: input.cityId,
              recipientName: input.recipientName,
              recipientPhone: input.recipientPhone,
              addressText: input.addressText,
              postalCode: input.postalCode,
            })
            .returning();
          for (const [i, item] of input.items.entries()) {
            const [row] = await tx
              .insert(orderItems)
              .values({
                orderId: order!.id,
                seq: i + 1,
                pageCount: item.pageCount,
                copies: item.copies,
                sidesMode: item.sidesMode,
                bindingTypeId: item.bindingTypeId,
              })
              .returning({ id: orderItems.id });
            await tx.insert(orderItemSections).values(
              item.sections.map((s, j) => ({
                orderItemId: row!.id,
                seq: j + 1,
                documentId: s.documentId,
                pageCount: s.pageCount,
              })),
            );
            await tx.insert(printRules).values(
              item.rules.map((r, j) => ({
                orderItemId: row!.id,
                seq: j + 1,
                pageRanges: r.pageRanges,
                colorMode: r.colorMode,
                paperTypeId: r.paperTypeId,
              })),
            );
          }
          await tx
            .insert(orderStatusEvents)
            .values({ orderId: order!.id, fromStatus: null, toStatus: 'awaiting_payment', actor: 'user' });
          return { order: order!, created: true };
        });
      } catch (error) {
        // دو «پرداخت» هم‌زمان با یک کلید: دومی پشت شاخص یکتا منتظر می‌ماند و بعد رد می‌شود. همان سفارش.
        if (constraintOf(error) === 'orders_checkout_key_unique') {
          const existing = await findByCheckoutKey(input.checkoutKey);
          if (existing) return { order: existing, created: false };
        }
        throw error;
      }
    },

    async details(publicToken) {
      const [order] = await db.select().from(orders).where(eq(orders.publicToken, publicToken)).limit(1);
      if (!order) return null;
      const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.seq);
      const itemIds = itemRows.map((item) => item.id);
      const [sectionRows, ruleRows, paymentRows, parcelRows, refundRows] = await Promise.all([
        itemIds.length === 0
          ? []
          : db
              .select({
                orderItemId: orderItemSections.orderItemId,
                seq: orderItemSections.seq,
                documentId: orderItemSections.documentId,
                pageCount: orderItemSections.pageCount,
                originalName: documents.originalName,
                fileExpiresAt: documents.fileExpiresAt,
                fileDeletedAt: documents.fileDeletedAt,
              })
              .from(orderItemSections)
              .innerJoin(documents, eq(documents.id, orderItemSections.documentId))
              .where(inArray(orderItemSections.orderItemId, itemIds))
              .orderBy(orderItemSections.orderItemId, orderItemSections.seq),
        itemIds.length === 0
          ? []
          : db
              .select()
              .from(printRules)
              .where(inArray(printRules.orderItemId, itemIds))
              .orderBy(printRules.orderItemId, printRules.seq),
        db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
        db
          .select({ barcode: shipments.barcode, createdAt: shipments.createdAt, ...shipmentSmsFields })
          .from(shipments)
          .leftJoin(smsMessages, eq(smsMessages.id, shipments.smsMessageId))
          .where(and(eq(shipments.orderId, order.id), isNull(shipments.voidedAt)))
          .orderBy(asc(shipments.createdAt), asc(shipments.rowNo)),
        db.select().from(refunds).where(eq(refunds.orderId, order.id)).orderBy(desc(refunds.createdAt), desc(refunds.id)),
      ]);
      return {
        order,
        items: itemRows.map((item) => ({
          ...item,
          sections: sectionRows
            .filter((s) => s.orderItemId === item.id)
            .map(({ orderItemId: _item, ...section }) => section),
          rules: ruleRows.filter((r) => r.orderItemId === item.id),
        })),
        payments: paymentRows,
        parcels: parcelRows.map(({ barcode, createdAt, ...sms }) => ({ barcode, createdAt, sms: shipmentSmsOf(sms) })),
        refunds: refundRows,
      };
    },

    async insertPayment(payment) {
      const [row] = await db
        .insert(payments)
        .values({
          ...(payment.id ? { id: payment.id } : {}),
          orderId: payment.orderId,
          provider: payment.provider,
          amountRials: payment.amountRials,
          authority: payment.authority,
          gatewayOrderId: payment.gatewayOrderId ?? null,
          ...(payment.returnKey ? { returnKey: payment.returnKey } : {}),
          raw: payment.raw ?? null,
        })
        .returning();
      return row!;
    },

    async gatewayPayment(provider, authority) {
      const [row] = await db
        .select({ payment: payments, order: orders })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(and(eq(payments.provider, provider), eq(payments.authority, authority)))
        .limit(1);
      return row ?? null;
    },

    async recordMockDecision(authority, decision, at) {
      const rows = await db
        .update(payments)
        .set({ raw: { decision, decidedAt: at.toISOString() } })
        .where(
          and(
            eq(payments.provider, 'mock'),
            eq(payments.authority, authority),
            eq(payments.status, 'pending'),
            sql`(${payments.raw} ->> 'decision') IS NULL`,
          ),
        )
        .returning({ id: payments.id });
      return rows.length > 0;
    },

    settle,

    settlePayment: (provider, authority, decide) => settle({ provider, authority }, decide) as Promise<SettledPayment | null>,

    async pendingAttempts({ providers, createdBefore, checkedBefore, limit }) {
      if (providers.length === 0) return [];
      const rows = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.status, 'pending'),
            inArray(payments.provider, [...providers]),
            lt(payments.createdAt, createdBefore),
            or(isNull(payments.gatewayCheckedAt), lt(payments.gatewayCheckedAt, checkedBefore)),
          ),
        )
        .orderBy(asc(payments.createdAt))
        .limit(limit);
      return rows.map((row) => row.id);
    },

    async heldAttempts({ providers, createdAfter, checkedBefore, limit }) {
      if (providers.length === 0) return [];
      return db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.status, 'failed'),
            inArray(payments.provider, [...providers]),
            inArray(payments.failureCode, [...HELD_FAILURES]),
            or(isNull(payments.gatewayStatus), inArray(payments.gatewayStatus, [...MONEY_HELD_STATUSES])),
            gt(payments.createdAt, createdAfter),
            or(isNull(payments.gatewayCheckedAt), lt(payments.gatewayCheckedAt, checkedBefore)),
          ),
        )
        .orderBy(asc(payments.createdAt))
        .limit(limit);
    },

    async recordGatewayCheck(paymentId, check) {
      await db
        .update(payments)
        .set({ gatewayStatus: check.status, gatewayError: check.error, gatewayCheckedAt: check.at })
        .where(eq(payments.id, paymentId));
    },

    async recordGatewayRejection({ orderId, orderNumber, provider, result, at }) {
      await db.insert(adminEvents).values(
        adminEventRow({
          adminUserId: null,
          action: 'payments.gateway_rejected',
          targetType: 'order',
          targetId: orderId,
          at,
          detail: { orderNumber, provider, result },
        }),
      );
    },

    async expireOrder(orderId, at) {
      return db.transaction(async (tx) => {
        const [expired] = await tx
          .update(orders)
          .set({ status: 'expired' })
          .where(and(eq(orders.id, orderId), eq(orders.status, 'awaiting_payment')))
          .returning({ id: orders.id });
        if (!expired) return false;
        await tx.insert(orderStatusEvents).values({
          orderId,
          fromStatus: 'awaiting_payment',
          toStatus: 'expired',
          at,
          actor: 'system',
          note: { reason: 'files_expiring' },
        });
        return true;
      });
    },
  };
}
