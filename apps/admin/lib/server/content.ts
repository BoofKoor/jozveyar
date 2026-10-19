/**
 * متن‌های سایت در پنل (برش ۱۱٫۱، ADR-065؛ سؤال‌های ۲۸۲ تا ۲۹۰): شش متن (صفحهٔ اصلی، سؤال‌ها، قوانین، حریم خصوصی، دربارهٔ ما، و تماس و
 * پاورقی)، هر کدام با پیش‌نویس، پیش‌نمایش با ظاهر سایت و عدد امروز جای‌نگهدارها، انتشار با «چه عوض می‌شود» و کد تازه، و نسخه‌ها با
 * «برگرداندن…» (نسخه‌ای قبلی یا متن پیش‌فرض، باز با کد تازه).
 *
 * - **مجوز در سرور** (ADR-038): همه با `content.edit`، فقط مالک، پیش از هر خواندن.
 * - **سرور منبع حقیقت است:** هر فیلد اینجا یکدست (`tidyContent`) و سنجیده (`checkContent`) می‌شود؛ پیش‌نویس با خطا هم ذخیره می‌شود، ولی انتشار
 *   فقط بی خطا. هیچ متنی HTML نمی‌شود (Markdown محدود، `@jozveyar/content`).
 * - **کد تازه** (سؤال ۲۸۷): انتشار و برگرداندن، پس از هر سنجشی که بی کد جواب دارد، تا کد هدر نرود. ذخیره و دور انداختن پیش‌نویس بی کد: روی
 *   سایت اثری ندارند.
 * - **همان که دیده شد:** صفحهٔ انتشار نسخهٔ روی سایت و اثر انگشت متنی را که «چه عوض می‌شود»ش را نشان داد می‌فرستد؛ پیش از کد و دوباره زیر قفل
 *   ذخیره‌گاه سنجیده می‌شود.
 * - **رویداد** `content.publish` در همان تراکنش انتشار، بی متن (ذخیره‌گاه).
 *
 * از ۱۱٫۳ نوار اعلان هم (ADR-066، سؤال‌های ۲۸۷ و ۲۹۱ تا ۲۹۴): تنظیم `content.bar` با همان ذخیره‌گاه تنظیم‌ها (قفل، «همان که دیده شد» زیر قفل،
 * رویداد `content.bar` در همان تراکنش، با نوار پیش و پس، متن هم، چون نوار نسخه ندارد). مجوزش `content.bar` (مالک و متصدی)؛ روشن کردن و هر تغییری
 * که نوار تازه‌اش حالا یا بعداً روی سایت است کد تازه می‌خواهد، پس از هر سنجشی که بی کد جواب دارد؛ خاموش کردن و ذخیرهٔ متن نوار خاموش نه.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. قفل، تراکنش و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { createHash } from 'node:crypto';

import type { AnnouncementBar } from '@jozveyar/contracts';

import {
  FAQ_MAX_ITEMS,
  PLACEHOLDERS,
  PLACEHOLDER_SOURCES,
  barShown,
  canonicalBar,
  canonicalContent,
  checkContent,
  contentDiff,
  contentFromFields,
  contentOf,
  defaultContent,
  factsOf,
  isContentKind,
  placeholderValues,
  sameBar,
  tidyContent,
  type AnyContent,
  type ContentByKind,
  type ContentDiff,
  type ContentFacts,
  type ContentIssue,
  type ContentKind,
  type FaqContent,
  type PlaceholderName,
  type PlaceholderValues,
} from '@jozveyar/content';
import {
  BAR_SETTING,
  FILES_RETENTION_SETTING,
  SITE_CONTENT_MAX_BYTES,
  SLA_DAYS_SETTING,
  UPLOAD_RETENTION_SETTING,
  readSetting,
  uploadDaysOf,
  type ContentDraftRow,
  type ContentVersionRow,
  type OrderStore,
  type SettingEvent,
  type SettingsStore,
  type SiteContentStore,
} from '@jozveyar/db';

import { barChange, barFormOf, barOf, type BarChange, type BarFormInput } from '../bar';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelContentDeps {
  store: SiteContentStore;
  /** واقعیت‌های امروز سایت (تعرفهٔ فعال و تنظیم‌ها)، برای جای‌نگهدارها و متن پیش‌فرض سؤال‌ها. */
  facts: () => Promise<ContentFacts>;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  /** نوار اعلان (۱۱٫۳): همان ذخیره‌گاه تنظیم‌ها، و آخرین رویدادش برای «روشن از امروز 10:05، علی». */
  settings: Pick<SettingsStore, 'read' | 'change'>;
  barEvent: () => Promise<SettingEvent | null>;
  /** همهٔ چاپخانه‌ها همین حالا تعطیل‌اند؟ پایان انحصاری تعطیلی، تا کارت بگوید پیام تعطیلی جای نوار است (سؤال ۲۹۳). */
  closedUntil: (now: Date) => Promise<Date | null>;
  now?: () => Date;
}

/** نوار اعلان در پنل (۱۱٫۳): نوار امروز، «همان که دیده شد»، عدد امروز جای‌نگهدارها، آخرین تغییر و تعطیلی همهٔ چاپخانه‌ها. */
export interface BarView {
  now: Date;
  bar: AnnouncementBar;
  seen: string;
  values: PlaceholderValues;
  event: SettingEvent | null;
  /** پایان انحصاری تعطیلی همهٔ چاپخانه‌ها، اگر همین حالا همه تعطیل‌اند. */
  closedUntil: Date | null;
}

/** «همان که دیده شد» نوار: اثر انگشت همهٔ فیلدها. */
export const barSeen = (bar: AnnouncementBar) => createHash('sha256').update(canonicalBar(bar)).digest('hex');

/** کد برنامهٔ تأیید خالی: بی `stepUp`، چون هر کد نادرست یک اشتباه از سقف قفل است و خالی اشتباه نیست، فراموش شده. */
const blank = (code: unknown) => typeof code !== 'string' || code.trim() === '';

/** نوار برای رویداد: همهٔ فیلدها، متن هم، چون نوار نسخه ندارد و رد هر چه روی سایت آمد همین است. */
const barDetail = (bar: AnnouncementBar) => ({ ...bar });

/** متن روی سایت یک نوع: آخرین نسخه، و متنی که سایت نشان می‌دهد. */
export interface LiveContent<K extends ContentKind = ContentKind> {
  /** آخرین نسخه (برگشت به پیش‌فرض هم)؛ null یعنی هیچ‌وقت منتشر نشده. */
  latest: ContentVersionRow | null;
  /** متن پیش‌فرض روی سایت است (بی نسخه، یا آخرین نسخه برگشت به آن). */
  isDefault: boolean;
  content: ContentByKind[K];
}

export interface ContentOverviewRow {
  kind: ContentKind;
  live: LiveContent;
  draft: ContentDraftRow | null;
}

/** ردیف جدول «جای‌نگهدارها»ی ویرایشگر: نام، عدد امروز، و منبعش. */
export interface PlaceholderRow {
  name: PlaceholderName;
  value: string;
  source: string;
}

export interface EditorView<K extends ContentKind = ContentKind> {
  now: Date;
  kind: K;
  live: LiveContent<K>;
  draft: ContentDraftRow | null;
  /** متن فرم: پیش‌نویس، وگرنه متن روی سایت. */
  content: ContentByKind[K];
  /** خطاهای پیش‌نویس؛ بی پیش‌نویس هیچ. */
  issues: ContentIssue[];
  values: PlaceholderValues;
  placeholders: PlaceholderRow[];
  /** نشانی «تماس و پاورقی» روی سایت، برای پیش‌نمایش بخش «نشانی» دربارهٔ ما. */
  contactAddress: string;
}

/** از کجا منتشر می‌شود: پیش‌نویس، برگشت به متن پیش‌فرض، یا برگرداندن نسخهٔ N. */
export type PublishFrom = { type: 'draft' } | { type: 'default' } | { type: 'version'; version: number };

export interface PublishView<K extends ContentKind = ContentKind> {
  now: Date;
  kind: K;
  from: PublishFrom;
  live: LiveContent<K>;
  draft: ContentDraftRow | null;
  /** متنی که منتشر می‌شود. */
  content: ContentByKind[K];
  /** نسخه‌ای که برمی‌گردد؛ پیش‌نویس و متن پیش‌فرض هیچ. */
  source: ContentVersionRow | null;
  diff: ContentDiff;
  /** پیش‌نویس از روی نسخه‌ای ساخته شد که دیگر روی سایت نیست. */
  staleBase: boolean;
  /** «همان که دیده شد» برای فرم: نسخهٔ روی سایت و اثر انگشت متن. */
  seenLive: number;
  seen: string;
}

export interface VersionsView {
  now: Date;
  kind: ContentKind;
  versions: ContentVersionRow[];
  live: LiveContent;
}

export interface VersionView<K extends ContentKind = ContentKind> {
  now: Date;
  kind: K;
  /** null یعنی متن پیش‌فرض. */
  version: ContentVersionRow | null;
  content: ContentByKind[K];
  live: LiveContent<K>;
  /** همین متن روی سایت است. */
  isLive: boolean;
  values: PlaceholderValues;
  contactAddress: string;
}

/**
 * واقعیت‌های امروز سایت برای پیش‌نمایش: همان تعرفهٔ فعال و تنظیم‌هایی که سایت می‌خواند (`siteTariff`، `siteFiles` و `siteFacts` وب)، با همان
 * قاعده‌ها (`readSetting`، `uploadDaysOf`)، تا عدد پیش‌نمایش همان عدد سایت باشد.
 */
export async function loadContentFacts(source: Pick<OrderStore, 'activePriceList' | 'setting'>): Promise<ContentFacts> {
  const read = (key: string) => source.setting(key);
  const [priceList, slaDays, orderFilesDays, uploadRetention, formats] = await Promise.all([
    source.activePriceList(),
    readSetting(read, SLA_DAYS_SETTING),
    readSetting(read, FILES_RETENTION_SETTING),
    read(UPLOAD_RETENTION_SETTING),
    readSetting(read, 'file.formats'),
  ]);
  return factsOf({ priceList, slaDays, uploadDays: uploadDaysOf(uploadRetention), orderFilesDays, formats });
}

/** کار فهرست سؤال‌ها با «ذخیره و پیش‌نمایش» (سؤال ۲۸۹، بی JS): افزودن، حذف، بالاتر و پایین‌تر. */
export type FaqOp = { op: 'add' } | { op: 'delete' | 'up' | 'down'; index: number };

export function faqOpOf(value: unknown): FaqOp | null {
  if (value === 'add') return { op: 'add' };
  const match = typeof value === 'string' ? /^(delete|up|down):(\d{1,2})$/.exec(value) : null;
  return match ? { op: match[1] as 'delete' | 'up' | 'down', index: Number(match[2]) } : null;
}

/** سؤال‌ها پس از کار؛ null یعنی نشدنی (سقف، یا جایی که نیست). */
export function applyFaqOp(content: FaqContent, op: FaqOp): FaqContent | null {
  const items = [...content.items];
  if (op.op === 'add') return items.length >= FAQ_MAX_ITEMS ? null : { items: [...items, { q: '', a: '' }] };
  if (op.index < 0 || op.index >= items.length) return null;
  if (op.op === 'delete') items.splice(op.index, 1);
  else {
    const to = op.op === 'up' ? op.index - 1 : op.index + 1;
    if (to < 0 || to >= items.length) return null;
    [items[op.index], items[to]] = [items[to]!, items[op.index]!];
  }
  return { items };
}

/** اثر انگشت یک متن (JSON یکتا)، برای «همان که دیده شد». */
export const contentSeen = (kind: ContentKind, content: AnyContent) => createHash('sha256').update(canonicalContent(kind, content)).digest('hex');

/** «default» یا شمارهٔ نسخه، از نشانی یا فرم. */
export function publishFromOf(value: unknown): PublishFrom | null {
  if (value === undefined || value === null || value === '' || value === 'draft') return { type: 'draft' };
  if (value === 'default') return { type: 'default' };
  return typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? { type: 'version', version: Number(value) } : null;
}

export function createPanelContent(deps: PanelContentDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());

  function liveOf<K extends ContentKind>(kind: K, latest: ContentVersionRow | undefined, facts: ContentFacts): LiveContent<K> {
    if (latest && latest.content !== null) return { latest, isDefault: false, content: contentOf(kind, latest.content) };
    return { latest: latest ?? null, isDefault: true, content: defaultContent(kind, facts) };
  }

  const guard = (session: AdminSession, param: string): Result<ContentKind> =>
    !can(session, 'content.edit') ? fail(403, 'forbidden') : isContentKind(param) ? ok(param) : fail(404, 'content_not_found');

  /** پیش‌نویس به شکل متن، یکدست؛ همان که انتشار منتشر می‌کند. */
  const draftContent = <K extends ContentKind>(kind: K, draft: ContentDraftRow): ContentByKind[K] => tidyContent(kind, contentOf(kind, draft.content));

  const contactAddress = (live: Partial<Record<ContentKind, ContentVersionRow>>, facts: ContentFacts) => liveOf('contact', live.contact, facts).content.address;

  /** متن انتشار و آنچه سنجیده می‌شود، یک جا برای صفحهٔ انتشار و خود انتشار. */
  async function target(kind: ContentKind, from: PublishFrom) {
    const [live, drafts, facts] = await Promise.all([store.live(), store.drafts(), deps.facts()]);
    const current = liveOf(kind, live[kind], facts);
    const draft = drafts[kind] ?? null;
    let content: AnyContent;
    let source: ContentVersionRow | null = null;
    if (from.type === 'draft') {
      if (!draft) return fail(409, 'content_no_draft');
      content = draftContent(kind, draft);
      if (checkContent(kind, content).length > 0) return fail(409, 'content_invalid');
      if (canonicalContent(kind, content) === canonicalContent(kind, current.content)) return fail(409, 'content_unchanged');
    } else if (from.type === 'default') {
      if (current.isDefault) return fail(409, 'content_unchanged');
      content = defaultContent(kind, facts);
    } else {
      const version = (await store.versions(kind)).find((row) => row.version === from.version);
      // برگرداندن نسخه‌ای که خودش برگشت به پیش‌فرض بود، همان برگشت به پیش‌فرض است (فهرست نسخه‌ها همان را پیوند می‌دهد).
      if (!version || version.content === null) return fail(404, 'content_not_found');
      content = contentOf(kind, version.content);
      source = version;
      if (!current.isDefault && canonicalContent(kind, content) === canonicalContent(kind, current.content)) return fail(409, 'content_unchanged');
    }
    return ok({ live: current, draft, content, source, facts });
  }

  return {
    /** کارت «متن‌های سایت»: هر شش متن با حال روی سایت و پیش‌نویس. */
    async overview(session: AdminSession): Promise<Result<{ now: Date; rows: ContentOverviewRow[] }>> {
      if (!can(session, 'content.edit')) return fail(403, 'forbidden');
      const [live, drafts, facts] = await Promise.all([store.live(), store.drafts(), deps.facts()]);
      const kinds: ContentKind[] = ['home', 'faq', 'terms', 'privacy', 'about', 'contact'];
      return ok({ now: now(), rows: kinds.map((kind) => ({ kind, live: liveOf(kind, live[kind], facts), draft: drafts[kind] ?? null })) });
    },

    async editor(session: AdminSession, param: string): Promise<Result<EditorView>> {
      const kind = guard(session, param);
      if (!kind.ok) return kind;
      const [live, drafts, facts] = await Promise.all([store.live(), store.drafts(), deps.facts()]);
      const current = liveOf(kind.value, live[kind.value], facts);
      const draft = drafts[kind.value] ?? null;
      const content = draft ? draftContent(kind.value, draft) : current.content;
      const values = placeholderValues(facts);
      return ok({
        now: now(),
        kind: kind.value,
        live: current,
        draft,
        content,
        issues: draft ? checkContent(kind.value, content) : [],
        values,
        placeholders: PLACEHOLDERS.map((name) => ({ name, value: values[name], source: PLACEHOLDER_SOURCES[name].source })),
        contactAddress: contactAddress(live, facts),
      });
    },

    /**
     * «ذخیره و پیش‌نمایش» (سؤال ۲۸۶): فرم به متن، یکدست، با کار فهرست سؤال‌ها اگر هست، و پیش‌نویس با خطا هم ذخیره می‌شود. خطاها با نتیجه
     * برمی‌گردند تا «انتشار…» بداند می‌شود یا نه. متنی که همان روی سایت است پیش‌نویس نمی‌ماند (`draft` خالی): چیزی برای انتشار ندارد، و
     * «پیش‌نویس» فهرست بی‌معنا می‌شد.
     */
    async save(
      session: AdminSession,
      param: string,
      input: { field: (name: string) => string; faqCount: number; op?: FaqOp | null },
      ip: string,
    ): Promise<Result<{ draft: ContentDraftRow | null; issues: ContentIssue[] }>> {
      const kind = guard(session, param);
      if (!kind.ok) return kind;
      let content: AnyContent = tidyContent(kind.value, contentFromFields(kind.value, input.field, input.faqCount));
      if (kind.value === 'faq' && input.op) {
        const next = applyFaqOp(content as FaqContent, input.op);
        if (!next) return fail(400, input.op.op === 'add' ? 'content_faq_full' : 'content_not_found');
        content = next;
      }
      const [live, facts] = await Promise.all([store.live(), deps.facts()]);
      if (canonicalContent(kind.value, content) === canonicalContent(kind.value, liveOf(kind.value, live[kind.value], facts).content)) {
        await store.discardDraft(kind.value);
        return ok({ draft: null, issues: [] });
      }
      // متنی که سقف هر فیلدش را دارد بسیار کوچک‌تر از سقف پایگاه داده است (`site_content_drafts_content`)؛ بزرگ‌ترش از سقف فیلدی خیلی گذشته، و
      // ذخیره‌اش به جای خطای سقف خطای خام پایگاه داده بود. حاشیهٔ یک کیلوبایتی برای فاصله‌های JSON پستگرس است.
      if (Buffer.byteLength(JSON.stringify(content)) > SITE_CONTENT_MAX_BYTES - 1024) return fail(413, 'content_too_large');
      const draft = await store.saveDraft({ kind: kind.value, content, actor: { adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) }, at: now() });
      return ok({ draft, issues: checkContent(kind.value, content) });
    },

    /** «دور انداختن پیش‌نویس»؛ پیش‌نویسی که نبود هم موفق است (دو کلیک). */
    async discard(session: AdminSession, param: string): Promise<Result<{ discarded: boolean }>> {
      const kind = guard(session, param);
      if (!kind.ok) return kind;
      return ok({ discarded: await store.discardDraft(kind.value) });
    },

    /** صفحهٔ انتشار: «چه عوض می‌شود» بند به بند، و آنچه فرم می‌فرستد. */
    async publishView(session: AdminSession, param: string, fromParam: unknown): Promise<Result<PublishView>> {
      const kind = guard(session, param);
      if (!kind.ok) return kind;
      const from = publishFromOf(fromParam);
      if (!from) return fail(404, 'content_not_found');
      const found = await target(kind.value, from);
      if (!found.ok) return found;
      const { live, draft, content, source, facts } = found.value;
      return ok({
        now: now(),
        kind: kind.value,
        from,
        live,
        draft,
        content,
        source,
        diff: contentDiff(kind.value, live.content, content, placeholderValues(facts)),
        staleBase: from.type === 'draft' && draft !== null && draft.baseVersion !== (live.latest?.version ?? 0),
        seenLive: live.latest?.version ?? 0,
        seen: contentSeen(kind.value, content),
      });
    },

    /**
     * انتشار با کد تازه. پیش از کد: همان سنجش‌های صفحهٔ انتشار، و نسخهٔ روی سایت و متن همان است که صفحه دید؛ پس کد برای کاری که شدنی نیست
     * هدر نمی‌رود. ذخیره‌گاه همین‌ها را زیر قفل دوباره می‌سنجد.
     */
    async publish(
      session: AdminSession,
      param: string,
      input: { from: unknown; live: unknown; seen: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ kind: ContentKind; version: number }>> {
      const kind = guard(session, param);
      if (!kind.ok) return kind;
      const from = publishFromOf(input.from);
      if (!from) return fail(404, 'content_not_found');
      const found = await target(kind.value, from);
      if (!found.ok) return found;
      const seenLive = typeof input.live === 'string' && /^\d{1,6}$/.test(input.live) ? Number(input.live) : -1;
      const seen = typeof input.seen === 'string' ? input.seen : '';
      if (seenLive !== (found.value.live.latest?.version ?? 0) || seen !== contentSeen(kind.value, found.value.content)) {
        return fail(409, 'content_changed');
      }

      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await store.publish({
        kind: kind.value,
        expectedLive: seenLive,
        source:
          from.type === 'draft'
            ? {
                type: 'draft',
                content: found.value.content,
                verify: (raw) => contentSeen(kind.value, tidyContent(kind.value, contentOf(kind.value, raw))) === seen,
              }
            : { type: 'restore', version: from.type === 'default' ? 0 : from.version },
        actor: { adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) },
        at: now(),
      });
      if (done.ok) return ok({ kind: kind.value, version: done.version });
      if (done.reason === 'not_found') return fail(404, 'content_not_found');
      return fail(409, done.reason === 'noop' ? 'content_unchanged' : 'content_changed');
    },

    /** نوار اعلان (۱۱٫۳): کارت «محتوای سایت» و صفحهٔ «نوار اعلان»، برای مالک و متصدی. */
    async bar(session: AdminSession): Promise<Result<BarView>> {
      if (!can(session, 'content.bar')) return fail(403, 'forbidden');
      const at = now();
      const [raw, facts, event, closedUntil] = await Promise.all([deps.settings.read(BAR_SETTING), deps.facts(), deps.barEvent(), deps.closedUntil(at)]);
      const bar = barOf(raw);
      return ok({ now: at, bar, seen: barSeen(bar), values: placeholderValues(facts), event, closedUntil });
    },

    /**
     * «ذخیره کن» نوار (سؤال‌های ۲۸۷ و ۲۹۴): پیش از کد، نوار همان است که صفحه دید و فرم درست است (روزها، و متن ۹۰ نویسه با عدد امروز)؛ همان
     * نوار هیچ نمی‌کند؛ نواری که حالا یا بعداً روی سایت است کد تازه می‌خواهد. ذخیره‌گاه «همان که دیده شد» را زیر قفل دوباره می‌سنجد.
     */
    async saveBar(
      session: AdminSession,
      input: BarFormInput & { seen: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ change: BarChange | 'same' }>> {
      if (!can(session, 'content.bar')) return fail(403, 'forbidden');
      const at = now();
      const [raw, facts] = await Promise.all([deps.settings.read(BAR_SETTING), deps.facts()]);
      const current = barOf(raw);
      const seen = typeof input.seen === 'string' ? input.seen : '';
      if (seen !== barSeen(current)) return fail(409, 'bar_changed');
      const parsed = barFormOf(input, at, current, placeholderValues(facts));
      if (!parsed.ok) return fail(400, parsed.error ?? 'bar_invalid', { ...(parsed.field ? { field: parsed.field } : {}), issues: parsed.issues });
      const next = parsed.bar;
      if (sameBar(next, current)) return ok({ change: 'same' });
      const fresh = barShown(next, at);
      const change = barChange({ shown: barShown(current, at) }, { shown: fresh });
      if (fresh) {
        if (blank(input.code)) return fail(400, 'bar_code_required', { field: 'code' });
        const stepped = await deps.stepUp(session, input.code, ip);
        if (!stepped.ok) return stepped;
      }
      const done = await deps.settings.change({
        key: BAR_SETTING,
        action: 'content.bar',
        at,
        actor: { adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) },
        decide: (value) => {
          const locked = barOf(value);
          if (barSeen(locked) !== seen) return { kind: 'reject', reason: 'changed' };
          if (sameBar(locked, next)) return { kind: 'same' };
          return { kind: 'write', value: next, detail: { change, before: barDetail(locked), after: barDetail(next), fresh } };
        },
      });
      if (!done.ok) return fail(409, 'bar_changed');
      return ok({ change: done.written ? change : 'same' });
    },

    /**
     * «خاموش کن» (سؤال ۲۸۷): بی کد و همان لحظه، از کارت یا صفحهٔ نوار؛ متن و پیوند می‌مانند. «همان که دیده شد» نمی‌خواهد: هر نوار امروز را
     * برمی‌دارد، و نوار خاموش همان می‌ماند، بی رویداد.
     */
    async barOff(session: AdminSession, ip: string): Promise<Result<{ change: 'off' | 'same' }>> {
      if (!can(session, 'content.bar')) return fail(403, 'forbidden');
      const at = now();
      const done = await deps.settings.change({
        key: BAR_SETTING,
        action: 'content.bar',
        at,
        actor: { adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) },
        decide: (value) => {
          const locked = barOf(value);
          if (locked.mode === 'off') return { kind: 'same' };
          const next: AnnouncementBar = { ...locked, mode: 'off', from: null, until: null };
          const change = barChange({ shown: barShown(locked, at) }, { shown: false });
          return { kind: 'write', value: next, detail: { change, before: barDetail(locked), after: barDetail(next), fresh: false } };
        },
      });
      if (!done.ok) return fail(409, 'bar_changed');
      return ok({ change: done.written ? 'off' : 'same' });
    },

    /** نسخه‌های یک متن، تازه‌ترین اول، با متن پیش‌فرض ته فهرست (صفحه). */
    async versions(session: AdminSession, param: string): Promise<Result<VersionsView>> {
      const kind = guard(session, param);
      if (!kind.ok) return kind;
      const [versions, facts] = await Promise.all([store.versions(kind.value), deps.facts()]);
      return ok({ now: now(), kind: kind.value, versions, live: liveOf(kind.value, versions[0], facts) });
    },

    /** «دیدن» یک نسخه یا متن پیش‌فرض (`default`). */
    async version(session: AdminSession, param: string, versionParam: string): Promise<Result<VersionView>> {
      const kind = guard(session, param);
      if (!kind.ok) return kind;
      const which = publishFromOf(versionParam);
      if (!which || which.type === 'draft') return fail(404, 'content_not_found');
      const [versions, live, facts] = await Promise.all([store.versions(kind.value), store.live(), deps.facts()]);
      const current = liveOf(kind.value, versions[0], facts);
      const values = placeholderValues(facts);
      const address = contactAddress(live, facts);
      if (which.type === 'default') {
        return ok({ now: now(), kind: kind.value, version: null, content: defaultContent(kind.value, facts), live: current, isLive: current.isDefault, values, contactAddress: address });
      }
      const version = versions.find((row) => row.version === which.version);
      if (!version) return fail(404, 'content_not_found');
      return ok({
        now: now(),
        kind: kind.value,
        version,
        content: version.content === null ? defaultContent(kind.value, facts) : contentOf(kind.value, version.content),
        live: current,
        // نسخه‌ای که برگشت به پیش‌فرض بود همان متن پیش‌فرض است: روی سایت است هر وقت متن پیش‌فرض روی سایت باشد.
        isLive: version.content === null ? current.isDefault : versions[0]?.version === version.version,
        values,
        contactAddress: address,
      });
    },
  };
}

export type PanelContent = ReturnType<typeof createPanelContent>;
