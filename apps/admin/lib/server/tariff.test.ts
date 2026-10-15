/**
 * سرویس تعرفهٔ پنل (`tariff.ts`، برش ۴٫۵؛ کاتالوگ از ۸٫۳) با ذخیره‌گاه حافظه‌ای و ساعت ساختگی: مجوز در سرور، سنجش فرم در سرور، «همان که
 * دیده شد» (اثر انگشت محتوا و نسخهٔ فعال)، و کد تازه فقط پس از هر سنجشی که بی کد جواب دارد. قفل، تراکنش، رویداد و
 * تغییرناپذیری روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { createHash, createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { PriceList } from '@jozveyar/contracts';
import type { AdminEventInput, SettingsStore, TariffActivation, TariffActor, TariffStore, TariffVersion } from '@jozveyar/db';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { canonicalJson, draftFormOf, type DraftForm } from '../tariff';
import type { AdminSession } from './auth';
import { fail, ok, type Result } from './result';
import { createPanelTariff, fingerprint, versionOf } from './tariff';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const SECRET = 's'.repeat(64);
const V1 = SEED_PRICE_LIST;

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
const OWNER = session(['tariff.read', 'tariff.edit', 'tariff.pause']);
const OPERATOR = session(['orders.read', 'tariff.read', 'tariff.pause']);
/** دیدن بی خاموش کردن (نقشی که `tariff.pause` ندارد). */
const VIEWER = session(['tariff.read']);

interface Row extends TariffVersion {
  list: PriceList;
}

/** ذخیره‌گاه حافظه‌ای با همان قرارداد نسخهٔ پستگرس؛ هر نوشتن ثبت می‌شود. */
function memoryStore() {
  const rows = new Map<number, Row>();
  const writes: { method: string; input: unknown }[] = [];
  const activations: TariffActivation[] = [];
  const add = (list: PriceList, over: Partial<TariffVersion> = {}) => {
    rows.set(list.version, {
      list,
      version: list.version,
      label: list.label,
      isActive: false,
      activatedAt: null,
      createdAt: NOW,
      createdBy: null,
      basedOn: null,
      orders: 0,
      ...over,
    });
  };
  const store: TariffStore = {
    async versions() {
      return [...rows.values()].sort((a, b) => b.version - a.version).map(({ list: _list, ...row }) => row);
    },
    async activations() {
      return activations;
    },
    async load(version) {
      return rows.get(version)?.list ?? null;
    },
    async createDraft(input) {
      writes.push({ method: 'createDraft', input });
      const draft = [...rows.values()].find((r) => r.activatedAt === null);
      if (draft) return { version: draft.version, created: false };
      const active = [...rows.values()].find((r) => r.isActive)!;
      const version = Math.max(...rows.keys()) + 1;
      add({ ...active.list, version, label: input.label }, { createdBy: { id: input.actor.adminUserId, name: 'سارا' }, basedOn: active.version });
      return { version, created: true };
    },
    async saveDraft(input) {
      writes.push({ method: 'saveDraft', input });
      const row = rows.get(input.list.version);
      if (!row || row.activatedAt) return 'not_draft';
      if (!input.verify(row.list)) return 'changed';
      row.list = input.list;
      return 'ok';
    },
    async deleteDraft(input) {
      writes.push({ method: 'deleteDraft', input });
      const row = rows.get(input.version);
      if (!row || row.activatedAt) return 'not_draft';
      rows.delete(input.version);
      return 'ok';
    },
    async activate(input) {
      writes.push({ method: 'activate', input });
      const active = [...rows.values()].find((r) => r.isActive)?.version ?? null;
      if (active === input.version) return { ok: true, already: true, previous: active };
      const row = rows.get(input.version);
      if (!row) return { ok: false, reason: 'not_found', active };
      if (active !== input.expectedActive || !input.verify(row.list)) return { ok: false, reason: 'changed', active };
      if (active !== null) rows.get(active)!.isActive = false;
      row.isActive = true;
      row.activatedAt ??= input.at;
      activations.push({ version: row.version, at: input.at, adminName: 'سارا' });
      return { ok: true, already: false, previous: active };
    },
  };
  add(V1, { isActive: true, activatedAt: new Date('2026-09-10T08:00:00Z'), orders: 61 });
  activations.push({ version: 1, at: new Date('2026-09-10T08:00:00Z'), adminName: null });
  return { store, rows, writes, add };
}

/** ذخیره‌گاه تنظیم‌ها با همان قرارداد نسخهٔ پستگرس (قفل و تراکنش در تست یکپارچگی `packages/db`). */
function memorySettings() {
  const values = new Map<string, unknown>();
  const events: AdminEventInput[] = [];
  const store: SettingsStore = {
    async read(key) {
      return values.get(key);
    },
    async change(input) {
      const decision = input.decide(values.get(input.key));
      if (decision.kind === 'reject') return { ok: false, reason: decision.reason };
      if (decision.kind === 'same') return { ok: true, written: false };
      values.set(input.key, decision.value);
      events.push({ adminUserId: input.actor.adminUserId, action: input.action, targetType: 'setting', targetId: input.key, ipHash: input.actor.ipHash, detail: decision.detail, at: input.at });
      return { ok: true, written: true };
    },
  };
  return { store, values, events };
}

function service(stepUpResult: Result<true> = ok(true)) {
  const memory = memoryStore();
  const settings = memorySettings();
  const stepUp = vi.fn(async (_session: AdminSession, _code: unknown, _ip: string) => stepUpResult);
  const tariff = createPanelTariff({ store: memory.store, settings: settings.store, stepUp, secret: SECRET, now: () => NOW });
  return { tariff, stepUp, settings, ...memory };
}

const mutations = (writes: { method: string }[]) => writes.map((w) => w.method);
/** نرخ چاپ A4 گران‌تر، یکرو و دورو: سیاه‌سفید 1,700 و رنگی 2,200 تومان. */
const dearer = (form: DraftForm): DraftForm['print'] => ({
  ...form.print,
  a4: { single: { bw: '1,700', color: '2,200' }, double: { bw: '1,700', color: '2,200' } },
});

describe('مجوز در سرور (ADR-038)', () => {
  it('متصدی: تعرفه و هر نسخهٔ فعال‌شده را می‌بیند؛ پیش‌نویس، ساختن، ذخیره، پاک کردن و فعال کردن نه، بی رسیدن به ذخیره‌گاه', async () => {
    const { tariff, writes, stepUp, add } = service();
    add({ ...V1, version: 2, label: 'پیش‌نویس' });
    const overview = await tariff.overview(OPERATOR);
    expect(overview).toMatchObject({ ok: true, value: { canEdit: false } });
    expect(await tariff.version(OPERATOR, '1')).toMatchObject({ ok: true, value: { kind: 'version', view: { canEdit: false } } });
    for (const result of [
      await tariff.version(OPERATOR, '2'),
      await tariff.activation(OPERATOR, '2'),
      await tariff.createDraft(OPERATOR, '1.2.3.4'),
      await tariff.saveDraft(OPERATOR, '2', { form: draftFormOf(V1), fingerprint: '' }, '1.2.3.4'),
      await tariff.deleteDraft(OPERATOR, '2', '1.2.3.4'),
      await tariff.activate(OPERATOR, '2', { active: '1', fingerprint: '', code: '123456' }, '1.2.3.4'),
    ]) {
      expect(result).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    }
    expect(writes).toEqual([]);
    expect(stepUp).not.toHaveBeenCalled();
    // بی `tariff.read`، حتی دیدن نه.
    expect(await tariff.overview(session(['orders.read']))).toMatchObject({ ok: false, status: 403 });
    expect(await tariff.version(session(['orders.read']), '1')).toMatchObject({ ok: false, status: 403 });
  });
});

describe('نسخه‌ها و پیش‌نویس', () => {
  it('نمای کلی: نسخهٔ فعال با محتوا، پیش‌نویس، دوره‌های فعال بودن، و «نسخهٔ تازه» فقط برای مالک', async () => {
    const { tariff, add } = service();
    const none = await tariff.overview(OWNER);
    expect(none).toMatchObject({ ok: true, value: { draft: null, canEdit: true, active: { version: { version: 1, orders: 61 } } } });
    add({ ...V1, version: 2, label: 'پیش‌نویس' });
    const withDraft = await tariff.overview(OWNER);
    if (!withDraft.ok) throw new Error('overview');
    expect(withDraft.value.draft?.version).toBe(2);
    expect(withDraft.value.active.list).toEqual(V1);
    expect(withDraft.value.periods.get(1)).toEqual([{ from: new Date('2026-09-10T08:00:00Z'), to: null, by: null }]);
  });

  it('«نسخهٔ تازه»: نام ماه و سال تهران، کننده با هش IP؛ بار دوم همان پیش‌نویس', async () => {
    const { tariff, writes } = service();
    expect(await tariff.createDraft(OWNER, '1.2.3.4')).toEqual(ok({ version: 2, created: true }));
    expect(await tariff.createDraft(OWNER, '1.2.3.4')).toEqual(ok({ version: 2, created: false }));
    const input = writes[0]!.input as { at: Date; label: string; actor: TariffActor };
    expect(input.label).toBe('تعرفهٔ مهر 1405');
    expect(input.at).toEqual(NOW);
    expect(input.actor).toEqual({ adminUserId: 'admin-1', ipHash: createHmac('sha256', SECRET).update('ip\x001.2.3.4').digest('hex') });
  });

  it('نسخهٔ پیش‌نویس برای ویرایش: فرم از روی همان، نسخهٔ فعال، و اثر انگشت محتوا؛ نسخهٔ فعال‌شده فقط‌خواندنی با دوره‌هایش', async () => {
    const { tariff } = service();
    await tariff.createDraft(OWNER, 'ip');
    const draft = await tariff.version(OWNER, '2');
    if (!draft.ok || draft.value.kind !== 'draft') throw new Error('draft');
    const stored = { ...V1, version: 2, label: 'تعرفهٔ مهر 1405' };
    expect(draft.value.view.form).toEqual(draftFormOf(stored));
    expect(draft.value.view.active).toEqual({ version: 1, list: V1 });
    expect(draft.value.view.fingerprint).toBe(createHash('sha256').update(canonicalJson(stored)).digest('hex'));
    const v1 = await tariff.version(OWNER, '1');
    expect(v1).toMatchObject({ ok: true, value: { kind: 'version', view: { canEdit: true, periods: [{ to: null }] } } });
    for (const param of ['9', '0', '01', 'x', '1.5', '']) {
      expect(await tariff.version(OWNER, param), param).toMatchObject({ ok: false, status: 404, error: 'tariff_not_found' });
    }
    expect([versionOf('2'), versionOf('999999999'), versionOf('1000000000'), versionOf(2)]).toEqual([2, 999_999_999, null, null]);
  });
});

describe('ذخیرهٔ پیش‌نویس', () => {
  async function withDraft() {
    const s = service();
    await s.tariff.createDraft(OWNER, 'ip');
    const view = await s.tariff.version(OWNER, '2');
    if (!view.ok || view.value.kind !== 'draft') throw new Error('draft');
    return { ...s, view: view.value.view };
  }
  const edit = (form: DraftForm, over: Partial<DraftForm>) => ({ ...form, ...over });

  it('فرم درست: ذخیره با کننده؛ ذخیره‌گاه محتوای امروز را با اثر انگشتی که ویرایشگر داشت می‌سنجد', async () => {
    const { tariff, view, writes, rows } = await withDraft();
    const result = await tariff.saveDraft(OWNER, '2', { form: edit(view.form, { print: dearer(view.form) }), fingerprint: view.fingerprint }, 'ip');
    expect(result).toEqual(ok({ version: 2 }));
    expect(rows.get(2)!.list.printRates).toEqual({ a4: { single: { color: 22_000, bw: 17_000 }, double: { color: 22_000, bw: 17_000 } } });
    const input = writes.at(-1)!.input as { verify: (list: PriceList) => boolean; at: Date; actor: TariffActor };
    expect(input.at).toEqual(NOW);
    expect(input.verify({ ...V1, version: 2, label: 'تعرفهٔ مهر 1405' })).toBe(true);
    expect(input.verify({ ...V1, version: 2, label: 'دیگر' })).toBe(false);
  });

  it('فرم با خطا ذخیره نمی‌شود: همان خطاها با جایشان، و ذخیره‌گاه دست نمی‌خورد', async () => {
    const { tariff, view, writes } = await withDraft();
    const [spiral] = view.form.bindings;
    const a4 = spiral!.bands.a4.map((band, i) => (i === 2 ? { ...band, from: '302' } : band));
    const bindings = [{ ...spiral!, bands: { ...spiral!.bands, a4 } }];
    const result = await tariff.saveDraft(OWNER, '2', { form: edit(view.form, { bindings, label: '' }), fingerprint: view.fingerprint }, 'ip');
    expect(result).toMatchObject({ ok: false, status: 400, error: 'invalid_draft' });
    const issues = (result as unknown as { issues: { field: string }[] }).issues;
    expect(issues.map((i) => i.field)).toEqual(['label', 'binding.0.band.a4.2.from']);
    expect(mutations(writes)).toEqual(['createDraft']);
  });

  it('پیش‌نویسی که از وقتی ویرایشگر باز شد عوض شده، رونویسی نمی‌شود؛ پیش یا زیر قفل', async () => {
    const { tariff, view, writes, store } = await withDraft();
    const form = edit(view.form, { print: dearer(view.form) });
    expect(await tariff.saveDraft(OWNER, '2', { form, fingerprint: 'کهنه' }, 'ip')).toMatchObject({ ok: false, status: 409, error: 'draft_changed' });
    expect(mutations(writes)).toEqual(['createDraft']);
    // هم‌زمان: پیش از قفل هنوز همان بود، زیر قفل نه.
    const save = store.saveDraft;
    store.saveDraft = (input) => save({ ...input, verify: () => input.verify({ ...V1, version: 2, label: 'زبانهٔ دیگر' }) });
    expect(await tariff.saveDraft(OWNER, '2', { form, fingerprint: view.fingerprint }, 'ip')).toMatchObject({ ok: false, status: 409, error: 'draft_changed' });
  });

  it('نسخهٔ فعال‌شده پیش‌نویس نیست؛ پاک کردن فقط پیش‌نویس', async () => {
    const { tariff, view } = await withDraft();
    expect(await tariff.saveDraft(OWNER, '1', { form: view.form, fingerprint: fingerprint(V1) }, 'ip')).toMatchObject({ ok: false, status: 409, error: 'not_draft' });
    expect(await tariff.deleteDraft(OWNER, '1', 'ip')).toMatchObject({ ok: false, status: 409, error: 'not_draft' });
    expect(await tariff.deleteDraft(OWNER, 'x', 'ip')).toMatchObject({ ok: false, status: 404 });
    expect(await tariff.deleteDraft(OWNER, '2', 'ip')).toEqual(ok(true));
    expect(await tariff.saveDraft(OWNER, '2', { form: view.form, fingerprint: view.fingerprint }, 'ip')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('فعال کردن با کد تازه', () => {
  async function ready(stepUpResult: Result<true> = ok(true)) {
    const s = service(stepUpResult);
    await s.tariff.createDraft(OWNER, 'ip');
    const view = await s.tariff.version(OWNER, '2');
    if (!view.ok || view.value.kind !== 'draft') throw new Error('draft');
    await s.tariff.saveDraft(OWNER, '2', { form: { ...view.value.view.form, print: dearer(view.value.view.form) }, fingerprint: view.value.view.fingerprint }, 'ip');
    const activation = await s.tariff.activation(OWNER, '2');
    if (!activation.ok) throw new Error('activation');
    return { ...s, activation: activation.value };
  }

  it('صفحهٔ فعال‌سازی: تغییرها نسبت به نسخهٔ فعال و اثر انگشت؛ نسخهٔ فعال خودش نه', async () => {
    const { tariff, activation } = await ready();
    expect(activation.active.version).toBe(1);
    expect(activation.again).toBe(false);
    expect(activation.problems).toEqual([]);
    expect(activation.changes.unchanged).toEqual(['کاغذ', 'صحافی', 'پست', 'بقیه']);
    expect(activation.changes.lines).toHaveLength(4);
    expect(activation.fingerprint).toBe(fingerprint(activation.list));
    expect(await tariff.activation(OWNER, '1')).toMatchObject({ ok: false, status: 409, error: 'already_active' });
  });

  it('درست: کد تازه، بعد فعال شدن با همان نسخهٔ فعال و همان محتوا که صفحه نشان داد', async () => {
    const { tariff, activation, stepUp, writes, rows } = await ready();
    const result = await tariff.activate(OWNER, '2', { active: '1', fingerprint: activation.fingerprint, code: '123456' }, '1.2.3.4');
    expect(result).toEqual(ok({ version: 2, previous: 1 }));
    expect(stepUp).toHaveBeenCalledWith(OWNER, '123456', '1.2.3.4');
    const input = writes.at(-1)!.input as { expectedActive: number; verify: (list: PriceList) => boolean; at: Date };
    expect(input).toMatchObject({ version: 2, expectedActive: 1, at: NOW });
    expect(input.verify(activation.list)).toBe(true);
    expect(input.verify({ ...activation.list, label: 'دیگر' })).toBe(false);
    expect(rows.get(2)!.isActive).toBe(true);
    // دو کلیک: همان حالا فعال است؛ موفق، بی کد و بی کار دوباره.
    stepUp.mockClear();
    expect(await tariff.activate(OWNER, '2', { active: '1', fingerprint: activation.fingerprint, code: '' }, 'ip')).toEqual(ok({ version: 2, previous: null }));
    expect(stepUp).not.toHaveBeenCalled();
  });

  it('پیش از کد: نسخهٔ فعال یا محتوای دیگر «عوض شد»، و پیش‌نویس با ایراد «خطا دارد»؛ کد مصرف نمی‌شود', async () => {
    const { tariff, activation, stepUp, writes, rows } = await ready();
    const before = mutations(writes);
    expect(await tariff.activate(OWNER, '2', { active: '3', fingerprint: activation.fingerprint, code: '123456' }, 'ip')).toMatchObject({
      ok: false,
      status: 409,
      error: 'tariff_changed',
    });
    expect(await tariff.activate(OWNER, '2', { active: '1', fingerprint: fingerprint(V1), code: '123456' }, 'ip')).toMatchObject({
      error: 'tariff_changed',
    });
    // پیش‌نویسی که ایراد دارد (مثلاً از راه SQL): کاغذ پیش‌فرض خاموش.
    rows.get(2)!.list = { ...rows.get(2)!.list, paperTypes: { tahrir80: { ...V1.paperTypes.tahrir80!, enabled: false } } };
    const broken = fingerprint(rows.get(2)!.list);
    expect(await tariff.activate(OWNER, '2', { active: '1', fingerprint: broken, code: '123456' }, 'ip')).toMatchObject({ status: 400, error: 'invalid_draft' });
    expect((await tariff.activation(OWNER, '2')) as { value: { problems: unknown[] } }).toMatchObject({ value: { problems: [expect.anything()] } });
    expect(await tariff.activate(OWNER, '9', { active: '1', fingerprint: broken, code: '123456' }, 'ip')).toMatchObject({ status: 404 });
    expect(stepUp).not.toHaveBeenCalled();
    expect(mutations(writes)).toEqual(before);
  });

  it('کد نادرست یا حساب قفل: همان شکست، و فعال نمی‌شود', async () => {
    for (const failure of [fail(400, 'wrong_code'), fail(400, 'code_used'), fail(423, 'account_locked', { lockedUntil: NOW })]) {
      const { tariff, activation, writes, rows } = await ready(failure);
      expect(await tariff.activate(OWNER, '2', { active: '1', fingerprint: activation.fingerprint, code: '000000' }, 'ip')).toEqual(failure);
      expect(mutations(writes)).not.toContain('activate');
      expect(rows.get(1)!.isActive).toBe(true);
    }
  });

  it('زیر قفل عوض شد (فعال‌سازی هم‌زمان): «عوض شد»، نه خطا', async () => {
    const { tariff, activation, store } = await ready();
    store.activate = async () => ({ ok: false, reason: 'changed', active: 7 });
    expect(await tariff.activate(OWNER, '2', { active: '1', fingerprint: activation.fingerprint, code: '123456' }, 'ip')).toMatchObject({
      status: 409,
      error: 'tariff_changed',
    });
  });

  it('برگشت: نسخهٔ قبل دوباره، با تغییرهای برعکس؛ ایراد پیش‌نویس برایش سنجیده نمی‌شود', async () => {
    const { tariff, activation, rows } = await ready();
    await tariff.activate(OWNER, '2', { active: '1', fingerprint: activation.fingerprint, code: '123456' }, 'ip');
    // نسخه‌ای که پیش‌تر فعال بود، حتی اگر امروز ایرادی دارد (قاعده‌ای که بعداً سخت‌تر شد)، راه برگشت است.
    rows.get(1)!.list = { ...V1, paperTypes: { tahrir80: { ...V1.paperTypes.tahrir80!, nameFa: 'تحریر' } }, shippingMethods: { ...V1.shippingMethods, post: { nameFa: 'پست پیشتاز', enabled: false } } };
    const back = await tariff.activation(OWNER, '1');
    if (!back.ok) throw new Error('back');
    expect(back.value.again).toBe(true);
    expect(back.value.active.version).toBe(2);
    expect(back.value.problems).toEqual([]);
    expect(back.value.changes.lines.map((l) => l.value.map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : 'name' in s ? s.name : s.barcode)).join(''))).toEqual([
      '1,700 ← 1,600 تومان',
      '1,700 ← 1,600 تومان',
      '2,200 ← 2,000 تومان',
      '2,200 ← 2,000 تومان',
      'نام: تحریر',
      'عوض شد (روش‌های ارسال)',
    ]);
    expect(await tariff.activate(OWNER, '1', { active: '2', fingerprint: back.value.fingerprint, code: '123456' }, 'ip')).toEqual(ok({ version: 1, previous: 2 }));
  });
});

describe('خاموش موقت گزینه‌های تعرفهٔ فعال (۸٫۴، سؤال ۱۸۸)', () => {
  const spiral = V1.bindingTypes.spiral_clear!;
  /** نسخهٔ فعال با A5 و A3، گلاسه، کاغذ خاموش، منگنه و صحافی‌ای که در هیچ اندازه‌ای بازه ندارد. */
  const CATALOG: PriceList = {
    ...V1,
    printRates: {
      ...V1.printRates,
      a5: { single: { bw: 12_000, color: 15_000 }, double: { bw: 10_000, color: 13_000 } },
      a3: { single: { bw: 30_000, color: 40_000 }, double: { bw: 28_000, color: 38_000 } },
    },
    paperTypes: {
      tahrir80: { ...V1.paperTypes.tahrir80!, sheetRates: { a4: 0, a5: 0, a3: 0 } },
      glossy: { nameFa: 'گلاسه', gsm: 135, enabled: true, sheetRates: { a4: 15_000 } },
      old: { nameFa: 'کاهی', gsm: 70, enabled: false, sheetRates: { a4: 0 } },
    },
    bindingTypes: {
      spiral_clear: { ...spiral, bands: { ...spiral.bands, a5: spiral.bands.a4!, a3: spiral.bands.a4! } },
      staple: { nameFa: 'منگنه', enabled: true, minSheets: 1, maxSheetsPerVolume: 50, splitsVolumes: false, weightPerVolumeGrams: 1, bands: { a4: [{ minSheets: 1, maxSheets: 50, priceRials: 80_000 }] } },
      none: { nameFa: 'بی بازه', enabled: true, minSheets: 1, maxSheetsPerVolume: 50, splitsVolumes: false, weightPerVolumeGrams: 1, bands: {} },
    },
  };
  function catalog() {
    const built = service();
    built.rows.get(1)!.list = CATALOG;
    return built;
  }
  const items = async (tariff: ReturnType<typeof service>['tariff'], who = OWNER) => {
    const overview = await tariff.overview(who);
    if (!overview.ok) throw new Error(overview.error);
    return overview.value.availability;
  };

  it('کارت: اندازه‌های ارائه‌شده جز A4، و کاغذ و صحافی روشنی که اندازه‌ای دارند، جز پیش‌فرض‌ها؛ هر دو نقش می‌بینند', async () => {
    const { tariff } = catalog();
    expect(await items(tariff)).toEqual({
      canPause: true,
      items: [
        { kind: 'size', id: 'a5', name: 'A5', paused: false },
        { kind: 'size', id: 'a3', name: 'A3', paused: false },
        { kind: 'paper', id: 'glossy', name: 'گلاسه', paused: false },
        { kind: 'binding', id: 'staple', name: 'منگنه', paused: false },
      ],
    });
    expect((await items(tariff, VIEWER)).canPause).toBe(false);
    // تعرفهٔ پایه هیچ گزینهٔ خاموش‌شدنی ندارد: فقط پیش‌فرض‌ها و A4.
    expect(await items(service().tariff)).toEqual({ canPause: true, items: [] });
  });

  it('خاموش و روشن، هر کدام با رویداد `tariff.availability`؛ مقصد یکسان موفق و بی رویداد؛ متصدی هم', async () => {
    const { tariff, settings } = catalog();
    expect(await tariff.setAvailability(OPERATOR, { kind: 'size', id: 'a3', paused: '1', seen: '0' }, 'ip')).toEqual(
      ok({ item: { kind: 'size', id: 'a3', name: 'A3', paused: true }, written: true }),
    );
    expect(await tariff.setAvailability(OWNER, { kind: 'binding', id: 'staple', paused: '1', seen: '0' }, 'ip')).toMatchObject({ ok: true });
    expect(settings.values.get('catalog.paused')).toEqual({ sizes: ['a3'], papers: [], bindings: ['staple'] });
    expect((await items(tariff)).items.filter((item) => item.paused).map((item) => item.id)).toEqual(['a3', 'staple']);
    expect(await tariff.setAvailability(OWNER, { kind: 'size', id: 'a3', paused: '1', seen: '1' }, 'ip')).toEqual(
      ok({ item: { kind: 'size', id: 'a3', name: 'A3', paused: true }, written: false }),
    );
    expect(await tariff.setAvailability(OWNER, { kind: 'size', id: 'a3', paused: '0', seen: '1' }, 'ip')).toMatchObject({ ok: true });
    expect(settings.values.get('catalog.paused')).toEqual({ sizes: [], papers: [], bindings: ['staple'] });
    expect(settings.events.map((e) => [e.action, e.targetId, e.detail])).toEqual([
      ['tariff.availability', 'catalog.paused', { kind: 'size', id: 'a3', name: 'A3', paused: true, version: 1 }],
      ['tariff.availability', 'catalog.paused', { kind: 'binding', id: 'staple', name: 'منگنه', paused: true, version: 1 }],
      ['tariff.availability', 'catalog.paused', { kind: 'size', id: 'a3', name: 'A3', paused: false, version: 1 }],
    ]);
  });

  it('بی مجوز پیش از هر خواندن؛ پیش‌فرض‌ها، A4، گزینهٔ خاموش نسخه، بی اندازه و ناشناس «پیدا نشد»', async () => {
    const { tariff, settings } = catalog();
    expect(await tariff.setAvailability(VIEWER, { kind: 'size', id: 'a5', paused: '1', seen: '0' }, 'ip')).toMatchObject({ status: 403 });
    for (const [kind, id] of [
      ['size', 'a4'],
      ['paper', 'tahrir80'],
      ['binding', 'spiral_clear'],
      ['paper', 'old'],
      ['binding', 'none'],
      ['paper', 'staple'],
      ['binding', 'constructor'],
      ['size', 'b5'],
      [undefined, 'a5'],
    ] as const) {
      expect(await tariff.setAvailability(OWNER, { kind, id, paused: '1', seen: '0' }, 'ip'), `${kind}:${id}`).toMatchObject({
        status: 404,
        error: 'option_not_found',
      });
    }
    expect(settings.events).toEqual([]);
  });

  it('مقصد، نه برعکس کردن: صفحهٔ کهنه‌ای که همان را می‌خواهد که همین حالا هست موفق است، بی رویداد؛ ورودی ناجور رد', async () => {
    const { tariff, settings } = catalog();
    // صفحه «روشن» دید و «خاموش کن» زد؛ کس دیگری همین حالا خاموشش کرده بود.
    settings.values.set('catalog.paused', { sizes: [], papers: ['glossy'], bindings: [] });
    expect(await tariff.setAvailability(OWNER, { kind: 'paper', id: 'glossy', paused: '1', seen: '0' }, 'ip')).toMatchObject({ ok: true, value: { written: false } });
    // صفحه «خاموش» دید و «روشن کن» زد؛ همین حالا روشن است.
    settings.values.set('catalog.paused', { sizes: [], papers: [], bindings: [] });
    expect(await tariff.setAvailability(OWNER, { kind: 'paper', id: 'glossy', paused: '0', seen: '1' }, 'ip')).toMatchObject({ ok: true, value: { written: false } });
    // مقصد همان حالی که صفحه دید (فرم دست‌ساز؛ دکمهٔ صفحه همیشه برعکس آن است) و امروز چیز دیگری: «همین حالا جای دیگری عوض شد».
    settings.values.set('catalog.paused', { sizes: [], papers: ['glossy'], bindings: [] });
    expect(await tariff.setAvailability(OWNER, { kind: 'paper', id: 'glossy', paused: '0', seen: '0' }, 'ip')).toEqual(fail(409, 'availability_changed'));
    expect(settings.events).toEqual([]);
  });

  it('خاموشی مال گزینه است، نه نسخه: گزینه‌ای که در نسخهٔ فعال نیست در فهرست می‌ماند؛ مقدار خراب پیش‌فرض است', async () => {
    const { tariff, settings } = catalog();
    settings.values.set('catalog.paused', { sizes: ['a3'], papers: ['paper_gone'], bindings: [] });
    await tariff.setAvailability(OWNER, { kind: 'size', id: 'a5', paused: '1', seen: '0' }, 'ip');
    await tariff.setAvailability(OWNER, { kind: 'paper', id: 'glossy', paused: '1', seen: '0' }, 'ip');
    expect(settings.values.get('catalog.paused')).toEqual({ sizes: ['a3', 'a5'], papers: ['paper_gone', 'glossy'], bindings: [] });
    await tariff.setAvailability(OWNER, { kind: 'paper', id: 'glossy', paused: '0', seen: '1' }, 'ip');
    expect(settings.values.get('catalog.paused')).toEqual({ sizes: ['a3', 'a5'], papers: ['paper_gone'], bindings: [] });
    settings.values.set('catalog.paused', 'خراب');
    expect((await items(tariff)).items.every((item) => !item.paused)).toBe(true);
    await tariff.setAvailability(OWNER, { kind: 'paper', id: 'glossy', paused: '1', seen: '0' }, 'ip');
    expect(settings.values.get('catalog.paused')).toEqual({ sizes: [], papers: ['glossy'], bindings: [] });
  });
});
