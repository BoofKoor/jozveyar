/**
 * سفارش‌ها در پنل ادمین (برش ۴٫۲؛ ADR-039): پیشخوان با ساعت تحویل به پست، فهرست با جست‌وجو و چیپ وضعیت،
 * جزئیات سفارش، فایل PDF جزوه برای دانلود، و «دوباره بساز» آن.
 *
 * مثل بقیهٔ این پکیج فقط خواندن و نوشتن است: روز تهران، متن‌ها و مجوز در سرویس سفارش پنل
 * (`apps/admin/lib/server/orders.ts`) گرفته می‌شوند و مرزها اینجا عدد می‌رسند. آنچه اینجاست همان است که
 * درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **سطل‌ها با یک شرط:** «باز» (پرداخت‌شده؛ چاپ و تحویل پست با ۴٫۳)، «در انتظار پرداخت»، «رهاشده» و «همه»،
 *    هم برای فهرست و هم برای شمارش چیپ‌ها. رهاشده یعنی منقضی، یا در انتظاری که فایلی از جزوه‌اش پاک شده یا
 *    تا حاشیهٔ پرداخت پاک می‌شود: همان قاعدهٔ «دوباره پرداخت کن» سایت (ADR-034).
 *  - **مرز روز:** مهلت تحویل به پست پایان انحصاری روز است (`postHandoffDue`)، پس مهلتِ «امروز» خودِ آغاز فرداست.
 *    شمارش با مرزهایی است که سرویس از روز تهران می‌سازد.
 *  - **یک تراکنش:** «دوباره بساز» کار شکست‌خوردهٔ `prepare_order` را با رویداد ادمین در همان تراکنش به صف
 *    برمی‌گرداند، زیر قفل ردیف کار؛ دو کلیک هم‌زمان یک بار.
 */

import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { PREPARE_ORDER_JOB, type OrderItemRow, type OrderRow, type PaymentRow } from './orders.js';
import {
  adminEvents,
  adminUsers,
  bindingTypes,
  cities,
  documents,
  jobs,
  orderItemSections,
  orderItems,
  orderStatusEvents,
  orders,
  paperTypes,
  payments,
  printRules,
  provinces,
  settings,
  shippingMethods,
  shippingZones,
} from './schema.js';

/** چیپ‌های فهرست سفارش‌ها در ۴٫۲. «تحویل پست شد» و «لغو شد» با وضعیت‌هایشان در ۴٫۳. */
export const PANEL_BUCKETS = ['open', 'awaiting', 'abandoned', 'all'] as const;
export type PanelBucket = (typeof PANEL_BUCKETS)[number];

/**
 * جست‌وجوی سفارش، تجزیه‌شده در سرویس: شماره (و ته شمارهٔ موبایل)، موبایل کامل، یا نام گیرنده.
 * `phoneSuffix` فقط رقم است؛ `text` فارسی‌نرمال‌شده.
 */
export type PanelSearch =
  | { kind: 'digits'; orderNumber: number | null; phoneSuffix: string | null }
  | { kind: 'mobile'; mobile: string }
  | { kind: 'name'; text: string };

/** «حالا» و دو مرزی که با آن ساخته می‌شوند. */
export interface PanelClock {
  at: Date;
  /** فایلی که پیش از این لحظه پاک می‌شود، سفارش در انتظار را «رهاشده» می‌کند: `at` + حاشیهٔ پرداخت. */
  staleBefore: Date;
  /** تلاشی که پیش از این ساخته شده و هنوز در انتظار است «بی برگشت» است: `at` − مهلت هر تلاش پرداخت. */
  unreturnedBefore: Date;
}

/** یک ردیف فهرست سفارش‌ها و صف تحویل. */
export interface PanelOrderLine {
  id: string;
  orderNumber: number;
  status: OrderRow['status'];
  totalRials: number;
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  cityName: string | null;
  createdAt: Date;
  paidAt: Date | null;
  postHandoffDueAt: Date | null;
  /** صفحه‌های جزوه‌ها، یک نسخه. */
  pageCount: number;
  itemCount: number;
  fileCount: number;
  /** بیشترین تعداد نسخهٔ یک جزوه. */
  copies: number;
  colorModes: string[];
  sidesModes: string[];
  /** کار `prepare_order`؛ null یعنی هنوز نیست (سفارش پرداخت‌نشده). */
  pdfJob: 'queued' | 'running' | 'done' | 'failed' | null;
  /** تلاش‌های پرداختی که هنوز در انتظارند و از مهلتشان گذشته. */
  unreturnedPayments: number;
  /** فایلی از جزوه پاک شده، بی مهلت است، یا پیش از `staleBefore` پاک می‌شود. */
  stale: boolean;
  /** زودترین پاک شدن فایل‌های جزوه. */
  filesExpireAt: Date | null;
}

/** شمارش مهلت‌های سفارش‌های باز، با مرزهای روز تهران. */
export interface PanelDueSummary {
  overdue: number;
  today: number;
  tomorrow: number;
  later: number;
  /** زودترین و دیرترین مهلتِ دیرشده‌ها و «بعدتر»ها؛ متن کاشی‌ها با این‌ها. */
  overdueRange: { earliest: Date; latest: Date } | null;
  laterRange: { earliest: Date; latest: Date } | null;
}

export interface PanelAlerts {
  /** سفارش‌های پرداخت‌شده‌ای که PDF جزوه‌شان ساخته نشد، به ترتیب مهلت. */
  failedPdf: number[];
  /** تلاش‌های بی برگشتِ سفارش‌هایی که هنوز پرداختنی‌اند، هر سفارش یک بار؛ تازه‌ترین سفارش اول. */
  unreturned: { orderNumber: number; attempts: number }[];
}

export interface PanelSection {
  seq: number;
  documentId: string;
  pageCount: number;
  originalName: string;
  sourceKind: string;
  fileExpiresAt: Date | null;
  fileDeletedAt: Date | null;
}

export interface PanelRule {
  seq: number;
  pageRanges: [number, number][];
  colorMode: 'color' | 'bw';
  paperTypeId: string;
  /** نام کاغذ در همان نسخهٔ تعرفهٔ سفارش. */
  paperName: string | null;
}

export interface PanelOrderItem extends OrderItemRow {
  /** نام صحافی در همان نسخهٔ تعرفهٔ سفارش. */
  bindingName: string | null;
  sections: PanelSection[];
  rules: PanelRule[];
}

export interface PanelPdfJob {
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

export type PanelStatusEvent = typeof orderStatusEvents.$inferSelect;

/** رویداد ادمینِ یک سفارش (دانلود، «دوباره بساز»)، با نام ادمین. */
export interface PanelOrderEvent {
  id: number;
  at: Date;
  action: string;
  detail: unknown;
  adminName: string | null;
}

export interface PanelOrderDetails {
  order: OrderRow;
  provinceName: string;
  cityName: string | null;
  zoneName: string;
  /** نام روش ارسال در همان نسخهٔ تعرفهٔ سفارش. */
  shippingMethodName: string | null;
  items: PanelOrderItem[];
  /** همهٔ تلاش‌های پرداخت، تازه‌ترین اول. */
  payments: PaymentRow[];
  /** تغییرهای وضعیت، به ترتیب زمان. */
  statusEvents: PanelStatusEvent[];
  pdfJob: PanelPdfJob | null;
  /** رویدادهای ادمینِ همین سفارش، به ترتیب زمان. */
  events: PanelOrderEvent[];
}

/** PDF یک جزوه برای دانلود. */
export interface PanelPrintFile {
  orderId: string;
  orderNumber: number;
  status: OrderRow['status'];
  itemSeq: number;
  key: string | null;
  bytes: number | null;
  readyAt: Date | null;
}

export interface PanelOrderStore {
  dueSummary(bounds: { at: Date; tomorrowStart: Date; dayAfterStart: Date }): Promise<PanelDueSummary>;
  alerts(clock: PanelClock): Promise<PanelAlerts>;
  /** یک صفحه از یک سطل؛ «باز» به ترتیب مهلت، بقیه تازه‌ترین اول. */
  list(query: { bucket: PanelBucket; search: PanelSearch | null; clock: PanelClock; limit: number; offset: number }): Promise<
    PanelOrderLine[]
  >;
  /** شمارش هر سطل با همان جست‌وجو. */
  counts(query: { search: PanelSearch | null; clock: PanelClock }): Promise<Record<PanelBucket, number>>;
  details(orderNumber: number): Promise<PanelOrderDetails | null>;
  printFile(orderNumber: number, itemSeq: number): Promise<PanelPrintFile | null>;
  /**
   * «دوباره بساز»: کار شکست‌خوردهٔ `prepare_order` از نو در صف، با رویداد در همان تراکنش. شکست قبلی (تعداد
   * تلاش و کد خطا، بی متن خام) در جزئیات رویداد می‌ماند، چون ردیف کار پاک می‌شود. `not_failed`: کاری نبود یا
   * شکست‌خورده نبود (دو کلیک: دومی).
   */
  rebuildPdf(orderId: string, event: AdminEventInput): Promise<'ok' | 'not_failed'>;
  logEvent(event: AdminEventInput): Promise<void>;
  /** مقدار خام یک کلید `settings`؛ undefined یعنی تنظیم نشده. */
  setting(key: string): Promise<unknown>;
}

/**
 * کد خطای کار از `last_error` کارگر: شکست قطعی «کد: پیام» است (`file_missing: …`)، و هر چیز دیگر خطای گذرا
 * (`StorageError(…)`) که کارگر دوباره امتحانش کرده بود.
 */
export function pdfErrorCode(lastError: string | null): string | null {
  if (!lastError) return null;
  return /^([a-z_]+):/.exec(lastError)?.[1] ?? 'transient';
}

const ts = (value: Date) => sql`${value.toISOString()}::timestamptz`;

/** یکی از فایل‌های جزوه پاک شده، بی مهلت است، یا پیش از `staleBefore` پاک می‌شود. */
function staleFiles(staleBefore: Date): SQL {
  return sql`EXISTS (
    SELECT 1 FROM order_items i
      JOIN order_item_sections s ON s.order_item_id = i.id
      JOIN documents d ON d.id = s.document_id
     WHERE i.order_id = ${orders.id}
       AND (d.file_deleted_at IS NOT NULL OR d.file_expires_at IS NULL OR d.file_expires_at < ${ts(staleBefore)}))`;
}

function bucketWhere(bucket: PanelBucket, staleBefore: Date): SQL | undefined {
  switch (bucket) {
    case 'open':
      return sql`${orders.status} = 'paid'`;
    case 'awaiting':
      return sql`(${orders.status} = 'awaiting_payment' AND NOT ${staleFiles(staleBefore)})`;
    case 'abandoned':
      return sql`(${orders.status} = 'expired' OR (${orders.status} = 'awaiting_payment' AND ${staleFiles(staleBefore)}))`;
    case 'all':
      return undefined;
  }
}

/** `%` و `_` و `\` در الگوی LIKE حرف‌اند، نه نویسهٔ عام. */
const likeText = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function searchWhere(search: PanelSearch | null): SQL | undefined {
  if (!search) return undefined;
  switch (search.kind) {
    case 'mobile':
      return eq(orders.recipientPhone, search.mobile);
    case 'digits': {
      const parts = [
        search.orderNumber !== null ? eq(orders.orderNumber, search.orderNumber) : undefined,
        search.phoneSuffix ? sql`${orders.recipientPhone} LIKE ${`%${search.phoneSuffix}`}` : undefined,
      ].filter((part): part is SQL => part !== undefined);
      return parts.length > 0 ? or(...parts) : sql`false`;
    }
    case 'name':
      return sql`${orders.recipientName} ILIKE ${`%${likeText(search.text)}%`} ESCAPE '\\'`;
  }
}

export function createPanelOrderStore({ db }: Database): PanelOrderStore {
  function lineFields(clock: PanelClock) {
    return {
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalRials: orders.totalRials,
      recipientName: orders.recipientName,
      recipientPhone: orders.recipientPhone,
      provinceName: provinces.nameFa,
      cityName: cities.nameFa,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      postHandoffDueAt: orders.postHandoffDueAt,
      pageCount: sql<number>`(SELECT coalesce(sum(i.page_count), 0)::int FROM order_items i WHERE i.order_id = ${orders.id})`,
      itemCount: sql<number>`(SELECT count(*)::int FROM order_items i WHERE i.order_id = ${orders.id})`,
      fileCount: sql<number>`(SELECT count(*)::int FROM order_items i
        JOIN order_item_sections s ON s.order_item_id = i.id WHERE i.order_id = ${orders.id})`,
      copies: sql<number>`(SELECT coalesce(max(i.copies), 1)::int FROM order_items i WHERE i.order_id = ${orders.id})`,
      colorModes: sql<string[]>`(SELECT coalesce(array_agg(DISTINCT r.color_mode::text), '{}'::text[]) FROM order_items i
        JOIN print_rules r ON r.order_item_id = i.id WHERE i.order_id = ${orders.id})`,
      sidesModes: sql<string[]>`(SELECT coalesce(array_agg(DISTINCT i.sides_mode::text), '{}'::text[])
        FROM order_items i WHERE i.order_id = ${orders.id})`,
      pdfJob: jobs.status,
      unreturnedPayments: sql<number>`(SELECT count(*)::int FROM payments p WHERE p.order_id = ${orders.id}
        AND p.status = 'pending' AND p.created_at < ${ts(clock.unreturnedBefore)})`,
      stale: sql<boolean>`${staleFiles(clock.staleBefore)}`,
      filesExpireAt: sql<Date | null>`(SELECT min(d.file_expires_at) FROM order_items i
        JOIN order_item_sections s ON s.order_item_id = i.id
        JOIN documents d ON d.id = s.document_id WHERE i.order_id = ${orders.id})`.mapWith(documents.fileExpiresAt),
    };
  }

  const pdfJobJoin = and(eq(jobs.orderId, orders.id), eq(jobs.kind, PREPARE_ORDER_JOB));

  return {
    async dueSummary({ at, tomorrowStart, dayAfterStart }) {
      const due = orders.postHandoffDueAt;
      const overdue = sql`${due} <= ${ts(at)}`;
      const today = sql`${due} > ${ts(at)} AND ${due} <= ${ts(tomorrowStart)}`;
      const tomorrow = sql`${due} > ${ts(tomorrowStart)} AND ${due} <= ${ts(dayAfterStart)}`;
      const later = sql`${due} > ${ts(dayAfterStart)}`;
      const [row] = await db
        .select({
          overdue: sql<number>`count(*) FILTER (WHERE ${overdue})::int`,
          today: sql<number>`count(*) FILTER (WHERE ${today})::int`,
          tomorrow: sql<number>`count(*) FILTER (WHERE ${tomorrow})::int`,
          later: sql<number>`count(*) FILTER (WHERE ${later})::int`,
          overdueEarliest: sql<Date | null>`min(${due}) FILTER (WHERE ${overdue})`.mapWith(due),
          overdueLatest: sql<Date | null>`max(${due}) FILTER (WHERE ${overdue})`.mapWith(due),
          laterEarliest: sql<Date | null>`min(${due}) FILTER (WHERE ${later})`.mapWith(due),
          laterLatest: sql<Date | null>`max(${due}) FILTER (WHERE ${later})`.mapWith(due),
        })
        .from(orders)
        .where(eq(orders.status, 'paid'));
      const range = (earliest: Date | null, latest: Date | null) => (earliest && latest ? { earliest, latest } : null);
      return {
        overdue: row?.overdue ?? 0,
        today: row?.today ?? 0,
        tomorrow: row?.tomorrow ?? 0,
        later: row?.later ?? 0,
        overdueRange: range(row?.overdueEarliest ?? null, row?.overdueLatest ?? null),
        laterRange: range(row?.laterEarliest ?? null, row?.laterLatest ?? null),
      };
    },

    async alerts(clock) {
      const [failed, unreturned] = await Promise.all([
        db
          .select({ orderNumber: orders.orderNumber })
          .from(orders)
          .innerJoin(jobs, pdfJobJoin)
          .where(and(eq(orders.status, 'paid'), eq(jobs.status, 'failed')))
          .orderBy(asc(orders.postHandoffDueAt), asc(orders.orderNumber)),
        db
          .select({ orderNumber: orders.orderNumber, attempts: sql<number>`count(*)::int` })
          .from(payments)
          .innerJoin(orders, eq(orders.id, payments.orderId))
          .where(
            and(
              eq(payments.status, 'pending'),
              lt(payments.createdAt, clock.unreturnedBefore),
              eq(orders.status, 'awaiting_payment'),
              sql`NOT ${staleFiles(clock.staleBefore)}`,
            ),
          )
          .groupBy(orders.orderNumber)
          .orderBy(desc(orders.orderNumber)),
      ]);
      return { failedPdf: failed.map((row) => row.orderNumber), unreturned };
    },

    async list({ bucket, search, clock, limit, offset }) {
      const rows = await db
        .select(lineFields(clock))
        .from(orders)
        .innerJoin(provinces, eq(provinces.id, orders.provinceId))
        .leftJoin(cities, eq(cities.id, orders.cityId))
        .leftJoin(jobs, pdfJobJoin)
        .where(and(bucketWhere(bucket, clock.staleBefore), searchWhere(search)))
        .orderBy(
          ...(bucket === 'open'
            ? [asc(orders.postHandoffDueAt), asc(orders.paidAt), asc(orders.orderNumber)]
            : [desc(orders.orderNumber)]),
        )
        .limit(limit)
        .offset(offset);
      return rows.map((row) => ({ ...row, pdfJob: row.pdfJob ?? null }));
    },

    async counts({ search, clock }) {
      const stale = staleFiles(clock.staleBefore);
      const [row] = await db
        .select({
          open: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'paid')::int`,
          awaiting: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'awaiting_payment' AND NOT ${stale})::int`,
          abandoned: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'expired'
            OR (${orders.status} = 'awaiting_payment' AND ${stale}))::int`,
          all: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(searchWhere(search));
      return { open: row?.open ?? 0, awaiting: row?.awaiting ?? 0, abandoned: row?.abandoned ?? 0, all: row?.all ?? 0 };
    },

    async details(orderNumber) {
      const [head] = await db
        .select({
          order: orders,
          provinceName: provinces.nameFa,
          cityName: cities.nameFa,
          zoneName: shippingZones.nameFa,
          shippingMethodName: shippingMethods.nameFa,
        })
        .from(orders)
        .innerJoin(provinces, eq(provinces.id, orders.provinceId))
        .leftJoin(cities, eq(cities.id, orders.cityId))
        .innerJoin(shippingZones, eq(shippingZones.id, orders.shippingZoneId))
        .leftJoin(
          shippingMethods,
          and(eq(shippingMethods.priceListVersion, orders.priceListVersion), eq(shippingMethods.id, orders.shippingMethodId)),
        )
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);
      if (!head) return null;
      const { order } = head;

      const itemRows = await db
        .select({ item: orderItems, bindingName: bindingTypes.nameFa })
        .from(orderItems)
        .leftJoin(
          bindingTypes,
          and(eq(bindingTypes.priceListVersion, order.priceListVersion), eq(bindingTypes.id, orderItems.bindingTypeId)),
        )
        .where(eq(orderItems.orderId, order.id))
        .orderBy(orderItems.seq);
      const itemIds = itemRows.map((row) => row.item.id);

      const [sectionRows, ruleRows, paymentRows, statusRows, jobRows, eventRows] = await Promise.all([
        itemIds.length === 0
          ? []
          : db
              .select({
                orderItemId: orderItemSections.orderItemId,
                seq: orderItemSections.seq,
                documentId: orderItemSections.documentId,
                pageCount: orderItemSections.pageCount,
                originalName: documents.originalName,
                sourceKind: documents.sourceKind,
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
              .select({ rule: printRules, paperName: paperTypes.nameFa })
              .from(printRules)
              .leftJoin(
                paperTypes,
                and(eq(paperTypes.priceListVersion, order.priceListVersion), eq(paperTypes.id, printRules.paperTypeId)),
              )
              .where(inArray(printRules.orderItemId, itemIds))
              .orderBy(printRules.orderItemId, printRules.seq),
        db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
        db
          .select()
          .from(orderStatusEvents)
          .where(eq(orderStatusEvents.orderId, order.id))
          .orderBy(asc(orderStatusEvents.at), asc(orderStatusEvents.id)),
        db
          .select()
          .from(jobs)
          .where(and(eq(jobs.orderId, order.id), eq(jobs.kind, PREPARE_ORDER_JOB)))
          .limit(1),
        db
          .select({
            id: adminEvents.id,
            at: adminEvents.at,
            action: adminEvents.action,
            detail: adminEvents.detail,
            adminName: adminUsers.displayName,
          })
          .from(adminEvents)
          .leftJoin(adminUsers, eq(adminUsers.id, adminEvents.adminUserId))
          .where(and(eq(adminEvents.targetType, 'order'), eq(adminEvents.targetId, order.id)))
          .orderBy(asc(adminEvents.at), asc(adminEvents.id)),
      ]);

      const job = jobRows[0];
      return {
        order,
        provinceName: head.provinceName,
        cityName: head.cityName,
        zoneName: head.zoneName,
        shippingMethodName: head.shippingMethodName,
        items: itemRows.map(({ item, bindingName }) => ({
          ...item,
          bindingName,
          sections: sectionRows
            .filter((s) => s.orderItemId === item.id)
            .map(({ orderItemId: _item, ...section }) => section),
          rules: ruleRows
            .filter((r) => r.rule.orderItemId === item.id)
            .map(({ rule, paperName }) => ({
              seq: rule.seq,
              pageRanges: rule.pageRanges as [number, number][],
              colorMode: rule.colorMode,
              paperTypeId: rule.paperTypeId,
              paperName,
            })),
        })),
        payments: paymentRows,
        statusEvents: statusRows,
        pdfJob: job
          ? {
              status: job.status,
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
              lastError: job.lastError,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              finishedAt: job.finishedAt,
            }
          : null,
        events: eventRows,
      };
    },

    async printFile(orderNumber, itemSeq) {
      const [row] = await db
        .select({
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          itemSeq: orderItems.seq,
          key: orderItems.printPdfKey,
          bytes: orderItems.printPdfBytes,
          readyAt: orderItems.printPdfReadyAt,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orders.orderNumber, orderNumber), eq(orderItems.seq, itemSeq)))
        .limit(1);
      return row ?? null;
    },

    async rebuildPdf(orderId, event) {
      return db.transaction(async (tx) => {
        const [job] = await tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.orderId, orderId), eq(jobs.kind, PREPARE_ORDER_JOB)))
          .limit(1)
          .for('update');
        if (!job || job.status !== 'failed') return 'not_failed' as const;
        // `now()` پایگاه داده، مثل `queue_job` کارگر: کارگر کار را با ساعت پایگاه داده برمی‌دارد.
        await tx
          .update(jobs)
          .set({
            status: 'queued',
            attempts: 0,
            runAfter: sql`now()`,
            lockedBy: null,
            lockedUntil: null,
            lastError: null,
            finishedAt: null,
            updatedAt: sql`now()`,
          })
          .where(eq(jobs.id, job.id));
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...event,
            detail: {
              ...(event.detail as Record<string, unknown> | undefined),
              previous: { attempts: job.attempts, error: pdfErrorCode(job.lastError) },
            },
          }),
        );
        return 'ok' as const;
      });
    },

    async logEvent(event) {
      await db.insert(adminEvents).values(adminEventRow(event));
    },

    async setting(key) {
      const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },
  };
}
