/**
 * رفت‌وبرگشت تعرفه بین قرارداد و ردیف‌های جدول.
 *
 * این تست‌ها به پایگاه داده وصل نمی‌شوند. چیزی که می‌سنجند تبدیل شکل است، و
 * آن بدون پستگرس هم قابل سنجش است — پس در CI بدون سرویس اجرا می‌شوند.
 */

import { describe, expect, it } from 'vitest';
import { priceListSchema, type PriceList } from '@jozveyar/contracts';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { quote } from '@jozveyar/pricing';

import { priceListToRows, rowsToPriceList } from './price-list.js';

/** ردیف‌های درج را به شکل ردیف‌های خوانده‌شده درمی‌آورد (پیش‌فرض‌ها اعمال شده). */
function asSelectRows(list = SEED_PRICE_LIST) {
  const rows = priceListToRows(list, true);
  return {
    priceList: {
      ...rows.priceList,
      isActive: rows.priceList.isActive ?? false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as never,
    printRates: rows.printRates as never,
    paperTypes: rows.paperTypes.map((p) => ({ ...p, enabled: p.enabled ?? true })) as never,
    paperRates: rows.paperRates as never,
    bindingTypes: rows.bindingTypes.map((b) => ({ ...b, enabled: b.enabled ?? true })) as never,
    bindingRateBands: rows.bindingRateBands as never,
    shippingMethods: rows.shippingMethods.map((m) => ({
      ...m,
      enabled: m.enabled ?? false,
    })) as never,
    shippingRates: rows.shippingRates as never,
  };
}

describe('تعرفهٔ پایه', () => {
  /**
   * این تست تا امروز وجود نداشت و نبودش یک باگ واقعی را پنهان کرده بود:
   * `SEED_PRICE_LIST` با قرارداد خودش نمی‌خواند، چون سقف بازهٔ آخر `Infinity`
   * بود و zod نسخهٔ ۴ آن را رد می‌کند. هیچ‌جا تعرفه parse نمی‌شد، پس هیچ‌وقت
   * نترکید — تا لحظه‌ای که از سرور به مرورگر برود.
   */
  it('با قرارداد خودش می‌خواند', () => {
    expect(() => priceListSchema.parse(SEED_PRICE_LIST)).not.toThrow();
  });

  it('از JSON زنده بیرون می‌آید', () => {
    // `JSON.stringify(Infinity)` برابر `null` است. اگر روزی کسی `Infinity`
    // را برگرداند، این تست می‌شکند نه کاربرِ سنگین‌ترین سفارش.
    const overWire = JSON.parse(JSON.stringify(SEED_PRICE_LIST));
    expect(() => priceListSchema.parse(overWire)).not.toThrow();
    expect(overWire).toEqual(SEED_PRICE_LIST);
  });

  it('سنگین‌ترین سفارش هم کرایه می‌گیرد', () => {
    // بازهٔ بدون سقف باید به هر وزنی بخورد، از جمله وزن‌های خیلی بزرگ.
    const spec = {
      items: [
        {
          sections: [{ documentId: 'd1', pageCount: 1500 }],
          rules: [{ pageRanges: [[1, 1500]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }],
          copies: 10,
          sidesMode: 'double' as const,
          paperSize: 'a4' as const,
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: { methodId: 'post', zoneId: 'other' },
    };

    const result = quote(spec, SEED_PRICE_LIST);
    expect(result.estWeightGrams).toBeGreaterThan(3_000);
    expect(result.shippingRials).not.toBeNull();
    expect(result.warnings).not.toContain('shipping_rate_missing');
  });
});

describe('رفت‌وبرگشت تعرفه', () => {
  it('تعرفهٔ پایه بدون تغییر برمی‌گردد', () => {
    // ترتیب آرایهٔ نرخ‌ها مقایسه نمی‌شود و نباید بشود: جدول مجموعه است، نه
    // فهرست مرتب. چیزی که باید یکی باشد محتواست.
    const byKey = (r: { methodId: string; zoneId: string; minWeightGrams: number }) =>
      `${r.methodId}/${r.zoneId}/${r.minWeightGrams}`;
    const sorted = (list: PriceList) => ({
      ...list,
      shippingRates: list.shippingRates.slice().sort((a, b) => byKey(a).localeCompare(byKey(b))),
    });

    expect(sorted(rowsToPriceList(asSelectRows()))).toEqual(
      sorted(priceListSchema.parse(SEED_PRICE_LIST)),
    );
  });

  it('بازهٔ بدون سقف به صورت null می‌رود و null برمی‌گردد', () => {
    const rows = priceListToRows(SEED_PRICE_LIST);
    const openEnded = rows.shippingRates.filter((r) => r.maxWeightGrams === null);
    expect(openEnded).toHaveLength(2); // تهران و سایر

    const back = rowsToPriceList(asSelectRows());
    expect(back.shippingRates.filter((r) => r.maxWeightGrams === null)).toHaveLength(2);
  });

  it('بازه‌های صحافی بر حسب برگ و مرتب برمی‌گردند', () => {
    const back = rowsToPriceList(asSelectRows());
    const bands = back.bindingTypes.spiral_clear!.bands.a4!;
    expect(bands.map((b) => b.minSheets)).toEqual([1, 151, 301, 451, 601, 701]);
    expect(bands[0]!.priceRials).toBe(450_000);
  });

  it('ترتیب ردیف‌های خوانده‌شده روی نتیجه اثر ندارد', () => {
    // پستگرس بدون ORDER BY ترتیب را تضمین نمی‌کند، پس نتیجه نباید به آن وابسته باشد.
    const rows = asSelectRows() as unknown as Parameters<typeof rowsToPriceList>[0];
    const shuffled = {
      ...rows,
      printRates: rows.printRates.slice().reverse(),
      paperRates: rows.paperRates.slice().reverse(),
      bindingRateBands: rows.bindingRateBands.slice().reverse(),
      shippingRates: rows.shippingRates.slice().reverse(),
    };
    expect(rowsToPriceList(shuffled)).toEqual(rowsToPriceList(rows));
  });

  it('قیمت از تعرفهٔ رفت‌وبرگشتی همان قیمت تعرفهٔ اصلی است', () => {
    // مهم‌ترین تست این فایل: اگر تبدیل چیزی را خراب کند، قیمت عوض می‌شود.
    const spec = {
      items: [
        {
          sections: [{ documentId: 'd1', pageCount: 147 }],
          rules: [{ pageRanges: [[1, 147]] as [number, number][], colorMode: 'bw' as const, paperTypeId: 'tahrir80' }],
          copies: 1,
          sidesMode: 'double' as const,
          paperSize: 'a4' as const,
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: null,
    };

    expect(quote(spec, rowsToPriceList(asSelectRows()))).toEqual(quote(spec, SEED_PRICE_LIST));
  });
});

describe('کاتالوگ چاپ: اندازه‌ها، نرخ‌ها و صحافی‌ها (۸٫۳)', () => {
  /** کاتالوگی با A4 و A5، کاغذی که فقط A4 دارد، و صحافی‌ای که چند جلد نمی‌شود و A5 هم ندارد. */
  const catalog: PriceList = {
    ...SEED_PRICE_LIST,
    version: 3,
    printRates: {
      a5: { single: { color: 15_000, bw: 12_000 }, double: { color: 13_000, bw: 10_000 } },
      a4: { single: { color: 22_000, bw: 18_000 }, double: { color: 20_000, bw: 16_000 } },
    },
    paperTypes: {
      ...SEED_PRICE_LIST.paperTypes,
      glossy: { nameFa: 'گلاسه', gsm: 135, enabled: false, sheetRates: { a4: 15_000 } },
    },
    bindingTypes: {
      ...SEED_PRICE_LIST.bindingTypes,
      staple: {
        nameFa: 'منگنه',
        enabled: true,
        minSheets: 2,
        maxSheetsPerVolume: 50,
        splitsVolumes: false,
        weightPerVolumeGrams: 1,
        bands: { a4: [{ minSheets: 2, maxSheets: 50, priceRials: 80_000 }] },
      },
    },
  };

  it('هر اندازه چهار ردیف نرخ دارد، هر کاغذ یک ردیف برای هر اندازه‌اش، و هر بازه اندازه‌اش را', () => {
    const rows = priceListToRows(catalog);
    expect(rows.printRates).toHaveLength(8);
    expect(rows.printRates.filter((r) => r.paperSize === 'a5').map((r) => [r.sidesMode, r.colorMode, r.rateRials])).toEqual([
      ['single', 'color', 15_000],
      ['single', 'bw', 12_000],
      ['double', 'color', 13_000],
      ['double', 'bw', 10_000],
    ]);
    expect(rows.paperRates).toEqual([
      { priceListVersion: 3, paperTypeId: 'tahrir80', paperSize: 'a4', rateRials: 0 },
      { priceListVersion: 3, paperTypeId: 'glossy', paperSize: 'a4', rateRials: 15_000 },
    ]);
    expect(rows.bindingTypes.find((b) => b.id === 'staple')).toMatchObject({ minSheets: 2, splitsVolumes: false });
    expect(new Set(rows.bindingRateBands.map((b) => b.paperSize))).toEqual(new Set(['a4']));
  });

  it('رفت‌وبرگشت بی تغییر؛ اندازه‌ها به ترتیب ثابت، هر ترتیبی که ردیف‌ها بیایند', () => {
    const rows = asSelectRows(catalog) as unknown as Parameters<typeof rowsToPriceList>[0];
    const back = rowsToPriceList(rows);
    // ترتیب کرایه‌ها را تست بالا می‌سنجد (مرتب‌شده با منطقه)؛ اینجا بقیه.
    expect({ ...back, shippingRates: [] }).toEqual({ ...priceListSchema.parse(catalog), shippingRates: [] });
    expect(Object.keys(back.printRates)).toEqual(['a4', 'a5']);
    const shuffled = { ...rows, printRates: rows.printRates.slice().reverse(), paperRates: rows.paperRates.slice().reverse() };
    expect(rowsToPriceList(shuffled)).toEqual(back);
  });

  it('اندازهٔ نیمه‌کاره خوانده نمی‌شود: سه حالت از چهار', () => {
    const rows = asSelectRows(catalog) as unknown as Parameters<typeof rowsToPriceList>[0];
    const partial = { ...rows, printRates: rows.printRates.filter((r) => !(r.paperSize === 'a5' && r.colorMode === 'bw' && r.sidesMode === 'double')) };
    expect(() => rowsToPriceList(partial)).toThrow();
  });

  it('مساحت برگ نسخه‌های پیش از ۸٫۳ در تنظیم‌ها با خواندن کنار می‌رود', () => {
    const rows = asSelectRows() as unknown as Parameters<typeof rowsToPriceList>[0];
    const legacy = { ...rows, priceList: { ...rows.priceList, settings: { ...SEED_PRICE_LIST.settings, sheetAreaM2: 0.06237 } } };
    expect(rowsToPriceList(legacy).settings).toEqual(SEED_PRICE_LIST.settings);
  });
});
