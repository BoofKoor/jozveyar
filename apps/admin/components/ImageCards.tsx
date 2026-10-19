import Link from 'next/link';

import type { SiteBanner } from '@jozveyar/contracts';
import type { SiteImageFileMeta, SiteImageRow } from '@jozveyar/db';
import { Logo } from '@jozveyar/ui';

import { bannerOffAction } from '../app/[gate]/actions';
import { hrefText } from '../lib/bar';
import { whenText } from '../lib/format';
import { panelPath } from '../lib/gate';
import { FILE_LABELS, bannerEventText, imageBadge, imageError, imageState, kbText, logoEventText, type ImageState } from '../lib/images';
import type { BannerView, LogoView } from '../lib/server/images';
import { ContentSegs } from './ContentSegs';

const BADGE_ICONS: Record<ReturnType<typeof imageBadge>['tone'], string | null> = { success: 'success', info: 'info', neutral: null, error: 'error' };

/** نشان حال یک بارگذاری: در حال آماده شدن، ساخته نشد، آماده، روی سایت. */
export function ImageBadge({ state }: { state: ImageState }) {
  const badge = imageBadge(state);
  const icon = BADGE_ICONS[badge.tone];
  return (
    <span className={`jy-badge jy-badge--${badge.tone}`} data-image-state={state}>
      {icon ? <span className={`jy-icon jy-icon-${icon}`} aria-hidden="true" /> : null}
      {badge.text}
    </span>
  );
}

/** نشانی پیش‌نمایش یک فایل ساختهٔ کارگر در پنل. */
export const imageSrc = (gate: string, id: number, name: string) => panelPath(gate, `/content/images/${id}/${name}`);

const fileOf = (image: SiteImageRow | null, name: string): SiteImageFileMeta | null => image?.files.find((file) => file.name === name) ?? null;

/**
 * سربرگ کوچک سایت با لوگو، مثل پیش‌نمایش نوار اعلان: بارگذاری‌ای که ساخته شد با ارتفاع ۴۰ پیکسل، یا لوگوی جزوه‌یار. `<img>` همان فایل `logo` کارگر
 * است که سایت می‌دهد.
 */
export function LogoHeader({ gate, image }: { gate: string; image: SiteImageRow | null }) {
  const file = fileOf(image, 'logo');
  return (
    <div className="ad-logopv" data-logo-preview={file ? image!.id : 'brand'}>
      {file ? (
        <img src={imageSrc(gate, image!.id, 'logo')} alt="لوگو" width={Math.round((file.width * 40) / file.height)} height={40} />
      ) : (
        <Logo height={40} />
      )}
      <span>چطور کار می‌کند · تعرفه · سؤال‌ها</span>
    </div>
  );
}

/** بنر با همان دو فایل کارگر: تصویر گوشی تا ۵۲۰ پیکسل اگر هست (`<picture>`، مثل سایت)، وگرنه دسکتاپ. */
export function BannerPicture({ gate, image, alt }: { gate: string; image: SiteImageRow; alt: string }) {
  const desktop = fileOf(image, 'desktop');
  const mobile = fileOf(image, 'mobile');
  if (!desktop) return null;
  return (
    <picture className="ad-bannerpv">
      {mobile ? <source media="(width <= 520px)" srcSet={imageSrc(gate, image.id, 'mobile')} width={mobile.width} height={mobile.height} /> : null}
      <img src={imageSrc(gate, image.id, 'desktop')} alt={alt} width={desktop.width} height={desktop.height} />
    </picture>
  );
}

/**
 * کارت «لوگو» در «محتوای سایت» (برش ۱۱٫۲، سؤال ۲۰۶): لوگوی امروز روی سربرگی کوچک، اینکه نشانک و آیکون گوشی و تصویر اشتراک هم از همان است، آخرین
 * تغییر، و «عوض کردن». فقط مالک (`content.edit`، همان متن‌ها: هویت سایت).
 */
export function LogoCard({ gate, view }: { gate: string; view: LogoView }) {
  const { live, event, now } = view;
  const changed = logoEventText(event, now);
  return (
    <section className="jy-card" aria-labelledby="logo-title" data-testid="content-logo">
      <div className="jy-card__head">
        <h2 id="logo-title" className="jy-card__title">
          لوگو
        </h2>
        <span className="jy-card__meta">فقط مالک</span>
      </div>
      <LogoHeader gate={gate} image={live} />
      <p className="ad-meta ad-gap">
        {live ? (
          <>
            نسخهٔ <span className="num">{live.version}</span>
            {changed ? ` ${changed}` : '.'}
          </>
        ) : (
          <>لوگوی جزوه‌یار، همان فایل برند{changed ? ` ${changed}` : '.'}</>
        )}{' '}
        نشانک مرورگر، آیکون گوشی و تصویر اشتراک هم از همین است.
      </p>
      <div className="ad-actions">
        <Link href={panelPath(gate, '/content/logo')} className="jy-btn jy-btn--secondary">
          عوض کردن
        </Link>
      </div>
    </section>
  );
}

/** حال بنر در یک نشان: «روشن» با آیکون، «خاموش» بی آیکون. */
export function BannerBadge({ banner }: { banner: SiteBanner }) {
  return banner.mode === 'on' ? (
    <span className="jy-badge jy-badge--success" data-banner-state="on">
      <span className="jy-icon jy-icon-success" aria-hidden="true" />
      روشن
    </span>
  ) : (
    <span className="jy-badge jy-badge--neutral" data-banner-state="off">
      خاموش
    </span>
  );
}

/** جا و پیوند بنر، یک جمله؛ نام صفحهٔ پیوند همان کارت نوار (`hrefText`). */
export function BannerPlace({ banner }: { banner: SiteBanner }) {
  return (
    <>
      صفحهٔ اصلی، بالای «چطور کار می‌کند»، جز پس از انداختن فایل؛ <ContentSegs segs={hrefText(banner.href)} />.
    </>
  );
}

/**
 * کارت «بنر صفحهٔ اصلی» (برش ۱۱٫۲، سؤال ۲۰۶): حال، تصویر بنر امروز، جا و پیوند، آخرین تغییر، «ویرایش»، و «خاموش کن» بی کد برای بنر روشن. مالک و
 * متصدی (`content.bar`، همان نوار اعلان: تبلیغ).
 */
export function BannerCard({ gate, view }: { gate: string; view: BannerView }) {
  const { banner, image, event, now } = view;
  const changed = bannerEventText(event, now);
  const on = banner.mode === 'on';
  return (
    <section className="jy-card" aria-labelledby="banner-title" data-testid="content-banner">
      <div className="jy-card__head">
        <h2 id="banner-title" className="jy-card__title">
          بنر صفحهٔ اصلی
        </h2>
        <BannerBadge banner={banner} />
      </div>
      {image ? <BannerPicture gate={gate} image={image} alt={banner.alt} /> : null}
      <p className="ad-meta ad-gap">
        {on ? <BannerPlace banner={banner} /> : image ? 'روی سایت نیست.' : 'تصویری ندارد؛ با «ویرایش» بارگذاری‌اش کن و روی سایت بگذار.'}
        {changed ? ` ${changed}` : null}
      </p>
      <div className="ad-actions">
        <Link href={panelPath(gate, '/content/banner')} className="jy-btn jy-btn--secondary">
          ویرایش
        </Link>
        {on ? (
          <form action={bannerOffAction}>
            <input type="hidden" name="gate" value={gate} />
            <button type="submit" className="jy-btn jy-btn--text">
              خاموش کن
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

/** نام فایل بارگذاری‌شده و اندازه‌اش: «لوگو.png، 34 کیلوبایت»؛ با فایل دوم، هر دو. */
export function UploadedNames({ image }: { image: SiteImageRow }) {
  return (
    <>
      <bdi>{image.mainName}</bdi>، <span className="num">{kbText(image.mainBytes)}</span> کیلوبایت
      {image.extraName !== null && image.extraBytes !== null ? (
        <>
          {' '}
          و <bdi>{image.extraName}</bdi>، <span className="num">{kbText(image.extraBytes)}</span> کیلوبایت
        </>
      ) : null}
    </>
  );
}

/**
 * بارگذاری‌های اخیر یک نوع (تا ۱۰ تا)، تازه‌ترین اول: تصویر کوچک فایل ساخته‌شده، نسخه با نشان حال، سازنده و زمان، و «دیدن». بارگذاری‌ای که روی
 * سایت نرفت ۳۰ روز بعد پاک می‌شود.
 */
export function UploadList({ gate, kind, uploads, liveId, now }: { gate: string; kind: SiteImageRow['kind']; uploads: readonly SiteImageRow[]; liveId: number | null; now: Date }) {
  if (uploads.length === 0) return <p className="ad-lead">هنوز بارگذاری‌ای نیست.</p>;
  return (
    <ul className="ad-imglist" data-testid={`${kind}-uploads`}>
      {uploads.map((row) => {
        const thumb = fileOf(row, kind === 'logo' ? 'logo' : 'desktop');
        return (
          <li key={row.id} data-image={row.id}>
            <span className="ad-imglist__thumb">
              {thumb ? (
                <img src={imageSrc(gate, row.id, thumb.name)} alt="" width={thumb.width} height={thumb.height} loading="lazy" decoding="async" />
              ) : null}
            </span>
            <span className="ad-imglist__name">
              نسخهٔ <span className="num">{row.version}</span>
              <ImageBadge state={imageState(row, liveId)} />
            </span>
            <span className="ad-imglist__meta">
              {row.createdByName}، {whenText(row.createdAt, now)} · <UploadedNames image={row} />
            </span>
            <Link href={panelPath(gate, `/content/${kind}/${row.id}`)} className="jy-btn jy-btn--secondary">
              دیدن
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** یک فایل ساخته در شبکهٔ پیش‌نمایش: تصویر، نام و ابعاد. */
function FileTile({ gate, image, file, shown, round }: { gate: string; image: SiteImageRow; file: SiteImageFileMeta; shown: number; round?: boolean }) {
  const width = Math.round((file.width * shown) / file.height);
  return (
    <figure className="ad-imgfile" data-file={file.name}>
      <span className={`ad-imgfile__box${round ? ' ad-imgfile__box--round' : ''}`}>
        <img src={imageSrc(gate, image.id, file.name)} alt={FILE_LABELS[file.name]} width={width} height={shown} loading="lazy" decoding="async" />
      </span>
      <figcaption>
        {FILE_LABELS[file.name]}
        <bdi className="ad-imgfile__dims ad-ltr num">
          {file.width}×{file.height}
        </bdi>
      </figcaption>
    </figure>
  );
}

/**
 * فایل‌های یک لوگوی ساخته‌شده، همان که سایت می‌دهد: سربرگ، نشانک در سه اندازه، آیکون آیفون با گوشهٔ گرد، آیکون اندروید درون دایرهٔ امن
 * (maskable)، و تصویر اشتراک.
 */
export function LogoFiles({ gate, image }: { gate: string; image: SiteImageRow }) {
  const by = (name: string) => fileOf(image, name);
  const favicon = by('favicon');
  const apple = by('apple');
  const icon512 = by('icon512');
  const og = by('og');
  return (
    <div className="ad-imgfiles" data-testid="logo-files">
      <LogoHeader gate={gate} image={image} />
      <div className="ad-imgfiles__row">
        {favicon ? (
          <figure className="ad-imgfile" data-file="favicon">
            <span className="ad-imgfile__box ad-imgfile__box--tabs">
              {[16, 32, 48].map((size) => (
                <img key={size} src={imageSrc(gate, image.id, 'favicon')} alt={size === 16 ? FILE_LABELS.favicon : ''} width={size} height={size} />
              ))}
            </span>
            <figcaption>
              {FILE_LABELS.favicon}
              <span className="ad-imgfile__dims">
                <span className="num">16</span>، <span className="num">32</span> و <span className="num">48</span> پیکسل
              </span>
            </figcaption>
          </figure>
        ) : null}
        {apple ? <FileTile gate={gate} image={image} file={apple} shown={90} /> : null}
        {icon512 ? <FileTile gate={gate} image={image} file={icon512} shown={90} round /> : null}
      </div>
      {og ? (
        <figure className="ad-imgfile ad-imgfile--wide" data-file="og">
          <img className="ad-ogpv" src={imageSrc(gate, image.id, 'og')} alt={FILE_LABELS.og} width={og.width} height={og.height} loading="lazy" decoding="async" />
          <figcaption>
            {FILE_LABELS.og}، وقتی پیوند سایت در تلگرام یا واتس‌اپ فرستاده می‌شود
            <bdi className="ad-imgfile__dims ad-ltr num">
              {og.width}×{og.height}
            </bdi>
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

/** فایل‌های یک بنر ساخته‌شده: دسکتاپ، و گوشی اگر هست، هر کدام با ابعاد. */
export function BannerFiles({ gate, image }: { gate: string; image: SiteImageRow }) {
  return (
    <div className="ad-imgfiles" data-testid="banner-files">
      {(['desktop', 'mobile'] as const).map((name) => {
        const file = fileOf(image, name);
        if (!file) return null;
        return (
          <figure key={name} className={`ad-imgfile ad-imgfile--wide${name === 'mobile' ? ' ad-imgfile--phone' : ''}`} data-file={name}>
            <img className="ad-bannerpv" src={imageSrc(gate, image.id, name)} alt={FILE_LABELS[name]} width={file.width} height={file.height} loading="lazy" decoding="async" />
            <figcaption>
              {FILE_LABELS[name]}
              {name === 'desktop' && !fileOf(image, 'mobile') ? '، گوشی هم همین را می‌بیند' : ''}
              <bdi className="ad-imgfile__dims ad-ltr num">
                {file.width}×{file.height}
              </bdi>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** «ساخته نشد» یک بارگذاری: پیام آمادهٔ کارگر، و راه جلو، بارگذاری دوباره؛ این نسخه هرگز روی سایت نمی‌رود. */
export function ImageFailure({ failure, home }: { failure: NonNullable<ReturnType<typeof imageError>>; home: string }) {
  return (
    <div className="jy-note jy-note--error" data-image-error={failure.code}>
      <span className="jy-icon jy-icon-error" aria-hidden="true" />
      <span>
        ساخته نشد: {failure.message}
        {failure.server ? null : (
          <>
            {' '}
            تصویر را درست کن و{' '}
            <Link href={home} className="jy-link">
              دوباره بارگذاری کن
            </Link>
            ؛ این نسخه روی سایت نمی‌رود.
          </>
        )}
      </span>
    </div>
  );
}
