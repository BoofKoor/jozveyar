/**
 * زبانهٔ «ارسال» (برش ۶٫۱ و ۶٫۲، ADR-045 و ADR-046؛ طرح `m-ship`، `m-ship-preview`، `m-ship-done`، `m-ship-revert` و
 * `m-ship-review`): بارگذاری فایل پست، فهرست ورودها، پیش‌نمایش با حکم هر سطر، «ثبت»، «دور بینداز» و برگرداندن کل یک ورود؛ و از
 * ۶٫۲ صف تأیید («همین است» و «هیچ‌کدام»)، دادن دستی یک سطر به سفارشی با شماره‌اش، و کنار گذاشتن یک کد رهگیری.
 *
 * - **مجوز در سرور** (ADR-038): دیدن، بارگذاری، «ثبت» و «دور بینداز» با `shipments.import` (مالک، متصدی، و از ۶٫۲ چاپخانه در
 *   محدودهٔ خودش)؛ صف تأیید و دادن دستی با `shipments.review` (مالک و متصدی)؛ برگرداندن ورود و کنار گذاشتن یک کد با
 *   `shipments.revert` (مالک). هیچ‌کدام کد تازه نمی‌خواهد: برگشت‌پذیرند و پولی جابه‌جا نمی‌کنند (ADR-046).
 * - **فایل:** نام پاکیزه (بی مسیر، بی نویسهٔ کنترلی)، ۱ بایت تا ۲ مگابایت. محتوا را کارگر می‌خواند (`read_post_file`)، نه
 *   پنل: پنل بایت‌ها را فقط نگه می‌دارد (ADR-045).
 * - **«ثبت» همان که دیده شد:** فرم اثر انگشت حکم‌هایی را دارد که ادمین دید؛ ذخیره‌گاه زیر قفل دوباره می‌سنجد، و اگر چیزی عوض
 *   شده، هیچ نمی‌نویسد (`import_changed`) و صفحه پیش‌نمایش تازه را نشان می‌دهد. «همین است» و دادن دستی هم از همان که ادمین از
 *   سفارش دید (وضعیت و شمار کد زنده، در خود فرم)؛ عوض شده یعنی `shipment_order_changed`.
 * - **بی مبلغ** (تصمیم ۸۱): نشستی که `orders.money` ندارد (چاپخانه) کرایه، مالیات و خانه‌های خام فایل را از سرویس نمی‌گیرد
 *   (`withoutFares`)؛ جمع فایل برایش فقط بسته و وزن است.
 * - **محدوده** (ADR-042): هر فراخوانی ذخیره‌گاه محدودهٔ همین نشست را دارد (`scopeOf`)؛ ورود بیرون از محدوده ۴۰۴ است.
 * - **رویداد:** `shipments.upload`، `shipments.commit`، `shipments.discard` و `shipments.revert` با هدف همان ورود؛ از ۶٫۲
 *   `shipments.dismiss` با هدف ورود، و `shipments.approve`، `shipments.assign` و `shipments.void` با هدف سفارش (تصمیم ۸۷)؛ همه در
 *   همان تراکنش.
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید (`ShipmentStore`)، پس با ذخیره‌گاه ساختگی تست می‌شود. تراکنش‌ها و محافظ‌ها روی پستگرس در تست
 * یکپارچگی `packages/db`.
 */

import {
  FIRST_ORDER_NUMBER,
  POST_FILE_MAX_BYTES,
  blockOf,
  criteriaOf,
  scoreOf,
  storedCandidateRow,
  type AdminEventInput,
  type CandidateBlock,
  type Criteria,
  type OrderStatus,
  type ReviewDecision,
  type ReviewRow,
  type ReviewWrite,
  type ShipmentImportLine,
  type ShipmentImportPage,
  type ShipmentOrderFacts,
  type ShipmentStore,
  type VoidKept,
} from '@jozveyar/db';
import { toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import { REASON_MAX, pageOf } from '../orders';
import { rowWithoutFares, withoutFares } from '../shipments';
import { can, ipHashOf, scopeOf, type AdminSession } from './auth';
import { fail, ok, type AdminErrorCode, type Result } from './result';

/** ورودهای هر صفحهٔ فهرست. */
export const IMPORTS_PAGE = 30;
/** سطرهای هر صفحهٔ صف تأیید. */
export const REVIEW_PAGE = 20;

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
  /** سطرهای صف تأیید، فقط با `shipments.review` (۶٫۲)؛ بقیه ۰. */
  queued: number;
}

export type ImportPageView = ShipmentImportPage & {
  now: Date;
  /** «برگرداندن این ورود» (فقط مالک). */
  canRevert: boolean;
  /** صف تأیید و «به سفارشی بده» (۶٫۲، مالک و متصدی)؛ نامزدها هم فقط با همین. */
  canReview: boolean;
  /** کرایه و مالیات (`orders.money`)؛ بی آن، صفحه بی مبلغ از سرویس بیرون می‌آید (تصمیم ۸۱). */
  money: boolean;
};

export interface ReviewQueueView {
  now: Date;
  rows: ReviewRow[];
  total: number;
  page: number;
  pages: number;
  money: boolean;
}

/** سفارشی که برای دادن دستی با شماره‌اش آمد (قدم دوم، تصمیم ۸۳)، با معیارها و دروازه‌هایش؛ یا شماره‌ای که پیدا نشد. */
export type ManualPick =
  | {
      kind: 'order';
      order: ShipmentOrderFacts;
      criteria: Criteria;
      score: number;
      block: CandidateBlock | null;
      /** کد همین سطر پیش‌تر از همین سفارش کنار رفت. */
      voidedHere: boolean;
    }
  | { kind: 'missing'; orderNumber: number };

export interface ReviewRowView {
  now: Date;
  review: ReviewRow;
  /** قدم دوم دادن دستی (`?order=`)؛ null یعنی شماره‌ای نیامده. */
  manual: ManualPick | null;
  /** شماره‌ای که آمد و شکل شمارهٔ سفارش سایت را نداشت. */
  manualError: 'order_number_invalid' | null;
  money: boolean;
}

/** «همین است» یا دادن دستی که نشست. */
export interface Decided {
  orderNumber: number;
  from: OrderStatus;
  handed: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const FINGERPRINT = /^[0-9a-f]{64}$/;
const STATUSES: readonly OrderStatus[] = ['awaiting_payment', 'paid', 'expired', 'printing', 'handed_to_post', 'cancelled'];

/** شمارهٔ سطر فایل در نشانی یا فرم. */
export const rowNoOf = (value: unknown) => (typeof value === 'string' && /^[1-9]\d{0,4}$/.test(value) ? Number(value) : null);

/** شمارهٔ سفارشی که ادمین نوشت: ارقام فارسی و فاصله مهم نیستند؛ فقط سفارش‌های سایت (از 10001). */
export function orderNumberInput(value: unknown): number | null {
  const digits = toLatinDigits(text(value)).replace(/[\s,٬]/g, '');
  if (!/^\d{5,9}$/.test(digits)) return null;
  const n = Number(digits);
  return n >= FIRST_ORDER_NUMBER ? n : null;
}

/** آنچه ادمین از سفارش دید، از فرم (`seenText`). */
export function seenOf(value: unknown): ReviewDecision['seen'] | null {
  const match = /^([a-z_]+)\.(\d{1,3})$/.exec(text(value));
  const status = STATUSES.find((s) => s === match?.[1]);
  return match && status ? { status, liveShipments: Number(match[2]) } : null;
}

/** نامزدی که ادمین انتخاب کرد، از فرم (`choiceText`). */
export function choiceOf(value: unknown): { orderId: string; seen: ReviewDecision['seen'] } | null {
  const raw = text(value);
  const orderId = idOf(raw.slice(0, 36));
  const seen = raw[36] === '.' ? seenOf(raw.slice(37)) : null;
  return orderId && seen ? { orderId, seen } : null;
}

type Refused = Exclude<ReviewWrite, { ok: true }>;

/** شکست هر «همین است» یا دادن دستی، به کد پنل؛ بسته بودن با دلیلش (`BLOCK_ERRORS`). */
const DECIDE_ERRORS: Record<Exclude<Refused['reason'], 'blocked'>, [number, AdminErrorCode]> = {
  not_found: [404, 'row_not_found'],
  row_closed: [409, 'row_closed'],
  order_not_found: [404, 'order_not_found'],
  changed: [409, 'shipment_order_changed'],
};
const BLOCK_ERRORS: Record<Extract<Refused, { reason: 'blocked' }>['block'], AdminErrorCode> = {
  cancelled: 'blocked_cancelled',
  before_payment: 'blocked_before_payment',
  needs_partner: 'blocked_needs_partner',
  needs_print: 'blocked_needs_print',
  barcode_elsewhere: 'barcode_elsewhere',
};

function decided(written: ReviewWrite): Result<Decided> {
  if (written.ok) return ok({ orderNumber: written.orderNumber, from: written.from, handed: written.handed });
  if (written.reason === 'blocked') return fail(409, BLOCK_ERRORS[written.block], { block: written.block });
  const [status, error] = DECIDE_ERRORS[written.reason];
  return fail(status, error);
}

/** سفارش قدم دوم دادن دستی، با معیارها و دروازه‌هایش؛ همان تابع‌های نامزدها (`candidates.ts`). */
function pickOf(review: ReviewRow, order: ShipmentOrderFacts): ManualPick {
  const row = storedCandidateRow(review.row);
  const criteria = criteriaOf(row, order);
  return {
    kind: 'order',
    order,
    criteria,
    score: scoreOf(criteria),
    block: blockOf(row, order),
    voidedHere: review.shipments.some((s) => s.voidedAt !== null && s.orderId === order.id),
  };
}

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
    /** ورودها، تازه‌ترین اول، صفحه‌به‌صفحه؛ و برای مالک و متصدی شمار صف تأیید. */
    async list(session: AdminSession, params: { page?: string }): Promise<Result<ImportsView>> {
      if (!can(session, 'shipments.import')) return fail(403, 'forbidden');
      const page = pageOf(params.page);
      const scope = scopeOf(session);
      const [lines, queue] = await Promise.all([
        store.listImports(scope, { limit: IMPORTS_PAGE + 1, offset: (page - 1) * IMPORTS_PAGE }),
        can(session, 'shipments.review') ? store.reviewQueue(scope, { limit: 0, offset: 0 }) : Promise.resolve({ total: 0 }),
      ]);
      return ok({ now: now(), lines: lines.slice(0, IMPORTS_PAGE), page, more: lines.length > IMPORTS_PAGE, queued: queue.total });
    },

    /** یک ورود با آنچه صفحه‌اش لازم دارد؛ بیرون از محدوده همان «نیست». بی `orders.money` بی کرایه و مالیات. */
    async page(session: AdminSession, idParam: string): Promise<Result<ImportPageView>> {
      if (!can(session, 'shipments.import')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      const at = now();
      const canReview = can(session, 'shipments.review');
      const found = id ? await store.importPage(scopeOf(session), id, at, { candidates: canReview }) : null;
      if (!found) return fail(404, 'import_not_found');
      const money = can(session, 'orders.money');
      return ok({
        ...(money ? found : withoutFares(found)),
        now: at,
        canRevert: can(session, 'shipments.revert') && found.import.status === 'committed',
        canReview,
        money,
      });
    },

    /** صف تأیید (۶٫۲، طرح `m-ship-review`): قدیمی‌ترین اول، صفحه‌به‌صفحه؛ صفحهٔ پس از آخر یعنی آخر. */
    async queue(session: AdminSession, params: { page?: string }): Promise<Result<ReviewQueueView>> {
      if (!can(session, 'shipments.review')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const money = can(session, 'orders.money');
      let page = pageOf(params.page);
      let { rows, total } = await store.reviewQueue(scope, { limit: REVIEW_PAGE, offset: (page - 1) * REVIEW_PAGE });
      const pages = Math.max(1, Math.ceil(total / REVIEW_PAGE));
      if (page > pages) {
        page = pages;
        ({ rows, total } = await store.reviewQueue(scope, { limit: REVIEW_PAGE, offset: (page - 1) * REVIEW_PAGE }));
      }
      return ok({ now: now(), rows: money ? rows : rows.map(rowWithoutFares), total, page, pages: Math.max(1, Math.ceil(total / REVIEW_PAGE)), money });
    },

    /**
     * یک سطر برای صف یا دادن دستی (۶٫۲): کارتش، و با `order` (قدم دوم، تصمیم ۸۳) سفارشی با همان شماره در محدودهٔ واردکنندهٔ همین
     * فایل، با معیارها و دروازه‌هایش. پرداخت‌نشده همان «پیدا نشد» است.
     */
    async row(session: AdminSession, importParam: string, rowParam: string, params: { order?: string }): Promise<Result<ReviewRowView>> {
      if (!can(session, 'shipments.review')) return fail(403, 'forbidden');
      const importId = idOf(importParam);
      const rowNo = rowNoOf(rowParam);
      const scope = scopeOf(session);
      const found = importId && rowNo !== null ? await store.reviewRow(scope, importId, rowNo) : null;
      if (!found) return fail(404, 'row_not_found');
      const money = can(session, 'orders.money');
      const review = money ? found : rowWithoutFares(found);
      if (params.order === undefined || !review.assignable) return ok({ now: now(), review, manual: null, manualError: null, money });
      const orderNumber = orderNumberInput(params.order);
      if (orderNumber === null) return ok({ now: now(), review, manual: null, manualError: 'order_number_invalid', money });
      const order = await store.orderForRow(scope, review.import.id, orderNumber);
      const payable = order && order.status !== 'awaiting_payment' && order.status !== 'expired';
      return ok({ now: now(), review, manual: payable ? pickOf(review, order) : { kind: 'missing', orderNumber }, manualError: null, money });
    },

    /** «همین است» (۶٫۲): نامزدی که ادمین انتخاب کرد، از همان که از آن دید (`choice`). */
    async approve(session: AdminSession, form: { importId: unknown; rowNo: unknown; choice: unknown }, ip: string): Promise<Result<Decided>> {
      if (!can(session, 'shipments.review')) return fail(403, 'forbidden');
      const importId = idOf(form.importId);
      const rowNo = rowNoOf(form.rowNo);
      if (!importId || rowNo === null) return fail(404, 'row_not_found');
      const choice = choiceOf(form.choice);
      if (!choice) return fail(400, 'choice_required');
      const at = now();
      return decided(
        await store.decide(scopeOf(session), {
          importId,
          rowNo,
          orderId: choice.orderId,
          via: 'review',
          seen: choice.seen,
          at,
          adminUserId: session.userId,
          event: event(session, 'shipments.approve', ip, at),
        }),
      );
    },

    /** دادن دستی (۶٫۲، قدم دوم): سفارشی که ادمین با شماره‌اش آورد و کارتش را دید (`order`، `seen`). */
    async assign(
      session: AdminSession,
      form: { importId: unknown; rowNo: unknown; order: unknown; seen: unknown },
      ip: string,
    ): Promise<Result<Decided>> {
      if (!can(session, 'shipments.review')) return fail(403, 'forbidden');
      const importId = idOf(form.importId);
      const rowNo = rowNoOf(form.rowNo);
      if (!importId || rowNo === null) return fail(404, 'row_not_found');
      const orderId = idOf(form.order);
      const seen = seenOf(form.seen);
      if (!orderId || !seen) return fail(400, 'choice_required');
      const at = now();
      return decided(
        await store.decide(scopeOf(session), {
          importId,
          rowNo,
          orderId,
          via: 'manual',
          seen,
          at,
          adminUserId: session.userId,
          event: event(session, 'shipments.assign', ip, at),
        }),
      );
    },

    /** «هیچ‌کدام» (۶٫۲): بی دلیل و یک بار (تصمیم ۷۹)؛ راه برگشتش دادن دستی است. */
    async dismiss(session: AdminSession, form: { importId: unknown; rowNo: unknown }, ip: string): Promise<Result<true>> {
      if (!can(session, 'shipments.review')) return fail(403, 'forbidden');
      const importId = idOf(form.importId);
      const rowNo = rowNoOf(form.rowNo);
      if (!importId || rowNo === null) return fail(404, 'row_not_found');
      const at = now();
      const written = await store.dismiss(scopeOf(session), {
        importId,
        rowNo,
        at,
        adminUserId: session.userId,
        event: event(session, 'shipments.dismiss', ip, at),
      });
      if (written.ok) return ok(true);
      return written.reason === 'not_found' ? fail(404, 'row_not_found') : fail(409, 'row_closed');
    },

    /**
     * کنار گذاشتن یک کد رهگیری (۶٫۲، مالک، با دلیل ۱ تا ۵۰۰ نویسه، بی کد تازه): کد می‌ماند و کنار می‌رود، سطرش به صف برمی‌گردد، و
     * سفارشی که همین کد «تحویل پست شد» کرده بود یک قدم به «در حال چاپ» (تصمیم ۸۰).
     */
    async voidShipment(
      session: AdminSession,
      form: { shipment: unknown; reason: unknown },
      ip: string,
    ): Promise<Result<{ orderNumber: number; reopened: boolean; kept: VoidKept | null }>> {
      if (!can(session, 'shipments.revert')) return fail(403, 'forbidden');
      const shipmentId = idOf(form.shipment);
      if (!shipmentId) return fail(404, 'shipment_not_found');
      const reason = tidyInputFa(text(form.reason));
      if (!reason) return fail(400, 'reason_required');
      if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');
      const at = now();
      const written = await store.voidShipment(scopeOf(session), {
        shipmentId,
        reason,
        at,
        adminUserId: session.userId,
        event: event(session, 'shipments.void', ip, at),
      });
      if (written.ok) return ok({ orderNumber: written.orderNumber, reopened: written.reopened, kept: written.kept });
      return written.reason === 'not_found' ? fail(404, 'shipment_not_found') : fail(409, 'shipment_voided');
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
