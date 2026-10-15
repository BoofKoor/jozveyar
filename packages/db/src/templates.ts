/**
 * قالب برگه‌ها در پنل ادمین (برش ۹٫۲، ADR-057): نسخه‌های قالب بیجک و برگهٔ اول، بارگذاری نسخهٔ تازه، درخواست پیش‌نمایش از کارگر،
 * و فعال کردن یک نسخه یا برگشت به قالب پیش‌فرض.
 *
 * مثل `tariff.ts` فقط خواندن و نوشتن است؛ سنجش فایل، متن‌ها، مجوز و کد تازه در سرویس پنل (`apps/admin/lib/server/templates.ts`).
 * آنچه اینجاست همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **یک قفل:** بارگذاری و فعال کردن زیر یک قفل مشورتی؛ دو بارگذاری هم‌زمان دو شمارهٔ پشت‌سرهم می‌گیرند، و دو فعال کردن پشت‌سرهم‌اند،
 *    پس دومی فعال تازه را می‌بیند و «عوض شد» می‌گیرد، نه خطای ایندکس یکتا.
 *  - **یک تراکنش:** هر کار با رویداد ادمینش؛ و فعال شدن، خاموش شدن نسخهٔ قبل، کار برگهٔ سفارش‌های «در صف چاپ» و رویداد با هم. کار برگه‌ای
 *    که همین حالا در دست کارگر است دوباره در صف نمی‌رود: کارگر پیش از ثبت قالب‌های فعال را زیر قفل می‌سنجد و از نو می‌سازد
 *    (`services/docworker/docworker/ticket.py`).
 *  - **همان که دیده شد:** فعال کردن فقط نسخه‌ای با همان اثر انگشت متن، با همان نسخهٔ فعالی که صفحه نشان داد، و با پیش‌نمایش درستی که
 *    هنوز همان است.
 *  - تغییرناپذیری و پاک‌نشدنی بودن هر نسخه را خود پایگاه داده هم می‌سنجد (0041).
 */

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { PREPARE_TICKET_JOB, type OrderStatus } from './orders.js';
import { adminEvents, adminUsers, jobs, orders, ticketTemplates } from './schema.js';

/** کلید قفل مشورتی کارهای قالب برگه: «tktp» به عدد. */
const TEMPLATES_LOCK = 0x746b7470;

/** هدف رویدادهای قالب در `admin_events`؛ شناسهٔ هدف شناسهٔ نسخه است، یا نوع قالب برای برگشت به پیش‌فرض. */
export const TEMPLATE_TARGET = 'ticket_template';

/** کار کارگر برای پیش‌نمایش یک نسخه (`ticket.py`). */
export const PREVIEW_TICKET_TEMPLATE_JOB = 'preview_ticket_template';

export const TICKET_TEMPLATE_KINDS = ['bijak', 'first_page'] as const;
export type TicketTemplateKind = (typeof TICKET_TEMPLATE_KINDS)[number];

export interface TicketTemplateVersion {
  id: number;
  kind: TicketTemplateKind;
  version: number;
  sha256: string;
  fileName: string;
  sizeBytes: number;
  createdAt: Date;
  createdBy: string;
  isActive: boolean;
  activatedAt: Date | null;
  preview: TemplatePreview;
}

/** آخرین پیش‌نمایش یک نسخه و کار کارگرش. */
export interface TemplatePreview {
  /** کار پیش‌نمایش: نبود، در صف یا در دست کارگر، انجام شد، یا شکست (مثل سفارشی که پیدا نشد). */
  job: 'none' | 'busy' | 'done' | 'failed';
  jobError: string | null;
  at: Date | null;
  orderNumber: number | null;
  pages: number | null;
  /** PDF پیش‌نمایش و PNG صفحهٔ اولش؛ صفحهٔ n ام کنارش (`-n.png`). */
  pdfKey: string | null;
  pngKey: string | null;
  blocked: string[];
  error: string | null;
}

export interface TemplateActor {
  adminUserId: string;
  ipHash: string | null;
}

export type TemplateActivateResult =
  | { ok: true; already: boolean; previous: number | null; requeued: number }
  | { ok: false; reason: 'not_found' | 'changed' | 'no_preview' };

export interface TicketTemplateStore {
  /** همهٔ نسخه‌های هر دو نوع، تازه‌ترین اول. */
  versions(): Promise<TicketTemplateVersion[]>;
  /** متن یک نسخه، برای دانلود و اثر انگشت. */
  source(id: number): Promise<{ kind: TicketTemplateKind; version: number; fileName: string; html: string } | null>;
  /** نسخهٔ تازه؛ شماره، بعد از آخرین نسخهٔ همان نوع. */
  upload(input: { kind: TicketTemplateKind; html: string; sha256: string; fileName: string; actor: TemplateActor; at: Date }): Promise<TicketTemplateVersion>;
  /** سفارشی که مالک برای پیش‌نمایش داد: وضعیتش و اینکه فایل‌هایش پاک شده؛ null یعنی نیست. */
  previewOrder(orderNumber: number): Promise<{ status: OrderStatus; filesDeleted: boolean } | null>;
  /**
   * پیش‌نمایش با دادهٔ ساختگی (`orderNumber` null) یا یک سفارش، با رویداد در همان تراکنش؛ بار دوم همان کار دوباره در صف. کاری که در صف
   * یا در دست کارگر است `busy`: کارگر با پایانش «انجام شد» می‌نوشت و درخواست تازه گم می‌شد.
   */
  requestPreview(input: { id: number; orderNumber: number | null; actor: TemplateActor; at: Date }): Promise<'ok' | 'busy' | 'not_found'>;
  /** شمار سفارش‌های «در صف چاپ» که فعال کردن قالب برگه‌شان را از نو می‌سازد. */
  queuedOrders(): Promise<number>;
  /**
   * فعال کردن یک نسخه (`id`)، یا برگشت به قالب پیش‌فرض همان نوع (`id` null)، از همان نسخهٔ فعالی که صفحه دید (`expectedActive`).
   * فقط با پیش‌نمایشی که صفحه داد، بی خطا؛ `verify`: متن و پیش‌نمایش امروز همان که دیده شد.
   */
  activate(input: {
    kind: TicketTemplateKind;
    id: number | null;
    expectedActive: number | null;
    verify: (row: { sha256: string; previewAt: Date }) => boolean;
    actor: TemplateActor;
    at: Date;
  }): Promise<TemplateActivateResult>;
}

export function createTicketTemplateStore({ db }: Database): TicketTemplateStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const lock = (tx: Tx) => tx.execute(sql`SELECT pg_advisory_xact_lock(${TEMPLATES_LOCK})`);

  const columns = {
    id: ticketTemplates.id,
    kind: ticketTemplates.kind,
    version: ticketTemplates.version,
    sha256: ticketTemplates.sha256,
    fileName: ticketTemplates.fileName,
    sizeBytes: sql<number>`octet_length(${ticketTemplates.html})`.mapWith(Number),
    createdAt: ticketTemplates.createdAt,
    createdBy: adminUsers.displayName,
    isActive: ticketTemplates.isActive,
    activatedAt: ticketTemplates.activatedAt,
    previewAt: ticketTemplates.previewAt,
    previewOrderNumber: ticketTemplates.previewOrderNumber,
    previewPages: ticketTemplates.previewPages,
    previewPdfKey: ticketTemplates.previewPdfKey,
    previewPngKey: ticketTemplates.previewPngKey,
    previewBlocked: ticketTemplates.previewBlocked,
    previewError: ticketTemplates.previewError,
    jobStatus: jobs.status,
    jobError: jobs.lastError,
  };

  const versionOf = (row: Awaited<ReturnType<typeof selectRows>>[number]): TicketTemplateVersion => ({
    id: row.id,
    kind: row.kind,
    version: row.version,
    sha256: row.sha256,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    isActive: row.isActive,
    activatedAt: row.activatedAt,
    preview: {
      job: row.jobStatus === null ? 'none' : row.jobStatus === 'queued' || row.jobStatus === 'running' ? 'busy' : row.jobStatus,
      jobError: row.jobError,
      at: row.previewAt,
      orderNumber: row.previewOrderNumber,
      pages: row.previewPages,
      pdfKey: row.previewPdfKey,
      pngKey: row.previewPngKey,
      blocked: row.previewBlocked,
      error: row.previewError,
    },
  });

  function selectRows(executor: Pick<typeof db, 'select'>, where?: ReturnType<typeof eq>) {
    const query = executor
      .select(columns)
      .from(ticketTemplates)
      .innerJoin(adminUsers, eq(adminUsers.id, ticketTemplates.createdBy))
      .leftJoin(jobs, and(eq(jobs.ticketTemplateId, ticketTemplates.id), eq(jobs.kind, PREVIEW_TICKET_TEMPLATE_JOB)));
    return (where ? query.where(where) : query).orderBy(asc(ticketTemplates.kind), desc(ticketTemplates.version));
  }

  const event = (actor: TemplateActor, action: string, targetId: string, at: Date, detail: Record<string, unknown>) =>
    adminEventRow({ adminUserId: actor.adminUserId, action, targetType: TEMPLATE_TARGET, targetId, ipHash: actor.ipHash, detail, at });

  /**
   * سفارش‌های «در صف چاپ»: همان‌ها که قالب تازه برگه‌شان را از نو می‌سازد (فایل سفارش باز هرگز پاک نشده، `orders_files_deleted_closed`).
   * «در حال چاپ» نه: برگه‌اش شاید همین حالا چاپ شده باشد، و برگهٔ تازه جز همان داده چیزی ندارد.
   */
  const queued = eq(orders.status, 'paid');

  return {
    async versions() {
      return (await selectRows(db)).map(versionOf);
    },

    async source(id) {
      const [row] = await db
        .select({ kind: ticketTemplates.kind, version: ticketTemplates.version, fileName: ticketTemplates.fileName, html: ticketTemplates.html })
        .from(ticketTemplates)
        .where(eq(ticketTemplates.id, id));
      return row ?? null;
    },

    async upload(input) {
      return db.transaction(async (tx) => {
        await lock(tx);
        const [last] = await tx
          .select({ version: sql<number>`coalesce(max(${ticketTemplates.version}), 0)`.mapWith(Number) })
          .from(ticketTemplates)
          .where(eq(ticketTemplates.kind, input.kind));
        const [row] = await tx
          .insert(ticketTemplates)
          .values({
            kind: input.kind,
            version: (last?.version ?? 0) + 1,
            html: input.html,
            sha256: input.sha256,
            fileName: input.fileName,
            createdBy: input.actor.adminUserId,
            createdAt: input.at,
          })
          .returning({ id: ticketTemplates.id, version: ticketTemplates.version });
        await tx.insert(adminEvents).values(
          event(input.actor, 'settings.template_upload', String(row!.id), input.at, {
            kind: input.kind,
            version: row!.version,
            fileName: input.fileName,
            bytes: Buffer.byteLength(input.html),
          }),
        );
        // پیش‌نمایش با دادهٔ ساختگی همان لحظه: مالک بی کلیک دوم می‌بیند قالبش چه می‌سازد.
        await tx.insert(jobs).values({ kind: PREVIEW_TICKET_TEMPLATE_JOB, ticketTemplateId: row!.id, payload: {} });
        const [created] = await selectRows(tx, eq(ticketTemplates.id, row!.id));
        return versionOf(created!);
      });
    },

    async previewOrder(orderNumber) {
      const [row] = await db
        .select({ status: orders.status, filesDeleted: sql<boolean>`${orders.filesDeletedAt} IS NOT NULL` })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber));
      return row ?? null;
    },

    async requestPreview({ id, orderNumber, actor, at }) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select({ kind: ticketTemplates.kind, version: ticketTemplates.version })
          .from(ticketTemplates)
          .where(eq(ticketTemplates.id, id));
        if (!row) return 'not_found' as const;
        const [job] = await tx
          .select({ id: jobs.id, status: jobs.status })
          .from(jobs)
          .where(and(eq(jobs.ticketTemplateId, id), eq(jobs.kind, PREVIEW_TICKET_TEMPLATE_JOB)))
          .for('update');
        if (job && (job.status === 'queued' || job.status === 'running')) return 'busy' as const;
        const payload = orderNumber === null ? {} : { orderNumber };
        if (job) {
          // `now()` پایگاه داده، مثل `requeue` پنل: کارگر کار را با ساعت پایگاه داده برمی‌دارد.
          await tx
            .update(jobs)
            .set({
              status: 'queued',
              attempts: 0,
              payload,
              runAfter: sql`now()`,
              lockedBy: null,
              lockedUntil: null,
              lastError: null,
              finishedAt: null,
              updatedAt: sql`now()`,
            })
            .where(eq(jobs.id, job.id));
        } else {
          // نسخه همیشه با کار پیش‌نمایش ساخته می‌شود؛ این فقط برای کاری است که دستی پاک شد. دو درخواست هم‌زمان به شاخص یکتا می‌خورند.
          const inserted = await tx
            .insert(jobs)
            .values({ kind: PREVIEW_TICKET_TEMPLATE_JOB, ticketTemplateId: id, payload })
            .onConflictDoNothing()
            .returning({ id: jobs.id });
          if (inserted.length === 0) return 'busy' as const;
        }
        // پیش‌نمایش با دادهٔ سفارش نام و نشانی گیرنده را در فایلی تازه می‌گذارد؛ مثل دانلودها، رویداد دارد.
        await tx.insert(adminEvents).values(event(actor, 'settings.template_preview', String(id), at, { kind: row.kind, version: row.version, orderNumber }));
        return 'ok' as const;
      });
    },

    async queuedOrders() {
      const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(queued);
      return row?.n ?? 0;
    },

    async activate(input) {
      return db.transaction(async (tx) => {
        await lock(tx);
        const [current] = await tx
          .select({ id: ticketTemplates.id, version: ticketTemplates.version })
          .from(ticketTemplates)
          .where(and(eq(ticketTemplates.kind, input.kind), eq(ticketTemplates.isActive, true)))
          .for('update');
        const active = current?.id ?? null;
        if (active === input.id) return { ok: true, already: true, previous: current?.version ?? null, requeued: 0 } as const;
        if (active !== input.expectedActive) return { ok: false, reason: 'changed' } as const;
        if (input.id !== null) {
          const [target] = await tx
            .select({
              kind: ticketTemplates.kind,
              sha256: ticketTemplates.sha256,
              previewAt: ticketTemplates.previewAt,
              previewError: ticketTemplates.previewError,
            })
            .from(ticketTemplates)
            .where(eq(ticketTemplates.id, input.id))
            .for('update');
          if (!target || target.kind !== input.kind) return { ok: false, reason: 'not_found' } as const;
          if (!target.previewAt || target.previewError !== null) return { ok: false, reason: 'no_preview' } as const;
          if (!input.verify({ sha256: target.sha256, previewAt: target.previewAt })) return { ok: false, reason: 'changed' } as const;
        }
        if (active !== null) await tx.update(ticketTemplates).set({ isActive: false }).where(eq(ticketTemplates.id, active));
        let to: number | null = null;
        if (input.id !== null) {
          const [row] = await tx
            .update(ticketTemplates)
            .set({ isActive: true, activatedAt: sql`coalesce(${ticketTemplates.activatedAt}, ${input.at.toISOString()}::timestamptz)` })
            .where(eq(ticketTemplates.id, input.id))
            .returning({ version: ticketTemplates.version });
          to = row!.version;
        }
        // برگهٔ سفارش‌های «در صف چاپ» با قالب تازه، هم کاری که انجام شد و هم کاری که شکست خورد (شاید با قالب قبلی)؛ کار در دست کارگر
        // یا در صف خودش قالب امروز را می‌خواند.
        const requeued = await tx
          .update(jobs)
          .set({
            status: 'queued',
            attempts: 0,
            runAfter: sql`now()`,
            lockedBy: null,
            lockedUntil: null,
            lastError: null,
            finishedAt: null,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(jobs.kind, PREPARE_TICKET_JOB),
              inArray(jobs.status, ['done', 'failed']),
              inArray(jobs.orderId, tx.select({ id: orders.id }).from(orders).where(queued)),
            ),
          )
          .returning({ id: jobs.id });
        await tx.insert(adminEvents).values(
          event(input.actor, input.id === null ? 'settings.template_default' : 'settings.template_activate', input.id === null ? input.kind : String(input.id), input.at, {
            kind: input.kind,
            from: current?.version ?? null,
            to,
            requeued: requeued.length,
          }),
        );
        return { ok: true, already: false, previous: current?.version ?? null, requeued: requeued.length } as const;
      });
    },
  };
}
