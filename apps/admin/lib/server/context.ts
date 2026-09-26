/**
 * سیم‌کشی سرویس ورود پنل به پایگاه داده و درخواست نکست. هر چیزی که `next/headers` می‌خواهد اینجاست؛
 * منطق در `auth.ts`، بی نکست و تست‌شده.
 */

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { createAdminStore, getDb } from '@jozveyar/db';

import { panelPath } from '../gate';
import { createAdminAuth, type AdminAuth, type AdminSession } from './auth';
import { adminConfig, type AdminConfig } from './config';
import { clientIpOf, cookieName, isSecureRequest, sessionCookieOptions } from './cookie';
import { argon2Passwords } from './password';

let cached: { config: AdminConfig; auth: AdminAuth } | null | undefined;

/** سرویس، یا null اگر پیکربندی کامل نیست (پنل بسته؛ لاگ بالا آمدن گفته چرا). */
export function panel(): { config: AdminConfig; auth: AdminAuth } | null {
  if (cached !== undefined) return cached;
  const config = adminConfig(process.env);
  cached = config
    ? {
        config,
        auth: createAdminAuth({
          store: createAdminStore(getDb()),
          passwords: argon2Passwords(),
          secretsKey: config.secretsKey,
          secret: config.secret,
        }),
      }
    : null;
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
