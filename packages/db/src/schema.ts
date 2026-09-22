/**
 * اسکیمای پایگاه داده.
 *
 * این فایل شکل جدول‌ها را تعریف می‌کند، نه شکل داده را. شکل داده در
 * `@jozveyar/contracts` است و اینجا فقط آینه می‌شود. هر جا اسم ستونی با اسم
 * فیلد قرارداد فرق دارد، دلیلش در کامنت آمده.
 *
 * دو قاعده که در کل این فایل رعایت شده‌اند:
 *
 * ۱. **پول همیشه `bigint` و ریال است** و نام ستون به `Rials` ختم می‌شود.
 *    حالت `mode: 'number'` انتخاب شده چون قراردادها هم `number` می‌دهند و
 *    بزرگ‌ترین مبلغ ممکن (چند میلیارد ریال) خیلی زیر `MAX_SAFE_INTEGER` است.
 *    ستون در پستگرس `bigint` می‌ماند، پس اگر روزی واحد عوض شد جا هست.
 *
 * ۲. **اعداد خام تحلیل رنگ ذخیره می‌شوند، نه فقط نتیجهٔ بولین.** فایل بعد از
 *    دو روز پاک می‌شود و برنمی‌گردد؛ اگر آستانه‌ها بعداً کالیبره شوند، باید
 *    بشود بدون فایل بازطبقه‌بندی کرد.
 */

import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/* ──────────────────────────── تعرفه ──────────────────────────── */

/**
 * تعرفه نسخه‌دار است و نسخهٔ قدیمی هیچ‌وقت پاک نمی‌شود.
 *
 * قیمت یک سفارش ثبت‌شده هیچ‌وقت بازمحاسبه نمی‌شود؛ سفارش `priceListVersion` را
 * نگه می‌دارد و برای هر سؤالی به همان نسخه رجوع می‌شود.
 */
export const priceLists = pgTable('price_lists', {
  version: integer('version').primaryKey(),
  label: text('label').notNull(),
  /** ریال به‌ازای هر **رو** چاپ‌شده — نه هر برگ. */
  clickRateColorRials: bigint('click_rate_color_rials', { mode: 'number' }).notNull(),
  clickRateBwRials: bigint('click_rate_bw_rials', { mode: 'number' }).notNull(),
  /** `PricingSettings` — مالیات، رُند، وزن بسته‌بندی، مساحت برگ. */
  settings: jsonb('settings').notNull(),
  /** دقیقاً یکی فعال است؛ با ایندکس یکتای جزئی در مهاجرت تضمین می‌شود. */
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paperTypes = pgTable(
  'paper_types',
  {
    priceListVersion: integer('price_list_version')
      .notNull()
      .references(() => priceLists.version, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    nameFa: text('name_fa').notNull(),
    gsm: integer('gsm').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** امروز صفر است؛ کل نرخ در نرخ کلیک نشسته. اهرم تفکیک یکرو/دورو در آینده. */
    ratePerSheetRials: bigint('rate_per_sheet_rials', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.priceListVersion, t.id] })],
);

export const bindingTypes = pgTable(
  'binding_types',
  {
    priceListVersion: integer('price_list_version')
      .notNull()
      .references(() => priceLists.version, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    nameFa: text('name_fa').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** بالای این تعداد **برگ**، سند خودکار به چند جلد می‌شکند. */
    maxSheetsPerVolume: integer('max_sheets_per_volume').notNull(),
    weightPerVolumeGrams: integer('weight_per_volume_grams').notNull(),
  },
  (t) => [primaryKey({ columns: [t.priceListVersion, t.id] })],
);

/**
 * بازه‌های قیمت صحافی — بر حسب **برگ**، نه صفحه.
 *
 * این پرتکرارترین اشتباه این پروژه است: برگ یک ورق است و در حالت دورو دو صفحه
 * دارد. اشتباه گرفتنشان قیمت صحافی را حدود دو برابر می‌کند.
 *
 * همپوشانی بازه‌ها با محدودیت `EXCLUDE` در پایگاه داده جلوگیری می‌شود، نه در
 * کد — چون یک بازهٔ همپوشان یعنی دو قیمت برای یک سند، و کدی که «اولی را
 * برمی‌دارد» فقط خطا را پنهان می‌کند. جزئیات در مهاجرت.
 */
export const bindingRateBands = pgTable(
  'binding_rate_bands',
  {
    priceListVersion: integer('price_list_version').notNull(),
    bindingTypeId: text('binding_type_id').notNull(),
    minSheets: integer('min_sheets').notNull(),
    maxSheets: integer('max_sheets').notNull(),
    priceRials: bigint('price_rials', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.priceListVersion, t.bindingTypeId, t.minSheets] }),
    index('binding_rate_bands_lookup').on(t.priceListVersion, t.bindingTypeId),
    // کلید خارجی به **نوع صحافی** است، نه مستقیم به تعرفه. این هم تعرفه را
    // پوشش می‌دهد (چون خود نوع صحافی به تعرفه وصل است) و هم یک چیز بیشتر
    // تضمین می‌کند: بازه نمی‌تواند به نوع صحافی‌ای اشاره کند که وجود ندارد.
    foreignKey({
      columns: [t.priceListVersion, t.bindingTypeId],
      foreignColumns: [bindingTypes.priceListVersion, bindingTypes.id],
      name: 'binding_rate_bands_binding_type_fk',
    }).onDelete('cascade'),
  ],
);

export const shippingMethods = pgTable(
  'shipping_methods',
  {
    priceListVersion: integer('price_list_version')
      .notNull()
      .references(() => priceLists.version, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    nameFa: text('name_fa').notNull(),
    enabled: boolean('enabled').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.priceListVersion, t.id] })],
);

/**
 * نرخ ارسال بر حسب بازهٔ وزن.
 *
 * `maxWeightGrams` نال‌پذیر است و **null یعنی بدون سقف**. قرارداد هم دقیقاً
 * همین را می‌گوید، پس هیچ تبدیلی بین جدول و قرارداد لازم نیست.
 *
 * قبلاً قرارداد `Infinity` می‌خواست و همین یک باگ بود: zod نسخهٔ ۴ ردش می‌کند
 * و `JSON.stringify(Infinity)` هم `null` می‌دهد، یعنی سقف در راه سرور به
 * مرورگر بی‌صدا گم می‌شد و سنگین‌ترین سفارش‌ها بدون کرایه قیمت می‌خوردند.
 */
export const shippingRates = pgTable(
  'shipping_rates',
  {
    priceListVersion: integer('price_list_version').notNull(),
    methodId: text('method_id').notNull(),
    zoneId: text('zone_id').notNull(),
    minWeightGrams: integer('min_weight_grams').notNull(),
    maxWeightGrams: integer('max_weight_grams'),
    priceRials: bigint('price_rials', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.priceListVersion, t.methodId, t.zoneId, t.minWeightGrams] }),
    index('shipping_rates_lookup').on(t.priceListVersion, t.methodId, t.zoneId),
    // مثل بازه‌های صحافی: کلید خارجی به روش ارسال، که خودش به تعرفه وصل است.
    // بدون این، یک نرخ می‌توانست به روشی اشاره کند که وجود ندارد و کرایه بی‌صدا
    // پیدا نشود.
    foreignKey({
      columns: [t.priceListVersion, t.methodId],
      foreignColumns: [shippingMethods.priceListVersion, shippingMethods.id],
      name: 'shipping_rates_method_fk',
    }).onDelete('cascade'),
  ],
);

/* ──────────────────────────── تنظیمات ──────────────────────────── */

/**
 * تنظیمات سطح اپ که تعرفه نیستند — مثل `features.per_page_color`.
 *
 * جدا از `price_lists.settings` است چون نسخه‌دار نیست: عوض کردنش نباید قیمت
 * سفارش‌های قبلی را دست بزند.
 */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ──────────────────────────── سند ──────────────────────────── */

export const documentStatus = pgEnum('document_status', [
  'pending',
  'uploading',
  'uploaded',
  'analyzing',
  'ready',
  'failed',
]);

export const sourceKind = pgEnum('source_kind', ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'image']);

/** کدام طرف این تحلیل را ساخته. هر دو ذخیره می‌شوند — دلیلش پایین آمده. */
export const analysisSource = pgEnum('analysis_source', ['browser', 'server']);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * فایل خام بعد از این لحظه پاک می‌شود (یک تا دو روز).
     * ردیف سند و تحلیلش می‌مانند؛ فقط بایت‌ها می‌روند.
     */
    fileExpiresAt: timestamp('file_expires_at', { withTimezone: true }),
    fileDeletedAt: timestamp('file_deleted_at', { withTimezone: true }),
    /** نام اصلی، فارسی‌نرمال‌شده با `@jozveyar/text`. */
    originalName: text('original_name').notNull(),
    sourceKind: sourceKind('source_kind').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** کلید در آبجکت استوریج. تا وقتی آپلود تمام نشده null است. */
    storageKey: text('storage_key'),
    status: documentStatus('status').notNull().default('pending'),
    /** از تحلیل سرور می‌آید. تا آن موقع null. */
    pageCount: integer('page_count'),
    failureReason: text('failure_reason'),

    /* ── آپلود (ADR-024) ── */

    /**
     * مالک ناشناس: SHA-256 کوکی نشست، به hex.
     *
     * قبل از پرداخت هیچ هویتی نیست، پس مالک سند مرورگری است که آپلودش کرده.
     * خود کوکی هیچ‌وقت اینجا نمی‌نشیند: نشت پایگاه داده نباید به کسی اجازهٔ
     * تکمیل یا لغو آپلود دیگری را بدهد.
     */
    sessionHash: text('session_hash').notNull(),
    /** شناسهٔ آپلود چندتکه در استوریج. */
    uploadId: text('upload_id'),
    /** اندازهٔ تکه، تا ادامهٔ آپلود بعد از رفرش دقیقاً همان تکه‌بندی را بسازد. */
    partSizeBytes: integer('part_size_bytes'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
  },
  (t) => [
    index('documents_status').on(t.status),
    /** برای کار پاک‌سازی: کدام فایل‌ها منقضی شده‌اند و هنوز پاک نشده‌اند. */
    index('documents_file_expiry').on(t.fileExpiresAt),
    /** سقف آپلود باز هم‌زمان برای هر نشست. */
    index('documents_session').on(t.sessionHash, t.status),
  ],
);

/**
 * یک دور تحلیل کامل روی یک سند.
 *
 * **چرا تحلیل مرورگر هم ذخیره می‌شود، وقتی سرور منبع حقیقت است؟**
 * چون بدون آن نمی‌شود فهمید چقدر واگرا می‌شوند. قیمت مرورگر پیش‌فاکتور است و
 * اگر روزی با سرور اختلاف پیدا کند، این دو ردیف تنها جایی است که علت را نشان
 * می‌دهد. ذخیره‌اش ارزان است و نبودش یعنی تشخیص کور.
 */
export const documentAnalyses = pgTable(
  'document_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    source: analysisSource('source').notNull(),
    /** شناسهٔ پیاده‌سازی، مثلاً `browser-pdfjs-4.10`. نسخه عمداً داخلش است. */
    engine: text('engine').notNull(),
    /** `DetectionThresholds` — همان آستانه‌هایی که این نتیجه را ساختند. */
    thresholds: jsonb('thresholds').notNull(),
    pageCount: integer('page_count').notNull(),
    /** true یعنی همهٔ صفحات تحلیل نشده‌اند و نتیجه برآوردی است. */
    sampled: boolean('sampled').notNull().default(false),
    sampleStride: integer('sample_stride').notNull().default(1),
    elapsedMs: integer('elapsed_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('document_analyses_document').on(t.documentId, t.source)],
);

/**
 * تحلیل هر صفحه — یک ردیف به‌ازای هر صفحه.
 *
 * این تنها جایی است که «یک ردیف به‌ازای هر صفحه» درست است. انتخاب رنگ کاربر
 * به شکل قاعده با بازهٔ صفحه ذخیره می‌شود، نه سطر به سطر؛ ولی *تحلیل* ذاتاً
 * per-page است و اعداد خامش باید بمانند.
 */
export const documentPages = pgTable(
  'document_pages',
  {
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => documentAnalyses.id, { onDelete: 'cascade' }),
    /** شمارهٔ صفحه، ۱-مبنا. */
    n: integer('n').notNull(),
    widthPt: real('width_pt').notNull(),
    heightPt: real('height_pt').notNull(),
    rotation: smallint('rotation').notNull().default(0),

    /** نتیجهٔ طبقه‌بندی با آستانه‌های ذخیره‌شده در ردیف تحلیل. */
    color: boolean('color').notNull(),
    blank: boolean('blank').notNull().default(false),

    /* ── اعداد خام: اینها هستند که بازطبقه‌بندی بدون فایل را ممکن می‌کنند ── */
    colorRatio: doublePrecision('color_ratio').notNull(),
    coloredInkRatio: doublePrecision('colored_ink_ratio').notNull(),
    chromaP95: doublePrecision('chroma_p95').notNull(),
    inkRatio: doublePrecision('ink_ratio').notNull(),
    /** ته‌رنگ برآوردی کاغذ (همان زردی اسکن) به‌صورت `[r,g,b]`. */
    paperCast: jsonb('paper_cast').notNull(),

    /** DPI برآوردی بزرگ‌ترین تصویر صفحه؛ برای صفحهٔ متنی null. */
    estimatedDpi: real('estimated_dpi'),
    minMarginMm: real('min_margin_mm'),
    warnings: text('warnings').array().notNull().default([]),
  },
  (t) => [primaryKey({ columns: [t.analysisId, t.n] })],
);
