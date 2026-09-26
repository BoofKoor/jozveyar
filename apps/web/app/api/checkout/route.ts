import { NextResponse, type NextRequest } from 'next/server';

import type { CheckoutStatus } from '@jozveyar/contracts/checkout';

import { authTokenOf, checkoutModeOf, withCheckout } from '../../../lib/server/checkoutContext';
import { noStore } from '../../../lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * وضعیت مسیر خرید (ADR-035): مرورگر بعد از اولین قیمت می‌پرسد، نه در باندل اولیه. تنها مسیر خریدی است
 * که در `off` هم جواب می‌دهد، چون همین است که «ثبت سفارش آنلاین به‌زودی» را روشن می‌کند. اگر همین
 * مرورگر موبایلش را تأیید کرده، قدم کد لازم نیست.
 */
export function GET(request: NextRequest) {
  if (checkoutModeOf(request) === 'off') {
    const status: CheckoutStatus = { mode: 'off', auth: null };
    return NextResponse.json(status, { headers: noStore });
  }
  return withCheckout(request, async ({ mode, auth }) => {
    const user = await auth.authenticate(authTokenOf(request));
    const status: CheckoutStatus = { mode, auth: user ? { mobile: user.mobile } : null };
    return NextResponse.json(status, { headers: noStore });
  });
}
