/**
 * نوار اعلان (برش ۱۱٫۳، سؤال‌های ۲۹۱ تا ۲۹۴): کی روی سایت است و کی کد تازه می‌خواهد، نشانی پیوند فقط همین سایت، یکدست کردن فرم، سنجش متن
 * (۹۰ نویسه با عددهای امروز، یک پررنگ، بی پیوند درون متن) و پیوند، و رسم همان HTML طرح `content.html`.
 */

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AnnouncementBar } from '@jozveyar/contracts';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import {
  BAR_LINK_TEXT_MAX,
  BAR_OFF,
  BAR_TEXT_MAX,
  barHref,
  barPlainText,
  barShown,
  barVisibleAt,
  canonicalBar,
  checkBar,
  sameBar,
  tidyBar,
} from './bar.js';
import { factsOf, placeholderValues } from './facts.js';
import { AnnouncementBar as Bar } from './render.js';

const VALUES = placeholderValues(
  factsOf({ priceList: SEED_PRICE_LIST, slaDays: 2, uploadDays: 2, orderFilesDays: 30, formats: { word: true, slides: true, image: true } }),
);
const html = (node: ReactNode) => renderToStaticMarkup(createElement('div', null, node)).replace(/^<div>|<\/div>$/g, '');

/** آغاز شنبه ۴ مهر ۱۴۰۵ تهران. */
const DAY4 = new Date('2026-09-25T20:30:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(DAY4.getTime() + days * DAY);
const bar = (patch: Partial<AnnouncementBar>): AnnouncementBar => ({ ...BAR_OFF, mode: 'always', text: 'سلام', ...patch });

describe('کی روی سایت است (سؤال ۲۹۴)', () => {
  it('همیشه؛ در بازه از آغاز روز اول تا پیش از پایان روز آخر؛ خاموش و بی متن هرگز', () => {
    const range = bar({ mode: 'range', from: at(1).toISOString(), until: at(3).toISOString() });
    expect(barVisibleAt(bar({}), at(0))).toBe(true);
    expect(barVisibleAt(range, new Date(at(1).getTime() - 1))).toBe(false);
    expect(barVisibleAt(range, at(1))).toBe(true);
    expect(barVisibleAt(range, new Date(at(3).getTime() - 1))).toBe(true);
    expect(barVisibleAt(range, at(3))).toBe(false);
    expect(barVisibleAt(bar({ mode: 'off' }), at(0))).toBe(false);
    expect(barVisibleAt(bar({ text: '' }), at(0))).toBe(false);
  });

  it('«حالا یا بعداً» (کد تازه می‌خواهد): همیشه و بازه‌ای که تمام نشده، آینده هم؛ خاموش و بازهٔ تمام‌شده نه', () => {
    const range = bar({ mode: 'range', from: at(1).toISOString(), until: at(3).toISOString() });
    expect(barShown(bar({}), at(0))).toBe(true);
    expect(barShown(range, at(0))).toBe(true);
    expect(barShown(range, new Date(at(3).getTime() - 1))).toBe(true);
    expect(barShown(range, at(3))).toBe(false);
    expect(barShown(bar({ mode: 'off' }), at(0))).toBe(false);
    expect(barShown(bar({ text: '' }), at(0))).toBe(false);
  });

  it('یکی بودن دو نوار همهٔ فیلدها را می‌سنجد', () => {
    expect(sameBar(bar({}), bar({}))).toBe(true);
    for (const patch of [{ mode: 'off' as const }, { text: 'سلام!' }, { href: '/x' }, { linkText: 'x' }, { from: at(0).toISOString() }]) {
      expect(sameBar(bar({}), bar(patch))).toBe(false);
    }
    expect(canonicalBar(BAR_OFF)).toBe('["off",null,null,"","",""]');
  });
});

describe('پیوند (سؤال ۲۹۱): فقط صفحه‌ای از همین سایت', () => {
  it('مسیر همین سایت، و نشانی کامل همین سایت به مسیرش', () => {
    expect(barHref('/#tariff')).toBe('/#tariff');
    expect(barHref('/contact')).toBe('/contact');
    expect(barHref('https://jozveyar.com/terms')).toBe('/terms');
    expect(barHref('https://www.jozveyar.com')).toBe('/');
  });

  it('سایت دیگر، `tel:`، `mailto:` و «\\» (که مرورگر «/» می‌خواند) نه', () => {
    for (const href of ['https://t.me/jozveyar', '//evil.example', '/\\evil.example', 'tel:09121234567', 'mailto:a@b.co', 'javascript:alert(1)', 'contact']) {
      expect(barHref(href)).toBeNull();
    }
  });
});

describe('یکدست کردن فرم', () => {
  it('متن یک خط، رقم لاتین و «ی» و «ک» فارسی؛ نشانی بی فاصله و نشانی کامل به مسیر؛ بی پیوند متن پیوند هم نه', () => {
    expect(tidyBar({ text: '  هر صفحه فقط\n**۱۶۰۰ تومان**  ', href: ' https://jozveyar.com/#tariff ', linkText: ' ديدن تعرفه ' })).toEqual({
      text: 'هر صفحه فقط **1600 تومان**',
      href: '/#tariff',
      linkText: 'دیدن تعرفه',
    });
    expect(tidyBar({ text: 'سلام', href: '', linkText: 'دیدن' })).toEqual({ text: 'سلام', href: '', linkText: '' });
    // نشانی نادرست همان نوشته می‌ماند، تا خطا بگوید چه نوشته شد.
    expect(tidyBar({ text: 'سلام', href: 'https://t.me/x', linkText: 'برو' })).toMatchObject({ href: 'https://t.me/x' });
    expect(tidyBar({ text: 7, href: null, linkText: undefined })).toEqual({ text: '', href: '', linkText: '' });
  });
});

describe('سنجش (سؤال‌های ۲۹۱ و ۲۸۴)', () => {
  const check = (patch: Partial<AnnouncementBar>) => checkBar({ ...bar({}), ...patch }, VALUES);

  it('متن طرح بی خطا؛ نوار خاموش بی متن هم', () => {
    expect(check({ text: 'هر صفحهٔ سیاه‌سفید فقط **{نرخ_سیاه_سفید} تومان**، صحافی از {صحافی_از} تومان', href: '/#tariff', linkText: 'دیدن تعرفه' })).toEqual([]);
    expect(check({ mode: 'off', text: '' })).toEqual([]);
  });

  it('نوار روشن بی متن، خطای «خالی»', () => {
    expect(check({ text: '' })).toEqual([{ field: 'text', label: 'متن', code: 'required' }]);
    expect(check({ mode: 'range', text: '' })).toEqual([{ field: 'text', label: 'متن', code: 'required' }]);
  });

  it('سقف ۹۰ نویسه با عددهای امروز و بی ستاره، نه با نام جای‌نگهدار', () => {
    // «{فرمت‌ها}» (۹ نویسه) با عدد امروز «PDF، Word، پاورپوینت یا عکس» (۲۷ نویسه) است.
    const head = 'ا'.repeat(BAR_TEXT_MAX - 27);
    expect(barPlainText(`${head}{فرمت‌ها}`, VALUES)).toHaveLength(BAR_TEXT_MAX);
    expect(check({ text: `${head}{فرمت‌ها}` })).toEqual([]);
    expect(check({ text: `**${head}{فرمت‌ها}**` })).toEqual([]);
    expect(check({ text: `${head}ا{فرمت‌ها}` })).toEqual([{ field: 'text', label: 'متن', code: 'bar_too_long', max: BAR_TEXT_MAX, length: BAR_TEXT_MAX + 1 }]);
    expect(check({ text: 'ا'.repeat(301) })).toEqual([{ field: 'text', label: 'متن', code: 'too_long', max: 300, length: 301 }]);
  });

  it('پیوند درون متن نه (کل نوار پیوند است)، پررنگ دست‌بالا یکی، جای‌نگهدار ناشناس با پیشنهاد، HTML نه', () => {
    expect(check({ text: 'ببین [تعرفه](/#tariff)' }).map((issue) => issue.code)).toEqual(['bar_link_in_text']);
    expect(check({ text: '**یک** و **دو**' }).map((issue) => issue.code)).toEqual(['bar_bold_twice']);
    expect(check({ text: 'فقط **یک' }).map((issue) => issue.code)).toEqual(['bold_unclosed']);
    expect(check({ text: 'هر صفحه {نرخ سیاه سفید}' })).toEqual([
      { field: 'text', label: 'متن', code: 'placeholder_unknown', detail: 'نرخ سیاه سفید', suggestion: 'نرخ_سیاه_سفید' },
    ]);
    expect(check({ text: '<b>تخفیف</b>' }).map((issue) => issue.code)).toEqual(['html']);
  });

  it('پیوند فقط همین سایت، و با پیوند متن پیوند لازم است، تا ۲۴ نویسه و بی قالب', () => {
    expect(check({ href: 'https://t.me/x', linkText: 'برو' })).toEqual([{ field: 'href', label: 'پیوند', code: 'bar_href', detail: 'https://t.me/x' }]);
    expect(check({ href: '/\\evil.example', linkText: 'برو' }).map((issue) => issue.code)).toEqual(['bar_href']);
    expect(check({ href: '/contact', linkText: '' })).toEqual([{ field: 'linkText', label: 'متن پیوند', code: 'bar_link_text' }]);
    expect(check({ href: '/contact', linkText: 'ت'.repeat(BAR_LINK_TEXT_MAX + 1) })).toEqual([
      { field: 'linkText', label: 'متن پیوند', code: 'too_long', max: BAR_LINK_TEXT_MAX, length: BAR_LINK_TEXT_MAX + 1 },
    ]);
    expect(check({ href: '/contact', linkText: '**تماس**' }).map((issue) => issue.code)).toEqual(['bold_not_here']);
    expect(check({ href: '/contact', linkText: '{روز_کاری} روز' }).map((issue) => issue.code)).toEqual(['placeholder_not_here']);
  });

  it('متن نوار خاموش هم سنجیده می‌شود، تا روشن کردنش بعداً خطای تازه نداشته باشد', () => {
    expect(check({ mode: 'off', text: '**یک** و **دو**' }).map((issue) => issue.code)).toEqual(['bar_bold_twice']);
  });
});

describe('رسم (همان HTML طرح `content.html`)', () => {
  const values = VALUES;

  it('با پیوند: کل نوار پیوند، متن در یک span، پررنگ با عدد امروز، و «متن پیوند ←» ته جمله', () => {
    const text = 'هر صفحهٔ سیاه‌سفید فقط **{نرخ_سیاه_سفید} تومان**، صحافی از {صحافی_از} تومان';
    expect(html(createElement(Bar, { bar: { text, href: '/#tariff', linkText: 'دیدن تعرفه' }, options: { values }, className: 'site-idle' }))).toBe(
      '<a class="site-bar site-idle" href="/#tariff"><span class="site-wrap site-bar__in"><span>هر صفحهٔ سیاه‌سفید فقط <b><span class="num">1,600</span> تومان</b>، صحافی از <span class="num">45,000</span> تومان <span class="site-bar__go">دیدن تعرفه<span class="jy-icon jy-icon-arrow" aria-hidden="true"></span></span></span></span></a>',
    );
  });

  it('بی پیوند: aside با برچسب «اعلان»؛ پیش‌نمایش پنل بی پیوند، بی ظرف پهنای سایت، و عدد خط‌چین', () => {
    const text = 'تحویل پست تا {روز_کاری} روز کاری پس از پرداخت.';
    expect(html(createElement(Bar, { bar: { text, href: '', linkText: '' }, options: { values } }))).toBe(
      '<aside class="site-bar" aria-label="اعلان"><p class="site-wrap site-bar__in"><span>تحویل پست تا <span class="num">2</span> روز کاری پس از پرداخت.</span></p></aside>',
    );
    expect(html(createElement(Bar, { bar: { text, href: '/contact', linkText: 'تماس' }, options: { values, live: 'ad-live', inert: true } }))).toBe(
      '<span class="site-bar" data-href="/contact"><span class="site-bar__in"><span>تحویل پست تا <span class="ad-live"><span class="num">2</span></span> روز کاری پس از پرداخت. <span class="site-bar__go">تماس<span class="jy-icon jy-icon-arrow" aria-hidden="true"></span></span></span></span></span>',
    );
  });

  it('هیچ متنی HTML نمی‌شود', () => {
    const out = html(createElement(Bar, { bar: { text: '<script>alert(1)</script>', href: '', linkText: '' }, options: { values } }));
    expect(out).toContain('&lt;<bdi>script</bdi>&gt;');
    expect(out).not.toContain('<script');
  });
});
