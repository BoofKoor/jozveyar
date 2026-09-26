/**
 * دروازهٔ پنل (ADR-037): مسیر محرمانهٔ `ADMIN_BASE_PATH` از `.env` سرور، مثلاً `/3f9a0c1d2e4b5a69`.
 *
 * `basePath` نکست در زمان build نوشته می‌شود و بسته در CI و از مخزن عمومی ساخته می‌شود، پس مسیر
 * محرمانه نمی‌تواند در build باشد. به جایش هر نشانی پنل زیر `/[gate]/…` است و `middleware.ts` هر
 * درخواستی را که بخش اولش همین مسیر نیست، پیش از هر صفحه و هر server action با ۴۰۴ خالی برمی‌گرداند. پس
 * نام زیردامنه (که در لاگ‌های CT عمومی است) به تنهایی حتی صفحهٔ ورود را هم نشان نمی‌دهد.
 *
 * مسیر فقط در `.env` و در پیوندی است که دستور سرور به صاحب پروژه نشان می‌دهد؛ هیچ لاگی نمی‌نویسدش.
 */

/** همان مقداری که `bootstrap.sh` پیش از این برش در `.env.example` گذاشته بود؛ مسیر نیست، جای مسیر است. */
const PLACEHOLDER = 'change-this-secret-path';

/**
 * بخش مسیر از `ADMIN_BASE_PATH`، بی `/`؛ null اگر نیست یا شکلش درست نیست (کمتر از ۱۶ نویسه، نویسهٔ
 * بیرون از `[A-Za-z0-9_-]`، یا همان جای‌نگهدار نمونه). null یعنی پنل بسته: همه‌چیز ۴۰۴.
 */
export function gateOf(value: string | undefined): string | null {
  const match = /^\/([A-Za-z0-9_-]{16,64})$/.exec(value?.trim() ?? '');
  if (!match || match[1] === PLACEHOLDER) return null;
  return match[1]!;
}

/** نشانی درون پنل: `href('/admins')` ← `/<مسیر>/admins`. */
export const panelPath = (gate: string, path = '') => `/${gate}${path === '/' ? '' : path}`;
