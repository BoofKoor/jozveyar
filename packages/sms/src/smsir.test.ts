/**
 * آداپتور sms.ir روی سرور ساختگی (ADR-049، سؤال ۱۲۸): هیچ درخواستی به sms.ir واقعی نمی‌رود. نام پارامترها و قالب هر هدف، پاسخ‌ها و
 * خطاها (۴۰۰، ۴۰۱، ۴۰۳، ۴۲۹، ۵۰۰)، سقف زمان و اتصال بریده، کلید و قالب خالی، و اینکه کلید و بدنه در هیچ خطا و لاگی نیست.
 */

import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createSmsIrMock, type SmsIrMock } from '../mock/smsir.mjs';
import {
  SmsError,
  loggedSms,
  otpParams,
  otpText,
  paidParams,
  orderPaidText,
  partnerOrderText,
  partnerParams,
  smsErrorTag,
  trackingParams,
  trackingText,
  type SmsRecord,
} from './index';
import { SMSIR_API_URL, isSmsIrApiKey, isSmsIrTemplateId, smsIrBaseUrl, smsIrClient, smsIrTransport, type SmsIrKeyName } from './smsir';

const API_KEY = 'mock-key-7f3a9c2e41d8b605';
const TEMPLATES = { SMS_OTP_TEMPLATE: '100001', SMS_PAID_TEMPLATE: '100002', SMS_TRACKING_TEMPLATE: '100003', SMS_PARTNER_TEMPLATE: '100004' } as const;
const BARCODE = '118800000000000000000101';

let mock: SmsIrMock;
let url = '';

beforeAll(async () => {
  mock = createSmsIrMock({
    keys: [API_KEY],
    templates: { '100001': ['CODE'], '100002': ['ORDER', 'DAY'], '100003': ['ORDER', 'BARCODE'], '100004': ['ORDER', 'DAY'] },
    credit: 500,
    cost: 2,
  });
  url = await mock.listen();
});

afterAll(() => mock.close());

beforeEach(() => {
  mock.configure({ keys: [API_KEY], credit: 500, cost: 2, fail: null, delayMs: 0, drop: 0 });
  mock.state.messages = [];
});

function keysOf(over: Partial<Record<SmsIrKeyName, string | null>> = {}) {
  const values: Record<SmsIrKeyName, string | null> = { SMS_API_KEY: API_KEY, ...TEMPLATES, ...over };
  const read: SmsIrKeyName[] = [];
  return {
    read,
    keys: async (name: SmsIrKeyName) => {
      read.push(name);
      return values[name];
    },
  };
}

const listen = (server: Server) =>
  new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('شکست نخورد');
};

describe('ارسال با قالب', () => {
  it('هر هدف با شناسهٔ قالب خودش و نام پارامترهای ADR-049؛ شناسهٔ پیامک و هزینه برمی‌گردد؛ کلیدها با هر پیامک خوانده می‌شوند', async () => {
    const { keys, read } = keysOf();
    const transport = smsIrTransport({ keys, baseUrl: url });
    expect(transport.name).toBe('smsir');
    const sent = await transport.send({ to: '09123456789', purpose: 'otp', text: otpText('48213'), params: otpParams('48213') });
    await transport.send({ to: '09123456789', purpose: 'order_paid', text: orderPaidText(10001, 'دوشنبه 6 مهر'), params: paidParams(10001, 'دوشنبه 6 مهر') });
    await transport.send({ to: '09151234567', purpose: 'tracking', text: trackingText(10027, BARCODE), params: trackingParams(10027, BARCODE) });
    expect(sent).toEqual({ status: 'sent', providerMessageId: String(mock.state.messages[0]!.id), cost: 2 });
    expect(mock.state.messages.map((m) => [m.mobile, m.templateId, m.parameters])).toEqual([
      ['09123456789', 100001, [{ name: 'CODE', value: '48213' }]],
      ['09123456789', 100002, [{ name: 'ORDER', value: '10001' }, { name: 'DAY', value: 'دوشنبه 6 مهر' }]],
      ['09151234567', 100003, [{ name: 'ORDER', value: '10027' }, { name: 'BARCODE', value: BARCODE }]],
    ]);
    expect(read).toEqual(['SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'SMS_API_KEY', 'SMS_PAID_TEMPLATE', 'SMS_API_KEY', 'SMS_TRACKING_TEMPLATE']);
    expect(mock.state.credit).toBe(494);
  });

  it('پیامک چاپخانه (۷٫۶): شناسهٔ قالب خودش و همان دو پارامتر؛ قالب خالی `unconfigured`، بی هیچ درخواست (سؤال ۱۷۵)', async () => {
    const { keys, read } = keysOf();
    const sent = await smsIrTransport({ keys, baseUrl: url }).send({
      to: '09151234567',
      purpose: 'partner_order',
      text: partnerOrderText(10027, 'دوشنبه 13 مهر'),
      params: partnerParams(10027, 'دوشنبه 13 مهر'),
    });
    expect(sent).toMatchObject({ status: 'sent', cost: 2 });
    expect(read).toEqual(['SMS_API_KEY', 'SMS_PARTNER_TEMPLATE']);
    expect(mock.state.messages.map((m) => [m.mobile, m.templateId, m.parameters])).toEqual([
      ['09151234567', 100004, [{ name: 'ORDER', value: '10027' }, { name: 'DAY', value: 'دوشنبه 13 مهر' }]],
    ]);
    for (const over of [{ SMS_PARTNER_TEMPLATE: null }, { SMS_PARTNER_TEMPLATE: '' }, { SMS_PARTNER_TEMPLATE: 'قالب' }]) {
      const error = await failure(
        smsIrTransport({ keys: keysOf(over).keys, baseUrl: url }).send({
          to: '09151234567',
          purpose: 'partner_order',
          text: 'x',
          params: partnerParams(10028, 'شنبه 18 مهر'),
        }),
      );
      expect((error as SmsError).code).toBe('unconfigured');
    }
    expect(mock.state.messages).toHaveLength(1);
  });

  it('متن آزاد فرستاده نمی‌شود: فقط پارامترها', async () => {
    const seen: string[] = [];
    const spy: typeof fetch = async (input, init) => {
      seen.push(String(init?.body));
      return fetch(input, init);
    };
    await smsIrTransport({ keys: keysOf().keys, baseUrl: url, fetch: spy }).send({ to: '09123456789', purpose: 'otp', text: 'متن آزاد که نباید برود', params: ['48213'] });
    expect(JSON.parse(seen[0]!)).toEqual({ mobile: '09123456789', templateId: 100001, parameters: [{ name: 'CODE', value: '48213' }] });
  });

  it('کلید یا قالب خالی یا «خوانده نشد»: `unconfigured`، بی هیچ درخواست', async () => {
    for (const over of [{ SMS_API_KEY: null }, { SMS_PAID_TEMPLATE: null }, { SMS_PAID_TEMPLATE: '12ab' }, { SMS_API_KEY: 'کلید فارسی با فاصله' }]) {
      const error = await failure(
        smsIrTransport({ keys: keysOf(over).keys, baseUrl: url }).send({ to: '09123456789', purpose: 'order_paid', text: 'x', params: paidParams(1, 'شنبه') }),
      );
      expect(error).toBeInstanceOf(SmsError);
      expect((error as SmsError).code).toBe('unconfigured');
    }
    expect(mock.state.messages).toEqual([]);
  });

  it('پیام بی پارامتر یا شمارهٔ نادرست: `rejected`، بی درخواست', async () => {
    const transport = smsIrTransport({ keys: keysOf().keys, baseUrl: url });
    expect(((await failure(transport.send({ to: '09123456789', purpose: 'otp', text: 'x' }))) as SmsError).code).toBe('rejected');
    expect(((await failure(transport.send({ to: '9123456789', purpose: 'otp', text: 'x', params: ['12345'] }))) as SmsError).code).toBe('rejected');
    expect(mock.state.messages).toEqual([]);
  });

  it('شماره یا مقدار پارامتر نادرست پیش از درخواست رد می‌شود، نه با پاسخ sms.ir: هیچ درخواستی نمی‌رود؛ ۵۰ نویسه می‌رود (شاهد)', async () => {
    let calls = 0;
    const spy: typeof fetch = async (...args) => {
      calls += 1;
      return fetch(...args);
    };
    const client = smsIrClient({ baseUrl: url, fetch: spy });
    const verify = (over: { mobile?: string; value?: string }) =>
      client.verify({ apiKey: API_KEY, templateId: '100001', mobile: over.mobile ?? '09123456789', parameters: [{ name: 'CODE', value: over.value ?? '48213' }] });
    for (const over of [{ mobile: '9123456789' }, { mobile: '0912345678' }, { value: 'x'.repeat(51) }, { value: '' }, { value: 'دو\nخط' }]) {
      expect(((await failure(verify(over))) as SmsError).code, JSON.stringify(over)).toBe('rejected');
    }
    expect(calls).toBe(0);
    await verify({ value: 'x'.repeat(50) });
    expect(calls).toBe(1);
  });

  it('کلید خالی پیش از هر سنجش دیگر: `unconfigured`، حتی با پیامی که خودش هم نادرست است', async () => {
    const send = (over: Partial<Record<SmsIrKeyName, string | null>>) =>
      failure(smsIrTransport({ keys: keysOf(over).keys, baseUrl: url }).send({ to: '9123', purpose: 'otp', text: 'x', params: ['12345'] }));
    expect(((await send({ SMS_API_KEY: null })) as SmsError).code).toBe('unconfigured');
    expect(((await send({ SMS_OTP_TEMPLATE: null })) as SmsError).code).toBe('unconfigured');
    // شاهد: با کلیدها، همان پیام به خاطر خودش رد می‌شود.
    expect(((await send({})) as SmsError).code).toBe('rejected');
    expect(mock.state.messages).toEqual([]);
  });

  it('از پاسخ فقط شناسهٔ عددی و هزینهٔ نامنفی برمی‌دارد', async () => {
    const reply =
      (data: unknown): typeof fetch =>
      async () =>
        new Response(JSON.stringify({ status: 1, message: 'موفق', data }), { status: 200, headers: { 'content-type': 'application/json' } });
    const send = (data: unknown) =>
      smsIrClient({ baseUrl: url, fetch: reply(data) }).verify({
        apiKey: API_KEY,
        templateId: '100001',
        mobile: '09123456789',
        parameters: [{ name: 'CODE', value: '48213' }],
      });
    expect(await send({ messageId: 88, cost: -1 })).toEqual({ messageId: '88', cost: null });
    expect(await send({ messageId: 'abc', cost: '1' })).toEqual({ messageId: null, cost: null });
    expect(await send(null)).toEqual({ messageId: null, cost: null });
    expect(await send({ messageId: 88, cost: 1.5 })).toEqual({ messageId: '88', cost: 1.5 });
  });
});

describe('خطاها: کد و عدد پاسخ، هرگز متن', () => {
  const send = (over: Partial<Record<SmsIrKeyName, string | null>> = {}, timeoutMs?: number) =>
    failure(
      smsIrTransport({ keys: keysOf(over).keys, baseUrl: url, ...(timeoutMs ? { timeoutMs } : {}) }).send({
        to: '09123456789',
        purpose: 'tracking',
        text: 'x',
        params: trackingParams(10027, BARCODE),
      }),
    ) as Promise<SmsError>;

  it('کلید نادرست ۴۰۱، قالب ناشناس ۴۰۰: `rejected`', async () => {
    const wrongKey = await send({ SMS_API_KEY: 'another-key-0000000000' });
    expect([wrongKey.code, wrongKey.detail]).toEqual(['rejected', { http: 401, status: 401 }]);
    const unknownTemplate = await send({ SMS_TRACKING_TEMPLATE: '999999' });
    expect([unknownTemplate.code, unknownTemplate.detail.http]).toEqual(['rejected', 400]);
  });

  it('قالبی که نام پارامترش فرق دارد رد می‌شود (سرور ساختگی نام‌ها را می‌سنجد)', async () => {
    mock.configure({ templates: { '100001': ['CODE'], '100002': ['ORDER', 'DAY'], '100003': ['ORDER', 'CODE'] } });
    try {
      expect((await send()).detail.http).toBe(400);
    } finally {
      mock.configure({ templates: { '100001': ['CODE'], '100002': ['ORDER', 'DAY'], '100003': ['ORDER', 'BARCODE'] } });
    }
  });

  it('۴۰۳ `rejected` با `status` بدنه؛ ۴۲۹ و ۵۰۰ `unavailable`', async () => {
    mock.configure({ fail: { http: 403, status: 17, times: 1 } });
    const denied = await send();
    expect([denied.code, smsErrorTag(denied)]).toEqual(['rejected', 'rejected:17']);
    mock.configure({ fail: { http: 429, times: 1 } });
    expect((await send()).code).toBe('unavailable');
    mock.configure({ fail: { http: 500, times: 1 } });
    const down = await send();
    expect([down.code, smsErrorTag(down)]).toEqual(['unavailable', 'unavailable:500']);
  });

  it('سقف زمان و اتصال بریده: `unavailable`، بی عدد', async () => {
    mock.configure({ delayMs: 400 });
    const slow = await send({}, 100);
    expect([slow.code, slow.detail]).toEqual(['unavailable', {}]);
    mock.configure({ delayMs: 0, drop: 1 });
    const dropped = await send();
    expect([dropped.code, dropped.detail]).toEqual(['unavailable', {}]);
    const closed = await failure(
      smsIrTransport({ keys: keysOf().keys, baseUrl: 'http://127.0.0.1:9' }).send({ to: '09123456789', purpose: 'otp', text: 'x', params: ['12345'] }),
    );
    expect((closed as SmsError).code).toBe('unavailable');
  });

  it('کلید و بدنه در خطا و ردیف «نرفت» نیست؛ تغییر مسیر دنبال نمی‌شود (سرآیند کلید به میزبان دیگر نمی‌رود)', async () => {
    const rows: SmsRecord[] = [];
    const lines: unknown[] = [];
    mock.configure({ fail: { http: 400, times: 1 } });
    const error = await failure(
      loggedSms(smsIrTransport({ keys: keysOf().keys, baseUrl: url }), { insert: async (row) => void rows.push(row) }).send({
        to: '09123456789',
        purpose: 'otp',
        text: otpText('48213'),
        params: ['48213'],
      }),
    );
    lines.push(error, JSON.stringify(rows), String((error as Error).stack));
    for (const text of lines.map(String)) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain('48213');
      expect(text).not.toContain('mock failure');
    }
    expect(rows).toEqual([{ provider: 'smsir', toMobile: '09123456789', purpose: 'otp', body: null, status: 'failed', error: 'rejected:400' }]);

    // تغییر مسیر: سرآیند کلید به میزبان دیگری نمی‌رود (`redirect: 'error'`). شاهد: با `follow` همان کلید به مقصد می‌رسید.
    const hops: unknown[] = [];
    const target = createServer((req, res) => {
      hops.push(req.headers['x-api-key']);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":1,"message":"","data":{"messageId":1,"cost":1}}');
    });
    const targetUrl = await listen(target);
    const bouncer = createServer((_req, res) => res.writeHead(307, { location: `${targetUrl}/v1/send/verify` }).end());
    const bouncerUrl = await listen(bouncer);
    try {
      const message = { to: '09123456789', purpose: 'otp' as const, text: 'x', params: ['12345'] };
      const moved = (await failure(smsIrTransport({ keys: keysOf().keys, baseUrl: bouncerUrl }).send(message))) as SmsError;
      expect([moved.code, hops]).toEqual(['unavailable', []]);
      const follow: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'follow' });
      await smsIrTransport({ keys: keysOf().keys, baseUrl: bouncerUrl, fetch: follow }).send(message);
      expect(hops).toEqual([API_KEY]);
    } finally {
      await Promise.all([target, bouncer].map((server) => new Promise((resolve) => server.close(resolve))));
    }
  });
});

describe('اعتبار و شکل کلیدها', () => {
  it('اعتبار به واحد خود sms.ir؛ کلید نادرست ۴۰۱', async () => {
    const client = smsIrClient({ baseUrl: url });
    expect(await client.credit(API_KEY)).toBe(500);
    const error = (await failure(client.credit('another-key-0000000000'))) as SmsError;
    expect([error.code, error.detail.http]).toEqual(['rejected', 401]);
    expect(mock.state.messages).toEqual([]);
  });

  it('سقف زمان جدا برای خواندن نمایشی اعتبار؛ بی آن همان سقف آداپتور', async () => {
    mock.configure({ delayMs: 300 });
    const client = smsIrClient({ baseUrl: url });
    const slow = (await failure(client.credit(API_KEY, 100))) as SmsError;
    expect([slow.code, slow.detail]).toEqual(['unavailable', {}]);
    expect(await client.credit(API_KEY)).toBe(500);
  });

  it('نشانی پایه: فقط http یا https بی مسیر اضافه؛ وگرنه نشانی واقعی', () => {
    expect(smsIrBaseUrl(undefined)).toBe(SMSIR_API_URL);
    expect(smsIrBaseUrl(' http://127.0.0.1:3300/ ')).toBe('http://127.0.0.1:3300');
    expect(smsIrBaseUrl('ftp://127.0.0.1')).toBe(SMSIR_API_URL);
    expect(smsIrBaseUrl('http://user:pass@127.0.0.1')).toBe(SMSIR_API_URL);
    expect(smsIrBaseUrl('نشانی')).toBe(SMSIR_API_URL);
  });

  it('شکل کلید API و شناسهٔ قالب', () => {
    expect(isSmsIrApiKey(API_KEY)).toBe(true);
    expect(isSmsIrApiKey('short')).toBe(false);
    expect(isSmsIrApiKey('has space inside key')).toBe(false);
    expect(isSmsIrApiKey('line\nbreak-000000')).toBe(false);
    expect(isSmsIrTemplateId('731058')).toBe(true);
    expect(isSmsIrTemplateId('0731058')).toBe(false);
    expect(isSmsIrTemplateId('73105a')).toBe(false);
    expect(isSmsIrTemplateId('12345678901')).toBe(false);
  });
});
