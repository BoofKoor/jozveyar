import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '../../../../../components/Alert';
import { ImageUpload } from '../../../../../components/ImageUpload';
import { LogoHeader, UploadList } from '../../../../../components/ImageCards';
import { NoAccess } from '../../../../../components/NoAccess';
import { panelPath } from '../../../../../lib/gate';
import { logoEventText } from '../../../../../lib/images';
import { messageOf } from '../../../../../lib/messages';
import { requirePanel, requireSession } from '../../../../../lib/server/context';

export const metadata: Metadata = { title: 'لوگو' };

/** پیام هر کار موفق (`?done=`). */
const DONE: Record<string, string> = {
  publish: 'روی سایت رفت؛ تا یک دقیقه بعد سربرگ، پاورقی، نشانک، آیکون گوشی و تصویر اشتراک همهٔ صفحه‌ها همین است.',
  brand: 'لوگوی جزوه‌یار برگشت؛ تا یک دقیقه بعد روی سایت است.',
  same: 'چیزی عوض نشد؛ لوگوی روی سایت همان است که بود.',
};

/**
 * لوگو (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶): فقط مالک (`content.edit`). لوگوی روی سایت با «برگشت به لوگوی جزوه‌یار…»، بارگذاری تازه (لوگو و نشان
 * اختیاری)، و بارگذاری‌های اخیر با حال هر کدام؛ «روی سایت بگذار» در صفحهٔ هر بارگذاری است، پس از دیدن همهٔ فایل‌هایی که کارگر ساخت.
 */
export default async function LogoPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<{ done?: string; e?: string; v?: string }>;
}) {
  const { gate } = await params;
  const { done, e, v } = await searchParams;
  const { images } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await images.logo(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, live, uploads, event } = result.value;
  const changed = logoEventText(event, now);
  const version = /^[1-9][0-9]{0,5}$/.test(v ?? '') ? v : null;
  const doneText = done && DONE[done] ? (done === 'publish' && version ? `لوگوی نسخهٔ ${version} ${DONE.publish}` : DONE[done]) : null;

  return (
    <>
      <Link href={panelPath(gate, '/content')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        محتوای سایت
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">لوگو</h1>
          <p className="ad-sub">لوگوی سربرگ و پاورقی سایت؛ نشانک مرورگر، آیکون گوشی و تصویر اشتراک هم از همین ساخته می‌شوند.</p>
        </div>
      </div>
      {doneText ? (
        <Alert tone="success">{doneText}</Alert>
      ) : e === 'logo_changed' ? (
        <Alert tone="warning">{messageOf(e)}</Alert>
      ) : e ? (
        <Alert tone="error">{messageOf(e)}</Alert>
      ) : null}
      <div className="ad-stack ad-measure">
        <section className="jy-card" aria-labelledby="logo-live" data-testid="logo-live">
          <div className="jy-card__head">
            <h2 id="logo-live" className="jy-card__title">
              روی سایت
            </h2>
            {live ? (
              <span className="jy-card__meta">
                نسخهٔ <span className="num">{live.version}</span>
              </span>
            ) : (
              <span className="jy-card__meta">لوگوی جزوه‌یار</span>
            )}
          </div>
          <LogoHeader gate={gate} image={live} />
          {changed ? <p className="ad-meta ad-gap">{changed}</p> : null}
          {live ? (
            <div className="ad-actions">
              <Link href={panelPath(gate, `/content/logo/${live.id}`)} className="jy-btn jy-btn--secondary">
                همهٔ فایل‌ها
              </Link>
              <Link href={panelPath(gate, '/content/logo/brand')} className="jy-btn jy-btn--text">
                برگشت به لوگوی جزوه‌یار…
              </Link>
            </div>
          ) : null}
        </section>
        <section className="jy-card" aria-labelledby="logo-upload">
          <h2 id="logo-upload" className="jy-card__title">
            بارگذاری تازه
          </h2>
          <ImageUpload gate={gate} kind="logo" />
        </section>
        <section className="jy-card" aria-labelledby="logo-uploads">
          <h2 id="logo-uploads" className="jy-card__title">
            بارگذاری‌ها
          </h2>
          <UploadList gate={gate} kind="logo" uploads={uploads} liveId={live?.id ?? null} now={now} />
        </section>
      </div>
    </>
  );
}
