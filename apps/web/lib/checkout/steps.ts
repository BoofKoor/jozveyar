/**
 * قدم‌های سفارش در همان صفحهٔ اصلی (ADR-034): «جزوه و قیمت»، و بعد آدرس (شهر و نشانی) و پرداخت. هر قدم
 * یک خانه در تاریخچهٔ مرورگر است، پس «برگشت» گوشی قدم قبل را می‌آورد.
 *
 * جدا از `store.ts`، چون پوستهٔ رابط پس از فایل (`OrderDesk`) فقط همین را لازم دارد و مسیر خرید تکهٔ
 * تنبل خودش است.
 */

export type Step = 'desk' | 'city' | 'address' | 'pay';

const STEPS: ReadonlySet<string> = new Set<Step>(['desk', 'city', 'address', 'pay']);

export const isStep = (value: unknown): value is Step => typeof value === 'string' && STEPS.has(value);

/** شمارهٔ قدم در «۱ جزوه و قیمت ← ۲ آدرس ← ۳ پرداخت». */
export const flowNumber = (step: Step): 1 | 2 | 3 => (step === 'desk' ? 1 : step === 'pay' ? 3 : 2);
