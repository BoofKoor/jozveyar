/**
 * نوار بالای سربرگ (برش ۱۱٫۳، سؤال‌های ۲۹۱ تا ۲۹۴): پیام تعطیلی همهٔ چاپخانه‌ها بر نوار مالک مقدم است؛ نوار مالک فقط وقتی همین حالا روشن
 * است، با مرز روز دقیق؛ عدد جای‌نگهدار فقط وقتی متن جای‌نگهدار دارد؛ پیوندی که به سایت دیگر می‌رود بی پیوند رسم می‌شود. build و بی پایگاه داده
 * هیچ، و خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد.
 */

import { describe, expect, it, vi } from 'vitest';

import { factsOf, placeholderValues } from '@jozveyar/content';
import { DEFAULT_FILE_RULES, type AnnouncementBar } from '@jozveyar/contracts';
import type { PartnerHours } from '@jozveyar/db';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { loadSiteBar, readSiteBar } from './bar';

/** آغاز شنبه ۴ مهر ۱۴۰۵ تهران. */
const DAY4 = new Date('2026-09-25T20:30:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(DAY4.getTime() + days * DAY);

const FACTS = factsOf({ priceList: SEED_PRICE_LIST, slaDays: 2, uploadDays: 2, orderFilesDays: 30, formats: DEFAULT_FILE_RULES.formats });
const bar = (patch: Partial<AnnouncementBar>): AnnouncementBar => ({
  mode: 'always',
  from: null,
  until: null,
  text: 'سفارش‌های پنجشنبه از شنبه چاپ می‌شوند.',
  href: '',
  linkText: '',
  ...patch,
});

function load(value: AnnouncementBar, now: Date, closure: { lastDay: string; resumes: string } | null = null) {
  const facts = vi.fn(async () => FACTS);
  const read = vi.fn(async () => value);
  return { facts, read, view: loadSiteBar({ closure: async () => closure, bar: read, facts, now }) };
}

describe('نوار بالای سربرگ', () => {
  it('تعطیلی همهٔ چاپخانه‌ها جای نوار مالک: نوار خوانده هم نمی‌شود', async () => {
    const closure = { lastDay: 'یکشنبه 5 مهر', resumes: 'دوشنبه 6 مهر' };
    const { view, read } = load(bar({}), at(0), closure);
    expect(await view).toEqual({ kind: 'closure', closure });
    expect(read).not.toHaveBeenCalled();
  });

  it('همیشه روشن، بی جای‌نگهدار: بی خواندن تعرفه؛ با جای‌نگهدار عدد امروز', async () => {
    const plain = load(bar({}), at(0));
    expect(await plain.view).toMatchObject({ kind: 'owner', bar: { text: 'سفارش‌های پنجشنبه از شنبه چاپ می‌شوند.', href: '', linkText: '' } });
    expect(plain.facts).not.toHaveBeenCalled();

    const priced = load(bar({ text: 'هر صفحه فقط **{نرخ_سیاه_سفید} تومان**', href: '/#tariff', linkText: 'دیدن تعرفه' }), at(0));
    const view = await priced.view;
    expect(view).toMatchObject({ kind: 'owner', bar: { href: '/#tariff', linkText: 'دیدن تعرفه' } });
    expect(view?.kind === 'owner' && view.values).toEqual(placeholderValues(FACTS));
    expect(priced.facts).toHaveBeenCalledTimes(1);
  });

  it('در بازه: از آغاز روز اول تا پیش از پایان روز آخر، به لحظه', async () => {
    const range = bar({ mode: 'range', from: at(1).toISOString(), until: at(3).toISOString() });
    expect(await load(range, new Date(at(1).getTime() - 1)).view).toBeNull();
    expect(await load(range, at(1)).view).toMatchObject({ kind: 'owner' });
    expect(await load(range, new Date(at(3).getTime() - 1)).view).toMatchObject({ kind: 'owner' });
    expect(await load(range, at(3)).view).toBeNull();
  });

  it('خاموش، یا روشن بی متن: هیچ؛ خاموش متنش را نگه می‌دارد ولی روی سایت نیست', async () => {
    expect(await load(bar({ mode: 'off' }), at(0)).view).toBeNull();
    expect(await load(bar({ text: '' }), at(0)).view).toBeNull();
  });

  it('پیوندی که به سایت دیگر می‌رود (از راهی جز پنل) بی پیوند و بی متن پیوند رسم می‌شود؛ نشانی کامل همین سایت مسیرش', async () => {
    for (const href of ['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'tel:09121234567']) {
      expect(await load(bar({ href, linkText: 'برو' }), at(0)).view).toMatchObject({ bar: { href: '', linkText: '' } });
    }
    expect(await load(bar({ href: 'https://jozveyar.com/contact', linkText: 'تماس' }), at(0)).view).toMatchObject({
      bar: { href: '/contact', linkText: 'تماس' },
    });
  });

  it('build و بی پایگاه داده هیچ؛ خطای پایگاه داده بالا می‌رود؛ وگرنه تنظیم `content.bar` و تعطیلی از همان پایگاه داده', async () => {
    const broken = () => ({ partnerHours: async () => Promise.reject(new Error('db down')), setting: async () => undefined });
    expect(await readSiteBar({ NEXT_PHASE: 'phase-production-build', DATABASE_URL: 'x' }, broken)).toBeNull();
    expect(await readSiteBar({}, broken)).toBeNull();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(readSiteBar({ DATABASE_URL: 'x' }, broken)).rejects.toThrow('db down');
    expect(error).toHaveBeenCalled();
    error.mockRestore();

    const open: PartnerHours = { availability: 'open', closedFrom: null, closedUntil: null };
    const closed: PartnerHours = { availability: 'closed', closedFrom: at(0), closedUntil: at(2) };
    const source = (hours: PartnerHours[]) => () => ({
      partnerHours: async () => hours,
      setting: async (key: string) => (key === 'content.bar' ? bar({}) : undefined),
    });
    expect(await readSiteBar({ DATABASE_URL: 'x' }, source([open]), () => at(0.5))).toMatchObject({ kind: 'owner' });
    expect(await readSiteBar({ DATABASE_URL: 'x' }, source([closed]), () => at(0.5))).toMatchObject({
      kind: 'closure',
      closure: { resumes: 'دوشنبه 6 مهر' },
    });
    // مقدار خراب پایگاه داده: پیش‌فرض، یعنی خاموش.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken2 = () => ({ partnerHours: async () => [open], setting: async () => ({ mode: 'always', text: 7 }) });
    expect(await readSiteBar({ DATABASE_URL: 'x' }, broken2, () => at(0.5))).toBeNull();
    warn.mockRestore();
  });
});
