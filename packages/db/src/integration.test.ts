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
import { priceListSchema } from '@jozveyar/contracts';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { createDb, type Database } from './index.js';
import { runMigrations } from './migrate.js';
import { loadActivePriceList, loadPriceList, seedPriceList, activatePriceList } from './seed.js';
import { bindingRateBands, priceLists, shippingRates } from './schema.js';

/**
 * نام محدودیتی که پستگرس رد کرده.
 *
 * drizzle خطای درایور را در یک Error با پیام «Failed query: …» می‌پیچد، پس
 * تطبیق روی پیام بیرونی نام محدودیت را پیدا نمی‌کند و تست **به دلیل اشتباه**
 * سبز یا قرمز می‌شود. نام واقعی در `cause` است.
 */
async function rejectedConstraint(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const cause = (error as { cause?: { constraint_name?: string } }).cause;
    return cause?.constraint_name;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('پایگاه دادهٔ واقعی', () => {
  let conn: Database;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL!);
    conn = createDb(DATABASE_URL!);
    // هر اجرا از صفر: تست نباید به حالت باقی‌مانده از اجرای قبلی وابسته باشد.
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
          documentId: 'd1',
          pageCount: 147,
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
          documentId: 'd1',
          pageCount: 1500,
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
});
