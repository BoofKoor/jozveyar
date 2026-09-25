/**
 * دادهٔ پایه‌ای که در کد تعریف شده و پایگاه داده باید داشته باشد (برش ۳):
 *
 *  - منطقه‌های کرایه، استان‌ها و شهرها، از `@jozveyar/geo` — سفارش به شهر و استان کلید خارجی دارد؛
 *  - تعرفهٔ پایه، اگر هنوز هیچ تعرفه‌ای نیست — قیمت قطعی سرور از تعرفهٔ پایگاه داده است (قاعدهٔ ۲)؛
 *  - پیش‌فرض‌های `settings`: روز کاری تحویل به پست و تعطیلی‌های رسمی.
 *
 * هنگام بالا آمدن سرور، بعد از مهاجرت‌ها اجرا می‌شود (`instrumentation.ts`) و idempotent است. شهر و
 * استان با شناسه به‌روز می‌شوند و **هیچ‌وقت پاک نمی‌شوند** (سفارش به آنها اشاره می‌کند). تعرفه و
 * تنظیم فقط اگر نباشند نوشته می‌شوند: تعرفهٔ تازه نسخهٔ تازه است (قاعدهٔ ۶)، و تنظیمی که ادمین عوض
 * کرده با استقرار بعدی برنمی‌گردد.
 *
 * زیر یک قفل مشورتی پستگرس: دو نمونهٔ وب که با هم بالا می‌آیند (مقیاس افقی، CLAUDE.md) پشت‌سرهم
 * می‌نویسند، نه هم‌زمان. قفل در پایگاه داده است، نه در حافظه.
 */

import { count, sql } from 'drizzle-orm';
import { CITIES, PROVINCES, SHIPPING_ZONES } from '@jozveyar/geo';
import type { PriceList } from '@jozveyar/contracts';

import { OFFICIAL_HOLIDAYS } from './holidays.js';
import type { Database } from './index.js';
import { cities, priceLists, provinces, settings, shippingZones } from './schema.js';
import { seedPriceList } from './seed.js';

/** کلید قفل مشورتی دادهٔ پایه: «jozv» به عدد. */
const REFERENCE_LOCK = 0x6a6f7a76;

/** روز کاری تا تحویل به پست (ADR-013). */
export const SLA_DAYS_SETTING = 'order.sla_days';
/** تعطیلی‌های رسمی، `[{ date: '1405/10/02', title }]`؛ روز کاری آنها را نمی‌شمارد. */
export const HOLIDAYS_SETTING = 'calendar.holidays';

export const DEFAULT_SETTINGS: Readonly<Record<string, unknown>> = {
  [SLA_DAYS_SETTING]: 2,
  [HOLIDAYS_SETTING]: OFFICIAL_HOLIDAYS,
};

export interface ReferenceSeedResult {
  provinces: number;
  cities: number;
  /** نسخهٔ تعرفه‌ای که درج شد؛ null یعنی از قبل تعرفه بود. */
  priceListInserted: number | null;
  /** تنظیم‌هایی که نبودند و پیش‌فرضشان نشست. */
  settingsInserted: string[];
}

export async function seedReferenceData(
  conn: Database,
  options: { priceList: PriceList },
): Promise<ReferenceSeedResult> {
  return conn.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${REFERENCE_LOCK})`);

    await tx
      .insert(shippingZones)
      .values(SHIPPING_ZONES.map((zone) => ({ id: zone.id, nameFa: zone.name })))
      .onConflictDoUpdate({ target: shippingZones.id, set: { nameFa: sql`excluded.name_fa` } });

    await tx
      .insert(provinces)
      .values(PROVINCES.map((p) => ({ id: p.id, nameFa: p.name, shippingZoneId: p.zone })))
      .onConflictDoUpdate({
        target: provinces.id,
        set: { nameFa: sql`excluded.name_fa`, shippingZoneId: sql`excluded.shipping_zone_id` },
      });

    // استانِ شهری که سفارش دارد عوض‌شدنی نیست: کلید خارجی دوستونی سفارش جلویش را می‌گیرد و کل
    // تراکنش برمی‌گردد — بلند، نه بی‌صدا.
    await tx
      .insert(cities)
      .values(CITIES.map((c) => ({ id: c.id, provinceId: c.provinceId, nameFa: c.name })))
      .onConflictDoUpdate({
        target: cities.id,
        set: { provinceId: sql`excluded.province_id`, nameFa: sql`excluded.name_fa` },
      });

    const [lists] = await tx.select({ n: count() }).from(priceLists);
    let priceListInserted: number | null = null;
    if (lists!.n === 0) {
      // در همین تراکنش (savepoint)، زیر همان قفل.
      await seedPriceList({ db: tx } as unknown as Database, options.priceList);
      priceListInserted = options.priceList.version;
    }

    const inserted = await tx
      .insert(settings)
      .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
      .onConflictDoNothing({ target: settings.key })
      .returning({ key: settings.key });

    return {
      provinces: PROVINCES.length,
      cities: CITIES.length,
      priceListInserted,
      settingsInserted: inserted.map((row) => row.key).sort(),
    };
  });
}
