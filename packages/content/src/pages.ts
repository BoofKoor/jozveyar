/**
 * صفحه‌های فرود و «تعرفه» (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۱ تا ۴۳۴ و ۴۵۱ تا ۴۶۶): شکل، فیلدها، یکدست کردن، سنجش و متن پیش‌فرض «تعرفه». مشترک
 * سایت و پنل؛ نسخه‌ها و پیش‌نویس در `site_page_*` (`@jozveyar/db`)، رسم در `render.tsx`.
 *
 * - **صفحهٔ فرود:** نشانی در ریشهٔ سایت (لاتین آوانگار، ADR-016)، نام کوتاه (مسیر دیدنی، پاورقی و پنل)، تیتر و جملهٔ زیرش، متن Markdown با بلوک‌های
 *   زنده، سؤال‌های خودش، پیش‌فرض میز، «در پاورقی» و گوگل.
 * - **«تعرفه»** (`/tarefe`): همان موتور با نشانی ثابت؛ تیتر، جمله، سؤال‌ها و گوگل از پنل، و ماشین‌حساب و جدول‌ها از تعرفهٔ فعال. تا مالک نسخه‌ای
 *   منتشر نکرده، متن پیش‌فرض همین‌جاست.
 *
 * JSON هر نسخه همین شکل است و فقط رشته و یک بولی (`inFooter`) دارد؛ هر چیز دیگر با خواندن کنار می‌رود (`landingOf`، `tariffPageOf`).
 */

import type { ColorMode, PaperSize, PriceList, SidesMode } from '@jozveyar/contracts';
import { NONE_PAUSED, PAPER_SIZE_ORDER, type PausedOptions } from '@jozveyar/pricing';
import { toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import { parseBlock, sampleQuote, vocabularyOf, type BlockIssueCode, type SampleOff } from './blocks.js';
import { lineExcerpt, type ContentIssue } from './check.js';
import type { FaqItem, Seo } from './kinds.js';
import { tidyMarkdown } from './kinds.js';
import { inlineText, linksIn, parseInline, parseMarkdown, type InlineFormat } from './markdown.js';
import type { PageValues } from './placeholders.js';

/* ───────────────────────── نشانی ───────────────────────── */

/** نشانی صفحهٔ فرود: حرف کوچک لاتین، رقم و خط تیره، دو تا شصت نویسه (ADR-016، سؤال ۴۳۱). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 2;
export const SLUG_MAX = 60;

/** نشانی ثابت «تعرفه». */
export const TARIFF_SLUG = 'tarefe';

/**
 * نام‌های رزرو (سؤال ۴۳۱): هر مسیر امروز سایت، فایل‌های ریشهٔ `public/`، مسیرهای برش ۱۵ (تعرفه و مقاله‌ها)، و `chap-jozve` که «چاپ جزوه»
 * خود صفحهٔ اصلی است (با ۳۰۱ به `/`). همان فهرست در CHECK `site_page_slugs_reserved` پایگاه داده است (0064).
 */
export const RESERVED_SLUGS: readonly string[] = [
  'about',
  'admin',
  'api',
  'apple-icon',
  'articles',
  'chap-jozve',
  'contact',
  'favicon',
  'fonts',
  'icon',
  'icons',
  'img',
  'manifest',
  'media',
  'opengraph-image',
  'order',
  'orders',
  'pay',
  'preview',
  'privacy',
  'robots',
  'sitemap',
  'tarefe',
  'terms',
];

/** «چاپ جزوه» خود صفحهٔ اصلی است (سؤال ۴۳۱)؛ این نشانی برای همیشه به `/` می‌رود. */
export const HOME_ALIAS = 'chap-jozve';

/** نشانی نوشته‌شده به شکل یکدست: بی `jozveyar.com` و «/»، حرف کوچک، ارقام لاتین، و فاصله و زیرخط خط تیره. */
export function tidySlug(raw: string): string {
  return toLatinDigits(raw)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.)?jozveyar\.com/i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-');
}

export type SlugProblem = 'required' | 'slug_format' | 'slug_reserved';

/** شکل نشانی؛ «تکراری» با پایگاه داده است (`slug_taken`). */
export function slugProblem(slug: string): SlugProblem | null {
  if (!slug) return 'required';
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) return 'slug_format';
  if (RESERVED_SLUGS.includes(slug)) return 'slug_reserved';
  return null;
}

/* ───────────────────────── شکل ───────────────────────── */

/** سقف سؤال‌های هر صفحه. */
export const PAGE_FAQ_MAX = 10;

/** پیش‌فرض میز این صفحه (سؤال ۴۵۵)؛ خالی یعنی پیش‌فرض سایت. */
export interface DeskPreset {
  color: '' | ColorMode;
  sides: '' | SidesMode;
  size: '' | PaperSize;
  /** شناسهٔ کاغذ و صحافی در تعرفه. */
  paper: string;
  binding: string;
}

export const NO_PRESET: DeskPreset = { color: '', sides: '', size: '', paper: '', binding: '' };

export interface LandingContent {
  /** بی «/»: `print-pdf`. */
  slug: string;
  /** نام کوتاه: مسیر دیدنی، پاورقی، «سؤال‌های …» و پنل («پرینت PDF»). */
  name: string;
  /** تیتر صفحه (`h1`)، با جای‌نگهدار. */
  title: string;
  lead: string;
  /** Markdown با بلوک‌های زنده. */
  body: string;
  faq: FaqItem[];
  desk: DeskPreset;
  /** در گروه «چاپ جزوه»ی پاورقی (سؤال ۴۵۲). */
  inFooter: boolean;
  seo: Seo;
}

export interface TariffPageContent {
  title: string;
  lead: string;
  faq: FaqItem[];
  seo: Seo;
}

export type SitePageKind = 'landing' | 'tariff';

export interface PageContentByKind {
  landing: LandingContent;
  tariff: TariffPageContent;
}

export type AnyPageContent = LandingContent | TariffPageContent;

/* ───────────────────────── فیلدها ───────────────────────── */

export type PageFieldFormat = InlineFormat | 'markdown' | 'slug' | 'preset' | 'flag';

export interface PageFieldSpec {
  name: string;
  label: string;
  format: PageFieldFormat;
  max: number;
  required: boolean;
  /** سقف با عدد امروز جای‌نگهدارها، نه نوشته (عنوان و توضیح گوگل، سؤال ۴۶۴). */
  measured?: true;
}

const n = (i: number) => String(i + 1);

function faqFields(count: number): PageFieldSpec[] {
  return Array.from({ length: count }, (_, i): PageFieldSpec[] => [
    { name: `faq.${i}.q`, label: `پرسش ${n(i)}`, format: 'plain', max: 150, required: true },
    { name: `faq.${i}.a`, label: `پاسخ ${n(i)}`, format: 'paragraph', max: 800, required: true },
  ]).flat();
}

const PAGE_SEO_FIELDS: PageFieldSpec[] = [
  { name: 'seo.title', label: 'عنوان گوگل', format: 'line', max: 60, required: true, measured: true },
  { name: 'seo.description', label: 'توضیح گوگل', format: 'line', max: 160, required: true, measured: true },
];

/** فیلدهای هر نوع، به ترتیب فرم؛ سؤال‌ها به شمار همان متن. */
export function pageFieldsOf(kind: SitePageKind, faqCount = 0): PageFieldSpec[] {
  if (kind === 'tariff') {
    return [
      { name: 'title', label: 'تیتر صفحه', format: 'line', max: 80, required: true },
      { name: 'lead', label: 'جملهٔ زیر تیتر', format: 'line', max: 300, required: true },
      ...faqFields(faqCount),
      ...PAGE_SEO_FIELDS,
    ];
  }
  return [
    { name: 'slug', label: 'نشانی', format: 'slug', max: SLUG_MAX, required: true },
    { name: 'name', label: 'نام کوتاه', format: 'plain', max: 30, required: true },
    { name: 'title', label: 'تیتر صفحه', format: 'line', max: 80, required: true },
    { name: 'lead', label: 'جملهٔ زیر تیتر', format: 'line', max: 300, required: true },
    { name: 'body', label: 'متن صفحه', format: 'markdown', max: 20_000, required: true },
    ...faqFields(faqCount),
    { name: 'desk.color', label: 'رنگ میز', format: 'preset', max: 10, required: false },
    { name: 'desk.sides', label: 'یکرو یا دوروی میز', format: 'preset', max: 10, required: false },
    { name: 'desk.size', label: 'اندازهٔ میز', format: 'preset', max: 10, required: false },
    { name: 'desk.paper', label: 'کاغذ میز', format: 'preset', max: 64, required: false },
    { name: 'desk.binding', label: 'صحافی میز', format: 'preset', max: 64, required: false },
    { name: 'inFooter', label: 'در پاورقی', format: 'flag', max: 1, required: false },
    ...PAGE_SEO_FIELDS,
  ];
}

/* ───────────────────────── خواندن و ساختن ───────────────────────── */

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const field = (source: unknown, key: string): unknown =>
  source !== null && typeof source === 'object' ? (source as Record<string, unknown>)[key] : undefined;

function faqOf(value: unknown): FaqItem[] {
  return Array.isArray(value) ? value.slice(0, PAGE_FAQ_MAX).map((item) => ({ q: str(field(item, 'q')), a: str(field(item, 'a')) })) : [];
}

const seoOf = (value: unknown): Seo => ({ title: str(field(value, 'title')), description: str(field(value, 'description')) });

function presetOf(value: unknown): DeskPreset {
  const color = str(field(value, 'color'));
  const sides = str(field(value, 'sides'));
  const size = str(field(value, 'size'));
  return {
    color: color === 'bw' || color === 'color' ? color : '',
    sides: sides === 'single' || sides === 'double' ? sides : '',
    size: (PAPER_SIZE_ORDER as readonly string[]).includes(size) ? (size as PaperSize) : '',
    paper: str(field(value, 'paper')),
    binding: str(field(value, 'binding')),
  };
}

/** JSON نسخه یا پیش‌نویس به صفحهٔ فرود: هر فیلدی که شکلش نیست خالی، و هیچ کلید دیگری. */
export function landingOf(source: unknown): LandingContent {
  return {
    slug: str(field(source, 'slug')),
    name: str(field(source, 'name')),
    title: str(field(source, 'title')),
    lead: str(field(source, 'lead')),
    body: str(field(source, 'body')),
    faq: faqOf(field(source, 'faq')),
    desk: presetOf(field(source, 'desk')),
    inFooter: field(source, 'inFooter') === true,
    seo: seoOf(field(source, 'seo')),
  };
}

export function tariffPageOf(source: unknown): TariffPageContent {
  return {
    title: str(field(source, 'title')),
    lead: str(field(source, 'lead')),
    faq: faqOf(field(source, 'faq')),
    seo: seoOf(field(source, 'seo')),
  };
}

export function pageContentOf<K extends SitePageKind>(kind: K, source: unknown): PageContentByKind[K] {
  return (kind === 'tariff' ? tariffPageOf(source) : landingOf(source)) as PageContentByKind[K];
}

/** متن از فرم پنل، هر فیلد با نامش (`faq.2.a`، `desk.color`، `inFooter` = «1»)؛ سؤال‌ها به شمار `faqCount`. */
export function pageFromFields<K extends SitePageKind>(kind: K, get: (name: string) => string, faqCount = 0): PageContentByKind[K] {
  const faq = Array.from({ length: Math.max(0, Math.min(faqCount, PAGE_FAQ_MAX)) }, (_, i) => ({ q: get(`faq.${i}.q`), a: get(`faq.${i}.a`) }));
  const seo = { title: get('seo.title'), description: get('seo.description') };
  if (kind === 'tariff') return { title: get('title'), lead: get('lead'), faq, seo } as PageContentByKind[K];
  return {
    slug: get('slug'),
    name: get('name'),
    title: get('title'),
    lead: get('lead'),
    body: get('body'),
    faq,
    desk: presetOf({ color: get('desk.color'), sides: get('desk.sides'), size: get('desk.size'), paper: get('desk.paper'), binding: get('desk.binding') }),
    inFooter: get('inFooter') === '1' || get('inFooter') === 'on',
    seo,
  } as PageContentByKind[K];
}

/** همهٔ فیلدها یکدست (رقم‌ها لاتین و «ي» و «ك» فارسی، مثل ۱۱٫۱)، و نشانی به شکل `tidySlug`. */
export function tidyPage<K extends SitePageKind>(kind: K, content: PageContentByKind[K]): PageContentByKind[K] {
  const faq = content.faq.map((item) => ({ q: tidyInputFa(item.q), a: tidyInputFa(item.a) }));
  const seo = { title: tidyInputFa(content.seo.title), description: tidyInputFa(content.seo.description) };
  if (kind === 'tariff') return { title: tidyInputFa(content.title), lead: tidyInputFa(content.lead), faq, seo } as PageContentByKind[K];
  const landing = content as LandingContent;
  return {
    slug: tidySlug(landing.slug),
    name: tidyInputFa(landing.name),
    title: tidyInputFa(landing.title),
    lead: tidyInputFa(landing.lead),
    body: tidyMarkdown(landing.body),
    faq,
    desk: { ...landing.desk, paper: landing.desk.paper.trim(), binding: landing.desk.binding.trim() },
    inFooter: landing.inFooter,
    seo,
  } as PageContentByKind[K];
}

/** JSON یکتای یک متن، برای «همان که دیده شد» و «چیزی عوض نشد». */
export function canonicalPage(kind: SitePageKind, content: AnyPageContent): string {
  if (kind === 'tariff') {
    const page = content as TariffPageContent;
    return JSON.stringify([kind, page.title, page.lead, page.faq.map((item) => [item.q, item.a]), page.seo.title, page.seo.description]);
  }
  const page = content as LandingContent;
  return JSON.stringify([
    kind,
    page.slug,
    page.name,
    page.title,
    page.lead,
    page.body,
    page.faq.map((item) => [item.q, item.a]),
    [page.desk.color, page.desk.sides, page.desk.size, page.desk.paper, page.desk.binding],
    page.inFooter,
    page.seo.title,
    page.seo.description,
  ]);
}

export const samePage = (kind: SitePageKind, a: AnyPageContent, b: AnyPageContent) => canonicalPage(kind, a) === canonicalPage(kind, b);

/* ───────────────────────── سنجش ───────────────────────── */

/** آنچه سنجش صفحه از سایت امروز لازم دارد. */
export interface PageCheckContext {
  /** مقدار امروز جای‌نگهدارها، برای سقف عنوان و توضیح گوگل. */
  values: PageValues;
  /** تعرفهٔ فعال و گزینه‌های موقتاً خاموش: واژه‌ها و هشدارهای بلوک‌ها، و گزینه‌های میز. */
  priceList: PriceList;
  paused?: PausedOptions;
  /** سقف صفحهٔ هر فایل (`file.max_pages`)، سقف جزوهٔ نمونه. */
  maxPages: number;
  /** نشانی‌ای از همین سایت که همین حالا روی سایت است (بی `#…` و `?…`)؛ پیوند به هر چیز دیگر خطای انتشار است (سؤال ۴۶۴). */
  livePath: (path: string) => boolean;
  /** نشانی مال صفحهٔ دیگری است (روی سایت، برداشته یا نشانی قبلی‌اش). */
  slugTaken?: (slug: string) => boolean;
}

/** هشدار بلوکی که امروز قیمت ندارد (سؤال ۴۶۴): انتشار را نمی‌بندد؛ روی سایت «فعلاً ارائه نمی‌شود». */
export interface PageWarning {
  field: string;
  label: string;
  line: number;
  raw: string;
  off: SampleOff;
}

export interface PageCheck {
  issues: ContentIssue[];
  warnings: PageWarning[];
}

const lengthOf = (value: string) => [...value].length;

/** مسیر یک پیوند درونی، بی `#…` و `?…`؛ `tel:` و `mailto:` هیچ. */
export function linkPath(href: string): string | null {
  if (!href.startsWith('/')) return null;
  const path = href.replace(/[?#].*$/, '');
  return path === '' ? '/' : path;
}

function checkText(spec: PageFieldSpec, value: string, ctx: PageCheckContext, issues: ContentIssue[], warnings: PageWarning[]) {
  const at = { field: spec.name, label: spec.label };
  if (spec.format === 'markdown') {
    const parsed = parseMarkdown(value, { page: true });
    for (const issue of parsed.issues) issues.push({ ...at, ...issue, excerpt: lineExcerpt(value, issue.line) });
    const vocabulary = vocabularyOf(ctx.priceList);
    for (const block of parsed.blocks) {
      if (block.type !== 'block') continue;
      const { block: parsedBlock, issues: blockIssues } = parseBlock(block.raw, vocabulary, ctx.maxPages);
      for (const issue of blockIssues) {
        issues.push({
          ...at,
          code: issue.code as BlockIssueCode,
          line: block.line,
          excerpt: `[[${block.raw}]]`,
          ...(issue.detail ? { detail: issue.detail } : {}),
          ...(issue.max ? { max: issue.max } : {}),
        });
      }
      if (parsedBlock?.kind === 'price') {
        const sample = sampleQuote(parsedBlock.spec, ctx.priceList, ctx.paused ?? NONE_PAUSED);
        if (!sample.ok) warnings.push({ ...at, line: block.line, raw: block.raw, off: sample.off });
      }
    }
    for (const link of linksIn(parsed.blocks)) checkLink(link.href, link.line, value, at, ctx, issues);
    return;
  }
  const format = spec.format as InlineFormat;
  const parsed = parseInline(value, format, { page: true });
  for (const { line: _line, ...issue } of parsed.issues) issues.push({ ...at, ...issue });
  for (const node of parsed.nodes) if (node.type === 'link') checkLink(node.href, null, value, at, ctx, issues);
  if (spec.measured) {
    const shown = lengthOf(inlineText(parsed.nodes, ctx.values));
    if (shown > spec.max) issues.push({ ...at, code: 'too_long', max: spec.max, length: shown, measured: true });
  }
}

function checkLink(
  href: string,
  line: number | null,
  source: string,
  at: { field: string; label: string },
  ctx: PageCheckContext,
  issues: ContentIssue[],
) {
  const path = linkPath(href);
  if (path === null || ctx.livePath(path)) return;
  issues.push({ ...at, code: 'link_not_live', detail: href, ...(line !== null ? { line, excerpt: lineExcerpt(source, line) } : {}) });
}

/** گزینهٔ میز درست است اگر تعرفهٔ امروز دارد و روشن است (موقتاً خاموش هم پذیرفته است: سایت آن روز پیش‌فرض را می‌گذارد). */
function presetIssues(desk: DeskPreset, list: PriceList): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const bad = (name: string, label: string) => issues.push({ field: `desk.${name}`, label, code: 'desk_option' });
  if (desk.size && list.printRates[desk.size] === undefined) bad('size', 'اندازهٔ میز');
  if (desk.paper && !list.paperTypes[desk.paper]?.enabled) bad('paper', 'کاغذ میز');
  if (desk.binding && !list.bindingTypes[desk.binding]?.enabled) bad('binding', 'صحافی میز');
  return issues;
}

/**
 * سنجش یک صفحه پیش از انتشار (سؤال ۴۶۴): خطا انتشار را می‌بندد و پیش‌نویس را نه؛ هشدار نه این و نه آن. سرور همین را پیش از کد تازه و دوباره
 * پیش از نوشتن می‌سنجد (قاعدهٔ ۲).
 */
export function checkPage(kind: SitePageKind, content: AnyPageContent, ctx: PageCheckContext): PageCheck {
  const issues: ContentIssue[] = [];
  const warnings: PageWarning[] = [];
  for (const spec of pageFieldsOf(kind, content.faq.length)) {
    if (spec.format === 'preset' || spec.format === 'flag') continue;
    const value = readPagePath(content, spec.name);
    const at = { field: spec.name, label: spec.label };
    if (spec.format === 'slug') {
      const problem = slugProblem(value);
      if (problem) issues.push({ ...at, code: problem, ...(value ? { detail: value } : {}) });
      else if (ctx.slugTaken?.(value)) issues.push({ ...at, code: 'slug_taken', detail: value });
      continue;
    }
    if (!value) {
      if (spec.required) issues.push({ ...at, code: 'required' });
      continue;
    }
    if (!spec.measured && lengthOf(value) > spec.max) issues.push({ ...at, code: 'too_long', max: spec.max, length: lengthOf(value) });
    checkText(spec, value, ctx, issues, warnings);
  }
  if (kind === 'landing') issues.push(...presetIssues((content as LandingContent).desk, ctx.priceList));
  return { issues, warnings };
}

/** مقدار رشته‌ای یک مسیر فیلد صفحه («faq.1.a»، «seo.title»). */
export function readPagePath(content: AnyPageContent, path: string): string {
  let value: unknown = content;
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return '';
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'string' ? value : '';
}

/* ───────────────────────── «تعرفه»: متن پیش‌فرض ───────────────────────── */

/**
 * متن پیش‌فرض «تعرفه» (طرح `seo.html`، سؤال ۴۵۷): تا مالک نسخه‌ای منتشر نکرده همین روی سایت است. عددها جای‌نگهدارند؛ جدول‌ها و ماشین‌حساب از
 * تعرفهٔ فعال‌اند و در متن نیستند.
 */
const TARIFF_PAGE: TariffPageContent = {
  title: 'قیمت چاپ جزوه و پرینت، امروز',
  lead: 'همان عددهایی که موقع سفارش حساب می‌شوند، بی هزینهٔ پنهان. فایل که بیندازی، قیمت دقیق جزوهٔ خودت را صفحهٔ اصلی می‌دهد.',
  faq: [
    {
      q: 'قیمت هر برگ است یا هر رو؟',
      a: 'هر رو. در دورو هر برگ دو رو چاپ می‌شود، پس برگ‌ها نصف می‌شوند و صحافی و وزن پست کمتر؛ قیمت چاپ همان شمار رو است.',
    },
    {
      q: 'کرایه چطور حساب می‌شود؟',
      a: 'با وزن بسته و مقصد (استان تهران یا شهرهای دیگر)، با پست پیشتاز. شهر را در قدم آدرس انتخاب می‌کنی و کرایه همان‌جا در قیمت می‌آید.',
    },
    {
      q: 'اگر تعرفه عوض شود، قیمت سفارشم هم عوض می‌شود؟',
      a: 'نه. قیمت هر سفارش با ثبتش ثابت می‌شود؛ تعرفهٔ تازه فقط برای سفارش‌های بعد است.',
    },
  ],
  seo: {
    title: 'قیمت چاپ جزوه و پرینت سیاه‌سفید و رنگی {سال}',
    description: 'تعرفهٔ امروز چاپ هر رو، صحافی و کرایهٔ پست، با ماشین‌حساب بی فایل: سیاه‌سفید {نرخ_سیاه_سفید} و رنگی {نرخ_رنگی} تومان هر رو.',
  },
};

/** متن پیش‌فرض «تعرفه»؛ نسخه‌ای تازه، تا کسی نتواند ثابت را دست بزند. */
export const defaultTariffPage = (): TariffPageContent => structuredClone(TARIFF_PAGE);

/** صفحهٔ فرود خالی، برای «صفحهٔ تازه». */
export const emptyLanding = (): LandingContent => ({
  slug: '',
  name: '',
  title: '',
  lead: '',
  body: '',
  faq: [],
  desk: { ...NO_PRESET },
  inFooter: false,
  seo: { title: '', description: '' },
});
