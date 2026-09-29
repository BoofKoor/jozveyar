/**
 * نامزدهای صف تأیید (برش ۶٫۲، ADR-046؛ تصمیم‌های ۷۷ و ۷۸): برای یک سطر فایل پست که سفارشش قطعی نیست، کدام سفارش‌ها پیشنهاد
 * می‌شوند، هر کدام با پنج معیار («می‌خواند»، «نمی‌خواند» یا نامعلوم)، نمره برای ترتیب، و اینکه کدام از پیش انتخاب می‌شود.
 *
 * خالص و بی I/O، مثل `postfile.ts`: سفارش‌ها را ذخیره‌گاه می‌آورد (`shipments.ts`، همیشه در محدودهٔ واردکننده)، و همین تابع‌ها در
 * سه جا اجرا می‌شوند: «ثبت» (سطر بی شماره‌ای که نامزد دارد به صف می‌رود)، خود صف، و زیر قفل «همین است».
 *
 * - **نامزدها** (حداکثر سه):
 *   - سفارشی که شماره‌اش در «نام گ» آمده، اگر پرداخت شده و هنوز کد رهگیری ندارد، حتی «در صف چاپ» (ADR-046: «در صف چاپ» فقط با
 *     تأیید)؛ لغوشده دیده می‌شود ولی بسته است (طرح `m-ship-review`).
 *   - سفارش‌های «در حال چاپ» یا «تحویل پست شد» بی کد رهگیری که نام خانوادگی‌شان می‌خواند و در ۴۵ روزِ پیش از روز پست همان بسته
 *     پرداخت شده‌اند؛ مبنا روز پست است نه امروز، تا سطری که در صف ماند نامزدش را از دست ندهد.
 * - **معیارها:** شماره، نام خانوادگی (همان قاعدهٔ «قطعی»)، شهر (مقصد با شهر یا استان سفارش؛ مقصد ناشناس نامعلوم)، وزن (تا ۳۰٪ یا
 *   ۱۵۰ گرم فرق با برآورد) و روز (برای «تحویل پست شد» همان روز تحویل یا یک روز فاصله؛ پیش از پرداخت «نمی‌خواند»).
 * - **نمره:** نام خانوادگی ۳، شماره ۲، شهر ۲، وزن ۱، روز ۱.
 * - **از پیش انتخاب:** فقط نامزد «قوی» (نام خانوادگی و شهر، و از شماره، وزن و روز دست‌کم دو تا)، و فقط وقتی تنها نامزد قوی است،
 *   نمره‌اش از همهٔ بقیه بیشتر است، «همین است»ش باز است، و کد همین سطر پیش‌تر از آن کنار نرفته. هم‌نمره: هیچ‌کدام.
 */

import { tehranDayStart } from '@jozveyar/text';

import { destinationMatch, nameFits, type OrderFacts } from './postfile.js';

export type CriterionKey = 'number' | 'surname' | 'city' | 'weight' | 'day';
/** «می‌خواند»، «نمی‌خواند»، یا نامعلوم (نشان داده نمی‌شود). */
export type Criterion = 'yes' | 'no' | null;
export type Criteria = Record<CriterionKey, Criterion>;

/** نمرهٔ هر معیار برای ترتیب نامزدها (تصمیم ۷۷). */
export const CRITERION_POINTS: Readonly<Record<CriterionKey, number>> = { surname: 3, number: 2, city: 2, weight: 1, day: 1 };
/** ترتیب نوشتن معیارها کنار نامزد (طرح): «می‌خواند: شماره، نام خانوادگی، شهر، وزن، روز». */
export const CRITERION_ORDER: readonly CriterionKey[] = ['number', 'surname', 'city', 'weight', 'day'];
/** پنجرهٔ نامزدها: پرداخت در این چند روزِ پیش از روز پست همان بسته (ADR-046، تصمیم ۷۷). */
export const CANDIDATE_WINDOW_DAYS = 45;
export const MAX_CANDIDATES = 3;
/** وزن «می‌خواند»: تا این نسبت برآورد، یا تا این چند گرم، هر کدام بیشتر (بسته‌بندی سبک یا سنگین). */
export const WEIGHT_TOLERANCE = 0.3;
export const WEIGHT_SLACK_GRAMS = 150;
/** روز «می‌خواند»: روز پست بسته با روز «تحویل پست شد» سفارش تا این چند روز فاصله دارد. */
export const DAY_SLACK = 1;

const DAY_MS = 86_400_000;

/** سفارشی که می‌تواند نامزد باشد، با آنچه معیارها و دروازه‌های «همین است» لازم دارند. */
export interface CandidateOrder extends OrderFacts {
  handedToPostAt: Date | null;
  estWeightGrams: number;
  /** مرسوله‌های زندهٔ همین حالا؛ نامزد کد ندارد. */
  liveShipments: number;
  /** فایل چاپ همهٔ جزوه‌ها ساخته شده و فایل‌ها پاک نشده (دروازهٔ «شروع چاپ»، ADR-043)؛ برای «در صف چاپ». */
  printReady: boolean;
  /** چاپخانه دارد (دروازهٔ «شروع چاپ»، ADR-042)؛ برای «در صف چاپ». */
  hasPartner: boolean;
}

/** آنچه سطر فایل برای نامزدها لازم دارد. */
export interface CandidateRow {
  /** عدد انتهای «نام گ»؛ null برای سطر بی شماره. */
  orderNumber: number | null;
  /** «نام گ» بی شماره؛ خالی اگر متن سطر پاک شده. */
  surname: string;
  destination: string;
  weightGrams: number | null;
  /** آغاز روز پست به وقت تهران. */
  postDay: Date | null;
}

/** چرا «همین است» برای یک نامزد بسته است. */
export type CandidateBlock = 'cancelled' | 'before_payment' | 'needs_partner' | 'needs_print';

export interface Candidate<O extends CandidateOrder = CandidateOrder> {
  order: O;
  criteria: Criteria;
  score: number;
  strong: boolean;
  /** شمارهٔ «نام گ» همین سفارش است. */
  numbered: boolean;
  blocked: CandidateBlock | null;
  /** کد همین سطر پیش‌تر از همین سفارش کنار رفت: می‌ماند، ولی هرگز از پیش انتخاب نمی‌شود (تصمیم ۷۸). */
  voidedHere: boolean;
}

export interface CandidateList<O extends CandidateOrder = CandidateOrder> {
  candidates: Candidate<O>[];
  /** نامزدی که از پیش انتخاب شده؛ null یعنی ادمین خودش انتخاب می‌کند. */
  preselected: string | null;
}

const isPaid = (status: OrderFacts['status']) => status === 'paid' || status === 'printing' || status === 'handed_to_post';

/** فاصلهٔ دو روز تهران، به روز. */
const daysBetween = (a: Date, b: Date) => Math.round(Math.abs(tehranDayStart(a).getTime() - tehranDayStart(b).getTime()) / DAY_MS);

/** وزن بسته با برآورد سفارش می‌خواند: تا ۳۰٪ یا ۱۵۰ گرم فرق. */
export function weightFits(actualGrams: number, estimatedGrams: number): boolean {
  return Math.abs(actualGrams - estimatedGrams) <= Math.max(estimatedGrams * WEIGHT_TOLERANCE, WEIGHT_SLACK_GRAMS);
}

/** پنج معیار یک سفارش برای یک سطر. */
export function criteriaOf(row: CandidateRow, order: CandidateOrder): Criteria {
  const place = destinationMatch(row.destination, order);
  let day: Criterion = null;
  if (row.postDay && order.paidAt && row.postDay < tehranDayStart(order.paidAt)) day = 'no';
  else if (row.postDay && order.status === 'handed_to_post' && order.handedToPostAt) {
    day = daysBetween(row.postDay, order.handedToPostAt) <= DAY_SLACK ? 'yes' : 'no';
  }
  return {
    number: row.orderNumber === null ? null : row.orderNumber === order.orderNumber ? 'yes' : 'no',
    surname: row.surname ? (nameFits(row.surname, order.recipientName) ? 'yes' : 'no') : null,
    city: place === null ? null : place ? 'yes' : 'no',
    weight: row.weightGrams && order.estWeightGrams > 0 ? (weightFits(row.weightGrams, order.estWeightGrams) ? 'yes' : 'no') : null,
    day,
  };
}

export function scoreOf(criteria: Criteria): number {
  return CRITERION_ORDER.reduce((sum, key) => sum + (criteria[key] === 'yes' ? CRITERION_POINTS[key] : 0), 0);
}

/** «قوی»: نام خانوادگی و شهر می‌خوانند، و از شماره، وزن و روز دست‌کم دو تا (تصمیم ۷۸). */
export function isStrong(criteria: Criteria): boolean {
  const others = (['number', 'weight', 'day'] as const).filter((key) => criteria[key] === 'yes').length;
  return criteria.surname === 'yes' && criteria.city === 'yes' && others >= 2;
}

/**
 * چرا «همین است» برای این سفارش بسته است: لغوشده (اول لغو برگردد)؛ بسته‌ای که پیش از روز پرداخت به پست رسید، مال این سفارش
 * نیست؛ و «در صف چاپ» فقط با دروازه‌های «شروع چاپ»: اول چاپخانه، بعد فایل چاپ (همان ترتیب صفحهٔ سفارش).
 */
export function blockOf(row: Pick<CandidateRow, 'postDay'>, order: CandidateOrder): CandidateBlock | null {
  if (order.status === 'cancelled') return 'cancelled';
  if (row.postDay && order.paidAt && row.postDay < tehranDayStart(order.paidAt)) return 'before_payment';
  if (order.status === 'paid' && !order.hasPartner) return 'needs_partner';
  if (order.status === 'paid' && !order.printReady) return 'needs_print';
  return null;
}

/** سفارش همان شمارهٔ «نام گ» که نامزد است: پرداخت‌شده یا لغوشده، و هنوز بی کد. */
export function isNumberedCandidate(row: Pick<CandidateRow, 'orderNumber'>, order: CandidateOrder): boolean {
  return (
    row.orderNumber === order.orderNumber && order.liveShipments === 0 && (isPaid(order.status) || order.status === 'cancelled')
  );
}

/**
 * نامزد از پنجرهٔ ۴۵ روزه: «در حال چاپ» یا «تحویل پست شد»، بی کد، پرداخت در ۴۵ روزِ پیش از روز پست بسته (و نه پس از آن)، و نام
 * خانوادگی‌اش می‌خواند.
 */
export function isPoolCandidate(row: CandidateRow, order: CandidateOrder): boolean {
  if (!row.postDay || !order.paidAt || !row.surname) return false;
  if (order.status !== 'printing' && order.status !== 'handed_to_post') return false;
  if (order.liveShipments > 0) return false;
  const paidDay = tehranDayStart(order.paidAt);
  if (paidDay > row.postDay || paidDay < tehranDayStart(row.postDay, -CANDIDATE_WINDOW_DAYS)) return false;
  return nameFits(row.surname, order.recipientName);
}

/**
 * نامزدهای یک سطر از میان سفارش‌هایی که ذخیره‌گاه آورد (همه در محدودهٔ واردکننده): به ترتیب نمره، بعد وزن نزدیک‌تر، بعد شمارهٔ
 * کوچک‌تر؛ حداکثر سه، و سفارش همان شماره همیشه در فهرست (اگر نامزد است). `voided`: سفارش‌هایی که کد همین سطر از آن‌ها کنار رفت.
 */
export function candidatesFor<O extends CandidateOrder>(
  row: CandidateRow,
  orders: readonly O[],
  voided: ReadonlySet<string> = new Set(),
): CandidateList<O> {
  const seen = new Set<string>();
  const all: Candidate<O>[] = [];
  for (const order of orders) {
    if (seen.has(order.id)) continue;
    const numbered = isNumberedCandidate(row, order);
    if (!numbered && !isPoolCandidate(row, order)) continue;
    seen.add(order.id);
    const criteria = criteriaOf(row, order);
    all.push({
      order,
      criteria,
      score: scoreOf(criteria),
      strong: isStrong(criteria),
      numbered,
      blocked: blockOf(row, order),
      voidedHere: voided.has(order.id),
    });
  }
  const gap = (c: Candidate<O>) => (row.weightGrams ? Math.abs(row.weightGrams - c.order.estWeightGrams) : 0);
  all.sort((a, b) => b.score - a.score || gap(a) - gap(b) || a.order.orderNumber - b.order.orderNumber);
  let candidates = all.slice(0, MAX_CANDIDATES);
  const numbered = all.find((c) => c.numbered);
  if (numbered && !candidates.includes(numbered)) candidates = [...candidates.slice(0, MAX_CANDIDATES - 1), numbered];

  const strong = candidates.filter((c) => c.strong);
  const top = strong.length === 1 ? strong[0]! : null;
  const preselected =
    top && !top.blocked && !top.voidedHere && candidates.every((c) => c === top || c.score < top.score) ? top.order.id : null;
  return { candidates, preselected };
}
