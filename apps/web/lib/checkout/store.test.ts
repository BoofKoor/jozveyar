/**
 * مسیر خرید در مرورگر (`store.ts`)، با درخواست‌های ساختگی و ساعت ساختگی: هر حالت طرح `checkout.html` و هر
 * کد شکست سرور. عددهای تصمیم (۵ رقم، ۹۰ ثانیه، ۲ دقیقه) صریح‌اند، نه از ثابت‌های کد.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Breakdown } from '@jozveyar/contracts';
import type { CheckoutItem, CheckoutQuote, Place } from '@jozveyar/contracts/checkout';

import type { ApiResult, CheckoutApi, PlaceOrderBody } from './api';
import { createCheckoutStore, quoteOf, type CheckoutStore } from './store';

const ITEM: CheckoutItem = {
  documentIds: ['0b9f7a5e-3d1c-4b8a-9e2f-6a7b8c9d0e1f'],
  colorMode: 'bw',
  paperTypeId: 'tahrir80',
  sidesMode: 'double',
  bindingTypeId: 'spiral',
  copies: 1,
};
const MASHHAD: Place = { provinceId: 11, cityId: 1326 };
const RECIPIENT = { name: 'سارا احمدی', addressText: 'مشهد، بلوار وکیل‌آباد ۱۲، پلاک ۲۴', postalCode: '' };

function breakdown(totalRials: number, shippingRials: number | null = null, pageCount = 10): Breakdown {
  return {
    priceListVersion: 1,
    items: [
      {
        sections: [{ documentId: ITEM.documentIds[0]!, pageCount }],
        pageCount,
        printedSides: pageCount,
        sheets: Math.ceil(pageCount / 2),
        colorSides: 0,
        bwSides: pageCount,
        volumes: 1,
        sheetsPerVolume: [Math.ceil(pageCount / 2)],
        copies: 1,
        printRials: 160_000,
        paperRials: 0,
        bindingRials: 450_000,
        weightGrams: 100,
        totalRials: 610_000,
      },
    ],
    subtotalRials: 610_000,
    discountRials: 0,
    shippingRials,
    shippingFromRials: 1_295_000,
    estWeightGrams: 200,
    vatRials: 0,
    roundingRials: 0,
    totalWithoutShippingRials: 610_000,
    totalRials,
    warnings: [],
  };
}

const quoteFor = (place: Place | null): CheckoutQuote => ({
  breakdown: place ? breakdown(610_000 + 1_377_500, 1_377_500) : breakdown(610_000),
  shippingByZone: [
    { zoneId: 'tehran', name: 'استان تهران', shippingRials: 1_295_000 },
    { zoneId: 'other', name: 'بقیهٔ کشور', shippingRials: 1_377_500 },
  ],
});

const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });
const fail = (status: number, error: string, body: Record<string, unknown> = {}) =>
  ({ ok: false, status, error, body: { error, ...body } }) as ApiResult<never>;

/** درخواست‌های ساختگی: پاسخ هر مسیر را تست می‌گذارد؛ هر فراخوان ثبت می‌شود. */
function fakeApi() {
  const calls: { name: string; args: unknown[] }[] = [];
  const replies: Record<string, ((...args: never[]) => Promise<ApiResult<unknown>>) | undefined> = {};
  const api = new Proxy({} as CheckoutApi, {
    get: (_, name: string) =>
      (...args: unknown[]) => {
        calls.push({ name, args });
        const reply = replies[name];
        if (!reply) throw new Error(`پاسخی برای ${name} گذاشته نشده`);
        return reply(...(args as never[]));
      },
  });
  return { api, calls, replies, count: (name: string) => calls.filter((c) => c.name === name).length };
}

describe('مسیر خرید در مرورگر', () => {
  let clock: number;
  let net: ReturnType<typeof fakeApi>;
  let store: CheckoutStore;
  let visited: string[];
  let keys: number;

  beforeEach(() => {
    clock = 1_000_000;
    net = fakeApi();
    visited = [];
    keys = 0;
    net.replies.quote = async (_items: CheckoutItem[], place: Place | null) => ok(quoteFor(place));
    store = createCheckoutStore({
      api: net.api,
      now: () => clock,
      navigate: (url) => visited.push(url),
      newKey: () => `key-${++keys}`,
    });
  });

  /** تا قدم پرداخت: «ادامه»، مشهد، و نشانی. */
  async function toPay() {
    expect((await store.start([ITEM])).ok).toBe(true);
    expect(await store.choosePlace(MASHHAD)).toBe(true);
    store.editRecipient(RECIPIENT);
    expect(store.submitAddress()).toBe(true);
    store.enterPay();
  }

  it('«ادامه»: قیمت سرور بی ارسال؛ شهر: قیمت با همان جا', async () => {
    await store.start([ITEM]);
    expect(net.calls.at(-1)).toEqual({ name: 'quote', args: [[ITEM], null] });
    expect(quoteOf(store.getState(), false)?.breakdown.shippingRials).toBeNull();
    expect(quoteOf(store.getState(), true)).toBeNull();

    await store.choosePlace(MASHHAD);
    expect(net.calls.at(-1)).toEqual({ name: 'quote', args: [[ITEM], MASHHAD] });
    expect(quoteOf(store.getState(), true)?.breakdown.shippingRials).toBe(1_377_500);
  });

  it('شهری که قیمتش نیامد: همان قدم، با خطا؛ جا عوض نمی‌شود', async () => {
    await store.start([ITEM]);
    net.replies.quote = async () => fail(0, 'network');
    expect(await store.choosePlace(MASHHAD)).toBe(false);
    expect(store.getState().place).toBeNull();
    expect(store.getState().placeError?.error).toBe('network');
  });

  it('پاسخ دیررس قیمت کهنه، قیمت تازه را نمی‌پوشاند', async () => {
    await store.start([ITEM]);
    let release: () => void = () => undefined;
    net.replies.quote = (_items: CheckoutItem[], place: Place | null) =>
      new Promise((resolve) => {
        release = () => resolve(ok(quoteFor(place)));
      });
    const first = store.choosePlace({ provinceId: 8, cityId: 394 });
    const firstRelease = release;
    net.replies.quote = async (_items: CheckoutItem[], place: Place | null) => ok(quoteFor(place));
    store.sync([{ ...ITEM, copies: 2 }], false);
    await Promise.resolve();
    firstRelease();
    expect(await first).toBe(false);
    expect(store.getState().place).toBeNull();
  });

  it('نشانی: همان قاعدهٔ سرور، پیش از قدم پرداخت؛ فیلدی که عوض شد خطایش می‌رود', async () => {
    store.editRecipient({ name: 'س', addressText: 'کوتاه', postalCode: '12345' });
    expect(store.submitAddress()).toBe(false);
    expect(store.getState().recipientErrors).toEqual(['recipient.name', 'recipient.addressText', 'recipient.postalCode']);
    store.editRecipient({ postalCode: '۹۱۸۹۹-۱۴۳۶۵' });
    expect(store.getState().recipientErrors).toEqual(['recipient.name', 'recipient.addressText']);
    store.editRecipient(RECIPIENT);
    expect(store.submitAddress()).toBe(true);
  });

  it('قدم پرداخت بی نشست: موبایل؛ با نشست همین گوشی: مرور، با قیمت تازهٔ سرور', async () => {
    await toPay();
    expect(store.getState().stage).toBe('mobile');

    store.setAuth({ mobile: '09121234567' });
    const quotes = net.count('quote');
    store.enterPay();
    expect(store.getState().stage).toBe('review');
    expect(net.count('quote')).toBe(quotes + 1);
  });

  describe('کد پیامکی', () => {
    beforeEach(async () => {
      await toPay();
      net.replies.requestCode = async (mobile: string) => ok({ mobile, expiresInSeconds: 120, resendInSeconds: 90 });
    });

    it('شمارهٔ نادرست به سرور نمی‌رود؛ درست، نرمال‌شده می‌رود و کد ۲ دقیقه و ارسال دوباره ۹۰ ثانیه', async () => {
      store.editMobile('912 345');
      await store.sendCode();
      expect(store.getState().mobileError).toEqual({ kind: 'invalid' });
      expect(net.count('requestCode')).toBe(0);

      store.editMobile('۰۹۱۲ ۱۲۳ ۴۵۶۷');
      await store.sendCode();
      expect(net.calls.at(-1)).toEqual({ name: 'requestCode', args: ['09121234567'] });
      const { stage, otp } = store.getState();
      expect(stage).toBe('code');
      expect(otp).toEqual({ mobile: '09121234567', resendAt: clock + 90_000, expiresAt: clock + 120_000, closed: null });
    });

    it('کدی که کمتر از ۹۰ ثانیه پیش رفت: همان کد، با شمارش معکوسی که سرور گفت', async () => {
      net.replies.requestCode = async () => fail(429, 'resend_too_soon', { retryAfterSeconds: 40 });
      store.editMobile('09121234567');
      await store.sendCode();
      const { stage, otp, otpReused } = store.getState();
      expect(stage).toBe('code');
      expect(otpReused).toBe(true);
      expect(otp?.resendAt).toBe(clock + 40_000);
      // «ارسال دوباره» پس از ۹۰ ثانیه، کد تا ۱۲۰: ۳۰ ثانیه بعد از باز شدن ارسال دوباره
      expect(otp?.expiresAt).toBe(clock + 70_000);
    });

    it('سقف کد و پیامکی که نرفت: پیام در قدم موبایل، نه قدم کد', async () => {
      net.replies.requestCode = async () => fail(429, 'too_many_codes', { scope: 'mobile', retryAfterSeconds: 1500 });
      store.editMobile('09121234567');
      await store.sendCode();
      expect(store.getState().stage).toBe('mobile');
      expect(store.getState().mobileError).toMatchObject({ kind: 'failure', failure: { error: 'too_many_codes' } });
    });

    it('کد اشتباه با فرصت باقی؛ فرصت آخر که رفت، کد بسته است', async () => {
      store.editMobile('09121234567');
      await store.sendCode();
      net.replies.verifyCode = async () => fail(400, 'wrong_code', { attemptsLeft: 2 });
      store.editCode('48213');
      await store.verifyCode();
      expect(store.getState().codeError).toEqual({ kind: 'wrong', attemptsLeft: 2 });

      net.replies.verifyCode = async () => fail(400, 'wrong_code', { attemptsLeft: 0 });
      await store.verifyCode();
      expect(store.getState().otp?.closed).toBe('locked');
      expect(store.getState().codeError).toBeNull();
    });

    it('کد بسته و «ارسال کد تازه»ی زود: کد همان‌طور بسته، با شمارش معکوسی که سرور گفت', async () => {
      store.editMobile('09121234567');
      await store.sendCode();
      net.replies.verifyCode = async () => fail(410, 'code_locked');
      store.editCode('48213');
      await store.verifyCode();
      expect(store.getState().otp?.closed).toBe('locked');

      net.replies.requestCode = async () => fail(429, 'resend_too_soon', { retryAfterSeconds: 60 });
      await store.resend();
      const { stage, otp, otpReused } = store.getState();
      expect(stage).toBe('code');
      expect(otp).toMatchObject({ closed: 'locked', resendAt: clock + 60_000 });
      // «همان کد را بزن» نه: آن کد بسته است.
      expect(otpReused).toBe(false);
    });

    it('کد کمتر از ۵ رقم به سرور نمی‌رود؛ ارقام فارسی پذیرفته', async () => {
      store.editMobile('09121234567');
      await store.sendCode();
      net.replies.verifyCode = async (mobile: string) => ok({ mobile });
      store.editCode('4821');
      await store.verifyCode();
      expect(store.getState().codeError).toEqual({ kind: 'format' });
      expect(net.count('verifyCode')).toBe(0);

      store.editCode('۴۸۲۱۳');
      await store.verifyCode();
      expect(net.calls.filter((c) => c.name === 'verifyCode')).toEqual([{ name: 'verifyCode', args: ['09121234567', '48213'] }]);
    });

    it('بعد از ۲ دقیقه کد منقضی است، بی درخواست؛ و «منقضی» سرور هم', async () => {
      store.editMobile('09121234567');
      await store.sendCode();
      store.editCode('48213');
      clock += 120_000;
      net.replies.verifyCode = async (mobile: string) => ok({ mobile });
      await store.verifyCode();
      expect(store.getState().otp?.closed).toBe('expired');
      expect(net.count('verifyCode')).toBe(0);

      clock -= 1;
      store.editMobile('09121234567');
      net.replies.requestCode = async (mobile: string) => ok({ mobile, expiresInSeconds: 120, resendInSeconds: 90 });
      await store.resend();
      net.replies.verifyCode = async () => fail(410, 'code_expired');
      store.editCode('48213');
      await store.verifyCode();
      expect(store.getState().otp?.closed).toBe('expired');
    });

    it('کد درست: نشست، مرور، خبر به رابط، و قیمت تازه', async () => {
      store.editMobile('09121234567');
      await store.sendCode();
      net.replies.verifyCode = async (mobile: string) => ok({ mobile });
      store.editCode('48213');
      const told: unknown[] = [];
      const quotes = net.count('quote');
      await store.verifyCode((auth) => told.push(auth));
      expect(store.getState()).toMatchObject({ stage: 'review', auth: { mobile: '09121234567' }, otp: null });
      expect(told).toEqual([{ mobile: '09121234567' }]);
      expect(net.count('quote')).toBe(quotes + 1);
    });

    it('بعد از رفرش (۳د): همان کد زنده با همان شمارش معکوس (ساعت مطلق)؛ خود کد برنمی‌گردد', async () => {
      store.editMobile('09121234567');
      await store.sendCode();
      store.editCode('123');
      const sentAt = clock;
      clock += 30_000;
      // صفحهٔ تازه: حالت تازه، با پیش‌نویسی که از JSON (sessionStorage) گذشته
      const fresh = createCheckoutStore({ api: net.api, now: () => clock, navigate: () => undefined });
      fresh.hydrate(JSON.parse(JSON.stringify(store.draft())));
      fresh.enterPay();
      expect(fresh.getState()).toMatchObject({
        stage: 'code',
        code: '',
        mobile: '09121234567',
        otp: { mobile: '09121234567', resendAt: sentAt + 90_000, expiresAt: sentAt + 120_000, closed: null },
      });
      // دو دقیقه گذشت: کد دیگر زنده نیست، پس قدم موبایل با همان شماره
      clock = sentAt + 120_000;
      fresh.enterPay();
      expect(fresh.getState()).toMatchObject({ stage: 'mobile', mobile: '09121234567' });
    });

    it('«عوض کن» در مرور نشست را باطل می‌کند و شماره در فیلد می‌ماند', async () => {
      store.setAuth({ mobile: '09121234567' });
      store.enterPay();
      net.replies.logout = async () => ok({ loggedOut: true });
      await store.changeMobile();
      expect(net.count('logout')).toBe(1);
      expect(store.getState()).toMatchObject({ stage: 'mobile', auth: null, mobile: '09121234567' });
    });
  });

  describe('پرداخت', () => {
    let sent: PlaceOrderBody[];

    beforeEach(async () => {
      await toPay();
      store.setAuth({ mobile: '09121234567' });
      store.enterPay();
      await Promise.resolve();
      sent = [];
      net.replies.placeOrder = async (body: PlaceOrderBody) => {
        sent.push(body);
        return ok({
          order: { number: 10001, token: 'tok', status: 'awaiting_payment', totalRials: body.expectedTotalRials },
          payment: { redirectUrl: '/pay/mock/MOCK0123' },
        });
      };
    });

    it('جمع روی دکمه، گیرندهٔ نرمال‌شده و ریز قیمت دیده‌شده می‌روند؛ بعد درگاه', async () => {
      await store.pay();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        items: [ITEM],
        place: MASHHAD,
        recipient: { name: 'سارا احمدی', addressText: 'مشهد، بلوار وکیل‌آباد 12، پلاک 24', postalCode: null },
        checkoutKey: 'key-1',
        expectedTotalRials: 610_000 + 1_377_500,
      });
      expect((sent[0]!.quoteSnapshot as Breakdown).totalRials).toBe(610_000 + 1_377_500);
      expect(visited).toEqual(['/pay/mock/MOCK0123']);
    });

    it('یک کلیک، یک سفارش: برگشت از درگاه و زدن دوباره همان کلید؛ جزوهٔ دیگر کلید تازه', async () => {
      await store.pay();
      store.resume();
      await store.pay();
      expect(sent.map((body) => body.checkoutKey)).toEqual(['key-1', 'key-1']);

      store.editRecipient({ postalCode: '9189914365' });
      store.resume();
      await store.pay();
      expect(sent.at(-1)!.checkoutKey).toBe('key-2');
    });

    it('بعد از رفرش (۳د): پیش‌نویس همان کلید را برمی‌گرداند، پس «پرداخت» دوباره همان سفارش است', async () => {
      await store.pay();
      const draft = store.draft();
      expect(draft).toMatchObject({ place: MASHHAD, recipient: RECIPIENT, pay: { key: 'key-1' }, order: 'tok' });

      const fresh = createCheckoutStore({
        api: net.api,
        now: () => clock,
        navigate: (url) => visited.push(url),
        newKey: () => `key-${++keys}`,
      });
      fresh.hydrate(JSON.parse(JSON.stringify(draft)));
      fresh.setAuth({ mobile: '09121234567' });
      expect((await fresh.start([ITEM])).ok).toBe(true);
      fresh.enterPay();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await fresh.pay();
      expect(sent.map((body) => body.checkoutKey)).toEqual(['key-1', 'key-1']);
    });

    it('عدد دیگر (۴۰۹): عدد تازه روی دکمه و دلیلش، و پرداخت دوم با همان عدد تازه', async () => {
      const after = breakdown(2_000_000, 1_377_500, 12);
      net.replies.placeOrder = async () => fail(409, 'price_changed', { totalRials: 2_000_000, breakdown: after });
      await store.pay();
      const { payNotice } = store.getState();
      expect(payNotice).toEqual({ kind: 'price_changed', change: { kind: 'pages', before: 10, after: 12 }, totalRials: 2_000_000 });
      expect(quoteOf(store.getState(), true)?.breakdown.totalRials).toBe(2_000_000);
      expect(visited).toEqual([]);
    });

    it('گیرنده‌ای که سرور نپذیرفت: برگشت به نشانی با همان فیلدها', async () => {
      net.replies.placeOrder = async () => fail(400, 'invalid_request', { fields: ['recipient.postalCode'] });
      expect(await store.pay()).toBe('address');
      expect(store.getState().recipientErrors).toEqual(['recipient.postalCode']);
    });

    it('نشستی که تمام شد (۴۰۱): دوباره کد، با همان شماره', async () => {
      net.replies.placeOrder = async () => fail(401, 'auth_required');
      expect(await store.pay()).toBeNull();
      expect(store.getState()).toMatchObject({
        stage: 'mobile',
        auth: null,
        mobile: '09121234567',
        mobileError: { kind: 'signed_out' },
      });
    });

    it('بقیهٔ شکست‌ها پیام همان قدم‌اند و سفارش را دوباره نمی‌سازند تا کاربر بزند', async () => {
      net.replies.placeOrder = async () => fail(409, 'files_expiring', { documentIds: ITEM.documentIds });
      await store.pay();
      expect(store.getState().payNotice).toMatchObject({ kind: 'failure', failure: { error: 'files_expiring' } });
      expect(store.getState().busy).toBeNull();
      expect(sent).toHaveLength(0);
    });
  });
});
