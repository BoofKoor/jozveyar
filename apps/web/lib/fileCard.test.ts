import { describe, expect, it } from 'vitest';
import { paperSizeName } from '@jozveyar/analysis';
import { formatNumber } from '@jozveyar/text';
import { colorHint, paperSizeLabel, type ColorHintInput, type Sentence } from './fileCard';

/** جمله به شکل متن ساده — همان متنی که ConfigPanel روی صفحه می‌نشاند. */
const sentenceText = ({ lead, count, rest }: Sentence) =>
  count === null ? lead : `${lead}${formatNumber(count)}${rest}`;

describe('اندازهٔ کاغذ در کارت', () => {
  it('اندازهٔ استاندارد با نام خودش', () => {
    expect(paperSizeLabel(paperSizeName(595, 842))).toEqual({ name: 'A4' });
    expect(paperSizeLabel(paperSizeName(842, 595))).toEqual({ name: 'A4' });
    expect(paperSizeLabel(paperSizeName(612, 792))).toEqual({ name: 'Letter' });
  });

  it('اندازهٔ بی‌نام به میلی‌متر، نه پوینت: ۴۸۲×۶۸۰ پوینت همان ۱۷۰×۲۴۰ میلی‌متر است', () => {
    // کلید همان است که مرورگر و سرور می‌سازند؛ فقط نمایش عوض می‌شود.
    expect(paperSizeName(482, 680)).toBe('482×680pt');
    expect(paperSizeLabel('482×680pt')).toEqual({ mm: '170×240' });
    // افقی هم ضلع کوتاه اول (کلید خودش این را تضمین می‌کند).
    expect(paperSizeLabel(paperSizeName(680, 482))).toEqual({ mm: '170×240' });
    // اسلاید ۱۶:۹ پاورپوینت: ۵۴۰×۹۶۰ پوینت.
    expect(paperSizeLabel('540×960pt')).toEqual({ mm: '191×339' });
  });

  it('چیز دیگری را میلی‌متر نمی‌کند', () => {
    expect(paperSizeLabel('Legal')).toEqual({ name: 'Legal' });
    expect(paperSizeLabel('482×680')).toEqual({ name: '482×680' });
  });
});

describe('راهنمای «رنگ چاپ»', () => {
  const base: ColorHintInput = { colorPages: 0, unknown: false, pending: false, estimated: false, jozve: false };
  const text = (input: Partial<ColorHintInput>) => sentenceText(colorHint({ ...base, ...input }));

  it('وسط بررسی حکم قطعی نمی‌دهد', () => {
    expect(text({ pending: true })).toBe('تا اینجا صفحهٔ رنگی‌ای پیدا نشد.');
    expect(text({ pending: true, colorPages: 3 })).toBe('تا اینجا 3 صفحهٔ رنگی در فایل پیدا شد.');
    expect(text({ pending: true, colorPages: 3, jozve: true })).toBe(
      'تا اینجا 3 صفحهٔ رنگی در فایل‌های این جزوه پیدا شد.',
    );
    for (const input of [{ pending: true }, { pending: true, jozve: true }]) {
      expect(text(input)).not.toContain('تماماً');
    }
  });

  it('بعد از بررسی همهٔ صفحه‌ها', () => {
    expect(text({})).toBe('فایل تماماً سیاه‌سفید است.');
    expect(text({ jozve: true })).toBe('همهٔ فایل‌ها تماماً سیاه‌سفیدند.');
    expect(text({ colorPages: 3 })).toBe(
      '3 صفحهٔ رنگی در فایل پیدا شد. اگر سیاه‌سفید انتخاب کنی، این صفحه‌ها هم سیاه‌سفید چاپ می‌شوند.',
    );
    expect(text({ colorPages: 1_200, jozve: true })).toBe(
      '1,200 صفحهٔ رنگی در فایل‌های این جزوه پیدا شد. اگر سیاه‌سفید انتخاب کنی، این صفحه‌ها هم سیاه‌سفید چاپ می‌شوند.',
    );
  });

  it('سند نمونه‌برداری‌شده برآورد است، نه شمارش', () => {
    expect(text({ estimated: true, colorPages: 40 })).toMatch(/^حدود 40 صفحهٔ رنگی در فایل پیدا شد\./);
    expect(text({ estimated: true, pending: true, colorPages: 40 })).toBe('تا اینجا حدود 40 صفحهٔ رنگی در فایل پیدا شد.');
    expect(text({ estimated: true })).toBe('در صفحه‌هایی که بررسی شد صفحهٔ رنگی‌ای پیدا نشد.');
    expect(text({ estimated: true })).not.toContain('تماماً');
  });

  it('Word و عکس پیش از سرور: رنگ هنوز معلوم نیست', () => {
    for (const input of [{ unknown: true }, { unknown: true, pending: true }, { unknown: true, jozve: true }]) {
      expect(text(input)).toBe('رنگی بودن صفحه‌ها بعد از بررسی روی سرور معلوم می‌شود.');
    }
  });

  it('عدد جدا از متن است، تا فقط خودش در span ایزوله شود', () => {
    const hint = colorHint({ ...base, colorPages: 3 });
    expect(hint.count).toBe(3);
    expect(hint.lead).not.toMatch(/\d/);
    expect(hint.rest).not.toMatch(/\d/);
    expect(colorHint(base).count).toBeNull();
  });
});
