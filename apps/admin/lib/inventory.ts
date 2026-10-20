/**
 * موجودی کاغذ در پنل (برش ۱۰٫۴، ADR-070؛ سؤال ۲۰۴، پاسخ «همهٔ چاپخانه‌ها»، و اجرا ۴۰۴ تا ۴۲۰): خواندن فرم‌ها و متن‌های نمایش، بی نکست و بی
 * پایگاه داده. شمار برگ با ارقام فارسی و جداکننده هم پذیرفته است (سؤال ۴۰۴)؛ یادداشت و دلیل فارسی‌نرمال.
 */

import type { PaperSize } from '@jozveyar/contracts';
import {
  PAPER_SIZE_LABEL,
  PAPER_STOCK_MAX_SHEETS,
  STOCK_NOTE_MAX,
  type ManualMoveKind,
  type StockAlert,
  type StockItem,
  type StockMoveKind,
} from '@jozveyar/db';
import { formatNumber, toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

export { PAPER_STOCK_MAX_SHEETS, STOCK_NOTE_MAX };

export type StockFormError =
  | 'stock_kind_invalid'
  | 'stock_sheets_invalid'
  | 'stock_count_invalid'
  | 'stock_note_required'
  | 'stock_note_too_long'
  | 'stock_paper_invalid'
  | 'stock_threshold_invalid';

export type StockField = 'kind' | 'sheets' | 'note' | 'paper' | 'counted' | 'threshold';

export type StockFormCheck<T> = { ok: true; value: T } | { ok: false; field: StockField; error: StockFormError };

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max).trim() : '');

/** شمار برگ تایپ‌شده (ارقام فارسی و جداکننده هم)؛ null یعنی نادرست یا بیرون از بازه. */
export function readSheets(input: unknown, { zero }: { zero: boolean }): number | null {
  const clean = toLatinDigits(text(input, 30)).replace(/[\s,٬،']/g, '');
  if (!/^\d{1,9}$/.test(clean)) return null;
  const sheets = Number(clean);
  return sheets < (zero ? 0 : 1) || sheets > PAPER_STOCK_MAX_SHEETS ? null : sheets;
}

/** یادداشت یا دلیل، فارسی‌نرمال، تا ۳۰۰ نویسه؛ خالی null. */
function noteOf(input: unknown): string | null | 'long' {
  const note = tidyInputFa(typeof input === 'string' ? input.slice(0, STOCK_NOTE_MAX * 2) : '');
  if (note.length > STOCK_NOTE_MAX) return 'long';
  return note || null;
}

export interface MoveValue {
  kind: ManualMoveKind;
  /** ورود و ضایعات: برگ؛ شمارش: موجودی شمرده‌شده. */
  sheets: number;
  note: string | null;
}

/**
 * فرم «ثبت» یک قلم (سؤال ۴۰۹): نوع، برگ و یادداشت. ورود دست‌کم یک برگ با یادداشت اختیاری؛ ضایعات دست‌کم یک برگ با دلیل؛ شمارش موجودی واقعی
 * (صفر هم) با دلیل. اولین خطا با جایش.
 */
export function readMoveForm(form: { kind: unknown; sheets: unknown; note: unknown }): StockFormCheck<MoveValue> {
  const kind = form.kind;
  if (kind !== 'purchase' && kind !== 'waste' && kind !== 'count') return { ok: false, field: 'kind', error: 'stock_kind_invalid' };
  const sheets = readSheets(form.sheets, { zero: kind === 'count' });
  if (sheets === null) return { ok: false, field: 'sheets', error: kind === 'count' ? 'stock_count_invalid' : 'stock_sheets_invalid' };
  const note = noteOf(form.note);
  if (note === 'long') return { ok: false, field: 'note', error: 'stock_note_too_long' };
  if (note === null && kind !== 'purchase') return { ok: false, field: 'note', error: 'stock_note_required' };
  return { ok: true, value: { kind, sheets, note } };
}

/** آستانه: خالی یعنی بی آستانه؛ وگرنه ۰ تا سقف. */
function thresholdOf(input: unknown): StockFormCheck<number | null> {
  if (text(input, 30) === '') return { ok: true, value: null };
  const sheets = readSheets(input, { zero: true });
  return sheets === null ? { ok: false, field: 'threshold', error: 'stock_threshold_invalid' } : { ok: true, value: sheets };
}

export const readThresholdForm = (form: { threshold: unknown }) => thresholdOf(form.threshold);

export interface TrackValue {
  paperTypeId: string;
  paperSize: PaperSize;
  countedSheets: number;
  thresholdSheets: number | null;
}

/** مقدار گزینهٔ «کاغذ» فرم «کاغذ تازه»: شناسهٔ کاغذ و اندازه. */
export const paperOption = (paperTypeId: string, paperSize: PaperSize) => `${paperTypeId}:${paperSize}`;

/** فرم «کاغذ تازه» (سؤال ۴۰۵): کاغذ و اندازه از فهرست، موجودی امروز (صفر هم)، و آستانهٔ اختیاری. */
export function readTrackForm(form: { paper: unknown; counted: unknown; threshold: unknown }): StockFormCheck<TrackValue> {
  const match = /^([a-z][a-z0-9_]{1,39}):(a4|a5|a3)$/.exec(text(form.paper, 50));
  if (!match) return { ok: false, field: 'paper', error: 'stock_paper_invalid' };
  const countedSheets = readSheets(form.counted, { zero: true });
  if (countedSheets === null) return { ok: false, field: 'counted', error: 'stock_count_invalid' };
  const threshold = thresholdOf(form.threshold);
  if (!threshold.ok) return threshold;
  return { ok: true, value: { paperTypeId: match[1]!, paperSize: match[2] as PaperSize, countedSheets, thresholdSheets: threshold.value } };
}

/* ───────────────────────── نمایش ───────────────────────── */

const MINUS = '−';

/** «1,200»، و منفی با منهای واقعی: «−120». */
export const sheetsNumber = (sheets: number) => (sheets < 0 ? `${MINUS}${formatNumber(-sheets)}` : formatNumber(sheets));

/** تغییر یک ردیف با نشانه: «+500»، «−40»، و شمارش بی تغییر «0». */
export const deltaText = (delta: number) => (delta > 0 ? `+${formatNumber(delta)}` : sheetsNumber(delta));

/** «تحریر ۸۰ گرم A4»؛ کاغذی که هیچ نسخه‌ای نامش را نداشت با شناسه‌اش. */
export const itemLabel = (item: Pick<StockItem, 'paperName' | 'paperTypeId' | 'paperSize'>) =>
  `${item.paperName ?? item.paperTypeId} ${PAPER_SIZE_LABEL[item.paperSize]}`;

export const MOVE_KIND_LABELS: Record<StockMoveKind, string> = {
  purchase: 'ورود',
  waste: 'ضایعات',
  count: 'شمارش',
  print: 'شروع چاپ',
  unprint: 'برگشت چاپ',
};

export type StockTone = 'error' | 'warning' | 'ok';

/** حال قلم برای فهرست‌ها (سؤال ۴۱۳): منفی، کمتر از نیاز صف، زیر آستانه، یا کافی. */
export function stockState(item: Pick<StockItem, 'balanceSheets' | 'thresholdSheets' | 'queued'>): { tone: StockTone; text: string } {
  if (item.balanceSheets < 0) return { tone: 'error', text: 'کمتر از صفر' };
  if (item.queued.sheets > 0 && item.queued.sheets > item.balanceSheets) return { tone: 'error', text: 'کمتر از نیاز صف' };
  if (item.thresholdSheets !== null && item.balanceSheets < item.thresholdSheets) return { tone: 'warning', text: 'زیر آستانه' };
  return { tone: 'ok', text: 'کافی' };
}

/** دلیل هشدار پیشخوان (سؤال ۴۱۳): منفی و کمتر از نیاز صف پیش از آستانه، چون کاغذ سفارش‌های صف همین حالا کم است. */
export function alertReason(alert: Pick<StockAlert, 'negative' | 'belowThreshold' | 'shortForQueue'>): 'negative' | 'short' | 'low' {
  if (alert.negative) return 'negative';
  return alert.shortForQueue ? 'short' : 'low';
}
