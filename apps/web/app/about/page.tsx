import { placeholderValues } from '@jozveyar/content';

import { ContentPage } from '../../components/ContentPage';
import { contentFacts, liveText, sitePublished } from '../../lib/server/content';
import { siteFiles } from '../../lib/server/fileRules';
import { pageMetadata } from '../../lib/server/pageMetadata';
import { siteFacts } from '../../lib/server/siteFacts';
import { siteTariff } from '../../lib/server/tariff';
import { STATIC_PAGES } from '../../lib/staticPages';

/** مثل صفحهٔ اصلی ISR ۶۰ ثانیه: متن از پنل (۱۱٫۱)، و عددها از تعرفهٔ فعال و `settings`. */
export const revalidate = 60;

export const generateMetadata = pageMetadata('about');

/**
 * دربارهٔ ما (برش ۷٫۴): جزوه‌یار چیست و چطور کار می‌کند. از ۱۱٫۱ متن را مالک از پنل منتشر می‌کند؛ بخش «نشانی» از نشانی «تماس و پاورقی» است
 * (سؤال ۲۹۰)، نه نسخهٔ دوم آن، و بی نشانی نمی‌آید.
 */
export default async function AboutPage() {
  const [published, tariff, files, facts] = await Promise.all([sitePublished(), siteTariff(), siteFiles(), siteFacts()]);
  const factsNow = contentFacts(tariff, files, facts);
  const { address } = liveText('contact', published).content;
  return (
    <ContentPage id="about-title" page={liveText('about', published, factsNow).content} values={placeholderValues(factsNow)}>
      {address ? (
        <>
          <h2>نشانی</h2>
          <p>
            {address}. راه‌های تماس و ساعت پاسخ‌گویی در صفحهٔ{' '}
            <a className="jy-link" href={STATIC_PAGES.contact.path}>
              تماس
            </a>{' '}
            است.
          </p>
        </>
      ) : null}
    </ContentPage>
  );
}
