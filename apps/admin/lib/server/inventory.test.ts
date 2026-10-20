/**
 * موجودی کاغذ در پنل (برش ۱۰٫۴): مجوز و محدوده پیش از هر خواندن، سنجش فرم پیش از ذخیره‌گاه، کاغذهایی که هنوز پیگیری نمی‌شوند، صفحه‌های
 * ردیف‌ها، رویداد هر نوع، و نگاشت هر نتیجهٔ ذخیره‌گاه. ذخیره‌گاه ساختگی با همان قرارداد؛ قفل و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import type { InventoryStore, MoveInput, PanelScope, StockItem, ThresholdInput, TrackInput } from '@jozveyar/db';

import type { AdminSession } from './auth';
import { createPanelInventory, MOVES_PER_PAGE } from './inventory';
import { fail, ok } from './result';

const NOW = new Date('2026-10-20T07:50:00Z');
const NOOR = 'c65abc3f-2fd0-4688-b42b-5e541b47aa2b';
const FIRST = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0001';
const ITEM = '7d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6';
const OTHER_ITEM = '8e2f3a4b-5c6d-4e7f-9a01-b2c3d4e5f6a7';
const REQUEST = '5f0c2d9e-8a7b-4c6d-9e1f-2a3b4c5d6e7f';

function session(permissions: string[], over: Partial<AdminSession> = {}): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'ali',
    displayName: 'علی رضایی',
    roles: ['operator'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
    ...over,
  };
}
const OPERATOR = session(['orders.read', 'inventory.read', 'inventory.manage']);
const ACCOUNTANT = session(['orders.read', 'orders.money', 'settlements.read'], { roles: ['accountant'] });
const NOOR_USER = session(['orders.read', 'inventory.read', 'inventory.manage'], {
  userId: 'admin-9',
  roles: ['print_partner'],
  partner: { id: NOOR, name: 'چاپ نور' },
});

const item = (over: Partial<StockItem> = {}): StockItem => ({
  id: ITEM,
  partnerId: NOOR,
  paperTypeId: 'tahrir80',
  paperSize: 'a4',
  paperName: 'تحریر ۸۰ گرم',
  inTariff: true,
  balanceSheets: 1_000,
  thresholdSheets: null,
  queued: { orders: 0, sheets: 0 },
  lastMoveAt: NOW,
  createdAt: NOW,
  ...over,
});
const partner = (id = NOOR, name = 'چاپ نور') => ({ id, name, cityName: 'مشهد', active: true, isDefault: false });

/** ذخیره‌گاه ساختگی: هر صدا با ورودی‌اش ثبت می‌شود، و نتیجه‌ها از بیرون. */
function memory(over: Partial<InventoryStore> = {}) {
  const calls: { method: string; scope?: PanelScope; input?: unknown }[] = [];
  const store: InventoryStore = {
    async overview(scope) {
      calls.push({ method: 'overview', scope });
      return [{ partner: partner(), items: [item()] }];
    },
    async partner(scope, partnerId) {
      calls.push({ method: 'partner', scope, input: partnerId });
      return partnerId === NOOR ? { partner: partner(), items: [item()] } : null;
    },
    async item(scope, itemId, page) {
      calls.push({ method: 'item', scope, input: { itemId, page } });
      if (itemId !== ITEM) return null;
      return { partner: partner(), item: item(), moves: [], total: 120 };
    },
    async papers() {
      return [
        { id: 'tahrir80', name: 'تحریر ۸۰ گرم', sizes: ['a4', 'a5'] },
        { id: 'glossy', name: 'گلاسه', sizes: ['a4'] },
      ];
    },
    async track(scope, input: TrackInput) {
      calls.push({ method: 'track', scope, input });
      return { ok: true, item: item({ id: OTHER_ITEM }), duplicate: false };
    },
    async record(scope, input: MoveInput) {
      calls.push({ method: 'record', scope, input });
      return {
        ok: true,
        move: {
          id: 42,
          itemId: input.itemId,
          kind: input.kind,
          deltaSheets: 1,
          countedSheets: null,
          balanceSheets: 1,
          orderNumber: null,
          note: null,
          createdAt: NOW,
          createdBy: 'admin-1',
          createdByName: null,
          undone: false,
        },
        item: item(),
        duplicate: false,
      };
    },
    async setThreshold(scope, input: ThresholdInput) {
      calls.push({ method: 'setThreshold', scope, input });
      return { ok: true, item: item({ thresholdSheets: input.thresholdSheets }), changed: true };
    },
    async alerts(scope) {
      calls.push({ method: 'alerts', scope });
      return [];
    },
    ...over,
  };
  return { store, calls };
}

const service = (store: InventoryStore) => createPanelInventory({ store, secret: 'x'.repeat(40), now: () => NOW });
const methods = (calls: { method: string }[]) => calls.map((call) => call.method);
const move = (over: Record<string, unknown> = {}) => ({ kind: 'purchase', sheets: '500', note: '', request: REQUEST, ...over });

describe('موجودی کاغذ در پنل', () => {
  it('مجوز پیش از هر خواندن: حسابدار ۴۰۳ و ذخیره‌گاه صدا زده نمی‌شود؛ هشدار برای او null', async () => {
    const { store, calls } = memory();
    const panel = service(store);
    expect(await panel.overview(ACCOUNTANT)).toEqual(fail(403, 'forbidden'));
    expect(await panel.partner(ACCOUNTANT, NOOR)).toEqual(fail(403, 'forbidden'));
    expect(await panel.item(ACCOUNTANT, NOOR, ITEM, '1')).toEqual(fail(403, 'forbidden'));
    expect(await panel.track(ACCOUNTANT, NOOR, { paper: 'tahrir80:a5', counted: '1', threshold: '', request: REQUEST }, '1.1.1.1')).toEqual(
      fail(403, 'forbidden'),
    );
    expect(await panel.record(ACCOUNTANT, NOOR, ITEM, move(), '1.1.1.1')).toEqual(fail(403, 'forbidden'));
    expect(await panel.threshold(ACCOUNTANT, NOOR, ITEM, { threshold: '5' }, '1.1.1.1')).toEqual(fail(403, 'forbidden'));
    expect(await panel.alerts(ACCOUNTANT)).toBeNull();
    // دیدن بی ثبت: فرم‌ها ۴۰۳.
    const viewer = session(['inventory.read']);
    expect(await panel.record(viewer, NOOR, ITEM, move(), '1.1.1.1')).toEqual(fail(403, 'forbidden'));
    expect(calls).toEqual([]);
  });

  it('محدوده: کاربر چاپخانه فقط خودش؛ چاپخانه و قلم دیگر «نیست» پیش از ذخیره‌گاه، و محدودهٔ خودش در هر صدا', async () => {
    const { store, calls } = memory();
    const panel = service(store);
    expect(await panel.partner(NOOR_USER, FIRST)).toEqual(fail(404, 'stock_partner_not_found'));
    expect(await panel.item(NOOR_USER, FIRST, ITEM, '1')).toEqual(fail(404, 'stock_item_not_found'));
    expect(await panel.track(NOOR_USER, FIRST, { paper: 'tahrir80:a5', counted: '1', threshold: '', request: REQUEST }, '1.1.1.1')).toEqual(
      fail(404, 'stock_partner_not_found'),
    );
    expect(await panel.record(NOOR_USER, FIRST, ITEM, move(), '1.1.1.1')).toEqual(fail(404, 'stock_item_not_found'));
    expect(calls).toEqual([]);
    expect((await panel.overview(NOOR_USER)).ok).toBe(true);
    expect(calls[0]).toEqual({ method: 'overview', scope: { kind: 'partner', partnerId: NOOR } });
    // قلمی که مال چاپخانهٔ نشانی نیست هم «نیست»، حتی برای مالک و متصدی.
    const elsewhere = memory({
      async item() {
        return { partner: partner(FIRST, 'چاپخانهٔ جزوه‌یار'), item: item({ partnerId: FIRST }), moves: [], total: 1 };
      },
    });
    expect(await service(elsewhere.store).item(OPERATOR, NOOR, ITEM, '1')).toEqual(fail(404, 'stock_item_not_found'));
    expect(await service(elsewhere.store).record(OPERATOR, NOOR, ITEM, move(), '1.1.1.1')).toEqual(fail(404, 'stock_item_not_found'));
  });

  it('صفحهٔ چاپخانه: فقط کاغذ و اندازه‌هایی که هنوز پیگیری نمی‌شوند، و کاغذی که همهٔ اندازه‌هایش پیگیری می‌شود هیچ', async () => {
    const { store } = memory();
    const result = await service(store).partner(OPERATOR, NOOR);
    expect(result).toMatchObject({
      ok: true,
      value: {
        canManage: true,
        papers: [
          { id: 'tahrir80', name: 'تحریر ۸۰ گرم', sizes: ['a5'] },
          { id: 'glossy', name: 'گلاسه', sizes: ['a4'] },
        ],
      },
    });
    expect(await service(store).partner(OPERATOR, 'not-a-uuid')).toEqual(fail(404, 'stock_partner_not_found'));
    expect(await service(store).partner(OPERATOR, FIRST)).toEqual(fail(404, 'stock_partner_not_found'));
  });

  it('صفحهٔ قلم: ۵۰ ردیف در هر صفحه، صفحهٔ نادرست اولی، و صفحهٔ بیرون از بازه آخرین صفحه', async () => {
    const { store, calls } = memory();
    const panel = service(store);
    expect(await panel.item(OPERATOR, NOOR, ITEM, '2')).toMatchObject({ ok: true, value: { page: 2, pages: 3, now: NOW, canManage: true } });
    expect(await panel.item(OPERATOR, NOOR, ITEM, 'x')).toMatchObject({ ok: true, value: { page: 1 } });
    expect(await panel.item(OPERATOR, NOOR, ITEM, '9')).toMatchObject({ ok: true, value: { page: 3, pages: 3 } });
    const pages = calls.filter((call) => call.method === 'item').map((call) => (call.input as { page: { offset: number } }).page.offset);
    expect(pages).toEqual([MOVES_PER_PAGE, 0, 8 * MOVES_PER_PAGE, 2 * MOVES_PER_PAGE]);
    expect(await panel.item(OPERATOR, NOOR, OTHER_ITEM, '1')).toEqual(fail(404, 'stock_item_not_found'));
  });

  it('«کاغذ تازه»: فرم پیش از ذخیره‌گاه، رویداد با چاپخانه، و نگاشت هر نتیجه', async () => {
    const { store, calls } = memory();
    const panel = service(store);
    const form = { paper: 'tahrir80:a5', counted: '۲٬۵۰۰', threshold: '1000', request: REQUEST };
    expect(await panel.track(OPERATOR, NOOR, { ...form, counted: '' }, '1.1.1.1')).toEqual(fail(400, 'stock_count_invalid', { field: 'counted' }));
    expect(await panel.track(OPERATOR, NOOR, { ...form, request: 'x' }, '1.1.1.1')).toEqual(fail(409, 'stock_form_used'));
    expect(calls).toEqual([]);
    expect(await panel.track(OPERATOR, NOOR, form, '1.1.1.1')).toEqual(ok({ partnerId: NOOR, itemId: OTHER_ITEM, duplicate: false }));
    expect(calls[0]!.input).toMatchObject({
      partnerId: NOOR,
      paperTypeId: 'tahrir80',
      paperSize: 'a5',
      countedSheets: 2_500,
      thresholdSheets: 1_000,
      requestId: REQUEST,
      at: NOW,
      event: { adminUserId: 'admin-1', action: 'inventory.track', targetType: 'partner', targetId: NOOR, at: NOW },
    });
    const outcomes: [Awaited<ReturnType<InventoryStore['track']>>, ReturnType<typeof fail>][] = [
      [{ ok: false, reason: 'exists', itemId: ITEM }, fail(409, 'stock_item_exists', { field: 'paper', itemId: ITEM })],
      [{ ok: false, reason: 'paper_not_found' }, fail(400, 'stock_paper_not_found', { field: 'paper' })],
      [{ ok: false, reason: 'conflict' }, fail(409, 'stock_form_used')],
      [{ ok: false, reason: 'not_found' }, fail(404, 'stock_partner_not_found')],
    ];
    for (const [written, expected] of outcomes) {
      const { store: failing } = memory({ track: async () => written });
      expect(await service(failing).track(OPERATOR, NOOR, form, '1.1.1.1')).toEqual(expected);
    }
  });

  it('«ثبت»: فرم پیش از ذخیره‌گاه، رویداد هر نوع، محدودهٔ کاربر چاپخانه، و فرم کهنه', async () => {
    const { store, calls } = memory();
    const panel = service(store);
    expect(await panel.record(OPERATOR, NOOR, ITEM, move({ kind: 'waste' }), '1.1.1.1')).toEqual(fail(400, 'stock_note_required', { field: 'note' }));
    expect(await panel.record(OPERATOR, NOOR, ITEM, move({ request: '' }), '1.1.1.1')).toEqual(fail(409, 'stock_form_used'));
    expect(calls).toEqual([]);
    expect(await panel.record(NOOR_USER, NOOR, ITEM, move({ kind: 'count', sheets: '۹۵۰', note: 'شمارش هفتگی' }), '1.1.1.1')).toEqual(
      ok({ partnerId: NOOR, itemId: ITEM, moveId: 42, duplicate: false }),
    );
    expect(methods(calls)).toEqual(['item', 'record']);
    expect(calls[1]).toMatchObject({
      scope: { kind: 'partner', partnerId: NOOR },
      input: { itemId: ITEM, kind: 'count', sheets: 950, note: 'شمارش هفتگی', requestId: REQUEST, event: { action: 'inventory.count', targetId: NOOR } },
    });
    const { store: conflict } = memory({ record: async () => ({ ok: false, reason: 'conflict' }) });
    expect(await service(conflict).record(OPERATOR, NOOR, ITEM, move(), '1.1.1.1')).toEqual(fail(409, 'stock_form_used'));
    const { store: gone } = memory({ record: async () => ({ ok: false, reason: 'not_found' }) });
    expect(await service(gone).record(OPERATOR, NOOR, ITEM, move(), '1.1.1.1')).toEqual(fail(404, 'stock_item_not_found'));
  });

  it('آستانه: خالی بی آستانه، نادرست پیش از ذخیره‌گاه، و همان آستانه «عوض نشد»', async () => {
    const { store, calls } = memory();
    const panel = service(store);
    expect(await panel.threshold(OPERATOR, NOOR, ITEM, { threshold: 'ده' }, '1.1.1.1')).toEqual(fail(400, 'stock_threshold_invalid', { field: 'threshold' }));
    expect(calls).toEqual([]);
    expect(await panel.threshold(OPERATOR, NOOR, ITEM, { threshold: '' }, '1.1.1.1')).toEqual(ok({ partnerId: NOOR, itemId: ITEM, changed: true }));
    expect(calls[1]!.input).toMatchObject({ itemId: ITEM, thresholdSheets: null, event: { action: 'inventory.threshold' } });
    const { store: same } = memory({ setThreshold: async () => ({ ok: true, item: item(), changed: false }) });
    expect(await service(same).threshold(OPERATOR, NOOR, ITEM, { threshold: '0' }, '1.1.1.1')).toEqual(ok({ partnerId: NOOR, itemId: ITEM, changed: false }));
  });

  it('هشدار پیشخوان با محدودهٔ هر نشست', async () => {
    const { store, calls } = memory();
    expect(await service(store).alerts(NOOR_USER)).toEqual([]);
    expect(await service(store).alerts(OPERATOR)).toEqual([]);
    expect(calls.map((call) => call.scope)).toEqual([{ kind: 'partner', partnerId: NOOR }, { kind: 'all' }]);
  });
});

