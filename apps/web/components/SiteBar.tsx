import { AnnouncementBar } from '@jozveyar/content/render';

import type { SiteBarView } from '../lib/server/bar';

/**
 * نوار بالای سربرگ همهٔ صفحه‌ها (برش ۱۱٫۳، ADR-066؛ طرح `content.html`): کامپوننت سرور و بی JS. پیام تعطیلی همهٔ چاپخانه‌ها (۱۰٫۱) با ظاهر
 * هشدار و آیکون، در همهٔ صفحه‌ها و در حالت سفارش هم (سؤال ۲۹۳)؛ نوار اعلان مالک پس از انداختن فایل و در صفحهٔ سفارش نیست (`site-idle`،
 * سؤال ۲۹۲)، مثل ناوبری سربرگ.
 */
export function SiteBar({ view }: { view: SiteBarView }) {
  if (view.kind === 'owner') return <AnnouncementBar bar={view.bar} options={{ values: view.values }} className="site-idle" />;
  return (
    <aside className="site-bar site-bar--warn" aria-label="اعلان" data-closure="">
      <p className="site-wrap site-bar__in">
        <span className="jy-icon jy-icon-warning" aria-hidden="true" />
        <span>
          چاپخانه‌ها تا {view.closure.lastDay} تعطیل‌اند. سفارش‌های این روزها از {view.closure.resumes} چاپ می‌شوند، و روز کاری تحویل به پست از
          همان روز شمرده می‌شود.
        </span>
      </p>
    </aside>
  );
}
