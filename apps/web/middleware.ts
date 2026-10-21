/**
 * نشانی صفحه‌های فرود (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۱ و ۴۶۶): ۳۰۱ نشانی‌ای که صفحهٔ فرودی پس از انتشار عوضش کرد، صفحه‌ای که مالک «به صفحهٔ
 * دیگری» برداشت، و `/chap-jozve`، که «چاپ جزوه» خود صفحهٔ اصلی است؛ و رسم صفحهٔ فرودی که روی سایت است از مسیر درونی `/lp/<نشانی>`
 * (`lib/routes.ts`). ۳۰۱ واقعی، نه ۳۰۸ی که `permanentRedirect` نکست می‌دهد: همه‌جا «انتقال دائمی» یعنی ۳۰۱، و موتورهای جست‌وجوی دیگر (ذره‌بین)
 * ۳۰۸ را شاید نشناسند.
 *
 * فقط نشانی یک‌تکه با حرف کوچک لاتین، رقم و خط تیره، و خود مسیر درونی، از اینجا می‌گذرد. فهرست‌ها از پایگاه داده‌اند و دست‌بالا یک دقیقه در
 * حافظهٔ همین پردازه می‌مانند، مثل ISR صفحه‌ها: انتشار، زمان‌داری که ساعتش رسید و برداشتن تا یک دقیقه بعد روی سایت است. پایگاه داده که جواب نداد،
 * فهرست قبلی (یا هیچ) می‌ماند و درخواست راه خودش را می‌رود. در نود اجرا می‌شود، نه edge، چون به پایگاه داده می‌رسد (مثل میان‌افزار پنل).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSitePageStore, getDb } from '@jozveyar/db';

import { routeFor, type SiteRouteLists } from './lib/routes';

export const config = {
  runtime: 'nodejs',
  matcher: ['/:slug([a-z0-9][a-z0-9-]*)', '/lp', '/lp/:path*'],
};

/** هر چند وقت فهرست‌ها از پایگاه داده خوانده می‌شود؛ همان ISR صفحه‌ها. */
const TTL_MS = 60_000;

const NONE: SiteRouteLists = { redirects: new Map(), pages: new Set() };

let cached: { at: number; lists: SiteRouteLists } | null = null;
let loading: Promise<SiteRouteLists> | null = null;

async function load(): Promise<SiteRouteLists> {
  if (process.env.NEXT_PHASE === 'phase-production-build' || !process.env.DATABASE_URL) return NONE;
  try {
    const lists = await createSitePageStore(getDb()).routes(new Date());
    cached = { at: Date.now(), lists };
    return lists;
  } catch (error) {
    console.error('✗ سایت: نشانی صفحه‌ها از پایگاه داده خوانده نشد؛ فهرست قبلی می‌ماند.', error);
    const lists = cached?.lists ?? NONE;
    cached = { at: Date.now(), lists };
    return lists;
  }
}

async function routeLists(): Promise<SiteRouteLists> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.lists;
  loading ??= load().finally(() => {
    loading = null;
  });
  return loading;
}

export async function middleware(request: NextRequest) {
  const decision = routeFor(request.nextUrl.pathname, await routeLists());
  if (!decision) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = decision.to;
  return decision.kind === 'redirect' ? NextResponse.redirect(url, 301) : NextResponse.rewrite(url);
}
