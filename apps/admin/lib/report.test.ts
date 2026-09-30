/**
 * گزارش ارسال به زبان صفحه (`report.ts`، برش ۶٫۴، ADR-048): مرز ماه تهران، گرد کردن تومان و درصد، بازه‌های وزن و سنجش فرمشان،
 * و جمع‌ها با ردیف خالی. عددهای طرح (`m-ship-report`) همین‌جا دوباره ساخته می‌شوند.
 */

import { describe, expect, it } from 'vitest';

import type { ShippingReportOrder } from '@jozveyar/db';

import type { Seg } from './orders';
import {
  aggregateReport,
  averageGrams,
  bandIndex,
  bandLabel,
  bandsOf,
  boundErrorText,
  boundFieldCount,
  boundsText,
  groupDigits,
  inKilos,
  marginRials,
  monthKey,
  monthLabel,
  monthOf,
  monthRange,
  monthStart,
  monthsBetween,
  nextMonth,
  parseMonthKey,
  percentText,
  ratioText,
  readBoundsInput,
  roundDiv,
  signedTomans,
  tomansText,
  tookRials,
} from './report';

const text = (segs: readonly Seg[]) => segs.map((seg) => (typeof seg === 'string' ? seg : 'num' in seg ? seg.num : '')).join('');

describe('ماه شمسی به وقت تهران', () => {
  it('مرز نیمه‌شب تهران، نه UTC: ۲۳:۵۹:۵۹ روز ۳۱ شهریور شهریور است و نیمه‌شب ۱ مهر مهر', () => {
    expect(monthOf(new Date('2026-09-22T20:29:59Z'))).toEqual({ year: 1405, month: 6 });
    expect(monthOf(new Date('2026-09-22T20:30:00Z'))).toEqual({ year: 1405, month: 7 });
    // همان لحظه در UTC هنوز ۲۲ سپتامبر است؛ ماه با روز تهران عوض می‌شود.
    expect(monthOf(new Date('2026-09-22T23:00:00Z'))).toEqual({ year: 1405, month: 7 });
  });

  it('آغاز و بازهٔ ماه: نیمه‌شب تهران؛ مهر ۳۰ روز، شهریور ۳۱، و اسفند کبیسه و غیرکبیسه', () => {
    expect(monthStart({ year: 1405, month: 7 })).toEqual(new Date('2026-09-22T20:30:00Z'));
    expect(monthRange({ year: 1405, month: 6 })).toEqual({ from: new Date('2026-08-22T20:30:00Z'), to: new Date('2026-09-22T20:30:00Z') });
    expect(monthRange({ year: 1405, month: 7 }).to).toEqual(new Date('2026-10-22T20:30:00Z'));
    const days = (range: { from: Date; to: Date }) => (range.to.getTime() - range.from.getTime()) / 86_400_000;
    expect(days(monthRange({ year: 1403, month: 12 }))).toBe(30);
    expect(days(monthRange({ year: 1405, month: 12 }))).toBe(29);
    expect(monthRange({ year: 1405, month: 12 }).to).toEqual(new Date('2027-03-20T20:30:00Z'));
    expect(nextMonth({ year: 1405, month: 12 })).toEqual({ year: 1406, month: 1 });
  });

  it('ماه‌های میان دو لحظه، هر دو شامل، از سال به سال؛ و یک ماه', () => {
    const between = monthsBetween(new Date('2027-01-10T08:00:00Z'), new Date('2027-04-01T08:00:00Z'));
    expect(between.map(monthKey)).toEqual(['1405-10', '1405-11', '1405-12', '1406-01']);
    expect(monthsBetween(new Date('2026-09-23T08:00:00Z'), new Date('2026-09-30T08:00:00Z')).map(monthKey)).toEqual(['1405-07']);
    expect(monthsBetween(new Date('2026-10-01T08:00:00Z'), new Date('2026-09-01T08:00:00Z'))).toEqual([]);
  });

  it('ماه نشانی: فقط `1405-07`؛ هر شکل دیگر null', () => {
    expect(parseMonthKey('1405-07')).toEqual({ year: 1405, month: 7 });
    expect(monthKey({ year: 1405, month: 7 })).toBe('1405-07');
    for (const bad of ['1405-7', '1405-13', '1405-00', '۱۴۰۵-۰۷', '1405/07', '', undefined, 1405, '99999-07', '1405-07x']) {
      expect(parseMonthKey(bad)).toBeNull();
    }
  });

  it('نام ماه، و ماه جاری «تا امروز» (طرح)', () => {
    expect(text(monthLabel({ year: 1405, month: 7 }, true))).toBe('مهر 1405، تا امروز');
    expect(monthLabel({ year: 1405, month: 6 }, false)).toEqual(['شهریور ', { num: '1405' }]);
    expect(text(monthLabel({ year: 1406, month: 1 }, false))).toBe('فروردین 1406');
    expect(text(monthLabel({ year: 1405, month: 12 }, false))).toBe('اسفند 1405');
  });
});

describe('پول و عدد', () => {
  it('تقسیم گرد، نیم از صفر دور؛ زیان و سود هم‌اندازه', () => {
    expect([15n, 14n, 5n, 4n, -4n, -5n, -14n, -15n].map((n) => roundDiv(n, 10n))).toEqual([2n, 1n, 1n, 0n, 0n, -1n, -1n, -2n]);
    expect(roundDiv(0n, 7n)).toBe(0n);
  });

  it('تومان با جداکنندهٔ هزارگان، و حاشیه با نشانهٔ طرح (U+2212)', () => {
    expect(tomansText(35_520_720n)).toBe('3,552,072');
    expect(tomansText(35_520_725n)).toBe('3,552,073');
    expect(groupDigits(123n)).toBe('123');
    expect(groupDigits(1_000n)).toBe('1,000');
    expect(signedTomans(-3_226_160n)).toBe('−322,616');
    expect(signedTomans(247_410n)).toBe('+24,741');
    // صفرِ گردشده بی نشانه: نه «−0» و نه «+0».
    expect(signedTomans(-4n)).toBe('0');
    expect(signedTomans(4n)).toBe('0');
    expect(signedTomans(0n)).toBe('0');
  });

  it('درصد با یک رقم اعشار از ریال‌ها؛ کرایهٔ صفر بی درصد', () => {
    // طرح: −322,616 از 3,552,072 = −9.08٪.
    expect(percentText(-3_226_160n, 35_520_720n)).toBe('−9.1٪');
    expect(percentText(247_410n, 5_991_240n)).toBe('+4.1٪');
    expect(percentText(0n, 100n)).toBe('0.0٪');
    // نیم از صفر دور: ۰٫۰۵٪ و −۰٫۰۵٪.
    expect(percentText(1n, 2_000n)).toBe('+0.1٪');
    expect(percentText(-1n, 2_000n)).toBe('−0.1٪');
    expect(percentText(-1n, 2_001n)).toBe('0.0٪');
    expect(percentText(10n, 0n)).toBeNull();
    expect(percentText(-12_345n, 10_000n)).toBe('−123.5٪');
  });

  it('میانگین گرم و واقعی ÷ برآورد (طرح: 765 ÷ 690 = 1.11)', () => {
    expect(averageGrams(7_590n, 11)).toBe('690');
    expect(averageGrams(16_824n, 12)).toBe('1,402');
    expect(averageGrams(0n, 0)).toBeNull();
    expect(ratioText(8_415n, 7_590n)).toBe('1.11');
    expect(ratioText(1_000n, 1_000n)).toBe('1.00');
    expect(ratioText(905n, 1_000n)).toBe('0.91');
    expect(ratioText(5n, 0n)).toBeNull();
  });
});

describe('بازه‌های وزن', () => {
  it('از مرزها: هر بازه از مرز پایینش تا پیش از مرز بعد، مثل کرایهٔ تعرفه؛ وزنِ برابر مرز مال بازهٔ بالا', () => {
    expect(bandsOf([1_000, 3_000])).toEqual([
      { min: 0, max: 1_000 },
      { min: 1_000, max: 3_000 },
      { min: 3_000, max: null },
    ]);
    expect(bandsOf([])).toEqual([{ min: 0, max: null }]);
    expect([0, 999, 1_000, 2_999, 3_000, 50_000].map((g) => bandIndex([1_000, 3_000], g))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('برچسب کیلو وقتی همهٔ مرزها کیلوی درست‌اند (طرح)، وگرنه همه گرم', () => {
    const labels = (bounds: number[]) => bandsOf(bounds).map((band) => text(bandLabel(band, inKilos(bounds))));
    expect(labels([1_000, 3_000])).toEqual(['زیر 1 کیلو', '1 تا 3 کیلو', 'بالای 3 کیلو']);
    expect(labels([750, 1_500, 3_000])).toEqual(['زیر 750 گرم', '750 تا 1,500 گرم', '1,500 تا 3,000 گرم', 'بالای 3,000 گرم']);
    expect(labels([])).toEqual(['همهٔ وزن‌ها']);
    expect(text(boundsText([1_000, 3_000]))).toBe('1 و 3 کیلو');
    expect(text(boundsText([750, 1_500, 3_000]))).toBe('750، 1,500 و 3,000 گرم');
    expect(text(boundsText([2_000]))).toBe('2 کیلو');
    expect(text(boundsText([]))).toBe('یک بازه برای همهٔ وزن‌ها');
  });

  it('فیلدهای فرم: مرزهای امروز و دو فیلد خالی، دست‌کم سه و تا هشت', () => {
    expect(boundFieldCount([1_000, 3_000])).toBe(4);
    expect(boundFieldCount([])).toBe(3);
    expect(boundFieldCount([1, 2, 3, 4, 5, 6, 7])).toBe(8);
    expect(boundFieldCount([1, 2, 3, 4, 5, 6, 7, 8])).toBe(8);
  });

  it('سنجش فرم: صعودی و مثبت، هر خطا کنار فیلد خودش؛ خالی یعنی حذف؛ ارقام فارسی و جداکننده', () => {
    expect(readBoundsInput(['1000', '3000', '', ''])).toEqual({ bounds: [1_000, 3_000] });
    expect(readBoundsInput(['۷۵۰', '', '1,500', ' ۳٬۰۰۰ '])).toEqual({ bounds: [750, 1_500, 3_000] });
    expect(readBoundsInput(['1000', '500', '3000'])).toEqual({ errors: [null, { code: 'order', after: 1_000 }, null] });
    // برابرِ قبلی هم نزولی است؛ و مقایسه با آخرین مرز درست، نه با فیلد خطادار.
    expect(readBoundsInput(['1000', '1000'])).toEqual({ errors: [null, { code: 'order', after: 1_000 }] });
    expect(readBoundsInput(['1000', 'abc', '900'])).toEqual({ errors: [null, { code: 'number' }, { code: 'order', after: 1_000 }] });
    expect(readBoundsInput(['0', '1.5', '-3', '100001'])).toEqual({
      errors: [{ code: 'positive' }, { code: 'number' }, { code: 'number' }, { code: 'too_big' }],
    });
    expect(readBoundsInput(['', '', ''])).toEqual({ errors: [{ code: 'empty' }, null, null] });
    expect(readBoundsInput([])).toEqual({ errors: [{ code: 'empty' }] });
    expect(readBoundsInput(['100000'])).toEqual({ bounds: [100_000] });
    // فیلد نهم به بعد خوانده نمی‌شود.
    expect(readBoundsInput(['1', '2', '3', '4', '5', '6', '7', '8', '9'])).toEqual({ bounds: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(readBoundsInput([1000 as unknown as string, null])).toEqual({ errors: [{ code: 'empty' }, null] });
  });

  it('پیام هر خطا', () => {
    expect(boundErrorText({ code: 'order', after: 1_000 })).toBe('باید از 1,000 گرم بیشتر باشد؛ مرزها از کم به زیاد.');
    expect(boundErrorText({ code: 'too_big' })).toBe('مرز تا 100,000 گرم.');
    expect(boundErrorText({ code: 'empty' })).toBe('دست‌کم یک مرز بنویس.');
    expect(boundErrorText({ code: 'positive' })).toBe('مرز باید بیشتر از صفر گرم باشد.');
    expect(boundErrorText({ code: 'number' })).toBe('عدد درست گرم بنویس، مثلاً 1500.');
  });
});

describe('جمع‌های ماه', () => {
  const JOZVEYAR = { id: 'p-1', name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران' };
  const NOOR = { id: 'p-2', name: 'چاپ نور', cityName: 'مشهد' };
  let number = 10_000;
  const order = (over: Partial<ShippingReportOrder> = {}): ShippingReportOrder => ({
    orderNumber: (number += 1),
    zoneId: 'tehran',
    zoneName: 'استان تهران',
    partner: JOZVEYAR,
    shippingRials: 1_295_000n,
    estWeightGrams: 690,
    parcels: 1,
    fareRials: 1_295_000n,
    taxRials: 129_500n,
    weightGrams: 765,
    ...over,
  });
  const ZONE_ORDER = ['tehran', 'other'];

  it('ردیف خالی: همه صفر، بی منطقه و چاپخانه، بازه‌ها با صفر سفارش', () => {
    const report = aggregateReport([], [1_000, 3_000], ZONE_ORDER);
    expect(report.total).toEqual({ orders: 0, parcels: 0, paidRials: 0n, fareRials: 0n, taxRials: 0n });
    expect(report.zones).toEqual([]);
    expect(report.partners).toEqual([]);
    expect(report.weights.map((w) => w.orders)).toEqual([0, 0, 0]);
    expect(report.untracked).toBe(0);
    expect(percentText(marginRials(report.total), report.total.paidRials)).toBeNull();
  });

  it('سفارش چندبسته‌ای یکی است؛ بی کد رهگیری جدا؛ منطقه و چاپخانهٔ بی سفارش پنهان؛ ترتیب ردیف‌ها', () => {
    const rows = [
      order({ parcels: 2, fareRials: 2_795_000n, taxRials: 279_500n, weightGrams: 1_600, estWeightGrams: 1_450 }),
      order({ zoneId: 'other', zoneName: 'بقیهٔ کشور', partner: NOOR, shippingRials: 1_377_500n, fareRials: 1_618_120n, taxRials: 161_812n }),
      order({ zoneId: 'other', zoneName: 'بقیهٔ کشور', partner: NOOR, shippingRials: 1_377_500n }),
      order({ partner: null, estWeightGrams: 3_150, weightGrams: 3_300 }),
      order({ parcels: 0, fareRials: 0n, taxRials: 0n, weightGrams: 0, zoneId: 'other', zoneName: 'بقیهٔ کشور', partner: { id: 'p-3', name: 'چاپ آفتاب', cityName: 'اصفهان' } }),
    ];
    const report = aggregateReport(rows, [1_000, 3_000], ZONE_ORDER);
    expect(report.untracked).toBe(1);
    expect(report.total).toEqual({
      orders: 4,
      parcels: 5,
      paidRials: 1_295_000n * 2n + 1_377_500n * 2n,
      fareRials: 2_795_000n + 1_618_120n + 1_295_000n + 1_295_000n,
      taxRials: 279_500n + 161_812n + 129_500n + 129_500n,
    });
    expect(tookRials(report.total)).toBe(report.total.fareRials + report.total.taxRials);
    expect(marginRials(report.total)).toBe(report.total.paidRials - tookRials(report.total));
    expect(report.zones.map((z) => [z.key, z.label, z.orders, z.parcels])).toEqual([
      ['tehran', 'استان تهران', 2, 3],
      ['other', 'بقیهٔ کشور', 2, 2],
    ]);
    // «چاپ آفتاب» فقط سفارش بی کد دارد: پنهان. بیشترین سفارش اول، «بی چاپخانه» آخر.
    expect(report.partners.map((p) => [p.key, p.label, p.orders])).toEqual([
      ['p-2', 'چاپ نور · مشهد', 2],
      ['p-1', 'چاپخانهٔ جزوه‌یار · تهران', 1],
      ['none', 'بی چاپخانه', 1],
    ]);
    expect(report.weights.map((w) => [w.orders, w.estimateGrams, w.actualGrams])).toEqual([
      [2, 1_380n, 1_530n],
      [1, 1_450n, 1_600n],
      [1, 3_150n, 3_300n],
    ]);
  });

  it('منطقهٔ ناشناس پس از منطقه‌های کرایه؛ بی مرز یک بازه برای همه', () => {
    const report = aggregateReport([order({ zoneId: 'x', zoneName: 'الف' }), order()], [], ZONE_ORDER);
    expect(report.zones.map((z) => z.key)).toEqual(['tehran', 'x']);
    expect(report.weights).toHaveLength(1);
    expect(report.weights[0]!.orders).toBe(2);
  });

  it('عددهای طرح: 3,552,072 در برابر 3,874,688 یعنی −322,616 و −9.1٪', () => {
    const total = { orders: 24, parcels: 25, paidRials: 35_520_720n, fareRials: 35_224_440n, taxRials: 3_522_440n };
    expect(tomansText(tookRials(total))).toBe('3,874,688');
    expect(signedTomans(marginRials(total))).toBe('−322,616');
    expect(percentText(marginRials(total), total.paidRials)).toBe('−9.1٪');
  });
});
