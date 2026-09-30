/**
 * گزارش حاشیهٔ ارسال در پایگاه داده (برش ۶٫۴، ADR-048؛ طرح پنل `m-ship-report`): هر سفارش «تحویل پست شد» یک بازه با کرایهٔ
 * منجمد مشتری و جمع مرسوله‌های زنده‌اش، ماه‌هایی که «تحویل پست شد» دارند، و مرزهای وزن کرایهٔ تعرفهٔ فعال.
 *
 * فقط خواندن و کوئری زنده، بی جدول تازه (تصمیم ۱۰۵): قیمت و کرایهٔ منجمد دست نمی‌خورند (قاعدهٔ ۶). ماه شمسی، جمع‌ها، بازه‌های
 * وزن، گرد کردن و متن در پنل (`apps/admin/lib/report.ts`)؛ اینجا همان که فقط پستگرس معنایش را دارد:
 *
 *  - **مرز ماه** را پنل از تقویم `Intl` می‌سازد (آغاز روز تهران)، مثل همهٔ مرزهای روز پنل؛ اینجا فقط `>= from AND < to` روی
 *    `handed_to_post_at`. آن زمان فقط در «تحویل پست شد» پر است (`orders_handed_at`)، پس همین شرط وضعیت هم هست: لغوشده، و
 *    سفارشی که از پست به «در حال چاپ» برگشت، نه.
 *  - **مرسولهٔ زنده** (تصمیم ۱۰۰): کرایه، مالیات و وزن همهٔ مرسوله‌های کنارگذاشته‌نشدهٔ هر سفارش جمع می‌شوند؛ کد کنارگذاشته نه.
 *    سفارشی که مرسولهٔ زنده ندارد با صفر بسته می‌آید و پنل جدا می‌شماردش («بی کد رهگیری»)، نه با کرایهٔ صفر.
 *  - **پول bigint** (تصمیم ۱۰۴): هر مبلغ از پستگرس رشتهٔ int8 است و `BigInt` می‌شود، بی گذر از عدد اعشاری.
 *  - **محدوده** (ADR-042): مثل هر ذخیره‌گاه سفارش پنل، آرگومان اول و در خود کوئری؛ گزارش امروز فقط مالک است (همه).
 *
 * و «همان که دیده شد» تنظیم بازه‌های وزن (`bandsDecision`)، خالص: سرویس تنظیمات پنل و تست پستگرس هر دو همین را زیر قفل
 * `SettingsStore.change` می‌دهند.
 */

import { SETTING_SCHEMAS, type SettingValue } from '@jozveyar/contracts';
import { and, asc, eq, gt, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import type { Database } from './index.js';
import { ordersInScope, type PanelScope } from './panel.js';
import { REPORT_BANDS_SETTING } from './reference.js';
import { cities, orders, priceLists, printPartners, settings, shipments, shippingRates, shippingZones } from './schema.js';
import type { SettingDecision } from './settings.js';

/** یک سفارش «تحویل پست شد» در گزارش. */
export interface ShippingReportOrder {
  orderNumber: number;
  /** منطقهٔ کرایه در لحظهٔ سفارش (`orders.shipping_zone_id`)؛ کرایهٔ مشتری با همین منجمد شده. */
  zoneId: string;
  zoneName: string;
  /** چاپخانهٔ سفارش؛ null یعنی بی چاپخانه (پیش از ۵٫۲، یا هنگام پرداخت چاپخانهٔ فعالی نبود). */
  partner: { id: string; name: string; cityName: string } | null;
  /** کرایهٔ منجمد مشتری (`orders.shipping_rials`). */
  shippingRials: bigint;
  /** برآورد وزن هنگام سفارش (`orders.est_weight_grams`). */
  estWeightGrams: number;
  /** مرسوله‌های زنده؛ صفر یعنی بی کد رهگیری. */
  parcels: number;
  /** جمع کرایه، مالیات و وزن واقعی همان مرسوله‌ها. */
  fareRials: bigint;
  taxRials: bigint;
  weightGrams: number;
}

export interface ShippingReportStore {
  /** زودترین و دیرترین «تحویل پست شد» محدوده؛ null یعنی هنوز هیچ سفارشی به پست نرسیده. */
  handedSpan(scope: PanelScope): Promise<{ first: Date; last: Date } | null>;
  /**
   * شمار «تحویل پست شد»های هر ماه. `starts` آغاز ماه‌هاست، صعودی و پشت‌سرهم؛ هر ماه از آغازش تا آغاز ماه بعد، و ماه آخر تا هر
   * وقت. خروجی به همان ترتیب و همان‌قدر.
   */
  handedPerMonth(scope: PanelScope, starts: readonly Date[]): Promise<number[]>;
  /** هر سفارشی که در `[from, to)` «تحویل پست شد»، با کرایهٔ منجمد و جمع مرسوله‌های زنده‌اش؛ کوچک‌ترین شماره اول. */
  handedOrders(scope: PanelScope, range: { from: Date; to: Date }): Promise<ShippingReportOrder[]>;
  /**
   * مرزهای وزن کرایهٔ روش `methodId` در تعرفهٔ فعال: کمینهٔ هر بازه جز صفر، صعودی و بی تکرار، هر دو منطقه با هم؛ با شمارهٔ
   * نسخه. null یعنی تعرفهٔ فعالی نیست.
   */
  tariffBounds(methodId: string): Promise<{ version: number; bounds: number[] } | null>;
  /** مقدار خام یک کلید `settings`؛ undefined یعنی تنظیم نشده. */
  setting(key: string): Promise<unknown>;
}

const ts = (value: Date) => sql`${value.toISOString()}::timestamptz`;
const rials = (value: unknown) => BigInt(String(value ?? 0));

export function createShippingReportStore({ db }: Database): ShippingReportStore {
  return {
    async handedSpan(scope) {
      const [row] = await db
        .select({
          first: sql<Date | null>`min(${orders.handedToPostAt})`.mapWith(orders.handedToPostAt),
          last: sql<Date | null>`max(${orders.handedToPostAt})`.mapWith(orders.handedToPostAt),
        })
        .from(orders)
        .where(and(isNotNull(orders.handedToPostAt), ordersInScope(scope)));
      return row?.first && row.last ? { first: row.first, last: row.last } : null;
    },

    async handedPerMonth(scope, starts) {
      if (starts.length === 0) return [];
      // `width_bucket` با آستانه‌های صعودی: 0 پیش از آغاز ماه اول، i برای ماه iاُم (از آغازش تا پیش از آغاز بعدی)، و ماه آخر تا هر وقت.
      const bucket = sql<number>`width_bucket(${orders.handedToPostAt}, ARRAY[${sql.join(starts.map(ts), sql`, `)}])`;
      const rows = await db
        .select({ bucket: bucket.mapWith(Number), n: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(gte(orders.handedToPostAt, starts[0]!), ordersInScope(scope)))
        // شمارهٔ ستون، نه همان عبارت: پارامترهای عبارت در GROUP BY جای دیگری می‌گیرند و پستگرس آن را عبارت دیگری می‌بیند.
        .groupBy(sql`1`);
      const counts = starts.map(() => 0);
      for (const row of rows) if (row.bucket >= 1 && row.bucket <= starts.length) counts[row.bucket - 1] = row.n;
      return counts;
    },

    async handedOrders(scope, { from, to }) {
      // مرسوله‌های زنده با LEFT JOIN: سفارش بی کد رهگیری هم می‌آید، با صفر بسته.
      const rows = await db
        .select({
          orderNumber: orders.orderNumber,
          zoneId: orders.shippingZoneId,
          zoneName: shippingZones.nameFa,
          partnerId: printPartners.id,
          partnerName: printPartners.name,
          partnerCity: cities.nameFa,
          shippingRials: sql<string>`${orders.shippingRials}::text`,
          estWeightGrams: orders.estWeightGrams,
          parcels: sql<number>`count(${shipments.id})::int`,
          fareRials: sql<string>`coalesce(sum(${shipments.fareRials}), 0)::text`,
          taxRials: sql<string>`coalesce(sum(${shipments.taxRials}), 0)::text`,
          weightGrams: sql<number>`coalesce(sum(${shipments.weightGrams}), 0)::int`,
        })
        .from(orders)
        .innerJoin(shippingZones, eq(shippingZones.id, orders.shippingZoneId))
        .leftJoin(printPartners, eq(printPartners.id, orders.printPartnerId))
        .leftJoin(cities, eq(cities.id, printPartners.cityId))
        .leftJoin(shipments, and(eq(shipments.orderId, orders.id), isNull(shipments.voidedAt)))
        .where(and(gte(orders.handedToPostAt, from), lt(orders.handedToPostAt, to), ordersInScope(scope)))
        .groupBy(orders.id, shippingZones.id, printPartners.id, cities.id)
        .orderBy(asc(orders.orderNumber));
      return rows.map((row) => ({
        orderNumber: row.orderNumber,
        zoneId: row.zoneId,
        zoneName: row.zoneName,
        partner: row.partnerId ? { id: row.partnerId, name: row.partnerName ?? '', cityName: row.partnerCity ?? '' } : null,
        shippingRials: rials(row.shippingRials),
        estWeightGrams: row.estWeightGrams,
        parcels: row.parcels,
        fareRials: rials(row.fareRials),
        taxRials: rials(row.taxRials),
        weightGrams: row.weightGrams,
      }));
    },

    async tariffBounds(methodId) {
      const [active] = await db.select({ version: priceLists.version }).from(priceLists).where(eq(priceLists.isActive, true)).limit(1);
      if (!active) return null;
      const rows = await db
        .selectDistinct({ grams: shippingRates.minWeightGrams })
        .from(shippingRates)
        .where(and(eq(shippingRates.priceListVersion, active.version), eq(shippingRates.methodId, methodId), gt(shippingRates.minWeightGrams, 0)))
        .orderBy(asc(shippingRates.minWeightGrams));
      return { version: active.version, bounds: rows.map((row) => row.grams) };
    },

    async setting(key) {
      const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },
  };
}

/* ───────────────────────── بازه‌های وزن (تصمیم ۱۰۱) ───────────────────────── */

/** بازه‌های وزن گزارش: `'tariff'` (همان کرایهٔ تعرفهٔ فعال) یا مرزها به گرم. */
export type ReportBands = SettingValue<typeof REPORT_BANDS_SETTING>;

/** مقدار امروز به شکل قرارداد؛ نبود یا خراب یعنی پیش‌فرض (`'tariff'`)، مثل `readSetting`، زیر قفل و بی لاگ. */
export function currentBands(raw: unknown): ReportBands {
  const parsed = raw === undefined || raw === null ? null : SETTING_SCHEMAS[REPORT_BANDS_SETTING].safeParse(raw);
  return parsed?.success ? parsed.data : 'tariff';
}

/** نسخهٔ بازه‌ها برای «همان که دیده شد»: `tariff`، یا مرزها با ویرگول (`1000,3000`). */
export const bandsSeen = (value: ReportBands): string => (value === 'tariff' ? 'tariff' : value.join(','));

/**
 * تغییر بازه‌ها زیر قفل تنظیم‌ها (`SettingsStore.change`، ۴٫۶): مقصد یکسان «همان» است، بی رویداد (دو کلیک)؛ وگرنه فقط اگر امروز
 * همان است که صفحه نشان داد (`seen`)، تا ادمین دیگری بی‌صدا رونویسی نشود. مقصد بیرون از قرارداد رد می‌شود، نه نوشته.
 */
export function bandsDecision(next: ReportBands, seen: string): (raw: unknown) => SettingDecision {
  return (raw) => {
    if (!SETTING_SCHEMAS[REPORT_BANDS_SETTING].safeParse(next).success) return { kind: 'reject', reason: 'invalid' };
    const current = currentBands(raw);
    if (bandsSeen(current) === bandsSeen(next)) return { kind: 'same' };
    if (bandsSeen(current) !== seen) return { kind: 'reject', reason: 'changed' };
    return { kind: 'write', value: next, detail: { key: REPORT_BANDS_SETTING, from: current, to: next } };
  };
}
