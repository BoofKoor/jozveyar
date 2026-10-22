import type { MetadataRoute } from 'next';

import { hasContact, landingOf } from '@jozveyar/content';
import { jalaliYear, parseJalaliNumeric } from '@jozveyar/text';

import { homeSettings, liveText, pageSettings, sitePublished, type SitePublished } from '../lib/server/content';
import { liveTariffPage, pageDeps, siteLivePages, type PageDeps } from '../lib/server/pages';
import { siteChangedAt } from '../lib/server/siteFacts';
import { siteTariffChangedAt } from '../lib/server/tariff';
import { latest, sitemapEntries, type SitemapPage } from '../lib/sitemap';
import { STATIC_PAGES, TARIFF_PAGE, sitemapPages, type StaticPage, type StaticPageKind } from '../lib/staticPages';

/** «تماس» فقط وقتی راهی برای تماس هست، که مالک از پنل عوض می‌کند (۱۱٫۱)؛ پس مثل صفحه‌ها هر ۶۰ ثانیه. */
export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://jozveyar.com';

/**
 * نقشهٔ سایت: صفحهٔ اصلی، «تعرفه» و صفحه‌های فرود روی سایت (۱۵٫۲)، و صفحه‌های ثابت (برش ۷٫۴؛ همان‌ها که پاورقی دارد، «تماس» فقط وقتی راهی برای
 * تماس هست). صفحهٔ فرودی که هنوز زمان‌دار است، برداشته شده یا نشانی قبلی است نیست؛ هر نشانی همان canonical صفحه‌اش.
 *
 * «آخرین تغییر» هر صفحه از ۱۵٫۱ (سؤال ۴۲۸) از خود داده است، با همان ورودی‌های «به‌روز شده»ی صفحه‌های ثابت: انتشار متن (یا تاریخ متن
 * پیش‌فرض) و آخرین تغییر تنظیم‌هایی که متن از آن‌هاست. صفحهٔ اصلی سؤال‌ها و فعال شدن تعرفه را هم دارد، چون جدول تعرفه و نرخ‌های سؤال‌ها از
 * آن است؛ نظرها و بنر جلویش نمی‌برند. «تعرفه» و صفحه‌ای که عدد تعرفه دارد فعال شدن تعرفه را هم، و صفحه‌ای که `{سال}` دارد نوروز را (`pageDeps`).
 * زمانی که معلوم نیست (build، بی پایگاه داده) نوشته نمی‌شود.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [published, live] = await Promise.all([sitePublished(), siteLivePages()]);
  const home = liveText('home', published);
  const faq = liveText('faq', published);
  const contact = liveText('contact', published);
  const tariffPage = liveTariffPage(live);
  const landings = live.filter((page) => page.kind === 'landing');
  const yearStart = parseJalaliNumeric(`${jalaliYear(now)}/01/01`);

  const [tariffAt, homeSettingsAt, statics] = await Promise.all([
    siteTariffChangedAt(),
    siteChangedAt(homeSettings(home.content, faq.content)),
    Promise.all(
      sitemapPages(hasContact(contact.content)).map(
        async (page): Promise<SitemapPage> => ({
          path: page.path,
          lastModified: await pageChangedAt(kindOf(page), published),
          changeFrequency: 'yearly',
          priority: 0.3,
        }),
      ),
    ),
  ]);

  /** دیرترینِ انتشار متن، تنظیم‌هایش، فعال شدن تعرفه اگر عددش در متن است، و نوروز اگر `{سال}` دارد. */
  const changedAt = async (since: Date | null, deps: PageDeps) =>
    latest(since, await siteChangedAt(deps.settings), deps.tariff ? tariffAt : null, deps.year ? yearStart : null);

  const [tariffAtPage, landingPages] = await Promise.all([
    changedAt(tariffPage.since, pageDeps(tariffPage.content)),
    Promise.all(
      landings.map(
        async (page): Promise<SitemapPage> => ({
          path: `/${page.slug}`,
          lastModified: await changedAt(page.since, pageDeps(landingOf(page.content))),
          changeFrequency: 'monthly',
          priority: 0.8,
        }),
      ),
    ),
  ]);

  return sitemapEntries(SITE_URL, [
    { path: '/', lastModified: latest(home.changedAt, faq.changedAt, tariffAt, homeSettingsAt), changeFrequency: 'weekly', priority: 1 },
    { path: TARIFF_PAGE.path, lastModified: tariffAtPage, changeFrequency: 'weekly', priority: 0.9 },
    ...landingPages,
    ...statics,
  ]);
}

const kindOf = (page: StaticPage): StaticPageKind =>
  (Object.keys(STATIC_PAGES) as StaticPageKind[]).find((kind) => STATIC_PAGES[kind].path === page.path)!;

/** «تماس» جای‌نگهدار ندارد؛ بقیه دیرترینِ تغییر متن و تنظیم‌هایش، مثل «به‌روز شده»ی خود صفحه. */
async function pageChangedAt(kind: StaticPageKind, published: SitePublished): Promise<Date | null> {
  if (kind === 'contact') return liveText('contact', published).changedAt;
  const live = liveText(kind, published);
  return latest(live.changedAt, await siteChangedAt(pageSettings(live.content)));
}
