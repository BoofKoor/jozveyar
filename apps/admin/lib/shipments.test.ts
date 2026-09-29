/**
 * زبانهٔ «ارسال» به زبان صفحه (`shipments.ts`، برش ۶٫۱): برچسب و شمارهای ورود، سطرهای پیش‌نمایش و ثبت‌شده به یک شکل، دلیل هر
 * حکم، جمع کل، و ستون‌های کم. پیش‌نمایش از همان تفسیر و حکم پایگاه داده ساخته می‌شود (`readPostSheet` و `judgeRows`)، روی جدولی
 * به همان شکل فایل پست واقعی.
 */

import { describe, expect, it } from 'vitest';

import {
  judgedFingerprint,
  judgeRows,
  readPostSheet,
  type CommittedImport,
  type ShipmentImportLine,
  type ShipmentOrderFacts,
  type ShipmentPreview,
} from '@jozveyar/db';
import { barcodeOf, parcel, postTable, totalRow } from '@jozveyar/db/postfile.fixtures';

import type { Seg } from './orders';
import {
  barcodeGroups,
  committedRows,
  committedTotals,
  countsOf,
  importCounts,
  importMeta,
  missingText,
  numbersText,
  parcelsCount,
  postDaysText,
  previewRows,
  totalsText,
  unreadableText,
  whyText,
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
  estWeightGrams: 1_500,
  ...over,
});

function preview(rows: string[][], orders: ShipmentOrderFacts[], live: ShipmentPreview['live'] = []): ShipmentPreview {
  const sheet = readPostSheet([postTable(rows)]);
  if (!sheet.ok) throw new Error('sheet');
  const judged = judgeRows(sheet.rows, {
    orders: new Map(orders.map((o) => [o.orderNumber, o])),
    live: new Map(live.map((s) => [s.barcode, { barcode: s.barcode, orderId: s.orderId }])),
    now: NOW,
  });
  return { sheet, judged, orders, live, fingerprint: judgedFingerprint(judged) };
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
      'سفارش 10019 (زهرا محمدی، تهران) هنوز «در صف چاپ» است؛ کد رهگیری با تأیید مالک یا متصدی می‌نشیند.',
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
      shipments: [{ id: 's1', rowNo: 1, orderId: 'o-10013', barcode: barcodeOf(1), handedOrder: true, voidedAt: NOW, voidReason: 'فایل روز اشتباه بود' }],
      elsewhere: [],
    };
    const view = committedRows(committed);
    expect(view).toHaveLength(2);
    expect(text(whyText(view[0]!, { committed: true }))).toBe('در حال چاپ ← تحویل پست شد، یکشنبه 12 مهر');
    expect(view[0]!.shipment?.voidReason).toBe('فایل روز اشتباه بود');
    expect(view[1]).toMatchObject({ purged: true, surname: '', destination: '' });
    expect(text(whyText(view[1]!, { committed: true }))).toBe('سفارش 10099 پیدا نشد.');
    const { sums, file } = committedTotals(committed);
    expect(sums).toEqual({ parcels: 2, weightGrams: 1_000 + 1_000, fareRials: 1_000 + 1_000, taxRials: 100 + 100 });
    expect(totalsText(sums, file).agree).toBe(true);
  });
});

/** سطر ثبت‌شده، با پیش‌فرض‌های یک بستهٔ ۱ کیلویی. */
function row(over: Partial<CommittedImport['rows'][number]>): CommittedImport['rows'][number] {
  return {
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
