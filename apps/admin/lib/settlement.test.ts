import type { LedgerEntry } from '@jozveyar/db';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';
import { describe, expect, it } from 'vitest';

import { documentSheets, pdfContext } from './reportDocument';
import {
  LEDGER_MAX_TOMANS,
  balanceText,
  entryEffectRials,
  entryKindText,
  periodText,
  readAdjustmentForm,
  readPaymentForm,
  readSettlementQuery,
  readSharePercent,
  readTomans,
  readVoidForm,
  settlementDocument,
  settlementParams,
  settlementRangeErrorText,
  settlementTotals,
  shareSeen,
  shareSeenOf,
  shareText,
  signedTomansText,
  type PanelSettlementOrder,
  type PanelStatement,
} from './settlement';

const NOW = new Date('2026-10-14T07:50:00Z'); // چهارشنبه 22 مهر 1405، ساعت 11:20 تهران
const tehran = (day: string) => new Date(`${day}T00:00:00+03:30`);
const MEHR_1 = tehran('2026-09-23');
const MEHR_21 = tehran('2026-10-13');
const TOMORROW = tehran('2026-10-15');
const SHAHRIVAR_1 = tehran('2026-08-23');

const ok = (params: Parameters<typeof readSettlementQuery>[0]) => {
  const result = readSettlementQuery(params, NOW);
  if (!result.ok) throw new Error(`${result.field}: ${result.error}`);
  return result.query;
};

describe('بازهٔ صورت‌حساب (سؤال ۳۹۸)', () => {
  it('بی هیچ «این ماه»: از اول ماه تا امروز؛ «ماه قبل» کل ماه با پایان انحصاری؛ چیپ ناشناس همان این ماه', () => {
    expect(ok({})).toEqual({
      range: { from: MEHR_1, until: TOMORROW },
      chip: 'month',
      label: ['مهر ', { num: '1405' }, '، تا امروز'],
      fileRange: '1405-07',
      form: { from: '1405/07/01', to: '1405/07/22' },
    });
    expect(ok({ d: 'month' }).range).toEqual({ from: MEHR_1, until: TOMORROW });
    expect(ok({ d: 'last' })).toEqual({
      range: { from: SHAHRIVAR_1, until: MEHR_1 },
      chip: 'last',
      label: ['شهریور ', { num: '1405' }],
      fileRange: '1405-06',
      form: { from: '1405/06/01', to: '1405/06/31' },
    });
    expect(ok({ d: 'year' }).chip).toBe('month');
    // ماه قبلِ فروردین اسفند سال پیش است.
    const farvardin = readSettlementQuery({ d: 'last' }, new Date('2026-03-25T08:00:00Z'));
    expect(farvardin.ok && farvardin.query.label).toEqual(['اسفند ', { num: '1404' }]);
  });

  it('روزها: دوسرشامل، ارقام فارسی، یکی تنها یعنی همان روز؛ نام فایل از روزها', () => {
    expect(ok({ from: '۱۴۰۵/۰۷/۰۱', to: '1405/07/21' })).toMatchObject({
      range: { from: MEHR_1, until: tehran('2026-10-14') },
      chip: null,
      label: ['از چهارشنبه 1 مهر تا سه‌شنبه 21 مهر'],
      fileRange: '1405-07-01-ta-1405-07-21',
    });
    expect(ok({ to: '1405/07/21' })).toMatchObject({ range: { from: MEHR_21, until: tehran('2026-10-14') }, label: ['سه‌شنبه 21 مهر'] });
    expect(settlementParams(ok({ from: '1405/07/01', to: '1405/07/21' }))).toEqual({ from: '1405/07/01', to: '1405/07/21' });
    expect(settlementParams(ok({ d: 'last' }))).toEqual({ d: 'last' });
    expect(settlementParams(ok({}))).toEqual({ d: 'month' });
  });

  it('خطا زیر فیلد خودش، با فرم همان که نوشته شد؛ سقف ۴۰۰ روز', () => {
    const bad = (params: Parameters<typeof readSettlementQuery>[0]) => {
      const result = readSettlementQuery(params, NOW);
      return result.ok ? null : [result.field, result.error, result.form];
    };
    expect(bad({ from: '1405/13/01' })).toEqual(['from', 'invalid_day', { from: '1405/13/01', to: '' }]);
    expect(bad({ from: '1405/07/01', to: 'دیروز' })).toEqual(['to', 'invalid_last_day', { from: '1405/07/01', to: 'دیروز' }]);
    expect(bad({ from: '1405/07/10', to: '1405/07/09' })?.[1]).toBe('day_order');
    expect(bad({ from: '1404/06/01', to: '1405/07/10' })?.[1]).toBe('too_many_days');
    expect(bad({ from: '1404/07/01', to: '1405/07/30' })?.[1]).toBeUndefined();
    expect(settlementRangeErrorText('too_many_days')).toBe('بازهٔ روز تا 400 روز.');
    expect(settlementRangeErrorText('invalid_day')).toBe('روز را شمسی بنویس، مثلاً 1405/07/22.');
  });
});

describe('درصد سهم (سؤال ۳۹۱)', () => {
  it('۰ تا ۱۰۰ با تا دو رقم اعشار، ارقام فارسی، «٫» و «٪» هم؛ هر چیز دیگر null، بی گرد کردن', () => {
    expect(readSharePercent('65')).toBe(6_500);
    expect(readSharePercent(' 62.5 ')).toBe(6_250);
    expect(readSharePercent('۶۲٫۵')).toBe(6_250);
    expect(readSharePercent('33.33٪')).toBe(3_333);
    expect(readSharePercent('0')).toBe(0);
    expect(readSharePercent('100')).toBe(10_000);
    expect(readSharePercent('0.05')).toBe(5);
    for (const wrong of ['100.01', '101', '62.555', '-5', '', 'شصت', '6 5', '65.', '.5', null, 65]) expect(readSharePercent(wrong)).toBeNull();
  });

  it('متن درصد: «65٪»، «62.5٪»، «33.33٪»؛ و «همان که دیده شد»', () => {
    expect([6_500, 6_250, 3_333, 0, 10_000, 5, 50].map(shareText)).toEqual(['65٪', '62.5٪', '33.33٪', '0٪', '100٪', '0.05٪', '0.5٪']);
    expect(shareSeen(null)).toBe('');
    expect(shareSeen(6_500)).toBe('6500');
    expect(shareSeenOf('')).toBeNull();
    expect(shareSeenOf(undefined)).toBeNull();
    expect(shareSeenOf('6500')).toBe(6_500);
    expect(shareSeenOf('0')).toBe(0);
    for (const wrong of ['65.5', '10001', 'x', 6500, null]) expect(shareSeenOf(wrong)).toBeUndefined();
  });
});

describe('فرم‌های دفتر (سؤال ۳۹۶)', () => {
  const payment = (over: Partial<Record<'amount' | 'day' | 'periodFrom' | 'periodTo' | 'tracking' | 'note', unknown>> = {}) =>
    readPaymentForm({ amount: '2,500,000', day: '1405/07/21', periodFrom: '', periodTo: '', tracking: '', note: '', ...over }, NOW);

  it('مبلغ تومان به ریال: ارقام فارسی و جداکننده؛ صفر، منفی یا بالای سقف نه', () => {
    expect(readTomans('2,500,000')).toBe(25_000_000n);
    expect(readTomans('۲٬۵۰۰٬۰۰۰')).toBe(25_000_000n);
    expect(readTomans(String(LEDGER_MAX_TOMANS))).toBe(100_000_000_000n);
    for (const wrong of ['0', '-100', String(LEDGER_MAX_TOMANS + 1), '12.5', 'دو میلیون', '', null]) expect(readTomans(wrong)).toBeNull();
  });

  it('پرداخت: روز تا امروز، «بابت» هر دو یا یکی (همان روز)، کد پیگیری لاتین، یادداشت یکدست؛ اولین خطا با جایش', () => {
    expect(payment({ periodFrom: '1405/07/01', periodTo: '۱۴۰۵/۰۷/۱۵', tracking: ' 8031 14 ', note: ' کارت  به کارت ' })).toEqual({
      ok: true,
      value: {
        amountRials: 25_000_000n,
        day: MEHR_21,
        period: { from: MEHR_1, until: tehran('2026-10-08') },
        tracking: '803114',
        note: 'کارت به کارت',
      },
    });
    expect(payment()).toEqual({ ok: true, value: { amountRials: 25_000_000n, day: MEHR_21, period: null, tracking: null, note: null } });
    expect(payment({ periodTo: '1405/07/15' })).toMatchObject({ value: { period: { from: tehran('2026-10-07'), until: tehran('2026-10-08') } } });
    expect(payment({ amount: '0' })).toEqual({ ok: false, field: 'amount', error: 'settlement_amount_invalid' });
    expect(payment({ day: '1405/07/23' })).toEqual({ ok: false, field: 'day', error: 'settlement_day_future' });
    expect(payment({ day: '1405-07-22' })).toMatchObject({ ok: true });
    expect(payment({ day: 'امروز' })).toEqual({ ok: false, field: 'day', error: 'settlement_day_invalid' });
    expect(payment({ periodFrom: '1405/07/15', periodTo: '1405/07/01' })).toEqual({ ok: false, field: 'periodTo', error: 'settlement_period_order' });
    expect(payment({ periodFrom: 'x' })).toEqual({ ok: false, field: 'periodFrom', error: 'settlement_period_invalid' });
    expect(payment({ periodFrom: '1404/01/01', periodTo: '1405/07/01' })).toEqual({ ok: false, field: 'periodTo', error: 'settlement_period_long' });
    // «بابت» تا ۴۰۰ روز، دوسرشامل: ۴۰۰ روز از ۱ مهر پذیرفته و ۴۰۱ نه.
    const lastOf = (days: number) => formatJalaliNumeric(tehranDayStart(MEHR_1, days - 1));
    expect(payment({ periodFrom: '1405/07/01', periodTo: lastOf(400) })).toMatchObject({
      ok: true,
      value: { period: { from: MEHR_1, until: tehranDayStart(MEHR_1, 400) } },
    });
    expect(payment({ periodFrom: '1405/07/01', periodTo: lastOf(401) })).toEqual({ ok: false, field: 'periodTo', error: 'settlement_period_long' });
    expect(payment({ tracking: 'پیگیری' })).toEqual({ ok: false, field: 'tracking', error: 'settlement_tracking_invalid' });
    expect(payment({ tracking: 'x'.repeat(41) })).toEqual({ ok: false, field: 'tracking', error: 'settlement_tracking_invalid' });
    expect(payment({ note: 'ی'.repeat(301) })).toEqual({ ok: false, field: 'note', error: 'settlement_note_too_long' });
  });

  it('اصلاح: به سود مثبت و به زیان منفی، سفارش اختیاری با رقم، دلیل لازم؛ باطل فقط دلیل', () => {
    const adjust = (over: Partial<Record<'amount' | 'direction' | 'day' | 'order' | 'reason', unknown>> = {}) =>
      readAdjustmentForm({ amount: '120,000', direction: 'plus', day: '1405/07/21', order: '', reason: ' هزینهٔ  پست ', ...over }, NOW);
    expect(adjust()).toEqual({ ok: true, value: { amountRials: 1_200_000n, day: MEHR_21, orderNumber: null, note: 'هزینهٔ پست' } });
    expect(adjust({ direction: 'minus', order: '۱۰۰۲۷' })).toMatchObject({ value: { amountRials: -1_200_000n, orderNumber: 10_027 } });
    expect(adjust({ direction: 'up' })).toEqual({ ok: false, field: 'direction', error: 'settlement_direction' });
    expect(adjust({ order: '10027a' })).toEqual({ ok: false, field: 'order', error: 'settlement_order_invalid' });
    expect(adjust({ reason: '   ' })).toEqual({ ok: false, field: 'reason', error: 'settlement_reason_required' });
    expect(adjust({ reason: 'ی'.repeat(301) })).toEqual({ ok: false, field: 'reason', error: 'settlement_reason_too_long' });
    expect(adjust({ day: '1405/08/01' })).toEqual({ ok: false, field: 'day', error: 'settlement_day_future' });
    expect(readVoidForm({ reason: ' دو  بار ثبت شد ' })).toEqual({ ok: true, value: 'دو بار ثبت شد' });
    expect(readVoidForm({ reason: '' })).toEqual({ ok: false, field: 'reason', error: 'settlement_reason_required' });
  });
});

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 1,
  partnerId: 'p-2',
  kind: 'payment',
  amountRials: 4_500_000n,
  day: MEHR_21,
  period: null,
  tracking: null,
  note: null,
  orderNumber: null,
  createdAt: NOW,
  createdBy: 'a-1',
  createdByName: 'مریم احمدی',
  voided: null,
  ...over,
});

const order = (orderNumber: number, over: Partial<PanelSettlementOrder> = {}): PanelSettlementOrder => ({
  orderNumber,
  status: 'handed_to_post',
  paidAt: tehran('2026-10-10'),
  at: MEHR_21,
  baseRials: 2_450_000n,
  shareBp: 6_500,
  shareRials: 1_592_500n,
  ...over,
});

const STATEMENT: PanelStatement = {
  partner: { id: 'c65abc3f-2fd0-4688-b42b-5e541b47aa2b', name: 'چاپ نور', cityName: 'مشهد', active: true, isDefault: false, shareBp: 6_500 },
  range: { from: MEHR_1, until: TOMORROW },
  openingRials: 300_000n,
  handed: [order(10027), order(10031, { shareBp: null, shareRials: null })],
  cancelledAfterPrint: [order(10029, { status: 'cancelled', shareRials: 650_000n })],
  inFlight: [order(10040, { status: 'printing', at: null })],
  ledger: [
    entry({ id: 7, period: { from: MEHR_1, until: tehran('2026-10-08') }, tracking: '803114', note: 'کارت به کارت' }),
    entry({ id: 8, kind: 'adjustment', amountRials: -200_000n, note: 'برگهٔ خراب', orderNumber: 10027 }),
    entry({ id: 9, amountRials: 9_999_990n, voided: { at: NOW, by: 'a-1', byName: 'مریم احمدی', reason: 'دو بار ثبت شد' } }),
  ],
  closingRials: 300_000n + 1_592_500n - 200_000n - 4_500_000n,
  balanceRials: 300_000n + 1_592_500n - 200_000n - 4_500_000n + 1_000_000n,
  version: 4,
};

describe('نمایش صورت‌حساب', () => {
  it('جمع‌های بازه از فهرست‌ها؛ باطل‌شده و بی سهم هیچ', () => {
    expect(settlementTotals(STATEMENT)).toEqual({
      handedRials: 1_592_500n,
      handed: 2,
      unshared: 1,
      paymentsRials: 4_500_000n,
      adjustmentsRials: -200_000n,
      inFlightRials: 1_592_500n,
    });
  });

  it('مانده با معنایش، مبلغ با نشانه، نوع هر ردیف و اثرش، و «بابت»', () => {
    expect(balanceText(12_000_000n)).toEqual({ amount: '1,200,000', text: 'بدهی جزوه‌یار به چاپخانه', tone: 'owed' });
    expect(balanceText(-800_000n)).toEqual({ amount: '80,000', text: 'بیش از سهم پرداخت شده', tone: 'credit' });
    expect(balanceText(4n)).toEqual({ amount: '0', text: 'تسویه', tone: 'settled' });
    expect([signedTomansText(1_200_000n), signedTomansText(-800_000n), signedTomansText(0n)]).toEqual(['+120,000', '−80,000', '0']);
    expect(STATEMENT.ledger.map(entryKindText)).toEqual(['پرداخت به چاپخانه', 'اصلاح به زیان چاپخانه', 'پرداخت به چاپخانه']);
    expect(entryKindText(entry({ kind: 'adjustment', amountRials: 10n }))).toBe('اصلاح به سود چاپخانه');
    expect(STATEMENT.ledger.map(entryEffectRials)).toEqual([-4_500_000n, -200_000n, -9_999_990n]);
    expect(periodText({ from: MEHR_1, until: tehran('2026-10-08') }, NOW)).toBe('بابت چهارشنبه 1 مهر تا چهارشنبه 15 مهر');
    expect(periodText({ from: MEHR_21, until: tehran('2026-10-14') }, NOW)).toBe('بابت سه‌شنبه 21 مهر');
  });

  it('سند خروجی با مبلغ: مانده‌ها و جمع‌ها، یادداشت درصد، بی سهم و ماندهٔ امروز، لغو پس از چاپ، در راه، دفتر با باطل، و فهرست تحویل‌ها', () => {
    const query = ok({});
    const doc = settlementDocument({ statement: STATEMENT, query, money: true, made: { at: NOW, by: 'مریم احمدی' } });
    expect(doc).toMatchObject({
      title: 'صورت‌حساب تسویه',
      subtitle: 'چاپ نور · مشهد · مهر 1405، تا امروز',
      made: 'ساخته شده 22 مهر 1405، 11:20، مریم احمدی',
      fileBase: 'tasvie-c65abc3f-1405-07',
    });
    expect(doc.notes).toEqual([
      'درصد سهم امروز: 65٪',
      '1 سفارش تحویل‌شدهٔ بی سهم در این بازه، در هیچ جمعی نیست.',
      'ماندهٔ امروز، با آنچه پس از بازه آمد: −180,750 تومان.',
    ]);
    expect(doc.stats).toEqual([
      { label: 'مانده از پیش (تومان)', value: 30_000 },
      { label: 'سفارش تحویل‌شده', value: 2 },
      { label: 'سهم سفارش‌ها (تومان)', value: 159_250 },
      { label: 'پرداخت (تومان)', value: 450_000 },
      { label: 'اصلاح (تومان)', value: -20_000 },
      { label: 'مانده پایان بازه (تومان)', value: -280_750 },
    ]);
    expect(doc.tables.map((t) => t.title)).toEqual(['لغو پس از شروع چاپ', 'در راه (در صف چاپ و در حال چاپ)', 'پرداخت‌ها و اصلاح‌ها']);
    expect(doc.tables[0]!.rows).toEqual([[10029, '1405/07/21', 245_000, '65٪', 65_000]]);
    expect(doc.tables[1]!.rows).toEqual([[10040, 'در حال چاپ', '65٪', 159_250]]);
    expect(doc.tables[2]!.rows).toEqual([
      ['1405/07/21', 'پرداخت به چاپخانه', -450_000, 'چهارشنبه 1 مهر تا چهارشنبه 15 مهر', '803114', null, 'کارت به کارت', 'مریم احمدی'],
      ['1405/07/21', 'اصلاح به زیان چاپخانه', -20_000, '', '', 10027, 'برگهٔ خراب', 'مریم احمدی'],
      ['1405/07/21', 'پرداخت به چاپخانه (باطل: دو بار ثبت شد)', -999_999, '', '', null, '', 'مریم احمدی'],
    ]);
    expect(doc.detail!.columns.map((c) => c.label)).toEqual(['شماره', 'روز', 'پایهٔ سهم (تومان)', 'درصد', 'سهم (تومان)']);
    expect(doc.detail!.rows).toEqual([
      [10027, '1405/07/21', 245_000, '65٪', 159_250],
      [10031, '1405/07/21', 245_000, 'بی سهم', null],
    ]);
    // همان سند به PDF و اکسل.
    expect((pdfContext(doc) as { stats: { value: string }[] }).stats.at(-1)!.value).toBe('-280,750');
    expect(documentSheets(doc).map((sheet) => sheet.name)).toEqual(['خلاصه', 'سفارش‌های تحویل‌شده']);
  });

  it('سند بی مبلغ (کاربر چاپخانه): بی ستون پایهٔ سهم؛ بی تحویل و بی دفتر، جدول دفتر با یادداشت', () => {
    const own: PanelStatement = {
      ...STATEMENT,
      partner: { ...STATEMENT.partner, shareBp: null },
      handed: STATEMENT.handed.map((o) => ({ ...o, baseRials: null })),
      cancelledAfterPrint: [],
      inFlight: [],
      ledger: [],
      balanceRials: STATEMENT.closingRials,
    };
    const doc = settlementDocument({ statement: own, query: ok({ d: 'last' }), money: false, made: { at: NOW, by: 'حسن نوری' } });
    expect(JSON.stringify(doc)).not.toContain('پایهٔ سهم');
    expect(JSON.stringify(doc)).not.toContain('245000');
    expect(doc.notes).toEqual(['درصد سهم این چاپخانه تعیین نشده.', '1 سفارش تحویل‌شدهٔ بی سهم در این بازه، در هیچ جمعی نیست.']);
    expect(doc.tables.map((t) => [t.title, t.note])).toEqual([['پرداخت‌ها و اصلاح‌ها', 'در این بازه پرداخت یا اصلاحی ثبت نشده.']]);
    expect(doc.detail!.rows[0]).toEqual([10027, '1405/07/21', '65٪', 159_250]);
    expect(doc.fileBase).toBe('tasvie-c65abc3f-1405-06');
    const empty = settlementDocument({ statement: { ...own, handed: [] }, query: ok({}), money: false, made: { at: NOW, by: 'حسن نوری' } });
    expect(empty.detail).toBeNull();
  });
});
