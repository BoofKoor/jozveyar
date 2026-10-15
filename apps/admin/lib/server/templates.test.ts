/**
 * سرویس قالب برگه‌های پنل (`templates.ts`، برش ۹٫۲) با ذخیره‌گاه و استوریج حافظه‌ای: مجوز در سرور، سنجش فایل، پیش‌نمایش با سفارش،
 * «همان که دیده شد» و کد تازه فقط پس از هر سنجشی که بی کد جواب دارد. قفل، تراکنش و محافظ‌ها روی پستگرس در تست یکپارچگی
 * `packages/db`.
 */

import { createHash, createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { OrderStatus, TicketTemplateStore, TicketTemplateVersion } from '@jozveyar/db';
import { MemoryDriver } from '@jozveyar/storage';

import { activationSeen } from '../ticketTemplates';
import { DEFAULT_TICKET_TEMPLATES } from '../ticketTemplates.generated';
import type { AdminSession } from './auth';
import { fail, ok, type Result } from './result';
import { createPanelTemplates, readTemplateFile } from './templates';

const NOW = new Date('2026-10-15T07:50:00Z');
const PREVIEWED = new Date('2026-10-15T07:40:00Z');
const SECRET = 's'.repeat(64);

function session(permissions: string[]): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'sara',
    displayName: 'سارا',
    roles: ['owner'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
  };
}
const OWNER = session(['templates.manage', 'settings.edit']);
const OPERATOR = session(['orders.read', 'files.download']);

const bytes = (text: string) => new TextEncoder().encode(text);
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function version(over: Partial<TicketTemplateVersion> & { id: number }): TicketTemplateVersion {
  return {
    kind: 'bijak',
    version: over.id,
    sha256: sha(`v${over.id}`),
    fileName: `bijak-${over.id}.html`,
    sizeBytes: 100,
    createdAt: NOW,
    createdBy: 'سارا',
    isActive: false,
    activatedAt: null,
    ...over,
    preview: {
      job: 'done',
      jobError: null,
      at: PREVIEWED,
      orderNumber: null,
      pages: 2,
      pdfKey: `ticket-templates/${over.id}/preview.pdf`,
      pngKey: `ticket-templates/${over.id}/preview.png`,
      blocked: [],
      error: null,
      ...over.preview,
    },
  };
}

/** ذخیره‌گاه حافظه‌ای با همان قرارداد نسخهٔ پستگرس؛ هر نوشتن ثبت می‌شود. */
function memoryStore(rows: TicketTemplateVersion[], orders: Record<number, { status: OrderStatus; filesDeleted: boolean }> = {}) {
  const writes: { method: string; input: unknown }[] = [];
  let busy = false;
  const store: TicketTemplateStore = {
    async versions() {
      return rows;
    },
    async source(id) {
      const row = rows.find((r) => r.id === id);
      return row ? { kind: row.kind, version: row.version, fileName: row.fileName, html: `<p>v${row.id}</p>` } : null;
    },
    async upload(input) {
      writes.push({ method: 'upload', input });
      return version({ id: 99, kind: input.kind, sha256: input.sha256, fileName: input.fileName, preview: { job: 'busy', at: null, pages: null, pdfKey: null, pngKey: null } as never });
    },
    async previewOrder(orderNumber) {
      return orders[orderNumber] ?? null;
    },
    async requestPreview(input) {
      writes.push({ method: 'requestPreview', input });
      if (!rows.some((r) => r.id === input.id)) return 'not_found';
      return busy ? 'busy' : 'ok';
    },
    async queuedOrders() {
      return 4;
    },
    async activate(input) {
      writes.push({ method: 'activate', input });
      const target = rows.find((r) => r.id === input.id);
      if (target && !input.verify({ sha256: target.sha256, previewAt: target.preview.at! })) return { ok: false, reason: 'changed' };
      return { ok: true, already: false, previous: null, requeued: 3 };
    },
  };
  return { store, writes, setBusy: (value: boolean) => void (busy = value) };
}

function service(
  rows: TicketTemplateVersion[],
  { stepUp = async () => ok(true) as Result<true>, storage = new MemoryDriver() as MemoryDriver | null, orders = {} } = {} as {
    stepUp?: (s: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
    storage?: MemoryDriver | null;
    orders?: Record<number, { status: OrderStatus; filesDeleted: boolean }>;
  },
) {
  const memory = memoryStore(rows, orders);
  const step = vi.fn(stepUp);
  const log = vi.fn();
  const templates = createPanelTemplates({ store: memory.store, storage, stepUp: step, secret: SECRET, now: () => NOW, log });
  return { templates, ...memory, step, log };
}

describe('قالب برگه‌ها: سنجش فایل', () => {
  it('HTML تا ۲ مگابایت، UTF-8 درست و بی نویسهٔ صفر؛ BOM کنار می‌رود و نام فایل فقط برای نمایش، کوتاه و بی پوشه', () => {
    expect(readTemplateFile(null)).toMatchObject({ error: 'template_file_required' });
    expect(readTemplateFile({ name: 'a.html', bytes: new Uint8Array() })).toMatchObject({ error: 'template_file_required' });
    expect(readTemplateFile({ name: 'a.html', bytes: bytes('  \n ') })).toMatchObject({ error: 'template_file_required' });
    expect(readTemplateFile({ name: 'a.txt', bytes: bytes('<p>x</p>') })).toMatchObject({ error: 'template_not_html' });
    expect(readTemplateFile({ name: 'a.html.pdf', bytes: bytes('<p>x</p>') })).toMatchObject({ error: 'template_not_html' });
    expect(readTemplateFile({ name: 'a.html', bytes: new Uint8Array(2 * 1024 * 1024 + 1).fill(32) })).toMatchObject({ status: 413, error: 'template_too_large' });
    expect(readTemplateFile({ name: 'a.html', bytes: new Uint8Array(2 * 1024 * 1024).fill(120) })).toMatchObject({ ok: true });
    expect(readTemplateFile({ name: 'a.html', bytes: new Uint8Array([0x3c, 0x70, 0xff, 0x3e]) })).toMatchObject({ error: 'template_not_utf8' });
    expect(readTemplateFile({ name: 'a.html', bytes: bytes('<p>\u0000</p>') })).toMatchObject({ error: 'template_not_utf8' });
    expect(readTemplateFile({ name: 'A.HTM', bytes: bytes('\ufeff<p>بیجک</p>') })).toEqual(ok({ html: '<p>بیجک</p>', fileName: 'A.HTM' }));
    const long = `${'ب'.repeat(300)}.html`;
    expect(readTemplateFile({ name: `C:\\fakepath\\x\u0007${long}`, bytes: bytes('<p>x</p>') })).toEqual(ok({ html: '<p>x</p>', fileName: `x${'ب'.repeat(199)}` }));
  });
});

describe('قالب برگه‌ها: سرویس پنل', () => {
  const V1 = version({ id: 1, isActive: true, activatedAt: NOW });
  const V2 = version({ id: 2 });
  const FP = version({ id: 3, kind: 'first_page', version: 1 });

  it('همه فقط با `templates.manage` (مالک)؛ متصدی ۴۰۳ پیش از هر خواندن', async () => {
    const { templates, writes } = service([V1, V2, FP]);
    const forbidden = { status: 403, error: 'forbidden' };
    expect(await templates.overview(OPERATOR)).toMatchObject(forbidden);
    expect(await templates.version(OPERATOR, '2')).toMatchObject(forbidden);
    expect(await templates.upload(OPERATOR, { kind: 'bijak', file: { name: 'a.html', bytes: bytes('<p>x</p>') } }, 'ip')).toMatchObject(forbidden);
    expect(await templates.preview(OPERATOR, '2', { order: '' }, 'ip')).toMatchObject(forbidden);
    expect(await templates.activation(OPERATOR, '2')).toMatchObject(forbidden);
    expect(await templates.activate(OPERATOR, '2', { active: '1', seen: activationSeen(V2), code: '123456' }, 'ip')).toMatchObject(forbidden);
    expect(await templates.source(OPERATOR, 'default-bijak')).toMatchObject(forbidden);
    expect(await templates.previewFile(OPERATOR, '2', 'pdf')).toMatchObject(forbidden);
    expect(writes).toEqual([]);
  });

  it('هر نوع با نسخه‌ها و نسخهٔ فعالش؛ نسخه با نسخهٔ فعال همان نوع', async () => {
    const { templates } = service([V1, V2, FP]);
    const result = await templates.overview(OWNER);
    expect(result.ok && result.value.kinds.map((k) => [k.kind, k.active?.id ?? null, k.versions.map((v) => v.id)])).toEqual([
      ['bijak', 1, [1, 2]],
      ['first_page', null, [3]],
    ]);
    expect(await templates.version(OWNER, '3')).toMatchObject({ ok: true, value: { version: { id: 3 }, active: null } });
    expect(await templates.version(OWNER, '2')).toMatchObject({ ok: true, value: { version: { id: 2 }, active: { id: 1 } } });
    expect(await templates.version(OWNER, '7')).toMatchObject({ status: 404, error: 'template_not_found' });
    expect(await templates.version(OWNER, 'default-bijak')).toMatchObject({ status: 404, error: 'template_not_found' });
  });

  it('بارگذاری: نوع درست و فایل درست، با اثر انگشت همان متن، IP هش‌شده و زمان پنل', async () => {
    const { templates, writes } = service([]);
    const file = { name: 'bijak-apex.html', bytes: bytes('\ufeff<p>{{ order.number }}</p>') };
    expect(await templates.upload(OWNER, { kind: 'other', file }, 'ip')).toMatchObject({ status: 400, error: 'invalid_template_kind' });
    expect(await templates.upload(OWNER, { kind: 'bijak', file: { ...file, name: 'x.txt' } }, 'ip')).toMatchObject({ error: 'template_not_html' });
    expect(writes).toEqual([]);
    expect(await templates.upload(OWNER, { kind: 'bijak', file }, '5.6.7.8')).toMatchObject({ ok: true, value: { id: 99 } });
    expect(writes).toEqual([
      {
        method: 'upload',
        input: {
          kind: 'bijak',
          html: '<p>{{ order.number }}</p>',
          sha256: sha('<p>{{ order.number }}</p>'),
          fileName: 'bijak-apex.html',
          actor: { adminUserId: 'admin-1', ipHash: createHmac('sha256', SECRET).update('ip\x005.6.7.8').digest('hex') },
          at: NOW,
        },
      },
    ]);
  });

  it('پیش‌نمایش: نمونه یا سفارش پرداخت‌شده‌ای که فایل‌هایش هست (ارقام فارسی هم)؛ پیش‌نمایش در حال ساختن دوباره نه', async () => {
    const orders = {
      10027: { status: 'printing' as OrderStatus, filesDeleted: false },
      10028: { status: 'awaiting_payment' as OrderStatus, filesDeleted: false },
      10029: { status: 'expired' as OrderStatus, filesDeleted: false },
      10030: { status: 'handed_to_post' as OrderStatus, filesDeleted: true },
      10031: { status: 'cancelled' as OrderStatus, filesDeleted: false },
    };
    const { templates, writes, setBusy } = service([V1, V2], { orders });
    const requested = () => writes.filter((w) => w.method === 'requestPreview').map((w) => (w.input as { orderNumber: number | null }).orderNumber);
    expect(await templates.preview(OWNER, '2', { order: '' }, 'ip')).toEqual(ok({ id: 2 }));
    expect(await templates.preview(OWNER, '2', { order: ' ۱۰۰۲۷ ' }, 'ip')).toEqual(ok({ id: 2 }));
    expect(await templates.preview(OWNER, '2', { order: '10031' }, 'ip')).toEqual(ok({ id: 2 }));
    expect(requested()).toEqual([null, 10027, 10031]);
    expect(await templates.preview(OWNER, '2', { order: '12a' }, 'ip')).toMatchObject({ status: 400, error: 'order_number_invalid' });
    expect(await templates.preview(OWNER, '2', { order: '10099' }, 'ip')).toMatchObject({ status: 404, error: 'order_not_found' });
    expect(await templates.preview(OWNER, '2', { order: '10028' }, 'ip')).toMatchObject({ status: 409, error: 'preview_order_unpaid' });
    expect(await templates.preview(OWNER, '2', { order: '10029' }, 'ip')).toMatchObject({ status: 409, error: 'preview_order_unpaid' });
    expect(await templates.preview(OWNER, '2', { order: '10030' }, 'ip')).toMatchObject({ status: 410, error: 'preview_files_deleted' });
    expect(await templates.preview(OWNER, 'default-bijak', { order: '' }, 'ip')).toMatchObject({ status: 404, error: 'template_not_found' });
    expect(await templates.preview(OWNER, '7', { order: '' }, 'ip')).toMatchObject({ status: 404, error: 'template_not_found' });
    expect(requested()).toEqual([null, 10027, 10031, null]);
    setBusy(true);
    expect(await templates.preview(OWNER, '2', { order: '' }, 'ip')).toMatchObject({ status: 409, error: 'preview_busy' });
  });

  it('صفحهٔ فعال کردن: نسخه یا پیش‌فرض، با نسخهٔ فعال، شمار سفارش‌های در صف و «همان که دیده شد»؛ فعالِ همین حالا نه', async () => {
    const { templates } = service([V1, V2, FP]);
    expect(await templates.activation(OWNER, '2')).toEqual(
      ok({ now: NOW, kind: 'bijak', target: V2, active: V1, queuedOrders: 4, seen: activationSeen(V2) }),
    );
    expect(await templates.activation(OWNER, 'default-bijak')).toEqual(ok({ now: NOW, kind: 'bijak', target: null, active: V1, queuedOrders: 4, seen: '' }));
    expect(await templates.activation(OWNER, '1')).toMatchObject({ status: 409, error: 'already_active' });
    expect(await templates.activation(OWNER, 'default-first_page')).toMatchObject({ status: 409, error: 'already_active' });
    expect(await templates.activation(OWNER, '9')).toMatchObject({ status: 404, error: 'template_not_found' });
    expect(await templates.activation(OWNER, 'default-x')).toMatchObject({ status: 404, error: 'template_not_found' });
  });

  it('فعال کردن: کد فقط پس از نسخهٔ فعال دیده‌شده، پیش‌نمایش درست و همان متن و پیش‌نمایش؛ ذخیره‌گاه همان را زیر قفل می‌سنجد', async () => {
    const broken = version({ id: 4, preview: { error: 'bijak خط 3: x', pages: null, pdfKey: null, pngKey: null } as never });
    const unseen = version({ id: 5, preview: { at: null, job: 'busy', pages: null, pdfKey: null, pngKey: null } as never });
    const { templates, step, writes } = service([V1, V2, FP, broken, unseen]);
    const activate = (param: string, input: Partial<{ active: string; seen: string; code: string }> = {}) =>
      templates.activate(OWNER, param, { active: '1', seen: activationSeen(V2), code: '123456', ...input }, 'ip');

    expect(await activate('2', { active: '' })).toMatchObject({ status: 409, error: 'template_changed' });
    expect(await activate('2', { active: 'x' })).toMatchObject({ status: 409, error: 'template_changed' });
    expect(await activate('2', { seen: activationSeen({ sha256: V2.sha256, preview: { at: NOW } }) })).toMatchObject({ status: 409, error: 'template_changed' });
    expect(await activate('4', { seen: activationSeen(broken) })).toMatchObject({ status: 409, error: 'template_no_preview' });
    expect(await activate('5', { seen: activationSeen(unseen) })).toMatchObject({ status: 409, error: 'template_no_preview' });
    expect(await activate('9')).toMatchObject({ status: 404, error: 'template_not_found' });
    // نسخه‌ای که همین حالا فعال است: موفق، بی کد و بی کار دوباره.
    expect(await activate('1')).toEqual(ok({ kind: 'bijak', version: 1, requeued: 0 }));
    expect(await activate('default-first_page', { active: '' })).toEqual(ok({ kind: 'first_page', version: null, requeued: 0 }));
    expect(step).not.toHaveBeenCalled();
    expect(writes).toEqual([]);

    expect(await activate('2')).toEqual(ok({ kind: 'bijak', version: 2, requeued: 3 }));
    expect(step).toHaveBeenCalledWith(OWNER, '123456', 'ip');
    const [call] = writes as unknown as [{ input: Parameters<TicketTemplateStore['activate']>[0] }];
    expect(call.input).toMatchObject({ kind: 'bijak', id: 2, expectedActive: 1, at: NOW });
    expect(call.input.verify({ sha256: V2.sha256, previewAt: PREVIEWED })).toBe(true);
    expect(call.input.verify({ sha256: V2.sha256, previewAt: NOW })).toBe(false);
    expect(call.input.verify({ sha256: sha('other'), previewAt: PREVIEWED })).toBe(false);

    // برگشت به پیش‌فرض، و پیش‌فرض نوعی که نسخهٔ فعال ندارد.
    expect(await activate('default-bijak', { seen: '' })).toEqual(ok({ kind: 'bijak', version: null, requeued: 3 }));
    expect((writes.at(-1)!.input as { id: number | null; expectedActive: number | null }).id).toBeNull();
    expect(await activate('3', { active: '', seen: activationSeen(FP) })).toEqual(ok({ kind: 'first_page', version: 1, requeued: 3 }));
  });

  it('فعال کردن: کد نادرست چیزی نمی‌نویسد؛ و حکم ذخیره‌گاه به پیامش', async () => {
    const wrong = service([V1, V2], { stepUp: async () => fail(401, 'wrong_code') });
    expect(await wrong.templates.activate(OWNER, '2', { active: '1', seen: activationSeen(V2), code: '000000' }, 'ip')).toMatchObject({ error: 'wrong_code' });
    expect(wrong.writes).toEqual([]);

    const { templates, store } = service([V1, V2]);
    const cases: [Awaited<ReturnType<TicketTemplateStore['activate']>>, string][] = [
      [{ ok: false, reason: 'changed' }, 'template_changed'],
      [{ ok: false, reason: 'no_preview' }, 'template_no_preview'],
      [{ ok: false, reason: 'not_found' }, 'template_not_found'],
    ];
    for (const [verdict, error] of cases) {
      store.activate = async () => verdict;
      expect(await templates.activate(OWNER, '2', { active: '1', seen: activationSeen(V2), code: '123456' }, 'ip')).toMatchObject({ ok: false, error });
    }
  });

  it('متن قالب برای دانلود: نسخه با نام ASCII، و قالب پیش‌فرض کارگر', async () => {
    const { templates } = service([V1, FP]);
    expect(await templates.source(OWNER, '1')).toEqual(ok({ fileName: 'ghaleb-bijak-1.html', html: '<p>v1</p>' }));
    expect(await templates.source(OWNER, '3')).toEqual(ok({ fileName: 'ghaleb-barge-aval-1.html', html: '<p>v3</p>' }));
    expect(await templates.source(OWNER, 'default-first_page')).toEqual(
      ok({ fileName: 'ghaleb-barge-aval-pishfarz.html', html: DEFAULT_TICKET_TEMPLATES.first_page }),
    );
    expect(await templates.source(OWNER, '8')).toMatchObject({ status: 404, error: 'template_not_found' });
  });

  it('فایل پیش‌نمایش: PDF و PNG هر صفحه از آخرین پیش‌نمایش درست؛ صفحهٔ بیرون از آن نه؛ استوریج نبود یا فایل نبود ۵۰۳', async () => {
    const storage = new MemoryDriver();
    storage.putObject('ticket-templates/2/preview.pdf', bytes('%PDF-1.7'));
    storage.putObject('ticket-templates/2/preview.png', bytes('png-1'));
    storage.putObject('ticket-templates/2/preview-2.png', bytes('png-2'));
    const broken = version({ id: 4, preview: { error: 'bijak خط 3: x', pages: null, pdfKey: null, pngKey: null } as never });
    const { templates, log } = service([V1, V2, broken, version({ id: 6 })], { storage });
    const read = async (result: Result<{ body: ReadableStream<Uint8Array>; fileName: string }>) =>
      result.ok ? [result.value.fileName, await new Response(result.value.body).text()] : `${result.status} ${result.error}`;
    expect(await read(await templates.previewFile(OWNER, '2', 'pdf'))).toEqual(['pishnamayesh-bijak-2.pdf', '%PDF-1.7']);
    expect(await read(await templates.previewFile(OWNER, '2', { page: 2 }))).toEqual(['pishnamayesh-2-2.png', 'png-2']);
    expect(await read(await templates.previewFile(OWNER, '2', { page: 3 }))).toBe('404 template_not_found');
    expect(await read(await templates.previewFile(OWNER, '2', { page: 0 }))).toBe('404 template_not_found');
    expect(await read(await templates.previewFile(OWNER, '4', 'pdf'))).toBe('409 template_no_preview');
    expect(await read(await templates.previewFile(OWNER, 'default-bijak', 'pdf'))).toBe('404 template_not_found');
    expect(await read(await templates.previewFile(OWNER, '6', 'pdf'))).toBe('503 storage_unavailable');
    expect(log).toHaveBeenCalledTimes(1);
    const none = service([V2], { storage: null });
    expect(await read(await none.templates.previewFile(OWNER, '2', 'pdf'))).toBe('503 storage_unavailable');
  });
});
