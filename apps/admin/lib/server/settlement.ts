/**
 * تسویهٔ چاپخانه‌ها در پنل (برش ۱۰٫۳، ADR-069؛ سؤال ۲۰۳ «درصدی از سفارش»، و اجرا ۳۹۰ تا ۴۰۳): نمای کلی، صورت‌حساب هر چاپخانه، ثبت
 * پرداخت و اصلاح، باطل کردن، هشدار درصد تعیین‌نشده، و سند خروجی.
 *
 * - **مجوز در سرور، پیش از هر خواندن** (سؤال ۳۹۹): دیدن با `settlements.read` (مالک و حسابدار همه، کاربر چاپخانه فقط خودش)، نوشتن با
 *   `settlements.manage` (مالک و حسابدار). متصدی هیچ؛ نشستی که ندارد ۴۰۳ می‌گیرد و ذخیره‌گاه صدا زده نمی‌شود.
 * - **محدوده** (ADR-042): کاربر چاپخانه فقط صورت‌حساب خودش؛ چاپخانهٔ دیگر همان «نیست» (۴۰۴). پایهٔ سهم (مبلغ مشتری) فقط با `orders.money`،
 *   در صفحه و سند هر دو؛ کاربر چاپخانه سهم خودش را می‌بیند و درصدش را می‌داند، ولی مبلغ پرداخت مشتری، کرایه و تخفیف را نه.
 * - **کد تازه** (سؤال ۳۹۶): ثبت پرداخت، اصلاح و باطل، پس از هر سنجشی که بی کد جواب دارد (فرم، چاپخانه، «همان که دیده شد»، سفارش اصلاح)،
 *   تا کد هدر نرود؛ کد خالی `settlement_code_required` بی `stepUp`. فرمی که یک بار نوشته شد (`request`) با همان مقدارها، پس از سنجش فرم و
 *   پیش از «همان که دیده شد» و کد، همان ردیف را جواب می‌گیرد، پس فرستادن دوباره پس از پاسخی که نرسید ردیف دوم نمی‌سازد و کد را هم نمی‌خواهد؛
 *   همان فرم با مقدار دیگری (مثلاً پس از «برگشت» مرورگر) «فرم کهنه» است، نه «ثبت شد» با مقدار قبلی.
 * - **رویداد** `settlements.payment`، `.adjust` و `.void` در همان تراکنش (چیپ «تسویه»)، با مبلغ و روز، بی کد پیگیری و یادداشت.
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. قفل و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import type {
  AdminEventInput,
  LedgerEntry,
  LedgerKind,
  SettlementOrder,
  SettlementOverviewRow,
  SettlementPartner,
  SettlementStore,
} from '@jozveyar/db';

import type { ReportDocument } from '../reportDocument';
import {
  type PanelSettlementOrder,
  type PanelStatement,
  readAdjustmentForm,
  readPaymentForm,
  readSettlementQuery,
  readVoidForm,
  settlementDocument,
  type SettlementField,
  type SettlementForm,
  type SettlementQuery,
  type SettlementRangeError,
} from '../settlement';
import { can, ipHashOf, scopeOf, type AdminSession } from './auth';
import type { ExportDocument } from './production';
import { fail, ok, type Result } from './result';

export interface PanelSettlementDeps {
  store: SettlementStore;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

/** پارامترهای نشانی صورت‌حساب: بازه، و برای خروجی چاپخانه (`p`). */
export type SettlementParams = { d?: string; from?: string; to?: string; p?: string };

export interface SettlementView {
  now: Date;
  /** صورت‌حساب بازهٔ خوانده‌شده؛ با فرم خطادار، «این ماه»، فقط برای سربرگ و ماندهٔ امروز. */
  statement: PanelStatement;
  /** بازهٔ خوانده‌شده؛ null یعنی فرم خطا دارد. */
  query: SettlementQuery | null;
  error: { field: SettlementField; error: SettlementRangeError } | null;
  form: SettlementForm;
  money: boolean;
  /** ثبت پرداخت، اصلاح و باطل (`settlements.manage`). */
  canManage: boolean;
  /** درصد سهم را مالک عوض می‌کند (`partners.manage`). */
  canShare: boolean;
}

/** فرم «ثبت پرداخت»، همان نام فیلدهای HTML. */
export interface PaymentFormInput {
  amount: unknown;
  day: unknown;
  periodFrom: unknown;
  periodTo: unknown;
  tracking: unknown;
  note: unknown;
  seen: unknown;
  request: unknown;
  code: unknown;
}

/** فرم «ثبت اصلاح». */
export interface AdjustmentFormInput {
  amount: unknown;
  direction: unknown;
  day: unknown;
  order: unknown;
  reason: unknown;
  seen: unknown;
  request: unknown;
  code: unknown;
}

/** فرم «باطل کن». */
export interface VoidFormInput {
  reason: unknown;
  seen: unknown;
  code: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);
const versionOf = (value: unknown) => (typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : null);
/** کد برنامهٔ تأیید خالی: بی `stepUp`، چون هر کد نادرست یک اشتباه از سقف قفل است و خالی اشتباه نیست، فراموش شده. */
const blank = (code: unknown) => typeof code !== 'string' || code.trim() === '';

const withoutBase = (order: SettlementOrder): PanelSettlementOrder => ({ ...order, baseRials: null });

/** مقدارهای یک ردیف دفتر از فرم، برای سنجش فرمی که پیش‌تر نوشته شد. */
type LedgerValue = Pick<LedgerEntry, 'amountRials' | 'day' | 'period' | 'tracking' | 'note' | 'orderNumber'>;

/** نتیجهٔ ثبت برای صفحه: شناسهٔ ردیف و اینکه همان فرم پیش‌تر نوشته بود. */
export interface LedgerDone {
  partnerId: string;
  entryId: number;
  duplicate: boolean;
}

export function createPanelSettlement(deps: PanelSettlementDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const event = (session: AdminSession, action: string, partnerId: string, ip: string, at: Date): AdminEventInput => ({
    adminUserId: session.userId,
    action,
    targetType: 'partner',
    targetId: partnerId,
    ipHash: ipHashOf(deps.secret, ip),
    at,
  });

  /** چاپخانه‌ای که این نشست می‌بیند: شناسهٔ درست، و برای کاربر چاپخانه فقط خودش. */
  function visible(session: AdminSession, idParam: string): string | null {
    const id = idOf(idParam);
    if (!id || (session.partner !== null && session.partner.id !== id)) return null;
    return id;
  }

  async function view(session: AdminSession, idParam: string, params: SettlementParams): Promise<Result<SettlementView>> {
    if (!can(session, 'settlements.read')) return fail(403, 'forbidden');
    const id = visible(session, idParam);
    if (!id) return fail(404, 'partner_not_found');
    const at = now();
    const read = readSettlementQuery(params, at);
    const fallback = readSettlementQuery({}, at);
    if (!fallback.ok) throw new Error('بازهٔ پیش‌فرض صورت‌حساب خوانده نشد');
    const statement = await store.statement(scopeOf(session), id, read.ok ? read.query.range : fallback.query.range);
    if (!statement) return fail(404, 'partner_not_found');
    const money = can(session, 'orders.money');
    const shown: PanelStatement = money
      ? statement
      : {
          ...statement,
          handed: statement.handed.map(withoutBase),
          cancelledAfterPrint: statement.cancelledAfterPrint.map(withoutBase),
          inFlight: statement.inFlight.map(withoutBase),
        };
    return ok({
      now: at,
      statement: shown,
      query: read.ok ? read.query : null,
      error: read.ok ? null : { field: read.field, error: read.error },
      form: read.ok ? read.query.form : read.form,
      money,
      canManage: can(session, 'settlements.manage'),
      canShare: can(session, 'partners.manage'),
    });
  }

  /** چاپخانه، فرم و «همان که دیده شد» برای نوشتن؛ و پاسخ فرمی که پیش‌تر نوشته شد، پیش از کد تازه. */
  async function writable(
    session: AdminSession,
    idParam: string,
    requestInput: unknown,
    seenInput: unknown,
  ): Promise<Result<{ partnerId: string; requestId: string; seen: number; earlier: LedgerEntry | null }>> {
    if (!can(session, 'settlements.manage')) return fail(403, 'forbidden');
    const partnerId = visible(session, idParam);
    if (!partnerId) return fail(404, 'partner_not_found');
    const requestId = idOf(requestInput);
    const seen = versionOf(seenInput);
    if (!requestId || seen === null) return fail(409, 'settlement_changed');
    const earlier = await store.byRequest(requestId);
    return ok({ partnerId, requestId, seen, earlier });
  }

  /**
   * فرمی که یک بار نوشته شد: همان ردیف، اگر مال همین چاپخانه، همین ادمین و همین نوع است و همان مقدارها را دارد (همان سنجش ذخیره‌گاه)؛
   * وگرنه «فرم کهنه».
   */
  function repeated(session: AdminSession, partnerId: string, kind: LedgerKind, earlier: LedgerEntry, value: LedgerValue): Result<LedgerDone> {
    const same =
      earlier.partnerId === partnerId &&
      earlier.createdBy === session.userId &&
      earlier.kind === kind &&
      earlier.amountRials === value.amountRials &&
      earlier.day.getTime() === value.day.getTime() &&
      (earlier.period?.from.getTime() ?? null) === (value.period?.from.getTime() ?? null) &&
      (earlier.period?.until.getTime() ?? null) === (value.period?.until.getTime() ?? null) &&
      earlier.tracking === value.tracking &&
      earlier.note === value.note &&
      earlier.orderNumber === value.orderNumber;
    return same ? ok({ partnerId, entryId: earlier.id, duplicate: true }) : fail(409, 'settlement_form_used');
  }

  /** نسخهٔ دفتر پیش از کد تازه؛ ذخیره‌گاه زیر قفل دوباره می‌سنجد. */
  async function fresh(partnerId: string, seen: number): Promise<Result<true>> {
    const version = await store.version(partnerId);
    if (version === null) return fail(404, 'partner_not_found');
    return version === seen ? ok(true) : fail(409, 'settlement_changed');
  }

  function writeFailure(reason: 'not_found' | 'changed' | 'conflict' | 'order_not_found'): Result<never> {
    if (reason === 'not_found') return fail(404, 'partner_not_found');
    if (reason === 'conflict') return fail(409, 'settlement_form_used');
    if (reason === 'order_not_found') return fail(400, 'settlement_order_not_found', { field: 'order' });
    return fail(409, 'settlement_changed');
  }

  return {
    view,

    /** نمای کلی: همهٔ چاپخانه‌ها با ماندهٔ امروز؛ کاربر چاپخانه فقط خودش (صفحه به صورت‌حسابش می‌رود). */
    async overview(session: AdminSession): Promise<Result<{ now: Date; rows: SettlementOverviewRow[]; canShare: boolean }>> {
      if (!can(session, 'settlements.read')) return fail(403, 'forbidden');
      return ok({ now: now(), rows: await store.overview(scopeOf(session)), canShare: can(session, 'partners.manage') });
    },

    /** چاپخانه‌های فعال بی درصد، برای هشدار پیشخوان؛ فقط کسی که درصد را می‌گذارد (مالک)، وگرنه null. */
    async unsetShares(session: AdminSession): Promise<{ id: string; name: string }[] | null> {
      if (!can(session, 'partners.manage')) return null;
      return store.unsetShares();
    },

    /** سفارش اصلاح در صفحهٔ فرم (`?order=`): روزی به همین چاپخانه سپرده شده؛ وگرنه null. */
    async adjustable(session: AdminSession, idParam: string, orderNumber: number): Promise<PanelSettlementOrder | null> {
      if (!can(session, 'settlements.manage')) return null;
      const partnerId = visible(session, idParam);
      if (!partnerId) return null;
      const order = await store.adjustable(partnerId, orderNumber);
      if (!order) return null;
      return can(session, 'orders.money') ? order : withoutBase(order);
    },

    /** ردیف دفتری که باطل می‌شود، در همین چاپخانه. */
    async entry(session: AdminSession, idParam: string, entryParam: string): Promise<Result<{ partner: SettlementPartner; entry: LedgerEntry; version: number }>> {
      if (!can(session, 'settlements.manage')) return fail(403, 'forbidden');
      const partnerId = visible(session, idParam);
      const entryId = versionOf(entryParam);
      if (!partnerId || entryId === null) return fail(404, 'settlement_entry_not_found');
      const at = now();
      const range = readSettlementQuery({}, at);
      if (!range.ok) throw new Error('بازهٔ پیش‌فرض صورت‌حساب خوانده نشد');
      const [entry, statement] = await Promise.all([store.entry(partnerId, entryId), store.statement(scopeOf(session), partnerId, range.query.range)]);
      if (!entry || !statement) return fail(404, 'settlement_entry_not_found');
      return ok({ partner: statement.partner, entry, version: statement.version });
    },

    /** «ثبت پرداخت» با کد تازه، پس از هر سنجش بی کد. */
    async recordPayment(session: AdminSession, idParam: string, form: PaymentFormInput, ip: string): Promise<Result<LedgerDone>> {
      const target = await writable(session, idParam, form.request, form.seen);
      if (!target.ok) return target;
      const { partnerId, requestId, seen, earlier } = target.value;
      const read = readPaymentForm(form, now());
      if (!read.ok) return fail(400, read.error, { field: read.field });
      if (earlier) return repeated(session, partnerId, 'payment', earlier, { ...read.value, orderNumber: null });
      const current = await fresh(partnerId, seen);
      if (!current.ok) return current;
      if (blank(form.code)) return fail(400, 'settlement_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, form.code, ip);
      if (!stepped.ok) return stepped;
      const at = now();
      const written = await store.record({
        partnerId,
        kind: 'payment',
        ...read.value,
        orderNumber: null,
        requestId,
        seen,
        at,
        event: event(session, 'settlements.payment', partnerId, ip, at),
      });
      if (!written.ok) return writeFailure(written.reason);
      return ok({ partnerId, entryId: written.entry.id, duplicate: written.duplicate });
    },

    /** «ثبت اصلاح» با کد تازه؛ سفارش اصلاح پیش از کد. */
    async recordAdjustment(session: AdminSession, idParam: string, form: AdjustmentFormInput, ip: string): Promise<Result<LedgerDone>> {
      const target = await writable(session, idParam, form.request, form.seen);
      if (!target.ok) return target;
      const { partnerId, requestId, seen, earlier } = target.value;
      const read = readAdjustmentForm(form, now());
      if (!read.ok) return fail(400, read.error, { field: read.field });
      if (earlier) return repeated(session, partnerId, 'adjustment', earlier, { ...read.value, period: null, tracking: null });
      if (read.value.orderNumber !== null && !(await store.adjustable(partnerId, read.value.orderNumber))) {
        return fail(400, 'settlement_order_not_found', { field: 'order' });
      }
      const current = await fresh(partnerId, seen);
      if (!current.ok) return current;
      if (blank(form.code)) return fail(400, 'settlement_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, form.code, ip);
      if (!stepped.ok) return stepped;
      const at = now();
      const written = await store.record({
        partnerId,
        kind: 'adjustment',
        amountRials: read.value.amountRials,
        day: read.value.day,
        period: null,
        tracking: null,
        note: read.value.note,
        orderNumber: read.value.orderNumber,
        requestId,
        seen,
        at,
        event: event(session, 'settlements.adjust', partnerId, ip, at),
      });
      if (!written.ok) return writeFailure(written.reason);
      return ok({ partnerId, entryId: written.entry.id, duplicate: written.duplicate });
    },

    /** «باطل کن» با دلیل و کد تازه؛ دو کلیک همان باطل، بی کد دوم. */
    async voidEntry(
      session: AdminSession,
      idParam: string,
      entryParam: string,
      form: VoidFormInput,
      ip: string,
    ): Promise<Result<{ partnerId: string; entryId: number; already: boolean }>> {
      if (!can(session, 'settlements.manage')) return fail(403, 'forbidden');
      const partnerId = visible(session, idParam);
      const entryId = versionOf(entryParam);
      if (!partnerId || entryId === null) return fail(404, 'settlement_entry_not_found');
      const entry = await store.entry(partnerId, entryId);
      if (!entry) return fail(404, 'settlement_entry_not_found');
      const read = readVoidForm(form);
      if (!read.ok) return fail(400, read.error, { field: read.field });
      if (entry.voided) {
        if (entry.voided.by === session.userId && entry.voided.reason === read.value) return ok({ partnerId, entryId, already: true });
        return fail(409, 'settlement_already_voided');
      }
      const seen = versionOf(form.seen);
      if (seen === null) return fail(409, 'settlement_changed');
      const current = await fresh(partnerId, seen);
      if (!current.ok) return current;
      if (blank(form.code)) return fail(400, 'settlement_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, form.code, ip);
      if (!stepped.ok) return stepped;
      const at = now();
      const written = await store.voidEntry({ partnerId, id: entryId, reason: read.value, seen, at, event: event(session, 'settlements.void', partnerId, ip, at) });
      if (written.ok) return ok({ partnerId, entryId, already: written.already });
      if (written.reason === 'already_voided') return fail(409, 'settlement_already_voided');
      if (written.reason === 'not_found') return fail(404, 'settlement_entry_not_found');
      return fail(409, 'settlement_changed');
    },

    /** سند خروجی همان صورت‌حسابی که صفحه با همین نشانی نشان می‌دهد (`p` چاپخانه)؛ فرم خطادار ۴۰۰. */
    async document(session: AdminSession, params: SettlementParams): Promise<Result<ExportDocument>> {
      const result = await view(session, params.p ?? '', params);
      if (!result.ok) return result;
      const { query, statement, money, now: at } = result.value;
      if (!query) return fail(400, 'invalid_report_range');
      const document: ReportDocument = settlementDocument({ statement, query, money, made: { at, by: session.displayName } });
      return ok({ document, money, printPartnerId: session.partner?.id ?? null });
    },
  };
}

export type PanelSettlement = ReturnType<typeof createPanelSettlement>;
