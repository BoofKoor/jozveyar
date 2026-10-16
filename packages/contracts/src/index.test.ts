/**
 * قرارداد قلم سفارش: یک جزوه، یک یا چند بخش (ADR-030).
 */

import { describe, expect, it } from 'vitest';

import {
  DISCOUNT_TIERS_MAX,
  MAX_SECTIONS_PER_ITEM,
  TIER_PERCENT_MAX,
  itemSpecSchema,
  priceListSchema,
  type ItemSpec,
} from './index.js';

function jozve(sectionCount: number): ItemSpec {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({ documentId: `d${i + 1}`, pageCount: 10 }));
  return {
    sections,
    rules: [{ pageRanges: [[1, Math.max(1, sectionCount * 10)]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
    copies: 1,
    sidesMode: 'double',
    paperSize: 'a4',
    bindingTypeId: 'spiral_clear',
  };
}

describe('itemSpecSchema', () => {
  it('یک بخش تا سقف بخش‌ها را می‌پذیرد', () => {
    expect(itemSpecSchema.safeParse(jozve(1)).success).toBe(true);
    expect(itemSpecSchema.safeParse(jozve(MAX_SECTIONS_PER_ITEM)).success).toBe(true);
  });

  it('جزوهٔ بی‌فایل و جزوهٔ بیشتر از سقف را رد می‌کند', () => {
    expect(itemSpecSchema.safeParse(jozve(0)).success).toBe(false);
    expect(itemSpecSchema.safeParse(jozve(MAX_SECTIONS_PER_ITEM + 1)).success).toBe(false);
  });

  it('بخش بی‌صفحه یا بی‌سند پذیرفته نمی‌شود', () => {
    const empty = jozve(2);
    empty.sections[1] = { documentId: 'd2', pageCount: 0 };
    expect(itemSpecSchema.safeParse(empty).success).toBe(false);

    const anonymous = jozve(2);
    anonymous.sections[0] = { documentId: '', pageCount: 10 };
    expect(itemSpecSchema.safeParse(anonymous).success).toBe(false);
  });

  it('تعداد صفحهٔ کل قلم در قرارداد نیست — فقط `quote()` جمعش می‌کند', () => {
    const parsed = itemSpecSchema.parse({ ...jozve(2), pageCount: 999 });
    expect(parsed).not.toHaveProperty('pageCount');
  });
});

describe('اندازهٔ کاغذ و تعرفهٔ کاتالوگ (۸٫۳)', () => {
  it('قلم بی اندازه یا با اندازهٔ ناشناس پذیرفته نمی‌شود', () => {
    const { paperSize: _omitted, ...bare } = jozve(1);
    expect(itemSpecSchema.safeParse(bare).success).toBe(false);
    expect(itemSpecSchema.safeParse({ ...jozve(1), paperSize: 'b5' }).success).toBe(false);
    expect(itemSpecSchema.safeParse({ ...jozve(1), paperSize: 'a5' }).success).toBe(true);
  });

  const list = {
    version: 2,
    label: 'نمونه',
    printRates: { a4: { single: { bw: 18_000, color: 22_000 }, double: { bw: 16_000, color: 20_000 } } },
    paperTypes: { tahrir80: { nameFa: 'تحریر', gsm: 80, enabled: true, sheetRates: { a4: 0 } } },
    bindingTypes: {
      spiral_clear: {
        nameFa: 'طلق و سیم',
        enabled: true,
        minSheets: 1,
        maxSheetsPerVolume: 800,
        splitsVolumes: true,
        weightPerVolumeGrams: 60,
        bands: { a4: [{ minSheets: 1, maxSheets: 800, priceRials: 450_000 }] },
      },
    },
    shippingMethods: {},
    shippingRates: [],
    settings: { minOrderRials: 0, roundingStepRials: 0, vatPercent: 0, packagingWeightGrams: 100 },
  };

  it('نرخ هر اندازه هر چهار حالت را می‌خواهد و صفر نمی‌شود', () => {
    expect(priceListSchema.safeParse(list).success).toBe(true);
    const partial = { ...list, printRates: { a4: { single: { bw: 18_000, color: 22_000 } } } };
    expect(priceListSchema.safeParse(partial).success).toBe(false);
    const zero = { ...list, printRates: { a4: { ...list.printRates.a4, double: { bw: 0, color: 20_000 } } } };
    expect(priceListSchema.safeParse(zero).success).toBe(false);
    // A4 همیشه: اندازهٔ پیش‌فرض و جای جزوه‌ای که اندازه‌اش دیگر نیست.
    expect(priceListSchema.safeParse({ ...list, printRates: { a5: list.printRates.a4 } }).success).toBe(false);
  });

  it('مساحت برگ نسخه‌های پیش از ۸٫۳ در تنظیم‌ها با خواندن کنار می‌رود', () => {
    const old = { ...list, settings: { ...list.settings, sheetAreaM2: 0.06237 } };
    expect(priceListSchema.parse(old).settings).not.toHaveProperty('sheetAreaM2');
  });
  it('پله‌های تخفیف سفارش بزرگ (۱۱٫۴): نبودنش هیچ؛ به ترتیب آستانه و بی تکرار، تا سقف، و هر پله تخفیفی دارد', () => {
    expect(priceListSchema.parse(list).discountTiers).toEqual([]);
    const tier = (fromRials: number, percent: number, freeShipping = false) => ({ fromRials, percent, freeShipping });
    const ok = (discountTiers: unknown[]) => priceListSchema.safeParse({ ...list, discountTiers }).success;
    expect(ok([tier(1_000, 5), tier(2_000, 0, true), tier(3_000, 10, true)])).toBe(true);
    expect(ok([tier(2_000, 5), tier(1_000, 10)])).toBe(false);
    expect(ok([tier(1_000, 5), tier(1_000, 10)])).toBe(false);
    expect(ok([tier(1_000, 0)])).toBe(false);
    expect(ok([tier(1_000, TIER_PERCENT_MAX)])).toBe(true);
    expect(ok([tier(1_000, TIER_PERCENT_MAX + 1)])).toBe(false);
    expect(ok([tier(0, 5)])).toBe(false);
    expect(ok(Array.from({ length: DISCOUNT_TIERS_MAX + 1 }, (_, i) => tier((i + 1) * 1_000, 5)))).toBe(false);
  });
});
