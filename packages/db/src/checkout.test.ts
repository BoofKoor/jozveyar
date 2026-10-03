/**
 * آمادگی `live` (برش ۷٫۵، ADR-052، سؤال‌های ۱۶۱ و ۱۶۲)، بی پایگاه داده: هر تکه با نام `.env`، کلیدها با همان سنجش آداپتورها و پنل بر
 * `.env` مقدم، نشانی برگشت دقیقاً همان، و خط لاگ فقط با عوض شدن حال. پیوند پیش‌نمایش، محافظ‌ها و «درگاه آماده نیست» در تست یکپارچگی.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  LIVE_CALLBACK_URL,
  READINESS_PARTS,
  callbackUrlOk,
  checkoutReadiness,
  describeReadiness,
  firstMissing,
  readinessLogger,
  readinessOf,
  type CheckoutReadiness,
} from './checkout.js';
import { seal } from './sealed.js';
import { serviceKeyContext, type ServiceKeyName, type ServiceSecretRow } from './secrets.js';

const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
const OTHER_KEY = Buffer.from('ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100', 'hex');
const AT = new Date('2026-10-05T07:50:00Z');

/** `.env` سایت زنده پس از ۷٫۵: همه درست. */
const LIVE_ENV = {
  CHECKOUT_MODE: 'live',
  PAYMENT_PROVIDER: 'zibal',
  SMS_PROVIDER: 'smsir',
  DATABASE_URL: 'postgresql://jozveyar@db/jozveyar',
  SESSION_SECRET: 'a'.repeat(64),
  PAYMENT_CALLBACK_URL: LIVE_CALLBACK_URL,
  PAYMENT_MERCHANT_ID: 'zibal-merchant-0001',
  SMS_API_KEY: 'smsir-key-000000000001',
  SMS_OTP_TEMPLATE: '100001',
  SMS_PAID_TEMPLATE: '100002',
  SMS_TRACKING_TEMPLATE: '100003',
} as const;

const rowOf = (name: ServiceKeyName, value: string, key = KEY): ServiceSecretRow => ({
  name,
  sealed: seal(key, value, serviceKeyContext(name)),
  updatedAt: AT,
  updatedBy: null,
});

const stateOf = (readiness: CheckoutReadiness, part: (typeof READINESS_PARTS)[number]) =>
  readiness.parts.find((entry) => entry.part === part)?.state;

describe('آمادگی live', () => {
  it('همه درست: آماده؛ تکه‌ها به ترتیب کارت پنل', () => {
    const readiness = readinessOf(LIVE_ENV, [], KEY);
    expect(readiness).toEqual({ requested: true, ready: true, parts: READINESS_PARTS.map((part) => ({ part, state: 'ok' })) });
    expect(firstMissing(readiness)).toBeNull();
    expect(describeReadiness(readiness)).toBe('✓ مسیر خرید: live — زیبال و sms.ir؛ مخاطب از پنل');
  });

  it('live خواسته نشده: «خواسته نشد»، ولی تکه‌ها همچنان سنجیده می‌شوند (برای آماده شدن پیش از .env)', () => {
    for (const mode of [undefined, 'off', 'mock', 'LIVE ']) {
      const readiness = readinessOf({ ...LIVE_ENV, CHECKOUT_MODE: mode }, [], KEY);
      expect(readiness.requested).toBe(mode === 'LIVE ');
      expect(readiness.ready).toBe(mode === 'LIVE ');
    }
    const off = readinessOf({ ...LIVE_ENV, CHECKOUT_MODE: 'off' }, [], KEY);
    expect(off.parts.every((part) => part.state === 'ok')).toBe(true);
    expect(describeReadiness(off)).toBeNull();
  });

  it('درگاه و پیامک: فقط زیبال و sms.ir؛ mock و console «چیز دیگر»، خالی «خالی»', () => {
    const today = readinessOf({ ...LIVE_ENV, PAYMENT_PROVIDER: 'mock', SMS_PROVIDER: 'console' }, [], KEY);
    expect([stateOf(today, 'PAYMENT_PROVIDER'), stateOf(today, 'SMS_PROVIDER'), today.ready]).toEqual(['other', 'other', false]);
    expect(describeReadiness(today)).toBe('✗ مسیر خرید: live خواسته شد ولی PAYMENT_PROVIDER زیبال (zibal) نیست — خاموش');
    const empty = readinessOf({ ...LIVE_ENV, PAYMENT_PROVIDER: undefined, SMS_PROVIDER: ' ' }, [], KEY);
    expect([stateOf(empty, 'PAYMENT_PROVIDER'), stateOf(empty, 'SMS_PROVIDER')]).toEqual(['empty', 'empty']);
    expect(stateOf(readinessOf({ ...LIVE_ENV, PAYMENT_PROVIDER: ' Zibal ', SMS_PROVIDER: 'SMSIR' }, [], KEY), 'PAYMENT_PROVIDER')).toBe('ok');
  });

  it('پایگاه داده و SESSION_SECRET (۳۲ نویسه)', () => {
    const noDb = readinessOf(LIVE_ENV, null, KEY);
    expect([stateOf(noDb, 'DATABASE_URL'), noDb.ready]).toEqual(['empty', false]);
    expect(stateOf(readinessOf({ ...LIVE_ENV, DATABASE_URL: '' }, [], KEY), 'DATABASE_URL')).toBe('empty');
    const short = readinessOf({ ...LIVE_ENV, SESSION_SECRET: 'a'.repeat(31) }, [], KEY);
    expect([stateOf(short, 'SESSION_SECRET'), short.ready]).toEqual(['malformed', false]);
    expect(describeReadiness(short)).toBe('✗ مسیر خرید: live خواسته شد ولی SESSION_SECRET نیست یا کوتاه است — خاموش');
    expect(stateOf(readinessOf({ ...LIVE_ENV, SESSION_SECRET: undefined }, [], KEY), 'SESSION_SECRET')).toBe('empty');
    expect(stateOf(readinessOf({ ...LIVE_ENV, SESSION_SECRET: 'a'.repeat(32) }, [], KEY), 'SESSION_SECRET')).toBe('ok');
  });

  it('کلیدها: خالی، شکل نادرست (همان سنجش آداپتور) و خواندنی؛ پیام فقط نام، هرگز مقدار', () => {
    const empty = readinessOf({ ...LIVE_ENV, SMS_TRACKING_TEMPLATE: '' }, [], KEY);
    expect([stateOf(empty, 'SMS_TRACKING_TEMPLATE'), empty.ready]).toEqual(['empty', false]);
    expect(describeReadiness(empty)).toBe('✗ مسیر خرید: live خواسته شد ولی SMS_TRACKING_TEMPLATE خالی است — خاموش');
    const cases: [Extract<ServiceKeyName, (typeof READINESS_PARTS)[number]>, string][] = [
      ['SMS_OTP_TEMPLATE', 'abc'],
      ['SMS_PAID_TEMPLATE', '0123'],
      ['SMS_API_KEY', 'short'],
      ['SMS_API_KEY', 'has space inside it'],
      ['PAYMENT_MERCHANT_ID', 'zib'],
      ['PAYMENT_MERCHANT_ID', 'کد-پذیرنده'],
    ];
    for (const [name, value] of cases) {
      const readiness = readinessOf({ ...LIVE_ENV, [name]: value }, [], KEY);
      expect([name, value, stateOf(readiness, name)]).toEqual([name, value, 'malformed']);
      const line = describeReadiness(readiness)!;
      expect(line).toBe(`✗ مسیر خرید: live خواسته شد ولی ${name} شکل درستی ندارد — خاموش`);
      expect(line).not.toContain(value);
    }
  });

  it('مقدار پنل بر .env مقدم؛ پنل با SECRETS_KEY دیگر «خوانده نشد»، نه .env', () => {
    const fromPanel = readinessOf({ ...LIVE_ENV, PAYMENT_MERCHANT_ID: '' }, [rowOf('PAYMENT_MERCHANT_ID', 'panel-merchant-01')], KEY);
    expect(stateOf(fromPanel, 'PAYMENT_MERCHANT_ID')).toBe('ok');
    // مقدار پنل نادرست است، هرچند .env درست است: پنل مقدم.
    const badPanel = readinessOf(LIVE_ENV, [rowOf('SMS_OTP_TEMPLATE', 'not-a-number')], KEY);
    expect(stateOf(badPanel, 'SMS_OTP_TEMPLATE')).toBe('malformed');
    for (const secretsKey of [OTHER_KEY, null]) {
      const unreadable = readinessOf(LIVE_ENV, [rowOf('SMS_API_KEY', 'panel-key-0000000001')], secretsKey);
      expect([stateOf(unreadable, 'SMS_API_KEY'), unreadable.ready]).toEqual(['unreadable', false]);
      expect(describeReadiness(unreadable)).toBe('✗ مسیر خرید: live خواسته شد ولی SMS_API_KEY پنل با SECRETS_KEY امروز خوانده نشد — خاموش');
    }
  });

  it('قالب پیامک چاپخانه (۷٫۶) پیش‌نیاز live نیست: خالی، شکل نادرست یا «خوانده نشد»ش آمادگی را عوض نمی‌کند (سؤال‌های ۱۲۶ و ۱۷۵)', () => {
    expect(READINESS_PARTS).not.toContain('SMS_PARTNER_TEMPLATE');
    // LIVE_ENV قالب چاپخانه ندارد و آماده است (همان تست اول)؛ با هر حال دیگرش هم.
    for (const readiness of [
      readinessOf({ ...LIVE_ENV, SMS_PARTNER_TEMPLATE: 'قالب' }, [], KEY),
      readinessOf(LIVE_ENV, [rowOf('SMS_PARTNER_TEMPLATE', 'not-a-number')], KEY),
      readinessOf(LIVE_ENV, [rowOf('SMS_PARTNER_TEMPLATE', '100004', OTHER_KEY)], KEY),
    ]) {
      expect(readiness.ready).toBe(true);
      expect(readiness.parts.map((part) => part.part)).toEqual([...READINESS_PARTS]);
      expect(describeReadiness(readiness)).toBe('✓ مسیر خرید: live — زیبال و sms.ir؛ مخاطب از پنل');
    }
  });

  it('با پایگاه داده: ردیف‌ها یک بار از ذخیره‌گاه، بی کش؛ بی پایگاه داده نه', async () => {
    const list = vi.fn(async () => [rowOf('SMS_PAID_TEMPLATE', '200002')]);
    expect((await checkoutReadiness({ list }, LIVE_ENV, KEY)).ready).toBe(true);
    expect((await checkoutReadiness({ list }, LIVE_ENV, KEY)).ready).toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
    expect(stateOf(await checkoutReadiness(null, LIVE_ENV, KEY), 'DATABASE_URL')).toBe('empty');
  });
});

describe('نشانی برگشت', () => {
  it('دقیقاً https://jozveyar.com/pay/callback؛ http فقط روی 127.0.0.1 و localhost برای سرتاسری', () => {
    for (const ok of [LIVE_CALLBACK_URL, ` ${LIVE_CALLBACK_URL} `, 'http://127.0.0.1:3102/pay/callback', 'http://localhost:3000/pay/callback', 'http://127.0.0.1/pay/callback']) {
      expect([ok, callbackUrlOk(ok)]).toEqual([ok, true]);
    }
    for (const bad of [
      undefined,
      '',
      '/pay/callback',
      'http://jozveyar.com/pay/callback',
      'https://jozveyar.com/pay/callback/',
      'https://jozveyar.com/pay/callback?x=1',
      'https://www.jozveyar.com/pay/callback',
      'https://jozveyar.com:8443/pay/callback',
      'https://evil.example/pay/callback',
      'https://jozveyar.com.evil.example/pay/callback',
      'https://127.0.0.1:3102/pay/callback',
      'http://127.0.0.1:3102/pay/callback/',
      'http://127.0.0.1:3102/pay/callbacks',
      'http://user@127.0.0.1:3102/pay/callback',
      'http://127.0.0.2:3102/pay/callback',
      'http://10.0.0.5/pay/callback',
    ]) {
      expect([bad, callbackUrlOk(bad)]).toEqual([bad, false]);
    }
    const wrong = readinessOf({ ...LIVE_ENV, PAYMENT_CALLBACK_URL: 'https://www.jozveyar.com/pay/callback' }, [], KEY);
    expect(describeReadiness(wrong)).toBe(
      `✗ مسیر خرید: live خواسته شد ولی PAYMENT_CALLBACK_URL دقیقاً ${LIVE_CALLBACK_URL} نیست — خاموش`,
    );
    expect(describeReadiness(readinessOf({ ...LIVE_ENV, PAYMENT_CALLBACK_URL: undefined }, [], KEY))).toBe(
      '✗ مسیر خرید: live خواسته شد ولی PAYMENT_CALLBACK_URL خالی است — خاموش',
    );
  });
});

describe('لاگ آمادگی', () => {
  it('فقط با عوض شدن حال؛ اولین سنجش همیشه', () => {
    const lines: string[] = [];
    const logReadiness = readinessLogger(undefined, (line) => lines.push(line));
    const ready = readinessOf(LIVE_ENV, [], KEY);
    const broken = readinessOf({ ...LIVE_ENV, SMS_PAID_TEMPLATE: '' }, [], KEY);
    logReadiness(ready);
    logReadiness(ready);
    logReadiness(broken);
    logReadiness(broken);
    logReadiness(ready);
    expect(lines).toEqual([
      '✓ مسیر خرید: live — زیبال و sms.ir؛ مخاطب از پنل',
      '✗ مسیر خرید: live خواسته شد ولی SMS_PAID_TEMPLATE خالی است — خاموش',
      '✓ مسیر خرید: live — زیبال و sms.ir؛ مخاطب از پنل',
    ]);
    // live خواسته نشده: خطی نیست، و برگشت به live دوباره لاگ می‌شود.
    logReadiness(readinessOf({ ...LIVE_ENV, CHECKOUT_MODE: 'off' }, [], KEY));
    logReadiness(ready);
    expect(lines).toHaveLength(4);
  });
});
