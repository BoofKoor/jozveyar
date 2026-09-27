/**
 * سرویس سفارش‌های پنل (`orders.ts`) با ذخیره‌گاه ساختگی و ساعت ساختگی: مجوز در سرور، مرز روز تهران و حاشیه‌ها
 * که به پایگاه داده می‌رسند، پارامترهای فهرست، «دوباره بساز» و دانلود با رویدادشان، و از ۴٫۳ وضعیت سفارش و ویرایش
 * گیرنده. خود کوئری‌ها و تراکنش‌ها روی پستگرس در تست یکپارچگی `packages/db`. عددهای تصمیم صریح‌اند، نه از ثابت کد.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  AdminEventInput,
  OrderStatus,
  PanelDueSummary,
  PanelOrderDetails,
  PanelOrderStore,
  PanelPrintFile,
  PanelStatusChange,
  PanelStatusEvent,
} from '@jozveyar/db';
import { MemoryDriver } from '@jozveyar/storage';

import type { AdminSession } from './auth';
import { createPanelOrders } from './orders';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const MINUTE = 60_000;
const SECRET = 's'.repeat(64);

function session(permissions: string[] = ['orders.read', 'files.download']): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'ali',
    displayName: 'علی',
    roles: ['operator'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
  };
}

const SUMMARY: PanelDueSummary = { overdue: 1, today: 3, tomorrow: 4, later: 2, overdueRange: null, laterRange: null };

/** پایگاه دادهٔ ساختگی: هر فراخوانی ثبت می‌شود و پاسخ‌ها از پیش گذاشته‌اند. */
function fakeStore(over: Partial<PanelOrderStore> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const events: AdminEventInput[] = [];
  const record =
    <T>(method: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      return value;
    };
  const store: PanelOrderStore = {
    dueSummary: record('dueSummary', SUMMARY),
    alerts: record('alerts', { failedPdf: [10031], unreturned: [{ orderNumber: 10030, attempts: 2 }] }),
    list: record('list', []),
    counts: record('counts', { open: 10, handed: 38, cancelled: 1, awaiting: 3, abandoned: 9, all: 120 }),
    stats: record('stats', { printing: 2, handed: 42, onTime: 41 }),
    details: record('details', null),
    printFile: record('printFile', null),
    rebuildPdf: async (orderId, event) => {
      calls.push({ method: 'rebuildPdf', args: [orderId, event] });
      events.push(event);
      return 'ok';
    },
    logEvent: async (event) => {
      events.push(event);
    },
    changeStatus: async (change) => {
      calls.push({ method: 'changeStatus', args: [change] });
      events.push(change.event);
      return { ok: true, order: { status: change.to } as never };
    },
    editRecipient: async (input) => {
      calls.push({ method: 'editRecipient', args: [input] });
      events.push(input.event);
      return { ok: true, order: {} as never, changed: ['addressText'] };
    },
    setting: record('setting', undefined),
    ...over,
  };
  return { store, calls, events };
}

function service(over: Partial<PanelOrderStore> = {}, storage: MemoryDriver | null = new MemoryDriver()) {
  const fake = fakeStore(over);
  const logs: string[] = [];
  const orders = createPanelOrders({ store: fake.store, storage, secret: SECRET, now: () => NOW, log: (m) => logs.push(m) });
  return { orders, ...fake, logs };
}

/** سفارش پرداخت‌شده‌ای که کار PDFش شکست خورده، با فایل‌هایی که تا دو روز دیگر روی سرورند. */
function failedDetails(over: { expires?: Date | null; deleted?: boolean; status?: 'paid' | 'awaiting_payment'; job?: 'failed' | 'queued' | null } = {}) {
  const job = over.job === undefined ? 'failed' : over.job;
  return {
    order: { id: 'order-1', orderNumber: 10031, status: over.status ?? 'paid' },
    items: [
      {
        seq: 1,
        sections: [
          {
            seq: 1,
            fileExpiresAt: over.expires === undefined ? new Date(NOW.getTime() + 2 * 86_400_000) : over.expires,
            fileDeletedAt: over.deleted ? NOW : null,
          },
        ],
      },
    ],
    pdfJob: job ? { status: job, attempts: 3, maxAttempts: 3, lastError: 'x', createdAt: NOW, updatedAt: NOW, finishedAt: NOW } : null,
  } as unknown as PanelOrderDetails;
}

describe('مجوز در سرور (ADR-038)', () => {
  it('بی `orders.read` نه پیشخوان، نه فهرست، نه جزئیات؛ بی `files.download` نه دانلود و نه «دوباره بساز»', async () => {
    const { orders, calls } = service();
    const none = session([]);
    for (const result of [
      await orders.dashboard(none),
      await orders.list(none, {}),
      await orders.details(none, '10027'),
      await orders.rebuild(none, '10027', '1.2.3.4'),
      await orders.download(none, '10027', '1', '1.2.3.4'),
    ]) {
      expect(result).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    }
    const readOnly = session(['orders.read']);
    expect(await orders.rebuild(readOnly, '10027', 'ip')).toMatchObject({ error: 'forbidden' });
    expect(await orders.download(readOnly, '10027', '1', 'ip')).toMatchObject({ error: 'forbidden' });
    // هیچ‌کدام به پایگاه داده نرسید.
    expect(calls).toEqual([]);
    expect((await orders.details(readOnly, '10027')).ok).toBe(false);
  });
});

describe('پیشخوان', () => {
  it('مرز روز تهران و دو حاشیه (یک ساعت فایل، نیم ساعت تلاش پرداخت) صریح به پایگاه داده می‌رسند', async () => {
    const { orders, calls } = service({ setting: async () => 3 });
    const result = await orders.dashboard(session());
    expect(result.ok).toBe(true);
    const find = (method: string) => calls.find((c) => c.method === method)!.args[0];
    expect(find('dueSummary')).toEqual({
      at: NOW,
      tomorrowStart: new Date('2026-10-05T20:30:00Z'),
      dayAfterStart: new Date('2026-10-06T20:30:00Z'),
    });
    const clock = { at: NOW, staleBefore: new Date(NOW.getTime() + 60 * MINUTE), unreturnedBefore: new Date(NOW.getTime() - 30 * MINUTE) };
    expect(find('alerts')).toEqual(clock);
    expect(find('list')).toEqual({ bucket: 'open', search: null, clock, limit: 5, offset: 0 });
    // «هفتهٔ گذشته» سطر آمار: هفت روز تا همین حالا، صریح.
    expect(find('stats')).toEqual({ since: new Date(NOW.getTime() - 7 * 24 * 60 * MINUTE), at: NOW });
    if (!result.ok) return;
    expect(result.value).toMatchObject({ open: 10, slaDays: 3, alerts: { failedPdf: [10031] }, stats: { printing: 2, handed: 42, onTime: 41 } });
    expect(result.value.tiles.map((t) => t.count)).toEqual([1, 3, 4, 2]);
  });

  it('روز کاری تعهد: تنظیم خراب یا نبودنش یعنی پیش‌فرض ۲، و بلند در لاگ', async () => {
    const broken = service({ setting: async () => 'دو' });
    const result = await broken.orders.dashboard(session());
    expect(result.ok && result.value.slaDays).toBe(2);
    expect(broken.logs.join()).toContain('order.sla_days');
    const missing = await service().orders.dashboard(session());
    expect(missing.ok && missing.value.slaDays).toBe(2);
  });
});

describe('فهرست', () => {
  it('بی چیپ «باز»؛ با جست‌وجو «همه»؛ صفحه‌ای ۵۰ تا و صفحهٔ بیرون از بازه آخرین صفحه', async () => {
    const { orders, calls } = service();
    const open = await orders.list(session(), {});
    expect(open).toMatchObject({ ok: true, value: { bucket: 'open', page: 1, pages: 1, q: '' } });
    expect(calls.at(-1)!.args[0]).toMatchObject({ bucket: 'open', search: null, limit: 50, offset: 0 });

    // «همه» ۱۲۰ سفارش: سه صفحه؛ صفحهٔ ۹ یعنی صفحهٔ ۳، از ردیف ۱۰۰.
    const all = await orders.list(session(), { q: ' ۱۰۰۲۷ ', page: '9' });
    expect(all).toMatchObject({ ok: true, value: { bucket: 'all', page: 3, pages: 3, q: '۱۰۰۲۷' } });
    expect(calls.at(-1)!.args[0]).toMatchObject({
      bucket: 'all',
      search: { kind: 'digits', orderNumber: 10027, phoneSuffix: '10027' },
      limit: 50,
      offset: 100,
    });
    const counted = calls.filter((c) => c.method === 'counts').at(-1)!.args[0];
    expect(counted).toMatchObject({ search: { kind: 'digits', orderNumber: 10027 } });

    const awaiting = await orders.list(session(), { status: 'awaiting', q: 'مريم' });
    expect(awaiting).toMatchObject({ ok: true, value: { bucket: 'awaiting', q: 'مريم', search: { kind: 'name', text: 'مریم' } } });
  });
});

describe('جزئیات', () => {
  it('شمارهٔ نشانی سنجیده؛ سفارش نیست یعنی ۴۰۴؛ و دانلود فقط با مجوزش', async () => {
    const { orders, calls } = service({ details: async () => failedDetails() });
    expect(await orders.details(session(), 'abc')).toMatchObject({ ok: false, status: 404, error: 'order_not_found' });
    expect(calls).toEqual([]);
    const found = await orders.details(session(['orders.read']), '10031');
    expect(found).toMatchObject({ ok: true, value: { canDownload: false, bounds: { tomorrowStart: new Date('2026-10-05T20:30:00Z') } } });
    expect(await orders.details(session(), '10031')).toMatchObject({ ok: true, value: { canDownload: true } });
    const empty = service();
    expect(await empty.orders.details(session(), '10027')).toMatchObject({ ok: false, error: 'order_not_found' });
  });
});

describe('دوباره بساز', () => {
  const ipHash = createHmac('sha256', SECRET).update('ip\x001.2.3.4').digest('hex');

  it('کار شکست‌خورده و فایل زنده: در صف، با رویداد کننده و هش IP؛ IP خام هرگز', async () => {
    const { orders, events } = service({ details: async () => failedDetails() });
    expect(await orders.rebuild(session(), '10031', '1.2.3.4')).toEqual({ ok: true, value: true });
    expect(events).toEqual([
      {
        adminUserId: 'admin-1',
        action: 'orders.pdf_rebuild',
        targetType: 'order',
        targetId: 'order-1',
        ipHash,
        detail: { orderNumber: 10031 },
        at: NOW,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('1.2.3.4');
  });

  it('نه برای کاری که شکست نخورده، سفارش پرداخت‌نشده، یا فایلی که دیگر روی سرور نیست', async () => {
    const run = async (details: PanelOrderDetails | null, rebuilt: 'ok' | 'not_failed' = 'ok') => {
      const { orders, events } = service({ details: async () => details, rebuildPdf: async () => rebuilt });
      const result = await orders.rebuild(session(), '10031', 'ip');
      return [result.ok ? 'ok' : result.error, events.length];
    };
    expect(await run(failedDetails({ job: 'queued' }))).toEqual(['pdf_not_failed', 0]);
    expect(await run(failedDetails({ job: null }))).toEqual(['pdf_not_failed', 0]);
    expect(await run(failedDetails({ status: 'awaiting_payment' }))).toEqual(['order_not_found', 0]);
    expect(await run(null)).toEqual(['order_not_found', 0]);
    expect(await run(failedDetails({ deleted: true }))).toEqual(['files_gone', 0]);
    expect(await run(failedDetails({ expires: new Date(NOW.getTime() - 1) }))).toEqual(['files_gone', 0]);
    expect(await run(failedDetails({ expires: null }))).toEqual(['files_gone', 0]);
    // دو کلیک هم‌زمان: دومی را پایگاه داده زیر قفل رد می‌کند.
    expect(await run(failedDetails(), 'not_failed')).toEqual(['pdf_not_failed', 0]);
  });
});

describe('دانلود PDF جزوه', () => {
  const READY: PanelPrintFile = {
    orderId: 'order-1',
    orderNumber: 10027,
    status: 'paid',
    itemSeq: 1,
    key: 'orders/10027/jozve-1.pdf',
    bytes: 14,
    readyAt: NOW,
  };

  it('از استوریج داخلی، جریانی، با نام jozve-10027-1.pdf؛ رویداد با کننده، سفارش و قلم', async () => {
    const storage = new MemoryDriver();
    storage.putObject('orders/10027/jozve-1.pdf', new TextEncoder().encode('%PDF-1.4 jozve'));
    const { orders, events, calls } = service({ printFile: async (...args) => (calls.push({ method: 'printFile', args }), READY) }, storage);
    const result = await orders.download(session(), '10027', '1', '1.2.3.4');
    expect(calls).toEqual([{ method: 'printFile', args: [10027, 1] }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ sizeBytes: 14, fileName: 'jozve-10027-1.pdf' });
    expect(await new Response(result.value.body).text()).toBe('%PDF-1.4 jozve');
    expect(events).toEqual([
      expect.objectContaining({
        adminUserId: 'admin-1',
        action: 'orders.pdf_download',
        targetType: 'order',
        targetId: 'order-1',
        detail: { orderNumber: 10027, item: 1 },
        at: NOW,
      }),
    ]);
  });

  it('هنوز ساخته نشده، پرداخت‌نشده، نشانی بد، بی استوریج یا استوریج بی فایل: کار روشن، بی رویداد', async () => {
    const run = async (file: PanelPrintFile | null, storage: MemoryDriver | null = new MemoryDriver(), item = '1') => {
      const { orders, events, logs } = service({ printFile: async () => file }, storage);
      const result = await orders.download(session(), '10027', item, 'ip');
      return [result.ok ? 'ok' : `${result.status} ${result.error}`, events.length, logs.length];
    };
    expect(await run({ ...READY, key: null, readyAt: null })).toEqual(['409 pdf_not_ready', 0, 0]);
    expect(await run({ ...READY, status: 'expired' })).toEqual(['409 pdf_not_ready', 0, 0]);
    expect(await run(null)).toEqual(['404 order_not_found', 0, 0]);
    expect(await run(READY, new MemoryDriver(), '0')).toEqual(['404 order_not_found', 0, 0]);
    expect(await run(READY, null)).toEqual(['503 storage_unavailable', 0, 0]);
    // ساخته شده ولی در استوریج نیست: بلند در لاگ.
    expect(await run(READY)).toEqual(['503 storage_unavailable', 0, 1]);
    const broken = new MemoryDriver();
    broken.getObject = async () => {
      throw new Error('garage down');
    };
    expect(await run(READY, broken)).toEqual(['503 storage_unavailable', 0, 1]);
  });

  it('رویداد نوشته نشد: بی فایل، و جریان باز استوریج بسته می‌شود', async () => {
    const storage = new MemoryDriver();
    let cancelled = 0;
    storage.getObject = async () => ({
      body: new ReadableStream<Uint8Array>({ cancel: () => void cancelled++ }),
      sizeBytes: 14,
      etag: '"e"',
    });
    const { orders } = service(
      {
        printFile: async () => READY,
        logEvent: async () => {
          throw new Error('db down');
        },
      },
      storage,
    );
    await expect(orders.download(session(), '10027', '1', 'ip')).rejects.toThrow('db down');
    expect(cancelled).toBe(1);
  });
});

/* ───────────── وضعیت سفارش و گیرنده (۴٫۳) ───────────── */

/** سفارشی با وضعیت دلخواه، PDF ساخته‌شده، و رویدادهای وضعیت. */
function orderDetails(status: OrderStatus, over: { ready?: boolean; events?: Partial<PanelStatusEvent>[] } = {}) {
  return {
    order: {
      id: 'order-1',
      orderNumber: 10027,
      status,
      recipientName: 'مریم کاظمی',
      addressText: 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6',
      postalCode: null,
    },
    items: [{ seq: 1, printPdfReadyAt: over.ready === false ? null : NOW, sections: [] }],
    statusEvents: (over.events ?? []).map((e, i) => ({ id: i + 1, orderId: 'order-1', at: NOW, actor: 'admin', adminName: null, note: null, ...e })),
    pdfJob: null,
  } as unknown as PanelOrderDetails;
}

const OWNER = ['orders.read', 'orders.status', 'orders.revert', 'orders.address', 'files.download'];
const OPERATOR = ['orders.read', 'orders.status', 'orders.address', 'files.download'];
const ipHash = createHmac('sha256', SECRET).update('ip\x001.2.3.4').digest('hex');

describe('وضعیت سفارش', () => {
  const changes = (calls: { method: string; args: unknown[] }[]) =>
    calls.filter((c) => c.method === 'changeStatus').map((c) => c.args[0] as PanelStatusChange);

  it('مجوز در سرور: وضعیت با `orders.status`، برگرداندن فقط با `orders.revert` (مالک)، گیرنده با `orders.address`', async () => {
    const { orders, calls } = service({ details: async () => orderDetails('printing') });
    const reader = session(['orders.read']);
    expect(await orders.changeStatus(reader, '10027', { action: 'handed_to_post', from: 'printing' }, 'ip')).toMatchObject({ status: 403, error: 'forbidden' });
    expect(await orders.changeStatus(reader, '10027', { action: 'cancel', from: 'printing', reason: 'x' }, 'ip')).toMatchObject({ error: 'forbidden' });
    // متصدی وضعیت را جلو می‌برد و لغو می‌کند، ولی برنمی‌گرداند.
    expect(await orders.changeStatus(session(OPERATOR), '10027', { action: 'revert', from: 'printing', reason: 'اشتباه' }, 'ip')).toMatchObject({
      status: 403,
      error: 'forbidden',
    });
    expect(await orders.editRecipient(reader, '10027', { name: 'مریم کاظمی', addressText: 'بلوار سجاد، پلاک 42', postalCode: '' }, 'ip')).toMatchObject({
      error: 'forbidden',
    });
    expect(calls).toEqual([]);
    // جزئیات می‌گوید کدام کار را نشان دهد.
    const owner = await orders.details(session(OWNER), '10027');
    expect(owner).toMatchObject({ ok: true, value: { canStatus: true, canRevert: true, revertTo: 'paid', canEditRecipient: true } });
    const operator = await orders.details(session(OPERATOR), '10027');
    expect(operator).toMatchObject({ ok: true, value: { canStatus: true, canRevert: false, revertTo: 'paid', canEditRecipient: true } });
  });

  it('«شروع چاپ» و «تحویل پست شد»: از وضعیتی که ادمین دید، با رویداد کننده و هش IP؛ IP خام هرگز', async () => {
    const { orders, calls, events } = service({ details: async () => orderDetails('paid') });
    expect(await orders.changeStatus(session(OPERATOR), '10027', { action: 'start_print', from: 'paid' }, '1.2.3.4')).toEqual({
      ok: true,
      value: { status: 'printing' },
    });
    expect(changes(calls)).toEqual([
      {
        orderId: 'order-1',
        from: 'paid',
        to: 'printing',
        at: NOW,
        adminUserId: 'admin-1',
        note: null,
        event: {
          adminUserId: 'admin-1',
          action: 'orders.status',
          targetType: 'order',
          targetId: 'order-1',
          ipHash,
          detail: { orderNumber: 10027, from: 'paid', to: 'printing' },
          at: NOW,
        },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('1.2.3.4');
    const printing = service({ details: async () => orderDetails('printing') });
    expect(await printing.orders.changeStatus(session(OPERATOR), '10027', { action: 'handed_to_post', from: 'printing' }, 'ip')).toMatchObject({
      ok: true,
      value: { status: 'handed_to_post' },
    });
  });

  it('«شروع چاپ» پیش از PDF جزوه نه؛ کار ناشناس، وضعیت ناشناس یا گذار نادرست نه؛ سفارشی که نیست ۴۰۴', async () => {
    const run = async (details: PanelOrderDetails | null, form: { action: unknown; from: unknown; reason?: unknown }) => {
      const { orders, calls } = service({ details: async () => details });
      const result = await orders.changeStatus(session(OWNER), '10027', form, 'ip');
      return [result.ok ? 'ok' : `${result.status} ${result.error}`, changes(calls).length];
    };
    expect(await run(orderDetails('paid', { ready: false }), { action: 'start_print', from: 'paid' })).toEqual(['409 print_needs_pdf', 0]);
    expect(await run(orderDetails('paid'), { action: 'ship', from: 'paid' })).toEqual(['400 invalid_transition', 0]);
    expect(await run(orderDetails('paid'), { action: 'start_print', from: 'shipped' })).toEqual(['400 invalid_transition', 0]);
    expect(await run(orderDetails('paid'), { action: 'handed_to_post', from: 'paid' })).toEqual(['400 invalid_transition', 0]);
    expect(await run(orderDetails('handed_to_post'), { action: 'cancel', from: 'handed_to_post', reason: 'x' })).toEqual(['400 invalid_transition', 0]);
    expect(await run(orderDetails('awaiting_payment'), { action: 'cancel', from: 'awaiting_payment', reason: 'x' })).toEqual([
      '400 invalid_transition',
      0,
    ]);
    expect(await run(orderDetails('paid'), { action: 'revert', from: 'paid', reason: 'x' })).toEqual(['400 invalid_transition', 0]);
    expect(await run(null, { action: 'start_print', from: 'paid' })).toEqual(['404 order_not_found', 0]);
  });

  it('وضعیت همین حالا عوض شد: همان جا که ادمین می‌خواست یعنی انجام شده (دو کلیک)؛ جای دیگر یعنی ۴۰۹ با وضعیت تازه', async () => {
    // سفارش پیش از خواندن به «در حال چاپ» رفته بود: کلیک دوم «شروع چاپ» موفق است، بی ردیف دوم.
    const twice = service({ details: async () => orderDetails('printing') });
    expect(await twice.orders.changeStatus(session(OWNER), '10027', { action: 'start_print', from: 'paid' }, 'ip')).toEqual({
      ok: true,
      value: { status: 'printing' },
    });
    expect(changes(twice.calls)).toEqual([]);
    // جای دیگری رفته: کار انجام نمی‌شود.
    const moved = service({ details: async () => orderDetails('cancelled') });
    expect(await moved.orders.changeStatus(session(OWNER), '10027', { action: 'handed_to_post', from: 'printing' }, 'ip')).toMatchObject({
      ok: false,
      status: 409,
      error: 'status_changed',
      current: 'cancelled',
    });
    expect(changes(moved.calls)).toEqual([]);
    // هم‌زمان در پایگاه داده (بین خواندن و نوشتن): همان جا یعنی انجام شده، جای دیگر ۴۰۹.
    const raced = (current: OrderStatus) =>
      service({ details: async () => orderDetails('paid'), changeStatus: async () => ({ ok: false, current }) }).orders.changeStatus(
        session(OWNER),
        '10027',
        { action: 'start_print', from: 'paid' },
        'ip',
      );
    expect(await raced('printing')).toEqual({ ok: true, value: { status: 'printing' } });
    expect(await raced('cancelled')).toMatchObject({ ok: false, status: 409, error: 'status_changed', current: 'cancelled' });
  });

  it('لغو و برگرداندن دلیل می‌خواهند: فارسی‌نرمال، دست‌کم یک نویسه و حداکثر ۵۰۰؛ دلیل فقط در یادداشت وضعیت، نه رویداد ادمین', async () => {
    const run = async (reason: unknown, action: 'cancel' | 'revert' = 'cancel') => {
      const { orders, calls } = service({ details: async () => orderDetails('printing') });
      const result = await orders.changeStatus(session(OWNER), '10027', { action, from: 'printing', reason }, 'ip');
      return { result: result.ok ? 'ok' : result.error, change: changes(calls)[0] };
    };
    expect((await run('')).result).toBe('reason_required');
    expect((await run('   \u200c ')).result).toBe('reason_required');
    expect((await run(undefined)).result).toBe('reason_required');
    expect((await run('ی'.repeat(501))).result).toBe('reason_too_long');
    expect((await run('ی'.repeat(500))).result).toBe('ok');
    const cancelled = await run('  مشتری خواست؛ ۳۷۴,۷۵۰ تومان کارت‌به‌کارت برگشت، پیگيري 552190 ');
    expect(cancelled.result).toBe('ok');
    expect(cancelled.change).toMatchObject({
      from: 'printing',
      to: 'cancelled',
      note: { reason: 'مشتری خواست؛ 374,750 تومان کارت‌به‌کارت برگشت، پیگیری 552190' },
      event: { detail: { orderNumber: 10027, from: 'printing', to: 'cancelled' } },
    });
    expect(JSON.stringify(cancelled.change!.event)).not.toContain('مشتری خواست');
    expect((await run('اشتباه زدم', 'revert')).change).toMatchObject({ from: 'printing', to: 'paid', note: { reason: 'اشتباه زدم' } });
  });

  it('برگرداندن لغو: به همان وضعیتی که پیش از لغو داشت؛ بی رد لغو، ممکن نیست', async () => {
    const run = async (events: Partial<PanelStatusEvent>[]) => {
      const { orders, calls } = service({ details: async () => orderDetails('cancelled', { events }) });
      const result = await orders.changeStatus(session(OWNER), '10027', { action: 'revert', from: 'cancelled', reason: 'اشتباه' }, 'ip');
      return [result.ok ? result.value.status : result.error, changes(calls)[0]?.to ?? null];
    };
    expect(await run([{ fromStatus: 'paid', toStatus: 'printing' }, { fromStatus: 'printing', toStatus: 'cancelled' }])).toEqual(['printing', 'printing']);
    expect(await run([{ fromStatus: 'paid', toStatus: 'cancelled' }])).toEqual(['paid', 'paid']);
    expect(await run([])).toEqual(['invalid_transition', null]);
  });
});

describe('ویرایش گیرنده', () => {
  const edits = (calls: { method: string; args: unknown[] }[]) => calls.filter((c) => c.method === 'editRecipient').map((c) => c.args[0]);

  it('با همان قاعدهٔ مسیر خرید: فارسی‌نرمال، کد پستی با ارقام فارسی؛ فقط تا پیش از پست؛ رویداد با هش IP', async () => {
    const { orders, calls } = service({ details: async () => orderDetails('paid') });
    const result = await orders.editRecipient(
      session(OPERATOR),
      '10027',
      { name: ' مريم  كاظمی ', addressText: 'بلوار سجاد، سجاد ۱۸، پلاک ۴۲، واحد ۶', postalCode: '۹۱۸۷۶-۵۴۳۲۱' },
      '1.2.3.4',
    );
    expect(result).toEqual({ ok: true, value: { changed: ['addressText'] } });
    expect(edits(calls)).toEqual([
      {
        orderId: 'order-1',
        editable: ['paid', 'printing'],
        recipient: { recipientName: 'مریم کاظمی', addressText: 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6', postalCode: '9187654321' },
        event: {
          adminUserId: 'admin-1',
          action: 'orders.recipient',
          targetType: 'order',
          targetId: 'order-1',
          ipHash,
          detail: { orderNumber: 10027 },
          at: NOW,
        },
      },
    ]);
    // کد پستی خالی یعنی ندارد.
    const empty = service({ details: async () => orderDetails('printing') });
    await empty.orders.editRecipient(session(OPERATOR), '10027', { name: 'مریم کاظمی', addressText: 'بلوار سجاد، پلاک 42', postalCode: '  ' }, 'ip');
    expect(edits(empty.calls)[0]).toMatchObject({ recipient: { postalCode: null } });
  });

  it('فیلد نادرست: همان فیلدها، بی نوشتن؛ به پست رسیده یا لغوشده: نه؛ سفارشی که نیست: ۴۰۴', async () => {
    const { orders, calls } = service({ details: async () => orderDetails('paid') });
    // نام ۲ تا ۱۰۰ و نشانی ۱۰ تا ۵۰۰ نویسه، کد پستی ۱۰ رقم (همان `checkRecipient`)، صریح.
    expect(await orders.editRecipient(session(OPERATOR), '10027', { name: 'م', addressText: 'کوتاه', postalCode: '12345' }, 'ip')).toMatchObject({
      ok: false,
      status: 400,
      error: 'invalid_recipient',
      fields: ['recipient.name', 'recipient.addressText', 'recipient.postalCode'],
    });
    expect(edits(calls)).toEqual([]);
    const locked = service({ details: async () => orderDetails('paid'), editRecipient: async () => ({ ok: false, current: 'handed_to_post' }) });
    expect(
      await locked.orders.editRecipient(session(OPERATOR), '10027', { name: 'مریم کاظمی', addressText: 'بلوار سجاد، پلاک 42', postalCode: '' }, 'ip'),
    ).toMatchObject({ ok: false, status: 409, error: 'recipient_locked', current: 'handed_to_post' });
    const missing = service({ details: async () => null });
    expect(
      await missing.orders.editRecipient(session(OPERATOR), '10027', { name: 'مریم کاظمی', addressText: 'بلوار سجاد، پلاک 42', postalCode: '' }, 'ip'),
    ).toMatchObject({ error: 'order_not_found' });
    // جزئیات: ویرایش فقط تا پیش از پست.
    for (const [status, can] of [['paid', true], ['printing', true], ['handed_to_post', false], ['cancelled', false], ['awaiting_payment', false]] as const) {
      const view = await service({ details: async () => orderDetails(status) }).orders.details(session(OPERATOR), '10027');
      expect(view.ok && view.value.canEditRecipient, status).toBe(can);
    }
  });
});

describe('PDF جزوه پس از ۴٫۳', () => {
  it('«دوباره بساز» فقط برای سفارش باز؛ دانلود PDF ساخته‌شده در هر وضعیت پس از پرداخت', async () => {
    const rebuild = async (status: OrderStatus) => {
      const details = { ...failedDetails(), order: { ...failedDetails().order, status } } as PanelOrderDetails;
      const result = await service({ details: async () => details }).orders.rebuild(session(), '10031', 'ip');
      return result.ok ? 'ok' : result.error;
    };
    expect([await rebuild('paid'), await rebuild('printing'), await rebuild('cancelled'), await rebuild('handed_to_post')]).toEqual([
      'ok',
      'ok',
      'order_not_found',
      'order_not_found',
    ]);
    const storage = new MemoryDriver();
    storage.putObject('orders/10027/jozve-1.pdf', new TextEncoder().encode('%PDF-1.4 jozve'));
    const file: PanelPrintFile = { orderId: 'order-1', orderNumber: 10027, status: 'cancelled', itemSeq: 1, key: 'orders/10027/jozve-1.pdf', bytes: 14, readyAt: NOW };
    const { orders } = service({ printFile: async () => file }, storage);
    expect((await orders.download(session(), '10027', '1', 'ip')).ok).toBe(true);
    const unpaid = service({ printFile: async () => ({ ...file, status: 'awaiting_payment' }) }, storage);
    expect(await unpaid.orders.download(session(), '10027', '1', 'ip')).toMatchObject({ error: 'pdf_not_ready' });
  });
});
