/**
 * نظر مشتری (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): آنچه فرم صفحهٔ سفارش، سرور و صفحهٔ اصلی با هم دارند. خالص و بی وابستگی؛ تکهٔ صفحهٔ سفارش و
 * سرور هر دو می‌خوانندش، و پوسته هرگز.
 */

/** بلندترین متن نظر، همان CHECK `order_reviews_body` (0051). */
export const REVIEW_BODY_MAX = 500;

/** نمره‌ها و نام هر کدام، از بد به خوب؛ کاشی‌های فرم و صفحهٔ اصلی همین را دارند. */
export const RATINGS = [
  { value: 1, label: 'خیلی بد' },
  { value: 2, label: 'بد' },
  { value: 3, label: 'معمولی' },
  { value: 4, label: 'خوب' },
  { value: 5, label: 'عالی' },
] as const;

export const ratingLabel = (rating: number) => RATINGS.find((r) => r.value === rating)?.label ?? '';

/** پیشوندی که بی نام بعدش نام کوچک نیست: «سید علی رضایی» روی سایت «سید علی» است، نه «سید». */
const PREFIXES = new Set(['سید', 'سیده', 'میر']);

/**
 * نام کوچک گیرنده برای صفحهٔ اصلی (سؤال ۲۱۳): اولین کلمهٔ نام، و با پیشوند دو کلمه؛ نام خانوادگی هرگز. نیم‌فاصله جزو کلمه است
 * («محمدرضا» با نیم‌فاصله یک کلمه است).
 */
export function firstNameOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return '';
  return PREFIXES.has(words[0]!) && words.length > 2 ? `${words[0]} ${words[1]}` : words[0]!;
}
