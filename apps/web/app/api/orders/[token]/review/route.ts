import type { NextRequest } from 'next/server';

import { orderReviewFor } from '../../../../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

/**
 * «از جزوه راضی بودی؟» (برش ۱۲٫۳، ADR-064، سؤال ۲۱۳): نمره و متن اختیاری صاحب سفارش، فقط پس از «تحویل پست شد» و یک بار. پشت حالت
 * مسیر خرید نیست، مثل خود صفحهٔ سفارش.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return orderReviewFor(request, (await params).token);
}
