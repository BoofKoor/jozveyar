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
  /**
   * تعطیلی‌ها تا پایان این سال شمسی با تقویم رسمی منتشرشده تطبیق داده شده‌اند؛ تاریخ قمری سال‌های بعد پیش‌بینی است و پنل
   * تا تطبیقشان هشدار می‌دهد (برش ۴٫۶).
   */
  'calendar.official_through': z.number().int().min(1400).max(1500),
  /** سقف کد پیامکی در ساعت برای کل سایت (ADR-033)؛ جلوی «پیامک‌سازی» با شماره‌ها و IPهای زیاد. */
  'otp.site_hourly_limit': z.number().int().min(1).max(100_000),
  /**
   * فایل‌های سفارش (PDF جزوه، فایل‌های چاپ و برگه) چند روز پس از «تحویل پست شد» یا «لغو شد» پاک می‌شوند (ADR-044). کمتر از
   * یک هفته فرصت چاپ دوبارهٔ بستهٔ گم‌شده را می‌برد، و بیش از یک سال فقط دیسک است. کارگر همین بازه را می‌سنجد
   * (`services/docworker/docworker/retention.py`) و مقدار بیرون از آن را به کار نمی‌برد: هیچ فایلی پاک نمی‌شود.
   */
  'order.files_retention_days': z.number().int().min(7).max(365),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
