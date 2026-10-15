/**
 * قالب برگه‌ها در پنل (برش ۹٫۲، ADR-057؛ سؤال‌های ۱۹۳ و ۱۹۴): نام‌ها، پارامتر نشانی، نام فایل‌ها، و متن پیش‌نمایش. خالص و بی نکست؛ سرویس در
 * `server/templates.ts`، و قالب‌های پیش‌فرض و متغیرها از کارگر در `ticketTemplates.generated.ts`.
 */

import type { Seg } from './orders';

export type TicketTemplateKind = 'bijak' | 'first_page';

export const TICKET_TEMPLATE_KINDS: readonly TicketTemplateKind[] = ['bijak', 'first_page'];

export const KIND_NAMES: Record<TicketTemplateKind, string> = { bijak: 'بیجک', first_page: 'برگهٔ اول' };

/** هر برگه کجا می‌رود (سؤال ۱۹۴). */
export const KIND_HINTS: Record<TicketTemplateKind, string> = {
  bijak: 'یکی برای هر سفارش، روی بسته، با برچسب پست؛ اول PDF برگه‌ها.',
  first_page: 'یکی برای هر جزوه، روی دستهٔ همان جزوه؛ پس از بیجک.',
};

export const isTemplateKind = (value: unknown): value is TicketTemplateKind => value === 'bijak' || value === 'first_page';

/** پارامتر نشانی صفحه‌های قالب: شناسهٔ یک نسخه، یا `default-<نوع>` برای قالب پیش‌فرض همان نوع. */
export type TemplateRef = { kind: null; id: number } | { kind: TicketTemplateKind; id: null };

export function templateRefOf(param: string): TemplateRef | null {
  if (/^[1-9][0-9]{0,8}$/.test(param)) return { kind: null, id: Number(param) };
  const kind = param.startsWith('default-') ? param.slice('default-'.length) : null;
  return isTemplateKind(kind) ? { kind, id: null } : null;
}

export const defaultRef = (kind: TicketTemplateKind) => `default-${kind}`;

/** نام فایل دانلود قالب، فقط ASCII مثل بقیهٔ دانلودهای پنل. */
export const templateFileName = (kind: TicketTemplateKind, version: number | null) =>
  `ghaleb-${kind === 'bijak' ? 'bijak' : 'barge-aval'}-${version ?? 'pishfarz'}.html`;

/** نام PDF پیش‌نمایش یک نسخه. */
export const previewFileName = (kind: TicketTemplateKind, version: number) =>
  `pishnamayesh-${kind === 'bijak' ? 'bijak' : 'barge-aval'}-${version}.pdf`;

/** PNG صفحهٔ n ام (از ۱) کنار صفحهٔ اول؛ همان قاعدهٔ کارگر (`preview_key_of` در `services/docworker/docworker/ticket.py`). */
export const previewKeyOf = (first: string, page: number) => (page === 1 ? first : `${first.slice(0, -'.png'.length)}-${page}.png`);

/**
 * «همان که دیده شد» فعال کردن (فیلد پنهان فرم): متن نسخه و زمان پیش‌نمایشی که صفحه نشان داد. پیش‌نمایش تازه‌ای که پس از دیدن صفحه
 * رسید، فعال کردن را می‌بندد تا مالک همان را ببیند.
 */
export const activationSeen = (version: { sha256: string; preview: { at: Date | null } }) =>
  `${version.sha256}.${version.preview.at?.getTime() ?? ''}`;

/** خطای قالب پیش‌نمایش («first_page خط 3: …»، `TemplateFailure` کارگر): خط و پیام، بی نام نوع که صفحه خودش دارد. */
export function templateErrorOf(error: string): { line: number | null; message: string } {
  const match = /^[a-z_]*(?: خط (\d+))?: ([\s\S]*)$/.exec(error);
  if (!match) return { line: null, message: error };
  return { line: match[1] ? Number(match[1]) : null, message: match[2]! };
}

/** شکست کار پیش‌نمایش (`jobs.last_error`، «کد: پیام»)؛ خطای خود قالب شکست کار نیست و روی نسخه است. */
export function previewJobErrorText(jobError: string | null): string {
  const [code, detail] = (jobError ?? '').split(': ', 2);
  const number = /^[0-9]+$/.test(detail ?? '') ? detail : null;
  switch (code) {
    case 'order_missing':
      return number ? `سفارش ${number} پیدا نشد؛ شماره را ببین و دوباره بزن.` : 'آن سفارش پیدا نشد؛ شماره را ببین و دوباره بزن.';
    case 'order_not_paid':
      return 'آن سفارش هنوز پرداخت نشده؛ پیش‌نمایش با سفارش پرداخت‌شده ساخته می‌شود.';
    case 'files_deleted':
      return `فایل‌های سفارش ${number ?? ''} پاک شده؛ پیش‌نمایش با سفارش دیگری یا با دادهٔ نمونه بساز.`.replace('  ', ' ');
    default:
      return 'پیش‌نمایش ساخته نشد؛ چند دقیقهٔ دیگر دوباره بزن.';
  }
}

/** نام متغیر همان‌طور که در قالب نوشته می‌شود («order.label_name»، «f.files[].name»). */
export const variableName = (prefix: string, field: string) => (prefix ? `${prefix}.${field}` : field);

/** قالب‌هایی که برگهٔ یک سفارش با آنها ساخته شد: «بیجک نسخهٔ 3 · برگهٔ اول پیش‌فرض». */
export function ticketTemplatesSegs(templates: { bijak: number | null; firstPage: number | null }): Seg[] {
  const one = (kind: TicketTemplateKind, version: number | null): Seg[] =>
    version === null ? [`${KIND_NAMES[kind]} پیش‌فرض`] : [`${KIND_NAMES[kind]} نسخهٔ `, { num: String(version) }];
  return [...one('bijak', templates.bijak), ' · ', ...one('first_page', templates.firstPage)];
}
