/**
 * منبع مقدار کلیدهای سرویس‌ها (برش ۴٫۶، ADR-041)، بی پایگاه داده: مقدار پنل بر `.env` مقدم است؛ مقدار پنلی که باز نمی‌شود
 * «خوانده نشد» است، نه `.env` و نه خالی؛ و مقدار یک کلید در جای کلید دیگر باز نمی‌شود. نوشتن، قفل و CHECKها در تست
 * یکپارچگی (`integration.test.ts`).
 */

import { describe, expect, it } from 'vitest';

import { seal } from './sealed.js';
import {
  SERVICE_KEYS,
  isServiceKeyName,
  readServiceKey,
  resolveServiceKey,
  serviceKeyContext,
  type ServiceKeyName,
  type ServiceSecretRow,
} from './secrets.js';

const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
const AT = new Date('2026-10-05T07:50:00Z');
const VALUE = 'panel-value-0000-3f9a';

const rowOf = (name: ServiceKeyName, value = VALUE, context = serviceKeyContext(name)): ServiceSecretRow => ({
  name,
  sealed: seal(KEY, value, context),
  updatedAt: AT,
  updatedBy: { id: 'u1', name: 'سارا' },
});

describe('کلیدهای سرویس‌ها', () => {
  it('فقط سه نام، به ترتیب صفحه؛ نه حالت خرید، نه آداپتورها، نه رمزهای خود سرور', () => {
    expect(SERVICE_KEYS).toEqual(['SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'PAYMENT_MERCHANT_ID']);
    for (const name of SERVICE_KEYS) expect(isServiceKeyName(name)).toBe(true);
    for (const other of ['CHECKOUT_MODE', 'SMS_PROVIDER', 'PAYMENT_PROVIDER', 'SECRETS_KEY', 'SESSION_SECRET', 'sms_api_key', '', null, 1]) {
      expect(isServiceKeyName(other)).toBe(false);
    }
    expect(serviceKeyContext('SMS_API_KEY')).toBe('service_secrets:SMS_API_KEY');
  });

  it('مقدار پنل بر .env مقدم است؛ بی مقدار پنل .env بی فاصلهٔ دو سر؛ هیچ‌کدام: خالی', () => {
    const env = { SMS_API_KEY: '  env-value-1234\n', PAYMENT_MERCHANT_ID: '   ' };
    expect(resolveServiceKey('SMS_API_KEY', rowOf('SMS_API_KEY'), env, KEY)).toMatchObject({ source: 'panel', value: VALUE });
    expect(resolveServiceKey('SMS_API_KEY', null, env, KEY)).toEqual({ source: 'env', value: 'env-value-1234' });
    expect(resolveServiceKey('PAYMENT_MERCHANT_ID', null, env, KEY)).toEqual({ source: 'empty', value: null });
    expect(resolveServiceKey('SMS_OTP_TEMPLATE', null, {}, KEY)).toEqual({ source: 'empty', value: null });
  });

  it('مقدار پنلی که باز نمی‌شود «خوانده نشد» است، نه .env و نه خالی؛ لاگ فقط نام کلید را دارد', () => {
    const env = { SMS_API_KEY: 'env-value-1234' };
    const logs: string[] = [];
    const log = (message: string) => logs.push(message);
    // SECRETS_KEY عوض شده
    expect(resolveServiceKey('SMS_API_KEY', rowOf('SMS_API_KEY'), env, Buffer.alloc(32, 9), log)).toMatchObject({
      source: 'unreadable',
      value: null,
    });
    // SECRETS_KEY نیست
    expect(resolveServiceKey('SMS_API_KEY', rowOf('SMS_API_KEY'), env, null, log)).toMatchObject({ source: 'unreadable', value: null });
    // مقدار کلید دیگر در این ردیف (جای مهروموم، AAD)
    expect(resolveServiceKey('PAYMENT_MERCHANT_ID', rowOf('PAYMENT_MERCHANT_ID', VALUE, serviceKeyContext('SMS_API_KEY')), {}, KEY, log)).toMatchObject({
      source: 'unreadable',
    });
    // دستکاری
    const row = rowOf('SMS_API_KEY');
    expect(resolveServiceKey('SMS_API_KEY', { ...row, sealed: `${row.sealed.slice(0, -2)}AA` }, env, KEY, log)).toMatchObject({ source: 'unreadable' });
    expect(logs).toHaveLength(4);
    expect(logs.every((line) => /SMS_API_KEY|PAYMENT_MERCHANT_ID/.test(line) && line.includes('SECRETS_KEY'))).toBe(true);
    expect(logs.join('\n')).not.toContain(VALUE);
    expect(logs.join('\n')).not.toContain('env-value');
  });

  it('خواندن با هر استفاده: هر بار ردیف امروز پایگاه داده، بی کش', async () => {
    let current: ServiceSecretRow | null = rowOf('SMS_OTP_TEMPLATE', 'jozveyar-otp');
    let reads = 0;
    const store = {
      async read() {
        reads += 1;
        return current;
      },
    };
    expect(await readServiceKey(store, 'SMS_OTP_TEMPLATE', {}, KEY)).toMatchObject({ source: 'panel', value: 'jozveyar-otp' });
    current = null;
    expect(await readServiceKey(store, 'SMS_OTP_TEMPLATE', { SMS_OTP_TEMPLATE: 'from-env' }, KEY)).toEqual({ source: 'env', value: 'from-env' });
    expect(reads).toBe(2);
  });
});
