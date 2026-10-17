/**
 * تعرفهٔ پایه — نسخهٔ ۱.
 *
 * نسخهٔ ۱ پایگاه داده همین است (`seedReferenceData` با بالا آمدن وب، اگر نباشد)، و تست‌ها و پیش‌نمایش پنل با آن قیمت
 * می‌دهند. از برش ۴٫۵ هر تعرفهٔ تازه پیش‌نویسی از روی نسخهٔ فعال در پنل است و این فایل فقط تعرفهٔ پایه می‌ماند.
 *
 * شکلش از ۸٫۳ است (نرخ هر اندازه × یکرو یا دورو × رنگ، نرخ کاغذ و بازهٔ صحافی برای هر اندازه)، ولی قیمتش همان: فقط A4،
 * و یکرو و دورو یک نرخ، همان که مهاجرت 0038 از نسخهٔ ۱ پایگاه داده می‌سازد.
 *
 * همهٔ مبالغ **ریال** است (تومان × ۱۰).
 */

import type { PriceList } from '@jozveyar/contracts';

export const SEED_PRICE_LIST: PriceList = {
  version: 1,
  label: 'تعرفهٔ پایه — شهریور ۱۴۰۵',

  // ریال به‌ازای هر **رو** چاپ‌شده. رنگی ۲۰۰۰ و سیاه‌سفید ۱۶۰۰ تومان، یکرو و دورو یکی. A5 و A3 تا نرخشان وارد
  // نشده ارائه نمی‌شوند (سؤال ۱۸۳).
  printRates: {
    a4: {
      single: { color: 20_000, bw: 16_000 },
      double: { color: 20_000, bw: 16_000 },
    },
  },

  paperTypes: {
    // نرخ هر برگ تحریر صفر است، چون کل هزینه در نرخ هر رو نشسته؛ کاغذ دیگر (گلاسه) نرخ خودش را می‌گیرد.
    tahrir80: {
      nameFa: 'تحریر ۸۰ گرم',
      gsm: 80,
      enabled: true,
      sheetRates: { a4: 0 },
    },
  },

  bindingTypes: {
    // بازه‌ها بر حسب **برگ** است، نه صفحه.
    // صحافی‌های دیگر (منگنه، چسب گرم، کاور…) را مالک از پنل می‌افزاید (سؤال ۱۸۵).
    spiral_clear: {
      nameFa: 'طلق و سیم',
      enabled: true,
      minSheets: 1,
      maxSheetsPerVolume: 800,
      // بالای ۸۰۰ برگ خودکار چند جلد.
      splitsVolumes: true,
      weightPerVolumeGrams: 60,
      bands: {
        a4: [
          { minSheets: 1, maxSheets: 150, priceRials: 450_000 },
          { minSheets: 151, maxSheets: 300, priceRials: 500_000 },
          { minSheets: 301, maxSheets: 450, priceRials: 550_000 },
          { minSheets: 451, maxSheets: 600, priceRials: 620_000 },
          { minSheets: 601, maxSheets: 700, priceRials: 680_000 },
          { minSheets: 701, maxSheets: 800, priceRials: 780_000 },
        ],
      },
    },
  },

  shippingMethods: {
    post: { nameFa: 'پست پیشتاز', enabled: true },
    // زیرساخت آماده است؛ از پنل ادمین روشن می‌شوند.
    tipax: { nameFa: 'تیپاکس', enabled: false },
    courier: { nameFa: 'پیک موتوری', enabled: false },
    pickup: { nameFa: 'تحویل حضوری', enabled: false },
  },

  /**
   * نرخ‌ها از میانهٔ ۴۱ مرسولهٔ واقعی (دو فایل پست، ۱۴۰۵/۰۶/۰۷ و ۱۴۰۵/۰۶/۲۲).
   *
   * کرایه تقریباً ثابت است: وزن از ۲۵۰ به ۵۱۰۰ گرم می‌رود و کرایه فقط حدود
   * ۲۶,۰۰۰ تومان بالا می‌رود. پس سه بازهٔ وزن کافی است و ریزدانه‌تر کردنش
   * ارزشی ندارد تا دادهٔ بیشتری جمع شود. (ADR-011)
   *
   * سقف بازهٔ آخر `null` است، نه `Infinity`: آن مقدار از zod رد می‌شد و از
   * JSON هم زنده بیرون نمی‌آمد. توضیح کامل در قرارداد `shippingRateSchema`.
   *
   * منطقهٔ `tehran` یعنی **استان** تهران، نه فقط شهر تهران: پست پیشتاز کرایه را
   * درون‌استانی و برون‌استانی حساب می‌کند، پس پردیس و قرچک هم‌کرایهٔ خود تهران‌اند و کرج
   * (البرز) در `other` است (سؤال ۹، ۱۴۰۵/۰۷/۰۴). منطقهٔ هر استان در `@jozveyar/geo`.
   *
   * نقاط دادهٔ تهران کم است؛ بازهٔ بالای ۳ کیلو هیچ نمونه‌ای ندارد و محافظه‌کارانه
   * تخمین زده شده.
   */
  shippingRates: [
    { methodId: 'post', zoneId: 'tehran', minWeightGrams: 0, maxWeightGrams: 1_000, priceRials: 1_295_000 },
    { methodId: 'post', zoneId: 'tehran', minWeightGrams: 1_000, maxWeightGrams: 3_000, priceRials: 1_500_000 },
    { methodId: 'post', zoneId: 'tehran', minWeightGrams: 3_000, maxWeightGrams: null, priceRials: 2_000_000 },
    { methodId: 'post', zoneId: 'other', minWeightGrams: 0, maxWeightGrams: 1_000, priceRials: 1_377_500 },
    { methodId: 'post', zoneId: 'other', minWeightGrams: 1_000, maxWeightGrams: 3_000, priceRials: 1_618_120 },
    { methodId: 'post', zoneId: 'other', minWeightGrams: 3_000, maxWeightGrams: null, priceRials: 2_072_000 },
  ],

  settings: {
    minOrderRials: 0,
    // رُند غیرفعال: اعداد تعرفه از قبل رُندند و رُند کردن فقط ریز قیمت را گیج می‌کند.
    roundingStepRials: 0,
    // نماد الکترونیک هنوز فعال نیست، پس مالیات صفر است. جای عدد در مدل باز است.
    vatPercent: 0,
    packagingWeightGrams: 100,
  },

  // تخفیف سفارش بزرگ (برش ۱۱٫۴): تعرفهٔ پایه هیچ پله‌ای ندارد؛ مالک از پنل می‌افزاید.
  discountTiers: [],
};

/**
 * شناسهٔ کاغذ و صحافی پیش‌فرض — همان‌هایی که UI با آن شروع می‌کند، و جای گزینه‌ای که به جزوه نمی‌خورد. پنل پاک و خاموششان
 * نمی‌کند و هر اندازهٔ ارائه‌شده را باید داشته باشند (۸٫۳)، پس جزوه همیشه کاغذ و صحافی‌ای دارد.
 */
export const DEFAULT_PAPER_TYPE_ID = 'tahrir80';
export const DEFAULT_BINDING_TYPE_ID = 'spiral_clear';
export const DEFAULT_SHIPPING_METHOD_ID = 'post';
