import type { ReactNode } from 'react';

/**
 * پوستهٔ صفحهٔ ثابت (برش ۷٫۴؛ طرح `docs/ui/mockups/checkout.html`، قدم ۵، سؤال ۱۴۲): یک ستون متن، تیتر صفحه، «به‌روز شده»
 * اگر صفحه تاریخ دارد، جملهٔ آغاز، و بخش‌ها با تیترهای بی شماره؛ با سربرگ و پاورقی عادی سایت (layout)، نه حالت سفارش.
 * کامپوننت سرور، بی JS؛ چیدمان در `pages.css`.
 */
export function StaticPage({
  id,
  title,
  updated,
  lead,
  children,
}: {
  /** شناسهٔ تیتر، برای `aria-labelledby` مقاله. */
  id: string;
  title: string;
  /** «به‌روز شده در …»، شمسی عددی (`pageDate`). */
  updated?: string;
  lead: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="site-wrap pg">
      <article className="pg-body" aria-labelledby={id}>
        <h1 id={id} className="pg-title">
          {title}
        </h1>
        {updated ? (
          <p className="pg-meta">
            به‌روز شده در <span className="num">{updated}</span>
          </p>
        ) : null}
        <p className="pg-lead">{lead}</p>
        {children}
      </article>
    </main>
  );
}
