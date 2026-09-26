import type { NextRequest } from 'next/server';

import { orderViewFor } from '../../../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

/**
 * صفحهٔ سفارش به JSON (ADR-033): شماره، وضعیت و روز تحویل به پست برای همه؛ بقیه فقط برای نشست صاحب
 * سفارش (`jy_auth`). پشت حالت مسیر خرید نیست: سفارش پرداخت‌شده با خاموش شدن خرید گم نمی‌شود.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return orderViewFor(request, (await params).token);
}
