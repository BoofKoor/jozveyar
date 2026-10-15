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
 *
 * از ۸٫۳ نرخ‌ها برای هر اندازه‌اند: قرارداد آن‌ها را شیء تودرتو می‌گیرد (`printRates.a4.double.bw`) و جدول ردیف (`print_rates`
 * با اندازه، یکرو یا دورو، و رنگ)؛ کاغذ و بازهٔ صحافی هم همین‌طور. تبدیل فقط باز و بسته کردن همین است، بی هیچ پیش‌فرضی: اندازه‌ای
 * که ردیف ندارد در قرارداد هم نیست.
 */

import {
  priceListSchema,
  type ColorMode,
  type PaperSize,
  type PriceList,
  type PricingSettings,
  type ShippingRate,
  type SidesMode,
} from '@jozveyar/contracts';

import {
  bindingRateBands,
  bindingTypes,
  paperRates,
  paperTypes,
  priceLists,
  printRates,
  shippingMethods,
  shippingRates,
} from './schema.js';

/** اندازه‌ها، حالت‌ها و رنگ‌ها به ترتیب ثابت: ردیف‌ها و کلیدهای قرارداد همیشه به همین ترتیب. */
const SIZES: readonly PaperSize[] = ['a4', 'a5', 'a3'];
const SIDES: readonly SidesMode[] = ['single', 'double'];
const COLORS: readonly ColorMode[] = ['color', 'bw'];

/** کلیدهای شیء به ترتیب `order`، با مقدار تعریف‌شده. */
function entriesIn<K extends string, V>(record: Partial<Record<K, V>>, order: readonly K[]): [K, V][] {
  return order.flatMap((key) => (record[key] === undefined ? [] : [[key, record[key] as V]]));
}

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert'];

export interface PriceListRows {
  priceList: Insert<typeof priceLists>;
  printRates: Insert<typeof printRates>[];
  paperTypes: Insert<typeof paperTypes>[];
  paperRates: Insert<typeof paperRates>[];
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
      settings: list.settings,
      isActive,
    },

    printRates: entriesIn(list.printRates, SIZES).flatMap(([paperSize, rate]) =>
      SIDES.flatMap((sidesMode) =>
        COLORS.map((colorMode) => ({
          priceListVersion: version,
          paperSize,
          sidesMode,
          colorMode,
          rateRials: rate[sidesMode][colorMode],
        })),
      ),
    ),

    paperTypes: Object.entries(list.paperTypes).map(([id, p]) => ({
      priceListVersion: version,
      id,
      nameFa: p.nameFa,
      gsm: p.gsm,
      enabled: p.enabled,
    })),

    paperRates: Object.entries(list.paperTypes).flatMap(([paperTypeId, p]) =>
      entriesIn(p.sheetRates, SIZES).map(([paperSize, rateRials]) => ({
        priceListVersion: version,
        paperTypeId,
        paperSize,
        rateRials,
      })),
    ),

    bindingTypes: Object.entries(list.bindingTypes).map(([id, b]) => ({
      priceListVersion: version,
      id,
      nameFa: b.nameFa,
      enabled: b.enabled,
      minSheets: b.minSheets,
      maxSheetsPerVolume: b.maxSheetsPerVolume,
      splitsVolumes: b.splitsVolumes,
      weightPerVolumeGrams: b.weightPerVolumeGrams,
    })),

    bindingRateBands: Object.entries(list.bindingTypes).flatMap(([bindingTypeId, b]) =>
      entriesIn(b.bands, SIZES).flatMap(([paperSize, bands]) =>
        bands.map((band) => ({
          priceListVersion: version,
          bindingTypeId,
          paperSize,
          minSheets: band.minSheets,
          maxSheets: band.maxSheets,
          priceRials: band.priceRials,
        })),
      ),
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
  printRates: (typeof printRates.$inferSelect)[];
  paperTypes: (typeof paperTypes.$inferSelect)[];
  paperRates: (typeof paperRates.$inferSelect)[];
  bindingTypes: (typeof bindingTypes.$inferSelect)[];
  bindingRateBands: (typeof bindingRateBands.$inferSelect)[];
  shippingMethods: (typeof shippingMethods.$inferSelect)[];
  shippingRates: (typeof shippingRates.$inferSelect)[];
}): PriceList {
  // نرخ هر رو: اندازه ← یکرو یا دورو ← رنگ. اندازه‌ای که ردیف ندارد کلید هم ندارد؛ اندازهٔ نیمه‌کاره را zod پایین رد می‌کند
  // (و پایگاه داده پیش از آن، `print_rates_complete`).
  const printRatesBySize: Partial<Record<PaperSize, Partial<Record<SidesMode, Partial<Record<ColorMode, number>>>>>> = {};
  for (const size of SIZES) {
    for (const rate of rows.printRates) {
      if (rate.paperSize !== size) continue;
      const bySides = (printRatesBySize[size] ??= {});
      (bySides[rate.sidesMode] ??= {})[rate.colorMode] = rate.rateRials;
    }
  }

  const bandsOf = (bindingTypeId: string) =>
    Object.fromEntries(
      SIZES.flatMap((size) => {
        // مرتب‌سازی اینجا انجام می‌شود، نه در کوئری: موتور قیمت ترتیب را
        // فرض نمی‌کند ولی خروجی مرتب، مقایسهٔ دو نسخهٔ تعرفه را ممکن می‌کند.
        const bands = rows.bindingRateBands
          .filter((band) => band.bindingTypeId === bindingTypeId && band.paperSize === size)
          .sort((x, y) => x.minSheets - y.minSheets)
          .map((band) => ({ minSheets: band.minSheets, maxSheets: band.maxSheets, priceRials: band.priceRials }));
        return bands.length > 0 ? [[size, bands]] : [];
      }),
    );

  const sheetRatesOf = (paperTypeId: string) =>
    Object.fromEntries(
      SIZES.flatMap((size) => {
        const rate = rows.paperRates.find((r) => r.paperTypeId === paperTypeId && r.paperSize === size);
        return rate ? [[size, rate.rateRials]] : [];
      }),
    );

  const built = {
    version: rows.priceList.version,
    label: rows.priceList.label,
    printRates: printRatesBySize,

    paperTypes: Object.fromEntries(
      rows.paperTypes.map((p) => [
        p.id,
        {
          nameFa: p.nameFa,
          gsm: p.gsm,
          enabled: p.enabled,
          sheetRates: sheetRatesOf(p.id),
        },
      ]),
    ),

    bindingTypes: Object.fromEntries(
      rows.bindingTypes.map((b) => [
        b.id,
        {
          nameFa: b.nameFa,
          enabled: b.enabled,
          minSheets: b.minSheets,
          maxSheetsPerVolume: b.maxSheetsPerVolume,
          splitsVolumes: b.splitsVolumes,
          weightPerVolumeGrams: b.weightPerVolumeGrams,
          bands: bandsOf(b.id),
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
