/**
 * «چه عوض می‌شود» صفحهٔ انتشار (برش ۱۱٫۱، سؤال ۲۸۶): متن روی سایت در برابر متنی که منتشر می‌شود، بند به بند، همان‌طور که مشتری می‌خواند
 * (جای‌نگهدار با عدد امروز، بی نشانهٔ Markdown). در هر بند عوض‌شده واژه‌های افزوده `ins` و برداشته `del` دارند. متن صفحه با تیتر بخش هر
 * تغییر؛ سؤال‌ها با شماره‌شان، و جابه‌جایی جدا.
 */

import { fieldsOf, readPath, type AnyContent, type ContentKind, type FaqContent, type FieldSpec } from './kinds.js';
import { blockText, inlineText, parseInline, parseMarkdown, type Block, type InlineFormat } from './markdown.js';
import type { PlaceholderValues } from './placeholders.js';

export type DiffSegment = { text: string; mark?: 'ins' | 'del' };

export interface ContentChange {
  /** تیتر بخش صفحه، نام فیلد، یا «سؤال 3». */
  section: string;
  /** null یعنی تازه. */
  before: DiffSegment[] | null;
  /** null یعنی برداشته شد. */
  after: DiffSegment[] | null;
}

export interface ContentDiff {
  changes: ContentChange[];
  /** نام فیلدهای بی تغییر، برای «بقیه … همان است». */
  unchanged: string[];
  /** فقط سؤال‌ها: ترتیب عوض شد. */
  reordered: boolean;
}

/** LCS دو فهرست با برابری `same`؛ جفت اندیس‌های برابر به ترتیب. */
function common<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): [number, number][] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] = same(a[i]!, b[j]!) ? table[(i + 1) * cols + j + 1]! + 1 : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i]!, b[j]!)) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) i += 1;
    else j += 1;
  }
  return pairs;
}

function merged(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if (last && last.mark === segment.mark) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

/** دو متن واژه به واژه: آنچه در `before` نیست در `after` افزوده است، و برعکس. */
export function wordDiff(before: string, after: string): { before: DiffSegment[]; after: DiffSegment[] } {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const pairs = common(a, b, (x, y) => x === y);
  const keptA = new Set(pairs.map(([i]) => i));
  const keptB = new Set(pairs.map(([, j]) => j));
  // فاصلهٔ میان دو واژهٔ نشان‌دار هم نشان می‌گیرد، تا جملهٔ افزوده یک تکه باشد.
  const marked = (tokens: string[], kept: Set<number>, mark: 'ins' | 'del') => {
    const changed = tokens.map((text, i) => !kept.has(i) && !/^\s+$/.test(text));
    return merged(
      tokens.map((text, i) =>
        changed[i] || (/^\s+$/.test(text) && changed[i - 1] === true && changed[i + 1] === true) ? { text, mark } : { text },
      ),
    );
  };
  return { before: marked(a, keptA, 'del'), after: marked(b, keptB, 'ins') };
}

const plain = (text: string): DiffSegment[] => [{ text }];

function textChange(section: string, before: string, after: string): ContentChange {
  if (!before) return { section, before: null, after: plain(after) };
  if (!after) return { section, before: plain(before), after: null };
  const diff = wordDiff(before, after);
  return { section, before: diff.before, after: diff.after };
}

/** متن یک فیلد همان‌طور که روی سایت خوانده می‌شود. */
function fieldText(spec: FieldSpec, value: string, values: PlaceholderValues): string {
  if (spec.format === 'markdown') return parseMarkdown(value).blocks.map((block) => blockText(block, values)).join('\n');
  const inline: InlineFormat | null =
    spec.format === 'plain' || spec.format === 'line' || spec.format === 'emphasis' || spec.format === 'paragraph' ? spec.format : null;
  return inline ? inlineText(parseInline(value, inline).nodes, values) : value;
}

interface Section {
  heading: string;
  key: string;
  text: string;
}

/** بخش‌های متن صفحه: هر تیتر و هر بند و فهرست، با تیتر بخشی که در آن است. */
function sections(blocks: readonly Block[], values: PlaceholderValues): Section[] {
  let heading = '';
  return blocks.map((block) => {
    const text = blockText(block, values);
    if (block.type === 'heading') heading = text;
    return { heading: block.type === 'heading' ? text : heading, key: `${block.type}:${text}`, text };
  });
}

function bodyChanges(before: string, after: string, values: PlaceholderValues): { changes: ContentChange[]; anyKept: boolean } {
  const a = sections(parseMarkdown(before).blocks, values);
  const b = sections(parseMarkdown(after).blocks, values);
  const pairs = common(a, b, (x, y) => x.key === y.key);
  const changes: ContentChange[] = [];
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...pairs, [a.length, b.length] as [number, number]]) {
    const removed = a.slice(i, pi);
    const added = b.slice(j, pj);
    for (let k = 0; k < Math.max(removed.length, added.length); k++) {
      const old = removed[k];
      const fresh = added[k];
      changes.push(textChange(fresh?.heading || old?.heading || 'متن صفحه', old?.text ?? '', fresh?.text ?? ''));
    }
    i = pi + 1;
    j = pj + 1;
  }
  return { changes, anyKept: pairs.length > 0 };
}

function faqDiff(before: FaqContent, after: FaqContent, values: PlaceholderValues): ContentDiff {
  const answer = (a: string) => inlineText(parseInline(a, 'paragraph').nodes, values);
  const changes: ContentChange[] = [];
  const oldByQ = new Map(before.items.map((item, i) => [item.q, { item, i }]));
  const newQs = new Set(after.items.map((item) => item.q));
  after.items.forEach((item, i) => {
    const old = oldByQ.get(item.q);
    const section = `سؤال ${i + 1}: ${item.q}`;
    if (!old) changes.push({ section, before: null, after: plain(answer(item.a)) });
    else if (old.item.a !== item.a) changes.push(textChange(section, answer(old.item.a), answer(item.a)));
  });
  before.items.forEach((item, i) => {
    if (!newQs.has(item.q)) changes.push({ section: `سؤال ${i + 1}: ${item.q}`, before: plain(answer(item.a)), after: null });
  });
  const kept = after.items.filter((item) => oldByQ.has(item.q)).map((item) => item.q);
  const keptBefore = before.items.filter((item) => newQs.has(item.q)).map((item) => item.q);
  return { changes, unchanged: [], reordered: kept.join('\n') !== keptBefore.join('\n') };
}

export function contentDiff(kind: ContentKind, before: AnyContent, after: AnyContent, values: PlaceholderValues): ContentDiff {
  if (kind === 'faq') return faqDiff(before as FaqContent, after as FaqContent, values);
  const changes: ContentChange[] = [];
  const unchanged: string[] = [];
  for (const spec of fieldsOf(kind)) {
    const old = readPath(before, spec.name);
    const fresh = readPath(after, spec.name);
    if (spec.format === 'markdown') {
      const body = bodyChanges(old, fresh, values);
      changes.push(...body.changes);
      if (body.changes.length === 0) unchanged.push(spec.label);
      else if (body.anyKept) unchanged.push(`بقیهٔ ${spec.label}`);
      continue;
    }
    if (old === fresh) {
      unchanged.push(spec.label);
      continue;
    }
    changes.push(textChange(spec.label, fieldText(spec, old, values), fieldText(spec, fresh, values)));
  }
  return { changes, unchanged, reordered: false };
}
