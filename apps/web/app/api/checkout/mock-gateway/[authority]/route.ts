import type { NextRequest } from 'next/server';

import { withCheckout } from '../../../../../lib/server/checkoutContext';
import { jsonBody, respond } from '../../../../../lib/server/context';
import { fail } from '../../../../../lib/server/result';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ authority: string }> };

/**
 * درگاه نمونه (ADR-035)، فقط در `CHECKOUT_MODE=mock` و هرگز روی jozveyar.com. صفحه‌اش در ۳ج می‌آید
 * (`/pay/mock/<authority>`)؛ اینجا فقط داده و ثبت تصمیم.
 */
export function GET(request: NextRequest, { params }: Params) {
  return withCheckout(request, async ({ checkout }) => respond(await checkout.mockGatewayView((await params).authority)));
}

/**
 * تصمیم صفحهٔ درگاه: `{ decision: 'success' | 'failure' | 'cancel' }`. پاسخ نشانی برگشت به شکل زرین‌پال
 * است؛ برگشت همین تصمیم ثبت‌شده را می‌خواند، نه `Status` نشانی را.
 */
export function POST(request: NextRequest, { params }: Params) {
  return withCheckout(request, async ({ checkout }) => {
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    return respond(await checkout.mockDecision((await params).authority, body));
  });
}
