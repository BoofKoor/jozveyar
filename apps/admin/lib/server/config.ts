/**
 * پیکربندی پنل از `.env` سرور (همان `env_file` کانتینر وب): پایگاه داده، `SESSION_SECRET`، `SECRETS_KEY`،
 * `ADMIN_BASE_PATH` و `ADMIN_ORIGIN`. خالص است، بی I/O، تا تست بی سرور همهٔ حالت‌ها را بسنجد.
 *
 * هر کدام نباشد پنل بسته است (همه‌چیز ۴۰۴) و لاگ بالا آمدن نامش را می‌گوید، نه مقدارش.
 */

import { secretsKeyOf } from '@jozveyar/db';

import { gateOf } from '../gate';
import { originOf } from '../security';

/** همان کمینهٔ مسیر خرید (`apps/web/lib/server/checkoutMode.ts`)؛ `bootstrap.sh` ۶۴ رقم hex می‌سازد. */
export const MIN_SECRET_LENGTH = 32;

export interface AdminConfig {
  databaseUrl: string;
  secret: string;
  secretsKey: Buffer;
  gate: string;
  /** null یعنی از خود درخواست؛ دستور سرور بی آن پیوند نمی‌سازد. */
  origin: string | null;
}

type Env = Record<string, string | undefined>;

/** چه چیزی کم است؛ نام‌ها، نه مقدارها. */
export function configProblems(env: Env): string[] {
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push('DATABASE_URL نیست');
  if ((env.SESSION_SECRET ?? '').length < MIN_SECRET_LENGTH) problems.push('SESSION_SECRET نیست یا کوتاه است');
  if (!secretsKeyOf(env.SECRETS_KEY)) problems.push('SECRETS_KEY نیست یا ۶۴ رقم hex نیست');
  if (!gateOf(env.ADMIN_BASE_PATH)) problems.push('ADMIN_BASE_PATH نیست یا کوتاه‌تر از ۱۶ نویسه است');
  if (env.ADMIN_ORIGIN && !originOf(env.ADMIN_ORIGIN)) problems.push('ADMIN_ORIGIN نشانی درستی نیست');
  return problems;
}

export function adminConfig(env: Env): AdminConfig | null {
  if (configProblems(env).length > 0) return null;
  return {
    databaseUrl: env.DATABASE_URL!,
    secret: env.SESSION_SECRET!,
    secretsKey: secretsKeyOf(env.SECRETS_KEY)!,
    gate: gateOf(env.ADMIN_BASE_PATH)!,
    origin: originOf(env.ADMIN_ORIGIN),
  };
}

/**
 * پیامک پنل (برش ۷٫۱، ADR-049، سؤال ۱۱۴): `SMS_PROVIDER=smsir` یعنی sms.ir؛ هر چیز دیگر کنسولی. جدا از `CHECKOUT_MODE`، تا ترمز مسیر
 * خرید پیامک رهگیری سفارش‌های پرداخت‌شده را خاموش نکند.
 */
export const panelSmsProvider = (env: Env): 'smsir' | 'console' => (env.SMS_PROVIDER?.trim().toLowerCase() === 'smsir' ? 'smsir' : 'console');

/** sms.ir در کار است: پیامک پنل با آن، یا مسیر خرید سایت در `live` خواسته شده (وب همان `.env` را دارد). */
export const smsIrInUse = (env: Env) => panelSmsProvider(env) === 'smsir' || env.CHECKOUT_MODE?.trim().toLowerCase() === 'live';

/** یک خط برای لاگ بالا آمدن: منبع پیامک پنل، هرگز مقدار کلید. */
export function describeSms(env: Env): string {
  return panelSmsProvider(env) === 'smsir'
    ? '✓ پنل ادمین: پیامک sms.ir (SMS_PROVIDER=smsir)؛ کلید و قالب‌ها از «تنظیمات» یا .env'
    : '✓ پنل ادمین: پیامک کنسولی (در sms_messages)؛ SMS_PROVIDER=smsir نیست';
}

/**
 * درگاه نمونه در پنل (برش ۷٫۲، ADR-050): «استعلام از درگاه» هر پرداخت با درگاه خود همان پرداخت؛ زیبال همیشه، و درگاه نمونه فقط با
 * `CHECKOUT_MODE=mock`، همان دیوار وب (ADR-035): سایت زنده پرداخت درگاه نمونه ندارد.
 */
export const panelMockGateway = (env: Env) => env.CHECKOUT_MODE?.trim().toLowerCase() === 'mock';

/** یک خط برای لاگ بالا آمدن: درگاه‌های «استعلام از درگاه» و «آزمایش» کد پذیرنده (۷٫۲)، نشانی پایه و اینکه نشانی برگشت هست؛ بی مقدار کلید. */
export function describePayments(env: Env): string {
  const base = env.ZIBAL_API_URL?.trim() ? 'ZIBAL_API_URL' : 'نشانی پیش‌فرض زیبال';
  const callback = env.PAYMENT_CALLBACK_URL?.trim() ? 'PAYMENT_CALLBACK_URL هست' : 'PAYMENT_CALLBACK_URL نیست، پس «آزمایش» کد پذیرنده نه';
  return `✓ پنل ادمین: درگاه زیبال (${base})${panelMockGateway(env) ? ' و درگاه نمونه' : ''} برای «استعلام از درگاه»؛ ${callback}`;
}

/** یک خط برای لاگ بالا آمدن؛ `deploy-bundle.sh` همین را می‌جوید. مسیر محرمانه هرگز در آن نیست. */
export function describeConfig(env: Env): string {
  const problems = configProblems(env);
  if (problems.length > 0) return `✗ پنل ادمین: بسته — ${problems.join('؛ ')}`;
  const origin = originOf(env.ADMIN_ORIGIN);
  return `✓ پنل ادمین: آماده${origin ? ` روی ${new URL(origin).host}` : ''}`;
}
