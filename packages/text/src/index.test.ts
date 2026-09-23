import { describe, expect, it } from 'vitest';
import {
  extractOrderCodeFromRecipient,
  formatBytes,
  formatJalaliNumeric,
  formatNumber,
  formatPages,
  formatTomans,
  formatWeight,
  normalizeFa,
  normalizeIranMobile,
  recipientSurname,
  rialsToTomans,
  toLatinDigits,
  tomansToRials,
  unifyLetters,
} from './index.js';

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
});
