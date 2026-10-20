/**
 * خروجی PDF گزارش‌ها در پایگاه داده (برش ۱۰٫۲، ADR-061، سؤال ۲۰۲): درخواست، کار ساختن و رویدادش در یک تراکنش، و خواندن حال و فایل.
 *
 * پنل گزارش را همان‌طور که نشان داد (`context`، متن آماده) می‌نشاند و کار `render_report` را در صف می‌گذارد؛ کارگر با همان موتور قالب
 * برگه‌ها (۹٫۲، در قفس) PDF را می‌سازد و روی همین ردیف می‌نویسد، یا خطا را. ردیف پس از یک روز پاک می‌شود (`retention.py` کارگر).
 * گزارش منجمد است و نتیجه یک بار نوشته می‌شود (تریگر `report_exports_guard`، 0046).
 */

import { eq, sql } from 'drizzle-orm';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { adminEvents, jobs, reportExports } from './schema.js';

/** کار کارگر برای ساختن PDF یک خروجی. */
export const RENDER_REPORT_JOB = 'render_report';

/** گزارش‌هایی که خروجی PDF دارند. */
export type ReportExportKind = 'production' | 'shipping' | 'settlement';

/** حال یک خروجی، بی بایت‌های PDF. */
export interface ReportExportView {
  id: string;
  report: ReportExportKind;
  fileName: string;
  /** زیرعنوان گزارش (بازه و چاپخانه، یا ماه) از دادهٔ منجمد، برای صفحهٔ خروجی. */
  subtitle: string | null;
  /** گزارش مبلغ دارد؛ دانلودش `orders.money` امروز را می‌خواهد. */
  money: boolean;
  /** محدودهٔ خواهنده: چاپخانهٔ کاربر چاپخانه، یا null برای همهٔ سفارش‌ها. */
  printPartnerId: string | null;
  requestedBy: string;
  requestedAt: Date;
  /** در حال ساختن، ساخته، یا ساخته نشد. */
  state: 'building' | 'ready' | 'failed';
  finishedAt: Date | null;
  pages: number | null;
  sizeBytes: number | null;
  error: string | null;
  /** آخرین خطای کار ساختن، وقتی هنوز دوباره امتحان می‌شود (شکست گذرا). */
  retryError: string | null;
}

export interface ReportExportStore {
  /** خروجی تازه، کار ساختنش و رویدادش (`event`، بی هدف: هدفش همین خروجی است)، با هم یا هیچ. شناسهٔ خروجی. */
  create(input: {
    report: ReportExportKind;
    context: Record<string, unknown>;
    fileName: string;
    money: boolean;
    printPartnerId: string | null;
    requestedBy: string;
    event: Omit<AdminEventInput, 'targetType' | 'targetId'>;
  }): Promise<string>;
  /** null یعنی نیست (یا پاک شده). */
  find(id: string): Promise<ReportExportView | null>;
  /** PDF ساخته‌شده، با همان دسترسی‌ای که `find` می‌دهد؛ null یعنی نیست یا هنوز ساخته نشده. */
  file(id: string): Promise<(Pick<ReportExportView, 'report' | 'fileName' | 'money' | 'printPartnerId' | 'requestedBy'> & { pdf: Buffer }) | null>;
}

export function createReportExportStore({ db }: Database): ReportExportStore {
  return {
    async create({ report, context, fileName, money, printPartnerId, requestedBy, event }) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(reportExports)
          .values({ report, context, fileName, money, printPartnerId, requestedBy })
          .returning({ id: reportExports.id });
        await tx.insert(jobs).values({ kind: RENDER_REPORT_JOB, reportExportId: row!.id, payload: {} });
        await tx.insert(adminEvents).values(adminEventRow({ ...event, targetType: 'report_export', targetId: row!.id }));
        return row!.id;
      });
    },

    async find(id) {
      const [row] = await db
        .select({
          id: reportExports.id,
          report: reportExports.report,
          fileName: reportExports.fileName,
          subtitle: sql<string | null>`${reportExports.context} ->> 'subtitle'`,
          money: reportExports.money,
          printPartnerId: reportExports.printPartnerId,
          requestedBy: reportExports.requestedBy,
          requestedAt: reportExports.requestedAt,
          finishedAt: reportExports.finishedAt,
          pages: reportExports.pages,
          sizeBytes: sql<number | null>`octet_length(${reportExports.pdf})`,
          error: reportExports.error,
          // نام کامل ستون‌ها: drizzle در کوئری تک‌جدولی نام جدول را نمی‌نویسد، و «id» درون زیرکوئری شناسهٔ خود کار می‌شد.
          retryError: sql<string | null>`(SELECT j.last_error FROM jobs j WHERE j.report_export_id = report_exports.id AND j.status = 'queued' LIMIT 1)`,
        })
        .from(reportExports)
        .where(eq(reportExports.id, id))
        .limit(1);
      if (!row) return null;
      return {
        ...row,
        report: row.report as ReportExportKind,
        state: row.finishedAt === null ? 'building' : row.error === null ? 'ready' : 'failed',
        sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
      };
    },

    async file(id) {
      const [row] = await db
        .select({
          pdf: reportExports.pdf,
          report: reportExports.report,
          fileName: reportExports.fileName,
          money: reportExports.money,
          printPartnerId: reportExports.printPartnerId,
          requestedBy: reportExports.requestedBy,
        })
        .from(reportExports)
        .where(eq(reportExports.id, id))
        .limit(1);
      return row?.pdf ? { ...row, pdf: row.pdf, report: row.report as ReportExportKind } : null;
    },
  };
}
