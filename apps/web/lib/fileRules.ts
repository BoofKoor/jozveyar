/**
 * قاعده‌های فایل (برش ۸٫۴، سؤال ۱۹۰): خانواده‌های روشن، سقف حجم و سقف صفحهٔ هر فایل، از `settings`. صف جزوه (باندل اولیه) فقط
 * می‌سنجد و کد خطا می‌گذارد (`initialAnalysis`، `jozveController`)؛ متن هر پیام، فهرست فرمت‌ها و `accept` ورودی فایل اینجاست، در
 * رابط پس از فایل و کامپوننت‌های سرور، تا باندل اولیه همان بماند.
 */

import { FILE_FAMILIES, type FileFamily, type FileRules } from '@jozveyar/contracts/files';
import { formatNumber } from '@jozveyar/text';

import { fileKind, type FileKind, type RuleErrorCode } from './analysis-protocol';

/**
 * پسوندهایی که می‌پذیریم — همان فهرست سرور (`KINDS` در `lib/server/uploads.ts`)، که تصمیم آخر با اوست. PDF در مرورگر خوانده می‌شود؛
 * بقیه روی سرور به PDF تبدیل می‌شوند (ADR-028). اینجاست، نه در `analysis-protocol.ts`، چون فقط `accept` (سرور و رابط پس از فایل) لازمش
 * دارد و پوسته نه (۸٫۴).
 */
export const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'jpg', 'jpeg', 'png', 'webp', 'heic'];

/** نام هر خانواده، و نام پسوندهایش در راهنما. */
const FAMILY: Record<FileFamily, { name: string; detail: string }> = {
  word: { name: 'Word', detail: 'Word' },
  slides: { name: 'پاورپوینت', detail: 'پاورپوینت' },
  image: { name: 'عکس', detail: 'عکس (JPG، PNG، WebP، HEIC)' },
};

/** پسوندهای پذیرفته با این خانواده‌های روشن؛ PDF همیشه. */
export function acceptedExtensions(formats: FileRules['formats']): string[] {
  return ACCEPTED_EXTENSIONS.filter((ext) => {
    const kind = fileKind(`f.${ext}`);
    return kind === 'pdf' || (kind !== null && formats[kind]);
  });
}

/** `accept` ورودی فایل: فقط خانواده‌های روشن. */
export function acceptOf(formats: FileRules['formats']): string {
  return acceptedExtensions(formats)
    .map((ext) => `.${ext}`)
    .join(',');
}

/** خانواده‌های روشن، به ترتیب کارت بارگذاری. */
export function enabledFamilies(formats: FileRules['formats']): FileFamily[] {
  return FILE_FAMILIES.filter((family) => formats[family]);
}

/** «الف، ب و ج» یا «الف، ب یا ج». */
function joinFa(parts: readonly string[], last: 'و' | 'یا'): string {
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join('، ')} ${last} ${parts.at(-1)}`;
}

/** «PDF، Word، پاورپوینت و عکس»، یا «فقط PDF»: فرمت‌های پذیرفته، برای سؤال‌ها. */
export function formatNames(formats: FileRules['formats']): string {
  const families = enabledFamilies(formats);
  return families.length === 0 ? 'فقط PDF' : joinFa(['PDF', ...families.map((family) => FAMILY[family].name)], 'و');
}

/** راهنمای فایل ناشناس: فقط آنچه پذیرفته است. */
export function unsupportedHint(formats: FileRules['formats']): string {
  const list = joinFa(['PDF', ...enabledFamilies(formats).map((family) => FAMILY[family].detail)], 'یا');
  return `${list} بینداز. اگر جزوه با برنامهٔ دیگری ساخته شده، از همان برنامه خروجی PDF بگیر.`;
}

/** خانوادهٔ خاموش: «فایل Word فعلاً پذیرفته نمی‌شود»، با راه جلو. */
export function formatOffText(kind: FileKind | null): { title: string; hint: string } {
  switch (kind) {
    case 'word':
      return { title: 'فایل Word فعلاً پذیرفته نمی‌شود', hint: 'از Word خروجی PDF بگیر و همان را جایش بینداز.' };
    case 'slides':
      return { title: 'فایل پاورپوینت فعلاً پذیرفته نمی‌شود', hint: 'از پاورپوینت خروجی PDF بگیر و همان را جایش بینداز.' };
    case 'image':
      return { title: 'عکس فعلاً پذیرفته نمی‌شود', hint: 'عکس‌ها را در یک فایل PDF بگذار و همان را جایش بینداز.' };
    default:
      return { title: 'این نوع فایل فعلاً پذیرفته نمی‌شود', hint: 'از برنامه‌اش خروجی PDF بگیر و همان را جایش بینداز.' };
  }
}

/** مگابایت فایل، گرد به بالا: فایلی که از سقف بیشتر است هرگز «همان سقف» دیده نمی‌شود. */
export function megabytes(bytes: number): number {
  return Math.ceil(bytes / 1048576);
}

/** پیام فایلی که قاعده‌های فایل نمی‌پذیرند (مثل طرح میز، سؤال ۲۲۳)، با عدد خود فایل و سقف همین لحظه. */
export function ruleErrorText(
  code: RuleErrorCode,
  file: { kind: FileKind | null; size: number; pageCount: number },
  rules: FileRules,
): { title: string; hint: string } {
  switch (code) {
    case 'format_off':
      return formatOffText(file.kind);
    case 'too_large':
      return {
        title: `هر فایل تا ${formatNumber(rules.maxMb)} مگابایت پذیرفته می‌شود`,
        hint: `این فایل ${formatNumber(megabytes(file.size))} مگابایت است. با کیفیت کمتر ذخیره‌اش کن، یا دو تکه‌اش کن و هر دو را بینداز؛ با هم یک جزوه می‌شوند.`,
      };
    case 'too_many_pages':
      return {
        title: `هر فایل تا ${formatNumber(rules.maxPages)} صفحه پذیرفته می‌شود`,
        hint: `این فایل ${formatNumber(file.pageCount)} صفحه است. دو تکه‌اش کن و هر دو را بینداز؛ با هم یک جزوه می‌شوند.`,
      };
  }
}

/** کدهای قاعده‌های فایل، و فایل ناشناس: «پذیرفته نشد»، نه «خوانده نشد». */
export const REFUSED_CODES: ReadonlySet<string> = new Set(['format_off', 'too_large', 'too_many_pages', 'unsupported_type']);

export function isRuleError(code: string): code is RuleErrorCode {
  return code === 'format_off' || code === 'too_large' || code === 'too_many_pages';
}
