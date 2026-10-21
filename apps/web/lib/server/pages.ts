/**
 * صفحه‌های فرود و «تعرفه» روی سایت (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۱، ۴۵۲ تا ۴۵۷): حال امروز هر صفحه از نسخه‌هایی که مالک از پنل منتشر کرد
 * (`site_page_*`)، با همان ISR ۶۰ ثانیهٔ صفحه‌های دیگر: انتشار، زمان‌داری که ساعتش رسید، و برداشتن تا یک دقیقه بعد روی سایت است.
 *
 * - **build و بی `DATABASE_URL`:** هیچ صفحهٔ فرودی، و «تعرفه» با متن پیش‌فرض.
 * - **پایگاه داده خطا داد:** بلند در لاگ، و خطا بالا می‌رود؛ ISR صفحهٔ قبلی را نگه می‌دارد.
 * - **یک بار در هر رسم** (`cache` React): پاورقی (layout) و خود صفحه با یک خواندن.
 */

import { cache } from 'react';

import type { PaperSize, PriceList } from '@jozveyar/contracts';
import {
  PLACEHOLDER_SOURCES,
  blockPlaceholders,
  defaultTariffPage,
  inlineText,
  isPagePlaceholder,
  landingOf,
  pageValues,
  parseInline,
  parseMarkdown,
  placeholderValues,
  placeholdersIn,
  tariffPageOf,
  type AnyPlaceholderName,
  type DeskPreset,
  type InlineFormat,
  type LandingContent,
  type PageValues,
  type TariffPageContent,
} from '@jozveyar/content';
import { createSitePageStore, getDb, type LivePage, type SitePageStore, type SlugResolution } from '@jozveyar/db';
import type { PausedOptions } from '@jozveyar/pricing';

import { INITIAL_CONFIG, type OrderConfig } from '../orderConfig';
import type { SiteTariff } from '../tariff';
import { contentFacts, settingsOf } from './content';
import { siteFiles, type SiteFiles } from './fileRules';
import { siteFacts } from './siteFacts';
import { BUILD_PHASE, siteTariff, siteTariffChangedAt } from './tariff';

/** پیوندهای گروه «چاپ جزوه»ی پاورقی، «تعرفه» هم (سؤال ۴۵۲): بیشتر از این، فهرست کلیدواژه می‌شد. */
export const FOOTER_LINKS_MAX = 12;

type PageSource = Pick<SitePageStore, 'live' | 'resolve'>;

let source: PageSource | undefined;
const sourceOf = () => (source ??= createSitePageStore(getDb()));

const offline = (env: Readonly<Record<string, string | undefined>>) => env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL;

export async function loadLivePages(
  at: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
  from: () => Pick<SitePageStore, 'live'> = sourceOf,
): Promise<LivePage[]> {
  if (offline(env)) return [];
  try {
    return await from().live(at);
  } catch (error) {
    console.error('✗ سایت: صفحه‌ها از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}

/** صفحه‌های روی سایت همین حالا، یک بار در هر رسم. */
export const siteLivePages = cache(() => loadLivePages(new Date()));

export async function loadResolution(
  slug: string,
  at: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
  from: () => Pick<SitePageStore, 'resolve'> = sourceOf,
): Promise<SlugResolution> {
  if (offline(env)) return { kind: 'none' };
  try {
    return await from().resolve(slug, at);
  } catch (error) {
    console.error('✗ سایت: صفحه از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}

/** جواب سایت برای `/<نشانی>`، یک بار در هر رسم (متادیتا و خود صفحه). */
export const siteResolve = cache((slug: string) => loadResolution(slug, new Date()));

export interface LiveTariffPage {
  content: TariffPageContent;
  /** از کی همین متن روی سایت است؛ null یعنی متن پیش‌فرض. */
  since: Date | null;
}

/** «تعرفه»ی روی سایت: آخرین نسخه‌ای که مالک منتشر کرد، وگرنه متن پیش‌فرض (سؤال ۴۵۷). */
export function liveTariffPage(live: readonly LivePage[]): LiveTariffPage {
  const page = live.find((row) => row.kind === 'tariff');
  return page ? { content: tariffPageOf(page.content), since: page.since } : { content: defaultTariffPage(), since: null };
}

export interface FooterLanding {
  path: `/${string}`;
  label: string;
}

/** صفحه‌های فرودی که مالک «در پاورقی» گذاشته، به ترتیب پنل (شمارهٔ صفحه)، تا سقف گروه با «تعرفه» (سؤال ۴۵۲). */
export function footerLandings(live: readonly LivePage[]): FooterLanding[] {
  return live
    .filter((row) => row.kind === 'landing')
    .map((row) => ({ row, content: landingOf(row.content) }))
    .filter(({ content }) => content.inFooter && content.name)
    .slice(0, FOOTER_LINKS_MAX - 1)
    .map(({ row, content }) => ({ path: `/${row.slug}` as const, label: content.name }));
}

/**
 * پیش‌فرض میز یک صفحه (سؤال ۴۵۵): فقط گزینه‌ای که همین حالا در تعرفه روشن و در دسترس است؛ بقیه پیش‌فرض سایت، بی یادداشت. null یعنی صفحه چیزی
 * جز پیش‌فرض سایت نمی‌خواهد.
 */
export function presetConfig(desk: DeskPreset, list: PriceList, paused: PausedOptions): OrderConfig | null {
  const own = <T>(table: Readonly<Record<string, T>>, id: string): T | undefined =>
    id && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
  const size: PaperSize = desk.size && list.printRates[desk.size] && !paused.sizes.has(desk.size) ? desk.size : INITIAL_CONFIG.paperSize;
  const paper = own(list.paperTypes, desk.paper);
  const paperTypeId = paper?.enabled && !paused.papers.has(desk.paper) && paper.sheetRates[size] !== undefined ? desk.paper : INITIAL_CONFIG.paperTypeId;
  const binding = own(list.bindingTypes, desk.binding);
  const bindingTypeId =
    binding?.enabled && !paused.bindings.has(desk.binding) && (binding.bands[size]?.length ?? 0) > 0 ? desk.binding : INITIAL_CONFIG.bindingTypeId;
  const config: OrderConfig = {
    ...INITIAL_CONFIG,
    colorMode: desk.color || INITIAL_CONFIG.colorMode,
    sidesMode: desk.sides || INITIAL_CONFIG.sidesMode,
    paperSize: size,
    paperTypeId,
    bindingTypeId,
  };
  const plain = (Object.keys(INITIAL_CONFIG) as (keyof OrderConfig)[]).every((key) => config[key] === INITIAL_CONFIG[key]);
  return plain ? null : config;
}

/** صفحهٔ فرودی که این نشانی نشان می‌دهد، یا null. */
export function landingOfResolution(resolution: SlugResolution): { page: LivePage; content: LandingContent } | null {
  return resolution.kind === 'page' && resolution.page.kind === 'landing' ? { page: resolution.page, content: landingOf(resolution.page.content) } : null;
}

/** آنچه صفحه‌های فرود و «تعرفه» از سایت امروز می‌خواهند: تعرفه، قاعده‌های فایل، مقدار جای‌نگهدارها و روز فعال شدن تعرفهٔ فعال. */
export interface PageContext {
  tariff: SiteTariff;
  files: SiteFiles;
  values: PageValues;
  /** روز فعال شدن تعرفهٔ فعال: «آخرین تغییر قیمت» و `{تغییر_قیمت}`؛ build و بی پایگاه داده null. */
  priceChangedAt: Date | null;
}

/** یک بار در هر رسم (متادیتا و خود صفحه)؛ مقدار جای‌نگهدارها با همان واقعیت‌های صفحه‌های دیگر (`contentFacts`) و دو جای‌نگهدار صفحه‌ها. */
export const sitePageContext = cache(async (): Promise<PageContext> => {
  const [tariff, files, facts, priceChangedAt] = await Promise.all([siteTariff(), siteFiles(), siteFacts(), siteTariffChangedAt()]);
  const values = pageValues(placeholderValues(contentFacts(tariff, files, facts)), { at: new Date(), priceChangedAt });
  return { tariff, files, values, priceChangedAt };
});

/** عنوان یا توضیح گوگل یک صفحه، بی قالب و با عدد امروز (همان که پنل با سقفش سنجید، سؤال ۴۶۴). */
export function seoText(text: string, values: PageValues): string {
  return inlineText(parseInline(text, 'line', { page: true }).nodes, values);
}

/** آنچه متن دیدنی یک صفحه از آن است، برای «آخرین تغییر» نقشهٔ سایت (۱۵٫۱، سؤال ۴۲۸): عنوان و توضیح گوگل نه، چون دیده نمی‌شوند. */
export interface PageDeps {
  /** تنظیم‌های جای‌نگهدارهایش. */
  settings: string[];
  /** عددی از تعرفه دارد: بلوک زنده، نرخ و کرایه، یا `{تغییر_قیمت}`. «تعرفه» همیشه، چون جدول‌ها و ماشین‌حسابش از تعرفه‌اند. */
  tariff: boolean;
  /** `{سال}` دارد: نوروز متنش را عوض می‌کند. */
  year: boolean;
}

export function pageDeps(content: LandingContent | TariffPageContent): PageDeps {
  const fields: [string, InlineFormat][] = [
    [content.title, 'line'],
    [content.lead, 'line'],
    ...content.faq.map((item): [string, InlineFormat] => [item.a, 'paragraph']),
  ];
  const body = 'body' in content ? parseMarkdown(content.body, { page: true }).blocks : [];
  const names = [...fields.flatMap(([text, format]) => placeholdersIn(parseInline(text, format, { page: true }).nodes)), ...blockPlaceholders(body)];
  const fromTariff = (name: AnyPlaceholderName) => (isPagePlaceholder(name) ? name === 'تغییر_قیمت' : PLACEHOLDER_SOURCES[name].setting === null);
  return {
    settings: settingsOf(names),
    tariff: !('body' in content) || body.some((block) => block.type === 'block') || names.some(fromTariff),
    year: names.includes('سال'),
  };
}
