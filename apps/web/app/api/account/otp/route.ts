import type { NextRequest } from 'next/server';

import { accountAuthService, withAccount } from '../../../../lib/server/accountContext';
import { clientIp } from '../../../../lib/server/checkoutContext';
import { ensureSession, jsonBody, respond, withSessionCookie } from '../../../../lib/server/context';
import { fail } from '../../../../lib/server/result';

export const dynamic = 'force-dynamic';

/**
 * کد ورود «سفارش‌های من» (برش ۱۲٫۱، ADR-068، سؤال ۳۰۶). بدنه: `{ mobile }`. کد واقعی فقط برای شماره‌ای که سفارشی دارد، و پاسخ برای هر شماره‌ای
 * که از سقف‌ها گذشت یکی است؛ کد مثل مسیر خرید فقط در همین مرورگر (`jy_sid`) پذیرفته می‌شود. پشت حالت مسیر خرید نیست.
 */
export function POST(request: NextRequest) {
  return withAccount(request, async () => {
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    const { sessionHash, newToken } = ensureSession(request);
    const result = await accountAuthService().requestAccountCode(sessionHash, clientIp(request), body);
    return withSessionCookie(respond(result), request, result.ok ? newToken : undefined);
  });
}
