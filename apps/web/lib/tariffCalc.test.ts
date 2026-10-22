/**
 * ماشین‌حساب «تعرفه» (برش ۱۵٫۲، سؤال ۴۵۸): «چند صفحه؟» با ارقام فارسی و جداکنندهٔ هزارگان، سقف `file.max_pages`، و جزوهٔ `quote()` همان میز؛ و
 * HTMLی که سرور با ۱۲۰ صفحه می‌سازد عدد دارد، پس بی JS هم قیمت روی صفحه است. تعامل در `tests/tarefe.spec.ts`.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { TariffCalc } from '../components/TariffCalc';
import { INITIAL_CONFIG } from './orderConfig';
import { NONE_PAUSED } from './tariff';
import { calcSpec, readPages } from './tariffCalc';

const ZONES = [
  { id: 'tehran', name: 'تهران' },
  { id: 'other', name: 'شهرهای دیگر' },
];

describe('ماشین‌حساب «تعرفه»', () => {
  it('«چند صفحه؟»: عدد لاتین یا فارسی، با جداکنندهٔ هزارگان یا فاصله؛ ۱ تا سقف', () => {
    expect(readPages('120', 1500)).toBe(120);
    expect(readPages('۱۲۰', 1500)).toBe(120);
    expect(readPages(' 1,100 ', 1500)).toBe(1100);
    expect(readPages('۱٬۱۰۰', 1500)).toBe(1100);
    expect(readPages('1500', 1500)).toBe(1500);
    for (const bad of ['', ' ', '0', '1501', '-5', '12.5', 'صد', '1e3']) expect(readPages(bad, 1500), bad).toBeNull();
    expect(readPages('900', 800)).toBeNull();
  });

  it('همان جزوهٔ میز: ۱۲۰ صفحهٔ سیاه‌سفید دورو، 237,000 تومان؛ با ارسال به تهران 366,500 و شهرهای دیگر 374,750 (طرح `seo.html`)', () => {
    const plain = quote(calcSpec(INITIAL_CONFIG, 120, null), SEED_PRICE_LIST);
    expect(plain.items[0]).toMatchObject({ printedSides: 120, sheets: 60, volumes: 1, printRials: 1_920_000, bindingRials: 450_000 });
    expect(plain.totalWithoutShippingRials).toBe(2_370_000);
    expect(quote(calcSpec(INITIAL_CONFIG, 120, 'tehran'), SEED_PRICE_LIST).totalRials).toBe(3_665_000);
    expect(quote(calcSpec(INITIAL_CONFIG, 120, 'other'), SEED_PRICE_LIST).totalRials).toBe(3_747_500);
  });

  it('۱٬۱۰۰ صفحهٔ یکرو دو جلد ۵۵۰ برگی است (1,884,000)، و دورو یک جلد و با ارسال به تهران 112,000 تومان ارزان‌تر', () => {
    const single = { ...INITIAL_CONFIG, sidesMode: 'single' as const };
    const one = quote(calcSpec(single, 1100, null), SEED_PRICE_LIST);
    expect(one.items[0]).toMatchObject({ volumes: 2, sheetsPerVolume: [550, 550], bindingRials: 1_240_000 });
    expect(one.totalWithoutShippingRials).toBe(18_840_000);
    const there = quote(calcSpec(INITIAL_CONFIG, 1100, 'tehran'), SEED_PRICE_LIST);
    expect(there.items[0]).toMatchObject({ volumes: 1, sheets: 550 });
    expect(quote(calcSpec(single, 1100, 'tehran'), SEED_PRICE_LIST).totalRials - there.totalRials).toBe(1_120_000);
  });

  it('HTML سرور با ۱۲۰ صفحه: قیمت، صحافی، ارسال هر دو منطقه و «فایلت را بینداز»؛ ردیف‌های تک‌گزینه یک خط، بی کاشی', () => {
    const html = renderToStaticMarkup(
      createElement(TariffCalc, { priceList: SEED_PRICE_LIST, paused: NONE_PAUSED, maxPages: 1500, zones: ZONES, initialPages: 120 }),
    );
    expect(html).toContain('value="120"');
    expect(html).toContain('<span class="num">237,000</span> تومان');
    expect(html).toContain('<span class="num">192,000</span> تومان');
    expect(html).toContain('صحافی طلق و سیم، <span class="num">60</span> برگ');
    expect(html).toContain('تهران <span class="num">366,500</span>');
    expect(html).toContain('شهرهای دیگر <span class="num">374,750</span>');
    expect(html).toContain('href="/"');
    expect(html).toContain('فایلت را بینداز');
    // تعرفهٔ پایه فقط A4، تحریر و طلق و سیم دارد: یک خط، با رقم لاتین («تحریر ۸۰ گرم» تعرفه)، و کاشی‌ای برای آنها نیست.
    expect(html).toContain('اندازهٔ <bdi>A4</bdi>');
    expect(html).toContain('کاغذ تحریر <span class="num">80</span> گرم');
    expect(html).toContain('امروز گزینهٔ دیگری در تعرفه نیست.');
    expect(html).not.toContain('name="jozve-size"');
    expect(html).not.toContain('name="jozve-paper"');
    expect(html).not.toContain('name="jozve-binding"');
    // هیچ یادداشت ارزان‌تری برای دوروی پیش‌فرض نیست.
    expect(html).not.toContain('data-testid="calc-cheaper"');
  });
});
