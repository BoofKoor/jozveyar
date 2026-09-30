/**
 * سابقهٔ پیامک (`sms_messages`، ADR-008 و ADR-033؛ رهگیری از ۶٫۳، ADR-047؛ sms.ir و پیامک پرداخت از صف از ۷٫۱، ADR-049).
 *
 * پیامک کنسولی (توسعه، CI و مسیر خرید `mock`) فقط همین ردیف است، با متن کامل، تا کد پیامکی بی پنل پیامک هم آزمودنی باشد: تست
 * سرتاسری ۳ج کد را از همین جدول می‌خواند. پنل واقعی متن و پارامتر کد را نگه نمی‌دارد.
 *
 * پیامک رهگیری و پرداخت ردیف «منتظر» است که در همان تراکنش مرسوله (`queuedTrackingSms`، در `shipments.ts`) یا پرداخت موفق
 * (`queuedPaidSms`، در `orders.ts`) نوشته می‌شود، و بعد از commit فرستاده (`createSmsOutbox` برای `deliverQueued` از `@jozveyar/sms`).
 * «در حال فرستادن» یک `UPDATE` شرطی است، پس دو فرستنده (دو کلیک، دو نود) یک ردیف را دو بار نمی‌فرستند؛ و فقط برای ردیفی که هنوز
 * رفتنی است: رهگیری با کد رهگیری زنده، پرداخت با سفارشی که در صف یا در حال چاپ است (تریگر `sms_messages_guard`، 0026 و 0028، هم).
 */

import {
  SMS_STUCK_MS,
  SMS_TEMPLATES,
  orderPaidParams,
  orderPaidText,
  trackingParams,
  trackingText,
  type QueuedSms,
  type SmsIrKeys,
  type SmsLog,
  type SmsOutbox,
  type SmsPurpose,
} from '@jozveyar/sms';
import { and, asc, eq, gt, gte, inArray, lt, or, sql } from 'drizzle-orm';

import type { Database } from './index.js';
import { otpRequests, smsMessages } from './schema.js';
import { readServiceKey, type SecretStore } from './secrets.js';

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
        cost: message.status === 'failed' ? null : (message.cost ?? null),
        error: message.error ?? null,
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
 * ردیف «منتظر» پیامک پرداخت یک سفارش (۷٫۱، ADR-049)، در همان تراکنش موفق شدن پرداخت؛ `payments.sms_message_id` همان را می‌گیرد
 * (تریگر `payments_sms`). روز همان مهلت تحویل به پستی است که در همین تراکنش روی سفارش می‌نشیند (`formatDeadlineDay`).
 */
export async function queuedPaidSms(tx: Writer, input: { toMobile: string; orderNumber: number; handoffDay: string; at: Date }): Promise<number> {
  const [row] = await tx
    .insert(smsMessages)
    .values({
      provider: 'queued',
      toMobile: input.toMobile,
      purpose: 'order_paid' satisfies SmsPurpose,
      body: orderPaidText(input.orderNumber, input.handoffDay),
      params: orderPaidParams(input.orderNumber, input.handoffDay),
      status: 'pending',
      createdAt: input.at,
    })
    .returning({ id: smsMessages.id });
  return row!.id;
}

/**
 * پیامکی که هنوز رفتنی است؛ همان شرط `sms_messages_live` تریگر (0028)، تا برداشتن به‌جای خطا null برگرداند: رهگیری با کد رهگیری
 * زنده، و پرداخت با پرداخت موفقی که به آن وصل است و سفارشی که «در صف چاپ» یا «در حال چاپ» است.
 */
const deliverable = sql`(
  (${smsMessages.purpose} = 'tracking'
    AND EXISTS (SELECT 1 FROM shipments s WHERE s.sms_message_id = ${smsMessages.id} AND s.voided_at IS NULL))
  OR (${smsMessages.purpose} = 'order_paid'
    AND EXISTS (SELECT 1 FROM payments p JOIN orders o ON o.id = p.order_id
                 WHERE p.sms_message_id = ${smsMessages.id} AND p.status = 'succeeded' AND o.status IN ('paid', 'printing'))))`;

/** درگاه `deliverQueued`: برداشتن («در حال فرستادن») و ثبت نتیجه؛ رهگیری و پرداخت. */
export function createSmsOutbox({ db }: Database, provider: string): SmsOutbox {
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
        .where(and(eq(smsMessages.id, id), inArray(smsMessages.purpose, ['tracking', 'order_paid']), open, deliverable))
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
                cost: result.cost ?? null,
                sentAt: at,
                error: null,
              }
            : { status: 'failed', provider: result.provider, error: result.error },
        )
        .where(and(eq(smsMessages.id, id), eq(smsMessages.status, 'sending')));
    },
  };
}

/**
 * کلید API و شناسهٔ قالب هر هدف برای آداپتور sms.ir، با هر پیامک از پایگاه داده و `.env` (پنل مقدم، ADR-041)؛ «خوانده نشد» و خالی null،
 * پس آداپتور `unconfigured` می‌دهد و هرگز به کنسولی برنمی‌گردد (ADR-049). وب و پنل هر دو همین را می‌سازند.
 */
export function smsIrKeysOf(
  store: Pick<SecretStore, 'read'>,
  env: Readonly<Record<string, string | undefined>>,
  secretsKey: Buffer | null,
  log?: (message: string) => void,
): (purpose: SmsPurpose) => Promise<SmsIrKeys> {
  return async (purpose) => {
    const [apiKey, templateId] = await Promise.all([
      readServiceKey(store, 'SMS_API_KEY', env, secretsKey, log),
      readServiceKey(store, SMS_TEMPLATES[purpose].key, env, secretsKey, log),
    ]);
    return { apiKey: apiKey.value, templateId: templateId.value };
  };
}

/** پیامک رهگیری یک مرسوله، یا پیامک پرداخت، برای پنل و صفحهٔ مشتری؛ حالش با `smsState` از `@jozveyar/sms`. */
export interface ShipmentSms {
  id: number;
  toMobile: string;
  status: string;
  /** علت «نرفت» (`unavailable`، `rejected`، `interrupted`). */
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

/* ───────────────────────── آمار: سقف کد و مصرف پیامک (۷٫۱، ADR-049) ───────────────────────── */

export interface SmsStatsStore {
  /** کدهای پیامکی این ساعت (پنجرهٔ ۶۰ دقیقه تا `at`) و امروز تهران (از `dayStart`)؛ کارت «سقف کد پیامکی». */
  otpUsage(at: Date, dayStart: Date): Promise<{ hour: number; today: number }>;
  /**
   * کی سقف کل سایت امروز پر شد، اگر شد (هشدار پیشخوان): روزانه لحظهٔ Nاُمین کد امروز؛ ساعتی نخستین لحظهٔ امروز که کدهای ۶۰ دقیقهٔ
   * پیش از آن به سقف رسید. سقف‌ها همان امروزِ `settings`.
   */
  otpCapHits(dayStart: Date, limits: { hourly: number; daily: number }): Promise<{ hourly: Date | null; daily: Date | null }>;
  /** پیامک‌هایی که پنل واقعی از `since` فرستاد، و جمع هزینه‌ای که گفت (کارت «اعتبار پیامک»). */
  usage(since: Date, provider: string): Promise<{ messages: number; cost: number }>;
}

export function createSmsStatsStore({ db }: Database): SmsStatsStore {
  return {
    async otpUsage(at, dayStart) {
      const hourAgo = new Date(at.getTime() - 60 * 60_000);
      const [row] = await db
        .select({
          hour: sql<number>`count(*) FILTER (WHERE ${gt(otpRequests.createdAt, hourAgo)})::int`,
          today: sql<number>`count(*) FILTER (WHERE ${gte(otpRequests.createdAt, dayStart)})::int`,
        })
        .from(otpRequests)
        .where(gte(otpRequests.createdAt, new Date(Math.min(hourAgo.getTime(), dayStart.getTime()))));
      return { hour: row?.hour ?? 0, today: row?.today ?? 0 };
    },

    async otpCapHits(dayStart, limits) {
      const from = dayStart.toISOString();
      const [daily] = await db
        .select({ at: otpRequests.createdAt })
        .from(otpRequests)
        .where(gte(otpRequests.createdAt, dayStart))
        .orderBy(asc(otpRequests.createdAt))
        .offset(Math.max(0, limits.daily - 1))
        .limit(1);
      // پنجره‌های ۶۰ دقیقه‌ای که امروز تمام می‌شوند، پس از یک ساعت پیش از نیمه‌شب.
      const hourly = await db.execute<{ at: string | Date | null }>(sql`
        SELECT min(created_at) AS at FROM (
          SELECT created_at, count(*) OVER (ORDER BY created_at RANGE BETWEEN interval '1 hour' PRECEDING AND CURRENT ROW) AS n
            FROM otp_requests WHERE created_at >= ${from}::timestamptz - interval '1 hour'
        ) w WHERE n >= ${limits.hourly} AND created_at >= ${from}::timestamptz`);
      const first = [...hourly][0]?.at ?? null;
      return { hourly: first === null ? null : new Date(first), daily: daily?.at ?? null };
    },

    async usage(since, provider) {
      const [row] = await db
        .select({ messages: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${smsMessages.cost}), 0)::float8` })
        .from(smsMessages)
        .where(and(eq(smsMessages.provider, provider), eq(smsMessages.status, 'sent'), gt(smsMessages.sentAt, since)));
      return { messages: row?.messages ?? 0, cost: Number(row?.cost ?? 0) };
    },
  };
}
