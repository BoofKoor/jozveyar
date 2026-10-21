/**
 * سنجش یک متن پیش از انتشار (برش ۱۱٫۱، سؤال‌های ۲۸۴ تا ۲۹۰): هر خطا با فیلد، و در متن صفحه با شمارهٔ خط و آغاز همان خط، تا پنل بگوید
 * «خط 10 («کد رهگیری پست…»): …». پیش‌نویس با خطا هم ذخیره می‌شود؛ فقط انتشار بی خطاست. سرور همین را پیش از کد تازه و دوباره پیش از نوشتن
 * می‌سنجد (قاعدهٔ ۲).
 */

import { FAQ_MAX_ITEMS, fieldsOf, readPath, type AnyContent, type ContentKind, type FaqContent, type FieldFormat } from './kinds.js';
import type { BlockIssueCode } from './blocks.js';
import { parseInline, parseMarkdown, type InlineFormat, type MarkdownIssueCode } from './markdown.js';

export type ContentIssueCode =
  | MarkdownIssueCode
  | 'required'
  | 'too_long'
  | 'mobile'
  | 'phone'
  | 'email'
  | 'telegram'
  | 'instagram'
  | 'postal'
  | 'postal_without_address'
  | 'faq_empty'
  /** نوار اعلان (۱۱٫۳، `checkBar`): پیوند درون متن، پررنگ دوم، متن بلندتر از ۹۰ نویسه با عددهای امروز، پیوند به جای دیگر، و پیوند بی متن. */
  | 'bar_link_in_text'
  | 'bar_bold_twice'
  | 'bar_too_long'
  | 'bar_href'
  | 'bar_link_text'
  /** بنر صفحهٔ اصلی (۱۱٫۲، `checkBanner`): پیوند به جای دیگر. */
  | 'banner_href'
  /** صفحه‌های فرود (۱۵٫۲، `checkPage`): شکل نشانی، نام رزرو، نشانی صفحهٔ دیگر، پیوند به صفحه‌ای که روی سایت نیست، و گزینهٔ میزی که تعرفه ندارد. */
  | 'slug_format'
  | 'slug_reserved'
  | 'slug_taken'
  | 'link_not_live'
  | 'desk_option'
  /** بلوک زندهٔ ناشناس یا نادرست (`parseBlock`). */
  | BlockIssueCode;

export interface ContentIssue {
  /** مسیر فیلد (نام فیلد فرم)؛ «items» برای شمار سؤال‌ها. */
  field: string;
  label: string;
  code: ContentIssueCode;
  /** فقط متن صفحه: شمارهٔ خط و آغاز همان خط. */
  line?: number;
  excerpt?: string;
  detail?: string;
  suggestion?: string;
  /** سقف و شمار امروز، برای `too_long`. */
  max?: number;
  length?: number;
  /** شمار با عدد امروز جای‌نگهدارها، نه نوشته (عنوان و توضیح گوگل صفحه‌ها، ۱۵٫۲). */
  measured?: true;
}

/** آغاز یک خط برای خطا: بی نشانهٔ تیتر و فهرست، تا سه واژه، با «…» اگر بیشتر دارد. */
export function lineExcerpt(source: string, line: number): string {
  const text = (source.split('\n')[line - 1] ?? '')
    .trim()
    .replace(/^(#+|[-*•]|\d+[.)]|>+)\s*/, '');
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 3 ? `${words.slice(0, 3).join(' ')}…` : words.join(' ');
}

const length = (value: string) => [...value].length;

/** شکل هر فیلد تماس؛ خالی یعنی نیامدن، نه خطا. */
const SHAPES: Partial<Record<FieldFormat, RegExp>> = {
  mobile: /^09\d{9}$/,
  phone: /^0[1-8]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  telegram: /^[A-Za-z][A-Za-z0-9_]{4,31}$/,
  // اینستاگرام نقطه هم دارد («jozve.yar»)، ولی نه در دو سر و نه دو نقطه پشت‌سرهم.
  instagram: /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9_.]{1,30}$/,
  postal: /^\d{10}$/,
};

export function checkContent(kind: ContentKind, content: AnyContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const faqCount = kind === 'faq' ? (content as FaqContent).items.length : 0;
  if (kind === 'faq' && faqCount === 0) issues.push({ field: 'items', label: 'سؤال‌ها', code: 'faq_empty' });

  for (const spec of fieldsOf(kind, faqCount)) {
    const value = readPath(content, spec.name);
    const at = { field: spec.name, label: spec.label };
    if (!value) {
      if (spec.required) issues.push({ ...at, code: 'required' });
      continue;
    }
    if (length(value) > spec.max) issues.push({ ...at, code: 'too_long', max: spec.max, length: length(value) });
    const shape = SHAPES[spec.format];
    if (shape) {
      if (!shape.test(value)) issues.push({ ...at, code: spec.format as ContentIssueCode, detail: value });
      continue;
    }
    if (spec.format === 'markdown') {
      for (const issue of parseMarkdown(value).issues) issues.push({ ...at, ...issue, excerpt: lineExcerpt(value, issue.line) });
    } else {
      // بقیهٔ قالب‌ها درون‌خطی‌اند (فیلد تماس بالا رفت)؛ خطای فیلد یک‌خطی شمارهٔ خط ندارد.
      for (const { line: _line, ...issue } of parseInline(value, spec.format as InlineFormat).issues) issues.push({ ...at, ...issue });
    }
  }

  if (kind === 'contact') {
    const contact = content as { address: string; postalCode: string };
    if (contact.postalCode && !contact.address) issues.push({ field: 'postalCode', label: 'کد پستی', code: 'postal_without_address' });
  }
  return issues;
}

/** سؤال‌ها از سقف بیشتر نمی‌شوند: فرم «افزودن سؤال» را می‌بندد و ساختن متن بیشتر را کنار می‌گذارد (`contentFromFields`). */
export const faqFull = (content: FaqContent) => content.items.length >= FAQ_MAX_ITEMS;
