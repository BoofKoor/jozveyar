/**
 * نوار اعلان بالای سربرگ سایت (برش ۱۱٫۳، ADR-066؛ سؤال‌های ۲۰۸ و ۲۹۱ تا ۲۹۴): کی دیده شود، متن یک‌خطی با دست‌بالا یک پررنگ و جای‌نگهدار
 * (قالب `emphasis`، همان تیتر صفحهٔ اصلی)، و پیوند اختیاری فقط به صفحه‌ای از همین سایت، با متنش ته جمله. شکل ذخیره‌شده تنظیم `content.bar`
 * است (`announcementBarSchema`). سایت (layout) و پنل (سنجش، پیش‌نمایش و کارت) هر دو از اینجا می‌خوانند، پس پیش‌نمایش همان سایت است.
 *
 * روزها را فرم پنل می‌سنجد (مثل تعطیلی چاپخانه، ۱۰٫۱)؛ اینجا فقط اینکه نوار کی روی سایت است.
 */

import type { AnnouncementBar, BarMode } from '@jozveyar/contracts';
import { tidyInputFa } from '@jozveyar/text/input';

import type { ContentIssue } from './check.js';
import { inlineText, linkTarget, parseInline } from './markdown.js';
import type { PlaceholderValues } from './placeholders.js';

/** سقف متن نوار با عددهای امروز و بی ستاره (سؤال ۲۹۱): در ۳۲۰ پیکسل، با متن پیوند، دو خط. */
export const BAR_TEXT_MAX = 90;
/** سقف آنچه نوشته می‌شود، با ستاره‌ها و نام جای‌نگهدارها. */
export const BAR_TEXT_INPUT_MAX = 300;
/** متن پیوند، ته جمله با «←»: «دیدن تعرفه». */
export const BAR_LINK_TEXT_MAX = 24;
export const BAR_HREF_MAX = 200;
/** روز آخر بازه دست‌بالا این‌قدر روز پس از امروز (سؤال ۲۹۴، همان سقف تعطیلی چاپخانه). */
export const BAR_MAX_DAYS = 90;

/** نوار خاموش و بی متن: پیش‌فرض، و هر مقدار خرابی که سایت می‌خواند. */
export const BAR_OFF: AnnouncementBar = { mode: 'off', from: null, until: null, text: '', href: '', linkText: '' };

/** نوار همین حالا روی سایت است: «همیشه»، یا «در بازه» از آغاز روز اول تا پیش از پایان روز آخر؛ و با متن. */
export function barVisibleAt(bar: AnnouncementBar, at: Date): boolean {
  if (!bar.text) return false;
  if (bar.mode === 'always') return true;
  if (bar.mode !== 'range' || bar.from === null || bar.until === null) return false;
  return Date.parse(bar.from) <= at.getTime() && at.getTime() < Date.parse(bar.until);
}

/**
 * نوار حالا یا بعداً، بی کار دیگری، روی سایت می‌آید: «همیشه»، یا بازه‌ای که هنوز تمام نشده. روشن کردن و هر تغییر چنین نواری کد تازه می‌خواهد
 * (سؤال ۲۸۷)، و خاموش کردن، ذخیرهٔ متن نوار خاموش و بازهٔ تمام‌شده نه.
 */
export function barShown(bar: AnnouncementBar, at: Date): boolean {
  if (!bar.text) return false;
  return bar.mode === 'always' || (bar.mode === 'range' && bar.until !== null && at.getTime() < Date.parse(bar.until));
}

/** متن نوار با عددهای امروز و بی ستاره: آنچه مشتری می‌خواند، و سقف ۹۰ نویسه با همین است. */
export const barPlainText = (text: string, values: PlaceholderValues): string => inlineText(parseInline(text, 'emphasis').nodes, values);

/** نشانی پیوند نوار: فقط صفحه‌ای از همین سایت (`/…`؛ `https://jozveyar.com/…` همان مسیر می‌شود). null یعنی جای دیگر، `tel:` و `mailto:` هم. */
export function barHref(href: string): string | null {
  const target = linkTarget(href);
  return target !== null && target.startsWith('/') ? target : null;
}

/** JSON یکتای یک نوار، برای «همان که دیده شد» و «چیزی عوض نشد». */
export const canonicalBar = (bar: AnnouncementBar): string => JSON.stringify([bar.mode, bar.from, bar.until, bar.text, bar.href, bar.linkText]);

export const sameBar = (a: AnnouncementBar, b: AnnouncementBar) => canonicalBar(a) === canonicalBar(b);

const str = (value: unknown) => (typeof value === 'string' ? value.slice(0, 2_000) : '');

/**
 * فیلدهای متنی فرم نوار، یکدست: متن و متن پیوند با `tidyInputFa` (یک خط؛ رقم لاتین، «ی» و «ک» فارسی)، نشانی بی فاصله و نشانی کامل همین
 * سایت به مسیرش. بی پیوند، متن پیوند هم نیست («خالی یعنی بی پیوند»).
 */
export function tidyBar(input: { text: unknown; href: unknown; linkText: unknown }): { text: string; href: string; linkText: string } {
  const raw = str(input.href).replace(/\s+/g, '');
  const href = raw ? (barHref(raw) ?? raw) : '';
  return { text: tidyInputFa(str(input.text)), href, linkText: href ? tidyInputFa(str(input.linkText)) : '' };
}

const length = (value: string) => [...value].length;

/**
 * سنجش متن و پیوند نوار، هر خطا با فیلد خودش (`text`، `href`، `linkText`). متن خالی فقط برای نوار روشن خطاست؛ متن نوار خاموش هم سنجیده
 * می‌شود، تا روشن کردنش بعداً خطای تازه‌ای نداشته باشد. پیوند درون متن نمی‌آید (کل نوار پیوند است)، و پررنگ دست‌بالا یکی.
 */
export function checkBar(bar: { mode: BarMode; text: string; href: string; linkText: string }, values: PlaceholderValues): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const text = { field: 'text', label: 'متن' };
  if (!bar.text) {
    if (bar.mode !== 'off') issues.push({ ...text, code: 'required' });
  } else if (length(bar.text) > BAR_TEXT_INPUT_MAX) {
    issues.push({ ...text, code: 'too_long', max: BAR_TEXT_INPUT_MAX, length: length(bar.text) });
  } else {
    for (const { line: _line, ...issue } of parseInline(bar.text, 'emphasis').issues) {
      const code = issue.code === 'link_not_here' ? 'bar_link_in_text' : issue.code === 'emphasis_twice' ? 'bar_bold_twice' : issue.code;
      issues.push({ ...text, ...issue, code });
    }
    const plain = length(barPlainText(bar.text, values));
    if (plain > BAR_TEXT_MAX) issues.push({ ...text, code: 'bar_too_long', max: BAR_TEXT_MAX, length: plain });
  }
  if (bar.href) {
    if (length(bar.href) > BAR_HREF_MAX || barHref(bar.href) === null) {
      issues.push({ field: 'href', label: 'پیوند', code: 'bar_href', detail: bar.href.slice(0, 80) });
    }
    const linkText = { field: 'linkText', label: 'متن پیوند' };
    if (!bar.linkText) issues.push({ ...linkText, code: 'bar_link_text' });
    else if (length(bar.linkText) > BAR_LINK_TEXT_MAX) issues.push({ ...linkText, code: 'too_long', max: BAR_LINK_TEXT_MAX, length: length(bar.linkText) });
    else for (const { line: _line, ...issue } of parseInline(bar.linkText, 'plain').issues) issues.push({ ...linkText, ...issue });
  }
  return issues;
}
