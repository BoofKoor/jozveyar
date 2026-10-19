import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '../../../../../components/Alert';
import { BannerBadge, BannerPicture, BannerPlace, UploadList } from '../../../../../components/ImageCards';
import { ImageUpload } from '../../../../../components/ImageUpload';
import { NoAccess } from '../../../../../components/NoAccess';
import { panelPath } from '../../../../../lib/gate';
import { bannerEventText } from '../../../../../lib/images';
import { messageOf } from '../../../../../lib/messages';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { bannerOffAction } from '../../../actions';

export const metadata: Metadata = { title: 'بنر صفحهٔ اصلی' };

/** پیام هر کار موفق (`?done=`). */
const DONE: Record<string, string> = {
  on: 'بنر روشن شد؛ تا یک دقیقه بعد روی صفحهٔ اصلی است.',
  change: 'بنر عوض شد؛ تا یک دقیقه بعد روی صفحهٔ اصلی است.',
  same: 'چیزی عوض نشد؛ بنر همان است که بود.',
  banner_off: 'بنر خاموش شد؛ تا یک دقیقه بعد از صفحهٔ اصلی می‌رود.',
  banner_same: 'بنر همین حالا هم خاموش است.',
};

/**
 * بنر صفحهٔ اصلی (برش ۱۱٫۲، ADR-067؛ سؤال ۲۰۶، «تصویر»): مالک و متصدی (`content.bar`). بنر امروز با «خاموش کن» بی کد، یا اگر خاموش است و تصویر
 * دارد، «روشن کردن…»؛ بارگذاری تازه (دسکتاپ و گوشی اختیاری)، و بارگذاری‌های اخیر. متن جایگزین، پیوند و روی سایت گذاشتن در صفحهٔ هر بارگذاری است.
 */
export default async function BannerPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<{ done?: string; e?: string }>;
}) {
  const { gate } = await params;
  const { done, e } = await searchParams;
  const { images } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await images.banner(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { now, banner, image, uploads, event } = result.value;
  const changed = bannerEventText(event, now);
  const doneText = done ? DONE[done] : undefined;
  const on = banner.mode === 'on';

  return (
    <>
      <Link href={panelPath(gate, '/content')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        محتوای سایت
      </Link>
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">بنر صفحهٔ اصلی</h1>
            <BannerBadge banner={banner} />
          </div>
          {changed ? <p className="ad-sub">{changed}</p> : null}
        </div>
      </div>
      {doneText ? (
        <Alert tone="success">{doneText}</Alert>
      ) : e === 'banner_changed' ? (
        <Alert tone="warning">{messageOf(e)}</Alert>
      ) : e ? (
        <Alert tone="error">{messageOf(e)}</Alert>
      ) : null}
      <div className="ad-stack ad-measure">
        <section className="jy-card" aria-labelledby="banner-live" data-testid="banner-live">
          <div className="jy-card__head">
            <h2 id="banner-live" className="jy-card__title">
              روی سایت
            </h2>
            {image ? (
              <span className="jy-card__meta">
                نسخهٔ <span className="num">{image.version}</span>
              </span>
            ) : null}
          </div>
          {image ? <BannerPicture gate={gate} image={image} alt={banner.alt} /> : null}
          <p className="ad-meta ad-gap">
            {on ? (
              <>
                <BannerPlace banner={banner} /> متن جایگزین: «<bdi>{banner.alt}</bdi>».
              </>
            ) : image ? (
              'خاموش است و روی سایت نیست.'
            ) : (
              'بنری ندارد. تصویر را بارگذاری کن، و در صفحهٔ همان بارگذاری با متن جایگزین و پیوند روی سایت بگذار.'
            )}
          </p>
          {image ? (
            <div className="ad-actions">
              <Link href={panelPath(gate, `/content/banner/${image.id}`)} className="jy-btn jy-btn--secondary">
                {on ? 'ویرایش متن و پیوند' : 'روشن کردن…'}
              </Link>
              {on ? (
                <form action={bannerOffAction}>
                  <input type="hidden" name="gate" value={gate} />
                  <input type="hidden" name="back" value="banner" />
                  <button type="submit" className="jy-btn jy-btn--text">
                    خاموش کن
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>
        <section className="jy-card" aria-labelledby="banner-upload">
          <h2 id="banner-upload" className="jy-card__title">
            بارگذاری تازه
          </h2>
          <ImageUpload gate={gate} kind="banner" />
        </section>
        <section className="jy-card" aria-labelledby="banner-uploads">
          <h2 id="banner-uploads" className="jy-card__title">
            بارگذاری‌ها
          </h2>
          <UploadList gate={gate} kind="banner" uploads={uploads} liveId={on ? banner.imageId : null} now={now} />
        </section>
      </div>
    </>
  );
}
