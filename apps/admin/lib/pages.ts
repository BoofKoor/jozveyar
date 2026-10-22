/**
 * صفحه‌های فرود و «تعرفه» در پنل (برش ۱۵٫۲، ADR-071؛ طرح «صفحه‌ها و مقاله‌ها (برش ۱۵)»): نوشته‌های صفحه‌ها، خالص و بی JSX، تا تست بی مرورگر
 * بسنجدشان. حال هر صفحه در فهرست، روز و ساعت زمان‌دار، هشدار بلوک‌ها، خلاصهٔ صفحهٔ تازه در «چه عوض می‌شود»، نام نسخه‌ها، و گزینه‌های «میز
 * سفارش این صفحه».
 */

import type { PriceList } from '@jozveyar/contracts';
import { parseMarkdown, type AnyPageContent, type LandingContent, type PageWarning, type SampleOff, type SitePageKind } from '@jozveyar/content';
import type { PageState, SitePageDraftRow, SitePageVersionRow } from '@jozveyar/db';
import { DEFAULT_PAPER_SIZE, PAPER_SIZES, PAPER_SIZE_ORDER } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID } from '@jozveyar/pricing/seed';
import { formatJalaliWeekday, formatNumber, formatTehranTime } from '@jozveyar/text';

import { issueMessage, type ContentSeg } from './content';
import { dayText, whenText } from './format';
import type { PagePublishFrom, PageRow } from './server/pages';

/** «پنجشنبه 1 آبان، ساعت 09:00»: روز و ساعت زمان‌دار، به وقت تهران. */
export const scheduleText = (at: Date) => `${formatJalaliWeekday(at)}، ساعت ${formatTehranTime(at)}`;

export type BadgeTone = 'success' | 'info' | 'warning' | 'neutral';

/** نشان‌های یک ردیف فهرست (طرح «صفحه‌ها و مقاله‌ها»): روی سایت، زمان‌دار، پیش‌نویس، برداشته، متن پیش‌فرض، و شمار هشدار. */
export function rowBadges(row: PageRow): { tone: BadgeTone; text: string }[] {
  const out: { tone: BadgeTone; text: string }[] = [];
  const onSite = row.state.live !== null && row.state.live.content !== null;
  if (row.kind === 'tariff') out.push(row.isDefault ? { tone: 'neutral', text: 'متن پیش‌فرض' } : { tone: 'success', text: 'روی سایت' });
  else if (onSite) out.push({ tone: 'success', text: 'روی سایت' });
  else if (row.removed) out.push({ tone: 'neutral', text: 'برداشته' });
  if (row.state.pending) out.push({ tone: 'info', text: 'زمان‌دار' });
  if (row.draft) out.push({ tone: 'warning', text: 'پیش‌نویس' });
  const alerts = row.warnings.length + row.blockIssues.length;
  if (alerts > 0) out.push({ tone: 'warning', text: alerts === 1 ? '1 هشدار' : `${formatNumber(alerts)} هشدار` });
  return out;
}

/** چرا قیمت نمونه امروز نیست (سؤال ۴۶۴): «اندازهٔ A5 امروز در تعرفه نیست». */
export function offText(off: SampleOff): ContentSeg[] {
  switch (off.reason) {
    case 'size':
      return ['اندازهٔ ', { ltr: PAPER_SIZES[off.size].label }, ' امروز در تعرفه نیست یا موقتاً خاموش است'];
    case 'paper':
      return [`کاغذ «${off.name}» امروز در تعرفه نیست یا خاموش است`];
    case 'binding':
      return [`صحافی «${off.name}» امروز در تعرفه نیست یا خاموش است`];
    case 'misfit':
      return off.misfit.reason === 'min'
        ? [`صحافی «${off.name}» از `, { num: formatNumber(off.misfit.minSheets) }, ' برگ است و این جزوه کمتر دارد']
        : off.misfit.reason === 'max'
          ? [`صحافی «${off.name}» تا `, { num: formatNumber(off.misfit.maxSheets) }, ' برگ است و چند جلد نمی‌شود']
          : [`صحافی «${off.name}» برای این اندازه نیست`];
  }
}

/** هشدار یک بلوک، در خط هشدار ویرایشگر و صفحهٔ انتشار: «خط 11، بلوک [[…]]: اندازهٔ A5 امروز در تعرفه نیست. روی سایت …». */
export function warningLine(warning: PageWarning): ContentSeg[] {
  return [
    'خط ',
    { num: String(warning.line) },
    '، بلوک ',
    { ph: `[[${warning.raw}]]` },
    ': ',
    ...offText(warning.off),
    '. روی سایت به جای قیمت «فعلاً ارائه نمی‌شود» می‌آید، تا روزی که گزینه‌اش در تعرفه باشد.',
  ];
}

/**
 * زیر نام یک ردیف فهرست: نشانی، و حال صفحه: «نسخهٔ 1، 27 مهر، سارا»، «روی سایت پنجشنبه 1 آبان، ساعت 09:00»، «برداشته شد … به /tarefe»،
 * «هنوز منتشر نشده»؛ «در پاورقی»؛ پیش‌نویس با روزش؛ و اولین هشدار بلوک‌ها.
 */
export function rowMeta(row: PageRow, now: Date): ContentSeg[] {
  const out: ContentSeg[] = [{ ltr: `/${row.slug}` }];
  if (row.kind === 'tariff') out.push(' · ماشین‌حساب و جدول‌ها از تعرفهٔ فعال؛ تیتر، متن، سؤال‌ها و گوگل از اینجا');
  const live = row.state.live;
  if (live && live.content !== null) {
    out.push(' · نسخهٔ ', { num: formatNumber(live.version) }, `، ${dayText(live.liveFrom, now)}، ${live.createdByName}`);
    if (row.inFooter) out.push(' · در پاورقی');
  } else if (row.removed) {
    const { version, to } = row.removed;
    out.push(` · برداشته شد، ${dayText(version.liveFrom, now)}: `);
    if (version.removal === 'gone' || to === null) out.push('«پیدا نشد»');
    else if (to === '/') out.push('به صفحهٔ اصلی');
    else out.push('به ', { ltr: to });
  } else if (row.kind === 'tariff') {
    out.push(' · متن پیش‌فرض سایت');
  } else if (!row.state.pending) {
    out.push(' · هنوز منتشر نشده');
  }
  const pending = row.state.pending;
  if (pending) out.push(` · روی سایت ${scheduleText(pending.liveFrom)} · با کد تازه، ${pending.createdByName}`);
  if (row.draft) out.push(...draftText(row.draft, now));
  const warning = row.warnings[0];
  if (warning) out.push(' · بلوک ', { ph: `[[${warning.raw}]]` }, ': ', ...offText(warning.off), '، و روی سایت «فعلاً ارائه نمی‌شود» نشان می‌دهد');
  const issue = row.blockIssues[0];
  if (issue) out.push(' · بلوک ', { ph: issue.excerpt ?? '' }, ' امروز روی سایت رسم نمی‌شود: ', ...issueMessage(issue));
  return out;
}

/** «؛ پیش‌نویس منتشرنشده از امروز 10:40، ویرایش امروز 11:05». */
function draftText(draft: SitePageDraftRow, now: Date): ContentSeg[] {
  const created = whenText(draft.createdAt, now);
  const updated = whenText(draft.updatedAt, now);
  return [`؛ پیش‌نویس منتشرنشده از ${created}${updated !== created ? `، ویرایش ${updated}` : ''}`];
}

/**
 * «چه عوض می‌شود» صفحه‌ای که روی سایت نیست (تازه، یا برداشته): یک خط از آنچه روی سایت می‌آید، مثل طرح «انتشار»: «صفحهٔ «…»، با 2 بخش متن، یک
 * بلوک قیمت، 3 سؤال؛ در نقشهٔ سایت و پاورقی («چاپ جزوه»).»
 */
export function newPageSummary(kind: SitePageKind, content: AnyPageContent): ContentSeg[] {
  const parts: ContentSeg[][] = [];
  if (kind === 'landing') {
    const blocks = parseMarkdown((content as LandingContent).body, { page: true }).blocks;
    const sections = blocks.filter((block) => block.type === 'heading').length;
    const prices = blocks.filter((block) => block.type === 'block' && /^قیمت\s*[:：]/.test(block.raw)).length;
    const tables = blocks.filter((block) => block.type === 'block').length - prices;
    if (sections > 0) parts.push([{ num: formatNumber(sections) }, ' بخش متن']);
    if (prices > 0) parts.push(prices === 1 ? ['یک بلوک قیمت'] : [{ num: formatNumber(prices) }, ' بلوک قیمت']);
    if (tables > 0) parts.push(tables === 1 ? ['یک جدول تعرفه'] : [{ num: formatNumber(tables) }, ' جدول تعرفه']);
  }
  if (content.faq.length > 0) parts.push([{ num: formatNumber(content.faq.length) }, ' سؤال']);
  const out: ContentSeg[] = [`صفحهٔ «${content.title}»`];
  parts.forEach((part, i) => out.push(i === 0 ? '، با ' : i === parts.length - 1 ? ' و ' : '، ', ...part));
  const where =
    kind === 'landing'
      ? (content as LandingContent).inFooter
        ? '؛ در نقشهٔ سایت و پاورقی («چاپ جزوه»).'
        : '؛ در نقشهٔ سایت، بی پیوند در پاورقی.'
      : '.';
  out.push(where);
  return out;
}

/** تیتر صفحهٔ انتشار: «انتشار پرینت PDF»، «برگرداندن تعرفه به نسخهٔ 1» یا «برگرداندن تعرفه به متن پیش‌فرض». */
export function pagePublishTitle(name: string, from: PagePublishFrom): ContentSeg[] {
  if (from.type === 'draft') return [`انتشار ${name}`];
  if (from.type === 'default') return [`برگرداندن ${name} به متن پیش‌فرض`];
  return [`برگرداندن ${name} به نسخهٔ `, { num: formatNumber(from.version) }];
}

/** نام یک نسخه در فهرست: «نسخهٔ 3 · از نسخهٔ 1»، «نسخهٔ 2 · برداشتن، «پیدا نشد»»، «نسخهٔ 4 · برگشت به متن پیش‌فرض». */
export function pageVersionName(row: SitePageVersionRow): ContentSeg[] {
  const name: ContentSeg[] = ['نسخهٔ ', { num: formatNumber(row.version) }];
  if (row.removal === 'gone') return [...name, ' · برداشتن، «پیدا نشد»'];
  if (row.removal === 'moved') return [...name, ' · برداشتن، به صفحهٔ دیگر'];
  if (row.content === null) return [...name, ' · برگشت به متن پیش‌فرض'];
  if (row.restoredFrom) return [...name, ' · از نسخهٔ ', { num: formatNumber(row.restoredFrom) }];
  return name;
}

/** «امروز 11:24، سارا»؛ زمان‌دار «روی سایت پنجشنبه 1 آبان، ساعت 09:00»؛ پس‌گرفته «پس گرفته شد». */
export function pageVersionMeta(row: SitePageVersionRow, now: Date): string {
  const made = `${whenText(row.createdAt, now)}، ${row.createdByName}`;
  if (row.withdrawnAt) return `${made}؛ زمان‌دار برای ${scheduleText(row.liveFrom)}، پس گرفته شد ${whenText(row.withdrawnAt, now)}`;
  if (row.liveFrom.getTime() > now.getTime()) return `${made}؛ روی سایت ${scheduleText(row.liveFrom)}`;
  if (row.liveFrom.getTime() - row.createdAt.getTime() > 60_000) return `${made}؛ روی سایت از ${whenText(row.liveFrom, now)}`;
  return made;
}

/** یک ردیف «میز سفارش این صفحه» (سؤال ۴۵۵): فقط ردیفی که امروز بیش از یک گزینهٔ روشن دارد. */
export interface DeskChoice {
  name: 'color' | 'sides' | 'size' | 'paper' | 'binding';
  label: string;
  options: { value: string; label: string }[];
}

/** ردیف‌های میز این صفحه، و نام ردیف‌هایی که امروز یک گزینه دارند («اندازه، کاغذ و صحافی امروز یک گزینه دارند»). */
export function deskChoices(list: PriceList): { rows: DeskChoice[]; fixed: string[] } {
  const rows: DeskChoice[] = [
    { name: 'color', label: 'رنگ', options: [{ value: '', label: 'پیش‌فرض (سیاه‌سفید)' }, { value: 'color', label: 'رنگی' }] },
    { name: 'sides', label: 'یکرو یا دورو', options: [{ value: '', label: 'پیش‌فرض (دورو)' }, { value: 'single', label: 'یکرو' }] },
  ];
  const fixed: string[] = [];
  const sizes = PAPER_SIZE_ORDER.filter((size) => list.printRates[size] !== undefined);
  if (sizes.length > 1) {
    rows.push({
      name: 'size',
      label: 'اندازه',
      options: [
        { value: '', label: `پیش‌فرض (${PAPER_SIZES[DEFAULT_PAPER_SIZE].label})` },
        ...sizes.filter((size) => size !== DEFAULT_PAPER_SIZE).map((size) => ({ value: size, label: PAPER_SIZES[size].label })),
      ],
    });
  } else fixed.push('اندازه');
  const named = (table: Readonly<Record<string, { nameFa: string; enabled: boolean }>>, fallback: string, name: 'paper' | 'binding', label: string) => {
    const enabled = Object.entries(table).filter(([, row]) => row.enabled);
    if (enabled.length <= 1) {
      fixed.push(label);
      return;
    }
    rows.push({
      name,
      label,
      options: [
        { value: '', label: `پیش‌فرض (${table[fallback]?.nameFa ?? fallback})` },
        ...enabled.filter(([id]) => id !== fallback).map(([id, row]) => ({ value: id, label: row.nameFa })),
      ],
    });
  };
  named(list.paperTypes, DEFAULT_PAPER_TYPE_ID, 'paper', 'کاغذ');
  named(list.bindingTypes, DEFAULT_BINDING_TYPE_ID, 'binding', 'صحافی');
  return { rows, fixed };
}

/** «اندازه، کاغذ و صحافی امروز یک گزینه دارند، پس انتخابی نیست.» */
export function fixedText(fixed: readonly string[]): string | null {
  if (fixed.length === 0) return null;
  const list = fixed.length === 1 ? fixed[0] : `${fixed.slice(0, -1).join('، ')} و ${fixed.at(-1)}`;
  return `${list} امروز یک گزینه ${fixed.length === 1 ? 'دارد' : 'دارند'}، پس انتخابی نیست.`;
}

/**
 * زیرعنوان ویرایشگر (طرح «صفحهٔ فرود»): نشانی، و حال صفحه: «روی سایت نسخهٔ 2، 26 مهر، سارا»، «زمان‌دار: روی سایت پنجشنبه 1 آبان، ساعت 09:00»،
 * «برداشته شد»، «هنوز منتشر نشده»؛ و پیش‌نویس با روزش.
 */
export function pageEditorSub(
  input: { slug: string; state: PageState; draft: SitePageDraftRow | null; isDefault: boolean; isNew: boolean },
  now: Date,
): ContentSeg[] {
  const out: ContentSeg[] = [{ ltr: input.slug ? `jozveyar.com/${input.slug}` : 'jozveyar.com/…' }];
  const { live, pending } = input.state;
  if (input.isNew) out.push(' · صفحهٔ تازه، هنوز ذخیره نشده');
  else if (live && live.content !== null) out.push(' · روی سایت نسخهٔ ', { num: formatNumber(live.version) }, `، ${dayText(live.liveFrom, now)}، ${live.createdByName}`);
  else if (live && live.removal) out.push(` · برداشته شد، ${dayText(live.liveFrom, now)}`);
  else if (input.isDefault && !pending) out.push(' · متن پیش‌فرض سایت');
  else if (!pending) out.push(' · هنوز منتشر نشده');
  if (pending) out.push(` · زمان‌دار: روی سایت ${scheduleText(pending.liveFrom)}`);
  if (input.draft) out.push(...draftText(input.draft, now));
  return out;
}
