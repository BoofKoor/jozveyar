import type { SiteClosure } from '../lib/server/closure';

/**
 * نوار «چاپخانه‌ها تعطیل‌اند» بالای صفحهٔ اصلی (برش ۱۰٫۱، سؤال ۲۷۰): کامپوننت سرور و بی JS، پیش و پس از فایل همان‌جا. سفارش بسته نیست؛
 * فقط می‌گوید چاپ از کی است.
 */
export function ClosureBar({ closure }: { closure: SiteClosure }) {
  return (
    <div className="home-closure" data-closure="">
      <div className="site-wrap">
        <p className="jy-note jy-note--warning" role="status">
          <span className="jy-icon jy-icon-warning" aria-hidden="true" />
          <span>
            چاپخانه‌ها تا {closure.lastDay} تعطیل‌اند. سفارش‌های این روزها از {closure.resumes} چاپ می‌شوند، و روز کاری تحویل به پست از همان
            روز شمرده می‌شود.
          </span>
        </p>
      </div>
    </div>
  );
}
