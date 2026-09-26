/**
 * سرویس سفارش‌های پنل (`orders.ts`) با ذخیره‌گاه ساختگی و ساعت ساختگی: مجوز در سرور، مرز روز تهران و حاشیه‌ها
 * که به پایگاه داده می‌رسند، پارامترهای فهرست، «دوباره بساز» و دانلود با رویدادشان. خود کوئری‌ها روی پستگرس در
 * تست یکپارچگی `packages/db`. عددهای تصمیم صریح‌اند، نه از ثابت کد.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  AdminEventInput,
  PanelDueSummary,
  PanelOrderDetails,
  PanelOrderStore,
  PanelPrintFile,
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
    counts: record('counts', { open: 10, awaiting: 3, abandoned: 9, all: 120 }),
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
    if (!result.ok) return;
    expect(result.value).toMatchObject({ open: 10, slaDays: 3, alerts: { failedPdf: [10031] } });
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
