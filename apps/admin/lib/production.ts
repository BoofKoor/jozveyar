/**
 * گزارش تولید به زبان پنل (برش ۱۰٫۲، ADR-061، سؤال ۲۰۱): بازه از نشانی، جمع‌ها و جدول‌ها، و سند خروجی اکسل و PDF. خالص، بی پایگاه داده و
 * بی JSX، مثل گزارش ارسال (`report.ts`)؛ صفحه فقط می‌چیندش.
 *
 * - **بازه** (سؤال ۲۷۲): روز پرداخت به وقت تهران (`from` و `to`، شمسی، دوسرشامل) یا شمارهٔ سفارش (`nfrom` و `nto`، دوسرشامل)؛ بی هیچ،
 *   امروز؛ چیپ‌های «امروز»، «دیروز» و «این ماه» (`d`). تا ۳۶۶ روز و ۱۰٬۰۰۰ شماره: بیشتر از آن گزارش نیست، بایگانی است.
 * - **کدام سفارش** (سؤال ۲۷۳): هر پرداخت‌شده‌ای که ذخیره‌گاه می‌دهد؛ لغوشده جدا (شماره‌ها و مبلغ)، در هیچ جمعی نه.
 * - **عددها** با احتساب نسخه‌ها (سؤال ۲۷۴): صفحه = روی چاپی (رنگی و سیاه‌سفید جدا) × نسخه، برگ = برگ یک نسخه × نسخه، صحافی = جلد ×
 *   نسخه، همه از ریز قیمت منجمد. جزوهٔ «رنگی» یعنی دست‌کم یک روی رنگی؛ «فرد» یعنی شمار صفحه‌اش فرد است. کاغذ و اندازه با هم، و جزوه‌ای
 *   با بیش از یک کاغذ («چند کاغذ») جدا، چون برگ هر کاغذش از ریز قیمت درنمی‌آید.
 * - **هنوز آماده نیست** (سؤال ۲۷۵): «در صف چاپ»ی که فایل چاپ یکی از جزوه‌هایش ساخته نشده؛ «در حال چاپ» و پس از آن همیشه آماده‌اند.
 * - **چاپخانه‌ها** به ترتیب بیشترین سفارش، و «بی چاپخانه» آخر، مثل گزارش ارسال؛ مبلغ (جمع پرداخت مشتری) و از ۱۰٫۳ سهم چاپخانه (سهم منجمد
 *   هر سفارش، سؤال ۴۰۱) فقط برای کسی که `orders.money` دارد، که سازندهٔ سند می‌گوید.
 */

import type { PaperSize } from '@jozveyar/contracts';
import type { ProductionOrder, ProductionRange } from '@jozveyar/db';
import { formatJalali, formatJalaliNumeric, formatJalaliWeekday, jalaliYear, parseJalaliNumeric, tehranDayStart } from '@jozveyar/text';

import { STATUS_LABELS, paperSizeText, type Seg } from './orders';
import { NO_PARTNER, tomansOf } from './report';
import { madeText, segText, type ReportDocument, type ReportTable } from './reportDocument';
import { parseWholeNumber } from './settings';

/* ───────────────────────── بازه ───────────────────────── */

export const PRODUCTION_MAX_DAYS = 366;
export const PRODUCTION_MAX_NUMBERS = 10_000;

export const PRODUCTION_CHIPS = ['today', 'yesterday', 'month'] as const;
export type ProductionChip = (typeof PRODUCTION_CHIPS)[number];

export const CHIP_LABELS: Record<ProductionChip, string> = { today: 'امروز', yesterday: 'دیروز', month: 'این ماه' };

/** فرم بازه همان‌طور که صفحه پر می‌کند: روزها شمسی، شماره‌ها متن، و چاپخانه (`''` یعنی همه). */
export interface ProductionForm {
  by: 'paid' | 'number';
  from: string;
  to: string;
  nfrom: string;
  nto: string;
  partner: string;
}

export type ProductionField = 'from' | 'to' | 'nfrom' | 'nto';

export type ProductionInputError =
  | 'invalid_day'
  | 'invalid_last_day'
  | 'day_order'
  | 'too_many_days'
  | 'invalid_number'
  | 'number_order'
  | 'too_many_numbers';

export interface ProductionQuery {
  range: ProductionRange;
  chip: ProductionChip | null;
  /** «پرداخت سه‌شنبه 22 مهر»، «پرداخت از 1 مهر تا 22 مهر»، «سفارش‌های 10027 تا 10056». */
  label: Seg[];
  /** بخش بازهٔ نام فایل: `1405-07-22`، `1405-07-01-ta-1405-07-22`، `10027-ta-10056`. */
  fileRange: string;
  form: ProductionForm;
}

const text = (value: string | undefined) => (typeof value === 'string' ? value.slice(0, 40).trim() : '');
const fileDay = (day: Date) => formatJalaliNumeric(day).replaceAll('/', '-');

/** روز در گزارش: «سه‌شنبه 22 مهر»، و از سال دیگری «22 مهر 1404». */
function dayLabel(day: Date, now: Date): string {
  return jalaliYear(day) === jalaliYear(now) ? formatJalaliWeekday(day) : formatJalali(day);
}

/** بازهٔ روز پرداخت: از آغاز روز اول تا آغاز روز پس از روز آخر. */
function paidQuery(first: Date, last: Date, now: Date, chip: ProductionChip | null, form: ProductionForm): ProductionQuery {
  const single = first.getTime() === last.getTime();
  return {
    range: { by: 'paid', from: first, to: tehranDayStart(last, 1) },
    chip,
    label: single ? [`پرداخت ${dayLabel(first, now)}`] : [`پرداخت از ${dayLabel(first, now)} تا ${dayLabel(last, now)}`],
    fileRange: single ? fileDay(first) : `${fileDay(first)}-ta-${fileDay(last)}`,
    form: { ...form, by: 'paid', from: formatJalaliNumeric(first), to: formatJalaliNumeric(last), nfrom: '', nto: '' },
  };
}

/**
 * بازهٔ گزارش از نشانی: `d` (چیپ)، یا `from` و `to` (روز پرداخت؛ یکی تنها یعنی همان یک روز)، یا `nfrom` و `nto` (شمارهٔ سفارش؛ یکی تنها
 * یعنی همان یک سفارش)؛ بی هیچ، امروز. خطا با فیلدش، و فرم همان که نوشته شد تا دوباره پر نشود.
 */
export function readProductionQuery(
  params: { d?: string; from?: string; to?: string; nfrom?: string; nto?: string; p?: string },
  now: Date,
): { ok: true; query: ProductionQuery } | { ok: false; field: ProductionField; error: ProductionInputError; form: ProductionForm } {
  const form: ProductionForm = {
    by: text(params.nfrom) || text(params.nto) ? 'number' : 'paid',
    from: text(params.from),
    to: text(params.to),
    nfrom: text(params.nfrom),
    nto: text(params.nto),
    partner: text(params.p),
  };
  const today = tehranDayStart(now);
  const chip = (PRODUCTION_CHIPS as readonly string[]).includes(params.d ?? '') ? (params.d as ProductionChip) : null;
  if (chip === 'today') return { ok: true, query: paidQuery(today, today, now, chip, form) };
  if (chip === 'yesterday') {
    const yesterday = tehranDayStart(now, -1);
    return { ok: true, query: paidQuery(yesterday, yesterday, now, chip, form) };
  }
  if (chip === 'month') {
    const monthStart = parseJalaliNumeric(`${formatJalaliNumeric(now).slice(0, 7)}/01`)!;
    return { ok: true, query: paidQuery(monthStart, today, now, chip, form) };
  }

  if (form.by === 'number') {
    const a = parseWholeNumber(form.nfrom || form.nto);
    if (a === null || a < 1) return { ok: false, field: form.nfrom ? 'nfrom' : 'nto', error: 'invalid_number', form };
    const b = form.nto && form.nfrom ? parseWholeNumber(form.nto) : a;
    if (b === null || b < 1) return { ok: false, field: 'nto', error: 'invalid_number', form };
    if (b < a) return { ok: false, field: 'nto', error: 'number_order', form };
    if (b - a + 1 > PRODUCTION_MAX_NUMBERS) return { ok: false, field: 'nto', error: 'too_many_numbers', form };
    return {
      ok: true,
      query: {
        range: { by: 'number', from: a, to: b },
        chip: null,
        label: a === b ? ['سفارش ', { num: String(a) }] : ['سفارش‌های ', { num: String(a) }, ' تا ', { num: String(b) }],
        fileRange: a === b ? String(a) : `${a}-ta-${b}`,
        form: { ...form, nfrom: String(a), nto: String(b), from: '', to: '' },
      },
    };
  }

  if (!form.from && !form.to) return { ok: true, query: paidQuery(today, today, now, 'today', form) };
  const first = parseJalaliNumeric(form.from || form.to);
  if (!first) return { ok: false, field: form.from ? 'from' : 'to', error: 'invalid_day', form };
  const last = form.from && form.to ? parseJalaliNumeric(form.to) : first;
  if (!last) return { ok: false, field: 'to', error: 'invalid_last_day', form };
  if (last.getTime() < first.getTime()) return { ok: false, field: 'to', error: 'day_order', form };
  if (tehranDayStart(first, PRODUCTION_MAX_DAYS).getTime() <= last.getTime()) return { ok: false, field: 'to', error: 'too_many_days', form };
  const chosen = first.getTime() === today.getTime() && last.getTime() === today.getTime() ? 'today' : null;
  return { ok: true, query: paidQuery(first, last, now, chosen, form) };
}

/**
 * پارامترهای نشانی همان گزارش، شکل یکتا: چیپ (`d`)، یا بازهٔ روز (`from` و `to`)، یا بازهٔ شماره (`nfrom` و `nto`)؛ و چاپخانه (`p`). برای
 * چیپ‌های چاپخانه، خروجی اکسل و فرم PDF، تا خروجی همان باشد که صفحه نشان داد.
 */
export function productionParams(query: ProductionQuery, partnerId: string | null): Record<string, string> {
  const range: Record<string, string> = query.chip
    ? { d: query.chip }
    : query.range.by === 'number'
      ? { nfrom: query.form.nfrom, nto: query.form.nto }
      : { from: query.form.from, to: query.form.to };
  return partnerId ? { ...range, p: partnerId } : range;
}

/** «?d=today&p=…»، یا هیچ. */
export function searchOf(params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return search ? `?${search}` : '';
}

/** متن هر خطای فیلد، زیر همان فیلد. */
export function productionErrorText(error: ProductionInputError): string {
  switch (error) {
    case 'invalid_day':
      return 'روز را شمسی بنویس، مثلاً 1405/07/22.';
    case 'invalid_last_day':
      return 'روز آخر را شمسی بنویس، مثلاً 1405/07/22.';
    case 'day_order':
      return 'روز آخر پیش از روز اول است.';
    case 'too_many_days':
      return `بازهٔ روز تا ${PRODUCTION_MAX_DAYS} روز.`;
    case 'invalid_number':
      return 'شمارهٔ سفارش را با رقم بنویس، مثلاً 10027.';
    case 'number_order':
      return 'شمارهٔ آخر از شمارهٔ اول کمتر است.';
    case 'too_many_numbers':
      return `بازهٔ شماره تا ${PRODUCTION_MAX_NUMBERS.toLocaleString('en-US')} سفارش.`;
  }
}

/* ───────────────────────── جمع‌ها ───────────────────────── */

export interface ProductionTotals {
  orders: number;
  jozves: number;
  files: number;
  /** جمع نسخه‌ها. */
  copies: number;
  /** روی چاپی × نسخه. */
  colorPages: number;
  bwPages: number;
  /** برگ × نسخه. */
  sheets: number;
}

/** جزوه‌های رنگی یا سیاه‌سفید. */
export interface KindRow {
  jozves: number;
  /** جزوه‌هایی که شمار صفحه‌شان فرد است. */
  odd: number;
  copies: number;
  /** روی چاپی × نسخه. */
  pages: number;
}

export interface BindingRow {
  id: string;
  name: string;
  copies: number;
  /** جلد × نسخه. */
  volumes: number;
}

/** اندازه و کاغذ؛ `paper` null یعنی جزوه‌هایی با بیش از یک کاغذ. */
export interface StockRow {
  size: PaperSize;
  paper: { id: string; name: string } | null;
  copies: number;
  sheets: number;
}

export interface PartnerRow {
  /** شناسهٔ چاپخانه، یا `none`. */
  key: string;
  label: string;
  orders: number;
  jozves: number;
  copies: number;
  pages: number;
  sheets: number;
  amountRials: bigint;
  /** جمع سهم منجمد چاپخانه از همین سفارش‌ها (۱۰٫۳)؛ بی سهم‌ها هیچ. */
  shareRials: bigint;
  /** سفارش‌های همین چاپخانه که سهم ندارند (سپرده‌شده وقتی چاپخانه درصد نداشت). */
  unshared: number;
}

export interface ProductionReport {
  totals: ProductionTotals;
  color: KindRow;
  bw: KindRow;
  bindings: BindingRow[];
  stock: StockRow[];
  partners: PartnerRow[];
  /** جمع پرداخت مشتری سفارش‌های شمرده‌شده. */
  amountRials: bigint;
  /** «در صف چاپ»ی که فایل چاپ یکی از جزوه‌هایش ساخته نشده. */
  notReady: number[];
  cancelled: { orders: number[]; amountRials: bigint };
  /** سفارش‌های شمرده‌شده (بی لغوشده)، به ترتیب شماره، برای فهرست خروجی. */
  orders: ProductionOrder[];
}

const SIZE_ORDER: readonly PaperSize[] = ['a4', 'a5', 'a3'];
const emptyKind = (): KindRow => ({ jozves: 0, odd: 0, copies: 0, pages: 0 });

/** جمع‌ها و جدول‌های گزارش از سفارش‌های ذخیره‌گاه. */
export function aggregateProduction(orders: readonly ProductionOrder[]): ProductionReport {
  const totals: ProductionTotals = { orders: 0, jozves: 0, files: 0, copies: 0, colorPages: 0, bwPages: 0, sheets: 0 };
  const color = emptyKind();
  const bw = emptyKind();
  const bindings = new Map<string, BindingRow>();
  const stock = new Map<string, StockRow>();
  const partners = new Map<string, PartnerRow>();
  const counted: ProductionOrder[] = [];
  const notReady: number[] = [];
  const cancelled = { orders: [] as number[], amountRials: 0n };
  let amountRials = 0n;

  for (const order of orders) {
    if (order.status === 'cancelled') {
      cancelled.orders.push(order.orderNumber);
      cancelled.amountRials += order.totalRials;
      continue;
    }
    counted.push(order);
    totals.orders += 1;
    amountRials += order.totalRials;
    if (order.status === 'paid' && order.items.some((item) => !item.ready)) notReady.push(order.orderNumber);
    const partnerKey = order.partner?.id ?? 'none';
    const partner =
      partners.get(partnerKey) ??
      ({
        key: partnerKey,
        label: order.partner ? `${order.partner.name} · ${order.partner.cityName}` : NO_PARTNER,
        orders: 0,
        jozves: 0,
        copies: 0,
        pages: 0,
        sheets: 0,
        amountRials: 0n,
        shareRials: 0n,
        unshared: 0,
      } satisfies PartnerRow);
    partner.orders += 1;
    partner.amountRials += order.totalRials;
    partner.shareRials += order.shareRials ?? 0n;
    if (order.partner && order.shareRials === null) partner.unshared += 1;
    partners.set(partnerKey, partner);

    for (const item of order.items) {
      const pages = (item.colorSides + item.bwSides) * item.copies;
      const sheets = item.sheets * item.copies;
      totals.jozves += 1;
      totals.files += item.files;
      totals.copies += item.copies;
      totals.colorPages += item.colorSides * item.copies;
      totals.bwPages += item.bwSides * item.copies;
      totals.sheets += sheets;
      const kind = item.colorSides > 0 ? color : bw;
      kind.jozves += 1;
      kind.odd += item.pageCount % 2 === 1 ? 1 : 0;
      kind.copies += item.copies;
      kind.pages += pages;
      partner.jozves += 1;
      partner.copies += item.copies;
      partner.pages += pages;
      partner.sheets += sheets;

      const binding = bindings.get(item.bindingTypeId) ?? { id: item.bindingTypeId, name: item.bindingName ?? item.bindingTypeId, copies: 0, volumes: 0 };
      binding.copies += item.copies;
      binding.volumes += item.volumes * item.copies;
      bindings.set(item.bindingTypeId, binding);

      const paper = item.papers.length === 1 ? { id: item.papers[0]!.id, name: item.papers[0]!.name ?? item.papers[0]!.id } : null;
      const stockKey = `${item.paperSize}:${paper?.id ?? '*'}`;
      const row = stock.get(stockKey) ?? { size: item.paperSize, paper, copies: 0, sheets: 0 };
      row.copies += item.copies;
      row.sheets += sheets;
      stock.set(stockKey, row);
    }
  }

  return {
    totals,
    color,
    bw,
    bindings: [...bindings.values()].sort((a, b) => b.volumes - a.volumes || a.name.localeCompare(b.name, 'fa')),
    stock: [...stock.values()].sort(
      (a, b) =>
        SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size) ||
        Number(a.paper === null) - Number(b.paper === null) ||
        b.sheets - a.sheets ||
        (a.paper?.name ?? '').localeCompare(b.paper?.name ?? '', 'fa'),
    ),
    partners: [...partners.values()].sort(
      (a, b) => Number(a.key === 'none') - Number(b.key === 'none') || b.orders - a.orders || a.label.localeCompare(b.label, 'fa'),
    ),
    amountRials,
    notReady,
    cancelled,
    orders: counted,
  };
}

/** «کاغذ» یک ردیف: نام کاغذ، یا «چند کاغذ». */
export const stockPaperText = (row: StockRow) => row.paper?.name ?? 'چند کاغذ';

/** صحافی‌های یک سفارش در یک خط: «طلق و سیم × 2، منگنه × 1» (جلد × نسخه). */
export function orderBindingsText(order: ProductionOrder): string {
  const volumes = new Map<string, number>();
  for (const item of order.items) {
    const name = item.bindingName ?? item.bindingTypeId;
    volumes.set(name, (volumes.get(name) ?? 0) + item.volumes * item.copies);
  }
  return [...volumes].map(([name, n]) => `${name} × ${n}`).join('، ');
}

/** شماره‌های سفارش در یک خط: «10027، 10031». */
export const numbersText = (numbers: readonly number[]) => numbers.join('، ');

/* ───────────────────────── سند خروجی ───────────────────────── */

const tomans = (rials: bigint) => Number(tomansOf(rials));

/**
 * سند خروجی گزارش تولید (سؤال‌های ۲۷۷ و ۲۷۸): همان کاشی‌ها و جدول‌های صفحه، و فهرست سفارش‌ها. `money`: ستون و کاشی مبلغ (فقط
 * `orders.money`). `partnerLabel`: «همهٔ چاپخانه‌ها»، یا چاپخانهٔ انتخاب‌شده یا خود کاربر چاپخانه؛ جدول چاپخانه‌ها فقط با بیش از یکی.
 */
export function productionDocument(input: {
  report: ProductionReport;
  query: ProductionQuery;
  partnerLabel: string;
  money: boolean;
  made: { at: Date; by: string };
}): ReportDocument {
  const { report, query, partnerLabel, money, made } = input;
  const { totals } = report;
  const notes: string[] = [];
  if (report.notReady.length > 0) {
    notes.push(`⏳ ${report.notReady.length} سفارش هنوز آماده نیست (فایل چاپ ساخته نشده): ${numbersText(report.notReady)}`);
  }
  if (report.cancelled.orders.length > 0) {
    notes.push(
      `${report.cancelled.orders.length} سفارش لغوشده در بازه، در هیچ جمعی نیست: ${numbersText(report.cancelled.orders)}` +
        (money ? ` (پرداخت مشتری ${tomans(report.cancelled.amountRials).toLocaleString('en-US')} تومان)` : ''),
    );
  }
  const tables: ReportTable[] = [
    {
      title: 'جزوه‌ها',
      columns: [{ label: '' }, { label: 'جزوه', numeric: true }, { label: 'فرد', numeric: true }, { label: 'نسخه', numeric: true }, { label: 'صفحه', numeric: true }],
      rows: [
        ['رنگی', report.color.jozves, report.color.odd, report.color.copies, report.color.pages],
        ['سیاه‌سفید', report.bw.jozves, report.bw.odd, report.bw.copies, report.bw.pages],
      ],
      total: [
        'جمع',
        report.color.jozves + report.bw.jozves,
        report.color.odd + report.bw.odd,
        report.color.copies + report.bw.copies,
        report.color.pages + report.bw.pages,
      ],
      note: '«فرد»: جزوه‌هایی که شمار صفحه‌شان فرد است. صفحه با احتساب نسخه‌ها.',
    },
    {
      title: 'صحافی',
      columns: [{ label: 'صحافی' }, { label: 'نسخه', numeric: true }, { label: 'جلد', numeric: true }],
      rows: report.bindings.map((row) => [row.name, row.copies, row.volumes]),
    },
    {
      title: 'اندازه و کاغذ',
      columns: [{ label: 'اندازه' }, { label: 'کاغذ' }, { label: 'نسخه', numeric: true }, { label: 'برگ', numeric: true }],
      rows: report.stock.map((row) => [paperSizeText(row.size), stockPaperText(row), row.copies, row.sheets]),
    },
  ];
  if (report.partners.length > 1) {
    tables.push({
      title: 'چاپخانه‌ها',
      columns: [
        { label: 'چاپخانه' },
        { label: 'سفارش', numeric: true },
        { label: 'جزوه', numeric: true },
        { label: 'نسخه', numeric: true },
        { label: 'صفحه', numeric: true },
        { label: 'برگ', numeric: true },
        ...(money ? [{ label: 'مبلغ (تومان)', numeric: true }, { label: 'سهم چاپخانه (تومان)', numeric: true }] : []),
      ],
      rows: report.partners.map((row) => [
        row.label,
        row.orders,
        row.jozves,
        row.copies,
        row.pages,
        row.sheets,
        ...(money ? [tomans(row.amountRials), row.key === 'none' ? null : tomans(row.shareRials)] : []),
      ]),
      note: money ? 'سهم چاپخانه: سهم منجمد هر سفارش، همان که صورت‌حساب تسویه می‌شمارد؛ سفارش بی سهم در آن نیست.' : null,
    });
  }
  const detail: ReportTable | null =
    report.orders.length === 0
      ? null
      : {
          title: 'سفارش‌ها',
          columns: [
            { label: 'شماره', numeric: true, plain: true },
            { label: 'وضعیت' },
            { label: 'روز پرداخت' },
            { label: 'چاپخانه' },
            { label: 'جزوه', numeric: true },
            { label: 'فایل', numeric: true },
            { label: 'نسخه', numeric: true },
            { label: 'صفحهٔ رنگی', numeric: true },
            { label: 'صفحهٔ سیاه‌سفید', numeric: true },
            { label: 'برگ', numeric: true },
            { label: 'صحافی (جلد)' },
            { label: 'فایل چاپ' },
            ...(money ? [{ label: 'مبلغ (تومان)', numeric: true }, { label: 'سهم چاپخانه (تومان)', numeric: true }] : []),
          ],
          rows: report.orders.map((order) => {
            const sum = (value: (item: ProductionOrder['items'][number]) => number) => order.items.reduce((n, item) => n + value(item), 0);
            return [
              order.orderNumber,
              STATUS_LABELS[order.status],
              formatJalaliNumeric(order.paidAt),
              order.partner ? `${order.partner.name} · ${order.partner.cityName}` : NO_PARTNER,
              order.items.length,
              sum((item) => item.files),
              sum((item) => item.copies),
              sum((item) => item.colorSides * item.copies),
              sum((item) => item.bwSides * item.copies),
              sum((item) => item.sheets * item.copies),
              orderBindingsText(order),
              order.items.every((item) => item.ready) ? 'ساخته شد' : 'هنوز نه',
              ...(money ? [tomans(order.totalRials), order.shareRials === null ? null : tomans(order.shareRials)] : []),
            ];
          }),
        };
  return {
    title: 'گزارش تولید',
    subtitle: `${segText(query.label)} · ${partnerLabel}`,
    made: madeText(made.at, made.by),
    notes,
    stats: [
      { label: 'سفارش', value: totals.orders },
      { label: 'جزوه', value: totals.jozves },
      { label: 'فایل', value: totals.files },
      { label: 'نسخه', value: totals.copies },
      { label: 'صفحهٔ رنگی', value: totals.colorPages },
      { label: 'صفحهٔ سیاه‌سفید', value: totals.bwPages },
      { label: 'برگ', value: totals.sheets },
      ...(money
        ? [
            { label: 'مبلغ (تومان)', value: tomans(report.amountRials) },
            { label: 'سهم چاپخانه (تومان)', value: tomans(report.partners.reduce((sum, row) => sum + row.shareRials, 0n)) },
          ]
        : []),
    ],
    tables,
    detail,
    fileBase: `gozaresh-tolid-${query.fileRange}`,
  };
}
