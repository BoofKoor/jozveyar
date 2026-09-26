/**
 * دیوار اول پنل (ADR-037): پیش از هر صفحه، هر route و هر server action.
 *
 * - **دروازه:** هر نشانی باید با مسیر محرمانهٔ `ADMIN_BASE_PATH` شروع شود؛ وگرنه ۴۰۴ خالی، بی نشانی از
 *   پنل. فقط چند فایل همگانی بیرون دروازه‌اند، آن هم فقط GET: قلم‌ها و نشانک (مرورگر با نشانی مطلق
 *   می‌خواهدشان)، `robots.txt`، و `/api/health` برای healthcheck داکر. استاتیک نکست (`/_next/static/`) اصلاً
 *   از اینجا نمی‌گذرد و کدی اجرا نمی‌کند. فهرست عین نشانی است، نه پیشوند: `/fonts/login` هم ۴۰۴ است، چون
 *   route `[gate]` هر بخش اولی را می‌گیرد.
 * - **نوشتن فقط از خود پنل:** POST بی `Origin` پنل ۴۰۳.
 * - **CSP با nonce** هر درخواست، و سرآیندهای امنیتی (`lib/security.ts`).
 *
 * در نود اجرا می‌شود، نه edge: مسیر محرمانه در زمان اجرا از `.env` خوانده می‌شود، نه در build.
 */

import { randomBytes } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { gateOf } from './lib/gate';
import { contentSecurityPolicy, originOf, sameOrigin, SECURITY_HEADERS } from './lib/security';

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static/).*)'],
};

const PUBLIC = new Set([
  '/fonts/Vazirmatn-Regular.woff2',
  '/fonts/Vazirmatn-SemiBold.woff2',
  '/icon.svg',
  '/robots.txt',
  '/api/health',
]);

function secure(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
}

const notFound = () =>
  secure(
    new NextResponse('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    }),
  );

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const reading = request.method === 'GET' || request.method === 'HEAD';

  if (PUBLIC.has(pathname)) return reading ? secure(NextResponse.next()) : notFound();

  const gate = gateOf(process.env.ADMIN_BASE_PATH);
  if (!gate || (pathname !== `/${gate}` && !pathname.startsWith(`/${gate}/`))) return notFound();

  if (!reading) {
    const allowed = sameOrigin(request.headers.get('origin'), request.headers.get('host'), originOf(process.env.ADMIN_ORIGIN));
    if (!allowed) {
      return secure(new NextResponse('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } }));
    }
  }

  const nonce = randomBytes(16).toString('base64');
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production');
  const forwarded = new Headers(request.headers);
  // نکست nonce را از CSP خود درخواست برمی‌دارد و روی اسکریپت‌هایش می‌گذارد.
  forwarded.set('content-security-policy', csp);
  forwarded.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  return secure(response);
}
