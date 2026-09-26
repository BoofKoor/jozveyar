import type { NextRequest } from 'next/server';

import { authTokenOf, withCheckout } from '../../../../../../lib/server/checkoutContext';
import { respond } from '../../../../../../lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * «دوباره پرداخت کن» بعد از پرداخت ناموفق: تلاش تازه با همان قیمت منجمد. فقط صاحب سفارش، و فقط اگر
 * فایل‌ها دست‌کم یک ساعت دیگر زنده‌اند؛ وگرنه سفارش `expired` می‌شود.
 */
export function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return withCheckout(request, async ({ auth, checkout }) => {
    const user = await auth.authenticate(authTokenOf(request));
    return respond(await checkout.payAgain(user, (await params).token));
  });
}
