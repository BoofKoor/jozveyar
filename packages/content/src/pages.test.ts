/**
 * صفحه‌های فرود و «تعرفه» (برش ۱۵٫۲): بلوک‌های زنده و قیمت نمونه با همان `quote()`، جدول‌های تعرفه، دو جای‌نگهدار صفحه‌ها، نشانی، سنجش با
 * تعرفه و نشانی‌های روی سایت، یکدست کردن، و رسم.
 */

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PriceList } from '@jozveyar/contracts';
import { NONE_PAUSED } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import {
  bindingTables,
  discountTiers,
  paperNotes,
  parseBlock,
  printTables,
  sampleQuote,
  shippingTable,
  vocabularyOf,
  type SampleSpec,
} from './blocks.js';
import { PageBlock, SampleCard } from './blocksRender.js';
import { factsOf, pageValues, placeholderValues } from './facts.js';
import { blockText, linksIn, parseInline, parseMarkdown } from './markdown.js';
import {
  RESERVED_SLUGS,
  canonicalPage,
  checkPage,
  defaultTariffPage,
  emptyLanding,
  landingOf,
  linkPath,
  pageFromFields,
  slugProblem,
  tidyPage,
  tidySlug,
  type LandingContent,
  type PageCheckContext,
} from './pages.js';
import { MarkdownBlocks } from './render.js';

const FACTS = factsOf({ priceList: SEED_PRICE_LIST, slaDays: 2, uploadDays: 2, orderFilesDays: 30, formats: { word: true, slides: true, image: true } });
const VALUES = pageValues(placeholderValues(FACTS), { at: new Date('2026-10-21T08:00:00Z'), priceChangedAt: new Date('2026-10-07T08:00:00Z') });
const html = (node: ReactNode) => renderToStaticMarkup(createElement('div', null, node)).replace(/^<div>|<\/div>$/g, '');
const VOCAB = vocabularyOf(SEED_PRICE_LIST);
const spec = (overrides: Partial<SampleSpec>): SampleSpec => ({
  pages: 200,
  copies: 1,
  color: null,
  sides: null,
  size: null,
  binding: null,
  paper: null,
  ...overrides,
});

/** تعرفهٔ پایه با منگنهٔ تا ۵۰ برگ (چند جلد نه)، A5، و یک پلهٔ تخفیف. */
const RICH: PriceList = {
  ...SEED_PRICE_LIST,
  printRates: { ...SEED_PRICE_LIST.printRates, a5: { single: { bw: 12_000, color: 15_000 }, double: { bw: 10_000, color: 14_000 } } },
  paperTypes: { ...SEED_PRICE_LIST.paperTypes, tahrir80: { ...SEED_PRICE_LIST.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0 } } },
  bindingTypes: {
    ...SEED_PRICE_LIST.bindingTypes,
    spiral_clear: {
      ...SEED_PRICE_LIST.bindingTypes.spiral_clear!,
      bands: { ...SEED_PRICE_LIST.bindingTypes.spiral_clear!.bands, a5: [{ minSheets: 1, maxSheets: 800, priceRials: 300_000 }] },
    },
    staple: {
      nameFa: 'منگنه',
      enabled: true,
      minSheets: 1,
      maxSheetsPerVolume: 50,
      splitsVolumes: false,
      weightPerVolumeGrams: 2,
      bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 50_000 }] },
    },
    glue: {
      nameFa: 'چسب گرم',
      enabled: false,
      minSheets: 20,
      maxSheetsPerVolume: 400,
      splitsVolumes: false,
      weightPerVolumeGrams: 30,
      bands: { a4: [{ minSheets: 20, maxSheets: 400, priceRials: 900_000 }] },
    },
  },
  discountTiers: [{ fromRials: 10_000_000, percent: 5, freeShipping: false }],
};

describe('دو جای‌نگهدار صفحه‌ها (سؤال ۴۶۲)', () => {
  it('سال شمسی امروز و روز فعال شدن تعرفه؛ نامعلوم «—»', () => {
    expect(VALUES['سال']).toBe('1405');
    expect(VALUES['تغییر_قیمت']).toBe('15 مهر 1405');
    expect(pageValues(placeholderValues(FACTS), { at: new Date(), priceChangedAt: null })['تغییر_قیمت']).toBe('—');
  });

  it('در صفحه‌ها کار می‌کنند و در متن‌های ۱۱٫۱ نه', () => {
    const page = parseInline('تعرفهٔ {سال}، از {تغییر_قیمت}', 'line', { page: true });
    expect(page.issues).toEqual([]);
    expect(page.nodes.filter((node) => node.type === 'ph').map((node) => node.type === 'ph' && node.name)).toEqual(['سال', 'تغییر_قیمت']);
    const site = parseInline('تعرفهٔ {سال}', 'line');
    expect(site.issues).toEqual([{ line: 1, code: 'placeholder_not_here', detail: 'سال' }]);
    expect(site.nodes).toEqual([{ type: 'text', text: 'تعرفهٔ {سال}' }]);
  });

  it('پیشنهاد نام نزدیک در صفحه‌ها دو جای‌نگهدار تازه را هم دارد', () => {
    expect(parseInline('{سال_ها}', 'line', { page: true }).issues[0]).toMatchObject({ code: 'placeholder_unknown', suggestion: 'سال' });
  });
});

describe('بلوک در متن (سؤال ۴۶۳)', () => {
  it('خطی که فقط [[…]] است بلوک است؛ وسط بند خطاست', () => {
    const { blocks, issues } = parseMarkdown('## قیمت\n[[قیمت: 200 صفحه]]\nبند [[تعرفه]] وسط.', { page: true });
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'block', 'paragraph']);
    expect(blocks[1]).toEqual({ type: 'block', line: 2, raw: 'قیمت: 200 صفحه' });
    expect(issues).toEqual([{ line: 3, code: 'block_inline', detail: '[[تعرفه]]' }]);
    expect(blockText(blocks[1]!, VALUES)).toBe('[[قیمت: 200 صفحه]]');
  });

  it('در متن‌های ۱۱٫۱ همان متن ساده می‌ماند، بی خطا', () => {
    const { blocks, issues } = parseMarkdown('[[تعرفه]]');
    expect(issues).toEqual([]);
    expect(blocks).toEqual([{ type: 'paragraph', line: 1, children: [{ type: 'text', text: '[[تعرفه]]' }] }]);
  });

  it('پیوندهای هر بخش با خطشان', () => {
    const { blocks } = parseMarkdown('بند با [تعرفه](/tarefe).\n\n- قلم [اسکن](/articles/scan-zard#a)\n- [تماس](tel:+982100000000)', { page: true });
    expect(linksIn(blocks)).toEqual([
      { line: 1, href: '/tarefe' },
      { line: 3, href: '/articles/scan-zard#a' },
      { line: 4, href: 'tel:+982100000000' },
    ]);
  });
});

describe('parseBlock', () => {
  it('چهار جدول با نامشان', () => {
    for (const [name, kind] of [
      ['تعرفه', 'tariff'],
      ['صحافی', 'binding'],
      ['ارسال', 'shipping'],
      ['تخفیف', 'discount'],
    ] as const) {
      expect(parseBlock(name, VOCAB, 1500)).toEqual({ block: { kind }, issues: [] });
    }
  });

  it('«قیمت:» با واژه‌های میز و «،»، ارقام فارسی و نام صحافی از تعرفه', () => {
    expect(parseBlock('قیمت: ۲۰۰ صفحه، سیاه‌سفید، دورو، طلق و سیم', VOCAB, 1500)).toEqual({
      block: { kind: 'price', spec: spec({ color: 'bw', sides: 'double', binding: 'طلق و سیم' }) },
      issues: [],
    });
    expect(parseBlock('قیمت: 100 صفحه‌ای, رنگی, یکرو, a5, تحریر 80 گرم, 3 نسخه', VOCAB, 1500).block).toEqual({
      kind: 'price',
      spec: spec({ pages: 100, copies: 3, color: 'color', sides: 'single', size: 'a5', paper: 'تحریر ۸۰ گرم' }),
    });
  });

  it('خطاها: نام ناشناس، واژهٔ ناشناس، دو بار، بی صفحه، بیرون از سقف', () => {
    expect(parseBlock('قیمت‌ها', VOCAB, 1500).issues).toEqual([{ code: 'block_unknown', detail: 'قیمت‌ها' }]);
    expect(parseBlock('قیمت: 200 صفحه، گالینگور', VOCAB, 1500).issues).toEqual([{ code: 'block_word', detail: 'گالینگور' }]);
    expect(parseBlock('قیمت: 200 صفحه، رنگی، رنگی', VOCAB, 1500).issues).toEqual([{ code: 'block_twice', detail: 'رنگی' }]);
    expect(parseBlock('قیمت: رنگی', VOCAB, 1500).issues).toEqual([{ code: 'block_pages' }]);
    expect(parseBlock('قیمت: 1600 صفحه', VOCAB, 1500).issues).toEqual([{ code: 'block_range', detail: '1600 صفحه', max: 1500 }]);
    expect(parseBlock('قیمت: 10 صفحه، 1001 نسخه', VOCAB, 1500).issues).toEqual([{ code: 'block_range', detail: '1001 نسخه', max: 1000 }]);
    expect(parseBlock('قیمت: 0 صفحه', VOCAB, 1500).issues).toEqual([{ code: 'block_range', detail: '0 صفحه', max: 1500 }]);
  });
});

describe('قیمت نمونه با همان quote() (سؤال ۴۵۶)', () => {
  it('200 صفحهٔ سیاه‌سفید دورو: همان عدد طرح، با ارسال به هر منطقه', () => {
    const result = sampleQuote(spec({}), SEED_PRICE_LIST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.quote.breakdown.items[0]!;
    expect([item.printRials, item.bindingRials, item.sheets, result.quote.breakdown.totalWithoutShippingRials]).toEqual([3_200_000, 450_000, 100, 3_650_000]);
    expect(result.quote.shipping).toEqual([
      { zoneId: 'tehran', totalRials: 4_945_000 },
      { zoneId: 'other', totalRials: 5_027_500 },
    ]);
  });

  it('1,100 صفحهٔ یکرو: دو جلد ۵۵۰ برگی', () => {
    const result = sampleQuote(spec({ pages: 1100, sides: 'single' }), SEED_PRICE_LIST);
    if (!result.ok) throw new Error('بی قیمت');
    const item = result.quote.breakdown.items[0]!;
    expect([item.sheetsPerVolume, item.bindingRials, result.quote.breakdown.totalWithoutShippingRials]).toEqual([[550, 550], 1_240_000, 18_840_000]);
  });

  it('گزینه‌ای که امروز نیست: اندازه، صحافی خاموش، کاغذ ناشناس، و صحافی‌ای که نمی‌خورد', () => {
    expect(sampleQuote(spec({ size: 'a5' }), SEED_PRICE_LIST)).toEqual({ ok: false, off: { reason: 'size', size: 'a5' } });
    expect(sampleQuote(spec({ binding: 'چسب گرم' }), RICH)).toEqual({ ok: false, off: { reason: 'binding', name: 'چسب گرم' } });
    expect(sampleQuote(spec({ paper: 'گلاسه' }), RICH)).toEqual({ ok: false, off: { reason: 'paper', name: 'گلاسه' } });
    expect(sampleQuote(spec({ binding: 'منگنه' }), RICH)).toEqual({ ok: false, off: { reason: 'misfit', name: 'منگنه', misfit: { reason: 'max', maxSheets: 50 } } });
    expect(sampleQuote(spec({ pages: 80, binding: 'منگنه' }), RICH).ok).toBe(true);
  });

  it('موقتاً خاموش هم قیمت نمی‌دهد', () => {
    const paused = { ...NONE_PAUSED, sizes: new Set(['a5'] as const), bindings: new Set(['staple']) };
    expect(sampleQuote(spec({ size: 'a5' }), RICH, paused)).toEqual({ ok: false, off: { reason: 'size', size: 'a5' } });
    expect(sampleQuote(spec({ pages: 80, binding: 'منگنه' }), RICH, paused)).toEqual({ ok: false, off: { reason: 'binding', name: 'منگنه' } });
  });

  it('پلهٔ تخفیف همان quote()', () => {
    const result = sampleQuote(spec({ pages: 1000 }), RICH);
    if (!result.ok) throw new Error('بی قیمت');
    expect(result.quote.breakdown.discount).toMatchObject({ source: 'tier', percent: 5 });
    expect(result.quote.breakdown.discountRials).toBeGreaterThan(0);
  });
});

describe('جدول‌ها', () => {
  it('چاپ هر اندازه، کاغذ، صحافی‌های روشن، ارسال و پله‌ها', () => {
    expect(printTables(RICH).map((table) => [table.label, table.rows])).toEqual([
      ['A4', [{ color: 'bw', single: 16_000, double: 16_000 }, { color: 'color', single: 20_000, double: 20_000 }]],
      ['A5', [{ color: 'bw', single: 12_000, double: 10_000 }, { color: 'color', single: 15_000, double: 14_000 }]],
    ]);
    expect(paperNotes(SEED_PRICE_LIST)).toEqual([{ name: 'تحریر ۸۰ گرم', rates: [{ size: 'a4', label: 'A4', rials: 0 }] }]);
    expect(bindingTables(RICH).map((table) => [table.name, table.label, table.bands.length])).toEqual([
      ['طلق و سیم', 'A4', 6],
      ['طلق و سیم', 'A5', 1],
      ['منگنه', 'A4', 1],
    ]);
    expect(shippingTable(SEED_PRICE_LIST)).toEqual({
      zones: ['tehran', 'other'],
      rows: [
        { minGrams: 0, maxGrams: 1000, rials: [1_295_000, 1_377_500] },
        { minGrams: 1000, maxGrams: 3000, rials: [1_500_000, 1_618_120] },
        { minGrams: 3000, maxGrams: null, rials: [2_000_000, 2_072_000] },
      ],
    });
    expect(discountTiers(SEED_PRICE_LIST)).toEqual([]);
    expect(printTables(RICH, { ...NONE_PAUSED, sizes: new Set(['a5'] as const) }).map((table) => table.size)).toEqual(['a4']);
  });
});

describe('نشانی (سؤال ۴۳۱)', () => {
  it('یکدست: بی دامنه و «/»، حرف کوچک، فاصله خط تیره', () => {
    expect(tidySlug(' https://jozveyar.com/Print PDF/ ')).toBe('print-pdf');
    expect(tidySlug('/print__arzan')).toBe('print-arzan');
    expect(tidySlug('چاپ-۱۲')).toBe('چاپ-12');
  });

  it('شکل، رزرو و خالی', () => {
    expect(slugProblem('print-pdf')).toBeNull();
    expect(slugProblem('')).toBe('required');
    expect(slugProblem('چاپ')).toBe('slug_format');
    expect(slugProblem('a')).toBe('slug_format');
    expect(slugProblem('print--pdf')).toBe('slug_format');
    expect(slugProblem('-pdf')).toBe('slug_format');
    expect(slugProblem('x'.repeat(61))).toBe('slug_format');
    for (const reserved of ['orders', 'tarefe', 'articles', 'chap-jozve', 'terms']) expect(slugProblem(reserved)).toBe('slug_reserved');
    expect(RESERVED_SLUGS).toContain('media');
  });

  it('مسیر پیوند بی # و ?', () => {
    expect(linkPath('/tarefe#calc')).toBe('/tarefe');
    expect(linkPath('/#faq')).toBe('/');
    expect(linkPath('/print-pdf?x=1')).toBe('/print-pdf');
    expect(linkPath('tel:+98912')).toBeNull();
  });
});

const LIVE = new Set(['/', '/tarefe', '/terms', '/print-arzan']);
const CTX: PageCheckContext = {
  values: VALUES,
  priceList: SEED_PRICE_LIST,
  maxPages: 1500,
  livePath: (path) => LIVE.has(path),
  slugTaken: (slug) => slug === 'sahafi',
};

const LANDING: LandingContent = {
  slug: 'print-pdf',
  name: 'پرینت PDF',
  title: 'پرینت PDF آنلاین، با صحافی و ارسال',
  lead: 'فایل PDF را بینداز؛ قیمت همان لحظه.',
  body: '## PDF همان‌طور چاپ می‌شود\nبند با [تعرفه](/tarefe).\n\n[[قیمت: 200 صفحه، سیاه‌سفید، دورو، طلق و سیم]]',
  faq: [{ q: 'صفحهٔ افقی؟', a: 'می‌چرخد؛ [ببین](/#faq).' }],
  desk: { color: 'color', sides: '', size: '', paper: '', binding: '' },
  inFooter: true,
  seo: { title: 'پرینت فایل PDF آنلاین {سال}', description: 'چاپ هر رو {نرخ_سیاه_سفید} تومان.' },
};

describe('سنجش صفحه (سؤال ۴۶۴)', () => {
  it('صفحهٔ درست بی خطا و بی هشدار', () => {
    expect(checkPage('landing', LANDING, CTX)).toEqual({ issues: [], warnings: [] });
  });

  it('نشانی: رزرو، تکراری، و شکل', () => {
    expect(checkPage('landing', { ...LANDING, slug: 'orders' }, CTX).issues).toEqual([
      { field: 'slug', label: 'نشانی', code: 'slug_reserved', detail: 'orders' },
    ]);
    expect(checkPage('landing', { ...LANDING, slug: 'sahafi' }, CTX).issues).toEqual([{ field: 'slug', label: 'نشانی', code: 'slug_taken', detail: 'sahafi' }]);
    expect(checkPage('landing', { ...LANDING, slug: '' }, CTX).issues).toEqual([{ field: 'slug', label: 'نشانی', code: 'required' }]);
  });

  it('پیوند به صفحه‌ای که روی سایت نیست، با خط و آغازش', () => {
    const body = 'بند اول.\n\n- قلم [بیشتر](/articles/scan-zard)';
    expect(checkPage('landing', { ...LANDING, body }, CTX).issues).toEqual([
      { field: 'body', label: 'متن صفحه', code: 'link_not_live', detail: '/articles/scan-zard', line: 3, excerpt: 'قلم [بیشتر](/articles/scan-zard)' },
    ]);
    const faq = [{ q: 'پرسش', a: 'پاسخ [اینجا](/print-rangi).' }];
    expect(checkPage('landing', { ...LANDING, faq }, CTX).issues).toEqual([
      { field: 'faq.0.a', label: 'پاسخ 1', code: 'link_not_live', detail: '/print-rangi' },
    ]);
  });

  it('عنوان گوگل با عدد امروز شمرده می‌شود', () => {
    const title = `${'ا'.repeat(56)} {سال}`;
    expect(checkPage('landing', { ...LANDING, seo: { ...LANDING.seo, title } }, CTX).issues).toEqual([
      { field: 'seo.title', label: 'عنوان گوگل', code: 'too_long', max: 60, length: 61, measured: true },
    ]);
  });

  it('بلوک ناشناس خطا با خط، و گزینهٔ خاموش هشدار', () => {
    const body = 'بند.\n[[قیمت‌ها]]\n[[قیمت: 100 صفحه، A5، دورو]]';
    const check = checkPage('landing', { ...LANDING, body }, CTX);
    expect(check.issues).toEqual([
      { field: 'body', label: 'متن صفحه', code: 'block_unknown', line: 2, excerpt: '[[قیمت‌ها]]', detail: 'قیمت‌ها' },
    ]);
    expect(check.warnings).toEqual([
      { field: 'body', label: 'متن صفحه', line: 3, raw: 'قیمت: 100 صفحه، A5، دورو', off: { reason: 'size', size: 'a5' } },
    ]);
  });

  it('گزینهٔ میزی که تعرفه ندارد', () => {
    const desk = { color: '', sides: '', size: 'a5', paper: 'glossy', binding: 'spiral_clear' } as const;
    expect(checkPage('landing', { ...LANDING, desk }, CTX).issues.map((issue) => issue.field)).toEqual(['desk.size', 'desk.paper']);
  });

  it('«تعرفه»ی پیش‌فرض بی خطا؛ و فیلدهای خالی', () => {
    expect(checkPage('tariff', defaultTariffPage(), CTX)).toEqual({ issues: [], warnings: [] });
    expect(checkPage('landing', emptyLanding(), CTX).issues.map((issue) => issue.field)).toEqual([
      'slug',
      'name',
      'title',
      'lead',
      'body',
      'seo.title',
      'seo.description',
    ]);
  });
});

describe('خواندن، فرم و یکدست کردن', () => {
  it('JSON خراب: هر فیلد بی شکل خالی، و پیش‌فرض میز نادرست هیچ', () => {
    expect(landingOf({ slug: 7, faq: [{ q: 'x', a: 1 }], desk: { color: 'blue', size: 'a5' }, inFooter: 'yes' })).toEqual({
      ...emptyLanding(),
      faq: [{ q: 'x', a: '' }],
      desk: { color: '', sides: '', size: 'a5', paper: '', binding: '' },
    });
  });

  it('فرم: سؤال‌ها به شمار، «در پاورقی» با 1', () => {
    const form: Record<string, string> = { slug: 'x', 'faq.0.q': 'پ', 'faq.0.a': 'پا', 'faq.1.q': 'نه', inFooter: '1', 'desk.sides': 'single' };
    const page = pageFromFields('landing', (name) => form[name] ?? '', 1);
    expect([page.faq, page.inFooter, page.desk.sides]).toEqual([[{ q: 'پ', a: 'پا' }], true, 'single']);
  });

  it('یکدست: ارقام، ي و ك، نشانی، و همان JSON یکتا', () => {
    const page = tidyPage('landing', { ...LANDING, slug: '/Print PDF', name: 'پرينت ۱' });
    expect([page.slug, page.name]).toEqual(['print-pdf', 'پرینت 1']);
    expect(canonicalPage('landing', page)).toBe(canonicalPage('landing', { ...page }));
    expect(canonicalPage('landing', page)).not.toBe(canonicalPage('landing', { ...page, inFooter: false }));
  });
});

describe('رسم', () => {
  const data = { priceList: SEED_PRICE_LIST, maxPages: 1500, tariffHref: '/tarefe' };

  it('قیمت نمونه: ردیف‌ها، جمع، ارسال و پیوند «همهٔ قیمت‌ها»', () => {
    const out = html(createElement(PageBlock, { raw: 'قیمت: 200 صفحه، سیاه‌سفید، دورو، طلق و سیم', data }));
    expect(out).toContain('جزوهٔ <span class="num">200</span> صفحه‌ای، سیاه‌سفید و دورو، طلق و سیم');
    expect(out).toContain('<dt>چاپ <span class="num">200</span> رو</dt><dd><span class="num">320,000</span> تومان</dd>');
    expect(out).toContain('<dt>صحافی، <span class="num">100</span> برگ</dt><dd><span class="num">45,000</span> تومان</dd>');
    expect(out).toContain('<dt>جمع</dt><dd><span class="num">365,000</span> تومان</dd>');
    expect(out).toContain('با ارسال: تهران <span class="num">494,500</span> و شهرهای دیگر <span class="num">502,750</span> تومان');
    expect(out).toContain('<a class="jy-link" href="/tarefe">همهٔ قیمت‌ها</a>');
  });

  it('دو جلد با برگ هر جلد؛ گزینهٔ امروز نیست «فعلاً ارائه نمی‌شود»', () => {
    expect(html(createElement(PageBlock, { raw: 'قیمت: 1100 صفحه، یکرو', data }))).toContain(
      'صحافی، <span class="num">2</span> جلد (<span class="num">550</span> و <span class="num">550</span> برگ)',
    );
    const off = html(createElement(PageBlock, { raw: 'قیمت: 100 صفحه، A5، دورو', data }));
    expect(off).toContain('data-sample="off"');
    expect(off).toContain('جزوهٔ 100 صفحه، A5، دورو');
    expect(off).toContain('فعلاً ارائه نمی‌شود.');
  });

  it('جدول‌های تعرفه، صحافی و ارسال؛ تخفیف بی پله هیچ', () => {
    expect(html(createElement(PageBlock, { raw: 'تعرفه', data }))).toContain('<th scope="row">سیاه‌سفید</th><td class="tf-end"><span class="num">1,600</span></td>');
    expect(html(createElement(PageBlock, { raw: 'صحافی', data }))).toContain('<td>تا <span class="num">150</span></td><td class="tf-end"><span class="num">45,000</span></td>');
    expect(html(createElement(PageBlock, { raw: 'ارسال', data }))).toContain('<td>بالای <span class="num">3</span> کیلو</td>');
    expect(html(createElement(PageBlock, { raw: 'تخفیف', data }))).toBe('');
  });

  it('متن صفحه با بلوک و جای‌نگهدار صفحه‌ها؛ بی دادهٔ بلوک، متن ۱۱٫۱', () => {
    const out = html(createElement(MarkdownBlocks, { text: 'بند {سال}.\n[[تعرفه]]', options: { values: VALUES }, blocks: data }));
    expect(out).toContain('<p>بند <span class="num">1405</span>.</p>');
    expect(out).toContain('data-block="tariff"');
    expect(html(createElement(MarkdownBlocks, { text: '[[تعرفه]]', options: { values: VALUES } }))).toBe('<p>[[تعرفه]]</p>');
  });

  it('کارت مستقیم با نتیجه: کلاس عدد زندهٔ پیش‌نمایش', () => {
    const result = sampleQuote(spec({}), SEED_PRICE_LIST);
    expect(html(createElement(SampleCard, { raw: 'قیمت: 200 صفحه', result, data: { ...data, live: 'live', tariffHref: null } }))).toContain(
      '<span class="num live">365,000</span>',
    );
  });
});
