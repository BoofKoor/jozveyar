/**
 * پیاده‌سازی‌های حافظه‌ای درگاه‌های پایگاه داده — فقط برای تست: `DocumentStore` (آپلود)، و از برش ۳ب
 * `AuthStore`، `OrderStore` و `SmsLog` (مسیر خرید).
 *
 * همان قراردادی که نسخه‌های پستگرس دارند؛ درستی آنها در تست یکپارچگی `packages/db` سنجیده می‌شود.
 */

import { randomUUID } from 'node:crypto';

import type {
  AuthStore,
  CheckoutDocument,
  DocumentJob,
  DocumentRow,
  DocumentStore,
  NewOrder,
  NewUploadDocument,
  OrderRow,
  OrderStore,
  OtpRow,
  PaymentRow,
  PrintRuleRow,
  SmsLog,
  SmsRecord,
  StoredAnalysis,
} from '@jozveyar/db';
import type { DocumentAnalysis, PriceList } from '@jozveyar/contracts';

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
 * `AuthStore` حافظه‌ای. شمارش همان پنجره و همان شرط‌های اتمی نسخهٔ پستگرس را دارد؛ قفل لازم ندارد، چون
 * اینجا هیچ دو کاری وسط هم اجرا نمی‌شوند (هم‌زمانی را تست یکپارچگی `packages/db` می‌سنجد).
 */
export function memoryAuthStore(): AuthStore & {
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
      const inWindow = otps.filter((o) => o.createdAt.getTime() > input.since.getTime());
      const byMobile = inWindow.filter((o) => o.mobile === input.mobile);
      const byIp = inWindow.filter((o) => o.ipHash === input.ipHash);
      const otp = decide({
        mobile: byMobile.length,
        mobileOldest: oldest(byMobile),
        mobileLatest: latest(byMobile),
        ip: byIp.length,
        ipOldest: oldest(byIp),
        site: inWindow.length,
        siteOldest: oldest(inWindow),
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

/**
 * `OrderStore` حافظه‌ای، با همان محافظ‌هایی که پایگاه داده دارد و سرویس به آنها تکیه می‌کند: پوشش دقیق
 * صفحه‌ها، یکتایی `checkout_key`، یک پرداخت موفق برای هر سفارش، و «پرداخت برگشت ندارد».
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
  activate(list: PriceList): void;
} {
  const documentsById = new Map<string, CheckoutDocument>();
  const settings = new Map<string, unknown>();
  const orders: OrderRow[] = [];
  const items: MemoryItem[] = [];
  const payments: PaymentRow[] = [];
  const events: { orderId: string; fromStatus: string | null; toStatus: string; actor: string; note: unknown }[] = [];
  const jobs: { kind: string; orderId: string }[] = [];
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
      const row: PaymentRow = {
        id: randomUUID(),
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
    async settlePayment(provider, authority, decide) {
      const payment = payments.find((p) => p.provider === provider && p.authority === authority);
      if (!payment) return null;
      const order = orders.find((o) => o.id === payment.orderId)!;
      if (payment.status !== 'pending') return { payment: { ...payment }, order: { ...order }, settled: false };
      const outcome = await decide({ payment: { ...payment }, order: { ...order } });
      if (outcome.kind === 'failed') {
        Object.assign(payment, { status: 'failed', failureCode: outcome.code, raw: outcome.raw ?? null });
        return { payment: { ...payment }, order: { ...order }, settled: true };
      }
      if (payments.some((p) => p.orderId === order.id && p.status === 'succeeded')) throw new Error('payments_one_success');
      if (order.status !== 'awaiting_payment') throw new Error(`سفارش ${order.orderNumber} در انتظار پرداخت نیست.`);
      Object.assign(payment, {
        status: 'succeeded',
        refId: outcome.refId,
        cardMask: outcome.cardMask,
        raw: outcome.raw ?? null,
        verifiedAt: outcome.paidAt,
      });
      Object.assign(order, { status: 'paid', paidAt: outcome.paidAt, postHandoffDueAt: outcome.postHandoffDueAt });
      events.push({
        orderId: order.id,
        fromStatus: 'awaiting_payment',
        toStatus: 'paid',
        actor: 'gateway',
        note: { paymentId: payment.id, provider, refId: outcome.refId },
      });
      if (!jobs.some((j) => j.orderId === order.id && j.kind === 'prepare_order')) {
        jobs.push({ kind: 'prepare_order', orderId: order.id });
      }
      return { payment: { ...payment }, order: { ...order }, settled: true };
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
