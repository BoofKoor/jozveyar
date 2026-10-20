/**
 * موجودی کاغذ چاپخانه‌ها در پایگاه داده (برش ۱۰٫۴، ADR-070؛ سؤال ۲۰۴، پاسخ «همهٔ چاپخانه‌ها»، و اجرا ۴۰۴ تا ۴۲۰).
 *
 *  - **قلم** یک کاغذ تعرفه در یک اندازه در یک چاپخانه است، به برگ؛ فقط وقتی هست که کسی پیگیری‌اش را با شمارش اول شروع کند (`track`).
 *  - **موجودی** جمع `delta_sheets` ردیف‌های قلم است. «شروع چاپ» و برگرداندنش را تریگر `orders_paper_stock` می‌نویسد، نه این ماژول؛ اینجا
 *    فقط ورود، ضایعات، شمارش و آستانه. تغییر شمارش را خود پایگاه داده از موجودی همان لحظه می‌نشاند (`paper_stock_moves_guard`، 0062).
 *  - **نیاز صف**: برگی که سفارش‌های «در صف چاپ» همان چاپخانه از همان کاغذ و اندازه می‌خواهند، از همان `order_paper_sheets` که تریگر با آن کم
 *    می‌کند (سؤال ۴۱۴).
 *  - **هر نوشتن** زیر قفل ردیف قلم، با رویداد در همان تراکنش؛ هر فرم یک ردیف (`request_id`): دو کلیک همان ردیف، و همان فرم با چیز دیگر
 *    `conflict` (سؤال ۴۱۱). یادداشت و دلیل در رویداد نمی‌آیند.
 *  - **محدوده** (ADR-042): کاربر چاپخانه فقط قلم‌های چاپخانهٔ خودش؛ قلم و چاپخانهٔ دیگر همان «نیست» است، در خواندن و نوشتن.
 */

import type { PaperSize } from '@jozveyar/contracts';
import { and, eq, sql, type SQL } from 'drizzle-orm';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import type { PanelScope } from './panel.js';
import { adminEvents, cities, PAPER_STOCK_MAX_SHEETS, paperStockItems, paperStockMoves, printPartners } from './schema.js';

export { PAPER_STOCK_MAX_SHEETS };
/** یادداشت ورود یا دلیل ضایعات و شمارش (`paper_stock_moves_note`). */
export const STOCK_NOTE_MAX = 300;
/** دلیل شمارشی که پیگیری قلم با آن شروع می‌شود. */
export const STOCK_FIRST_COUNT_NOTE = 'شمارش اول';
/** ردیف‌های هر صفحهٔ قلم (سؤال ۴۱۶). */
export const STOCK_MOVES_PAGE = 50;

export type StockMoveKind = 'purchase' | 'waste' | 'count' | 'print' | 'unprint';
/** ردیفی که ادمین می‌نویسد؛ چاپ و برگشت خودکارند. */
export type ManualMoveKind = 'purchase' | 'waste' | 'count';

export interface StockPartner {
  id: string;
  name: string;
  cityName: string;
  active: boolean;
  isDefault: boolean;
}

export interface StockItem {
  id: string;
  partnerId: string;
  paperTypeId: string;
  paperSize: PaperSize;
  /** نام کاغذ در تعرفهٔ فعال، یا آخرین نسخهٔ فعال‌شده‌ای که داشتش (سؤال ۴۱۷)؛ null یعنی هیچ نسخه‌ای این شناسه را نداشت. */
  paperName: string | null;
  /** تعرفهٔ فعال این کاغذ را روشن و در همین اندازه دارد. */
  inTariff: boolean;
  balanceSheets: number;
  thresholdSheets: number | null;
  /** سفارش‌های «در صف چاپ» همین چاپخانه که این کاغذ و اندازه را می‌خواهند، و برگشان. */
  queued: { orders: number; sheets: number };
  lastMoveAt: Date | null;
  createdAt: Date;
}

export interface StockMove {
  id: number;
  itemId: string;
  kind: StockMoveKind;
  deltaSheets: number;
  /** شمارش: موجودی شمرده‌شده. */
  countedSheets: number | null;
  /** موجودی پس از همین ردیف. */
  balanceSheets: number;
  /** چاپ و برگشت: سفارش. */
  orderNumber: number | null;
  note: string | null;
  createdAt: Date;
  /** ادمین ردیف دستی؛ خودکار null. */
  createdBy: string | null;
  createdByName: string | null;
  /** ردیف چاپی که با برگرداندن وضعیت برگشت. */
  undone: boolean;
}

export interface StockPartnerView {
  partner: StockPartner;
  items: StockItem[];
}

export interface StockItemView {
  partner: StockPartner;
  item: StockItem;
  /** تازه‌ترین اول. */
  moves: StockMove[];
  total: number;
}

/** کاغذی که می‌شود پیگیری‌اش را شروع کرد: روشن در تعرفهٔ فعال، با اندازه‌هایی که نرخ دارد. */
export interface StockPaperChoice {
  id: string;
  name: string;
  sizes: PaperSize[];
}

/** قلمی که هشدار پیشخوان می‌خواهد (سؤال ۴۱۳). */
export interface StockAlert {
  partner: { id: string; name: string };
  item: StockItem;
  negative: boolean;
  belowThreshold: boolean;
  /** موجودی کمتر از نیاز سفارش‌های «در صف چاپ». */
  shortForQueue: boolean;
}

export interface TrackInput {
  partnerId: string;
  paperTypeId: string;
  paperSize: PaperSize;
  /** موجودی امروز: شمارش اول. */
  countedSheets: number;
  thresholdSheets: number | null;
  requestId: string;
  at: Date;
  /** رویداد `inventory.track`؛ ادمینش سازنده است. */
  event: AdminEventInput;
}

/**
 * نتیجهٔ شروع پیگیری: ساخته شد؛ همان فرم پیش‌تر ساخته بود (`duplicate`)؛ چاپخانه (در این محدوده) نیست؛ تعرفهٔ فعال این کاغذ را در این
 * اندازه ندارد (`paper_not_found`)؛ این قلم پیش‌تر پیگیری می‌شد (`exists`، با شناسه‌اش)؛ یا شناسهٔ فرم مال ردیف دیگری است (`conflict`).
 */
export type TrackWrite =
  | { ok: true; item: StockItem; duplicate: boolean }
  | { ok: false; reason: 'not_found' | 'paper_not_found' | 'conflict' }
  | { ok: false; reason: 'exists'; itemId: string };

export interface MoveInput {
  itemId: string;
  kind: ManualMoveKind;
  /** ورود و ضایعات: برگ، مثبت؛ شمارش: موجودی شمرده‌شده. */
  sheets: number;
  note: string | null;
  requestId: string;
  at: Date;
  /** رویداد `inventory.purchase`، `inventory.waste` یا `inventory.count`. */
  event: AdminEventInput;
}

export type MoveWrite =
  | { ok: true; move: StockMove; item: StockItem; duplicate: boolean }
  | { ok: false; reason: 'not_found' | 'conflict' };

export interface ThresholdInput {
  itemId: string;
  thresholdSheets: number | null;
  at: Date;
  /** رویداد `inventory.threshold`؛ فقط وقتی آستانه عوض شود. */
  event: AdminEventInput;
}

export type ThresholdWrite = { ok: true; item: StockItem; changed: boolean } | { ok: false; reason: 'not_found' };

export interface InventoryStore {
  /** چاپخانه‌ها با قلم‌هایشان، در محدوده: فعال‌ها همه، غیرفعال فقط با قلم؛ به ترتیب «چاپخانه‌ها». */
  overview(scope: PanelScope): Promise<StockPartnerView[]>;
  /** یک چاپخانه با قلم‌هایش؛ null یعنی (در این محدوده) نیست. */
  partner(scope: PanelScope, partnerId: string): Promise<StockPartnerView | null>;
  /** یک قلم با یک صفحه از ردیف‌هایش، تازه‌ترین اول؛ null یعنی (در این محدوده) نیست. */
  item(scope: PanelScope, itemId: string, page: { limit: number; offset: number }): Promise<StockItemView | null>;
  /** کاغذهای تعرفهٔ فعال که می‌شود پیگیری کرد. */
  papers(): Promise<StockPaperChoice[]>;
  track(scope: PanelScope, input: TrackInput): Promise<TrackWrite>;
  record(scope: PanelScope, input: MoveInput): Promise<MoveWrite>;
  setThreshold(scope: PanelScope, input: ThresholdInput): Promise<ThresholdWrite>;
  /** قلم‌های چاپخانه‌های فعال که منفی، زیر آستانه یا کمتر از نیاز صف‌اند، در محدوده. */
  alerts(scope: PanelScope): Promise<StockAlert[]>;
}

/** ترتیب اندازه‌ها، مثل تعرفه. */
const SIZE_ORDER: Record<PaperSize, number> = { a4: 0, a5: 1, a3: 2 };

/** ترتیب «چاپخانه‌ها»: پیش‌فرض، فعال، قدیمی‌ترین. */
const partnerOrder = sql`${printPartners.isDefault} DESC, (${printPartners.deactivatedAt} IS NOT NULL), ${printPartners.createdAt}, ${printPartners.id}`;

const partnerFields = {
  id: printPartners.id,
  name: printPartners.name,
  cityName: cities.nameFa,
  active: sql<boolean>`${printPartners.deactivatedAt} IS NULL`,
  isDefault: printPartners.isDefault,
};

type ItemRow = {
  id: string;
  partner_id: string;
  paper_type_id: string;
  paper_size: PaperSize;
  threshold_sheets: number | null;
  created_at: string;
  balance: string;
  last_at: string | null;
  paper_name: string | null;
  in_tariff: boolean;
  queued_sheets: string;
  queued_orders: number;
};

function itemOf(row: ItemRow): StockItem {
  return {
    id: row.id,
    partnerId: row.partner_id,
    paperTypeId: row.paper_type_id,
    paperSize: row.paper_size,
    paperName: row.paper_name,
    inTariff: row.in_tariff,
    balanceSheets: Number(row.balance),
    thresholdSheets: row.threshold_sheets,
    queued: { orders: row.queued_orders, sheets: Number(row.queued_sheets) },
    lastMoveAt: row.last_at === null ? null : new Date(row.last_at),
    createdAt: new Date(row.created_at),
  };
}

/** نام کاغذ برای فهرست: نام، بعد اندازه، بعد قدیمی‌ترین؛ الفبای فارسی، نه collation پایگاه داده (`production.ts`). */
function byPaper(a: StockItem, b: StockItem): number {
  return (
    (a.paperName ?? a.paperTypeId).localeCompare(b.paperName ?? b.paperTypeId, 'fa') ||
    SIZE_ORDER[a.paperSize] - SIZE_ORDER[b.paperSize] ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

type MoveRow = {
  id: string;
  item_id: string;
  kind: StockMoveKind;
  delta_sheets: number;
  counted_sheets: number | null;
  balance: string;
  order_number: number | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  undone: boolean;
};

function moveOf(row: MoveRow): StockMove {
  return {
    id: Number(row.id),
    itemId: row.item_id,
    kind: row.kind,
    deltaSheets: row.delta_sheets,
    countedSheets: row.counted_sheets,
    balanceSheets: Number(row.balance),
    orderNumber: row.order_number,
    note: row.note,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    undone: row.undone,
  };
}

/** رویداد با جزئیات افزوده. */
const withDetail = (event: AdminEventInput, extra: Record<string, unknown>) =>
  adminEventRow({
    ...event,
    detail: { ...(event.detail !== null && typeof event.detail === 'object' ? (event.detail as Record<string, unknown>) : {}), ...extra },
  });

export function createInventoryStore({ db }: Database): InventoryStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Reader = Tx | typeof db;

  /** شرط محدوده روی چاپخانهٔ قلم. */
  const scoped = (scope: PanelScope): SQL => (scope.kind === 'partner' ? sql`s.print_partner_id = ${scope.partnerId}` : sql`true`);

  /**
   * قلم‌ها با موجودی، نام کاغذ، «در تعرفه» و نیاز صف. نیاز صف فقط برای چاپخانه‌های همین قلم‌ها حساب می‌شود (`order_paper_sheets` برای هر
   * سفارش در صف)، و نام از نسخه‌های فعال‌شده، نه پیش‌نویس.
   */
  async function itemsWhere(reader: Reader, where: SQL): Promise<StockItem[]> {
    const rows = await reader.execute<ItemRow>(sql`
      WITH picked AS (SELECT s.* FROM paper_stock_items s WHERE ${where}),
      bal AS (
        SELECT m.item_id, sum(m.delta_sheets)::bigint AS balance, max(m.created_at) AS last_at
          FROM paper_stock_moves m WHERE m.item_id IN (SELECT id FROM picked) GROUP BY m.item_id
      ),
      names AS (
        SELECT DISTINCT ON (pt.id) pt.id, pt.name_fa
          FROM paper_types pt JOIN price_lists pl ON pl.version = pt.price_list_version
         WHERE pl.activated_at IS NOT NULL AND pt.id IN (SELECT paper_type_id FROM picked)
         ORDER BY pt.id, pl.is_active DESC, pl.version DESC
      ),
      offered AS (
        SELECT r.paper_type_id, r.paper_size
          FROM paper_rates r
          JOIN price_lists pl ON pl.version = r.price_list_version AND pl.is_active
          JOIN paper_types pt ON pt.price_list_version = r.price_list_version AND pt.id = r.paper_type_id AND pt.enabled
      ),
      queued AS (
        SELECT o.print_partner_id AS partner, n.paper_type_id, n.paper_size,
               sum(n.sheets)::bigint AS sheets, count(DISTINCT o.id)::int AS orders
          FROM orders o CROSS JOIN LATERAL order_paper_sheets(o.id) n
         WHERE o.status = 'paid' AND o.print_partner_id IN (SELECT print_partner_id FROM picked)
         GROUP BY o.print_partner_id, n.paper_type_id, n.paper_size
      )
      SELECT s.id, s.print_partner_id AS partner_id, s.paper_type_id, s.paper_size, s.threshold_sheets, s.created_at::text AS created_at,
             coalesce(b.balance, 0)::text AS balance, b.last_at::text AS last_at, nm.name_fa AS paper_name,
             (f.paper_type_id IS NOT NULL) AS in_tariff,
             coalesce(q.sheets, 0)::text AS queued_sheets, coalesce(q.orders, 0) AS queued_orders
        FROM picked s
        LEFT JOIN bal b ON b.item_id = s.id
        LEFT JOIN names nm ON nm.id = s.paper_type_id
        LEFT JOIN offered f ON f.paper_type_id = s.paper_type_id AND f.paper_size = s.paper_size
        LEFT JOIN queued q ON q.partner = s.print_partner_id AND q.paper_type_id = s.paper_type_id AND q.paper_size = s.paper_size`);
    return rows.map(itemOf).sort(byPaper);
  }

  async function itemById(reader: Reader, id: string): Promise<StockItem | null> {
    const [item] = await itemsWhere(reader, sql`s.id = ${id}`);
    return item ?? null;
  }

  /** ردیف‌های یک قلم با موجودی پس از هر کدام، تازه‌ترین اول. */
  async function movesOf(reader: Reader, itemId: string, where: SQL, page: { limit: number; offset: number }): Promise<StockMove[]> {
    const rows = await reader.execute<MoveRow>(sql`
      SELECT x.* FROM (
        SELECT m.id::text AS id, m.item_id, m.kind, m.delta_sheets, m.counted_sheets,
               sum(m.delta_sheets) OVER (ORDER BY m.id)::text AS balance,
               o.order_number, m.note, m.created_at::text AS created_at, m.created_by, a.display_name AS created_by_name,
               EXISTS (SELECT 1 FROM paper_stock_moves u WHERE u.undoes = m.id) AS undone
          FROM paper_stock_moves m
          LEFT JOIN orders o ON o.id = m.order_id
          LEFT JOIN admin_users a ON a.id = m.created_by
         WHERE m.item_id = ${itemId}
      ) x
      WHERE ${where}
      ORDER BY x.id::bigint DESC
      LIMIT ${page.limit} OFFSET ${page.offset}`);
    return rows.map(moveOf);
  }

  async function moveById(reader: Reader, itemId: string, id: number): Promise<StockMove | null> {
    const [move] = await movesOf(reader, itemId, sql`x.id::bigint = ${id}`, { limit: 1, offset: 0 });
    return move ?? null;
  }

  /** قلم را برای نوشتن قفل می‌کند، در محدوده؛ null یعنی نیست. همان قفلی که محافظ پیش از هر درج می‌گیرد. */
  async function lockItem(tx: Tx, scope: PanelScope, itemId: string) {
    const [row] = await tx
      .select({
        id: paperStockItems.id,
        partnerId: paperStockItems.printPartnerId,
        partnerName: printPartners.name,
        paperTypeId: paperStockItems.paperTypeId,
        paperSize: paperStockItems.paperSize,
        thresholdSheets: paperStockItems.thresholdSheets,
      })
      .from(paperStockItems)
      .innerJoin(printPartners, eq(printPartners.id, paperStockItems.printPartnerId))
      .where(
        and(
          eq(paperStockItems.id, itemId),
          scope.kind === 'partner' ? eq(paperStockItems.printPartnerId, scope.partnerId) : undefined,
        ),
      )
      .limit(1)
      .for('no key update', { of: paperStockItems });
    return row ?? null;
  }

  /** کاغذهای روشن تعرفهٔ فعال با اندازه‌هایی که نرخ دارند. */
  async function offeredPapers(reader: Reader): Promise<StockPaperChoice[]> {
    const rows = await reader.execute<{ id: string; name: string; sizes: PaperSize[] }>(sql`
      SELECT pt.id, pt.name_fa AS name, array_agg(r.paper_size::text ORDER BY r.paper_size) AS sizes
        FROM paper_types pt
        JOIN price_lists pl ON pl.version = pt.price_list_version AND pl.is_active
        JOIN paper_rates r ON r.price_list_version = pt.price_list_version AND r.paper_type_id = pt.id
       WHERE pt.enabled
       GROUP BY pt.id, pt.name_fa`);
    return rows
      .map((row) => ({ id: row.id, name: row.name, sizes: [...row.sizes].sort((a, b) => SIZE_ORDER[a] - SIZE_ORDER[b]) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }

  async function partnersIn(reader: Reader, scope: PanelScope, partnerId: string | null): Promise<StockPartner[]> {
    return reader
      .select(partnerFields)
      .from(printPartners)
      .innerJoin(cities, eq(cities.id, printPartners.cityId))
      .where(
        and(
          scope.kind === 'partner' ? eq(printPartners.id, scope.partnerId) : undefined,
          partnerId === null ? undefined : eq(printPartners.id, partnerId),
        ),
      )
      .orderBy(partnerOrder);
  }

  /** جزئیات مشترک رویدادهای موجودی: قلم، چاپخانه، کاغذ و اندازه. */
  const itemDetail = (item: StockItem, partner: { id: string; name: string }) => ({
    item: item.id,
    partner,
    paper: { id: item.paperTypeId, name: item.paperName },
    size: item.paperSize,
  });

  return {
    async overview(scope) {
      return db.transaction(
        async (tx) => {
          const [partners, items] = await Promise.all([partnersIn(tx, scope, null), itemsWhere(tx, scoped(scope))]);
          const itemsBy = new Map<string, StockItem[]>();
          for (const item of items) itemsBy.set(item.partnerId, [...(itemsBy.get(item.partnerId) ?? []), item]);
          return partners
            .filter((partner) => partner.active || itemsBy.has(partner.id))
            .map((partner) => ({ partner, items: itemsBy.get(partner.id) ?? [] }));
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },

    async partner(scope, partnerId) {
      return db.transaction(
        async (tx) => {
          const [partner] = await partnersIn(tx, scope, partnerId);
          if (!partner) return null;
          return { partner, items: await itemsWhere(tx, sql`s.print_partner_id = ${partnerId}`) };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },

    async item(scope, itemId, page) {
      return db.transaction(
        async (tx) => {
          const [item] = await itemsWhere(tx, sql`s.id = ${itemId} AND ${scoped(scope)}`);
          if (!item) return null;
          const [[partner], moves, [count]] = await Promise.all([
            partnersIn(tx, scope, item.partnerId),
            movesOf(tx, itemId, sql`true`, page),
            tx.select({ total: sql<number>`count(*)::int` }).from(paperStockMoves).where(eq(paperStockMoves.itemId, itemId)),
          ]);
          return { partner: partner!, item, moves, total: count?.total ?? 0 };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },

    async papers() {
      return offeredPapers(db);
    },

    async track(scope, input) {
      return db.transaction(async (tx): Promise<TrackWrite> => {
        if (scope.kind === 'partner' && scope.partnerId !== input.partnerId) return { ok: false, reason: 'not_found' };
        const [partner] = await tx
          .select({ id: printPartners.id, name: printPartners.name })
          .from(printPartners)
          .where(eq(printPartners.id, input.partnerId))
          .limit(1)
          .for('key share');
        if (!partner) return { ok: false, reason: 'not_found' };
        // همان فرم پیش‌تر قلم را ساخت (دو کلیک، یا فرستادن دوباره پس از پاسخی که نرسید): فقط اگر همان قلم و همان شمارش است.
        const [earlier] = await tx
          .select({
            itemId: paperStockMoves.itemId,
            kind: paperStockMoves.kind,
            countedSheets: paperStockMoves.countedSheets,
            createdBy: paperStockMoves.createdBy,
            partnerId: paperStockItems.printPartnerId,
            paperTypeId: paperStockItems.paperTypeId,
            paperSize: paperStockItems.paperSize,
            thresholdSheets: paperStockItems.thresholdSheets,
          })
          .from(paperStockMoves)
          .innerJoin(paperStockItems, eq(paperStockItems.id, paperStockMoves.itemId))
          .where(eq(paperStockMoves.requestId, input.requestId))
          .limit(1);
        if (earlier) {
          const same =
            earlier.kind === 'count' &&
            earlier.partnerId === input.partnerId &&
            earlier.paperTypeId === input.paperTypeId &&
            earlier.paperSize === input.paperSize &&
            earlier.countedSheets === input.countedSheets &&
            earlier.thresholdSheets === input.thresholdSheets &&
            earlier.createdBy === input.event.adminUserId;
          if (!same) return { ok: false, reason: 'conflict' };
          return { ok: true, item: (await itemById(tx, earlier.itemId))!, duplicate: true };
        }
        const offered = await offeredPapers(tx);
        if (!offered.some((paper) => paper.id === input.paperTypeId && paper.sizes.includes(input.paperSize))) {
          return { ok: false, reason: 'paper_not_found' };
        }
        const [created] = await tx
          .insert(paperStockItems)
          .values({
            printPartnerId: input.partnerId,
            paperTypeId: input.paperTypeId,
            paperSize: input.paperSize,
            thresholdSheets: input.thresholdSheets,
            createdBy: input.event.adminUserId!,
            createdAt: input.at,
          })
          .onConflictDoNothing()
          .returning({ id: paperStockItems.id });
        if (!created) {
          const [existing] = await tx
            .select({ id: paperStockItems.id })
            .from(paperStockItems)
            .where(
              and(
                eq(paperStockItems.printPartnerId, input.partnerId),
                eq(paperStockItems.paperTypeId, input.paperTypeId),
                eq(paperStockItems.paperSize, input.paperSize),
              ),
            )
            .limit(1);
          return { ok: false, reason: 'exists', itemId: existing!.id };
        }
        // تغییر شمارش را محافظ از موجودی (صفر) می‌نشاند؛ صفر اینجا فقط جای خالی است.
        await tx.insert(paperStockMoves).values({
          itemId: created.id,
          kind: 'count',
          deltaSheets: 0,
          countedSheets: input.countedSheets,
          note: STOCK_FIRST_COUNT_NOTE,
          createdBy: input.event.adminUserId,
          createdAt: input.at,
          requestId: input.requestId,
        });
        const item = (await itemById(tx, created.id))!;
        await tx.insert(adminEvents).values(
          withDetail(input.event, {
            ...itemDetail(item, partner),
            countedSheets: input.countedSheets,
            thresholdSheets: input.thresholdSheets,
          }),
        );
        return { ok: true, item, duplicate: false };
      });
    },

    async record(scope, input) {
      return db.transaction(async (tx): Promise<MoveWrite> => {
        const locked = await lockItem(tx, scope, input.itemId);
        if (!locked) return { ok: false, reason: 'not_found' };
        const [earlier] = await tx
          .select({
            id: paperStockMoves.id,
            itemId: paperStockMoves.itemId,
            kind: paperStockMoves.kind,
            deltaSheets: paperStockMoves.deltaSheets,
            countedSheets: paperStockMoves.countedSheets,
            note: paperStockMoves.note,
            createdBy: paperStockMoves.createdBy,
          })
          .from(paperStockMoves)
          .where(eq(paperStockMoves.requestId, input.requestId))
          .limit(1);
        if (earlier) {
          const same =
            earlier.itemId === input.itemId &&
            earlier.kind === input.kind &&
            earlier.note === input.note &&
            earlier.createdBy === input.event.adminUserId &&
            (input.kind === 'count' ? earlier.countedSheets === input.sheets : Math.abs(earlier.deltaSheets) === input.sheets);
          if (!same) return { ok: false, reason: 'conflict' };
          return {
            ok: true,
            move: (await moveById(tx, input.itemId, earlier.id))!,
            item: (await itemById(tx, input.itemId))!,
            duplicate: true,
          };
        }
        const [row] = await tx
          .insert(paperStockMoves)
          .values({
            itemId: input.itemId,
            kind: input.kind,
            // شمارش: تغییر را محافظ می‌نشاند.
            deltaSheets: input.kind === 'purchase' ? input.sheets : input.kind === 'waste' ? -input.sheets : 0,
            countedSheets: input.kind === 'count' ? input.sheets : null,
            note: input.note,
            createdBy: input.event.adminUserId,
            createdAt: input.at,
            requestId: input.requestId,
          })
          .returning({ id: paperStockMoves.id, deltaSheets: paperStockMoves.deltaSheets });
        const item = (await itemById(tx, input.itemId))!;
        await tx.insert(adminEvents).values(
          withDetail(input.event, {
            ...itemDetail(item, { id: locked.partnerId, name: locked.partnerName }),
            deltaSheets: row!.deltaSheets,
            ...(input.kind === 'count' ? { countedSheets: input.sheets } : {}),
            balanceSheets: item.balanceSheets,
          }),
        );
        return { ok: true, move: (await moveById(tx, input.itemId, row!.id))!, item, duplicate: false };
      });
    },

    async setThreshold(scope, input) {
      return db.transaction(async (tx): Promise<ThresholdWrite> => {
        const locked = await lockItem(tx, scope, input.itemId);
        if (!locked) return { ok: false, reason: 'not_found' };
        if (locked.thresholdSheets === input.thresholdSheets) {
          return { ok: true, item: (await itemById(tx, input.itemId))!, changed: false };
        }
        await tx
          .update(paperStockItems)
          .set({ thresholdSheets: input.thresholdSheets })
          .where(eq(paperStockItems.id, input.itemId));
        const item = (await itemById(tx, input.itemId))!;
        await tx.insert(adminEvents).values(
          withDetail(input.event, {
            ...itemDetail(item, { id: locked.partnerId, name: locked.partnerName }),
            from: locked.thresholdSheets,
            to: input.thresholdSheets,
          }),
        );
        return { ok: true, item, changed: true };
      });
    },

    async alerts(scope) {
      return db.transaction(
        async (tx) => {
          const partners = (await partnersIn(tx, scope, null)).filter((partner) => partner.active);
          if (partners.length === 0) return [];
          const names = new Map(partners.map((partner) => [partner.id, partner.name]));
          const items = await itemsWhere(
            tx,
            sql`${scoped(scope)} AND s.print_partner_id IN (SELECT id FROM print_partners WHERE deactivated_at IS NULL)`,
          );
          const order = new Map(partners.map((partner, index) => [partner.id, index]));
          return items
            .map((item) => ({
              partner: { id: item.partnerId, name: names.get(item.partnerId) ?? '' },
              item,
              negative: item.balanceSheets < 0,
              belowThreshold: item.thresholdSheets !== null && item.balanceSheets < item.thresholdSheets,
              // فقط وقتی صفی هست: قلم منفی بی سفارش در صف «منفی» است، نه «کمتر از نیاز صف».
              shortForQueue: item.queued.sheets > 0 && item.queued.sheets > item.balanceSheets,
            }))
            .filter((alert) => alert.negative || alert.belowThreshold || alert.shortForQueue)
            .sort((a, b) => (order.get(a.partner.id) ?? 0) - (order.get(b.partner.id) ?? 0) || byPaper(a.item, b.item));
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
    },
  };
}

/** نام اندازه برای متن پنل و رویداد. */
export const PAPER_SIZE_LABEL: Record<PaperSize, string> = { a4: 'A4', a5: 'A5', a3: 'A3' };
