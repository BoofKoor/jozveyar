/**
 * زبانهٔ «ارسال» به زبان صفحه (`shipments.ts`، برش ۶٫۱ و ۶٫۲): برچسب و شمارهای ورود، سطرهای پیش‌نمایش و ثبت‌شده به یک شکل با حال
 * امروزشان، دلیل هر حکم (از چشم چاپخانه هم)، جمع کل با و بی مبلغ، ستون‌های کم، و کارت صف تأیید: معیارها، نامزدها، چرا در صف است،
 * و «در صف چاپ». پیش‌نمایش از همان تفسیر و حکم پایگاه داده ساخته می‌شود (`readPostSheet` و `judgeRows`)، روی جدولی به همان شکل فایل
 * پست واقعی.
 */

import { describe, expect, it } from 'vitest';

import {
  judgedFingerprint,
  judgeRows,
  readPostSheet,
  type CommittedImport,
  type ImportShipment,
  type ReviewRow,
  type ShipmentImportLine,
  type ShipmentOrderFacts,
  type ShipmentPreview,
} from '@jozveyar/db';
import { barcodeOf, parcel, postTable, totalRow } from '@jozveyar/db/postfile.fixtures';

import type { Seg } from './orders';
import {
  barcodeGroups,
  candidatesText,
  committedRows,
  committedTotals,
  countsOf,
  criteriaParts,
  importCounts,
  importMeta,
  missingText,
  numbersText,
  parcelsCount,
  postDaysText,
  previewRows,
  queuedNote,
  reviewMeta,
  reviewWhy,
  rowStateText,
  totalsText,
  unreadableText,
  whyText,
  withoutFares,
} from './shipments';

const NOW = new Date('2026-10-05T07:50:00Z'); // دوشنبه ۱۳ مهر ۱۴۰۵، ۱۱:۲۰ تهران
const SUNDAY = new Date('2026-10-03T20:30:00Z'); // آغاز یکشنبه ۱۲ مهر تهران
const text = (segs: readonly Seg[] | null) =>
  (segs ?? []).map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : s.barcode)).join('');

const order = (number: number, over: Partial<ShipmentOrderFacts> = {}): ShipmentOrderFacts => ({
  id: `o-${number}`,
  orderNumber: number,
  status: 'printing',
  recipientName: 'مهسا طاهری',
  provinceId: 8,
  cityId: 394,
  paidAt: new Date('2026-10-01T07:00:00Z'),
  provinceName: 'تهران',
  cityName: 'تهران',
  handedToPostAt: null,
  postHandoffDueAt: null,
  estWeightGrams: 1_500,
  liveShipments: 0,
  printReady: true,
  hasPartner: true,
  ...over,
});

function preview(rows: string[][], orders: ShipmentOrderFacts[], live: ShipmentPreview['live'] = []): ShipmentPreview {
  const sheet = readPostSheet([postTable(rows)]);
  if (!sheet.ok) throw new Error('sheet');
  const judged = judgeRows(sheet.rows, {
    orders: new Map(orders.map((o) => [o.orderNumber, o])),
    live: new Map(live.map((s) => [s.barcode, { barcode: s.barcode, orderId: s.orderId }])),
    now: NOW,
    candidateRows: new Set(),
  });
  return { sheet, judged, orders, live, fingerprint: judgedFingerprint(judged), candidates: {} };
}

describe('سطرهای فایل با حکم و دلیل', () => {
  it('پیش‌نمایش: هر حکم با دلیل خودش به زبان ادمین، و قطعی «در حال چاپ» با «تحویل پست شد»', () => {
    const rows = [
      parcel(1, barcodeOf(1), 'طاهری 10013', 'تهران', 1560, 1_336_660),
      parcel(2, barcodeOf(2), 'رضایی 10012', 'تهران', 910, 1_295_000),
      parcel(3, barcodeOf(3), 'محمدی 10019', 'تهران', 560, 1_295_000),
      parcel(4, barcodeOf(4), 'قاسمی 10026', 'تهران', 690, 1_295_000),
      parcel(5, barcodeOf(5), 'طهماسبی 6103', 'مشهد', 1050, 1_618_120),
      parcel(6, barcodeOf(6), 'احمدی', 'تهران', 1850, 1_336_660),
      parcel(7, barcodeOf(1), 'طاهری 10013', 'تهران', 1560, 1_336_660),
      parcel(8, '1.18832198006261E+23', 'کریمی 10027', 'تهران', 700, 1_295_000),
      parcel(9, barcodeOf(9), 'کریمی 10027', 'تهران', 700, 1_295_000, { status: 'باطل' }),
      parcel(10, barcodeOf(10), 'مرادی 10008', 'تهران', 1980, 1_336_660),
    ];
    const orders = [
      order(10013),
      order(10012, { recipientName: 'علی کریمی' }),
      order(10019, { status: 'paid', recipientName: 'زهرا محمدی' }),
      order(10026, { status: 'cancelled', recipientName: 'امین قاسمی' }),
      order(10008, { status: 'handed_to_post', recipientName: 'بهاره مرادی' }),
    ];
    const live = [
      { barcode: barcodeOf(10), orderId: 'o-10008', orderNumber: 10008, importId: 'i-1', filename: 'FileName-1968.xls', createdAt: SUNDAY, voidedAt: null },
    ];
    const view = previewRows(preview(rows, orders, live));
    expect(view.map((row) => [row.rowNo, row.verdict, row.reason])).toEqual([
      [1, 'matched', null],
      [2, 'review', 'name_mismatch'],
      [3, 'review', 'queued'],
      [4, 'review', 'cancelled'],
      [5, 'unmatched', 'manual_code'],
      [6, 'unmatched', 'no_number'],
      [7, 'duplicate', 'same_file'],
      [8, 'invalid', 'barcode'],
      [9, 'inactive', 'inactive'],
      [10, 'duplicate', 'already'],
    ]);
    const why = view.map((row) => text(whyText(row, { committed: false })));
    expect(why).toEqual([
      '«در حال چاپ» است؛ با «ثبت» «تحویل پست شد» می‌شود، با روز فایل.',
      'سفارش 10012 مال «علی کریمی» است؛ نام نمی‌خواند.',
      'سفارش 10019 (زهرا محمدی، تهران) هنوز «در صف چاپ» است؛ تأیید، «شروع چاپ» و «تحویل پست شد» را با هم می‌زند.',
      'سفارش 10026 (امین قاسمی، تهران) لغو شده؛ کد رهگیری به سفارش لغوشده نمی‌نشیند.',
      '6103 شمارهٔ سفارش سایت نیست (سفارش‌های سایت از 10001)؛ شاید سفارش دستی.',
      '«نام گ» شماره ندارد.',
      'همین کد در سطر 1 همین فایل هم آمده.',
      'کد رهگیری «1.18832198006261E+23» خوانده نشد: کد پست دقیقاً 24 رقم است؛ فایلی که در Excel ذخیره شده کد را گرد و خراب می‌کند.',
      'وضعیتش در فایل «باطل» است، نه «فعال».',
      'همین کد یکشنبه 12 مهر با FileName-1968.xls برای همین سفارش (10008، بهاره مرادی) آمد؛ دوباره ثبت نمی‌شود.',
    ]);
    expect(view[0]).toMatchObject({ surname: 'طاهری', orderNumber: 10013, destination: 'تهران', handOver: true, barcode: barcodeOf(1) });
    expect(view[7]).toMatchObject({ barcode: null, barcodeText: '1.18832198006261E+23' });
    expect(countsOf(view)).toEqual({ matched: 1, review: 3, unmatched: 2, duplicate: 2, invalid: 1, inactive: 1 });
  });

  it('سطر ثبت‌شده همان شکل را دارد؛ «تحویل پست شد» با روز فایل، کد کنارگذاشته، و متن پاک‌شده پس از روزهای نگهداری', () => {
    const committed: CommittedImport = {
      rows: [
        row({ rowNo: 1, verdict: 'matched', orderId: 'o-10013', nameG: 'طاهری 10013', orderNumber: 10013, barcode: barcodeOf(1) }),
        row({ rowNo: 2, verdict: 'unmatched', reason: 'not_found', orderNumber: 10099, barcode: barcodeOf(2), cells: null, nameG: null, destination: null }),
        row({ rowNo: 3, verdict: 'total', weightGrams: 2_000, fareRials: 2_000, taxRials: 200, barcode: null }),
      ],
      orders: [order(10013, { status: 'handed_to_post' })],
      shipments: [shipment({ id: 's1', rowNo: 1, orderId: 'o-10013', orderNumber: 10013, voidedAt: NOW, voidReason: 'فایل روز اشتباه بود' })],
      elsewhere: [],
      candidates: {},
    };
    const view = committedRows(committed);
    expect(view).toHaveLength(2);
    expect(text(whyText(view[0]!, { committed: true }))).toBe('در حال چاپ ← تحویل پست شد، یکشنبه 12 مهر');
    expect(view[0]).toMatchObject({ shipment: null, handOver: true, handedAny: true });
    expect(view[0]!.voided.map((s) => s.voidReason)).toEqual(['فایل روز اشتباه بود']);
    expect(view[1]).toMatchObject({ purged: true, surname: '', destination: '' });
    expect(text(whyText(view[1]!, { committed: true }))).toBe('سفارش 10099 پیدا نشد.');
    const { sums, file } = committedTotals(committed);
    expect(sums).toEqual({ parcels: 2, weightGrams: 1_000 + 1_000, fareRials: 1_000 + 1_000, taxRials: 100 + 100 });
    expect(totalsText(sums, file).agree).toBe(true);
  });
});

/** کد رهگیری یک سطر، قطعی و زنده، با پیش‌فرض‌ها. */
function shipment(over: Partial<ImportShipment>): ImportShipment {
  return {
    id: 's',
    rowNo: 1,
    orderId: 'o-10013',
    orderNumber: 10013,
    barcode: barcodeOf(1),
    handedOrder: true,
    matchedBy: 'rule',
    adminName: 'علی محمدی',
    createdAt: NOW,
    voidedAt: null,
    voidedByName: null,
    voidReason: null,
    ...over,
  };
}

/** سطر ثبت‌شده، با پیش‌فرض‌های یک بستهٔ ۱ کیلویی. */
function row(over: Partial<CommittedImport['rows'][number]>): CommittedImport['rows'][number] {
  return {
    dismissedAt: null,
    dismissedBy: null,
    dismissedByName: null,
    queued: false,
    importId: 'i-1',
    rowNo: 1,
    cells: ['x'],
    barcode: null,
    orderNumber: null,
    nameG: 'کریمی',
    destination: 'تهران',
    weightGrams: 1_000,
    fareRials: 1_000,
    taxRials: 100,
    postDay: SUNDAY,
    postStatus: 'فعال',
    verdict: 'unmatched',
    reason: null,
    orderId: null,
    ...over,
  };
}

describe('ورودها، جمع کل و فایلی که خوانده نشد', () => {
  const line = (over: Partial<ShipmentImportLine>): ShipmentImportLine => ({
    id: 'i-1',
    carrier: 'iran_post',
    filename: 'FileName-1981.xls',
    sizeBytes: 16_000,
    status: 'committed',
    format: 'html',
    errorCode: null,
    partner: null,
    createdAt: new Date('2026-10-05T07:35:00Z'),
    createdByName: 'سارا',
    readAt: null,
    committedAt: null,
    committedByName: null,
    discardedAt: null,
    discardedByName: null,
    revertedAt: null,
    revertedByName: null,
    revertReason: null,
    purgedAt: null,
    job: null,
    counts: { matched: 9, review: 4, unmatched: 1, duplicate: 1, total: 1 },
    liveShipments: 9,
    voidedShipments: 0,
    handedOrders: 2,
    firstPostDay: SUNDAY,
    lastPostDay: SUNDAY,
    queuedRows: 4,
    dismissedRows: 0,
    unmatchedRows: 1,
    ...over,
  });

  it('هر ورود در فهرست: کی، کی آورد، روز فایل، و شمار حکم‌ها (طرح)', () => {
    expect(text(importMeta(line({}), NOW))).toBe('امروز 11:05 · سارا · روز فایل یکشنبه 12 مهر');
    expect(text(importCounts(line({})))).toBe('15 بسته: 9 کد رهگیری · 4 در صف تأیید · 1 پیدا نشد · 1 تکراری');
    const reverted = line({
      status: 'reverted',
      liveShipments: 0,
      voidedShipments: 6,
      counts: { matched: 6 },
      revertedAt: new Date('2026-10-05T14:00:00Z'),
      revertedByName: 'سارا',
      revertReason: 'نسخهٔ ناقص فایل بود؛ کاملش وارد شد.',
      createdAt: new Date('2026-10-05T13:50:00Z'),
    });
    expect(text(importMeta(reverted, NOW))).toBe('امروز 17:20 · سارا · روز فایل یکشنبه 12 مهر · برگشت 17:30 با سارا: «نسخهٔ ناقص فایل بود؛ کاملش وارد شد.»');
    expect(text(importCounts(reverted))).toBe('6 بسته: 6 کد رهگیری کنار رفت');
    expect(text(importCounts(line({ status: 'read' })))).toBe('پیش‌نمایش؛ هنوز ثبت نشده.');
    expect(text(importCounts(line({ status: 'discarded', discardedByName: null })))).toBe('چون ثبت نشد، پس از روزهای نگهداری دور انداخته شد.');
    expect(text(importMeta(line({ partner: { id: 'p', name: 'چاپ نور' }, createdByName: 'حسن' }), NOW))).toContain('حسن، چاپ نور');
  });

  it('جمع کل: می‌خواند، نمی‌خواند (هشدار با هر دو)، یا فایل ردیف جمع ندارد', () => {
    const rows = [parcel(1, barcodeOf(1), 'طاهری 10013', 'تهران', 820, 1_295_000), parcel(2, barcodeOf(2), 'شریفی 10006', 'کرج', 1240, 1_618_120)];
    const sheet = readPostSheet([postTable(rows)]);
    if (!sheet.ok) throw new Error('sheet');
    expect(text(totalsText(sheet.sums, sheet.fileTotal).text)).toBe(
      'جمع کل فایل با جمع سطرها می‌خواند: 2 بسته، 2.1 کیلوگرم، کرایه 291,312 و مالیات 29,131 تومان.',
    );
    const short = readPostSheet([[...postTable(rows, false), totalRow(rows.slice(0, 1))]]);
    if (!short.ok) throw new Error('sheet');
    const mismatch = totalsText(short.sums, short.fileTotal);
    expect(mismatch.agree).toBe(false);
    expect(text(mismatch.text)).toContain('«جمع کل» فایل با جمع سطرها نمی‌خواند');
    expect(totalsText(sheet.sums, null)).toMatchObject({ agree: null });
  });

  it('فایلی که خوانده نشد: پیام هر کد با راه جلو، و ستون‌هایی که نیستند', () => {
    expect(unreadableText('xls_binary')).toContain('همان فایلی را بده که از پست گرفتی');
    expect(unreadableText('read_failed')).toContain('یک بار دیگر بارگذاری‌اش کن');
    expect(unreadableText('something_else')).toBe('این فایل خوانده نشد. همان فایلی را بده که از پست گرفتی.');
    expect(missingText(['barcode'])).toBe('ستون «بارکد» در این فایل نیست، پس کد رهگیری ندارد.');
    expect(missingText(['weight', 'fare'])).toBe('ستون‌های «وزن» و «کرایه پستی» در این فایل نیستند.');
  });

  it('کد رهگیری در شش گروه چهارتایی، شمار بسته، روزها و شماره‌ها', () => {
    expect(barcodeGroups('118800000000000000000101')).toEqual(['1188', '0000', '0000', '0000', '0000', '0101']);
    expect(parcelsCount(1)).toBe('یک بسته');
    expect(parcelsCount(7)).toBe('7 بسته');
    expect(postDaysText(SUNDAY, new Date(SUNDAY.getTime() + 86_400_000))).toBe('یکشنبه 12 مهر تا دوشنبه 13 مهر');
    expect(text(numbersText([10013, 10017, 10021]))).toBe('10013، 10017 و 10021');
  });
});

describe('حال امروز سطرهای ثبت‌شده و ورودها (۶٫۲)', () => {
  it('کد با تأیید یا دستی با سفارش خودش، کدهای کنارگذاشته، «هیچ‌کدام»، صف با نامزدها؛ «ثبت» فقط کد قطعی را «تحویل پست» می‌شمارد', () => {
    const committed: CommittedImport = {
      rows: [
        row({ rowNo: 1, verdict: 'review', reason: 'name_mismatch', orderId: 'o-10012', orderNumber: 10012, barcode: barcodeOf(1) }),
        row({ rowNo: 2, verdict: 'unmatched', reason: 'no_number', barcode: barcodeOf(2) }),
        row({ rowNo: 3, verdict: 'review', reason: 'no_number', barcode: barcodeOf(3), dismissedAt: NOW, dismissedBy: 'u', dismissedByName: 'علی محمدی' }),
        row({ rowNo: 4, verdict: 'matched', orderId: 'o-10013', orderNumber: 10013, barcode: barcodeOf(4), queued: true }),
      ],
      orders: [order(10012, { recipientName: 'علی کریمی' }), order(10014, { recipientName: 'سارا رضایی', status: 'handed_to_post' }), order(10013)],
      shipments: [
        shipment({ id: 'a', rowNo: 1, orderId: 'o-10014', orderNumber: 10014, matchedBy: 'review', barcode: barcodeOf(1) }),
        shipment({ id: 'b', rowNo: 2, orderId: 'o-10014', orderNumber: 10014, matchedBy: 'manual', handedOrder: false, barcode: barcodeOf(2) }),
        shipment({ id: 'c', rowNo: 4, orderNumber: 10013, barcode: barcodeOf(4), voidedAt: NOW, voidedByName: 'سارا رضایی', voidReason: 'اشتباه' }),
      ],
      elsewhere: [],
      candidates: { 4: { candidates: [], preselected: null } },
    };
    const view = committedRows(committed);
    expect(view.map((r) => [r.rowNo, r.shipment?.id ?? null, r.shipmentOrder?.orderNumber ?? null, r.queued, r.dismissed?.byName ?? null, r.voided.length, r.handOver, r.handedAny])).toEqual([
      [1, 'a', 10014, false, null, 0, false, true],
      [2, 'b', 10014, false, null, 0, false, false],
      [3, null, null, false, 'علی محمدی', 0, false, false],
      [4, null, null, true, null, 1, true, true],
    ]);
    expect(view[3]!.candidates).toEqual({ candidates: [], preselected: null });
    expect(view[0]!.candidates).toBeNull();
  });

  it('هر ورود ثبت‌شده با حال امروز سطرها؛ چاپخانه صف را «در انتظار بررسی جزوه‌یار» می‌بیند', () => {
    const line: ShipmentImportLine = {
      id: 'i-1',
      carrier: 'iran_post',
      filename: 'FileName-1981.xls',
      sizeBytes: 16_000,
      status: 'committed',
      format: 'html',
      errorCode: null,
      partner: null,
      createdAt: NOW,
      createdByName: 'سارا',
      readAt: null,
      committedAt: null,
      committedByName: null,
      discardedAt: null,
      discardedByName: null,
      revertedAt: null,
      revertedByName: null,
      revertReason: null,
      purgedAt: null,
      job: null,
      counts: { matched: 9, review: 4, unmatched: 1, duplicate: 1 },
      liveShipments: 11,
      voidedShipments: 1,
      handedOrders: 3,
      firstPostDay: SUNDAY,
      lastPostDay: SUNDAY,
      queuedRows: 2,
      dismissedRows: 1,
      unmatchedRows: 0,
    };
    expect(text(importCounts(line))).toBe('15 بسته: 11 کد رهگیری · 2 در صف تأیید · 1 کنار گذاشته · 1 تکراری');
    expect(text(importCounts(line, { partner: true }))).toBe('15 بسته: 11 کد رهگیری · 2 در انتظار بررسی جزوه‌یار · 1 کنار گذاشته · 1 تکراری');
  });

  it('دلیل از چشم چاپخانه: نامی که نمی‌خواند، «در صف چاپ»، و شمارهٔ دستی', () => {
    const rows = [
      parcel(1, barcodeOf(1), 'اکبری 10025', 'مشهد', 450, 1_295_000),
      parcel(2, barcodeOf(2), 'محمدی 10019', 'مشهد', 560, 1_295_000),
      parcel(3, barcodeOf(3), 'نیک‌نام 1204', 'مشهد', 2200, 1_295_000),
    ];
    const orders = [order(10025, { recipientName: 'رضا توکلی', provinceId: 11, cityId: 1326, cityName: 'مشهد' }), order(10019, { status: 'paid', recipientName: 'زهرا محمدی', provinceId: 11, cityId: 1326, cityName: 'مشهد' })];
    const view = previewRows(preview(rows, orders));
    expect(view.map((r) => text(whyText(r, { committed: true, partner: true })))).toEqual([
      'سفارش 10025 مال «رضا توکلی» است؛ نام نمی‌خواند. اگر بستهٔ مشتری دیگر خودت است، جزوه‌یار کنارش می‌گذارد.',
      'سفارش 10019 (زهرا محمدی، مشهد) هنوز «در صف چاپ» است؛ جزوه‌یار بررسی می‌کند.',
      '1204 شمارهٔ سفارش جزوه‌یار نیست؛ این بسته ثبت نمی‌شود.',
    ]);
  });

  it('بی مبلغ: پیش‌نمایش و ورود ثبت‌شده بی کرایه، مالیات و خانه‌های خام؛ جمع فقط بسته و وزن', () => {
    const rows = [parcel(1, barcodeOf(1), 'طاهری 10013', 'تهران', 820, 1_295_000), parcel(2, barcodeOf(2), 'شریفی 10006', 'کرج', 1240, 1_618_120)];
    const seen = withoutFares({ kind: 'preview', import: {} as never, preview: preview(rows, []) });
    if (seen.kind !== 'preview' || !seen.preview.sheet.ok) throw new Error('preview');
    const { sheet } = seen.preview;
    expect(sheet.rows.map((r) => [r.fareRials, r.taxRials, r.totalRials, r.cells, r.costMismatch])).toEqual([
      [null, null, null, [], false],
      [null, null, null, [], false],
    ]);
    expect(text(totalsText(sheet.sums, sheet.fileTotal, { money: false }).text)).toBe('جمع کل فایل با جمع سطرها می‌خواند: 2 بسته، 2.1 کیلوگرم.');
    const committed = withoutFares({
      kind: 'committed',
      import: {} as never,
      committed: { rows: [row({ rowNo: 1 })], orders: [], shipments: [], elsewhere: [], candidates: {} },
    });
    expect(committed.kind === 'committed' && committed.committed.rows.map((r) => [r.fareRials, r.taxRials, r.cells])).toEqual([[null, null, null]]);
  });
});

describe('کارت صف تأیید (۶٫۲، طرح `m-ship-review`)', () => {
  const card = (over: Partial<ReviewRow> = {}): ReviewRow => ({
    import: { id: 'i-1', filename: 'FileName-1977.xls', status: 'committed', createdAt: SUNDAY, createdByName: 'حسن', committedAt: new Date('2026-10-04T14:40:00Z'), partner: { id: 'p', name: 'چاپ نور' } },
    row: { ...row({ rowNo: 3, verdict: 'review', reason: 'name_mismatch', orderNumber: 10025, nameG: 'اکبری 10025', destination: 'مشهد', barcode: barcodeOf(3) }), dismissedByName: null },
    shipments: [],
    queued: true,
    assignable: true,
    elsewhere: null,
    numbered: order(10025, { recipientName: 'رضا توکلی', cityName: 'مشهد' }),
    candidates: { candidates: [], preselected: null },
    ...over,
  });

  it('سر کارت و چرا: فایل، سطر و کسی که آورد؛ فایل چاپخانه با نامی که نمی‌خواند (طرح)', () => {
    expect(text(reviewMeta(card(), NOW))).toBe('FileName-1977.xls، سطر 3 · حسن، چاپ نور، دیروز 18:10');
    expect(text(reviewWhy(card(), NOW))).toBe(
      'سفارش 10025 مال «رضا توکلی» است؛ نام نمی‌خواند. فایل از چاپ نور است و شاید بستهٔ مشتری دیگر خود چاپخانه باشد که شماره‌اش مثل سفارش ماست.',
    );
    const staff = card({ import: { ...card().import, partner: null }, numbered: order(10012, { recipientName: 'علی کریمی', liveShipments: 1 }) });
    expect(text(reviewWhy(staff, NOW))).toBe('سفارش 10012 مال «علی کریمی» است و کد رهگیری دارد؛ نام نمی‌خواند.');
    const back = card({
      row: { ...card().row, verdict: 'matched', reason: null },
      shipments: [shipment({ rowNo: 3, orderNumber: 10013, voidedAt: NOW, voidedByName: 'سارا رضایی', voidReason: 'کد مال سفارش دیگری بود' })],
    });
    expect(text(reviewWhy(back, NOW))).toBe('کد این سطر برای سفارش 10013 کنار رفت امروز 11:20 با سارا رضایی: «کد مال سفارش دیگری بود»؛ دوباره تصمیم می‌خواهد.');
    const elsewhere = card({ row: { ...card().row, reason: 'barcode_elsewhere' }, elsewhere: { barcode: barcodeOf(3), orderId: 'o', orderNumber: 10005, importId: 'i-0', filename: 'x', createdAt: SUNDAY, voidedAt: null } });
    expect(text(reviewWhy(elsewhere, NOW))).toContain('همین کد رهگیری برای سفارش 10005 زنده است');
    expect(text(reviewWhy(card({ row: { ...card().row, reason: 'no_number', orderNumber: null } , numbered: null }), NOW))).toBe('«نام گ» شماره ندارد.');
    expect(text(reviewWhy(card({ row: { ...card().row, reason: 'queued' } }), NOW))).toBe('سفارش 10025 هنوز «در صف چاپ» است.');
    expect(text(reviewWhy(card({ row: { ...card().row, reason: 'cancelled' } }), NOW))).toContain('اول مالک لغو را برگرداند؛ وگرنه «هیچ‌کدام»');
  });

  it('معیارها کنار نامزد: می‌خواند و نمی‌خواند به ترتیب طرح، وزن با برآورد، روز با روز تحویل، و «شاید اشتباه تایپی»', () => {
    const handed = order(10014, { recipientName: 'سارا رضایی', estWeightGrams: 870, handedToPostAt: SUNDAY });
    const parts = criteriaParts({ number: 'no', surname: 'yes', city: 'yes', weight: 'yes', day: 'yes' }, handed);
    expect(parts.yes.map(text)).toEqual(['نام خانوادگی', 'شهر', 'وزن (برآورد 870 گرم)', 'روز (تحویل پست یکشنبه 12 مهر)']);
    expect(parts.no.map(text)).toEqual(['شماره؛ شاید اشتباه تایپی']);
    const other = criteriaParts({ number: 'yes', surname: 'no', city: null, weight: 'no', day: null }, order(10025, { estWeightGrams: 1_300 }));
    expect([other.yes.map(text), other.no.map(text)]).toEqual([['شماره'], ['نام خانوادگی', 'وزن (برآورد 1.3 کیلوگرم)']]);
  });

  it('نامزدها در صفحهٔ ورود؛ «در صف چاپ» با مهلت؛ حال سطری که در صف نیست', () => {
    const one = { candidates: [{ order: order(10014, { recipientName: 'سارا رضایی' }) }], preselected: null } as never;
    expect(text(candidatesText(one))).toBe('نامزد: 10014، سارا رضایی، تهران.');
    const two = { candidates: [{ order: order(10016, { recipientName: 'رضا احمدی' }) }, { order: order(10009, { recipientName: 'نرگس احمدی', cityName: 'کرج' }) }], preselected: null } as never;
    expect(text(candidatesText(two))).toBe('نامزدها: 10016، رضا احمدی، تهران؛ 10009، نرگس احمدی، کرج.');
    expect(text(candidatesText({ candidates: [], preselected: null }))).toBe('نامزدی پیدا نشد.');

    const due = new Date('2026-10-05T20:30:00Z');
    expect(text(queuedNote(order(10019, { status: 'paid', postHandoffDueAt: due }), SUNDAY, NOW))).toBe(
      'تأیید، «شروع چاپ» و «تحویل پست شد» را با هم می‌زند، با روز فایل: یکشنبه 12 مهر، یعنی در مهلت. فایل چاپ و چاپخانه‌اش آماده‌اند.',
    );
    expect(text(queuedNote(order(10019, { status: 'paid', postHandoffDueAt: SUNDAY }), SUNDAY, NOW))).toContain('یعنی دیرتر از مهلت.');
    expect(queuedNote(order(10019), SUNDAY, NOW)).toBeNull();

    expect(text(rowStateText(card({ shipments: [shipment({ rowNo: 3, orderNumber: 10014, matchedBy: 'manual' })], queued: false }), NOW))).toBe(
      'کد این سطر به سفارش 10014 نشسته است (دستی، علی محمدی، امروز 11:20).',
    );
    expect(text(rowStateText(card({ queued: false, row: { ...card().row, dismissedAt: NOW, dismissedByName: 'علی محمدی' } }), NOW))).toBe(
      '«هیچ‌کدام» خورد، علی محمدی، امروز 11:20. اگر اشتباه بود، به سفارش درستش بده.',
    );
    expect(text(rowStateText(card({ queued: false, import: { ...card().import, status: 'reverted' } }), NOW))).toContain('ورود این سطر برگشته است');
    expect(text(rowStateText(card({ queued: false, row: { ...card().row, verdict: 'unmatched', reason: 'manual_code', orderNumber: 6103 } }), NOW))).toBe(
      '6103 شمارهٔ سفارش سایت نیست؛ اگر بسته مال سفارشی از ماست، به همان بده.',
    );
    expect(text(rowStateText(card({ queued: false, row: { ...card().row, verdict: 'duplicate', reason: 'same_file' } }), NOW))).toContain('«تکراری»');
  });
});
