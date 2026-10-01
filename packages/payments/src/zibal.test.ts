/**
 * آداپتور زیبال روی سرور ساختگی (ADR-050، سؤال ۱۲۸): هیچ درخواستی به زیبال واقعی نمی‌رود. بدنهٔ هر درخواست (و نبودن موبایل و کد ملی)، هر
 * `result` و `status`، ۲۰۱ و ۲۰۲، ۱۱۵، کد HTTP، سقف زمان و اتصال بریده، تغییر مسیر، کد پذیرندهٔ خالی، و اینکه کد پذیرنده در هیچ خطا و `raw`
 * نیست؛ و صفحهٔ پرداخت ساختگی با Referer و پارامترهای برگشت.
 */

import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createZibalMock, type ZibalMock } from '../mock/zibal.mjs';
import { PaymentError, paymentErrorTag } from './index';
import { ZIBAL_API_URL, isTrackId, isZibalMerchant, zibalBaseUrl, zibalClient, zibalGateway } from './zibal';

const MERCHANT = 'mock-merchant-5e1f0c7a92';
const CALLBACK = 'https://jozveyar.com/pay/callback/0123456789abcdef0123456789abcdef';

let mock: ZibalMock;
let url = '';

beforeAll(async () => {
  mock = createZibalMock({ merchants: [MERCHANT] });
  url = await mock.listen();
});

afterAll(() => mock.close());

beforeEach(() => {
  mock.configure({ merchants: [MERCHANT], maxAmount: 500_000_000, referer: null, ipRejected: false, omit: [], fail: null, delayMs: 0, drop: 0, reverseAfterMs: null });
  mock.state.transactions.clear();
});

/** fetch که بدنهٔ هر درخواست را نگه می‌دارد. */
function recording() {
  const bodies: Record<string, unknown>[] = [];
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    paths.push(new URL(String(input)).pathname);
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body) as Record<string, unknown>);
    return fetch(input, init);
  };
  return { bodies, paths, fetchImpl };
}

/** fetch با یک پاسخ JSON ثابت، برای شکلی که سرور ساختگی نمی‌سازد؛ باز هم هیچ درخواستی بیرون نمی‌رود. */
const answering =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('بی خطا گذشت');
};

const start = (client = zibalClient({ baseUrl: url }), over: Partial<{ merchant: string; amountRials: number; callbackUrl: string }> = {}) =>
  client.request({
    merchant: MERCHANT,
    amountRials: 3_747_500,
    callbackUrl: CALLBACK,
    orderId: '10027-3f9c2a1b',
    description: 'سفارش 10027 جزوه‌یار',
    ...over,
  });

describe('شکل‌ها', () => {
  it('نشانی پایه فقط http یا https بی پرسش؛ وگرنه نشانی واقعی', () => {
    expect(zibalBaseUrl(undefined)).toBe(ZIBAL_API_URL);
    expect(zibalBaseUrl(' http://127.0.0.1:3400/ ')).toBe('http://127.0.0.1:3400');
    for (const bad of ['ftp://x', 'http://u:p@127.0.0.1', 'http://127.0.0.1?x=1', 'نشانی']) expect(zibalBaseUrl(bad)).toBe(ZIBAL_API_URL);
    expect(isZibalMerchant('zibal')).toBe(true);
    expect(isZibalMerchant('با فاصله')).toBe(false);
    expect(isTrackId('3714562809')).toBe(true);
    expect(isTrackId('0123')).toBe(false);
  });
});

describe('شروع (`request`)', () => {
  it('بدنه: کد پذیرنده، مبلغ ریال، نشانی برگشت، شناسهٔ سفارش و توضیح؛ نه موبایل، نه کد ملی، نه پیامک زیبال', async () => {
    const { bodies, fetchImpl } = recording();
    const started = await start(zibalClient({ baseUrl: url, fetch: fetchImpl }));
    expect(bodies).toEqual([
      { merchant: MERCHANT, amount: 3_747_500, callbackUrl: CALLBACK, orderId: '10027-3f9c2a1b', description: 'سفارش 10027 جزوه‌یار' },
    ]);
    expect(isTrackId(started.trackId)).toBe(true);
    expect(started.paymentUrl).toBe(`${url}/start/${started.trackId}`);
    expect(JSON.stringify(started.raw)).not.toContain(MERCHANT);
    const tx = mock.state.transactions.get(Number(started.trackId))!;
    expect(tx).toMatchObject({ amount: 3_747_500, orderId: '10027-3f9c2a1b', callbackUrl: CALLBACK, status: -1 });
  });

  it('کد پذیرندهٔ ناشناس ۱۰۲، سقف ۱۱۳، IP ۱۱۵، نشانی برگشت ۱۰۶؛ هر کدام «نپذیرفت» با کدش', async () => {
    expect(paymentErrorTag(await failure(start(undefined, { merchant: 'other-merchant-1' })))).toBe('rejected:102');
    mock.configure({ maxAmount: 1_000_000 });
    expect(paymentErrorTag(await failure(start()))).toBe('rejected:113');
    mock.configure({ maxAmount: 500_000_000, ipRejected: true });
    expect(paymentErrorTag(await failure(start()))).toBe('rejected:115');
    mock.configure({ ipRejected: false });
    expect(paymentErrorTag(await failure(start(undefined, { callbackUrl: 'jozveyar.com/pay' })))).toBe('rejected:106');
    expect(mock.state.transactions.size).toBe(0);
  });

  it('مبلغ تا ۱٬۰۰۰ ریال و کد پذیرندهٔ خالی یا بدشکل: بی هیچ درخواست', async () => {
    const { paths, fetchImpl } = recording();
    const client = zibalClient({ baseUrl: url, fetch: fetchImpl });
    expect(paymentErrorTag(await failure(start(client, { amountRials: 1_000 })))).toBe('rejected:105');
    expect(paymentErrorTag(await failure(start(client, { merchant: '' })))).toBe('unconfigured');
    expect(paymentErrorTag(await failure(start(client, { merchant: 'با فاصله' })))).toBe('unconfigured');
    expect(paths).toEqual([]);
  });
});

describe('استعلام و تأیید', () => {
  async function paid(outcome: 'success' | 'declined' | 'cancel' | null = 'success') {
    const client = zibalClient({ baseUrl: url });
    const { trackId } = await start(client);
    if (outcome) {
      const response = await fetch(`${url}/__mock/pay`, { method: 'POST', body: JSON.stringify({ trackId, outcome }) });
      expect(response.status).toBe(200);
    }
    return { client, trackId };
  }

  it('در انتظار پرداخت: وضعیت −۱، با مبلغ و شناسهٔ سفارش؛ بی کد پیگیری', async () => {
    const { client, trackId } = await paid(null);
    expect(await client.inquiry({ merchant: MERCHANT, trackId })).toMatchObject({
      status: -1,
      amountRials: 3_747_500,
      orderId: '10027-3f9c2a1b',
      refId: null,
    });
  });

  it('پرداخت‌شده، تأییدنشده ← verify: مبلغ، شناسهٔ سفارش، کد پیگیری و کارت پوشیده؛ دوباره ۲۰۱', async () => {
    const { client, trackId } = await paid();
    const seen = await client.inquiry({ merchant: MERCHANT, trackId });
    expect(seen).toMatchObject({ status: 2, amountRials: 3_747_500, orderId: '10027-3f9c2a1b' });
    expect(seen.refId).toMatch(/^\d+$/);
    expect(seen.cardMask).toMatch(/^603799\*+1234$/);
    const verified = await client.verify({ merchant: MERCHANT, trackId });
    expect(verified).toMatchObject({ kind: 'verified', amountRials: 3_747_500, orderId: '10027-3f9c2a1b', refId: seen.refId });
    expect(await client.verify({ merchant: MERCHANT, trackId })).toMatchObject({ kind: 'already' });
    expect((await client.inquiry({ merchant: MERCHANT, trackId })).status).toBe(1);
  });

  it('verify پرداخت‌نشده یا ناموفق ۲۰۲، trackId ناشناس ۲۰۳ (بی درخواست اگر شکلش نادرست است)', async () => {
    const waiting = await paid(null);
    expect(paymentErrorTag(await failure(waiting.client.verify({ merchant: MERCHANT, trackId: waiting.trackId })))).toBe('rejected:202');
    const declined = await paid('declined');
    expect((await declined.client.inquiry({ merchant: MERCHANT, trackId: declined.trackId })).status).toBe(5);
    expect(paymentErrorTag(await failure(declined.client.verify({ merchant: MERCHANT, trackId: declined.trackId })))).toBe('rejected:202');
    expect(paymentErrorTag(await failure(declined.client.inquiry({ merchant: MERCHANT, trackId: '99' })))).toBe('rejected:203');
    // شکل نادرست: همان ۲۰۳، بی هیچ درخواست.
    const rec = recording();
    const bare = zibalClient({ baseUrl: url, fetch: rec.fetchImpl });
    expect(paymentErrorTag(await failure(bare.inquiry({ merchant: MERCHANT, trackId: 'x1' })))).toBe('rejected:203');
    expect(paymentErrorTag(await failure(bare.verify({ merchant: MERCHANT, trackId: '0' })))).toBe('rejected:203');
    expect(rec.paths).toEqual([]);
  });

  it('فیلدی که استعلام نیاورد «نگفت» است، نه خطا (منتظر مستند)', async () => {
    const { client, trackId } = await paid();
    mock.configure({ omit: ['amount', 'orderId', 'refNumber', 'cardNumber'] });
    expect(await client.inquiry({ merchant: MERCHANT, trackId })).toMatchObject({
      status: 2,
      amountRials: null,
      orderId: null,
      refId: null,
      cardMask: null,
    });
  });

  it('برگشت خودکار پول تأییدنشده: ریورس‌شده (۱۸)، و verify دیگر ۲۰۲', async () => {
    const { client, trackId } = await paid();
    mock.configure({ reverseAfterMs: 0 });
    expect((await client.inquiry({ merchant: MERCHANT, trackId })).status).toBe(18);
    expect(paymentErrorTag(await failure(client.verify({ merchant: MERCHANT, trackId })))).toBe('rejected:202');
  });
});

describe('شکست‌ها: جواب نداد، نپذیرفت، بدشکل', () => {
  it('۵۰۰ و ۴۲۹ «جواب نداد»، ۴۰۴ «نپذیرفت» با کد HTTP؛ هیچ متنی در خطا', async () => {
    const client = zibalClient({ baseUrl: url });
    mock.configure({ fail: { http: 500, times: 1 } });
    expect(paymentErrorTag(await failure(start(client)))).toBe('unavailable:500');
    mock.configure({ fail: { http: 429, times: 1 } });
    expect(paymentErrorTag(await failure(start(client)))).toBe('unavailable:429');
    mock.configure({ fail: { http: 404, times: 1 } });
    const error = await failure(start(client));
    expect(paymentErrorTag(error)).toBe('rejected:404');
    expect(String(error)).not.toContain('mock failure');
  });

  it('سقف زمان و اتصال بریده «جواب نداد»', async () => {
    mock.configure({ delayMs: 300 });
    expect(paymentErrorTag(await failure(start(zibalClient({ baseUrl: url, timeoutMs: 100 }))))).toBe('unavailable');
    mock.configure({ delayMs: 0, drop: 1 });
    expect(paymentErrorTag(await failure(start()))).toBe('unavailable');
  });

  it('تغییر مسیر دنبال نمی‌شود: بدنه با کد پذیرنده به میزبان دیگری نمی‌رود', async () => {
    let reached = false;
    const other: Server = createServer((_req, res) => {
      reached = true;
      res.end('{}');
    });
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    const port = (other.address() as { port: number }).port;
    const redirector: Server = createServer((_req, res) => {
      res.writeHead(307, { location: `http://127.0.0.1:${port}/v1/request` });
      res.end();
    });
    await new Promise<void>((resolve) => redirector.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(redirector.address() as { port: number }).port}`;
    try {
      expect(paymentErrorTag(await failure(start(zibalClient({ baseUrl: base }))))).toBe('unavailable');
      expect(reached).toBe(false);
    } finally {
      await new Promise((resolve) => redirector.close(resolve));
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it('پاسخ بی `result` عددی یا بدنهٔ ناخوانا «بدشکل»', async () => {
    const plain: Server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });
    await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
    try {
      const base = `http://127.0.0.1:${(plain.address() as { port: number }).port}`;
      expect(paymentErrorTag(await failure(start(zibalClient({ baseUrl: base }))))).toBe('malformed:200');
    } finally {
      await new Promise((resolve) => plain.close(resolve));
    }
  });

  it('verify با `result` ۱۰۰ ولی وضعیتی جز ۱ «بدشکل» است، نه موفق', async () => {
    const client = zibalClient({ baseUrl: url, fetch: answering({ result: 100, status: 2, amount: 3_747_500 }) });
    expect(paymentErrorTag(await failure(client.verify({ merchant: MERCHANT, trackId: '3714560001' })))).toBe('malformed');
  });

  it('`raw` فقط فیلدهای شناختهٔ پاسخ: نه `message`، نه کد پذیرنده، نه چیز ناشناس', async () => {
    const client = zibalClient({
      baseUrl: url,
      fetch: answering({
        result: 100,
        status: 2,
        amount: 3_747_500,
        orderId: '10027-3f9c2a1b',
        refNumber: 803114,
        cardNumber: '603799******1234',
        paidAt: '2026-10-01T10:00:00.000',
        message: 'success',
        merchant: MERCHANT,
        extra: { note: 'x' },
      }),
    });
    expect((await client.inquiry({ merchant: MERCHANT, trackId: '3714560001' })).raw).toEqual({
      result: 100,
      status: 2,
      amount: 3_747_500,
      orderId: '10027-3f9c2a1b',
      refNumber: '803114',
      cardNumber: '603799******1234',
      paidAt: '2026-10-01T10:00:00.000',
    });
  });

  it('کد پذیرنده نه در خطا و نه در `raw`', async () => {
    const client = zibalClient({ baseUrl: url });
    const { trackId, raw } = await start(client);
    expect(JSON.stringify(raw)).not.toContain(MERCHANT);
    await fetch(`${url}/__mock/pay`, { method: 'POST', body: JSON.stringify({ trackId, outcome: 'success' }) });
    const seen = await client.inquiry({ merchant: MERCHANT, trackId });
    const verified = await client.verify({ merchant: MERCHANT, trackId });
    expect(JSON.stringify([seen, verified])).not.toContain(MERCHANT);
    mock.configure({ fail: { result: 104, times: 1 } });
    const error = await failure(client.inquiry({ merchant: MERCHANT, trackId }));
    expect(error).toBeInstanceOf(PaymentError);
    expect(JSON.stringify(error) + String(error)).not.toContain(MERCHANT);
  });
});

describe('درگاه زیبال (`zibalGateway`)', () => {
  it('کد پذیرنده با هر درخواست خوانده می‌شود؛ خالی یعنی «پیکربندی نشده» بی درخواست', async () => {
    const reads: number[] = [];
    let value: string | null = MERCHANT;
    const { paths, fetchImpl } = recording();
    const gateway = zibalGateway({
      baseUrl: url,
      fetch: fetchImpl,
      merchant: async () => {
        reads.push(1);
        return value;
      },
    });
    const started = await gateway.start({ amountRials: 3_747_500, callbackUrl: CALLBACK, orderId: '10027-3f9c2a1b', description: 'سفارش 10027 جزوه‌یار' });
    expect(started.redirectUrl).toBe(`${url}/start/${started.authority}`);
    const attempt = { authority: started.authority, amountRials: 3_747_500, orderId: '10027-3f9c2a1b', raw: started.raw };
    expect((await gateway.inquire(attempt)).status).toBe(-1);
    expect(reads).toHaveLength(2);
    value = null;
    expect(paymentErrorTag(await failure(gateway.inquire(attempt)))).toBe('unconfigured');
    expect(paths).toEqual(['/v1/request', '/v1/inquiry']);
  });
});

describe('صفحهٔ پرداخت ساختگی', () => {
  it('بی Referer یا با دامنهٔ دیگر ۴۰۳؛ با دامنهٔ ثبت‌شده صفحه، و «پرداخت موفق» به نشانی برگشت با پارامترهای زیبال', async () => {
    mock.configure({ referer: 'jozveyar.com' });
    const { trackId, paymentUrl } = await start();
    expect((await fetch(paymentUrl)).status).toBe(403);
    expect((await fetch(paymentUrl, { headers: { referer: 'https://www.jozveyar.com/' } })).status).toBe(403);
    const page = await fetch(paymentUrl, { headers: { referer: 'https://jozveyar.com/' } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('10027-3f9c2a1b');
    const back = await fetch(`${paymentUrl}/pay`, {
      method: 'POST',
      body: new URLSearchParams({ outcome: 'success' }),
      redirect: 'manual',
    });
    expect(back.status).toBe(302);
    const location = new URL(back.headers.get('location')!);
    expect(`${location.origin}${location.pathname}`).toBe(CALLBACK);
    expect(Object.fromEntries(location.searchParams)).toEqual({ trackId, success: '1', status: '2', orderId: '10027-3f9c2a1b' });
  });
});
