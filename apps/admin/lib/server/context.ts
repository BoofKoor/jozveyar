/**
 * سیم‌کشی سرویس ورود پنل به پایگاه داده و درخواست نکست. هر چیزی که `next/headers` می‌خواهد اینجاست؛
 * منطق در `auth.ts`، بی نکست و تست‌شده.
 */

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import {
  createAdminStore,
  createPanelOrderStore,
  createPartnerStore,
  createSecretStore,
  createSettingsStore,
  createShipmentStore,
  createShippingReportStore,
  createSmsOutbox,
  createSmsStatsStore,
  createTariffStore,
  getDb,
  readServiceKey,
  smsIrKeysOf,
} from '@jozveyar/db';
import { SmsError, consoleTransport, smsIrCredit, smsIrSendVerify, smsIrTransport, smsProviderOf } from '@jozveyar/sms';
import { storageFromEnv } from '@jozveyar/storage';

import { panelPath } from '../gate';
import { createAdminAuth, type AdminAuth, type AdminSession } from './auth';
import { adminConfig, type AdminConfig } from './config';
import { clientIpOf, cookieName, isSecureRequest, sessionCookieOptions } from './cookie';
import { createPanelOrders, type PanelOrders } from './orders';
import { createPanelPartners, type PanelPartners } from './partners';
import { argon2Passwords } from './password';
import { createPanelReport, type PanelReport } from './report';
import { createPanelSettings, type PanelSettings } from './settings';
import { createPanelShipments, type PanelShipments } from './shipments';
import { createCreditReader, createPanelSms, type PanelSms } from './sms';
import { createPanelTariff, type PanelTariff } from './tariff';

interface Panel {
  config: AdminConfig;
  auth: AdminAuth;
  orders: PanelOrders;
  tariff: PanelTariff;
  settings: PanelSettings;
  partners: PanelPartners;
  shipments: PanelShipments;
  report: PanelReport;
  sms: PanelSms;
}

let cached: Panel | null | undefined;

function build(config: AdminConfig): Panel {
  // پیامک پنل (۷٫۱، سؤال ۱۱۴، ADR-049): `SMS_PROVIDER=smsir` واقعی، هر چیز دیگر کنسولی؛ جدا از `CHECKOUT_MODE`، پس ترمز مسیر خرید
  // پیامک رهگیری سفارش‌های پرداخت‌شده را نمی‌بندد. کلید و قالب sms.ir با هر پیامک از پنل یا `.env` (ADR-041)، و نشانی پایه از
  // `SMSIR_API_URL` (تست و CI فقط سرور ساختگی).
  const provider = smsProviderOf(process.env.SMS_PROVIDER);
  const baseUrl = process.env.SMSIR_API_URL;
  const secrets = createSecretStore(getDb());
  const settingsStore = createSettingsStore(getDb());
  const keyLog = (message: string) => console.error(message);
  const transport =
    provider === 'smsir' ? smsIrTransport({ baseUrl, keys: smsIrKeysOf(secrets, process.env, config.secretsKey, keyLog) }) : consoleTransport();
  const sms = { transport, outbox: createSmsOutbox(getDb(), transport.name) };
  const auth = createAdminAuth({
    store: createAdminStore(getDb()),
    passwords: argon2Passwords(),
    secretsKey: config.secretsKey,
    secret: config.secret,
  });
  return {
    config,
    auth,
    // بی استوریج (`S3_*` در `.env` نیست) فقط دانلود PDF جزوه بسته است؛ لاگ بالا آمدن همین را می‌گوید.
    orders: createPanelOrders({
      store: createPanelOrderStore(getDb()),
      storage: storageFromEnv(process.env)?.driver ?? null,
      // «دوباره بفرست» پیامک پرداخت (۷٫۱).
      sms,
      secret: config.secret,
    }),
    // فعال کردن تعرفه کار حساس است: همان کد تازهٔ ورود، با همان سقف اشتباه و قفل (ADR-038).
    tariff: createPanelTariff({ store: createTariffStore(getDb()), stepUp: auth.stepUp, secret: config.secret }),
    // کلیدها کار حساس‌اند (کد تازه)؛ مقدار `.env` هر کلید از همان `.env` کانتینر، با هر درخواست (ADR-041).
    // «آزمایش» کلیدهای sms.ir (۷٫۱، سؤال ۱۱۹) با همان آداپتور، هر `SMS_PROVIDER`: کار دستی مالک پیش از روشن کردن پیامک واقعی.
    settings: createPanelSettings({
      settings: settingsStore,
      secrets,
      smsTester: { credit: (apiKey) => smsIrCredit({ baseUrl }, apiKey), send: (input) => smsIrSendVerify({ baseUrl }, input) },
      stepUp: auth.stepUp,
      secretsKey: config.secretsKey,
      env: process.env,
      secret: config.secret,
    }),
    // چاپخانه‌ها (۵٫۲): فقط مالک، بی کد تازه؛ هر کار برگشت‌پذیر است و به‌تنهایی به کسی دسترسی نمی‌دهد (سؤال ۳۵).
    partners: createPanelPartners({ store: createPartnerStore(getDb()), secret: config.secret }),
    // ارسال (۶٫۱): ورود فایل پست؛ خواندن فایل با کارگر است، پس پنل بایت‌ها را فقط در پایگاه داده می‌گذارد (ADR-045). پیامک رهگیری
    // (۶٫۳، ADR-047) از ۷٫۱ با همان آداپتور بالا.
    shipments: createPanelShipments({
      store: createShipmentStore(getDb()),
      sms,
      secret: config.secret,
    }),
    // گزارش ارسال (۶٫۴، ADR-048): فقط خواندن، کوئری زنده؛ بازه‌های وزنش را سرویس تنظیمات عوض می‌کند.
    report: createPanelReport({ store: createShippingReportStore(getDb()) }),
    // سقف کد و اعتبار پیامک (۷٫۱): اعتبار فقط با پیامک واقعی خوانده می‌شود.
    sms: createPanelSms({
      stats: createSmsStatsStore(getDb()),
      setting: (key) => settingsStore.read(key),
      provider,
      credit: createCreditReader({
        enabled: provider === 'smsir',
        read: async () => {
          const apiKey = (await readServiceKey(secrets, 'SMS_API_KEY', process.env, config.secretsKey, keyLog)).value;
          if (!apiKey) throw new SmsError('unconfigured');
          return smsIrCredit({ baseUrl }, apiKey);
        },
        log: keyLog,
      }),
    }),
  };
}

/** سرویس‌ها، یا null اگر پیکربندی کامل نیست (پنل بسته؛ لاگ بالا آمدن گفته چرا). */
export function panel(): Panel | null {
  if (cached !== undefined) return cached;
  const config = adminConfig(process.env);
  cached = config ? build(config) : null;
  return cached;
}

/** پنل آماده و همان مسیر محرمانه، وگرنه ۴۰۴؛ دیوار دوم پس از `middleware.ts`. */
export function requirePanel(gate: string | null | undefined) {
  const ready = panel();
  if (!ready || gate !== ready.config.gate) notFound();
  return ready;
}

/** ادمین این درخواست، یک بار در هر درخواست (چیدمان و صفحه هر دو می‌پرسند). */
export const currentSession = cache(async (): Promise<AdminSession | null> => {
  const ready = panel();
  if (!ready) return null;
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return ready.auth.authenticate(jar.get(cookieName(isSecureRequest(h)))?.value);
});

/** صفحه یا کاری که ورود می‌خواهد: ادمین، یا رفتن به صفحهٔ ورود. */
export async function requireSession(gate: string): Promise<AdminSession> {
  requirePanel(gate);
  const session = await currentSession();
  if (!session) redirect(panelPath(gate, '/login'));
  return session;
}

export async function requestIp(): Promise<string> {
  return clientIpOf(await headers());
}

/** نشست تازه در کوکی، پس از ورود یا ثبت. */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const secure = isSecureRequest(h);
  jar.set(cookieName(secure), token, sessionCookieOptions(secure, expiresAt));
}

export async function sessionToken(): Promise<string | undefined> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  return jar.get(cookieName(isSecureRequest(h)))?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const secure = isSecureRequest(h);
  jar.set(cookieName(secure), '', { ...sessionCookieOptions(secure, new Date(0)), maxAge: 0 });
}

/**
 * نشانی بیرونی پنل برای پیوند ثبت: `ADMIN_ORIGIN`، یا اگر نیست از خود درخواست (پشت Nginx همان
 * `Host` و `X-Forwarded-Proto`).
 */
export async function publicOrigin(config: AdminConfig): Promise<string> {
  if (config.origin) return config.origin;
  const h = await headers();
  return `${isSecureRequest(h) ? 'https' : 'http'}://${h.get('host') ?? 'localhost'}`;
}
