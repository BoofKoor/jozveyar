/**
 * صفحه‌های فرود و «تعرفه» روی سایت (برش ۱۵٫۲، `pages.ts`): build و بی پایگاه داده هیچ صفحه و هیچ پرسشی، خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ
 * قبلی را نگه دارد؛ «تعرفه» متن مالک یا متن پیش‌فرض؛ پاورقی فقط صفحه‌های «در پاورقی» با سقف گروه؛ پیش‌فرض میز فقط گزینه‌ای که امروز روشن است؛
 * عنوان گوگل با عدد امروز؛ و آنچه «آخرین تغییر» نقشهٔ سایت هر صفحه از آن است. خود صفحه‌ها در سرتاسری.
 */

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FILE_RULES, type PriceList } from '@jozveyar/contracts';
import { defaultTariffPage, emptyLanding, placeholderValues, factsOf, pageValues, type LandingContent } from '@jozveyar/content';
import type { LivePage } from '@jozveyar/db';
import { NONE_PAUSED, pausedOf } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { INITIAL_CONFIG } from '../orderConfig';
import {
  FOOTER_LINKS_MAX,
  footerLandings,
  landingOfResolution,
  liveTariffPage,
  loadLivePages,
  loadResolution,
  pageDeps,
  presetConfig,
  seoText,
} from './pages';
import { BUILD_PHASE } from './tariff';

const ENV = { DATABASE_URL: 'postgresql://x' };
const AT = new Date('2026-10-21T08:00:00Z');

const landing = (over: Partial<LandingContent> = {}): LandingContent => ({
  ...emptyLanding(),
  slug: 'print-pdf',
  name: 'پرینت PDF',
  title: 'پرینت PDF آنلاین',
  lead: 'فایل را بینداز.',
  body: '## چرا\nمتن.',
  ...over,
});

const live = (over: Partial<LivePage>): LivePage => ({ pageId: 1, kind: 'landing', slug: 'print-pdf', content: landing(), version: 1, since: AT, ...over });

/** تعرفه‌ای با A5، گلاسه و منگنه، کنار تعرفهٔ پایه. */
const WIDE: PriceList = {
  ...SEED_PRICE_LIST,
  printRates: { ...SEED_PRICE_LIST.printRates, a5: { single: { color: 12_000, bw: 9_000 }, double: { color: 12_000, bw: 9_000 } } },
  paperTypes: {
    ...SEED_PRICE_LIST.paperTypes,
    tahrir80: { ...SEED_PRICE_LIST.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0 } },
    glossy: { nameFa: 'گلاسه', gsm: 135, enabled: true, sheetRates: { a4: 15_000 } },
  },
  bindingTypes: {
    ...SEED_PRICE_LIST.bindingTypes,
    [DEFAULT_BINDING_TYPE_ID]: {
      ...SEED_PRICE_LIST.bindingTypes[DEFAULT_BINDING_TYPE_ID]!,
      bands: { ...SEED_PRICE_LIST.bindingTypes[DEFAULT_BINDING_TYPE_ID]!.bands, a5: [{ minSheets: 1, maxSheets: 800, priceRials: 300_000 }] },
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
  },
};

describe('خواندن صفحه‌ها (۱۵٫۲)', () => {
  it('build و بی پایگاه داده: هیچ صفحه و هیچ پرسشی', async () => {
    const source = { live: vi.fn(async () => [live({})]), resolve: vi.fn(async () => ({ kind: 'page' as const, page: live({}) })) };
    expect(await loadLivePages(AT, { ...ENV, NEXT_PHASE: BUILD_PHASE }, () => source)).toEqual([]);
    expect(await loadLivePages(AT, {}, () => source)).toEqual([]);
    expect(await loadResolution('print-pdf', AT, {}, () => source)).toEqual({ kind: 'none' });
    expect(source.live).not.toHaveBeenCalled();
    expect(source.resolve).not.toHaveBeenCalled();
  });

  it('با پایگاه داده همان جواب، با همان لحظه؛ خطا بالا می‌رود، با لاگ', async () => {
    const source = { live: vi.fn(async () => [live({})]), resolve: vi.fn(async () => ({ kind: 'gone' as const })) };
    expect(await loadLivePages(AT, ENV, () => source)).toEqual([live({})]);
    expect(source.live).toHaveBeenCalledWith(AT);
    expect(await loadResolution('old', AT, ENV, () => source)).toEqual({ kind: 'gone' });
    expect(source.resolve).toHaveBeenCalledWith('old', AT);

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const down = { live: async () => Promise.reject(new Error('down')), resolve: async () => Promise.reject(new Error('down')) };
    await expect(loadLivePages(AT, ENV, () => down)).rejects.toThrow('down');
    await expect(loadResolution('x', AT, ENV, () => down)).rejects.toThrow('down');
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('«تعرفه»: آخرین نسخهٔ مالک با روزش، وگرنه متن پیش‌فرض بی روز', () => {
    expect(liveTariffPage([live({})])).toEqual({ content: defaultTariffPage(), since: null });
    const mine = { ...defaultTariffPage(), title: 'قیمت چاپ، امروز' };
    expect(liveTariffPage([live({}), live({ pageId: 2, kind: 'tariff', slug: 'tarefe', content: mine })])).toEqual({ content: mine, since: AT });
  });

  it('جواب نشانی: فقط صفحهٔ فرود روی سایت', () => {
    expect(landingOfResolution({ kind: 'page', page: live({}) })).toEqual({ page: live({}), content: landing() });
    expect(landingOfResolution({ kind: 'page', page: live({ kind: 'tariff', slug: 'tarefe', content: defaultTariffPage() }) })).toBeNull();
    for (const kind of ['gone', 'none'] as const) expect(landingOfResolution({ kind })).toBeNull();
    expect(landingOfResolution({ kind: 'redirect', to: '/' })).toBeNull();
  });
});

describe('پاورقی «چاپ جزوه» (سؤال ۴۵۲)', () => {
  it('فقط صفحه‌های فرود «در پاورقی» با نام، به ترتیب پنل؛ «تعرفه» پیوند خودش را دارد', () => {
    const pages = [
      live({ pageId: 1, slug: 'print-pdf', content: landing({ inFooter: true }) }),
      live({ pageId: 2, slug: 'chap-rangi', content: landing({ name: 'چاپ رنگی', inFooter: false }) }),
      live({ pageId: 3, kind: 'tariff', slug: 'tarefe', content: defaultTariffPage() }),
      live({ pageId: 4, slug: 'sahafi', content: landing({ name: 'صحافی جزوه', inFooter: true }) }),
      live({ pageId: 5, slug: 'bi-nam', content: landing({ name: '', inFooter: true }) }),
    ];
    expect(footerLandings(pages)).toEqual([
      { path: '/print-pdf', label: 'پرینت PDF' },
      { path: '/sahafi', label: 'صحافی جزوه' },
    ]);
  });

  it('تا سقف گروه با «تعرفه»: ۱۱ صفحهٔ فرود', () => {
    const many = Array.from({ length: 15 }, (_, i) => live({ pageId: i + 1, slug: `p${i + 1}`, content: landing({ name: `صفحهٔ ${i + 1}`, inFooter: true }) }));
    expect(FOOTER_LINKS_MAX).toBe(12);
    expect(footerLandings(many).map(({ path }) => path)).toEqual(Array.from({ length: 11 }, (_, i) => `/p${i + 1}`));
  });
});

describe('پیش‌فرض میز صفحهٔ فرود (سؤال ۴۵۵)', () => {
  const none = { color: '', sides: '', size: '', paper: '', binding: '' } as const;

  it('بی پیش‌فرض، یا پیش‌فرضی برابر پیش‌فرض سایت: null، یعنی همان میز صفحهٔ اصلی', () => {
    expect(presetConfig(none, SEED_PRICE_LIST, NONE_PAUSED)).toBeNull();
    const same = { color: 'bw', sides: 'double', size: 'a4', paper: DEFAULT_PAPER_TYPE_ID, binding: DEFAULT_BINDING_TYPE_ID } as const;
    expect(presetConfig(same, SEED_PRICE_LIST, NONE_PAUSED)).toBeNull();
  });

  it('رنگ و یکرو یا دورو همیشه؛ بقیه پیش‌فرض سایت', () => {
    expect(presetConfig({ ...none, color: 'color' }, SEED_PRICE_LIST, NONE_PAUSED)).toEqual({ ...INITIAL_CONFIG, colorMode: 'color' });
    expect(presetConfig({ ...none, sides: 'single' }, SEED_PRICE_LIST, NONE_PAUSED)).toEqual({ ...INITIAL_CONFIG, sidesMode: 'single' });
  });

  it('اندازه، کاغذ و صحافی فقط وقتی امروز روشن و در دسترس‌اند و با هم می‌خورند؛ وگرنه پیش‌فرض سایت', () => {
    const wide = { ...none, size: 'a5', paper: 'tahrir80', binding: DEFAULT_BINDING_TYPE_ID } as const;
    expect(presetConfig(wide, WIDE, NONE_PAUSED)).toEqual({ ...INITIAL_CONFIG, paperSize: 'a5' });
    expect(presetConfig({ ...none, paper: 'glossy', binding: 'staple' }, WIDE, NONE_PAUSED)).toEqual({
      ...INITIAL_CONFIG,
      paperTypeId: 'glossy',
      bindingTypeId: 'staple',
    });
    // گلاسه و منگنه A5 ندارند.
    expect(presetConfig({ ...none, size: 'a5', paper: 'glossy', binding: 'staple' }, WIDE, NONE_PAUSED)).toEqual({ ...INITIAL_CONFIG, paperSize: 'a5' });
    // تعرفهٔ پایه هیچ‌کدام را ندارد.
    expect(presetConfig({ ...none, size: 'a5', paper: 'glossy', binding: 'staple' }, SEED_PRICE_LIST, NONE_PAUSED)).toBeNull();
    // موقتاً در دسترس نیست (۸٫۴).
    const paused = pausedOf(WIDE, { sizes: ['a5'], papers: ['glossy'], bindings: ['staple'] });
    expect(presetConfig({ ...none, size: 'a5', paper: 'glossy', binding: 'staple' }, WIDE, paused)).toBeNull();
    // خاموش.
    const off: PriceList = { ...WIDE, paperTypes: { ...WIDE.paperTypes, glossy: { ...WIDE.paperTypes.glossy!, enabled: false } } };
    expect(presetConfig({ ...none, paper: 'glossy' }, off, NONE_PAUSED)).toBeNull();
    // نام‌های ارث‌رسیده جدول نه.
    expect(presetConfig({ ...none, paper: 'constructor', binding: 'toString' }, WIDE, NONE_PAUSED)).toBeNull();
  });
});

describe('عنوان گوگل و «آخرین تغییر» (۱۵٫۱، سؤال‌های ۴۲۸ و ۴۶۴)', () => {
  const values = pageValues(
    placeholderValues(factsOf({ priceList: SEED_PRICE_LIST, slaDays: 2, uploadDays: 2, orderFilesDays: 30, formats: DEFAULT_FILE_RULES.formats })),
    { at: AT, priceChangedAt: new Date('2026-10-07T08:00:00Z') },
  );

  it('عنوان و توضیح بی قالب، با عدد امروز و دو جای‌نگهدار صفحه‌ها', () => {
    expect(seoText('قیمت چاپ جزوه {سال}، سیاه‌سفید {نرخ_سیاه_سفید}', values)).toBe('قیمت چاپ جزوه 1405، سیاه‌سفید 1,600');
    expect(seoText('تعرفهٔ {تغییر_قیمت}', values)).toBe('تعرفهٔ 15 مهر 1405');
  });

  it('صفحهٔ فرود: تنظیم‌های جای‌نگهدارها، عدد تعرفه فقط با بلوک یا نرخ یا روز تغییر قیمت، و `{سال}`؛ عنوان گوگل نه', () => {
    expect(pageDeps(landing())).toEqual({ settings: [], tariff: false, year: false });
    expect(pageDeps(landing({ seo: { title: '{سال} {نرخ_رنگی}', description: '' } }))).toEqual({ settings: [], tariff: false, year: false });
    expect(pageDeps(landing({ lead: 'تا {روز_کاری} روز کاری، در {سال}' }))).toEqual({ settings: ['order.sla_days'], tariff: false, year: true });
    expect(pageDeps(landing({ body: '## قیمت\n[[قیمت: 200 صفحه]]' }))).toMatchObject({ tariff: true });
    expect(pageDeps(landing({ body: 'هر رو {نرخ_رنگی} تومان.' }))).toMatchObject({ tariff: true });
    expect(pageDeps(landing({ faq: [{ q: 'کی؟', a: 'از {تغییر_قیمت}؛ فایل {روزهای_فایل} روز می‌ماند.' }] }))).toEqual({
      settings: ['file.retention_days'],
      tariff: true,
      year: false,
    });
  });

  it('«تعرفه» همیشه از تعرفه است، چون جدول‌ها و ماشین‌حسابش از آن‌اند', () => {
    expect(pageDeps(defaultTariffPage())).toEqual({ settings: [], tariff: true, year: false });
  });
});
