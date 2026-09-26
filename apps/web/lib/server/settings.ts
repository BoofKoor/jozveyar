/**
 * خواندن تنظیم‌های `settings` با شکل قرارداد (`SETTING_SCHEMAS`).
 *
 * نبودن تنظیم یعنی پیش‌فرض (`DEFAULT_SETTINGS`، همان که هنگام بالا آمدن سرور می‌نشیند). مقدار خراب هم
 * پیش‌فرض است، ولی بلند لاگ می‌شود: تعطیلی‌های خراب نباید پرداخت یک سفارش واقعی را بشکند.
 */

import { SETTING_SCHEMAS, type SettingKey, type SettingValue } from '@jozveyar/contracts';
import { DEFAULT_SETTINGS } from '@jozveyar/db';

export async function readSetting<K extends SettingKey>(
  read: (key: string) => Promise<unknown>,
  key: K,
  log: (message: string, error?: unknown) => void = console.error,
): Promise<SettingValue<K>> {
  const fallback = DEFAULT_SETTINGS[key] as SettingValue<K>;
  const raw = await read(key);
  if (raw === undefined || raw === null) return fallback;
  const parsed = SETTING_SCHEMAS[key].safeParse(raw);
  if (parsed.success) return parsed.data as SettingValue<K>;
  log(`✗ تنظیم ${key} شکل درستی ندارد؛ پیش‌فرض به کار رفت.`, parsed.error);
  return fallback;
}
