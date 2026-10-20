/**
 * گزارش تولید در پایگاه داده (برش ۱۰٫۲، ADR-061، سؤال ۲۰۱): سفارش‌های پرداخت‌شدهٔ یک بازه، هر کدام با جزوه‌هایش و عددهای منجمد هر جزوه.
 *
 * فقط خواندن و کوئری زنده، بی جدول تازه، مثل گزارش ارسال (۶٫۴): همه از دادهٔ منجمد سفارش، پس گزارش هرگز با آنچه پرداخت شد نمی‌جنگد.
 * جمع‌ها، جدول‌ها و متن در پنل (`apps/admin/lib/production.ts`)؛ اینجا همان که فقط پستگرس دارد:
 *
 *  - **کدام سفارش:** هر سفارشی که پرداخت شد (`paid_at`): در صف چاپ، در حال چاپ، تحویل پست شد، و لغوشده‌ای که پرداخت شده بود (پنل جدا
 *    می‌شماردش). پرداخت‌نشده هرگز، در بازهٔ شماره هم.
 *  - **بازه:** روز پرداخت (`>= from AND < to`؛ مرز روز تهران را پنل می‌سازد، مثل همهٔ مرزهای روز پنل) یا شمارهٔ سفارش، هر دو سر شامل.
 *  - **عدد هر جزوه** از ریز قیمت منجمد (`price_breakdown.items[seq - 1]`): روهای رنگی و سیاه‌سفید، برگ و جلد یک نسخه، همان که کارگر فایل
 *    چاپ و برگه را با آن می‌سازد؛ نسخه، صفحه، رو، اندازه و صحافی از ستون‌های منجمد `order_items`، شمار فایل از بخش‌ها، و کاغذ از قاعده‌ها.
 *  - **آماده:** جزوه‌ای که فایل چاپش ساخته شده (`order_print_files`؛ همهٔ جلدهای یک جزوه در یک تراکنش نوشته می‌شوند).
 *  - **سهم چاپخانه** (برش ۱۰٫۳): سهم منجمد آخرین تخصیص سفارش (`order_assignments.share_rials`)، همان که صورت‌حساب تسویه می‌شمارد.
 *  - **محدوده** (ADR-042): آرگومان اول و در خود کوئری، مثل هر ذخیره‌گاه سفارش پنل؛ کاربر چاپخانه فقط سفارش‌های امروز خودش.
 *  - **پول bigint:** مبلغ سفارش رشتهٔ int8 پستگرس است و `BigInt` می‌شود.
 */

import type { PaperSize, SidesMode } from '@jozveyar/contracts';
import { and, asc, between, eq, gte, isNotNull, lt, sql, type SQL } from 'drizzle-orm';

import type { Database } from './index.js';
import type { OrderStatus } from './orders.js';
import { ordersInScope, type PanelScope } from './panel.js';
import { bindingTypes, cities, orderItems, orderItemSections, orderPrintFiles, orders, paperTypes, printPartners, printRules } from './schema.js';

/** بازهٔ گزارش: روز پرداخت (`[from, to)`، مرزهای روز تهران) یا شمارهٔ سفارش (هر دو سر شامل). */
export type ProductionRange =
  | { readonly by: 'paid'; readonly from: Date; readonly to: Date }
  | { readonly by: 'number'; readonly from: number; readonly to: number };

/** یک جزوهٔ سفارش در گزارش؛ عددها برای یک نسخه، جز `copies`. */
export interface ProductionItem {
  seq: number;
  pageCount: number;
  copies: number;
  sidesMode: SidesMode;
  paperSize: PaperSize;
  bindingTypeId: string;
  /** نام صحافی در تعرفهٔ همان سفارش؛ null اگر آن نسخه نامی برایش نداشت. */
  bindingName: string | null;
  /** شمار فایل‌ها (بخش‌های جزوه). */
  files: number;
  /** روهای رنگی و سیاه‌سفید یک نسخه (ریز قیمت منجمد). */
  colorSides: number;
  bwSides: number;
  /** برگ و جلد یک نسخه (ریز قیمت منجمد). */
  sheets: number;
  volumes: number;
  /** کاغذهای قاعده‌ها، به ترتیب و بی تکرار؛ امروز هر جزوه یک قاعده دارد. */
  papers: { id: string; name: string | null }[];
  /** فایل چاپ این جزوه ساخته شده است. */
  ready: boolean;
}

export interface ProductionOrder {
  orderNumber: number;
  status: OrderStatus;
  paidAt: Date;
  /** جمع پرداخت مشتری (`orders.total_rials`). */
  totalRials: bigint;
  /** چاپخانهٔ امروز سفارش؛ null یعنی بی چاپخانه. */
  partner: { id: string; name: string; cityName: string } | null;
  /** سهم منجمد چاپخانه از این سفارش (برش ۱۰٫۳، سؤال ۴۰۱): همان آخرین تخصیص؛ null یعنی بی چاپخانه یا بی سهم. */
  shareRials: bigint | null;
  items: ProductionItem[];
}

/** یک چاپخانه برای انتخاب گزارش؛ غیرفعال هم، چون سفارش‌های گذشته‌اش در گزارش‌اند. */
export interface ProductionPartner {
  id: string;
  name: string;
  cityName: string;
  active: boolean;
}

export interface ProductionReportStore {
  /**
   * سفارش‌های پرداخت‌شدهٔ بازه در محدوده، کوچک‌ترین شماره اول، با جزوه‌هایشان به ترتیب. `partnerId`: فقط سفارش‌هایی که امروز پیش همین
   * چاپخانه‌اند (انتخاب مالک و حسابدار)؛ null یعنی همه.
   */
  orders(scope: PanelScope, range: ProductionRange, partnerId: string | null): Promise<ProductionOrder[]>;
  /** چاپخانه‌ها، فعال اول و بعد به ترتیب نام. */
  partners(): Promise<ProductionPartner[]>;
}

/** عدد درست نامنفی از ریز قیمت منجمد؛ نبودش یعنی ریز قیمت خراب است، و گزارشی که بی‌صدا صفر بشمارد بدتر از خطاست. */
function frozenCount(priced: Record<string, unknown> | null, key: string, orderNumber: number, seq: number): number {
  const value = priced?.[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`ریز قیمت منجمد سفارش ${orderNumber}، جزوهٔ ${seq}: «${key}» عدد درستی نیست`);
  }
  return value;
}

export function createProductionReportStore({ db }: Database): ProductionReportStore {
  /** شرط سفارش‌های گزارش: پرداخت‌شده، بازه، چاپخانهٔ انتخاب‌شده و محدوده. */
  function selection(scope: PanelScope, range: ProductionRange, partnerId: string | null): SQL | undefined {
    return and(
      isNotNull(orders.paidAt),
      range.by === 'paid'
        ? and(gte(orders.paidAt, range.from), lt(orders.paidAt, range.to))
        : between(orders.orderNumber, range.from, range.to),
      partnerId ? eq(orders.printPartnerId, partnerId) : undefined,
      ordersInScope(scope),
    );
  }

  return {
    async orders(scope, range, partnerId) {
      const where = selection(scope, range, partnerId);
      const [orderRows, itemRows, ruleRows] = await Promise.all([
        db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            paidAt: orders.paidAt,
            totalRials: sql<string>`${orders.totalRials}::text`,
            partnerId: printPartners.id,
            partnerName: printPartners.name,
            partnerCity: cities.nameFa,
            // نام جدول صریح: `"id"` بی نام درون زیرکوئری شناسهٔ تخصیص خوانده می‌شود.
            shareRials: sql<string | null>`(SELECT a.share_rials::text FROM order_assignments a
              WHERE a.order_id = "orders"."id" ORDER BY a.id DESC LIMIT 1)`,
          })
          .from(orders)
          .leftJoin(printPartners, eq(printPartners.id, orders.printPartnerId))
          .leftJoin(cities, eq(cities.id, printPartners.cityId))
          .where(where)
          .orderBy(asc(orders.orderNumber)),
        db
          .select({
            orderId: orderItems.orderId,
            id: orderItems.id,
            seq: orderItems.seq,
            pageCount: orderItems.pageCount,
            copies: orderItems.copies,
            sidesMode: orderItems.sidesMode,
            paperSize: orderItems.paperSize,
            bindingTypeId: orderItems.bindingTypeId,
            bindingName: bindingTypes.nameFa,
            files: sql<number>`(SELECT count(*)::int FROM ${orderItemSections} WHERE ${orderItemSections.orderItemId} = ${orderItems.id})`,
            ready: sql<boolean>`EXISTS (SELECT 1 FROM ${orderPrintFiles} WHERE ${orderPrintFiles.orderItemId} = ${orderItems.id})`,
            priced: sql<Record<string, unknown> | null>`${orders.priceBreakdown} -> 'items' -> (${orderItems.seq} - 1)`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .leftJoin(
            bindingTypes,
            and(eq(bindingTypes.priceListVersion, orders.priceListVersion), eq(bindingTypes.id, orderItems.bindingTypeId)),
          )
          .where(where)
          .orderBy(asc(orders.orderNumber), asc(orderItems.seq)),
        db
          .select({ itemId: printRules.orderItemId, paperTypeId: printRules.paperTypeId, paperName: paperTypes.nameFa })
          .from(printRules)
          .innerJoin(orderItems, eq(orderItems.id, printRules.orderItemId))
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .leftJoin(paperTypes, and(eq(paperTypes.priceListVersion, orders.priceListVersion), eq(paperTypes.id, printRules.paperTypeId)))
          .where(where)
          .orderBy(asc(printRules.orderItemId), asc(printRules.seq)),
      ]);

      const papersBy = new Map<string, { id: string; name: string | null }[]>();
      for (const rule of ruleRows) {
        const papers = papersBy.get(rule.itemId) ?? [];
        if (!papers.some((paper) => paper.id === rule.paperTypeId)) papers.push({ id: rule.paperTypeId, name: rule.paperName });
        papersBy.set(rule.itemId, papers);
      }
      const numberOf = new Map(orderRows.map((row) => [row.id, row.orderNumber]));
      const itemsBy = new Map<string, ProductionItem[]>();
      for (const row of itemRows) {
        const orderNumber = numberOf.get(row.orderId) ?? 0;
        const items = itemsBy.get(row.orderId) ?? [];
        items.push({
          seq: row.seq,
          pageCount: row.pageCount,
          copies: row.copies,
          sidesMode: row.sidesMode,
          paperSize: row.paperSize,
          bindingTypeId: row.bindingTypeId,
          bindingName: row.bindingName,
          files: row.files,
          colorSides: frozenCount(row.priced, 'colorSides', orderNumber, row.seq),
          bwSides: frozenCount(row.priced, 'bwSides', orderNumber, row.seq),
          sheets: frozenCount(row.priced, 'sheets', orderNumber, row.seq),
          volumes: frozenCount(row.priced, 'volumes', orderNumber, row.seq),
          papers: papersBy.get(row.id) ?? [],
          ready: row.ready,
        });
        itemsBy.set(row.orderId, items);
      }
      return orderRows.map((row) => ({
        orderNumber: row.orderNumber,
        status: row.status,
        paidAt: row.paidAt!,
        totalRials: BigInt(row.totalRials),
        partner: row.partnerId ? { id: row.partnerId, name: row.partnerName ?? '', cityName: row.partnerCity ?? '' } : null,
        shareRials: row.shareRials === null ? null : BigInt(row.shareRials),
        items: itemsBy.get(row.id) ?? [],
      }));
    },

    async partners() {
      const rows = await db
        .select({
          id: printPartners.id,
          name: printPartners.name,
          cityName: cities.nameFa,
          active: sql<boolean>`${printPartners.deactivatedAt} IS NULL`,
        })
        .from(printPartners)
        .innerJoin(cities, eq(cities.id, printPartners.cityId));
      // ترتیب نام با الفبای فارسی، نه collation پایگاه داده (که روی هر ماشین فرق دارد و «پ» و «چ» را ته الفبا می‌برد).
      return rows.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fa'));
    },
  };
}
