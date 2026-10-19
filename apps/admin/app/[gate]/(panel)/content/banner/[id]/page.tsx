import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '../../../../../../components/Alert';
import { AutoRefresh } from '../../../../../../components/AutoRefresh';
import { BannerForm } from '../../../../../../components/BannerForm';
import { BannerFiles, ImageBadge, ImageFailure, UploadedNames } from '../../../../../../components/ImageCards';
import { NoAccess } from '../../../../../../components/NoAccess';
import { whenText } from '../../../../../../lib/format';
import { panelPath } from '../../../../../../lib/gate';
import { imageError, imageState } from '../../../../../../lib/images';
import { messageOf } from '../../../../../../lib/messages';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'بارگذاری بنر' };

/**
 * یک بارگذاری بنر (برش ۱۱٫۲، سؤال ۲۰۶): تا کارگر بسازدش «در حال آماده شدن» و خودش تازه می‌شود؛ فایلی که پذیرفته نشد با پیام کارگر؛ ساخته‌شده با
 * تصویر دسکتاپ و گوشی، و فرم متن جایگزین، پیوند و کد تازه: «روی سایت بگذار»، یا برای بنر روشن همین تصویر «ذخیره کن». بنری که همین حالا جای دیگری
 * عوض شد (`?e=banner_changed`) صفحه را با حال تازه از نو می‌سازد.
 */
export default async function BannerImagePage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string; id: string }>;
  searchParams: Promise<{ done?: string; e?: string; n?: string }>;
}) {
  const { gate, id } = await params;
  const { done, e, n } = await searchParams;
  const { images } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await images.image(session, 'banner', id);
  const home = panelPath(gate, '/content/banner');
  const back = (
    <Link href={home} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      بنر صفحهٔ اصلی
    </Link>
  );
  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} session={session} />;
    return (
      <>
        {back}
        <section className="jy-card ad-noaccess" aria-labelledby="img-missing">
          <h1 id="img-missing" className="jy-card__title">
            این بارگذاری پیدا نشد
          </h1>
          <p className="ad-lead">{messageOf('image_not_found')}</p>
        </section>
      </>
    );
  }
  const { now, image, liveId, seen, banner } = result.value;
  const state = imageState(image, liveId);
  const failure = state === 'failed' ? imageError(image.error) : null;
  const same = banner !== null && banner.imageId === image.id;
  // همین تصویر: متن و پیوند امروزش؛ تصویر دیگر: پیوند بنر قبلی (معمولاً همان مقصد)، و متن جایگزین تازه، چون تصویر دیگری است.
  const initial = { alt: same ? banner.alt : '', href: banner?.href ?? '' };

  return (
    <>
      {back}
      {state === 'building' ? <AutoRefresh everyMs={2000} /> : null}
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">
              بنر، نسخهٔ <span className="num">{image.version}</span>
            </h1>
            <ImageBadge state={state} />
          </div>
          <p className="ad-sub">
            <UploadedNames image={image} /> · بارگذاری {image.createdByName}، {whenText(image.createdAt, now)}
          </p>
        </div>
      </div>
      {done === 'upload' ? (
        <Alert tone="success">
          نسخهٔ <span className="num">{image.version}</span> بارگذاری شد. تصویرهایی را که کارگر ساخت ببین؛ تا «روی سایت بگذار» نزنی چیزی روی سایت عوض
          نمی‌شود.
        </Alert>
      ) : e === 'banner_changed' ? (
        <Alert tone="warning">{messageOf(e)}</Alert>
      ) : e ? (
        <Alert tone="error">{messageOf(e)}</Alert>
      ) : null}
      <div className="ad-stack ad-measure">
        <section className="jy-card" aria-labelledby="img-files" data-image-page={state}>
          <h2 id="img-files" className="jy-card__title">
            تصویرها
          </h2>
          {state === 'building' ? (
            <p className="ad-lead" role="status">
              کارگر تصویرها را می‌سازد؛ چند ثانیهٔ دیگر همین‌جا می‌آیند.
            </p>
          ) : failure ? (
            <ImageFailure failure={failure} home={home} />
          ) : (
            <BannerFiles gate={gate} image={image} />
          )}
        </section>
        {state === 'ready' || state === 'live' ? (
          <section className="jy-card" aria-labelledby="img-use">
            <h2 id="img-use" className="jy-card__title">
              {state === 'live' ? 'متن و پیوند' : 'روی سایت بگذار'}
            </h2>
            <p className="ad-lead">
              {state === 'live'
                ? 'همین بنر روی صفحهٔ اصلی است؛ تغییر متن یا پیوند هم با کد تازه است.'
                : 'روی صفحهٔ اصلی، بالای «چطور کار می‌کند»، جز پس از انداختن فایل؛ با کد تازه، و تا یک دقیقه بعد روی سایت.'}
            </p>
            {/* پس از هر کار فرم از نو، با بنر تازه (`n` هر هدایت تازه است). */}
            <BannerForm key={`${seen}-${n ?? ''}`} gate={gate} id={image.id} seen={seen} initial={initial} live={state === 'live'} back={home} />
          </section>
        ) : null}
      </div>
    </>
  );
}
