/**
 * نسخه‌های تعرفه در پنل ادمین (برش ۴٫۵، ADR-040): فهرست نسخه‌ها با شمار سفارش‌هایشان، پیش‌نویس از روی نسخهٔ فعال،
 * ذخیره و پاک کردنش، و فعال کردن یک نسخه: پیش‌نویس، یا نسخهٔ قبل برای برگشت.
 *
 * مثل بقیهٔ این پکیج فقط خواندن و نوشتن است؛ سنجش پیش‌نویس، متن‌ها، مجوز و کد تازه در سرویس تعرفهٔ پنل
 * (`apps/admin/lib/server/tariff.ts`). آنچه اینجاست همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **یک قفل:** ساختن، ذخیره، پاک کردن و فعال کردن زیر یک قفل مشورتی. دو «نسخهٔ تازه» هم‌زمان یک پیش‌نویس
 *    می‌سازند، نه دو شمارهٔ تکراری؛ و دو فعال‌سازی هم‌زمان پشت‌سرهم‌اند، پس دومی تعرفهٔ فعال تازه را می‌بیند و به جای
 *    خطای ایندکس یکتا «عوض شد» می‌گیرد.
 *  - **یک تراکنش:** هر کار با رویداد ادمینش؛ و فعال شدن، خاموش شدن نسخهٔ قبل و رویداد با هم.
 *  - **همان که دیده شد:** ذخیره و فعال‌سازی محتوای امروز نسخه را زیر قفل به `verify` سرویس می‌دهند؛ اگر از وقتی
 *    ادمین صفحه را دید عوض شده، کار انجام نمی‌شود.
 *  - تغییرناپذیری نسخهٔ فعال‌شده و ردیف‌هایش را خود پایگاه داده هم می‌سنجد (تریگرهای 0013).
 */

import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PriceList } from '@jozveyar/contracts';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { priceListToRows } from './price-list.js';
import {
  adminEvents,
  adminUsers,
  bindingRateBands,
  bindingTypes,
  orders,
  paperTypes,
  priceLists,
  shippingMethods,
  shippingRates,
} from './schema.js';
import { insertPriceListRows, readPriceList } from './seed.js';

/** کلید قفل مشورتی کارهای تعرفه: «tarf» به عدد. */
const TARIFF_LOCK = 0x74617266;

/** هدف رویدادهای تعرفه در `admin_events`؛ شناسهٔ هدف شمارهٔ نسخه است. */
export const TARIFF_TARGET = 'price_list';

export interface TariffVersion {
  version: number;
  label: string;
  isActive: boolean;
  /** اولین فعال شدن؛ null یعنی پیش‌نویس. */
  activatedAt: Date | null;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
  basedOn: number | null;
  /** سفارش‌هایی که قیمتشان با این نسخه منجمد شده، هر وضعیتی. */
  orders: number;
}

/** یک فعال شدن: اولین بار (`activated_at`)، یا هر فعال کردن از پنل (رویداد `tariff.activate`). */
export interface TariffActivation {
  version: number;
  at: Date;
  /** ادمینی که فعال کرد؛ null برای تعرفهٔ پایه، که با بالا آمدن وب فعال شد. */
  adminName: string | null;
}

/** کنندهٔ کار، برای رویداد. */
export interface TariffActor {
  adminUserId: string;
  ipHash: string | null;
}

export type TariffActivateResult =
  | { ok: true; already: boolean; previous: number | null }
  | { ok: false; reason: 'not_found' | 'changed'; active: number | null };

export interface TariffStore {
  /** همهٔ نسخه‌ها، تازه‌ترین اول. */
  versions(): Promise<TariffVersion[]>;
  /** همهٔ فعال شدن‌ها، به ترتیب زمان. */
  activations(): Promise<TariffActivation[]>;
  load(version: number): Promise<PriceList | null>;
  /**
   * «نسخهٔ تازه»: پیش‌نویسی که هست، یا پیش‌نویس تازه از روی نسخهٔ فعال با شمارهٔ بعدی، با رویداد. هر بار یک
   * پیش‌نویس (`created: false` یعنی همان که بود).
   */
  createDraft(input: { at: Date; label: string; actor: TariffActor }): Promise<{ version: number; created: boolean }>;
  /** پیش‌نویس به جای خودش، با رویداد؛ فقط اگر هنوز پیش‌نویس است و `verify` محتوای امروزش را می‌پذیرد. */
  saveDraft(input: {
    list: PriceList;
    verify: (current: PriceList) => boolean;
    at: Date;
    actor: TariffActor;
  }): Promise<'ok' | 'not_draft' | 'changed'>;
  /** پیش‌نویس با ردیف‌هایش پاک، با رویداد. نسخهٔ فعال‌شده نه. */
  deleteDraft(input: { version: number; at: Date; actor: TariffActor }): Promise<'ok' | 'not_draft'>;
  /**
   * فعال کردن یک نسخه، اگر نسخهٔ فعال همان است که ادمین دید (`expectedActive`) و `verify` محتوای امروز نسخه را
   * می‌پذیرد: نسخهٔ قبل خاموش، این یکی روشن (زمان اولین فعال شدن فقط بار اول)، و رویداد. نسخه‌ای که همین حالا فعال
   * است موفق است، بی کار دوباره (دو کلیک).
   */
  activate(input: {
    version: number;
    expectedActive: number | null;
    verify: (list: PriceList) => boolean;
    at: Date;
    actor: TariffActor;
  }): Promise<TariffActivateResult>;
}

export function createTariffStore({ db }: Database): TariffStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const asDb = (tx: Tx) => tx as unknown as Database['db'];
  const lock = (tx: Tx) => tx.execute(sql`SELECT pg_advisory_xact_lock(${TARIFF_LOCK})`);

  const event = (actor: TariffActor, action: string, version: number, at: Date, detail: Record<string, unknown>) =>
    adminEventRow({
      adminUserId: actor.adminUserId,
      action,
      targetType: TARIFF_TARGET,
      targetId: String(version),
      ipHash: actor.ipHash,
      detail: { version, ...detail },
      at,
    });

  /** سرِ نسخه زیر قفل ردیف؛ null اگر نیست. */
  async function head(tx: Tx, version: number) {
    const [row] = await tx
      .select({ version: priceLists.version, activatedAt: priceLists.activatedAt, isActive: priceLists.isActive })
      .from(priceLists)
      .where(eq(priceLists.version, version))
      .for('update');
    return row ?? null;
  }

  return {
    async versions() {
      const [rows, counts] = await Promise.all([
        db
          .select({ list: priceLists, name: adminUsers.displayName })
          .from(priceLists)
          .leftJoin(adminUsers, eq(adminUsers.id, priceLists.createdBy))
          .orderBy(desc(priceLists.version)),
        db.select({ version: orders.priceListVersion, n: count() }).from(orders).groupBy(orders.priceListVersion),
      ]);
      const ordersOf = new Map(counts.map((row) => [row.version, row.n]));
      return rows.map(({ list, name }) => ({
        version: list.version,
        label: list.label,
        isActive: list.isActive,
        activatedAt: list.activatedAt,
        createdAt: list.createdAt,
        createdBy: list.createdBy ? { id: list.createdBy, name: name ?? '' } : null,
        basedOn: list.basedOn,
        orders: ordersOf.get(list.version) ?? 0,
      }));
    },

    async activations() {
      const [first, fromPanel] = await Promise.all([
        db
          .select({ version: priceLists.version, at: priceLists.activatedAt })
          .from(priceLists)
          .where(isNotNull(priceLists.activatedAt)),
        db
          .select({ targetId: adminEvents.targetId, at: adminEvents.at, name: adminUsers.displayName })
          .from(adminEvents)
          .leftJoin(adminUsers, eq(adminUsers.id, adminEvents.adminUserId))
          .where(and(eq(adminEvents.targetType, TARIFF_TARGET), eq(adminEvents.action, 'tariff.activate')))
          .orderBy(asc(adminEvents.at), asc(adminEvents.id)),
      ]);
      const moments: TariffActivation[] = fromPanel.map((row) => ({ version: Number(row.targetId), at: row.at, adminName: row.name }));
      const seen = new Set(moments.map((m) => `${m.version}@${m.at.getTime()}`));
      // اولین فعال شدنی که از پنل نبود (تعرفهٔ پایه، یا نسخه‌ای که پیش از ۴٫۵ فعال شد).
      for (const row of first) {
        if (row.at && !seen.has(`${row.version}@${row.at.getTime()}`)) moments.push({ version: row.version, at: row.at, adminName: null });
      }
      return moments.sort((a, b) => a.at.getTime() - b.at.getTime());
    },

    load: (version) => readPriceList(db, version),

    async createDraft(input) {
      return db.transaction(async (tx) => {
        await lock(tx);
        const [draft] = await tx
          .select({ version: priceLists.version })
          .from(priceLists)
          .where(isNull(priceLists.activatedAt))
          .orderBy(desc(priceLists.version))
          .limit(1);
        if (draft) return { version: draft.version, created: false };

        const [active] = await tx.select({ version: priceLists.version }).from(priceLists).where(eq(priceLists.isActive, true)).limit(1);
        if (!active) throw new Error('هیچ تعرفهٔ فعالی نیست؛ پیش‌نویس از روی چه ساخته شود؟');
        const base = await readPriceList(asDb(tx), active.version);
        const [max] = await tx.select({ top: sql<number>`coalesce(max(${priceLists.version}), 0)::int` }).from(priceLists);
        const version = (max?.top ?? 0) + 1;
        const rows = priceListToRows({ ...base!, version, label: input.label }, false);
        await tx
          .insert(priceLists)
          .values({ ...rows.priceList, createdAt: input.at, createdBy: input.actor.adminUserId, basedOn: active.version });
        await insertPriceListRows(asDb(tx), rows);
        await tx.insert(adminEvents).values(event(input.actor, 'tariff.draft', version, input.at, { from: active.version }));
        return { version, created: true };
      });
    },

    async saveDraft(input) {
      const { version } = input.list;
      return db.transaction(async (tx) => {
        await lock(tx);
        const row = await head(tx, version);
        if (!row || row.activatedAt) return 'not_draft' as const;
        const current = await readPriceList(asDb(tx), version);
        if (!current || !input.verify(current)) return 'changed' as const;

        const rows = priceListToRows(input.list, false);
        await tx
          .update(priceLists)
          .set({
            label: rows.priceList.label,
            clickRateColorRials: rows.priceList.clickRateColorRials,
            clickRateBwRials: rows.priceList.clickRateBwRials,
            settings: rows.priceList.settings,
          })
          .where(eq(priceLists.version, version));
        // ردیف‌های پیش‌نویس از نو: فرزند پیش از پدر، همان ترتیب کلیدهای خارجی.
        await tx.delete(shippingRates).where(eq(shippingRates.priceListVersion, version));
        await tx.delete(shippingMethods).where(eq(shippingMethods.priceListVersion, version));
        await tx.delete(bindingRateBands).where(eq(bindingRateBands.priceListVersion, version));
        await tx.delete(bindingTypes).where(eq(bindingTypes.priceListVersion, version));
        await tx.delete(paperTypes).where(eq(paperTypes.priceListVersion, version));
        await insertPriceListRows(asDb(tx), rows);
        await tx.insert(adminEvents).values(event(input.actor, 'tariff.draft_save', version, input.at, {}));
        return 'ok' as const;
      });
    },

    async deleteDraft(input) {
      return db.transaction(async (tx) => {
        await lock(tx);
        const row = await head(tx, input.version);
        if (!row || row.activatedAt) return 'not_draft' as const;
        await tx.delete(priceLists).where(eq(priceLists.version, input.version));
        await tx.insert(adminEvents).values(event(input.actor, 'tariff.draft_delete', input.version, input.at, {}));
        return 'ok' as const;
      });
    },

    async activate(input) {
      return db.transaction(async (tx) => {
        await lock(tx);
        const [current] = await tx
          .select({ version: priceLists.version })
          .from(priceLists)
          .where(eq(priceLists.isActive, true))
          .for('update');
        const active = current?.version ?? null;
        if (active === input.version) return { ok: true, already: true, previous: active } as const;
        const target = await head(tx, input.version);
        if (!target) return { ok: false, reason: 'not_found', active } as const;
        if (active !== input.expectedActive) return { ok: false, reason: 'changed', active } as const;
        const list = await readPriceList(asDb(tx), input.version);
        if (!list || !input.verify(list)) return { ok: false, reason: 'changed', active } as const;

        if (active !== null) await tx.update(priceLists).set({ isActive: false }).where(eq(priceLists.version, active));
        await tx
          .update(priceLists)
          .set({ isActive: true, activatedAt: sql`coalesce(${priceLists.activatedAt}, ${input.at.toISOString()}::timestamptz)` })
          .where(eq(priceLists.version, input.version));
        await tx
          .insert(adminEvents)
          .values(event(input.actor, 'tariff.activate', input.version, input.at, { previous: active, again: target.activatedAt !== null }));
        return { ok: true, already: false, previous: active } as const;
      });
    },
  };
}
