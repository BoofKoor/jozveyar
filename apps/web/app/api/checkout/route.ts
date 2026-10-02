import { NextResponse, type NextRequest } from 'next/server';

import type { CheckoutStatus } from '@jozveyar/contracts/checkout';

import {
  authTokenOf,
  checkoutAccessOf,
  checkoutServicesFor,
  gatewayNotReady,
  unavailable,
} from '../../../lib/server/checkoutContext';
import { noStore } from '../../../lib/server/context';

export const dynamic = 'force-dynamic';

const status = (value: CheckoutStatus) => NextResponse.json(value, { headers: noStore });

/**
 * وضعیت مسیر خرید (ADR-035): مرورگر بعد از اولین قیمت می‌پرسد، نه در باندل اولیه. تنها مسیر خریدی است
 * که در `off` هم جواب می‌دهد، چون همین است که «ثبت سفارش آنلاین به‌زودی» را روشن می‌کند. اگر همین
 * مرورگر موبایلش را تأیید کرده، قدم کد لازم نیست.
 *
 * برش ۷٫۵ (ADR-052): `paused` وقتی مالک «متوقف» کرده (سؤال ۱۶۵)، یا درگاه آماده نیست (۱۱۵، سؤال ۱۶۶)؛ رابط «ثبت سفارش موقتاً
 * متوقف است» را جای «ادامه» می‌گذارد. مخاطب «پیش‌نمایش مالک» بی کوکی همان `off` است.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await checkoutAccessOf(request);
    if (access.kind === 'off') return status({ mode: 'off', auth: null });
    if (access.kind === 'paused') return status({ mode: 'paused', auth: null });
    if (access.mode === 'live' && (await gatewayNotReady())) return status({ mode: 'paused', auth: null });
    const user = await checkoutServicesFor(request).auth.authenticate(authTokenOf(request));
    return status({ mode: access.mode, auth: user ? { mobile: user.mobile } : null });
  } catch (error) {
    console.error('✗ خطای مسیر خرید:', error);
    return unavailable();
  }
}
