/**
 * سرویس زبانهٔ «ارسال» (`shipments.ts`، برش ۶٫۱) با ذخیره‌گاه ساختگی و ساعت ساختگی: مجوز در سرور (بارگذاری، «ثبت» و «دور بینداز»
 * با `shipments.import`، برگرداندن فقط با `shipments.revert`)، اندازه و نام فایل، اثر انگشت «ثبت»، دلیل برگرداندن، محدودهٔ نشست، و
 * رویداد با IP هش‌شده. تراکنش‌ها، قفل‌ها و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import {
  POST_FILE_MAX_BYTES,
  type AdminEventInput,
  type PanelScope,
  type ShipmentCommit,
  type ShipmentCommitWrite,
  type ShipmentImportView,
  type ShipmentRevert,
  type ShipmentStore,
} from '@jozveyar/db';

import { ipHashOf, type AdminSession } from './auth';
import { createPanelShipments, IMPORTS_PAGE, postFileName } from './shipments';

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
const OWNER = session(['orders.read', 'shipments.import', 'shipments.revert']);
const OPERATOR = session(['orders.read', 'orders.status', 'shipments.import']);
const PARTNER = session(['orders.read', 'orders.status', 'files.download'], { id: 'partner-noor', name: 'چاپ نور' });

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

/** ذخیره‌گاه ساختگی: هر فراخوانی با محدوده‌اش ثبت می‌شود، و پاسخ هر کار از پیش گفته می‌شود. */
function fake(answers: { commit?: ShipmentCommitWrite; same?: ShipmentImportView | null } = {}) {
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
      }));
    },
    async importPage(scope, id, now) {
      calls.push({ method: 'importPage', scope, input: { id, now } });
      return id === ID ? { kind: 'plain', import: view() } : null;
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
      return { ok: true, voided: 2, reopened: [10013], kept: [] };
    },
  };
  return { store, calls, service: createPanelShipments({ store, secret: SECRET, now: () => NOW }) };
}

const bytes = (n: number) => Buffer.alloc(n, 0x3c);

describe('مجوز در سرور (ADR-038، ADR-046)', () => {
  it('بی `shipments.import` نه فهرست، نه صفحهٔ ورود، نه بارگذاری، نه «ثبت» و نه «دور بینداز»؛ برگرداندن فقط با مالک', async () => {
    const { service, calls } = fake();
    for (const who of [PARTNER, session(['orders.read'])]) {
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
    expect(calls[1]!.input).toEqual({ limit: IMPORTS_PAGE + 1, offset: 2 * IMPORTS_PAGE });
    expect(await service.page(OPERATOR, 'x')).toMatchObject({ ok: false, status: 404, error: 'import_not_found' });
  });
});
