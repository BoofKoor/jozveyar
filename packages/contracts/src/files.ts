/**
 * قاعده‌های فایل (برش ۸٫۴، سؤال ۱۹۰): خانواده‌های روشن، سقف حجم و سقف صفحهٔ هر فایل. ماژول جدا، بی zod، تا مرورگر فقط در رابط پس از فایل
 * بیاوردش: پوسته فقط `type FileRules` را می‌خواهد، و هر مقداری که در `constants.ts` باشد، چون پوسته از آن ماژول چیزی می‌خواهد، به
 * باندل اولیه می‌رود.
 */

/**
 * خانواده‌های فایلی که مالک از «تنظیمات» روشن و خاموش می‌کند (برش ۸٫۴، سؤال ۱۹۰): Word (doc و docx)، پاورپوینت (ppt و pptx) و
 * عکس (jpg، png، webp و heic). PDF همیشه پذیرفته است و کلید ندارد. نام‌ها همان `FileKind` مرورگرند.
 */
export const FILE_FAMILIES = ['word', 'slides', 'image'] as const;
export type FileFamily = (typeof FILE_FAMILIES)[number];

/** بزرگ‌ترین سقف حجم هر فایل که مالک می‌گذارد، مگابایت (هر مگابایت ۱٬۰۴۸٬۵۷۶ بایت)؛ همان سقف پیش از ۸٫۴. */
export const FILE_MAX_MB_LIMIT = 1536;
/** بزرگ‌ترین سقف صفحهٔ هر فایل که مالک می‌گذارد. */
export const FILE_MAX_PAGES_LIMIT = 1500;

/**
 * قاعده‌های فایل (برش ۸٫۴): مرورگر همان لحظهٔ انداختن می‌سنجد و سرور دوباره (قاعدهٔ ۲). از `settings` می‌آیند
 * (`file.formats`، `file.max_mb`، `file.max_pages`) و صفحهٔ اصلی با ISR به پوسته می‌دهدشان.
 */
export interface FileRules {
  formats: Record<FileFamily, boolean>;
  maxMb: number;
  maxPages: number;
}

/** پیش‌فرض: همهٔ خانواده‌ها روشن، و بزرگ‌ترین سقف‌ها. build و سرور بی پایگاه داده همین را دارند. */
export const DEFAULT_FILE_RULES: FileRules = {
  formats: { word: true, slides: true, image: true },
  maxMb: FILE_MAX_MB_LIMIT,
  maxPages: FILE_MAX_PAGES_LIMIT,
};
