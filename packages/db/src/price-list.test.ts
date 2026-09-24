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
    paperTypes: rows.paperTypes.map((p) => ({ ...p, enabled: p.enabled ?? true })) as never,
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
    const bands = back.bindingTypes.spiral_clear!.bands;
    expect(bands.map((b) => b.minSheets)).toEqual([1, 151, 301, 451, 601, 701]);
    expect(bands[0]!.priceRials).toBe(450_000);
  });

  it('ترتیب ردیف‌های خوانده‌شده روی نتیجه اثر ندارد', () => {
    // پستگرس بدون ORDER BY ترتیب را تضمین نمی‌کند، پس نتیجه نباید به آن وابسته باشد.
    const rows = asSelectRows() as unknown as Parameters<typeof rowsToPriceList>[0];
    const shuffled = {
      ...rows,
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
          bindingTypeId: 'spiral_clear',
        },
      ],
      shipping: null,
    };

    expect(quote(spec, rowsToPriceList(asSelectRows()))).toEqual(quote(spec, SEED_PRICE_LIST));
  });
});
