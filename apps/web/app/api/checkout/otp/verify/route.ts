import { NextResponse, type NextRequest } from 'next/server';

import { authTokenOf, withAuthCookie, withCheckout } from '../../../../../lib/server/checkoutContext';
import { jsonBody, noStore, respond, sessionOf } from '../../../../../lib/server/context';
import { fail } from '../../../../../lib/server/result';

export const dynamic = 'force-dynamic';

/**
 * تأیید کد. بدنه: `{ mobile, code }`. درست: کوکی تازهٔ `jy_auth` (httpOnly، ۳۰ روز) و نشست تازه؛ نشست
 * قبلی همین مرورگر، اگر بود، باطل می‌شود.
 */
export function POST(request: NextRequest) {
  return withCheckout(request, async ({ auth }) => {
    const session = sessionOf(request);
    if (!session) return respond(fail(404, 'no_code'));
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    const result = await auth.verifyCode(session, body);
    if (!result.ok) return respond(result);
    await auth.logout(authTokenOf(request));
    const response = NextResponse.json({ mobile: result.value.mobile }, { headers: noStore });
    return withAuthCookie(response, request, result.value.token, result.value.expiresAt);
  });
}
