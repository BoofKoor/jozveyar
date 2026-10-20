/**
 * تسویهٔ چاپخانه‌ها به زبان پنل (برش ۱۰٫۳، ADR-069؛ سؤال ۲۰۳ «درصدی از سفارش»، و اجرا ۳۹۰ تا ۴۰۳): بازهٔ صورت‌حساب از نشانی، درصد سهم،
 * فرم‌های پرداخت، اصلاح و باطل، و سند خروجی اکسل و PDF. خالص، بی پایگاه داده و بی JSX، مثل گزارش تولید (`production.ts`)؛ صفحه فقط
 * می‌چیندش.
 *
 * - **بازه** (سؤال ۳۹۸): «این ماه» (از اول ماه شمسی تا امروز، پیش‌فرض) و «ماه قبل»، یا روز اول و آخر شمسی، هر دو سر شامل، تا ۴۰۰ روز.
 * - **درصد** (سؤال ۳۹۱): ۰ تا ۱۰۰ با تا دو رقم اعشار، با ارقام فارسی و «٫» هم؛ ۰ یعنی «سهمی ندارد» (چاپخانهٔ خود جزوه‌یار).
 * - **پرداخت** (سؤال ۳۹۶): مبلغ تومان، روز (تا امروز)، «بابت» اختیاری، کد پیگیری و یادداشت اختیاری. **اصلاح**: مبلغ تومان به سود یا به زیان
 *   چاپخانه، سفارش اختیاری و دلیل لازم. **باطل**: دلیل لازم. هر متن فارسی‌نرمال.
 * - **سند** (سؤال ۴۰۰) همان کاشی‌ها و فهرست‌های صفحه؛ پایهٔ سهم (جمع چاپ، کاغذ و صحافی مشتری) فقط برای کسی که `orders.money` دارد.
 */

import {
  LEDGER_MAX_RIALS,
  LEDGER_NOTE_MAX,
  LEDGER_PERIOD_MAX_DAYS,
  LEDGER_TRACKING_MAX,
  SHARE_BP_MAX,
  type LedgerEntry,
  type SettlementOrder,
  type SettlementRange,
  type SettlementStatement,
} from '@jozveyar/db';
import { formatJalali, formatJalaliNumeric, formatJalaliWeekday, jalaliYear, parseJalaliNumeric, tehranDayStart, toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import { STATUS_LABELS, type Seg } from './orders';
import { productionErrorText, type ProductionInputError } from './production';
import { madeText, segText, type ReportDocument, type ReportTable } from './reportDocument';
import { monthLabel, monthOf, monthStart, nextMonth, tomansOf, tomansText } from './report';

/** سفارش صورت‌حساب در پنل: پایهٔ سهم (مبلغ مشتری) فقط برای کسی که `orders.money` دارد، وگرنه null. */
export type PanelSettlementOrder = Omit<SettlementOrder, 'baseRials'> & { baseRials: bigint | null };

export type PanelStatement = Omit<SettlementStatement, 'handed' | 'cancelledAfterPrint' | 'inFlight'> & {
  handed: PanelSettlementOrder[];
  cancelledAfterPrint: PanelSettlementOrder[];
  inFlight: PanelSettlementOrder[];
};

/* ───────────────────────── بازه ───────────────────────── */

export const SETTLEMENT_MAX_DAYS = LEDGER_PERIOD_MAX_DAYS;

export const SETTLEMENT_CHIPS = ['month', 'last'] as const;
export type SettlementChip = (typeof SETTLEMENT_CHIPS)[number];

export const SETTLEMENT_CHIP_LABELS: Record<SettlementChip, string> = { month: 'این ماه', last: 'ماه قبل' };

/** فرم بازه همان‌طور که صفحه پر می‌کند: روزها شمسی. */
export interface SettlementForm {
  from: string;
  to: string;
}

export type SettlementField = 'from' | 'to';
export type SettlementRangeError = Extract<ProductionInputError, 'invalid_day' | 'invalid_last_day' | 'day_order' | 'too_many_days'>;

export interface SettlementQuery {
  range: SettlementRange;
  chip: SettlementChip | null;
  /** «مهر 1405، تا امروز»، «شهریور 1405»، «از 1 مهر تا 22 مهر». */
  label: Seg[];
  /** بخش بازهٔ نام فایل: `1405-07`، `1405-07-01-ta-1405-07-22`. */
  fileRange: string;
  form: SettlementForm;
}

const text = (value: unknown, max = 40) => (typeof value === 'string' ? value.slice(0, max).trim() : '');
const fileDay = (day: Date) => formatJalaliNumeric(day).replaceAll('/', '-');
const dayLabel = (day: Date, now: Date) => (jalaliYear(day) === jalaliYear(now) ? formatJalaliWeekday(day) : formatJalali(day));

function dayQuery(first: Date, last: Date, now: Date, chip: SettlementChip | null, label: Seg[] | null, fileRange: string | null): SettlementQuery {
  const single = first.getTime() === last.getTime();
  return {
    range: { from: first, until: tehranDayStart(last, 1) },
    chip,
    label: label ?? (single ? [dayLabel(first, now)] : [`از ${dayLabel(first, now)} تا ${dayLabel(last, now)}`]),
    fileRange: fileRange ?? (single ? fileDay(first) : `${fileDay(first)}-ta-${fileDay(last)}`),
    form: { from: formatJalaliNumeric(first), to: formatJalaliNumeric(last) },
  };
}

/**
 * بازهٔ صورت‌حساب از نشانی: `d` (چیپ)، یا `from` و `to` (روز؛ یکی تنها یعنی همان یک روز)؛ بی هیچ، «این ماه». خطا با فیلدش، و فرم همان که
 * نوشته شد.
 */
export function readSettlementQuery(
  params: { d?: string; from?: string; to?: string },
  now: Date,
): { ok: true; query: SettlementQuery } | { ok: false; field: SettlementField; error: SettlementRangeError; form: SettlementForm } {
  const form: SettlementForm = { from: text(params.from), to: text(params.to) };
  const today = tehranDayStart(now);
  const month = monthOf(now);
  const chip = (SETTLEMENT_CHIPS as readonly string[]).includes(params.d ?? '') ? (params.d as SettlementChip) : null;
  if (chip === 'last') {
    const last = monthOf(tehranDayStart(monthStart(month), -1));
    const start = monthStart(last);
    return { ok: true, query: dayQuery(start, tehranDayStart(monthStart(nextMonth(last)), -1), now, 'last', monthLabel(last, false), fileDay(start).slice(0, 7)) };
  }
  if (chip === 'month' || (!form.from && !form.to)) {
    const start = monthStart(month);
    return { ok: true, query: dayQuery(start, today, now, 'month', monthLabel(month, true), fileDay(start).slice(0, 7)) };
  }
  const first = parseJalaliNumeric(toLatinDigits(form.from || form.to));
  if (!first) return { ok: false, field: form.from ? 'from' : 'to', error: 'invalid_day', form };
  const last = form.from && form.to ? parseJalaliNumeric(toLatinDigits(form.to)) : first;
  if (!last) return { ok: false, field: 'to', error: 'invalid_last_day', form };
  if (last.getTime() < first.getTime()) return { ok: false, field: 'to', error: 'day_order', form };
  if (tehranDayStart(first, SETTLEMENT_MAX_DAYS).getTime() <= last.getTime()) return { ok: false, field: 'to', error: 'too_many_days', form };
  return { ok: true, query: dayQuery(first, last, now, null, null, null) };
}

/** متن خطای بازه زیر همان فیلد؛ همان متن‌های گزارش تولید، با سقف روزهای همین صورت‌حساب. */
export function settlementRangeErrorText(error: SettlementRangeError): string {
  return error === 'too_many_days' ? `بازهٔ روز تا ${SETTLEMENT_MAX_DAYS} روز.` : productionErrorText(error);
}

/** پارامترهای نشانی همان صورت‌حساب، شکل یکتا: چیپ (`d`) یا روزها (`from` و `to`). برای خروجی اکسل، فرم PDF و برگشت فرم‌ها. */
export function settlementParams(query: SettlementQuery): Record<string, string> {
  return query.chip ? { d: query.chip } : { from: query.form.from, to: query.form.to };
}

/* ───────────────────────── درصد سهم ───────────────────────── */

/**
 * درصد تایپ‌شده به صدم درصد: «65»، «62.5»، «۶۲٫۵»، «33.33٪»؛ ۰ تا ۱۰۰ با تا دو رقم اعشار. هر چیز دیگر null (`share_invalid`)، بی گرد
 * کردن بی‌صدا: «62.555» درصد نیست که پنل حدس بزند.
 */
export function readSharePercent(input: unknown): number | null {
  const clean = toLatinDigits(text(input, 20))
    .replace(/\s*[٪%]$/, '')
    .replace(/[٫/,]/g, '.');
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp <= SHARE_BP_MAX ? bp : null;
}

/** «65٪»، «62.5٪»، «33.33٪»، «0٪». */
export function shareText(bp: number): string {
  const whole = Math.floor(bp / 100);
  const cents = bp % 100;
  return `${whole}${cents === 0 ? '' : `.${String(cents).padStart(2, '0').replace(/0$/, '')}`}٪`;
}

/** «همان که دیده شد» درصد: صدم درصد، یا خالی برای تعیین‌نشده. */
export const shareSeen = (bp: number | null) => (bp === null ? '' : String(bp));

/** درصد دیده‌شده از فرم: عدد صدم درصد، `null` برای خالی، و `undefined` برای هر چیز دیگر (فرم از جای دیگری آمد). */
export function shareSeenOf(value: unknown): number | null | undefined {
  if (value === '' || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{1,5}$/.test(value)) return undefined;
  const bp = Number(value);
  return bp <= SHARE_BP_MAX ? bp : undefined;
}

/* ───────────────────────── فرم‌های دفتر ───────────────────────── */

/** سقف مبلغ هر ردیف، تومان: همان `LEDGER_MAX_RIALS`. */
export const LEDGER_MAX_TOMANS = Number(LEDGER_MAX_RIALS / 10n);

/** مبلغ تایپ‌شده به تومان (ارقام فارسی و جداکننده هم)، به ریال؛ null یعنی نادرست یا صفر یا بالای سقف. */
export function readTomans(input: unknown): bigint | null {
  const clean = toLatinDigits(text(input, 30)).replace(/[\s,٬،']/g, '');
  if (!/^\d{1,11}$/.test(clean)) return null;
  const tomans = BigInt(clean);
  return tomans < 1n || tomans > BigInt(LEDGER_MAX_TOMANS) ? null : tomans * 10n;
}

/** روز شمسی تایپ‌شده (ارقام فارسی، «-» و «.» هم)، آغاز همان روز به وقت تهران؛ null اگر نیست. */
const dayOf = (input: unknown) => parseJalaliNumeric(toLatinDigits(text(input, 20)).replace(/[-.]/g, '/'));

export type LedgerFormError =
  | 'settlement_amount_invalid'
  | 'settlement_day_invalid'
  | 'settlement_day_future'
  | 'settlement_period_invalid'
  | 'settlement_period_order'
  | 'settlement_period_long'
  | 'settlement_tracking_invalid'
  | 'settlement_note_too_long'
  | 'settlement_reason_required'
  | 'settlement_reason_too_long'
  | 'settlement_direction'
  | 'settlement_order_invalid';

export type LedgerField = 'amount' | 'day' | 'periodFrom' | 'periodTo' | 'tracking' | 'note' | 'direction' | 'order' | 'reason';

export type LedgerFormCheck<T> = { ok: true; value: T } | { ok: false; field: LedgerField; error: LedgerFormError };

export interface PaymentValue {
  amountRials: bigint;
  day: Date;
  period: SettlementRange | null;
  tracking: string | null;
  note: string | null;
}

/** فرم «ثبت پرداخت»: مبلغ، روز (تا امروز)، «بابت» از و تا (هر دو یا هیچ)، کد پیگیری و یادداشت. اولین خطا با جایش. */
export function readPaymentForm(
  form: { amount: unknown; day: unknown; periodFrom: unknown; periodTo: unknown; tracking: unknown; note: unknown },
  now: Date,
): LedgerFormCheck<PaymentValue> {
  const amountRials = readTomans(form.amount);
  if (amountRials === null) return { ok: false, field: 'amount', error: 'settlement_amount_invalid' };
  const day = dayOf(form.day);
  if (!day) return { ok: false, field: 'day', error: 'settlement_day_invalid' };
  if (day.getTime() > tehranDayStart(now).getTime()) return { ok: false, field: 'day', error: 'settlement_day_future' };
  let period: SettlementRange | null = null;
  const fromText = text(form.periodFrom);
  const toText = text(form.periodTo);
  if (fromText || toText) {
    const first = dayOf(fromText || toText);
    if (!first) return { ok: false, field: fromText ? 'periodFrom' : 'periodTo', error: 'settlement_period_invalid' };
    const last = fromText && toText ? dayOf(toText) : first;
    if (!last) return { ok: false, field: 'periodTo', error: 'settlement_period_invalid' };
    if (last.getTime() < first.getTime()) return { ok: false, field: 'periodTo', error: 'settlement_period_order' };
    const until = tehranDayStart(last, 1);
    if (until.getTime() > tehranDayStart(first, LEDGER_PERIOD_MAX_DAYS).getTime()) return { ok: false, field: 'periodTo', error: 'settlement_period_long' };
    period = { from: first, until };
  }
  const tracking = toLatinDigits(text(form.tracking, 80)).replace(/\s+/g, '');
  if (tracking && !new RegExp(`^[0-9A-Za-z-]{1,${LEDGER_TRACKING_MAX}}$`).test(tracking)) {
    return { ok: false, field: 'tracking', error: 'settlement_tracking_invalid' };
  }
  const note = tidyInputFa(typeof form.note === 'string' ? form.note.slice(0, LEDGER_NOTE_MAX * 2) : '');
  if (note.length > LEDGER_NOTE_MAX) return { ok: false, field: 'note', error: 'settlement_note_too_long' };
  return { ok: true, value: { amountRials, day, period, tracking: tracking || null, note: note || null } };
}

export interface AdjustmentValue {
  /** مثبت به سود چاپخانه، منفی به زیانش. */
  amountRials: bigint;
  day: Date;
  orderNumber: number | null;
  note: string;
}

/** دلیل لازم، فارسی‌نرمال، تا ۳۰۰ نویسه. */
function reasonOf(input: unknown): LedgerFormCheck<string> {
  const reason = tidyInputFa(typeof input === 'string' ? input.slice(0, LEDGER_NOTE_MAX * 2) : '');
  if (!reason) return { ok: false, field: 'reason', error: 'settlement_reason_required' };
  if (reason.length > LEDGER_NOTE_MAX) return { ok: false, field: 'reason', error: 'settlement_reason_too_long' };
  return { ok: true, value: reason };
}

/** فرم «ثبت اصلاح»: مبلغ، به سود یا زیان چاپخانه، روز (تا امروز)، سفارش اختیاری و دلیل لازم. */
export function readAdjustmentForm(
  form: { amount: unknown; direction: unknown; day: unknown; order: unknown; reason: unknown },
  now: Date,
): LedgerFormCheck<AdjustmentValue> {
  const amount = readTomans(form.amount);
  if (amount === null) return { ok: false, field: 'amount', error: 'settlement_amount_invalid' };
  if (form.direction !== 'plus' && form.direction !== 'minus') return { ok: false, field: 'direction', error: 'settlement_direction' };
  const day = dayOf(form.day);
  if (!day) return { ok: false, field: 'day', error: 'settlement_day_invalid' };
  if (day.getTime() > tehranDayStart(now).getTime()) return { ok: false, field: 'day', error: 'settlement_day_future' };
  const orderText = toLatinDigits(text(form.order, 20)).replace(/\s+/g, '');
  if (orderText && !/^\d{1,9}$/.test(orderText)) return { ok: false, field: 'order', error: 'settlement_order_invalid' };
  const reason = reasonOf(form.reason);
  if (!reason.ok) return reason;
  return {
    ok: true,
    value: { amountRials: form.direction === 'plus' ? amount : -amount, day, orderNumber: orderText ? Number(orderText) : null, note: reason.value },
  };
}

/** فرم «باطل کن»: فقط دلیل. */
export function readVoidForm(form: { reason: unknown }): LedgerFormCheck<string> {
  return reasonOf(form.reason);
}

/* ───────────────────────── نمایش ───────────────────────── */

const MINUS = '−';

/** مبلغ با نشانه، تومان: «+120,000»، «−80,000». */
export function signedTomansText(rials: bigint): string {
  const tomans = tomansOf(rials);
  if (tomans === 0n) return '0';
  return `${tomans < 0n ? MINUS : '+'}${tomansText(rials < 0n ? -rials : rials)}`;
}

/** مانده: «۱,۲۰۰,۰۰۰ تومان بدهی جزوه‌یار»، «۸۰,۰۰۰ تومان پیش‌پرداخت»، یا «تسویه». */
export function balanceText(rials: bigint): { amount: string; text: string; tone: 'owed' | 'credit' | 'settled' } {
  if (tomansOf(rials) === 0n) return { amount: '0', text: 'تسویه', tone: 'settled' };
  if (rials > 0n) return { amount: tomansText(rials), text: 'بدهی جزوه‌یار به چاپخانه', tone: 'owed' };
  return { amount: tomansText(-rials), text: 'بیش از سهم پرداخت شده', tone: 'credit' };
}

/** نام هر نوع ردیف دفتر، و اصلاح با جهتش. */
export function entryKindText(entry: Pick<LedgerEntry, 'kind' | 'amountRials'>): string {
  if (entry.kind === 'payment') return 'پرداخت به چاپخانه';
  return entry.amountRials > 0n ? 'اصلاح به سود چاپخانه' : 'اصلاح به زیان چاپخانه';
}

/** اثر ردیف بر مانده: پرداخت کم می‌کند، اصلاح به اندازهٔ خودش. */
export const entryEffectRials = (entry: Pick<LedgerEntry, 'kind' | 'amountRials'>) => (entry.kind === 'payment' ? -entry.amountRials : entry.amountRials);

/** «بابت 1 مهر تا 30 مهر»، یا یک روز. */
export function periodText(period: SettlementRange, now: Date): string {
  const last = tehranDayStart(period.until, -1);
  const first = dayLabel(period.from, now);
  return period.from.getTime() === last.getTime() ? `بابت ${first}` : `بابت ${first} تا ${dayLabel(last, now)}`;
}

/** جمع‌های بازه از فهرست‌های صورت‌حساب؛ باطل‌شده هیچ. همان که صفحه و سند نشان می‌دهند. */
export interface SettlementTotals {
  /** سهم «تحویل پست شد»های بازه و شمارشان؛ بی سهم‌ها جدا. */
  handedRials: bigint;
  handed: number;
  unshared: number;
  paymentsRials: bigint;
  adjustmentsRials: bigint;
  inFlightRials: bigint;
}

export function settlementTotals(statement: Pick<PanelStatement, 'handed' | 'ledger' | 'inFlight'>): SettlementTotals {
  const live = statement.ledger.filter((entry) => !entry.voided);
  const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);
  return {
    handedRials: sum(statement.handed.map((order) => order.shareRials ?? 0n)),
    handed: statement.handed.length,
    unshared: statement.handed.filter((order) => order.shareRials === null).length,
    paymentsRials: sum(live.filter((entry) => entry.kind === 'payment').map((entry) => entry.amountRials)),
    adjustmentsRials: sum(live.filter((entry) => entry.kind === 'adjustment').map((entry) => entry.amountRials)),
    inFlightRials: sum(statement.inFlight.map((order) => order.shareRials ?? 0n)),
  };
}

/* ───────────────────────── سند خروجی ───────────────────────── */

const tomans = (rials: bigint) => Number(tomansOf(rials));
const shareCell = (order: PanelSettlementOrder) => (order.shareBp === null ? 'بی سهم' : shareText(order.shareBp));

/**
 * سند خروجی صورت‌حساب (سؤال ۴۰۰): مانده‌ها و جمع‌های بازه، «تحویل پست شد»ها، لغو پس از شروع چاپ، در راه، و پرداخت‌ها و اصلاح‌ها با
 * باطل‌شده‌ها. `money`: ستون «پایهٔ سهم» (مبلغ مشتری، فقط `orders.money`). کد پیگیری و یادداشت در سند هست، چون صورت‌حساب همان دفتر است.
 */
export function settlementDocument(input: {
  statement: PanelStatement;
  query: SettlementQuery;
  money: boolean;
  made: { at: Date; by: string };
}): ReportDocument {
  const { statement, query, money, made } = input;
  const { partner } = statement;
  const totals = settlementTotals(statement);
  const notes: string[] = [];
  notes.push(partner.shareBp === null ? 'درصد سهم این چاپخانه تعیین نشده.' : `درصد سهم امروز: ${shareText(partner.shareBp)}`);
  if (totals.unshared > 0) notes.push(`${totals.unshared} سفارش تحویل‌شدهٔ بی سهم در این بازه، در هیچ جمعی نیست.`);
  if (statement.balanceRials !== statement.closingRials) {
    notes.push(`ماندهٔ امروز، با آنچه پس از بازه آمد: ${signedTomansText(statement.balanceRials)} تومان.`);
  }
  const orderColumns = [
    { label: 'شماره', numeric: true, plain: true },
    { label: 'روز' },
    ...(money ? [{ label: 'پایهٔ سهم (تومان)', numeric: true }] : []),
    { label: 'درصد' },
    { label: 'سهم (تومان)', numeric: true },
  ];
  const orderRow = (order: PanelSettlementOrder) => [
    order.orderNumber,
    order.at ? formatJalaliNumeric(order.at) : '',
    ...(money ? [order.baseRials === null ? null : tomans(order.baseRials)] : []),
    shareCell(order),
    order.shareRials === null ? null : tomans(order.shareRials),
  ];
  const tables: ReportTable[] = [];
  if (statement.cancelledAfterPrint.length > 0) {
    tables.push({
      title: 'لغو پس از شروع چاپ',
      columns: orderColumns,
      rows: statement.cancelledAfterPrint.map(orderRow),
      note: 'در مانده نیست؛ اگر بخشی از آن به چاپخانه می‌رسد، با «اصلاح» برای همان سفارش ثبت می‌شود.',
    });
  }
  if (statement.inFlight.length > 0) {
    tables.push({
      title: 'در راه (در صف چاپ و در حال چاپ)',
      columns: [{ label: 'شماره', numeric: true, plain: true }, { label: 'وضعیت' }, { label: 'درصد' }, { label: 'سهم (تومان)', numeric: true }],
      rows: statement.inFlight.map((order) => [
        order.orderNumber,
        STATUS_LABELS[order.status],
        shareCell(order),
        order.shareRials === null ? null : tomans(order.shareRials),
      ]),
      note: 'هنوز در مانده نیست؛ با «تحویل پست شد» قطعی می‌شود.',
    });
  }
  tables.push({
    title: 'پرداخت‌ها و اصلاح‌ها',
    columns: [
      { label: 'روز' },
      { label: 'نوع' },
      { label: 'مبلغ (تومان)', numeric: true },
      { label: 'بابت' },
      { label: 'کد پیگیری' },
      { label: 'سفارش', numeric: true, plain: true },
      { label: 'یادداشت یا دلیل' },
      { label: 'ثبت' },
    ],
    rows: statement.ledger.map((entry) => [
      formatJalaliNumeric(entry.day),
      entry.voided ? `${entryKindText(entry)} (باطل: ${entry.voided.reason})` : entryKindText(entry),
      tomans(entryEffectRials(entry)),
      entry.period ? periodText(entry.period, made.at).replace(/^بابت /, '') : '',
      entry.tracking ?? '',
      entry.orderNumber,
      entry.note ?? '',
      entry.createdByName ?? '',
    ]),
    note: statement.ledger.length === 0 ? 'در این بازه پرداخت یا اصلاحی ثبت نشده.' : 'مبلغ با اثرش بر مانده: پرداخت منفی؛ باطل‌شده در هیچ جمعی نیست.',
  });
  return {
    title: 'صورت‌حساب تسویه',
    subtitle: `${partner.name} · ${partner.cityName} · ${segText(query.label)}`,
    made: madeText(made.at, made.by),
    notes,
    stats: [
      { label: 'مانده از پیش (تومان)', value: tomans(statement.openingRials) },
      { label: 'سفارش تحویل‌شده', value: totals.handed },
      { label: 'سهم سفارش‌ها (تومان)', value: tomans(totals.handedRials) },
      { label: 'پرداخت (تومان)', value: tomans(totals.paymentsRials) },
      { label: 'اصلاح (تومان)', value: tomans(totals.adjustmentsRials) },
      { label: 'مانده پایان بازه (تومان)', value: tomans(statement.closingRials) },
    ],
    tables,
    detail:
      statement.handed.length === 0
        ? null
        : { title: 'سفارش‌های تحویل‌شده', columns: orderColumns, rows: statement.handed.map(orderRow) },
    // نام فایل ASCII است (`report_exports_file_name`)، پس نام چاپخانه نه؛ هشت نویسهٔ اول شناسه‌اش صورت‌حساب‌ها را از هم جدا می‌کند.
    fileBase: `tasvie-${partner.id.slice(0, 8)}-${query.fileRange}`,
  };
}
