/**
 * مسیر خرید روی سرور (ADR-034، ADR-035) با پایگاه دادهٔ حافظه‌ای و ساعت ساختگی.
 *
 * ساعت شنبه ۴ مهر ۱۴۰۵، ۱۱:۳۰ تهران است: پرداخت امروز، تحویل به پست تا پایان دوشنبه ۶ مهر — همان تاریخی
 * که طرح `checkout.html` نشان می‌دهد.
 */

import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { PriceList } from '@jozveyar/contracts';
import type { CheckoutDocument } from '@jozveyar/db';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import type { AuthUser } from './auth';
import { createCheckoutService } from './checkout';
import { MOCK_AUTHORITY, mockGateway } from './payments';
import { consoleSms, type SmsProvider } from './sms';
import { memoryOrderStore, memorySmsLog } from './testing';

const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const SARA: AuthUser = { userId: 'user-sara', mobile: '09121234567' };
const REZA: AuthUser = { userId: 'user-reza', mobile: '09351234567' };
const DAY = 86_400_000;
/** عددهای ADR-034، صریح: فایل دست‌کم یک ساعت دیگر زنده؛ تلاش پرداخت نیم ساعت. */
const HOUR = 3_600_000;
const HALF_HOUR = HOUR / 2;
/** استان‌ها و شهرها از `@jozveyar/geo`. */
const TEHRAN = { provinceId: 8, cityId: 394 };
const MASHHAD = { provinceId: 11, cityId: 1326 };
const KARAJ_IN_TEHRAN = { provinceId: 8, cityId: 1094 };

describe('مسیر خرید روی سرور', () => {
  let clock: Date;
  let orders: ReturnType<typeof memoryOrderStore>;
  let sms: ReturnType<typeof memorySmsLog>;
  let service: ReturnType<typeof createCheckoutService>;
  const logs: string[] = [];

  function build(provider?: SmsProvider) {
    service = createCheckoutService({
      orders,
      gateway: mockGateway({ newRefId: () => '803114' }),
      sms: provider ?? consoleSms(sms, () => undefined),
      callbackUrl: '/pay/callback',
      now: () => clock,
      log: (message) => logs.push(message),
    });
  }

  beforeEach(() => {
    clock = new Date('2026-09-26T08:00:00Z');
    orders = memoryOrderStore({ priceList: SEED_PRICE_LIST, now: () => clock });
    sms = memorySmsLog();
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

  /** همان کاری که صفحهٔ درگاه نمونه و بعد برگشت مرورگر می‌کنند. */
  async function pay(redirectUrl: string, decision: 'success' | 'failure' | 'cancel', status?: string) {
    const authority = redirectUrl.split('/').at(-1)!;
    const decided = await service.mockDecision(authority, { decision });
    if (!decided.ok) throw new Error(decided.error);
    const query = new URL(decided.value.redirectUrl, 'http://localhost').searchParams;
    return service.settle(query.get('Authority')!, status ?? query.get('Status'));
  }

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
      const dearer: PriceList = { ...SEED_PRICE_LIST, version: 2, clickRates: { color: 30_000, bw: 20_000 } };
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
    it('موفق: پرداخت‌شده، مهلت تحویل به پست دوشنبه ۶ مهر، رویداد، کار prepare_order و پیامک', async () => {
      const { order, payment } = await placed([doc(120)]);
      const result = await pay(payment!.redirectUrl, 'success');
      expect(result).toEqual({ ok: true, value: { token: order.token, payment: 'succeeded' } });

      const [row] = orders.orders;
      expect(row).toMatchObject({ status: 'paid', paidAt: clock });
      // پایان انحصاری دوشنبه ۶ مهر به وقت تهران = نیمه‌شب سه‌شنبه = ۲۰:۳۰ دوشنبه UTC.
      expect(row!.postHandoffDueAt!.toISOString()).toBe('2026-09-28T20:30:00.000Z');
      expect(orders.payments[0]).toMatchObject({ status: 'succeeded', refId: '803114', verifiedAt: clock });
      expect(orders.events.at(-1)).toMatchObject({ fromStatus: 'awaiting_payment', toStatus: 'paid', actor: 'gateway' });
      expect(orders.jobs).toEqual([{ kind: 'prepare_order', orderId: row!.id }]);
      expect(sms.messages).toEqual([
        expect.objectContaining({ toMobile: SARA.mobile, purpose: 'order_paid' }),
      ]);
      expect(sms.messages[0]!.body).toContain('10001');
      expect(sms.messages[0]!.body).toContain('دوشنبه 6 مهر');
    });

    it('برگشت تکراری (رفرش) همان نتیجه است: پیامک و کار دوم نمی‌سازد', async () => {
      const { payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'success');
      const authority = payment!.redirectUrl.split('/').at(-1)!;
      expect(await service.settle(authority, 'OK')).toMatchObject({ ok: true, value: { payment: 'succeeded' } });
      expect(orders.jobs).toHaveLength(1);
      expect(sms.messages).toHaveLength(1);
    });

    it('`Status=OK` نشانی هیچ‌وقت پرداخت نمی‌سازد: سنجش، تصمیم ثبت‌شدهٔ درگاه را می‌خواند', async () => {
      const { payment } = await placed([doc(10)]);
      expect(await pay(payment!.redirectUrl, 'failure', 'OK')).toMatchObject({ ok: true, value: { payment: 'failed' } });
      expect(orders.orders[0]!.status).toBe('awaiting_payment');
      expect(orders.payments[0]).toMatchObject({ status: 'failed', failureCode: 'declined' });

      // برگشت دست‌ساز، بی هیچ تصمیمی: انصراف.
      const again = await service.payAgain(SARA, orders.orders[0]!.publicToken);
      const authority = again.ok ? again.value.payment!.redirectUrl.split('/').at(-1)! : '';
      expect(await service.settle(authority, 'OK')).toMatchObject({ value: { payment: 'failed' } });
      expect(orders.payments.find((p) => p.authority === authority)).toMatchObject({ failureCode: 'cancelled' });
      expect(orders.jobs).toHaveLength(0);
      expect(sms.messages).toHaveLength(0);
    });

    it('پرداخت ناموفق: سفارش با همان قیمت می‌ماند و «دوباره پرداخت کن» تلاش تازه است', async () => {
      const { order, payment } = await placed([doc(10)]);
      await pay(payment!.redirectUrl, 'cancel');
      const view = await service.orderView(order.token, SARA);
      expect(view.ok && view.value.details).toMatchObject({ canPay: true, lastPayment: { status: 'failed', failureCode: 'cancelled' } });

      const again = await service.payAgain(SARA, order.token);
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.value.payment!.redirectUrl).not.toBe(payment!.redirectUrl);
      expect(orders.payments.map((p) => p.amountRials)).toEqual([order.totalRials, order.totalRials]);
      await pay(again.value.payment!.redirectUrl, 'success');
      expect(orders.orders[0]!.status).toBe('paid');
    });

    it('تلاش پرداخت کهنه‌تر از نیم ساعت سنجیده نمی‌شود', async () => {
      const { payment } = await placed([doc(10)]);
      const authority = payment!.redirectUrl.split('/').at(-1)!;
      await service.mockDecision(authority, { decision: 'success' });
      later(HALF_HOUR + 1);
      expect(await service.settle(authority, 'OK')).toMatchObject({ value: { payment: 'failed' } });
      expect(orders.payments[0]!.failureCode).toBe('expired');
      expect(orders.orders[0]!.status).toBe('awaiting_payment');
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

    it('پیامکی که نرفت پرداخت را برنمی‌گرداند', async () => {
      build({ name: 'broken', send: async () => Promise.reject(new Error('panel down')) });
      const { payment } = await placed([doc(10)]);
      expect(await pay(payment!.redirectUrl, 'success')).toMatchObject({ value: { payment: 'succeeded' } });
      expect(orders.orders[0]!.status).toBe('paid');
      expect(logs.some((line) => line.includes('پیامک پرداخت'))).toBe(true);
    });

    it('Authority ناشناس یا بدشکل: ۴۰۴', async () => {
      expect(await service.settle('MOCK' + '0'.repeat(32), 'OK')).toMatchObject({ status: 404 });
      expect(await service.settle('../../etc', 'OK')).toMatchObject({ status: 404 });
      expect(await service.settle('', null)).toMatchObject({ status: 404 });
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

  describe('درگاه نمونه', () => {
    it('تصمیم فقط یک بار ثبت می‌شود؛ تصمیم دوم اولی را عوض نمی‌کند', async () => {
      const { payment, order } = await placed([doc(10)]);
      const authority = payment!.redirectUrl.split('/').at(-1)!;
      expect(await service.mockGatewayView(authority)).toMatchObject({
        ok: true,
        value: { merchant: 'جزوه‌یار', orderNumber: order.number, amountRials: order.totalRials, decided: false },
      });
      expect(await service.mockDecision(authority, { decision: 'failure' })).toMatchObject({
        ok: true,
        value: { redirectUrl: `/pay/callback?Authority=${authority}&Status=NOK` },
      });
      await service.mockDecision(authority, { decision: 'success' });
      expect(orders.payments[0]!.raw).toMatchObject({ decision: 'failure' });
      expect(await service.settle(authority, 'OK')).toMatchObject({ value: { payment: 'failed' } });
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
            paperName: 'تحریر ۸۰ گرم',
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

    it('توکن ناشناس یا بدشکل: ۴۰۴', async () => {
      expect(await service.orderView(randomUUID(), SARA)).toMatchObject({ status: 404 });
      expect(await service.orderView('10001', SARA)).toMatchObject({ status: 404 });
    });
  });
});
