import { describe, expect, it } from 'vitest';
import type { OrderSpec } from '@jozveyar/contracts';
import {
  bandPriceRials,
  countPages,
  perPageColorRules,
  quote,
  shippingFloorRials,
  splitSheets,
  toRanges,
  wholeDocumentRule,
} from './index.js';
import {
  DEFAULT_BINDING_TYPE_ID,
  DEFAULT_PAPER_TYPE_ID,
  SEED_PRICE_LIST as L,
} from './seed.js';

/** تومان → ریال، برای خوانا ماندن انتظارهای تست. */
const T = (tomans: number) => tomans * 10;

function spec(partial: Partial<OrderSpec['items'][number]> & { pageCount: number }): OrderSpec {
  const {
    pageCount,
    rules = wholeDocumentRule(pageCount, 'bw', DEFAULT_PAPER_TYPE_ID),
    copies = 1,
    sidesMode = 'double',
    bindingTypeId = DEFAULT_BINDING_TYPE_ID,
    documentId = 'doc-1',
  } = partial;
  return {
    items: [{ documentId, pageCount, rules, copies, sidesMode, bindingTypeId }],
    shipping: null,
  };
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
      (s, v) => s + (bandPriceRials(v, L.bindingTypes.spiral_clear!.bands) ?? 0),
      0,
    );
    const greedyPrice =
      (bandPriceRials(800, L.bindingTypes.spiral_clear!.bands) ?? 0) +
      (bandPriceRials(200, L.bindingTypes.spiral_clear!.bands) ?? 0);
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

  it('بسته‌بندی یک بار حساب می‌شود، نه به‌ازای هر فایل', () => {
    const two = quote(
      {
        items: [
          {
            documentId: 'a',
            pageCount: 100,
            rules: wholeDocumentRule(100, 'bw', DEFAULT_PAPER_TYPE_ID),
            copies: 1,
            sidesMode: 'double',
            bindingTypeId: DEFAULT_BINDING_TYPE_ID,
          },
          {
            documentId: 'b',
            pageCount: 60,
            rules: wholeDocumentRule(60, 'bw', DEFAULT_PAPER_TYPE_ID),
            copies: 1,
            sidesMode: 'double',
            bindingTypeId: DEFAULT_BINDING_TYPE_ID,
          },
        ],
        shipping: null,
      },
      L,
    );
    const itemWeight = two.items.reduce((s, i) => s + i.weightGrams, 0);
    expect(two.estWeightGrams).toBe(itemWeight + L.settings.packagingWeightGrams);
  });

  it('سبد چندفایلی یک کرایه می‌دهد، نه دو تا', () => {
    const together = quote(
      {
        items: [
          { documentId: 'a', pageCount: 100, rules: wholeDocumentRule(100, 'bw', DEFAULT_PAPER_TYPE_ID), copies: 1, sidesMode: 'double', bindingTypeId: DEFAULT_BINDING_TYPE_ID },
          { documentId: 'b', pageCount: 100, rules: wholeDocumentRule(100, 'bw', DEFAULT_PAPER_TYPE_ID), copies: 1, sidesMode: 'double', bindingTypeId: DEFAULT_BINDING_TYPE_ID },
        ],
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
    const paper = 1600 * 80 * L.settings.sheetAreaM2;
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
