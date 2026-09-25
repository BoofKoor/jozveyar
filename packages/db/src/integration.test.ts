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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
