import { NextResponse, type NextRequest } from 'next/server';

import { accountAuthService, withAccount } from '../../../../../lib/server/accountContext';
import { authTokenOf, withAuthCookie } from '../../../../../lib/server/checkoutContext';
import { jsonBody, noStore, respond, sessionOf } from '../../../../../lib/server/context';
import { fail } from '../../../../../lib/server/result';

export const dynamic = 'force-dynamic';

/**
 * تأیید کد ورود «سفارش‌های من» (برش ۱۲٫۱). بدنه: `{ mobile, code }`. همان نشست مسیر خرید (سؤال ۳۰۵): کوکی تازهٔ `jy_auth` و نشست تازه، و
 * نشست قبلی همین مرورگر، اگر بود، باطل.
 */
export function POST(request: NextRequest) {
  return withAccount(request, async () => {
    const session = sessionOf(request);
    if (!session) return respond(fail(404, 'no_code'));
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    const auth = accountAuthService();
    const result = await auth.verifyCode(session, body);
    if (!result.ok) return respond(result);
    await auth.logout(authTokenOf(request));
    const response = NextResponse.json({ mobile: result.value.mobile }, { headers: noStore });
    return withAuthCookie(response, request, result.value.token, result.value.expiresAt);
  });
}
