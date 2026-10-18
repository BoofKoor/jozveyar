/**
 * Markdown محدود متن‌های سایت (برش ۱۱٫۱، سؤال ۲۸۴): بند با خط خالی، تیتر `##`، فهرست `-`، پررنگ `**…**`، پیوند `[متن](/نشانی)` فقط به همین
 * سایت، `tel:` و `mailto:`، و جای‌نگهدار `{نام}`. هر چیز دیگری (HTML، تصویر، جدول، پیوند به سایت دیگر، تیتر سطح دیگر، فهرست شماره‌دار)
 * خطای انتشار است، با شمارهٔ خط و راه درست کردن؛ هیچ متنی HTML نمی‌شود، و React هر نویسه را همان‌طور که هست می‌نویسد.
 *
 * تجزیه همیشه تمام می‌شود: آنچه خطاست متن ساده می‌ماند (پیش‌نمایش پیش‌نویس همان را نشان می‌دهد)، و انتشار فقط بی خطاست. پس متنی که یک بار
 * منتشر شد، حتی اگر قاعده‌ای بعداً سخت‌تر شود، همیشه رسم می‌شود.
 *
 * چهار شکل درون‌خطی برای فیلدهای یک‌خطی و یک‌بندی:
 *  - `plain`: فقط متن (عنوان گوگل، پرسش، پاورقی، ساعت و نشانی).
 *  - `line`: متن و جای‌نگهدار (جمله‌ها و تیترهای صفحهٔ اصلی، جملهٔ آغاز صفحه‌ها).
 *  - `emphasis`: همان، با دست‌بالا یک تأکید `**…**` (تیتر صفحهٔ اصلی).
 *  - `paragraph`: یک بند با پررنگ، پیوند و جای‌نگهدار (پاسخ سؤال‌ها، متن «سه قدم»).
 */

import { isPlaceholder, suggestPlaceholder, type PlaceholderName, type PlaceholderValues } from './placeholders.js';

export type InlineFormat = 'plain' | 'line' | 'emphasis' | 'paragraph';

export type LinkChild = { type: 'text'; text: string } | { type: 'ph'; name: PlaceholderName };

export type InlineNode =
  | { type: 'text'; text: string; bold?: true }
  | { type: 'ph'; name: PlaceholderName; bold?: true }
  | { type: 'link'; href: string; children: LinkChild[]; bold?: true };

export type Block =
  | { type: 'heading'; line: number; children: InlineNode[] }
  | { type: 'paragraph'; line: number; children: InlineNode[] }
  | { type: 'list'; line: number; items: { line: number; children: InlineNode[] }[] };

export type MarkdownIssueCode =
  | 'html'
  | 'image'
  | 'table'
  | 'quote'
  | 'rule'
  | 'numbered_list'
  | 'heading_level'
  | 'heading_empty'
  | 'link_external'
  | 'link_broken'
  | 'link_empty'
  | 'link_not_here'
  | 'bold_unclosed'
  | 'bold_not_here'
  | 'emphasis_twice'
  | 'placeholder_unknown'
  | 'placeholder_not_here';

export interface MarkdownIssue {
  /** شمارهٔ خط در همان فیلد، از ۱. */
  line: number;
  code: MarkdownIssueCode;
  /** آنچه نوشته شد: تگ، نشانی پیوند، یا نام جای‌نگهدار. */
  detail?: string;
  /** درست‌شده‌اش، اگر حدسی هست: «**مبلغ کاملش**» به جای `<b>`، یا نام نزدیک‌ترین جای‌نگهدار. */
  suggestion?: string;
}

/** نشانی پیوند: همین سایت (`/…`، و `https://jozveyar.com/…` همان مسیر می‌شود)، `tel:` و `mailto:`؛ null یعنی سایت دیگر. */
export function linkTarget(href: string): string | null {
  if (/^\/(?!\/)\S*$/.test(href)) return href;
  const own = /^https?:\/\/(?:www\.)?jozveyar\.com(\/\S*)?$/i.exec(href);
  if (own) return own[1] && own[1] !== '' ? own[1] : '/';
  if (/^tel:\+?\d{3,15}$/.test(href)) return href;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return href;
  return null;
}

const HTML_START = /[A-Za-z/!]/;

class InlineParser {
  readonly nodes: InlineNode[] = [];
  private buffer = '';
  private bold = false;
  private boldStart = 0;
  private emphases = 0;

  constructor(
    private readonly text: string,
    private readonly format: InlineFormat,
    private readonly base: number,
    private readonly lineAt: (offset: number) => number,
    private readonly issues: MarkdownIssue[],
  ) {}

  /** هر خطا یک بار در هر خط؛ جای‌نگهدار و پیوند ناشناس یکی برای هر نام و نشانی. */
  private issue(offset: number, code: MarkdownIssueCode, extra: { detail?: string; suggestion?: string } = {}) {
    const line = this.lineAt(this.base + offset);
    const byDetail = code === 'placeholder_unknown' || code === 'placeholder_not_here' || code === 'link_external';
    if (this.issues.some((i) => i.line === line && i.code === code && (!byDetail || i.detail === extra.detail))) return;
    this.issues.push({ line, code, ...extra });
  }

  private flush() {
    if (!this.buffer) return;
    this.nodes.push({ type: 'text', text: this.buffer, ...(this.bold ? { bold: true as const } : {}) });
    this.buffer = '';
  }

  parse(): InlineNode[] {
    const { text } = this;
    let i = 0;
    while (i < text.length) {
      const rest = text.slice(i);
      const c = text[i]!;
      if (c === '<' && HTML_START.test(text[i + 1] ?? '')) {
        const tag = /^<[^<>]{0,60}>?/.exec(rest)![0];
        // «<b>مبلغ کاملش</b>» یک خطاست، با درست‌شده‌اش؛ هر تگ دیگر جدا.
        const bold = /^<(b|strong)\b[^>]*>$/i.exec(tag);
        const close = bold ? new RegExp(`</${bold[1]}\\s*>`, 'i').exec(text.slice(i + tag.length)) : null;
        const span = close ? tag + text.slice(i + tag.length, i + tag.length + close.index + close[0].length) : tag;
        const suggestion = close ? `**${text.slice(i + tag.length, i + tag.length + close.index).trim()}**` : undefined;
        this.issue(i, 'html', { detail: tag.slice(0, 40), ...(suggestion ? { suggestion } : {}) });
        this.buffer += span;
        i += span.length;
        continue;
      }
      if (c === '!' && text[i + 1] === '[') {
        const image = /^!\[[^\]]*\]\([^)]*\)?/.exec(rest);
        if (image) {
          this.issue(i, 'image');
          this.buffer += image[0];
          i += image[0].length;
          continue;
        }
      }
      if (c === '[') {
        const link = /^\[([^[\]]*)\]\(([^()\s]*)\)/.exec(rest);
        if (link) {
          if (this.format !== 'paragraph') {
            this.issue(i, 'link_not_here');
            this.buffer += link[0];
          } else {
            const label = link[1]!.trim();
            const href = linkTarget(link[2]!);
            if (!label) this.issue(i, 'link_empty');
            if (href === null) this.issue(i, 'link_external', { detail: link[2]! });
            if (label && href !== null) {
              this.flush();
              const offset = i + 1 + link[1]!.indexOf(label);
              const children = new InlineParser(label, 'line', this.base + offset, this.lineAt, this.issues)
                .parse()
                .map((node): LinkChild => (node.type === 'ph' ? { type: 'ph', name: node.name } : { type: 'text', text: node.type === 'text' ? node.text : '' }));
              this.nodes.push({ type: 'link', href, children, ...(this.bold ? { bold: true as const } : {}) });
            } else {
              this.buffer += link[0];
            }
          }
          i += link[0].length;
          continue;
        }
        if (/^\[[^[\]]*\]\(/.test(rest)) this.issue(i, 'link_broken');
      }
      if (c === '*' && text[i + 1] === '*') {
        if (this.format === 'plain' || this.format === 'line') {
          this.issue(i, 'bold_not_here');
          this.buffer += '**';
        } else {
          this.flush();
          this.bold = !this.bold;
          if (this.bold) {
            this.boldStart = i;
            this.emphases += 1;
            if (this.format === 'emphasis' && this.emphases === 2) this.issue(i, 'emphasis_twice');
          }
        }
        i += 2;
        continue;
      }
      if (c === '{') {
        const ph = /^\{([^{}\n]{1,40})\}/.exec(rest);
        if (ph) {
          const name = ph[1]!.trim();
          if (!isPlaceholder(name)) {
            const suggestion = suggestPlaceholder(name);
            this.issue(i, 'placeholder_unknown', { detail: name, ...(suggestion ? { suggestion } : {}) });
            this.buffer += ph[0];
          } else if (this.format === 'plain') {
            this.issue(i, 'placeholder_not_here', { detail: name });
            this.buffer += ph[0];
          } else {
            this.flush();
            this.nodes.push({ type: 'ph', name, ...(this.bold ? { bold: true as const } : {}) });
          }
          i += ph[0].length;
          continue;
        }
      }
      this.buffer += c;
      i += 1;
    }
    this.flush();
    if (this.bold) this.issue(this.boldStart, 'bold_unclosed');
    return this.nodes;
  }
}

/** یک فیلد یک‌خطی یا یک‌بندی؛ خطا همه با خط ۱. */
export function parseInline(text: string, format: InlineFormat): { nodes: InlineNode[]; issues: MarkdownIssue[] } {
  const issues: MarkdownIssue[] = [];
  const nodes = new InlineParser(text, format, 0, () => 1, issues).parse();
  return { nodes, issues };
}

/** تکه‌ای چندخطی (بند یا یک قلم فهرست): خط‌ها با یک فاصله یکی می‌شوند و خطای هر جا شمارهٔ خط خودش را دارد. */
function inlineOf(parts: readonly { line: number; text: string }[], issues: MarkdownIssue[]): InlineNode[] {
  const starts: { offset: number; line: number }[] = [];
  let joined = '';
  for (const part of parts) {
    if (joined) joined += ' ';
    starts.push({ offset: joined.length, line: part.line });
    joined += part.text;
  }
  const lineAt = (offset: number) => [...starts].reverse().find((start) => start.offset <= offset)?.line ?? parts[0]!.line;
  return new InlineParser(joined, 'paragraph', 0, lineAt, issues).parse();
}

/** ردیف جدول («| … |»)، یا خط جداکنندهٔ سرستون («---|---»). */
const TABLE = /^\|.*|^:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/;

/** متن کامل یک صفحه (قوانین، حریم خصوصی، دربارهٔ ما) به بخش‌ها، با خطاهایش. */
export function parseMarkdown(source: string): { blocks: Block[]; issues: MarkdownIssue[] } {
  const blocks: Block[] = [];
  const issues: MarkdownIssue[] = [];
  let paragraph: { line: number; text: string }[] = [];
  let list: { line: number; text: string }[][] = [];

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', line: paragraph[0]!.line, children: inlineOf(paragraph, issues) });
    if (list.length > 0) {
      blocks.push({
        type: 'list',
        line: list[0]![0]!.line,
        items: list.map((item) => ({ line: item[0]!.line, children: inlineOf(item, issues) })),
      });
    }
    paragraph = [];
    list = [];
  };
  const issue = (line: number, code: MarkdownIssueCode) => {
    if (!issues.some((i) => i.line === line && i.code === code)) issues.push({ line, code });
  };

  source.split('\n').forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (!text) return flush();
    const heading = /^(#+)\s*(.*)$/.exec(text);
    if (heading) {
      flush();
      if (heading[1]!.length !== 2) issue(line, 'heading_level');
      if (!heading[2]) return issue(line, 'heading_empty');
      blocks.push({ type: 'heading', line, children: inlineOf([{ line, text: heading[2] }], issues) });
      return;
    }
    if (TABLE.test(text)) {
      flush();
      return issue(line, 'table');
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) {
      flush();
      return issue(line, 'rule');
    }
    const numbered = /^\d+[.)]\s+(.*)$/.exec(text);
    const bullet = /^[-*•]\s+(.*)$/.exec(text);
    if (numbered || bullet) {
      if (numbered) issue(line, 'numbered_list');
      // خطی که پس از بندی بی خط خالی با «- » شروع شود، فهرست تازه است (بند، فهرست باز ندارد).
      if (paragraph.length > 0) flush();
      list.push([{ line, text: (numbered ?? bullet)![1]! }]);
      return;
    }
    if (text.startsWith('>')) issue(line, 'quote');
    if (list.length > 0) flush();
    paragraph.push({ line, text: text.startsWith('>') ? text.replace(/^>+\s*/, '') : text });
  });
  flush();
  // خطای جدول هر خط یک بار کافی است: بقیهٔ خط‌های همان جدول تکراری‌اند.
  const table = issues.filter((i) => i.code === 'table');
  const kept = issues.filter((i) => i.code !== 'table' || !table.some((t) => t.line === i.line - 1));
  return { blocks, issues: kept.sort((a, b) => a.line - b.line) };
}

/* ───────────────────────── متن ساده ───────────────────────── */

/** متن درون‌خطی بی قالب، با مقدار جای‌نگهدارها: برای دادهٔ گوگل (`FAQPage`)، «چه عوض می‌شود» و شمار نویسه. */
export function inlineText(nodes: readonly InlineNode[], values: PlaceholderValues): string {
  return nodes
    .map((node) =>
      node.type === 'text'
        ? node.text
        : node.type === 'ph'
          ? values[node.name]
          : node.children.map((child) => (child.type === 'text' ? child.text : values[child.name])).join(''),
    )
    .join('');
}

/** هر بخش صفحه به متن ساده؛ فهرست، یک خط برای هر قلم. */
export function blockText(block: Block, values: PlaceholderValues): string {
  return block.type === 'list' ? block.items.map((item) => inlineText(item.children, values)).join('\n') : inlineText(block.children, values);
}

/** جای‌نگهدارهایی که متن به کار برده. */
export function placeholdersIn(nodes: readonly InlineNode[]): PlaceholderName[] {
  return nodes.flatMap((node) =>
    node.type === 'ph' ? [node.name] : node.type === 'link' ? node.children.flatMap((child) => (child.type === 'ph' ? [child.name] : [])) : [],
  );
}

export function blockPlaceholders(blocks: readonly Block[]): PlaceholderName[] {
  return blocks.flatMap((block) => (block.type === 'list' ? block.items.flatMap((item) => placeholdersIn(item.children)) : placeholdersIn(block.children)));
}
