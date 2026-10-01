import { NextResponse, type NextRequest } from 'next/server';

import { withCheckout } from '../../../../lib/server/checkoutContext';
import { noStore, respond } from '../../../../lib/server/context';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ key: string }> };

/**
 * برگشت از درگاه (برش ۷٫۲، ADR-050، سؤال ۱۴۵): `/pay/callback/<کلید برگشت همین تلاش>`. فقط کلید خوانده می‌شود؛ پارامترهایی که زیبال به
 * نشانی می‌افزاید (`trackId`، `success`، `status`، `orderId`) هیچ‌وقت، پس برگشت زودرس با «ناموفق» پرداخت را نمی‌سوزاند و «موفق» دست‌ساز سفارش
 * نمی‌سازد. سنجش سمت سرور، زیر قفل پرداخت و سفارش (`checkout.settle`)؛ برگشت تکراری (رفرش، Push Transaction زیبال) همان نتیجه را می‌دهد. بعد،
 * صفحهٔ سفارش (۳ج): موفق، «در حال بررسی»، یا «پرداخت انجام نشد» با «دوباره پرداخت کن».
 *
 * `Location` نسبی است: پشت Nginx نشانی درخواست `http` است، و نشانی کامل ساختن از آن کاربر را از https بیرون می‌برد.
 */
export function GET(request: NextRequest, { params }: Params) {
  return withCheckout(request, async ({ checkout }) => {
    const result = await checkout.settle((await params).key);
    if (!result.ok) return respond(result);
    return new NextResponse(null, {
      status: 303,
      headers: { ...noStore, location: `/order/${result.value.token}` },
    });
  });
}

/**
 * همان برگشت با POST: شکل Push Transaction زیبال (تأیید را تا ۵ دقیقه پس از پرداخت ۵ بار به سایت دوباره می‌فرستد) در مستند دیده نشده؛ پس
 * هر دو، با همان کلید و همان سنجش. پاسخ بی هدایت و بی توکن سفارش.
 */
export function POST(request: NextRequest, { params }: Params) {
  return withCheckout(request, async ({ checkout }) => {
    const result = await checkout.settle((await params).key);
    if (!result.ok) return respond(result);
    return NextResponse.json({ ok: true, payment: result.value.payment }, { headers: noStore });
  });
}
