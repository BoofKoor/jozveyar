/**
 * تسویهٔ چاپخانه‌ها در پایگاه داده (برش ۱۰٫۳، ADR-069؛ سؤال ۲۰۳ «درصدی از سفارش»، و اجرا ۳۹۰ تا ۴۰۳): صورت‌حساب هر چاپخانه، و دفتر پرداخت
 * و اصلاح.
 *
 *  - **سهم هر سفارش** همان سهم منجمد آخرین تخصیص آن است (`order_assignments.share_rials`، که تریگر `order_assignments_share` هنگام درج
 *    می‌نشاند)؛ اینجا هرگز درصد امروز چاپخانه در مبلغ سفارش ضرب نمی‌شود. آخرین تخصیص همان چاپخانهٔ امروز سفارش است (`orders_partner_recorded`).
 *  - **بدهی قطعی** فقط سفارش «تحویل پست شد»، به روز تحویل (سؤال ۳۹۴)؛ در صف و در حال چاپ «در راه»؛ لغوشده هیچ، و لغو پس از شروع چاپ فقط
 *    فهرست، برای اصلاحی که مالک بخواهد.
 *  - **مانده** = سهم «تحویل پست شد»ها + اصلاح‌ها − پرداخت‌ها؛ باطل‌شده هیچ (سؤال ۳۹۷). صورت‌حساب ماندهٔ پیش از بازه، پایان بازه و امروز را
 *    دارد، همه از یک عکس پایگاه داده (`repeatable read`)، تا جمع‌ها با فهرست‌ها نجنگند.
 *  - **دفتر** فقط افزودنی (`partner_ledger_guard`، 0060). هر نوشتن زیر قفل ردیف چاپخانه و از همان دفتری که ادمین دید (`version`: شمار ردیف‌ها
 *    به‌علاوهٔ باطل‌ها، که فقط بالا می‌رود)، با رویداد در همان تراکنش؛ هر فرم یک ردیف (`request_id`): دو کلیک همان ردیف، و همان فرم با چیز
 *    دیگر `conflict`. قفل `FOR NO KEY UPDATE` است، نه `FOR UPDATE`، تا درج سفارش و تخصیصی که فقط کلید چاپخانه را می‌خواهد پشتش نماند.
 *  - **محدوده** (ADR-042): کاربر چاپخانه فقط چاپخانهٔ خودش؛ چاپخانهٔ دیگر همان «نیست» است. مبلغ مشتری (`baseRials`) را سرویس پنل برای
 *    کسی که `orders.money` ندارد برمی‌دارد.
 *  - **پول bigint:** ستون‌های int8 به رشته خوانده و `BigInt` می‌شوند.
 */

import { and, asc, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import type { OrderStatus } from './orders.js';
import type { PanelScope } from './panel.js';
import { adminEvents, adminUsers, cities, orders, partnerLedger, printPartners } from './schema.js';

/** سهم: صدم درصد، ۰ تا ۱۰۰ درصد (`print_partners_share`). */
export const SHARE_BP_MAX = 10_000;
/** سقف مبلغ هر ردیف دفتر، ریال (`partner_ledger_shape`): ۱۰ میلیارد تومان. */
export const LEDGER_MAX_RIALS = 100_000_000_000n;
/** کد پیگیری، و یادداشت یا دلیل (`partner_ledger_texts` و `partner_ledger_void`). */
export const LEDGER_TRACKING_MAX = 40;
export const LEDGER_NOTE_MAX = 300;
/** بلندترین «بابت» یک پرداخت (`partner_ledger_period`). */
export const LEDGER_PERIOD_MAX_DAYS = 400;

/**
 * سهم یک سفارش با یک درصد، همان تریگر `order_assignments_share`: از جمع چاپ، کاغذ و صحافی (ریال) به نزدیک‌ترین تومان، نیم رو به بالا. فقط
 * برای پیش‌نمایش «چه عوض می‌شود» پنل؛ سهم واقعی هر سفارش را خود پایگاه داده هنگام تخصیص می‌نشاند و تست یکپارچگی برابری‌شان را می‌سنجد.
 */
export function shareRialsOf(baseRials: bigint, shareBp: number): bigint {
  if (baseRials < 0n || !Number.isInteger(shareBp) || shareBp < 0 || shareBp > SHARE_BP_MAX) {
    throw new RangeError('پایه یا درصد سهم نادرست است');
  }
  return ((baseRials * BigInt(shareBp) + 50_000n) / 100_000n) * 10n;
}

export type LedgerKind = 'payment' | 'adjustment';

/** بازهٔ صورت‌حساب یا «بابت» پرداخت: آغاز اولین روز و آغاز روز پس از آخرین، نیمه‌شب تهران (مرزها را پنل می‌سازد). */
export interface SettlementRange {
  readonly from: Date;
  readonly until: Date;
}

export interface SettlementPartner {
  id: string;
  name: string;
  cityName: string;
  active: boolean;
  isDefault: boolean;
  /** درصد امروز، صدم درصد؛ null یعنی تعیین نشده. */
  shareBp: number | null;
}

export interface SettlementOverviewRow extends SettlementPartner {
  /** ماندهٔ امروز: مثبت یعنی بدهی ما به چاپخانه. */
  balanceRials: bigint;
  /** سفارش‌های در صف و در حال چاپ همین چاپخانه، و جمع سهم منجمدشان (بی سهم‌ها هیچ). */
  inFlight: { orders: number; shareRials: bigint };
  /** «تحویل پست شد»های بی سهم، همهٔ زمان‌ها. */
  unshared: number;
  /** آخرین پرداخت باطل‌نشده. */
  lastPayment: { day: Date; amountRials: bigint } | null;
}

export interface SettlementOrder {
  orderNumber: number;
  status: OrderStatus;
  paidAt: Date;
  /** «تحویل پست شد»: زمان تحویل؛ لغوشده: زمان آخرین لغو؛ بقیه null. */
  at: Date | null;
  /** پایهٔ سهم: جمع چاپ، کاغذ و صحافی پیش از تخفیف (`subtotal_rials`). */
  baseRials: bigint;
  /** سهم منجمد آخرین تخصیص؛ null یعنی بی سهم. */
  shareBp: number | null;
  shareRials: bigint | null;
}

export interface LedgerEntry {
  id: number;
  partnerId: string;
  kind: LedgerKind;
  /** پرداخت مثبت؛ اصلاح مثبت به سود چاپخانه و منفی به زیانش. */
  amountRials: bigint;
  day: Date;
  period: SettlementRange | null;
  tracking: string | null;
  note: string | null;
  orderNumber: number | null;
  createdAt: Date;
  createdBy: string;
  createdByName: string | null;
  voided: { at: Date; by: string; byName: string | null; reason: string } | null;
}

export interface SettlementStatement {
  partner: SettlementPartner;
  range: SettlementRange;
  /** مانده پیش از آغاز بازه. */
  openingRials: bigint;
  /** «تحویل پست شد»های بازه، به ترتیب زمان تحویل و شماره. */
  handed: SettlementOrder[];
  /** لغوشده‌هایی که در بازه پس از شروع چاپ لغو شدند (سؤال ۳۹۴)؛ سهمشان در مانده نیست. */
  cancelledAfterPrint: SettlementOrder[];
  /** در صف و در حال چاپ امروز، بی بازه، به ترتیب پرداخت. */
  inFlight: SettlementOrder[];
  /** پرداخت‌ها و اصلاح‌های بازه (روز ردیف)، باطل‌شده هم، به ترتیب روز و ثبت. */
  ledger: LedgerEntry[];
  /** مانده در پایان بازه. */
  closingRials: bigint;
  /** ماندهٔ امروز، با هر چه پس از بازه آمد. */
  balanceRials: bigint;
  /** نسخهٔ دفتر این چاپخانه: «همان که دیده شد» فرم‌های پرداخت، اصلاح و باطل. */
  version: number;
}

export interface LedgerInput {
  partnerId: string;
  kind: LedgerKind;
  amountRials: bigint;
  day: Date;
  /** «بابت» پرداخت؛ اصلاح هیچ. */
  period: SettlementRange | null;
  tracking: string | null;
  note: string | null;
  /** سفارش اصلاح (اختیاری)؛ پرداخت هیچ. */
  orderNumber: number | null;
  requestId: string;
  /** نسخهٔ دفتری که ادمین دید (`version`). */
  seen: number;
  at: Date;
  /** رویداد `settlements.payment` یا `settlements.adjust`؛ ادمینش ثبت‌کننده است، و شناسهٔ ردیف و مبلغ به `detail` افزوده می‌شود. */
  event: AdminEventInput;
}

/**
 * نتیجهٔ ثبت: نوشته شد؛ همان فرم پیش‌تر همین ردیف را نوشته بود (`duplicate`)؛ چاپخانه نیست؛ دفتر از وقتی ادمین دید عوض شده (`changed`)؛
 * شناسهٔ فرم مال ردیف دیگری است (`conflict`)؛ یا سفارش اصلاح نیست یا هرگز به همین چاپخانه سپرده نشده (`order_not_found`).
 */
export type LedgerWrite =
  | { ok: true; entry: LedgerEntry; duplicate: boolean }
  | { ok: false; reason: 'not_found' | 'changed' | 'conflict' | 'order_not_found' };

export interface LedgerVoidInput {
  partnerId: string;
  id: number;
  reason: string;
  seen: number;
  at: Date;
  /** رویداد `settlements.void`. */
  event: AdminEventInput;
}

/**
 * نتیجهٔ باطل کردن: انجام شد؛ همین ادمین با همین دلیل پیش‌تر باطلش کرده بود (`already`: دو کلیک)؛ ردیف (در این چاپخانه) نیست؛ کس دیگری یا
 * با دلیل دیگری باطلش کرده (`already_voided`)؛ یا دفتر از وقتی ادمین دید عوض شده (`changed`).
 */
export type LedgerVoidWrite =
  | { ok: true; entry: LedgerEntry; already: boolean }
  | { ok: false; reason: 'not_found' | 'changed' }
  | { ok: false; reason: 'already_voided'; entry: LedgerEntry };

export interface SettlementStore {
  /** چاپخانه‌ها با ماندهٔ امروز، در محدوده: پیش‌فرض اول، بعد فعال‌ها، بعد غیرفعال‌ها، و در هر دسته قدیمی‌ترین اول («چاپخانه‌ها»). */
  overview(scope: PanelScope): Promise<SettlementOverviewRow[]>;
  /** صورت‌حساب یک چاپخانه در یک بازه؛ null یعنی چنین چاپخانه‌ای (در این محدوده) نیست. */
  statement(scope: PanelScope, partnerId: string, range: SettlementRange): Promise<SettlementStatement | null>;
  /** سفارشی که اصلاح می‌تواند برایش باشد: روزی به همین چاپخانه سپرده شده؛ null یعنی نیست. */
  adjustable(partnerId: string, orderNumber: number): Promise<SettlementOrder | null>;
  /** یک ردیف دفتر همین چاپخانه. */
  entry(partnerId: string, id: number): Promise<LedgerEntry | null>;
  /** نسخهٔ دفتر یک چاپخانه (`SettlementStatement.version`)، برای سنجش پیش از کد تازه؛ null یعنی چاپخانه نیست. */
  version(partnerId: string): Promise<number | null>;
  /** ردیفی که فرمی با همین شناسه نوشت؛ فرستادن دوباره همان فرم پیش از کد تازه جوابش را می‌گیرد. */
  byRequest(requestId: string): Promise<LedgerEntry | null>;
  record(input: LedgerInput): Promise<LedgerWrite>;
  voidEntry(input: LedgerVoidInput): Promise<LedgerVoidWrite>;
  /** چاپخانه‌های فعالی که درصد سهمشان تعیین نشده (هشدار پیشخوان مالک، سؤال ۳۹۵)، به ترتیب «چاپخانه‌ها». */
  unsetShares(): Promise<{ id: string; name: string }[]>;
}

const creator = alias(adminUsers, 'ledger_creator');
const voider = alias(adminUsers, 'ledger_voider');

const ts = (value: Date) => sql`${value.toISOString()}::timestamptz`;

/** ترتیب «چاپخانه‌ها»: پیش‌فرض، فعال، قدیمی‌ترین. */
const partnerOrder = [
  desc(printPartners.isDefault),
  sql`${printPartners.deactivatedAt} IS NOT NULL`,
  asc(printPartners.createdAt),
  asc(printPartners.id),
];

const partnerFields = {
  id: printPartners.id,
  name: printPartners.name,
  cityName: cities.nameFa,
  active: sql<boolean>`${printPartners.deactivatedAt} IS NULL`,
  isDefault: printPartners.isDefault,
  shareBp: printPartners.shareBp,
};

/**
 * شناسهٔ سفارش در زیرکوئری‌ها، با نام جدول: drizzle در کوئری یک‌جدولی ستون را بی نام جدول می‌نویسد، و `"id"` درون زیرکوئری شناسهٔ جدول خود
 * زیرکوئری خوانده می‌شود.
 */
const ORDER_ID = sql.raw('"orders"."id"');
/** سهم منجمد آخرین تخصیص سفارش. */
const latestShareBp = sql<number | null>`(SELECT a.share_bp FROM order_assignments a WHERE a.order_id = ${ORDER_ID} ORDER BY a.id DESC LIMIT 1)`;
const latestShareRials = sql<
  string | null
>`(SELECT a.share_rials::text FROM order_assignments a WHERE a.order_id = ${ORDER_ID} ORDER BY a.id DESC LIMIT 1)`;
/** آخرین لغو سفارش: از کدام وضعیت و کی (`order_status_events`). */
const lastCancelFrom = sql<string | null>`(SELECT e.from_status::text FROM order_status_events e
  WHERE e.order_id = ${ORDER_ID} AND e.to_status = 'cancelled' ORDER BY e.at DESC, e.id DESC LIMIT 1)`;
const lastCancelAt = sql<Date | null>`(SELECT e.at FROM order_status_events e
  WHERE e.order_id = ${ORDER_ID} AND e.to_status = 'cancelled' ORDER BY e.at DESC, e.id DESC LIMIT 1)`.mapWith(orders.createdAt);

const orderFields = {
  orderNumber: orders.orderNumber,
  status: orders.status,
  paidAt: orders.paidAt,
  handedToPostAt: orders.handedToPostAt,
  cancelledAt: lastCancelAt,
  baseRials: sql<string>`${orders.subtotalRials}::text`,
  shareBp: latestShareBp,
  shareRials: latestShareRials,
};

type OrderLine = {
  orderNumber: number;
  status: OrderStatus;
  paidAt: Date | null;
  handedToPostAt: Date | null;
  cancelledAt: Date | null;
  baseRials: string;
  shareBp: number | null;
  shareRials: string | null;
};

function orderOf(row: OrderLine): SettlementOrder {
  return {
    orderNumber: row.orderNumber,
    status: row.status,
    // فقط سفارش پرداخت‌شده به چاپخانه سپرده می‌شود (`settlePayment`)، پس `paid_at` همیشه هست.
    paidAt: row.paidAt!,
    at: row.status === 'handed_to_post' ? row.handedToPostAt : row.status === 'cancelled' ? row.cancelledAt : null,
    baseRials: BigInt(row.baseRials),
    shareBp: row.shareBp,
    shareRials: row.shareRials === null ? null : BigInt(row.shareRials),
  };
}

const entryFields = {
  id: partnerLedger.id,
  partnerId: partnerLedger.printPartnerId,
  kind: partnerLedger.kind,
  amountRials: sql<string>`${partnerLedger.amountRials}::text`,
  day: partnerLedger.day,
  periodFrom: partnerLedger.periodFrom,
  periodUntil: partnerLedger.periodUntil,
  tracking: partnerLedger.tracking,
  note: partnerLedger.note,
  orderNumber: orders.orderNumber,
  createdAt: partnerLedger.createdAt,
  createdBy: partnerLedger.createdBy,
  createdByName: creator.displayName,
  voidedAt: partnerLedger.voidedAt,
  voidedBy: partnerLedger.voidedBy,
  voidedByName: voider.displayName,
  voidReason: partnerLedger.voidReason,
};

type EntryRow = {
  id: number;
  partnerId: string;
  kind: string;
  amountRials: string;
  day: Date;
  periodFrom: Date | null;
  periodUntil: Date | null;
  tracking: string | null;
  note: string | null;
  orderNumber: number | null;
  createdAt: Date;
  createdBy: string;
  createdByName: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidedByName: string | null;
  voidReason: string | null;
};

function entryOf(row: EntryRow): LedgerEntry {
  return {
    id: row.id,
    partnerId: row.partnerId,
    kind: row.kind as LedgerKind,
    amountRials: BigInt(row.amountRials),
    day: row.day,
    period: row.periodFrom && row.periodUntil ? { from: row.periodFrom, until: row.periodUntil } : null,
    tracking: row.tracking,
    note: row.note,
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    voided:
      row.voidedAt && row.voidedBy && row.voidReason
        ? { at: row.voidedAt, by: row.voidedBy, byName: row.voidedByName, reason: row.voidReason }
        : null,
  };
}

/** رویداد با جزئیات افزوده. */
const withDetail = (event: AdminEventInput, extra: Record<string, unknown>) =>
  adminEventRow({
    ...event,
    detail: { ...(event.detail !== null && typeof event.detail === 'object' ? (event.detail as Record<string, unknown>) : {}), ...extra },
  });

export function createSettlementStore({ db }: Database): SettlementStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Reader = Tx | typeof db;

  const entries = (reader: Reader) =>
    reader
      .select(entryFields)
      .from(partnerLedger)
      .innerJoin(creator, eq(creator.id, partnerLedger.createdBy))
      .leftJoin(voider, eq(voider.id, partnerLedger.voidedBy))
      .leftJoin(orders, eq(orders.id, partnerLedger.orderId));

  async function entryById(reader: Reader, id: number): Promise<LedgerEntry | null> {
    const [row] = await entries(reader).where(eq(partnerLedger.id, id)).limit(1);
    return row ? entryOf(row) : null;
  }

  /** نسخهٔ دفتر یک چاپخانه: ردیف‌ها به‌علاوهٔ باطل‌ها. دفتر فقط افزودنی است و باطل یک بار، پس هر نوشتن یکی بالایش می‌برد. */
  async function versionOf(reader: Reader, partnerId: string): Promise<number> {
    const [row] = await reader
      .select({ version: sql<number>`(count(*) + count(${partnerLedger.voidedAt}))::int` })
      .from(partnerLedger)
      .where(eq(partnerLedger.printPartnerId, partnerId));
    return row?.version ?? 0;
  }

  /** چاپخانه را برای نوشتن دفتر قفل می‌کند؛ null یعنی نیست. */
  async function lockPartner(tx: Tx, partnerId: string) {
    const [partner] = await tx
      .select({ id: printPartners.id, name: printPartners.name })
      .from(printPartners)
      .where(eq(printPartners.id, partnerId))
      .limit(1)
      .for('no key update');
    return partner ?? null;
  }

  /** سفارشی که روزی به این چاپخانه سپرده شده (همان شرط `partner_ledger_order`). */
  function assignedTo(partnerId: string): SQL {
    return sql`EXISTS (SELECT 1 FROM order_assignments a WHERE a.order_id = ${ORDER_ID} AND a.to_partner_id = ${partnerId})`;
  }

  return {
    async overview(scope) {
      const partnerIds = scope.kind === 'partner' ? [scope.partnerId] : null;
      const [partners, shares, ledger] = await db.transaction(
        async (tx) =>
          Promise.all([
            tx
              .select(partnerFields)
              .from(printPartners)
              .innerJoin(cities, eq(cities.id, printPartners.cityId))
              .where(partnerIds ? inArray(printPartners.id, partnerIds) : undefined)
              .orderBy(...partnerOrder),
            tx.execute<{ partner: string; owed: string; unshared: number; in_flight: number; in_flight_rials: string }>(sql`
              SELECT o.print_partner_id AS partner,
                     coalesce(sum(s.share_rials) FILTER (WHERE o.status = 'handed_to_post'), 0)::text AS owed,
                     (count(*) FILTER (WHERE o.status = 'handed_to_post' AND s.share_rials IS NULL))::int AS unshared,
                     (count(*) FILTER (WHERE o.status IN ('paid', 'printing')))::int AS in_flight,
                     coalesce(sum(s.share_rials) FILTER (WHERE o.status IN ('paid', 'printing')), 0)::text AS in_flight_rials
                FROM orders o
                LEFT JOIN LATERAL (SELECT a.share_rials FROM order_assignments a WHERE a.order_id = o.id ORDER BY a.id DESC LIMIT 1) s ON true
               WHERE o.print_partner_id IS NOT NULL AND o.status IN ('paid', 'printing', 'handed_to_post')
                 ${partnerIds ? sql`AND o.print_partner_id = ${partnerIds[0]}` : sql``}
               GROUP BY o.print_partner_id`),
            tx.execute<{ partner: string; net: string; last_day: string | null; last_rials: string | null }>(sql`
              SELECT l.print_partner_id AS partner,
                     coalesce(sum(CASE WHEN l.kind = 'payment' THEN -l.amount_rials ELSE l.amount_rials END), 0)::text AS net,
                     (SELECT p.day::text FROM partner_ledger p
                       WHERE p.print_partner_id = l.print_partner_id AND p.kind = 'payment' AND p.voided_at IS NULL
                       ORDER BY p.day DESC, p.id DESC LIMIT 1) AS last_day,
                     (SELECT p.amount_rials::text FROM partner_ledger p
                       WHERE p.print_partner_id = l.print_partner_id AND p.kind = 'payment' AND p.voided_at IS NULL
                       ORDER BY p.day DESC, p.id DESC LIMIT 1) AS last_rials
                FROM partner_ledger l
               WHERE l.voided_at IS NULL ${partnerIds ? sql`AND l.print_partner_id = ${partnerIds[0]}` : sql``}
               GROUP BY l.print_partner_id`),
          ]),
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
      const shareBy = new Map(shares.map((row) => [row.partner, row]));
      const ledgerBy = new Map(ledger.map((row) => [row.partner, row]));
      return partners.map((partner) => {
        const share = shareBy.get(partner.id);
        const book = ledgerBy.get(partner.id);
        return {
          ...partner,
          balanceRials: BigInt(share?.owed ?? '0') + BigInt(book?.net ?? '0'),
          inFlight: { orders: share?.in_flight ?? 0, shareRials: BigInt(share?.in_flight_rials ?? '0') },
          unshared: share?.unshared ?? 0,
          lastPayment:
            book?.last_day && book.last_rials ? { day: new Date(book.last_day), amountRials: BigInt(book.last_rials) } : null,
        };
      });
    },

    async statement(scope, partnerId, range) {
      if (scope.kind === 'partner' && scope.partnerId !== partnerId) return null;
      return db.transaction(
        async (tx) => {
          const [partner] = await tx
            .select(partnerFields)
            .from(printPartners)
            .innerJoin(cities, eq(cities.id, printPartners.cityId))
            .where(eq(printPartners.id, partnerId))
            .limit(1);
          if (!partner) return null;
          const mine = eq(orders.printPartnerId, partnerId);
          const [handed, cancelled, inFlight, ledger, shareSums, ledgerSums, version] = await Promise.all([
            tx
              .select(orderFields)
              .from(orders)
              .where(
                and(
                  mine,
                  eq(orders.status, 'handed_to_post'),
                  gte(orders.handedToPostAt, range.from),
                  lt(orders.handedToPostAt, range.until),
                ),
              )
              .orderBy(asc(orders.handedToPostAt), asc(orders.orderNumber)),
            tx
              .select(orderFields)
              .from(orders)
              .where(
                and(
                  mine,
                  eq(orders.status, 'cancelled'),
                  sql`${lastCancelFrom} = 'printing'`,
                  sql`${lastCancelAt} >= ${ts(range.from)}`,
                  sql`${lastCancelAt} < ${ts(range.until)}`,
                ),
              )
              .orderBy(asc(orders.orderNumber)),
            tx
              .select(orderFields)
              .from(orders)
              .where(and(mine, inArray(orders.status, ['paid', 'printing'])))
              .orderBy(asc(orders.paidAt), asc(orders.orderNumber)),
            entries(tx)
              .where(
                and(eq(partnerLedger.printPartnerId, partnerId), gte(partnerLedger.day, range.from), lt(partnerLedger.day, range.until)),
              )
              .orderBy(asc(partnerLedger.day), asc(partnerLedger.id)),
            tx.execute<{ before: string; through: string; total: string }>(sql`
              SELECT coalesce(sum(s.share_rials) FILTER (WHERE o.handed_to_post_at < ${ts(range.from)}), 0)::text AS before,
                     coalesce(sum(s.share_rials) FILTER (WHERE o.handed_to_post_at < ${ts(range.until)}), 0)::text AS through,
                     coalesce(sum(s.share_rials), 0)::text AS total
                FROM orders o
                LEFT JOIN LATERAL (SELECT a.share_rials FROM order_assignments a WHERE a.order_id = o.id ORDER BY a.id DESC LIMIT 1) s ON true
               WHERE o.print_partner_id = ${partnerId} AND o.status = 'handed_to_post'`),
            tx.execute<{ before: string; through: string; total: string }>(sql`
              SELECT coalesce(sum(v.signed) FILTER (WHERE v.day < ${ts(range.from)}), 0)::text AS before,
                     coalesce(sum(v.signed) FILTER (WHERE v.day < ${ts(range.until)}), 0)::text AS through,
                     coalesce(sum(v.signed), 0)::text AS total
                FROM (SELECT l.day, CASE WHEN l.kind = 'payment' THEN -l.amount_rials ELSE l.amount_rials END AS signed
                        FROM partner_ledger l WHERE l.print_partner_id = ${partnerId} AND l.voided_at IS NULL) v`),
            versionOf(tx, partnerId),
          ]);
          const shares = shareSums[0]!;
          const book = ledgerSums[0]!;
          return {
            partner,
            range,
            openingRials: BigInt(shares.before) + BigInt(book.before),
            handed: handed.map(orderOf),
            cancelledAfterPrint: cancelled.map(orderOf),
            inFlight: inFlight.map(orderOf),
            ledger: ledger.map(entryOf),
            closingRials: BigInt(shares.through) + BigInt(book.through),
            balanceRials: BigInt(shares.total) + BigInt(book.total),
            version,
          };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },

    async adjustable(partnerId, orderNumber) {
      const [row] = await db
        .select(orderFields)
        .from(orders)
        .where(and(eq(orders.orderNumber, orderNumber), assignedTo(partnerId)))
        .limit(1);
      return row ? orderOf(row) : null;
    },

    async entry(partnerId, id) {
      const [row] = await entries(db)
        .where(and(eq(partnerLedger.id, id), eq(partnerLedger.printPartnerId, partnerId)))
        .limit(1);
      return row ? entryOf(row) : null;
    },

    async version(partnerId) {
      const [partner] = await db.select({ id: printPartners.id }).from(printPartners).where(eq(printPartners.id, partnerId)).limit(1);
      return partner ? versionOf(db, partnerId) : null;
    },

    async byRequest(requestId) {
      const [row] = await entries(db).where(eq(partnerLedger.requestId, requestId)).limit(1);
      return row ? entryOf(row) : null;
    },

    async record(input) {
      return db.transaction(async (tx): Promise<LedgerWrite> => {
        const partner = await lockPartner(tx, input.partnerId);
        if (!partner) return { ok: false, reason: 'not_found' };
        // همان فرم پیش‌تر نوشته شد: فقط اگر همان ردیف است (دو کلیک، یا فرستادن دوباره پس از پاسخی که نرسید) همان را برمی‌گرداند. پیش از
        // «همان که دیده شد»، چون ردیف خود همین فرم نسخهٔ دفتر را بالا برده است.
        const [earlier] = await entries(tx).where(eq(partnerLedger.requestId, input.requestId)).limit(1);
        if (earlier) {
          const entry = entryOf(earlier);
          const same =
            entry.partnerId === input.partnerId &&
            entry.kind === input.kind &&
            entry.amountRials === input.amountRials &&
            entry.day.getTime() === input.day.getTime() &&
            (entry.period?.from.getTime() ?? null) === (input.period?.from.getTime() ?? null) &&
            (entry.period?.until.getTime() ?? null) === (input.period?.until.getTime() ?? null) &&
            entry.tracking === input.tracking &&
            entry.note === input.note &&
            entry.orderNumber === input.orderNumber &&
            entry.createdBy === input.event.adminUserId;
          return same ? { ok: true, entry, duplicate: true } : { ok: false, reason: 'conflict' };
        }
        if ((await versionOf(tx, input.partnerId)) !== input.seen) return { ok: false, reason: 'changed' };
        let orderId: string | null = null;
        if (input.orderNumber !== null) {
          const [order] = await tx
            .select({ id: orders.id })
            .from(orders)
            .where(and(eq(orders.orderNumber, input.orderNumber), assignedTo(input.partnerId)))
            .limit(1);
          if (!order) return { ok: false, reason: 'order_not_found' };
          orderId = order.id;
        }
        const [row] = await tx
          .insert(partnerLedger)
          .values({
            printPartnerId: input.partnerId,
            kind: input.kind,
            amountRials: Number(input.amountRials),
            day: input.day,
            periodFrom: input.period?.from ?? null,
            periodUntil: input.period?.until ?? null,
            tracking: input.tracking,
            note: input.note,
            orderId,
            createdBy: input.event.adminUserId!,
            createdAt: input.at,
            requestId: input.requestId,
          })
          .returning({ id: partnerLedger.id });
        // مبلغ، روز و سفارش در رویداد؛ کد پیگیری و یادداشت نه (متن آزاد فقط در خود دفتر).
        await tx.insert(adminEvents).values(
          withDetail(input.event, {
            entry: row!.id,
            partner: { id: partner.id, name: partner.name },
            amountRials: Number(input.amountRials),
            day: input.day.toISOString(),
            ...(input.period ? { period: { from: input.period.from.toISOString(), until: input.period.until.toISOString() } } : {}),
            ...(input.orderNumber !== null ? { orderNumber: input.orderNumber } : {}),
          }),
        );
        return { ok: true, entry: (await entryById(tx, row!.id))!, duplicate: false };
      });
    },

    async voidEntry(input) {
      return db.transaction(async (tx): Promise<LedgerVoidWrite> => {
        const partner = await lockPartner(tx, input.partnerId);
        if (!partner) return { ok: false, reason: 'not_found' };
        const [row] = await entries(tx)
          .where(and(eq(partnerLedger.id, input.id), eq(partnerLedger.printPartnerId, input.partnerId)))
          .limit(1);
        if (!row) return { ok: false, reason: 'not_found' };
        const entry = entryOf(row);
        if (entry.voided) {
          // دو کلیک: دومی همان باطل را می‌بیند. باطلی با کس دیگری یا دلیل دیگری گفته می‌شود، تا دلیل تازه بی‌صدا گم نشود.
          if (entry.voided.by === input.event.adminUserId && entry.voided.reason === input.reason) return { ok: true, entry, already: true };
          return { ok: false, reason: 'already_voided', entry };
        }
        if ((await versionOf(tx, input.partnerId)) !== input.seen) return { ok: false, reason: 'changed' };
        await tx
          .update(partnerLedger)
          .set({ voidedAt: input.at, voidedBy: input.event.adminUserId, voidReason: input.reason })
          .where(and(eq(partnerLedger.id, input.id), isNull(partnerLedger.voidedAt)));
        await tx.insert(adminEvents).values(
          withDetail(input.event, {
            entry: entry.id,
            partner: { id: partner.id, name: partner.name },
            kind: entry.kind,
            amountRials: Number(entry.amountRials),
            day: entry.day.toISOString(),
          }),
        );
        return { ok: true, entry: (await entryById(tx, entry.id))!, already: false };
      });
    },

    async unsetShares() {
      return db
        .select({ id: printPartners.id, name: printPartners.name })
        .from(printPartners)
        .where(and(isNull(printPartners.deactivatedAt), isNull(printPartners.shareBp)))
        .orderBy(...partnerOrder);
    },
  };
}
