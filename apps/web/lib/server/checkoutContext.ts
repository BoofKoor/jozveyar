/**
 * سیم‌کشی مسیر خرید به پایگاه داده، آداپتورها و درخواست HTTP.
 *
 * هر مسیر خرید از `withCheckout` می‌گذرد: حالت این درخواست (`checkoutMode.ts`) اگر `off` است، پاسخ ۴۰۴
 * است، مثل هر نشانی ناموجود (ADR-035). `off` است اگر `CHECKOUT_MODE` نگفته باشد، اگر درگاه نمونه روی
 * jozveyar.com خواسته شود، یا اگر پایگاه داده یا `SESSION_SECRET` نباشد (کد پیامکی بی کلید HMAC ساخته
 * نمی‌شود).
 *
 * صفحهٔ سفارش جداست (`orderViewFor`): پایگاه داده می‌خواهد، نه مسیر خرید. سفارشی که پرداخت شده با خاموش
 * شدن مسیر خرید گم نمی‌شود.
 */

import { NextResponse, type NextRequest } from 'next/server';

import type { CheckoutMode, OrderView } from '@jozveyar/contracts/checkout';
import {
  createAuthStore,
  createOrderStore,
  createSecretStore,
  createSmsLog,
  createSmsOutbox,
  getDb,
  secretsKeyOf,
  smsIrKeysOf,
  type AuthStore,
  type OrderStore,
} from '@jozveyar/db';
import { consoleTransport, deliverQueued, loggedSms, smsIrTransport, type SmsTransport } from '@jozveyar/sms';

import { createAuthService, tokenHash, type AuthService, type AuthUser } from './auth';
import { createCheckoutService, orderView, type CheckoutService } from './checkout';
import { configuredMode, effectiveMode, sessionSecretOf } from './checkoutMode';
import { noStore, respond } from './context';
import { mockGateway } from './payments';
import type { Result } from './result';
import { readSetting } from './settings';

/** کوکی نشست بعد از کد پیامکی (ADR-033)، جدا از `jy_sid` که مالک فایل‌هاست. */
export const AUTH_COOKIE = 'jy_auth';
const sessionSecret = () => sessionSecretOf(process.env.SESSION_SECRET);

/**
 * حالت مسیر خرید برای نام‌هایی که درخواست برای میزبانش آورده (`Host`، `X-Forwarded-Host`، نشانی). صفحهٔ
 * سرور (درگاه نمونه) هم همین را با سرآیندهای خودش صدا می‌زند.
 */
export function checkoutModeFor(hosts: readonly (string | null | undefined)[]): CheckoutMode {
  const configured = configuredMode(process.env.CHECKOUT_MODE);
  if (configured === 'off' || !process.env.DATABASE_URL || !sessionSecret()) return 'off';
  return effectiveMode(configured, hosts);
}

/** حالت مسیر خرید برای همین درخواست. */
export function checkoutModeOf(request: NextRequest): CheckoutMode {
  return checkoutModeFor([request.headers.get('host'), request.headers.get('x-forwarded-host'), request.nextUrl.hostname]);
}

interface Stores {
  orders: OrderStore;
  auth: AuthStore;
}

let stores: Stores | undefined;

function storesOf(): Stores {
  if (stores) return stores;
  const db = getDb();
  stores = { orders: createOrderStore(db), auth: createAuthStore(db) };
  return stores;
}

interface Services {
  auth: AuthService;
  checkout: CheckoutService;
}

let services: Services | undefined;

/**
 * پیامک مسیر خرید (سؤال ۱۱۴، ADR-049): `live` فقط sms.ir و `mock` فقط کنسولی (ADR-035)؛ هرگز برگشت بی‌صدا از یکی به دیگری. کلید API و
 * شناسهٔ قالب sms.ir با هر پیامک از پنل یا `.env` خوانده می‌شوند (`smsIrKeysOf`، ADR-041)، و نشانی پایه از `SMSIR_API_URL` (تست و CI
 * فقط سرور ساختگی).
 */
export function checkoutSmsTransport(mode: CheckoutMode, env: Readonly<Record<string, string | undefined>> = process.env): SmsTransport {
  if (mode !== 'live') return consoleTransport();
  // پایگاه داده با اولین پیامک، نه با ساختن آداپتور.
  let keys: ReturnType<typeof smsIrKeysOf> | undefined;
  return smsIrTransport({
    baseUrl: env.SMSIR_API_URL,
    keys: (purpose) =>
      (keys ??= smsIrKeysOf(createSecretStore(getDb()), env, secretsKeyOf(env.SECRETS_KEY), (message) => console.error(message)))(purpose),
  });
}

/**
 * سرویس‌های خرید. امروز فقط `mock` به اینجا می‌رسد (`live` تا ۷٫۵ خاموش است، `LIVE_ADAPTERS_READY`)، پس آداپتورها درگاه نمونه و
 * پیامک کنسولی‌اند؛ پیامک `live` از همین حالا sms.ir است (`checkoutSmsTransport`). پیامک پرداخت از صف است (۷٫۱): ردیف منتظر در
 * تراکنش تسویه، و فرستادن بعد از commit با همان `deliverQueued` پنل.
 */
function servicesOf(): Services {
  if (services) return services;
  const { orders, auth } = storesOf();
  const transport = checkoutSmsTransport(configuredMode(process.env.CHECKOUT_MODE));
  const outbox = createSmsOutbox(getDb(), transport.name);
  const setting = (key: string) => orders.setting(key);
  services = {
    auth: createAuthService({
      store: auth,
      sms: loggedSms(transport, createSmsLog(getDb())),
      secret: sessionSecret()!,
      siteHourlyLimit: () => readSetting(setting, 'otp.site_hourly_limit'),
      siteDailyLimit: () => readSetting(setting, 'otp.site_daily_limit'),
    }),
    checkout: createCheckoutService({
      orders,
      gateway: mockGateway(),
      paidSms: (id) => deliverQueued({ outbox, transport }, [id]),
      callbackUrl: '/pay/callback',
    }),
  };
  return services;
}

/* ────────────────────────── پاسخ ────────────────────────── */

export const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore });

/** یک مسیر خرید: در `off` ۴۰۴، و خطای پیش‌بینی‌نشده ۵۰۳ با لاگ. */
export async function withCheckout(
  request: NextRequest,
  handler: (ctx: Services & { mode: CheckoutMode }) => Promise<NextResponse>,
): Promise<NextResponse> {
  const mode = checkoutModeOf(request);
  if (mode === 'off') return notFound();
  try {
    return await handler({ mode, ...servicesOf() });
  } catch (error) {
    console.error('✗ خطای مسیر خرید:', error);
    return unavailable();
  }
}

/**
 * سرویس‌های خرید برای صفحهٔ سرور (درگاه نمونه، ۳ج)؛ صفحه پیش از این `checkoutModeFor` را سنجیده. مثل
 * `withCheckout`، خطای پیش‌بینی‌نشده را صفحه خودش نشان می‌دهد.
 */
export function checkoutServices(): Services {
  return servicesOf();
}

/**
 * صفحهٔ سفارش (JSON یا صفحهٔ سرور `/order/<توکن>`): پایگاه داده کافی است، مسیر خرید نه. null یعنی پایگاه
 * داده‌ای نیست؛ آن‌وقت مثل سفارش ناموجود.
 */
export async function orderViewOf(token: string, authToken: string | null): Promise<Result<OrderView> | null> {
  if (!process.env.DATABASE_URL) return null;
  const { orders, auth } = storesOf();
  const at = new Date();
  const session = await sessionUser(auth, authToken, at);
  return orderView(orders, token, session, at);
}

export async function orderViewFor(request: NextRequest, token: string): Promise<NextResponse> {
  try {
    const view = await orderViewOf(token, authTokenOf(request));
    return view ? respond(view) : notFound();
  } catch (error) {
    console.error('✗ خطای صفحهٔ سفارش:', error);
    return unavailable();
  }
}

async function sessionUser(store: AuthStore, token: string | null, at: Date): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await store.findSession(tokenHash(token), at);
  return session ? { userId: session.userId, mobile: session.mobile } : null;
}

/* ────────────────────────── کوکی نشست ────────────────────────── */

/** مقدار کوکی `jy_auth`، اگر شکلش درست است؛ صفحهٔ سرور با `cookies()` همین را می‌خواند. */
export function authTokenFrom(value: string | undefined): string | null {
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

/** توکن `jy_auth` این درخواست، اگر شکلش درست است. */
export function authTokenOf(request: NextRequest): string | null {
  return authTokenFrom(request.cookies.get(AUTH_COOKIE)?.value);
}

const secureRequest = (request: NextRequest) => request.headers.get('x-forwarded-proto') === 'https';

export function withAuthCookie(response: NextResponse, request: NextRequest, token: string, expiresAt: Date) {
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // پشت Nginx درخواست http است ولی کاربر روی https (همان `jy_sid`).
    secure: secureRequest(request),
    path: '/',
    expires: expiresAt,
  });
  return response;
}

export function clearAuthCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureRequest(request),
    path: '/',
    maxAge: 0,
  });
  return response;
}

/**
 * IP کاربر برای سقف کد پیامکی. پشت Nginx از `X-Real-IP`، که Nginx خودش می‌گذارد و مقدار کاربر را
 * بازنویسی می‌کند (`infra/nginx/conf.d/jozveyar.conf`)؛ کانتینر وب پورتی بیرون باز نکرده. بی Nginx (توسعه و
 * CI) آخرین حلقهٔ `X-Forwarded-For`، و اگر نبود `unknown`.
 */
export function clientIp(request: NextRequest): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? 'unknown';
}
