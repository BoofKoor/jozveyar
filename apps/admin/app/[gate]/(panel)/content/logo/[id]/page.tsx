import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '../../../../../../components/Alert';
import { AutoRefresh } from '../../../../../../components/AutoRefresh';
import { ImageBadge, ImageFailure, LogoFiles, UploadedNames } from '../../../../../../components/ImageCards';
import { LogoPublishForm } from '../../../../../../components/LogoPublishForm';
import { NoAccess } from '../../../../../../components/NoAccess';
import { whenText } from '../../../../../../lib/format';
import { panelPath } from '../../../../../../lib/gate';
import { imageError, imageState } from '../../../../../../lib/images';
import { messageOf } from '../../../../../../lib/messages';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'بارگذاری لوگو' };

/**
 * یک بارگذاری لوگو (برش ۱۱٫۲، سؤال ۲۰۶): تا کارگر فایل‌ها را بسازد «در حال آماده شدن» و خودش تازه می‌شود؛ فایلی که پذیرفته نشد با پیام کارگر و
 * راه درست کردن؛ ساخته‌شده با همهٔ فایل‌هایی که سایت می‌دهد، و «روی سایت بگذار» با کد تازه. لوگویی که همین حالا جای دیگری عوض شد
 * (`?e=logo_changed`) صفحه را با حال تازه از نو می‌سازد.
 */
export default async function LogoImagePage({
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
  const result = await images.image(session, 'logo', id);
  const home = panelPath(gate, '/content/logo');
  const back = (
    <Link href={home} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      لوگو
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
  const { now, image, liveId, seen } = result.value;
  const state = imageState(image, liveId);
  const failure = state === 'failed' ? imageError(image.error) : null;

  return (
    <>
      {back}
      {state === 'building' ? <AutoRefresh everyMs={2000} /> : null}
      <div className="ad-pagehead">
        <div>
          <div className="ad-title-row">
            <h1 className="ad-title">
              لوگو، نسخهٔ <span className="num">{image.version}</span>
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
          نسخهٔ <span className="num">{image.version}</span> بارگذاری شد. فایل‌هایی را که کارگر ساخت ببین؛ تا «روی سایت بگذار» نزنی چیزی روی سایت عوض
          نمی‌شود.
        </Alert>
      ) : e === 'logo_changed' ? (
        <Alert tone="warning">{messageOf(e)}</Alert>
      ) : e ? (
        <Alert tone="error">{messageOf(e)}</Alert>
      ) : null}
      <div className="ad-stack ad-measure">
        <section className="jy-card" aria-labelledby="img-files" data-image-page={state}>
          <h2 id="img-files" className="jy-card__title">
            فایل‌ها
          </h2>
          {state === 'building' ? (
            <p className="ad-lead" role="status">
              کارگر فایل‌ها را می‌سازد؛ چند ثانیهٔ دیگر همین‌جا می‌آیند.
            </p>
          ) : failure ? (
            <ImageFailure failure={failure} home={home} />
          ) : (
            <LogoFiles gate={gate} image={image} />
          )}
        </section>
        {state === 'ready' ? (
          <section className="jy-card" aria-labelledby="img-use">
            <h2 id="img-use" className="jy-card__title">
              روی سایت بگذار
            </h2>
            <p className="ad-lead">
              با کد تازه. سربرگ و پاورقی همهٔ صفحه‌ها، نشانک، آیکون گوشی و تصویر اشتراک تا یک دقیقه بعد همین می‌شوند. پیوندی که پیش‌تر در تلگرام یا
              واتس‌اپ فرستاده شده تصویر قبلی را نگه می‌دارد، و مرورگری که سایت را دیده نشانک را گاهی دیرتر عوض می‌کند.
            </p>
            {/* پس از هر کار فرم از نو، با لوگوی تازه (`n` هر هدایت تازه است). */}
            <LogoPublishForm key={`${seen}-${n ?? ''}`} gate={gate} mode="publish" id={image.id} seen={seen} back={home} label="روی سایت بگذار" />
          </section>
        ) : state === 'live' ? (
          <section className="jy-card" aria-labelledby="img-use">
            <h2 id="img-use" className="jy-card__title">
              روی سایت است
            </h2>
            <p className="ad-lead">
              برای عوض کردنش لوگوی دیگری بارگذاری کن و روی سایت بگذار، یا{' '}
              <Link href={panelPath(gate, '/content/logo/brand')} className="jy-link">
                به لوگوی جزوه‌یار برگرد
              </Link>
              .
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}
