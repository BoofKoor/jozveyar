/**
 * آنچه میان‌افزار سایت با هر نشانی می‌کند (برش ۱۵٫۲، سؤال‌های ۴۳۱ و ۴۶۶)، خالص، تا تست بی سرور بسنجدش؛ خواندن فهرست‌ها از پایگاه داده در
 * `middleware.ts`.
 *
 * نشانی هر صفحهٔ فرود در ریشهٔ سایت است (`/print-pdf`)، ولی رسمش مسیر درونی `/lp/<نشانی>` است و میان‌افزار فقط نشانی صفحه‌ای را که همین حالا
 * روی سایت است به آن می‌دهد. پس هر نشانی دیگر (`/wp-login.php`، نشانی برداشته) هیچ مسیری ندارد و همان ۴۰۴ سایت است، با HTML کامل و بی ISR جدا
 * برای هر نشانی ساختگی؛ `notFound()` یک مسیر پویا در ریشه به جایش پوستهٔ خطای نکست را می‌داد.
 */

/** «چاپ جزوه» خود صفحهٔ اصلی است (سؤال ۴۳۱): این نشانی ثابت سایت است، نه از پنل. */
export const HOME_ALIAS_PATH = '/chap-jozve';

/** مسیر درونی رسم صفحه‌های فرود؛ `lp` نام رزرو است، پس هیچ صفحه‌ای نمی‌گیردش. */
export const LANDING_ROUTE = '/lp';

export interface SiteRouteLists {
  /** هر نشانی‌ای که ۳۰۱ است، به مقصدش. */
  redirects: ReadonlyMap<string, string>;
  /** نشانی صفحه‌های فرودی که همین حالا روی سایت‌اند. */
  pages: ReadonlySet<string>;
}

export type RouteDecision = { kind: 'redirect'; to: string } | { kind: 'rewrite'; to: string } | null;

const SLUG_PATH = /^\/([a-z0-9][a-z0-9-]*)$/;

/**
 * ۳۰۱ برای `/chap-jozve` و نشانی‌های قبلی، رسم صفحهٔ فرود روی سایت از مسیر درونی، و هیچ برای بقیه (مسیرهای خود سایت، یا ۴۰۴). خود مسیر درونی هم
 * نشانی نیست (یک نشانی برای هر صفحه): `/lp/<نشانی>` با ۳۰۱ به `/<نشانی>`.
 */
export function routeFor(pathname: string, lists: SiteRouteLists): RouteDecision {
  if (pathname === HOME_ALIAS_PATH) return { kind: 'redirect', to: '/' };
  if (pathname === LANDING_ROUTE || pathname.startsWith(`${LANDING_ROUTE}/`)) {
    const inner = /^\/lp\/([a-z0-9][a-z0-9-]*)\/?$/.exec(pathname)?.[1];
    return { kind: 'redirect', to: inner ? `/${inner}` : '/' };
  }
  const slug = SLUG_PATH.exec(pathname)?.[1];
  if (!slug) return null;
  const to = lists.redirects.get(slug);
  if (to && to !== pathname) return { kind: 'redirect', to };
  if (lists.pages.has(slug)) return { kind: 'rewrite', to: `${LANDING_ROUTE}/${slug}` };
  return null;
}
