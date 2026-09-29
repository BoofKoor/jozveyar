import { parseJalaliNumeric, tehranDayStart } from '@jozveyar/text';
import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_WINDOW_DAYS,
  candidatesFor,
  criteriaOf,
  isStrong,
  scoreOf,
  weightFits,
  type CandidateOrder,
  type CandidateRow,
} from './candidates.js';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405؛ روز فایل‌های طرح یکشنبه 12 مهر. */
const day = (jalali: string) => parseJalaliNumeric(jalali)!;
const SUNDAY = day('1405/07/12');
const at = (jalali: string, hhmm = '10:00') => new Date(day(jalali).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000);
const TEHRAN = { provinceId: 8, cityId: 394 };
const MASHHAD = { provinceId: 11, cityId: 1326 };
const KARAJ = { provinceId: 5, cityId: 1094 };

const order = (orderNumber: number, recipientName: string, over: Partial<CandidateOrder> = {}): CandidateOrder => ({
  id: `o-${orderNumber}`,
  orderNumber,
  status: 'handed_to_post',
  recipientName,
  ...TEHRAN,
  paidAt: at('1405/07/09'),
  handedToPostAt: at('1405/07/12', '18:00'),
  estWeightGrams: 900,
  liveShipments: 0,
  printReady: true,
  hasPartner: true,
  ...over,
});

const row = (nameG: string, destination: string, grams: number, over: Partial<CandidateRow> = {}): CandidateRow => {
  const number = /(\d+)$/.exec(nameG)?.[1];
  return {
    orderNumber: number ? Number(number) : null,
    surname: nameG.replace(/\s*\d+$/, ''),
    destination,
    weightGrams: grams,
    postDay: SUNDAY,
    ...over,
  };
};

/** نامزدها با شماره و معیارهایی که می‌خوانند، و انتخاب از پیش. */
function listOf(r: CandidateRow, orders: CandidateOrder[], voided: string[] = []) {
  const { candidates, preselected } = candidatesFor(r, orders, new Set(voided));
  return {
    candidates: candidates.map((c) => ({
      n: c.order.orderNumber,
      yes: (Object.keys(c.criteria) as (keyof typeof c.criteria)[]).filter((k) => c.criteria[k] === 'yes'),
      no: (Object.keys(c.criteria) as (keyof typeof c.criteria)[]).filter((k) => c.criteria[k] === 'no'),
      score: c.score,
      blocked: c.blocked,
    })),
    preselected: preselected ? Number(preselected.slice(2)) : null,
  };
}

describe('نامزدهای صف تأیید: پنج نمونهٔ طرح (برش ۶٫۲، تصمیم‌های ۷۷ و ۷۸)', () => {
  it('اکبری 10025: شماره و شهر می‌خوانند، نام، وزن و روز نه؛ از پیش انتخاب نمی‌شود', () => {
    const tavakoli = order(10025, 'رضا توکلی', { ...MASHHAD, estWeightGrams: 1300, handedToPostAt: at('1405/07/08', '16:00') });
    expect(listOf(row('اکبری 10025', 'مشهد', 450), [tavakoli])).toEqual({
      candidates: [{ n: 10025, yes: ['number', 'city'], no: ['surname', 'weight', 'day'], score: 4, blocked: null }],
      preselected: null,
    });
  });

  it('رضایی 10012: سفارش 10012 کد دارد و نامزد نیست؛ سارا رضایی 10014 قوی و انتخاب‌شده', () => {
    const karimi = order(10012, 'علی کریمی', { liveShipments: 1, handedToPostAt: at('1405/07/11') });
    const rezaei = order(10014, 'سارا رضایی', { estWeightGrams: 870 });
    expect(listOf(row('رضایی 10012', 'تهران', 910), [karimi, rezaei])).toEqual({
      candidates: [{ n: 10014, yes: ['surname', 'city', 'weight', 'day'], no: ['number'], score: 7, blocked: null }],
      preselected: 10014,
    });
  });

  it('احمدی بی شماره: رضا احمدی تهران قوی و انتخاب‌شده؛ نرگس احمدی کرج با شهر و روزی که نمی‌خوانند', () => {
    const reza = order(10016, 'رضا احمدی', { estWeightGrams: 1800 });
    const narges = order(10009, 'نرگس احمدی', { ...KARAJ, estWeightGrams: 2000, handedToPostAt: at('1405/07/08', '16:00') });
    expect(listOf(row('احمدی', 'تهران', 1850), [narges, reza])).toEqual({
      candidates: [
        { n: 10016, yes: ['surname', 'city', 'weight', 'day'], no: [], score: 7, blocked: null },
        { n: 10009, yes: ['surname', 'weight'], no: ['city', 'day'], score: 4, blocked: null },
      ],
      preselected: 10016,
    });
  });

  it('محمدی 10019 «در صف چاپ»: شماره، نام، شهر و وزن؛ روز نامعلوم؛ با فایل چاپ و چاپخانه انتخاب‌شده', () => {
    const queued = order(10019, 'زهرا محمدی', { status: 'paid', handedToPostAt: null, estWeightGrams: 520 });
    expect(listOf(row('محمدی 10019', 'تهران', 560), [queued])).toEqual({
      candidates: [{ n: 10019, yes: ['number', 'surname', 'city', 'weight'], no: [], score: 8, blocked: null }],
      preselected: 10019,
    });
    // شاهد: دروازه‌های «شروع چاپ»؛ همان نامزد، بسته و بی انتخاب.
    for (const [over, blocked] of [
      [{ hasPartner: false }, 'needs_partner'],
      [{ printReady: false }, 'needs_print'],
      [{ hasPartner: false, printReady: false }, 'needs_partner'],
    ] as const) {
      const list = listOf(row('محمدی 10019', 'تهران', 560), [{ ...queued, ...over }]);
      expect(list.candidates[0]!.blocked).toBe(blocked);
      expect(list.preselected).toBeNull();
    }
  });

  it('قاسمی 10026 لغوشده: دیده می‌شود ولی بسته است، و انتخاب نمی‌شود', () => {
    const cancelled = order(10026, 'امین قاسمی', { status: 'cancelled', handedToPostAt: null, estWeightGrams: 700 });
    expect(listOf(row('قاسمی 10026', 'تهران', 690), [cancelled])).toMatchObject({
      candidates: [{ n: 10026, score: 8, blocked: 'cancelled' }],
      preselected: null,
    });
  });
});

describe('معیارها و نمره، هر کدام با شاهد', () => {
  it('وزن: تا ۳۰٪ یا ۱۵۰ گرم، هر کدام بیشتر؛ یک گرم بیشتر نه', () => {
    expect([weightFits(1300, 1000), weightFits(1301, 1000), weightFits(700, 1000), weightFits(699, 1000)]).toEqual([true, false, true, false]);
    // بستهٔ سبک: ۱۵۰ گرم از ۳۰٪ بیشتر است.
    expect([weightFits(450, 300), weightFits(451, 300), weightFits(150, 300), weightFits(149, 300)]).toEqual([true, false, true, false]);
  });

  it('روز: «تحویل پست شد» همان روز یا یک روز فاصله؛ دو روز نه؛ هنوز نرسیده به پست نامعلوم؛ پیش از پرداخت «نمی‌خواند»', () => {
    const r = row('رضایی 10014', 'تهران', 900);
    const days = ['1405/07/11', '1405/07/12', '1405/07/13', '1405/07/10', '1405/07/14'].map(
      (handed) => criteriaOf(r, order(10014, 'سارا رضایی', { handedToPostAt: at(handed, '23:50') })).day,
    );
    expect(days).toEqual(['yes', 'yes', 'yes', 'no', 'no']);
    expect(criteriaOf(r, order(10014, 'سارا رضایی', { status: 'printing', handedToPostAt: null })).day).toBeNull();
    expect(criteriaOf(r, order(10014, 'سارا رضایی', { status: 'printing', handedToPostAt: null, paidAt: at('1405/07/13') })).day).toBe('no');
    // همان روز پرداخت بسته به پست رسید: ممکن است.
    expect(criteriaOf(r, order(10014, 'سارا رضایی', { status: 'printing', handedToPostAt: null, paidAt: at('1405/07/12', '09:00') })).day).toBeNull();
  });

  it('شهر: شهر یا استان سفارش «می‌خواند»، جای دیگر «نمی‌خواند»، مقصد ناشناس نامعلوم؛ شماره فقط برای سطر شماره‌دار', () => {
    const o = order(10014, 'سارا رضایی');
    expect(criteriaOf(row('رضایی 10014', 'ورامین', 900), o).city).toBe('yes');
    expect(criteriaOf(row('رضایی 10014', 'اصفهان', 900), o).city).toBe('no');
    expect(criteriaOf(row('رضایی 10014', 'باجه ۱۲', 900), o).city).toBeNull();
    expect(criteriaOf(row('رضایی', 'تهران', 900), o).number).toBeNull();
    expect(criteriaOf(row('رضایی 10099', 'تهران', 900), o).number).toBe('no');
  });

  it('نمره: نام خانوادگی ۳، شماره ۲، شهر ۲، وزن ۱، روز ۱؛ «نمی‌خواند» و نامعلوم صفر', () => {
    expect(scoreOf({ surname: 'yes', number: null, city: null, weight: null, day: null })).toBe(3);
    expect(scoreOf({ surname: 'no', number: 'yes', city: 'yes', weight: 'yes', day: 'yes' })).toBe(6);
    expect(scoreOf({ surname: 'yes', number: 'yes', city: 'yes', weight: 'yes', day: 'yes' })).toBe(9);
  });

  it('قوی: نام خانوادگی و شهر، و از شماره، وزن و روز دست‌کم دو تا', () => {
    const base = { surname: 'yes', city: 'yes', number: 'yes', weight: 'yes', day: null } as const;
    expect(isStrong(base)).toBe(true);
    expect(isStrong({ ...base, weight: 'no' })).toBe(false);
    expect(isStrong({ ...base, surname: 'no' })).toBe(false);
    expect(isStrong({ ...base, city: null })).toBe(false);
    expect(isStrong({ ...base, number: 'no', day: 'yes' })).toBe(true);
  });
});

describe('پنجره و فهرست نامزدها', () => {
  const r = row('رضایی', 'تهران', 900);

  it('پنجرهٔ ۴۵ روزِ پیش از روز پست، نه امروز: روز ۴۵ درون، ۴۶ بیرون؛ پرداخت پس از روز پست نه', () => {
    const paidDaysBefore = (n: number) => new Date(tehranDayStart(SUNDAY, -n).getTime() + 10 * 3_600_000);
    // عدد تصمیم صریح است، نه همان ثابت: جهش ثابت باید این تست را بیندازد.
    expect(CANDIDATE_WINDOW_DAYS).toBe(45);
    const inside = order(10001, 'سارا رضایی', { paidAt: paidDaysBefore(45), handedToPostAt: at('1405/07/12') });
    const outside = order(10002, 'مینا رضایی', { paidAt: paidDaysBefore(46), handedToPostAt: at('1405/07/12') });
    const later = order(10003, 'نگار رضایی', { status: 'printing', handedToPostAt: null, paidAt: at('1405/07/13') });
    expect(listOf(r, [inside, outside, later]).candidates.map((c) => c.n)).toEqual([10001]);
  });

  it('از پنجره فقط «در حال چاپ» و «تحویل پست شد» بی کد، با نامی که می‌خواند', () => {
    const orders = [
      order(10001, 'سارا رضایی', { status: 'paid', handedToPostAt: null }),
      order(10002, 'سارا رضایی', { status: 'cancelled', handedToPostAt: null }),
      order(10003, 'سارا رضایی', { liveShipments: 1 }),
      order(10004, 'سارا کریمی'),
      order(10005, 'سارا رضایی', { status: 'awaiting_payment', paidAt: null, handedToPostAt: null }),
      order(10006, 'سارا رضایی', { status: 'printing', handedToPostAt: null }),
    ];
    expect(listOf(r, orders).candidates.map((c) => c.n)).toEqual([10006]);
    // سفارش همان شماره: «در صف چاپ» و لغوشده هم، ولی نه کددار یا پرداخت‌نشده.
    expect(listOf(row('طاهری 10001', 'تهران', 900), orders).candidates.map((c) => c.n)).toEqual([10001]);
    expect(listOf(row('طاهری 10002', 'تهران', 900), orders).candidates.map((c) => [c.n, c.blocked])).toEqual([[10002, 'cancelled']]);
    expect(listOf(row('طاهری 10003', 'تهران', 900), orders).candidates).toEqual([]);
    expect(listOf(row('طاهری 10005', 'تهران', 900), orders).candidates).toEqual([]);
  });

  it('حداکثر سه، به ترتیب نمره، بعد وزن نزدیک‌تر، بعد شمارهٔ کوچک‌تر؛ سفارش همان شماره همیشه در فهرست', () => {
    // هم‌نمره‌ها: وزن نزدیک‌تر اول، هرچند شماره‌اش بزرگ‌تر است؛ هم‌وزن‌ها به ترتیب شماره.
    const near = order(10012, 'سارا رضایی', { estWeightGrams: 890 });
    const far = order(10010, 'مینا رضایی', { estWeightGrams: 700 });
    const same = order(10011, 'نگار رضایی', { estWeightGrams: 700 });
    const weak = order(10013, 'لیلا رضایی', { ...KARAJ, estWeightGrams: 2000 });
    expect(listOf(r, [weak, same, far, near]).candidates.map((c) => c.n)).toEqual([10012, 10010, 10011]);
    const numbered = order(10050, 'امین قاسمی', { estWeightGrams: 3000, handedToPostAt: at('1405/07/01') });
    expect(listOf(row('رضایی 10050', 'اصفهان', 900), [near, far, same, weak, numbered]).candidates.map((c) => c.n)).toEqual([
      10012, 10010, 10050,
    ]);
  });

  it('هم‌نمره یا دو قوی: هیچ‌کدام از پیش انتخاب نمی‌شود؛ یکی که بیشتر است، انتخاب', () => {
    const a = order(10020, 'رضا احمدی', { estWeightGrams: 900 });
    const b = order(10021, 'سارا احمدی', { estWeightGrams: 900 });
    const two = row('احمدی', 'تهران', 900);
    expect(listOf(two, [a, b]).preselected).toBeNull();
    // شاهد: وزن و روز دومی نمی‌خوانند، پس اولی تنها قوی است و نمره‌اش بیشتر.
    expect(listOf(two, [a, { ...b, estWeightGrams: 2000, handedToPostAt: at('1405/07/05') }]).preselected).toBe(10020);
    // دو قوی با نمرهٔ متفاوت: باز هیچ‌کدام؛ «تنها نامزد قوی» جدا از «نمرهٔ بیشتر» است.
    const numberedTwo = listOf(row('احمدی 10020', 'تهران', 900), [a, b]);
    expect(numberedTwo.candidates.map((c) => [c.n, c.score])).toEqual([[10020, 9], [10021, 7]]);
    expect(numberedTwo.preselected).toBeNull();
    // قوی ولی هم‌نمره با نامزد دیگری که قوی نیست (شهرش نمی‌خواند، شماره می‌خواند): باز هیچ‌کدام.
    const elsewhere = order(10022, 'نرگس احمدی', { ...KARAJ, estWeightGrams: 900 });
    const tie = listOf(row('احمدی 10022', 'تهران', 900), [a, elsewhere]);
    expect(tie.candidates.map((c) => [c.n, c.score])).toEqual([[10020, 7], [10022, 7]]);
    expect(tie.preselected).toBeNull();
  });

  it('سفارشی که کد همین سطر از آن کنار رفت در فهرست می‌ماند ولی از پیش انتخاب نمی‌شود', () => {
    const rezaei = order(10014, 'سارا رضایی', { estWeightGrams: 870 });
    expect(listOf(row('رضایی 10014', 'تهران', 910), [rezaei]).preselected).toBe(10014);
    expect(listOf(row('رضایی 10014', 'تهران', 910), [rezaei], ['o-10014'])).toMatchObject({ candidates: [{ n: 10014 }], preselected: null });
  });

  it('بسته‌ای که پیش از پرداخت به پست رسید، مال این سفارش نیست: بسته و بی انتخاب', () => {
    const late = order(10030, 'زهرا محمدی', { status: 'paid', handedToPostAt: null, paidAt: at('1405/07/13'), estWeightGrams: 560 });
    expect(listOf(row('محمدی 10030', 'تهران', 560), [late])).toMatchObject({
      candidates: [{ n: 10030, blocked: 'before_payment', no: ['day'] }],
      preselected: null,
    });
  });
});
