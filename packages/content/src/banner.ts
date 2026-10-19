/**
 * بنر صفحهٔ اصلی (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶، «تصویر»): متن جایگزین و پیوند اختیاری فقط به صفحه‌ای از همین سایت، با همان قاعدهٔ پیوند نوار
 * اعلان (`barHref`). شکل ذخیره‌شده تنظیم `content.banner` است (`siteBannerSchema`)؛ تصویر را کارگر می‌سازد و سایت فقط آن را می‌دهد. پنل پیش از
 * ذخیره و سایت پیش از رسم همین را می‌سنجند.
 */

import { tidyInputFa } from '@jozveyar/text/input';

import { barHref } from './bar.js';
import type { ContentIssue } from './check.js';

/** متن جایگزین بنر: آنچه صفحه‌خوان و گوگل به جای تصویر می‌خوانند. */
export const BANNER_ALT_MAX = 120;

const str = (value: unknown) => (typeof value === 'string' ? value.slice(0, 2_000) : '');
const length = (value: string) => [...value].length;

/** فیلدهای فرم بنر، یکدست: متن جایگزین با `tidyInputFa` (یک خط)، و نشانی بی فاصله، و نشانی کامل همین سایت به مسیرش. */
export function tidyBanner(input: { alt: unknown; href: unknown }): { alt: string; href: string } {
  const raw = str(input.href).replace(/\s+/g, '');
  return { alt: tidyInputFa(str(input.alt)), href: raw ? (barHref(raw) ?? raw) : '' };
}

/** سنجش متن جایگزین (لازم، تا ۱۲۰ نویسه) و پیوند (خالی، یا فقط صفحه‌ای از همین سایت)، هر خطا با فیلد خودش. */
export function checkBanner(banner: { alt: string; href: string }): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const alt = { field: 'alt', label: 'متن جایگزین' };
  if (!banner.alt) issues.push({ ...alt, code: 'required' });
  else if (length(banner.alt) > BANNER_ALT_MAX) issues.push({ ...alt, code: 'too_long', max: BANNER_ALT_MAX, length: length(banner.alt) });
  if (banner.href && (length(banner.href) > 200 || barHref(banner.href) === null)) {
    issues.push({ field: 'href', label: 'پیوند', code: 'banner_href', detail: banner.href.slice(0, 80) });
  }
  return issues;
}
