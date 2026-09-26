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
import { priceListSchema, type PriceList } from '@jozveyar/contracts';
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
import { eq } from 'drizzle-orm';
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
import { PREPARE_ORDER_JOB, createOrderStore, type NewOrder } from './orders.js';
import { createSmsLog } from './sms.js';
import { ADMIN_PERMISSIONS, ADMIN_ROLES, createAdminStore, type AdminEventInput, type NewInvite } from './admin.js';
import { createPanelOrderStore, pdfErrorCode, type PanelBucket, type PanelClock, type PanelSearch } from './panel.js';
import {
  adminEvents,
  adminInvites,
  adminLoginAttempts,
  adminSessions,
  adminUserRoles,
  adminUsers,
  rolePermissions,
} from './schema.js';
import { sql } from 'drizzle-orm';

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

describe.skipIf(!DATABASE_URL)('پایگاه دادهٔ واقعی', () => {
  let conn: Database;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL!);
    conn = createDb(DATABASE_URL!);
    // هر اجرا از صفر: تست نباید به حالت باقی‌مانده از اجرای قبلی وابسته باشد. سفارش به تعرفه و
    // سند اشاره می‌کند و پرداخت به سفارش، پس اول این‌ها (برش ۳).
    await clearOrders(conn);
    await conn.db.delete(priceLists);
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
    it('بازهٔ صحافی همپوشان رد می‌شود', async () => {
      expect(
        await rejectedConstraint(
          conn.db.insert(bindingRateBands).values({
            priceListVersion: 1,
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
          priceListVersion: 1,
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
          priceListVersion: 1,
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
      expect(again).toEqual({ provinces: 31, cities: CITIES.length, priceListInserted: null, settingsInserted: [] });
      const [sla] = await conn.db.select().from(settings).where(eq(settings.key, SLA_DAYS_SETTING));
      expect(sla!.value).toBe(3);
      const [holidays] = await conn.db.select().from(settings).where(eq(settings.key, HOLIDAYS_SETTING));
      expect(holidays!.value).toEqual(OFFICIAL_HOLIDAYS);
      await conn.db.update(settings).set({ value: 2 }).where(eq(settings.key, SLA_DAYS_SETTING));
    });

    it('نرخ برای منطقه‌ای که نیست رد می‌شود', async () => {
      expect(
        await rejectedConstraint(
          conn.db.insert(shippingRates).values({
            priceListVersion: 1,
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
      await clearOrders(conn);
      await conn.db.delete(priceLists);
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

    it('برگشت از درگاه: موفق در یک تراکنش — پرداخت، سفارش، رویداد و کار prepare_order', async () => {
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
      const queued = await conn.db.select().from(jobs).where(eq(jobs.orderId, order.id));
      expect(queued).toEqual([expect.objectContaining({ kind: PREPARE_ORDER_JOB, status: 'queued', documentId: null })]);
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

    /** رویداد فقط افزودنی است و ادمین پاک‌نشدنی؛ تست از صفر با TRUNCATE، که تریگر ردیفی ندارد. */
    async function clearAdmin() {
      await conn.db.execute(
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users`,
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
      expect(await read('operator')).toEqual(['files.download', 'orders.address', 'orders.read', 'orders.status', 'tariff.read']);
      expect([...ADMIN_ROLES.operator.permissions].sort()).toEqual(await read('operator'));
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
      expect(session!.permissions).toEqual(['files.download', 'orders.address', 'orders.read', 'orders.status', 'tariff.read']);
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
      expect(
        await rejectedConstraint(conn.db.update(adminUserRoles).set({ scope: { partner: 1 } }).where(eq(adminUserRoles.adminUserId, userId))),
      ).toBe('admin_user_roles_scope');
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
        sql`TRUNCATE admin_events, admin_login_attempts, admin_sessions, admin_invites, admin_user_roles, admin_users`,
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
      // PDF جزوهٔ «فردا» ساخته نشد: شکست قطعی کارگر، با همان شکل `last_error`.
      await conn.db
        .update(jobs)
        .set({ status: 'failed', attempts: 1, lastError: 'file_missing: file_missing', finishedAt: NOW })
        .where(eq(jobs.orderId, ids.tomorrow!));

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
      expect(await panel.dueSummary(bounds)).toEqual({
        overdue: 1,
        today: 2,
        tomorrow: 1,
        later: 2,
        overdueRange: { earliest: END_SUNDAY, latest: END_SUNDAY },
        laterRange: { earliest: END_WEDNESDAY, latest: END_SATURDAY },
      });
      // مهلت خودِ «حالا» گذشته است؛ یک میلی‌ثانیه پیش از پایان روز هنوز «امروز» (شاهد `<=` و `<`).
      expect(await panel.dueSummary({ ...bounds, at: new Date(END_MONDAY.getTime() - 1) })).toMatchObject({ overdue: 1, today: 2 });
      expect(await panel.dueSummary({ ...bounds, at: END_MONDAY })).toMatchObject({ overdue: 3, today: 0 });
      // فردا تا خود آغاز پس‌فردا؛ یک روز جلوتر «فردا» مال چهارشنبه است.
      expect(
        await panel.dueSummary({ at: NOW, tomorrowStart: END_TUESDAY, dayAfterStart: END_WEDNESDAY }),
      ).toMatchObject({ today: 3, tomorrow: 1, later: 1, laterRange: { earliest: END_SATURDAY, latest: END_SATURDAY } });
      // فقط پرداخت‌شده‌ها: سفارش در انتظار و رهاشده مهلت ندارند.
      const all = await panel.dueSummary(bounds);
      expect(all.overdue + all.today + all.tomorrow + all.later).toBe(6);
    });

    it('چیپ‌ها: باز، در انتظار پرداخت، رهاشده و همه، با همان جست‌وجو', async () => {
      const panel = createPanelOrderStore(conn);
      expect(await panel.counts({ search: null, clock })).toEqual({ open: 6, awaiting: 1, abandoned: 3, all: 10 });
      // شاهد حاشیه: یک ساعت دیرتر نه، همین حالا فایل ۵۹ دقیقه‌ای هنوز پرداختنی بود.
      expect(await panel.counts({ search: null, clock: { ...clock, staleBefore: NOW } })).toMatchObject({ awaiting: 2, abandoned: 2 });
      expect(await panel.counts({ search: { kind: 'name', text: 'محمد' }, clock })).toEqual({ open: 1, awaiting: 0, abandoned: 1, all: 2 });
    });

    it('فهرست باز به ترتیب مهلت؛ هم‌مهلت‌ها به ترتیب پرداخت؛ بقیه تازه‌ترین اول', async () => {
      const panel = createPanelOrderStore(conn);
      const numbers = async (bucket: PanelBucket, limit = 50, offset = 0) =>
        (await panel.list({ bucket, search: null, clock, limit, offset })).map((row) => row.orderNumber);
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
      const rows = await panel.list({ bucket: 'all', search: null, clock, limit: 50, offset: 0 });
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
        (await panel.list({ bucket: 'all', search, clock, limit: 50, offset: 0 })).map((row) => row.orderNumber).sort();
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
      expect(await panel.alerts(clock)).toEqual({ failedPdf: [num.tomorrow], unreturned: [{ orderNumber: num.waiting, attempts: 1 }] });
      // نیم ساعت بعد، تلاش ۱۰ دقیقه‌ای هم بی برگشت است (شاهد مهلت تلاش).
      expect(
        (await panel.alerts({ ...clock, unreturnedBefore: new Date(NOW.getTime() - 5 * MINUTE) })).unreturned,
      ).toEqual([{ orderNumber: num.waiting, attempts: 2 }]);
      // بی حاشیه، سفارشی که فایلش ۵۹ دقیقهٔ دیگر پاک می‌شود هنوز پرداختنی است و تلاشش هشدار (شاهد حاشیه).
      expect((await panel.alerts({ ...clock, staleBefore: NOW })).unreturned.map((u) => u.orderNumber).sort()).toEqual(
        [num.waiting, num.soon].sort(),
      );
    });

    it('جزئیات: جزوه با نام فایل‌ها، کاغذ و صحافی همان نسخهٔ تعرفه، گیرنده، پرداخت‌ها، رویدادها و کار PDF', async () => {
      const panel = createPanelOrderStore(conn);
      const details = await panel.details(num.today2!);
      expect(details).toMatchObject({
        provinceName: 'خراسان رضوی',
        cityName: 'مشهد',
        zoneName: 'بقیهٔ کشور',
        shippingMethodName: 'پست پیشتاز',
        order: { orderNumber: num.today2, status: 'paid', postHandoffDueAt: END_MONDAY, priceListVersion: 1 },
        pdfJob: { status: 'queued', attempts: 0, maxAttempts: 3, lastError: null, finishedAt: null },
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
        }),
      ]);
      expect(details!.payments.map((p) => p.status)).toEqual(['succeeded']);
      expect(details!.statusEvents.map((e) => [e.fromStatus, e.toStatus, e.actor])).toEqual([
        [null, 'awaiting_payment', 'user'],
        ['awaiting_payment', 'paid', 'gateway'],
      ]);
      expect(details!.events).toEqual([]);
      expect(await panel.details(1)).toBeNull();

      const waiting = await panel.details(num.waiting!);
      expect(waiting!.pdfJob).toBeNull();
      // تازه‌ترین تلاش اول.
      expect(waiting!.payments.map((p) => p.status)).toEqual(['pending', 'pending', 'failed']);
    });

    it('دوباره بساز: فقط کار شکست‌خورده، با رویداد و شکست قبلی در یک تراکنش؛ دو کلیک هم‌زمان یک بار', async () => {
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
      expect(await panel.rebuildPdf(ids.today2!, { ...event(NOW), targetId: ids.today2! })).toBe('not_failed');
      const results = await Promise.all([panel.rebuildPdf(ids.tomorrow!, event(NOW)), panel.rebuildPdf(ids.tomorrow!, event(NOW))]);
      expect(results.sort()).toEqual(['not_failed', 'ok']);
      const [job] = await conn.db.select().from(jobs).where(eq(jobs.orderId, ids.tomorrow!));
      expect(job).toMatchObject({ status: 'queued', attempts: 0, lastError: null, finishedAt: null, lockedBy: null });
      expect(job!.runAfter.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
      const details = await panel.details(num.tomorrow!);
      expect(details!.events).toEqual([
        expect.objectContaining({
          action: 'orders.pdf_rebuild',
          adminName: 'علی محمدی',
          detail: { orderNumber: num.tomorrow, previous: { attempts: 1, error: 'file_missing' } },
        }),
      ]);
      // دانلود با همان راه رویداد، در صفحهٔ همان سفارش؛ سفارش دیگر رویدادی ندارد.
      await panel.logEvent({ ...event(new Date(NOW.getTime() + MINUTE)), action: 'orders.pdf_download', detail: { orderNumber: num.tomorrow, item: 1 } });
      expect((await panel.details(num.tomorrow!))!.events.map((e) => e.action)).toEqual(['orders.pdf_rebuild', 'orders.pdf_download']);
      expect((await panel.details(num.late!))!.events).toEqual([]);
    });

    it('PDF جزوه برای دانلود: کلید و حجم فقط وقتی کارگر ساخته', async () => {
      const panel = createPanelOrderStore(conn);
      expect(await panel.printFile(num.late!, 1)).toMatchObject({ orderId: ids.late, status: 'paid', itemSeq: 1, key: null, readyAt: null });
      expect(await panel.printFile(num.late!, 2)).toBeNull();
      const [item] = await conn.db.select().from(orderItems).where(eq(orderItems.orderId, ids.late!));
      await conn.db
        .update(orderItems)
        .set({ printPdfKey: `orders/${num.late}/jozve-1.pdf`, printPdfBytes: 40_265_318, printPdfSha256: 'a'.repeat(64), printPdfReadyAt: NOW })
        .where(eq(orderItems.id, item!.id));
      expect(await panel.printFile(num.late!, 1)).toMatchObject({ key: `orders/${num.late}/jozve-1.pdf`, bytes: 40_265_318, readyAt: NOW });
    });

    it('کد خطای کار از last_error کارگر: شکست قطعی با کد، بقیه گذرا', () => {
      expect(pdfErrorCode('file_missing: file_missing')).toBe('file_missing');
      expect(pdfErrorCode('page_count_mismatch: بخش 1: 47 صفحه، سرور 48 شمرده بود')).toBe('page_count_mismatch');
      expect(pdfErrorCode("StorageError('GET … → 503')")).toBe('transient');
      expect(pdfErrorCode(null)).toBeNull();
    });
  });
});
