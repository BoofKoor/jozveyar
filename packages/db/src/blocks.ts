/**
 * مسدودی موبایل مشتری در پنل (برش ۱۲٫۲، ADR-063، سؤال ۲۱۲): مسدود کردن با دلیل، رفع مسدودی، و فهرست. اثرش جای دیگری است: کد پیامکی
 * (`issueOtp`)، سفارش تازه و تلاش پرداخت تازه (`mobileBlocked` و محافظ‌های 0050).
 *
 * - شمارهٔ مسدود موبایل تأییدشدهٔ صاحب سفارش است (`users.mobile`، همان که کد پیامکی و محافظ‌ها می‌سنجند)، نه چیزی که فرم می‌فرستد:
 *   از صفحهٔ سفارش، سرویس اول صاحب سفارش را در محدوده پیدا می‌کند (`orderOwner`).
 * - هر کار با رویدادش در یک تراکنش. دو کلیک یک مسدودی است: شمارهٔ مسدود با همان ادمین و همان دلیل همان مسدودی است (`already`)، و با کس دیگری
 *   یا دلیل دیگری `already_blocked`، تا دلیل تازه بی‌صدا گم نشود. رفع مسدودی همان ردیفی است که ادمین دید؛ رفع‌شده از پیش هم `already`.
 */

import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { ordersInScope, type PanelScope } from './panel.js';
import { adminEvents, adminUsers, mobileBlocks, orders, users } from './schema.js';

export interface MobileBlockView {
  id: string;
  mobile: string;
  /** فقط پنل؛ مشتری هرگز نمی‌بیند. */
  reason: string;
  /** سفارشی که مسدودی از صفحه‌اش آمد؛ null از فهرست. */
  orderNumber: number | null;
  blockedAt: Date;
  blockedBy: string;
  blockedByName: string | null;
  unblockedAt: Date | null;
  unblockedByName: string | null;
}

export type BlockOutcome =
  | { ok: true; block: MobileBlockView; already: boolean }
  | { ok: false; reason: 'already_blocked'; block: MobileBlockView };

export type UnblockOutcome = { ok: true; block: MobileBlockView; already: boolean } | { ok: false; reason: 'not_found' };

export interface BlockStore {
  /** موبایل تأییدشدهٔ صاحب سفارش، در محدوده؛ null یعنی چنین سفارشی (در این محدوده) نیست. */
  orderOwner(scope: PanelScope, orderNumber: number): Promise<{ orderId: string; orderNumber: number; mobile: string } | null>;
  /** مسدودی زندهٔ هر کدام از این شماره‌ها، کلید موبایل. */
  live(mobiles: readonly string[]): Promise<Map<string, MobileBlockView>>;
  /** یک مسدودی، زنده یا رفع‌شده. */
  get(id: string): Promise<MobileBlockView | null>;
  /** همهٔ مسدودی‌های زنده، تازه‌ترین اول، و آخرین `pastLimit` رفع‌شده، تازه‌ترین رفع اول. */
  list(pastLimit: number): Promise<{ live: MobileBlockView[]; past: MobileBlockView[] }>;
  /** مسدود کردن، با رویداد `event` (شناسهٔ ردیف تازه هدفش می‌شود) در همان تراکنش. */
  block(input: { mobile: string; reason: string; orderNumber: number | null; event: AdminEventInput }): Promise<BlockOutcome>;
  /** رفع همین مسدودی، با رویداد در همان تراکنش. */
  unblock(input: { id: string; event: AdminEventInput }): Promise<UnblockOutcome>;
}

const blocker = alias(adminUsers, 'blocker');
const unblocker = alias(adminUsers, 'unblocker');

const fields = {
  id: mobileBlocks.id,
  mobile: mobileBlocks.mobile,
  reason: mobileBlocks.reason,
  orderNumber: mobileBlocks.orderNumber,
  blockedAt: mobileBlocks.blockedAt,
  blockedBy: mobileBlocks.blockedBy,
  blockedByName: blocker.displayName,
  unblockedAt: mobileBlocks.unblockedAt,
  unblockedByName: unblocker.displayName,
};

export function createBlockStore({ db }: Database): BlockStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const views = (tx: Tx | typeof db) =>
    tx
      .select(fields)
      .from(mobileBlocks)
      .leftJoin(blocker, eq(blocker.id, mobileBlocks.blockedBy))
      .leftJoin(unblocker, eq(unblocker.id, mobileBlocks.unblockedBy));

  return {
    async orderOwner(scope, orderNumber) {
      const [row] = await db
        .select({ orderId: orders.id, orderNumber: orders.orderNumber, mobile: users.mobile })
        .from(orders)
        .innerJoin(users, eq(users.id, orders.userId))
        .where(and(eq(orders.orderNumber, orderNumber), ordersInScope(scope)))
        .limit(1);
      return row ?? null;
    },

    async live(mobiles) {
      if (mobiles.length === 0) return new Map();
      const rows = await views(db).where(and(inArray(mobileBlocks.mobile, [...mobiles]), isNull(mobileBlocks.unblockedAt)));
      return new Map(rows.map((row) => [row.mobile, row]));
    },

    async get(id) {
      const [row] = await views(db).where(eq(mobileBlocks.id, id)).limit(1);
      return row ?? null;
    },

    async list(pastLimit) {
      const [live, past] = await Promise.all([
        views(db).where(isNull(mobileBlocks.unblockedAt)).orderBy(desc(mobileBlocks.blockedAt), desc(mobileBlocks.id)),
        views(db)
          .where(isNotNull(mobileBlocks.unblockedAt))
          .orderBy(desc(mobileBlocks.unblockedAt), desc(mobileBlocks.id))
          .limit(pastLimit),
      ]);
      return { live, past };
    },

    async block({ mobile, reason, orderNumber, event }) {
      return db.transaction(async (tx) => {
        // دور دوم فقط وقتی است که مسدودی زنده‌ای که درج را نگذاشت، پیش از خواندنش رفع شد.
        for (let round = 0; round < 3; round++) {
          const [inserted] = await tx
            .insert(mobileBlocks)
            .values({ mobile, reason, orderNumber, blockedBy: event.adminUserId!, blockedAt: event.at })
            .onConflictDoNothing()
            .returning({ id: mobileBlocks.id });
          if (inserted) {
            await tx.insert(adminEvents).values(adminEventRow({ ...event, targetType: 'mobile_block', targetId: inserted.id }));
            const [block] = await views(tx).where(eq(mobileBlocks.id, inserted.id));
            return { ok: true, block: block!, already: false } as const;
          }
          // شمارهٔ مسدود (`mobile_blocks_live`): دو کلیک همان ادمین با همان دلیل همان مسدودی است.
          const [block] = await views(tx).where(and(eq(mobileBlocks.mobile, mobile), isNull(mobileBlocks.unblockedAt)));
          if (!block) continue;
          if (block.blockedBy === event.adminUserId && block.reason === reason) return { ok: true, block, already: true } as const;
          return { ok: false, reason: 'already_blocked', block } as const;
        }
        throw new Error('مسدودی ساخته نشد: شماره پشت‌سرهم مسدود و رفع شد.');
      });
    },

    async unblock({ id, event }) {
      return db.transaction(async (tx) => {
        const [closed] = await tx
          .update(mobileBlocks)
          .set({ unblockedAt: event.at, unblockedBy: event.adminUserId })
          .where(and(eq(mobileBlocks.id, id), isNull(mobileBlocks.unblockedAt)))
          .returning({ id: mobileBlocks.id });
        if (closed) await tx.insert(adminEvents).values(adminEventRow({ ...event, targetType: 'mobile_block', targetId: id }));
        const [block] = await views(tx).where(eq(mobileBlocks.id, id));
        if (!block) return { ok: false, reason: 'not_found' } as const;
        return { ok: true, block, already: !closed } as const;
      });
    },
  };
}
