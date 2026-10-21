/**
 * رسم متن‌های سایت (برش ۱۱٫۱): همان اجزا در سایت (کامپوننت سرور) و در پیش‌نمایش پنل، تا پیش‌نمایش همان باشد که مشتری می‌بیند. هیچ
 * HTMLی از متن ساخته نمی‌شود: هر تکه رشته‌ای است که React همان‌طور می‌نویسد، و پیوند فقط با نشانی‌ای که `linkTarget` پذیرفته.
 *
 * عدد در `.num` خودش و واژهٔ لاتین در `bdi`، مثل `Inline` سایت؛ واژه‌ای با نقطه یا @ (`sms.ir`، ایمیل، `A4`) یک تکه است، وگرنه در متن
 * راست‌به‌چپ برعکس دیده می‌شد. مقدار جای‌نگهدار در پیش‌نمایش پنل کلاس `live` را می‌گیرد (خط‌چین).
 */

import { Fragment, type ReactNode } from 'react';

import { PageBlock, type BlockData } from './blocksRender.js';
import { parseInline, parseMarkdown, type InlineFormat, type InlineNode, type LinkChild } from './markdown.js';
import type { AnyPlaceholderName, PlaceholderValues } from './placeholders.js';

/** واژهٔ لاتین (با نقطه، @، خط تیره و رقم درونش) یا عدد؛ چند واژهٔ لاتین با یک فاصله یک تکه‌اند («Save As»). */
const TOKEN = /([A-Za-z][A-Za-z0-9]*(?:[.@_\-/:+]+[A-Za-z0-9]+)*(?: [A-Za-z][A-Za-z0-9]*(?:[.@_\-/:+]+[A-Za-z0-9]+)*)*|\d+(?:[.,]\d+)*)/;

/** متن فارسی با عدد و واژهٔ لاتین درونش. */
export function TextContent({ text }: { text: string }): ReactNode {
  return text.split(TOKEN).map((part, i) =>
    i % 2 === 0 ? (
      part
    ) : /^\d/.test(part) ? (
      <span key={i} className="num">
        {part}
      </span>
    ) : (
      <bdi key={i}>{part}</bdi>
    ),
  );
}

export interface RenderOptions {
  values: PlaceholderValues;
  /** کلاس مقدار جای‌نگهدار (پیش‌نمایش پنل)؛ در سایت هیچ. */
  live?: string;
  /** پیوند در زبانهٔ تازه (بخش‌های صفحهٔ اصلی که در حالت سفارش هم هستند، مثل سؤال‌ها). */
  newTab?: boolean;
  /** پیش‌نمایش پنل: پیوند بی نشانی، تا از پنل به جایی نرود. */
  inert?: boolean;
}

function Value({ name, options }: { name: AnyPlaceholderName; options: RenderOptions }): ReactNode {
  const text = <TextContent text={options.values[name] ?? ''} />;
  return options.live ? <span className={options.live}>{text}</span> : text;
}

function linkChildren(children: readonly LinkChild[], options: RenderOptions): ReactNode {
  return children.map((child, i) =>
    child.type === 'text' ? <TextContent key={i} text={child.text} /> : <Value key={i} name={child.name} options={options} />,
  );
}

function node(item: InlineNode, i: number, options: RenderOptions): ReactNode {
  if (item.type === 'text') return <TextContent key={i} text={item.text} />;
  if (item.type === 'ph') return <Value key={i} name={item.name} options={options} />;
  const external = item.href.startsWith('tel:') || item.href.startsWith('mailto:');
  return (
    <a
      key={i}
      className="jy-link"
      {...(options.inert ? { 'data-href': item.href } : { href: item.href })}
      {...(options.newTab && !external && !options.inert ? { target: '_blank', rel: 'noopener' } : {})}
    >
      {linkChildren(item.children, options)}
    </a>
  );
}

/** تکه‌های درون‌خطی؛ پررنگ‌های پشت‌سرهم یک `<b>` (یا `<mark>` در تیتر صفحهٔ اصلی). */
export function InlineNodes({ nodes, options, strong = 'b' }: { nodes: readonly InlineNode[]; options: RenderOptions; strong?: 'b' | 'mark' }): ReactNode {
  const out: ReactNode[] = [];
  let run: ReactNode[] = [];
  const close = () => {
    if (run.length === 0) return;
    const Strong = strong;
    out.push(<Strong key={`s${out.length}`}>{run}</Strong>);
    run = [];
  };
  nodes.forEach((item, i) => {
    if (item.bold) run.push(node(item, i, options));
    else {
      close();
      out.push(node(item, i, options));
    }
  });
  close();
  return out;
}

/** یک فیلد یک‌خطی یا یک‌بندی؛ `page` با دو جای‌نگهدار صفحه‌های فرود و «تعرفه» (۱۵٫۲). */
export function InlineText({ text, format, options, page }: { text: string; format: InlineFormat; options: RenderOptions; page?: boolean }): ReactNode {
  return <InlineNodes nodes={parseInline(text, format, { page: page === true }).nodes} options={options} />;
}

/**
 * نوار اعلان (برش ۱۱٫۳، سؤال ۲۹۱؛ طرح `content.html`): متن با پررنگ و عدد امروز، و با پیوند کل نوار پیوند است با «متن پیوند ←» ته جمله.
 * کلاس‌ها از `@jozveyar/ui/bar.css`. ریشه `className` را هم می‌گیرد (`site-idle` سایت: پس از انداختن فایل و در صفحهٔ سفارش نیست، سؤال ۲۹۲).
 * پیش‌نمایش پنل (`inert`) پیوند نیست و ظرف پهنای سایت (`site-wrap`) را ندارد. متن در یک `span`، تا نوار flex یک تکه داشته باشد و فاصلهٔ کنار
 * عدد و پررنگ نیفتد.
 */
export function AnnouncementBar({
  bar,
  options,
  className,
}: {
  bar: { text: string; href: string; linkText: string };
  options: RenderOptions;
  className?: string;
}): ReactNode {
  const root = className ? `site-bar ${className}` : 'site-bar';
  const go = bar.href ? (
    <>
      {' '}
      <span className="site-bar__go">
        <TextContent text={bar.linkText} />
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      </span>
    </>
  ) : null;
  const body = (
    <span>
      <InlineNodes nodes={parseInline(bar.text, 'emphasis').nodes} options={options} />
      {go}
    </span>
  );
  if (options.inert) {
    return (
      <span className={root} data-href={bar.href || undefined}>
        <span className="site-bar__in">{body}</span>
      </span>
    );
  }
  if (bar.href) {
    return (
      <a className={root} href={bar.href}>
        <span className="site-wrap site-bar__in">{body}</span>
      </a>
    );
  }
  return (
    <aside className={root} aria-label="اعلان">
      <p className="site-wrap site-bar__in">{body}</p>
    </aside>
  );
}

/**
 * تیتر صفحهٔ اصلی: سر ویرگول به تکه‌های `clause` (که فقط آنجا می‌شکنند)، و تأکید `**…**` با `<mark>`. متن خام همان جمله می‌ماند (سئو).
 */
export function HeroTitle({ text, options, clause }: { text: string; options: RenderOptions; clause?: string }): ReactNode {
  const parts = text.split(/(?<=،)\s+/);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? ' ' : null}
      <span className={clause}>
        <InlineNodes nodes={parseInline(part, 'emphasis').nodes} options={options} strong="mark" />
      </span>
    </Fragment>
  ));
}

/**
 * متن صفحه: تیترها (`h2` در سایت، `h3` در پیش‌نمایش پنل)، بندها و فهرست‌ها. با `blocks` (صفحه‌های فرود و «تعرفه»، ۱۵٫۲) بلوک‌های زنده و دو
 * جای‌نگهدار صفحه‌ها هم، با تعرفهٔ امروز.
 */
export function MarkdownBlocks({
  text,
  options,
  heading = 'h2',
  headingClass,
  blocks,
}: {
  text: string;
  options: RenderOptions;
  heading?: 'h2' | 'h3';
  headingClass?: string;
  blocks?: BlockData;
}): ReactNode {
  const Heading = heading;
  return parseMarkdown(text, { page: blocks !== undefined }).blocks.map((block, i) => {
    if (block.type === 'block') return blocks ? <PageBlock key={i} raw={block.raw} data={blocks} /> : null;
    if (block.type === 'heading') {
      return (
        <Heading key={i} className={headingClass}>
          <InlineNodes nodes={block.children} options={options} />
        </Heading>
      );
    }
    if (block.type === 'paragraph') {
      return (
        <p key={i}>
          <InlineNodes nodes={block.children} options={options} />
        </p>
      );
    }
    return (
      <ul key={i}>
        {block.items.map((item, j) => (
          <li key={j}>
            <InlineNodes nodes={item.children} options={options} />
          </li>
        ))}
      </ul>
    );
  });
}

export * from './blocksRender.js';
