import type { NextRequest } from 'next/server';

import { authTokenOf, withCheckout } from '../../../../lib/server/checkoutContext';
import { jsonBody, respond, sessionOf } from '../../../../lib/server/context';
import { fail } from '../../../../lib/server/result';

export const dynamic = 'force-dynamic';

/**
 * قیمت سرور برای قدم شهر و مرور (ADR-034): تعداد صفحهٔ هر سند از تحلیل سرور، تعرفهٔ فعال پایگاه داده،
 * و کرایهٔ منطقهٔ استان. بدنه: `{ items: [{ documentIds, colorMode, paperTypeId, sidesMode,
 * bindingTypeId, copies }], place: { provinceId, cityId } | null, discountCode: string | null }`؛ کد تخفیف (برش ۱۱٫۴) فقط با نشست.
 */
export function POST(request: NextRequest) {
  return withCheckout(request, async ({ auth, checkout }) => {
    const session = sessionOf(request);
    if (!session) return respond(fail(404, 'documents_not_found'));
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    // نشست فقط برای کد تخفیف مرور لازم است (برش ۱۱٫۴)؛ قدم شهر بی آن.
    const user = await auth.authenticate(authTokenOf(request));
    return respond(await checkout.quote(session, body, user));
  });
}
