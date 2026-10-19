import { placeholderValues } from '@jozveyar/content';

import { ContentPage } from '../../components/ContentPage';
import { contentFacts, liveText, pageSettings, sitePublished } from '../../lib/server/content';
import { siteFiles } from '../../lib/server/fileRules';
import { pageMetadata } from '../../lib/server/pageMetadata';
import { siteChangedAt, siteFacts } from '../../lib/server/siteFacts';
import { siteTariff } from '../../lib/server/tariff';
import { pageDate } from '../../lib/staticPages';

/** مثل صفحهٔ اصلی ISR ۶۰ ثانیه: متن از پنل (۱۱٫۱)، و عددها از تعرفهٔ فعال و `settings`. */
export const revalidate = 60;

export const generateMetadata = pageMetadata('privacy');

/**
 * حریم خصوصی (برش ۷٫۴): چه چیزی، کجا و تا کی، از روی خود سایت (ADR-033 و ADR-034، و از برش ۷ sms.ir و زیبال). از ۱۱٫۱ متن را مالک از پنل
 * منتشر می‌کند؛ متن پیش‌فرض روزهای فایل‌ها را با جای‌نگهدار دارد و روزهای دو کوکی را از ثابت‌های خود کوکی‌ها (`COOKIE_DAYS`، با تست برابری).
 */
export default async function PrivacyPage() {
  const [published, tariff, files, facts] = await Promise.all([sitePublished(), siteTariff(), siteFiles(), siteFacts()]);
  const factsNow = contentFacts(tariff, files, facts);
  const live = liveText('privacy', published, factsNow);
  const settingsAt = await siteChangedAt(pageSettings(live.content));
  return <ContentPage id="privacy-title" page={live.content} values={placeholderValues(factsNow)} updated={pageDate(live.changedAt!, settingsAt)} />;
}
