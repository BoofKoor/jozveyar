/**
 * اطلاعات تماس (برش ۷٫۴): تا اطلاعات واقعی نرسیده هیچ؛ بعد هر راه یک ردیف، به ترتیب طرح، و شماره‌ها پیوند `tel:` بین‌المللی.
 * خود صفحه و پیوندها در `staticPages.test.ts` و `tests/site.spec.ts`.
 */

import { describe, expect, it } from 'vitest';

import { CONTACT, contactRows, telHref, type Contact } from './contact';

const FULL: Contact = {
  mobile: '0912 345 6789',
  phone: '021-12345678',
  email: 'support@example.com',
  hours: 'شنبه تا چهارشنبه، ۹ تا ۱۷',
  address: 'تهران، خیابان نمونه، پلاک ۱',
  postalCode: '1234567890',
};

describe('اطلاعات تماس', () => {
  it('اطلاعات ساختگی روی سایت زنده نمی‌رود: هر مقدار ناتهی است، نه جای‌نگه‌دار طرح و نه نمونهٔ همین تست', () => {
    // تا اطلاعات واقعی صاحب پروژه برسد CONTACT خالی است؛ با رسیدنش این تست جلوی جای‌نگه‌دارهای طرح و نمونه‌ها را می‌گیرد.
    if (CONTACT === null) return;
    const slots = ['موبایل پشتیبانی', 'تلفن ثابت', 'ایمیل', 'روزها و ساعت‌ها', 'نشانی و کد پستی'];
    const fixtures = Object.values(FULL);
    const values = Object.values(CONTACT).filter((value) => value !== undefined);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.trim()).not.toBe('');
      expect(slots).not.toContain(value.trim());
      expect(fixtures).not.toContain(value);
      expect(value).not.toMatch(/@example\.(com|org|net)$/);
    }
  });

  it('شماره به tel: بین‌المللی: موبایل و تلفن ثابت با پیش‌شماره، با فاصله و خط تیره', () => {
    expect(telHref('09123456789')).toBe('tel:+989123456789');
    expect(telHref('0912 345 6789')).toBe('tel:+989123456789');
    expect(telHref('021-12345678')).toBe('tel:+982112345678');
    expect(telHref('+98 21 1234 5678')).toBe('tel:+982112345678');
  });

  it('همهٔ راه‌ها به ترتیب طرح: پیامک و تماس، تلفن، ایمیل، ساعت، نشانی با کد پستی', () => {
    expect(contactRows(FULL)).toEqual([
      { label: 'پیامک و تماس', kind: 'tel', value: '0912 345 6789', href: 'tel:+989123456789' },
      { label: 'تلفن', kind: 'tel', value: '021-12345678', href: 'tel:+982112345678' },
      { label: 'ایمیل', kind: 'email', value: 'support@example.com', href: 'mailto:support@example.com' },
      { label: 'ساعت پاسخ‌گویی', kind: 'text', value: 'شنبه تا چهارشنبه، ۹ تا ۱۷' },
      { label: 'نشانی', kind: 'text', value: 'تهران، خیابان نمونه، پلاک ۱', postalCode: '1234567890' },
    ]);
  });

  it('فقط آنچه هست: ردیف خالی نیست، و کد پستی بی نشانی ردیفی نمی‌سازد', () => {
    expect(contactRows({ mobile: '09123456789' })).toEqual([
      { label: 'پیامک و تماس', kind: 'tel', value: '09123456789', href: 'tel:+989123456789' },
    ]);
    expect(contactRows({ email: 'a@b.ir', address: 'قم' })).toEqual([
      { label: 'ایمیل', kind: 'email', value: 'a@b.ir', href: 'mailto:a@b.ir' },
      { label: 'نشانی', kind: 'text', value: 'قم' },
    ]);
    expect(contactRows({ postalCode: '1234567890' })).toEqual([]);
    expect(contactRows({})).toEqual([]);
  });
});
