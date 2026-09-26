/**
 * کد برنامهٔ تأیید با بردارهای خود RFCها: اگر یک بیت از HOTP یا TOTP یا base32 عوض شود، برنامهٔ گوشی و
 * پنل دو کد متفاوت می‌سازند و هیچ ادمینی وارد نمی‌شود.
 */

import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  groupedSecret,
  hotp,
  matchTotp,
  newTotpSecret,
  otpauthUri,
  totpAt,
  totpStep,
} from './totp';

/** رمز بردارهای RFC 4226 و RFC 6238 (SHA-1): «12345678901234567890». */
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('base32 (RFC 4648، بخش ۱۰)', () => {
  const vectors: [string, string][] = [
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ];

  it.each(vectors)('«%s» ← %s، و برعکس', (plain, encoded) => {
    expect(base32Encode(Buffer.from(plain))).toBe(encoded);
    expect(base32Decode(encoded).toString()).toBe(plain);
  });

  it('با `=`، حروف کوچک، فاصله و خط تیره هم خوانده می‌شود؛ نویسهٔ بیرون الفبا نه', () => {
    expect(base32Decode('MZXW6YTBOI======').toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb-oi').toString()).toBe('foobar');
    expect(() => base32Decode('MZXW1')).toThrow();
    expect(() => base32Decode('MZXW8')).toThrow();
  });
});

describe('HOTP (RFC 4226، پیوست D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

  it.each(expected.map((code, counter) => [counter, code] as const))('شمارندهٔ %i ← %s', (counter, code) => {
    expect(hotp(RFC_SECRET, counter)).toBe(code);
  });
});

describe('TOTP (RFC 6238، پیوست B، SHA-1)', () => {
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('ثانیهٔ %i ← %s (۸ رقم) و شش رقم آخرش', (seconds, code) => {
    const at = new Date(seconds * 1000);
    expect(totpAt(RFC_SECRET, at, 8)).toBe(code);
    expect(totpAt(RFC_SECRET, at)).toBe(code.slice(2));
  });

  it('گام ۳۰ ثانیه است', () => {
    expect(totpStep(new Date(59_000))).toBe(1);
    expect(totpStep(new Date(60_000))).toBe(2);
    expect(totpStep(new Date(1111111109_000))).toBe(37037036);
  });
});

describe('پذیرش کد', () => {
  const at = new Date(1111111111 * 1000);
  const step = totpStep(at);

  it('کد گام جاری و یک گام پیش و پس پذیرفته است، و گامش برمی‌گردد', () => {
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step), at)).toBe(step);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), at)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), at)).toBe(step + 1);
  });

  it('دو گام دورتر نه (شاهد: همان کدها با ساعت درست پذیرفته‌اند)', () => {
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), at)).toBeNull();
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 2), at)).toBeNull();
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), new Date(at.getTime() - 60_000))).toBe(step - 2);
    expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 2), new Date(at.getTime() + 60_000))).toBe(step + 2);
  });

  it('فقط شش رقم', () => {
    const code = hotp(RFC_SECRET, step);
    expect(matchTotp(RFC_SECRET, code, at)).toBe(step);
    expect(matchTotp(RFC_SECRET, `${code}0`, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, code.slice(1), at)).toBeNull();
    expect(matchTotp(RFC_SECRET, ` ${code}`, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, '', at)).toBeNull();
  });

  it('کد رمز دیگر پذیرفته نیست (شاهد: کد خود آن رمز پذیرفته است)', () => {
    const other = Buffer.from('01234567890123456789', 'ascii');
    expect(matchTotp(other, hotp(RFC_SECRET, step), at)).toBeNull();
    expect(matchTotp(other, hotp(other, step), at)).toBe(step);
  });
});

describe('رمز تازه و QR', () => {
  it('۱۶۰ بیت تصادفی: ۳۲ نویسهٔ base32، هر بار تازه', () => {
    const a = newTotpSecret();
    const b = newTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  it('برای وارد کردن دستی، چهار نویسه چهار نویسه', () => {
    expect(groupedSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it('otpauth همان رمز و نام کاربری را می‌گوید؛ SHA-1، ۶ رقم و ۳۰ ثانیه پیش‌فرض قالب‌اند', () => {
    expect(otpauthUri('JBSWY3DPEHPK3PXP', 'sara')).toBe('otpauth://totp/Jozveyar:sara?secret=JBSWY3DPEHPK3PXP&issuer=Jozveyar');
    expect(otpauthUri('JBSWY3DPEHPK3PXP', 'a.b-c')).toBe('otpauth://totp/Jozveyar:a.b-c?secret=JBSWY3DPEHPK3PXP&issuer=Jozveyar');
  });
});
