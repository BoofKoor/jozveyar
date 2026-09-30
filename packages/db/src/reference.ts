/**
 * دادهٔ پایه‌ای که در کد تعریف شده و پایگاه داده باید داشته باشد (برش ۳):
 *
 *  - منطقه‌های کرایه، استان‌ها و شهرها، از `@jozveyar/geo` — سفارش به شهر و استان کلید خارجی دارد؛
 *  - تعرفهٔ پایه، اگر هنوز هیچ تعرفه‌ای نیست — قیمت قطعی سرور از تعرفهٔ پایگاه داده است (قاعدهٔ ۲)؛
 *  - پیش‌فرض‌های `settings`: روز کاری تحویل به پست، تعطیلی‌های رسمی، و از ۶٫۴ بازه‌های وزن گزارش ارسال؛
 *  - نقش‌ها و مجوزهای پنل ادمین (`ADMIN_ROLES`، برش ۴): همیشه دقیقاً همان کد؛
 *  - اولین چاپخانه، «چاپخانهٔ جزوه‌یار» در تهران و پیش‌فرض، اگر هنوز هیچ چاپخانه‌ای نیست (برش ۵٫۲، ADR-042): تخصیص سفارش
 *    در پرداخت از روز اول جایی برای رفتن دارد. نامش از زبانهٔ «چاپخانه‌ها» عوض‌شدنی است و استقرار بعدی برش نمی‌گرداند.
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
import { CITIES, PROVINCES, SHIPPING_ZONES, findCity } from '@jozveyar/geo';
import { SETTING_SCHEMAS, type PriceList, type SettingKey, type SettingValue } from '@jozveyar/contracts';

import { seedAdminRoles } from './admin.js';
import { OFFICIAL_HOLIDAYS } from './holidays.js';
import type { Database } from './index.js';
import { cities, priceLists, printPartners, provinces, settings, shippingZones } from './schema.js';
import { seedPriceList } from './seed.js';

/** کلید قفل مشورتی دادهٔ پایه: «jozv» به عدد. */
const REFERENCE_LOCK = 0x6a6f7a76;

/** روز کاری تا تحویل به پست (ADR-013). */
export const SLA_DAYS_SETTING = 'order.sla_days';
/** تعطیلی‌های رسمی، `[{ date: '1405/10/02', title }]`؛ روز کاری آنها را نمی‌شمارد. */
export const HOLIDAYS_SETTING = 'calendar.holidays';
/** سقف کد پیامکی کل سایت در ساعت (ADR-033). */
export const OTP_SITE_LIMIT_SETTING = 'otp.site_hourly_limit';
/** سالی که تعطیلی‌ها تا پایانش با تقویم رسمی منتشرشده تطبیق داده شده‌اند (برش ۴٫۶). */
export const OFFICIAL_THROUGH_SETTING = 'calendar.official_through';
/** فایل‌های سفارش چند روز پس از «تحویل پست شد» یا «لغو شد» پاک می‌شوند (برش ۵٫۱، ADR-044). */
export const FILES_RETENTION_SETTING = 'order.files_retention_days';
/** بازه‌های وزن گزارش ارسال (برش ۶٫۴، ADR-048): مرزها به گرم، یا `'tariff'` یعنی همان بازه‌های کرایهٔ تعرفهٔ فعال. */
export const REPORT_BANDS_SETTING = 'report.weight_bands';

/**
 * پیش‌فرض هر تنظیمی که کد می‌خواند؛ شکلشان در قرارداد است (`SETTING_SCHEMAS`). همین‌ها هنگام بالا آمدن
 * سرور، اگر نباشند، در `settings` می‌نشینند، و کد هم اگر مقدار نبود یا خراب بود به همین‌ها برمی‌گردد.
 *
 * سقف کد پیامکی کل سایت ۳۰۰ در ساعت است (۳ب): دو برابر اوج خوش‌بینانهٔ سفارش (حدود ۱۰۰ سفارش در ساعت
 * شب امتحان، هر کدام کمی بیش از یک کد)، و بدترین هزینهٔ حملهٔ «پیامک‌سازی» با هزار IP و هزار شماره را
 * به ۳۰۰ پیامک در ساعت می‌بندد. در `settings` است تا در حمله یا رشد، بی استقرار عوض شود.
 *
 * تعطیلی‌های ۱۴۰۵ از تقویم رسمی منتشرشده‌اند و تاریخ قمری ۱۴۰۶ پیش‌بینی (`holidays.ts`)؛ پس «تطبیق‌داده‌شده تا» ۱۴۰۵.
 *
 * فایل‌های سفارش ۳۰ روز پس از پست یا لغو پاک می‌شوند (سؤال ۳۶): چاپ دوباره برای بستهٔ گم‌شده یا آسیب‌دیده در همین چند
 * هفته پیش می‌آید، و بیشتر از آن فقط دیسک است.
 *
 * بازه‌های وزن گزارش ارسال همان بازه‌های کرایهٔ تعرفهٔ فعال‌اند (تصمیم ۱۰۱)، تا مالک از گزارش عوضشان کند؛ پیش‌فرض عدد نیست،
 * `'tariff'` است، تا گزارش با هر نسخهٔ تازهٔ تعرفه همراه شود.
 */
export const DEFAULT_SETTINGS: { readonly [K in SettingKey]: Readonly<SettingValue<K>> } = {
  [SLA_DAYS_SETTING]: 2,
  [HOLIDAYS_SETTING]: OFFICIAL_HOLIDAYS,
  [OFFICIAL_THROUGH_SETTING]: 1405,
  [OTP_SITE_LIMIT_SETTING]: 300,
  [FILES_RETENTION_SETTING]: 30,
  [REPORT_BANDS_SETTING]: 'tariff',
};

/**
 * اولین چاپخانه (سؤال ۲۹): چاپخانهٔ خود جزوه‌یار، در شهر تهران (مرکز استان تهران)، پیش‌فرض. همان «چاپخانهٔ جزوه‌یار» طرح پنل.
 */
export const FIRST_PARTNER = {
  name: 'چاپخانهٔ جزوه‌یار',
  cityId: PROVINCES.find((province) => province.name === 'تهران')!.capitalId,
} as const;

/**
 * خواندن یک تنظیم با شکل قرارداد (`SETTING_SCHEMAS`). نبودنش یعنی پیش‌فرض (`DEFAULT_SETTINGS`)؛ مقدار خراب هم
 * پیش‌فرض است، ولی بلند لاگ می‌شود: تعطیلی‌های خراب نباید پرداخت یک سفارش واقعی، یا پیشخوان پنل، را بشکند.
 * سایت و پنل هر دو همین را می‌خوانند.
 */
export async function readSetting<K extends SettingKey>(
  read: (key: string) => Promise<unknown>,
  key: K,
  log: (message: string, error?: unknown) => void = console.error,
): Promise<SettingValue<K>> {
  const fallback = DEFAULT_SETTINGS[key] as SettingValue<K>;
  const raw = await read(key);
  if (raw === undefined || raw === null) return fallback;
  const parsed = SETTING_SCHEMAS[key].safeParse(raw);
  if (parsed.success) return parsed.data as SettingValue<K>;
  log(`✗ تنظیم ${key} شکل درستی ندارد؛ پیش‌فرض به کار رفت.`, parsed.error);
  return fallback;
}

export interface ReferenceSeedResult {
  provinces: number;
  cities: number;
  /** نسخهٔ تعرفه‌ای که درج شد؛ null یعنی از قبل تعرفه بود. */
  priceListInserted: number | null;
  /** تنظیم‌هایی که نبودند و پیش‌فرضشان نشست. */
  settingsInserted: string[];
  /** نام اولین چاپخانه، اگر همین حالا نشست؛ null یعنی از قبل چاپخانه بود. */
  partnerInserted: string | null;
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

    await seedAdminRoles(tx as unknown as Database['db']);

    // پس از شهرها (کلید خارجی دوستونی). فقط وقتی جدول خالی است: چاپخانه‌ای که مالک ویرایش یا اضافه کرده دست نمی‌خورد.
    const [partners] = await tx.select({ n: count() }).from(printPartners);
    let partnerInserted: string | null = null;
    if (partners!.n === 0) {
      const city = findCity(FIRST_PARTNER.cityId)!;
      await tx.insert(printPartners).values({ name: FIRST_PARTNER.name, provinceId: city.provinceId, cityId: city.id, isDefault: true });
      partnerInserted = FIRST_PARTNER.name;
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
      partnerInserted,
    };
  });
}
