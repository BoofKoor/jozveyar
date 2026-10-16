/**
 * کد تخفیف (برش ۱۱٫۴، ADR-062؛ سؤال‌های ۲۰۹ و ۲۹۸ تا ۳۰۲): پیدا کردن و سنجیدن برای مسیر خرید، و ذخیره‌گاه «تخفیف‌ها»ی پنل.
 *
 * ظرفیت (سقف کل و سقف هر مشتری) را پایگاه داده زیر قفل ردیف کد می‌سنجد (`discount_code_room`، 0048): با ساختن سفارش، هر تلاش
 * پرداخت، و پرداخت شدن. اینجا همان شمارش بی قفل است (`discount_code_taken`)، برای پیام روشن پیش از سفارش و شمارهای پنل؛ حکم آخر
 * همیشه با محافظ است، و محدودیتی که رد کرد به همان دلیل برمی‌گردد (`discountRefusalOf`).
 */

import type { DiscountCodeTerms } from '@jozveyar/contracts';
import { desc, eq, sql } from 'drizzle-orm';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { adminEvents, adminUsers, discountCodes, orders } from './schema.js';

export type DiscountCodeRow = typeof discountCodes.$inferSelect;

/**
 * چرا کدی به این سفارش نمی‌خورد (سؤال ۲۹۹): نیست، خاموش است، روزش نرسیده یا گذشته، ظرفیتش پر است، یا این مشتری سهمش را برده (روی
 * سفارشی پرداخت‌شده، یا سفارشی که همین حالا در انتظار پرداخت است).
 */
export type DiscountRefusal = 'unknown' | 'disabled' | 'not_started' | 'ended' | 'used_up' | 'used_by_you';

/** شرط‌های کد به زبان موتور قیمت. */
export function termsOf(row: DiscountCodeRow): DiscountCodeTerms {
  const base = { id: row.id, code: row.code, minOrderRials: row.minOrderRials };
  return row.kind === 'percent'
    ? { ...base, kind: 'percent', percent: row.percent!, maxRials: row.maxDiscountRials }
    : { ...base, kind: 'fixed', amountRials: row.amountRials! };
}

/** روشن و در روز اعتبار؟ null یعنی بله (`orders_discount_code_valid` همین را می‌سنجد). */
export function dayRefusal(row: Pick<DiscountCodeRow, 'enabled' | 'validFrom' | 'validUntil'>, at: Date): DiscountRefusal | null {
  if (!row.enabled) return 'disabled';
  if (row.validFrom && at.getTime() < row.validFrom.getTime()) return 'not_started';
  if (row.validUntil && at.getTime() >= row.validUntil.getTime()) return 'ended';
  return null;
}

/** محافظی که سفارش یا تلاش پرداخت را رد کرد، به زبان مسیر خرید؛ null یعنی محافظ کد نبود. */
export function discountRefusalOf(constraint: string | undefined): DiscountRefusal | null {
  switch (constraint) {
    case 'discount_codes_total_limit':
      return 'used_up';
    case 'discount_codes_customer_limit':
      return 'used_by_you';
    case 'orders_discount_code_valid':
      return 'disabled';
    default:
      return null;
  }
}

type Db = Database['db'];
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** سفارش‌هایی که از ظرفیت کد گرفته‌اند، همه و این مشتری، بی قفل (`discount_code_taken`، 0048). */
async function takenOf(
  db: Db | Tx,
  codeId: string,
  userId: string | null,
  exceptOrder: string | null,
): Promise<{ taken: number; takenByUser: number }> {
  const rows = await db.execute<{ taken: string; taken_by_user: string }>(
    sql`SELECT taken, taken_by_user FROM discount_code_taken(${codeId}::uuid, ${userId}::uuid, ${exceptOrder}::uuid, true)`,
  );
  const row = rows[0];
  return { taken: Number(row?.taken ?? 0), takenByUser: Number(row?.taken_by_user ?? 0) };
}

/** جا هست؟ همان شرط `discount_code_room`، بی قفل. */
function roomRefusal(row: DiscountCodeRow, taken: { taken: number; takenByUser: number }): DiscountRefusal | null {
  if (row.totalLimit !== null && taken.taken >= row.totalLimit) return 'used_up';
  if (taken.takenByUser >= row.perCustomerLimit) return 'used_by_you';
  return null;
}

/**
 * کد مسیر خرید برای این مشتری، همین لحظه (سؤال ۲۹۹): متن یکدست‌شده (`normalizeDiscountCode`)، روشن، در روز اعتبار، و با جا برای یک
 * سفارش دیگرِ همین مشتری. حکم آخر با محافظ ساختن سفارش است.
 */
export async function discountForCheckout(
  db: Db,
  input: { code: string; userId: string; at: Date },
): Promise<{ ok: true; terms: DiscountCodeTerms } | { ok: false; reason: DiscountRefusal }> {
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, input.code)).limit(1);
  if (!row) return { ok: false, reason: 'unknown' };
  const day = dayRefusal(row, input.at);
  if (day) return { ok: false, reason: day };
  const room = roomRefusal(row, await takenOf(db, row.id, input.userId, null));
  if (room) return { ok: false, reason: room };
  return { ok: true, terms: termsOf(row) };
}

/**
 * جا برای یک تلاش پرداخت تازهٔ این سفارش (سؤال ۳۰۱)، بی قفل: پیش از رفتن به درگاه، تا تلاشی که محافظ پرداخت (`payments_discount_code_room`)
 * ردش می‌کند اصلاً شروع نشود. null یعنی هست، یا سفارش کدی ندارد.
 */
export async function discountRoomForOrder(db: Db, orderId: string): Promise<DiscountRefusal | null> {
  const [order] = await db
    .select({ codeId: orders.discountCodeId, userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order?.codeId) return null;
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.id, order.codeId)).limit(1);
  if (!row) return null;
  return roomRefusal(row, await takenOf(db, row.id, order.userId, orderId));
}

/* ───────────────────────────── پنل ───────────────────────────── */

/** یک کد در فهرست «تخفیف‌ها»: شرط‌ها، و شمار استفاده (پرداخت‌شده) و رزروهای زنده. */
export interface DiscountCodeView extends DiscountCodeRow {
  createdByName: string | null;
  /** سفارش‌های پرداخت‌شده با این کد (هر وضعیت پس از پرداخت، لغوشده هم). */
  used: number;
  /** سفارش‌های در انتظار پرداخت با رزرو زنده. */
  reserved: number;
}

/** آنچه فرم «کد تازه» و «ویرایش» می‌فرستد، سنجیده و یکدست. */
export interface DiscountCodeInput {
  kind: 'percent' | 'fixed';
  percent: number | null;
  maxDiscountRials: number | null;
  amountRials: number | null;
  minOrderRials: number;
  validFrom: Date | null;
  validUntil: Date | null;
  totalLimit: number | null;
  perCustomerLimit: number;
  enabled: boolean;
  note: string | null;
}

/** شرط‌هایی که از اولین سفارش منجمدند (`discount_codes_frozen`). */
export const FROZEN_TERMS = ['kind', 'percent', 'maxDiscountRials', 'amountRials', 'minOrderRials'] as const;

export type DiscountWrite =
  | { ok: true; code: DiscountCodeRow }
  | { ok: false; reason: 'code_taken' | 'not_found' | 'changed' | 'terms_frozen' };

/** یک سفارش با این کد، برای صفحهٔ کد در پنل. */
export interface DiscountOrderView {
  orderNumber: number;
  status: (typeof orders.$inferSelect)['status'];
  createdAt: Date;
  paidAt: Date | null;
  discountRials: number;
  totalRials: number;
}

export interface DiscountStore {
  /** تازه‌ترین اول. */
  list(): Promise<DiscountCodeView[]>;
  find(id: string): Promise<DiscountCodeView | null>;
  /** کدی با همین متن هست؟ پیش از کد تازهٔ «کد تازه»، تا کد برنامهٔ تأیید هدر نرود؛ `create` زیر تراکنش دوباره می‌سنجد. */
  codeTaken(code: string): Promise<boolean>;
  /** سفارش‌های این کد، تازه‌ترین اول، تا ۲۰۰. */
  ordersOf(id: string): Promise<DiscountOrderView[]>;
  /** کد تازه با رویداد `discounts.create` در همان تراکنش؛ متن تکراری `code_taken`. */
  create(input: { code: string; terms: DiscountCodeInput; createdBy: string; event: AdminEventInput }): Promise<DiscountWrite>;
  /**
   * شرط‌ها، روز، سقف‌ها، روشن و یادداشت، از همان که ادمین دید (`seenUpdatedAt`؛ وگرنه `changed`)، با رویداد `discounts.update`. شرطی که از
   * اولین سفارش منجمد است `terms_frozen`. بی تغییر، بی رویداد.
   */
  update(input: { id: string; seenUpdatedAt: Date; terms: DiscountCodeInput; event: AdminEventInput }): Promise<DiscountWrite>;
}

const sameValue = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

export function createDiscountStore({ db }: Database): DiscountStore {
  /** شمار استفاده و رزرو همهٔ کدها (یا یکی) با یک کوئری. */
  async function counts(id: string | null): Promise<Map<string, { used: number; reserved: number }>> {
    const rows = await db.execute<{ id: string; used: string; held: string }>(sql`
      SELECT c.id, u.taken AS used, r.taken - u.taken AS held
      FROM discount_codes c
      CROSS JOIN LATERAL discount_code_taken(c.id, NULL, NULL, false) u
      CROSS JOIN LATERAL discount_code_taken(c.id, NULL, NULL, true) r
      WHERE ${id}::uuid IS NULL OR c.id = ${id}::uuid`);
    return new Map(rows.map((row) => [row.id, { used: Number(row.used), reserved: Number(row.held) }]));
  }

  async function views(id: string | null): Promise<DiscountCodeView[]> {
    const rows = await db
      .select({ code: discountCodes, createdByName: adminUsers.displayName })
      .from(discountCodes)
      .leftJoin(adminUsers, eq(adminUsers.id, discountCodes.createdBy))
      .where(id === null ? undefined : eq(discountCodes.id, id))
      .orderBy(desc(discountCodes.createdAt));
    const byId = await counts(id);
    return rows.map((row) => ({ ...row.code, createdByName: row.createdByName, ...(byId.get(row.code.id) ?? { used: 0, reserved: 0 }) }));
  }

  return {
    list: () => views(null),

    async find(id) {
      const [view] = await views(id);
      return view ?? null;
    },

    async codeTaken(code) {
      const [row] = await db.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
      return Boolean(row);
    },

    async ordersOf(id) {
      return db
        .select({
          orderNumber: orders.orderNumber,
          status: orders.status,
          createdAt: orders.createdAt,
          paidAt: orders.paidAt,
          discountRials: orders.discountRials,
          totalRials: orders.totalRials,
        })
        .from(orders)
        .where(eq(orders.discountCodeId, id))
        .orderBy(desc(orders.createdAt))
        .limit(200);
    },

    async create({ code, terms, createdBy, event }) {
      return db.transaction(async (tx) => {
        const [taken] = await tx.select({ id: discountCodes.id }).from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
        if (taken) return { ok: false, reason: 'code_taken' } as const;
        const [row] = await tx
          .insert(discountCodes)
          .values({ code, ...terms, createdBy, createdAt: event.at, updatedAt: event.at })
          .onConflictDoNothing()
          .returning();
        if (!row) return { ok: false, reason: 'code_taken' } as const;
        await tx.insert(adminEvents).values(adminEventRow({ ...event, targetId: row.id }));
        return { ok: true, code: row } as const;
      });
    },

    async update({ id, seenUpdatedAt, terms, event }) {
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(discountCodes).where(eq(discountCodes.id, id)).limit(1).for('update');
        if (!row) return { ok: false, reason: 'not_found' } as const;
        if (row.updatedAt.getTime() !== seenUpdatedAt.getTime()) return { ok: false, reason: 'changed' } as const;
        const changed = (Object.keys(terms) as (keyof DiscountCodeInput)[]).filter((key) => !sameValue(row[key], terms[key]));
        if (changed.length === 0) return { ok: true, code: row } as const;
        if (changed.some((key) => (FROZEN_TERMS as readonly string[]).includes(key))) {
          const [used] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.discountCodeId, id)).limit(1);
          if (used) return { ok: false, reason: 'terms_frozen' } as const;
        }
        // ردیف از بالا زیر قفل است؛ `updated_at` را تریگر می‌نویسد (`discount_codes_guard`).
        const [updated] = await tx.update(discountCodes).set(terms).where(eq(discountCodes.id, id)).returning();
        await tx.insert(adminEvents).values(adminEventRow({ ...event, targetId: id, detail: { ...(event.detail as object), changed } }));
        return { ok: true, code: updated! } as const;
      });
    },
  };
}
