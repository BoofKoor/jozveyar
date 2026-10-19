/**
 * متن‌های سایت (برش ۱۱٫۱، ADR-065، سؤال‌های ۲۸۶ تا ۲۸۸): نسخه‌های منتشرشده و پیش‌نویس هر متن. سایت آخرین نسخهٔ هر نوع را می‌خواند (`live`)؛
 * پنل پیش‌نویس را ذخیره و منتشر می‌کند، یا نسخه‌ای قبلی یا متن پیش‌فرض را برمی‌گرداند.
 *
 * مثل `templates.ts` فقط خواندن و نوشتن است؛ شکل متن، Markdown، سنجش، مجوز و کد تازه در سرویس پنل (`apps/admin/lib/server/content.ts`) و
 * `@jozveyar/content`. آنچه اینجاست همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **یک قفل:** هر انتشار زیر یک قفل مشورتی؛ دو انتشار هم‌زمان پشت‌سرهم‌اند، پس دومی نسخهٔ تازه را می‌بیند و «عوض شد» می‌گیرد، نه خطای
 *    ایندکس یکتا.
 *  - **همان که دیده شد:** انتشار فقط از همان نسخهٔ روی سایت که صفحه نشان داد، و انتشار پیش‌نویس فقط اگر پیش‌نویس هنوز همان است که سنجیده و
 *    نشان داده شد (`verify`).
 *  - **یک تراکنش:** نسخهٔ تازه، پاک شدن پیش‌نویسی که منتشر شد، و رویداد `content.publish` با هم.
 *  - شماره‌های پشت‌سرهم، تغییرناپذیری، برگرداندن راست و «هر نسخه تغییری است» را خود پایگاه داده هم می‌سنجد (0054).
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { constraintOf } from './orders.js';
import { adminEvents, adminUsers, siteContentDrafts, siteContentKind, siteContentVersions } from './schema.js';

/** کلید قفل مشورتی انتشار متن‌ها: «cntt» به عدد. */
const CONTENT_LOCK = 0x636e7474;

/** هدف رویدادهای متن در `admin_events`؛ شناسهٔ هدف نوع متن است. */
export const CONTENT_TARGET = 'site_content';

export type SiteContentKind = (typeof siteContentKind.enumValues)[number];

export interface ContentVersionRow {
  id: number;
  kind: SiteContentKind;
  version: number;
  /** null یعنی برگشت به متن پیش‌فرض. */
  content: unknown;
  /** نسخه‌ای که برگردانده شد؛ ۰ متن پیش‌فرض، null انتشار پیش‌نویس. */
  restoredFrom: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

export interface ContentDraftRow {
  kind: SiteContentKind;
  content: unknown;
  baseVersion: number;
  updatedBy: string;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentActor {
  adminUserId: string;
  ipHash: string | null;
}

/** از کجا: پیش‌نویس (با `verify` روی متن امروزش)، یا برگرداندن نسخهٔ N (۰ یعنی متن پیش‌فرض). */
export type PublishSource = { type: 'draft'; content: unknown; verify: (draft: unknown) => boolean } | { type: 'restore'; version: number };

export type PublishOutcome =
  | { ok: true; version: number }
  | { ok: false; reason: 'stale' | 'draft_changed' | 'not_found' | 'noop' };

export interface SiteContentStore {
  /** آخرین نسخهٔ هر نوع؛ نوعی که نسخه ندارد نیست (یعنی متن پیش‌فرض). */
  live(): Promise<Partial<Record<SiteContentKind, ContentVersionRow>>>;
  /** نسخه‌های یک نوع، تازه‌ترین اول. */
  versions(kind: SiteContentKind): Promise<ContentVersionRow[]>;
  drafts(): Promise<Partial<Record<SiteContentKind, ContentDraftRow>>>;
  /**
   * پیش‌نویس تازه (با نسخهٔ امروز روی سایت به عنوان پایه)، یا همان پیش‌نویس با متن تازه؛ پایهٔ پیش‌نویسی که هست عوض نمی‌شود، تا صفحهٔ انتشار
   * بگوید اگر پس از آن نسخهٔ دیگری منتشر شده.
   */
  saveDraft(input: { kind: SiteContentKind; content: unknown; actor: ContentActor; at: Date }): Promise<ContentDraftRow>;
  /** دور انداختن پیش‌نویس؛ false یعنی نبود. */
  discardDraft(kind: SiteContentKind): Promise<boolean>;
  /** انتشار زیر قفل، از نسخهٔ روی سایتی که صفحه دید (`expectedLive`، ۰ یعنی هیچ)، با رویداد. */
  publish(input: { kind: SiteContentKind; expectedLive: number; source: PublishSource; actor: ContentActor; at: Date }): Promise<PublishOutcome>;
}

export function createSiteContentStore({ db }: Database): SiteContentStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const versionColumns = {
    id: siteContentVersions.id,
    kind: siteContentVersions.kind,
    version: siteContentVersions.version,
    content: siteContentVersions.content,
    restoredFrom: siteContentVersions.restoredFrom,
    createdBy: siteContentVersions.createdBy,
    createdByName: adminUsers.displayName,
    createdAt: siteContentVersions.createdAt,
  };
  const draftColumns = {
    kind: siteContentDrafts.kind,
    content: siteContentDrafts.content,
    baseVersion: siteContentDrafts.baseVersion,
    updatedBy: siteContentDrafts.updatedBy,
    updatedByName: adminUsers.displayName,
    createdAt: siteContentDrafts.createdAt,
    updatedAt: siteContentDrafts.updatedAt,
  };

  const versionRows = (executor: Pick<typeof db, 'select'>) =>
    executor.select(versionColumns).from(siteContentVersions).innerJoin(adminUsers, eq(adminUsers.id, siteContentVersions.createdBy));
  const draftRows = (executor: Pick<typeof db, 'select'>) =>
    executor.select(draftColumns).from(siteContentDrafts).innerJoin(adminUsers, eq(adminUsers.id, siteContentDrafts.updatedBy));

  async function liveVersion(tx: Tx, kind: SiteContentKind): Promise<{ version: number; content: unknown } | null> {
    const [row] = await tx
      .select({ version: siteContentVersions.version, content: siteContentVersions.content })
      .from(siteContentVersions)
      .where(eq(siteContentVersions.kind, kind))
      .orderBy(desc(siteContentVersions.version))
      .limit(1);
    return row ?? null;
  }

  return {
    async live() {
      const rows = await versionRows(db)
        .where(
          sql`${siteContentVersions.version} = (SELECT max(v.version) FROM ${siteContentVersions} v WHERE v.kind = ${siteContentVersions.kind})`,
        )
        .orderBy(asc(siteContentVersions.kind));
      return Object.fromEntries(rows.map((row) => [row.kind, row]));
    },

    async versions(kind) {
      return versionRows(db).where(eq(siteContentVersions.kind, kind)).orderBy(desc(siteContentVersions.version));
    },

    async drafts() {
      const rows = await draftRows(db).orderBy(asc(siteContentDrafts.kind));
      return Object.fromEntries(rows.map((row) => [row.kind, row]));
    },

    async saveDraft({ kind, content, actor, at }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${CONTENT_LOCK})`);
        const live = await liveVersion(tx, kind);
        await tx
          .insert(siteContentDrafts)
          .values({ kind, content, baseVersion: live?.version ?? 0, updatedBy: actor.adminUserId, createdAt: at, updatedAt: at })
          .onConflictDoUpdate({
            target: siteContentDrafts.kind,
            // ساعت سرور پیش از ساختن پیش‌نویس نمی‌رود (`site_content_drafts_times`).
            set: { content, updatedBy: actor.adminUserId, updatedAt: sql`greatest(${siteContentDrafts.createdAt}, ${at.toISOString()}::timestamptz)` },
          });
        const [row] = await draftRows(tx).where(eq(siteContentDrafts.kind, kind));
        return row!;
      });
    },

    async discardDraft(kind) {
      const removed = await db.delete(siteContentDrafts).where(eq(siteContentDrafts.kind, kind)).returning({ kind: siteContentDrafts.kind });
      return removed.length > 0;
    },

    async publish({ kind, expectedLive, source, actor, at }) {
      try {
        return await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${CONTENT_LOCK})`);
          const live = await liveVersion(tx, kind);
          if ((live?.version ?? 0) !== expectedLive) return { ok: false, reason: 'stale' } as const;
          let content: unknown;
          if (source.type === 'draft') {
            const [draft] = await tx
              .select({ content: siteContentDrafts.content })
              .from(siteContentDrafts)
              .where(eq(siteContentDrafts.kind, kind))
              .for('update');
            if (!draft || !source.verify(draft.content)) return { ok: false, reason: 'draft_changed' } as const;
            content = source.content;
          } else if (source.version === 0) {
            content = null;
          } else {
            const [row] = await tx
              .select({ content: siteContentVersions.content })
              .from(siteContentVersions)
              .where(and(eq(siteContentVersions.kind, kind), eq(siteContentVersions.version, source.version)));
            if (!row) return { ok: false, reason: 'not_found' } as const;
            content = row.content;
          }
          const version = (live?.version ?? 0) + 1;
          await tx.insert(siteContentVersions).values({
            kind,
            version,
            content,
            restoredFrom: source.type === 'restore' ? source.version : null,
            createdBy: actor.adminUserId,
            createdAt: at,
          });
          if (source.type === 'draft') await tx.delete(siteContentDrafts).where(eq(siteContentDrafts.kind, kind));
          await tx.insert(adminEvents).values(
            adminEventRow({
              adminUserId: actor.adminUserId,
              action: 'content.publish',
              targetType: CONTENT_TARGET,
              targetId: kind,
              ipHash: actor.ipHash,
              // بی متن (سؤال ۲۸۶): متن در خود نسخه است.
              detail: { kind, version, restored: source.type === 'restore' ? source.version : null },
              at,
            }),
          );
          return { ok: true, version } as const;
        });
      } catch (error) {
        // همان متن آخرین نسخه (`site_content_versions_noop`)؛ سرویس پیش‌تر می‌سنجد، این دیوار دوم است.
        if (constraintOf(error) === 'site_content_versions_noop') return { ok: false, reason: 'noop' };
        throw error;
      }
    },
  };
}
