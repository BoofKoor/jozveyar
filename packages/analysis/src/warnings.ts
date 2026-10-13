/**
 * هشدارهای یک سند برای کسی که چاپش می‌کند (ADR-029؛ از ۸٫۱ کیفیت اسکن و حاشیه فقط در پنل: سؤال ۱۸۱، ADR-053).
 *
 * تحلیل هر صفحه هشدارش را با خودش ذخیره می‌کند (`document_pages.warnings`)؛ اینجا فقط شمارهٔ صفحه‌های هر هشدار جمع
 * می‌شود، با همان دو قاعدهٔ نمایش ADR-029: حاشیهٔ اسلاید هشدار نیست، و نام فونت از داخل فایل کاربر فقط رشتهٔ کوتاه است.
 * مشتری از ۸٫۱ فقط «صفحهٔ خالی» و «فونت جایگزین» را می‌بیند (`apps/web`)، چون هر دو دربارهٔ پول‌اند؛ پنل همه را
 * (`apps/admin`). جدا از `index.ts` است چون فقط سرور و پنل می‌خواهندش، نه کارگر تحلیل مرورگر.
 */

import { isSlidePage } from './index';

/** صفحهٔ تحلیل‌شده، فقط آنچه هشدار لازم دارد. */
export interface WarningPage {
  /** شمارهٔ صفحه، ۱-مبنا. */
  n: number;
  widthPt: number;
  heightPt: number;
  blank: boolean;
  warnings: readonly string[];
}

/** شمارهٔ صفحه‌های هر هشدار یک سند، از ۱ و به ترتیب صفحه‌ها. */
export interface PageWarnings {
  blank: number[];
  lowDpi: number[];
  /** بی صفحه‌های اسلاید: اسلاید برای چاپ کوچک می‌شود و لبه‌اش لبهٔ کاغذ نیست (ADR-029). */
  tightMargin: number[];
}

/** پاورپوینت یا ارائهٔ ODF، به نام فرمت کارگر (`documents.conversion.format`) یا نوع سند. */
const DECK_FORMATS = new Set(['pptx', 'ppt', 'odp']);

/** شکل ستون `documents.conversion` که این‌جا لازم است (کارگر می‌نویسدش، ADR-028). */
interface ConversionRecord {
  format?: unknown;
  fonts?: { mismatched?: unknown };
}

const conversionOf = (conversion: unknown): ConversionRecord | null =>
  conversion !== null && typeof conversion === 'object' ? (conversion as ConversionRecord) : null;

/**
 * اسلاید: فایلی که کارگر پاورپوینت (یا ارائهٔ ODF) تشخیص داد، یا تا تبدیل نشده نوعش این را می‌گوید. حاشیه‌اش حساب و
 * ذخیره می‌شود، ولی هشدار نمی‌شود (ADR-029).
 */
export function isDeck(conversion: unknown, sourceKind: string): boolean {
  const format = conversionOf(conversion)?.format;
  return DECK_FORMATS.has(typeof format === 'string' ? format : sourceKind);
}

/** صفحه‌های هر هشدار؛ حاشیهٔ تنگ نه برای اسلاید (`deck`) و نه برای صفحه‌ای که شکل اسلاید دارد (`isSlidePage`). */
export function pageWarnings(pages: Iterable<WarningPage>, deck: boolean): PageWarnings {
  const found: PageWarnings = { blank: [], lowDpi: [], tightMargin: [] };
  for (const page of pages) {
    if (page.blank) found.blank.push(page.n);
    if (page.warnings.includes('low_dpi')) found.lowDpi.push(page.n);
    if (page.warnings.includes('tight_margin') && !deck && !isSlidePage(page.widthPt, page.heightPt)) {
      found.tightMargin.push(page.n);
    }
  }
  return found;
}

/** همان سقف کارگر برای فونت‌های خواسته‌شده (`formats.requested_fonts`). */
const MAX_FONTS = 50;
/** و همان سقف نام: نام از داخل فایل کاربر می‌آید. */
const MAX_FONT_NAME = 60;

/**
 * فونت‌هایی که روی سرور نبودند و جایگزینشان اندازهٔ دیگری دارد (ADR-029): ظاهر و تعداد صفحه ممکن است با فایل خود کاربر
 * فرق کند. نام از داخل فایل کاربر می‌آید: فقط رشته، کوتاه، و نه بی‌شمار.
 */
export function mismatchedFonts(conversion: unknown): string[] {
  const names = conversionOf(conversion)?.fonts?.mismatched;
  if (!Array.isArray(names)) return [];
  return names
    .filter((name): name is string => typeof name === 'string' && name.trim() !== '')
    .slice(0, MAX_FONTS)
    .map((name) => name.trim().slice(0, MAX_FONT_NAME));
}
