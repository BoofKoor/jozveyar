/**
 * گزارش به شکل سند خروجی (برش ۱۰٫۲، ADR-061، سؤال ۲۰۲): یک شکل برای هر گزارش (تولید ۱۰٫۲، ارسال ۶٫۴)، که برگه‌های اکسل از آن
 * ساخته می‌شوند (`documentSheets` و `lib/server/xlsx.ts`: عدد به شکل عدد) و دادهٔ قالب PDF کارگر هم (`pdfContext`: همه متن آماده، تا قالب
 * چیزی حساب نکند). صفحهٔ پنل خودش JSX است، ولی عددهایش از همان جمع‌هاست، پس سه شکل با هم می‌خوانند. خالص، بی پایگاه داده.
 *
 * - **پول** تومان گردشده (نیم از صفر دور، مثل صفحه‌ها)، عدد درست؛ فقط برای کسی که مبلغ می‌بیند (`orders.money`)، که سازندهٔ سند تصمیم
 *   می‌گیرد، نه اینجا.
 * - **فهرست سفارش‌ها** (`detail`) در اکسل برگهٔ دوم است، کامل؛ در PDF تا `PDF_DETAIL_MAX` ردیف، با یادداشت «بقیه در خروجی اکسل»
 *   (سؤال ۲۷۸)، تا PDF چاپی سنگین نشود و از سقف صفحهٔ کارگر نگذرد.
 */

import { formatJalali, formatNumber, formatTehranTime } from '@jozveyar/text';

import type { Seg } from './orders';

/** یک خانه: متن، عدد، یا خالی. */
export type ReportCell = string | number | null;

export interface ReportColumn {
  label: string;
  /** ستون عددی: در PDF با جداکنندهٔ هزارگان و در اکسل عدد. */
  numeric?: boolean;
  /** شناسه، مثل شمارهٔ سفارش: عدد بی جداکنندهٔ هزارگان («10027»، نه «10,027»)، در PDF و اکسل هر دو. */
  plain?: boolean;
}

export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** ردیف جمع، پررنگ. */
  total?: ReportCell[] | null;
  note?: string | null;
}

export interface ReportStat {
  label: string;
  value: number;
}

export interface ReportDocument {
  /** «گزارش تولید»؛ عنوان PDF و نام برگهٔ اول اکسل نه (آن «خلاصه» است). */
  title: string;
  /** بازه و چاپخانه: «پرداخت سه‌شنبه 22 مهر · همهٔ چاپخانه‌ها». */
  subtitle: string;
  /** «ساخته شده 22 مهر 1405، 11:20، الهام فرجی». */
  made: string;
  notes: string[];
  stats: ReportStat[];
  tables: ReportTable[];
  /** فهرست سفارش‌ها: برگهٔ دوم اکسل، و جدول آخر PDF تا سقف. */
  detail: ReportTable | null;
  /** نام فایل بی پسوند، ASCII: `gozaresh-tolid-1405-07-22`. */
  fileBase: string;
}

/** «ساخته شده 22 مهر 1405، 11:20، الهام فرجی»: زمان ساختن خروجی به وقت تهران و کسی که خواست. */
export const madeText = (at: Date, by: string) => `ساخته شده ${formatJalali(at)}، ${formatTehranTime(at)}، ${by}`;

/** بیشترین ردیف فهرست سفارش‌ها در PDF. */
export const PDF_DETAIL_MAX = 300;

/** تکه‌های متن پنل (`Seg`) به یک رشته، برای سند: عدد همان متن خودش، نام فایل و کد همان. */
export function segText(segs: readonly Seg[]): string {
  return segs
    .map((seg) => {
      if (typeof seg === 'string') return seg;
      if ('num' in seg) return seg.num;
      if ('ltr' in seg) return seg.ltr;
      if ('name' in seg) return seg.name;
      return seg.barcode;
    })
    .join('');
}

const cellText = (cell: ReportCell, plain = false): string =>
  cell === null ? '' : typeof cell === 'number' ? (plain ? String(cell) : formatNumber(cell)) : cell;

/**
 * دادهٔ قالب PDF کارگر (`report.html`، `render_report`): همان سند، هر خانه متن (عدد با جداکنندهٔ هزارگان)، ستون عددی با پرچم تا قالب
 * چپ‌چینش کند، و فهرست سفارش‌ها تا `cap` ردیف با یادداشت. قالب هیچ چیز حساب نمی‌کند.
 */
export function pdfContext(doc: ReportDocument, cap = PDF_DETAIL_MAX): Record<string, unknown> {
  const table = (t: ReportTable, rows = t.rows, note = t.note ?? null) => {
    const line = (row: ReportCell[]) => row.map((cell, i) => cellText(cell, t.columns[i]?.plain === true));
    return {
      title: t.title,
      columns: t.columns.map((column) => ({ label: column.label, numeric: column.numeric === true })),
      rows: rows.map(line),
      total: t.total ? line(t.total) : null,
      note,
    };
  };
  const detail = doc.detail;
  const cut = detail !== null && detail.rows.length > cap;
  return {
    title: doc.title,
    subtitle: doc.subtitle,
    made: doc.made,
    notes: doc.notes,
    stats: doc.stats.map((stat) => ({ label: stat.label, value: formatNumber(stat.value) })),
    tables: doc.tables.map((t) => table(t)),
    detail: detail
      ? table(
          detail,
          cut ? detail.rows.slice(0, cap) : detail.rows,
          cut ? `${formatNumber(cap)} ردیف اول از ${formatNumber(detail.rows.length)}؛ همه در خروجی اکسل.` : (detail.note ?? null),
        )
      : null,
  };
}

/** یک ردیف برگهٔ اکسل؛ `bold` برای سرستون، عنوان و جمع. */
export interface SheetRow {
  cells: ReportCell[];
  bold?: boolean;
}

export interface Sheet {
  /** نام برگه، تا ۳۱ نویسه و بی `[]:*?/\`. */
  name: string;
  rows: SheetRow[];
  /** پهنای هر ستون به نویسه. */
  widths: number[];
  /** ستون‌هایی که عددشان شناسه است (`ReportColumn.plain`): عدد بی قالب هزارگان. */
  plainColumns?: number[];
}

/** پهنای ستون‌ها از درازترین متن هر ستون، بین ۸ و ۴۸ نویسه. */
function widthsOf(rows: readonly SheetRow[]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    row.cells.forEach((cell, i) => {
      const length = cellText(cell).length;
      widths[i] = Math.max(widths[i] ?? 8, Math.min(48, length + 2));
    });
  }
  return widths;
}

/** جدول در برگه: عنوان، سرستون، ردیف‌ها و جمع، و یک ردیف خالی پس از آن. */
function tableRows(t: ReportTable, titled: boolean): SheetRow[] {
  return [
    ...(titled ? [{ cells: [t.title], bold: true }] : []),
    { cells: t.columns.map((column) => column.label), bold: true },
    ...t.rows.map((cells) => ({ cells })),
    ...(t.total ? [{ cells: t.total, bold: true }] : []),
    ...(t.note ? [{ cells: [t.note] }] : []),
  ];
}

/**
 * برگه‌های اکسل سند (سؤال ۲۷۷): «خلاصه» با عنوان، بازه، زمان ساختن، یادداشت‌ها، کاشی‌ها (نام و عدد) و هر جدول، و برگهٔ دوم فهرست سفارش‌ها
 * با سرستون در ردیف اول، تا مرتب کردن و فیلتر اکسل بی دست‌کاری کار کند.
 */
export function documentSheets(doc: ReportDocument): Sheet[] {
  const blank: SheetRow = { cells: [] };
  const summary: SheetRow[] = [
    { cells: [doc.title], bold: true },
    { cells: [doc.subtitle] },
    { cells: [doc.made] },
    ...doc.notes.map((note) => ({ cells: [note] })),
    blank,
    ...doc.stats.map((stat) => ({ cells: [stat.label, stat.value] })),
  ];
  for (const t of doc.tables) summary.push(blank, ...tableRows(t, true));
  const sheets: Sheet[] = [{ name: 'خلاصه', rows: summary, widths: widthsOf(summary) }];
  if (doc.detail) {
    const rows = tableRows(doc.detail, false);
    const plainColumns = doc.detail.columns.flatMap((column, i) => (column.plain ? [i] : []));
    sheets.push({ name: doc.detail.title, rows, widths: widthsOf(rows), ...(plainColumns.length ? { plainColumns } : {}) });
  }
  return sheets;
}
