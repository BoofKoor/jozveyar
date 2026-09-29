/**
 * زبانهٔ «ارسال» به زبان صفحه (برش ۶٫۱، طرح `m-ship`، `m-ship-preview`، `m-ship-done` و `m-order-shipped`): برچسب ورودها،
 * شمارها، سطرهای فایل با حکم و دلیلشان، و بستهٔ پستی سفارش. خالص و بی JSX، تا تست بی مرورگر بسنجدش؛ صفحه فقط می‌چیندش.
 *
 * - سطر پیش‌نمایش (جدول تفسیرشده و حکم‌ها) و سطر ثبت‌شده (`shipment_import_rows`) یک شکل می‌شوند (`ImportRowView`)، پس هر دو
 *   حالت صفحه همان گروه‌ها و همان دلیل‌ها را نشان می‌دهند.
 * - عدد در `.num` خودش و نام لاتین (نام فایل) در `bdi`، جدا از جملهٔ فارسی (`Seg`). کرایه و مالیات فایل ریال‌اند و تومان نشان
 *   داده می‌شوند (قاعدهٔ ۳).
 */

import type {
  CommittedImport,
  ImportShipment,
  PanelShipment,
  PostColumn,
  ShipmentElsewhere,
  ShipmentImportLine,
  ShipmentImportStatus,
  ShipmentImportView,
  ShipmentOrderFacts,
  ShipmentPreview,
  StoredVerdict,
  VerdictReason,
} from '@jozveyar/db';
import { formatJalaliWeekday, formatNumber, formatTehranTime, formatTomans, recipientSurname, weightParts } from '@jozveyar/text';

import { tehranDay, whenText } from './format';
import type { Seg } from './orders';

const num = (value: number): Seg => ({ num: formatNumber(value) });

/** تکه‌ها با جداکننده؛ `last` پیش از آخری: «10013، 10017 و 10021». */
function joined(parts: Seg[][], separator = ' · ', last = separator): Seg[] {
  return parts.flatMap((part, i) => (i === 0 ? part : [i === parts.length - 1 ? last : separator, ...part]));
}

/** «10013 و 10017»، «10013، 10017 و 10021». */
export const numbersText = (numbers: readonly number[]): Seg[] => joined(numbers.map((n) => [{ num: String(n) }]), '، ', ' و ');

/** وزن با واحدش جدا: «820 گرم»، «1.2 کیلوگرم». */
export function weightSegs(grams: number): Seg[] {
  const { value, unit } = weightParts(grams);
  return [{ num: value }, ` ${unit}`];
}

/** مبلغ ریالی فایل پست به تومان، بی واحد: «129,500». */
const tomans = (rials: number): Seg => ({ num: formatTomans(rials, false) });

/* ───────────────────────── ورودها ───────────────────────── */

/** برچسب هر وضعیت ورود، با رنگ نشانش (همیشه با متن؛ رنگ تنها معنا ندارد). */
export const IMPORT_BADGES: Record<ShipmentImportStatus, { tone: 'success' | 'error' | 'neutral'; label: string }> = {
  reading: { tone: 'neutral', label: 'در حال خواندن' },
  read: { tone: 'neutral', label: 'پیش‌نمایش' },
  unreadable: { tone: 'error', label: 'خوانده نشد' },
  committed: { tone: 'success', label: 'ثبت شد' },
  discarded: { tone: 'neutral', label: 'دور انداخته شد' },
  reverted: { tone: 'neutral', label: 'برگشت' },
};

/** «سارا»، و ورود چاپخانه «حسن، چاپ نور». */
const byWhom = (view: Pick<ShipmentImportView, 'createdByName' | 'partner'>) =>
  view.partner ? `${view.createdByName}، ${view.partner.name}` : view.createdByName;

/** روز «تاریخ ثبت» فایل: «یکشنبه 12 مهر»، یا «شنبه 11 مهر تا یکشنبه 12 مهر». */
export function postDaysText(first: Date | null, last: Date | null): string | null {
  if (!first || !last) return null;
  return tehranDay(first) === tehranDay(last) ? formatJalaliWeekday(first) : `${formatJalaliWeekday(first)} تا ${formatJalaliWeekday(last)}`;
}

/**
 * سطر دوم هر ورود در فهرست (طرح): «امروز 11:05 · سارا · روز فایل یکشنبه 12 مهر»؛ ورود برگشته با کسی که برگرداند و دلیلش.
 */
export function importMeta(line: ShipmentImportLine, now: Date): Seg[] {
  const parts: Seg[][] = [[whenText(line.createdAt, now)], [byWhom(line)]];
  const days = postDaysText(line.firstPostDay, line.lastPostDay);
  if (days) parts.push([`روز فایل ${days}`]);
  if (line.status === 'reverted' && line.revertedAt) {
    // همان روز ورود فقط ساعت، مثل طرح: «برگشت 17:30 با سارا: «…»».
    const when = tehranDay(line.revertedAt) === tehranDay(line.createdAt) ? formatTehranTime(line.revertedAt) : whenText(line.revertedAt, now);
    parts.push([`برگشت ${when}${line.revertedByName ? ` با ${line.revertedByName}` : ''}: «${line.revertReason ?? ''}»`]);
  }
  return joined(parts);
}

/**
 * سطر سوم هر ورود ثبت‌شده (طرح): «15 بسته: 9 کد رهگیری · 4 در صف تأیید · 1 پیدا نشد · 1 تکراری»؛ برگشته «6 بسته: 6 کد رهگیری
 * کنار رفت». ورود ثبت‌نشده جمله‌ای دارد که کار بعدی را می‌گوید.
 */
export function importCounts(line: ShipmentImportLine): Seg[] {
  if (line.status === 'reading') return ['در حال خواندن فایل…'];
  if (line.status === 'read') return ['پیش‌نمایش؛ هنوز ثبت نشده.'];
  if (line.status === 'unreadable') return ['خوانده نشد؛ چیزی ثبت نشد.'];
  if (line.status === 'discarded') return [line.discardedByName ? 'دور انداخته شد؛ چیزی ثبت نشد.' : 'چون ثبت نشد، پس از روزهای نگهداری دور انداخته شد.'];
  const counts = line.counts;
  const parcels = (['matched', 'review', 'unmatched', 'duplicate', 'invalid', 'inactive'] as const).reduce((sum, v) => sum + (counts[v] ?? 0), 0);
  if (line.status === 'reverted') return [num(parcels), ' بسته: ', num(line.voidedShipments), ' کد رهگیری کنار رفت'];
  const parts: Seg[][] = [[num(line.liveShipments + line.voidedShipments), ' کد رهگیری']];
  const more: [StoredVerdict, string][] = [
    ['review', ' در صف تأیید'],
    ['unmatched', ' پیدا نشد'],
    ['duplicate', ' تکراری'],
    ['invalid', ' خوانده نشد'],
    ['inactive', ' غیرفعال در پست'],
  ];
  for (const [verdict, label] of more) if (counts[verdict]) parts.push([num(counts[verdict]!), label]);
  return [num(parcels), ' بسته: ', ...joined(parts)];
}

/* ───────────────────────── فایلی که خوانده نشد ───────────────────────── */

/** پیام هر کد «خوانده نشد» کارگر، با کار بعدی (تز محصول: هیچ بن‌بستی). */
export const UNREADABLE: Record<string, string> = {
  xls_binary:
    'این فایل اکسل واقعی است، نه فایلی که پست می‌دهد؛ احتمالاً یک بار در Excel باز و ذخیره شده، و Excel کد رهگیری 24 رقمی را گرد و خراب می‌کند. همان فایلی را بده که از پست گرفتی، دست‌نخورده.',
  no_table: 'در این فایل جدولی پیدا نشد. همان فایلی را بده که از پست گرفتی (پسوندش معمولاً .xls است).',
  too_large: 'این فایل از سقف 2 مگابایت بزرگ‌تر است، یا بازشده‌اش خیلی بزرگ است؛ فایل پست یک روز چند ده کیلوبایت است. همان فایلی را بده که از پست گرفتی.',
  bad_xlsx: 'این فایل XLSX خراب است یا شکلش را نمی‌شناسیم. همان فایلی را بده که از پست گرفتی.',
  too_many_rows: 'این فایل بیش از 5,000 سطر دارد؛ فایل پست یک روز این‌قدر نیست. همان فایلی را بده که از پست گرفتی.',
  read_failed: 'خواندن این فایل چند بار ناموفق ماند. یک بار دیگر بارگذاری‌اش کن؛ اگر باز نشد، لاگ کارگر می‌گوید چرا.',
};

export const unreadableText = (code: string | null) =>
  (code && UNREADABLE[code]) ?? 'این فایل خوانده نشد. همان فایلی را بده که از پست گرفتی.';

/** نام ستون‌های لازم فایل پست، به همان نام سرستون فایل. */
export const COLUMN_NAMES: Record<PostColumn, string> = {
  barcode: 'بارکد',
  recipient: 'نام گ',
  destination: 'مقصد',
  weight: 'وزن',
  fare: 'کرایه پستی',
  tax: 'مالیات',
  date: 'تاریخ ثبت',
  status: 'وضعیت',
  total: 'هزینه کل',
};

/** ستون‌هایی که نیستند، با «بارکد» اول: «ستون «بارکد» در این فایل نیست، پس کد رهگیری ندارد.» */
export function missingText(missing: readonly PostColumn[]): string {
  const names = missing.map((column) => `«${COLUMN_NAMES[column]}»`);
  const list = names.length === 1 ? `ستون ${names[0]}` : `ستون‌های ${names.slice(0, -1).join('، ')} و ${names.at(-1)}`;
  return `${list} در این فایل ${names.length === 1 ? 'نیست' : 'نیستند'}${missing.includes('barcode') ? '، پس کد رهگیری ندارد' : ''}.`;
}

/* ───────────────────────── سطرها با حکم ───────────────────────── */

/** سطر فایل پست، از پیش‌نمایش یا از سطر ثبت‌شده، به یک شکل. */
export interface ImportRowView {
  rowNo: number;
  /** «نام گ» بی شماره؛ خالی اگر متن سطر پس از روزهای نگهداری پاک شد. */
  surname: string;
  orderNumber: number | null;
  destination: string;
  barcode: string | null;
  /** متن خانهٔ بارکدی که خوانده نشد. */
  barcodeText: string | null;
  weightGrams: number | null;
  fareRials: number | null;
  taxRials: number | null;
  postDay: Date | null;
  postStatus: string | null;
  verdict: Exclude<StoredVerdict, 'total'>;
  reason: VerdictReason | null;
  order: ShipmentOrderFacts | null;
  /** پیش‌نمایش: با «ثبت» «تحویل پست شد» می‌شود؛ ثبت‌شده: همین ورود «تحویل پست شد» کرد. */
  handOver: boolean;
  /** مرسولهٔ همین سطر (ثبت‌شده). */
  shipment: ImportShipment | null;
  /** کرایه + مالیات با «هزینه کل» نمی‌خواند (فقط پیش‌نمایش). */
  costMismatch: boolean;
  /** «تکراری در همین فایل»: اولین سطر همین کد. */
  firstRowNo: number | null;
  /** مرسولهٔ همین کد جای دیگر («تکراری»، یا کد سفارش دیگر). */
  elsewhere: ShipmentElsewhere | null;
  /** متن سطر پس از روزهای نگهداری پاک شد. */
  purged: boolean;
}

/** سطرهای پیش‌نمایش؛ خالی اگر ستونی کم است. */
export function previewRows(preview: ShipmentPreview): ImportRowView[] {
  const { sheet, judged } = preview;
  if (!sheet.ok) return [];
  const orders = new Map(preview.orders.map((order) => [order.id, order]));
  const live = new Map(preview.live.map((s) => [s.barcode, s]));
  const first = new Map<string, number>();
  return sheet.rows.map((row, i) => {
    const j = judged[i]!;
    if (row.barcode && !first.has(row.barcode)) first.set(row.barcode, row.rowNo);
    const verdict = j.verdict;
    return {
      rowNo: row.rowNo,
      surname: row.surname,
      orderNumber: row.orderNumber,
      destination: row.destination,
      barcode: row.barcode,
      barcodeText: row.barcode ? null : row.barcodeText,
      weightGrams: row.weightGrams,
      fareRials: row.fareRials,
      taxRials: row.taxRials,
      postDay: row.postDay,
      postStatus: row.postStatus,
      verdict,
      reason: j.reason,
      order: j.orderId ? (orders.get(j.orderId) ?? null) : null,
      handOver: j.handOver,
      shipment: null,
      costMismatch: row.costMismatch,
      firstRowNo: j.reason === 'same_file' && row.barcode ? (first.get(row.barcode) ?? null) : null,
      elsewhere: row.barcode && (j.reason === 'already' || j.reason === 'barcode_elsewhere') ? (live.get(row.barcode) ?? null) : null,
      purged: false,
    };
  });
}

/** سطرهای ورود ثبت‌شده یا برگشته، بی ردیف «جمع کل». */
export function committedRows(committed: CommittedImport): ImportRowView[] {
  const orders = new Map(committed.orders.map((order) => [order.id, order]));
  const made = new Map(committed.shipments.map((s) => [s.rowNo, s]));
  const first = new Map<string, number>();
  const rows: ImportRowView[] = [];
  for (const row of committed.rows) {
    if (row.verdict === 'total') continue;
    if (row.barcode && !first.has(row.barcode)) first.set(row.barcode, row.rowNo);
    const shipment = made.get(row.rowNo) ?? null;
    const reason = (row.reason ?? null) as VerdictReason | null;
    const purged = row.cells === null && row.nameG === null && row.destination === null;
    rows.push({
      rowNo: row.rowNo,
      surname: row.nameG ? recipientSurname(row.nameG) : '',
      orderNumber: row.orderNumber,
      destination: row.destination ?? '',
      barcode: row.barcode,
      // متن خانهٔ بارکدی که خوانده نشد فقط در پیش‌نمایش است؛ سطر ثبت‌شده ستون‌ها را به نام نمی‌شناسد.
      barcodeText: null,
      weightGrams: row.weightGrams,
      fareRials: row.fareRials,
      taxRials: row.taxRials,
      postDay: row.postDay,
      postStatus: row.postStatus,
      verdict: row.verdict as ImportRowView['verdict'],
      reason,
      order: row.orderId ? (orders.get(row.orderId) ?? null) : null,
      handOver: shipment?.handedOrder ?? false,
      shipment,
      costMismatch: false,
      firstRowNo: reason === 'same_file' && row.barcode ? (first.get(row.barcode) ?? null) : null,
      elsewhere:
        reason === 'already' && row.barcode
          ? (committed.elsewhere.find((s) => s.barcode === row.barcode && s.orderId === row.orderId) ?? null)
          : null,
      purged,
    });
  }
  return rows;
}

/** گروه‌های صفحه، به ترتیب: هر چه تصمیم یا نگاه می‌خواهد اول، قطعی آخر (طرح). */
export const ROW_GROUPS = [
  { verdict: 'review', id: 'review', title: 'صف تأیید', sub: 'به سفارشی نشستند، ولی قطعی نیستند؛ کد رهگیری با تأیید مالک یا متصدی.' },
  { verdict: 'invalid', id: 'invalid', title: 'خوانده نشد', sub: 'کد، عدد یا تاریخ این سطرها درست خوانده نشد؛ ثبت نمی‌شوند.' },
  { verdict: 'unmatched', id: 'nf', title: 'پیدا نشد', sub: 'سفارش ما نیست یا پیدا نشد؛ ثبت نمی‌شود.' },
  { verdict: 'inactive', id: 'inactive', title: 'غیرفعال در پست', sub: 'وضعیتشان در فایل «فعال» نیست؛ ثبت نمی‌شوند.' },
  { verdict: 'duplicate', id: 'dup', title: 'تکراری', sub: 'همین کد پیش‌تر آمده؛ کاری نمی‌خواهد.' },
  { verdict: 'matched', id: 'ok', title: 'قطعی', sub: '' },
] as const satisfies readonly { verdict: ImportRowView['verdict']; id: string; title: string; sub: string }[];

/** «سفارش 10005 · نگار رحمانی، تهران». */
export function orderLine(order: ShipmentOrderFacts): Seg[] {
  return ['سفارش ', { num: String(order.orderNumber) }, ` · ${order.recipientName}، ${order.cityName ?? order.provinceName}`];
}

/** «سفارش 10019 (زهرا محمدی، تهران)». */
const orderRef = (order: ShipmentOrderFacts): Seg[] => [
  'سفارش ',
  { num: String(order.orderNumber) },
  ` (${order.recipientName}، ${order.cityName ?? order.provinceName})`,
];

/**
 * چرا این حکم، به زبان ادمین (طرح): برای صف تأیید، پیدا نشد، تکراری، خوانده نشد و غیرفعال؛ و برای قطعی فقط اگر «تحویل پست شد»
 * هم می‌کند. `committed`: جمله‌های پس از «ثبت».
 */
export function whyText(row: ImportRowView, { committed }: { committed: boolean }): Seg[] | null {
  const order = row.order;
  const number = row.orderNumber;
  switch (row.reason) {
    case null:
      if (row.verdict !== 'matched' || !row.handOver) return null;
      return committed && row.postDay
        ? [`در حال چاپ ← تحویل پست شد، ${formatJalaliWeekday(row.postDay)}`]
        : ['«در حال چاپ» است؛ با «ثبت» «تحویل پست شد» می‌شود، با روز فایل.'];
    case 'name_mismatch':
      return order ? ['سفارش ', { num: String(order.orderNumber) }, ` مال «${order.recipientName}» است؛ نام نمی‌خواند.`] : ['نام نمی‌خواند.'];
    case 'destination_mismatch':
      return order
        ? [...orderRef(order), ` به ${order.cityName ?? order.provinceName} می‌رود و مقصد فایل «${row.destination}» است.`]
        : ['مقصد با شهر سفارش نمی‌خواند.'];
    case 'date_before_payment':
      return order?.paidAt && row.postDay
        ? [`روز فایل (${formatJalaliWeekday(row.postDay)}) پیش از پرداخت `, ...orderRef(order), ` (${formatJalaliWeekday(order.paidAt)}) است.`]
        : ['روز فایل پیش از پرداخت سفارش است.'];
    case 'queued':
      return order
        ? [...orderRef(order), ' هنوز «در صف چاپ» است؛ کد رهگیری با تأیید مالک یا متصدی می‌نشیند.']
        : ['سفارش هنوز «در صف چاپ» است.'];
    case 'cancelled':
      return order ? [...orderRef(order), ' لغو شده؛ کد رهگیری به سفارش لغوشده نمی‌نشیند.'] : ['سفارش لغو شده.'];
    case 'barcode_elsewhere':
      return row.elsewhere?.orderNumber
        ? ['همین کد پیش‌تر برای سفارش ', { num: String(row.elsewhere.orderNumber) }, ' ثبت شده؛ هر کد مال یک سفارش است.']
        : ['همین کد پیش‌تر برای سفارش دیگری ثبت شده؛ هر کد مال یک سفارش است.'];
    case 'no_number':
      return ['«نام گ» شماره ندارد.'];
    case 'manual_code':
      return number !== null
        ? [{ num: String(number) }, ' شمارهٔ سفارش سایت نیست (سفارش‌های سایت از ', { num: '10001' }, ')؛ شاید سفارش دستی.']
        : ['شمارهٔ سفارش سایت نیست.'];
    case 'not_found':
      return number !== null ? ['سفارش ', { num: String(number) }, ' پیدا نشد.'] : ['سفارش پیدا نشد.'];
    case 'same_file':
      return row.firstRowNo !== null ? ['همین کد در سطر ', { num: String(row.firstRowNo) }, ' همین فایل هم آمده.'] : ['همین کد بالاتر در همین فایل آمده.'];
    case 'already': {
      const other = row.elsewhere;
      const who = order ? [` برای همین سفارش (`, { num: String(order.orderNumber) }, `، ${order.recipientName})`] : [' برای همین سفارش'];
      if (!other?.createdAt) return ['همین کد پیش‌تر', ...who, ' آمده؛ دوباره ثبت نمی‌شود.'] as Seg[];
      return [
        `همین کد ${formatJalaliWeekday(other.createdAt)}`,
        ...(other.filename ? [' با ', { ltr: other.filename }] : []),
        ...who,
        ' آمد؛ دوباره ثبت نمی‌شود.',
      ] as Seg[];
    }
    case 'barcode':
      return [
        'کد رهگیری ',
        ...(row.barcodeText ? ['«', { ltr: row.barcodeText }, '» '] : []),
        'خوانده نشد: کد پست دقیقاً ',
        { num: '24' },
        ' رقم است؛ فایلی که در Excel ذخیره شده کد را گرد و خراب می‌کند.',
      ] as Seg[];
    case 'numbers':
      return ['وزن، کرایه یا مالیات این سطر خوانده نشد.'];
    case 'date':
      return ['«تاریخ ثبت» این سطر خوانده نشد.'];
    case 'date_future':
      return row.postDay ? [`«تاریخ ثبت» (${formatJalaliWeekday(row.postDay)}) هنوز نرسیده.`] : ['«تاریخ ثبت» هنوز نرسیده.'];
    case 'inactive':
      return [`وضعیتش در فایل «${row.postStatus ?? ''}» است، نه «فعال».`];
  }
}

/** «کرایه 129,500 · مالیات 12,950» (تومان)؛ null اگر عددی نیست. */
export function fareText(row: Pick<ImportRowView, 'fareRials' | 'taxRials'>): Seg[] | null {
  if (row.fareRials === null || row.taxRials === null) return null;
  return ['کرایه ', tomans(row.fareRials), ' · مالیات ', tomans(row.taxRials)];
}

/* ───────────────────────── شمارها و جمع کل ───────────────────────── */

export type RowCounts = Record<ImportRowView['verdict'], number>;

export function countsOf(rows: readonly ImportRowView[]): RowCounts {
  const counts: RowCounts = { matched: 0, review: 0, unmatched: 0, duplicate: 0, invalid: 0, inactive: 0 };
  for (const row of rows) counts[row.verdict] += 1;
  return counts;
}

export interface Totals {
  parcels: number;
  weightGrams: number;
  fareRials: number;
  taxRials: number;
}

/** جمع سطرها، و «جمع کل» فایل اگر بود: «جمع کل فایل با جمع سطرها می‌خواند: 15 بسته، 20.2 کیلوگرم، کرایه … و مالیات … تومان.» */
export function totalsText(sums: Totals, file: Omit<Totals, 'parcels'> | null): { agree: boolean | null; text: Seg[] } {
  const line = (t: Totals | (Omit<Totals, 'parcels'> & { parcels?: number })): Seg[] => [
    ...(t.parcels !== undefined ? [num(t.parcels), ' بسته، '] : []),
    ...weightSegs(t.weightGrams),
    '، کرایه ',
    tomans(t.fareRials),
    ' و مالیات ',
    tomans(t.taxRials),
    ' تومان',
  ];
  if (!file) return { agree: null, text: ['فایل ردیف «جمع کل» ندارد. جمع سطرها: ', ...line(sums), '.'] };
  const agree = file.weightGrams === sums.weightGrams && file.fareRials === sums.fareRials && file.taxRials === sums.taxRials;
  return agree
    ? { agree, text: ['جمع کل فایل با جمع سطرها می‌خواند: ', ...line(sums), '.'] }
    : {
        agree,
        text: [
          '«جمع کل» فایل با جمع سطرها نمی‌خواند؛ شاید سطری جا افتاده یا فایل دست خورده. فایل: ',
          ...line(file),
          '؛ سطرها: ',
          ...line(sums),
          '.',
        ],
      };
}

/** جمع سطرهای ثبت‌شده و ردیف «جمع کل»شان. */
export function committedTotals(committed: CommittedImport): { sums: Totals; file: Omit<Totals, 'parcels'> | null } {
  const sums: Totals = { parcels: 0, weightGrams: 0, fareRials: 0, taxRials: 0 };
  let file: Omit<Totals, 'parcels'> | null = null;
  for (const row of committed.rows) {
    if (row.verdict === 'total') {
      file = { weightGrams: row.weightGrams ?? 0, fareRials: row.fareRials ?? 0, taxRials: row.taxRials ?? 0 };
      continue;
    }
    sums.parcels += 1;
    sums.weightGrams += row.weightGrams ?? 0;
    sums.fareRials += row.fareRials ?? 0;
    sums.taxRials += row.taxRials ?? 0;
  }
  return { sums, file };
}

/* ───────────────────────── بستهٔ پستی سفارش ───────────────────────── */

/** بارکد ۲۴ رقمی در شش گروه چهارتایی برای خواندن (طرح `jy-barcode`)؛ فاصله در CSS است، پس کپی همان ۲۴ رقم است. */
export const barcodeGroups = (barcode: string): string[] => barcode.match(/.{1,4}/g) ?? [barcode];

/** «پست پیشتاز · یک بسته»، «دو بسته». */
export function parcelsCount(live: number): string {
  const words: Record<number, string> = { 1: 'یک', 2: 'دو', 3: 'سه', 4: 'چهار', 5: 'پنج' };
  return `${words[live] ?? formatNumber(live)} بسته`;
}

/** «فایل پست»: «FileName-1984.xls، سطر 2 · حسن، دوشنبه 13 مهر، 18:30». */
export function shipmentSource(shipment: PanelShipment, now: Date): Seg[] {
  return [
    { ltr: shipment.filename },
    '، سطر ',
    { num: String(shipment.rowNo) },
    ` · ${shipment.adminName ? `${shipment.adminName}، ` : ''}${whenText(shipment.createdAt, now)}`,
  ];
}
