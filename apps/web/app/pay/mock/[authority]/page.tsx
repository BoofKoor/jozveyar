import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Logo } from '@jozveyar/ui';
import { GateActions } from '../../../../components/checkout/GateActions';
import { Tomans } from '../../../../components/checkout/parts';
import { checkoutModeFor, checkoutServices } from '../../../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'درگاه پرداخت نمونه',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

/**
 * درگاه نمونه (ADR-035؛ طرح `checkout.html`، حالت «درگاه نمونه»): جای صفحهٔ بانک، فقط در `CHECKOUT_MODE=mock`
 * و هرگز روی jozveyar.com — همان دیوار مسیرهای خرید، از سرآیندهای همین درخواست. بیرون از آن، ۴۰۴ مثل هر نشانی
 * ناموجود. بی پوستهٔ سایت (نشانهٔ `data-gate`، checkout.css): پذیرنده، شمارهٔ سفارش و مبلغ، و سه تصمیم.
 *
 * تصمیم فقط ثبت می‌شود (`POST /api/checkout/mock-gateway/<Authority>`)؛ برگشت (`/pay/callback`) همان را
 * می‌سنجد، نه `Status` نشانی. در برش ۷ درگاه واقعی جای این صفحه می‌آید.
 */
export default async function MockGatewayPage({ params }: { params: Promise<{ authority: string }> }) {
  const { authority } = await params;
  const request = await headers();
  if (checkoutModeFor([request.get('host'), request.get('x-forwarded-host')]) !== 'mock') notFound();
  const result = await checkoutServices().checkout.mockGatewayView(authority);
  if (!result.ok) notFound();
  const { merchant, orderNumber, amountRials, decided, payment } = result.value;

  return (
    <main className="ck-gate" data-gate="">
      <div className="ck-gate__in">
        <Logo height={56} className="ck-gate__logo" />
        <section className="jy-card" aria-labelledby="gate-title">
          <h1 id="gate-title" className="jy-card__title">
            درگاه پرداخت نمونه
          </h1>
          <p className="jy-note jy-note--info">
            <span className="jy-icon jy-icon-info" aria-hidden="true" />
            <span>فقط برای آزمایش است؛ پولی جابه‌جا نمی‌شود.</span>
          </p>
          <dl className="ck-gate__lines">
            <div>
              <dt>پذیرنده</dt>
              <dd>{merchant}</dd>
            </div>
            <div>
              <dt>شمارهٔ سفارش</dt>
              <dd className="num">{orderNumber}</dd>
            </div>
            <div>
              <dt>مبلغ</dt>
              <dd>
                <Tomans rials={amountRials} /> تومان
              </dd>
            </div>
          </dl>
          <GateActions authority={authority} decided={decided || payment !== 'pending'} />
        </section>
      </div>
    </main>
  );
}
