import { describe, expect, it } from 'vitest';

import { checkRecipient } from './recipient';

const ok = { name: 'سارا احمدی', addressText: 'بلوار وکیل‌آباد، پلاک 24', postalCode: null };

describe('checkRecipient', () => {
  it('نام و نشانی را نرمال می‌کند؛ «آ» و نیم‌فاصله می‌مانند، ارقام لاتین می‌شوند', () => {
    const { value, fields } = checkRecipient({
      name: '  سارا  احمدي ',
      addressText: 'بلوار وکیل‌آباد، وکیل‌آباد ۱۲، پلاک ۲۴',
      postalCode: null,
    });
    expect(fields).toEqual([]);
    expect(value).toEqual({ name: 'سارا احمدی', addressText: 'بلوار وکیل‌آباد، وکیل‌آباد 12، پلاک 24', postalCode: null });
  });

  it('کد پستی: ده رقم، با ارقام فارسی و فاصله و خط تیره؛ خالی یعنی null', () => {
    expect(checkRecipient({ ...ok, postalCode: '۹۱۸۹۹-۱۴۳۶۵' }).value.postalCode).toBe('9189914365');
    expect(checkRecipient({ ...ok, postalCode: '91899 14365' }).fields).toEqual([]);
    expect(checkRecipient({ ...ok, postalCode: '   ' }).value.postalCode).toBeNull();
    expect(checkRecipient({ ...ok, postalCode: '' }).fields).toEqual([]);
    expect(checkRecipient({ ...ok, postalCode: '12345' }).fields).toEqual(['recipient.postalCode']);
    expect(checkRecipient({ ...ok, postalCode: '12345678901' }).fields).toEqual(['recipient.postalCode']);
    expect(checkRecipient({ ...ok, postalCode: '91899a4365' }).fields).toEqual(['recipient.postalCode']);
  });

  it('نام ۲ تا ۱۰۰ نویسه و نشانی ۱۰ تا ۵۰۰، بعد از نرمال‌سازی', () => {
    expect(checkRecipient({ ...ok, name: 'سا' }).fields).toEqual([]);
    expect(checkRecipient({ ...ok, name: ' س ' }).fields).toEqual(['recipient.name']);
    expect(checkRecipient({ ...ok, name: 'س'.repeat(100) }).fields).toEqual([]);
    expect(checkRecipient({ ...ok, name: 'س'.repeat(101) }).fields).toEqual(['recipient.name']);
    expect(checkRecipient({ ...ok, addressText: 'خیابان ۱۲۳' }).fields).toEqual([]);
    expect(checkRecipient({ ...ok, addressText: 'خیابان ۱۲' }).fields).toEqual(['recipient.addressText']);
    expect(checkRecipient({ ...ok, addressText: 'ن'.repeat(500) }).fields).toEqual([]);
    expect(checkRecipient({ ...ok, addressText: 'ن'.repeat(501) }).fields).toEqual(['recipient.addressText']);
  });

  it('همهٔ فیلدهای غلط با هم، به همان شکل `fields` پاسخ ۴۰۰ سرور', () => {
    expect(checkRecipient({ name: '', addressText: 'کوتاه', postalCode: '1' }).fields).toEqual([
      'recipient.name',
      'recipient.addressText',
      'recipient.postalCode',
    ]);
  });
});
