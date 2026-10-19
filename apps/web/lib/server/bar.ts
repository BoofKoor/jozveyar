/**
 * نوار بالای سربرگ همهٔ صفحه‌های سایت (برش ۱۱٫۳، ADR-066؛ سؤال‌های ۲۹۱ تا ۲۹۴): وقتی همین حالا همهٔ چاپخانه‌ها تعطیل‌اند پیام تعطیلی (۱۰٫۱،
 * `closure.ts`)، وگرنه نوار اعلانی که مالک یا متصدی از «محتوای سایت» پنل روشن کرده (`content.bar`)، اگر همین حالا روشن است؛ هیچ‌کدام، هیچ.
 * پیام کار بر پیام تبلیغ مقدم است، و نوار مالک پس از تعطیلی خودش برمی‌گردد (سؤال ۲۹۳).
 *
 * layout با ISR ۶۰ ثانیه همین را می‌خواند، پس تغییر پنل و مرز روز بازه تا یک دقیقه بعد روی سایت است. مثل بقیهٔ بارگذارها: build و بی پایگاه داده
 * هیچ، و خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد. عدد جای‌نگهدارها فقط وقتی متن جای‌نگهدار دارد خوانده می‌شود (تعرفه و
 * تنظیم‌ها)، با همان بارگذارهای صفحه‌ها، پس عدد نوار همان عدد صفحه است.
 */

import { cache } from 'react';

import {
  PLACEHOLDERS,
  barHref,
  barVisibleAt,
  parseInline,
  placeholderValues,
  placeholdersIn,
  type ContentFacts,
  type PlaceholderValues,
} from '@jozveyar/content';
import type { AnnouncementBar } from '@jozveyar/contracts';
import { BAR_SETTING, createOrderStore, getDb, readSetting } from '@jozveyar/db';

import { loadClosure, type ClosureSource, type SiteClosure } from './closure';
import { contentFacts } from './content';
import { siteFiles } from './fileRules';
import { siteFacts } from './siteFacts';
import { BUILD_PHASE, siteTariff } from './tariff';

export type SiteBarView =
  | { kind: 'closure'; closure: SiteClosure }
  | { kind: 'owner'; bar: { text: string; href: string; linkText: string }; values: PlaceholderValues };

/** متنی که جای‌نگهدار ندارد عدد نمی‌خواهد؛ رسم هم هیچ‌کدام را نمی‌خواند. */
const NO_VALUES = Object.fromEntries(PLACEHOLDERS.map((name) => [name, ''])) as unknown as PlaceholderValues;

export async function loadSiteBar(input: {
  closure: () => Promise<SiteClosure | null>;
  bar: () => Promise<AnnouncementBar>;
  facts: () => Promise<ContentFacts>;
  now: Date;
}): Promise<SiteBarView | null> {
  const closure = await input.closure();
  if (closure) return { kind: 'closure', closure };
  const bar = await input.bar();
  if (!barVisibleAt(bar, input.now)) return null;
  // پنل پیوند را پیش از ذخیره سنجیده؛ اینجا دوباره، تا مقداری که از راه دیگری در پایگاه داده نشسته پیوندی به سایت دیگر نشود.
  const href = barHref(bar.href) ?? '';
  const uses = placeholdersIn(parseInline(bar.text, 'emphasis').nodes).length > 0;
  return {
    kind: 'owner',
    bar: { text: bar.text, href, linkText: href ? bar.linkText : '' },
    values: uses ? placeholderValues(await input.facts()) : NO_VALUES,
  };
}

let source: ClosureSource | undefined;

export async function readSiteBar(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => ClosureSource = () => (source ??= createOrderStore(getDb())),
  now: () => Date = () => new Date(),
): Promise<SiteBarView | null> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return null;
  try {
    const store = sourceOf();
    const at = now();
    return await loadSiteBar({
      closure: () => loadClosure(store, at),
      bar: () => readSetting((key) => store.setting(key), BAR_SETTING),
      facts: async () => {
        const [tariff, files, facts] = await Promise.all([siteTariff(env), siteFiles(env), siteFacts(env)]);
        return contentFacts(tariff, files, facts);
      },
      now: at,
    });
  } catch (error) {
    console.error('✗ سایت: نوار بالای سربرگ از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}

/** نوار بالای سربرگ، یک بار در هر رسم صفحه. */
export const siteBar = cache(() => readSiteBar());
