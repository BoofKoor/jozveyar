/**
 * «سفارش‌های من» در پایگاه داده (برش ۱۲٫۱، ADR-068؛ سؤال ۳۰۷): سفارش‌های یک مشتری برای فهرست سایت و فرم «پیام تازه».
 *
 * فقط خواندن است، با همان شکل `details()` صفحهٔ سفارش برای آنچه فهرست لازم دارد (پرداخت‌ها، کدهای زنده و بازپرداخت‌ها)، تا حکم هر کارت
 * («پرداخت»، «در حال بررسی»، روز تحویل به پست، کد رهگیری، «برگشت داده شد») همان تابع‌های صفحهٔ سفارش در سرویس سایت باشد. دو چیز اینجاست:
 *
 * - **کدام سفارش‌ها:** همهٔ سفارش‌های این مشتری، تازه‌ترین اول، جز «منقضی» و در انتظار پرداختی که دیگر پرداختنی نیست (فایلی که رفته یا تا
 *   یک ساعت دیگر می‌رود، `FILE_MARGIN_MS`) و پرداختی هم در بررسی ندارد؛ همان که صفحهٔ سفارش «منقضی» نشان می‌دهد. شرط در خود کوئری است،
 *   پس صفحه‌بندی درست می‌ماند.
 * - **شمار فایل و صفحه:** هر بخش هر جزوه یک فایل، و صفحه جمع صفحه‌های جزوه‌ها (بی نسخه‌ها)، همان «3 فایل، 120 صفحه» طرح.
 */

import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import type { Database } from './index.js';
import { FILE_MARGIN_MS, type OrderRow, type PaymentRow } from './orders.js';
import type { RefundRow } from './refunds.js';
import { orders, payments, refunds, shipments } from './schema.js';

/** یک سفارش «سفارش‌های من». */
export interface CustomerOrderRow {
  order: Pick<
    OrderRow,
    'id' | 'orderNumber' | 'publicToken' | 'status' | 'createdAt' | 'paidAt' | 'totalRials' | 'postHandoffDueAt' | 'handedToPostAt'
  >;
  fileCount: number;
  pageCount: number;
  /**
   * زودترین پاک شدن فایل‌های سفارش، اگر هیچ فایلی هنوز پاک نشده و همه زمان پاک شدن دارند؛ وگرنه null. «پرداخت» فقط وقتی همهٔ فایل‌ها دست‌کم
   * `FILE_MARGIN_MS` دیگر می‌مانند (همان `payable` سایت).
   */
  filesLiveUntil: Date | null;
  /** همهٔ تلاش‌های پرداخت، تازه‌ترین اول. */
  payments: PaymentRow[];
  /** کدهای رهگیری زنده، به ترتیب ثبت. */
  parcels: { barcode: string; createdAt: Date }[];
  /** بازپرداخت‌ها، تازه‌ترین اول. */
  refunds: RefundRow[];
}

export interface CustomerOrdersPage {
  rows: CustomerOrderRow[];
  /** شمار همهٔ سفارش‌هایی که فهرست نشان می‌دهد، برای صفحه‌بندی. */
  total: number;
}

export interface AccountStore {
  customerOrders(userId: string, input: { at: Date; limit: number; offset: number }): Promise<CustomerOrdersPage>;
  /** یک سفارش همین مشتری با شماره‌اش، با همان شرط فهرست؛ برای سفارشی که «پیام تازه» از صفحه‌اش آمده. */
  customerOrder(userId: string, orderNumber: number, at: Date): Promise<CustomerOrderRow | null>;
  /** شناسهٔ سفارشی از همین مشتری با شماره‌اش، در هر وضعیتی؛ پیام دربارهٔ آن (سؤال ۳۰۹). */
  ownedOrderId(userId: string, orderNumber: number): Promise<string | null>;
}

/** «در حال بررسی» در SQL: همان `isChecking` (`payments.ts`)؛ تست یکپارچگی هر دو را روی همهٔ ترکیب‌ها می‌سنجد. */
export const checkingPaymentSql = sql`p.status = 'pending' AND (coalesce(p.gateway_status IN (1, 2), false) OR (p.returned_at IS NOT NULL AND p.gateway_error IS NOT NULL))`;

const asDate = (value: unknown): Date | null => (value === null || value === undefined ? null : value instanceof Date ? value : new Date(String(value)));

export function createAccountStore({ db }: Database): AccountStore {
  async function page(userId: string, at: Date, extra: SQL, limit: number, offset: number): Promise<CustomerOrdersPage> {
    const liveFrom = new Date(at.getTime() + FILE_MARGIN_MS);
    const rows = (await db.execute(sql`
      WITH mine AS (
        SELECT o.id, o.order_number, o.public_token, o.status, o.created_at, o.paid_at, o.total_rials, o.post_handoff_due_at,
               o.handed_to_post_at,
               (SELECT count(*)::int FROM order_item_sections s JOIN order_items i ON i.id = s.order_item_id WHERE i.order_id = o.id)
                 AS file_count,
               (SELECT coalesce(sum(i.page_count), 0)::int FROM order_items i WHERE i.order_id = o.id) AS page_count,
               (SELECT CASE WHEN bool_and(d.file_deleted_at IS NULL AND d.file_expires_at IS NOT NULL) THEN min(d.file_expires_at) END
                  FROM order_item_sections s JOIN order_items i ON i.id = s.order_item_id JOIN documents d ON d.id = s.document_id
                 WHERE i.order_id = o.id) AS files_live_until,
               EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND ${checkingPaymentSql}) AS checking
          FROM orders o
         WHERE o.user_id = ${userId} ${extra}
      )
      SELECT *, count(*) OVER ()::int AS total
        FROM mine
       WHERE status <> 'expired'
         AND NOT (status = 'awaiting_payment' AND NOT checking
                  AND (files_live_until IS NULL OR files_live_until < ${liveFrom.toISOString()}::timestamptz))
       ORDER BY created_at DESC, order_number DESC
       LIMIT ${limit} OFFSET ${offset}`)) as unknown as Record<string, unknown>[];
    if (rows.length === 0) {
      // صفحه‌ای بعد از آخر هم شمار کل را می‌خواهد.
      if (offset === 0) return { rows: [], total: 0 };
      return { rows: [], total: (await page(userId, at, extra, 1, 0)).total };
    }
    const ids = rows.map((row) => String(row.id));
    const [paymentRows, parcelRows, refundRows] = await Promise.all([
      db.select().from(payments).where(inArray(payments.orderId, ids)).orderBy(desc(payments.createdAt)),
      db
        .select({ orderId: shipments.orderId, barcode: shipments.barcode, createdAt: shipments.createdAt })
        .from(shipments)
        .where(and(inArray(shipments.orderId, ids), isNull(shipments.voidedAt)))
        .orderBy(asc(shipments.createdAt), asc(shipments.rowNo)),
      db.select().from(refunds).where(inArray(refunds.orderId, ids)).orderBy(desc(refunds.createdAt), desc(refunds.id)),
    ]);
    return {
      total: Number(rows[0]!.total),
      rows: rows.map((row) => {
        const id = String(row.id);
        return {
          order: {
            id,
            orderNumber: Number(row.order_number),
            publicToken: String(row.public_token),
            status: row.status as OrderRow['status'],
            createdAt: asDate(row.created_at)!,
            paidAt: asDate(row.paid_at),
            totalRials: Number(row.total_rials),
            postHandoffDueAt: asDate(row.post_handoff_due_at),
            handedToPostAt: asDate(row.handed_to_post_at),
          },
          fileCount: Number(row.file_count),
          pageCount: Number(row.page_count),
          filesLiveUntil: asDate(row.files_live_until),
          payments: paymentRows.filter((p) => p.orderId === id),
          parcels: parcelRows.filter((p) => p.orderId === id).map(({ barcode, createdAt }) => ({ barcode, createdAt })),
          refunds: refundRows.filter((r) => r.orderId === id),
        };
      }),
    };
  }

  return {
    customerOrders: (userId, { at, limit, offset }) => page(userId, at, sql``, limit, offset),

    async customerOrder(userId, orderNumber, at) {
      const found = await page(userId, at, sql`AND o.order_number = ${orderNumber}`, 1, 0);
      return found.rows[0] ?? null;
    },

    async ownedOrderId(userId, orderNumber) {
      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.orderNumber, orderNumber)))
        .limit(1);
      return row?.id ?? null;
    },
  };
}
