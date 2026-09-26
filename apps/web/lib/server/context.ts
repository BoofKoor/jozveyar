/**
 * سیم‌کشی سرویس آپلود به پایگاه داده، استوریج و درخواست HTTP.
 *
 * اگر `DATABASE_URL` یا متغیرهای `S3_*` نباشند، سرویسی ساخته نمی‌شود و همهٔ
 * مسیرهای آپلود ۵۰۳ می‌دهند. این «خاموش» بودن عمدی است، نه خطا: سایت دقیقاً
 * مثل قبل از این برش کار می‌کند و مرورگر بی‌صدا با تحلیل خودش ادامه می‌دهد.
 * تست‌های سرتاسری روی همین حالت اجرا می‌شوند.
 */

import { createHash, randomBytes } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { createDocumentStore, getDb } from '@jozveyar/db';
import { storageFromEnv } from '@jozveyar/storage';

import { createUploadService, type Result, type UploadService } from './uploads';

/** ۴۰ گیگابایت از ۸۷ گیگابایت آزاد سرور (df، شهریور ۱۴۰۵). */
const DEFAULT_BUDGET_BYTES = 40 * 1024 ** 3;

let cached: UploadService | null | undefined;

export function getUploadService(): UploadService | null {
  if (cached !== undefined) return cached;
  const storage = storageFromEnv();
  if (!storage || !process.env.DATABASE_URL) {
    cached = null;
    return cached;
  }
  const budget = Number(process.env.STORAGE_BUDGET_BYTES);
  cached = createUploadService({
    store: createDocumentStore(getDb()),
    storage: storage.driver,
    budgetBytes: Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET_BYTES,
    siteOrigin: siteOrigin(),
  });
  return cached;
}

function siteOrigin(): string | undefined {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '').origin;
  } catch {
    return undefined;
  }
}

/* ────────────────────────── نشست ناشناس ────────────────────────── */

/**
 * کوکی نشست ناشناس. قبل از پرداخت هیچ هویتی نیست (تز محصول)، پس مالک سند
 * «این مرورگر» است. کوکی httpOnly است و در پایگاه داده فقط هشش می‌نشیند.
 */
export const SESSION_COOKIE = 'jy_sid';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** هش نشست موجود، یا null. */
export function sessionOf(request: NextRequest): string | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hash(token) : null;
}

/** نشست موجود یا تازه؛ اگر تازه است، کوکی باید روی پاسخ گذاشته شود. */
export function ensureSession(request: NextRequest): { sessionHash: string; newToken?: string } {
  const existing = sessionOf(request);
  if (existing) return { sessionHash: existing };
  const token = randomBytes(32).toString('base64url');
  return { sessionHash: hash(token), newToken: token };
}

export function withSessionCookie(response: NextResponse, request: NextRequest, token?: string) {
  if (token) {
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      // پشت Nginx درخواست http است ولی کاربر روی https.
      secure: request.headers.get('x-forwarded-proto') === 'https',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
  }
  return response;
}

/* ────────────────────────── پاسخ ────────────────────────── */

export const unavailable = () =>
  NextResponse.json({ error: 'storage_unavailable' }, { status: 503, headers: noStore });

export const noStore = { 'cache-control': 'no-store' };

/** نتیجهٔ سرویس (آپلود یا مسیر خرید) به پاسخ: مقدار، یا کد شکست با جزئیاتش و وضعیت HTTP. */
export function respond<T>(
  result: Result<T> | { ok: true; value: T } | ({ ok: false; status: number; error: string } & Record<string, unknown>),
): NextResponse {
  if (result.ok) return NextResponse.json(result.value, { headers: noStore });
  const { status, ok: _ok, ...body } = result;
  return NextResponse.json(body, { status, headers: noStore });
}

/** اجرای یک مسیر با خطای پیش‌بینی‌نشده → ۵۰۳، تا مرورگر بی‌صدا ادامه دهد. */
export async function guarded(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    console.error('✗ خطای مسیر آپلود:', error);
    return unavailable();
  }
}

export async function jsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
