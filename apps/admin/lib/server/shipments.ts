/**
 * زبانهٔ «ارسال» (برش ۶٫۱، ADR-045 و ADR-046؛ طرح `m-ship`، `m-ship-preview`، `m-ship-done` و `m-ship-revert`): بارگذاری فایل
 * پست، فهرست ورودها، پیش‌نمایش با حکم هر سطر، «ثبت»، «دور بینداز» و برگرداندن کل یک ورود.
 *
 * - **مجوز در سرور** (ADR-038): دیدن، بارگذاری، «ثبت» و «دور بینداز» با `shipments.import` (مالک و متصدی؛ چاپخانه از ۶٫۲)، و
 *   برگرداندن با `shipments.revert` (مالک). هیچ‌کدام کد تازه نمی‌خواهد: برگشت‌پذیرند و پولی جابه‌جا نمی‌کنند (ADR-046).
 * - **فایل:** نام پاکیزه (بی مسیر، بی نویسهٔ کنترلی)، ۱ بایت تا ۲ مگابایت. محتوا را کارگر می‌خواند (`read_post_file`)، نه
 *   پنل: پنل بایت‌ها را فقط نگه می‌دارد (ADR-045).
 * - **«ثبت» همان که دیده شد:** فرم اثر انگشت حکم‌هایی را دارد که ادمین دید؛ ذخیره‌گاه زیر قفل دوباره می‌سنجد، و اگر چیزی عوض
 *   شده، هیچ نمی‌نویسد (`import_changed`) و صفحه پیش‌نمایش تازه را نشان می‌دهد.
 * - **محدوده** (ADR-042): هر فراخوانی ذخیره‌گاه محدودهٔ همین نشست را دارد (`scopeOf`)؛ ورود بیرون از محدوده ۴۰۴ است.
 * - **رویداد:** `shipments.upload`، `shipments.commit`، `shipments.discard` و `shipments.revert`، با هدف همان ورود، در همان تراکنش.
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید (`ShipmentStore`)، پس با ذخیره‌گاه ساختگی تست می‌شود. تراکنش‌ها و محافظ‌ها روی پستگرس در تست
 * یکپارچگی `packages/db`.
 */

import {
  POST_FILE_MAX_BYTES,
  type AdminEventInput,
  type ShipmentImportLine,
  type ShipmentImportPage,
  type ShipmentStore,
} from '@jozveyar/db';
import { tidyInputFa } from '@jozveyar/text/input';

import { REASON_MAX } from '../orders';
import { can, ipHashOf, scopeOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

/** ورودهای هر صفحهٔ فهرست. */
export const IMPORTS_PAGE = 30;

export interface PanelShipmentsDeps {
  store: ShipmentStore;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

export interface ImportsView {
  now: Date;
  lines: ShipmentImportLine[];
  page: number;
  /** صفحهٔ بعد هست. */
  more: boolean;
}

export type ImportPageView = ShipmentImportPage & {
  now: Date;
  /** «برگرداندن این ورود» (فقط مالک). */
  canRevert: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const FINGERPRINT = /^[0-9a-f]{64}$/;

/**
 * نام فایلی که مرورگر فرستاد، برای فهرست و رویداد: بی مسیر (بعضی مرورگرها مسیر کامل می‌فرستند)، بی نویسهٔ کنترلی و جهت، فاصله‌ها
 * یکی، و حداکثر ۲۵۵ نویسه (`shipment_imports_filename`). خالی «فایل پست».
 */
export function postFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
  return [...clean].slice(0, 255).join('') || 'فایل پست';
}

export function createPanelShipments(deps: PanelShipmentsDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const event = (session: AdminSession, action: string, ip: string, at: Date): AdminEventInput => ({
    adminUserId: session.userId,
    action,
    ipHash: ipHashOf(deps.secret, ip),
    at,
  });

  return {
    /** ورودها، تازه‌ترین اول، صفحه‌به‌صفحه. */
    async list(session: AdminSession, params: { page?: string }): Promise<Result<ImportsView>> {
      if (!can(session, 'shipments.import')) return fail(403, 'forbidden');
      const page = /^\d{1,4}$/.test(params.page ?? '') && Number(params.page) >= 1 ? Number(params.page) : 1;
      const lines = await store.listImports(scopeOf(session), { limit: IMPORTS_PAGE + 1, offset: (page - 1) * IMPORTS_PAGE });
      return ok({ now: now(), lines: lines.slice(0, IMPORTS_PAGE), page, more: lines.length > IMPORTS_PAGE });
    },

    /** یک ورود با آنچه صفحه‌اش لازم دارد؛ بیرون از محدوده همان «نیست». */
    async page(session: AdminSession, idParam: string): Promise<Result<ImportPageView>> {
      if (!can(session, 'shipments.import')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      const at = now();
      const found = id ? await store.importPage(scopeOf(session), id, at) : null;
      if (!found) return fail(404, 'import_not_found');
      return ok({ ...found, now: at, canRevert: can(session, 'shipments.revert') && found.import.status === 'committed' });
    },

    /**
     * بارگذاری فایل پست: ورود «در حال خواندن» و کار کارگر. همان فایل که هنوز زنده است ورود دوم نمی‌سازد: `post_file_same` با
     * ورود قبلی، اگر در محدودهٔ همین نشست است.
     */
    async upload(session: AdminSession, file: { name: string; bytes: Buffer } | null, ip: string): Promise<Result<{ id: string }>> {
      if (!can(session, 'shipments.import')) return fail(403, 'forbidden');
      if (!file || file.bytes.length === 0) return fail(400, 'post_file_required');
      if (file.bytes.length > POST_FILE_MAX_BYTES) return fail(413, 'post_file_too_large');
      const at = now();
      const created = await store.createImport(scopeOf(session), {
        filename: postFileName(file.name),
        raw: file.bytes,
        createdBy: session.userId,
        at,
        event: event(session, 'shipments.upload', ip, at),
      });
      if (created.ok) return ok({ id: created.id });
      return fail(409, 'post_file_same', { existing: created.existing?.id ?? null });
    },

    /** «ثبت»: فقط اگر حکم‌ها زیر قفل همان است که ادمین دید (`fingerprint`). */
    async commit(session: AdminSession, idParam: string, form: { fingerprint: unknown }, ip: string): Promise<Result<{ shipments: number; handed: number[] }>> {
      if (!can(session, 'shipments.import')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'import_not_found');
      const seen = text(form.fingerprint);
      if (!FINGERPRINT.test(seen)) return fail(409, 'import_changed');
      const at = now();
      const written = await store.commit(scopeOf(session), {
        id,
        fingerprint: seen,
        at,
        adminUserId: session.userId,
        event: event(session, 'shipments.commit', ip, at),
      });
      if (written.ok) return ok({ shipments: written.shipments, handed: written.handed });
      if (written.reason === 'status') return fail(409, 'import_closed', { status: written.status });
      return written.reason === 'not_found' ? fail(404, 'import_not_found') : fail(409, 'import_changed');
    },

    /** «دور بینداز»: فقط پیش از «ثبت»؛ بایت خام و جدول‌ها همان‌جا پاک می‌شوند. */
    async discard(session: AdminSession, idParam: string, ip: string): Promise<Result<true>> {
      if (!can(session, 'shipments.import')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'import_not_found');
      const at = now();
      const written = await store.discard(scopeOf(session), { id, at, adminUserId: session.userId, event: event(session, 'shipments.discard', ip, at) });
      if (written.ok) return ok(true);
      return written.reason === 'not_found' ? fail(404, 'import_not_found') : fail(409, 'import_closed', { status: written.status });
    },

    /**
     * برگرداندن کل یک ورود ثبت‌شده (مالک، با دلیل ۱ تا ۵۰۰ نویسه، بی کد تازه): کدها کنار می‌روند و سفارش‌هایی که همین ورود
     * «تحویل پست شد» کرده بود به «در حال چاپ» برمی‌گردند (ADR-045).
     */
    async revert(
      session: AdminSession,
      idParam: string,
      form: { reason: unknown },
      ip: string,
    ): Promise<Result<{ voided: number; reopened: number[]; kept: number[] }>> {
      if (!can(session, 'shipments.revert')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'import_not_found');
      const reason = tidyInputFa(text(form.reason));
      if (!reason) return fail(400, 'reason_required');
      if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');
      const at = now();
      const written = await store.revert(scopeOf(session), {
        id,
        reason,
        at,
        adminUserId: session.userId,
        event: event(session, 'shipments.revert', ip, at),
      });
      if (written.ok) return ok({ voided: written.voided, reopened: written.reopened, kept: written.kept });
      return written.reason === 'not_found' ? fail(404, 'import_not_found') : fail(409, 'import_not_committed', { status: written.status });
    },
  };
}

export type PanelShipments = ReturnType<typeof createPanelShipments>;
