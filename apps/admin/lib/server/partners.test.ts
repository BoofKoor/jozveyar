/**
 * سرویس زبانهٔ «چاپخانه‌ها» (`partners.ts`، برش ۵٫۲) با ذخیره‌گاه حافظه‌ای و ساعت ساختگی: فقط مالک و در سرور، نام و شهر
 * فارسی‌نرمال از فهرست شهرهای سایت، خطای هر فیلد با جایش، ویرایش از همان که دیده شد، و رویداد با هدف `partner` و IP هش‌شده.
 * قفل، تراکنش و تریگرها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import type { AdminEventInput, NewPartner, PartnerEdit, PartnerStore, PartnerView } from '@jozveyar/db';
import { CITIES } from '@jozveyar/geo';

import { ipHashOf, type AdminSession } from './auth';
import { createPanelPartners } from './partners';

const NOW = new Date('2026-10-05T07:50:00Z');
const SECRET = 's'.repeat(64);
const FIRST = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0001';
const NOOR = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0002';
const MISSING = '0b6a7c1e-1f53-4c2a-9d55-6c1f1c0e0099';
const KARAJ = CITIES.find((city) => city.name === 'کرج')!;

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
const OWNER = session(['partners.manage', 'orders.read', 'orders.assign']);
const OPERATOR = session(['orders.read', 'orders.status', 'orders.assign', 'orders.address', 'files.download', 'tariff.read']);

/** ذخیره‌گاه با همان قرارداد نسخهٔ پستگرس: نام یکتا، یک پیش‌فرض فعال، و غیرفعال فقط بی سفارش باز. */
function memoryPartners() {
  const rows = new Map<string, PartnerView>([
    [
      FIRST,
      {
        id: FIRST,
        name: 'چاپخانهٔ جزوه‌یار',
        provinceId: 8,
        cityId: 394,
        provinceName: 'تهران',
        cityName: 'تهران',
        isDefault: true,
        deactivatedAt: null,
        createdAt: new Date(NOW.getTime() - 86_400_000),
        openOrders: 3,
        users: [],
        notifyMobile: null,
      },
    ],
  ]);
  const events: AdminEventInput[] = [];
  const calls: { method: string; input: unknown }[] = [];
  const store: PartnerStore = {
    async list() {
      return [...rows.values()];
    },
    async find(id) {
      calls.push({ method: 'find', input: id });
      return rows.get(id) ?? null;
    },
    async create(input: NewPartner) {
      calls.push({ method: 'create', input });
      if ([...rows.values()].some((row) => row.name === input.name)) return { ok: false, reason: 'name_taken' };
      const id = NOOR;
      const row = {
        id,
        name: input.name,
        provinceId: input.provinceId,
        cityId: input.cityId,
        provinceName: '',
        cityName: '',
        isDefault: false,
        deactivatedAt: null,
        createdAt: input.at,
        openOrders: 0,
        users: [],
        notifyMobile: input.notifyMobile,
      };
      rows.set(id, row);
      events.push(input.event);
      return { ok: true, partner: { ...row, createdBy: input.createdBy }, changed: [] };
    },
    async update(input: PartnerEdit) {
      calls.push({ method: 'update', input });
      const row = rows.get(input.id);
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.name !== input.seen.name || row.cityId !== input.seen.cityId || row.notifyMobile !== input.seen.notifyMobile) {
        return { ok: false, reason: 'changed' };
      }
      if ([...rows.values()].some((other) => other.id !== row.id && other.name === input.name)) return { ok: false, reason: 'name_taken' };
      const changed = [
        ...(row.name !== input.name ? (['name'] as const) : []),
        ...(row.cityId !== input.cityId ? (['city'] as const) : []),
        ...(row.notifyMobile !== input.notifyMobile ? (['mobile'] as const) : []),
      ];
      Object.assign(row, { name: input.name, provinceId: input.provinceId, cityId: input.cityId, notifyMobile: input.notifyMobile });
      if (changed.length) events.push(input.event);
      return { ok: true, partner: { ...row, createdBy: null }, changed };
    },
    async setDefault({ id, event }) {
      calls.push({ method: 'setDefault', input: id });
      const row = rows.get(id);
      if (!row) return 'not_found';
      if (row.deactivatedAt) return 'inactive';
      if (row.isDefault) return 'already';
      for (const other of rows.values()) other.isDefault = other.id === id;
      events.push(event);
      return 'ok';
    },
    async deactivate({ id, at, event }) {
      calls.push({ method: 'deactivate', input: id });
      const row = rows.get(id);
      if (!row) return 'not_found';
      if (row.isDefault) return 'default';
      if (row.openOrders > 0) return 'open_orders';
      if (row.deactivatedAt) return 'already';
      row.deactivatedAt = at;
      events.push(event);
      return 'ok';
    },
    async activate({ id, event }) {
      calls.push({ method: 'activate', input: id });
      const row = rows.get(id);
      if (!row) return 'not_found';
      if (!row.deactivatedAt) return 'already';
      row.deactivatedAt = null;
      events.push(event);
      return 'ok';
    },
  };
  return { store, rows, events, calls };
}

function service() {
  const memory = memoryPartners();
  return { ...memory, partners: createPanelPartners({ store: memory.store, secret: SECRET, now: () => NOW }) };
}

describe('مجوز در سرور (ADR-038)', () => {
  it('بی `partners.manage` (متصدی) هیچ‌کدام، و ذخیره‌گاه دست نمی‌خورد', async () => {
    const { partners, calls, events } = service();
    for (const result of [
      await partners.list(OPERATOR),
      await partners.find(OPERATOR, FIRST),
      await partners.create(OPERATOR, { name: 'چاپ نور', city: 'مشهد' }, '1.2.3.4'),
      await partners.update(OPERATOR, FIRST, { name: 'x', city: 'مشهد', seenName: 'چاپخانهٔ جزوه‌یار', seenCity: '394' }, '1.2.3.4'),
      await partners.setDefault(OPERATOR, FIRST, '1.2.3.4'),
      await partners.deactivate(OPERATOR, FIRST, '1.2.3.4'),
      await partners.activate(OPERATOR, FIRST, '1.2.3.4'),
    ]) {
      expect(result).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    }
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
    // شاهد: مالک.
    expect(await partners.list(OWNER)).toMatchObject({ ok: true, value: [{ id: FIRST }] });
  });
});

describe('افزودن و ویرایش', () => {
  it('افزودن: نام فارسی‌نرمال، شهر از فهرست سایت با استانش، رویداد با هدف چاپخانه و IP هش‌شده', async () => {
    const { partners, calls, events } = service();
    expect(await partners.create(OWNER, { name: '  چاپ   نور ', city: 'مشهد، خراسان رضوي' }, '1.2.3.4')).toEqual({ ok: true, value: { id: NOOR } });
    expect(calls[0]).toEqual({
      method: 'create',
      input: {
        name: 'چاپ نور',
        provinceId: 11,
        cityId: 1326,
        // بی موبایل اعلان (۷٫۶): بی پیامک، و رویداد بی شماره.
        notifyMobile: null,
        at: NOW,
        createdBy: 'admin-1',
        event: { adminUserId: 'admin-1', action: 'partners.create', targetType: 'partner', targetId: null, ipHash: ipHashOf(SECRET, '1.2.3.4'), at: NOW },
      },
    });
    expect(JSON.stringify(events)).not.toContain('1.2.3.4');
  });

  it('خطای هر فیلد با جایش: نام خالی یا بلند، شهر خالی، شهر ناشناس یا مبهم با پیشنهادها؛ نام تکراری زیر نام', async () => {
    const { partners, calls } = service();
    expect(await partners.create(OWNER, { name: '   ', city: 'مشهد' }, 'ip')).toMatchObject({ status: 400, error: 'invalid_partner_name', field: 'name' });
    expect(await partners.create(OWNER, { name: 'ن'.repeat(101), city: 'مشهد' }, 'ip')).toMatchObject({ error: 'invalid_partner_name' });
    expect(await partners.create(OWNER, { name: 'چاپ نور', city: '' }, 'ip')).toMatchObject({
      status: 400,
      error: 'city_required',
      field: 'city',
      suggestions: [],
    });
    expect(await partners.create(OWNER, { name: 'چاپ نور', city: 'مهاباد' }, 'ip')).toMatchObject({
      status: 400,
      error: 'invalid_city',
      field: 'city',
      suggestions: expect.arrayContaining([1362, 1363]),
    });
    const unknown = await partners.create(OWNER, { name: 'چاپ نور', city: 'نیشا' }, 'ip');
    expect(unknown).toMatchObject({ error: 'invalid_city', field: 'city' });
    expect(!unknown.ok && (unknown.suggestions as number[])[0]).toBe(1447);
    // هیچ‌کدام به ذخیره‌گاه نرسید.
    expect(calls).toEqual([]);
    expect(await partners.create(OWNER, { name: 'چاپخانهٔ جزوه‌یار', city: 'مشهد' }, 'ip')).toMatchObject({
      status: 409,
      error: 'partner_name_taken',
      field: 'name',
    });
  });

  it('ویرایش از همان نام و شهری که مالک دید؛ عوض‌شده «همین حالا عوض شد»، نیست ۴۰۴، و شناسهٔ خراب به ذخیره‌گاه نمی‌رسد', async () => {
    const { partners, calls, rows } = service();
    const seen = { seenName: 'چاپخانهٔ جزوه‌یار', seenCity: '394' };
    expect(await partners.update(OWNER, FIRST, { name: 'چاپخانهٔ جزوه‌یار', city: 'کرج', ...seen }, 'ip')).toEqual({ ok: true, value: { changed: ['city'] } });
    expect(calls[0]).toMatchObject({
      method: 'update',
      input: {
        id: FIRST,
        seen: { name: 'چاپخانهٔ جزوه‌یار', cityId: 394 },
        name: 'چاپخانهٔ جزوه‌یار',
        provinceId: KARAJ.provinceId,
        cityId: KARAJ.id,
        event: { action: 'partners.update', targetType: 'partner', targetId: FIRST },
      },
    });
    // فرم کهنه: شهر همین حالا عوض شد.
    expect(await partners.update(OWNER, FIRST, { name: 'نام تازه', city: 'تهران', ...seen }, 'ip')).toMatchObject({ status: 409, error: 'partner_changed' });
    expect(rows.get(FIRST)!.name).toBe('چاپخانهٔ جزوه‌یار');
    // فرمی که نام و شهر دیده‌شده را ندارد، کهنه است، و به ذخیره‌گاه نمی‌رسد.
    const sent = calls.length;
    expect(await partners.update(OWNER, FIRST, { name: 'نام تازه', city: 'تهران' }, 'ip')).toMatchObject({ error: 'partner_changed' });
    expect(await partners.update(OWNER, FIRST, { name: 'نام تازه', city: 'تهران', seenName: 'x', seenCity: 'abc' }, 'ip')).toMatchObject({
      error: 'partner_changed',
    });
    expect(calls.length).toBe(sent);
    expect(await partners.update(OWNER, MISSING, { name: 'نام', city: 'تهران', ...seen }, 'ip')).toMatchObject({ status: 404, error: 'partner_not_found' });
    const before = calls.length;
    expect(await partners.update(OWNER, 'not-a-uuid', { name: 'نام', city: 'تهران', ...seen }, 'ip')).toMatchObject({ status: 404, error: 'partner_not_found' });
    expect(await partners.find(OWNER, "1' OR 1=1")).toMatchObject({ status: 404, error: 'partner_not_found' });
    expect(calls.length).toBe(before);
    // نام تکراری در ویرایش هم.
    await partners.create(OWNER, { name: 'چاپ نور', city: 'مشهد' }, 'ip');
    expect(
      await partners.update(OWNER, NOOR, { name: 'چاپخانهٔ جزوه‌یار', city: 'مشهد', seenName: 'چاپ نور', seenCity: '1326' }, 'ip'),
    ).toMatchObject({ status: 409, error: 'partner_name_taken', field: 'name' });
  });
});

describe('پیش‌فرض، غیرفعال و فعال', () => {
  it('پیش‌فرض فقط فعال؛ پیش‌فرض و چاپخانهٔ با سفارش باز غیرفعال نمی‌شوند؛ دوباره زدن همان نتیجه، بی رویداد دوم', async () => {
    const { partners, rows, events } = service();
    await partners.create(OWNER, { name: 'چاپ نور', city: 'مشهد' }, 'ip');
    expect(await partners.deactivate(OWNER, FIRST, 'ip')).toMatchObject({ status: 409, error: 'partner_is_default' });
    expect(await partners.deactivate(OWNER, NOOR, 'ip')).toEqual({ ok: true, value: true });
    expect(rows.get(NOOR)!.deactivatedAt).toEqual(NOW);
    expect(await partners.deactivate(OWNER, NOOR, 'ip')).toEqual({ ok: true, value: true });
    expect(await partners.setDefault(OWNER, NOOR, 'ip')).toMatchObject({ status: 409, error: 'partner_inactive' });
    expect(await partners.activate(OWNER, NOOR, 'ip')).toEqual({ ok: true, value: true });
    expect(await partners.setDefault(OWNER, NOOR, 'ip')).toEqual({ ok: true, value: true });
    expect(await partners.setDefault(OWNER, NOOR, 'ip')).toEqual({ ok: true, value: true });
    expect([rows.get(FIRST)!.isDefault, rows.get(NOOR)!.isDefault]).toEqual([false, true]);
    // اولی دیگر پیش‌فرض نیست، ولی سفارش باز دارد.
    expect(await partners.deactivate(OWNER, FIRST, 'ip')).toMatchObject({ status: 409, error: 'partner_has_orders' });
    expect(events.map((event) => [event.action, event.targetType, event.targetId])).toEqual([
      ['partners.create', 'partner', null],
      ['partners.deactivate', 'partner', NOOR],
      ['partners.activate', 'partner', NOOR],
      ['partners.default', 'partner', NOOR],
    ]);
    for (const run of [partners.setDefault, partners.deactivate, partners.activate]) {
      expect(await run(OWNER, MISSING, 'ip')).toMatchObject({ status: 404, error: 'partner_not_found' });
      expect(await run(OWNER, '', 'ip')).toMatchObject({ status: 404, error: 'partner_not_found' });
    }
  });
});

describe('موبایل اعلان (۷٫۶، سؤال‌های ۱۲۶ و ۱۷۷)', () => {
  const details = (events: AdminEventInput[]) => JSON.stringify(events.map((event) => event.detail ?? null));

  it('افزودن: هر شکل موبایل ایران به 09…؛ رویداد با شمارهٔ پوشیده، هرگز کامل؛ شمارهٔ نادرست زیر همان فیلد و بی ذخیره‌گاه', async () => {
    const { partners, calls, events, rows } = service();
    expect(await partners.create(OWNER, { name: 'چاپ نور', city: 'مشهد', mobile: '+98 915 123 4567' }, '1.2.3.4')).toEqual({ ok: true, value: { id: NOOR } });
    expect((calls[0]!.input as NewPartner).notifyMobile).toBe('09151234567');
    expect(rows.get(NOOR)!.notifyMobile).toBe('09151234567');
    expect(events[0]!.detail).toEqual({ mobile: '0915 ••• 4567' });
    expect(details(events)).not.toContain('09151234567');
    // خالی یعنی بی پیامک، و رویداد بی شماره.
    const empty = service();
    await empty.partners.create(OWNER, { name: 'چاپ نور', city: 'مشهد', mobile: '  ' }, 'ip');
    expect([(empty.calls[0]!.input as NewPartner).notifyMobile, empty.events[0]!.detail]).toEqual([null, undefined]);
    for (const bad of ['0915123456', '02112345678', 'abc']) {
      const wrong = service();
      expect(await wrong.partners.create(OWNER, { name: 'چاپ نور', city: 'مشهد', mobile: bad }, 'ip')).toMatchObject({
        status: 400,
        error: 'invalid_partner_mobile',
        field: 'mobile',
      });
      expect(wrong.calls).toEqual([]);
    }
    // چند خطا با هم: همان که در فرم بالاتر است.
    expect(await service().partners.create(OWNER, { name: ' ', city: 'مشهد', mobile: 'abc' }, 'ip')).toMatchObject({ error: 'invalid_partner_name' });
  });

  it('ویرایش: «همان که دیدی» موبایل هم؛ رویداد با قبل و بعد پوشیده؛ بی تغییر موبایل بی کلید موبایل؛ برداشتن یعنی بی پیامک', async () => {
    const { partners, rows, events } = service();
    const base = { name: 'چاپخانهٔ جزوه‌یار', city: 'تهران', seenName: 'چاپخانهٔ جزوه‌یار', seenCity: '394' };
    expect(await partners.update(OWNER, FIRST, { ...base, mobile: '0915 123 4567', seenMobile: '' }, 'ip')).toEqual({ ok: true, value: { changed: ['mobile'] } });
    expect(rows.get(FIRST)!.notifyMobile).toBe('09151234567');
    expect(events.at(-1)!.detail).toEqual({ mobile: '0915 ••• 4567', previousMobile: null });
    // فرم کهنه: موبایل همین حالا گذاشته شد و این فرم هنوز «نداشت» می‌گوید؛ فرم پیش از ۷٫۶ (بی فیلد) هم.
    expect(await partners.update(OWNER, FIRST, { ...base, mobile: '', seenMobile: '' }, 'ip')).toMatchObject({ status: 409, error: 'partner_changed' });
    expect(await partners.update(OWNER, FIRST, { ...base, mobile: '' }, 'ip')).toMatchObject({ error: 'partner_changed' });
    expect(rows.get(FIRST)!.notifyMobile).toBe('09151234567');
    expect(await partners.update(OWNER, FIRST, { ...base, mobile: '09121112222', seenMobile: '09151234567' }, 'ip')).toEqual({
      ok: true,
      value: { changed: ['mobile'] },
    });
    expect(events.at(-1)!.detail).toEqual({ mobile: '0912 ••• 2222', previousMobile: '0915 ••• 4567' });
    // فقط نام: رویداد بی کلید موبایل.
    const before = events.length;
    expect(await partners.update(OWNER, FIRST, { ...base, name: 'جزوه‌یار مرکز', mobile: '09121112222', seenMobile: '09121112222' }, 'ip')).toEqual({
      ok: true,
      value: { changed: ['name'] },
    });
    expect([events.length, events.at(-1)!.detail]).toEqual([before + 1, undefined]);
    const renamed = { ...base, name: 'جزوه‌یار مرکز', seenName: 'جزوه‌یار مرکز' };
    expect(await partners.update(OWNER, FIRST, { ...renamed, mobile: '', seenMobile: '09121112222' }, 'ip')).toEqual({ ok: true, value: { changed: ['mobile'] } });
    expect(rows.get(FIRST)!.notifyMobile).toBeNull();
    expect(events.at(-1)!.detail).toEqual({ mobile: null, previousMobile: '0912 ••• 2222' });
    expect(details(events)).not.toMatch(/09\d{9}/);
    // دیده‌شدهٔ ناموبایل از جای دیگری آمده: کهنه، بی ذخیره‌گاه؛ موبایل نادرست زیر همان فیلد.
    const other = service();
    expect(await other.partners.update(OWNER, FIRST, { ...base, mobile: '', seenMobile: '0915 123 4567' }, 'ip')).toMatchObject({ error: 'partner_changed' });
    expect(await other.partners.update(OWNER, FIRST, { ...base, mobile: '021', seenMobile: '' }, 'ip')).toMatchObject({
      status: 400,
      error: 'invalid_partner_mobile',
      field: 'mobile',
    });
    expect(other.calls).toEqual([]);
  });
});
