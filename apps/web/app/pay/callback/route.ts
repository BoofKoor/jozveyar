import { NextResponse, type NextRequest } from 'next/server';

import { withCheckout } from '../../../lib/server/checkoutContext';
import { noStore, respond } from '../../../lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * برگشت از درگاه، با شکل زرین‌پال: `?Authority=…&Status=OK|NOK`. سنجش سمت سرور است (`checkout.settle`)،
 * زیر قفل پرداخت و سفارش؛ برگشت تکراری (رفرش) همان نتیجه را می‌دهد. بعد، صفحهٔ سفارش (۳ج): موفق یا
 * «پرداخت انجام نشد» با «دوباره پرداخت کن».
 *
 * `Location` نسبی است: پشت Nginx نشانی درخواست `http` است، و نشانی کامل ساختن از آن کاربر را از https
 * بیرون می‌برد.
 */
export function GET(request: NextRequest) {
  return withCheckout(request, async ({ checkout }) => {
    const query = request.nextUrl.searchParams;
    const result = await checkout.settle(query.get('Authority') ?? '', query.get('Status'));
    if (!result.ok) return respond(result);
    return new NextResponse(null, {
      status: 303,
      headers: { ...noStore, location: `/order/${result.value.token}` },
    });
  });
}
