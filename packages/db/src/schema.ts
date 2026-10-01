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
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
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
 *
 * از برش ۴٫۵ (ADR-040) ویرایش فقط با نسخهٔ تازه است: پیش‌نویس (`activated_at` خالی) از روی نسخهٔ فعال، که
 * پنل ویرایش و پاکش می‌کند؛ و نسخه‌ای که یک بار فعال شد، با همهٔ ردیف‌هایش، دیگر نه عوض می‌شود و نه پاک. این
 * را تریگرهای `price_lists_frozen` و `price_list_rows_frozen` در خود پایگاه داده می‌سنجند (0013)؛ فقط
 * `is_active` جابه‌جا می‌شود، برای برگشت به نسخهٔ قبل.
 */
export const priceLists = pgTable(
  'price_lists',
  {
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
    /**
     * اولین بار که فعال شد؛ یک بار نوشته می‌شود، و اگر نوشته نشده باشد تریگر با فعال شدن می‌نویسدش. null یعنی
     * پیش‌نویس.
     */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /**
     * ادمینی که پیش‌نویس را ساخت؛ null برای تعرفهٔ پایه. بی کلید خارجی: ادمین پاک نمی‌شود (`admin_users_no_delete`)، و
     * تاریخچهٔ تعرفه به جدول‌های پنل بسته نمی‌ماند.
     */
    createdBy: uuid('created_by'),
    /** نسخه‌ای که پیش‌نویس از رویش ساخته شد: نسخهٔ فعال همان لحظه. */
    basedOn: integer('based_on'),
  },
  (t) => [foreignKey({ columns: [t.basedOn], foreignColumns: [t.version], name: 'price_lists_based_on_fk' })],
);

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
    /** ورود فایل پستی که کار رویش است: خواندن جدول‌هایش (`read_post_file`، برش ۶٫۱، ADR-045). */
    shipmentImportId: uuid('shipment_import_id').references(() => shipmentImports.id, { onDelete: 'cascade' }),
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
    /** و برای ورود فایل پست: یک فایل یک بار خوانده می‌شود. */
    uniqueIndex('jobs_shipment_import_kind').on(t.shipmentImportId, t.kind),
    /** هر کار مال یک چیز است: سند، سفارش یا ورود فایل پست. */
    check('jobs_one_target', sql`num_nonnulls(${t.documentId}, ${t.orderId}, ${t.shipmentImportId}) <= 1`),
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

/* ──────────────────────────── چاپخانه‌ها (برش ۵٫۲، ADR-042) ──────────────────────────── */

/**
 * چاپخانه‌ای که سفارش‌ها را چاپ می‌کند؛ مدل برای چند چاپخانه از روز اول (ADR-012). اولین ردیف «چاپخانهٔ جزوه‌یار» در
 * تهران است، پیش‌فرض، و دادهٔ پایه وقتی جدول خالی است می‌نشاندش (`seedReferenceData`).
 *
 * - شهر و استان با کلید خارجی دوستونی به `cities`، مثل سفارش: تخصیص خودکار در پرداخت با همین دو (همان شهر، وگرنه همان
 *   استان، وگرنه پیش‌فرض؛ `choosePartner`).
 * - حداکثر یک پیش‌فرض (`print_partners_one_default`)، و پیش‌فرض فعال است (`print_partners_default_active`).
 * - پاک نمی‌شود، غیرفعال می‌شود (`deactivated_at`): سفارش‌ها و تاریخچهٔ تخصیص به آن اشاره می‌کنند. غیرفعال کردن فقط وقتی
 *   سفارش باز ندارد؛ هر دو را تریگر `print_partners_guard` هم می‌سنجد (0018).
 * - `created_by` بی کلید خارجی، مثل `price_lists.created_by`؛ null یعنی دادهٔ پایه.
 */
export const printPartners = pgTable(
  'print_partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** فارسی‌نرمال؛ یکتا، تا دو کلیک «افزودن» دو چاپخانه نسازد و هر رویداد یک نام را بگوید. */
    name: text('name').notNull().unique(),
    provinceId: smallint('province_id')
      .notNull()
      .references(() => provinces.id),
    cityId: integer('city_id').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    /** از این لحظه سفارش تازه نمی‌گیرد؛ null یعنی فعال. */
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
  },
  (t) => [
    foreignKey({
      columns: [t.cityId, t.provinceId],
      foreignColumns: [cities.id, cities.provinceId],
      name: 'print_partners_city_province_fk',
    }),
    uniqueIndex('print_partners_one_default').on(t.isDefault).where(sql`${t.isDefault}`),
    check('print_partners_name', sql`length(btrim(${t.name})) BETWEEN 1 AND 100`),
    check('print_partners_default_active', sql`NOT ${t.isDefault} OR ${t.deactivatedAt} IS NULL`),
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
    /** سقف هر مرورگر (برش ۷، ADR-049): ۵ کد در ساعت برای هر `jy_sid`. */
    index('otp_requests_session').on(t.sessionHash, t.createdAt),
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
 * قیمت. `expired`: سفارش پرداخت‌نشده‌ای که فایل‌هایش پاک شده‌اند.
 *
 * پس از پرداخت (برش ۴٫۳، ADR-039): `paid` «در صف چاپ» ← `printing` «در حال چاپ» ← `handed_to_post` «تحویل پست
 * شد»، و `cancelled` «لغو شد» از دو وضعیت اول. کدام به کدام می‌رود را تریگر `orders_status_flow` می‌سنجد
 * (0011)؛ برگرداندن یک قدم هم همان‌جاست. سه مقدار تازه در 0010 آمدند و در همان اجرای مهاجرت در هیچ محدودیت و
 * نمایه‌ای به کار نمی‌روند (پایینِ `orders`).
 */
export const orderStatus = pgEnum('order_status', [
  'awaiting_payment',
  'paid',
  'expired',
  'printing',
  'handed_to_post',
  'cancelled',
]);
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
    /**
     * «تحویل پست شد» (برش ۴٫۳)، و فقط در همان وضعیت: برگرداندن به «در حال چاپ» پاکش می‌کند. به‌موقع یعنی پیش از
     * `post_handoff_due_at`؛ آمار پیشخوان و صفحهٔ سفارش مشتری از همین.
     */
    handedToPostAt: timestamp('handed_to_post_at', { withTimezone: true }),
    /**
     * فایل‌های سفارش (PDF جزوه، فایل‌های چاپ و برگه) پاک شد (برش ۵٫۱، ADR-044): کارگر N روز پس از «تحویل پست شد» یا
     * «لغو شد» پاکشان می‌کند و همین را می‌نشاند؛ فقط در همان دو وضعیت (CHECK `orders_files_deleted_closed`)، یک بار، و
     * پس از آن وضعیت عوض نمی‌شود (تریگر `orders_files_deleted`، 0016). ردیف‌ها، مشخصات و ریز قیمت می‌مانند.
     */
    filesDeletedAt: timestamp('files_deleted_at', { withTimezone: true }),
    /**
     * چاپخانهٔ امروز سفارش (برش ۵٫۲، ADR-042): با پرداخت، خودکار (همان تراکنش `settlePayment`)، و بعد با جابه‌جایی پنل. هر
     * تخصیص یک ردیف `order_assignments` دارد. null یعنی بی چاپخانه: پرداخت‌نشده، سفارش پیش از ۵٫۲، یا هنگام پرداخت هیچ
     * چاپخانهٔ فعالی نبود (هشدار پیشخوان). فقط وقتی سفارش «در صف چاپ» است عوض می‌شود، فقط به چاپخانهٔ فعال، و خالی
     * نمی‌شود (تریگر `orders_print_partner`، 0018).
     */
    printPartnerId: uuid('print_partner_id').references(() => printPartners.id),

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
    /** آمار پیشخوان (برش ۴٫۳): سفارش‌هایی که در هفتهٔ گذشته به پست رسیدند. */
    index('orders_handed').on(t.handedToPostAt),
    /**
     * شمار سفارش‌های هر نسخهٔ تعرفه در پنل (برش ۴٫۵)، و سنجش کلید خارجی وقتی پیش‌نویسی پاک می‌شود؛ بی این، هر دو
     * همهٔ سفارش‌ها را می‌خواندند.
     */
    index('orders_price_list').on(t.priceListVersion),
    /** سفارش‌های باز هر چاپخانه: فهرست «چاپخانه‌ها»، غیرفعال کردن، و از ۵٫۳ محدودهٔ هر کوئری پنل. */
    index('orders_print_partner').on(t.printPartnerId, t.status),
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
    // هر وضعیت پس از پرداخت (در صف چاپ، در حال چاپ، تحویل پست شد، لغو شد) تاریخ پرداخت و مهلت دارد. با دو
    // مقدار پیش از پرداخت نوشته شده، نه با مقدارهای تازه: مقداری که `ALTER TYPE … ADD VALUE` در همان تراکنش
    // افزوده، در محدودیت به کار نمی‌رود («unsafe use of new value»)، و مهاجرت‌های یک اجرا یک تراکنش‌اند.
    check(
      'orders_paid_has_dates',
      sql`${t.status} IN ('awaiting_payment', 'expired') OR (${t.paidAt} IS NOT NULL AND ${t.postHandoffDueAt} IS NOT NULL)`,
    ),
    // زمان تحویل به پست فقط در همان وضعیت. `::text`، به همان دلیل: مقایسهٔ متن، نه مقدار تازهٔ enum.
    check('orders_handed_at', sql`(${t.status}::text = 'handed_to_post') = (${t.handedToPostAt} IS NOT NULL)`),
    // فایل‌ها فقط از سفارش بسته پاک می‌شوند (ADR-044)؛ سفارش باز هرگز. `::text`، به همان دلیل.
    check(
      'orders_files_deleted_closed',
      sql`${t.filesDeletedAt} IS NULL OR ${t.status}::text IN ('handed_to_post', 'cancelled')`,
    ),
    // سفارش پرداخت‌نشده چاپخانه ندارد (ADR-042): تخصیص با پرداخت است. `::text`، به همان دلیل.
    check(
      'orders_partner_paid',
      sql`${t.printPartnerId} IS NULL OR ${t.status}::text NOT IN ('awaiting_payment', 'expired')`,
    ),
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

/**
 * فایل چاپ هر جلد هر جزوه (برش ۵٫۱، ADR-043): همهٔ صفحه‌ها A4 عمودی، جلدها دقیقاً با `sheetsPerVolume` ریز قیمت
 * منجمد. کار `prepare_order` کارگر از روی PDF جزوه می‌سازدش، همهٔ جلدهای یک جزوه در یک تراکنش.
 *
 * جزوه‌ای که هیچ صفحه‌اش عوض نمی‌شود و یک جلد است، فایل چاپش خود PDF جزوه است: `storage_key` همان
 * `order_items.print_pdf_key`، بی کپی دوم. جلدهای هر جزوه صفحه‌های ۱ تا `page_count` را پشت‌سرهم و دقیقاً یک بار
 * می‌پوشانند، به همان شمار جلد ریز قیمت (تریگر معوق `order_print_files_cover`، 0016)، و ردیفی که نوشته شد عوض
 * نمی‌شود (`order_print_files_frozen`).
 */
export const orderPrintFiles = pgTable(
  'order_print_files',
  {
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    volume: smallint('volume').notNull(),
    /** شمارهٔ صفحهٔ سراسری جزوه، هر دو سر شامل. */
    firstPage: integer('first_page').notNull(),
    lastPage: integer('last_page').notNull(),
    storageKey: text('storage_key').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    /**
     * چه عوض شد، به بازهٔ صفحهٔ سراسری: `{ resized: [[first, last, widthPt, heightPt]], rotated: [[first, last]],
     * annotated: [[first, last]] }`؛ اندازه همان که صفحه پیش از چیدن داشت. null یعنی هیچ صفحه‌ای عوض نشد.
     */
    changes: jsonb('changes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orderItemId, t.volume] }),
    check('order_print_files_pages', sql`${t.volume} >= 1 AND ${t.firstPage} >= 1 AND ${t.lastPage} >= ${t.firstPage}`),
    check(
      'order_print_files_file',
      sql`${t.storageKey} LIKE 'orders/%' AND ${t.sizeBytes} > 0 AND ${t.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/**
 * برگهٔ سفارش (برش ۵٫۱، ADR-043): یک PDF A4 برای هر سفارش، جدا از فایل‌های جزوه، و پیش‌نمایش PNG همان برای پنل. کار
 * جدای `prepare_ticket` کارگر می‌سازدش و با هر ساختن دوباره همین ردیف عوض می‌شود.
 *
 * `stamp` اثر انگشت داده‌ای است که برگه با آن ساخته شد: `order_ticket_stamp(orders)` (0016)، که هم کارگر می‌خواند و
 * هم پنل. پنل برگه‌ای را که با دادهٔ امروز سفارش نمی‌خواند نمی‌دهد («در حال به‌روز شدن»)، و هر تغییر داده‌اش کار را
 * در همان تراکنش دوباره در صف می‌گذارد.
 */
export const orderTickets = pgTable(
  'order_tickets',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    previewKey: text('preview_key').notNull(),
    stamp: text('stamp').notNull(),
    builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'order_tickets_file',
      sql`${t.storageKey} LIKE 'orders/%' AND ${t.previewKey} LIKE 'orders/%' AND ${t.sizeBytes} > 0 AND ${t.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
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
    /** `user`، `gateway`، `system`، یا از برش ۴٫۳ `admin` با `admin_user_id`. */
    actor: text('actor').notNull(),
    /** ادمینی که وضعیت را عوض کرد (برش ۴٫۳)؛ فقط و همیشه برای `admin`. */
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id),
    /** لغو و برگرداندن: `{ reason }`، دلیلی که فقط در پنل دیده می‌شود. */
    note: jsonb('note'),
  },
  (t) => [
    index('order_status_events_order').on(t.orderId, t.at),
    check('order_status_events_admin', sql`(${t.actor} = 'admin') = (${t.adminUserId} IS NOT NULL)`),
  ],
);

/**
 * هر تخصیص چاپخانه به سفارش (برش ۵٫۲، ADR-042): از کدام، به کدام، کی، و سیستم با قاعده‌اش یا ادمین با دلیلش. فقط افزودنی،
 * مثل `order_status_events` (تریگر `order_assignments_append_only`؛ پاک شدن فقط با خود سفارش)، و آخرین ردیف هر سفارش همان
 * `orders.print_partner_id` است (تریگر معوق `orders_partner_recorded`، 0018).
 *
 * - سیستم فقط در پرداخت: از هیچ، با `rule` — `city` هم‌شهر مشتری، `province` هم‌استان، `default` چاپخانهٔ پیش‌فرض، و
 *   `oldest` قدیمی‌ترین چاپخانهٔ فعال وقتی پیش‌فرضی نیست.
 * - ادمین (جابه‌جایی، یا چاپخانهٔ سفارشی که نداشت): با `admin_user_id` و دلیل ۱ تا ۵۰۰ نویسه، که فقط در پنل دیده می‌شود.
 */
export const orderAssignments = pgTable(
  'order_assignments',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromPartnerId: uuid('from_partner_id').references(() => printPartners.id),
    toPartnerId: uuid('to_partner_id')
      .notNull()
      .references(() => printPartners.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** `system` یا `admin`. */
    actor: text('actor').notNull(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id),
    rule: text('rule'),
    reason: text('reason'),
  },
  (t) => [
    index('order_assignments_order').on(t.orderId, t.id),
    check('order_assignments_moves', sql`${t.fromPartnerId} IS DISTINCT FROM ${t.toPartnerId}`),
    check(
      'order_assignments_actor',
      sql`(${t.actor} = 'system' AND ${t.adminUserId} IS NULL AND ${t.fromPartnerId} IS NULL AND ${t.reason} IS NULL
            AND ${t.rule} IN ('city', 'province', 'default', 'oldest'))
       OR (${t.actor} = 'admin' AND ${t.adminUserId} IS NOT NULL AND ${t.rule} IS NULL
            AND length(btrim(${t.reason})) BETWEEN 1 AND 500)`,
    ),
  ],
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
    /** کارت پوشیده، همان شکلی که درگاه داد؛ برای پرداخت موفق، و از ۷٫۲ برای پرداخت دومی که پولش گرفته شد. */
    cardMask: text('card_mask'),
    /**
     * چرا ناموفق (`PaymentFailureCode` در `@jozveyar/payments`): از وضعیت درگاه `cancelled`، `declined`، `bank_error` و `returned`؛ تصمیم
     * ما `expired` (مهلت تلاش گذشت)، `order_not_payable` (پرداخت دوم) و `amount_mismatch`؛ `verify_failed` فقط پیش از ۷٫۲.
     */
    failureCode: text('failure_code'),
    /** پاسخ خام درگاه (فقط فیلدهای شناخته، بی کد پذیرنده)، برای روزی که بانک و ما دو چیز بگوییم. */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /**
     * کلید برگشت (برش ۷٫۲، سؤال ۱۴۵): تصادفی، ۱۲۸ بیت؛ نشانی برگشت `/pay/callback/<کلید>` است و برگشت فقط همین را می‌خواند، نه هیچ
     * پارامتر درگاه. `trackId` زیبال راز نیست (در نشانی صفحهٔ پرداخت پیداست)، پس به توکن سفارش نمی‌رسد.
     */
    returnKey: text('return_key')
      .notNull()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
    /** شناسهٔ سفارش نزد درگاه: «شمارهٔ سفارش-۸ نویسهٔ اول شناسهٔ تلاش» (`10027-3f9c2a1b`، ADR-050)؛ برای زیبال اجباری و یکتا. */
    gatewayOrderId: text('gateway_order_id'),
    /** مبلغی که `verify` درگاه نهایی کرد؛ موفق یعنی برابر مبلغ (`payments_success_amount`). */
    verifiedAmountRials: bigint('verified_amount_rials', { mode: 'number' }),
    /**
     * آخرین وضعیتی که درگاه گفت (کدهای زیبال، `@jozveyar/payments`)، زمان آخرین پرسش، و اگر جواب روشن نیامد علتش (`rejected:115`…).
     * پس از «موفق» یا «ناموفق» هم عوض می‌شود: استعلام خودکار پول پرداخت دوم را تا «ریورس‌شده» می‌پاید.
     */
    gatewayStatus: smallint('gateway_status'),
    gatewayError: text('gateway_error'),
    gatewayCheckedAt: timestamp('gateway_checked_at', { withTimezone: true }),
    /** نخستین برگشت مرورگر مشتری از درگاه به همین تلاش. */
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    /** چه چیزی تلاش را بست: برگشت از درگاه (`callback`)، استعلام خودکار (`auto`) یا «استعلام از درگاه» پنل (`panel`). */
    settledVia: text('settled_via'),
    /**
     * پیامک پرداخت (برش ۷، ADR-049): ردیف «منتظر» `sms_messages` که در همان تراکنش «موفق» نوشته شد و بعد از commit فرستاده می‌شود؛
     * فقط در همان گذار گذاشته می‌شود و دیگر عوض نمی‌شود (تریگر `payments_sms`، 0028). پرداخت پیش از برش ۷ پیامکش را بی ردیف منتظر
     * فرستاده بود (null).
     */
    smsMessageId: bigint('sms_message_id', { mode: 'number' }).references(() => smsMessages.id),
  },
  (t) => [
    uniqueIndex('payments_provider_authority').on(t.provider, t.authority),
    uniqueIndex('payments_return_key').on(t.returnKey),
    /** یک شناسهٔ سفارش برای هر تلاش، نزد هر درگاه. */
    uniqueIndex('payments_gateway_order').on(t.provider, t.gatewayOrderId),
    index('payments_order').on(t.orderId),
    /** استعلام خودکار تلاش‌های باز. */
    index('payments_pending').on(t.createdAt).where(sql`${t.status} = 'pending'`),
    /** یک پیامک برای هر پرداخت (سطر پیامک به پرداخت دیگری وصل نمی‌شود). */
    uniqueIndex('payments_sms').on(t.smsMessageId),
    /** یک سفارش، حداکثر یک پرداخت موفق: پول دوباره گرفته نمی‌شود، حتی اگر بانک دو بار برگرداند. */
    uniqueIndex('payments_one_success').on(t.orderId).where(sql`${t.status} = 'succeeded'`),
    check('payments_amount_positive', sql`${t.amountRials} > 0`),
    check(
      'payments_success_has_ref',
      sql`${t.status} <> 'succeeded' OR (${t.refId} IS NOT NULL AND ${t.verifiedAt} IS NOT NULL)`,
    ),
    check('payments_return_key', sql`${t.returnKey} ~ '^[0-9a-f]{32}$'`),
    check(
      'payments_gateway_order_id',
      sql`(${t.gatewayOrderId} IS NULL OR length(${t.gatewayOrderId}) BETWEEN 1 AND 64)
       AND (${t.provider} <> 'zibal' OR ${t.gatewayOrderId} IS NOT NULL)`,
    ),
    /** موفق یعنی درگاه همان مبلغ را نهایی کرد (ADR-050). */
    check('payments_success_amount', sql`${t.status} <> 'succeeded' OR coalesce(${t.verifiedAmountRials} = ${t.amountRials}, false)`),
    check(
      'payments_gateway_error',
      sql`${t.gatewayError} IS NULL OR ${t.gatewayError} ~ '^(unavailable|rejected|malformed|unconfigured)(:-?[0-9]{1,9})?$'`,
    ),
    check(
      'payments_settled_via',
      sql`${t.settledVia} IS NULL OR (${t.settledVia} IN ('callback', 'auto', 'panel') AND ${t.status} <> 'pending')`,
    ),
  ],
);

/* ──────────────────────────── بازپرداخت (برش ۷٫۳، ADR-051) ──────────────────────────── */

/**
 * بازپرداخت سفارش لغوشده: کل مبلغ پرداخت موفقش، از درگاه یا ثبت دستی، فقط با مالک و کد تازه. فقط افزودنی: ردیف پاک نمی‌شود، و پس از
 * «برگشت داده شد» یا «برنگشت» دیگر عوض نمی‌شود (`refunds_guard`، 0032).
 *
 * - **از درگاه** (`method = 'gateway'`): ردیف «در حال برگشت» پیش از درخواست ساخته می‌شود و شناسه‌اش با درخواست می‌رود (سؤال ۱۵۴)؛ پاسخ
 *   درگاه، یا استعلام خودکار و «استعلام از درگاه»، آن را «برگشت داده شد» یا «برنگشت» می‌کند. کارمزد درگاه از کیف پول ما (سؤال ۱۳۶).
 * - **دستی** (`method = 'manual'`): پول از راه دیگری برگشته؛ همان لحظه «برگشت داده شد»، با روز و کد پیگیری بانک، و «چطور برگشت» فقط
 *   برای پنل.
 * - **محافظ‌ها** در 0032، هر کدام با نام محدودیت: فقط پرداخت موفق همان سفارش و فقط سفارش «لغو شد»؛ جمع بازپرداخت‌های زنده ≤ مبلغ پرداخت؛ و
 *   سفارشی که بازپرداخت زنده دارد از «لغو شد» برنمی‌گردد (`orders_status_flow`). یکی در جریان برای هر پرداخت همین‌جاست
 *   (`refunds_one_pending`).
 */
export const refundStatus = pgEnum('refund_status', ['pending', 'succeeded', 'failed']);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    amountRials: bigint('amount_rials', { mode: 'number' }).notNull(),
    /** کارمزد درگاه، از کیف پول ما؛ فقط راه درگاه. */
    feeRials: bigint('fee_rials', { mode: 'number' }),
    /** `gateway` یا `manual`. */
    method: text('method').notNull(),
    status: refundStatus('status').notNull().default('pending'),
    /** شناسهٔ بازپرداخت نزد درگاه، وقتی درخواست جواب گرفت. */
    gatewayRef: text('gateway_ref'),
    /** کد پیگیری بانک: دستی همیشه؛ درگاه اگر داد. */
    reference: text('reference'),
    /** روز برگشت دستی، آغاز همان روز به وقت تهران (مشتری فقط روز را می‌بیند، سؤال ۱۵۷). */
    refundedOn: timestamp('refunded_on', { withTimezone: true }),
    /** «چطور برگشت» دستی؛ فقط پنل، مشتری نمی‌بیند. */
    note: text('note'),
    /** آخرین وضعیت عددی درگاه، زمان آخرین پرسش، و اگر جواب روشن نیامد علتش (`unavailable`…)، مثل `payments`. */
    gatewayStatus: smallint('gateway_status'),
    gatewayError: text('gateway_error'),
    gatewayCheckedAt: timestamp('gateway_checked_at', { withTimezone: true }),
    /** چرا «برنگشت» (`RefundRejection` در `@jozveyar/payments`). */
    failureReason: text('failure_reason'),
    /** چه چیزی راه درگاه را بست: پاسخ خود درخواست (`request`)، استعلام خودکار (`auto`) یا «استعلام از درگاه» (`panel`). */
    settledVia: text('settled_via'),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id),
    /** پاسخ درگاه، فقط فیلدهای شناخته (بی کلید). */
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('refunds_order').on(t.orderId, t.createdAt),
    index('refunds_payment').on(t.paymentId, t.createdAt),
    /** یکی در جریان برای هر پرداخت: دو کلیک هم‌زمان دو درخواست به درگاه نمی‌فرستند. */
    uniqueIndex('refunds_one_pending').on(t.paymentId).where(sql`${t.status} = 'pending'`),
    /** استعلام خودکار. */
    index('refunds_pending').on(t.createdAt).where(sql`${t.status} = 'pending'`),
    check('refunds_amount_positive', sql`${t.amountRials} > 0`),
    check(
      'refunds_method',
      sql`(${t.method} = 'gateway' AND ${t.feeRials} IS NOT NULL AND ${t.feeRials} >= 0 AND ${t.refundedOn} IS NULL AND ${t.note} IS NULL)
       OR (${t.method} = 'manual' AND ${t.feeRials} IS NULL AND ${t.status} = 'succeeded' AND ${t.reference} IS NOT NULL
           AND ${t.refundedOn} IS NOT NULL AND ${t.gatewayRef} IS NULL AND ${t.gatewayStatus} IS NULL AND ${t.gatewayError} IS NULL
           AND ${t.gatewayCheckedAt} IS NULL AND ${t.settledVia} IS NULL AND ${t.raw} IS NULL)`,
    ),
    check(
      'refunds_finished',
      sql`(${t.status} = 'pending') = (${t.finishedAt} IS NULL)
       AND (${t.status} = 'failed') = (${t.failureReason} IS NOT NULL)
       AND (${t.settledVia} IS NULL OR (${t.settledVia} IN ('request', 'auto', 'panel') AND ${t.status} <> 'pending'))
       AND (${t.method} = 'manual' OR ${t.status} = 'pending' OR ${t.settledVia} IS NOT NULL)`,
    ),
    check(
      'refunds_failure_reason',
      sql`${t.failureReason} IS NULL OR ${t.failureReason} IN ('balance', 'ip', 'token', 'unconfigured', 'not_found', 'other')`,
    ),
    check('refunds_reference', sql`${t.reference} IS NULL OR ${t.reference} ~ '^[0-9A-Za-z-]{3,40}$'`),
    check('refunds_gateway_ref', sql`${t.gatewayRef} IS NULL OR ${t.gatewayRef} ~ '^[0-9A-Za-z_-]{1,64}$'`),
    check('refunds_note', sql`${t.note} IS NULL OR length(btrim(${t.note})) BETWEEN 1 AND 200`),
    check('refunds_refunded_on', sql`${t.refundedOn} IS NULL OR ${t.refundedOn} <= ${t.createdAt}`),
    check(
      'refunds_gateway_error',
      sql`${t.gatewayError} IS NULL OR ${t.gatewayError} ~ '^(unavailable|rejected|malformed|unconfigured)(:-?[0-9]{1,9})?$'`,
    ),
  ],
);

/* ──────────────────────────── پیامک (ADR-008) ──────────────────────────── */

/**
 * هر پیامک. پیامک کنسولی (توسعه و CI) فقط همین ردیف است، با متن کامل، تا کد پیامکی بی پنل پیامک هم آزمودنی باشد. پنل واقعی
 * (sms.ir، برش ۷) متن و پارامتر کد را اینجا نگه نمی‌دارد (ADR-033؛ CHECK `sms_messages_otp_secret`).
 */
export const smsMessages = pgTable(
  'sms_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    provider: text('provider').notNull(),
    toMobile: text('to_mobile').notNull(),
    /** `otp`، `order_paid` یا از ۶٫۳ `tracking` (کد رهگیری هر مرسوله، ADR-047). */
    purpose: text('purpose').notNull(),
    body: text('body'),
    /**
     * `logged` (کنسولی)، `sent` یا `failed`؛ و فقط برای رهگیری و از برش ۷ پرداخت `pending` (در همان تراکنش مرسوله یا پرداخت نوشته شد و
     * هنوز فرستاده نشده) و `sending` (فرستنده برداشتش). گذارها با تریگر `sms_messages_guard` (0026، بازنویسی 0028).
     */
    status: text('status').notNull(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    /** پارامترهای قالب پنل پیامک (برش ۷)؛ رهگیری: شمارهٔ سفارش و بارکد. */
    params: jsonb('params'),
    /** شمار تلاش‌های فرستادن پرداخت و رهگیری («دوباره بفرست» یکی بالا می‌برد)؛ کد ۰، چون یک بار و بی ردیف منتظر است. */
    attempts: integer('attempts').notNull().default(0),
    /** آخرین «در حال فرستادن»؛ «معلوم نیست رفت» از همین حساب می‌شود. */
    attemptedAt: timestamp('attempted_at', { withTimezone: true }),
    /** وقتی «رفت» (کنسولی یا پنل واقعی)؛ پنل «رفت، 18:32» را از همین می‌گوید. */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /**
     * هزینه‌ای که sms.ir در پاسخ ارسال گفت (برش ۷، ADR-049، سؤال ۱۱۶)، به واحد خود sms.ir: واحدش هنوز در مستندی دیده نشده، پس
     * `…Rials` نیست و با پول سفارش جمع نمی‌شود؛ فقط «برای حدود N روز» کارت «اعتبار پیامک» از آن حساب می‌شود.
     */
    cost: numeric('cost'),
  },
  (t) => [
    index('sms_messages_to').on(t.toMobile, t.createdAt),
    check('sms_messages_purpose', sql`${t.purpose} IN ('otp', 'order_paid', 'tracking')`),
    check('sms_messages_status', sql`${t.status} IN ('logged', 'sent', 'failed', 'pending', 'sending')`),
    check(
      'sms_messages_queued',
      sql`${t.status} NOT IN ('pending', 'sending') OR (${t.purpose} IN ('tracking', 'order_paid') AND ${t.body} IS NOT NULL)`,
    ),
    check('sms_messages_sent_at', sql`(${t.sentAt} IS NULL) OR ${t.status} IN ('logged', 'sent')`),
    /** کد تأیید زنده با پنل واقعی هرگز در پایگاه داده (ADR-033، ADR-049): نه متن و نه پارامترش؛ کنسولی متن را دارد تا تست بخواندش. */
    check('sms_messages_otp_secret', sql`${t.purpose} <> 'otp' OR ${t.provider} = 'console' OR (${t.body} IS NULL AND ${t.params} IS NULL)`),
    check('sms_messages_cost', sql`${t.cost} IS NULL OR ${t.cost} >= 0`),
  ],
);

/* ──────────────────────────── پنل ادمین (برش ۴، ADR-037 و ADR-038) ──────────────────────────── */

/**
 * ادمین پنل: نام کاربری، رمز (argon2id) و رمز برنامهٔ تأیید (TOTP). ثبت‌نام ندارد: هر ادمین با پیوند
 * یک‌باره (`admin_invites`) رمز و برنامهٔ تأیید را خودش می‌گذارد، و تا آن موقع هر دو خالی‌اند.
 *
 * - `totp_sealed` رمز برنامهٔ تأیید است، مهروموم‌شده با `SECRETS_KEY` (`sealed.ts`)؛ نشت پایگاه داده
 *   بی آن کلید کد تازه‌ای نمی‌سازد.
 * - `totp_last_step` آخرین گام ۳۰ ثانیه‌ای پذیرفته‌شده: هر کد فقط یک بار (بازپخش نه).
 * - `failed_attempts` اشتباه‌های پشت‌سرهم؛ پنجمی `locked_until` را می‌گذارد.
 * - ادمین پاک نمی‌شود، غیرفعال می‌شود: رویدادهایش به او اشاره می‌کنند.
 */
export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash'),
    totpSealed: text('totp_sealed'),
    totpLastStep: bigint('totp_last_step', { mode: 'number' }),
    failedAttempts: smallint('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** null یعنی دستور روی سرور (اولین ادمین، یا بازیابی مالک). */
    createdBy: uuid('created_by'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [
    check('admin_users_username', sql`${t.username} ~ '^[a-z][a-z0-9_.-]{2,31}$'`),
    check('admin_users_display_name', sql`length(btrim(${t.displayName})) BETWEEN 1 AND 100`),
    check('admin_users_failed_attempts', sql`${t.failedAttempts} >= 0`),
    /** رمز و برنامهٔ تأیید با هم می‌آیند و با هم می‌روند؛ نیمی از ورود معنا ندارد. */
    check('admin_users_credentials', sql`(${t.passwordHash} IS NULL) = (${t.totpSealed} IS NULL)`),
    foreignKey({ columns: [t.createdBy], foreignColumns: [t.id], name: 'admin_users_created_by_fk' }),
  ],
);

/**
 * پیوند ثبت یک‌باره: ۱۵ دقیقه، یک بار. اولین ادمین را دستور روی سرور می‌سازد، بقیه را مالک از پنل؛ «کد
 * ورود تازه» (گوشی گم شد) هم همین است. رمز برنامهٔ تأیید از ساختن پیوند ثابت است، تا بار دوباره شدن
 * صفحه همان QR را نشان دهد.
 */
export const adminInvites = pgTable(
  'admin_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    totpSealed: text('totp_sealed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** کنار گذاشته، بی استفاده: پیوند تازه‌تر، «لغو دعوت»، یا غیرفعال شدن ادمین. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => adminUsers.id),
  },
  (t) => [index('admin_invites_user').on(t.adminUserId, t.createdAt)],
);

/** نشست پنل: کوکی `__Host-jy_admin`، فقط هشش اینجا. ۱۲ ساعت، یا ۱ ساعت بی‌کاری (ADR-037). */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('admin_sessions_user').on(t.adminUserId)],
);

/** هر تلاش ورود، برای سقف هر IP (۳۰ در ساعت). IP فقط HMAC، مثل `otp_requests`. */
export const adminLoginAttempts = pgTable(
  'admin_login_attempts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** همان که تایپ شد، کوچک‌شده؛ ممکن است چنین ادمینی نباشد. */
    username: text('username').notNull(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id),
    ipHash: text('ip_hash').notNull(),
    ok: boolean('ok').notNull(),
  },
  (t) => [index('admin_login_attempts_ip').on(t.ipHash, t.at)],
);

/**
 * نقش‌ها و مجوزها (ADR-007): نقش می‌گوید «چه کاری»، محدودهٔ انتساب (`print_partner_id`) می‌گوید «روی کدام سفارش‌ها».
 * نقش‌ها و مجوزها در کد تعریف شده‌اند (`ADMIN_ROLES`) و `seedReferenceData` اینجا می‌نشاندشان.
 */
export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  nameFa: text('name_fa').notNull(),
});

export const permissions = pgTable('permissions', {
  id: text('id').primaryKey(),
  nameFa: text('name_fa').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

/**
 * نقش هر ادمین و محدوده‌اش (برش ۵٫۳، ADR-042): نقش «چاپخانه» (`print_partner`) فقط سفارش‌هایی را دارد که امروز به همین
 * چاپخانه سپرده شده‌اند؛ نقش‌های دیگر همهٔ سفارش‌ها. ستون نوع‌دار با کلید خارجی، به جای `scope` jsonb که تا ۵٫۲ فقط null بود:
 * چاپخانهٔ ناموجود ممکن نیست، و CHECK یک خط است.
 *
 * - نقش چاپخانه یعنی دقیقاً یک چاپخانه، و نقش‌های دیگر هیچ (`admin_user_roles_partner`).
 * - کاربر چاپخانه فقط همین نقش را دارد (`admin_user_roles_partner_alone`، EXCLUDE در 0020): مالک یا متصدی‌ای که نقش چاپخانه هم
 *   داشت، محدوده‌اش معلوم نبود. یک چاپخانه چند کاربر می‌تواند داشته باشد.
 */
export const adminUserRoles = pgTable(
  'admin_user_roles',
  {
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    /** چاپخانه‌ای که این نقش فقط سفارش‌های آن را دارد؛ null یعنی همهٔ سفارش‌ها. */
    printPartnerId: uuid('print_partner_id').references(() => printPartners.id),
  },
  (t) => [
    primaryKey({ columns: [t.adminUserId, t.roleId] }),
    check('admin_user_roles_partner', sql`(${t.roleId} = 'print_partner') = (${t.printPartnerId} IS NOT NULL)`),
  ],
);

/**
 * هر کار ادمین: چه کسی، کی، چه کاری روی چه چیزی (ADR-038). فقط افزودنی: تریگر
 * `admin_events_append_only` عوض کردن و پاک کردن را رد می‌کند. مقدار کلید یا رمز هیچ‌وقت در `detail`
 * نمی‌نشیند.
 */
export const adminEvents = pgTable(
  'admin_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** null یعنی دستور روی سرور، یا تلاش ورود با نام ناشناس. */
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ipHash: text('ip_hash'),
    detail: jsonb('detail'),
  },
  (t) => [
    index('admin_events_at').on(t.at),
    index('admin_events_actor').on(t.adminUserId, t.at),
    /** رویدادهای یک هدف، مثل سفارشی که صفحهٔ جزئیاتش در پنل باز است (برش ۴٫۲). */
    index('admin_events_target').on(t.targetType, t.targetId, t.at),
  ],
);

/* ──────────────────────────── کلیدهای سرویس‌ها (برش ۴٫۶، ADR-041) ──────────────────────────── */

/**
 * کلید سرویس بیرونی که مالک از پنل گذاشته: کلید API پنل پیامک (sms.ir)، شناسهٔ سه قالب پیامک (کد، و از برش ۷ پرداخت و رهگیری)، کد
 * پذیرندهٔ زیبال. مقدار پنل بر همان نام در `.env` مقدم است؛ ردیف نبودن یعنی `.env` («برگرداندن به .env» ردیف را پاک می‌کند).
 *
 * - `sealed` مهروموم AES-256-GCM با `SECRETS_KEY` است (`sealed.ts`)، بسته به نام همین ردیف (AAD `service_secrets:<نام>`):
 *   نشت پایگاه داده یا پشتیبانش بی `.env` کلیدی لو نمی‌دهد، و مقدار یک کلید در ردیف کلید دیگر باز نمی‌شود. CHECK
 *   `service_secrets_sealed` فقط شکل مهروموم را می‌پذیرد، پس مقدار خام اینجا نمی‌نشیند، حتی با کد اشتباه.
 * - نام فقط همین پنج (CHECK `service_secrets_name`؛ دو قالب تازه با 0027، برش ۷): نه `CHECKOUT_MODE`، نه `SMS_PROVIDER` و
 *   `PAYMENT_PROVIDER`، نه رمزهای خود سرور. کلید تازه مهاجرت تازهٔ همین CHECK را می‌خواهد.
 * - `updated_by` بی کلید خارجی، مثل `price_lists.created_by`: ادمین پاک‌نشدنی است (`admin_users_no_delete`).
 */
export const serviceSecrets = pgTable(
  'service_secrets',
  {
    name: text('name').primaryKey(),
    sealed: text('sealed').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedBy: uuid('updated_by'),
  },
  (t) => [
    check(
      'service_secrets_name',
      sql`${t.name} IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE', 'PAYMENT_MERCHANT_ID')`,
    ),
    check('service_secrets_sealed', sql`${t.sealed} ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22,}$'`),
  ],
);

/* ──────────────────────────── ارسال: ورود فایل پست و مرسوله‌ها (برش ۶٫۱، ADR-045، ADR-046) ──────────────────────────── */

/** بایت خام؛ drizzle نوع آماده‌اش را ندارد. postgres.js آن را `Buffer` می‌دهد و می‌گیرد. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/** سقف فایل پست (ADR-045): فایل ۴۱ بسته‌ای چند ده کیلوبایت است. همان سقف پنل و کارگر. */
export const POST_FILE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * یک فایل پست که به پنل داده شد (ADR-045)، با بایت‌های خامش؛ کارگر جدول‌هایش را می‌خواند (`read_post_file`) و پنل
 * تفسیر، پیش‌نمایش و «ثبت» می‌کند. تا «ثبت» جز خود فایل چیزی نوشته نمی‌شود.
 *
 * - وضعیت: `reading` ← `read` یا `unreadable` (کارگر)؛ `read` ← `committed` («ثبت») یا `discarded` («دور بینداز»، یا
 *   پیش‌نویسی که N روز ماند)؛ `committed` ← `reverted` (یک بار، مالک، با دلیل). گذار دیگر را تریگر
 *   `shipment_imports_flow` رد می‌کند (0022).
 * - همان فایل (sha256) یک بار: ایندکس یکتای جزئی `shipment_imports_one_file`، جز ورودی که برگشت، دور انداخته یا
 *   خوانده نشد؛ پس فایلی که اشتباه وارد و برگردانده شد دوباره واردشدنی است.
 * - `raw` و `tables` N روز پس از ورود پاک می‌شوند (`order.files_retention_days`، ADR-044؛ کارگر، `purged_at`)؛ بایت
 *   دیگری جای `raw` نمی‌نشیند.
 * - `print_partner_id`: واردکنندهٔ چاپخانه (۶٫۲)؛ از ورودش فقط مرسولهٔ سفارش‌های همان چاپخانه پذیرفته می‌شود
 *   (تریگر `shipments_partner_scope`).
 * - ورود پاک نمی‌شود: سابقهٔ پیامکی که رفت و مرسولهٔ کنارگذاشته به آن اشاره می‌کنند.
 */
export const shipmentImports = pgTable(
  'shipment_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** حامل، پشت `ShippingCarrier` (قاعدهٔ ۷، ADR-008): امروز فقط «پست ایران». */
    carrier: text('carrier').notNull(),
    filename: text('filename').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    raw: bytea('raw'),
    status: text('status').notNull().default('reading'),
    /** از محتوا، نه پسوند: `html`، `csv` یا `xlsx`. */
    format: text('format'),
    /** جدول‌هایی که کارگر خواند: هر جدول سطرها، هر سطر خانه‌های متنی، همان‌طور که در فایل بودند. */
    tables: jsonb('tables').$type<string[][][]>(),
    /** خوانده نشد: `xls_binary`، `no_table`، `too_large`، `bad_xlsx`، `too_many_rows` یا `read_failed`. */
    errorCode: text('error_code'),
    printPartnerId: uuid('print_partner_id').references(() => printPartners.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    committedBy: uuid('committed_by').references(() => adminUsers.id),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    /** null با `discarded_at` یعنی کارگر: پیش‌نویسی که N روز ثبت نشد. */
    discardedBy: uuid('discarded_by').references(() => adminUsers.id),
    discardedAt: timestamp('discarded_at', { withTimezone: true }),
    revertedBy: uuid('reverted_by').references(() => adminUsers.id),
    revertedAt: timestamp('reverted_at', { withTimezone: true }),
    revertReason: text('revert_reason'),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
  },
  (t) => [
    index('shipment_imports_created').on(t.createdAt),
    uniqueIndex('shipment_imports_one_file')
      .on(t.sha256)
      .where(sql`${t.status} IN ('reading', 'read', 'committed')`),
    check('shipment_imports_carrier', sql`${t.carrier} = 'iran_post'`),
    check(
      'shipment_imports_status',
      sql`${t.status} IN ('reading', 'read', 'unreadable', 'committed', 'discarded', 'reverted')`,
    ),
    check('shipment_imports_format', sql`${t.format} IS NULL OR ${t.format} IN ('html', 'csv', 'xlsx')`),
    check('shipment_imports_filename', sql`char_length(${t.filename}) BETWEEN 1 AND 255`),
    check('shipment_imports_size', sql`${t.sizeBytes} BETWEEN 1 AND ${sql.raw(String(POST_FILE_MAX_BYTES))}`),
    check('shipment_imports_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    /** بایت خام همان فایل است یا هیچ (پاک‌شده). */
    check('shipment_imports_raw', sql`${t.raw} IS NULL OR octet_length(${t.raw}) = ${t.sizeBytes}`),
    /** جدول‌ها فقط وقتی خوانده شد؛ کد خطا فقط وقتی نشد. */
    check('shipment_imports_read', sql`(${t.status} = 'unreadable') = (${t.errorCode} IS NOT NULL)`),
    check(
      'shipment_imports_committed',
      sql`(${t.status} IN ('committed', 'reverted')) = (${t.committedAt} IS NOT NULL) AND (${t.committedAt} IS NULL) = (${t.committedBy} IS NULL)`,
    ),
    check('shipment_imports_discarded', sql`(${t.status} = 'discarded') = (${t.discardedAt} IS NOT NULL)`),
    check(
      'shipment_imports_reverted',
      sql`(${t.status} = 'reverted') = (${t.revertedAt} IS NOT NULL) AND (${t.revertedAt} IS NULL) = (${t.revertedBy} IS NULL) AND (${t.revertedAt} IS NULL) = (${t.revertReason} IS NULL)`,
    ),
    check('shipment_imports_revert_reason', sql`${t.revertReason} IS NULL OR length(btrim(${t.revertReason})) BETWEEN 1 AND 500`),
  ],
);

/**
 * همهٔ سطرهای ورودی که ثبت شد، با حکم و دلیل (ADR-046). در تراکنش «ثبت» نوشته می‌شوند، فقط برای ورود «ثبت شد»
 * (تریگر `shipment_import_rows_insert`)، و بعد عوض و پاک نمی‌شوند (`shipment_import_rows_frozen`)، جز:
 * - متن سطری که مرسولهٔ ما نشد (`cells`، `name_g`، `destination`؛ نام و مقصد مشتری‌های دیگر چاپخانه) N روز بعد پاک
 *   می‌شود (ADR-045، کارگر): «پیدا نشد»، «خوانده نشد»، «غیرفعال»، «جمع کل»، و از ۶٫۲ سطری که «هیچ‌کدام» خورد؛ سطری که
 *   مرسوله‌ای گرفت، حتی کنارگذاشته، هرگز؛
 * - و «هیچ‌کدام» صف تأیید (۶٫۲)، یک بار: `dismissed_at` و `dismissed_by`.
 *
 * صف تأیید (۶٫۲، ADR-046) ستون تصمیم ندارد: «همین است» و «دادن دستی» خودشان مرسوله‌اند (`shipments.matched_by`، با کننده و
 * زمان)، و سطر در صف است اگر ورودش «ثبت شد» است، حکمش `review` است یا مرسوله‌اش کنار رفته، مرسولهٔ زنده ندارد و «هیچ‌کدام»
 * نخورده. پس کنار گذاشتن مرسوله سطرش را خودبه‌خود به صف برمی‌گرداند.
 *
 * حکم‌ها: `matched` (قطعی)، `review` (صف تأیید)، `unmatched` (پیدا نشد)، `duplicate` (تکراری)، `invalid` (خوانده نشد)،
 * `inactive` (وضعیتش در پست «فعال» نیست؛ سؤال ۷۱) و `total` (ردیف «جمع کل»).
 */
export const shipmentImportRows = pgTable(
  'shipment_import_rows',
  {
    importId: uuid('import_id')
      .notNull()
      .references(() => shipmentImports.id),
    /** شمارهٔ سطر در جدول فایل، سرستون صفر. */
    rowNo: integer('row_no').notNull(),
    /** خانه‌های خام همان سطر. */
    cells: jsonb('cells').$type<string[]>(),
    barcode: text('barcode'),
    /** فقط از «نام گ» و فقط عدد انتهای آن (ADR-010). */
    orderNumber: integer('order_number'),
    nameG: text('name_g'),
    destination: text('destination'),
    weightGrams: integer('weight_grams'),
    fareRials: bigint('fare_rials', { mode: 'number' }),
    taxRials: bigint('tax_rials', { mode: 'number' }),
    /** آغاز روز «تاریخ ثبت» همین بسته به وقت تهران (سؤال ۷۰): پست آن روز بسته را از ما گرفت. */
    postDay: timestamp('post_day', { withTimezone: true }),
    /** ستون «وضعیت» فایل؛ فقط «فعال» ثبت‌شدنی است (سؤال ۷۱). */
    postStatus: text('post_status'),
    verdict: text('verdict').notNull(),
    /** چرا این حکم: `name_mismatch`، `cancelled`، `queued`، `manual_code`… (پنل برای هر کدام پیام دارد). */
    reason: text('reason'),
    /** سفارشی که سطر به آن نشست یا اشاره کرد (قطعی، تکراری، یا شمارهٔ صف تأیید). */
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    /** «هیچ‌کدام» صف تأیید (۶٫۲): سطر از صف بیرون رفت؛ یک بار و برگشت‌ناپذیر (راه اشتباهش «دادن دستی» است). */
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedBy: uuid('dismissed_by').references(() => adminUsers.id),
  },
  (t) => [
    primaryKey({ columns: [t.importId, t.rowNo] }),
    index('shipment_import_rows_order').on(t.orderId),
    /** سطرهای صف تأیید که هنوز «هیچ‌کدام» نخورده‌اند: شمار پیشخوان و فهرست صف. */
    index('shipment_import_rows_review')
      .on(t.importId, t.rowNo)
      .where(sql`${t.verdict} = 'review' AND ${t.dismissedAt} IS NULL`),
    check('shipment_import_rows_row_no', sql`${t.rowNo} > 0`),
    check(
      'shipment_import_rows_verdict',
      sql`${t.verdict} IN ('matched', 'review', 'unmatched', 'duplicate', 'invalid', 'inactive', 'total')`,
    ),
    check('shipment_import_rows_barcode', sql`${t.barcode} IS NULL OR ${t.barcode} ~ '^[0-9]{24}$'`),
    /** قطعی یعنی بارکد درست، سفارش، وزن، کرایه، مالیات و روز. */
    check(
      'shipment_import_rows_matched',
      sql`${t.verdict} <> 'matched' OR (${t.barcode} IS NOT NULL AND ${t.orderId} IS NOT NULL AND ${t.weightGrams} > 0 AND ${t.fareRials} >= 0 AND ${t.taxRials} >= 0 AND ${t.postDay} IS NOT NULL)`,
    ),
    /** «هیچ‌کدام» با کننده و زمانش، و فقط برای سطری که می‌توانست کد سفارش ما شود (قطعی، صف تأیید، پیدا نشد). */
    check(
      'shipment_import_rows_dismissed',
      sql`(${t.dismissedAt} IS NULL) = (${t.dismissedBy} IS NULL) AND (${t.dismissedAt} IS NULL OR ${t.verdict} IN ('matched', 'review', 'unmatched'))`,
    ),
  ],
);

/**
 * مرسوله: یک بسته که به پست رسید، با کد رهگیری، وزن، کرایه و مالیات واقعی (ADR-045، ADR-048). از یک سطر ورود ثبت‌شده.
 *
 * - بارکد دقیقاً ۲۴ رقم (CHECK)، و یکتا میان مرسوله‌های زنده (`shipments_live_barcode`)؛ یک سطر یک مرسولهٔ زنده.
 * - «زنده» یعنی کنار گذاشته نشده. مرسولهٔ زنده فقط برای سفارش «تحویل پست شد»، و سفارشی که مرسولهٔ زنده دارد از آن بیرون
 *   نمی‌رود: هر دو سو در COMMIT (`shipments_order_handed` و `orders_shipments_handed`، 0022؛ مثل تاریخچهٔ تخصیص، ADR-042).
 * - فقط افزودنی: عوض و پاک نمی‌شود (`shipments_frozen`)، جز «کنار گذاشتن» یک بار (`voided_*`).
 * - `handed_order`: همین مرسوله سفارش را از «در حال چاپ» «تحویل پست شد» کرد (کد رهگیری یعنی تحویل پست شد، سؤال ۵۲)؛
 *   برگرداندن ورود همین‌ها را به «در حال چاپ» برمی‌گرداند.
 */
export const shipments = pgTable(
  'shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    barcode: text('barcode').notNull(),
    importId: uuid('import_id').notNull(),
    rowNo: integer('row_no').notNull(),
    weightGrams: integer('weight_grams').notNull(),
    fareRials: bigint('fare_rials', { mode: 'number' }).notNull(),
    taxRials: bigint('tax_rials', { mode: 'number' }).notNull(),
    postDay: timestamp('post_day', { withTimezone: true }).notNull(),
    /**
     * `rule` (قطعی، در «ثبت»)، `review` («همین است» صف تأیید، ۶٫۲) یا `manual` (دادن دستی با شمارهٔ سفارش، ۶٫۲). مرسولهٔ `rule`
     * اولین مرسولهٔ سطرش است: کدی که کنار رفت خودش برنمی‌گردد، فقط با تأیید (`shipments_row`، 0024).
     */
    matchedBy: text('matched_by').notNull(),
    handedOrder: boolean('handed_order').notNull().default(false),
    /** کسی که ثبت یا تأیید کرد. */
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => adminUsers.id),
    voidReason: text('void_reason'),
    /**
     * پیامک رهگیری همین کد (۶٫۳، ADR-047): ردیف «منتظر» در همان تراکنش؛ یا اگر همین کد پیش‌تر برای همین سفارش پیامک شده بود،
     * همان ردیف قبلی (سؤال ۶۷). از ۶٫۳ هرگز خالی (تریگر `shipments_sms`، 0026)؛ خالی یعنی مرسولهٔ پیش از ۶٫۳.
     */
    smsMessageId: bigint('sms_message_id', { mode: 'number' }).references(() => smsMessages.id),
  },
  (t) => [
    index('shipments_order').on(t.orderId),
    index('shipments_sms').on(t.smsMessageId),
    uniqueIndex('shipments_live_barcode')
      .on(t.barcode)
      .where(sql`${t.voidedAt} IS NULL`),
    uniqueIndex('shipments_live_row')
      .on(t.importId, t.rowNo)
      .where(sql`${t.voidedAt} IS NULL`),
    foreignKey({
      columns: [t.importId, t.rowNo],
      foreignColumns: [shipmentImportRows.importId, shipmentImportRows.rowNo],
      name: 'shipments_row_fk',
    }),
    check('shipments_barcode', sql`${t.barcode} ~ '^[0-9]{24}$'`),
    check('shipments_matched_by', sql`${t.matchedBy} IN ('rule', 'review', 'manual')`),
    check('shipments_measures', sql`${t.weightGrams} > 0 AND ${t.fareRials} >= 0 AND ${t.taxRials} >= 0`),
    check(
      'shipments_voided',
      sql`(${t.voidedAt} IS NULL) = (${t.voidedBy} IS NULL) AND (${t.voidedAt} IS NULL) = (${t.voidReason} IS NULL)`,
    ),
    check('shipments_void_reason', sql`${t.voidReason} IS NULL OR length(btrim(${t.voidReason})) BETWEEN 1 AND 500`),
  ],
);
