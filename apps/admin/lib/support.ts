/**
 * پشتیبانی در پنل، به زبان صفحه (برش ۱۲٫۱، ADR-068؛ طرح «پشتیبانی (برش ۱۲)» در `admin.html`): نام چیپ‌ها و حال‌ها، «منتظر از …» ردیف
 * صندوق و هشدار پیشخوان، تکهٔ آخرین پیام، سرسطر هر پیام گفت‌وگو، و اینکه پاسخ بعدی پیامک تازه می‌گیرد یا نه. خالص، تا تست بی ساعت واقعی
 * بسنجدش؛ حکم آخر پیامک با تراکنش پاسخ است (`packages/db/src/support.ts`).
 */

import type { InboxLine, PanelMessage, PanelThreadView, SupportBucket, SupportLast, SupportStatus } from '@jozveyar/db';
import { formatTehranTime } from '@jozveyar/text';

import { tehranDay, whenText } from './format';
import type { Seg } from './orders';

export const BUCKET_LABELS: Record<SupportBucket, string> = { open: 'باز', answered: 'پاسخ داده شد', closed: 'بسته', all: 'همه' };

export const STATUS_LABELS: Record<SupportStatus, string> = { open: 'باز', answered: 'پاسخ داده شد', closed: 'بسته' };

export const EMPTY: Record<SupportBucket, string> = {
  open: 'پیامی بی پاسخ نمانده.',
  answered: 'گفت‌وگوی پاسخ‌داده‌ای نیست.',
  closed: 'هنوز هیچ گفت‌وگویی بسته نشده.',
  all: 'هنوز هیچ مشتری‌ای از «سفارش‌های من» پیام نداده.',
};

/** «سفارش 10027» یا «سؤال کلی»؛ شمارهٔ سفارش بی جداکنندهٔ هزارگان. */
export const topicSegs = (orderNumber: number | null): Seg[] => (orderNumber === null ? ['سؤال کلی'] : ['سفارش ', { num: String(orderNumber) }]);

/** «08:12» برای امروز (صندوق، طرح)، وگرنه «دیروز 21:14» و «شنبه 11 مهر 09:15». */
export const sinceText = (at: Date, now: Date): string => (tehranDay(at) === tehranDay(now) ? formatTehranTime(at) : whenText(at, now));

/** «ساعت 08:12» برای امروز (هشدار پیشخوان، طرح)، وگرنه «دیروز 21:14». */
export const oldestText = (at: Date, now: Date): string => (tehranDay(at) === tehranDay(now) ? `ساعت ${formatTehranTime(at)}` : whenText(at, now));

/** ستون آخر ردیف صندوق: باز «منتظر از …» (سؤال ۳۱۳)، و بقیه حال با زمان آخرین پیام. */
export function waitText(line: Pick<InboxLine, 'status' | 'waitingSince' | 'lastMessageAt'>, now: Date): string {
  if (line.status === 'open' && line.waitingSince) return `منتظر از ${sinceText(line.waitingSince, now)}`;
  return line.status === 'answered' ? `پاسخ داده شد، ${whenText(line.lastMessageAt, now)}` : `بسته، آخرین پیام ${whenText(line.lastMessageAt, now)}`;
}

/** بیشترین طول تکهٔ ردیف صندوق؛ نمایش خودش دو خط است (`ad-thread__snip`). */
const SNIPPET_MAX = 240;

/** تکهٔ آخرین پیام در یک خط؛ پاسخ ما با «پاسخ: ». */
export function lastSnippet(last: SupportLast | null): string {
  if (!last) return '';
  const flat = last.body.replace(/\s+/g, ' ').trim();
  const text = flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX)}…` : flat;
  return last.kind === 'staff' ? `پاسخ: ${text}` : text;
}

/** سرسطر یک پیام (سؤال ۳۱۴): نام مشتری، یا نام ادمین که فقط پنل می‌بیند، با زمان. */
export function messageHead(message: Pick<PanelMessage, 'kind' | 'adminName' | 'at'>, customer: string | null, now: Date): { who: string; when: string } {
  const when = whenText(message.at, now);
  if (message.kind === 'customer') return { who: customer ?? 'مشتری', when };
  const who = message.adminName ?? 'پشتیبانی';
  return message.kind === 'staff' ? { who, when: `پاسخ پشتیبانی · ${when}` } : { who, when: `گفت‌وگو را بست · ${when}` };
}

/** آخرین پیام گفت‌وگو، برای «بستن» از همان که دیده شد؛ null یعنی هنوز پیامی نیست. */
export const lastMessageId = (thread: Pick<PanelThreadView, 'messages'>): number | null => thread.messages.at(-1)?.id ?? null;

/** پاسخ پیامک‌دار آخر گفت‌وگو: فقط پیامک همان «دوباره» می‌رود (پاسخ‌های پشت‌سرهم یک خبرند). */
export const latestSmsMessageId = (thread: Pick<PanelThreadView, 'messages'>): number | null =>
  thread.messages.filter((message) => message.sms !== null).at(-1)?.id ?? null;

/** مشتری این پاسخ را دیده: «دیده شد» گفت‌وگو پس از خود پاسخ. */
export const replySeen = (at: Date, customerSeenAt: Date | null) => customerSeenAt !== null && customerSeenAt.getTime() >= at.getTime();

/**
 * پاسخ بعدی پیامک تازه می‌گیرد؟ همان قاعدهٔ تراکنش پاسخ (سؤال ۳۱۲): نه اگر پیامک پاسخی که رفته یا در راه است هنوز دیده نشده. فقط برای راهنمای
 * زیر فرم؛ پیامکی که نرفت خبر نبود، پس پاسخ بعدی پیامک خودش را دارد.
 */
export function replySmsGoes(thread: Pick<PanelThreadView, 'messages' | 'customerSeenAt'>): boolean {
  return !thread.messages.some(
    (message) =>
      message.kind === 'staff' &&
      message.sms !== null &&
      ['pending', 'sending', 'sent', 'logged'].includes(message.sms.status) &&
      !replySeen(message.at, thread.customerSeenAt),
  );
}
