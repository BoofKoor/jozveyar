/**
 * حالت مسیر خرید (ADR-035): `off`، `mock` یا `live`، از `CHECKOUT_MODE` در `.env`.
 *
 * دو دیوار مستقل، مثل مهار LibreOffice (ADR-028):
 *  1. پیش‌فرض `off` است؛ هر مقدار ناشناس هم `off`. `.env` سرور زنده همین حالا `PAYMENT_PROVIDER=mock`
 *     دارد، پس روشن بودن مسیر خرید به آن سپرده نمی‌شود.
 *  2. درگاه نمونه روی دامنهٔ jozveyar.com هرگز: اگر درخواست با این دامنه برسد، `mock` مثل `off` است،
 *     حتی با `.env` اشتباه. دامنه از `Host` خود درخواست خوانده می‌شود، نه از `.env`. پشت Nginx سایت
 *     زنده، وب فقط همین دامنه را می‌بیند: هر میزبان دیگری به بلوک پیش‌فرض می‌رسد و هدایت می‌شود.
 *
 * `live` (برش ۷) درگاه و پنل پیامک واقعی می‌خواهد؛ تا ساخته نشده‌اند، `live` هم خاموش است. درگاه
 * نمونه هیچ‌وقت پشت `live` نمی‌نشیند.
 *
 * خالص است، بی I/O: تست بی سرور همهٔ حالت‌ها را می‌سنجد.
 */

import type { CheckoutMode } from '@jozveyar/contracts/checkout';

/** دامنهٔ سایت زنده؛ درگاه نمونه روی آن و زیردامنه‌هایش هرگز. */
export const LIVE_DOMAIN = 'jozveyar.com';

/** درگاه و پنل پیامک واقعی (برش ۷). تا آن موقع `live` خاموش می‌ماند. */
export const LIVE_ADAPTERS_READY = false;

/** `SESSION_SECRET` کوتاه‌تر از این کلید HMAC کد پیامکی نمی‌شود؛ `bootstrap.sh` ۶۴ رقم hex می‌سازد. */
export const MIN_SECRET_LENGTH = 32;

/** رمز نشست، اگر به‌اندازه است؛ بی آن مسیر خرید خاموش است. */
export function sessionSecretOf(value: string | undefined): string | null {
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** مقدار `CHECKOUT_MODE`؛ نبودن یا هر چیز ناشناس یعنی `off`. */
export function configuredMode(value: string | undefined): CheckoutMode {
  const mode = value?.trim().toLowerCase();
  return mode === 'mock' || mode === 'live' ? mode : 'off';
}

/** نام میزبان بی پورت و به حروف کوچک؛ `[::1]:3000` هم درست جدا می‌شود. */
export function hostName(host: string | null | undefined): string {
  const value = (host ?? '').trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  return value.replace(/:\d*$/, '').replace(/\.$/, '');
}

/** میزبان سایت زنده است؟ خود دامنه یا هر زیردامنه‌اش (www، admin…). */
export function isLiveHost(host: string | null | undefined): boolean {
  const name = hostName(host);
  return name === LIVE_DOMAIN || name.endsWith(`.${LIVE_DOMAIN}`);
}

/**
 * حالتی که این درخواست واقعاً دارد. `hosts` هر نامی است که درخواست برای میزبانش آورده (`Host`،
 * `X-Forwarded-Host`، نشانی)؛ اگر **هر کدام** سایت زنده باشد، درگاه نمونه خاموش است.
 */
export function effectiveMode(
  configured: CheckoutMode,
  hosts: readonly (string | null | undefined)[],
  liveReady = LIVE_ADAPTERS_READY,
): CheckoutMode {
  if (configured === 'mock') return hosts.some(isLiveHost) ? 'off' : 'mock';
  if (configured === 'live') return liveReady ? 'live' : 'off';
  return 'off';
}

/** یک خط برای لاگ بالا آمدن سرور؛ صاحب پروژه بعد از استقرار همین را می‌جوید. */
export function describeMode(configured: CheckoutMode, secretOk: boolean): string {
  if (configured === 'off') return '✓ مسیر خرید: off (ثبت سفارش آنلاین به‌زودی)';
  if (!secretOk) return `✗ مسیر خرید: ${configured} خواسته شد ولی SESSION_SECRET نیست یا کوتاه است — خاموش`;
  if (configured === 'live' && !LIVE_ADAPTERS_READY) {
    return '✗ مسیر خرید: live هنوز درگاه و پنل پیامک واقعی ندارد (برش ۷) — خاموش';
  }
  if (configured === 'mock') {
    return `⚠ مسیر خرید: mock — درگاه نمونه و پیامک کنسولی؛ روی ${LIVE_DOMAIN} همیشه خاموش`;
  }
  return '✓ مسیر خرید: live';
}
