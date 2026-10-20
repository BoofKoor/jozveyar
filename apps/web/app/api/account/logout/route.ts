import { NextResponse, type NextRequest } from 'next/server';

import { safeNext } from '../../../../lib/account';
import { accountAuthService, withAccount } from '../../../../lib/server/accountContext';
import { authTokenOf, clearAuthCookie } from '../../../../lib/server/checkoutContext';
import { noStore } from '../../../../lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * «خروج» «سفارش‌های من» (برش ۱۲٫۱، سؤال ۳۰۵): نشست همین مرورگر باطل و کوکی `jy_auth` پاک، که مسیر خرید هم همان است؛ فایل‌ها (`jy_sid`)
 * می‌مانند. فرم ساده بی JS، و برگشت به همان صفحهٔ ورود (۳۰۳ با نشانی نسبی، پشت Nginx هم درست). «ورود با شمارهٔ دیگر» صفحهٔ سفارش (سؤال ۳۰۸)
 * همین فرم است با `next`، که صفحهٔ ورود پس از ورود به آن برمی‌گرداند؛ فقط آنچه `safeNext` می‌پذیرد.
 */
export function POST(request: NextRequest) {
  return withAccount(request, async () => {
    await accountAuthService().logout(authTokenOf(request));
    const value = (await request.formData().catch(() => null))?.get('next');
    const next = safeNext(typeof value === 'string' ? value : null);
    const location = next ? `/orders?next=${encodeURIComponent(next)}` : '/orders';
    const response = new NextResponse(null, { status: 303, headers: { ...noStore, location } });
    return clearAuthCookie(response, request);
  });
}
