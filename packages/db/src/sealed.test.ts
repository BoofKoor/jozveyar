import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { seal, secretsKeyOf, unseal } from './sealed.js';

const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');

describe('مقدار مهروموم‌شده', () => {
  it('باز کردن همان متن را می‌دهد، و هر بار رمزشدهٔ دیگری ساخته می‌شود', () => {
    const a = seal(KEY, 'JBSWY3DPEHPK3PXP', 'admin_users.totp:1');
    const b = seal(KEY, 'JBSWY3DPEHPK3PXP', 'admin_users.totp:1');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(unseal(KEY, a, 'admin_users.totp:1')).toBe('JBSWY3DPEHPK3PXP');
    expect(unseal(KEY, b, 'admin_users.totp:1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('متن خام در مقدار مهروموم‌شده نیست', () => {
    const sealed = seal(KEY, 'kavenegar-api-key-1234', 'x');
    expect(sealed).not.toContain('kavenegar');
    expect(Buffer.from(sealed.split('.')[2]!, 'base64url').toString('utf8')).not.toContain('kavenegar');
  });

  it('کلید دیگر باز نمی‌کند', () => {
    const sealed = seal(KEY, 'secret', 'ctx');
    expect(() => unseal(randomBytes(32), sealed, 'ctx')).toThrow();
  });

  it('جای دیگر باز نمی‌کند: مقدار یک ردیف در ردیف دیگر به کار نمی‌آید', () => {
    const sealed = seal(KEY, 'secret', 'admin_users.totp:a');
    expect(() => unseal(KEY, sealed, 'admin_users.totp:b')).toThrow();
  });

  it('دستکاری رد می‌شود', () => {
    const sealed = seal(KEY, 'secret', 'ctx');
    const [v, iv, body] = sealed.split('.');
    const bytes = Buffer.from(body!, 'base64url');
    bytes[0] = bytes[0]! ^ 1;
    expect(() => unseal(KEY, `${v}.${iv}.${bytes.toString('base64url')}`, 'ctx')).toThrow();
    expect(() => unseal(KEY, `v2.${iv}.${body}`, 'ctx')).toThrow();
    expect(() => unseal(KEY, 'not-sealed', 'ctx')).toThrow();
  });

  it('SECRETS_KEY فقط ۶۴ رقم hex', () => {
    expect(secretsKeyOf('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')?.length).toBe(32);
    expect(secretsKeyOf(' 00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF\n')?.length).toBe(32);
    expect(secretsKeyOf('0011')).toBeNull();
    expect(secretsKeyOf('')).toBeNull();
    expect(secretsKeyOf(undefined)).toBeNull();
    expect(secretsKeyOf('zz112233445566778899aabbccddeeff00112233445566778899aabbccddeeff')).toBeNull();
  });
});
