/**
 * شکل تنظیم‌های جدول `settings` که کد می‌خواند — «کلید/مقدار تایپ‌شده با zod» (ARCHITECTURE، بخش ۵).
 *
 * ستون `value` از نوع jsonb است و هر چیزی را می‌پذیرد؛ ادمین (برش ۴) یا دست خطاکار می‌تواند شکلش را
 * خراب کند. کد مقدار را همیشه با همین اسکیماها می‌خواند: مقدار خراب به پیش‌فرض برمی‌گردد و بلند لاگ
 * می‌شود، نه اینکه وسط پرداخت یک سفارش واقعی بترکد.
 */

import { z } from 'zod';

/** یک تعطیلی رسمی: تاریخ شمسی به شکل `formatJalaliNumeric` (`1405/10/02`). */
export const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/),
  title: z.string(),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const SETTING_SCHEMAS = {
  /** روز کاری تا تحویل به پست (ADR-013). */
  'order.sla_days': z.number().int().min(1).max(30),
  /** تعطیلی‌های رسمی؛ روز کاری تحویل به پست آنها را نمی‌شمارد (ADR-034). */
  'calendar.holidays': z.array(holidaySchema),
  /** سقف کد پیامکی در ساعت برای کل سایت (ADR-033)؛ جلوی «پیامک‌سازی» با شماره‌ها و IPهای زیاد. */
  'otp.site_hourly_limit': z.number().int().min(1).max(100_000),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
