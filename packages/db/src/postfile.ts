/**
 * تفسیر فایل پست (برش ۶٫۱، ADR-045، ADR-046): جدول رشته‌هایی که کارگر خواند (`read_post_file`) ← سطرهای بسته با خانه‌های
 * خوانده‌شده، و حکم هر سطر در برابر سفارش‌ها. خالص و بی I/O: همان در پیش‌نمایش و دوباره در «ثبت» زیر قفل.
 *
 * قاعده‌های اثبات‌شدهٔ ADR-010 و نمونهٔ واقعی (۱۴۰۵/۰۷/۰۶، `FileName-1954.xls`):
 * - سرستون‌ها با `normalizeFa` یکدست می‌شوند؛ «بارکد » و «تاریخ ثبت » فاصلهٔ ته دارند، و فایل windows-1256 «باركد» دارد.
 * - کد سفارش **فقط** از «نام گ» و فقط عدد انتهای آن (`extractOrderCodeFromRecipient`)؛ هیچ‌وقت در همهٔ ستون‌ها نگرد: ستون
 *   وزن هم عدد ۴ رقمی دارد.
 * - بارکد فقط رشتهٔ دقیقاً ۲۴ رقمی، پس از فاصلهٔ دو سر (در فایل واقعی فاصلهٔ نشکن ته دارد): عدد، نماد علمی یا اعشار گرد شده
 *   است و «خوانده نشد».
 * - ردیف «جمع کل» دور ریخته می‌شود (بارکدش عددی نیست)، ولی جمعش با جمع سطرها سنجیده می‌شود.
 * - «شماره مرجع» و «شماره ثبت» سطح دسته‌اند و «آدرس گ» خوانده نمی‌شود.
 * - کرایه و مالیات ریال‌اند؛ «هزینه کل» همان کرایه + مالیات است (سؤال ۷۲: ناهمخوانی فقط هشدار) و «بیمه» در آن نیست.
 * - «تاریخ ثبت» هر سطر روزی است که پست همان بسته را از ما گرفت (سؤال ۷۰)؛ «وضعیت» فقط «فعال» ثبت‌شدنی است (سؤال ۷۱).
 */

import { createHash } from 'node:crypto';
import { CITIES, PROVINCES, searchKey } from '@jozveyar/geo';
import {
  extractOrderCodeFromRecipient,
  normalizeFa,
  parseJalaliNumeric,
  recipientSurname,
  tehranDayStart,
} from '@jozveyar/text';

/* ───────────────────────── حامل: پست ایران ───────────────────────── */

/** ستون‌هایی که خوانده می‌شوند؛ بقیهٔ ۲۲ ستون فایل پست دست نمی‌خورند. */
export type PostColumn = 'barcode' | 'recipient' | 'destination' | 'weight' | 'fare' | 'tax' | 'date' | 'status' | 'total';

/**
 * حامل پشت اینترفیس (قاعدهٔ ۷، ADR-008): شکل فایل و پیوند رهگیری. حامل دیگر (تیپاکس، پیک محلی چاپخانه) پیاده‌سازی تازه است،
 * نه شرط تازه در کد.
 */
export interface ShippingCarrier {
  readonly id: 'iran_post';
  readonly name: string;
  /** سرستون یکدست‌شده ← ستون. */
  readonly headers: Readonly<Record<string, PostColumn>>;
  /** ستون‌هایی که بی آن‌ها فایل «خوانده نشد» است. */
  readonly required: readonly PostColumn[];
  /** وضعیتی که بسته ثبت‌شدنی است. */
  readonly activeStatus: string;
  /** پیوند رهگیری یک بسته؛ فقط `<a>` می‌شود، چیزی از آن بار نمی‌شود (قاعدهٔ ۸، ADR-047). */
  trackingUrl(barcode: string): string;
}

export const IRAN_POST: ShippingCarrier = {
  id: 'iran_post',
  name: 'پست ایران',
  headers: {
    [normalizeFa('بارکد')]: 'barcode',
    [normalizeFa('نام گ')]: 'recipient',
    [normalizeFa('مقصد')]: 'destination',
    [normalizeFa('وزن')]: 'weight',
    [normalizeFa('کرایه پستی')]: 'fare',
    [normalizeFa('مالیات')]: 'tax',
    [normalizeFa('تاریخ ثبت')]: 'date',
    [normalizeFa('وضعیت')]: 'status',
    [normalizeFa('هزینه کل')]: 'total',
  },
  required: ['barcode', 'recipient', 'destination', 'weight', 'fare', 'tax', 'date', 'status'],
  activeStatus: normalizeFa('فعال'),
  // شکل نشانی از فایل پست و ابزارهای رهگیری؛ با یک بارکد واقعی روی گوشی سنجیده می‌شود (کار دستی، ADR-047).
  trackingUrl: (barcode) => `https://tracking.post.ir/search.aspx?id=${encodeURIComponent(barcode)}`,
};

/* ───────────────────────── خواندن سطرها ───────────────────────── */

/** مشکلی که سطر را پیش از هر سفارشی «خوانده نشد» یا «غیرفعال» می‌کند. */
export type RowProblem = 'barcode' | 'numbers' | 'date' | 'inactive';

export interface PostRow {
  /** شمارهٔ سطر پس از سرستون: اولین سطر زیر سرستون 1، مثل ستون «ردیف» فایل پست. */
  rowNo: number;
  /** خانه‌های خام همان سطر. */
  cells: string[];
  /** دقیقاً ۲۴ رقم، یا null. */
  barcode: string | null;
  /** متن خانهٔ بارکد پس از یکدست‌سازی، برای نشان دادن آنچه خوانده نشد. */
  barcodeText: string;
  orderNumber: number | null;
  /** «نام گ» یکدست‌شده، و همان بی شماره. */
  nameG: string;
  surname: string;
  destination: string;
  weightGrams: number | null;
  fareRials: number | null;
  taxRials: number | null;
  /** «هزینه کل»، اگر ستونش بود. */
  totalRials: number | null;
  /** آغاز روز «تاریخ ثبت» به وقت تهران. */
  postDay: Date | null;
  postStatus: string;
  problem: RowProblem | null;
  /** کرایه + مالیات با «هزینه کل» نمی‌خواند (سؤال ۷۲): هشدار، نه مانع. */
  costMismatch: boolean;
}

export interface PostTotals {
  parcels: number;
  weightGrams: number;
  fareRials: number;
  taxRials: number;
}

export type PostSheet =
  | {
      ok: true;
      carrier: ShippingCarrier;
      /** شمارهٔ سرستون در جدول. */
      headerRow: number;
      rows: PostRow[];
      /** جمع سطرهای بسته. */
      sums: PostTotals;
      /** ردیف «جمع کل» فایل، اگر بود، با خانه‌های خامش. */
      fileTotal: (PostTotals & { rowNo: number; cells: string[] }) | null;
    }
  | { ok: false; code: 'missing_column'; missing: PostColumn[] };

/** بزرگ‌ترین `integer` پستگرس؛ وزن در ستون `integer` می‌نشیند، پس وزن بزرگ‌تر «خوانده نشد» است، نه خطای ثبت. */
const INT4_MAX = 2_147_483_647;

/** عدد صحیح نامنفی از خانهٔ فایل: ارقام فارسی لاتین، جداکنندهٔ هزارگان رها؛ جز این، null. */
function integerOf(cell: string | undefined, max = Number.MAX_SAFE_INTEGER): number | null {
  const text = normalizeFa(cell ?? '').replace(/[,،٬]/g, '');
  if (!/^\d{1,15}$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value <= max ? value : null;
}

function isTotalRow(barcodeText: string): boolean {
  return barcodeText.replace(/\s/g, '').startsWith('جمعکل');
}

/**
 * جدول‌های فایل ← سطرهای بسته. اولین جدولی که همهٔ ستون‌های لازم را در یک سطر دارد؛ اگر هیچ‌کدام نداشت، ستون‌هایی که در
 * نزدیک‌ترین جدول نبودند.
 */
export function readPostSheet(tables: readonly (readonly (readonly string[])[])[], carrier: ShippingCarrier = IRAN_POST): PostSheet {
  let best: PostColumn[] = [...carrier.required];
  for (const table of tables) {
    for (let r = 0; r < Math.min(table.length, 20); r += 1) {
      const columns = new Map<PostColumn, number>();
      table[r]!.forEach((cell, i) => {
        const column = carrier.headers[normalizeFa(cell)];
        if (column && !columns.has(column)) columns.set(column, i);
      });
      const missing = carrier.required.filter((c) => !columns.has(c));
      if (missing.length < best.length) best = missing;
      if (missing.length === 0) return sheetOf(table, r, columns, carrier);
    }
  }
  return { ok: false, code: 'missing_column', missing: best };
}

function sheetOf(
  table: readonly (readonly string[])[],
  headerRow: number,
  columns: Map<PostColumn, number>,
  carrier: ShippingCarrier,
): PostSheet {
  const at = (row: readonly string[], column: PostColumn) => {
    const i = columns.get(column);
    return i === undefined ? '' : (row[i] ?? '');
  };
  const rows: PostRow[] = [];
  let fileTotal: (PostTotals & { rowNo: number; cells: string[] }) | null = null;
  for (let r = headerRow + 1; r < table.length; r += 1) {
    const cells = [...table[r]!];
    if (!cells.some((cell) => normalizeFa(cell))) continue; // سطر خالی
    const barcodeText = normalizeFa(at(cells, 'barcode'));
    if (isTotalRow(barcodeText)) {
      fileTotal = {
        rowNo: r - headerRow,
        cells,
        parcels: 0,
        weightGrams: integerOf(at(cells, 'weight'), INT4_MAX) ?? 0,
        fareRials: integerOf(at(cells, 'fare')) ?? 0,
        taxRials: integerOf(at(cells, 'tax')) ?? 0,
      };
      continue;
    }
    const recipient = at(cells, 'recipient');
    const weightGrams = integerOf(at(cells, 'weight'), INT4_MAX);
    const fareRials = integerOf(at(cells, 'fare'));
    const taxRials = integerOf(at(cells, 'tax'));
    const totalRials = columns.has('total') ? integerOf(at(cells, 'total')) : null;
    const postDay = parseJalaliNumeric(normalizeFa(at(cells, 'date')));
    const postStatus = normalizeFa(at(cells, 'status'));
    const barcode = /^\d{24}$/.test(barcodeText) ? barcodeText : null;
    const problem: RowProblem | null =
      barcode === null
        ? 'barcode'
        : weightGrams === null || weightGrams === 0 || fareRials === null || taxRials === null
          ? 'numbers'
          : postDay === null
            ? 'date'
            : postStatus !== carrier.activeStatus
              ? 'inactive'
              : null;
    rows.push({
      rowNo: r - headerRow,
      cells,
      barcode,
      barcodeText,
      orderNumber: extractOrderCodeFromRecipient(recipient),
      nameG: normalizeFa(recipient),
      surname: recipientSurname(recipient),
      destination: normalizeFa(at(cells, 'destination')),
      weightGrams,
      fareRials,
      taxRials,
      totalRials,
      postDay,
      postStatus,
      problem,
      costMismatch: totalRials !== null && fareRials !== null && taxRials !== null && fareRials + taxRials !== totalRials,
    });
  }
  const sums: PostTotals = { parcels: rows.length, weightGrams: 0, fareRials: 0, taxRials: 0 };
  for (const row of rows) {
    sums.weightGrams += row.weightGrams ?? 0;
    sums.fareRials += row.fareRials ?? 0;
    sums.taxRials += row.taxRials ?? 0;
  }
  if (fileTotal) fileTotal.parcels = rows.length;
  return { ok: true, carrier, headerRow, rows, sums, fileTotal };
}

/** «جمع کل» فایل با جمع سطرها می‌خواند؟ null یعنی فایل ردیف جمع نداشت. */
export function totalsAgree(sheet: Extract<PostSheet, { ok: true }>): boolean | null {
  const total = sheet.fileTotal;
  if (!total) return null;
  return (
    total.weightGrams === sheet.sums.weightGrams && total.fareRials === sheet.sums.fareRials && total.taxRials === sheet.sums.taxRials
  );
}

/* ───────────────────────── حکم هر سطر ───────────────────────── */

export type Verdict = 'matched' | 'review' | 'unmatched' | 'duplicate' | 'invalid' | 'inactive';

/**
 * دلیل حکم؛ پنل برای هر کدام پیام دارد.
 * - خوانده نشد: `barcode`، `numbers`، `date`، `date_future`.
 * - تکراری: `same_file` (همین بارکد بالاتر در همین فایل)، `already` (پیش‌تر برای همین سفارش ثبت شده).
 * - پیدا نشد: `no_number`، `manual_code` (زیر 10001، سفارش دستی پیش از سایت)، `not_found` (نیست، پرداخت‌نشده، یا بیرون از
 *   محدودهٔ واردکننده؛ فرقشان گفته نمی‌شود، ADR-046).
 * - صف تأیید: `barcode_elsewhere`، `cancelled`، `queued` («در صف چاپ»)، `name_mismatch`، `destination_mismatch`،
 *   `date_before_payment`.
 */
export type VerdictReason =
  | 'barcode'
  | 'numbers'
  | 'date'
  | 'date_future'
  | 'inactive'
  | 'same_file'
  | 'already'
  | 'no_number'
  | 'manual_code'
  | 'not_found'
  | 'barcode_elsewhere'
  | 'cancelled'
  | 'queued'
  | 'name_mismatch'
  | 'destination_mismatch'
  | 'date_before_payment';

/** آنچه حکم از یک سفارش لازم دارد؛ فقط سفارش‌های محدودهٔ واردکننده. */
export interface OrderFacts {
  id: string;
  orderNumber: number;
  status: 'awaiting_payment' | 'paid' | 'expired' | 'printing' | 'handed_to_post' | 'cancelled';
  recipientName: string;
  provinceId: number;
  cityId: number | null;
  paidAt: Date | null;
}

/** مرسولهٔ زنده‌ای با همین بارکد؛ `orderId` null یعنی سفارشی بیرون از محدودهٔ واردکننده، که شناسه‌اش به او نمی‌رسد. */
export interface LiveShipment {
  barcode: string;
  orderId: string | null;
}

export interface Judged {
  rowNo: number;
  verdict: Verdict;
  reason: VerdictReason | null;
  /** سفارشی که سطر به آن نشست یا اشاره کرد. */
  orderId: string | null;
  /** «در حال چاپ» است و با «ثبت» «تحویل پست شد» می‌شود (سؤال ۵۲). */
  handOver: boolean;
}

/** نخستین شمارهٔ سفارش سایت؛ زیر آن کدهای دستی پیش از سایت (6004 تا 6098، ADR-034). */
export const FIRST_ORDER_NUMBER = 10001;

/** بی فاصله، برای مقایسهٔ نام: «بیک زاده»، «بیک‌زاده» و «بیکزاده» یکی‌اند. */
function compact(text: string): string {
  return normalizeFa(text).replace(/\s/g, '');
}

/** نامِ «نام گ» (بی شماره) درون نام گیرندهٔ سفارش است. */
export function nameFits(surname: string, recipientName: string): boolean {
  const part = compact(surname);
  return part.length > 0 && compact(recipientName).includes(part);
}

let placeIndex: { cities: Map<string, { provinceId: number; cityId: number }[]>; provinces: Map<string, number> } | null = null;

function places() {
  if (placeIndex) return placeIndex;
  const cities = new Map<string, { provinceId: number; cityId: number }[]>();
  for (const city of CITIES) {
    const key = searchKey(city.name);
    cities.set(key, [...(cities.get(key) ?? []), { provinceId: city.provinceId, cityId: city.id }]);
  }
  const provinces = new Map(PROVINCES.map((p) => [searchKey(p.name), p.id]));
  placeIndex = { cities, provinces };
  return placeIndex;
}

/**
 * مقصد با شهر یا استان سفارش ناسازگار نیست (ADR-046): شهری از همان استان (دفتر پست نزدیک)، یا نام همان استان، سازگار است؛
 * نام شهر یا استان دیگری ناسازگار؛ و مقصدی که نمی‌شناسیم بی‌اثر.
 */
export function destinationFits(destination: string, order: Pick<OrderFacts, 'provinceId' | 'cityId'>): boolean {
  const key = searchKey(destination);
  if (!key) return true;
  const { cities, provinces } = places();
  const asCity = cities.get(key);
  const asProvince = provinces.get(key);
  if (!asCity && asProvince === undefined) return true;
  if (asProvince === order.provinceId) return true;
  return (asCity ?? []).some((c) => c.provinceId === order.provinceId || c.cityId === order.cityId);
}

/**
 * حکم هر سطر، به ترتیب (ADR-046): خوانده نشد، غیرفعال در پست، تکراری در همین فایل، بارکد زنده، بی شماره، کد دستی، سفارش
 * ناپیدا، لغوشده، «در صف چاپ»، و بعد نام، مقصد و روز؛ فقط سطری که همه را دارد «قطعی» است.
 */
export function judgeRows(
  rows: readonly PostRow[],
  context: { orders: ReadonlyMap<number, OrderFacts>; live: ReadonlyMap<string, LiveShipment>; now: Date },
): Judged[] {
  const today = tehranDayStart(context.now);
  const seen = new Set<string>();
  return rows.map((row) => {
    const judged = (verdict: Verdict, reason: VerdictReason | null, orderId: string | null = null, handOver = false): Judged => ({
      rowNo: row.rowNo,
      verdict,
      reason,
      orderId,
      handOver,
    });
    if (row.problem === 'inactive') return judged('inactive', 'inactive');
    if (row.problem) return judged('invalid', row.problem);
    if (row.postDay! > today) return judged('invalid', 'date_future');
    const barcode = row.barcode!;
    if (seen.has(barcode)) return judged('duplicate', 'same_file');
    seen.add(barcode);
    const order = row.orderNumber === null ? undefined : context.orders.get(row.orderNumber);
    const live = context.live.get(barcode);
    if (live) {
      return order && live.orderId === order.id
        ? judged('duplicate', 'already', order.id)
        : judged('review', 'barcode_elsewhere', order?.id ?? null);
    }
    if (row.orderNumber === null) return judged('unmatched', 'no_number');
    if (row.orderNumber < FIRST_ORDER_NUMBER) return judged('unmatched', 'manual_code');
    if (!order || order.status === 'awaiting_payment' || order.status === 'expired') return judged('unmatched', 'not_found');
    if (order.status === 'cancelled') return judged('review', 'cancelled', order.id);
    if (order.status === 'paid') return judged('review', 'queued', order.id);
    if (!nameFits(row.surname, order.recipientName)) return judged('review', 'name_mismatch', order.id);
    if (!destinationFits(row.destination, order)) return judged('review', 'destination_mismatch', order.id);
    if (order.paidAt && row.postDay! < tehranDayStart(order.paidAt)) return judged('review', 'date_before_payment', order.id);
    return judged('matched', null, order.id, order.status === 'printing');
  });
}

/** همان حکم‌ها که ادمین دید: «ثبت» فقط اگر زیر قفل همین است (مثل ۴٫۵ و ۴٫۶). */
export function judgedFingerprint(judged: readonly Judged[]): string {
  const canonical = judged.map((j) => [j.rowNo, j.verdict, j.reason, j.orderId, j.handOver]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * لحظهٔ «تحویل پست شد» از روز بسته (سؤال ۵۲): پایان همان روز به وقت تهران، و اگر آن روز امروز است، همین لحظه. پس «به‌موقع»
 * (ADR-039) از روز پست است، نه از روز وارد کردن فایل.
 */
export function handedAtOf(postDay: Date, now: Date): Date {
  const end = tehranDayStart(postDay, 1);
  return end > now ? now : new Date(end.getTime() - 1000);
}
