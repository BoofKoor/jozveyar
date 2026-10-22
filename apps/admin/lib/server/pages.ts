/**
 * صفحه‌های فرود و «تعرفه» در پنل (برش ۱۵٫۲، ADR-071؛ طرح «صفحه‌ها و مقاله‌ها (برش ۱۵)»، سؤال‌های ۴۶۱ تا ۴۶۶): فهرست با حال هر صفحه و
 * نشانی‌های قبلی، ویرایشگر با پیش‌نمایش و عدد امروز، انتشار همین حالا یا زمان‌دار با کد تازه، پس گرفتن زمان‌دار بی کد، برداشتن با ۳۰۱ یا ۴۰۴ با
 * کد تازه، و نسخه‌ها با «برگرداندن…».
 *
 * - **مجوز در سرور** (ADR-038): همه با `content.edit`، فقط مالک، پیش از هر خواندن.
 * - **سرور منبع حقیقت است:** هر فیلد یکدست (`tidyPage`) و سنجیده (`checkPage`، با تعرفهٔ فعال و صفحه‌های همین حالای سایت). پیش‌نویس با خطا هم
 *   ذخیره می‌شود و انتشار فقط بی خطا؛ برگرداندن نسخه‌ای قبلی هم، چون پیوند یا واژه‌ای که آن روز درست بود امروز شاید نباشد.
 * - **کد تازه** (سؤال‌های ۴۶۵ و ۴۶۶): انتشار، زمان‌دار و برداشتن، پس از هر سنجشی که بی کد جواب دارد. ذخیره، دور انداختن پیش‌نویس و پس گرفتن
 *   زمان‌دار بی کد: هیچ‌کدام چیزی را روی سایت نمی‌برد.
 * - **همان که دیده شد:** صفحهٔ انتشار و برداشتن آخرین شمارهٔ نسخه و اثر انگشت متن را می‌فرستند؛ پیش از کد، و دوباره زیر قفل ذخیره‌گاه.
 * - **«پیدا نشد» بسته است** تا متنی روی سایت یا زمان‌دار به صفحه پیوند دارد: صفحه‌های دیگر، متن‌های ۱۱٫۱، نوار اعلان و بنر (سؤال ۴۶۶).
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. قفل، تراکنش و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { createHash } from 'node:crypto';

import type { PriceList } from '@jozveyar/contracts';
import {
  CONTENT_KINDS,
  KIND_NAMES,
  PAGE_FAQ_MAX,
  PAGE_PLACEHOLDERS,
  PAGE_PLACEHOLDER_SOURCES,
  PLACEHOLDERS,
  PLACEHOLDER_SOURCES,
  TARIFF_SLUG,
  barHref,
  barShown,
  barVisibleAt,
  canonicalPage,
  checkPage,
  contentLinkPaths,
  contentOf,
  defaultContent,
  defaultTariffPage,
  emptyLanding,
  hasContact,
  linkPath,
  pageContentOf,
  pageDiff,
  pageFromFields,
  pageLinkPaths,
  pageValues,
  placeholderValues,
  tidyPage,
  type AnyPageContent,
  type AnyPlaceholderName,
  type ContentDiff,
  type ContentIssue,
  type DeskPreset,
  type LandingContent,
  type PageCheckContext,
  type PageValues,
  type PageWarning,
  type SitePageKind,
} from '@jozveyar/content';
import {
  BANNER_SETTING,
  BAR_SETTING,
  CATALOG_PAUSED_SETTING,
  FILE_MAX_PAGES_SETTING,
  pageStateAt,
  readSetting,
  type OrderStore,
  type PageState,
  type PageWriteOutcome,
  type RemovalTarget,
  type SitePageDetail,
  type SitePageDraftRow,
  type SitePageStore,
  type SettingsStore,
  type SiteContentStore,
  type SitePageVersionRow,
} from '@jozveyar/db';
import { pausedOf, type PausedOptions } from '@jozveyar/pricing';
import { formatJalaliNumeric, formatTehranTime, parseJalaliNumeric, tehranDayStart, toLatinDigits } from '@jozveyar/text';

import { barOf } from '../bar';
import { bannerOf } from '../images';
import { can, ipHashOf, type AdminSession } from './auth';
import { loadContentFacts } from './content';
import { fail, ok, type Failure, type Result } from './result';

/** نشانی‌های ثابت سایت که همیشه روی سایت‌اند؛ `/contact` فقط با راه تماس (۷٫۴ و ۱۱٫۱). صفحه‌های خصوصی (سفارش، پیش‌نمایش) پیوند نمی‌گیرند. */
export const SITE_PATHS: readonly string[] = ['/', `/${TARIFF_SLUG}`, '/about', '/terms', '/privacy', '/orders'];

/** زمان‌دار تا این چند روز بعد (سؤال ۴۶۵)، همان سقف بازهٔ نوار اعلان. */
export const SCHEDULE_MAX_DAYS = 90;

/** سقف JSON پیش‌نویس در پایگاه داده (`site_page_drafts_content`)؛ حاشیهٔ یک کیلوبایتی برای فاصله‌های JSON پستگرس. */
const DRAFT_MAX_BYTES = 131_072 - 1024;

/* ───────────────────────── واقعیت‌های امروز ───────────────────────── */

/** آنچه سنجش و پیش‌نمایش از سایت امروز لازم دارند: همان که سایت با آن رسم می‌کند (`sitePageContext` وب). */
export interface PageFacts {
  priceList: PriceList;
  paused: PausedOptions;
  maxPages: number;
  values: PageValues;
  /** روز فعال شدن تعرفهٔ فعال: «آخرین تغییر قیمت» و `{تغییر_قیمت}`. */
  priceChangedAt: Date | null;
}

export async function loadPageFacts(
  source: Pick<OrderStore, 'activePriceList' | 'setting'>,
  activatedAt: () => Promise<Date | null>,
  at: Date,
): Promise<PageFacts> {
  // یک خواندن تعرفه برای هر دو، تا جای‌نگهدارها و بلوک‌ها از یک نسخه باشند.
  const list = source.activePriceList();
  const read = (key: string) => source.setting(key);
  const [priceList, content, paused, maxPages, priceChangedAt] = await Promise.all([
    list,
    loadContentFacts({ activePriceList: () => list, setting: read }),
    readSetting(read, CATALOG_PAUSED_SETTING),
    readSetting(read, FILE_MAX_PAGES_SETTING),
    activatedAt(),
  ]);
  return { priceList, paused: pausedOf(priceList, paused), maxPages, values: pageValues(placeholderValues(content), { at, priceChangedAt }), priceChangedAt };
}

/** پیوند یک متن دیگر سایت (متن‌های ۱۱٫۱، نوار اعلان، بنر) به یک مسیر. */
export interface SiteLink {
  /** «سؤال‌ها»، «نوار اعلان». */
  where: string;
  path: string;
  /** هنوز روی سایت نیست ولی خواهد بود (نوار اعلان در بازهٔ آینده). */
  scheduled: boolean;
}

export interface SiteTexts {
  links: SiteLink[];
  /** راه تماسی هست؟ بی آن `/contact` روی سایت نیست. */
  contact: boolean;
}

/**
 * پیوندهای متن‌های دیگر سایت به صفحه‌ها (سؤال ۴۶۶): متن‌های ۱۱٫۱ روی سایت (متن پیش‌فرضشان به صفحهٔ فرودی پیوند نمی‌دهد)، نوار اعلانی که حالا یا
 * بعداً روی سایت است، و بنر روشن؛ و راه تماس، که بی آن `/contact` روی سایت نیست.
 */
export async function loadSiteTexts(
  deps: { content: Pick<SiteContentStore, 'live'>; settings: Pick<SettingsStore, 'read'> },
  at: Date,
): Promise<SiteTexts> {
  const [live, barRaw, bannerRaw] = await Promise.all([deps.content.live(), deps.settings.read(BAR_SETTING), deps.settings.read(BANNER_SETTING)]);
  const links: SiteLink[] = [];
  for (const kind of CONTENT_KINDS) {
    const row = live[kind];
    if (!row || row.content === null) continue;
    for (const path of contentLinkPaths(kind, contentOf(kind, row.content))) links.push({ where: KIND_NAMES[kind], path, scheduled: false });
  }
  const bar = barOf(barRaw);
  const barPath = barShown(bar, at) ? linkPath(barHref(bar.href) ?? '') : null;
  if (barPath) links.push({ where: 'نوار اعلان', path: barPath, scheduled: !barVisibleAt(bar, at) });
  const banner = bannerOf(bannerRaw);
  const bannerPath = banner.mode !== 'off' && banner.imageId !== null ? linkPath(banner.href) : null;
  if (bannerPath) links.push({ where: 'بنر صفحهٔ اصلی', path: bannerPath, scheduled: false });
  const contact = live.contact && live.contact.content !== null ? contentOf('contact', live.contact.content) : defaultContent('contact');
  return { links, contact: hasContact(contact) };
}

/* ───────────────────────── نشانی پنل و ورودی‌ها ───────────────────────── */

export type PageRef = { type: 'new' } | { type: 'tariff' } | { type: 'id'; id: number };

/** «new» صفحهٔ تازه، «tarefe» خود «تعرفه»، و شمارهٔ صفحه. */
export function pageRefOf(param: string): PageRef | null {
  if (param === 'new') return { type: 'new' };
  if (param === TARIFF_SLUG) return { type: 'tariff' };
  return /^[1-9]\d{0,8}$/.test(param) ? { type: 'id', id: Number(param) } : null;
}

/** نشانی پنل یک صفحه: «تعرفه» با نشانی خودش، بقیه با شماره. */
export const pageParam = (page: { id: number; kind: SitePageKind }) => (page.kind === 'tariff' ? TARIFF_SLUG : String(page.id));

/** از کجا منتشر می‌شود: پیش‌نویس، متن پیش‌فرض «تعرفه»، یا برگرداندن نسخهٔ N. */
export type PagePublishFrom = { type: 'draft' } | { type: 'default' } | { type: 'version'; version: number };

export function pagePublishFromOf(value: unknown): PagePublishFrom | null {
  if (value === undefined || value === null || value === '' || value === 'draft') return { type: 'draft' };
  if (value === 'default') return { type: 'default' };
  return typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? { type: 'version', version: Number(value) } : null;
}

/** کار فهرست سؤال‌ها با «ذخیره و پیش‌نمایش» (بی JS، مثل ۱۱٫۱): افزودن، حذف، بالاتر و پایین‌تر. */
export type PageFaqOp = { op: 'add' } | { op: 'delete' | 'up' | 'down'; index: number };

export function pageFaqOpOf(value: unknown): PageFaqOp | null {
  if (value === 'add') return { op: 'add' };
  const match = typeof value === 'string' ? /^(delete|up|down):(\d{1,2})$/.exec(value) : null;
  return match ? { op: match[1] as 'delete' | 'up' | 'down', index: Number(match[2]) } : null;
}

/** سؤال‌های صفحه پس از کار؛ null یعنی نشدنی (سقف، یا جایی که نیست). */
export function applyPageFaqOp<C extends AnyPageContent>(content: C, op: PageFaqOp): C | null {
  const items = [...content.faq];
  if (op.op === 'add') return items.length >= PAGE_FAQ_MAX ? null : { ...content, faq: [...items, { q: '', a: '' }] };
  if (op.index < 0 || op.index >= items.length) return null;
  if (op.op === 'delete') items.splice(op.index, 1);
  else {
    const to = op.op === 'up' ? op.index - 1 : op.index + 1;
    if (to < 0 || to >= items.length) return null;
    [items[op.index], items[to]] = [items[to]!, items[op.index]!];
  }
  return { ...content, faq: items };
}

/** اثر انگشت یک متن (JSON یکتا)، برای «همان که دیده شد». */
export const pageSeen = (kind: SitePageKind, content: AnyPageContent) => createHash('sha256').update(canonicalPage(kind, content)).digest('hex');

/** کی روی سایت برود: «همین حالا»، یا روز شمسی و ساعت به وقت تهران (سؤال ۴۶۵). */
export type WhenInput = { when: unknown; day: unknown; hour: unknown };

/**
 * لحظهٔ «در روز و ساعت»: آغاز روز تهران به‌علاوهٔ ساعت؛ اگر ساعت تهران آن روز جابه‌جا شود (ساعت تابستانی، که امروز ندارد) همان ساعت دیواری
 * نگه داشته می‌شود.
 */
export function tehranInstant(day: Date, hour: number, minute: number): Date {
  const wanted = hour * 60 + minute;
  const guess = new Date(day.getTime() + wanted * 60_000);
  const [h, m] = formatTehranTime(guess).split(':').map(Number);
  return new Date(guess.getTime() + (wanted - (h! * 60 + m!)) * 60_000);
}

export function liveFromOf(input: WhenInput, now: Date): { ok: true; at: Date } | { ok: false; error: Failure['error']; field: 'when' | 'day' | 'hour' } {
  if (input.when === 'now') return { ok: true, at: now };
  if (input.when !== 'at') return { ok: false, error: 'page_when_invalid', field: 'when' };
  const day = typeof input.day === 'string' ? parseJalaliNumeric(input.day) : null;
  if (!day) return { ok: false, error: 'page_day_invalid', field: 'day' };
  const hour = typeof input.hour === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(toLatinDigits(input.hour).trim()) : null;
  if (!hour || Number(hour[1]) > 23 || Number(hour[2]) > 59) return { ok: false, error: 'page_hour_invalid', field: 'hour' };
  const at = tehranInstant(day, Number(hour[1]), Number(hour[2]));
  if (at.getTime() <= now.getTime()) return { ok: false, error: 'page_time_past', field: 'day' };
  if (at.getTime() >= tehranDayStart(now, SCHEDULE_MAX_DAYS + 1).getTime()) return { ok: false, error: 'page_time_far', field: 'day' };
  return { ok: true, at };
}

/** کد برنامهٔ تأیید خالی: بی `stepUp`، چون هر کد نادرست یک اشتباه از سقف قفل است و خالی اشتباه نیست، فراموش شده. */
const blank = (code: unknown) => typeof code !== 'string' || code.trim() === '';

/* ───────────────────────── نماها ───────────────────────── */

/** متن روی سایت: نسخهٔ روی سایت با متن؛ «تعرفه» بی آن متن پیش‌فرض. null یعنی صفحهٔ فرودی که همین حالا روی سایت نیست. */
function liveContentOf(kind: SitePageKind, state: PageState): AnyPageContent | null {
  if (state.live && state.live.content !== null) return pageContentOf(kind, state.live.content);
  return kind === 'tariff' ? defaultTariffPage() : null;
}

/** آنچه پیش‌نویس با آن سنجیده می‌شود («همان است»): زمان‌دار در راه، وگرنه متن روی سایت. */
function baseContentOf(kind: SitePageKind, state: PageState): AnyPageContent | null {
  if (state.pending) return state.pending.content !== null ? pageContentOf(kind, state.pending.content) : kind === 'tariff' ? defaultTariffPage() : null;
  return liveContentOf(kind, state);
}

/** آخرین متنی که صفحه داشت (روی سایت، زمان‌دار، یا پیش از برداشتن)؛ فرم صفحهٔ برداشته همان را دارد تا دوباره منتشرش کنی. */
function lastContentOf(kind: SitePageKind, versions: readonly SitePageVersionRow[]): AnyPageContent | null {
  const row = versions.find((version) => version.content !== null && version.withdrawnAt === null);
  return row ? pageContentOf(kind, row.content) : null;
}

const NO_STATE: PageState = { live: null, pending: null, latest: 0 };

/** یک ردیف فهرست «صفحه‌های فرود» (سؤال ۴۶۱). */
export interface PageRow {
  /** «tarefe» یا شمارهٔ صفحه، برای نشانی پنل. */
  param: string;
  kind: SitePageKind;
  name: string;
  /** نشانی امروز یا آینده‌اش، بی «/». */
  slug: string;
  state: PageState;
  /** «تعرفه» با متن پیش‌فرض روی سایت است. */
  isDefault: boolean;
  draft: SitePageDraftRow | null;
  /** صفحه‌ای که برداشته شد: «پیدا نشد» یا ۳۰۱ به مقصدش («/» صفحهٔ اصلی). */
  removed: { version: SitePageVersionRow; to: string | null } | null;
  /** بلوک‌های متن روی سایت که امروز قیمت ندارند یا امروز رسم نمی‌شوند (واژه‌ای که تعرفه دیگر ندارد). */
  warnings: PageWarning[];
  blockIssues: ContentIssue[];
  inFooter: boolean;
}

export interface MovedRow {
  from: string;
  to: string;
  /** نام صفحه‌ای که این نشانی مال اوست. */
  name: string;
  /** نشانی پس از انتشار عوض شد، یا صفحه «به صفحهٔ دیگری» برداشته شد. */
  why: 'slug' | 'removed';
}

export interface PagesOverview {
  now: Date;
  tariff: PageRow;
  landings: PageRow[];
  moved: MovedRow[];
  counts: { live: number; pending: number; drafts: number };
}

export interface PlaceholderRow {
  name: AnyPlaceholderName;
  value: string;
  source: string;
}

export interface PageEditorView {
  now: Date;
  param: string;
  kind: SitePageKind;
  detail: SitePageDetail | null;
  state: PageState;
  /** متن روی سایت (یا پیش‌فرض «تعرفه»)؛ null یعنی روی سایت نیست. */
  live: AnyPageContent | null;
  isDefault: boolean;
  draft: SitePageDraftRow | null;
  /** متن فرم: پیش‌نویس، زمان‌دار، روی سایت، آخرین متن صفحهٔ برداشته، متن پیش‌فرض «تعرفه» یا صفحهٔ خالی. */
  content: AnyPageContent;
  /** خطاها و هشدارهای پیش‌نویس؛ بی پیش‌نویس هیچ. */
  issues: ContentIssue[];
  warnings: PageWarning[];
  facts: PageFacts;
  placeholders: PlaceholderRow[];
  /** صفحه همین حالا برداشته است (فرم آخرین متنش را دارد). */
  removed: SitePageVersionRow | null;
}

export interface PagePublishView {
  now: Date;
  param: string;
  kind: SitePageKind;
  detail: SitePageDetail;
  from: PagePublishFrom;
  content: AnyPageContent;
  /** متن روی سایت؛ null یعنی صفحهٔ تازه یا برداشته، پس «چه عوض می‌شود» خلاصهٔ صفحه است. */
  live: AnyPageContent | null;
  isDefault: boolean;
  /** نشانی روی سایت پیش از انتشار؛ null یعنی نشانی‌ای روی سایت نیست. */
  liveSlug: string | null;
  diff: ContentDiff | null;
  warnings: PageWarning[];
  /** نسخه‌ای که برمی‌گردد. */
  source: SitePageVersionRow | null;
  draft: SitePageDraftRow | null;
  /** پیش‌نویس از روی نسخه‌ای ساخته شد که دیگر آخرین نیست. */
  staleBase: boolean;
  seenVersion: number;
  seen: string;
  facts: PageFacts;
  /** پیش‌فرض فرم زمان‌دار: فردا، ساعت 09:00. */
  dayDefault: string;
}

/** پیوندی که «پیدا نشد» را می‌بندد (سؤال ۴۶۶). */
export interface InboundLink {
  where: string;
  path: string;
  scheduled: boolean;
}

export interface RemoveTarget {
  /** «home»، «tariff» یا شمارهٔ صفحه. */
  value: string;
  label: string;
  path: string;
}

export interface PageRemoveView {
  now: Date;
  param: string;
  detail: SitePageDetail;
  name: string;
  slug: string;
  live: SitePageVersionRow;
  targets: RemoveTarget[];
  inbound: InboundLink[];
  /** نشانی‌های دیگری که همین حالا با ۳۰۱ به این صفحه می‌روند (نشانی قبلی خودش، یا صفحه‌ای که «به اینجا» برداشته شد). */
  redirectsHere: string[];
  seenVersion: number;
}

export interface PageVersionsView {
  now: Date;
  param: string;
  kind: SitePageKind;
  detail: SitePageDetail | null;
  state: PageState;
  isDefault: boolean;
  name: string;
}

export interface PageVersionView {
  now: Date;
  param: string;
  kind: SitePageKind;
  detail: SitePageDetail | null;
  /** null یعنی متن پیش‌فرض «تعرفه». */
  version: SitePageVersionRow | null;
  content: AnyPageContent;
  state: PageState;
  facts: PageFacts;
}

/* ───────────────────────── سرویس ───────────────────────── */

export interface PanelPagesDeps {
  store: SitePageStore;
  /** واقعیت‌های امروز سایت در لحظهٔ `at`: تعرفه، گزینه‌های خاموش موقت، سقف صفحه، جای‌نگهدارها و روز فعال شدن تعرفه. */
  facts: (at: Date) => Promise<PageFacts>;
  /** پیوندهای متن‌های دیگر سایت و راه تماس، در لحظهٔ `at`. */
  siteTexts: (at: Date) => Promise<SiteTexts>;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

interface Loaded {
  ref: PageRef;
  kind: SitePageKind;
  detail: SitePageDetail | null;
}

/** نام کوتاه یک صفحه برای فهرست و پیام‌ها: «تعرفه»، یا نام متن تازه‌ترین (روی سایت، زمان‌دار، پیش‌نویس، آخرین نسخه). */
function nameOf(kind: SitePageKind, detail: SitePageDetail | null, state: PageState): string {
  if (kind === 'tariff') return 'تعرفه';
  const sources = [state.live?.content, state.pending?.content, detail?.draft?.content, detail?.versions.find((row) => row.content !== null)?.content];
  for (const source of sources) {
    if (source === null || source === undefined) continue;
    const name = pageContentOf('landing', source).name;
    if (name) return name;
  }
  return 'صفحهٔ بی‌نام';
}

/** نشانی امروز یا آیندهٔ یک صفحهٔ فرود، بی «/». */
function slugOf(detail: SitePageDetail, state: PageState): string {
  if (detail.page.kind === 'tariff') return TARIFF_SLUG;
  if (state.live) return state.live.slug;
  if (state.pending) return state.pending.slug;
  if (detail.draft) return pageContentOf('landing', detail.draft.content).slug;
  return detail.versions[0]?.slug ?? '';
}

export function createPanelPages(deps: PanelPagesDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const actorOf = (session: AdminSession, ip: string) => ({ adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) });

  function guard(session: AdminSession, param: string): Result<PageRef> {
    if (!can(session, 'content.edit')) return fail(403, 'forbidden');
    const ref = pageRefOf(param);
    return ref ? ok(ref) : fail(404, 'page_not_found');
  }

  async function load(ref: PageRef): Promise<Result<Loaded>> {
    if (ref.type === 'new') return ok({ ref, kind: 'landing', detail: null });
    if (ref.type === 'tariff') return ok({ ref, kind: 'tariff', detail: await store.tariff() });
    const detail = await store.detail(ref.id);
    return detail ? ok({ ref, kind: detail.page.kind, detail }) : fail(404, 'page_not_found');
  }

  /** سنجش با سایت همین حالا: نشانی‌های روی سایت (صفحه‌های ثابت، تماس، صفحه‌های فرود و نشانی خود همین صفحه) و نشانی‌هایی که مال صفحهٔ دیگرند. */
  function contextOf(all: readonly SitePageDetail[], at: Date, facts: PageFacts, texts: SiteTexts, self: { id: number | null; slug: string }): PageCheckContext {
    const live = new Set(SITE_PATHS);
    if (texts.contact) live.add('/contact');
    for (const detail of all) {
      if (detail.page.kind !== 'landing') continue;
      const row = pageStateAt(detail.versions, at).live;
      if (row && row.content !== null) live.add(`/${row.slug}`);
    }
    if (self.slug) live.add(`/${self.slug}`);
    return {
      values: facts.values,
      priceList: facts.priceList,
      paused: facts.paused,
      maxPages: facts.maxPages,
      livePath: (path) => live.has(path),
      slugTaken: (slug) => all.some((detail) => detail.page.id !== self.id && detail.slugs.includes(slug)),
    };
  }

  const selfOf = (kind: SitePageKind, detail: SitePageDetail | null, content: AnyPageContent) => ({
    id: detail?.page.id ?? null,
    slug: kind === 'landing' ? (content as LandingContent).slug : '',
  });

  /** متن انتشار و آنچه سنجیده می‌شود، یک جا برای صفحهٔ انتشار و خود انتشار. */
  async function target(loaded: Loaded, from: PagePublishFrom, at: Date) {
    const { kind, detail } = loaded;
    if (!detail) return fail(404, 'page_not_found');
    const [all, facts, texts] = await Promise.all([store.all(), deps.facts(at), deps.siteTexts(at)]);
    const state = pageStateAt(detail.versions, at);
    if (state.pending) return fail(409, 'page_pending');
    const live = liveContentOf(kind, state);
    const isDefault = kind === 'tariff' && !(state.live && state.live.content !== null);
    const liveSlug = kind === 'tariff' ? TARIFF_SLUG : state.live && state.live.content !== null ? state.live.slug : null;
    let content: AnyPageContent;
    let source: SitePageVersionRow | null = null;
    if (from.type === 'draft') {
      if (!detail.draft) return fail(409, 'page_no_draft');
      content = tidyPage(kind, pageContentOf(kind, detail.draft.content));
    } else if (from.type === 'default') {
      if (kind !== 'tariff') return fail(404, 'page_not_found');
      if (isDefault) return fail(409, 'page_unchanged');
      content = defaultTariffPage();
    } else {
      const row = detail.versions.find((version) => version.version === from.version);
      if (!row) return fail(404, 'page_not_found');
      // نسخه‌ای که خودش برگشت به متن پیش‌فرض بود همان برگشت به پیش‌فرض است.
      if (row.content === null) return fail(404, 'page_not_found');
      content = pageContentOf(kind, row.content);
      source = row;
    }
    const check = checkPage(kind, content, contextOf(all, at, facts, texts, selfOf(kind, detail, content)));
    if (check.issues.length > 0) return fail(409, 'page_invalid');
    // متن پیش‌فرض «تعرفه» بالاتر سنجیده شد؛ برگشت به آن تغییری است حتی اگر متن روی سایت همان واژه‌ها را داشته باشد.
    const slug = kind === 'landing' ? (content as LandingContent).slug : TARIFF_SLUG;
    if (from.type !== 'default' && live && canonicalPage(kind, content) === canonicalPage(kind, live) && slug === liveSlug) return fail(409, 'page_unchanged');
    return ok({ detail, state, live, isDefault, liveSlug, content, source, warnings: check.warnings, facts });
  }

  /** «متن پیش‌فرض» و نام‌های تعرفه در «چه عوض می‌شود» میز. */
  function deskTextOf(list: PriceList) {
    return (desk: DeskPreset) => {
      const parts = [
        desk.color === 'color' ? 'رنگی' : desk.color === 'bw' ? 'سیاه‌سفید' : '',
        desk.sides === 'single' ? 'یکرو' : desk.sides === 'double' ? 'دورو' : '',
        desk.size ? desk.size.toUpperCase() : '',
        desk.paper ? (list.paperTypes[desk.paper]?.nameFa ?? desk.paper) : '',
        desk.binding ? (list.bindingTypes[desk.binding]?.nameFa ?? desk.binding) : '',
      ].filter(Boolean);
      return parts.length > 0 ? parts.join('، ') : 'پیش‌فرض سایت';
    };
  }

  /** متن‌هایی که به یکی از این نشانی‌ها پیوند دارند، روی سایت یا زمان‌دار (سؤال ۴۶۶). */
  function inboundOf(all: readonly SitePageDetail[], at: Date, texts: SiteTexts, selfId: number, paths: ReadonlySet<string>): InboundLink[] {
    const out: InboundLink[] = [];
    for (const detail of all) {
      if (detail.page.id === selfId) continue;
      const state = pageStateAt(detail.versions, at);
      const kind = detail.page.kind;
      const rows: [SitePageVersionRow | null, boolean][] = [
        [state.live, false],
        [state.pending, true],
      ];
      for (const [row, scheduled] of rows) {
        if (!row || row.content === null) continue;
        for (const path of pageLinkPaths(kind, pageContentOf(kind, row.content))) {
          if (paths.has(path)) out.push({ where: nameOf(kind, detail, state), path, scheduled });
        }
      }
    }
    for (const link of texts.links) if (paths.has(link.path)) out.push(link);
    return out;
  }

  /** صفحهٔ «از سایت بردار…» (سؤال ۴۶۶): مقصدها، پیوندهایی که «پیدا نشد» را می‌بندند، و نشانی‌هایی که همین حالا به این صفحه می‌روند. */
  async function removeView(session: AdminSession, param: string): Promise<Result<PageRemoveView>> {
    const ref = guard(session, param);
    if (!ref.ok) return ref;
    const loaded = await load(ref.value);
    if (!loaded.ok) return loaded;
    const { kind, detail } = loaded.value;
    if (!detail || kind !== 'landing') return fail(404, 'page_not_found');
    const at = now();
    const [all, texts, routes] = await Promise.all([store.all(), deps.siteTexts(at), store.routes(at)]);
    const state = pageStateAt(detail.versions, at);
    if (state.pending) return fail(409, 'page_pending');
    if (!state.live || state.live.content === null) return fail(409, 'page_not_live');
    const slug = state.live.slug;
    const targets: RemoveTarget[] = [
      { value: 'home', label: 'صفحهٔ اصلی', path: '/' },
      { value: 'tariff', label: 'تعرفه', path: `/${TARIFF_SLUG}` },
    ];
    for (const other of all) {
      if (other.page.id === detail.page.id || other.page.kind !== 'landing') continue;
      const otherState = pageStateAt(other.versions, at);
      if (otherState.live && otherState.live.content !== null) {
        targets.push({ value: String(other.page.id), label: nameOf('landing', other, otherState), path: `/${otherState.live.slug}` });
      }
    }
    const paths = new Set(detail.slugs.map((one) => `/${one}`));
    return ok({
      now: at,
      param: pageParam(detail.page),
      detail,
      name: nameOf(kind, detail, state),
      slug,
      live: state.live,
      targets,
      inbound: inboundOf(all, at, texts, detail.page.id, paths),
      redirectsHere: [...routes.redirects].filter(([, to]) => to === `/${slug}`).map(([from]) => `/${from}`),
      seenVersion: state.latest,
    });
  }

  return {
    /** فهرست «صفحه‌های فرود» و «نشانی‌های قبلی» (سؤال ۴۶۱). */
    async overview(session: AdminSession): Promise<Result<PagesOverview>> {
      if (!can(session, 'content.edit')) return fail(403, 'forbidden');
      const at = now();
      const [all, facts, texts, routes] = await Promise.all([store.all(), deps.facts(at), deps.siteTexts(at), store.routes(at)]);

      const rowOf = (detail: SitePageDetail | null, kind: SitePageKind): PageRow => {
        const state = detail ? pageStateAt(detail.versions, at) : NO_STATE;
        const live = liveContentOf(kind, state);
        const onSite = state.live && state.live.content !== null;
        const ctx = contextOf(all, at, facts, texts, { id: detail?.page.id ?? null, slug: '' });
        const check = live && (kind === 'tariff' ? onSite : true) ? checkPage(kind, live, ctx) : { issues: [], warnings: [] };
        let removed: PageRow['removed'] = null;
        if (state.live && state.live.removal) {
          const to = state.live.removal === 'moved' ? (routes.redirects.get(state.live.slug) ?? null) : null;
          removed = { version: state.live, to };
        }
        return {
          param: detail ? pageParam(detail.page) : kind === 'tariff' ? TARIFF_SLUG : 'new',
          kind,
          name: nameOf(kind, detail, state),
          slug: detail ? slugOf(detail, state) : TARIFF_SLUG,
          state,
          isDefault: kind === 'tariff' && !onSite,
          draft: detail?.draft ?? null,
          removed,
          warnings: check.warnings,
          blockIssues: check.issues.filter((issue) => issue.code.startsWith('block_')),
          inFooter: kind === 'landing' && live !== null && (live as LandingContent).inFooter,
        };
      };

      const tariffDetail = all.find((detail) => detail.page.kind === 'tariff') ?? null;
      const tariff = rowOf(tariffDetail, 'tariff');
      const landings = all.filter((detail) => detail.page.kind === 'landing').map((detail) => rowOf(detail, 'landing'));
      const moved: MovedRow[] = [];
      for (const [slug, to] of routes.redirects) {
        const owner = all.find((detail) => detail.slugs.includes(slug));
        if (!owner) continue;
        const state = pageStateAt(owner.versions, at);
        const why = state.live && state.live.content !== null ? 'slug' : 'removed';
        moved.push({ from: `/${slug}`, to, name: nameOf(owner.page.kind, owner, state), why });
      }
      const rows = [tariff, ...landings];
      return ok({
        now: at,
        tariff,
        landings,
        moved,
        counts: {
          live: rows.filter((row) => row.kind === 'tariff' || (row.state.live && row.state.live.content !== null)).length,
          pending: rows.filter((row) => row.state.pending).length,
          drafts: rows.filter((row) => row.draft).length,
        },
      });
    },

    async editor(session: AdminSession, param: string): Promise<Result<PageEditorView>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      const { kind, detail } = loaded.value;
      const at = now();
      const [all, facts, texts] = await Promise.all([store.all(), deps.facts(at), deps.siteTexts(at)]);
      const state = detail ? pageStateAt(detail.versions, at) : NO_STATE;
      const live = liveContentOf(kind, state);
      const draft = detail?.draft ?? null;
      const removed = state.live && state.live.removal ? state.live : null;
      const content: AnyPageContent = draft
        ? tidyPage(kind, pageContentOf(kind, draft.content))
        : (baseContentOf(kind, state) ?? (detail ? lastContentOf(kind, detail.versions) : null) ?? (kind === 'tariff' ? defaultTariffPage() : emptyLanding()));
      const check = draft ? checkPage(kind, content, contextOf(all, at, facts, texts, selfOf(kind, detail, content))) : { issues: [], warnings: [] };
      return ok({
        now: at,
        param: detail ? pageParam(detail.page) : param,
        kind,
        detail,
        state,
        live,
        isDefault: kind === 'tariff' && !(state.live && state.live.content !== null),
        draft,
        content,
        issues: check.issues,
        warnings: check.warnings,
        facts,
        placeholders: [
          ...PLACEHOLDERS.map((name) => ({ name, value: facts.values[name], source: PLACEHOLDER_SOURCES[name].source })),
          ...PAGE_PLACEHOLDERS.map((name) => ({ name, value: facts.values[name], source: PAGE_PLACEHOLDER_SOURCES[name].source })),
        ],
        removed,
      });
    },

    /**
     * «ذخیره و پیش‌نمایش» (سؤال ۴۶۲): فرم به متن، یکدست، با کار فهرست سؤال‌ها اگر هست؛ پیش‌نویس با خطا هم ذخیره می‌شود. صفحهٔ تازه با اولین
     * ذخیره ساخته می‌شود؛ صفحهٔ تازهٔ خالی و متنی که همان روی سایت (یا زمان‌دار) است پیش‌نویس نمی‌ماند.
     */
    async save(
      session: AdminSession,
      param: string,
      input: { field: (name: string) => string; faqCount: number; op?: PageFaqOp | null },
      ip: string,
    ): Promise<Result<{ param: string | null; draft: SitePageDraftRow | null; issues: ContentIssue[]; warnings: PageWarning[] }>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      const { kind, detail } = loaded.value;
      let content: AnyPageContent = tidyPage(kind, pageFromFields(kind, input.field, input.faqCount));
      if (input.op) {
        const next = applyPageFaqOp(content, input.op);
        if (!next) return fail(400, input.op.op === 'add' ? 'page_faq_full' : 'page_not_found');
        content = next;
      }
      const at = now();
      const state = detail ? pageStateAt(detail.versions, at) : NO_STATE;
      const base = baseContentOf(kind, state);
      const same = base ? canonicalPage(kind, content) === canonicalPage(kind, base) : !detail && canonicalPage(kind, content) === canonicalPage(kind, emptyLanding());
      if (same) {
        if (detail?.draft) await store.discardDraft(detail.page.id);
        return ok({ param: detail ? pageParam(detail.page) : null, draft: null, issues: [], warnings: [] });
      }
      if (Buffer.byteLength(JSON.stringify(content)) > DRAFT_MAX_BYTES) return fail(413, 'page_too_large');
      const saved = await store.saveDraft({ pageId: detail?.page.id ?? null, kind, content, actor: actorOf(session, ip), at });
      const [all, facts, texts] = await Promise.all([store.all(), deps.facts(at), deps.siteTexts(at)]);
      const self = { id: saved.pageId, slug: kind === 'landing' ? (content as LandingContent).slug : '' };
      const check = checkPage(kind, content, contextOf(all, at, facts, texts, self));
      return ok({ param: pageParam({ id: saved.pageId, kind }), draft: saved.draft, issues: check.issues, warnings: check.warnings });
    },

    /** «دور انداختن پیش‌نویس»؛ صفحه‌ای که هرگز منتشر نشد با آن پاک می‌شود. پیش‌نویسی که نبود هم موفق است (دو کلیک). */
    async discard(session: AdminSession, param: string): Promise<Result<{ deleted: boolean }>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      if (!loaded.value.detail) return ok({ deleted: false });
      const done = await store.discardDraft(loaded.value.detail.page.id);
      return ok({ deleted: done.deleted });
    },

    /** صفحهٔ انتشار: «چه عوض می‌شود»، هشدارها، و آنچه فرم می‌فرستد (سؤال ۴۶۵). */
    async publishView(session: AdminSession, param: string, fromParam: unknown): Promise<Result<PagePublishView>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      const from = pagePublishFromOf(fromParam);
      if (!from) return fail(404, 'page_not_found');
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      const at = now();
      const found = await target(loaded.value, from, at);
      if (!found.ok) return found;
      const { detail, state, live, isDefault, liveSlug, content, source, warnings, facts } = found.value;
      const kind = loaded.value.kind;
      return ok({
        now: at,
        param: pageParam(detail.page),
        kind,
        detail,
        from,
        content,
        live,
        isDefault,
        liveSlug,
        diff: live ? pageDiff(kind, live, content, facts.values, { deskText: deskTextOf(facts.priceList) }) : null,
        warnings,
        source,
        draft: detail.draft,
        staleBase: from.type === 'draft' && detail.draft !== null && detail.draft.baseVersion !== state.latest,
        seenVersion: state.latest,
        seen: pageSeen(kind, content),
        facts,
        dayDefault: formatJalaliNumeric(tehranDayStart(at, 1)),
      });
    },

    /**
     * انتشار، همین حالا یا زمان‌دار، با کد تازه (سؤال ۴۶۵). پیش از کد: همان سنجش‌های صفحهٔ انتشار، نسخه و متن همان است که صفحه دید، و روز و
     * ساعت درست؛ پس کد برای کاری که شدنی نیست هدر نمی‌رود. ذخیره‌گاه همین‌ها را زیر قفل دوباره می‌سنجد.
     */
    async publish(
      session: AdminSession,
      param: string,
      input: WhenInput & { from: unknown; version: unknown; seen: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ param: string; version: number; scheduled: boolean }>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      const from = pagePublishFromOf(input.from);
      if (!from) return fail(404, 'page_not_found');
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      const at = now();
      const found = await target(loaded.value, from, at);
      if (!found.ok) return found;
      const { kind } = loaded.value;
      const { detail, state, content } = found.value;
      const seenVersion = typeof input.version === 'string' && /^\d{1,6}$/.test(input.version) ? Number(input.version) : -1;
      const seen = typeof input.seen === 'string' ? input.seen : '';
      if (seenVersion !== state.latest || seen !== pageSeen(kind, content)) return fail(409, 'page_changed');
      const when = liveFromOf(input, at);
      if (!when.ok) return fail(400, when.error, { field: when.field });
      if (blank(input.code)) return fail(400, 'page_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const slug = kind === 'landing' ? (content as LandingContent).slug : TARIFF_SLUG;
      const done = await store.publish({
        pageId: detail.page.id,
        expectedVersion: seenVersion,
        source:
          from.type === 'draft'
            ? { type: 'draft', content, slug, verify: (raw) => pageSeen(kind, tidyPage(kind, pageContentOf(kind, raw))) === seen }
            : from.type === 'default'
              ? { type: 'default' }
              : { type: 'restore', version: from.version },
        liveFrom: when.at,
        actor: actorOf(session, ip),
        at,
      });
      if (done.ok) return ok({ param: pageParam(detail.page), version: done.version, scheduled: when.at.getTime() > at.getTime() });
      return writeFailure(done);
    },

    /** «پس گرفتن زمان‌دار»، بی کد (سؤال ۴۶۵): متنش اگر پیش‌نویسی نیست پیش‌نویس می‌شود. */
    async withdraw(session: AdminSession, param: string, input: { version: unknown }, ip: string): Promise<Result<{ param: string; version: number }>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      const { detail } = loaded.value;
      const version = typeof input.version === 'string' && /^[1-9]\d{0,5}$/.test(input.version) ? Number(input.version) : null;
      if (!detail || version === null) return fail(404, 'page_not_found');
      const done = await store.withdraw({ pageId: detail.page.id, version, actor: actorOf(session, ip), at: now() });
      if (done.ok) return ok({ param: pageParam(detail.page), version });
      if (!done.ok && done.reason === 'live') return fail(409, 'page_already_live');
      return writeFailure(done);
    },

    removeView,

    /**
     * برداشتن با کد تازه (سؤال ۴۶۶): «به صفحهٔ دیگری» (۳۰۱) یا «پیدا نشد» (۴۰۴، فقط بی پیوند روی سایت یا زمان‌دار). پیش از کد همان سنجش‌های
     * صفحه، و نسخه همان که صفحه دید؛ ذخیره‌گاه زیر قفل دوباره، با مقصد.
     */
    async remove(
      session: AdminSession,
      param: string,
      input: { version: unknown; mode: unknown; to: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ param: string; version: number }>> {
      const view = await removeView(session, param);
      if (!view.ok) return view;
      const { detail, targets, inbound, seenVersion } = view.value;
      const version = typeof input.version === 'string' && /^\d{1,6}$/.test(input.version) ? Number(input.version) : -1;
      if (version !== seenVersion) return fail(409, 'page_changed');
      if (input.mode !== 'gone' && input.mode !== 'moved') return fail(400, 'page_remove_mode', { field: 'mode' });
      if (input.mode === 'gone' && inbound.length > 0) return fail(409, 'page_remove_linked', { field: 'mode' });
      let movedTo: RemovalTarget = null;
      if (input.mode === 'moved') {
        const chosen = targets.find((one) => one.value === input.to);
        if (!chosen) return fail(400, 'page_remove_target', { field: 'to' });
        movedTo = chosen.value === 'home' ? null : chosen.value === 'tariff' ? 'tariff' : Number(chosen.value);
      }
      if (blank(input.code)) return fail(400, 'page_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await store.remove({ pageId: detail.page.id, expectedVersion: version, mode: input.mode, movedTo, actor: actorOf(session, ip), at: now() });
      if (done.ok) return ok({ param: pageParam(detail.page), version: done.version });
      return writeFailure(done);
    },

    /** نسخه‌های یک صفحه، تازه‌ترین اول (سؤال ۴۶۶: نسخه‌ها می‌مانند و انتشار دوباره همان نشانی را برمی‌گرداند). */
    async versions(session: AdminSession, param: string): Promise<Result<PageVersionsView>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      if (ref.value.type === 'new') return fail(404, 'page_not_found');
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      const { kind, detail } = loaded.value;
      const at = now();
      const state = detail ? pageStateAt(detail.versions, at) : NO_STATE;
      return ok({
        now: at,
        param: detail ? pageParam(detail.page) : TARIFF_SLUG,
        kind,
        detail,
        state,
        isDefault: kind === 'tariff' && !(state.live && state.live.content !== null),
        name: nameOf(kind, detail, state),
      });
    },

    /** «دیدن» یک نسخه، یا متن پیش‌فرض «تعرفه» (`default`). */
    async version(session: AdminSession, param: string, versionParam: string): Promise<Result<PageVersionView>> {
      const ref = guard(session, param);
      if (!ref.ok) return ref;
      if (ref.value.type === 'new') return fail(404, 'page_not_found');
      const loaded = await load(ref.value);
      if (!loaded.ok) return loaded;
      const { kind, detail } = loaded.value;
      const which = pagePublishFromOf(versionParam);
      if (!which || which.type === 'draft') return fail(404, 'page_not_found');
      const at = now();
      const facts = await deps.facts(at);
      const state = detail ? pageStateAt(detail.versions, at) : NO_STATE;
      const base = { now: at, param: detail ? pageParam(detail.page) : TARIFF_SLUG, kind, detail, state, facts };
      if (which.type === 'default') {
        if (kind !== 'tariff') return fail(404, 'page_not_found');
        return ok({ ...base, version: null, content: defaultTariffPage() });
      }
      const row = detail?.versions.find((version) => version.version === which.version);
      if (!row) return fail(404, 'page_not_found');
      const content = row.content !== null ? pageContentOf(kind, row.content) : kind === 'tariff' ? defaultTariffPage() : lastContentOf(kind, detail!.versions.filter((version) => version.version < row.version));
      if (!content) return fail(404, 'page_not_found');
      return ok({ ...base, version: row, content });
    },
  };
}

/** نتیجهٔ نوشتن ذخیره‌گاه به خطای پنل. */
function writeFailure(done: Extract<PageWriteOutcome, { ok: false }>): Failure {
  switch (done.reason) {
    case 'not_found':
      return fail(404, 'page_not_found');
    case 'noop':
      return fail(409, 'page_unchanged');
    case 'slug_taken':
      return fail(409, 'page_slug_taken');
    case 'pending':
      return fail(409, 'page_pending');
    case 'not_live':
      return fail(409, 'page_not_live');
    case 'bad_target':
      return fail(409, 'page_remove_target');
    case 'live':
      return fail(409, 'page_already_live');
    default:
      return fail(409, 'page_changed');
  }
}

export type PanelPages = ReturnType<typeof createPanelPages>;
