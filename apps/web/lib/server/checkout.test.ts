/**
 * مسیر خرید روی سرور (ADR-034، ADR-035) با پایگاه دادهٔ حافظه‌ای و ساعت ساختگی.
 *
 * ساعت شنبه ۴ مهر ۱۴۰۵، ۱۱:۳۰ تهران است: پرداخت امروز، تحویل به پست تا پایان دوشنبه ۶ مهر — همان تاریخی
 * که طرح `checkout.html` نشان می‌دهد.
 */

import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PriceList } from '@jozveyar/contracts';
import { MAX_FILES_PER_ORDER, MAX_ITEMS_PER_ORDER } from '@jozveyar/contracts/checkout';
import type { CheckoutDocument } from '@jozveyar/db';
import { quote } from '@jozveyar/pricing';
import { formatDeadlineDay } from '@jozveyar/text';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import type { SmsMessage, SmsTransport } from '@jozveyar/sms';

import { MOCK_AUTHORITY, PaymentError, mockGateway, type PaymentGateway } from '@jozveyar/payments';

import type { AuthUser } from './auth';
import { PAYMENT_ATTEMPT_TTL_MS, RETURN_KEY, createCheckoutService } from './checkout';
import { submitReview } from './reviews';
import { memoryDiscountCode, memoryOrderStore } from './testing';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const SARA: AuthUser = { userId: 'user-sara', mobile: '09121234567' };
const REZA: AuthUser = { userId: 'user-reza', mobile: '09351234567' };
const DAY = 86_400_000;
/** عددهای ADR-034، صریح: فایل دست‌کم یک ساعت دیگر زنده؛ تلاش پرداخت از ۷٫۲ ده دقیقه (سؤال ۱۴۴). */
const HOUR = 3_600_000;
const MINUTE = 60_000;
/** استان‌ها و شهرها از `@jozveyar/geo`. */
const TEHRAN = { provinceId: 8, cityId: 394 };
const MASHHAD = { provinceId: 11, cityId: 1326 };
const KARAJ_IN_TEHRAN = { provinceId: 8, cityId: 1094 };
/** چاپخانهٔ دوم در مشهد (برش ۵٫۲)، باز؛ `createdAt` را هر تست با ساعت خودش می‌دهد. */
const NOOR = {
  id: 'partner-noor',
  name: 'چاپ نور',
  cityId: 1326,
  provinceId: 11,
  isDefault: false,
  active: true,
  availability: 'open',
  closedFrom: null,
  closedUntil: null,
} as const;

describe('مسیر خرید روی سرور', () => {
  let clock: Date;
  let orders: ReturnType<typeof memoryOrderStore>;
  /** پیامک‌هایی که به آداپتور رسید (پیامک پرداخت از صف، برش ۷٫۱). */
  let sent: SmsMessage[];
  let service: ReturnType<typeof createCheckoutService>;
  const logs: string[] = [];
  const capture: SmsTransport = {
    name: 'console',
    async send(message) {
      sent.push(message);
      return { status: 'logged', providerMessageId: null };
    },
  };

  function build(transport: SmsTransport = capture, gateway: PaymentGateway = mockGateway({ newRefId: () => '803114' })) {
    service = createCheckoutService({
      orders,
      gateway,
      sms: { transport, outbox: orders.smsOutbox },
      callbackUrl: '/pay/callback',
      now: () => clock,
      log: (message) => logs.push(message),
    });
  }

  beforeEach(() => {
    clock = new Date('2026-09-26T08:00:00Z');
    orders = memoryOrderStore({ priceList: SEED_PRICE_LIST, now: () => clock });
    sent = [];
    logs.length = 0;
    build();
  });

  const later = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };

  function doc(pageCount: number, over: Partial<CheckoutDocument> = {}): string {
    const id = randomUUID();
    orders.documentsById.set(id, {
      id,
      sessionHash: ME,
      originalName: `جلسه ${pageCount}.pdf`,
      status: 'ready',
      pageCount,
      fileExpiresAt: new Date(clock.getTime() + 2 * DAY),
      fileDeletedAt: null,
      ...over,
    });
    return id;
  }

  const item = (documentIds: string[], over: Record<string, unknown> = {}) => ({
    documentIds,
    colorMode: 'bw',
    paperTypeId: 'tahrir80',
    sidesMode: 'double',
    bindingTypeId: 'spiral_clear',
    copies: 1,
    ...over,
  });

  const recipient = { name: 'سارا احمدی', addressText: 'تهران، خیابان ولیعصر، پلاک ۱۲، واحد ۳', postalCode: null };

  async function placed(documentIds: string[], over: Record<string, unknown> = {}) {
    const priced = await service.quote(ME, { items: [item(documentIds)], place: TEHRAN });
    if (!priced.ok) throw new Error(priced.error);
    const result = await service.placeOrder(ME, SARA, {
      items: [item(documentIds)],
      place: TEHRAN,
      recipient,
      checkoutKey: randomUUID(),
      expectedTotalRials: priced.value.breakdown.totalRials,
      quoteSnapshot: { totalRials: priced.value.breakdown.totalRials },
      ...over,
    });
    if (!result.ok) throw new Error(`${result.error} ${JSON.stringify(result)}`);
    return result.value;
  }

  /** همان کاری که صفحهٔ درگاه نمونه و بعد برگشت مرورگر می‌کنند: برگشت به نشانی کلیددار همان تلاش (برش ۷٫۲). */
  async function pay(redirectUrl: string, decision: 'success' | 'failure' | 'cancel') {
    const authority = redirectUrl.split('/').at(-1)!;
    const decided = await service.mockDecision(authority, { decision });
    if (!decided.ok) throw new Error(decided.error);
    return service.settle(keyOf(decided.value.redirectUrl));
  }

  /** کلید برگشت از نشانی برگشت (`/pay/callback/<کلید>`). */
  const keyOf = (url: string) => new URL(url, 'http://localhost').pathname.split('/').at(-1)!;
  /** کلید برگشت تلاشی که به این صفحهٔ درگاه رفت. */
  const returnKeyOf = (redirectUrl: string) => orders.payments.find((p) => p.authority === redirectUrl.split('/').at(-1))!.returnKey;

  describe('قیمت سرور', () => {
    it('اسکن زرد ۱۴۷ صفحه‌ای: ۲۸۰,۲۰۰ تومان، و کرایهٔ هر دو منطقه برای کارت شهر', async () => {
      const scan = doc(147);
      const result = await service.quote(ME, { items: [item([scan])], place: null });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.breakdown.totalRials).toBe(2_802_000);
      expect(result.value.breakdown.shippingRials).toBeNull();
      expect(result.value.shippingByZone).toEqual([
        { zoneId: 'tehran', name: 'استان تهران', shippingRials: 1_295_000 },
        { zoneId: 'other', name: 'بقیهٔ کشور', shippingRials: 1_377_500 },
      ]);

      const toMashhad = await service.quote(ME, { items: [item([scan])], place: MASHHAD });
      expect(toMashhad.ok && toMashhad.value.breakdown.totalRials).toBe(2_802_000 + 1_377_500);
    });

    it('تعداد صفحه از شمارش سرور است؛ عدد مرورگر اصلاً پذیرفته نمی‌شود', async () => {
      const scan = doc(147);
      const sent = { items: [{ ...item([scan]), pageCount: 1, sections: [{ documentId: scan, pageCount: 1 }] }], place: null };
      const result = await service.quote(ME, sent);
      expect(result.ok && result.value.breakdown.items[0]!.pageCount).toBe(147);
      expect(result.ok && result.value.breakdown.items[0]!.sections).toEqual([{ documentId: scan, pageCount: 147 }]);
    });

    it('جزوهٔ سه‌فایلی: یک قلم، بخش‌ها به ترتیب، یک صحافی', async () => {
      const ids = [doc(48), doc(54), doc(18)];
      const result = await service.quote(ME, { items: [item(ids)], place: null });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = quote(
        {
          items: [
            {
              sections: [
                { documentId: ids[0]!, pageCount: 48 },
                { documentId: ids[1]!, pageCount: 54 },
                { documentId: ids[2]!, pageCount: 18 },
              ],
              rules: [{ pageRanges: [[1, 120]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
              copies: 1,
              sidesMode: 'double',
              paperSize: 'a4',
              bindingTypeId: 'spiral_clear',
            },
          ],
          shipping: null,
        },
        SEED_PRICE_LIST,
      );
      expect(result.value.breakdown).toEqual(expected);
      expect(result.value.breakdown.items[0]!.volumes).toBe(1);
    });

    it('تعرفهٔ فعال پایگاه داده، نه تعرفهٔ درون کد', async () => {
      const scan = doc(100);
      const dearer: PriceList = { ...SEED_PRICE_LIST, version: 2, printRates: { a4: { single: { color: 30_000, bw: 20_000 }, double: { color: 30_000, bw: 20_000 } } } };
      orders.activate(dearer);
      const result = await service.quote(ME, { items: [item([scan])], place: null });
      expect(result.ok && result.value.breakdown.priceListVersion).toBe(2);
      expect(result.ok && result.value.breakdown.items[0]!.printRials).toBe(100 * 20_000);
    });

    it('سند نشست دیگر «نیست»؛ سند آماده‌نشده و فایلی که یک ساعت دیگر پاک می‌شود رد می‌شوند', async () => {
      const foreign = doc(10, { sessionHash: OTHER });
      expect(await service.quote(ME, { items: [item([foreign])] })).toMatchObject({ status: 404, error: 'documents_not_found', documentIds: [foreign] });
      const converting = doc(10, { status: 'converting', pageCount: null });
      expect(await service.quote(ME, { items: [item([converting])] })).toMatchObject({ status: 409, error: 'documents_not_ready' });
      const failed = doc(10, { status: 'failed' });
      expect(await service.quote(ME, { items: [item([failed])] })).toMatchObject({ error: 'documents_not_ready' });
      const soon = doc(10, { fileExpiresAt: new Date(clock.getTime() + HOUR - 1) });
      expect(await service.quote(ME, { items: [item([soon])] })).toMatchObject({ status: 409, error: 'files_expiring', documentIds: [soon] });
      const gone = doc(10, { fileDeletedAt: clock });
      expect(await service.quote(ME, { items: [item([gone])] })).toMatchObject({ error: 'files_expiring' });
      const fresh = doc(10, { fileExpiresAt: new Date(clock.getTime() + HOUR) });
      expect((await service.quote(ME, { items: [item([fresh])] })).ok).toBe(true);
    });

    it('یک سند دو بار در سفارش، جای ارسال نادرست، و بدنهٔ نادرست رد می‌شوند', async () => {
      const scan = doc(10);
      expect(await service.quote(ME, { items: [item([scan, scan])] })).toMatchObject({ status: 400, error: 'invalid_request' });
      expect(await service.quote(ME, { items: [item([scan])], place: KARAJ_IN_TEHRAN })).toMatchObject({ status: 400, error: 'invalid_place' });
      expect(await service.quote(ME, { items: [item([scan])], place: { provinceId: 99, cityId: null } })).toMatchObject({ error: 'invalid_place' });
      expect(await service.quote(ME, { items: [item(['not-a-uuid'])] })).toMatchObject({ status: 400, fields: ['items.0.documentIds.0'] });
      expect(await service.quote(ME, { items: [] })).toMatchObject({ status: 400 });
    });

    it('چند جزوه (۸٫۲): تا ۳۰ جزوه و ۳۰ فایل روی هم؛ هر جزوه قیمت خودش، و جمع یکی', async () => {
      // عدد خود تصمیم است (سؤال ۱۸۲)، نه ثابت قرارداد: سقفی که بی‌صدا عوض شود، تست را هم با خودش نبرد.
      expect([MAX_ITEMS_PER_ORDER, MAX_FILES_PER_ORDER]).toEqual([30, 30]);
      const thirty = Array.from({ length: 30 }, () => item([doc(10)]));
      const many = await service.quote(ME, { items: thirty });
      expect(many.ok && many.value.breakdown.items).toHaveLength(30);
      expect(await service.quote(ME, { items: [...thirty, item([doc(10)])] })).toMatchObject({ status: 400, fields: ['items'] });
      // ۳۱ فایل در دو جزوه: هر جزوه زیر سقف خودش، ولی سفارش نه.
      const files = Array.from({ length: 31 }, () => doc(4));
      expect(await service.quote(ME, { items: [item(files.slice(0, 16)), item(files.slice(16))] })).toMatchObject({
        status: 400,
        error: 'invalid_request',
        fields: ['items'],
      });
      const two = await service.quote(ME, { items: [item(files.slice(0, 15)), item(files.slice(15, 30), { colorMode: 'color' })] });
      expect(two.ok).toBe(true);
      if (!two.ok) return;
      const [bw, color] = two.value.breakdown.items;
      expect([bw!.pageCount, color!.pageCount]).toEqual([60, 60]);
      expect(color!.printRials).toBeGreaterThan(bw!.printRials);
      expect(two.value.breakdown.subtotalRials).toBe(bw!.totalRials + color!.totalRials);
    });

    it('شهری که در فهرست نیست: استان کافی است', async () => {
      const scan = doc(10);
      const result = await service.quote(ME, { items: [item([scan])], place: { provinceId: 11, cityId: null } });
      expect(result.ok && result.value.breakdown.shippingRials).toBe(1_377_500);
    });

    it('روش ارسالی که در تعرفهٔ فعال خاموش است: ۵۰۳ روشن، نه کرایهٔ صفر', async () => {
      orders.activate({
        ...SEED_PRICE_LIST,
        version: 3,
        shippingMethods: { ...SEED_PRICE_LIST.shippingMethods, post: { nameFa: 'پست پیشتاز', enabled: false } },
      });
      expect(await service.quote(ME, { items: [item([doc(10)])], place: TEHRAN })).toMatchObject({ status: 503, error: 'shipping_unavailable' });
    });
  });

  describe('ساختن سفارش با «پرداخت»', () => {
    it('بی نشست کد پیامکی ساخته نمی‌شود', async () => {
      expect(await service.placeOrder(ME, null, {})).toMatchObject({ status: 401, error: 'auth_required' });
    });

    it('سفارش در یک تراکنش، با قیمت و شمارش سرور؛ پرداخت همان لحظه شروع می‌شود', async () => {
      const ids = [doc(48), doc(54)];
      const result = await placed(ids);
      expect(result.order).toMatchObject({ number: 10_001, status: 'awaiting_payment', totalRials: 3_377_000 });
      expect(result.payment!.redirectUrl).toMatch(/^\/pay\/mock\/MOCK[0-9A-F]{32}$/);

      const [order] = orders.orders;
      expect(order).toMatchObject({
        userId: SARA.userId,
        recipientPhone: SARA.mobile,
        provinceId: 8,
        cityId: 394,
        shippingZoneId: 'tehran',
        shippingMethodId: 'post',
        slaDays: 2,
        totalRials: 3_377_000,
        shippingRials: 1_295_000,
        quoteSnapshot: { totalRials: 3_377_000 },
      });
      expect(orders.items).toEqual([
        expect.objectContaining({
          seq: 1,
          pageCount: 102,
          sections: [
            { seq: 1, documentId: ids[0], pageCount: 48 },
            { seq: 2, documentId: ids[1], pageCount: 54 },
          ],
          rules: [expect.objectContaining({ seq: 1, pageRanges: [[1, 102]], colorMode: 'bw', paperTypeId: 'tahrir80' })],
        }),
      ]);
      expect(orders.events).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'awaiting_payment', actor: 'user' })]);
      expect(orders.payments).toEqual([
        expect.objectContaining({ provider: 'mock', amountRials: 3_377_000, status: 'pending' }),
      ]);
      expect(orders.payments[0]!.authority).toMatch(MOCK_AUTHORITY);
    });

    it('عددی که دیده شد، همان که پرداخت می‌شود: عدد دیگر = ۴۰۹ با عدد تازه، و سفارشی ساخته نمی‌شود', async () => {
      const scan = doc(147);
      const result = await service.placeOrder(ME, SARA, {
        items: [item([scan])],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: 2_802_000,
      });
      expect(result).toMatchObject({ status: 409, error: 'price_changed', totalRials: 2_802_000 + 1_295_000 });
      expect(orders.orders).toHaveLength(0);
    });

    it('یک کلید، یک سفارش: تلاش دوباره همان سفارش را برمی‌گرداند؛ کلید کس دیگر ۴۰۹', async () => {
      const scan = doc(20);
      const body = {
        items: [item([scan])],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: 0,
      };
      const priced = await service.quote(ME, { items: [item([scan])], place: TEHRAN });
      body.expectedTotalRials = priced.ok ? priced.value.breakdown.totalRials : 0;
      const first = await service.placeOrder(ME, SARA, body);
      const again = await service.placeOrder(ME, SARA, body);
      expect(first.ok && again.ok).toBe(true);
      if (!first.ok || !again.ok) return;
      expect(again.value.order).toEqual(first.value.order);
      expect(orders.orders).toHaveLength(1);
      // هر تلاش یک ردیف پرداخت، با همان مبلغ منجمد.
      expect(orders.payments).toHaveLength(2);
      expect(await service.placeOrder(ME, REZA, body)).toMatchObject({ status: 409, error: 'checkout_key_conflict' });
    });

    it('نشانی فارسی‌نرمال می‌شود؛ کد پستی با ارقام فارسی و خط تیره پذیرفته می‌شود', async () => {
      const scan = doc(20);
      await placed([scan], {
        recipient: { name: '  سارا   احمدي ', addressText: 'مشهد،\nبلوار وكيل‌آباد ۱۲', postalCode: '۹۱۸۹۹-۱۴۳۶۵' },
        place: TEHRAN,
      });
      expect(orders.orders[0]).toMatchObject({
        recipientName: 'سارا احمدی',
        addressText: 'مشهد، بلوار وکیل‌آباد 12',
        postalCode: '9189914365',
      });
    });

    it('فیلدهای نادرست با نامشان برمی‌گردند', async () => {
      const scan = doc(20);
      const result = await service.placeOrder(ME, SARA, {
        items: [item([scan])],
        place: TEHRAN,
        recipient: { name: 'س', addressText: 'کوتاه', postalCode: '12345' },
        checkoutKey: randomUUID(),
        expectedTotalRials: 1,
      });
      expect(result).toMatchObject({
        status: 400,
        error: 'invalid_request',
        fields: ['recipient.name', 'recipient.addressText', 'recipient.postalCode'],
      });
      expect(await service.placeOrder(ME, SARA, { items: [item([scan])] })).toMatchObject({
        status: 400,
        fields: expect.arrayContaining(['place', 'recipient', 'checkoutKey', 'expectedTotalRials']),
      });
    });

    it('هشدار قیمت (صحافی ناموجود) سفارش نمی‌سازد', async () => {
      const scan = doc(20);
      const result = await service.placeOrder(ME, SARA, {
        items: [item([scan], { bindingTypeId: 'gold_leaf' })],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: 1,
      });
      expect(result).toMatchObject({ status: 422, error: 'quote_warnings', warnings: ['binding_type_unavailable'] });
    });

    it('اندازهٔ کاغذ (۸٫۳): A5 با تعرفه‌ای که A5 دارد سفارش A5 می‌سازد؛ بی اندازه (زبانهٔ پیش از ۸٫۳) A4 است', async () => {
      const spiral = SEED_PRICE_LIST.bindingTypes.spiral_clear!;
      const catalog: PriceList = {
        ...SEED_PRICE_LIST,
        version: 3,
        printRates: {
          ...SEED_PRICE_LIST.printRates,
          a5: { single: { color: 15_000, bw: 12_000 }, double: { color: 13_000, bw: 10_000 } },
        },
        paperTypes: { tahrir80: { ...SEED_PRICE_LIST.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0 } } },
        bindingTypes: { spiral_clear: { ...spiral, bands: { ...spiral.bands, a5: [{ minSheets: 1, maxSheets: 800, priceRials: 400_000 }] } } },
      };
      orders.activate(catalog);
      const scan = doc(100);
      const quoted = await service.quote(ME, { items: [item([scan], { paperSize: 'a5' })], place: TEHRAN });
      expect(quoted.ok && quoted.value.breakdown.items[0]).toMatchObject({ paperSize: 'a5', printRials: 100 * 10_000, bindingRials: 400_000 });
      const total = quoted.ok ? quoted.value.breakdown.totalRials : 0;
      await placed([scan], { items: [item([scan], { paperSize: 'a5' })], expectedTotalRials: total, quoteSnapshot: { totalRials: total } });
      expect(orders.items.at(-1)).toMatchObject({ paperSize: 'a5' });
      // زبانه‌ای که پیش از استقرار باز بود اندازه نمی‌فرستد: همان A4
      const old = await service.quote(ME, { items: [item([scan])], place: null });
      expect(old.ok && old.value.breakdown.items[0]).toMatchObject({ paperSize: 'a4', printRials: 100 * 16_000 });
    });

    it('اندازه‌ای که تعرفه ندارد و صحافی‌ای که به جزوه نمی‌خورد سفارش نمی‌سازند؛ اندازهٔ ناشناس ۴۰۰', async () => {
      const scan = doc(113);
      const attempt = (over: Record<string, unknown>) =>
        service.placeOrder(ME, SARA, { items: [item([scan], over)], place: TEHRAN, recipient, checkoutKey: randomUUID(), expectedTotalRials: 1 });
      expect(await attempt({ paperSize: 'a3' })).toMatchObject({ status: 422, error: 'quote_warnings', warnings: expect.arrayContaining(['paper_size_unavailable']) });
      expect(await attempt({ paperSize: 'b5' })).toMatchObject({ status: 400, fields: ['items.0.paperSize'] });
      const staple = {
        nameFa: 'منگنه',
        enabled: true,
        minSheets: 1,
        maxSheetsPerVolume: 50,
        splitsVolumes: false,
        weightPerVolumeGrams: 1,
        bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 80_000 }] },
      };
      orders.activate({ ...SEED_PRICE_LIST, version: 4, bindingTypes: { ...SEED_PRICE_LIST.bindingTypes, staple } });
      // ۱۱۳ صفحهٔ دورو = ۵۷ برگ، منگنه تا ۵۰
      expect(await attempt({ bindingTypeId: 'staple' })).toMatchObject({
        status: 422,
        error: 'quote_warnings',
        warnings: expect.arrayContaining(['binding_does_not_fit']),
      });
      expect(orders.orders).toEqual([]);
    });

    it('سقف صفحهٔ هر فایل (۸٫۴): با شمارش سرور و تنظیم همین لحظه، در قیمت و در سفارش؛ ۴۲۲ با شناسهٔ همان فایل‌ها و سقف', async () => {
      const small = doc(300);
      const big = doc(301);
      expect((await service.quote(ME, { items: [item([small, big])], place: null })).ok).toBe(true);
      orders.settings.set('file.max_pages', 300);
      expect(await service.quote(ME, { items: [item([small, big])], place: null })).toMatchObject({
        status: 422,
        error: 'too_many_pages',
        documentIds: [big],
        maxPages: 300,
      });
      const attempt = await service.placeOrder(ME, SARA, {
        items: [item([small]), item([big])],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: 1,
      });
      expect(attempt).toMatchObject({ status: 422, error: 'too_many_pages', documentIds: [big] });
      expect(orders.orders).toEqual([]);
      // تنظیم خراب: پیش‌فرض ۱٬۵۰۰، با لاگ.
      orders.settings.set('file.max_pages', 0);
      expect((await service.quote(ME, { items: [item([small, big])], place: null })).ok).toBe(true);
      expect(logs.some((line) => line.includes('file.max_pages'))).toBe(true);
    });

    it('گزینهٔ موقتاً خاموش (۸٫۴، سؤال ۱۸۸): نه قیمت نه سفارش، ۴۰۹ با فهرست همین لحظه؛ پیش‌فرض‌ها و A4 هرگز خاموش نیستند', async () => {
      const spiral = SEED_PRICE_LIST.bindingTypes.spiral_clear!;
      const staple = {
        nameFa: 'منگنه',
        enabled: true,
        minSheets: 1,
        maxSheetsPerVolume: 50,
        splitsVolumes: false,
        weightPerVolumeGrams: 1,
        bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 80_000 }], a5: [{ minSheets: 1, maxSheets: 50, priceRials: 60_000 }] },
      };
      orders.activate({
        ...SEED_PRICE_LIST,
        version: 5,
        printRates: { ...SEED_PRICE_LIST.printRates, a5: { single: { color: 15_000, bw: 12_000 }, double: { color: 13_000, bw: 10_000 } } },
        paperTypes: { tahrir80: { ...SEED_PRICE_LIST.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0 } } },
        bindingTypes: { spiral_clear: { ...spiral, bands: { ...spiral.bands, a5: [{ minSheets: 1, maxSheets: 800, priceRials: 400_000 }] } }, staple },
      });
      const scan = doc(40);
      // A4، تحریر و طلق و سیم هم در فهرست باشند، دیده نمی‌شوند.
      orders.settings.set('catalog.paused', { sizes: ['a5'], papers: ['tahrir80'], bindings: ['staple', 'spiral_clear'] });
      const conflict = { status: 409, error: 'option_unavailable', paused: { sizes: ['a5'], papers: [], bindings: ['staple'] } };
      expect(await service.quote(ME, { items: [item([scan], { paperSize: 'a5' })], place: null })).toMatchObject(conflict);
      expect(await service.quote(ME, { items: [item([scan], { bindingTypeId: 'staple' })], place: null })).toMatchObject(conflict);
      const attempt = await service.placeOrder(ME, SARA, {
        items: [item([scan]), item([doc(30)], { bindingTypeId: 'staple' })],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: 1,
      });
      expect(attempt).toMatchObject(conflict);
      expect(orders.orders).toEqual([]);
      // پیش‌فرض‌ها قیمت می‌خورند، با همان قیمت
      const plain = await service.quote(ME, { items: [item([scan])], place: null });
      expect(plain.ok && plain.value.breakdown.items[0]).toMatchObject({ paperSize: 'a4', printRials: 40 * 16_000 });
      // روشن شدن دوباره، بی نسخهٔ تازه
      orders.settings.set('catalog.paused', { sizes: [], papers: [], bindings: [] });
      expect((await service.quote(ME, { items: [item([scan], { bindingTypeId: 'staple' })], place: null })).ok).toBe(true);
    });

    it('فایلی که کمتر از یک ساعت زنده است: «دوباره بینداز»، نه سفارش', async () => {
      const scan = doc(20, { fileExpiresAt: new Date(clock.getTime() + HOUR / 2) });
      const result = await service.placeOrder(ME, SARA, {
        items: [item([scan])],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: 1,
      });
      expect(result).toMatchObject({ status: 409, error: 'files_expiring', documentIds: [scan] });
    });

    it('ریز قیمت مرورگر فقط شیء، و نه بیش از ۶۴ کیلوبایت', async () => {
      const scan = doc(20);
      const body = { items: [item([scan])], place: TEHRAN, recipient, checkoutKey: randomUUID(), expectedTotalRials: 1 };
      expect(await service.placeOrder(ME, SARA, { ...body, quoteSnapshot: 'x'.repeat(10) })).toMatchObject({ fields: ['quoteSnapshot'] });
      expect(await service.placeOrder(ME, SARA, { ...body, quoteSnapshot: { x: 'y'.repeat(70_000) } })).toMatchObject({
        fields: ['quoteSnapshot'],
      });
    });

    it('روز کاری تحویل از تنظیم، منجمد در سفارش', async () => {
      orders.settings.set('order.sla_days', 3);
      await placed([doc(20)]);
      expect(orders.orders[0]!.slaDays).toBe(3);
    });
  });

  describe('پرداخت و برگشت از درگاه', () => {
    it('موفق: پرداخت‌شده، مهلت تحویل به پست دوشنبه ۶ مهر، رویداد، کارهای prepare_order و prepare_ticket و پیامک', async () => {
      const { order, payment } = await placed([doc(120)]);
      const result = await pay(payment!.redirectUrl, 'success');
      expect(result).toEqual({ ok: true, value: { token: order.token, payment: 'succeeded' } });

      const [row] = orders.orders;
      expect(row).toMatchObject({ status: 'paid', paidAt: clock });
      // پایان انحصاری دوشنبه ۶ مهر به وقت تهران = نیمه‌شب سه‌شنبه = ۲۰:۳۰ دوشنبه UTC.
      expect(row!.postHandoffDueAt!.toISOString()).toBe('2026-09-28T20:30:00.000Z');
      expect(orders.payments[0]).toMatchObject({ status: 'succeeded', refId: '803114', verifiedAt: clock });
      expect(orders.events.at(-1)).toMatchObject({ fromStatus: 'awaiting_payment', toStatus: 'paid', actor: 'gateway' });
      expect(orders.jobs).toEqual([
        { kind: 'prepare_order', orderId: row!.id },
        { kind: 'prepare_ticket', orderId: row!.id },
      ]);
      // پیامک پرداخت از صف (برش ۷٫۱): ردیف منتظر در همان تراکنش، و بعد از commit همان به آداپتور، با دو پارامتر قالب.
      expect(sent).toEqual([
        {
          to: SARA.mobile,
          purpose: 'order_paid',
          text: 'جزوه‌یار: سفارش 10001 پرداخت شد؛ تحویل به پست تا دوشنبه 6 مهر',
          params: ['10001', 'دوشنبه 6 مهر'],
        },
      ]);
      expect(orders.payments[0]!.smsMessageId).toBe(1);
      expect(orders.sms.get(1)).toMatchObject({ status: 'logged', attempts: 1, to: SARA.mobile });
    });

    it('پرداخت چاپخانه را هم انتخاب می‌کند (برش ۵٫۲): هم‌شهر، وگرنه هم‌استان، وگرنه نزدیک‌ترین (۱۰٫۱)؛ کرایه همان', async () => {
      /** سفارش در یک جا، با قیمت همان جا. */
      async function placedAt(place: { provinceId: number; cityId: number | null }) {
        const documentIds = [doc(10)];
        const priced = await service.quote(ME, { items: [item(documentIds)], place });
        if (!priced.ok) throw new Error(priced.error);
        const result = await service.placeOrder(ME, SARA, {
          items: [item(documentIds)],
          place,
          recipient,
          checkoutKey: randomUUID(),
          expectedTotalRials: priced.value.breakdown.totalRials,
        });
        if (!result.ok) throw new Error(result.error);
        await pay(result.value.payment!.redirectUrl, 'success');
        return orders.orders.find((o) => o.publicToken === result.value.order.token)!;
      }
      orders.partners.push({ ...NOOR, createdAt: clock });
      const tehran = await placedAt(TEHRAN);
      const mashhad = await placedAt(MASHHAD);
      const neyshabur = await placedAt({ provinceId: 11, cityId: 1447 });
      const shiraz = await placedAt({ provinceId: 17, cityId: 911 });
      expect([tehran, mashhad, neyshabur, shiraz].map((o) => o.printPartnerId)).toEqual([
        'partner-jozveyar',
        'partner-noor',
        'partner-noor',
        'partner-jozveyar',
      ]);
      // شیراز: هیچ چاپخانه‌ای در فارس نیست؛ تهران (حدود ۶۸۰ کیلومتر) نزدیک‌تر از مشهد (حدود ۹۷۰) است (۱۰٫۱).
      expect(orders.assignments.map((a) => a.rule)).toEqual(['city', 'city', 'province', 'nearest']);
      // کرایهٔ مشتری همان کرایهٔ استانش است، هر جا چاپ شود (ADR-042).
      expect(mashhad.shippingZoneId).toBe('other');
      expect(tehran.shippingZoneId).toBe('tehran');
    });

    it('پیامک سفارش تازه به چاپخانهٔ با موبایل اعلان (برش ۷٫۶): در همان پرداخت، و بعد از commit با پیامک پرداخت؛ بی موبایل هیچ', async () => {
      orders.partners.push({ ...NOOR, createdAt: clock, notifyMobile: '09151234567' });
      const tehran = await placed([doc(10)]);
      await pay(tehran.payment!.redirectUrl, 'success');
      // چاپخانهٔ پیش‌فرض موبایل اعلان ندارد: فقط پیامک پرداخت.
      expect(sent.map((message) => message.purpose)).toEqual(['order_paid']);
      expect(orders.assignments.at(-1)).toMatchObject({ toPartnerId: 'partner-jozveyar', smsMessageId: null });
      sent.length = 0;

      const documentIds = [doc(10)];
      const priced = await service.quote(ME, { items: [item(documentIds)], place: MASHHAD });
      if (!priced.ok) throw new Error(priced.error);
      const placedMashhad = await service.placeOrder(ME, SARA, {
        items: [item(documentIds)],
        place: MASHHAD,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: priced.value.breakdown.totalRials,
      });
      if (!placedMashhad.ok) throw new Error(placedMashhad.error);
      expect(await pay(placedMashhad.value.payment!.redirectUrl, 'success')).toMatchObject({ value: { payment: 'succeeded' } });
      expect(sent).toEqual([
        {
          to: SARA.mobile,
          purpose: 'order_paid',
          text: 'جزوه‌یار: سفارش 10002 پرداخت شد؛ تحویل به پست تا دوشنبه 6 مهر',
          params: ['10002', 'دوشنبه 6 مهر'],
        },
        {
          to: '09151234567',
          purpose: 'partner_order',
          text: 'جزوه‌یار: سفارش تازه 10002؛ تحویل به پست تا دوشنبه 6 مهر',
          params: ['10002', 'دوشنبه 6 مهر'],
        },
      ]);
      const assignment = orders.assignments.at(-1)!;
      expect(assignment).toMatchObject({ toPartnerId: 'partner-noor', rule: 'city' });
      expect(orders.sms.get(assignment.smsMessageId!)).toMatchObject({ purpose: 'partner_order', status: 'logged', attempts: 1, to: '09151234567' });
    });

    it('پیامک چاپخانه‌ای که نرفت پرداخت را برنمی‌گرداند (برش ۷٫۶): ردیفش «نرفت» می‌ماند، پیامک پرداخت همان', async () => {
      orders.partners[0]!.notifyMobile = '09121112233';
      build({
        name: 'flaky',
        async send(message) {
          if (message.purpose === 'partner_order') throw new Error('panel down');
          sent.push(message);
          return { status: 'sent', providerMessageId: '1', cost: 1 };
        },
      });
      const { payment } = await placed([doc(10)]);
      expect(await pay(payment!.redirectUrl, 'success')).toMatchObject({ value: { payment: 'succeeded' } });
      expect(orders.orders[0]!.status).toBe('paid');
      expect(sent.map((message) => message.purpose)).toEqual(['order_paid']);
      const assignment = orders.assignments.at(-1)!;
      expect(orders.sms.get(assignment.smsMessageId!)).toMatchObject({ purpose: 'partner_order', status: 'failed', error: 'unavailable', attempts: 1 });
      expect(logs.some((line) => line.includes('partner_order') && line.includes('نرفت'))).toBe(true);
      expect(logs.some((line) => line.includes('panel down'))).toBe(false);
    });

    it('بی چاپخانهٔ فعال پرداخت همان است و سفارش بی چاپخانه می‌ماند، نه بن‌بست (برش ۵٫۲)', async () => {
      orders.partners[0]!.active = false;
      const { order, payment } = await placed([doc(10)]);
      expect(await pay(payment!.redirectUrl, 'success')).toEqual({ ok: true, value: { token: order.token, payment: 'succeeded' } });
      expect(orders.orders[0]).toMatchObject({ status: 'paid', printPartnerId: null });
      expect(orders.assignments).toEqual([]);
      expect(orders.jobs).toHaveLength(2);
      expect(sent).toHaveLength(1);
    });

    it('حالت دستی (برش ۱۰٫۱، سؤال ۱۹۹): پرداخت همان است و سفارش بی چاپخانه می‌ماند تا متصدی بسپاردش', async () => {
      orders.settings.set('assignment.mode', 'manual');
      const { order, payment } = await placed([doc(10)]);
      expect(await pay(payment!.redirectUrl, 'success')).toEqual({ ok: true, value: { token: order.token, payment: 'succeeded' } });
      expect(orders.orders[0]).toMatchObject({ status: 'paid', printPartnerId: null });
      expect(orders.assignments).toEqual([]);
      expect(orders.jobs).toHaveLength(2);
    });

    it('همه تعطیل (برش ۱۰٫۱، سؤال ۲۶۵): سفارش پیش اولین چاپخانه‌ای که باز می‌شود، و مهلت تحویل به پست روزهای «همه تعطیل» را نمی‌شمارد', async () => {
      // امروز شنبه ۴ مهر است. جزوه‌یار تا پایان ۶ مهر تعطیل است و چاپ نور تا پایان ۵ مهر؛ پس ۴ و ۵ مهر هیچ‌کس چاپ نمی‌کند.
      const day4 = new Date('2026-09-25T20:30:00Z');
      orders.partners[0]!.availability = 'closed';
      orders.partners[0]!.closedFrom = day4;
      orders.partners[0]!.closedUntil = new Date(day4.getTime() + 3 * DAY);
      orders.partners.push({ ...NOOR, createdAt: clock, availability: 'closed', closedFrom: day4, closedUntil: new Date(day4.getTime() + 2 * DAY) });
      const { payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      expect(orders.orders[0]!.printPartnerId).toBe('partner-noor');
      expect(orders.assignments.map((a) => a.rule)).toEqual(['reopening']);
      // بی تعطیلی: تا پایان دوشنبه ۶ مهر. ۵ مهر روز کاری نیست، پس دوشنبه و سه‌شنبه: تا پایان سه‌شنبه ۷ مهر.
      expect(formatDeadlineDay(orders.orders[0]!.postHandoffDueAt!)).toBe('سه‌شنبه 7 مهر');
      expect(sent[0]!.params).toContain('سه‌شنبه 7 مهر');
    });

    it('تعطیلی یک چاپخانه مهلت را عوض نمی‌کند؛ سفارش به چاپخانهٔ باز می‌رود (برش ۱۰٫۱)', async () => {
      const day4 = new Date('2026-09-25T20:30:00Z');
      orders.partners[0]!.availability = 'closed';
      orders.partners[0]!.closedFrom = day4;
      orders.partners[0]!.closedUntil = new Date(day4.getTime() + 3 * DAY);
      orders.partners.push({ ...NOOR, createdAt: clock });
      const { payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      expect(orders.orders[0]!.printPartnerId).toBe('partner-noor');
      expect(orders.assignments.map((a) => a.rule)).toEqual(['nearest']);
      expect(formatDeadlineDay(orders.orders[0]!.postHandoffDueAt!)).toBe('دوشنبه 6 مهر');
    });

    it('برگشت تکراری (رفرش) همان نتیجه است: پیامک و کار دوم نمی‌سازد', async () => {
      const { payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      expect(await service.settle(returnKeyOf(payment!.redirectUrl))).toMatchObject({ ok: true, value: { payment: 'succeeded' } });
      expect(orders.jobs).toHaveLength(2);
      expect(orders.assignments).toHaveLength(1);
      expect(sent).toHaveLength(1);
      expect(orders.sms.size).toBe(1);
    });

    it('برگشت هیچ پارامتر درگاه نمی‌خواند: سنجش با استعلام؛ برگشت زودرس یا دست‌ساز تلاش را نمی‌سوزاند (ADR-050)', async () => {
      const { payment, order } = await placed([doc(10)]);
      expect(await pay(payment!.redirectUrl, 'failure')).toMatchObject({ ok: true, value: { payment: 'failed' } });
      expect(orders.orders[0]!.status).toBe('awaiting_payment');
      expect(orders.payments[0]).toMatchObject({ status: 'failed', failureCode: 'declined', gatewayStatus: 5, settledVia: 'callback' });
      // علت کارت برای مشتری (سؤال ۱۳۱): «با کارت دیگری دوباره پرداخت کن».
      const declined = await service.orderView(order.token, SARA);
      expect(declined.ok && declined.value.details?.lastPayment).toMatchObject({ failureGroup: 'card', cardReason: 'موجودی کارت کافی نبود', unpaid: false });

      // برگشت پیش از هر تصمیمی (زودرس، یا نشانی دست‌ساز): درگاه «در انتظار پرداخت» می‌گوید، پس تلاش باز می‌ماند.
      later(1000);
      const again = await service.payAgain(SARA, order.token);
      if (!again.ok) throw new Error(again.error);
      const key = returnKeyOf(again.value.payment!.redirectUrl);
      expect(await service.settle(key)).toMatchObject({ value: { payment: 'pending' } });
      const early = orders.payments.find((p) => p.returnKey === key)!;
      expect(early).toMatchObject({ status: 'pending', gatewayStatus: -1, gatewayError: null, failureCode: null });
      expect(early.returnedAt).toEqual(clock);
      const view = await service.orderView(order.token, SARA);
      expect(view.ok && view.value.details).toMatchObject({
        canPay: true,
        checking: null,
        lastPayment: { status: 'pending', gatewayStatus: -1, unpaid: true, failureGroup: null, gateway: 'درگاه نمونه' },
      });
      // و همان تلاش بعد هنوز پرداختنی است.
      expect(await pay(again.value.payment!.redirectUrl, 'success')).toMatchObject({ value: { payment: 'succeeded' } });
      expect(orders.jobs).toHaveLength(2);
    });

    it('پرداخت ناموفق: سفارش با همان قیمت می‌ماند و «دوباره پرداخت کن» تلاش تازه است', async () => {
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'cancel');
      const view = await service.orderView(order.token, SARA);
      expect(view.ok && view.value.details).toMatchObject({
        canPay: true,
        checking: null,
        lastPayment: { status: 'failed', failureCode: 'cancelled', failureGroup: 'cancelled', cardReason: null, unpaid: false },
      });

      const again = await service.payAgain(SARA, order.token);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.value.payment!.redirectUrl).not.toBe(payment!.redirectUrl);
      expect(orders.payments.map((p) => p.amountRials)).toEqual([order.totalRials, order.totalRials]);
      await pay(again.value.payment!.redirectUrl, 'success');
      expect(orders.orders[0]!.status).toBe('paid');
    });

    it('مهلت هر تلاش ۱۰ دقیقه (سؤال ۱۴۴): پس از آن verify هرگز، تلاش «مهلت گذشت» با وضعیت درگاه؛ تا خود مهلت پذیرفته', async () => {
      expect(PAYMENT_ATTEMPT_TTL_MS).toBe(10 * MINUTE);
      const { payment } = await placed([doc(10)]);
      const authority = payment!.redirectUrl.split('/').at(-1)!;
      await service.mockDecision(authority, { decision: 'success' });
      later(PAYMENT_ATTEMPT_TTL_MS + 1);
      expect(await service.settle(returnKeyOf(payment!.redirectUrl))).toMatchObject({ value: { payment: 'failed' } });
      expect(orders.payments[0]).toMatchObject({ failureCode: 'expired', gatewayStatus: 2, refId: null });
      expect(orders.orders[0]!.status).toBe('awaiting_payment');

      const second = await service.payAgain(SARA, orders.orders[0]!.publicToken);
      if (!second.ok) throw new Error(second.error);
      await service.mockDecision(second.value.payment!.redirectUrl.split('/').at(-1)!, { decision: 'success' });
      later(PAYMENT_ATTEMPT_TTL_MS);
      expect(await service.settle(returnKeyOf(second.value.payment!.redirectUrl))).toMatchObject({ value: { payment: 'succeeded' } });
    });

    it('سفارش پرداخت‌شده دوباره پرداخت نمی‌شود: تلاش دیگرش سنجیده نمی‌شود', async () => {
      const scan = doc(10);
      const body = { items: [item([scan])], place: TEHRAN, recipient, checkoutKey: randomUUID(), expectedTotalRials: 0 };
      const priced = await service.quote(ME, { items: [item([scan])], place: TEHRAN });
      body.expectedTotalRials = priced.ok ? priced.value.breakdown.totalRials : 0;
      const first = await service.placeOrder(ME, SARA, body);
      const second = await service.placeOrder(ME, SARA, body); // دو زبانه، یک سفارش
      if (!first.ok || !second.ok) throw new Error('placeOrder');
      await pay(first.value.payment!.redirectUrl, 'success');
      expect(await pay(second.value.payment!.redirectUrl, 'success')).toMatchObject({ value: { payment: 'failed' } });
      expect(orders.payments.map((p) => [p.status, p.failureCode])).toEqual([
        ['succeeded', null],
        ['failed', 'order_not_payable'],
      ]);
      // و «دوباره پرداخت کن» برای سفارش پرداخت‌شده درگاه باز نمی‌کند.
      expect(await service.payAgain(SARA, first.value.order.token)).toMatchObject({ ok: true, value: { payment: null } });
    });

    it('تعطیلی رسمی از تنظیم شمرده نمی‌شود؛ تنظیم خراب به پیش‌فرض برمی‌گردد و لاگ می‌شود', async () => {
      orders.settings.set('calendar.holidays', [{ date: '1405/07/05', title: 'آزمایش' }]);
      const first = await placed([doc(10)]);
      await pay(first.payment!.redirectUrl, 'success');
      // یکشنبه تعطیل است: دوشنبه و سه‌شنبه، پس تا پایان سه‌شنبه ۷ مهر.
      expect(orders.orders[0]!.postHandoffDueAt!.toISOString()).toBe('2026-09-29T20:30:00.000Z');

      orders.settings.set('calendar.holidays', 'خراب');
      const second = await placed([doc(10)]);
      await pay(second.payment!.redirectUrl, 'success');
      expect(orders.orders[1]!.postHandoffDueAt!.toISOString()).toBe('2026-09-28T20:30:00.000Z');
      expect(logs.some((line) => line.includes('calendar.holidays'))).toBe(true);
    });

    it('پیامکی که نرفت پرداخت را برنمی‌گرداند: ردیفش «نرفت» می‌ماند، برای «دوباره بفرست» پنل', async () => {
      build({ name: 'broken', send: async () => Promise.reject(new Error('panel down')) });
      const { payment } = await placed([doc(10)]);
      expect(await pay(payment!.redirectUrl, 'success')).toMatchObject({ value: { payment: 'succeeded' } });
      expect(orders.orders[0]!.status).toBe('paid');
      expect(orders.sms.get(1)).toMatchObject({ status: 'failed', error: 'unavailable', attempts: 1 });
      expect(logs.some((line) => line.includes('order_paid') && line.includes('نرفت'))).toBe(true);
      // و خود خطا (متن پنل) در لاگ نیست، فقط کدش.
      expect(logs.some((line) => line.includes('panel down'))).toBe(false);
    });

    it('کلید برگشت ناشناس یا بدشکل: ۴۰۴؛ شناسهٔ تلاش درگاه (Authority) کلید برگشت نیست', async () => {
      const { payment } = await placed([doc(10)]);
      expect(await service.settle('0'.repeat(32))).toMatchObject({ status: 404 });
      expect(await service.settle('../../etc')).toMatchObject({ status: 404 });
      expect(await service.settle('')).toMatchObject({ status: 404 });
      expect(await service.settle(payment!.redirectUrl.split('/').at(-1)!)).toMatchObject({ status: 404 });
      // کلید بدشکل حتی به ذخیره‌گاه نمی‌رسد.
      const settle = vi.spyOn(orders, 'settle');
      for (const key of ['ABC', 'F'.repeat(32), 'f'.repeat(31), `${'a'.repeat(32)}x`, `${'a'.repeat(31)}/`]) {
        expect(await service.settle(key), key).toMatchObject({ status: 404 });
      }
      expect(settle).not.toHaveBeenCalled();
    });

    it('فایل‌های سفارش در انتظار پاک شد: «دوباره پرداخت کن» سفارش را منقضی می‌کند', async () => {
      const scan = doc(10);
      const { order, payment } = await placed([scan]);
      await pay(payment!.redirectUrl, 'cancel');
      later(2 * DAY - HOUR + 1);
      expect(await service.payAgain(SARA, order.token)).toMatchObject({ status: 409, error: 'order_expired' });
      expect(orders.orders[0]!.status).toBe('expired');
      expect(orders.events.at(-1)).toMatchObject({ toStatus: 'expired', actor: 'system' });
      expect(await service.payAgain(SARA, order.token)).toMatchObject({ error: 'order_expired' });
    });

    it('«دوباره پرداخت کن» فقط برای صاحب سفارش، و بی نشست نه', async () => {
      const { order } = await placed([doc(10)]);
      expect(await service.payAgain(REZA, order.token)).toMatchObject({ status: 404 });
      expect(await service.payAgain(null, order.token)).toMatchObject({ status: 401 });
      expect(await service.payAgain(SARA, 'nope')).toMatchObject({ status: 404 });
    });
  });

  /**
   * درگاه واقعی (برش ۷٫۲، ADR-050) با درگاه ساختگی به شکل زیبال: هر شروع را نگه می‌دارد، وضعیت هر تلاش را تست می‌گذارد، و هر verify را
   * می‌شمارد. آداپتور خود زیبال روی سرور ساختگی‌اش در `packages/payments`، و قفل و تراکنش روی پستگرس در `packages/db`.
   */
  describe('درگاه واقعی: شروع، برگشت، «در حال بررسی» و استعلام خودکار (برش ۷٫۲)', () => {
    let starts: Parameters<PaymentGateway['start']>[0][];
    let statuses: Map<string, number | Error>;
    let verifies: string[];
    let startError: Error | null;
    let next = 3_714_560_001;

    function fakeZibal(): PaymentGateway {
      return {
        name: 'zibal',
        async start(input) {
          starts.push(input);
          if (startError) throw startError;
          const authority = String(next++);
          statuses.set(authority, -1);
          return { authority, redirectUrl: `https://gateway.zibal.ir/start/${authority}`, raw: { trackId: authority } };
        },
        async inquire(attempt) {
          const status = statuses.get(attempt.authority);
          if (status instanceof Error) throw status;
          return {
            status: status ?? 203,
            amountRials: attempt.amountRials,
            orderId: attempt.orderId,
            refId: status === 1 || status === 2 ? '900001' : null,
            cardMask: status === 1 || status === 2 ? '603799******1234' : null,
            raw: { status },
          };
        },
        async verify(attempt) {
          verifies.push(attempt.authority);
          statuses.set(attempt.authority, 1);
          return { kind: 'verified', amountRials: attempt.amountRials, orderId: attempt.orderId, refId: '900001', cardMask: '603799******1234', raw: {} };
        },
      };
    }

    beforeEach(() => {
      starts = [];
      statuses = new Map();
      verifies = [];
      startError = null;
      build(capture, fakeZibal());
    });

    const zibalOf = (redirectUrl: string) => orders.payments.find((p) => p.authority === redirectUrl.split('/').at(-1))!;

    it('شروع: مبلغ منجمد، شناسهٔ سفارش «شماره-۸ نویسهٔ شناسهٔ تلاش»، نشانی برگشت با کلید تصادفی؛ نه موبایل', async () => {
      const { order, payment } = await placed([doc(10)]);
      const row = zibalOf(payment!.redirectUrl);
      expect(starts).toEqual([
        {
          amountRials: order.totalRials,
          callbackUrl: `/pay/callback/${row.returnKey}`,
          orderId: `${order.number}-${row.id.slice(0, 8)}`,
          description: `سفارش ${order.number} جزوه‌یار`,
        },
      ]);
      expect(row).toMatchObject({ provider: 'zibal', gatewayOrderId: `${order.number}-${row.id.slice(0, 8)}`, amountRials: order.totalRials });
      expect(row.returnKey).toMatch(RETURN_KEY);
      expect(row.returnKey).not.toContain(row.authority);
      expect(JSON.stringify(starts)).not.toContain(SARA.mobile);
    });

    it('شکست شروع: ۱۱۳ «بالاتر از سقف یک پرداخت»، ۱۱۵ و کد پذیرندهٔ خالی «درگاه آماده نیست»، بقیه «جواب نداد»؛ لاگ فقط برچسب', async () => {
      for (const [error, code, status] of [
        [new PaymentError('rejected', { result: 113 }), 'amount_over_gateway_limit', 409],
        [new PaymentError('rejected', { result: 115 }), 'gateway_not_ready', 503],
        [new PaymentError('rejected', { result: 103 }), 'gateway_not_ready', 503],
        [new PaymentError('unconfigured'), 'gateway_not_ready', 503],
        [new PaymentError('unavailable', { http: 502 }), 'gateway_unavailable', 503],
        [new Error('socket hang up merchant=secret-value'), 'gateway_unavailable', 503],
      ] as const) {
        startError = error;
        const scan = doc(10);
        const priced = await service.quote(ME, { items: [item([scan])], place: TEHRAN });
        if (!priced.ok) throw new Error(priced.error);
        const result = await service.placeOrder(ME, SARA, {
          items: [item([scan])],
          place: TEHRAN,
          recipient,
          checkoutKey: randomUUID(),
          expectedTotalRials: priced.value.breakdown.totalRials,
        });
        expect(result).toMatchObject({ ok: false, status, error: code });
      }
      expect(orders.payments).toHaveLength(0);
      // کار مالک (۱۱۵ و ۱۰۳): رویداد سیستم برای پیشخوان، با کد و شمارهٔ سفارش؛ ۱۱۳، خالی و قطعی نه.
      expect(orders.rejections.map((r) => [r.provider, r.result])).toEqual([
        ['zibal', 115],
        ['zibal', 103],
      ]);
      expect(orders.rejections[0]).toMatchObject({ orderNumber: orders.orders[1]!.orderNumber, orderId: orders.orders[1]!.id, at: clock });
      expect(logs.some((line) => line.includes('rejected:113'))).toBe(true);
      expect(logs.some((line) => line.includes('secret-value'))).toBe(false);
    });

    it('«در حال بررسی»: پول گرفته شده و verify جواب نداد، یا مشتری برگشت و درگاه جواب نداد؛ نه «دوباره پرداخت کن» و نه تلاش تازه', async () => {
      const { order, payment } = await placed([doc(10)]);
      const row = zibalOf(payment!.redirectUrl);
      statuses.set(row.authority, new PaymentError('unavailable'));
      expect(await service.settle(row.returnKey)).toMatchObject({ value: { payment: 'pending' } });
      const view = await service.orderView(order.token, SARA);
      expect(view.ok && view.value.details).toMatchObject({
        canPay: false,
        checking: { checkedAt: clock.toISOString() },
        lastPayment: { status: 'pending', unpaid: false, failureGroup: null, gateway: 'زیبال', gatewayStatus: null },
      });
      expect(await service.payAgain(SARA, order.token)).toMatchObject({ status: 409, error: 'payment_checking' });
      expect(starts).toHaveLength(1);

      // درگاه برگشت: پرداخت‌شده، تأییدنشده ← verify ← موفق.
      statuses.set(row.authority, 2);
      expect(await service.settle(row.returnKey)).toMatchObject({ value: { payment: 'succeeded' } });
      expect(verifies).toEqual([row.authority]);
      expect(orders.payments[0]).toMatchObject({ status: 'succeeded', refId: '900001', cardMask: '603799******1234', verifiedAmountRials: order.totalRials });
    });

    it('تلاش قدیمی‌تری که در حال بررسی است هم «دوباره پرداخت کن» را می‌بندد، نه فقط آخرین تلاش', async () => {
      const { order, payment } = await placed([doc(10)]);
      const first = zibalOf(payment!.redirectUrl);
      later(1000);
      const again = await service.payAgain(SARA, order.token);
      if (!again.ok) throw new Error(again.error);
      statuses.set(first.authority, new PaymentError('unavailable'));
      expect(await service.settle(first.returnKey)).toMatchObject({ value: { payment: 'pending' } });
      const view = await service.orderView(order.token, SARA);
      expect(view.ok && view.value.details).toMatchObject({
        canPay: false,
        checking: { checkedAt: clock.toISOString() },
        lastPayment: { status: 'pending', unpaid: false, failureGroup: null },
      });
      expect(await service.payAgain(SARA, order.token)).toMatchObject({ status: 409, error: 'payment_checking' });
    });

    it('استعلام خودکار: تلاش باز بیش از ۲ دقیقه با همان حکم بسته می‌شود («خودکار»)، تازه نه، و در همان دقیقه دوباره پرسیده نمی‌شود', async () => {
      const first = await placed([doc(10)]);
      const old = zibalOf(first.payment!.redirectUrl);
      statuses.set(old.authority, 2);
      later(3 * MINUTE);
      const fresh = await placed([doc(10)]);
      statuses.set(zibalOf(fresh.payment!.redirectUrl).authority, -1);
      expect(await service.autoInquiry()).toEqual({ checked: 1, settled: 1, watched: 0 });
      expect(orders.payments.find((p) => p.id === old.id)).toMatchObject({ status: 'succeeded', settledVia: 'auto' });
      expect(sent.map((message) => message.purpose)).toEqual(['order_paid']);
      later(MINUTE / 2);
      expect((await service.autoInquiry()).checked).toBe(0);
      later(3 * MINUTE);
      // تلاش تازه حالا قدیمی است و هنوز در انتظار پرداخت: پرسیده می‌شود و باز می‌ماند.
      expect(await service.autoInquiry()).toMatchObject({ checked: 1, settled: 0 });
    });

    it('پول پرداخت دوم تا «ریورس‌شده» پاییده می‌شود (فقط استعلام)؛ صفحهٔ «ثبت شد» یادداشتش را دارد', async () => {
      const scan = doc(10);
      const priced = await service.quote(ME, { items: [item([scan])], place: TEHRAN });
      const body = { items: [item([scan])], place: TEHRAN, recipient, checkoutKey: randomUUID(), expectedTotalRials: priced.ok ? priced.value.breakdown.totalRials : 0 };
      const a = await service.placeOrder(ME, SARA, body);
      const b = await service.placeOrder(ME, SARA, body);
      if (!a.ok || !b.ok) throw new Error('placeOrder');
      const one = zibalOf(a.value.payment!.redirectUrl);
      const two = zibalOf(b.value.payment!.redirectUrl);
      statuses.set(one.authority, 2);
      statuses.set(two.authority, 2);
      await service.settle(one.returnKey);
      expect(await service.settle(two.returnKey)).toMatchObject({ value: { payment: 'failed' } });
      expect(verifies).toEqual([one.authority]);
      expect(orders.payments.find((p) => p.id === two.id)).toMatchObject({ failureCode: 'order_not_payable', gatewayStatus: 2, cardMask: '603799******1234' });
      const view = await service.orderView(a.value.order.token, SARA);
      expect(view.ok && view.value.details?.extraPayments).toEqual([{ amountRials: a.value.order.totalRials, cardMask: '603799******1234', gateway: 'زیبال' }]);

      later(3 * MINUTE);
      statuses.set(two.authority, 18);
      expect(await service.autoInquiry()).toMatchObject({ watched: 1 });
      expect(orders.payments.find((p) => p.id === two.id)).toMatchObject({ status: 'failed', gatewayStatus: 18 });
      later(3 * MINUTE);
      expect((await service.autoInquiry()).watched).toBe(0);
    });

    it('«پرداخت هنوز انجام نشده» فقط وقتی درگاه آخرین بار روشن «در انتظار» گفت؛ پرسشی که بعدش بی جواب ماند «در حال بررسی» است', async () => {
      const { order, payment } = await placed([doc(10)]);
      const row = zibalOf(payment!.redirectUrl);
      expect(await service.settle(row.returnKey)).toMatchObject({ value: { payment: 'pending' } });
      let view = await service.orderView(order.token, SARA);
      expect(view.ok && view.value.details).toMatchObject({ canPay: true, checking: null, lastPayment: { unpaid: true, gatewayStatus: -1 } });
      statuses.set(row.authority, new PaymentError('unavailable'));
      later(3 * MINUTE);
      expect(await service.autoInquiry()).toMatchObject({ checked: 1, settled: 0 });
      view = await service.orderView(order.token, SARA);
      expect(view.ok && view.value.details).toMatchObject({
        canPay: false,
        checking: { checkedAt: clock.toISOString() },
        lastPayment: { status: 'pending', unpaid: false, gatewayStatus: -1 },
      });
    });

    it('پرداخت دومی که درگاه نگفت پولش گرفته شد یادداشت ندارد: پولی از مشتری نزد درگاه نیست', async () => {
      const scan = doc(10);
      const priced = await service.quote(ME, { items: [item([scan])], place: TEHRAN });
      const body = { items: [item([scan])], place: TEHRAN, recipient, checkoutKey: randomUUID(), expectedTotalRials: priced.ok ? priced.value.breakdown.totalRials : 0 };
      const a = await service.placeOrder(ME, SARA, body);
      const b = await service.placeOrder(ME, SARA, body);
      if (!a.ok || !b.ok) throw new Error('placeOrder');
      const one = zibalOf(a.value.payment!.redirectUrl);
      const two = zibalOf(b.value.payment!.redirectUrl);
      statuses.set(one.authority, 2);
      await service.settle(one.returnKey);
      expect(await service.settle(two.returnKey)).toMatchObject({ value: { payment: 'failed' } });
      expect(orders.payments.find((p) => p.id === two.id)).toMatchObject({ failureCode: 'order_not_payable', gatewayStatus: -1 });
      const view = await service.orderView(a.value.order.token, SARA);
      expect(view.ok && view.value.details?.extraPayments).toEqual([]);
    });

    it('درگاه نمونه پولی ندارد که پاییده شود: پول پرداخت دومش در استعلام خودکار پرسیده نمی‌شود', async () => {
      build();
      const scan = doc(10);
      const priced = await service.quote(ME, { items: [item([scan])], place: TEHRAN });
      const body = { items: [item([scan])], place: TEHRAN, recipient, checkoutKey: randomUUID(), expectedTotalRials: priced.ok ? priced.value.breakdown.totalRials : 0 };
      const a = await service.placeOrder(ME, SARA, body);
      const b = await service.placeOrder(ME, SARA, body);
      if (!a.ok || !b.ok) throw new Error('placeOrder');
      const [one, two] = [a, b].map((r) => orders.payments.find((p) => p.authority === r.value.payment!.redirectUrl.split('/').at(-1))!);
      for (const p of [one!, two!]) await service.mockDecision(p.authority, { decision: 'success' });
      await service.settle(one!.returnKey);
      expect(await service.settle(two!.returnKey)).toMatchObject({ value: { payment: 'failed' } });
      expect(orders.payments.find((p) => p.id === two!.id)).toMatchObject({ provider: 'mock', failureCode: 'order_not_payable', gatewayStatus: 2 });
      later(3 * MINUTE);
      expect(await service.autoInquiry()).toEqual({ checked: 0, settled: 0, watched: 0 });
    });

    it('دیوار درگاه: پرداخت زیبال در سرویسی که فقط درگاه نمونه دارد پیدا نمی‌شود (درگاه نمونه هرگز در live، زیبال هرگز در mock)', async () => {
      const { payment } = await placed([doc(10)]);
      const row = zibalOf(payment!.redirectUrl);
      build();
      expect(await service.settle(row.returnKey)).toMatchObject({ status: 404 });
      expect(await service.autoInquiry()).toEqual({ checked: 0, settled: 0, watched: 0 });
    });
  });

  describe('درگاه نمونه', () => {
    it('تصمیم فقط یک بار ثبت می‌شود؛ تصمیم دوم اولی را عوض نمی‌کند', async () => {
      const { payment, order } = await placed([doc(10)]);
      const authority = payment!.redirectUrl.split('/').at(-1)!;
      expect(await service.mockGatewayView(authority)).toMatchObject({
        ok: true,
        value: { merchant: 'جزوه‌یار', orderNumber: order.number, amountRials: order.totalRials, decided: false },
      });
      const key = orders.payments[0]!.returnKey;
      expect(await service.mockDecision(authority, { decision: 'failure' })).toMatchObject({ ok: true, value: { redirectUrl: `/pay/callback/${key}` } });
      expect(await service.mockGatewayView(authority)).toMatchObject({ value: { decided: true, returnUrl: `/pay/callback/${key}` } });
      await service.mockDecision(authority, { decision: 'success' });
      expect(orders.payments[0]!.raw).toMatchObject({ decision: 'failure' });
      expect(await service.settle(key)).toMatchObject({ value: { payment: 'failed' } });
    });

    it('تصمیم نادرست و Authority ناشناس رد می‌شوند', async () => {
      const { payment } = await placed([doc(10)]);
      const authority = payment!.redirectUrl.split('/').at(-1)!;
      expect(await service.mockDecision(authority, { decision: 'maybe' })).toMatchObject({ status: 400 });
      expect(await service.mockDecision('MOCK' + 'F'.repeat(32), { decision: 'success' })).toMatchObject({ status: 404 });
      expect(await service.mockGatewayView('MOCK' + 'F'.repeat(32))).toMatchObject({ status: 404 });
    });
  });

  describe('صفحهٔ سفارش', () => {
    it('غریبه فقط شماره، وضعیت و روز تحویل را می‌بیند؛ صاحب سفارش همه‌چیز را', async () => {
      const ids = [doc(48, { originalName: 'ریاضی ۲ - جلسه ۱.pdf' }), doc(18, { originalName: 'حل تمرین.docx' })];
      const { order, payment } = await placed(ids, { recipient: { ...recipient, postalCode: '9189914365' } });
      await pay(payment!.redirectUrl, 'success');

      const stranger = await service.orderView(order.token, REZA);
      expect(stranger).toEqual({
        ok: true,
        value: {
          number: 10_001,
          status: 'paid',
          postHandoffDueAt: '2026-09-28T20:30:00.000Z',
          postHandoffDay: 'دوشنبه 6 مهر',
          handedToPost: null,
          trackingSent: false,
          slaDays: 2,
          owner: false,
          details: null,
        },
      });
      expect(await service.orderView(order.token, null)).toMatchObject({ value: { owner: false, details: null } });

      const mine = await service.orderView(order.token, SARA);
      expect(mine.ok && mine.value.details).toMatchObject({
        totalRials: order.totalRials,
        refId: '803114',
        canPay: false,
        lastPayment: { status: 'succeeded', failureCode: null },
        items: [
          {
            pageCount: 66,
            copies: 1,
            sidesMode: 'double',
            colorMode: 'bw',
            bindingName: 'طلق و سیم',
            // کاغذ پیش‌فرض نام نمی‌گیرد (۸٫۳)؛ اندازه همیشه
            paperName: null,
            paperSize: 'a4',
            sections: [
              { name: 'ریاضی ۲ - جلسه ۱.pdf', pageCount: 48 },
              { name: 'حل تمرین.docx', pageCount: 18 },
            ],
          },
        ],
        shipping: { methodName: 'پست پیشتاز', provinceName: 'تهران', cityName: 'تهران' },
        recipient: { name: 'سارا احمدی', phone: SARA.mobile, postalCode: '9189914365' },
      });
    });

    it('نظر (۱۲٫۳، سؤال ۲۱۳): فقط صاحب سفارش «تحویل پست شد»، یک بار، نمرهٔ ۱ تا ۵ و متن فارسی‌نرمال تا ۵۰۰؛ صفحهٔ سفارش «نظرت» را دارد، منتظر و پنهان یکی، پاک‌شده هیچ', async () => {
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      const row = orders.orders[0]!;
      const deps = { orders, reviews: orders.reviewStore };
      const send = (user: AuthUser | null, input: unknown) => submitReview(deps, order.token, user, input, clock);
      const details = async () => {
        const result = await service.orderView(order.token, SARA);
        if (!result.ok) throw new Error(result.error);
        return result.value.details!;
      };

      // پیش از رسیدن به پست: نه فرم، نه نوشتن.
      expect(await details()).toMatchObject({ reviewForm: null, review: null });
      expect(await send(SARA, { rating: 5 })).toMatchObject({ status: 409, error: 'review_not_open' });
      // اول اینکه فرم باز است، بعد ورودی: سفارشی که نظر نمی‌گیرد با نمرهٔ نادرست هم همان ۴۰۹.
      expect(await send(SARA, { rating: 0 })).toMatchObject({ status: 409, error: 'review_not_open' });
      Object.assign(row, { status: 'handed_to_post', handedToPostAt: new Date('2026-09-28T10:00:00.000Z') });
      // فرم نام کوچک و شهر را زیر فیلد نشان می‌دهد؛ همان روی نظر منجمد می‌شود.
      expect(await details()).toMatchObject({ reviewForm: { publicName: 'سارا', publicPlace: 'تهران' }, review: null });

      // غریبه، بی نشست و توکن بدشکل همان سفارش ناموجود؛ غریبه در صفحهٔ سفارش هم چیزی از نظر نمی‌بیند.
      expect(await send(REZA, { rating: 5 })).toMatchObject({ status: 404, error: 'not_found' });
      expect(await send(null, { rating: 5 })).toMatchObject({ status: 404, error: 'not_found' });
      expect(await submitReview(deps, 'not-a-token', SARA, { rating: 5 }, clock)).toMatchObject({ status: 404 });
      expect(await service.orderView(order.token, REZA)).toMatchObject({ value: { details: null } });

      for (const rating of [0, 6, 4.5, '5', null]) {
        expect(await send(SARA, { rating })).toMatchObject({ status: 400, error: 'invalid_rating' });
      }
      expect(await send(SARA, null)).toMatchObject({ status: 400, error: 'invalid_rating' });
      expect(await send(SARA, { rating: 4, body: 'ن'.repeat(501) })).toMatchObject({ status: 400, error: 'review_too_long', max: 500 });
      expect(orders.reviews.size).toBe(0);

      // متن هر خط فارسی‌نرمال، خط خالی رفته؛ ۵۰۰ نویسه پس از نرمال‌سازی.
      expect(await send(SARA, { rating: 4, body: '  صحافي محكم بود\n\n\n  ممنون  ' })).toEqual({
        ok: true,
        value: { rating: 4, body: 'صحافی محکم بود\nممنون', published: false },
      });
      expect(orders.reviews.get(row.id)).toMatchObject({
        rating: 4,
        body: 'صحافی محکم بود\nممنون',
        publicName: 'سارا',
        publicPlace: 'تهران',
        status: 'pending',
        createdAt: clock,
      });
      expect(await send(SARA, { rating: 1 })).toMatchObject({ status: 409, error: 'review_exists' });
      expect(await send(SARA, { rating: 0 })).toMatchObject({ status: 409, error: 'review_exists' });
      expect(await details()).toMatchObject({ reviewForm: null, review: { rating: 4, body: 'صحافی محکم بود\nممنون', published: false } });

      // مالک روی سایت گذاشت، پنهان کرد، پاک کرد: مشتری «روی صفحهٔ اصلی است» را فقط برای اولی می‌بیند، و پس از پاک هیچ، حتی فرم.
      const review = orders.reviews.get(row.id)!;
      Object.assign(review, { status: 'approved' });
      expect((await details()).review).toMatchObject({ published: true });
      Object.assign(review, { status: 'hidden' });
      expect((await details()).review).toMatchObject({ published: false });
      Object.assign(review, { status: 'deleted', rating: null, body: null });
      expect(await details()).toMatchObject({ reviewForm: null, review: null });
      expect(await send(SARA, { rating: 5 })).toMatchObject({ status: 409, error: 'review_exists' });
    });

    it('نظر بی متن هم نظر است؛ هم‌زمان با نظر دیگر یا برگشت وضعیت، همان ۴۰۹ پایگاه داده', async () => {
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      const row = orders.orders[0]!;
      Object.assign(row, { status: 'handed_to_post', handedToPostAt: new Date('2026-09-28T10:00:00.000Z') });
      const raced = (reason: 'exists' | 'not_delivered') =>
        submitReview({ orders, reviews: { submit: async () => ({ ok: false, reason }) } }, order.token, SARA, { rating: 5 }, clock);
      expect(await raced('exists')).toMatchObject({ status: 409, error: 'review_exists' });
      expect(await raced('not_delivered')).toMatchObject({ status: 409, error: 'review_not_open' });
      expect(await submitReview({ orders, reviews: orders.reviewStore }, order.token, SARA, { rating: 3, body: ' \n ' }, clock)).toEqual({
        ok: true,
        value: { rating: 3, body: null, published: false },
      });
    });

    it('توکن ناشناس یا بدشکل: ۴۰۴', async () => {
      expect(await service.orderView(randomUUID(), SARA)).toMatchObject({ status: 404 });
      expect(await service.orderView('10001', SARA)).toMatchObject({ status: 404 });
    });

    it('وضعیت‌های پنل (۴٫۳): در حال چاپ، تحویل پست شد با روزش و مهلت، و لغو شد؛ دلیل لغو نه', async () => {
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      const row = orders.orders[0]!;
      const view = async () => {
        const result = await service.orderView(order.token, SARA);
        if (!result.ok) throw new Error(result.error);
        return result.value;
      };

      Object.assign(row, { status: 'printing' });
      expect(await view()).toMatchObject({ status: 'printing', postHandoffDay: 'دوشنبه 6 مهر', handedToPost: null });

      // مهلت پایان انحصاری دوشنبه است (سه‌شنبه ۰۰:۰۰ تهران): یک میلی‌ثانیه پیش از آن در مهلت، خودش نه. صریح.
      Object.assign(row, { status: 'handed_to_post', handedToPostAt: new Date('2026-09-28T20:29:59.999Z') });
      expect((await view()).handedToPost).toEqual({ day: 'دوشنبه 6 مهر', onTime: true });
      Object.assign(row, { handedToPostAt: new Date('2026-09-28T20:30:00.000Z') });
      expect((await view()).handedToPost).toEqual({ day: 'سه‌شنبه 7 مهر', onTime: false });
      // غریبه هم روز تحویل پست را می‌بیند، نه بیشتر.
      expect(await service.orderView(order.token, REZA)).toMatchObject({
        value: { status: 'handed_to_post', handedToPost: { day: 'سه‌شنبه 7 مهر' }, details: null },
      });

      // لغو شد: دلیل فقط در پنل است (رویداد وضعیت)، نه در صفحهٔ مشتری.
      orders.events.push({ orderId: row.id, fromStatus: 'paid', toStatus: 'cancelled', actor: 'admin', note: { reason: 'کارت‌به‌کارت برگشت' } });
      Object.assign(row, { status: 'cancelled', handedToPostAt: null });
      const cancelled = await view();
      expect(cancelled).toMatchObject({ status: 'cancelled', handedToPost: null, details: { totalRials: order.totalRials, canPay: false } });
      expect(JSON.stringify(cancelled)).not.toContain('کارت‌به‌کارت');
    });

    it('کد رهگیری (۶٫۳): صاحب سفارش هر کد زنده را با پیوند پست می‌بیند؛ غریبه فقط «پیامک شد»، و فقط اگر رفت', async () => {
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      const row = orders.orders[0]!;
      Object.assign(row, { status: 'handed_to_post', handedToPostAt: new Date('2026-09-28T10:00:00.000Z') });
      const sms = (status: string) => ({
        id: 1,
        toMobile: SARA.mobile,
        status,
        error: null,
        attempts: 1,
        createdAt: clock,
        attemptedAt: clock,
        sentAt: status === 'logged' ? clock : null,
      });
      const first = '118800000000000000000101';
      const second = '118800000000000000000102';
      orders.parcels.set(row.id, [
        { barcode: first, createdAt: clock, sms: sms('failed') },
        { barcode: second, createdAt: clock, sms: null },
      ]);
      // پیامکی نرفته: غریبه هیچ نمی‌بیند؛ صاحب کدها را، به ترتیب ثبت.
      expect(await service.orderView(order.token, REZA)).toMatchObject({ value: { trackingSent: false, details: null } });
      const mine = await service.orderView(order.token, SARA);
      expect(mine.ok && mine.value.details!.parcels).toEqual([
        { barcode: first, trackingUrl: `https://tracking.post.ir/search.aspx?id=${first}`, smsSent: false },
        { barcode: second, trackingUrl: `https://tracking.post.ir/search.aspx?id=${second}`, smsSent: false },
      ]);
      orders.parcels.set(row.id, [{ barcode: first, createdAt: clock, sms: sms('logged') }]);
      const stranger = await service.orderView(order.token, REZA);
      expect(stranger).toMatchObject({ value: { trackingSent: true, details: null } });
      // غریبه کد را هیچ‌جا نمی‌گیرد.
      expect(JSON.stringify(stranger)).not.toContain(first);
      expect(await service.orderView(order.token, SARA)).toMatchObject({ value: { trackingSent: true, details: { parcels: [{ smsSent: true }] } } });
    });

    it('بازپرداخت (۷٫۳، سؤال ۱۵۷): «در حال برگشت» با کارت؛ «برگشت داده شد» با روز و ساعت درگاه، یا فقط روز دستی؛ رد و «معلوم نیست» هیچ', async () => {
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      const row = orders.orders[0]!;
      const paid = orders.payments[0]!;
      Object.assign(paid, { cardMask: '603799******1234' });
      Object.assign(row, { status: 'cancelled' });
      const refundOf = async () => {
        const result = await service.orderView(order.token, SARA);
        if (!result.ok) throw new Error(result.error);
        return result.value.details!.refund;
      };
      const base = {
        id: randomUUID(),
        orderId: row.id,
        paymentId: paid.id,
        amountRials: paid.amountRials,
        feeRials: 15_000,
        method: 'gateway' as const,
        status: 'pending' as const,
        gatewayRef: null,
        reference: null,
        refundedOn: null,
        note: 'کارت‌به‌کارت از حساب سارا',
        gatewayStatus: null,
        gatewayError: null,
        gatewayCheckedAt: null,
        failureReason: null,
        settledVia: null,
        adminUserId: randomUUID(),
        raw: null,
        createdAt: new Date('2026-10-06T07:56:00.000Z'),
        finishedAt: null,
      };
      // هنوز هیچ: همان «برمی‌گردد».
      expect(await refundOf()).toBeNull();
      // درخواست رفت و جواب روشن نیامد: «معلوم نیست»؛ مشتری چیزی نمی‌بیند که نمی‌دانیم.
      orders.refunds.set(row.id, [{ ...base, gatewayError: 'unavailable' }]);
      expect(await refundOf()).toBeNull();
      orders.refunds.set(row.id, [{ ...base, gatewayRef: 'MOCKRF1', gatewayStatus: 16 }]);
      expect(await refundOf()).toEqual({ state: 'refunding', amountRials: paid.amountRials, cardMask: '603799******1234' });
      orders.refunds.set(row.id, [
        { ...base, status: 'succeeded', gatewayRef: 'MOCKRF1', gatewayStatus: 15, reference: '552190', finishedAt: new Date('2026-10-06T08:11:00.000Z'), settledVia: 'auto' },
      ]);
      expect(await refundOf()).toEqual({
        state: 'refunded',
        amountRials: paid.amountRials,
        cardMask: '603799******1234',
        day: 'سه‌شنبه 14 مهر',
        time: '11:41',
        reference: '552190',
      });
      // دستی: فقط روز، بی ساعت و بی کارت؛ یادداشت هرگز.
      orders.refunds.set(row.id, [
        {
          ...base,
          method: 'manual',
          status: 'succeeded',
          feeRials: null,
          reference: '91822',
          refundedOn: new Date('2026-10-05T20:30:00.000Z'),
          finishedAt: base.createdAt,
          settledVia: null,
        },
      ]);
      const manual = await service.orderView(order.token, SARA);
      expect(manual.ok && manual.value.details!.refund).toEqual({
        state: 'refunded',
        amountRials: paid.amountRials,
        cardMask: null,
        day: 'سه‌شنبه 14 مهر',
        time: null,
        reference: '91822',
      });
      expect(JSON.stringify(manual)).not.toContain('کارت‌به‌کارت');
      // درگاه رد کرد: همان «برمی‌گردد»؛ غریبه هیچ.
      orders.refunds.set(row.id, [{ ...base, status: 'failed', failureReason: 'balance', finishedAt: base.createdAt, settledVia: 'request' }]);
      expect(await refundOf()).toBeNull();
      expect(await service.orderView(order.token, REZA)).toMatchObject({ value: { details: null } });
    });

    it('پرداخت‌شده در هر وضعیت پنل: «دوباره پرداخت کن» و همان کلید «پرداخت» درگاه باز نمی‌کنند', async () => {
      const checkoutKey = randomUUID();
      const { order, payment } = await placed([doc(10)], { checkoutKey });
      await pay(payment!.redirectUrl, 'success');
      for (const status of ['printing', 'handed_to_post', 'cancelled'] as const) {
        Object.assign(orders.orders[0]!, { status });
        expect(await service.payAgain(SARA, order.token)).toMatchObject({ ok: true, value: { payment: null, order: { status } } });
        const again = await placed([doc(10)], { checkoutKey });
        expect(again).toMatchObject({ payment: null, order: { number: order.number, status } });
      }
      expect(orders.payments).toHaveLength(1);
    });
  });

  describe('موبایل مسدود (۱۲٫۲، سؤال ۲۱۲)', () => {
    const body = (documentIds: string[], expectedTotalRials: number, checkoutKey = randomUUID()) => ({
      items: [item(documentIds)],
      place: TEHRAN,
      recipient,
      checkoutKey,
      expectedTotalRials,
      quoteSnapshot: null,
    });
    const totalOf = async (documentIds: string[]) => {
      const priced = await service.quote(ME, { items: [item(documentIds)], place: TEHRAN });
      if (!priced.ok) throw new Error(priced.error);
      return priced.value.breakdown.totalRials;
    };

    it('«پرداخت»: سفارش تازه نه، ۴۰۳ پیش از هر حساب؛ قیمت هنوز باز؛ شمارهٔ دیگر و پس از رفع مسدودی همان', async () => {
      const scan = doc(10);
      const total = await totalOf([scan]);
      orders.blockedMobiles.add(SARA.mobile);
      // قیمت پیش از هویت است و مسدودی آن را نمی‌بندد.
      expect((await service.quote(ME, { items: [item([scan])], place: TEHRAN })).ok).toBe(true);
      expect(await service.placeOrder(ME, SARA, body([scan], total))).toEqual({ ok: false, status: 403, error: 'mobile_blocked' });
      // پیش از حساب: عدد نادرست هم همان ۴۰۳ است، نه ۴۰۹ قیمت.
      expect(await service.placeOrder(ME, SARA, body([scan], 1))).toMatchObject({ status: 403, error: 'mobile_blocked' });
      expect([orders.orders, orders.payments]).toEqual([[], []]);

      expect((await service.placeOrder(ME, REZA, body([scan], total))).ok).toBe(true);
      orders.blockedMobiles.delete(SARA.mobile);
      expect((await service.placeOrder(ME, SARA, body([scan], total))).ok).toBe(true);
    });

    it('«دوباره پرداخت کن»: تلاش تازه نه، پیش از درگاه، ۴۰۳ با سفارش؛ سفارش پرداخت‌شده همان‌طور دیده می‌شود', async () => {
      const gateway = mockGateway({ newRefId: () => '803114' });
      build(capture, gateway);
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'cancel');
      const paid = await placed([doc(12)]);
      await pay(paid.payment!.redirectUrl, 'success');
      orders.blockedMobiles.add(SARA.mobile);
      const before = orders.payments.length;
      const started = vi.spyOn(gateway, 'start');
      expect(await service.payAgain(SARA, order.token)).toMatchObject({ ok: false, status: 403, error: 'mobile_blocked', order: { number: order.number } });
      // درگاه اصلاً شروع نشد: تلاشی بی ردیف نزد درگاه نمی‌ماند.
      expect(started).not.toHaveBeenCalled();
      expect(orders.payments).toHaveLength(before);
      // دو زبانه با همان کلید «پرداخت»: سفارشی که هست، همان حکم.
      expect(await service.payAgain(SARA, paid.order.token)).toMatchObject({ ok: true, value: { payment: null, order: { status: 'paid' } } });
      orders.blockedMobiles.delete(SARA.mobile);
      expect((await service.payAgain(SARA, order.token)).ok).toBe(true);
      expect(started).toHaveBeenCalledTimes(1);
    });

    it('مسدودی میان سنجش و درج (محافظ پایگاه داده): همان ۴۰۳، بی سفارش و بی تلاش', async () => {
      const scan = doc(10);
      const total = await totalOf([scan]);
      // سنجش بی قفل «نه» می‌گوید، و درج سفارش به محافظ می‌خورد.
      const blockedNow = vi.spyOn(orders, 'mobileBlocked').mockResolvedValue(false);
      orders.blockedMobiles.add(SARA.mobile);
      expect(await service.placeOrder(ME, SARA, body([scan], total))).toEqual({ ok: false, status: 403, error: 'mobile_blocked' });
      expect(orders.orders).toEqual([]);

      // سفارش پیش از مسدودی؛ مسدودی پیش از درج تلاش: تلاش درگاه بی ردیف رها می‌شود.
      orders.blockedMobiles.delete(SARA.mobile);
      const { order, payment } = await placed([scan]);
      await pay(payment!.redirectUrl, 'cancel');
      orders.blockedMobiles.add(SARA.mobile);
      const before = orders.payments.length;
      expect(await service.payAgain(SARA, order.token)).toMatchObject({ ok: false, status: 403, error: 'mobile_blocked', order: { number: order.number } });
      expect(orders.payments).toHaveLength(before);
      blockedNow.mockRestore();
    });
  });

  describe('کد تخفیف و تخفیف سفارش بزرگ (۱۱٫۴)', () => {
    const T = (tomans: number) => tomans * 10;
    // ۱۴۷ صفحه: ۲۸۰,۲۰۰ تومان چاپ و صحافی؛ کرایهٔ استان تهران ۱۲۹,۵۰۰.
    const body = (documentIds: string[], discountCode: string | null = null, place = TEHRAN) => ({ items: [item(documentIds)], place, discountCode });

    async function placeWith(user: AuthUser, documentIds: string[], discountCode: string | null) {
      const priced = await service.quote(ME, body(documentIds, discountCode), user);
      if (!priced.ok) throw new Error(priced.error);
      return service.placeOrder(ME, user, {
        items: [item(documentIds)],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: priced.value.breakdown.totalRials,
        discountCode,
      });
    }

    it('کد فقط برای نشست تأییدشده؛ یکدست می‌شود (صفحه‌کلید فارسی هم)؛ و ریز قیمت می‌گوید نشست', async () => {
      orders.discountCodes.push(memoryDiscountCode({ code: 'WELCOME', percent: 10 }));
      const scan = doc(147);
      expect(await service.quote(ME, body([scan], 'WELCOME'))).toMatchObject({ ok: false, status: 401, error: 'auth_required' });
      for (const typed of ['welcome', ' WEL-COME ', 'صثمزخپث']) {
        const priced = await service.quote(ME, body([scan], typed), SARA);
        expect(priced.ok).toBe(true);
        if (!priced.ok) return;
        expect(priced.value.breakdown.discount).toMatchObject({ source: 'code', code: 'WELCOME', percent: 10 });
        expect(priced.value.breakdown.code).toEqual({ code: 'WELCOME', status: 'applied' });
        expect(priced.value.breakdown.totalRials).toBe(T(280_200 - 28_020 + 129_500));
      }
      // بی کد همان قیمت پیش از ۱۱٫۴، با نشست یا بی نشست.
      const plain = await service.quote(ME, body([scan]), SARA);
      expect(plain.ok && [plain.value.breakdown.discount, plain.value.breakdown.totalRials]).toEqual([null, T(280_200 + 129_500)]);
    });

    it('کدی که نمی‌خورد با دلیل: ناشناس، شکل کد نیست، خاموش، پیش و پس از روز، پر، و سهم برده', async () => {
      const scan = doc(147);
      orders.discountCodes.push(
        memoryDiscountCode({ code: 'OFFCODE', enabled: false }),
        memoryDiscountCode({ code: 'SOONCODE', validFrom: new Date(clock.getTime() + DAY) }),
        memoryDiscountCode({ code: 'GONECODE', validFrom: new Date(clock.getTime() - 2 * DAY), validUntil: clock }),
      );
      const reason = async (code: string, user = SARA) => {
        const result = await service.quote(ME, body([scan], code), user);
        return result.ok ? null : [result.status, result.error, result.reason];
      };
      expect(await reason('NOPE404')).toEqual([422, 'discount_code_invalid', 'unknown']);
      expect(await reason('!!')).toEqual([422, 'discount_code_invalid', 'unknown']);
      expect(await reason('OFFCODE')).toEqual([422, 'discount_code_invalid', 'disabled']);
      expect(await reason('SOONCODE')).toEqual([422, 'discount_code_invalid', 'not_started']);
      expect(await reason('GONECODE')).toEqual([422, 'discount_code_invalid', 'ended']);

      orders.discountCodes.push(memoryDiscountCode({ code: 'ONCE', perCustomerLimit: 1 }), memoryDiscountCode({ code: 'ONLYONE', totalLimit: 1, perCustomerLimit: 5 }));
      expect((await placeWith(SARA, [scan], 'ONCE')).ok).toBe(true);
      expect(await reason('ONCE')).toEqual([422, 'discount_code_invalid', 'used_by_you']);
      expect(await reason('ONCE', REZA)).toBeNull();
      expect((await placeWith(REZA, [doc(147)], 'ONLYONE')).ok).toBe(true);
      expect(await reason('ONLYONE')).toEqual([422, 'discount_code_invalid', 'used_up']);
    });

    it('«پرداخت» با کد: شناسهٔ کد روی سفارش و قیمت منجمد؛ کدی که میان مرور و پرداخت پر شد ۴۰۹ با دلیل، بی سفارش', async () => {
      orders.discountCodes.push(memoryDiscountCode({ code: 'MEHR', percent: 20, totalLimit: 1, perCustomerLimit: 5 }));
      const scan = doc(147);
      const priced = await service.quote(ME, body([scan], 'mehr'), SARA);
      if (!priced.ok) throw new Error(priced.error);
      const placedOrder = await service.placeOrder(ME, SARA, {
        items: [item([scan])],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: priced.value.breakdown.totalRials,
        discountCode: 'mehr',
      });
      expect(placedOrder.ok).toBe(true);
      const order = orders.orders.at(-1)!;
      expect(order).toMatchObject({ discountCodeId: orders.discountCodes[0]!.id, discountRials: T(56_040), totalRials: T(280_200 - 56_040 + 129_500) });
      expect(orders.payments).toHaveLength(1);

      // REZA مرور را با کد دید، و پیش از «پرداخت» جای کد رفت.
      const rezaScan = doc(147);
      const count = orders.orders.length;
      const late = await service.placeOrder(ME, REZA, {
        items: [item([rezaScan])],
        place: TEHRAN,
        recipient,
        checkoutKey: randomUUID(),
        expectedTotalRials: priced.value.breakdown.totalRials,
        discountCode: 'MEHR',
      });
      expect(late).toMatchObject({ ok: false, status: 422, error: 'discount_code_invalid', reason: 'used_up' });
      expect(orders.orders).toHaveLength(count);
    });

    it('کد کوچک‌تر از پلهٔ سفارش بزرگ به کار نمی‌رود و روی سفارش نمی‌نشیند (مصرف نمی‌شود)', async () => {
      orders.activate({ ...SEED_PRICE_LIST, version: 2, discountTiers: [{ fromRials: T(200_000), percent: 15, freeShipping: false }] });
      orders.discountCodes.push(memoryDiscountCode({ code: 'SMALL', percent: 5 }));
      const scan = doc(147);
      const priced = await service.quote(ME, body([scan], 'SMALL'), SARA);
      expect(priced.ok && priced.value.breakdown.code).toEqual({ code: 'SMALL', status: 'smaller' });
      expect(priced.ok && priced.value.breakdown.discount).toMatchObject({ source: 'tier', percent: 15 });
      const placedOrder = await placeWith(SARA, [scan], 'SMALL');
      expect(placedOrder.ok).toBe(true);
      expect(orders.orders.at(-1)).toMatchObject({ discountCodeId: null, discountRials: T(42_030) });
      // سهم SARA مصرف نشد.
      const again = await service.quote(ME, body([doc(147)], 'SMALL'), SARA);
      expect(again.ok).toBe(true);
    });

    it('ارسال رایگان پله: کارت شهر و مرور کرایهٔ صفر می‌گیرند و کرایهٔ بخشیده در ریز قیمت می‌ماند', async () => {
      orders.activate({ ...SEED_PRICE_LIST, version: 3, discountTiers: [{ fromRials: T(200_000), percent: 0, freeShipping: true }] });
      const scan = doc(147);
      const city = await service.quote(ME, body([scan], null, null as unknown as typeof TEHRAN));
      expect(city.ok && city.value.shippingByZone.map((zone) => zone.shippingRials)).toEqual([0, 0]);
      const review = await service.quote(ME, body([scan]), SARA);
      expect(review.ok && review.value.breakdown).toMatchObject({
        shippingRials: 0,
        totalRials: T(280_200),
        discount: { source: 'tier', freeShipping: true, waivedShippingRials: T(129_500) },
      });
    });

    it('«دوباره پرداخت کن» با کدی که جایش را دیگری گرفت ۴۰۹ با دلیل؛ و سنجش درگاه پس از رفتن جا `verify` نمی‌زند', async () => {
      orders.discountCodes.push(memoryDiscountCode({ code: 'LAST', totalLimit: 1, perCustomerLimit: 5 }));
      const first = await placeWith(SARA, [doc(147)], 'LAST');
      if (!first.ok) throw new Error(first.error);
      const saraOrder = orders.orders.at(-1)!;
      // رزرو SARA پس از مهلت تلاش می‌رود؛ REZA جا را می‌گیرد.
      later(PAYMENT_ATTEMPT_TTL_MS + MINUTE);
      const reza = await placeWith(REZA, [doc(147)], 'LAST');
      expect(reza.ok).toBe(true);
      // تلاش قدیمی SARA همین حالا از درگاه برگشت: پرداختنی نیست، پس بی `verify` بسته می‌شود.
      const settled = await pay(first.value.payment!.redirectUrl, 'success');
      expect(settled).toMatchObject({ ok: true, value: { payment: 'failed' } });
      expect(orders.payments.find((p) => p.orderId === saraOrder.id)).toMatchObject({ status: 'failed', failureCode: 'order_not_payable' });
      expect(orders.orders.find((o) => o.id === saraOrder.id)!.status).toBe('awaiting_payment');
      // و «دوباره پرداخت کن» هم نه، با دلیل و سفارش؛ پیش از درگاه، پس تلاشی ساخته نمی‌شود که محافظ درج ردش کند.
      const insert = orders.insertPayment.bind(orders);
      let inserted = 0;
      orders.insertPayment = async (payment) => {
        inserted += 1;
        return insert(payment);
      };
      const again = await service.payAgain(SARA, saraOrder.publicToken);
      expect(again).toMatchObject({ ok: false, status: 409, error: 'discount_unavailable', reason: 'used_up', order: { number: saraOrder.orderNumber } });
      expect(inserted).toBe(0);
    });
  });
});
