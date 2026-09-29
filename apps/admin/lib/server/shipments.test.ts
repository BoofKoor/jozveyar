/**
 * سرویس زبانهٔ «ارسال» (`shipments.ts`، برش ۶٫۱ و ۶٫۲) با ذخیره‌گاه ساختگی و ساعت ساختگی: مجوز در سرور (بارگذاری، «ثبت» و «دور
 * بینداز» با `shipments.import`، صف تأیید و دادن دستی با `shipments.review`، برگرداندن و کنار گذاشتن یک کد فقط با `shipments.revert`)،
 * اندازه و نام فایل، اثر انگشت «ثبت»، دلیل‌ها، آنچه ادمین دید در فرم، محدودهٔ نشست، بی مبلغ برای چاپخانه، و رویداد با IP هش‌شده.
 * تراکنش‌ها، قفل‌ها و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import {
  POST_FILE_MAX_BYTES,
  type AdminEventInput,
  type PanelScope,
  type ReviewDecision,
  type ReviewRow,
  type ReviewWrite,
  type ShipmentCommit,
  type ShipmentCommitWrite,
  type ShipmentImportPage,
  type ShipmentImportView,
  type ShipmentOrderFacts,
  type ShipmentRevert,
  type ShipmentStore,
  type ShipmentVoid,
  type VoidWrite,
} from '@jozveyar/db';
import { barcodeOf, parcel, postTable } from '@jozveyar/db/postfile.fixtures';
import { readPostSheet } from '@jozveyar/db';

import { choiceText, seenText } from '../shipments';
import { ipHashOf, type AdminSession } from './auth';
import { choiceOf, createPanelShipments, IMPORTS_PAGE, orderNumberInput, postFileName, REVIEW_PAGE, seenOf } from './shipments';

const NOW = new Date('2026-10-05T07:50:00Z');
const SECRET = 's'.repeat(64);
const ID = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0001';
const FINGERPRINT = 'a'.repeat(64);

function session(permissions: string[], partner: AdminSession['partner'] = null): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'sara',
    displayName: 'سارا',
    roles: [partner ? 'print_partner' : 'owner'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner,
  };
}
const OWNER = session(['orders.read', 'orders.money', 'shipments.import', 'shipments.review', 'shipments.revert']);
const OPERATOR = session(['orders.read', 'orders.money', 'orders.status', 'shipments.import', 'shipments.review']);
/** از ۶٫۲ چاپخانه فایل پست خودش را می‌آورد، ولی صف تأیید، مبلغ و کنار گذاشتن ندارد. */
const PARTNER_ID = '33333333-3333-4333-8333-333333333333';
const PARTNER = session(['orders.read', 'orders.status', 'files.download', 'shipments.import'], { id: PARTNER_ID, name: 'چاپ نور' });
const ORDER_ID = '44444444-4444-4444-8444-444444444444';

const view = (over: Partial<ShipmentImportView> = {}): ShipmentImportView => ({
  id: ID,
  carrier: 'iran_post',
  filename: 'FileName-1981.xls',
  sizeBytes: 16_000,
  status: 'committed',
  format: 'html',
  errorCode: null,
  partner: null,
  createdAt: NOW,
  createdByName: 'سارا',
  readAt: NOW,
  committedAt: NOW,
  committedByName: 'سارا',
  discardedAt: null,
  discardedByName: null,
  revertedAt: null,
  revertedByName: null,
  revertReason: null,
  purgedAt: null,
  job: { status: 'done', attempts: 1, maxAttempts: 3 },
  ...over,
});

/** سفارش نامزد یا دادن دستی، «در حال چاپ» و بی کد. */
const facts = (over: Partial<ShipmentOrderFacts> = {}): ShipmentOrderFacts => ({
  id: ORDER_ID,
  orderNumber: 10014,
  status: 'printing',
  recipientName: 'سارا رضایی',
  provinceId: 8,
  cityId: 394,
  paidAt: new Date('2026-10-03T06:30:00Z'),
  provinceName: 'تهران',
  cityName: 'تهران',
  handedToPostAt: null,
  postHandoffDueAt: new Date('2026-10-05T20:30:00Z'),
  estWeightGrams: 870,
  liveShipments: 0,
  printReady: true,
  hasPartner: true,
  ...over,
});

/** کارت یک سطر صف: «رضایی 10012» تهران، ۹۱۰ گرم، با کرایه و مالیات. */
const review = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  import: { id: ID, filename: 'FileName-1981.xls', status: 'committed', createdAt: NOW, createdByName: 'سارا', committedAt: NOW, partner: null },
  row: {
    importId: ID,
    rowNo: 6,
    cells: ['6', 'x'],
    barcode: barcodeOf(6),
    orderNumber: 10012,
    nameG: 'رضایی 10012',
    destination: 'تهران',
    weightGrams: 910,
    fareRials: 1_295_000,
    taxRials: 129_500,
    postDay: new Date('2026-10-03T20:30:00Z'),
    postStatus: 'فعال',
    verdict: 'review',
    reason: 'name_mismatch',
    orderId: null,
    dismissedAt: null,
    dismissedBy: null,
    dismissedByName: null,
  },
  shipments: [],
  queued: true,
  assignable: true,
  elsewhere: null,
  numbered: null,
  candidates: { candidates: [], preselected: null },
  ...over,
});

/** ذخیره‌گاه ساختگی: هر فراخوانی با محدوده‌اش ثبت می‌شود، و پاسخ هر کار از پیش گفته می‌شود. */
function fake(
  answers: {
    commit?: ShipmentCommitWrite;
    same?: ShipmentImportView | null;
    page?: ShipmentImportPage;
    decide?: ReviewWrite;
    dismiss?: Awaited<ReturnType<ShipmentStore['dismiss']>>;
    void?: VoidWrite;
    row?: ReviewRow | null;
    order?: ShipmentOrderFacts | null;
    queueTotal?: number;
  } = {},
) {
  const calls: { method: string; scope: PanelScope; input?: unknown }[] = [];
  const store: ShipmentStore = {
    async createImport(scope, input) {
      calls.push({ method: 'createImport', scope, input });
      return answers.same !== undefined ? { ok: false, reason: 'same_file', existing: answers.same } : { ok: true, id: ID };
    },
    async listImports(scope, page) {
      calls.push({ method: 'listImports', scope, input: page });
      return Array.from({ length: Math.min(page.limit, 3) }, () => ({
        ...view(),
        counts: {},
        liveShipments: 0,
        voidedShipments: 0,
        handedOrders: 0,
        firstPostDay: null,
        lastPostDay: null,
        queuedRows: 0,
        dismissedRows: 0,
        unmatchedRows: 0,
      }));
    },
    async importPage(scope, id, now, options) {
      calls.push({ method: 'importPage', scope, input: { id, now, options } });
      return id === ID ? (answers.page ?? { kind: 'plain', import: view() }) : null;
    },
    async commit(scope, input) {
      calls.push({ method: 'commit', scope, input });
      return answers.commit ?? { ok: true, counts: { matched: 2 }, shipments: 2, handed: [10013] };
    },
    async discard(scope, input) {
      calls.push({ method: 'discard', scope, input });
      return { ok: true };
    },
    async revert(scope, input) {
      calls.push({ method: 'revert', scope, input });
      return { ok: true, voided: 2, reopened: [10013], kept: [], unqueued: 1 };
    },
    async reviewQueue(scope, page) {
      calls.push({ method: 'reviewQueue', scope, input: page });
      const total = answers.queueTotal ?? 1;
      const rows = page.offset < total ? [review()].slice(0, page.limit) : [];
      return { rows, total };
    },
    async reviewRow(scope, importId, rowNo) {
      calls.push({ method: 'reviewRow', scope, input: { importId, rowNo } });
      return answers.row === undefined ? review() : answers.row;
    },
    async orderForRow(scope, importId, orderNumber) {
      calls.push({ method: 'orderForRow', scope, input: { importId, orderNumber } });
      return answers.order === undefined ? facts({ orderNumber }) : answers.order;
    },
    async decide(scope, input) {
      calls.push({ method: 'decide', scope, input });
      return answers.decide ?? { ok: true, orderNumber: 10014, from: 'printing', handed: true };
    },
    async dismiss(scope, input) {
      calls.push({ method: 'dismiss', scope, input });
      return answers.dismiss ?? { ok: true };
    },
    async voidShipment(scope, input) {
      calls.push({ method: 'voidShipment', scope, input });
      return answers.void ?? { ok: true, orderNumber: 10014, reopened: true, kept: null };
    },
  };
  return { store, calls, service: createPanelShipments({ store, secret: SECRET, now: () => NOW }) };
}

const bytes = (n: number) => Buffer.alloc(n, 0x3c);

describe('مجوز در سرور (ADR-038، ADR-046)', () => {
  it('بی `shipments.import` نه فهرست، نه صفحهٔ ورود، نه بارگذاری، نه «ثبت» و نه «دور بینداز»؛ برگرداندن فقط با مالک', async () => {
    const { service, calls } = fake();
    for (const who of [session(['orders.read', 'orders.status', 'files.download'], { id: PARTNER_ID, name: 'چاپ نور' }), session(['orders.read'])]) {
      expect(await service.list(who, {})).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
      expect(await service.page(who, ID)).toMatchObject({ ok: false, error: 'forbidden' });
      expect(await service.upload(who, { name: 'a.xls', bytes: bytes(10) }, '1.2.3.4')).toMatchObject({ ok: false, error: 'forbidden' });
      expect(await service.commit(who, ID, { fingerprint: FINGERPRINT }, '1.2.3.4')).toMatchObject({ ok: false, error: 'forbidden' });
      expect(await service.discard(who, ID, '1.2.3.4')).toMatchObject({ ok: false, error: 'forbidden' });
    }
    expect(await service.revert(OPERATOR, ID, { reason: 'اشتباه' }, '1.2.3.4')).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    // شاهد: پیش از هر خواندنی رد شد.
    expect(calls).toEqual([]);
    expect((await service.revert(OWNER, ID, { reason: 'اشتباه' }, '1.2.3.4')).ok).toBe(true);
    // «برگرداندن این ورود» فقط برای مالک، و فقط ورود ثبت‌شده.
    expect(await service.page(OWNER, ID)).toMatchObject({ ok: true, value: { canRevert: true } });
    expect(await service.page(OPERATOR, ID)).toMatchObject({ ok: true, value: { canRevert: false } });
  });
});

describe('بارگذاری فایل پست', () => {
  it('خالی و بزرگ‌تر از ۲ مگابایت همین‌جا رد می‌شوند؛ درست به ذخیره‌گاه با نام پاکیزه، محدودهٔ نشست و رویداد', async () => {
    const { service, calls } = fake();
    expect(await service.upload(OPERATOR, null, '1.2.3.4')).toMatchObject({ ok: false, status: 400, error: 'post_file_required' });
    expect(await service.upload(OPERATOR, { name: 'a.xls', bytes: bytes(0) }, '1.2.3.4')).toMatchObject({ error: 'post_file_required' });
    expect(await service.upload(OPERATOR, { name: 'a.xls', bytes: bytes(POST_FILE_MAX_BYTES + 1) }, '1.2.3.4')).toMatchObject({
      ok: false,
      status: 413,
      error: 'post_file_too_large',
    });
    expect(calls).toEqual([]);
    const written = await service.upload(OPERATOR, { name: 'C:\\Users\\ali\\Desktop\\FileName-1981.xls', bytes: bytes(POST_FILE_MAX_BYTES) }, '1.2.3.4');
    expect(written).toEqual({ ok: true, value: { id: ID } });
    const [call] = calls;
    expect(call!.scope).toEqual({ kind: 'all' });
    const input = call!.input as { filename: string; raw: Buffer; createdBy: string; at: Date; event: AdminEventInput };
    expect(input).toMatchObject({ filename: 'FileName-1981.xls', createdBy: 'admin-1', at: NOW });
    expect(input.raw.length).toBe(POST_FILE_MAX_BYTES);
    expect(input.event).toEqual({ adminUserId: 'admin-1', action: 'shipments.upload', ipHash: ipHashOf(SECRET, '1.2.3.4'), at: NOW });
  });

  it('همان فایل: شکست با ورود قبلی، اگر در محدوده است', async () => {
    expect(await fake({ same: view() }).service.upload(OPERATOR, { name: 'a.xls', bytes: bytes(5) }, 'ip')).toMatchObject({
      ok: false,
      status: 409,
      error: 'post_file_same',
      existing: ID,
    });
    expect(await fake({ same: null }).service.upload(OPERATOR, { name: 'a.xls', bytes: bytes(5) }, 'ip')).toMatchObject({
      error: 'post_file_same',
      existing: null,
    });
  });

  it('نام فایل: بی مسیر، بی نویسهٔ کنترلی و جهت، فاصله‌ها یکی، حداکثر ۲۵۵ نویسه؛ خالی «فایل پست»', () => {
    expect(postFileName('/home/ali/FileName-1954.xls')).toBe('FileName-1954.xls');
    expect(postFileName('C:\\x\\فایل  پست\u200f\u0000.xls')).toBe('فایل پست.xls');
    expect(postFileName('   ')).toBe('فایل پست');
    expect([...postFileName(`${'پ'.repeat(300)}.xls`)]).toHaveLength(255);
  });
});

describe('«ثبت»، «دور بینداز» و برگرداندن', () => {
  it('«ثبت» با اثر انگشتی که صفحه نشان داد؛ بدشکل یا کهنه «import_changed»، ورود بسته «import_closed»', async () => {
    const { service, calls } = fake();
    expect(await service.commit(OPERATOR, ID, { fingerprint: 'x' }, 'ip')).toMatchObject({ ok: false, status: 409, error: 'import_changed' });
    expect(await service.commit(OPERATOR, 'not-a-uuid', { fingerprint: FINGERPRINT }, 'ip')).toMatchObject({ status: 404, error: 'import_not_found' });
    expect(calls).toEqual([]);
    expect(await service.commit(OPERATOR, ID, { fingerprint: FINGERPRINT }, 'ip')).toEqual({ ok: true, value: { shipments: 2, handed: [10013] } });
    expect(calls[0]!.input as ShipmentCommit).toMatchObject({ id: ID, fingerprint: FINGERPRINT, at: NOW, adminUserId: 'admin-1', event: { action: 'shipments.commit' } });

    const answers: [ShipmentCommitWrite, string][] = [
      [{ ok: false, reason: 'changed' }, 'import_changed'],
      [{ ok: false, reason: 'not_found' }, 'import_not_found'],
      [{ ok: false, reason: 'status', status: 'committed' }, 'import_closed'],
    ];
    for (const [answer, error] of answers) {
      expect(await fake({ commit: answer }).service.commit(OPERATOR, ID, { fingerprint: FINGERPRINT }, 'ip')).toMatchObject({ ok: false, error });
    }
  });

  it('برگرداندن: دلیل لازم، فارسی‌نرمال و حداکثر ۵۰۰ نویسه؛ با رویداد و مالک', async () => {
    const { service, calls } = fake();
    expect(await service.revert(OWNER, ID, { reason: '   ' }, 'ip')).toMatchObject({ ok: false, status: 400, error: 'reason_required' });
    expect(await service.revert(OWNER, ID, { reason: 'ی'.repeat(501) }, 'ip')).toMatchObject({ ok: false, error: 'reason_too_long' });
    expect(calls).toEqual([]);
    expect(await service.revert(OWNER, ID, { reason: '  فايل روز  اشتباه بود ' }, 'ip')).toEqual({
      ok: true,
      value: { voided: 2, reopened: [10013], kept: [] },
    });
    expect(calls[0]!.input as ShipmentRevert).toMatchObject({ id: ID, reason: 'فایل روز اشتباه بود', adminUserId: 'admin-1', event: { action: 'shipments.revert' } });
  });

  it('فهرست صفحه‌به‌صفحه با یکی بیشتر برای «قدیمی‌ترها»؛ صفحهٔ بدشکل یعنی اول', async () => {
    const { service, calls } = fake();
    const listed = await service.list(OPERATOR, { page: 'x' });
    expect(listed).toMatchObject({ ok: true, value: { page: 1 } });
    expect(calls[0]!.input).toEqual({ limit: IMPORTS_PAGE + 1, offset: 0 });
    await service.list(OPERATOR, { page: '3' });
    expect(calls.filter((c) => c.method === 'listImports')[1]!.input).toEqual({ limit: IMPORTS_PAGE + 1, offset: 2 * IMPORTS_PAGE });
    expect(await service.page(OPERATOR, 'x')).toMatchObject({ ok: false, status: 404, error: 'import_not_found' });
  });
});

describe('صف تأیید، دادن دستی و کنار گذاشتن یک کد (۶٫۲)', () => {
  const IP = '1.2.3.4';
  const choice = choiceText(facts());

  it('مجوز پیش از هر خواندن: صف، سطر، «همین است»، دستی و «هیچ‌کدام» با `shipments.review`؛ کنار گذاشتن فقط با `shipments.revert`', async () => {
    const { service, calls } = fake();
    const form = { importId: ID, rowNo: '6', choice };
    for (const who of [PARTNER, session(['orders.read', 'shipments.import'])]) {
      expect(await service.queue(who, {})).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
      expect(await service.row(who, ID, '6', {})).toMatchObject({ error: 'forbidden' });
      expect(await service.approve(who, form, IP)).toMatchObject({ error: 'forbidden' });
      expect(await service.assign(who, { importId: ID, rowNo: '6', order: ORDER_ID, seen: 'printing.0' }, IP)).toMatchObject({ error: 'forbidden' });
      expect(await service.dismiss(who, { importId: ID, rowNo: '6' }, IP)).toMatchObject({ error: 'forbidden' });
    }
    expect(await service.voidShipment(OPERATOR, { shipment: ORDER_ID, reason: 'اشتباه' }, IP)).toMatchObject({ status: 403, error: 'forbidden' });
    expect(calls).toEqual([]);
    // فهرست ورودها برای چاپخانه باز است، ولی شمار صف تأیید را نمی‌خواند.
    expect(await service.list(PARTNER, {})).toMatchObject({ ok: true, value: { queued: 0 } });
    expect(calls.map((c) => [c.method, c.scope])).toEqual([['listImports', { kind: 'partner', partnerId: PARTNER_ID }]]);
    expect(await service.list(OPERATOR, {})).toMatchObject({ ok: true, value: { queued: 1 } });
    expect(calls.at(-1)).toMatchObject({ method: 'reviewQueue', scope: { kind: 'all' }, input: { limit: 0, offset: 0 } });
  });

  it('«همین است»: نامزد و آنچه ادمین از آن دید از فرم؛ بدشکل «choice_required» بی رفتن به پایگاه داده؛ رویداد با IP هش‌شده', async () => {
    const { service, calls } = fake();
    for (const bad of ['', 'other', `${ORDER_ID}.printing`, `${ORDER_ID}.flying.0`, `${ORDER_ID}.printing.x`, `x${choice}`]) {
      expect(await service.approve(OPERATOR, { importId: ID, rowNo: '6', choice: bad }, IP), bad).toMatchObject({ status: 400, error: 'choice_required' });
    }
    expect(await service.approve(OPERATOR, { importId: 'x', rowNo: '6', choice }, IP)).toMatchObject({ status: 404, error: 'row_not_found' });
    expect(await service.approve(OPERATOR, { importId: ID, rowNo: '0', choice }, IP)).toMatchObject({ status: 404, error: 'row_not_found' });
    expect(calls).toEqual([]);
    expect(await service.approve(OPERATOR, { importId: ID, rowNo: '6', choice }, IP)).toEqual({
      ok: true,
      value: { orderNumber: 10014, from: 'printing', handed: true },
    });
    const input = calls[0]!.input as ReviewDecision;
    expect(input).toEqual({
      importId: ID,
      rowNo: 6,
      orderId: ORDER_ID,
      via: 'review',
      seen: { status: 'printing', liveShipments: 0 },
      at: NOW,
      adminUserId: 'admin-1',
      event: { adminUserId: 'admin-1', action: 'shipments.approve', ipHash: ipHashOf(SECRET, IP), at: NOW },
    });
    expect(choiceOf(choice)).toEqual({ orderId: ORDER_ID, seen: { status: 'printing', liveShipments: 0 } });
    expect(seenOf(seenText(facts({ status: 'handed_to_post', liveShipments: 2 })))).toEqual({ status: 'handed_to_post', liveShipments: 2 });
  });

  it('هر شکست ذخیره‌گاه با کد پنل خودش؛ بسته بودن با دلیلش', async () => {
    const answers: [ReviewWrite, number, string][] = [
      [{ ok: false, reason: 'not_found' }, 404, 'row_not_found'],
      [{ ok: false, reason: 'row_closed' }, 409, 'row_closed'],
      [{ ok: false, reason: 'order_not_found' }, 404, 'order_not_found'],
      [{ ok: false, reason: 'changed' }, 409, 'shipment_order_changed'],
      [{ ok: false, reason: 'blocked', block: 'cancelled' }, 409, 'blocked_cancelled'],
      [{ ok: false, reason: 'blocked', block: 'before_payment' }, 409, 'blocked_before_payment'],
      [{ ok: false, reason: 'blocked', block: 'needs_partner' }, 409, 'blocked_needs_partner'],
      [{ ok: false, reason: 'blocked', block: 'needs_print' }, 409, 'blocked_needs_print'],
      [{ ok: false, reason: 'blocked', block: 'barcode_elsewhere' }, 409, 'barcode_elsewhere'],
    ];
    for (const [answer, status, error] of answers) {
      const { service } = fake({ decide: answer });
      expect(await service.approve(OPERATOR, { importId: ID, rowNo: '6', choice }, IP), error).toMatchObject({ ok: false, status, error });
      expect(await service.assign(OPERATOR, { importId: ID, rowNo: '6', order: ORDER_ID, seen: 'printing.0' }, IP), error).toMatchObject({ ok: false, status, error });
    }
    expect(await fake({ dismiss: { ok: false, reason: 'not_found' } }).service.dismiss(OPERATOR, { importId: ID, rowNo: '6' }, IP)).toMatchObject({ status: 404, error: 'row_not_found' });
    expect(await fake({ dismiss: { ok: false, reason: 'row_closed' } }).service.dismiss(OPERATOR, { importId: ID, rowNo: '6' }, IP)).toMatchObject({ status: 409, error: 'row_closed' });
  });

  it('دادن دستی از همان که ادمین دید، با رویداد خودش؛ «هیچ‌کدام» بی دلیل با رویداد خودش', async () => {
    const { service, calls } = fake();
    expect(await service.assign(OPERATOR, { importId: ID, rowNo: '6', order: 'x', seen: 'printing.0' }, IP)).toMatchObject({ status: 400, error: 'choice_required' });
    expect(await service.assign(OPERATOR, { importId: ID, rowNo: '6', order: ORDER_ID, seen: 'printing' }, IP)).toMatchObject({ error: 'choice_required' });
    expect(calls).toEqual([]);
    expect((await service.assign(OPERATOR, { importId: ID, rowNo: '6', order: ORDER_ID, seen: 'handed_to_post.1' }, IP)).ok).toBe(true);
    expect(calls[0]!.input).toMatchObject({ via: 'manual', orderId: ORDER_ID, seen: { status: 'handed_to_post', liveShipments: 1 }, event: { action: 'shipments.assign' } });
    expect(await service.dismiss(OPERATOR, { importId: ID, rowNo: '6' }, IP)).toEqual({ ok: true, value: true });
    expect(calls[1]).toMatchObject({ method: 'dismiss', input: { importId: ID, rowNo: 6, at: NOW, event: { action: 'shipments.dismiss', ipHash: ipHashOf(SECRET, IP) } } });
  });

  it('کنار گذاشتن یک کد: دلیل لازم و فارسی‌نرمال، با رویداد؛ کدی که نیست یا کنار رفته', async () => {
    const { service, calls } = fake();
    expect(await service.voidShipment(OWNER, { shipment: ORDER_ID, reason: '  ' }, IP)).toMatchObject({ status: 400, error: 'reason_required' });
    expect(await service.voidShipment(OWNER, { shipment: ORDER_ID, reason: 'ی'.repeat(501) }, IP)).toMatchObject({ error: 'reason_too_long' });
    expect(await service.voidShipment(OWNER, { shipment: 'x', reason: 'اشتباه' }, IP)).toMatchObject({ status: 404, error: 'shipment_not_found' });
    expect(calls).toEqual([]);
    expect(await service.voidShipment(OWNER, { shipment: ORDER_ID, reason: ' كد مال سفارش ديگري بود ' }, IP)).toEqual({
      ok: true,
      value: { orderNumber: 10014, reopened: true, kept: null },
    });
    expect(calls[0]!.input as ShipmentVoid).toMatchObject({ shipmentId: ORDER_ID, reason: 'کد مال سفارش دیگری بود', event: { action: 'shipments.void' } });
    expect(await fake({ void: { ok: false, reason: 'not_found' } }).service.voidShipment(OWNER, { shipment: ORDER_ID, reason: 'x' }, IP)).toMatchObject({ status: 404, error: 'shipment_not_found' });
    expect(await fake({ void: { ok: false, reason: 'already_voided' } }).service.voidShipment(OWNER, { shipment: ORDER_ID, reason: 'x' }, IP)).toMatchObject({ status: 409, error: 'shipment_voided' });
  });

  it('صفحهٔ سطر: قدم دوم دادن دستی با معیارها و دروازه‌ها؛ شمارهٔ بدشکل، پیدا نشد، پرداخت‌نشده، و سطری که دادنی نیست', async () => {
    const { service, calls } = fake();
    expect(await service.row(OPERATOR, ID, '6', {})).toMatchObject({ ok: true, value: { manual: null, manualError: null } });
    expect(await service.row(OPERATOR, ID, '6', { order: '۱۰۰۱۴' })).toMatchObject({
      ok: true,
      value: { manual: { kind: 'order', order: { orderNumber: 10014 }, block: null, voidedHere: false, criteria: { number: 'no', surname: 'yes', city: 'yes', weight: 'yes' } } },
    });
    expect(calls.at(-1)).toMatchObject({ method: 'orderForRow', input: { importId: ID, orderNumber: 10014 } });
    expect(await service.row(OPERATOR, ID, '6', { order: '6103' })).toMatchObject({ value: { manual: null, manualError: 'order_number_invalid' } });
    expect(await fake({ order: null }).service.row(OPERATOR, ID, '6', { order: '10099' })).toMatchObject({ value: { manual: { kind: 'missing', orderNumber: 10099 } } });
    expect(await fake({ order: facts({ status: 'awaiting_payment' }) }).service.row(OPERATOR, ID, '6', { order: '10014' })).toMatchObject({
      value: { manual: { kind: 'missing' } },
    });
    expect(await fake({ order: facts({ status: 'cancelled' }) }).service.row(OPERATOR, ID, '6', { order: '10014' })).toMatchObject({
      value: { manual: { kind: 'order', block: 'cancelled' } },
    });
    const voided = review({ shipments: [{ id: 's', rowNo: 6, orderId: ORDER_ID, orderNumber: 10014, barcode: barcodeOf(6), handedOrder: true, matchedBy: 'review', adminName: 'علی', createdAt: NOW, voidedAt: NOW, voidedByName: 'سارا', voidReason: 'x' }] });
    expect(await fake({ row: voided }).service.row(OPERATOR, ID, '6', { order: '10014' })).toMatchObject({ value: { manual: { voidedHere: true } } });
    // سطری که دادنی نیست (کد زنده دارد) شماره را نمی‌خواند؛ سطری که نیست همان ۴۰۴.
    const closed = fake({ row: review({ assignable: false, queued: false }) });
    expect(await closed.service.row(OPERATOR, ID, '6', { order: '10014' })).toMatchObject({ value: { manual: null } });
    expect(closed.calls.map((c) => c.method)).toEqual(['reviewRow']);
    expect(await fake({ row: null }).service.row(OPERATOR, ID, '6', {})).toMatchObject({ ok: false, status: 404, error: 'row_not_found' });
    expect(await service.row(OPERATOR, 'x', '6', {})).toMatchObject({ error: 'row_not_found' });
    expect([orderNumberInput(' ۱۰,۰۱۴ '), orderNumberInput('10000'), orderNumberInput('abc'), orderNumberInput('1234567890')]).toEqual([10014, null, null, null]);
  });

  it('صف صفحه‌به‌صفحه؛ صفحهٔ پس از آخر یعنی آخر', async () => {
    const { service, calls } = fake({ queueTotal: REVIEW_PAGE + 1 });
    expect(await service.queue(OPERATOR, { page: '2' })).toMatchObject({ ok: true, value: { page: 2, pages: 2, total: REVIEW_PAGE + 1 } });
    expect(calls.at(-1)!.input).toEqual({ limit: REVIEW_PAGE, offset: REVIEW_PAGE });
    expect(await service.queue(OPERATOR, { page: '9' })).toMatchObject({ ok: true, value: { page: 2, pages: 2 } });
    expect(calls.slice(-2).map((c) => c.input)).toEqual([
      { limit: REVIEW_PAGE, offset: 8 * REVIEW_PAGE },
      { limit: REVIEW_PAGE, offset: REVIEW_PAGE },
    ]);
  });

  it('بی `orders.money` (چاپخانه) کرایه، مالیات و خانه‌های خام فایل از سرویس بیرون نمی‌آیند؛ نامزدها فقط با `shipments.review`', async () => {
    const sheet = readPostSheet([postTable([parcel(1, barcodeOf(1), 'کاظمی 10022', 'مشهد', 760, 1_295_000)])]);
    if (!sheet.ok) throw new Error('sheet');
    const page: ShipmentImportPage = {
      kind: 'preview',
      import: view({ status: 'read', partner: { id: PARTNER_ID, name: 'چاپ نور' } }),
      preview: { sheet, judged: [], orders: [], live: [], fingerprint: FINGERPRINT, candidates: {} },
    };
    const { service, calls } = fake({ page });
    const seen = await service.page(PARTNER, ID);
    if (!seen.ok || seen.value.kind !== 'preview' || !seen.value.preview.sheet.ok) throw new Error('preview');
    const rows = seen.value.preview.sheet.rows;
    expect(rows.map((r) => [r.fareRials, r.taxRials, r.totalRials, r.cells])).toEqual([[null, null, null, []]]);
    expect(seen.value.preview.sheet.sums).toMatchObject({ fareRials: 0, taxRials: 0, weightGrams: 760, parcels: 1 });
    expect(seen.value).toMatchObject({ money: false, canReview: false, canRevert: false });
    expect(calls[0]).toMatchObject({ scope: { kind: 'partner', partnerId: PARTNER_ID }, input: { options: { candidates: false } } });
    const staff = await fake({ page }).service.page(OPERATOR, ID);
    expect(staff.ok && staff.value.kind === 'preview' && staff.value.preview.sheet.ok && staff.value.preview.sheet.rows[0]!.fareRials).toBe(1_295_000);
    // سرویس هم برای نشستی که صف دارد ولی مبلغ ندارد، کارت بی کرایه.
    const reviewer = session(['orders.read', 'shipments.import', 'shipments.review']);
    const card = await fake().service.queue(reviewer, {});
    expect(card.ok && card.value.rows.map((r) => [r.row.fareRials, r.row.taxRials, r.row.cells])).toEqual([[null, null, null]]);
    const one = await fake().service.row(reviewer, ID, '6', {});
    expect(one.ok && [one.value.review.row.fareRials, one.value.money]).toEqual([null, false]);
  });
});
