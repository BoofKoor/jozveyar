import logoFile from '../assets/jozveyar-logo-no-tagline.svg';
import markFile from '../assets/jozveyar-mark.svg';
import { LOGO_BOX, LOGO_MIN_HEIGHT, MARK_BOX, MARK_MIN_HEIGHT } from './tokens.js';

/**
 * لوگوی بی‌شعار و نشان: کامپوننت سرور، و فقط `<img>` از فایل خودشان.
 *
 * SVG درون‌خطی نیست، تا در HTML و در RSC دو بار نیاید. هیچ JS کلاینتی هم ندارد. فایل‌ها
 * همان فایل‌های docs/brand‌اند (tokens.test.ts). قاعده‌ها در docs/brand/README.md است: رنگ
 * خودش، بی کش و چرخش و افکت، و نه کوچک‌تر از کمینه. پس ارتفاع زیر کمینه به کمینه می‌رسد.
 */

type Asset = string | { src: string };

const url = (asset: Asset) => (typeof asset === 'string' ? asset : asset.src);

interface Props {
  /** ارتفاع به پیکسل؛ پهنا از نسبت خود فایل می‌آید. */
  height: number;
  className?: string;
  /** پاورقی `lazy`؛ سربرگ پیش‌فرض. */
  loading?: 'eager' | 'lazy';
}

/** لوگوی بی‌شعار: نشان و نام. برای سربرگ و پاورقی. */
export function Logo({ height, className, loading }: Props) {
  const h = Math.max(height, LOGO_MIN_HEIGHT);
  return (
    <img
      src={url(logoFile)}
      alt="جزوه‌یار"
      width={Math.round((LOGO_BOX.width * h) / LOGO_BOX.height)}
      height={h}
      className={className}
      loading={loading}
      decoding="async"
    />
  );
}

/**
 * نشان تنها، وقتی نام جای دیگری آمده. پس پیش‌فرض تزئینی است (`alt` خالی)؛ اگر نشان تنها
 * چیزی است که نام را می‌رساند، `alt="جزوه‌یار"` بده.
 */
export function Mark({ height, className, loading, alt = '' }: Props & { alt?: string }) {
  const h = Math.max(height, MARK_MIN_HEIGHT);
  return (
    <img
      src={url(markFile)}
      alt={alt}
      width={Math.round((MARK_BOX.width * h) / MARK_BOX.height)}
      height={h}
      className={className}
      loading={loading}
      decoding="async"
    />
  );
}
