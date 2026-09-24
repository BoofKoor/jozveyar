/**
 * عددهای سیستم طراحی که کد TypeScript لازم دارد. هر کدام آینهٔ جای دیگری است و
 * tokens.test.ts با همان‌جا می‌سنجدش.
 */

/** زمینهٔ صفحه، برای `themeColor` (نوار مرورگر گوشی). برابر `--color-page` در theme.css، یعنی green-50. */
export const PAGE_COLOR = '#F2F7EE';

/** اندازهٔ ذاتی لوگوی بی‌شعار، از viewBox خود فایل. */
export const LOGO_BOX = { width: 395, height: 435 } as const;

/** اندازهٔ ذاتی نشان، از viewBox خود فایل. */
export const MARK_BOX = { width: 203, height: 288.83 } as const;

/**
 * کمینهٔ ارتفاع، از قاعدهٔ راهنما: نشان از ۳۲ پیکسل به بالا. نشانِ لوگوی بی‌شعار حدود ۶۴٪
 * ارتفاع آن است، پس لوگو زیر حدود ۵۰ پیکسل نمی‌رود (docs/brand/README.md).
 */
export const LOGO_MIN_HEIGHT = 50;
export const MARK_MIN_HEIGHT = 32;
