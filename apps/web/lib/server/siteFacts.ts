/**
 * واقعیت‌های صفحه‌های ثابت (برش ۷٫۴، قدم ۵ طراحی): روز کاری تحویل به پست، روزهای ماندن فایل آپلود، و روزهای ماندن فایل‌های
 * سفارش پس از پست یا لغو. همه از همان `settings`ی که سایت، کارگر و پنل با آن کار می‌کنند، تا متن قوانین و حریم خصوصی همان
 * باشد که سایت واقعاً می‌کند، حتی وقتی مالک عددی را از «تنظیمات» عوض کند. صفحه‌ها مثل صفحهٔ اصلی ISR ۶۰ ثانیه‌اند.
 *
 * - **build و بی `DATABASE_URL`:** پیش‌فرض‌ها، همان‌ها که سایت بی تنظیم با آن کار می‌کند (مثل `siteTariff`).
 * - **پایگاه داده خطا داد:** بلند در لاگ، و خطا بالا می‌رود؛ ISR صفحهٔ قبلی را نگه می‌دارد. پیش‌فرض نه: شاید همان نباشد.
 * - **«به‌روز شده»:** آخرین تغییر همین تنظیم‌ها (`changedAt`) هم تاریخ متن را جلو می‌برد (`pageDate` در `lib/staticPages.ts`).
 */

import {
  DEFAULT_SETTINGS,
  FILES_RETENTION_SETTING,
  SLA_DAYS_SETTING,
  createSettingsStore,
  getDb,
  readSetting,
  settingsChangedAt,
} from '@jozveyar/db';

import { BUILD_PHASE } from './tariff';
import { DEFAULT_RETENTION_DAYS, UPLOAD_RETENTION_SETTING, positiveSetting } from './uploads';

export interface SiteFacts {
  /** روز کاری تحویل به پست پس از پرداخت (`order.sla_days`). */
  slaDays: number;
  /** روزهایی که فایل آپلود می‌ماند؛ گرد به بالا، مثل قاعدهٔ سنی باکت (`file.retention_days`). */
  uploadDays: number;
  /** روزهای ماندن فایل‌های سفارش پس از «تحویل پست شد» یا لغو (`order.files_retention_days`، کارگر). */
  orderFilesDays: number;
  /** آخرین تغییر همین تنظیم‌ها؛ null یعنی پیش‌فرض‌ها، یا هیچ‌کدام ردیف ندارد. */
  changedAt: Date | null;
}

/** تنظیم‌هایی که متن صفحه‌ها از آن‌هاست؛ تغییر هر کدام «به‌روز شده» را جلو می‌برد. */
export const FACT_SETTINGS = [SLA_DAYS_SETTING, FILES_RETENTION_SETTING, UPLOAD_RETENTION_SETTING] as const;

export const DEFAULT_FACTS: SiteFacts = {
  slaDays: DEFAULT_SETTINGS[SLA_DAYS_SETTING],
  uploadDays: DEFAULT_RETENTION_DAYS,
  orderFilesDays: DEFAULT_SETTINGS[FILES_RETENTION_SETTING],
  changedAt: null,
};

export interface FactsSource {
  setting(key: string): Promise<unknown>;
  changedAt(keys: readonly string[]): Promise<Date | null>;
}

/** تنظیم‌ها با شکل قرارداد (`readSetting`، خراب یعنی پیش‌فرض با لاگ)؛ فایل آپلود با همان قاعدهٔ `uploads.ts`. */
export async function loadFacts(source: FactsSource, log?: (message: string, error?: unknown) => void): Promise<SiteFacts> {
  const read = (key: string) => source.setting(key);
  const [slaDays, orderFilesDays, uploadRetention, changedAt] = await Promise.all([
    readSetting(read, SLA_DAYS_SETTING, log),
    readSetting(read, FILES_RETENTION_SETTING, log),
    read(UPLOAD_RETENTION_SETTING),
    source.changedAt(FACT_SETTINGS),
  ]);
  return {
    slaDays,
    uploadDays: Math.ceil(positiveSetting(uploadRetention, DEFAULT_RETENTION_DAYS)),
    orderFilesDays,
    changedAt,
  };
}

let source: FactsSource | undefined;

function databaseSource(): FactsSource {
  const conn = getDb();
  const settings = createSettingsStore(conn);
  return { setting: (key) => settings.read(key), changedAt: (keys) => settingsChangedAt(conn, keys) };
}

export async function siteFacts(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => FactsSource = () => (source ??= databaseSource()),
): Promise<SiteFacts> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return DEFAULT_FACTS;
  try {
    return await loadFacts(sourceOf());
  } catch (error) {
    console.error('✗ صفحه‌های ثابت: تنظیم‌ها از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}
