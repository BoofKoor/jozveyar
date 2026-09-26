import type { NextRequest } from 'next/server';

import { authTokenOf, withCheckout } from '../../../../lib/server/checkoutContext';
import { jsonBody, respond, sessionOf } from '../../../../lib/server/context';
import { fail } from '../../../../lib/server/result';

export const dynamic = 'force-dynamic';

/**
 * «پرداخت» (ADR-034): سفارش در یک تراکنش ساخته می‌شود و پرداخت شروع می‌شود؛ پاسخ نشانی درگاه را دارد.
 * بدنه: همان قیمت، به‌علاوهٔ `place` (اجباری)، `recipient`، `checkoutKey`، `expectedTotalRials` و
 * `quoteSnapshot`. نشست `jy_auth` لازم است؛ سندها باید مال همین مرورگر (`jy_sid`) باشند.
 */
export function POST(request: NextRequest) {
  return withCheckout(request, async ({ auth, checkout }) => {
    const session = sessionOf(request);
    if (!session) return respond(fail(404, 'documents_not_found'));
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    const user = await auth.authenticate(authTokenOf(request));
    return respond(await checkout.placeOrder(session, user, body));
  });
}
