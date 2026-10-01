/**
 * پیاده‌سازی‌های حافظه‌ای درگاه‌های پایگاه داده — فقط برای تست: `DocumentStore` (آپلود)، و از برش ۳ب
 * `AuthStore`، `OrderStore` و `SmsLog` (مسیر خرید).
 *
 * همان قراردادی که نسخه‌های پستگرس دارند؛ درستی آنها در تست یکپارچگی `packages/db` سنجیده می‌شود.
 */

import { randomUUID } from 'node:crypto';

import {
  choosePartner,
  type AssignmentRule,
  type AuthStore,
  type CheckoutDocument,
  type DocumentJob,
  type DocumentRow,
  type DocumentStore,
  type NewOrder,
  type NewUploadDocument,
  type OrderDetails,
  type OrderRow,
  type OrderStore,
  type OtpRow,
  type PartnerCandidate,
  type PaymentRow,
  type PrintRuleRow,
  type SmsLog,
  type SmsRecord,
  type StoredAnalysis,
} from '@jozveyar/db';
import type { DocumentAnalysis, PriceList } from '@jozveyar/contracts';
import { orderPaidText, paidParams, type SmsOutbox } from '@jozveyar/sms';
import { formatDeadlineDay } from '@jozveyar/text';

export function memoryStore(): DocumentStore & {
  rows: Map<string, DocumentRow>;
  /** سندهایی که در سفارش‌اند (`order_item_sections`). */
  ordered: Set<string>;
  settings: Map<string, unknown>;
  queued: Map<string, DocumentJob>;
  browserAnalyses: Map<string, DocumentAnalysis>;
  serverAnalyses: Map<string, StoredAnalysis>;
} {
  const rows = new Map<string, DocumentRow>();
  const settings = new Map<string, unknown>();
  /** کاری که در صف رفته (تحلیل یا تبدیل) — شبیه جدول `jobs`. */
  const queued = new Map<string, DocumentJob>();
  const browserAnalyses = new Map<string, DocumentAnalysis>();
  /** تحلیل‌هایی که «کارگر» نوشته — تست مستقیم پرش می‌کند. */
  const serverAnalyses = new Map<string, StoredAnalysis>();
  const ordered = new Set<string>();
  return {
    rows,
    ordered,
    settings,
    queued,
    browserAnalyses,
    serverAnalyses,
    async insertUpload(doc: NewUploadDocument) {
      rows.set(doc.id, {
        ...doc,
        createdAt: new Date(),
        fileExpiresAt: null,
        fileDeletedAt: null,
        status: 'uploading',
        pageCount: null,
        failureReason: null,
        uploadedAt: null,
        pdfStorageKey: null,
        pdfSizeBytes: null,
        conversion: null,
      });
    },
    async find(id) {
      return rows.get(id) ?? null;
    },
    async markUploaded(id, at, fileExpiresAt, job) {
      Object.assign(rows.get(id)!, { status: 'uploaded', uploadedAt: at, fileExpiresAt });
      if (job && !queued.has(id)) queued.set(id, job);
    },
    async markFailed(id, reason, fileDeletedAt) {
      Object.assign(rows.get(id)!, { status: 'failed', failureReason: reason, fileDeletedAt: fileDeletedAt ?? null });
    },
    async countOpenUploads(session) {
      return [...rows.values()].filter((r) => r.sessionHash === session && r.status === 'uploading').length;
    },
    async committedBytes() {
      return [...rows.values()]
        .filter((r) => r.status !== 'failed' && r.status !== 'pending' && r.fileDeletedAt === null)
        .reduce((sum, r) => sum + r.sizeBytes + (r.pdfSizeBytes ?? 0), 0);
    },
    async setting(key) {
      return settings.get(key);
    },
    async saveBrowserAnalysis(documentId, analysis) {
      if (browserAnalyses.has(documentId)) return false;
      browserAnalyses.set(documentId, analysis);
      return true;
    },
    async serverAnalysis(documentId) {
      return serverAnalyses.get(documentId) ?? null;
    },
    async inOrder(documentId) {
      return ordered.has(documentId);
    },
  };
}

/* ──────────────────────── مسیر خرید (برش ۳ب) ──────────────────────── */

/**
 * `AuthStore` حافظه‌ای. شمارش همان پنجره‌ها و همان شرط‌های اتمی نسخهٔ پستگرس را دارد؛ قفل لازم ندارد، چون
 * اینجا هیچ دو کاری وسط هم اجرا نمی‌شوند (هم‌زمانی را تست یکپارچگی `packages/db` می‌سنجد). دروازهٔ جزوه (برش ۷) از
 * `ready`: این مرورگر سند آماده و زنده دارد؟ پیش‌فرض آری؛ پرسش واقعی سند را تست یکپارچگی می‌سنجد.
 */
export function memoryAuthStore(
  options: { ready?: (sessionHash: string, readyUntil: Date) => boolean } = {},
): AuthStore & {
  otps: OtpRow[];
  users: Map<string, { id: string; mobile: string }>;
  sessions: Map<string, { id: string; userId: string; expiresAt: Date; revokedAt: Date | null }>;
} {
  const otps: OtpRow[] = [];
  const users = new Map<string, { id: string; mobile: string }>();
  const sessions = new Map<string, { id: string; userId: string; expiresAt: Date; revokedAt: Date | null }>();
  const oldest = (rows: OtpRow[]) => (rows.length ? new Date(Math.min(...rows.map((r) => r.createdAt.getTime()))) : null);
  const latest = (rows: OtpRow[]) => (rows.length ? new Date(Math.max(...rows.map((r) => r.createdAt.getTime()))) : null);

  return {
    otps,
    users,
    sessions,
    async issueOtp(input, decide) {
      const inDay = otps.filter((o) => o.createdAt.getTime() > input.daySince.getTime());
      const inWindow = inDay.filter((o) => o.createdAt.getTime() > input.hourSince.getTime());
      const byMobile = inWindow.filter((o) => o.mobile === input.mobile);
      const byMobileDay = inDay.filter((o) => o.mobile === input.mobile);
      const bySession = inWindow.filter((o) => o.sessionHash === input.sessionHash);
      const byIp = inWindow.filter((o) => o.ipHash === input.ipHash);
      const otp = decide({
        mobile: byMobile.length,
        mobileOldest: oldest(byMobile),
        mobileLatest: latest(byMobileDay),
        mobileDay: byMobileDay.length,
        mobileDayOldest: oldest(byMobileDay),
        session: bySession.length,
        sessionOldest: oldest(bySession),
        ip: byIp.length,
        ipOldest: oldest(byIp),
        site: inWindow.length,
        siteOldest: oldest(inWindow),
        siteDay: inDay.length,
        siteDayOldest: oldest(inDay),
        ready: (options.ready ?? (() => true))(input.sessionHash, input.readyUntil),
      });
      if (!otp) return null;
      const id = randomUUID();
      otps.push({
        id,
        mobile: input.mobile,
        codeHash: otp.codeHash,
        sessionHash: input.sessionHash,
        ipHash: input.ipHash,
        attempts: 0,
        createdAt: otp.createdAt,
        expiresAt: otp.expiresAt,
        consumedAt: null,
      });
      return { id };
    },
    async latestOtp(sessionHash, mobile) {
      const mine = otps.filter((o) => o.sessionHash === sessionHash && o.mobile === mobile);
      return mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
    },
    async claimOtpAttempt(id, now, maxAttempts) {
      const otp = otps.find((o) => o.id === id);
      if (!otp || otp.consumedAt || otp.expiresAt.getTime() <= now.getTime() || otp.attempts >= maxAttempts) return null;
      otp.attempts += 1;
      return otp.attempts;
    },
    async login({ otpId, mobile, tokenHash, now, expiresAt }) {
      const otp = otps.find((o) => o.id === otpId);
      if (!otp || otp.consumedAt) return null;
      otp.consumedAt = now;
      const user = users.get(mobile) ?? { id: randomUUID(), mobile };
      users.set(mobile, user);
      sessions.set(tokenHash, { id: randomUUID(), userId: user.id, expiresAt, revokedAt: null });
      return { userId: user.id };
    },
    async findSession(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) return null;
      const user = [...users.values()].find((u) => u.id === session.userId)!;
      return { id: session.id, userId: user.id, mobile: user.mobile };
    },
    async revokeSession(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.revokedAt) return false;
      session.revokedAt = now;
      return true;
    },
  };
}

export function memorySmsLog(): SmsLog & { messages: SmsRecord[] } {
  const messages: SmsRecord[] = [];
  return {
    messages,
    async insert(message) {
      messages.push(message);
    },
  };
}

interface MemoryItem {
  id: string;
  orderId: string;
  seq: number;
  pageCount: number;
  copies: number;
  sidesMode: 'single' | 'double';
  bindingTypeId: string;
  sections: { seq: number; documentId: string; pageCount: number }[];
  rules: PrintRuleRow[];
}

/** ردیف پیامک پرداخت ذخیره‌گاه حافظه‌ای (برش ۷٫۱). */
export interface MemorySms {
  id: number;
  purpose: 'order_paid';
  to: string;
  body: string;
  params: string[];
  status: 'pending' | 'sending' | 'logged' | 'sent' | 'failed';
  provider: string;
  attempts: number;
  error: string | null;
  cost: number | null;
}

/** چاپخانهٔ ذخیره‌گاه حافظه‌ای (برش ۵٫۲)؛ غیرفعال یعنی سفارش تازه نمی‌گیرد. */
export interface MemoryPartner extends PartnerCandidate {
  name: string;
  active: boolean;
}

/** همان اولین چاپخانهٔ دادهٔ پایه (`seedReferenceData`): «چاپخانهٔ جزوه‌یار» در شهر تهران، پیش‌فرض. */
export const FIRST_MEMORY_PARTNER: MemoryPartner = {
  id: 'partner-jozveyar',
  name: 'چاپخانهٔ جزوه‌یار',
  cityId: 394,
  provinceId: 8,
  isDefault: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  active: true,
};

/**
 * `OrderStore` حافظه‌ای، با همان محافظ‌هایی که پایگاه داده دارد و سرویس به آنها تکیه می‌کند: پوشش دقیق
 * صفحه‌ها، یکتایی `checkout_key`، یک پرداخت موفق برای هر سفارش، و «پرداخت برگشت ندارد». از برش ۵٫۲ پرداخت چاپخانه را
 * با همان قاعدهٔ پایگاه داده (`choosePartner`) انتخاب می‌کند.
 */
export function memoryOrderStore(options: { priceList: PriceList; now: () => Date }): OrderStore & {
  documentsById: Map<string, CheckoutDocument>;
  settings: Map<string, unknown>;
  orders: OrderRow[];
  items: MemoryItem[];
  payments: PaymentRow[];
  events: { orderId: string; fromStatus: string | null; toStatus: string; actor: string; note: unknown }[];
  jobs: { kind: string; orderId: string }[];
  priceLists: Map<number, PriceList>;
  /** چاپخانه‌ها؛ با اولین چاپخانهٔ دادهٔ پایه شروع می‌شود. */
  partners: MemoryPartner[];
  assignments: { orderId: string; fromPartnerId: string | null; toPartnerId: string; actor: 'system'; rule: AssignmentRule }[];
  activate(list: PriceList): void;
  /** کدهای رهگیری زندهٔ هر سفارش با پیامکشان (برش ۶٫۳)؛ پنل می‌نشاندشان، اینجا تست. */
  parcels: Map<string, OrderDetails['parcels']>;
  /** پیامک‌های پرداخت منتظر و فرستاده (برش ۷٫۱)، و درگاه `deliverQueued` رویشان، مثل `createSmsOutbox`. */
  sms: Map<number, MemorySms>;
  smsOutbox: SmsOutbox;
  /** رویدادهای سیستم «درگاه شروع را رد کرد» (برش ۷٫۲)، مثل `payments.gateway_rejected`. */
  rejections: { orderId: string; orderNumber: number; provider: string; result: number; at: Date }[];
} {
  const rejections: { orderId: string; orderNumber: number; provider: string; result: number; at: Date }[] = [];
  const parcels = new Map<string, OrderDetails['parcels']>();
  const sms = new Map<number, MemorySms>();
  let nextSms = 1;
  const documentsById = new Map<string, CheckoutDocument>();
  const settings = new Map<string, unknown>();
  const orders: OrderRow[] = [];
  const items: MemoryItem[] = [];
  const payments: PaymentRow[] = [];
  const events: { orderId: string; fromStatus: string | null; toStatus: string; actor: string; note: unknown }[] = [];
  const jobs: { kind: string; orderId: string }[] = [];
  const partners: MemoryPartner[] = [{ ...FIRST_MEMORY_PARTNER }];
  const assignments: { orderId: string; fromPartnerId: string | null; toPartnerId: string; actor: 'system'; rule: AssignmentRule }[] = [];
  const priceLists = new Map<number, PriceList>([[options.priceList.version, options.priceList]]);
  let active = options.priceList;
  let nextNumber = 10_001;

  /** همان محافظ معوق `order_items_cover_pages` (0006). */
  function coverPages(item: NewOrder['items'][number]) {
    const sections = item.sections.reduce((sum, s) => sum + s.pageCount, 0);
    const pages = item.rules.flatMap((rule) =>
      rule.pageRanges.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i)),
    );
    const distinct = new Set(pages);
    if (
      sections !== item.pageCount ||
      pages.length !== item.pageCount ||
      distinct.size !== item.pageCount ||
      pages.some((p) => p < 1 || p > item.pageCount)
    ) {
      throw new Error('order_items_cover_pages');
    }
  }

  function detailsOf(order: OrderRow) {
    return {
      order: { ...order },
      items: items
        .filter((item) => item.orderId === order.id)
        .sort((a, b) => a.seq - b.seq)
        .map((item) => ({
          id: item.id,
          orderId: item.orderId,
          seq: item.seq,
          pageCount: item.pageCount,
          copies: item.copies,
          sidesMode: item.sidesMode,
          bindingTypeId: item.bindingTypeId,
          printPdfKey: null,
          printPdfBytes: null,
          printPdfSha256: null,
          printPdfReadyAt: null,
          rules: item.rules,
          sections: item.sections.map((s) => {
            const doc = documentsById.get(s.documentId)!;
            return {
              ...s,
              originalName: doc.originalName,
              fileExpiresAt: doc.fileExpiresAt,
              fileDeletedAt: doc.fileDeletedAt,
            };
          }),
        })),
      payments: payments
        .filter((p) => p.orderId === order.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((p) => ({ ...p })),
      parcels: [...(parcels.get(order.id) ?? [])],
    };
  }

  return {
    documentsById,
    settings,
    orders,
    items,
    payments,
    events,
    jobs,
    priceLists,
    partners,
    assignments,
    parcels,
    sms,
    rejections,
    // همان `createSmsOutbox`: «در حال فرستادن» فقط یک بار، و فقط برای پیامک پرداختی که سفارشش لغو نشده.
    smsOutbox: {
      async claim(id, _at, mode) {
        const row = sms.get(id);
        const payment = payments.find((p) => p.smsMessageId === id && p.status === 'succeeded');
        const order = payment ? orders.find((o) => o.id === payment.orderId) : undefined;
        if (!row || !order || order.status === 'cancelled') return null;
        if (mode === 'queued' ? row.status !== 'pending' : row.status !== 'failed') return null;
        Object.assign(row, { status: 'sending', attempts: row.attempts + 1, error: null });
        return { id, to: row.to, purpose: row.purpose, body: row.body, params: row.params };
      },
      async finish(id, _at, result) {
        const row = sms.get(id);
        if (!row || row.status !== 'sending') return;
        Object.assign(
          row,
          result.ok
            ? { status: result.status, provider: result.provider, cost: result.cost, error: null }
            : { status: 'failed', provider: result.provider, error: result.tag },
        );
      },
    } satisfies SmsOutbox,
    activate(list) {
      priceLists.set(list.version, list);
      active = list;
    },
    async documents(ids) {
      return ids.map((id) => documentsById.get(id)).filter((doc): doc is CheckoutDocument => doc !== undefined);
    },
    async activePriceList() {
      return active;
    },
    async priceList(version) {
      const list = priceLists.get(version);
      if (!list) throw new Error(`تعرفهٔ نسخهٔ ${version} پیدا نشد.`);
      return list;
    },
    async setting(key) {
      return settings.get(key);
    },
    async findByCheckoutKey(checkoutKey) {
      const order = orders.find((o) => o.checkoutKey === checkoutKey);
      return order ? { ...order } : null;
    },
    async createOrder(input) {
      const existing = orders.find((o) => o.checkoutKey === input.checkoutKey);
      if (existing) return { order: { ...existing }, created: false };
      input.items.forEach(coverPages);
      const b = input.breakdown;
      const at = options.now();
      const order: OrderRow = {
        id: randomUUID(),
        orderNumber: nextNumber++,
        publicToken: randomUUID(),
        checkoutKey: input.checkoutKey,
        userId: input.userId,
        status: 'awaiting_payment',
        priceListVersion: b.priceListVersion,
        priceBreakdown: b,
        quoteSnapshot: input.quoteSnapshot ?? null,
        subtotalRials: b.subtotalRials,
        discountRials: b.discountRials,
        shippingRials: b.shippingRials!,
        vatRials: b.vatRials,
        roundingRials: b.roundingRials,
        totalRials: b.totalRials,
        estWeightGrams: b.estWeightGrams,
        slaDays: input.slaDays,
        paidAt: null,
        postHandoffDueAt: null,
        handedToPostAt: null,
        filesDeletedAt: null,
        printPartnerId: null,
        shippingMethodId: input.shippingMethodId,
        shippingZoneId: input.shippingZoneId,
        provinceId: input.provinceId,
        cityId: input.cityId,
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        addressText: input.addressText,
        postalCode: input.postalCode,
        createdAt: at,
        updatedAt: at,
      };
      orders.push(order);
      input.items.forEach((item, i) => {
        const id = randomUUID();
        items.push({
          id,
          orderId: order.id,
          seq: i + 1,
          pageCount: item.pageCount,
          copies: item.copies,
          sidesMode: item.sidesMode,
          bindingTypeId: item.bindingTypeId,
          sections: item.sections.map((s, j) => ({ seq: j + 1, ...s })),
          rules: item.rules.map((r, j) => ({ id: randomUUID(), orderItemId: id, seq: j + 1, ...r })),
        });
      });
      events.push({ orderId: order.id, fromStatus: null, toStatus: 'awaiting_payment', actor: 'user', note: null });
      return { order: { ...order }, created: true };
    },
    async details(publicToken) {
      const order = orders.find((o) => o.publicToken === publicToken);
      return order ? detailsOf(order) : null;
    },
    async insertPayment(payment) {
      if (payments.some((p) => p.provider === payment.provider && p.authority === payment.authority)) {
        throw new Error('payments_provider_authority');
      }
      const order = orders.find((o) => o.id === payment.orderId);
      // همان `payments_amount_is_total` (0030).
      if (!order || order.totalRials !== payment.amountRials) throw new Error('payments_amount_is_total');
      const row: PaymentRow = {
        id: payment.id ?? randomUUID(),
        orderId: payment.orderId,
        provider: payment.provider,
        amountRials: payment.amountRials,
        status: 'pending',
        authority: payment.authority,
        refId: null,
        cardMask: null,
        failureCode: null,
        raw: payment.raw ?? null,
        createdAt: options.now(),
        verifiedAt: null,
        smsMessageId: null,
        returnKey: payment.returnKey ?? randomUUID().replace(/-/g, ''),
        gatewayOrderId: payment.gatewayOrderId ?? null,
        verifiedAmountRials: null,
        gatewayStatus: null,
        gatewayError: null,
        gatewayCheckedAt: null,
        returnedAt: null,
        settledVia: null,
      };
      payments.push(row);
      return { ...row };
    },
    async gatewayPayment(provider, authority) {
      const payment = payments.find((p) => p.provider === provider && p.authority === authority);
      if (!payment) return null;
      const order = orders.find((o) => o.id === payment.orderId)!;
      return { payment: { ...payment }, order: { ...order } };
    },
    async recordMockDecision(authority, decision, at) {
      const payment = payments.find((p) => p.provider === 'mock' && p.authority === authority);
      if (!payment || payment.status !== 'pending') return false;
      if (typeof (payment.raw as { decision?: unknown } | null)?.decision === 'string') return false;
      payment.raw = { decision, decidedAt: at.toISOString() };
      return true;
    },
    settlePayment(provider, authority, decide) {
      return this.settle({ provider, authority }, decide) as Promise<Awaited<ReturnType<OrderStore['settlePayment']>>>;
    },
    async settle(lookup, decide, settleOptions = {}) {
      const payment = payments.find((p) =>
        'returnKey' in lookup
          ? p.returnKey === lookup.returnKey && lookup.providers.includes(p.provider)
          : 'paymentId' in lookup
            ? p.id === lookup.paymentId && lookup.providers.includes(p.provider)
            : p.provider === lookup.provider && p.authority === lookup.authority,
      );
      if (!payment) return null;
      const order = orders.find((o) => o.id === payment.orderId)!;
      if (payment.status !== 'pending') return { payment: { ...payment }, order: { ...order }, settled: false, smsId: null };
      const outcome = await decide({ payment: { ...payment }, order: { ...order } });
      if (settleOptions.returned && !payment.returnedAt) payment.returnedAt = settleOptions.returned;
      const check = 'check' in outcome && outcome.check ? outcome.check : null;
      if (check) Object.assign(payment, { gatewayStatus: check.status, gatewayError: check.error, gatewayCheckedAt: check.at });
      if (outcome.kind === 'pending') return { payment: { ...payment }, order: { ...order }, settled: false, smsId: null };
      if (outcome.kind === 'failed') {
        Object.assign(payment, {
          status: 'failed',
          failureCode: outcome.code,
          raw: outcome.raw ?? null,
          cardMask: outcome.cardMask ?? null,
          verifiedAmountRials: outcome.verifiedAmountRials ?? null,
          settledVia: settleOptions.via ?? null,
        });
        return { payment: { ...payment }, order: { ...order }, settled: true, smsId: null };
      }
      // همان `payments_success_amount` (0029).
      if (outcome.verifiedAmountRials !== payment.amountRials) throw new Error('payments_success_amount');
      if (payments.some((p) => p.orderId === order.id && p.status === 'succeeded')) throw new Error('payments_one_success');
      if (order.status !== 'awaiting_payment') throw new Error(`سفارش ${order.orderNumber} در انتظار پرداخت نیست.`);
      // پیامک پرداخت منتظر، مثل `queuedPaidSms`، و پرداخت به آن وصل (`payments_sms`).
      const day = formatDeadlineDay(outcome.postHandoffDueAt);
      const smsId = nextSms++;
      sms.set(smsId, {
        id: smsId,
        purpose: 'order_paid',
        to: order.recipientPhone,
        body: orderPaidText(order.orderNumber, day),
        params: paidParams(order.orderNumber, day),
        status: 'pending',
        provider: 'queued',
        attempts: 0,
        error: null,
        cost: null,
      });
      Object.assign(payment, {
        status: 'succeeded',
        refId: outcome.refId,
        cardMask: outcome.cardMask,
        raw: outcome.raw ?? null,
        verifiedAt: outcome.paidAt,
        verifiedAmountRials: outcome.verifiedAmountRials,
        settledVia: settleOptions.via ?? null,
        smsMessageId: smsId,
      });
      Object.assign(order, { status: 'paid', paidAt: outcome.paidAt, postHandoffDueAt: outcome.postHandoffDueAt });
      events.push({
        orderId: order.id,
        fromStatus: 'awaiting_payment',
        toStatus: 'paid',
        actor: 'gateway',
        note: { paymentId: payment.id, provider: payment.provider, refId: outcome.refId, ...(settleOptions.via ? { via: settleOptions.via } : {}) },
      });
      // چاپخانه، مثل `assignAtPayment`: فقط فعال‌ها؛ هیچ؟ بی چاپخانه.
      const chosen = choosePartner(
        partners.filter((p) => p.active),
        order,
      );
      if (chosen) {
        order.printPartnerId = chosen.partnerId;
        assignments.push({ orderId: order.id, fromPartnerId: null, toPartnerId: chosen.partnerId, actor: 'system', rule: chosen.rule });
      }
      // PDF جزوه و فایل چاپ، و برگهٔ سفارش (برش ۵٫۱)؛ هر کدام یک بار، مثل `jobs_order_kind`.
      for (const kind of ['prepare_order', 'prepare_ticket']) {
        if (!jobs.some((j) => j.orderId === order.id && j.kind === kind)) jobs.push({ kind, orderId: order.id });
      }
      return { payment: { ...payment }, order: { ...order }, settled: true, smsId };
    },
    async pendingAttempts({ providers, createdBefore, checkedBefore, limit }) {
      return payments
        .filter(
          (p) =>
            p.status === 'pending' &&
            providers.includes(p.provider) &&
            p.createdAt < createdBefore &&
            (p.gatewayCheckedAt === null || p.gatewayCheckedAt < checkedBefore),
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, limit)
        .map((p) => p.id);
    },
    async heldAttempts({ providers, createdAfter, checkedBefore, limit }) {
      return payments
        .filter(
          (p) =>
            p.status === 'failed' &&
            providers.includes(p.provider) &&
            ['expired', 'order_not_payable', 'amount_mismatch'].includes(p.failureCode ?? '') &&
            (p.gatewayStatus === null || p.gatewayStatus === 2 || p.gatewayStatus === 16) &&
            p.createdAt > createdAfter &&
            (p.gatewayCheckedAt === null || p.gatewayCheckedAt < checkedBefore),
        )
        .slice(0, limit)
        .map((p) => ({ ...p }));
    },
    async recordGatewayCheck(paymentId, check) {
      const payment = payments.find((p) => p.id === paymentId);
      if (payment) Object.assign(payment, { gatewayStatus: check.status, gatewayError: check.error, gatewayCheckedAt: check.at });
    },
    async recordGatewayRejection(input) {
      rejections.push({ ...input });
    },
    async expireOrder(orderId, _at) {
      const order = orders.find((o) => o.id === orderId);
      if (!order || order.status !== 'awaiting_payment') return false;
      order.status = 'expired';
      events.push({ orderId, fromStatus: 'awaiting_payment', toStatus: 'expired', actor: 'system', note: { reason: 'files_expiring' } });
      return true;
    },
  };
}
