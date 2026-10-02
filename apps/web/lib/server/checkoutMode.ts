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
 * `live` (برش ۷٫۵، ADR-052): `.env` توانایی را می‌گوید و پنل مخاطب را. آمادگی زمان اجرا (`checkoutReadiness`، پایگاه داده) جای ثابت
 * `LIVE_ADAPTERS_READY` را گرفت؛ مخاطب (`checkout.audience`) «متوقف»، «پیش‌نمایش مالک» یا «همه» است. تصمیم هر درخواست همین‌جاست
 * (`accessOf`)؛ خواندن آمادگی، مخاطب و کوکی پیش‌نمایش در `checkoutContext.ts`. درگاه نمونه هیچ‌وقت پشت `live` نمی‌نشیند.
 *
 * خالص است، بی I/O: تست بی سرور همهٔ حالت‌ها را می‌سنجد.
 */

import type { CheckoutMode } from '@jozveyar/contracts/checkout';
import type { CheckoutAudience } from '@jozveyar/contracts';

/** دامنهٔ سایت زنده؛ درگاه نمونه روی آن و زیردامنه‌هایش هرگز. */
export const LIVE_DOMAIN = 'jozveyar.com';

/** `SESSION_SECRET` کوتاه‌تر از این کلید HMAC کد پیامکی نمی‌شود؛ `bootstrap.sh` ۶۴ رقم hex می‌سازد. */
export const MIN_SECRET_LENGTH = 32;

type Env = Readonly<Record<string, string | undefined>>;

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
 * حالت `.env` برای این درخواست، پیش از آمادگی و مخاطب. `hosts` هر نامی است که درخواست برای میزبانش آورده (`Host`،
 * `X-Forwarded-Host`، نشانی)؛ اگر **هر کدام** سایت زنده باشد، درگاه نمونه خاموش است. `live` اینجا فقط «خواسته شده» است.
 */
export function effectiveMode(configured: CheckoutMode, hosts: readonly (string | null | undefined)[]): CheckoutMode {
  if (configured === 'mock') return hosts.some(isLiveHost) ? 'off' : 'mock';
  return configured;
}

/**
 * دسترسی این درخواست به مسیر خرید (برش ۷٫۵، سؤال‌های ۱۶۳ و ۱۶۵):
 * - `off`: همهٔ مسیرهای خرید ۴۰۴، و «ثبت سفارش آنلاین به‌زودی».
 * - `paused`: مالک «متوقف» کرده؛ قیمت، کد، سفارش تازه و «دوباره پرداخت کن» ۵۰۳ `checkout_paused`، و خروج باز.
 * - `open`: باز؛ `preview` یعنی فقط با کوکی پیش‌نمایش همین مرورگر.
 * برگشت از درگاه و استعلام از این دسترسی نمی‌گذرند (`withPayments`): همیشه باز، با درگاه‌هایی که هست (سؤال ۱۶۴).
 */
export type CheckoutAccess = { kind: 'off' } | { kind: 'paused' } | { kind: 'open'; mode: 'mock' | 'live'; preview: boolean };

export const ACCESS_OFF: CheckoutAccess = { kind: 'off' };

export interface AccessFacts {
  /** حالت `.env` همین درخواست (`effectiveMode`). */
  mode: CheckoutMode;
  /** پایگاه داده و `SESSION_SECRET` هست؛ بی هر کدام مسیر خرید خاموش است (کد پیامکی بی کلید HMAC ساخته نمی‌شود). */
  services: boolean;
  /** فقط `live`: همهٔ تکه‌های آمادگی درست‌اند (`checkoutReadiness`). */
  ready: boolean;
  /** فقط `live`: مخاطب پنل. */
  audience: CheckoutAudience;
  /** فقط `live` و مخاطب «پیش‌نمایش»: این مرورگر کوکی پیش‌نمایش زنده دارد. */
  preview: boolean;
}

/**
 * حکم دسترسی (سؤال ۱۶۳): مخاطب فقط برای `live`؛ `mock` همان امروز. `live` آماده‌نشده `off` است، و مخاطب «پیش‌نمایش» بی کوکی هم
 * (سؤال ۱۶۵)، تا مشتری تازه همان «به‌زودی» را ببیند.
 */
export function accessOf(facts: AccessFacts): CheckoutAccess {
  if (facts.mode === 'off' || !facts.services) return ACCESS_OFF;
  if (facts.mode === 'mock') return { kind: 'open', mode: 'mock', preview: false };
  if (!facts.ready) return ACCESS_OFF;
  if (facts.audience === 'paused') return { kind: 'paused' };
  if (facts.audience === 'preview') return facts.preview ? { kind: 'open', mode: 'live', preview: true } : ACCESS_OFF;
  return { kind: 'open', mode: 'live', preview: false };
}

/* ────────────────────────── درگاه و پیامک وب ────────────────────────── */

export type WebGateway = 'zibal' | 'mock';

/**
 * درگاه‌های وب (برش ۷٫۵، سؤال ۱۶۴)، مستقل از اینکه مسیر خرید روشن است: زیبال فقط با `PAYMENT_PROVIDER=zibal`، و درگاه نمونه فقط در
 * `mock` و هرگز روی jozveyar.com (`liveHost`). برگشت و استعلام خودکار هر پرداختی که در پایگاه داده هست با درگاه خود آن، در هر حالت؛
 * پرداخت درگاهی که اینجا نیست انگار نیست. سرور بی هیچ‌کدام (وب ۳۱۰۱ CI، سایت زنده با `PAYMENT_PROVIDER=mock`) هیچ درخواستی به هیچ
 * درگاهی نمی‌دهد، استعلام خودکار هم نه.
 */
export function webGatewayNames(env: Env, liveHost = false): WebGateway[] {
  const names: WebGateway[] = [];
  if (env.PAYMENT_PROVIDER?.trim().toLowerCase() === 'zibal') names.push('zibal');
  if (configuredMode(env.CHECKOUT_MODE) === 'mock' && !liveHost) names.push('mock');
  return names;
}

/** درگاه شروع پرداخت در این حالت: زیبال در `live` (آمادگی `PAYMENT_PROVIDER=zibal` را می‌خواهد)، درگاه نمونه در `mock`، و `off` هیچ. */
export function startGatewayOf(mode: CheckoutMode): WebGateway | null {
  return mode === 'live' ? 'zibal' : mode === 'mock' ? 'mock' : null;
}

/** پیامک وب (سؤال ۱۶۴): در `mock` همیشه کنسولی (ADR-035)؛ وگرنه `SMS_PROVIDER`، که `live` آماده‌اش sms.ir است. */
export function webSmsProvider(env: Env): 'smsir' | 'console' {
  if (configuredMode(env.CHECKOUT_MODE) === 'mock') return 'console';
  return env.SMS_PROVIDER?.trim().toLowerCase() === 'smsir' ? 'smsir' : 'console';
}

/**
 * پیامک وب در این حالت (برش ۷٫۱، ADR-049؛ از ۷٫۵ سؤال ۱۶۴)، یک خط برای لاگ بالا آمدن: منبع، هرگز مقدار. سروری که نه مسیر خرید
 * دارد نه درگاهی، پیامکی نمی‌فرستد و خطی هم ندارد.
 */
export function describeSms(env: Env): string | null {
  if (configuredMode(env.CHECKOUT_MODE) === 'off' && webGatewayNames(env).length === 0) return null;
  return webSmsProvider(env) === 'smsir' ? '✓ پیامک وب: sms.ir (کلید و قالب‌ها از «تنظیمات» یا .env)' : '✓ پیامک وب: کنسولی (در sms_messages)';
}

/**
 * درگاه وب (برش ۷٫۲، ADR-050؛ از ۷٫۵ سؤال ۱۶۴)، یک خط برای لاگ بالا آمدن: منبع، هرگز مقدار. سرور بی درگاه خطی ندارد: به هیچ درگاهی
 * درخواست نمی‌دهد، استعلام خودکار هم نه.
 */
export function describePayments(env: Env): string | null {
  const names = webGatewayNames(env);
  if (names.length === 0) return null;
  const parts = names.map((name) =>
    name === 'zibal' ? 'زیبال (کد پذیرنده از «تنظیمات» یا .env، نشانی برگشت PAYMENT_CALLBACK_URL)' : 'درگاه نمونه',
  );
  const startsHere = configuredMode(env.CHECKOUT_MODE) !== 'off';
  return `✓ درگاه وب: ${parts.join(' و ')}؛ ${startsHere ? '' : 'فقط برگشت و استعلام (مسیر خرید off)؛ '}استعلام خودکار هر دقیقه`;
}

/**
 * یک خط برای لاگ بالا آمدن سرور؛ صاحب پروژه بعد از استقرار همین را می‌جوید. `live` اینجا نیست: خطش آمادگی است (`describeReadiness`)،
 * که بعد از مهاجرت از پایگاه داده خوانده می‌شود.
 */
export function describeMode(configured: Exclude<CheckoutMode, 'live'>, secretOk: boolean): string {
  if (configured === 'off') return '✓ مسیر خرید: off (ثبت سفارش آنلاین به‌زودی)';
  if (!secretOk) return `✗ مسیر خرید: ${configured} خواسته شد ولی SESSION_SECRET نیست یا کوتاه است — خاموش`;
  return `⚠ مسیر خرید: mock — درگاه نمونه و پیامک کنسولی؛ روی ${LIVE_DOMAIN} همیشه خاموش`;
}
