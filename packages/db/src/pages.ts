/**
 * صفحه‌های فرود و «تعرفه» (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۱، ۴۳۷ و ۴۶۱ تا ۴۶۶): هویت هر صفحه، پیش‌نویس، نسخه‌های پاک‌نشدنی (هر انتشار، برگرداندن
 * و برداشتن)، و نشانی‌هایی که هر صفحه یک بار گرفت. سایت حال امروز هر صفحه را از اینجا می‌خواند (`live`، `resolve`، `redirects`)، و پنل پیش‌نویس را
 * ذخیره و منتشر می‌کند، همین حالا یا زمان‌دار، و برمی‌دارد.
 *
 * مثل `content.ts` فقط خواندن و نوشتن است؛ شکل متن، سنجش، مجوز و کد تازه در سرویس پنل (`apps/admin/lib/server/pages.ts`) و `@jozveyar/content`.
 * آنچه اینجاست همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **یک قفل:** هر نوشتن زیر یک قفل مشورتی؛ دو انتشار هم‌زمان پشت هم‌اند و دومی نسخهٔ تازه را می‌بیند و «عوض شد» می‌گیرد.
 *  - **همان که دیده شد:** هر کار فقط از آخرین نسخه‌ای که صفحه نشان داد (`expectedVersion`)، و انتشار پیش‌نویس فقط اگر پیش‌نویس هنوز همان است.
 *  - **یک تراکنش:** نشانی، نسخهٔ تازه، پیش‌نویسی که منتشر شد، و رویداد `content.page_*` با هم.
 *  - حال روی سایت در هر لحظه یک جواب دارد: آخرین نسخه‌ای که `live_from`ش رسیده و پس گرفته نشده (0064 بیش از یک زمان‌دار را نمی‌پذیرد).
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { constraintOf } from './orders.js';
import { adminEvents, adminUsers, sitePageDrafts, sitePageKind, sitePageRemoval, sitePages, sitePageSlugs, sitePageVersions } from './schema.js';

/** کلید قفل مشورتی نوشتن صفحه‌ها: «page» به عدد. */
const PAGES_LOCK = 0x70616765;

/** هدف رویدادهای صفحه‌ها در `admin_events`؛ شناسهٔ هدف شمارهٔ صفحه است. */
export const PAGE_TARGET = 'site_page';

/** نشانی ثابت «تعرفه»، همان `TARIFF_SLUG` در `@jozveyar/content`. */
export const TARIFF_PAGE_SLUG = 'tarefe';

/** بیشترین پرش ۳۰۱ پشت‌سرهم، پیش از صفحهٔ اصلی. */
const MAX_HOPS = 5;

export type SitePageKind = (typeof sitePageKind.enumValues)[number];
export type SitePageRemoval = (typeof sitePageRemoval.enumValues)[number];

export interface SitePageVersionRow {
  id: number;
  pageId: number;
  version: number;
  slug: string;
  /** null یعنی برداشتن، یا متن پیش‌فرض «تعرفه». */
  content: unknown;
  restoredFrom: number | null;
  removal: SitePageRemoval | null;
  movedTo: number | null;
  liveFrom: Date;
  withdrawnAt: Date | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export interface SitePageDraftRow {
  pageId: number;
  content: unknown;
  baseVersion: number;
  updatedBy: string;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SitePageRow {
  id: number;
  kind: SitePageKind;
  createdAt: Date;
}

/** یک صفحه با همه‌چیزش: نسخه‌ها (تازه‌ترین اول)، پیش‌نویس و نشانی‌هایش. */
export interface SitePageDetail {
  page: SitePageRow;
  versions: SitePageVersionRow[];
  draft: SitePageDraftRow | null;
  /** همهٔ نشانی‌هایی که این صفحه یک بار گرفت، کهنه‌ترین اول. */
  slugs: string[];
}

/** حال یک صفحه در یک لحظه. */
export interface PageState {
  /** نسخه‌ای که همین حالا تعیین می‌کند (متن، برداشتن، یا متن پیش‌فرض)؛ null یعنی هرگز روی سایت نرفته. */
  live: SitePageVersionRow | null;
  /** زمان‌داری که هنوز نرسیده. */
  pending: SitePageVersionRow | null;
  /** آخرین شمارهٔ نسخه، پس‌گرفته هم؛ «همان که دیده شد» هر کار. */
  latest: number;
}

/** حال یک صفحه در لحظهٔ `at`، از نسخه‌هایش (تازه‌ترین اول). */
export function pageStateAt(versions: readonly SitePageVersionRow[], at: Date): PageState {
  const active = versions.filter((row) => row.withdrawnAt === null);
  return {
    live: active.find((row) => row.liveFrom <= at) ?? null,
    pending: active.find((row) => row.liveFrom > at) ?? null,
    latest: versions.reduce((max, row) => Math.max(max, row.version), 0),
  };
}

/** صفحه‌ای که همین حالا با متن روی سایت است. */
export interface LivePage {
  pageId: number;
  kind: SitePageKind;
  slug: string;
  content: unknown;
  version: number;
  /** از کی همین نسخه روی سایت است: «آخرین تغییر» نقشهٔ سایت. */
  since: Date;
}

/** جواب سایت برای `/<نشانی>`. */
export type SlugResolution =
  | { kind: 'page'; page: LivePage }
  | { kind: 'redirect'; to: string }
  | { kind: 'gone' }
  | { kind: 'none' };

export interface PageActor {
  adminUserId: string;
  ipHash: string | null;
}

/** از کجا منتشر می‌شود: پیش‌نویس (با `verify` روی متن امروزش)، برگرداندن نسخهٔ N، یا متن پیش‌فرض «تعرفه». */
export type PagePublishSource =
  | { type: 'draft'; content: unknown; slug: string; verify: (draft: unknown) => boolean }
  | { type: 'restore'; version: number }
  | { type: 'default' };

export type PageWriteOutcome =
  | { ok: true; version: number }
  | { ok: false; reason: 'stale' | 'draft_changed' | 'not_found' | 'noop' | 'slug_taken' | 'pending' | 'not_live' | 'live' };

export interface SitePageStore {
  /** همهٔ صفحه‌ها با نسخه‌ها و پیش‌نویسشان؛ فهرست پنل و سنجش پیوندها. */
  all(): Promise<SitePageDetail[]>;
  detail(id: number): Promise<SitePageDetail | null>;
  /** «تعرفه»، اگر هرگز ذخیره شده. */
  tariff(): Promise<SitePageDetail | null>;
  /** صفحه‌هایی که در لحظهٔ `at` با متن روی سایت‌اند (فرود و «تعرفه»)، به ترتیب شمارهٔ صفحه. */
  live(at: Date): Promise<LivePage[]>;
  /** جواب سایت برای یک نشانی صفحهٔ فرود در لحظهٔ `at`. */
  resolve(slug: string, at: Date): Promise<SlugResolution>;
  /** هر نشانی‌ای که امروز ۳۰۱ است، به مقصدش. */
  redirects(at: Date): Promise<Map<string, string>>;
  /** صفحه‌ای که این نشانی مال اوست. */
  slugOwner(slug: string): Promise<number | null>;
  /** پیش‌نویس تازه یا همان پیش‌نویس با متن تازه؛ بی `pageId` صفحهٔ فرود تازه، و «تعرفه» با اولین ذخیره ساخته می‌شود. */
  saveDraft(input: { pageId: number | null; kind: SitePageKind; content: unknown; actor: PageActor; at: Date }): Promise<{ pageId: number; draft: SitePageDraftRow }>;
  /** دور انداختن پیش‌نویس؛ صفحه‌ای که هرگز نسخه‌ای نداشت هم پاک می‌شود. */
  discardDraft(pageId: number): Promise<{ discarded: boolean; deleted: boolean }>;
  /** انتشار، همین حالا (`liveFrom` = `at`) یا زمان‌دار، زیر قفل، از آخرین نسخه‌ای که صفحه دید. */
  publish(input: { pageId: number; expectedVersion: number; source: PagePublishSource; liveFrom: Date; actor: PageActor; at: Date }): Promise<PageWriteOutcome>;
  /** پس گرفتن زمان‌دار، بی کد؛ متنش اگر پیش‌نویسی نیست پیش‌نویس می‌شود. */
  withdraw(input: { pageId: number; version: number; actor: PageActor; at: Date }): Promise<PageWriteOutcome>;
  /** برداشتن صفحه‌ای که همین حالا روی سایت است: «پیدا نشد» یا «به صفحهٔ دیگری» (null یعنی صفحهٔ اصلی). */
  remove(input: { pageId: number; expectedVersion: number; mode: SitePageRemoval; movedTo: number | null; actor: PageActor; at: Date }): Promise<PageWriteOutcome>;
}

export function createSitePageStore({ db }: Database): SitePageStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const versionColumns = {
    id: sitePageVersions.id,
    pageId: sitePageVersions.pageId,
    version: sitePageVersions.version,
    slug: sitePageVersions.slug,
    content: sitePageVersions.content,
    restoredFrom: sitePageVersions.restoredFrom,
    removal: sitePageVersions.removal,
    movedTo: sitePageVersions.movedTo,
    liveFrom: sitePageVersions.liveFrom,
    withdrawnAt: sitePageVersions.withdrawnAt,
    createdBy: sitePageVersions.createdBy,
    createdByName: adminUsers.displayName,
    createdAt: sitePageVersions.createdAt,
  };
  const draftColumns = {
    pageId: sitePageDrafts.pageId,
    content: sitePageDrafts.content,
    baseVersion: sitePageDrafts.baseVersion,
    updatedBy: sitePageDrafts.updatedBy,
    updatedByName: adminUsers.displayName,
    createdAt: sitePageDrafts.createdAt,
    updatedAt: sitePageDrafts.updatedAt,
  };

  const versionRows = (executor: Pick<typeof db, 'select'>) =>
    executor.select(versionColumns).from(sitePageVersions).innerJoin(adminUsers, eq(adminUsers.id, sitePageVersions.createdBy));
  const draftRows = (executor: Pick<typeof db, 'select'>) =>
    executor.select(draftColumns).from(sitePageDrafts).innerJoin(adminUsers, eq(adminUsers.id, sitePageDrafts.updatedBy));

  async function details(executor: Pick<typeof db, 'select'>, ids: number[] | null): Promise<SitePageDetail[]> {
    const pages = await executor
      .select({ id: sitePages.id, kind: sitePages.kind, createdAt: sitePages.createdAt })
      .from(sitePages)
      .where(ids === null ? undefined : ids.length > 0 ? inArray(sitePages.id, ids) : sql`false`)
      .orderBy(asc(sitePages.id));
    if (pages.length === 0) return [];
    const pageIds = pages.map((page) => page.id);
    const [versions, drafts, slugs] = await Promise.all([
      versionRows(executor).where(inArray(sitePageVersions.pageId, pageIds)).orderBy(asc(sitePageVersions.pageId), desc(sitePageVersions.version)),
      draftRows(executor).where(inArray(sitePageDrafts.pageId, pageIds)),
      executor
        .select({ slug: sitePageSlugs.slug, pageId: sitePageSlugs.pageId })
        .from(sitePageSlugs)
        .where(inArray(sitePageSlugs.pageId, pageIds))
        .orderBy(asc(sitePageSlugs.createdAt), asc(sitePageSlugs.slug)),
    ]);
    return pages.map((page) => ({
      page,
      versions: versions.filter((row) => row.pageId === page.id),
      draft: drafts.find((row) => row.pageId === page.id) ?? null,
      slugs: slugs.filter((row) => row.pageId === page.id).map((row) => row.slug),
    }));
  }

  /** نشانی امروز یک صفحه برای ۳۰۱: صفحهٔ با متن نشانی خودش؛ برداشته‌ای که به جای دیگری رفت، همان‌جا؛ بقیه صفحهٔ اصلی. */
  function targetOf(pageId: number | null, all: ReadonlyMap<number, SitePageDetail>, at: Date, hops = 0): string | null {
    if (pageId === null || hops > MAX_HOPS) return '/';
    const detail = all.get(pageId);
    if (!detail) return '/';
    const { live } = pageStateAt(detail.versions, at);
    if (!live) return null;
    if (live.content !== null || detail.page.kind === 'tariff') return `/${live.slug}`;
    if (live.removal === 'moved') return targetOf(live.movedTo, all, at, hops + 1);
    return null;
  }

  async function resolveIn(slug: string, at: Date, all?: SitePageDetail[]): Promise<SlugResolution> {
    const pages = all ?? (await details(db, null));
    const byId = new Map(pages.map((detail) => [detail.page.id, detail]));
    const owner = pages.find((detail) => detail.slugs.includes(slug));
    if (!owner) return { kind: 'none' };
    const { live } = pageStateAt(owner.versions, at);
    if (!live) return { kind: 'none' };
    if (live.content !== null) {
      if (live.slug === slug) {
        return { kind: 'page', page: { pageId: owner.page.id, kind: owner.page.kind, slug, content: live.content, version: live.version, since: live.liveFrom } };
      }
      return { kind: 'redirect', to: `/${live.slug}` };
    }
    if (live.removal === 'moved') {
      const to = targetOf(live.movedTo, byId, at);
      return to ? { kind: 'redirect', to } : { kind: 'gone' };
    }
    return { kind: 'gone' };
  }

  /** آخرین شمارهٔ نسخهٔ صفحه زیر قفل؛ null یعنی صفحه نیست. */
  async function lockedLatest(tx: Tx, pageId: number): Promise<{ kind: SitePageKind; latest: number } | null> {
    const [page] = await tx.select({ kind: sitePages.kind }).from(sitePages).where(eq(sitePages.id, pageId)).for('update');
    if (!page) return null;
    const [row] = await tx
      .select({ version: sitePageVersions.version })
      .from(sitePageVersions)
      .where(eq(sitePageVersions.pageId, pageId))
      .orderBy(desc(sitePageVersions.version))
      .limit(1);
    return { kind: page.kind, latest: row?.version ?? 0 };
  }

  async function versionsOf(tx: Tx, pageId: number): Promise<SitePageVersionRow[]> {
    return versionRows(tx).where(eq(sitePageVersions.pageId, pageId)).orderBy(desc(sitePageVersions.version));
  }

  const event = (tx: Tx, actor: PageActor, at: Date, action: string, pageId: number, detail: Record<string, unknown>) =>
    tx.insert(adminEvents).values(
      adminEventRow({ adminUserId: actor.adminUserId, action, targetType: PAGE_TARGET, targetId: String(pageId), ipHash: actor.ipHash, detail, at }),
    );

  /** محافظی که سرویس پیش‌تر می‌سنجد، دیوار دوم است: نامش به همان جواب. */
  const REASONS: Readonly<Record<string, Extract<PageWriteOutcome, { ok: false }>['reason']>> = {
    site_page_versions_noop: 'noop',
    site_page_versions_one_pending: 'pending',
    site_page_versions_removal: 'not_live',
    site_page_versions_withdraw_live: 'live',
    site_page_versions_withdraw_once: 'stale',
    site_page_slugs_pkey: 'slug_taken',
  };
  async function guarded(run: () => Promise<PageWriteOutcome>): Promise<PageWriteOutcome> {
    try {
      return await run();
    } catch (error) {
      const reason = REASONS[constraintOf(error) ?? ''];
      if (reason) return { ok: false, reason };
      throw error;
    }
  }

  return {
    all: () => details(db, null),

    async detail(id) {
      const [found] = await details(db, [id]);
      return found ?? null;
    },

    async tariff() {
      const [page] = await db.select({ id: sitePages.id }).from(sitePages).where(eq(sitePages.kind, 'tariff')).limit(1);
      if (!page) return null;
      const [found] = await details(db, [page.id]);
      return found ?? null;
    },

    async live(at) {
      const pages = await details(db, null);
      return pages.flatMap((detail): LivePage[] => {
        const { live } = pageStateAt(detail.versions, at);
        if (!live || live.content === null) return [];
        return [{ pageId: detail.page.id, kind: detail.page.kind, slug: live.slug, content: live.content, version: live.version, since: live.liveFrom }];
      });
    },

    resolve: (slug, at) => resolveIn(slug, at),

    async redirects(at) {
      const pages = await details(db, null);
      const map = new Map<string, string>();
      for (const detail of pages) {
        for (const slug of detail.slugs) {
          const found = await resolveIn(slug, at, pages);
          if (found.kind === 'redirect') map.set(slug, found.to);
        }
      }
      return map;
    },

    async slugOwner(slug) {
      const [row] = await db.select({ pageId: sitePageSlugs.pageId }).from(sitePageSlugs).where(eq(sitePageSlugs.slug, slug));
      return row?.pageId ?? null;
    },

    async saveDraft({ pageId, kind, content, actor, at }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${PAGES_LOCK})`);
        let id = pageId;
        if (id === null && kind === 'tariff') {
          const [existing] = await tx.select({ id: sitePages.id }).from(sitePages).where(eq(sitePages.kind, 'tariff'));
          id = existing?.id ?? null;
        }
        if (id === null) {
          const [created] = await tx.insert(sitePages).values({ kind, createdBy: actor.adminUserId, createdAt: at }).returning({ id: sitePages.id });
          id = created!.id;
        }
        const [latest] = await tx
          .select({ version: sitePageVersions.version })
          .from(sitePageVersions)
          .where(eq(sitePageVersions.pageId, id))
          .orderBy(desc(sitePageVersions.version))
          .limit(1);
        await tx
          .insert(sitePageDrafts)
          .values({ pageId: id, content, baseVersion: latest?.version ?? 0, updatedBy: actor.adminUserId, createdAt: at, updatedAt: at })
          .onConflictDoUpdate({
            target: sitePageDrafts.pageId,
            // ساعت سرور پیش از ساختن پیش‌نویس نمی‌رود (`site_page_drafts_times`).
            set: { content, updatedBy: actor.adminUserId, updatedAt: sql`greatest(${sitePageDrafts.createdAt}, ${at.toISOString()}::timestamptz)` },
          });
        const [row] = await draftRows(tx).where(eq(sitePageDrafts.pageId, id));
        return { pageId: id, draft: row! };
      });
    },

    async discardDraft(pageId) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${PAGES_LOCK})`);
        const removed = await tx.delete(sitePageDrafts).where(eq(sitePageDrafts.pageId, pageId)).returning({ pageId: sitePageDrafts.pageId });
        const [version] = await tx.select({ id: sitePageVersions.id }).from(sitePageVersions).where(eq(sitePageVersions.pageId, pageId)).limit(1);
        let deleted = false;
        if (!version) {
          const gone = await tx.delete(sitePages).where(eq(sitePages.id, pageId)).returning({ id: sitePages.id });
          deleted = gone.length > 0;
        }
        return { discarded: removed.length > 0, deleted };
      });
    },

    publish({ pageId, expectedVersion, source, liveFrom, actor, at }) {
      return guarded(() =>
        db.transaction(async (tx): Promise<PageWriteOutcome> => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${PAGES_LOCK})`);
          const locked = await lockedLatest(tx, pageId);
          if (!locked) return { ok: false, reason: 'not_found' };
          if (locked.latest !== expectedVersion) return { ok: false, reason: 'stale' };
          const versions = await versionsOf(tx, pageId);
          if (pageStateAt(versions, at).pending) return { ok: false, reason: 'pending' };

          let content: unknown;
          let slug: string;
          let restoredFrom: number | null = null;
          if (source.type === 'draft') {
            const [draft] = await tx.select({ content: sitePageDrafts.content }).from(sitePageDrafts).where(eq(sitePageDrafts.pageId, pageId)).for('update');
            if (!draft || !source.verify(draft.content)) return { ok: false, reason: 'draft_changed' };
            content = source.content;
            slug = locked.kind === 'tariff' ? TARIFF_PAGE_SLUG : source.slug;
          } else if (source.type === 'default') {
            if (locked.kind !== 'tariff') return { ok: false, reason: 'not_found' };
            content = null;
            slug = TARIFF_PAGE_SLUG;
            restoredFrom = 0;
          } else {
            const row = versions.find((version) => version.version === source.version);
            if (!row || row.content === null) return { ok: false, reason: 'not_found' };
            content = row.content;
            slug = row.slug;
            restoredFrom = source.version;
          }

          if (locked.kind === 'landing') {
            await tx.insert(sitePageSlugs).values({ slug, pageId, createdAt: at }).onConflictDoNothing();
            const [owner] = await tx.select({ pageId: sitePageSlugs.pageId }).from(sitePageSlugs).where(eq(sitePageSlugs.slug, slug));
            if (owner?.pageId !== pageId) return { ok: false, reason: 'slug_taken' };
          }

          const version = locked.latest + 1;
          const previous = pageStateAt(versions, at).live;
          await tx.insert(sitePageVersions).values({
            pageId,
            version,
            slug,
            content,
            restoredFrom,
            liveFrom,
            createdBy: actor.adminUserId,
            createdAt: at,
          });
          if (source.type === 'draft') await tx.delete(sitePageDrafts).where(eq(sitePageDrafts.pageId, pageId));
          // بی متن (سؤال ۴۳۷): متن در خود نسخه است.
          await event(tx, actor, at, 'content.page_publish', pageId, {
            page: pageId,
            kind: locked.kind,
            slug,
            version,
            restored: restoredFrom,
            scheduled: liveFrom > at ? liveFrom.toISOString() : null,
            ...(previous && previous.slug !== slug ? { from: previous.slug } : {}),
          });
          return { ok: true, version };
        }),
      );
    },

    withdraw({ pageId, version, actor, at }) {
      return guarded(() =>
        db.transaction(async (tx): Promise<PageWriteOutcome> => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${PAGES_LOCK})`);
          const locked = await lockedLatest(tx, pageId);
          if (!locked) return { ok: false, reason: 'not_found' };
          const versions = await versionsOf(tx, pageId);
          const row = versions.find((candidate) => candidate.version === version);
          if (!row) return { ok: false, reason: 'not_found' };
          if (row.withdrawnAt !== null) return { ok: false, reason: 'stale' };
          if (row.liveFrom <= at) return { ok: false, reason: 'live' };
          await tx
            .update(sitePageVersions)
            .set({ withdrawnAt: at, withdrawnBy: actor.adminUserId })
            .where(and(eq(sitePageVersions.pageId, pageId), eq(sitePageVersions.version, version)));
          // پیش‌نویس می‌ماند (سؤال ۴۶۵): متن زمان‌دار پیش‌نویس می‌شود، مگر پیش‌نویس تازه‌تری هست.
          if (row.content !== null) {
            await tx
              .insert(sitePageDrafts)
              .values({ pageId, content: row.content, baseVersion: version, updatedBy: actor.adminUserId, createdAt: at, updatedAt: at })
              .onConflictDoNothing();
          }
          await event(tx, actor, at, 'content.page_withdraw', pageId, { page: pageId, version, slug: row.slug, scheduled: row.liveFrom.toISOString() });
          return { ok: true, version };
        }),
      );
    },

    remove({ pageId, expectedVersion, mode, movedTo, actor, at }) {
      return guarded(() =>
        db.transaction(async (tx): Promise<PageWriteOutcome> => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${PAGES_LOCK})`);
          const locked = await lockedLatest(tx, pageId);
          if (!locked || locked.kind !== 'landing') return { ok: false, reason: 'not_found' };
          if (locked.latest !== expectedVersion) return { ok: false, reason: 'stale' };
          const versions = await versionsOf(tx, pageId);
          const state = pageStateAt(versions, at);
          if (state.pending) return { ok: false, reason: 'pending' };
          if (!state.live || state.live.content === null) return { ok: false, reason: 'not_live' };
          const version = locked.latest + 1;
          await tx.insert(sitePageVersions).values({
            pageId,
            version,
            slug: state.live.slug,
            content: null,
            removal: mode,
            movedTo: mode === 'moved' ? movedTo : null,
            liveFrom: at,
            createdBy: actor.adminUserId,
            createdAt: at,
          });
          await event(tx, actor, at, 'content.page_remove', pageId, {
            page: pageId,
            version,
            slug: state.live.slug,
            mode,
            to: mode === 'moved' ? movedTo : null,
          });
          return { ok: true, version };
        }),
      );
    },
  };
}
