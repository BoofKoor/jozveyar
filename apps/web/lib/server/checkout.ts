/**
 * مسیر خرید روی سرور (برش ۳ب؛ ADR-034 و ADR-035): قیمت سرور، ساختن سفارش با «پرداخت»، شروع پرداخت،
 * برگشت از درگاه، و صفحهٔ سفارش.
 *
 * سرور منبع حقیقت است (قاعدهٔ ۲): از مرورگر فقط شناسهٔ سندها و انتخاب‌ها می‌آید. تعداد صفحهٔ هر بخش از
 * تحلیل سرور است، قاعدهٔ رنگ را سرور می‌سازد (امروز یک قاعده برای کل جزوه، قاعدهٔ ۵)، و قیمت همان
 * `quote()` است با تعرفهٔ فعال پایگاه داده (قاعدهٔ ۱). عددی که مرورگر نشان داده فقط برای سنجیدن است:
 * اگر با عدد سرور نخواند، سفارش ساخته نمی‌شود و عدد تازه برمی‌گردد.
 *
 * هر وابستگی بیرونی از درگاه می‌آید (`OrderStore`، `PaymentGateway`، `SmsProvider`)، پس کل منطق با
 * پیاده‌سازی حافظه‌ای تست می‌شود؛ درستی تراکنش‌ها و قفل‌ها در تست یکپارچگی `packages/db`.
 */

import {
  checkoutQuoteRequestSchema,
  mockDecisionSchema,
  placeOrderRequestSchema,
  type CheckoutItem,
  type CheckoutQuote,
  type OrderSummary,
  type OrderView,
  type Place,
  type PlacedOrder,
  type Recipient,
} from '@jozveyar/contracts/checkout';
import type { Breakdown, OrderSpec, PriceList } from '@jozveyar/contracts';
import type { CheckoutDocument, OrderDetails, OrderRow, OrderStore } from '@jozveyar/db';
import { SHIPPING_ZONES, findCity, findProvince, placeIsValid, shippingZoneOf } from '@jozveyar/geo';
import { itemPageCount, quote, wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { formatDeadlineDay, postHandoffDue, tidyInputFa, toLatinDigits } from '@jozveyar/text';

import type { AuthUser } from './auth';
import type { PaymentGateway } from './payments';
import { fail, ok, type Result } from './result';
import { readSetting } from './settings';
import { orderPaidText, type SmsProvider } from './sms';

/** پرداخت شروع نمی‌شود اگر کمتر از این تا پاک شدن فایلی مانده باشد (ADR-034). */
export const FILE_MARGIN_MS = 60 * 60_000;
/**
 * یک تلاش پرداخت تا این مدت سنجیده می‌شود؛ دیرتر یعنی «ناموفق» بی سنجش درگاه، و درگاه واقعی پول
 * سنجیده‌نشده را خودش برمی‌گرداند. کمتر از حاشیهٔ فایل است: پرداختی که پذیرفته شود فایل زنده دارد.
 */
export const PAYMENT_ATTEMPT_TTL_MS = 30 * 60_000;
/** ریز قیمت مرورگر فقط برای سنجیدن اختلاف است؛ بزرگ‌تر از این نمی‌پذیریم. */
export const MAX_QUOTE_SNAPSHOT_BYTES = 64 * 1024;

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORITY = /^[A-Za-z0-9_-]{8,64}$/;

export interface CheckoutDeps {
  orders: OrderStore;
  gateway: PaymentGateway;
  sms: SmsProvider;
  /** نشانی برگشت از درگاه (`/pay/callback`). */
  callbackUrl: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** جای ارسال معتبر، و منطقهٔ کرایه‌اش؛ منطقه مال استان است (سؤال ۹). */
function zoneOf(place: Place): string | null {
  if (!placeIsValid(place.provinceId, place.cityId)) return null;
  return shippingZoneOf(place.provinceId);
}

/**
 * مشخصات سفارش برای `quote()` با شمارش **سرور**: هر بخش همان صفحه‌هایی را دارد که کارگر شمرد، و قاعدهٔ
 * رنگ کل جزوه را می‌پوشاند (`features.per_page_color` خاموش است، قاعدهٔ ۵).
 */
function specOf(items: readonly CheckoutItem[], docs: ReadonlyMap<string, CheckoutDocument>, zoneId: string | null): OrderSpec {
  return {
    items: items.map((item) => {
      const sections = item.documentIds.map((id) => ({ documentId: id, pageCount: docs.get(id)!.pageCount! }));
      return {
        sections,
        rules: wholeDocumentRule(itemPageCount(sections), item.colorMode, item.paperTypeId),
        copies: item.copies,
        sidesMode: item.sidesMode,
        bindingTypeId: item.bindingTypeId,
      };
    }),
    shipping: zoneId ? { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } : null,
  };
}

/** فایلی که پاک شده یا تا یک ساعت دیگر پاک می‌شود؛ جزوهٔ آن نباید پرداخت شود. */
function expiring(file: { fileExpiresAt: Date | null; fileDeletedAt: Date | null }, at: Date): boolean {
  return (
    file.fileDeletedAt !== null ||
    file.fileExpiresAt === null ||
    file.fileExpiresAt.getTime() - at.getTime() < FILE_MARGIN_MS
  );
}

/**
 * گیرنده، فارسی‌نرمال و سنجیده؛ `fields` می‌گوید رابط کدام فیلد را قرمز کند. نرمال‌سازی «آ» و همزه را
 * نگه می‌دارد (`tidyInputFa`): این متن روی برچسب پست چاپ می‌شود.
 */
function recipientOf(input: Recipient): Result<{ name: string; addressText: string; postalCode: string | null }> {
  const fields: string[] = [];
  const name = tidyInputFa(input.name);
  if (name.length < 2 || name.length > 100) fields.push('recipient.name');
  const addressText = tidyInputFa(input.addressText);
  if (addressText.length < 10 || addressText.length > 500) fields.push('recipient.addressText');
  const digits = toLatinDigits(input.postalCode ?? '').replace(/[\s-]/g, '');
  const postalCode = digits === '' ? null : digits;
  if (postalCode !== null && !/^\d{10}$/.test(postalCode)) fields.push('recipient.postalCode');
  if (fields.length > 0) return fail(400, 'invalid_request', { fields });
  return ok({ name, addressText, postalCode });
}

function summary(order: OrderRow): OrderSummary {
  return { number: order.orderNumber, token: order.publicToken, status: order.status, totalRials: order.totalRials };
}

function issuePaths(issues: readonly { path: readonly PropertyKey[] }[]): string[] {
  return [...new Set(issues.map((issue) => issue.path.map(String).join('.')))];
}

/**
 * صفحهٔ سفارش (ADR-033): شماره، وضعیت و روز تحویل به پست برای همه؛ نشانی، موبایل، فایل‌ها و مبلغ فقط
 * برای نشست صاحب سفارش. جدا از سرویس خرید است و درگاه نمی‌خواهد: صفحهٔ سفارش با خاموش شدن مسیر خرید
 * خاموش نمی‌شود.
 */
export async function orderView(
  orders: OrderStore,
  token: string,
  user: AuthUser | null,
  at: Date,
): Promise<Result<OrderView>> {
  if (!TOKEN.test(token)) return fail(404, 'not_found');
  const found = await orders.details(token.toLowerCase());
  if (!found) return fail(404, 'not_found');
  const { order } = found;
  const owner = user !== null && user.userId === order.userId;
  const due = order.postHandoffDueAt;
  const view: OrderView = {
    number: order.orderNumber,
    status: order.status,
    postHandoffDueAt: due?.toISOString() ?? null,
    postHandoffDay: due ? formatDeadlineDay(due) : null,
    slaDays: order.slaDays,
    owner,
    details: null,
  };
  if (!owner) return ok(view);

  const list = await orders.priceList(order.priceListVersion);
  const province = findProvince(order.provinceId);
  const city = order.cityId === null ? undefined : findCity(order.cityId);
  const last = found.payments[0];
  view.details = {
    totalRials: order.totalRials,
    breakdown: order.priceBreakdown as Breakdown,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    refId: found.payments.find((p) => p.status === 'succeeded')?.refId ?? null,
    lastPayment: last ? { status: last.status, failureCode: last.failureCode } : null,
    canPay: payable(found, at),
    items: found.items.map((item) => {
      const modes = new Set(item.rules.map((rule) => rule.colorMode));
      const paperId = item.rules[0]?.paperTypeId ?? '';
      return {
        pageCount: item.pageCount,
        copies: item.copies,
        sidesMode: item.sidesMode,
        colorMode: modes.size === 1 ? [...modes][0]! : 'mixed',
        bindingName: list.bindingTypes[item.bindingTypeId]?.nameFa ?? item.bindingTypeId,
        paperName: list.paperTypes[paperId]?.nameFa ?? paperId,
        sections: item.sections.map((s) => ({ name: s.originalName, pageCount: s.pageCount })),
      };
    }),
    shipping: {
      methodName: list.shippingMethods[order.shippingMethodId]?.nameFa ?? order.shippingMethodId,
      provinceId: order.provinceId,
      provinceName: province?.name ?? '',
      cityId: order.cityId,
      cityName: city?.name ?? null,
    },
    recipient: {
      name: order.recipientName,
      phone: order.recipientPhone,
      addressText: order.addressText,
      postalCode: order.postalCode,
    },
  };
  return ok(view);
}

/** «دوباره پرداخت کن»: در انتظار پرداخت، و همهٔ فایل‌ها دست‌کم یک ساعت دیگر زنده. */
function payable(found: OrderDetails, at: Date): boolean {
  return (
    found.order.status === 'awaiting_payment' &&
    found.items.every((item) => item.sections.every((s) => !expiring(s, at)))
  );
}

export function createCheckoutService(deps: CheckoutDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message, error) => console.error(message, error ?? ''));
  const setting = (key: string) => deps.orders.setting(key);

  /** سندهای جزوه‌ها: مال همین مرورگر، شمرده‌شده روی سرور. سند نشست دیگر «پیدا نمی‌شود». */
  async function documentsOf(
    sessionHash: string,
    items: readonly CheckoutItem[],
  ): Promise<Result<Map<string, CheckoutDocument>>> {
    const ids = items.flatMap((item) => item.documentIds);
    if (new Set(ids).size !== ids.length) return fail(400, 'invalid_request', { fields: ['items'] });
    const rows = await deps.orders.documents(ids);
    const docs = new Map(rows.filter((row) => row.sessionHash === sessionHash).map((row) => [row.id, row]));
    const missing = ids.filter((id) => !docs.has(id));
    if (missing.length > 0) return fail(404, 'documents_not_found', { documentIds: missing });
    const unready = ids.filter((id) => {
      const doc = docs.get(id)!;
      return doc.status !== 'ready' || !doc.pageCount;
    });
    if (unready.length > 0) return fail(409, 'documents_not_ready', { documentIds: unready });
    return ok(docs);
  }

  /** قیمت سرور؛ بی جای ارسال، کرایه null. */
  async function priced(
    sessionHash: string,
    items: readonly CheckoutItem[],
    place: Place | null,
  ): Promise<Result<{ breakdown: Breakdown; list: PriceList; docs: Map<string, CheckoutDocument>; zoneId: string | null }>> {
    const zoneId = place ? zoneOf(place) : null;
    if (place && !zoneId) return fail(400, 'invalid_place');
    const docs = await documentsOf(sessionHash, items);
    if (!docs.ok) return docs;
    const list = await deps.orders.activePriceList();
    if (!list.shippingMethods[DEFAULT_SHIPPING_METHOD_ID]?.enabled) {
      log(`✗ روش ارسال ${DEFAULT_SHIPPING_METHOD_ID} در تعرفهٔ ${list.version} فعال نیست؛ سفارش ممکن نیست.`);
      return fail(503, 'shipping_unavailable');
    }
    const breakdown = quote(specOf(items, docs.value, zoneId), list);
    return ok({ breakdown, list, docs: docs.value, zoneId });
  }

  function expiringIds(docs: ReadonlyMap<string, CheckoutDocument>, at: Date): string[] {
    return [...docs.values()].filter((doc) => expiring(doc, at)).map((doc) => doc.id);
  }

  /** یک تلاش پرداخت تازه؛ هر تلاش یک ردیف `payments` با همان مبلغ منجمد. */
  async function startPayment(order: OrderRow): Promise<Result<{ redirectUrl: string }>> {
    let started: Awaited<ReturnType<PaymentGateway['start']>>;
    try {
      started = await deps.gateway.start({
        orderNumber: order.orderNumber,
        amountRials: order.totalRials,
        callbackUrl: deps.callbackUrl,
        mobile: order.recipientPhone,
        description: `سفارش ${order.orderNumber} جزوه‌یار`,
      });
    } catch (error) {
      log(`✗ درگاه پرداخت سفارش ${order.orderNumber} را شروع نکرد:`, error);
      return fail(503, 'gateway_unavailable', { order: summary(order) });
    }
    await deps.orders.insertPayment({
      orderId: order.id,
      provider: deps.gateway.name,
      amountRials: order.totalRials,
      authority: started.authority,
      raw: started.raw ?? null,
    });
    return ok({ redirectUrl: started.redirectUrl });
  }

  /**
   * پرداخت سفارشی که هست: فقط صاحبش، فقط در انتظار پرداخت، و فقط اگر فایل‌هایش زنده‌اند. سفارشی که
   * فایلش دیگر نیست `expired` می‌شود: پرداختش جزوه‌ای نمی‌ساخت.
   */
  async function payExisting(token: string, user: AuthUser): Promise<Result<PlacedOrder>> {
    const found = await deps.orders.details(token);
    if (!found || found.order.userId !== user.userId) return fail(404, 'not_found');
    const { order } = found;
    if (order.status === 'paid') return ok({ order: summary(order), payment: null });
    if (order.status === 'expired') return fail(409, 'order_expired', { order: summary(order) });
    const at = now();
    if (!payable(found, at)) {
      await deps.orders.expireOrder(order.id, at);
      return fail(409, 'order_expired', { order: { ...summary(order), status: 'expired' } });
    }
    const payment = await startPayment(order);
    if (!payment.ok) return payment;
    return ok({ order: summary(order), payment: payment.value });
  }

  return {
    /** قیمت سرور برای قدم شهر و مرور، با کرایهٔ هر منطقه برای کارت شهر. */
    async quote(sessionHash: string, body: unknown): Promise<Result<CheckoutQuote>> {
      const parsed = checkoutQuoteRequestSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'invalid_request', { fields: issuePaths(parsed.error.issues) });
      const { items, place } = parsed.data;
      const result = await priced(sessionHash, items, place);
      if (!result.ok) return result;
      const { breakdown, list, docs } = result.value;
      const stale = expiringIds(docs, now());
      if (stale.length > 0) return fail(409, 'files_expiring', { documentIds: stale });
      return ok({
        breakdown,
        shippingByZone: SHIPPING_ZONES.map((zone) => ({
          zoneId: zone.id,
          name: zone.name,
          shippingRials: quote(specOf(items, docs, zone.id), list).shippingRials,
        })),
      });
    },

    /**
     * «پرداخت»: سفارش در یک تراکنش ساخته می‌شود و پرداخت شروع می‌شود (ADR-034). همان `checkoutKey`
     * همان سفارش را برمی‌گرداند؛ عدد دیگر = ۴۰۹ با عدد تازه.
     */
    async placeOrder(sessionHash: string, user: AuthUser | null, body: unknown): Promise<Result<PlacedOrder>> {
      if (!user) return fail(401, 'auth_required');
      const parsed = placeOrderRequestSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'invalid_request', { fields: issuePaths(parsed.error.issues) });
      const input = parsed.data;
      const recipient = recipientOf(input.recipient);
      if (!recipient.ok) return recipient;
      const snapshot = input.quoteSnapshot ?? null;
      if (
        (snapshot !== null && (typeof snapshot !== 'object' || Array.isArray(snapshot))) ||
        JSON.stringify(snapshot).length > MAX_QUOTE_SNAPSHOT_BYTES
      ) {
        return fail(400, 'invalid_request', { fields: ['quoteSnapshot'] });
      }

      // تلاش دوباره (دو کلیک، شبکه‌ای که جواب را گم کرد): همان سفارش، بی حساب دوباره.
      const existing = await deps.orders.findByCheckoutKey(input.checkoutKey);
      if (existing) {
        if (existing.userId !== user.userId) return fail(409, 'checkout_key_conflict');
        return payExisting(existing.publicToken, user);
      }

      const result = await priced(sessionHash, input.items, input.place);
      if (!result.ok) return result;
      const { breakdown, docs, zoneId } = result.value;
      const at = now();
      const stale = expiringIds(docs, at);
      if (stale.length > 0) return fail(409, 'files_expiring', { documentIds: stale });
      if (breakdown.warnings.length > 0) return fail(422, 'quote_warnings', { warnings: breakdown.warnings });
      if (breakdown.totalRials !== input.expectedTotalRials) {
        return fail(409, 'price_changed', { totalRials: breakdown.totalRials, breakdown });
      }

      const spec = specOf(input.items, docs, zoneId);
      const { order, created } = await deps.orders.createOrder({
        checkoutKey: input.checkoutKey,
        userId: user.userId,
        breakdown,
        quoteSnapshot: snapshot,
        slaDays: await readSetting(setting, 'order.sla_days', log),
        shippingMethodId: DEFAULT_SHIPPING_METHOD_ID,
        shippingZoneId: zoneId!,
        provinceId: input.place.provinceId,
        cityId: input.place.cityId,
        recipientName: recipient.value.name,
        recipientPhone: user.mobile,
        addressText: recipient.value.addressText,
        postalCode: recipient.value.postalCode,
        items: spec.items.map((item) => ({
          pageCount: itemPageCount(item.sections),
          copies: item.copies,
          sidesMode: item.sidesMode,
          bindingTypeId: item.bindingTypeId,
          sections: item.sections,
          rules: item.rules.map((rule) => ({
            pageRanges: rule.pageRanges.map(([from, to]) => [from, to] as [number, number]),
            colorMode: rule.colorMode,
            paperTypeId: rule.paperTypeId,
          })),
        })),
      });
      if (!created) {
        // درخواست هم‌زمانِ همین کلید زودتر ساخت.
        if (order.userId !== user.userId) return fail(409, 'checkout_key_conflict');
        return payExisting(order.publicToken, user);
      }
      const payment = await startPayment(order);
      if (!payment.ok) return payment;
      return ok({ order: summary(order), payment: payment.value });
    },

    /** «دوباره پرداخت کن» بعد از پرداخت ناموفق: سفارش با همان قیمت منجمد، تلاش تازه. */
    async payAgain(user: AuthUser | null, token: string): Promise<Result<PlacedOrder>> {
      if (!user) return fail(401, 'auth_required');
      if (!TOKEN.test(token)) return fail(404, 'not_found');
      return payExisting(token.toLowerCase(), user);
    },

    /**
     * برگشت از درگاه (`/pay/callback`). سنجش سمت سرور، زیر قفل پرداخت و سفارش؛ برگشت تکراری همان نتیجهٔ
     * قبل را می‌دهد. موفق: در یک تراکنش `paid`، تاریخ پرداخت، مهلت تحویل به پست، رویداد و کار
     * `prepare_order`؛ بعد پیامک شمارهٔ سفارش. ناموفق: سفارش `awaiting_payment` با همان قیمت می‌ماند.
     */
    async settle(
      authority: string,
      callbackStatus: string | null,
    ): Promise<Result<{ token: string; payment: 'succeeded' | 'failed' | 'pending' }>> {
      if (!AUTHORITY.test(authority)) return fail(404, 'not_found');
      const at = now();
      const holidays = new Set((await readSetting(setting, 'calendar.holidays', log)).map((day) => day.date));
      const result = await deps.orders.settlePayment(deps.gateway.name, authority, async ({ payment, order }) => {
        // سفارشی که دیگر پرداختنی نیست سنجیده نمی‌شود: درگاه واقعی پول سنجیده‌نشده را برمی‌گرداند.
        if (order.status !== 'awaiting_payment') return { kind: 'failed', code: 'order_not_payable', raw: payment.raw };
        if (at.getTime() - payment.createdAt.getTime() > PAYMENT_ATTEMPT_TTL_MS) {
          return { kind: 'failed', code: 'expired', raw: payment.raw };
        }
        const verified = await deps.gateway.verify({
          authority,
          amountRials: payment.amountRials,
          callbackStatus,
          raw: payment.raw,
        });
        if (!verified.ok) return { kind: 'failed', code: verified.code, raw: verified.raw };
        return {
          kind: 'succeeded',
          refId: verified.refId,
          cardMask: verified.cardMask,
          raw: verified.raw,
          paidAt: at,
          postHandoffDueAt: postHandoffDue(at, order.slaDays, holidays),
        };
      });
      if (!result) return fail(404, 'not_found');

      const { payment, order } = result;
      if (result.settled && payment.status === 'succeeded' && order.postHandoffDueAt) {
        // بعد از commit، نه در تراکنش: پنل واقعی درخواست HTTP است، و پیامکی که نرسید پرداخت را برنمی‌گرداند.
        try {
          await deps.sms.send({
            to: order.recipientPhone,
            purpose: 'order_paid',
            text: orderPaidText(order.orderNumber, formatDeadlineDay(order.postHandoffDueAt)),
          });
        } catch (error) {
          log(`✗ پیامک پرداخت سفارش ${order.orderNumber} فرستاده نشد:`, error);
        }
      }
      return ok({ token: order.publicToken, payment: payment.status });
    },

    /** صفحهٔ درگاه نمونه (۳ج): پذیرنده، شمارهٔ سفارش و مبلغ. */
    async mockGatewayView(
      authority: string,
    ): Promise<Result<{ merchant: string; orderNumber: number; amountRials: number; decided: boolean; payment: string }>> {
      if (deps.gateway.name !== 'mock' || !AUTHORITY.test(authority)) return fail(404, 'not_found');
      const found = await deps.orders.gatewayPayment('mock', authority);
      if (!found) return fail(404, 'not_found');
      const decided = typeof (found.payment.raw as { decision?: unknown } | null)?.decision === 'string';
      return ok({
        merchant: 'جزوه‌یار',
        orderNumber: found.order.orderNumber,
        amountRials: found.payment.amountRials,
        decided,
        payment: found.payment.status,
      });
    },

    /**
     * تصمیم صفحهٔ درگاه نمونه. فقط ثبت می‌شود؛ سنجش در برگشت است و همین را می‌خواند، نه `Status` نشانی.
     * نشانی برگشت شکل زرین‌پال را دارد.
     */
    async mockDecision(authority: string, body: unknown): Promise<Result<{ redirectUrl: string }>> {
      if (deps.gateway.name !== 'mock' || !AUTHORITY.test(authority)) return fail(404, 'not_found');
      const parsed = mockDecisionSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'invalid_request');
      const found = await deps.orders.gatewayPayment('mock', authority);
      if (!found) return fail(404, 'not_found');
      await deps.orders.recordMockDecision(authority, parsed.data.decision, now());
      const status = parsed.data.decision === 'success' ? 'OK' : 'NOK';
      return ok({ redirectUrl: `/pay/callback?Authority=${encodeURIComponent(authority)}&Status=${status}` });
    },

    orderView: (token: string, user: AuthUser | null) => orderView(deps.orders, token, user, now()),
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
