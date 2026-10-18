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

export const generateMetadata = pageMetadata('terms');

/**
 * قوانین (برش ۷٫۴؛ پیش‌نیاز `live`، ADR-052). مرور سفارش و صفحهٔ سفارش به این صفحه پیوند می‌دهند («با پرداخت، قوانین جزوه‌یار را
 * می‌پذیری»). از ۱۱٫۱ متن را مالک از پنل منتشر می‌کند (سؤال ۲۸۳)؛ تا نکرده، متن پیش‌فرض (`@jozveyar/content`، همان متن ۷٫۴ با جای‌نگهدار).
 * «به‌روز شده در» روز انتشار است، و اگر تنظیمی که متن از آن است دیرتر عوض شد، روز همان تغییر.
 */
export default async function TermsPage() {
  const [published, tariff, files, facts] = await Promise.all([sitePublished(), siteTariff(), siteFiles(), siteFacts()]);
  const factsNow = contentFacts(tariff, files, facts);
  const live = liveText('terms', published, factsNow);
  const settingsAt = await siteChangedAt(pageSettings(live.content));
  return <ContentPage id="terms-title" page={live.content} values={placeholderValues(factsNow)} updated={pageDate(live.changedAt!, settingsAt)} />;
}
