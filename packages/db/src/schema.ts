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
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ──────────────────────────── تعرفه ──────────────────────────── */

export const sidesMode = pgEnum('sides_mode', ['single', 'double']);
export const colorMode = pgEnum('color_mode', ['color', 'bw']);
/** اندازهٔ کاغذ جزوه (برش ۸٫۳، سؤال ۱۸۳)؛ ابعاد در `PAPER_SIZES` موتور قیمت. */
export const paperSize = pgEnum('paper_size', ['a4', 'a5', 'a3']);

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
    /**
     * `PricingSettings` — حداقل سفارش، مالیات، رُند، وزن بسته‌بندی. نرخ هر رو از ۸٫۳ در `print_rates` است؛ دو ستون
     * `click_rate_*` پیش از آن، بعد از رفتن به همان جدول، پاک شدند (0038 و 0039).
     */
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
  },
  (t) => [primaryKey({ columns: [t.priceListVersion, t.id] })],
);

/**
 * نرخ هر رو چاپ‌شده (برش ۸٫۳، سؤال ۱۸۴): برای هر اندازه، یکرو یا دورو، و رنگی یا سیاه‌سفید. اندازه‌ای ارائه می‌شود که هر
 * چهار ردیفش هست؛ شمار ردیف‌های هر اندازه صفر یا چهار است (تریگر معوق `print_rates_complete`، 0038). نسخه‌های پیش از ۸٫۳
 * با همان دو نرخ برای یکرو و دورو، فقط A4، از ستون‌های `click_rate_*` همان نسخه آمدند (0038).
 */
export const printRates = pgTable(
  'print_rates',
  {
    priceListVersion: integer('price_list_version')
      .notNull()
      .references(() => priceLists.version, { onDelete: 'cascade' }),
    paperSize: paperSize('paper_size').notNull(),
    sidesMode: sidesMode('sides_mode').notNull(),
    colorMode: colorMode('color_mode').notNull(),
    /** ریال به‌ازای هر **رو** چاپ‌شده — نه هر برگ. صفر نمی‌شود. */
    rateRials: bigint('rate_rials', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.priceListVersion, t.paperSize, t.sidesMode, t.colorMode] }),
    check('print_rates_positive', sql`${t.rateRials} > 0`),
  ],
);

/**
 * نرخ هر برگ هر کاغذ، برای هر اندازه‌ای که آن کاغذ دارد (برش ۸٫۳، سؤال ۱۸۶): اندازه‌ای که ردیف ندارد، این کاغذ را ندارد.
 * تحریر صفر است، چون کل نرخ در `print_rates` نشسته. پیش از ۸٫۳ یک نرخ در `paper_types.rate_per_sheet_rials` بود، که برای
 * A4 به اینجا آمد (0038).
 */
export const paperRates = pgTable(
  'paper_rates',
  {
    priceListVersion: integer('price_list_version').notNull(),
    paperTypeId: text('paper_type_id').notNull(),
    paperSize: paperSize('paper_size').notNull(),
    rateRials: bigint('rate_rials', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.priceListVersion, t.paperTypeId, t.paperSize] }),
    // مثل بازه‌های صحافی: کلید خارجی به خود کاغذ، که به تعرفه وصل است.
    foreignKey({
      columns: [t.priceListVersion, t.paperTypeId],
      foreignColumns: [paperTypes.priceListVersion, paperTypes.id],
      name: 'paper_rates_paper_type_fk',
    }).onDelete('cascade'),
    check('paper_rates_nonnegative', sql`${t.rateRials} >= 0`),
  ],
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
    /** کمترین **برگ** یک جلد (برش ۸٫۳)؛ جزوهٔ نازک‌تر این صحافی را نمی‌خورد. */
    minSheets: integer('min_sheets').notNull().default(1),
    /** بیشترین **برگ** یک جلد. */
    maxSheetsPerVolume: integer('max_sheets_per_volume').notNull(),
    /** بالای سقف: true یعنی خودکار چند جلد (طلق و سیم، و هر صحافی پیش از ۸٫۳)، false یعنی این صحافی نمی‌خورد (منگنه). */
    splitsVolumes: boolean('splits_volumes').notNull().default(true),
    weightPerVolumeGrams: integer('weight_per_volume_grams').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.priceListVersion, t.id] }),
    check('binding_types_sheets', sql`${t.minSheets} >= 1 AND ${t.maxSheetsPerVolume} >= ${t.minSheets}`),
  ],
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
    /**
     * بازه‌های هر اندازه جدا (برش ۸٫۳): صحافی‌ای اندازه‌ای را دارد که بازه دارد. پیش از ۸٫۳ همه A4 بودند؛ پیش‌فرض ستون فقط
     * برای همان ردیف‌ها بود و رفت (0039)، پس اندازه همیشه گفته می‌شود.
     */
    paperSize: paperSize('paper_size').notNull(),
    minSheets: integer('min_sheets').notNull(),
    maxSheets: integer('max_sheets').notNull(),
    priceRials: bigint('price_rials', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.priceListVersion, t.bindingTypeId, t.paperSize, t.minSheets] }),
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

/**
 * پله‌های تخفیف سفارش بزرگ هر نسخهٔ تعرفه (برش ۱۱٫۴، ADR-062، سؤال‌های ۲۱۰ و ۲۹۵): از `from_rials` جمع چاپ، کاغذ و صحافی (پیش از
 * کرایه)، `percent` درصد تخفیف روی همان جمع و/یا ارسال رایگان؛ فقط بالاترین پله‌ای که جمع به آن رسیده می‌نشیند (`quote()`). مثل
 * بقیهٔ ردیف‌های نسخه فقط در پیش‌نویس عوض می‌شود (`price_list_rows_frozen`، 0048)، و هر نسخه تا ۵ پله (`discount_tiers_max`،
 * همان `DISCOUNT_TIERS_MAX` قرارداد). سقف درصد همان `TIER_PERCENT_MAX` قرارداد است؛ تست یکپارچگی برابرشان را می‌سنجد.
 */
export const discountTiers = pgTable(
  'discount_tiers',
  {
    priceListVersion: integer('price_list_version')
      .notNull()
      .references(() => priceLists.version, { onDelete: 'cascade' }),
    /** آستانه، ریال، روی جمع چاپ، کاغذ و صحافی. */
    fromRials: bigint('from_rials', { mode: 'number' }).notNull(),
    /** درصد تخفیف روی همان جمع؛ ۰ یعنی فقط ارسال رایگان. */
    percent: smallint('percent').notNull(),
    freeShipping: boolean('free_shipping').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.priceListVersion, t.fromRials] }),
    check('discount_tiers_from', sql`${t.fromRials} > 0`),
    check('discount_tiers_percent', sql`${t.percent} BETWEEN 0 AND 50`),
    check('discount_tiers_reward', sql`${t.percent} > 0 OR ${t.freeShipping}`),
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
    /** نسخهٔ قالب برگه‌ای که کار رویش است: پیش‌نمایشش (`preview_ticket_template`، برش ۹٫۲، ADR-057). */
    ticketTemplateId: integer('ticket_template_id').references(() => ticketTemplates.id, { onDelete: 'cascade' }),
    /** خروجی PDF گزارشی که کار رویش است: ساختنش (`render_report`، برش ۱۰٫۲، ADR-061). */
    reportExportId: uuid('report_export_id').references(() => reportExports.id, { onDelete: 'cascade' }),
    /** تصویر سایتی که کار رویش است: ساختن فایل‌هایش (`build_site_image`، برش ۱۱٫۲، ADR-067). */
    siteImageId: integer('site_image_id').references(() => siteImages.id, { onDelete: 'cascade' }),
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
    /** و برای نسخهٔ قالب: یک کار پیش‌نمایش، که پیش‌نمایش دوباره همان را دوباره در صف می‌گذارد. */
    uniqueIndex('jobs_ticket_template_kind').on(t.ticketTemplateId, t.kind),
    /** و برای خروجی گزارش: یک کار ساختن برای هر خروجی. */
    uniqueIndex('jobs_report_export_kind').on(t.reportExportId, t.kind),
    /** و برای تصویر سایت: یک کار ساختن برای هر بارگذاری. */
    uniqueIndex('jobs_site_image_kind').on(t.siteImageId, t.kind),
    /** هر کار مال یک چیز است: سند، سفارش، ورود فایل پست، نسخهٔ قالب، خروجی گزارش یا تصویر سایت. */
    check(
      'jobs_one_target',
      sql`num_nonnulls(${t.documentId}, ${t.orderId}, ${t.shipmentImportId}, ${t.ticketTemplateId}, ${t.reportExportId}, ${t.siteImageId}) <= 1`,
    ),
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
 *   استان، وگرنه نزدیک‌ترین با مختصات `@jozveyar/geo`، از ۱۰٫۱؛ `rankPartners`). پیش‌فرض فقط در برابری فاصله، مثل دو چاپخانهٔ یک شهر.
 * - حداکثر یک پیش‌فرض (`print_partners_one_default`)، و پیش‌فرض فعال است (`print_partners_default_active`).
 * - پاک نمی‌شود، غیرفعال می‌شود (`deactivated_at`): سفارش‌ها و تاریخچهٔ تخصیص به آن اشاره می‌کنند. غیرفعال کردن فقط وقتی
 *   سفارش باز ندارد؛ هر دو را تریگر `print_partners_guard` هم می‌سنجد (0018).
 * - `created_by` بی کلید خارجی، مثل `price_lists.created_by`؛ null یعنی دادهٔ پایه.
 * - `notify_mobile` (برش ۷٫۶، سؤال ۱۲۶): موبایل اعلان اختیاری، نرمال (`09…`)؛ هر سفارش تازه‌ای که به این چاپخانه برسد یک پیامک از صف
 *   به همین شماره دارد (`order_assignments.sms_message_id`). خالی یعنی بی پیامک.
 * - **در دسترس بودن** (برش ۱۰٫۱، سؤال ۲۰۰، ADR-060): `availability` «باز» (`open`)، «شلوغ» (`busy`) یا «تعطیل» (`closed`) با روزهایش:
 *   `closed_from` آغاز اولین روز تعطیل و `closed_until` آغاز روز باز شدن (پایان انحصاری)، هر دو نیمه‌شب تهران، مثل مهلت تحویل به
 *   پست؛ تعطیلی آینده تا رسیدنش «باز» است، و گذشته دیگر هیچ (`availabilityAt`). یادداشت فقط برای شلوغ و تعطیل. سفارش و تخصیص گذشته را
 *   دست نمی‌زند: فقط سفارش‌های بعدی (`rankPartners`).
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
    /** موبایل اعلان (برش ۷٫۶): پیامک سفارش تازه به همین؛ null یعنی بی پیامک. */
    notifyMobile: text('notify_mobile'),
    /** `open`، `busy` یا `closed` (برش ۱۰٫۱). */
    availability: text('availability').notNull().default('open'),
    /** آغاز اولین روز تعطیل، نیمه‌شب تهران؛ فقط با `closed`. */
    closedFrom: timestamp('closed_from', { withTimezone: true }),
    /** آغاز روز باز شدن (پایان انحصاری)، نیمه‌شب تهران؛ فقط با `closed`. */
    closedUntil: timestamp('closed_until', { withTimezone: true }),
    /** «دستگاه خراب است»: فقط برای شلوغ و تعطیل، ۱ تا ۲۰۰ نویسه. */
    availabilityNote: text('availability_note'),
    /**
     * سهم چاپخانه (برش ۱۰٫۳، ADR-069؛ سؤال ۲۰۳: «درصدی از سفارش»)، صدم درصد: ۶۵۰۰ یعنی ۶۵٪ از جمع چاپ، کاغذ و صحافی سفارش پیش از تخفیف. null یعنی
     * هنوز تعیین نشده: سفارشی که حالا سپرده شود «بی سهم» است؛ ۰ یعنی سهمی ندارد (چاپخانهٔ خود جزوه‌یار). سهم هر سفارش هنگام تخصیص روی
     * ردیف تخصیص منجمد می‌شود، پس عوض کردن این فقط سپردن‌های بعدی را عوض می‌کند.
     */
    shareBp: integer('share_bp'),
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
    /** همان شکل `users.mobile`: نرمال‌شده با `normalizeIranMobile`. */
    check('print_partners_notify_mobile', sql`${t.notifyMobile} IS NULL OR ${t.notifyMobile} ~ '^09[0-9]{9}$'`),
    /** «تعطیل» یعنی دقیقاً هر دو روز، آغاز پیش از پایان و حداکثر یک سال؛ «باز» و «شلوغ» هیچ‌کدام. */
    check(
      'print_partners_closed',
      sql`${t.availability} IN ('open', 'busy', 'closed')
       AND (${t.availability} = 'closed') = (${t.closedFrom} IS NOT NULL)
       AND (${t.closedFrom} IS NULL) = (${t.closedUntil} IS NULL)
       AND (${t.closedFrom} IS NULL OR (${t.closedFrom} < ${t.closedUntil} AND ${t.closedUntil} <= ${t.closedFrom} + interval '366 days'))`,
    ),
    /** یادداشت فقط برای شلوغ و تعطیل، تمیز و ۱ تا ۲۰۰ نویسه. */
    check(
      'print_partners_availability_note',
      sql`${t.availabilityNote} IS NULL
       OR (${t.availability} <> 'open' AND length(${t.availabilityNote}) BETWEEN 1 AND 200
           AND ${t.availabilityNote} = btrim(${t.availabilityNote}))`,
    ),
    /** ۰ تا ۱۰۰ درصد با دو رقم اعشار (سؤال ۳۹۱)؛ ۰ یعنی «سهمی ندارد»، مثل چاپخانهٔ خود جزوه‌یار، نه «تعیین نشده». */
    check('print_partners_share', sql`${t.shareBp} IS NULL OR ${t.shareBp} BETWEEN 0 AND 10000`),
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
 * مسدودی موبایل مشتری (برش ۱۲٫۲، ADR-063، سؤال ۲۱۲). مالک و متصدی از صفحهٔ سفارش، با دلیلی که فقط پنل می‌بیند. اثرش: کد پیامکی به این
 * شماره نمی‌رود (`issueOtp`)، و سفارش تازه و تلاش پرداخت تازه ساخته نمی‌شود (`orders_mobile_blocked` و `payments_mobile_blocked`، 0050).
 * سفارش پرداخت‌شده همان‌طور چاپ و ارسال می‌شود، و تلاشی که پیش از مسدودی شروع شد همان‌طور به نتیجه می‌رسد.
 *
 * - هر مسدودی یک ردیف است و «رفع مسدودی» همان ردیف را می‌بندد (چه کسی و کی)؛ مسدودی دوباره ردیف تازه است. تاریخچه می‌ماند: ردیف پاک
 *   نمی‌شود و جز همان بستن یک‌باره عوض نمی‌شود (`mobile_blocks_guard`، 0050).
 * - برای هر شماره یک مسدودی زنده (`mobile_blocks_live`).
 * - شمارهٔ سفارشی که مسدودی از صفحه‌اش آمد فقط برای نمایش است، بی کلید خارجی: پاک شدن سفارش (تست‌ها) ردیف را عوض نمی‌کند.
 * - `blocked_by` و `unblocked_by` بی کلید خارجی، مثل `discount_codes.created_by`: ادمین پاک‌نشدنی است.
 */
export const mobileBlocks = pgTable(
  'mobile_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mobile: text('mobile').notNull(),
    /** فقط پنل؛ مشتری هرگز نمی‌بیند. یک خط تا ۵۰۰ نویسه، فارسی‌نرمال (`tidyInputFa`)، مثل دلیل لغو (`REASON_MAX`). */
    reason: text('reason').notNull(),
    orderNumber: integer('order_number'),
    blockedBy: uuid('blocked_by').notNull(),
    blockedAt: timestamp('blocked_at', { withTimezone: true }).notNull().defaultNow(),
    unblockedBy: uuid('unblocked_by'),
    unblockedAt: timestamp('unblocked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('mobile_blocks_live').on(t.mobile).where(sql`${t.unblockedAt} IS NULL`),
    check('mobile_blocks_mobile', sql`${t.mobile} ~ '^09[0-9]{9}$'`),
    check('mobile_blocks_reason', sql`length(${t.reason}) <= 500 AND btrim(${t.reason}) <> '' AND ${t.reason} = btrim(${t.reason})`),
    check(
      'mobile_blocks_unblocked',
      sql`(${t.unblockedAt} IS NULL) = (${t.unblockedBy} IS NULL) AND (${t.unblockedAt} IS NULL OR ${t.unblockedAt} >= ${t.blockedAt})`,
    ),
  ],
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

/** نوع کد تخفیف (برش ۱۱٫۴): درصد روی جمع چاپ، کاغذ و صحافی با سقف اختیاری هر سفارش، یا مبلغ ثابت. */
export const discountKind = pgEnum('discount_kind', ['percent', 'fixed']);

/**
 * کد تخفیف (برش ۱۱٫۴، ADR-062، سؤال‌های ۲۰۹ و ۲۹۸ تا ۳۰۲). مالک از پنل می‌سازد؛ مشتری در «مرور و پرداخت»، پس از هویت، وارد می‌کند، و
 * مبلغش را موتور قیمت حساب می‌کند (`DiscountCodeTerms`، با پلهٔ سفارش بزرگ جمع نمی‌شود). سفارشی که کد رویش نشست
 * `orders.discount_code_id` را دارد، منجمد با قیمتش.
 *
 * - متن ۳ تا ۲۰ حرف بزرگ و رقم لاتین (`normalizeDiscountCode`)، یکتا.
 * - درصد ۱ تا ۱۰۰ با سقف اختیاری هر سفارش، یا مبلغ ثابت؛ حداقل سفارش روی همان جمع چاپ، کاغذ و صحافی.
 * - روز اعتبار: `valid_from` نیمه‌شب تهرانِ روز اول (شامل) و `valid_until` نیمه‌شب پس از روز آخر (انحصاری)، مثل تعطیلی چاپخانه؛ null
 *   یعنی بی مرز.
 * - سقف کل (null یعنی بی سقف) و سقف هر مشتری (موبایل تأییدشده، `orders.user_id`)، روی سفارش‌های پرداخت‌شده و رزروهای زنده
 *   (`discount_code_room`، 0048).
 * - متن، سازنده و زمان ساختن هرگز عوض نمی‌شوند، و شرط‌ها (نوع، درصد، سقف، مبلغ و حداقل) از اولین سفارشی که کد را گرفت؛ پاک نمی‌شود،
 *   خاموش می‌شود (`discount_codes_guard`، 0048).
 */
export const discountCodes = pgTable(
  'discount_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    kind: discountKind('kind').notNull(),
    /** فقط `percent`: ۱ تا ۱۰۰. */
    percent: smallint('percent'),
    /** فقط `percent`: سقف تخفیف یک سفارش، ریال؛ null یعنی بی سقف. */
    maxDiscountRials: bigint('max_discount_rials', { mode: 'number' }),
    /** فقط `fixed`: مبلغ، ریال؛ تا خود جمع چاپ، کاغذ و صحافی. */
    amountRials: bigint('amount_rials', { mode: 'number' }),
    minOrderRials: bigint('min_order_rials', { mode: 'number' }).notNull().default(0),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    totalLimit: integer('total_limit'),
    perCustomerLimit: integer('per_customer_limit').notNull().default(1),
    enabled: boolean('enabled').notNull().default(true),
    /** یادداشت داخلی مالک («کمپین مهر»)؛ مشتری نمی‌بیند. */
    note: text('note'),
    /** بی کلید خارجی، مثل `price_lists.created_by`: ادمین پاک‌نشدنی است (`admin_users_no_delete`). */
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('discount_codes_code_unique').on(t.code),
    check('discount_codes_code', sql`${t.code} ~ '^[A-Z0-9]{3,20}$'`),
    check(
      'discount_codes_terms',
      // هر شرط با IS NOT NULL صریح: مقایسه با null «نامعلوم» است و CHECK نامعلوم را می‌پذیرد.
      sql`(${t.kind} = 'percent' AND ${t.percent} IS NOT NULL AND ${t.percent} BETWEEN 1 AND 100 AND ${t.amountRials} IS NULL
             AND (${t.maxDiscountRials} IS NULL OR ${t.maxDiscountRials} > 0))
          OR (${t.kind} = 'fixed' AND ${t.amountRials} IS NOT NULL AND ${t.amountRials} > 0 AND ${t.percent} IS NULL
             AND ${t.maxDiscountRials} IS NULL)`,
    ),
    check('discount_codes_min_order', sql`${t.minOrderRials} >= 0`),
    check('discount_codes_window', sql`${t.validFrom} IS NULL OR ${t.validUntil} IS NULL OR ${t.validFrom} < ${t.validUntil}`),
    check('discount_codes_limits', sql`(${t.totalLimit} IS NULL OR ${t.totalLimit} >= 1) AND ${t.perCustomerLimit} >= 1`),
    check('discount_codes_note', sql`${t.note} IS NULL OR length(btrim(${t.note})) BETWEEN 1 AND 200`),
  ],
);

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
    /**
     * کد تخفیفی که روی این قیمت نشست (برش ۱۱٫۴، ADR-062)؛ null یعنی هیچ، یا پلهٔ سفارش بزرگ. منجمد با قیمت (`orders_price_frozen`)،
     * همان `price_breakdown.discount.codeId` (`orders_discount_code`)، و از ظرفیت کد می‌گیرد (`orders_discount_code_room`، 0048).
     */
    discountCodeId: uuid('discount_code_id').references(() => discountCodes.id),

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
    /** سفارش‌های پرداخت‌شده و رزروشدهٔ هر کد تخفیف (۱۱٫۴): ظرفیت کد زیر قفل، و فهرست «تخفیف‌ها». */
    index('orders_discount_code').on(t.discountCodeId, t.status).where(sql`${t.discountCodeId} IS NOT NULL`),
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
    // تخفیف (۱۱٫۴) فقط روی جمع چاپ، کاغذ و صحافی است.
    check('orders_discount_rials', sql`${t.discountRials} BETWEEN 0 AND ${t.subtotalRials}`),
    // کد سفارش همان کد ریز قیمت منجمد است، و فقط وقتی تخفیفی داد (۱۱٫۴). سفارش‌های پیش از ۱۱٫۴ `discount` ندارند. IS NOT NULL صریح، چون
    // مقایسه با null «نامعلوم» است و CHECK نامعلوم را می‌پذیرد.
    check(
      'orders_discount_code',
      sql`(${t.discountCodeId} IS NULL AND ${t.priceBreakdown}->'discount'->>'source' IS DISTINCT FROM 'code')
          OR (${t.discountCodeId} IS NOT NULL AND ${t.discountCodeId}::text IS NOT DISTINCT FROM ${t.priceBreakdown}->'discount'->>'codeId'
              AND ${t.priceBreakdown}->'discount'->>'source' = 'code' AND ${t.discountRials} > 0)`,
    ),
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
    /**
     * اندازهٔ کاغذ جزوه (برش ۸٫۳)؛ فایل چاپ هر صفحه را روی همین «Fit» می‌کند. منجمد، مثل بقیهٔ مشخصات
     * (`order_items_frozen`، 0038). سفارش‌های پیش از ۸٫۳ همه A4 بودند؛ پیش‌فرض ستون فقط برای همان‌ها بود و رفت (0039).
     */
    paperSize: paperSize('paper_size').notNull(),
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
    /**
     * صفحه‌های PDF (برش ۹٫۲): بیجک و برگهٔ اول هر جزوه. پیش‌نمایش صفحهٔ n ام کنار `preview_key` با `-n.png` است؛ برگهٔ پیش از ۹٫۲
     * یک صفحه بود.
     */
    pageCount: integer('page_count').notNull().default(1),
    /** نسخهٔ قالب بیجک و برگهٔ اولی که برگه با آن ساخته شد؛ null یعنی قالب پیش‌فرض کارگر (برش ۹٫۲). */
    bijakTemplateId: integer('bijak_template_id').references(() => ticketTemplates.id),
    firstPageTemplateId: integer('first_page_template_id').references(() => ticketTemplates.id),
  },
  (t) => [
    check(
      'order_tickets_file',
      sql`${t.storageKey} LIKE 'orders/%' AND ${t.previewKey} LIKE 'orders/%' AND ${t.sizeBytes} > 0 AND ${t.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check('order_tickets_pages', sql`${t.pageCount} BETWEEN 1 AND 200`),
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
 * - سیستم فقط در پرداخت: از هیچ، با `rule` — `city` هم‌شهر مشتری، `province` هم‌استان، از ۱۰٫۱ `nearest` نزدیک‌ترین چاپخانه و
 *   `reopening` اولین چاپخانه‌ای که باز می‌شود وقتی همه تعطیل‌اند (`rankPartners`)؛ `default` (چاپخانهٔ پیش‌فرض) و `oldest`
 *   (قدیمی‌ترین وقتی پیش‌فرضی نیست) فقط در تخصیص‌های پیش از ۱۰٫۱.
 * - ادمین (جابه‌جایی، یا چاپخانهٔ سفارشی که نداشت): با `admin_user_id` و دلیل ۱ تا ۵۰۰ نویسه، که فقط در پنل دیده می‌شود. از ۱۰٫۱
 *   (سؤال ۱۹۹) سپردن سفارشی که چاپخانه نداشت دلیل نمی‌خواهد: یک کلیک در حالت دستی؛ جابه‌جایی همیشه با دلیل. CHECKی که null می‌شود
 *   می‌گذرد، پس هر شاخه `IS NOT NULL` صریح دارد: پیش از ۱۰٫۱ ردیف ادمین بی دلیل و ردیف سیستم بی قاعده هم پذیرفته می‌شد.
 * - پیامک چاپخانه (برش ۷٫۶، سؤال ۱۲۶): تخصیص به چاپخانه‌ای که موبایل اعلان دارد ردیف «منتظر» `sms_messages` خودش را دارد، در همان
 *   تراکنش؛ بی موبایل، بی پیامک (تریگر `order_assignments_sms`، 0036). یک پیامک برای هر تخصیص (`order_assignments_sms`)، و چون ردیف
 *   تخصیص عوض نمی‌شود، پیامکش هم.
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
    /** پیامک سفارش تازه به چاپخانه (برش ۷٫۶)؛ null برای چاپخانهٔ بی موبایل اعلان و تخصیص‌های پیش از ۷٫۶. */
    smsMessageId: bigint('sms_message_id', { mode: 'number' }).references(() => smsMessages.id),
    /**
     * سهم چاپخانه از این سفارش (برش ۱۰٫۳، ADR-069، سؤال ۳۹۲): درصد امروز همان چاپخانه و مبلغش، که خود پایگاه داده هنگام درج می‌نشاند
     * (`order_assignments_share`، 0060)، از جمع چاپ، کاغذ و صحافی منجمد سفارش، به تومان گرد. سهم سفارش همان آخرین تخصیص است. null یعنی
     * چاپخانه درصد نداشت، یا تخصیص پیش از ۱۰٫۳ است.
     */
    shareBp: integer('share_bp'),
    shareRials: bigint('share_rials', { mode: 'number' }),
  },
  (t) => [
    index('order_assignments_order').on(t.orderId, t.id),
    check(
      'order_assignments_share',
      sql`(${t.shareBp} IS NULL) = (${t.shareRials} IS NULL)
       AND (${t.shareBp} IS NULL OR (${t.shareBp} BETWEEN 0 AND 10000 AND ${t.shareRials} >= 0 AND ${t.shareRials} % 10 = 0))`,
    ),
    /** یک پیامک برای هر تخصیص (ردیف پیامک به تخصیص دیگری وصل نمی‌شود). */
    uniqueIndex('order_assignments_sms').on(t.smsMessageId),
    check('order_assignments_moves', sql`${t.fromPartnerId} IS DISTINCT FROM ${t.toPartnerId}`),
    check(
      'order_assignments_actor',
      sql`(${t.actor} = 'system' AND ${t.adminUserId} IS NULL AND ${t.fromPartnerId} IS NULL AND ${t.reason} IS NULL
            AND ${t.rule} IS NOT NULL AND ${t.rule} IN ('city', 'province', 'nearest', 'reopening', 'default', 'oldest'))
       OR (${t.actor} = 'admin' AND ${t.adminUserId} IS NOT NULL AND ${t.rule} IS NULL
            AND ((${t.reason} IS NOT NULL AND length(btrim(${t.reason})) BETWEEN 1 AND 500)
                 OR (${t.reason} IS NULL AND ${t.fromPartnerId} IS NULL)))`,
    ),
  ],
);

/**
 * یادداشت داخلی سفارش (برش ۹٫۳، ADR-058؛ سؤال ۱۹۵): مالک و متصدی می‌نویسند و می‌خوانند؛ چاپخانه فقط یادداشتی را می‌بیند که «چاپخانه هم
 * ببیند» دارد («اسم استاد روی جلد نیاید»)، و فقط روی سفارش‌های خودش. فقط افزودنی، مثل تاریخچهٔ تخصیص (تریگر `order_notes_append_only`،
 * 0043؛ پاک شدن فقط با خود سفارش): اشتباه با یادداشت تازه درست می‌شود.
 *
 * - `body` متن نرمال‌شده (`tidyInputLinesFa`: هر خط فارسی‌نرمال، خط خالی نه)، ۱ تا ۱٬۰۰۰ نویسه (`order_notes_body`).
 * - `request_id` شناسهٔ فرمی که یادداشت را فرستاد (صفحه با هر بار ساختن فرم یکی تازه می‌گذارد): دو کلیک، یا فرستادن دوباره پس از پاسخی
 *   که نرسید، یک یادداشت است (`order_notes_request`).
 */
export const orderNotes = pgTable(
  'order_notes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id),
    body: text('body').notNull(),
    partnerVisible: boolean('partner_visible').notNull(),
    requestId: uuid('request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_notes_order').on(t.orderId, t.id),
    uniqueIndex('order_notes_request').on(t.requestId),
    check('order_notes_body', sql`length(${t.body}) <= 1000 AND btrim(${t.body}, E' \\n') <> '' AND ${t.body} = btrim(${t.body}, E' \\n')`),
  ],
);

/**
 * نظر مشتری دربارهٔ سفارش (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): صاحب سفارش پس از «تحویل پست شد» یک بار، نمرهٔ ۱ تا ۵ و متن اختیاری. هیچ نظری
 * پیش از تأیید مالک عمومی نیست؛ روی صفحهٔ اصلی فقط تأییدشدهٔ متن‌دار، با نام کوچک و شهری که مشتری زیر فرم دید (`public_name` و
 * `public_place`، هنگام فرستادن از خود سفارش و منجمد).
 *
 * - **وضعیت:** `pending` تازه است؛ `approved` روی سایت (فقط با متن)، `hidden` نه؛ و `deleted` یعنی مالک پاکش کرد: نمره و متن برای همیشه
 *   می‌روند و ردیف خالی می‌ماند تا همان سفارش دوباره فرم نگیرد. محافظ‌ها در `0052`.
 * - `decided_by` بی کلید خارجی، مثل `mobile_blocks.blocked_by`: ادمین پاک‌نشدنی است. با پاک شدن سفارش (تست‌ها) می‌رود، و جز آن هرگز.
 */
export const orderReviews = pgTable(
  'order_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** ۱ تا ۵؛ پاک‌شده خالی. */
    rating: smallint('rating'),
    /** اختیاری، هر خط فارسی‌نرمال (`tidyInputLinesFa`)، تا ۵۰۰ نویسه؛ پاک‌شده خالی. */
    body: text('body'),
    /** «سارا»: نام کوچک گیرنده (`firstNameOf` سایت)؛ نام خانوادگی هرگز. */
    publicName: text('public_name').notNull(),
    /** «مشهد»، یا «استان …» اگر شهر در فهرست نبود. */
    publicPlace: text('public_place').notNull(),
    status: text('status').$type<'pending' | 'approved' | 'hidden' | 'deleted'>().notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** آخرین تصمیم مالک (روی سایت، پنهان، پاک) و کسی که گرفت. */
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by'),
  },
  (t) => [
    uniqueIndex('order_reviews_order').on(t.orderId),
    index('order_reviews_status').on(t.status, t.createdAt),
    check('order_reviews_status', sql`${t.status} IN ('pending', 'approved', 'hidden', 'deleted')`),
    check('order_reviews_content', sql`(${t.status} = 'deleted') = (${t.rating} IS NULL) AND (${t.status} <> 'deleted' OR ${t.body} IS NULL)`),
    check('order_reviews_rating', sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 5`),
    check(
      'order_reviews_body',
      sql`${t.body} IS NULL OR (length(${t.body}) <= 500 AND btrim(${t.body}, E' \\n') <> '' AND ${t.body} = btrim(${t.body}, E' \\n'))`,
    ),
    check('order_reviews_approved_body', sql`${t.status} <> 'approved' OR ${t.body} IS NOT NULL`),
    check(
      'order_reviews_public',
      sql`btrim(${t.publicName}) <> '' AND length(${t.publicName}) <= 100 AND btrim(${t.publicPlace}) <> '' AND length(${t.publicPlace}) <= 80`,
    ),
    check(
      'order_reviews_decided',
      sql`(${t.status} = 'pending') = (${t.decidedAt} IS NULL) AND (${t.decidedAt} IS NULL) = (${t.decidedBy} IS NULL) AND (${t.decidedAt} IS NULL OR ${t.decidedAt} >= ${t.createdAt})`,
    ),
  ],
);

/**
 * گفت‌وگوی پشتیبانی (برش ۱۲٫۱، ADR-068؛ سؤال‌های ۲۱۱ و ۳۰۹ تا ۳۱۶): مشتری از «سفارش‌های من» دربارهٔ یک سفارش یا «سؤال کلی» پیام می‌دهد،
 * و مالک و متصدی از «پشتیبانی» پنل پاسخ می‌دهند. یک گفت‌وگو برای هر سفارش (`support_threads_order`) و یک «سؤال کلی» برای هر مشتری
 * (`support_threads_general`): پیام تازه به همان می‌رود و گفت‌وگوی بسته را دوباره باز می‌کند.
 *
 * - **حال** (`status`): `open` منتظر ما (برای مشتری «منتظر پاسخ»)، `answered` «پاسخ داده شد»، `closed` «بسته». فقط پیام‌ها حال را عوض
 *   می‌کنند: تریگر `support_messages_apply` پس از هر پیام، و `support_threads_guard` هر تغییر دیگری را رد می‌کند، جز «دیده شد» مشتری (0058).
 * - `waiting_since`: اولین پیام مشتری که هنوز پاسخ نگرفته، فقط در `open` (`support_threads_waiting`). صندوق «باز» قدیمی‌ترین انتظار را اول
 *   می‌آورد، و پیشخوان «قدیمی‌ترین از …» را از همین می‌گوید.
 * - `last_message_at`: آخرین پیام، از هر دو سو؛ ترتیب «تازه‌ترین پیام اول» و فهرست «پیام‌ها»ی مشتری.
 * - `customer_seen_at`: آخرین باری که مشتری گفت‌وگو را دید؛ «پاسخ تازه»، و پیامک پاسخی که تا مشتری پاسخ قبلی را ندیده دوباره نمی‌رود
 *   (سؤال ۳۱۲). فقط جلو می‌رود.
 * - گفت‌وگوی سفارش فقط با خود سفارش پاک می‌شود (تست‌ها)، و «سؤال کلی» هرگز.
 */
export const supportThreads = pgTable(
  'support_threads',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** null یعنی «سؤال کلی». */
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    status: text('status').$type<'open' | 'answered' | 'closed'>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    waitingSince: timestamp('waiting_since', { withTimezone: true }),
    customerSeenAt: timestamp('customer_seen_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('support_threads_order').on(t.orderId).where(sql`${t.orderId} IS NOT NULL`),
    uniqueIndex('support_threads_general').on(t.userId).where(sql`${t.orderId} IS NULL`),
    index('support_threads_user').on(t.userId, t.lastMessageAt),
    index('support_threads_inbox').on(t.status, t.waitingSince),
    check('support_threads_status', sql`${t.status} IN ('open', 'answered', 'closed')`),
    check('support_threads_waiting', sql`(${t.status} = 'open') = (${t.waitingSince} IS NOT NULL)`),
    check(
      'support_threads_times',
      sql`${t.lastMessageAt} >= ${t.createdAt} AND (${t.waitingSince} IS NULL OR (${t.waitingSince} >= ${t.createdAt} AND ${t.waitingSince} <= ${t.lastMessageAt}))`,
    ),
  ],
);

/**
 * پیام‌های هر گفت‌وگوی پشتیبانی (برش ۱۲٫۱، ADR-068، سؤال‌های ۳۱۰ و ۳۱۴). فقط افزودنی، مثل یادداشت سفارش (`support_messages_guard`، 0058):
 * پیام فرستاده‌شده عوض و پاک نمی‌شود، جز با پاک شدن خود گفت‌وگو.
 *
 * - **نوع** (`kind`): `customer` پیام مشتری (۱ تا ۱٬۰۰۰ نویسه)، `staff` پاسخ پشتیبانی (۱ تا ۲٬۰۰۰ نویسه، با ادمینی که نوشت؛ مشتری نامش را
 *   نمی‌بیند و «پشتیبانی جزوه‌یار» می‌بیند)، و `closed` نشان «بستن گفت‌وگو» با ادمینی که بست، بی متن. متن هر خط فارسی‌نرمال است
 *   (`tidyInputLinesFa`)، بی پیوست؛ پیوند درون متن فقط متن است.
 * - `request_id` شناسهٔ فرمی که پیام را فرستاد: دو کلیک، یا فرستادن دوباره پس از پاسخی که نرسید، یک پیام است (`support_messages_request`).
 * - `sms_message_id`: پیامک پاسخ همین پاسخ (سؤال ۳۱۲)، که در همان تراکنش «منتظر» نوشته شد؛ فقط پاسخ پشتیبانی، و نه هر پاسخی: پاسخی که
 *   پیامک پاسخ قبلی‌اش رفته و مشتری هنوز ندیده، پیامک تازه نمی‌گیرد.
 */
export const supportMessages = pgTable(
  'support_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    threadId: bigint('thread_id', { mode: 'number' })
      .notNull()
      .references(() => supportThreads.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'customer' | 'staff' | 'closed'>().notNull(),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id),
    body: text('body'),
    requestId: uuid('request_id').notNull(),
    smsMessageId: bigint('sms_message_id', { mode: 'number' }).references(() => smsMessages.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('support_messages_thread').on(t.threadId, t.id),
    uniqueIndex('support_messages_request').on(t.requestId),
    uniqueIndex('support_messages_sms').on(t.smsMessageId),
    check('support_messages_kind', sql`${t.kind} IN ('customer', 'staff', 'closed')`),
    check('support_messages_author', sql`(${t.kind} = 'customer') = (${t.adminUserId} IS NULL)`),
    check(
      'support_messages_body',
      sql`CASE ${t.kind}
        WHEN 'closed' THEN ${t.body} IS NULL
        ELSE ${t.body} IS NOT NULL AND length(${t.body}) <= (CASE ${t.kind} WHEN 'staff' THEN 2000 ELSE 1000 END)
          AND btrim(${t.body}, E' \\n') <> '' AND ${t.body} = btrim(${t.body}, E' \\n')
      END`,
    ),
    check('support_messages_sms_staff', sql`${t.smsMessageId} IS NULL OR ${t.kind} = 'staff'`),
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
    /**
     * `otp`، `order_paid`، از ۶٫۳ `tracking` (کد رهگیری هر مرسوله، ADR-047)، از ۷٫۶ `partner_order` (سفارش تازهٔ چاپخانه)، و از ۱۲٫۱
     * `support_reply` (پاسخ پشتیبانی، ADR-068).
     */
    purpose: text('purpose').notNull(),
    body: text('body'),
    /**
     * `logged` (کنسولی)، `sent` یا `failed`؛ و فقط برای رهگیری، از برش ۷ پرداخت، از ۷٫۶ چاپخانه و از ۱۲٫۱ پاسخ پشتیبانی `pending` (در همان
     * تراکنش مرسوله، پرداخت، تخصیص یا پاسخ نوشته شد و هنوز فرستاده نشده) و `sending` (فرستنده برداشتش). گذارها با تریگر `sms_messages_guard`
     * (0026، بازنویسی 0028، 0036 و 0058).
     */
    status: text('status').notNull(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    /** پارامترهای قالب پنل پیامک (برش ۷)؛ رهگیری: شمارهٔ سفارش و بارکد؛ پرداخت و چاپخانه: شمارهٔ سفارش و روز تحویل؛ پاسخ پشتیبانی: موضوع. */
    params: jsonb('params'),
    /** شمار تلاش‌های فرستادن پیامک از صف («دوباره بفرست» یکی بالا می‌برد)؛ کد ۰، چون یک بار و بی ردیف منتظر است. */
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
    check('sms_messages_purpose', sql`${t.purpose} IN ('otp', 'order_paid', 'tracking', 'partner_order', 'support_reply')`),
    check('sms_messages_status', sql`${t.status} IN ('logged', 'sent', 'failed', 'pending', 'sending')`),
    check(
      'sms_messages_queued',
      sql`${t.status} NOT IN ('pending', 'sending') OR (${t.purpose} IN ('tracking', 'order_paid', 'partner_order', 'support_reply') AND ${t.body} IS NOT NULL)`,
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
 * کلید سرویس بیرونی که مالک از پنل گذاشته: کلید API پنل پیامک (sms.ir)، شناسهٔ چهار قالب پیامک (کد، از برش ۷ پرداخت و رهگیری، و از
 * ۷٫۶ پیامک چاپخانه)، کد پذیرندهٔ زیبال. مقدار پنل بر همان نام در `.env` مقدم است؛ ردیف نبودن یعنی `.env` («برگرداندن به .env» ردیف را پاک می‌کند).
 *
 * - `sealed` مهروموم AES-256-GCM با `SECRETS_KEY` است (`sealed.ts`)، بسته به نام همین ردیف (AAD `service_secrets:<نام>`):
 *   نشت پایگاه داده یا پشتیبانش بی `.env` کلیدی لو نمی‌دهد، و مقدار یک کلید در ردیف کلید دیگر باز نمی‌شود. CHECK
 *   `service_secrets_sealed` فقط شکل مهروموم را می‌پذیرد، پس مقدار خام اینجا نمی‌نشیند، حتی با کد اشتباه.
 * - نام فقط همین هفت (CHECK `service_secrets_name`؛ دو قالب تازه با 0027، برش ۷، قالب چاپخانه با 0035، ۷٫۶، و قالب پاسخ پشتیبانی با 0057،
 *   ۱۲٫۱): نه `CHECKOUT_MODE`، نه `SMS_PROVIDER` و
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
      sql`${t.name} IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE', 'SMS_PARTNER_TEMPLATE', 'SMS_SUPPORT_TEMPLATE', 'PAYMENT_MERCHANT_ID')`,
    ),
    check('service_secrets_sealed', sql`${t.sealed} ~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{22,}$'`),
  ],
);

/**
 * پیش‌نمایش مسیر خرید (برش ۷٫۵، ADR-052، سؤال‌های ۱۶۷ و ۱۷۰): مالک در «تنظیمات» پیوند یک‌باره‌ای می‌سازد که ۱۵ دقیقه کار می‌کند؛
 * مرورگری که بازش کند (با دکمه و POST، نه GET) کوکی `jy_preview` می‌گیرد و ۲۴ ساعت مسیر خرید را با مخاطب «پیش‌نمایش مالک» می‌بیند. از
 * پیوند و کوکی فقط هش (sha256)، مثل `admin_invites` و `admin_sessions`.
 *
 * - `created_by` بی کلید خارجی، مثل `service_secrets.updated_by`: ادمین پاک‌نشدنی است (`admin_users_no_delete`).
 * - `closed_at`: پیوند تازه‌ای که مالک ساخت پیوند بازنشدهٔ قبلی را می‌بندد، و «خروج از پیش‌نمایش» ردیف بازشده را.
 *
 * محافظ‌ها (شکل هش‌ها، عمر پیوند و کوکی، یک بار باز شدن و بستن، ستون‌های منجمد، پاک‌نشدنی، و یک پیوند باز) در `0034`، دست‌نویس.
 */
export const checkoutPreviews = pgTable('checkout_previews', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  linkExpiresAt: timestamp('link_expires_at', { withTimezone: true }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  cookieHash: text('cookie_hash').unique(),
  cookieExpiresAt: timestamp('cookie_expires_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

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

/* ──────────────────────────── قالب برگه‌ها (برش ۹٫۲) ──────────────────────────── */

/** بیجک یکی برای هر سفارش، روی بسته؛ برگهٔ اول یکی برای هر جزوه، روی دستهٔ همان (ADR-057، سؤال ۱۹۴). */
export const ticketTemplateKind = pgEnum('ticket_template_kind', ['bijak', 'first_page']);

/** بزرگ‌ترین قالب (سؤال ۱۹۳): قالب‌های نمونه با فونت و لوگوی درونی حدود ۲۷۰ کیلوبایت‌اند. */
export const TICKET_TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * قالب‌های HTML برگه‌ها که مالک از پنل بارگذاری می‌کند (برش ۹٫۲، ADR-057). هر بارگذاری نسخهٔ تازهٔ همان نوع است و دیگر عوض و پاک
 * نمی‌شود (`ticket_templates_frozen`، 0041)؛ عوض‌شدنی فقط فعال بودن و نتیجهٔ آخرین پیش‌نمایش است. یک نسخهٔ فعال برای هر نوع، برای
 * همهٔ چاپخانه‌ها؛ بی نسخهٔ فعال، قالب پیش‌فرض کارگر (`services/docworker/docworker/templates/`). برگشت = فعال کردن نسخهٔ قبل یا پیش‌فرض.
 *
 * پیش‌نمایش را کارگر می‌سازد (`preview_ticket_template`، با دادهٔ ساختگی یا یک سفارش واقعی) و نتیجه‌اش همین‌جاست: شمار صفحه، فایل‌ها و
 * نشانی‌های ردشده (فقط `data:` بار می‌شود)، یا خطای قالب با خط. پیش‌نمایش با دادهٔ یک سفارش کنار فایل‌های همان سفارش است و با آنها پاک
 * می‌شود (ADR-044)، چون نام و نشانی گیرنده را دارد.
 */
export const ticketTemplates = pgTable(
  'ticket_templates',
  {
    id: serial('id').primaryKey(),
    kind: ticketTemplateKind('kind').notNull(),
    /** شمارهٔ نسخه در همان نوع، از ۱. */
    version: integer('version').notNull(),
    html: text('html').notNull(),
    sha256: text('sha256').notNull(),
    /** نام فایلی که مالک بارگذاری کرد، فقط برای نمایش. */
    fileName: text('file_name').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(false),
    /** اولین فعال شدن؛ یک بار نوشته می‌شود. */
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    previewAt: timestamp('preview_at', { withTimezone: true }),
    /** سفارشی که پیش‌نمایش با دادهٔ آن ساخته شد؛ null یعنی دادهٔ ساختگی. */
    previewOrderNumber: integer('preview_order_number'),
    previewPages: integer('preview_pages'),
    /** PDF پیش‌نمایش و PNG صفحهٔ اولش؛ صفحهٔ n ام کنارش (`-n.png`)، مثل برگهٔ سفارش. */
    previewPdfKey: text('preview_pdf_key'),
    previewPngKey: text('preview_png_key'),
    previewBlocked: text('preview_blocked').array().notNull().default(sql`'{}'::text[]`),
    previewError: text('preview_error'),
  },
  (t) => [
    uniqueIndex('ticket_templates_version').on(t.kind, t.version),
    /** یک نسخهٔ فعال برای هر نوع. */
    uniqueIndex('ticket_templates_one_active').on(t.kind).where(sql`${t.isActive}`),
    check('ticket_templates_size', sql`octet_length(${t.html}) BETWEEN 1 AND ${sql.raw(String(TICKET_TEMPLATE_MAX_BYTES))}`),
    check('ticket_templates_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check('ticket_templates_version_positive', sql`${t.version} >= 1`),
    check('ticket_templates_file_name', sql`length(${t.fileName}) BETWEEN 1 AND 200`),
    /** فعال یعنی دست‌کم یک بار فعال شده. */
    check('ticket_templates_activated', sql`NOT ${t.isActive} OR ${t.activatedAt} IS NOT NULL`),
    /** پیش‌نمایش یا صفحه دارد یا خطا، هرگز هر دو؛ و هیچ‌کدام بی زمان پیش‌نمایش. */
    check(
      'ticket_templates_preview',
      sql`(${t.previewAt} IS NULL AND ${t.previewPages} IS NULL AND ${t.previewError} IS NULL)
          OR (${t.previewAt} IS NOT NULL AND (${t.previewPages} IS NULL) <> (${t.previewError} IS NULL))`,
    ),
    /** فایل‌های پیش‌نمایش با صفحه‌هایش، نه بی آن. */
    check(
      'ticket_templates_preview_files',
      sql`(${t.previewPages} IS NULL) = (${t.previewPdfKey} IS NULL) AND (${t.previewPages} IS NULL) = (${t.previewPngKey} IS NULL)
          AND (${t.previewPages} IS NULL OR ${t.previewPages} >= 1)`,
    ),
  ],
);

/* ──────────────────────────── خروجی گزارش‌ها (برش ۱۰٫۲) ──────────────────────────── */

/** بیشترین PDF یک خروجی گزارش؛ گزارشی با فهرست ۳۰۰ سفارش (سقف فهرست PDF) چند صد کیلوبایت است. */
export const REPORT_EXPORT_MAX_BYTES = 16 * 1024 * 1024;
/** بیشترین صفحهٔ PDF یک خروجی، همان سقف برگه‌ها (`MAX_TICKET_PAGES` کارگر). */
export const REPORT_EXPORT_MAX_PAGES = 200;

/**
 * خروجی PDF یک گزارش (برش ۱۰٫۲، ADR-061، سؤال ۲۰۲): پنل گزارش را همان‌طور که در لحظهٔ درخواست ساخت (متن‌ها و عددها، `context`) با
 * کار `render_report` به کارگر می‌دهد، و کارگر با همان موتور قالب برگه‌ها (۹٫۲، در قفس) PDF را می‌سازد و همین‌جا می‌نشاند. خروجی اکسل
 * همان لحظه در خود پنل ساخته می‌شود و ردیفی ندارد.
 *
 * فقط کسی که خواست دانلودش می‌کند. کارگر ردیف‌ها را یک روز پس از درخواست پاک می‌کند (`retention.py`): PDF مبلغ دارد و دوباره
 * ساختنش یک کلیک است. گزارش در خود ردیف منجمد است و نتیجه یک بار نوشته می‌شود (تریگر `report_exports_guard`، 0046).
 */
export const reportExports = pgTable(
  'report_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `production` (گزارش تولید، ۱۰٫۲)، `shipping` (گزارش ارسال، ۶٫۴) یا `settlement` (صورت‌حساب تسویهٔ یک چاپخانه، ۱۰٫۳). */
    report: text('report').notNull(),
    /** دادهٔ قالب PDF: عنوان، بازه، کاشی‌ها و جدول‌ها، همه متن آماده (`apps/admin/lib/reportDocument.ts`). */
    context: jsonb('context').notNull(),
    /** نام فایل دانلود، ASCII: `gozaresh-tolid-1405-07-24.pdf`. */
    fileName: text('file_name').notNull(),
    /**
     * دسترسی‌ای که گزارش با آن ساخته شد، تا دانلود همان را دوباره بخواهد (مجوز با هر درخواست، ADR-038): گزارش مبلغ دارد (`orders.money`
     * خواهنده)، و محدودهٔ خواهنده (چاپخانهٔ کاربر چاپخانه؛ null یعنی همهٔ سفارش‌ها).
     */
    money: boolean('money').notNull(),
    printPartnerId: uuid('print_partner_id').references(() => printPartners.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => adminUsers.id),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    pdf: bytea('pdf'),
    pages: integer('pages'),
    sha256: text('sha256'),
    /** ساخته نشد: کد و پیام کوتاه، برای صفحهٔ خروجی. */
    error: text('error'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('report_exports_requested').on(t.requestedAt),
    check('report_exports_report', sql`${t.report} IN ('production', 'shipping', 'settlement')`),
    check('report_exports_file_name', sql`${t.fileName} ~ '^[a-z0-9][a-z0-9-]{0,118}[.]pdf$'`),
    check('report_exports_context', sql`jsonb_typeof(${t.context}) = 'object' AND octet_length(${t.context}::text) <= 4194304`),
    /**
     * در حال ساختن (هیچ)، ساخته (PDF با صفحه و هش)، یا ساخته نشد (خطا)؛ هرگز دو تا، و پایان با زمانش. هر شاخه `IS NOT NULL` صریح دارد:
     * CHECKی که NULL شود پذیرفته است، و `octet_length(NULL)` همان NULL است.
     */
    check(
      'report_exports_result',
      sql`(${t.finishedAt} IS NULL AND ${t.pdf} IS NULL AND ${t.pages} IS NULL AND ${t.sha256} IS NULL AND ${t.error} IS NULL)
          OR (${t.finishedAt} IS NOT NULL AND ${t.error} IS NULL AND ${t.pdf} IS NOT NULL AND ${t.pages} IS NOT NULL AND ${t.sha256} IS NOT NULL
              AND octet_length(${t.pdf}) BETWEEN 1 AND ${sql.raw(String(REPORT_EXPORT_MAX_BYTES))}
              AND ${t.pages} BETWEEN 1 AND ${sql.raw(String(REPORT_EXPORT_MAX_PAGES))} AND ${t.sha256} ~ '^[0-9a-f]{64}$')
          OR (${t.finishedAt} IS NOT NULL AND ${t.error} IS NOT NULL AND ${t.pdf} IS NULL AND ${t.pages} IS NULL AND ${t.sha256} IS NULL
              AND length(btrim(${t.error})) BETWEEN 1 AND 500)`,
    ),
  ],
);

/* ──────────────────────────── تسویهٔ چاپخانه‌ها (برش ۱۰٫۳، ADR-069) ──────────────────────────── */

/**
 * دفتر تسویهٔ هر چاپخانه (برش ۱۰٫۳، ADR-069؛ سؤال‌های ۲۰۳ و ۳۹۶): پرداخت به چاپخانه، و اصلاح به سود یا زیان آن (هزینهٔ پست، لغو پس از شروع
 * چاپ، خسارت). بدهی خود سفارش‌ها از سهم منجمد هر تخصیص است (`order_assignments.share_rials`)، نه ردیف این جدول؛ مانده = سهم سفارش‌های
 * «تحویل پست شد» + اصلاح‌ها − پرداخت‌ها. مالک و حسابدار می‌نویسند، با کد تازه؛ هر فرم یک ردیف (`request_id`). فقط افزودنی: اشتباه با «باطل
 * کردن» یک‌باره و دلیل، نه پاک کردن (`partner_ledger_guard`، 0060).
 */
export const partnerLedger = pgTable(
  'partner_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    printPartnerId: uuid('print_partner_id')
      .notNull()
      .references(() => printPartners.id),
    /** `payment` (پرداخت به چاپخانه) یا `adjustment` (اصلاح). */
    kind: text('kind').notNull(),
    /** ریال؛ پرداخت مثبت؛ اصلاح غیرصفر: مثبت به سود چاپخانه (بدهی ما بیشتر)، منفی به زیانش. */
    amountRials: bigint('amount_rials', { mode: 'number' }).notNull(),
    /** روز پرداخت یا اصلاح: آغاز همان روز به وقت تهران. */
    day: timestamp('day', { withTimezone: true }).notNull(),
    /** «بابت» پرداخت (سؤال ۳۹۶): آغاز اولین روز و آغاز روز پس از آخرین (پایان انحصاری)، نیمه‌شب تهران؛ هر دو یا هیچ. */
    periodFrom: timestamp('period_from', { withTimezone: true }),
    periodUntil: timestamp('period_until', { withTimezone: true }),
    /** کد پیگیری بانک، فقط پرداخت. */
    tracking: text('tracking'),
    /** یادداشت پرداخت (اختیاری) یا دلیل اصلاح (لازم)، ۱ تا ۳۰۰ نویسه. */
    note: text('note'),
    /** سفارشی که اصلاح برای آن است (اختیاری، فقط اصلاح)؛ سفارشی که روزی به همین چاپخانه سپرده شد. */
    orderId: uuid('order_id').references(() => orders.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** شناسهٔ فرم: دو کلیک یک ردیف، همان فرم با چیز دیگر «فرم کهنه». */
    requestId: uuid('request_id').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => adminUsers.id),
    voidReason: text('void_reason'),
  },
  (t) => [
    index('partner_ledger_partner').on(t.printPartnerId, t.day),
    uniqueIndex('partner_ledger_request').on(t.requestId),
    check('partner_ledger_kind', sql`${t.kind} IN ('payment', 'adjustment')`),
    /** پرداخت مثبت با بابت و کد پیگیری اختیاری؛ اصلاح غیرصفر با دلیل لازم، بی بابت و کد پیگیری. سقف هر ردیف ۱۰۰ میلیارد ریال. */
    check(
      'partner_ledger_shape',
      sql`abs(${t.amountRials}) <= 100000000000 AND ${t.amountRials} % 10 = 0
       AND ((${t.kind} = 'payment' AND ${t.amountRials} > 0 AND ${t.orderId} IS NULL)
         OR (${t.kind} = 'adjustment' AND ${t.amountRials} <> 0 AND ${t.note} IS NOT NULL
             AND ${t.periodFrom} IS NULL AND ${t.tracking} IS NULL))`,
    ),
    check(
      'partner_ledger_period',
      sql`(${t.periodFrom} IS NULL) = (${t.periodUntil} IS NULL)
       AND (${t.periodFrom} IS NULL OR (${t.periodFrom} < ${t.periodUntil} AND ${t.periodUntil} <= ${t.periodFrom} + interval '400 days'))`,
    ),
    check(
      'partner_ledger_texts',
      sql`(${t.tracking} IS NULL OR (length(${t.tracking}) BETWEEN 1 AND 40 AND ${t.tracking} = btrim(${t.tracking})))
       AND (${t.note} IS NULL OR (length(${t.note}) BETWEEN 1 AND 300 AND ${t.note} = btrim(${t.note})))`,
    ),
    /** باطل: هر سه با هم، با دلیل ۱ تا ۳۰۰ نویسه. */
    check(
      'partner_ledger_void',
      sql`(${t.voidedAt} IS NULL) = (${t.voidedBy} IS NULL) AND (${t.voidedAt} IS NULL) = (${t.voidReason} IS NULL)
       AND (${t.voidReason} IS NULL OR (length(${t.voidReason}) BETWEEN 1 AND 300 AND ${t.voidReason} = btrim(${t.voidReason})))`,
    ),
  ],
);

/* ──────────────────────────── موجودی کاغذ (برش ۱۰٫۴، ADR-070) ──────────────────────────── */

/** بزرگ‌ترین شمار برگ یک ردیف موجودی، شمارش یا آستانه: ده میلیون برگ (بیست هزار بند). */
export const PAPER_STOCK_MAX_SHEETS = 10_000_000;
/** بزرگ‌ترین تغییر یک ردیف: چاپ یک سفارش بزرگ (۳۰ جزوه × ۱٬۰۰۰ نسخه × ۱٬۵۰۰ برگ) هم جا می‌شود. */
export const PAPER_STOCK_MAX_DELTA = 100_000_000;

/**
 * یک قلم موجودی (برش ۱۰٫۴، ADR-070؛ سؤال ۲۰۴، پاسخ «همهٔ چاپخانه‌ها»): یک کاغذ تعرفه در یک اندازه، در یک چاپخانه، به **برگ**. قلم فقط
 * وقتی هست که کسی پیگیری‌اش را با شمارش اول شروع کند؛ «شروع چاپ» فقط از قلمی کم می‌کند که هست. کاغذ با شناسهٔ پایدار تعرفه
 * (`paper_types.id`) است، بی کلید خارجی: جدول کاغذ نسخه‌دار است و شناسه از نسخه‌ای به نسخهٔ بعد می‌ماند. موجودی جمع `delta_sheets`
 * ردیف‌های `paper_stock_moves` است، نه ستونی که عوض شود. پاک نمی‌شود و جز آستانه عوض نمی‌شود (`paper_stock_items_guard`، 0062).
 */
export const paperStockItems = pgTable(
  'paper_stock_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    printPartnerId: uuid('print_partner_id')
      .notNull()
      .references(() => printPartners.id),
    paperTypeId: text('paper_type_id').notNull(),
    paperSize: paperSize('paper_size').notNull(),
    /** آستانهٔ هشدار پیشخوان، برگ؛ null یعنی بی آستانه. */
    thresholdSheets: integer('threshold_sheets'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('paper_stock_items_key').on(t.printPartnerId, t.paperTypeId, t.paperSize),
    /** همان شکل شناسهٔ کاغذ ویرایشگر تعرفه (`OPTION_ID` پنل). */
    check('paper_stock_items_paper', sql`${t.paperTypeId} ~ '^[a-z][a-z0-9_]{1,39}$'`),
    check(
      'paper_stock_items_threshold',
      sql`${t.thresholdSheets} IS NULL OR ${t.thresholdSheets} BETWEEN 0 AND ${sql.raw(String(PAPER_STOCK_MAX_SHEETS))}`,
    ),
  ],
);

/**
 * ردیف‌های موجودی هر قلم (برش ۱۰٫۴، ADR-070)، فقط افزودنی: `purchase` ورود (مثبت)، `waste` ضایعات (منفی، با دلیل)، `count` شمارش (موجودی
 * واقعی؛ تغییر را خود پایگاه داده از موجودی همان لحظه می‌نشاند)، و دو ردیف خودکار که فقط تریگر وضعیت سفارش می‌نویسد: `print` با «شروع
 * چاپ» (منفی، برگ × نسخهٔ جزوه‌های همان کاغذ و اندازه) و `unprint` با برگرداندن «در حال چاپ» به «در صف چاپ» (همان برگ‌ها، یک بار برای هر
 * ردیف چاپ). هر فرم یک ردیف (`request_id`). محافظ‌ها در 0062: `paper_stock_moves_guard` و `orders_paper_stock`.
 */
export const paperStockMoves = pgTable(
  'paper_stock_moves',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => paperStockItems.id),
    kind: text('kind').notNull(),
    /** تغییر موجودی، برگ. */
    deltaSheets: integer('delta_sheets').notNull(),
    /** فقط شمارش: موجودی شمرده‌شده. */
    countedSheets: integer('counted_sheets'),
    /** چاپ و برگشت: سفارشی که برگ‌ها برایش بود. */
    orderId: uuid('order_id').references(() => orders.id),
    /** برگشت: ردیف چاپی که برمی‌گرداند. */
    undoes: bigint('undoes', { mode: 'number' }),
    /** یادداشت ورود (اختیاری) یا دلیل ضایعات و شمارش (لازم)، ۱ تا ۳۰۰ نویسه. */
    note: text('note'),
    /** ادمین ردیف دستی؛ ردیف خودکار هیچ. */
    createdBy: uuid('created_by').references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** شناسهٔ فرم ردیف دستی: دو کلیک یک ردیف، همان فرم با چیز دیگر «فرم کهنه». */
    requestId: uuid('request_id'),
  },
  (t) => [
    index('paper_stock_moves_item').on(t.itemId, t.id),
    index('paper_stock_moves_order').on(t.orderId),
    uniqueIndex('paper_stock_moves_request').on(t.requestId),
    uniqueIndex('paper_stock_moves_undoes').on(t.undoes),
    foreignKey({ columns: [t.undoes], foreignColumns: [t.id], name: 'paper_stock_moves_undoes_fk' }),
    check('paper_stock_moves_kind', sql`${t.kind} IN ('purchase', 'waste', 'count', 'print', 'unprint')`),
    /**
     * هر نوع شکل خودش را دارد: دستی‌ها با ادمین و شناسهٔ فرم و بی سفارش؛ ضایعات و شمارش با دلیل؛ خودکارها با سفارش و بی ادمین، فرم و
     * یادداشت؛ برگشت با ردیف چاپی که برمی‌گرداند.
     */
    check(
      'paper_stock_moves_shape',
      sql`abs(${t.deltaSheets}) <= ${sql.raw(String(PAPER_STOCK_MAX_DELTA))}
       AND ((${t.kind} IN ('purchase', 'waste', 'count') AND ${t.createdBy} IS NOT NULL AND ${t.requestId} IS NOT NULL
             AND ${t.orderId} IS NULL AND ${t.undoes} IS NULL
             AND ((${t.kind} = 'purchase' AND ${t.deltaSheets} > 0 AND ${t.countedSheets} IS NULL)
               OR (${t.kind} = 'waste' AND ${t.deltaSheets} < 0 AND ${t.countedSheets} IS NULL AND ${t.note} IS NOT NULL)
               OR (${t.kind} = 'count' AND ${t.countedSheets} BETWEEN 0 AND ${sql.raw(String(PAPER_STOCK_MAX_SHEETS))}
                   AND ${t.note} IS NOT NULL)))
         OR (${t.kind} IN ('print', 'unprint') AND ${t.orderId} IS NOT NULL AND ${t.createdBy} IS NULL AND ${t.requestId} IS NULL
             AND ${t.note} IS NULL AND ${t.countedSheets} IS NULL
             AND ((${t.kind} = 'print' AND ${t.deltaSheets} < 0 AND ${t.undoes} IS NULL)
               OR (${t.kind} = 'unprint' AND ${t.deltaSheets} > 0 AND ${t.undoes} IS NOT NULL))))`,
    ),
    check(
      'paper_stock_moves_note',
      sql`${t.note} IS NULL OR (length(${t.note}) BETWEEN 1 AND 300 AND ${t.note} = btrim(${t.note}))`,
    ),
  ],
);

/* ──────────────────────────── متن‌های سایت (برش ۱۱٫۱) ──────────────────────────── */

/** شش متنی که مالک از پنل عوض می‌کند (ADR-065، سؤال ۲۸۳)؛ همان `CONTENT_KINDS` در `@jozveyar/content`. */
export const siteContentKind = pgEnum('site_content_kind', ['home', 'faq', 'terms', 'privacy', 'about', 'contact']);

/** بزرگ‌ترین JSON یک متن؛ متن صفحه تا ۲۰٬۰۰۰ نویسه است (`fieldsOf`)، یعنی حدود ۴۰ کیلوبایت. */
export const SITE_CONTENT_MAX_BYTES = 128 * 1024;

/**
 * نسخه‌های منتشرشدهٔ متن‌های سایت (برش ۱۱٫۱، ADR-065، سؤال ۲۸۸): هر انتشار یک ردیف، و آخرین نسخهٔ هر نوع همان است که سایت نشان می‌دهد.
 * `content` خالی یعنی «متن پیش‌فرض» (برگشت به آن)، که با به‌روزرسانی سایت به‌روز می‌شود. «برگرداندن» نسخه‌ای تازه با همان متن است
 * (`restored_from`). هیچ نسخه‌ای عوض یا پاک نمی‌شود، و شماره‌ها در هر نوع پشت‌سرهم‌اند (تریگر `site_content_versions_guard`، 0054).
 */
export const siteContentVersions = pgTable(
  'site_content_versions',
  {
    id: serial('id').primaryKey(),
    kind: siteContentKind('kind').notNull(),
    /** شمارهٔ نسخه در همان نوع، از ۱ و پشت‌سرهم (`site_content_versions_sequence`، 0054). */
    version: integer('version').notNull(),
    /** متن (`ContentByKind` در `@jozveyar/content`)؛ null یعنی برگشت به متن پیش‌فرض. */
    content: jsonb('content'),
    /** نسخه‌ای که «برگرداندن» از آن آمد؛ ۰ یعنی متن پیش‌فرض، null یعنی انتشار پیش‌نویس. */
    restoredFrom: integer('restored_from'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('site_content_versions_version').on(t.kind, t.version),
    check(
      'site_content_versions_content',
      sql`${t.content} IS NULL OR (jsonb_typeof(${t.content}) = 'object' AND octet_length(${t.content}::text) <= ${sql.raw(String(SITE_CONTENT_MAX_BYTES))})`,
    ),
    /** شمارهٔ نسخه یا ۰؛ اینکه نسخهٔ پیش‌تری از همان نوع با همان متن است را تریگر می‌سنجد (`site_content_versions_restored_same`). */
    check('site_content_versions_restored', sql`${t.restoredFrom} IS NULL OR ${t.restoredFrom} >= 0`),
    /** متن خالی فقط و فقط برگشت به متن پیش‌فرض؛ `IS NOT DISTINCT FROM`، چون CHECKی که NULL شود پذیرفته است. */
    check('site_content_versions_default', sql`(${t.content} IS NULL) = (${t.restoredFrom} IS NOT DISTINCT FROM 0)`),
  ],
);

/**
 * پیش‌نویس هر متن (سؤال ۲۸۶): یکی برای هر نوع، تا انتشار یا «دور انداختن»؛ روی سایت نیست و هر چه بخواهد عوض می‌شود. «ذخیره و پیش‌نمایش»
 * با خطا هم ذخیره می‌کند؛ انتشار فقط بی خطاست (سرویس پنل). `base_version` نسخهٔ روی سایت هنگام ساختن پیش‌نویس است، تا صفحهٔ انتشار
 * بگوید اگر نسخهٔ دیگری پس از آن منتشر شده.
 */
export const siteContentDrafts = pgTable(
  'site_content_drafts',
  {
    kind: siteContentKind('kind').primaryKey(),
    content: jsonb('content').notNull(),
    /** نسخهٔ روی سایت هنگام ساختن؛ ۰ یعنی متن پیش‌فرض بی هیچ نسخه. */
    baseVersion: integer('base_version').notNull(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'site_content_drafts_content',
      sql`jsonb_typeof(${t.content}) = 'object' AND octet_length(${t.content}::text) <= ${sql.raw(String(SITE_CONTENT_MAX_BYTES))}`,
    ),
    check('site_content_drafts_times', sql`${t.updatedAt} >= ${t.createdAt}`),
  ],
);

/* ──────────────────────────── صفحه‌های فرود و «تعرفه» (برش ۱۵٫۲) ──────────────────────────── */

/** نوع صفحه (ADR-071): صفحهٔ فرود با نشانی خودش، یا «تعرفه» با نشانی ثابت `/tarefe` (یکی). */
export const sitePageKind = pgEnum('site_page_kind', ['landing', 'tariff']);

/** برداشتن صفحهٔ فرود از سایت (سؤال ۴۶۶): «پیدا نشد» (۴۰۴) یا «به صفحهٔ دیگری» (۳۰۱). */
export const sitePageRemoval = pgEnum('site_page_removal', ['gone', 'moved']);

/** بزرگ‌ترین JSON یک صفحه؛ متن صفحه تا ۲۰٬۰۰۰ نویسه و ده سؤال است، یعنی زیر ۶۰ کیلوبایت. */
export const SITE_PAGE_MAX_BYTES = 128 * 1024;

/** شکل نشانی صفحه، همان `SLUG_PATTERN` در `@jozveyar/content`. */
const SLUG_SHAPE = sql.raw(`'^[a-z0-9]+(-[a-z0-9]+)*$'`);

/**
 * نام‌های رزرو نشانی صفحه‌های فرود، همان `RESERVED_SLUGS` در `@jozveyar/content` (سؤال ۴۳۱): مسیرهای امروز سایت، فایل‌های ریشه، مسیرهای
 * برش ۱۵، و `chap-jozve`. تست یکپارچگی برابری دو فهرست را می‌سنجد.
 */
export const RESERVED_PAGE_SLUGS = [
  'about',
  'admin',
  'api',
  'apple-icon',
  'articles',
  'chap-jozve',
  'contact',
  'favicon',
  'fonts',
  'icon',
  'icons',
  'img',
  'manifest',
  'media',
  'opengraph-image',
  'order',
  'orders',
  'pay',
  'preview',
  'privacy',
  'robots',
  'sitemap',
  'tarefe',
  'terms',
] as const;

/**
 * هر صفحهٔ فرود، و «تعرفه» (برش ۱۵٫۲، ADR-071): فقط هویت؛ نشانی، متن و حال روی سایت در نسخه‌ها و پیش‌نویس است. صفحه‌ای که هرگز نسخه‌ای
 * نداشت با دور انداختن پیش‌نویسش پاک می‌شود، و صفحه‌ای که نسخه دارد هرگز (`site_pages_guard`، 0064). «تعرفه» یکی است و با اولین ذخیره ساخته
 * می‌شود؛ تا آن روز متن پیش‌فرض کد روی سایت است.
 */
export const sitePages = pgTable(
  'site_pages',
  {
    id: serial('id').primaryKey(),
    kind: sitePageKind('kind').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('site_pages_one_tariff').on(t.kind).where(sql`${t.kind} = 'tariff'`)],
);

/**
 * نشانی‌هایی که هر صفحهٔ فرود یک بار روی سایت داشت (سؤال ۴۳۱): نشانی‌ای که یک بار مال صفحه‌ای شد برای همیشه مال همان است، تا نشانی قبلی
 * با ۳۰۱ به نشانی امروز همان صفحه برود و هرگز صفحهٔ دیگری نشود. با انتشار نسخه نوشته می‌شود و عوض و پاک نمی‌شود (`site_page_slugs_guard`).
 */
export const sitePageSlugs = pgTable(
  'site_page_slugs',
  {
    slug: text('slug').primaryKey(),
    pageId: integer('page_id')
      .notNull()
      .references(() => sitePages.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('site_page_slugs_page').on(t.pageId),
    check('site_page_slugs_shape', sql`${t.slug} ~ ${SLUG_SHAPE} AND length(${t.slug}) BETWEEN 2 AND 60`),
    check('site_page_slugs_reserved', sql`${t.slug} NOT IN (${sql.raw(RESERVED_PAGE_SLUGS.map((slug) => `'${slug}'`).join(', '))})`),
  ],
);

/**
 * نسخه‌های هر صفحه (سؤال‌های ۴۳۷ و ۴۶۵ و ۴۶۶): هر انتشار، برگرداندن، و برداشتن یک ردیف، پشت‌سرهم در هر صفحه. صفحه از `live_from` روی سایت
 * است (زمان‌دار یعنی آینده)، و حال امروزش آخرین نسخه‌ای است که `live_from`ش رسیده و پس گرفته نشده. `content` خالی یعنی برداشتن (`removal`)
 * در صفحهٔ فرود، و برگشت به متن پیش‌فرض در «تعرفه» (`restored_from` = ۰). هیچ نسخه‌ای پاک نمی‌شود و تنها تغییر «پس گرفتن» زمان‌دار است، یک
 * بار و فقط پیش از رسیدنش (`site_page_versions_guard`، 0064).
 */
export const sitePageVersions = pgTable(
  'site_page_versions',
  {
    id: serial('id').primaryKey(),
    pageId: integer('page_id')
      .notNull()
      .references(() => sitePages.id),
    /** شمارهٔ نسخه در همان صفحه، از ۱ و پشت‌سرهم. */
    version: integer('version').notNull(),
    /**
     * نشانی صفحه در این نسخه، بی «/»؛ «تعرفه» همیشه `tarefe` (`site_page_versions_tariff`)، و صفحهٔ فرود فقط نشانی‌ای که همین صفحه گرفته
     * (`site_page_versions_slug_claim`، با شکل و نام‌های رزرو `site_page_slugs`). برداشتن، نشانی‌ای که برداشته شد.
     */
    slug: text('slug').notNull(),
    /** متن (`LandingContent` یا `TariffPageContent`)؛ null یعنی برداشتن، یا متن پیش‌فرض «تعرفه». */
    content: jsonb('content'),
    /** نسخه‌ای که «برگرداندن» از آن آمد؛ ۰ متن پیش‌فرض «تعرفه»، null انتشار پیش‌نویس یا برداشتن. */
    restoredFrom: integer('restored_from'),
    removal: sitePageRemoval('removal'),
    /** مقصد ۳۰۱ برداشتن؛ null با `moved` یعنی صفحهٔ اصلی. */
    movedTo: integer('moved_to').references(() => sitePages.id),
    /** روی سایت از این زمان؛ همان `created_at` یعنی «همین حالا». */
    liveFrom: timestamp('live_from', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnBy: uuid('withdrawn_by').references(() => adminUsers.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('site_page_versions_version').on(t.pageId, t.version),
    index('site_page_versions_slug').on(t.slug),
    check('site_page_versions_number', sql`${t.version} >= 1`),
    check(
      'site_page_versions_content',
      sql`${t.content} IS NULL OR (jsonb_typeof(${t.content}) = 'object' AND octet_length(${t.content}::text) <= ${sql.raw(String(SITE_PAGE_MAX_BYTES))})`,
    ),
    /** متن خالی فقط برداشتن یا متن پیش‌فرض؛ برداشتن بی متن و بی برگرداندن، و مقصد فقط با «به صفحهٔ دیگری» و نه خود صفحه. */
    check(
      'site_page_versions_shape',
      sql`(${t.restoredFrom} IS NULL OR ${t.restoredFrom} >= 0)
          AND (${t.content} IS NOT NULL OR ${t.removal} IS NOT NULL OR ${t.restoredFrom} IS NOT DISTINCT FROM 0)
          AND (${t.removal} IS NULL OR (${t.content} IS NULL AND ${t.restoredFrom} IS NULL))
          AND (${t.restoredFrom} IS DISTINCT FROM 0 OR ${t.content} IS NULL)
          AND (${t.movedTo} IS NULL OR (${t.removal} = 'moved' AND ${t.movedTo} <> ${t.pageId}))`,
    ),
    /** روی سایت نه پیش از ساختن؛ «پس گرفتن» با کسی که گرفت، و فقط پیش از رسیدن. */
    check(
      'site_page_versions_times',
      sql`${t.liveFrom} >= ${t.createdAt}
          AND (${t.withdrawnAt} IS NULL) = (${t.withdrawnBy} IS NULL)
          AND (${t.withdrawnAt} IS NULL OR (${t.withdrawnAt} >= ${t.createdAt} AND ${t.withdrawnAt} < ${t.liveFrom}))`,
    ),
  ],
);

/**
 * پیش‌نویس هر صفحه (سؤال ۴۶۲): یکی برای هر صفحه، تا انتشار یا «دور انداختن»؛ روی سایت نیست و با خطا هم ذخیره می‌شود (نشانی رزرو هم). انتشار
 * فقط بی خطاست (سرویس پنل). `base_version` آخرین نسخهٔ صفحه هنگام ساختن پیش‌نویس است.
 */
export const sitePageDrafts = pgTable(
  'site_page_drafts',
  {
    pageId: integer('page_id')
      .primaryKey()
      .references(() => sitePages.id, { onDelete: 'cascade' }),
    content: jsonb('content').notNull(),
    baseVersion: integer('base_version').notNull(),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'site_page_drafts_content',
      sql`jsonb_typeof(${t.content}) = 'object' AND octet_length(${t.content}::text) <= ${sql.raw(String(SITE_PAGE_MAX_BYTES))}`,
    ),
    check('site_page_drafts_times', sql`${t.updatedAt} >= ${t.createdAt}`),
  ],
);

/* ──────────────────────────── تصویرهای سایت (برش ۱۱٫۲) ──────────────────────────── */

/** نوع تصویر سایت (برش ۱۱٫۲، ADR-067): لوگو (با نشان اختیاری برای آیکون‌ها) و بنر صفحهٔ اصلی (با تصویر گوشی اختیاری). */
export const siteImageKind = pgEnum('site_image_kind', ['logo', 'banner']);

/** بیشترین فایلی که بارگذاری می‌شود (لوگو، نشان، و هر تصویر بنر). */
export const SITE_IMAGE_MAX_BYTES = 1024 * 1024;
/** بیشترین فایلی که کارگر می‌سازد؛ PNG دسکتاپ بنر در ۲۱۶۰ پیکسل هم زیر این است. */
export const SITE_IMAGE_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** فایل‌هایی که کارگر از هر نوع می‌سازد (`services/docworker/docworker/site_images.py`)؛ `mobile` فقط وقتی تصویر گوشی بارگذاری شد. */
export const SITE_IMAGE_FILES = {
  logo: ['logo', 'favicon', 'apple', 'icon192', 'icon512', 'og'],
  banner: ['desktop', 'mobile'],
} as const;
export type SiteImageFileName = (typeof SITE_IMAGE_FILES)[keyof typeof SITE_IMAGE_FILES][number];

/**
 * هر بارگذاری لوگو یا بنر (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶): فایل‌هایی که مالک یا متصدی داد، و نتیجهٔ کار کارگر (`build_site_image`). سایت هرگز
 * همین فایل‌ها را نمی‌دهد؛ فقط آنچه کارگر با Pillow از نو ساخت (`site_image_files`). کدام لوگو و بنر روی سایت است در تنظیم‌های `content.logo`
 * و `content.banner` است.
 *
 * فایل‌ها و سازنده عوض نمی‌شوند، نتیجهٔ کارگر یک بار نوشته می‌شود و `published_at` هم؛ بارگذاری‌ای که روی سایت رفت پاک نمی‌شود، و بقیه را
 * کارگر پس از چند روز پاک می‌کند (تریگرهای `site_images_guard` و `site_image_files_guard`، 0056).
 */
export const siteImages = pgTable(
  'site_images',
  {
    id: serial('id').primaryKey(),
    kind: siteImageKind('kind').notNull(),
    /** شمارهٔ بارگذاری در همان نوع، از ۱. */
    version: integer('version').notNull(),
    /** لوگو، یا تصویر دسکتاپ بنر. */
    main: bytea('main').notNull(),
    /** نام فایلی که بارگذاری شد، فقط برای نمایش. */
    mainName: text('main_name').notNull(),
    /** نشان لوگو (برای آیکون‌ها) یا تصویر گوشی بنر؛ اختیاری. */
    extra: bytea('extra'),
    extraName: text('extra_name'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => adminUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** کار کارگر تمام شد: فایل‌ها، یا خطا. */
    builtAt: timestamp('built_at', { withTimezone: true }),
    /** ساخته نشد: کد و پیام کوتاه، برای صفحهٔ همین بارگذاری. */
    error: text('error'),
    /** اولین بار که روی سایت رفت. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('site_images_version').on(t.kind, t.version),
    check('site_images_version_positive', sql`${t.version} >= 1`),
    check(
      'site_images_main',
      sql`octet_length(${t.main}) BETWEEN 1 AND ${sql.raw(String(SITE_IMAGE_MAX_BYTES))} AND length(${t.mainName}) BETWEEN 1 AND 200`,
    ),
    /** فایل دوم با نامش، یا هیچ‌کدام. */
    check(
      'site_images_extra',
      sql`(${t.extra} IS NULL AND ${t.extraName} IS NULL)
          OR (${t.extra} IS NOT NULL AND ${t.extraName} IS NOT NULL
              AND octet_length(${t.extra}) BETWEEN 1 AND ${sql.raw(String(SITE_IMAGE_MAX_BYTES))} AND length(${t.extraName}) BETWEEN 1 AND 200)`,
    ),
    /** خطا فقط با پایان کار، و کوتاه. */
    check('site_images_error', sql`${t.error} IS NULL OR (${t.builtAt} IS NOT NULL AND length(btrim(${t.error})) BETWEEN 1 AND 500)`),
    /** روی سایت فقط بارگذاری‌ای که ساخته شد و خطا ندارد. */
    check('site_images_published', sql`${t.publishedAt} IS NULL OR (${t.builtAt} IS NOT NULL AND ${t.error} IS NULL)`),
  ],
);

/**
 * فایل‌هایی که کارگر از هر بارگذاری ساخت (برش ۱۱٫۲): لوگو در ۱۲۸ پیکسل ارتفاع، favicon، آیکون گوشی و manifest، و تصویر اشتراک؛ یا تصویرهای بنر.
 * سایت فقط فایل بارگذاری‌ای را که روی سایت رفته با نام sha256 خودش می‌دهد (`/media/<sha256>.<پسوند>`)، و پنل پیش‌نمایش همه را از راه خودش.
 * فقط در تراکنشی نوشته می‌شوند که کار کارگر را تمام می‌کند، و عوض نمی‌شوند (`site_image_files_guard`، 0056).
 */
export const siteImageFiles = pgTable(
  'site_image_files',
  {
    imageId: integer('image_id')
      .notNull()
      .references(() => siteImages.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    bytes: bytea('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** sha256 خود بایت‌ها، نام فایل روی سایت. */
    sha256: text('sha256').notNull(),
    /** پیکسل نیمه‌شفاف یا شفاف دارد: پیش‌نمایش لوگوی بی شفافیت را می‌گوید (روی نوار سبز سربرگ چهارگوش دیده می‌شود). */
    hasAlpha: boolean('has_alpha').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.imageId, t.name] }),
    index('site_image_files_sha256').on(t.sha256),
    check(
      'site_image_files_name',
      sql`${t.name} IN ('logo', 'favicon', 'apple', 'icon192', 'icon512', 'og', 'desktop', 'mobile')`,
    ),
    /** ICO فقط favicon، و JPEG فقط تصویرهای بنر (عکس بی شفافیت)؛ بقیه PNG. */
    check(
      'site_image_files_type',
      sql`(${t.name} = 'favicon' AND ${t.contentType} = 'image/x-icon')
          OR (${t.name} IN ('desktop', 'mobile') AND ${t.contentType} IN ('image/png', 'image/jpeg'))
          OR (${t.name} NOT IN ('favicon', 'desktop', 'mobile') AND ${t.contentType} = 'image/png')`,
    ),
    check(
      'site_image_files_size',
      sql`octet_length(${t.bytes}) BETWEEN 1 AND ${sql.raw(String(SITE_IMAGE_FILE_MAX_BYTES))}
          AND ${t.width} BETWEEN 1 AND 4096 AND ${t.height} BETWEEN 1 AND 4096`,
    ),
    check('site_image_files_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);
