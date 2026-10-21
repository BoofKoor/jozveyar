/**
 * متن‌های سایت روی سایت (برش ۱۱٫۱، ADR-065): آخرین نسخهٔ هر متن که مالک از پنل منتشر کرد، و متنی که نسخه ندارد یا آخرین نسخه‌اش برگشت به
 * پیش‌فرض است همان «متن پیش‌فرض» کد (`@jozveyar/content`، سؤال ۲۸۸)، با عدد امروز هر جای‌نگهدار از همان تعرفه و `settings`ی که سایت با آن
 * کار می‌کند. صفحه‌ها ISR ۶۰ ثانیه‌اند، پس متن تازه تا یک دقیقه بعد روی سایت است.
 *
 * - **build و بی `DATABASE_URL`:** هیچ نسخه، یعنی متن پیش‌فرض (مثل تعرفه).
 * - **پایگاه داده خطا داد:** بلند در لاگ، و خطا بالا می‌رود؛ ISR صفحهٔ قبلی را نگه می‌دارد. متن پیش‌فرض نه: شاید مالک متن دیگری منتشر کرده.
 * - **یک بار در هر رسم** (`cache` React): پاورقی (layout) و خود صفحه با یک خواندن.
 */

import { cache } from 'react';

import {
  DEFAULT_REVISED,
  PLACEHOLDER_SOURCES,
  blockPlaceholders,
  contentOf,
  defaultContent,
  factsOf,
  parseInline,
  parseMarkdown,
  placeholdersIn,
  type ContentByKind,
  type ContentFacts,
  type ContentKind,
  type InlineFormat,
  type PageContent,
  type PlaceholderName,
} from '@jozveyar/content';
import { createSiteContentStore, getDb, type SiteContentStore } from '@jozveyar/db';
import { parseJalaliNumeric } from '@jozveyar/text';

import type { SiteTariff } from '../tariff';
import type { SiteFiles } from './fileRules';
import type { SiteFacts } from './siteFacts';
import { BUILD_PHASE } from './tariff';

/** آخرین نسخهٔ یک متن؛ `content` خالی یعنی برگشت به متن پیش‌فرض. */
export interface PublishedText {
  content: unknown;
  version: number;
  at: Date;
}

export type SitePublished = Partial<Record<ContentKind, PublishedText>>;

let source: Pick<SiteContentStore, 'live'> | undefined;

export async function loadPublished(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => Pick<SiteContentStore, 'live'> = () => (source ??= createSiteContentStore(getDb())),
): Promise<SitePublished> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return {};
  try {
    const live = await sourceOf().live();
    return Object.fromEntries(Object.values(live).map((row) => [row.kind, { content: row.content, version: row.version, at: row.createdAt }]));
  } catch (error) {
    console.error('✗ سایت: متن‌ها از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}

/** متن‌های منتشرشده، یک بار در هر رسم صفحه. */
export const sitePublished = cache(() => loadPublished());

export interface LiveText<K extends ContentKind> {
  content: ContentByKind[K];
  /** نسخه‌ای با متن مالک؛ null یعنی متن پیش‌فرض. */
  version: number | null;
  /**
   * روز آخرین تغییر خود متن روی سایت: انتشار متن مالک؛ برای متن پیش‌فرض، دیرترینِ برگشت به آن و تاریخ بازنویسی خود متن پیش‌فرض (قوانین و
   * حریم خصوصی). null یعنی تاریخی ندارد.
   */
  changedAt: Date | null;
}

/** متن روی سایت یک نوع: نسخهٔ مالک، یا متن پیش‌فرض با واقعیت‌های امروز. */
export function liveText<K extends ContentKind>(kind: K, published: SitePublished, facts?: ContentFacts): LiveText<K> {
  const row = published[kind];
  if (row && row.content !== null) return { content: contentOf(kind, row.content), version: row.version, changedAt: row.at };
  const revisedText = kind === 'terms' || kind === 'privacy' ? DEFAULT_REVISED[kind as 'terms' | 'privacy'] : null;
  const revised = revisedText ? parseJalaliNumeric(revisedText) : null;
  const candidates = [revised, row?.at ?? null].filter((at): at is Date => at !== null);
  return {
    content: defaultContent(kind, facts),
    version: null,
    changedAt: candidates.length > 0 ? new Date(Math.max(...candidates.map((at) => at.getTime()))) : null,
  };
}

/** واقعیت‌های جای‌نگهدارها از همان بارگذارهای صفحه: تعرفهٔ فعال، قاعده‌های فایل و تنظیم‌های صفحه‌های ثابت. */
export function contentFacts(tariff: SiteTariff, files: SiteFiles, facts: Pick<SiteFacts, 'orderFilesDays'>): ContentFacts {
  return factsOf({
    priceList: tariff.priceList,
    slaDays: tariff.slaDays,
    uploadDays: files.uploadDays,
    orderFilesDays: facts.orderFilesDays,
    formats: files.rules.formats,
  });
}

/**
 * تنظیم‌هایی که متن یک صفحه از آن‌هاست: جای‌نگهدارهای جملهٔ آغاز و متن صفحه. تغییر هر کدام «به‌روز شده در» را جلو می‌برد، چون عدد متن عوض
 * شده؛ نرخ‌ها از تعرفه‌اند و تنظیم ندارند.
 */
export function pageSettings(page: PageContent): string[] {
  return settingsOf([...placeholdersIn(parseInline(page.lead, 'line').nodes), ...blockPlaceholders(parseMarkdown(page.body).blocks)]);
}

/**
 * تنظیم‌هایی که متن صفحهٔ اصلی و سؤال‌هایش از آن‌هاست (برش ۱۵٫۱): «آخرین تغییر» صفحهٔ اصلی در نقشهٔ سایت. نرخ‌ها تنظیم ندارند و از تعرفه‌اند
 * (زمان فعال شدن تعرفه جداست، `siteTariffChangedAt`).
 */
export function homeSettings(home: ContentByKind['home'], faq: ContentByKind['faq']): string[] {
  const fields: [string, InlineFormat][] = [
    [home.eyebrow, 'line'],
    [home.title, 'emphasis'],
    [home.lead, 'line'],
    [home.howTitle, 'line'],
    ...home.promises.flatMap((promise): [string, InlineFormat][] => [
      [promise.title, 'line'],
      [promise.sub, 'line'],
    ]),
    ...home.steps.flatMap((step): [string, InlineFormat][] => [
      [step.title, 'line'],
      [step.body, 'paragraph'],
    ]),
    ...faq.items.map((item): [string, InlineFormat] => [item.a, 'paragraph']),
  ];
  return settingsOf(fields.flatMap(([text, format]) => placeholdersIn(parseInline(text, format).nodes)));
}

/** تنظیم پشت هر جای‌نگهدار، هر کدام یک بار. */
function settingsOf(names: readonly PlaceholderName[]): string[] {
  return [...new Set(names.flatMap((name) => (PLACEHOLDER_SOURCES[name].setting ? [PLACEHOLDER_SOURCES[name].setting!] : [])))];
}
