import type { NextRequest } from 'next/server';

import { clientIp, withCheckout } from '../../../../lib/server/checkoutContext';
import { ensureSession, jsonBody, respond, withSessionCookie } from '../../../../lib/server/context';
import { fail } from '../../../../lib/server/result';

export const dynamic = 'force-dynamic';

/**
 * کد پیامکی (ADR-033). بدنه: `{ mobile }`، هر شکلی (`+98`، ارقام فارسی…). کد فقط در همین مرورگر
 * (`jy_sid`) پذیرفته می‌شود؛ خود کد هیچ‌وقت در پاسخ نیست، حتی با پیامک کنسولی.
 */
export function POST(request: NextRequest) {
  return withCheckout(request, async ({ auth }) => {
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    const { sessionHash, newToken } = ensureSession(request);
    const result = await auth.requestCode(sessionHash, clientIp(request), body);
    return withSessionCookie(respond(result), request, result.ok ? newToken : undefined);
  });
}
