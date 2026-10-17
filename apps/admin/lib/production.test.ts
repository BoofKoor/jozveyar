import type { ProductionItem, ProductionOrder, ShippingReportOrder } from '@jozveyar/db';
import { describe, expect, it } from 'vitest';

import { aggregateProduction, orderBindingsText, productionDocument, readProductionQuery, type ProductionQuery } from './production';
import { aggregateReport } from './report';
import { documentSheets, PDF_DETAIL_MAX, pdfContext, type ReportDocument } from './reportDocument';
import { shippingDocument } from './shippingDocument';

const NOW = new Date('2026-10-14T07:50:00Z'); // چهارشنبه 22 مهر 1405، ساعت 11:20 تهران
const TODAY = new Date('2026-10-13T20:30:00Z');
const TOMORROW = new Date('2026-10-14T20:30:00Z');

const ok = (params: Parameters<typeof readProductionQuery>[0]) => {
  const result = readProductionQuery(params, NOW);
  if (!result.ok) throw new Error(`${result.field}: ${result.error}`);
  return result.query;
};
const bad = (params: Parameters<typeof readProductionQuery>[0]) => {
  const result = readProductionQuery(params, NOW);
  if (result.ok) throw new Error('پذیرفته شد');
  return [result.field, result.error];
};

describe('بازهٔ گزارش تولید (سؤال ۲۷۲)', () => {
  it('بی هیچ، امروز؛ چیپ‌های امروز، دیروز و این ماه با مرز روز تهران و پایان انحصاری', () => {
    expect(ok({})).toMatchObject({
      range: { by: 'paid', from: TODAY, to: TOMORROW },
      chip: 'today',
      label: ['پرداخت چهارشنبه 22 مهر'],
      fileRange: '1405-07-22',
      form: { by: 'paid', from: '1405/07/22', to: '1405/07/22', nfrom: '', nto: '' },
    });
    expect(ok({ d: 'yesterday' })).toMatchObject({
      range: { by: 'paid', from: new Date('2026-10-12T20:30:00Z'), to: TODAY },
      chip: 'yesterday',
      label: ['پرداخت سه‌شنبه 21 مهر'],
    });
    expect(ok({ d: 'month' })).toMatchObject({
      range: { by: 'paid', from: new Date('2026-09-22T20:30:00Z'), to: TOMORROW },
      chip: 'month',
      label: ['پرداخت از چهارشنبه 1 مهر تا چهارشنبه 22 مهر'],
      fileRange: '1405-07-01-ta-1405-07-22',
    });
    // چیپ ناشناس هیچ است، نه خطا.
    expect(ok({ d: 'week' }).chip).toBe('today');
  });

  it('روز پرداخت: دوسرشامل، ارقام فارسی، یکی تنها یعنی همان روز، و سال دیگر با سالش', () => {
    expect(ok({ from: '۱۴۰۵/۰۷/۰۱', to: '1405/07/22' })).toMatchObject({
      range: { by: 'paid', from: new Date('2026-09-22T20:30:00Z'), to: TOMORROW },
      chip: null,
      form: { from: '1405/07/01', to: '1405/07/22' },
    });
    expect(ok({ to: '1405/07/21' })).toMatchObject({ range: { from: new Date('2026-10-12T20:30:00Z'), to: TODAY }, label: ['پرداخت سه‌شنبه 21 مهر'] });
    expect(ok({ from: '1405/07/22', to: '1405/07/22' }).chip).toBe('today');
    expect(ok({ from: '1404/12/25', to: '1405/01/02' }).label).toEqual(['پرداخت از 25 اسفند 1404 تا یکشنبه 2 فروردین']);
  });

  it('شمارهٔ سفارش: دوسرشامل، با جداکننده و ارقام فارسی، یکی تنها یعنی همان سفارش؛ روز نادیده', () => {
    expect(ok({ nfrom: '10,027', nto: '۱۰۰۵۶', from: '1405/07/01' })).toMatchObject({
      range: { by: 'number', from: 10027, to: 10056 },
      chip: null,
      label: ['سفارش‌های ', { num: '10027' }, ' تا ', { num: '10056' }],
      fileRange: '10027-ta-10056',
      form: { by: 'number', nfrom: '10027', nto: '10056', from: '', to: '' },
    });
    expect(ok({ nto: '10031' })).toMatchObject({ range: { by: 'number', from: 10031, to: 10031 }, label: ['سفارش ', { num: '10031' }], fileRange: '10031' });
  });

  it('خطا زیر فیلد خودش، و سقف‌ها: ۳۶۶ روز و ۱۰٬۰۰۰ شماره', () => {
    expect(bad({ from: '1405/13/01' })).toEqual(['from', 'invalid_day']);
    expect(bad({ to: 'دیروز' })).toEqual(['to', 'invalid_day']);
    expect(bad({ from: '1405/07/01', to: '1405-07-02' })).toEqual(['to', 'invalid_last_day']);
    expect(bad({ from: '1405/07/10', to: '1405/07/09' })).toEqual(['to', 'day_order']);
    // ۳۶۶ روز پذیرفته، ۳۶۷ نه.
    expect(ok({ from: '1404/07/22', to: '1405/07/22' }).range).toMatchObject({ by: 'paid' });
    expect(bad({ from: '1404/07/21', to: '1405/07/22' })).toEqual(['to', 'too_many_days']);
    expect(bad({ nfrom: 'ده' })).toEqual(['nfrom', 'invalid_number']);
    expect(bad({ nfrom: '0' })).toEqual(['nfrom', 'invalid_number']);
    expect(bad({ nfrom: '10027', nto: 'x' })).toEqual(['nto', 'invalid_number']);
    expect(bad({ nfrom: '10027', nto: '10026' })).toEqual(['nto', 'number_order']);
    expect(ok({ nfrom: '1', nto: '10000' }).range).toEqual({ by: 'number', from: 1, to: 10000 });
    expect(bad({ nfrom: '1', nto: '10001' })).toEqual(['nto', 'too_many_numbers']);
    // فرم همان که نوشته شد برمی‌گردد.
    const failed = readProductionQuery({ from: '1405/07/10', to: '1405/07/09', p: 'noor' }, NOW);
    expect(failed).toMatchObject({ ok: false, form: { by: 'paid', from: '1405/07/10', to: '1405/07/09', partner: 'noor' } });
  });
});

/* ───────────────────────── جمع‌ها ───────────────────────── */

const item = (over: Partial<ProductionItem> = {}): ProductionItem => ({
  seq: 1,
  pageCount: 20,
  copies: 1,
  sidesMode: 'double',
  paperSize: 'a4',
  bindingTypeId: 'spiral_clear',
  bindingName: 'طلق و سیم',
  files: 1,
  colorSides: 0,
  bwSides: 20,
  sheets: 10,
  volumes: 1,
  papers: [{ id: 'tahrir80', name: 'تحریر ۸۰ گرم' }],
  ready: true,
  ...over,
});
const JOZVEYAR = { id: 'p-1', name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران' };
const NOOR = { id: 'p-2', name: 'چاپ نور', cityName: 'مشهد' };
const order = (orderNumber: number, items: ProductionItem[], over: Partial<ProductionOrder> = {}): ProductionOrder => ({
  orderNumber,
  status: 'paid',
  paidAt: new Date('2026-10-14T06:30:00Z'),
  totalRials: 1_000_000n,
  partner: JOZVEYAR,
  items,
  ...over,
});

const ORDERS: ProductionOrder[] = [
  // دو جزوه: سیاه‌سفید ۲۱ صفحه‌ای (فرد) دو نسخه در دو فایل، و رنگی A5 گلاسه با منگنه.
  order(10027, [
    item({ pageCount: 21, copies: 2, files: 2, bwSides: 21, sheets: 11 }),
    item({ seq: 2, pageCount: 10, sidesMode: 'single', paperSize: 'a5', bindingTypeId: 'staple', bindingName: 'منگنه', colorSides: 10, bwSides: 0, sheets: 10, papers: [{ id: 'glossy', name: 'گلاسه' }], ready: false }),
  ], { totalRials: 2_500_005n }),
  // جزوهٔ کلفت دو جلدی، سه نسخه، پیش چاپ نور، در حال چاپ.
  order(10028, [item({ pageCount: 1700, copies: 3, bwSides: 1700, sheets: 850, volumes: 2 })], { status: 'printing', partner: NOOR, totalRials: 30_000_000n }),
  // ترکیبی (رنگی و سیاه‌سفید) با دو کاغذ: «چند کاغذ». پیش از ۵٫۱ پست شد، پس فایل چاپ ندارد؛ ولی «هنوز آماده نیست» فقط «در صف چاپ» است.
  order(10029, [
    item({ pageCount: 7, colorSides: 2, bwSides: 5, sheets: 4, papers: [{ id: 'tahrir80', name: 'تحریر ۸۰ گرم' }, { id: 'glossy', name: 'گلاسه' }], ready: false }),
  ], { status: 'handed_to_post', partner: null, totalRials: 700_000n }),
  order(10030, [item()], { status: 'cancelled', totalRials: 1_200_000n }),
  order(10031, [item({ ready: false })], { totalRials: 900_000n }),
];

describe('جمع‌های گزارش تولید (سؤال‌های ۲۷۳ تا ۲۷۵)', () => {
  const report = aggregateProduction(ORDERS);

  it('کل با احتساب نسخه‌ها، لغوشده جدا و در هیچ جمعی', () => {
    expect(report.totals).toEqual({
      orders: 4,
      jozves: 5,
      files: 6,
      copies: 1 * 2 + 1 + 3 + 1 + 1,
      colorPages: 10 + 2,
      bwPages: 21 * 2 + 1700 * 3 + 5 + 20,
      sheets: 11 * 2 + 10 + 850 * 3 + 4 + 10,
    });
    expect(report.amountRials).toBe(2_500_005n + 30_000_000n + 700_000n + 900_000n);
    expect(report.cancelled).toEqual({ orders: [10030], amountRials: 1_200_000n });
    expect(report.orders.map((o) => o.orderNumber)).toEqual([10027, 10028, 10029, 10031]);
  });

  it('رنگی یعنی دست‌کم یک روی رنگی؛ «فرد» شمار صفحهٔ فرد؛ صفحه روی چاپی × نسخه', () => {
    expect(report.color).toEqual({ jozves: 2, odd: 1, copies: 2, pages: 10 + 7 });
    expect(report.bw).toEqual({ jozves: 3, odd: 1, copies: 2 + 3 + 1, pages: 21 * 2 + 1700 * 3 + 20 });
  });

  it('صحافی جلد × نسخه، بیشترین جلد اول؛ اندازه و کاغذ با «چند کاغذ» جدا', () => {
    expect(report.bindings).toEqual([
      { id: 'spiral_clear', name: 'طلق و سیم', copies: 2 + 3 + 1 + 1, volumes: 2 + 6 + 1 + 1 },
      { id: 'staple', name: 'منگنه', copies: 1, volumes: 1 },
    ]);
    expect(report.stock).toEqual([
      { size: 'a4', paper: { id: 'tahrir80', name: 'تحریر ۸۰ گرم' }, copies: 2 + 3 + 1, sheets: 22 + 2550 + 10 },
      { size: 'a4', paper: null, copies: 1, sheets: 4 },
      { size: 'a5', paper: { id: 'glossy', name: 'گلاسه' }, copies: 1, sheets: 10 },
    ]);
  });

  it('چاپخانه‌ها: بیشترین سفارش اول، «بی چاپخانه» آخر؛ هنوز آماده نیست فقط «در صف چاپ»', () => {
    expect(report.partners.map((row) => [row.key, row.label, row.orders, row.jozves, row.copies, row.pages, row.sheets, row.amountRials])).toEqual([
      ['p-1', 'چاپخانهٔ جزوه‌یار · تهران', 2, 3, 4, 42 + 10 + 20, 22 + 10 + 10, 2_500_005n + 900_000n],
      ['p-2', 'چاپ نور · مشهد', 1, 1, 3, 5100, 2550, 30_000_000n],
      ['none', 'بی چاپخانه', 1, 1, 1, 7, 4, 700_000n],
    ]);
    // ۱۰۰۲۸ در حال چاپ است: فایل چاپش هر چه باشد آماده شمرده می‌شود.
    expect(report.notReady).toEqual([10027, 10031]);
    expect(orderBindingsText(ORDERS[0]!)).toBe('طلق و سیم × 2، منگنه × 1');
    expect(orderBindingsText(ORDERS[1]!)).toBe('طلق و سیم × 6');
  });

  it('بی سفارش: همه صفر، و جدول‌ها خالی', () => {
    const empty = aggregateProduction([]);
    expect(empty.totals).toEqual({ orders: 0, jozves: 0, files: 0, copies: 0, colorPages: 0, bwPages: 0, sheets: 0 });
    expect([empty.bindings, empty.stock, empty.partners, empty.notReady, empty.orders]).toEqual([[], [], [], [], []]);
  });
});

describe('سند خروجی گزارش تولید (سؤال‌های ۲۷۷ و ۲۷۸)', () => {
  const report = aggregateProduction(ORDERS);
  const query: ProductionQuery = ok({});
  const made = { at: NOW, by: 'الهام فرجی' };

  it('با مبلغ: کاشی و ستون مبلغ به تومان گردشده، جدول چاپخانه‌ها، یادداشت آماده‌نبودن و لغوشده، و فهرست بی لغوشده', () => {
    const doc = productionDocument({ report, query, partnerLabel: 'همهٔ چاپخانه‌ها', money: true, made });
    expect(doc).toMatchObject({
      title: 'گزارش تولید',
      subtitle: 'پرداخت چهارشنبه 22 مهر · همهٔ چاپخانه‌ها',
      made: 'ساخته شده 22 مهر 1405، 11:20، الهام فرجی',
      fileBase: 'gozaresh-tolid-1405-07-22',
    });
    expect(doc.notes).toEqual([
      '⏳ 2 سفارش هنوز آماده نیست (فایل چاپ ساخته نشده): 10027، 10031',
      '1 سفارش لغوشده در بازه، در هیچ جمعی نیست: 10030 (پرداخت مشتری 120,000 تومان)',
    ]);
    expect(doc.stats.at(-1)).toEqual({ label: 'مبلغ (تومان)', value: 250_001 + 3_000_000 + 70_000 + 90_000 });
    expect(doc.tables.map((t) => t.title)).toEqual(['جزوه‌ها', 'صحافی', 'اندازه و کاغذ', 'چاپخانه‌ها']);
    expect(doc.tables[0]!.total).toEqual(['جمع', 5, 2, 8, 17 + 5162]);
    expect(doc.tables[2]!.rows[1]).toEqual(['A4', 'چند کاغذ', 1, 4]);
    expect(doc.tables[3]!.rows[0]).toEqual(['چاپخانهٔ جزوه‌یار · تهران', 2, 3, 4, 72, 42, 340_001]);
    expect(doc.detail!.rows.map((row) => row[0])).toEqual([10027, 10028, 10029, 10031]);
    expect(doc.detail!.rows[0]).toEqual([
      10027,
      'در صف چاپ',
      '1405/07/22',
      'چاپخانهٔ جزوه‌یار · تهران',
      2,
      3,
      3,
      10,
      42,
      32,
      'طلق و سیم × 2، منگنه × 1',
      'هنوز نه',
      250_001,
    ]);
    expect(doc.detail!.columns.at(-1)).toEqual({ label: 'مبلغ (تومان)', numeric: true });
  });

  it('بی مبلغ (کاربر چاپخانه): نه کاشی، نه ستون، نه مبلغ لغوشده؛ با یک چاپخانه جدول چاپخانه‌ها نیست', () => {
    const own = aggregateProduction(ORDERS.filter((o) => o.partner?.id === 'p-2'));
    const doc = productionDocument({ report: own, query, partnerLabel: 'چاپ نور · مشهد', money: false, made });
    expect(JSON.stringify(doc)).not.toContain('مبلغ');
    expect(JSON.stringify(doc)).not.toContain('تومان');
    expect(doc.tables.map((t) => t.title)).toEqual(['جزوه‌ها', 'صحافی', 'اندازه و کاغذ']);
    expect(doc.detail!.rows).toEqual([[10028, 'در حال چاپ', '1405/07/22', 'چاپ نور · مشهد', 1, 1, 3, 0, 5100, 2550, 'طلق و سیم × 6', 'ساخته شد']]);
    const partnerCancelled = aggregateProduction([order(10030, [item()], { status: 'cancelled', partner: NOOR })]);
    expect(productionDocument({ report: partnerCancelled, query, partnerLabel: 'چاپ نور', money: false, made }).notes).toEqual([
      '1 سفارش لغوشده در بازه، در هیچ جمعی نیست: 10030',
    ]);
    expect(productionDocument({ report: aggregateProduction([]), query, partnerLabel: 'چاپ نور', money: false, made }).detail).toBeNull();
  });
});

describe('سند به اکسل و PDF', () => {
  const doc: ReportDocument = productionDocument({
    report: aggregateProduction(ORDERS),
    query: ok({}),
    partnerLabel: 'همهٔ چاپخانه‌ها',
    money: true,
    made: { at: NOW, by: 'الهام فرجی' },
  });

  it('PDF: هر خانه متن با جداکنندهٔ هزارگان، ستون عددی با پرچم، و فهرست تا سقف با یادداشت', () => {
    const context = pdfContext(doc) as {
      stats: { label: string; value: string }[];
      tables: { columns: { numeric: boolean }[]; rows: string[][]; total: string[] | null }[];
      detail: { rows: string[][]; note: string | null };
    };
    expect(context.stats.at(-1)).toEqual({ label: 'مبلغ (تومان)', value: '3,410,001' });
    expect(context.tables[0]!.columns.map((c) => c.numeric)).toEqual([false, true, true, true, true]);
    expect(context.tables[0]!.total).toEqual(['جمع', '5', '2', '8', '5,179']);
    expect(context.detail.rows[1]![8]).toBe('5,100');
    expect(context.detail.note).toBeNull();
    const capped = pdfContext(doc, 2) as { detail: { rows: string[][]; note: string } };
    expect(capped.detail.rows.map((row) => row[0])).toEqual(['10027', '10028']);
    expect(capped.detail.note).toBe('2 ردیف اول از 4؛ همه در خروجی اکسل.');
    expect(PDF_DETAIL_MAX).toBe(300);
    // خانهٔ خالی متن خالی است، نه «null».
    expect(JSON.stringify(pdfContext({ ...doc, tables: [{ title: 't', columns: [{ label: 'a' }], rows: [[null]] }] }))).not.toContain('null]');
  });

  it('اکسل: «خلاصه» با عنوان، بازه، یادداشت‌ها، کاشی‌ها و جدول‌ها؛ برگهٔ «سفارش‌ها» با سرستون در ردیف اول', () => {
    const [summary, detail] = documentSheets(doc);
    expect(summary!.name).toBe('خلاصه');
    expect(summary!.rows.slice(0, 7).map((row) => [row.cells, row.bold ?? false])).toEqual([
      [['گزارش تولید'], true],
      [['پرداخت چهارشنبه 22 مهر · همهٔ چاپخانه‌ها'], false],
      [['ساخته شده 22 مهر 1405، 11:20، الهام فرجی'], false],
      [[doc.notes[0]], false],
      [[doc.notes[1]], false],
      [[], false],
      [['سفارش', 4], false],
    ]);
    // پس از کاشی‌ها: ردیف خالی، عنوان جدول پررنگ، سرستون پررنگ.
    const title = summary!.rows.findIndex((row) => row.cells[0] === 'جزوه‌ها');
    expect(summary!.rows[title - 1]!.cells).toEqual([]);
    expect(summary!.rows[title + 1]).toEqual({ cells: ['', 'جزوه', 'فرد', 'نسخه', 'صفحه'], bold: true });
    expect(detail!.name).toBe('سفارش‌ها');
    expect(detail!.rows[0]).toMatchObject({ bold: true });
    expect(detail!.rows[1]!.cells[0]).toBe(10027);
    expect(detail!.widths.every((width) => width >= 8 && width <= 48)).toBe(true);
  });
});

describe('سند خروجی گزارش ارسال (سؤال ۲۸۰)', () => {
  const rows: ShippingReportOrder[] = [
    {
      orderNumber: 10040,
      zoneId: 'tehran',
      zoneName: 'استان تهران',
      partner: { id: 'p-1', name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران' },
      shippingRials: 1_350_000n,
      estWeightGrams: 900,
      parcels: 1,
      fareRials: 1_295_000n,
      taxRials: 129_500n,
      weightGrams: 950,
    },
    {
      orderNumber: 10041,
      zoneId: 'other',
      zoneName: 'بقیهٔ کشور',
      partner: null,
      shippingRials: 1_600_000n,
      estWeightGrams: 1_200,
      parcels: 0,
      fareRials: 0n,
      taxRials: 0n,
      weightGrams: 0,
    },
  ];

  it('کاشی‌ها و جدول‌های صفحه از همان جمع‌ها، حاشیه منفی، و فهرست همهٔ تحویل‌ها با بی کد', () => {
    const report = aggregateReport(rows, [1_000, 3_000], ['tehran', 'other']);
    const doc = shippingDocument({ report, rows, month: { year: 1405, month: 7 }, current: true, bounds: [1_000, 3_000], made: { at: NOW, by: 'الهام فرجی' } });
    expect(doc).toMatchObject({ title: 'گزارش ارسال', fileBase: 'gozaresh-ersal-1405-07', subtitle: 'مهر 1405، تا امروز · به روز «تحویل پست شد» · مبلغ‌ها تومان' });
    expect(doc.notes).toEqual(['1 سفارش تحویل پست‌شدهٔ این ماه هنوز کد رهگیری ندارد و در جمع‌ها نیست.']);
    expect(doc.stats).toEqual([
      { label: 'سفارش با کد رهگیری', value: 1 },
      { label: 'بسته', value: 1 },
      { label: 'مشتری داد (تومان)', value: 135_000 },
      { label: 'پست گرفت (تومان)', value: 142_450 },
      { label: 'حاشیه (تومان)', value: -7_450 },
      { label: 'بی کد رهگیری', value: 1 },
    ]);
    expect(doc.tables[0]!.total).toEqual(['همه', 1, 1, 135_000, 142_450, -7_450, '−5.5٪']);
    expect(doc.tables[2]!.rows).toEqual([
      ['زیر 1 کیلو', 1, 900, 950, '1.06'],
      ['1 تا 3 کیلو', 0, null, null, null],
      ['بالای 3 کیلو', 0, null, null, null],
    ]);
    expect(doc.detail!.rows).toEqual([
      [10040, 'استان تهران', 'چاپخانهٔ جزوه‌یار · تهران', 1, 135_000, 129_500, 12_950, 900, 950],
      [10041, 'بقیهٔ کشور', 'بی چاپخانه', 0, 160_000, null, null, 1_200, null],
    ]);
  });

  it('ماهی که هیچ بسته‌ای ندارد: بی جدول منطقه و چاپخانه، فقط وزن', () => {
    const report = aggregateReport([rows[1]!], [], ['tehran', 'other']);
    const doc = shippingDocument({ report, rows: [rows[1]!], month: { year: 1405, month: 6 }, current: false, bounds: [], made: { at: NOW, by: 'م' } });
    expect(doc.tables.map((t) => t.title)).toEqual(['وزن واقعی در برابر برآورد']);
    expect(doc.subtitle).toBe('شهریور 1405 · به روز «تحویل پست شد» · مبلغ‌ها تومان');
  });
});
