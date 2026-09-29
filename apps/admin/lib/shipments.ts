/**
 * زبانهٔ «ارسال» به زبان صفحه (برش ۶٫۱، طرح `m-ship`، `m-ship-preview`، `m-ship-done` و `m-order-shipped`): برچسب ورودها،
 * شمارها، سطرهای فایل با حکم و دلیلشان، و بستهٔ پستی سفارش. خالص و بی JSX، تا تست بی مرورگر بسنجدش؛ صفحه فقط می‌چیندش.
 *
 * - سطر پیش‌نمایش (جدول تفسیرشده و حکم‌ها) و سطر ثبت‌شده (`shipment_import_rows`) یک شکل می‌شوند (`ImportRowView`)، پس هر دو
 *   حالت صفحه همان گروه‌ها و همان دلیل‌ها را نشان می‌دهند.
 * - عدد در `.num` خودش و نام لاتین (نام فایل) در `bdi`، جدا از جملهٔ فارسی (`Seg`). کرایه و مالیات فایل ریال‌اند و تومان نشان
 *   داده می‌شوند (قاعدهٔ ۳).
 */

import {
  CRITERION_ORDER,
  handedAtOf,
  type CommittedImport,
  type CriterionKey,
  type Criteria,
  type ImportShipment,
  type PanelShipment,
  type PostColumn,
  type ReviewBlock,
  type ReviewCandidates,
  type ReviewRow,
  type ShipmentElsewhere,
  type ShipmentImportLine,
  type ShipmentImportPage,
  type ShipmentImportStatus,
  type ShipmentImportView,
  type ShipmentOrderFacts,
  type ShipmentPreview,
  type StoredVerdict,
  type VerdictReason,
} from '@jozveyar/db';
import { formatJalaliWeekday, formatNumber, formatTehranTime, formatTomans, recipientSurname, weightParts } from '@jozveyar/text';

import { tehranDay, whenText } from './format';
import type { Seg } from './orders';

const num = (value: number): Seg => ({ num: formatNumber(value) });

/** تکه‌ها با جداکننده؛ `last` پیش از آخری: «10013، 10017 و 10021». */
export function joined(parts: Seg[][], separator = ' · ', last = separator): Seg[] {
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
 * سطر سوم هر ورود ثبت‌شده (طرح): «15 بسته: 9 کد رهگیری · 4 در صف تأیید · 1 پیدا نشد · 1 تکراری»، با حال امروز هر سطر (۶٫۲): کد
 * زنده، صف، «هیچ‌کدام»، و «پیدا نشد»ی که هنوز کدی نگرفت؛ هر سطر در یکی. برای چاپخانه صف «در انتظار بررسی جزوه‌یار» است (طرح).
 * برگشته «6 بسته: 6 کد رهگیری کنار رفت». ورود ثبت‌نشده جمله‌ای دارد که کار بعدی را می‌گوید.
 */
export function importCounts(line: ShipmentImportLine, { partner = false }: { partner?: boolean } = {}): Seg[] {
  if (line.status === 'reading') return ['در حال خواندن فایل…'];
  if (line.status === 'read') return ['پیش‌نمایش؛ هنوز ثبت نشده.'];
  if (line.status === 'unreadable') return ['خوانده نشد؛ چیزی ثبت نشد.'];
  if (line.status === 'discarded') return [line.discardedByName ? 'دور انداخته شد؛ چیزی ثبت نشد.' : 'چون ثبت نشد، پس از روزهای نگهداری دور انداخته شد.'];
  const counts = line.counts;
  const parcels = (['matched', 'review', 'unmatched', 'duplicate', 'invalid', 'inactive'] as const).reduce((sum, v) => sum + (counts[v] ?? 0), 0);
  if (line.status === 'reverted') return [num(parcels), ' بسته: ', num(line.voidedShipments), ' کد رهگیری کنار رفت'];
  const parts: Seg[][] = [[num(line.liveShipments), ' کد رهگیری']];
  const more: [number, string][] = [
    [line.queuedRows, partner ? ' در انتظار بررسی جزوه‌یار' : ' در صف تأیید'],
    [line.dismissedRows, ' کنار گذاشته'],
    [line.unmatchedRows, ' پیدا نشد'],
    [counts.duplicate ?? 0, ' تکراری'],
    [counts.invalid ?? 0, ' خوانده نشد'],
    [counts.inactive ?? 0, ' غیرفعال در پست'],
  ];
  for (const [n, label] of more) if (n > 0) parts.push([num(n), label]);
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
  /** پیش‌نمایش: با «ثبت» «تحویل پست شد» می‌شود؛ ثبت‌شده: «ثبت» همین ورود «تحویل پست شد» کرد. */
  handOver: boolean;
  /** کد زندهٔ همین سطر (ثبت‌شده): قطعی، با تأیید، یا دستی (۶٫۲). */
  shipment: ImportShipment | null;
  /** سفارش کد زنده، که با تأیید یا دستی می‌تواند جز سفارش حکم باشد. */
  shipmentOrder: ShipmentOrderFacts | null;
  /** کدهای کنارگذاشتهٔ همین سطر، به ترتیب ساختن (۶٫۲). */
  voided: ImportShipment[];
  /** یکی از کدهای همین سطر، زنده یا کنارگذاشته، سفارشی را «تحویل پست شد» کرد. */
  handedAny: boolean;
  /** ثبت‌شده: همین حالا در صف تأیید است (۶٫۲). */
  queued: boolean;
  /** «هیچ‌کدام»: کی و با چه کسی (۶٫۲). */
  dismissed: { at: Date; byName: string | null } | null;
  /** نامزدهای سطر صف (۶٫۲)؛ null اگر در صف نیست یا نشست نامزدها را نمی‌بیند (چاپخانه). */
  candidates: ReviewCandidates | null;
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
      shipmentOrder: null,
      voided: [],
      handedAny: false,
      queued: false,
      dismissed: null,
      candidates: preview.candidates[row.rowNo] ?? null,
      costMismatch: row.costMismatch,
      firstRowNo: j.reason === 'same_file' && row.barcode ? (first.get(row.barcode) ?? null) : null,
      elsewhere: row.barcode && (j.reason === 'already' || j.reason === 'barcode_elsewhere') ? (live.get(row.barcode) ?? null) : null,
      purged: false,
    };
  });
}

/** سطرهای ورود ثبت‌شده یا برگشته، بی ردیف «جمع کل»، هر کدام با حال امروزش (۶٫۲): کد زنده، کدهای کنارگذاشته، صف، «هیچ‌کدام». */
export function committedRows(committed: CommittedImport): ImportRowView[] {
  const orders = new Map(committed.orders.map((order) => [order.id, order]));
  const first = new Map<string, number>();
  const rows: ImportRowView[] = [];
  for (const row of committed.rows) {
    if (row.verdict === 'total') continue;
    if (row.barcode && !first.has(row.barcode)) first.set(row.barcode, row.rowNo);
    const made = committed.shipments.filter((s) => s.rowNo === row.rowNo);
    const shipment = made.find((s) => s.voidedAt === null) ?? null;
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
      // «ثبت» فقط کد قطعی می‌سازد؛ کد تأیید و دستی کار بعد از «ثبت» است.
      handOver: made.some((s) => s.matchedBy === 'rule' && s.handedOrder),
      shipment,
      shipmentOrder: shipment ? (orders.get(shipment.orderId) ?? null) : null,
      voided: made.filter((s) => s.voidedAt !== null),
      handedAny: made.some((s) => s.handedOrder),
      queued: row.queued,
      dismissed: row.dismissedAt ? { at: row.dismissedAt, byName: row.dismissedByName } : null,
      candidates: committed.candidates[row.rowNo] ?? null,
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
 * هم می‌کند. `committed`: جمله‌های پس از «ثبت». `partner` (۶٫۲، طرح `m-ship-done` از چشم چاپخانه): صف را جزوه‌یار بررسی می‌کند.
 */
export function whyText(row: ImportRowView, { committed, partner = false }: { committed: boolean; partner?: boolean }): Seg[] | null {
  const order = row.order;
  const number = row.orderNumber;
  switch (row.reason) {
    case null:
      if (row.verdict !== 'matched' || !row.handOver) return null;
      return committed && row.postDay
        ? [`در حال چاپ ← تحویل پست شد، ${formatJalaliWeekday(row.postDay)}`]
        : ['«در حال چاپ» است؛ با «ثبت» «تحویل پست شد» می‌شود، با روز فایل.'];
    case 'name_mismatch': {
      const mine = partner ? [' اگر بستهٔ مشتری دیگر خودت است، جزوه‌یار کنارش می‌گذارد.'] : [];
      return order ? ['سفارش ', { num: String(order.orderNumber) }, ` مال «${order.recipientName}» است؛ نام نمی‌خواند.`, ...mine] : ['نام نمی‌خواند.', ...mine];
    }
    case 'destination_mismatch':
      return order
        ? [...orderRef(order), ` به ${order.cityName ?? order.provinceName} می‌رود و مقصد فایل «${row.destination}» است.`]
        : ['مقصد با شهر سفارش نمی‌خواند.'];
    case 'date_before_payment':
      return order?.paidAt && row.postDay
        ? [`روز فایل (${formatJalaliWeekday(row.postDay)}) پیش از پرداخت `, ...orderRef(order), ` (${formatJalaliWeekday(order.paidAt)}) است.`]
        : ['روز فایل پیش از پرداخت سفارش است.'];
    case 'queued': {
      const then = partner ? '؛ جزوه‌یار بررسی می‌کند.' : '؛ تأیید، «شروع چاپ» و «تحویل پست شد» را با هم می‌زند.';
      return order ? [...orderRef(order), ` هنوز «در صف چاپ» است${then}`] : ['سفارش هنوز «در صف چاپ» است.'];
    }
    case 'cancelled':
      return order ? [...orderRef(order), ' لغو شده؛ کد رهگیری به سفارش لغوشده نمی‌نشیند.'] : ['سفارش لغو شده.'];
    case 'barcode_elsewhere':
      return row.elsewhere?.orderNumber
        ? ['همین کد پیش‌تر برای سفارش ', { num: String(row.elsewhere.orderNumber) }, ' ثبت شده؛ هر کد مال یک سفارش است.']
        : ['همین کد پیش‌تر برای سفارش دیگری ثبت شده؛ هر کد مال یک سفارش است.'];
    case 'no_number':
      return ['«نام گ» شماره ندارد.'];
    case 'manual_code':
      if (partner) return number !== null ? [{ num: String(number) }, ' شمارهٔ سفارش جزوه‌یار نیست؛ این بسته ثبت نمی‌شود.'] : ['شمارهٔ سفارش جزوه‌یار نیست.'];
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

/**
 * متن کاشی‌های قطعی، صف تأیید و پیدا نشد (طرح). شمار کاشی حکم «ثبت» است و عوض نمی‌شود؛ متن ورود ثبت‌شده حال امروز را می‌گوید (۶٫۲):
 * درست پس از «ثبت» همان متن طرح، و بعد چند سطر صف هنوز منتظر است، چند کد قطعی کنار رفت، و چند «پیدا نشد» دستی به سفارشی داده
 * شد. ورود برگشته: کدها کنار رفت و صف بسته است. چاپخانه صف را جزوه‌یار می‌بیند.
 */
export function tileTexts(
  rows: readonly ImportRowView[],
  { state, partner = false }: { state: 'preview' | 'committed' | 'reverted'; partner?: boolean },
): Record<'ok' | 'review' | 'nf', Seg[]> {
  const of = (verdict: ImportRowView['verdict'], test: (row: ImportRowView) => boolean = () => true) =>
    rows.filter((row) => row.verdict === verdict && test(row)).length;
  const review = of('review');
  const waiting = of('review', (row) => row.queued);
  const lost = of('matched', (row) => row.shipment === null);
  const given = of('unmatched', (row) => row.shipment !== null);
  const reviewText = partner ? 'جزوه‌یار تأیید یا کنار می‌گذارد' : 'تا تأیید مالک یا متصدی، بی کد';
  const nfText = partner ? 'سفارش جزوه‌یار نیست؛ ثبت نمی‌شود' : 'سفارش ما نیست؛ ثبت نمی‌شود';
  if (state === 'preview') return { ok: ['کد رهگیری، با «ثبت»'], review: [reviewText], nf: [nfText] };
  if (state === 'reverted') {
    return { ok: [of('matched') > 0 ? 'با برگرداندن کنار رفت' : 'کد رهگیری نشست'], review: [review > 0 ? 'ورود برگشت؛ بی کد' : reviewText], nf: [nfText] };
  }
  return {
    ok: lost > 0 ? ['کد رهگیری نشست؛ ', num(lost), ' کنار رفت'] : ['کد رهگیری نشست'],
    review:
      waiting === review
        ? [reviewText]
        : waiting === 0
          ? [partner ? 'جزوه‌یار بررسی کرد' : 'همه بررسی شد']
          : [num(waiting), ` تا هنوز ${partner ? 'در انتظار بررسی جزوه‌یار' : 'منتظر تأیید'}`],
    nf: given > 0 ? [num(given), partner ? ' را جزوه‌یار دستی به سفارشی داد' : ' دستی به سفارشی داده شد'] : [nfText],
  };
}

export interface Totals {
  parcels: number;
  weightGrams: number;
  fareRials: number;
  taxRials: number;
}

/**
 * جمع سطرها، و «جمع کل» فایل اگر بود: «جمع کل فایل با جمع سطرها می‌خواند: 15 بسته، 20.2 کیلوگرم، کرایه … و مالیات … تومان.» بی
 * `money` (چاپخانه، تصمیم ۸۱) فقط بسته و وزن: «… 5 بسته، 5.8 کیلوگرم.»
 */
export function totalsText(sums: Totals, file: Omit<Totals, 'parcels'> | null, { money = true } = {}): { agree: boolean | null; text: Seg[] } {
  const line = (t: Totals | (Omit<Totals, 'parcels'> & { parcels?: number })): Seg[] => [
    ...(t.parcels !== undefined ? [num(t.parcels), ' بسته، '] : []),
    ...weightSegs(t.weightGrams),
    ...(money ? ['، کرایه ', tomans(t.fareRials), ' و مالیات ', tomans(t.taxRials), ' تومان'] : []),
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

/* ───────────────────────── بی مبلغ (۶٫۲، تصمیم ۸۱) ───────────────────────── */

/**
 * صفحهٔ ورود بی کرایه، مالیات و خانه‌های خام فایل، برای نشستی که `orders.money` ندارد (چاپخانه): سرویس پیش از صفحه می‌کندش، پس
 * صفحه‌ای که اشتباهاً کرایه بکشد هم عددی ندارد. جمع فایل فقط بسته و وزن می‌ماند.
 */
export function withoutFares(page: ShipmentImportPage): ShipmentImportPage {
  if (page.kind === 'preview') {
    const { sheet } = page.preview;
    if (!sheet.ok) return page;
    return {
      ...page,
      preview: {
        ...page.preview,
        sheet: {
          ...sheet,
          rows: sheet.rows.map((row) => ({ ...row, cells: [], fareRials: null, taxRials: null, totalRials: null, costMismatch: false })),
          sums: { ...sheet.sums, fareRials: 0, taxRials: 0 },
          fileTotal: sheet.fileTotal ? { ...sheet.fileTotal, cells: [], fareRials: 0, taxRials: 0 } : null,
        },
      },
    };
  }
  if (page.kind === 'committed') {
    return { ...page, committed: { ...page.committed, rows: page.committed.rows.map((row) => ({ ...row, cells: null, fareRials: null, taxRials: null })) } };
  }
  return page;
}

/** کارت صف یا دادن دستی بی کرایه و مالیات؛ همان `withoutFares`. */
export const rowWithoutFares = (review: ReviewRow): ReviewRow => ({ ...review, row: { ...review.row, cells: null, fareRials: null, taxRials: null } });

/* ───────────────────────── صف تأیید (۶٫۲) ───────────────────────── */

/** آنچه ادمین از سفارش دید، در فرم: «printing.0» (وضعیت و شمار کد زنده)؛ سرور «همین است» را فقط از همین می‌کند. */
export const seenText = (order: Pick<ShipmentOrderFacts, 'status' | 'liveShipments'>) => `${order.status}.${order.liveShipments}`;

/** گزینهٔ نامزد در کارت صف: شناسهٔ سفارش و آنچه ادمین از آن دید، «<شناسه>.printing.0». */
export const choiceText = (order: Pick<ShipmentOrderFacts, 'id' | 'status' | 'liveShipments'>) => `${order.id}.${seenText(order)}`;

/** نام هر معیار کنار نامزد (طرح `m-ship-review`). */
export const CRITERION_NAMES: Record<CriterionKey, string> = { number: 'شماره', surname: 'نام خانوادگی', city: 'شهر', weight: 'وزن', day: 'روز' };

/**
 * معیارهای یک نامزد کنارش (طرح): «می‌خواند: …» و «نمی‌خواند: …» به ترتیب `CRITERION_ORDER`؛ وزن با برآورد سفارش و روز با روز تحویل
 * پستش، هر جا معنا دارد؛ نامعلوم نوشته نمی‌شود. شمارهٔ دیگر با نام خانوادگی که می‌خواند: «شماره؛ شاید اشتباه تایپی».
 */
export function criteriaParts(criteria: Criteria, order: Pick<ShipmentOrderFacts, 'estWeightGrams' | 'handedToPostAt'>): { yes: Seg[][]; no: Seg[][] } {
  const yes: Seg[][] = [];
  const no: Seg[][] = [];
  for (const key of CRITERION_ORDER) {
    const value = criteria[key];
    if (value === null) continue;
    const part: Seg[] = [CRITERION_NAMES[key]];
    if (key === 'weight' && order.estWeightGrams > 0) part.push(' (برآورد ', ...weightSegs(order.estWeightGrams), ')');
    if (key === 'day' && order.handedToPostAt) part.push(` (تحویل پست ${formatJalaliWeekday(order.handedToPostAt)})`);
    if (key === 'number' && value === 'no' && criteria.surname === 'yes') part.push('؛ شاید اشتباه تایپی');
    (value === 'yes' ? yes : no).push(part);
  }
  return { yes, no };
}

/** یادداشت نامزدی که «همین است»ش بسته است، کنار خودش. */
export const BLOCK_NOTES: Record<ReviewBlock, string> = {
  cancelled: 'لغو شده',
  before_payment: 'بسته پیش از روز پرداختش به پست رسیده',
  needs_partner: '«در صف چاپ» و بی چاپخانه: اول چاپخانه انتخاب شود',
  needs_print: '«در صف چاپ» و بی فایل چاپ: اول فایل چاپ ساخته شود',
  barcode_elsewhere: 'همین کد برای سفارش دیگری زنده است',
};

/** دکمهٔ اصلی وقتی هیچ نامزدی باز نیست (طرح: «اول لغو برگردد»). */
export const BLOCK_BUTTONS: Record<ReviewBlock, string> = {
  cancelled: 'اول لغو برگردد',
  before_payment: 'نامزدی باز نیست',
  needs_partner: 'اول چاپخانه انتخاب شود',
  needs_print: 'اول فایل چاپ ساخته شود',
  barcode_elsewhere: 'اول کد دیگر کنار برود',
};

/** «نامزد: 10014، سارا رضایی، تهران.» یا «نامزدها: …؛ ….»؛ بی نامزد «نامزدی پیدا نشد.» (پیش‌نمایش و صفحهٔ ورود). */
export function candidatesText(list: ReviewCandidates): Seg[] {
  if (list.candidates.length === 0) return ['نامزدی پیدا نشد.'];
  const parts = list.candidates.map((c): Seg[] => [
    { num: String(c.order.orderNumber) },
    `، ${c.order.recipientName}، ${c.order.cityName ?? c.order.provinceName}`,
  ]);
  return [list.candidates.length === 1 ? 'نامزد: ' : 'نامزدها: ', ...joined(parts, '؛ '), '.'];
}

/** «FileName-1977.xls، سطر 3 · حسن، چاپ نور، یکشنبه 18:10»: فایل، سطر، و کسی که آورد (طرح). */
export function reviewMeta(review: ReviewRow, now: Date): Seg[] {
  const who = review.import.partner ? `${review.import.createdByName}، ${review.import.partner.name}` : review.import.createdByName;
  return [
    { ltr: review.import.filename },
    '، سطر ',
    { num: String(review.row.rowNo) },
    ` · ${who}، ${whenText(review.import.committedAt ?? review.import.createdAt, now)}`,
  ];
}

/**
 * چرا این سطر در صف است، روی کارتش (طرح `m-ship-review`): کدی که کنار رفت با کننده و دلیلش؛ وگرنه دلیل حکم به زبان کسی که تصمیم
 * می‌گیرد. فایل چاپخانه با نامی که نمی‌خواند: شاید بستهٔ مشتری دیگر خود چاپخانه است.
 */
export function reviewWhy(review: ReviewRow, now: Date): Seg[] {
  const { row, numbered, elsewhere } = review;
  const last = review.shipments.filter((s) => s.voidedAt !== null).at(-1);
  if (last) {
    return [
      'کد این سطر برای سفارش ',
      { num: String(last.orderNumber) },
      ` کنار رفت${last.voidedAt ? ` ${whenText(last.voidedAt, now)}` : ''}${last.voidedByName ? ` با ${last.voidedByName}` : ''}`,
      last.voidReason ? `: «${last.voidReason}»` : '',
      '؛ دوباره تصمیم می‌خواهد.',
    ];
  }
  const partnerHint: Seg[] = review.import.partner
    ? [` فایل از ${review.import.partner.name} است و شاید بستهٔ مشتری دیگر خود چاپخانه باشد که شماره‌اش مثل سفارش ماست.`]
    : [];
  const orderNo = (order: ShipmentOrderFacts): Seg => ({ num: String(order.orderNumber) });
  switch (row.reason) {
    case 'name_mismatch':
      return numbered
        ? ['سفارش ', orderNo(numbered), ` مال «${numbered.recipientName}» است${numbered.liveShipments > 0 ? ' و کد رهگیری دارد' : ''}؛ نام نمی‌خواند.`, ...partnerHint]
        : ['نام نمی‌خواند.', ...partnerHint];
    case 'destination_mismatch':
      return numbered
        ? ['سفارش ', orderNo(numbered), ` به ${numbered.cityName ?? numbered.provinceName} می‌رود و مقصد فایل «${row.destination ?? ''}» است.`, ...partnerHint]
        : ['مقصد با شهر سفارش نمی‌خواند.', ...partnerHint];
    case 'date_before_payment':
      return numbered?.paidAt && row.postDay
        ? [`روز فایل (${formatJalaliWeekday(row.postDay)}) پیش از پرداخت سفارش `, orderNo(numbered), ` (${formatJalaliWeekday(numbered.paidAt)}) است.`]
        : ['روز فایل پیش از پرداخت سفارش است.'];
    case 'queued':
      return numbered ? ['سفارش ', orderNo(numbered), ' هنوز «در صف چاپ» است.'] : ['سفارش هنوز «در صف چاپ» است.'];
    case 'cancelled':
      return [
        ...(numbered ? ['سفارش ', orderNo(numbered), ' لغو شده.'] : ['سفارش لغو شده.']),
        ' کد رهگیری به سفارش لغوشده نمی‌نشیند: اگر بسته واقعاً رفته، اول مالک لغو را برگرداند؛ وگرنه «هیچ‌کدام».',
      ];
    case 'barcode_elsewhere':
      return elsewhere
        ? [
            'همین کد رهگیری برای سفارش ',
            ...(elsewhere.orderNumber !== null ? [{ num: String(elsewhere.orderNumber) }] : ['دیگری']),
            ' زنده است و هر کد مال یک سفارش است. اگر آن اشتباه است، اول مالک از صفحهٔ همان سفارش کنارش بگذارد؛ اگر این بسته مال ما نیست، «هیچ‌کدام».',
          ]
        : ['همین کد پیش‌تر برای سفارش دیگری ثبت بود و حالا کنار رفته؛ تصمیم با توست.'];
    case 'no_number':
      return ['«نام گ» شماره ندارد.'];
    default:
      return ['این سطر قطعی نشد.'];
  }
}

/** حال سطری که در صف نیست، در صفحهٔ سطر (۶٫۲): کد زنده‌اش، «هیچ‌کدام»، یا چرا به سفارشی داده نمی‌شود. */
export function rowStateText(review: ReviewRow, now: Date): Seg[] {
  const { row } = review;
  const live = review.shipments.find((s) => s.voidedAt === null);
  if (live) {
    const via = live.matchedBy === 'review' ? 'با تأیید' : live.matchedBy === 'manual' ? 'دستی' : 'با «ثبت»';
    return ['کد این سطر به سفارش ', { num: String(live.orderNumber) }, ` نشسته است (${via}${live.adminName ? `، ${live.adminName}` : ''}، ${whenText(live.createdAt, now)}).`];
  }
  if (review.import.status !== 'committed') return ['ورود این سطر برگشته است؛ سطرهایش دیگر به سفارشی داده نمی‌شوند.'];
  if (row.dismissedAt) {
    return [
      `«هیچ‌کدام» خورد${row.dismissedByName ? `، ${row.dismissedByName}` : ''}، ${whenText(row.dismissedAt, now)}. اگر اشتباه بود، به سفارش درستش بده.`,
    ];
  }
  switch (row.verdict) {
    case 'unmatched':
      return row.reason === 'manual_code' && row.orderNumber !== null
        ? [{ num: String(row.orderNumber) }, ' شمارهٔ سفارش سایت نیست؛ اگر بسته مال سفارشی از ماست، به همان بده.']
        : row.reason === 'not_found' && row.orderNumber !== null
          ? ['سفارش ', { num: String(row.orderNumber) }, ' پیدا نشد؛ اگر بسته مال سفارشی از ماست، به همان بده.']
          : ['«نام گ» شماره ندارد و نامزدی پیدا نشد؛ اگر بسته مال سفارشی از ماست، به همان بده.'];
    case 'duplicate':
      return ['این سطر «تکراری» است؛ همین کد پیش‌تر آمده و به سفارشی داده نمی‌شود.'];
    case 'invalid':
      return ['این سطر درست خوانده نشد و به سفارشی داده نمی‌شود.'];
    case 'inactive':
      return ['وضعیت این بسته در فایل «فعال» نیست و به سفارشی داده نمی‌شود.'];
    default:
      return ['این سطر همین حالا منتظر تصمیمی نیست.'];
  }
}

/**
 * «همین است» برای سفارش «در صف چاپ» (طرح): «شروع چاپ» و «تحویل پست شد» با هم، با روز فایل، و اینکه آن روز در مهلت است یا نه.
 * `null` برای بقیه.
 */
export function queuedNote(order: Pick<ShipmentOrderFacts, 'status' | 'postHandoffDueAt'>, postDay: Date | null, now: Date): Seg[] | null {
  if (order.status !== 'paid' || !postDay) return null;
  const handedAt = handedAtOf(postDay, now);
  const onTime = order.postHandoffDueAt !== null ? handedAt.getTime() < order.postHandoffDueAt.getTime() : null;
  return [
    `تأیید، «شروع چاپ» و «تحویل پست شد» را با هم می‌زند، با روز فایل: ${formatJalaliWeekday(postDay)}`,
    onTime === null ? '.' : onTime ? '، یعنی در مهلت.' : '، یعنی دیرتر از مهلت.',
    ' فایل چاپ و چاپخانه‌اش آماده‌اند.',
  ];
}

/* ───────────────────────── بستهٔ پستی سفارش ───────────────────────── */

export { barcodeGroups } from './barcode';

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
