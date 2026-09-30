/**
 * سابقهٔ پیامک (`sms_messages`، ADR-008 و ADR-033؛ رهگیری از ۶٫۳، ADR-047).
 *
 * پیامک کنسولی (توسعه و CI، تا برش ۷) فقط همین ردیف است، با متن کامل، تا کد پیامکی بی پنل پیامک هم آزمودنی باشد: تست سرتاسری
 * ۳ج کد را از همین جدول می‌خواند. پنل واقعی متن کد را نگه نمی‌دارد.
 *
 * پیامک رهگیری ردیف «منتظر» است که در همان تراکنش مرسوله نوشته می‌شود (`queuedTrackingSms`، در `shipments.ts`)، و بعد از commit
 * فرستاده (`createSmsOutbox` برای `deliverQueued` از `@jozveyar/sms`). «در حال فرستادن» یک `UPDATE` شرطی است، پس دو فرستنده (دو
 * کلیک، دو نود) یک ردیف را دو بار نمی‌فرستند؛ و فقط برای ردیفی که کد رهگیری زنده دارد (تریگر `sms_messages_guard`، 0026، هم).
 */

import { SMS_STUCK_MS, trackingParams, trackingText, type QueuedSms, type SmsLog, type SmsOutbox, type SmsPurpose } from '@jozveyar/sms';
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';

import type { Database } from './index.js';
import { smsMessages } from './schema.js';

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

/** درگاه `deliverQueued`: برداشتن («در حال فرستادن») و ثبت نتیجه. */
export function createSmsOutbox({ db }: Database, provider: string): SmsOutbox {
  const live = sql`EXISTS (SELECT 1 FROM shipments s WHERE s.sms_message_id = ${smsMessages.id} AND s.voided_at IS NULL)`;
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
        .where(and(eq(smsMessages.id, id), eq(smsMessages.purpose, 'tracking'), open, live))
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
            ? { status: result.status, provider: result.provider, providerMessageId: result.providerMessageId, sentAt: at, error: null }
            : { status: 'failed', provider: result.provider, error: result.error },
        )
        .where(and(eq(smsMessages.id, id), eq(smsMessages.status, 'sending')));
    },
  };
}

/** پیامک رهگیری یک مرسوله، برای پنل و صفحهٔ مشتری؛ حالش با `smsState` از `@jozveyar/sms`. */
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
