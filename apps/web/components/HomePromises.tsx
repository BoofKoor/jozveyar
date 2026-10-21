import type { HomeContent, PlaceholderValues } from '@jozveyar/content';
import { InlineText } from '@jozveyar/content/render';

/** نماد هر نوید، به ترتیب طرح؛ آیکون جزو طرح است و از پنل عوض نمی‌شود (سؤال ۲۸۳). */
const PROMISE_ICONS = ['tag', 'truck', 'lock'] as const;

/**
 * سه نوید زیر کارت بارگذاری (طرح ز؛ از ۱۱٫۱ متن «صفحهٔ اصلی» پنل). کامپوننت سرور؛ صفحهٔ اصلی و از ۱۵٫۲ هر صفحهٔ فرود همین را دارند (سؤال ۴۵۴).
 */
export function HomePromises({ promises, values }: { promises: HomeContent['promises']; values: PlaceholderValues }) {
  const options = { values };
  return (
    <ul className="home-trust">
      {promises.map((promise, i) => (
        <li key={i}>
          <span className="home-trust__ic">
            <span className={`jy-icon jy-icon-${PROMISE_ICONS[i]}`} aria-hidden="true" />
          </span>
          <span className="home-trust__t">
            <b>
              <InlineText text={promise.title} format="line" options={options} />
            </b>
            <span>
              <InlineText text={promise.sub} format="line" options={options} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
