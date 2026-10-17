/**
 * سرویس مسدودی موبایل مشتری در پنل (`blocks.ts`، برش ۱۲٫۲) با ذخیره‌گاه حافظه‌ای: مجوز در سرور پیش از هر خواندن، شماره از صاحب سفارش در
 * محدودهٔ نشست (نه از فرم)، دلیل فارسی‌نرمال و تا ۵۰۰ نویسه، شمارهٔ فهرست نرمال، دو کلیک یکی، دلیل دیگر رد، و رویداد با شمارهٔ پوشیده. قفل
 * و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import { ALL_ORDERS, type AdminEventInput, type BlockStore, type MobileBlockView, type PanelScope } from '@jozveyar/db';

import { ipHashOf, type AdminSession } from './auth';
import { createPanelBlocks } from './blocks';

const NOW = new Date('2026-10-16T08:00:00Z');
const SECRET = 's'.repeat(64);
const IP = '203.0.113.7';
const SARA_MOBILE = '09121234567';
const ORDER = 10027;
const PARTNER = 'partner-noor';

function session(roles: string[], permissions: string[], partner: AdminSession['partner'] = null): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'reza',
    displayName: 'رضا',
    roles,
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner,
  };
}
const OPERATOR = session(['operator'], ['orders.read', 'customers.block']);
const ACCOUNTANT = session(['accountant'], ['orders.read', 'orders.money']);

/** ذخیره‌گاه حافظه‌ای با همان قرارداد: یک زنده برای هر شماره، دو کلیک یکی، و رفع یک‌باره. */
function memoryStore() {
  const rows: MobileBlockView[] = [];
  const events: AdminEventInput[] = [];
  const scopes: PanelScope[] = [];
  let next = 1;
  const store: BlockStore = {
    async orderOwner(scope, orderNumber) {
      scopes.push(scope);
      if (orderNumber !== ORDER) return null;
      if (scope.kind === 'partner' && scope.partnerId !== PARTNER) return null;
      return { orderId: 'order-1', orderNumber, mobile: SARA_MOBILE };
    },
    async live(mobiles) {
      return new Map(rows.filter((row) => mobiles.includes(row.mobile) && row.unblockedAt === null).map((row) => [row.mobile, row]));
    },
    async get(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async list(pastLimit) {
      return {
        live: rows.filter((row) => row.unblockedAt === null).reverse(),
        past: rows.filter((row) => row.unblockedAt !== null).slice(0, pastLimit),
      };
    },
    async block({ mobile, reason, orderNumber, event }) {
      const live = rows.find((row) => row.mobile === mobile && row.unblockedAt === null);
      if (live) {
        return live.blockedBy === event.adminUserId && live.reason === reason
          ? { ok: true, block: live, already: true }
          : { ok: false, reason: 'already_blocked', block: live };
      }
      const row: MobileBlockView = {
        id: `00000000-0000-4000-8000-${String(next++).padStart(12, '0')}`,
        mobile,
        reason,
        orderNumber,
        blockedAt: event.at,
        blockedBy: event.adminUserId!,
        blockedByName: 'رضا',
        unblockedAt: null,
        unblockedByName: null,
      };
      rows.push(row);
      events.push({ ...event, targetId: row.id });
      return { ok: true, block: row, already: false };
    },
    async unblock({ id, event }) {
      const row = rows.find((r) => r.id === id);
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.unblockedAt) return { ok: true, block: row, already: true };
      row.unblockedAt = event.at;
      row.unblockedByName = 'رضا';
      events.push({ ...event, targetId: id });
      return { ok: true, block: row, already: false };
    },
  };
  return { store, rows, events, scopes };
}

function setup() {
  const memory = memoryStore();
  return { ...memory, blocks: createPanelBlocks({ store: memory.store, secret: SECRET, now: () => NOW }) };
}

describe('مسدودی موبایل مشتری در پنل (۱۲٫۲)', () => {
  it('مجوز پیش از هر خواندن: بی `customers.block` هیچ (کارت صفحهٔ سفارش null، بقیه ۴۰۳)', async () => {
    const { blocks, scopes } = setup();
    expect(await blocks.ofOrder(ACCOUNTANT, ORDER)).toBeNull();
    expect(await blocks.list(ACCOUNTANT)).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    expect(await blocks.block(ACCOUNTANT, { number: String(ORDER), reason: 'دلیل' }, IP)).toMatchObject({ status: 403, error: 'forbidden' });
    expect(await blocks.unblock(ACCOUNTANT, 'x', IP)).toMatchObject({ status: 403, error: 'forbidden' });
    expect(scopes).toEqual([]);
  });

  it('از صفحهٔ سفارش: موبایل صاحب سفارش در محدودهٔ نشست، دلیل فارسی‌نرمال، و رویداد با شمارهٔ پوشیده و سفارش، بی دلیل', async () => {
    const { blocks, events, scopes } = setup();
    expect(await blocks.ofOrder(OPERATOR, ORDER)).toEqual({ mobile: SARA_MOBILE, live: null });
    const result = await blocks.block(OPERATOR, { number: String(ORDER), reason: '  سفارش‌هاي پرداخت‌نشده،   پشت‌سرهم ' }, IP);
    expect(result).toMatchObject({ ok: true, value: { already: false, block: { mobile: SARA_MOBILE, reason: 'سفارش‌های پرداخت‌نشده، پشت‌سرهم', orderNumber: ORDER } } });
    expect(events).toEqual([
      expect.objectContaining({
        adminUserId: 'admin-1',
        action: 'customers.block',
        targetType: 'mobile_block',
        ipHash: ipHashOf(SECRET, IP),
        at: NOW,
        detail: { mobile: '0912 ••• 4567', orderNumber: ORDER },
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain(SARA_MOBILE);
    expect(JSON.stringify(events)).not.toContain('پرداخت‌نشده');
    expect(scopes.every((scope) => scope === ALL_ORDERS || scope.kind === 'all')).toBe(true);
    expect((await blocks.ofOrder(OPERATOR, ORDER))?.live).toMatchObject({ reason: 'سفارش‌های پرداخت‌نشده، پشت‌سرهم' });
  });

  it('سفارشی که نیست یا بیرون از محدوده است ۴۰۴؛ شمارهٔ بدشکل هم', async () => {
    const { blocks } = setup();
    const partnerUser = session(['print_partner'], ['orders.read', 'customers.block'], { id: 'partner-other', name: 'چاپ دیگر' } as AdminSession['partner']);
    expect(await blocks.block(OPERATOR, { number: '99999', reason: 'دلیل' }, IP)).toMatchObject({ status: 404, error: 'order_not_found' });
    expect(await blocks.block(OPERATOR, { number: '10027abc', reason: 'دلیل' }, IP)).toMatchObject({ status: 404, error: 'order_not_found' });
    expect(await blocks.block(partnerUser, { number: String(ORDER), reason: 'دلیل' }, IP)).toMatchObject({ status: 404, error: 'order_not_found' });
    expect(await blocks.ofOrder(partnerUser, ORDER)).toBeNull();
  });

  it('دلیل: خالی و فقط‌فاصله «بنویس»، بیش از ۵۰۰ نویسه پس از نرمال‌سازی «حداکثر»؛ پیش از هر خواندن سفارش', async () => {
    const { blocks, scopes } = setup();
    expect(await blocks.block(OPERATOR, { number: String(ORDER), reason: '' }, IP)).toMatchObject({ status: 400, error: 'reason_required' });
    expect(await blocks.block(OPERATOR, { number: String(ORDER), reason: ' \n ' }, IP)).toMatchObject({ status: 400, error: 'reason_required' });
    expect(await blocks.block(OPERATOR, { number: String(ORDER), reason: 'د'.repeat(501) }, IP)).toMatchObject({ status: 400, error: 'reason_too_long' });
    expect(scopes).toEqual([]);
    expect((await blocks.block(OPERATOR, { number: String(ORDER), reason: `${'د'.repeat(500)}   ` }, IP)).ok).toBe(true);
  });

  it('از فهرست: شمارهٔ نوشته‌شده نرمال می‌شود (ارقام فارسی، +98)؛ شمارهٔ نادرست خطای فیلد', async () => {
    const { blocks, events } = setup();
    expect(await blocks.block(OPERATOR, { mobile: '+98 935 ۱۲۳ ۴۵۶۷', reason: 'مزاحمت' }, IP)).toMatchObject({
      ok: true,
      value: { block: { mobile: '09351234567', orderNumber: null } },
    });
    expect(events.at(-1)?.detail).toEqual({ mobile: '0935 ••• 4567' });
    expect(await blocks.block(OPERATOR, { mobile: '0935123', reason: 'مزاحمت' }, IP)).toMatchObject({ status: 400, error: 'invalid_block_mobile' });
  });

  it('دو کلیک یکی، بی رویداد دوم؛ شمارهٔ مسدود با دلیل دیگر ۴۰۹', async () => {
    const { blocks, events } = setup();
    const input = { number: String(ORDER), reason: 'دلیل' };
    expect((await blocks.block(OPERATOR, input, IP)).ok).toBe(true);
    expect(await blocks.block(OPERATOR, input, IP)).toMatchObject({ ok: true, value: { already: true } });
    expect(await blocks.block(OPERATOR, { ...input, reason: 'دلیل دیگر' }, IP)).toMatchObject({ status: 409, error: 'mobile_already_blocked' });
    expect(events).toHaveLength(1);
  });

  it('رفع: همان مسدودی، رویداد با شمارهٔ پوشیده و سفارشش؛ دو کلیک یکی؛ شناسهٔ بدشکل یا ناشناس ۴۰۴؛ فهرست زنده و رفع‌شده', async () => {
    const { blocks, events } = setup();
    const blocked = await blocks.block(OPERATOR, { number: String(ORDER), reason: 'دلیل' }, IP);
    if (!blocked.ok) throw new Error('مسدود نشد');
    const id = blocked.value.block.id;
    expect(await blocks.unblock(OPERATOR, id, IP)).toMatchObject({ ok: true, value: { already: false, block: { unblockedAt: NOW } } });
    expect(events.at(-1)).toMatchObject({ action: 'customers.unblock', targetType: 'mobile_block', detail: { mobile: '0912 ••• 4567', orderNumber: ORDER } });
    expect(await blocks.unblock(OPERATOR, id, IP)).toMatchObject({ ok: true, value: { already: true } });
    expect(events).toHaveLength(2);
    expect(await blocks.unblock(OPERATOR, 'نه-شناسه', IP)).toMatchObject({ status: 404, error: 'block_not_found' });
    expect(await blocks.unblock(OPERATOR, '00000000-0000-4000-8000-000000000999', IP)).toMatchObject({ status: 404, error: 'block_not_found' });
    expect(await blocks.unblock(OPERATOR, undefined, IP)).toMatchObject({ status: 404, error: 'block_not_found' });

    expect((await blocks.block(OPERATOR, { mobile: '09351234567', reason: 'مزاحمت' }, IP)).ok).toBe(true);
    const list = await blocks.list(OPERATOR);
    expect(list.ok && [list.value.live.map((b) => b.mobile), list.value.past.map((b) => b.id), list.value.now]).toEqual([['09351234567'], [id], NOW]);
  });
});
