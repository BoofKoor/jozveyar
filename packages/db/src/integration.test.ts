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

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { priceListSchema, type Breakdown, type PriceList } from '@jozveyar/contracts';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { createDb, type Database } from './index.js';
import { runMigrations } from './migrate.js';
import { loadActivePriceList, loadPriceList, seedPriceList, activatePriceList } from './seed.js';
import {
  bindingRateBands,
  cities,
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
import { and, count, eq, inArray } from 'drizzle-orm';
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
import { createSmsLog } from './sms.js';
import { ADMIN_PERMISSIONS, ADMIN_ROLES, createAdminStore, type AdminEventInput, type NewInvite } from './admin.js';
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
  paperTypes,
  rolePermissions,
  shippingMethods,
} from './schema.js';
import { createTariffStore, type TariffActor } from './tariff.js';
import { createSettingsStore, SETTING_TARGET, type SettingsActor } from './settings.js';
import { createSecretStore, resolveServiceKey, serviceKeyContext, SERVICE_KEY_TARGET } from './secrets.js';
import { seal } from './sealed.js';
import { serviceSecrets } from './schema.js';
import { FILES_RETENTION_SETTING, OFFICIAL_THROUGH_SETTING, OTP_SITE_LIMIT_SETTING } from './reference.js';
import { orderAssignments, orderPrintFiles, printPartners } from './schema.js';
import { createPartnerStore } from './partners.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { READ_POST_FILE_JOB, createShipmentStore } from './shipments.js';
import { shipmentImportRows, shipmentImports, shipments } from './schema.js';
import { barcodeOf, parcel, postTable } from './postfile.fixtures.js';
import type { PanelScope } from './panel.js';

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
            minSheets: 100,
            maxSheets: 200,
            priceRials: 999_000,
          }),
        ),
      ).toBe('binding_rate_bands_no_overlap');
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
            clickRateColorRials: 1,
            clickRateBwRials: 1,
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
          items: [{ sections, rules: rules.map((r) => ({ ...r, paperTypeId: 'tahrir80' })), copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }],
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
          .values({ orderId: order!.id, seq: 1, pageCount, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' })
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
      expect(await rejectedConstraint(attempt({ status: 'succeeded' }))).toBe('payments_success_has_ref');
      await attempt({ status: 'failed', failureCode: 'cancelled' });
      await attempt({ status: 'succeeded', refId: '803114', verifiedAt: new Date() });
      expect(await rejectedConstraint(attempt({ status: 'succeeded', refId: '803115', verifiedAt: new Date() }))).toBe('payments_one_success');
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

    it('صدور کد زیر قفل: ده درخواست هم‌زمان برای یک شماره، فقط پنج کد', async () => {
      const auth = createAuthStore(conn);
      const since = new Date(Date.now() - 3_600_000);
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          auth.issueOtp({ mobile: MOBILE, ipHash: `ip${i}`, sessionHash: SESSION, since }, (counts) =>
            counts.mobile < 5 ? otpAt(new Date()) : null,
          ),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(5);
      const rows = await conn.db.select().from(otpRequests).where(eq(otpRequests.mobile, MOBILE));
      expect(rows).toHaveLength(5);
    });

    it('شمارش پنجره: شماره، IP و کل سایت، با قدیمی‌ترین و تازه‌ترین؛ بیرون از پنجره شمرده نمی‌شود', async () => {
      await conn.db.delete(otpRequests);
      const auth = createAuthStore(conn);
      const now = Date.now();
      const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000);
      const issue = (mobile: string, ipHash: string, createdAt: Date) =>
        auth.issueOtp({ mobile, ipHash, sessionHash: SESSION, since: new Date(0) }, () => otpAt(createdAt));
      await issue(MOBILE, 'ip-a', at(90)); // بیرون از پنجرهٔ یک ساعته
      await issue(MOBILE, 'ip-a', at(50));
      await issue(MOBILE, 'ip-b', at(10));
      await issue('09351234567', 'ip-a', at(5));
      let seen: unknown;
      await auth.issueOtp({ mobile: MOBILE, ipHash: 'ip-a', sessionHash: SESSION, since: at(60) }, (counts) => {
        seen = counts;
        return null;
      });
      expect(seen).toEqual({
        mobile: 2,
        mobileOldest: at(50),
        mobileLatest: at(10),
        ip: 2,
        ipOldest: at(50),
        site: 3,
        siteOldest: at(50),
      });
    });

    it('فرصت کد اتمی: ده سنجش هم‌زمان، فقط سه؛ کد منقضی فرصتی ندارد', async () => {
      const auth = createAuthStore(conn);
      const issued = await auth.issueOtp(
        { mobile: '09131234567', ipHash: 'ip', sessionHash: SESSION, since: new Date() },
        () => otpAt(new Date()),
      );
      const now = new Date();
      const claims = await Promise.all(Array.from({ length: 10 }, () => auth.claimOtpAttempt(issued!.id, now, 3)));
      expect(claims.filter((n) => n !== null).sort()).toEqual([1, 2, 3]);
      const expired = await auth.issueOtp(
        { mobile: '09141234567', ipHash: 'ip', sessionHash: SESSION, since: new Date() },
        () => otpAt(new Date(Date.now() - 180_000)),
      );
      expect(await auth.claimOtpAttempt(expired!.id, new Date(), 3)).toBeNull();
    });

    it('ورود یک بار: دو ورود هم‌زمان با یک کد، یک نشست؛ نشست باطل و منقضی پیدا نمی‌شود', async () => {
      const auth = createAuthStore(conn);
      const issued = await auth.issueOtp(
        { mobile: '09151234567', ipHash: 'ip', sessionHash: SESSION, since: new Date() },
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
          items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }],
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
        items: [{ pageCount: 102, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear', sections, rules }],
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
      const settled = await store.settlePayment('mock', authority, async () => ({
        kind: 'succeeded',
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
      const decide = async () => {
        asked += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        const paidAt = new Date();
        return { kind: 'succeeded' as const, refId: '1', cardMask: null, raw: null, paidAt, postHandoffDueAt: paidAt };
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
      const success = async () => {
        const paidAt = new Date();
        return { kind: 'succeeded' as const, refId: '2', cardMask: null, raw: null, paidAt, postHandoffDueAt: paidAt };
      };
      await store.settlePayment('mock', authorities[1]!, success);
      expect(await rejectedConstraint(store.settlePayment('mock', authorities[2]!, success))).toBe('payments_one_success');
      const details = await store.details(order.publicToken);
      expect(details!.payments.map((p) => p.status).sort()).toEqual(['failed', 'pending', 'succeeded']);
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
      const [row] = await conn.db.select().from(smsMessages).where(eq(smsMessages.toMobile, MOBILE));
      expect(row).toMatchObject({ provider: 'console', purpose: 'otp', status: 'logged', body: 'کد تأیید جزوه‌یار: 04821' });
    });

    it('تنظیم سقف کد کل سایت پیش‌فرض دارد', async () => {
      const [row] = await conn.db.select().from(settings).where(eq(settings.key, 'otp.site_hourly_limit'));
      expect(row!.value).toBe(300);
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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
      // متصدی از ۵٫۳ لغو و مبلغ را با مجوز خودشان دارد، و از ۶٫۱ ورود فایل پست (نه برگرداندنش)؛ چاپخانه فقط دیدن، وضعیت و دانلود
      // (ADR-042). صریح، نه از کد.
      expect(await read('operator')).toEqual([
        'files.download',
        'orders.address',
        'orders.assign',
        'orders.cancel',
        'orders.money',
        'orders.read',
        'orders.status',
        'shipments.import',
        'tariff.read',
      ]);
      expect([...ADMIN_ROLES.operator.permissions].sort()).toEqual(await read('operator'));
      expect(await read('print_partner')).toEqual(['files.download', 'orders.read', 'orders.status']);
      expect([...ADMIN_ROLES.print_partner.permissions].sort()).toEqual(await read('print_partner'));
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
        'files.download',
        'orders.address',
        'orders.assign',
        'orders.cancel',
        'orders.money',
        'orders.read',
        'orders.status',
        'shipments.import',
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
    const MINUTE = 60_000;
    /** حاشیهٔ پرداخت یک ساعت و مهلت هر تلاش نیم ساعت (ADR-034)؛ صریح. */
    const clock: PanelClock = {
      at: NOW,
      staleBefore: new Date(NOW.getTime() + 60 * MINUTE),
      unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE),
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
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
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
        items: [{ pageCount, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      num[key] = order.orderNumber;
      ids[key] = order.id;
      totals[key] = order.totalRials;
    }

    /** یک تلاش پرداخت با زمان ساختن دلخواه (پرداخت‌ها محافظ تغییر ندارند). */
    async function attempt(key: string, createdAt: Date): Promise<string> {
      const authority = `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`;
      const payment = await createOrderStore(conn).insertPayment({
        orderId: ids[key]!,
        provider: 'mock',
        amountRials: totals[key]!,
        authority,
        raw: null,
      });
      await conn.db.update(payments).set({ createdAt }).where(eq(payments.id, payment.id));
      return authority;
    }

    /** پرداخت موفق از همان راه برگشت درگاه: سفارش `paid` با مهلت، رویداد، و کار `prepare_order` در صف. */
    async function pay(key: string, paidAt: Date, due: Date) {
      const authority = await attempt(key, new Date(paidAt.getTime() - MINUTE));
      await createOrderStore(conn).settlePayment('mock', authority, async () => ({
        kind: 'succeeded',
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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
    let docId = '';
    let owner = '';
    let operator = '';

    /** سفارش پرداخت‌شده همان‌طور که سرور می‌سازد: سفارش در یک تراکنش، و برگشت موفق درگاه با رویداد و کار PDF. */
    async function paidOrder(due = END_MONDAY, name = 'سارا احمدی') {
      const sections = [{ documentId: docId, pageCount: 20 }];
      const rules = [{ pageRanges: [[1, 20]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const breakdown = quote(
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'tehran' } },
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
        items: [{ pageCount: 20, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      const payment = await store.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      const settled = await store.settlePayment('mock', payment.authority, async () => ({
        kind: 'succeeded',
        refId: '803114',
        cardMask: null,
        raw: null,
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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
      const clock: PanelClock = { at: NOW, staleBefore: new Date(NOW.getTime() + 60 * MINUTE), unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE) };
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
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId: 'tehran' } },
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
        items: [{ pageCount: pages, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      const payment = await store.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      await store.settlePayment('mock', payment.authority, async () => ({
        kind: 'succeeded',
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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

    it('دادهٔ پایه نگهداری فایل‌ها را ۳۰ روز می‌نشاند', async () => {
      await conn.db.delete(settings).where(eq(settings.key, FILES_RETENTION_SETTING));
      const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
      expect(seeded.settingsInserted).toEqual([FILES_RETENTION_SETTING]);
      expect((await conn.db.select().from(settings).where(eq(settings.key, FILES_RETENTION_SETTING)))[0]!.value).toBe(30);
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
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
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
        items: [{ pageCount: 20, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      const payment = await store.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      if (!settle) return { id: order.id, orderNumber: order.orderNumber, partnerId: null };
      const settled = await store.settlePayment('mock', payment.authority, async () => ({
        kind: 'succeeded',
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt: NOW,
        postHandoffDueAt: END_MONDAY,
      }));
      return { id: order.id, orderNumber: order.orderNumber, partnerId: settled!.order.printPartnerId };
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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

    it('تخصیص در پرداخت: همان شهر، وگرنه همان استان، وگرنه پیش‌فرض؛ در هر سطح پیش‌فرض، وگرنه قدیمی‌ترین؛ هر کدام با ردیف و قاعده', async () => {
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
      // چاپخانهٔ غیرفعال شیراز انتخاب نمی‌شود (شاهد: فعالش پایین).
      expect(await rules(shiraz.id)).toEqual([[null, first, 'system', null, 'default', null]]);
      expect(await rules(noCity.id)).toEqual([[null, first, 'system', null, 'default', null]]);
      expect(await rules(tehran.id)).toEqual([[null, first, 'system', null, 'city', null]]);

      // در همان شهر، پیش‌فرض بر قدیمی‌ترین مقدم است.
      await conn.db.update(printPartners).set({ isDefault: false }).where(eq(printPartners.id, first));
      await conn.db.update(printPartners).set({ isDefault: true }).where(eq(printPartners.id, noor2));
      expect((await paidOrder(MASHHAD)).partnerId).toBe(noor2);
      // بی پیش‌فرض بیرون از شهر و استان: قدیمی‌ترین چاپخانهٔ فعال، با قاعدهٔ خودش.
      await conn.db.update(printPartners).set({ isDefault: false }).where(eq(printPartners.id, noor2));
      const oldest = await paidOrder(ISFAHAN);
      expect(oldest.partnerId).toBe(noor);
      expect(await rules(oldest.id)).toEqual([[null, noor, 'system', null, 'oldest', null]]);
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
      const clock: PanelClock = { at: NOW, staleBefore: new Date(NOW.getTime() + 60 * MINUTE), unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE) };
      expect((await panel.alerts(ALL_ORDERS, clock)).unassigned).toEqual([order.orderNumber]);
      expect((await panel.list(ALL_ORDERS, { bucket: 'open', search: null, clock, limit: 10, offset: 0 }))[0]).toMatchObject({ printPartnerId: null });
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
      // گزینه‌ها: فقط فعال‌ها، پیش‌فرض اول، با شمار سفارش باز.
      expect(await panel.partnerOptions(ALL_ORDERS)).toEqual([
        { id: first, name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران', isDefault: true, openOrders: 1 },
        { id: noor, name: 'چاپ نور', cityName: 'مشهد', isDefault: false, openOrders: 0 },
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
      expect((await assignmentsOf(paid.id)).map((a) => [a.toPartnerId, a.rule])).toEqual([[first, 'default']]);
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
      expect(await partners.update({ id: noor, seen: { name: 'چاپ نور', cityId: 1326 }, name: 'چاپ نور مشهد', ...MASHHAD, event: partnerEvent('partners.update') })).toMatchObject({ ok: true });
      expect(await stampOf(open.id)).toBe(before);
      expect(await ticketJobOf(open.id)).toMatchObject({ status: 'done' });

      // نام چاپخانهٔ خود سفارش: اثر انگشت تازه، و کار برگهٔ سفارش باز در صف؛ سفارش رسیده به پست نه.
      expect(
        await partners.update({ id: first, seen: { name: 'چاپخانهٔ جزوه‌یار', cityId: 394 }, name: 'چاپخانهٔ مرکزی', ...TEHRAN, event: partnerEvent('partners.update') }),
      ).toMatchObject({ ok: true, changed: ['name'] });
      const renamed = await stampOf(open.id);
      expect(renamed).not.toBe(before);
      expect(await ticketJobOf(open.id)).toMatchObject({ status: 'queued' });
      expect(await ticketJobOf(closed.id)).toMatchObject({ status: 'done' });
      // شهر هم.
      await ticketDone(open.id);
      await partners.update({ id: first, seen: { name: 'چاپخانهٔ مرکزی', cityId: 394 }, name: 'چاپخانهٔ مرکزی', provinceId: 8, cityId: 336, event: partnerEvent('partners.update') });
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
      const created = await partners.create({ name: 'چاپ نور', ...MASHHAD, at: NOW, createdBy: admin, event: partnerEvent('partners.create') });
      expect(created).toMatchObject({ ok: true, partner: { name: 'چاپ نور', isDefault: false, deactivatedAt: null, createdBy: admin } });
      const noor = created.ok ? created.partner.id : '';
      expect(await partners.create({ name: 'چاپ نور', ...ISFAHAN, at: NOW, createdBy: admin, event: partnerEvent('partners.create') })).toEqual({
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
        partners.update({ id: noor, seen, name, ...place, event: partnerEvent('partners.update') });
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
          permissions: ['files.download', 'orders.read', 'orders.status'],
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
        expect(await panel.alerts(NOOR, clock)).toEqual({ failedPdf: [], unreturned: [], unassigned: [] });
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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
        { clickRateBwRials: 17_000 },
        { clickRateColorRials: 22_000 },
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

      // ردیف‌ها: عوض کردن، پاک کردن و درج، در هر پنج جدول.
      for (const [name, query] of [
        ['کاغذ', conn.db.update(paperTypes).set({ gsm: 90 }).where(eq(paperTypes.priceListVersion, 1))],
        ['صحافی', conn.db.update(bindingTypes).set({ maxSheetsPerVolume: 900 }).where(eq(bindingTypes.priceListVersion, 1))],
        ['بازه', conn.db.update(bindingRateBands).set({ priceRials: 1 }).where(eq(bindingRateBands.priceListVersion, 1))],
        ['روش ارسال', conn.db.update(shippingMethods).set({ enabled: true }).where(eq(shippingMethods.priceListVersion, 1))],
        ['کرایه', conn.db.update(shippingRates).set({ priceRials: 1 }).where(eq(shippingRates.priceListVersion, 1))],
        ['پاک کردن بازه', conn.db.delete(bindingRateBands).where(eq(bindingRateBands.priceListVersion, 1))],
        ['پاک کردن کرایه', conn.db.delete(shippingRates).where(eq(shippingRates.priceListVersion, 1))],
        [
          'بازهٔ تازه',
          conn.db.insert(bindingRateBands).values({ priceListVersion: 1, bindingTypeId: 'spiral_clear', minSheets: 801, maxSheets: 900, priceRials: 1 }),
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
      await conn.db.update(priceLists).set({ label: 'پیش‌نویس مهر', clickRateBwRials: 17_000 }).where(v2);
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
          .values({ version: 3, label: 'سه', clickRateColorRials: 1, clickRateBwRials: 1, settings: SEED_PRICE_LIST.settings, isActive: true })
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
          conn.db.insert(bindingRateBands).values({ priceListVersion: 2, bindingTypeId: 'spiral_clear', minSheets: 801, maxSheets: 900, priceRials: 1 }),
        ).finally(() => {
          settled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(settled).toBe(false);
      });
      expect(await late).toBe('price_list_rows_frozen');
      const [bands] = await conn.db.select({ n: count() }).from(bindingRateBands).where(eq(bindingRateBands.priceListVersion, 2));
      expect(bands!.n).toBe(SEED_PRICE_LIST.bindingTypes.spiral_clear!.bands.length);
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
        clickRates: { color: 22_000, bw: 17_000 },
        bindingTypes: {
          ...base.bindingTypes,
          spiral_clear: {
            ...spiral,
            bands: [
              { minSheets: 1, maxSheets: 300, priceRials: 480_000 },
              { minSheets: 301, maxSheets: 800, priceRials: 600_000 },
            ],
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
            bands: [
              { minSheets: 1, maxSheets: 300, priceRials: 1 },
              { minSheets: 300, maxSheets: 800, priceRials: 1 },
            ],
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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

    /** سفارش پرداخت‌شده (شنبه 11 مهر) همان‌طور که سرور می‌سازد؛ چاپخانه با تخصیص پرداخت. */
    async function paidOrder(place: { provinceId: number; cityId: number }, name: string) {
      const zoneId = place.provinceId === 8 ? 'tehran' : 'other';
      const sections = [{ documentId: docId, pageCount: 20 }];
      const rules = [{ pageRanges: [[1, 20]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }];
      const breakdown = quote(
        { items: [{ sections, rules, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear' }], shipping: { methodId: 'post', zoneId } },
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
        items: [{ pageCount: 20, copies: 1, sidesMode: 'double', bindingTypeId: 'spiral_clear', sections, rules }],
      });
      const payment = await orderStore.insertPayment({
        orderId: order.id,
        provider: 'mock',
        amountRials: order.totalRials,
        authority: `MOCK${randomUUID().replace(/-/g, '').toUpperCase()}`,
        raw: null,
      });
      const settled = await orderStore.settlePayment('mock', payment.authority, async () => ({
        kind: 'succeeded',
        refId: '803114',
        cardMask: null,
        raw: null,
        paidAt: tehran('2026-10-03 10:00'),
        postHandoffDueAt: END_MONDAY,
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

    async function printingOrder(place: { provinceId: number; cityId: number }, name: string) {
      const order = await paidOrder(place, name);
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users, order_status_events, order_assignments, shipments, shipment_import_rows, shipment_imports, jobs`,
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
      const clock: PanelClock = { at: NOW, staleBefore: NOW, unreturnedBefore: NOW };
      expect((await panelStore().list(ALL_ORDERS, { bucket: 'all', search, clock, limit: 10, offset: 0 })).map((o) => o.id)).toEqual([taheri.id]);
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
      expect(reverted).toEqual({ ok: true, voided: 3, reopened: [taheri.orderNumber], kept: [sharifi.orderNumber] });
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
      const insertShipment = (values: Partial<typeof shipments.$inferInsert>) =>
        rejectedConstraint(
          conn.db.insert(shipments).values({
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
  });
});
