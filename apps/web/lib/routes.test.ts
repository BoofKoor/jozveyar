/**
 * آنچه میان‌افزار سایت با هر نشانی می‌کند (برش ۱۵٫۲، سؤال‌های ۴۳۱ و ۴۶۶): `/chap-jozve` همیشه با ۳۰۱ به صفحهٔ اصلی، نشانی قبلی هر صفحه و صفحهٔ
 * برداشته «به صفحهٔ دیگری» به مقصدشان، صفحهٔ فرود روی سایت از مسیر درونی، خود مسیر درونی با ۳۰۱ به نشانی صفحه، و هیچ چیز دیگر. خواندن فهرست‌ها از
 * پایگاه داده در `middleware.ts`؛ خود ۳۰۱ و رسم در سرتاسری.
 */

import { describe, expect, it } from 'vitest';

import { HOME_ALIAS, RESERVED_SLUGS } from '@jozveyar/content';

import { HOME_ALIAS_PATH, LANDING_ROUTE, routeFor } from './routes';

const LISTS = {
  redirects: new Map([
    ['print-arzan', '/tarefe'],
    ['pdf-print', '/print-pdf'],
    ['jozve-ghadimi', '/'],
    ['khodash', '/khodash'],
  ]),
  pages: new Set(['print-pdf', 'chap-rangi', 'khodash']),
};
const NONE = { redirects: new Map<string, string>(), pages: new Set<string>() };

describe('نشانی صفحه‌ها در میان‌افزار', () => {
  it('«چاپ جزوه» خود صفحهٔ اصلی است: همیشه، بی فهرست؛ و نام رزرو است، پس هیچ صفحه‌ای نمی‌گیردش', () => {
    expect(HOME_ALIAS_PATH).toBe(`/${HOME_ALIAS}`);
    expect(RESERVED_SLUGS).toContain(HOME_ALIAS);
    expect(routeFor(HOME_ALIAS_PATH, NONE)).toEqual({ kind: 'redirect', to: '/' });
    expect(routeFor(HOME_ALIAS_PATH, { redirects: new Map([[HOME_ALIAS, '/print-pdf']]), pages: new Set([HOME_ALIAS]) })).toEqual({
      kind: 'redirect',
      to: '/',
    });
  });

  it('نشانی قبلی به مقصدش: «تعرفه»، صفحهٔ فرود دیگر، یا صفحهٔ اصلی', () => {
    expect(routeFor('/print-arzan', LISTS)).toEqual({ kind: 'redirect', to: '/tarefe' });
    expect(routeFor('/pdf-print', LISTS)).toEqual({ kind: 'redirect', to: '/print-pdf' });
    expect(routeFor('/jozve-ghadimi', LISTS)).toEqual({ kind: 'redirect', to: '/' });
  });

  it('صفحهٔ فرود روی سایت از مسیر درونی رسم می‌شود؛ مسیری که خود همان نشانی است ۳۰۱ نیست', () => {
    expect(routeFor('/print-pdf', LISTS)).toEqual({ kind: 'rewrite', to: `${LANDING_ROUTE}/print-pdf` });
    expect(routeFor('/khodash', LISTS)).toEqual({ kind: 'rewrite', to: '/lp/khodash' });
  });

  it('مسیر درونی نشانی نیست: با ۳۰۱ به نشانی صفحه، و `lp` نام رزرو است', () => {
    expect(RESERVED_SLUGS).toContain(LANDING_ROUTE.slice(1));
    expect(routeFor('/lp/print-pdf', LISTS)).toEqual({ kind: 'redirect', to: '/print-pdf' });
    expect(routeFor('/lp/print-pdf/', LISTS)).toEqual({ kind: 'redirect', to: '/print-pdf' });
    for (const path of ['/lp', '/lp/', '/lp/a/b', '/lp/Print']) expect(routeFor(path, LISTS), path).toEqual({ kind: 'redirect', to: '/' });
  });

  it('هیچ چیز دیگر: مسیرهای خود سایت، نشانی ناشناس یا برداشته، چندتکه، با حرف بزرگ یا نقطه — همان مسیر یا ۴۰۴ سایت', () => {
    for (const path of ['/', '/about', '/tarefe', '/orders/messages', '/unknown', '/Print-PDF', '/print-pdf.php', '/wp-login.php']) {
      expect(routeFor(path, LISTS), path).toBeNull();
    }
  });
});
