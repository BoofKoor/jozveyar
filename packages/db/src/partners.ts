/**
 * چاپخانه‌ها در پنل (برش ۵٫۲، ADR-042): ذخیره‌گاه زبانهٔ «چاپخانه‌ها»؛ مالک فهرست می‌بیند، می‌افزاید، نام و شهر را ویرایش
 * می‌کند، پیش‌فرض را عوض می‌کند، و غیرفعال یا دوباره فعال می‌کند. تخصیص سفارش در پرداخت در `assignment.ts` است، و جابه‌جایی
 * سفارش در `panel.ts`.
 *
 * - **مدیریت** زیر یک قفل مشورتی: پیش‌فرض کردن دو ردیف را پشت‌سرهم عوض می‌کند و دو کلیک هم‌زمان نباید به محدودیت «حداکثر یک
 *   پیش‌فرض» بخورند. غیرفعال کردن با سفارش باز و پاک کردن را تریگر `print_partners_guard` هم رد می‌کند (0018).
 * - **برگه:** نام و شهر چاپخانه روی برگهٔ سفارش است (`order_ticket_stamp`)، پس ویرایش نام یا شهر کار برگهٔ سفارش‌های باز همان
 *   چاپخانه را در همان تراکنش دوباره در صف می‌گذارد؛ ردیف آن سفارش‌ها قفل می‌شود تا کارگری که همین حالا برگه می‌سازد، اثر
 *   انگشت را پس از این تغییر بسنجد (مثل ویرایش گیرنده، `panel.ts`).
 * - **موبایل اعلان** (برش ۷٫۶، سؤال‌های ۱۲۶ و ۱۷۷): اختیاری، از همان فرم و با همان «همان که دیدی» نام و شهر. روی برگه نیست، پس
 *   عوض شدنش کار برگه نمی‌سازد؛ شمارهٔ تازه فقط برای سفارش‌های بعدی است (پیامک‌های ساخته‌شده و «دوباره بفرست»شان همان شمارهٔ خودشان).
 *   شماره در رویداد پوشیده است و پوشاندنش با سرویس پنل (`detail` رویداد)، نه اینجا.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { adminEventRow, PARTNER_ROLE, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { requeueTicket } from './orders.js';
import { adminEvents, adminUserRoles, adminUsers, cities, orderAssignments, orders, printPartners, provinces } from './schema.js';

/** کلید قفل مشورتی کار روی چاپخانه‌ها: «prnt» به عدد. */
const PARTNERS_LOCK = 0x70726e74;

/** «باز»، همان `OPEN_STATUSES` پنل: در صف چاپ و در حال چاپ. غیرفعال کردن فقط بی این‌ها. */
const OPEN = ['paid', 'printing'] as const;

export type PartnerRow = typeof printPartners.$inferSelect;
export type OrderAssignmentRow = typeof orderAssignments.$inferSelect;

/** نام چاپخانه: همان محدودیت `print_partners_name`. */
export const PARTNER_NAME_MAX = 100;

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/* ───────────────────────── زبانهٔ «چاپخانه‌ها» ───────────────────────── */

/** یک چاپخانه با نام شهر و استانش و شمار سفارش‌های بازش. */
export interface PartnerView {
  id: string;
  name: string;
  provinceId: number;
  cityId: number;
  provinceName: string;
  cityName: string;
  isDefault: boolean;
  deactivatedAt: Date | null;
  createdAt: Date;
  /** در صف چاپ و در حال چاپ. */
  openOrders: number;
  /** نام کاربرهای این چاپخانه که غیرفعال نشده‌اند (برش ۵٫۳)، به ترتیب ساختن؛ خالی یعنی همان مالک و متصدی. */
  users: string[];
  /** موبایل اعلان (برش ۷٫۶)؛ null یعنی بی پیامک. */
  notifyMobile: string | null;
}

export interface NewPartner {
  name: string;
  provinceId: number;
  cityId: number;
  /** موبایل اعلان، نرمال (`09…`)؛ null یعنی بی پیامک. */
  notifyMobile: string | null;
  at: Date;
  createdBy: string | null;
  event: AdminEventInput;
}

export interface PartnerEdit {
  id: string;
  /** نام، شهر و موبایل اعلانی که ادمین در فرم دید؛ اگر همین حالا جای دیگری عوض شده، هیچ نوشته نمی‌شود. */
  seen: { name: string; cityId: number; notifyMobile: string | null };
  name: string;
  provinceId: number;
  cityId: number;
  notifyMobile: string | null;
  event: AdminEventInput;
}

/** آنچه ویرایش عوض کرد: نام، شهر، یا موبایل اعلان (برش ۷٫۶). */
export type PartnerField = 'name' | 'city' | 'mobile';

export type PartnerWrite =
  | { ok: true; partner: PartnerRow; changed: PartnerField[] }
  | { ok: false; reason: 'not_found' | 'changed' | 'name_taken' };

export interface PartnerStore {
  /** پیش‌فرض اول، بعد فعال‌ها، بعد غیرفعال‌ها؛ در هر دسته قدیمی‌ترین اول. */
  list(): Promise<PartnerView[]>;
  find(id: string): Promise<PartnerView | null>;
  /** چاپخانهٔ تازه، فعال و نه پیش‌فرض، با رویداد در همان تراکنش. نام تکراری `name_taken`. */
  create(input: NewPartner): Promise<PartnerWrite>;
  /**
   * نام، شهر و موبایل اعلان، از همان که ادمین دید. نام یا شهر عوض‌شده روی برگهٔ سفارش‌های باز این چاپخانه هست، پس کار برگه‌شان
   * دوباره در صف؛ موبایل نه. بی تغییر، بی رویداد.
   */
  update(input: PartnerEdit): Promise<PartnerWrite>;
  /** پیش‌فرض تازه؛ قبلی دیگر پیش‌فرض نیست. فقط چاپخانهٔ فعال. */
  setDefault(input: { id: string; event: AdminEventInput }): Promise<'ok' | 'not_found' | 'inactive' | 'already'>;
  /** غیرفعال: از این لحظه سفارش تازه نمی‌گیرد. پیش‌فرض نه، و با سفارش باز نه. */
  deactivate(input: { id: string; at: Date; event: AdminEventInput }): Promise<'ok' | 'not_found' | 'default' | 'open_orders' | 'already'>;
  activate(input: { id: string; event: AdminEventInput }): Promise<'ok' | 'not_found' | 'already'>;
}

type PgError = { code?: string; constraint_name?: string; cause?: PgError };

/** نام محدودیتی که پستگرس رد کرد؛ drizzle خطای درایور را در `cause` می‌پیچد. */
function constraintOf(error: unknown): string | undefined {
  const pg = error as PgError;
  return pg?.cause?.constraint_name ?? pg?.constraint_name;
}

export function createPartnerStore({ db }: Database): PartnerStore {
  const openOrders = sql<number>`(SELECT count(*)::int FROM orders o
    WHERE o.print_partner_id = ${printPartners.id} AND o.status IN ('paid', 'printing'))`;
  // کاربرهای چاپخانه (نقش «چاپخانه» با همین چاپخانه)، جز غیرفعال‌ها؛ دعوت‌شده‌ای که هنوز ثبت نکرده هم کاربر است.
  const users = sql<string[]>`(SELECT coalesce(array_agg(u.display_name ORDER BY u.created_at, u.id), '{}'::text[])
    FROM ${adminUserRoles} r JOIN ${adminUsers} u ON u.id = r.admin_user_id
    WHERE r.print_partner_id = ${printPartners.id} AND r.role_id = ${PARTNER_ROLE} AND u.disabled_at IS NULL)`;

  function select(where?: ReturnType<typeof eq>) {
    return db
      .select({
        id: printPartners.id,
        name: printPartners.name,
        provinceId: printPartners.provinceId,
        cityId: printPartners.cityId,
        provinceName: provinces.nameFa,
        cityName: cities.nameFa,
        isDefault: printPartners.isDefault,
        deactivatedAt: printPartners.deactivatedAt,
        createdAt: printPartners.createdAt,
        openOrders,
        users,
        notifyMobile: printPartners.notifyMobile,
      })
      .from(printPartners)
      .innerJoin(provinces, eq(provinces.id, printPartners.provinceId))
      .innerJoin(cities, eq(cities.id, printPartners.cityId))
      .where(where)
      .orderBy(sql`${printPartners.isDefault} DESC`, sql`${printPartners.deactivatedAt} IS NOT NULL`, asc(printPartners.createdAt), asc(printPartners.id));
  }

  const nameOfCity = async (tx: Tx, cityId: number) =>
    (await tx.select({ name: cities.nameFa }).from(cities).where(eq(cities.id, cityId)).limit(1))[0]?.name ?? null;

  return {
    list: () => select(),

    async find(id) {
      const [row] = await select(eq(printPartners.id, id));
      return row ?? null;
    },

    async create(input) {
      try {
        return await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${PARTNERS_LOCK})`);
          const [taken] = await tx.select({ id: printPartners.id }).from(printPartners).where(eq(printPartners.name, input.name)).limit(1);
          if (taken) return { ok: false as const, reason: 'name_taken' as const };
          const [partner] = await tx
            .insert(printPartners)
            .values({
              name: input.name,
              provinceId: input.provinceId,
              cityId: input.cityId,
              notifyMobile: input.notifyMobile,
              createdAt: input.at,
              createdBy: input.createdBy,
            })
            .returning();
          await tx.insert(adminEvents).values(
            adminEventRow({
              ...input.event,
              targetId: partner!.id,
              detail: { ...(input.event.detail as Record<string, unknown> | undefined), name: partner!.name, city: await nameOfCity(tx, input.cityId) },
            }),
          );
          return { ok: true as const, partner: partner!, changed: [] };
        });
      } catch (error) {
        // دو «افزودن» هم‌زمان پیش از قفل نمی‌رسند؛ این فقط دیوار آخر است.
        if (constraintOf(error) === 'print_partners_name_unique') return { ok: false, reason: 'name_taken' };
        throw error;
      }
    },

    async update(input) {
      try {
        return await db.transaction(async (tx): Promise<PartnerWrite> => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${PARTNERS_LOCK})`);
          const [partner] = await tx.select().from(printPartners).where(eq(printPartners.id, input.id)).limit(1).for('update');
          if (!partner) return { ok: false, reason: 'not_found' };
          if (partner.name !== input.seen.name || partner.cityId !== input.seen.cityId || partner.notifyMobile !== input.seen.notifyMobile) {
            return { ok: false, reason: 'changed' };
          }
          const changed: PartnerField[] = [
            ...(partner.name !== input.name ? (['name'] as const) : []),
            ...(partner.cityId !== input.cityId ? (['city'] as const) : []),
            ...(partner.notifyMobile !== input.notifyMobile ? (['mobile'] as const) : []),
          ];
          if (changed.length === 0) return { ok: true, partner, changed: [] };
          if (changed.includes('name')) {
            const [taken] = await tx.select({ id: printPartners.id }).from(printPartners).where(eq(printPartners.name, input.name)).limit(1);
            if (taken) return { ok: false, reason: 'name_taken' };
          }
          const [updated] = await tx
            .update(printPartners)
            .set({ name: input.name, provinceId: input.provinceId, cityId: input.cityId, notifyMobile: input.notifyMobile })
            .where(eq(printPartners.id, input.id))
            .returning();
          // پس از عوض کردن خود ردیف: سفارشی که همین حالا به این چاپخانه جابه‌جا می‌شد، پشت قفل این ردیف ماند و حالا در
          // فهرست است. ردیف سفارش‌ها قفل می‌شود تا کارگرِ وسط ساختن برگه، اثر انگشت را پس از این تغییر بسنجد. موبایل اعلان روی برگه
          // نیست (برش ۷٫۶)، پس فقط با نام یا شهر.
          if (changed.includes('name') || changed.includes('city')) {
            const open = await tx
              .select({ id: orders.id })
              .from(orders)
              .where(and(eq(orders.printPartnerId, input.id), inArray(orders.status, [...OPEN])))
              .orderBy(asc(orders.id))
              .for('update');
            for (const order of open) await requeueTicket(tx, order.id);
          }
          await tx.insert(adminEvents).values(
            adminEventRow({
              ...input.event,
              targetId: input.id,
              detail: {
                ...(input.event.detail as Record<string, unknown> | undefined),
                changed,
                name: updated!.name,
                city: await nameOfCity(tx, updated!.cityId),
                previous: { name: partner.name, city: await nameOfCity(tx, partner.cityId) },
              },
            }),
          );
          return { ok: true, partner: updated!, changed };
        });
      } catch (error) {
        if (constraintOf(error) === 'print_partners_name_unique') return { ok: false, reason: 'name_taken' };
        throw error;
      }
    },

    async setDefault({ id, event }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${PARTNERS_LOCK})`);
        const [partner] = await tx.select().from(printPartners).where(eq(printPartners.id, id)).limit(1).for('update');
        if (!partner) return 'not_found' as const;
        if (partner.deactivatedAt) return 'inactive' as const;
        if (partner.isDefault) return 'already' as const;
        const previous = await tx
          .update(printPartners)
          .set({ isDefault: false })
          .where(eq(printPartners.isDefault, true))
          .returning({ id: printPartners.id, name: printPartners.name });
        await tx.update(printPartners).set({ isDefault: true }).where(eq(printPartners.id, id));
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...event,
            targetId: id,
            detail: {
              ...(event.detail as Record<string, unknown> | undefined),
              name: partner.name,
              previous: previous[0] ? { id: previous[0].id, name: previous[0].name } : null,
            },
          }),
        );
        return 'ok' as const;
      });
    },

    async deactivate({ id, at, event }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${PARTNERS_LOCK})`);
        const [partner] = await tx.select().from(printPartners).where(eq(printPartners.id, id)).limit(1).for('update');
        if (!partner) return 'not_found' as const;
        if (partner.deactivatedAt) return 'already' as const;
        if (partner.isDefault) return 'default' as const;
        const [open] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(orders)
          .where(and(eq(orders.printPartnerId, id), inArray(orders.status, [...OPEN])));
        if ((open?.n ?? 0) > 0) return 'open_orders' as const;
        try {
          // تخصیصی که همین حالا commit شد را تریگر `print_partners_guard` می‌بیند (سنجش بالا پیش از آن بود).
          await tx.transaction(async (sp) => {
            await sp.update(printPartners).set({ deactivatedAt: at }).where(eq(printPartners.id, id));
          });
        } catch (error) {
          if (constraintOf(error) === 'print_partners_open_orders') return 'open_orders' as const;
          throw error;
        }
        await tx.insert(adminEvents).values(
          adminEventRow({ ...event, targetId: id, detail: { ...(event.detail as Record<string, unknown> | undefined), name: partner.name } }),
        );
        return 'ok' as const;
      });
    },

    async activate({ id, event }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${PARTNERS_LOCK})`);
        const [partner] = await tx.select().from(printPartners).where(eq(printPartners.id, id)).limit(1).for('update');
        if (!partner) return 'not_found' as const;
        if (!partner.deactivatedAt) return 'already' as const;
        await tx.update(printPartners).set({ deactivatedAt: null }).where(eq(printPartners.id, id));
        await tx.insert(adminEvents).values(
          adminEventRow({ ...event, targetId: id, detail: { ...(event.detail as Record<string, unknown> | undefined), name: partner.name } }),
        );
        return 'ok' as const;
      });
    },
  };
}
