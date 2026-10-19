/**
 * نوار اعلان در پنل (برش ۱۱٫۳، ADR-066؛ طرح «نوار اعلان» و «محتوای سایت» در `admin.html`، سؤال‌های ۲۸۷ و ۲۹۱ تا ۲۹۴): فرم (کی، روزها، متن و
 * پیوند) به نوار، حال نوار در یک نشان، خط زیر پیش‌نمایش کارت، و نام صفحهٔ پیوند. خالص و بی JSX، مثل `partners.ts`: تست بی مرورگر می‌سنجدش.
 *
 * روزها مثل تعطیلی چاپخانه (۱۰٫۱، `availabilityOf`): شمسی و دوسرشامل (`1405/07/25`، ارقام فارسی هم)، به وقت تهران، از امروز تا ۹۰ روز بعد؛ روز
 * اولِ گذشته فقط همان بازه‌ای است که همین حالا روی سایت است، تا متن یا روز آخرش بی جابه‌جا کردن آغازش عوض شود.
 */

import { BAR_MAX_DAYS, BAR_OFF, barVisibleAt, checkBar, tidyBar, type ContentIssue, type PlaceholderValues } from '@jozveyar/content';
import { BAR_MODES, announcementBarSchema, type AnnouncementBar, type BarMode } from '@jozveyar/contracts';
import type { SettingEvent } from '@jozveyar/db';
import { formatDeadlineDay, formatJalali, formatJalaliNumeric, formatJalaliWeekday, parseJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import type { ContentSeg } from './content';
import { whenText } from './format';

export type BarField = 'mode' | 'from' | 'until' | 'text' | 'href' | 'linkText';

export type BarFormError =
  | 'invalid_bar_mode'
  | 'bar_invalid_day'
  | 'bar_invalid_last_day'
  | 'bar_day_past'
  | 'bar_last_day_past'
  | 'bar_day_order'
  | 'bar_day_too_far';

/** فیلدهای فرم، همان‌طور که از فرم HTML می‌آیند. */
export interface BarFormInput {
  mode: unknown;
  from: unknown;
  until: unknown;
  text: unknown;
  href: unknown;
  linkText: unknown;
}

export type BarFormResult =
  | { ok: true; bar: AnnouncementBar }
  /** خطای «کی» یا روزها (یکی، با فیلدش)، و خطاهای متن و پیوند، هر کدام با فیلد خودش؛ هر دو با هم، تا فرم همه را یک‌جا بگوید. */
  | { ok: false; field?: BarField; error?: BarFormError; issues: ContentIssue[] };

const isMode = (value: unknown): value is BarMode => typeof value === 'string' && (BAR_MODES as readonly string[]).includes(value);

/** روزهای «در بازه»: آغاز روز اول و پایان انحصاری روز آخر، یا خطای اولین فیلد نادرست. */
function rangeOf(
  input: { from: unknown; until: unknown },
  now: Date,
  current: AnnouncementBar,
): { ok: true; from: Date; until: Date } | { ok: false; field: 'from' | 'until'; error: BarFormError } {
  const from = typeof input.from === 'string' ? parseJalaliNumeric(input.from) : null;
  if (!from) return { ok: false, field: 'from', error: 'bar_invalid_day' };
  const last = typeof input.until === 'string' ? parseJalaliNumeric(input.until) : null;
  if (!last) return { ok: false, field: 'until', error: 'bar_invalid_last_day' };
  const today = tehranDayStart(now);
  const ongoing =
    current.mode === 'range' &&
    current.from === from.toISOString() &&
    current.until !== null &&
    Date.parse(current.from) <= now.getTime() &&
    now.getTime() < Date.parse(current.until);
  if (from.getTime() < today.getTime() && !ongoing) return { ok: false, field: 'from', error: 'bar_day_past' };
  if (last.getTime() < from.getTime()) return { ok: false, field: 'until', error: 'bar_day_order' };
  if (last.getTime() < today.getTime()) return { ok: false, field: 'until', error: 'bar_last_day_past' };
  if (last.getTime() > tehranDayStart(now, BAR_MAX_DAYS).getTime()) return { ok: false, field: 'until', error: 'bar_day_too_far' };
  return { ok: true, from, until: tehranDayStart(last, 1) };
}

/**
 * فرم نوار به نوار: «کی» (خاموش، همیشه، در بازه)، روزها فقط برای «در بازه»، و متن و پیوند یکدست و سنجیده (`checkBar`، ۹۰ نویسه با عدد امروز
 * `values`). نوار خاموش متنش را نگه می‌دارد و روز ندارد.
 */
export function barFormOf(input: BarFormInput, now: Date, current: AnnouncementBar, values: PlaceholderValues): BarFormResult {
  const fields = tidyBar(input);
  const mode = isMode(input.mode) ? input.mode : null;
  const issues = checkBar({ mode: mode ?? 'always', ...fields }, values);
  if (!mode) return { ok: false, field: 'mode', error: 'invalid_bar_mode', issues };
  let from: string | null = null;
  let until: string | null = null;
  if (mode === 'range') {
    const range = rangeOf(input, now, current);
    if (!range.ok) return { ok: false, field: range.field, error: range.error, issues };
    from = range.from.toISOString();
    until = range.until.toISOString();
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, bar: { mode, from, until, ...fields } };
}

/** مقدار خام تنظیم به نوار؛ نبودن یا شکل خراب، خاموش (همان `readSetting`، بی لاگ؛ زیر قفل ذخیره‌گاه هم همین). */
export function barOf(raw: unknown): AnnouncementBar {
  if (raw === undefined || raw === null) return BAR_OFF;
  const parsed = announcementBarSchema.safeParse(raw);
  return parsed.success ? parsed.data : BAR_OFF;
}

/** روز آخر بازه در فیلد «روز آخر» (`1405/07/30`): روز پیش از پایان انحصاری. */
export const barLastDay = (until: string): Date => new Date(Date.parse(until) - 1);

/** مقدار اولیهٔ فرم از نوار امروز؛ روزهای نوار بی بازه خالی. */
export function barFormValues(bar: AnnouncementBar): Record<BarField, string> {
  return {
    mode: bar.mode,
    from: bar.from ? formatJalaliNumeric(new Date(bar.from)) : '',
    until: bar.until ? formatJalaliNumeric(barLastDay(bar.until)) : '',
    text: bar.text,
    href: bar.href,
    linkText: bar.linkText,
  };
}

export type BarTone = 'success' | 'info' | 'neutral';

/**
 * حال نوار در یک نشان (طرح): «خاموش»، «روشن، همیشه»، «روشن تا پنجشنبه 30 مهر»، «از شنبه 2 آبان تا پنجشنبه 7 آبان» (هنوز نه)، و پس از روز
 * آخر «تمام شد، 30 مهر» (سؤال ۲۹۴).
 */
export function barBadge(bar: AnnouncementBar, now: Date): { tone: BarTone; text: string } {
  if (bar.mode === 'off' || !bar.text) return { tone: 'neutral', text: 'خاموش' };
  if (bar.mode === 'always') return { tone: 'success', text: 'روشن، همیشه' };
  const from = new Date(bar.from!);
  const until = new Date(bar.until!);
  if (barVisibleAt(bar, now)) return { tone: 'success', text: `روشن تا ${formatDeadlineDay(until)}` };
  if (now.getTime() < from.getTime()) return { tone: 'info', text: `از ${formatJalaliWeekday(from)} تا ${formatDeadlineDay(until)}` };
  return { tone: 'neutral', text: `تمام شد، ${formatJalali(barLastDay(bar.until!)).replace(/ \d+$/, '')}` };
}

/** نام صفحه‌هایی که پیوند نوار معمولاً به آن‌هاست؛ بقیه همان نشانی. */
const PAGE_NAMES: Readonly<Record<string, string>> = {
  '/': 'صفحهٔ اصلی',
  '/#how': '«چطور کار می‌کند» صفحهٔ اصلی',
  '/#tariff': 'تعرفهٔ صفحهٔ اصلی',
  '/#reviews': 'نظر مشتری‌های صفحهٔ اصلی',
  '/#faq': 'سؤال‌های صفحهٔ اصلی',
  '/terms': '«قوانین»',
  '/privacy': '«حریم خصوصی»',
  '/about': '«دربارهٔ ما»',
  '/contact': '«تماس»',
};

/** «پیوند به تعرفهٔ صفحهٔ اصلی»، «پیوند به /orders»، یا «بی پیوند». */
export function hrefText(href: string): ContentSeg[] {
  if (!href) return ['بی پیوند'];
  const name = PAGE_NAMES[href];
  return name ? [`پیوند به ${name}`] : ['پیوند به ', { ltr: href }];
}

/** کار هر تغییر نوار، برای رویداد و پیام: روشن شد، عوض شد، خاموش شد، یا متن نوار خاموش ذخیره شد. */
export type BarChange = 'on' | 'change' | 'off' | 'save';

/**
 * کار یک تغییر: نوار تازه‌ای که حالا یا بعداً روی سایت است «روشن» است اگر پیش از آن نبود و «عوض» اگر بود؛ نوار تازه‌ای که روی سایت نمی‌آید
 * «خاموش» است اگر پیش از آن روی سایت بود، وگرنه فقط ذخیرهٔ متن.
 */
export function barChange(before: { shown: boolean }, after: { shown: boolean }): BarChange {
  if (after.shown) return before.shown ? 'change' : 'on';
  return before.shown ? 'off' : 'save';
}

/** بازهٔ نوار برای رویداد و خط کارت: «، همیشه»، «، تا پنجشنبه 30 مهر»، «، از شنبه 2 آبان تا پنجشنبه 7 آبان»؛ نوار خاموش هیچ. */
export function barWhenText(bar: Pick<AnnouncementBar, 'mode' | 'from' | 'until'>, at: Date): string {
  if (bar.mode === 'always') return '، همیشه';
  if (bar.mode !== 'range' || !bar.from || !bar.until) return '';
  const until = formatDeadlineDay(new Date(bar.until));
  return Date.parse(bar.from) <= at.getTime() ? `، تا ${until}` : `، از ${formatJalaliWeekday(new Date(bar.from))} تا ${until}`;
}

/**
 * خط آخرین تغییر زیر پیش‌نمایش کارت (طرح): «روشن از امروز 10:05، علی، با کد تازه.»، «آخرین تغییر دیروز 18:20، سارا، با کد تازه.»، «خاموش از
 * شنبه 11 مهر 09:15، رضا.»؛ بی رویداد هیچ.
 */
export function barEventText(event: SettingEvent | null, now: Date): string | null {
  if (!event) return null;
  const change = event.detail.change;
  const who = event.by ? `، ${event.by}` : '';
  const fresh = event.detail.fresh === true ? '، با کد تازه' : '';
  const when = whenText(event.at, now);
  if (change === 'on') return `روشن از ${when}${who}${fresh}.`;
  if (change === 'off') return `خاموش از ${when}${who}.`;
  if (change === 'save') return `متن ذخیره شد ${when}${who}.`;
  return `آخرین تغییر ${when}${who}${fresh}.`;
}
