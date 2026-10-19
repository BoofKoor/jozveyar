/**
 * متن‌های سایت در پنل (برش ۱۱٫۱): نوشته‌های صفحه‌ها، خالص و بی JSX، تا تست بی مرورگر بسنجدشان. حال هر متن در فهرست «متن‌های سایت»، و متن
 * هر خطای سنجش با شمارهٔ خط، آغاز همان خط و راه درست کردن (طرح «خطای متن»، سؤال ۲۸۴).
 */

import { KIND_NAMES, KIND_PATHS, type ContentIssue, type ContentKind } from '@jozveyar/content';
import type { ContentDraftRow, ContentVersionRow } from '@jozveyar/db';
import { formatNumber } from '@jozveyar/text';

import { dayText, whenText } from './format';
import type { PublishFrom } from './server/content';

/** تکهٔ متن: عدد در `.num`، نوشتهٔ لاتین در `bdi` چپ‌به‌راست، و نحو Markdown یا نام جای‌نگهدار با زمینهٔ `ad-ph`. */
export type ContentSeg = string | { num: string } | { ltr: string } | { ph: string };

/** «قوانین»، و نشانی صفحه برای زیرعنوان: `jozveyar.com/terms`. */
export const kindName = (kind: ContentKind) => KIND_NAMES[kind];
export const kindUrl = (kind: ContentKind) => `jozveyar.com${KIND_PATHS[kind] === '/' ? '' : KIND_PATHS[kind]}`;

/** آنچه هر متن در سایت پوشش می‌دهد، برای فهرست (طرح «محتوای سایت»). */
export function scopeText(kind: ContentKind, faqCount: number): ContentSeg[] {
  switch (kind) {
    case 'home':
      return ['قهرمان، سه نوید زیر کارت بارگذاری و «سه قدم»'];
    case 'faq':
      return [{ num: formatNumber(faqCount) }, ' سؤال، در صفحهٔ اصلی و گوگل'];
    case 'contact':
      return ['راه‌های تماس و نشانی، و دو جملهٔ پاورقی'];
    default:
      return [{ ltr: KIND_PATHS[kind] }];
  }
}

/**
 * حال یک متن: «متن پیش‌فرض سایت»، «منتشرشده 11 مهر، سارا»، یا با پیش‌نویس «روی سایت نسخهٔ 2، 8 مهر؛ پیش‌نویس منتشرنشده از امروز 11:05».
 * برگشت به پیش‌فرض هم «متن پیش‌فرض سایت» است، با روز برگشتش.
 */
export function stateText(latest: ContentVersionRow | null, draft: ContentDraftRow | null, now: Date): ContentSeg[] {
  const out: ContentSeg[] = [];
  if (!latest) out.push('متن پیش‌فرض سایت');
  else if (latest.content === null) out.push(`متن پیش‌فرض سایت، از ${dayText(latest.createdAt, now)}، ${latest.createdByName}`);
  else if (draft) out.push('روی سایت نسخهٔ ', { num: formatNumber(latest.version) }, `، ${dayText(latest.createdAt, now)}`);
  else out.push(`منتشرشده ${dayText(latest.createdAt, now)}، ${latest.createdByName}`);
  if (draft) out.push(`؛ پیش‌نویس منتشرنشده از ${whenText(draft.createdAt, now)}`);
  return out;
}

const SOCIAL = /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|instagram\.com)\//i;

/** پیام یک خطا، بی جای آن: «جای‌نگهداری به نام {روزهای_نگهداری} نیست. منظورت {روزهای_فایل} بود؟». */
export function issueMessage(issue: ContentIssue): ContentSeg[] {
  const ph = (text: string): ContentSeg => ({ ph: text });
  switch (issue.code) {
    case 'html':
      return [
        'HTML پذیرفته نمی‌شود (',
        { ltr: issue.detail ?? '' },
        ').',
        ...(issue.suggestion ? [' برای پررنگ، دو ستاره دو طرف متن بگذار: ', ph(issue.suggestion), '.'] : [' همان متن را بی تگ بنویس.']),
      ];
    case 'image':
      return ['تصویر پذیرفته نمی‌شود؛ متن سایت فقط نوشته است.'];
    case 'table':
      return ['جدول پذیرفته نمی‌شود؛ هر ردیفش را یک قلم فهرست کن (', ph('- '), ').'];
    case 'quote':
      return ['نقل‌قول (', ph('>'), ') پذیرفته نمی‌شود؛ جمله را ساده بنویس.'];
    case 'rule':
      return ['خط جداکننده (', ph('---'), ') پذیرفته نمی‌شود؛ برای بخش تازه تیتر ', ph('## '), ' بگذار.'];
    case 'numbered_list':
      return ['فهرست شماره‌دار پذیرفته نمی‌شود؛ هر قلم را با ', ph('- '), ' شروع کن.'];
    case 'heading_level':
      return ['تیتر فقط ', ph('## '), ' است؛ تیتر خود صفحه بالای متن جداست.'];
    case 'heading_empty':
      return ['تیتر بی متن است؛ پس از ', ph('## '), ' متن تیتر را بنویس.'];
    case 'link_external':
      return [
        'پیوند فقط به همین سایت، ',
        { ltr: 'tel:' },
        ' یا ',
        { ltr: 'mailto:' },
        ' می‌رود؛ ',
        { ltr: issue.detail ?? '' },
        ' سایت دیگری است.',
        ...(SOCIAL.test(issue.detail ?? '') ? [' تلگرام و اینستاگرام را در «تماس و پاورقی» بگذار؛ سایت پیوندشان را خودش می‌سازد.'] : []),
      ];
    case 'link_broken':
      return ['پیوند نیمه‌کاره است؛ شکلش ', ph('[متن](/نشانی)'), ' است.'];
    case 'link_empty':
      return ['پیوند بی متن است؛ میان دو کروشه متنی بنویس: ', ph('[تماس](/contact)'), '.'];
    case 'link_not_here':
      return ['اینجا پیوند نمی‌آید؛ فقط متن و جای‌نگهدار.'];
    case 'bold_unclosed':
      return ['پررنگ بسته نشده؛ دو ستارهٔ دوم را هم بگذار: ', ph('**متن**'), '.'];
    case 'bold_not_here':
      return ['اینجا پررنگ نمی‌آید؛ ستاره‌ها را بردار.'];
    case 'emphasis_twice':
      return ['تیتر فقط یک تأکید دارد؛ یکی از دو ', ph('**…**'), ' را بردار.'];
    case 'placeholder_unknown':
      return [
        'جای‌نگهداری به نام ',
        ph(`{${issue.detail ?? ''}}`),
        ' نیست.',
        ...(issue.suggestion ? [' منظورت ', ph(`{${issue.suggestion}}`), ' بود؟'] : [' فهرست جای‌نگهدارها زیر متن است.']),
      ];
    case 'placeholder_not_here':
      return ['اینجا جای‌نگهدار نمی‌آید؛ عدد را خودت بنویس یا بردار.'];
    case 'required':
      return ['خالی است.'];
    case 'too_long':
      return [{ num: formatNumber(issue.length ?? 0) }, ' نویسه است؛ دست‌بالا ', { num: formatNumber(issue.max ?? 0) }, '.'];
    case 'mobile':
      return ['شمارهٔ موبایل ', { num: '11' }, ' رقم است و با ', { num: '09' }, ' شروع می‌شود.'];
    case 'phone':
      return ['تلفن ثابت ', { num: '11' }, ' رقم است، با پیش‌شمارهٔ شهر (مثل ', { num: '021' }, ').'];
    case 'email':
      return ['ایمیل درست نیست.'];
    case 'telegram':
      return ['شناسهٔ تلگرام ', { num: '5' }, ' تا ', { num: '32' }, ' حرف لاتین، رقم یا ', ph('_'), ' است و با حرف شروع می‌شود.'];
    case 'instagram':
      return ['شناسهٔ اینستاگرام تا ', { num: '30' }, ' حرف لاتین، رقم، ', ph('_'), ' یا نقطه است.'];
    case 'postal':
      return ['کد پستی ده رقم است.'];
    case 'postal_without_address':
      return ['کد پستی کنار نشانی می‌آید؛ اول نشانی را بنویس.'];
    case 'faq_empty':
      return ['دست‌کم یک سؤال لازم است.'];
    case 'bar_link_in_text':
      return ['پیوند نوار در فیلد «پیوند» است و کل نوار پیوند می‌شود؛ اینجا فقط متن، پررنگ و جای‌نگهدار.'];
    case 'bar_bold_twice':
      return ['نوار فقط یک پررنگ دارد؛ یکی از دو ', ph('**…**'), ' را بردار.'];
    case 'bar_too_long':
      return [
        'با عددهای امروز ',
        { num: formatNumber(issue.length ?? 0) },
        ' نویسه است؛ دست‌بالا ',
        { num: formatNumber(issue.max ?? 0) },
        '، تا در گوشی دو خط بماند.',
      ];
    case 'bar_href':
      return ['پیوند نوار فقط به صفحه‌ای از همین سایت می‌رود، مثل ', { ltr: '/contact' }, '؛ ', { ltr: issue.detail ?? '' }, ' نیست.'];
    case 'bar_link_text':
      return ['با پیوند، متنی لازم است که ته نوار بیاید، مثل «دیدن تعرفه».'];
    case 'banner_href':
      return ['پیوند بنر فقط به صفحه‌ای از همین سایت می‌رود، مثل ', { ltr: '/#tariff' }, '؛ ', { ltr: issue.detail ?? '' }, ' نیست.'];
  }
}

/** یک خطا در فهرست بالای صفحه: «خط 10 («کد رهگیری پست…»): …» برای متن صفحه، و «تیتر صفحه: …» برای بقیه. */
export function issueLine(issue: ContentIssue): ContentSeg[] {
  const where: ContentSeg[] =
    issue.line !== undefined ? ['خط ', { num: String(issue.line) }, ` («${issue.excerpt ?? ''}»): `] : [`${issue.label}: `];
  return [...where, ...issueMessage(issue)];
}

/** سرعنوان فهرست خطاها. */
export function issuesTitle(count: number): string {
  return count === 1
    ? 'پیش‌نویس ذخیره شد، ولی تا این یکی درست نشود منتشر نمی‌شود:'
    : `پیش‌نویس ذخیره شد، ولی تا این ${formatNumber(count)} مورد درست نشوند منتشر نمی‌شود:`;
}

/** خطای زیر فیلد متن صفحه: «3 خط مشکل دارد: 10، 15 و 18. شرح هر کدام بالای صفحه است.» */
export function linesSummary(lines: readonly number[]): ContentSeg[] {
  const unique = [...new Set(lines)].sort((a, b) => a - b);
  if (unique.length === 1) return ['خط ', { num: String(unique[0]) }, ' مشکل دارد؛ شرحش بالای صفحه است.'];
  const list: ContentSeg[] = unique.flatMap((line, i): ContentSeg[] => [
    ...(i === 0 ? [] : [i === unique.length - 1 ? ' و ' : '، ']),
    { num: String(line) },
  ]);
  return [{ num: formatNumber(unique.length) }, ' خط مشکل دارد: ', ...list, '. شرح هر کدام بالای صفحه است.'];
}

/** خطای زیر یک فیلد (طرح «خطای متن»): پیام هر خطای همان فیلد، و برای متن صفحه خلاصهٔ خط‌ها، چون شرح هر خط بالای صفحه است. */
export function fieldError(field: string, issues: readonly ContentIssue[]): ContentSeg[] | null {
  const mine = issues.filter((issue) => issue.field === field);
  if (mine.length === 0) return null;
  const lines = mine.flatMap((issue) => (issue.line === undefined ? [] : [issue.line]));
  const parts = mine.filter((issue) => issue.line === undefined).map(issueMessage);
  if (lines.length > 0) parts.push(linesSummary(lines));
  return parts.flatMap((part, i) => (i === 0 ? part : [' ', ...part]));
}

/** شمار نویسه زیر فیلدهای گوگل: «15 از 60 نویسه». */
export function countText(value: string, max: number): ContentSeg[] {
  return [{ num: formatNumber([...value].length) }, ' از ', { num: formatNumber(max) }, ' نویسه'];
}

/** آنچه از متن روی سایت لازم است: آخرین نسخه، و اینکه متن پیش‌فرض روی سایت است. */
interface LiveState {
  latest: ContentVersionRow | null;
  isDefault: boolean;
}

/** نسخهٔ روی سایت در یک جمله: «نسخهٔ 2 (8 مهر، سارا)»، یا «متن پیش‌فرض سایت». */
export function liveRef(live: LiveState, now: Date): ContentSeg[] {
  if (live.isDefault || !live.latest) return ['متن پیش‌فرض سایت'];
  return ['نسخهٔ ', { num: formatNumber(live.latest.version) }, ` (${dayText(live.latest.createdAt, now)}، ${live.latest.createdByName})`];
}

/**
 * زیرعنوان ویرایشگر (طرح «ویرایش قوانین»، «صفحهٔ اصلی»، «سؤال‌ها» و «تماس و پاورقی»): جای متن روی سایت، و اگر منتشر شده، کِی و که؛ با
 * پیش‌نویس «روی سایت نسخهٔ 2، 8 مهر، سارا».
 */
export function editorSub(kind: ContentKind, live: LiveState, draft: ContentDraftRow | null, faqCount: number, now: Date): ContentSeg[] {
  const where: ContentSeg[] =
    kind === 'home'
      ? [{ ltr: 'jozveyar.com' }, ' · تعرفه، کارت بارگذاری و سؤال‌ها جای دیگرند.']
      : kind === 'faq'
        ? ['روی سایت: ', { num: formatNumber(faqCount) }, ' سؤال']
        : kind === 'contact'
          ? [{ ltr: kindUrl(kind) }, '، نشانی «دربارهٔ ما» و پاورقی همهٔ صفحه‌ها']
          : [{ ltr: kindUrl(kind) }];
  const { latest } = live;
  if (!latest) return where;
  const day = dayText(latest.createdAt, now);
  const state: ContentSeg[] =
    latest.content === null
      ? [`برگشت به متن پیش‌فرض ${day}، ${latest.createdByName}`]
      : draft
        ? ['روی سایت نسخهٔ ', { num: formatNumber(latest.version) }, `، ${day}، ${latest.createdByName}`]
        : [`منتشرشده ${day}، ${latest.createdByName}`];
  return [...where, kind === 'faq' ? '، ' : ' · ', ...state];
}

/** سرِ کارت پیش‌نمایش: «پیش‌نویس، امروز 11:18»، «روی سایت، نسخهٔ 3» یا «متن پیش‌فرض». */
export function previewMeta(live: LiveState, draft: ContentDraftRow | null, now: Date): ContentSeg[] {
  if (draft) return [`پیش‌نویس، ${whenText(draft.updatedAt, now)}`];
  if (live.isDefault || !live.latest) return ['متن پیش‌فرض'];
  return ['روی سایت، نسخهٔ ', { num: formatNumber(live.latest.version) }];
}

/** به جای پیش‌نمایش، وقتی پیش‌نویس خطا دارد: «پیش‌نمایش پس از درست شدن این 3 مورد ساخته می‌شود. روی سایت همان نسخهٔ 2 است.» */
export function previewBlocked(count: number, live: LiveState): ContentSeg[] {
  const which: ContentSeg[] = count === 1 ? ['این مورد'] : ['این ', { num: formatNumber(count) }, ' مورد'];
  const site: ContentSeg[] =
    live.isDefault || !live.latest ? ['متن پیش‌فرض'] : ['نسخهٔ ', { num: formatNumber(live.latest.version) }];
  return ['پیش‌نمایش پس از درست شدن ', ...which, ' ساخته می‌شود. روی سایت همان ', ...site, ' است.'];
}

/** تیتر صفحهٔ انتشار: «انتشار قوانین»، «برگرداندن قوانین به نسخهٔ 1» یا «برگرداندن قوانین به متن پیش‌فرض». */
export function publishTitle(kind: ContentKind, from: PublishFrom): ContentSeg[] {
  const name = KIND_NAMES[kind];
  if (from.type === 'draft') return [`انتشار ${name}`];
  if (from.type === 'default') return [`برگرداندن ${name} به متن پیش‌فرض`];
  return [`برگرداندن ${name} به نسخهٔ `, { num: formatNumber(from.version) }];
}

/** دکمهٔ صفحهٔ انتشار. */
export const publishLabel = (from: PublishFrom) => (from.type === 'draft' ? 'منتشر کن' : 'برگردان');

/**
 * زیرعنوان صفحهٔ انتشار: چه به جای چه. «پیش‌نویس امروز 11:18 به جای نسخهٔ 2 (8 مهر، سارا).»، «متن نسخهٔ 1 (4 مهر، سارا) به جای …» یا
 * «متن پیش‌فرض سایت به جای …».
 */
export function publishLead(
  from: PublishFrom,
  live: LiveState,
  draft: ContentDraftRow | null,
  source: ContentVersionRow | null,
  now: Date,
): ContentSeg[] {
  const what: ContentSeg[] =
    from.type === 'draft'
      ? [`پیش‌نویس ${draft ? whenText(draft.updatedAt, now) : ''}`.trim()]
      : from.type === 'default' || !source
        ? ['متن پیش‌فرض سایت']
        : ['متن نسخهٔ ', { num: formatNumber(source.version) }, ` (${dayText(source.createdAt, now)}، ${source.createdByName})`];
  return [...what, ' به جای ', ...liveRef(live, now), '.'];
}

/** جای هر متن روی سایت، برای «تا یک دقیقه دیگر». */
function whereText(kind: ContentKind): string {
  switch (kind) {
    case 'home':
      return 'صفحهٔ اصلی';
    case 'faq':
      return 'سؤال‌های صفحهٔ اصلی';
    case 'contact':
      return 'صفحهٔ «تماس»، نشانی «دربارهٔ ما» و پاورقی همهٔ صفحه‌ها';
    default:
      return `صفحهٔ «${KIND_NAMES[kind]}»`;
  }
}

/**
 * اثر انتشار روی سایت (طرح «انتشار»): «صفحهٔ «قوانین» تا یک دقیقه بعد متن تازه را دارد و «به‌روز شده در» آن 1405/07/13 می‌شود.»؛ قوانین
 * پیوند مرور سفارش را هم می‌گوید.
 */
export function publishEffect(kind: ContentKind, today: string): ContentSeg[] {
  const out: ContentSeg[] = [`${whereText(kind)} تا یک دقیقه بعد متن تازه را دارد`];
  if (kind === 'terms' || kind === 'privacy') out.push(' و «به‌روز شده در» آن ', { num: today }, ' می‌شود');
  out.push('.');
  if (kind === 'terms') out.push(' مرور سفارش و صفحهٔ سفارش به همین صفحه پیوند می‌دهند.');
  if (kind === 'faq') out.push(' پاسخ‌ها بی پیوند و پررنگ در دادهٔ گوگل (', { ltr: 'FAQPage' }, ') هم هستند.');
  return out;
}

/** «نسخهٔ 2 در «نسخه‌ها» می‌ماند و از همان‌جا برمی‌گردد.» */
export function keepNote(live: LiveState): ContentSeg[] {
  if (live.isDefault || !live.latest) return ['متن پیش‌فرض همیشه در «نسخه‌ها» هست و از همان‌جا برمی‌گردد.'];
  return ['نسخهٔ ', { num: formatNumber(live.latest.version) }, ' در «نسخه‌ها» می‌ماند و از همان‌جا برمی‌گردد.'];
}

/** فیلدهای بی تغییر زیر «چه عوض می‌شود»: «بقیهٔ متن صفحه، تیتر صفحه و عنوان گوگل همان است.»؛ بیش از پنج، «بقیهٔ متن همان است.» */
export function unchangedText(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length > 5) return 'بقیهٔ متن همان است.';
  const sorted = [...names.filter((name) => name.startsWith('بقیهٔ')), ...names.filter((name) => !name.startsWith('بقیهٔ'))];
  const list = sorted.length === 1 ? sorted[0] : `${sorted.slice(0, -1).join('، ')} و ${sorted.at(-1)}`;
  return `${list} همان است.`;
}

/** نام یک نسخه در فهرست: «نسخهٔ 4 · برگشت به متن پیش‌فرض»، «نسخهٔ 3 · از نسخهٔ 1»، یا «نسخهٔ 2». */
export function versionName(row: ContentVersionRow): ContentSeg[] {
  const name: ContentSeg[] = ['نسخهٔ ', { num: formatNumber(row.version) }];
  if (row.content === null) return [...name, ' · برگشت به متن پیش‌فرض'];
  if (row.restoredFrom) return [...name, ' · از نسخهٔ ', { num: formatNumber(row.restoredFrom) }];
  return name;
}

/** «امروز 11:24، سارا، با کد تازه» برای نسخهٔ روی سایت، و بقیه بی «با کد تازه» (طرح «نسخه‌ها»). */
export function versionMeta(row: ContentVersionRow, isLatest: boolean, now: Date): string {
  return `${whenText(row.createdAt, now)}، ${row.createdByName}${isLatest ? '، با کد تازه' : ''}`;
}

/** پیام بالای «نسخه‌ها» پس از انتشار: «نسخهٔ 3 منتشر شد. صفحهٔ «قوانین» تا یک دقیقه دیگر همین را دارد.» */
export function doneText(kind: ContentKind, row: ContentVersionRow): ContentSeg[] {
  const head: ContentSeg[] =
    row.content === null
      ? ['متن پیش‌فرض برگشت (نسخهٔ ', { num: formatNumber(row.version) }, ').']
      : row.restoredFrom
        ? ['نسخهٔ ', { num: formatNumber(row.restoredFrom) }, ' برگشت (نسخهٔ ', { num: formatNumber(row.version) }, ').']
        : ['نسخهٔ ', { num: formatNumber(row.version) }, ' منتشر شد.'];
  return [...head, ` ${whereText(kind)} تا یک دقیقه دیگر همین را دارد.`];
}
