import { describe, expect, it } from 'vitest';
import type { BindingType, OrderSpec, PriceList } from '@jozveyar/contracts';
import {
  bandPriceRials,
  bindingMisfit,
  countPages,
  itemPageCount,
  minOrderGapRials,
  offeredSizes,
  pausedOf,
  perPageColorRules,
  quote,
  sheetAreaM2,
  sheetsOf,
  shippingFloorRials,
  splitSheets,
  toRanges,
  volumesOf,
  wholeDocumentRule,
} from './index.js';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  SEED_PRICE_LIST as L,
} from './seed.js';

/** تومان → ریال، برای خوانا ماندن انتظارهای تست. */
const T = (tomans: number) => tomans * 10;

type Item = OrderSpec['items'][number];

/** یک قلم، از یک فایل یا چند فایل (`sections` به صفحه). */
function item(
  partial: Partial<Omit<Item, 'sections'>> & { pages: number | number[]; documentId?: string },
): Item {
  const counts = typeof partial.pages === 'number' ? [partial.pages] : partial.pages;
  const base = partial.documentId ?? 'doc';
  const sections = counts.map((pageCount, i) => ({
    documentId: counts.length === 1 ? base : `${base}-${i + 1}`,
    pageCount,
  }));
  const total = itemPageCount(sections);
  return {
    sections,
    rules: partial.rules ?? wholeDocumentRule(total, 'bw', DEFAULT_PAPER_TYPE_ID),
    copies: partial.copies ?? 1,
    sidesMode: partial.sidesMode ?? 'double',
    paperSize: partial.paperSize ?? 'a4',
    bindingTypeId: partial.bindingTypeId ?? DEFAULT_BINDING_TYPE_ID,
  };
}

function spec(partial: Partial<Omit<Item, 'sections'>> & { pageCount: number }): OrderSpec {
  const { pageCount, ...rest } = partial;
  return { items: [item({ ...rest, pages: pageCount })], shipping: null };
}

describe('countPages', () => {
  it('صفحات یک بازه را می‌شمارد', () => {
    expect(countPages([[1, 147]], 147)).toBe(147);
  });

  it('بازهٔ همپوشان را دوباره نمی‌شمارد', () => {
    expect(countPages([[1, 10], [5, 15]], 100)).toBe(15);
  });

  it('بازه را به تعداد صفحات سند محدود می‌کند', () => {
    expect(countPages([[1, 500]], 20)).toBe(20);
  });

  it('بازهٔ کاملاً بیرون سند را نادیده می‌گیرد', () => {
    expect(countPages([[50, 60]], 20)).toBe(0);
  });
});

describe('splitSheets — توزیع یکنواخت بین جلدها', () => {
  it('زیر سقف، یک جلد', () => {
    expect(splitSheets(74, 800)).toEqual([74]);
  });

  it('۱۰۰۰ برگ را به دو جلد ۵۰۰ برگی می‌شکند، نه ۸۰۰ و ۲۰۰', () => {
    expect(splitSheets(1000, 800)).toEqual([500, 500]);
  });

  it('باقی‌مانده را بین جلدهای اول پخش می‌کند', () => {
    expect(splitSheets(1001, 800)).toEqual([501, 500]);
  });

  it('توزیع یکنواخت از توزیع پرکردنی ارزان‌تر است', () => {
    const even = splitSheets(1000, 800);
    const evenPrice = even.reduce(
      (s, v) => s + (bandPriceRials(v, L.bindingTypes.spiral_clear!.bands.a4!) ?? 0),
      0,
    );
    const greedyPrice =
      (bandPriceRials(800, L.bindingTypes.spiral_clear!.bands.a4!) ?? 0) +
      (bandPriceRials(200, L.bindingTypes.spiral_clear!.bands.a4!) ?? 0);
    expect(evenPrice).toBe(T(124_000));
    expect(greedyPrice).toBe(T(128_000));
    expect(evenPrice).toBeLessThan(greedyPrice);
  });
});

describe('بازهٔ صحافی بر حسب برگ است، نه صفحه', () => {
  it('۳۰۰ صفحهٔ دورو = ۱۵۰ برگ ← بازهٔ ۱ تا ۱۵۰', () => {
    const b = quote(spec({ pageCount: 300, sidesMode: 'double' }), L);
    expect(b.items[0]!.sheets).toBe(150);
    expect(b.items[0]!.bindingRials).toBe(T(45_000));
  });

  it('۳۰۰ صفحهٔ یکرو = ۳۰۰ برگ ← بازهٔ ۱۵۱ تا ۳۰۰', () => {
    const b = quote(spec({ pageCount: 300, sidesMode: 'single' }), L);
    expect(b.items[0]!.sheets).toBe(300);
    expect(b.items[0]!.bindingRials).toBe(T(50_000));
  });

  it('صفحهٔ فرد دورو به بالا رُند می‌شود', () => {
    const b = quote(spec({ pageCount: 147, sidesMode: 'double' }), L);
    expect(b.items[0]!.sheets).toBe(74);
  });
});

describe('مثال مرجع — جزوهٔ ۱۴۷ صفحه‌ای (docs/PRICING.md)', () => {
  const base = spec({ pageCount: 147, sidesMode: 'double' });

  it('سیاه‌سفید: چاپ ۲۳۵,۲۰۰ + صحافی ۴۵,۰۰۰ = ۲۸۰,۲۰۰ تومان', () => {
    const b = quote(base, L);
    expect(b.items[0]!.printRials).toBe(T(235_200));
    expect(b.items[0]!.bindingRials).toBe(T(45_000));
    expect(b.totalWithoutShippingRials).toBe(T(280_200));
  });

  it('وزن برآوردی حدود ۵۳۰ گرم است', () => {
    const b = quote(base, L);
    // ۷۴ برگ × ۸۰ گرم × ۰٫۰۶۲۳۷ + ۶۰ گرم صحافی + ۱۰۰ گرم بسته‌بندی
    expect(b.estWeightGrams).toBe(529);
  });

  it('با ارسال به غیرتهران: ۴۱۷,۹۵۰ تومان', () => {
    const b = quote({ ...base, shipping: { methodId: 'post', zoneId: 'other' } }, L);
    expect(b.shippingRials).toBe(T(137_750));
    expect(b.totalRials).toBe(T(417_950));
  });

  it('بدون شهر، ارسال null است ولی کف کرایه اعلام می‌شود', () => {
    const b = quote(base, L);
    expect(b.shippingRials).toBeNull();
    expect(b.shippingFromRials).toBe(T(129_500));
    // جمع نمایش‌داده‌شده ارسال را شامل نمی‌شود
    expect(b.totalRials).toBe(b.totalWithoutShippingRials);
  });
});

describe('اثر حالت رنگ — استدلال تجاری ADR-002', () => {
  const pageCount = 147;
  const colorPages = [12, 15, 40, 41, 42, 77, 80, 95, 96, 120, 133, 140]; // ۱۲ صفحه

  const priceFor = (rules: OrderSpec['items'][number]['rules']) =>
    quote(spec({ pageCount, rules }), L).items[0]!.printRials;

  it('همه رنگی = ۲۹۴,۰۰۰ تومان', () => {
    expect(priceFor(wholeDocumentRule(pageCount, 'color', DEFAULT_PAPER_TYPE_ID))).toBe(
      T(294_000),
    );
  });

  it('همه سیاه‌سفید = ۲۳۵,۲۰۰ تومان', () => {
    expect(priceFor(wholeDocumentRule(pageCount, 'bw', DEFAULT_PAPER_TYPE_ID))).toBe(
      T(235_200),
    );
  });

  it('ترکیبی = ۲۴۰,۰۰۰ تومان — فقط ۴,۸۰۰ بیشتر از سیاه‌سفید', () => {
    const mixed = priceFor(perPageColorRules(pageCount, colorPages, DEFAULT_PAPER_TYPE_ID));
    expect(mixed).toBe(T(240_000));
    expect(mixed - T(235_200)).toBe(T(4_800));
    expect(T(294_000) - mixed).toBe(T(54_000));
  });

  it('قاعده‌های ترکیبی همهٔ صفحات را می‌پوشانند', () => {
    const b = quote(
      spec({ pageCount, rules: perPageColorRules(pageCount, colorPages, DEFAULT_PAPER_TYPE_ID) }),
      L,
    );
    expect(b.items[0]!.colorSides).toBe(12);
    expect(b.items[0]!.bwSides).toBe(135);
    expect(b.warnings).not.toContain('rules_do_not_cover_all_pages');
  });
});

describe('toRanges و perPageColorRules', () => {
  it('صفحات پیوسته را در یک بازه فشرده می‌کند', () => {
    expect(toRanges([1, 2, 3, 7, 8, 12])).toEqual([[1, 3], [7, 8], [12, 12]]);
  });

  it('فهرست خالی بازهٔ خالی می‌دهد', () => {
    expect(toRanges([])).toEqual([]);
  });

  it('سند تماماً سیاه‌سفید فقط یک قاعده می‌سازد', () => {
    const rules = perPageColorRules(10, [], DEFAULT_PAPER_TYPE_ID);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.colorMode).toBe('bw');
  });

  it('سند تماماً رنگی فقط یک قاعده می‌سازد', () => {
    const rules = perPageColorRules(3, [1, 2, 3], DEFAULT_PAPER_TYPE_ID);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.colorMode).toBe('color');
  });

  it('شمارهٔ صفحهٔ بیرون سند را دور می‌ریزد', () => {
    const rules = perPageColorRules(5, [2, 99], DEFAULT_PAPER_TYPE_ID);
    const color = rules.find((r) => r.colorMode === 'color');
    expect(color!.pageRanges).toEqual([[2, 2]]);
  });
});

describe('چند نسخه و چند فایل', () => {
  it('چاپ و صحافی دقیقاً در نسخه‌ها ضرب می‌شوند', () => {
    const one = quote(spec({ pageCount: 147, copies: 1 }), L);
    const three = quote(spec({ pageCount: 147, copies: 3 }), L);
    expect(three.items[0]!.printRials).toBe(one.items[0]!.printRials * 3);
    expect(three.items[0]!.bindingRials).toBe(one.items[0]!.bindingRials * 3);
  });

  it('وزن یک بار در آخر رُند می‌شود، نه به‌ازای هر نسخه', () => {
    // ۷۴ برگ × ۸۰ گرم × ۰٫۰۶۲۳۷ + ۶۰ = ۴۲۹٫۲ گرم برای یک نسخه.
    // سه نسخه ۱۲۸۷٫۶ است، پس ۱۲۸۸ — نه ۴۲۹×۳=۱۲۸۷. رُند در آخر دقیق‌تر است.
    const one = quote(spec({ pageCount: 147, copies: 1 }), L);
    const three = quote(spec({ pageCount: 147, copies: 3 }), L);
    expect(one.items[0]!.weightGrams).toBe(429);
    expect(three.items[0]!.weightGrams).toBe(1288);
    // خطای انباشته هیچ‌وقت از یک گرم بیشتر نمی‌شود:
    expect(Math.abs(three.items[0]!.weightGrams - one.items[0]!.weightGrams * 3)).toBeLessThanOrEqual(1);
  });

  it('بسته‌بندی یک بار حساب می‌شود، نه به‌ازای هر جزوه', () => {
    const two = quote(
      {
        items: [item({ pages: 100, documentId: 'a' }), item({ pages: 60, documentId: 'b' })],
        shipping: null,
      },
      L,
    );
    const itemWeight = two.items.reduce((s, i) => s + i.weightGrams, 0);
    expect(two.estWeightGrams).toBe(itemWeight + L.settings.packagingWeightGrams);
  });

  it('سبد چندجزوه‌ای یک کرایه می‌دهد، نه دو تا', () => {
    const together = quote(
      {
        items: [item({ pages: 100, documentId: 'a' }), item({ pages: 100, documentId: 'b' })],
        shipping: { methodId: 'post', zoneId: 'other' },
      },
      L,
    );
    const alone = quote(
      { ...spec({ pageCount: 100 }), shipping: { methodId: 'post', zoneId: 'other' } },
      L,
    );
    // دو سفارش جدا دو کرایه می‌دهند؛ یک سبد فقط یکی.
    expect(together.shippingRials).toBeLessThan(alone.shippingRials! * 2);
  });
});

describe('جزوهٔ چندفایلی — یک قلم، چند بخش، یک صحافی (ADR-030)', () => {
  it('صفحه‌ها جمع می‌شوند و یک صحافی حساب می‌شود، نه سه تا', () => {
    const jozve = quote({ items: [item({ pages: [100, 100, 100] })], shipping: null }, L);
    const [one] = jozve.items;
    expect(one!.pageCount).toBe(300);
    expect(one!.sheets).toBe(150);
    expect(one!.bindingRials).toBe(T(45_000));
    expect(jozve.totalWithoutShippingRials).toBe(T(300 * 1_600 + 45_000));

    // همان سه فایل، سه جزوهٔ جدا: همان چاپ، سه صحافی.
    const apart = quote(
      {
        items: [item({ pages: 100, documentId: 'a' }), item({ pages: 100, documentId: 'b' }), item({ pages: 100, documentId: 'c' })],
        shipping: null,
      },
      L,
    );
    expect(apart.totalWithoutShippingRials - jozve.totalWithoutShippingRials).toBe(T(2 * 45_000));
  });

  it('بین بخش‌ها صفحهٔ سفید نیست: ۳ + ۲۹۷ صفحهٔ دورو = ۱۵۰ برگ، بازهٔ اول صحافی', () => {
    // اگر هر بخش از روی برگ تازه شروع می‌شد، بخش اول ۲ برگ و کل جزوه ۱۵۱ برگ می‌شد:
    // بازهٔ دوم صحافی (۵۰,۰۰۰) و یک روی سفید چاپی بیشتر.
    const b = quote({ items: [item({ pages: [3, 297] })], shipping: null }, L);
    expect(b.items[0]).toMatchObject({ pageCount: 300, printedSides: 300, sheets: 150 });
    expect(b.items[0]!.bindingRials).toBe(T(45_000));
  });

  it('بخش‌ها به همان ترتیب در ریز قیمت می‌مانند', () => {
    const b = quote({ items: [item({ pages: [12, 1, 40], documentId: 'x' })], shipping: null }, L);
    expect(b.items[0]!.sections).toEqual([
      { documentId: 'x-1', pageCount: 12 },
      { documentId: 'x-2', pageCount: 1 },
      { documentId: 'x-3', pageCount: 40 },
    ]);
  });

  it('شمارهٔ صفحهٔ قاعده‌ها سراسری است: صفحهٔ ۳ بخش دوم = صفحهٔ ۱۳ جزوه', () => {
    const sections = [10, 10];
    const total = itemPageCount(sections.map((pageCount) => ({ pageCount })));
    const b = quote(
      {
        items: [item({ pages: sections, rules: perPageColorRules(total, [10 + 3], DEFAULT_PAPER_TYPE_ID) })],
        shipping: null,
      },
      L,
    );
    expect(b.items[0]).toMatchObject({ colorSides: 1, bwSides: 19 });
    expect(b.warnings).not.toContain('rules_do_not_cover_all_pages');
  });

  it('itemPageCount همان جمع است', () => {
    expect(itemPageCount([{ pageCount: 3 }, { pageCount: 297 }])).toBe(300);
    expect(itemPageCount([])).toBe(0);
  });
});

describe('چند جلد شدن سند بزرگ', () => {
  it('۱۶۰۰ صفحهٔ یکرو به دو جلد ۸۰۰ برگی می‌شکند', () => {
    const b = quote(spec({ pageCount: 1600, sidesMode: 'single' }), L);
    expect(b.items[0]!.volumes).toBe(2);
    expect(b.items[0]!.sheetsPerVolume).toEqual([800, 800]);
    expect(b.items[0]!.bindingRials).toBe(T(78_000) * 2);
    expect(b.warnings).not.toContain('binding_band_missing');
  });

  it('وزن صحافی به‌ازای هر جلد اضافه می‌شود', () => {
    const b = quote(spec({ pageCount: 1600, sidesMode: 'single' }), L);
    const paper = 1600 * 80 * sheetAreaM2('a4');
    expect(b.items[0]!.weightGrams).toBe(Math.round(paper + 60 * 2));
  });
});

describe('هشدارها', () => {
  it('قاعده‌ای که کل سند را نمی‌پوشاند هشدار می‌دهد', () => {
    const b = quote(
      spec({
        pageCount: 100,
        rules: [{ pageRanges: [[1, 50]], colorMode: 'bw', paperTypeId: DEFAULT_PAPER_TYPE_ID }],
      }),
      L,
    );
    expect(b.warnings).toContain('rules_do_not_cover_all_pages');
  });

  it('صحافی ناشناس هشدار می‌دهد و قیمت را صفر نمی‌کند', () => {
    const b = quote(spec({ pageCount: 100, bindingTypeId: 'no_such_binding' }), L);
    expect(b.warnings).toContain('binding_type_unavailable');
    expect(b.items[0]!.printRials).toBeGreaterThan(0);
  });

  it('کاغذ ناشناس هشدار می‌دهد', () => {
    const b = quote(
      spec({
        pageCount: 10,
        rules: [{ pageRanges: [[1, 10]], colorMode: 'bw', paperTypeId: 'unobtanium' }],
      }),
      L,
    );
    expect(b.warnings).toContain('paper_type_unavailable');
  });

  it('منطقهٔ بدون نرخ هشدار می‌دهد', () => {
    const b = quote(
      { ...spec({ pageCount: 100 }), shipping: { methodId: 'post', zoneId: 'mars' } },
      L,
    );
    expect(b.warnings).toContain('shipping_rate_missing');
    expect(b.shippingRials).toBeNull();
  });

  it('زیر حداقل سفارش هشدار می‌دهد', () => {
    const withMin = {
      ...L,
      settings: { ...L.settings, minOrderRials: T(500_000) },
    };
    const b = quote(spec({ pageCount: 20 }), withMin);
    expect(b.warnings).toContain('below_min_order');
  });

  it('مانده تا حداقل سفارش (۸٫۴): روی جمع چاپ، کاغذ و صحافی، پیش از مالیات و گرد کردن؛ رسیده و بی حداقل صفر', () => {
    // ۲۰ صفحهٔ دورو سیاه‌سفید: چاپ ۳۲,۰۰۰ + طلق و سیم ۴۵,۰۰۰ = ۷۷,۰۰۰ تومان؛ مالیات و گرد کردن در مانده نیستند
    const withMin = { ...L, settings: { ...L.settings, minOrderRials: T(100_000), vatPercent: 10, roundingStepRials: T(1_000) } };
    const below = quote(spec({ pageCount: 20 }), withMin);
    expect(below.subtotalRials).toBe(T(77_000));
    expect(below.warnings).toContain('below_min_order');
    expect(minOrderGapRials(below, withMin)).toBe(T(23_000));
    // همان مرز `quote()`: درست روی حداقل، رسیده
    const exact = { ...withMin, settings: { ...withMin.settings, minOrderRials: T(77_000) } };
    expect(quote(spec({ pageCount: 20 }), exact).warnings).not.toContain('below_min_order');
    expect(minOrderGapRials(quote(spec({ pageCount: 20 }), exact), exact)).toBe(0);
    expect(minOrderGapRials(quote(spec({ pageCount: 20 }), L), L)).toBe(0);
    expect(minOrderGapRials({ subtotalRials: 0 }, withMin)).toBe(0);
  });
});

describe('در دسترس بودن زنده (۸٫۴)', () => {
  const catalog: PriceList = {
    ...L,
    printRates: { ...L.printRates, a5: L.printRates.a4 },
    paperTypes: { ...L.paperTypes, glossy: { nameFa: 'گلاسه', gsm: 130, enabled: true, sheetRates: { a4: T(1_500) } }, old: { nameFa: 'کهنه', gsm: 70, enabled: false, sheetRates: { a4: 0 } } },
    bindingTypes: { ...L.bindingTypes, staple: { ...L.bindingTypes[DEFAULT_BINDING_TYPE_ID]!, nameFa: 'منگنه', splitsVolumes: false, maxSheetsPerVolume: 50 } },
  };

  it('فقط گزینه‌های ارائه‌شده و روشن این تعرفه؛ هرگز کاغذ و صحافی پیش‌فرض (A4 در شکل تنظیم هم نیست)', () => {
    const paused = pausedOf(catalog, {
      sizes: ['a5', 'a3'],
      papers: [DEFAULT_PAPER_TYPE_ID, 'glossy', 'old', 'nope'],
      bindings: [DEFAULT_BINDING_TYPE_ID, 'staple', 'nope'],
    });
    expect([...paused.sizes]).toEqual(['a5']);
    expect([...paused.papers]).toEqual(['glossy']);
    expect([...paused.bindings]).toEqual(['staple']);
  });

  it('بی تنظیم هیچ', () => {
    for (const none of [null, undefined, { sizes: [], papers: [], bindings: [] }]) {
      const paused = pausedOf(catalog, none);
      expect(paused.sizes.size + paused.papers.size + paused.bindings.size).toBe(0);
    }
  });
});

describe('کف کرایه', () => {
  it('ارزان‌ترین منطقه را برای این وزن برمی‌گرداند', () => {
    expect(shippingFloorRials(L, 500)).toBe(T(129_500));
    expect(shippingFloorRials(L, 2_000)).toBe(T(150_000));
    expect(shippingFloorRials(L, 5_000)).toBe(T(200_000));
  });

  it('روش غیرفعال در کف حساب نمی‌شود', () => {
    const onlyDisabled = {
      ...L,
      shippingMethods: { post: { nameFa: 'پست', enabled: false } },
    };
    expect(shippingFloorRials(onlyDisabled, 500)).toBeNull();
  });
});

describe('مالیات و رُند', () => {
  it('مالیات صفر است تا نماد فعال شود', () => {
    expect(quote(spec({ pageCount: 147 }), L).vatRials).toBe(0);
  });

  it('مالیات روی جمع و ارسال اعمال می‌شود', () => {
    const withVat = { ...L, settings: { ...L.settings, vatPercent: 10 } };
    const b = quote(
      { ...spec({ pageCount: 147 }), shipping: { methodId: 'post', zoneId: 'other' } },
      withVat,
    );
    expect(b.vatRials).toBe(Math.round((T(280_200) + T(137_750)) * 0.1));
  });

  it('رُند غیرفعال، تفاوت صفر است', () => {
    expect(quote(spec({ pageCount: 147 }), L).roundingRials).toBe(0);
  });

  it('رُند فعال، ریز قیمت همچنان جمع می‌شود', () => {
    const rounded = { ...L, settings: { ...L.settings, roundingStepRials: T(1_000) } };
    const b = quote(
      { ...spec({ pageCount: 147 }), shipping: { methodId: 'post', zoneId: 'other' } },
      rounded,
    );
    const exact = b.subtotalRials - b.discountRials + b.shippingRials! + b.vatRials;
    expect(exact + b.roundingRials).toBe(b.totalRials);
    expect(b.totalRials % T(1_000)).toBe(0);
  });
});

describe('تعیّن — شرط اجرا در مرورگر و سرور با یک نتیجه', () => {
  it('اجرای مکرر با همان ورودی، همان خروجی می‌دهد', () => {
    const s = { ...spec({ pageCount: 383, copies: 2 }), shipping: { methodId: 'post', zoneId: 'other' } } as OrderSpec;
    const runs = Array.from({ length: 5 }, () => JSON.stringify(quote(s, L)));
    expect(new Set(runs).size).toBe(1);
  });

  it('همهٔ مبالغ عدد صحیح‌اند — ریال کسری وجود ندارد', () => {
    const b = quote(
      { ...spec({ pageCount: 383, copies: 3, sidesMode: 'double' }), shipping: { methodId: 'post', zoneId: 'other' } },
      L,
    );
    for (const value of [b.subtotalRials, b.shippingRials!, b.vatRials, b.totalRials]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    for (const item of b.items) {
      for (const value of [item.printRials, item.paperRials, item.bindingRials, item.totalRials]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });
});

/* ───────────────────── کاتالوگ چاپ: اندازه، نرخ یکرو و دورو، صحافی‌ها (برش ۸٫۳) ───────────────────── */

/** کاتالوگ نمونهٔ طرح میز (سؤال ۱۸۴): A4 و A5، گلاسه، منگنه تا 50 برگ، و چسب گرم با کمینه. */
const CATALOG: PriceList = {
  ...L,
  printRates: {
    a4: { single: { bw: T(1_800), color: T(2_200) }, double: { bw: T(1_600), color: T(2_000) } },
    a5: { single: { bw: T(1_200), color: T(1_500) }, double: { bw: T(1_000), color: T(1_300) } },
  },
  paperTypes: {
    ...L.paperTypes,
    tahrir80: { ...L.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0 } },
    glossy: { nameFa: 'گلاسه', gsm: 135, enabled: true, sheetRates: { a4: T(1_500) } },
  },
  bindingTypes: {
    spiral_clear: {
      ...L.bindingTypes.spiral_clear!,
      bands: { a4: L.bindingTypes.spiral_clear!.bands.a4!, a5: [{ minSheets: 1, maxSheets: 800, priceRials: T(40_000) }] },
    },
    staple: {
      nameFa: 'منگنه',
      enabled: true,
      minSheets: 1,
      maxSheetsPerVolume: 50,
      splitsVolumes: false,
      weightPerVolumeGrams: 1,
      bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: T(8_000) }], a5: [{ minSheets: 1, maxSheets: 50, priceRials: T(6_000) }] },
    },
    glue: {
      nameFa: 'چسب گرم',
      enabled: true,
      minSheets: 20,
      maxSheetsPerVolume: 400,
      splitsVolumes: true,
      weightPerVolumeGrams: 30,
      bands: { a4: [{ minSheets: 20, maxSheets: 400, priceRials: T(60_000) }] },
    },
  },
};

describe('اندازهٔ کاغذ و نرخ هر رو (۸٫۳)', () => {
  it('نرخ هر رو با اندازه و یکرو یا دورو: ۱۰۰ صفحه A4 یکرو ۱,۸۰۰ و دورو ۱,۶۰۰، A5 دورو ۱,۰۰۰', () => {
    const at = (paperSize: 'a4' | 'a5', sidesMode: 'single' | 'double') =>
      quote(spec({ pageCount: 100, paperSize, sidesMode }), CATALOG).items[0]!.printRials;
    expect(at('a4', 'single')).toBe(T(180_000));
    expect(at('a4', 'double')).toBe(T(160_000));
    expect(at('a5', 'double')).toBe(T(100_000));
    expect(at('a5', 'single')).toBe(T(120_000));
  });

  it('رنگی و سیاه‌سفید هر کدام نرخ همان اندازه و حالت را دارند، قاعده‌به‌قاعده', () => {
    const b = quote(
      spec({
        pageCount: 10,
        paperSize: 'a5',
        sidesMode: 'single',
        rules: [
          { pageRanges: [[1, 3]], colorMode: 'color', paperTypeId: DEFAULT_PAPER_TYPE_ID },
          { pageRanges: [[4, 10]], colorMode: 'bw', paperTypeId: DEFAULT_PAPER_TYPE_ID },
        ],
      }),
      CATALOG,
    );
    expect(b.items[0]!.printRials).toBe(T(3 * 1_500 + 7 * 1_200));
    expect(b.warnings).toEqual([]);
  });

  it('اندازه‌ای که نرخ ندارد ارائه نمی‌شود: هشدار، چاپ صفر، و ریز قیمت همان اندازه را می‌گوید', () => {
    const b = quote(spec({ pageCount: 20, paperSize: 'a3' }), CATALOG);
    expect(b.warnings).toContain('paper_size_unavailable');
    expect(b.items[0]!.printRials).toBe(0);
    expect(b.items[0]!.paperSize).toBe('a3');
    expect(offeredSizes(CATALOG)).toEqual(['a4', 'a5']);
    expect(offeredSizes(L)).toEqual(['a4']);
  });

  it('کاغذ نرخ هر برگ هر اندازه را دارد: گلاسه A4 ۱,۵۰۰ هر برگ؛ گلاسهٔ A5 نیست', () => {
    const rules = wholeDocumentRule(100, 'color', 'glossy');
    const a4 = quote(spec({ pageCount: 100, rules }), CATALOG);
    expect(a4.items[0]!.paperRials).toBe(T(50 * 1_500));
    expect(a4.warnings).toEqual([]);
    const a5 = quote(spec({ pageCount: 100, rules, paperSize: 'a5' }), CATALOG);
    expect(a5.warnings).toContain('paper_type_unavailable');
    expect(a5.items[0]!.paperRials).toBe(0);
  });

  it('وزن از مساحت همان اندازه: A4 همان ۰٫۰۶۲۳۷ پیش از ۸٫۳، A5 نصف‌تر', () => {
    expect(sheetAreaM2('a4')).toBe(0.06237);
    expect(sheetAreaM2('a5')).toBeCloseTo(0.03108, 10);
    expect(sheetAreaM2('a3')).toBeCloseTo(0.12474, 10);
    const a5 = quote(spec({ pageCount: 200, paperSize: 'a5' }), CATALOG);
    expect(a5.items[0]!.weightGrams).toBe(Math.round(100 * 80 * sheetAreaM2('a5') + 60));
  });

  it('تعرفهٔ پایه با شکل تازه همان قیمت پیش از ۸٫۳ را می‌دهد (یکرو و دورو یک نرخ، فقط A4)', () => {
    const single = quote(spec({ pageCount: 147, sidesMode: 'single' }), L);
    const double = quote(spec({ pageCount: 147, sidesMode: 'double' }), L);
    expect(single.items[0]!.printRials).toBe(T(147 * 1_600));
    expect(double.items[0]!.printRials).toBe(T(147 * 1_600));
    expect(double.totalRials).toBe(T(280_200));
  });
});

describe('صحافی‌ها: کمینه، سقف، چند جلد یا «نمی‌خورد»، و اندازه (۸٫۳)', () => {
  const staple = CATALOG.bindingTypes.staple!;
  const glue = CATALOG.bindingTypes.glue!;
  const spiral = CATALOG.bindingTypes.spiral_clear!;

  it('منگنه تا ۵۰ برگ: ۵۷ برگ نمی‌خورد، با دلیل؛ و قیمت آن هشدار دارد', () => {
    expect(bindingMisfit(staple, 'a4', 50)).toBeNull();
    expect(bindingMisfit(staple, 'a4', 57)).toEqual({ reason: 'max', maxSheets: 50 });
    const b = quote(spec({ pageCount: 113, bindingTypeId: 'staple' }), CATALOG);
    expect(b.items[0]!.sheets).toBe(57);
    expect(b.warnings).toContain('binding_does_not_fit');
    expect(b.items[0]!.volumes).toBe(1);
  });

  it('صحافی‌ای که چند جلد نمی‌شود هرگز نمی‌شکند؛ طلق و سیم بالای سقف یکنواخت می‌شکند', () => {
    expect(volumesOf(staple, 57)).toEqual([57]);
    expect(volumesOf(spiral, 1000)).toEqual([500, 500]);
    expect(bindingMisfit(spiral, 'a4', 5000)).toBeNull();
  });

  it('کمینه: چسب گرم دست‌کم ۲۰ برگ؛ ۱۰ برگ نمی‌خورد، و کمینه روی نازک‌ترین جلد است', () => {
    expect(bindingMisfit(glue, 'a4', 10)).toEqual({ reason: 'min', minSheets: 20 });
    expect(bindingMisfit(glue, 'a4', 20)).toBeNull();
    // ۴۱۰ برگ با سقف ۴۰۰ دو جلد ۲۰۵ برگی است؛ هر دو بالای کمینه.
    expect(bindingMisfit(glue, 'a4', 410)).toBeNull();
    const thick: BindingType = { ...glue, minSheets: 300 };
    // همان ۴۱۰ با کمینهٔ ۳۰۰: جلدهای ۲۰۵ برگی نازک‌ترند.
    expect(bindingMisfit(thick, 'a4', 410)).toEqual({ reason: 'min', minSheets: 300 });
    // ۴۱۱ برگ دو جلد ۲۰۶ و ۲۰۵ است: کمینهٔ ۲۰۶ را جلد اول دارد و دومی نه.
    expect(bindingMisfit({ ...glue, minSheets: 206 }, 'a4', 411)).toEqual({ reason: 'min', minSheets: 206 });
    expect(bindingMisfit({ ...glue, minSheets: 205 }, 'a4', 411)).toBeNull();
    const b = quote(spec({ pageCount: 10, bindingTypeId: 'glue', sidesMode: 'single' }), CATALOG);
    expect(b.warnings).toContain('binding_does_not_fit');
  });

  it('صحافی‌ای که این اندازه را ندارد نمی‌خورد: چسب گرم A5 ندارد', () => {
    expect(bindingMisfit(glue, 'a5', 100)).toEqual({ reason: 'size' });
    const b = quote(spec({ pageCount: 200, paperSize: 'a5', bindingTypeId: 'glue' }), CATALOG);
    expect(b.warnings).toEqual(expect.arrayContaining(['binding_does_not_fit', 'binding_band_missing']));
    expect(b.items[0]!.bindingRials).toBe(0);
  });

  it('قیمت صحافی از بازه‌های همان اندازه: منگنه A5 ۶,۰۰۰ و A4 ۸,۰۰۰', () => {
    const a5 = quote(spec({ pageCount: 60, paperSize: 'a5', bindingTypeId: 'staple' }), CATALOG);
    const a4 = quote(spec({ pageCount: 60, bindingTypeId: 'staple' }), CATALOG);
    expect([a5.items[0]!.bindingRials, a4.items[0]!.bindingRials]).toEqual([T(6_000), T(8_000)]);
    expect([a5.warnings, a4.warnings]).toEqual([[], []]);
  });

  it('برگ یک تعریف دارد: sheetsOf همان برگ ریز قیمت', () => {
    for (const pageCount of [1, 2, 147, 300]) {
      for (const sidesMode of ['single', 'double'] as const) {
        expect(sheetsOf(pageCount, sidesMode)).toBe(quote(spec({ pageCount, sidesMode }), L).items[0]!.sheets);
      }
    }
  });
});
