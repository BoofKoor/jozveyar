/**
 * تعرفهٔ پایه — نسخهٔ ۱.
 *
 * این همان چیزی است که بعداً به جدول‌های `price_lists`، `binding_rate_bands` و
 * `shipping_rates` منتقل می‌شود و از پنل ادمین ویرایش می‌شود. تا آن موقع، تنها
 * منبع تعرفه همین فایل است.
 *
 * همهٔ مبالغ **ریال** است (تومان × ۱۰).
 */

import type { PriceList } from '@jozveyar/contracts';

/** مساحت یک برگ A4 به متر مربع — مبنای محاسبهٔ وزن. */
export const A4_AREA_M2 = 0.06237;

export const SEED_PRICE_LIST: PriceList = {
  version: 1,
  label: 'تعرفهٔ پایه — شهریور ۱۴۰۵',

  // ریال به‌ازای هر **رو** چاپ‌شده. رنگی ۲۰۰۰ و سیاه‌سفید ۱۶۰۰ تومان.
  clickRates: {
    color: 20_000,
    bw: 16_000,
  },

  paperTypes: {
    // فعلاً یک نوع کاغذ. نرخ به‌ازای برگ صفر است چون کل هزینه در نرخ کلیک نشسته؛
    // روزی که یکرو و دورو قیمت متفاوت بگیرند، عدد بین این دو جابه‌جا می‌شود.
    tahrir80: {
      nameFa: 'تحریر ۸۰ گرم',
      gsm: 80,
      enabled: true,
      ratePerSheetRials: 0,
    },
  },

  bindingTypes: {
    // بازه‌ها بر حسب **برگ** است، نه صفحه.
    spiral_clear: {
      nameFa: 'طلق و سیم',
      enabled: true,
      maxSheetsPerVolume: 800,
      weightPerVolumeGrams: 60,
      bands: [
        { minSheets: 1, maxSheets: 150, priceRials: 450_000 },
        { minSheets: 151, maxSheets: 300, priceRials: 500_000 },
        { minSheets: 301, maxSheets: 450, priceRials: 550_000 },
        { minSheets: 451, maxSheets: 600, priceRials: 620_000 },
        { minSheets: 601, maxSheets: 700, priceRials: 680_000 },
        { minSheets: 701, maxSheets: 800, priceRials: 780_000 },
      ],
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
    sheetAreaM2: A4_AREA_M2,
  },
};

/** شناسهٔ کاغذ و صحافی پیش‌فرض — همان‌هایی که UI با آن شروع می‌کند. */
export const DEFAULT_PAPER_TYPE_ID = 'tahrir80';
export const DEFAULT_BINDING_TYPE_ID = 'spiral_clear';
export const DEFAULT_SHIPPING_METHOD_ID = 'post';
