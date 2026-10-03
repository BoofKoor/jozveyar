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
 *
 * از برش ۷٫۲ (ADR-050): هر تلاش کلید برگشت تصادفی خودش را دارد و نشانی برگشت `/pay/callback/<کلید>` است (سؤال ۱۴۵)؛ برگشت، استعلام
 * خودکار و «استعلام از درگاه» پنل همه با یک حکم (`settleWith`، استعلام پیش از `verify`)؛ و تلاشی که پولش شاید گرفته شده تلاش تازه را
 * نمی‌گذارد («پرداختت در حال بررسی است»).
 */

import {
  checkoutQuoteRequestSchema,
  mockDecisionSchema,
  placeOrderRequestSchema,
  type CheckoutItem,
  type CheckoutQuote,
  type OrderSummary,
  type OrderView,
  type OrderViewRefund,
  type Place,
  type PlacedOrder,
  type Recipient,
} from '@jozveyar/contracts/checkout';
import type { Breakdown, OrderSpec, PriceList } from '@jozveyar/contracts';
import {
  FILE_MARGIN_MS,
  GATEWAY_NOT_READY_RESULTS,
  HELD_WATCH_MS,
  IRAN_POST,
  PAYMENT_ATTEMPT_TTL_MS,
  isChecking,
  isPaidStatus,
  settleWith,
  watchHeld,
  type CheckoutDocument,
  type OrderDetails,
  type OrderRow,
  type OrderStore,
  type PaymentRow,
} from '@jozveyar/db';
import {
  CARD_REASONS,
  MONEY_HELD,
  STATUS_WAITING,
  failureGroup,
  gatewayName,
  paymentErrorTag,
  parsePaymentErrorTag,
  type PaymentGateway,
} from '@jozveyar/payments';
import { SHIPPING_ZONES, findCity, findProvince, placeIsValid, shippingZoneOf } from '@jozveyar/geo';
import { itemPageCount, quote, wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { deliverQueued, smsState, type SmsOutbox, type SmsTransport } from '@jozveyar/sms';
import { formatDeadlineDay, formatJalaliWeekday, formatTehranTime } from '@jozveyar/text';
import { checkRecipient } from '@jozveyar/text/input';

import { randomBytes, randomUUID } from 'node:crypto';

import type { AuthUser } from './auth';
import { fail, ok, type Result } from './result';
import { readSetting } from './settings';

/**
 * حاشیهٔ فایل (یک ساعت) و مهلت هر تلاش پرداخت (۱۰ دقیقه از ۷٫۲، سؤال ۱۴۴) در `@jozveyar/db`اند، چون پنل ادمین هم با همان‌ها
 * سفارش «رهاشده» و پرداخت «بی برگشت» را می‌شناسد (برش ۴٫۲).
 */
export { FILE_MARGIN_MS, PAYMENT_ATTEMPT_TTL_MS };

/** کلید برگشت هر تلاش (سؤال ۱۴۵): ۱۲۸ بیت تصادفی، همان شکل CHECK `payments_return_key`. */
export const RETURN_KEY = /^[0-9a-f]{32}$/;

/**
 * استعلام خودکار (سؤال ۱۴۴): تلاش باز بیش از ۲ دقیقه، هر دقیقه؛ و پول تلاش بسته‌ای که شاید نزد درگاه است، تا دو ساعت
 * (`HELD_WATCH_MS`)، هر ۲ دقیقه. زیبال پول تأییدنشده را ۱۵ دقیقه پس از پرداخت برمی‌گرداند.
 */
export const AUTO_INQUIRY_EVERY_MS = 60_000;
export const AUTO_INQUIRY_AFTER_MS = 2 * 60_000;
export const HELD_WATCH_EVERY_MS = 2 * 60_000;
const AUTO_INQUIRY_BATCH = 20;
/** ریز قیمت مرورگر فقط برای سنجیدن اختلاف است؛ بزرگ‌تر از این نمی‌پذیریم. */
export const MAX_QUOTE_SNAPSHOT_BYTES = 64 * 1024;

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORITY = /^[A-Za-z0-9_-]{8,64}$/;

export interface CheckoutDeps {
  orders: OrderStore;
  /** درگاه شروع پرداخت در این حالت: درگاه نمونه در `mock`، و زیبال در `live` (۷٫۵). */
  gateway: PaymentGateway;
  /**
   * درگاه‌هایی که برگشت و استعلامشان در این حالت پذیرفته است، با نامشان (`payments.provider`)؛ بی آن فقط `gateway`. پرداخت هر درگاه با
   * درگاه خودش سنجیده می‌شود، و پرداخت درگاهی که اینجا نیست انگار نیست (درگاه نمونه هرگز در `live`، ADR-035).
   */
  gateways?: Readonly<Record<string, PaymentGateway>>;
  /** پیامک پرداخت از صف (برش ۷٫۱، ADR-049): ردیف منتظر را `settlePayment` در همان تراکنش نوشته؛ اینجا بعد از commit فرستاده می‌شود. */
  sms: { transport: SmsTransport; outbox: SmsOutbox };
  /** نشانی پایهٔ برگشت از درگاه (`PAYMENT_CALLBACK_URL`، یا `/pay/callback` درگاه نمونه)؛ کلید برگشت هر تلاش به تهش می‌آید. */
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
 * گیرنده، فارسی‌نرمال و سنجیده؛ `fields` می‌گوید رابط کدام فیلد را قرمز کند. همان قاعده‌ای که مرورگر
 * پیش از قدم پرداخت می‌سنجد و پنل در ویرایش نشانی (`checkRecipient` در `@jozveyar/text/input`)؛ اینجا دوباره، چون
 * سرور منبع حقیقت است.
 */
function recipientOf(input: Recipient): Result<{ name: string; addressText: string; postalCode: string | null }> {
  const { value, fields } = checkRecipient(input);
  if (fields.length > 0) return fail(400, 'invalid_request', { fields });
  return ok(value);
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
 * خاموش نمی‌شود. از برش ۴٫۳ وضعیت‌های پنل هم (ADR-039)، با روز «تحویل پست شد»؛ دلیل لغو فقط در پنل است و اینجا
 * نمی‌آید.
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
  // فقط و همیشه در «تحویل پست شد» (محدودیت `orders_handed_at`).
  const handed = order.handedToPostAt;
  // کدهای زنده (کنارگذاشته هرگز) با پیامکشان (برش ۶٫۳، ADR-047)؛ «رفت» همان `smsState` پنل.
  const parcels = found.parcels.map((parcel) => ({
    barcode: parcel.barcode,
    trackingUrl: IRAN_POST.trackingUrl(parcel.barcode),
    smsSent: parcel.sms !== null && smsState(parcel.sms, at) === 'sent',
  }));
  const view: OrderView = {
    number: order.orderNumber,
    status: order.status,
    postHandoffDueAt: due?.toISOString() ?? null,
    postHandoffDay: due ? formatDeadlineDay(due) : null,
    // مهلت پایان انحصاری روز است: تحویل پیش از آن، در مهلت.
    handedToPost: handed ? { day: formatJalaliWeekday(handed), onTime: due !== null && handed.getTime() < due.getTime() } : null,
    trackingSent: parcels.some((parcel) => parcel.smsSent),
    slaDays: order.slaDays,
    owner,
    details: null,
  };
  if (!owner) return ok(view);

  const list = await orders.priceList(order.priceListVersion);
  const province = findProvince(order.provinceId);
  const city = order.cityId === null ? undefined : findCity(order.cityId);
  const last = found.payments[0];
  const group = last?.status === 'failed' ? failureGroup(last.failureCode, last.gatewayStatus) : null;
  const held = found.payments.find(isChecking);
  const succeeded = found.payments.find((p) => p.status === 'succeeded');
  view.details = {
    totalRials: order.totalRials,
    breakdown: order.priceBreakdown as Breakdown,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    refId: succeeded?.refId ?? null,
    lastPayment: last
      ? {
          status: last.status,
          failureCode: last.failureCode,
          gatewayStatus: last.gatewayStatus,
          failureGroup: group,
          cardReason: group === 'card' && last.gatewayStatus !== null ? (CARD_REASONS[last.gatewayStatus] ?? null) : null,
          unpaid:
            last.status === 'pending' && last.returnedAt !== null && last.gatewayStatus === STATUS_WAITING && last.gatewayError === null,
          gateway: gatewayName(last.provider),
        }
      : null,
    checking: held ? { checkedAt: held.gatewayCheckedAt?.toISOString() ?? null } : null,
    // پرداخت دوم (۷٫۲): سفارش پیش‌تر پرداخت شده بود و پول این یکی نزد درگاه ماند تا برگردد؛ فقط وقتی درگاه گفت پول گرفته شد.
    extraPayments: found.payments
      .filter(
        (p) =>
          p.status === 'failed' &&
          p.failureCode === 'order_not_payable' &&
          p.gatewayStatus !== null &&
          (MONEY_HELD.has(p.gatewayStatus) || p.gatewayStatus === 15 || p.gatewayStatus === 18),
      )
      .map((p) => ({ amountRials: p.amountRials, cardMask: p.cardMask, gateway: gatewayName(p.provider) })),
    canPay: payable(found, at) && !found.payments.some(isChecking),
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
    parcels,
    refund: order.status === 'cancelled' && succeeded ? refundView(found.refunds.find((r) => r.paymentId === succeeded.id), succeeded.cardMask) : null,
  };
  return ok(view);
}

/**
 * بازپرداخت برای صاحب سفارش (برش ۷٫۳، سؤال ۱۵۷): آخرین بازپرداخت پرداخت موفق. «در حال برگشت» فقط وقتی درگاه پذیرفت (شناسه یا وضعیتی
 * داد)؛ درخواستی که جواب روشن نگرفت و «برنگشت» همان null است و صفحه «برمی‌گردد» لغو را می‌گوید. ثبت دستی فقط روز، بی ساعت و بی کارت.
 */
function refundView(refund: OrderDetails['refunds'][number] | undefined, cardMask: string | null): OrderViewRefund | null {
  if (!refund) return null;
  if (refund.status === 'pending') {
    return refund.gatewayRef === null && refund.gatewayStatus === null ? null : { state: 'refunding', amountRials: refund.amountRials, cardMask };
  }
  if (refund.status !== 'succeeded') return null;
  const manual = refund.method === 'manual';
  const at = manual ? refund.refundedOn! : refund.finishedAt!;
  return {
    state: 'refunded',
    amountRials: refund.amountRials,
    cardMask: manual ? null : cardMask,
    day: formatJalaliWeekday(at),
    time: manual ? null : formatTehranTime(at),
    reference: refund.reference,
  };
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
  const gateways: Readonly<Record<string, PaymentGateway>> = deps.gateways ?? { [deps.gateway.name]: deps.gateway };
  const providers = Object.keys(gateways);

  /**
   * پیامک‌هایی که همین تراکنش پرداخت نوشت، بعد از commit: پیامک پرداخت به مشتری (برش ۷٫۱)، و پیامک سفارش تازه به چاپخانه‌ای که سفارش به
   * آن رسید و موبایل اعلان دارد (برش ۷٫۶). شکستشان پرداخت را برنمی‌گرداند؛ ردیفشان «نرفت» می‌ماند و پنل «دوباره بفرست» دارد.
   */
  async function deliverPaidSms(result: { smsId: number | null; partnerSmsId: number | null; order: { orderNumber: number } }) {
    const ids = [result.smsId, result.partnerSmsId].filter((id): id is number => id !== null);
    if (ids.length === 0) return;
    try {
      await deliverQueued({ outbox: deps.sms.outbox, transport: deps.sms.transport, now, log }, ids);
    } catch (error) {
      log(`✗ پیامک‌های پرداخت سفارش ${result.order.orderNumber} فرستاده نشد:`, error);
    }
  }

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

  /**
   * یک تلاش پرداخت تازه؛ هر تلاش یک ردیف `payments` با همان مبلغ منجمد (ADR-050): کلید برگشت تصادفی خودش (سؤال ۱۴۵)، و شناسهٔ سفارش
   * نزد درگاه «شمارهٔ سفارش-۸ نویسهٔ اول شناسهٔ تلاش». نه موبایل، نه کد ملی (کمینهٔ داده). زیبال سفارش بالاتر از سقف یک پرداخت را
   * نمی‌پذیرد (۱۱۳، سؤال ۱۴۸)، و IP ثبت‌نشده (۱۱۵) یا کد پذیرندهٔ خالی یعنی درگاه آماده نیست (سؤال ۱۳۹).
   */
  async function startPayment(order: OrderRow): Promise<Result<{ redirectUrl: string }>> {
    const id = randomUUID();
    const returnKey = randomBytes(16).toString('hex');
    const gatewayOrderId = `${order.orderNumber}-${id.slice(0, 8)}`;
    let started: Awaited<ReturnType<PaymentGateway['start']>>;
    try {
      started = await deps.gateway.start({
        amountRials: order.totalRials,
        callbackUrl: `${deps.callbackUrl.replace(/\/+$/, '')}/${returnKey}`,
        orderId: gatewayOrderId,
        description: `سفارش ${order.orderNumber} جزوه‌یار`,
      });
    } catch (error) {
      // فقط برچسب (`rejected:115`)؛ خطای بیرونی متن یا پیکربندی درخواست را با خودش داشت.
      const tag = paymentErrorTag(error);
      log(`✗ درگاه پرداخت سفارش ${order.orderNumber} را شروع نکرد: ${tag}`);
      const { code, number } = parsePaymentErrorTag(tag);
      if (code === 'rejected' && number === 113) return fail(409, 'amount_over_gateway_limit', { order: summary(order) });
      // کار مالک، نه مشتری (سؤال ۱۳۹): IP سرور یا کد پذیرنده؛ رویداد سیستم برای هشدار پیشخوان، تا اولین شروع یا «آزمایش» درست.
      if (code === 'rejected' && number !== null && GATEWAY_NOT_READY_RESULTS.includes(number)) {
        await deps.orders
          .recordGatewayRejection({ orderId: order.id, orderNumber: order.orderNumber, provider: deps.gateway.name, result: number, at: now() })
          .catch((recordError: unknown) => log('✗ رد درگاه در رویدادها نوشته نشد:', recordError));
        return fail(503, 'gateway_not_ready', { order: summary(order) });
      }
      if (code === 'unconfigured') return fail(503, 'gateway_not_ready', { order: summary(order) });
      return fail(503, 'gateway_unavailable', { order: summary(order) });
    }
    await deps.orders.insertPayment({
      id,
      orderId: order.id,
      provider: deps.gateway.name,
      amountRials: order.totalRials,
      authority: started.authority,
      gatewayOrderId,
      returnKey,
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
    // پرداخت‌شده، هر وضعیتی که پنل بعدش داده (در حال چاپ، تحویل پست شد، لغو شد): پول دوم نه.
    if (isPaidStatus(order.status)) return ok({ order: summary(order), payment: null });
    if (order.status === 'expired') return fail(409, 'order_expired', { order: summary(order) });
    // پولی شاید گرفته شده و نتیجه‌اش هنوز نیامده: تلاش تازه پول دوم بود («پرداختت در حال بررسی است»).
    if (found.payments.some(isChecking)) return fail(409, 'payment_checking', { order: summary(order) });
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
     * برگشت از درگاه (`/pay/callback/<کلید>`، سؤال ۱۴۵): فقط کلید برگشت همین تلاش خوانده می‌شود، هیچ پارامتر درگاه؛ کلید ناشناس ۴۰۴.
     * سنجش سمت سرور با درگاه خود همان پرداخت، زیر قفل پرداخت و سفارش: استعلام پیش از `verify` (`settleWith`، ADR-050)؛ برگشت تکراری
     * (رفرش، Push Transaction زیبال) همان نتیجهٔ قبل را می‌دهد. موفق: در یک تراکنش `paid`، تاریخ پرداخت، مهلت تحویل به پست، رویداد،
     * کارهای `prepare_order` و `prepare_ticket` (برش ۵٫۱)، ردیف «منتظر» پیامک پرداخت (برش ۷٫۱)، و پیامک سفارش تازه به چاپخانه‌ای که موبایل
     * اعلان دارد (برش ۷٫۶)؛ بعد از commit همان پیامک‌ها فرستاده می‌شوند.
     * «در انتظار» (برگشت زودرس، یا درگاه جواب نداد) و ناموفق: سفارش `awaiting_payment` با همان قیمت می‌ماند.
     */
    async settle(returnKey: string): Promise<Result<{ token: string; payment: 'succeeded' | 'failed' | 'pending' }>> {
      if (!RETURN_KEY.test(returnKey)) return fail(404, 'not_found');
      const result = await settleWith({ store: deps.orders, lookup: { returnKey, providers }, gateways, via: 'callback', now, returned: true, log });
      if (!result || result === 'busy') return fail(404, 'not_found');
      await deliverPaidSms(result);
      return ok({ token: result.order.publicToken, payment: result.payment.status });
    },

    /**
     * استعلام خودکار «پرداخت بی برگشت» (سؤال‌های ۲۲ و ۱۴۴؛ ADR-050): تلاش‌های بازی که بیش از ۲ دقیقه از ساختنشان گذشته و این دقیقه
     * پرسیده نشده‌اند، با همان حکم برگشت؛ تلاشی که کس دیگری همین حالا قفلش کرده رها می‌شود (`SKIP LOCKED`: چند نود، یک استعلام). بعد پول
     * تلاش‌های بسته‌ای که شاید هنوز نزد درگاه است (پرداخت دوم، مهلت گذشته) تا «ریورس‌شده»، فقط استعلام. درگاه نمونه پولی ندارد که بپاید.
     */
    async autoInquiry(): Promise<{ checked: number; settled: number; watched: number }> {
      const at = now();
      const ids = await deps.orders.pendingAttempts({
        providers,
        createdBefore: new Date(at.getTime() - AUTO_INQUIRY_AFTER_MS),
        checkedBefore: new Date(at.getTime() - AUTO_INQUIRY_EVERY_MS + 10_000),
        limit: AUTO_INQUIRY_BATCH,
      });
      let settled = 0;
      for (const paymentId of ids) {
        const result = await settleWith({ store: deps.orders, lookup: { paymentId, providers }, gateways, via: 'auto', now, skipLocked: true, log });
        if (!result || result === 'busy') continue;
        if (result.settled) settled += 1;
        await deliverPaidSms(result);
      }
      const real = providers.filter((name) => name !== 'mock');
      const held = await deps.orders.heldAttempts({
        providers: real,
        createdAfter: new Date(at.getTime() - HELD_WATCH_MS),
        checkedBefore: new Date(at.getTime() - HELD_WATCH_EVERY_MS + 10_000),
        limit: AUTO_INQUIRY_BATCH,
      });
      for (const payment of held) await watchHeld({ store: deps.orders, payment, gateway: gateways[payment.provider]!, now });
      return { checked: ids.length, settled, watched: held.length };
    },

    /** صفحهٔ درگاه نمونه (۳ج): پذیرنده، شمارهٔ سفارش و مبلغ. */
    async mockGatewayView(
      authority: string,
    ): Promise<Result<{ merchant: string; orderNumber: number; amountRials: number; decided: boolean; payment: string; returnUrl: string }>> {
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
        returnUrl: `${deps.callbackUrl.replace(/\/+$/, '')}/${found.payment.returnKey}`,
      });
    },

    /**
     * تصمیم صفحهٔ درگاه نمونه. فقط ثبت می‌شود؛ سنجش در برگشت است و همین را با استعلام می‌خواند. نشانی برگشت همان نشانی کلیددار تلاش است
     * (سؤال ۱۴۵)، بی هیچ پارامتر.
     */
    async mockDecision(authority: string, body: unknown): Promise<Result<{ redirectUrl: string }>> {
      if (deps.gateway.name !== 'mock' || !AUTHORITY.test(authority)) return fail(404, 'not_found');
      const parsed = mockDecisionSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'invalid_request');
      const found = await deps.orders.gatewayPayment('mock', authority);
      if (!found) return fail(404, 'not_found');
      await deps.orders.recordMockDecision(authority, parsed.data.decision, now());
      return ok({ redirectUrl: `${deps.callbackUrl.replace(/\/+$/, '')}/${found.payment.returnKey}` });
    },

    orderView: (token: string, user: AuthUser | null) => orderView(deps.orders, token, user, now()),
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
