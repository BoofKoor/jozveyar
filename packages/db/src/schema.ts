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

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
 * منطقه‌های کرایه: `tehran` (استان تهران) و `other` (بقیهٔ کشور). نسخه‌دار نیست — جغرافیاست، نه
 * تعرفه — و نرخ‌های هر نسخهٔ تعرفه به آن اشاره می‌کنند. دو ردیفش در خود مهاجرت درج می‌شود، پیش از
 * کلید خارجی نرخ‌ها؛ نامشان را `seedReferenceData` از `@jozveyar/geo` به‌روز نگه می‌دارد.
 */
export const shippingZones = pgTable('shipping_zones', {
  id: text('id').primaryKey(),
  nameFa: text('name_fa').notNull(),
});

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
    // نرخ برای منطقه‌ای که هیچ استانی در آن نیست، کرایه‌ای است که هیچ‌وقت خوانده نمی‌شود؛ و
    // منطقه‌ای که نرخ ندارد، سفارش آن استان را بی کرایه می‌گذاشت (تست `@jozveyar/geo` این دومی را می‌سنجد).
    foreignKey({
      columns: [t.zoneId],
      foreignColumns: [shippingZones.id],
      name: 'shipping_rates_zone_fk',
    }),
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
  /** Word، پاورپوینت یا عکس در حال تبدیل به PDF (برش ۲ب، ADR-028). */
  'converting',
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

    /* ── تبدیل (ADR-028) ── */

    /**
     * PDF یکدستی که تحلیل و چاپ رویش انجام می‌شود. برای PDF همان null است و
     * خود `storageKey` خوانده می‌شود؛ برای Word و پاورپوینت و عکس، خروجی
     * تبدیل کارگر زیر همان پیشوند `uploads/`، پس با همان قاعدهٔ نگهداری پاک
     * می‌شود.
     */
    pdfStorageKey: text('pdf_storage_key'),
    /** حجم PDF تبدیل‌شده — بودجهٔ دیسک آن را هم می‌شمارد. */
    pdfSizeBytes: bigint('pdf_size_bytes', { mode: 'number' }),
    /**
     * سابقهٔ تبدیل: موتور و نسخه، فرمت واقعی (از محتوا، نه پسوند)، زمان، تعداد
     * صفحه‌ای که خود Word یا پاورپوینت داخل فایل نوشته بود، و فونت‌هایی که
     * خواسته شد و جایگزین شد. خام نگه داشته می‌شود، مثل اعداد تحلیل: فایل دو
     * روز بعد پاک می‌شود و این تنها ردِ اختلاف صفحه‌بندی ماست.
     */
    conversion: jsonb('conversion'),
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

/* ──────────────────────────── صف کار ──────────────────────────── */

/**
 * صف کار در پستگرس (ADR-004)، نه یک بروکر جدا.
 *
 * کارگر با `FOR UPDATE SKIP LOCKED` کار برمی‌دارد، پس چند کارگر — روی همین
 * سرور یا روزی روی نودهای دیگر — بدون هماهنگی اضافه کنار هم کار می‌کنند.
 *
 * «اجاره» (`locked_until`): کارگری که وسط کار بمیرد کارش را قفل نگه نمی‌دارد؛
 * بعد از انقضای اجاره، کار دوباره برداشتنی است و یک تلاش حساب می‌شود.
 */
export const jobStatus = pgEnum('job_status', ['queued', 'running', 'done', 'failed']);

export const jobs = pgTable(
  'jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** نوع کار، مثلاً `analyze_document`. کارگر فقط نوع‌هایی را برمی‌دارد که می‌شناسد. */
    kind: text('kind').notNull(),
    /** سندی که کار رویش است؛ پاک شدن سند، کارش را هم پاک می‌کند. */
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
    /**
     * سفارشی که کار رویش است — ساختن PDF جزوه بعد از پرداخت (`prepare_order`، برش ۳). هر کار یا مال
     * یک سند است یا یک سفارش، نه هر دو.
     */
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull().default({}),
    status: jobStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    /** زودتر از این برداشته نمی‌شود — برای عقب‌نشینی بعد از شکست. */
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedBy: text('locked_by'),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('jobs_ready').on(t.status, t.runAfter),
    /** هر سند یک کار از هر نوع؛ درج دوباره (مثلاً تکمیل تکراری) کار دوم نمی‌سازد. */
    uniqueIndex('jobs_document_kind').on(t.documentId, t.kind),
    /** همین برای سفارش: برگشت دوباره از درگاه، PDF دوم نمی‌سازد. */
    uniqueIndex('jobs_order_kind').on(t.orderId, t.kind),
    check('jobs_one_target', sql`${t.documentId} IS NULL OR ${t.orderId} IS NULL`),
  ],
);

/* ──────────────────────────── جای ارسال (برش ۳) ──────────────────────────── */

/**
 * استان‌ها و شهرها، از `@jozveyar/geo` (همان داده‌ای که مرورگر در قدم شهر می‌خواند). هنگام بالا
 * آمدن سرور `seedReferenceData` پرشان می‌کند؛ شناسه‌ها پایدارند و هیچ ردیفی پاک نمی‌شود، چون سفارش
 * به آن اشاره می‌کند.
 *
 * منطقهٔ کرایه مال استان است، نه شهر: «تهران» در تعرفه یعنی استان تهران (سؤال ۹، ۱۴۰۵/۰۷/۰۴).
 */
export const provinces = pgTable('provinces', {
  id: smallint('id').primaryKey(),
  nameFa: text('name_fa').notNull().unique(),
  shippingZoneId: text('shipping_zone_id')
    .notNull()
    .references(() => shippingZones.id),
});

export const cities = pgTable(
  'cities',
  {
    id: integer('id').primaryKey(),
    provinceId: smallint('province_id')
      .notNull()
      .references(() => provinces.id),
    nameFa: text('name_fa').notNull(),
  },
  (t) => [
    unique('cities_province_name').on(t.provinceId, t.nameFa),
    /** برای کلید خارجی دوستونی سفارش: شهر سفارش باید مال استان سفارش باشد. */
    unique('cities_id_province').on(t.id, t.provinceId),
  ],
);

/* ──────────────────────────── هویت (برش ۳، ADR-033) ──────────────────────────── */

/**
 * کاربر = یک موبایل تأییدشده. رمز و ثبت‌نام نیست؛ هویت فقط موقع پرداخت و با کد پیامکی می‌آید
 * (تز محصول). موبایل با `normalizeIranMobile` نرمال شده: `09123456789`.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mobile: text('mobile').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [check('users_mobile_normalized', sql`${t.mobile} ~ '^09[0-9]{9}$'`)],
);

/**
 * هر کد پیامکی که فرستاده شد. سقف‌های ارسال (هر شماره، هر IP، کل سایت) از شمردن همین ردیف‌ها در
 * پنجرهٔ زمانی می‌آیند، نه از Redis (تصمیم ۱۴۰۵/۰۷/۰۴، ADR-033).
 *
 * خود کد هیچ‌جا نمی‌نشیند: `code_hash` HMAC آن با رمز سرور است، پس نشت پایگاه داده کد زنده‌ای لو
 * نمی‌دهد. IP هم فقط هش می‌شود؛ برای شمردن کافی است.
 */
export const otpRequests = pgTable(
  'otp_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mobile: text('mobile').notNull(),
    codeHash: text('code_hash').notNull(),
    /** نشست ناشناس (`jy_sid`) که کد را خواست؛ کد فقط در همان مرورگر پذیرفته می‌شود. */
    sessionHash: text('session_hash').notNull(),
    ipHash: text('ip_hash').notNull(),
    /** کد اشتباه؛ سه تا که شد، این کد دیگر پذیرفته نمی‌شود. */
    attempts: smallint('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    index('otp_requests_mobile').on(t.mobile, t.createdAt),
    index('otp_requests_ip').on(t.ipHash, t.createdAt),
    index('otp_requests_created').on(t.createdAt),
    check('otp_requests_mobile_normalized', sql`${t.mobile} ~ '^09[0-9]{9}$'`),
    check('otp_requests_attempts', sql`${t.attempts} >= 0`),
  ],
);

/**
 * نشست بعد از کد پیامکی: کوکی جدای `jy_auth`، کنار کوکی ناشناس `jy_sid` که مالک فایل‌هاست
 * (ADR-033). مثل `jy_sid` فقط هش کوکی اینجاست.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /** «عوض کن» در مرور، یا خروج؛ نشست باطل‌شده دیگر زنده نمی‌شود. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user').on(t.userId)],
);

/* ──────────────────────────── سفارش (برش ۳، ADR-034) ──────────────────────────── */

/**
 * `awaiting_payment` از لحظهٔ «پرداخت» تا تأیید درگاه؛ پرداخت ناموفق همین را نگه می‌دارد، با همان
 * قیمت. `expired`: سفارش پرداخت‌نشده‌ای که فایل‌هایش پاک شده‌اند. بقیهٔ چرخه (چاپ، تحویل به پست)
 * با برش‌های ۴ تا ۶ اضافه می‌شود.
 */
export const orderStatus = pgEnum('order_status', ['awaiting_payment', 'paid', 'expired']);
export const sidesMode = pgEnum('sides_mode', ['single', 'double']);
export const colorMode = pgEnum('color_mode', ['color', 'bw']);

/**
 * شمارهٔ انسانی سفارش: در پیامک، درگاه و فایل پست («نام گ»، ADR-010). از 10001، دور از کدهای دستی
 * 6004 تا 6098 فایل‌های پست فعلی (تصمیم ۱۴۰۵/۰۷/۰۴). جای خالی در دنباله مهم نیست.
 */
export const orderNumberSeq = pgSequence('order_number_seq', { startWith: 10001 });

/**
 * سفارش. **قیمتش منجمد است** (قاعدهٔ ۶): `price_breakdown` عکس کامل `quote()` با تعرفهٔ
 * `price_list_version` است و ستون‌های پول تکه‌های همان. پایگاه داده عوض کردن هیچ‌کدام را نمی‌پذیرد
 * (تریگر `orders_price_frozen`)؛ سرور هم هیچ‌وقت بازمحاسبه نمی‌کند.
 *
 * `quote_snapshot` عددی است که مرورگر نشان داده بود — نه برای قیمت، برای سنجیدن اختلاف.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: integer('order_number')
      .notNull()
      .unique()
      .default(sql`nextval('order_number_seq')`),
    /** نشانی صفحهٔ سفارش؛ حدس‌زدنی نیست. */
    publicToken: uuid('public_token').notNull().unique().defaultRandom(),
    /** کلیدی که مرورگر با «پرداخت» می‌فرستد: دو کلیک یا دو تلاش شبکه، یک سفارش (ADR-034). */
    checkoutKey: uuid('checkout_key').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: orderStatus('status').notNull().default('awaiting_payment'),

    priceListVersion: integer('price_list_version')
      .notNull()
      .references(() => priceLists.version),
    priceBreakdown: jsonb('price_breakdown').notNull(),
    quoteSnapshot: jsonb('quote_snapshot'),
    subtotalRials: bigint('subtotal_rials', { mode: 'number' }).notNull(),
    discountRials: bigint('discount_rials', { mode: 'number' }).notNull().default(0),
    shippingRials: bigint('shipping_rials', { mode: 'number' }).notNull(),
    vatRials: bigint('vat_rials', { mode: 'number' }).notNull().default(0),
    roundingRials: bigint('rounding_rials', { mode: 'number' }).notNull().default(0),
    totalRials: bigint('total_rials', { mode: 'number' }).notNull(),
    estWeightGrams: integer('est_weight_grams').notNull(),

    /** روز کاری تا تحویل به پست (ADR-013)، همان که موقع ساختن سفارش در `settings` بود. */
    slaDays: smallint('sla_days').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** پایان انحصاری آخرین روز کاری تعهد (`postHandoffDue`)؛ با پرداخت پر می‌شود. */
    postHandoffDueAt: timestamp('post_handoff_due_at', { withTimezone: true }),

    shippingMethodId: text('shipping_method_id').notNull(),
    /** منطقهٔ کرایه در لحظهٔ سفارش؛ کرایه با همین منجمد شده. */
    shippingZoneId: text('shipping_zone_id')
      .notNull()
      .references(() => shippingZones.id),
    provinceId: smallint('province_id')
      .notNull()
      .references(() => provinces.id),
    /** null یعنی شهر در فهرست نبود؛ نام شهر یا روستا در نشانی است. */
    cityId: integer('city_id'),
    recipientName: text('recipient_name').notNull(),
    /** موبایل گیرنده همان موبایل تأییدشدهٔ پرداخت است، در نسخهٔ اول. */
    recipientPhone: text('recipient_phone').notNull(),
    addressText: text('address_text').notNull(),
    postalCode: text('postal_code'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_user').on(t.userId, t.createdAt),
    /** برای پنل (برش ۴): سفارش‌های پرداخت‌شده به ترتیب نزدیکی مهلت. */
    index('orders_due').on(t.status, t.postHandoffDueAt),
    foreignKey({
      columns: [t.cityId, t.provinceId],
      foreignColumns: [cities.id, cities.provinceId],
      name: 'orders_city_province_fk',
    }),
    // روشی که در همان نسخهٔ تعرفه بوده، نه فقط نامی که امروز هست.
    foreignKey({
      columns: [t.priceListVersion, t.shippingMethodId],
      foreignColumns: [shippingMethods.priceListVersion, shippingMethods.id],
      name: 'orders_shipping_method_fk',
    }),
    check(
      'orders_total_adds_up',
      sql`${t.totalRials} = ${t.subtotalRials} - ${t.discountRials} + ${t.shippingRials} + ${t.vatRials} + ${t.roundingRials}`,
    ),
    check('orders_total_positive', sql`${t.totalRials} > 0`),
    check('orders_paid_has_dates', sql`${t.status} <> 'paid' OR (${t.paidAt} IS NOT NULL AND ${t.postHandoffDueAt} IS NOT NULL)`),
    check('orders_sla_positive', sql`${t.slaDays} > 0`),
    check('orders_phone_normalized', sql`${t.recipientPhone} ~ '^09[0-9]{9}$'`),
    check('orders_postal_code', sql`${t.postalCode} IS NULL OR ${t.postalCode} ~ '^[0-9]{10}$'`),
    check('orders_recipient_name', sql`length(btrim(${t.recipientName})) > 0`),
    check('orders_address_text', sql`length(btrim(${t.addressText})) > 0`),
  ],
);

/**
 * یک قلم = یک جزوهٔ صحافی‌شده (ADR-030). بخش‌ها و قاعده‌های چاپش در دو جدول بعد. مشخصاتش مثل قیمت
 * منجمد است؛ فقط ستون‌های PDF جزوه بعد از پرداخت پر می‌شوند.
 *
 * نوع صحافی کلید خارجی ندارد: جدول صحافی نسخه‌دار است و این جدول نسخه را از سفارش می‌گیرد. شناسه
 * موقع ساختن سفارش با همان تعرفه سنجیده شده (`quote()` برای صحافی ناموجود هشدار می‌دهد و سفارش
 * ساخته نمی‌شود).
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    seq: smallint('seq').notNull(),
    /** جمع صفحه‌های بخش‌ها، از شمارش سرور. */
    pageCount: integer('page_count').notNull(),
    copies: integer('copies').notNull(),
    sidesMode: sidesMode('sides_mode').notNull(),
    bindingTypeId: text('binding_type_id').notNull(),

    /**
     * PDF جزوه زیر `orders/`، بیرون از قاعدهٔ پاک شدن `uploads/`: بخش‌ها به ترتیب، پشت‌سرهم. کار
     * `prepare_order` کارگر بعد از پرداخت می‌سازدش (ADR-024 و ADR-030).
     */
    printPdfKey: text('print_pdf_key'),
    printPdfBytes: bigint('print_pdf_bytes', { mode: 'number' }),
    printPdfSha256: text('print_pdf_sha256'),
    printPdfReadyAt: timestamp('print_pdf_ready_at', { withTimezone: true }),
  },
  (t) => [
    unique('order_items_order_seq').on(t.orderId, t.seq),
    check('order_items_positive', sql`${t.seq} >= 1 AND ${t.pageCount} >= 1 AND ${t.copies} >= 1`),
  ],
);

/**
 * بخش‌های جزوه به ترتیب صحافی: هر کدام یک سند، با تعداد صفحه‌ای که **سرور** شمرد (ADR-030). کلید
 * خارجی به سند بی cascade است: سندی که در سفارش است پاک نمی‌شود (فقط بایت‌های فایل خامش می‌روند).
 */
export const orderItemSections = pgTable(
  'order_item_sections',
  {
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    seq: smallint('seq').notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    pageCount: integer('page_count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.orderItemId, t.seq] }),
    index('order_item_sections_document').on(t.documentId),
    check('order_item_sections_positive', sql`${t.seq} >= 1 AND ${t.pageCount} >= 1`),
  ],
);

/**
 * انتخاب رنگ، روی جزوه (قاعدهٔ ۵، ADR-002): هر قاعده بازه‌های صفحهٔ سراسری جزوه و یک حالت رنگ.
 * امروز یک قاعده برای همهٔ صفحه‌ها؛ حالت ترکیبی همین جدول است با چند قاعده.
 *
 * قاعده‌های یک قلم باید صفحه‌های ۱ تا جمع بخش‌ها را **دقیقاً یک بار** بپوشانند، و جمع بخش‌ها باید
 * همان `page_count` قلم باشد. این را تریگر معوق `order_items_cover_pages` در پایان تراکنش می‌سنجد.
 */
export const printRules = pgTable(
  'print_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    seq: smallint('seq').notNull(),
    /** `[[1, 11], [13, 14]]`، هر دو سر شامل، شمارهٔ صفحهٔ سراسری جزوه. */
    pageRanges: jsonb('page_ranges').notNull(),
    colorMode: colorMode('color_mode').notNull(),
    paperTypeId: text('paper_type_id').notNull(),
  },
  (t) => [
    unique('print_rules_item_seq').on(t.orderItemId, t.seq),
    check('print_rules_seq_positive', sql`${t.seq} >= 1`),
  ],
);

/** هر تغییر وضعیت سفارش، با زمان و عامل؛ پنل (برش ۴) و گزارش SLA از همین می‌خوانند. */
export const orderStatusEvents = pgTable(
  'order_status_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** null یعنی ساخته شدن سفارش. */
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** `user`، `gateway` یا `system`؛ ادمین از برش ۴. */
    actor: text('actor').notNull(),
    note: jsonb('note'),
  },
  (t) => [index('order_status_events_order').on(t.orderId, t.at)],
);

/**
 * هر تلاش پرداخت. سفارشی که پرداختش ناموفق شد، تلاش تازه می‌گیرد با همان مبلغ منجمد؛ تلاش قبلی
 * می‌ماند. کلید خارجی به سفارش cascade ندارد: سابقهٔ پول بی‌صدا پاک نمی‌شود.
 */
export const paymentStatus = pgEnum('payment_status', ['pending', 'succeeded', 'failed']);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    /** `mock` تا برش ۷، بعد نام درگاه واقعی (ADR-035). */
    provider: text('provider').notNull(),
    amountRials: bigint('amount_rials', { mode: 'number' }).notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    /** شناسه‌ای که درگاه برای این تلاش داد؛ برگشت از درگاه با همین پیدا می‌شود. */
    authority: text('authority').notNull(),
    /** کد پیگیری بانک؛ فقط برای پرداخت موفق. */
    refId: text('ref_id'),
    cardMask: text('card_mask'),
    /** چرا ناموفق: `cancelled`، `declined`، `verify_failed`، `amount_mismatch`… */
    failureCode: text('failure_code'),
    /** پاسخ خام درگاه، برای روزی که بانک و ما دو چیز بگوییم. */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('payments_provider_authority').on(t.provider, t.authority),
    index('payments_order').on(t.orderId),
    /** یک سفارش، حداکثر یک پرداخت موفق: پول دوباره گرفته نمی‌شود، حتی اگر بانک دو بار برگرداند. */
    uniqueIndex('payments_one_success').on(t.orderId).where(sql`${t.status} = 'succeeded'`),
    check('payments_amount_positive', sql`${t.amountRials} > 0`),
    check(
      'payments_success_has_ref',
      sql`${t.status} <> 'succeeded' OR (${t.refId} IS NOT NULL AND ${t.verifiedAt} IS NOT NULL)`,
    ),
  ],
);

/* ──────────────────────────── پیامک (ADR-008) ──────────────────────────── */

/**
 * هر پیامک. پیامک کنسولی (توسعه و CI، تا برش ۷) فقط همین ردیف است، با متن کامل، تا کد پیامکی بی
 * پنل پیامک هم آزمودنی باشد. پنل واقعی متن کد را اینجا نگه نمی‌دارد (ADR-033).
 */
export const smsMessages = pgTable(
  'sms_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    provider: text('provider').notNull(),
    toMobile: text('to_mobile').notNull(),
    /** `otp` یا `order_paid`. */
    purpose: text('purpose').notNull(),
    body: text('body'),
    /** `logged` (کنسولی)، `sent` یا `failed`. */
    status: text('status').notNull(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
  },
  (t) => [index('sms_messages_to').on(t.toMobile, t.createdAt)],
);
