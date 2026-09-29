import { extractOrderCodeFromRecipient } from '@jozveyar/text';
import { describe, expect, it } from 'vitest';
import { POST_HEADERS, barcodeOf, parcel, postTable, totalRow } from './postfile.fixtures.js';
import {
  IRAN_POST,
  type OrderFacts,
  type PostRow,
  destinationFits,
  handedAtOf,
  judgeRows,
  judgedFingerprint,
  nameFits,
  readPostSheet,
  totalsAgree,
} from './postfile.js';

// جدول ساختگی به همان شکل فایل پست واقعی (سؤال ۵۹)؛ مشترک با تست یکپارچگی.
const HEADERS = POST_HEADERS;
const table = postTable;
const BC = barcodeOf;

function sheetRows(rows: string[][]): PostRow[] {
  const sheet = readPostSheet([table(rows)]);
  if (!sheet.ok) throw new Error('sheet');
  return sheet.rows;
}

describe('خواندن جدول فایل پست (برش ۶٫۱)', () => {
  it('همان شکل فایل واقعی: سرستون با فاصلهٔ ته، بارکد با فاصلهٔ نشکن، «جمع کل» بیرون و جمعش می‌خواند', () => {
    const rows = [
      parcel(1, BC(1), 'رحمانی 10005', 'تهران', 820, 1_295_000),
      parcel(2, BC(2), 'بیک زاده 6098', 'مشهد', 1980, 1_618_125),
    ];
    const sheet = readPostSheet([table(rows)]);
    expect(sheet.ok).toBe(true);
    if (!sheet.ok) return;
    expect(sheet.headerRow).toBe(0);
    expect(sheet.rows.map((r) => [r.rowNo, r.barcode, r.orderNumber, r.surname, r.weightGrams, r.fareRials, r.taxRials])).toEqual([
      [1, BC(1), 10005, 'رحمانی', 820, 1_295_000, 129_500],
      [2, BC(2), 6098, 'بیک زاده', 1980, 1_618_125, 161_813],
    ]);
    expect(sheet.rows.every((r) => r.problem === null && !r.costMismatch)).toBe(true);
    expect(sheet.fileTotal?.rowNo).toBe(3);
    expect(totalsAgree(sheet)).toBe(true);
  });

  it('فایل windows-1256: «باركد»، «كرايه پستي» و «بيك زاده» با «ي» و «ك» عربی', () => {
    const arabic = (s: string) => s.replace(/ی/g, 'ي').replace(/ک/g, 'ك');
    const rows = [parcel(1, BC(1), arabic('بیک زاده 10006'), arabic('کرج'), 1240, 1_618_120)];
    const sheet = readPostSheet([[HEADERS.map(arabic), ...rows.map((r) => r.map(arabic))]]);
    expect(sheet.ok && sheet.rows[0]).toMatchObject({ orderNumber: 10006, surname: 'بیک زاده', destination: 'کرج', postStatus: 'فعال' });
  });

  it('ستون لازم که نیست: «خوانده نشد» با نام همان ستون؛ جدول‌های دیگر و سطرهای بالای سرستون هم گشته می‌شوند', () => {
    const noBarcode = table([parcel(1, BC(1), 'رحمانی 10005', 'تهران', 820, 1_295_000)]).map((r) => r.filter((_, i) => i !== 2));
    expect(readPostSheet([noBarcode])).toEqual({ ok: false, code: 'missing_column', missing: ['barcode'] });
    // شاهد: همان جدول کامل، بعد از یک جدول بی‌ربط و دو سطر عنوان، پیدا می‌شود.
    const titled = [['گزارش مرسولات'], [''], ...table([parcel(1, BC(1), 'رحمانی 10005', 'تهران', 820, 1_295_000)])];
    const found = readPostSheet([[['x', 'y']], titled]);
    expect(found.ok && found.headerRow).toBe(2);
  });

  it('کد سفارش فقط از «نام گ»: نامی بی شماره شماره ندارد، هرچند وزنش عدد ۴ رقمی است', () => {
    const [row] = sheetRows([parcel(1, BC(1), 'احمدی', 'تهران', 1980, 1_336_660)]);
    expect(row!.orderNumber).toBeNull();
    // شاهد: جست‌وجو در همهٔ ستون‌ها وزن را کد می‌گرفت (ADR-010).
    expect(extractOrderCodeFromRecipient(row!.cells[14]!)).toBe(1980);
  });

  it('بارکد فقط رشتهٔ دقیقاً ۲۴ رقمی: عدد علمی، ۲۳ رقم و اعشار «خوانده نشد»؛ ارقام فارسی پذیرفته', () => {
    const rows = sheetRows([
      parcel(1, '1.18832198006261E+23', 'رحمانی 10005', 'تهران', 820, 1_295_000),
      parcel(2, BC(2).slice(1), 'رحمانی 10005', 'تهران', 820, 1_295_000),
      parcel(3, `${BC(3)}.0`, 'رحمانی 10005', 'تهران', 820, 1_295_000),
      parcel(4, '۱۱۸۸۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۴', 'رحمانی 10005', 'تهران', 820, 1_295_000),
    ]);
    expect(rows.map((r) => [r.barcode, r.problem])).toEqual([[null, 'barcode'], [null, 'barcode'], [null, 'barcode'], [BC(4), null]]);
  });

  it('«جمع کل» ناهمخوان: هشدار با جمع هر دو؛ فایل بی ردیف جمع null', () => {
    const rows = [parcel(1, BC(1), 'رحمانی 10005', 'تهران', 820, 1_295_000), parcel(2, BC(2), 'شریفی 10006', 'کرج', 1240, 1_618_120)];
    const short = [HEADERS, ...rows, totalRow(rows.slice(0, 1))];
    const sheet = readPostSheet([short]);
    expect(sheet.ok && totalsAgree(sheet)).toBe(false);
    const bare = readPostSheet([table(rows, false)]);
    expect(bare.ok && totalsAgree(bare)).toBeNull();
  });

  it('تاریخ هر سطر، وضعیت «فعال» و هزینهٔ کل (سؤال‌های ۷۰ تا ۷۲)', () => {
    const rows = sheetRows([
      parcel(1, BC(1), 'رحمانی 10005', 'تهران', 820, 1_295_000, { date: '1405/06/22' }),
      parcel(2, BC(2), 'رحمانی 10005', 'تهران', 820, 1_295_000, { date: '1405/07/31' }),
      parcel(3, BC(3), 'رحمانی 10005', 'تهران', 820, 1_295_000, { status: 'باطل' }),
      parcel(4, BC(4), 'رحمانی 10005', 'تهران', 820, 1_295_000, { total: '1424501' }),
      parcel(5, BC(5), 'رحمانی 10005', 'تهران', 0, 1_295_000),
      // وزنی که در `integer` پستگرس نمی‌نشیند «خوانده نشد» است، نه خطای «ثبت»؛ شاهد: یک گرم کمتر خوانده می‌شود.
      parcel(6, BC(6), 'رحمانی 10005', 'تهران', 2_147_483_648, 1_295_000),
      parcel(7, BC(7), 'رحمانی 10005', 'تهران', 2_147_483_647, 1_295_000),
    ]);
    expect(rows[0]!.postDay?.toISOString()).toBe('2026-09-12T20:30:00.000Z');
    expect(rows.map((r) => r.problem)).toEqual([null, 'date', 'inactive', null, 'numbers', 'numbers', null]);
    expect(rows.map((r) => r.costMismatch)).toEqual([false, false, false, true, false, false, false]);
  });
});

describe('حکم هر سطر (ADR-046)', () => {
  const now = new Date('2026-10-05T07:50:00Z'); // دوشنبه ۱۳ مهر ۱۴۰۵، ۱۱:۲۰ تهران
  const paid = new Date('2026-10-01T07:00:00Z'); // پنجشنبه ۹ مهر
  const TEHRAN = { provinceId: 8, cityId: 394 };
  const order = (number: number, over: Partial<OrderFacts> = {}): OrderFacts => ({
    id: `o-${number}`,
    orderNumber: number,
    status: 'printing',
    recipientName: 'مهسا طاهری',
    ...TEHRAN,
    paidAt: paid,
    ...over,
  });
  const judge = (rows: string[][], orders: OrderFacts[], live: [string, string | null][] = [], candidateRows: number[] = []) =>
    judgeRows(sheetRows(rows), {
      orders: new Map(orders.map((o) => [o.orderNumber, o])),
      live: new Map(live.map(([barcode, orderId]) => [barcode, { barcode, orderId }])),
      now,
      candidateRows: new Set(candidateRows),
    }).map((j) => [j.verdict, j.reason, j.orderId, j.handOver]);
  const row = (name: string, over: Parameters<typeof parcel>[6] = {}, destination = 'تهران', barcode = BC(1)) =>
    parcel(1, barcode, name, destination, 1560, 1_336_660, over);

  it('قطعی: «در حال چاپ» با «ثبت» تحویل پست می‌شود؛ «تحویل پست شد» همان می‌ماند', () => {
    expect(judge([row('طاهری 10013')], [order(10013)])).toEqual([['matched', null, 'o-10013', true]]);
    expect(judge([row('طاهری 10013')], [order(10013, { status: 'handed_to_post' })])).toEqual([['matched', null, 'o-10013', false]]);
  });

  it('نام: درون نام گیرنده، بی حساسیت به فاصله و نیم‌فاصله؛ نام دیگر صف تأیید', () => {
    const bik = order(10006, { recipientName: 'امید بیک‌زاده' });
    for (const name of ['بیک زاده 10006', 'بیکزاده 10006', 'بيك زاده 10006']) {
      expect(judge([row(name)], [bik])[0]![0], name).toBe('matched');
    }
    expect(judge([row('رضایی 10006')], [bik])).toEqual([['review', 'name_mismatch', 'o-10006', false]]);
    expect(nameFits('', 'امید بیک‌زاده')).toBe(false);
  });

  it('مقصد: شهر یا استان دیگر صف تأیید؛ شهر دیگرِ همان استان، نام استان، و مقصد ناشناس نه', () => {
    expect(judge([row('طاهری 10013', {}, 'مشهد')], [order(10013)])[0]!.slice(0, 2)).toEqual(['review', 'destination_mismatch']);
    for (const destination of ['تهران', 'قرچک', 'ورامین', 'استان تهران', 'باجه ۱۲']) {
      expect(destinationFits(destination, TEHRAN), destination).toBe(true);
    }
    expect(destinationFits('اصفهان', TEHRAN)).toBe(false);
    expect(destinationFits('انديمشک', { provinceId: 13, cityId: null })).toBe(destinationFits('اندیمشک', { provinceId: 13, cityId: null }));
  });

  it('روز: پیش از روز پرداخت صف تأیید؛ همان روز پرداخت قطعی؛ روز آینده خوانده نشد', () => {
    expect(judge([row('طاهری 10013', { date: '1405/07/08' })], [order(10013)])[0]!.slice(0, 2)).toEqual(['review', 'date_before_payment']);
    expect(judge([row('طاهری 10013', { date: '1405/07/09' })], [order(10013)])[0]![0]).toBe('matched');
    expect(judge([row('طاهری 10013', { date: '1405/07/14' })], [order(10013)])[0]!.slice(0, 2)).toEqual(['invalid', 'date_future']);
  });

  it('بی شماره، کد دستی، ناپیدا یا پرداخت‌نشده: پیدا نشد؛ لغوشده و «در صف چاپ»: صف تأیید', () => {
    const rows = [
      parcel(1, BC(1), 'احمدی', 'تهران', 1850, 1_336_660),
      parcel(2, BC(2), 'طهماسبی 6103', 'تهران', 1050, 1_618_120),
      parcel(3, BC(3), 'طاهری 10099', 'تهران', 1050, 1_618_120),
      parcel(4, BC(4), 'طاهری 10050', 'تهران', 1050, 1_618_120),
      parcel(5, BC(5), 'طاهری 10026', 'تهران', 690, 1_295_000),
      parcel(6, BC(6), 'طاهری 10019', 'تهران', 560, 1_295_000),
    ];
    const orders = [order(10050, { status: 'awaiting_payment', paidAt: null }), order(10026, { status: 'cancelled' }), order(10019, { status: 'paid' })];
    expect(judge(rows, orders).map((j) => j.slice(0, 2))).toEqual([
      ['unmatched', 'no_number'],
      ['unmatched', 'manual_code'],
      ['unmatched', 'not_found'],
      ['unmatched', 'not_found'],
      ['review', 'cancelled'],
      ['review', 'queued'],
    ]);
  });

  it('بی شماره با نامزد صف تأیید است (۶٫۲)؛ بی نامزد همان «پیدا نشد»؛ نامزد سطر دیگر اثری ندارد', () => {
    const rows = [parcel(1, BC(1), 'احمدی', 'تهران', 1850, 1_336_660), parcel(2, BC(2), 'رحمانی', 'تهران', 820, 1_295_000)];
    expect(judge(rows, [], [], [1]).map((j) => j.slice(0, 3))).toEqual([
      ['review', 'no_number', null],
      ['unmatched', 'no_number', null],
    ]);
    // شاهد: نامزد فقط برای سطر بی شماره است؛ سطر شماره‌دار حکم خودش را دارد.
    expect(judge([parcel(1, BC(1), 'طاهری 10099', 'تهران', 1050, 1_618_120)], [], [], [1])[0]!.slice(0, 2)).toEqual(['unmatched', 'not_found']);
  });

  it('تکراری: همین بارکد بالاتر در همین فایل، یا زنده برای همین سفارش؛ زنده برای سفارش دیگر صف تأیید', () => {
    const rows = [parcel(1, BC(1), 'طاهری 10013', 'تهران', 1560, 1_336_660), parcel(2, BC(1), 'طاهری 10013', 'تهران', 1560, 1_336_660)];
    expect(judge(rows, [order(10013)]).map((j) => j.slice(0, 2))).toEqual([['matched', null], ['duplicate', 'same_file']]);
    expect(judge([row('طاهری 10013')], [order(10013)], [[BC(1), 'o-10013']])[0]!.slice(0, 2)).toEqual(['duplicate', 'already']);
    expect(judge([row('طاهری 10013')], [order(10013)], [[BC(1), 'o-other']])[0]!.slice(0, 2)).toEqual(['review', 'barcode_elsewhere']);
    // سفارشی بیرون از محدودهٔ واردکننده شناسه ندارد (null)؛ همان صف تأیید، حتی وقتی شماره هم در محدوده نیست.
    expect(judge([row('طاهری 10013')], [order(10013)], [[BC(1), null]])[0]).toEqual(['review', 'barcode_elsewhere', 'o-10013', false]);
    expect(judge([row('طاهری 10099')], [order(10013)], [[BC(1), null]])[0]).toEqual(['review', 'barcode_elsewhere', null, false]);
  });

  it('خوانده نشد و غیرفعال، پیش از هر سفارشی', () => {
    const rows = [
      parcel(1, '1.2E+23', 'طاهری 10013', 'تهران', 1560, 1_336_660),
      parcel(2, BC(2), 'طاهری 10013', 'تهران', 1560, 1_336_660, { status: 'باطل' }),
    ];
    expect(judge(rows, [order(10013)]).map((j) => j.slice(0, 2))).toEqual([['invalid', 'barcode'], ['inactive', 'inactive']]);
  });

  it('اثر انگشت همان حکم‌ها را می‌گیرد: حکم دیگر، اثر دیگر', () => {
    const rows = sheetRows([row('طاهری 10013')]);
    const context = (status: OrderFacts['status']) => ({
      orders: new Map([[10013, order(10013, { status })]]),
      live: new Map(),
      now,
      candidateRows: new Set<number>(),
    });
    const printing = judgedFingerprint(judgeRows(rows, context('printing')));
    expect(judgedFingerprint(judgeRows(rows, context('printing')))).toBe(printing);
    expect(judgedFingerprint(judgeRows(rows, context('handed_to_post')))).not.toBe(printing);
    expect(judgedFingerprint(judgeRows(rows, context('cancelled')))).not.toBe(printing);
  });
});

describe('زمان تحویل پست و پیوند رهگیری', () => {
  it('روز گذشته: پایان همان روز تهران؛ امروز: همین لحظه', () => {
    const now = new Date('2026-10-05T07:50:00Z');
    const sunday = new Date('2026-10-03T20:30:00Z'); // آغاز یکشنبه ۱۲ مهر به وقت تهران
    expect(handedAtOf(sunday, now).toISOString()).toBe('2026-10-04T20:29:59.000Z');
    expect(handedAtOf(new Date('2026-10-04T20:30:00Z'), now)).toEqual(now);
  });

  it('پیوند رهگیری پست فقط نشانی است، با بارکد', () => {
    expect(IRAN_POST.trackingUrl('118800000000000000000101')).toBe('https://tracking.post.ir/search.aspx?id=118800000000000000000101');
  });
});
