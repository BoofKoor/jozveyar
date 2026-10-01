/**
 * حکم یک تلاش (`judge`، ADR-050؛ سؤال‌های ۱۴۴ تا ۱۴۷)، با درگاه ساختگی که هر پاسخ را از پیش می‌گوید و هر `verify` را می‌شمارد: استعلام پیش از
 * `verify`؛ `verify` فقط برای «پرداخت‌شده، تأییدنشده»، پیش از مهلت و برای سفارش پرداختنی؛ مبلغ و شناسهٔ سفارش پیش و پس از `verify`؛ پاسخی که
 * نیامد «ناموفق» نیست؛ و «تأییدشده» همیشه ثبت می‌شود.
 */

import { describe, expect, it } from 'vitest';

import { PaymentError, judge, mockGateway, type GatewayInquiry, type GatewayVerified, type PaymentGateway } from './index';
import type { AttemptSnapshot } from './settle';

const T0 = new Date('2026-10-03T08:00:00Z');
const TTL = 10 * 60_000;
const at = (minutes: number) => () => new Date(T0.getTime() + minutes * 60_000);

const attempt = (over: Partial<AttemptSnapshot> = {}): AttemptSnapshot => ({
  authority: '3714562809',
  amountRials: 3_747_500,
  orderId: '10027-3f9c2a1b',
  raw: { trackId: '3714562809' },
  createdAt: T0,
  gatewayStatus: null,
  ...over,
});

type Answer<T> = T | PaymentError;

const seen = (status: number, over: Partial<GatewayInquiry> = {}): GatewayInquiry => ({
  status,
  amountRials: 3_747_500,
  orderId: '10027-3f9c2a1b',
  refId: status === 1 || status === 2 ? '803114' : null,
  cardMask: status === 1 || status === 2 ? '603799******1234' : null,
  raw: { status },
  ...over,
});

const verified = (over: Partial<Extract<GatewayVerified, { kind: 'verified' }>> = {}): GatewayVerified => ({
  kind: 'verified',
  amountRials: 3_747_500,
  orderId: '10027-3f9c2a1b',
  refId: '803114',
  cardMask: '603799******1234',
  raw: { result: 100, status: 1 },
  ...over,
});

/** درگاهی که پاسخ‌هایش را به ترتیب می‌دهد و هر درخواست را می‌شمارد. */
function scripted(inquiries: Answer<GatewayInquiry>[], verifies: Answer<GatewayVerified>[] = []) {
  const calls: string[] = [];
  const next = <T>(list: Answer<T>[], name: string): T => {
    calls.push(name);
    const answer = list.shift();
    if (answer === undefined) throw new Error(`${name} بیش از انتظار`);
    if (answer instanceof PaymentError) throw answer;
    return answer;
  };
  const gateway: PaymentGateway = {
    name: 'zibal',
    start: async () => {
      throw new Error('not used');
    },
    inquire: async () => next(inquiries, 'inquire'),
    verify: async () => next(verifies, 'verify'),
  };
  return { gateway, calls };
}

const run = (gateway: PaymentGateway, over: { attempt?: Partial<AttemptSnapshot>; payable?: boolean; minutes?: number } = {}) =>
  judge({ gateway, attempt: attempt(over.attempt), payable: over.payable ?? true, ttlMs: TTL, now: at(over.minutes ?? 2) });

describe('استعلام پیش از verify', () => {
  it('پرداخت‌شده، تأییدنشده ← verify ← موفق: کد پیگیری، کارت و مبلغ از پاسخ verify', async () => {
    const { gateway, calls } = scripted([seen(2)], [verified({ refId: '900001', cardMask: '603799******9999' })]);
    expect(await run(gateway)).toMatchObject({
      kind: 'succeeded',
      refId: '900001',
      cardMask: '603799******9999',
      verifiedAmountRials: 3_747_500,
      check: { status: 1, error: null },
    });
    expect(calls).toEqual(['inquire', 'verify']);
  });

  it('در انتظار پرداخت (برگشت زودرس یا دست‌ساز): در انتظار می‌ماند و verify نمی‌خورد', async () => {
    const { gateway, calls } = scripted([seen(-1)]);
    expect(await run(gateway)).toEqual({ kind: 'pending', check: { status: -1, error: null, at: at(2)() } });
    expect(calls).toEqual(['inquire']);
  });

  it('مبلغ یا شناسهٔ سفارشِ استعلام ناهمخوان: ناموفق بی verify؛ پول خودکار برمی‌گردد', async () => {
    for (const wrong of [{ amountRials: 374_750 }, { orderId: '10027-00000000' }]) {
      const { gateway, calls } = scripted([seen(2, wrong)]);
      expect(await run(gateway)).toMatchObject({ kind: 'failed', code: 'amount_mismatch', verifiedAmountRials: null, check: { status: 2 } });
      expect(calls).toEqual(['inquire']);
    }
  });

  it('استعلامی که مبلغ و شناسه نداد: verify، و سنجش با پاسخ رسمی verify', async () => {
    const { gateway, calls } = scripted([seen(2, { amountRials: null, orderId: null })], [verified()]);
    expect((await run(gateway)).kind).toBe('succeeded');
    expect(calls).toEqual(['inquire', 'verify']);
  });

  it('مبلغ پاسخ verify ناهمخوان: پول نهایی شد ولی ناموفق، با مبلغی که نهایی شد', async () => {
    const { gateway } = scripted([seen(2, { amountRials: null })], [verified({ amountRials: 374_750 })]);
    expect(await run(gateway)).toMatchObject({ kind: 'failed', code: 'amount_mismatch', verifiedAmountRials: 374_750, check: { status: 1 } });
  });

  it('شناسهٔ سفارش پاسخ verify ناهمخوان هم', async () => {
    const { gateway } = scripted([seen(2, { orderId: null })], [verified({ orderId: '10028-aaaaaaaa' })]);
    expect(await run(gateway)).toMatchObject({ kind: 'failed', code: 'amount_mismatch', check: { status: 1 } });
  });
});

describe('مهلت و پرداخت دوم: verify هرگز', () => {
  it('پس از ۱۰ دقیقه پرداخت‌شده، تأییدنشده ← ناموفق «مهلت گذشت»، با وضعیت ۲ برای «پول مشتری برمی‌گردد»', async () => {
    const { gateway, calls } = scripted([seen(2)]);
    expect(await run(gateway, { minutes: 10.5 })).toMatchObject({ kind: 'failed', code: 'expired', check: { status: 2 } });
    expect(calls).toEqual(['inquire']);
  });

  it('درست سر مهلت هنوز پذیرفته می‌شود', async () => {
    const { gateway } = scripted([seen(2)], [verified()]);
    expect((await run(gateway, { minutes: 10 })).kind).toBe('succeeded');
  });

  it('سفارش دیگر پرداختنی نیست ← ناموفق «سفارش پرداختنی نبود»، بی verify', async () => {
    const { gateway, calls } = scripted([seen(2)]);
    expect(await run(gateway, { payable: false })).toMatchObject({ kind: 'failed', code: 'order_not_payable', check: { status: 2 } });
    expect(calls).toEqual(['inquire']);
  });

  it('در انتظار پرداخت پس از مهلت ← ناموفق «مهلت گذشت»', async () => {
    const { gateway } = scripted([seen(-1)]);
    expect(await run(gateway, { minutes: 11 })).toMatchObject({ kind: 'failed', code: 'expired', check: { status: -1 } });
  });

  it('تأییدشده (پاسخ verify قبلی گم شده بود) پس از مهلت هم موفق: پول نهایی است', async () => {
    const { gateway, calls } = scripted([seen(1)]);
    expect(await run(gateway, { minutes: 30, attempt: { gatewayStatus: 2 } })).toMatchObject({ kind: 'succeeded', refId: '803114', verifiedAmountRials: 3_747_500 });
    expect(calls).toEqual(['inquire']);
  });

  it('تأییدشده برای سفارشی که دیگر پرداختنی نیست: ناموفق با وضعیت ۱ (پول باید برگردد)', async () => {
    const { gateway } = scripted([seen(1)]);
    expect(await run(gateway, { payable: false })).toMatchObject({ kind: 'failed', code: 'order_not_payable', check: { status: 1 } });
  });

  it('تأییدشده بی مبلغ: در انتظار با «بدشکل»، نه موفق بی سنجش', async () => {
    const { gateway } = scripted([seen(1, { amountRials: null })]);
    expect(await run(gateway)).toMatchObject({ kind: 'pending', check: { status: 1, error: 'malformed' } });
  });
});

describe('پاسخی که نیامد «ناموفق» نیست (سؤال ۱۴۷)', () => {
  it('استعلام بی جواب، رد کد پذیرنده، trackId ناشناس یا IP: در انتظار، با آخرین وضعیت و علت', async () => {
    for (const [error, tag] of [
      [new PaymentError('unavailable'), 'unavailable'],
      [new PaymentError('unavailable', { http: 502 }), 'unavailable:502'],
      [new PaymentError('rejected', { result: 104 }), 'rejected:104'],
      [new PaymentError('rejected', { result: 203 }), 'rejected:203'],
      [new PaymentError('rejected', { result: 115 }), 'rejected:115'],
      [new PaymentError('malformed'), 'malformed'],
      [new PaymentError('unconfigured'), 'unconfigured'],
    ] as const) {
      const { gateway } = scripted([error]);
      expect(await run(gateway, { attempt: { gatewayStatus: -1 } })).toEqual({ kind: 'pending', check: { status: -1, error: tag, at: at(2)() } });
    }
  });

  it('verify بی جواب یا ردشده: در انتظار با وضعیت ۲؛ استعلام بعدی می‌گوید', async () => {
    for (const error of [new PaymentError('unavailable'), new PaymentError('rejected', { result: 202 })]) {
      const { gateway } = scripted([seen(2)], [error]);
      expect(await run(gateway)).toMatchObject({ kind: 'pending', check: { status: 2 } });
    }
  });

  it('۲۰۱ (verify قبلی رسیده بود): استعلام دوباره و موفق با جزئیات آن', async () => {
    const { gateway, calls } = scripted([seen(2), seen(1, { refId: '700007' })], [{ kind: 'already', raw: { result: 201 } }]);
    expect(await run(gateway)).toMatchObject({ kind: 'succeeded', refId: '700007', check: { status: 1 } });
    expect(calls).toEqual(['inquire', 'verify', 'inquire']);
  });

  it('۲۰۱ و استعلام دوم بی جواب: در انتظار با وضعیت ۱', async () => {
    const { gateway } = scripted([seen(2), new PaymentError('unavailable')], [{ kind: 'already', raw: {} }]);
    expect(await run(gateway)).toMatchObject({ kind: 'pending', check: { status: 1, error: 'unavailable' } });
  });

  it('پس از مهلت و بی جواب: ناموفق «مهلت گذشت» فقط اگر هرگز verify نخورده', async () => {
    const never = scripted([new PaymentError('unavailable')]);
    expect(await run(never.gateway, { minutes: 12 })).toMatchObject({ kind: 'failed', code: 'expired', check: { status: null, error: 'unavailable' } });
    const maybe = scripted([new PaymentError('unavailable')]);
    expect(await run(maybe.gateway, { minutes: 12, attempt: { gatewayStatus: 2 } })).toMatchObject({ kind: 'pending', check: { status: 2 } });
  });

  it('کد وضعیت ناشناس: در انتظار با «بدشکل»', async () => {
    const { gateway } = scripted([seen(99)]);
    expect(await run(gateway)).toMatchObject({ kind: 'pending', check: { status: 99, error: 'malformed' } });
  });
});

describe('ناموفق با وضعیت صریح، با گروه علتش', () => {
  it.each([
    [3, 'cancelled'],
    [4, 'declined'],
    [5, 'declined'],
    [9, 'declined'],
    [12, 'declined'],
    [11, 'bank_error'],
    [-2, 'bank_error'],
    [21, 'bank_error'],
    [15, 'returned'],
    [16, 'returned'],
    [18, 'returned'],
  ])('وضعیت %i ← %s، بی verify', async (status, code) => {
    const { gateway, calls } = scripted([seen(status, { cardMask: status === 5 ? '603799******1234' : null })]);
    expect(await run(gateway)).toMatchObject({ kind: 'failed', code, check: { status } });
    expect(calls).toEqual(['inquire']);
  });

  it('کارت پوشیدهٔ استعلام در تلاش ناموفق می‌ماند (پرداخت دوم)', async () => {
    const { gateway } = scripted([seen(2)]);
    expect(await run(gateway, { payable: false })).toMatchObject({ cardMask: '603799******1234' });
  });
});

describe('درگاه نمونه، به زبان وضعیت‌های زیبال', () => {
  const mock = mockGateway({ newRefId: () => '123456' });
  const mockAttempt = (raw: unknown) => attempt({ authority: 'MOCK' + '0'.repeat(32), raw });

  it('بی تصمیم در انتظار؛ انصراف لغو؛ ناموفق موجودی ناکافی؛ موفق ← verify با کد پیگیری', async () => {
    expect(await judge({ gateway: mock, attempt: mockAttempt(null), payable: true, ttlMs: TTL, now: at(1) })).toMatchObject({ kind: 'pending', check: { status: -1 } });
    expect(await judge({ gateway: mock, attempt: mockAttempt({ decision: 'cancel' }), payable: true, ttlMs: TTL, now: at(1) })).toMatchObject({
      kind: 'failed',
      code: 'cancelled',
    });
    expect(await judge({ gateway: mock, attempt: mockAttempt({ decision: 'failure' }), payable: true, ttlMs: TTL, now: at(1) })).toMatchObject({
      kind: 'failed',
      code: 'declined',
      check: { status: 5 },
    });
    expect(await judge({ gateway: mock, attempt: mockAttempt({ decision: 'success' }), payable: true, ttlMs: TTL, now: at(1) })).toMatchObject({
      kind: 'succeeded',
      refId: '123456',
      raw: { decision: 'success', verified: true, refId: '123456' },
    });
  });
});
