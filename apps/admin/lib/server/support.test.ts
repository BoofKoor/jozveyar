/**
 * سرویس پشتیبانی پنل (`support.ts`، برش ۱۲٫۱) با ذخیره‌گاه حافظه‌ای: مجوز در سرور پیش از هر خواندن، صندوق با چیپ و جست‌وجو و صفحه، پاسخ با
 * متن فارسی‌نرمال و پیامک پس از commit (شکستش پاسخ را برنمی‌گرداند)، بستن از همان که دیده شد، «دوباره بفرست» فقط پیامک آخرین پاسخ و تا مشتری
 * ندیده، و رویداد بی متن. محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import {
  SUPPORT_STAFF_MAX,
  SUPPORT_TARGET,
  type AdminEventInput,
  type InboxPage,
  type PanelThreadView,
  type ReplySmsRef,
  type SupportBucket,
  type SupportSearch,
  type SupportStore,
} from '@jozveyar/db';
import { SmsError, type SmsOutbox, type SmsTransport } from '@jozveyar/sms';

import { ipHashOf, type AdminSession } from './auth';
import { SUPPORT_PAGE_SIZE, bucketOf, createPanelSupport, supportSearchOf } from './support';

const NOW = new Date('2026-10-05T07:10:00Z');
const SECRET = 's'.repeat(64);
const IP = '203.0.113.7';
const REQUEST = '3f2b8c1e-9a7d-4c2e-8b1a-0d5e6f7a8b9c';
const MOBILE = '09152345678';

function session(roles: string[], permissions: string[]): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-ali',
    username: 'ali',
    displayName: 'علی',
    roles,
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
  };
}
const OPERATOR = session(['operator'], ['orders.read', 'support.reply']);
const OWNER = session(['owner'], ['orders.read', 'support.reply', 'events.read']);
const ACCOUNTANT = session(['accountant'], ['orders.read', 'orders.money']);

const threadView = (over: Partial<PanelThreadView> = {}): PanelThreadView => ({
  id: 7,
  status: 'open',
  createdAt: new Date(NOW.getTime() - 86_400_000),
  waitingSince: new Date(NOW.getTime() - 86_400_000),
  customerSeenAt: new Date(NOW.getTime() - 86_400_000),
  customer: { userId: 'user-1', mobile: MOBILE, name: 'مریم کاظمی', provinceId: 11, cityId: 1326, place: 'مشهد' },
  order: null,
  history: { orders: 1, paid: 1, others: [] },
  messages: [{ id: 40, kind: 'customer', body: 'سلام.', at: new Date(NOW.getTime() - 86_400_000), adminName: null, sms: null }],
  ...over,
});

const emptyInbox = (counts: Partial<Record<SupportBucket, number>> = {}): InboxPage => ({
  lines: [],
  counts: { open: 0, answered: 0, closed: 0, all: 0, ...counts },
});

/** ذخیره‌گاه حافظه‌ای: هر فراخوانی ثبت می‌شود، و پاسخ هر کار از `over`. */
function memoryStore(over: Partial<SupportStore> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const events: AdminEventInput[] = [];
  const record =
    <T extends unknown[], R>(method: string, fn: (...args: T) => Promise<R>) =>
    (...args: T) => (calls.push({ method, args }), fn(...args));
  const never = (method: string) => async () => {
    throw new Error(`${method} نباید صدا زده شود`);
  };
  const store: SupportStore = {
    customerThreads: never('customerThreads'),
    customerThread: never('customerThread'),
    customerOrderThread: never('customerOrderThread'),
    post: never('post'),
    markSeen: never('markSeen'),
    inbox: record('inbox', over.inbox ?? (async () => emptyInbox())),
    openSummary: record('openSummary', over.openSummary ?? (async () => ({ count: 0, oldestWaiting: null }))),
    panelThread: record('panelThread', over.panelThread ?? (async () => threadView())),
    orderThread: record('orderThread', over.orderThread ?? (async () => null)),
    reply: record('reply', over.reply ?? (async () => ({ ok: true, messageId: 41, smsId: 900, duplicate: false, orderNumber: null }))),
    close: record('close', over.close ?? (async () => ({ ok: true, duplicate: false, orderNumber: null }))),
    replySms: record('replySms', over.replySms ?? (async () => null)),
    replySmsFailed: record('replySmsFailed', over.replySmsFailed ?? (async () => [])),
    logEvent: record('logEvent', async (event: AdminEventInput) => void events.push(event)),
  };
  return { store, calls, events };
}

/** درگاه ردیف پیامک حافظه‌ای: «در حال فرستادن» فقط یک بار، مثل پایگاه داده. */
function outboxOf(status = 'pending') {
  const row = { status, claims: [] as string[] };
  const outbox: SmsOutbox = {
    async claim(id, _at, mode) {
      row.claims.push(mode);
      if (mode === 'queued' ? row.status !== 'pending' : row.status !== 'failed') return null;
      row.status = 'sending';
      return { id, to: MOBILE, purpose: 'support_reply', body: 'جزوه‌یار: پاسخ پیامت دربارهٔ سؤال کلی آمد. jozveyar.com/orders', params: ['سؤال کلی'] };
    },
    async finish(_id, _at, result) {
      row.status = result.ok ? result.status : 'failed';
    },
  };
  return { outbox, row };
}

const sentTransport: SmsTransport = { name: 'smsir', send: async () => ({ status: 'sent', providerMessageId: '1' }) };

function build(over: Partial<SupportStore> = {}, sms: { status?: string; transport?: SmsTransport } | null = {}) {
  const memory = memoryStore(over);
  const box = sms ? outboxOf(sms.status) : null;
  const support = createPanelSupport({
    store: memory.store,
    sms: box ? { transport: sms?.transport ?? sentTransport, outbox: box.outbox, log: () => {} } : null,
    secret: SECRET,
    now: () => NOW,
    log: () => {},
  });
  return { support, ...memory, row: box?.row ?? null };
}

const replySms = (over: Partial<ReplySmsRef> = {}, sms: Partial<ReplySmsRef['sms']> = {}): ReplySmsRef => ({
  threadId: 7,
  messageId: 41,
  messageAt: new Date(NOW.getTime() - 3_600_000),
  orderNumber: 10027,
  customerSeenAt: new Date(NOW.getTime() - 86_400_000),
  newer: false,
  sms: {
    id: 900,
    toMobile: MOBILE,
    status: 'failed',
    error: 'unconfigured',
    attempts: 1,
    createdAt: new Date(NOW.getTime() - 3_600_000),
    attemptedAt: new Date(NOW.getTime() - 3_600_000),
    sentAt: null,
    ...sms,
  },
  ...over,
});

describe('پشتیبانی پنل: مجوز پیش از هر خواندن (سؤال ۳۱۳)', () => {
  it('حسابدار و چاپخانه هیچ‌کدام: ۴۰۳، و شمار و هشدار و کارت سفارش null، بی هیچ کوئری', async () => {
    const { support, calls } = build();
    expect(await support.inbox(ACCOUNTANT, {})).toEqual({ ok: false, status: 403, error: 'forbidden' });
    expect(await support.thread(ACCOUNTANT, '7')).toEqual({ ok: false, status: 403, error: 'forbidden' });
    expect(await support.reply(ACCOUNTANT, { thread: '7', body: 'سلام', request: REQUEST }, IP)).toMatchObject({ ok: false, status: 403 });
    expect(await support.close(ACCOUNTANT, { thread: '7', seen: '40', request: REQUEST }, IP)).toMatchObject({ ok: false, status: 403 });
    expect(await support.resendSms(ACCOUNTANT, { message: '41' }, IP)).toMatchObject({ ok: false, status: 403 });
    expect(await support.openSummary(ACCOUNTANT)).toBeNull();
    expect(await support.alerts(ACCOUNTANT)).toBeNull();
    expect(await support.orderCard(ACCOUNTANT, 'order-1')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('مالک و متصدی هر دو', async () => {
    const { support } = build({ openSummary: async () => ({ count: 3, oldestWaiting: NOW }) });
    expect(await support.openSummary(OWNER)).toEqual({ count: 3, oldestWaiting: NOW });
    expect(await support.openSummary(OPERATOR)).toEqual({ count: 3, oldestWaiting: NOW });
  });
});

describe('صندوق', () => {
  it('چیپ ناشناس «باز»، جست‌وجو با همان کادر «سفارش‌ها»، و کد رهگیری هیچ', () => {
    expect(bucketOf('answered')).toBe('answered');
    expect(bucketOf('nope')).toBe('open');
    expect(bucketOf(undefined)).toBe('open');
    expect(supportSearchOf('۰۹۱۵ ۲۳۴ ۵۶۷۸')).toEqual({ kind: 'mobile', mobile: MOBILE });
    expect(supportSearchOf('10027')).toEqual({ kind: 'digits', orderNumber: 10027, phoneSuffix: '10027' });
    expect(supportSearchOf('مريم')).toEqual({ kind: 'name', text: 'مریم' });
    // ۲۴ رقم کد رهگیری در گفت‌وگو معنا ندارد: جست‌وجویی که هیچ نمی‌دهد، نه همه.
    expect(supportSearchOf('1'.repeat(24))).toEqual({ kind: 'digits', orderNumber: null, phoneSuffix: null });
    expect(supportSearchOf('   ')).toBeNull();
  });

  it('صفحه با همان جست‌وجو، و صفحهٔ پس از آخرین همان آخرین', async () => {
    const inboxes: { bucket: SupportBucket; search: SupportSearch | null; limit: number; offset: number }[] = [];
    const { support } = build({ inbox: async (input) => (inboxes.push(input), emptyInbox({ answered: SUPPORT_PAGE_SIZE + 1 })) });
    const result = await support.inbox(OPERATOR, { bucket: 'answered', q: 'مریم', page: '9' });
    expect(result).toMatchObject({ ok: true, value: { bucket: 'answered', query: 'مریم', page: 2, pages: 2, now: NOW } });
    expect(inboxes).toEqual([
      { bucket: 'answered', search: { kind: 'name', text: 'مریم' }, limit: SUPPORT_PAGE_SIZE, offset: 8 * SUPPORT_PAGE_SIZE },
      { bucket: 'answered', search: { kind: 'name', text: 'مریم' }, limit: SUPPORT_PAGE_SIZE, offset: SUPPORT_PAGE_SIZE },
    ]);
    const empty = await build().support.inbox(OPERATOR, { page: 'x' });
    expect(empty).toMatchObject({ ok: true, value: { bucket: 'open', page: 1, pages: 1 } });
  });

  it('گفت‌وگو: شناسهٔ نادرست بی کوئری ۴۰۴، و گفت‌وگویی که نیست ۴۰۴', async () => {
    const { support, calls } = build({ panelThread: async () => null });
    expect(await support.thread(OPERATOR, 'abc')).toEqual({ ok: false, status: 404, error: 'support_not_found' });
    expect(await support.thread(OPERATOR, '0')).toEqual({ ok: false, status: 404, error: 'support_not_found' });
    expect(calls).toEqual([]);
    expect(await support.thread(OPERATOR, '7')).toEqual({ ok: false, status: 404, error: 'support_not_found' });
    expect(await build().support.thread(OPERATOR, '7')).toMatchObject({ ok: true, value: { now: NOW, thread: { id: 7 } } });
  });

  it('هشدارها: «باز» و پیامک پاسخی که نرفت، در پنجرهٔ هشدارهای پیامک و با «ماندن» پنج دقیقه', async () => {
    const asked: { since: Date; stuckBefore: Date }[] = [];
    const failed = [{ threadId: 7, orderNumber: null, customer: 'مریم کاظمی' }];
    const { support } = build({
      openSummary: async () => ({ count: 2, oldestWaiting: NOW }),
      replySmsFailed: async (input) => (asked.push(input), failed),
    });
    expect(await support.alerts(OPERATOR)).toEqual({ open: { count: 2, oldestWaiting: NOW }, smsFailed: failed });
    expect(asked).toEqual([{ since: new Date(NOW.getTime() - 45 * 86_400_000), stuckBefore: new Date(NOW.getTime() - 5 * 60_000) }]);
  });
});

describe('پاسخ (سؤال‌های ۳۱۰ تا ۳۱۲)', () => {
  it('متن فارسی‌نرمال، خالی و بلند پیش از ذخیره‌گاه، و فرم بی شناسه «کهنه»', async () => {
    const { support, calls } = build();
    expect(await support.reply(OPERATOR, { thread: '7', body: ' \n ', request: REQUEST }, IP)).toEqual({
      ok: false,
      status: 400,
      error: 'support_empty',
      threadId: 7,
    });
    expect(await support.reply(OPERATOR, { thread: '7', body: 'ن'.repeat(SUPPORT_STAFF_MAX + 1), request: REQUEST }, IP)).toMatchObject({
      ok: false,
      error: 'support_too_long',
    });
    expect(await support.reply(OPERATOR, { thread: '7', body: 'سلام', request: 'not-a-uuid' }, IP)).toMatchObject({ ok: false, error: 'support_stale' });
    expect(await support.reply(OPERATOR, { thread: 'x', body: 'سلام', request: REQUEST }, IP)).toMatchObject({ ok: false, status: 404 });
    expect(calls).toEqual([]);
  });

  it('پاسخ با نام مشتری برای رویداد و IP هش‌شده، و پیامک پس از commit', async () => {
    const { support, calls, row } = build();
    const result = await support.reply(OPERATOR, { thread: '7', body: 'سلام. جزوه‌ات امروز چاپ مي‌شود.  ', request: REQUEST }, IP);
    expect(result).toEqual({ ok: true, value: { threadId: 7, duplicate: false, sms: 'sent', error: null } });
    const reply = calls.find((call) => call.method === 'reply')!.args[0];
    expect(reply).toEqual({
      threadId: 7,
      adminUserId: 'admin-ali',
      body: 'سلام. جزوه‌ات امروز چاپ می‌شود.',
      requestId: REQUEST,
      at: NOW,
      event: { adminUserId: 'admin-ali', ipHash: ipHashOf(SECRET, IP) },
      customer: 'مریم کاظمی',
    });
    expect(row).toEqual({ status: 'sent', claims: ['queued'] });
  });

  it('پیامکی که نرفت پاسخ را برنمی‌گرداند؛ دو کلیک و پاسخ پشت‌سرهم بی پیامک تازه؛ بی آداپتور «نرفت»', async () => {
    const rejected: SmsTransport = {
      name: 'smsir',
      send: async () => {
        throw new SmsError('unconfigured');
      },
    };
    const failed = build({}, { transport: rejected });
    expect(await failed.support.reply(OPERATOR, { thread: '7', body: 'سلام', request: REQUEST }, IP)).toEqual({
      ok: true,
      value: { threadId: 7, duplicate: false, sms: 'failed', error: 'unconfigured' },
    });
    expect(failed.row!.status).toBe('failed');

    const twice = build({ reply: async () => ({ ok: true, messageId: 41, smsId: 900, duplicate: true, orderNumber: null }) });
    expect(await twice.support.reply(OPERATOR, { thread: '7', body: 'سلام', request: REQUEST }, IP)).toMatchObject({
      ok: true,
      value: { duplicate: true, sms: 'skipped' },
    });
    expect(twice.row!.claims).toEqual([]);

    const again = build({ reply: async () => ({ ok: true, messageId: 42, smsId: null, duplicate: false, orderNumber: null }) });
    expect(await again.support.reply(OPERATOR, { thread: '7', body: 'یک نکتهٔ دیگر', request: REQUEST }, IP)).toMatchObject({ value: { sms: 'none' } });
    expect(again.row!.claims).toEqual([]);

    const offline = build({}, null);
    expect(await offline.support.reply(OPERATOR, { thread: '7', body: 'سلام', request: REQUEST }, IP)).toMatchObject({ ok: true, value: { sms: 'failed' } });
  });

  it('همان فرم با متن دیگر «کهنه»، و گفت‌وگویی که نیست ۴۰۴', async () => {
    const stale = build({ reply: async () => ({ ok: false, reason: 'stale' }) });
    expect(await stale.support.reply(OPERATOR, { thread: '7', body: 'سلام', request: REQUEST }, IP)).toEqual({
      ok: false,
      status: 409,
      error: 'support_stale',
      threadId: 7,
    });
    const missing = build({ panelThread: async () => null });
    expect(await missing.support.reply(OPERATOR, { thread: '7', body: 'سلام', request: REQUEST }, IP)).toMatchObject({
      ok: false,
      status: 404,
      error: 'support_not_found',
    });
    expect(missing.calls.map((call) => call.method)).toEqual(['panelThread']);
  });
});

describe('بستن (سؤال ۳۱۱)', () => {
  it('از آخرین پیامی که دیده شد؛ هر شکست با دلیل خودش', async () => {
    const { support, calls } = build();
    expect(await support.close(OPERATOR, { thread: '7', seen: '40', request: REQUEST }, IP)).toEqual({ ok: true, value: { threadId: 7, duplicate: false } });
    expect(calls.find((call) => call.method === 'close')!.args[0]).toMatchObject({
      threadId: 7,
      seenMessageId: 40,
      requestId: REQUEST,
      at: NOW,
      customer: 'مریم کاظمی',
      event: { adminUserId: 'admin-ali', ipHash: ipHashOf(SECRET, IP) },
    });
    const empty = build();
    await empty.support.close(OPERATOR, { thread: '7', seen: '', request: REQUEST }, IP);
    expect(empty.calls.find((call) => call.method === 'close')!.args[0]).toMatchObject({ seenMessageId: null });
    for (const [reason, status, error] of [
      ['stale', 409, 'support_close_stale'],
      ['closed', 409, 'support_closed'],
      ['not_found', 404, 'support_not_found'],
    ] as const) {
      const failed = build({ close: async () => ({ ok: false, reason }) });
      expect(await failed.support.close(OPERATOR, { thread: '7', seen: '40', request: REQUEST }, IP)).toMatchObject({ ok: false, status, error });
    }
    expect(await build().support.close(OPERATOR, { thread: '7', seen: '40', request: 'x' }, IP)).toMatchObject({ ok: false, error: 'support_stale' });
  });
});

describe('«دوباره بفرست» پیامک پاسخ (سؤال ۳۱۲)', () => {
  it('پیامکی که نرفت: همان ردیف یک تلاش بیشتر، و رویداد با شمارهٔ پوشیده و نتیجه، بی متن', async () => {
    const { support, events, row } = build({ replySms: async () => replySms() }, { status: 'failed' });
    expect(await support.resendSms(OPERATOR, { message: '41' }, IP)).toEqual({ ok: true, value: { threadId: 7, outcome: 'sent', error: null } });
    expect(row!.claims).toEqual(['retry']);
    expect(events).toEqual([
      {
        adminUserId: 'admin-ali',
        ipHash: ipHashOf(SECRET, IP),
        action: 'support.sms_resend',
        targetType: SUPPORT_TARGET,
        targetId: '7',
        at: NOW,
        detail: { thread: 7, orderNumber: 10027, message: 41, mobile: '0915 ••• 5678', outcome: 'sent' },
      },
    ]);
  });

  it('دیده‌شده، پاسخ تازه‌تر پیامک‌دار، رفته، و برداشته‌نشده هیچ؛ بی رویداد', async () => {
    const seen = build({ replySms: async () => replySms({ customerSeenAt: NOW }) }, { status: 'failed' });
    expect(await seen.support.resendSms(OPERATOR, { message: '41' }, IP)).toMatchObject({ ok: false, status: 409, error: 'support_sms_seen' });
    const newer = build({ replySms: async () => replySms({ newer: true }) }, { status: 'failed' });
    expect(await newer.support.resendSms(OPERATOR, { message: '41' }, IP)).toMatchObject({ ok: false, error: 'support_sms_newer' });
    const sent = build({ replySms: async () => replySms({}, { status: 'sent', sentAt: NOW }) }, { status: 'sent' });
    expect(await sent.support.resendSms(OPERATOR, { message: '41' }, IP)).toMatchObject({ ok: false, error: 'sms_not_failed' });
    // کس دیگری همین حالا برداشت.
    const raced = build({ replySms: async () => replySms() }, { status: 'sending' });
    expect(await raced.support.resendSms(OPERATOR, { message: '41' }, IP)).toMatchObject({ ok: false, error: 'sms_not_failed' });
    for (const built of [seen, newer, sent, raced]) expect(built.events).toEqual([]);
    expect(await build({ replySms: async () => null }).support.resendSms(OPERATOR, { message: '41' }, IP)).toMatchObject({ ok: false, status: 404 });
    expect(await build({ replySms: async () => replySms() }, null).support.resendSms(OPERATOR, { message: '41' }, IP)).toMatchObject({
      ok: false,
      status: 503,
      error: 'unavailable',
    });
  });
});
