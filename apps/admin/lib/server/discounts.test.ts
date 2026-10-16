/**
 * سرویس «تخفیف‌ها»ی پنل (`discounts.ts`، برش ۱۱٫۴) با ذخیره‌گاه حافظه‌ای و کد تازهٔ ساختگی: مجوز در سرور (دیدن مالک و حسابدار، ساختن و
 * عوض کردن فقط مالک)، کد تازه پس از هر سنجشی که بی کد جواب دارد و هرگز برای خاموش کردن تنها، کد خالی بی `stepUp`، «همان که دیده شد»، شرط
 * منجمد پیش از کد، و رویداد با هدف `discount`. قفل و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import {
  FROZEN_TERMS,
  type AdminEventInput,
  type DiscountCodeInput,
  type DiscountCodeRow,
  type DiscountCodeView,
  type DiscountOrderView,
  type DiscountStore,
} from '@jozveyar/db';

import { discountFormFrom, type DiscountForm } from '../discounts';
import { ipHashOf, type AdminSession } from './auth';
import { createPanelDiscounts } from './discounts';
import { fail, ok, type Result } from './result';

const NOW = new Date('2026-10-16T08:00:00Z');
const SECRET = 's'.repeat(64);
const IP = '203.0.113.7';
const MEHR = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0001';
const MISSING = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0099';
const GOOD_CODE = '123456';

function session(roles: string[], permissions: string[]): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'sara',
    displayName: 'سارا',
    roles,
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
  };
}
const OWNER = session(['owner'], ['discounts.manage', 'discounts.read', 'tariff.read']);
const ACCOUNTANT = session(['accountant'], ['discounts.read', 'orders.read', 'orders.money']);
const OPERATOR = session(['operator'], ['orders.read', 'tariff.read']);

const ROW: DiscountCodeRow = {
  id: MEHR,
  code: 'MEHR1405',
  kind: 'percent',
  percent: 20,
  maxDiscountRials: 500_000,
  amountRials: null,
  minOrderRials: 3_000_000,
  validFrom: null,
  validUntil: null,
  totalLimit: 100,
  perCustomerLimit: 1,
  enabled: true,
  note: 'کمپین مهر',
  createdBy: 'admin-1',
  createdAt: new Date('2026-10-15T08:00:00Z'),
  updatedAt: new Date('2026-10-15T08:00:00Z'),
};

/** ذخیره‌گاه با همان قرارداد نسخهٔ پستگرس: متن یکتا، «همان که دیده شد»، شرط منجمد پس از اولین سفارش، و بی تغییر بی رویداد. */
function memoryDiscounts(options: { orders?: DiscountOrderView[]; frozenRace?: boolean } = {}) {
  const rows = new Map<string, DiscountCodeRow>([[MEHR, { ...ROW }]]);
  const orders = options.orders ?? [];
  const events: AdminEventInput[] = [];
  const calls: string[] = [];
  const view = (row: DiscountCodeRow): DiscountCodeView => ({ ...row, createdByName: 'سارا', used: orders.length, reserved: 0 });
  let clock = NOW.getTime();
  const store: DiscountStore = {
    async list() {
      return [...rows.values()].map(view);
    },
    async find(id) {
      const row = rows.get(id);
      return row ? view(row) : null;
    },
    async codeTaken(code) {
      return [...rows.values()].some((row) => row.code === code);
    },
    async ordersOf(id) {
      calls.push('ordersOf');
      return id === MEHR ? orders : [];
    },
    async create({ code, terms, createdBy, event }) {
      calls.push('create');
      if ([...rows.values()].some((row) => row.code === code)) return { ok: false, reason: 'code_taken' };
      const row: DiscountCodeRow = { id: 'new-id', code, ...terms, createdBy, createdAt: event.at, updatedAt: event.at };
      rows.set(row.id, row);
      events.push({ ...event, targetId: row.id });
      return { ok: true, code: row };
    },
    async update({ id, seenUpdatedAt, terms, event }) {
      calls.push('update');
      const row = rows.get(id);
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.updatedAt.getTime() !== seenUpdatedAt.getTime()) return { ok: false, reason: 'changed' };
      const same = (key: keyof DiscountCodeInput) => {
        const a = row[key];
        const b = terms[key];
        return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
      };
      const changed = (Object.keys(terms) as (keyof DiscountCodeInput)[]).filter((key) => !same(key));
      if (changed.length === 0) return { ok: true, code: row };
      if ((options.frozenRace || orders.length > 0) && changed.some((key) => (FROZEN_TERMS as readonly string[]).includes(key))) {
        return { ok: false, reason: 'terms_frozen' };
      }
      clock += 1000;
      const updated = { ...row, ...terms, updatedAt: new Date(clock) };
      rows.set(id, updated);
      events.push({ ...event, targetId: id, detail: { ...(event.detail as object), changed } });
      return { ok: true, code: updated };
    },
  };
  return { store, rows, events, calls };
}

function setup(options: Parameters<typeof memoryDiscounts>[0] = {}) {
  const memory = memoryDiscounts(options);
  const stepUps: unknown[] = [];
  const discounts = createPanelDiscounts({
    store: memory.store,
    secret: SECRET,
    now: () => NOW,
    async stepUp(_session, code): Promise<Result<true>> {
      stepUps.push(code);
      return code === GOOD_CODE ? ok(true) : fail(400, 'wrong_code');
    },
  });
  return { ...memory, discounts, stepUps };
}

/** فیلدهای فرم HTML از یک فرم؛ تیک خاموش نمی‌آید. */
const entriesOf = (values: DiscountForm): [string, string][] =>
  Object.entries(values).flatMap(([key, value]): [string, string][] =>
    key === 'enabled' ? (value ? [['enabled', '1']] : []) : [[key, String(value)]],
  );

const NEW_FORM: DiscountForm = {
  discount: 'welcome',
  kind: 'fixed',
  percent: '',
  max: '',
  amount: '20,000',
  minOrder: '',
  from: '',
  until: '',
  total: '',
  perCustomer: '1',
  enabled: true,
  note: '',
};

const seenOf = (row: DiscountCodeRow) => String(row.updatedAt.getTime());

describe('دیدن کدها (۱۱٫۴)', () => {
  it('مالک و حسابدار می‌بینند، فقط مالک ویرایش؛ متصدی ۴۰۳', async () => {
    const { discounts } = setup();
    const owner = await discounts.list(OWNER);
    expect(owner.ok && owner.value.canManage).toBe(true);
    expect(owner.ok && owner.value.codes.map((code) => code.code)).toEqual(['MEHR1405']);
    const accountant = await discounts.list(ACCOUNTANT);
    expect(accountant.ok && accountant.value.canManage).toBe(false);
    expect(await discounts.list(OPERATOR)).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    expect(await discounts.page(OPERATOR, MEHR)).toMatchObject({ ok: false, status: 403 });
  });

  it('صفحهٔ کد با سفارش‌هایش؛ شناسهٔ نادرست یا ناموجود ۴۰۴', async () => {
    const order: DiscountOrderView = {
      orderNumber: 10027,
      status: 'paid',
      createdAt: NOW,
      paidAt: NOW,
      discountRials: 500_000,
      totalRials: 3_450_000,
    };
    const { discounts } = setup({ orders: [order] });
    const page = await discounts.page(ACCOUNTANT, MEHR);
    expect(page.ok && page.value.orders).toEqual([order]);
    expect(await discounts.page(OWNER, 'not-a-uuid')).toMatchObject({ ok: false, status: 404, error: 'discount_not_found' });
    expect(await discounts.page(OWNER, MISSING)).toMatchObject({ ok: false, status: 404, error: 'discount_not_found' });
  });
});

describe('«کد تازه» (۱۱٫۴، سؤال‌های ۲۹۸ و ۳۰۲)', () => {
  it('حسابدار نمی‌سازد، پیش از هر سنجش و هر کد', async () => {
    const { discounts, stepUps, calls } = setup();
    expect(await discounts.create(ACCOUNTANT, { entries: entriesOf(NEW_FORM), code: GOOD_CODE }, IP)).toMatchObject({ status: 403 });
    expect(stepUps).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('خطای فرم با جایش و بی کد تازه (کد هدر نمی‌رود)', async () => {
    const { discounts, stepUps } = setup();
    const result = await discounts.create(OWNER, { entries: entriesOf({ ...NEW_FORM, amount: '' }), code: GOOD_CODE }, IP);
    expect(result).toMatchObject({ ok: false, status: 400, error: 'discount_amount', field: 'amount' });
    expect(stepUps).toEqual([]);
  });

  it('کد خالی «لازم است»، بی `stepUp` (اشتباه شمرده نمی‌شود)؛ کد نادرست همان خطای کد', async () => {
    const { discounts, stepUps, calls } = setup();
    expect(await discounts.create(OWNER, { entries: entriesOf(NEW_FORM), code: '  ' }, IP)).toMatchObject({
      error: 'discount_code_required',
      field: 'code',
    });
    expect(stepUps).toEqual([]);
    expect(await discounts.create(OWNER, { entries: entriesOf(NEW_FORM), code: '000000' }, IP)).toMatchObject({ error: 'wrong_code' });
    expect(stepUps).toEqual(['000000']);
    expect(calls).toEqual([]);
  });

  it('ساخته می‌شود با کد یکدست و رویداد `discounts.create` (هدف، IP هش‌شده، متن کد، بی مبلغ)', async () => {
    const { discounts, rows, events } = setup();
    const result = await discounts.create(OWNER, { entries: entriesOf(NEW_FORM), code: GOOD_CODE }, IP);
    expect(result).toEqual({ ok: true, value: { id: 'new-id' } });
    expect(rows.get('new-id')).toMatchObject({ code: 'WELCOME', kind: 'fixed', amountRials: 200_000, createdBy: 'admin-1' });
    expect(events).toEqual([
      {
        adminUserId: 'admin-1',
        action: 'discounts.create',
        targetType: 'discount',
        targetId: 'new-id',
        ipHash: ipHashOf(SECRET, IP),
        at: NOW,
        detail: { code: 'WELCOME' },
      },
    ]);
  });

  it('متن تکراری زیر فیلد کد، پیش از کد تازه؛ و اگر هم‌زمان ساخته شد، ذخیره‌گاه زیر تراکنش', async () => {
    const { discounts, stepUps, store } = setup();
    const result = await discounts.create(OWNER, { entries: entriesOf({ ...NEW_FORM, discount: 'mehr-1405' }), code: GOOD_CODE }, IP);
    expect(result).toMatchObject({ ok: false, status: 400, error: 'discount_code_taken', field: 'discount' });
    expect(stepUps).toEqual([]);
    store.codeTaken = async () => false;
    const raced = await discounts.create(OWNER, { entries: entriesOf({ ...NEW_FORM, discount: 'mehr-1405' }), code: GOOD_CODE }, IP);
    expect(raced).toMatchObject({ ok: false, error: 'discount_code_taken', field: 'discount' });
    expect(stepUps).toEqual([GOOD_CODE]);
  });
});

describe('ویرایش و خاموش کردن (۱۱٫۴، سؤال ۳۰۲)', () => {
  const edit = (over: Partial<DiscountForm> = {}) => entriesOf({ ...discountFormFrom(ROW), ...over });

  it('فرم کهنه پیش از کد تازه', async () => {
    const { discounts, stepUps } = setup();
    const result = await discounts.update(OWNER, MEHR, { entries: edit({ note: 'تازه' }), code: GOOD_CODE, seen: '1' }, IP);
    expect(result).toMatchObject({ ok: false, status: 409, error: 'discount_changed' });
    expect(stepUps).toEqual([]);
  });

  it('خاموش کردن تنها بی کد تازه، با رویداد «خاموش»', async () => {
    const { discounts, stepUps, rows, events } = setup();
    const result = await discounts.update(OWNER, MEHR, { entries: edit({ enabled: false }), code: '', seen: seenOf(ROW) }, IP);
    expect(result).toEqual({ ok: true, value: { changed: true } });
    expect(stepUps).toEqual([]);
    expect(rows.get(MEHR)?.enabled).toBe(false);
    expect(events.map((event) => event.detail)).toEqual([{ code: 'MEHR1405', enabled: false, changed: ['enabled'] }]);
  });

  it('هر تغییر دیگر کد تازه می‌خواهد: خالی «لازم است»، درست ذخیره', async () => {
    const { discounts, stepUps, rows, events } = setup();
    const input = { entries: edit({ note: 'کانال تلگرام', total: '200' }), seen: seenOf(ROW) };
    expect(await discounts.update(OWNER, MEHR, { ...input, code: '' }, IP)).toMatchObject({ error: 'discount_code_required', field: 'code' });
    expect(stepUps).toEqual([]);
    expect(await discounts.update(OWNER, MEHR, { ...input, code: GOOD_CODE }, IP)).toEqual({ ok: true, value: { changed: true } });
    expect(stepUps).toEqual([GOOD_CODE]);
    expect(rows.get(MEHR)).toMatchObject({ note: 'کانال تلگرام', totalLimit: 200 });
    expect(events.map((event) => event.detail)).toEqual([{ code: 'MEHR1405', enabled: true, changed: ['totalLimit', 'note'] }]);
  });

  it('روشن کردن دوباره هم کد تازه می‌خواهد', async () => {
    const { discounts, stepUps, rows } = setup();
    rows.set(MEHR, { ...ROW, enabled: false });
    const input = { entries: edit({ enabled: true }), seen: seenOf(ROW) };
    expect(await discounts.update(OWNER, MEHR, { ...input, code: '' }, IP)).toMatchObject({ error: 'discount_code_required' });
    expect(await discounts.update(OWNER, MEHR, { ...input, code: GOOD_CODE }, IP)).toMatchObject({ ok: true });
    expect(stepUps).toEqual([GOOD_CODE]);
  });

  it('بی تغییر، بی رویداد', async () => {
    const { discounts, events } = setup();
    const result = await discounts.update(OWNER, MEHR, { entries: edit(), code: GOOD_CODE, seen: seenOf(ROW) }, IP);
    expect(result).toEqual({ ok: true, value: { changed: false } });
    expect(events).toEqual([]);
  });

  it('شرط منجمد کدی که سفارش دارد، زیر همان فیلد و پیش از کد تازه', async () => {
    const order: DiscountOrderView = { orderNumber: 10027, status: 'expired', createdAt: NOW, paidAt: null, discountRials: 1, totalRials: 2 };
    const { discounts, stepUps } = setup({ orders: [order] });
    for (const [over, field] of [
      [{ percent: '25' }, 'percent'],
      [{ max: '60,000' }, 'max'],
      [{ minOrder: '' }, 'minOrder'],
      [{ kind: 'fixed', amount: '10,000' }, 'kind'],
    ] as const) {
      const result = await discounts.update(OWNER, MEHR, { entries: edit(over), code: GOOD_CODE, seen: seenOf(ROW) }, IP);
      expect(result).toMatchObject({ ok: false, status: 400, error: 'discount_terms_frozen', field });
    }
    expect(stepUps).toEqual([]);
    // روز، سقف‌ها، روشن و یادداشت همچنان عوض می‌شوند.
    expect(await discounts.update(OWNER, MEHR, { entries: edit({ until: '1405/08/30' }), code: GOOD_CODE, seen: seenOf(ROW) }, IP)).toMatchObject({
      ok: true,
    });
  });

  it('سفارش هم‌زمان: ذخیره‌گاه زیر قفل `terms_frozen` می‌گوید، با جای همان شرط', async () => {
    const { discounts } = setup({ frozenRace: true });
    const result = await discounts.update(OWNER, MEHR, { entries: edit({ max: '' }), code: GOOD_CODE, seen: seenOf(ROW) }, IP);
    expect(result).toMatchObject({ ok: false, error: 'discount_terms_frozen', field: 'max' });
  });

  it('«خاموش کن» فهرست: بی کد، از همان که دیده شد؛ خاموش دوباره بی کار', async () => {
    const { discounts, stepUps, events, calls } = setup();
    expect(await discounts.disable(OWNER, MEHR, '1', IP)).toMatchObject({ status: 409, error: 'discount_changed' });
    expect(await discounts.disable(ACCOUNTANT, MEHR, seenOf(ROW), IP)).toMatchObject({ status: 403 });
    expect(await discounts.disable(OWNER, MISSING, seenOf(ROW), IP)).toMatchObject({ status: 404 });
    expect(await discounts.disable(OWNER, MEHR, seenOf(ROW), IP)).toEqual({ ok: true, value: { changed: true } });
    expect(stepUps).toEqual([]);
    expect(events.map((event) => [event.action, event.detail])).toEqual([['discounts.update', { code: 'MEHR1405', enabled: false, changed: ['enabled'] }]]);
    const after = calls.length;
    const fresh = (await discounts.page(OWNER, MEHR)) as { ok: true; value: { code: DiscountCodeView } };
    expect(await discounts.disable(OWNER, MEHR, String(fresh.value.code.updatedAt.getTime()), IP)).toEqual({ ok: true, value: { changed: false } });
    expect(calls.slice(after).filter((call) => call === 'update')).toEqual([]);
  });

  it('حسابدار ویرایش نمی‌کند', async () => {
    const { discounts, stepUps } = setup();
    expect(await discounts.update(ACCOUNTANT, MEHR, { entries: edit({ enabled: false }), code: '', seen: seenOf(ROW) }, IP)).toMatchObject({
      status: 403,
    });
    expect(stepUps).toEqual([]);
  });
});
