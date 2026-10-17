/**
 * خروجی اکسل و PDF گزارش‌ها (برش ۱۰٫۲، ADR-061، سؤال‌های ۲۰۲ و ۲۷۷ تا ۲۸۱): گزارش تولید و گزارش ارسال (۶٫۴)، هر کدام با همان مجوز
 * صفحه‌اش و از همان نشانی، پس خروجی همان است که صفحه نشان داد.
 *
 * - **اکسل** همان لحظه، در خود درخواست: سند (`ReportDocument`) به برگه‌ها، و برگه‌ها به XLSX دست‌نویس (`xlsx.ts`)؛ رویداد پیش از پاسخ.
 * - **PDF** با کارگر (سؤال ۲۷۸): دادهٔ قالب (`pdfContext`، همه متن آماده) در ردیف `report_exports` منجمد می‌شود و کار `render_report` با
 *   همان موتور قفس‌دار قالب برگه‌ها (۹٫۲) PDF را روی همان ردیف می‌سازد؛ ردیف، کار و رویداد در یک تراکنش. صفحهٔ خروجی تا ساخته شدن خودش
 *   را تازه می‌کند.
 * - **دانلود PDF فقط برای خواهنده** و فقط با همان دسترسی امروز (مجوز با هر درخواست، ADR-038): مجوز همان گزارش، `orders.money` اگر گزارش
 *   مبلغ دارد، و همان محدوده (کاربر چاپخانه فقط خروجی محدودهٔ خودش). هر چه نخواند ۴۰۴، همان خروجی‌ای که نیست، تا شناسهٔ خروجی دیگران
 *   چیزی نگوید. ردیف پس از یک روز پاک می‌شود (`retention.py` کارگر).
 * - **رویداد** `reports.export` با نوع گزارش، قالب و زیرعنوان گزارش (بازه و چاپخانه)، زیر چیپ «گزارش‌ها» (سؤال ۲۷۹).
 */

import type { AdminEventInput, AdminPermission, ReportExportKind, ReportExportStore, ReportExportView } from '@jozveyar/db';

import { documentSheets, pdfContext } from '../reportDocument';
import { can, ipHashOf, type AdminSession } from './auth';
import type { DownloadFile } from './orders';
import type { ExportDocument, PanelProduction, ProductionParams } from './production';
import type { PanelReport } from './report';
import { fail, ok, type Result } from './result';
import { xlsxBytes, xlsxFileName } from './xlsx';

export interface PanelExportsDeps {
  store: ReportExportStore;
  /** رویداد خروجی اکسل (PDF رویدادش را با ردیف خروجی در یک تراکنش می‌نویسد). */
  events: { logEvent(event: AdminEventInput): Promise<void> };
  production: PanelProduction;
  report: PanelReport;
  /** `SESSION_SECRET`، برای HMAC نشانی IP در رویداد. */
  secret: string;
  now?: () => Date;
}

/** پارامترهای نشانی هر گزارش: گزارش تولید بازه و چاپخانه، گزارش ارسال ماه. */
export type ExportParams = ProductionParams & { month?: string };

export const REPORT_PERMISSION: Record<ReportExportKind, AdminPermission> = { production: 'reports.production', shipping: 'reports.read' };

export const isReportKind = (value: string): value is ReportExportKind => value === 'production' || value === 'shipping';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** خروجی‌ای که این نشست امروز می‌تواند ببیند: خواهنده، با همان مجوز، مبلغ و محدوده. */
export function mayOpenExport(session: AdminSession, row: Pick<ReportExportView, 'report' | 'money' | 'printPartnerId' | 'requestedBy'>): boolean {
  return (
    row.requestedBy === session.userId &&
    can(session, REPORT_PERMISSION[row.report]) &&
    (!row.money || can(session, 'orders.money')) &&
    row.printPartnerId === (session.partner?.id ?? null)
  );
}

export function createPanelExports(deps: PanelExportsDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  function documentOf(session: AdminSession, kind: ReportExportKind, params: ExportParams): Promise<Result<ExportDocument>> {
    return kind === 'production' ? deps.production.document(session, params) : deps.report.document(session, { month: params.month });
  }

  const eventOf = (session: AdminSession, kind: ReportExportKind, format: 'xlsx' | 'pdf', subtitle: string, ip: string, at: Date) => ({
    adminUserId: session.userId,
    action: 'reports.export',
    ipHash: ipHashOf(deps.secret, ip),
    detail: { report: kind, format, range: subtitle },
    at,
  });

  return {
    /** خروجی اکسل همان گزارش، با رویداد. */
    async xlsx(session: AdminSession, kind: ReportExportKind, params: ExportParams, ip: string): Promise<Result<DownloadFile>> {
      const result = await documentOf(session, kind, params);
      if (!result.ok) return result;
      const { document } = result.value;
      const at = now();
      const bytes = xlsxBytes(documentSheets(document), at);
      await deps.events.logEvent(eventOf(session, kind, 'xlsx', document.subtitle, ip, at));
      return ok({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        sizeBytes: bytes.byteLength,
        fileName: xlsxFileName(document.fileBase),
      });
    },

    /** درخواست PDF همان گزارش: ردیف خروجی، کار ساختن و رویداد با هم؛ شناسهٔ خروجی برای صفحه‌اش. */
    async requestPdf(session: AdminSession, kind: ReportExportKind, params: ExportParams, ip: string): Promise<Result<string>> {
      const result = await documentOf(session, kind, params);
      if (!result.ok) return result;
      const { document, money, printPartnerId } = result.value;
      const id = await store.create({
        report: kind,
        context: pdfContext(document),
        fileName: `${document.fileBase}.pdf`,
        money,
        printPartnerId,
        requestedBy: session.userId,
        event: eventOf(session, kind, 'pdf', document.subtitle, ip, now()),
      });
      return ok(id);
    },

    /** حال یک خروجی؛ کسی جز خواهنده با همان دسترسی، ۴۰۴. */
    async view(session: AdminSession, id: string): Promise<Result<ReportExportView>> {
      if (!UUID.test(id)) return fail(404, 'not_found');
      const row = await store.find(id);
      if (!row || !mayOpenExport(session, row)) return fail(404, 'not_found');
      return ok(row);
    },

    /** PDF ساخته‌شده، با همان دیوار `view`؛ هنوز ساخته نشده ۴۰۹. */
    async file(session: AdminSession, id: string): Promise<Result<DownloadFile>> {
      if (!UUID.test(id)) return fail(404, 'not_found');
      const row = await store.find(id);
      if (!row || !mayOpenExport(session, row)) return fail(404, 'not_found');
      const file = await store.file(id);
      if (!file || !mayOpenExport(session, file)) return fail(409, 'export_not_ready');
      const bytes = new Uint8Array(file.pdf);
      return ok({
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        sizeBytes: bytes.byteLength,
        fileName: file.fileName,
      });
    },
  };
}

export type PanelExports = ReturnType<typeof createPanelExports>;
