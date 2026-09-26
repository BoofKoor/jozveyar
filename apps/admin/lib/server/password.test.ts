/**
 * رمز ادمین با argon2id واقعی: پارامترها در خود هش، سنجش درست و نادرست، و یکدست شدن صفحه‌کلیدها.
 */

import { describe, expect, it } from 'vitest';

import { argon2Passwords, normalizePassword } from './password';

describe('رمز ادمین', () => {
  const passwords = argon2Passwords();

  it('هش argon2id است با m=19456، t=2، p=1 (OWASP)، و رمز در آن نیست', async () => {
    const hashed = await passwords.hash('یک جملهٔ کوتاه و بلند');
    expect(hashed).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(hashed).not.toContain('جمله');
    expect(await passwords.hash('یک جملهٔ کوتاه و بلند')).not.toBe(hashed);
  });

  it('رمز درست پذیرفته، نادرست نه', async () => {
    const hashed = await passwords.hash('correct horse battery');
    expect(await passwords.verify(hashed, 'correct horse battery')).toBe(true);
    expect(await passwords.verify(hashed, 'correct horse batterY')).toBe(false);
    expect(await passwords.verify(hashed, 'correct horse battery ')).toBe(false);
    expect(await passwords.verify(hashed, '')).toBe(false);
  });

  it('هش خراب پرتاب نمی‌کند، فقط false', async () => {
    expect(await passwords.verify('not-a-hash', 'x')).toBe(false);
    expect(await passwords.dummyVerify('x')).toBe(false);
  });

  it('همان رمز از صفحه‌کلید دیگر: ي و ك عربی و ارقام فارسی یکی‌اند؛ فاصله و نیم‌فاصله نه', async () => {
    expect(normalizePassword('كتابي ۱۲۳')).toBe('کتابی 123');
    const hashed = await passwords.hash('کتابی 123 سبز');
    expect(await passwords.verify(hashed, 'كتابي ۱۲۳ سبز')).toBe(true);
    expect(await passwords.verify(hashed, 'کتابی 123سبز')).toBe(false);
    expect(await passwords.verify(hashed, 'کتابی 123‌سبز')).toBe(false);
  });
});
