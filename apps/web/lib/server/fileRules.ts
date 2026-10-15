/**
 * قاعده‌های فایل صفحهٔ اصلی (برش ۸٫۴، سؤال ۱۹۰): خانواده‌های روشن، سقف حجم و سقف صفحهٔ هر فایل، و روزهای ماندن فایل آپلود، از همان
 * `settings`ی که سرور آپلود و مسیر خرید با آن می‌سنجند. صفحه با ISR ۶۰ ثانیه ساخته می‌شود؛ کارت بارگذاری، `accept`، سؤال‌ها، «فایلت پیش
 * ما نمی‌ماند» و صف جزوه همین را می‌گیرند.
 *
 * - **build و بی `DATABASE_URL`:** پیش‌فرض‌ها، همان که سایت بی تنظیم با آن کار می‌کند (مثل `siteTariff`).
 * - **پایگاه داده خطا داد:** بلند در لاگ، و خطا بالا می‌رود؛ ISR صفحهٔ قبلی را نگه می‌دارد.
 */

import { DEFAULT_FILE_RULES, type FileRules } from '@jozveyar/contracts';
import { createSettingsStore, getDb, readSetting } from '@jozveyar/db';

import { BUILD_PHASE } from './tariff';
import { DEFAULT_RETENTION_DAYS, UPLOAD_RETENTION_SETTING, positiveSetting } from './uploads';

export interface SiteFiles {
  rules: FileRules;
  /** روزهایی که فایل آپلود می‌ماند؛ گرد به بالا، مثل قاعدهٔ سنی باکت و صفحه‌های ثابت (`file.retention_days`). */
  uploadDays: number;
}

export const DEFAULT_SITE_FILES: SiteFiles = { rules: DEFAULT_FILE_RULES, uploadDays: DEFAULT_RETENTION_DAYS };

/** تنظیم‌ها با شکل قرارداد (`readSetting`، خراب یعنی پیش‌فرض با لاگ)؛ روزهای فایل آپلود با همان قاعدهٔ `uploads.ts`. */
export async function loadFiles(
  read: (key: string) => Promise<unknown>,
  log?: (message: string, error?: unknown) => void,
): Promise<SiteFiles> {
  const [formats, maxMb, maxPages, retention] = await Promise.all([
    readSetting(read, 'file.formats', log),
    readSetting(read, 'file.max_mb', log),
    readSetting(read, 'file.max_pages', log),
    read(UPLOAD_RETENTION_SETTING),
  ]);
  return { rules: { formats, maxMb, maxPages }, uploadDays: Math.ceil(positiveSetting(retention, DEFAULT_RETENTION_DAYS)) };
}

let read: ((key: string) => Promise<unknown>) | undefined;

export async function siteFiles(
  env: Readonly<Record<string, string | undefined>> = process.env,
  readOf: () => (key: string) => Promise<unknown> = () => {
    if (!read) {
      const settings = createSettingsStore(getDb());
      read = (key) => settings.read(key);
    }
    return read;
  },
): Promise<SiteFiles> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return DEFAULT_SITE_FILES;
  try {
    return await loadFiles(readOf());
  } catch (error) {
    console.error('✗ صفحهٔ اصلی: قاعده‌های فایل از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}
