/**
 * منطق خالص تنظیمات و کلیدهای پنل (برش ۴٫۶، `settings.ts`): عدد و تاریخ فارسی‌نرمال، تاریخ واقعی تقویم (کبیسه)، تعطیلی
 * تازه فقط آینده و تا پایان سال بعد، نمای تعطیلی‌ها با «حالا»ی طرح، و فقط ۴ نویسهٔ آخر کلید. عددهای تصمیم صریح‌اند، نه از
 * ثابت‌های کد.
 */

import { describe, expect, it } from 'vitest';

import { OFFICIAL_HOLIDAYS } from '@jozveyar/db';
import { formatJalaliNumeric } from '@jozveyar/text';

import type { KeyCheck } from '@jozveyar/db';

import type { Seg } from './orders';
import type { CreditView } from './server/settings';
import {
  creditCard,
  holidaysView,
  jalaliDate,
  keyCheckView,
  keyTail,
  maskText,
  otpCapAlert,
  otpUsageSegs,
  parseJalaliInput,
  parseWholeNumber,
  readHolidayInput,
  readKeyValue,
  sortHolidays,
  templateView,
  untilText,
} from './settings';

/** «حالا»ی طرح: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);

describe('عدد', () => {
  it('ارقام فارسی یا لاتین، با جداکنندهٔ هزارگان یا بی آن؛ فقط عدد صحیح', () => {
    expect(parseWholeNumber('۳')).toBe(3);
    expect(parseWholeNumber(' 300 ')).toBe(300);
    expect(parseWholeNumber('۱٬۰۰۰')).toBe(1000);
    expect(parseWholeNumber('1,500')).toBe(1500);
    for (const bad of ['', '2.5', '-1', 'سه', '1e3', '12345678', null, 3]) expect(parseWholeNumber(bad), String(bad)).toBeNull();
  });
});

describe('تاریخ شمسی', () => {
  it('روز واقعی تقویم: ۳۰ اسفند فقط در سال کبیسه (۱۴۰۳ و ۱۴۰۸ آری، ۱۴۰۴ تا ۱۴۰۷ نه)؛ ۳۱ فقط شش ماه اول', () => {
    expect(formatJalaliNumeric(jalaliDate(1405, 1, 1)!)).toBe('1405/01/01');
    expect(jalaliDate(1405, 1, 1)!.toISOString().slice(0, 10)).toBe('2026-03-21');
    expect(jalaliDate(1406, 1, 1)!.toISOString().slice(0, 10)).toBe('2027-03-21');
    expect(jalaliDate(1407, 1, 1)!.toISOString().slice(0, 10)).toBe('2028-03-20');
    expect(formatJalaliNumeric(jalaliDate(1403, 12, 30)!)).toBe('1403/12/30');
    expect(formatJalaliNumeric(jalaliDate(1408, 12, 30)!)).toBe('1408/12/30');
    for (const year of [1404, 1405, 1406, 1407]) expect(jalaliDate(year, 12, 30), String(year)).toBeNull();
    expect(formatJalaliNumeric(jalaliDate(1405, 6, 31)!)).toBe('1405/06/31');
    expect(jalaliDate(1405, 7, 31)).toBeNull();
    expect(jalaliDate(1405, 13, 1)).toBeNull();
    expect(jalaliDate(1405, 0, 1)).toBeNull();
    // هر روز ۱۴۰۵ و ۱۴۰۶ همان روزی است که روز کاری با آن شمرده می‌شود.
    for (let day = jalaliDate(1405, 1, 1)!; formatJalaliNumeric(day) < '1407/01/01'; day = new Date(day.getTime() + 86_400_000)) {
      const [y, m, d] = formatJalaliNumeric(day).split('/').map(Number);
      expect(jalaliDate(y!, m!, d!)?.getTime()).toBe(day.getTime());
    }
  });

  it('ورودی: ارقام فارسی، «-»، ماه و روز یک‌رقمی؛ شکل دیگر یا روزی که در تقویم نیست نه', () => {
    expect(parseJalaliInput('۱۴۰۶/۴/۱')).toEqual({ date: '1406/04/01' });
    expect(parseJalaliInput(' 1406-03-25 ')).toEqual({ date: '1406/03/25' });
    expect(parseJalaliInput('1406 / 3 / 25')).toEqual({ date: '1406/03/25' });
    for (const bad of ['', '1406/03', '06/03/25', '1406/03/25/1', '۱۴۰۶٫۰۳٫۲۵', 'فردا', null]) {
      expect(parseJalaliInput(bad), String(bad)).toEqual({ error: 'holiday_date_format' });
    }
    expect(parseJalaliInput('1405/12/30')).toEqual({ error: 'holiday_date_invalid' });
    expect(parseJalaliInput('1406/07/31')).toEqual({ error: 'holiday_date_invalid' });
    expect(parseJalaliInput('1406/13/01')).toEqual({ error: 'holiday_date_invalid' });
  });

  it('تعطیلی تازه: فقط بعد از امروز و تا پایان سال بعد، با مناسبت ۱ تا ۱۰۰ نویسهٔ یکدست‌شده', () => {
    expect(readHolidayInput({ date: '1405/07/14', title: ' روز  آزمایش ' }, NOW)).toEqual({ value: { date: '1405/07/14', title: 'روز آزمایش' } });
    expect(readHolidayInput({ date: '1406/12/29', title: 'آخر ۱۴۰۶' }, NOW)).toEqual({ value: { date: '1406/12/29', title: 'آخر 1406' } });
    // امروز (۱۳ مهر)، دیروز، و سال پس از سال بعد
    expect(readHolidayInput({ date: '1405/07/13', title: 'x' }, NOW)).toEqual({ errors: { date: 'holiday_past' } });
    expect(readHolidayInput({ date: '1405/07/12', title: 'x' }, NOW)).toEqual({ errors: { date: 'holiday_past' } });
    expect(readHolidayInput({ date: '1407/01/01', title: 'x' }, NOW)).toEqual({ errors: { date: 'holiday_too_far' } });
    // نیمه‌شب تهران روز را عوض می‌کند: ساعت ۰۰:۰۵ چهاردهم، «۱۴ مهر» دیگر امروز است.
    expect(readHolidayInput({ date: '1405/07/14', title: 'x' }, tehran('2026-10-06 00:05'))).toEqual({ errors: { date: 'holiday_past' } });
    expect(readHolidayInput({ date: '', title: '' }, NOW)).toEqual({ errors: { date: 'holiday_date_format', title: 'holiday_title' } });
    expect(readHolidayInput({ date: '1406/01/05', title: 'ی'.repeat(101) }, NOW)).toEqual({ errors: { title: 'holiday_title' } });
    expect(readHolidayInput({ date: '1406/01/05', title: 'ی'.repeat(100) }, NOW)).toMatchObject({ value: { date: '1406/01/05' } });
    expect(readHolidayInput({ date: '1406/01/05', title: ' ‌ ' }, NOW)).toEqual({ errors: { title: 'holiday_title' } });
  });

  it('نمای تعطیلی‌ها با «حالا»ی طرح: پنج روز نزدیک، «36 روز تا پایان 1406»، گذشته جدا، و هشدار قمری 1406', () => {
    const view = holidaysView(OFFICIAL_HOLIDAYS, 1405, NOW);
    expect(view.upcoming.slice(0, 5).map((h) => h.date)).toEqual(['1405/08/22', '1405/10/02', '1405/10/16', '1405/11/04', '1405/11/22']);
    expect(view.upcoming.slice(0, 5).map((h) => h.title)).toEqual([
      'شهادت حضرت فاطمه زهرا (س)',
      'ولادت امام علی (ع) / روز پدر',
      'مبعث حضرت رسول اکرم (ص)',
      'ولادت حضرت قائم (عج)',
      'پیروزی انقلاب اسلامی',
    ]);
    expect(view.upcoming).toHaveLength(36);
    expect(view.lastYear).toBe(1406);
    expect(view.past).toHaveLength(17);
    expect(view.past[0]!.date).toBe('1405/06/08');
    expect(view.unconfirmedYear).toBe(1406);
    expect(view.missingYear).toBeNull();
    expect(view.maxYear).toBe(1406);
    // تطبیق‌داده‌شده تا ۱۴۰۶: هشداری نیست.
    expect(holidaysView(OFFICIAL_HOLIDAYS, 1406, NOW).unconfirmedYear).toBeNull();
    // امروزِ تعطیل هنوز «نزدیک» است.
    expect(holidaysView(OFFICIAL_HOLIDAYS, 1405, tehran('2026-11-13 10:00')).upcoming[0]!.date).toBe('1405/08/22');
  });

  it('از بهمن، نبودن تعطیلی‌های سال بعد هشدار است؛ پیش از بهمن، یا با روزی از سال بعد، نه', () => {
    const only1405 = OFFICIAL_HOLIDAYS.filter((h) => h.date.startsWith('1405/'));
    expect(holidaysView(only1405, 1405, tehran('2027-01-20 23:55')).missingYear).toBeNull(); // 30 دی
    expect(holidaysView(only1405, 1405, tehran('2027-01-21 00:05')).missingYear).toBe(1406); // 1 بهمن
    expect(holidaysView(only1405, 1405, tehran('2027-03-20 10:00')).missingYear).toBe(1406); // 29 اسفند
    expect(holidaysView(OFFICIAL_HOLIDAYS, 1405, tehran('2027-01-21 10:00')).missingYear).toBeNull();
  });

  it('مرتب به تاریخ، هر ترتیبی که آمده باشد', () => {
    expect(sortHolidays([{ date: '1406/01/02', title: 'b' }, { date: '1405/12/29', title: 'a' }, { date: '1406/01/01', title: 'c' }]).map((h) => h.date)).toEqual([
      '1405/12/29',
      '1406/01/01',
      '1406/01/02',
    ]);
  });
});

describe('کلید', () => {
  it('مقدار: ارقام لاتین و بی فاصلهٔ دو سر، وگرنه عیناً؛ ۱ تا ۵۱۲ نویسهٔ دیدنی ASCII بی فاصله', () => {
    expect(readKeyValue('  AbC-123_x=\n')).toBe('AbC-123_x=');
    expect(readKeyValue('۱۲۳abc')).toBe('123abc');
    expect(readKeyValue('zibal')).toBe('zibal');
    expect(readKeyValue('x'.repeat(512))).toHaveLength(512);
    for (const bad of ['', '   ', 'ab cd', 'کلید', 'x'.repeat(513), 'ab\tcd', null, 42]) expect(readKeyValue(bad), String(bad)).toBeNull();
  });

  it('فقط ۴ نویسهٔ آخر، و فقط برای کلید دست‌کم ۸ نویسه‌ای؛ نقطه‌ها مثل طرح', () => {
    expect(keyTail('abcdefgh3f9a')).toBe('3f9a');
    expect(keyTail('abcdefgh')).toBe('efgh');
    expect(keyTail('abcdefg')).toBeNull();
    expect(keyTail('zibal')).toBeNull();
    expect(maskText(8, '3f9a')).toBe('••••••••3f9a');
    expect(maskText(4, 'c2d8')).toBe('••••c2d8');
    expect(maskText(4, null)).toBe('••••');
  });
});

/** متن سادهٔ تکه‌ها، برای سنجش؛ عدد با نشان [..] تا جای `.num` هم سنجیده شود. */
const plain = (segs: readonly Seg[]) => segs.map((seg) => (typeof seg === 'string' ? seg : 'num' in seg ? `[${seg.num}]` : '')).join('');

describe('آزمایش کلیدها، متن قالب و اعتبار (۷٫۱)', () => {
  it('متن قالب از همان یک منبع پیامک: سطرها، جای پارامتر #NAME#، و نام پارامترها به ترتیب', () => {
    expect(templateView('otp')).toEqual({ lines: [['کد تأیید جزوه‌یار: ', { mark: '#CODE#' }], ['این کد را به کسی نده.']], params: ['CODE'] });
    expect(templateView('order_paid')).toEqual({
      lines: [['جزوه‌یار: سفارش ', { mark: '#ORDER#' }, ' پرداخت شد؛ تحویل به پست تا ', { mark: '#DAY#' }]],
      params: ['ORDER', 'DAY'],
    });
    expect(templateView('tracking').params).toEqual(['ORDER', 'BARCODE']);
  });

  const check = (over: Partial<KeyCheck> & { detail: Record<string, unknown> }): KeyCheck => ({
    name: 'SMS_API_KEY',
    action: 'settings.key_test',
    at: tehran('2026-10-05 10:52'),
    adminName: 'سارا',
    ...over,
  });

  it('خط آخرین آزمایش: درست با اعتبار یا موبایل پوشیده، رد شد با کد بدنه (وگرنه HTTP)، در دسترس نیست، کلید API خالی', () => {
    const view = (c: KeyCheck) => {
      const v = keyCheckView(c.name, c, NOW);
      return v && { tone: v.tone, text: plain(v.text) };
    };
    expect(view(check({ detail: { subject: 'current', outcome: 'ok', credit: 184_200 } }))).toEqual({
      tone: 'ok',
      text: 'درست · آزمایش امروز 10:52: sms.ir پذیرفت، اعتبار [184,200].',
    });
    expect(view(check({ name: 'SMS_OTP_TEMPLATE', at: tehran('2026-10-05 10:47'), detail: { outcome: 'ok', mobile: '0912 ••• 6789' } }))).toEqual({
      tone: 'ok',
      text: 'درست · پیامک آزمایشی امروز 10:47 به [0912 ••• 6789] رفت.',
    });
    expect(view(check({ detail: { outcome: 'rejected', http: 400, status: 105 } }))?.text).toBe('رد شد · آزمایش امروز 10:52: sms.ir نپذیرفت (کد [105]).');
    expect(view(check({ detail: { outcome: 'rejected', http: 401 } }))).toEqual({ tone: 'bad', text: 'رد شد · آزمایش امروز 10:52: sms.ir نپذیرفت (کد [401]).' });
    expect(view(check({ detail: { outcome: 'unavailable' } }))).toEqual({ tone: 'warn', text: 'در دسترس نیست · آزمایش امروز 10:52: sms.ir جواب نداد.' });
    expect(view(check({ name: 'SMS_PAID_TEMPLATE', detail: { outcome: 'unconfigured' } }))?.tone).toBe('warn');
  });

  it('خط پس از ذخیره: آزموده پیش از ذخیره درست، «بی آزمایش ذخیره شد» هشدار؛ بی آزمایش (پیش از ۷٫۱، کد پذیرنده) و برگرداندن بی خط', () => {
    const view = (c: KeyCheck) => {
      const v = keyCheckView(c.name, c, NOW);
      return v && { tone: v.tone, text: plain(v.text) };
    };
    expect(view(check({ action: 'settings.key_set', detail: { from: 'env', tested: 'ok', credit: 5000 } }))).toEqual({
      tone: 'ok',
      text: 'درست · پیش از ذخیرهٔ امروز 10:52 sms.ir پذیرفت، اعتبار [5,000].',
    });
    expect(view(check({ name: 'SMS_OTP_TEMPLATE', action: 'settings.key_set', detail: { tested: 'ok' } }))?.text).toBe(
      'درست · پیش از ذخیرهٔ امروز 10:52 پیامک آزمایشی رفت.',
    );
    expect(view(check({ action: 'settings.key_set', detail: { tested: 'skipped' } }))?.tone).toBe('warn');
    expect(view(check({ name: 'PAYMENT_MERCHANT_ID', action: 'settings.key_set', detail: { from: 'empty' } }))).toBeNull();
    expect(view(check({ action: 'settings.key_revert', detail: { to: 'env' } }))).toBeNull();
    expect(keyCheckView('SMS_API_KEY', null, NOW)).toBeNull();
  });

  it('کارت اعتبار: عدد خود sms.ir بی «تومان»، کی و از کجا، «برای حدود N روز» یا چرا نه، و یادداشت وقتی عددی نیست', () => {
    const week = { cost: 56_000, count: 518 };
    const at = tehran('2026-10-05 11:20');
    const card = (view: CreditView) => {
      const c = creditCard(view, NOW);
      return { meta: c.meta, amount: c.amount, usage: c.usage && plain(c.usage), note: c.note && { tone: c.note.tone, text: plain(c.note.text) } };
    };
    expect(card({ state: 'ok', credit: 184_200, at, live: true, days: 23, week })).toEqual({
      meta: 'sms.ir، ساعت 11:20',
      amount: '184,200',
      usage: 'برای حدود [23] روز با مصرف هفتهٔ گذشته ([518] پیامک).',
      note: null,
    });
    expect(card({ state: 'ok', credit: 900, at, live: false, days: null, week: { cost: 0, count: 0 } })).toMatchObject({
      meta: 'آخرین «آزمایش» کلید API، ساعت 11:20',
      amount: '900',
      usage: 'هفتهٔ گذشته پیامکی با sms.ir نرفت؛ روزهای باقی‌مانده با اولین پیامک‌ها حساب می‌شود.',
    });
    expect(card({ state: 'rejected', at, live: true, http: 401 })).toMatchObject({ amount: null, note: { tone: 'error', text: expect.stringContaining('(کد [401])') } });
    expect(card({ state: 'unavailable', at, live: true, http: null }).note?.tone).toBe('warning');
    expect(card({ state: 'unconfigured' })).toMatchObject({ meta: null, amount: null, note: { tone: 'info' } });
    expect(card({ state: 'untested' })).toMatchObject({ meta: null, amount: null, note: { tone: 'info' } });
    expect(JSON.stringify(creditCard({ state: 'ok', credit: 1, at, live: true, days: 1, week }, NOW))).not.toContain('تومان');
  });

  it('شمار کد و سقف پرشده: «تا حدود»، فردا اگر روز دیگر است؛ و «امروز پر شد» پس از باز شدن', () => {
    expect(plain(otpUsageSegs({ hour: 18, day: 312 }))).toBe('ساعت گذشته [18] کد · [24] ساعت گذشته [312] کد');
    expect(untilText(tehran('2026-10-05 13:05'), NOW)).toBe('13:05');
    expect(untilText(tehran('2026-10-06 09:40'), NOW)).toBe('فردا 09:40');
    const day = otpCapAlert({ kind: 'day', limit: 2000, at: tehran('2026-10-05 10:40'), until: tehran('2026-10-05 13:05') }, NOW);
    expect({ tone: day.tone, head: day.head, text: plain(day.text) }).toEqual({
      tone: 'warning',
      head: 'سقف کد پیامکی کل سایت پر شد:',
      text: ' [2,000] کد در [24] ساعت گذشته، از [10:40]. تا حدود [13:05] به هیچ شماره‌ای کد تازه نمی‌رود.',
    });
    const hour = otpCapAlert({ kind: 'hour', limit: 300, at: tehran('2026-10-05 09:10'), until: null }, NOW);
    expect({ tone: hour.tone, text: plain(hour.text) }).toEqual({ tone: 'info', text: ' [300] کد در یک ساعت، از [09:10]؛ حالا دوباره کد می‌رود.' });
  });
});
