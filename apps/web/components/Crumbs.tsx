import { Fragment } from 'react';

import { TextContent } from '@jozveyar/content/render';

export interface Crumb {
  name: string;
  /** پیوند پله؛ پلهٔ آخر خود صفحه است، بی پیوند. */
  path?: string;
}

/**
 * مسیر دیدنی (برش ۱۵٫۲، سؤال ۴۵۳؛ طرح `seo.html`): «جزوه‌یار ‹ پرینت PDF». فقط بالای صفحه‌های فرود و «تعرفه» (و مقاله‌ها از ۱۵٫۳)؛ همان پله‌ها در
 * `BreadcrumbList` صفحه. کامپوننت سرور، بی JS؛ ظاهر در `landing.css`.
 */
export function Crumbs({ items, className }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav className={className ? `site-crumbs ${className}` : 'site-crumbs'} aria-label="مسیر">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 ? <span className="jy-icon jy-icon-chevron" aria-hidden="true" /> : null}
          {item.path && i < items.length - 1 ? (
            <a href={item.path}>
              <TextContent text={item.name} />
            </a>
          ) : (
            <span aria-current="page">
              <TextContent text={item.name} />
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
