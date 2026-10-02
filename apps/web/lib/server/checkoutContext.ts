/**
 * سیم‌کشی مسیر خرید به پایگاه داده، آداپتورها و درخواست HTTP.
 *
 * هر مسیر خرید از `withCheckout` می‌گذرد: دسترسی این درخواست (`checkoutAccessOf`، برش ۷٫۵، ADR-052) اگر `off` است، پاسخ ۴۰۴ است،
 * مثل هر نشانی ناموجود (ADR-035)؛ اگر مالک «متوقف» کرده، ۵۰۳ `checkout_paused` (سؤال ۱۶۵). `off` است اگر `CHECKOUT_MODE` نگفته باشد،
 * اگر درگاه نمونه روی jozveyar.com خواسته شود، اگر پایگاه داده یا `SESSION_SECRET` نباشد (کد پیامکی بی کلید HMAC ساخته نمی‌شود)، اگر
 * `live` آماده نیست (`checkoutReadiness`)، یا اگر مخاطب «پیش‌نمایش مالک» است و این مرورگر کوکی پیش‌نمایش زنده ندارد.
 *
 * برگشت از درگاه جداست (`withPayments`، سؤال ۱۶۴): همیشه، در `off` و «متوقف» هم، با درگاه‌هایی که این سرور دارد؛ فقط پایگاه داده
 * می‌خواهد. ترمز برای سفارش تازه است، نه پولی که در راه است.
 *
 * صفحهٔ سفارش هم جداست (`orderViewFor`): پایگاه داده می‌خواهد، نه مسیر خرید. سفارشی که پرداخت شده با خاموش شدن مسیر خرید گم نمی‌شود.
 */

import { NextResponse, type NextRequest } from 'next/server';

import type { CheckoutAudience } from '@jozveyar/contracts';
import type { CheckoutMode, OrderView } from '@jozveyar/contracts/checkout';
import {
  checkoutAudience,
  checkoutReadiness,
  createAuthStore,
  createCheckoutPreviewStore,
  createOrderStore,
  createSecretStore,
  createSmsLog,
  createSmsOutbox,
  gatewayRejection,
  getDb,
  PREVIEW_TOKEN,
  previewHash,
  readinessLogger,
  secretsKeyOf,
  serviceKeyReader,
  TRACKING_ALERT_DAYS,
  type AuthStore,
  type CheckoutPreviewStore,
  type CheckoutReadiness,
  type OrderStore,
  type SecretStore,
} from '@jozveyar/db';
import { mockGateway, PaymentError, type PaymentGateway } from '@jozveyar/payments';
import { zibalGateway } from '@jozveyar/payments/zibal';
import { consoleTransport, loggedSms, type SmsTransport } from '@jozveyar/sms';
import { smsIrTransport } from '@jozveyar/sms/smsir';

import { createAuthService, tokenHash, type AuthService, type AuthUser } from './auth';
import { AUTO_INQUIRY_EVERY_MS, createCheckoutService, orderView, type CheckoutService } from './checkout';
import {
  ACCESS_OFF,
  accessOf,
  configuredMode,
  effectiveMode,
  isLiveHost,
  LIVE_DOMAIN,
  sessionSecretOf,
  startGatewayOf,
  webGatewayNames,
  webSmsProvider,
  type CheckoutAccess,
} from './checkoutMode';
import { noStore, respond } from './context';
import type { Result } from './result';
import { readSetting } from './settings';

/** کوکی نشست بعد از کد پیامکی (ADR-033)، جدا از `jy_sid` که مالک فایل‌هاست. */
export const AUTH_COOKIE = 'jy_auth';
const sessionSecret = () => sessionSecretOf(process.env.SESSION_SECRET);

type Env = Readonly<Record<string, string | undefined>>;
type Hosts = readonly (string | null | undefined)[];

/** نام‌هایی که درخواست برای میزبانش آورده: `Host`، `X-Forwarded-Host` و نشانی. */
export const hostsOf = (request: NextRequest): Hosts => [
  request.headers.get('host'),
  request.headers.get('x-forwarded-host'),
  request.nextUrl.hostname,
];

/* ────────────────────────── آمادگی و مخاطب ────────────────────────── */

let secretStore: SecretStore | undefined;
const secrets = () => (secretStore ??= createSecretStore(getDb()));

let previewStore: CheckoutPreviewStore | undefined;
/** پیوندها و کوکی‌های پیش‌نمایش مالک (`checkout_previews`). */
export const previews = () => (previewStore ??= createCheckoutPreviewStore(getDb()));

/**
 * لاگ آمادگی فقط با عوض شدن حال (سؤال ۱۶۱)، یکی برای بالا آمدن و همهٔ درخواست‌ها. روی `globalThis`، چون instrumentation بستهٔ جدای
 * خودش را دارد و نمونهٔ دوم همین ماژول همان خط را دوباره می‌نوشت.
 */
const READINESS_LOG = Symbol.for('jozveyar.web.checkoutReadinessLog');
function logReadiness(readiness: CheckoutReadiness) {
  const holder = globalThis as typeof globalThis & { [READINESS_LOG]?: (readiness: CheckoutReadiness) => void };
  (holder[READINESS_LOG] ??= readinessLogger())(readiness);
}

/** آمادگی `live` همین حالا (هر بار، بی کش؛ سؤال ۱۶۱)، با لاگ اگر حال عوض شد. بی پایگاه داده، تکهٔ `DATABASE_URL` خالی است. */
export async function liveReadiness(env: Env = process.env): Promise<CheckoutReadiness> {
  const readiness = await checkoutReadiness(env.DATABASE_URL ? secrets() : null, env, secretsKeyOf(env.SECRETS_KEY));
  logReadiness(readiness);
  return readiness;
}

/** `live` خواسته شده و آماده است، و مخاطب پنل؛ null یعنی `live` خواسته نشده، یا پایگاه داده یا رمز نشست نیست، یا آماده نیست. */
async function liveAudience(): Promise<CheckoutAudience | null> {
  if (configuredMode(process.env.CHECKOUT_MODE) !== 'live' || !process.env.DATABASE_URL || !sessionSecret()) return null;
  if (!(await liveReadiness()).ready) return null;
  return checkoutAudience(getDb());
}

/**
 * دسترسی این درخواست به مسیر خرید (`accessOf`). `off` و `mock` بی هیچ پرس‌وجو؛ `live` آمادگی و مخاطب را با هر درخواست می‌خواند،
 * و کوکی پیش‌نمایش را فقط وقتی مخاطب «پیش‌نمایش مالک» است.
 */
export async function checkoutAccessFor(hosts: Hosts, previewToken: string | null): Promise<CheckoutAccess> {
  const mode = effectiveMode(configuredMode(process.env.CHECKOUT_MODE), hosts);
  const services = Boolean(process.env.DATABASE_URL) && sessionSecret() !== null;
  if (mode !== 'live' || !services) return accessOf({ mode, services, ready: false, audience: 'paused', preview: false });
  const audience = await liveAudience();
  if (audience === null) return ACCESS_OFF;
  const preview =
    audience === 'preview' && previewToken !== null && (await previews().session(previewHash(previewToken), new Date())) !== null;
  return accessOf({ mode, services, ready: true, audience, preview });
}

/** دسترسی همین درخواست. */
export function checkoutAccessOf(request: NextRequest): Promise<CheckoutAccess> {
  return checkoutAccessFor(hostsOf(request), previewTokenOf(request));
}

/**
 * «درگاه آماده نیست» (۱۱۵؛ سؤال ۱۶۶): همان شرط و پنجرهٔ هشدار پیشخوان (`gatewayRejection`، `TRACKING_ALERT_DAYS`). سایت برای مشتری
 * تازه «متوقف» می‌گوید؛ مسیرها بسته نمی‌شوند و مخاطب دست نمی‌خورد، و با اولین آزمایش درست کد پذیرنده یا اولین پرداخت تازه خودش برمی‌گردد.
 */
export async function gatewayNotReady(at = new Date()): Promise<boolean> {
  const since = new Date(at.getTime() - TRACKING_ALERT_DAYS * 86_400_000);
  return (await gatewayRejection(getDb(), since)) !== null;
}

/** پیوند پیش‌نمایش باز می‌شود (سؤال ۱۶۷): `live` آماده، و مخاطب امروز «پیش‌نمایش مالک». */
export async function previewOpenable(): Promise<boolean> {
  return (await liveAudience()) === 'preview';
}

/* ────────────────────────── سرویس‌ها ────────────────────────── */

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

/**
 * آداپتور پیامک وب (برش ۷٫۱، ADR-049، سؤال ۱۱۴؛ از ۷٫۵ سؤال ۱۶۴): sms.ir فقط با `SMS_PROVIDER=smsir` و هرگز در `mock`، با کلید و
 * شناسهٔ قالب‌ها از «تنظیمات» یا `.env` با هر پیامک (`readServiceKey`)؛ وگرنه کنسولی (ADR-035). هرگز برگشت بی‌صدا از یکی به دیگری:
 * کلید خالی یعنی همان پیامک نمی‌رود. `live` آماده sms.ir است (آمادگی همین را می‌خواهد).
 */
export function webSmsTransport(env: Env = process.env): SmsTransport {
  if (webSmsProvider(env) !== 'smsir') return consoleTransport();
  return smsIrTransport({
    keys: serviceKeyReader(createSecretStore(getDb()), env, secretsKeyOf(env.SECRETS_KEY)),
    baseUrl: env.SMSIR_API_URL,
  });
}

/** درگاه شروعی که این حالت ندارد (`off`): مسیر خرید آنجا ۴۰۴ است، پس صدا زده نمی‌شود؛ اگر شد، «درگاه آماده نیست». */
const NO_START: PaymentGateway = {
  name: 'none',
  start: () => Promise.reject(new PaymentError('unconfigured')),
  inquire: () => Promise.reject(new PaymentError('unconfigured')),
  verify: () => Promise.reject(new PaymentError('unconfigured')),
};

/**
 * درگاه‌های وب (برش ۷٫۲، ADR-050؛ از ۷٫۵ سؤال ۱۶۴): برگشت و استعلام با هر درگاهی که این سرور دارد (`webGatewayNames`: زیبال با
 * `PAYMENT_PROVIDER=zibal`، کد پذیرنده از «تنظیمات» یا `.env` با هر درخواست؛ درگاه نمونه فقط در `mock` و هرگز روی jozveyar.com)، در
 * هر حالت. شروع پرداخت با درگاه همین حالت: زیبال در `live` با نشانی برگشت `PAYMENT_CALLBACK_URL`، درگاه نمونه در `mock` با نشانی
 * نسبی، و `off` هیچ. پرداخت درگاهی که اینجا نیست انگار نیست: درگاه نمونه هرگز در `live`، و زیبال بی `PAYMENT_PROVIDER=zibal` هرگز.
 */
export function webPayments(
  env: Env = process.env,
  liveHost = false,
): { gateway: PaymentGateway; gateways: Record<string, PaymentGateway>; callbackUrl: string } {
  const gateways: Record<string, PaymentGateway> = {};
  for (const name of webGatewayNames(env, liveHost)) {
    if (name === 'mock') {
      gateways.mock = mockGateway();
      continue;
    }
    const keys = serviceKeyReader(createSecretStore(getDb()), env, secretsKeyOf(env.SECRETS_KEY));
    gateways.zibal = zibalGateway({ merchant: () => keys('PAYMENT_MERCHANT_ID'), baseUrl: env.ZIBAL_API_URL });
  }
  const start = startGatewayOf(effectiveMode(configuredMode(env.CHECKOUT_MODE), liveHost ? [LIVE_DOMAIN] : []));
  const gateway = (start && gateways[start]) || NO_START;
  return { gateway, gateways, callbackUrl: start === 'mock' ? '/pay/callback' : (env.PAYMENT_CALLBACK_URL?.trim() ?? '') };
}

let transport: SmsTransport | undefined;
const transportOf = () => (transport ??= webSmsTransport());

/** سرویس خرید، یکی برای درخواست‌های jozveyar.com و یکی برای بقیه (دیوار درگاه نمونه)؛ فقط پایگاه داده می‌خواهد. */
const checkoutByHost = new Map<boolean, CheckoutService>();

function checkoutServiceFor(liveHost: boolean): CheckoutService {
  const cached = checkoutByHost.get(liveHost);
  if (cached) return cached;
  const { orders } = storesOf();
  const sms = transportOf();
  const service = createCheckoutService({
    orders,
    ...webPayments(process.env, liveHost),
    sms: { transport: sms, outbox: createSmsOutbox(getDb(), sms.name) },
  });
  checkoutByHost.set(liveHost, service);
  return service;
}

let authService: AuthService | undefined;

/** کد پیامکی و نشست؛ `SESSION_SECRET` می‌خواهد (دسترسی بی آن `off` است). */
function authServiceOf(): AuthService {
  if (authService) return authService;
  const { orders, auth } = storesOf();
  const setting = (key: string) => orders.setting(key);
  authService = createAuthService({
    store: auth,
    sms: loggedSms(transportOf(), createSmsLog(getDb())),
    secret: sessionSecret()!,
    siteHourlyLimit: () => readSetting(setting, 'otp.site_hourly_limit'),
    siteDailyLimit: () => readSetting(setting, 'otp.site_daily_limit'),
  });
  return authService;
}

function servicesFor(hosts: Hosts): Services {
  return { auth: authServiceOf(), checkout: checkoutServiceFor(hosts.some(isLiveHost)) };
}

/**
 * استعلام خودکار «پرداخت بی برگشت» (برش ۷٫۲، سؤال ۱۴۴؛ از ۷٫۵ سؤال ۱۶۴): هر دقیقه در خود وب، نه کارگر پایتون (آداپتور دوم به زبان
 * دیگر نه، ADR-050). در هر حالت، با هر درگاهی که این سرور دارد؛ سروری بی درگاه (وب ۳۱۰۱ CI، سایت زنده با `PAYMENT_PROVIDER=mock`) هیچ
 * درخواستی به هیچ درگاهی نمی‌دهد. چند نود هر کدام حلقهٔ خودش را دارد و `SKIP LOCKED` یک استعلام می‌گذارد. یک دور در هر زمان؛ شکست فقط
 * لاگ است.
 */
export function startAutoInquiry(log: (message: string, error?: unknown) => void = console.error): (() => void) | null {
  if (!process.env.DATABASE_URL) return null;
  if (webGatewayNames(process.env).length === 0) return null;
  const checkout = checkoutServiceFor(false);
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    checkout
      .autoInquiry()
      .then((done) => {
        if (done.settled > 0) console.log(`✓ استعلام خودکار: ${done.settled} تلاش پرداخت بسته شد.`);
      })
      .catch((error) => log('✗ استعلام خودکار پرداخت‌ها:', error))
      .finally(() => {
        running = false;
      });
  }, AUTO_INQUIRY_EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/* ────────────────────────── پاسخ ────────────────────────── */

export const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

export const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore });

/** مالک مسیر خرید را «متوقف» کرده (سؤال ۱۶۵): رابط «ثبت سفارش موقتاً متوقف است» را نشان می‌دهد، و جزوه و نشانی همان‌جا می‌مانند. */
export const checkoutPaused = () => NextResponse.json({ error: 'checkout_paused' }, { status: 503, headers: noStore });

export interface CheckoutContext extends Services {
  access: Exclude<CheckoutAccess, { kind: 'off' }>;
  /** حالت باز این درخواست؛ در «متوقف» همان `live`. */
  mode: Exclude<CheckoutMode, 'off'>;
}

/**
 * یک مسیر خرید: در `off` ۴۰۴، در «متوقف» ۵۰۳ `checkout_paused` (مگر `whenPaused: 'run'`، مثل خروج)، و خطای پیش‌بینی‌نشده ۵۰۳ با
 * لاگ.
 */
export async function withCheckout(
  request: NextRequest,
  handler: (ctx: CheckoutContext) => Promise<NextResponse>,
  options: { whenPaused?: 'refuse' | 'run' } = {},
): Promise<NextResponse> {
  try {
    const access = await checkoutAccessOf(request);
    if (access.kind === 'off') return notFound();
    if (access.kind === 'paused' && options.whenPaused !== 'run') return checkoutPaused();
    const mode = access.kind === 'open' ? access.mode : 'live';
    return await handler({ access, mode, ...servicesFor(hostsOf(request)) });
  } catch (error) {
    console.error('✗ خطای مسیر خرید:', error);
    return unavailable();
  }
}

/**
 * برگشت از درگاه (برش ۷٫۵، سؤال ۱۶۴ و ۱۶۵): همیشه، در `off` و «متوقف» هم؛ فقط پایگاه داده می‌خواهد، با درگاه‌هایی که این سرور دارد
 * (`webPayments`). بی پایگاه داده ۴۰۴، مثل سفارش ناموجود.
 */
export async function withPayments(
  request: NextRequest,
  handler: (checkout: CheckoutService) => Promise<NextResponse>,
): Promise<NextResponse> {
  if (!process.env.DATABASE_URL) return notFound();
  try {
    return await handler(checkoutServiceFor(hostsOf(request).some(isLiveHost)));
  } catch (error) {
    console.error('✗ خطای برگشت از درگاه:', error);
    return unavailable();
  }
}

/** سرویس‌ها برای پاسخی که خودش دسترسی را سنجیده (`GET /api/checkout`). */
export function checkoutServicesFor(request: NextRequest): Services {
  return servicesFor(hostsOf(request));
}

/** درگاه نمونه باز است (صفحهٔ سرور `/pay/mock`، ۳ج): `mock` روی میزبانی جز jozveyar.com، با پایگاه داده و `SESSION_SECRET`. */
export function mockGatewayOpen(hosts: Hosts): boolean {
  return effectiveMode(configuredMode(process.env.CHECKOUT_MODE), hosts) === 'mock' && Boolean(process.env.DATABASE_URL) && sessionSecret() !== null;
}

/** سرویس خرید برای صفحهٔ درگاه نمونه؛ صفحه پیش از این `mockGatewayOpen` را سنجیده. */
export function mockCheckoutService(): CheckoutService {
  return checkoutServiceFor(false);
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

/* ────────────────────────── کوکی پیش‌نمایش ────────────────────────── */

/**
 * کوکی پیش‌نمایش مالک (برش ۷٫۵، ADR-052، سؤال‌های ۱۶۷ و ۱۶۸): `jy_preview` (`HttpOnly`) خود دسترسی است و در پایگاه داده فقط هشش؛
 * `jy_pv` (بی `HttpOnly`، بی راز) فقط به اسکریپت کوچک layout می‌گوید که بپرسد و نوار را نشان دهد. هر دو با همان انقضای ۲۴ ساعته.
 */
export const PREVIEW_COOKIE = 'jy_preview';
export const PREVIEW_MARK_COOKIE = 'jy_pv';

/** توکن کوکی پیش‌نمایش، اگر شکلش درست است. */
export function previewTokenFrom(value: string | undefined): string | null {
  return value && PREVIEW_TOKEN.test(value) ? value : null;
}

export function previewTokenOf(request: NextRequest): string | null {
  return previewTokenFrom(request.cookies.get(PREVIEW_COOKIE)?.value);
}

export function withPreviewCookies(response: NextResponse, request: NextRequest, token: string, expiresAt: Date) {
  const secure = secureRequest(request);
  response.cookies.set(PREVIEW_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', expires: expiresAt });
  response.cookies.set(PREVIEW_MARK_COOKIE, '1', { httpOnly: false, sameSite: 'lax', secure, path: '/', expires: expiresAt });
  return response;
}

export function clearPreviewCookies(response: NextResponse, request: NextRequest) {
  const secure = secureRequest(request);
  response.cookies.set(PREVIEW_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 0 });
  response.cookies.set(PREVIEW_MARK_COOKIE, '', { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: 0 });
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
