/**
 * نوار اعلان در پنل (برش ۱۱٫۳): فرم به نوار (روزها مثل تعطیلی چاپخانه، متن و پیوند با `checkBar`)، شکل خراب به خاموش، مقدار اولیهٔ فرم، نشان
 * حال (طرح)، نام صفحهٔ پیوند، کار هر تغییر، و خط آخرین تغییر کارت.
 */

import { describe, expect, it } from 'vitest';

import { BAR_OFF, SEED_FACTS, placeholderValues } from '@jozveyar/content';
import type { AnnouncementBar } from '@jozveyar/contracts';

import { barBadge, barChange, barEventText, barFormOf, barFormValues, barOf, barWhenText, hrefText } from './bar';

const VALUES = placeholderValues(SEED_FACTS);
/** دوشنبه ۱۳ مهر ۱۴۰۵، ۱۱:۰۰ تهران (همان «امروز» طرح پنل)؛ نیمه‌شب امروز و روزهای بعد. */
const NOW = new Date('2026-10-05T07:30:00Z');
const MIDNIGHT = new Date('2026-10-04T20:30:00Z');
const day = (n: number) => new Date(MIDNIGHT.getTime() + n * 86_400_000);
const input = (patch: Record<string, unknown> = {}) => ({ mode: 'always', from: '', until: '', text: 'سلام', href: '', linkText: '', ...patch });

describe('فرم به نوار', () => {
  it('همیشه بی روز؛ خاموش متنش را نگه می‌دارد؛ متن و پیوند یکدست', () => {
    expect(barFormOf(input({ text: ' هر صفحه  **{نرخ_سیاه_سفید}** ', href: ' https://jozveyar.com/#tariff', linkText: 'ديدن' }), NOW, BAR_OFF, VALUES)).toEqual({
      ok: true,
      bar: { mode: 'always', from: null, until: null, text: 'هر صفحه **{نرخ_سیاه_سفید}**', href: '/#tariff', linkText: 'دیدن' },
    });
    expect(barFormOf(input({ mode: 'off', from: '1405/07/13', until: '1405/07/20' }), NOW, BAR_OFF, VALUES)).toEqual({
      ok: true,
      bar: { ...BAR_OFF, text: 'سلام' },
    });
    expect(barFormOf(input({ mode: 'off', text: '' }), NOW, BAR_OFF, VALUES)).toEqual({ ok: true, bar: BAR_OFF });
  });

  it('در بازه: آغاز روز اول و پایان انحصاری روز آخر، دوسرشامل، ارقام فارسی هم', () => {
    expect(barFormOf(input({ mode: 'range', from: '۱۴۰۵/۰۷/۱۳', until: '1405/07/30' }), NOW, BAR_OFF, VALUES)).toEqual({
      ok: true,
      bar: { mode: 'range', from: day(0).toISOString(), until: day(18).toISOString(), text: 'سلام', href: '', linkText: '' },
    });
    // یک روز: روز اول همان روز آخر.
    expect(barFormOf(input({ mode: 'range', from: '1405/07/14', until: '1405/07/14' }), NOW, BAR_OFF, VALUES)).toMatchObject({
      ok: true,
      bar: { from: day(1).toISOString(), until: day(2).toISOString() },
    });
  });

  it('خطای «کی» و روزها با فیلدش، با خطاهای متن و پیوند در همان پاسخ', () => {
    const range = (from: string, until: string, current: AnnouncementBar = BAR_OFF) =>
      barFormOf(input({ mode: 'range', from, until }), NOW, current, VALUES);
    expect(barFormOf(input({ mode: 'sometimes' }), NOW, BAR_OFF, VALUES)).toEqual({ ok: false, field: 'mode', error: 'invalid_bar_mode', issues: [] });
    expect(range('', '1405/07/20')).toMatchObject({ field: 'from', error: 'bar_invalid_day' });
    expect(range('1405/07/13', '1405/07/31')).toMatchObject({ field: 'until', error: 'bar_invalid_last_day' });
    expect(range('1405/07/12', '1405/07/20')).toMatchObject({ field: 'from', error: 'bar_day_past' });
    expect(range('1405/07/20', '1405/07/19')).toMatchObject({ field: 'until', error: 'bar_day_order' });
    // ۹۰ روز پس از امروز (۱۳ مهر): ۱۳ دی؛ ۱۴ دی نه.
    expect(range('1405/07/13', '1405/10/13')).toMatchObject({ ok: true });
    expect(range('1405/07/13', '1405/10/14')).toMatchObject({ field: 'until', error: 'bar_day_too_far' });
    const both = barFormOf(input({ mode: 'range', from: 'x', until: '1405/07/20', text: '**یک** و **دو**' }), NOW, BAR_OFF, VALUES);
    expect(both).toMatchObject({ ok: false, field: 'from', error: 'bar_invalid_day' });
    expect(!both.ok && both.issues.map((issue) => issue.code)).toEqual(['bar_bold_twice']);
    expect(barFormOf(input({ href: '/contact' }), NOW, BAR_OFF, VALUES)).toEqual({
      ok: false,
      issues: [{ field: 'linkText', label: 'متن پیوند', code: 'bar_link_text' }],
    });
  });

  it('روز اول گذشته فقط برای بازه‌ای که همین حالا روی سایت است؛ روز آخر گذشته هرگز', () => {
    const current: AnnouncementBar = { mode: 'range', from: day(-2).toISOString(), until: day(3).toISOString(), text: 'سلام', href: '', linkText: '' };
    expect(barFormOf(input({ mode: 'range', from: '1405/07/11', until: '1405/07/20', text: 'متن تازه' }), NOW, current, VALUES)).toMatchObject({
      ok: true,
      bar: { from: day(-2).toISOString(), until: day(8).toISOString(), text: 'متن تازه' },
    });
    expect(barFormOf(input({ mode: 'range', from: '1405/07/10', until: '1405/07/20' }), NOW, current, VALUES)).toMatchObject({ error: 'bar_day_past' });
    // بازهٔ تمام‌شده دیگر «جاری» نیست.
    const ended = { ...current, until: day(0).toISOString() };
    expect(barFormOf(input({ mode: 'range', from: '1405/07/11', until: '1405/07/20' }), NOW, ended, VALUES)).toMatchObject({ error: 'bar_day_past' });
    expect(barFormOf(input({ mode: 'range', from: '1405/07/11', until: '1405/07/12' }), NOW, current, VALUES)).toMatchObject({
      field: 'until',
      error: 'bar_last_day_past',
    });
  });
});

describe('مقدار ذخیره‌شده و فرم', () => {
  it('نبودن یا شکل خراب، خاموش؛ نوار درست همان', () => {
    const on: AnnouncementBar = { mode: 'always', from: null, until: null, text: 'سلام', href: '/contact', linkText: 'تماس' };
    expect(barOf(undefined)).toEqual(BAR_OFF);
    expect(barOf(null)).toEqual(BAR_OFF);
    expect(barOf({ mode: 'always', text: 7 })).toEqual(BAR_OFF);
    expect(barOf({ ...on, mode: 'range' })).toEqual(BAR_OFF);
    expect(barOf(on)).toEqual(on);
  });

  it('فرم از نوار: روز اول و روز آخر شمسی (روز پیش از پایان انحصاری)', () => {
    expect(barFormValues({ mode: 'range', from: day(0).toISOString(), until: day(18).toISOString(), text: 'سلام', href: '', linkText: '' })).toEqual({
      mode: 'range',
      from: '1405/07/13',
      until: '1405/07/30',
      text: 'سلام',
      href: '',
      linkText: '',
    });
    expect(barFormValues(BAR_OFF)).toEqual({ mode: 'off', from: '', until: '', text: '', href: '', linkText: '' });
  });
});

describe('حال، پیوند و رویداد', () => {
  const range = (from: number, until: number): AnnouncementBar => ({
    mode: 'range',
    from: day(from).toISOString(),
    until: day(until).toISOString(),
    text: 'سلام',
    href: '',
    linkText: '',
  });

  it('نشان طرح: خاموش، همیشه، روشن تا…، آینده، و «تمام شد، 30 مهر»', () => {
    expect(barBadge(BAR_OFF, NOW)).toEqual({ tone: 'neutral', text: 'خاموش' });
    expect(barBadge({ ...BAR_OFF, mode: 'always' }, NOW)).toEqual({ tone: 'neutral', text: 'خاموش' });
    expect(barBadge({ ...BAR_OFF, mode: 'always', text: 'سلام' }, NOW)).toEqual({ tone: 'success', text: 'روشن، همیشه' });
    expect(barBadge(range(0, 18), NOW)).toEqual({ tone: 'success', text: 'روشن تا پنجشنبه 30 مهر' });
    expect(barBadge(range(19, 25), NOW)).toEqual({ tone: 'info', text: 'از شنبه 2 آبان تا پنجشنبه 7 آبان' });
    expect(barBadge(range(-10, -2), NOW)).toEqual({ tone: 'neutral', text: 'تمام شد، 10 مهر' });
    expect(barBadge(range(0, 18), day(18))).toEqual({ tone: 'neutral', text: 'تمام شد، 30 مهر' });
  });

  it('نام صفحهٔ پیوند', () => {
    expect(hrefText('/#tariff')).toEqual(['پیوند به تعرفهٔ صفحهٔ اصلی']);
    expect(hrefText('/contact')).toEqual(['پیوند به «تماس»']);
    expect(hrefText('/orders')).toEqual(['پیوند به ', { ltr: '/orders' }]);
    expect(hrefText('')).toEqual(['بی پیوند']);
  });

  it('کار هر تغییر: روشن، عوض، خاموش، یا ذخیرهٔ متن نوار خاموش', () => {
    expect(barChange({ shown: false }, { shown: true })).toBe('on');
    expect(barChange({ shown: true }, { shown: true })).toBe('change');
    expect(barChange({ shown: true }, { shown: false })).toBe('off');
    expect(barChange({ shown: false }, { shown: false })).toBe('save');
  });

  it('بازهٔ نوار در جمله، نسبت به لحظهٔ رویداد', () => {
    expect(barWhenText({ mode: 'always', from: null, until: null }, NOW)).toBe('، همیشه');
    expect(barWhenText(range(0, 18), NOW)).toBe('، تا پنجشنبه 30 مهر');
    expect(barWhenText(range(19, 25), NOW)).toBe('، از شنبه 2 آبان تا پنجشنبه 7 آبان');
    expect(barWhenText(BAR_OFF, NOW)).toBe('');
  });

  it('خط آخرین تغییر کارت (طرح): «روشن از امروز 10:05، علی، با کد تازه.»', () => {
    const at = new Date('2026-10-05T06:35:00Z');
    const event = (change: string, fresh: boolean, by: string | null = 'علی') => ({ at, by, action: 'content.bar', detail: { change, fresh } });
    expect(barEventText(null, NOW)).toBeNull();
    expect(barEventText(event('on', true), NOW)).toBe('روشن از امروز 10:05، علی، با کد تازه.');
    expect(barEventText(event('change', true), NOW)).toBe('آخرین تغییر امروز 10:05، علی، با کد تازه.');
    expect(barEventText(event('off', false, 'رضا'), NOW)).toBe('خاموش از امروز 10:05، رضا.');
    expect(barEventText(event('save', false, null), NOW)).toBe('متن ذخیره شد امروز 10:05.');
  });
});
