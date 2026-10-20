/**
 * پشتیبانی در پنل (برش ۱۲٫۱، ADR-068؛ طرح «پشتیبانی (برش ۱۲)» در `admin.html`، سؤال‌های ۳۱۱ تا ۳۱۶): صندوق گفت‌وگوها، پاسخ، «بستن
 * گفت‌وگو» و «دوباره بفرست» پیامک پاسخ. پیام مشتری کار سایت است؛ اینجا فقط کار پشتیبانی.
 *
 * - **مجوز در سرور** (ADR-038): همه با `support.reply` (مالک و متصدی)، پیش از هر خواندن؛ حسابدار و چاپخانه نه، و شمار زبانه و خبر پیشخوان
 *   و کارت سفارش بی آن null.
 * - **بی کد تازه** (سؤال ۳۱۱): پاسخ و بستن پولی جابه‌جا نمی‌کنند؛ هر فرم یک پیام است (`request`)، و بستن فقط از آخرین پیامی که ادمین دید
 *   (`seen`)، تا گفت‌وگویی که همان لحظه پیام تازه گرفت بسته نشود.
 * - **پیامک پاسخ** (سؤال ۳۱۲): ردیف «منتظر» در همان تراکنش پاسخ (ذخیره‌گاه)، و فرستادن بلافاصله بعد از commit در همین درخواست؛ شکستش پاسخ را
 *   برنمی‌گرداند. «دوباره بفرست» فقط پیامکی که نرفت یا معلوم نیست رفت، و فقط تا مشتری همان پاسخ را ندیده.
 * - **رویداد** `support.reply`، `support.close` و `support.sms_resend` بی متن پیام (سؤال ۳۱۶).
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import {
  SUPPORT_STAFF_MAX,
  SUPPORT_TARGET,
  TRACKING_ALERT_DAYS,
  unseenReply,
  type InboxPage,
  type OrderThreadCard,
  type PanelThreadView,
  type ReplySmsFailure,
  type SupportBucket,
  type SupportSearch,
  type SupportStore,
} from '@jozveyar/db';
import { SMS_STUCK_MS, deliverQueued, resendable, smsState, type SmsErrorCode, type SmsOutbox, type SmsTransport } from '@jozveyar/sms';
import { tidyInputLinesFa } from '@jozveyar/text/input';

import { pageOf, parseSearch } from '../orders';
import { maskMobile } from '../settings';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelSupportDeps {
  store: SupportStore;
  /** پیامک پاسخ با آداپتور پنل (کنسولی یا sms.ir)؛ null یعنی پیامک نمی‌رود و «دوباره بفرست» ۵۰۳. */
  sms: { transport: SmsTransport; outbox: SmsOutbox; log?: (message: string, error?: unknown) => void } | null;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** گفت‌وگو در هر صفحهٔ صندوق. */
export const SUPPORT_PAGE_SIZE = 30;

export const SUPPORT_BUCKETS = ['open', 'answered', 'closed', 'all'] as const satisfies readonly SupportBucket[];

export const bucketOf = (value: unknown): SupportBucket => (SUPPORT_BUCKETS.includes(value as SupportBucket) ? (value as SupportBucket) : 'open');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (value: unknown): number | null => (typeof value === 'string' && /^[1-9]\d{0,14}$/.test(value) ? Number(value) : null);

/** جست‌وجوی کادر صندوق: همان کادر «سفارش‌ها»؛ کد رهگیری اینجا معنا ندارد و هیچ نمی‌دهد. */
export function supportSearchOf(input: string | undefined): SupportSearch | null {
  const search = parseSearch(input);
  if (!search) return null;
  if (search.kind === 'mobile' || search.kind === 'digits' || search.kind === 'name') return search;
  return { kind: 'digits', orderNumber: null, phoneSuffix: null };
}

export interface SupportInboxView {
  now: Date;
  bucket: SupportBucket;
  query: string;
  page: number;
  pages: number;
  inbox: InboxPage;
}

/** پیامک پاسخی که همین حالا رفت، نرفت یا لازم نبود (پیامک قبلی همین گفت‌وگو هنوز دیده نشده). */
export type ReplySmsOutcome = 'sent' | 'failed' | 'skipped' | 'none';

export function createPanelSupport(deps: PanelSupportDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error ?? ''));
  const event = (session: AdminSession, ip: string) => ({ adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) });

  return {
    /** صندوق (سؤال ۳۱۳): یک چیپ (پیش‌فرض «باز»)، جست‌وجو، و صفحه؛ شمار هر چیپ با همان جست‌وجو. */
    async inbox(session: AdminSession, query: { bucket?: string; q?: string; page?: string }): Promise<Result<SupportInboxView>> {
      if (!can(session, 'support.reply')) return fail(403, 'forbidden');
      const bucket = bucketOf(query.bucket);
      const text = (query.q ?? '').slice(0, 100);
      const search = supportSearchOf(text);
      const pageAt = (page: number) => deps.store.inbox({ bucket, search, limit: SUPPORT_PAGE_SIZE, offset: (page - 1) * SUPPORT_PAGE_SIZE });
      let page = pageOf(query.page);
      let inbox = await pageAt(page);
      const pages = Math.max(1, Math.ceil(inbox.counts[bucket] / SUPPORT_PAGE_SIZE));
      // صفحه‌ای پس از آخرین (نشانی کهنه، یا گفت‌وگوهایی که همین حالا پاسخ گرفتند): همان آخرین صفحه.
      if (page > pages) {
        page = pages;
        inbox = await pageAt(page);
      }
      return ok({ now: now(), bucket, query: text, page, pages, inbox });
    },

    /** شمار «باز» و قدیمی‌ترین انتظار: شمار زبانه (سؤال ۳۱۳)؛ null یعنی این نشست مجوزش را ندارد. */
    async openSummary(session: AdminSession): Promise<{ count: number; oldestWaiting: Date | null } | null> {
      if (!can(session, 'support.reply')) return null;
      return deps.store.openSummary();
    },

    /**
     * هشدارهای پیشخوان (سؤال‌های ۳۱۲ و ۳۱۵): «N پیام پشتیبانی بی پاسخ است؛ قدیمی‌ترین از …»، و گفت‌وگوهایی که پیامک آخرین پاسخشان نرفت و مشتری
     * هنوز آن پاسخ را ندیده (همان پنجرهٔ هشدارهای پیامک دیگر)؛ null یعنی این نشست مجوزش را ندارد.
     */
    async alerts(session: AdminSession): Promise<{ open: { count: number; oldestWaiting: Date | null }; smsFailed: ReplySmsFailure[] } | null> {
      if (!can(session, 'support.reply')) return null;
      const at = now();
      const [open, smsFailed] = await Promise.all([
        deps.store.openSummary(),
        deps.store.replySmsFailed({
          since: new Date(at.getTime() - TRACKING_ALERT_DAYS * 86_400_000),
          stuckBefore: new Date(at.getTime() - SMS_STUCK_MS),
        }),
      ]);
      return { open, smsFailed };
    },

    async thread(session: AdminSession, idParam: string): Promise<Result<{ now: Date; thread: PanelThreadView }>> {
      if (!can(session, 'support.reply')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      const thread = id === null ? null : await deps.store.panelThread(id);
      if (!thread) return fail(404, 'support_not_found');
      return ok({ now: now(), thread });
    },

    /** کارت «پیام‌های مشتری» صفحهٔ سفارش (سؤال ۳۱۵): فقط با `support.reply`، و فقط وقتی گفت‌وگویی هست. */
    async orderCard(session: AdminSession, orderId: string): Promise<OrderThreadCard | null> {
      if (!can(session, 'support.reply')) return null;
      return deps.store.orderThread(orderId);
    },

    /** پاسخ پشتیبانی؛ پیامک پاسخ پس از commit در همین درخواست می‌رود. */
    async reply(
      session: AdminSession,
      form: { thread: unknown; body: unknown; request: unknown },
      ip: string,
    ): Promise<Result<{ threadId: number; duplicate: boolean; sms: ReplySmsOutcome; error: SmsErrorCode | null }>> {
      if (!can(session, 'support.reply')) return fail(403, 'forbidden');
      const threadId = idOf(form.thread);
      if (threadId === null) return fail(404, 'support_not_found');
      const body = tidyInputLinesFa(typeof form.body === 'string' ? form.body : '');
      if (body === '') return fail(400, 'support_empty', { threadId });
      if (body.length > SUPPORT_STAFF_MAX) return fail(400, 'support_too_long', { threadId });
      if (typeof form.request !== 'string' || !UUID.test(form.request)) return fail(409, 'support_stale', { threadId });
      // نام مشتری فقط برای سطر «رویدادها» (طرح)؛ متن پاسخ هرگز در رویداد نیست.
      const thread = await deps.store.panelThread(threadId);
      if (!thread) return fail(404, 'support_not_found');
      const written = await deps.store.reply({
        threadId,
        adminUserId: session.userId,
        body,
        requestId: form.request,
        at: now(),
        event: event(session, ip),
        customer: thread.customer.name,
      });
      if (!written.ok) return fail(written.reason === 'not_found' ? 404 : 409, written.reason === 'not_found' ? 'support_not_found' : 'support_stale', { threadId });
      if (written.duplicate || written.smsId === null) return ok({ threadId, duplicate: written.duplicate, sms: written.smsId === null ? 'none' : 'skipped', error: null });
      if (!deps.sms) return ok({ threadId, duplicate: false, sms: 'failed', error: null });
      try {
        const [delivery] = await deliverQueued({ outbox: deps.sms.outbox, transport: deps.sms.transport, now, log: deps.sms.log ?? log }, [written.smsId]);
        return ok({ threadId, duplicate: false, sms: delivery?.outcome ?? 'skipped', error: delivery?.error ?? null });
      } catch (error) {
        // پاسخ رفته است؛ پیامکی که نرفت در گفت‌وگو «نرفت» می‌ماند با «دوباره بفرست».
        log(`✗ پیامک پاسخ گفت‌وگوی ${threadId} فرستاده نشد:`, error);
        return ok({ threadId, duplicate: false, sms: 'failed', error: null });
      }
    },

    /** «بستن گفت‌وگو» (سؤال ۳۱۱)، فقط از آخرین پیامی که ادمین دید (`seen`). */
    async close(
      session: AdminSession,
      form: { thread: unknown; seen: unknown; request: unknown },
      ip: string,
    ): Promise<Result<{ threadId: number; duplicate: boolean }>> {
      if (!can(session, 'support.reply')) return fail(403, 'forbidden');
      const threadId = idOf(form.thread);
      if (threadId === null) return fail(404, 'support_not_found');
      if (typeof form.request !== 'string' || !UUID.test(form.request)) return fail(409, 'support_stale', { threadId });
      const seen = form.seen === '' ? null : idOf(form.seen);
      const thread = await deps.store.panelThread(threadId);
      if (!thread) return fail(404, 'support_not_found');
      const result = await deps.store.close({
        threadId,
        adminUserId: session.userId,
        requestId: form.request,
        seenMessageId: seen,
        at: now(),
        event: event(session, ip),
        customer: thread.customer.name,
      });
      if (result.ok) return ok({ threadId, duplicate: result.duplicate });
      if (result.reason === 'not_found') return fail(404, 'support_not_found');
      return fail(409, result.reason === 'closed' ? 'support_closed' : 'support_close_stale', { threadId });
    },

    /**
     * «دوباره بفرست» پیامک پاسخ (سؤال ۳۱۲): فقط پیامکی که نرفت یا معلوم نیست رفت، و فقط تا مشتری همان پاسخ را ندیده؛ همان ردیف به همان
     * شماره، یک تلاش بیشتر، و رویداد `support.sms_resend` با نتیجه و شمارهٔ پوشیده.
     */
    async resendSms(
      session: AdminSession,
      form: { message: unknown },
      ip: string,
    ): Promise<Result<{ threadId: number; outcome: 'sent' | 'failed'; error: SmsErrorCode | null }>> {
      if (!can(session, 'support.reply')) return fail(403, 'forbidden');
      const messageId = idOf(form.message);
      const found = messageId === null ? null : await deps.store.replySms(messageId);
      if (!found) return fail(404, 'support_not_found');
      const threadId = found.threadId;
      if (!deps.sms) return fail(503, 'unavailable', { threadId });
      if (!unseenReply(found.messageAt, found.customerSeenAt)) return fail(409, 'support_sms_seen', { threadId });
      if (found.newer) return fail(409, 'support_sms_newer', { threadId });
      if (!resendable(smsState(found.sms, now()))) return fail(409, 'sms_not_failed', { threadId });
      const [delivery] = await deliverQueued(
        { outbox: deps.sms.outbox, transport: deps.sms.transport, now, log: deps.sms.log ?? log },
        [found.sms.id],
        { mode: 'retry' },
      );
      // برداشته نشد: کس دیگری همین حالا فرستاد، یا مشتری همین حالا پاسخ را دید (`sms_messages_live`).
      if (!delivery || delivery.outcome === 'skipped') return fail(409, 'sms_not_failed', { threadId });
      await deps.store.logEvent({
        ...event(session, ip),
        action: 'support.sms_resend',
        targetType: SUPPORT_TARGET,
        targetId: String(threadId),
        at: now(),
        detail: {
          thread: threadId,
          orderNumber: found.orderNumber,
          message: found.messageId,
          mobile: maskMobile(found.sms.toMobile),
          outcome: delivery.outcome,
          ...(delivery.tag ? { error: delivery.tag } : {}),
        },
      });
      return ok({ threadId, outcome: delivery.outcome, error: delivery.error ?? null });
    },
  };
}

export type PanelSupport = ReturnType<typeof createPanelSupport>;
