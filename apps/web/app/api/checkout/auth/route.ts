import { NextResponse, type NextRequest } from 'next/server';

import { authTokenOf, clearAuthCookie, withCheckout } from '../../../../lib/server/checkoutContext';
import { noStore } from '../../../../lib/server/context';

export const dynamic = 'force-dynamic';

/** «عوض کن» در مرور (ADR-033): نشست باطل و کوکی `jy_auth` پاک می‌شود؛ فایل‌ها (`jy_sid`) می‌مانند. */
export function DELETE(request: NextRequest) {
  return withCheckout(request, async ({ auth }) => {
    await auth.logout(authTokenOf(request));
    return clearAuthCookie(NextResponse.json({ loggedOut: true }, { headers: noStore }), request);
  });
}
