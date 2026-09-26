import { describe, expect, it } from 'vitest';
import {
  bytesParts,
  extractOrderCodeFromRecipient,
  formatBytes,
  formatDeadlineDay,
  formatJalaliNumeric,
  formatJalaliWeekday,
  formatNumber,
  formatPages,
  formatTomans,
  formatWeight,
  isWorkingDay,
  jalaliYear,
  normalizeFa,
  postHandoffDue,
  recipientSurname,
  rialsToTomans,
  toLatinDigits,
  tomansToRials,
  unifyLetters,
  weightParts,
} from './index.js';
import { normalizeIranMobile, tidyInputFa } from './input.js';

describe('toLatinDigits', () => {
  it('ارقام فارسی را تبدیل می‌کند', () => {
    expect(toLatinDigits('۱۴۷')).toBe('147');
    expect(toLatinDigits('۱۴۰۵/۰۶/۲۲')).toBe('1405/06/22');
  });

  it('ارقام عربی را تبدیل می‌کند', () => {
    expect(toLatinDigits('٦٠٩٨')).toBe('6098');
  });

  it('متن غیرعددی را دست نمی‌زند', () => {
    expect(toLatinDigits('صفحه')).toBe('صفحه');
  });
});

describe('unifyLetters', () => {
  it('ي عربی را به ی فارسی تبدیل می‌کند', () => {
    expect(unifyLetters('ميردريكوندي')).toBe('میردریکوندی');
  });

  it('ك عربی را به ک فارسی تبدیل می‌کند', () => {
    expect(unifyLetters('كاظمي')).toBe('کاظمی');
  });

  it('همزه و آ را به الف ساده می‌برد', () => {
    expect(unifyLetters('أحمد')).toBe('احمد');
    expect(unifyLetters('آرمند')).toBe('ارمند');
  });
});

describe('normalizeFa', () => {
  it('دو املای یک نام را یکسان می‌کند', () => {
    expect(normalizeFa('ميردريكوندي')).toBe(normalizeFa('میردریکوندی'));
  });

  it('نیم‌فاصله و فاصلهٔ صفر را حذف می‌کند', () => {
    expect(normalizeFa('بیک‌زاده')).toBe('بیک زاده');
  });

  it('فاصله‌های تکراری را یکی می‌کند', () => {
    expect(normalizeFa('  بیک   زاده  ')).toBe('بیک زاده');
  });

  it('علامت جهت‌دهی نامرئی را پاک می‌کند', () => {
    expect(normalizeFa('‎طهماسبی‏')).toBe('طهماسبی');
  });
});

describe('tidyInputFa — نشانی و نام گیرنده، برای چاپ روی برچسب پست', () => {
  it('ي و ك عربی فارسی می‌شوند و ارقام لاتین', () => {
    expect(tidyInputFa('مشهد، بلوار وكيل‌آباد ۱۲، پلاک ٢٤')).toBe('مشهد، بلوار وکیل‌آباد 12، پلاک 24');
  });

  it('«آ»، همزه و نیم‌فاصله دست نمی‌خورند — برخلاف normalizeFa که برای مقایسه است', () => {
    expect(tidyInputFa('وکیل‌آباد، مؤسسهٔ آموزش')).toBe('وکیل‌آباد، مؤسسهٔ آموزش');
    expect(normalizeFa('وکیل‌آباد')).toBe('وکیل اباد');
  });

  it('خط تازه و فاصلهٔ تکراری و فاصلهٔ نشکن یک فاصله می‌شوند', () => {
    expect(tidyInputFa('  تهران،\n  خیابان\u00A0ولیعصر\t پلاک 3  ')).toBe('تهران، خیابان ولیعصر پلاک 3');
  });

  it('نامرئی‌ها پاک می‌شوند؛ نیم‌فاصلهٔ کنار فاصله یا تکراری هم', () => {
    expect(tidyInputFa('\u200Eسارا\u200F \u200Bاحمدی\uFEFF')).toBe('سارا احمدی');
    expect(tidyInputFa('می\u200C\u200Cروم')).toBe('می\u200Cروم');
    expect(tidyInputFa('وکیل\u200C آباد')).toBe('وکیل آباد');
    expect(tidyInputFa('\u200Cسارا\u200C')).toBe('سارا');
  });
});

describe('extractOrderCodeFromRecipient — دادهٔ واقعی فایل پست', () => {
  // این ده مقدار عیناً از FileName-1954.xls آمده‌اند.
  const realRows: [string, number][] = [
    ['عیسوند 6080', 6080],
    ['آرمند 6082', 6082],
    ['بیک زاده 6098', 6098],
    ['جابری 6079', 6079],
    ['صبوری 6086', 6086],
    ['رضانژاد 6097', 6097],
    ['خانی 6004', 6004],
    ['بابازاده 6089', 6089],
    ['جعفری زاده 6093', 6093],
    ['ابراهیمی 6095', 6095],
  ];

  it.each(realRows)('«%s» → %i', (input, expected) => {
    expect(extractOrderCodeFromRecipient(input)).toBe(expected);
  });

  it('نام خانوادگی چندکلمه‌ای را نمی‌شکند', () => {
    expect(extractOrderCodeFromRecipient('بیک زاده 6098')).toBe(6098);
    expect(recipientSurname('بیک زاده 6098')).toBe('بیک زاده');
  });

  it('ارقام فارسی را هم می‌خواند', () => {
    expect(extractOrderCodeFromRecipient('طهماسبی ۶۰۸۰')).toBe(6080);
  });

  it('نام بدون کد null می‌دهد', () => {
    expect(extractOrderCodeFromRecipient('طهماسبی')).toBeNull();
  });

  it('ردیف جمع کل کد ندارد', () => {
    expect(extractOrderCodeFromRecipient('جمع کل')).toBeNull();
    expect(extractOrderCodeFromRecipient('')).toBeNull();
  });

  it('عدد داخل نام را برنمی‌دارد — فقط انتهای رشته', () => {
    expect(extractOrderCodeFromRecipient('6080 عیسوند')).toBeNull();
  });

  it('عدد چسبیده به حرف را برنمی‌دارد', () => {
    expect(extractOrderCodeFromRecipient('پلاک12')).toBeNull();
  });

  it('عدد کمتر از سه رقم را کد نمی‌شمارد', () => {
    expect(extractOrderCodeFromRecipient('احمدی 12')).toBeNull();
  });
});

describe('normalizeIranMobile', () => {
  it.each([
    ['09123456789', '09123456789'],
    ['9123456789', '09123456789'],
    ['+989123456789', '09123456789'],
    ['00989123456789', '09123456789'],
    ['989123456789', '09123456789'],
    ['0912 345 6789', '09123456789'],
    ['0912-345-6789', '09123456789'],
    ['۰۹۱۲۳۴۵۶۷۸۹', '09123456789'],
  ])('«%s» → %s', (input, expected) => {
    expect(normalizeIranMobile(input)).toBe(expected);
  });

  it.each([
    ['02112345678'], // تلفن ثابت
    ['0912345678'], // یک رقم کم
    ['091234567890'], // یک رقم زیاد
    ['abcdefg'],
    [''],
  ])('«%s» نامعتبر است', (input) => {
    expect(normalizeIranMobile(input)).toBeNull();
  });
});

describe('پول — ریال ذخیره، تومان نمایش', () => {
  it('ریال به تومان', () => {
    expect(rialsToTomans(2_352_000)).toBe(235_200);
  });

  it('تومان به ریال', () => {
    expect(tomansToRials(235_200)).toBe(2_352_000);
  });

  it('رفت و برگشت مقدار را نگه می‌دارد', () => {
    for (const tomans of [0, 1, 45_000, 137_750, 417_950]) {
      expect(rialsToTomans(tomansToRials(tomans))).toBe(tomans);
    }
  });

  it('نمایش با ارقام لاتین و جداکنندهٔ هزارگان', () => {
    expect(formatTomans(2_352_000)).toBe('235,200 تومان');
    expect(formatTomans(4_179_500)).toBe('417,950 تومان');
    expect(formatTomans(450_000, false)).toBe('45,000');
  });

  it('هیچ رقم فارسی در خروجی نیست', () => {
    expect(formatTomans(4_179_500)).not.toMatch(/[۰-۹]/);
    expect(formatNumber(147)).toBe('147');
  });
});

describe('formatWeight', () => {
  it('زیر یک کیلو، گرم', () => {
    expect(formatWeight(529)).toBe('529 گرم');
  });

  it('بالای یک کیلو، کیلوگرم با یک رقم اعشار', () => {
    expect(formatWeight(2_400)).toBe('2.4 کیلوگرم');
  });

  it('بالای ده کیلو، بدون اعشار', () => {
    expect(formatWeight(19_180)).toBe('19 کیلوگرم');
  });
});

describe('formatBytes', () => {
  it('واحد مناسب انتخاب می‌کند', () => {
    expect(formatBytes(512)).toBe('512 بایت');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 مگابایت');
    expect(formatBytes(Math.round(1.5 * 1024 ** 3))).toBe('1.5 گیگابایت');
  });
});

/** رابط عدد را در span خودش ایزوله می‌کند؛ واحد فارسی بیرون می‌ماند (docs/UI.md، کارت «جزوهٔ تو»). */
describe('عدد و واحد، جدا', () => {
  it('حجم: عدد فقط رقم و نقطه است، واحد فقط حرف فارسی', () => {
    expect(bytesParts(512)).toEqual({ value: '512', unit: 'بایت' });
    expect(bytesParts(14 * 1024)).toEqual({ value: '14', unit: 'کیلوبایت' });
    expect(bytesParts(Math.round(2.4 * 1024 ** 2))).toEqual({ value: '2.4', unit: 'مگابایت' });
    expect(bytesParts(Math.round(1.5 * 1024 ** 3))).toEqual({ value: '1.5', unit: 'گیگابایت' });
  });

  it('وزن: همان مرزهای formatWeight', () => {
    expect(weightParts(529)).toEqual({ value: '529', unit: 'گرم' });
    expect(weightParts(2_400)).toEqual({ value: '2.4', unit: 'کیلوگرم' });
    expect(weightParts(19_180)).toEqual({ value: '19', unit: 'کیلوگرم' });
  });

  it('متن کامل همان جمع دو تکه است', () => {
    for (const bytes of [0, 1023, 1024, 14_336, 5 * 1024 ** 2, 3 * 1024 ** 3]) {
      const { value, unit } = bytesParts(bytes);
      expect(formatBytes(bytes)).toBe(`${value} ${unit}`);
      expect(value).toMatch(/^[\d.]+$/);
    }
    for (const grams of [0, 185, 999, 1_000, 12_345]) {
      const { value, unit } = weightParts(grams);
      expect(formatWeight(grams)).toBe(`${value} ${unit}`);
      expect(value).toMatch(/^[\d.,]+$/);
    }
  });
});

describe('formatPages — شمارهٔ صفحه در هشدار', () => {
  it('یک صفحه و چند صفحه', () => {
    expect(formatPages([2])).toBe('صفحهٔ 2');
    expect(formatPages([12, 3, 7])).toBe('صفحه‌های 3، 7 و 12');
    expect(formatPages([1, 2])).toBe('صفحه‌های 1 و 2');
  });

  it('بازهٔ پشت‌سرهم کوتاه می‌شود', () => {
    expect(formatPages([1, 2, 3, 4, 5, 6])).toBe('صفحه‌های 1 تا 6');
    expect(formatPages([1, 2, 3, 10, 11, 52])).toBe('صفحه‌های 1 تا 3، 10، 11 و 52');
  });

  it('فهرست بلند با «صفحهٔ دیگر» تمام می‌شود، با شمار درست', () => {
    const pages = [1, 3, 5, 7, 9, 11, 13, 20, 21, 22, 40];
    expect(formatPages(pages)).toBe('صفحه‌های 1، 3، 5، 7، 9، 11 و 5 صفحهٔ دیگر');
    expect(formatPages([1000, 2000], 1)).toBe('صفحه‌های 1,000 و 1 صفحهٔ دیگر');
  });

  it('تکراری و خالی', () => {
    expect(formatPages([4, 4])).toBe('صفحهٔ 4');
    expect(formatPages([])).toBe('');
  });
});

describe('تاریخ شمسی', () => {
  it('شکل عددی مثل فایل پست می‌دهد', () => {
    // ۱۴۰۵/۰۶/۲۲ برابر ۱۳ سپتامبر ۲۰۲۶ است.
    const out = formatJalaliNumeric(new Date('2026-09-13T12:00:00Z'));
    expect(out).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(out.startsWith('1405/')).toBe(true);
  });

  it('خروجی ارقام لاتین است', () => {
    expect(formatJalaliNumeric(new Date('2026-09-13T12:00:00Z'))).not.toMatch(/[۰-۹]/);
  });

  it('سال شمسی به وقت تهران عوض می‌شود، نه UTC', () => {
    expect(jalaliYear(new Date('2026-09-24T12:00:00Z'))).toBe(1405);
    // نیمه‌شب نوروز ۱۴۰۵ در تهران ساعت ۲۰:۳۰ UTC روز ۲۰ مارس است.
    expect(jalaliYear(new Date('2026-03-20T20:00:00Z'))).toBe(1404);
    expect(jalaliYear(new Date('2026-03-20T20:40:00Z'))).toBe(1405);
  });
});

describe('روز کاری و مهلت تحویل به پست (ADR-013)', () => {
  /** لحظه‌ای به ساعت تهران: `tehran('2026-09-26 10:00')`. تهران از ۱۴۰۱ ساعت تابستانی ندارد: +۳:۳۰. */
  const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);
  const none = new Set<string>();

  it('روز هفته و تاریخ بی سال: «شنبه 4 مهر»', () => {
    expect(formatJalaliWeekday(tehran('2026-09-26 10:00'))).toBe('شنبه 4 مهر');
    // نیمه‌شب تهران روز را عوض می‌کند، نه نیمه‌شب UTC.
    expect(formatJalaliWeekday(tehran('2026-09-26 23:59'))).toBe('شنبه 4 مهر');
    expect(formatJalaliWeekday(tehran('2026-09-27 00:01'))).toBe('یکشنبه 5 مهر');
  });

  it('شنبه تا چهارشنبه کاری است؛ پنجشنبه و جمعه نه', () => {
    const days = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
    expect(days.map((d) => isWorkingDay(tehran(`${d} 12:00`), none))).toEqual([true, true, true, true, true, false, false]);
  });

  it('پرداخت شنبه با ۲ روز: تا پایان دوشنبه، همان مثال طرح', () => {
    const due = postHandoffDue(tehran('2026-09-26 10:00'), 2, none);
    // پایان دوشنبه ۶ مهر = نیمه‌شب آغاز سه‌شنبه به وقت تهران.
    expect(due.toISOString()).toBe(tehran('2026-09-29 00:00').toISOString());
    expect(formatDeadlineDay(due)).toBe('دوشنبه 6 مهر');
  });

  it('ساعت پرداخت در روزش اثری ندارد، و نیمه‌شب تهران روز را عوض می‌کند', () => {
    expect(postHandoffDue(tehran('2026-09-26 00:00'), 2, none)).toEqual(postHandoffDue(tehran('2026-09-26 23:59'), 2, none));
    // ۰۰:۱۰ یکشنبه به وقت تهران هنوز شنبه است به وقت UTC.
    expect(formatDeadlineDay(postHandoffDue(tehran('2026-09-27 00:10'), 2, none))).toBe('سه‌شنبه 7 مهر');
  });

  it('پرداخت چهارشنبه، پنجشنبه یا جمعه: پنجشنبه و جمعه شمرده نمی‌شوند', () => {
    for (const paid of ['2026-09-30 11:00', '2026-10-01 11:00', '2026-10-02 11:00']) {
      expect(formatDeadlineDay(postHandoffDue(tehran(paid), 2, none)), paid).toBe('یکشنبه 12 مهر');
    }
  });

  it('تعطیلی رسمی روز کاری نیست', () => {
    // دوشنبه ۳۰ آذر: سه‌شنبه کاری، چهارشنبه ۲ دی ولادت امام علی، بعد پنجشنبه و جمعه، بعد شنبه.
    const paid = tehran('2026-12-21 09:00');
    expect(formatDeadlineDay(postHandoffDue(paid, 2, none))).toBe('چهارشنبه 2 دی');
    expect(formatDeadlineDay(postHandoffDue(paid, 2, new Set(['1405/10/02'])))).toBe('شنبه 5 دی');
  });

  it('روز کاری صفر، منفی یا کسری پذیرفته نمی‌شود', () => {
    expect(() => postHandoffDue(new Date(), 0, none)).toThrow(RangeError);
    expect(() => postHandoffDue(new Date(), 1.5, none)).toThrow(RangeError);
  });
});
