import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PREVIEW_TOKEN, previewHash } from '@jozveyar/db';
import { StaticPage } from '../../../components/StaticPage';
import { previewOpenable, previews } from '../../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'پیش‌نمایش مالک',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

/**
 * پیوند پیش‌نمایش مالک (برش ۷٫۵، ADR-052، سؤال ۱۶۷): مالک از «تنظیمات» پنل می‌سازدش و در مرورگر خودش باز می‌کند. این صفحه با GET
 * هیچ چیز را مصرف نمی‌کند (پیش‌نمایش پیوند پیام‌رسان یا مرورگر آن را نسوزاند)؛ دکمه‌اش با POST پیوند را باز می‌کند و کوکی ۲۴ ساعته
 * می‌گذارد (`/api/checkout/preview`). بیرون از `live` آماده با مخاطب «پیش‌نمایش مالک»، ۴۰۴ مثل هر نشانی ناموجود؛ پیوندی که دیگر باز
 * نمی‌شود می‌گوید چرا. با پوستهٔ عادی سایت.
 */
export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!PREVIEW_TOKEN.test(token) || !(await previewOpenable())) notFound();
  const link = await previews().link(previewHash(token), new Date());
  if (!link) {
    return (
      <StaticPage
        id="preview-title"
        title="این پیوند دیگر کار نمی‌کند"
        lead="پیوند پیش‌نمایش یک بار باز می‌شود و ۱۵ دقیقه می‌ماند. از «تنظیمات» پنل پیوند تازه بساز."
      />
    );
  }
  return (
    <StaticPage
      id="preview-title"
      title="پیش‌نمایش مالک"
      lead="با این دکمه مسیر خرید فقط برای همین مرورگر باز می‌شود، تا ۲۴ ساعت. پرداخت و پیامک واقعی‌اند؛ برای بقیه همان «به‌زودی» است."
    >
      <form method="post" action="/api/checkout/preview">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="jy-btn jy-btn--primary jy-btn--lg">
          باز کردن پیش‌نمایش در این مرورگر
        </button>
      </form>
    </StaticPage>
  );
}
