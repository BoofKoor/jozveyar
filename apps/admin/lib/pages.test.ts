/**
 * نوشته‌های «صفحه‌ها و مقاله‌ها» (`pages.ts`، برش ۱۵٫۲): نشان‌ها و زیر نام هر ردیف فهرست، هشدار بلوک، خلاصهٔ صفحهٔ تازه در «چه عوض می‌شود»،
 * نام و زمان نسخه‌ها، ردیف‌های «میز سفارش این صفحه» و زیرعنوان ویرایشگر. «حالا» چهارشنبه 29 مهر 1405، ساعت 11:20 تهران است.
 */

import { describe, expect, it } from 'vitest';

import type { LandingContent, PageWarning } from '@jozveyar/content';
import type { PageState, SitePageDraftRow, SitePageVersionRow } from '@jozveyar/db';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import {
  deskChoices,
  fixedText,
  newPageSummary,
  pageEditorSub,
  pagePublishTitle,
  pageVersionMeta,
  pageVersionName,
  rowBadges,
  rowMeta,
  warningLine,
} from './pages';
import type { PageRow } from './server/pages';

const NOW = new Date('2026-10-21T07:50:00Z');
/** دوشنبه 27 مهر، 11:30 تهران. */
const MON = new Date('2026-10-19T08:00:00Z');
/** جمعه 1 آبان، 09:00 تهران. */
const FRI = new Date('2026-10-23T05:30:00Z');
/** امروز 10:40 و 11:05 تهران. */
const TODAY_1040 = new Date('2026-10-21T07:10:00Z');
const TODAY_1105 = new Date('2026-10-21T07:35:00Z');

const landing = (change: Partial<LandingContent> = {}): LandingContent => ({
  slug: 'print-pdf',
  name: 'پرینت PDF',
  title: 'پرینت PDF آنلاین',
  lead: 'لید',
  body: '',
  faq: [],
  desk: { color: '', sides: '', size: '', paper: '', binding: '' },
  inFooter: true,
  seo: { title: 't', description: 'd' },
  ...change,
});

function version(row: Partial<SitePageVersionRow> & Pick<SitePageVersionRow, 'version'>): SitePageVersionRow {
  return {
    id: row.version,
    pageId: 2,
    slug: 'print-pdf',
    content: landing(),
    restoredFrom: null,
    removal: null,
    movedTo: null,
    liveFrom: MON,
    withdrawnAt: null,
    createdBy: 'admin-1',
    createdByName: 'سارا',
    createdAt: MON,
    ...row,
  };
}

const draft: SitePageDraftRow = {
  pageId: 2,
  content: landing({ title: 'دیگر' }),
  baseVersion: 2,
  updatedBy: 'admin-1',
  updatedByName: 'سارا',
  createdAt: TODAY_1040,
  updatedAt: TODAY_1105,
};

const state = (live: SitePageVersionRow | null, pending: SitePageVersionRow | null = null): PageState => ({
  live,
  pending,
  latest: Math.max(0, live?.version ?? 0, pending?.version ?? 0),
});

function row(change: Partial<PageRow>): PageRow {
  return {
    param: '2',
    kind: 'landing',
    name: 'پرینت PDF',
    slug: 'print-pdf',
    state: state(null),
    isDefault: false,
    draft: null,
    removed: null,
    warnings: [],
    blockIssues: [],
    inFooter: false,
    ...change,
  };
}

const warning = (raw: string, off: PageWarning['off'], line = 11): PageWarning => ({ field: 'body', label: 'متن صفحه', line, raw, off });

describe('ردیف فهرست (سؤال ۴۶۱)', () => {
  it('نشان‌ها: روی سایت یا متن پیش‌فرض یا برداشته، زمان‌دار، پیش‌نویس و شمار هشدار', () => {
    const live = version({ version: 2 });
    expect(rowBadges(row({ kind: 'tariff', isDefault: true }))).toEqual([{ tone: 'neutral', text: 'متن پیش‌فرض' }]);
    expect(rowBadges(row({ kind: 'tariff', state: state(live) }))).toEqual([{ tone: 'success', text: 'روی سایت' }]);
    expect(
      rowBadges(
        row({
          state: state(live, version({ version: 3, liveFrom: FRI })),
          draft,
          warnings: [warning('قیمت: 100 صفحه، A5', { reason: 'size', size: 'a5' }), warning('قیمت: 50 صفحه، منگنه', { reason: 'binding', name: 'منگنه' })],
        }),
      ),
    ).toEqual([
      { tone: 'success', text: 'روی سایت' },
      { tone: 'info', text: 'زمان‌دار' },
      { tone: 'warning', text: 'پیش‌نویس' },
      { tone: 'warning', text: '2 هشدار' },
    ]);
    const removal = version({ version: 3, content: null, removal: 'gone', liveFrom: TODAY_1040 });
    expect(rowBadges(row({ state: state(removal), removed: { version: removal, to: null } }))).toEqual([{ tone: 'neutral', text: 'برداشته' }]);
    expect(rowBadges(row({ warnings: [warning('قیمت: A5', { reason: 'size', size: 'a5' })] }))).toEqual([{ tone: 'warning', text: '1 هشدار' }]);
  });

  it('زیر نام: نشانی، نسخهٔ روی سایت با روز و نام، پاورقی، پیش‌نویس با روزش، و اولین هشدار با دلیلش', () => {
    expect(
      rowMeta(
        row({ state: state(version({ version: 2 })), inFooter: true, draft, warnings: [warning('قیمت: 100 صفحه، A5', { reason: 'size', size: 'a5' })] }),
        NOW,
      ),
    ).toEqual([
      { ltr: '/print-pdf' },
      ' · نسخهٔ ',
      { num: '2' },
      '، دوشنبه 27 مهر، سارا',
      ' · در پاورقی',
      '؛ پیش‌نویس منتشرنشده از امروز 10:40، ویرایش امروز 11:05',
      ' · بلوک ',
      { ph: '[[قیمت: 100 صفحه، A5]]' },
      ': ',
      'اندازهٔ ',
      { ltr: 'A5' },
      ' امروز در تعرفه نیست یا موقتاً خاموش است',
      '، و روی سایت «فعلاً ارائه نمی‌شود» نشان می‌دهد',
    ]);
  });

  it('برداشته: به نشانی دیگر، به صفحهٔ اصلی، یا «پیدا نشد»؛ زمان‌دار و هرگز منتشرنشده؛ «تعرفه» با متن پیش‌فرض', () => {
    const moved = version({ version: 3, content: null, removal: 'moved', movedTo: 1, liveFrom: TODAY_1040 });
    const gone = version({ version: 3, content: null, removal: 'gone', liveFrom: TODAY_1040 });
    const removed = (removal: SitePageVersionRow, to: string | null) => rowMeta(row({ state: state(removal), removed: { version: removal, to } }), NOW).slice(1);
    expect(removed(moved, '/tarefe')).toEqual([' · برداشته شد، امروز: ', 'به ', { ltr: '/tarefe' }]);
    expect(removed(moved, '/')).toEqual([' · برداشته شد، امروز: ', 'به صفحهٔ اصلی']);
    expect(removed(gone, null)).toEqual([' · برداشته شد، امروز: ', '«پیدا نشد»']);
    // نشانی‌ای که مقصدش دیگر نیست (`to` خالی) همان «پیدا نشد» است.
    expect(removed(moved, null)).toEqual([' · برداشته شد، امروز: ', '«پیدا نشد»']);

    expect(rowMeta(row({ slug: 'print-rangi', state: state(null, version({ version: 1, slug: 'print-rangi', liveFrom: FRI })) }), NOW)).toEqual([
      { ltr: '/print-rangi' },
      ' · روی سایت جمعه 1 آبان، ساعت 09:00 · با کد تازه، سارا',
    ]);
    expect(rowMeta(row({ draft }), NOW)).toEqual([{ ltr: '/print-pdf' }, ' · هنوز منتشر نشده', '؛ پیش‌نویس منتشرنشده از امروز 10:40، ویرایش امروز 11:05']);
    expect(rowMeta(row({ kind: 'tariff', slug: 'tarefe', isDefault: true }), NOW)).toEqual([
      { ltr: '/tarefe' },
      ' · ماشین‌حساب و جدول‌ها از تعرفهٔ فعال؛ تیتر، متن، سؤال‌ها و گوگل از اینجا',
      ' · متن پیش‌فرض سایت',
    ]);
  });
});

describe('هشدار بلوک (سؤال ۴۶۴)', () => {
  it('خط و بلوک، دلیل همان که میز می‌گوید، و آنچه سایت به جایش نشان می‌دهد', () => {
    const tail = '. روی سایت به جای قیمت «فعلاً ارائه نمی‌شود» می‌آید، تا روزی که گزینه‌اش در تعرفه باشد.';
    expect(warningLine(warning('قیمت: 10 صفحه، منگنه', { reason: 'misfit', name: 'منگنه', misfit: { reason: 'min', minSheets: 2 } }, 7))).toEqual([
      'خط ',
      { num: '7' },
      '، بلوک ',
      { ph: '[[قیمت: 10 صفحه، منگنه]]' },
      ': ',
      'صحافی «منگنه» از ',
      { num: '2' },
      ' برگ است و این جزوه کمتر دارد',
      tail,
    ]);
    expect(warningLine(warning('قیمت: 900 صفحه، منگنه', { reason: 'misfit', name: 'منگنه', misfit: { reason: 'max', maxSheets: 50 } })).slice(5, -1)).toEqual([
      'صحافی «منگنه» تا ',
      { num: '50' },
      ' برگ است و چند جلد نمی‌شود',
    ]);
    expect(warningLine(warning('قیمت: A3، منگنه', { reason: 'misfit', name: 'منگنه', misfit: { reason: 'size' } })).slice(5, -1)).toEqual([
      'صحافی «منگنه» برای این اندازه نیست',
    ]);
    expect(warningLine(warning('قیمت: گلاسه', { reason: 'paper', name: 'گلاسه' })).slice(5, -1)).toEqual(['کاغذ «گلاسه» امروز در تعرفه نیست یا خاموش است']);
  });
});

describe('انتشار و نسخه‌ها (سؤال‌های ۴۶۵ و ۴۶۶)', () => {
  it('خلاصهٔ صفحهٔ تازه: بخش‌ها، بلوک‌های قیمت، جدول‌ها و سؤال‌ها؛ نقشهٔ سایت و پاورقی', () => {
    const body = '## یک\nبند.\n\n[[قیمت: 100 صفحه]]\n\n## دو\n[[تعرفه]]\n\n[[صحافی]]';
    const faq = [
      { q: 'یک', a: '۱' },
      { q: 'دو', a: '۲' },
      { q: 'سه', a: '۳' },
    ];
    expect(newPageSummary('landing', landing({ title: 'پرینت ارزان', body, faq }))).toEqual([
      'صفحهٔ «پرینت ارزان»',
      '، با ',
      { num: '2' },
      ' بخش متن',
      '، ',
      'یک بلوک قیمت',
      '، ',
      { num: '2' },
      ' جدول تعرفه',
      ' و ',
      { num: '3' },
      ' سؤال',
      '؛ در نقشهٔ سایت و پاورقی («چاپ جزوه»).',
    ]);
    expect(newPageSummary('landing', landing({ title: 'کنکور', inFooter: false }))).toEqual(['صفحهٔ «کنکور»', '؛ در نقشهٔ سایت، بی پیوند در پاورقی.']);
    expect(newPageSummary('tariff', { ...landing(), title: 'تعرفه' })).toEqual(['صفحهٔ «تعرفه»', '.']);
  });

  it('تیتر انتشار، نام نسخه و زمانش', () => {
    expect(pagePublishTitle('پرینت PDF', { type: 'draft' })).toEqual(['انتشار پرینت PDF']);
    expect(pagePublishTitle('تعرفه', { type: 'default' })).toEqual(['برگرداندن تعرفه به متن پیش‌فرض']);
    expect(pagePublishTitle('تعرفه', { type: 'version', version: 1 })).toEqual(['برگرداندن تعرفه به نسخهٔ ', { num: '1' }]);

    expect(pageVersionName(version({ version: 1 }))).toEqual(['نسخهٔ ', { num: '1' }]);
    expect(pageVersionName(version({ version: 4, restoredFrom: 1 }))).toEqual(['نسخهٔ ', { num: '4' }, ' · از نسخهٔ ', { num: '1' }]);
    expect(pageVersionName(version({ version: 3, content: null, restoredFrom: 0 }))).toEqual(['نسخهٔ ', { num: '3' }, ' · برگشت به متن پیش‌فرض']);
    expect(pageVersionName(version({ version: 5, content: null, removal: 'gone' }))).toEqual(['نسخهٔ ', { num: '5' }, ' · برداشتن، «پیدا نشد»']);
    expect(pageVersionName(version({ version: 5, content: null, removal: 'moved', movedTo: 1 }))).toEqual(['نسخهٔ ', { num: '5' }, ' · برداشتن، به صفحهٔ دیگر']);

    expect(pageVersionMeta(version({ version: 1, createdAt: TODAY_1040, liveFrom: TODAY_1040 }), NOW)).toBe('امروز 10:40، سارا');
    expect(pageVersionMeta(version({ version: 2, createdAt: TODAY_1040, liveFrom: FRI }), NOW)).toBe('امروز 10:40، سارا؛ روی سایت جمعه 1 آبان، ساعت 09:00');
    expect(pageVersionMeta(version({ version: 2, createdAt: MON, liveFrom: TODAY_1040 }), NOW)).toBe('دوشنبه 27 مهر 11:30، سارا؛ روی سایت از امروز 10:40');
    expect(pageVersionMeta(version({ version: 2, createdAt: TODAY_1040, liveFrom: FRI, withdrawnAt: TODAY_1105 }), NOW)).toBe(
      'امروز 10:40، سارا؛ زمان‌دار برای جمعه 1 آبان، ساعت 09:00، پس گرفته شد امروز 11:05',
    );
  });
});

describe('میز سفارش این صفحه (سؤال ۴۵۵)', () => {
  it('فقط ردیفی که امروز بیش از یک گزینهٔ روشن دارد؛ بقیه یک جمله', () => {
    const seed = deskChoices(SEED_PRICE_LIST);
    expect(seed.rows.map((one) => one.name)).toEqual(['color', 'sides']);
    expect(fixedText(seed.fixed)).toBe('اندازه، کاغذ و صحافی امروز یک گزینه دارند، پس انتخابی نیست.');

    const list = {
      ...SEED_PRICE_LIST,
      printRates: { ...SEED_PRICE_LIST.printRates, a5: SEED_PRICE_LIST.printRates.a4! },
      bindingTypes: {
        ...SEED_PRICE_LIST.bindingTypes,
        staple: { ...SEED_PRICE_LIST.bindingTypes.spiral_clear!, nameFa: 'منگنه' },
        glue: { ...SEED_PRICE_LIST.bindingTypes.spiral_clear!, nameFa: 'چسب گرم', enabled: false },
      },
    };
    const wide = deskChoices(list);
    expect(wide.rows.map((one) => [one.name, one.options.map((option) => option.label)])).toEqual([
      ['color', ['پیش‌فرض (سیاه‌سفید)', 'رنگی']],
      ['sides', ['پیش‌فرض (دورو)', 'یکرو']],
      ['size', ['پیش‌فرض (A4)', 'A5']],
      ['binding', ['پیش‌فرض (طلق و سیم)', 'منگنه']],
    ]);
    expect(fixedText(wide.fixed)).toBe('کاغذ امروز یک گزینه دارد، پس انتخابی نیست.');
    expect(fixedText([])).toBeNull();
  });
});

describe('زیرعنوان ویرایشگر', () => {
  it('صفحهٔ تازه، روی سایت با زمان‌دار و پیش‌نویس، برداشته، و متن پیش‌فرض «تعرفه»', () => {
    const base = { slug: 'print-pdf', state: state(null), draft: null, isDefault: false, isNew: false };
    expect(pageEditorSub({ ...base, slug: '', isNew: true }, NOW)).toEqual([{ ltr: 'jozveyar.com/…' }, ' · صفحهٔ تازه، هنوز ذخیره نشده']);
    expect(pageEditorSub({ ...base, state: state(version({ version: 2 }), version({ version: 3, liveFrom: FRI })), draft }, NOW)).toEqual([
      { ltr: 'jozveyar.com/print-pdf' },
      ' · روی سایت نسخهٔ ',
      { num: '2' },
      '، دوشنبه 27 مهر، سارا',
      ' · زمان‌دار: روی سایت جمعه 1 آبان، ساعت 09:00',
      '؛ پیش‌نویس منتشرنشده از امروز 10:40، ویرایش امروز 11:05',
    ]);
    expect(pageEditorSub({ ...base, state: state(version({ version: 3, content: null, removal: 'gone', liveFrom: TODAY_1040 })) }, NOW)).toEqual([
      { ltr: 'jozveyar.com/print-pdf' },
      ' · برداشته شد، امروز',
    ]);
    expect(pageEditorSub({ ...base, slug: 'tarefe', isDefault: true }, NOW)).toEqual([{ ltr: 'jozveyar.com/tarefe' }, ' · متن پیش‌فرض سایت']);
    expect(pageEditorSub(base, NOW)).toEqual([{ ltr: 'jozveyar.com/print-pdf' }, ' · هنوز منتشر نشده']);
  });
});
