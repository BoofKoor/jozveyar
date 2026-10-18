import type { ReactNode } from 'react';

import type { PageContent, PlaceholderValues } from '@jozveyar/content';
import { InlineText, MarkdownBlocks, TextContent } from '@jozveyar/content/render';

import { StaticPage } from './StaticPage';

/**
 * صفحهٔ ثابت از متنی که مالک از پنل منتشر کرد، یا متن پیش‌فرض (برش ۱۱٫۱، سؤال‌های ۲۸۳ و ۲۸۴): تیتر، «به‌روز شده»، جملهٔ آغاز و متن Markdown
 * محدود، با همان پوستهٔ ۷٫۴ (`StaticPage`، `pages.css`) و عدد امروز هر جای‌نگهدار. کامپوننت سرور، بی JS؛ هیچ متنی HTML نمی‌شود.
 */
export function ContentPage({
  id,
  page,
  values,
  updated,
  children,
}: {
  id: string;
  page: PageContent;
  values: PlaceholderValues;
  updated?: string;
  /** بخشی که از متن دیگری است، پس از متن صفحه (نشانی «دربارهٔ ما»). */
  children?: ReactNode;
}) {
  const options = { values };
  return (
    <StaticPage
      id={id}
      title={<TextContent text={page.title} />}
      {...(updated ? { updated } : {})}
      lead={<InlineText text={page.lead} format="line" options={options} />}
    >
      <MarkdownBlocks text={page.body} options={options} />
      {children}
    </StaticPage>
  );
}
