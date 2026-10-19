import { createSiteImageStore, getDb, type SiteImageStore } from '@jozveyar/db';

/**
 * فایل‌های لوگو و بنری که مالک روی سایت گذاشت (برش ۱۱٫۲، ADR-067): `/media/<sha256>.<پسوند>`. فقط فایلی که بارگذاری‌اش روی سایت رفته داده
 * می‌شود (`publishedFile`)، پس پیش‌نمایش پنل از اینجا بیرون نمی‌آید. نشانی همان هش خود فایل است و فایلی زیر یک هش هرگز عوض نمی‌شود، پس کش
 * همیشگی است؛ بایت‌ها را کارگر از نو ساخته (`build_site_image`)، و `nosniff` تا مرورگر نوع را از محتوا حدس نزند.
 */

const NAME = /^([0-9a-f]{64})\.(png|jpg|ico)$/;
const TYPES: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', ico: 'image/x-icon' };

let store: SiteImageStore | undefined;

const missing = () => new Response('پیدا نشد', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const match = NAME.exec(file);
  if (!match || !process.env.DATABASE_URL) return missing();
  const found = await (store ??= createSiteImageStore(getDb())).publishedFile(match[1]!);
  if (!found || found.contentType !== TYPES[match[2]!]) return missing();
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      'Content-Type': found.contentType,
      'Content-Length': String(found.bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
