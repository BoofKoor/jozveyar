/**
 * واقعیت‌های صفحه‌های ثابت (برش ۷٫۴، قدم ۵ طراحی): روز کاری تحویل به پست، روزهای ماندن فایل آپلود، و روزهای ماندن فایل‌های
 * سفارش پس از پست یا لغو. همه از همان `settings`ی که سایت، کارگر و پنل با آن کار می‌کنند، تا متن قوانین و حریم خصوصی همان
 * باشد که سایت واقعاً می‌کند، حتی وقتی مالک عددی را از «تنظیمات» عوض کند. صفحه‌ها مثل صفحهٔ اصلی ISR ۶۰ ثانیه‌اند. از ۱۱٫۱ متن صفحه‌ها
 * از پنل است و این عددها مقدار جای‌نگهدارهایش (`contentFacts` در `content.ts`).
 *
 * - **build و بی `DATABASE_URL`:** پیش‌فرض‌ها، همان‌ها که سایت بی تنظیم با آن کار می‌کند (مثل `siteTariff`).
 * - **پایگاه داده خطا داد:** بلند در لاگ، و خطا بالا می‌رود؛ ISR صفحهٔ قبلی را نگه می‌دارد. پیش‌فرض نه: شاید همان نباشد.
 * - **«به‌روز شده»:** آخرین تغییر تنظیم‌هایی که متن صفحه به کار برده (`siteChangedAt`) هم تاریخ متن را جلو می‌برد (`pageDate` در
 *   `lib/staticPages.ts`).
 */

import {
  DEFAULT_SETTINGS,
  FILES_RETENTION_SETTING,
  SLA_DAYS_SETTING,
  UPLOAD_RETENTION_SETTING,
  createSettingsStore,
  getDb,
  readSetting,
  settingsChangedAt,
  uploadDaysOf,
} from '@jozveyar/db';

import { BUILD_PHASE } from './tariff';
import { DEFAULT_RETENTION_DAYS } from './uploads';

export interface SiteFacts {
  /** روز کاری تحویل به پست پس از پرداخت (`order.sla_days`). */
  slaDays: number;
  /** روزهایی که فایل آپلود می‌ماند؛ گرد به بالا، مثل قاعدهٔ سنی باکت (`file.retention_days`). */
  uploadDays: number;
  /** روزهای ماندن فایل‌های سفارش پس از «تحویل پست شد» یا لغو (`order.files_retention_days`، کارگر). */
  orderFilesDays: number;
}

export const DEFAULT_FACTS: SiteFacts = {
  slaDays: DEFAULT_SETTINGS[SLA_DAYS_SETTING],
  uploadDays: DEFAULT_RETENTION_DAYS,
  orderFilesDays: DEFAULT_SETTINGS[FILES_RETENTION_SETTING],
};

export interface FactsSource {
  setting(key: string): Promise<unknown>;
  changedAt(keys: readonly string[]): Promise<Date | null>;
}

/** تنظیم‌ها با شکل قرارداد (`readSetting`، خراب یعنی پیش‌فرض با لاگ)؛ فایل آپلود با همان قاعدهٔ سایت (`uploadDaysOf`). */
export async function loadFacts(source: Pick<FactsSource, 'setting'>, log?: (message: string, error?: unknown) => void): Promise<SiteFacts> {
  const read = (key: string) => source.setting(key);
  const [slaDays, orderFilesDays, uploadRetention] = await Promise.all([
    readSetting(read, SLA_DAYS_SETTING, log),
    readSetting(read, FILES_RETENTION_SETTING, log),
    read(UPLOAD_RETENTION_SETTING),
  ]);
  return { slaDays, uploadDays: uploadDaysOf(uploadRetention), orderFilesDays };
}

let source: FactsSource | undefined;

function databaseSource(): FactsSource {
  const conn = getDb();
  const settings = createSettingsStore(conn);
  return { setting: (key) => settings.read(key), changedAt: (keys) => settingsChangedAt(conn, keys) };
}

const sourceOfDatabase = () => (source ??= databaseSource());

export async function siteFacts(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => FactsSource = sourceOfDatabase,
): Promise<SiteFacts> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return DEFAULT_FACTS;
  try {
    return await loadFacts(sourceOf());
  } catch (error) {
    console.error('✗ صفحه‌های ثابت: تنظیم‌ها از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}

/** آخرین تغییر این تنظیم‌ها؛ build، بی پایگاه داده و بی کلید هیچ. */
export async function siteChangedAt(
  keys: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => FactsSource = sourceOfDatabase,
): Promise<Date | null> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL || keys.length === 0) return null;
  try {
    return await sourceOf().changedAt(keys);
  } catch (error) {
    console.error('✗ صفحه‌های ثابت: زمان تغییر تنظیم‌ها از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}
