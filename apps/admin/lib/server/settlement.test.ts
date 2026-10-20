/**
 * تسویهٔ چاپخانه‌ها در پنل (برش ۱۰٫۳): مجوز و محدوده پیش از هر خواندن، پایهٔ سهم فقط با مبلغ، ترتیب سنجش‌ها پیش از کد تازه، فرمی که یک بار
 * نوشته شد، و نگاشت هر نتیجهٔ ذخیره‌گاه. ذخیره‌گاه ساختگی با همان قرارداد؛ قفل و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  LedgerEntry,
  LedgerInput,
  LedgerVoidInput,
  PanelScope,
  SettlementOrder,
  SettlementRange,
  SettlementStatement,
  SettlementStore,
} from '@jozveyar/db';

import type { AdminSession } from './auth';
import { fail, ok } from './result';
import { createPanelSettlement } from './settlement';

const NOW = new Date('2026-10-14T07:50:00Z'); // چهارشنبه 22 مهر 1405، ساعت 11:20 تهران
const NOOR = 'c65abc3f-2fd0-4688-b42b-5e541b47aa2b';
const FIRST = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0001';
const REQUEST = '5f0c2d9e-8a7b-4c6d-9e1f-2a3b4c5d6e7f';

function session(permissions: string[], over: Partial<AdminSession> = {}): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'maryam',
    displayName: 'مریم احمدی',
    roles: ['accountant'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
    ...over,
  };
}
const ACCOUNTANT = session(['orders.read', 'orders.money', 'reports.production', 'settlements.read', 'settlements.manage']);
const OWNER = session(['orders.read', 'orders.money', 'settlements.read', 'settlements.manage', 'partners.manage'], { userId: 'admin-0', roles: ['owner'] });
const OPERATOR = session(['orders.read', 'orders.status'], { roles: ['operator'] });
const NOOR_USER = session(['orders.read', 'reports.production', 'settlements.read'], {
  userId: 'admin-9',
  roles: ['print_partner'],
  partner: { id: NOOR, name: 'چاپ نور' },
});

const order = (orderNumber: number, over: Partial<SettlementOrder> = {}): SettlementOrder => ({
  orderNumber,
  status: 'handed_to_post',
  paidAt: NOW,
  at: NOW,
  baseRials: 2_450_000n,
  shareBp: 6_500,
  shareRials: 1_592_500n,
  ...over,
});

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: 7,
  partnerId: NOOR,
  kind: 'payment',
  amountRials: 25_000_000n,
  day: NOW,
  period: null,
  tracking: null,
  note: null,
  orderNumber: null,
  createdAt: NOW,
  createdBy: ACCOUNTANT.userId,
  createdByName: 'مریم احمدی',
  voided: null,
  ...over,
});

/** ذخیره‌گاه ساختگی با همان قرارداد: نسخه، فرم‌های نوشته‌شده، و سفارش‌هایی که روزی به هر چاپخانه سپرده شدند. */
function memory() {
  const calls: { method: string; input: unknown }[] = [];
  const state = { version: 3, entries: new Map<number, LedgerEntry>(), byRequest: new Map<string, LedgerEntry>() };
  const assigned = new Map<string, number[]>([
    [NOOR, [10027, 10029]],
    [FIRST, [10031]],
  ]);
  const statement = (partnerId: string, range: SettlementRange): SettlementStatement => ({
    partner: { id: partnerId, name: partnerId === NOOR ? 'چاپ نور' : 'چاپخانهٔ جزوه‌یار', cityName: 'مشهد', active: true, isDefault: false, shareBp: 6_500 },
    range,
    openingRials: 0n,
    handed: [order(10027)],
    cancelledAfterPrint: [order(10029, { status: 'cancelled' })],
    inFlight: [order(10040, { status: 'printing', at: null })],
    ledger: [...state.entries.values()],
    closingRials: 1_592_500n,
    balanceRials: 1_592_500n,
    version: state.version,
  });
  const store: SettlementStore = {
    overview: vi.fn(async (scope: PanelScope) => {
      calls.push({ method: 'overview', input: scope });
      return [];
    }),
    statement: vi.fn(async (scope: PanelScope, partnerId: string, range: SettlementRange) => {
      calls.push({ method: 'statement', input: { scope, partnerId, range } });
      if (scope.kind === 'partner' && scope.partnerId !== partnerId) return null;
      return partnerId === NOOR || partnerId === FIRST ? statement(partnerId, range) : null;
    }),
    adjustable: vi.fn(async (partnerId: string, orderNumber: number) => (assigned.get(partnerId)?.includes(orderNumber) ? order(orderNumber) : null)),
    entry: vi.fn(async (partnerId: string, id: number) => {
      const found = state.entries.get(id);
      return found && found.partnerId === partnerId ? found : null;
    }),
    version: vi.fn(async (partnerId: string) => (partnerId === NOOR || partnerId === FIRST ? state.version : null)),
    byRequest: vi.fn(async (requestId: string) => state.byRequest.get(requestId) ?? null),
    record: vi.fn(async (input: LedgerInput) => {
      calls.push({ method: 'record', input });
      if (input.seen !== state.version) return { ok: false as const, reason: 'changed' as const };
      const written = entry({
        id: 100 + state.entries.size,
        partnerId: input.partnerId,
        kind: input.kind,
        amountRials: input.amountRials,
        day: input.day,
        period: input.period,
        tracking: input.tracking,
        note: input.note,
        orderNumber: input.orderNumber,
        createdBy: input.event.adminUserId!,
      });
      state.entries.set(written.id, written);
      state.byRequest.set(input.requestId, written);
      state.version += 1;
      return { ok: true as const, entry: written, duplicate: false };
    }),
    voidEntry: vi.fn(async (input: LedgerVoidInput) => {
      calls.push({ method: 'voidEntry', input });
      const found = state.entries.get(input.id)!;
      const voided = { ...found, voided: { at: input.at, by: input.event.adminUserId!, byName: 'مریم احمدی', reason: input.reason } };
      state.entries.set(found.id, voided);
      state.version += 1;
      return { ok: true as const, entry: voided, already: false };
    }),
    unsetShares: vi.fn(async () => [{ id: FIRST, name: 'چاپخانهٔ جزوه‌یار' }]),
  };
  return { store, calls, state };
}

function service() {
  const mem = memory();
  const codes: unknown[] = [];
  const stepUp = vi.fn(async (_session: AdminSession, code: unknown) => {
    codes.push(code);
    return code === '123456' ? ok(true as const) : fail(400, 'wrong_code');
  });
  return { ...mem, codes, stepUp, settlement: createPanelSettlement({ store: mem.store, stepUp, secret: 's'.repeat(32), now: () => NOW }) };
}

const PAYMENT = {
  amount: '2,500,000',
  day: '1405/07/21',
  periodFrom: '1405/07/01',
  periodTo: '1405/07/15',
  tracking: '803114',
  note: 'کارت به کارت',
  seen: '3',
  request: REQUEST,
  code: '123456',
};

describe('مجوز و محدوده (سؤال ۳۹۹)', () => {
  it('متصدی هیچ؛ ذخیره‌گاه صدا زده نمی‌شود', async () => {
    const { settlement, calls, store } = service();
    for (const result of [
      await settlement.overview(OPERATOR),
      await settlement.view(OPERATOR, NOOR, {}),
      await settlement.recordPayment(OPERATOR, NOOR, PAYMENT, 'ip'),
      await settlement.voidEntry(OPERATOR, NOOR, '7', { reason: 'x', seen: '3', code: '123456' }, 'ip'),
      await settlement.document(OPERATOR, { p: NOOR }),
    ]) {
      expect(result).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    }
    expect(calls).toEqual([]);
    expect(store.byRequest).not.toHaveBeenCalled();
    expect(await settlement.unsetShares(OPERATOR)).toBeNull();
    expect(await settlement.unsetShares(ACCOUNTANT)).toBeNull();
    expect(await settlement.unsetShares(OWNER)).toEqual([{ id: FIRST, name: 'چاپخانهٔ جزوه‌یار' }]);
  });

  it('کاربر چاپخانه: فقط خودش، با محدودهٔ خودش در کوئری، بی پایهٔ سهم و بی ثبت؛ چاپخانهٔ دیگر «نیست»', async () => {
    const { settlement, calls } = service();
    const own = await settlement.view(NOOR_USER, NOOR, {});
    if (!own.ok) throw new Error(own.error);
    expect(calls.at(-1)).toMatchObject({ method: 'statement', input: { scope: { kind: 'partner', partnerId: NOOR }, partnerId: NOOR } });
    expect(own.value).toMatchObject({ money: false, canManage: false, canShare: false });
    expect([...own.value.statement.handed, ...own.value.statement.cancelledAfterPrint, ...own.value.statement.inFlight].map((o) => o.baseRials)).toEqual([
      null,
      null,
      null,
    ]);
    expect(own.value.statement.handed[0]!.shareRials).toBe(1_592_500n);
    const before = calls.length;
    expect(await settlement.view(NOOR_USER, FIRST, {})).toMatchObject({ status: 404, error: 'partner_not_found' });
    expect(calls.length).toBe(before);
    expect(await settlement.recordPayment(NOOR_USER, NOOR, PAYMENT, 'ip')).toMatchObject({ status: 403 });
    await settlement.overview(NOOR_USER);
    expect(calls.at(-1)).toEqual({ method: 'overview', input: { kind: 'partner', partnerId: NOOR } });
  });

  it('حسابدار: همه با پایهٔ سهم و فرم‌ها؛ درصد نه (فقط مالک)؛ شناسهٔ نادرست «نیست»', async () => {
    const { settlement, calls } = service();
    const view = await settlement.view(ACCOUNTANT, NOOR, { d: 'last' });
    if (!view.ok) throw new Error(view.error);
    expect(view.value).toMatchObject({ money: true, canManage: true, canShare: false, query: { chip: 'last' } });
    expect(view.value.statement.handed[0]!.baseRials).toBe(2_450_000n);
    expect((await settlement.view(OWNER, NOOR, {})).ok && true).toBe(true);
    expect(await settlement.view(ACCOUNTANT, 'nope', {})).toMatchObject({ status: 404 });
    expect(await settlement.view(ACCOUNTANT, '2c1b3f4e-0000-4000-8000-000000000000', {})).toMatchObject({ status: 404 });
    await settlement.overview(ACCOUNTANT);
    expect(calls.at(-1)).toEqual({ method: 'overview', input: { kind: 'all' } });
  });

  it('بازهٔ خطادار: خطا زیر فیلد، و صورت‌حساب «این ماه» فقط برای سربرگ و ماندهٔ امروز؛ سند خروجی ۴۰۰', async () => {
    const { settlement, calls } = service();
    const view = await settlement.view(ACCOUNTANT, NOOR, { from: '1405/07/10', to: '1405/07/01' });
    if (!view.ok) throw new Error(view.error);
    expect(view.value).toMatchObject({ query: null, error: { field: 'to', error: 'day_order' }, form: { from: '1405/07/10', to: '1405/07/01' } });
    expect(calls.at(-1)).toMatchObject({ input: { range: { from: new Date('2026-09-22T20:30:00Z') } } });
    expect(await settlement.document(ACCOUNTANT, { p: NOOR, from: '1405/07/10', to: '1405/07/01' })).toMatchObject({ status: 400, error: 'invalid_report_range' });
  });
});

describe('ثبت پرداخت و اصلاح (سؤال ۳۹۶)', () => {
  it('هر سنجش بی کد پیش از کد: فرم، «همان که دیده شد»، کد خالی؛ بعد کد تازه و ذخیره با رویداد', async () => {
    const { settlement, codes, store } = service();
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, amount: '0' }, 'ip')).toMatchObject({
      status: 400,
      error: 'settlement_amount_invalid',
      field: 'amount',
    });
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, seen: '2' }, 'ip')).toMatchObject({ status: 409, error: 'settlement_changed' });
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, seen: 'x' }, 'ip')).toMatchObject({ status: 409, error: 'settlement_changed' });
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, request: 'nope' }, 'ip')).toMatchObject({ status: 409, error: 'settlement_changed' });
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, code: ' ' }, 'ip')).toMatchObject({
      status: 400,
      error: 'settlement_code_required',
      field: 'code',
    });
    expect(codes).toEqual([]);
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, code: '000000' }, 'ip')).toMatchObject({ error: 'wrong_code' });
    expect(store.record).not.toHaveBeenCalled();
    const done = await settlement.recordPayment(ACCOUNTANT, NOOR, PAYMENT, '1.2.3.4');
    expect(done).toEqual({ ok: true, value: { partnerId: NOOR, entryId: 100, duplicate: false } });
    const input = (store.record as ReturnType<typeof vi.fn>).mock.calls[0]![0] as LedgerInput;
    expect(input).toMatchObject({
      partnerId: NOOR,
      kind: 'payment',
      amountRials: 25_000_000n,
      day: new Date('2026-10-12T20:30:00Z'),
      period: { from: new Date('2026-09-22T20:30:00Z'), until: new Date('2026-10-07T20:30:00Z') },
      tracking: '803114',
      note: 'کارت به کارت',
      orderNumber: null,
      requestId: REQUEST,
      seen: 3,
      at: NOW,
      event: { adminUserId: ACCOUNTANT.userId, action: 'settlements.payment', targetType: 'partner', targetId: NOOR, at: NOW },
    });
    expect(input.event.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('فرستادن دوبارهٔ همان فرم با همان مقدارها پیش از «همان که دیده شد» و کد جوابش را می‌گیرد؛ همان فرم با مقدار دیگر یا ردیف دیگری «فرم کهنه»', async () => {
    const { settlement, codes, store } = service();
    await settlement.recordPayment(ACCOUNTANT, NOOR, PAYMENT, 'ip');
    expect(codes).toEqual(['123456']);
    // دو کلیک: نسخهٔ دفتر حالا ۴ است و فرم ۳ را دیده، ولی همان فرم است.
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, code: '' }, 'ip')).toEqual({
      ok: true,
      value: { partnerId: NOOR, entryId: 100, duplicate: true },
    });
    expect(codes).toEqual(['123456']);
    expect(store.record).toHaveBeenCalledTimes(1);
    // همان فرم پس از «برگشت» مرورگر با مبلغ دیگر: «ثبت شد» با مبلغ قبلی نیست. فرم خراب همان خطای فرم.
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, amount: '3,000,000', code: '' }, 'ip')).toMatchObject({
      status: 409,
      error: 'settlement_form_used',
    });
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, amount: '0', code: '' }, 'ip')).toMatchObject({
      status: 400,
      error: 'settlement_amount_invalid',
    });
    expect(store.record).toHaveBeenCalledTimes(1);
    expect(codes).toEqual(['123456']);
    expect(await settlement.recordAdjustment(ACCOUNTANT, NOOR, { amount: '1', direction: 'plus', day: '1405/07/21', order: '', reason: 'x', seen: '4', request: REQUEST, code: '' }, 'ip')).toMatchObject({
      status: 409,
      error: 'settlement_form_used',
    });
    expect(await settlement.recordPayment(OWNER, NOOR, PAYMENT, 'ip')).toMatchObject({ status: 409, error: 'settlement_form_used' });
    expect(await settlement.recordPayment(ACCOUNTANT, FIRST, PAYMENT, 'ip')).toMatchObject({ status: 409, error: 'settlement_form_used' });
  });

  it('اصلاح: به زیان منفی؛ سفارشی که مال این چاپخانه نبود پیش از کد؛ نگاشت نتیجهٔ ذخیره‌گاه', async () => {
    const { settlement, codes, store, state } = service();
    const adjustment = { amount: '50,000', direction: 'minus', day: '1405/07/21', order: '10031', reason: 'برگهٔ خراب', seen: '3', request: REQUEST, code: '123456' };
    expect(await settlement.recordAdjustment(ACCOUNTANT, NOOR, adjustment, 'ip')).toMatchObject({
      status: 400,
      error: 'settlement_order_not_found',
      field: 'order',
    });
    expect(codes).toEqual([]);
    expect(await settlement.recordAdjustment(ACCOUNTANT, NOOR, { ...adjustment, order: '10027' }, 'ip')).toMatchObject({ ok: true });
    expect((store.record as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      kind: 'adjustment',
      amountRials: -500_000n,
      period: null,
      tracking: null,
      note: 'برگهٔ خراب',
      orderNumber: 10027,
      event: { action: 'settlements.adjust' },
    });
    // ذخیره‌گاه زیر قفل «عوض شد» گفت (نوشتن هم‌زمان پس از سنجش پیش از کد).
    (store.record as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, reason: 'changed' });
    expect(await settlement.recordPayment(ACCOUNTANT, NOOR, { ...PAYMENT, request: '6a0c2d9e-8a7b-4c6d-9e1f-2a3b4c5d6e7f', seen: String(state.version) }, 'ip')).toMatchObject({
      status: 409,
      error: 'settlement_changed',
    });
    (store.record as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, reason: 'order_not_found' });
    expect(
      await settlement.recordAdjustment(ACCOUNTANT, NOOR, { ...adjustment, order: '10027', request: '7a0c2d9e-8a7b-4c6d-9e1f-2a3b4c5d6e7f', seen: String(state.version) }, 'ip'),
    ).toMatchObject({ status: 400, error: 'settlement_order_not_found', field: 'order' });
  });
});

describe('باطل کردن (سؤال ۳۹۶)', () => {
  it('ردیف همین چاپخانه، دلیل، «همان که دیده شد» و کد؛ دو کلیک همان باطل بی کد؛ باطلِ کس دیگر گفته می‌شود', async () => {
    const { settlement, codes, state } = service();
    state.entries.set(7, entry());
    const form = { reason: 'مبلغ اشتباه', seen: '3', code: '123456' };
    expect(await settlement.voidEntry(ACCOUNTANT, FIRST, '7', form, 'ip')).toMatchObject({ status: 404, error: 'settlement_entry_not_found' });
    expect(await settlement.voidEntry(ACCOUNTANT, NOOR, 'x', form, 'ip')).toMatchObject({ status: 404 });
    expect(await settlement.voidEntry(ACCOUNTANT, NOOR, '7', { ...form, reason: ' ' }, 'ip')).toMatchObject({ error: 'settlement_reason_required' });
    expect(await settlement.voidEntry(ACCOUNTANT, NOOR, '7', { ...form, seen: '2' }, 'ip')).toMatchObject({ error: 'settlement_changed' });
    expect(await settlement.voidEntry(ACCOUNTANT, NOOR, '7', { ...form, code: '' }, 'ip')).toMatchObject({ error: 'settlement_code_required' });
    expect(codes).toEqual([]);
    expect(await settlement.voidEntry(ACCOUNTANT, NOOR, '7', form, 'ip')).toEqual({ ok: true, value: { partnerId: NOOR, entryId: 7, already: false } });
    expect(await settlement.voidEntry(ACCOUNTANT, NOOR, '7', { ...form, code: '' }, 'ip')).toEqual({ ok: true, value: { partnerId: NOOR, entryId: 7, already: true } });
    expect(await settlement.voidEntry(ACCOUNTANT, NOOR, '7', { ...form, reason: 'دلیل دیگر' }, 'ip')).toMatchObject({ status: 409, error: 'settlement_already_voided' });
    expect(await settlement.voidEntry(OWNER, NOOR, '7', form, 'ip')).toMatchObject({ status: 409, error: 'settlement_already_voided' });
    expect(codes).toEqual(['123456']);
  });
});

describe('سند خروجی (سؤال ۴۰۰)', () => {
  it('حسابدار با مبلغ و بی محدوده؛ کاربر چاپخانه بی مبلغ با محدودهٔ خودش؛ چاپخانهٔ دیگر «نیست»', async () => {
    const { settlement } = service();
    const accountant = await settlement.document(ACCOUNTANT, { p: NOOR, d: 'month' });
    if (!accountant.ok) throw new Error(accountant.error);
    expect(accountant.value).toMatchObject({ money: true, printPartnerId: null, document: { title: 'صورت‌حساب تسویه', subtitle: 'چاپ نور · مشهد · مهر 1405، تا امروز' } });
    expect(accountant.value.document.detail!.columns.map((c) => c.label)).toContain('پایهٔ سهم (تومان)');
    const own = await settlement.document(NOOR_USER, { p: NOOR });
    if (!own.ok) throw new Error(own.error);
    expect(own.value).toMatchObject({ money: false, printPartnerId: NOOR });
    expect(JSON.stringify(own.value.document)).not.toContain('پایهٔ سهم');
    expect(await settlement.document(NOOR_USER, { p: FIRST })).toMatchObject({ status: 404 });
  });
});
