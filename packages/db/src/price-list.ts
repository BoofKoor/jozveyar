/**
 * تبدیل بین ردیف‌های پایگاه داده و قرارداد `PriceList`.
 *
 * موتور قیمت (`@jozveyar/pricing`) یک `PriceList` می‌خواهد و نمی‌داند پایگاه
 * داده وجود دارد — همین باعث می‌شود بشود همان کد را در مرورگر هم اجرا کرد.
 * پس تبدیل باید دقیقاً **اینجا** باشد و هیچ‌جای دیگر.
 *
 * ساختن همین فایل یک باگ قدیمی را بیرون انداخت. قرارداد می‌گفت سقف بازهٔ آخرِ
 * وزن ارسال `Infinity` باشد، ولی zod نسخهٔ ۴ آن را رد می‌کند و
 * `JSON.stringify(Infinity)` هم `null` می‌دهد. یعنی همین که تعرفه از سرور به
 * مرورگر می‌رفت، سقف بی‌صدا `null` می‌شد و سنگین‌ترین سفارش‌ها بدون کرایه
 * قیمت می‌خوردند. قرارداد اصلاح شد و حالا `null` یعنی بدون سقف — همان چیزی
 * که ستون nullable پستگرس هم می‌گوید.
 *
 * نتیجه‌اش این است که این فایل **هیچ تبدیلی ندارد**: شکل قرارداد و شکل جدول
 * یکی است. وقتی یک لایهٔ تبدیل خالی از آب درمی‌آید، معمولاً یعنی مدل درست شده.
 */

import {
  priceListSchema,
  type PriceList,
  type PricingSettings,
  type ShippingRate,
} from '@jozveyar/contracts';

import {
  bindingRateBands,
  bindingTypes,
  paperTypes,
  priceLists,
  shippingMethods,
  shippingRates,
} from './schema.js';

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export interface PriceListRows {
  priceList: Insert<typeof priceLists>;
  paperTypes: Insert<typeof paperTypes>[];
  bindingTypes: Insert<typeof bindingTypes>[];
  bindingRateBands: Insert<typeof bindingRateBands>[];
  shippingMethods: Insert<typeof shippingMethods>[];
  shippingRates: Insert<typeof shippingRates>[];
}

/** `PriceList` → ردیف‌های آمادهٔ درج. ترتیب درج: همین ترتیب فیلدها. */
export function priceListToRows(list: PriceList, isActive = false): PriceListRows {
  const version = list.version;

  return {
    priceList: {
      version,
      label: list.label,
      clickRateColorRials: list.clickRates.color ?? 0,
      clickRateBwRials: list.clickRates.bw ?? 0,
      settings: list.settings,
      isActive,
    },

    paperTypes: Object.entries(list.paperTypes).map(([id, p]) => ({
      priceListVersion: version,
      id,
      nameFa: p.nameFa,
      gsm: p.gsm,
      enabled: p.enabled,
      ratePerSheetRials: p.ratePerSheetRials,
    })),

    bindingTypes: Object.entries(list.bindingTypes).map(([id, b]) => ({
      priceListVersion: version,
      id,
      nameFa: b.nameFa,
      enabled: b.enabled,
      maxSheetsPerVolume: b.maxSheetsPerVolume,
      weightPerVolumeGrams: b.weightPerVolumeGrams,
    })),

    bindingRateBands: Object.entries(list.bindingTypes).flatMap(([bindingTypeId, b]) =>
      b.bands.map((band) => ({
        priceListVersion: version,
        bindingTypeId,
        minSheets: band.minSheets,
        maxSheets: band.maxSheets,
        priceRials: band.priceRials,
      })),
    ),

    shippingMethods: Object.entries(list.shippingMethods).map(([id, m]) => ({
      priceListVersion: version,
      id,
      nameFa: m.nameFa,
      enabled: m.enabled,
    })),

    shippingRates: list.shippingRates.map((r) => ({
      priceListVersion: version,
      methodId: r.methodId,
      zoneId: r.zoneId,
      minWeightGrams: r.minWeightGrams,
      maxWeightGrams: r.maxWeightGrams,
      priceRials: r.priceRials,
    })),
  };
}

/** ردیف‌های خوانده‌شده → `PriceList`. خروجی با zod اعتبارسنجی می‌شود. */
export function rowsToPriceList(rows: {
  priceList: typeof priceLists.$inferSelect;
  paperTypes: (typeof paperTypes.$inferSelect)[];
  bindingTypes: (typeof bindingTypes.$inferSelect)[];
  bindingRateBands: (typeof bindingRateBands.$inferSelect)[];
  shippingMethods: (typeof shippingMethods.$inferSelect)[];
  shippingRates: (typeof shippingRates.$inferSelect)[];
}): PriceList {
  const bandsByType = new Map<string, typeof rows.bindingRateBands>();
  for (const band of rows.bindingRateBands) {
    const list = bandsByType.get(band.bindingTypeId) ?? [];
    list.push(band);
    bandsByType.set(band.bindingTypeId, list);
  }

  const built = {
    version: rows.priceList.version,
    label: rows.priceList.label,
    clickRates: {
      color: rows.priceList.clickRateColorRials,
      bw: rows.priceList.clickRateBwRials,
    },

    paperTypes: Object.fromEntries(
      rows.paperTypes.map((p) => [
        p.id,
        {
          nameFa: p.nameFa,
          gsm: p.gsm,
          enabled: p.enabled,
          ratePerSheetRials: p.ratePerSheetRials,
        },
      ]),
    ),

    bindingTypes: Object.fromEntries(
      rows.bindingTypes.map((b) => [
        b.id,
        {
          nameFa: b.nameFa,
          enabled: b.enabled,
          maxSheetsPerVolume: b.maxSheetsPerVolume,
          weightPerVolumeGrams: b.weightPerVolumeGrams,
          // مرتب‌سازی اینجا انجام می‌شود، نه در کوئری: موتور قیمت ترتیب را
          // فرض نمی‌کند ولی خروجی مرتب، مقایسهٔ دو نسخهٔ تعرفه را ممکن می‌کند.
          bands: (bandsByType.get(b.id) ?? [])
            .slice()
            .sort((x, y) => x.minSheets - y.minSheets)
            .map((band) => ({
              minSheets: band.minSheets,
              maxSheets: band.maxSheets,
              priceRials: band.priceRials,
            })),
        },
      ]),
    ),

    shippingMethods: Object.fromEntries(
      rows.shippingMethods.map((m) => [m.id, { nameFa: m.nameFa, enabled: m.enabled }]),
    ),

    // ترتیب **کامل** لازم است، نه فقط بر اساس وزن: چند منطقه می‌توانند
    // `minWeightGrams` یکسان داشته باشند (تهران و سایر هر دو از صفر شروع
    // می‌شوند) و آن‌وقت مرتب‌سازی تک‌کلیدی ترتیب ورودی را نگه می‌دارد — که
    // پستگرس بدون ORDER BY تضمینش نمی‌کند. نتیجه: خروجی‌ای که ظاهراً مرتب
    // است ولی بین دو اجرا فرق می‌کند.
    shippingRates: rows.shippingRates
      .slice()
      .sort(
        (a, b) =>
          a.methodId.localeCompare(b.methodId) ||
          a.zoneId.localeCompare(b.zoneId) ||
          a.minWeightGrams - b.minWeightGrams,
      )
      .map(
        (r): ShippingRate => ({
          methodId: r.methodId,
          zoneId: r.zoneId,
          minWeightGrams: r.minWeightGrams,
          maxWeightGrams: r.maxWeightGrams,
          priceRials: r.priceRials,
        }),
      ),

    settings: rows.priceList.settings as PricingSettings,
  };

  // اعتبارسنجی عمدی است و حذف نمی‌شود: ستون‌های jsonb هر چیزی را قبول می‌کنند،
  // و یک `settings` خراب باید همین‌جا بترکد، نه وسط محاسبهٔ قیمت یک سفارش واقعی.
  return priceListSchema.parse(built);
}
