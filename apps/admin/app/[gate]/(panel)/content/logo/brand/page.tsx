import type { Metadata } from 'next';
import Link from 'next/link';

import { LogoHeader } from '../../../../../../components/ImageCards';
import { LogoPublishForm } from '../../../../../../components/LogoPublishForm';
import { NoAccess } from '../../../../../../components/NoAccess';
import { panelPath } from '../../../../../../lib/gate';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'برگشت به لوگوی جزوه‌یار' };

/**
 * «برگشت به لوگوی جزوه‌یار» با کد تازه (برش ۱۱٫۲): لوگوی امروز و لوگوی برند کنار هم، تا معلوم باشد چه عوض می‌شود. لوگوی امروز همان برند باشد،
 * فرم ندارد؛ بارگذاری‌ها می‌مانند و هر کدام را بعداً می‌شود دوباره روی سایت گذاشت.
 */
export default async function BrandLogoPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { images } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await images.logo(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { live, seen } = result.value;
  const home = panelPath(gate, '/content/logo');

  return (
    <>
      <Link href={home} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        لوگو
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">برگشت به لوگوی جزوه‌یار</h1>
          <p className="ad-sub">سربرگ و پاورقی همهٔ صفحه‌ها، نشانک، آیکون گوشی و تصویر اشتراک تا یک دقیقه بعد همان فایل‌های برند می‌شوند.</p>
        </div>
      </div>
      <section className="jy-card ad-measure" aria-labelledby="brand-change">
        <h2 id="brand-change" className="jy-card__title">
          چه عوض می‌شود
        </h2>
        {live ? (
          <>
            <p className="ad-pvlabel">
              امروز، نسخهٔ <span className="num">{live.version}</span>
            </p>
            <LogoHeader gate={gate} image={live} />
            <p className="ad-pvlabel">پس از برگشت</p>
            <LogoHeader gate={gate} image={null} />
            <p className="ad-hint ad-gap">بارگذاری‌ها می‌مانند؛ هر کدام را بعداً می‌شود دوباره روی سایت گذاشت.</p>
            <LogoPublishForm gate={gate} mode="brand" seen={seen} back={home} label="برگشت به لوگوی جزوه‌یار" />
          </>
        ) : (
          <p className="ad-lead">لوگوی روی سایت همین حالا هم لوگوی جزوه‌یار است.</p>
        )}
      </section>
    </>
  );
}
