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
 *    (رفرش، دو زبانه) پشت‌سرهم اجرا می‌شوند و دومی نتیجهٔ اولی را می‌بیند.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Breakdown, PriceList } from '@jozveyar/contracts';

import type { DocumentRow } from './documents.js';
import type { Database } from './index.js';
import {
  documents,
  jobs,
  orderItemSections,
  orderItems,
  orderStatusEvents,
  orders,
  payments,
  printRules,
  settings,
} from './schema.js';
import { loadActivePriceList, loadPriceList } from './seed.js';

/** کار کارگر اسناد بعد از پرداخت: PDF جزوه زیر `orders/` (ADR-030). همین رشته در services/docworker. */
export const PREPARE_ORDER_JOB = 'prepare_order';

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type PrintRuleRow = typeof printRules.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;

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
}

/** نتیجهٔ سنجش درگاه، که `settlePayment` در همان تراکنش اعمال می‌کند. */
export type Settlement =
  | {
      kind: 'succeeded';
      refId: string;
      cardMask: string | null;
      raw: unknown;
      paidAt: Date;
      postHandoffDueAt: Date;
    }
  | { kind: 'failed'; code: string; raw: unknown };

export interface SettledPayment {
  payment: PaymentRow;
  order: OrderRow;
  /** false یعنی پرداخت از قبل نهایی بود (برگشت تکراری) و چیزی عوض نشد. */
  settled: boolean;
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
    orderId: string;
    provider: string;
    amountRials: number;
    authority: string;
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
   * رویداد وضعیت، و کار `prepare_order`. null یعنی چنین پرداختی نیست.
   */
  settlePayment(
    provider: string,
    authority: string,
    decide: (current: { payment: PaymentRow; order: OrderRow }) => Promise<Settlement>,
  ): Promise<SettledPayment | null>;
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
      const [sectionRows, ruleRows, paymentRows] = await Promise.all([
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
      };
    },

    async insertPayment(payment) {
      const [row] = await db
        .insert(payments)
        .values({
          orderId: payment.orderId,
          provider: payment.provider,
          amountRials: payment.amountRials,
          authority: payment.authority,
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

    async settlePayment(provider, authority, decide) {
      return db.transaction(async (tx) => {
        const [payment] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.provider, provider), eq(payments.authority, authority)))
          .limit(1)
          .for('update');
        if (!payment) return null;
        const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1).for('update');
        if (payment.status !== 'pending') return { payment, order: order!, settled: false };

        const outcome = await decide({ payment, order: order! });
        if (outcome.kind === 'failed') {
          const [failed] = await tx
            .update(payments)
            .set({ status: 'failed', failureCode: outcome.code, raw: outcome.raw ?? null })
            .where(eq(payments.id, payment.id))
            .returning();
          return { payment: failed!, order: order!, settled: true };
        }

        const [succeeded] = await tx
          .update(payments)
          .set({
            status: 'succeeded',
            refId: outcome.refId,
            cardMask: outcome.cardMask,
            raw: outcome.raw ?? null,
            verifiedAt: outcome.paidAt,
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
          note: { paymentId: payment.id, provider, refId: outcome.refId },
        });
        // برگشت دوباره از درگاه کار دوم نمی‌سازد: شاخص یکتای (سفارش، نوع) جلویش را می‌گیرد.
        await tx.insert(jobs).values({ kind: PREPARE_ORDER_JOB, orderId: order!.id }).onConflictDoNothing();
        return { payment: succeeded!, order: paid, settled: true };
      });
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
