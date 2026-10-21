/**
 * تست یکپارچگی روی پستگرس واقعی.
 *
 * بدون `DATABASE_URL` خودش را رد می‌کند، تا `pnpm test` روی هر ماشینی بدون
 * سرویس اجرا شود. با `DATABASE_URL` مهاجرت‌ها را روی همان پایگاه داده اعمال
 * می‌کند و تعرفه را رفت‌وبرگشت می‌دهد.
 *
 *   docker compose -f infra/docker-compose.yml up -d postgres
 *   DATABASE_URL=postgresql://jozveyar:jozveyar@127.0.0.1:5432/jozveyar pnpm test
 *
 * چرا ارزش دارد وقتی تست‌های شکل داده از قبل هست: آن تست‌ها ثابت می‌کنند تبدیل
 * درست است، ولی نمی‌گویند SQL مهاجرت اجرا می‌شود، محدودیت‌ها واقعاً جلوی داده‌
 * خراب را می‌گیرند، یا `bigint` سالم برمی‌گردد. اینها فقط با پستگرس معلوم می‌شوند.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { priceListSchema, type Breakdown, type PriceList } from '@jozveyar/contracts';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { createDb, type Database } from './index.js';
import { createDiscountStore, termsOf } from './discounts.js';
import { DiscountRefusedError, MobileBlockedError } from './orders.js';
import { createBlockStore } from './blocks.js';
import { createReviewStore } from './reviews.js';
import { createSupportStore, SUPPORT_TARGET, type InboxPage, type SupportTarget } from './support.js';
import { checkingPaymentSql, createAccountStore } from './account.js';
import { supportMessages, supportThreads } from './schema.js';
import { CONTENT_TARGET, createSiteContentStore } from './content.js';
import { BUILD_SITE_IMAGE_JOB, SITE_IMAGE_TARGET, createSiteImageStore } from './siteImages.js';
import { siteImageFiles, siteImages } from './schema.js';
import { BANNER_SETTING, LOGO_SETTING } from './reference.js';
import { siteContentDrafts, siteContentVersions } from './schema.js';
import { mobileBlocks, orderReviews } from './schema.js';
import { discountCodes, discountTiers } from './schema.js';
import { DISCOUNT_TIERS_MAX, TIER_PERCENT_MAX } from '@jozveyar/contracts';
import { runMigrations } from './migrate.js';
import { activePriceListActivatedAt, loadActivePriceList, loadPriceList, seedPriceList, activatePriceList } from './seed.js';
import {
  bindingRateBands,
  cities,
  documentAnalyses,
  documentPages,
  documents,
  jobs,
  orderItemSections,
  orderItems,
  orderStatusEvents,
  orders,
  otpRequests,
  payments,
  printRules,
  priceLists,
  provinces,
  sessions,
  settings,
  shippingRates,
  shippingZones,
  smsMessages,
  users,
} from './schema.js';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { DEFAULT_THRESHOLDS } from '@jozveyar/contracts';
import { CITIES, PROVINCES, SHIPPING_ZONES } from '@jozveyar/geo';
import { HOLIDAYS_SETTING, SLA_DAYS_SETTING, seedReferenceData } from './reference.js';
import { OFFICIAL_HOLIDAYS } from './holidays.js';
import {
  ANALYZE_DOCUMENT_JOB,
  CONVERT_DOCUMENT_JOB,
  createDocumentStore,
  type NewUploadDocument,
} from './documents.js';
import { randomUUID } from 'node:crypto';
import { createAuthStore } from './auth.js';
import { PREPARE_ORDER_JOB, PREPARE_TICKET_JOB, createOrderStore, type NewOrder, type OrderStatus } from './orders.js';
import { createSmsLog, createSmsOutbox, createSmsStats, liveSms, queuedPartnerSms, queuedSupportSms } from './sms.js';
import { consoleTransport, deliverQueued, orderPaidText, partnerOrderText, SMS_STUCK_MS, supportReplyText, trackingText, type SmsTransport } from '@jozveyar/sms';
import { formatDeadlineDay } from '@jozveyar/text';
import { ADMIN_PERMISSIONS, ADMIN_ROLES, createAdminStore, type AdminEventInput, type AdminRole, type NewInvite } from './admin.js';
import {
  ALL_ORDERS,
  createPanelOrderStore,
  pdfErrorCode,
  type PanelBucket,
  type PanelClock,
  type PanelSearch,
  type PanelStatusChange,
} from './panel.js';
import {
  adminEvents,
  adminInvites,
  adminLoginAttempts,
  adminSessions,
  adminUserRoles,
  adminUsers,
  bindingTypes,
  paperRates,
  paperTypes,
  printRates,
  rolePermissions,
  shippingMethods,
} from './schema.js';
import { createTariffStore, type TariffActor } from './tariff.js';
import { createSettingsStore, lastSettingEvent, settingsChangedAt, SETTING_TARGET, type SettingsActor } from './settings.js';
import { createSecretStore, resolveServiceKey, serviceKeyContext, SERVICE_KEY_TARGET, SERVICE_KEYS } from './secrets.js';
import { seal } from './sealed.js';
import { serviceSecrets } from './schema.js';
import { FILES_RETENTION_SETTING, OFFICIAL_THROUGH_SETTING, OTP_SITE_LIMIT_SETTING } from './reference.js';
import { orderAssignments, orderNotes, orderPrintFiles, printPartners } from './schema.js';
import { createPartnerStore } from './partners.js';
import { allClosedWindow, closedDays, rankPartners } from './assignment.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { READ_POST_FILE_JOB, createShipmentStore } from './shipments.js';
import { shipmentImportRows, shipmentImports, shipments } from './schema.js';
import { barcodeOf, parcel, postTable } from './postfile.fixtures.js';
import { MISMATCH_ALERT_MS, type PanelNoteInput, type PanelScope } from './panel.js';
import { bandsDecision, bandsSeen, createShippingReportStore, currentBands } from './report.js';
import { readSetting, REPORT_BANDS_SETTING } from './reference.js';
import { createZibalMock, type ZibalMock } from '@jozveyar/payments/mock';
import { mockGateway, PaymentError, type PaymentGateway } from '@jozveyar/payments';
import { zibalGateway } from '@jozveyar/payments/zibal';
import { PAYMENT_ATTEMPT_TTL_MS } from './orders.js';
import { isChecking, providersOf, settleWith, watchHeld } from './payments.js';
import {
  REFUND_AUTO_EVERY_MS,
  REFUND_AUTO_WINDOW_MS,
  REFUND_REQUEST_GRACE_MS,
  createRefundStore,
  inquirePendingRefunds,
  inquireRefund,
  requestRefund,
  type RefundStart,
} from './refunds.js';
import { refunds } from './schema.js';
import {
  CHECKOUT_AUDIENCE_EVENT,
  CHECKOUT_PREVIEW_EVENT,
  checkoutAudience,
  createCheckoutPreviewStore,
  gatewayRejection,
  lastAudienceChange,
} from './checkout.js';
import { BAR_SETTING, CHECKOUT_AUDIENCE_SETTING, DEFAULT_SETTINGS } from './reference.js';
import { checkoutPreviews } from './schema.js';
import { SETTINGS_LOCK } from './settings.js';
import { orderTickets, TICKET_TEMPLATE_MAX_BYTES, ticketTemplates } from './schema.js';
import { createTicketTemplateStore, PREVIEW_TICKET_TEMPLATE_JOB, TEMPLATE_TARGET } from './templates.js';
import { createProductionReportStore, type ProductionOrder } from './production.js';
import { createReportExportStore, RENDER_REPORT_JOB } from './exports.js';
import { REPORT_EXPORT_MAX_BYTES, reportExports } from './schema.js';
import { createSettlementStore, shareRialsOf, type LedgerInput, type SettlementRange } from './settlement.js';
import { partnerLedger } from './schema.js';
import { createInventoryStore, type MoveInput, type StockItem } from './inventory.js';
import { paperStockItems, paperStockMoves } from './schema.js';

/**
 * نام محدودیتی که پستگرس رد کرده.
 *
 * drizzle خطای درایور را در یک Error با پیام «Failed query: …» می‌پیچد، پس
 * تطبیق روی پیام بیرونی نام محدودیت را پیدا نمی‌کند و تست **به دلیل اشتباه**
 * سبز یا قرمز می‌شود. نام واقعی در `cause` است — جز وقتی محافظ معوق (برش ۳) در
 * COMMIT رد می‌کند: آن خطا مال هیچ کوئری‌ای نیست و خود خطای درایور می‌رسد.
 */
async function rejectedConstraint(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    type PgError = { constraint_name?: string; cause?: { constraint_name?: string } };
    return (error as PgError).cause?.constraint_name ?? (error as PgError).constraint_name;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;

/** سفارش‌ها و هر چه به آنها بسته است؛ پرداخت cascade ندارد (سابقهٔ پول بی‌صدا پاک نمی‌شود). */
async function clearOrders({ db }: Database) {
  // بازپرداخت پاک‌نشدنی است (0032)، مسدودی موبایل هم (0050)، گفت‌وگوی پشتیبانی و پیام‌هایش هم (0058)، دفتر تسویهٔ چاپخانه‌ها هم (0060)،
  // و موجودی کاغذ هم (0062؛ ردیف چاپ به سفارش اشاره می‌کند)؛ TRUNCATE تریگر ردیفی ندارد.
  await db.execute(sql`TRUNCATE paper_stock_moves, paper_stock_items`);
  await db.execute(sql`TRUNCATE refunds`);
  await db.execute(sql`TRUNCATE partner_ledger`);
  await db.execute(sql`TRUNCATE mobile_blocks`);
  await db.execute(sql`TRUNCATE support_messages, support_threads`);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(sessions);
  await db.delete(otpRequests);
  await db.delete(users);
  await db.delete(smsMessages);
}

/**
 * تعرفه‌ها از صفر. نسخه‌ای که یک بار فعال شده پاک نمی‌شود (تریگر `price_lists_frozen`، برش ۴٫۵)، پس TRUNCATE، که تریگر
 * ردیفی ندارد؛ CASCADE سفارش‌ها و هرچه به آنها بسته است (و کارهای صف) را هم خالی می‌کند.
 */
async function clearPriceLists(conn: Database) {
  await clearOrders(conn);
  await conn.db.execute(sql`TRUNCATE price_lists CASCADE`);
}

/**
 * رویداد ساختن سفارش با زمان صحنه. `createOrder` آن را با `now()` پایگاه داده می‌نویسد، ولی صحنهٔ تست پرداخت و تغییر وضعیت را با زمان
 * ثابت می‌نویسد («حالا»ی طرح، دوشنبه 13 مهر 1405)، و جزئیات پنل رویدادها را به ترتیب زمان می‌دهد؛ پس از گذشتن آن زمان‌ها «ساخته شد» پس
 * از «پرداخت شد» می‌افتاد و تست بی هیچ تغییری قرمز می‌شد (بمب زمانی، ۱۴۰۵/۰۷/۱۱). فقط همین یک زمان به صحنه برمی‌گردد، مثل `createdAt`
 * صریح تلاش پرداخت؛ جدول رویدادهای وضعیت تریگر محافظ ندارد، و `orders.created_at` منجمد است و دست نمی‌خورد.
 */
async function placedAt({ db }: Database, orderId: string, at: Date) {
  const rows = await db
    .update(orderStatusEvents)
    .set({ at })
    .where(and(eq(orderStatusEvents.orderId, orderId), isNull(orderStatusEvents.fromStatus)))
    .returning({ id: orderStatusEvents.id });
  // دقیقاً یک رویداد ساختن؛ وگرنه این کمکی بی‌صدا هیچ نکرده و صحنه همان ساعت واقعی را دارد.
  expect(rows).toHaveLength(1);
}

describe.skipIf(!DATABASE_URL)('پایگاه دادهٔ واقعی', () => {
  let conn: Database;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL!);
    conn = createDb(DATABASE_URL!);
    // هر اجرا از صفر: تست نباید به حالت باقی‌مانده از اجرای قبلی وابسته باشد. سفارش به تعرفه و
    // سند اشاره می‌کند و پرداخت به سفارش، پس اول این‌ها (برش ۳).
    await clearPriceLists(conn);
  });

  afterAll(async () => {
    await conn?.client.end();
  });

  it('تعرفهٔ پایه درج می‌شود و بار دوم دست نمی‌خورد', async () => {
    expect(await seedPriceList(conn, SEED_PRICE_LIST)).toEqual({ version: 1, inserted: true });
    expect(await seedPriceList(conn, SEED_PRICE_LIST)).toEqual({ version: 1, inserted: false });
  });

  it('تعرفهٔ خوانده‌شده با قرارداد می‌خواند', async () => {
    expect(() => priceListSchema.parse(SEED_PRICE_LIST)).not.toThrow();
    const fromDb = await loadActivePriceList(conn);
    expect(() => priceListSchema.parse(fromDb)).not.toThrow();
  });

  it('زمان فعال شدن تعرفهٔ فعال، «آخرین تغییر» صفحهٔ اصلی در نقشهٔ سایت (برش ۱۵٫۱)', async () => {
    const [head] = await conn.db.select({ at: priceLists.activatedAt }).from(priceLists).where(eq(priceLists.isActive, true));
    const at = await activePriceListActivatedAt(conn);
    expect(at).toBeInstanceOf(Date);
    expect(at).toEqual(head!.at);
  });

  it('قیمت از پایگاه داده همان قیمت از seed است', async () => {
    const fromDb = await loadActivePriceList(conn);
    const spec = {
      items: [
        {
          sections: [{ documentId: 'd1', pageCount: 147 }],
          rules: [
            {
              pageRanges: [[1, 147]] as [number, number][],
              colorMode: 'bw' as const,
              paperTypeId: 'tahrir80',
            },
          ],
          copies: 1,
          sidesMode: 'double' as const,
          paperSize: 'a4' as const,
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: null,
    };

    const fromDatabase = quote(spec, fromDb);
    expect(fromDatabase).toEqual(quote(spec, SEED_PRICE_LIST));
    // همان عددی که در CLAUDE.md قفل است: اسکن زرد ۱۴۷ صفحه، ۲۸۰,۲۰۰ تومان.
    expect(fromDatabase.totalRials).toBe(2_802_000);
  });

  it('سفارش سنگین از بازهٔ بدون سقف کرایه می‌گیرد', async () => {
    const fromDb = await loadActivePriceList(conn);
    const spec = {
      items: [
        {
          sections: [{ documentId: 'd1', pageCount: 1500 }],
          rules: [
            {
              pageRanges: [[1, 1500]] as [number, number][],
              colorMode: 'bw' as const,
              paperTypeId: 'tahrir80',
            },
          ],
          copies: 10,
          sidesMode: 'double' as const,
          paperSize: 'a4' as const,
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: { methodId: 'post', zoneId: 'other' },
    };

    const result = quote(spec, fromDb);
    expect(result.estWeightGrams).toBeGreaterThan(3_000);
    expect(result.shippingRials).toBe(2_072_000);
  });

  it('مبالغ bigint سالم برمی‌گردند، نه رشته', async () => {
    const [band] = await conn.db.select().from(bindingRateBands).limit(1);
    expect(typeof band!.priceRials).toBe('number');
    expect(Number.isInteger(band!.priceRials)).toBe(true);
  });

  it('سقف باز به صورت null ذخیره می‌شود', async () => {
    const rates = await conn.db.select().from(shippingRates);
    expect(rates.filter((r) => r.maxWeightGrams === null)).toHaveLength(2);
  });

  describe('محدودیت‌هایی که تعرفهٔ خراب را رد می‌کنند', () => {
    // روی پیش‌نویس: ردیف نسخهٔ فعال‌شده (۱) پیش از این محدودیت‌ها به تریگر `price_list_rows_frozen` می‌خورد (برش ۴٫۵).
    const DRAFT = 90;
    beforeAll(async () => {
      await seedPriceList(conn, { ...SEED_PRICE_LIST, version: DRAFT, label: 'پیش‌نویس محدودیت‌ها' }, { activate: false });
    });

    it('بازهٔ صحافی همپوشان رد می‌شود', async () => {
      expect(
        await rejectedConstraint(
          conn.db.insert(bindingRateBands).values({
            priceListVersion: DRAFT,
            bindingTypeId: 'spiral_clear',
            paperSize: 'a4',
            minSheets: 100,
            maxSheets: 200,
            priceRials: 999_000,
          }),
        ),
      ).toBe('binding_rate_bands_no_overlap');
    });

    it('بازه‌های صحافی هر اندازه جدا (۸٫۳): همان بازه در A5 پذیرفته، همپوشانی در همان اندازه نه', async () => {
      const a5 = and(eq(bindingRateBands.priceListVersion, DRAFT), eq(bindingRateBands.paperSize, 'a5'));
      await conn.db
        .insert(bindingRateBands)
        .values({ priceListVersion: DRAFT, bindingTypeId: 'spiral_clear', paperSize: 'a5', minSheets: 1, maxSheets: 150, priceRials: 400_000 });
      expect(
        await rejectedConstraint(
          conn.db
            .insert(bindingRateBands)
            .values({ priceListVersion: DRAFT, bindingTypeId: 'spiral_clear', paperSize: 'a5', minSheets: 100, maxSheets: 200, priceRials: 1 }),
        ),
      ).toBe('binding_rate_bands_no_overlap');
      await conn.db.delete(bindingRateBands).where(a5);
    });

    it('نرخ چاپ هر اندازه هیچ یا هر چهار حالت، و صفر نه؛ نرخ کاغذ منفی نه؛ کمینهٔ برگ صحافی از ۱ تا سقف (۸٫۳)', async () => {
      const rate = (sidesMode: 'single' | 'double', colorMode: 'color' | 'bw', paperSize: 'a4' | 'a5' | 'a3' = 'a5') =>
        ({ priceListVersion: DRAFT, paperSize, sidesMode, colorMode, rateRials: 10_000 }) as const;
      const four = [rate('single', 'color'), rate('single', 'bw'), rate('double', 'color'), rate('double', 'bw')];
      const one = (paperSize: 'a4' | 'a5', sidesMode: 'single' | 'double', colorMode: 'color' | 'bw') =>
        and(
          eq(printRates.priceListVersion, DRAFT),
          eq(printRates.paperSize, paperSize),
          eq(printRates.sidesMode, sidesMode),
          eq(printRates.colorMode, colorMode),
        );
      // سه حالت از چهار: پایان تراکنش رد می‌کند، و هیچ نمی‌ماند.
      expect(await rejectedConstraint(conn.db.insert(printRates).values(four.slice(0, 3)))).toBe('print_rates_complete');
      // هر چهار پذیرفته؛ یکی کمتر نه؛ هر چهار با هم پاک پذیرفته.
      await conn.db.insert(printRates).values(four);
      expect(await rejectedConstraint(conn.db.delete(printRates).where(one('a5', 'double', 'bw')))).toBe('print_rates_complete');
      await conn.db.delete(printRates).where(and(eq(printRates.priceListVersion, DRAFT), eq(printRates.paperSize, 'a5')));
      // یک حالت A4 به اندازهٔ دیگر: هر دو اندازه نیمه‌کاره.
      expect(await rejectedConstraint(conn.db.update(printRates).set({ paperSize: 'a3' }).where(one('a4', 'single', 'color')))).toBe(
        'print_rates_complete',
      );
      expect(await rejectedConstraint(conn.db.update(printRates).set({ rateRials: 0 }).where(one('a4', 'single', 'bw')))).toBe(
        'print_rates_positive',
      );
      expect(await rejectedConstraint(conn.db.update(paperRates).set({ rateRials: -1 }).where(eq(paperRates.priceListVersion, DRAFT)))).toBe(
        'paper_rates_nonnegative',
      );
      expect(
        await rejectedConstraint(conn.db.insert(paperRates).values({ priceListVersion: DRAFT, paperTypeId: 'glossy', paperSize: 'a4', rateRials: 1 })),
      ).toBe('paper_rates_paper_type_fk');
      for (const minSheets of [0, 801]) {
        expect(await rejectedConstraint(conn.db.update(bindingTypes).set({ minSheets }).where(eq(bindingTypes.priceListVersion, DRAFT)))).toBe(
          'binding_types_sheets',
        );
      }
      expect((await loadPriceList(conn, DRAFT)).printRates).toEqual(SEED_PRICE_LIST.printRates);
    });

    it('بازهٔ وزن همپوشان رد می‌شود', async () => {
      expect(
        await rejectedConstraint(
          conn.db.insert(shippingRates).values({
          priceListVersion: DRAFT,
          methodId: 'post',
          zoneId: 'other',
          minWeightGrams: 500,
          maxWeightGrams: 1_500,
          priceRials: 1,
          }),
        ),
      ).toBe('shipping_rates_no_overlap');
    });

    it('دو بازهٔ بدون سقف در یک منطقه رد می‌شود', async () => {
      expect(
        await rejectedConstraint(
          conn.db.insert(shippingRates).values({
          priceListVersion: DRAFT,
          methodId: 'post',
          zoneId: 'other',
          minWeightGrams: 9_000,
          maxWeightGrams: null,
          priceRials: 1,
          }),
        ),
      ).toBe('shipping_rates_no_overlap');
    });

    it('تعرفهٔ فعال دوم رد می‌شود', async () => {
      expect(
        await rejectedConstraint(
          conn.db.insert(priceLists).values({
            version: 99,
            label: 'دومی',
            settings: SEED_PRICE_LIST.settings,
            isActive: true,
          }),
        ),
      ).toBe('price_lists_one_active');
    });
  });

  it('نسخهٔ غیرفعال ذخیره می‌شود و فعال‌سازی جابه‌جا می‌کند', async () => {
    const v2 = { ...SEED_PRICE_LIST, version: 2, label: 'نسخهٔ دوم' };
    expect(await seedPriceList(conn, v2, { activate: false })).toEqual({
      version: 2,
      inserted: true,
    });

    // نسخهٔ فعال هنوز یک است — درج غیرفعال نباید چیزی را جابه‌جا کند.
    expect((await loadActivePriceList(conn)).version).toBe(1);

    await activatePriceList(conn, 2);
    expect((await loadActivePriceList(conn)).version).toBe(2);
    // نسخهٔ قدیمی پاک نمی‌شود: قیمت سفارش‌های ثبت‌شده به آن تکیه دارد.
    expect((await loadPriceList(conn, 1)).label).toBe(SEED_PRICE_LIST.label);

    await activatePriceList(conn, 1);
  });

  // در همین فایل، نه فایل جدا: vitest فایل‌ها را موازی اجرا می‌کند و دو اجرای
  // هم‌زمان مهاجرت روی یک پایگاه داده با هم مسابقه می‌دهند.
  describe('سند و آپلود', () => {
    const MiB = 1024 * 1024;
    const doc = (over: Partial<NewUploadDocument> = {}): NewUploadDocument => ({
      id: randomUUID(),
      sessionHash: 'a'.repeat(64),
      originalName: 'جزوهٔ فیزیک.pdf',
      sourceKind: 'pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10 * MiB,
      storageKey: 'uploads/x.pdf',
      uploadId: 'u1',
      partSizeBytes: 8 * MiB,
      ...over,
    });

    beforeAll(async () => {
      await conn.db.delete(documents);
    });

    it('سند آپلودی درج و خوانده می‌شود، نام فارسی سالم', async () => {
      const store = createDocumentStore(conn);
      const d = doc();
      await store.insertUpload(d);
      const row = await store.find(d.id);
      expect(row?.status).toBe('uploading');
      expect(row?.originalName).toBe('جزوهٔ فیزیک.pdf');
      expect(row?.sizeBytes).toBe(10 * MiB);
      expect(await store.find(randomUUID())).toBeNull();
    });

    it('شمارش آپلود باز و حجم در راه', async () => {
      await conn.db.delete(documents);
      const store = createDocumentStore(conn);
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 86_400_000);
      const session = 'b'.repeat(64);

      const open = doc({ sessionHash: session, sizeBytes: 100 });
      const uploaded = doc({ sessionHash: session, sizeBytes: 1_000 });
      const expired = doc({ sizeBytes: 10_000 });
      const failed = doc({ sessionHash: session, sizeBytes: 100_000 });
      for (const d of [open, uploaded, expired, failed]) await store.insertUpload(d);

      await store.markUploaded(uploaded.id, now, new Date(now.getTime() + 2 * 86_400_000), null);
      await store.markUploaded(expired.id, now, new Date(now.getTime() - 1), null);
      await store.markFailed(failed.id, 'aborted');

      expect(await store.countOpenUploads(session, dayAgo)).toBe(1);
      // باز (۱۰۰) + رسیده و زنده (۱,۰۰۰). منقضی و شکست‌خورده شمرده نمی‌شوند.
      expect(await store.committedBytes(now, dayAgo)).toBe(1_100);
      // آپلود بازِ کهنه‌تر از پنجره هم شمرده نمی‌شود: استوریج خودش لغوش کرده.
      expect(await store.committedBytes(now, new Date(now.getTime() + 1_000))).toBe(1_000);
    });

    it('سند بدون مالک ساختنی نیست', async () => {
      const { sessionHash: _drop, ...rest } = doc();
      await expect(
        conn.db.insert(documents).values({ ...rest, status: 'uploading' } as never),
      ).rejects.toThrow();
    });

    it('تکمیل آپلود کار تحلیل را در همان تراکنش در صف می‌گذارد، فقط یک بار', async () => {
      const store = createDocumentStore(conn);
      const d = doc();
      await store.insertUpload(d);
      const at = new Date();
      await store.markUploaded(d.id, at, new Date(at.getTime() + 86_400_000), ANALYZE_DOCUMENT_JOB);
      // تکمیل تکراری (کلاینتی که جواب را گم کرده) کار دوم نمی‌سازد.
      await store.markUploaded(d.id, at, new Date(at.getTime() + 86_400_000), ANALYZE_DOCUMENT_JOB);

      const queued = await conn.db.select().from(jobs).where(eq(jobs.documentId, d.id));
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ kind: ANALYZE_DOCUMENT_JOB, status: 'queued', attempts: 0 });
    });

    it('Word رسیده کار تبدیل می‌گیرد، نه تحلیل (ADR-028)', async () => {
      const store = createDocumentStore(conn);
      const d = doc({ sourceKind: 'docx', originalName: 'جزوه.docx', storageKey: 'uploads/w.docx' });
      await store.insertUpload(d);
      const at = new Date();
      await store.markUploaded(d.id, at, new Date(at.getTime() + 86_400_000), CONVERT_DOCUMENT_JOB);
      const queued = await conn.db.select().from(jobs).where(eq(jobs.documentId, d.id));
      expect(queued.map((j) => j.kind)).toEqual([CONVERT_DOCUMENT_JOB]);
    });

    it('بودجهٔ دیسک PDF تبدیل‌شده را هم می‌شمارد، و «در حال تبدیل» زنده است', async () => {
      await conn.db.delete(documents);
      const store = createDocumentStore(conn);
      const now = new Date();
      const later = new Date(now.getTime() + 86_400_000);
      const word = doc({ sourceKind: 'docx', sizeBytes: 1_000 });
      const converting = doc({ sourceKind: 'pptx', sizeBytes: 50 });
      for (const d of [word, converting]) {
        await store.insertUpload(d);
        await store.markUploaded(d.id, now, later, null);
      }
      await conn.db
        .update(documents)
        .set({ status: 'ready', pdfStorageKey: 'uploads/w.converted.pdf', pdfSizeBytes: 3_000 })
        .where(eq(documents.id, word.id));
      await conn.db.update(documents).set({ status: 'converting' }).where(eq(documents.id, converting.id));
      expect(await store.committedBytes(now, now)).toBe(1_000 + 3_000 + 50);
      const row = await store.find(word.id);
      expect(row).toMatchObject({ pdfStorageKey: 'uploads/w.converted.pdf', pdfSizeBytes: 3_000, conversion: null });
    });

    it('تحلیل مرورگر فقط بار اول ذخیره می‌شود؛ تحلیل سرور تا نیامده null است', async () => {
      const store = createDocumentStore(conn);
      const d = doc();
      await store.insertUpload(d);
      const analysis = {
        engine: 'browser-pdfjs-test',
        thresholds: DEFAULT_THRESHOLDS,
        pageCount: 2,
        sampled: false,
        sampleStride: 1,
        elapsedMs: 12.6,
        pages: [1, 2].map((n) => ({
          n,
          widthPt: 595,
          heightPt: 842,
          rotation: 0,
          color: n === 2,
          colorRatio: n === 2 ? 0.1 : 0,
          coloredInkRatio: n === 2 ? 0.5 : 0,
          chromaP95: n === 2 ? 120 : 3,
          paperCast: [250, 245, 225] as [number, number, number],
          inkRatio: 0.05,
          blank: false,
          estimatedDpi: null,
          minMarginMm: 12.5,
          warnings: [],
        })),
      };
      expect(await store.saveBrowserAnalysis(d.id, analysis)).toBe(true);
      expect(await store.saveBrowserAnalysis(d.id, analysis)).toBe(false);
      expect(await store.serverAnalysis(d.id)).toBeNull();
    });

    it('تنظیم خوانده می‌شود و نبودش undefined است', async () => {
      const store = createDocumentStore(conn);
      await conn.db
        .insert(settings)
        .values({ key: 'file.retention_days', value: 3 })
        .onConflictDoUpdate({ target: settings.key, set: { value: 3 } });
      expect(await store.setting('file.retention_days')).toBe(3);
      expect(await store.setting('no.such.key')).toBeUndefined();
      await conn.db.delete(settings);
    });
  });

  // در همین فایل، به همان دلیل «سند و آپلود»: یک اجرای مهاجرت برای کل پایگاه داده.
  describe('دادهٔ پایه و سفارش (برش ۳)', () => {
    const Tehran = PROVINCES.find((p) => p.name === 'تهران')!;
    const Alborz = PROVINCES.find((p) => p.name === 'البرز')!;
    const cityIn = (name: string, provinceId: number) => CITIES.find((c) => c.name === name && c.provinceId === provinceId)!;
    const pardis = cityIn('پردیس', Tehran.id);
    const karaj = cityIn('کرج', Alborz.id);
    let docs: { id: string; pages: number }[] = [];

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.delete(settings);
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const store = createDocumentStore(conn);
      docs = [
        { id: randomUUID(), pages: 100 },
        { id: randomUUID(), pages: 50 },
      ];
      for (const d of docs) {
        await store.insertUpload({
          id: d.id,
          sessionHash: 'c'.repeat(64),
          originalName: `جلسه ${d.pages}.pdf`,
          sourceKind: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1_000,
          storageKey: `uploads/${d.id}.pdf`,
          uploadId: 'u',
          partSizeBytes: 8 * 1024 * 1024,
        });
      }
    });

    afterAll(async () => {
      await clearOrders(conn);
    });

    it('منطقه، استان و شهر همان داده‌ای‌اند که مرورگر می‌خواند', async () => {
      const zones = await conn.db.select().from(shippingZones);
      expect(zones.map((z) => [z.id, z.nameFa]).sort()).toEqual(SHIPPING_ZONES.map((z) => [z.id, z.name]).sort());
      const provinceRows = await conn.db.select().from(provinces);
      expect(provinceRows.map((p) => [p.id, p.nameFa, p.shippingZoneId]).sort()).toEqual(
        PROVINCES.map((p) => [p.id, p.name, p.zone]).sort(),
      );
      const cityRows = await conn.db.select().from(cities);
      expect(cityRows.map((c) => [c.id, c.provinceId, c.nameFa]).sort()).toEqual(
        CITIES.map((c) => [c.id, c.provinceId, c.name]).sort(),
      );
    });

    it('دادهٔ پایه idempotent است: بار دوم چیزی اضافه نمی‌شود و تنظیم عوض‌شده برنمی‌گردد', async () => {
      await conn.db.update(settings).set({ value: 3 }).where(eq(settings.key, SLA_DAYS_SETTING));
      const again = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(again).toEqual({ provinces: 31, cities: CITIES.length, priceListInserted: null, settingsInserted: [], partnerInserted: null });
      const [sla] = await conn.db.select().from(settings).where(eq(settings.key, SLA_DAYS_SETTING));
      expect(sla!.value).toBe(3);
      const [holidays] = await conn.db.select().from(settings).where(eq(settings.key, HOLIDAYS_SETTING));
      expect(holidays!.value).toEqual(OFFICIAL_HOLIDAYS);
      await conn.db.update(settings).set({ value: 2 }).where(eq(settings.key, SLA_DAYS_SETTING));
    });

    it('نرخ برای منطقه‌ای که نیست رد می‌شود', async () => {
      // روی پیش‌نویس، مثل محدودیت‌های تعرفه: نسخهٔ ۱ فعال‌شده است و ردیف تازه نمی‌گیرد.
      await seedPriceList(conn, { ...SEED_PRICE_LIST, version: 91, label: 'پیش‌نویس منطقه' }, { activate: false });
      expect(
        await rejectedConstraint(
          conn.db.insert(shippingRates).values({
            priceListVersion: 91,
            methodId: 'post',
            zoneId: 'mars',
            minWeightGrams: 0,
            maxWeightGrams: 1_000,
            priceRials: 1,
          }),
        ),
      ).toBe('shipping_rates_zone_fk');
    });

    /** یک سفارش کامل در یک تراکنش، همان‌طور که سرور می‌سازد؛ هر تکه‌اش را تست می‌تواند خراب کند. */
    async function placeOrder(over: {
      orderPatch?: Partial<typeof orders.$inferInsert>;
      pageCount?: number;
      sections?: { documentId: string; pageCount: number }[];
      rules?: { pageRanges: [number, number][]; colorMode: 'color' | 'bw' }[];
    } = {}) {
      const sections = over.sections ?? docs.map((d) => ({ documentId: d.id, pageCount: d.pages }));
      const pageCount = over.pageCount ?? sections.reduce((sum, s) => sum + s.pageCount, 0);
      const rules = over.rules ?? [{ pageRanges: [[1, pageCount]] as [number, number][], colorMode: 'bw' as const }];
      const breakdown = quote(
        {
          items: [{ sections, rules: rules.map((r) => ({ ...r, paperTypeId: 'tahrir80' })), copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }],
          shipping: { methodId: 'post', zoneId: 'tehran' },
        },
        SEED_PRICE_LIST,
      );
      return conn.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ mobile: '09121234567' })
          .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
          .returning();
        const [order] = await tx
          .insert(orders)
          .values({
            checkoutKey: randomUUID(),
            userId: user!.id,
            priceListVersion: breakdown.priceListVersion,
            priceBreakdown: breakdown,
            subtotalRials: breakdown.subtotalRials,
            discountRials: breakdown.discountRials,
            shippingRials: breakdown.shippingRials!,
            vatRials: breakdown.vatRials,
            roundingRials: breakdown.roundingRials,
            totalRials: breakdown.totalRials,
            estWeightGrams: breakdown.estWeightGrams,
            slaDays: 2,
            shippingMethodId: 'post',
            shippingZoneId: 'tehran',
            provinceId: Tehran.id,
            cityId: pardis.id,
            recipientName: 'سارا احمدی',
            recipientPhone: '09121234567',
            addressText: 'پردیس، فاز ۲، پلاک ۱۲',
            ...over.orderPatch,
          })
          .returning();
        const [item] = await tx
          .insert(orderItems)
          .values({ orderId: order!.id, seq: 1, pageCount, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' })
          .returning();
        await tx.insert(orderItemSections).values(sections.map((s, i) => ({ orderItemId: item!.id, seq: i + 1, ...s })));
        await tx.insert(printRules).values(
          rules.map((r, i) => ({ orderItemId: item!.id, seq: i + 1, pageRanges: r.pageRanges, colorMode: r.colorMode, paperTypeId: 'tahrir80' })),
        );
        return { order: order!, item: item! };
      });
    }

    it('سفارش درست ساخته می‌شود؛ شماره از 10001 و بالا می‌رود', async () => {
      const first = await placeOrder();
      const second = await placeOrder();
      expect(first.order.orderNumber).toBeGreaterThanOrEqual(10_001);
      expect(second.order.orderNumber).toBeGreaterThan(first.order.orderNumber);
      expect(first.order.status).toBe('awaiting_payment');
      expect(first.order.publicToken).not.toBe(second.order.publicToken);
      // قیمت منجمد همان `quote()` است، بی‌کم‌وکاست، و bigint سالم برمی‌گردد.
      expect(first.order.priceBreakdown).toMatchObject({ priceListVersion: 1, totalRials: first.order.totalRials });
      expect(typeof first.order.totalRials).toBe('number');
    });

    it('جمع پول باید از تکه‌هایش دربیاید', async () => {
      expect(await rejectedConstraint(placeOrder({ orderPatch: { totalRials: 1 } }))).toBe('orders_total_adds_up');
    });

    it('قیمت و منطقهٔ سفارش عوض نمی‌شوند؛ نشانی می‌شود', async () => {
      const { order } = await placeOrder();
      const byId = eq(orders.id, order.id);
      expect(await rejectedConstraint(conn.db.update(orders).set({ totalRials: order.totalRials + 10, subtotalRials: order.subtotalRials + 10 }).where(byId))).toBe(
        'orders_price_frozen',
      );
      expect(await rejectedConstraint(conn.db.update(orders).set({ priceBreakdown: {} }).where(byId))).toBe('orders_price_frozen');
      expect(await rejectedConstraint(conn.db.update(orders).set({ shippingZoneId: 'other' }).where(byId))).toBe('orders_price_frozen');
      const [fixed] = await conn.db.update(orders).set({ addressText: 'پردیس، فاز ۲، پلاک ۱۴' }).where(byId).returning();
      expect(fixed!.addressText).toBe('پردیس، فاز ۲، پلاک ۱۴');
      expect(fixed!.updatedAt.getTime()).toBeGreaterThan(order.updatedAt.getTime());
    });

    it('پرداخت شده تاریخ دارد و برگشت ندارد', async () => {
      const { order } = await placeOrder();
      const byId = eq(orders.id, order.id);
      expect(await rejectedConstraint(conn.db.update(orders).set({ status: 'paid' }).where(byId))).toBe('orders_paid_has_dates');
      const paidAt = new Date();
      await conn.db.update(orders).set({ status: 'paid', paidAt, postHandoffDueAt: new Date(paidAt.getTime() + 3 * 86_400_000) }).where(byId);
      expect(await rejectedConstraint(conn.db.update(orders).set({ status: 'awaiting_payment' }).where(byId))).toBe('orders_payment_final');
      expect(await rejectedConstraint(conn.db.update(orders).set({ postHandoffDueAt: new Date() }).where(byId))).toBe('orders_payment_final');
    });

    it('قاعده‌ها باید صفحه‌های جزوه را دقیقاً یک بار بپوشانند', async () => {
      const bw = (pageRanges: [number, number][]) => ({ pageRanges, colorMode: 'bw' as const });
      // یک صفحه جاافتاده، یک صفحه دوبار، یک صفحه بیرون از جزوه.
      expect(await rejectedConstraint(placeOrder({ rules: [bw([[1, 149]])] }))).toBe('order_items_cover_pages');
      expect(await rejectedConstraint(placeOrder({ rules: [bw([[1, 100]]), bw([[100, 150]])] }))).toBe('order_items_cover_pages');
      expect(await rejectedConstraint(placeOrder({ rules: [bw([[1, 151]])] }))).toBe('order_items_cover_pages');
      // جمع درست، ولی صفحهٔ ۱۰۰ دوبار و صفحهٔ ۱۵۰ هیچ بار: شمردن تنها کافی نیست.
      expect(await rejectedConstraint(placeOrder({ rules: [bw([[1, 100]]), bw([[100, 149]])] }))).toBe('order_items_cover_pages');
      // جمع بخش‌ها با صفحه‌های قلم نمی‌خواند.
      expect(await rejectedConstraint(placeOrder({ pageCount: 149, rules: [bw([[1, 149]])] }))).toBe('order_items_cover_pages');
      // حالت ترکیبی (ADR-002): دو قاعده، بی همپوشانی، کل جزوه.
      const mixed = await placeOrder({ rules: [{ pageRanges: [[1, 11], [13, 14]], colorMode: 'color' }, bw([[12, 12], [15, 150]])] });
      expect(mixed.item.pageCount).toBe(150);
    });

    it('مشخصات جزوه منجمد است؛ فقط PDF جزوه بعداً پر می‌شود', async () => {
      const { item } = await placeOrder();
      expect(await rejectedConstraint(conn.db.update(orderItems).set({ copies: 2 }).where(eq(orderItems.id, item.id)))).toBe('order_items_frozen');
      // اندازهٔ کاغذ هم، مثل بقیهٔ مشخصات (۸٫۳)
      expect(await rejectedConstraint(conn.db.update(orderItems).set({ paperSize: 'a5' }).where(eq(orderItems.id, item.id)))).toBe(
        'order_items_frozen',
      );
      expect(
        await rejectedConstraint(conn.db.update(printRules).set({ colorMode: 'color' }).where(eq(printRules.orderItemId, item.id))),
      ).toBe('order_spec_frozen');
      expect(
        await rejectedConstraint(conn.db.update(orderItemSections).set({ pageCount: 99 }).where(eq(orderItemSections.orderItemId, item.id))),
      ).toBe('order_spec_frozen');
      await conn.db.update(orderItems).set({ printPdfKey: `orders/${item.id}.pdf`, printPdfReadyAt: new Date() }).where(eq(orderItems.id, item.id));
      // حذف تنهای قاعده پوشش را می‌شکند.
      expect(await rejectedConstraint(conn.db.delete(printRules).where(eq(printRules.orderItemId, item.id)))).toBe('order_items_cover_pages');
    });

    it('شهر سفارش باید مال استان سفارش باشد؛ بی شهر، استان کافی است', async () => {
      expect(await rejectedConstraint(placeOrder({ orderPatch: { cityId: karaj.id } }))).toBe('orders_city_province_fk');
      const { order } = await placeOrder({ orderPatch: { cityId: null } });
      expect(order.cityId).toBeNull();
    });

    it('موبایل و کد پستی نرمال‌اند', async () => {
      expect(await rejectedConstraint(conn.db.insert(users).values({ mobile: '+989121234567' }))).toBe('users_mobile_normalized');
      expect(await rejectedConstraint(placeOrder({ orderPatch: { postalCode: '12345' } }))).toBe('orders_postal_code');
      expect(await rejectedConstraint(placeOrder({ orderPatch: { recipientName: '  ' } }))).toBe('orders_recipient_name');
    });

    it('هر سفارش حداکثر یک پرداخت موفق دارد، و موفق کد پیگیری دارد', async () => {
      const { order } = await placeOrder();
      const attempt = (over: Partial<typeof payments.$inferInsert>) =>
        conn.db.insert(payments).values({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority: randomUUID(), ...over });
      const verified = { verifiedAmountRials: order.totalRials };
      expect(await rejectedConstraint(attempt({ status: 'succeeded', ...verified }))).toBe('payments_success_has_ref');
      await attempt({ status: 'failed', failureCode: 'cancelled' });
      await attempt({ status: 'succeeded', refId: '803114', verifiedAt: new Date(), ...verified });
      expect(await rejectedConstraint(attempt({ status: 'succeeded', refId: '803115', verifiedAt: new Date(), ...verified }))).toBe('payments_one_success');
      // سابقهٔ پول: سفارشی که پرداخت دارد پاک نمی‌شود.
      expect(await rejectedConstraint(conn.db.delete(orders).where(eq(orders.id, order.id)))).toBe('payments_order_id_orders_id_fk');
    });

    it('سندی که در سفارش است پاک نمی‌شود', async () => {
      await placeOrder();
      expect(await rejectedConstraint(conn.db.delete(documents).where(eq(documents.id, docs[0]!.id)))).toBe(
        'order_item_sections_document_id_documents_id_fk',
      );
    });

    it('کار سفارش یک بار در صف می‌رود، و هر کار مال سند یا سفارش است نه هر دو', async () => {
      const { order } = await placeOrder();
      await conn.db.insert(jobs).values({ kind: 'prepare_order', orderId: order.id });
      expect(await rejectedConstraint(conn.db.insert(jobs).values({ kind: 'prepare_order', orderId: order.id }))).toBe('jobs_order_kind');
      expect(
        await rejectedConstraint(conn.db.insert(jobs).values({ kind: 'x', orderId: order.id, documentId: docs[0]!.id })),
      ).toBe('jobs_one_target');
    });

    it('تعرفهٔ پایه فقط وقتی هیچ تعرفه‌ای نیست درج می‌شود', async () => {
      await clearPriceLists(conn);
      const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(seeded.priceListInserted).toBe(1);
      // ترتیب ردیف‌ها از پایگاه داده قرار نیست؛ خود نرخ‌ها باید همان باشند.
      const byKey = (rates: PriceList['shippingRates']) =>
        [...rates].sort((a, b) => `${a.zoneId}${a.minWeightGrams}`.localeCompare(`${b.zoneId}${b.minWeightGrams}`));
      const loaded = await loadActivePriceList(conn);
      expect({ ...loaded, shippingRates: byKey(loaded.shippingRates) }).toEqual({
        ...SEED_PRICE_LIST,
        shippingRates: byKey(SEED_PRICE_LIST.shippingRates),
      });
    });
  });

  // در همین فایل، به همان دلیل «سند و آپلود». سرویس‌های وب با پیاده‌سازی حافظه‌ای تست می‌شوند
  // (apps/web/lib/server)؛ اینجا همان چیزی سنجیده می‌شود که فقط پستگرس معنایش را دارد: قفل، تراکنش،
  // و اتمی بودن.
  describe('مسیر خرید روی پستگرس (برش ۳ب)', () => {
    const SESSION = 'e'.repeat(64);
    const MOBILE = '09121234567';
    let docIds: string[] = [];

    beforeAll(async () => {
      await clearOrders(conn);
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const store = createDocumentStore(conn);
      docIds = [];
      for (const pages of [48, 54]) {
        const id = randomUUID();
        await store.insertUpload({
          id,
          sessionHash: SESSION,
          originalName: `جلسه ${pages}.pdf`,
          sourceKind: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1_000,
          storageKey: `uploads/${id}.pdf`,
          uploadId: 'u',
          partSizeBytes: 8 * 1024 * 1024,
        });
        const at = new Date();
        await store.markUploaded(id, at, new Date(at.getTime() + 2 * 86_400_000), null);
        await conn.db.update(documents).set({ status: 'ready', pageCount: pages }).where(eq(documents.id, id));
        docIds.push(id);
      }
    });

    afterAll(async () => {
      await clearOrders(conn);
    });

    const otpAt = (createdAt: Date, over: Partial<{ codeHash: string }> = {}) => ({
      codeHash: over.codeHash ?? 'f'.repeat(64),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 120_000),
    });

    /** پنجره‌های شمارش کد: یک ساعت و ۲۴ ساعت پیش از `at`، و سند زنده تا یک ساعت بعد (همان وب). */
    const windowAt = (at: Date) => ({
      hourSince: new Date(at.getTime() - 3_600_000),
      daySince: new Date(at.getTime() - 86_400_000),
      gate: { kind: 'documents' as const, readyUntil: new Date(at.getTime() + 3_600_000) },
    });

    it('صدور کد زیر قفل: ده درخواست هم‌زمان برای یک شماره، فقط پنج کد', async () => {
      const auth = createAuthStore(conn);
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          auth.issueOtp({ mobile: MOBILE, ipHash: `ip${i}`, sessionHash: SESSION, ...windowAt(new Date()) }, (counts) =>
            counts.mobile < 5 ? otpAt(new Date()) : null,
          ),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(5);
      const rows = await conn.db.select().from(otpRequests).where(eq(otpRequests.mobile, MOBILE));
      expect(rows).toHaveLength(5);
    });

    it('شمارش پنجره: شماره، مرورگر، IP و کل سایت در یک ساعت و ۲۴ ساعت، با قدیمی‌ترین و تازه‌ترین؛ بیرون از پنجره شمرده نمی‌شود', async () => {
      await conn.db.delete(otpRequests);
      const auth = createAuthStore(conn);
      const now = Date.now();
      const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
      const OTHER = 'c'.repeat(64);
      const issue = (mobile: string, ipHash: string, createdAt: Date, sessionHash = SESSION) =>
        auth.issueOtp(
          { mobile, ipHash, sessionHash, hourSince: new Date(0), daySince: new Date(0), gate: { kind: 'documents', readyUntil: new Date(0) } },
          () => otpAt(createdAt),
        );
      await issue(MOBILE, 'ip-a', at(25 * 60)); // بیرون از پنجرهٔ ۲۴ ساعته
      await issue(MOBILE, 'ip-a', at(20 * 60), OTHER); // در ۲۴ ساعت، بیرون از ساعت
      await issue(MOBILE, 'ip-a', at(90)); // بیرون از پنجرهٔ یک ساعته
      await issue(MOBILE, 'ip-a', at(50));
      await issue(MOBILE, 'ip-b', at(10), OTHER);
      await issue('09351234567', 'ip-a', at(5));
      let seen: unknown;
      await auth.issueOtp({ mobile: MOBILE, ipHash: 'ip-a', sessionHash: SESSION, ...windowAt(new Date(now)) }, (counts) => {
        seen = counts;
        return null;
      });
      expect(seen).toEqual({
        mobile: 2,
        mobileOldest: at(50),
        mobileLatest: at(10),
        mobileDay: 4,
        mobileDayOldest: at(20 * 60),
        session: 2,
        sessionOldest: at(50),
        ip: 2,
        ipOldest: at(50),
        site: 3,
        siteOldest: at(50),
        siteDay: 5,
        siteDayOldest: at(20 * 60),
        ready: true,
        blocked: false,
      });
    });

    it('دروازهٔ جزوه (برش ۷، ADR-049): فقط مرورگری که سند آماده، شمرده‌شده و زنده دارد', async () => {
      const auth = createAuthStore(conn);
      const readyOf = async (sessionHash: string, readyUntil: Date) => {
        let ready: boolean | undefined;
        await auth.issueOtp(
          { mobile: MOBILE, ipHash: 'ip-g', sessionHash, hourSince: new Date(), daySince: new Date(), gate: { kind: 'documents', readyUntil } },
          (counts) => {
            ready = counts.ready;
            return null;
          },
        );
        return ready;
      };
      const soon = new Date(Date.now() + 3_600_000);
      expect(await readyOf(SESSION, soon)).toBe(true);
      // مرورگر دیگر، بی سند.
      expect(await readyOf('b'.repeat(64), soon)).toBe(false);
      // سندی که تا یک ساعت دیگر پاک می‌شود دیگر زنده نیست (همان حاشیهٔ پرداخت).
      expect(await readyOf(SESSION, new Date(Date.now() + 3 * 86_400_000))).toBe(false);
      // سند پاک‌شده یا هنوز نیمه‌کاره: شاهد با همان مرورگر، که با برگرداندن سند دوباره آماده است.
      const [doc] = docIds;
      const others = docIds.slice(1);
      await conn.db.update(documents).set({ status: 'failed' }).where(inArray(documents.id, others));
      await conn.db.update(documents).set({ fileDeletedAt: new Date() }).where(eq(documents.id, doc!));
      expect(await readyOf(SESSION, soon)).toBe(false);
      await conn.db.update(documents).set({ fileDeletedAt: null, status: 'analyzing' }).where(eq(documents.id, doc!));
      expect(await readyOf(SESSION, soon)).toBe(false);
      await conn.db.update(documents).set({ status: 'ready' }).where(inArray(documents.id, docIds));
      expect(await readyOf(SESSION, soon)).toBe(true);
    });

    it('فرصت کد اتمی: ده سنجش هم‌زمان، فقط سه؛ کد منقضی فرصتی ندارد', async () => {
      const auth = createAuthStore(conn);
      const issued = await auth.issueOtp(
        { mobile: '09131234567', ipHash: 'ip', sessionHash: SESSION, ...windowAt(new Date()) },
        () => otpAt(new Date()),
      );
      const now = new Date();
      const claims = await Promise.all(Array.from({ length: 10 }, () => auth.claimOtpAttempt(issued!.id, now, 3)));
      expect(claims.filter((n) => n !== null).sort()).toEqual([1, 2, 3]);
      const expired = await auth.issueOtp(
        { mobile: '09141234567', ipHash: 'ip', sessionHash: SESSION, ...windowAt(new Date()) },
        () => otpAt(new Date(Date.now() - 180_000)),
      );
      expect(await auth.claimOtpAttempt(expired!.id, new Date(), 3)).toBeNull();
    });

    it('ورود یک بار: دو ورود هم‌زمان با یک کد، یک نشست؛ نشست باطل و منقضی پیدا نمی‌شود', async () => {
      const auth = createAuthStore(conn);
      const issued = await auth.issueOtp(
        { mobile: '09151234567', ipHash: 'ip', sessionHash: SESSION, ...windowAt(new Date()) },
        () => otpAt(new Date()),
      );
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 86_400_000);
      const logins = await Promise.all([
        auth.login({ otpId: issued!.id, mobile: '09151234567', tokenHash: 'a1'.repeat(32), now, expiresAt }),
        auth.login({ otpId: issued!.id, mobile: '09151234567', tokenHash: 'b2'.repeat(32), now, expiresAt }),
      ]);
      expect(logins.filter(Boolean)).toHaveLength(1);
      const winner = logins[0] ? 'a1'.repeat(32) : 'b2'.repeat(32);
      expect(await auth.findSession(winner, now)).toMatchObject({ mobile: '09151234567', userId: logins.find(Boolean)!.userId });
      expect(await auth.findSession(winner, expiresAt)).toBeNull();
      expect(await auth.latestOtp(SESSION, '09151234567')).toMatchObject({ id: issued!.id, consumedAt: now });
      // کد فقط در همان مرورگری که خواستش: نشست ناشناس دیگر کدی نمی‌بیند.
      expect(await auth.latestOtp('d'.repeat(64), '09151234567')).toBeNull();
      expect(await auth.revokeSession(winner, now)).toBe(true);
      expect(await auth.revokeSession(winner, now)).toBe(false);
      expect(await auth.findSession(winner, now)).toBeNull();
    });

    /** سفارش همان‌طور که سرویس می‌سازد: قیمت `quote()` با بخش‌های سرور و یک قاعده برای کل جزوه. */
    async function newOrder(over: Partial<NewOrder> = {}): Promise<NewOrder> {
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: MOBILE })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const sections = [
        { documentId: docIds[0]!, pageCount: 48 },
        { documentId: docIds[1]!, pageCount: 54 },
      ];
      const rules = [{ pageRanges: [[1, 102]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const breakdown = quote(
        {
          items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }],
          shipping: { methodId: 'post', zoneId: 'tehran' },
        },
        SEED_PRICE_LIST,
      );
      return {
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: { totalRials: breakdown.totalRials },
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: 'tehran',
        provinceId: 8,
        cityId: 394,
        recipientName: 'سارا احمدی',
        recipientPhone: MOBILE,
        addressText: 'تهران، خیابان ولیعصر، پلاک 12',
        postalCode: null,
        items: [{ pageCount: 102, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear', sections, rules }],
        ...over,
      };
    }

    it('سفارش کامل در یک تراکنش: قلم، بخش‌ها با نام فایل، قاعده و رویداد', async () => {
      const store = createOrderStore(conn);
      const { order, created } = await store.createOrder(await newOrder());
      expect(created).toBe(true);
      expect(order).toMatchObject({ status: 'awaiting_payment', totalRials: 3_377_000, shippingRials: 1_295_000 });
      expect(order.orderNumber).toBeGreaterThanOrEqual(10_001);

      const details = await store.details(order.publicToken);
      expect(details!.items).toEqual([
        expect.objectContaining({
          seq: 1,
          pageCount: 102,
          paperSize: 'a4',
          sections: [
            expect.objectContaining({ seq: 1, documentId: docIds[0], pageCount: 48, originalName: 'جلسه 48.pdf' }),
            expect.objectContaining({ seq: 2, documentId: docIds[1], pageCount: 54, originalName: 'جلسه 54.pdf' }),
          ],
          rules: [expect.objectContaining({ seq: 1, pageRanges: [[1, 102]], colorMode: 'bw' })],
        }),
      ]);
      expect(details!.payments).toEqual([]);
      const events = await conn.db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, order.id));
      expect(events).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'awaiting_payment', actor: 'user' })]);
      expect(await store.details(randomUUID())).toBeNull();
    });

    it('اندازهٔ کاغذ هر جزوه همان که سرویس داد ذخیره می‌شود (۸٫۳)', async () => {
      const store = createOrderStore(conn);
      const input = await newOrder();
      const { order } = await store.createOrder({ ...input, items: [{ ...input.items[0]!, paperSize: 'a5' }] });
      const [row] = await conn.db.select({ paperSize: orderItems.paperSize }).from(orderItems).where(eq(orderItems.orderId, order.id));
      expect(row).toEqual({ paperSize: 'a5' });
    });

    it('یک کلید، یک سفارش: دو «پرداخت» هم‌زمان با یک کلید، دومی همان سفارش را می‌گیرد', async () => {
      const store = createOrderStore(conn);
      const input = await newOrder();
      const [a, b] = await Promise.all([store.createOrder(input), store.createOrder(input)]);
      expect([a.created, b.created].sort()).toEqual([false, true]);
      expect(a.order.id).toBe(b.order.id);
      expect(await store.findByCheckoutKey(input.checkoutKey)).toMatchObject({ id: a.order.id });
      const rows = await conn.db.select().from(orders).where(eq(orders.checkoutKey, input.checkoutKey));
      expect(rows).toHaveLength(1);
    });

    it('سفارشی که پوشش صفحه‌اش غلط است هیچ ردی نمی‌گذارد: همه یا هیچ', async () => {
      const store = createOrderStore(conn);
      const input = await newOrder();
      const broken = { ...input, items: [{ ...input.items[0]!, rules: [{ ...input.items[0]!.rules[0]!, pageRanges: [[1, 101]] as [number, number][] }] }] };
      expect(await rejectedConstraint(store.createOrder(broken))).toBe('order_items_cover_pages');
      expect(await store.findByCheckoutKey(input.checkoutKey)).toBeNull();
    });

    it('سندهای سفارش: مالک، وضعیت و شمارش سرور؛ سندی که در سفارش است شناخته می‌شود', async () => {
      const store = createOrderStore(conn);
      const rows = await store.documents([docIds[0]!, randomUUID()]);
      expect(rows).toEqual([
        expect.objectContaining({ id: docIds[0], sessionHash: SESSION, status: 'ready', pageCount: 48, fileDeletedAt: null }),
      ]);
      expect(await store.documents([])).toEqual([]);
      // «انصراف» آپلود فایل سندی را که در سفارش است پاک نمی‌کند (`uploads.ts`).
      const documentsStore = createDocumentStore(conn);
      expect(await documentsStore.inOrder(docIds[0]!)).toBe(true);
      expect(await documentsStore.inOrder(randomUUID())).toBe(false);
    });

    it('برگشت از درگاه: موفق در یک تراکنش — پرداخت، سفارش، رویداد، و کارهای prepare_order و prepare_ticket', async () => {
      const store = createOrderStore(conn);
      const { order } = await store.createOrder(await newOrder());
      const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
      await store.insertPayment({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority, raw: null });
      expect(await store.recordMockDecision(authority, 'success', new Date())).toBe(true);
      expect(await store.recordMockDecision(authority, 'failure', new Date())).toBe(false);
      const found = await store.gatewayPayment('mock', authority);
      expect(found).toMatchObject({ payment: { raw: { decision: 'success' } }, order: { id: order.id } });

      const paidAt = new Date();
      const due = new Date(paidAt.getTime() + 2 * 86_400_000);
      const settled = await store.settlePayment('mock', authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask: null,
        raw: { decision: 'success' },
        paidAt,
        postHandoffDueAt: due,
      }));
      expect(settled).toMatchObject({ settled: true, payment: { status: 'succeeded', refId: '803114' }, order: { status: 'paid' } });
      expect(settled!.order.postHandoffDueAt).toEqual(due);
      const queued = await conn.db.select().from(jobs).where(eq(jobs.orderId, order.id)).orderBy(jobs.kind);
      // برگهٔ سفارش کار جدای خودش را دارد (برش ۵٫۱، ADR-043): شکستش PDF جزوه را «ساخته نشد» نمی‌کند.
      expect(queued).toEqual([
        expect.objectContaining({ kind: PREPARE_ORDER_JOB, status: 'queued', documentId: null }),
        expect.objectContaining({ kind: PREPARE_TICKET_JOB, status: 'queued', documentId: null }),
      ]);
      const events = await conn.db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, order.id));
      expect(events.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
        [null, 'awaiting_payment', 'user'],
        ['awaiting_payment', 'paid', 'gateway'],
      ]);

      // برگشت تکراری: درگاه دوباره سنجیده نمی‌شود و چیزی عوض نمی‌شود.
      let asked = 0;
      const again = await store.settlePayment('mock', authority, async () => {
        asked += 1;
        return { kind: 'failed', code: 'cancelled', raw: null };
      });
      expect(again).toMatchObject({ settled: false, payment: { status: 'succeeded' } });
      expect(asked).toBe(0);
      expect(await store.settlePayment('zarinpal', authority, async () => ({ kind: 'failed', code: 'x', raw: null }))).toBeNull();
    });

    it('دو برگشت هم‌زمان از یک پرداخت: درگاه یک بار سنجیده می‌شود', async () => {
      const store = createOrderStore(conn);
      const { order } = await store.createOrder(await newOrder());
      const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
      await store.insertPayment({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority, raw: null });
      let asked = 0;
      const decide = async ({ payment }: { payment: { amountRials: number } }) => {
        asked += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        const paidAt = new Date();
        return { kind: 'succeeded' as const, refId: '1', cardMask: null, verifiedAmountRials: payment.amountRials, raw: null, paidAt, postHandoffDueAt: paidAt };
      };
      const results = await Promise.all([store.settlePayment('mock', authority, decide), store.settlePayment('mock', authority, decide)]);
      expect(asked).toBe(1);
      expect(results.map((r) => r!.settled).sort()).toEqual([false, true]);
    });

    it('دو پرداخت موفق برای یک سفارش ممکن نیست؛ ناموفق سفارش را دست نمی‌زند', async () => {
      const store = createOrderStore(conn);
      const { order } = await store.createOrder(await newOrder());
      const authorities = [1, 2, 3].map(() => `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`);
      for (const authority of authorities) {
        await store.insertPayment({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority, raw: null });
      }
      const failed = await store.settlePayment('mock', authorities[0]!, async () => ({ kind: 'failed', code: 'declined', raw: { decision: 'failure' } }));
      expect(failed).toMatchObject({ settled: true, payment: { status: 'failed', failureCode: 'declined' }, order: { status: 'awaiting_payment' } });
      const success = async ({ payment }: { payment: { amountRials: number } }) => {
        const paidAt = new Date();
        return { kind: 'succeeded' as const, refId: '2', cardMask: null, verifiedAmountRials: payment.amountRials, raw: null, paidAt, postHandoffDueAt: paidAt };
      };
      await store.settlePayment('mock', authorities[1]!, success);
      expect(await rejectedConstraint(store.settlePayment('mock', authorities[2]!, success))).toBe('payments_one_success');
      const details = await store.details(order.publicToken);
      expect(details!.payments.map((p) => p.status).sort()).toEqual(['failed', 'pending', 'succeeded']);
    });

    /* ── پیامک پرداخت از صف (برش ۷٫۱، ADR-049) ── */

    const paidSmsOf = (phone = MOBILE) =>
      conn.db
        .select()
        .from(smsMessages)
        .where(and(eq(smsMessages.toMobile, phone), eq(smsMessages.purpose, 'order_paid')))
        .orderBy(smsMessages.id);

    /** سفارش با یک تلاش پرداخت در انتظار. */
    async function pendingPayment() {
      const store = createOrderStore(conn);
      const { order } = await store.createOrder(await newOrder());
      const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
      const payment = await store.insertPayment({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority, raw: null });
      return { store, order, authority, payment };
    }

    const succeed = (paidAt: Date, due: Date) => async ({ payment }: { payment: { amountRials: number } }) => ({
      kind: 'succeeded' as const,
      verifiedAmountRials: payment.amountRials,
      refId: '803114',
      cardMask: null,
      raw: null,
      paidAt,
      postHandoffDueAt: due,
    });

    it('پرداخت موفق پیامک پرداخت «منتظر» را در همان تراکنش می‌نویسد و وصل می‌کند؛ برگشت تکراری و ناموفق هیچ', async () => {
      const before = (await paidSmsOf()).length;
      const { store, order, authority } = await pendingPayment();
      const paidAt = new Date();
      const due = new Date(paidAt.getTime() + 2 * 86_400_000);
      const settled = await store.settlePayment('mock', authority, succeed(paidAt, due));
      expect(settled!.smsId).toEqual(expect.any(Number));
      const rows = await paidSmsOf();
      expect(rows).toHaveLength(before + 1);
      const row = rows.at(-1)!;
      const day = formatDeadlineDay(due);
      expect(row).toMatchObject({
        id: settled!.smsId,
        provider: 'queued',
        status: 'pending',
        attempts: 0,
        body: orderPaidText(order.orderNumber, day),
        params: [String(order.orderNumber), day],
        cost: null,
      });
      expect(settled!.payment.smsMessageId).toBe(settled!.smsId);
      // برگشت تکراری پیامک دوم نمی‌سازد.
      const again = await store.settlePayment('mock', authority, succeed(paidAt, due));
      expect(again).toMatchObject({ settled: false, smsId: null });
      expect(await paidSmsOf()).toHaveLength(before + 1);
      // ناموفق پیامکی ندارد.
      const other = await pendingPayment();
      const failed = await other.store.settlePayment('mock', other.authority, async () => ({ kind: 'failed', code: 'cancelled', raw: null }));
      expect(failed).toMatchObject({ settled: true, smsId: null, payment: { status: 'failed', smsMessageId: null } });
      expect(await paidSmsOf()).toHaveLength(before + 1);
    });

    it('فرستادن پیامک پرداخت بعد از commit، یک بار؛ هزینهٔ sms.ir می‌ماند؛ «دوباره بفرست» فقط نرفته، و سفارش لغوشده نه', async () => {
      const { store, order, authority } = await pendingPayment();
      const paidAt = new Date();
      const settled = await store.settlePayment('mock', authority, succeed(paidAt, new Date(paidAt.getTime() + 86_400_000)));
      const smsId = settled!.smsId!;
      const real: SmsTransport = { name: 'smsir', send: async () => ({ status: 'sent', providerMessageId: '880000123', cost: 2.5 }) };
      const down: SmsTransport = { name: 'smsir', send: () => Promise.reject(new Error('down')) };
      // اول نرفت: «نرفت» با علت؛ ردیف به همان پرداخت وصل می‌ماند.
      const [first] = await deliverQueued({ outbox: createSmsOutbox(conn, 'smsir'), transport: down, log: () => {} }, [smsId]);
      expect(first).toMatchObject({ outcome: 'failed', tag: 'unavailable' });
      expect((await paidSmsOf()).find((r) => r.id === smsId)).toMatchObject({ status: 'failed', error: 'unavailable', attempts: 1 });
      // دو «دوباره بفرست» هم‌زمان: یکی، با شناسه و هزینهٔ sms.ir.
      const both = await Promise.all([
        deliverQueued({ outbox: createSmsOutbox(conn, 'smsir'), transport: real }, [smsId], { mode: 'retry' }),
        deliverQueued({ outbox: createSmsOutbox(conn, 'smsir'), transport: real }, [smsId], { mode: 'retry' }),
      ]);
      expect(both.map((d) => d[0]!.outcome).sort()).toEqual(['sent', 'skipped']);
      expect((await paidSmsOf()).find((r) => r.id === smsId)).toMatchObject({
        status: 'sent',
        provider: 'smsir',
        providerMessageId: '880000123',
        cost: '2.5',
        attempts: 2,
        error: null,
      });
      // «رفت» پایان است.
      expect((await deliverQueued({ outbox: createSmsOutbox(conn, 'smsir'), transport: real }, [smsId], { mode: 'retry' }))[0]!.outcome).toBe('skipped');

      // سفارش لغوشده: پیامک پرداختش دیگر زنده نیست؛ نه فرستنده برش می‌دارد و نه پایگاه داده. شاهد: همان پس از برگرداندن لغو.
      const second = await pendingPayment();
      const paid = await second.store.settlePayment('mock', second.authority, succeed(paidAt, paidAt));
      const secondSms = paid!.smsId!;
      await conn.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, second.order.id));
      expect((await deliverQueued({ outbox: createSmsOutbox(conn, 'smsir'), transport: real }, [secondSms]))[0]!.outcome).toBe('skipped');
      expect(
        await rejectedConstraint(
          conn.db.update(smsMessages).set({ status: 'sending', attempts: 1, attemptedAt: new Date() }).where(eq(smsMessages.id, secondSms)),
        ),
      ).toBe('sms_messages_live');
      await conn.db.update(orders).set({ status: 'paid' }).where(eq(orders.id, second.order.id));
      expect((await deliverQueued({ outbox: createSmsOutbox(conn, 'console'), transport: consoleTransport(() => {}) }, [secondSms]))[0]!.outcome).toBe('sent');
      expect(order.id).not.toBe(second.order.id);
    });

    it('محافظ‌های پیامک پرداخت (0027، 0028)، هر کدام با شاهدش', async () => {
      const { order, payment } = await pendingPayment();
      const queued = (over: Partial<typeof smsMessages.$inferInsert> = {}) =>
        conn.db
          .insert(smsMessages)
          .values({
            provider: 'queued',
            toMobile: MOBILE,
            purpose: 'order_paid',
            body: 'جزوه‌یار: سفارش',
            params: ['1', 'شنبه'],
            status: 'pending',
            ...over,
          })
          .returning({ id: smsMessages.id })
          .then((rows) => rows[0]!.id);
      const succeedWith = (smsMessageId: number | null) =>
        conn.db
          .update(payments)
          .set({ status: 'succeeded', refId: '1', verifiedAt: new Date(), verifiedAmountRials: order.totalRials, smsMessageId })
          .where(eq(payments.id, payment.id));

      // `payments_sms`: تلاش تازه بی پیامک درج می‌شود (شاهد: همان درج بی پیامک، `insertPayment` بالا).
      const loose = await queued();
      expect(
        await rejectedConstraint(
          conn.db.insert(payments).values({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority: `X${randomUUID()}`, smsMessageId: loose }),
        ),
      ).toBe('payments_sms');
      // «موفق» بی پیامک نه؛ پیامک رهگیری، شمارهٔ دیگر یا ردیفی که رفته هم نه.
      expect(await rejectedConstraint(succeedWith(null))).toBe('payments_sms');
      expect(await rejectedConstraint(succeedWith(await queued({ purpose: 'tracking', params: ['1', '1'.repeat(24)] })))).toBe('payments_sms');
      expect(await rejectedConstraint(succeedWith(await queued({ toMobile: '09351234567' })))).toBe('payments_sms');
      expect(await rejectedConstraint(succeedWith(await queued({ status: 'failed', provider: 'smsir' })))).toBe('payments_sms');
      // شاهد: همان گذار با ردیف تازهٔ منتظر همین سفارش می‌نشیند.
      await succeedWith(loose);
      // پس از آن پیامک پرداخت عوض نمی‌شود، حتی به ردیف تازهٔ درست.
      expect(await rejectedConstraint(conn.db.update(payments).set({ smsMessageId: await queued() }).where(eq(payments.id, payment.id)))).toBe(
        'payments_sms',
      );
      // یک پیامک برای هر پرداخت: ردیف همین پرداخت به پرداخت موفق دیگری وصل نمی‌شود (شاخص یکتای `payments_sms`).
      const other = await pendingPayment();
      expect(
        await rejectedConstraint(
          conn.db
            .update(payments)
            .set({ status: 'succeeded', refId: '2', verifiedAt: new Date(), verifiedAmountRials: other.order.totalRials, smsMessageId: loose })
            .where(eq(payments.id, other.payment.id)),
        ),
      ).toBe('payments_sms');

      // `sms_messages_queued`: منتظر فقط پرداخت و رهگیری، با متن (شاهد: `queued()` بالا).
      expect(await rejectedConstraint(queued({ purpose: 'otp', provider: 'console', params: null }))).toBe('sms_messages_queued');
      expect(await rejectedConstraint(queued({ body: null }))).toBe('sms_messages_queued');
      // `sms_messages_otp_secret`: کد با پنل واقعی بی متن و پارامتر؛ کنسولی با متن (شاهد).
      const otp = (over: Partial<typeof smsMessages.$inferInsert>) =>
        conn.db.insert(smsMessages).values({ provider: 'smsir', toMobile: MOBILE, purpose: 'otp', body: null, status: 'sent', ...over });
      expect(await rejectedConstraint(otp({ body: 'کد تأیید جزوه‌یار: 12345' }))).toBe('sms_messages_otp_secret');
      expect(await rejectedConstraint(otp({ params: ['12345'] }))).toBe('sms_messages_otp_secret');
      expect(await rejectedConstraint(otp({}))).toBeUndefined();
      expect(await rejectedConstraint(otp({ provider: 'console', status: 'logged', body: 'کد تأیید جزوه‌یار: 12345' }))).toBeUndefined();
      // `sms_messages_cost`: هزینهٔ منفی نه؛ صفر (شاهد).
      expect(await rejectedConstraint(otp({ cost: '-1' }))).toBe('sms_messages_cost');
      expect(await rejectedConstraint(otp({ cost: '0' }))).toBeUndefined();
      // `sms_messages_frozen`: پیامک کد پس از درج عوض نمی‌شود.
      const [sentOtp] = await conn.db.select({ id: smsMessages.id }).from(smsMessages).where(and(eq(smsMessages.purpose, 'otp'), eq(smsMessages.provider, 'smsir'))).limit(1);
      expect(await rejectedConstraint(conn.db.update(smsMessages).set({ status: 'failed' }).where(eq(smsMessages.id, sentOtp!.id)))).toBe(
        'sms_messages_frozen',
      );
      // `sms_messages_live`: ردیف منتظری که به هیچ پرداخت موفقی وصل نیست برداشته نمی‌شود (شاهد: همان ردیف وصل‌شده، بالا).
      const orphan = await queued();
      expect(
        await rejectedConstraint(
          conn.db.update(smsMessages).set({ status: 'sending', attempts: 1, attemptedAt: new Date() }).where(eq(smsMessages.id, orphan)),
        ),
      ).toBe('sms_messages_live');
      // `sms_messages_flow`: برداشتن هزینه نمی‌گذارد (شاهد: همان برداشتن بی هزینه)؛ هزینه فقط با «رفت»؛ «نرفت» با هزینه نه (شاهد: «رفت» با هزینه).
      expect(
        await rejectedConstraint(
          conn.db.update(smsMessages).set({ status: 'sending', attempts: 1, attemptedAt: new Date(), cost: '1' }).where(eq(smsMessages.id, loose)),
        ),
      ).toBe('sms_messages_flow');
      await conn.db.update(smsMessages).set({ status: 'sending', attempts: 1, attemptedAt: new Date() }).where(eq(smsMessages.id, loose));
      expect(
        await rejectedConstraint(conn.db.update(smsMessages).set({ status: 'failed', cost: '1' }).where(eq(smsMessages.id, loose))),
      ).toBe('sms_messages_flow');
      expect(
        await rejectedConstraint(conn.db.update(smsMessages).set({ status: 'sent', sentAt: new Date(), cost: '1' }).where(eq(smsMessages.id, loose))),
      ).toBeUndefined();
    });

    it('پنل (۷٫۱): پیامک پرداخت در کارت پرداخت‌ها، «دوباره بفرست» با محدوده، و هشدار پیشخوان برای پیامکی که نرفت', async () => {
      const { store, order, authority, payment } = await pendingPayment();
      const paidAt = new Date();
      const settled = await store.settlePayment('mock', authority, succeed(paidAt, new Date(paidAt.getTime() + 86_400_000)));
      const panel = createPanelOrderStore(conn);
      const details = await panel.details(ALL_ORDERS, order.orderNumber);
      expect(details!.payments.map((p) => [p.id, p.status, p.sms?.id, p.sms?.status])).toEqual([[payment.id, 'succeeded', settled!.smsId, 'pending']]);
      expect(await panel.paymentSms(ALL_ORDERS, payment.id)).toMatchObject({
        orderNumber: order.orderNumber,
        orderStatus: 'paid',
        sms: { id: settled!.smsId, toMobile: MOBILE, status: 'pending' },
      });
      // بیرون از محدودهٔ چاپخانهٔ دیگر: همان «نیست».
      expect(await panel.paymentSms({ kind: 'partner', partnerId: randomUUID() }, payment.id)).toBeNull();
      expect(await panel.paymentSms(ALL_ORDERS, randomUUID())).toBeNull();

      const clock = (at: Date) => ({
        at,
        staleBefore: new Date(at.getTime() + 3_600_000),
        unreturnedBefore: new Date(at.getTime() - 30 * 60_000),
        untrackedSince: new Date(at.getTime() - 45 * 86_400_000),
      });
      // منتظرِ تازه هشدار نیست؛ منتظری که ماند هست (فرستنده افتاد)؛ «نرفت» هست؛ «رفت» نه.
      expect((await panel.alerts(ALL_ORDERS, clock(new Date()))).paidSmsFailed).not.toContain(order.orderNumber);
      const later = new Date(Date.now() + SMS_STUCK_MS + 60_000);
      expect((await panel.alerts(ALL_ORDERS, clock(later))).paidSmsFailed).toContain(order.orderNumber);
      await deliverQueued(
        { outbox: createSmsOutbox(conn, 'smsir'), transport: { name: 'smsir', send: () => Promise.reject(new Error('down')) }, log: () => {} },
        [settled!.smsId!],
      );
      expect((await panel.alerts(ALL_ORDERS, clock(new Date()))).paidSmsFailed).toContain(order.orderNumber);
      // سفارش لغوشده دیگر هشدار نیست (پیامک پرداختش هم دیگر زنده نیست).
      await conn.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id));
      expect((await panel.alerts(ALL_ORDERS, clock(new Date()))).paidSmsFailed).not.toContain(order.orderNumber);
      await conn.db.update(orders).set({ status: 'paid' }).where(eq(orders.id, order.id));
      await deliverQueued({ outbox: createSmsOutbox(conn, 'console'), transport: consoleTransport(() => {}) }, [settled!.smsId!], { mode: 'retry' });
      expect((await panel.alerts(ALL_ORDERS, clock(new Date()))).paidSmsFailed).not.toContain(order.orderNumber);
    });

    it('آمار پیامک و کد برای پنل (۷٫۱): کد ساعت و ۲۴ ساعت، نخستین لحظهٔ پر شدن سقف امروز، و هزینهٔ پیامک‌های پذیرفته', async () => {
      await conn.db.delete(otpRequests);
      const stats = createSmsStats(conn);
      const now = Date.now();
      const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
      const insert = (createdAt: Date) =>
        conn.db.insert(otpRequests).values({ mobile: MOBILE, codeHash: 'f'.repeat(64), sessionHash: SESSION, ipHash: 'ip', createdAt, expiresAt: createdAt });
      for (const minutes of [30 * 60, 20 * 60, 90, 50, 40, 10]) await insert(at(minutes));
      expect(await stats.otpUsage(new Date(now))).toEqual({ hour: 3, day: 5, hourOldest: at(50), dayOldest: at(20 * 60) });
      // سقف ساعتی ۳: کد ۴۰ دقیقه پیش سومین کد ساعت پیش از خودش بود (۹۰، ۵۰ و ۴۰)؛ ۲۴ ساعته ۵ با کد ۱۰ دقیقه پیش؛ ۴ و ۶ هرگز.
      const since = at(24 * 60);
      expect(await stats.otpCapReached({ since, hourLimit: 3, dayLimit: 5 })).toEqual({ hourAt: at(40), dayAt: at(10) });
      expect(await stats.otpCapReached({ since, hourLimit: 4, dayLimit: 6 })).toEqual({ hourAt: null, dayAt: null });
      // شاهد «از آغاز امروز»: همان پر شدن پیش از `since` شمرده نمی‌شود.
      expect(await stats.otpCapReached({ since: at(5), hourLimit: 3, dayLimit: 5 })).toEqual({ hourAt: null, dayAt: null });

      const before = await stats.smsCost(at(7 * 24 * 60));
      await conn.db.insert(smsMessages).values([
        { provider: 'smsir', toMobile: MOBILE, purpose: 'otp', status: 'sent', cost: '2.5', sentAt: at(60) },
        { provider: 'smsir', toMobile: MOBILE, purpose: 'otp', status: 'sent', cost: '1.5', sentAt: at(8 * 24 * 60) },
        { provider: 'smsir', toMobile: MOBILE, purpose: 'otp', status: 'failed' },
        { provider: 'console', toMobile: MOBILE, purpose: 'otp', body: 'x', status: 'logged', sentAt: at(60) },
      ]);
      const after = await stats.smsCost(at(7 * 24 * 60));
      expect([after.cost - before.cost, after.count - before.count]).toEqual([2.5, 1]);
    });

    it('سفارش در انتظاری که فایلش رفت منقضی می‌شود؛ پرداخت‌شده نه', async () => {
      const store = createOrderStore(conn);
      const { order } = await store.createOrder(await newOrder());
      expect(await store.expireOrder(order.id, new Date())).toBe(true);
      expect(await store.expireOrder(order.id, new Date())).toBe(false);
      const [row] = await conn.db.select().from(orders).where(eq(orders.id, order.id));
      expect(row!.status).toBe('expired');
      const events = await conn.db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, order.id));
      expect(events.at(-1)).toMatchObject({ fromStatus: 'awaiting_payment', toStatus: 'expired', actor: 'system' });
    });

    it('پیامک کنسولی با متن کامل در sms_messages می‌نشیند', async () => {
      await createSmsLog(conn).insert({ provider: 'console', toMobile: MOBILE, purpose: 'otp', body: 'کد تأیید جزوه‌یار: 04821', status: 'logged' });
      // پرداخت‌های همین بخش پیامک پرداخت منتظر، و محافظ‌های ۷٫۱ پیامک کد، هم به همین شماره دارند.
      const [row] = await conn.db
        .select()
        .from(smsMessages)
        .where(and(eq(smsMessages.toMobile, MOBILE), eq(smsMessages.purpose, 'otp'), eq(smsMessages.body, 'کد تأیید جزوه‌یار: 04821')));
      expect(row).toMatchObject({ provider: 'console', purpose: 'otp', status: 'logged', body: 'کد تأیید جزوه‌یار: 04821' });
    });

    it('تنظیم سقف کد کل سایت پیش‌فرض دارد', async () => {
      const [row] = await conn.db.select().from(settings).where(eq(settings.key, 'otp.site_hourly_limit'));
      expect(row!.value).toBe(300);
    });

    /* ── درگاه زیبال (برش ۷٫۲، ADR-050) ── */

    describe('درگاه زیبال: محافظ‌های payments و برگشت زیر قفل (برش ۷٫۲)', () => {
      const MERCHANT = 'mock-merchant-integration-71';
      let zibal: ZibalMock;
      let zibalUrl = '';
      let gateways: Record<string, PaymentGateway>;

      beforeAll(async () => {
        zibal = createZibalMock({ merchants: [MERCHANT] });
        zibalUrl = await zibal.listen();
        gateways = { zibal: zibalGateway({ baseUrl: zibalUrl, merchant: async () => MERCHANT }) };
      });

      afterAll(() => zibal.close());

      beforeEach(() => {
        zibal.configure({ omit: [], fail: null, delayMs: 0, drop: 0, reverseAfterMs: null, ipRejected: false });
      });

      const store = () => createOrderStore(conn);
      const payOnZibal = (trackId: string, outcome = 'success') =>
        fetch(`${zibalUrl}/__mock/pay`, { method: 'POST', body: JSON.stringify({ trackId, outcome }) });
      const verifiedAtZibal = (trackId: string) => zibal.state.transactions.get(Number(trackId))!.status === 1;

      /** سفارش تازه با یک تلاش زیبال که واقعاً از زیبال ساختگی شروع شده، همان شکل `startPayment` وب. */
      async function zibalAttempt(over: { amountRials?: number; createdAt?: Date; orderId?: string } = {}) {
        const s = store();
        const { order } = over.orderId
          ? { order: (await conn.db.select().from(orders).where(eq(orders.id, over.orderId)))[0]! }
          : await s.createOrder(await newOrder());
        const id = randomUUID();
        const gatewayOrderId = `${order.orderNumber}-${id.slice(0, 8)}`;
        const started = await gateways.zibal!.start({
          amountRials: over.amountRials ?? order.totalRials,
          callbackUrl: `https://jozveyar.com/pay/callback/${'0'.repeat(32)}`,
          orderId: gatewayOrderId,
          description: `سفارش ${order.orderNumber} جزوه‌یار`,
        });
        await conn.db.insert(payments).values({
          id,
          orderId: order.id,
          provider: 'zibal',
          amountRials: order.totalRials,
          authority: started.authority,
          gatewayOrderId,
          raw: started.raw as object,
          ...(over.createdAt ? { createdAt: over.createdAt } : {}),
        });
        const [payment] = await conn.db.select().from(payments).where(eq(payments.id, id));
        return { order, payment: payment!, trackId: started.authority };
      }

      const settle = (lookup: Parameters<typeof settleWith>[0]['lookup'], over: Partial<Parameters<typeof settleWith>[0]> = {}) =>
        settleWith({ store: store(), lookup, gateways, via: 'callback', now: () => new Date(), ...over });

      it('`payments_amount_is_total`: مبلغ تلاش در درج همان جمع منجمد سفارش (شاهد: همان درج با جمع)', async () => {
        const { order } = await store().createOrder(await newOrder());
        const insert = (amountRials: number) =>
          conn.db.insert(payments).values({ orderId: order.id, provider: 'mock', amountRials, authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}` });
        expect(await rejectedConstraint(insert(order.totalRials - 10))).toBe('payments_amount_is_total');
        expect(await rejectedConstraint(insert(order.totalRials * 10))).toBe('payments_amount_is_total');
        await insert(order.totalRials);
      });

      it('`payments_frozen`: سفارش، درگاه، مبلغ، شناسه‌ها، کلید برگشت و زمان ساختن پس از درج؛ «نخستین برگشت» یک بار', async () => {
        const { payment } = await zibalAttempt();
        const { order: other } = await store().createOrder(await newOrder());
        const update = (patch: Partial<typeof payments.$inferInsert>) => conn.db.update(payments).set(patch).where(eq(payments.id, payment.id));
        for (const patch of [
          { amountRials: payment.amountRials + 1 },
          { authority: '3714999999' },
          { provider: 'mock', gatewayOrderId: null },
          { orderId: other.id },
          { gatewayOrderId: '99999-aaaaaaaa' },
          { returnKey: 'f'.repeat(32) },
          { createdAt: new Date(payment.createdAt.getTime() - 3_600_000) },
        ] satisfies Partial<typeof payments.$inferInsert>[]) {
          expect(await rejectedConstraint(update(patch)), JSON.stringify(Object.keys(patch))).toBe('payments_frozen');
        }
        // شاهد: آنچه از درگاه دانستیم و نخستین برگشت عوض‌شدنی است، ولی برگشت فقط یک بار.
        const first = new Date();
        await update({ gatewayStatus: -1, gatewayCheckedAt: first, returnedAt: first });
        expect(await rejectedConstraint(update({ returnedAt: new Date(first.getTime() + 1000) }))).toBe('payments_frozen');
        expect(await rejectedConstraint(update({ returnedAt: null }))).toBe('payments_frozen');
      });

      it('`payments_flow` و تلاش بسته: گذار فقط از «در انتظار»؛ پس از آن فقط آنچه از درگاه دانستیم', async () => {
        const failed = await zibalAttempt();
        const update = (id: string, patch: Partial<typeof payments.$inferInsert>) => conn.db.update(payments).set(patch).where(eq(payments.id, id));
        // شاهد: در انتظار ← ناموفق می‌نشیند.
        await update(failed.payment.id, { status: 'failed', failureCode: 'cancelled', settledVia: 'callback' });
        const verified = { refId: '1', verifiedAt: new Date(), verifiedAmountRials: failed.payment.amountRials };
        expect(await rejectedConstraint(update(failed.payment.id, { status: 'succeeded', ...verified }))).toBe('payments_flow');
        expect(await rejectedConstraint(update(failed.payment.id, { status: 'pending' }))).toBe('payments_flow');
        for (const patch of [{ failureCode: 'declined' }, { raw: { x: 1 } }, { cardMask: '6037' }, { settledVia: 'auto' }, { refId: '2' }] as const) {
          expect(await rejectedConstraint(update(failed.payment.id, patch)), Object.keys(patch)[0]).toBe('payments_frozen');
        }
        // پول پرداخت دوم تا «ریورس‌شده» پاییده می‌شود: وضعیت درگاه تلاش بسته عوض‌شدنی است.
        await update(failed.payment.id, { gatewayStatus: 18, gatewayError: null, gatewayCheckedAt: new Date() });
        // موفق هم بسته است.
        const paid = await zibalAttempt();
        await payOnZibal(paid.trackId);
        expect((await settle({ paymentId: paid.payment.id, providers: ['zibal'] }))).toMatchObject({ settled: true, payment: { status: 'succeeded' } });
        expect(await rejectedConstraint(update(paid.payment.id, { status: 'failed', failureCode: 'cancelled' }))).toBe('payments_flow');
        expect(await rejectedConstraint(update(paid.payment.id, { verifiedAmountRials: 1 }))).toBe('payments_frozen');
      });

      it('`payments_success_amount`: موفق یعنی مبلغ تأییدشده برابر مبلغ؛ بی آن یا جز آن نه', async () => {
        const { order, payment } = await pendingPayment();
        const [sms] = await conn.db
          .insert(smsMessages)
          .values({ provider: 'queued', toMobile: MOBILE, purpose: 'order_paid', body: 'جزوه‌یار', params: ['1', 'شنبه'], status: 'pending' })
          .returning({ id: smsMessages.id });
        const succeed = (verifiedAmountRials: number | null) =>
          conn.db
            .update(payments)
            .set({ status: 'succeeded', refId: '1', verifiedAt: new Date(), verifiedAmountRials, smsMessageId: sms!.id })
            .where(eq(payments.id, payment.id));
        expect(await rejectedConstraint(succeed(null))).toBe('payments_success_amount');
        expect(await rejectedConstraint(succeed(order.totalRials - 1))).toBe('payments_success_amount');
        await succeed(order.totalRials);
      });

      it('کلید برگشت، شناسهٔ سفارش درگاه، علت و «چه بست»: شکل و یکتایی', async () => {
        const { order } = await store().createOrder(await newOrder());
        const base = { orderId: order.id, amountRials: order.totalRials };
        const authority = () => `${Math.floor(Math.random() * 1e9) + 1e9}`;
        expect(await rejectedConstraint(conn.db.insert(payments).values({ ...base, provider: 'mock', authority: authority(), returnKey: 'ABC' }))).toBe(
          'payments_return_key',
        );
        expect(await rejectedConstraint(conn.db.insert(payments).values({ ...base, provider: 'zibal', authority: authority() }))).toBe(
          'payments_gateway_order_id',
        );
        await conn.db.insert(payments).values({ ...base, provider: 'zibal', authority: authority(), gatewayOrderId: 'G-1', returnKey: 'a'.repeat(32) });
        expect(
          await rejectedConstraint(conn.db.insert(payments).values({ ...base, provider: 'zibal', authority: authority(), gatewayOrderId: 'G-1' })),
        ).toBe('payments_gateway_order');
        expect(
          await rejectedConstraint(conn.db.insert(payments).values({ ...base, provider: 'zibal', authority: authority(), gatewayOrderId: 'G-2', returnKey: 'a'.repeat(32) })),
        ).toBe('payments_return_key');
        // شاهد: همان شناسهٔ سفارش نزد درگاه دیگر.
        await conn.db.insert(payments).values({ ...base, provider: 'mock', authority: authority(), gatewayOrderId: 'G-1' });
        expect(
          await rejectedConstraint(conn.db.insert(payments).values({ ...base, provider: 'mock', authority: authority(), gatewayError: 'rejected:115 x' })),
        ).toBe('payments_gateway_error');
        expect(
          await rejectedConstraint(conn.db.insert(payments).values({ ...base, provider: 'mock', authority: authority(), settledVia: 'callback' })),
        ).toBe('payments_settled_via');
        await conn.db.insert(payments).values({ ...base, provider: 'mock', authority: authority(), gatewayError: 'rejected:115' });
      });

      it('برگشت با کلید: فقط درگاه‌های در کار (درگاه نمونه در live نه)، «نخستین برگشت»، و برگشت زودرس در انتظار می‌ماند', async () => {
        const { payment, trackId } = await zibalAttempt();
        expect(await settle({ returnKey: payment.returnKey, providers: ['mock'] })).toBeNull();
        expect(await settle({ returnKey: 'f'.repeat(32), providers: ['zibal'] })).toBeNull();
        const early = await settle({ returnKey: payment.returnKey, providers: ['zibal'] }, { returned: true });
        expect(early).toMatchObject({ settled: false, payment: { status: 'pending', gatewayStatus: -1, gatewayError: null } });
        const returnedAt = (early as { payment: { returnedAt: Date } }).payment.returnedAt;
        expect(returnedAt).toBeInstanceOf(Date);
        await payOnZibal(trackId);
        const done = await settle({ returnKey: payment.returnKey, providers: ['zibal'] }, { returned: true });
        expect(done).toMatchObject({
          settled: true,
          payment: { status: 'succeeded', settledVia: 'callback', gatewayStatus: 1, verifiedAmountRials: payment.amountRials, returnedAt },
          order: { status: 'paid' },
        });
        const row = (done as { payment: { refId: string; cardMask: string } }).payment;
        expect(row.refId).toMatch(/^\d+$/);
        expect(row.cardMask).toMatch(/^603799\*+1234$/);
        expect(verifiedAtZibal(trackId)).toBe(true);
      });

      it('دو برگشت هم‌زمان یک تلاش: یک verify، یکی موفق و دیگری همان نتیجه', async () => {
        const { payment, trackId } = await zibalAttempt();
        await payOnZibal(trackId);
        let verifies = 0;
        const counting: PaymentGateway = { ...gateways.zibal!, verify: async (attempt) => (verifies++, gateways.zibal!.verify(attempt)) };
        const both = await Promise.all(
          [1, 2].map(() => settleWith({ store: store(), lookup: { returnKey: payment.returnKey, providers: ['zibal'] }, gateways: { zibal: counting }, via: 'callback', now: () => new Date() })),
        );
        expect(verifies).toBe(1);
        expect(both.map((r) => (r as { settled: boolean }).settled).sort()).toEqual([false, true]);
      });

      it('برگشت و استعلام خودکار هم‌زمان: استعلام خودکار تلاش قفل‌شده را رها می‌کند (`busy`)، و verify یک بار', async () => {
        const { payment, trackId } = await zibalAttempt();
        await payOnZibal(trackId);
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let verifies = 0;
        const slow: PaymentGateway = {
          ...gateways.zibal!,
          inquire: async (attempt) => {
            await held;
            return gateways.zibal!.inquire(attempt);
          },
          verify: async (attempt) => (verifies++, gateways.zibal!.verify(attempt)),
        };
        const callback = settleWith({ store: store(), lookup: { returnKey: payment.returnKey, providers: ['zibal'] }, gateways: { zibal: slow }, via: 'callback', now: () => new Date() });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const auto = await settleWith({ store: store(), lookup: { paymentId: payment.id, providers: ['zibal'] }, gateways: { zibal: slow }, via: 'auto', now: () => new Date(), skipLocked: true });
        expect(auto).toBe('busy');
        release();
        expect(await callback).toMatchObject({ settled: true, payment: { status: 'succeeded', settledVia: 'callback' } });
        expect(verifies).toBe(1);
      });

      it('مبلغ درگاه ناهمخوان: ناموفق بی verify (شاهد: verify نخورده، پول خودکار برمی‌گردد)', async () => {
        const { payment, trackId } = await zibalAttempt({ amountRials: 1_234_000 });
        await payOnZibal(trackId);
        expect(await settle({ returnKey: payment.returnKey, providers: ['zibal'] })).toMatchObject({
          settled: true,
          payment: { status: 'failed', failureCode: 'amount_mismatch', gatewayStatus: 2, verifiedAmountRials: null },
          order: { status: 'awaiting_payment' },
        });
        expect(verifiedAtZibal(trackId)).toBe(false);
      });

      it('دو تلاش پرداخت‌شدهٔ یک سفارش: اولی موفق، دومی هرگز verify («سفارش پرداختنی نبود»، با کارت پوشیده)', async () => {
        const first = await zibalAttempt();
        const second = await zibalAttempt({ orderId: first.order.id });
        await payOnZibal(first.trackId);
        await payOnZibal(second.trackId);
        expect(await settle({ paymentId: first.payment.id, providers: ['zibal'] })).toMatchObject({ payment: { status: 'succeeded' } });
        expect(await settle({ returnKey: second.payment.returnKey, providers: ['zibal'] })).toMatchObject({
          payment: { status: 'failed', failureCode: 'order_not_payable', gatewayStatus: 2 },
        });
        expect((await conn.db.select().from(payments).where(eq(payments.id, second.payment.id)))[0]!.cardMask).toMatch(/1234$/);
        expect(verifiedAtZibal(second.trackId)).toBe(false);
      });

      it('مهلت ۱۰ دقیقه: پرداخت‌شده پس از مهلت ناموفق «مهلت گذشت» بی verify؛ تا خود مهلت پذیرفته', async () => {
        expect(PAYMENT_ATTEMPT_TTL_MS).toBe(10 * 60_000);
        const late = await zibalAttempt({ createdAt: new Date(Date.now() - PAYMENT_ATTEMPT_TTL_MS - 60_000) });
        await payOnZibal(late.trackId);
        expect(await settle({ paymentId: late.payment.id, providers: ['zibal'] }, { via: 'auto' })).toMatchObject({
          payment: { status: 'failed', failureCode: 'expired', gatewayStatus: 2, settledVia: 'auto' },
        });
        expect(verifiedAtZibal(late.trackId)).toBe(false);
        const edge = await zibalAttempt({ createdAt: new Date(Date.now() - PAYMENT_ATTEMPT_TTL_MS + 30_000) });
        await payOnZibal(edge.trackId);
        expect(await settle({ paymentId: edge.payment.id, providers: ['zibal'] })).toMatchObject({ payment: { status: 'succeeded' } });
      });

      it('زیبال جواب نداد: در انتظار با علت، نه ناموفق؛ IP (۱۱۵) هم', async () => {
        const { payment } = await zibalAttempt();
        zibal.configure({ fail: { http: 503, times: 1 } });
        expect(await settle({ paymentId: payment.id, providers: ['zibal'] })).toMatchObject({
          settled: false,
          payment: { status: 'pending', gatewayError: 'unavailable:503' },
        });
        zibal.configure({ ipRejected: true });
        expect(await settle({ paymentId: payment.id, providers: ['zibal'] })).toMatchObject({ payment: { status: 'pending', gatewayError: 'rejected:115' } });
      });

      it('فهرست استعلام خودکار و پاییدن پول پرداخت دوم تا «ریورس‌شده»', async () => {
        const at = new Date();
        const fresh = await zibalAttempt();
        const old = await zibalAttempt({ createdAt: new Date(at.getTime() - 3 * 60_000) });
        const ids = await store().pendingAttempts({
          providers: ['zibal'],
          createdBefore: new Date(at.getTime() - 2 * 60_000),
          checkedBefore: new Date(at.getTime() - 50_000),
          limit: 100,
        });
        expect(ids).toContain(old.payment.id);
        expect(ids).not.toContain(fresh.payment.id);
        expect(await store().pendingAttempts({ providers: [], createdBefore: at, checkedBefore: at, limit: 10 })).toEqual([]);
        // پرسیده‌شده در همین دقیقه دوباره نه.
        await store().recordGatewayCheck(old.payment.id, { status: -1, error: null, at });
        expect(
          await store().pendingAttempts({ providers: ['zibal'], createdBefore: at, checkedBefore: new Date(at.getTime() - 50_000), limit: 100 }),
        ).not.toContain(old.payment.id);

        // پرداخت دوم: پول نزد زیبال، تا ریورس.
        const first = await zibalAttempt();
        const second = await zibalAttempt({ orderId: first.order.id });
        await payOnZibal(first.trackId);
        await payOnZibal(second.trackId);
        await settle({ paymentId: first.payment.id, providers: ['zibal'] });
        await settle({ paymentId: second.payment.id, providers: ['zibal'] });
        const window = { providers: ['zibal'], createdAfter: new Date(at.getTime() - 3_600_000), checkedBefore: new Date(Date.now() + 1000), limit: 100 };
        const held = await store().heldAttempts(window);
        expect(held.map((p) => p.id)).toContain(second.payment.id);
        zibal.configure({ reverseAfterMs: 0 });
        const row = held.find((p) => p.id === second.payment.id)!;
        expect(await watchHeld({ store: store(), payment: row, gateway: gateways.zibal!, now: () => new Date() })).toBe(18);
        expect((await store().heldAttempts(window)).map((p) => p.id)).not.toContain(second.payment.id);
        const [after] = await conn.db.select().from(payments).where(eq(payments.id, second.payment.id));
        expect(after).toMatchObject({ status: 'failed', failureCode: 'order_not_payable', gatewayStatus: 18 });
      });

      it('پیشخوان: ردِ شروع تا اولین شروع یا «آزمایش» درست؛ مبلغ ناهمخوان، پولی که نزد درگاه است، تأییدشدهٔ بی‌استفاده، و بستهٔ خودکار امروز', async () => {
        const panel = createPanelOrderStore(conn);
        const clockAt = (at: Date): PanelClock => ({
          at,
          staleBefore: at,
          unreturnedBefore: at,
          untrackedSince: new Date(at.getTime() - 45 * 86_400_000),
          todayStart: new Date(at.getTime() - 3_600_000),
        });
        const alerts = () => panel.alerts(ALL_ORDERS, clockAt(new Date()));
        // «پس از» پیشخوان اکید است و `created_at` پایگاه داده میکروثانیه، ولی Date میلی‌ثانیه: در یک میلی‌ثانیه دو رویداد پشت‌سرهم
        // «پس از» هم نیستند، یا ردیف پیشین پایگاه داده «پس از» زمانی می‌افتد که بعدش ساخته شد. پس هر زمان این تست دو میلی‌ثانیه پس از
        // هر چه پیش‌تر نوشته شد.
        const tick = async () => {
          const from = Date.now();
          while (Date.now() < from + 2) await new Promise((resolve) => setTimeout(resolve, 1));
          return new Date();
        };
        const merchantCheck = async (action: string, detail: Record<string, unknown>) => {
          const at = await tick();
          await conn.db.insert(adminEvents).values({
            adminUserId: null,
            action,
            targetType: SERVICE_KEY_TARGET,
            targetId: 'PAYMENT_MERCHANT_ID',
            detail: { ...detail, name: 'PAYMENT_MERCHANT_ID' },
            at,
          });
        };

        // ردِ شروع (۱۱۵): رویداد سیستم روی سفارش، بی ادمین؛ پیشخوان تا اولین شروع موفق همان درگاه.
        const { order } = await store().createOrder(await newOrder());
        const rejectedAt = await tick();
        await store().recordGatewayRejection({ orderId: order.id, orderNumber: order.orderNumber, provider: 'zibal', result: 115, at: rejectedAt });
        const [event] = await conn.db.select().from(adminEvents).where(and(eq(adminEvents.action, 'payments.gateway_rejected'), eq(adminEvents.targetId, order.id)));
        expect(event).toMatchObject({ adminUserId: null, targetType: 'order', detail: { orderNumber: order.orderNumber, provider: 'zibal', result: 115 } });
        expect((await alerts()).gatewayRejected).toEqual({ at: rejectedAt, orderNumber: order.orderNumber, provider: 'zibal', result: 115, stage: 'start' });
        expect((await panel.alerts({ kind: 'partner', partnerId: randomUUID() }, clockAt(new Date()))).gatewayRejected).toBeNull();
        // شاهد: پرداخت درگاه دیگر پاکش نمی‌کند؛ شروع زیبال می‌کند.
        await pendingPayment();
        expect((await alerts()).gatewayRejected).not.toBeNull();
        await zibalAttempt();
        expect((await alerts()).gatewayRejected).toBeNull();

        // دوباره رد شد (کد پذیرنده)؛ «آزمایش» ردشده پاکش نمی‌کند، «آزمایش» یا ذخیرهٔ آزموده می‌کند.
        await store().recordGatewayRejection({ orderId: order.id, orderNumber: order.orderNumber, provider: 'zibal', result: 103, at: await tick() });
        expect((await alerts()).gatewayRejected).toMatchObject({ result: 103, orderNumber: order.orderNumber });
        await merchantCheck('settings.key_test', { subject: 'current', outcome: 'rejected', status: 115 });
        await merchantCheck('settings.key_set', { tested: 'skipped' });
        expect((await alerts()).gatewayRejected).toMatchObject({ result: 103 });
        await merchantCheck('settings.key_set', { tested: 'ok' });
        expect((await alerts()).gatewayRejected).toBeNull();
        // ردی پس از ذخیرهٔ آزموده دوباره هشدار است، تا «آزمایش» درست بعد از خودش.
        await store().recordGatewayRejection({ orderId: order.id, orderNumber: order.orderNumber, provider: 'zibal', result: 115, at: await tick() });
        expect((await alerts()).gatewayRejected).toMatchObject({ result: 115, stage: 'start' });
        await merchantCheck('settings.key_test', { subject: 'current', outcome: 'ok' });
        expect((await alerts()).gatewayRejected).toBeNull();

        // همان کد در استعلام یک تلاش (سؤال ۱۴۷): از آخرین پرسش خود تلاش، بی رویداد تازه؛ تا «آزمایش» درست بعد از آن.
        const asked = await zibalAttempt();
        const checkedAt = await tick();
        await store().recordGatewayCheck(asked.payment.id, { status: null, error: 'rejected:115', at: checkedAt });
        expect((await alerts()).gatewayRejected).toEqual({
          at: checkedAt,
          orderNumber: asked.order.orderNumber,
          provider: 'zibal',
          result: 115,
          stage: 'inquiry',
        });
        // شاهد: خطای گذرا (بی کد مالک) هشدار نیست.
        await store().recordGatewayCheck(asked.payment.id, { status: null, error: 'unavailable:502', at: await tick() });
        expect((await alerts()).gatewayRejected).toBeNull();
        await store().recordGatewayCheck(asked.payment.id, { status: null, error: 'rejected:103', at: await tick() });
        expect((await alerts()).gatewayRejected).toMatchObject({ result: 103, stage: 'inquiry' });
        await merchantCheck('settings.key_test', { subject: 'current', outcome: 'ok' });
        expect((await alerts()).gatewayRejected).toBeNull();

        // مبلغ ناهمخوان (۲، بی verify): مبلغی که درگاه گفت از استعلام؛ پولش نزد درگاه.
        const odd = await zibalAttempt({ amountRials: 1_234_000 });
        await payOnZibal(odd.trackId);
        await settle({ paymentId: odd.payment.id, providers: ['zibal'] });
        // پرداخت دوم (۲): پولش نزد درگاه، تا «ریورس‌شده».
        const first = await zibalAttempt();
        const second = await zibalAttempt({ orderId: first.order.id });
        await payOnZibal(first.trackId);
        await payOnZibal(second.trackId);
        await settle({ paymentId: first.payment.id, providers: ['zibal'] }, { via: 'auto' });
        await settle({ paymentId: second.payment.id, providers: ['zibal'] }, { via: 'auto' });
        // تأییدشدهٔ بی‌استفاده (۱): پولش خودکار برنمی‌گردد.
        await conn.db.insert(payments).values({
          orderId: first.order.id,
          provider: 'zibal',
          amountRials: first.order.totalRials,
          authority: '3714999001',
          gatewayOrderId: `${first.order.orderNumber}-verified`,
          status: 'failed',
          failureCode: 'order_not_payable',
          gatewayStatus: 1,
          settledVia: 'auto',
        });

        const now = await alerts();
        expect(now.mismatched).toContainEqual({
          orderNumber: odd.order.orderNumber,
          amountRials: odd.order.totalRials,
          reportedRials: 1_234_000,
          createdAt: odd.payment.createdAt,
        });
        expect(now.held).toEqual(
          expect.arrayContaining([
            { orderNumber: odd.order.orderNumber, failureCode: 'amount_mismatch', createdAt: odd.payment.createdAt },
            { orderNumber: first.order.orderNumber, failureCode: 'order_not_payable', createdAt: second.payment.createdAt },
          ]),
        );
        expect(now.verifiedUnused).toContainEqual({ orderNumber: first.order.orderNumber, failureCode: 'order_not_payable' });
        // بستهٔ خودکار امروز: یکی موفق، دو ناموفق (پرداخت دوم و تأییدشدهٔ بی‌استفاده)، دست‌کم.
        expect(now.autoClosed.succeeded).toBeGreaterThanOrEqual(1);
        expect(now.autoClosed.failed).toBeGreaterThanOrEqual(2);
        expect((await panel.alerts(ALL_ORDERS, { ...clockAt(new Date()), todayStart: undefined })).autoClosed).toEqual({ failed: 0, succeeded: 0 });
        // هفت روز بعد مبلغ ناهمخوان دیگر خطای پیشخوان نیست؛ برگشت پول دیگر «نزد درگاه» نیست.
        expect((await panel.alerts(ALL_ORDERS, clockAt(new Date(Date.now() + MISMATCH_ALERT_MS + 60_000)))).mismatched.map((m) => m.orderNumber)).not.toContain(
          odd.order.orderNumber,
        );
        await conn.db.update(payments).set({ gatewayStatus: 18 }).where(eq(payments.id, second.payment.id));
        expect((await alerts()).held.map((h) => h.createdAt.getTime())).not.toContain(second.payment.createdAt.getTime());
      });

      it('درگاه نمونه از همان مسیر: بی تصمیم در انتظار، با تصمیم موفق', async () => {
        const { order, payment } = await pendingPayment();
        const mock = { mock: mockGateway() };
        expect(providersOf(mock)).toEqual(['mock']);
        expect(await settleWith({ store: store(), lookup: { returnKey: payment.returnKey, providers: ['mock'] }, gateways: mock, via: 'callback', now: () => new Date() })).toMatchObject({
          payment: { status: 'pending', gatewayStatus: -1 },
        });
        await store().recordMockDecision(payment.authority, 'success', new Date());
        expect(await settleWith({ store: store(), lookup: { returnKey: payment.returnKey, providers: ['mock'] }, gateways: mock, via: 'callback', now: () => new Date() })).toMatchObject({
          settled: true,
          payment: { status: 'succeeded', verifiedAmountRials: order.totalRials },
          order: { status: 'paid' },
        });
      });
    });

    describe('تخفیف روی پستگرس (برش ۱۱٫۴)', () => {
      const T = (tomans: number) => tomans * 10;
      let ownerId: string;

      beforeAll(async () => {
        const [owner] = await conn.db
          .insert(adminUsers)
          .values({ username: `disc-${randomUUID().slice(0, 8)}`, displayName: 'سارا' })
          .returning();
        ownerId = owner!.id;
      });

      afterAll(async () => {
        // کد پاک‌نشدنی است (`discount_codes_append_only`)؛ TRUNCATE تریگر ردیفی ندارد. سفارش‌ها پیش از آن.
        await clearOrders(conn);
        await conn.db.execute(sql`TRUNCATE discount_codes CASCADE`);
      });

      async function newCode(over: Partial<typeof discountCodes.$inferInsert> = {}) {
        const [row] = await conn.db
          .insert(discountCodes)
          .values({ code: `C${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`, kind: 'percent', percent: 10, createdBy: ownerId, ...over })
          .returning();
        return row!;
      }

      async function userOf(mobile: string) {
        const [user] = await conn.db
          .insert(users)
          .values({ mobile })
          .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
          .returning();
        return user!.id;
      }

      /** سفارش با این کد، همان‌طور که سرویس می‌سازد: قیمت با کد، و شناسهٔ کد روی سفارش. */
      async function withCode(code: typeof discountCodes.$inferSelect, over: { mobile?: string; createdAt?: Date } = {}): Promise<NewOrder> {
        const base = await newOrder();
        const breakdown = quote(
          {
            items: [{ sections: base.items[0]!.sections, rules: base.items[0]!.rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }],
            shipping: { methodId: 'post', zoneId: 'tehran' },
          },
          SEED_PRICE_LIST,
          { code: termsOf(code) },
        );
        expect(breakdown.discount).toMatchObject({ source: 'code', codeId: code.id });
        return {
          ...base,
          userId: await userOf(over.mobile ?? MOBILE),
          breakdown,
          discountCodeId: code.id,
          ...(over.createdAt ? { createdAt: over.createdAt } : {}),
        };
      }

      const refusal = async (promise: Promise<unknown>) => {
        try {
          await promise;
          return null;
        } catch (error) {
          if (error instanceof DiscountRefusedError) return error.reason;
          throw error;
        }
      };
      const pay = (orderId: string, totalRials: number) =>
        createOrderStore(conn).insertPayment({ orderId, provider: 'mock', amountRials: totalRials, authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`, raw: null });
      const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

      it('مهلت رزرو همان مهلت هر تلاش پرداخت است (`payment_attempt_ttl` = `PAYMENT_ATTEMPT_TTL_MS`)', async () => {
        const [row] = await conn.db.execute<{ ms: string }>(sql`SELECT extract(epoch FROM payment_attempt_ttl()) * 1000 AS ms`);
        expect(Number(row!.ms)).toBe(PAYMENT_ATTEMPT_TTL_MS);
      });

      it('سفارش با کد شناسهٔ کد را منجمد با قیمت دارد؛ کد سفارش همان کد ریز قیمت (`orders_discount_code`)، و عوض نمی‌شود', async () => {
        const store = createOrderStore(conn);
        // سقف هر مشتری بالا، تا شاهدها به CHECK برسند، نه به محافظ ظرفیت که پیش از CHECK است.
        const code = await newCode({ perCustomerLimit: 10 });
        const input = await withCode(code);
        const { order } = await store.createOrder(input);
        expect(order).toMatchObject({ discountCodeId: code.id, discountRials: input.breakdown.discountRials });
        expect(order.discountRials).toBeGreaterThan(0);
        expect(order.totalRials).toBe(order.subtotalRials - order.discountRials + order.shippingRials);
        expect(await rejectedConstraint(conn.db.update(orders).set({ discountCodeId: null }).where(eq(orders.id, order.id)))).toBe('orders_price_frozen');
        // شاهد: کد روی سفارش بی تخفیف کد در ریز قیمت، و ریز قیمت کد بی شناسه.
        const plain = await newOrder();
        expect(await rejectedConstraint(store.createOrder({ ...plain, discountCodeId: code.id }))).toBe('orders_discount_code');
        expect(await rejectedConstraint(store.createOrder({ ...input, checkoutKey: randomUUID(), discountCodeId: null }))).toBe('orders_discount_code');
        const other = await newCode({ perCustomerLimit: 10 });
        expect(await rejectedConstraint(store.createOrder({ ...input, checkoutKey: randomUUID(), discountCodeId: other.id }))).toBe('orders_discount_code');
      });

      it('سقف کل و سقف هر مشتری زیر قفل: پنج درخواست هم‌زمان برای آخرین جا، فقط یکی', async () => {
        const store = createOrderStore(conn);
        const one = await newCode({ totalLimit: 1, perCustomerLimit: 5 });
        const inputs = await Promise.all(['09121110001', '09121110002', '09121110003', '09121110004', '09121110005'].map((mobile) => withCode(one, { mobile })));
        const results = await Promise.all(inputs.map((input) => refusal(store.createOrder(input))));
        expect(results.filter((r) => r === null)).toHaveLength(1);
        expect(results.filter((r) => r === 'used_up')).toHaveLength(4);

        const mine = await newCode({ perCustomerLimit: 1 });
        await store.createOrder(await withCode(mine));
        expect(await refusal(store.createOrder(await withCode(mine)))).toBe('used_by_you');
        // مشتری دیگر همان کد را می‌گیرد.
        expect(await refusal(store.createOrder(await withCode(mine, { mobile: '09121110009' })))).toBeNull();
      });

      it('رزرو تا مهلت تلاش: سفارشی که مهلتش گذشت جا را پس می‌دهد، و تلاش تازهٔ آن فقط اگر جا هست', async () => {
        const store = createOrderStore(conn);
        const code = await newCode({ totalLimit: 1, perCustomerLimit: 5 });
        const { order: late } = await store.createOrder(await withCode(code, { createdAt: ago(11) }));
        // تلاش تازه رزرو را زنده می‌کند؛ پس سفارش دیگر نه.
        await pay(late.id, late.totalRials);
        expect(await refusal(store.createOrder(await withCode(code, { mobile: '09121110021' })))).toBe('used_up');

        const second = await newCode({ totalLimit: 1, perCustomerLimit: 5 });
        const { order: stale } = await store.createOrder(await withCode(second, { createdAt: ago(11) }));
        const { order: fresh } = await store.createOrder(await withCode(second, { mobile: '09121110022' }));
        expect(fresh.discountCodeId).toBe(second.id);
        // جا را سفارش تازه گرفت: تلاش سفارش قدیمی پیش از درگاه و در خود درج رد می‌شود.
        expect(await store.discountRoom(stale.id)).toBe('used_up');
        expect(await store.discountRoom(fresh.id)).toBeNull();
        expect(await refusal(pay(stale.id, stale.totalRials))).toBe('used_up');
        expect(await store.discountRoom((await store.createOrder(await newOrder())).order.id)).toBeNull();
      });

      it('پرداخت‌شده همیشه می‌شمارد، لغوشده هم؛ دیوار پرداخت شدن فقط پرداخت‌شده‌ها را می‌شمارد', async () => {
        const store = createOrderStore(conn);
        const code = await newCode({ totalLimit: 2, perCustomerLimit: 5 });
        const a = await store.createOrder(await withCode(code, { mobile: '09121110031' }));
        const b = await store.createOrder(await withCode(code, { mobile: '09121110032' }));
        const payA = await pay(a.order.id, a.order.totalRials);
        const payB = await pay(b.order.id, b.order.totalRials);
        await conn.db.update(discountCodes).set({ totalLimit: 1 }).where(eq(discountCodes.id, code.id));
        const paidAt = new Date();
        const succeeded = async ({ payment }: { payment: { amountRials: number } }) => ({
          kind: 'succeeded' as const,
          verifiedAmountRials: payment.amountRials,
          refId: 'r1',
          cardMask: null,
          raw: null,
          paidAt,
          postHandoffDueAt: new Date(paidAt.getTime() + 2 * 86_400_000),
        });
        // جای کد هر دو را برای سنجش درگاه می‌بیند: الف تنها پرداخت‌شده نیست ولی ب رزرو زنده دارد.
        let seen: boolean | undefined;
        await store.settle({ paymentId: payA.id, providers: ['mock'] }, async (current) => {
          seen = current.discountRoom;
          return { kind: 'pending', check: { status: null, error: null, at: new Date() } };
        });
        expect(seen).toBe(false);
        await conn.db.update(discountCodes).set({ totalLimit: 2 }).where(eq(discountCodes.id, code.id));
        expect(await store.settle({ paymentId: payA.id, providers: ['mock'] }, succeeded)).toMatchObject({ order: { status: 'paid' } });
        await conn.db.update(discountCodes).set({ totalLimit: 1 }).where(eq(discountCodes.id, code.id));
        // دیوار دوم: ب پرداخت شود با الف پرداخت‌شده و سقف ۱.
        expect(await rejectedConstraint(store.settle({ paymentId: payB.id, providers: ['mock'] }, succeeded))).toBe('discount_codes_total_limit');
        // لغوِ الف جا را پس نمی‌دهد.
        await conn.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, a.order.id));
        await conn.db.update(discountCodes).set({ totalLimit: 2 }).where(eq(discountCodes.id, code.id));
        expect(await refusal(store.createOrder(await withCode(code, { mobile: '09121110033' })))).toBe('used_up');
      });

      it('کد خاموش، پیش از روز اول و پس از روز آخر به سفارش نمی‌نشیند (`orders_discount_code_valid`)', async () => {
        const store = createOrderStore(conn);
        const day = 86_400_000;
        for (const over of [
          { enabled: false },
          { validFrom: new Date(Date.now() + day) },
          { validFrom: new Date(Date.now() - 2 * day), validUntil: new Date(Date.now() - day) },
        ]) {
          const code = await newCode(over);
          expect(await refusal(store.createOrder(await withCode(code)))).toBe('disabled');
        }
        const open = await newCode({ validFrom: new Date(Date.now() - day), validUntil: new Date(Date.now() + day) });
        expect(await refusal(store.createOrder(await withCode(open)))).toBeNull();
      });

      it('شکل کد: متن، شرط هر نوع، روز، سقف‌ها، یادداشت و یکتایی', async () => {
        const insert = (over: Partial<typeof discountCodes.$inferInsert>) =>
          conn.db.insert(discountCodes).values({ code: 'SHAPE1', kind: 'percent', percent: 10, createdBy: ownerId, ...over });
        expect(await rejectedConstraint(insert({ code: 'shape1' }))).toBe('discount_codes_code');
        expect(await rejectedConstraint(insert({ code: 'AB' }))).toBe('discount_codes_code');
        expect(await rejectedConstraint(insert({ percent: 0 }))).toBe('discount_codes_terms');
        expect(await rejectedConstraint(insert({ percent: 101 }))).toBe('discount_codes_terms');
        expect(await rejectedConstraint(insert({ amountRials: 1_000 }))).toBe('discount_codes_terms');
        expect(await rejectedConstraint(insert({ maxDiscountRials: 0 }))).toBe('discount_codes_terms');
        expect(await rejectedConstraint(insert({ kind: 'fixed', percent: null }))).toBe('discount_codes_terms');
        expect(await rejectedConstraint(insert({ kind: 'fixed', percent: 10, amountRials: 1_000 }))).toBe('discount_codes_terms');
        expect(await rejectedConstraint(insert({ minOrderRials: -1 }))).toBe('discount_codes_min_order');
        const at = new Date();
        expect(await rejectedConstraint(insert({ validFrom: at, validUntil: at }))).toBe('discount_codes_window');
        expect(await rejectedConstraint(insert({ totalLimit: 0 }))).toBe('discount_codes_limits');
        expect(await rejectedConstraint(insert({ perCustomerLimit: 0 }))).toBe('discount_codes_limits');
        expect(await rejectedConstraint(insert({ note: '  ' }))).toBe('discount_codes_note');
        await insert({ kind: 'fixed', percent: null, amountRials: 1_000, maxDiscountRials: null });
        expect(await rejectedConstraint(insert({}))).toBe('discount_codes_code_unique');
      });

      it('شرط‌ها تا اولین سفارش عوض می‌شوند و بعد نه؛ متن هرگز؛ روز، سقف، روشن و یادداشت همیشه؛ پاک نمی‌شود', async () => {
        const code = await newCode({ percent: 10 });
        const set = (patch: Partial<typeof discountCodes.$inferInsert>) => conn.db.update(discountCodes).set(patch).where(eq(discountCodes.id, code.id));
        await set({ percent: 12 });
        expect(await rejectedConstraint(set({ code: 'RENAMED1' }))).toBe('discount_codes_frozen');
        const [fresh] = await conn.db.select().from(discountCodes).where(eq(discountCodes.id, code.id));
        await createOrderStore(conn).createOrder(await withCode(fresh!));
        for (const patch of [{ percent: 15 }, { maxDiscountRials: T(10_000) }, { minOrderRials: T(1_000) }, { kind: 'fixed' as const, percent: null, amountRials: T(5_000) }]) {
          expect(await rejectedConstraint(set(patch))).toBe('discount_codes_frozen');
        }
        await set({ enabled: false, totalLimit: 50, perCustomerLimit: 2, note: 'کمپین مهر', validUntil: new Date(Date.now() + 86_400_000) });
        expect(await rejectedConstraint(conn.db.delete(discountCodes).where(eq(discountCodes.id, code.id)))).toBe('discount_codes_append_only');
      });

      it('کد مسیر خرید برای یک مشتری: ناشناس، خاموش، پیش و پس از روز، پر، سهم برده، و شرط‌ها', async () => {
        const store = createOrderStore(conn);
        const at = new Date();
        const day = 86_400_000;
        expect(await store.discountForCheckout({ code: 'NOPE404', userId: await userOf(MOBILE), at })).toEqual({ ok: false, reason: 'unknown' });
        const off = await newCode({ enabled: false });
        const soon = await newCode({ validFrom: new Date(at.getTime() + day) });
        const gone = await newCode({ validUntil: new Date(at.getTime() - 1) , validFrom: new Date(at.getTime() - day) });
        const full = await newCode({ totalLimit: 1, perCustomerLimit: 5 });
        await store.createOrder(await withCode(full, { mobile: '09121110041' }));
        const mine = await newCode({ perCustomerLimit: 1, kind: 'fixed', percent: null, amountRials: T(20_000), minOrderRials: T(100_000) });
        await store.createOrder(await withCode(mine));
        const reasons = await Promise.all(
          [off, soon, gone, full, mine].map(async (code) => (await store.discountForCheckout({ code: code.code, userId: await userOf(MOBILE), at })) as { reason?: string }),
        );
        expect(reasons.map((r) => r.reason)).toEqual(['disabled', 'not_started', 'ended', 'used_up', 'used_by_you']);
        expect(await store.discountForCheckout({ code: mine.code, userId: await userOf('09121110042'), at })).toEqual({
          ok: true,
          terms: { id: mine.id, code: mine.code, minOrderRials: T(100_000), kind: 'fixed', amountRials: T(20_000) },
        });
      });

      it('پله‌های تخفیف در پیش‌نویس ذخیره و به ترتیب آستانه خوانده می‌شوند؛ تا ۵، درصد تا سقف قرارداد، و نسخهٔ فعال‌شده نه', async () => {
        const DRAFT = 77;
        const tiers = [
          { fromRials: T(3_000_000), percent: 10, freeShipping: true },
          { fromRials: T(1_000_000), percent: 0, freeShipping: true },
        ];
        await seedPriceList(conn, { ...SEED_PRICE_LIST, version: DRAFT, label: 'پیش‌نویس پله‌ها', discountTiers: tiers }, { activate: false });
        expect((await loadPriceList(conn, DRAFT)).discountTiers).toEqual([tiers[1], tiers[0]]);
        const tier = (fromRials: number, percent = 5, freeShipping = false) =>
          conn.db.insert(discountTiers).values({ priceListVersion: DRAFT, fromRials, percent, freeShipping });
        expect(await rejectedConstraint(tier(T(5_000_000), TIER_PERCENT_MAX + 1))).toBe('discount_tiers_percent');
        await tier(T(5_000_000), TIER_PERCENT_MAX);
        expect(await rejectedConstraint(tier(T(6_000_000), 0))).toBe('discount_tiers_reward');
        expect(await rejectedConstraint(tier(0))).toBe('discount_tiers_from');
        await tier(T(6_000_000));
        await tier(T(7_000_000));
        expect(await rejectedConstraint(tier(T(8_000_000)))).toBe('discount_tiers_max');
        expect(DISCOUNT_TIERS_MAX).toBe(5);
        await conn.db.delete(priceLists).where(eq(priceLists.version, DRAFT));
        expect(await conn.db.select().from(discountTiers).where(eq(discountTiers.priceListVersion, DRAFT))).toEqual([]);
        // نسخهٔ فعال‌شده: هیچ پله‌ای به آن نمی‌رسد.
        expect(await rejectedConstraint(conn.db.insert(discountTiers).values({ priceListVersion: 1, fromRials: T(1_000_000), percent: 5, freeShipping: false }))).toBe(
          'price_list_rows_frozen',
        );
      });

      it('ذخیره‌گاه پنل: کد تازه با رویداد، متن تکراری، «همان که دیده شد»، شرط منجمد، و شمار استفاده و رزرو', async () => {
        const discounts = createDiscountStore(conn);
        const at = new Date();
        const terms = {
          kind: 'percent' as const,
          percent: 20,
          maxDiscountRials: T(50_000),
          amountRials: null,
          minOrderRials: 0,
          validFrom: null,
          validUntil: null,
          totalLimit: 10,
          perCustomerLimit: 1,
          enabled: true,
          note: 'کمپین مهر',
        };
        const event = { adminUserId: ownerId, action: 'discounts.create', targetType: 'discount', at, detail: {} };
        const created = await discounts.create({ code: 'MEHR1405', terms, createdBy: ownerId, event });
        expect(created).toMatchObject({ ok: true, code: { code: 'MEHR1405', percent: 20, createdBy: ownerId } });
        if (!created.ok) throw new Error('ساخته نشد');
        expect(await discounts.create({ code: 'MEHR1405', terms, createdBy: ownerId, event })).toEqual({ ok: false, reason: 'code_taken' });
        expect([await discounts.codeTaken('MEHR1405'), await discounts.codeTaken('MEHR1406')]).toEqual([true, false]);
        const [logged] = await conn.db.select().from(adminEvents).where(and(eq(adminEvents.action, 'discounts.create'), eq(adminEvents.targetId, created.code.id)));
        expect(logged).toMatchObject({ adminUserId: ownerId, targetType: 'discount' });

        const update = (seenUpdatedAt: Date, patch: Partial<typeof terms>) =>
          discounts.update({ id: created.code.id, seenUpdatedAt, terms: { ...terms, ...patch }, event: { ...event, action: 'discounts.update' } });
        expect(await update(new Date(0), { percent: 25 })).toEqual({ ok: false, reason: 'changed' });
        const raised = await update(created.code.updatedAt, { percent: 25 });
        expect(raised).toMatchObject({ ok: true, code: { percent: 25 } });
        if (!raised.ok) throw new Error('عوض نشد');

        const code = (await conn.db.select().from(discountCodes).where(eq(discountCodes.id, created.code.id)))[0]!;
        const store = createOrderStore(conn);
        const paid = await store.createOrder(await withCode(code, { mobile: '09121110051' }));
        await store.createOrder(await withCode(code, { mobile: '09121110052' }));
        await conn.db.update(orders).set({ status: 'paid', paidAt: at, postHandoffDueAt: at }).where(eq(orders.id, paid.order.id));
        expect(await update(raised.code.updatedAt, { percent: 30 })).toEqual({ ok: false, reason: 'terms_frozen' });
        expect(await update(raised.code.updatedAt, { percent: 25, enabled: false })).toMatchObject({ ok: true, code: { enabled: false } });
        expect(await discounts.find(created.code.id)).toMatchObject({ used: 1, reserved: 1, createdByName: 'سارا' });
        expect((await discounts.ordersOf(created.code.id)).map((o) => o.status).sort()).toEqual(['awaiting_payment', 'paid']);
        expect((await discounts.list()).map((c) => c.code)).toContain('MEHR1405');
      });
    });

    describe('مسدودی موبایل روی پستگرس (برش ۱۲٫۲)', () => {
      const BLOCKED = '09127770001';
      let adminA: string;
      let adminB: string;

      beforeAll(async () => {
        const rows = await conn.db
          .insert(adminUsers)
          .values([
            { username: `blk-a-${randomUUID().slice(0, 8)}`, displayName: 'سارا' },
            { username: `blk-b-${randomUUID().slice(0, 8)}`, displayName: 'رضا' },
          ])
          .returning();
        [adminA, adminB] = rows.map((row) => row.id) as [string, string];
      });

      afterEach(async () => {
        // مسدودی پاک‌نشدنی است (`mobile_blocks_append_only`)؛ TRUNCATE تریگر ردیفی ندارد.
        await conn.db.execute(sql`TRUNCATE mobile_blocks`);
      });

      afterAll(async () => {
        await clearOrders(conn);
      });

      const blockRow = (over: Partial<typeof mobileBlocks.$inferInsert> = {}) =>
        conn.db.insert(mobileBlocks).values({ mobile: BLOCKED, reason: 'سفارش‌های پرداخت‌نشدهٔ پشت‌سرهم', blockedBy: adminA, ...over }).returning();

      it('محافظ‌های 0049 و 0050: یک زنده برای هر شماره، تازه زنده، پاک‌نشدنی، و فقط یک بار رفع', async () => {
        const [first] = await blockRow();
        expect(await rejectedConstraint(blockRow({ reason: 'دوباره' }))).toBe('mobile_blocks_live');
        expect(await rejectedConstraint(blockRow({ mobile: '0912777000' }))).toBe('mobile_blocks_mobile');
        expect(await rejectedConstraint(blockRow({ mobile: '09127770002', reason: '  ' }))).toBe('mobile_blocks_reason');
        expect(await rejectedConstraint(blockRow({ mobile: '09127770002', reason: ' دلیل' }))).toBe('mobile_blocks_reason');
        expect(await rejectedConstraint(blockRow({ mobile: '09127770002', reason: 'د'.repeat(501) }))).toBe('mobile_blocks_reason');
        expect(await blockRow({ mobile: '09127770002', reason: 'د'.repeat(500) })).toHaveLength(1);
        expect(
          await rejectedConstraint(blockRow({ mobile: '09127770003', unblockedAt: new Date(), unblockedBy: adminA })),
        ).toBe('mobile_blocks_insert_state');
        expect(await rejectedConstraint(blockRow({ mobile: '09127770003', unblockedBy: adminA }))).toBe('mobile_blocks_insert_state');

        const where = eq(mobileBlocks.id, first!.id);
        expect(await rejectedConstraint(conn.db.delete(mobileBlocks).where(where))).toBe('mobile_blocks_append_only');
        expect(await rejectedConstraint(conn.db.update(mobileBlocks).set({ reason: 'دلیل دیگر' }).where(where))).toBe('mobile_blocks_frozen');
        expect(await rejectedConstraint(conn.db.update(mobileBlocks).set({ orderNumber: 10001 }).where(where))).toBe('mobile_blocks_frozen');
        expect(await rejectedConstraint(conn.db.update(mobileBlocks).set({ unblockedAt: new Date() }).where(where))).toBe('mobile_blocks_unblocked');
        expect(
          await rejectedConstraint(conn.db.update(mobileBlocks).set({ unblockedAt: new Date(first!.blockedAt.getTime() - 1_000), unblockedBy: adminB }).where(where)),
        ).toBe('mobile_blocks_unblocked');
        const unblockedAt = new Date(first!.blockedAt.getTime() + 60_000);
        expect(await conn.db.update(mobileBlocks).set({ unblockedAt, unblockedBy: adminB }).where(where).returning()).toHaveLength(1);
        // رفع‌شده دیگر عوض نمی‌شود، حتی رفع دوباره؛ و مسدودی دوباره ردیف تازه است.
        expect(
          await rejectedConstraint(conn.db.update(mobileBlocks).set({ unblockedAt: new Date(unblockedAt.getTime() + 1_000) }).where(where)),
        ).toBe('mobile_blocks_frozen');
        expect(await rejectedConstraint(conn.db.update(mobileBlocks).set({ unblockedBy: adminA }).where(where))).toBe('mobile_blocks_frozen');
        expect(await blockRow({ reason: 'دوباره' })).toHaveLength(1);
      });

      it('کد پیامکی: شمارهٔ مسدود `blocked` است، شمارهٔ دیگر نه، و پس از رفع دیگر نه', async () => {
        const auth = createAuthStore(conn);
        const blockedOf = async (mobile: string) => {
          let seen: boolean | undefined;
          await auth.issueOtp({ mobile, ipHash: 'ip-blk', sessionHash: SESSION, ...windowAt(new Date()) }, (counts) => {
            seen = counts.blocked;
            return null;
          });
          return seen;
        };
        expect(await blockedOf(BLOCKED)).toBe(false);
        const [row] = await blockRow();
        expect([await blockedOf(BLOCKED), await blockedOf('09127770009')]).toEqual([true, false]);
        await conn.db.update(mobileBlocks).set({ unblockedAt: new Date(), unblockedBy: adminA }).where(eq(mobileBlocks.id, row!.id));
        expect(await blockedOf(BLOCKED)).toBe(false);
      });

      it('سفارش و تلاش پرداخت تازه نه؛ تلاشی که پیش از مسدودی ساخته شد پرداخت می‌شود؛ پس از رفع دوباره باز', async () => {
        const store = createOrderStore(conn);
        const mine = async () => {
          const input = await newOrder();
          const [user] = await conn.db
            .insert(users)
            .values({ mobile: BLOCKED })
            .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
            .returning();
          return { ...input, userId: user!.id, recipientPhone: BLOCKED };
        };
        const before = (await store.createOrder(await mine())).order;
        const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
        await store.insertPayment({ orderId: before.id, provider: 'mock', amountRials: before.totalRials, authority, raw: null });
        expect(await store.mobileBlocked(BLOCKED)).toBe(false);

        const [row] = await blockRow({ orderNumber: before.orderNumber });
        expect([await store.mobileBlocked(BLOCKED), await store.mobileBlocked(MOBILE)]).toEqual([true, false]);
        await expect(store.createOrder(await mine())).rejects.toBeInstanceOf(MobileBlockedError);
        await expect(
          store.insertPayment({ orderId: before.id, provider: 'mock', amountRials: before.totalRials, authority: `${authority}2`, raw: null }),
        ).rejects.toBeInstanceOf(MobileBlockedError);
        // دیوار خود پایگاه داده، با نامش: بی سرویس هم.
        const [payment] = await conn.db.select().from(payments).where(eq(payments.authority, authority));
        expect(
          await rejectedConstraint(conn.db.insert(payments).values({ orderId: before.id, provider: 'mock', amountRials: before.totalRials, authority: `${authority}3` })),
        ).toBe('payments_mobile_blocked');
        // سفارش دیگران دست نمی‌خورد.
        const other = (await store.createOrder(await newOrder())).order;
        expect(await store.insertPayment({ orderId: other.id, provider: 'mock', amountRials: other.totalRials, authority: `${authority}4`, raw: null })).toMatchObject({ status: 'pending' });

        // تلاشی که پیش از مسدودی ساخته شد همان‌طور پرداخت می‌شود: پول مشتری گرفته شده.
        const paidAt = new Date();
        const settled = await store.settlePayment('mock', authority, async ({ payment: p }) => ({
          kind: 'succeeded',
          verifiedAmountRials: p.amountRials,
          refId: '803115',
          cardMask: null,
          raw: { decision: 'success' },
          paidAt,
          postHandoffDueAt: new Date(paidAt.getTime() + 2 * 86_400_000),
        }));
        expect(settled).toMatchObject({ settled: true, payment: { id: payment!.id, status: 'succeeded' }, order: { status: 'paid' } });

        await conn.db.update(mobileBlocks).set({ unblockedAt: new Date(), unblockedBy: adminB }).where(eq(mobileBlocks.id, row!.id));
        expect(await store.mobileBlocked(BLOCKED)).toBe(false);
        expect((await store.createOrder(await mine())).created).toBe(true);
      });

      it('ذخیره‌گاه پنل: صاحب سفارش در محدوده، مسدود با رویداد، دو کلیک یکی، دلیل دیگر رد، رفع با رویداد، و فهرست', async () => {
        const blocks = createBlockStore(conn);
        const store = createOrderStore(conn);
        const order = (await store.createOrder(await newOrder())).order;
        expect(await blocks.orderOwner(ALL_ORDERS, order.orderNumber)).toEqual({ orderId: order.id, orderNumber: order.orderNumber, mobile: MOBILE });
        // سفارشی که پیش هیچ چاپخانه‌ای نیست، بیرون از محدودهٔ هر چاپخانه است.
        expect(await blocks.orderOwner({ kind: 'partner', partnerId: randomUUID() }, order.orderNumber)).toBeNull();
        expect(await blocks.orderOwner(ALL_ORDERS, 999_999)).toBeNull();

        const at = new Date();
        const event = (adminUserId: string, action = 'customers.block') => ({ adminUserId, action, at, detail: { mobile: '0912 ••• 4567' } });
        const reason = 'سفارش‌های پرداخت‌نشدهٔ پشت‌سرهم';
        const blocked = await blocks.block({ mobile: MOBILE, reason, orderNumber: order.orderNumber, event: event(adminA) });
        expect(blocked).toMatchObject({ ok: true, already: false, block: { mobile: MOBILE, reason, orderNumber: order.orderNumber, blockedByName: 'سارا', unblockedAt: null } });
        if (!blocked.ok) throw new Error('مسدود نشد');
        const logged = () => conn.db.select().from(adminEvents).where(and(eq(adminEvents.targetType, 'mobile_block'), eq(adminEvents.targetId, blocked.block.id))).orderBy(asc(adminEvents.id));
        expect(await logged()).toEqual([expect.objectContaining({ action: 'customers.block', adminUserId: adminA, detail: { mobile: '0912 ••• 4567' } })]);

        // دو کلیک: همان مسدودی، بی رویداد دوم. دلیل دیگر یا ادمین دیگر: رد، با مسدودی زنده.
        expect(await blocks.block({ mobile: MOBILE, reason, orderNumber: order.orderNumber, event: event(adminA) })).toMatchObject({ ok: true, already: true, block: { id: blocked.block.id } });
        expect(await blocks.block({ mobile: MOBILE, reason: 'دلیل دیگر', orderNumber: null, event: event(adminA) })).toMatchObject({ ok: false, reason: 'already_blocked', block: { id: blocked.block.id } });
        expect(await blocks.block({ mobile: MOBILE, reason, orderNumber: null, event: event(adminB) })).toMatchObject({ ok: false, reason: 'already_blocked' });
        expect(await logged()).toHaveLength(1);
        // دو مسدود کردن هم‌زمان یک شماره: یکی ساخته می‌شود و دیگری همان را می‌بیند.
        const twin = await Promise.all([
          blocks.block({ mobile: '09127770005', reason, orderNumber: null, event: event(adminA) }),
          blocks.block({ mobile: '09127770005', reason, orderNumber: null, event: event(adminA) }),
        ]);
        expect(twin.map((result) => result.ok && result.already).sort()).toEqual([false, true]);

        expect([...(await blocks.live([MOBILE, '09127770005', '09127770006'])).keys()].sort()).toEqual([MOBILE, '09127770005']);
        expect(await blocks.live([])).toEqual(new Map());

        const unblocked = await blocks.unblock({ id: blocked.block.id, event: event(adminB, 'customers.unblock') });
        expect(unblocked).toMatchObject({ ok: true, already: false, block: { unblockedByName: 'رضا', blockedByName: 'سارا' } });
        expect(await blocks.unblock({ id: blocked.block.id, event: event(adminA, 'customers.unblock') })).toMatchObject({ ok: true, already: true, block: { unblockedByName: 'رضا' } });
        expect(await blocks.unblock({ id: randomUUID(), event: event(adminA, 'customers.unblock') })).toEqual({ ok: false, reason: 'not_found' });
        expect((await logged()).map((e) => [e.action, e.adminUserId])).toEqual([
          ['customers.block', adminA],
          ['customers.unblock', adminB],
        ]);
        expect(await blocks.get(blocked.block.id)).toMatchObject({ id: blocked.block.id, unblockedByName: 'رضا' });
        expect(await blocks.get(randomUUID())).toBeNull();

        // مسدودی دوباره ردیف تازه است؛ فهرست زنده‌ها تازه‌ترین اول، و رفع‌شده‌ها جدا با سقف.
        const again = await blocks.block({ mobile: MOBILE, reason: 'دوباره', orderNumber: null, event: { ...event(adminB), at: new Date(at.getTime() + 1_000) } });
        expect(again).toMatchObject({ ok: true, already: false });
        const list = await blocks.list(10);
        expect(list.live.map((b) => [b.mobile, b.reason])).toEqual([
          [MOBILE, 'دوباره'],
          ['09127770005', reason],
        ]);
        expect(list.past.map((b) => b.id)).toEqual([blocked.block.id]);
        expect((await blocks.list(0)).past).toEqual([]);
      });
    });

    describe('نظر مشتری روی پستگرس (برش ۱۲٫۳)', () => {
      let owner: string;

      beforeAll(async () => {
        const [row] = await conn.db
          .insert(adminUsers)
          .values({ username: `rev-${randomUUID().slice(0, 8)}`, displayName: 'پروین' })
          .returning();
        owner = row!.id;
      });

      // نظر با پاک شدن سفارش می‌رود (cascade)، و جز آن هرگز (`order_reviews_append_only`).
      beforeEach(async () => {
        await clearOrders(conn);
      });

      afterAll(async () => {
        await clearOrders(conn);
      });

      /** سفارش پرداخت‌شده‌ای که چاپ شد و «تحویل پست شد»، همان گذارهای پنل. */
      const deliveredOrder = async () => {
        const store = createOrderStore(conn);
        const order = (await store.createOrder(await newOrder())).order;
        const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
        await store.insertPayment({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority, raw: null });
        const paidAt = new Date();
        await store.settlePayment('mock', authority, async ({ payment }) => ({
          kind: 'succeeded',
          verifiedAmountRials: payment.amountRials,
          refId: '803116',
          cardMask: null,
          raw: { decision: 'success' },
          paidAt,
          postHandoffDueAt: new Date(paidAt.getTime() + 2 * 86_400_000),
        }));
        await conn.db.update(orders).set({ status: 'printing' }).where(eq(orders.id, order.id));
        await conn.db.update(orders).set({ status: 'handed_to_post', handedToPostAt: new Date() }).where(eq(orders.id, order.id));
        return order;
      };

      const reviewRow = (orderId: string, over: Partial<typeof orderReviews.$inferInsert> = {}) =>
        conn.db
          .insert(orderReviews)
          .values({ orderId, rating: 5, body: 'خیلی تمیز و سر وقت رسید.', publicName: 'سارا', publicPlace: 'مشهد', ...over })
          .returning();

      it('محافظ‌های 0051 و 0052: فقط پس از رسیدن به پست، یکی برای هر سفارش، تازه منتظر، منجمد جز وضعیت، گذارها، و پاک فقط با سفارش', async () => {
        const store = createOrderStore(conn);
        const awaiting = (await store.createOrder(await newOrder())).order;
        expect(await rejectedConstraint(reviewRow(awaiting.id))).toBe('order_reviews_delivered');
        const order = await deliveredOrder();
        expect(await rejectedConstraint(reviewRow(order.id, { status: 'approved', decidedAt: new Date(), decidedBy: owner }))).toBe('order_reviews_insert_state');
        expect(await rejectedConstraint(reviewRow(order.id, { decidedBy: owner }))).toBe('order_reviews_insert_state');
        expect(await rejectedConstraint(reviewRow(order.id, { rating: 6 }))).toBe('order_reviews_rating');
        expect(await rejectedConstraint(reviewRow(order.id, { rating: 0 }))).toBe('order_reviews_rating');
        expect(await rejectedConstraint(reviewRow(order.id, { rating: null }))).toBe('order_reviews_content');
        expect(await rejectedConstraint(reviewRow(order.id, { body: ' \n ' }))).toBe('order_reviews_body');
        expect(await rejectedConstraint(reviewRow(order.id, { body: ' متن' }))).toBe('order_reviews_body');
        expect(await rejectedConstraint(reviewRow(order.id, { body: 'ن'.repeat(501) }))).toBe('order_reviews_body');
        expect(await rejectedConstraint(reviewRow(order.id, { publicName: ' ' }))).toBe('order_reviews_public');
        expect(await rejectedConstraint(reviewRow(order.id, { publicName: 'ن'.repeat(101) }))).toBe('order_reviews_public');
        expect(await rejectedConstraint(reviewRow(order.id, { publicPlace: '' }))).toBe('order_reviews_public');
        expect(await rejectedConstraint(reviewRow(order.id, { publicPlace: 'ن'.repeat(81) }))).toBe('order_reviews_public');
        const [first] = await reviewRow(order.id, { body: 'ن'.repeat(500) });
        expect(await rejectedConstraint(reviewRow(order.id))).toBe('order_reviews_order');
        // نمرهٔ تنها، بی متن، هم نظر است.
        const [bare] = await reviewRow((await deliveredOrder()).id, { rating: 3, body: null });
        expect(bare).toMatchObject({ status: 'pending', body: null, decidedAt: null });

        const byId = eq(orderReviews.id, first!.id);
        const later = new Date(first!.createdAt.getTime() + 60_000);
        const set = (patch: Partial<typeof orderReviews.$inferInsert>) => rejectedConstraint(conn.db.update(orderReviews).set(patch).where(byId));
        expect(await set({ rating: 4 })).toBe('order_reviews_frozen');
        expect(await set({ body: 'متن دیگر' })).toBe('order_reviews_frozen');
        expect(await set({ orderId: bare!.orderId })).toBe('order_reviews_frozen');
        expect(await set({ createdAt: later })).toBe('order_reviews_frozen');
        // نام و شهری که مشتری زیر فرم دید همان است که روی سایت می‌آید.
        expect(await set({ publicName: 'مریم' })).toBe('order_reviews_frozen');
        expect(await set({ publicPlace: 'تهران' })).toBe('order_reviews_frozen');
        expect(await set({ status: 'approved', publicName: 'مریم', decidedAt: later, decidedBy: owner })).toBe('order_reviews_frozen');
        expect(await set({ status: 'approved' })).toBe('order_reviews_decided');
        expect(await set({ status: 'approved', decidedAt: new Date(first!.createdAt.getTime() - 1_000), decidedBy: owner })).toBe('order_reviews_decided');
        expect(await rejectedConstraint(conn.db.update(orderReviews).set({ status: 'approved', decidedAt: later, decidedBy: owner }).where(eq(orderReviews.id, bare!.id)))).toBe(
          'order_reviews_approved_body',
        );
        expect(await set({ status: 'approved', decidedAt: later, decidedBy: owner })).toBeUndefined();
        expect(await set({ status: 'pending', decidedAt: null, decidedBy: null })).toBe('order_reviews_flow');
        expect(await set({ status: 'approved', decidedAt: new Date(later.getTime() + 1_000), decidedBy: owner })).toBe('order_reviews_flow');
        expect(await set({ status: 'hidden', decidedAt: new Date(later.getTime() + 2_000), decidedBy: owner })).toBeUndefined();
        expect(await set({ status: 'deleted', decidedAt: new Date(later.getTime() + 3_000), decidedBy: owner })).toBe('order_reviews_content');
        expect(await set({ status: 'deleted', rating: null, decidedAt: new Date(later.getTime() + 3_000), decidedBy: owner })).toBe('order_reviews_content');
        expect(await set({ status: 'deleted', rating: null, body: null, decidedAt: new Date(later.getTime() + 3_000), decidedBy: owner })).toBeUndefined();
        // پاک‌شده دیگر عوض نمی‌شود: نه نمره و متن، نه وضعیت، نه زمان تصمیم؛ ردیفش هم جز با سفارش پاک نمی‌شود.
        expect(await set({ status: 'hidden', rating: 5, body: 'برگشت', decidedAt: new Date(later.getTime() + 4_000), decidedBy: owner })).toBe('order_reviews_frozen');
        expect(await set({ status: 'hidden', decidedAt: new Date(later.getTime() + 4_000), decidedBy: owner })).toBe('order_reviews_flow');
        expect(await set({ decidedAt: new Date(later.getTime() + 5_000) })).toBe('order_reviews_flow');
        expect(await rejectedConstraint(conn.db.delete(orderReviews).where(byId))).toBe('order_reviews_append_only');
        await conn.db.delete(payments).where(eq(payments.orderId, order.id));
        await conn.db.delete(orders).where(eq(orders.id, order.id));
        expect(await conn.db.select().from(orderReviews).where(byId)).toEqual([]);
      });

      it('ذخیره‌گاه: نوشتن مشتری و صفحهٔ سفارش، صفحهٔ اصلی فقط تأییدشده، تصمیم مالک با رویداد، دو کلیک یکی، کهنه رد، پاک یعنی پاک، و شمار', async () => {
        const reviews = createReviewStore(conn);
        const store = createOrderStore(conn);
        const awaiting = (await store.createOrder(await newOrder())).order;
        const at = new Date();
        const who = { publicName: 'سارا', publicPlace: 'مشهد' };
        expect(await reviews.submit({ orderId: awaiting.id, rating: 5, body: null, ...who, at })).toEqual({ ok: false, reason: 'not_delivered' });

        const order = await deliveredOrder();
        const body = 'صحافی محکم بود و زودتر از روزی که گفته بودید رسید.';
        const sent = await reviews.submit({ orderId: order.id, rating: 5, body, ...who, at });
        expect(sent).toMatchObject({ ok: true, review: { orderId: order.id, rating: 5, body, ...who, status: 'pending', createdAt: at } });
        expect(await reviews.submit({ orderId: order.id, rating: 1, body: 'دوباره', publicName: 'مریم', publicPlace: 'تهران', at })).toEqual({ ok: false, reason: 'exists' });
        expect((await store.details(order.publicToken))?.review).toMatchObject({ rating: 5, body, status: 'pending' });
        expect((await store.details(awaiting.publicToken))?.review).toBeNull();
        if (!sent.ok) throw new Error('نظر ثبت نشد');
        const id = sent.review.id;

        const bareOrder = await deliveredOrder();
        const bare = await reviews.submit({ orderId: bareOrder.id, rating: 2, body: null, publicName: 'رضا', publicPlace: 'تهران، تهران', at: new Date(at.getTime() + 1_000) });
        if (!bare.ok) throw new Error('نظر بی متن ثبت نشد');

        // هیچ نظری پیش از تأیید عمومی نیست.
        expect(await reviews.published(6)).toEqual([]);
        const event = (action: string, seconds: number) => ({ adminUserId: owner, action, at: new Date(at.getTime() + seconds * 1_000), detail: { orderNumber: order.orderNumber, rating: 5 } });
        const approved = await reviews.decide({ id, from: 'pending', to: 'approved', event: event('reviews.approve', 10) });
        expect(approved).toMatchObject({ ok: true, already: false, review: { status: 'approved', decidedByName: 'پروین', orderNumber: order.orderNumber } });
        expect(await reviews.decide({ id, from: 'pending', to: 'approved', event: event('reviews.approve', 11) })).toMatchObject({ ok: true, already: true });
        expect(await reviews.decide({ id, from: 'pending', to: 'hidden', event: event('reviews.hide', 12) })).toMatchObject({ ok: false, reason: 'stale', review: { status: 'approved' } });
        expect(await reviews.decide({ id: randomUUID(), from: 'pending', to: 'hidden', event: event('reviews.hide', 12) })).toEqual({ ok: false, reason: 'not_found' });
        // نظر بی متن روی سایت نمی‌رود: دیوار دوم، اگر سرویس نسنجید.
        expect(await reviews.decide({ id: bare.review.id, from: 'pending', to: 'approved', event: event('reviews.approve', 13) })).toMatchObject({
          ok: false,
          reason: 'no_body',
          review: { status: 'pending' },
        });

        const [published] = await reviews.published(6);
        expect(published).toEqual({ rating: 5, body, ...who, createdAt: at });
        expect(await reviews.counts()).toEqual({ pending: 1, approved: 1, hidden: 0, total: 2, averageRating: 3.5 });
        expect((await reviews.list('pending', 10)).map((r) => r.id)).toEqual([bare.review.id]);
        expect((await reviews.list('all', 10)).map((r) => r.id)).toEqual([bare.review.id, id]);

        expect(await reviews.decide({ id, from: 'approved', to: 'hidden', event: event('reviews.hide', 20) })).toMatchObject({ ok: true, review: { status: 'hidden' } });
        expect(await reviews.published(6)).toEqual([]);
        // پاک یعنی پاک: نمره و متن می‌روند، ردیف خالی می‌ماند و همان سفارش دوباره نظر نمی‌گیرد.
        const deleted = await reviews.decide({ id, from: 'hidden', to: 'deleted', event: event('reviews.delete', 30) });
        expect(deleted).toMatchObject({ ok: true, review: { status: 'deleted', rating: null, body: null } });
        expect((await reviews.list('all', 10)).map((r) => r.id)).toEqual([bare.review.id]);
        expect((await store.details(order.publicToken))?.review).toMatchObject({ status: 'deleted', rating: null, body: null });
        expect(await reviews.submit({ orderId: order.id, rating: 4, body: 'دوباره می‌نویسم', ...who, at: new Date() })).toEqual({ ok: false, reason: 'exists' });
        expect(await reviews.counts()).toEqual({ pending: 1, approved: 0, hidden: 0, total: 1, averageRating: 2 });

        const logged = await conn.db
          .select()
          .from(adminEvents)
          .where(and(eq(adminEvents.targetType, 'order_review'), eq(adminEvents.targetId, id)))
          .orderBy(asc(adminEvents.id));
        expect(logged.map((e) => [e.action, e.adminUserId])).toEqual([
          ['reviews.approve', owner],
          ['reviews.hide', owner],
          ['reviews.delete', owner],
        ]);
        expect(JSON.stringify(logged)).not.toContain('صحافی');
        expect(await reviews.get(id)).toMatchObject({ status: 'deleted', decidedByName: 'پروین' });
        expect(await reviews.get(randomUUID())).toBeNull();
      });
    });

    describe('پشتیبانی و «سفارش‌های من» روی پستگرس (برش ۱۲٫۱)', () => {
      const OTHER_MOBILE = '09153334455';
      let ali: string;
      /** ساعت صحنه: هر کار کمی پس از قبلی (محافظ ترتیب پیام‌ها). */
      let clock = Date.now();
      const tick = (ms = 1_000) => new Date((clock += ms));

      beforeAll(async () => {
        const [row] = await conn.db
          .insert(adminUsers)
          .values({ username: `sup-${randomUUID().slice(0, 8)}`, displayName: 'علی' })
          .returning();
        ali = row!.id;
      });

      // گفت‌وگو و پیام پاک‌نشدنی‌اند جز با سفارش، و «سؤال کلی» هرگز (0058)؛ `clearOrders` با TRUNCATE.
      beforeEach(async () => {
        await clearOrders(conn);
        clock = Date.now();
      });

      afterAll(async () => {
        await clearOrders(conn);
      });

      const customerOf = async (mobile: string) => {
        const [user] = await conn.db
          .insert(users)
          .values({ mobile })
          .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
          .returning();
        return user!.id;
      };

      /** سفارش در انتظار پرداخت برای این موبایل. */
      const orderFor = async (mobile = MOBILE, over: Partial<NewOrder> = {}) => {
        const userId = await customerOf(mobile);
        return (await createOrderStore(conn).createOrder(await newOrder({ userId, recipientPhone: mobile, ...over }))).order;
      };

      const threadRow = (over: Partial<typeof supportThreads.$inferInsert> & { userId: string }) => {
        const at = over.createdAt ?? tick();
        return conn.db.insert(supportThreads).values({ status: 'open', createdAt: at, lastMessageAt: at, waitingSince: at, ...over }).returning();
      };

      const messageRow = (threadId: number, over: Partial<typeof supportMessages.$inferInsert> = {}) =>
        conn.db
          .insert(supportMessages)
          .values({ threadId, kind: 'customer', body: 'سلام. جزوه کی می‌رسد؟', requestId: randomUUID(), createdAt: tick(), ...over })
          .returning();

      const threadOf = async (id: number) => (await conn.db.select().from(supportThreads).where(eq(supportThreads.id, id)))[0]!;

      it('محافظ‌های گفت‌وگو (0057 و 0058): تازه «باز»، صاحب سفارش، سؤال کلی فقط با سفارش، یکی برای هر سفارش، منجمد، حال فقط با پیام، «دیده شد» جلو، و پاک فقط با سفارش', async () => {
        const order = await orderFor();
        const userId = order.userId;
        const stranger = await customerOf(OTHER_MOBILE);
        const at = tick();
        expect(await rejectedConstraint(threadRow({ userId, orderId: order.id, status: 'answered', createdAt: at, lastMessageAt: at, waitingSince: null }))).toBe(
          'support_threads_insert_state',
        );
        // فقط حال: محافظ پیش از CHECK `support_threads_waiting` و با نام خودش.
        expect(await rejectedConstraint(threadRow({ userId, orderId: order.id, status: 'answered', createdAt: at, lastMessageAt: at, waitingSince: at }))).toBe(
          'support_threads_insert_state',
        );
        const later = new Date(at.getTime() + 1);
        expect(await rejectedConstraint(threadRow({ userId, orderId: order.id, createdAt: at, lastMessageAt: later, waitingSince: later }))).toBe(
          'support_threads_insert_state',
        );
        expect(await rejectedConstraint(threadRow({ userId, orderId: order.id, createdAt: at, customerSeenAt: new Date(at.getTime() - 1) }))).toBe(
          'support_threads_insert_state',
        );
        expect(await rejectedConstraint(threadRow({ userId: stranger, orderId: order.id }))).toBe('support_threads_owner');
        // «سؤال کلی» فقط برای مشتری‌ای که سفارشی دارد (سؤال ۳۰۶).
        expect(await rejectedConstraint(threadRow({ userId: stranger }))).toBe('support_threads_customer');

        const [thread] = await threadRow({ userId, orderId: order.id });
        expect(await rejectedConstraint(threadRow({ userId, orderId: order.id }))).toBe('support_threads_order');
        const [general] = await threadRow({ userId });
        expect(await rejectedConstraint(threadRow({ userId }))).toBe('support_threads_general');
        // شاهد: سؤال کلی مشتری دیگری که سفارش دارد.
        await orderFor(OTHER_MOBILE);
        expect(await rejectedConstraint(threadRow({ userId: stranger }))).toBeUndefined();

        const byId = eq(supportThreads.id, thread!.id);
        const set = (patch: Partial<typeof supportThreads.$inferInsert>) => rejectedConstraint(conn.db.update(supportThreads).set(patch).where(byId));
        const other = await orderFor();
        expect(await set({ orderId: other.id })).toBe('support_threads_frozen');
        expect(await set({ userId: stranger })).toBe('support_threads_frozen');
        expect(await set({ createdAt: tick() })).toBe('support_threads_frozen');
        // حال فقط با پیام (تریگر `support_messages_apply`)، نه مستقیم.
        expect(await set({ status: 'answered', waitingSince: null })).toBe('support_threads_state');
        expect(await set({ lastMessageAt: tick() })).toBe('support_threads_state');
        expect(await set({ waitingSince: thread!.createdAt, lastMessageAt: tick() })).toBe('support_threads_state');
        const seen = tick();
        expect(await set({ customerSeenAt: seen })).toBeUndefined();
        expect(await set({ customerSeenAt: new Date(seen.getTime() - 1) })).toBe('support_threads_seen');
        expect(await set({ customerSeenAt: null })).toBe('support_threads_seen');
        expect(await set({ customerSeenAt: tick() })).toBeUndefined();

        // دیوار دوم: CHECKهای حال، با محافظ خاموش در تراکنشی که برمی‌گردد.
        const checks = await conn.db
          .transaction(async (tx) => {
            await tx.execute(sql`ALTER TABLE support_threads DISABLE TRIGGER support_threads_guard`);
            const check = (patch: Partial<typeof supportThreads.$inferInsert>) =>
              rejectedConstraint(tx.transaction((inner) => inner.update(supportThreads).set(patch).where(byId)));
            const found = [
              await check({ status: 'pending' as never }),
              await check({ status: 'answered' }),
              await check({ waitingSince: null }),
              await check({ lastMessageAt: new Date(thread!.createdAt.getTime() - 1) }),
              await check({ waitingSince: new Date(thread!.createdAt.getTime() - 1) }),
            ];
            throw Object.assign(new Error('rollback'), { found });
          })
          .catch((error: { found?: (string | undefined)[] }) => error.found);
        expect(checks).toEqual(['support_threads_status', 'support_threads_waiting', 'support_threads_waiting', 'support_threads_times', 'support_threads_times']);
        expect((await threadOf(thread!.id)).status).toBe('open');

        expect(await rejectedConstraint(conn.db.delete(supportThreads).where(byId))).toBe('support_threads_kept');
        expect(await rejectedConstraint(conn.db.delete(supportThreads).where(eq(supportThreads.id, general!.id)))).toBe('support_threads_kept');
        // گفت‌وگوی سفارش و پیام‌هایش فقط با خود سفارش می‌روند (cascade).
        await messageRow(thread!.id);
        await conn.db.delete(orders).where(eq(orders.id, order.id));
        expect(await conn.db.select().from(supportThreads).where(byId)).toEqual([]);
        expect(await conn.db.select().from(supportMessages).where(eq(supportMessages.threadId, thread!.id))).toEqual([]);
        expect(await conn.db.select().from(supportThreads).where(eq(supportThreads.id, general!.id))).toHaveLength(1);
      });

      it('محافظ‌های پیام (0057 و 0058): شکل، فقط افزودنی، ترتیب، بستن یک بار، و حال گفت‌وگو پس از هر پیام', async () => {
        const order = await orderFor();
        const t0 = tick();
        const [thread] = await threadRow({ userId: order.userId, orderId: order.id, createdAt: t0, customerSeenAt: t0 });
        const id = thread!.id;
        // پستگرس CHECKها را به ترتیب نام می‌سنجد؛ نوع ناشناس با نویسنده و متنی که برای خودش درست است.
        expect(await rejectedConstraint(messageRow(id, { kind: 'note' as never, adminUserId: ali }))).toBe('support_messages_kind');
        expect(await rejectedConstraint(messageRow(id, { adminUserId: ali }))).toBe('support_messages_author');
        expect(await rejectedConstraint(messageRow(id, { kind: 'staff' }))).toBe('support_messages_author');
        expect(await rejectedConstraint(messageRow(id, { body: ' \n ' }))).toBe('support_messages_body');
        expect(await rejectedConstraint(messageRow(id, { body: 'سلام\n' }))).toBe('support_messages_body');
        expect(await rejectedConstraint(messageRow(id, { body: null }))).toBe('support_messages_body');
        expect(await rejectedConstraint(messageRow(id, { body: 'ن'.repeat(1001) }))).toBe('support_messages_body');
        expect(await rejectedConstraint(messageRow(id, { kind: 'staff', adminUserId: ali, body: 'ن'.repeat(2001) }))).toBe('support_messages_body');
        expect(await rejectedConstraint(messageRow(id, { kind: 'closed', adminUserId: ali }))).toBe('support_messages_body');
        expect((await threadOf(id)).lastMessageAt).toEqual(t0);

        const [first] = await messageRow(id, { body: 'ن'.repeat(1000) });
        // پیام مشتری در گفت‌وگوی باز: انتظار همان قبلی.
        expect(await threadOf(id)).toMatchObject({ status: 'open', waitingSince: t0, lastMessageAt: first!.createdAt });
        expect(await rejectedConstraint(messageRow(id, { createdAt: new Date(first!.createdAt.getTime() - 1) }))).toBe('support_messages_order');
        expect(await rejectedConstraint(messageRow(id, { requestId: first!.requestId }))).toBe('support_messages_request');

        const [reply] = await messageRow(id, { kind: 'staff', adminUserId: ali, body: 'ن'.repeat(2000) });
        expect(await threadOf(id)).toMatchObject({ status: 'answered', waitingSince: null, lastMessageAt: reply!.createdAt });
        const [again] = await messageRow(id);
        expect(await threadOf(id)).toMatchObject({ status: 'open', waitingSince: again!.createdAt, lastMessageAt: again!.createdAt });
        const [closed] = await messageRow(id, { kind: 'closed', adminUserId: ali, body: null });
        expect(await threadOf(id)).toMatchObject({ status: 'closed', waitingSince: null, lastMessageAt: again!.createdAt });
        expect(await rejectedConstraint(messageRow(id, { kind: 'closed', adminUserId: ali, body: null }))).toBe('support_messages_close_once');
        // پاسخ ما گفت‌وگوی بسته را «پاسخ داده شد» می‌کند، و بعد بستن دوباره ممکن است.
        await messageRow(id, { kind: 'staff', adminUserId: ali, body: 'یک نکتهٔ دیگر.' });
        expect((await threadOf(id)).status).toBe('answered');
        expect(await rejectedConstraint(messageRow(id, { kind: 'closed', adminUserId: ali, body: null }))).toBeUndefined();

        const byId = eq(supportMessages.id, first!.id);
        expect(await rejectedConstraint(conn.db.update(supportMessages).set({ body: 'متن دیگر' }).where(byId))).toBe('support_messages_append_only');
        expect(await rejectedConstraint(conn.db.update(supportMessages).set({ createdAt: tick() }).where(eq(supportMessages.id, closed!.id)))).toBe(
          'support_messages_append_only',
        );
        expect(await rejectedConstraint(conn.db.delete(supportMessages).where(byId))).toBe('support_messages_append_only');
        expect(await conn.db.select().from(supportMessages).where(eq(supportMessages.threadId, id))).toHaveLength(6);
      });

      it('پیامک پاسخ (0058): فقط ردیف تازهٔ همین هدف به موبایل همین مشتری با موضوع همین گفت‌وگو؛ و «در حال فرستادن» فقط تا مشتری پاسخ را ندیده', async () => {
        const order = await orderFor();
        const t0 = tick();
        const [thread] = await threadRow({ userId: order.userId, orderId: order.id, createdAt: t0, customerSeenAt: t0 });
        const id = thread!.id;
        const queue = (toMobile = MOBILE, orderNumber: number | null = order.orderNumber) => queuedSupportSms(conn.db, { toMobile, orderNumber, at: tick() });
        const staff = async (smsMessageId: number) =>
          rejectedConstraint(messageRow(id, { kind: 'staff', adminUserId: ali, body: 'پاسخ', smsMessageId }));
        expect(await staff(await queue(OTHER_MOBILE))).toBe('support_messages_sms');
        expect(await staff(await queue(MOBILE, null))).toBe('support_messages_sms');
        expect(await staff(await queue(MOBILE, order.orderNumber + 1))).toBe('support_messages_sms');
        const partner = await queuedPartnerSms(conn.db, { toMobile: MOBILE, orderNumber: order.orderNumber, handoffDay: 'دوشنبه 13 مهر', at: tick() });
        expect(await staff(partner)).toBe('support_messages_sms');
        const [logged] = await conn.db
          .insert(smsMessages)
          .values({ provider: 'console', toMobile: MOBILE, purpose: 'support_reply', body: supportReplyText(order.orderNumber), params: [`سفارش ${order.orderNumber}`], status: 'logged', sentAt: new Date() })
          .returning();
        expect(await staff(logged!.id)).toBe('support_messages_sms');
        const [tried] = await conn.db
          .insert(smsMessages)
          .values({ provider: 'queued', toMobile: MOBILE, purpose: 'support_reply', body: supportReplyText(order.orderNumber), params: [`سفارش ${order.orderNumber}`], status: 'pending', attempts: 1 })
          .returning();
        expect(await staff(tried!.id)).toBe('support_messages_sms');
        // پیامک فقط روی پاسخ، نه پیام مشتری.
        expect(await rejectedConstraint(messageRow(id, { smsMessageId: await queue() }))).toBe('support_messages_sms_staff');

        const good = await queue();
        expect(await staff(good)).toBeUndefined();
        const [reply] = await conn.db.select().from(supportMessages).where(eq(supportMessages.smsMessageId, good));
        expect(await rejectedConstraint(messageRow(id, { kind: 'staff', adminUserId: ali, body: 'دوباره', smsMessageId: good }))).toBe('support_messages_sms');

        // «در حال فرستادن» تا مشتری پاسخ را ندیده؛ بعد نه، همان شرط `liveSms`.
        const isLive = async () => (await conn.db.select({ id: smsMessages.id }).from(smsMessages).where(and(eq(smsMessages.id, good), liveSms))).length === 1;
        expect(await isLive()).toBe(true);
        const take = () =>
          rejectedConstraint(
            conn.db
              .update(smsMessages)
              .set({ status: 'sending', attempts: sql`${smsMessages.attempts} + 1`, attemptedAt: new Date() })
              .where(eq(smsMessages.id, good)),
          );
        expect(await take()).toBeUndefined();
        await conn.db.update(smsMessages).set({ status: 'failed', error: 'unavailable' }).where(eq(smsMessages.id, good));
        await conn.db.update(supportThreads).set({ customerSeenAt: new Date(reply!.createdAt.getTime() + 1) }).where(eq(supportThreads.id, id));
        expect(await isLive()).toBe(false);
        expect(await take()).toBe('sms_messages_live');
        // شاهد: مشتری درست هم‌زمان با پاسخ (نه پس از آن) هنوز ندیده است.
        expect(await rejectedConstraint(conn.db.update(supportThreads).set({ customerSeenAt: reply!.createdAt }).where(eq(supportThreads.id, id)))).toBe(
          'support_threads_seen',
        );
      });

      it('سقف هر مشتری زیر قفل (0058): سه گفت‌وگوی باز، ۱۰ پیام در ساعت، و پیام‌های هم‌زمان', async () => {
        const support = createSupportStore(conn);
        const mine = [await orderFor(), await orderFor(), await orderFor()];
        const userId = mine[0]!.userId;
        const post = (target: SupportTarget, at = tick()) => support.post({ userId, target, body: 'سلام', requestId: randomUUID(), at });
        const a = await post({ kind: 'order', orderId: mine[0]!.id });
        const b = await post({ kind: 'order', orderId: mine[1]!.id });
        const general = await post({ kind: 'general' });
        expect([a.ok, b.ok, general.ok]).toEqual([true, true, true]);
        if (!a.ok || !general.ok) throw new Error('گفت‌وگو ساخته نشد');
        // چهارمی نه، و گفت‌وگویی هم نمی‌ماند.
        expect(await post({ kind: 'order', orderId: mine[2]!.id })).toEqual({ ok: false, reason: 'open_threads' });
        expect(await conn.db.select().from(supportThreads).where(eq(supportThreads.orderId, mine[2]!.id))).toEqual([]);
        // شاهد: پیام به گفت‌وگوی باز.
        expect(await post({ kind: 'general' })).toMatchObject({ ok: true, threadId: general.threadId });
        // پاسخ ما یکی را از «باز» بیرون می‌برد؛ حالا چهارمی جا دارد، و باز کردن دوبارهٔ پاسخ‌داده چهارمی است.
        expect(await support.reply({ threadId: a.threadId, adminUserId: ali, body: 'پاسخ', requestId: randomUUID(), at: tick(), event: { adminUserId: ali } })).toMatchObject({ ok: true });
        expect(await post({ kind: 'order', orderId: mine[2]!.id })).toMatchObject({ ok: true });
        expect(await post({ kind: 'thread', threadId: a.threadId })).toEqual({ ok: false, reason: 'open_threads' });
        expect((await threadOf(a.threadId)).status).toBe('answered');

        // ۱۰ پیام در یک ساعت، مشتری دیگر؛ یازدهمی نه، و یک ساعت پس از اولی دوباره.
        const theirs = await orderFor(OTHER_MOBILE);
        const start = tick();
        const send = (minutes: number) =>
          support.post({ userId: theirs.userId, target: { kind: 'order', orderId: theirs.id }, body: `پیام ${minutes}`, requestId: randomUUID(), at: new Date(start.getTime() + minutes * 60_000) });
        for (let i = 0; i < 10; i += 1) expect((await send(i)).ok).toBe(true);
        expect(await send(10)).toEqual({ ok: false, reason: 'rate' });
        expect(await send(59.99)).toEqual({ ok: false, reason: 'rate' });
        expect((await send(60.01)).ok).toBe(true);
        clock = start.getTime() + 61 * 60_000;

        // هم‌زمان: دوازده پیام یک مشتری با یک زمان؛ ده تا، و یک گفت‌وگو.
        const third = await orderFor('09131234567');
        const at = tick();
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            support.post({ userId: third.userId, target: { kind: 'order', orderId: third.id }, body: `هم‌زمان ${i}`, requestId: randomUUID(), at }),
          ),
        );
        expect(results.filter((r) => r.ok)).toHaveLength(10);
        expect(results.flatMap((r) => (r.ok ? [] : [r.reason]))).toEqual(['rate', 'rate']);
        expect(await conn.db.select().from(supportThreads).where(eq(supportThreads.userId, third.userId))).toHaveLength(1);
      });

      it('قفل مشورتی در خود محافظ (0058): پیام مستقیم مشتری، بی ذخیره‌گاه، پشت پیام هم‌زمانش در گفت‌وگوی دیگر می‌ماند', async () => {
        // دو گفت‌وگوی باز و دو پاسخ‌داده؛ هر پیام تازه در یکی از پاسخ‌داده‌ها گفت‌وگوی سوم را باز می‌کند.
        const userId = (await orderFor()).userId;
        const threads: number[] = [];
        for (let i = 0; i < 4; i += 1) {
          const [thread] = await threadRow({ userId, orderId: (await orderFor()).id });
          await messageRow(thread!.id);
          if (i >= 2) await messageRow(thread!.id, { kind: 'staff', adminUserId: ali, body: 'پاسخ' });
          threads.push(thread!.id);
        }
        const codeOf = (error: unknown) => (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
        // اولی در تراکنشی باز می‌ماند؛ دومی، از اتصال دیگر، تا ۳۰۰ میلی‌ثانیه پشت قفل همان مشتری صبر می‌کند و نمی‌رسد. بی قفل، هر دو سومی
        // را باز می‌دیدند و چهار گفت‌وگوی باز می‌ماند.
        const second = await conn.db
          .transaction(async (tx) => {
            await tx.insert(supportMessages).values({ threadId: threads[2]!, kind: 'customer', body: 'یک چیز دیگر', requestId: randomUUID(), createdAt: tick() });
            const outcome = await conn.db
              .transaction(async (other) => {
                await other.execute(sql`SET LOCAL lock_timeout = '300ms'`);
                await other.insert(supportMessages).values({ threadId: threads[3]!, kind: 'customer', body: 'من هم', requestId: randomUUID(), createdAt: tick() });
                return 'inserted';
              })
              .catch(codeOf);
            throw Object.assign(new Error('rollback'), { outcome });
          })
          .catch((error: { outcome?: string }) => error.outcome);
        expect(second).toBe('55P03');
        expect((await conn.db.select().from(supportThreads).where(eq(supportThreads.userId, userId))).map((t) => t.status).sort()).toEqual([
          'answered',
          'answered',
          'open',
          'open',
        ]);
      });

      it('ذخیره‌گاه: پیام مشتری، دو کلیک و فرم کهنه، نمای مشتری بی نام ادمین، پاسخ با پیامک و رویداد بی متن، یک خبر برای پاسخ‌های پشت‌سرهم، و بستن از همان که دیده شد', async () => {
        const support = createSupportStore(conn);
        const order = await orderFor();
        const userId = order.userId;
        const theirs = await orderFor(OTHER_MOBILE);
        const body = 'سلام. پنجشنبه امتحان دارم؛ تا چهارشنبه به مشهد می‌رسد؟';
        const requestId = randomUUID();
        const t1 = tick();
        const target = { kind: 'order', orderId: order.id } as const;
        const sent = await support.post({ userId, target, body, requestId, at: t1 });
        if (!sent.ok) throw new Error('پیام ثبت نشد');
        expect(sent.duplicate).toBe(false);
        expect(await threadOf(sent.threadId)).toMatchObject({ status: 'open', createdAt: t1, waitingSince: t1, customerSeenAt: t1 });
        expect(await support.post({ userId, target, body, requestId, at: tick() })).toEqual({ ok: true, threadId: sent.threadId, messageId: sent.messageId, duplicate: true });
        expect(await support.post({ userId, target, body: 'متن دیگر', requestId, at: tick() })).toEqual({ ok: false, reason: 'stale' });
        expect(await support.post({ userId: theirs.userId, target: { kind: 'general' }, body, requestId, at: tick() })).toEqual({ ok: false, reason: 'stale' });
        expect(await support.post({ userId, target: { kind: 'order', orderId: theirs.id }, body, requestId: randomUUID(), at: tick() })).toEqual({ ok: false, reason: 'not_found' });
        expect(await support.post({ userId: theirs.userId, target: { kind: 'thread', threadId: sent.threadId }, body, requestId: randomUUID(), at: tick() })).toEqual({
          ok: false,
          reason: 'not_found',
        });
        // مشتری بی هیچ سفارشی «سؤال کلی» ندارد (سؤال ۳۰۶).
        const lonely = await customerOf('09141234567');
        expect(await support.post({ userId: lonely, target: { kind: 'general' }, body, requestId: randomUUID(), at: tick() })).toEqual({ ok: false, reason: 'no_orders' });

        expect(await support.customerThreads(userId)).toEqual([
          { id: sent.threadId, orderNumber: order.orderNumber, status: 'open', lastMessageAt: t1, last: { kind: 'customer', body, at: t1 }, unseen: false },
        ]);
        expect(await support.customerOrderThread(userId, order.id)).toEqual({ id: sent.threadId, status: 'open', unseen: false });
        expect(await support.customerOrderThread(theirs.userId, order.id)).toBeNull();
        expect(await support.customerThread(theirs.userId, sent.threadId)).toBeNull();

        const reply = (text: string, over: { requestId?: string } = {}) =>
          support.reply({ threadId: sent.threadId, adminUserId: ali, body: text, requestId: over.requestId ?? randomUUID(), at: tick(), event: { adminUserId: ali, ipHash: 'ip' } });
        const answer = 'سلام. جزوه‌ات امروز چاپ و تحویل پست می‌شود و تا چهارشنبه به مشهد می‌رسد.';
        const firstRequest = randomUUID();
        const r1 = await reply(answer, { requestId: firstRequest });
        if (!r1.ok || r1.smsId === null) throw new Error('پاسخ یا پیامکش ثبت نشد');
        expect(r1).toMatchObject({ duplicate: false, orderNumber: order.orderNumber });
        const [sms1] = await conn.db.select().from(smsMessages).where(eq(smsMessages.id, r1.smsId));
        expect(sms1).toMatchObject({ purpose: 'support_reply', toMobile: MOBILE, status: 'pending', attempts: 0, params: [`سفارش ${order.orderNumber}`] });
        expect(sms1!.body).toBe(supportReplyText(order.orderNumber));
        expect(await reply(answer, { requestId: firstRequest })).toEqual({ ok: true, messageId: r1.messageId, smsId: r1.smsId, duplicate: true, orderNumber: order.orderNumber });
        expect(await reply('متن دیگر', { requestId: firstRequest })).toEqual({ ok: false, reason: 'stale' });
        expect(await support.customerThreads(userId)).toMatchObject([{ status: 'answered', unseen: true, last: { kind: 'staff', body: answer } }]);
        expect(await support.customerOrderThread(userId, order.id)).toMatchObject({ status: 'answered', unseen: true });

        // پاسخ دوم پیش از آنکه مشتری ببیند: همان خبر کافی است.
        const r2 = await reply('یک نکتهٔ دیگر هم بگویم.');
        expect(r2).toMatchObject({ ok: true, smsId: null });
        // مشتری دید: پیامک قبلی دیگر زنده نیست، و پاسخ بعدی خبر تازه می‌گیرد.
        await support.markSeen(userId, sent.threadId, tick());
        await support.markSeen(theirs.userId, sent.threadId, tick(60_000));
        expect((await threadOf(sent.threadId)).customerSeenAt!.getTime()).toBeLessThan(clock);
        expect(await support.customerThreads(userId)).toMatchObject([{ unseen: false }]);
        expect((await conn.db.select({ id: smsMessages.id }).from(smsMessages).where(and(eq(smsMessages.id, r1.smsId), liveSms))).length).toBe(0);
        const r3 = await reply('پیگیری: امروز تحویل پست شد.');
        if (!r3.ok || r3.smsId === null) throw new Error('پیامک تازه ساخته نشد');
        // پیامکی که نرفت خبری نبود: پاسخ بعدی پیامک تازه می‌گیرد.
        await conn.db.update(smsMessages).set({ status: 'sending', attempts: 1, attemptedAt: tick() }).where(eq(smsMessages.id, r3.smsId));
        await conn.db.update(smsMessages).set({ status: 'failed', error: 'unavailable' }).where(eq(smsMessages.id, r3.smsId));
        // هشدار پیشخوان (سؤال ۳۱۲): پیامک آخرین پاسخ نرفت و مشتری آن پاسخ را ندیده؛ پاسخ پیش از `since` نه.
        const since = new Date(t1.getTime() - 1);
        const failure = { threadId: sent.threadId, orderNumber: order.orderNumber, customer: 'سارا احمدی' };
        expect(await support.replySmsFailed({ since, stuckBefore: tick() })).toEqual([failure]);
        expect(await support.replySmsFailed({ since: tick(), stuckBefore: tick() })).toEqual([]);
        const r4 = await reply('کد رهگیری را هم پیامک کردیم.');
        if (!r4.ok || r4.smsId === null) throw new Error('پیامک پس از شکست ساخته نشد');
        expect(await support.replySms(r4.messageId)).toMatchObject({
          threadId: sent.threadId,
          messageId: r4.messageId,
          orderNumber: order.orderNumber,
          newer: false,
          sms: { id: r4.smsId, status: 'pending' },
        });
        // پیامک پاسخ تازه‌تر همان خبر است: پیامک r3 دیگر «دوباره» نمی‌رود و هشدار فقط پیامک آخرین پاسخ را می‌سنجد، که هنوز «منتظر» است و نمانده.
        expect(await support.replySms(r3.messageId)).toMatchObject({ newer: true, sms: { id: r3.smsId, status: 'failed' } });
        expect(await support.replySmsFailed({ since, stuckBefore: new Date(clock - 60_000) })).toEqual([]);
        expect(await support.replySmsFailed({ since, stuckBefore: tick() })).toEqual([failure]);
        expect(await support.replySms(sent.messageId)).toBeNull();
        expect(await support.replySms(r2.ok ? r2.messageId : 0)).toBeNull();

        const logged = await conn.db
          .select()
          .from(adminEvents)
          .where(and(eq(adminEvents.targetType, SUPPORT_TARGET), eq(adminEvents.targetId, String(sent.threadId))))
          .orderBy(asc(adminEvents.id));
        expect(logged.map((e) => [e.action, e.adminUserId, e.ipHash, (e.detail as { sms: string }).sms])).toEqual([
          ['support.reply', ali, 'ip', 'queued'],
          ['support.reply', ali, 'ip', 'skipped'],
          ['support.reply', ali, 'ip', 'queued'],
          ['support.reply', ali, 'ip', 'queued'],
        ]);
        expect(logged[0]!.detail).toEqual({ thread: sent.threadId, orderNumber: order.orderNumber, customer: null, message: r1.messageId, sms: 'queued' });
        expect(JSON.stringify(logged)).not.toContain('چاپ');

        // بستن فقط از آخرین پیامی که ادمین دید.
        const close = (seenMessageId: number | null, closeRequest = randomUUID()) =>
          support.close({ threadId: sent.threadId, adminUserId: ali, requestId: closeRequest, seenMessageId, at: tick(), event: { adminUserId: ali, ipHash: 'ip' } });
        expect(await close(r3.messageId)).toEqual({ ok: false, reason: 'stale' });
        expect(await close(null)).toEqual({ ok: false, reason: 'stale' });
        const closeRequest = randomUUID();
        expect(await close(r4.messageId, closeRequest)).toEqual({ ok: true, duplicate: false, orderNumber: order.orderNumber });
        expect(await close(r4.messageId, closeRequest)).toEqual({ ok: true, duplicate: true, orderNumber: order.orderNumber });
        expect(await close(r4.messageId)).toEqual({ ok: false, reason: 'closed' });
        expect(await support.close({ threadId: 999_999_999, adminUserId: ali, requestId: randomUUID(), seenMessageId: null, at: tick(), event: { adminUserId: ali } })).toEqual({
          ok: false,
          reason: 'not_found',
        });
        expect((await conn.db.select().from(adminEvents).where(and(eq(adminEvents.action, 'support.close'), eq(adminEvents.targetId, String(sent.threadId))))).map((e) => e.detail)).toEqual([
          { thread: sent.threadId, orderNumber: order.orderNumber, customer: null },
        ]);
        // مشتری دوباره می‌نویسد: باز، با انتظار از همان پیام.
        const reopenAt = tick();
        expect(await support.post({ userId, target: { kind: 'thread', threadId: sent.threadId }, body: 'ممنون. رسید.', requestId: randomUUID(), at: reopenAt })).toMatchObject({ ok: true });
        expect(await threadOf(sent.threadId)).toMatchObject({ status: 'open', waitingSince: reopenAt });
        const view = await support.customerThread(userId, sent.threadId);
        expect(view).toMatchObject({ id: sent.threadId, orderNumber: order.orderNumber, orderToken: order.publicToken, orderStatus: 'awaiting_payment', status: 'open' });
        expect(view!.messages.map((m) => m.kind)).toEqual(['customer', 'staff', 'staff', 'staff', 'staff', 'closed', 'customer']);
        expect(view!.messages[5]!.body).toBeNull();
        expect(JSON.stringify(view)).not.toContain('علی');
        // مشتری پاسخ‌ها را دید: پیامکی که نرفت دیگر هشدار نیست.
        await support.markSeen(userId, sent.threadId, tick());
        expect(await support.replySmsFailed({ since, stuckBefore: tick() })).toEqual([]);
      });

      it('صندوق پنل: چیپ‌ها و شمارها، «باز» قدیمی‌ترین انتظار اول، جست‌وجو، گفت‌وگو با مشتری و سفارش و تاریخچه، و کارت سفارش', async () => {
        const support = createSupportStore(conn);
        const sara = await orderFor();
        const maryam = await orderFor(OTHER_MOBILE, { recipientName: 'مریم کاظمی' });
        const post = (userId: string, target: SupportTarget, text: string) => support.post({ userId, target, body: text, requestId: randomUUID(), at: tick(60_000) });
        const a = await post(sara.userId, { kind: 'order', orderId: sara.id }, 'جزوه‌ام کی می‌رسد؟');
        const b = await post(maryam.userId, { kind: 'general' }, 'صورت‌حساب رسمی می‌دهید؟');
        const c = await post(sara.userId, { kind: 'general' }, 'صحافی فنری هم دارید؟');
        const d = await post(maryam.userId, { kind: 'order', orderId: maryam.id }, 'نشانی را عوض کنم؟');
        if (!a.ok || !b.ok || !c.ok || !d.ok) throw new Error('گفت‌وگوها ساخته نشدند');
        const replied = await support.reply({ threadId: c.threadId, adminUserId: ali, body: 'فعلاً فقط طلق و سیم.', requestId: randomUUID(), at: tick(60_000), event: { adminUserId: ali } });
        if (!replied.ok) throw new Error('پاسخ ثبت نشد');
        const dMessages = await conn.db.select().from(supportMessages).where(eq(supportMessages.threadId, d.threadId));
        expect(await support.close({ threadId: d.threadId, adminUserId: ali, requestId: randomUUID(), seenMessageId: dMessages[0]!.id, at: tick(60_000), event: { adminUserId: ali } })).toMatchObject({
          ok: true,
        });

        const ids = (page: InboxPage) => page.lines.map((line) => line.id);
        const all = await support.inbox({ bucket: 'all', search: null, limit: 20, offset: 0 });
        expect(all.counts).toEqual({ open: 2, answered: 1, closed: 1, all: 4 });
        // «همه» تازه‌ترین پیام اول؛ بستن پیام نیست.
        expect(ids(all)).toEqual([c.threadId, d.threadId, b.threadId, a.threadId]);
        const open = await support.inbox({ bucket: 'open', search: null, limit: 20, offset: 0 });
        expect(ids(open)).toEqual([a.threadId, b.threadId]);
        expect(open.lines[0]).toMatchObject({
          status: 'open',
          orderNumber: sara.orderNumber,
          orderStatus: 'awaiting_payment',
          customer: { userId: sara.userId, mobile: MOBILE, name: 'سارا احمدی', provinceId: 8, cityId: 394, place: 'تهران' },
          last: { kind: 'customer', body: 'جزوه‌ام کی می‌رسد؟' },
        });
        // «سؤال کلی» نام و شهر را از تازه‌ترین سفارش مشتری دارد.
        expect(open.lines[1]).toMatchObject({ orderNumber: null, orderStatus: null, customer: { mobile: OTHER_MOBILE, name: 'مریم کاظمی' } });
        expect(ids(await support.inbox({ bucket: 'open', search: null, limit: 1, offset: 1 }))).toEqual([b.threadId]);
        expect(ids(await support.inbox({ bucket: 'answered', search: null, limit: 20, offset: 0 }))).toEqual([c.threadId]);
        expect(ids(await support.inbox({ bucket: 'closed', search: null, limit: 20, offset: 0 }))).toEqual([d.threadId]);

        const byMobile = await support.inbox({ bucket: 'all', search: { kind: 'mobile', mobile: OTHER_MOBILE }, limit: 20, offset: 0 });
        expect([ids(byMobile), byMobile.counts]).toEqual([[d.threadId, b.threadId], { open: 1, answered: 0, closed: 1, all: 2 }]);
        expect(ids(await support.inbox({ bucket: 'all', search: { kind: 'digits', orderNumber: sara.orderNumber, phoneSuffix: null }, limit: 20, offset: 0 }))).toEqual([a.threadId]);
        expect(ids(await support.inbox({ bucket: 'all', search: { kind: 'digits', orderNumber: null, phoneSuffix: '4455' }, limit: 20, offset: 0 }))).toEqual([d.threadId, b.threadId]);
        expect(ids(await support.inbox({ bucket: 'all', search: { kind: 'name', text: 'مریم' }, limit: 20, offset: 0 }))).toEqual([d.threadId, b.threadId]);
        expect(ids(await support.inbox({ bucket: 'all', search: { kind: 'name', text: '%' }, limit: 20, offset: 0 }))).toEqual([]);

        expect(await support.openSummary()).toEqual({ count: 2, oldestWaiting: (await threadOf(a.threadId)).waitingSince });

        const thread = await support.panelThread(c.threadId);
        expect(thread).toMatchObject({
          id: c.threadId,
          status: 'answered',
          waitingSince: null,
          customer: { mobile: MOBILE, name: 'سارا احمدی' },
          order: null,
          history: { orders: 1, paid: 0, others: [{ id: a.threadId, orderNumber: sara.orderNumber, status: 'open' }] },
        });
        expect(thread!.messages.map((m) => [m.kind, m.adminName, m.sms?.status ?? null])).toEqual([
          ['customer', null, null],
          ['staff', 'علی', 'pending'],
        ]);
        expect(await support.panelThread(a.threadId)).toMatchObject({ order: { id: sara.id, number: sara.orderNumber, status: 'awaiting_payment', partnerName: null } });
        expect(await support.panelThread(999_999_999)).toBeNull();

        expect(await support.orderThread(sara.id)).toEqual({ id: a.threadId, status: 'open', messages: 1, last: { kind: 'customer', adminName: null, at: expect.any(Date) } });
        expect(await support.orderThread(maryam.id)).toMatchObject({ id: d.threadId, status: 'closed', messages: 1, last: { kind: 'closed', adminName: 'علی' } });
        expect(await support.orderThread((await orderFor()).id)).toBeNull();
      });

      it('دروازهٔ «سفارش‌های من» (سؤال ۳۰۶): فقط شماره‌ای که سفارشی دارد، در هر وضعیتی', async () => {
        const auth = createAuthStore(conn);
        const readyOf = async (mobile: string) => {
          let ready: boolean | undefined;
          await auth.issueOtp(
            { mobile, ipHash: 'ip-o', sessionHash: 'f'.repeat(64), hourSince: new Date(), daySince: new Date(), gate: { kind: 'orders' } },
            (counts) => {
              ready = counts.ready;
              return null;
            },
          );
          return ready;
        };
        expect(await readyOf(OTHER_MOBILE)).toBe(false);
        // کاربری که از مسیر خرید وارد شد ولی سفارشی نداد هم نه.
        await customerOf(OTHER_MOBILE);
        expect(await readyOf(OTHER_MOBILE)).toBe(false);
        const order = await orderFor(OTHER_MOBILE);
        expect(await readyOf(OTHER_MOBILE)).toBe(true);
        // شاهد: شمارهٔ دیگر، حالا که سفارشی در پایگاه داده هست، هنوز نه.
        expect(await readyOf('09121112233')).toBe(false);
        await conn.db.update(orders).set({ status: 'expired' }).where(eq(orders.id, order.id));
        expect(await readyOf(OTHER_MOBILE)).toBe(true);
        // دروازهٔ جزوه همان شماره را بی سند همین مرورگر نمی‌پذیرد (شاهد جدایی دو دروازه).
        let documentsReady: boolean | undefined;
        await auth.issueOtp(
          { mobile: OTHER_MOBILE, ipHash: 'ip-o', sessionHash: 'f'.repeat(64), hourSince: new Date(), daySince: new Date(), gate: { kind: 'documents', readyUntil: new Date() } },
          (counts) => {
            documentsReady = counts.ready;
            return null;
          },
        );
        expect(documentsReady).toBe(false);
      });

      it('«سفارش‌های من»: همین مشتری تازه‌ترین اول، بی منقضی و پرداخت‌نشدنی (جز در حال بررسی)، با فایل و صفحه و پرداخت و بازپرداخت، و صفحه‌بندی', async () => {
        const account = createAccountStore(conn);
        const store = createOrderStore(conn);
        const first = await orderFor();
        const expired = await orderFor();
        const checking = await orderFor();
        const cancelled = await orderFor();
        const last = await orderFor();
        await orderFor(OTHER_MOBILE);
        const userId = first.userId;
        await conn.db.update(orders).set({ status: 'expired' }).where(eq(orders.id, expired.id));
        // پرداختی که درگاه گفت «پرداخت‌شده» و هنوز نهایی نیست.
        const held = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
        await store.insertPayment({ orderId: checking.id, provider: 'mock', amountRials: checking.totalRials, authority: held, raw: null });
        await conn.db.update(payments).set({ gatewayStatus: 1 }).where(eq(payments.authority, held));
        // پرداخت‌شده‌ای که لغو شد و پولش دستی برگشت.
        const paid = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
        await store.insertPayment({ orderId: cancelled.id, provider: 'mock', amountRials: cancelled.totalRials, authority: paid, raw: null });
        const paidAt = new Date();
        await store.settlePayment('mock', paid, async ({ payment }) => ({
          kind: 'succeeded',
          verifiedAmountRials: payment.amountRials,
          refId: '803117',
          cardMask: null,
          raw: { decision: 'success' },
          paidAt,
          postHandoffDueAt: new Date(paidAt.getTime() + 2 * 86_400_000),
        }));
        await conn.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, cancelled.id));
        const [payment] = await conn.db.select().from(payments).where(eq(payments.authority, paid));
        await conn.db.insert(refunds).values({
          orderId: cancelled.id,
          paymentId: payment!.id,
          amountRials: cancelled.totalRials,
          method: 'manual',
          status: 'succeeded',
          reference: '552190',
          refundedOn: new Date(),
          adminUserId: ali,
          createdAt: new Date(),
          finishedAt: new Date(),
        });

        const now = new Date();
        const listed = await account.customerOrders(userId, { at: now, limit: 20, offset: 0 });
        expect(listed.total).toBe(4);
        expect(listed.rows.map((row) => row.order.orderNumber)).toEqual([last.orderNumber, cancelled.orderNumber, checking.orderNumber, first.orderNumber]);
        const byNumber = new Map(listed.rows.map((row) => [row.order.orderNumber, row]));
        expect(byNumber.get(first.orderNumber)).toMatchObject({
          order: { id: first.id, publicToken: first.publicToken, status: 'awaiting_payment', totalRials: first.totalRials, paidAt: null },
          fileCount: 2,
          pageCount: 102,
          payments: [],
          parcels: [],
          refunds: [],
        });
        expect(byNumber.get(checking.orderNumber)!.payments.map((p) => p.authority)).toEqual([held]);
        expect(byNumber.get(cancelled.orderNumber)).toMatchObject({ order: { status: 'cancelled', paidAt }, refunds: [{ method: 'manual', status: 'succeeded' }] });
        expect(byNumber.get(cancelled.orderNumber)!.payments.map((p) => p.status)).toEqual(['succeeded']);

        // فایل‌ها تا یک ساعت دیگر می‌روند: در انتظار پرداختِ بی بررسی دیگر نیست، و در حال بررسی می‌ماند.
        const soonest = Math.min(...(await conn.db.select().from(documents).where(inArray(documents.id, docIds))).map((d) => d.fileExpiresAt!.getTime()));
        const late = await account.customerOrders(userId, { at: new Date(soonest - 30 * 60_000), limit: 20, offset: 0 });
        expect(late.rows.map((row) => row.order.orderNumber)).toEqual([cancelled.orderNumber, checking.orderNumber]);
        const early = await account.customerOrders(userId, { at: new Date(soonest - 61 * 60_000), limit: 20, offset: 0 });
        expect(early.total).toBe(4);
        expect(early.rows[0]!.filesLiveUntil!.getTime()).toBe(soonest);
        // فایلی که پاک شد: همان.
        await conn.db.update(documents).set({ fileDeletedAt: new Date() }).where(eq(documents.id, docIds[1]!));
        try {
          const gone = await account.customerOrders(userId, { at: now, limit: 20, offset: 0 });
          expect(gone.rows.map((row) => [row.order.orderNumber, row.filesLiveUntil])).toEqual([
            [cancelled.orderNumber, null],
            [checking.orderNumber, null],
          ]);
        } finally {
          await conn.db.update(documents).set({ fileDeletedAt: null }).where(eq(documents.id, docIds[1]!));
        }

        // صفحه‌بندی و شمار کل، صفحهٔ بعد از آخر هم.
        const second = await account.customerOrders(userId, { at: now, limit: 3, offset: 3 });
        expect([second.total, second.rows.map((row) => row.order.orderNumber)]).toEqual([4, [first.orderNumber]]);
        expect(await account.customerOrders(userId, { at: now, limit: 3, offset: 9 })).toEqual({ rows: [], total: 4 });
        expect(await account.customerOrders(await customerOf('09141234567'), { at: now, limit: 20, offset: 0 })).toEqual({ rows: [], total: 0 });
        expect((await account.customerOrder(userId, cancelled.orderNumber, now))?.order.id).toBe(cancelled.id);
        expect(await account.customerOrder(userId, expired.orderNumber, now)).toBeNull();
        expect(await account.customerOrder(await customerOf(OTHER_MOBILE), first.orderNumber, now)).toBeNull();
        // پیام دربارهٔ سفارش: هر سفارش همین مشتری، منقضی هم، و سفارش دیگری هرگز.
        expect(await account.ownedOrderId(userId, expired.orderNumber)).toBe(expired.id);
        expect(await account.ownedOrderId(await customerOf(OTHER_MOBILE), first.orderNumber)).toBeNull();
        expect(await account.ownedOrderId(userId, 99_999_999)).toBeNull();
      });

      it('«در حال بررسی» در SQL همان `isChecking` است، در همهٔ ترکیب‌ها', async () => {
        const combos = [];
        for (const status of ['pending', 'succeeded', 'failed'] as const) {
          for (const gatewayStatus of [null, 1, 2, 3, 100, -1]) {
            for (const returned of [false, true]) {
              for (const gatewayError of [null, 'timeout']) combos.push({ status, gatewayStatus, returnedAt: returned ? new Date() : null, gatewayError });
            }
          }
        }
        const values = sql.join(
          combos.map(
            (c, i) => sql`(${i}::int, ${c.status}::text, ${c.gatewayStatus}::int, ${c.returnedAt?.toISOString() ?? null}::timestamptz, ${c.gatewayError}::text)`,
          ),
          sql`, `,
        );
        const rows = (await conn.db.execute(sql`
          SELECT p.n, (${checkingPaymentSql}) AS checking
            FROM (VALUES ${values}) AS p(n, status, gateway_status, returned_at, gateway_error)
           ORDER BY p.n`)) as unknown as { n: number; checking: boolean }[];
        expect(rows.map((row) => row.checking)).toEqual(combos.map((c) => isChecking(c)));
        expect(rows.filter((row) => row.checking).length).toBeGreaterThan(0);
      });
    });
  });
  describe('پنل ادمین روی پستگرس (برش ۴٫۱)', () => {
    const at = new Date('2026-10-05T07:50:00Z');
    const later = (ms: number) => new Date(at.getTime() + ms);
    const event = (action: string, adminUserId: string | null = null): AdminEventInput => ({ adminUserId, action, at });

    /**
     * رویداد فقط افزودنی است و ادمین پاک‌نشدنی؛ تست از صفر با TRUNCATE، که تریگر ردیفی ندارد. تغییر وضعیت سفارش به
     * ادمین اشاره می‌کند (۴٫۳)، پس همان‌جا.
     */
    async function clearAdmin() {
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
    }

    function invite(username: string, extra: Partial<NewInvite> = {}): NewInvite {
      return {
        inviteId: randomUUID(),
        newUserId: randomUUID(),
        username,
        displayName: `ادمین ${username}`,
        role: 'operator',
        tokenHash: randomUUID().replace(/-/g, '').repeat(2),
        totpSealed: 'v1.sealed-invite',
        at,
        expiresAt: later(15 * 60_000),
        createdBy: null,
        allowExisting: false,
        event: { adminUserId: null, action: 'admins.invite', targetType: 'admin', detail: { username } },
        ...extra,
      };
    }

    /** ادمین ثبت‌شده با یک نشست. */
    async function enrolled(username: string, role: 'owner' | 'operator' = 'operator') {
      const store = createAdminStore(conn);
      const inv = invite(username, { role });
      const created = await store.createInvite(inv);
      if (!created.ok) throw new Error(created.reason);
      const sessionHash = randomUUID().replace(/-/g, '').repeat(2);
      await store.completeInvite({
        inviteId: inv.inviteId,
        userId: created.userId,
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$fake',
        totpSealed: 'v1.sealed-user',
        totpStep: 1,
        at,
        session: { tokenHash: sessionHash, expiresAt: later(12 * 3600_000) },
        ipHash: 'ip',
      });
      return { userId: created.userId, sessionHash, invite: inv };
    }

    beforeAll(async () => {
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
    });

    beforeEach(async () => {
      await clearAdmin();
    });

    it('نقش‌ها و مجوزها دقیقاً همان کد؛ مجوز اضافه با بالا آمدن بعدی می‌رود', async () => {
      const read = async (role: string) =>
        (await conn.db.select().from(rolePermissions).where(eq(rolePermissions.roleId, role))).map((r) => r.permissionId).sort();
      expect(await read('owner')).toEqual(Object.keys(ADMIN_PERMISSIONS).sort());
      // گزارش ارسال (۶٫۴، ADR-048) فقط مالک: حاشیه راز کسب‌وکار است. نظر مشتری‌ها (۱۲٫۳، سؤال ۲۱۳: «امکان حذف توسط من») هم فقط مالک،
      // و متن‌های سایت (۱۱٫۱، سؤال ۲۸۲) هم.
      expect(await read('owner')).toContain('reports.read');
      expect(await read('owner')).toContain('reviews.manage');
      expect(await read('owner')).toContain('content.edit');
      // متصدی از ۵٫۳ لغو و مبلغ را با مجوز خودشان دارد، از ۶٫۱ ورود فایل پست (نه برگرداندنش)، از ۶٫۲ صف تأیید، از ۸٫۴ خاموش موقت
      // گزینه‌های تعرفه، از ۹٫۳ یادداشت داخلی، از ۱۰٫۱ در دسترس بودن چاپخانه‌ها، از ۱۲٫۲ مسدود کردن موبایل مشتری، از ۱۱٫۳ نوار اعلان و از
      // ۱۲٫۱ پیام‌های پشتیبانی (سؤال ۳۱۳؛ حسابدار و چاپخانه نه)؛ چاپخانه فقط دیدن،
      // وضعیت و دانلود (ADR-042)، از ۶٫۲ ورود فایل پست خودش، نه صف، از ۱۰٫۱ «شلوغ» و «تعطیل» خودش، از ۱۰٫۲ گزارش تولید خودش (بی
      // مبلغ)، و از ۱۰٫۳ صورت‌حساب تسویهٔ خودش. هیچ‌کدام گزارش ارسال نه؛ متصدی گزارش تولید و تسویه هم نه (سؤال‌های ۲۰۱ و ۳۹۹). از ۱۰٫۴ موجودی
      // کاغذ برای متصدی و چاپخانه، دیدن و ثبت (سؤال ۴۱۵)؛ حسابدار نه. صریح، نه از کد.
      expect(await read('operator')).toEqual([
        'content.bar',
        'customers.block',
        'files.download',
        'inventory.manage',
        'inventory.read',
        'orders.address',
        'orders.assign',
        'orders.cancel',
        'orders.money',
        'orders.notes',
        'orders.read',
        'orders.status',
        'partners.availability',
        'shipments.import',
        'shipments.review',
        'support.reply',
        'tariff.pause',
        'tariff.read',
      ]);
      expect([...ADMIN_ROLES.operator.permissions].sort()).toEqual(await read('operator'));
      expect(await read('print_partner')).toEqual([
        'files.download',
        'inventory.manage',
        'inventory.read',
        'orders.read',
        'orders.status',
        'partners.availability',
        'reports.production',
        'settlements.read',
        'shipments.import',
      ]);
      expect([...ADMIN_ROLES.print_partner.permissions].sort()).toEqual(await read('print_partner'));
      // حسابدار (۹٫۴، سؤال ۱۹۷): مبلغ و پرداخت، بازپرداخت، یادداشت و گزارش ارسال، از ۱۰٫۲ گزارش تولید، از ۱۱٫۴ دیدن کدهای تخفیف، و از
      // ۱۰٫۳ تسویهٔ چاپخانه‌ها با ثبت پرداخت و اصلاح؛ بی وضعیت، دانلود، تعرفه، تنظیمات، ادمین‌ها و درصد سهم چاپخانه‌ها.
      expect(await read('accountant')).toEqual([
        'discounts.read',
        'orders.money',
        'orders.notes',
        'orders.read',
        'orders.refund',
        'reports.production',
        'reports.read',
        'settlements.manage',
        'settlements.read',
      ]);
      expect([...ADMIN_ROLES.accountant.permissions].sort()).toEqual(await read('accountant'));
      await conn.db.insert(rolePermissions).values({ roleId: 'operator', permissionId: 'secrets.edit' });
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(await read('operator')).not.toContain('secrets.edit');
    });

    it('پیوند ثبت: ادمین تازه بی رمز، با نقش؛ نام تکراری نه؛ بازیابی همه‌چیز را از نو می‌کند', async () => {
      const store = createAdminStore(conn);
      const first = await store.createInvite(invite('sara', { role: 'owner' }));
      expect(first).toMatchObject({ ok: true, reset: false });
      const user = await store.findUserByUsername('sara');
      expect(user).toMatchObject({ passwordHash: null, totpSealed: null, disabledAt: null });
      expect(await store.rolesOf(user!.id)).toEqual(['owner']);
      expect(await store.createInvite(invite('sara'))).toEqual({ ok: false, reason: 'username_taken' });
      expect(await store.createInvite(invite('nobody', { role: null, allowExisting: true }))).toEqual({ ok: false, reason: 'role_required' });

      const { userId, sessionHash } = await enrolled('ali');
      const reset = await store.createInvite(invite('ali', { allowExisting: true, role: null }));
      expect(reset).toEqual({ ok: true, userId, reset: true });
      const after = await store.findUser(userId);
      expect(after).toMatchObject({ passwordHash: null, totpSealed: null, totpLastStep: null });
      expect((await store.findSession(sessionHash))!.revokedAt).not.toBeNull();
      expect(await store.rolesOf(userId)).toEqual(['operator']);
      const events = await conn.db
        .select()
        .from(adminEvents)
        .where(sql`${adminEvents.targetId} = ${userId} AND ${adminEvents.action} = 'admins.invite'`)
        .orderBy(adminEvents.id);
      expect(events.map((e) => (e.detail as { reset: boolean }).reset)).toEqual([false, true]);
    });

    it('پیوند فقط یک بار و فقط تا مهلتش؛ مصرف‌شده دیگر عوض نمی‌شود', async () => {
      const store = createAdminStore(conn);
      const { userId, invite: inv } = await enrolled('ali');
      const again = await store.completeInvite({
        inviteId: inv.inviteId,
        userId,
        passwordHash: 'x',
        totpSealed: 'y',
        totpStep: 2,
        at,
        session: { tokenHash: 'z'.repeat(64), expiresAt: later(1000) },
        ipHash: null,
      });
      expect(again).toBe(false);
      expect(
        await rejectedConstraint(conn.db.update(adminInvites).set({ usedAt: null }).where(eq(adminInvites.id, inv.inviteId))),
      ).toBe('admin_invites_final');

      const late = invite('reza', { expiresAt: later(15 * 60_000) });
      const created = await store.createInvite(late);
      const tooLate = await store.completeInvite({
        inviteId: late.inviteId,
        userId: created.ok ? created.userId : '',
        passwordHash: 'x',
        totpSealed: 'y',
        totpStep: 2,
        at: later(15 * 60_000),
        session: { tokenHash: 'w'.repeat(64), expiresAt: later(1000) },
        ipHash: null,
      });
      expect(tooLate).toBe(false);
    });

    it('ثبت: رمز، برنامهٔ تأیید، نشست و دو رویداد در یک تراکنش', async () => {
      const store = createAdminStore(conn);
      const { userId, sessionHash } = await enrolled('ali');
      expect(await store.findUser(userId)).toMatchObject({ totpSealed: 'v1.sealed-user', totpLastStep: 1, lastLoginAt: at });
      const session = await store.findSession(sessionHash);
      expect(session).toMatchObject({ revokedAt: null, roles: ['operator'] });
      expect(session!.permissions).toEqual([
        'content.bar',
        'customers.block',
        'files.download',
        'inventory.manage',
        'inventory.read',
        'orders.address',
        'orders.assign',
        'orders.cancel',
        'orders.money',
        'orders.notes',
        'orders.read',
        'orders.status',
        'partners.availability',
        'shipments.import',
        'shipments.review',
        'support.reply',
        'tariff.pause',
        'tariff.read',
      ]);
      expect(session!.partner).toBeNull();
      const actions = (await store.listEvents({ limit: 10 })).map((e) => e.action);
      expect(actions).toEqual(['auth.login', 'admins.enroll', 'admins.invite']);
    });

    it('رویداد فقط افزودنی؛ ادمین پاک نمی‌شود؛ نقش بی scope؛ رمز و برنامهٔ تأیید با هم', async () => {
      const store = createAdminStore(conn);
      const { userId } = await enrolled('ali');
      const [one] = await conn.db.select().from(adminEvents).limit(1);
      expect(await rejectedConstraint(conn.db.update(adminEvents).set({ action: 'x' }).where(eq(adminEvents.id, one!.id)))).toBe(
        'admin_events_append_only',
      );
      expect(await rejectedConstraint(conn.db.delete(adminEvents).where(eq(adminEvents.id, one!.id)))).toBe('admin_events_append_only');
      expect(await rejectedConstraint(conn.db.delete(adminUsers).where(eq(adminUsers.id, userId)))).toBe('admin_users_no_delete');
      // از ۵٫۳ محدوده ستون نوع‌دار است: نقش چاپخانه بی چاپخانه نه (بقیهٔ محافظ‌هایش پایین، «نقش چاپخانه و محدوده»).
      expect(
        await rejectedConstraint(conn.db.update(adminUserRoles).set({ roleId: 'print_partner' }).where(eq(adminUserRoles.adminUserId, userId))),
      ).toBe('admin_user_roles_partner');
      expect(await rejectedConstraint(conn.db.update(adminUsers).set({ totpSealed: null }).where(eq(adminUsers.id, userId)))).toBe(
        'admin_users_credentials',
      );
      expect(await rejectedConstraint(store.createInvite(invite('Sara')))).toBe('admin_users_username');
      expect(await rejectedConstraint(store.createInvite(invite('ab')))).toBe('admin_users_username');
    });

    it('هشت سنجش هم‌زمان: فقط پنج فرصت، درست یک قفل، و شمار از صفر', async () => {
      const store = createAdminStore(conn);
      const { userId } = await enrolled('ali');
      const lockUntil = later(15 * 60_000);
      const claims = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => store.claimAttempt(userId, 5, at, lockUntil)));
      expect(claims.filter((c) => c.allowed)).toHaveLength(5);
      expect(claims.filter((c) => c.allowed && c.lockedUntil !== null)).toHaveLength(1);
      expect(claims.filter((c) => !c.allowed).map((c) => c.lockedUntil)).toEqual([lockUntil, lockUntil, lockUntil]);
      expect(await store.findUser(userId)).toMatchObject({ failedAttempts: 0, lockedUntil: lockUntil });

      // تا پایان قفل نه؛ بعدش دوباره (شاهد): قفل کهنه پاک و شمار یکی.
      expect(await store.claimAttempt(userId, 5, later(15 * 60_000 - 1), later(30 * 60_000))).toEqual({
        allowed: false,
        lockedUntil: lockUntil,
      });
      expect(await store.claimAttempt(userId, 5, later(15 * 60_000), later(30 * 60_000))).toEqual({
        allowed: true,
        lockedUntil: null,
      });
      expect(await store.findUser(userId)).toMatchObject({ failedAttempts: 1, lockedUntil: null });

      // سنجش درست (کار حساس) شمار و قفل را پاک می‌کند، مثل ورود.
      await store.claimAttempt(userId, 1, later(15 * 60_000), later(40 * 60_000));
      expect((await store.findUser(userId))!.lockedUntil).toEqual(later(40 * 60_000));
      await store.clearFailures(userId);
      expect(await store.findUser(userId)).toMatchObject({ failedAttempts: 0, lockedUntil: null });
    });

    it('یک گام کد فقط یک بار، حتی هم‌زمان؛ گام کهنه‌تر نه', async () => {
      const store = createAdminStore(conn);
      const { userId } = await enrolled('ali');
      const claims = await Promise.all([1, 2, 3, 4, 5].map(() => store.claimTotpStep(userId, 100)));
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await store.claimTotpStep(userId, 100)).toBe(false);
      expect(await store.claimTotpStep(userId, 99)).toBe(false);
      expect(await store.claimTotpStep(userId, 101)).toBe(true);
    });

    it('تلاش‌های ورود IP در پنجره شمرده می‌شوند، نه بیرونش؛ ورود موفق همان ردیف را موفق می‌کند', async () => {
      const store = createAdminStore(conn);
      const { userId } = await enrolled('ali');
      await store.recordAttempt({ username: 'x', adminUserId: null, ipHash: 'ip1', at: later(-61 * 60_000) });
      await store.recordAttempt({ username: 'x', adminUserId: null, ipHash: 'ip1', at: later(-10 * 60_000) });
      const attemptId = await store.recordAttempt({ username: 'ali', adminUserId: null, ipHash: 'ip1', at: later(-5 * 60_000) });
      await store.recordAttempt({ username: 'x', adminUserId: null, ipHash: 'ip2', at: later(-5 * 60_000) });
      expect(await store.countAttempts('ip1', later(-60 * 60_000))).toBe(2);

      await store.claimAttempt(userId, 5, at, later(15 * 60_000));
      await store.startSession({
        userId,
        tokenHash: 'n'.repeat(64),
        at,
        expiresAt: later(12 * 3600_000),
        attemptId,
        event: { adminUserId: userId, action: 'auth.login', ipHash: 'ip1', at },
      });
      const rows = await conn.db
        .select()
        .from(adminLoginAttempts)
        .where(eq(adminLoginAttempts.ipHash, 'ip1'))
        .orderBy(adminLoginAttempts.id);
      expect(rows.map((r) => [r.username, r.ok, r.adminUserId])).toEqual([
        ['x', false, null],
        ['x', false, null],
        ['ali', true, userId],
      ]);
      expect(await store.findUser(userId)).toMatchObject({ failedAttempts: 0, lockedUntil: null, lastLoginAt: at });
      expect((await store.findSession('n'.repeat(64)))!.user.id).toBe(userId);
      expect(await store.countAttempts('ip1', later(-60 * 60_000))).toBe(2);
    });

    it('آخرین مالک غیرفعال نمی‌شود؛ غیرفعال شدن نشست‌ها را می‌بندد', async () => {
      const store = createAdminStore(conn);
      const sara = await enrolled('sara', 'owner');
      expect(await store.disableUser(sara.userId, at, event('admins.disable'))).toBe('last_owner');
      const mina = await enrolled('mina', 'owner');
      expect(await store.disableUser(sara.userId, at, event('admins.disable', mina.userId))).toBe('ok');
      expect((await store.findSession(sara.sessionHash))!.revokedAt).not.toBeNull();
      expect(await store.disableUser(mina.userId, at, event('admins.disable'))).toBe('last_owner');
      expect(await store.disableUser(sara.userId, at, event('admins.disable'))).toBe('not_found');
    });

    it('عوض کردن نقش (۹٫۴): فقط از نقشی که دیده شد، با چاپخانهٔ فعال؛ آخرین مالک فعال نه؛ نشست باز و رویداد در همان تراکنش', async () => {
      const store = createAdminStore(conn);
      const sara = await enrolled('sara', 'owner');
      const ali = await enrolled('ali');
      const roleEvents = () => conn.db.select().from(adminEvents).where(eq(adminEvents.action, 'admins.role')).orderBy(asc(adminEvents.id));
      const change = (userId: string, role: AdminRole, seen: string, partnerId: string | null = null) =>
        store.changeRole({ userId, role, partnerId, seen, at, event: { adminUserId: sara.userId, action: 'admins.role', ipHash: 'ip' } });
      expect(await change(ali.userId, 'accountant', 'operator|')).toEqual({ ok: true, username: 'ali', partner: null });
      expect(await store.rolesOf(ali.userId)).toEqual(['accountant']);
      expect(await store.findSession(ali.sessionHash)).toMatchObject({
        revokedAt: null,
        roles: ['accountant'],
        permissions: [
          'discounts.read',
          'orders.money',
          'orders.notes',
          'orders.read',
          'orders.refund',
          'reports.production',
          'reports.read',
          'settlements.manage',
          'settlements.read',
        ],
      });
      expect((await roleEvents()).map((e) => [e.adminUserId, e.targetType, e.targetId, e.ipHash, e.detail])).toEqual([
        [sara.userId, 'admin', ali.userId, 'ip', { username: 'ali', from: ['operator'], to: 'accountant' }],
      ]);
      // فرم کهنه، نقش یکسان و ادمینی که نیست: هیچ چیز عوض نمی‌شود، رویداد هم نه.
      expect(await change(ali.userId, 'operator', 'operator|')).toEqual({ ok: false, reason: 'role_stale' });
      expect(await change(ali.userId, 'accountant', 'accountant|')).toEqual({ ok: false, reason: 'role_same' });
      expect(await change(randomUUID(), 'operator', '|')).toEqual({ ok: false, reason: 'not_found' });
      // نقش «چاپخانه»: چاپخانهٔ فعال؛ غیرفعال نه. ستون نوع‌دار و EXCLUDE همان (۵٫۳): نقش قبلی می‌رود و یک ردیف تازه.
      const [first] = await conn.db
        .select({ id: printPartners.id, name: printPartners.name })
        .from(printPartners)
        .where(eq(printPartners.isDefault, true));
      const [closed] = await conn.db
        .insert(printPartners)
        .values({ name: `چاپ بسته ${randomUUID().slice(0, 8)}`, provinceId: 11, cityId: 1326, deactivatedAt: at })
        .returning({ id: printPartners.id });
      expect(await change(ali.userId, 'print_partner', 'accountant|')).toEqual({ ok: false, reason: 'partner_required' });
      expect(await change(ali.userId, 'print_partner', 'accountant|', closed!.id)).toEqual({ ok: false, reason: 'partner_inactive' });
      expect(await change(ali.userId, 'print_partner', 'accountant|', first!.id)).toEqual({ ok: true, username: 'ali', partner: first });
      expect(await conn.db.select().from(adminUserRoles).where(eq(adminUserRoles.adminUserId, ali.userId))).toEqual([
        { adminUserId: ali.userId, roleId: 'print_partner', printPartnerId: first!.id },
      ]);
      expect((await store.findSession(ali.sessionHash))!.partner).toEqual(first);
      expect(await change(ali.userId, 'print_partner', `print_partner|${first!.id}`, first!.id)).toEqual({ ok: false, reason: 'role_same' });
      expect(await change(ali.userId, 'operator', `print_partner|${first!.id}`)).toMatchObject({ ok: true });
      expect(await store.findSession(ali.sessionHash)).toMatchObject({ roles: ['operator'], partner: null });
      expect((await roleEvents()).at(-1)!.detail).toEqual({ username: 'ali', from: ['print_partner'], to: 'operator', fromPartner: first });
      // آخرین مالک فعال؛ با مالک دوم، می‌شود.
      expect(await change(sara.userId, 'operator', 'owner|')).toEqual({ ok: false, reason: 'last_owner' });
      expect(await store.rolesOf(sara.userId)).toEqual(['owner']);
      expect(await roleEvents()).toHaveLength(3);
      await enrolled('mina', 'owner');
      expect(await change(sara.userId, 'operator', 'owner|')).toMatchObject({ ok: true });
    });

    it('دو مالک که هم‌زمان هم را پایین می‌آورند (۹٫۴): قفل یکی را مالک نگه می‌دارد', async () => {
      const store = createAdminStore(conn);
      const sara = await enrolled('sara', 'owner');
      const mina = await enrolled('mina', 'owner');
      const demote = (userId: string, by: string) =>
        store.changeRole({ userId, role: 'operator', partnerId: null, seen: 'owner|', at, event: { adminUserId: by, action: 'admins.role' } });
      const results = await Promise.all([demote(sara.userId, mina.userId), demote(mina.userId, sara.userId)]);
      expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
      expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'last_owner' });
      expect((await store.listAdmins(at)).filter((a) => a.roles.includes('owner'))).toHaveLength(1);
    });

    it('دستور سرور با نقش صریح برای آخرین مالک فعال (۹٫۴): پیش از هر نوشتن رد می‌شود؛ با مالک دوم، می‌شود', async () => {
      const store = createAdminStore(conn);
      const sara = await enrolled('sara', 'owner');
      expect(await store.createInvite(invite('sara', { allowExisting: true, role: 'operator' }))).toEqual({ ok: false, reason: 'last_owner' });
      expect(await store.rolesOf(sara.userId)).toEqual(['owner']);
      expect(await store.findUser(sara.userId)).toMatchObject({ passwordHash: expect.any(String), totpSealed: 'v1.sealed-user', disabledAt: null });
      expect((await store.findSession(sara.sessionHash))!.revokedAt).toBeNull();
      expect(await conn.db.select().from(adminInvites).where(eq(adminInvites.adminUserId, sara.userId))).toHaveLength(1);
      await enrolled('mina', 'owner');
      expect(await store.createInvite(invite('sara', { allowExisting: true, role: 'accountant' }))).toMatchObject({ ok: true, reset: true });
      expect(await store.rolesOf(sara.userId)).toEqual(['accountant']);
    });

    it('لغو دعوت: ادمینی که هرگز ثبت نکرد غیرفعال می‌شود، ثبت‌شده نه', async () => {
      const store = createAdminStore(conn);
      const created = await store.createInvite(invite('reza'));
      const rezaId = created.ok ? created.userId : '';
      expect(await store.revokeInvites(rezaId, at, event('admins.invite_revoked'))).toBe(1);
      expect((await store.findUser(rezaId))!.disabledAt).not.toBeNull();
      // بازیابی ادمینی که قبلاً ثبت کرده بود: لغوش او را غیرفعال نمی‌کند؛ فقط تا پیوند تازه کد ورود ندارد.
      const ali = await enrolled('ali');
      await store.createInvite(invite('ali', { allowExisting: true, role: null }));
      expect(await store.revokeInvites(ali.userId, at, event('admins.invite_revoked'))).toBe(1);
      expect((await store.findUser(ali.userId))!.disabledAt).toBeNull();
      expect(await store.revokeInvites(ali.userId, at, event('admins.invite_revoked'))).toBe(0);
    });

    it('فهرست ادمین‌ها با نقش و پیوند زنده؛ رویدادها با نام و پیشوند', async () => {
      const store = createAdminStore(conn);
      await enrolled('sara', 'owner');
      await store.createInvite(invite('reza'));
      const admins = await store.listAdmins(at);
      expect(admins.map((a) => [a.user.username, a.roles, a.invite !== null])).toEqual([
        ['sara', ['owner'], false],
        ['reza', ['operator'], true],
      ]);
      expect((await store.listAdmins(later(16 * 60_000))).find((a) => a.user.username === 'reza')!.invite).toBeNull();
      const auth = await store.listEvents({ limit: 10, actionPrefix: 'auth' });
      expect(auth.map((e) => [e.action, e.username])).toEqual([['auth.login', 'sara']]);
      const all = await store.listEvents({ limit: 2 });
      expect(all).toHaveLength(2);
      const older = await store.listEvents({ limit: 10, beforeId: all[1]!.id });
      expect(older.every((e) => e.id < all[1]!.id)).toBe(true);
    });

    it('بیرون رفتن: فقط همان نشست، و بار دوم هیچ', async () => {
      const store = createAdminStore(conn);
      const { userId, sessionHash } = await enrolled('ali');
      expect(await store.revokeSession(sessionHash, at)).toEqual({ adminUserId: userId });
      expect(await store.revokeSession(sessionHash, at)).toBeNull();
      await store.touchSession((await store.findSession(sessionHash))!.sessionId, later(60_000));
      const [row] = await conn.db.select().from(adminSessions).where(eq(adminSessions.tokenHash, sessionHash));
      expect(row!.lastSeenAt).toEqual(later(60_000));
    });
  });

  describe('پنل: سفارش‌ها روی پستگرس (برش ۴٫۲)', () => {
    /** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
    const NOW = new Date('2026-10-05T07:50:00Z');
    const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);
    // مهلت پایان انحصاری روز است (`postHandoffDue`): «تا پایان دوشنبه» یعنی نیمه‌شب آغاز سه‌شنبه. صریح، نه از کد.
    const END_SUNDAY = tehran('2026-10-05 00:00');
    const END_MONDAY = tehran('2026-10-06 00:00');
    const END_TUESDAY = tehran('2026-10-07 00:00');
    const END_WEDNESDAY = tehran('2026-10-08 00:00');
    const END_SATURDAY = tehran('2026-10-11 00:00');
    /** همهٔ سفارش‌های صحنه پیش از نخستین تلاش پرداختشان ساخته شدند (`placedAt`)؛ زودترین تلاش 08:59 همان روز است («late»). */
    const PLACED = tehran('2026-10-01 08:00');
    const MINUTE = 60_000;
    /** حاشیهٔ پرداخت یک ساعت و مهلت هر تلاش نیم ساعت (ADR-034)؛ صریح. */
    const clock: PanelClock = {
      at: NOW,
      staleBefore: new Date(NOW.getTime() + 60 * MINUTE),
      unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE),
      untrackedSince: new Date(NOW.getTime() - 45 * 86_400_000),
    };
    const bounds = { at: NOW, tomorrowStart: END_MONDAY, dayAfterStart: END_TUESDAY };

    type DocKey = 'a' | 'b' | 'soon' | 'gone';
    const docs = {} as Record<DocKey, { id: string; pages: number }>;
    const num: Record<string, number> = {};
    const ids: Record<string, string> = {};
    const totals: Record<string, number> = {};
    let adminId = '';

    async function place(
      key: string,
      over: { docs?: DocKey[]; name?: string; phone?: string; provinceId?: number; cityId?: number | null; zoneId?: 'tehran' | 'other' } = {},
    ) {
      const chosen = (over.docs ?? ['a', 'b']).map((k) => docs[k]);
      const sections = chosen.map((d) => ({ documentId: d.id, pageCount: d.pages }));
      const pageCount = sections.reduce((sum, s) => sum + s.pageCount, 0);
      const rules = [{ pageRanges: [[1, pageCount]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const zoneId = over.zoneId ?? 'tehran';
      const breakdown = quote(
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
        SEED_PRICE_LIST,
      );
      const phone = over.phone ?? '09121234567';
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: phone })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const { order } = await createOrderStore(conn).createOrder({
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: null,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: zoneId,
        provinceId: over.provinceId ?? 8,
        cityId: over.cityId === undefined ? 394 : over.cityId,
        recipientName: over.name ?? 'سارا احمدی',
        recipientPhone: phone,
        addressText: 'خیابان ولیعصر، پلاک 12',
        postalCode: null,
        items: [{ pageCount, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      await placedAt(conn, order.id, PLACED);
      num[key] = order.orderNumber;
      ids[key] = order.id;
      totals[key] = order.totalRials;
    }

    /** یک تلاش پرداخت با زمان ساختن دلخواه، در خود درج: زمان ساختن پس از درج منجمد است (`payments_frozen`، برش ۷٫۲). */
    async function attempt(key: string, createdAt: Date): Promise<string> {
      const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
      await conn.db.insert(payments).values({ orderId: ids[key]!, provider: 'mock', amountRials: totals[key]!, authority, createdAt });
      return authority;
    }

    /** پرداخت موفق از همان راه برگشت درگاه: سفارش `paid` با مهلت، رویداد، و کار `prepare_order` در صف. */
    async function pay(key: string, paidAt: Date, due: Date) {
      const authority = await attempt(key, new Date(paidAt.getTime() - MINUTE));
      await createOrderStore(conn).settlePayment('mock', authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt,
        postHandoffDueAt: due,
      }));
    }

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const admins = createAdminStore(conn);
      const created = await admins.createInvite({
        inviteId: randomUUID(),
        newUserId: randomUUID(),
        username: 'ali',
        displayName: 'علی محمدی',
        role: 'operator',
        tokenHash: randomUUID().replace(/-/g, '').repeat(2),
        totpSealed: 'v1.sealed',
        at: NOW,
        expiresAt: new Date(NOW.getTime() + 15 * MINUTE),
        createdBy: null,
        allowExisting: false,
        event: { adminUserId: null, action: 'admins.invite', targetType: 'admin' },
      });
      adminId = created.ok ? created.userId : '';

      const store = createDocumentStore(conn);
      const make = async (key: DocKey, pages: number, expiresAt: Date, deleted = false) => {
        const id = randomUUID();
        await store.insertUpload({
          id,
          sessionHash: 'f'.repeat(64),
          originalName: `ریاضی ۲ - جلسه ${pages}.pdf`,
          sourceKind: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1_000,
          storageKey: `uploads/${id}.pdf`,
          uploadId: 'u',
          partSizeBytes: 8 * 1024 * 1024,
        });
        await store.markUploaded(id, NOW, expiresAt, null);
        await conn.db
          .update(documents)
          .set({ status: 'ready', pageCount: pages, ...(deleted ? { fileDeletedAt: NOW } : {}) })
          .where(eq(documents.id, id));
        docs[key] = { id, pages };
      };
      await make('a', 48, new Date(NOW.getTime() + 2 * 86_400_000));
      await make('b', 54, new Date(NOW.getTime() + 2 * 86_400_000));
      // ۵۹ دقیقه: زیر حاشیهٔ یک ساعتهٔ پرداخت، پس سفارشش دیگر پرداختنی نیست.
      await make('soon', 10, new Date(NOW.getTime() + 59 * MINUTE));
      await make('gone', 12, new Date(NOW.getTime() - 86_400_000), true);

      // شش سفارش پرداخت‌شده، از دیر شده تا بعدتر؛ دو تا با یک مهلت و ترتیب پرداخت برعکس ترتیب شماره.
      await place('late', { name: 'زهرا محمدی', phone: '09121110019' });
      await place('today2', { name: 'مریم کاظمی', phone: '09152345678', provinceId: 11, cityId: 1326, zoneId: 'other' });
      await place('today1', { name: 'امیر حسینی', phone: '09131110024' });
      await place('tomorrow', { name: 'حسین رحیمی', phone: '09171110031' });
      await place('wed', { name: 'پارسا امینی', phone: '09121110035' });
      await place('sat', { name: 'سمانه_قربانی%', phone: '09161110036', cityId: null });
      await pay('late', tehran('2026-10-01 09:00'), END_SUNDAY);
      await pay('today2', tehran('2026-10-03 14:05'), END_MONDAY);
      await pay('today1', tehran('2026-10-03 10:00'), END_MONDAY);
      await pay('tomorrow', tehran('2026-10-04 12:00'), END_TUESDAY);
      await pay('wed', tehran('2026-10-05 09:00'), END_WEDNESDAY);
      await pay('sat', tehran('2026-10-07 18:00'), END_SATURDAY);
      // PDF جزوهٔ «فردا» ساخته نشد: شکست قطعی کارگر، با همان شکل `last_error`. برگه‌اش جداست و دست نمی‌خورد.
      await conn.db
        .update(jobs)
        .set({ status: 'failed', attempts: 1, lastError: 'file_missing: file_missing', finishedAt: NOW })
        .where(and(eq(jobs.orderId, ids.tomorrow!), eq(jobs.kind, PREPARE_ORDER_JOB)));

      // در انتظار پرداخت: یک تلاش بی برگشت (۴۰ دقیقه)، یکی هنوز در درگاه (۱۰ دقیقه)، یکی ناموفق.
      await place('waiting', { name: 'کیان رستمی', phone: '09141110030' });
      await attempt('waiting', new Date(NOW.getTime() - 40 * MINUTE));
      await attempt('waiting', new Date(NOW.getTime() - 10 * MINUTE));
      const failed = await attempt('waiting', new Date(NOW.getTime() - 50 * MINUTE));
      await createOrderStore(conn).settlePayment('mock', failed, async () => ({ kind: 'failed', code: 'declined', raw: null }));
      // رهاشده: فایلی که تا حاشیه پاک می‌شود (با تلاش بی برگشت، که هشدار نمی‌شود)، فایل پاک‌شده، و منقضی.
      await place('soon', { docs: ['a', 'soon'], name: 'نگار صادقی', phone: '09121110040' });
      await attempt('soon', new Date(NOW.getTime() - 45 * MINUTE));
      await place('gone', { docs: ['gone'], name: 'فاطمه نوری', phone: '09121110041' });
      await place('expired', { name: 'محمد جعفری', phone: '09121110042' });
      await createOrderStore(conn).expireOrder(ids.expired!, NOW);
    });

    afterAll(async () => {
      await clearOrders(conn);
    });

    it('کاشی‌های مهلت با مرز روز تهران: دیر شده، امروز، فردا، بعدتر', async () => {
      const panel = createPanelOrderStore(conn);
      expect(await panel.dueSummary(ALL_ORDERS, bounds)).toEqual({
        overdue: 1,
        today: 2,
        tomorrow: 1,
        later: 2,
        overdueRange: { earliest: END_SUNDAY, latest: END_SUNDAY },
        laterRange: { earliest: END_WEDNESDAY, latest: END_SATURDAY },
      });
      // مهلت خودِ «حالا» گذشته است؛ یک میلی‌ثانیه پیش از پایان روز هنوز «امروز» (شاهد `<=` و `<`).
      expect(await panel.dueSummary(ALL_ORDERS, { ...bounds, at: new Date(END_MONDAY.getTime() - 1) })).toMatchObject({ overdue: 1, today: 2 });
      expect(await panel.dueSummary(ALL_ORDERS, { ...bounds, at: END_MONDAY })).toMatchObject({ overdue: 3, today: 0 });
      // فردا تا خود آغاز پس‌فردا؛ یک روز جلوتر «فردا» مال چهارشنبه است.
      expect(
        await panel.dueSummary(ALL_ORDERS, { at: NOW, tomorrowStart: END_TUESDAY, dayAfterStart: END_WEDNESDAY }),
      ).toMatchObject({ today: 3, tomorrow: 1, later: 1, laterRange: { earliest: END_SATURDAY, latest: END_SATURDAY } });
      // فقط پرداخت‌شده‌ها: سفارش در انتظار و رهاشده مهلت ندارند.
      const all = await panel.dueSummary(ALL_ORDERS, bounds);
      expect(all.overdue + all.today + all.tomorrow + all.later).toBe(6);
    });

    it('چیپ‌ها: باز، در انتظار پرداخت، رهاشده و همه، با همان جست‌وجو', async () => {
      const panel = createPanelOrderStore(conn);
      expect(await panel.counts(ALL_ORDERS, { search: null, clock })).toEqual({ open: 6, handed: 0, cancelled: 0, awaiting: 1, abandoned: 3, all: 10 });
      // شاهد حاشیه: یک ساعت دیرتر نه، همین حالا فایل ۵۹ دقیقه‌ای هنوز پرداختنی بود.
      expect(await panel.counts(ALL_ORDERS, { search: null, clock: { ...clock, staleBefore: NOW } })).toMatchObject({ awaiting: 2, abandoned: 2 });
      expect(await panel.counts(ALL_ORDERS, { search: { kind: 'name', text: 'محمد' }, clock })).toEqual({
        open: 1,
        handed: 0,
        cancelled: 0,
        awaiting: 0,
        abandoned: 1,
        all: 2,
      });
    });

    it('فهرست باز به ترتیب مهلت؛ هم‌مهلت‌ها به ترتیب پرداخت؛ بقیه تازه‌ترین اول', async () => {
      const panel = createPanelOrderStore(conn);
      const numbers = async (bucket: PanelBucket, limit = 50, offset = 0) =>
        (await panel.list(ALL_ORDERS, { bucket, search: null, clock, limit, offset })).map((row) => row.orderNumber);
      expect(await numbers('open')).toEqual([num.late, num.today1, num.today2, num.tomorrow, num.wed, num.sat]);
      expect(await numbers('open', 2, 2)).toEqual([num.today2, num.tomorrow]);
      expect(await numbers('awaiting')).toEqual([num.waiting]);
      expect(await numbers('abandoned')).toEqual([num.expired, num.gone, num.soon]);
      expect(await numbers('all')).toEqual(
        ['expired', 'gone', 'soon', 'waiting', 'sat', 'wed', 'tomorrow', 'today1', 'today2', 'late'].map((k) => num[k]),
      );
    });

    it('ردیف فهرست: جزوه، گیرنده، شهر، PDF، پرداخت بی برگشت و فایل‌ها', async () => {
      const panel = createPanelOrderStore(conn);
      const rows = await panel.list(ALL_ORDERS, { bucket: 'all', search: null, clock, limit: 50, offset: 0 });
      const row = (key: string) => rows.find((r) => r.orderNumber === num[key])!;
      expect(row('today2')).toMatchObject({
        status: 'paid',
        recipientName: 'مریم کاظمی',
        recipientPhone: '09152345678',
        provinceName: 'خراسان رضوی',
        cityName: 'مشهد',
        postHandoffDueAt: END_MONDAY,
        pageCount: 102,
        itemCount: 1,
        fileCount: 2,
        copies: 1,
        colorModes: ['bw'],
        sidesModes: ['double'],
        pdfJob: 'queued',
        unreturnedPayments: 0,
        stale: false,
      });
      expect(row('today2').totalRials).toBe(totals.today2);
      expect(row('today2').filesExpireAt).toEqual(new Date(NOW.getTime() + 2 * 86_400_000));
      expect(row('tomorrow').pdfJob).toBe('failed');
      expect(row('sat')).toMatchObject({ cityName: null, provinceName: 'تهران' });
      // فقط تلاش ۴۰ دقیقه‌ای بی برگشت است: ۱۰ دقیقه‌ای هنوز در درگاه، و ناموفق در انتظار نیست.
      expect(row('waiting')).toMatchObject({ status: 'awaiting_payment', pdfJob: null, unreturnedPayments: 1, stale: false });
      expect(row('soon')).toMatchObject({ stale: true, fileCount: 2, pageCount: 58, filesExpireAt: new Date(NOW.getTime() + 59 * MINUTE) });
      expect(row('gone')).toMatchObject({ stale: true, fileCount: 1 });
      expect(row('expired')).toMatchObject({ status: 'expired', stale: false });
    });

    it('جست‌وجو: شماره، ته موبایل، موبایل کامل و نام؛ نویسهٔ عام LIKE حرف است', async () => {
      const panel = createPanelOrderStore(conn);
      const find = async (search: PanelSearch) =>
        (await panel.list(ALL_ORDERS, { bucket: 'all', search, clock, limit: 50, offset: 0 })).map((row) => row.orderNumber).sort();
      expect(await find({ kind: 'digits', orderNumber: num.wed!, phoneSuffix: null })).toEqual([num.wed]);
      expect(await find({ kind: 'digits', orderNumber: null, phoneSuffix: '5678' })).toEqual([num.today2]);
      // یک عدد: یا شمارهٔ سفارش، یا ته موبایل.
      expect(await find({ kind: 'digits', orderNumber: num.late!, phoneSuffix: '110036' })).toEqual([num.late, num.sat].sort());
      expect(await find({ kind: 'mobile', mobile: '09141110030' })).toEqual([num.waiting]);
      expect(await find({ kind: 'name', text: 'محمد' })).toEqual([num.late, num.expired].sort());
      expect(await find({ kind: 'name', text: 'سمانه_قربانی%' })).toEqual([num.sat]);
      expect(await find({ kind: 'name', text: 'زهرا%' })).toEqual([]);
      expect(await find({ kind: 'name', text: '_' })).toEqual([num.sat]);
      expect(await find({ kind: 'digits', orderNumber: null, phoneSuffix: null })).toEqual([]);
    });

    it('هشدارها: PDF ساخته‌نشده، و تلاش بی برگشت فقط برای سفارشی که هنوز پرداختنی است', async () => {
      const panel = createPanelOrderStore(conn);
      // همه از راه برگشت درگاه پرداخت شدند، پس همه چاپخانه دارند (برش ۵٫۲).
      expect(await panel.alerts(ALL_ORDERS, clock)).toEqual({
        failedPdf: [num.tomorrow],
        unreturned: [{ orderNumber: num.waiting, attempts: 1 }],
        unassigned: [],
        reviewRows: 0,
        untracked: [],
        smsFailed: [],
        // پیامک پرداخت (۷٫۱) این سفارش‌ها منتظر ماند و هرگز فرستاده نشد (تست فرستنده ندارد): پس از ۵ دقیقه «نرفت» است. «شنبه» پس
        // از «حالا»ی تست پرداخت شد، پس پیامکش هنوز در راه است.
        paidSmsFailed: [num.late!, num.today2!, num.today1!, num.tomorrow!, num.wed!].sort((a, b) => a - b),
        // پیامک چاپخانه (۷٫۶): چاپخانهٔ پیش‌فرض این‌جا موبایل اعلان ندارد، پس پیامکی هم نیست.
        partnerSmsFailed: [],
        // هشدارهای پول و درگاه (۷٫۲): این سفارش‌ها هیچ‌کدام را ندارند.
        gatewayRejected: null,
        mismatched: [],
        held: [],
        verifiedUnused: [],
        autoClosed: { failed: 0, succeeded: 0 },
        // بازپرداخت (۷٫۳): هیچ سفارش لغوشده‌ای اینجا نیست.
        unrefunded: [],
        refunding: [],
      });
      // نیم ساعت بعد، تلاش ۱۰ دقیقه‌ای هم بی برگشت است (شاهد مهلت تلاش).
      expect(
        (await panel.alerts(ALL_ORDERS, { ...clock, unreturnedBefore: new Date(NOW.getTime() - 5 * MINUTE) })).unreturned,
      ).toEqual([{ orderNumber: num.waiting, attempts: 2 }]);
      // بی حاشیه، سفارشی که فایلش ۵۹ دقیقهٔ دیگر پاک می‌شود هنوز پرداختنی است و تلاشش هشدار (شاهد حاشیه).
      expect((await panel.alerts(ALL_ORDERS, { ...clock, staleBefore: NOW })).unreturned.map((u) => u.orderNumber).sort()).toEqual(
        [num.waiting, num.soon].sort(),
      );
    });

    it('جزئیات: جزوه با نام فایل‌ها، کاغذ و صحافی همان نسخهٔ تعرفه، گیرنده، پرداخت‌ها، رویدادها و کار PDF', async () => {
      const panel = createPanelOrderStore(conn);
      const details = await panel.details(ALL_ORDERS, num.today2!);
      expect(details).toMatchObject({
        provinceName: 'خراسان رضوی',
        cityName: 'مشهد',
        zoneName: 'بقیهٔ کشور',
        shippingMethodName: 'پست پیشتاز',
        order: { orderNumber: num.today2, status: 'paid', postHandoffDueAt: END_MONDAY, priceListVersion: 1, filesDeletedAt: null },
        pdfJob: { status: 'queued', attempts: 0, maxAttempts: 3, lastError: null, finishedAt: null },
        ticketJob: { status: 'queued', attempts: 0, maxAttempts: 3, lastError: null, finishedAt: null },
        ticket: null,
      });
      expect(details!.items).toEqual([
        expect.objectContaining({
          seq: 1,
          pageCount: 102,
          bindingName: 'طلق و سیم',
          printPdfKey: null,
          sections: [
            expect.objectContaining({ seq: 1, documentId: docs.a.id, pageCount: 48, originalName: 'ریاضی ۲ - جلسه 48.pdf', sourceKind: 'pdf' }),
            expect.objectContaining({ seq: 2, documentId: docs.b.id, pageCount: 54, originalName: 'ریاضی ۲ - جلسه 54.pdf' }),
          ],
          rules: [{ seq: 1, pageRanges: [[1, 102]], colorMode: 'bw', paperTypeId: 'tahrir80', paperName: 'تحریر ۸۰ گرم' }],
          printFiles: [],
        }),
      ]);
      expect(details!.payments.map((p) => p.status)).toEqual(['succeeded']);
      expect(details!.statusEvents.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
        [null, 'awaiting_payment', 'user'],
        ['awaiting_payment', 'paid', 'gateway'],
      ]);
      expect(details!.events).toEqual([]);
      expect(await panel.details(ALL_ORDERS, 1)).toBeNull();

      const waiting = await panel.details(ALL_ORDERS, num.waiting!);
      expect(waiting!.pdfJob).toBeNull();
      expect(waiting!.ticketJob).toBeNull();
      // تازه‌ترین تلاش اول.
      expect(waiting!.payments.map((p) => p.status)).toEqual(['pending', 'pending', 'failed']);
    });

    it('هشدارهای فایل (۸٫۱): فقط تازه‌ترین تحلیل سرور هر سند، فقط صفحهٔ هشداردار یا خالی و به ترتیب، با conversion سند', async () => {
      const panel = createPanelOrderStore(conn);
      const HOUR = 60 * MINUTE;
      /** یک دور تحلیل، همان شکل ردیف‌های کارگر: صفحه‌های `flagged` با هشدارشان، و `blank_page` یعنی صفحهٔ خالی. */
      const analyze = async (documentId: string, pages: number, source: 'server' | 'browser', createdAt: Date, flagged: Record<number, string[]>) => {
        const [row] = await conn.db
          .insert(documentAnalyses)
          .values({ documentId, source, engine: `${source}-test`, thresholds: DEFAULT_THRESHOLDS, pageCount: pages, elapsedMs: 10, createdAt })
          .returning({ id: documentAnalyses.id });
        await conn.db.insert(documentPages).values(
          Array.from({ length: pages }, (_, i) => ({
            analysisId: row!.id,
            n: i + 1,
            widthPt: 595,
            heightPt: 842,
            color: false,
            colorRatio: 0,
            coloredInkRatio: 0,
            chromaP95: 3,
            inkRatio: 0.05,
            paperCast: [250, 250, 248],
            blank: flagged[i + 1]?.includes('blank_page') ?? false,
            warnings: flagged[i + 1] ?? [],
          })),
        );
      };
      const deck = { format: 'pptx', fonts: { requested: ['B Nazanin'], mismatched: ['B Nazanin'] } };
      try {
        // قدیمی‌تر سرور و تحلیل مرورگر (تازه‌ترین ردیف سند، ولی مرورگر) هشدارهای دیگری دارند و نباید بیایند.
        await analyze(docs.a.id, 48, 'server', new Date(NOW.getTime() - 3 * HOUR), { 1: ['low_dpi'] });
        await analyze(docs.a.id, 48, 'browser', new Date(NOW.getTime() - HOUR), { 2: ['tight_margin'] });
        await analyze(docs.a.id, 48, 'server', new Date(NOW.getTime() - 2 * HOUR), { 48: ['tight_margin'], 3: ['low_dpi'], 5: ['blank_page'] });
        await analyze(docs.b.id, 54, 'server', new Date(NOW.getTime() - 2 * HOUR), {});
        await conn.db.update(documents).set({ conversion: deck }).where(eq(documents.id, docs.b.id));

        const [item] = (await panel.details(ALL_ORDERS, num.today2!))!.items;
        expect(item!.sections.map((s) => s.flaggedPages)).toEqual([
          [
            { n: 3, widthPt: 595, heightPt: 842, blank: false, warnings: ['low_dpi'] },
            { n: 5, widthPt: 595, heightPt: 842, blank: true, warnings: ['blank_page'] },
            { n: 48, widthPt: 595, heightPt: 842, blank: false, warnings: ['tight_margin'] },
          ],
          [],
        ]);
        expect(item!.sections.map((s) => s.conversion)).toEqual([null, deck]);
        // سفارشی که سندهایش تحلیل سرور ندارند: هیچ.
        const [gone] = (await panel.details(ALL_ORDERS, num.gone!))!.items;
        expect(gone!.sections.map((s) => s.flaggedPages)).toEqual([[]]);
      } finally {
        await conn.db.delete(documentAnalyses).where(inArray(documentAnalyses.documentId, [docs.a.id, docs.b.id]));
        await conn.db.update(documents).set({ conversion: null }).where(eq(documents.id, docs.b.id));
      }
    });

    it('دوباره بساز: کاری که در صف یا زیر دست کارگر نیست، با رویداد و کار قبلی در یک تراکنش؛ دو کلیک هم‌زمان یک بار', async () => {
      const panel = createPanelOrderStore(conn);
      const event = (at: Date): AdminEventInput => ({
        adminUserId: adminId,
        action: 'orders.pdf_rebuild',
        targetType: 'order',
        targetId: ids.tomorrow!,
        ipHash: 'ip',
        detail: { orderNumber: num.tomorrow },
        at,
      });
      // کار «امروز» هنوز در صف است: دوباره در صف رفتنش معنایی ندارد (شاهد: «فردا»ی شکست‌خورده می‌رود).
      expect(await panel.requeue(ALL_ORDERS, ids.today2!, PREPARE_ORDER_JOB, { ...event(NOW), targetId: ids.today2! })).toBe('busy');
      const results = await Promise.all([
        panel.requeue(ALL_ORDERS, ids.tomorrow!, PREPARE_ORDER_JOB, event(NOW)),
        panel.requeue(ALL_ORDERS, ids.tomorrow!, PREPARE_ORDER_JOB, event(NOW)),
      ]);
      expect(results.sort()).toEqual(['busy', 'ok']);
      const [job] = await conn.db
        .select()
        .from(jobs)
        .where(and(eq(jobs.orderId, ids.tomorrow!), eq(jobs.kind, PREPARE_ORDER_JOB)));
      expect(job).toMatchObject({ status: 'queued', attempts: 0, lastError: null, finishedAt: null, lockedBy: null });
      expect(job!.runAfter.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
      const details = await panel.details(ALL_ORDERS, num.tomorrow!);
      expect(details!.events).toEqual([
        expect.objectContaining({
          action: 'orders.pdf_rebuild',
          adminName: 'علی محمدی',
          detail: { orderNumber: num.tomorrow, previous: { status: 'failed', attempts: 1, error: 'file_missing' } },
        }),
      ]);
      // دانلود با همان راه رویداد، در صفحهٔ همان سفارش؛ سفارش دیگر رویدادی ندارد.
      await panel.logEvent({ ...event(new Date(NOW.getTime() + MINUTE)), action: 'orders.pdf_download', detail: { orderNumber: num.tomorrow, item: 1 } });
      expect((await panel.details(ALL_ORDERS, num.tomorrow!))!.events.map((e) => e.action)).toEqual(['orders.pdf_rebuild', 'orders.pdf_download']);
      expect((await panel.details(ALL_ORDERS, num.late!))!.events).toEqual([]);
    });

    it('PDF جزوه برای دانلود: کلید و حجم فقط وقتی کارگر ساخته', async () => {
      const panel = createPanelOrderStore(conn);
      expect(await panel.jozveFile(ALL_ORDERS, num.late!, 1)).toMatchObject({
        orderId: ids.late,
        status: 'paid',
        filesDeletedAt: null,
        itemSeq: 1,
        key: null,
        readyAt: null,
      });
      expect(await panel.jozveFile(ALL_ORDERS, num.late!, 2)).toBeNull();
      const [item] = await conn.db.select().from(orderItems).where(eq(orderItems.orderId, ids.late!));
      await conn.db
        .update(orderItems)
        .set({ printPdfKey: `orders/${num.late}/jozve-1.pdf`, printPdfBytes: 40_265_318, printPdfSha256: 'a'.repeat(64), printPdfReadyAt: NOW })
        .where(eq(orderItems.id, item!.id));
      expect(await panel.jozveFile(ALL_ORDERS, num.late!, 1)).toMatchObject({ key: `orders/${num.late}/jozve-1.pdf`, bytes: 40_265_318, readyAt: NOW });
    });

    it('کد خطای کار از last_error کارگر: شکست قطعی با کد، بقیه گذرا', () => {
      expect(pdfErrorCode('file_missing: file_missing')).toBe('file_missing');
      expect(pdfErrorCode('page_count_mismatch: بخش 1: 47 صفحه، سرور 48 شمرده بود')).toBe('page_count_mismatch');
      expect(pdfErrorCode("StorageError('GET … → 503')")).toBe('transient');
      expect(pdfErrorCode(null)).toBeNull();
    });
  });

  describe('پنل: وضعیت سفارش روی پستگرس (برش ۴٫۳)', () => {
    /** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
    const NOW = new Date('2026-10-05T07:50:00Z');
    const MINUTE = 60_000;
    const DAY = 86_400_000;
    const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);
    // مهلت پایان انحصاری روز است: «تا پایان دوشنبه» یعنی نیمه‌شب آغاز سه‌شنبه. صریح، نه از کد.
    const END_SATURDAY = tehran('2026-10-04 00:00');
    const END_MONDAY = tehran('2026-10-06 00:00');
    /** سفارش پیش از پرداختش ساخته شد (`placedAt`؛ پرداخت `paidOrder` ساعت 10:00 همان روز است). */
    const PLACED = tehran('2026-10-04 09:00');
    let docId = '';
    let owner = '';
    let operator = '';

    /** سفارش پرداخت‌شده همان‌طور که سرور می‌سازد: سفارش در یک تراکنش، و برگشت موفق درگاه با رویداد و کار PDF. */
    async function paidOrder(due = END_MONDAY, name = 'سارا احمدی', raw: unknown = null, cardMask: string | null = null) {
      const sections = [{ documentId: docId, pageCount: 20 }];
      const rules = [{ pageRanges: [[1, 20]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const breakdown = quote(
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'tehran' } },
        SEED_PRICE_LIST,
      );
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: '09121234567' })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const store = createOrderStore(conn);
      const { order } = await store.createOrder({
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: null,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: 'tehran',
        provinceId: 8,
        cityId: 394,
        recipientName: name,
        recipientPhone: '09121234567',
        addressText: 'خیابان ولیعصر، پلاک 12',
        postalCode: null,
        items: [{ pageCount: 20, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      await placedAt(conn, order.id, PLACED);
      const payment = await store.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      const settled = await store.settlePayment('mock', payment.authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask,
        raw,
        paidAt: tehran('2026-10-04 10:00'),
        postHandoffDueAt: due,
      }));
      return settled!.order;
    }

    /** تغییر وضعیت ادمین، با رویداد ادمینش. */
    function change(
      order: { id: string; orderNumber: number },
      from: OrderStatus,
      to: OrderStatus,
      over: { at?: Date; adminUserId?: string; reason?: string } = {},
    ): PanelStatusChange {
      const at = over.at ?? NOW;
      const adminUserId = over.adminUserId ?? owner;
      return {
        orderId: order.id,
        from,
        to,
        at,
        adminUserId,
        note: over.reason ? { reason: over.reason } : null,
        event: {
          adminUserId,
          action: 'orders.status',
          targetType: 'order',
          targetId: order.id,
          ipHash: 'ip',
          detail: { orderNumber: order.orderNumber, from, to },
          at,
        },
      };
    }

    const statusOf = async (id: string) => (await conn.db.select().from(orders).where(eq(orders.id, id)))[0]!;
    const statusRows = (id: string) =>
      conn.db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, id)).orderBy(orderStatusEvents.id);
    const eventsOf = (id: string) => conn.db.select().from(adminEvents).where(eq(adminEvents.targetId, id)).orderBy(adminEvents.id);

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const admins = createAdminStore(conn);
      const make = async (username: string, displayName: string, role: 'owner' | 'operator') => {
        const created = await admins.createInvite({
          inviteId: randomUUID(),
          newUserId: randomUUID(),
          username,
          displayName,
          role,
          tokenHash: randomUUID().replace(/-/g, '').repeat(2),
          totpSealed: 'v1.sealed',
          at: NOW,
          expiresAt: new Date(NOW.getTime() + 15 * MINUTE),
          createdBy: null,
          allowExisting: false,
          event: { adminUserId: null, action: 'admins.invite', targetType: 'admin' },
        });
        if (!created.ok) throw new Error(created.reason);
        return created.userId;
      };
      owner = await make('sara', 'سارا رضایی', 'owner');
      operator = await make('ali', 'علی محمدی', 'operator');

      const store = createDocumentStore(conn);
      docId = randomUUID();
      await store.insertUpload({
        id: docId,
        sessionHash: 'd'.repeat(64),
        originalName: 'ریاضی ۲.pdf',
        sourceKind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_000,
        storageKey: `uploads/${docId}.pdf`,
        uploadId: 'u',
        partSizeBytes: 8 * 1024 * 1024,
      });
      await store.markUploaded(docId, NOW, new Date(NOW.getTime() + 2 * DAY), null);
      await conn.db.update(documents).set({ status: 'ready', pageCount: 20 }).where(eq(documents.id, docId));
    });

    beforeEach(async () => {
      await clearOrders(conn);
    });

    afterAll(async () => {
      await clearOrders(conn);
    });

    it('جریان وضعیت در خود پایگاه داده: فقط گذارهای طرح و برگرداندن یک قدم؛ پرداخت برنمی‌گردد', async () => {
      const order = await paidOrder();
      const byId = eq(orders.id, order.id);
      const to = (status: OrderStatus, handedToPostAt: Date | null = null) =>
        rejectedConstraint(conn.db.update(orders).set({ status, handedToPostAt }).where(byId));
      // در صف چاپ: نه یکراست به پست، نه برگشت به «در انتظار».
      expect(await to('handed_to_post', NOW)).toBe('orders_status_flow');
      expect(await to('awaiting_payment')).toBe('orders_payment_final');
      expect(await to('printing')).toBeUndefined();
      // زمان تحویل به پست فقط و همیشه با «تحویل پست شد».
      expect(await to('handed_to_post')).toBe('orders_handed_at');
      expect(await to('printing', NOW)).toBe('orders_handed_at');
      expect(await to('handed_to_post', NOW)).toBeUndefined();
      // بسته‌ای که به پست رسید لغو نمی‌شود، و فقط یک قدم برمی‌گردد.
      expect(await to('cancelled')).toBe('orders_status_flow');
      expect(await to('paid')).toBe('orders_status_flow');
      expect(await to('printing', NOW)).toBe('orders_handed_at');
      expect(await to('printing')).toBeUndefined();
      expect(await to('paid')).toBeUndefined();
      // لغو از «در صف چاپ» و «در حال چاپ»، و برگرداندنش به همان‌ها؛ لغوشده هم پرداخت‌شده است.
      expect(await to('cancelled')).toBeUndefined();
      expect(await to('expired')).toBe('orders_payment_final');
      expect(await to('handed_to_post', NOW)).toBe('orders_status_flow');
      expect(await to('printing')).toBeUndefined();
      expect(await to('cancelled')).toBeUndefined();
      expect(await to('paid')).toBeUndefined();
      expect((await statusOf(order.id)).status).toBe('paid');

      // سفارش پرداخت‌نشده چاپ نمی‌شود؛ منقضی زنده نمی‌شود.
      const unpaid = await createOrderStore(conn).createOrder({
        ...(await (async () => {
          const [row] = await conn.db.select().from(orders).where(byId);
          return {
            checkoutKey: randomUUID(),
            userId: row!.userId,
            breakdown: row!.priceBreakdown as Breakdown,
            quoteSnapshot: null,
            slaDays: 2,
            shippingMethodId: 'post',
            shippingZoneId: 'tehran',
            provinceId: 8,
            cityId: 394,
            recipientName: 'کیان رستمی',
            recipientPhone: '09121234567',
            addressText: 'تبریز، خیابان ولیعصر، پلاک 7',
            postalCode: null,
            items: [
              {
                pageCount: 20,
                copies: 1,
                sidesMode: 'double' as const,
                paperSize: 'a4' as const,
                bindingTypeId: 'spiral_clear',
                sections: [{ documentId: docId, pageCount: 20 }],
                rules: [{ pageRanges: [[1, 20]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }],
              },
            ],
          };
        })()),
      });
      const unpaidTo = (status: OrderStatus) =>
        rejectedConstraint(conn.db.update(orders).set({ status }).where(eq(orders.id, unpaid.order.id)));
      expect(await unpaidTo('printing')).toBe('orders_status_flow');
      expect(await unpaidTo('cancelled')).toBe('orders_status_flow');
      expect(await createOrderStore(conn).expireOrder(unpaid.order.id, NOW)).toBe(true);
      expect(await unpaidTo('awaiting_payment')).toBe('orders_status_flow');
      expect(await unpaidTo('paid')).toBe('orders_status_flow');

      // سفارشی که یکراست با وضعیت پس از پرداخت درج شود هم تاریخ پرداخت و مهلت می‌خواهد، و «تحویل پست شد» زمانش را.
      const { id: _id, orderNumber: _number, publicToken: _token, ...copy } = await statusOf(order.id);
      const insert = (patch: Partial<typeof orders.$inferInsert>) =>
        rejectedConstraint(conn.db.insert(orders).values({ ...copy, checkoutKey: randomUUID(), ...patch }));
      for (const status of ['printing', 'handed_to_post', 'cancelled'] as const) {
        expect(await insert({ status, paidAt: null, postHandoffDueAt: null, handedToPostAt: status === 'handed_to_post' ? NOW : null })).toBe(
          'orders_paid_has_dates',
        );
      }
      expect(await insert({ status: 'handed_to_post', handedToPostAt: null })).toBe('orders_handed_at');

      // ردیف وضعیت ادمین همیشه ادمینش را دارد، و فقط ادمین.
      const row = (actor: string, adminUserId: string | null) =>
        rejectedConstraint(conn.db.insert(orderStatusEvents).values({ orderId: order.id, fromStatus: 'paid', toStatus: 'printing', actor, adminUserId }));
      expect(await row('admin', null)).toBe('order_status_events_admin');
      expect(await row('gateway', owner)).toBe('order_status_events_admin');
      expect(await row('admin', owner)).toBeUndefined();
    });

    it('تغییر وضعیت در یک تراکنش: سفارش، ردیف وضعیت با ادمین و دلیل، و رویداد ادمین؛ زمان تحویل پست و برگرداندنش', async () => {
      const panel = createPanelOrderStore(conn);
      const order = await paidOrder();
      const started = await panel.changeStatus(ALL_ORDERS, change(order, 'paid', 'printing', { adminUserId: operator }));
      expect(started).toMatchObject({ ok: true, order: { status: 'printing', handedToPostAt: null } });
      const handedAt = new Date(NOW.getTime() + 5 * 3_600_000);
      expect(await panel.changeStatus(ALL_ORDERS, change(order, 'printing', 'handed_to_post', { at: handedAt, adminUserId: operator }))).toMatchObject({
        ok: true,
        order: { status: 'handed_to_post', handedToPostAt: handedAt },
      });
      const reverted = await panel.changeStatus(ALL_ORDERS, 
        change(order, 'handed_to_post', 'printing', { at: new Date(NOW.getTime() + 6 * 3_600_000), reason: 'اشتباه زدم؛ هنوز صحافی نشده' }),
      );
      expect(reverted).toMatchObject({ ok: true, order: { status: 'printing', handedToPostAt: null } });
      expect(
        await panel.changeStatus(ALL_ORDERS, change(order, 'printing', 'cancelled', { at: new Date(NOW.getTime() + 7 * 3_600_000), reason: 'مشتری خواست' })),
      ).toMatchObject({ ok: true });

      expect((await statusRows(order.id)).map((e) => [e.fromStatus, e.toStatus, e.actor, e.adminUserId, e.note])).toEqual([
        [null, 'awaiting_payment', 'user', null, null],
        ['awaiting_payment', 'paid', 'gateway', null, expect.anything()],
        ['paid', 'printing', 'admin', operator, null],
        ['printing', 'handed_to_post', 'admin', operator, null],
        ['handed_to_post', 'printing', 'admin', owner, { reason: 'اشتباه زدم؛ هنوز صحافی نشده' }],
        ['printing', 'cancelled', 'admin', owner, { reason: 'مشتری خواست' }],
      ]);
      expect((await statusRows(order.id)).at(3)!.at).toEqual(handedAt);
      expect((await eventsOf(order.id)).map((e) => [e.adminUserId, e.action, e.detail])).toEqual([
        [operator, 'orders.status', { orderNumber: order.orderNumber, from: 'paid', to: 'printing' }],
        [operator, 'orders.status', { orderNumber: order.orderNumber, from: 'printing', to: 'handed_to_post' }],
        [owner, 'orders.status', { orderNumber: order.orderNumber, from: 'handed_to_post', to: 'printing' }],
        [owner, 'orders.status', { orderNumber: order.orderNumber, from: 'printing', to: 'cancelled' }],
      ]);
      // قیمت و مهلت همان که بود.
      const after = await statusOf(order.id);
      expect([after.totalRials, after.postHandoffDueAt, after.paidAt]).toEqual([order.totalRials, order.postHandoffDueAt, order.paidAt]);

      // جزئیات پنل: رویدادهای وضعیت با نام ادمین و دلیل.
      const details = await panel.details(ALL_ORDERS, order.orderNumber);
      expect(details!.statusEvents.slice(2).map((e) => [e.toStatus, e.adminName, e.note])).toEqual([
        ['printing', 'علی محمدی', null],
        ['handed_to_post', 'علی محمدی', null],
        ['printing', 'سارا رضایی', { reason: 'اشتباه زدم؛ هنوز صحافی نشده' }],
        ['cancelled', 'سارا رضایی', { reason: 'مشتری خواست' }],
      ]);
    });

    it('دو کلیک هم‌زمان یک بار؛ وضعیتی که دیگر نیست رد می‌شود و وضعیت امروز برمی‌گردد', async () => {
      const panel = createPanelOrderStore(conn);
      const order = await paidOrder();
      const results = await Promise.all([
        panel.changeStatus(ALL_ORDERS, change(order, 'paid', 'printing')),
        panel.changeStatus(ALL_ORDERS, change(order, 'paid', 'printing')),
      ]);
      expect(results.map((r) => (r.ok ? 'ok' : r.current)).sort()).toEqual(['ok', 'printing']);
      expect((await statusRows(order.id)).filter((e) => e.actor === 'admin')).toHaveLength(1);
      expect(await eventsOf(order.id)).toHaveLength(1);
      // لغو و «تحویل پست شد» هم‌زمان: فقط یکی.
      const race = await Promise.all([
        panel.changeStatus(ALL_ORDERS, change(order, 'printing', 'cancelled', { reason: 'مشتری خواست' })),
        panel.changeStatus(ALL_ORDERS, change(order, 'printing', 'handed_to_post')),
      ]);
      expect(race.filter((r) => r.ok)).toHaveLength(1);
      expect((await statusRows(order.id)).filter((e) => e.actor === 'admin')).toHaveLength(2);
      // وضعیتی که ادمین دید دیگر نیست: هیچ ردی نمی‌ماند.
      const current = (await statusOf(order.id)).status;
      expect(await panel.changeStatus(ALL_ORDERS, change(order, 'paid', 'printing'))).toEqual({ ok: false, current });
      expect(await panel.changeStatus(ALL_ORDERS, change({ id: randomUUID(), orderNumber: 1 }, 'paid', 'printing'))).toEqual({ ok: false, current: null });
      expect(await eventsOf(order.id)).toHaveLength(2);
      // گذاری که پایگاه داده نمی‌پذیرد، با رویدادش برمی‌گردد (همه یا هیچ).
      const other = await paidOrder();
      expect(await rejectedConstraint(panel.changeStatus(ALL_ORDERS, change(other, 'paid', 'handed_to_post')))).toBe('orders_status_flow');
      expect(await eventsOf(other.id)).toEqual([]);
      expect((await statusRows(other.id)).filter((e) => e.actor === 'admin')).toEqual([]);
    });

    it('ویرایش گیرنده زیر قفل و فقط تا پیش از پست؛ رویداد با فیلدهای عوض‌شده و مقدار پیشین؛ قیمت و جای ارسال دست نمی‌خورند', async () => {
      const panel = createPanelOrderStore(conn);
      const order = await paidOrder();
      const event = (at: Date): AdminEventInput => ({
        adminUserId: operator,
        action: 'orders.recipient',
        targetType: 'order',
        targetId: order.id,
        ipHash: 'ip',
        detail: { orderNumber: order.orderNumber },
        at,
      });
      const editable = ['paid', 'printing'] as const;
      const fixed = { recipientName: 'سارا احمدی', addressText: 'خیابان ولیعصر، کوچهٔ نسترن، پلاک 12', postalCode: '9187654321' };
      const edited = await panel.editRecipient(ALL_ORDERS, { orderId: order.id, editable, recipient: fixed, event: event(NOW) });
      expect(edited).toMatchObject({ ok: true, changed: ['addressText', 'postalCode'], order: fixed });
      // دوباره همان: چیزی عوض نشد، رویدادی هم نه.
      expect(await panel.editRecipient(ALL_ORDERS, { orderId: order.id, editable, recipient: fixed, event: event(NOW) })).toMatchObject({ ok: true, changed: [] });
      expect((await eventsOf(order.id)).map((e) => [e.action, e.detail])).toEqual([
        [
          'orders.recipient',
          {
            orderNumber: order.orderNumber,
            changed: ['addressText', 'postalCode'],
            previous: { addressText: 'خیابان ولیعصر، پلاک 12', postalCode: null },
          },
        ],
      ]);
      const after = await statusOf(order.id);
      expect(after).toMatchObject({
        recipientPhone: '09121234567',
        provinceId: 8,
        cityId: 394,
        shippingZoneId: 'tehran',
        totalRials: order.totalRials,
        shippingRials: order.shippingRials,
        status: 'paid',
      });
      // پایگاه داده هم کد پستی بد را نمی‌پذیرد.
      expect(
        await rejectedConstraint(panel.editRecipient(ALL_ORDERS, { orderId: order.id, editable, recipient: { ...fixed, postalCode: '123' }, event: event(NOW) })),
      ).toBe('orders_postal_code');
      // به پست رسید: دیگر نه.
      await panel.changeStatus(ALL_ORDERS, change(order, 'paid', 'printing'));
      await panel.changeStatus(ALL_ORDERS, change(order, 'printing', 'handed_to_post'));
      expect(
        await panel.editRecipient(ALL_ORDERS, { orderId: order.id, editable, recipient: { ...fixed, recipientName: 'سارا' }, event: event(NOW) }),
      ).toEqual({ ok: false, current: 'handed_to_post' });
      expect((await statusOf(order.id)).recipientName).toBe('سارا احمدی');
      expect(await panel.editRecipient(ALL_ORDERS, { orderId: randomUUID(), editable, recipient: fixed, event: event(NOW) })).toEqual({ ok: false, current: null });
    });

    it('سطل‌ها، کاشی‌ها و هشدار: «باز» یعنی در صف و در حال چاپ؛ تحویل پست شد و لغو شد جدا', async () => {
      const panel = createPanelOrderStore(conn);
      const queued = await paidOrder(END_MONDAY, 'در صف');
      const printing = await paidOrder(END_SATURDAY, 'در حال چاپ');
      const handed = await paidOrder(END_SATURDAY, 'به پست رسید');
      const cancelled = await paidOrder(END_MONDAY, 'لغو شد');
      await panel.changeStatus(ALL_ORDERS, change(printing, 'paid', 'printing'));
      await panel.changeStatus(ALL_ORDERS, change(handed, 'paid', 'printing'));
      await panel.changeStatus(ALL_ORDERS, change(handed, 'printing', 'handed_to_post'));
      await panel.changeStatus(ALL_ORDERS, change(cancelled, 'paid', 'cancelled', { reason: 'مشتری خواست' }));
      const clock: PanelClock = { at: NOW, staleBefore: new Date(NOW.getTime() + 60 * MINUTE), unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE), untrackedSince: new Date(NOW.getTime() - 45 * 86_400_000) };
      expect(await panel.counts(ALL_ORDERS, { search: null, clock })).toEqual({ open: 2, handed: 1, cancelled: 1, awaiting: 0, abandoned: 0, all: 4 });
      const numbers = async (bucket: PanelBucket) =>
        (await panel.list(ALL_ORDERS, { bucket, search: null, clock, limit: 50, offset: 0 })).map((row) => row.orderNumber);
      // «باز» به ترتیب مهلت: در حال چاپِ دیرشده اول.
      expect(await numbers('open')).toEqual([printing.orderNumber, queued.orderNumber]);
      expect(await numbers('handed')).toEqual([handed.orderNumber]);
      expect(await numbers('cancelled')).toEqual([cancelled.orderNumber]);
      const [line] = await panel.list(ALL_ORDERS, { bucket: 'handed', search: null, clock, limit: 50, offset: 0 });
      expect(line).toMatchObject({ status: 'handed_to_post', handedToPostAt: NOW, cancelledAt: null });
      const [gone] = await panel.list(ALL_ORDERS, { bucket: 'cancelled', search: null, clock, limit: 50, offset: 0 });
      expect(gone).toMatchObject({ status: 'cancelled', cancelledAt: NOW, handedToPostAt: null });
      // کاشی‌ها فقط سفارش‌هایی که هنوز به پست نرسیده‌اند: دیرشدهٔ «در حال چاپ» و امروزِ «در صف».
      expect(await panel.dueSummary(ALL_ORDERS, { at: NOW, tomorrowStart: END_MONDAY, dayAfterStart: tehran('2026-10-07 00:00') })).toMatchObject({
        overdue: 1,
        today: 1,
        tomorrow: 0,
        later: 0,
      });
      // PDF ساخته‌نشده فقط برای سفارش باز هشدار است.
      for (const o of [printing, cancelled]) {
        await conn.db.update(jobs).set({ status: 'failed', attempts: 1, lastError: 'file_missing: file_missing', finishedAt: NOW }).where(eq(jobs.orderId, o.id));
      }
      expect((await panel.alerts(ALL_ORDERS, clock)).failedPdf).toEqual([printing.orderNumber]);
    });

    it('آمار پیشخوان: در حال چاپ، و تحویل‌های پست از مرز تا «حالا»، به‌موقع و دیر؛ برگشته از پست نه', async () => {
      const panel = createPanelOrderStore(conn);
      const since = new Date(NOW.getTime() - 7 * DAY);
      const onTime = await paidOrder(END_MONDAY);
      const late = await paidOrder(END_SATURDAY);
      const old = await paidOrder(END_SATURDAY);
      const back = await paidOrder(END_MONDAY);
      const printing = await paidOrder(END_MONDAY);
      await paidOrder(END_MONDAY); // در صف چاپ: نه «در حال چاپ»، نه تحویل
      const hand = async (o: typeof onTime, at: Date) => {
        await panel.changeStatus(ALL_ORDERS, change(o, 'paid', 'printing', { at }));
        await panel.changeStatus(ALL_ORDERS, change(o, 'printing', 'handed_to_post', { at }));
      };
      await hand(onTime, new Date(END_MONDAY.getTime() - 1));
      // خودِ پایان مهلت دیگر دیر است (پایان انحصاری).
      await hand(late, END_SATURDAY);
      await hand(old, since);
      await hand(back, NOW);
      await panel.changeStatus(ALL_ORDERS, change(back, 'handed_to_post', 'printing', { reason: 'اشتباه' }));
      await panel.changeStatus(ALL_ORDERS, change(printing, 'paid', 'printing'));
      // «در حال چاپ»: خودِ آن و برگشته از پست. تحویل‌ها: به‌موقع و دیر؛ درست روی مرز بیرون است.
      expect(await panel.stats(ALL_ORDERS, { since, at: END_MONDAY })).toEqual({ printing: 2, handed: 2, onTime: 1 });
      // یک میلی‌ثانیه پیش‌تر، مرز هم درون است (شاهد `>`)؛ تحویلی درست در «حالا» شمرده می‌شود (شاهد `<=`)، و بعدش نه.
      expect(await panel.stats(ALL_ORDERS, { since: new Date(since.getTime() - 1), at: END_MONDAY })).toEqual({ printing: 2, handed: 3, onTime: 2 });
      expect(await panel.stats(ALL_ORDERS, { since, at: new Date(END_MONDAY.getTime() - 1) })).toEqual({ printing: 2, handed: 2, onTime: 1 });
      expect(await panel.stats(ALL_ORDERS, { since, at: new Date(END_MONDAY.getTime() - 2) })).toEqual({ printing: 2, handed: 1, onTime: 0 });
    });

    /* ── بازپرداخت (برش ۷٫۳، ADR-051) ── */

    describe('بازپرداخت: محافظ‌های refunds، ساختن زیر قفل و استعلام (برش ۷٫۳)', () => {
      const PAID_RAW = { decision: 'success', verified: true, refId: '803114' };
      const paymentOf = async (orderId: string) =>
        (await conn.db.select().from(payments).where(and(eq(payments.orderId, orderId), eq(payments.status, 'succeeded'))))[0]!;
      const refundOf = async (id: string) => (await conn.db.select().from(refunds).where(eq(refunds.id, id)))[0]!;
      const refundsOf = (orderId: string) => conn.db.select().from(refunds).where(eq(refunds.orderId, orderId));

      /** سفارش پرداخت‌شده‌ای که لغو شد، مثل پنل؛ با `raw` پرداخت برای رفتار بازپرداخت درگاه نمونه (`MockRefundPlan`). */
      async function cancelledOrder(raw: unknown = PAID_RAW, cardMask: string | null = null, at = NOW) {
        const order = await paidOrder(END_MONDAY, 'سارا احمدی', raw, cardMask);
        const written = await createPanelOrderStore(conn).changeStatus(ALL_ORDERS, change(order, 'paid', 'cancelled', { reason: 'مشتری خواست', at }));
        expect(written.ok).toBe(true);
        return { order, payment: await paymentOf(order.id) };
      }

      type RefundInsert = typeof refunds.$inferInsert;
      /** ردیف خام بازپرداخت، برای محافظ‌ها؛ پیش‌فرض بازپرداخت دستی کامل. */
      const manualRow = (order: { id: string; totalRials: number }, paymentId: string, over: Partial<RefundInsert> = {}): RefundInsert => ({
        orderId: order.id,
        paymentId,
        amountRials: order.totalRials,
        method: 'manual',
        status: 'succeeded',
        reference: '552190',
        refundedOn: tehran('2026-10-05 00:00'),
        adminUserId: owner,
        createdAt: NOW,
        finishedAt: NOW,
        ...over,
      });
      const gatewayRow = (order: { id: string; totalRials: number }, paymentId: string, over: Partial<RefundInsert> = {}) =>
        manualRow(order, paymentId, {
          method: 'gateway',
          status: 'pending',
          feeRials: 15_000,
          reference: null,
          refundedOn: null,
          finishedAt: null,
          ...over,
        });
      const insert = (row: RefundInsert) => conn.db.insert(refunds).values(row).returning();
      const failRow = (id: string) =>
        conn.db.update(refunds).set({ status: 'failed', failureReason: 'balance', finishedAt: NOW, settledVia: 'request' }).where(eq(refunds.id, id));

      /** ورودی `start`، مثل سرویس پنل. */
      const startInput = (
        order: { id: string; orderNumber: number; totalRials: number },
        paymentId: string,
        over: Partial<RefundStart> = {},
      ): RefundStart => {
        const method = over.method ?? 'manual';
        const at = over.at ?? NOW;
        return {
          orderId: order.id,
          paymentId,
          seen: null,
          method,
          amountRials: order.totalRials,
          feeRials: method === 'gateway' ? 15_000 : null,
          reference: method === 'manual' ? '552190' : null,
          refundedOn: method === 'manual' ? tehran('2026-10-05 00:00') : null,
          note: method === 'manual' ? 'کارت‌به‌کارت به همان کارت' : null,
          adminUserId: owner,
          at,
          event: {
            adminUserId: owner,
            action: 'orders.refund',
            targetType: 'order',
            targetId: order.id,
            ipHash: 'ip',
            detail: { orderNumber: order.orderNumber, method, amountRials: order.totalRials },
            at,
          },
          ...over,
        };
      };

      it('فقط پرداخت موفق سفارش «لغو شد»؛ شاهد: همان ردیف پس از لغو و با پرداخت درست درج می‌شود', async () => {
        const order = await paidOrder(END_MONDAY, 'سارا احمدی', PAID_RAW);
        const payment = await paymentOf(order.id);
        expect(await rejectedConstraint(insert(manualRow(order, payment.id)))).toBe('refunds_cancelled_only');
        expect((await createPanelOrderStore(conn).changeStatus(ALL_ORDERS, change(order, 'paid', 'cancelled', { reason: 'x' }))).ok).toBe(true);
        const other = await cancelledOrder();
        expect(await rejectedConstraint(insert(manualRow(order, other.payment.id)))).toBe('refunds_paid_only');
        const failed = await createOrderStore(conn).insertPayment({
          orderId: order.id,
          provider: 'mock',
          amountRials: order.totalRials,
          authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
          raw: null,
        });
        expect(await rejectedConstraint(insert(manualRow(order, failed.id)))).toBe('refunds_paid_only');
        expect(await rejectedConstraint(insert(manualRow(order, payment.id)))).toBeUndefined();
      });

      it('جمع زنده از مبلغ پرداخت بیشتر نمی‌شود؛ «برنگشت» شمرده نمی‌شود', async () => {
        const { order, payment } = await cancelledOrder();
        expect(await rejectedConstraint(insert(manualRow(order, payment.id, { amountRials: order.totalRials - 10_000 })))).toBeUndefined();
        expect(await rejectedConstraint(insert(manualRow(order, payment.id, { amountRials: 10_010 })))).toBe('refunds_within_payment');
        // شاهد: درست تا سقف می‌نشیند، و یک ریال بیشتر نه.
        expect(await rejectedConstraint(insert(manualRow(order, payment.id, { amountRials: 10_000 })))).toBeUndefined();
        expect(await rejectedConstraint(insert(manualRow(order, payment.id, { amountRials: 1 })))).toBe('refunds_within_payment');

        const second = await cancelledOrder();
        const [failed] = await insert(gatewayRow(second.order, second.payment.id));
        await failRow(failed!.id);
        expect(await rejectedConstraint(insert(manualRow(second.order, second.payment.id)))).toBeUndefined();
      });

      it('یکی در جریان برای هر پرداخت؛ راه درگاه بی پاسخ درگاه درج می‌شود؛ شاهد: پس از «برنگشت» دوباره', async () => {
        const { order, payment } = await cancelledOrder();
        const done = { status: 'succeeded' as const, finishedAt: NOW, settledVia: 'request' };
        expect(await rejectedConstraint(insert(gatewayRow(order, payment.id, done)))).toBe('refunds_insert_state');
        expect(await rejectedConstraint(insert(gatewayRow(order, payment.id, { gatewayRef: 'MOCKRF1' })))).toBe('refunds_insert_state');
        expect(await rejectedConstraint(insert(gatewayRow(order, payment.id, { gatewayError: 'unavailable' })))).toBe('refunds_insert_state');
        const [first] = await insert(gatewayRow(order, payment.id, { amountRials: 1 }));
        expect(await rejectedConstraint(insert(gatewayRow(order, payment.id, { amountRials: 1 })))).toBe('refunds_one_pending');
        await failRow(first!.id);
        expect(await rejectedConstraint(insert(gatewayRow(order, payment.id)))).toBeUndefined();
      });

      it('گذار فقط «در حال برگشت» ← نهایی؛ ستون‌های منجمد؛ شناسهٔ درگاه یک بار؛ پاک‌نشدنی', async () => {
        const { order, payment } = await cancelledOrder();
        const [row] = await insert(gatewayRow(order, payment.id));
        const byId = eq(refunds.id, row!.id);
        const set = (values: Partial<RefundInsert>) => rejectedConstraint(conn.db.update(refunds).set(values).where(byId));
        expect(await set({ amountRials: order.totalRials - 10 })).toBe('refunds_frozen');
        expect(await set({ feeRials: 0 })).toBe('refunds_frozen');
        expect(await set({ adminUserId: operator })).toBe('refunds_frozen');
        expect(await set({ createdAt: new Date(NOW.getTime() - 1) })).toBe('refunds_frozen');
        // شاهد: آنچه درگاه می‌گوید عوض‌شدنی است.
        expect(await set({ gatewayRef: 'MOCKRF1', gatewayStatus: 16, gatewayCheckedAt: NOW, raw: { status: 16 } })).toBeUndefined();
        expect(await set({ gatewayRef: 'MOCKRF2' })).toBe('refunds_frozen');
        expect(await set({ status: 'succeeded', reference: '552190', finishedAt: NOW, settledVia: 'auto' })).toBeUndefined();
        expect(await set({ reference: '552191' })).toBe('refunds_flow');
        expect(await set({ status: 'failed', failureReason: 'other' })).toBe('refunds_flow');
        expect(await rejectedConstraint(conn.db.delete(refunds).where(byId))).toBe('refunds_append_only');
        expect(await refundOf(row!.id)).toMatchObject({ status: 'succeeded', reference: '552190', gatewayRef: 'MOCKRF1' });
      });

      it('محدودیت‌های شکل: راه، نهایی با زمان و علت، کد پیگیری، یادداشت، روز و برچسب خطا', async () => {
        const { order, payment } = await cancelledOrder();
        const manual = (over: Partial<RefundInsert>) => rejectedConstraint(insert(manualRow(order, payment.id, over)));
        const gateway = (over: Partial<RefundInsert>) => rejectedConstraint(insert(gatewayRow(order, payment.id, over)));
        expect(await manual({ amountRials: 0 })).toBe('refunds_amount_positive');
        expect(await manual({ reference: null })).toBe('refunds_method');
        expect(await manual({ refundedOn: null })).toBe('refunds_method');
        expect(await manual({ feeRials: 15_000 })).toBe('refunds_method');
        expect(await manual({ status: 'pending', finishedAt: null })).toBe('refunds_method');
        expect(await manual({ method: 'card', settledVia: 'request' })).toBe('refunds_method');
        expect(await gateway({ feeRials: null })).toBe('refunds_method');
        expect(await gateway({ note: 'x' })).toBe('refunds_method');
        expect(await manual({ finishedAt: null })).toBe('refunds_finished');
        expect(await manual({ failureReason: 'balance' })).toBe('refunds_finished');
        expect(await manual({ reference: '۵۵۲۱۹۰' })).toBe('refunds_reference');
        expect(await manual({ reference: '55' })).toBe('refunds_reference');
        expect(await manual({ note: '   ' })).toBe('refunds_note');
        expect(await manual({ note: 'ب'.repeat(201) })).toBe('refunds_note');
        expect(await manual({ refundedOn: new Date(NOW.getTime() + 1) })).toBe('refunds_refunded_on');
        const [row] = await insert(gatewayRow(order, payment.id));
        const set = (values: Partial<RefundInsert>) => rejectedConstraint(conn.db.update(refunds).set(values).where(eq(refunds.id, row!.id)));
        expect(await set({ gatewayError: 'unavailable merchant' })).toBe('refunds_gateway_error');
        expect(await set({ gatewayRef: 'MOCK RF' })).toBe('refunds_gateway_ref');
        expect(await set({ status: 'failed', failureReason: 'wallet', finishedAt: NOW, settledVia: 'request' })).toBe('refunds_failure_reason');
        expect(await set({ status: 'failed', failureReason: 'balance', finishedAt: NOW })).toBe('refunds_finished');
        expect(await set({ settledVia: 'request' })).toBe('refunds_finished');
        // شاهد: همان‌ها با مقدار درست.
        expect(await set({ gatewayError: 'unavailable:503', gatewayRef: 'MOCKRF_1-a' })).toBeUndefined();
        expect(await set({ status: 'failed', failureReason: 'balance', finishedAt: NOW, settledVia: 'request' })).toBeUndefined();
        expect(await manual({ note: 'ب'.repeat(200) })).toBeUndefined();
      });

      it('سفارش با بازپرداخت زنده از «لغو شد» برنمی‌گردد؛ شاهد: با «برنگشت» برمی‌گردد', async () => {
        const store = createPanelOrderStore(conn);
        const first = await cancelledOrder();
        await insert(gatewayRow(first.order, first.payment.id));
        expect(await rejectedConstraint(conn.db.update(orders).set({ status: 'paid' }).where(eq(orders.id, first.order.id)))).toBe(
          'orders_status_flow',
        );
        expect(await store.changeStatus(ALL_ORDERS, change(first.order, 'cancelled', 'paid', { reason: 'اشتباه' }))).toEqual({
          ok: false,
          current: 'cancelled',
          refunded: true,
        });
        const second = await cancelledOrder();
        await insert(manualRow(second.order, second.payment.id));
        expect(await rejectedConstraint(conn.db.update(orders).set({ status: 'printing' }).where(eq(orders.id, second.order.id)))).toBe(
          'orders_status_flow',
        );
        const third = await cancelledOrder();
        const [failed] = await insert(gatewayRow(third.order, third.payment.id));
        await failRow(failed!.id);
        expect((await store.changeStatus(ALL_ORDERS, change(third.order, 'cancelled', 'paid', { reason: 'اشتباه' }))).ok).toBe(true);
      });

      it('ساختن زیر قفل: دستی «برگشت داده شد» با رویداد و شناسه‌اش؛ «همان که دیده شد»؛ وضعیت، پرداخت و محدوده', async () => {
        const store = createRefundStore(conn);
        const { order, payment } = await cancelledOrder();
        const made = await store.start(ALL_ORDERS, startInput(order, payment.id));
        expect(made.ok).toBe(true);
        const refund = made.ok ? made.refund : null;
        expect(refund).toMatchObject({
          method: 'manual',
          status: 'succeeded',
          amountRials: order.totalRials,
          reference: '552190',
          note: 'کارت‌به‌کارت به همان کارت',
          finishedAt: NOW,
          adminUserId: owner,
        });
        const events = await eventsOf(order.id);
        expect(events.at(-1)).toMatchObject({
          action: 'orders.refund',
          adminUserId: owner,
          detail: { orderNumber: order.orderNumber, method: 'manual', amountRials: order.totalRials, refundId: refund!.id },
        });
        // همان فرم دوباره (دو کلیک): بازپرداخت زنده هست.
        expect(await store.start(ALL_ORDERS, startInput(order, payment.id))).toMatchObject({ ok: false, reason: 'changed', latest: { id: refund!.id } });
        expect(await refundsOf(order.id)).toHaveLength(1);

        // سفارشی که لغو نشده، پرداختی که همان نیست، و بیرون از محدوده.
        const paid = await paidOrder(END_MONDAY, 'سارا احمدی', PAID_RAW);
        expect(await store.start(ALL_ORDERS, startInput(paid, (await paymentOf(paid.id)).id))).toEqual({ ok: false, reason: 'not_cancelled' });
        const other = await cancelledOrder();
        expect(await store.start(ALL_ORDERS, startInput(other.order, payment.id))).toEqual({ ok: false, reason: 'payment_changed' });
        expect(await store.start({ kind: 'partner', partnerId: randomUUID() }, startInput(other.order, other.payment.id))).toEqual({
          ok: false,
          reason: 'not_found',
        });

        // پس از «برنگشت»: فقط با همان که دید.
        const gw = await store.start(ALL_ORDERS, startInput(other.order, other.payment.id, { method: 'gateway' }));
        expect(gw).toMatchObject({ ok: true, refund: { status: 'pending', method: 'gateway', feeRials: 15_000, reference: null } });
        const gwId = gw.ok ? gw.refund.id : '';
        await failRow(gwId);
        expect(await store.start(ALL_ORDERS, startInput(other.order, other.payment.id))).toMatchObject({ ok: false, reason: 'changed', latest: { id: gwId } });
        expect(await store.start(ALL_ORDERS, startInput(other.order, other.payment.id, { seen: gwId }))).toMatchObject({ ok: true });
      });

      it('دو کلیک هم‌زمان یک بازپرداخت؛ بازپرداخت و برگرداندن لغو هم‌زمان: فقط یکی', async () => {
        const store = createRefundStore(conn);
        const panel = createPanelOrderStore(conn);
        for (let round = 0; round < 6; round += 1) {
          const { order, payment } = await cancelledOrder();
          const method = round % 2 === 0 ? 'manual' : 'gateway';
          const results = await Promise.all([
            store.start(ALL_ORDERS, startInput(order, payment.id, { method })),
            store.start(ALL_ORDERS, startInput(order, payment.id, { method })),
          ]);
          expect(results.filter((result) => result.ok)).toHaveLength(1);
          expect(await refundsOf(order.id)).toHaveLength(1);
        }
        for (let round = 0; round < 6; round += 1) {
          const { order, payment } = await cancelledOrder();
          const [refund, revert] = await Promise.all([
            store.start(ALL_ORDERS, startInput(order, payment.id, { method: round % 2 === 0 ? 'manual' : 'gateway' })),
            panel.changeStatus(ALL_ORDERS, change(order, 'cancelled', 'paid', { reason: 'اشتباه' })),
          ]);
          // دقیقاً یکی: یا پول برمی‌گردد و سفارش لغو می‌ماند، یا سفارش برگشت و بازپرداختی نیست.
          expect(refund.ok !== revert.ok).toBe(true);
          const after = await statusOf(order.id);
          const rows = await refundsOf(order.id);
          if (refund.ok) {
            expect(after.status).toBe('cancelled');
            expect(rows).toHaveLength(1);
          } else {
            expect(after.status).toBe('paid');
            expect(rows).toHaveLength(0);
          }
        }
      });

      it('قفل‌های ماشه به‌تنهایی، بی قفل کد: برگرداندن لغو و درج دوم همان پرداخت پشت درج باز می‌مانند', async () => {
        // سرویس سطر سفارش را خودش `FOR UPDATE` می‌گیرد و همین تست بالا را سبز نگه می‌دارد؛ این‌جا درج خام است، پس فقط قفل ماشه می‌ماند.
        const panel = createPanelOrderStore(conn);
        /** درجی که باز می‌ماند تا `release`. */
        const holding = (row: RefundInsert) => {
          let release!: () => void;
          const held = new Promise<void>((resolve) => (release = resolve));
          let inserted!: () => void;
          const ready = new Promise<void>((resolve) => (inserted = resolve));
          const done = conn.db.transaction(async (tx) => {
            await tx.insert(refunds).values(row);
            inserted();
            await held;
          });
          return { ready, release, done };
        };
        /** هنوز در انتظار پس از ۳۰۰ میلی‌ثانیه؛ کران‌دار، چون نسخهٔ بی قفل همان لحظه تمام می‌شود. */
        const waiting = (promise: Promise<unknown>) =>
          Promise.race([promise.then(() => false), new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 300))]);

        // سفارش (`FOR SHARE`): برگرداندن لغو منتظر می‌ماند و پس از commit بازپرداخت را می‌بیند.
        const first = await cancelledOrder();
        const refund = holding(manualRow(first.order, first.payment.id));
        await refund.ready;
        const revert = panel.changeStatus(ALL_ORDERS, change(first.order, 'cancelled', 'paid', { reason: 'اشتباه' }));
        // شکست همین‌جا بماند: درج باز اگر رها نشود، تست‌های بعدی پشت قفلش می‌مانند.
        const revertWaited = await waiting(revert).finally(refund.release);
        await refund.done;
        expect(revertWaited).toBe(true);
        expect(await revert).toMatchObject({ ok: false, refunded: true });
        expect((await statusOf(first.order.id)).status).toBe('cancelled');

        // پرداخت (`FOR UPDATE`): درج دوم منتظر می‌ماند و جمع را با اولی می‌سنجد.
        const second = await cancelledOrder();
        const one = holding(manualRow(second.order, second.payment.id));
        await one.ready;
        const two = rejectedConstraint(insert(manualRow(second.order, second.payment.id)));
        const twoWaited = await waiting(two).finally(one.release);
        await one.done;
        expect(twoWaited).toBe(true);
        expect(await two).toBe('refunds_within_payment');
        expect(await refundsOf(second.order.id)).toHaveLength(1);
      });

      it('از درگاه: درخواست با شناسهٔ ردیف، «در حال برگشت» و بعد استعلام «برگشت داده شد»؛ رد روشن «برنگشت»', async () => {
        const store = createRefundStore(conn);
        let at = new Date(NOW.getTime() + 5 * MINUTE);
        const deps = { store, gateways: { mock: mockGateway() }, now: () => at };
        const { order, payment } = await cancelledOrder(PAID_RAW, '603799******1234');
        const made = await store.start(ALL_ORDERS, startInput(order, payment.id, { method: 'gateway' }));
        const refund = made.ok ? made.refund : null;
        const asked = await requestRefund(deps, { refund: refund!, payment, description: `بازپرداخت سفارش ${order.orderNumber} جزوه‌یار` });
        expect(asked).toMatchObject({ status: 'pending', gatewayStatus: 16, gatewayError: null, gatewayCheckedAt: at, finishedAt: null });
        expect(asked.gatewayRef).toMatch(/^MOCKRF[0-9A-F]{32}$/);
        at = new Date(at.getTime() + 3 * MINUTE);
        const done = await inquireRefund(deps, refund!.id, { via: 'panel' });
        expect(done).toMatchObject({ orderNumber: order.orderNumber, before: { status: 'pending' }, refund: { status: 'succeeded', settledVia: 'panel', gatewayStatus: 15, finishedAt: at, gatewayRef: asked.gatewayRef } });
        expect(typeof done === 'object' && done?.refund.reference).toMatch(/^\d{6}$/);
        // بسته‌شده دیگر استعلام نمی‌شود.
        expect(await inquireRefund(deps, refund!.id, { via: 'panel' })).toBe('not_inquirable');

        const balance = await cancelledOrder({ ...PAID_RAW, refund: 'balance' });
        const second = await store.start(ALL_ORDERS, startInput(balance.order, balance.payment.id, { method: 'gateway' }));
        const rejected = await requestRefund(deps, { refund: second.ok ? second.refund : refund!, payment: balance.payment, description: 'x' });
        expect(rejected).toMatchObject({ status: 'failed', failureReason: 'balance', settledVia: 'request', finishedAt: at, gatewayError: null });
      });

      it('پاسخ گم‌شده: «معلوم نیست» تا استعلام؛ رسیده «برگشت داده شد»، نرسیده «برنگشت»؛ درخواست در راه استعلام نمی‌شود', async () => {
        const store = createRefundStore(conn);
        let at = new Date(NOW.getTime() + 5 * MINUTE);
        const deps = { store, gateways: { mock: mockGateway() }, now: () => at };
        const run = async (plan: string) => {
          const { order, payment } = await cancelledOrder({ ...PAID_RAW, refund: plan });
          const made = await store.start(ALL_ORDERS, startInput(order, payment.id, { method: 'gateway', at }));
          const refund = made.ok ? made.refund : null;
          // هنوز در راه: نه شناسه، نه خطا، و تازه.
          expect(await inquireRefund(deps, refund!.id, { via: 'auto', skipLocked: true })).toBe('not_inquirable');
          const asked = await requestRefund(deps, { refund: refund!, payment, description: 'x' });
          expect(asked).toMatchObject({ status: 'pending', gatewayRef: null, gatewayStatus: null, gatewayError: 'unavailable' });
          return asked;
        };
        const lost = await run('lost');
        expect(await inquireRefund(deps, lost.id, { via: 'auto', skipLocked: true })).toMatchObject({
          refund: { status: 'succeeded', settledVia: 'auto', gatewayRef: expect.stringMatching(/^MOCKRF/) },
        });
        const dropped = await run('dropped');
        expect(await inquireRefund(deps, dropped.id, { via: 'panel' })).toMatchObject({
          refund: { status: 'failed', failureReason: 'not_found', settledVia: 'panel' },
        });

        // پروسه وسط درخواست افتاد: پس از مهلت با شناسهٔ خودمان پرسیده می‌شود.
        const { order, payment } = await cancelledOrder();
        const made = await store.start(ALL_ORDERS, startInput(order, payment.id, { method: 'gateway', at }));
        const id = made.ok ? made.refund.id : '';
        expect(await inquireRefund(deps, id, { via: 'auto' })).toBe('not_inquirable');
        at = new Date(at.getTime() + REFUND_REQUEST_GRACE_MS);
        expect(await inquireRefund(deps, id, { via: 'auto' })).toMatchObject({ refund: { status: 'succeeded' } });
      });

      it('درگاه بی بازپرداخت یا بی کلید: درخواست نمی‌رود و «برنگشت»، بی پول؛ بی جواب: برچسب و همان «در حال برگشت»', async () => {
        const store = createRefundStore(conn);
        const deps = { store, gateways: {}, now: () => NOW };
        const { order, payment } = await cancelledOrder();
        const made = await store.start(ALL_ORDERS, startInput(order, payment.id, { method: 'gateway' }));
        expect(await requestRefund(deps, { refund: made.ok ? made.refund : (null as never), payment, description: 'x' })).toMatchObject({
          status: 'failed',
          failureReason: 'unconfigured',
          gatewayError: 'unconfigured',
          settledVia: 'request',
        });

        // درگاهی که بازپرداخت دارد ولی کلیدش خوانده نشد: درخواست نرفت، پس همان «برنگشت».
        const throwing = (code: 'unconfigured' | 'unavailable'): Record<string, PaymentGateway> => ({
          mock: {
            ...mockGateway(),
            refunds: {
              ...mockGateway().refunds!,
              request: async () => {
                throw new PaymentError(code);
              },
            },
          },
        });
        const second = await cancelledOrder();
        const unkeyed = await store.start(ALL_ORDERS, startInput(second.order, second.payment.id, { method: 'gateway' }));
        expect(
          await requestRefund({ ...deps, gateways: throwing('unconfigured') }, { refund: unkeyed.ok ? unkeyed.refund : (null as never), payment: second.payment, description: 'x' }),
        ).toMatchObject({ status: 'failed', failureReason: 'unconfigured', gatewayError: 'unconfigured', settledVia: 'request' });

        // بی جواب: شاید رسید، پس برچسب خطا و همان «در حال برگشت»، نه «برنگشت» (سؤال ۱۵۴).
        const third = await cancelledOrder();
        const lost = await store.start(ALL_ORDERS, startInput(third.order, third.payment.id, { method: 'gateway' }));
        expect(
          await requestRefund({ ...deps, gateways: throwing('unavailable') }, { refund: lost.ok ? lost.refund : (null as never), payment: third.payment, description: 'x' }),
        ).toMatchObject({ status: 'pending', failureReason: null, gatewayError: 'unavailable', finishedAt: null, settledVia: null });
      });

      it('استعلام خودکار: فقط در جریان، پس از ۲ دقیقه و تا ۲۴ ساعت، قدیمی‌ترین پرسش اول؛ SKIP LOCKED', async () => {
        const store = createRefundStore(conn);
        const base = NOW.getTime();
        const make = async (createdAt: Date, plan?: string) => {
          const { order, payment } = await cancelledOrder(plan ? { ...PAID_RAW, refund: plan } : PAID_RAW);
          const made = await store.start(ALL_ORDERS, startInput(order, payment.id, { method: 'gateway', at: createdAt }));
          return made.ok ? made.refund.id : '';
        };
        const fresh = await make(new Date(base - REFUND_AUTO_EVERY_MS + 1_000));
        const due = await make(new Date(base - 10 * MINUTE));
        const older = await make(new Date(base - 3 * 3_600_000));
        const stale = await make(new Date(base - REFUND_AUTO_WINDOW_MS - 1_000));
        const manual = (await cancelledOrder()).order;
        await store.start(ALL_ORDERS, startInput(manual, (await paymentOf(manual.id)).id));
        expect(await store.autoInquiry(NOW, 10, ['mock'])).toEqual([older, due]);
        // درگاهی که این پنل بازپرداختش را ندارد: هیچ.
        expect(await store.autoInquiry(NOW, 10, ['zibal'])).toEqual([]);
        expect(await store.autoInquiry(NOW, 10, [])).toEqual([]);
        // تازه پرسیده‌شده تا دو دقیقهٔ دیگر نه.
        await conn.db.update(refunds).set({ gatewayCheckedAt: new Date(base - MINUTE), gatewayError: 'unavailable' }).where(eq(refunds.id, older));
        expect(await store.autoInquiry(NOW, 10, ['mock'])).toEqual([due]);
        expect([fresh, stale].every((id) => id.length === 36)).toBe(true);

        // ردیفی که استعلام دیگری قفل کرده: busy.
        const deps = { store, gateways: { mock: mockGateway() }, now: () => NOW };
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let locked!: () => void;
        const isLocked = new Promise<void>((resolve) => (locked = resolve));
        const holder = conn.db.transaction(async (tx) => {
          await tx.select().from(refunds).where(eq(refunds.id, due)).for('update');
          locked();
          await held;
        });
        await isLocked;
        expect(await inquireRefund(deps, due, { via: 'auto', skipLocked: true })).toBe('busy');
        release();
        await holder;
        expect(await inquirePendingRefunds(deps)).toEqual({ checked: 1, closed: 1 });
        expect(await refundOf(due)).toMatchObject({ status: 'succeeded', settledVia: 'auto' });
      });

      it('جزئیات پنل و پیشخوان: بازپرداخت‌ها با نام ادمین؛ «لغوشده، پول برنگشته» و «در حال برگشت» با «معلوم نیست»', async () => {
        await clearOrders(conn);
        const store = createRefundStore(conn);
        const panel = createPanelOrderStore(conn);
        const clock: PanelClock = {
          at: NOW,
          staleBefore: NOW,
          unreturnedBefore: NOW,
          untrackedSince: new Date(NOW.getTime() - 45 * DAY),
        };
        // b زودتر لغو شد: قدیمی‌ترین لغو اول، نه کوچک‌ترین شماره.
        const a = await cancelledOrder();
        const b = await cancelledOrder(PAID_RAW, null, new Date(NOW.getTime() - MINUTE));
        // سفارش لغوشدهٔ بی پرداخت موفق هشدار ندارد: پرداخت آن در درگاه موفق شده بود؛ اینجا همان سفارش را بی پرداخت نمی‌شود ساخت، پس
        // شمار فقط همین دو.
        let alerts = await panel.alerts(ALL_ORDERS, clock);
        expect(alerts.unrefunded).toEqual([
          { orderNumber: b.order.orderNumber, cancelledAt: new Date(NOW.getTime() - MINUTE) },
          { orderNumber: a.order.orderNumber, cancelledAt: NOW },
        ]);
        expect(alerts.refunding).toEqual([]);

        const made = await store.start(ALL_ORDERS, startInput(a.order, a.payment.id, { method: 'gateway' }));
        const id = made.ok ? made.refund.id : '';
        await requestRefund({ store, gateways: { mock: mockGateway() }, now: () => NOW }, { refund: made.ok ? made.refund : (null as never), payment: a.payment, description: 'x' });
        await store.start(ALL_ORDERS, startInput(b.order, b.payment.id, { method: 'gateway' }));
        alerts = await panel.alerts(ALL_ORDERS, clock);
        expect(alerts.unrefunded).toEqual([]);
        expect(alerts.refunding).toEqual([
          { orderNumber: a.order.orderNumber, createdAt: NOW, unknown: false },
          { orderNumber: b.order.orderNumber, createdAt: NOW, unknown: true },
        ].sort((x, y) => x.orderNumber - y.orderNumber));
        // محدودهٔ چاپخانهٔ دیگر هیچ.
        const partner = await panel.alerts({ kind: 'partner', partnerId: randomUUID() }, clock);
        expect(partner.unrefunded).toEqual([]);
        expect(partner.refunding).toEqual([]);

        const details = await panel.details(ALL_ORDERS, a.order.orderNumber);
        expect(details!.refunds).toMatchObject([{ id, adminName: 'سارا رضایی', status: 'pending', gatewayStatus: 16 }]);
        // مشتری: همان ردیف‌ها، تازه‌ترین اول.
        const customer = await createOrderStore(conn).details(a.order.publicToken);
        expect(customer!.refunds.map((row) => row.id)).toEqual([id]);
      });
    });

    // یادداشت داخلی (برش ۹٫۳، ADR-058): محافظ‌ها، شناسهٔ فرم، رویداد و محدودهٔ چاپخانه.
    describe('یادداشت داخلی سفارش (برش ۹٫۳)', () => {
      /** یادداشت متصدی از فرمی تازه، با رویدادش، همان‌طور که سرویس پنل می‌سازد. */
      function noteInput(order: { id: string; orderNumber: number }, over: Partial<PanelNoteInput> = {}): PanelNoteInput {
        const at = over.at ?? NOW;
        const adminUserId = over.adminUserId ?? operator;
        const partnerVisible = over.partnerVisible ?? false;
        return {
          orderId: order.id,
          adminUserId,
          body: 'اسم استاد روی جلد نیاید',
          partnerVisible,
          requestId: randomUUID(),
          at,
          event: {
            adminUserId,
            action: 'orders.note',
            targetType: 'order',
            targetId: order.id,
            ipHash: 'ip',
            detail: { orderNumber: order.orderNumber, partnerVisible },
            at,
          },
          ...over,
        };
      }
      const notesOf = (id: string) => conn.db.select().from(orderNotes).where(eq(orderNotes.orderId, id)).orderBy(orderNotes.id);
      const noteEvents = async (id: string) => (await eventsOf(id)).filter((event) => event.action === 'orders.note');

      it('محافظ‌ها: متن ۱ تا ۱٬۰۰۰ نویسه بی فاصله و خط تازه در لبه، یک یادداشت برای هر فرم، و عوض و پاک نمی‌شود جز با خود سفارش', async () => {
        const order = await paidOrder();
        const row = (body: string) => ({ orderId: order.id, adminUserId: owner, body, partnerVisible: false, requestId: randomUUID() });
        const insert = (body: string) => rejectedConstraint(conn.db.insert(orderNotes).values(row(body)));
        expect(await insert('')).toBe('order_notes_body');
        expect(await insert(' \n ')).toBe('order_notes_body');
        expect(await insert('\nاسم استاد روی جلد نیاید')).toBe('order_notes_body');
        expect(await insert('اسم استاد روی جلد نیاید ')).toBe('order_notes_body');
        expect(await insert('ی'.repeat(1001))).toBe('order_notes_body');
        expect(await insert('ی'.repeat(1000))).toBeUndefined();
        expect(await insert('جلد اول\nجلد دوم جدا')).toBeUndefined();
        const [first, second] = await notesOf(order.id);
        expect(second!.body).toBe('جلد اول\nجلد دوم جدا');
        // همان فرم دو بار (`request_id`).
        expect(await rejectedConstraint(conn.db.insert(orderNotes).values({ ...row('دوباره'), requestId: first!.requestId }))).toBe('order_notes_request');
        const byId = eq(orderNotes.id, first!.id);
        expect(await rejectedConstraint(conn.db.update(orderNotes).set({ body: 'عوض شد' }).where(byId))).toBe('order_notes_append_only');
        expect(await rejectedConstraint(conn.db.update(orderNotes).set({ partnerVisible: true }).where(byId))).toBe('order_notes_append_only');
        expect(await rejectedConstraint(conn.db.delete(orderNotes).where(byId))).toBe('order_notes_append_only');
        expect(await notesOf(order.id)).toHaveLength(2);
        // پاک شدن خود سفارش (فقط تست‌ها؛ پرداخت cascade ندارد) یادداشت‌هایش را هم می‌برد.
        await conn.db.delete(payments).where(eq(payments.orderId, order.id));
        await conn.db.delete(orders).where(eq(orders.id, order.id));
        expect(await notesOf(order.id)).toEqual([]);
      });

      it('یادداشت با رویدادش در یک تراکنش؛ همان فرم دو بار یک یادداشت است، هم‌زمان هم، و با متن دیگر هیچ', async () => {
        const order = await paidOrder();
        const panel = createPanelOrderStore(conn);
        const input = noteInput(order, { body: 'جلد دوم را جدا ببند', partnerVisible: true });
        const written = await panel.addNote(ALL_ORDERS, input);
        expect(written).toMatchObject({ ok: true, duplicate: false });
        const [note] = await notesOf(order.id);
        expect(note).toMatchObject({ adminUserId: operator, body: 'جلد دوم را جدا ببند', partnerVisible: true, requestId: input.requestId });
        expect(note!.createdAt).toEqual(NOW);
        const [event] = await noteEvents(order.id);
        expect(event).toMatchObject({ adminUserId: operator, detail: { orderNumber: order.orderNumber, partnerVisible: true, note: note!.id } });
        expect(JSON.stringify(event!.detail)).not.toContain('جلد');

        // دو کلیک: همان یادداشت، بی ردیف و رویداد دوم.
        expect(await panel.addNote(ALL_ORDERS, input)).toEqual({ ok: true, noteId: note!.id, duplicate: true });
        // شناسهٔ همان فرم با متن دیگر، تیک دیگر، ادمین دیگر یا سفارش دیگر: هیچ.
        const other = await paidOrder(END_MONDAY, 'مریم کاظمی');
        expect(await panel.addNote(ALL_ORDERS, { ...input, body: 'متن دیگر' })).toEqual({ ok: false, reason: 'conflict' });
        expect(await panel.addNote(ALL_ORDERS, { ...input, partnerVisible: false })).toEqual({ ok: false, reason: 'conflict' });
        expect(await panel.addNote(ALL_ORDERS, { ...input, adminUserId: owner })).toEqual({ ok: false, reason: 'conflict' });
        expect(await panel.addNote(ALL_ORDERS, { ...noteInput(other), requestId: input.requestId, body: input.body, partnerVisible: true })).toEqual({
          ok: false,
          reason: 'conflict',
        });
        expect(await notesOf(order.id)).toHaveLength(1);
        expect(await notesOf(other.id)).toEqual([]);
        expect(await noteEvents(order.id)).toHaveLength(1);
        expect(await noteEvents(other.id)).toEqual([]);

        // دو فرستادن هم‌زمان یک فرم: دومی پشت شاخص یکتا می‌ماند و همان اولی را می‌بیند.
        const again = noteInput(order, { body: 'دو کلیک هم‌زمان' });
        const both = await Promise.all([panel.addNote(ALL_ORDERS, again), panel.addNote(ALL_ORDERS, again)]);
        expect(both.map((result) => result.ok && result.duplicate).sort()).toEqual([false, true]);
        expect((await notesOf(order.id)).map((row) => row.body)).toEqual(['جلد دوم را جدا ببند', 'دو کلیک هم‌زمان']);
        expect(await noteEvents(order.id)).toHaveLength(2);
      });

      it('چاپخانه فقط «چاپخانه هم ببیند» را می‌بیند، در جزئیات و مشخصات فهرست؛ سفارش دیگران نه، و یادداشت رویش هم نه', async () => {
        const order = await paidOrder();
        const panel = createPanelOrderStore(conn);
        const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);
        await panel.addNote(ALL_ORDERS, noteInput(order, { body: 'مشتری زنگ زد؛ فقط داخلی', at: later(1) }));
        await panel.addNote(ALL_ORDERS, noteInput(order, { body: 'اسم استاد روی جلد نیاید', partnerVisible: true, adminUserId: owner, at: later(2) }));
        const own: PanelScope = { kind: 'partner', partnerId: order.printPartnerId! };
        const stranger: PanelScope = { kind: 'partner', partnerId: randomUUID() };

        const all = await panel.details(ALL_ORDERS, order.orderNumber);
        expect(all!.notes.map(({ body, partnerVisible, adminName }) => ({ body, partnerVisible, adminName }))).toEqual([
          { body: 'مشتری زنگ زد؛ فقط داخلی', partnerVisible: false, adminName: 'علی محمدی' },
          { body: 'اسم استاد روی جلد نیاید', partnerVisible: true, adminName: 'سارا رضایی' },
        ]);
        expect(all!.notes.map((note) => note.at)).toEqual([later(1), later(2)]);
        const partner = await panel.details(own, order.orderNumber);
        expect(partner!.notes.map((note) => note.body)).toEqual(['اسم استاد روی جلد نیاید']);

        const specs = await panel.specs(ALL_ORDERS, [order.id]);
        expect(specs.get(order.id)!.notes).toEqual(all!.notes);
        const partnerSpecs = await panel.specs(own, [order.id]);
        expect(partnerSpecs.get(order.id)!.notes).toEqual(partner!.notes);
        expect((await panel.specs(stranger, [order.id])).size).toBe(0);

        // سفارشی بیرون از محدوده «نیست»، حتی برای نوشتن.
        expect(await panel.addNote(stranger, noteInput(order))).toEqual({ ok: false, reason: 'not_found' });
        expect(await notesOf(order.id)).toHaveLength(2);
      });
    });
  });

  // فایل چاپ، برگه و نگهداری (برش ۵٫۱، ADR-043 و ADR-044): محافظ‌ها، اثر انگشت برگه، و ذخیره‌گاه پنل. ساختن فایل‌ها و پاک
  // کردنشان کار کارگر است و روی همین پستگرس در `services/docworker/tests` سنجیده می‌شود.
  describe('فایل چاپ، برگه و نگهداری روی پستگرس (برش ۵٫۱)', () => {
    const NOW = new Date('2026-10-05T07:50:00Z');
    const MINUTE = 60_000;
    const DAY = 86_400_000;
    const END_MONDAY = new Date('2026-10-06T00:00:00+03:30');
    const SHA = 'a'.repeat(64);
    let admin = '';
    /** سند آماده به‌ازای شمار صفحه. */
    const docOf: Record<number, string> = {};

    /** سفارش پرداخت‌شده همان‌طور که سرور می‌سازد؛ ریز قیمت از همان `quote()`، پس ۱۶۵۰ صفحهٔ دورو دو جلد است. */
    async function paidOrder(pages: number, name = 'مریم کاظمی') {
      const sections = [{ documentId: docOf[pages]!, pageCount: pages }];
      const rules = [{ pageRanges: [[1, pages]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const breakdown = quote(
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'tehran' } },
        SEED_PRICE_LIST,
      );
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: '09152345678' })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const store = createOrderStore(conn);
      const { order } = await store.createOrder({
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: null,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: 'tehran',
        provinceId: 8,
        cityId: 394,
        recipientName: name,
        recipientPhone: '09152345678',
        addressText: 'بلوار سجاد، سجاد 18، پلاک 42',
        postalCode: null,
        items: [{ pageCount: pages, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      const payment = await store.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      await store.settlePayment('mock', payment.authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt: NOW,
        postHandoffDueAt: END_MONDAY,
      }));
      const [item] = await conn.db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      return { id: order.id, orderNumber: order.orderNumber, itemId: item!.id };
    }

    const volume = (itemId: string, n: number, first: number, last: number, over: Partial<typeof orderPrintFiles.$inferInsert> = {}) => ({
      orderItemId: itemId,
      volume: n,
      firstPage: first,
      lastPage: last,
      storageKey: `orders/10001/print-1-${n}.pdf`,
      sizeBytes: 1_000,
      sha256: SHA,
      ...over,
    });
    /** همهٔ جلدهای یک جزوه در یک تراکنش، مثل کارگر؛ محافظ پوشش در COMMIT. */
    const writeVolumes = (rows: (typeof orderPrintFiles.$inferInsert)[]) =>
      rejectedConstraint(conn.db.transaction(async (tx) => void (await tx.insert(orderPrintFiles).values(rows))));
    const move = (id: string, set: Partial<typeof orders.$inferInsert>) =>
      rejectedConstraint(conn.db.update(orders).set(set).where(eq(orders.id, id)));
    const stampOf = async (id: string) =>
      (await conn.db.execute<{ stamp: string }>(sql`SELECT order_ticket_stamp(o) AS stamp FROM orders o WHERE o.id = ${id}`))[0]!.stamp;
    const ticketJobOf = async (id: string) =>
      (await conn.db.select().from(jobs).where(and(eq(jobs.orderId, id), eq(jobs.kind, PREPARE_TICKET_JOB))))[0];
    /** برگه همان‌طور که کارگر می‌نویسد: اثر انگشت دادهٔ همان لحظه، و کار تمام. */
    async function builtTicket(id: string) {
      await conn.db.execute(sql`
        INSERT INTO order_tickets (order_id, storage_key, size_bytes, sha256, preview_key, stamp)
        SELECT o.id, 'orders/' || o.order_number || '/ticket.pdf', 2400, ${'b'.repeat(64)},
               'orders/' || o.order_number || '/ticket.png', order_ticket_stamp(o)
          FROM orders o WHERE o.id = ${id}
        ON CONFLICT (order_id) DO UPDATE SET stamp = excluded.stamp, built_at = now()`);
      await conn.db
        .update(jobs)
        .set({ status: 'done', finishedAt: NOW })
        .where(and(eq(jobs.orderId, id), eq(jobs.kind, PREPARE_TICKET_JOB)));
    }
    const recipientEvent = (id: string): AdminEventInput => ({ adminUserId: admin, action: 'orders.recipient', targetType: 'order', targetId: id, at: NOW });
    const edit = (id: string, recipient: { recipientName: string; addressText: string; postalCode: string | null }) =>
      createPanelOrderStore(conn).editRecipient(ALL_ORDERS, { orderId: id, editable: ['paid', 'printing'], recipient, event: recipientEvent(id) });

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const created = await createAdminStore(conn).createInvite({
        inviteId: randomUUID(),
        newUserId: randomUUID(),
        username: 'sara',
        displayName: 'سارا رضایی',
        role: 'owner',
        tokenHash: randomUUID().replace(/-/g, '').repeat(2),
        totpSealed: 'v1.sealed',
        at: NOW,
        expiresAt: new Date(NOW.getTime() + 15 * MINUTE),
        createdBy: null,
        allowExisting: false,
        event: { adminUserId: null, action: 'admins.invite', targetType: 'admin' },
      });
      admin = created.ok ? created.userId : '';
      const store = createDocumentStore(conn);
      for (const pages of [20, 1650]) {
        const id = randomUUID();
        await store.insertUpload({
          id,
          sessionHash: 'e'.repeat(64),
          originalName: `آمار ${pages}.pdf`,
          sourceKind: 'pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1_000,
          storageKey: `uploads/${id}.pdf`,
          uploadId: 'u',
          partSizeBytes: 8 * 1024 * 1024,
        });
        await store.markUploaded(id, NOW, new Date(NOW.getTime() + 2 * DAY), null);
        await conn.db.update(documents).set({ status: 'ready', pageCount: pages }).where(eq(documents.id, id));
        docOf[pages] = id;
      }
    });

    beforeEach(async () => {
      await clearOrders(conn);
    });

    afterAll(async () => {
      await clearOrders(conn);
    });

    it('جلدها صفحه‌های ۱ تا آخر را پشت‌سرهم و دقیقاً به شمار ریز قیمت می‌پوشانند؛ فایل ثبت‌شده عوض نمی‌شود', async () => {
      // ۱۶۵۰ صفحهٔ دورو = ۸۲۵ برگ؛ سقف جلد ۸۰۰، پس دو جلد ۴۱۳ و ۴۱۲ برگی: صفحهٔ ۱ تا ۸۲۶ و ۸۲۷ تا ۱۶۵۰ (ADR-043). صریح.
      const big = await paidOrder(1650);
      const breakdown = (await conn.db.select().from(orders).where(eq(orders.id, big.id)))[0]!.priceBreakdown as Breakdown;
      expect(breakdown.items[0]).toMatchObject({ sheets: 825, volumes: 2, sheetsPerVolume: [413, 412] });
      // یک جلد از دو، شکاف، همپوشانی، کوتاه، و شمارهٔ جلد جاافتاده: هیچ‌کدام.
      expect(await writeVolumes([volume(big.itemId, 1, 1, 826)])).toBe('order_print_files_cover');
      expect(await writeVolumes([volume(big.itemId, 1, 1, 826), volume(big.itemId, 2, 828, 1650)])).toBe('order_print_files_cover');
      expect(await writeVolumes([volume(big.itemId, 1, 1, 826), volume(big.itemId, 2, 826, 1650)])).toBe('order_print_files_cover');
      expect(await writeVolumes([volume(big.itemId, 1, 1, 826), volume(big.itemId, 2, 827, 1649)])).toBe('order_print_files_cover');
      expect(await writeVolumes([volume(big.itemId, 1, 1, 826), volume(big.itemId, 3, 827, 1650)])).toBe('order_print_files_cover');
      expect(await writeVolumes([volume(big.itemId, 1, 1, 1650)])).toBe('order_print_files_cover');
      // شکل هر ردیف: صفحهٔ صفر، بازهٔ وارونه، کلید بیرون از `orders/`، و sha256 نادرست.
      expect(await writeVolumes([volume(big.itemId, 1, 0, 826), volume(big.itemId, 2, 827, 1650)])).toBe('order_print_files_pages');
      expect(await writeVolumes([volume(big.itemId, 1, 826, 1), volume(big.itemId, 2, 827, 1650)])).toBe('order_print_files_pages');
      expect(
        await writeVolumes([volume(big.itemId, 1, 1, 826, { storageKey: 'uploads/x.pdf' }), volume(big.itemId, 2, 827, 1650)]),
      ).toBe('order_print_files_file');
      expect(await writeVolumes([volume(big.itemId, 1, 1, 826, { sha256: 'A'.repeat(64) }), volume(big.itemId, 2, 827, 1650)])).toBe(
        'order_print_files_file',
      );
      expect(await conn.db.select().from(orderPrintFiles)).toEqual([]);
      // شاهد: همان دو جلد درست، با هم.
      expect(await writeVolumes([volume(big.itemId, 1, 1, 826), volume(big.itemId, 2, 827, 1650)])).toBeUndefined();
      expect(
        await rejectedConstraint(conn.db.update(orderPrintFiles).set({ sizeBytes: 2_000 }).where(eq(orderPrintFiles.orderItemId, big.itemId))),
      ).toBe('order_print_files_frozen');
      // پاک کردن یک جلد پوشش را می‌شکند.
      expect(
        await rejectedConstraint(
          conn.db.delete(orderPrintFiles).where(and(eq(orderPrintFiles.orderItemId, big.itemId), eq(orderPrintFiles.volume, 2))),
        ),
      ).toBe('order_print_files_cover');

      // جزوهٔ یک‌جلدی: فایل چاپش همان PDF جزوه است، با همان کلید.
      const small = await paidOrder(20);
      expect(
        await writeVolumes([volume(small.itemId, 1, 1, 20, { storageKey: `orders/${small.orderNumber}/jozve-1.pdf`, changes: null })]),
      ).toBeUndefined();
      // سفارش با فایل‌هایش پاک می‌شود (cascade)، و محافظ معوق قلمِ رفته را نمی‌سنجد.
      await clearOrders(conn);
      expect(await conn.db.select().from(orderPrintFiles)).toEqual([]);
    });

    it('فایل‌ها فقط از سفارش بسته و یک بار پاک می‌شوند؛ پس از آن وضعیت برنمی‌گردد', async () => {
      const open = await paidOrder(20);
      expect(await move(open.id, { filesDeletedAt: NOW })).toBe('orders_files_deleted_closed');
      expect(await move(open.id, { status: 'printing' })).toBeUndefined();
      expect(await move(open.id, { filesDeletedAt: NOW })).toBe('orders_files_deleted_closed');
      expect(await move(open.id, { status: 'handed_to_post', handedToPostAt: NOW })).toBeUndefined();
      // شاهد: رسیده به پست پاک می‌شود.
      expect(await move(open.id, { filesDeletedAt: NOW })).toBeUndefined();
      expect(await move(open.id, { filesDeletedAt: new Date(NOW.getTime() + DAY) })).toBe('orders_files_deleted');
      expect(await move(open.id, { filesDeletedAt: null })).toBe('orders_files_deleted');
      expect(await move(open.id, { status: 'printing', handedToPostAt: null })).toBe('orders_files_deleted');
      // شاهد: سفارش دیگری که فایلش هست یک قدم برمی‌گردد.
      const kept = await paidOrder(20);
      await move(kept.id, { status: 'printing' });
      await move(kept.id, { status: 'handed_to_post', handedToPostAt: NOW });
      expect(await move(kept.id, { status: 'printing', handedToPostAt: null })).toBeUndefined();

      // لغوشده هم؛ برگرداندنش به صف چاپ نه.
      const cancelled = await paidOrder(20);
      expect(await move(cancelled.id, { status: 'cancelled' })).toBeUndefined();
      expect(await move(cancelled.id, { filesDeletedAt: NOW })).toBeUndefined();
      expect(await move(cancelled.id, { status: 'paid' })).toBe('orders_files_deleted');

      // ذخیره‌گاه پنل: همان شرط، بی خطا؛ «پاک شد» را می‌گوید، نه «وضعیت عوض شد».
      const panel = createPanelOrderStore(conn);
      const change: PanelStatusChange = {
        orderId: cancelled.id,
        from: 'cancelled',
        to: 'paid',
        at: NOW,
        adminUserId: admin,
        note: { reason: 'مشتری پشیمان شد' },
        event: { adminUserId: admin, action: 'orders.status', targetType: 'order', targetId: cancelled.id, at: NOW },
      };
      expect(await panel.changeStatus(ALL_ORDERS, change)).toEqual({ ok: false, current: 'cancelled', filesDeleted: true });
      expect((await conn.db.select().from(orders).where(eq(orders.id, cancelled.id)))[0]!.status).toBe('cancelled');
      // شاهد: وضعیتی که دیگر نیست «پاک شد» نیست.
      expect(await panel.changeStatus(ALL_ORDERS, { ...change, orderId: kept.id, from: 'handed_to_post', to: 'printing' })).toEqual({
        ok: false,
        current: 'printing',
      });
    });

    it('اثر انگشت برگه: نام، موبایل، نشانی و کد پستی؛ وضعیت نه', async () => {
      const order = await paidOrder(20);
      const first = await stampOf(order.id);
      expect(first).toMatch(/^[0-9a-f]{32}$/);
      // شاهد: وضعیت و زمان‌ها روی برگه نیستند.
      await move(order.id, { status: 'printing' });
      expect(await stampOf(order.id)).toBe(first);
      await move(order.id, { recipientName: 'مریم کاظمی‌نژاد' });
      const renamed = await stampOf(order.id);
      expect(renamed).not.toBe(first);
      await move(order.id, { addressText: 'بلوار سجاد، سجاد 20' });
      const moved = await stampOf(order.id);
      expect(moved).not.toBe(renamed);
      await move(order.id, { postalCode: '9187654321' });
      const coded = await stampOf(order.id);
      expect(coded).not.toBe(moved);
      await move(order.id, { recipientPhone: '09152345679' });
      expect(await stampOf(order.id)).not.toBe(coded);
      // مرز فیلدها مبهم نیست: «ab»+«c» همان «a»+«bc» نیست.
      await move(order.id, { recipientName: 'مریم', addressText: 'کاظمی بلوار سجاد' });
      const split1 = await stampOf(order.id);
      await move(order.id, { recipientName: 'مریم کاظمی', addressText: 'بلوار سجاد' });
      expect(await stampOf(order.id)).not.toBe(split1);
    });

    it('برگه در پنل: تازه فقط با دادهٔ امروز؛ ویرایش گیرنده کار برگه را در همان تراکنش دوباره در صف می‌گذارد', async () => {
      const panel = createPanelOrderStore(conn);
      const order = await paidOrder(20);
      expect(await panel.ticketFile(ALL_ORDERS, order.orderNumber)).toMatchObject({ key: null, previewKey: null, fresh: false, filesDeletedAt: null });
      expect((await panel.details(ALL_ORDERS, order.orderNumber))!.ticket).toBeNull();
      await builtTicket(order.id);
      expect((await panel.details(ALL_ORDERS, order.orderNumber))!).toMatchObject({
        ticket: { sizeBytes: 2400, fresh: true },
        ticketJob: { status: 'done' },
      });
      expect(await panel.ticketFile(ALL_ORDERS, order.orderNumber)).toMatchObject({
        orderId: order.id,
        status: 'paid',
        key: `orders/${order.orderNumber}/ticket.pdf`,
        previewKey: `orders/${order.orderNumber}/ticket.png`,
        bytes: 2400,
        fresh: true,
      });

      // بی تغییر: نه ویرایش، نه کار تازه (شاهد).
      const same = { recipientName: 'مریم کاظمی', addressText: 'بلوار سجاد، سجاد 18، پلاک 42', postalCode: null };
      expect(await edit(order.id, same)).toMatchObject({ ok: true, changed: [] });
      expect(await ticketJobOf(order.id)).toMatchObject({ status: 'done' });
      // نام تازه: برگهٔ ساخته‌شده کهنه است، و کارش در صف.
      expect(await edit(order.id, { ...same, recipientName: 'مریم کاظمی‌نژاد' })).toMatchObject({ ok: true, changed: ['recipientName'] });
      expect(await ticketJobOf(order.id)).toMatchObject({ status: 'queued', attempts: 0, finishedAt: null });
      expect((await panel.details(ALL_ORDERS, order.orderNumber))!.ticket).toMatchObject({ fresh: false });
      expect(await panel.ticketFile(ALL_ORDERS, order.orderNumber)).toMatchObject({ fresh: false });
      // کارگر با دادهٔ تازه ساخت: دوباره تازه.
      await builtTicket(order.id);
      expect(await panel.ticketFile(ALL_ORDERS, order.orderNumber)).toMatchObject({ fresh: true });

      // کار شکست‌خورده هم با ویرایش دوباره می‌رود؛ کاری که کارگر رویش است دست نمی‌خورد (کارگر پیش از ثبت اثر انگشت را زیر
      // قفل ردیف سفارش دوباره می‌سنجد).
      await conn.db.update(jobs).set({ status: 'failed', attempts: 3, lastError: 'font_missing: x' }).where(eq(jobs.id, (await ticketJobOf(order.id))!.id));
      await edit(order.id, { ...same, postalCode: '9187654321' });
      expect(await ticketJobOf(order.id)).toMatchObject({ status: 'queued', attempts: 0, lastError: null });
      await conn.db.update(jobs).set({ status: 'running', attempts: 1, lockedBy: 'w1' }).where(eq(jobs.id, (await ticketJobOf(order.id))!.id));
      await edit(order.id, { ...same, postalCode: '9187654322' });
      expect(await ticketJobOf(order.id)).toMatchObject({ status: 'running', attempts: 1, lockedBy: 'w1' });
    });

    it('دوباره بساز برگه: کاری که نبود تازه، تمام‌شده دوباره؛ در صف یا زیر دست کارگر نه', async () => {
      const panel = createPanelOrderStore(conn);
      const order = await paidOrder(20);
      const event: AdminEventInput = {
        adminUserId: admin,
        action: 'orders.ticket_rebuild',
        targetType: 'order',
        targetId: order.id,
        detail: { orderNumber: order.orderNumber },
        at: NOW,
      };
      expect(await panel.requeue(ALL_ORDERS, order.id, PREPARE_TICKET_JOB, event)).toBe('busy');
      // سفارش پیش از ۵٫۱ کار برگه نداشت.
      await conn.db.delete(jobs).where(and(eq(jobs.orderId, order.id), eq(jobs.kind, PREPARE_TICKET_JOB)));
      const [ok, second] = await Promise.all([
        panel.requeue(ALL_ORDERS, order.id, PREPARE_TICKET_JOB, event),
        panel.requeue(ALL_ORDERS, order.id, PREPARE_TICKET_JOB, event),
      ]);
      expect([ok, second].sort()).toEqual(['busy', 'ok']);
      expect(await ticketJobOf(order.id)).toMatchObject({ status: 'queued', attempts: 0 });
      await builtTicket(order.id);
      expect(await panel.requeue(ALL_ORDERS, order.id, PREPARE_TICKET_JOB, event)).toBe('ok');
      const events = await conn.db.select().from(adminEvents).where(eq(adminEvents.targetId, order.id)).orderBy(adminEvents.id);
      expect(events.map((e) => [e.action, (e.detail as { previous: unknown }).previous])).toEqual([
        ['orders.ticket_rebuild', null],
        ['orders.ticket_rebuild', { status: 'done', attempts: 0, error: null }],
      ]);
      // PDF جزوهٔ همان سفارش دست نخورد.
      expect((await panel.details(ALL_ORDERS, order.orderNumber))!.pdfJob).toMatchObject({ status: 'queued' });
    });

    it('فایل چاپ در پنل: جلدهای ساخته‌شده با «چه عوض شد»؛ جلد نساخته کلید ندارد؛ جزوه‌ای که نیست null', async () => {
      const panel = createPanelOrderStore(conn);
      const big = await paidOrder(1650);
      expect(await panel.printVolume(ALL_ORDERS, big.orderNumber, 1, 1)).toMatchObject({ itemSeq: 1, volume: 1, volumes: 0, key: null, bytes: null });
      expect(await panel.printVolume(ALL_ORDERS, big.orderNumber, 2, 1)).toBeNull();
      expect(await panel.printVolume(ALL_ORDERS, 1, 1, 1)).toBeNull();
      const changes = { resized: [[103, 120, 612, 792]], rotated: [[5, 9]] };
      await writeVolumes([
        volume(big.itemId, 1, 1, 826, { storageKey: `orders/${big.orderNumber}/print-1-1.pdf`, sizeBytes: 212_400_000, changes }),
        volume(big.itemId, 2, 827, 1650, { storageKey: `orders/${big.orderNumber}/print-1-2.pdf`, sizeBytes: 208_900_000 }),
      ]);
      expect(await panel.printVolume(ALL_ORDERS, big.orderNumber, 1, 2)).toMatchObject({
        orderId: big.id,
        status: 'paid',
        filesDeletedAt: null,
        volume: 2,
        volumes: 2,
        key: `orders/${big.orderNumber}/print-1-2.pdf`,
        bytes: 208_900_000,
      });
      expect(await panel.printVolume(ALL_ORDERS, big.orderNumber, 1, 3)).toMatchObject({ volumes: 2, key: null });
      const [item] = (await panel.details(ALL_ORDERS, big.orderNumber))!.items;
      expect(item!.printFiles).toEqual([
        expect.objectContaining({ volume: 1, firstPage: 1, lastPage: 826, sizeBytes: 212_400_000, changes }),
        expect.objectContaining({ volume: 2, firstPage: 827, lastPage: 1650, changes: null }),
      ]);
    });

    it('مشخصات فهرست جمع‌وجور (برش ۹٫۱): همان جزوه، فایل چاپ، برگه و کارهای details برای چند سفارش با یک فراخوانی', async () => {
      const panel = createPanelOrderStore(conn);
      const small = await paidOrder(20);
      const big = await paidOrder(1650, 'امیر حسینی');
      await builtTicket(small.id);
      await writeVolumes([volume(small.itemId, 1, 1, 20, { storageKey: `orders/${small.orderNumber}/print-1-1.pdf`, sizeBytes: 9_000 })]);
      // سفارشی که نیست در نقشه نمی‌آید؛ فهرست خالی بی کوئری.
      const specs = await panel.specs(ALL_ORDERS, [small.id, big.id, randomUUID()]);
      expect([...specs.keys()].sort()).toEqual([small.id, big.id].sort());
      expect(await panel.specs(ALL_ORDERS, [])).toEqual(new Map());
      for (const o of [small, big]) {
        const details = (await panel.details(ALL_ORDERS, o.orderNumber))!;
        expect(specs.get(o.id)).toEqual({
          order: details.order,
          items: details.items,
          pdfJob: details.pdfJob,
          ticketJob: details.ticketJob,
          ticket: details.ticket,
          lastAssignmentAt: details.assignments.at(-1)?.at ?? null,
          lastRecipientEditAt: null,
          // یادداشت‌ها (۹٫۳)، همان `details`؛ با یادداشت در «یادداشت داخلی سفارش (برش ۹٫۳)».
          notes: details.notes,
        });
      }
      expect(specs.get(small.id)).toMatchObject({
        ticket: { storageKey: `orders/${small.orderNumber}/ticket.pdf`, sizeBytes: 2400, fresh: true },
        items: [{ seq: 1, printFiles: [{ volume: 1, storageKey: `orders/${small.orderNumber}/print-1-1.pdf`, sizeBytes: 9_000 }] }],
      });
      expect(specs.get(big.id)).toMatchObject({ ticket: null, items: [{ printFiles: [], sections: [{ pageCount: 1650, originalName: 'آمار 1650.pdf' }] }] });
      // ویرایش گیرنده: زمان آخرینش، و برگهٔ کهنه.
      await edit(small.id, { recipientName: 'مریم کاظمی‌نژاد', addressText: 'بلوار سجاد، سجاد 18، پلاک 42', postalCode: null });
      expect((await panel.specs(ALL_ORDERS, [small.id])).get(small.id)).toMatchObject({ lastRecipientEditAt: NOW, ticket: { fresh: false } });
    });

    it('دادهٔ پایه نگهداری فایل‌ها را ۳۰ روز می‌نشاند', async () => {
      await conn.db.delete(settings).where(eq(settings.key, FILES_RETENTION_SETTING));
      const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(seeded.settingsInserted).toEqual([FILES_RETENTION_SETTING]);
      expect((await conn.db.select().from(settings).where(eq(settings.key, FILES_RETENTION_SETTING)))[0]!.value).toBe(30);
    });
  });
  // متن‌ها، مجوز، کد تازه و سنجش فایل در سرویس پنل با ذخیره‌گاه ساختگی (`apps/admin/lib/server/templates.test.ts`)؛ اینجا محافظ‌های
  // 0041، قفل و تراکنش، که فقط پستگرس معنایشان را دارد.
  describe('قالب برگه‌ها روی پستگرس (برش ۹٫۲)', () => {
    const NOW = new Date('2026-10-15T07:50:00Z');
    const MINUTE = 60_000;
    let admin = '';
    let doc = '';
    const actor = () => ({ adminUserId: admin, ipHash: null });
    const html = (text: string) => `<p>${text}</p>`;
    const shaOf = (text: string) => createHash('sha256').update(text).digest('hex');
    const templates = () => createTicketTemplateStore(conn);
    const upload = (kind: 'bijak' | 'first_page', text: string) =>
      templates().upload({ kind, html: html(text), sha256: shaOf(html(text)), fileName: `${kind}.html`, actor: actor(), at: NOW });
    /** نتیجهٔ پیش‌نمایش همان‌طور که کارگر می‌نویسد. */
    const previewed = (id: number, over: Partial<typeof ticketTemplates.$inferInsert> = {}) =>
      conn.db
        .update(ticketTemplates)
        .set({ previewAt: NOW, previewPages: 2, previewPdfKey: `ticket-templates/${id}/preview.pdf`, previewPngKey: `ticket-templates/${id}/preview.png`, ...over })
        .where(eq(ticketTemplates.id, id));
    const activeOf = async (kind: 'bijak' | 'first_page') =>
      (await conn.db.select().from(ticketTemplates).where(and(eq(ticketTemplates.kind, kind), eq(ticketTemplates.isActive, true))))[0]?.id ?? null;
    const insertRow = (over: Partial<typeof ticketTemplates.$inferInsert>) =>
      rejectedConstraint(
        conn.db.insert(ticketTemplates).values({ kind: 'bijak', version: 900, html: html('x'), sha256: shaOf('x'), fileName: 'x.html', createdBy: admin, ...over }),
      );
    const change = (id: number, set: Partial<typeof ticketTemplates.$inferInsert>) =>
      rejectedConstraint(conn.db.update(ticketTemplates).set(set).where(eq(ticketTemplates.id, id)));

    /** سفارش پرداخت‌شده همان‌طور که سرور می‌سازد، با کار برگه‌اش (`settlePayment`). */
    async function paidOrder() {
      const sections = [{ documentId: doc, pageCount: 20 }];
      const rules = [{ pageRanges: [[1, 20]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const item = { copies: 1, sidesMode: 'double' as const, paperSize: 'a4' as const, bindingTypeId: 'spiral_clear', sections, rules };
      const breakdown = quote({ items: [item], shipping: { methodId: 'post', zoneId: 'tehran' } }, SEED_PRICE_LIST);
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: '09152345678' })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const store = createOrderStore(conn);
      const { order } = await store.createOrder({
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: null,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: 'tehran',
        provinceId: 8,
        cityId: 394,
        recipientName: 'مریم کاظمی',
        recipientPhone: '09152345678',
        addressText: 'بلوار سجاد، سجاد 18، پلاک 42',
        postalCode: null,
        items: [{ pageCount: 20, ...item }],
      });
      const payment = await store.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      await store.settlePayment('mock', payment.authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt: NOW,
        postHandoffDueAt: new Date(NOW.getTime() + 2 * 86_400_000),
      }));
      return order.id;
    }
    const ticketJob = async (orderId: string) =>
      (await conn.db.select().from(jobs).where(and(eq(jobs.orderId, orderId), eq(jobs.kind, PREPARE_TICKET_JOB))))[0]!;
    const setTicketJob = (orderId: string, set: Partial<typeof jobs.$inferInsert>) =>
      conn.db.update(jobs).set(set).where(and(eq(jobs.orderId, orderId), eq(jobs.kind, PREPARE_TICKET_JOB)));
    const templateEvents = () =>
      conn.db.select().from(adminEvents).where(eq(adminEvents.targetType, TEMPLATE_TARGET)).orderBy(asc(adminEvents.id));

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const created = await createAdminStore(conn).createInvite({
        inviteId: randomUUID(),
        newUserId: randomUUID(),
        username: 'sara',
        displayName: 'سارا رضایی',
        role: 'owner',
        tokenHash: randomUUID().replace(/-/g, '').repeat(2),
        totpSealed: 'v1.sealed',
        at: NOW,
        expiresAt: new Date(NOW.getTime() + 15 * MINUTE),
        createdBy: null,
        allowExisting: false,
        event: { adminUserId: null, action: 'admins.invite', targetType: 'admin' },
      });
      admin = created.ok ? created.userId : '';
      doc = randomUUID();
      const documentStore = createDocumentStore(conn);
      await documentStore.insertUpload({
        id: doc,
        sessionHash: 'e'.repeat(64),
        originalName: 'آمار.pdf',
        sourceKind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_000,
        storageKey: `uploads/${doc}.pdf`,
        uploadId: 'u',
        partSizeBytes: 8 * 1024 * 1024,
      });
      await documentStore.markUploaded(doc, NOW, new Date(NOW.getTime() + 2 * 86_400_000), null);
      await conn.db.update(documents).set({ status: 'ready', pageCount: 20 }).where(eq(documents.id, doc));
    });

    beforeEach(async () => {
      await clearOrders(conn);
      // نسخه پاک‌نشدنی است (`ticket_templates_append_only`)؛ TRUNCATE تریگر ردیفی ندارد، و کارهای پیش‌نمایش و برگه‌ها را هم می‌برد.
      await conn.db.execute(sql`TRUNCATE ticket_templates, admin_events CASCADE`);
    });

    afterAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(sql`TRUNCATE ticket_templates CASCADE`);
    });

    it('نسخهٔ تازه غیرفعال و بی پیش‌نمایش؛ متن، نوع، شماره، سازنده و اولین فعال شدن منجمد؛ پاک‌نشدنی؛ یک فعال برای هر نوع', async () => {
      // نسخهٔ تازه با هر نشانی از فعال شدن یا پیش‌نمایش: نه (تریگر پیش از CHECK).
      expect(await insertRow({ isActive: true })).toBe('ticket_templates_activated');
      for (const over of [
        { isActive: true, activatedAt: NOW },
        { activatedAt: NOW },
        { previewAt: NOW },
        { previewOrderNumber: 10001 },
        { previewPages: 1 },
        { previewPdfKey: 'ticket-templates/1/preview.pdf' },
        { previewPngKey: 'ticket-templates/1/preview.png' },
        { previewError: 'bijak خط 1: x' },
        { previewBlocked: ['https://example.com/a.png'] },
      ]) {
        expect(await insertRow(over), JSON.stringify(over)).toBe('ticket_templates_insert_state');
      }
      // شکل: خالی و بزرگ‌تر از سقف، sha256، شماره و نام فایل.
      expect(await insertRow({ html: '' })).toBe('ticket_templates_size');
      expect(await insertRow({ html: 'x'.repeat(TICKET_TEMPLATE_MAX_BYTES + 1) })).toBe('ticket_templates_size');
      expect(await insertRow({ html: 'x'.repeat(TICKET_TEMPLATE_MAX_BYTES) })).toBeUndefined();
      expect(await insertRow({ version: 901, sha256: 'A'.repeat(64) })).toBe('ticket_templates_sha256');
      expect(await insertRow({ version: 0 })).toBe('ticket_templates_version_positive');
      expect(await insertRow({ version: 901, fileName: '' })).toBe('ticket_templates_file_name');
      expect(await insertRow({ version: 900 })).toBe('ticket_templates_version');

      const one = await upload('bijak', 'یک');
      const other = await upload('first_page', 'دو');
      for (const set of [
        { html: html('عوض') },
        { kind: 'first_page' as const },
        { version: 7 },
        { sha256: 'c'.repeat(64) },
        { fileName: 'other.html' },
        { createdBy: randomUUID() },
        { createdAt: new Date(NOW.getTime() + MINUTE) },
        // اولین فعال شدن فقط با فعال شدن.
        { activatedAt: NOW },
      ]) {
        expect(await change(one.id, set), JSON.stringify(set)).toBe('ticket_templates_frozen');
      }
      expect(await rejectedConstraint(conn.db.delete(ticketTemplates).where(eq(ticketTemplates.id, one.id)))).toBe('ticket_templates_append_only');

      // پیش‌نمایش: صفحه یا خطا، با زمانش؛ فایل‌ها با صفحه‌ها.
      expect(await change(one.id, { previewPages: 1, previewPdfKey: 'a.pdf', previewPngKey: 'a.png' })).toBe('ticket_templates_preview');
      expect(await change(one.id, { previewAt: NOW, previewPages: 1, previewPdfKey: 'a.pdf', previewPngKey: 'a.png', previewError: 'x' })).toBe('ticket_templates_preview');
      expect(await change(one.id, { previewAt: NOW })).toBe('ticket_templates_preview');
      expect(await change(one.id, { previewAt: NOW, previewPages: 1, previewPdfKey: 'a.pdf' })).toBe('ticket_templates_preview_files');
      expect(await change(one.id, { previewAt: NOW, previewPages: 1, previewPngKey: 'a.png' })).toBe('ticket_templates_preview_files');
      expect(await change(one.id, { previewAt: NOW, previewError: 'x', previewPngKey: 'a.png' })).toBe('ticket_templates_preview_files');
      expect(await change(one.id, { previewAt: NOW, previewError: 'x', previewPdfKey: 'a.pdf' })).toBe('ticket_templates_preview_files');
      expect(await change(one.id, { previewAt: NOW, previewPages: 0, previewPdfKey: 'a.pdf', previewPngKey: 'a.png' })).toBe('ticket_templates_preview_files');
      expect(await change(one.id, { previewAt: NOW, previewPages: 1, previewPdfKey: 'a.pdf', previewPngKey: 'a.png' })).toBeUndefined();

      // فعال: اولین فعال شدن یک بار، و یک فعال در هر نوع.
      expect(await change(one.id, { isActive: true })).toBe('ticket_templates_activated');
      expect(await change(one.id, { isActive: true, activatedAt: NOW })).toBeUndefined();
      expect(await change(one.id, { activatedAt: new Date(NOW.getTime() + MINUTE) })).toBe('ticket_templates_frozen');
      const two = await upload('bijak', 'سه');
      expect(await change(two.id, { isActive: true, activatedAt: NOW })).toBe('ticket_templates_one_active');
      expect(await change(other.id, { isActive: true, activatedAt: NOW })).toBeUndefined();
      expect(await change(one.id, { isActive: false })).toBeUndefined();
      expect(await change(one.id, { isActive: true })).toBeUndefined();

      // کار هر چیز یک هدف دارد؛ برگه با قالب بیجک بیجک است و با قالب برگهٔ اول برگهٔ اول.
      const orderId = await paidOrder();
      expect(
        await rejectedConstraint(conn.db.insert(jobs).values({ kind: PREVIEW_TICKET_TEMPLATE_JOB, ticketTemplateId: one.id, orderId })),
      ).toBe('jobs_one_target');
      const ticket = (over: Partial<typeof orderTickets.$inferInsert>) =>
        rejectedConstraint(
          conn.db
            .insert(orderTickets)
            .values({
              orderId,
              storageKey: 'orders/1/ticket.pdf',
              sizeBytes: 10,
              sha256: 'b'.repeat(64),
              previewKey: 'orders/1/ticket.png',
              stamp: 'd'.repeat(64),
              pageCount: 2,
              ...over,
            })
            .onConflictDoUpdate({ target: orderTickets.orderId, set: { bijakTemplateId: over.bijakTemplateId ?? null, firstPageTemplateId: over.firstPageTemplateId ?? null } }),
        );
      expect(await ticket({ bijakTemplateId: other.id })).toBe('order_tickets_template_kind');
      expect(await ticket({ firstPageTemplateId: one.id })).toBe('order_tickets_template_kind');
      expect(await ticket({ pageCount: 0 })).toBe('order_tickets_pages');
      expect(await ticket({ bijakTemplateId: one.id, firstPageTemplateId: other.id })).toBeUndefined();
      expect(await ticket({ bijakTemplateId: two.id, firstPageTemplateId: other.id })).toBeUndefined();
      expect(await ticket({ bijakTemplateId: other.id, firstPageTemplateId: other.id })).toBe('order_tickets_template_kind');
    });

    it('بارگذاری: شمارهٔ بعدی همان نوع، رویداد بی متن، و پیش‌نمایش ساختگی همان لحظه؛ دو بارگذاری هم‌زمان دو شماره', async () => {
      const first = await upload('bijak', 'یک');
      expect(first).toMatchObject({
        kind: 'bijak',
        version: 1,
        sha256: shaOf(html('یک')),
        fileName: 'bijak.html',
        sizeBytes: Buffer.byteLength(html('یک')),
        createdBy: 'سارا رضایی',
        isActive: false,
        activatedAt: null,
        preview: { job: 'busy', jobError: null, at: null, orderNumber: null, pages: null, pdfKey: null, pngKey: null, blocked: [], error: null },
      });
      // هم‌زمان: زیر یک قفل پشت‌سرهم، پس شماره‌های پشت‌سرهم، نه خطای ایندکس یکتای (نوع، شماره).
      const many = await Promise.all(Array.from({ length: 8 }, (_, i) => upload('bijak', `هم‌زمان ${i}`)));
      expect(many.map((v) => v.version).sort((x, y) => x - y)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
      expect((await upload('first_page', 'چهار')).version).toBe(1);
      const previewJobs = await conn.db.select().from(jobs).where(eq(jobs.kind, PREVIEW_TICKET_TEMPLATE_JOB));
      expect(previewJobs.map((job) => [job.ticketTemplateId, job.status, job.payload]).sort()).toEqual(
        (await templates().versions()).map((v) => [v.id, 'queued', {}]).sort(),
      );
      const [event] = await templateEvents();
      expect(event).toMatchObject({
        adminUserId: admin,
        action: 'settings.template_upload',
        targetType: 'ticket_template',
        targetId: String(first.id),
        detail: { kind: 'bijak', version: 1, fileName: 'bijak.html', bytes: Buffer.byteLength(html('یک')) },
      });
      expect(JSON.stringify(await templateEvents())).not.toContain('<p>');
      // تازه‌ترین اول در هر نوع.
      expect((await templates().versions()).map((v) => [v.kind, v.version])).toEqual([
        ...[9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ['bijak', n]),
        ['first_page', 1],
      ]);
      expect(await templates().source(first.id)).toEqual({ kind: 'bijak', version: 1, fileName: 'bijak.html', html: html('یک') });
      expect(await templates().source(first.id + 1000)).toBeNull();
    });

    it('پیش‌نمایش دوباره همان کار را با دادهٔ تازه دوباره در صف می‌گذارد؛ حال کار و نتیجه در فهرست', async () => {
      const one = await upload('first_page', 'یک');
      await conn.db
        .update(jobs)
        .set({ status: 'failed', attempts: 3, lastError: 'order_missing: 10999', finishedAt: NOW })
        .where(eq(jobs.ticketTemplateId, one.id));
      await previewed(one.id, { previewBlocked: ['https://example.com/a.png'] });
      const [listed] = await templates().versions();
      expect(listed!.preview).toEqual({
        job: 'failed',
        jobError: 'order_missing: 10999',
        at: NOW,
        orderNumber: null,
        pages: 2,
        pdfKey: `ticket-templates/${one.id}/preview.pdf`,
        pngKey: `ticket-templates/${one.id}/preview.png`,
        gone: false,
        blocked: ['https://example.com/a.png'],
        error: null,
      });
      const request = (id: number, orderNumber: number | null) => templates().requestPreview({ id, orderNumber, actor: actor(), at: NOW });
      expect(await request(one.id, 10001)).toBe('ok');
      const [job] = await conn.db.select().from(jobs).where(eq(jobs.ticketTemplateId, one.id));
      expect(job).toMatchObject({ status: 'queued', attempts: 0, lastError: null, finishedAt: null, payload: { orderNumber: 10001 } });
      expect((await templates().versions())[0]!.preview.job).toBe('busy');
      // در صف یا در دست کارگر: درخواست دوم نه، تا «انجام شد» کارگر آن را گم نکند.
      expect(await request(one.id, null)).toBe('busy');
      await conn.db.update(jobs).set({ status: 'running', lockedBy: 'worker-a' }).where(eq(jobs.ticketTemplateId, one.id));
      expect(await request(one.id, null)).toBe('busy');
      await conn.db.update(jobs).set({ status: 'done', lockedBy: null }).where(eq(jobs.ticketTemplateId, one.id));
      expect((await templates().versions())[0]!.preview.job).toBe('done');
      expect(await request(one.id, null)).toBe('ok');
      expect((await conn.db.select().from(jobs).where(eq(jobs.ticketTemplateId, one.id)))[0]!.payload).toEqual({});
      expect(await conn.db.select().from(jobs).where(eq(jobs.ticketTemplateId, one.id))).toHaveLength(1);
      expect(await request(one.id + 1000, null)).toBe('not_found');
      // کاری که نبود، تازه.
      await conn.db.delete(jobs).where(eq(jobs.ticketTemplateId, one.id));
      expect(await request(one.id, 10001)).toBe('ok');
      expect((await conn.db.select().from(jobs).where(eq(jobs.ticketTemplateId, one.id)))[0]).toMatchObject({ status: 'queued', payload: { orderNumber: 10001 } });
      expect((await templateEvents()).filter((e) => e.action === 'settings.template_preview').map((e) => [e.targetId, e.detail])).toEqual([
        [String(one.id), { kind: 'first_page', version: 1, orderNumber: 10001 }],
        [String(one.id), { kind: 'first_page', version: 1, orderNumber: null }],
        [String(one.id), { kind: 'first_page', version: 1, orderNumber: 10001 }],
      ]);
      // سفارش پیش‌نمایش: وضعیت و پاک شدن فایل‌ها؛ نبود.
      const orderId = await paidOrder();
      const [{ orderNumber }] = (await conn.db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, orderId))) as [{ orderNumber: number }];
      expect(await templates().previewOrder(orderNumber)).toEqual({ status: 'paid', filesDeleted: false });
      expect(await templates().previewOrder(orderNumber + 1000)).toBeNull();
      // پیش‌نمایش با همین سفارش: تا فایل‌هایش هست «gone» نه؛ پس از پاک شدن آنها (`retention.py`) آری، و فقط برای همان سفارش.
      const other = await upload('first_page', 'نمونه');
      await previewed(one.id, { previewOrderNumber: orderNumber });
      await previewed(other.id);
      const goneOf = async (id: number) => (await templates().versions()).find((v) => v.id === id)!.preview;
      expect(await goneOf(one.id)).toMatchObject({ orderNumber, gone: false });
      await conn.db.update(orders).set({ status: 'printing' }).where(eq(orders.id, orderId));
      await conn.db.update(orders).set({ status: 'handed_to_post', handedToPostAt: NOW }).where(eq(orders.id, orderId));
      await conn.db.update(orders).set({ filesDeletedAt: NOW }).where(eq(orders.id, orderId));
      expect(await goneOf(one.id)).toMatchObject({ orderNumber, gone: true });
      expect(await goneOf(other.id)).toMatchObject({ orderNumber: null, gone: false });
      expect(await templates().previewOrder(orderNumber)).toEqual({ status: 'handed_to_post', filesDeleted: true });
    });

    it('فعال کردن: فقط با پیش‌نمایش درست و همان که دیده شد؛ قبلی خاموش؛ برگهٔ «در صف چاپ» از نو؛ رویداد؛ برگشت به پیش‌فرض', async () => {
      const v1 = await upload('bijak', 'یک');
      const v2 = await upload('bijak', 'دو');
      const fp = await upload('first_page', 'برگه');
      const seen = (sha: string, at: Date) => (row: { sha256: string; previewAt: Date }) => row.sha256 === sha && row.previewAt.getTime() === at.getTime();
      const activate = (id: number | null, expectedActive: number | null, verify = seen(shaOf(html(id === v2.id ? 'دو' : 'یک')), NOW), kind: 'bijak' | 'first_page' = 'bijak') =>
        templates().activate({ kind, id, expectedActive, verify, actor: actor(), at: NOW });

      // بی پیش‌نمایش، با پیش‌نمایش خطادار، نوع دیگر، شناسهٔ ناموجود، و دیده‌شده‌ای که دیگر نیست.
      expect(await activate(v1.id, null)).toEqual({ ok: false, reason: 'no_preview' });
      await previewed(v1.id, { previewPages: null, previewPdfKey: null, previewPngKey: null, previewError: 'bijak خط 3: x' });
      expect(await activate(v1.id, null)).toEqual({ ok: false, reason: 'no_preview' });
      await previewed(v1.id, { previewError: null });
      expect(await activate(fp.id, null)).toEqual({ ok: false, reason: 'not_found' });
      expect(await activate(v2.id + 1000, null)).toEqual({ ok: false, reason: 'not_found' });
      expect(await activate(v1.id, null, seen(shaOf(html('یک')), new Date(NOW.getTime() - MINUTE)))).toEqual({ ok: false, reason: 'changed' });
      expect(await activeOf('bijak')).toBeNull();

      // سفارش‌ها: «در صف چاپ» با برگهٔ ساخته یا شکست‌خورده از نو؛ در صف یا در دست کارگر همان؛ «در حال چاپ» نه.
      const done = await paidOrder();
      const failed = await paidOrder();
      const running = await paidOrder();
      const printing = await paidOrder();
      await setTicketJob(done, { status: 'done', attempts: 1, finishedAt: NOW });
      await setTicketJob(failed, { status: 'failed', attempts: 3, lastError: 'template_error: bijak خط 2: x', finishedAt: NOW });
      await setTicketJob(running, { status: 'running', attempts: 1, lockedBy: 'worker-a', lockedUntil: new Date(NOW.getTime() + 10 * MINUTE) });
      await conn.db.update(orders).set({ status: 'printing' }).where(eq(orders.id, printing));
      await setTicketJob(printing, { status: 'done', attempts: 1, finishedAt: NOW });
      expect(await templates().queuedOrders()).toBe(3);

      expect(await activate(v1.id, null)).toEqual({ ok: true, already: false, previous: null, requeued: 2 });
      expect(await activeOf('bijak')).toBe(v1.id);
      for (const id of [done, failed]) {
        expect(await ticketJob(id)).toMatchObject({ status: 'queued', attempts: 0, lastError: null, finishedAt: null, lockedBy: null });
      }
      expect(await ticketJob(running)).toMatchObject({ status: 'running', lockedBy: 'worker-a' });
      expect(await ticketJob(printing)).toMatchObject({ status: 'done' });
      const [activated] = await conn.db.select().from(ticketTemplates).where(eq(ticketTemplates.id, v1.id));
      expect(activated).toMatchObject({ isActive: true, activatedAt: NOW });

      // دوباره همان: «از پیش فعال»، بی رویداد. صفحه‌ای که پیش از فعال شدن دیده شد: «عوض شد».
      expect(await activate(v1.id, null)).toEqual({ ok: true, already: true, previous: 1, requeued: 0 });
      await previewed(v2.id);
      expect(await activate(v2.id, null)).toEqual({ ok: false, reason: 'changed' });
      expect(await activate(v2.id, v1.id, () => false)).toEqual({ ok: false, reason: 'changed' });
      expect(await activeOf('bijak')).toBe(v1.id);

      await setTicketJob(done, { status: 'done', finishedAt: NOW });
      const later = new Date(NOW.getTime() + 5 * MINUTE);
      expect(await templates().activate({ kind: 'bijak', id: v2.id, expectedActive: v1.id, verify: seen(shaOf(html('دو')), NOW), actor: actor(), at: later })).toEqual({
        ok: true,
        already: false,
        previous: 1,
        requeued: 1,
      });
      // برگشت به نسخهٔ قبل: اولین فعال شدنش همان می‌ماند.
      expect(await templates().activate({ kind: 'bijak', id: v1.id, expectedActive: v2.id, verify: seen(shaOf(html('یک')), NOW), actor: actor(), at: later })).toMatchObject({
        ok: true,
        previous: 2,
      });
      expect((await conn.db.select().from(ticketTemplates).where(eq(ticketTemplates.id, v1.id)))[0]).toMatchObject({ isActive: true, activatedAt: NOW });
      expect((await conn.db.select().from(ticketTemplates).where(eq(ticketTemplates.id, v2.id)))[0]).toMatchObject({ isActive: false, activatedAt: later });

      // برگشت به پیش‌فرض: بی نسخهٔ فعال؛ بار دوم «از پیش».
      expect(await templates().activate({ kind: 'bijak', id: null, expectedActive: v2.id, verify: () => true, actor: actor(), at: later })).toEqual({
        ok: false,
        reason: 'changed',
      });
      expect(await templates().activate({ kind: 'bijak', id: null, expectedActive: v1.id, verify: () => false, actor: actor(), at: later })).toMatchObject({
        ok: true,
        already: false,
        previous: 1,
      });
      expect(await activeOf('bijak')).toBeNull();
      expect(await templates().activate({ kind: 'bijak', id: null, expectedActive: v1.id, verify: () => true, actor: actor(), at: later })).toEqual({
        ok: true,
        already: true,
        previous: null,
        requeued: 0,
      });
      expect((await templateEvents()).filter((e) => e.action !== 'settings.template_upload').map((e) => [e.action, e.targetId, e.detail])).toEqual([
        ['settings.template_activate', String(v1.id), { kind: 'bijak', from: null, to: 1, requeued: 2 }],
        ['settings.template_activate', String(v2.id), { kind: 'bijak', from: 1, to: 2, requeued: 1 }],
        ['settings.template_activate', String(v1.id), { kind: 'bijak', from: 2, to: 1, requeued: 0 }],
        ['settings.template_default', 'bijak', { kind: 'bijak', from: 1, to: null, requeued: 0 }],
      ]);
    });

    it('دو فعال کردن هم‌زمان از یک صفحه: یکی فعال می‌شود و دیگری «عوض شد»، نه خطای ایندکس یکتا', async () => {
      const a = await upload('first_page', 'یک');
      const b = await upload('first_page', 'دو');
      await previewed(a.id);
      await previewed(b.id);
      const results = await Promise.all(
        [a, b].map((v) => templates().activate({ kind: 'first_page', id: v.id, expectedActive: null, verify: () => true, actor: actor(), at: NOW })),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'changed' }]);
      expect(await activeOf('first_page')).toBe(results[0]!.ok ? a.id : b.id);
    });
  });
  // در همین فایل، به همان دلیل «سند و آپلود». متن‌ها، مجوز و سنجش فرم در سرویس‌های پنل با ذخیره‌گاه ساختگی
  // (`apps/admin/lib/server/*.test.ts`)؛ اینجا همان که فقط پستگرس معنایش را دارد: محافظ‌ها، قفل، تراکنش و هم‌زمانی.
  describe('چاپخانه‌ها و تخصیص روی پستگرس (برش ۵٫۲)', () => {
    const NOW = new Date('2026-10-05T07:50:00Z');
    const MINUTE = 60_000;
    const DAY = 86_400_000;
    const END_MONDAY = new Date('2026-10-06T00:00:00+03:30');
    const TEHRAN = { provinceId: 8, cityId: 394 };
    const MASHHAD = { provinceId: 11, cityId: 1326 };
    const NEYSHABUR = { provinceId: 11, cityId: 1447 };
    const SHIRAZ = { provinceId: 17, cityId: 911 };
    const ISFAHAN = { provinceId: 4, cityId: 122 };
    let admin = '';
    let docId = '';
    let first = '';

    const partnerId = async (name: string) =>
      (await conn.db.select({ id: printPartners.id }).from(printPartners).where(eq(printPartners.name, name)))[0]!.id;
    const partnerOf = async (orderId: string) =>
      (await conn.db.select({ id: orders.printPartnerId }).from(orders).where(eq(orders.id, orderId)))[0]!.id;
    const assignmentsOf = (orderId: string) =>
      conn.db.select().from(orderAssignments).where(eq(orderAssignments.orderId, orderId)).orderBy(orderAssignments.id);
    const stampOf = async (id: string) =>
      (await conn.db.execute<{ stamp: string }>(sql`SELECT order_ticket_stamp(o) AS stamp FROM orders o WHERE o.id = ${id}`))[0]!.stamp;
    const ticketJobOf = async (id: string) =>
      (await conn.db.select().from(jobs).where(and(eq(jobs.orderId, id), eq(jobs.kind, PREPARE_TICKET_JOB))))[0];
    const ticketDone = (id: string) =>
      conn.db.update(jobs).set({ status: 'done', finishedAt: NOW }).where(and(eq(jobs.orderId, id), eq(jobs.kind, PREPARE_TICKET_JOB)));

    /** چاپخانه با SQL، مثل فرم افزودن: فعال، نه پیش‌فرض؛ `createdAt` صریح، تا «قدیمی‌ترین» قطعی باشد. */
    async function partner(name: string, place: { provinceId: number; cityId: number }, over: Partial<typeof printPartners.$inferInsert> = {}) {
      const [row] = await conn.db
        .insert(printPartners)
        .values({ name, ...place, createdAt: new Date(NOW.getTime() - DAY), ...over })
        .returning();
      return row!.id;
    }

    /** همهٔ چاپخانه‌ها از صفر، با اولین چاپخانهٔ دادهٔ پایه. پاک نمی‌شوند، پس TRUNCATE (CASCADE سفارش‌ها را هم می‌برد). */
    async function resetPartners() {
      await clearOrders(conn);
      await conn.db.execute(sql`TRUNCATE print_partners CASCADE`);
      // رویداد فقط افزودنی است؛ هر تست رویدادهای خودش را می‌خواند.
      await conn.db.execute(sql`TRUNCATE admin_events`);
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      first = await partnerId('چاپخانهٔ جزوه‌یار');
    }

    /**
     * سفارش پرداخت‌شده همان‌طور که سرور می‌سازد: `createOrder`، و برگشت موفق درگاه که چاپخانه را هم انتخاب می‌کند. `settle: false`:
     * تلاش پرداختی که از درگاه برنگشت (سفارش در انتظار پرداخت، بی چاپخانه).
     */
    async function paidOrder(place: { provinceId: number; cityId: number | null }, name = 'مریم کاظمی', { settle = true } = {}) {
      const zoneId = place.provinceId === 8 ? 'tehran' : 'other';
      const sections = [{ documentId: docId, pageCount: 20 }];
      const rules = [{ pageRanges: [[1, 20]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const breakdown = quote(
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
        SEED_PRICE_LIST,
      );
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: '09152345678' })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const store = createOrderStore(conn);
      const { order } = await store.createOrder({
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: null,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: zoneId,
        provinceId: place.provinceId,
        cityId: place.cityId,
        recipientName: name,
        recipientPhone: '09152345678',
        addressText: 'بلوار سجاد، سجاد 18، پلاک 42',
        postalCode: null,
        items: [{ pageCount: 20, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
      if (!settle) {
        // تلاشی که از درگاه برنگشت، ساخته چهل دقیقه پیش از «حالا»ی طرح، پیش از `unreturnedBefore` پیشخوان. با `insertPayment` زمان ساختنش
        // `now()` پایگاه داده بود و از 13 مهر 1405 ساعت 10:50 تهران دیگر «برنگشته» نبود (بمب زمانی، ۱۴۰۵/۰۷/۱۱). پس در خود درج، مثل
        // `attempt` برش ۴٫۲: زمان ساختن پس از درج منجمد است (`payments_frozen`).
        await conn.db
          .insert(payments)
          .values({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority, createdAt: new Date(NOW.getTime() - 40 * MINUTE) });
        return { id: order.id, orderNumber: order.orderNumber, partnerId: null, smsId: null, partnerSmsId: null };
      }
      const payment = await store.insertPayment({ orderId: order.id, provider: 'mock', amountRials: order.totalRials, authority, raw: null });
      const settled = await store.settlePayment('mock', payment.authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt: NOW,
        postHandoffDueAt: END_MONDAY,
      }));
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        partnerId: settled!.order.printPartnerId,
        smsId: settled!.smsId,
        partnerSmsId: settled!.partnerSmsId,
      };
    }

    const assignEvent = (orderId: string): AdminEventInput => ({
      adminUserId: admin,
      action: 'orders.assign',
      targetType: 'order',
      targetId: orderId,
      detail: { orderNumber: 1 },
      at: NOW,
    });
    const assign = (orderId: string, from: string | null, to: string, reason = 'دستگاه چاپ نور تا فردا خراب است.') =>
      createPanelOrderStore(conn).assignPartner(ALL_ORDERS, { orderId, from, to, at: NOW, adminUserId: admin, reason, event: assignEvent(orderId) });
    const startPrint = (orderId: string, partner: string | null) =>
      createPanelOrderStore(conn).changeStatus(ALL_ORDERS, {
        orderId,
        from: 'paid',
        to: 'printing',
        partnerId: partner,
        at: NOW,
        adminUserId: admin,
        note: null,
        event: { adminUserId: admin, action: 'orders.status', targetType: 'order', targetId: orderId, at: NOW },
      });
    const partnerEvent = (action: string): AdminEventInput => ({ adminUserId: admin, action, targetType: 'partner', at: NOW });
    const move = (id: string, set: Partial<typeof orders.$inferInsert>) =>
      rejectedConstraint(conn.db.update(orders).set(set).where(eq(orders.id, id)));

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await resetPartners();
      const created = await createAdminStore(conn).createInvite({
        inviteId: randomUUID(),
        newUserId: randomUUID(),
        username: 'ali',
        displayName: 'علی محمدی',
        role: 'operator',
        tokenHash: randomUUID().replace(/-/g, '').repeat(2),
        totpSealed: 'v1.sealed',
        at: NOW,
        expiresAt: new Date(NOW.getTime() + 15 * MINUTE),
        createdBy: null,
        allowExisting: false,
        event: { adminUserId: null, action: 'admins.invite', targetType: 'admin' },
      });
      admin = created.ok ? created.userId : '';
      docId = randomUUID();
      const store = createDocumentStore(conn);
      await store.insertUpload({
        id: docId,
        sessionHash: 'f'.repeat(64),
        originalName: 'ریاضی ۲.pdf',
        sourceKind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_000,
        storageKey: `uploads/${docId}.pdf`,
        uploadId: 'u',
        partSizeBytes: 8 * 1024 * 1024,
      });
      await store.markUploaded(docId, NOW, new Date(NOW.getTime() + 2 * DAY), null);
      await conn.db.update(documents).set({ status: 'ready', pageCount: 20 }).where(eq(documents.id, docId));
    });

    beforeEach(async () => {
      await resetPartners();
    });

    afterAll(async () => {
      // بعدی‌ها همان یک چاپخانهٔ دادهٔ پایه را دارند.
      await resetPartners();
    });

    it('دادهٔ پایه اولین چاپخانه را فقط وقتی جدول خالی است می‌نشاند: «چاپخانهٔ جزوه‌یار» در تهران، پیش‌فرض', async () => {
      const [row] = await conn.db.select().from(printPartners);
      expect(row).toMatchObject({ name: 'چاپخانهٔ جزوه‌یار', provinceId: 8, cityId: 394, isDefault: true, deactivatedAt: null, createdBy: null });
      // نام عوض‌شده با بالا آمدن بعدی برنمی‌گردد، و چاپخانهٔ دوم ساخته نمی‌شود (شاهد: جدول خالی بالا نشست).
      await conn.db.update(printPartners).set({ name: 'چاپخانهٔ مرکزی' }).where(eq(printPartners.id, first));
      const again = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(again.partnerInserted).toBeNull();
      expect((await conn.db.select().from(printPartners)).map((p) => p.name)).toEqual(['چاپخانهٔ مرکزی']);
      await conn.db.execute(sql`TRUNCATE print_partners CASCADE`);
      expect((await seedReferenceData(conn, { priceList: SEED_PRICE_LIST })).partnerInserted).toBe('چاپخانهٔ جزوه‌یار');
    });

    it('حداکثر یک پیش‌فرض و پیش‌فرض فعال؛ نام یکتا و نه خالی؛ شهر مال استان؛ پاک نمی‌شود، غیرفعال می‌شود', async () => {
      const insert = (values: typeof printPartners.$inferInsert) => rejectedConstraint(conn.db.insert(printPartners).values(values));
      expect(await insert({ name: 'چاپ نور', ...MASHHAD, isDefault: true })).toBe('print_partners_one_default');
      expect(await insert({ name: 'چاپخانهٔ جزوه‌یار', ...MASHHAD })).toBe('print_partners_name_unique');
      expect(await insert({ name: '   ', ...MASHHAD })).toBe('print_partners_name');
      expect(await insert({ name: 'چاپ نور', provinceId: 8, cityId: 1326 })).toBe('print_partners_city_province_fk');
      // شاهد: همان، درست.
      expect(await insert({ name: 'چاپ نور', ...MASHHAD })).toBeUndefined();
      const noor = await partnerId('چاپ نور');
      const set = (id: string, values: Partial<typeof printPartners.$inferInsert>) =>
        rejectedConstraint(conn.db.update(printPartners).set(values).where(eq(printPartners.id, id)));
      expect(await set(first, { deactivatedAt: NOW })).toBe('print_partners_default_active');
      expect(await set(noor, { isDefault: true })).toBe('print_partners_one_default');
      // شاهد: غیرپیش‌فرض غیرفعال می‌شود، و پیش‌فرض دیگری با خاموش کردن اولی.
      expect(await set(noor, { deactivatedAt: NOW })).toBeUndefined();
      expect(await set(noor, { deactivatedAt: null })).toBeUndefined();
      expect(
        await rejectedConstraint(
          conn.db.transaction(async (tx) => {
            await tx.update(printPartners).set({ isDefault: false }).where(eq(printPartners.id, first));
            await tx.update(printPartners).set({ isDefault: true }).where(eq(printPartners.id, noor));
          }),
        ),
      ).toBeUndefined();
      expect(await rejectedConstraint(conn.db.delete(printPartners).where(eq(printPartners.id, first)))).toBe('print_partners_no_delete');
      expect((await conn.db.select().from(printPartners)).length).toBe(2);
    });

    it('تخصیص در پرداخت: همان شهر، وگرنه همان استان، وگرنه نزدیک‌ترین (۱۰٫۱)؛ در همان شهر پیش‌فرض، وگرنه قدیمی‌ترین؛ هر کدام با ردیف و قاعده', async () => {
      const noor = await partner('چاپ نور', MASHHAD, { createdAt: new Date(NOW.getTime() - 3 * DAY) });
      const noor2 = await partner('چاپ نور دو', MASHHAD, { createdAt: new Date(NOW.getTime() - 2 * DAY) });
      const inactive = await partner('چاپ فارس', SHIRAZ, { deactivatedAt: new Date(NOW.getTime() - DAY) });
      // اولین چاپخانه از همه تازه‌تر، تا «قدیمی‌ترین» پایین چاپ نور باشد، نه آن.
      await conn.db.update(printPartners).set({ createdAt: NOW }).where(eq(printPartners.id, first));

      const mashhad = await paidOrder(MASHHAD);
      const neyshabur = await paidOrder(NEYSHABUR);
      const shiraz = await paidOrder(SHIRAZ);
      const noCity = await paidOrder({ provinceId: 17, cityId: null });
      const tehran = await paidOrder(TEHRAN);
      expect([mashhad, neyshabur, shiraz, noCity, tehran].map((o) => o.partnerId)).toEqual([noor, noor, first, first, first]);
      const rules = async (orderId: string) =>
        (await assignmentsOf(orderId)).map((a) => [a.fromPartnerId, a.toPartnerId, a.actor, a.adminUserId, a.rule, a.reason]);
      expect(await rules(mashhad.id)).toEqual([[null, noor, 'system', null, 'city', null]]);
      expect(await rules(neyshabur.id)).toEqual([[null, noor, 'system', null, 'province', null]]);
      // چاپخانهٔ غیرفعال شیراز انتخاب نمی‌شود (شاهد: فعالش پایین): تهران (حدود ۶۸۰ کیلومتر) نزدیک‌تر از مشهد است. سفارش بی شهر با مرکز
      // استانش (شیراز) سنجیده می‌شود.
      expect(await rules(shiraz.id)).toEqual([[null, first, 'system', null, 'nearest', null]]);
      expect(await rules(noCity.id)).toEqual([[null, first, 'system', null, 'nearest', null]]);
      expect(await rules(tehran.id)).toEqual([[null, first, 'system', null, 'city', null]]);

      // در همان شهر، پیش‌فرض بر قدیمی‌ترین مقدم است.
      await conn.db.update(printPartners).set({ isDefault: false }).where(eq(printPartners.id, first));
      await conn.db.update(printPartners).set({ isDefault: true }).where(eq(printPartners.id, noor2));
      expect((await paidOrder(MASHHAD)).partnerId).toBe(noor2);
      // بیرون از شهر و استان پیش‌فرض نه، نزدیک‌ترین: اصفهان به تهران نزدیک‌تر از مشهد است.
      const nearest = await paidOrder(ISFAHAN);
      expect(nearest.partnerId).toBe(first);
      expect(await rules(nearest.id)).toEqual([[null, first, 'system', null, 'nearest', null]]);
      await conn.db.update(printPartners).set({ isDefault: false }).where(eq(printPartners.id, noor2));
      // شاهد: همان چاپخانهٔ شیراز، فعال، سفارش شیراز را می‌گیرد.
      await conn.db.update(printPartners).set({ deactivatedAt: null }).where(eq(printPartners.id, inactive));
      expect((await paidOrder(SHIRAZ)).partnerId).toBe(inactive);
    });

    it('بی چاپخانهٔ فعال، سفارش بی چاپخانه پرداخت می‌شود و پیشخوان هشدار می‌دهد، نه بن‌بست', async () => {
      await conn.db.update(printPartners).set({ isDefault: false, deactivatedAt: NOW });
      const order = await paidOrder(TEHRAN);
      const [row] = await conn.db.select().from(orders).where(eq(orders.id, order.id));
      expect(row).toMatchObject({ status: 'paid', printPartnerId: null });
      expect(await assignmentsOf(order.id)).toEqual([]);
      // کارهای پرداخت همان‌اند: PDF جزوه و برگه.
      expect((await conn.db.select({ kind: jobs.kind }).from(jobs).where(eq(jobs.orderId, order.id))).map((j) => j.kind).sort()).toEqual([
        PREPARE_ORDER_JOB,
        PREPARE_TICKET_JOB,
      ]);
      const panel = createPanelOrderStore(conn);
      const clock: PanelClock = { at: NOW, staleBefore: new Date(NOW.getTime() + 60 * MINUTE), unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE), untrackedSince: new Date(NOW.getTime() - 45 * 86_400_000) };
      expect((await panel.alerts(ALL_ORDERS, clock)).unassigned).toEqual([order.orderNumber]);
      expect((await panel.list(ALL_ORDERS, { bucket: 'open', search: null, clock, limit: 10, offset: 0 }))[0]).toMatchObject({ printPartnerId: null, partnerName: null });
      expect((await panel.details(ALL_ORDERS, order.orderNumber))!).toMatchObject({ partner: null, assignments: [] });
      // مالک چاپخانه‌ای را فعال می‌کند و متصدی سفارش را به آن می‌سپارد: از هیچ، با دلیل.
      await conn.db.update(printPartners).set({ deactivatedAt: null }).where(eq(printPartners.id, first));
      expect(await assign(order.id, null, first, 'چاپخانه دوباره فعال شد.')).toMatchObject({ ok: true });
      expect((await panel.alerts(ALL_ORDERS, clock)).unassigned).toEqual([]);
      // «در حال چاپ» بی چاپخانه (پیش از ۵٫۲) هشدار نیست: چاپخانه‌اش دیگر عوض نمی‌شود (شاهد: همان سفارش در صف، بالا).
      await conn.db.update(printPartners).set({ isDefault: true }).where(eq(printPartners.id, first));
    });

    it('چاپخانهٔ سفارش فقط در «در صف چاپ»، فقط به چاپخانهٔ فعال، هرگز خالی، و هر تغییر با ردیف تخصیص از همان چاپخانهٔ قبل', async () => {
      const noor = await partner('چاپ نور', MASHHAD);
      const off = await partner('چاپ خاموش', ISFAHAN, { deactivatedAt: NOW });
      const order = await paidOrder(TEHRAN);
      const history = (from: string | null, to: string) => ({
        orderId: order.id,
        fromPartnerId: from,
        toPartnerId: to,
        at: NOW,
        actor: 'admin',
        adminUserId: admin,
        reason: 'آزمون',
      });
      /** سفارش و ردیف تخصیص در یک تراکنش، مثل پنل؛ خطای معوق در COMMIT. */
      const moveWith = (to: string | null, row: ReturnType<typeof history> | null) =>
        rejectedConstraint(
          conn.db.transaction(async (tx) => {
            await tx.update(orders).set({ printPartnerId: to }).where(eq(orders.id, order.id));
            if (row) await tx.insert(orderAssignments).values(row);
          }),
        );
      expect(await moveWith(null, null)).toBe('orders_partner_kept');
      expect(await moveWith(off, history(first, off))).toBe('orders_partner_active');
      expect(await moveWith(noor, null)).toBe('order_assignments_recorded');
      expect(await moveWith(noor, history(first, first))).toBe('order_assignments_moves');
      expect(await moveWith(noor, history(off, noor))).toBe('order_assignments_chain');
      expect(await moveWith(noor, { ...history(first, noor), reason: '  ' })).toBe('order_assignments_actor');
      // جابه‌جایی همیشه با دلیل؛ فقط سپردن سفارشی که چاپخانه نداشت بی دلیل است (۱۰٫۱، پایین).
      expect(await moveWith(noor, { ...history(first, noor), reason: null } as never)).toBe('order_assignments_actor');
      expect(await moveWith(noor, { ...history(first, noor), actor: 'system', adminUserId: null, reason: null, rule: 'city' } as never)).toBe(
        'order_assignments_actor',
      );
      // ردیف تخصیص بی جابه‌جایی سفارش هم نه.
      expect(await rejectedConstraint(conn.db.insert(orderAssignments).values(history(first, noor)))).toBe('order_assignments_recorded');
      expect(await partnerOf(order.id)).toBe(first);
      // شاهد: همان جابه‌جایی با ردیف درست.
      expect(await moveWith(noor, history(first, noor))).toBeUndefined();
      expect(await partnerOf(order.id)).toBe(noor);

      // در حال چاپ نه؛ برگشته به صف، دوباره بله.
      expect(await move(order.id, { status: 'printing' })).toBeUndefined();
      expect(await moveWith(first, history(noor, first))).toBe('orders_partner_queued');
      expect(await move(order.id, { status: 'paid' })).toBeUndefined();
      expect(await moveWith(first, history(noor, first))).toBeUndefined();
      // سفارش پرداخت‌نشده چاپخانه ندارد.
      const [unpaid] = await conn.db.select().from(orders).where(eq(orders.id, order.id));
      expect(
        await rejectedConstraint(
          conn.db.insert(orders).values({ ...unpaid!, id: randomUUID(), orderNumber: undefined as never, publicToken: randomUUID(), checkoutKey: randomUUID(), status: 'awaiting_payment', paidAt: null, postHandoffDueAt: null, printPartnerId: first }),
        ),
      ).toBe('orders_partner_paid');

      // تاریخچه فقط افزودنی؛ با خود سفارش می‌رود.
      const [row] = await assignmentsOf(order.id);
      expect(await rejectedConstraint(conn.db.update(orderAssignments).set({ reason: 'x' }).where(eq(orderAssignments.id, row!.id)))).toBe(
        'order_assignments_append_only',
      );
      expect(await rejectedConstraint(conn.db.delete(orderAssignments).where(eq(orderAssignments.id, row!.id)))).toBe(
        'order_assignments_append_only',
      );
      expect((await assignmentsOf(order.id)).length).toBe(3);
      await conn.db.delete(payments).where(eq(payments.orderId, order.id));
      await conn.db.delete(orders).where(eq(orders.id, order.id));
      expect(await assignmentsOf(order.id)).toEqual([]);
    });

    it('جابه‌جایی در پنل: از چاپخانه‌ای که ادمین دید، با ردیف، کار برگه و رویداد در یک تراکنش؛ دو جابه‌جایی هم‌زمان یک بار', async () => {
      const panel = createPanelOrderStore(conn);
      const noor = await partner('چاپ نور', MASHHAD);
      const off = await partner('چاپ خاموش', ISFAHAN, { deactivatedAt: NOW });
      const order = await paidOrder(MASHHAD);
      expect(order.partnerId).toBe(noor);
      await ticketDone(order.id);

      expect(await assign(order.id, noor, off)).toEqual({ ok: false, reason: 'partner_inactive' });
      expect(await assign(order.id, first, noor)).toEqual({ ok: false, reason: 'changed', current: 'paid', partnerId: noor });
      expect(await ticketJobOf(order.id)).toMatchObject({ status: 'done' });
      // شاهد: از همان که دید.
      expect(await assign(order.id, noor, first)).toMatchObject({ ok: true, order: { printPartnerId: first } });
      expect(await ticketJobOf(order.id)).toMatchObject({ status: 'queued', attempts: 0, finishedAt: null });
      const [system, moved] = await assignmentsOf(order.id);
      expect(system).toMatchObject({ actor: 'system', rule: 'city', toPartnerId: noor });
      expect(moved).toMatchObject({ fromPartnerId: noor, toPartnerId: first, actor: 'admin', adminUserId: admin, rule: null, reason: 'دستگاه چاپ نور تا فردا خراب است.' });
      const [event] = await conn.db.select().from(adminEvents).where(eq(adminEvents.action, 'orders.assign'));
      expect(event).toMatchObject({
        adminUserId: admin,
        targetType: 'order',
        targetId: order.id,
        detail: { orderNumber: 1, from: { id: noor, name: 'چاپ نور' }, to: { id: first, name: 'چاپخانهٔ جزوه‌یار' }, reason: 'دستگاه چاپ نور تا فردا خراب است.' },
      });
      const details = (await panel.details(ALL_ORDERS, order.orderNumber))!;
      expect(details.partner).toEqual({ id: first, name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران', provinceName: 'تهران', active: true, isDefault: true });
      expect(details.assignments).toEqual([
        expect.objectContaining({ fromName: null, toName: 'چاپ نور', actor: 'system', adminName: null, rule: 'city', reason: null }),
        expect.objectContaining({ fromName: 'چاپ نور', toName: 'چاپخانهٔ جزوه‌یار', actor: 'admin', adminName: 'علی محمدی', rule: null }),
      ]);
      // گزینه‌ها: فقط فعال‌ها، پیش‌فرض اول، با شمار سفارش باز (و از ۱۰٫۱ جا و در دسترس بودن، برای ترتیب پیشنهادی).
      expect(await panel.partnerOptions(ALL_ORDERS)).toEqual([
        expect.objectContaining({ id: first, name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران', isDefault: true, openOrders: 1, availability: 'open' }),
        expect.objectContaining({ id: noor, name: 'چاپ نور', cityName: 'مشهد', isDefault: false, openOrders: 0, cityId: 1326, provinceId: 11 }),
      ]);

      // دو ادمین هم‌زمان از همان چاپخانه: یکی جابه‌جا می‌کند، دیگری «عوض شد» با چاپخانهٔ تازه.
      const third = await partner('چاپ آفتاب', ISFAHAN);
      const results = await Promise.all([assign(order.id, first, noor), assign(order.id, first, third)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const lost = results.find((r) => !r.ok) as { reason: string; partnerId: string };
      expect(lost.reason).toBe('changed');
      expect(lost.partnerId).toBe(await partnerOf(order.id));
      expect((await assignmentsOf(order.id)).length).toBe(3);
      // سفارش بسته جابه‌جا نمی‌شود.
      await move(order.id, { status: 'cancelled' });
      expect(await assign(order.id, await partnerOf(order.id), first)).toMatchObject({ ok: false, reason: 'changed', current: 'cancelled' });
    });

    it('جابه‌جایی و «شروع چاپ» هم‌زمان فقط یکی می‌شوند؛ «شروع چاپ» از چاپخانه‌ای که ادمین دید', async () => {
      const noor = await partner('چاپ نور', MASHHAD);
      for (let i = 0; i < 6; i += 1) {
        const order = await paidOrder(TEHRAN);
        const results = await Promise.all(i % 2 ? [startPrint(order.id, first), assign(order.id, first, noor)] : [assign(order.id, first, noor), startPrint(order.id, first)]);
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        const [row] = await conn.db.select().from(orders).where(eq(orders.id, order.id));
        // یا در حال چاپ پیش همان چاپخانه، یا در صف پیش چاپخانهٔ تازه؛ هرگز در حال چاپ پیش چاپخانهٔ تازه.
        expect([row!.status, row!.printPartnerId]).toEqual(row!.status === 'printing' ? ['printing', first] : ['paid', noor]);
      }
      // شاهد: «شروع چاپ» با چاپخانهٔ کهنه «چاپخانه عوض شد» است، نه «وضعیت عوض شد»؛ با همان که هست، انجام.
      const order = await paidOrder(TEHRAN);
      await assign(order.id, first, noor);
      expect(await startPrint(order.id, first)).toEqual({ ok: false, current: 'paid', partnerChanged: true });
      expect(await startPrint(order.id, noor)).toMatchObject({ ok: true, order: { status: 'printing', printPartnerId: noor } });
    });

    it('غیرفعال کردن فقط بی سفارش باز، حتی وقتی تخصیص هم‌زمان می‌رسد؛ و تخصیص به چاپخانه‌ای که همان لحظه غیرفعال شد نه', async () => {
      const partners = createPartnerStore(conn);
      const noor = await partner('چاپ نور', MASHHAD);
      const order = await paidOrder(MASHHAD);
      expect(await partners.deactivate({ id: noor, at: NOW, event: partnerEvent('partners.deactivate') })).toBe('open_orders');
      expect(await rejectedConstraint(conn.db.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, noor)))).toBe(
        'print_partners_open_orders',
      );
      expect(await partners.deactivate({ id: first, at: NOW, event: partnerEvent('partners.deactivate') })).toBe('default');
      // در حال چاپ هم باز است؛ لغوشده نه (شاهد).
      await move(order.id, { status: 'printing' });
      expect(await partners.deactivate({ id: noor, at: NOW, event: partnerEvent('partners.deactivate') })).toBe('open_orders');
      await move(order.id, { status: 'cancelled' });
      expect(await partners.deactivate({ id: noor, at: NOW, event: partnerEvent('partners.deactivate') })).toBe('ok');
      expect(await partners.deactivate({ id: noor, at: NOW, event: partnerEvent('partners.deactivate') })).toBe('already');
      expect(await partners.activate({ id: noor, event: partnerEvent('partners.activate') })).toBe('ok');

      // تخصیصی که هنوز commit نشده: غیرفعال کردن پشت قفل چاپخانه می‌ماند و بعد سفارش باز را می‌بیند.
      const waiting = await paidOrder(TEHRAN);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));
      const moving = conn.db.transaction(async (tx) => {
        await tx.update(orders).set({ printPartnerId: noor }).where(eq(orders.id, waiting.id));
        await tx.insert(orderAssignments).values({ orderId: waiting.id, fromPartnerId: first, toPartnerId: noor, at: NOW, actor: 'admin', adminUserId: admin, reason: 'آزمون' });
        locked();
        await held;
      });
      await lockTaken;
      const deactivating = partners.deactivate({ id: noor, at: NOW, event: partnerEvent('partners.deactivate') });
      await new Promise((resolve) => setTimeout(resolve, 200));
      release();
      await moving;
      expect(await deactivating).toBe('open_orders');
      expect((await conn.db.select().from(printPartners).where(eq(printPartners.id, noor)))[0]!.deactivatedAt).toBeNull();

      // وارونه: غیرفعال کردنی که هنوز commit نشده؛ جابه‌جایی منتظر می‌ماند و بعد «فعال نیست».
      const aftab = await partner('چاپ آفتاب', ISFAHAN);
      let release2!: () => void;
      const held2 = new Promise<void>((resolve) => (release2 = resolve));
      let locked2!: () => void;
      const lockTaken2 = new Promise<void>((resolve) => (locked2 = resolve));
      const closing = conn.db.transaction(async (tx) => {
        await tx.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, aftab));
        locked2();
        await held2;
      });
      await lockTaken2;
      const assigning = assign(waiting.id, noor, aftab);
      await new Promise((resolve) => setTimeout(resolve, 200));
      release2();
      await closing;
      expect(await assigning).toEqual({ ok: false, reason: 'partner_inactive' });
      expect(await partnerOf(waiting.id)).toBe(noor);
    });

    it('بی قفل‌های پنل هم (SQL خام): غیرفعال کردن و جابه‌جایی هم‌زمان، به هر دو ترتیب، فقط یکی می‌شوند', async () => {
      const noor = await partner('چاپ نور', MASHHAD);
      /** تراکنشی که کارش را کرده و تا `release` باز می‌ماند؛ خطایش با نام محدودیت. */
      const hold = async (work: (tx: Parameters<Parameters<typeof conn.db.transaction>[0]>[0]) => Promise<void>) => {
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let ready!: () => void;
        const worked = new Promise<void>((resolve) => (ready = resolve));
        const done = rejectedConstraint(
          conn.db.transaction(async (tx) => {
            await work(tx);
            ready();
            await held;
          }),
        );
        await worked;
        return { release, done };
      };
      const moveTo = (orderId: string, from: string, to: string) => async (tx: Parameters<Parameters<typeof conn.db.transaction>[0]>[0]) => {
        await tx.update(orders).set({ printPartnerId: to }).where(eq(orders.id, orderId));
        await tx.insert(orderAssignments).values({ orderId, fromPartnerId: from, toPartnerId: to, at: NOW, actor: 'admin', adminUserId: admin, reason: 'آزمون' });
      };

      // جابه‌جایی هنوز commit نشده؛ غیرفعال کردن با UPDATE ساده (بی `FOR UPDATE` ذخیره‌گاه) پشت قفل چاپخانه می‌ماند و بعد رد می‌شود.
      const first1 = await paidOrder(TEHRAN);
      const moving = await hold(moveTo(first1.id, first, noor));
      const closing = rejectedConstraint(conn.db.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, noor)));
      await new Promise((resolve) => setTimeout(resolve, 200));
      moving.release();
      expect(await moving.done).toBeUndefined();
      expect(await closing).toBe('print_partners_open_orders');

      // وارونه: غیرفعال کردن هنوز commit نشده؛ جابه‌جایی با SQL خام پشت قفل می‌ماند و بعد «فعال نیست».
      const aftab = await partner('چاپ آفتاب', ISFAHAN);
      const second = await paidOrder(TEHRAN);
      const deactivating = await hold(async (tx) => {
        await tx.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, aftab));
      });
      const assigning = rejectedConstraint(conn.db.transaction(moveTo(second.id, first, aftab)));
      await new Promise((resolve) => setTimeout(resolve, 200));
      deactivating.release();
      expect(await deactivating.done).toBeUndefined();
      expect(await assigning).toBe('orders_partner_active');
      expect([await partnerOf(first1.id), await partnerOf(second.id)]).toEqual([noor, first]);
    });

    it('پرداخت هم‌زمان با غیرفعال شدن چاپخانهٔ هم‌شهر: پرداخت نمی‌شکند و سفارش به بعدی می‌رود', async () => {
      const noor = await partner('چاپ نور', MASHHAD);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const lockTaken = new Promise<void>((resolve) => (locked = resolve));
      const closing = conn.db.transaction(async (tx) => {
        await tx.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, noor));
        locked();
        await held;
      });
      await lockTaken;
      // برگشت درگاه چاپ نور را هنوز فعال می‌بیند و پشت قفلش می‌ماند؛ پس از commit غیرفعال کردن، انتخاب از نو.
      const paying = paidOrder(MASHHAD);
      await new Promise((resolve) => setTimeout(resolve, 200));
      release();
      await closing;
      const paid = await paying;
      expect(paid.partnerId).toBe(first);
      const [row] = await conn.db.select().from(orders).where(eq(orders.id, paid.id));
      expect(row).toMatchObject({ status: 'paid', printPartnerId: first });
      expect((await assignmentsOf(paid.id)).map((a) => [a.toPartnerId, a.rule])).toEqual([[first, 'nearest']]);
      // شاهد: همان سفارش مشهد، با چاپ نور فعال، هم‌شهر است.
      await conn.db.update(printPartners).set({ deactivatedAt: null }).where(eq(printPartners.id, noor));
      expect((await paidOrder(MASHHAD)).partnerId).toBe(noor);
    });

    it('اثر انگشت برگه نام و شهر چاپخانه را دارد؛ جابه‌جایی و ویرایش چاپخانه کار برگه را در همان تراکنش دوباره در صف می‌گذارند', async () => {
      const partners = createPartnerStore(conn);
      const noor = await partner('چاپ نور', MASHHAD);
      const open = await paidOrder(TEHRAN);
      const closed = await paidOrder(TEHRAN);
      await move(closed.id, { status: 'printing' });
      await move(closed.id, { status: 'handed_to_post', handedToPostAt: NOW });
      const before = await stampOf(open.id);
      for (const o of [open, closed]) await ticketDone(o.id);

      // پیش‌فرض کردن و چاپخانهٔ دیگری روی برگه نیستند (شاهد).
      expect(await partners.setDefault({ id: noor, event: partnerEvent('partners.default') })).toBe('ok');
      expect(await partners.update({ id: noor, seen: { name: 'چاپ نور', cityId: 1326, notifyMobile: null }, name: 'چاپ نور مشهد', ...MASHHAD, notifyMobile: null, event: partnerEvent('partners.update') })).toMatchObject({ ok: true });
      expect(await stampOf(open.id)).toBe(before);
      expect(await ticketJobOf(open.id)).toMatchObject({ status: 'done' });

      // نام چاپخانهٔ خود سفارش: اثر انگشت تازه، و کار برگهٔ سفارش باز در صف؛ سفارش رسیده به پست نه.
      expect(
        await partners.update({ id: first, seen: { name: 'چاپخانهٔ جزوه‌یار', cityId: 394, notifyMobile: null }, name: 'چاپخانهٔ مرکزی', ...TEHRAN, notifyMobile: null, event: partnerEvent('partners.update') }),
      ).toMatchObject({ ok: true, changed: ['name'] });
      const renamed = await stampOf(open.id);
      expect(renamed).not.toBe(before);
      expect(await ticketJobOf(open.id)).toMatchObject({ status: 'queued' });
      expect(await ticketJobOf(closed.id)).toMatchObject({ status: 'done' });
      // شهر هم.
      await ticketDone(open.id);
      await partners.update({ id: first, seen: { name: 'چاپخانهٔ مرکزی', cityId: 394, notifyMobile: null }, name: 'چاپخانهٔ مرکزی', provinceId: 8, cityId: 336, notifyMobile: null, event: partnerEvent('partners.update') });
      expect(await stampOf(open.id)).not.toBe(renamed);
      expect(await ticketJobOf(open.id)).toMatchObject({ status: 'queued' });

      // جابه‌جایی: چاپخانهٔ دیگر، اثر انگشت دیگر.
      await ticketDone(open.id);
      const moved = await stampOf(open.id);
      await assign(open.id, first, noor);
      expect(await stampOf(open.id)).not.toBe(moved);
      expect(await ticketJobOf(open.id)).toMatchObject({ status: 'queued' });
    });

    it('زبانهٔ «چاپخانه‌ها»: فهرست، افزودن، ویرایش از همان که دیده شد، پیش‌فرض و فعال کردن، هر کدام با رویداد', async () => {
      const partners = createPartnerStore(conn);
      const created = await partners.create({ name: 'چاپ نور', ...MASHHAD, notifyMobile: null, at: NOW, createdBy: admin, event: partnerEvent('partners.create') });
      expect(created).toMatchObject({ ok: true, partner: { name: 'چاپ نور', isDefault: false, deactivatedAt: null, createdBy: admin } });
      const noor = created.ok ? created.partner.id : '';
      expect(await partners.create({ name: 'چاپ نور', ...ISFAHAN, notifyMobile: null, at: NOW, createdBy: admin, event: partnerEvent('partners.create') })).toEqual({
        ok: false,
        reason: 'name_taken',
      });
      const aftab = await partner('چاپ آفتاب', ISFAHAN, { deactivatedAt: NOW });
      await paidOrder(MASHHAD);

      expect((await partners.list()).map((p) => [p.name, p.cityName, p.provinceName, p.isDefault, p.deactivatedAt !== null, p.openOrders])).toEqual([
        ['چاپخانهٔ جزوه‌یار', 'تهران', 'تهران', true, false, 0],
        ['چاپ نور', 'مشهد', 'خراسان رضوی', false, false, 1],
        ['چاپ آفتاب', 'اصفهان', 'اصفهان', false, true, 0],
      ]);
      expect(await partners.find(noor)).toMatchObject({ name: 'چاپ نور', openOrders: 1 });
      expect(await partners.find(randomUUID())).toBeNull();

      const edit = (seen: { name: string; cityId: number }, name: string, place = MASHHAD) =>
        partners.update({ id: noor, seen: { ...seen, notifyMobile: null }, name, ...place, notifyMobile: null, event: partnerEvent('partners.update') });
      expect(await edit({ name: 'چاپ نو', cityId: 1326 }, 'چاپ نور مشهد')).toEqual({ ok: false, reason: 'changed' });
      expect(await edit({ name: 'چاپ نور', cityId: 1326 }, 'چاپ آفتاب')).toEqual({ ok: false, reason: 'name_taken' });
      expect(await edit({ name: 'چاپ نور', cityId: 1326 }, 'چاپ نور')).toMatchObject({ ok: true, changed: [] });
      expect(await edit({ name: 'چاپ نور', cityId: 1326 }, 'چاپ نور مشهد', NEYSHABUR)).toMatchObject({ ok: true, changed: ['name', 'city'] });

      expect(await partners.setDefault({ id: aftab, event: partnerEvent('partners.default') })).toBe('inactive');
      expect(await partners.setDefault({ id: first, event: partnerEvent('partners.default') })).toBe('already');
      expect(await partners.activate({ id: aftab, event: partnerEvent('partners.activate') })).toBe('ok');
      // دو «پیش‌فرض کن» هم‌زمان: هر دو پشت‌سرهم، و همیشه دقیقاً یک پیش‌فرض (نه خطای ایندکس یکتا).
      const both = await Promise.all([
        partners.setDefault({ id: noor, event: partnerEvent('partners.default') }),
        partners.setDefault({ id: aftab, event: partnerEvent('partners.default') }),
      ]);
      expect(both).toEqual(['ok', 'ok']);
      expect((await conn.db.select().from(printPartners).where(eq(printPartners.isDefault, true))).length).toBe(1);

      const events = await conn.db.select().from(adminEvents).where(eq(adminEvents.targetType, 'partner')).orderBy(adminEvents.id);
      expect(events.map((e) => e.action)).toEqual(['partners.create', 'partners.update', 'partners.activate', 'partners.default', 'partners.default']);
      expect(events[0]).toMatchObject({ targetId: noor, detail: { name: 'چاپ نور', city: 'مشهد' } });
      expect(events[1]).toMatchObject({
        targetId: noor,
        detail: { changed: ['name', 'city'], name: 'چاپ نور مشهد', city: 'نیشابور', previous: { name: 'چاپ نور', city: 'مشهد' } },
      });
      expect((events[3]!.detail as { previous: { name: string } }).previous.name).toBe('چاپخانهٔ جزوه‌یار');
    });

    /**
     * نقش چاپخانه و محدوده (برش ۵٫۳، ADR-042)، با همان چاپخانه‌ها و سفارش‌های واقعی بالا: نقش سوم با ستون نوع‌دار و محافظ‌هایش، و
     * محدودهٔ هر تابع ذخیره‌گاه سفارش‌های پنل؛ چاپخانه فقط سفارش‌هایی را می‌خواند و می‌نویسد که امروز به خودش سپرده شده‌اند.
     */
    describe('نقش چاپخانه و محدوده (برش ۵٫۳)', () => {
      const clock: PanelClock = {
        at: NOW,
        staleBefore: new Date(NOW.getTime() + 60 * MINUTE),
        unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE),
        untrackedSince: new Date(NOW.getTime() - 45 * 86_400_000),
      };
      const scopeOf = (partnerId: string) => ({ kind: 'partner' as const, partnerId });

      /** کاربر تازه با پیوند، مثل فرم «افزودن ادمین». */
      const invite = (username: string, role: 'owner' | 'operator' | 'print_partner', partnerId: string | null = null) =>
        createAdminStore(conn).createInvite({
          inviteId: randomUUID(),
          newUserId: randomUUID(),
          username,
          displayName: `کاربر ${username}`,
          role,
          partnerId,
          tokenHash: randomUUID().replace(/-/g, '').repeat(2),
          totpSealed: 'v1.sealed',
          at: NOW,
          expiresAt: new Date(NOW.getTime() + 15 * MINUTE),
          createdBy: admin,
          allowExisting: false,
          event: { adminUserId: admin, action: 'admins.invite', targetType: 'admin', detail: { username, role } },
        });
      const userOf = async (created: Awaited<ReturnType<typeof invite>>) => {
        if (!created.ok) throw new Error(created.reason);
        return created.userId;
      };

      it('نقش سوم: دقیقاً یک چاپخانه، و نقش‌های دیگر هیچ؛ کاربر چاپخانه فقط همین نقش را دارد؛ یک چاپخانه چند کاربر', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        const hasan = await userOf(await invite('hasan', 'print_partner', noor));
        const reza = await userOf(await invite('reza', 'print_partner', noor));
        const ali = await userOf(await invite('ali2', 'operator'));
        expect(
          (await conn.db.select().from(adminUserRoles).where(inArray(adminUserRoles.adminUserId, [hasan, reza, ali]))).map((r) => [
            r.adminUserId,
            r.roleId,
            r.printPartnerId,
          ]),
        ).toEqual(expect.arrayContaining([[hasan, 'print_partner', noor], [reza, 'print_partner', noor], [ali, 'operator', null]]));
        const role = (values: typeof adminUserRoles.$inferInsert) => rejectedConstraint(conn.db.insert(adminUserRoles).values(values));
        const bare = await userOf(await invite('bare', 'owner'));
        await conn.db.delete(adminUserRoles).where(eq(adminUserRoles.adminUserId, bare));
        // نقش چاپخانه بی چاپخانه، و متصدی با چاپخانه.
        expect(await role({ adminUserId: bare, roleId: 'print_partner' })).toBe('admin_user_roles_partner');
        expect(await role({ adminUserId: bare, roleId: 'operator', printPartnerId: noor })).toBe('admin_user_roles_partner');
        // چاپخانه‌ای که نیست.
        expect(await role({ adminUserId: bare, roleId: 'print_partner', printPartnerId: randomUUID() })).toBe(
          'admin_user_roles_print_partner_id_print_partners_id_fk',
        );
        // کاربر چاپخانه نقش دیگری نمی‌گیرد، و مالک و متصدی نقش چاپخانه نه.
        expect(await role({ adminUserId: hasan, roleId: 'owner' })).toBe('admin_user_roles_partner_alone');
        expect(await role({ adminUserId: ali, roleId: 'print_partner', printPartnerId: noor })).toBe('admin_user_roles_partner_alone');
        // شاهد: مالک و متصدی با هم ممکن است (فقط چاپخانه تنهاست)، و چاپخانهٔ درست.
        expect(await role({ adminUserId: ali, roleId: 'owner' })).toBeUndefined();
        expect(await role({ adminUserId: bare, roleId: 'print_partner', printPartnerId: first })).toBeUndefined();
      });

      it('کاربر چاپخانه و نقش دیگر هم‌زمان: دومی پشت اولی می‌ماند و بعد رد می‌شود (EXCLUDE، نه سنجش پیش از نوشتن)', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        const user = await userOf(await invite('mina', 'owner'));
        await conn.db.delete(adminUserRoles).where(eq(adminUserRoles.adminUserId, user));
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let inserted!: () => void;
        const insertedOnce = new Promise<void>((resolve) => (inserted = resolve));
        const first$ = conn.db.transaction(async (tx) => {
          await tx.insert(adminUserRoles).values({ adminUserId: user, roleId: 'print_partner', printPartnerId: noor });
          inserted();
          await held;
        });
        await insertedOnce;
        let settled = false;
        const second = rejectedConstraint(conn.db.insert(adminUserRoles).values({ adminUserId: user, roleId: 'owner' })).finally(() => {
          settled = true;
        });
        try {
          await new Promise((resolve) => setTimeout(resolve, 150));
          expect(settled).toBe(false);
        } finally {
          // شکست همین سنجش قفل را باز نگذارد تا تست‌های بعدی پشتش نمانند.
          release();
        }
        await first$;
        expect(await second).toBe('admin_user_roles_partner_alone');
      });

      it('پیوند کاربر چاپخانه: چاپخانهٔ فعال، زیر قفل؛ نشست و فهرست ادمین‌ها چاپخانه را دارند؛ رویداد با نام چاپخانه', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        const aftab = await partner('چاپ آفتاب', ISFAHAN, { deactivatedAt: NOW });
        const store = createAdminStore(conn);
        expect(await invite('p1', 'print_partner')).toEqual({ ok: false, reason: 'partner_required' });
        expect(await invite('p2', 'print_partner', aftab)).toEqual({ ok: false, reason: 'partner_inactive' });
        expect(await invite('p3', 'print_partner', randomUUID())).toEqual({ ok: false, reason: 'partner_inactive' });
        expect(await store.findUserByUsername('p2')).toBeNull();
        const hasan = await userOf(await invite('hasan.noor', 'print_partner', noor));
        const [event] = await conn.db
          .select()
          .from(adminEvents)
          .where(and(eq(adminEvents.action, 'admins.invite'), eq(adminEvents.targetId, hasan)));
        expect(event!.detail).toEqual({ username: 'hasan.noor', role: 'print_partner', partner: { id: noor, name: 'چاپ نور' }, reset: false });
        // متصدی با چاپخانه در ورودی: چاپخانه نادیده (شاهد CHECK بالا: نوشتنش رد می‌شد).
        const ali = await userOf(await invite('ali3', 'operator', noor));
        expect(await store.rolesOf(ali)).toEqual(['operator']);

        // نشست کاربر چاپخانه چاپخانه‌اش را دارد و فقط سه مجوز؛ متصدی بی چاپخانه.
        await conn.db.update(adminUsers).set({ passwordHash: 'h', totpSealed: 't' }).where(inArray(adminUsers.id, [hasan, ali]));
        const hashes = { hasan: randomUUID().replace(/-/g, ''), ali: randomUUID().replace(/-/g, '') };
        await conn.db.insert(adminSessions).values([
          { tokenHash: hashes.hasan, adminUserId: hasan, createdAt: NOW, expiresAt: new Date(NOW.getTime() + DAY), lastSeenAt: NOW },
          { tokenHash: hashes.ali, adminUserId: ali, createdAt: NOW, expiresAt: new Date(NOW.getTime() + DAY), lastSeenAt: NOW },
        ]);
        expect(await store.findSession(hashes.hasan)).toMatchObject({
          roles: ['print_partner'],
          permissions: [
            'files.download',
            'inventory.manage',
            'inventory.read',
            'orders.read',
            'orders.status',
            'partners.availability',
            'reports.production',
            'settlements.read',
            'shipments.import',
          ],
          partner: { id: noor, name: 'چاپ نور' },
        });
        expect(await store.findSession(hashes.ali)).toMatchObject({ roles: ['operator'], partner: null });
        const listed = await store.listAdmins(NOW);
        expect(listed.filter((a) => a.partner).map((a) => [a.user.username, a.partner!.name])).toEqual([['hasan.noor', 'چاپ نور']]);
        expect((await store.findInvite((await conn.db.select().from(adminInvites).where(eq(adminInvites.adminUserId, hasan)))[0]!.tokenHash))!.partner).toEqual({
          id: noor,
          name: 'چاپ نور',
        });
        // فرم «افزودن ادمین»: فعال‌ها، طرف قرارداد اول و پیش‌فرض آخر.
        expect((await store.partnerChoices()).map((p) => [p.name, p.cityName, p.isDefault])).toEqual([
          ['چاپ نور', 'مشهد', false],
          ['چاپخانهٔ جزوه‌یار', 'تهران', true],
        ]);
        // فهرست «چاپخانه‌ها»: کاربرهای هر چاپخانه، جز غیرفعال‌ها.
        const reza = await userOf(await invite('reza3', 'print_partner', noor));
        await conn.db.update(adminUsers).set({ disabledAt: NOW }).where(eq(adminUsers.id, reza));
        expect((await createPartnerStore(conn).list()).map((p) => [p.name, p.users])).toEqual([
          ['چاپخانهٔ جزوه‌یار', []],
          ['چاپ نور', ['کاربر hasan.noor']],
          ['چاپ آفتاب', []],
        ]);
      });

      it('پیوند کاربر چاپخانه و غیرفعال شدن هم‌زمان همان چاپخانه: پیوند پشت آن می‌ماند و «غیرفعال» می‌گیرد (FOR SHARE)', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let updated!: () => void;
        const updatedOnce = new Promise<void>((resolve) => (updated = resolve));
        const off$ = conn.db.transaction(async (tx) => {
          await tx.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, noor));
          updated();
          await held;
        });
        await updatedOnce;
        let settled = false;
        const invite$ = invite('late', 'print_partner', noor).finally(() => {
          settled = true;
        });
        try {
          await new Promise((resolve) => setTimeout(resolve, 150));
          expect(settled).toBe(false);
        } finally {
          // شکست همین سنجش قفل را باز نگذارد تا تست‌های بعدی پشتش نمانند.
          release();
        }
        await off$;
        expect(await invite$).toEqual({ ok: false, reason: 'partner_inactive' });
        expect(await createAdminStore(conn).findUserByUsername('late')).toBeNull();
      });

      it('هر تابع ذخیره‌گاه در محدودهٔ یک چاپخانه فقط سفارش‌های همان را می‌خواند؛ سفارش چاپخانهٔ دیگر و پرداخت‌نشده «نیست»', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        const panel = createPanelOrderStore(conn);
        const mine = await paidOrder(MASHHAD, 'مریم کاظمی');
        const theirs = await paidOrder(TEHRAN, 'زهرا محمدی');
        expect([mine.partnerId, theirs.partnerId]).toEqual([noor, first]);
        const NOOR = scopeOf(noor);
        // هر دو PDF ساخته نشد، و یکی در حال چاپ.
        await conn.db.update(jobs).set({ status: 'failed', lastError: 'file_missing: x', finishedAt: NOW }).where(eq(jobs.kind, PREPARE_ORDER_JOB));
        await startPrint(theirs.id, first);

        const bounds = { at: NOW, tomorrowStart: END_MONDAY, dayAfterStart: new Date(END_MONDAY.getTime() + DAY) };
        expect(await panel.dueSummary(NOOR, bounds)).toMatchObject({ today: 1, overdue: 0, tomorrow: 0, later: 0 });
        expect(await panel.dueSummary(ALL_ORDERS, bounds)).toMatchObject({ today: 2 });
        expect(await panel.stats(NOOR, { since: new Date(NOW.getTime() - 7 * DAY), at: NOW })).toMatchObject({ printing: 0 });
        expect(await panel.stats(ALL_ORDERS, { since: new Date(NOW.getTime() - 7 * DAY), at: NOW })).toMatchObject({ printing: 1 });
        expect((await panel.alerts(NOOR, clock)).failedPdf).toEqual([mine.orderNumber]);
        expect((await panel.alerts(ALL_ORDERS, clock)).failedPdf.sort()).toEqual([mine.orderNumber, theirs.orderNumber].sort());
        for (const bucket of ['open', 'handed', 'cancelled', 'awaiting', 'abandoned', 'all'] as const) {
          const numbers = (await panel.list(NOOR, { bucket, search: null, clock, limit: 50, offset: 0 })).map((row) => row.orderNumber);
          expect(numbers, bucket).toEqual(bucket === 'open' || bucket === 'all' ? [mine.orderNumber] : []);
        }
        // جست‌وجوی نام سفارش دیگری در محدودهٔ چاپخانه هم هیچ.
        expect(await panel.list(NOOR, { bucket: 'all', search: { kind: 'name', text: 'زهرا' }, clock, limit: 50, offset: 0 })).toEqual([]);
        expect(await panel.counts(NOOR, { search: null, clock })).toEqual({ open: 1, handed: 0, cancelled: 0, awaiting: 0, abandoned: 0, all: 1 });
        expect((await panel.counts(ALL_ORDERS, { search: null, clock })).all).toBe(2);

        expect(await panel.details(NOOR, theirs.orderNumber)).toBeNull();
        expect(await panel.jozveFile(NOOR, theirs.orderNumber, 1)).toBeNull();
        expect(await panel.printVolume(NOOR, theirs.orderNumber, 1, 1)).toBeNull();
        expect(await panel.ticketFile(NOOR, theirs.orderNumber)).toBeNull();
        // شاهد: همان سفارش با «همه» هست، و سفارش خود چاپخانه در محدوده‌اش.
        expect((await panel.details(ALL_ORDERS, theirs.orderNumber))?.order.id).toBe(theirs.id);
        expect((await panel.details(NOOR, mine.orderNumber))?.order.id).toBe(mine.id);
        expect(await panel.jozveFile(NOOR, mine.orderNumber, 1)).toMatchObject({ orderId: mine.id });
        expect(await panel.printVolume(NOOR, mine.orderNumber, 1, 1)).toMatchObject({ orderId: mine.id });
        expect(await panel.ticketFile(NOOR, mine.orderNumber)).toMatchObject({ orderId: mine.id });
        // مشخصات فهرست جمع‌وجور (۹٫۱) هم: سفارش چاپخانهٔ دیگر در نقشه نیست، حتی با شناسه‌اش.
        expect([...(await panel.specs(NOOR, [mine.id, theirs.id])).keys()]).toEqual([mine.id]);
        expect([...(await panel.specs(ALL_ORDERS, [mine.id, theirs.id])).keys()].sort()).toEqual([mine.id, theirs.id].sort());
        // نام چاپخانه در ردیف فهرست، برای مالک و متصدی.
        const lines = await panel.list(ALL_ORDERS, { bucket: 'all', search: null, clock, limit: 50, offset: 0 });
        expect(Object.fromEntries(lines.map((row) => [row.orderNumber, row.partnerName]))).toEqual({
          [mine.orderNumber]: 'چاپ نور',
          [theirs.orderNumber]: (await conn.db.select().from(printPartners).where(eq(printPartners.id, first)))[0]!.name,
        });
        // گزینه‌های جابه‌جایی: در محدودهٔ چاپخانه فقط خودش.
        expect((await panel.partnerOptions(NOOR)).map((p) => p.id)).toEqual([noor]);
        expect((await panel.partnerOptions(ALL_ORDERS)).map((p) => p.id).sort()).toEqual([first, noor].sort());
      });

      it('پرداخت‌نشده و بی چاپخانه در محدودهٔ هیچ چاپخانه‌ای نیستند، حتی هم‌شهرش: هشدارها، فهرست، شمارش، پیشخوان و جزئیات', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        const panel = createPanelOrderStore(conn);
        // پرداخت وقتی هیچ چاپخانهٔ فعالی نبود: بی چاپخانه، با هشدار. بعد همه دوباره فعال.
        await conn.db.update(printPartners).set({ isDefault: false, deactivatedAt: NOW });
        const bare = await paidOrder(MASHHAD, 'کیان رستمی');
        await conn.db.update(printPartners).set({ deactivatedAt: null });
        await conn.db.update(printPartners).set({ isDefault: true }).where(eq(printPartners.id, first));
        expect(bare.partnerId).toBeNull();
        // تلاش پرداختی که از درگاه برنگشت.
        const waiting = await paidOrder(MASHHAD, 'نگار صادقی', { settle: false });
        const NOOR = scopeOf(noor);
        expect(await panel.alerts(ALL_ORDERS, clock)).toMatchObject({
          unassigned: [bare.orderNumber],
          unreturned: [{ orderNumber: waiting.orderNumber, attempts: 1 }],
        });
        expect(await panel.alerts(NOOR, clock)).toEqual({
          failedPdf: [],
          unreturned: [],
          unassigned: [],
          reviewRows: 0,
          untracked: [],
          smsFailed: [],
          paidSmsFailed: [],
          // پیامک چاپخانه (۷٫۶): در محدودهٔ چاپخانه هیچ (سؤال ۱۷۲).
          partnerSmsFailed: [],
          // پول و درگاه (۷٫۲): ردِ شروع در محدودهٔ چاپخانه هیچ.
          gatewayRejected: null,
          mismatched: [],
          held: [],
          verifiedUnused: [],
          autoClosed: { failed: 0, succeeded: 0 },
          unrefunded: [],
          refunding: [],
        });
        expect(await panel.counts(ALL_ORDERS, { search: null, clock })).toMatchObject({ open: 1, awaiting: 1, all: 2 });
        expect(await panel.counts(NOOR, { search: null, clock })).toEqual({ open: 0, handed: 0, cancelled: 0, awaiting: 0, abandoned: 0, all: 0 });
        for (const bucket of ['open', 'awaiting', 'all'] as const) {
          expect(await panel.list(NOOR, { bucket, search: null, clock, limit: 50, offset: 0 }), bucket).toEqual([]);
        }
        const bounds = { at: NOW, tomorrowStart: END_MONDAY, dayAfterStart: new Date(END_MONDAY.getTime() + DAY) };
        expect(await panel.dueSummary(NOOR, bounds)).toMatchObject({ overdue: 0, today: 0, tomorrow: 0, later: 0 });
        expect(await panel.details(NOOR, bare.orderNumber)).toBeNull();
        expect(await panel.details(NOOR, waiting.orderNumber)).toBeNull();
        // شاهد: هر دو با «همه» هستند.
        expect((await panel.details(ALL_ORDERS, waiting.orderNumber))?.order.status).toBe('awaiting_payment');
      });

      it('هر نوشتن در محدودهٔ یک چاپخانه به سفارش چاپخانهٔ دیگر نمی‌رسد: «نیست»، و سفارش و کارش دست نمی‌خورند', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        const panel = createPanelOrderStore(conn);
        const theirs = await paidOrder(TEHRAN);
        const NOOR = scopeOf(noor);
        await conn.db.update(jobs).set({ status: 'failed', attempts: 3, lastError: 'file_missing: x', finishedAt: NOW }).where(eq(jobs.orderId, theirs.id));
        const event = (action: string): AdminEventInput => ({ adminUserId: admin, action, targetType: 'order', targetId: theirs.id, at: NOW });
        expect(await panel.requeue(NOOR, theirs.id, PREPARE_ORDER_JOB, event('orders.pdf_rebuild'))).toBe('not_found');
        expect(
          await panel.changeStatus(NOOR, {
            orderId: theirs.id,
            from: 'paid',
            to: 'printing',
            partnerId: first,
            at: NOW,
            adminUserId: admin,
            note: null,
            event: event('orders.status'),
          }),
        ).toEqual({ ok: false, current: null });
        expect(
          await panel.editRecipient(NOOR, {
            orderId: theirs.id,
            editable: ['paid', 'printing'],
            recipient: { recipientName: 'نام دیگر', addressText: 'نشانی دیگر، پلاک 1', postalCode: null },
            event: event('orders.recipient'),
          }),
        ).toEqual({ ok: false, current: null });
        expect(
          await panel.assignPartner(NOOR, { orderId: theirs.id, from: first, to: noor, at: NOW, adminUserId: admin, reason: 'بردن', event: event('orders.assign') }),
        ).toEqual({ ok: false, reason: 'changed', current: null, partnerId: null });
        const [row] = await conn.db.select().from(orders).where(eq(orders.id, theirs.id));
        expect(row).toMatchObject({ status: 'paid', printPartnerId: first, recipientName: 'مریم کاظمی' });
        expect((await conn.db.select().from(jobs).where(and(eq(jobs.orderId, theirs.id), eq(jobs.kind, PREPARE_ORDER_JOB))))[0]).toMatchObject({
          status: 'failed',
          attempts: 3,
        });
        expect(await conn.db.select().from(adminEvents).where(eq(adminEvents.targetId, theirs.id))).toEqual([]);
        // شاهد: همان کارها با «همه».
        expect(await panel.requeue(ALL_ORDERS, theirs.id, PREPARE_ORDER_JOB, event('orders.pdf_rebuild'))).toBe('ok');
        expect(
          await panel.changeStatus(ALL_ORDERS, {
            orderId: theirs.id,
            from: 'paid',
            to: 'printing',
            partnerId: first,
            at: NOW,
            adminUserId: admin,
            note: null,
            event: event('orders.status'),
          }),
        ).toMatchObject({ ok: true });
      });

      it('سفارشی که همین حالا به چاپخانهٔ دیگری رفت: نوشتنی که پشت قفل ماند شرط محدوده را دوباره می‌سنجد و «نیست» می‌گیرد', async () => {
        const noor = await partner('چاپ نور', MASHHAD);
        const panel = createPanelOrderStore(conn);
        const order = await paidOrder(MASHHAD);
        expect(order.partnerId).toBe(noor);
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let moved!: () => void;
        const movedOnce = new Promise<void>((resolve) => (moved = resolve));
        // جابه‌جایی مالک، باز نگه داشته: ردیف سفارش قفل است.
        const move$ = conn.db.transaction(async (tx) => {
          await tx.update(orders).set({ printPartnerId: first }).where(eq(orders.id, order.id));
          await tx.insert(orderAssignments).values({
            orderId: order.id,
            fromPartnerId: noor,
            toPartnerId: first,
            at: NOW,
            actor: 'admin',
            adminUserId: admin,
            reason: 'دستگاه خراب است',
          });
          moved();
          await held;
        });
        await movedOnce;
        let settled = false;
        const start$ = panel
          .changeStatus(scopeOf(noor), {
            orderId: order.id,
            from: 'paid',
            to: 'printing',
            partnerId: noor,
            at: NOW,
            adminUserId: admin,
            note: null,
            event: { adminUserId: admin, action: 'orders.status', targetType: 'order', targetId: order.id, at: NOW },
          })
          .finally(() => {
            settled = true;
          });
        try {
          await new Promise((resolve) => setTimeout(resolve, 150));
          expect(settled).toBe(false);
        } finally {
          // شکست همین سنجش قفل را باز نگذارد تا تست‌های بعدی پشتش نمانند.
          release();
        }
        await move$;
        expect(await start$).toEqual({ ok: false, current: null });
        expect((await conn.db.select().from(orders).where(eq(orders.id, order.id)))[0]).toMatchObject({ status: 'paid', printPartnerId: first });
        // «دوباره بساز» هم: پس از جابه‌جایی، در محدودهٔ چاپخانهٔ قبلی نیست.
        expect(
          await panel.requeue(scopeOf(noor), order.id, PREPARE_TICKET_JOB, {
            adminUserId: admin,
            action: 'orders.ticket_rebuild',
            targetType: 'order',
            targetId: order.id,
            at: NOW,
          }),
        ).toBe('not_found');
      });
    });

    describe('پیامک به چاپخانه (برش ۷٫۶)', () => {
      const NOOR_MOBILE = '09151234567';
      const DAY_TEXT = formatDeadlineDay(END_MONDAY);
      const clock = (at: Date): PanelClock => ({
        at,
        staleBefore: new Date(at.getTime() + 60 * MINUTE),
        unreturnedBefore: new Date(at.getTime() - 30 * MINUTE),
        untrackedSince: new Date(at.getTime() - 45 * DAY),
      });
      const smsOf = async (id: number | null) => (id === null ? null : (await conn.db.select().from(smsMessages).where(eq(smsMessages.id, id)))[0]!);
      const deliver = (id: number, mode: 'queued' | 'retry' = 'queued', transport: SmsTransport = consoleTransport(() => {})) =>
        deliverQueued({ outbox: createSmsOutbox(conn, transport.name), transport, now: () => NOW, log: () => {} }, [id], { mode });
      const claim = (id: number) =>
        rejectedConstraint(conn.db.update(smsMessages).set({ status: 'sending', attempts: sql`${smsMessages.attempts} + 1`, attemptedAt: NOW }).where(eq(smsMessages.id, id)));
      const down: SmsTransport = { name: 'smsir', send: () => Promise.reject(new Error('down')) };

      it('موبایل اعلان: فقط شکل نرمال 09…، و خالی یعنی بی پیامک (CHECK `print_partners_notify_mobile`)', async () => {
        for (const bad of ['0915123456', '091512345678', '+989151234567', '9151234567', '۰۹۱۵۱۲۳۴۵۶۷', '0915 123 4567', '']) {
          expect(await rejectedConstraint(conn.db.insert(printPartners).values({ name: `چاپ ${bad || 'خالی'}`, ...MASHHAD, notifyMobile: bad })), bad).toBe(
            'print_partners_notify_mobile',
          );
        }
        // شاهد: همان درج با شکل نرمال و بی موبایل پذیرفته است.
        expect(await rejectedConstraint(conn.db.insert(printPartners).values({ name: 'چاپ نور', ...MASHHAD, notifyMobile: NOOR_MOBILE }))).toBeUndefined();
        expect(await rejectedConstraint(conn.db.insert(printPartners).values({ name: 'چاپ آفتاب', ...ISFAHAN, notifyMobile: null }))).toBeUndefined();
      });

      it('تخصیص در پرداخت به چاپخانهٔ با موبایل: پیامک «منتظر» سفارش تازه در همان تراکنش، با متن قالب؛ بی موبایل هیچ', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        const order = await paidOrder(MASHHAD);
        expect(order.partnerId).toBe(noor);
        expect(order.partnerSmsId).not.toBeNull();
        expect(order.smsId).not.toBe(order.partnerSmsId);
        const [assignment] = await assignmentsOf(order.id);
        expect(assignment).toMatchObject({ toPartnerId: noor, actor: 'system', rule: 'city', smsMessageId: order.partnerSmsId });
        expect(await smsOf(order.partnerSmsId)).toMatchObject({
          provider: 'queued',
          toMobile: NOOR_MOBILE,
          purpose: 'partner_order',
          status: 'pending',
          attempts: 0,
          body: partnerOrderText(order.orderNumber, DAY_TEXT),
          params: [String(order.orderNumber), DAY_TEXT],
          createdAt: NOW,
        });
        // همان متن قالب sms.ir، بی نشانی پنل (سؤال ۱۴۳).
        expect((await smsOf(order.partnerSmsId))!.body).toBe(`جزوه‌یار: سفارش تازه ${order.orderNumber}؛ تحویل به پست تا دوشنبه 13 مهر`);
        // چاپخانهٔ بی موبایل (پیش‌فرض تهران): بی پیامک.
        const tehran = await paidOrder(TEHRAN);
        expect([tehran.partnerId, tehran.partnerSmsId]).toEqual([first, null]);
        expect((await assignmentsOf(tehran.id))[0]!.smsMessageId).toBeNull();
        // پیش‌فرض با موبایل هم (سؤال ۱۲۶: «چاپخانهٔ جزوه‌یار» هم، اگر موبایل دارد).
        await conn.db.update(printPartners).set({ notifyMobile: '09121112233' }).where(eq(printPartners.id, first));
        const shiraz = await paidOrder(SHIRAZ);
        expect(shiraz.partnerId).toBe(first);
        expect(await smsOf(shiraz.partnerSmsId)).toMatchObject({ toMobile: '09121112233', purpose: 'partner_order', status: 'pending' });
      });

      it('جابه‌جایی در پنل: فقط چاپخانهٔ تازه پیامک می‌گیرد (۱۷۳)؛ بی موبایل هیچ', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        const order = await paidOrder(MASHHAD);
        const toFirst = await assign(order.id, noor, first);
        expect(toFirst).toMatchObject({ ok: true, smsId: null });
        await conn.db.update(printPartners).set({ notifyMobile: '09121112233' }).where(eq(printPartners.id, first));
        const back = await assign(order.id, first, noor);
        expect(back.ok).toBe(true);
        const backSms = back.ok ? back.smsId : null;
        expect(await smsOf(backSms)).toMatchObject({ toMobile: NOOR_MOBILE, purpose: 'partner_order', status: 'pending', createdAt: NOW });
        expect((await assignmentsOf(order.id)).map((a) => [a.toPartnerId, a.smsMessageId])).toEqual([
          [noor, order.partnerSmsId],
          [first, null],
          [noor, backSms],
        ]);
        // چاپخانهٔ قبلی هیچ‌وقت پیامک نگرفت: هیچ ردیف پیامکی به موبایل «چاپخانهٔ جزوه‌یار» نیست.
        expect(await conn.db.select().from(smsMessages).where(eq(smsMessages.toMobile, '09121112233'))).toEqual([]);
      });

      it('سفارش بی چاپخانه: «انتخاب» چاپخانهٔ با موبایل پیامک دارد، و بی موبایل ندارد', async () => {
        await conn.db.update(printPartners).set({ isDefault: false }).where(eq(printPartners.id, first));
        await conn.db.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, first));
        const bare = await paidOrder(MASHHAD);
        expect([bare.partnerId, bare.partnerSmsId]).toEqual([null, null]);
        const noor = await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        const picked = await assign(bare.id, null, noor, 'هنگام پرداخت چاپخانهٔ فعالی نبود.');
        expect(picked).toMatchObject({ ok: true });
        expect(await smsOf(picked.ok ? picked.smsId : null)).toMatchObject({ toMobile: NOOR_MOBILE, purpose: 'partner_order', status: 'pending' });
        const aftab = await partner('چاپ آفتاب', ISFAHAN);
        const bare2 = await paidOrder(MASHHAD);
        expect(bare2.partnerId).toBe(noor);
        // بی موبایل: همان جابه‌جایی بی پیامک.
        expect(await assign(bare2.id, noor, aftab)).toMatchObject({ ok: true, smsId: null });
      });

      it('محافظ تخصیص (`order_assignments_partner_sms`): چاپخانهٔ با موبایل پیامک تازهٔ خودش را دارد، به همان موبایل و برای همین سفارش؛ بی موبایل هیچ', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        const order = await paidOrder(TEHRAN);
        const other = await paidOrder(TEHRAN);
        const queued = (over: Partial<typeof smsMessages.$inferInsert> = {}) =>
          conn.db
            .insert(smsMessages)
            .values({
              provider: 'queued',
              toMobile: NOOR_MOBILE,
              purpose: 'partner_order',
              body: partnerOrderText(order.orderNumber, DAY_TEXT),
              params: [String(order.orderNumber), DAY_TEXT],
              status: 'pending',
              createdAt: NOW,
              ...over,
            })
            .returning({ id: smsMessages.id })
            .then((rows) => rows[0]!.id);
        const moveTo = (to: string, smsMessageId: number | null) =>
          rejectedConstraint(
            conn.db.transaction(async (tx) => {
              await tx.update(orders).set({ printPartnerId: to }).where(eq(orders.id, order.id));
              await tx.insert(orderAssignments).values({
                orderId: order.id,
                fromPartnerId: first,
                toPartnerId: to,
                at: NOW,
                actor: 'admin',
                adminUserId: admin,
                reason: 'آزمون',
                smsMessageId,
              });
            }),
          );
        expect(await moveTo(noor, null)).toBe('order_assignments_partner_sms');
        expect(await moveTo(noor, await queued({ purpose: 'order_paid', body: orderPaidText(order.orderNumber, DAY_TEXT) }))).toBe('order_assignments_partner_sms');
        expect(await moveTo(noor, await queued({ toMobile: '09121112233' }))).toBe('order_assignments_partner_sms');
        expect(
          await moveTo(noor, await queued({ body: partnerOrderText(other.orderNumber, DAY_TEXT), params: [String(other.orderNumber), DAY_TEXT] })),
        ).toBe('order_assignments_partner_sms');
        // پیامکی که دیگر «منتظر» نیست، یا تلاشی خورده، تازه نیست؛ هر شرط جدا، تا هر کدام شاهد خودش را داشته باشد.
        expect(await moveTo(noor, await queued({ status: 'failed', error: 'unconfigured' }))).toBe('order_assignments_partner_sms');
        expect(await moveTo(noor, await queued({ attempts: 1, attemptedAt: NOW }))).toBe('order_assignments_partner_sms');
        // چاپخانهٔ بی موبایل پیامک نمی‌گیرد.
        const aftab = await partner('چاپ آفتاب', ISFAHAN);
        expect(await moveTo(aftab, await queued())).toBe('order_assignments_partner_sms');
        // شاهد: پیامک تازهٔ درست پذیرفته است.
        const good = await queued();
        expect(await moveTo(noor, good)).toBeUndefined();
        expect((await assignmentsOf(order.id)).at(-1)).toMatchObject({ toPartnerId: noor, smsMessageId: good });
        // یک پیامک برای هر تخصیص (`order_assignments_sms`): همان ردیف پیامک به تخصیص دیگری، حتی با همان موبایل، وصل نمی‌شود.
        const twin = await partner('چاپ نور دو', MASHHAD, { notifyMobile: NOOR_MOBILE });
        expect(
          await rejectedConstraint(
            conn.db.transaction(async (tx) => {
              await tx.update(orders).set({ printPartnerId: twin }).where(eq(orders.id, order.id));
              await tx.insert(orderAssignments).values({
                orderId: order.id,
                fromPartnerId: noor,
                toPartnerId: twin,
                at: NOW,
                actor: 'admin',
                adminUserId: admin,
                reason: 'آزمون',
                smsMessageId: good,
              });
            }),
          ),
        ).toBe('order_assignments_sms');
        // ردیف تخصیص (پس پیامکش) عوض نمی‌شود.
        expect(
          await rejectedConstraint(conn.db.update(orderAssignments).set({ smsMessageId: null }).where(eq(orderAssignments.smsMessageId, good))),
        ).toBe('order_assignments_append_only');
      });

      it('فقط تا سفارش «در صف چاپ» همان چاپخانه است می‌رود (۱۷۴): جابه‌جاشده، تخصیص قدیمی، در حال چاپ و لغوشده نه؛ پایگاه داده هم (`sms_messages_live`)', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        // شاهد: پیامک زنده می‌رود («رفت»، کنسولی).
        const fresh = await paidOrder(MASHHAD);
        expect((await deliver(fresh.partnerSmsId!))[0]!.outcome).toBe('sent');
        expect(await smsOf(fresh.partnerSmsId)).toMatchObject({ status: 'logged', provider: 'console', attempts: 1, sentAt: NOW });

        // جابه‌جاشده: پیامک چاپخانهٔ قبلی دیگر نمی‌رود، نه منتظر و نه «دوباره بفرست».
        const moved = await paidOrder(MASHHAD);
        await assign(moved.id, noor, first);
        expect((await deliver(moved.partnerSmsId!))[0]!.outcome).toBe('skipped');
        expect(await claim(moved.partnerSmsId!)).toBe('sms_messages_live');
        // برگشت به همان چاپخانه: پیامک تازه زنده است و قدیمی همچنان نه (تخصیص امروز نیست).
        const back = await assign(moved.id, first, noor);
        const backSms = back.ok ? back.smsId! : 0;
        expect((await deliver(moved.partnerSmsId!))[0]!.outcome).toBe('skipped');
        expect(await claim(moved.partnerSmsId!)).toBe('sms_messages_live');
        expect((await deliver(backSms))[0]!.outcome).toBe('sent');

        // نرفته و بعد سفارش در حال چاپ: «دوباره بفرست» نه.
        const printing = await paidOrder(MASHHAD);
        expect((await deliver(printing.partnerSmsId!, 'queued', down))[0]!.outcome).toBe('failed');
        expect(await startPrint(printing.id, noor)).toMatchObject({ ok: true });
        expect((await deliver(printing.partnerSmsId!, 'retry'))[0]!.outcome).toBe('skipped');
        expect(await claim(printing.partnerSmsId!)).toBe('sms_messages_live');

        // لغوشده: نه.
        const cancelled = await paidOrder(MASHHAD);
        expect(await move(cancelled.id, { status: 'cancelled' })).toBeUndefined();
        expect((await deliver(cancelled.partnerSmsId!))[0]!.outcome).toBe('skipped');
        expect(await claim(cancelled.partnerSmsId!)).toBe('sms_messages_live');

        // نرفته و هنوز در صف چاپ همان چاپخانه: «دوباره بفرست» یک تلاش بیشتر، به همان شماره (سؤال ۱۷۷)، حتی اگر موبایل چاپخانه عوض شد.
        const retried = await paidOrder(MASHHAD);
        expect((await deliver(retried.partnerSmsId!, 'queued', down))[0]!.outcome).toBe('failed');
        await conn.db.update(printPartners).set({ notifyMobile: '09359998877' }).where(eq(printPartners.id, noor));
        expect((await deliver(retried.partnerSmsId!, 'retry'))[0]!.outcome).toBe('sent');
        expect(await smsOf(retried.partnerSmsId)).toMatchObject({ toMobile: NOOR_MOBILE, status: 'logged', attempts: 2 });
        // پیامک‌های بعدی به شمارهٔ تازه.
        expect(await smsOf((await paidOrder(MASHHAD)).partnerSmsId)).toMatchObject({ toMobile: '09359998877' });
      });

      it('میانهٔ تراکنش جابه‌جایی: سفارشی که دیگر پیش همان چاپخانه نیست، پیش از ردیف تخصیص تازه هم پیامکش زنده نیست؛ تریگر، صف و هشدار یک شرط', async () => {
        // پس از commit «چاپخانهٔ امروز» و «آخرین ردیف تخصیص» همیشه یکی‌اند (`order_assignments_recorded`، معوق)؛ فقط میانهٔ تراکنشی که
        // چاپخانهٔ سفارش را عوض کرده و ردیف تخصیص تازه را هنوز ننوشته (همان ترتیب `assignPartner`) از هم جدا می‌شوند، و هر سه نسخهٔ شرط
        // باید همان‌جا هم «زنده نیست» بگویند.
        await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        const order = await paidOrder(MASHHAD);
        const id = order.partnerSmsId!;
        expect((await deliver(id, 'queued', down))[0]!.outcome).toBe('failed');
        const live = (db: Database['db']) => db.select({ id: smsMessages.id }).from(smsMessages).where(and(eq(smsMessages.id, id), liveSms));
        const failedOf = async (db: Database['db']) =>
          (await createPanelOrderStore({ ...conn, db }).alerts(ALL_ORDERS, clock(NOW))).partnerSmsFailed.map((row) => row.orderNumber);
        // شاهد: پیش از جابه‌جایی زنده است و هشدار دارد.
        expect(await live(conn.db)).toEqual([{ id }]);
        expect(await failedOf(conn.db)).toEqual([order.orderNumber]);
        const rollback = new Error('برگرداندن تراکنش آزمون');
        await expect(
          conn.db.transaction(async (tx) => {
            await tx.update(orders).set({ printPartnerId: first }).where(eq(orders.id, order.id));
            const db = tx as unknown as Database['db'];
            expect(await live(db)).toEqual([]);
            expect(await failedOf(db)).toEqual([]);
            expect(
              await rejectedConstraint(
                tx.transaction((step) =>
                  step.update(smsMessages).set({ status: 'sending', attempts: 2, attemptedAt: NOW }).where(eq(smsMessages.id, id)),
                ),
              ),
            ).toBe('sms_messages_live');
            throw rollback;
          }),
        ).rejects.toBe(rollback);
        // شاهد: تراکنش برگشت، پس همان پیامک باز زنده است و «دوباره بفرست» می‌رود.
        expect(await live(conn.db)).toEqual([{ id }]);
        expect((await deliver(id, 'retry'))[0]!.outcome).toBe('sent');
      });

      it('ویرایش موبایل هم‌زمان با پرداخت: پرداخت نمی‌شکند و پیامک به شمارهٔ تازه می‌رود (موبایل پس از قفل خوانده می‌شود)', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let locked!: () => void;
        const lockTaken = new Promise<void>((resolve) => (locked = resolve));
        const editing = conn.db.transaction(async (tx) => {
          await tx.update(printPartners).set({ notifyMobile: '09359998877' }).where(eq(printPartners.id, noor));
          locked();
          await held;
        });
        await lockTaken;
        const paying = paidOrder(MASHHAD);
        await new Promise((resolve) => setTimeout(resolve, 200));
        release();
        await editing;
        const paid = await paying;
        expect(paid.partnerId).toBe(noor);
        expect(await smsOf(paid.partnerSmsId)).toMatchObject({ toMobile: '09359998877', status: 'pending' });
        // برداشتن موبایل هم‌زمان: بی پیامک، و پرداخت نمی‌شکند.
        let release2!: () => void;
        const held2 = new Promise<void>((resolve) => (release2 = resolve));
        let locked2!: () => void;
        const lockTaken2 = new Promise<void>((resolve) => (locked2 = resolve));
        const clearing = conn.db.transaction(async (tx) => {
          await tx.update(printPartners).set({ notifyMobile: null }).where(eq(printPartners.id, noor));
          locked2();
          await held2;
        });
        await lockTaken2;
        const paying2 = paidOrder(MASHHAD);
        await new Promise((resolve) => setTimeout(resolve, 200));
        release2();
        await clearing;
        expect(await paying2).toMatchObject({ partnerId: noor, partnerSmsId: null });
      });

      it('پنل: پیامک هر تخصیص در جزئیات، «دوباره بفرست» با تخصیص امروز و محدوده، و هشدار پیشخوان فقط برای مالک و متصدی', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { notifyMobile: NOOR_MOBILE });
        const panel = createPanelOrderStore(conn);
        const order = await paidOrder(MASHHAD);
        const details = await panel.details(ALL_ORDERS, order.orderNumber);
        expect(details!.assignments.map((a) => [a.toPartnerId, a.sms?.id ?? null, a.sms?.toMobile ?? null, a.sms?.status ?? null])).toEqual([
          [noor, order.partnerSmsId, NOOR_MOBILE, 'pending'],
        ]);
        const [row] = await assignmentsOf(order.id);
        expect(await panel.assignmentSms(ALL_ORDERS, row!.id)).toMatchObject({
          assignmentId: row!.id,
          orderNumber: order.orderNumber,
          orderStatus: 'paid',
          partnerId: noor,
          partnerName: 'چاپ نور',
          current: true,
          sms: { id: order.partnerSmsId, toMobile: NOOR_MOBILE, status: 'pending' },
        });
        // محدوده: خود چاپخانه می‌بیندش (کاربرش نه؛ سرویس پنل)، چاپخانهٔ دیگر «نیست».
        expect(await panel.assignmentSms({ kind: 'partner', partnerId: noor }, row!.id)).toMatchObject({ current: true });
        expect(await panel.assignmentSms({ kind: 'partner', partnerId: first }, row!.id)).toBeNull();
        expect(await panel.assignmentSms(ALL_ORDERS, 987_654_321)).toBeNull();

        // هشدار: منتظرِ تازه نه؛ منتظری که ماند هست؛ «نرفت» هست، با نام چاپخانه؛ «رفت» نه.
        expect((await panel.alerts(ALL_ORDERS, clock(NOW))).partnerSmsFailed).toEqual([]);
        const later = new Date(NOW.getTime() + SMS_STUCK_MS + MINUTE);
        expect((await panel.alerts(ALL_ORDERS, clock(later))).partnerSmsFailed).toEqual([{ orderNumber: order.orderNumber, partnerName: 'چاپ نور' }]);
        expect((await deliver(order.partnerSmsId!, 'queued', down))[0]!.outcome).toBe('failed');
        expect((await panel.alerts(ALL_ORDERS, clock(NOW))).partnerSmsFailed).toEqual([{ orderNumber: order.orderNumber, partnerName: 'چاپ نور' }]);
        // در محدودهٔ چاپخانه هیچ (کاربر چاپخانه نمی‌بیندش، سؤال ۱۷۲).
        expect((await panel.alerts({ kind: 'partner', partnerId: noor }, clock(NOW))).partnerSmsFailed).toEqual([]);
        // جابه‌جاشده: پیامکش دیگر زنده نیست، پس هشدار هم نه؛ و «دوباره بفرست»ش هم نه (`current: false`).
        await assign(order.id, noor, first);
        expect((await panel.alerts(ALL_ORDERS, clock(NOW))).partnerSmsFailed).toEqual([]);
        expect(await panel.assignmentSms(ALL_ORDERS, row!.id)).toMatchObject({ current: false, orderStatus: 'paid' });
        // برگشت و «دوباره بفرست» که رفت: هشدار نه.
        const back = await assign(order.id, first, noor);
        const [, , latest] = await assignmentsOf(order.id);
        expect(await panel.assignmentSms(ALL_ORDERS, latest!.id)).toMatchObject({ current: true, sms: { id: back.ok ? back.smsId : -1 } });
        expect((await deliver(back.ok ? back.smsId! : 0, 'queued', down))[0]!.outcome).toBe('failed');
        expect((await panel.alerts(ALL_ORDERS, clock(NOW))).partnerSmsFailed.map((a) => a.orderNumber)).toEqual([order.orderNumber]);
        expect((await deliver(back.ok ? back.smsId! : 0, 'retry'))[0]!.outcome).toBe('sent');
        expect((await panel.alerts(ALL_ORDERS, clock(NOW))).partnerSmsFailed).toEqual([]);
        // تخصیص پیش از پنجره (`untrackedSince`) هشدار نیست.
        const old = await paidOrder(MASHHAD);
        await deliver(old.partnerSmsId!, 'queued', down);
        expect((await panel.alerts(ALL_ORDERS, clock(NOW))).partnerSmsFailed.map((a) => a.orderNumber)).toEqual([old.orderNumber]);
        expect((await panel.alerts(ALL_ORDERS, { ...clock(NOW), untrackedSince: NOW })).partnerSmsFailed).toEqual([]);
      });

      it('زبانهٔ «چاپخانه‌ها»: موبایل اعلان در افزودن و ویرایش، از همان که دیده شد؛ فقط موبایل کار برگه نمی‌سازد', async () => {
        const partners = createPartnerStore(conn);
        const created = await partners.create({ name: 'چاپ نور', ...MASHHAD, notifyMobile: NOOR_MOBILE, at: NOW, createdBy: admin, event: partnerEvent('partners.create') });
        expect(created).toMatchObject({ ok: true, partner: { notifyMobile: NOOR_MOBILE } });
        const noor = created.ok ? created.partner.id : '';
        expect(await partners.find(noor)).toMatchObject({ notifyMobile: NOOR_MOBILE });
        expect((await partners.list()).map((p) => [p.name, p.notifyMobile])).toEqual([
          ['چاپخانهٔ جزوه‌یار', null],
          ['چاپ نور', NOOR_MOBILE],
        ]);
        const open = await paidOrder(MASHHAD);
        await ticketDone(open.id);
        const stamp = await stampOf(open.id);
        const seen = { name: 'چاپ نور', cityId: 1326, notifyMobile: NOOR_MOBILE };
        const edit = (from: typeof seen, notifyMobile: string | null) =>
          partners.update({ id: noor, seen: from, name: 'چاپ نور', ...MASHHAD, notifyMobile, event: partnerEvent('partners.update') });
        // همان که دیده شد: موبایلی که همین حالا جای دیگری عوض شد، هیچ نمی‌نویسد.
        expect(await edit({ ...seen, notifyMobile: '09121112233' }, null)).toEqual({ ok: false, reason: 'changed' });
        expect(await edit(seen, NOOR_MOBILE)).toMatchObject({ ok: true, changed: [] });
        expect(await edit(seen, '09359998877')).toMatchObject({ ok: true, changed: ['mobile'], partner: { notifyMobile: '09359998877' } });
        // موبایل روی برگه نیست: اثر انگشت همان، کار برگه همان «ساخته شد».
        expect(await stampOf(open.id)).toBe(stamp);
        expect(await ticketJobOf(open.id)).toMatchObject({ status: 'done' });
        expect(await edit({ ...seen, notifyMobile: '09359998877' }, null)).toMatchObject({ ok: true, changed: ['mobile'], partner: { notifyMobile: null } });
        const events = await conn.db.select().from(adminEvents).where(eq(adminEvents.targetId, noor)).orderBy(adminEvents.id);
        expect(events.map((e) => [e.action, (e.detail as { changed?: string[] }).changed ?? null])).toEqual([
          ['partners.create', null],
          ['partners.update', ['mobile']],
          ['partners.update', ['mobile']],
        ]);
        // رویداد شمارهٔ خام ندارد (پوشاندنش با سرویس پنل).
        expect(JSON.stringify(events.map((e) => e.detail))).not.toContain('09359998877');
        expect(JSON.stringify(events.map((e) => e.detail))).not.toContain(NOOR_MOBILE);
      });
    });

    describe('در دسترس بودن، فاصله و حالت دستی (برش ۱۰٫۱)', () => {
      /** نیمه‌شب آغاز دوشنبه ۱۳ مهر ۱۴۰۵ تهران، همان روز `NOW`. */
      const TODAY = new Date('2026-10-04T20:30:00Z');
      const days = (n: number) => new Date(TODAY.getTime() + n * DAY);
      const setPartner = (id: string, set: Partial<typeof printPartners.$inferInsert>) =>
        rejectedConstraint(conn.db.update(printPartners).set(set).where(eq(printPartners.id, id)));
      const mode = (value: 'auto' | 'manual') =>
        conn.db
          .insert(settings)
          .values({ key: 'assignment.mode', value })
          .onConflictDoUpdate({ target: settings.key, set: { value } });
      const OPEN = { availability: 'open' as const, closedFrom: null, closedUntil: null, note: null };

      afterEach(async () => {
        await conn.db.delete(settings).where(eq(settings.key, 'assignment.mode'));
      });

      it('محافظ‌های در دسترس بودن: «تعطیل» دقیقاً با هر دو روز و آغاز پیش از پایان، تا یک سال؛ یادداشت فقط برای شلوغ و تعطیل', async () => {
        expect(await setPartner(first, { availability: 'paused' })).toBe('print_partners_closed');
        expect(await setPartner(first, { availability: 'closed' })).toBe('print_partners_closed');
        expect(await setPartner(first, { availability: 'closed', closedFrom: TODAY })).toBe('print_partners_closed');
        expect(await setPartner(first, { availability: 'busy', closedFrom: TODAY, closedUntil: days(1) })).toBe('print_partners_closed');
        expect(await setPartner(first, { availability: 'closed', closedFrom: days(1), closedUntil: days(1) })).toBe('print_partners_closed');
        expect(await setPartner(first, { availability: 'closed', closedFrom: TODAY, closedUntil: days(367) })).toBe('print_partners_closed');
        expect(await setPartner(first, { availabilityNote: 'دستگاه خراب است' })).toBe('print_partners_availability_note');
        expect(await setPartner(first, { availability: 'busy', availabilityNote: ' دستگاه ' })).toBe('print_partners_availability_note');
        expect(await setPartner(first, { availability: 'busy', availabilityNote: 'ب'.repeat(201) })).toBe('print_partners_availability_note');
        // شاهد: همان‌ها درست.
        expect(await setPartner(first, { availability: 'busy', availabilityNote: 'ب'.repeat(200) })).toBeUndefined();
        expect(await setPartner(first, { availability: 'closed', closedFrom: TODAY, closedUntil: days(366), availabilityNote: null })).toBeUndefined();
        expect(await setPartner(first, { availability: 'open', closedFrom: null, closedUntil: null })).toBeUndefined();
      });

      it('پرداخت چاپخانهٔ تعطیل را رد می‌کند، شلوغ را فقط بی باز هم‌استان، و وقتی همه تعطیل‌اند اولی که باز می‌شود', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { availability: 'busy' });
        const sahar = await partner('چاپ سحر', NEYSHABUR);
        // باز همان استان پیش از شلوغ همان شهر.
        expect((await paidOrder(MASHHAD)).partnerId).toBe(sahar);
        // نیشابور تعطیل: شلوغ همان شهر پیش از باز تهران.
        await setPartner(sahar, { availability: 'closed', closedFrom: TODAY, closedUntil: days(2) });
        const busy = await paidOrder(MASHHAD);
        expect(busy.partnerId).toBe(noor);
        expect((await assignmentsOf(busy.id)).map((a) => a.rule)).toEqual(['city']);
        // همه تعطیل: نیشابور زودتر از تهران و مشهد باز می‌شود.
        await setPartner(noor, { availability: 'closed', closedFrom: TODAY, closedUntil: days(3) });
        await setPartner(first, { availability: 'closed', closedFrom: TODAY, closedUntil: days(5) });
        const reopening = await paidOrder(TEHRAN);
        expect(reopening.partnerId).toBe(sahar);
        expect((await assignmentsOf(reopening.id)).map((a) => a.rule)).toEqual(['reopening']);
        // تعطیلی آینده هنوز «باز» است.
        await setPartner(first, { closedFrom: days(1), closedUntil: days(5) });
        expect((await paidOrder(TEHRAN)).partnerId).toBe(first);
        // روزهای «همه تعطیل» برای مهلت: فقط چاپخانه‌های فعال، با روزهایشان؛ غیرفعالِ «باز» بازه را نمی‌شکند.
        await partner('چاپ خاموش', ISFAHAN, { deactivatedAt: NOW });
        const hours = await createOrderStore(conn).partnerHours();
        expect(hours).toHaveLength(3);
        expect(closedDays(allClosedWindow(hours))).toEqual(['1405/07/14']);
        await setPartner(sahar, { availability: 'open', closedFrom: null, closedUntil: null });
        expect(allClosedWindow(await createOrderStore(conn).partnerHours())).toBeNull();
      });

      it('حالت دستی: پرداخت بی تخصیص، و سپردن اول بی دلیل؛ جابه‌جایی همان با دلیل (سؤال ۱۹۹)', async () => {
        await mode('manual');
        const order = await paidOrder(TEHRAN);
        expect(order.partnerId).toBeNull();
        expect(await assignmentsOf(order.id)).toEqual([]);
        const panel = createPanelOrderStore(conn);
        const clock: PanelClock = { at: NOW, staleBefore: new Date(NOW.getTime() + 60 * MINUTE), unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE), untrackedSince: new Date(NOW.getTime() - 45 * DAY) };
        expect((await panel.alerts(ALL_ORDERS, clock)).unassigned).toEqual([order.orderNumber]);
        const noor = await partner('چاپ نور', MASHHAD);
        expect(await assign(order.id, null, first, null as never)).toMatchObject({ ok: true });
        expect((await assignmentsOf(order.id)).map((a) => [a.fromPartnerId, a.toPartnerId, a.actor, a.reason])).toEqual([[null, first, 'admin', null]]);
        // جابه‌جایی بی دلیل را پایگاه داده رد می‌کند.
        expect(await rejectedConstraint(assign(order.id, first, noor, null as never))).toBe('order_assignments_actor');
        expect(await partnerOf(order.id)).toBe(first);
        expect(await assign(order.id, first, noor)).toMatchObject({ ok: true });
        // ردیف سیستم فقط با قاعده‌های شناخته (شاهد: `nearest`).
        const another = await paidOrder(TEHRAN);
        const systemRow = (rule: string) =>
          rejectedConstraint(
            conn.db.transaction(async (tx) => {
              await tx.update(orders).set({ printPartnerId: first }).where(eq(orders.id, another.id));
              await tx.insert(orderAssignments).values({ orderId: another.id, fromPartnerId: null, toPartnerId: first, at: NOW, actor: 'system', rule });
            }),
          );
        expect(await systemRow('closest')).toBe('order_assignments_actor');
        expect(await systemRow(null as never)).toBe('order_assignments_actor');
        expect(await systemRow('nearest')).toBeUndefined();
        // برگشت به خودکار: پرداخت بعدی دوباره سپرده می‌شود؛ سفارش بی چاپخانهٔ قبلی خودکار سپرده نمی‌شد.
        await mode('auto');
        expect((await paidOrder(TEHRAN)).partnerId).toBe(first);
      });

      it('در دسترس بودن از پنل: از همان که دیده شد، بی تغییر بی رویداد، غیرفعال نه، و رویداد از و به', async () => {
        const store = createPartnerStore(conn);
        const noor = await partner('چاپ نور', MASHHAD);
        const event: AdminEventInput = { adminUserId: admin, action: 'partners.availability', targetType: 'partner', at: NOW };
        const closedState = { availability: 'closed' as const, closedFrom: days(1), closedUntil: days(4), note: 'تعمیر دستگاه' };
        expect(await store.setAvailability({ id: noor, seen: OPEN, next: closedState, event })).toBe('ok');
        expect(await store.setAvailability({ id: noor, seen: OPEN, next: OPEN, event })).toBe('changed');
        expect(await store.setAvailability({ id: noor, seen: closedState, next: closedState, event })).toBe('same');
        expect(await store.setAvailability({ id: randomUUID(), seen: OPEN, next: OPEN, event })).toBe('not_found');
        expect(await store.find(noor)).toMatchObject({ availability: 'closed', closedFrom: days(1), closedUntil: days(4), availabilityNote: 'تعمیر دستگاه' });
        const busyState = { availability: 'busy' as const, closedFrom: null, closedUntil: null, note: null };
        expect(await store.setAvailability({ id: noor, seen: closedState, next: busyState, event })).toBe('ok');
        await setPartner(noor, { deactivatedAt: NOW, availability: 'open' });
        expect(await store.setAvailability({ id: noor, seen: OPEN, next: busyState, event })).toBe('inactive');
        const events = await conn.db.select().from(adminEvents).where(and(eq(adminEvents.targetId, noor), eq(adminEvents.action, 'partners.availability'))).orderBy(adminEvents.id);
        expect(events.map((e) => e.detail)).toEqual([
          {
            name: 'چاپ نور',
            from: { availability: 'open' },
            to: { availability: 'closed', closedFrom: days(1).toISOString(), closedUntil: days(4).toISOString(), note: 'تعمیر دستگاه' },
          },
          {
            name: 'چاپ نور',
            from: { availability: 'closed', closedFrom: days(1).toISOString(), closedUntil: days(4).toISOString(), note: 'تعمیر دستگاه' },
            to: { availability: 'busy' },
          },
        ]);
      });

      it('کارت «چاپخانه‌ها»: فعال‌ها با در دسترس بودن و سفارش‌های در صف به ترتیب مهلت؛ چاپخانه فقط خودش', async () => {
        const noor = await partner('چاپ نور', MASHHAD, { availability: 'closed', closedFrom: TODAY, closedUntil: days(2), availabilityNote: 'تعمیر' });
        await partner('چاپ خاموش', ISFAHAN, { deactivatedAt: NOW });
        const a = await paidOrder(MASHHAD);
        const b = await paidOrder(TEHRAN);
        // تعطیل شدن پس از تخصیص: سفارش در صفش می‌ماند تا جابه‌جا شود.
        const c = await paidOrder(TEHRAN);
        await assign(c.id, first, noor);
        expect(await move(b.id, { status: 'printing' })).toBeUndefined();
        const panel = createPanelOrderStore(conn);
        const board = await panel.partnerBoard(ALL_ORDERS);
        expect(board.map((row) => [row.name, row.availability, row.openOrders, row.queued])).toEqual([
          ['چاپخانهٔ جزوه‌یار', 'open', 2, [a.orderNumber]],
          ['چاپ نور', 'closed', 1, [c.orderNumber]],
        ]);
        expect(board[1]).toMatchObject({ closedFrom: TODAY, closedUntil: days(2), availabilityNote: 'تعمیر', cityName: 'مشهد' });
        expect((await panel.partnerBoard({ kind: 'partner', partnerId: noor })).map((row) => row.name)).toEqual(['چاپ نور']);
        // فهرست جابه‌جایی همان فعال‌ها، با جا و در دسترس بودن برای ترتیب پیشنهادی.
        const options = await panel.partnerOptions(ALL_ORDERS);
        expect(options.map((o) => [o.name, o.availability, o.provinceId])).toEqual([
          ['چاپخانهٔ جزوه‌یار', 'open', 8],
          ['چاپ نور', 'closed', 11],
        ]);
        expect(rankPartners(options, MASHHAD, NOW).map((r) => r.partner.name)).toEqual(['چاپخانهٔ جزوه‌یار', 'چاپ نور']);
      });
    });
  });

  // در همین فایل، به همان دلیل «سند و آپلود». سنجش پیش‌نویس، متن‌ها، مجوز و کد تازه در سرویس تعرفهٔ پنل با ذخیره‌گاه ساختگی
  // (`apps/admin/lib/server/tariff.test.ts`)؛ اینجا همان که فقط پستگرس معنایش را دارد: تریگرها، قفل، تراکنش و رویداد.
  describe('تعرفه در پنل روی پستگرس (برش ۴٫۵)', () => {
    const NOW = new Date('2026-10-05T07:50:00Z');
    const MINUTE = 60_000;
    const Tehran = PROVINCES.find((p) => p.name === 'تهران')!;
    let sara: string;
    const actor = (): TariffActor => ({ adminUserId: sara, ipHash: 'ip' });
    const tariffEvents = async () =>
      (await conn.db.select().from(adminEvents).orderBy(adminEvents.id)).filter((e) => e.action.startsWith('tariff.'));
    const headOf = async (version: number) => (await conn.db.select().from(priceLists).where(eq(priceLists.version, version)))[0];

    /** سفارش کمینه با نسخهٔ `version`، برای شمار سفارش‌های هر نسخه؛ پول و جای ارسال فقط محدودیت‌ها را می‌خوانند. */
    async function orderOn(version: number) {
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: '09121112233' })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: NOW } })
        .returning();
      await conn.db.insert(orders).values({
        checkoutKey: randomUUID(),
        userId: user!.id,
        priceListVersion: version,
        priceBreakdown: {},
        subtotalRials: 10,
        shippingRials: 10,
        totalRials: 20,
        estWeightGrams: 100,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: 'tehran',
        provinceId: Tehran.id,
        recipientName: 'سارا احمدی',
        recipientPhone: '09121112233',
        addressText: 'پردیس، فاز ۲، پلاک ۱۲',
      });
    }

    beforeAll(async () => {
      await clearPriceLists(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const [admin] = await conn.db.insert(adminUsers).values({ username: 'sara', displayName: 'سارا رضایی' }).returning();
      sara = admin!.id;
    });

    // هر تست از نسخهٔ ۱ فعال، بی پیش‌نویس و بی نسخهٔ دیگر؛ رویداد فقط افزودنی است، پس TRUNCATE.
    beforeEach(async () => {
      await clearPriceLists(conn);
      await conn.db.execute(sql`TRUNCATE admin_events`);
      await seedPriceList(conn, SEED_PRICE_LIST);
    });

    afterAll(async () => {
      await clearPriceLists(conn);
      await seedPriceList(conn, SEED_PRICE_LIST);
    });

    it('نسخهٔ فعال‌شده تغییرناپذیر است: سر، ردیف‌ها، زمان فعال شدن و پاک کردن؛ فقط `is_active` جابه‌جا می‌شود', async () => {
      const first = await headOf(1);
      // تعرفهٔ پایه با فعال شدنش زمان گرفت (تریگر، نه کد).
      expect(first!.activatedAt).toBeInstanceOf(Date);
      const v1 = eq(priceLists.version, 1);
      for (const change of [
        { label: 'تعرفهٔ دیگر' },
        { settings: { ...SEED_PRICE_LIST.settings, vatPercent: 9 } },
        { activatedAt: null },
        { activatedAt: NOW },
        { createdBy: sara },
        { basedOn: 1 },
        { createdAt: NOW },
      ]) {
        expect(await rejectedConstraint(conn.db.update(priceLists).set(change).where(v1)), JSON.stringify(change)).toBe('price_lists_frozen');
      }
      expect(await rejectedConstraint(conn.db.delete(priceLists).where(v1))).toBe('price_lists_frozen');

      // ردیف‌ها: عوض کردن، پاک کردن و درج، در هر هفت جدول (نرخ چاپ و نرخ کاغذ از ۸٫۳).
      for (const [name, query] of [
        ['نرخ چاپ', conn.db.update(printRates).set({ rateRials: 17_000 }).where(eq(printRates.priceListVersion, 1))],
        ['پاک کردن نرخ چاپ', conn.db.delete(printRates).where(eq(printRates.priceListVersion, 1))],
        [
          'نرخ چاپ A5',
          conn.db.insert(printRates).values({ priceListVersion: 1, paperSize: 'a5', sidesMode: 'single', colorMode: 'bw', rateRials: 1 }),
        ],
        ['نرخ کاغذ', conn.db.update(paperRates).set({ rateRials: 1 }).where(eq(paperRates.priceListVersion, 1))],
        [
          'نرخ کاغذ A5',
          conn.db.insert(paperRates).values({ priceListVersion: 1, paperTypeId: 'tahrir80', paperSize: 'a5', rateRials: 0 }),
        ],
        ['کاغذ', conn.db.update(paperTypes).set({ gsm: 90 }).where(eq(paperTypes.priceListVersion, 1))],
        ['صحافی', conn.db.update(bindingTypes).set({ maxSheetsPerVolume: 900 }).where(eq(bindingTypes.priceListVersion, 1))],
        ['بازه', conn.db.update(bindingRateBands).set({ priceRials: 1 }).where(eq(bindingRateBands.priceListVersion, 1))],
        ['روش ارسال', conn.db.update(shippingMethods).set({ enabled: true }).where(eq(shippingMethods.priceListVersion, 1))],
        ['کرایه', conn.db.update(shippingRates).set({ priceRials: 1 }).where(eq(shippingRates.priceListVersion, 1))],
        ['پاک کردن بازه', conn.db.delete(bindingRateBands).where(eq(bindingRateBands.priceListVersion, 1))],
        ['پاک کردن کرایه', conn.db.delete(shippingRates).where(eq(shippingRates.priceListVersion, 1))],
        [
          'بازهٔ تازه',
          conn.db.insert(bindingRateBands).values({ priceListVersion: 1, bindingTypeId: 'spiral_clear', paperSize: 'a4', minSheets: 801, maxSheets: 900, priceRials: 1 }),
        ],
        ['کاغذ تازه', conn.db.insert(paperTypes).values({ priceListVersion: 1, id: 'glossy', nameFa: 'گلاسه', gsm: 120 })],
      ] as const) {
        expect(await rejectedConstraint(query), name).toBe('price_list_rows_frozen');
      }

      // برگشت: نسخهٔ ۲ فعال و ۱ خاموش، بعد ۱ دوباره؛ زمان اولین فعال شدن ۱ همان می‌ماند.
      await seedPriceList(conn, { ...SEED_PRICE_LIST, version: 2, label: 'دو' });
      expect((await headOf(1))!.isActive).toBe(false);
      await activatePriceList(conn, 1);
      const again = await headOf(1);
      expect(again!.isActive).toBe(true);
      expect(again!.activatedAt).toEqual(first!.activatedAt);
      // سفارشی که به نسخه اشاره می‌کند هم آن را نگه می‌دارد، حتی بی تریگر (کلید خارجی).
      expect((await loadPriceList(conn, 1)).label).toBe(SEED_PRICE_LIST.label);
    });

    it('پیش‌نویس آزاد است و با ردیف‌هایش پاک می‌شود؛ ردیفش به نسخهٔ فعال‌شده نمی‌رود؛ درج فعال زمانش را می‌گیرد', async () => {
      await seedPriceList(conn, { ...SEED_PRICE_LIST, version: 2, label: 'پیش‌نویس' }, { activate: false });
      expect((await headOf(2))!.activatedAt).toBeNull();
      const v2 = eq(priceLists.version, 2);
      await conn.db.update(priceLists).set({ label: 'پیش‌نویس مهر' }).where(v2);
      await conn.db
        .update(printRates)
        .set({ rateRials: 17_000 })
        .where(and(eq(printRates.priceListVersion, 2), eq(printRates.colorMode, 'bw')));
      await conn.db.update(bindingRateBands).set({ priceRials: 460_000 }).where(eq(bindingRateBands.priceListVersion, 2));
      await conn.db.delete(shippingRates).where(and(eq(shippingRates.priceListVersion, 2), eq(shippingRates.zoneId, 'other')));
      expect((await headOf(2))!.label).toBe('پیش‌نویس مهر');
      // جابه‌جا کردن ردیف پیش‌نویس به نسخهٔ فعال‌شده هم عوض کردن آن است.
      expect(
        await rejectedConstraint(
          conn.db
            .update(bindingRateBands)
            .set({ priceListVersion: 1, minSheets: 801, maxSheets: 900 })
            .where(and(eq(bindingRateBands.priceListVersion, 2), eq(bindingRateBands.minSheets, 1))),
        ),
      ).toBe('price_list_rows_frozen');
      // و برعکس: ردیف نسخهٔ فعال‌شده به پیش‌نویس هم نمی‌رود.
      expect(
        await rejectedConstraint(
          conn.db
            .update(bindingRateBands)
            .set({ priceListVersion: 2, minSheets: 801, maxSheets: 900 })
            .where(and(eq(bindingRateBands.priceListVersion, 1), eq(bindingRateBands.minSheets, 1))),
        ),
      ).toBe('price_list_rows_frozen');

      await conn.db.delete(priceLists).where(v2);
      expect(await headOf(2)).toBeUndefined();
      const [left] = await conn.db.select({ n: count() }).from(bindingRateBands).where(eq(bindingRateBands.priceListVersion, 2));
      expect(left!.n).toBe(0);

      // درج مستقیم نسخهٔ فعال (مثل SQL تست سایت): زمان فعال شدن را تریگر می‌نویسد.
      const inserted = await conn.db.transaction(async (tx) => {
        await tx.update(priceLists).set({ isActive: false }).where(eq(priceLists.isActive, true));
        const [row] = await tx
          .insert(priceLists)
          .values({ version: 3, label: 'سه', settings: SEED_PRICE_LIST.settings, isActive: true })
          .returning();
        await tx.update(priceLists).set({ isActive: false }).where(eq(priceLists.version, 3));
        await tx.update(priceLists).set({ isActive: true }).where(eq(priceLists.version, 1));
        return row!;
      });
      expect(inserted.activatedAt).toBeInstanceOf(Date);

      // دیوار دوم: بی تریگر، CHECK نسخهٔ فعال بی زمان فعال شدن را نمی‌پذیرد. تغییر تریگر با تراکنش برمی‌گردد.
      let rejected: string | undefined;
      await conn.db
        .transaction(async (tx) => {
          await tx.execute(sql`ALTER TABLE price_lists DISABLE TRIGGER price_lists_frozen`);
          rejected = await rejectedConstraint(tx.update(priceLists).set({ activatedAt: null }).where(eq(priceLists.isActive, true)));
          tx.rollback();
        })
        .catch(() => undefined);
      expect(rejected).toBe('price_lists_active_activated');
      expect(await rejectedConstraint(conn.db.update(priceLists).set({ activatedAt: null }).where(eq(priceLists.version, 1)))).toBe(
        'price_lists_frozen',
      );
    });

    it('ردیفی که هم‌زمان با فعال شدن نسخه می‌رسد، منتظر می‌ماند و بعد رد می‌شود', async () => {
      await seedPriceList(conn, { ...SEED_PRICE_LIST, version: 2, label: 'پیش‌نویس' }, { activate: false });
      let late: Promise<string | undefined> | undefined;
      let settled = false;
      await conn.db.transaction(async (tx) => {
        await tx.update(priceLists).set({ activatedAt: NOW }).where(eq(priceLists.version, 2));
        // اتصال دیگر، پیش از COMMIT فعال شدن: سرِ نسخه را قفل‌شده می‌بیند و منتظر می‌ماند.
        late = rejectedConstraint(
          conn.db.insert(bindingRateBands).values({ priceListVersion: 2, bindingTypeId: 'spiral_clear', paperSize: 'a4', minSheets: 801, maxSheets: 900, priceRials: 1 }),
        ).finally(() => {
          settled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(settled).toBe(false);
      });
      expect(await late).toBe('price_list_rows_frozen');
      const [bands] = await conn.db.select({ n: count() }).from(bindingRateBands).where(eq(bindingRateBands.priceListVersion, 2));
      expect(bands!.n).toBe(SEED_PRICE_LIST.bindingTypes.spiral_clear!.bands.a4!.length);
    });

    it('نسخهٔ تازه از روی نسخهٔ فعال با شمارهٔ بعدی، سازنده، «از روی» و رویداد؛ هر بار یک پیش‌نویس، حتی هم‌زمان', async () => {
      const store = createTariffStore(conn);
      // تاریخچه‌ای با شمارهٔ بزرگ‌تر: پیش‌نویس تازه بعد از بزرگ‌ترین شماره است، نه بعد از نسخهٔ فعال.
      await seedPriceList(conn, { ...SEED_PRICE_LIST, version: 7, label: 'هفت' });
      await activatePriceList(conn, 1);
      const made = await Promise.all(Array.from({ length: 5 }, () => store.createDraft({ at: NOW, label: 'تعرفهٔ مهر 1405', actor: actor() })));
      expect(made.map((m) => m.version)).toEqual([8, 8, 8, 8, 8]);
      expect(made.filter((m) => m.created)).toHaveLength(1);
      expect(await store.load(8)).toEqual({ ...(await store.load(1))!, version: 8, label: 'تعرفهٔ مهر 1405' });
      const head = await headOf(8);
      expect(head).toMatchObject({ isActive: false, activatedAt: null, createdBy: sara, basedOn: 1, createdAt: NOW });
      const events = await tariffEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        action: 'tariff.draft',
        adminUserId: sara,
        targetType: 'price_list',
        targetId: '8',
        ipHash: 'ip',
        detail: { version: 8, from: 1 },
      });
      // پیش‌نویسی که پاک شد، شماره‌اش آزاد است: سفارشی به آن اشاره نکرده.
      expect(await store.deleteDraft({ version: 8, at: NOW, actor: actor() })).toBe('ok');
      expect(await store.createDraft({ at: NOW, label: 'دوباره', actor: actor() })).toEqual({ version: 8, created: true });
    });

    it('ذخیرهٔ پیش‌نویس: سر و ردیف‌ها از نو با رویداد؛ محتوایی که عوض شده بود نه؛ همپوشانی را پایگاه داده هم می‌گیرد؛ پس از فعال شدن نه', async () => {
      const store = createTariffStore(conn);
      const { version } = await store.createDraft({ at: NOW, label: 'مهر', actor: actor() });
      const base = (await store.load(version))!;
      const spiral = base.bindingTypes.spiral_clear!;
      const edited: PriceList = {
        ...base,
        label: 'تعرفهٔ مهر 1405',
        printRates: {
          a4: { single: { color: 24_000, bw: 19_000 }, double: { color: 22_000, bw: 17_000 } },
          a5: { single: { color: 15_000, bw: 12_000 }, double: { color: 13_000, bw: 10_000 } },
        },
        bindingTypes: {
          ...base.bindingTypes,
          spiral_clear: {
            ...spiral,
            bands: {
              a4: [
                { minSheets: 1, maxSheets: 300, priceRials: 480_000 },
                { minSheets: 301, maxSheets: 800, priceRials: 600_000 },
              ],
              a5: [{ minSheets: 1, maxSheets: 800, priceRials: 400_000 }],
            },
          },
        },
        shippingRates: base.shippingRates.map((r) =>
          r.zoneId === 'tehran' && r.minWeightGrams === 0 ? { ...r, priceRials: 1_350_000 } : r,
        ),
      };
      let seen: PriceList | null = null;
      const save = (list: PriceList, verify: (current: PriceList) => boolean = () => true) =>
        store.saveDraft({ list, verify, at: NOW, actor: actor() });
      expect(
        await save(edited, (current) => {
          seen = current;
          return true;
        }),
      ).toBe('ok');
      expect(seen).toEqual(base);
      expect(await store.load(version)).toEqual(edited);

      // محتوایی که از وقتی ادمین دید عوض شده: هیچ.
      expect(await save({ ...edited, label: 'دیگر' }, () => false)).toBe('changed');
      expect((await store.load(version))!.label).toBe('تعرفهٔ مهر 1405');

      // همپوشانی: سنجش سرویس پیش از این است، ولی پایگاه داده هم رد می‌کند و هیچ نیمه‌کاره نمی‌ماند.
      const overlapping: PriceList = {
        ...edited,
        label: 'همپوشان',
        bindingTypes: {
          ...edited.bindingTypes,
          spiral_clear: {
            ...spiral,
            bands: {
              a4: [
                { minSheets: 1, maxSheets: 300, priceRials: 1 },
                { minSheets: 300, maxSheets: 800, priceRials: 1 },
              ],
            },
          },
        },
      };
      expect(await rejectedConstraint(save(overlapping))).toBe('binding_rate_bands_no_overlap');
      expect(await store.load(version)).toEqual(edited);
      expect((await tariffEvents()).map((e) => e.action)).toEqual(['tariff.draft', 'tariff.draft_save']);
      expect((await tariffEvents())[1]).toMatchObject({ targetId: String(version), detail: { version } });

      expect(await store.activate({ version, expectedActive: 1, verify: () => true, at: NOW, actor: actor() })).toMatchObject({ ok: true });
      expect(await save(edited)).toBe('not_draft');
      expect(await save({ ...edited, version: 999 })).toBe('not_draft');
    });

    it('پاک کردن پیش‌نویس با ردیف‌ها و رویداد؛ نسخهٔ فعال‌شده و نسخه‌ای که نیست نه', async () => {
      const store = createTariffStore(conn);
      const { version } = await store.createDraft({ at: NOW, label: 'مهر', actor: actor() });
      expect(await store.deleteDraft({ version, at: NOW, actor: actor() })).toBe('ok');
      expect(await store.load(version)).toBeNull();
      const [left] = await conn.db.select({ n: count() }).from(shippingRates).where(eq(shippingRates.priceListVersion, version));
      expect(left!.n).toBe(0);
      expect(await store.deleteDraft({ version: 1, at: NOW, actor: actor() })).toBe('not_draft');
      expect(await store.deleteDraft({ version: 999, at: NOW, actor: actor() })).toBe('not_draft');
      expect(await store.load(1)).not.toBeNull();
      expect((await tariffEvents()).map((e) => [e.action, e.detail])).toEqual([
        ['tariff.draft', { version, from: 1 }],
        ['tariff.draft_delete', { version }],
      ]);
    });

    it('فعال کردن: نسخهٔ قبل خاموش و رویداد در یک تراکنش؛ نسخهٔ فعال یا محتوای دیگر «عوض شد»؛ دو کلیک یک بار؛ برگشت به نسخهٔ قبل', async () => {
      const store = createTariffStore(conn);
      // تعرفهٔ پایه پیش از «حالا»ی طرح فعال شده بود. `beforeEach` آن را با تریگر و `now()` پایگاه داده فعال می‌کند و فعال کردن‌های پایین
      // زمان ثابت دارند، پس از 13 مهر 1405 ساعت 11:21 تهران ترتیب «فعال شدن‌ها» برمی‌گشت (بمب زمانی، ۱۴۰۵/۰۷/۱۱). همان نسخهٔ ۱ از نو، با
      // زمان فعال شدن صحنه: تریگر فقط وقتی زمان می‌گذارد که کسی ننوشته باشد (0013)؛ زمان‌گذاری خود تریگر را تست «تغییرناپذیر» بالا می‌سنجد.
      await clearPriceLists(conn);
      await seedPriceList(conn, SEED_PRICE_LIST, { activate: false });
      const webUp = new Date(NOW.getTime() - 60 * MINUTE);
      await conn.db.update(priceLists).set({ isActive: true, activatedAt: webUp }).where(eq(priceLists.version, 1));
      expect((await headOf(1))!.activatedAt).toEqual(webUp);
      const { version } = await store.createDraft({ at: NOW, label: 'مهر', actor: actor() });
      const activate = (target: number, expectedActive: number | null, at: Date, verify: (list: PriceList) => boolean = () => true) =>
        store.activate({ version: target, expectedActive, verify, at, actor: actor() });

      expect(await activate(version, 99, NOW)).toEqual({ ok: false, reason: 'changed', active: 1 });
      let seen: PriceList | null = null;
      expect(
        await activate(version, 1, NOW, (list) => {
          seen = list;
          return false;
        }),
      ).toEqual({ ok: false, reason: 'changed', active: 1 });
      expect(seen).toEqual(await store.load(version));
      expect(await activate(999, 1, NOW)).toEqual({ ok: false, reason: 'not_found', active: 1 });
      expect((await headOf(1))!.isActive).toBe(true);
      expect((await tariffEvents()).map((e) => e.action)).toEqual(['tariff.draft']);

      const at = new Date(NOW.getTime() + MINUTE);
      expect(await activate(version, 1, at)).toEqual({ ok: true, already: false, previous: 1 });
      expect(await headOf(version)).toMatchObject({ isActive: true, activatedAt: at });
      expect((await headOf(1))!.isActive).toBe(false);
      expect((await loadActivePriceList(conn)).version).toBe(version);
      // دو کلیک: دومی همان را فعال می‌بیند، موفق و بی رویداد دوم.
      expect(await activate(version, 1, at)).toEqual({ ok: true, already: true, previous: version });

      // برگشت: نسخهٔ ۱ دوباره، با زمان اولین فعال شدنش.
      const firstOfOne = (await headOf(1))!.activatedAt;
      const later = new Date(NOW.getTime() + 5 * MINUTE);
      expect(await activate(1, version, later)).toEqual({ ok: true, already: false, previous: version });
      expect(await headOf(1)).toMatchObject({ isActive: true, activatedAt: firstOfOne });
      expect(await headOf(version)).toMatchObject({ isActive: false, activatedAt: at });

      const events = (await tariffEvents()).filter((e) => e.action === 'tariff.activate');
      expect(events.map((e) => [e.targetId, e.detail, e.at])).toEqual([
        [String(version), { version, previous: 1, again: false }, at],
        ['1', { version: 1, previous: version, again: true }, later],
      ]);
      // فعال شدن‌ها: تعرفهٔ پایه (بی نام، با بالا آمدن وب)، بعد دو فعال کردن از پنل با نام.
      expect(await store.activations()).toEqual([
        { version: 1, at: firstOfOne, adminName: null },
        { version, at, adminName: 'سارا رضایی' },
        { version: 1, at: later, adminName: 'سارا رضایی' },
      ]);
    });

    it('دو فعال‌سازی هم‌زمان: یکی فعال می‌شود و دیگری «عوض شد» می‌گیرد، نه خطای ایندکس یکتا', async () => {
      const store = createTariffStore(conn);
      await seedPriceList(conn, { ...SEED_PRICE_LIST, version: 2, label: 'دو' });
      await activatePriceList(conn, 1);
      const { version: draft } = await store.createDraft({ at: NOW, label: 'مهر', actor: actor() });
      const results = await Promise.all(
        [2, draft].map((target) => store.activate({ version: target, expectedActive: 1, verify: () => true, at: NOW, actor: actor() })),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, reason: 'changed' });
      const active = await conn.db.select({ version: priceLists.version }).from(priceLists).where(eq(priceLists.isActive, true));
      expect(active).toHaveLength(1);
      expect((await tariffEvents()).filter((e) => e.action === 'tariff.activate')).toHaveLength(1);
    });

    it('فهرست نسخه‌ها: تازه‌ترین اول، شمار سفارش‌های هر نسخه با هر وضعیتی، سازنده و «از روی»', async () => {
      const store = createTariffStore(conn);
      await orderOn(1);
      await orderOn(1);
      const { version } = await store.createDraft({ at: NOW, label: 'مهر', actor: actor() });
      const list = await store.versions();
      expect(list.map((v) => ({ version: v.version, isActive: v.isActive, draft: v.activatedAt === null, basedOn: v.basedOn, by: v.createdBy, orders: v.orders }))).toEqual([
        { version, isActive: false, draft: true, basedOn: 1, by: { id: sara, name: 'سارا رضایی' }, orders: 0 },
        { version: 1, isActive: true, draft: false, basedOn: null, by: null, orders: 2 },
      ]);
      expect(list[1]!.label).toBe(SEED_PRICE_LIST.label);
    });
  });

  describe('تنظیمات و کلیدها در پنل روی پستگرس (برش ۴٫۶)', () => {
    const NOW = new Date('2026-10-05T07:50:00Z');
    const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
    let sara = '';
    const actor = (): SettingsActor => ({ adminUserId: sara, ipHash: 'ip-hash' });

    const valueOf = async (key: string) =>
      (await conn.db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)))[0]?.value;
    const eventsOf = (targetType: string) =>
      conn.db
        .select({ action: adminEvents.action, targetId: adminEvents.targetId, detail: adminEvents.detail, adminUserId: adminEvents.adminUserId })
        .from(adminEvents)
        .where(eq(adminEvents.targetType, targetType))
        .orderBy(adminEvents.id);

    beforeAll(async () => {
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const [admin] = await conn.db.insert(adminUsers).values({ username: 'sara', displayName: 'سارا رضایی' }).returning();
      sara = admin!.id;
    });

    beforeEach(async () => {
      await conn.db.execute(sql`TRUNCATE admin_events`);
      await conn.db.delete(serviceSecrets);
      await conn.db.update(settings).set({ value: 2 }).where(eq(settings.key, SLA_DAYS_SETTING));
      await conn.db.update(settings).set({ value: 300 }).where(eq(settings.key, OTP_SITE_LIMIT_SETTING));
      await conn.db.update(settings).set({ value: OFFICIAL_HOLIDAYS }).where(eq(settings.key, HOLIDAYS_SETTING));
      await conn.db.update(settings).set({ value: 1405 }).where(eq(settings.key, OFFICIAL_THROUGH_SETTING));
    });

    afterAll(async () => {
      await conn.db.delete(serviceSecrets);
      await conn.db.update(settings).set({ value: 2 }).where(eq(settings.key, SLA_DAYS_SETTING));
      await conn.db.update(settings).set({ value: 300 }).where(eq(settings.key, OTP_SITE_LIMIT_SETTING));
      await conn.db.update(settings).set({ value: OFFICIAL_HOLIDAYS }).where(eq(settings.key, HOLIDAYS_SETTING));
      await conn.db.update(settings).set({ value: 1405 }).where(eq(settings.key, OFFICIAL_THROUGH_SETTING));
    });

    it('دادهٔ پایه «تطبیق‌داده‌شده تا» را ۱۴۰۵ می‌نشاند: تعطیلی‌های ۱۴۰۵ از تقویم رسمی‌اند و قمری ۱۴۰۶ پیش‌بینی', async () => {
      await conn.db.delete(settings).where(eq(settings.key, OFFICIAL_THROUGH_SETTING));
      const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(seeded.settingsInserted).toEqual([OFFICIAL_THROUGH_SETTING]);
      expect(await valueOf(OFFICIAL_THROUGH_SETTING)).toBe(1405);
    });

    it('تغییر تنظیم: نوشتن با رویدادش در یک تراکنش؛ «همان» بی نوشتن و بی رویداد؛ «رد» هیچ', async () => {
      const store = createSettingsStore(conn);
      const seen: unknown[] = [];
      const write = await store.change({
        key: SLA_DAYS_SETTING,
        action: 'settings.update',
        decide: (current) => {
          seen.push(current);
          return { kind: 'write', value: 3, detail: { key: SLA_DAYS_SETTING, from: 2, to: 3 } };
        },
        at: NOW,
        actor: actor(),
      });
      expect(write).toEqual({ ok: true, written: true });
      expect(seen).toEqual([2]);
      expect(await valueOf(SLA_DAYS_SETTING)).toBe(3);
      const [row] = await conn.db.select().from(settings).where(eq(settings.key, SLA_DAYS_SETTING));
      expect(row!.updatedAt).toEqual(NOW);

      expect(await store.change({ key: SLA_DAYS_SETTING, action: 'settings.update', decide: () => ({ kind: 'same' }), at: NOW, actor: actor() })).toEqual({
        ok: true,
        written: false,
      });
      expect(
        await store.change({
          key: SLA_DAYS_SETTING,
          action: 'settings.update',
          decide: () => ({ kind: 'reject', reason: 'changed', detail: { current: 3 } }),
          at: NOW,
          actor: actor(),
        }),
      ).toEqual({ ok: false, reason: 'changed', detail: { current: 3 } });
      expect(await valueOf(SLA_DAYS_SETTING)).toBe(3);
      expect(await eventsOf(SETTING_TARGET)).toEqual([
        { action: 'settings.update', targetId: SLA_DAYS_SETTING, detail: { key: SLA_DAYS_SETTING, from: 2, to: 3 }, adminUserId: sara },
      ]);
      expect(await store.read(SLA_DAYS_SETTING)).toBe(3);
      expect(await store.read('no.such.setting')).toBeUndefined();
    });

    it('«به‌روز شده» صفحه‌های ثابت (۷٫۴): دیرترین `updated_at` همین کلیدها؛ «همان» و کلید دیگر جلویش نمی‌برند، بی ردیف null', async () => {
      const store = createSettingsStore(conn);
      const keys = [SLA_DAYS_SETTING, FILES_RETENTION_SETTING];
      const [retention] = await conn.db.select({ value: settings.value }).from(settings).where(eq(settings.key, FILES_RETENTION_SETTING));
      // مقدارها همان می‌مانند (۲ از beforeEach، نگهداری از دادهٔ پایه)؛ فقط زمان نوشتن عوض می‌شود، با زمان صریح، نه now().
      const write = (key: string, value: unknown, at: Date, kind: 'write' | 'same' = 'write') =>
        store.change({
          key,
          action: 'settings.update',
          decide: () => (kind === 'write' ? { kind, value, detail: { key } } : { kind }),
          at,
          actor: actor(),
        });
      const T0 = new Date('2026-10-01T00:00:00Z');
      await conn.db.update(settings).set({ updatedAt: T0 }).where(inArray(settings.key, keys));
      expect(await settingsChangedAt(conn, keys)).toEqual(T0);

      await write(SLA_DAYS_SETTING, 2, new Date('2026-10-06T08:00:00Z'));
      expect(await settingsChangedAt(conn, keys)).toEqual(new Date('2026-10-06T08:00:00Z'));
      await write(FILES_RETENTION_SETTING, retention!.value, new Date('2026-10-07T08:00:00Z'));
      expect(await settingsChangedAt(conn, keys)).toEqual(new Date('2026-10-07T08:00:00Z'));
      // دیرترین، نه آخرین نوشته: کلید اول با زمان زودتر دوباره نوشته می‌شود و حکم همان می‌ماند.
      await write(SLA_DAYS_SETTING, 2, new Date('2026-10-06T09:00:00Z'));
      expect(await settingsChangedAt(conn, keys)).toEqual(new Date('2026-10-07T08:00:00Z'));
      expect(await settingsChangedAt(conn, [SLA_DAYS_SETTING])).toEqual(new Date('2026-10-06T09:00:00Z'));

      expect(await write(SLA_DAYS_SETTING, 2, new Date('2026-10-08T08:00:00Z'), 'same')).toEqual({ ok: true, written: false });
      await write(OTP_SITE_LIMIT_SETTING, 300, new Date('2026-10-09T08:00:00Z'));
      expect(await settingsChangedAt(conn, keys)).toEqual(new Date('2026-10-07T08:00:00Z'));

      expect(await settingsChangedAt(conn, ['no.such.setting'])).toBeNull();
      expect(await settingsChangedAt(conn, [])).toBeNull();
      expect(await valueOf(SLA_DAYS_SETTING)).toBe(2);
      expect(await valueOf(FILES_RETENTION_SETTING)).toEqual(retention!.value);
    });

    it('نوار اعلان (۱۱٫۳): دادهٔ پایه خاموش و بی متن، به شکل قرارداد؛ آخرین رویداد همین تنظیم با نام کننده، تازه‌تر به شناسه، و تنظیم دیگر نه', async () => {
      await conn.db.delete(settings).where(eq(settings.key, BAR_SETTING));
      const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(seeded.settingsInserted).toEqual([BAR_SETTING]);
      const off = { mode: 'off', from: null, until: null, text: '', href: '', linkText: '' };
      expect(await valueOf(BAR_SETTING)).toEqual(off);
      expect(await readSetting((key) => createSettingsStore(conn).read(key), BAR_SETTING)).toEqual(off);
      expect(DEFAULT_SETTINGS[BAR_SETTING]).toEqual(off);

      expect(await lastSettingEvent(conn, BAR_SETTING)).toBeNull();
      const store = createSettingsStore(conn);
      const on = { mode: 'always', from: null, until: null, text: 'سلام', href: '/contact', linkText: 'تماس' };
      const T1 = new Date('2026-10-05T06:35:00Z');
      expect(
        await store.change({
          key: BAR_SETTING,
          action: 'content.bar',
          at: T1,
          actor: actor(),
          decide: () => ({ kind: 'write', value: on, detail: { change: 'on', fresh: true, before: off, after: on } }),
        }),
      ).toEqual({ ok: true, written: true });
      expect(await valueOf(BAR_SETTING)).toEqual(on);
      expect(await lastSettingEvent(conn, BAR_SETTING)).toEqual({
        at: T1,
        by: 'سارا رضایی',
        action: 'content.bar',
        detail: { change: 'on', fresh: true, before: off, after: on },
      });
      // تنظیم دیگر جایش را نمی‌گیرد؛ دو رویداد در یک لحظه، تازه‌تر به شناسه؛ دستور سرور بی نام؛ جزئیات خراب، جزئیات خالی.
      await store.change({ key: SLA_DAYS_SETTING, action: 'settings.update', at: new Date(T1.getTime() + 60_000), actor: actor(), decide: () => ({ kind: 'write', value: 3, detail: {} }) });
      expect(await lastSettingEvent(conn, BAR_SETTING)).toMatchObject({ at: T1, action: 'content.bar' });
      await conn.db.insert(adminEvents).values({ adminUserId: null, action: 'content.bar', targetType: SETTING_TARGET, targetId: BAR_SETTING, detail: [1, 2], at: T1 });
      expect(await lastSettingEvent(conn, BAR_SETTING)).toEqual({ at: T1, by: null, action: 'content.bar', detail: {} });
      // هم‌لحظه، تازه‌تر به شناسه، نه به جای ردیف: شناسهٔ بزرگ‌تر پیش از کوچک‌تر نوشته می‌شود (رویداد پاک و عوض نمی‌شود، پس جای ردیف همان ترتیب نوشتن است).
      const T2 = new Date(T1.getTime() + 120_000);
      const [{ top }] = (await conn.db.execute(sql`SELECT max(id) + 1000000 AS top FROM admin_events`)) as unknown as [{ top: string }];
      await conn.db.insert(adminEvents).values({ id: Number(top), adminUserId: sara, action: 'content.bar', targetType: SETTING_TARGET, targetId: BAR_SETTING, detail: { n: 1 }, at: T2 });
      await conn.db.insert(adminEvents).values({ adminUserId: null, action: 'content.bar', targetType: SETTING_TARGET, targetId: BAR_SETTING, detail: { n: 2 }, at: T2 });
      expect(await lastSettingEvent(conn, BAR_SETTING)).toEqual({ at: T2, by: 'سارا رضایی', action: 'content.bar', detail: { n: 1 } });
      await conn.db.update(settings).set({ value: 2 }).where(eq(settings.key, SLA_DAYS_SETTING));
    });

    it('تنظیمی که ردیفش نیست با اولین نوشتن ساخته می‌شود', async () => {
      const store = createSettingsStore(conn);
      await conn.db.delete(settings).where(eq(settings.key, OTP_SITE_LIMIT_SETTING));
      const result = await store.change({
        key: OTP_SITE_LIMIT_SETTING,
        action: 'settings.update',
        decide: (current) => (current === undefined ? { kind: 'write', value: 500, detail: { to: 500 } } : { kind: 'reject', reason: 'x' }),
        at: NOW,
        actor: actor(),
      });
      expect(result).toEqual({ ok: true, written: true });
      expect(await valueOf(OTP_SITE_LIMIT_SETTING)).toBe(500);
    });

    it('هشت افزودن هم‌زمان تعطیلی، هر هشت می‌مانند: هر کدام فهرست تازه را زیر قفل می‌بیند، نه فهرست کهنه را', async () => {
      const store = createSettingsStore(conn);
      const dates = Array.from({ length: 8 }, (_, i) => `1406/09/${String(i + 1).padStart(2, '0')}`);
      const results = await Promise.all(
        dates.map((date) =>
          store.change({
            key: HOLIDAYS_SETTING,
            action: 'settings.holiday_add',
            decide: (current) => ({
              kind: 'write',
              value: [...(current as { date: string; title: string }[]), { date, title: 'آزمایش' }],
              detail: { date },
            }),
            at: NOW,
            actor: actor(),
          }),
        ),
      );
      expect(results.every((r) => r.ok && r.written)).toBe(true);
      const list = (await valueOf(HOLIDAYS_SETTING)) as { date: string }[];
      expect(list).toHaveLength(OFFICIAL_HOLIDAYS.length + 8);
      expect(dates.every((date) => list.some((h) => h.date === date))).toBe(true);
      expect(await eventsOf(SETTING_TARGET)).toHaveLength(8);
    });

    it('کلید پنل: مهروموم با نام، رویداد بی مقدار، و «همان که دیده شد» زیر قفل؛ برگرداندن به .env ردیف را پاک می‌کند', async () => {
      const store = createSecretStore(conn);
      const value = `kn-${randomUUID()}`;
      const sealed = seal(KEY, value, serviceKeyContext('SMS_API_KEY'));
      // دیده بود «مقدار پنلی نیست»، و نیست: نوشته می‌شود.
      expect(await store.put({ name: 'SMS_API_KEY', sealed, verify: (current) => current === null, at: NOW, actor: actor(), detail: { from: 'env' } })).toBe('ok');
      const [row] = await conn.db.select().from(serviceSecrets);
      expect(row).toEqual({ name: 'SMS_API_KEY', sealed, updatedAt: NOW, updatedBy: sara });
      expect(JSON.stringify(row)).not.toContain(value);
      expect(await store.list()).toEqual([{ name: 'SMS_API_KEY', sealed, updatedAt: NOW, updatedBy: { id: sara, name: 'سارا رضایی' } }]);
      expect(await store.read('PAYMENT_MERCHANT_ID')).toBeNull();

      // باز کردن با همان SECRETS_KEY، و بی آن یا با کلید دیگر «خوانده نشد»، نه .env و نه خالی.
      const logs: string[] = [];
      const env = { SMS_API_KEY: 'env-value-1234' };
      expect(resolveServiceKey('SMS_API_KEY', await store.read('SMS_API_KEY'), env, KEY, (m) => logs.push(m))).toMatchObject({ source: 'panel', value });
      expect(resolveServiceKey('SMS_API_KEY', await store.read('SMS_API_KEY'), env, Buffer.alloc(32, 7), (m) => logs.push(m))).toMatchObject({
        source: 'unreadable',
        value: null,
      });
      expect(logs.join('\n')).not.toContain(value);

      // دیده بود «مقدار پنلی نیست»، ولی حالا هست: نه نوشتن و نه رویداد.
      const other = seal(KEY, 'other-value-5678', serviceKeyContext('SMS_API_KEY'));
      expect(await store.put({ name: 'SMS_API_KEY', sealed: other, verify: (current) => current === null, at: NOW, actor: actor(), detail: {} })).toBe('changed');
      expect((await store.read('SMS_API_KEY'))!.sealed).toBe(sealed);
      expect(await store.remove({ name: 'SMS_API_KEY', verify: (current) => current === other, at: NOW, actor: actor(), detail: {} })).toBe('changed');

      expect(await store.remove({ name: 'SMS_API_KEY', verify: (current) => current === sealed, at: NOW, actor: actor(), detail: {} })).toBe('ok');
      expect(await store.list()).toEqual([]);
      expect(resolveServiceKey('SMS_API_KEY', await store.read('SMS_API_KEY'), env, KEY)).toEqual({ source: 'env', value: 'env-value-1234' });
      // دوباره پاک کردن چیزی را که نیست: «عوض شد»، بی رویداد.
      expect(await store.remove({ name: 'SMS_API_KEY', verify: () => true, at: NOW, actor: actor(), detail: {} })).toBe('changed');

      const events = await eventsOf(SERVICE_KEY_TARGET);
      expect(events).toEqual([
        { action: 'settings.key_set', targetId: 'SMS_API_KEY', detail: { from: 'env', name: 'SMS_API_KEY' }, adminUserId: sara },
        { action: 'settings.key_revert', targetId: 'SMS_API_KEY', detail: { name: 'SMS_API_KEY' }, adminUserId: sara },
      ]);
      expect(JSON.stringify(events)).not.toContain(value);
    });

    it('هشت نوشتن هم‌زمان یک کلید از یک دیده («مقدار پنلی نیست»): یکی می‌نشیند و بقیه «عوض شد»', async () => {
      const store = createSecretStore(conn);
      // اتصال‌ها از پیش باز، تا هشت تراکنش واقعاً هم‌زمان باشند، نه پشت‌سرهم با ساختن اتصال.
      await Promise.all(Array.from({ length: 8 }, () => conn.db.execute(sql`SELECT pg_sleep(0.02)`)));
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          store.put({
            name: 'PAYMENT_MERCHANT_ID',
            sealed: seal(KEY, `value-${i}-aaaa`, serviceKeyContext('PAYMENT_MERCHANT_ID')),
            verify: (current) => current === null,
            at: NOW,
            actor: actor(),
            detail: {},
          }),
        ),
      );
      expect(results.filter((r) => r === 'ok')).toHaveLength(1);
      expect(results.filter((r) => r === 'changed')).toHaveLength(7);
      expect(await eventsOf(SERVICE_KEY_TARGET)).toHaveLength(1);
    });

    it('پایگاه داده نام دیگری و مقدار خام را نمی‌پذیرد، و مقدار یک کلید در ردیف کلید دیگر باز نمی‌شود', async () => {
      const sealed = seal(KEY, 'value-1234', serviceKeyContext('SMS_API_KEY'));
      for (const name of ['CHECKOUT_MODE', 'SMS_PROVIDER', 'PAYMENT_PROVIDER', 'SECRETS_KEY', 'SESSION_SECRET', 'sms_api_key']) {
        expect(await rejectedConstraint(conn.db.insert(serviceSecrets).values({ name, sealed, updatedAt: NOW })), name).toBe('service_secrets_name');
      }
      for (const raw of ['kavenegar-api-key-1234', '', 'v1.short.x', `v2.${sealed.slice(3)}`]) {
        expect(await rejectedConstraint(conn.db.insert(serviceSecrets).values({ name: 'SMS_API_KEY', sealed: raw, updatedAt: NOW })), raw).toBe(
          'service_secrets_sealed',
        );
      }
      // مقدار مهروموم‌شدهٔ کلید API در ردیف کد پذیرنده: شکلش درست است، ولی باز نمی‌شود.
      await conn.db.insert(serviceSecrets).values({ name: 'PAYMENT_MERCHANT_ID', sealed, updatedAt: NOW });
      const store = createSecretStore(conn);
      expect(resolveServiceKey('PAYMENT_MERCHANT_ID', await store.read('PAYMENT_MERCHANT_ID'), {}, KEY, () => undefined)).toMatchObject({
        source: 'unreadable',
      });
    });

    it('دو کلید تازهٔ قالب (0027): پذیرفته، با جای مهروموم خودشان؛ شاهد: همان نام‌ها پیش از 0027 رد می‌شدند', async () => {
      for (const name of ['SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE'] as const) {
        const sealed = seal(KEY, '731058', serviceKeyContext(name));
        expect(await rejectedConstraint(conn.db.insert(serviceSecrets).values({ name, sealed, updatedAt: NOW })), name).toBeUndefined();
        expect(resolveServiceKey(name, await createSecretStore(conn).read(name), {}, KEY, () => undefined)).toMatchObject({ source: 'panel', value: '731058' });
      }
      expect(SERVICE_KEYS).toEqual([
        'SMS_API_KEY',
        'SMS_OTP_TEMPLATE',
        'SMS_PAID_TEMPLATE',
        'SMS_TRACKING_TEMPLATE',
        'SMS_PARTNER_TEMPLATE',
        'SMS_SUPPORT_TEMPLATE',
        'PAYMENT_MERCHANT_ID',
      ]);
      // CHECK همان نام‌های کد است (از ۷٫۶ شش، با قالب چاپخانه، و از ۱۲٫۱ هفت، با قالب پاسخ پشتیبانی)، نه بیشتر: نام تازه‌ای که کد
      // نمی‌شناسد در پایگاه داده هم جا ندارد.
      const [check] = await conn.db.execute<{ def: string }>(
        sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'service_secrets_name'`,
      );
      expect([...String(check!.def).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...SERVICE_KEYS].sort());
      // شاهد: CHECK پیش از 0027 همین دو را نمی‌پذیرفت (همان شرط، در تراکنشی که برمی‌گردد).
      const before = await conn.db
        .transaction(async (tx) => {
          await tx.execute(sql`ALTER TABLE service_secrets DROP CONSTRAINT service_secrets_name`);
          await tx.execute(sql`DELETE FROM service_secrets WHERE name IN ('SMS_PAID_TEMPLATE', 'SMS_TRACKING_TEMPLATE')`);
          await tx.execute(
            sql`ALTER TABLE service_secrets ADD CONSTRAINT service_secrets_name CHECK (name IN ('SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'PAYMENT_MERCHANT_ID'))`,
          );
          await tx.insert(serviceSecrets).values({ name: 'SMS_PAID_TEMPLATE', sealed: seal(KEY, '1', serviceKeyContext('SMS_PAID_TEMPLATE')), updatedAt: NOW });
        })
        .then(() => undefined, (error: unknown) => (error as { cause?: { constraint_name?: string } }).cause?.constraint_name);
      expect(before).toBe('service_secrets_name');
      expect(await createSecretStore(conn).read('SMS_PAID_TEMPLATE')).not.toBeNull();
    });

    it('«آزمایش» کلید (۷٫۱): رویداد با نتیجه و بی مقدار؛ سقف زیر قفل دقیق است؛ آخرین حال هر کلید', async () => {
      const store = createSecretStore(conn);
      const since = new Date(NOW.getTime() - 3_600_000);
      let calls = 0;
      const test = (name: 'SMS_API_KEY' | 'SMS_OTP_TEMPLATE', subject: 'current' | 'new', from = since) =>
        store.test({
          name,
          at: NOW,
          actor: actor(),
          since: from,
          limit: 3,
          run: async () => {
            calls += 1;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return { outcome: 'ok' as const };
          },
          detail: (result) => ({ subject, outcome: result.outcome }),
        });
      // پنج آزمایش هم‌زمان با سقف ۳: سه، و `run` هم فقط سه بار (شاهد: بی قفل هر پنج از شمارش می‌گذشتند).
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => test('SMS_API_KEY', 'current')));
      expect(results.filter((r) => r.ok)).toHaveLength(3);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'limited' }, { ok: false, reason: 'limited' }]);
      expect(calls).toBe(3);
      const log = await eventsOf(SERVICE_KEY_TARGET);
      expect(log.map((e) => [e.action, e.targetId, e.detail])).toEqual(
        [1, 2, 3].map(() => ['settings.key_test', 'SMS_API_KEY', { subject: 'current', outcome: 'ok', name: 'SMS_API_KEY' }]),
      );
      // آزمایش‌های بیرون از پنجره شمرده نمی‌شوند (رویداد عوض‌شدنی نیست، پس پنجره جلو می‌رود).
      expect((await test('SMS_OTP_TEMPLATE', 'new', NOW)).ok).toBe(true);

      // آخرین حال هر کلید: آزمایش مقدار امروز، گذاشتن یا برگرداندن؛ آزمایش مقدار تازه نه.
      expect((await store.lastChecks()).map((c) => [c.name, c.action, c.detail.subject])).toEqual([['SMS_API_KEY', 'settings.key_test', 'current']]);
      const sealed = seal(KEY, '482913', serviceKeyContext('SMS_OTP_TEMPLATE'));
      await store.put({ name: 'SMS_OTP_TEMPLATE', sealed, verify: () => true, at: NOW, actor: actor(), detail: { from: 'empty', tested: 'ok' } });
      const checks = await store.lastChecks();
      expect(checks.map((c) => [c.name, c.action, c.adminName, c.detail.tested ?? null])).toEqual([
        ['SMS_API_KEY', 'settings.key_test', 'سارا رضایی', null],
        ['SMS_OTP_TEMPLATE', 'settings.key_set', 'سارا رضایی', 'ok'],
      ]);
      expect(JSON.stringify(await eventsOf(SERVICE_KEY_TARGET))).not.toContain('482913');
    });
  });

  describe('ارسال: ورود فایل پست روی پستگرس (برش ۶٫۱)', () => {
    /** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
    const NOW = new Date('2026-10-05T07:50:00Z');
    const MINUTE = 60_000;
    const DAY = 86_400_000;
    const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);
    const END_MONDAY = tehran('2026-10-06 00:00');
    /** پایان یکشنبه 12 مهر به وقت تهران، یک ثانیه پیش از نیمه‌شب: زمان «تحویل پست شد» بسته‌ای که پست یکشنبه گرفت. */
    const END_SUNDAY = new Date('2026-10-04T20:29:59Z');
    const TEHRAN = { provinceId: 8, cityId: 394 };
    const MASHHAD = { provinceId: 11, cityId: 1326 };
    let owner = '';
    let operator = '';
    let docId = '';
    /** ردیف «منتظر» پیامک رهگیری به موبایل یک سفارش (۶٫۳): مرسولهٔ بی ذخیره‌گاه هم پیامک می‌خواهد (`shipments_sms`، 0026). */
    const pendingSms = async (orderId: string) => {
      const [order] = await conn.db.select({ phone: orders.recipientPhone }).from(orders).where(eq(orders.id, orderId));
      const [row] = await conn.db
        .insert(smsMessages)
        .values({ provider: 'queued', toMobile: order!.phone, purpose: 'tracking', body: 'ساختگی', status: 'pending' })
        .returning({ id: smsMessages.id });
      return row!.id;
    };
    let first = '';
    let files = 0;

    const store = () => createShipmentStore(conn);
    const panelStore = () => createPanelOrderStore(conn);
    const orderOf = async (id: string) => (await conn.db.select().from(orders).where(eq(orders.id, id)))[0]!;
    const importOf = async (id: string) => (await conn.db.select().from(shipmentImports).where(eq(shipmentImports.id, id)))[0]!;
    const statusRows = (id: string) =>
      conn.db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, id)).orderBy(orderStatusEvents.id);
    const shipmentsOf = (orderId: string) =>
      conn.db.select().from(shipments).where(eq(shipments.orderId, orderId)).orderBy(shipments.createdAt, shipments.rowNo);

    /**
     * سفارش پرداخت‌شده (شنبه 11 مهر) همان‌طور که سرور می‌سازد؛ چاپخانه با تخصیص پرداخت. `settle: false`: هنوز پرداخت‌نشده (۶٫۲).
     * `paidAt`: روز دیگری، برای بسته‌ای که پست پیش از 11 مهر گرفت (گزارش ۶٫۴، مرز ماه)؛ مهلتش سه روز بعد.
     */
    async function paidOrder(
      place: { provinceId: number; cityId: number },
      name: string,
      { settle = true, paidAt }: { settle?: boolean; paidAt?: Date } = {},
    ) {
      const zoneId = place.provinceId === 8 ? 'tehran' : 'other';
      const sections = [{ documentId: docId, pageCount: 20 }];
      const rules = [{ pageRanges: [[1, 20]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const breakdown = quote(
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
        SEED_PRICE_LIST,
      );
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: '09152345678' })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const orderStore = createOrderStore(conn);
      const { order } = await orderStore.createOrder({
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: null,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: zoneId,
        provinceId: place.provinceId,
        cityId: place.cityId,
        recipientName: name,
        recipientPhone: '09152345678',
        addressText: 'بلوار سجاد، سجاد 18، پلاک 42',
        postalCode: null,
        items: [{ pageCount: 20, copies: 1, sidesMode: 'double', paperSize: 'a4', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      const payment = await orderStore.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      if (!settle) return order;
      const settled = await orderStore.settlePayment('mock', payment.authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt: paidAt ?? tehran('2026-10-03 10:00'),
        postHandoffDueAt: paidAt ? new Date(paidAt.getTime() + 3 * DAY) : END_MONDAY,
      }));
      return settled!.order;
    }

    /** تغییر وضعیت ادمین از پنل، با رویدادش. */
    const change = (order: { id: string }, from: OrderStatus, to: OrderStatus, reason: string | null = null) =>
      panelStore().changeStatus(ALL_ORDERS, {
        orderId: order.id,
        from,
        to,
        at: NOW,
        adminUserId: owner,
        note: reason ? { reason } : null,
        event: { adminUserId: owner, action: 'orders.status', targetType: 'order', targetId: order.id, at: NOW },
      });

    async function printingOrder(place: { provinceId: number; cityId: number }, name: string, options: { paidAt?: Date } = {}) {
      const order = await paidOrder(place, name, options);
      expect((await change(order, 'paid', 'printing')).ok).toBe(true);
      return order;
    }

    async function handedOrder(place: { provinceId: number; cityId: number }, name: string) {
      const order = await printingOrder(place, name);
      expect((await change(order, 'printing', 'handed_to_post')).ok).toBe(true);
      return orderOf(order.id);
    }

    /** بارگذاری، و «خوانده شد» مثل کارگر: بایت خام یکتا (یا همان که داده شد)، و جدول‌ها. */
    async function readImport(rows: string[][], { scope = ALL_ORDERS as PanelScope, raw }: { scope?: PanelScope; raw?: Buffer } = {}) {
      files += 1;
      const created = await store().createImport(scope, {
        filename: `FileName-${1950 + files}.xls`,
        raw: raw ?? Buffer.from(`<table><tr><td>${files}</td></tr></table>`),
        createdBy: operator,
        at: NOW,
        event: { adminUserId: operator, action: 'shipments.upload', at: NOW },
      });
      if (!created.ok) throw new Error('same_file');
      await conn.db
        .update(shipmentImports)
        .set({ status: 'read', format: 'html', tables: [postTable(rows)], readAt: NOW })
        .where(eq(shipmentImports.id, created.id));
      return created.id;
    }

    async function previewOf(id: string, scope: PanelScope = ALL_ORDERS, at = NOW) {
      const page = await store().importPage(scope, id, at);
      if (page?.kind !== 'preview') throw new Error(`پیش‌نمایش نیست: ${page?.kind}`);
      return page.preview;
    }

    async function commit(id: string, { scope = ALL_ORDERS as PanelScope, fingerprint }: { scope?: PanelScope; fingerprint?: string } = {}) {
      const seen = fingerprint ?? (await previewOf(id, scope)).fingerprint;
      return store().commit(scope, {
        id,
        fingerprint: seen,
        at: NOW,
        adminUserId: operator,
        event: { adminUserId: operator, action: 'shipments.commit', at: NOW },
      });
    }

    const revert = (id: string, reason = 'فایل روز اشتباه بود؛ فایل یکشنبه را جایش می‌آورم.') =>
      store().revert(ALL_ORDERS, { id, reason, at: NOW, adminUserId: owner, event: { adminUserId: owner, action: 'shipments.revert', at: NOW } });

    /** یک بسته برای سفارش، با نام خانوادگی و شمارهٔ برچسب برگه. */
    const row = (n: number, barcode: string, nameG: string, destination = 'تهران', over: Parameters<typeof parcel>[6] = {}) =>
      parcel(n, barcode, nameG, destination, 820 + n, 1_295_000, over);

    async function reset() {
      await clearOrders(conn);
      await conn.db.execute(sql`TRUNCATE shipments, shipment_import_rows, shipment_imports, admin_events, jobs`);
      await conn.db.execute(sql`TRUNCATE print_partners CASCADE`);
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      first = (await conn.db.select({ id: printPartners.id }).from(printPartners))[0]!.id;
    }

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await reset();
      const admins = createAdminStore(conn);
      const make = async (username: string, displayName: string, role: 'owner' | 'operator') => {
        const created = await admins.createInvite({
          inviteId: randomUUID(),
          newUserId: randomUUID(),
          username,
          displayName,
          role,
          tokenHash: randomUUID().replace(/-/g, '').repeat(2),
          totpSealed: 'v1.sealed',
          at: NOW,
          expiresAt: new Date(NOW.getTime() + 15 * MINUTE),
          createdBy: null,
          allowExisting: false,
          event: { adminUserId: null, action: 'admins.invite', targetType: 'admin' },
        });
        if (!created.ok) throw new Error(created.reason);
        return created.userId;
      };
      owner = await make('sara', 'سارا رضایی', 'owner');
      operator = await make('ali', 'علی محمدی', 'operator');
      const documentStore = createDocumentStore(conn);
      docId = randomUUID();
      await documentStore.insertUpload({
        id: docId,
        sessionHash: 'e'.repeat(64),
        originalName: 'ریاضی ۲.pdf',
        sourceKind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_000,
        storageKey: `uploads/${docId}.pdf`,
        uploadId: 'u',
        partSizeBytes: 8 * 1024 * 1024,
      });
      await documentStore.markUploaded(docId, NOW, new Date(NOW.getTime() + 2 * DAY), null);
      await conn.db.update(documents).set({ status: 'ready', pageCount: 20 }).where(eq(documents.id, docId));
    });

    beforeEach(async () => {
      await reset();
    });

    afterAll(async () => {
      await reset();
    });

    it('بارگذاری: بایت خام و sha256، کار خواندن و رویداد در یک تراکنش؛ همان فایل تا زنده است یک بار، هم‌زمان هم', async () => {
      const raw = Buffer.from('<table><tr><td>بارکد</td></tr></table>');
      const created = await store().createImport(ALL_ORDERS, {
        filename: 'FileName-1954.xls',
        raw,
        createdBy: operator,
        at: NOW,
        event: { adminUserId: operator, action: 'shipments.upload', ipHash: 'ip', at: NOW },
      });
      expect(created.ok).toBe(true);
      const id = created.ok ? created.id : '';
      const imported = await importOf(id);
      expect(imported).toMatchObject({ status: 'reading', carrier: 'iran_post', sizeBytes: raw.length, printPartnerId: null, createdBy: operator });
      expect(Buffer.compare(imported.raw!, raw)).toBe(0);
      expect(imported.sha256).toBe(createHash('sha256').update(raw).digest('hex'));
      const [job] = await conn.db.select().from(jobs).where(eq(jobs.shipmentImportId, id));
      expect(job).toMatchObject({ kind: READ_POST_FILE_JOB, status: 'queued', documentId: null, orderId: null });
      const [event] = await conn.db.select().from(adminEvents).where(eq(adminEvents.targetId, id));
      expect(event).toMatchObject({ action: 'shipments.upload', targetType: 'shipment_import', adminUserId: operator, ipHash: 'ip' });
      expect(event!.detail).toMatchObject({ filename: 'FileName-1954.xls', sizeBytes: raw.length });

      // همان بایت‌ها، با هر نامی: همان ورود.
      const again = await store().createImport(ALL_ORDERS, { filename: 'copy.xls', raw, createdBy: owner, at: NOW, event: { adminUserId: owner, action: 'shipments.upload', at: NOW } });
      expect(again).toMatchObject({ ok: false, reason: 'same_file', existing: { id, filename: 'FileName-1954.xls', createdByName: 'علی محمدی' } });
      // هم‌زمان: یکی ساخته می‌شود و بقیه همان را می‌بینند.
      const other = Buffer.from('<table><tr><td>دیگر</td></tr></table>');
      const results = await Promise.all(
        [1, 2, 3, 4].map(() =>
          store().createImport(ALL_ORDERS, { filename: 'b.xls', raw: other, createdBy: operator, at: NOW, event: { adminUserId: operator, action: 'shipments.upload', at: NOW } }),
        ),
      );
      const made = results.filter((r) => r.ok);
      expect(made).toHaveLength(1);
      const madeId = made[0]!.ok ? made[0]!.id : '';
      expect(results.filter((r) => !r.ok && r.existing?.id === madeId)).toHaveLength(3);
      expect(await conn.db.select().from(jobs).where(eq(jobs.shipmentImportId, madeId))).toHaveLength(1);
      // پایگاه داده هم، بی ذخیره‌گاه؛ و کار دوم برای همان ورود نه.
      expect(
        await rejectedConstraint(
          conn.db.insert(shipmentImports).values({ carrier: 'iran_post', filename: 'x.xls', sizeBytes: raw.length, sha256: imported.sha256, createdBy: operator }),
        ),
      ).toBe('shipment_imports_one_file');
      expect(await rejectedConstraint(conn.db.insert(jobs).values({ kind: READ_POST_FILE_JOB, shipmentImportId: id }))).toBe('jobs_shipment_import_kind');
      expect(await rejectedConstraint(conn.db.insert(jobs).values({ kind: READ_POST_FILE_JOB, shipmentImportId: id, orderId: randomUUID() }))).toBe(
        'jobs_one_target',
      );
    });

    it('پیش‌نمایش و «ثبت»: قطعی مرسوله می‌شود و «در حال چاپ» تا پایان روز پست «تحویل پست شد»؛ بقیه فقط سطر با حکمش', async () => {
      const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
      const rahmani = await handedOrder(TEHRAN, 'نگار رحمانی');
      const queued = await paidOrder(TEHRAN, 'زهرا محمدی');
      const cancelled = await printingOrder(TEHRAN, 'امین قاسمی');
      expect((await change(cancelled, 'printing', 'cancelled', 'مشتری نخواست')).ok).toBe(true);
      const id = await readImport([
        row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`),
        row(2, barcodeOf(2), `رحمانی ${rahmani.orderNumber}`),
        row(3, barcodeOf(3), `محمدی ${queued.orderNumber}`),
        row(4, barcodeOf(4), `قاسمی ${cancelled.orderNumber}`),
        row(5, barcodeOf(5), 'کریمی 10099'),
        row(6, barcodeOf(6), 'احمدی'),
        row(7, barcodeOf(7), 'طهماسبی 6103', 'مشهد'),
        row(8, '1.18832198006261E+23', `طاهری ${taheri.orderNumber}`),
        row(9, barcodeOf(9), `طاهری ${taheri.orderNumber}`, 'تهران', { status: 'باطل' }),
      ]);
      const preview = await previewOf(id);
      expect(preview.judged.map((j) => [j.rowNo, j.verdict, j.reason])).toEqual([
        [1, 'matched', null],
        [2, 'matched', null],
        [3, 'review', 'queued'],
        [4, 'review', 'cancelled'],
        [5, 'unmatched', 'not_found'],
        [6, 'unmatched', 'no_number'],
        [7, 'unmatched', 'manual_code'],
        [8, 'invalid', 'barcode'],
        [9, 'inactive', 'inactive'],
      ]);
      expect(preview.judged.filter((j) => j.handOver).map((j) => j.orderId)).toEqual([taheri.id]);
      // پیش‌نمایش چیزی نمی‌نویسد.
      expect(await conn.db.select().from(shipmentImportRows)).toHaveLength(0);
      expect((await orderOf(taheri.id)).status).toBe('printing');

      const written = await commit(id, { fingerprint: preview.fingerprint });
      expect(written).toEqual({
        ok: true,
        counts: { matched: 2, review: 2, unmatched: 3, invalid: 1, inactive: 1 },
        shipments: 2,
        handed: [taheri.orderNumber],
        sms: [expect.any(Number), expect.any(Number)],
      });
      expect(await importOf(id)).toMatchObject({ status: 'committed', committedBy: operator, committedAt: NOW });
      const stored = await conn.db.select().from(shipmentImportRows).where(eq(shipmentImportRows.importId, id)).orderBy(shipmentImportRows.rowNo);
      expect(stored.map((r) => [r.rowNo, r.verdict, r.orderId])).toEqual([
        [1, 'matched', taheri.id],
        [2, 'matched', rahmani.id],
        [3, 'review', queued.id],
        [4, 'review', cancelled.id],
        [5, 'unmatched', null],
        [6, 'unmatched', null],
        [7, 'unmatched', null],
        [8, 'invalid', null],
        [9, 'inactive', null],
        [10, 'total', null],
      ]);
      expect(stored[7]).toMatchObject({ barcode: null, cells: expect.arrayContaining(['1.18832198006261E+23 ']) });
      // «جمع کل» با جمع‌های خودش: وزن‌ها 821 تا 829 گرم.
      expect(stored[9]).toMatchObject({ weightGrams: 7425, fareRials: 9 * 1_295_000, taxRials: 9 * 129_500 });

      // «در حال چاپ» ← «تحویل پست شد» با روز فایل (یکشنبه)، نه لحظهٔ ثبت؛ رویداد وضعیت با ثبت‌کننده و یادداشت «فایل پست».
      expect(await orderOf(taheri.id)).toMatchObject({ status: 'handed_to_post', handedToPostAt: END_SUNDAY });
      const moved = (await statusRows(taheri.id)).at(-1)!;
      expect(moved).toMatchObject({ fromStatus: 'printing', toStatus: 'handed_to_post', actor: 'admin', adminUserId: operator, at: NOW });
      expect(moved.note).toMatchObject({ source: 'post_file', importId: id, filename: expect.stringMatching(/^FileName-/) });
      // «تحویل پست شد»ی که پیش‌تر خورده بود دست نمی‌خورد، زمانش هم.
      expect(await orderOf(rahmani.id)).toMatchObject({ status: 'handed_to_post', handedToPostAt: rahmani.handedToPostAt });
      expect(await orderOf(queued.id)).toMatchObject({ status: 'paid' });
      expect((await shipmentsOf(taheri.id)).map((s) => [s.barcode, s.handedOrder, s.matchedBy, s.weightGrams, s.fareRials, s.taxRials])).toEqual([
        [barcodeOf(1), true, 'rule', 821, 1_295_000, 129_500],
      ]);
      expect((await shipmentsOf(rahmani.id)).map((s) => [s.barcode, s.handedOrder])).toEqual([[barcodeOf(2), false]]);
      const [event] = await conn.db.select().from(adminEvents).where(and(eq(adminEvents.targetId, id), eq(adminEvents.action, 'shipments.commit')));
      expect(event!.detail).toMatchObject({ shipments: 2, handed: [taheri.orderNumber], counts: { matched: 2, review: 2 } });

      // صفحهٔ ورود ثبت‌شده، فهرست ورودها، جزئیات سفارش و جست‌وجو با کد رهگیری.
      const page = await store().importPage(ALL_ORDERS, id, NOW);
      expect(page?.kind).toBe('committed');
      if (page?.kind === 'committed') {
        expect(page.committed.rows).toHaveLength(10);
        expect(page.committed.shipments.map((s) => [s.rowNo, s.handedOrder, s.voidedAt])).toEqual([
          [1, true, null],
          [2, false, null],
        ]);
        expect(page.committed.orders.map((o) => o.orderNumber).sort()).toEqual(
          [taheri.orderNumber, rahmani.orderNumber, queued.orderNumber, cancelled.orderNumber].sort(),
        );
      }
      const [line] = await store().listImports(ALL_ORDERS, { limit: 10, offset: 0 });
      expect(line).toMatchObject({
        id,
        status: 'committed',
        committedByName: 'علی محمدی',
        counts: { matched: 2, review: 2, unmatched: 3, invalid: 1, inactive: 1, total: 1 },
        liveShipments: 2,
        voidedShipments: 0,
        handedOrders: 1,
        firstPostDay: tehran('2026-10-04 00:00'),
        lastPostDay: tehran('2026-10-04 00:00'),
      });
      const details = await panelStore().details(ALL_ORDERS, taheri.orderNumber);
      expect(details!.shipments).toMatchObject([{ barcode: barcodeOf(1), handedOrder: true, adminName: 'علی محمدی', rowNo: 1, voidedAt: null }]);
      const search: PanelSearch = { kind: 'barcode', barcode: barcodeOf(1) };
      const clock: PanelClock = { at: NOW, staleBefore: NOW, unreturnedBefore: NOW, untrackedSince: NOW };
      expect((await panelStore().list(ALL_ORDERS, { bucket: 'all', search, clock, limit: 10, offset: 0 })).map((o) => [o.id, o.handedByFile])).toEqual([
        [taheri.id, true],
      ]);
      // «تحویل پست شد»ی که پیش از فایل دستی خورده بود کار فایل نیست: ساعتش واقعی است و نشان داده می‌شود.
      const manual: PanelSearch = { kind: 'barcode', barcode: barcodeOf(2) };
      expect((await panelStore().list(ALL_ORDERS, { bucket: 'all', search: manual, clock, limit: 10, offset: 0 })).map((o) => [o.id, o.handedByFile])).toEqual([
        [rahmani.id, false],
      ]);
    });

    it('فایل هم‌پوشان: همان کد برای همان سفارش «تکراری» و مرسولهٔ دوم نمی‌سازد؛ همان کد برای سفارش دیگر صف تأیید؛ چند بسته برای یک سفارش', async () => {
      const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
      const sharifi = await printingOrder(TEHRAN, 'امید شریفی');
      expect((await commit(await readImport([row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`)]))).ok).toBe(true);
      const second = await readImport([
        row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`),
        row(2, barcodeOf(1), `شریفی ${sharifi.orderNumber}`),
        row(3, barcodeOf(3), `طاهری ${taheri.orderNumber}`),
        row(4, barcodeOf(3), `طاهری ${taheri.orderNumber}`),
      ]);
      const preview = await previewOf(second);
      expect(preview.judged.map((j) => [j.verdict, j.reason, j.orderId, j.handOver])).toEqual([
        ['duplicate', 'already', taheri.id, false],
        ['duplicate', 'same_file', null, false],
        ['matched', null, taheri.id, false],
        ['duplicate', 'same_file', null, false],
      ]);
      expect(preview.live).toMatchObject([{ barcode: barcodeOf(1), orderId: taheri.id, orderNumber: taheri.orderNumber }]);
      // همان کد با سفارش دیگر در فایل دیگر: صف تأیید، نه مرسولهٔ دوم.
      const third = await readImport([row(1, barcodeOf(1), `شریفی ${sharifi.orderNumber}`)]);
      expect((await previewOf(third)).judged.map((j) => [j.verdict, j.reason, j.orderId])).toEqual([['review', 'barcode_elsewhere', sharifi.id]]);
      expect((await commit(second)).ok).toBe(true);
      expect((await commit(third)).ok).toBe(true);
      // دو بسته برای طاهری (جلدها در دو پاکت)، هیچ برای شریفی؛ «تحویل پست شد» فقط با اولی.
      expect((await shipmentsOf(taheri.id)).map((s) => [s.barcode, s.handedOrder])).toEqual([
        [barcodeOf(1), true],
        [barcodeOf(3), false],
      ]);
      expect(await shipmentsOf(sharifi.id)).toHaveLength(0);
      expect((await orderOf(sharifi.id)).status).toBe('printing');
      const page = await store().importPage(ALL_ORDERS, second, NOW);
      expect(page?.kind === 'committed' && page.committed.elsewhere.map((s) => [s.barcode, s.orderNumber])).toEqual([[barcodeOf(1), taheri.orderNumber]]);
    });

    it('«ثبت» همان که دیده شد: اثر انگشت کهنه «changed»؛ دو «ثبت» هم‌زمان یک بار؛ دو فایل هم‌پوشان هم‌زمان یکی', async () => {
      const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
      const first = await readImport([row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`)]);
      const seen = (await previewOf(first)).fingerprint;
      // سفارش همین حالا با دکمه «تحویل پست شد» شد: حکم همان «قطعی» است، ولی دیگر «تحویل پست شد» نمی‌کند.
      expect((await change(taheri, 'printing', 'handed_to_post')).ok).toBe(true);
      expect(await commit(first, { fingerprint: seen })).toEqual({ ok: false, reason: 'changed' });
      expect((await importOf(first)).status).toBe('read');
      expect(await conn.db.select().from(shipmentImportRows)).toHaveLength(0);
      // پیش‌نمایش تازه، دو «ثبت» هم‌زمان: یکی.
      const fresh = (await previewOf(first)).fingerprint;
      const both = await Promise.all([commit(first, { fingerprint: fresh }), commit(first, { fingerprint: fresh })]);
      expect(both.filter((r) => r.ok)).toHaveLength(1);
      expect(both.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'status', status: 'committed' }]);
      expect(await shipmentsOf(taheri.id)).toHaveLength(1);

      // دو فایل هم‌پوشان، هر کدام پیش‌نمایشش «قطعی»: اولی می‌نشیند، دومی پیش‌نمایش تازه می‌خواهد و بعد «تکراری» است.
      const sharifi = await printingOrder(TEHRAN, 'امید شریفی');
      const a = await readImport([row(1, barcodeOf(2), `شریفی ${sharifi.orderNumber}`)]);
      const b = await readImport([row(1, barcodeOf(2), `شریفی ${sharifi.orderNumber}`), row(2, barcodeOf(4), 'کریمی 10099')]);
      const [seenA, seenB] = [(await previewOf(a)).fingerprint, (await previewOf(b)).fingerprint];
      const race = await Promise.all([commit(a, { fingerprint: seenA }), commit(b, { fingerprint: seenB })]);
      expect(race.filter((r) => r.ok)).toHaveLength(1);
      expect(race.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'changed' }]);
      expect(await shipmentsOf(sharifi.id)).toHaveLength(1);
      const loser = race[0]!.ok ? b : a;
      expect((await previewOf(loser)).judged[0]).toMatchObject({ verdict: 'duplicate', reason: 'already' });

      // همان کد برای دو سفارش در دو فایل، هم‌زمان: قفل سفارش مشترکی نیست، ایندکس یکتای کدهای زنده یکی را نگه می‌دارد.
      const kazemi = await printingOrder(TEHRAN, 'آرش کاظمی');
      const farhadi = await printingOrder(TEHRAN, 'یاسمن فرهادی');
      const c = await readImport([row(1, barcodeOf(5), `کاظمی ${kazemi.orderNumber}`)]);
      const d = await readImport([row(1, barcodeOf(5), `فرهادی ${farhadi.orderNumber}`)]);
      const [seenC, seenD] = [(await previewOf(c)).fingerprint, (await previewOf(d)).fingerprint];
      const clash = await Promise.all([commit(c, { fingerprint: seenC }), commit(d, { fingerprint: seenD })]);
      expect(clash.filter((r) => r.ok)).toHaveLength(1);
      expect(clash.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'changed' }]);
      expect([...(await shipmentsOf(kazemi.id)), ...(await shipmentsOf(farhadi.id))]).toHaveLength(1);
    });

    it('«ثبت» هم‌زمان با «تحویل پست شد» دستی: فقط یکی، و سفارش یک بار «تحویل پست شد»', async () => {
      for (let round = 0; round < 3; round += 1) {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const id = await readImport([row(1, barcodeOf(10 + round), `طاهری ${taheri.orderNumber}`)]);
        const seen = (await previewOf(id)).fingerprint;
        const [written, button] = await Promise.all([commit(id, { fingerprint: seen }), change(taheri, 'printing', 'handed_to_post')]);
        expect([written.ok, button.ok].filter(Boolean)).toHaveLength(1);
        const moves = (await statusRows(taheri.id)).filter((e) => e.toStatus === 'handed_to_post');
        expect(moves).toHaveLength(1);
        expect((await orderOf(taheri.id)).status).toBe('handed_to_post');
        if (!written.ok) {
          expect(written).toEqual({ ok: false, reason: 'changed' });
          // پیش‌نمایش تازه: همان کد، بی «تحویل پست شد».
          expect((await previewOf(id)).judged[0]).toMatchObject({ verdict: 'matched', handOver: false });
        }
      }
    });

    it('برگرداندن: کدها کنار می‌روند؛ سفارشی که همین ورود تحویل پست کرد به «در حال چاپ» برمی‌گردد، مگر کد زندهٔ دیگری دارد؛ یک بار؛ همان فایل دوباره', async () => {
      const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
      const rahmani = await handedOrder(TEHRAN, 'نگار رحمانی');
      const sharifi = await printingOrder(TEHRAN, 'امید شریفی');
      const raw = Buffer.from('<table><tr><td>FileName-1981</td></tr></table>');
      const id = await readImport(
        [row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`), row(2, barcodeOf(2), `رحمانی ${rahmani.orderNumber}`), row(3, barcodeOf(3), `شریفی ${sharifi.orderNumber}`)],
        { raw },
      );
      expect(await commit(id)).toMatchObject({ ok: true, handed: [taheri.orderNumber, sharifi.orderNumber].sort((x, y) => x - y) });
      // شریفی بستهٔ دومی هم در فایل دیگری دارد: با برگرداندن اولی «تحویل پست شد» می‌ماند.
      const other = await readImport([row(1, barcodeOf(4), `شریفی ${sharifi.orderNumber}`)]);
      expect(await commit(other)).toMatchObject({ ok: true, shipments: 1, handed: [] });

      const reverted = await revert(id);
      expect(reverted).toEqual({ ok: true, voided: 3, reopened: [taheri.orderNumber], kept: [sharifi.orderNumber], unqueued: 0 });
      expect(await importOf(id)).toMatchObject({ status: 'reverted', revertedBy: owner, revertedAt: NOW });
      expect(await orderOf(taheri.id)).toMatchObject({ status: 'printing', handedToPostAt: null });
      const back = (await statusRows(taheri.id)).at(-1)!;
      expect(back).toMatchObject({ fromStatus: 'handed_to_post', toStatus: 'printing', adminUserId: owner });
      expect(back.note).toMatchObject({ reason: 'فایل روز اشتباه بود؛ فایل یکشنبه را جایش می‌آورم.', source: 'post_file_revert', importId: id });
      // «تحویل پست شد»ی که پیش از ورود بود و «تحویل پست شد»ی که کد دیگری دارد، همان‌اند.
      expect((await orderOf(rahmani.id)).status).toBe('handed_to_post');
      expect((await orderOf(sharifi.id)).status).toBe('handed_to_post');
      expect((await shipmentsOf(taheri.id)).map((s) => [s.voidedBy, s.voidReason])).toEqual([[owner, 'فایل روز اشتباه بود؛ فایل یکشنبه را جایش می‌آورم.']]);
      expect((await shipmentsOf(sharifi.id)).map((s) => [s.barcode, s.voidedAt === null]).sort()).toEqual([
        [barcodeOf(3), false],
        [barcodeOf(4), true],
      ]);
      const [event] = await conn.db.select().from(adminEvents).where(and(eq(adminEvents.targetId, id), eq(adminEvents.action, 'shipments.revert')));
      expect(event!.detail).toMatchObject({ voided: 3, reopened: [taheri.orderNumber], kept: [sharifi.orderNumber] });
      // سطرها و فایل خام برای سابقه می‌مانند؛ یک بار؛ و همان فایل دوباره واردشدنی است.
      expect(await conn.db.select().from(shipmentImportRows).where(eq(shipmentImportRows.importId, id))).toHaveLength(4); // سه بسته و «جمع کل»
      expect((await importOf(id)).raw).not.toBeNull();
      expect(await revert(id)).toEqual({ ok: false, reason: 'status', status: 'reverted' });
      const again = await store().createImport(ALL_ORDERS, { filename: 'FileName-1981.xls', raw, createdBy: operator, at: NOW, event: { adminUserId: operator, action: 'shipments.upload', at: NOW } });
      expect(again.ok).toBe(true);
      // برگرداندن وضعیت سفارشی که کد زنده دارد: پایگاه داده نمی‌گذارد.
      expect(await change(sharifi, 'handed_to_post', 'printing', 'اشتباه')).toEqual({ ok: false, current: 'handed_to_post', hasShipment: true });
      expect((await orderOf(sharifi.id)).status).toBe('handed_to_post');
      // شاهد: سفارشی که کد زنده ندارد برمی‌گردد.
      expect((await shipmentsOf(rahmani.id)).every((s) => s.voidedAt !== null)).toBe(true);
      expect((await change(rahmani, 'handed_to_post', 'printing', 'اشتباه')).ok).toBe(true);
      expect((await orderOf(rahmani.id)).status).toBe('printing');
      // «تحویل پست شد» دستی پس از برگرداندن کار فایل نیست، هرچند کد کنارگذاشته‌اش `handed_order` دارد: ساعتش واقعی است.
      expect((await change(taheri, 'printing', 'handed_to_post')).ok).toBe(true);
      const clock: PanelClock = { at: NOW, staleBefore: NOW, unreturnedBefore: NOW, untrackedSince: NOW };
      const search: PanelSearch = { kind: 'barcode', barcode: barcodeOf(1) };
      expect((await panelStore().list(ALL_ORDERS, { bucket: 'all', search, clock, limit: 10, offset: 0 })).map((o) => [o.id, o.handedByFile])).toEqual([
        [taheri.id, false],
      ]);
    });

    it('دور بینداز: فقط پیش از «ثبت»؛ بایت خام و جدول‌ها پاک؛ همان فایل دوباره واردشدنی', async () => {
      const raw = Buffer.from('<table><tr><td>discard</td></tr></table>');
      const id = await readImport([row(1, barcodeOf(1), 'کریمی 10099')], { raw });
      const discard = (target: string) =>
        store().discard(ALL_ORDERS, { id: target, at: NOW, adminUserId: operator, event: { adminUserId: operator, action: 'shipments.discard', at: NOW } });
      expect(await discard(id)).toEqual({ ok: true });
      expect(await importOf(id)).toMatchObject({ status: 'discarded', raw: null, tables: null, purgedAt: NOW, discardedBy: operator });
      expect(await discard(id)).toEqual({ ok: false, reason: 'status', status: 'discarded' });
      expect(await commit(id, { fingerprint: 'x' })).toEqual({ ok: false, reason: 'status', status: 'discarded' });
      expect(await store().importPage(ALL_ORDERS, id, NOW)).toMatchObject({ kind: 'plain', import: { status: 'discarded', discardedByName: 'علی محمدی' } });
      const again = await readImport([row(1, barcodeOf(1), 'کریمی 10099')], { raw });
      expect(await commit(again)).toMatchObject({ ok: true, shipments: 0 });
      expect(await discard(again)).toEqual({ ok: false, reason: 'status', status: 'committed' });
      expect(await discard(randomUUID())).toEqual({ ok: false, reason: 'not_found' });
    });

    it('محافظ‌ها: گذار وضعیت ورود، ستون‌های منجمد، سطر و کد فقط افزودنی، و کد زنده فقط در «تحویل پست شد» از هر دو سو', async () => {
      const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
      const id = await readImport([row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`), row(2, barcodeOf(2), 'کریمی 10099')]);
      const setImport = (values: Partial<typeof shipmentImports.$inferInsert>, target = id) =>
        rejectedConstraint(conn.db.update(shipmentImports).set(values).where(eq(shipmentImports.id, target)));
      // سطر فقط برای ورود ثبت‌شده، و مرسوله هم.
      expect(
        await rejectedConstraint(conn.db.insert(shipmentImportRows).values({ importId: id, rowNo: 1, verdict: 'unmatched' })),
      ).toBe('shipment_import_rows_committed');
      expect(await setImport({ status: 'reverted', revertedAt: NOW, revertedBy: owner, revertReason: 'x' })).toBe('shipment_imports_flow');
      expect(await setImport({ filename: 'دیگر.xls' })).toBe('shipment_imports_frozen');
      expect(await setImport({ raw: Buffer.from('<table><tr><td>2</td></tr></table>') })).toBe('shipment_imports_frozen');
      expect(await setImport({ tables: [[['x']]] })).toBe('shipment_imports_frozen');
      expect(await rejectedConstraint(conn.db.delete(shipmentImports).where(eq(shipmentImports.id, id)))).toBe('shipment_imports_no_delete');
      expect((await commit(id)).ok).toBe(true);

      const setRow = (values: Partial<typeof shipmentImportRows.$inferInsert>, rowNo: number) =>
        rejectedConstraint(
          conn.db.update(shipmentImportRows).set(values).where(and(eq(shipmentImportRows.importId, id), eq(shipmentImportRows.rowNo, rowNo))),
        );
      expect(await setRow({ verdict: 'review' }, 1)).toBe('shipment_import_rows_frozen');
      expect(await setRow({ nameG: null }, 1)).toBe('shipment_import_rows_frozen');
      // شاهد: متن سطری که مرسولهٔ ما نشد پاک می‌شود (نگهداری، کارگر)، فقط پاک.
      expect(await setRow({ nameG: null, cells: null, destination: null }, 2)).toBeUndefined();
      expect(await setRow({ nameG: 'دیگر' }, 2)).toBe('shipment_import_rows_frozen');
      expect(
        await rejectedConstraint(conn.db.delete(shipmentImportRows).where(eq(shipmentImportRows.importId, id))),
      ).toBe('shipment_import_rows_frozen');

      const [made] = await shipmentsOf(taheri.id);
      const setShipment = (values: Partial<typeof shipments.$inferInsert>) =>
        rejectedConstraint(conn.db.update(shipments).set(values).where(eq(shipments.id, made!.id)));
      expect(await setShipment({ barcode: barcodeOf(9) })).toBe('shipments_frozen');
      expect(await setShipment({ weightGrams: 900 })).toBe('shipments_frozen');
      expect(await rejectedConstraint(conn.db.delete(shipments).where(eq(shipments.id, made!.id)))).toBe('shipments_frozen');
      // مرسوله از سطر همان ورود، با همان اعداد؛ قطعی فقط برای سفارش حکم.
      const insertShipment = async (values: Partial<typeof shipments.$inferInsert>) =>
        rejectedConstraint(
          conn.db.insert(shipments).values({
            smsMessageId: await pendingSms(values.orderId ?? taheri.id),
            orderId: taheri.id,
            barcode: barcodeOf(2),
            importId: id,
            rowNo: 2,
            weightGrams: 822,
            fareRials: 1_295_000,
            taxRials: 129_500,
            postDay: tehran('2026-10-04 00:00'),
            matchedBy: 'manual',
            adminUserId: owner,
            ...values,
          }),
        );
      expect(await insertShipment({ weightGrams: 900 })).toBe('shipments_row');
      expect(await insertShipment({ matchedBy: 'rule' })).toBe('shipments_row');
      expect(await insertShipment({ barcode: barcodeOf(7) })).toBe('shipments_row');
      // کد بدشکل را تریگر پیش از CHECK می‌گیرد (سطری با آن نیست)؛ CHECK خود سطر ۲۴ رقم می‌خواهد.
      expect(await insertShipment({ barcode: '1188' })).toBe('shipments_row');
      expect(
        await rejectedConstraint(conn.db.insert(shipmentImportRows).values({ importId: id, rowNo: 99, verdict: 'unmatched', barcode: '1188' })),
      ).toBe('shipment_import_rows_barcode');
      // کد زنده یکتاست: همان کد برای سفارش دیگر نه؛ کنارگذاشته‌اش مانع نیست.
      expect(await insertShipment({ barcode: barcodeOf(1), rowNo: 1, weightGrams: 821 })).toBe('shipments_live_barcode');

      // از هر دو سو: سفارشی که کد زنده دارد از «تحویل پست شد» بیرون نمی‌رود، و کد زنده برای سفارشی که «تحویل پست شد» نیست نه.
      expect(await rejectedConstraint(conn.db.update(orders).set({ status: 'printing', handedToPostAt: null }).where(eq(orders.id, taheri.id)))).toBe(
        'shipments_order_handed',
      );
      const printing = await printingOrder(TEHRAN, 'امید شریفی');
      expect(await insertShipment({ orderId: printing.id })).toBe('shipments_order_handed');
      // شاهد: همان کد برای سفارش «تحویل پست شد» (دادن دستی، ۶٫۲) می‌نشیند.
      expect((await change(printing, 'printing', 'handed_to_post')).ok).toBe(true);
      expect(await insertShipment({ orderId: printing.id })).toBeUndefined();

      // ورودی که برگشت کد زنده ندارد (معوق)، و پس از برگشت عوض نمی‌شود.
      expect(await setImport({ status: 'reverted', revertedAt: NOW, revertedBy: owner, revertReason: 'دستی' })).toBe('shipment_imports_revert_voids');
      expect((await revert(id)).ok).toBe(true);
      expect(await setImport({ revertReason: 'دیگر' })).toBe('shipment_imports_frozen');
      expect(await setImport({ status: 'committed' })).toBe('shipment_imports_flow');
      // کنار گذاشتن یک بار.
      expect(await setShipment({ voidedAt: NOW, voidedBy: owner, voidReason: 'دوباره' })).toBe('shipments_frozen');
    });

    it('ورود چاپخانه: حکم‌ها فقط سفارش‌های همان چاپخانه، ورودش فقط در محدودهٔ خودش، و پایگاه داده کد سفارش دیگری را از آن نمی‌پذیرد', async () => {
      const [noor] = await conn.db.insert(printPartners).values({ name: 'چاپ نور', ...MASHHAD }).returning();
      const partner: PanelScope = { kind: 'partner', partnerId: noor!.id };
      const own = await printingOrder(MASHHAD, 'فرزانه کاظمی');
      const others = await printingOrder(TEHRAN, 'مهسا طاهری');
      expect((await orderOf(own.id)).printPartnerId).toBe(noor!.id);
      expect((await orderOf(others.id)).printPartnerId).toBe(first);
      const id = await readImport(
        [row(1, barcodeOf(1), `کاظمی ${own.orderNumber}`, 'مشهد'), row(2, barcodeOf(2), `طاهری ${others.orderNumber}`)],
        { scope: partner },
      );
      expect((await importOf(id)).printPartnerId).toBe(noor!.id);
      // سفارش چاپخانهٔ دیگر برای او «پیدا نشد» است، مثل شماره‌ای که نیست؛ و مالک همان حکم‌ها را می‌بیند.
      const seen = await previewOf(id, partner);
      expect(seen.judged.map((j) => [j.verdict, j.reason])).toEqual([
        ['matched', null],
        ['unmatched', 'not_found'],
      ]);
      expect(seen.orders.map((o) => o.id)).toEqual([own.id]);
      expect((await previewOf(id, ALL_ORDERS)).fingerprint).toBe(seen.fingerprint);
      const firstScope: PanelScope = { kind: 'partner', partnerId: first };
      expect(await store().importPage(firstScope, id, NOW)).toBeNull();
      expect(await store().listImports(firstScope, { limit: 10, offset: 0 })).toEqual([]);
      expect((await store().listImports(ALL_ORDERS, { limit: 10, offset: 0 })).map((i) => [i.id, i.partner?.name])).toEqual([[id, 'چاپ نور']]);
      expect(await commit(id, { scope: firstScope, fingerprint: seen.fingerprint })).toEqual({ ok: false, reason: 'not_found' });
      expect(await commit(id, { scope: partner, fingerprint: seen.fingerprint })).toMatchObject({ ok: true, shipments: 1, handed: [own.orderNumber] });
      expect((await orderOf(others.id)).status).toBe('printing');
      // پایگاه داده هم: از ورود چاپخانه، کد سفارش چاپخانهٔ دیگر نه (سطرش با همان اعداد، دادن دستی).
      expect((await change(others, 'printing', 'handed_to_post')).ok).toBe(true);
      expect(
        await rejectedConstraint(
          conn.db.insert(shipments).values({
            orderId: others.id,
            barcode: barcodeOf(2),
            importId: id,
            rowNo: 2,
            weightGrams: 822,
            fareRials: 1_295_000,
            taxRials: 129_500,
            postDay: tehran('2026-10-04 00:00'),
            matchedBy: 'manual',
            adminUserId: owner,
          }),
        ),
      ).toBe('shipments_partner_scope');
      // همان فایل از چاپخانهٔ دیگر: «همان فایل»، بی نشانی ورود او.
      const raw = (await importOf(id)).raw!;
      expect(
        await store().createImport(firstScope, { filename: 'x.xls', raw, createdBy: operator, at: NOW, event: { adminUserId: operator, action: 'shipments.upload', at: NOW } }),
      ).toEqual({ ok: false, reason: 'same_file', existing: null });
    });

    /**
     * صف تأیید و فایل چاپخانه (برش ۶٫۲، ADR-046؛ تصمیم‌های ۷۵ تا ۸۸): نامزدها زنده و در محدودهٔ واردکننده، «همین است» و دادن دستی از
     * همان که ادمین دید، «هیچ‌کدام» یک بار، کنار گذاشتن یک کد، برگرداندن ورود با کدهای تأیید و دستی، هشدار «کد رهگیری ندارد»، و
     * هم‌زمانی‌ها. محافظ‌های پایگاه داده (0024) هر کدام با نامشان.
     */
    describe('صف تأیید و فایل چاپخانه (برش ۶٫۲)', () => {
      const HOUR = 60 * MINUTE;
      const queueOf = (scope: PanelScope = ALL_ORDERS) => store().reviewQueue(scope, { limit: 50, offset: 0 });
      const liveOf = async (orderId: string) => (await shipmentsOf(orderId)).filter((s) => s.voidedAt === null);
      /** آنچه ادمین از سفارش دید: وضعیت و شمار کد زنده. */
      const seenOf = async (orderId: string) => ({ status: (await orderOf(orderId)).status, liveShipments: (await liveOf(orderId)).length });
      const decide = async (
        importId: string,
        rowNo: number,
        orderId: string,
        { via = 'review' as 'review' | 'manual', seen = undefined as Awaited<ReturnType<typeof seenOf>> | undefined, scope = ALL_ORDERS as PanelScope } = {},
      ) =>
        store().decide(scope, {
          importId,
          rowNo,
          orderId,
          via,
          seen: seen ?? (await seenOf(orderId)),
          at: NOW,
          adminUserId: operator,
          event: { adminUserId: operator, action: via === 'review' ? 'shipments.approve' : 'shipments.assign', ipHash: 'ip', at: NOW },
        });
      const dismiss = (importId: string, rowNo: number, scope: PanelScope = ALL_ORDERS) =>
        store().dismiss(scope, { importId, rowNo, at: NOW, adminUserId: operator, event: { adminUserId: operator, action: 'shipments.dismiss', at: NOW } });
      const voidOf = (shipmentId: string, reason = 'کد مال سفارش دیگری بود.') =>
        store().voidShipment(ALL_ORDERS, { shipmentId, reason, at: NOW, adminUserId: owner, event: { adminUserId: owner, action: 'shipments.void', at: NOW } });
      /** فایل چاپ یک‌جلدی جزوهٔ بیست‌صفحه‌ای، همان‌طور که کارگر می‌نویسد. */
      async function printFiles(orderId: string) {
        const [item] = await conn.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        const { orderNumber } = await orderOf(orderId);
        await conn.db.insert(orderPrintFiles).values({
          orderItemId: item!.id,
          volume: 1,
          firstPage: 1,
          lastPage: 20,
          storageKey: `orders/${orderNumber}/print-1-1.pdf`,
          sizeBytes: 1_000,
          sha256: 'c'.repeat(64),
        });
      }
      /** بسته‌ای با وزن نزدیک برآورد سفارش (معیار وزن «می‌خواند»). */
      const near = async (n: number, barcode: string, nameG: string, orderId: string, destination = 'تهران', over: Parameters<typeof parcel>[6] = {}) =>
        parcel(n, barcode, nameG, destination, (await orderOf(orderId)).estWeightGrams, 1_295_000, over);
      const rowOf = async (importId: string, rowNo: number) =>
        (await conn.db.select().from(shipmentImportRows).where(and(eq(shipmentImportRows.importId, importId), eq(shipmentImportRows.rowNo, rowNo))))[0]!;
      const eventsOf = (action: string) => conn.db.select().from(adminEvents).where(eq(adminEvents.action, action)).orderBy(adminEvents.id);

      it('سطر بی شماره با نامزد به صف می‌رود و بی نامزد «پیدا نشد»؛ صف قدیمی‌ترین اول، با نامزدها، نمره و انتخاب از پیش؛ شمار پیشخوان و ورودها', async () => {
        const reza = await handedOrder(TEHRAN, 'رضا احمدی');
        const narges = await handedOrder(MASHHAD, 'نرگس احمدی');
        const karimi = await printingOrder(TEHRAN, 'علی کریمی');
        // ورود قدیمی‌تر، یک ساعت زودتر ثبت شد: نامی که نمی‌خواند.
        const older = await readImport([await near(1, barcodeOf(1), `رضایی ${karimi.orderNumber}`, karimi.id)]);
        const olderSeen = await previewOf(older);
        expect(
          await store().commit(ALL_ORDERS, {
            id: older,
            fingerprint: olderSeen.fingerprint,
            at: new Date(NOW.getTime() - HOUR),
            adminUserId: operator,
            event: { adminUserId: operator, action: 'shipments.commit', at: NOW },
          }),
        ).toMatchObject({ ok: true, counts: { review: 1 } });

        const id = await readImport([await near(1, barcodeOf(2), 'احمدی', reza.id), row(2, barcodeOf(3), 'نیک‌نام')]);
        const seen = await previewOf(id);
        expect(seen.judged.map((j) => [j.verdict, j.reason])).toEqual([
          ['review', 'no_number'],
          ['unmatched', 'no_number'],
        ]);
        // پیش‌نمایش نامزدها را هم دارد: رضا احمدی تهران قوی و انتخاب‌شده؛ نرگس احمدی مشهد با شهری که نمی‌خواند.
        expect(seen.candidates[1]!.candidates.map((c) => [c.order.orderNumber, c.score, c.criteria.city])).toEqual([
          [reza.orderNumber, 7, 'yes'],
          [narges.orderNumber, 5, 'no'],
        ]);
        expect(seen.candidates[1]!.preselected).toBe(reza.id);
        expect(seen.candidates[2]).toBeUndefined();
        // بی نامزد در پیش‌نمایش چاپخانه هم همان حکم؛ نامزدها فقط اگر خواسته شد.
        const bare = await store().importPage(ALL_ORDERS, id, NOW, { candidates: false });
        expect(bare?.kind === 'preview' && bare.preview.candidates).toEqual({});
        expect(await commit(id)).toMatchObject({ ok: true, counts: { review: 1, unmatched: 1 }, shipments: 0 });

        const { rows, total } = await queueOf();
        expect(total).toBe(2);
        expect(rows.map((r) => [r.import.id, r.row.rowNo, r.queued, r.row.reason])).toEqual([
          [older, 1, true, 'name_mismatch'],
          [id, 1, true, 'no_number'],
        ]);
        expect(rows[0]!.numbered?.orderNumber).toBe(karimi.orderNumber);
        expect(rows[0]!.candidates.candidates.map((c) => [c.order.orderNumber, c.criteria.number, c.criteria.surname, c.numbered])).toEqual([
          [karimi.orderNumber, 'yes', 'no', true],
        ]);
        expect(rows[0]!.candidates.preselected).toBeNull();
        expect(rows[1]!.candidates.preselected).toBe(reza.id);
        expect((await panelStore().alerts(ALL_ORDERS, { at: NOW, staleBefore: NOW, unreturnedBefore: NOW, untrackedSince: NOW })).reviewRows).toBe(2);
        expect(Object.fromEntries((await store().listImports(ALL_ORDERS, { limit: 10, offset: 0 })).map((i) => [i.id, i.queuedRows]))).toEqual({
          [id]: 1,
          [older]: 1,
        });
        // صفحهٔ ورود ثبت‌شده: سطر صف با نامزدهایش؛ «پیدا نشد» در صف نیست.
        const page = await store().importPage(ALL_ORDERS, id, NOW);
        expect(page?.kind === 'committed' && page.committed.rows.map((r) => [r.rowNo, r.queued])).toEqual([
          [1, true],
          [2, false],
          [3, false],
        ]);
        expect(page?.kind === 'committed' && page.committed.candidates[1]?.preselected).toBe(reza.id);
      });

      it('«همین است» برای «در حال چاپ»: کد با «تأیید»، «تحویل پست شد» با پایان روز بسته، رویداد با معیارها؛ سطر از صف بیرون و بار دوم نه', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const id = await readImport([await near(1, barcodeOf(1), `رضایی ${taheri.orderNumber}`, taheri.id)]);
        expect(await commit(id)).toMatchObject({ ok: true, counts: { review: 1 } });
        const [queued] = (await queueOf()).rows;
        expect(queued!.candidates.candidates.map((c) => [c.order.id, c.score, c.strong, c.blocked])).toEqual([[taheri.id, 5, false, null]]);
        // «همین است» فقط برای نامزد: سفارشی که نه شمارهٔ «نام گ» است و نه نام خانوادگی‌اش می‌خواند «عوض شد» می‌گیرد (راهش دادن دستی است).
        const stranger = await printingOrder(TEHRAN, 'مینا یوسفی');
        expect(await decide(id, 1, stranger.id)).toEqual({ ok: false, reason: 'changed' });
        expect(await liveOf(stranger.id)).toEqual([]);
        // ادمین «در صف چاپ» دید و همان لحظه «شروع چاپ» خورد: «عوض شد»، هر چند شمار کد همان است.
        expect(await decide(id, 1, taheri.id, { seen: { status: 'paid', liveShipments: 0 } })).toEqual({ ok: false, reason: 'changed' });

        expect(await decide(id, 1, taheri.id)).toEqual({ ok: true, orderNumber: taheri.orderNumber, from: 'printing', handed: true, sms: expect.any(Number) });
        expect(await orderOf(taheri.id)).toMatchObject({ status: 'handed_to_post', handedToPostAt: END_SUNDAY });
        const moved = (await statusRows(taheri.id)).at(-1)!;
        expect(moved).toMatchObject({ fromStatus: 'printing', toStatus: 'handed_to_post', actor: 'admin', adminUserId: operator, at: NOW });
        expect(moved.note).toMatchObject({ source: 'post_file', via: 'review', importId: id, rowNo: 1, postDay: tehran('2026-10-04 00:00').toISOString() });
        expect(await liveOf(taheri.id)).toMatchObject([{ barcode: barcodeOf(1), importId: id, rowNo: 1, matchedBy: 'review', handedOrder: true, adminUserId: operator }]);
        const [event] = await eventsOf('shipments.approve');
        expect(event).toMatchObject({ targetType: 'order', targetId: taheri.id, adminUserId: operator, ipHash: 'ip' });
        expect(event!.detail).toMatchObject({
          orderNumber: taheri.orderNumber,
          importId: id,
          rowNo: 1,
          barcode: barcodeOf(1),
          from: 'printing',
          handed: true,
          criteria: { number: 'yes', surname: 'no', city: 'yes', weight: 'yes', day: null },
          score: 5,
        });
        expect((await queueOf()).total).toBe(0);
        // بار دوم، و «هیچ‌کدام» پس از آن: سطر دیگر در صف نیست.
        expect(await decide(id, 1, taheri.id, { seen: { status: 'printing', liveShipments: 0 } })).toEqual({ ok: false, reason: 'row_closed' });
        expect(await decide(id, 1, taheri.id, { via: 'manual' })).toEqual({ ok: false, reason: 'row_closed' });
        expect(await dismiss(id, 1)).toEqual({ ok: false, reason: 'row_closed' });
        // جزئیات سفارش: کد با «تأیید».
        expect((await panelStore().details(ALL_ORDERS, taheri.orderNumber))!.shipments).toMatchObject([{ matchedBy: 'review', handedOrder: true }]);
      });

      it('«در صف چاپ» فقط با دروازه‌های «شروع چاپ»، و بعد «شروع چاپ» و «تحویل پست شد» با هم؛ کنار گذاشتنش به «در حال چاپ»، و دیگر خودکار انتخاب نمی‌شود', async () => {
        // بی چاپخانه: هنگام پرداخت هیچ چاپخانهٔ فعالی نبود.
        await conn.db.update(printPartners).set({ isDefault: false, deactivatedAt: NOW }).where(eq(printPartners.id, first));
        const bare = await paidOrder(TEHRAN, 'نگار صادقی');
        await conn.db.update(printPartners).set({ deactivatedAt: null, isDefault: true }).where(eq(printPartners.id, first));
        expect((await orderOf(bare.id)).printPartnerId).toBeNull();
        const queued = await paidOrder(TEHRAN, 'زهرا محمدی');
        const id = await readImport([
          await near(1, barcodeOf(1), `محمدی ${queued.orderNumber}`, queued.id),
          await near(2, barcodeOf(2), `صادقی ${bare.orderNumber}`, bare.id),
        ]);
        expect((await previewOf(id)).judged.map((j) => [j.verdict, j.reason])).toEqual([
          ['review', 'queued'],
          ['review', 'queued'],
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 0 });
        const blockOfRow = async (rowNo: number) => (await store().reviewRow(ALL_ORDERS, id, rowNo))!.candidates;
        expect((await blockOfRow(1)).candidates.map((c) => c.blocked)).toEqual(['needs_print']);
        expect((await blockOfRow(1)).preselected).toBeNull();
        expect((await blockOfRow(2)).candidates.map((c) => c.blocked)).toEqual(['needs_partner']);
        expect(await decide(id, 1, queued.id)).toEqual({ ok: false, reason: 'blocked', block: 'needs_print' });
        expect(await decide(id, 2, bare.id, { via: 'manual' })).toEqual({ ok: false, reason: 'blocked', block: 'needs_partner' });
        expect((await orderOf(queued.id)).status).toBe('paid');

        await printFiles(queued.id);
        expect((await blockOfRow(1)).candidates.map((c) => [c.blocked, c.strong])).toEqual([[null, true]]);
        expect((await blockOfRow(1)).preselected).toBe(queued.id);
        expect(await decide(id, 1, queued.id)).toEqual({ ok: true, orderNumber: queued.orderNumber, from: 'paid', handed: true, sms: expect.any(Number) });
        const events = await statusRows(queued.id);
        expect(events.slice(-2).map((e) => [e.fromStatus, e.toStatus, e.adminUserId, e.at.getTime(), (e.note as { via?: string }).via])).toEqual([
          ['paid', 'printing', operator, NOW.getTime(), 'review'],
          ['printing', 'handed_to_post', operator, NOW.getTime(), 'review'],
        ]);
        expect(await orderOf(queued.id)).toMatchObject({ status: 'handed_to_post', handedToPostAt: END_SUNDAY });

        // کنار گذاشتن: یک قدم به «در حال چاپ»، نه «در صف چاپ»؛ سطر به صف، و همین سفارش دیگر خودکار انتخاب نمی‌شود.
        const [live] = await liveOf(queued.id);
        expect(await voidOf(live!.id)).toEqual({ ok: true, orderNumber: queued.orderNumber, reopened: true, kept: null });
        expect(await orderOf(queued.id)).toMatchObject({ status: 'printing', handedToPostAt: null });
        const back = (await statusRows(queued.id)).at(-1)!;
        expect(back).toMatchObject({ fromStatus: 'handed_to_post', toStatus: 'printing', adminUserId: owner });
        expect(back.note).toMatchObject({ source: 'shipment_void', reason: 'کد مال سفارش دیگری بود.', barcode: barcodeOf(1) });
        expect(await voidOf(live!.id)).toEqual({ ok: false, reason: 'already_voided' });
        const again = await store().reviewRow(ALL_ORDERS, id, 1);
        expect(again).toMatchObject({ queued: true, assignable: true });
        expect(again!.candidates.candidates.map((c) => [c.order.id, c.voidedHere, c.strong])).toEqual([[queued.id, true, true]]);
        expect(again!.candidates.preselected).toBeNull();
        // صفحهٔ ورود هم همان: سطر در صف، نامزد «همین کد کنار رفت» و بی انتخاب از پیش.
        const page = await store().importPage(ALL_ORDERS, id, NOW);
        const onPage = page?.kind === 'committed' ? page.committed.candidates[1] : undefined;
        expect(onPage?.candidates.map((c) => [c.order.id, c.voidedHere])).toEqual([[queued.id, true]]);
        expect(onPage?.preselected).toBeNull();
        const [voidEvent] = await eventsOf('shipments.void');
        expect(voidEvent).toMatchObject({ targetType: 'order', targetId: queued.id, adminUserId: owner });
        expect(voidEvent!.detail).toMatchObject({ orderNumber: queued.orderNumber, barcode: barcodeOf(1), rowNo: 1, reopened: true });
        // دوباره «همین است»: همان سفارش، حالا از «در حال چاپ».
        expect(await decide(id, 1, queued.id)).toMatchObject({ ok: true, from: 'printing' });
      });

      it('لغوشده حتی با تأیید نه؛ پرداخت‌نشده هرگز؛ بسته‌ای که پیش از پرداخت به پست رسید نه؛ پایگاه داده هم کد سفارش لغوشده را نمی‌پذیرد', async () => {
        const cancelled = await printingOrder(TEHRAN, 'امین قاسمی');
        expect((await change(cancelled, 'printing', 'cancelled', 'مشتری نخواست')).ok).toBe(true);
        const unpaid = await paidOrder(TEHRAN, 'لیلا حیدری', { settle: false });
        const early = await printingOrder(TEHRAN, 'نگار رحمانی');
        const id = await readImport([
          await near(1, barcodeOf(1), `قاسمی ${cancelled.orderNumber}`, cancelled.id),
          row(2, barcodeOf(2), 'طهماسبی 6103'),
          await near(3, barcodeOf(3), `رحمانی ${early.orderNumber}`, early.id, 'تهران', { date: '1405/07/10' }),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 0 });
        const rows = await conn.db.select().from(shipmentImportRows).where(eq(shipmentImportRows.importId, id)).orderBy(shipmentImportRows.rowNo);
        expect(rows.slice(0, 3).map((r) => [r.verdict, r.reason])).toEqual([
          ['review', 'cancelled'],
          ['unmatched', 'manual_code'],
          ['review', 'date_before_payment'],
        ]);
        expect((await store().reviewRow(ALL_ORDERS, id, 1))!.candidates.candidates.map((c) => c.blocked)).toEqual(['cancelled']);
        expect(await decide(id, 1, cancelled.id)).toEqual({ ok: false, reason: 'blocked', block: 'cancelled' });
        expect(await decide(id, 1, cancelled.id, { via: 'manual' })).toEqual({ ok: false, reason: 'blocked', block: 'cancelled' });
        expect(await decide(id, 2, unpaid.id, { via: 'manual' })).toEqual({ ok: false, reason: 'order_not_found' });
        expect(await decide(id, 3, early.id)).toEqual({ ok: false, reason: 'blocked', block: 'before_payment' });
        expect(await decide(id, 3, early.id, { via: 'manual' })).toEqual({ ok: false, reason: 'blocked', block: 'before_payment' });
        expect(await shipmentsOf(cancelled.id)).toEqual([]);
        // بی ذخیره‌گاه: کد زنده برای سفارش لغوشده در COMMIT رد می‌شود.
        expect(
          await rejectedConstraint(
            conn.db.insert(shipments).values({
              smsMessageId: await pendingSms(cancelled.id),
              orderId: cancelled.id,
              barcode: barcodeOf(1),
              importId: id,
              rowNo: 1,
              weightGrams: rows[0]!.weightGrams!,
              fareRials: rows[0]!.fareRials!,
              taxRials: rows[0]!.taxRials!,
              postDay: rows[0]!.postDay!,
              matchedBy: 'review',
              adminUserId: owner,
            }),
          ),
        ).toBe('shipments_order_handed');
      });

      it('«هیچ‌کدام» یک بار و فقط برای سطر صف، با رویداد؛ دادن دستی پس از آن هنوز باز؛ پایگاه داده هم', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await printingOrder(TEHRAN, 'مریم کاظمی');
        const id = await readImport([
          await near(1, barcodeOf(1), `رضایی ${taheri.orderNumber}`, taheri.id),
          await near(2, barcodeOf(2), `کاظمی ${kazemi.orderNumber}`, kazemi.id),
          await near(3, barcodeOf(3), `رضایی ${kazemi.orderNumber}`, kazemi.id),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, counts: { review: 2, matched: 1 } });
        expect(await dismiss(id, 1)).toEqual({ ok: true });
        expect(await rowOf(id, 1)).toMatchObject({ dismissedBy: operator, dismissedAt: NOW });
        const [event] = await eventsOf('shipments.dismiss');
        expect(event).toMatchObject({ targetType: 'shipment_import', targetId: id, adminUserId: operator });
        expect(event!.detail).toMatchObject({ rowNo: 1, barcode: barcodeOf(1), orderNumber: taheri.orderNumber });
        expect((await queueOf()).rows.map((r) => r.row.rowNo)).toEqual([3]);
        const lineOf = async () => {
          const [line] = await store().listImports(ALL_ORDERS, { limit: 10, offset: 0 });
          return { queued: line!.queuedRows, dismissed: line!.dismissedRows, unmatched: line!.unmatchedRows, live: line!.liveShipments };
        };
        expect(await lineOf()).toEqual({ queued: 1, dismissed: 1, unmatched: 0, live: 1 });
        expect(await dismiss(id, 1)).toEqual({ ok: false, reason: 'row_closed' });
        expect(await decide(id, 1, taheri.id)).toEqual({ ok: false, reason: 'row_closed' });
        // سطر قطعی با کد زنده در صف نیست.
        expect(await dismiss(id, 2)).toEqual({ ok: false, reason: 'row_closed' });
        const page = await store().reviewRow(ALL_ORDERS, id, 1);
        expect(page).toMatchObject({ queued: false, assignable: true, row: { dismissedByName: 'علی محمدی' } });

        // پایگاه داده: «هیچ‌کدام» بیرون از صف، و دوباره؛ کد «همین است» از سطر ردشده نه؛ دادن دستی آری.
        const setRow = (rowNo: number, set: Partial<typeof shipmentImportRows.$inferInsert>) =>
          rejectedConstraint(conn.db.update(shipmentImportRows).set(set).where(and(eq(shipmentImportRows.importId, id), eq(shipmentImportRows.rowNo, rowNo))));
        expect(await setRow(2, { dismissedAt: NOW, dismissedBy: owner })).toBe('shipment_import_rows_dismiss');
        expect(await setRow(1, { dismissedBy: owner })).toBe('shipment_import_rows_frozen');
        expect(await setRow(1, { dismissedAt: null, dismissedBy: null })).toBe('shipment_import_rows_frozen');
        expect(await setRow(3, { dismissedAt: NOW })).toBe('shipment_import_rows_dismissed');
        // «هیچ‌کدام» فقط برای سطری که می‌توانست کد سفارش ما شود؛ CHECK، حتی در درج.
        const bogus = (verdict: string, dismissedBy: string | null) =>
          rejectedConstraint(
            conn.db.insert(shipmentImportRows).values({ importId: id, rowNo: 50, verdict, reason: null, dismissedAt: NOW, dismissedBy }),
          );
        expect(await bogus('duplicate', owner)).toBe('shipment_import_rows_dismissed');
        expect(await bogus('review', null)).toBe('shipment_import_rows_dismissed');
        const source = await rowOf(id, 1);
        const values = {
          orderId: taheri.id,
          barcode: barcodeOf(1),
          importId: id,
          rowNo: 1,
          weightGrams: source.weightGrams!,
          fareRials: source.fareRials!,
          taxRials: source.taxRials!,
          postDay: source.postDay!,
          adminUserId: owner,
        };
        expect(await rejectedConstraint(conn.db.insert(shipments).values({ ...values, matchedBy: 'review' }))).toBe('shipments_row');
        expect(await decide(id, 1, taheri.id, { via: 'manual' })).toEqual({ ok: true, orderNumber: taheri.orderNumber, from: 'printing', handed: true, sms: expect.any(Number) });
        expect(await liveOf(taheri.id)).toMatchObject([{ matchedBy: 'manual', rowNo: 1 }]);
        expect((await eventsOf('shipments.assign'))[0]).toMatchObject({ targetType: 'order', targetId: taheri.id });
        expect(await lineOf()).toEqual({ queued: 1, dismissed: 0, unmatched: 0, live: 2 });
      });

      it('دادن دستی: «پیدا نشد» به «در حال چاپ»، بستهٔ دوم سفارشی که کد دارد، و از همان که ادمین دید؛ تکراری، خوانده نشد و غیرفعال نه', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const id = await readImport([
          row(1, barcodeOf(1), 'طهماسبی 6103'),
          row(2, barcodeOf(2), 'نیک‌نام'),
          row(3, barcodeOf(3), 'طهماسبی 6104', 'تهران', { status: 'باطل' }),
          row(4, barcodeOf(1), 'طهماسبی 6103'),
          ['5', 'پاکت', '1.2E+23', ...row(5, barcodeOf(5), 'x').slice(3)],
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, counts: { unmatched: 2, inactive: 1, duplicate: 1, invalid: 1 } });
        expect((await queueOf()).total).toBe(0);
        const unmatchedNow = async () => (await store().listImports(ALL_ORDERS, { limit: 10, offset: 0 }))[0]!.unmatchedRows;
        expect(await unmatchedNow()).toBe(2);
        expect(await decide(id, 1, taheri.id, { via: 'manual' })).toEqual({ ok: true, orderNumber: taheri.orderNumber, from: 'printing', handed: true, sms: expect.any(Number) });
        // پایگاه داده: «پیدا نشد»ی که هرگز کد نگرفت در صف نیست، پس «هیچ‌کدام» ندارد و کد «همین است» هم نه؛ غیرفعال حتی دستی نه.
        expect(
          await rejectedConstraint(
            conn.db
              .update(shipmentImportRows)
              .set({ dismissedAt: NOW, dismissedBy: owner })
              .where(and(eq(shipmentImportRows.importId, id), eq(shipmentImportRows.rowNo, 2))),
          ),
        ).toBe('shipment_import_rows_dismiss');
        const direct = async (rowNo: number, matchedBy: 'review' | 'manual') => {
          const source = await rowOf(id, rowNo);
          return rejectedConstraint(
            conn.db.insert(shipments).values({
              orderId: taheri.id,
              barcode: source.barcode!,
              importId: id,
              rowNo,
              weightGrams: source.weightGrams!,
              fareRials: source.fareRials!,
              taxRials: source.taxRials!,
              postDay: source.postDay!,
              matchedBy,
              adminUserId: owner,
            }),
          );
        };
        expect(await direct(2, 'review')).toBe('shipments_row');
        expect(await direct(3, 'manual')).toBe('shipments_row');
        // کد «کنارگذاشته» هم درج نمی‌شود: سطر «پیدا نشد» را بی تصمیم به صف می‌برد.
        const source2 = await rowOf(id, 2);
        expect(
          await rejectedConstraint(
            conn.db.insert(shipments).values({
              orderId: taheri.id,
              barcode: source2.barcode!,
              importId: id,
              rowNo: 2,
              weightGrams: source2.weightGrams!,
              fareRials: source2.fareRials!,
              taxRials: source2.taxRials!,
              postDay: source2.postDay!,
              matchedBy: 'manual',
              adminUserId: owner,
              voidedAt: NOW,
              voidedBy: owner,
              voidReason: 'ساختگی',
            }),
          ),
        ).toBe('shipments_row');
        expect((await queueOf()).total).toBe(0);
        // بستهٔ دوم همان سفارش: آنچه ادمین دید کهنه است، وضعیتش یا شمار کدش، «عوض شد».
        expect(await decide(id, 2, taheri.id, { via: 'manual', seen: { status: 'printing', liveShipments: 0 } })).toEqual({ ok: false, reason: 'changed' });
        expect(await decide(id, 2, taheri.id, { via: 'manual', seen: { status: 'handed_to_post', liveShipments: 0 } })).toEqual({ ok: false, reason: 'changed' });
        expect(await decide(id, 2, taheri.id, { via: 'manual' })).toEqual({ ok: true, orderNumber: taheri.orderNumber, from: 'handed_to_post', handed: false, sms: expect.any(Number) });
        expect((await liveOf(taheri.id)).map((s) => [s.rowNo, s.handedOrder, s.matchedBy])).toEqual([
          [1, true, 'manual'],
          [2, false, 'manual'],
        ]);
        expect(await unmatchedNow()).toBe(0);
        // صفحهٔ ورود سفارش کدهای دستی را هم دارد، هر چند سطرشان حکم سفارشی نداشت؛ با مهلت تحویل به پستش.
        const page = await store().importPage(ALL_ORDERS, id, NOW);
        expect(page?.kind === 'committed' && page.committed.orders.map((o) => [o.id, o.postHandoffDueAt])).toEqual([[taheri.id, END_MONDAY]]);
        // «همین است» فقط برای سطر صف؛ تکراری، غیرفعال و خوانده نشد هیچ‌کدام.
        const other = await printingOrder(TEHRAN, 'مینا یوسفی');
        for (const rowNo of [3, 4, 5]) expect(await decide(id, rowNo, other.id, { via: 'manual' }), `${rowNo}`).toEqual({ ok: false, reason: 'row_closed' });
        expect(await decide(id, 2, other.id)).toEqual({ ok: false, reason: 'row_closed' });
        expect(await decide(randomUUID(), 1, other.id)).toEqual({ ok: false, reason: 'not_found' });
        expect(await decide(id, 99, other.id)).toEqual({ ok: false, reason: 'not_found' });
        expect(await decide(id, 3, randomUUID(), { via: 'manual', seen: { status: 'printing', liveShipments: 0 } })).toEqual({ ok: false, reason: 'row_closed' });
      });

      it('کنار گذاشتن یک کد: سطر به صف؛ سفارشی که همین کد «تحویل پست شد» کرده بود به «در حال چاپ»، مگر کد دیگری دارد، فایل‌هایش پاک شده یا پیش‌تر دستی به پست رسیده بود؛ کد «قطعی» خودش برنمی‌گردد', async () => {
        const [x, y, z] = [await printingOrder(TEHRAN, 'مهسا طاهری'), await printingOrder(TEHRAN, 'مریم کاظمی'), await handedOrder(TEHRAN, 'امید شریفی')];
        const w = await printingOrder(TEHRAN, 'یاسمن فرهادی');
        const id = await readImport([
          await near(1, barcodeOf(1), `طاهری ${x.orderNumber}`, x.id),
          await near(2, barcodeOf(2), `کاظمی ${y.orderNumber}`, y.id),
          await near(3, barcodeOf(3), `کاظمی ${y.orderNumber}`, y.id),
          await near(4, barcodeOf(4), `شریفی ${z.orderNumber}`, z.id),
          await near(5, barcodeOf(5), `فرهادی ${w.orderNumber}`, w.id),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 5, handed: [x.orderNumber, y.orderNumber, w.orderNumber].sort((a, b) => a - b) });
        const codeOf = async (orderId: string, rowNo: number) => (await liveOf(orderId)).find((s) => s.rowNo === rowNo)!.id;

        // x: همین کد تحویل پست کرد و کد دیگری ندارد.
        expect(await voidOf(await codeOf(x.id, 1))).toEqual({ ok: true, orderNumber: x.orderNumber, reopened: true, kept: null });
        expect((await orderOf(x.id)).status).toBe('printing');
        // y: دو بسته؛ اولی کنار می‌رود و سفارش با دومی می‌ماند.
        expect(await voidOf(await codeOf(y.id, 2))).toEqual({ ok: true, orderNumber: y.orderNumber, reopened: false, kept: 'other_code' });
        // z: پیش از کد دستی به پست رسیده بود.
        expect(await voidOf(await codeOf(z.id, 4))).toEqual({ ok: true, orderNumber: z.orderNumber, reopened: false, kept: 'handed_before' });
        expect((await orderOf(z.id)).status).toBe('handed_to_post');
        // w: فایل‌هایش پس از روزهای نگهداری پاک شده (ADR-044): وضعیتش قفل است.
        await conn.db.update(orders).set({ filesDeletedAt: NOW }).where(eq(orders.id, w.id));
        expect(await voidOf(await codeOf(w.id, 5))).toEqual({ ok: true, orderNumber: w.orderNumber, reopened: false, kept: 'files_deleted' });
        expect((await orderOf(w.id)).status).toBe('handed_to_post');

        // سطرها به صف برگشتند (حکمشان «قطعی» است)؛ کد «قطعی» خودش برنمی‌گردد، فقط با تأیید.
        expect((await queueOf()).rows.map((r) => [r.row.rowNo, r.row.verdict])).toEqual([
          [1, 'matched'],
          [2, 'matched'],
          [4, 'matched'],
          [5, 'matched'],
        ]);
        const source = await rowOf(id, 1);
        expect(
          await rejectedConstraint(
            conn.db.insert(shipments).values({
              orderId: x.id,
              barcode: barcodeOf(1),
              importId: id,
              rowNo: 1,
              weightGrams: source.weightGrams!,
              fareRials: source.fareRials!,
              taxRials: source.taxRials!,
              postDay: source.postDay!,
              matchedBy: 'rule',
              adminUserId: owner,
            }),
          ),
        ).toBe('shipments_row');
        expect(await decide(id, 1, x.id)).toMatchObject({ ok: true, from: 'printing', handed: true });
      });

      it('برگرداندن ورود: کدهای تأیید و دستی هم کنار می‌روند، سفارش‌هایشان به «در حال چاپ» برمی‌گردند، و سطرهای صف بیرون می‌روند', async () => {
        const [x, y, z] = [await printingOrder(TEHRAN, 'مهسا طاهری'), await printingOrder(TEHRAN, 'مریم کاظمی'), await printingOrder(TEHRAN, 'امید شریفی')];
        const w = await printingOrder(TEHRAN, 'یاسمن فرهادی');
        const id = await readImport([
          await near(1, barcodeOf(1), `طاهری ${x.orderNumber}`, x.id),
          await near(2, barcodeOf(2), `رضایی ${y.orderNumber}`, y.id),
          row(3, barcodeOf(3), 'طهماسبی 6103'),
          await near(4, barcodeOf(4), `رضایی ${w.orderNumber}`, w.id),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 1 });
        expect(await decide(id, 2, y.id)).toMatchObject({ ok: true });
        expect(await decide(id, 3, z.id, { via: 'manual' })).toMatchObject({ ok: true });
        expect((await queueOf()).total).toBe(1);
        expect(await revert(id)).toEqual({
          ok: true,
          voided: 3,
          reopened: [x.orderNumber, y.orderNumber, z.orderNumber].sort((a, b) => a - b),
          kept: [],
          unqueued: 1,
        });
        for (const order of [x, y, z]) expect((await orderOf(order.id)).status).toBe('printing');
        expect((await queueOf()).total).toBe(0);
        expect(await decide(id, 4, w.id)).toEqual({ ok: false, reason: 'row_closed' });
        expect(await dismiss(id, 4)).toEqual({ ok: false, reason: 'row_closed' });
        expect(await decide(id, 4, w.id, { via: 'manual' })).toEqual({ ok: false, reason: 'row_closed' });
        const [event] = await eventsOf('shipments.revert');
        expect(event!.detail).toMatchObject({ voided: 3, unqueued: 1 });
        // «هیچ‌کدام» و کد دستی، پایگاه داده هم برای ورود برگشته نه.
        expect(
          await rejectedConstraint(
            conn.db
              .update(shipmentImportRows)
              .set({ dismissedAt: NOW, dismissedBy: owner })
              .where(and(eq(shipmentImportRows.importId, id), eq(shipmentImportRows.rowNo, 4))),
          ),
        ).toBe('shipment_import_rows_dismiss');
        const source = await rowOf(id, 4);
        expect(
          await rejectedConstraint(
            conn.db.insert(shipments).values({
              orderId: w.id,
              barcode: barcodeOf(4),
              importId: id,
              rowNo: 4,
              weightGrams: source.weightGrams!,
              fareRials: source.fareRials!,
              taxRials: source.taxRials!,
              postDay: source.postDay!,
              matchedBy: 'manual',
              adminUserId: owner,
            }),
          ),
        ).toBe('shipments_import_committed');
      });

      it('هم‌زمان: دو تأیید یک سطر یکی می‌شود؛ تأیید و لغو یک سفارش فقط یکی؛ تأیید و برگرداندن ورود پشت‌سرهم، هر کدام کامل', async () => {
        for (let round = 0; round < 3; round += 1) {
          await reset();
          const a = await printingOrder(TEHRAN, 'رضا احمدی');
          const b = await printingOrder(TEHRAN, 'سارا احمدی');
          const id = await readImport([await near(1, barcodeOf(1), 'احمدی', a.id), await near(2, barcodeOf(2), 'احمدی', a.id)]);
          expect(await commit(id)).toMatchObject({ ok: true, counts: { review: 2 } });

          // دو تأیید یک سطر، به دو سفارش: یکی.
          const pair = await Promise.all([decide(id, 1, a.id), decide(id, 1, b.id)]);
          expect(pair.filter((r) => r.ok)).toHaveLength(1);
          expect(pair.filter((r) => !r.ok).map((r) => !r.ok && r.reason)).toEqual(['row_closed']);
          const winner = pair[0]!.ok ? a : b;
          const loser = winner === a ? b : a;
          expect(await liveOf(winner.id)).toHaveLength(1);

          // تأیید و لغو هم‌زمان سفارش دیگر: فقط یکی.
          const [approved, cancel] = await Promise.all([
            decide(id, 2, loser.id, { seen: { status: 'printing', liveShipments: 0 } }),
            change(loser, 'printing', 'cancelled', 'مشتری نخواست'),
          ]);
          const status = (await orderOf(loser.id)).status;
          if (approved.ok) {
            expect(cancel.ok).toBe(false);
            expect(status).toBe('handed_to_post');
          } else {
            expect(cancel.ok).toBe(true);
            expect(approved).toEqual({ ok: false, reason: 'changed' });
            expect(status).toBe('cancelled');
          }

          // تأیید و برگرداندن هم‌زمان: یا تأیید و بعد برگرداندن کدش را هم کنار می‌گذارد، یا برگرداندن و بعد تأیید «بسته».
          await reset();
          const c = await printingOrder(TEHRAN, 'مهسا طاهری');
          const second = await readImport([await near(1, barcodeOf(3), `رضایی ${c.orderNumber}`, c.id)]);
          expect(await commit(second)).toMatchObject({ ok: true });
          const [late, reverted] = await Promise.all([decide(second, 1, c.id), revert(second)]);
          expect(reverted.ok).toBe(true);
          if (late.ok) expect(reverted).toMatchObject({ voided: 1, reopened: [c.orderNumber], unqueued: 0 });
          else {
            expect(late).toEqual({ ok: false, reason: 'row_closed' });
            expect(reverted).toMatchObject({ voided: 0, reopened: [], unqueued: 1 });
          }
          expect(await liveOf(c.id)).toEqual([]);
          expect((await orderOf(c.id)).status).toBe('printing');
        }
      });

      it('ورود چاپخانه: سطر بی شماره فقط با نامزد همان چاپخانه به صف می‌رود؛ دادن دستی به سفارش چاپخانهٔ دیگر «پیدا نشد»؛ صف همه را برای مالک و متصدی دارد', async () => {
        const [noor] = await conn.db.insert(printPartners).values({ name: 'چاپ نور', ...MASHHAD }).returning();
        const partner: PanelScope = { kind: 'partner', partnerId: noor!.id };
        const own = await handedOrder(MASHHAD, 'فرزانه کاظمی');
        const others = await handedOrder(TEHRAN, 'مریم کاظمی');
        const taheri = await handedOrder(TEHRAN, 'مهسا طاهری');
        expect([(await orderOf(own.id)).printPartnerId, (await orderOf(others.id)).printPartnerId]).toEqual([noor!.id, first]);
        const id = await readImport(
          [await near(1, barcodeOf(1), 'کاظمی', own.id, 'مشهد'), await near(2, barcodeOf(2), 'طاهری', taheri.id)],
          { scope: partner },
        );
        const seen = await previewOf(id, partner);
        // طاهری فقط سفارش چاپخانهٔ دیگری است: برای این ورود «پیدا نشد»، بی نشت؛ کاظمی فقط نامزد خود چاپخانه.
        expect(seen.judged.map((j) => [j.verdict, j.reason])).toEqual([
          ['review', 'no_number'],
          ['unmatched', 'no_number'],
        ]);
        expect(seen.candidates[1]!.candidates.map((c) => c.order.id)).toEqual([own.id]);
        expect(await commit(id, { scope: partner })).toMatchObject({ ok: true, shipments: 0 });
        // صف: مالک و متصدی همه را می‌بینند، با نامزدهای محدودهٔ همان ورود؛ صف ورودهای چاپخانه برای خودش هم همان.
        const { rows } = await queueOf();
        expect(rows.map((r) => [r.import.partner?.name, r.row.rowNo, r.candidates.candidates.map((c) => c.order.id)])).toEqual([['چاپ نور', 1, [own.id]]]);
        const firstScope: PanelScope = { kind: 'partner', partnerId: first };
        expect((await queueOf(firstScope)).total).toBe(0);
        // شمار پیشخوان هم در محدوده: همه و خود چاپخانه یکی، چاپخانهٔ دیگر هیچ.
        const clock: PanelClock = { at: NOW, staleBefore: NOW, unreturnedBefore: NOW, untrackedSince: NOW };
        expect(await Promise.all([ALL_ORDERS, partner, firstScope].map(async (s) => (await panelStore().alerts(s, clock)).reviewRows))).toEqual([1, 1, 0]);
        expect(await decide(id, 2, taheri.id, { via: 'manual' })).toEqual({ ok: false, reason: 'order_not_found' });
        expect(await decide(id, 1, others.id, { via: 'manual' })).toEqual({ ok: false, reason: 'order_not_found' });
        expect(await store().orderForRow(ALL_ORDERS, id, others.orderNumber)).toBeNull();
        expect((await store().orderForRow(ALL_ORDERS, id, own.orderNumber))?.id).toBe(own.id);
        expect(await store().orderForRow(firstScope, id, own.orderNumber)).toBeNull();
        // ورود چاپخانه در محدودهٔ چاپخانهٔ دیگر «نیست»: سطر، تصمیم و «هیچ‌کدام».
        expect(await store().reviewRow(firstScope, id, 1)).toBeNull();
        expect(await decide(id, 1, own.id, { scope: firstScope })).toEqual({ ok: false, reason: 'not_found' });
        expect(await dismiss(id, 1, firstScope)).toEqual({ ok: false, reason: 'not_found' });
        expect(await decide(id, 1, own.id)).toMatchObject({ ok: true, from: 'handed_to_post', handed: false });
        // کنار گذاشتن کد سفارش چاپخانهٔ دیگر در محدودهٔ این یکی هم «نیست»، و کد زنده می‌ماند.
        const [code] = await liveOf(own.id);
        expect(
          await store().voidShipment(firstScope, {
            shipmentId: code!.id,
            reason: 'کد مال سفارش دیگری بود.',
            at: NOW,
            adminUserId: owner,
            event: { adminUserId: owner, action: 'shipments.void', at: NOW },
          }),
        ).toEqual({ ok: false, reason: 'not_found' });
        expect(await liveOf(own.id)).toHaveLength(1);
      });

      it('پنجرهٔ نامزدها در پایگاه داده همان پنجرهٔ خالص است: پرداخت تا ۴۵ روز پیش از روز پست، و تا پایان همان روز', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const later = tehran('2026-11-20 12:00');
        const candidatesOf = async (date: string, n: number) => {
          const id = await readImport([await near(1, barcodeOf(n), 'طاهری', taheri.id, 'تهران', { date })]);
          const seen = await previewOf(id, ALL_ORDERS, later);
          return [seen.judged[0]!.verdict, seen.candidates[1]?.candidates.map((c) => c.order.id) ?? []];
        };
        // روز پرداخت ۱۴۰۵/۰۷/۱۱ است: ۴۵ روز پس از آن، و همان روز، نامزد؛ ۴۶ روز پس از آن نه. هر کدام در فایل جدا، تا بازهٔ یک فایل
        // مرز دیگری را نپوشاند.
        expect(await candidatesOf('1405/08/26', 1)).toEqual(['review', [taheri.id]]);
        expect(await candidatesOf('1405/07/11', 2)).toEqual(['review', [taheri.id]]);
        expect(await candidatesOf('1405/08/27', 3)).toEqual(['unmatched', []]);
      });

      it('همین بارکد زنده برای سفارش دیگر: «همین است» و دادن دستی بسته، بی هیچ نوشتن، تا مالک آن کد را کنار بگذارد', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await printingOrder(TEHRAN, 'مریم کاظمی');
        const firstFile = await readImport([await near(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`, taheri.id)]);
        expect(await commit(firstFile)).toMatchObject({ ok: true, shipments: 1 });
        const id = await readImport([await near(1, barcodeOf(1), `کاظمی ${kazemi.orderNumber}`, kazemi.id)]);
        expect(await commit(id)).toMatchObject({ ok: true, counts: { review: 1 }, shipments: 0 });
        const card = await store().reviewRow(ALL_ORDERS, id, 1);
        expect(card).toMatchObject({ queued: true, elsewhere: { barcode: barcodeOf(1), orderNumber: taheri.orderNumber, importId: firstFile } });
        const eventsBefore = (await conn.db.select().from(adminEvents)).length;
        expect(await decide(id, 1, kazemi.id)).toEqual({ ok: false, reason: 'blocked', block: 'barcode_elsewhere' });
        expect(await decide(id, 1, kazemi.id, { via: 'manual' })).toEqual({ ok: false, reason: 'blocked', block: 'barcode_elsewhere' });
        expect(await orderOf(kazemi.id)).toMatchObject({ status: 'printing', handedToPostAt: null });
        expect(await shipmentsOf(kazemi.id)).toEqual([]);
        expect(await conn.db.select().from(adminEvents)).toHaveLength(eventsBefore);

        const [code] = await liveOf(taheri.id);
        expect(await voidOf(code!.id)).toMatchObject({ ok: true, reopened: true });
        expect((await store().reviewRow(ALL_ORDERS, id, 1))!.elsewhere).toBeNull();
        expect(await decide(id, 1, kazemi.id)).toEqual({ ok: true, orderNumber: kazemi.orderNumber, from: 'printing', handed: true, sms: expect.any(Number) });
      });

      it('هشدار «کد رهگیری ندارد»: «تحویل پست شد» بی کد زنده در پنجره؛ کددار، بیرون از پنجره، و سفارش چاپخانهٔ دیگر نه', async () => {
        const [noor] = await conn.db.insert(printPartners).values({ name: 'چاپ نور', ...MASHHAD }).returning();
        const bare = await handedOrder(TEHRAN, 'مهسا طاهری');
        const coded = await printingOrder(TEHRAN, 'مریم کاظمی');
        const mashhad = await handedOrder(MASHHAD, 'فرزانه کاظمی');
        const id = await readImport([await near(1, barcodeOf(1), `کاظمی ${coded.orderNumber}`, coded.id)]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 1 });
        const clock = (since: Date): PanelClock => ({ at: NOW, staleBefore: NOW, unreturnedBefore: NOW, untrackedSince: since });
        const untracked = async (scope: PanelScope, since: Date) => (await panelStore().alerts(scope, clock(since))).untracked;
        expect(await untracked(ALL_ORDERS, new Date(NOW.getTime() - 45 * DAY))).toEqual([
          { orderNumber: bare.orderNumber, handedToPostAt: NOW },
          { orderNumber: mashhad.orderNumber, handedToPostAt: NOW },
        ]);
        expect(await untracked({ kind: 'partner', partnerId: noor!.id }, new Date(NOW.getTime() - 45 * DAY))).toEqual([
          { orderNumber: mashhad.orderNumber, handedToPostAt: NOW },
        ]);
        // بیرون از پنجره: تحویل درست در مرز هم نه.
        expect(await untracked(ALL_ORDERS, NOW)).toEqual([]);
        // کدی که کنار رفت و سفارش را به «در حال چاپ» برگرداند: دیگر «تحویل پست شد» نیست و هشدار نمی‌گیرد.
        const [live] = await liveOf(coded.id);
        expect(await voidOf(live!.id)).toMatchObject({ reopened: true });
        expect((await untracked(ALL_ORDERS, new Date(NOW.getTime() - 45 * DAY))).map((u) => u.orderNumber)).toEqual([bare.orderNumber, mashhad.orderNumber]);
      });

      it('متن سطر: «هیچ‌کدام» پس از روزهای نگهداری پاک‌شدنی؛ سطر منتظر صف و سطری که کد گرفت، حتی کنارگذاشته، نه', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await printingOrder(TEHRAN, 'مریم کاظمی');
        const id = await readImport([
          await near(1, barcodeOf(1), `رضایی ${taheri.orderNumber}`, taheri.id),
          await near(2, barcodeOf(2), `رضایی ${kazemi.orderNumber}`, kazemi.id),
          row(3, barcodeOf(3), 'طهماسبی 6103'),
          row(4, barcodeOf(4), 'طهماسبی 6104'),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, counts: { review: 2, unmatched: 2 } });
        expect(await dismiss(id, 1)).toEqual({ ok: true });
        expect(await decide(id, 3, kazemi.id, { via: 'manual' })).toMatchObject({ ok: true });
        const [manual] = await liveOf(kazemi.id);
        expect(await voidOf(manual!.id)).toMatchObject({ ok: true });
        const purge = (rowNo: number) =>
          rejectedConstraint(
            conn.db
              .update(shipmentImportRows)
              .set({ cells: null, nameG: null, destination: null })
              .where(and(eq(shipmentImportRows.importId, id), eq(shipmentImportRows.rowNo, rowNo))),
          );
        expect(await purge(1)).toBeUndefined();
        expect(await purge(2)).toBe('shipment_import_rows_frozen');
        expect(await purge(3)).toBe('shipment_import_rows_frozen');
        expect(await purge(4)).toBeUndefined();
        expect(await rowOf(id, 1)).toMatchObject({ cells: null, nameG: null, destination: null, dismissedBy: operator });
      });
    });

    /**
     * پیامک رهگیری (برش ۶٫۳، ADR-047): یک ردیف «منتظر» برای هر مرسوله در همان تراکنش، فرستادن پس از commit فقط یک بار، سؤال ۶۷، و
     * محافظ‌های `0026`.
     */
    describe('پیامک رهگیری (برش ۶٫۳)', () => {
      const trackingRows = () => conn.db.select().from(smsMessages).where(eq(smsMessages.purpose, 'tracking')).orderBy(smsMessages.id);
      const smsOf = async (id: number) => (await conn.db.select().from(smsMessages).where(eq(smsMessages.id, id)))[0]!;
      const outbox = () => createSmsOutbox(conn, 'console');
      const deliver = (ids: readonly number[], mode: 'queued' | 'retry' = 'queued', at = NOW) =>
        deliverQueued({ outbox: outbox(), transport: consoleTransport(() => {}), now: () => at, log: () => {} }, ids, { mode });
      const liveOf = async (orderId: string) => (await shipmentsOf(orderId)).filter((s) => s.voidedAt === null);
      const decide = async (importId: string, rowNo: number, orderId: string, via: 'review' | 'manual' = 'review') => {
        const order = await orderOf(orderId);
        return store().decide(ALL_ORDERS, {
          importId,
          rowNo,
          orderId,
          via,
          seen: { status: order.status, liveShipments: (await liveOf(orderId)).length },
          at: NOW,
          adminUserId: operator,
          event: { adminUserId: operator, action: via === 'review' ? 'shipments.approve' : 'shipments.assign', at: NOW },
        });
      };
      const voidOf = (shipmentId: string) =>
        store().voidShipment(ALL_ORDERS, {
          shipmentId,
          reason: 'کد مال سفارش دیگری بود.',
          at: NOW,
          adminUserId: owner,
          event: { adminUserId: owner, action: 'shipments.void', at: NOW },
        });
      const near = async (n: number, barcode: string, nameG: string, orderId: string) =>
        parcel(n, barcode, nameG, 'تهران', (await orderOf(orderId)).estWeightGrams, 1_295_000);

      it('«ثبت»: یک پیامک منتظر برای هر کد قطعی، با متن و دو پارامتر و موبایل سفارش؛ صف و «پیدا نشد» هیچ؛ فرستادن یک بار', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await handedOrder(TEHRAN, 'مریم کاظمی');
        const karimi = await printingOrder(TEHRAN, 'علی کریمی');
        const id = await readImport([
          row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`),
          row(2, barcodeOf(2), `کاظمی ${kazemi.orderNumber}`),
          row(3, barcodeOf(3), `کاظمی ${kazemi.orderNumber}`),
          await near(4, barcodeOf(4), `رضایی ${karimi.orderNumber}`, karimi.id),
          row(5, barcodeOf(5), 'طهماسبی 6103'),
        ]);
        const written = await commit(id);
        expect(written).toMatchObject({ ok: true, shipments: 3, counts: { matched: 3, review: 1, unmatched: 1 } });
        if (!written.ok) return;
        const rows = await trackingRows();
        expect(rows).toHaveLength(3);
        expect(written.sms.sort()).toEqual(rows.map((r) => r.id).sort());
        expect(rows.map((r) => [r.status, r.toMobile, r.body, r.params, r.attempts])).toEqual([
          ['pending', '09152345678', trackingText(taheri.orderNumber, barcodeOf(1)), [String(taheri.orderNumber), barcodeOf(1)], 0],
          ['pending', '09152345678', trackingText(kazemi.orderNumber, barcodeOf(2)), [String(kazemi.orderNumber), barcodeOf(2)], 0],
          ['pending', '09152345678', trackingText(kazemi.orderNumber, barcodeOf(3)), [String(kazemi.orderNumber), barcodeOf(3)], 0],
        ]);
        // هر مرسوله پیامک خودش؛ بستهٔ دوم همان سفارش هم.
        const made = [...(await shipmentsOf(taheri.id)), ...(await shipmentsOf(kazemi.id))];
        expect(new Set(made.map((s) => s.smsMessageId)).size).toBe(3);
        expect(await shipmentsOf(karimi.id)).toEqual([]);

        // دو فرستنده هم‌زمان (دو نود): هر ردیف یک بار.
        const [a, b] = await Promise.all([deliver(written.sms), deliver(written.sms)]);
        expect([...a!, ...b!].filter((d) => d.outcome === 'sent')).toHaveLength(3);
        expect([...a!, ...b!].filter((d) => d.outcome === 'skipped')).toHaveLength(3);
        const sent = await trackingRows();
        expect(sent.map((r) => [r.status, r.provider, r.attempts, r.sentAt?.getTime()])).toEqual(
          sent.map(() => ['logged', 'console', 1, NOW.getTime()]),
        );
        // «رفت» پایان است: دوباره نه، و منجمد.
        expect((await deliver(written.sms, 'retry')).map((d) => d.outcome)).toEqual(['skipped', 'skipped', 'skipped']);
        expect(await rejectedConstraint(conn.db.update(smsMessages).set({ status: 'failed' }).where(eq(smsMessages.id, sent[0]!.id)))).toBe(
          'sms_messages_flow',
        );
        expect(await rejectedConstraint(conn.db.update(smsMessages).set({ body: 'دیگر' }).where(eq(smsMessages.id, sent[0]!.id)))).toBe(
          'sms_messages_frozen',
        );
        // نتیجهٔ فرستنده‌ای که دیر رسید (ردیف دیگر «در حال فرستادن» نیست) هیچ نمی‌نویسد.
        await outbox().finish(sent[0]!.id, NOW, { ok: false, provider: 'console', error: 'unavailable', tag: 'unavailable' });
        expect((await smsOf(sent[0]!.id)).status).toBe('logged');

        // صفحهٔ سفارش و پنل: کدهای زنده با پیامکشان.
        const details = await createOrderStore(conn).details(kazemi.publicToken);
        expect(details!.parcels.map((p) => [p.barcode, p.sms?.status])).toEqual([
          [barcodeOf(2), 'logged'],
          [barcodeOf(3), 'logged'],
        ]);
        const panel = await panelStore().details(ALL_ORDERS, kazemi.orderNumber);
        expect(panel!.shipments.map((s) => [s.barcode, s.sms?.toMobile, s.sms?.status])).toEqual([
          [barcodeOf(2), '09152345678', 'logged'],
          [barcodeOf(3), '09152345678', 'logged'],
        ]);
      });

      it('«همین است» و دادن دستی هر کدام یک پیامک؛ «هیچ‌کدام» هیچ؛ کد کنارگذاشته نه خودکار و نه «دوباره بفرست»', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await printingOrder(TEHRAN, 'مریم کاظمی');
        const id = await readImport([
          await near(1, barcodeOf(1), `رضایی ${taheri.orderNumber}`, taheri.id),
          await near(2, barcodeOf(2), `رضایی ${kazemi.orderNumber}`, kazemi.id),
          row(3, barcodeOf(3), 'طهماسبی 6103'),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 0, sms: [] });
        expect(await trackingRows()).toEqual([]);
        const approved = await decide(id, 1, taheri.id);
        expect(approved).toMatchObject({ ok: true, sms: expect.any(Number) });
        const dismissed = await store().dismiss(ALL_ORDERS, {
          importId: id,
          rowNo: 2,
          at: NOW,
          adminUserId: operator,
          event: { adminUserId: operator, action: 'shipments.dismiss', at: NOW },
        });
        expect(dismissed).toEqual({ ok: true });
        const assigned = await decide(id, 3, kazemi.id, 'manual');
        expect(assigned).toMatchObject({ ok: true, sms: expect.any(Number) });
        expect((await trackingRows()).map((r) => r.body)).toEqual([
          trackingText(taheri.orderNumber, barcodeOf(1)),
          trackingText(kazemi.orderNumber, barcodeOf(3)),
        ]);
        // کدی که پیش از فرستادن کنار رفت: پیامکش هرگز برداشته نمی‌شود، پایگاه داده هم.
        const [code] = await liveOf(kazemi.id);
        expect(await voidOf(code!.id)).toMatchObject({ ok: true });
        const kazemiSms = code!.smsMessageId!;
        expect(await deliver([kazemiSms])).toEqual([{ id: kazemiSms, outcome: 'skipped' }]);
        expect(await deliver([kazemiSms], 'retry', new Date(NOW.getTime() + SMS_STUCK_MS + 1))).toEqual([{ id: kazemiSms, outcome: 'skipped' }]);
        expect(
          await rejectedConstraint(
            conn.db
              .update(smsMessages)
              .set({ status: 'sending', attempts: 1, attemptedAt: NOW })
              .where(eq(smsMessages.id, kazemiSms)),
          ),
        ).toBe('sms_messages_live');
        expect((await smsOf(kazemiSms)).status).toBe('pending');
        // مشتری کد کنارگذاشته را دیگر نمی‌بیند.
        expect((await createOrderStore(conn).details(kazemi.publicToken))!.parcels).toEqual([]);
        expect((await createOrderStore(conn).details(taheri.publicToken))!.parcels.map((p) => p.barcode)).toEqual([barcodeOf(1)]);
      });

      it('«دوباره بفرست» فقط برای نرفته، منتظرِ مانده و در حال فرستادنِ مانده؛ دو کلیک هم‌زمان یک پیامک', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const id = await readImport([row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`)]);
        const written = await commit(id);
        if (!written.ok) throw new Error('commit');
        const [smsId] = written.sms;
        // منتظری که تازه است «دوباره» برداشته نمی‌شود (فرستنده‌اش هنوز در راه است)؛ منتظرِ مانده می‌شود.
        expect(await deliver([smsId!], 'retry')).toEqual([{ id: smsId, outcome: 'skipped' }]);
        const later = new Date(NOW.getTime() + SMS_STUCK_MS + 1);
        // پنل پیامک نپذیرفت: «نرفت»، با علت.
        const failing = createSmsOutbox(conn, 'console');
        const [failed] = await deliverQueued(
          { outbox: failing, transport: { name: 'console', send: () => Promise.reject(new Error('down')) }, now: () => later, log: () => {} },
          [smsId!],
          { mode: 'retry' },
        );
        expect(failed).toEqual({ id: smsId, outcome: 'failed', error: 'unavailable', tag: 'unavailable' });
        expect(await smsOf(smsId!)).toMatchObject({ status: 'failed', error: 'unavailable', attempts: 1, sentAt: null });
        // دو «دوباره بفرست» هم‌زمان: یکی.
        const [a, b] = await Promise.all([deliver([smsId!], 'retry', later), deliver([smsId!], 'retry', later)]);
        expect([a![0]!.outcome, b![0]!.outcome].sort()).toEqual(['sent', 'skipped']);
        expect(await smsOf(smsId!)).toMatchObject({ status: 'logged', attempts: 2, error: null });
        // در حال فرستادنی که ماند (فرستنده افتاد): پس از ۵ دقیقه دوباره برداشتنی، نه زودتر.
        const id2 = await readImport([row(1, barcodeOf(2), `طاهری ${taheri.orderNumber}`)]);
        const second = await commit(id2);
        if (!second.ok) throw new Error('commit');
        const stuck = second.sms[0]!;
        expect(await outbox().claim(stuck, NOW, 'queued')).toMatchObject({ id: stuck, to: '09152345678' });
        expect(await deliver([stuck], 'retry', new Date(NOW.getTime() + SMS_STUCK_MS))).toEqual([{ id: stuck, outcome: 'skipped' }]);
        expect(await deliver([stuck], 'retry', later)).toEqual([{ id: stuck, outcome: 'sent' }]);
        expect((await smsOf(stuck)).attempts).toBe(2);
      });

      it('سؤال ۶۷: همان کد برای همان سفارش پس از برگرداندن یا کنار گذاشتن پیامک دوباره نمی‌گیرد؛ نرفته، سفارش دیگر یا کد دیگر می‌گیرد', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await printingOrder(TEHRAN, 'مریم کاظمی');
        const rows = [row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`), row(2, barcodeOf(2), `کاظمی ${kazemi.orderNumber}`)];
        const raw = Buffer.from('<table><tr><td>67</td></tr></table>');
        const id = await readImport(rows, { raw });
        const first = await commit(id);
        if (!first.ok) throw new Error('commit');
        // فقط پیامک طاهری رفت؛ کاظمی «نرفت».
        const [taheriSms, kazemiSms] = [(await shipmentsOf(taheri.id))[0]!.smsMessageId!, (await shipmentsOf(kazemi.id))[0]!.smsMessageId!];
        await deliver([taheriSms]);
        await deliverQueued(
          { outbox: outbox(), transport: { name: 'console', send: () => Promise.reject(new Error('down')) }, log: () => {} },
          [kazemiSms],
        );
        expect(await revert(id)).toMatchObject({ ok: true, voided: 2 });
        // همان فایل دوباره: پیش‌نمایش می‌گوید کدام پیامک دوباره نمی‌رود.
        const again = await readImport(rows, { raw });
        expect((await previewOf(again)).smsBefore).toEqual([1]);
        const second = await commit(again);
        expect(second).toMatchObject({ ok: true, shipments: 2 });
        if (!second.ok) return;
        expect(second.sms).toHaveLength(1);
        const [taheriNow] = await liveOf(taheri.id);
        const [kazemiNow] = await liveOf(kazemi.id);
        expect(taheriNow!.smsMessageId).toBe(taheriSms);
        expect(kazemiNow!.smsMessageId).not.toBe(kazemiSms);
        expect(second.sms).toEqual([kazemiNow!.smsMessageId]);
        expect(await trackingRows()).toHaveLength(3);

        // کنار گذاشتن و دادن دستی همان کد به همان سفارش: همان پیامک. به سفارش دیگر: پیامک تازه.
        expect(await voidOf(taheriNow!.id)).toMatchObject({ ok: true, reopened: true });
        expect((await change(taheri, 'printing', 'handed_to_post')).ok).toBe(true);
        expect(await decide(again, 1, taheri.id, 'manual')).toMatchObject({ ok: true, sms: null });
        expect((await liveOf(taheri.id))[0]!.smsMessageId).toBe(taheriSms);
        const [back] = await liveOf(taheri.id);
        expect(await voidOf(back!.id)).toMatchObject({ ok: true });
        const other = await handedOrder(TEHRAN, 'زهرا محمدی');
        const moved = await decide(again, 1, other.id, 'manual');
        expect(moved).toMatchObject({ ok: true, sms: expect.any(Number) });
        expect(await trackingRows()).toHaveLength(4);

        // پایگاه داده هم: پیامک تازه برای کدی که همین سفارش پیش‌تر گرفت نه، و پیامک مرسولهٔ دیگر نه.
        const [otherCode] = await liveOf(other.id);
        expect(await voidOf(otherCode!.id)).toMatchObject({ ok: true });
        const source = (await conn.db.select().from(shipmentImportRows).where(and(eq(shipmentImportRows.importId, again), eq(shipmentImportRows.rowNo, 1))))[0]!;
        const insert = (smsMessageId: number | null) =>
          rejectedConstraint(
            conn.db.insert(shipments).values({
              orderId: taheri.id,
              barcode: barcodeOf(1),
              importId: again,
              rowNo: 1,
              weightGrams: source.weightGrams!,
              fareRials: source.fareRials!,
              taxRials: source.taxRials!,
              postDay: source.postDay!,
              matchedBy: 'manual',
              adminUserId: owner,
              smsMessageId,
            }),
          );
        expect(await insert(null)).toBe('shipments_sms');
        expect(await insert(await pendingSms(taheri.id))).toBe('shipments_sms_once');
        expect(await insert(kazemiNow!.smsMessageId)).toBe('shipments_sms_once');
        expect(await insert(taheriSms)).toBeUndefined();
      });

      it('پایگاه داده: پیامک مرسوله تازه، رهگیری و به موبایل همان سفارش؛ پیامک مرسولهٔ زنده‌ای دیگر نه؛ پیامک مرسوله منجمد', async () => {
        const taheri = await handedOrder(TEHRAN, 'مهسا طاهری');
        const id = await readImport([row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`), row(2, barcodeOf(2), `طاهری ${taheri.orderNumber}`)]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 2 });
        const [made] = await shipmentsOf(taheri.id);
        const source = (await conn.db.select().from(shipmentImportRows).where(and(eq(shipmentImportRows.importId, id), eq(shipmentImportRows.rowNo, 2))))[0]!;
        const second = (await shipmentsOf(taheri.id))[1]!;
        expect(await voidOf(second.id)).toMatchObject({ ok: true });
        const insert = (smsMessageId: number) =>
          rejectedConstraint(
            conn.db.insert(shipments).values({
              orderId: taheri.id,
              barcode: barcodeOf(2),
              importId: id,
              rowNo: 2,
              weightGrams: source.weightGrams!,
              fareRials: source.fareRials!,
              taxRials: source.taxRials!,
              postDay: source.postDay!,
              matchedBy: 'review',
              adminUserId: owner,
              smsMessageId,
            }),
          );
        // پیامک مرسولهٔ زندهٔ دیگر.
        expect(await insert(made!.smsMessageId!)).toBe('shipments_sms');
        // پیامک کد یا پرداخت، یا به موبایل دیگر.
        const [otp] = await conn.db
          .insert(smsMessages)
          .values({ provider: 'console', toMobile: '09152345678', purpose: 'otp', body: 'x', status: 'logged' })
          .returning();
        expect(await insert(otp!.id)).toBe('shipments_sms');
        const [elsewhere] = await conn.db
          .insert(smsMessages)
          .values({ provider: 'queued', toMobile: '09120000000', purpose: 'tracking', body: 'x', status: 'pending' })
          .returning();
        expect(await insert(elsewhere!.id)).toBe('shipments_sms');
        // پیامک رهگیری همین موبایل ولی نه تازه (پیش‌تر رفته، و مال هیچ مرسوله‌ای نیست).
        const [stale] = await conn.db
          .insert(smsMessages)
          .values({ provider: 'console', toMobile: '09152345678', purpose: 'tracking', body: 'x', status: 'logged', sentAt: NOW })
          .returning();
        expect(await insert(stale!.id)).toBe('shipments_sms');
        // پیامکی که پیش‌تر برداشته شد تازه نیست.
        const used = await pendingSms(taheri.id);
        await conn.db.update(smsMessages).set({ status: 'sending', attempts: 1, attemptedAt: NOW }).where(eq(smsMessages.id, made!.smsMessageId!));
        expect(await insert(used)).toBeUndefined();
        expect(await rejectedConstraint(conn.db.update(shipments).set({ smsMessageId: used }).where(eq(shipments.id, made!.id)))).toBe(
          'shipments_frozen',
        );
        // هم‌زمان با کنار گذاشتن هم نه.
        expect(
          await rejectedConstraint(
            conn.db
              .update(shipments)
              .set({ voidedAt: NOW, voidedBy: owner, voidReason: 'ساختگی', smsMessageId: used })
              .where(eq(shipments.id, made!.id)),
          ),
        ).toBe('shipments_frozen');
        // پیامک کد و پرداخت پس از درج عوض نمی‌شود.
        expect(await rejectedConstraint(conn.db.update(smsMessages).set({ status: 'failed' }).where(eq(smsMessages.id, otp!.id)))).toBe(
          'sms_messages_frozen',
        );
      });

      it('دو «ثبت» هم‌زمان یک ورود و دو تأیید هم‌زمان یک سطر: یک مرسوله، یک پیامک', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await printingOrder(TEHRAN, 'مریم کاظمی');
        const id = await readImport([row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`)]);
        const seen = await previewOf(id);
        const both = await Promise.all([commit(id, { fingerprint: seen.fingerprint }), commit(id, { fingerprint: seen.fingerprint })]);
        expect(both.filter((w) => w.ok)).toHaveLength(1);
        expect(await trackingRows()).toHaveLength(1);
        const id2 = await readImport([await near(1, barcodeOf(2), `رضایی ${kazemi.orderNumber}`, kazemi.id)]);
        expect(await commit(id2)).toMatchObject({ ok: true, shipments: 0 });
        const decisions = await Promise.all([decide(id2, 1, kazemi.id), decide(id2, 1, kazemi.id)]);
        expect(decisions.filter((d) => d.ok)).toHaveLength(1);
        expect(await trackingRows()).toHaveLength(2);
      });

      it('پیشخوان: پیامک نرفته، منتظرِ مانده و معلوم‌نبوده؛ رفته، تازه، کنارگذاشته و بیرون از محدوده نه', async () => {
        const taheri = await printingOrder(TEHRAN, 'مهسا طاهری');
        const kazemi = await printingOrder(TEHRAN, 'مریم کاظمی');
        const karimi = await printingOrder(TEHRAN, 'علی کریمی');
        const id = await readImport([
          row(1, barcodeOf(1), `طاهری ${taheri.orderNumber}`),
          row(2, barcodeOf(2), `کاظمی ${kazemi.orderNumber}`),
          row(3, barcodeOf(3), `کریمی ${karimi.orderNumber}`),
        ]);
        const written = await commit(id);
        if (!written.ok) throw new Error('commit');
        const smsOfOrder = async (orderId: string) => (await shipmentsOf(orderId))[0]!.smsMessageId!;
        await deliver([await smsOfOrder(kazemi.id)]);
        await deliverQueued(
          { outbox: outbox(), transport: { name: 'console', send: () => Promise.reject(new Error('down')) }, now: () => NOW, log: () => {} },
          [await smsOfOrder(karimi.id)],
        );
        const clock = {
          at: NOW,
          staleBefore: NOW,
          unreturnedBefore: NOW,
          untrackedSince: new Date(NOW.getTime() - 45 * DAY),
        };
        const alerts = (at: Date, scope: PanelScope = ALL_ORDERS) => panelStore().alerts(scope, { ...clock, at });
        expect((await alerts(NOW)).smsFailed).toEqual([karimi.orderNumber]);
        const later = new Date(NOW.getTime() + SMS_STUCK_MS + 1);
        expect((await alerts(later)).smsFailed).toEqual([taheri.orderNumber, karimi.orderNumber].sort((a, b) => a - b));
        expect((await alerts(later, { kind: 'partner', partnerId: randomUUID() })).smsFailed).toEqual([]);
        const [code] = await liveOf(karimi.id);
        expect(await voidOf(code!.id)).toMatchObject({ ok: true });
        expect((await alerts(later)).smsFailed).toEqual([taheri.orderNumber]);
        expect((await panelStore().alerts(ALL_ORDERS, { ...clock, at: later, untrackedSince: NOW })).smsFailed).toEqual([]);
      });
    });

    describe('گزارش حاشیهٔ ارسال (برش ۶٫۴)', () => {
      /** آغاز ماه‌های ۱۴۰۵ به وقت تهران (نیمه‌شب): شهریور، مهر و آبان. مرز را پنل از `Intl` می‌سازد؛ اینجا عدد. */
      const SHAHRIVAR = new Date('2026-08-22T20:30:00Z');
      const MEHR = new Date('2026-09-22T20:30:00Z');
      const ABAN = new Date('2026-10-22T20:30:00Z');
      const report = () => createShippingReportStore(conn);
      const mehr = () => report().handedOrders(ALL_ORDERS, { from: MEHR, to: ABAN });
      const tax = (fare: number) => Math.floor((fare + 5) / 10);
      /** تغییر وضعیت در لحظهٔ دلخواه (مرز ماه)، مثل `change`. */
      const changeAt = (order: { id: string }, from: OrderStatus, to: OrderStatus, at: Date, reason: string | null = null) =>
        panelStore().changeStatus(ALL_ORDERS, {
          orderId: order.id,
          from,
          to,
          at,
          adminUserId: owner,
          note: reason ? { reason } : null,
          event: { adminUserId: owner, action: 'orders.status', targetType: 'order', targetId: order.id, at },
        });
      const voidCode = (shipmentId: string) =>
        store().voidShipment(ALL_ORDERS, {
          shipmentId,
          reason: 'کد مال سفارش دیگری بود.',
          at: NOW,
          adminUserId: owner,
          event: { adminUserId: owner, action: 'shipments.void', at: NOW },
        });
      const numbersOf = (rows: { orderNumber: number }[]) => rows.map((r) => r.orderNumber);

      it('هر سفارش «تحویل پست شد» ماه با کرایهٔ منجمد و جمع بسته‌های زنده؛ کنارگذاشته، لغوشده و برگشته از پست نه؛ بی کد با صفر بسته', async () => {
        // بی چاپخانه (پیش از ۵٫۲، یا بی چاپخانهٔ فعال هنگام پرداخت): اول، تا غیرفعال کردن چاپخانه سفارش بازی نداشته باشد.
        await conn.db.update(printPartners).set({ isDefault: false, deactivatedAt: NOW });
        const loose = await printingOrder(TEHRAN, 'کیوان یوسفی');
        await conn.db.update(printPartners).set({ isDefault: true, deactivatedAt: null }).where(eq(printPartners.id, first));
        const [noor] = await conn.db
          .insert(printPartners)
          .values({ name: 'چاپ نور', provinceId: MASHHAD.provinceId, cityId: MASHHAD.cityId })
          .returning({ id: printPartners.id });
        const two = await printingOrder(TEHRAN, 'مهسا طاهری');
        const voided = await printingOrder(MASHHAD, 'مریم کاظمی');
        const bare = await handedOrder(TEHRAN, 'علی کریمی');
        // «تحویل پست شد» دستی، و کدی که بعد نشست و کنار رفت: سفارش در «تحویل پست شد» می‌ماند، بی کد زنده.
        const dropped = await handedOrder(TEHRAN, 'سارا رضایی');
        const cancelled = await printingOrder(TEHRAN, 'زهرا محمدی');
        expect((await change(cancelled, 'printing', 'cancelled', 'مشتری انصراف داد.')).ok).toBe(true);
        const back = await handedOrder(TEHRAN, 'امین قاسمی');
        expect((await change(back, 'handed_to_post', 'printing', 'اشتباه زدم.')).ok).toBe(true);
        expect((await orderOf(loose.id)).printPartnerId).toBeNull();
        expect((await orderOf(voided.id)).printPartnerId).toBe(noor!.id);

        const id = await readImport([
          parcel(1, barcodeOf(1), `طاهری ${two.orderNumber}`, 'تهران', 900, 1_295_000),
          parcel(2, barcodeOf(2), `طاهری ${two.orderNumber}`, 'تهران', 700, 1_500_000),
          parcel(3, barcodeOf(3), `کاظمی ${voided.orderNumber}`, 'مشهد', 1_100, 1_618_120),
          parcel(4, barcodeOf(4), `کاظمی ${voided.orderNumber}`, 'مشهد', 1_000, 1_377_500),
          parcel(5, barcodeOf(5), `یوسفی ${loose.orderNumber}`, 'تهران', 500, 1_295_000),
          parcel(6, barcodeOf(6), `رضایی ${dropped.orderNumber}`, 'تهران', 800, 1_295_000),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 6 });
        const fourth = (await shipmentsOf(voided.id)).find((s) => s.barcode === barcodeOf(4))!;
        expect(await voidCode(fourth.id)).toMatchObject({ ok: true });
        expect(await voidCode((await shipmentsOf(dropped.id))[0]!.id)).toMatchObject({ ok: true });
        expect((await orderOf(dropped.id)).status).toBe('handed_to_post');

        const rows = await mehr();
        expect(numbersOf(rows)).toEqual([loose, two, voided, bare, dropped].map((o) => o.orderNumber).sort((a, b) => a - b));
        const byNumber = new Map(rows.map((r) => [r.orderNumber, r]));
        const shippingOf = async (o: { id: string }) => BigInt((await orderOf(o.id)).shippingRials);
        expect(byNumber.get(two.orderNumber)).toEqual({
          orderNumber: two.orderNumber,
          zoneId: 'tehran',
          zoneName: 'استان تهران',
          partner: { id: first, name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران' },
          shippingRials: await shippingOf(two),
          estWeightGrams: (await orderOf(two.id)).estWeightGrams,
          parcels: 2,
          fareRials: 2_795_000n,
          taxRials: BigInt(tax(1_295_000) + tax(1_500_000)),
          weightGrams: 1_600,
        });
        // کد کنارگذاشته نه (تصمیم ۱۰۰): فقط بستهٔ زنده.
        expect(byNumber.get(voided.orderNumber)).toMatchObject({
          zoneId: 'other',
          zoneName: 'بقیهٔ کشور',
          partner: { id: noor!.id, name: 'چاپ نور', cityName: 'مشهد' },
          parcels: 1,
          fareRials: 1_618_120n,
          taxRials: BigInt(tax(1_618_120)),
          weightGrams: 1_100,
        });
        expect(byNumber.get(loose.orderNumber)).toMatchObject({ partner: null, parcels: 1, fareRials: 1_295_000n });
        // بی کد رهگیری: با صفر بسته، نه با کرایهٔ صفرِ یک مرسوله.
        expect(byNumber.get(bare.orderNumber)).toMatchObject({ parcels: 0, fareRials: 0n, taxRials: 0n, weightGrams: 0 });
        expect(byNumber.get(dropped.orderNumber)).toMatchObject({ parcels: 0, fareRials: 0n, taxRials: 0n, weightGrams: 0 });
        expect(typeof byNumber.get(two.orderNumber)!.shippingRials).toBe('bigint');

        // محدوده (ADR-042): چاپخانه فقط سفارش خودش.
        expect(numbersOf(await report().handedOrders({ kind: 'partner', partnerId: noor!.id }, { from: MEHR, to: ABAN }))).toEqual([
          voided.orderNumber,
        ]);
        // فهرست «بی کد رهگیری» زبانهٔ «سفارش‌ها» (تصمیم ۱۰۸) همان سفارش‌هایی است که گزارش با صفر بسته می‌شمارد.
        const clock = { at: NOW, staleBefore: NOW, unreturnedBefore: NOW, untrackedSince: NOW };
        const untracked = { kind: 'untracked', from: MEHR, to: ABAN } as const;
        const listed = await panelStore().list(ALL_ORDERS, { bucket: 'all', search: untracked, clock, limit: 50, offset: 0 });
        // فهرست «همه» تازه‌ترین اول است و گزارش کوچک‌ترین شماره اول.
        expect(numbersOf(listed).reverse()).toEqual(numbersOf(rows.filter((r) => r.parcels === 0)));
        expect(numbersOf(listed)).toEqual([dropped.orderNumber, bare.orderNumber]);
        expect(await panelStore().counts(ALL_ORDERS, { search: untracked, clock })).toMatchObject({ handed: 2, all: 2, open: 0 });
      });

      it('مرز نیمه‌شب تهران در آخر ماه: ۲۳:۵۹:۵۹ روز ۳۱ شهریور با شهریور، و نیمه‌شب ۱ مهر با مهر؛ ماه‌های داده‌دار با شمارشان', async () => {
        const paidAt = tehran('2026-09-15 10:00');
        // بسته‌ای که پست روز ۳۱ شهریور گرفت: «تحویل پست شد» یک ثانیه پیش از نیمه‌شب همان روز (`handedAtOf`).
        const late = await printingOrder(TEHRAN, 'مهسا طاهری', { paidAt });
        // تحویل دستی یک میلی‌ثانیه پیش از نیمه‌شب، و درست نیمه‌شب.
        const edge = await printingOrder(TEHRAN, 'مریم کاظمی', { paidAt });
        const midnight = await printingOrder(TEHRAN, 'علی کریمی', { paidAt });
        const bareMidnight = await printingOrder(TEHRAN, 'زهرا محمدی', { paidAt });
        expect((await changeAt(edge, 'printing', 'handed_to_post', new Date(MEHR.getTime() - 1))).ok).toBe(true);
        expect((await changeAt(midnight, 'printing', 'handed_to_post', MEHR)).ok).toBe(true);
        expect((await changeAt(bareMidnight, 'printing', 'handed_to_post', MEHR)).ok).toBe(true);
        const id = await readImport([
          parcel(1, barcodeOf(11), `طاهری ${late.orderNumber}`, 'تهران', 900, 1_295_000, { date: '1405/06/31' }),
          parcel(2, barcodeOf(12), `کریمی ${midnight.orderNumber}`, 'تهران', 900, 1_295_000, { date: '1405/07/01' }),
        ]);
        expect(await commit(id)).toMatchObject({ ok: true, shipments: 2 });
        expect((await orderOf(late.id)).handedToPostAt).toEqual(new Date(MEHR.getTime() - 1000));
        expect((await orderOf(midnight.id)).handedToPostAt).toEqual(MEHR);

        const shahrivar = await report().handedOrders(ALL_ORDERS, { from: SHAHRIVAR, to: MEHR });
        expect(numbersOf(shahrivar)).toEqual([late.orderNumber, edge.orderNumber]);
        expect(shahrivar.map((r) => r.parcels)).toEqual([1, 0]);
        expect(numbersOf(await mehr())).toEqual([midnight.orderNumber, bareMidnight.orderNumber]);
        // فیلتر «بی کد رهگیری» سفارش‌ها (تصمیم ۱۰۸) با همان مرز: ۲۳:۵۹:۵۹٫۹۹۹ شهریور، و نیمه‌شب مهر.
        const clock = { at: NOW, staleBefore: NOW, unreturnedBefore: NOW, untrackedSince: NOW };
        const untrackedIn = async (from: Date, to: Date) =>
          numbersOf(await panelStore().list(ALL_ORDERS, { bucket: 'all', search: { kind: 'untracked', from, to }, clock, limit: 50, offset: 0 }));
        expect(await untrackedIn(SHAHRIVAR, MEHR)).toEqual([edge.orderNumber]);
        expect(await untrackedIn(MEHR, ABAN)).toEqual([bareMidnight.orderNumber]);

        expect(await report().handedSpan(ALL_ORDERS)).toEqual({ first: new Date(MEHR.getTime() - 1000), last: MEHR });
        expect(await report().handedPerMonth(ALL_ORDERS, [SHAHRIVAR, MEHR])).toEqual([2, 2]);
        // ماه آخر تا هر وقت؛ ماه بی سفارش صفر، و سفارشی پیش از ماه اول هیچ‌جا.
        expect(await report().handedPerMonth(ALL_ORDERS, [MEHR])).toEqual([2]);
        expect(await report().handedPerMonth(ALL_ORDERS, [new Date('2026-07-22T20:30:00Z'), SHAHRIVAR, MEHR, ABAN])).toEqual([0, 2, 2, 0]);
        expect(await report().handedPerMonth(ALL_ORDERS, [])).toEqual([]);
        expect(await report().handedPerMonth({ kind: 'partner', partnerId: randomUUID() }, [SHAHRIVAR, MEHR])).toEqual([0, 0]);
        expect(await report().handedSpan({ kind: 'partner', partnerId: randomUUID() })).toBeNull();
      });

      it('بی «تحویل پست شد» هیچ ماهی نیست؛ مرزهای وزن کرایهٔ تعرفهٔ فعال', async () => {
        await printingOrder(TEHRAN, 'مهسا طاهری');
        expect(await report().handedSpan(ALL_ORDERS)).toBeNull();
        expect(await mehr()).toEqual([]);
        expect(await report().tariffBounds('post')).toEqual({ version: 1, bounds: [1_000, 3_000] });
        expect(await report().tariffBounds('tipax')).toEqual({ version: 1, bounds: [] });
      });

      it('بازه‌های وزن: پیش‌فرض «tariff» در دادهٔ پایه، و تغییر زیر قفل با «همان که دیده شد»، یک رویداد، و دو ذخیرهٔ هم‌زمان یکی', async () => {
        await conn.db.delete(settings).where(eq(settings.key, REPORT_BANDS_SETTING));
        const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
        expect(seeded.settingsInserted).toEqual([REPORT_BANDS_SETTING]);
        expect(await report().setting(REPORT_BANDS_SETTING)).toBe('tariff');
        const settingsStore = createSettingsStore(conn);
        const actor = { adminUserId: owner, ipHash: null };
        const save = (next: 'tariff' | number[], seen: string) =>
          settingsStore.change({ key: REPORT_BANDS_SETTING, action: 'settings.update', decide: bandsDecision(next, seen), at: NOW, actor });
        const events = () => conn.db.select().from(adminEvents).where(eq(adminEvents.targetId, REPORT_BANDS_SETTING));

        expect(await save([750, 1_500, 3_000], 'tariff')).toEqual({ ok: true, written: true });
        expect(await report().setting(REPORT_BANDS_SETTING)).toEqual([750, 1_500, 3_000]);
        expect(await readSetting((key) => report().setting(key), REPORT_BANDS_SETTING)).toEqual([750, 1_500, 3_000]);
        // همان مقصد دوباره (دو کلیک): موفق، بی رویداد دوم.
        expect(await save([750, 1_500, 3_000], 'tariff')).toEqual({ ok: true, written: false });
        // صفحه‌ای که هنوز «tariff» را دید، مقصد دیگری را نمی‌نویسد.
        expect(await save([2_000], 'tariff')).toEqual({ ok: false, reason: 'changed' });
        // مرزهای نزولی بیرون از قرارداد: رد، بی نوشتن.
        expect(await save([3_000, 1_000], '750,1500,3000')).toEqual({ ok: false, reason: 'invalid' });
        expect(await report().setting(REPORT_BANDS_SETTING)).toEqual([750, 1_500, 3_000]);
        // دو ذخیرهٔ هم‌زمان از همان صفحه، با دو مقصد: یکی می‌نشیند و دیگری «عوض شد».
        const both = await Promise.all([save([1_000], '750,1500,3000'), save([2_000], '750,1500,3000')]);
        expect(both.filter((r) => r.ok && r.written)).toHaveLength(1);
        expect(both.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'changed' }]);
        const now = await report().setting(REPORT_BANDS_SETTING);
        expect(bandsSeen(currentBands(now))).toMatch(/^(1000|2000)$/);
        // برگرداندن به بازه‌های تعرفه (تصمیم ۱۰۹).
        expect(await save('tariff', bandsSeen(currentBands(now)))).toEqual({ ok: true, written: true });
        expect(await report().setting(REPORT_BANDS_SETTING)).toBe('tariff');
        const log = await events();
        expect(log).toHaveLength(3);
        expect(log.map((e) => [e.action, e.targetType, (e.detail as { from: unknown }).from])).toEqual([
          ['settings.update', SETTING_TARGET, 'tariff'],
          ['settings.update', SETTING_TARGET, [750, 1_500, 3_000]],
          ['settings.update', SETTING_TARGET, now],
        ]);
        // مقدار خراب در پایگاه داده: پیش‌فرض، نه ترکیدن گزارش.
        await conn.db.update(settings).set({ value: [0, -5] }).where(eq(settings.key, REPORT_BANDS_SETTING));
        expect(currentBands(await report().setting(REPORT_BANDS_SETTING))).toBe('tariff');
        expect(await readSetting((key) => report().setting(key), REPORT_BANDS_SETTING, () => {})).toBe('tariff');
      });
    });
  });
  describe('مسیر خرید روی سایت روی پستگرس (برش ۷٫۵)', () => {
    const MIN = 60_000;
    let owner = '';
    const actor = (): SettingsActor => ({ adminUserId: owner, ipHash: 'ip-hash' });
    const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
    const previews = () => createCheckoutPreviewStore(conn);
    const rows = () => conn.db.select().from(checkoutPreviews).orderBy(checkoutPreviews.createdAt);
    const audienceTo = (value: string) =>
      conn.db.update(settings).set({ value }).where(eq(settings.key, CHECKOUT_AUDIENCE_SETTING));
    // «پس از» اکید و میکروثانیهٔ پستگرس (همان `tick` پیشخوان، برش ۷٫۲): هر زمان دو میلی‌ثانیه پس از هر چه پیش‌تر نوشته شد.
    const tick = async () => {
      const from = Date.now();
      while (Date.now() < from + 2) await new Promise((resolve) => setTimeout(resolve, 1));
      return new Date();
    };

    beforeAll(async () => {
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, checkout_previews, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      const [admin] = await conn.db.insert(adminUsers).values({ username: 'owner75', displayName: 'سارا رضایی' }).returning();
      owner = admin!.id;
    });

    beforeEach(async () => {
      // پاک‌نشدنی است (0034)؛ TRUNCATE تریگر ردیفی ندارد.
      await conn.db.execute(sql`TRUNCATE checkout_previews, admin_events`);
      await audienceTo('preview');
    });

    it('مخاطب: پیش‌فرض دادهٔ پایه «پیش‌نمایش مالک»؛ مقدار خراب هم همان پیش‌فرض، نه ترکیدن', async () => {
      expect(DEFAULT_SETTINGS[CHECKOUT_AUDIENCE_SETTING]).toBe('preview');
      await conn.db.delete(settings).where(eq(settings.key, CHECKOUT_AUDIENCE_SETTING));
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect((await conn.db.select({ value: settings.value }).from(settings).where(eq(settings.key, CHECKOUT_AUDIENCE_SETTING)))[0]?.value).toBe(
        'preview',
      );
      await audienceTo('everyone');
      expect(await checkoutAudience(conn)).toBe('everyone');
      await audienceTo('somebody');
      expect(await checkoutAudience(conn, () => {})).toBe('preview');
    });

    it('پیوند پیش‌نمایش: ۱۵ دقیقه، رویداد در همان تراکنش، و پیوند تازه بازنشدهٔ قبلی را می‌بندد', async () => {
      const first = hash();
      const at = new Date('2026-10-05T07:00:00Z');
      expect(await previews().create({ tokenHash: first, at, actor: actor() })).toEqual({ ok: true, linkExpiresAt: new Date(at.getTime() + 15 * MIN) });
      const second = hash();
      const later = new Date(at.getTime() + 5 * MIN);
      expect(await previews().create({ tokenHash: second, at: later, actor: actor() })).toMatchObject({ ok: true });
      const all = await rows();
      expect(all.map((row) => [row.tokenHash, row.closedAt, row.openedAt])).toEqual([
        [first, later, null],
        [second, null, null],
      ]);
      expect(all[1]).toMatchObject({ createdBy: owner, createdAt: later, linkExpiresAt: new Date(later.getTime() + 15 * MIN) });
      const events = await conn.db.select().from(adminEvents).orderBy(adminEvents.id);
      expect(events.map((event) => [event.action, event.targetType, event.targetId, event.adminUserId])).toEqual([
        [CHECKOUT_PREVIEW_EVENT, SETTING_TARGET, CHECKOUT_AUDIENCE_SETTING, owner],
        [CHECKOUT_PREVIEW_EVENT, SETTING_TARGET, CHECKOUT_AUDIENCE_SETTING, owner],
      ]);
      expect(events[1]!.detail).toEqual({ preview: all[1]!.id, until: new Date(later.getTime() + 15 * MIN).toISOString() });
      // هیچ هش یا توکنی در رویداد نیست.
      expect(JSON.stringify(events)).not.toContain(second);
      // پیوند بسته‌شده دیگر باز نمی‌شود؛ تازه باز می‌شود.
      expect(await previews().link(first, later)).toBeNull();
      expect(await previews().link(second, later)).toEqual({ linkExpiresAt: new Date(later.getTime() + 15 * MIN) });
    });

    it('ساختن فقط در مخاطب «پیش‌نمایش»: در «همه» و «متوقف» نه ردیف، نه رویداد', async () => {
      for (const audience of ['everyone', 'paused']) {
        await audienceTo(audience);
        expect(await previews().create({ tokenHash: hash(), at: new Date(), actor: actor() })).toEqual({ ok: false, reason: 'audience' });
      }
      expect(await rows()).toEqual([]);
      expect(await conn.db.select().from(adminEvents)).toEqual([]);
    });

    it('عوض شدن مخاطب و ساختن پیوند پشت‌سرهم‌اند (یک قفل): پیوند پس از «همه» ساخته نمی‌شود', async () => {
      const held = await conn.client.reserve();
      try {
        await held`BEGIN`;
        await held`SELECT pg_advisory_xact_lock(${SETTINGS_LOCK})`;
        await held`UPDATE settings SET value = '"everyone"'::jsonb WHERE key = ${CHECKOUT_AUDIENCE_SETTING}`;
        const pending = previews().create({ tokenHash: hash(), at: new Date(), actor: actor() });
        // هنوز پشت قفل است.
        expect(await Promise.race([pending.then(() => 'done'), new Promise((resolve) => setTimeout(() => resolve('waiting'), 200))])).toBe('waiting');
        await held`COMMIT`;
        expect(await pending).toEqual({ ok: false, reason: 'audience' });
      } finally {
        await held`ROLLBACK`.catch(() => {});
        held.release();
      }
      expect(await rows()).toEqual([]);
    });

    it('باز کردن: یک بار، فقط پیش از انقضا و فقط اگر بسته نشده؛ کوکی ۲۴ ساعت', async () => {
      const at = new Date('2026-10-05T07:00:00Z');
      const token = hash();
      await previews().create({ tokenHash: token, at, actor: actor() });
      // صفحهٔ پیوند (GET، بی مصرف) همان مرز را دارد: یک میلی‌ثانیه پیش از انقضا هنوز باز می‌شود، درست در لحظهٔ انقضا «دیگر کار نمی‌کند».
      expect(await previews().link(token, new Date(at.getTime() + 15 * MIN - 1))).toEqual({ linkExpiresAt: new Date(at.getTime() + 15 * MIN) });
      expect(await previews().link(token, new Date(at.getTime() + 15 * MIN))).toBeNull();
      // درست در لحظهٔ انقضا دیگر باز نمی‌شود.
      expect(await previews().open({ tokenHash: token, cookieHash: hash(), at: new Date(at.getTime() + 15 * MIN) })).toBeNull();
      const cookie = hash();
      const openedAt = new Date(at.getTime() + 15 * MIN - 1);
      expect(await previews().open({ tokenHash: token, cookieHash: cookie, at: openedAt })).toEqual({
        cookieExpiresAt: new Date(openedAt.getTime() + 24 * 60 * MIN),
      });
      // دوباره نه، با کوکی دیگر هم نه.
      expect(await previews().open({ tokenHash: token, cookieHash: hash(), at: openedAt })).toBeNull();
      expect(await previews().link(token, at)).toBeNull();
      // کوکی تا ۲۴ ساعت زنده است، و همان لحظهٔ انقضا نه.
      expect(await previews().session(cookie, new Date(openedAt.getTime() + 24 * 60 * MIN - 1))).toEqual({
        cookieExpiresAt: new Date(openedAt.getTime() + 24 * 60 * MIN),
      });
      expect(await previews().session(cookie, new Date(openedAt.getTime() + 24 * 60 * MIN))).toBeNull();
      expect(await previews().session(hash(), openedAt)).toBeNull();
      // «خروج»: یک بار؛ بعدش کوکی مرده است.
      expect(await previews().close(cookie, openedAt)).toBe(true);
      expect(await previews().close(cookie, openedAt)).toBe(false);
      expect(await previews().session(cookie, openedAt)).toBeNull();
      // پیوند بسته‌شده‌ای که هنوز وقت دارد هم باز نمی‌شود (پیوند تازه بستش).
      const old = hash();
      await previews().create({ tokenHash: old, at: new Date(at.getTime() + 20 * MIN), actor: actor() });
      await previews().create({ tokenHash: hash(), at: new Date(at.getTime() + 21 * MIN), actor: actor() });
      expect(await previews().open({ tokenHash: old, cookieHash: hash(), at: new Date(at.getTime() + 22 * MIN) })).toBeNull();
    });

    it('دو باز کردن هم‌زمان یک پیوند: یکی کوکی می‌گیرد', async () => {
      const at = new Date();
      const token = hash();
      await previews().create({ tokenHash: token, at, actor: actor() });
      await Promise.all(Array.from({ length: 8 }, () => conn.db.execute(sql`SELECT pg_sleep(0.02)`)));
      const opened = await Promise.all(Array.from({ length: 8 }, () => previews().open({ tokenHash: token, cookieHash: hash(), at })));
      expect(opened.filter(Boolean)).toHaveLength(1);
    });

    it('آخرین تغییر مخاطب («از امروز 10:40، سارا»): تازه‌ترین رویداد خودش با نام کننده؛ پیوند پیش‌نمایش و تنظیم دیگر نه؛ دستور سرور بی نام', async () => {
      expect(await lastAudienceChange(conn)).toBeNull();
      const store = createSettingsStore(conn);
      const move = (to: string, fresh: boolean, at: Date) =>
        store.change({
          key: CHECKOUT_AUDIENCE_SETTING,
          action: CHECKOUT_AUDIENCE_EVENT,
          at,
          actor: { adminUserId: owner, ipHash: 'ip-hash' },
          decide: (raw) => (raw === to ? { kind: 'same' } : { kind: 'write', value: to, detail: { from: raw, to, fresh } }),
        });
      const first = await tick();
      expect(await move('everyone', true, first)).toEqual({ ok: true, written: true });
      expect(await lastAudienceChange(conn)).toEqual({ at: first, by: 'سارا رضایی', from: 'preview', to: 'everyone', fresh: true });
      // رویدادهای دیگر همان هدف (پیوند پیش‌نمایش) و تنظیم دیگر جای آخرین تغییر مخاطب را نمی‌گیرند.
      await previews().create({ tokenHash: hash(), at: await tick(), actor: actor() }).catch(() => null);
      await conn.db.insert(adminEvents).values({
        adminUserId: owner,
        action: CHECKOUT_AUDIENCE_EVENT,
        targetType: SETTING_TARGET,
        targetId: 'order.sla_days',
        detail: { from: 'x', to: 'y' },
        at: await tick(),
      });
      expect(await lastAudienceChange(conn)).toMatchObject({ at: first, to: 'everyone' });
      // مقصد یکسان رویداد نمی‌نویسد؛ پلهٔ پایین بی کد؛ دستور روی سرور بی نام کننده.
      expect(await move('everyone', true, await tick())).toEqual({ ok: true, written: false });
      // دستور روی سرور، بی ادمین: همان ردیف و همان رویداد، بی نام کننده.
      const down = await tick();
      await conn.db.execute(sql`UPDATE settings SET value = '"paused"'::jsonb WHERE key = ${CHECKOUT_AUDIENCE_SETTING}`);
      await conn.db.insert(adminEvents).values({
        adminUserId: null,
        action: CHECKOUT_AUDIENCE_EVENT,
        targetType: SETTING_TARGET,
        targetId: CHECKOUT_AUDIENCE_SETTING,
        detail: { from: 'everyone', to: 'paused', fresh: false },
        at: down,
      });
      expect(await lastAudienceChange(conn)).toEqual({ at: down, by: null, from: 'everyone', to: 'paused', fresh: false });
      // دو رویداد در یک لحظه: تازه‌تر به شناسه.
      await move('preview', true, down);
      expect(await lastAudienceChange(conn)).toMatchObject({ at: down, from: 'paused', to: 'preview', by: 'سارا رضایی' });
      // جزئیات خراب: بی از و به، نه ترکیدن.
      const broken = await tick();
      await conn.db.insert(adminEvents).values({
        adminUserId: owner,
        action: CHECKOUT_AUDIENCE_EVENT,
        targetType: SETTING_TARGET,
        targetId: CHECKOUT_AUDIENCE_SETTING,
        detail: { from: 7, fresh: 'yes' },
        at: broken,
      });
      expect(await lastAudienceChange(conn)).toEqual({ at: broken, by: 'سارا رضایی', from: null, to: null, fresh: false });
    });

    it('دو پیوند هم‌زمان: هر دو ساخته می‌شوند، پشت‌سرهم، و یک پیوند باز می‌ماند', async () => {
      const made = await Promise.all(Array.from({ length: 6 }, () => tick().then((at) => previews().create({ tokenHash: hash(), at, actor: actor() }))));
      expect(made.every((result) => result.ok)).toBe(true);
      const all = await rows();
      expect(all).toHaveLength(6);
      expect(all.filter((row) => row.openedAt === null && row.closedAt === null)).toHaveLength(1);
    });

    describe('محافظ‌های 0034', () => {
      const base = (at = new Date('2026-10-05T07:00:00Z')) => ({
        tokenHash: hash(),
        createdBy: randomUUID(),
        createdAt: at,
        linkExpiresAt: new Date(at.getTime() + 15 * MIN),
      });
      const insert = (values: Partial<typeof checkoutPreviews.$inferInsert> = {}) =>
        conn.db
          .insert(checkoutPreviews)
          .values({ ...base(), ...values })
          .returning();
      const update = (id: string, values: Partial<typeof checkoutPreviews.$inferInsert>) =>
        conn.db.update(checkoutPreviews).set(values).where(eq(checkoutPreviews.id, id));
      const opened = async () => {
        const [row] = await insert();
        const at = new Date(row!.createdAt.getTime() + MIN);
        await update(row!.id, { openedAt: at, cookieHash: hash(), cookieExpiresAt: new Date(at.getTime() + 24 * 60 * MIN) });
        return { ...row!, openedAt: at };
      };

      it('شکل هش‌ها: فقط ۶۴ رقم hex کوچک', async () => {
        expect(await rejectedConstraint(insert({ tokenHash: 'abc' }))).toBe('checkout_previews_token_hash');
        expect(await rejectedConstraint(insert({ tokenHash: hash().toUpperCase() }))).toBe('checkout_previews_token_hash');
        const [row] = await insert();
        const at = new Date(row!.createdAt.getTime() + MIN);
        expect(
          await rejectedConstraint(update(row!.id, { openedAt: at, cookieHash: 'x'.repeat(64), cookieExpiresAt: new Date(at.getTime() + 24 * 60 * MIN) })),
        ).toBe('checkout_previews_cookie_hash');
      });

      it('عمر پیوند دقیقاً ۱۵ دقیقه و کوکی دقیقاً ۲۴ ساعت', async () => {
        const at = new Date('2026-10-05T07:00:00Z');
        expect(await rejectedConstraint(insert({ createdAt: at, linkExpiresAt: new Date(at.getTime() + 16 * MIN) }))).toBe('checkout_previews_link_ttl');
        const [row] = await insert();
        const openAt = new Date(row!.createdAt.getTime() + MIN);
        expect(
          await rejectedConstraint(update(row!.id, { openedAt: openAt, cookieHash: hash(), cookieExpiresAt: new Date(openAt.getTime() + 48 * 60 * MIN) })),
        ).toBe('checkout_previews_cookie_ttl');
      });

      it('باز شدن، هش کوکی و انقضای کوکی با هم', async () => {
        const [row] = await insert();
        expect(await rejectedConstraint(update(row!.id, { openedAt: new Date(row!.createdAt.getTime() + MIN) }))).toBe('checkout_previews_opened');
      });

      it('ردیف تازه باز نشده و بسته نشده است', async () => {
        const at = new Date('2026-10-05T07:00:00Z');
        expect(await rejectedConstraint(insert({ closedAt: at }))).toBe('checkout_previews_insert_state');
        expect(
          await rejectedConstraint(insert({ openedAt: at, cookieHash: hash(), cookieExpiresAt: new Date(at.getTime() + 24 * 60 * MIN) })),
        ).toBe('checkout_previews_insert_state');
      });

      it('هش پیوند، سازنده و زمان‌های ساختن منجمد', async () => {
        const [row] = await insert();
        expect(await rejectedConstraint(update(row!.id, { tokenHash: hash() }))).toBe('checkout_previews_frozen');
        expect(await rejectedConstraint(update(row!.id, { createdBy: randomUUID() }))).toBe('checkout_previews_frozen');
        expect(
          await rejectedConstraint(
            update(row!.id, { createdAt: new Date(row!.createdAt.getTime() + MIN), linkExpiresAt: new Date(row!.linkExpiresAt.getTime() + MIN) }),
          ),
        ).toBe('checkout_previews_frozen');
      });

      it('یک بار باز شدن: کوکی و زمانش پس از آن عوض نمی‌شوند', async () => {
        const row = await opened();
        expect(await rejectedConstraint(update(row.id, { cookieHash: hash() }))).toBe('checkout_previews_open_once');
        const again = new Date(row.openedAt.getTime() + MIN);
        expect(
          await rejectedConstraint(update(row.id, { openedAt: again, cookieExpiresAt: new Date(again.getTime() + 24 * 60 * MIN) })),
        ).toBe('checkout_previews_open_once');
      });

      it('باز شدن فقط پیش از انقضا و فقط اگر بسته نشده', async () => {
        const [late] = await insert();
        const at = late!.linkExpiresAt;
        expect(
          await rejectedConstraint(update(late!.id, { openedAt: at, cookieHash: hash(), cookieExpiresAt: new Date(at.getTime() + 24 * 60 * MIN) })),
        ).toBe('checkout_previews_open_window');
        await update(late!.id, { closedAt: late!.createdAt });
        const [closed] = await insert();
        await update(closed!.id, { closedAt: closed!.createdAt });
        const openAt = new Date(closed!.createdAt.getTime() + MIN);
        expect(
          await rejectedConstraint(update(closed!.id, { openedAt: openAt, cookieHash: hash(), cookieExpiresAt: new Date(openAt.getTime() + 24 * 60 * MIN) })),
        ).toBe('checkout_previews_open_window');
      });

      it('بستن یک بار، و پاک‌نشدنی', async () => {
        const row = await opened();
        await update(row.id, { closedAt: row.openedAt });
        expect(await rejectedConstraint(update(row.id, { closedAt: new Date(row.openedAt.getTime() + MIN) }))).toBe('checkout_previews_close_once');
        expect(await rejectedConstraint(update(row.id, { closedAt: null }))).toBe('checkout_previews_close_once');
        expect(await rejectedConstraint(conn.db.delete(checkoutPreviews).where(eq(checkoutPreviews.id, row.id)))).toBe(
          'checkout_previews_append_only',
        );
      });

      it('یک پیوند باز در هر زمان؛ بازشده یا بسته‌شده شمرده نمی‌شود', async () => {
        const [first] = await insert();
        expect(await rejectedConstraint(insert())).toBe('checkout_previews_one_open');
        const at = new Date(first!.createdAt.getTime() + MIN);
        await update(first!.id, { openedAt: at, cookieHash: hash(), cookieExpiresAt: new Date(at.getTime() + 24 * 60 * MIN) });
        const [second] = await insert();
        expect(await rejectedConstraint(insert())).toBe('checkout_previews_one_open');
        await update(second!.id, { closedAt: second!.createdAt });
        expect(await insert()).toHaveLength(1);
      });
    });

    it('درگاه آماده نیست: همان شرط پیشخوان، با پنجره', async () => {
      const at = await tick();
      await conn.db.insert(adminEvents).values({
        adminUserId: null,
        action: 'payments.gateway_rejected',
        targetType: 'order',
        targetId: randomUUID(),
        detail: { orderNumber: 10001, provider: 'zibal', result: 115 },
        at,
      });
      expect(await gatewayRejection(conn, new Date(at.getTime() - MIN))).toEqual({ at, orderNumber: null, provider: 'zibal', result: 115, stage: 'start' });
      // بیرون از پنجره نه.
      expect(await gatewayRejection(conn, at)).toBeNull();
      const merchantTest = async (outcome: 'ok' | 'rejected') =>
        conn.db.insert(adminEvents).values({
          adminUserId: owner,
          action: 'settings.key_test',
          targetType: SERVICE_KEY_TARGET,
          targetId: 'PAYMENT_MERCHANT_ID',
          detail: { name: 'PAYMENT_MERCHANT_ID', subject: 'current', outcome, ...(outcome === 'rejected' ? { status: 115 } : {}) },
          at: await tick(),
        });
      // «آزمایش» ردشدهٔ کد پذیرنده آماده‌اش نمی‌کند؛ «آزمایش» درست پس از آن می‌کند.
      await merchantTest('rejected');
      expect(await gatewayRejection(conn, new Date(at.getTime() - MIN))).toMatchObject({ at, result: 115, stage: 'start' });
      await merchantTest('ok');
      expect(await gatewayRejection(conn, new Date(at.getTime() - MIN))).toBeNull();
    });
  });
  describe('گزارش تولید و خروجی PDF گزارش‌ها روی پستگرس (برش ۱۰٫۲)', () => {
    const DAY = 86_400_000;
    const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);
    /** آغاز روزهای ۲۰، ۲۱ و ۲۲ مهر ۱۴۰۵ به وقت تهران (نیمه‌شب). مرز را پنل از `Intl` می‌سازد؛ اینجا عدد. */
    const MEHR_20 = tehran('2026-10-12 00:00');
    const MEHR_21 = tehran('2026-10-13 00:00');
    const MEHR_22 = tehran('2026-10-14 00:00');
    const TEHRAN = { provinceId: 8, cityId: 394 };
    const MASHHAD = { provinceId: 11, cityId: 1326 };
    /**
     * تعرفه‌ای با A5، گلاسه و منگنه، تا گزارش اندازه، کاغذ و صحافی را جدا بشمارد؛ فعال نمی‌شود و سفارش‌ها با همین نسخه منجمدند. شمارهٔ
     * دور از پیش‌نویس‌های بخش تعرفه (۲ به بعد)، که پیش از این بخش ساخته می‌شوند و پاک نمی‌شوند.
     */
    const spiral = SEED_PRICE_LIST.bindingTypes.spiral_clear!;
    const CATALOG: PriceList = {
      ...SEED_PRICE_LIST,
      version: 102,
      label: 'کاتالوگ گزارش تولید',
      printRates: { ...SEED_PRICE_LIST.printRates, a5: { single: { color: 15_000, bw: 12_000 }, double: { color: 13_000, bw: 10_000 } } },
      paperTypes: {
        tahrir80: { ...SEED_PRICE_LIST.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0 } },
        glossy: { nameFa: 'گلاسه', gsm: 120, enabled: true, sheetRates: { a4: 9_000, a5: 6_000 } },
      },
      bindingTypes: {
        spiral_clear: { ...spiral, bands: { ...spiral.bands, a5: [{ minSheets: 1, maxSheets: 800, priceRials: 400_000 }] } },
        staple: {
          nameFa: 'منگنه',
          enabled: true,
          minSheets: 1,
          maxSheetsPerVolume: 50,
          splitsVolumes: false,
          weightPerVolumeGrams: 2,
          bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 50_000 }], a5: [{ minSheets: 1, maxSheets: 50, priceRials: 40_000 }] },
        },
      },
    };
    let owner = '';
    let docId = '';
    let first = '';
    let noor = '';
    const production = () => createProductionReportStore(conn);
    const exportStore = () => createReportExportStore(conn);
    const numbersOf = (rows: { orderNumber: number }[]) => rows.map((row) => row.orderNumber);
    const panelStore = () => createPanelOrderStore(conn);
    const NOW = tehran('2026-10-14 11:20');

    /** یک جزوه: صفحه، نسخه، رنگ، رو، اندازه، صحافی، کاغذ و شمار فایل (صفحه‌ها میان فایل‌ها، بقیه با اولی). */
    interface Spec {
      pages: number;
      copies?: number;
      color?: boolean;
      sides?: 'single' | 'double';
      size?: 'a4' | 'a5';
      binding?: string;
      paper?: string;
      files?: number;
    }

    /** سفارش همان‌طور که سرور می‌سازد، با تعرفهٔ `CATALOG` و تخصیص پرداخت؛ `settle: false` پرداخت‌نشده. */
    async function paidOrder(specs: Spec[], { place = TEHRAN, paidAt = tehran('2026-10-12 10:00'), settle = true } = {}) {
      const zoneId = place.provinceId === 8 ? 'tehran' : 'other';
      const items = specs.map((spec) => {
        const files = spec.files ?? 1;
        const share = Math.floor(spec.pages / files);
        const sections = Array.from({ length: files }, (_, i) => ({ documentId: docId, pageCount: i === 0 ? spec.pages - share * (files - 1) : share }));
        const rules = [
          { pageRanges: [[1, spec.pages]] as [number, number][], colorMode: spec.color ? ('color' as const) : ('bw' as const), paperTypeId: spec.paper ?? 'tahrir80' },
        ];
        return {
          pageCount: spec.pages,
          copies: spec.copies ?? 1,
          sidesMode: spec.sides ?? ('double' as const),
          paperSize: spec.size ?? ('a4' as const),
          bindingTypeId: spec.binding ?? 'spiral_clear',
          sections,
          rules,
        };
      });
      const breakdown = quote({ items: items.map(({ pageCount: _pages, ...item }) => item), shipping: { methodId: 'post', zoneId } }, CATALOG);
      expect(breakdown.warnings).toEqual([]);
      const [user] = await conn.db
        .insert(users)
        .values({ mobile: '09153337777' })
        .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: new Date() } })
        .returning();
      const orderStore = createOrderStore(conn);
      const { order } = await orderStore.createOrder({
        checkoutKey: randomUUID(),
        userId: user!.id,
        breakdown,
        quoteSnapshot: null,
        slaDays: 2,
        shippingMethodId: 'post',
        shippingZoneId: zoneId,
        provinceId: place.provinceId,
        cityId: place.cityId,
        recipientName: 'مریم کاظمی',
        recipientPhone: '09153337777',
        addressText: 'بلوار سجاد، سجاد 18، پلاک 42',
        postalCode: null,
        items,
      });
      if (!settle) return order;
      const payment = await orderStore.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      const settled = await orderStore.settlePayment('mock', payment.authority, async ({ payment }) => ({
        kind: 'succeeded',
        verifiedAmountRials: payment.amountRials,
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt,
        postHandoffDueAt: new Date(paidAt.getTime() + 3 * DAY),
      }));
      return settled!.order;
    }

    const change = (order: { id: string }, from: OrderStatus, to: OrderStatus, reason: string | null = null) =>
      panelStore().changeStatus(ALL_ORDERS, {
        orderId: order.id,
        from,
        to,
        at: NOW,
        adminUserId: owner,
        note: reason ? { reason } : null,
        event: { adminUserId: owner, action: 'orders.status', targetType: 'order', targetId: order.id, at: NOW },
      });

    /** فایل چاپ جزوهٔ `seq` سفارش، مثل کارگر: یک جلد که همهٔ صفحه‌ها را می‌پوشاند. */
    async function printed(order: { id: string; orderNumber: number }, seq: number) {
      const [item] = await conn.db
        .select({ id: orderItems.id, pages: orderItems.pageCount })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, order.id), eq(orderItems.seq, seq)));
      await conn.db.insert(orderPrintFiles).values({
        orderItemId: item!.id,
        volume: 1,
        firstPage: 1,
        lastPage: item!.pages,
        storageKey: `orders/${order.orderNumber}/jozve-${seq}.pdf`,
        sizeBytes: 1_000,
        sha256: 'a'.repeat(64),
      });
    }

    beforeAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(
        sql`TRUNCATE paper_stock_moves, paper_stock_items, partner_ledger, report_exports, refunds, admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, support_messages, order_notes, ticket_templates, site_content_versions, site_content_drafts, site_images, site_image_files, order_tickets, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
      );
      await conn.db.execute(sql`TRUNCATE print_partners CASCADE`);
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      await seedPriceList(conn, CATALOG, { activate: false });
      first = (await conn.db.select({ id: printPartners.id }).from(printPartners))[0]!.id;
      const [partner] = await conn.db
        .insert(printPartners)
        .values({ name: 'چاپ نور', provinceId: MASHHAD.provinceId, cityId: MASHHAD.cityId })
        .returning({ id: printPartners.id });
      noor = partner!.id;
      const [admin] = await conn.db.insert(adminUsers).values({ username: 'owner102', displayName: 'الهام فرجی' }).returning();
      owner = admin!.id;
      const documentStore = createDocumentStore(conn);
      docId = randomUUID();
      await documentStore.insertUpload({
        id: docId,
        sessionHash: 'f'.repeat(64),
        originalName: 'آمار و احتمال.pdf',
        sourceKind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_000,
        storageKey: `uploads/${docId}.pdf`,
        uploadId: 'u',
        partSizeBytes: 8 * 1024 * 1024,
      });
      await documentStore.markUploaded(docId, NOW, new Date(NOW.getTime() + 2 * DAY), null);
      await conn.db.update(documents).set({ status: 'ready', pageCount: 120 }).where(eq(documents.id, docId));
    });

    afterAll(async () => {
      await clearOrders(conn);
      await conn.db.execute(sql`TRUNCATE report_exports, admin_events, jobs`);
    });

    it('سفارش‌های پرداخت‌شدهٔ روز با عددهای منجمد هر جزوه؛ مرز نیمه‌شب تهران، لغوشده با وضعیتش، و پرداخت‌نشده هرگز', async () => {
      // دو جزوه: سیاه‌سفید ۲۱ صفحه‌ای دورو در دو فایل و دو نسخه، و رنگی ۱۰ صفحه‌ای یکرو A5 گلاسه با منگنه.
      const a = await paidOrder([
        { pages: 21, copies: 2, files: 2 },
        { pages: 10, color: true, sides: 'single', size: 'a5', binding: 'staple', paper: 'glossy' },
      ]);
      // یک ثانیه پیش از نیمه‌شب ۲۰ مهر، و درست نیمه‌شب ۲۱ مهر.
      const edge = await paidOrder([{ pages: 100 }], { place: MASHHAD, paidAt: new Date(MEHR_21.getTime() - 1000) });
      const next = await paidOrder([{ pages: 40 }], { paidAt: MEHR_21 });
      const cancelled = await paidOrder([{ pages: 30 }]);
      expect((await change(cancelled, 'paid', 'cancelled', 'مشتری انصراف داد.')).ok).toBe(true);
      const unpaid = await paidOrder([{ pages: 12 }], { settle: false });
      const handed = await paidOrder([{ pages: 8 }]);
      expect((await change(handed, 'paid', 'printing')).ok).toBe(true);
      expect((await change(handed, 'printing', 'handed_to_post')).ok).toBe(true);
      await printed(a, 1);

      const day20 = await production().orders(ALL_ORDERS, { by: 'paid', from: MEHR_20, to: MEHR_21 }, null);
      expect(numbersOf(day20)).toEqual([a, edge, cancelled, handed].map((o) => o.orderNumber).sort((x, y) => x - y));
      const byNumber = new Map(day20.map((row) => [row.orderNumber, row]));
      const frozen = async (order: { id: string }) =>
        (await conn.db.select({ breakdown: orders.priceBreakdown, total: orders.totalRials }).from(orders).where(eq(orders.id, order.id)))[0]!;
      const aFrozen = await frozen(a);
      const items = (aFrozen.breakdown as Breakdown).items;
      expect(byNumber.get(a.orderNumber)).toEqual({
        orderNumber: a.orderNumber,
        status: 'paid',
        paidAt: tehran('2026-10-12 10:00'),
        totalRials: BigInt(aFrozen.total),
        partner: { id: first, name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران' },
        shareRials: null,
        items: [
          {
            seq: 1,
            pageCount: 21,
            copies: 2,
            sidesMode: 'double',
            paperSize: 'a4',
            bindingTypeId: 'spiral_clear',
            bindingName: 'طلق و سیم',
            files: 2,
            colorSides: 0,
            bwSides: 21,
            sheets: 11,
            volumes: 1,
            papers: [{ id: 'tahrir80', name: 'تحریر ۸۰ گرم' }],
            ready: true,
          },
          {
            seq: 2,
            pageCount: 10,
            copies: 1,
            sidesMode: 'single',
            paperSize: 'a5',
            bindingTypeId: 'staple',
            bindingName: 'منگنه',
            files: 1,
            colorSides: 10,
            bwSides: 0,
            sheets: 10,
            volumes: 1,
            papers: [{ id: 'glossy', name: 'گلاسه' }],
            ready: false,
          },
        ],
      } satisfies ProductionOrder);
      // همان عددهای ریز قیمت منجمد، نه شمارش دوباره.
      expect(byNumber.get(a.orderNumber)!.items.map((item) => [item.colorSides, item.bwSides, item.sheets, item.volumes])).toEqual(
        items.map((item) => [item.colorSides, item.bwSides, item.sheets, item.volumes]),
      );
      expect(typeof byNumber.get(a.orderNumber)!.totalRials).toBe('bigint');
      expect(byNumber.get(edge.orderNumber)).toMatchObject({ status: 'paid', partner: { id: noor, name: 'چاپ نور', cityName: 'مشهد' } });
      expect(byNumber.get(cancelled.orderNumber)!.status).toBe('cancelled');
      expect(byNumber.get(handed.orderNumber)!.status).toBe('handed_to_post');

      // روز بعد فقط نیمه‌شب ۲۱ مهر؛ بازهٔ شماره همه جز پرداخت‌نشده، که میانشان است.
      expect(numbersOf(await production().orders(ALL_ORDERS, { by: 'paid', from: MEHR_21, to: MEHR_22 }, null))).toEqual([next.orderNumber]);
      expect(unpaid.orderNumber).toBeGreaterThan(cancelled.orderNumber);
      expect(unpaid.orderNumber).toBeLessThan(handed.orderNumber);
      expect(
        numbersOf(await production().orders(ALL_ORDERS, { by: 'number', from: a.orderNumber, to: handed.orderNumber }, null)),
      ).toEqual([a, edge, next, cancelled, handed].map((o) => o.orderNumber));
      expect(await production().orders(ALL_ORDERS, { by: 'number', from: unpaid.orderNumber, to: unpaid.orderNumber }, null)).toEqual([]);
    });

    it('چاپخانهٔ انتخاب‌شده و محدودهٔ کاربر چاپخانه، در خود کوئری؛ فهرست چاپخانه‌ها با غیرفعال', async () => {
      const range = { by: 'paid', from: MEHR_20, to: MEHR_22 } as const;
      const all = await production().orders(ALL_ORDERS, range, null);
      const ofNoor = all.filter((row) => row.partner?.id === noor);
      expect(ofNoor.length).toBeGreaterThan(0);
      expect(await production().orders(ALL_ORDERS, range, noor)).toEqual(ofNoor);
      expect(await production().orders({ kind: 'partner', partnerId: noor }, range, null)).toEqual(ofNoor);
      // محدودهٔ یک چاپخانه با انتخاب چاپخانهٔ دیگر هیچ.
      expect(await production().orders({ kind: 'partner', partnerId: noor }, range, first)).toEqual([]);
      expect(await production().orders({ kind: 'partner', partnerId: randomUUID() }, range, null)).toEqual([]);

      await conn.db.insert(printPartners).values({ name: 'چاپ آینده', provinceId: TEHRAN.provinceId, cityId: TEHRAN.cityId, deactivatedAt: NOW });
      expect(await production().partners()).toEqual([
        { id: noor, name: 'چاپ نور', cityName: 'مشهد', active: true },
        { id: first, name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران', active: true },
        { id: expect.any(String), name: 'چاپ آینده', cityName: 'تهران', active: false },
      ]);
    });

    it('خروجی PDF: ردیف، کار ساختن و رویداد با هم؛ حال در حال ساختن، ساخته و ساخته نشد؛ فایل فقط ساخته‌شده', async () => {
      const event = { adminUserId: owner, action: 'reports.export', ipHash: 'ip', detail: { report: 'production', format: 'pdf' }, at: NOW };
      const context = { title: 'گزارش تولید', subtitle: 'پرداخت دوشنبه 20 مهر · همهٔ چاپخانه‌ها', stats: [{ label: 'سفارش', value: '3' }] };
      const id = await exportStore().create({
        report: 'production',
        context,
        fileName: 'gozaresh-tolid-1405-07-20.pdf',
        money: true,
        printPartnerId: null,
        requestedBy: owner,
        event,
      });
      expect(await conn.db.select().from(jobs).where(eq(jobs.reportExportId, id))).toMatchObject([
        { kind: RENDER_REPORT_JOB, status: 'queued', reportExportId: id, orderId: null },
      ]);
      expect(await conn.db.select().from(adminEvents).where(eq(adminEvents.targetId, id))).toMatchObject([
        { action: 'reports.export', targetType: 'report_export', adminUserId: owner, detail: { report: 'production', format: 'pdf' } },
      ]);
      expect(await exportStore().find(id)).toMatchObject({
        id,
        report: 'production',
        fileName: 'gozaresh-tolid-1405-07-20.pdf',
        subtitle: 'پرداخت دوشنبه 20 مهر · همهٔ چاپخانه‌ها',
        money: true,
        printPartnerId: null,
        requestedBy: owner,
        state: 'building',
        pages: null,
        sizeBytes: null,
        error: null,
        retryError: null,
      });
      expect(await exportStore().file(id)).toBeNull();
      // شکست گذرای کار: هنوز در حال ساختن، با خطای تلاش قبلی.
      await conn.db.update(jobs).set({ lastError: 'OSError(28)' }).where(eq(jobs.reportExportId, id));
      expect(await exportStore().find(id)).toMatchObject({ state: 'building', retryError: 'OSError(28)' });

      const pdf = Buffer.from('%PDF-1.7 ساختگی');
      await conn.db
        .update(reportExports)
        .set({ pdf, pages: 2, sha256: 'b'.repeat(64), finishedAt: NOW })
        .where(eq(reportExports.id, id));
      expect(await exportStore().find(id)).toMatchObject({ state: 'ready', pages: 2, sizeBytes: pdf.length, finishedAt: NOW });
      expect(await exportStore().file(id)).toEqual({
        pdf,
        report: 'production',
        fileName: 'gozaresh-tolid-1405-07-20.pdf',
        money: true,
        printPartnerId: null,
        requestedBy: owner,
      });

      // خروجی کاربر چاپخانه: بی مبلغ و با محدوده‌اش.
      const scoped = await exportStore().create({
        report: 'production',
        context,
        fileName: 'gozaresh-tolid-noor.pdf',
        money: false,
        printPartnerId: noor,
        requestedBy: owner,
        event,
      });
      expect(await exportStore().find(scoped)).toMatchObject({ money: false, printPartnerId: noor, state: 'building' });

      const failed = await exportStore().create({
        report: 'shipping',
        context,
        fileName: 'gozaresh-ersal-1405-07.pdf',
        money: true,
        printPartnerId: null,
        requestedBy: owner,
        event,
      });
      await conn.db.update(reportExports).set({ error: 'template_error: report خط 3', finishedAt: NOW }).where(eq(reportExports.id, failed));
      expect(await exportStore().find(failed)).toMatchObject({ report: 'shipping', state: 'failed', error: 'template_error: report خط 3' });
      expect(await exportStore().file(failed)).toBeNull();
      expect(await exportStore().find(randomUUID())).toBeNull();

      // پاک شدن خروجی کارش را هم می‌برد.
      await conn.db.delete(reportExports).where(eq(reportExports.id, failed));
      expect(await conn.db.select().from(jobs).where(eq(jobs.reportExportId, failed))).toEqual([]);
    });

    it('محافظ‌های خروجی: گزارش منجمد، نتیجه یک بار، شکل نتیجه، نام فایل و نوع، و کار فقط یک هدف و یکی برای هر خروجی', async () => {
      const event = { adminUserId: owner, action: 'reports.export', at: NOW };
      const make = () =>
        exportStore().create({
          report: 'production',
          context: { title: 'گزارش تولید' },
          fileName: 'gozaresh-tolid.pdf',
          money: false,
          printPartnerId: noor,
          requestedBy: owner,
          event,
        });
      const id = await make();
      const where = eq(reportExports.id, id);
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ context: { title: 'دیگر' } }).where(where))).toBe('report_exports_frozen');
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ fileName: 'digar.pdf' }).where(where))).toBe('report_exports_frozen');
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ requestedAt: NOW }).where(where))).toBe('report_exports_frozen');
      // دسترسی‌ای که دانلود با آن سنجیده می‌شود هم: مبلغ و محدوده.
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ money: true }).where(where))).toBe('report_exports_frozen');
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ printPartnerId: null }).where(where))).toBe('report_exports_frozen');
      // پایان بی PDF و بی خطا، PDF بی صفحه، و هر دو با هم نه؛ CHECK با NULL هم پذیرفته نمی‌شود.
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ finishedAt: NOW }).where(where))).toBe('report_exports_result');
      expect(
        await rejectedConstraint(conn.db.update(reportExports).set({ pdf: Buffer.from('%PDF'), sha256: 'c'.repeat(64), finishedAt: NOW }).where(where)),
      ).toBe('report_exports_result');
      expect(
        await rejectedConstraint(
          conn.db.update(reportExports).set({ pdf: Buffer.from('%PDF'), pages: 1, sha256: 'c'.repeat(64), error: 'x', finishedAt: NOW }).where(where),
        ),
      ).toBe('report_exports_result');
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ error: '   ', finishedAt: NOW }).where(where))).toBe('report_exports_result');
      expect(
        await rejectedConstraint(
          conn.db.update(reportExports).set({ pdf: Buffer.alloc(REPORT_EXPORT_MAX_BYTES + 1), pages: 1, sha256: 'c'.repeat(64), finishedAt: NOW }).where(where),
        ),
      ).toBe('report_exports_result');
      // نتیجهٔ درست یک بار؛ بار دوم، حتی همان، نه.
      await conn.db.update(reportExports).set({ error: 'template_error', finishedAt: NOW }).where(where);
      expect(await rejectedConstraint(conn.db.update(reportExports).set({ error: 'دیگر' }).where(where))).toBe('report_exports_finish_once');

      expect(
        await rejectedConstraint(
          conn.db.insert(reportExports).values({ report: 'production', context: {}, fileName: 'Gozaresh.pdf', money: false, requestedBy: owner }),
        ),
      ).toBe('report_exports_file_name');
      expect(
        await rejectedConstraint(
          conn.db.insert(reportExports).values({ report: 'tasvie', context: {}, fileName: 'gozaresh.pdf', money: false, requestedBy: owner }),
        ),
      ).toBe('report_exports_report');
      expect(
        await rejectedConstraint(
          conn.db.insert(reportExports).values({ report: 'production', context: [], fileName: 'gozaresh.pdf', money: false, requestedBy: owner }),
        ),
      ).toBe('report_exports_context');

      const other = await make();
      expect(
        await rejectedConstraint(conn.db.insert(jobs).values({ kind: RENDER_REPORT_JOB, reportExportId: other, documentId: docId, payload: {} })),
      ).toBe('jobs_one_target');
      expect(await rejectedConstraint(conn.db.insert(jobs).values({ kind: RENDER_REPORT_JOB, reportExportId: other, payload: {} }))).toBe(
        'jobs_report_export_kind',
      );
    });

    /**
     * تسویهٔ چاپخانه‌ها (برش ۱۰٫۳، ADR-069): همان سفارش‌سازی گزارش تولید (`paidOrder`، تخصیص پرداخت: مشهد به «چاپ نور»، تهران به «چاپخانهٔ
     * جزوه‌یار»)، با سفارش‌های پاک‌شده در آغاز.
     */
    describe('تسویهٔ چاپخانه‌ها روی پستگرس (برش ۱۰٫۳)', () => {
      const HOUR = 3_600_000;
      const settlement = () => createSettlementStore(conn);
      const partners = () => createPartnerStore(conn);
      const NOOR_ONLY: PanelScope = { kind: 'partner', partnerId: '' };
      const scopeOf = (partnerId: string): PanelScope => ({ kind: 'partner', partnerId });
      const MEHR: SettlementRange = { from: MEHR_21, until: MEHR_22 };
      let clerk = '';

      const shareOf = async (partnerId: string) =>
        (await conn.db.select({ bp: printPartners.shareBp }).from(printPartners).where(eq(printPartners.id, partnerId)))[0]!.bp;
      const setShare = async (partnerId: string, next: number, at = NOW) =>
        partners().setShare({
          id: partnerId,
          seen: await shareOf(partnerId),
          next,
          event: { adminUserId: owner, action: 'partners.share', targetType: 'partner', at },
        });
      /** تخصیص‌های یک سفارش، به ترتیب. */
      const assignmentsOf = async (order: { id: string }) =>
        conn.db
          .select({ to: orderAssignments.toPartnerId, bp: orderAssignments.shareBp, rials: orderAssignments.shareRials })
          .from(orderAssignments)
          .where(eq(orderAssignments.orderId, order.id))
          .orderBy(asc(orderAssignments.id));
      const subtotalOf = async (order: { id: string }) =>
        BigInt((await conn.db.select({ subtotal: orders.subtotalRials }).from(orders).where(eq(orders.id, order.id)))[0]!.subtotal);
      const moveAt = (order: { id: string }, from: OrderStatus, to: OrderStatus, at: Date) =>
        panelStore().changeStatus(ALL_ORDERS, {
          orderId: order.id,
          from,
          to,
          at,
          adminUserId: owner,
          note: to === 'cancelled' ? { reason: 'لغو' } : null,
          event: { adminUserId: owner, action: 'orders.status', targetType: 'order', targetId: order.id, at },
        });
      /** «در حال چاپ» و «تحویل پست شد» در یک لحظه. */
      async function handedAt(order: { id: string }, at: Date) {
        expect((await moveAt(order, 'paid', 'printing', at)).ok).toBe(true);
        expect((await moveAt(order, 'printing', 'handed_to_post', at)).ok).toBe(true);
      }
      const move = (order: { id: string }, from: string | null, to: string) =>
        panelStore().assignPartner(ALL_ORDERS, {
          orderId: order.id,
          from,
          to,
          at: NOW,
          adminUserId: owner,
          reason: 'جابه‌جایی آزمایشی',
          event: { adminUserId: owner, action: 'orders.assign', targetType: 'order', targetId: order.id, at: NOW },
        });
      const ledgerInput = (overrides: Partial<LedgerInput> & { seen: number }): LedgerInput => ({
        partnerId: noor,
        kind: 'payment',
        amountRials: 1_000_000n,
        day: MEHR_21,
        period: null,
        tracking: null,
        note: null,
        orderNumber: null,
        requestId: randomUUID(),
        at: NOW,
        event: { adminUserId: owner, action: 'settlements.payment', targetType: 'partner', targetId: noor, at: NOW },
        ...overrides,
      });
      const versionOf = async (partnerId = noor) =>
        (await settlement().statement(ALL_ORDERS, partnerId, MEHR))!.version;

      beforeAll(async () => {
        await clearOrders(conn);
        await conn.db.update(printPartners).set({ shareBp: null });
        const [admin] = await conn.db.insert(adminUsers).values({ username: 'clerk103', displayName: 'نگار امینی' }).returning();
        clerk = admin!.id;
        Object.assign(NOOR_ONLY, { partnerId: noor });
      });

      afterAll(async () => {
        await clearOrders(conn);
        await conn.db.update(printPartners).set({ shareBp: null });
      });

      it('سهم منجمد هر تخصیص: درصد همان لحظه، گرد به تومان، با جابه‌جایی آخرین تخصیص، و هر چه کد بفرستد نادیده', async () => {
        // درصد تعیین نشده: سفارش بی سهم.
        const unshared = await paidOrder([{ pages: 30 }], { place: MASHHAD });
        expect(await assignmentsOf(unshared)).toEqual([{ to: noor, bp: null, rials: null }]);

        // درصد ۶۵ از همان که مالک دید، با رویداد؛ بار دوم همان «same» و بی رویداد؛ از درصد کهنه «changed».
        const at = new Date(NOW.getTime() + 1_000);
        expect(await setShare(noor, 6_500, at)).toBe('ok');
        expect(await setShare(noor, 6_500)).toBe('same');
        expect(
          await partners().setShare({ id: noor, seen: null, next: 7_000, event: { adminUserId: owner, action: 'partners.share', at: NOW } }),
        ).toBe('changed');
        expect(await partners().setShare({ id: randomUUID(), seen: null, next: 1, event: { adminUserId: owner, action: 'partners.share', at: NOW } })).toBe(
          'not_found',
        );
        expect(await conn.db.select().from(adminEvents).where(and(eq(adminEvents.action, 'partners.share'), eq(adminEvents.at, at)))).toEqual([
          expect.objectContaining({ adminUserId: owner, targetId: noor, detail: { name: 'چاپ نور', from: null, to: 6_500 } }),
        ]);
        expect((await partners().find(noor))!.shareBp).toBe(6_500);

        const order = await paidOrder([{ pages: 100, copies: 3 }], { place: MASHHAD });
        const base = await subtotalOf(order);
        expect(await assignmentsOf(order)).toEqual([{ to: noor, bp: 6_500, rials: Number(shareRialsOf(base, 6_500)) }]);
        // پایه همان جمع چاپ، کاغذ و صحافی پیش از تخفیف است، نه مبلغ پرداخت.
        const [money] = await conn.db.select({ total: orders.totalRials, shipping: orders.shippingRials }).from(orders).where(eq(orders.id, order.id));
        expect(money!.shipping).toBeGreaterThan(0);
        expect(BigInt(money!.total)).not.toBe(base);

        // درصد تازه سهم سفارش سپرده‌شده را عوض نمی‌کند؛ جابه‌جایی به چاپخانهٔ بی درصد سفارش را بی سهم می‌کند، و برگشت درصد امروز را می‌گیرد.
        expect(await setShare(noor, 7_000)).toBe('ok');
        expect((await assignmentsOf(order))[0]).toEqual({ to: noor, bp: 6_500, rials: Number(shareRialsOf(base, 6_500)) });
        expect((await move(order, noor, first)).ok).toBe(true);
        expect((await move(order, first, noor)).ok).toBe(true);
        expect(await assignmentsOf(order)).toEqual([
          { to: noor, bp: 6_500, rials: Number(shareRialsOf(base, 6_500)) },
          { to: first, bp: null, rials: null },
          { to: noor, bp: 7_000, rials: Number(shareRialsOf(base, 7_000)) },
        ]);

        // گرد کردن: چند درصد با همان پایه، و ۰ («سهمی ندارد») و ۱۰۰ درصد، همه برابر تابع پیش‌نمایش.
        for (const bp of [1, 3_333, 9_999, 10_000, 0, 4_250]) {
          expect(await setShare(first, bp)).toBe('ok');
          const current = (await conn.db.select({ partner: orders.printPartnerId }).from(orders).where(eq(orders.id, order.id)))[0]!.partner;
          expect((await move(order, current, current === noor ? first : noor)).ok).toBe(true);
          if (current === first) expect((await move(order, noor, first)).ok).toBe(true);
          const last = (await assignmentsOf(order)).at(-1)!;
          expect(last).toEqual({ to: first, bp, rials: Number(shareRialsOf(base, bp)) });
        }

        // کد نمی‌تواند سهم بفرستد: ردیفی که با سهم ساختگی درج شود سهم امروز چاپخانه را می‌گیرد.
        const forged = await paidOrder([{ pages: 12 }], { place: MASHHAD });
        await conn.db.transaction(async (tx) => {
          await tx.update(orders).set({ printPartnerId: first }).where(eq(orders.id, forged.id));
          await tx.insert(orderAssignments).values({
            orderId: forged.id,
            fromPartnerId: noor,
            toPartnerId: first,
            at: NOW,
            actor: 'admin',
            adminUserId: owner,
            reason: 'ساختگی',
            shareBp: 10_000,
            shareRials: 990_000_000,
          });
        });
        expect((await assignmentsOf(forged)).at(-1)).toEqual({ to: first, bp: 4_250, rials: Number(shareRialsOf(await subtotalOf(forged), 4_250)) });

        // دیوارها: درصد بیرون از ۰ تا ۱۰۰؛ و بی تریگر، سهم نیمه یا ریال ناگرد.
        expect(await rejectedConstraint(conn.db.update(printPartners).set({ shareBp: 10_001 }).where(eq(printPartners.id, noor)))).toBe(
          'print_partners_share',
        );
        expect(await rejectedConstraint(conn.db.update(printPartners).set({ shareBp: -1 }).where(eq(printPartners.id, noor)))).toBe(
          'print_partners_share',
        );
        await conn.db.execute(sql`ALTER TABLE order_assignments DISABLE TRIGGER order_assignments_share`);
        try {
          const raw = (values: { shareBp: number | null; shareRials: number | null }) =>
            rejectedConstraint(
              conn.db.transaction(async (tx) => {
                await tx.update(orders).set({ printPartnerId: noor }).where(eq(orders.id, forged.id));
                await tx.insert(orderAssignments).values({
                  orderId: forged.id,
                  fromPartnerId: first,
                  toPartnerId: noor,
                  at: NOW,
                  actor: 'admin',
                  adminUserId: owner,
                  reason: 'بی تریگر',
                  ...values,
                });
                throw new Error('rollback');
              }),
            );
          expect(await raw({ shareBp: 6_500, shareRials: null })).toBe('order_assignments_share');
          expect(await raw({ shareBp: null, shareRials: 1_000 })).toBe('order_assignments_share');
          expect(await raw({ shareBp: 6_500, shareRials: 1_005 })).toBe('order_assignments_share');
          expect(await raw({ shareBp: 10_001, shareRials: 1_000 })).toBe('order_assignments_share');
          expect(await raw({ shareBp: 6_500, shareRials: -10 })).toBe('order_assignments_share');
          expect(await raw({ shareBp: 6_500, shareRials: 1_000 })).toBeUndefined();
        } finally {
          await conn.db.execute(sql`ALTER TABLE order_assignments ENABLE TRIGGER order_assignments_share`);
        }
      });

      it('صورت‌حساب: مانده پیش از بازه، پایان بازه و امروز؛ «تحویل پست شد»ها، لغو پس از چاپ، در راه، و دفتر با باطل‌شده', async () => {
        await clearOrders(conn);
        await conn.db.update(printPartners).set({ shareBp: null });
        const unsharedHanded = await paidOrder([{ pages: 20 }], { place: MASHHAD });
        await handedAt(unsharedHanded, new Date(MEHR_21.getTime() + 2 * HOUR));
        expect(await setShare(noor, 6_000)).toBe('ok');
        const before = await paidOrder([{ pages: 40 }], { place: MASHHAD });
        await handedAt(before, new Date(MEHR_20.getTime() + 10 * HOUR));
        const inRange = await paidOrder([{ pages: 60, copies: 2 }], { place: MASHHAD });
        // درست نیمه‌شب آغاز بازه، و یک ثانیه پیش از پایانش.
        await handedAt(inRange, MEHR_21);
        const edge = await paidOrder([{ pages: 10 }], { place: MASHHAD });
        await handedAt(edge, new Date(MEHR_22.getTime() - 1_000));
        const after = await paidOrder([{ pages: 16 }], { place: MASHHAD });
        await handedAt(after, MEHR_22);
        const printing = await paidOrder([{ pages: 24 }], { place: MASHHAD });
        expect((await moveAt(printing, 'paid', 'printing', NOW)).ok).toBe(true);
        const queued = await paidOrder([{ pages: 8 }], { place: MASHHAD });
        const cancelledPrinting = await paidOrder([{ pages: 50 }], { place: MASHHAD });
        expect((await moveAt(cancelledPrinting, 'paid', 'printing', MEHR_21)).ok).toBe(true);
        expect((await moveAt(cancelledPrinting, 'printing', 'cancelled', new Date(MEHR_21.getTime() + HOUR))).ok).toBe(true);
        const cancelledQueued = await paidOrder([{ pages: 18 }], { place: MASHHAD });
        expect((await moveAt(cancelledQueued, 'paid', 'cancelled', new Date(MEHR_21.getTime() + HOUR))).ok).toBe(true);
        // سفارش چاپخانهٔ دیگر در صورت‌حساب «چاپ نور» نیست.
        const theirs = await paidOrder([{ pages: 30 }]);
        await handedAt(theirs, new Date(MEHR_21.getTime() + HOUR));

        const share = async (order: { id: string }) => shareRialsOf(await subtotalOf(order), 6_000);
        let version = 0;
        const write = async (overrides: Partial<LedgerInput>) => {
          const result = await settlement().record(ledgerInput({ seen: version, ...overrides }));
          expect(result.ok).toBe(true);
          version += 1;
          return result.ok ? result.entry : null!;
        };
        const paidBefore = await write({ amountRials: 300_000n, day: MEHR_20, tracking: 'PY-1' });
        const paidIn = await write({
          amountRials: 450_000n,
          day: MEHR_21,
          period: { from: MEHR_20, until: MEHR_21 },
          tracking: '803114',
          note: 'کارت به کارت',
        });
        const bonus = await write({ kind: 'adjustment', amountRials: 120_000n, day: MEHR_21, note: 'هزینهٔ پست مهر' });
        const penalty = await write({
          kind: 'adjustment',
          amountRials: -80_000n,
          day: new Date(MEHR_22.getTime() - 1_000),
          note: 'نیمی از چاپ لغوشده',
          orderNumber: cancelledPrinting.orderNumber,
        });
        const wrong = await write({ amountRials: 999_990n, day: MEHR_21, note: 'اشتباه' });
        const voided = await settlement().voidEntry({
          partnerId: noor,
          id: wrong.id,
          reason: 'دو بار ثبت شد',
          seen: version,
          at: NOW,
          event: { adminUserId: owner, action: 'settlements.void', targetType: 'partner', targetId: noor, at: NOW },
        });
        expect(voided).toMatchObject({ ok: true, already: false });
        version += 1;
        const paidAfter = await write({ amountRials: 100_000n, day: MEHR_22 });

        const statement = (await settlement().statement(ALL_ORDERS, noor, MEHR))!;
        expect(statement.partner).toEqual({ id: noor, name: 'چاپ نور', cityName: 'مشهد', active: true, isDefault: false, shareBp: 6_000 });
        expect(statement.handed.map((row) => row.orderNumber)).toEqual([inRange, unsharedHanded, edge].map((o) => o.orderNumber));
        expect(statement.handed[0]).toEqual({
          orderNumber: inRange.orderNumber,
          status: 'handed_to_post',
          paidAt: tehran('2026-10-12 10:00'),
          at: MEHR_21,
          baseRials: await subtotalOf(inRange),
          shareBp: 6_000,
          shareRials: await share(inRange),
        });
        expect(statement.handed[1]).toMatchObject({ orderNumber: unsharedHanded.orderNumber, shareBp: null, shareRials: null });
        expect(statement.cancelledAfterPrint).toEqual([
          expect.objectContaining({
            orderNumber: cancelledPrinting.orderNumber,
            status: 'cancelled',
            at: new Date(MEHR_21.getTime() + HOUR),
            shareRials: await share(cancelledPrinting),
          }),
        ]);
        expect(statement.inFlight.map((row) => [row.orderNumber, row.status, row.at])).toEqual([
          [printing.orderNumber, 'printing', null],
          [queued.orderNumber, 'paid', null],
        ]);
        expect(statement.ledger.map((entry) => entry.id)).toEqual([paidIn.id, bonus.id, wrong.id, penalty.id]);
        expect(statement.ledger.find((entry) => entry.id === wrong.id)!.voided).toEqual({
          at: NOW,
          by: owner,
          byName: 'الهام فرجی',
          reason: 'دو بار ثبت شد',
        });
        expect(statement.ledger[0]).toEqual({
          id: paidIn.id,
          partnerId: noor,
          kind: 'payment',
          amountRials: 450_000n,
          day: MEHR_21,
          period: { from: MEHR_20, until: MEHR_21 },
          tracking: '803114',
          note: 'کارت به کارت',
          orderNumber: null,
          createdAt: NOW,
          createdBy: owner,
          createdByName: 'الهام فرجی',
          voided: null,
        });
        expect(statement.ledger.find((entry) => entry.id === penalty.id)!.orderNumber).toBe(cancelledPrinting.orderNumber);

        const opening = (await share(before)) - 300_000n;
        expect(statement.openingRials).toBe(opening);
        const closing = opening + (await share(inRange)) + (await share(edge)) + 120_000n - 80_000n - 450_000n;
        expect(statement.closingRials).toBe(closing);
        expect(statement.balanceRials).toBe(closing + (await share(after)) - 100_000n);
        expect(statement.version).toBe(version);
        expect(paidBefore.tracking).toBe('PY-1');
        expect(paidAfter.day).toEqual(MEHR_22);

        // نمای کلی: همان ماندهٔ امروز، در راه، بی سهم و آخرین پرداخت باطل‌نشده.
        const overview = await settlement().overview(ALL_ORDERS);
        // پیش‌فرض، بعد فعال، بعد غیرفعال (چاپخانه‌ای که بخش گزارش تولید غیرفعال کرد).
        expect(overview.slice(0, 2).map((row) => row.id)).toEqual([first, noor]);
        expect(overview.slice(2).map((row) => [row.active, row.balanceRials])).toEqual(overview.slice(2).map(() => [false, 0n]));
        expect(overview[1]).toEqual({
          id: noor,
          name: 'چاپ نور',
          cityName: 'مشهد',
          active: true,
          isDefault: false,
          shareBp: 6_000,
          balanceRials: statement.balanceRials,
          inFlight: { orders: 2, shareRials: (await share(printing)) + (await share(queued)) },
          unshared: 1,
          lastPayment: { day: MEHR_22, amountRials: 100_000n },
        });
        expect(overview[0]).toMatchObject({ id: first, shareBp: null, balanceRials: 0n, unshared: 1, lastPayment: null });

        // محدوده: کاربر «چاپ نور» فقط خودش؛ چاپخانهٔ دیگر همان «نیست».
        expect((await settlement().overview(NOOR_ONLY)).map((row) => row.id)).toEqual([noor]);
        expect((await settlement().statement(NOOR_ONLY, noor, MEHR))!.balanceRials).toBe(statement.balanceRials);
        expect(await settlement().statement(NOOR_ONLY, first, MEHR)).toBeNull();
        expect(await settlement().statement(scopeOf(first), noor, MEHR)).toBeNull();
        expect(await settlement().statement(ALL_ORDERS, randomUUID(), MEHR)).toBeNull();

        // سفارش اصلاح: هر سفارشی که روزی به همین چاپخانه سپرده شد؛ سفارش چاپخانهٔ دیگر نه.
        expect(await settlement().adjustable(noor, cancelledQueued.orderNumber)).toMatchObject({ status: 'cancelled', shareRials: await share(cancelledQueued) });
        expect(await settlement().adjustable(noor, theirs.orderNumber)).toBeNull();
        expect(await settlement().adjustable(first, theirs.orderNumber)).toMatchObject({ status: 'handed_to_post', shareBp: null });
        expect(await settlement().adjustable(noor, 99_999_999)).toBeNull();
        expect((await settlement().entry(noor, paidIn.id))!.amountRials).toBe(450_000n);
        expect(await settlement().entry(first, paidIn.id)).toBeNull();
      });

      it('ثبت پرداخت و اصلاح: رویداد بی متن، دو کلیک یک ردیف، فرم کهنه، شناسهٔ فرم دیگر، و سفارشی که مال این چاپخانه نبود', async () => {
        await clearOrders(conn);
        const order = await paidOrder([{ pages: 20 }], { place: MASHHAD });
        const elsewhere = await paidOrder([{ pages: 20 }]);
        const seen = await versionOf();
        const at = new Date(NOW.getTime() + 7_000);
        const input = ledgerInput({
          seen,
          amountRials: 2_500_000n,
          period: { from: MEHR_20, until: MEHR_22 },
          tracking: 'TR-77',
          note: 'تسویهٔ هفتهٔ اول',
          at,
          event: { adminUserId: owner, action: 'settlements.payment', targetType: 'partner', targetId: noor, at },
        });
        const written = await settlement().record(input);
        expect(written).toMatchObject({ ok: true, duplicate: false, entry: { amountRials: 2_500_000n, tracking: 'TR-77' } });
        const events = await conn.db.select().from(adminEvents).where(and(eq(adminEvents.action, 'settlements.payment'), eq(adminEvents.at, at)));
        expect(events).toEqual([
          expect.objectContaining({
            adminUserId: owner,
            targetType: 'partner',
            targetId: noor,
            detail: {
              entry: written.ok ? written.entry.id : 0,
              partner: { id: noor, name: 'چاپ نور' },
              amountRials: 2_500_000,
              day: MEHR_21.toISOString(),
              period: { from: MEHR_20.toISOString(), until: MEHR_22.toISOString() },
            },
          }),
        ]);
        // دو کلیک: همان ردیف، بی ردیف و رویداد دوم؛ همان شناسه با مبلغ دیگر «conflict».
        expect(await settlement().record(input)).toMatchObject({ ok: true, duplicate: true, entry: { id: written.ok ? written.entry.id : 0 } });
        expect(await settlement().record({ ...input, amountRials: 2_500_010n })).toEqual({ ok: false, reason: 'conflict' });
        expect(await settlement().record({ ...input, event: { ...input.event, adminUserId: clerk } })).toEqual({ ok: false, reason: 'conflict' });
        expect(await conn.db.select().from(partnerLedger).where(eq(partnerLedger.requestId, input.requestId))).toHaveLength(1);
        expect((await settlement().byRequest(input.requestId))?.id).toBe(written.ok ? written.entry.id : 0);
        expect(await settlement().byRequest(randomUUID())).toBeNull();
        expect(await settlement().version(noor)).toBe(seen + 1);
        expect(await settlement().version(randomUUID())).toBeNull();
        expect(await conn.db.select().from(adminEvents).where(and(eq(adminEvents.action, 'settlements.payment'), eq(adminEvents.at, at)))).toHaveLength(1);
        // فرم کهنه: دفتر از وقتی دیده شد یکی بالا رفته.
        expect(await settlement().record(ledgerInput({ seen }))).toEqual({ ok: false, reason: 'changed' });
        expect(await settlement().record(ledgerInput({ seen: seen + 1, partnerId: randomUUID() }))).toEqual({ ok: false, reason: 'not_found' });

        // اصلاح برای سفارش: فقط سفارشی که روزی به همین چاپخانه سپرده شد؛ جابه‌جاشده هم.
        const adjust = (orderNumber: number, version: number) =>
          settlement().record(
            ledgerInput({
              seen: version,
              kind: 'adjustment',
              amountRials: -50_000n,
              note: 'برگهٔ خراب',
              orderNumber,
              event: { adminUserId: clerk, action: 'settlements.adjust', targetType: 'partner', targetId: noor, at: NOW },
            }),
          );
        expect(await adjust(elsewhere.orderNumber, seen + 1)).toEqual({ ok: false, reason: 'order_not_found' });
        expect(await adjust(99_999_999, seen + 1)).toEqual({ ok: false, reason: 'order_not_found' });
        expect((await move(order, noor, first)).ok).toBe(true);
        const adjusted = await adjust(order.orderNumber, seen + 1);
        expect(adjusted).toMatchObject({ ok: true, entry: { kind: 'adjustment', amountRials: -50_000n, orderNumber: order.orderNumber, createdBy: clerk } });
        expect(await conn.db.select({ detail: adminEvents.detail }).from(adminEvents).where(eq(adminEvents.action, 'settlements.adjust'))).toEqual([
          { detail: expect.objectContaining({ amountRials: -50_000, orderNumber: order.orderNumber }) },
        ]);
        expect(JSON.stringify(events[0]!.detail)).not.toContain('TR-77');
        expect(JSON.stringify(events[0]!.detail)).not.toContain('تسویهٔ هفتهٔ اول');
      });

      it('باطل کردن: یک بار با دلیل، دو کلیک یکی، باطل دیگری گفته می‌شود، فرم کهنه، و ردیف چاپخانهٔ دیگر نه', async () => {
        await clearOrders(conn);
        const seen = await versionOf();
        const written = await settlement().record(ledgerInput({ seen, amountRials: 700_000n }));
        if (!written.ok) throw new Error('ثبت نشد');
        const at = new Date(NOW.getTime() + 9_000);
        const voidInput = {
          partnerId: noor,
          id: written.entry.id,
          reason: 'مبلغ اشتباه',
          seen: seen + 1,
          at,
          event: { adminUserId: owner, action: 'settlements.void', targetType: 'partner', targetId: noor, at },
        };
        expect(await settlement().voidEntry({ ...voidInput, seen })).toEqual({ ok: false, reason: 'changed' });
        expect(await settlement().voidEntry({ ...voidInput, partnerId: first })).toEqual({ ok: false, reason: 'not_found' });
        expect(await settlement().voidEntry({ ...voidInput, id: written.entry.id + 1_000 })).toEqual({ ok: false, reason: 'not_found' });
        const done = await settlement().voidEntry(voidInput);
        expect(done).toMatchObject({ ok: true, already: false, entry: { voided: { at, by: owner, reason: 'مبلغ اشتباه' } } });
        expect(await versionOf()).toBe(seen + 2);
        expect(await settlement().voidEntry(voidInput)).toMatchObject({ ok: true, already: true });
        expect(await settlement().voidEntry({ ...voidInput, reason: 'دلیل دیگر' })).toMatchObject({ ok: false, reason: 'already_voided' });
        expect(await settlement().voidEntry({ ...voidInput, event: { ...voidInput.event, adminUserId: clerk } })).toMatchObject({
          ok: false,
          reason: 'already_voided',
        });
        expect(await conn.db.select({ detail: adminEvents.detail }).from(adminEvents).where(and(eq(adminEvents.action, 'settlements.void'), eq(adminEvents.at, at)))).toEqual([
          { detail: { entry: written.entry.id, partner: { id: noor, name: 'چاپ نور' }, kind: 'payment', amountRials: 700_000, day: MEHR_21.toISOString() } },
        ]);
        // باطل‌شده در مانده نیست.
        expect((await settlement().statement(ALL_ORDERS, noor, MEHR))!.balanceRials).toBe(0n);
      });

      it('سفارش جابه‌جاشده: سهم صورت‌حساب و گزارش تولید همان آخرین تخصیص؛ «آخرین پرداخت» نمای کلی باطل‌نشده', async () => {
        await clearOrders(conn);
        await conn.db.update(printPartners).set({ shareBp: null });
        expect(await setShare(noor, 6_000)).toBe('ok');
        expect(await setShare(first, 5_000)).toBe('ok');
        const order = await paidOrder([{ pages: 40 }], { place: MASHHAD });
        // نور ۶۰٪، جزوه‌یار ۵۰٪، و دوباره نور با درصد تازهٔ ۷۰٪: اولین و آخرین تخصیص هر دو «چاپ نور»اند، با دو سهم.
        expect((await move(order, noor, first)).ok).toBe(true);
        expect(await setShare(noor, 7_000)).toBe('ok');
        expect((await move(order, first, noor)).ok).toBe(true);
        expect((await assignmentsOf(order)).map((row) => [row.to, row.bp])).toEqual([
          [noor, 6_000],
          [first, 5_000],
          [noor, 7_000],
        ]);
        await handedAt(order, new Date(MEHR_21.getTime() + HOUR));
        const base = await subtotalOf(order);
        const latest = shareRialsOf(base, 7_000);
        expect(latest).not.toBe(shareRialsOf(base, 6_000));

        const statement = (await settlement().statement(ALL_ORDERS, noor, MEHR))!;
        expect(statement.handed).toEqual([expect.objectContaining({ orderNumber: order.orderNumber, shareBp: 7_000, shareRials: latest })]);
        expect(statement.balanceRials).toBe(latest);
        const [row] = await production().orders(ALL_ORDERS, { by: 'number', from: order.orderNumber, to: order.orderNumber }, null);
        expect(row!.shareRials).toBe(latest);

        // پرداختی که پس از همه ثبت و باطل شد نه در مانده است و نه «آخرین پرداخت».
        const kept = await settlement().record(ledgerInput({ seen: 0, amountRials: 100_000n, day: MEHR_21 }));
        const later = await settlement().record(ledgerInput({ seen: 1, amountRials: 200_000n, day: MEHR_22 }));
        expect(kept.ok && later.ok).toBe(true);
        const voided = await settlement().voidEntry({
          partnerId: noor,
          id: later.ok ? later.entry.id : 0,
          reason: 'دو بار ثبت شد',
          seen: 2,
          at: NOW,
          event: { adminUserId: owner, action: 'settlements.void', targetType: 'partner', targetId: noor, at: NOW },
        });
        expect(voided).toMatchObject({ ok: true, already: false });
        expect((await settlement().overview(ALL_ORDERS)).find((partner) => partner.id === noor)).toMatchObject({
          balanceRials: latest - 100_000n,
          lastPayment: { day: MEHR_21, amountRials: 100_000n },
        });
      });

      it('دیوارهای دفتر (0060 و CHECKها): فقط افزودنی، باطل یک بار، سفارشِ همین چاپخانه، و شکل هر ردیف', async () => {
        await clearOrders(conn);
        const order = await paidOrder([{ pages: 20 }], { place: MASHHAD });
        const theirs = await paidOrder([{ pages: 20 }]);
        const row = (values: Partial<typeof partnerLedger.$inferInsert>) =>
          conn.db.insert(partnerLedger).values({
            printPartnerId: noor,
            kind: 'payment',
            amountRials: 10_000,
            day: MEHR_21,
            createdBy: owner,
            requestId: randomUUID(),
            ...values,
          });
        expect(await rejectedConstraint(row({ voidedAt: NOW, voidedBy: owner, voidReason: 'از اول' }))).toBe('partner_ledger_insert_state');
        expect(await rejectedConstraint(row({ kind: 'adjustment', note: 'دلیل', orderId: theirs.id }))).toBe('partner_ledger_order');
        expect(await rejectedConstraint(row({ kind: 'adjustment', note: 'دلیل', orderId: order.id }))).toBeUndefined();

        const [kept] = await row({}).returning({ id: partnerLedger.id });
        const where = eq(partnerLedger.id, kept!.id);
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ amountRials: 20_000 }).where(where))).toBe('partner_ledger_frozen');
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ note: 'بعداً' }).where(where))).toBe('partner_ledger_frozen');
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ day: MEHR_22 }).where(where))).toBe('partner_ledger_frozen');
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ printPartnerId: first }).where(where))).toBe('partner_ledger_frozen');
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ createdBy: clerk }).where(where))).toBe('partner_ledger_frozen');
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ voidedAt: NOW }).where(where))).toBe('partner_ledger_void');
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ voidedAt: NOW, voidedBy: owner, voidReason: ' ' }).where(where))).toBe(
          'partner_ledger_void',
        );
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ voidedAt: NOW, voidedBy: owner, voidReason: 'اشتباه' }).where(where))).toBeUndefined();
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ voidedAt: NOW, voidedBy: clerk, voidReason: 'دوباره' }).where(where))).toBe(
          'partner_ledger_void_once',
        );
        expect(await rejectedConstraint(conn.db.update(partnerLedger).set({ voidedAt: null, voidedBy: null, voidReason: null }).where(where))).toBe(
          'partner_ledger_void_once',
        );
        expect(await rejectedConstraint(conn.db.delete(partnerLedger).where(where))).toBe('partner_ledger_append_only');

        // شکل: پرداخت مثبت و بی سفارش؛ اصلاح غیرصفر با دلیل، بی «بابت» و کد پیگیری؛ ریال گرد و زیر سقف.
        expect(await rejectedConstraint(row({ kind: 'refund' }))).toBe('partner_ledger_kind');
        expect(await rejectedConstraint(row({ amountRials: -10_000 }))).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ amountRials: 0 }))).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ orderId: order.id }))).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ amountRials: 10_005 }))).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ amountRials: 100_000_000_010 }))).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ amountRials: 100_000_000_000 }))).toBeUndefined();
        expect(await rejectedConstraint(row({ kind: 'adjustment', amountRials: 0, note: 'هیچ' }))).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ kind: 'adjustment', amountRials: -10_000 }))).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ kind: 'adjustment', amountRials: -10_000, note: 'کم', tracking: 'X' }))).toBe('partner_ledger_shape');
        expect(
          await rejectedConstraint(row({ kind: 'adjustment', amountRials: -10_000, note: 'کم', periodFrom: MEHR_20, periodUntil: MEHR_21 })),
        ).toBe('partner_ledger_shape');
        expect(await rejectedConstraint(row({ kind: 'adjustment', amountRials: -100_000_000_010, note: 'زیاد' }))).toBe('partner_ledger_shape');
        // «بابت»: هر دو یا هیچ، رو به جلو، تا ۴۰۰ روز.
        expect(await rejectedConstraint(row({ periodFrom: MEHR_20 }))).toBe('partner_ledger_period');
        expect(await rejectedConstraint(row({ periodFrom: MEHR_21, periodUntil: MEHR_21 }))).toBe('partner_ledger_period');
        expect(await rejectedConstraint(row({ periodFrom: MEHR_20, periodUntil: new Date(MEHR_20.getTime() + 401 * DAY) }))).toBe('partner_ledger_period');
        expect(await rejectedConstraint(row({ periodFrom: MEHR_20, periodUntil: new Date(MEHR_20.getTime() + 400 * DAY) }))).toBeUndefined();
        // متن‌ها: تمیز و در سقف.
        expect(await rejectedConstraint(row({ tracking: 'x'.repeat(41) }))).toBe('partner_ledger_texts');
        expect(await rejectedConstraint(row({ tracking: ' 803114' }))).toBe('partner_ledger_texts');
        expect(await rejectedConstraint(row({ tracking: '' }))).toBe('partner_ledger_texts');
        expect(await rejectedConstraint(row({ note: 'ی'.repeat(301) }))).toBe('partner_ledger_texts');
        expect(await rejectedConstraint(row({ note: 'یادداشت ' }))).toBe('partner_ledger_texts');
        expect(await rejectedConstraint(row({ tracking: 'x'.repeat(40), note: 'ی'.repeat(300) }))).toBeUndefined();
        expect(await rejectedConstraint(row({ requestId: (await conn.db.select({ id: partnerLedger.requestId }).from(partnerLedger).where(where))[0]!.id }))).toBe(
          'partner_ledger_request',
        );

        // خروجی PDF صورت‌حساب همان جدول خروجی‌هاست.
        expect(
          await rejectedConstraint(
            conn.db.insert(reportExports).values({ report: 'settlement', context: {}, fileName: 'tasvie-noor.pdf', money: false, requestedBy: owner }),
          ),
        ).toBeUndefined();
        await conn.db.delete(reportExports).where(eq(reportExports.report, 'settlement'));
      });

      it('چاپخانه‌های فعال بی درصد برای هشدار پیشخوان؛ ۰ درصد تعیین‌شده است، و غیرفعال نه', async () => {
        await clearOrders(conn);
        await conn.db.update(printPartners).set({ shareBp: null });
        expect(await settlement().unsetShares()).toEqual([
          { id: first, name: 'چاپخانهٔ جزوه‌یار' },
          { id: noor, name: 'چاپ نور' },
        ]);
        expect(await setShare(first, 0)).toBe('ok');
        expect(await settlement().unsetShares()).toEqual([{ id: noor, name: 'چاپ نور' }]);
        await conn.db.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, noor));
        try {
          expect(await settlement().unsetShares()).toEqual([]);
        } finally {
          await conn.db.update(printPartners).set({ deactivatedAt: null }).where(eq(printPartners.id, noor));
        }
      });
    });

    /**
     * موجودی کاغذ (برش ۱۰٫۴، ADR-070): همان سفارش‌سازی گزارش تولید (`paidOrder`، تخصیص پرداخت: مشهد به «چاپ نور»، تهران به «چاپخانهٔ
     * جزوه‌یار»). تعرفهٔ فعال همان پایه است (فقط تحریر A4)، پس قلم گلاسهٔ A5 با SQL می‌نشیند؛ تریگر به تعرفهٔ فعال کاری ندارد.
     */
    describe('موجودی کاغذ روی پستگرس (برش ۱۰٫۴)', () => {
      const inventory = () => createInventoryStore(conn);
      const event = (action: string) => ({ adminUserId: owner, action, targetType: 'paper_stock', at: NOW });
      const TAHRIR = 'تحریر ۸۰ گرم';
      const balanceOf = async (itemId: string) =>
        Number(
          (await conn.db.execute<{ b: string }>(sql`SELECT coalesce(sum(delta_sheets), 0)::text AS b FROM paper_stock_moves WHERE item_id = ${itemId}`))[0]!
            .b,
        );
      const movesOf = (itemId: string) =>
        conn.db.select().from(paperStockMoves).where(eq(paperStockMoves.itemId, itemId)).orderBy(asc(paperStockMoves.id));
      const stockEvents = (actions: string[]) =>
        conn.db.select().from(adminEvents).where(inArray(adminEvents.action, actions)).orderBy(asc(adminEvents.id));

      async function trackTahrir(partnerId = noor, countedSheets = 1_000, thresholdSheets: number | null = null): Promise<StockItem> {
        const result = await inventory().track(ALL_ORDERS, {
          partnerId,
          paperTypeId: 'tahrir80',
          paperSize: 'a4',
          countedSheets,
          thresholdSheets,
          requestId: randomUUID(),
          at: NOW,
          event: event('inventory.track'),
        });
        if (!result.ok) throw new Error(`پیگیری شروع نشد: ${result.reason}`);
        return result.item;
      }
      /** قلم گلاسهٔ A5 با SQL (تعرفهٔ فعال گلاسه ندارد) و شمارش اولش از همان `record`. */
      async function glossyA5(partnerId = noor, sheets = 500): Promise<string> {
        const [item] = await conn.db
          .insert(paperStockItems)
          .values({ printPartnerId: partnerId, paperTypeId: 'glossy', paperSize: 'a5', createdBy: owner, createdAt: NOW })
          .returning({ id: paperStockItems.id });
        const counted = await inventory().record(ALL_ORDERS, {
          itemId: item!.id,
          kind: 'count',
          sheets,
          note: 'شمارش اول',
          requestId: randomUUID(),
          at: NOW,
          event: event('inventory.count'),
        });
        expect(counted.ok).toBe(true);
        return item!.id;
      }
      const glossyJozve = { pages: 10, sides: 'single' as const, size: 'a5' as const, paper: 'glossy', binding: 'staple' };

      beforeEach(async () => {
        // سفارش‌ها و موجودی (`clearOrders`)، و رویدادها؛ همه پاک‌نشدنی‌اند و TRUNCATE تریگر ردیفی ندارد.
        await clearOrders(conn);
        await conn.db.execute(sql`TRUNCATE admin_events`);
      });

      it('برگ هر کاغذ و اندازهٔ سفارش از ریز قیمت منجمد: برگ × نسخهٔ هر جزوه، همان «برگ» گزارش تولید', async () => {
        // تحریر A4 دورو ۲۱ صفحه در دو نسخه (۱۱ × ۲)، گلاسهٔ A5 یکرو ۱۰ صفحه، و تحریر A4 یکرو ۸ صفحه در سه نسخه (۸ × ۳).
        const order = await paidOrder([{ pages: 21, copies: 2 }, glossyJozve, { pages: 8, copies: 3, sides: 'single' }], { place: MASHHAD });
        const rows = await conn.db.execute<{ paper_type_id: string; paper_size: string; sheets: string }>(
          sql`SELECT paper_type_id, paper_size::text AS paper_size, sheets::text AS sheets FROM order_paper_sheets(${order.id}) ORDER BY 1, 2`,
        );
        expect(rows.map((row) => [row.paper_type_id, row.paper_size, Number(row.sheets)])).toEqual([
          ['glossy', 'a5', 10],
          ['tahrir80', 'a4', 46],
        ]);
        const [report] = await production().orders(ALL_ORDERS, { by: 'number', from: order.orderNumber, to: order.orderNumber }, null);
        expect(report!.items.map((item) => item.sheets * item.copies)).toEqual([22, 10, 24]);
      });

      it('«شروع چاپ» از قلم‌های چاپخانهٔ همان سفارش کم می‌کند؛ برگرداندن برمی‌گرداند، و لغو پس از شروع چاپ و برگشت لغو نه', async () => {
        const tahrir = await trackTahrir();
        const glossy = await glossyA5();
        const elsewhere = await trackTahrir(first, 300);
        const order = await paidOrder([{ pages: 21, copies: 2 }, glossyJozve], { place: MASHHAD });
        expect(order.printPartnerId).toBe(noor);
        expect((await change(order, 'paid', 'printing')).ok).toBe(true);
        expect([await balanceOf(tahrir.id), await balanceOf(glossy), await balanceOf(elsewhere.id)]).toEqual([978, 490, 300]);
        const [printRow] = (await movesOf(tahrir.id)).filter((row) => row.kind === 'print');
        expect(printRow).toMatchObject({ deltaSheets: -22, orderId: order.id, createdBy: null, requestId: null, note: null, undoes: null });

        // برگرداندن به «در صف چاپ»: همان برگ‌ها، با ردیفی که همان ردیف چاپ را برمی‌گرداند.
        expect((await change(order, 'printing', 'paid', 'اشتباه زدم')).ok).toBe(true);
        expect([await balanceOf(tahrir.id), await balanceOf(glossy)]).toEqual([1_000, 500]);
        expect((await movesOf(tahrir.id)).filter((row) => row.kind === 'unprint')).toMatchObject([
          { deltaSheets: 22, orderId: order.id, undoes: printRow!.id, createdBy: null },
        ]);

        // دوباره شروع چاپ، بعد لغو: کاغذ مصرف شده و برنمی‌گردد؛ برگشت لغو به «در حال چاپ» هم دوباره کم نمی‌کند.
        expect((await change(order, 'paid', 'printing')).ok).toBe(true);
        expect((await change(order, 'printing', 'cancelled', 'مشتری نخواست')).ok).toBe(true);
        expect(await balanceOf(tahrir.id)).toBe(978);
        expect((await change(order, 'cancelled', 'printing', 'لغو اشتباه بود')).ok).toBe(true);
        expect(await balanceOf(tahrir.id)).toBe(978);
        // «تحویل پست شد» و برگشتش هیچ؛ برگرداندن به صف فقط ردیف چاپی را برمی‌گرداند که هنوز برنگشته.
        expect((await change(order, 'printing', 'handed_to_post')).ok).toBe(true);
        expect((await change(order, 'handed_to_post', 'printing', 'کد اشتباه')).ok).toBe(true);
        expect(await balanceOf(tahrir.id)).toBe(978);
        expect((await change(order, 'printing', 'paid', 'هنوز چاپ نشده')).ok).toBe(true);
        expect((await movesOf(tahrir.id)).map((row) => [row.kind, row.deltaSheets])).toEqual([
          ['count', 1_000],
          ['print', -22],
          ['unprint', 22],
          ['print', -22],
          ['unprint', 22],
        ]);
        expect(await balanceOf(elsewhere.id)).toBe(300);
      });

      it('سفارشی که از «لغو شد» به صف برگردد هم برگ‌های چاپ‌شده‌اش را پس می‌گیرد؛ سفارش چاپخانهٔ دیگر و کاغذ پیگیری‌نشده هیچ', async () => {
        const tahrir = await trackTahrir();
        const order = await paidOrder([{ pages: 30, copies: 4 }], { place: MASHHAD });
        // هر راهی، حتی UPDATE مستقیم؛ و تغییری که وضعیت را عوض نمی‌کند هیچ.
        await conn.db.update(orders).set({ status: 'printing' }).where(eq(orders.id, order.id));
        expect(await balanceOf(tahrir.id)).toBe(940);
        await conn.db.update(orders).set({ status: 'printing' }).where(eq(orders.id, order.id));
        expect(await balanceOf(tahrir.id)).toBe(940);
        await conn.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id));
        expect(await balanceOf(tahrir.id)).toBe(940);
        await conn.db.update(orders).set({ status: 'paid' }).where(eq(orders.id, order.id));
        expect(await balanceOf(tahrir.id)).toBe(1_000);

        const tehranOrder = await paidOrder([{ pages: 40 }], { place: TEHRAN });
        expect(tehranOrder.printPartnerId).toBe(first);
        expect((await change(tehranOrder, 'paid', 'printing')).ok).toBe(true);
        const glossyOnly = await paidOrder([glossyJozve], { place: MASHHAD });
        expect((await change(glossyOnly, 'paid', 'printing')).ok).toBe(true);
        expect(await conn.db.select().from(paperStockMoves).where(inArray(paperStockMoves.orderId, [tehranOrder.id, glossyOnly.id]))).toEqual([]);
        expect(await balanceOf(tahrir.id)).toBe(1_000);
      });

      it('محافظ‌ها: ردیف خودکار فقط از تریگر، شکل هر نوع، شمارش از موجودی همان لحظه، و دفتر و قلم فقط افزودنی', async () => {
        const tahrir = await trackTahrir();
        const order = await paidOrder([{ pages: 20 }], { place: MASHHAD });
        const manual = (values: Partial<typeof paperStockMoves.$inferInsert>) =>
          rejectedConstraint(
            conn.db
              .insert(paperStockMoves)
              .values({ itemId: tahrir.id, kind: 'purchase', deltaSheets: 10, createdBy: owner, requestId: randomUUID(), ...values }),
          );
        const automatic = { orderId: order.id, createdBy: null, requestId: null };
        expect(await manual({ kind: 'print', deltaSheets: -10, ...automatic })).toBe('paper_stock_moves_automatic');
        expect(await manual({ kind: 'unprint', deltaSheets: 10, undoes: 1, ...automatic })).toBe('paper_stock_moves_automatic');
        expect(await manual({ deltaSheets: -10 })).toBe('paper_stock_moves_shape');
        expect(await manual({ kind: 'waste', deltaSheets: -10 })).toBe('paper_stock_moves_shape');
        expect(await manual({ kind: 'waste', deltaSheets: 10, note: 'خیس شد' })).toBe('paper_stock_moves_shape');
        expect(await manual({ kind: 'count', countedSheets: 5 })).toBe('paper_stock_moves_shape');
        expect(await manual({ kind: 'count', countedSheets: -1, note: 'شمارش' })).toBe('paper_stock_moves_shape');
        expect(await manual({ orderId: order.id })).toBe('paper_stock_moves_shape');
        expect(await manual({ requestId: null })).toBe('paper_stock_moves_shape');
        expect(await manual({ countedSheets: 10 })).toBe('paper_stock_moves_shape');
        expect(await manual({ deltaSheets: 100_000_001 })).toBe('paper_stock_moves_shape');
        expect(await manual({ note: ' جای خالی' })).toBe('paper_stock_moves_note');
        expect(await manual({ note: 'ی'.repeat(301) })).toBe('paper_stock_moves_note');
        expect(await manual({ kind: 'waste', deltaSheets: -10, note: 'خیس شد' })).toBeUndefined();
        expect(await manual({ note: 'ی'.repeat(300) })).toBeUndefined();
        // شمارش: هر چه کد بفرستد، تغییر همان شمرده منهای موجودی همان لحظه است.
        expect(await manual({ kind: 'count', deltaSheets: 999, countedSheets: 700, note: 'شمارش ماه' })).toBeUndefined();
        const last = (await movesOf(tahrir.id)).at(-1)!;
        expect(last).toMatchObject({ kind: 'count', countedSheets: 700, deltaSheets: 700 - (1_000 - 10 + 10) });
        expect(await balanceOf(tahrir.id)).toBe(700);
        expect(await manual({ requestId: last.requestId })).toBe('paper_stock_moves_request');

        expect(await rejectedConstraint(conn.db.update(paperStockMoves).set({ note: 'دیگر' }).where(eq(paperStockMoves.id, last.id)))).toBe(
          'paper_stock_moves_append_only',
        );
        expect(await rejectedConstraint(conn.db.delete(paperStockMoves).where(eq(paperStockMoves.id, last.id)))).toBe('paper_stock_moves_append_only');
        expect(await rejectedConstraint(conn.db.delete(paperStockItems).where(eq(paperStockItems.id, tahrir.id)))).toBe('paper_stock_items_no_delete');
        expect(await rejectedConstraint(conn.db.update(paperStockItems).set({ paperSize: 'a5' }).where(eq(paperStockItems.id, tahrir.id)))).toBe(
          'paper_stock_items_frozen',
        );
        expect(await rejectedConstraint(conn.db.update(paperStockItems).set({ printPartnerId: first }).where(eq(paperStockItems.id, tahrir.id)))).toBe(
          'paper_stock_items_frozen',
        );
        expect(await rejectedConstraint(conn.db.update(paperStockItems).set({ thresholdSheets: 200 }).where(eq(paperStockItems.id, tahrir.id)))).toBeUndefined();

        const item = (values: Partial<typeof paperStockItems.$inferInsert>) =>
          rejectedConstraint(
            conn.db.insert(paperStockItems).values({ printPartnerId: noor, paperTypeId: 'tahrir80', paperSize: 'a3', createdBy: owner, ...values }),
          );
        expect(await item({ paperTypeId: 'Tahrir80' })).toBe('paper_stock_items_paper');
        expect(await item({ paperTypeId: 't' })).toBe('paper_stock_items_paper');
        expect(await item({ thresholdSheets: -1 })).toBe('paper_stock_items_threshold');
        expect(await item({ thresholdSheets: 10_000_001 })).toBe('paper_stock_items_threshold');
        expect(await item({ paperSize: 'a4' })).toBe('paper_stock_items_key');
      });

      it('ردیف خودکار نادرست از درون تریگر هم رد می‌شود: برگشت جز همان ردیف چاپ با همان برگ‌ها، یک بار، و چاپ برای سفارش چاپخانهٔ دیگر', async () => {
        const tahrir = await trackTahrir();
        const order = await paidOrder([{ pages: 20 }], { place: MASHHAD });
        const other = await paidOrder([{ pages: 20 }], { place: TEHRAN });
        expect((await change(order, 'paid', 'printing')).ok).toBe(true);
        const [counted, printRow] = await movesOf(tahrir.id);
        /** درج از درون تریگری آزمایشی (عمق دو)، در تراکنشی که همیشه برمی‌گردد. شناسه‌ها از خود پایگاه داده‌اند. */
        const injected = (values: string) =>
          rejectedConstraint(
            conn.db.transaction(async (tx) => {
              await tx.execute(sql.raw('CREATE TABLE stock_inject (x int)'));
              await tx.execute(
                sql.raw(`CREATE FUNCTION stock_inject() RETURNS trigger LANGUAGE plpgsql AS $$
                  BEGIN INSERT INTO paper_stock_moves (item_id, kind, delta_sheets, order_id, undoes) VALUES (${values}); RETURN NULL; END $$`),
              );
              await tx.execute(sql.raw('CREATE TRIGGER stock_inject AFTER INSERT ON stock_inject FOR EACH ROW EXECUTE FUNCTION stock_inject()'));
              await tx.execute(sql.raw('INSERT INTO stock_inject VALUES (1)'));
              throw new Error('برگرد');
            }),
          );
        expect(await injected(`'${tahrir.id}', 'unprint', 5, '${order.id}', ${printRow!.id}`)).toBe('paper_stock_moves_undo');
        expect(await injected(`'${tahrir.id}', 'unprint', 1000, '${order.id}', ${counted!.id}`)).toBe('paper_stock_moves_undo');
        expect(await injected(`'${tahrir.id}', 'unprint', 10, '${other.id}', ${printRow!.id}`)).toBe('paper_stock_moves_undo');
        expect(await injected(`'${tahrir.id}', 'print', -5, '${other.id}', NULL`)).toBe('paper_stock_moves_order');
        // درست از درون تریگر پذیرفته است (تراکنش با همان خطای آزمایشی برمی‌گردد).
        expect(await injected(`'${tahrir.id}', 'unprint', 10, '${order.id}', ${printRow!.id}`)).toBeUndefined();
        // پس از برگرداندن واقعی، همان ردیف چاپ دوباره برنمی‌گردد.
        expect((await change(order, 'printing', 'paid', 'اشتباه')).ok).toBe(true);
        expect(await injected(`'${tahrir.id}', 'unprint', 10, '${order.id}', ${printRow!.id}`)).toBe('paper_stock_moves_undoes');
      });

      it('قفل قلم در خود محافظ: شمارش مستقیم، بی ذخیره‌گاه، پشت «شروع چاپ» هم‌زمان همان قلم می‌ماند', async () => {
        const tahrir = await trackTahrir();
        const order = await paidOrder([{ pages: 20 }], { place: MASHHAD });
        const codeOf = (error: unknown) => (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
        // «شروع چاپ» در تراکنشی باز می‌ماند (ردیف چاپ نوشته و قلم قفل)؛ شمارش از اتصال دیگر تا ۳۰۰ میلی‌ثانیه پشت قفل قلم صبر می‌کند و نمی‌رسد.
        // بی قفل، شمارش موجودی را بی ردیف چاپی می‌خواند که هنوز commit نشده، و پس از commit موجودی ۱۰ برگ کمتر از شمرده می‌ماند.
        const counted = await conn.db
          .transaction(async (tx) => {
            await tx.update(orders).set({ status: 'printing' }).where(eq(orders.id, order.id));
            const outcome = await conn.db
              .transaction(async (other) => {
                await other.execute(sql`SET LOCAL lock_timeout = '300ms'`);
                await other
                  .insert(paperStockMoves)
                  .values({ itemId: tahrir.id, kind: 'count', deltaSheets: 0, countedSheets: 900, note: 'شمارش ماه', createdBy: owner, requestId: randomUUID() });
                return 'inserted';
              })
              .catch(codeOf);
            throw Object.assign(new Error('rollback'), { outcome });
          })
          .catch((error: { outcome?: string }) => error.outcome);
        expect(counted).toBe('55P03');
        expect(await balanceOf(tahrir.id)).toBe(1_000);
      });

      it('شروع پیگیری: یک قلم برای هر کاغذ و اندازه، فقط از تعرفهٔ فعال، هر فرم یک قلم، محدوده، و رویداد بی یادداشت', async () => {
        expect(await inventory().papers()).toEqual([{ id: 'tahrir80', name: TAHRIR, sizes: ['a4'] }]);
        const requestId = randomUUID();
        const input = {
          partnerId: noor,
          paperTypeId: 'tahrir80',
          paperSize: 'a4' as const,
          countedSheets: 2_500,
          thresholdSheets: 1_000,
          requestId,
          at: NOW,
          event: event('inventory.track'),
        };
        const created = await inventory().track(ALL_ORDERS, input);
        expect(created).toMatchObject({
          ok: true,
          duplicate: false,
          item: { partnerId: noor, paperTypeId: 'tahrir80', paperSize: 'a4', paperName: TAHRIR, inTariff: true, balanceSheets: 2_500, thresholdSheets: 1_000 },
        });
        const id = created.ok ? created.item.id : '';
        expect(await inventory().track(ALL_ORDERS, input)).toMatchObject({ ok: true, duplicate: true, item: { id } });
        expect(await inventory().track(ALL_ORDERS, { ...input, countedSheets: 10 })).toEqual({ ok: false, reason: 'conflict' });
        expect(await inventory().track(ALL_ORDERS, { ...input, requestId: randomUUID() })).toEqual({ ok: false, reason: 'exists', itemId: id });
        expect(await inventory().track(ALL_ORDERS, { ...input, requestId: randomUUID(), paperTypeId: 'glossy' })).toEqual({
          ok: false,
          reason: 'paper_not_found',
        });
        expect(await inventory().track(ALL_ORDERS, { ...input, requestId: randomUUID(), paperSize: 'a5' })).toEqual({
          ok: false,
          reason: 'paper_not_found',
        });
        expect(await inventory().track({ kind: 'partner', partnerId: noor }, { ...input, requestId: randomUUID(), partnerId: first })).toEqual({
          ok: false,
          reason: 'not_found',
        });
        // کاربر همان چاپخانه می‌تواند.
        const own = await inventory().track({ kind: 'partner', partnerId: first }, { ...input, requestId: randomUUID(), partnerId: first });
        expect(own).toMatchObject({ ok: true, item: { partnerId: first, balanceSheets: 2_500 } });

        expect(await movesOf(id)).toMatchObject([
          { kind: 'count', countedSheets: 2_500, deltaSheets: 2_500, note: 'شمارش اول', createdBy: owner, requestId },
        ]);
        const events = await stockEvents(['inventory.track']);
        expect(events).toHaveLength(2);
        expect(events[0]!.detail).toEqual({
          item: id,
          partner: { id: noor, name: 'چاپ نور' },
          paper: { id: 'tahrir80', name: TAHRIR },
          size: 'a4',
          countedSheets: 2_500,
          thresholdSheets: 1_000,
        });
      });

      it('ورود، ضایعات و شمارش: هر فرم یک ردیف، موجودی پس از هر ردیف، محدوده، و رویداد بی یادداشت', async () => {
        const item = await trackTahrir(noor, 1_000);
        const base = (over: Partial<MoveInput>): MoveInput => ({
          itemId: item.id,
          kind: 'purchase',
          sheets: 500,
          note: null,
          requestId: randomUUID(),
          at: NOW,
          event: event('inventory.purchase'),
          ...over,
        });
        expect(await inventory().record(ALL_ORDERS, base({ note: 'خرید از پخش صبا' }))).toMatchObject({
          ok: true,
          duplicate: false,
          move: { kind: 'purchase', deltaSheets: 500, balanceSheets: 1_500, createdBy: owner, createdByName: 'الهام فرجی' },
          item: { balanceSheets: 1_500 },
        });
        const waste = base({ kind: 'waste', sheets: 40, note: 'گیر کردن کاغذ', event: event('inventory.waste') });
        const wasted = await inventory().record(ALL_ORDERS, waste);
        expect(wasted).toMatchObject({ ok: true, duplicate: false, move: { kind: 'waste', deltaSheets: -40, balanceSheets: 1_460 } });
        const wasteId = wasted.ok ? wasted.move.id : 0;
        expect(await inventory().record(ALL_ORDERS, waste)).toMatchObject({ ok: true, duplicate: true, move: { id: wasteId } });
        expect(await inventory().record(ALL_ORDERS, { ...waste, sheets: 41 })).toEqual({ ok: false, reason: 'conflict' });
        expect(await inventory().record(ALL_ORDERS, { ...waste, note: 'دلیل دیگر' })).toEqual({ ok: false, reason: 'conflict' });
        expect(await inventory().record(ALL_ORDERS, { ...waste, kind: 'purchase' })).toEqual({ ok: false, reason: 'conflict' });
        expect(await inventory().record(ALL_ORDERS, base({ kind: 'count', sheets: 1_450, note: 'شمارش هفتگی', event: event('inventory.count') }))).toMatchObject({
          ok: true,
          move: { kind: 'count', countedSheets: 1_450, deltaSheets: -10, balanceSheets: 1_450 },
          item: { balanceSheets: 1_450 },
        });
        expect(await inventory().record({ kind: 'partner', partnerId: first }, base({}))).toEqual({ ok: false, reason: 'not_found' });
        expect(await inventory().record(ALL_ORDERS, base({ itemId: randomUUID() }))).toEqual({ ok: false, reason: 'not_found' });

        const events = await stockEvents(['inventory.purchase', 'inventory.waste', 'inventory.count']);
        expect(events.map((row) => row.action)).toEqual(['inventory.purchase', 'inventory.waste', 'inventory.count']);
        expect(events[1]!.detail).toEqual({
          item: item.id,
          partner: { id: noor, name: 'چاپ نور' },
          paper: { id: 'tahrir80', name: TAHRIR },
          size: 'a4',
          deltaSheets: -40,
          balanceSheets: 1_460,
        });
        expect(events[2]!.detail).toMatchObject({ deltaSheets: -10, countedSheets: 1_450, balanceSheets: 1_450 });
        expect(JSON.stringify(events.map((row) => row.detail))).not.toMatch(/پخش صبا|گیر کردن|شمارش هفتگی/);
      });

      it('آستانه: فقط وقتی عوض شود رویداد دارد، و در محدوده', async () => {
        const item = await trackTahrir(noor, 1_000);
        const set = (thresholdSheets: number | null, scope: PanelScope = ALL_ORDERS) =>
          inventory().setThreshold(scope, { itemId: item.id, thresholdSheets, at: NOW, event: event('inventory.threshold') });
        expect(await set(800)).toMatchObject({ ok: true, changed: true, item: { thresholdSheets: 800 } });
        expect(await set(800)).toMatchObject({ ok: true, changed: false });
        expect(await set(null, { kind: 'partner', partnerId: noor })).toMatchObject({ ok: true, changed: true, item: { thresholdSheets: null } });
        expect(await set(5, { kind: 'partner', partnerId: first })).toEqual({ ok: false, reason: 'not_found' });
        expect((await stockEvents(['inventory.threshold'])).map((row) => row.detail)).toMatchObject([
          { item: item.id, from: null, to: 800 },
          { item: item.id, from: 800, to: null },
        ]);
      });

      it('نمای کلی، صفحهٔ چاپخانه و قلم: نیاز صف، ردیف‌ها با موجودی پس از هر کدام و «برگشت»، صفحه‌ها و محدوده', async () => {
        const tahrir = await trackTahrir(noor, 100, 50);
        const queued = await paidOrder([{ pages: 30, copies: 2 }], { place: MASHHAD });
        const printing = await paidOrder([{ pages: 20 }], { place: MASHHAD });
        expect((await change(printing, 'paid', 'printing')).ok).toBe(true);
        expect((await change(printing, 'printing', 'paid', 'اشتباه')).ok).toBe(true);
        expect((await change(printing, 'paid', 'printing')).ok).toBe(true);
        expect(queued.status).toBe('paid');
        // چاپخانهٔ غیرفعالی که قلمی ندارد در نمای کلی نیست؛ چاپخانه پاک نمی‌شود، پس تا TRUNCATE بخش بعد می‌ماند.
        await conn.db.insert(printPartners).values({ name: 'چاپ قدیم', ...MASHHAD, deactivatedAt: NOW });

        const overview = await inventory().overview(ALL_ORDERS);
        expect(overview.map((row) => [row.partner.name, row.items.length])).toEqual([
          ['چاپخانهٔ جزوه‌یار', 0],
          ['چاپ نور', 1],
        ]);
        expect(overview[1]!.items[0]).toMatchObject({ id: tahrir.id, balanceSheets: 90, thresholdSheets: 50, queued: { orders: 1, sheets: 30 } });
        expect((await inventory().partner(ALL_ORDERS, noor))!.items).toEqual(overview[1]!.items);

        const view = (await inventory().item(ALL_ORDERS, tahrir.id, { limit: 50, offset: 0 }))!;
        expect(view.partner).toMatchObject({ id: noor, name: 'چاپ نور', cityName: 'مشهد', active: true });
        expect(view.total).toBe(4);
        expect(view.moves.map((row) => [row.kind, row.deltaSheets, row.balanceSheets, row.orderNumber, row.undone])).toEqual([
          ['print', -10, 90, printing.orderNumber, false],
          ['unprint', 10, 100, printing.orderNumber, false],
          ['print', -10, 90, printing.orderNumber, true],
          ['count', 100, 100, null, false],
        ]);
        expect((await inventory().item(ALL_ORDERS, tahrir.id, { limit: 2, offset: 2 }))!.moves.map((row) => [row.kind, row.balanceSheets])).toEqual([
          ['print', 90],
          ['count', 100],
        ]);

        // محدوده: کاربر چاپخانهٔ دیگر نه قلم را می‌بیند نه چاپخانه را؛ کاربر همین چاپخانه فقط خودش.
        expect(await inventory().item({ kind: 'partner', partnerId: first }, tahrir.id, { limit: 50, offset: 0 })).toBeNull();
        expect(await inventory().partner({ kind: 'partner', partnerId: first }, noor)).toBeNull();
        expect((await inventory().overview({ kind: 'partner', partnerId: noor })).map((row) => row.partner.id)).toEqual([noor]);
        expect(await inventory().partner(ALL_ORDERS, randomUUID())).toBeNull();
      });

      it('هشدار: منفی، زیر آستانه و کمتر از نیاز صف، فقط چاپخانهٔ فعال و در محدوده', async () => {
        const low = await trackTahrir(noor, 40, 100);
        const negative = await trackTahrir(first, 10);
        const jozveyar = await paidOrder([{ pages: 40 }], { place: TEHRAN });
        expect((await change(jozveyar, 'paid', 'printing')).ok).toBe(true);
        const flags = (alerts: Awaited<ReturnType<ReturnType<typeof inventory>['alerts']>>) =>
          alerts.map((alert) => [alert.partner.name, alert.item.id, alert.negative, alert.belowThreshold, alert.shortForQueue]);
        expect(flags(await inventory().alerts(ALL_ORDERS))).toEqual([
          ['چاپخانهٔ جزوه‌یار', negative.id, true, false, false],
          ['چاپ نور', low.id, false, true, false],
        ]);
        expect(flags(await inventory().alerts({ kind: 'partner', partnerId: noor }))).toEqual([['چاپ نور', low.id, false, true, false]]);

        // چاپخانهٔ غیرفعال هشدار ندارد (بی سفارش باز غیرفعال می‌شود).
        await conn.db.update(printPartners).set({ deactivatedAt: NOW }).where(eq(printPartners.id, noor));
        try {
          expect(flags(await inventory().alerts(ALL_ORDERS))).toEqual([['چاپخانهٔ جزوه‌یار', negative.id, true, false, false]]);
          expect((await inventory().overview(ALL_ORDERS)).map((row) => [row.partner.name, row.partner.active])).toEqual([
            ['چاپخانهٔ جزوه‌یار', true],
            ['چاپ نور', false],
          ]);
        } finally {
          await conn.db.update(printPartners).set({ deactivatedAt: null }).where(eq(printPartners.id, noor));
        }

        // آستانهٔ خالی و موجودی کافی: هیچ؛ سفارشی در صف که بیش از موجودی می‌خواهد: «کمتر از نیاز صف».
        await inventory().setThreshold(ALL_ORDERS, { itemId: low.id, thresholdSheets: null, at: NOW, event: event('inventory.threshold') });
        expect(flags(await inventory().alerts({ kind: 'partner', partnerId: noor }))).toEqual([]);
        await paidOrder([{ pages: 100 }], { place: MASHHAD });
        expect(flags(await inventory().alerts({ kind: 'partner', partnerId: noor }))).toEqual([['چاپ نور', low.id, false, false, true]]);
      });
    });
  });
  describe('متن‌های سایت روی پستگرس (برش ۱۱٫۱)', () => {
    const NOW = new Date('2026-10-17T07:30:00Z');
    const MINUTE = 60_000;
    let owner = '';
    const actor = () => ({ adminUserId: owner, ipHash: 'h'.repeat(64) });
    const store = () => createSiteContentStore(conn);
    const terms = (lead: string) => ({ title: 'قوانین جزوه‌یار', lead, body: '## پرداخت\nبا درگاه زیبال.', seo: { title: 'قوانین', description: 'قوانین سفارش' } });
    const contentEvents = () =>
      conn.db.select().from(adminEvents).where(eq(adminEvents.targetType, CONTENT_TARGET)).orderBy(asc(adminEvents.id));
    const insertVersion = (over: Partial<typeof siteContentVersions.$inferInsert>) =>
      rejectedConstraint(conn.db.insert(siteContentVersions).values({ kind: 'terms', version: 1, content: terms('x'), createdBy: owner, ...over }));

    beforeAll(async () => {
      const [admin] = await conn.db.insert(adminUsers).values({ username: 'owner111', displayName: 'سارا رضایی' }).returning();
      owner = admin!.id;
    });

    beforeEach(async () => {
      // نسخه و رویداد پاک‌نشدنی‌اند (`site_content_versions_append_only`، `admin_events_append_only`)؛ TRUNCATE تریگر ردیفی ندارد.
      await conn.db.execute(sql`TRUNCATE site_content_versions, site_content_drafts, admin_events`);
    });

    it('پیش‌نویس، انتشار از همان که دیده شد، برگشت به پیش‌فرض و برگرداندن نسخه، هر کدام با رویداد بی متن', async () => {
      expect(await store().live()).toEqual({});
      const draft = await store().saveDraft({ kind: 'terms', content: terms('یک'), actor: actor(), at: NOW });
      expect(draft).toMatchObject({ kind: 'terms', baseVersion: 0, updatedByName: 'سارا رضایی', createdAt: NOW, updatedAt: NOW });
      const later = new Date(NOW.getTime() + MINUTE);
      expect(await store().saveDraft({ kind: 'terms', content: terms('دو'), actor: actor(), at: later })).toMatchObject({
        baseVersion: 0,
        content: terms('دو'),
        createdAt: NOW,
        updatedAt: later,
      });

      const publish = (expectedLive: number, source: Parameters<ReturnType<typeof store>['publish']>[0]['source']) =>
        store().publish({ kind: 'terms', expectedLive, source, actor: actor(), at: later });
      const fromDraft = (verify: (draft: unknown) => boolean) => ({ type: 'draft' as const, content: terms('دو'), verify });
      // صفحه‌ای که نسخهٔ دیگری دید، و پیش‌نویسی که پس از سنجش عوض شد.
      expect(await publish(1, fromDraft(() => true))).toEqual({ ok: false, reason: 'stale' });
      expect(await publish(0, fromDraft(() => false))).toEqual({ ok: false, reason: 'draft_changed' });
      // jsonb ترتیب کلیدها را نگه نمی‌دارد؛ سرویس پنل با JSON یکتای `@jozveyar/content` می‌سنجد.
      expect(await publish(0, fromDraft((d) => (d as { lead?: string }).lead === 'دو'))).toEqual({ ok: true, version: 1 });
      expect(await store().drafts()).toEqual({});
      expect(await publish(1, fromDraft(() => true))).toEqual({ ok: false, reason: 'draft_changed' });

      const live = await store().live();
      expect(live.terms).toMatchObject({ version: 1, content: terms('دو'), restoredFrom: null, createdByName: 'سارا رضایی', createdAt: later });

      expect(await publish(1, { type: 'restore', version: 0 })).toEqual({ ok: true, version: 2 });
      // برگشت دوباره به پیش‌فرض چیزی را عوض نمی‌کند (`site_content_versions_noop`).
      expect(await publish(2, { type: 'restore', version: 0 })).toEqual({ ok: false, reason: 'noop' });
      expect(await publish(2, { type: 'restore', version: 9 })).toEqual({ ok: false, reason: 'not_found' });
      expect(await publish(2, { type: 'restore', version: 1 })).toEqual({ ok: true, version: 3 });
      expect((await store().versions('terms')).map((v) => [v.version, v.restoredFrom, v.content === null])).toEqual([
        [3, 1, false],
        [2, 0, true],
        [1, null, false],
      ]);
      expect((await store().live()).terms?.content).toEqual(terms('دو'));

      // پیش‌نویس تازه از نسخهٔ امروز، و پایه‌اش با انتشار دیگری عوض نمی‌شود (صفحهٔ انتشار «پایهٔ کهنه» را از همین می‌گوید)؛ دور انداختن یک بار.
      expect(await store().saveDraft({ kind: 'terms', content: terms('سه'), actor: actor(), at: later })).toMatchObject({ baseVersion: 3 });
      expect(await publish(3, { type: 'restore', version: 0 })).toEqual({ ok: true, version: 4 });
      expect(await store().saveDraft({ kind: 'terms', content: terms('چهار'), actor: actor(), at: later })).toMatchObject({
        baseVersion: 3,
        content: terms('چهار'),
      });
      expect(await store().discardDraft('terms')).toBe(true);
      expect(await store().discardDraft('terms')).toBe(false);

      expect((await contentEvents()).map((e) => [e.action, e.targetId, e.detail, e.ipHash])).toEqual([
        ['content.publish', 'terms', { kind: 'terms', version: 1, restored: null }, 'h'.repeat(64)],
        ['content.publish', 'terms', { kind: 'terms', version: 2, restored: 0 }, 'h'.repeat(64)],
        ['content.publish', 'terms', { kind: 'terms', version: 3, restored: 1 }, 'h'.repeat(64)],
        ['content.publish', 'terms', { kind: 'terms', version: 4, restored: 0 }, 'h'.repeat(64)],
      ]);
      expect(JSON.stringify(await contentEvents())).not.toContain('زیبال');
    });

    it('انتشارهای هم‌زمان زیر قفل پشت‌سرهم‌اند: یکی منتشر می‌شود و بقیه «عوض شد» می‌گیرند، نه خطای ایندکس', async () => {
      await store().saveDraft({ kind: 'faq', content: { items: [{ q: 'پ', a: 'پا' }] }, actor: actor(), at: NOW });
      const outcome = (r: { ok: boolean; reason?: string }) => (r.ok ? 'ok' : r.reason);
      // پنج صفحه‌ای که همه نسخهٔ ۰ را دیدند؛ هر کدام پس از اولی نسخهٔ ۱ را روی سایت می‌بیند، نه آنچه صفحه‌اش دید.
      const drafts = await Promise.all(
        [0, 1, 2, 3, 4].map(() =>
          store().publish({ kind: 'faq', expectedLive: 0, source: { type: 'draft', content: { items: [{ q: 'پ', a: 'پا' }] }, verify: () => true }, actor: actor(), at: NOW }),
        ),
      );
      expect(drafts.map(outcome).sort()).toEqual(['ok', 'stale', 'stale', 'stale', 'stale']);
      // برگرداندن قفل ردیف پیش‌نویس ندارد: فقط قفل متن‌ها پنج برگشت هم‌زمان به پیش‌فرض را پشت‌سرهم می‌کند.
      const restores = await Promise.all(
        [0, 1, 2, 3, 4].map(() => store().publish({ kind: 'faq', expectedLive: 1, source: { type: 'restore', version: 0 }, actor: actor(), at: NOW })),
      );
      expect(restores.map(outcome).sort()).toEqual(['ok', 'stale', 'stale', 'stale', 'stale']);
      expect((await store().versions('faq')).map((v) => v.version)).toEqual([2, 1]);
    });

    it('محافظ‌ها: نسخه عوض و پاک نمی‌شود، شماره پشت‌سرهم، برگرداندن راست، و هر نسخه تغییری است', async () => {
      await conn.db.insert(siteContentVersions).values({ kind: 'terms', version: 1, content: terms('یک'), createdBy: owner });
      const where = and(eq(siteContentVersions.kind, 'terms'), eq(siteContentVersions.version, 1));
      expect(await rejectedConstraint(conn.db.update(siteContentVersions).set({ content: terms('دو') }).where(where))).toBe(
        'site_content_versions_frozen',
      );
      expect(await rejectedConstraint(conn.db.delete(siteContentVersions).where(where))).toBe('site_content_versions_append_only');
      expect(await insertVersion({ version: 3, content: terms('سه') })).toBe('site_content_versions_sequence');
      expect(await insertVersion({ version: 1, content: terms('سه') })).toBe('site_content_versions_sequence');
      expect(await insertVersion({ version: 2, content: terms('یک') })).toBe('site_content_versions_noop');
      expect(await insertVersion({ version: 2, content: terms('سه'), restoredFrom: 1 })).toBe('site_content_versions_restored_same');
      expect(await insertVersion({ version: 2, content: null })).toBe('site_content_versions_default');
      expect(await insertVersion({ version: 2, content: terms('سه'), restoredFrom: 0 })).toBe('site_content_versions_default');
      expect(await insertVersion({ version: 2, content: terms('سه'), restoredFrom: 2 })).toBe('site_content_versions_restored_same');
      expect(await insertVersion({ version: 2, content: terms('سه'), restoredFrom: -1 })).toBe('site_content_versions_restored');
      expect(await insertVersion({ version: 2, content: ['آرایه'] })).toBe('site_content_versions_content');
      expect(await insertVersion({ version: 2, content: { body: 'ا'.repeat(70_000) } })).toBe('site_content_versions_content');
      expect(await insertVersion({ version: 0, content: terms('سه') })).toBe('site_content_versions_sequence');
      // برگرداندن درست: همان متن نسخهٔ ۱، و برگشت به پیش‌فرض.
      expect(await insertVersion({ version: 2, content: null, restoredFrom: 0 })).toBeUndefined();
      expect(await insertVersion({ version: 3, content: terms('یک'), restoredFrom: 1 })).toBeUndefined();
      // نسخه‌ای از نوع دیگر شمارهٔ خودش را دارد.
      expect(await insertVersion({ kind: 'about', version: 1, content: terms('یک') })).toBeUndefined();
    });

    it('پیش‌نویس: از نسخه‌ای که هست، JSON شیء، و زمان ویرایش نه پیش از ساختن', async () => {
      const insertDraft = (over: Partial<typeof siteContentDrafts.$inferInsert>) =>
        rejectedConstraint(conn.db.insert(siteContentDrafts).values({ kind: 'terms', content: terms('x'), baseVersion: 0, updatedBy: owner, ...over }));
      expect(await insertDraft({ baseVersion: 4 })).toBe('site_content_drafts_base_exists');
      expect(await insertDraft({ baseVersion: -1 })).toBe('site_content_drafts_base_exists');
      expect(await insertDraft({ content: 'متن' })).toBe('site_content_drafts_content');
      expect(await insertDraft({ createdAt: NOW, updatedAt: new Date(NOW.getTime() - MINUTE) })).toBe('site_content_drafts_times');
      expect(await insertDraft({})).toBeUndefined();
      expect(await rejectedConstraint(conn.db.update(siteContentDrafts).set({ baseVersion: 2 }).where(eq(siteContentDrafts.kind, 'terms')))).toBe(
        'site_content_drafts_base_exists',
      );
    });
  });

  describe('تصویرهای سایت روی پستگرس (برش ۱۱٫۲)', () => {
    const NOW = new Date('2026-10-19T08:00:00Z');
    const MINUTE = 60_000;
    const LOGO_FILES = ['apple', 'favicon', 'icon192', 'icon512', 'logo', 'og'];
    let owner = '';
    const actor = () => ({ adminUserId: owner, ipHash: 'i'.repeat(64) });
    const store = () => createSiteImageStore(conn);
    const bytes = (n: number, size = 5) => Buffer.alloc(size, n);
    const sha = (c: string) => c.repeat(64);
    const typeOf = (name: string) => (name === 'favicon' ? 'image/x-icon' : 'image/png');
    const insertFile = (imageId: number, name: string, over: Partial<typeof siteImageFiles.$inferInsert> = {}) =>
      rejectedConstraint(
        conn.db.insert(siteImageFiles).values({
          imageId,
          name,
          contentType: typeOf(name),
          bytes: bytes(7),
          width: 64,
          height: 64,
          sha256: sha('c'),
          hasAlpha: true,
          ...over,
        }),
      );
    /** کار کارگر: فایل‌ها و پایان در یک تراکنش، مثل `site_images.py`. */
    const build = (imageId: number, names: string[], at = NOW) =>
      conn.db.transaction(async (tx) => {
        for (const name of names) {
          await tx.insert(siteImageFiles).values({
            imageId,
            name,
            contentType: typeOf(name),
            bytes: bytes(name.length),
            width: name === 'og' ? 1200 : 64,
            height: name === 'og' ? 630 : 64,
            sha256: sha(String.fromCharCode(97 + ((imageId * 7 + name.length) % 6))),
            hasAlpha: name !== 'og',
          });
        }
        await tx.update(siteImages).set({ builtAt: at }).where(eq(siteImages.id, imageId));
      });
    const valueOf = async (key: string) => (await conn.db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)))[0]?.value;
    const imageEvents = () => conn.db.select().from(adminEvents).orderBy(asc(adminEvents.id));

    beforeAll(async () => {
      const [admin] = await conn.db.insert(adminUsers).values({ username: 'owner112', displayName: 'بهار مقدم' }).returning();
      owner = admin!.id;
    });

    beforeEach(async () => {
      // بارگذاری روی سایت رفته و رویداد پاک‌نشدنی‌اند؛ TRUNCATE تریگر ردیفی ندارد.
      await conn.db.execute(sql`TRUNCATE site_images, site_image_files, admin_events CASCADE`);
      await conn.db.update(settings).set({ value: DEFAULT_SETTINGS[LOGO_SETTING] }).where(eq(settings.key, LOGO_SETTING));
      await conn.db.update(settings).set({ value: DEFAULT_SETTINGS[BANNER_SETTING] }).where(eq(settings.key, BANNER_SETTING));
    });

    it('دادهٔ پایه: لوگوی برند و بنر خاموش و بی تصویر، به شکل قرارداد', async () => {
      await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      await conn.db.delete(settings).where(inArray(settings.key, [LOGO_SETTING, BANNER_SETTING]));
      const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect([...seeded.settingsInserted].sort()).toEqual([BANNER_SETTING, LOGO_SETTING]);
      expect(await valueOf(LOGO_SETTING)).toEqual({ imageId: null });
      expect(await valueOf(BANNER_SETTING)).toEqual({ mode: 'off', imageId: null, alt: '', href: '' });
      const read = (key: string) => createSettingsStore(conn).read(key);
      expect(await readSetting(read, LOGO_SETTING)).toEqual({ imageId: null });
      expect(await readSetting(read, BANNER_SETTING)).toEqual({ mode: 'off', imageId: null, alt: '', href: '' });
    });

    it('بارگذاری با کار کارگر و رویداد؛ فایل‌های کارگر؛ و روی سایت زیر قفل تنظیم‌ها با published_at یک‌باره', async () => {
      const logo1 = await store().upload({ kind: 'logo', main: { name: 'logo.png', bytes: bytes(1) }, extra: null, actor: actor(), at: NOW });
      expect(logo1).toEqual({
        id: logo1.id,
        kind: 'logo',
        version: 1,
        mainName: 'logo.png',
        mainBytes: 5,
        extraName: null,
        extraBytes: null,
        createdBy: owner,
        createdByName: 'بهار مقدم',
        createdAt: NOW,
        builtAt: null,
        error: null,
        publishedAt: null,
        files: [],
      });
      const banner1 = await store().upload({
        kind: 'banner',
        main: { name: 'wide.jpg', bytes: bytes(2, 9) },
        extra: { name: 'phone.jpg', bytes: bytes(3) },
        actor: actor(),
        at: NOW,
      });
      expect([banner1.version, banner1.extraName, banner1.extraBytes]).toEqual([1, 'phone.jpg', 5]);
      const logo2 = await store().upload({ kind: 'logo', main: { name: 'logo2.webp', bytes: bytes(4) }, extra: { name: 'mark.png', bytes: bytes(5) }, actor: actor(), at: NOW });
      expect(logo2.version).toBe(2);
      expect((await store().recent('logo', 10)).map((row) => row.version)).toEqual([2, 1]);
      const queued = await conn.db.select({ kind: jobs.kind, siteImageId: jobs.siteImageId }).from(jobs).where(sql`${jobs.siteImageId} IS NOT NULL`);
      expect(queued.map((job) => [job.kind, job.siteImageId]).sort()).toEqual(
        [
          [BUILD_SITE_IMAGE_JOB, logo1.id],
          [BUILD_SITE_IMAGE_JOB, banner1.id],
          [BUILD_SITE_IMAGE_JOB, logo2.id],
        ].sort(),
      );
      expect((await imageEvents()).map((e) => [e.action, e.targetType, e.targetId, e.detail])).toEqual([
        ['content.upload', SITE_IMAGE_TARGET, String(logo1.id), { kind: 'logo', version: 1, files: 1, bytes: 5 }],
        ['content.upload', SITE_IMAGE_TARGET, String(banner1.id), { kind: 'banner', version: 1, files: 2, bytes: 14 }],
        ['content.upload', SITE_IMAGE_TARGET, String(logo2.id), { kind: 'logo', version: 2, files: 2, bytes: 10 }],
      ]);

      await build(logo1.id, LOGO_FILES);
      const built = (await store().get(logo1.id))!;
      expect(built.builtAt).toEqual(NOW);
      expect(built.files.map((file) => [file.name, file.contentType, file.width, file.hasAlpha, file.sizeBytes])).toEqual([
        ['apple', 'image/png', 64, true, 5],
        ['favicon', 'image/x-icon', 64, true, 5],
        ['icon192', 'image/png', 64, true, 5],
        ['icon512', 'image/png', 64, true, 5],
        ['logo', 'image/png', 64, true, 5],
        ['og', 'image/png', 1200, false, 5],
      ]);
      const og = built.files.find((file) => file.name === 'og')!;
      expect(await store().file(logo1.id, 'og')).toEqual({ contentType: 'image/png', bytes: bytes(2), sha256: og.sha256 });
      expect(await store().file(logo1.id, 'desktop')).toBeNull();
      // پیش از روی سایت رفتن، سایت هیچ‌کدام را نمی‌دهد.
      expect(await store().publishedFile(og.sha256)).toBeNull();
      expect(await store().publishedFiles(logo1.id, 'logo')).toBeNull();

      const T1 = new Date(NOW.getTime() + MINUTE);
      let seen: unknown[] = [];
      expect(
        await store().change({
          key: LOGO_SETTING,
          action: 'content.logo',
          imageId: logo1.id,
          at: T1,
          actor: actor(),
          decide: (current, image) => {
            seen = [current, image?.id, image?.files.length, image?.publishedAt];
            return { kind: 'write', value: { imageId: logo1.id }, detail: { change: 'publish', version: 1, fresh: true } };
          },
        }),
      ).toEqual({ ok: true, written: true });
      expect(seen).toEqual([{ imageId: null }, logo1.id, 6, null]);
      expect(await valueOf(LOGO_SETTING)).toEqual({ imageId: logo1.id });
      expect((await store().get(logo1.id))!.publishedAt).toEqual(T1);
      expect(await store().publishedFile(og.sha256)).toEqual({ contentType: 'image/png', bytes: bytes(2), sha256: og.sha256 });
      expect((await store().publishedFiles(logo1.id, 'logo'))!.map((file) => file.name)).toEqual(LOGO_FILES);
      expect(await store().publishedFiles(logo1.id, 'banner')).toBeNull();

      // برگشت به لوگوی برند: بی ردیف تصویر؛ گذاشتن دوباره، published_at همان اولی می‌ماند.
      expect(
        await store().change({
          key: LOGO_SETTING,
          action: 'content.logo',
          imageId: null,
          at: T1,
          actor: actor(),
          decide: (_current, image) => {
            seen = [image];
            return { kind: 'write', value: { imageId: null }, detail: { change: 'brand', fresh: true } };
          },
        }),
      ).toEqual({ ok: true, written: true });
      expect(seen).toEqual([null]);
      const T2 = new Date(NOW.getTime() + 2 * MINUTE);
      await store().change({
        key: LOGO_SETTING,
        action: 'content.logo',
        imageId: logo1.id,
        at: T2,
        actor: actor(),
        decide: () => ({ kind: 'write', value: { imageId: logo1.id }, detail: { change: 'publish', version: 1, fresh: true } }),
      });
      expect((await store().get(logo1.id))!.publishedAt).toEqual(T1);
      // «همان» و «رد» نه می‌نویسند نه رویداد دارند؛ ردیفی که نیست null است.
      const before = (await imageEvents()).length;
      expect(
        await store().change({ key: LOGO_SETTING, action: 'content.logo', imageId: logo2.id, at: T2, actor: actor(), decide: () => ({ kind: 'same' }) }),
      ).toEqual({ ok: true, written: false });
      expect(
        await store().change({
          key: LOGO_SETTING,
          action: 'content.logo',
          imageId: 999_999,
          at: T2,
          actor: actor(),
          decide: (_current, image) => (image === null ? { kind: 'reject', reason: 'image_not_found' } : { kind: 'same' }),
        }),
      ).toEqual({ ok: false, reason: 'image_not_found' });
      expect((await imageEvents()).length).toBe(before);
      expect((await store().get(logo2.id))!.publishedAt).toBeNull();
      expect((await imageEvents()).filter((e) => e.action === 'content.logo').map((e) => [e.targetType, e.targetId, e.detail])).toEqual([
        [SETTING_TARGET, LOGO_SETTING, { change: 'publish', version: 1, fresh: true }],
        [SETTING_TARGET, LOGO_SETTING, { change: 'brand', fresh: true }],
        [SETTING_TARGET, LOGO_SETTING, { change: 'publish', version: 1, fresh: true }],
      ]);
    });

    it('محافظ‌ها: بارگذاری تازه و منجمد، نتیجهٔ یک‌بارهٔ کارگر با همهٔ فایل‌ها، روی سایت یک بار، و پاک شدن فقط آنچه روی سایت نرفت', async () => {
      const logo = await store().upload({ kind: 'logo', main: { name: 'logo.png', bytes: bytes(1) }, extra: null, actor: actor(), at: NOW });
      const where = eq(siteImages.id, logo.id);
      const insertImage = (over: Partial<typeof siteImages.$inferInsert>) =>
        rejectedConstraint(conn.db.insert(siteImages).values({ kind: 'logo', version: 9, main: bytes(1), mainName: 'x.png', createdBy: owner, ...over }));
      expect(await insertImage({ builtAt: NOW })).toBe('site_images_insert_state');
      expect(await insertImage({ main: bytes(1, 1024 * 1024 + 1) })).toBe('site_images_main');
      expect(await insertImage({ mainName: '' })).toBe('site_images_main');
      expect(await insertImage({ extra: bytes(2) })).toBe('site_images_extra');
      expect(await insertImage({ version: 0 })).toBe('site_images_version_positive');
      expect(await insertImage({ version: 1 })).toBe('site_images_version');
      for (const change of [{ mainName: 'y.png' }, { main: bytes(9) }, { kind: 'banner' as const }, { version: 7 }, { createdAt: new Date(0) }]) {
        expect(await rejectedConstraint(conn.db.update(siteImages).set(change).where(where)), JSON.stringify(Object.keys(change))).toBe('site_images_frozen');
      }
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ publishedAt: NOW }).where(where))).toBe('site_images_published');
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: NOW }).where(where))).toBe('site_images_files_complete');
      // فایل نام نوع دیگر، و نوع محتوای نادرست.
      expect(await insertFile(logo.id, 'desktop', { contentType: 'image/png' })).toBe('site_image_files_kind');
      expect(await insertFile(logo.id, 'favicon', { contentType: 'image/png' })).toBe('site_image_files_type');
      expect(await insertFile(logo.id, 'logo', { contentType: 'image/jpeg' })).toBe('site_image_files_type');
      expect(await insertFile(logo.id, 'logo', { sha256: 'x' })).toBe('site_image_files_sha256');
      expect(await insertFile(logo.id, 'logo', { width: 0 })).toBe('site_image_files_size');
      expect(await insertFile(logo.id, 'logo')).toBeUndefined();
      // نیمه‌کاره ساخته نمی‌شود، و «ساخته نشد» فایل ندارد.
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: NOW }).where(where))).toBe('site_images_files_complete');
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: NOW, error: 'too_small: کوچک' }).where(where))).toBe('site_images_files_complete');
      expect(await rejectedConstraint(conn.db.update(siteImageFiles).set({ width: 2 }).where(eq(siteImageFiles.imageId, logo.id)))).toBe('site_image_files_frozen');
      expect(await rejectedConstraint(conn.db.delete(siteImageFiles).where(eq(siteImageFiles.imageId, logo.id)))).toBe('site_image_files_frozen');
      await build(logo.id, LOGO_FILES.filter((name) => name !== 'logo'));
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ error: 'دیر' }).where(where))).toBe('site_images_build_once');
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: new Date(NOW.getTime() + MINUTE) }).where(where))).toBe('site_images_build_once');
      expect(await insertFile(logo.id, 'og')).toBe('site_image_files_once');
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ publishedAt: NOW }).where(where))).toBeUndefined();
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ publishedAt: new Date(NOW.getTime() + MINUTE) }).where(where))).toBe('site_images_publish_once');
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ publishedAt: null }).where(where))).toBe('site_images_publish_once');
      expect(await rejectedConstraint(conn.db.delete(siteImages).where(where))).toBe('site_images_published_kept');

      // ساخته نشد: بی فایل و با خطا؛ روی سایت نمی‌رود، و پاک شدنش آزاد است.
      const failed = await store().upload({ kind: 'logo', main: { name: 'tiny.png', bytes: bytes(2) }, extra: null, actor: actor(), at: NOW });
      const failedWhere = eq(siteImages.id, failed.id);
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: NOW, error: ' ' }).where(failedWhere))).toBe('site_images_error');
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ error: 'too_small' }).where(failedWhere))).toBe('site_images_error');
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: NOW, error: 'too_small: ارتفاع 90 پیکسل' }).where(failedWhere))).toBeUndefined();
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ publishedAt: NOW }).where(failedWhere))).toBe('site_images_published');
      expect(await rejectedConstraint(conn.db.delete(siteImages).where(failedWhere))).toBeUndefined();

      // بنر: «mobile» فقط با تصویر گوشی، و ساخته یعنی همان که بارگذاری شد؛ پاک شدن بارگذاری‌ای که روی سایت نرفت فایل‌هایش را هم می‌برد.
      const desktopOnly = await store().upload({ kind: 'banner', main: { name: 'wide.jpg', bytes: bytes(3) }, extra: null, actor: actor(), at: NOW });
      expect(await insertFile(desktopOnly.id, 'mobile', { contentType: 'image/jpeg' })).toBe('site_image_files_kind');
      expect(await insertFile(desktopOnly.id, 'logo')).toBe('site_image_files_kind');
      await build(desktopOnly.id, ['desktop']);
      const both = await store().upload({ kind: 'banner', main: { name: 'wide.jpg', bytes: bytes(3) }, extra: { name: 'p.jpg', bytes: bytes(4) }, actor: actor(), at: NOW });
      expect(await insertFile(both.id, 'desktop', { contentType: 'image/jpeg' })).toBeUndefined();
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: NOW }).where(eq(siteImages.id, both.id)))).toBe('site_images_files_complete');
      expect(await insertFile(both.id, 'mobile', { contentType: 'image/jpeg' })).toBeUndefined();
      expect(await rejectedConstraint(conn.db.update(siteImages).set({ builtAt: NOW }).where(eq(siteImages.id, both.id)))).toBeUndefined();
      expect(await rejectedConstraint(conn.db.delete(siteImages).where(eq(siteImages.id, both.id)))).toBeUndefined();
      expect(await conn.db.select().from(siteImageFiles).where(eq(siteImageFiles.imageId, both.id))).toEqual([]);
      // کار کارگر مال یک چیز است.
      expect(
        await rejectedConstraint(conn.db.insert(jobs).values({ kind: BUILD_SITE_IMAGE_JOB, siteImageId: desktopOnly.id, reportExportId: randomUUID() })),
      ).toBe('jobs_one_target');
    });
  });
});
