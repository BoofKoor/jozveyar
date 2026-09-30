import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFakeSmsIr } from '../fake/smsir.mjs';
import { SMS_TEMPLATES, orderPaidParams, orderPaidText, otpParams, otpText, trackingParams, trackingText } from './templates';
import {
  SMSIR_API_URL,
  smsIrBase,
  smsIrCredit,
  smsIrSendVerify,
  smsIrTransport,
  smsProviderOf,
  templateIdOf,
  type SmsIrKeys,
} from './smsir';
import { SmsError, describeSmsError, smsErrorCode } from './types';

const KEY = 'fake-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TEMPLATES = { '100001': ['CODE'], '100002': ['ORDER', 'DAY'], '100003': ['ORDER', 'BARCODE'] };
const BARCODE = '118800000000000000000101';

const fake = createFakeSmsIr({ keys: [KEY], templates: TEMPLATES, credit: 500 });
let baseUrl = '';

beforeAll(async () => {
  baseUrl = await fake.listen();
});
afterAll(() => fake.close());
beforeEach(() => {
  fake.reset();
  fake.configure({ credit: 500 });
});

const keysOf = (overrides: Partial<Record<string, string | null>> = {}) => {
  const calls: string[] = [];
  const ids: Record<string, string | null> = { otp: '100001', order_paid: '100002', tracking: '100003', ...overrides };
  return {
    calls,
    keys: async (purpose: keyof typeof SMS_TEMPLATES): Promise<SmsIrKeys> => {
      calls.push(purpose);
      return { apiKey: 'apiKey' in overrides ? (overrides.apiKey ?? null) : KEY, templateId: ids[purpose] ?? null };
    },
  };
};

async function failure(promise: Promise<unknown>): Promise<SmsError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SmsError);
  return error as SmsError;
}

describe('آداپتور sms.ir روی سرور ساختگی', () => {
  it('سه هدف: قالب هر هدف، نام پارامترها به ترتیب جدول، و شناسه و هزینهٔ پیامک', async () => {
    const { keys, calls } = keysOf();
    const transport = smsIrTransport({ baseUrl, keys });
    expect(transport.name).toBe('smsir');
    const sent = await Promise.all([
      transport.send({ to: '09123456789', purpose: 'otp', text: otpText('12345'), params: otpParams('12345') }),
      transport.send({ to: '09123456789', purpose: 'order_paid', text: orderPaidText(10027, 'دوشنبه 6 مهر'), params: orderPaidParams(10027, 'دوشنبه 6 مهر') }),
      transport.send({ to: '09351234567', purpose: 'tracking', text: trackingText(10027, BARCODE), params: trackingParams(10027, BARCODE) }),
    ]);
    for (const result of sent) expect(result).toMatchObject({ status: 'sent', cost: 1 });
    expect(new Set(sent.map((s) => s.providerMessageId)).size).toBe(3);
    const byTemplate = Object.fromEntries(fake.messages.map((m) => [m.templateId, m]));
    expect(byTemplate[100001]).toMatchObject({ mobile: '09123456789', parameters: [{ name: 'CODE', value: '12345' }] });
    expect(byTemplate[100002]).toMatchObject({
      parameters: [
        { name: 'ORDER', value: '10027' },
        { name: 'DAY', value: 'دوشنبه 6 مهر' },
      ],
    });
    expect(byTemplate[100003]).toMatchObject({
      mobile: '09351234567',
      parameters: [
        { name: 'ORDER', value: '10027' },
        { name: 'BARCODE', value: BARCODE },
      ],
    });
    // کلید و قالب با هر پیامک، نه یک بار (ADR-041).
    expect(calls.sort()).toEqual(['order_paid', 'otp', 'tracking']);
    expect(await smsIrCredit({ baseUrl }, KEY)).toBe(497);
  });

  it('کلید یا قالب خالی یا نادرست: «unconfigured»، و هیچ درخواستی نمی‌رود', async () => {
    for (const overrides of [{ apiKey: null }, { apiKey: '' }, { otp: null }, { otp: 'otp-template' }, { otp: '0' }]) {
      const error = await failure(
        smsIrTransport({ baseUrl, keys: keysOf(overrides).keys }).send({ to: '09123456789', purpose: 'otp', text: otpText('12345'), params: ['12345'] }),
      );
      expect(error.code).toBe('unconfigured');
    }
    expect(fake.requests).toBe(0);
  });

  it('پارامتری که با قالب نمی‌خواند باگ است: پرتاب، بی درخواست', async () => {
    const transport = smsIrTransport({ baseUrl, keys: keysOf().keys });
    await expect(transport.send({ to: '09123456789', purpose: 'tracking', text: 'x', params: ['10027'] })).rejects.toThrow();
    await expect(transport.send({ to: '09123456789', purpose: 'otp', text: 'x' })).rejects.toThrow();
    await expect(transport.send({ to: '09123456789', purpose: 'otp', text: 'x', params: [' 12345'] })).rejects.toThrow();
    expect(fake.requests).toBe(0);
  });

  it('رد: کلید نادرست ۴۰۱، قالب ناشناس ۴۰۰، با کد عددی؛ بی متن پاسخ و بی کلید در خطا', async () => {
    const wrongKey = await failure(smsIrCredit({ baseUrl }, 'not-the-key'));
    expect([wrongKey.code, wrongKey.http, wrongKey.status]).toEqual(['rejected', 401, 11]);
    const unknown = await failure(
      smsIrSendVerify({ baseUrl }, { apiKey: KEY, templateId: 999, mobile: '09123456789', parameters: [{ name: 'CODE', value: '1' }] }),
    );
    expect([unknown.code, unknown.http, unknown.status]).toEqual(['rejected', 400, 13]);
    const params = await failure(
      smsIrSendVerify({ baseUrl }, { apiKey: KEY, templateId: 100002, mobile: '09123456789', parameters: [{ name: 'ORDER', value: '1' }] }),
    );
    expect([params.code, params.http, params.status]).toEqual(['rejected', 400, 14]);
    for (const error of [wrongKey, unknown, params]) {
      const text = `${String(error)} ${describeSmsError(error)} ${JSON.stringify(error)}`;
      expect(text).not.toContain(KEY);
      expect(text).not.toContain('not-the-key');
      expect(text).not.toMatch(/نامعتبر|قالب نیست|پارامترهای قالب/);
    }
    expect(describeSmsError(unknown)).toBe('rejected (HTTP 400، کد 13)');
    expect(fake.messages).toEqual([]);
  });

  it('در دسترس نیست: ۵۰۰ بی JSON، ۴۲۹، سقف زمان، و میزبانی که گوش نمی‌دهد', async () => {
    fake.setMode('down');
    const down = await failure(smsIrCredit({ baseUrl }, KEY));
    expect([down.code, down.http, down.status]).toEqual(['unavailable', 500, null]);
    fake.setMode('limit');
    const limit = await failure(smsIrCredit({ baseUrl }, KEY));
    expect([limit.code, limit.http]).toEqual(['unavailable', 429]);
    fake.setMode('hang');
    const started = Date.now();
    const hang = await failure(smsIrCredit({ baseUrl, timeoutMs: 300 }, KEY));
    expect(hang.code).toBe('unavailable');
    expect(Date.now() - started).toBeLessThan(5_000);
    fake.setMode('ok');
    const closed = await failure(smsIrCredit({ baseUrl: 'http://127.0.0.1:9', timeoutMs: 2_000 }, KEY));
    expect(closed.code).toBe('unavailable');
    expect(smsErrorCode(new Error('x'))).toBe('unavailable');
  });

  it('موفق فقط با ۲xx و `status` ۱؛ ۲۰۰ با کد دیگر «رد»', async () => {
    const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const refused = await failure(smsIrCredit({ fetch: reply(200, { status: 0, message: 'x', data: 5 }) }, KEY));
    expect([refused.code, refused.http, refused.status]).toEqual(['rejected', 200, 0]);
    expect(await smsIrCredit({ fetch: reply(200, { status: 1, message: 'موفق', data: 165.3 }) }, KEY)).toBe(165.3);
    const broken = await failure(smsIrCredit({ fetch: reply(200, { status: 1, message: 'موفق', data: null }) }, KEY));
    expect(broken.code).toBe('unavailable');
    expect(
      await smsIrSendVerify(
        { fetch: reply(200, { status: 1, message: 'موفق', data: {} }) },
        { apiKey: KEY, templateId: 1, mobile: '09123456789', parameters: [] },
      ),
    ).toEqual({ messageId: null, cost: null });
  });

  it('درخواست: نشانی پایه، سرآیند کلید، JSON، بی دنبال کردن هدایت', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const record = async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ status: 1, message: 'موفق', data: { messageId: 7, cost: 1.05 } }), { status: 200 });
    };
    const sent = await smsIrSendVerify(
      { baseUrl: 'http://127.0.0.1:1/', fetch: record as typeof fetch },
      { apiKey: KEY, templateId: 100003, mobile: '09123456789', parameters: [{ name: 'ORDER', value: '10027' }] },
    );
    expect(sent).toEqual({ messageId: '7', cost: 1.05 });
    expect(seen[0]!.url).toBe('http://127.0.0.1:1/v1/send/verify');
    expect(seen[0]!.init).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'X-API-KEY': KEY, 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({
      mobile: '09123456789',
      templateId: 100003,
      parameters: [{ name: 'ORDER', value: '10027' }],
    });
    // بی `SMSIR_API_URL` نشانی واقعی؛ تست‌ها همیشه نشانی ساختگی می‌دهند.
    expect(smsIrBase(undefined)).toBe(SMSIR_API_URL);
    expect(smsIrBase('  ')).toBe('https://api.sms.ir');
    expect(smsIrBase('http://127.0.0.1:3950///')).toBe('http://127.0.0.1:3950');
  });

  it('شناسهٔ قالب عدد است؛ `SMS_PROVIDER` فقط smsir واقعی است', () => {
    expect([templateIdOf('418235'), templateIdOf(' 7 '), templateIdOf('0'), templateIdOf('otp'), templateIdOf(null), templateIdOf('1234567890')]).toEqual([
      418235,
      7,
      null,
      null,
      null,
      null,
    ]);
    expect([smsProviderOf('smsir'), smsProviderOf(' SMSIR '), smsProviderOf('console'), smsProviderOf('kavenegar'), smsProviderOf(undefined)]).toEqual([
      'smsir',
      'smsir',
      'console',
      'console',
      'console',
    ]);
  });
});
