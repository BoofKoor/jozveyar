/**
 * بازپرداخت سفارش لغوشده (برش ۷٫۳، ADR-051): ساختن ردیف زیر قفل، پاسخ درخواست درگاه، و استعلام «در حال برگشت».
 *
 * - **ردیف پیش از درخواست** (سؤال ۱۵۴): `start` ردیف «در حال برگشت» را با رویداد ادمین در یک تراکنش می‌نویسد و commit می‌کند؛ بعد
 *   `requestRefund` درخواست را با شناسهٔ همان ردیف به درگاه می‌فرستد. پاسخی که نیامد ردیف را «در حال برگشت» با برچسب خطا می‌گذارد، و
 *   استعلام با همان شناسه روشنش می‌کند؛ پس پاسخ گم‌شده هرگز بازپرداخت دوم نمی‌شود. دستی همان لحظه «برگشت داده شد» است.
 * - **«همان که دیده شد»:** زیر قفل سطر سفارش: هنوز «لغو شد»، پرداخت موفقش همان، و آخرین بازپرداخت همان پرداخت همان که فرم دید؛ دو کلیک
 *   هم‌زمان یک ردیف. پایگاه داده همین‌ها را هم می‌سنجد (0032).
 * - **استعلام** (`inquireRefund`): خودکار در پنل و «استعلام از درگاه»، هر دو زیر قفل ردیف (`SKIP LOCKED` برای خودکار)، و فقط ردیفی که
 *   درخواستش دیگر در راه نیست (`REFUND_REQUEST_GRACE_MS`).
 */

import { randomUUID } from 'node:crypto';

import { paymentErrorCode, paymentErrorTag, type GatewayRefund, type PaymentGateway, type RefundRejection } from '@jozveyar/payments';
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import type { PaymentRow } from './orders.js';
import { adminEvents, orders, payments, refunds } from './schema.js';
import { ordersInScope as inScope, type PanelScope } from './panel.js';

export type RefundRow = typeof refunds.$inferSelect;
export type RefundMethod = 'gateway' | 'manual';
/** چه چیزی راه درگاه را بست. */
export type RefundVia = 'request' | 'auto' | 'panel';

/** بازپرداخت در جزئیات سفارش پنل، با نام ادمینی که زد. */
export type PanelRefund = RefundRow & { adminName: string | null };

/** زنده: در جریان یا برگشت‌داده‌شده؛ سفارشش از «لغو شد» برنمی‌گردد و بازپرداخت تازه نمی‌گیرد. */
export const isLiveRefund = (refund: Pick<RefundRow, 'status'>) => refund.status === 'pending' || refund.status === 'succeeded';

/**
 * درخواستی که شاید هنوز در راه است: تا این مدت پس از ساختن ردیف، استعلام آن را نمی‌پرسد (درخواست درگاه سقف ۱۰ ثانیه دارد). پس از آن، ردیفی
 * که نه شناسهٔ درگاه دارد نه خطا (پروسه وسط درخواست افتاد) با همان شناسهٔ ما استعلام می‌شود.
 */
export const REFUND_REQUEST_GRACE_MS = 60_000;
/** استعلام خودکار: نخستین بار این مدت پس از درخواست (زیبال ۵ تا ۳۰ دقیقه)، و هر بار همین فاصله (سؤال ۱۵۳). */
export const REFUND_AUTO_EVERY_MS = 2 * 60_000;
/** استعلام خودکار تا این مدت پس از درخواست؛ بعد فقط «استعلام از درگاه» و هشدار پیشخوان. */
export const REFUND_AUTO_WINDOW_MS = 24 * 3_600_000;

/** استعلام‌پذیر: در جریان، و درخواستش دیگر در راه نیست. */
export function refundInquirable(refund: Pick<RefundRow, 'status' | 'method' | 'gatewayRef' | 'gatewayError' | 'gatewayCheckedAt' | 'createdAt'>, at: Date) {
  return (
    refund.status === 'pending' &&
    refund.method === 'gateway' &&
    (refund.gatewayRef !== null ||
      refund.gatewayError !== null ||
      refund.gatewayCheckedAt !== null ||
      refund.createdAt.getTime() <= at.getTime() - REFUND_REQUEST_GRACE_MS)
  );
}

/**
 * «معلوم نیست»: درخواست رفت و درگاه جواب روشن نداد، و هنوز نه شناسه‌ای از درگاه داریم نه وضعیتی؛ تا استعلام روشنش نکرده، «دوباره» نیست و
 * مشتری «در حال برگشت» نمی‌بیند (سؤال ۱۵۷: چیزی که نمی‌دانیم گفته نشود).
 */
export const refundUnknown = (refund: Pick<RefundRow, 'status' | 'gatewayRef' | 'gatewayStatus'>) =>
  refund.status === 'pending' && refund.gatewayRef === null && refund.gatewayStatus === null;

export interface RefundStart {
  orderId: string;
  paymentId: string;
  /** آخرین بازپرداخت همین پرداخت که ادمین دید؛ null یعنی هیچ. */
  seen: string | null;
  method: RefundMethod;
  amountRials: number;
  feeRials: number | null;
  reference: string | null;
  refundedOn: Date | null;
  note: string | null;
  adminUserId: string;
  at: Date;
  /** رویداد `orders.refund`؛ شناسهٔ بازپرداخت به `detail` افزوده می‌شود. */
  event: AdminEventInput;
}

/**
 * نتیجهٔ ساختن: ردیف؛ یا سفارش در محدوده نیست (`not_found`)، دیگر «لغو شد» نیست (`not_cancelled`)، پرداخت موفقش دیگر همان نیست
 * (`payment_changed`)، یا بازپرداخت دیگری همین حالا ساخته شد (`changed`، با آخرینش).
 */
export type RefundStartResult =
  | { ok: true; refund: RefundRow }
  | { ok: false; reason: 'not_found' | 'not_cancelled' | 'payment_changed' }
  | { ok: false; reason: 'changed'; latest: RefundRow | null };

/** آنچه درگاه گفت، برای نوشتن روی ردیف «در حال برگشت». */
export type RefundUpdate =
  | { kind: 'answer'; answer: GatewayRefund | null }
  | { kind: 'error'; tag: string }
  /** درخواست نرفت (`unconfigured`): پولی جابه‌جا نشد. */
  | { kind: 'not_sent' };

export interface RefundStore {
  start(scope: PanelScope, input: RefundStart): Promise<RefundStartResult>;
  /** پاسخ درخواست، فقط روی ردیفی که هنوز «در حال برگشت» است و کسی همین حالا آن را نمی‌پرسد. */
  record(refundId: string, update: RefundUpdate, at: Date, via: RefundVia): Promise<RefundRow | null>;
  /**
   * استعلام زیر قفل ردیف: `ask` درگاه را می‌پرسد و نتیجه در همان تراکنش نوشته می‌شود. `busy` اگر استعلام دیگری همین حالا روی آن است
   * (`skipLocked`)؛ `not_inquirable` اگر بسته است یا درخواستش هنوز در راه.
   */
  inquire(
    refundId: string,
    ask: (refund: RefundRow, payment: PaymentRow) => Promise<RefundUpdate>,
    options: { at: () => Date; via: RefundVia; skipLocked?: boolean },
  ): Promise<{ refund: RefundRow; before: RefundRow; orderNumber: number } | 'busy' | 'not_inquirable' | null>;
  /**
   * بازپرداخت‌های در جریان برای استعلام خودکار: ساخته در پنجره، فقط درگاه‌هایی که همین پنل بازپرداختشان را دارد (`providers`)، قدیمی‌ترین
   * پرسش اول.
   */
  autoInquiry(at: Date, limit: number, providers: readonly string[]): Promise<string[]>;
  /** یک بازپرداخت و سفارشش، در محدوده (برای «استعلام از درگاه»). */
  refundOf(scope: PanelScope, refundId: string): Promise<{ refund: RefundRow; orderId: string; orderNumber: number } | null>;
}

type PgError = { code?: string; constraint_name?: string; cause?: PgError };
const constraintOf = (error: unknown): string | undefined => {
  const pg = error as PgError;
  return pg?.cause?.constraint_name ?? pg?.constraint_name;
};

/** ستون‌هایی که پاسخ درگاه روی ردیف «در حال برگشت» می‌نشاند. */
export function refundChanges(refund: RefundRow, update: RefundUpdate, at: Date, via: RefundVia): Partial<RefundRow> {
  if (update.kind === 'error') return { gatewayError: update.tag, gatewayCheckedAt: at };
  if (update.kind === 'not_sent') {
    return { status: 'failed', failureReason: 'unconfigured', gatewayError: 'unconfigured', gatewayCheckedAt: at, finishedAt: at, settledVia: via };
  }
  const { answer } = update;
  // درگاه چنین بازپرداختی ندارد: درخواستش هرگز نرسید، پس پولی جابه‌جا نشد.
  if (answer === null) {
    return { status: 'failed', failureReason: 'not_found', gatewayError: null, gatewayCheckedAt: at, finishedAt: at, settledVia: via };
  }
  const common = {
    gatewayRef: refund.gatewayRef ?? answer.gatewayRef,
    gatewayStatus: answer.status,
    gatewayError: null,
    gatewayCheckedAt: at,
    raw: answer.raw ?? null,
  };
  if (answer.state === 'pending') return common;
  if (answer.state === 'succeeded') {
    return { ...common, status: 'succeeded', reference: answer.reference, finishedAt: at, settledVia: via };
  }
  const reason: RefundRejection = answer.reason ?? 'other';
  return {
    ...common,
    status: 'failed',
    failureReason: reason,
    gatewayError: reason === 'other' && answer.result !== null ? `rejected:${answer.result}` : null,
    finishedAt: at,
    settledVia: via,
  };
}

export function createRefundStore({ db }: Database): RefundStore {
  return {
    async start(scope, input) {
      try {
        return await db.transaction(async (tx): Promise<RefundStartResult> => {
          const [order] = await tx
            .select({ id: orders.id, status: orders.status })
            .from(orders)
            .where(and(eq(orders.id, input.orderId), inScope(scope)))
            .limit(1)
            .for('update');
          if (!order) return { ok: false, reason: 'not_found' };
          if (order.status !== 'cancelled') return { ok: false, reason: 'not_cancelled' };
          const [paid] = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(and(eq(payments.orderId, order.id), eq(payments.status, 'succeeded')))
            .limit(1);
          if (!paid || paid.id !== input.paymentId) return { ok: false, reason: 'payment_changed' };
          const [latest] = await tx
            .select()
            .from(refunds)
            .where(eq(refunds.paymentId, paid.id))
            .orderBy(desc(refunds.createdAt), desc(refunds.id))
            .limit(1);
          if ((latest?.id ?? null) !== input.seen || (latest && isLiveRefund(latest))) {
            return { ok: false, reason: 'changed', latest: latest ?? null };
          }
          const id = randomUUID();
          const manual = input.method === 'manual';
          const [row] = await tx
            .insert(refunds)
            .values({
              id,
              orderId: order.id,
              paymentId: paid.id,
              amountRials: input.amountRials,
              feeRials: input.feeRials,
              method: input.method,
              status: manual ? 'succeeded' : 'pending',
              reference: manual ? input.reference : null,
              refundedOn: manual ? input.refundedOn : null,
              note: manual ? input.note : null,
              adminUserId: input.adminUserId,
              createdAt: input.at,
              finishedAt: manual ? input.at : null,
            })
            .returning();
          const detail = input.event.detail !== null && typeof input.event.detail === 'object' ? input.event.detail : {};
          await tx.insert(adminEvents).values(adminEventRow({ ...input.event, detail: { ...detail, refundId: id } }));
          return { ok: true, refund: row! };
        });
      } catch (error) {
        const constraint = constraintOf(error);
        // هم‌زمان، پیش از قفل ما: پایگاه داده همان را گفت که سنجش زیر قفل می‌گفت.
        if (constraint === 'refunds_one_pending' || constraint === 'refunds_within_payment') {
          const [latest] = await db.select().from(refunds).where(eq(refunds.paymentId, input.paymentId)).orderBy(desc(refunds.createdAt)).limit(1);
          return { ok: false, reason: 'changed', latest: latest ?? null };
        }
        if (constraint === 'refunds_cancelled_only') return { ok: false, reason: 'not_cancelled' };
        if (constraint === 'refunds_paid_only') return { ok: false, reason: 'payment_changed' };
        throw error;
      }
    },

    async record(refundId, update, at, via) {
      return db.transaction(async (tx) => {
        const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1).for('update');
        if (!refund || refund.status !== 'pending') return refund ?? null;
        const [row] = await tx.update(refunds).set(refundChanges(refund, update, at, via)).where(eq(refunds.id, refundId)).returning();
        return row!;
      });
    },

    async inquire(refundId, ask, options) {
      return db.transaction(async (tx) => {
        const query = tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
        const [refund] = await (options.skipLocked ? query.for('update', { skipLocked: true }) : query.for('update'));
        if (!refund) {
          if (!options.skipLocked) return null;
          const [exists] = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.id, refundId)).limit(1);
          return exists ? ('busy' as const) : null;
        }
        if (!refundInquirable(refund, options.at())) return 'not_inquirable' as const;
        const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
        const [order] = await tx.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, refund.orderId)).limit(1);
        const update = await ask(refund, payment!);
        const [row] = await tx
          .update(refunds)
          .set(refundChanges(refund, update, options.at(), options.via))
          .where(eq(refunds.id, refund.id))
          .returning();
        return { refund: row!, before: refund, orderNumber: order!.orderNumber };
      });
    },

    async autoInquiry(at, limit, providers) {
      if (providers.length === 0) return [];
      const rows = await db
        .select({ id: refunds.id })
        .from(refunds)
        .innerJoin(payments, eq(payments.id, refunds.paymentId))
        .where(
          and(
            inArray(payments.provider, [...providers]),
            eq(refunds.status, 'pending'),
            eq(refunds.method, 'gateway'),
            gt(refunds.createdAt, new Date(at.getTime() - REFUND_AUTO_WINDOW_MS)),
            lt(refunds.createdAt, new Date(at.getTime() - REFUND_AUTO_EVERY_MS)),
            sql`(${refunds.gatewayCheckedAt} IS NULL OR ${refunds.gatewayCheckedAt} < ${new Date(at.getTime() - REFUND_AUTO_EVERY_MS).toISOString()}::timestamptz)`,
          ),
        )
        .orderBy(sql`coalesce(${refunds.gatewayCheckedAt}, ${refunds.createdAt})`, asc(refunds.id))
        .limit(limit);
      return rows.map((row) => row.id);
    },

    async refundOf(scope, refundId) {
      const [row] = await db
        .select({ refund: refunds, orderId: orders.id, orderNumber: orders.orderNumber })
        .from(refunds)
        .innerJoin(orders, eq(orders.id, refunds.orderId))
        .where(and(eq(refunds.id, refundId), inScope(scope)))
        .limit(1);
      return row ?? null;
    },
  };
}

/** آنچه پنل از درگاه برای یک بازپرداخت می‌خواهد. */
export interface RefundDeps {
  store: RefundStore;
  gateways: Readonly<Record<string, PaymentGateway>>;
  now: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** شکل پرداخت برای درگاه. */
const refundPayment = (payment: PaymentRow) => ({
  authority: payment.authority,
  amountRials: payment.amountRials,
  orderId: payment.gatewayOrderId,
  refId: payment.refId,
  raw: payment.raw,
});

/**
 * درخواست بازپرداخت ردیفی که `start` همین حالا ساخت، و نوشتن پاسخ. بی جواب روشن ردیف «در حال برگشت» با برچسب خطا می‌ماند؛ `unconfigured`
 * یعنی درخواست نرفت و ردیف «برنگشت» می‌شود.
 */
export async function requestRefund(
  deps: RefundDeps,
  input: { refund: RefundRow; payment: PaymentRow; description: string },
): Promise<RefundRow> {
  const gateway = deps.gateways[input.payment.provider]?.refunds;
  const update: RefundUpdate = await (async (): Promise<RefundUpdate> => {
    if (!gateway) return { kind: 'not_sent' };
    try {
      const answer = await gateway.request({
        payment: refundPayment(input.payment),
        amountRials: input.refund.amountRials,
        refundId: input.refund.id,
        description: input.description,
      });
      return { kind: 'answer', answer };
    } catch (error) {
      if (paymentErrorCode(error) === 'unconfigured') return { kind: 'not_sent' };
      deps.log?.(`✗ درخواست بازپرداخت ${input.refund.id} جواب روشن نگرفت:`, paymentErrorTag(error));
      return { kind: 'error', tag: paymentErrorTag(error) };
    }
  })();
  return (await deps.store.record(input.refund.id, update, deps.now(), 'request')) ?? input.refund;
}

/** استعلام یک بازپرداخت در جریان با درگاه خود پرداختش. */
export async function inquireRefund(deps: RefundDeps, refundId: string, options: { via: RefundVia; skipLocked?: boolean }) {
  return deps.store.inquire(
    refundId,
    async (refund, payment): Promise<RefundUpdate> => {
      const gateway = deps.gateways[payment.provider]?.refunds;
      if (!gateway) return { kind: 'error', tag: 'unconfigured' };
      try {
        const answer = await gateway.inquire({
          payment: refundPayment(payment),
          amountRials: refund.amountRials,
          refundId: refund.id,
          gatewayRef: refund.gatewayRef,
        });
        return { kind: 'answer', answer };
      } catch (error) {
        return { kind: 'error', tag: paymentErrorTag(error) };
      }
    },
    { at: deps.now, via: options.via, skipLocked: options.skipLocked ?? false },
  );
}

/** درگاه‌هایی که بازپرداخت دارند؛ بی هیچ‌کدام، استعلام خودکاری نیست. */
export const refundProviders = (gateways: Readonly<Record<string, PaymentGateway>>) =>
  Object.entries(gateways)
    .filter(([, gateway]) => gateway.refunds !== undefined)
    .map(([name]) => name);

/** استعلام خودکار یک دور: هر ردیف یک بار، `SKIP LOCKED`؛ شکست یکی بقیه را نمی‌اندازد. */
export async function inquirePendingRefunds(deps: RefundDeps, limit = 20): Promise<{ checked: number; closed: number }> {
  const ids = await deps.store.autoInquiry(deps.now(), limit, refundProviders(deps.gateways));
  let checked = 0;
  let closed = 0;
  for (const id of ids) {
    try {
      const result = await inquireRefund(deps, id, { via: 'auto', skipLocked: true });
      if (result && typeof result === 'object') {
        checked += 1;
        if (result.refund.status !== 'pending') closed += 1;
      }
    } catch (error) {
      deps.log?.(`✗ استعلام خودکار بازپرداخت ${id}:`, error);
    }
  }
  return { checked, closed };
}
