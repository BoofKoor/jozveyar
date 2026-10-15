/**
 * شکل تنظیم‌های جدول `settings` که کد می‌خواند — «کلید/مقدار تایپ‌شده با zod» (ARCHITECTURE، بخش ۵).
 *
 * ستون `value` از نوع jsonb است و هر چیزی را می‌پذیرد؛ ادمین (برش ۴) یا دست خطاکار می‌تواند شکلش را
 * خراب کند. کد مقدار را همیشه با همین اسکیماها می‌خواند: مقدار خراب به پیش‌فرض برمی‌گردد و بلند لاگ
 * می‌شود، نه اینکه وسط پرداخت یک سفارش واقعی بترکد.
 */

import { z } from 'zod';
import { FILE_MAX_MB_LIMIT, FILE_MAX_PAGES_LIMIT } from './files.js';

/** یک تعطیلی رسمی: تاریخ شمسی به شکل `formatJalaliNumeric` (`1405/10/02`). */
export const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/),
  title: z.string(),
});
export type Holiday = z.infer<typeof holidaySchema>;

/** بیشترین شمار مرز بازه‌های وزن گزارش ارسال (برش ۶٫۴): هشت مرز، نه بازه. */
export const REPORT_BOUNDS_MAX = 8;
/** بزرگ‌ترین مرز، گرم (صد کیلو)؛ بیشتر یعنی صفر اضافه. */
export const REPORT_BOUND_MAX_GRAMS = 100_000;

/** مرزهای بازه‌های وزن گزارش: گرم، صعودی، بی تکرار. */
const reportBoundsSchema = z
  .array(z.number().int().min(1).max(REPORT_BOUND_MAX_GRAMS))
  .min(1)
  .max(REPORT_BOUNDS_MAX)
  .refine((bounds) => bounds.every((grams, i) => i === 0 || grams > bounds[i - 1]!), { message: 'مرزها صعودی نیستند' });

/** شناسهٔ گزینهٔ تعرفه (کاغذ یا صحافی)، همان قاعدهٔ ویرایشگر پنل (`OPTION_ID`). */
const optionIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/);

/**
 * گزینه‌های تعرفهٔ فعال که موقتاً در دسترس نیستند (برش ۸٫۴، سؤال ۱۸۸). A4 در شکل هم نیست، و کاغذ و صحافی پیش‌فرض را خواننده
 * (`pausedOf` موتور قیمت) نادیده می‌گیرد: هر جزوه همیشه کاغذ و صحافی‌ای دارد.
 */
export const catalogPausedSchema = z.object({
  sizes: z.array(z.enum(['a5', 'a3'])),
  papers: z.array(optionIdSchema),
  bindings: z.array(optionIdSchema),
});
export type CatalogPaused = z.infer<typeof catalogPausedSchema>;

/** مخاطب مسیر خرید در `live` (برش ۷٫۵، ADR-052)، به ترتیب نردبان: متوقف ← پیش‌نمایش مالک ← همه. */
export const CHECKOUT_AUDIENCES = ['paused', 'preview', 'everyone'] as const;
export type CheckoutAudience = (typeof CHECKOUT_AUDIENCES)[number];

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
   * سقف کد پیامکی در ۲۴ ساعت گذشته برای کل سایت (برش ۷، ADR-049): ترمز آخر هزینهٔ پیامک در برابر ربات، پنجرهٔ لغزان (سؤال ۱۳۳).
   * بدترین هزینهٔ روزانهٔ کد = همین × قیمت یک تکه.
   */
  'otp.site_daily_limit': z.number().int().min(1).max(1_000_000),
  /**
   * هشدار پیشخوان وقتی اعتبار sms.ir کمتر از این‌قدر روز مصرف است (برش ۷، ADR-049، سؤال ۱۳۷): روز، نه مبلغ، چون واحد اعتبار sms.ir
   * هنوز در مستندی دیده نشده و «چند روز دیگر» به واحد بند نیست.
   */
  'sms.credit_alert_days': z.number().int().min(1).max(90),
  /**
   * فایل‌های سفارش (PDF جزوه، فایل‌های چاپ و برگه) چند روز پس از «تحویل پست شد» یا «لغو شد» پاک می‌شوند (ADR-044). کمتر از
   * یک هفته فرصت چاپ دوبارهٔ بستهٔ گم‌شده را می‌برد، و بیش از یک سال فقط دیسک است. کارگر همین بازه را می‌سنجد
   * (`services/docworker/docworker/retention.py`) و مقدار بیرون از آن را به کار نمی‌برد: هیچ فایلی پاک نمی‌شود.
   */
  'order.files_retention_days': z.number().int().min(7).max(365),
  /**
   * بازه‌های وزن گزارش ارسال (برش ۶٫۴، ADR-048، تصمیم ۱۰۱): مرزها به گرم، صعودی؛ `[1000, 3000]` یعنی زیر 1 کیلو، 1 تا 3
   * کیلو و بالای 3 کیلو، و هر بازه از مرز پایینش، مثل بازه‌های کرایهٔ تعرفه. `'tariff'` (پیش‌فرض) یعنی همان بازه‌های کرایهٔ
   * تعرفهٔ فعال، که با هر نسخهٔ تازه همراه می‌شود. فقط گزارش را می‌چیند: قیمت، کرایه و تعرفه را دست نمی‌زند (قاعدهٔ ۶).
   */
  'report.weight_bands': z.union([z.literal('tariff'), reportBoundsSchema]),
  /**
   * مخاطب مسیر خرید وقتی `.env` سرور `CHECKOUT_MODE=live` می‌خواهد (برش ۷٫۵، ADR-052): `paused` (متوقف: سفارش تازه نه؛ برگشت از درگاه و
   * استعلام کار می‌کنند)، `preview` (فقط مرورگری که پیوند پیش‌نمایش مالک را باز کرد) یا `everyone`. `.env` توانایی را می‌گوید و این مخاطب را؛
   * در `off` و `mock` خوانده نمی‌شود. فقط مالک از «تنظیمات» عوضش می‌کند: بالا بردن با کد تازه، پایین آوردن بی کد و همان لحظه.
   */
  'checkout.audience': z.enum(CHECKOUT_AUDIENCES),
  /**
   * خانواده‌های فایلی که پذیرفته می‌شوند (برش ۸٫۴، سؤال ۱۹۰)؛ PDF همیشه. خانوادهٔ خاموش همان لحظهٔ انداختن پیام روشن می‌گیرد و
   * سرور آپلود تازه‌اش را با `format_off` رد می‌کند. فایلی که پیش از خاموش شدن رسیده دست نمی‌خورد.
   */
  'file.formats': z.object({ word: z.boolean(), slides: z.boolean(), image: z.boolean() }),
  /** سقف حجم هر فایل، مگابایت (برش ۸٫۴)؛ مرورگر همان لحظه می‌سنجد و سرور در آپلود دوباره. */
  'file.max_mb': z.number().int().min(1).max(FILE_MAX_MB_LIMIT),
  /** سقف صفحهٔ هر فایل (برش ۸٫۴)؛ مرورگر با شمارش خودش یا سرور، و سرور در ثبت سفارش دوباره. */
  'file.max_pages': z.number().int().min(1).max(FILE_MAX_PAGES_LIMIT),
  /**
   * در دسترس بودن زندهٔ گزینه‌های تعرفهٔ فعال (برش ۸٫۴، سؤال ۱۸۸): مالک یا متصدی بی نسخهٔ تازه موقتاً خاموش و روشن می‌کنند،
   * از «تعرفه»، با رویداد `tariff.availability`. قیمت را دست نمی‌زند؛ سایت همراه JSON تعرفه می‌گیردش و سرور گزینهٔ خاموش را
   * با ۴۰۹ `option_unavailable` رد می‌کند.
   */
  'catalog.paused': catalogPausedSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;
