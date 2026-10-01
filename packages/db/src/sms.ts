/**
 * سابقهٔ پیامک (`sms_messages`، ADR-008 و ADR-033؛ رهگیری از ۶٫۳، ADR-047؛ sms.ir و پیامک پرداخت از صف از ۷٫۱، ADR-049).
 *
 * پیامک کنسولی (توسعه و CI) فقط همین ردیف است، با متن کامل، تا کد پیامکی بی پنل پیامک هم آزمودنی باشد: تست سرتاسری ۳ج کد را از
 * همین جدول می‌خواند. پنل واقعی متن و پارامتر کد را نگه نمی‌دارد (CHECK `sms_messages_otp_secret`).
 *
 * پیامک پرداخت و رهگیری ردیف «منتظر» است که در همان تراکنش پرداخت موفق (`queuedPaidSms`، در `orders.ts`) یا مرسوله
 * (`queuedTrackingSms`، در `shipments.ts`) نوشته می‌شود، و بعد از commit فرستاده (`createSmsOutbox` برای `deliverQueued` از
 * `@jozveyar/sms`). «در حال فرستادن» یک `UPDATE` شرطی است، پس دو فرستنده (دو کلیک، دو نود) یک ردیف را دو بار نمی‌فرستند؛ و فقط برای
 * ردیفی که هنوز زنده است: کد رهگیری کنار نرفته، و پیامک پرداخت به پرداخت موفق سفارشی لغونشده وصل (تریگر `sms_messages_guard`، 0028، هم).
 */

import {
  SMS_STUCK_MS,
  orderPaidText,
  paidParams,
  trackingParams,
  trackingText,
  type QueuedSms,
  type SmsLog,
  type SmsOutbox,
  type SmsPurpose,
} from '@jozveyar/sms';
import { and, eq, gt, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';

import type { Database } from './index.js';
import { otpRequests, smsMessages } from './schema.js';

export type { SmsLog, SmsPurpose, SmsRecord } from '@jozveyar/sms';

export function createSmsLog({ db }: Database): SmsLog {
  return {
    async insert(message) {
      await db.insert(smsMessages).values({
        provider: message.provider,
        toMobile: message.toMobile,
        purpose: message.purpose,
        body: message.body,
        status: message.status,
        providerMessageId: message.providerMessageId ?? null,
        error: message.error ?? null,
        cost: message.cost == null ? null : String(message.cost),
        sentAt: message.status === 'failed' ? null : sql`now()`,
      });
    },
  };
}

type Db = Database['db'];
type Writer = Pick<Db, 'insert'>;

/**
 * ردیف «منتظر» پیامک رهگیری یک مرسوله، در همان تراکنش. فرستنده‌اش هنوز معلوم نیست (بعد از commit، `deliverQueued`)؛ `provider`
 * تا آن موقع `queued` است و با برداشتن نام آداپتور می‌شود.
 */
export async function queuedTrackingSms(tx: Writer, input: { toMobile: string; orderNumber: number; barcode: string; at: Date }): Promise<number> {
  const [row] = await tx
    .insert(smsMessages)
    .values({
      provider: 'queued',
      toMobile: input.toMobile,
      purpose: 'tracking' satisfies SmsPurpose,
      body: trackingText(input.orderNumber, input.barcode),
      params: trackingParams(input.orderNumber, input.barcode),
      status: 'pending',
      createdAt: input.at,
    })
    .returning({ id: smsMessages.id });
  return row!.id;
}

/**
 * ردیف «منتظر» پیامک پرداخت (برش ۷٫۱، ADR-049)، در همان تراکنش پرداخت موفق؛ پرداخت با `sms_message_id` به آن وصل می‌شود (تریگر
 * `payments_sms`). روز تحویل همان `formatDeadlineDay` مهلت.
 */
export async function queuedPaidSms(tx: Writer, input: { toMobile: string; orderNumber: number; handoffDay: string; at: Date }): Promise<number> {
  const [row] = await tx
    .insert(smsMessages)
    .values({
      provider: 'queued',
      toMobile: input.toMobile,
      purpose: 'order_paid' satisfies SmsPurpose,
      body: orderPaidText(input.orderNumber, input.handoffDay),
      params: paidParams(input.orderNumber, input.handoffDay),
      status: 'pending',
      createdAt: input.at,
    })
    .returning({ id: smsMessages.id });
  return row!.id;
}

/**
 * درگاه `deliverQueued`: برداشتن («در حال فرستادن») و ثبت نتیجه، برای پیامک پرداخت و رهگیری. زنده: رهگیری با کد زنده، پرداخت با
 * پرداخت موفق سفارشی لغونشده؛ همان شرط تریگر.
 */
export function createSmsOutbox({ db }: Database, provider: string): SmsOutbox {
  const live = sql`(
    (${smsMessages.purpose} = 'tracking'
      AND EXISTS (SELECT 1 FROM shipments s WHERE s.sms_message_id = ${smsMessages.id} AND s.voided_at IS NULL))
    OR (${smsMessages.purpose} = 'order_paid'
      AND EXISTS (SELECT 1 FROM payments p JOIN orders o ON o.id = p.order_id
                   WHERE p.sms_message_id = ${smsMessages.id} AND p.status = 'succeeded' AND o.status <> 'cancelled')))`;
  return {
    async claim(id, at, mode) {
      const stuck = new Date(at.getTime() - SMS_STUCK_MS);
      // `queued`: فقط منتظر. `retry` («دوباره بفرست»): نرفته، منتظری که ماند (فرستنده پیش از برداشتن افتاد)، و در حال فرستادنی که
      // ماند (معلوم نیست رفت؛ پنل پیش از کار هشدار می‌دهد). همان `smsState` پنل.
      const open =
        mode === 'queued'
          ? eq(smsMessages.status, 'pending')
          : or(
              eq(smsMessages.status, 'failed'),
              and(eq(smsMessages.status, 'pending'), lt(smsMessages.createdAt, stuck)),
              and(eq(smsMessages.status, 'sending'), lt(smsMessages.attemptedAt, stuck)),
            );
      const [row] = await db
        .update(smsMessages)
        .set({ status: 'sending', provider, attempts: sql`${smsMessages.attempts} + 1`, attemptedAt: at, error: null })
        .where(and(eq(smsMessages.id, id), inArray(smsMessages.purpose, ['tracking', 'order_paid']), open, live))
        .returning();
      if (!row) return null;
      const queued: QueuedSms = {
        id: row.id,
        to: row.toMobile,
        purpose: row.purpose as SmsPurpose,
        body: row.body ?? '',
        params: Array.isArray(row.params) ? (row.params as string[]) : null,
      };
      return queued;
    },
    async finish(id, at, result) {
      await db
        .update(smsMessages)
        .set(
          result.ok
            ? {
                status: result.status,
                provider: result.provider,
                providerMessageId: result.providerMessageId,
                sentAt: at,
                error: null,
                cost: result.cost == null ? null : String(result.cost),
              }
            : { status: 'failed', provider: result.provider, error: result.tag },
        )
        .where(and(eq(smsMessages.id, id), eq(smsMessages.status, 'sending')));
    },
  };
}

/** پیامک رهگیری یک مرسوله یا پرداخت یک سفارش، برای پنل و صفحهٔ مشتری؛ حالش با `smsState` از `@jozveyar/sms`. */
export interface ShipmentSms {
  id: number;
  toMobile: string;
  status: string;
  /** علت «نرفت» (`smsErrorTag`: `unavailable`، `rejected:401`، `interrupted`، `unconfigured`…). */
  error: string | null;
  attempts: number;
  createdAt: Date;
  attemptedAt: Date | null;
  sentAt: Date | null;
}

/** ستون‌های `ShipmentSms` برای `LEFT JOIN sms_messages`؛ مرسولهٔ پیش از ۶٫۳ پیامک ندارد (null). */
export const shipmentSmsFields = {
  smsId: smsMessages.id,
  smsToMobile: smsMessages.toMobile,
  smsStatus: smsMessages.status,
  smsError: smsMessages.error,
  smsAttempts: smsMessages.attempts,
  smsCreatedAt: smsMessages.createdAt,
  smsAttemptedAt: smsMessages.attemptedAt,
  smsSentAt: smsMessages.sentAt,
};

export function shipmentSmsOf(row: {
  smsId: number | null;
  smsToMobile: string | null;
  smsStatus: string | null;
  smsError: string | null;
  smsAttempts: number | null;
  smsCreatedAt: Date | null;
  smsAttemptedAt: Date | null;
  smsSentAt: Date | null;
}): ShipmentSms | null {
  if (row.smsId === null) return null;
  return {
    id: row.smsId,
    toMobile: row.smsToMobile ?? '',
    status: row.smsStatus ?? '',
    error: row.smsError,
    attempts: row.smsAttempts ?? 0,
    createdAt: row.smsCreatedAt!,
    attemptedAt: row.smsAttemptedAt,
    sentAt: row.smsSentAt,
  };
}

/** ردیف‌های پیامک، برای نمای پنل و صفحهٔ مشتری. */
export async function smsRows(db: Pick<Db, 'select'>, ids: readonly number[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: smsMessages.id,
      toMobile: smsMessages.toMobile,
      status: smsMessages.status,
      error: smsMessages.error,
      attempts: smsMessages.attempts,
      createdAt: smsMessages.createdAt,
      attemptedAt: smsMessages.attemptedAt,
      sentAt: smsMessages.sentAt,
    })
    .from(smsMessages)
    .where(inArray(smsMessages.id, [...ids]));
}

/* ───────────────────────── آمار پیامک و کد برای پنل (برش ۷٫۱، ADR-049) ───────────────────────── */

export interface SmsStats {
  /** شمار کد در ساعت و ۲۴ ساعت گذشته، کل سایت؛ کارت «سقف کد پیامکی». */
  otpUsage(at: Date): Promise<{ hour: number; day: number; hourOldest: Date | null; dayOldest: Date | null }>;
  /**
   * نخستین لحظهٔ امروز (از `since`) که سقف ساعتی یا ۲۴ ساعتهٔ کل سایت پر شد: شمار همان پنجره تا همان کد به سقف رسید. null یعنی امروز
   * پر نشد. سقف امروز همان که حالا در «تنظیمات» است.
   */
  otpCapReached(input: { since: Date; hourLimit: number; dayLimit: number }): Promise<{ hourAt: Date | null; dayAt: Date | null }>;
  /** هزینه و شمار پیامک‌هایی که پنل واقعی از `since` پذیرفت؛ «برای حدود N روز» کارت «اعتبار پیامک». */
  smsCost(since: Date): Promise<{ cost: number; count: number }>;
}

const asDate = (value: unknown): Date | null => (value === null || value === undefined ? null : value instanceof Date ? value : new Date(String(value)));

export function createSmsStats({ db }: Database): SmsStats {
  return {
    async otpUsage(at) {
      const hour = gt(otpRequests.createdAt, new Date(at.getTime() - 3_600_000));
      const [row] = await db
        .select({
          hour: sql<number>`count(*) FILTER (WHERE ${hour})::int`,
          day: sql<number>`count(*)::int`,
          hourOldest: sql<Date | null>`min(${otpRequests.createdAt}) FILTER (WHERE ${hour})`,
          dayOldest: sql<Date | null>`min(${otpRequests.createdAt})`,
        })
        .from(otpRequests)
        .where(gt(otpRequests.createdAt, new Date(at.getTime() - 86_400_000)));
      return { hour: row?.hour ?? 0, day: row?.day ?? 0, hourOldest: asDate(row?.hourOldest), dayOldest: asDate(row?.dayOldest) };
    },

    async otpCapReached({ since, hourLimit, dayLimit }) {
      // شمار هر پنجره تا همان کد (کد خودش هم)، با پنجرهٔ لغزان پستگرس؛ فقط کدهای ۲۴ ساعت پیش از آغاز امروز به بعد لازم‌اند.
      const rows = await db.execute<{ hour_at: string | null; day_at: string | null }>(sql`
        WITH counted AS (
          SELECT created_at,
                 count(*) OVER (ORDER BY created_at RANGE BETWEEN interval '1 hour' PRECEDING AND CURRENT ROW) AS hour_n,
                 count(*) OVER (ORDER BY created_at RANGE BETWEEN interval '24 hours' PRECEDING AND CURRENT ROW) AS day_n
            FROM otp_requests
           WHERE created_at > ${since.toISOString()}::timestamptz - interval '24 hours'
        )
        SELECT min(created_at) FILTER (WHERE hour_n >= ${hourLimit} AND created_at >= ${since.toISOString()}::timestamptz) AS hour_at,
               min(created_at) FILTER (WHERE day_n >= ${dayLimit} AND created_at >= ${since.toISOString()}::timestamptz) AS day_at
          FROM counted`);
      const row = rows[0];
      return { hourAt: asDate(row?.hour_at), dayAt: asDate(row?.day_at) };
    },

    async smsCost(since) {
      const [row] = await db
        .select({
          cost: sql<string | null>`sum(${smsMessages.cost})`,
          count: sql<number>`count(*)::int`,
        })
        .from(smsMessages)
        .where(and(eq(smsMessages.status, 'sent'), isNotNull(smsMessages.cost), gt(smsMessages.sentAt, since)));
      return { cost: Number(row?.cost ?? 0), count: row?.count ?? 0 };
    },
  };
}
