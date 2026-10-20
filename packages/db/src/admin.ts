/**
 * پنل ادمین در پایگاه داده (برش ۴، ADR-037 و ADR-038): ادمین‌ها، پیوند ثبت یک‌باره، نشست، تلاش‌های ورود،
 * نقش‌ها و رویدادها.
 *
 * مثل `auth.ts` فقط ذخیره و خواندن است، بی تصمیم: سقف‌ها، مهلت‌ها، رمز و کد در سرویس ورود پنل
 * (`apps/admin/lib/server/auth.ts`) گرفته می‌شوند تا با پیاده‌سازی حافظه‌ای هم تست شوند. آنچه اینجاست همان
 * است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **اتمی:** فرصت سنجش (`claimAttempt`) و مصرف گام کد (`claimTotpStep`) هر کدام یک `UPDATE`اند؛ دو
 *    درخواست هم‌زمان نه یک کد را دو بار می‌پذیرند، نه از سقف اشتباه می‌گذرند.
 *  - **یک تراکنش:** کاری که رویداد دارد، رویدادش را در همان تراکنش می‌نویسد؛ کار بی رد نمی‌ماند.
 *  - **یک قفل:** ساختن، غیرفعال کردن و از ۹٫۴ عوض کردن نقش ادمین زیر یک قفل مشورتی، تا «آخرین مالک» و «نام تکراری» مسابقه ندهند.
 */

import { and, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';

import type { Database } from './index.js';
import {
  adminEvents,
  adminInvites,
  adminLoginAttempts,
  adminSessions,
  adminUserRoles,
  adminUsers,
  cities,
  permissions,
  printPartners,
  rolePermissions,
  roles,
} from './schema.js';

/** کلید قفل مشورتی ساختن، غیرفعال کردن و عوض کردن نقش ادمین: «adm» به عدد. */
const ADMIN_LOCK = 0x61646d;

/**
 * مجوزها. کد با همین نام‌ها می‌سنجد؛ `seedReferenceData` همین‌ها را در `permissions` می‌نشاند. هر برش
 * مجوز خودش را اینجا دارد، حتی اگر صفحه‌اش هنوز ساخته نشده، تا نقش‌ها از روز اول کامل باشند.
 */
export const ADMIN_PERMISSIONS = {
  'orders.read': 'دیدن سفارش‌ها',
  /** «شروع چاپ» و «تحویل پست شد»؛ از ۵٫۳ لغو مجوز خودش را دارد (`orders.cancel`). */
  'orders.status': 'تغییر وضعیت سفارش',
  /** لغو سفارش با دلیل (برش ۵٫۳، ADR-042): مالک و متصدی، نه چاپخانه. */
  'orders.cancel': 'لغو سفارش',
  /** برگرداندن وضعیت اشتباه، یک قدم، با دلیل: فقط مالک (سؤال ۲۶، ADR-038؛ ۴٫۳). */
  'orders.revert': 'برگرداندن وضعیت سفارش',
  'orders.address': 'ویرایش نشانی گیرنده',
  /**
   * یادداشت داخلی سفارش (برش ۹٫۳، ADR-058؛ سؤال ۱۹۵): نوشتن، و دیدن همهٔ یادداشت‌ها با «چاپخانه هم ببیند» یا بی آن. مالک، متصدی و از ۹٫۴
   * حسابدار. چاپخانه این مجوز را ندارد و فقط یادداشتی را می‌بیند که «چاپخانه هم ببیند» دارد، روی سفارش‌های خودش (`orders.read` و محدوده).
   */
  'orders.notes': 'یادداشت داخلی سفارش',
  /**
   * جابه‌جایی چاپخانهٔ سفارش، فقط در «در صف چاپ»، با دلیل (برش ۵٫۲، ADR-042): مالک و متصدی. از ۷٫۶ دیدن پیامک سفارش تازهٔ چاپخانه و
   * «دوباره بفرست»ش هم (سؤال ۱۷۲)؛ چاپخانه هرگز.
   */
  'orders.assign': 'جابه‌جایی چاپخانهٔ سفارش',
  /**
   * مبلغ و پرداخت‌های سفارش (برش ۵٫۳، ADR-042): مالک، متصدی و از ۹٫۴ حسابدار؛ چاپخانه چاپ و ارسال را بی مبلغ می‌کند. «استعلام از درگاه»
   * پرداخت و بازپرداخت، و هشدارهای پول و پیامک پیشخوان، با همین.
   */
  'orders.money': 'دیدن مبلغ و پرداخت‌ها',
  /**
   * بازپرداخت سفارش لغوشده، از درگاه یا ثبت دستی، با کد تازه (برش ۷٫۳، ADR-051): مالک، و از ۹٫۴ حسابدار (سؤال ۱۹۷)؛ پول جابه‌جا می‌کند،
   * پس متصدی نه. «استعلام» بازپرداخت در جریان با `orders.money` است.
   */
  'orders.refund': 'بازپرداخت سفارش لغوشده',
  'files.download': 'دانلود PDF جزوه',
  'tariff.read': 'دیدن تعرفه',
  'tariff.edit': 'ساختن و فعال کردن تعرفه',
  /**
   * گزینه‌ای از تعرفهٔ فعال (اندازه، کاغذ یا صحافی) را موقتاً خاموش یا دوباره روشن کردن، بی نسخهٔ تازه و بی دست زدن به قیمت (برش
   * ۸٫۴، سؤال ۱۸۸): مالک و متصدی.
   */
  'tariff.pause': 'خاموش موقت گزینه‌های تعرفه',
  'settings.edit': 'تنظیمات',
  'secrets.edit': 'کلیدهای سرویس‌ها',
  /**
   * قالب برگه‌ها (برش ۹٫۲، ADR-057): بارگذاری نسخهٔ تازهٔ قالب HTML بیجک و برگهٔ اول، پیش‌نمایش، و فعال کردن با کد تازه یا برگشت به
   * قالب پیش‌فرض. فقط مالک: برگهٔ همهٔ سفارش‌های «در صف چاپ» را از نو می‌سازد.
   */
  'templates.manage': 'قالب برگه‌ها',
  /** زبانهٔ «چاپخانه‌ها»: افزودن، ویرایش، پیش‌فرض و غیرفعال کردن (برش ۵٫۲): فقط مالک. */
  'partners.manage': 'چاپخانه‌ها',
  /**
   * در دسترس بودن چاپخانه: «باز»، «شلوغ» یا «تعطیل از … تا …» با یادداشت (برش ۱۰٫۱، سؤال ۲۰۰)، و کارت «چاپخانه‌ها»ی پیشخوان. مالک و
   * متصدی برای هر چاپخانه، کاربر چاپخانه فقط برای خودش (محدوده). بی کد تازه: برگشت‌پذیر است و فقط سفارش‌های بعدی را جابه‌جا می‌کند.
   */
  'partners.availability': 'در دسترس بودن چاپخانه',
  /**
   * زبانهٔ «ارسال»: بارگذاری فایل پست، پیش‌نمایش، «ثبت» و «دور بینداز» (برش ۶٫۱، ADR-046): مالک و متصدی؛ از ۶٫۲ کاربر چاپخانه
   * هم، فقط فایل خودش و فقط برای سفارش‌های چاپخانهٔ خودش.
   */
  'shipments.import': 'ورود فایل پست',
  /** صف تأیید: «همین است»، «هیچ‌کدام» و دادن دستی کد رهگیری به سفارش (برش ۶٫۲، ADR-046): مالک و متصدی، نه چاپخانه. */
  'shipments.review': 'صف تأیید فایل پست',
  /** برگرداندن کل یک ورود فایل پست (۶٫۱) و کنار گذاشتن یک کد رهگیری (۶٫۲)، با دلیل (ADR-045): فقط مالک. */
  'shipments.revert': 'برگرداندن ورود فایل پست و کنار گذاشتن کد رهگیری',
  /**
   * گزارش حاشیهٔ ارسال (برش ۶٫۴، ADR-048): کرایهٔ منجمد مشتری در برابر کرایه و مالیاتی که پست گرفت. مالک، و از ۹٫۴ حسابدار (سؤال ۱۹۷):
   * حاشیه راز کسب‌وکار است، و متصدی و چاپخانه لازمش ندارند. عوض کردن بازه‌های وزن گزارش `settings.edit` هم می‌خواهد.
   */
  'reports.read': 'گزارش ارسال',
  /**
   * گزارش تولید (برش ۱۰٫۲، ADR-061، سؤال ۲۰۱): سفارش، جزوه، فایل، نسخه، صفحه، برگ، صحافی و اندازه در یک بازه، با خروجی اکسل و PDF. مالک و
   * حسابدار همهٔ چاپخانه‌ها و با مبلغ؛ کاربر چاپخانه فقط سفارش‌های خودش (محدوده) و بی مبلغ (`orders.money` ندارد). متصدی نه (سؤال ۲۰۱).
   */
  'reports.production': 'گزارش تولید',
  /**
   * تسویهٔ چاپخانه‌ها (برش ۱۰٫۳، ADR-069، سؤال ۳۹۹): دیدن صورت‌حساب (سهم منجمد سفارش‌ها، پرداخت‌ها، اصلاح‌ها و مانده) و خروجی‌اش. مالک و حسابدار همهٔ
   * چاپخانه‌ها و با مبلغ سفارش؛ کاربر چاپخانه فقط صورت‌حساب خودش (محدوده) و بی مبلغ مشتری. متصدی نه.
   */
  'settlements.read': 'دیدن تسویهٔ چاپخانه‌ها',
  /** ثبت پرداخت به چاپخانه و اصلاح، و باطل کردن، با کد تازه (سؤال ۳۹۶): مالک و حسابدار (سؤال ۱۹۷). */
  'settlements.manage': 'ثبت پرداخت و اصلاح تسویه',
  /**
   * موجودی کاغذ (برش ۱۰٫۴، ADR-070، سؤال‌های ۲۰۴ و ۴۱۵): دیدن قلم‌ها با موجودی، نیاز صف و ردیف‌ها، و هشدار پیشخوان. مالک و متصدی همهٔ
   * چاپخانه‌ها، و کاربر چاپخانه فقط چاپخانهٔ خودش (محدوده). حسابدار نه.
   */
  'inventory.read': 'دیدن موجودی کاغذ',
  /** شروع پیگیری کاغذ تازه، ورود، ضایعات، شمارش و آستانه (سؤال ۴۰۹)؛ همان سه نقش با همان محدوده، بی کد تازه: کاغذ است، نه پول. */
  'inventory.manage': 'ثبت موجودی کاغذ',
  /**
   * کدهای تخفیف (برش ۱۱٫۴، ADR-062، سؤال ۳۰۲): ساختن، عوض کردن شرط‌ها و روز و سقف‌ها، و روشن و خاموش؛ فقط مالک. پلهٔ تخفیف سفارش بزرگ
   * جزو تعرفه است (`tariff.edit`).
   */
  'discounts.manage': 'ساختن و عوض کردن کد تخفیف',
  /** دیدن کدهای تخفیف با شمار استفاده و سفارش‌هایشان (سؤال ۳۰۲): مالک و حسابدار. */
  'discounts.read': 'دیدن کدهای تخفیف',
  /**
   * مسدود کردن موبایل مشتری با دلیل، رفع مسدودی، و فهرست شماره‌های مسدود (برش ۱۲٫۲، ADR-063، سؤال ۲۱۲): مالک و متصدی. بی کد تازه:
   * برگشت‌پذیر است و فقط کد پیامکی، سفارش تازه و تلاش پرداخت تازه را می‌بندد.
   */
  'customers.block': 'مسدود کردن موبایل مشتری',
  /**
   * نظر مشتری‌ها (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): دیدن، روی سایت گذاشتن، پنهان کردن و پاک کردن؛ فقط مالک. بی کد تازه: نظر حرف مشتری است و
   * پولی جابه‌جا نمی‌کند، و پاک کردن یک تأیید جدا دارد.
   */
  'reviews.manage': 'نظر مشتری‌ها',
  /**
   * پشتیبانی (برش ۱۲٫۱، ADR-068، سؤال‌های ۲۱۱ و ۳۱۳): صندوق پیام مشتری‌ها، پاسخ (با پیامک پاسخ)، بستن گفت‌وگو و «دوباره بفرست» پیامک پاسخ؛
   * مالک و متصدی، نه حسابدار و چاپخانه. بی کد تازه: پاسخ کار روزانه است و پولی جابه‌جا نمی‌کند.
   */
  'support.reply': 'پیام‌های پشتیبانی',
  /**
   * متن‌های سایت (برش ۱۱٫۱، ADR-065، سؤال ۲۸۲): صفحهٔ اصلی، سؤال‌ها، قوانین، حریم خصوصی، دربارهٔ ما، و تماس و پاورقی؛ پیش‌نویس، انتشار با کد
   * تازه و برگرداندن. فقط مالک: متن سایت به نام جزوه‌یار با مشتری حرف می‌زند. از ۱۱٫۲ لوگو هم (ADR-067): همان هویت سایت، با کد تازه.
   */
  'content.edit': 'متن‌ها و لوگوی سایت',
  /**
   * نوار اعلان بالای سربرگ سایت (برش ۱۱٫۳، ADR-066، سؤال ۲۸۲): خاموش، همیشه یا در بازه، متن و پیوند. مالک و متصدی؛ روشن کردن و هر تغییر نوار
   * روشن با کد تازه، خاموش کردن بی کد (سؤال ۲۸۷). از ۱۱٫۲ بنر صفحهٔ اصلی هم (ADR-067)، با همان قاعدهٔ کد.
   */
  'content.bar': 'نوار اعلان و بنر',
  'admins.manage': 'ادمین‌ها',
  'events.read': 'رویدادها',
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

const ALL_PERMISSIONS = Object.keys(ADMIN_PERMISSIONS) as AdminPermission[];

/**
 * نقش‌ها (تصمیم ۱۴۰۵/۰۷/۰۴): مالک همه‌چیز، از ۶٫۴ گزارش ارسال، از ۷٫۳ بازپرداخت، از ۹٫۲ قالب برگه‌ها، از ۱۲٫۳ نظر مشتری‌ها و از ۱۱٫۱ متن‌های سایت هم؛ متصدی سفارش، وضعیت، لغو، نشانی، جابه‌جایی چاپخانه (۵٫۲)،
 * مبلغ، دانلود، دیدن تعرفه، از ۶٫۱ ورود فایل پست، از ۶٫۲ صف تأیید، از ۸٫۴ خاموش موقت گزینه‌های تعرفه، از ۹٫۳ یادداشت داخلی سفارش، و از
 * ۱۰٫۱ در دسترس بودن چاپخانه‌ها، از ۱۲٫۲ مسدود کردن موبایل مشتری، و از ۱۱٫۳ نوار اعلان سایت.
 * «حسابدار» (برش ۹٫۴، سؤال ۱۹۷، ADR-059) همهٔ سفارش‌ها با مبلغ و پرداخت‌ها، بازپرداخت (ثبت دستی، با کد تازه)، یادداشت و گزارش ارسال؛ بی
 * وضعیت، لغو، نشانی، جابه‌جایی، دانلود فایل‌ها، ارسال، تعرفه، تنظیمات، چاپخانه‌ها و ادمین‌ها. تسویهٔ چاپخانه‌ها و خروجی گزارش‌ها با برش ۱۰.
 * «چاپخانه» (برش ۵٫۳، ADR-042) فقط دیدن، «شروع چاپ» و «تحویل پست شد»، و دانلود و «دوباره بساز» فایل‌ها، همه فقط روی سفارش‌هایی
 * که امروز به چاپخانهٔ خودش سپرده شده‌اند (`admin_user_roles.print_partner_id`)؛ بی مبلغ، بی لغو و بی ویرایش. از ۶٫۲ فایل پست
 * خودش را هم وارد می‌کند، فقط برای همان سفارش‌ها؛ صف تأیید نه (تأیید کد به مشتری می‌فرستد، ADR-046). از ۱۰٫۱ «شلوغ» و «تعطیل» خودش
 * را هم می‌گذارد (سؤال ۲۰۰)، و از ۱۰٫۲ گزارش تولید خودش را می‌بیند، بی مبلغ (سؤال ۲۰۱).
 * از ۱۰٫۲ حسابدار گزارش تولید همهٔ چاپخانه‌ها را هم دارد، با مبلغ، و از ۱۱٫۴ کدهای تخفیف را می‌بیند (نه می‌سازد). از ۱۰٫۳ تسویهٔ چاپخانه‌ها:
 * مالک و حسابدار صورت‌حساب همه و ثبت پرداخت و اصلاح، و کاربر چاپخانه فقط صورت‌حساب خودش، بی مبلغ مشتری. از ۱۰٫۴ موجودی کاغذ: مالک و
 * متصدی همهٔ چاپخانه‌ها، و کاربر چاپخانه فقط خودش، دیدن و ثبت؛ حسابدار نه.
 *
 * هر ادمین یک نقش دارد (فرم «افزودن ادمین» و «عوض کردن نقش»)، هرچند جدول چند ردیف را برای نقش‌های بی محدوده می‌پذیرد.
 */
export const ADMIN_ROLES = {
  owner: { nameFa: 'مالک', permissions: ALL_PERMISSIONS },
  operator: {
    nameFa: 'متصدی',
    permissions: [
      'orders.read',
      'orders.status',
      'orders.cancel',
      'orders.address',
      'orders.notes',
      'orders.assign',
      'orders.money',
      'files.download',
      'tariff.read',
      'tariff.pause',
      'partners.availability',
      'shipments.import',
      'shipments.review',
      'customers.block',
      'content.bar',
      'support.reply',
      'inventory.read',
      'inventory.manage',
    ] as AdminPermission[],
  },
  accountant: {
    nameFa: 'حسابدار',
    permissions: [
      'orders.read',
      'orders.money',
      'orders.refund',
      'orders.notes',
      'reports.read',
      'reports.production',
      'discounts.read',
      'settlements.read',
      'settlements.manage',
    ] as AdminPermission[],
  },
  print_partner: {
    nameFa: 'چاپخانه',
    permissions: [
      'orders.read',
      'orders.status',
      'files.download',
      'partners.availability',
      'shipments.import',
      'reports.production',
      'settlements.read',
      'inventory.read',
      'inventory.manage',
    ] as AdminPermission[],
  },
} as const satisfies Record<string, { nameFa: string; permissions: readonly AdminPermission[] }>;

export type AdminRole = keyof typeof ADMIN_ROLES;

/** نقشی که محدودهٔ چاپخانه دارد: فقط سفارش‌های یک چاپخانه (`admin_user_roles.print_partner_id`). */
export const PARTNER_ROLE = 'print_partner' satisfies AdminRole;

export const isAdminRole = (value: unknown): value is AdminRole =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(ADMIN_ROLES, value);

/**
 * نقش یک ادمین در یک رشته، برای «همان که دیده شد» فرم «عوض کردن نقش» (برش ۹٫۴): نقش‌ها به ترتیب، و چاپخانهٔ کاربر چاپخانه. فرم همین را
 * از فهرست می‌آورد و تغییر زیر قفل با آن سنجیده می‌شود؛ هر تغییر هم‌زمان نقش یا چاپخانه رشته را عوض می‌کند.
 */
export const roleSeen = (roles: readonly string[], partnerId: string | null): string => `${[...roles].sort().join(',')}|${partnerId ?? ''}`;

/** چاپخانهٔ کاربر چاپخانه: شناسه برای محدوده، نام برای سربرگ و فهرست ادمین‌ها. */
export interface AdminPartnerRef {
  id: string;
  name: string;
}

/** چاپخانهٔ فعالی که کاربر چاپخانهٔ تازه به آن سپرده می‌شود (فرم «افزودن ادمین»، برش ۵٫۳). */
export interface AdminPartnerChoice extends AdminPartnerRef {
  cityName: string;
  isDefault: boolean;
}

export type AdminUserRow = typeof adminUsers.$inferSelect;
export type AdminInviteRow = typeof adminInvites.$inferSelect;
export type AdminEventRow = typeof adminEvents.$inferSelect;

/** یک رویداد ادمین. `detail` هرگز رمز یا مقدار کلید ندارد. */
export interface AdminEventInput {
  adminUserId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipHash?: string | null;
  detail?: unknown;
  at: Date;
}

export interface AdminSessionView {
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  user: AdminUserRow;
  roles: string[];
  permissions: string[];
  /** چاپخانهٔ کاربر چاپخانه (برش ۵٫۳): محدودهٔ سفارش‌هایش؛ null یعنی همهٔ سفارش‌ها. */
  partner: AdminPartnerRef | null;
}

export interface AdminListItem {
  user: AdminUserRow;
  roles: string[];
  /** چاپخانهٔ کاربر چاپخانه (برش ۵٫۳). */
  partner: AdminPartnerRef | null;
  /** پیوند ثبتی که هنوز زنده است. */
  invite: { expiresAt: Date } | null;
}

export interface AdminEventView extends AdminEventRow {
  username: string | null;
  displayName: string | null;
}

export interface NewInvite {
  inviteId: string;
  /** شناسهٔ ادمین تازه؛ برای ادمین موجود نادیده. */
  newUserId: string;
  username: string;
  displayName: string;
  /** null برای ادمین موجود یعنی همان نقش‌های قبلی. */
  role: AdminRole | null;
  /** چاپخانهٔ نقش «چاپخانه» (برش ۵٫۳)؛ باید فعال باشد. برای نقش‌های دیگر نادیده. */
  partnerId?: string | null;
  tokenHash: string;
  totpSealed: string;
  at: Date;
  expiresAt: Date;
  createdBy: string | null;
  /** «کد ورود تازه» یا دستور سرور برای ادمین موجود؛ false یعنی نام تکراری خطاست. */
  allowExisting: boolean;
  event: Omit<AdminEventInput, 'targetId' | 'at'>;
}

export type CreatedInvite =
  | { ok: true; userId: string; reset: boolean }
  | { ok: false; reason: 'username_taken' | 'role_required' | 'partner_required' | 'partner_inactive' | 'last_owner' };

/** «عوض کردن نقش» ادمین موجود از «ادمین‌ها» (برش ۹٫۴، سؤال ۱۹۷). */
export interface RoleChange {
  userId: string;
  role: AdminRole;
  /** چاپخانهٔ نقش «چاپخانه»؛ باید فعال باشد. برای نقش‌های دیگر نادیده. */
  partnerId: string | null;
  /** `roleSeen` نقشی که مالک دید. */
  seen: string;
  at: Date;
  /** `admins.role`؛ هدف، زمان و جزئیات (نام کاربری، از، به) را خود تغییر می‌گذارد. */
  event: Omit<AdminEventInput, 'targetType' | 'targetId' | 'detail' | 'at'>;
}

export type ChangedRole =
  | { ok: true; username: string; partner: AdminPartnerRef | null }
  | { ok: false; reason: 'not_found' | 'role_stale' | 'role_same' | 'last_owner' | 'partner_required' | 'partner_inactive' };

export interface CompletedInvite {
  inviteId: string;
  userId: string;
  passwordHash: string;
  totpSealed: string;
  totpStep: number;
  at: Date;
  session: { tokenHash: string; expiresAt: Date };
  ipHash: string | null;
}

export interface AdminStore {
  findUserByUsername(username: string): Promise<AdminUserRow | null>;
  findUser(id: string): Promise<AdminUserRow | null>;
  rolesOf(userId: string): Promise<string[]>;
  /** تلاش‌های ورود این IP از `since` به بعد. */
  countAttempts(ipHash: string, since: Date): Promise<number>;
  /**
   * تلاش ورود، پیش از هر سنجش و «ناموفق»؛ ورود موفق همان ردیف را موفق می‌کند (`startSession`). پس هر
   * درخواست یک ردیف، و درخواست‌های هم‌زمان هم پیش از سنجش شمرده می‌شوند.
   */
  recordAttempt(attempt: { username: string; adminUserId: string | null; ipHash: string; at: Date }): Promise<number>;
  /**
   * یک فرصت سنجش رمز یا کد، اتمی و پیش از خود سنجش (بدبینانه): اگر حساب قفل نیست، شمار بالا می‌رود، و اگر
   * به `maxFailures` رسید، قفل تا `lockUntil` می‌نشیند و شمار از صفر. سنجش درست بعدش همه را پاک می‌کند
   * (`startSession`، `clearFailures`). پس درخواست‌های هم‌زمان هم در هر دورهٔ قفل بیش از `maxFailures` بار
   * سنجیده نمی‌شوند. حساب قفل: `allowed: false` با زمان پایان قفل؛ وگرنه `lockedUntil` فقط اگر همین فرصت
   * قفل را نشاند.
   */
  claimAttempt(
    userId: string,
    maxFailures: number,
    at: Date,
    lockUntil: Date,
  ): Promise<{ allowed: boolean; lockedUntil: Date | null }>;
  /** کد درست در کاری حساس: شمار و قفل از صفر، مثل ورود موفق. */
  clearFailures(userId: string): Promise<void>;
  /** گام کد، اتمی: فقط اگر از آخرین گام پذیرفته‌شده بزرگ‌تر است. false یعنی این کد یک بار به کار رفته. */
  claimTotpStep(userId: string, step: number): Promise<boolean>;
  /** ورود موفق در یک تراکنش: شمار اشتباه صفر، قفل برداشته، آخرین ورود، نشست تازه، تلاش «موفق» و رویداد. */
  startSession(input: {
    userId: string;
    tokenHash: string;
    at: Date;
    expiresAt: Date;
    attemptId: number;
    event: AdminEventInput;
  }): Promise<void>;
  findSession(tokenHash: string): Promise<AdminSessionView | null>;
  touchSession(sessionId: string, at: Date): Promise<void>;
  revokeSession(tokenHash: string, at: Date): Promise<{ adminUserId: string } | null>;
  revokeUserSessions(userId: string, at: Date): Promise<void>;
  /**
   * پیوند ثبت، در یک تراکنش زیر قفل: ادمین تازه با نقشش، یا برای ادمین موجود (بازیابی) رمز و برنامهٔ تأییدش
   * پاک، نشست‌ها و پیوندهای زنده‌اش باطل، و دوباره فعال. بعد خود پیوند و رویداد. نقش «چاپخانه» چاپخانهٔ فعال می‌خواهد، که
   * تا پایان تراکنش `FOR SHARE` فعال می‌ماند (برش ۵٫۳). نقش صریح برای آخرین مالک فعال فقط همان مالک (برش ۹٫۴).
   */
  createInvite(input: NewInvite): Promise<CreatedInvite>;
  findInvite(
    tokenHash: string,
  ): Promise<{ invite: AdminInviteRow; user: AdminUserRow; roles: string[]; partner: AdminPartnerRef | null } | null>;
  /**
   * ثبت با پیوند، در یک تراکنش: پیوند مصرف می‌شود (فقط اگر هنوز زنده است)، رمز و برنامهٔ تأیید می‌نشینند،
   * نشست تازه و دو رویداد. false یعنی پیوند دیگر زنده نبود.
   */
  completeInvite(input: CompletedInvite): Promise<boolean>;
  listAdmins(at: Date): Promise<AdminListItem[]>;
  /**
   * چاپخانه‌های فعال برای فرم «افزودن ادمین» (برش ۵٫۳): طرف قرارداد اول و پیش‌فرض آخر، چون سفارش‌های پیش‌فرض را معمولاً همان
   * مالک و متصدی می‌گردانند؛ در هر دسته قدیمی‌ترین اول.
   */
  partnerChoices(): Promise<AdminPartnerChoice[]>;
  /**
   * غیرفعال کردن در یک تراکنش زیر قفل: نشست‌ها و پیوندهای زنده باطل، و رویداد. آخرین مالک فعال غیرفعال
   * نمی‌شود.
   */
  disableUser(userId: string, at: Date, event: AdminEventInput): Promise<'ok' | 'last_owner' | 'not_found'>;
  /**
   * «عوض کردن نقش» (برش ۹٫۴، سؤال ۱۹۷) در یک تراکنش زیر همان قفل: فقط اگر نقش امروز همان است که مالک دید (`roleSeen`)، با چاپخانهٔ
   * فعال برای نقش «چاپخانه» (`FOR SHARE`)، و آخرین مالک فعال نقش دیگری نمی‌گیرد. نقش‌های قبلی می‌روند و یک ردیف تازه می‌نشیند، با رویداد
   * `admins.role` در همان تراکنش. نشست‌ها باز می‌مانند: مجوز و محدوده با هر درخواست از همین جدول خوانده می‌شود.
   */
  changeRole(input: RoleChange): Promise<ChangedRole>;
  /** پیوندهای زندهٔ یک ادمین کنار می‌روند؛ ادمینی که هرگز وارد نشده بود، غیرفعال هم می‌شود. */
  revokeInvites(userId: string, at: Date, event: AdminEventInput): Promise<number>;
  logEvent(event: AdminEventInput): Promise<void>;
  listEvents(query: { limit: number; beforeId?: number; actionPrefix?: string }): Promise<AdminEventView[]>;
}

/**
 * بازپرداخت (برش ۷٫۳، سؤال ۱۵۹) کار روی سفارش است (`orders.refund`، `orders.refund_inquiry`) ولی زیر چیپ «پرداخت و بازپرداخت»، نه
 * «سفارش».
 */
export const REFUND_EVENT_PREFIX = 'orders.refund';

/** رویدادی که زیر چیپ `kind` صفحهٔ رویدادها می‌آید؛ همان شرط `listEvents`. */
export function inEventKind(action: string, kind: string): boolean {
  const refund = action.startsWith(REFUND_EVENT_PREFIX);
  if (kind === 'payments') return action.startsWith('payments.') || refund;
  if (kind === 'orders') return action.startsWith('orders.') && !refund;
  return action.startsWith(`${kind}.`);
}

/** شرط چیپ در کوئری. */
function eventKindWhere(kind: string) {
  const refund = sql`${adminEvents.action} LIKE ${`${REFUND_EVENT_PREFIX}%`}`;
  if (kind === 'payments') return sql`(${adminEvents.action} LIKE 'payments.%' OR ${refund})`;
  if (kind === 'orders') return sql`(${adminEvents.action} LIKE 'orders.%' AND NOT ${refund})`;
  return sql`${adminEvents.action} LIKE ${`${kind}.%`}`;
}

/** ردیف `admin_events` از یک رویداد؛ سفارش‌های پنل (`panel.ts`) هم رویدادشان را با همین می‌نویسند. */
export const adminEventRow = (event: AdminEventInput) => ({
  adminUserId: event.adminUserId,
  action: event.action,
  targetType: event.targetType ?? null,
  targetId: event.targetId ?? null,
  ipHash: event.ipHash ?? null,
  detail: event.detail ?? null,
  at: event.at,
});

export function createAdminStore({ db }: Database): AdminStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  /** نقش‌های هر ادمین، و چاپخانهٔ کاربر چاپخانه (برش ۵٫۳). */
  async function rolesIn(
    tx: Tx | typeof db,
    userIds: string[],
  ): Promise<Map<string, { roles: string[]; partner: AdminPartnerRef | null }>> {
    const map = new Map<string, { roles: string[]; partner: AdminPartnerRef | null }>();
    if (userIds.length === 0) return map;
    const rows = await tx
      .select({
        userId: adminUserRoles.adminUserId,
        roleId: adminUserRoles.roleId,
        partnerId: printPartners.id,
        partnerName: printPartners.name,
      })
      .from(adminUserRoles)
      .leftJoin(printPartners, eq(printPartners.id, adminUserRoles.printPartnerId))
      .where(inArray(adminUserRoles.adminUserId, userIds))
      .orderBy(adminUserRoles.roleId);
    for (const row of rows) {
      const entry = map.get(row.userId) ?? { roles: [], partner: null };
      entry.roles.push(row.roleId);
      if (row.partnerId && row.partnerName !== null) entry.partner = { id: row.partnerId, name: row.partnerName };
      map.set(row.userId, entry);
    }
    return map;
  }
  /** ادمین بی ردیف نقش؛ هر بار تازه، تا آرایهٔ مشترکی بیرون نرود. */
  const noRoles = () => ({ roles: [] as string[], partner: null });

  async function activeOwners(tx: Tx): Promise<string[]> {
    const rows = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .innerJoin(adminUserRoles, eq(adminUserRoles.adminUserId, adminUsers.id))
      .where(and(eq(adminUserRoles.roleId, 'owner'), isNull(adminUsers.disabledAt)));
    return rows.map((row) => row.id);
  }

  async function revokeOpenInvites(tx: Tx, userId: string, at: Date): Promise<number> {
    const rows = await tx
      .update(adminInvites)
      .set({ revokedAt: at })
      .where(and(eq(adminInvites.adminUserId, userId), isNull(adminInvites.usedAt), isNull(adminInvites.revokedAt)))
      .returning({ id: adminInvites.id });
    return rows.length;
  }

  return {
    async findUserByUsername(username) {
      const [row] = await db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
      return row ?? null;
    },

    async findUser(id) {
      const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
      return row ?? null;
    },

    async rolesOf(userId) {
      return (await rolesIn(db, [userId])).get(userId)?.roles ?? [];
    },

    async countAttempts(ipHash, since) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(adminLoginAttempts)
        .where(and(eq(adminLoginAttempts.ipHash, ipHash), gt(adminLoginAttempts.at, since)));
      return row?.n ?? 0;
    },

    async recordAttempt(attempt) {
      const [row] = await db
        .insert(adminLoginAttempts)
        .values({ ...attempt, ok: false })
        .returning({ id: adminLoginAttempts.id });
      return row!.id;
    },

    async claimAttempt(userId, maxFailures, at, lockUntil) {
      const reached = sql`${adminUsers.failedAttempts} + 1 >= ${maxFailures}`;
      const [row] = await db
        .update(adminUsers)
        .set({
          failedAttempts: sql`CASE WHEN ${reached} THEN 0 ELSE ${adminUsers.failedAttempts} + 1 END`,
          lockedUntil: sql`CASE WHEN ${reached} THEN ${lockUntil.toISOString()}::timestamptz ELSE NULL END`,
        })
        .where(and(eq(adminUsers.id, userId), or(isNull(adminUsers.lockedUntil), lte(adminUsers.lockedUntil, at))))
        .returning({ lockedUntil: adminUsers.lockedUntil });
      if (row) return { allowed: true, lockedUntil: row.lockedUntil };
      const [user] = await db
        .select({ lockedUntil: adminUsers.lockedUntil })
        .from(adminUsers)
        .where(eq(adminUsers.id, userId))
        .limit(1);
      return { allowed: false, lockedUntil: user?.lockedUntil ?? null };
    },

    async clearFailures(userId) {
      await db.update(adminUsers).set({ failedAttempts: 0, lockedUntil: null }).where(eq(adminUsers.id, userId));
    },

    async claimTotpStep(userId, step) {
      const rows = await db
        .update(adminUsers)
        .set({ totpLastStep: step })
        .where(
          and(
            eq(adminUsers.id, userId),
            sql`(${adminUsers.totpLastStep} IS NULL OR ${adminUsers.totpLastStep} < ${step})`,
          ),
        )
        .returning({ id: adminUsers.id });
      return rows.length > 0;
    },

    async startSession(input) {
      await db.transaction(async (tx) => {
        await tx
          .update(adminUsers)
          .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: input.at })
          .where(eq(adminUsers.id, input.userId));
        await tx.insert(adminSessions).values({
          tokenHash: input.tokenHash,
          adminUserId: input.userId,
          createdAt: input.at,
          expiresAt: input.expiresAt,
          lastSeenAt: input.at,
        });
        await tx
          .update(adminLoginAttempts)
          .set({ ok: true, adminUserId: input.userId })
          .where(eq(adminLoginAttempts.id, input.attemptId));
        await tx.insert(adminEvents).values(adminEventRow(input.event));
      });
    },

    async findSession(tokenHash) {
      const [row] = await db
        .select({ session: adminSessions, user: adminUsers })
        .from(adminSessions)
        .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
        .where(eq(adminSessions.tokenHash, tokenHash))
        .limit(1);
      if (!row) return null;
      const perms = await db
        .selectDistinct({ id: rolePermissions.permissionId })
        .from(adminUserRoles)
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, adminUserRoles.roleId))
        .where(eq(adminUserRoles.adminUserId, row.user.id));
      const assigned = (await rolesIn(db, [row.user.id])).get(row.user.id) ?? noRoles();
      return {
        sessionId: row.session.id,
        createdAt: row.session.createdAt,
        expiresAt: row.session.expiresAt,
        lastSeenAt: row.session.lastSeenAt,
        revokedAt: row.session.revokedAt,
        user: row.user,
        roles: assigned.roles,
        permissions: perms.map((p) => p.id).sort(),
        partner: assigned.partner,
      };
    },

    async touchSession(sessionId, at) {
      await db
        .update(adminSessions)
        .set({ lastSeenAt: at })
        .where(and(eq(adminSessions.id, sessionId), lt(adminSessions.lastSeenAt, at)));
    },

    async revokeSession(tokenHash, at) {
      const [row] = await db
        .update(adminSessions)
        .set({ revokedAt: at })
        .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt)))
        .returning({ adminUserId: adminSessions.adminUserId });
      return row ?? null;
    },

    async revokeUserSessions(userId, at) {
      await db
        .update(adminSessions)
        .set({ revokedAt: at })
        .where(and(eq(adminSessions.adminUserId, userId), isNull(adminSessions.revokedAt)));
    },

    async createInvite(input) {
      return db.transaction(async (tx): Promise<CreatedInvite> => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`);
        // نقش چاپخانه (۵٫۳): چاپخانهٔ فعال، که تا پایان تراکنش فعال می‌ماند؛ غیرفعال کردن هم‌زمانش پشت این قفل منتظر است.
        let partner: AdminPartnerRef | null = null;
        if (input.role === PARTNER_ROLE) {
          if (!input.partnerId) return { ok: false, reason: 'partner_required' };
          const [active] = await tx
            .select({ id: printPartners.id, name: printPartners.name })
            .from(printPartners)
            .where(and(eq(printPartners.id, input.partnerId), isNull(printPartners.deactivatedAt)))
            .limit(1)
            .for('share');
          if (!active) return { ok: false, reason: 'partner_inactive' };
          partner = active;
        }
        const role = input.role ? { roleId: input.role, printPartnerId: partner?.id ?? null } : null;
        const [existing] = await tx
          .select()
          .from(adminUsers)
          .where(eq(adminUsers.username, input.username))
          .limit(1)
          .for('update');
        let userId: string;
        if (existing) {
          if (!input.allowExisting) return { ok: false, reason: 'username_taken' };
          // دستور سرور با نقش صریح (`--operator`) برای آخرین مالک فعال پنل را بی مالک می‌گذاشت (برش ۹٫۴): پیش از هر نوشتن.
          if (role && role.roleId !== 'owner') {
            const owners = await activeOwners(tx);
            if (owners.includes(existing.id) && owners.length <= 1) return { ok: false, reason: 'last_owner' };
          }
          userId = existing.id;
          await tx
            .update(adminUsers)
            .set({ passwordHash: null, totpSealed: null, totpLastStep: null, failedAttempts: 0, lockedUntil: null, disabledAt: null })
            .where(eq(adminUsers.id, userId));
          await tx
            .update(adminSessions)
            .set({ revokedAt: input.at })
            .where(and(eq(adminSessions.adminUserId, userId), isNull(adminSessions.revokedAt)));
          await revokeOpenInvites(tx, userId, input.at);
          if (role) {
            await tx.delete(adminUserRoles).where(eq(adminUserRoles.adminUserId, userId));
            await tx.insert(adminUserRoles).values({ adminUserId: userId, ...role });
          }
        } else {
          if (!role) return { ok: false, reason: 'role_required' };
          userId = input.newUserId;
          await tx.insert(adminUsers).values({
            id: userId,
            username: input.username,
            displayName: input.displayName,
            createdAt: input.at,
            createdBy: input.createdBy,
          });
          await tx.insert(adminUserRoles).values({ adminUserId: userId, ...role });
        }
        await tx.insert(adminInvites).values({
          id: input.inviteId,
          adminUserId: userId,
          tokenHash: input.tokenHash,
          totpSealed: input.totpSealed,
          createdAt: input.at,
          expiresAt: input.expiresAt,
          createdBy: input.createdBy,
        });
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            targetId: userId,
            at: input.at,
            detail: { ...(input.event.detail as object), ...(partner ? { partner } : {}), reset: Boolean(existing) },
          }),
        );
        return { ok: true, userId, reset: Boolean(existing) };
      });
    },

    async findInvite(tokenHash) {
      const [row] = await db
        .select({ invite: adminInvites, user: adminUsers })
        .from(adminInvites)
        .innerJoin(adminUsers, eq(adminUsers.id, adminInvites.adminUserId))
        .where(eq(adminInvites.tokenHash, tokenHash))
        .limit(1);
      if (!row) return null;
      return { ...row, ...((await rolesIn(db, [row.user.id])).get(row.user.id) ?? noRoles()) };
    },

    async completeInvite(input) {
      return db.transaction(async (tx) => {
        const [used] = await tx
          .update(adminInvites)
          .set({ usedAt: input.at })
          .where(
            and(
              eq(adminInvites.id, input.inviteId),
              isNull(adminInvites.usedAt),
              isNull(adminInvites.revokedAt),
              gt(adminInvites.expiresAt, input.at),
            ),
          )
          .returning({ id: adminInvites.id });
        if (!used) return false;
        await tx
          .update(adminUsers)
          .set({
            passwordHash: input.passwordHash,
            totpSealed: input.totpSealed,
            totpLastStep: input.totpStep,
            failedAttempts: 0,
            lockedUntil: null,
            lastLoginAt: input.at,
          })
          .where(and(eq(adminUsers.id, input.userId), isNull(adminUsers.disabledAt)));
        await tx.insert(adminSessions).values({
          tokenHash: input.session.tokenHash,
          adminUserId: input.userId,
          createdAt: input.at,
          expiresAt: input.session.expiresAt,
          lastSeenAt: input.at,
        });
        await tx.insert(adminEvents).values([
          adminEventRow({ adminUserId: input.userId, action: 'admins.enroll', targetType: 'admin', targetId: input.userId, ipHash: input.ipHash, at: input.at }),
          adminEventRow({ adminUserId: input.userId, action: 'auth.login', ipHash: input.ipHash, at: input.at }),
        ]);
        return true;
      });
    },

    async listAdmins(at) {
      const users = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);
      const byUser = await rolesIn(
        db,
        users.map((u) => u.id),
      );
      const open = await db
        .select({ userId: adminInvites.adminUserId, expiresAt: adminInvites.expiresAt })
        .from(adminInvites)
        .where(and(isNull(adminInvites.usedAt), isNull(adminInvites.revokedAt), gt(adminInvites.expiresAt, at)))
        .orderBy(desc(adminInvites.expiresAt));
      return users.map((user) => {
        const invite = open.find((row) => row.userId === user.id);
        return { user, ...(byUser.get(user.id) ?? noRoles()), invite: invite ? { expiresAt: invite.expiresAt } : null };
      });
    },

    async partnerChoices() {
      return db
        .select({ id: printPartners.id, name: printPartners.name, cityName: cities.nameFa, isDefault: printPartners.isDefault })
        .from(printPartners)
        .innerJoin(cities, eq(cities.id, printPartners.cityId))
        .where(isNull(printPartners.deactivatedAt))
        .orderBy(printPartners.isDefault, printPartners.createdAt, printPartners.id);
    },

    async disableUser(userId, at, event) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`);
        const [user] = await tx.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1).for('update');
        if (!user || user.disabledAt) return 'not_found' as const;
        const owners = await activeOwners(tx);
        if (owners.includes(userId) && owners.length <= 1) return 'last_owner' as const;
        await tx.update(adminUsers).set({ disabledAt: at }).where(eq(adminUsers.id, userId));
        await tx
          .update(adminSessions)
          .set({ revokedAt: at })
          .where(and(eq(adminSessions.adminUserId, userId), isNull(adminSessions.revokedAt)));
        await revokeOpenInvites(tx, userId, at);
        await tx.insert(adminEvents).values(adminEventRow(event));
        return 'ok' as const;
      });
    },

    async changeRole(input) {
      return db.transaction(async (tx): Promise<ChangedRole> => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`);
        const [user] = await tx.select().from(adminUsers).where(eq(adminUsers.id, input.userId)).limit(1).for('update');
        if (!user) return { ok: false, reason: 'not_found' };
        const current = (await rolesIn(tx, [user.id])).get(user.id) ?? noRoles();
        if (roleSeen(current.roles, current.partner?.id ?? null) !== input.seen) return { ok: false, reason: 'role_stale' };
        let partner: AdminPartnerRef | null = null;
        if (input.role === PARTNER_ROLE) {
          if (!input.partnerId) return { ok: false, reason: 'partner_required' };
          const [active] = await tx
            .select({ id: printPartners.id, name: printPartners.name })
            .from(printPartners)
            .where(and(eq(printPartners.id, input.partnerId), isNull(printPartners.deactivatedAt)))
            .limit(1)
            .for('share');
          if (!active) return { ok: false, reason: 'partner_inactive' };
          partner = active;
        }
        if (roleSeen([input.role], partner?.id ?? null) === input.seen) return { ok: false, reason: 'role_same' };
        if (input.role !== 'owner') {
          const owners = await activeOwners(tx);
          if (owners.includes(user.id) && owners.length <= 1) return { ok: false, reason: 'last_owner' };
        }
        await tx.delete(adminUserRoles).where(eq(adminUserRoles.adminUserId, user.id));
        await tx.insert(adminUserRoles).values({ adminUserId: user.id, roleId: input.role, printPartnerId: partner?.id ?? null });
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            targetType: 'admin',
            targetId: user.id,
            at: input.at,
            detail: {
              username: user.username,
              from: current.roles,
              to: input.role,
              ...(current.partner ? { fromPartner: current.partner } : {}),
              ...(partner ? { partner } : {}),
            },
          }),
        );
        return { ok: true, username: user.username, partner };
      });
    },

    async revokeInvites(userId, at, event) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`);
        const n = await revokeOpenInvites(tx, userId, at);
        if (n === 0) return 0;
        // ادمینی که هرگز ثبت نکرد، بی پیوند فقط یک نام است؛ غیرفعال می‌شود تا فهرست بی صاحب نماند. ادمینی که
        // قبلاً وارد شده بود (بازیابی) غیرفعال نمی‌شود؛ فقط تا پیوند تازه کد ورود ندارد.
        await tx
          .update(adminUsers)
          .set({ disabledAt: at })
          .where(
            and(
              eq(adminUsers.id, userId),
              isNull(adminUsers.passwordHash),
              isNull(adminUsers.lastLoginAt),
              isNull(adminUsers.disabledAt),
            ),
          );
        await tx.insert(adminEvents).values(adminEventRow(event));
        return n;
      });
    },

    async logEvent(event) {
      await db.insert(adminEvents).values(adminEventRow(event));
    },

    async listEvents(query) {
      const where = and(
        query.beforeId ? lt(adminEvents.id, query.beforeId) : undefined,
        query.actionPrefix ? eventKindWhere(query.actionPrefix) : undefined,
      );
      const rows = await db
        .select({ event: adminEvents, username: adminUsers.username, displayName: adminUsers.displayName })
        .from(adminEvents)
        .leftJoin(adminUsers, eq(adminUsers.id, adminEvents.adminUserId))
        .where(where)
        .orderBy(desc(adminEvents.id))
        .limit(query.limit);
      return rows.map((row) => ({ ...row.event, username: row.username, displayName: row.displayName }));
    },
  };
}

/** نقش‌ها و مجوزها در پایگاه داده، از `ADMIN_ROLES`؛ در `seedReferenceData`، زیر همان قفل. */
export async function seedAdminRoles(tx: Database['db']): Promise<void> {
  await tx
    .insert(permissions)
    .values(Object.entries(ADMIN_PERMISSIONS).map(([id, nameFa]) => ({ id, nameFa })))
    .onConflictDoUpdate({ target: permissions.id, set: { nameFa: sql`excluded.name_fa` } });
  await tx
    .insert(roles)
    .values(Object.entries(ADMIN_ROLES).map(([id, role]) => ({ id, nameFa: role.nameFa })))
    .onConflictDoUpdate({ target: roles.id, set: { nameFa: sql`excluded.name_fa` } });
  // مجوزهای هر نقش دقیقاً همان کد: مجوزی که از کد رفته، از نقش هم می‌رود.
  for (const [roleId, role] of Object.entries(ADMIN_ROLES)) {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    await tx.insert(rolePermissions).values(role.permissions.map((permissionId) => ({ roleId, permissionId })));
  }
}
