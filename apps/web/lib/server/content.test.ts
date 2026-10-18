/**
 * متن‌های سایت روی سایت (برش ۱۱٫۱، `content.ts`): build و بی پایگاه داده هیچ نسخه (متن پیش‌فرض)، خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ
 * قبلی را نگه دارد، متن مالک یا متن پیش‌فرض با «روز تغییر» درست، واقعیت‌های جای‌نگهدار از همان بارگذارهای صفحه، و تنظیم‌هایی که متن صفحه به
 * کار برده. روزهای دو کوکی متن پیش‌فرض حریم خصوصی همان ثابت‌های خود کوکی‌هاست.
 */

import { describe, expect, it, vi } from 'vitest';

import { COOKIE_DAYS, DEFAULT_REVISED, defaultContent, placeholderValues, type ContentFacts } from '@jozveyar/content';
import type { ContentVersionRow } from '@jozveyar/db';
import { DEFAULT_FILE_RULES } from '@jozveyar/contracts';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { parseJalaliNumeric } from '@jozveyar/text';

import { SEED_TARIFF } from '../tariff';
import { AUTH_TTL_MS } from './auth';
import { contentFacts, liveText, loadPublished, pageSettings } from './content';
import { SESSION_MAX_AGE } from './context';
import { BUILD_PHASE } from './tariff';

const ENV = { DATABASE_URL: 'postgresql://x' };
const AT = new Date('2026-10-16T08:00:00Z');

const row = (over: Partial<ContentVersionRow>): ContentVersionRow => ({
  id: 1,
  kind: 'terms',
  version: 1,
  content: null,
  restoredFrom: null,
  createdBy: 'a',
  createdByName: 'سارا',
  createdAt: AT,
  ...over,
});

describe('متن‌های منتشرشده (۱۱٫۱)', () => {
  it('build و بی پایگاه داده هیچ، بی خواندن', async () => {
    const live = vi.fn(async () => ({}));
    expect(await loadPublished({ ...ENV, NEXT_PHASE: BUILD_PHASE }, () => ({ live }))).toEqual({});
    expect(await loadPublished({}, () => ({ live }))).toEqual({});
    expect(live).not.toHaveBeenCalled();
  });

  it('آخرین نسخهٔ هر نوع با متن، شماره و زمانش', async () => {
    const terms = { ...defaultContent('terms'), lead: 'تازه' };
    const live = vi.fn(async () => ({ terms: row({ content: terms, version: 3 }), faq: row({ kind: 'faq', version: 2, restoredFrom: 0 }) }));
    expect(await loadPublished(ENV, () => ({ live }))).toEqual({
      terms: { content: terms, version: 3, at: AT },
      faq: { content: null, version: 2, at: AT },
    });
  });

  it('خطای پایگاه داده بالا می‌رود: ISR صفحهٔ قبلی را نگه می‌دارد', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(loadPublished(ENV, () => ({ live: async () => Promise.reject(new Error('down')) }))).rejects.toThrow('down');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('متن روی سایت (سؤال ۲۸۸)', () => {
  const revised = parseJalaliNumeric(DEFAULT_REVISED.terms)!;

  it('بی نسخه متن پیش‌فرض، با تاریخ متن پیش‌فرض؛ دربارهٔ ما تاریخی ندارد', () => {
    expect(liveText('terms', {})).toEqual({ content: defaultContent('terms'), version: null, changedAt: revised });
    expect(liveText('about', {}).changedAt).toBeNull();
  });

  it('متن مالک با روز انتشارش؛ برگشت به پیش‌فرض با دیرترینِ برگشت و تاریخ متن پیش‌فرض', () => {
    const terms = { ...defaultContent('terms'), lead: 'تازه' };
    expect(liveText('terms', { terms: { content: terms, version: 2, at: AT } })).toEqual({ content: terms, version: 2, changedAt: AT });
    expect(liveText('terms', { terms: { content: null, version: 3, at: AT } })).toEqual({ content: defaultContent('terms'), version: null, changedAt: AT });
    const early = new Date('2026-01-01T00:00:00Z');
    expect(liveText('terms', { terms: { content: null, version: 3, at: early } }).changedAt).toEqual(revised);
    // JSON خراب یا ناقص هم متن است، با فیلد خالی؛ هرگز HTML.
    expect(liveText('about', { about: { content: { title: 'تیتر' }, version: 1, at: AT } }).content).toEqual({
      title: 'تیتر',
      lead: '',
      body: '',
      seo: { title: '', description: '' },
    });
  });

  it('سؤال‌های پیش‌فرض با واقعیت‌های امروز', () => {
    const facts: ContentFacts = { ...contentFacts(SEED_TARIFF, { rules: DEFAULT_FILE_RULES, uploadDays: 2 }, { orderFilesDays: 30 }) };
    const single = { ...facts, rates: { ...facts.rates, bwSingle: facts.rates.bw + 2_000 } };
    expect(liveText('faq', {}, single).content.items[0]!.a).toContain('{نرخ_سیاه_سفید_یکرو}');
    expect(liveText('faq', {}, facts).content.items[0]!.a).not.toContain('یکرو');
  });

  it('واقعیت‌ها از تعرفه، قاعده‌های فایل و تنظیم‌های صفحه‌ها', () => {
    const facts = contentFacts(
      { priceList: SEED_PRICE_LIST, slaDays: 3, paused: SEED_TARIFF.paused },
      { rules: { ...DEFAULT_FILE_RULES, formats: { word: true, slides: false, image: false } }, uploadDays: 4 },
      { orderFilesDays: 60 },
    );
    expect(placeholderValues(facts)).toMatchObject({ روز_کاری: '3', روزهای_فایل: '4', روزهای_فایل_سفارش: '60', 'فرمت‌ها': 'PDF یا Word', نرخ_رنگی: '2,000' });
  });

  it('تنظیم‌های متن صفحه: فقط جای‌نگهدارهای جملهٔ آغاز و متن، و نرخ‌ها هیچ', () => {
    expect(pageSettings(defaultContent('terms')).sort()).toEqual(['file.retention_days', 'order.files_retention_days', 'order.sla_days']);
    expect(pageSettings(defaultContent('privacy')).sort()).toEqual(['file.retention_days', 'order.files_retention_days']);
    expect(pageSettings({ ...defaultContent('about'), lead: 'از {نرخ_رنگی} و {فرمت‌ها}', body: 'متن' })).toEqual(['file.formats']);
  });

  it('روزهای دو کوکی متن پیش‌فرض حریم خصوصی همان ثابت‌های کوکی‌ها', () => {
    expect(COOKIE_DAYS).toEqual({ browser: SESSION_MAX_AGE / 86_400, signIn: AUTH_TTL_MS / 86_400_000 });
    expect(defaultContent('privacy').body).toContain(`(${COOKIE_DAYS.browser} روز)`);
  });
});
