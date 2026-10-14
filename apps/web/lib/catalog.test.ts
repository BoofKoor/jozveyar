/**
 * کاتالوگ چاپ در میز (برش ۸٫۳): کدام گزینه برای این اندازه هست، و انتخابی که نمی‌خورد جایش را به پیش‌فرض همان ردیف می‌دهد.
 */

import { describe, expect, it } from 'vitest';
import type { PriceList } from '@jozveyar/contracts';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { bindingsFor, effectiveConfig, papersFor } from './catalog';
import type { OrderConfig } from './orderConfig';

/** طرح میز: A4 و A5، گلاسه فقط A4، منگنه تا ۵۰ برگ، چسب گرم فقط A4 با کمینهٔ ۲۰، و «کاور» خاموش. */
const LIST: PriceList = {
  ...SEED_PRICE_LIST,
  printRates: {
    a4: { single: { bw: 18_000, color: 22_000 }, double: { bw: 16_000, color: 20_000 } },
    a5: { single: { bw: 12_000, color: 15_000 }, double: { bw: 10_000, color: 13_000 } },
  },
  paperTypes: {
    tahrir80: { ...SEED_PRICE_LIST.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0 } },
    glossy: { nameFa: 'گلاسه', gsm: 135, enabled: true, sheetRates: { a4: 15_000 } },
    old: { nameFa: 'کاهی', gsm: 70, enabled: false, sheetRates: { a4: 0, a5: 0 } },
  },
  bindingTypes: {
    staple: {
      nameFa: 'منگنه',
      enabled: true,
      minSheets: 1,
      maxSheetsPerVolume: 50,
      splitsVolumes: false,
      weightPerVolumeGrams: 1,
      bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 80_000 }], a5: [{ minSheets: 1, maxSheets: 50, priceRials: 60_000 }] },
    },
    spiral_clear: {
      ...SEED_PRICE_LIST.bindingTypes.spiral_clear!,
      bands: { ...SEED_PRICE_LIST.bindingTypes.spiral_clear!.bands, a5: [{ minSheets: 1, maxSheets: 800, priceRials: 400_000 }] },
    },
    glue: {
      nameFa: 'چسب گرم',
      enabled: true,
      minSheets: 20,
      maxSheetsPerVolume: 400,
      splitsVolumes: true,
      weightPerVolumeGrams: 30,
      bands: { a4: [{ minSheets: 20, maxSheets: 400, priceRials: 600_000 }] },
    },
    cover: {
      nameFa: 'کاور',
      enabled: false,
      minSheets: 1,
      maxSheetsPerVolume: 100,
      splitsVolumes: false,
      weightPerVolumeGrams: 10,
      bands: { a4: [{ minSheets: 1, maxSheets: 100, priceRials: 100_000 }] },
    },
  },
};

const CONFIG: OrderConfig = {
  colorMode: 'bw',
  sidesMode: 'double',
  paperSize: 'a4',
  bindingTypeId: 'spiral_clear',
  paperTypeId: 'tahrir80',
  copies: 1,
};

describe('گزینه‌های هر اندازه', () => {
  it('کاغذ و صحافی فقط روشن و با نرخ یا بازهٔ همان اندازه؛ صحافی‌ای که به جزوه نمی‌خورد هم (کاشی خاموش)', () => {
    expect(papersFor(LIST, 'a4').map(([id]) => id)).toEqual(['tahrir80', 'glossy']);
    expect(papersFor(LIST, 'a5').map(([id]) => id)).toEqual(['tahrir80']);
    expect(bindingsFor(LIST, 'a4').map(([id]) => id)).toEqual(['staple', 'spiral_clear', 'glue']);
    expect(bindingsFor(LIST, 'a5').map(([id]) => id)).toEqual(['staple', 'spiral_clear']);
    expect(bindingsFor(SEED_PRICE_LIST, 'a4').map(([id]) => id)).toEqual(['spiral_clear']);
  });

  it('ارزان‌تر اول، هر ترتیبی که تعرفه دارد (پیش‌فرض اول، گزینهٔ تازه آخر)؛ هم‌قیمت به ترتیب تعرفه', () => {
    const { tahrir80, glossy } = LIST.paperTypes;
    const { staple, spiral_clear, glue } = LIST.bindingTypes;
    const added: PriceList = {
      ...LIST,
      paperTypes: { glossy: glossy!, tahrir80: tahrir80!, thin: { nameFa: 'نازک', gsm: 60, enabled: true, sheetRates: { a4: 0 } } },
      bindingTypes: { spiral_clear: spiral_clear!, glue: glue!, staple: staple!, none: { ...staple!, nameFa: 'بی صحافی', bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 0 }] } } },
    };
    expect(papersFor(added, 'a4').map(([id]) => id)).toEqual(['tahrir80', 'thin', 'glossy']);
    expect(bindingsFor(added, 'a4').map(([id]) => id)).toEqual(['none', 'staple', 'spiral_clear', 'glue']);
    expect(bindingsFor(added, 'a5').map(([id]) => id)).toEqual(['staple', 'spiral_clear']);
  });
});

describe('تنظیمی که قیمت می‌خورد', () => {
  it('انتخابی که می‌خورد همان می‌ماند، همان شیء', () => {
    const chosen = { ...CONFIG, paperSize: 'a5' as const, bindingTypeId: 'staple' };
    const result = effectiveConfig(chosen, LIST, 40);
    expect(result.config).toBe(chosen);
    expect(result.replaced).toEqual([]);
  });

  it('منگنهٔ جزوهٔ ۵۷ برگی طلق و سیم می‌شود، با دلیل؛ انتخاب خود جزوه دست نمی‌خورد', () => {
    const chosen = { ...CONFIG, bindingTypeId: 'staple' };
    const result = effectiveConfig(chosen, LIST, 113);
    expect(result.config.bindingTypeId).toBe('spiral_clear');
    expect(result.replaced).toEqual([
      { field: 'bindingTypeId', from: 'staple', to: 'spiral_clear', misfit: { reason: 'max', maxSheets: 50 } },
    ]);
    expect(chosen.bindingTypeId).toBe('staple');
    // یکرو همان ۵۰ برگ را رد می‌کند و دورو نه: برگ با همان قاعدهٔ موتور
    expect(effectiveConfig({ ...chosen, sidesMode: 'single' }, LIST, 60).replaced).toHaveLength(1);
    expect(effectiveConfig(chosen, LIST, 60).replaced).toEqual([]);
  });

  it('کمینه: چسب گرم جزوهٔ ۶ برگی طلق و سیم می‌شود', () => {
    expect(effectiveConfig({ ...CONFIG, bindingTypeId: 'glue' }, LIST, 12).replaced).toEqual([
      { field: 'bindingTypeId', from: 'glue', to: 'spiral_clear', misfit: { reason: 'min', minSheets: 20 } },
    ]);
  });

  it('اندازه: چسب گرم و گلاسه A5 ندارند؛ هر دو جایشان را می‌دهند، با دلیل اندازه', () => {
    const result = effectiveConfig({ ...CONFIG, paperSize: 'a5', bindingTypeId: 'glue', paperTypeId: 'glossy' }, LIST, 100);
    expect(result.config).toMatchObject({ paperSize: 'a5', paperTypeId: 'tahrir80', bindingTypeId: 'spiral_clear' });
    expect(result.replaced).toEqual([
      { field: 'paperTypeId', from: 'glossy', to: 'tahrir80' },
      { field: 'bindingTypeId', from: 'glue', to: 'spiral_clear', misfit: { reason: 'size' } },
    ]);
  });

  it('اندازه‌ای که تعرفه ندارد A4 می‌شود، و بقیه با همان A4 سنجیده می‌شوند', () => {
    const result = effectiveConfig({ ...CONFIG, paperSize: 'a3', bindingTypeId: 'glue' }, LIST, 100);
    expect(result.config).toMatchObject({ paperSize: 'a4', bindingTypeId: 'glue' });
    expect(result.replaced).toEqual([{ field: 'paperSize', from: 'a3', to: 'a4' }]);
  });

  it('خاموش یا نبوده (پیش‌نویس تعرفهٔ دیگر، یا دستکاری‌شده) جای خودش را می‌دهد، بی دلیل «نمی‌خورد»', () => {
    for (const [field, id] of [
      ['bindingTypeId', 'cover'],
      ['bindingTypeId', 'no_such'],
      ['bindingTypeId', 'constructor'],
      ['paperTypeId', 'old'],
      ['paperTypeId', 'toString'],
    ] as const) {
      const result = effectiveConfig({ ...CONFIG, [field]: id }, LIST, 40);
      expect(result.config[field], id).toBe(field === 'bindingTypeId' ? 'spiral_clear' : 'tahrir80');
      expect(result.replaced, id).toHaveLength(1);
    }
  });

  it('جزوه‌ای که هنوز صفحه‌ای ندارد: صحافی‌اش با برگ سنجیده نمی‌شود، فقط با اندازه', () => {
    expect(effectiveConfig({ ...CONFIG, bindingTypeId: 'glue' }, LIST, 0).replaced).toEqual([]);
    expect(effectiveConfig({ ...CONFIG, paperSize: 'a5', bindingTypeId: 'glue' }, LIST, 0).replaced).toHaveLength(1);
  });
});
