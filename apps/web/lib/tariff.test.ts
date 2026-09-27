/**
 * تعرفهٔ صفحه در HTML و مرورگر (برش ۴٫۴، ADR-040): JSON درون `<script>` که هیچ نامی بسته‌اش نمی‌کند، و خواندنش با
 * تعرفهٔ پایه وقتی نبود یا خراب بود. بی مرورگر: `document` ساختگی است.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceList } from '@jozveyar/contracts';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { SEED_TARIFF, TARIFF_ELEMENT_ID, pageTariff, parseTariff, tariffJson, type SiteTariff } from './tariff';

/** تعرفه‌ای جز پایه، با نامی که ادمین می‌توانست بنویسد (۴٫۵) و HTML را می‌بست. */
const DEARER: SiteTariff = {
  priceList: {
    ...SEED_PRICE_LIST,
    version: 2,
    label: 'پاییز </script><script>alert(1)</script> <!-- ۱۴۰۵',
    clickRates: { color: 30_000, bw: 20_000 },
  } satisfies PriceList,
  slaDays: 3,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('JSON تعرفه درون HTML', () => {
  it('هیچ «<»ی ندارد، پس نه </script> صفحه را می‌بندد نه <!--؛ و JSON.parse همان تعرفه را برمی‌گرداند', () => {
    const json = tariffJson(DEARER);
    expect(json).not.toContain('<');
    expect(json.toLowerCase()).not.toContain('</script');
    expect(JSON.parse(json)).toEqual(DEARER);
    expect(parseTariff(json)).toEqual(DEARER);
  });

  it('تعرفهٔ پایه همان SEED_PRICE_LIST است، با ۲ روز کاری (ADR-013)', () => {
    expect(SEED_TARIFF.priceList).toBe(SEED_PRICE_LIST);
    expect(SEED_TARIFF.slaDays).toBe(2);
    expect(parseTariff(tariffJson(SEED_TARIFF))).toEqual(SEED_TARIFF);
  });

  it('نبود یا خراب: تعرفهٔ پایه، تا صفحه باز هم قیمت بدهد', () => {
    for (const text of [null, undefined, '', '{', 'null', '[]', '42', '{}', '{"slaDays":3}', '{"priceList":{},"slaDays":3}']) {
      expect(parseTariff(text), String(text)).toBe(SEED_TARIFF);
    }
    // روز کاری بی عدد هم خراب است
    expect(parseTariff(JSON.stringify({ priceList: DEARER.priceList, slaDays: '3' }))).toBe(SEED_TARIFF);
  });
});

describe('تعرفهٔ همین صفحه', () => {
  it('از عنصر #jy-tariff خوانده می‌شود', () => {
    const getElementById = vi.fn((id: string) => (id === TARIFF_ELEMENT_ID ? { textContent: tariffJson(DEARER) } : null));
    vi.stubGlobal('document', { getElementById });
    expect(TARIFF_ELEMENT_ID).toBe('jy-tariff');
    expect(pageTariff()).toEqual(DEARER);
    expect(getElementById).toHaveBeenCalledWith('jy-tariff');
  });

  it('بی عنصر، یا بی document (سرور): تعرفهٔ پایه', () => {
    vi.stubGlobal('document', { getElementById: () => null });
    expect(pageTariff()).toBe(SEED_TARIFF);
    vi.unstubAllGlobals();
    expect(typeof document).toBe('undefined');
    expect(pageTariff()).toBe(SEED_TARIFF);
  });
});
