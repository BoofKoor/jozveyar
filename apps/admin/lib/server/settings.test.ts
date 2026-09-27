/**
 * سرویس تنظیمات و کلیدهای پنل (`settings.ts`، برش ۴٫۶) با ذخیره‌گاه حافظه‌ای و ساعت ساختگی: مجوز در سرور، سنجش با همان
 * `SETTING_SCHEMAS`، «همان که دیده شد»، کد تازه فقط پس از هر سنجشی که بی کد جواب دارد، و مقدار کلید هیچ‌جا جز مهروموم. قفل،
 * تراکنش و CHECKها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  OFFICIAL_HOLIDAYS,
  seal,
  serviceKeyContext,
  unseal,
  type AdminEventInput,
  type SecretStore,
  type ServiceKeyName,
  type ServiceSecretRow,
  type SettingsStore,
} from '@jozveyar/db';

import type { AdminSession } from './auth';
import { fail, ok, type Result } from './result';
import { createPanelSettings, keySeenOf } from './settings';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const SECRET = 's'.repeat(64);
const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
const ENV_VALUE = 'env-kavenegar-key-00003f9a';
const PANEL_VALUE = 'panel-zibal-merchant-c2d8';

function session(permissions: string[]): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'sara',
    displayName: 'سارا',
    roles: ['owner'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
  };
}
const OWNER = session(['settings.edit', 'secrets.edit', 'tariff.read']);
const OPERATOR = session(['orders.read', 'orders.status', 'orders.address', 'files.download', 'tariff.read']);

/** ذخیره‌گاه تنظیم‌ها با همان قرارداد نسخهٔ پستگرس. */
function memorySettings() {
  const values = new Map<string, unknown>(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [key, structuredClone(value)]));
  const events: AdminEventInput[] = [];
  const store: SettingsStore = {
    async read(key) {
      return values.get(key);
    },
    async change(input) {
      const decision = input.decide(values.get(input.key));
      if (decision.kind === 'reject') return { ok: false, reason: decision.reason, ...(decision.detail ? { detail: decision.detail } : {}) };
      if (decision.kind === 'same') return { ok: true, written: false };
      values.set(input.key, decision.value);
      events.push({ adminUserId: input.actor.adminUserId, action: input.action, targetType: 'setting', targetId: input.key, ipHash: input.actor.ipHash, detail: decision.detail, at: input.at });
      return { ok: true, written: true };
    },
  };
  return { store, values, events };
}

/** ذخیره‌گاه کلیدها؛ `before` پیش از هر نوشتن اجرا می‌شود، برای کلیدی که «همین حالا» جای دیگری عوض شد. */
function memorySecrets() {
  const rows = new Map<ServiceKeyName, ServiceSecretRow>();
  const events: AdminEventInput[] = [];
  const hooks: { before?: () => void } = {};
  const store: SecretStore = {
    async list() {
      return [...rows.values()];
    },
    async read(name) {
      return rows.get(name) ?? null;
    },
    async put(input) {
      hooks.before?.();
      if (!input.verify(rows.get(input.name)?.sealed ?? null)) return 'changed';
      rows.set(input.name, { name: input.name, sealed: input.sealed, updatedAt: input.at, updatedBy: { id: input.actor.adminUserId, name: 'سارا' } });
      events.push({ adminUserId: input.actor.adminUserId, action: 'settings.key_set', targetType: 'service_key', targetId: input.name, detail: { ...input.detail, name: input.name }, at: input.at });
      return 'ok';
    },
    async remove(input) {
      hooks.before?.();
      const current = rows.get(input.name)?.sealed ?? null;
      if (current === null || !input.verify(current)) return 'changed';
      rows.delete(input.name);
      events.push({ adminUserId: input.actor.adminUserId, action: 'settings.key_revert', targetType: 'service_key', targetId: input.name, detail: { ...input.detail, name: input.name }, at: input.at });
      return 'ok';
    },
  };
  return { store, rows, events, hooks };
}

const panelRow = (name: ServiceKeyName, value: string, key = KEY, context = serviceKeyContext(name)): ServiceSecretRow => ({
  name,
  sealed: seal(key, value, context),
  updatedAt: new Date('2026-10-04T08:00:00Z'),
  updatedBy: { id: 'admin-1', name: 'سارا' },
});

function service(options: { stepUp?: Result<true>; secretsKey?: Buffer; env?: Record<string, string> } = {}) {
  const settings = memorySettings();
  const secrets = memorySecrets();
  const logs: string[] = [];
  const stepUp = vi.fn(async (_session: AdminSession, _code: unknown, _ip: string): Promise<Result<true>> => options.stepUp ?? ok<true>(true));
  const panel = createPanelSettings({
    settings: settings.store,
    secrets: secrets.store,
    stepUp,
    secretsKey: options.secretsKey ?? KEY,
    env: options.env ?? { SMS_API_KEY: ENV_VALUE, PAYMENT_MERCHANT_ID: 'env-merchant-0000' },
    secret: SECRET,
    now: () => NOW,
    log: (message, error) => logs.push(`${message} ${error ?? ''}`),
  });
  return { panel, settings, secrets, stepUp, logs };
}

/** هیچ‌جای این‌ها مقدار کلید نیست. */
const leaks = (value: string, ...things: unknown[]) => things.some((thing) => JSON.stringify(thing).includes(value));

describe('مجوز در سرور', () => {
  it('متصدی نه صفحه، نه هیچ کاری؛ و کار کلید بی مجوز کد نمی‌خواهد', async () => {
    const { panel, stepUp, settings, secrets } = service();
    expect(await panel.overview(OPERATOR)).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    expect(await panel.saveNumber(OPERATOR, { key: 'order.sla_days', value: '3', seen: '2' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.addHoliday(OPERATOR, { date: '1406/04/01', title: 'x' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.removeHoliday(OPERATOR, { date: '1405/10/02' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.confirmOfficial(OPERATOR, { year: '1406' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.setKey(OPERATOR, { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none', code: '123456' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.revertKey(OPERATOR, { name: 'SMS_API_KEY', seen: 'none', code: '123456' }, 'ip')).toMatchObject({ status: 403 });
    // مجوز پیش از هر سنجش: بی مجوز، نه «مقدار نادرست» و نه «کلید ناشناس».
    expect(await panel.setKey(OPERATOR, { name: 'SMS_API_KEY', value: 'a b', seen: 'none', code: '1' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.setKey(OPERATOR, { name: 'CHECKOUT_MODE', value: 'on', seen: 'none', code: '1' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.saveNumber(OPERATOR, { key: 'file.max_pages', value: 'x', seen: '' }, 'ip')).toMatchObject({ status: 403 });
    expect(stepUp).not.toHaveBeenCalled();
    expect(settings.events).toEqual([]);
    expect(secrets.events).toEqual([]);
  });

  it('تنظیم‌ها بی مجوز کلید، و کلیدها بی مجوز تنظیم، هر کدام فقط بخش خودش', async () => {
    const { panel } = service();
    const settingsOnly = await panel.overview(session(['settings.edit']));
    expect(settingsOnly).toMatchObject({ ok: true, value: { canSettings: true, canSecrets: false, keys: [] } });
    const keysOnly = await panel.overview(session(['secrets.edit']));
    expect(keysOnly).toMatchObject({ ok: true, value: { canSettings: false, canSecrets: true, values: null } });
    expect(await panel.saveNumber(session(['secrets.edit']), { key: 'order.sla_days', value: '3', seen: '2' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.setKey(session(['settings.edit']), { name: 'SMS_API_KEY', value: 'abcdefgh', seen: 'none', code: '1' }, 'ip')).toMatchObject({
      status: 403,
    });
  });
});

describe('نمای صفحه', () => {
  it('تنظیم‌ها از پایگاه داده، و هر کلید با منبعش و فقط ۴ نویسهٔ آخر؛ مقدار کامل هیچ‌جای نما نیست', async () => {
    const { panel, secrets, settings } = service();
    settings.values.set('order.sla_days', 3);
    secrets.rows.set('PAYMENT_MERCHANT_ID', panelRow('PAYMENT_MERCHANT_ID', PANEL_VALUE));
    const result = await panel.overview(OWNER);
    if (!result.ok) throw new Error(result.error);
    const view = result.value;
    expect(view.values).toMatchObject({ slaDays: 3, otpLimit: 300, officialThrough: 1405 });
    expect(view.values!.holidays).toEqual(OFFICIAL_HOLIDAYS);
    expect(view.keys.map((k) => [k.name, k.source, k.tail, k.updatedBy, k.envSet, k.envTail])).toEqual([
      ['SMS_API_KEY', 'env', '3f9a', null, true, '3f9a'],
      ['SMS_OTP_TEMPLATE', 'empty', null, null, false, null],
      ['PAYMENT_MERCHANT_ID', 'panel', 'c2d8', 'سارا', true, '0000'],
    ]);
    expect(view.keys[2]!.seen).toBe(keySeenOf(secrets.rows.get('PAYMENT_MERCHANT_ID')!.sealed));
    expect(view.keys[0]!.seen).toBe('none');
    expect(leaks(PANEL_VALUE, view)).toBe(false);
    expect(leaks(ENV_VALUE, view)).toBe(false);
    // مهروموم هم نه: نسخهٔ دیده‌شده اثر انگشت آن است.
    expect(leaks(secrets.rows.get('PAYMENT_MERCHANT_ID')!.sealed, view)).toBe(false);
  });

  it('مقدار پنلی که با SECRETS_KEY امروز یا در جای خودش باز نمی‌شود: «خوانده نشد»، نه .env و نه خالی، نه ۵۰۰؛ لاگ بی مقدار', async () => {
    const { panel, secrets, logs } = service({ secretsKey: Buffer.alloc(32, 7) });
    secrets.rows.set('SMS_API_KEY', panelRow('SMS_API_KEY', PANEL_VALUE));
    const result = await panel.overview(OWNER);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.keys[0]).toMatchObject({ name: 'SMS_API_KEY', source: 'unreadable', tail: null, envSet: true });
    expect(logs.some((line) => line.includes('SMS_API_KEY') && line.includes('SECRETS_KEY'))).toBe(true);
    expect(logs.join('\n')).not.toContain(PANEL_VALUE);

    const swapped = service();
    // مقدار مهروموم‌شدهٔ کلید API در ردیف کد پذیرنده.
    swapped.secrets.rows.set('PAYMENT_MERCHANT_ID', panelRow('PAYMENT_MERCHANT_ID', PANEL_VALUE, KEY, serviceKeyContext('SMS_API_KEY')));
    const view = await swapped.panel.overview(OWNER);
    expect(view.ok && view.value.keys[2]!.source).toBe('unreadable');
  });

  it('تنظیم خراب: پیش‌فرض و لاگ بلند (readSetting)، نه شکستن صفحه', async () => {
    const { panel, settings, logs } = service();
    settings.values.set('calendar.holidays', 'خراب');
    settings.values.set('order.sla_days', 99);
    const result = await panel.overview(OWNER);
    expect(result.ok && result.value.values).toMatchObject({ slaDays: 2, holidays: OFFICIAL_HOLIDAYS });
    expect(logs.some((line) => line.includes('calendar.holidays'))).toBe(true);
    expect(logs.some((line) => line.includes('order.sla_days'))).toBe(true);
  });
});

describe('تنظیم‌های عددی', () => {
  it('روز کاری تحویل: ۱ تا ۳۰ روز، ارقام فارسی؛ رویداد با قبل و بعد؛ مقصد یکسان بی رویداد', async () => {
    const { panel, settings } = service();
    expect(await panel.saveNumber(OWNER, { key: 'order.sla_days', value: '۳', seen: '2' }, 'ip')).toEqual(
      ok({ key: 'order.sla_days', value: 3, written: true }),
    );
    expect(settings.values.get('order.sla_days')).toBe(3);
    expect(settings.events).toMatchObject([{ action: 'settings.update', targetId: 'order.sla_days', detail: { key: 'order.sla_days', from: 2, to: 3 } }]);
    // دو کلیک، یا زبانه‌ای که همان را زد: موفق و بی رویداد دوم.
    expect(await panel.saveNumber(OWNER, { key: 'order.sla_days', value: '3', seen: '2' }, 'ip')).toEqual(
      ok({ key: 'order.sla_days', value: 3, written: false }),
    );
    expect(settings.events).toHaveLength(1);
    for (const [value, good] of [['1', true], ['30', true], ['0', false], ['31', false], ['2.5', false], ['', false], ['دو', false]] as const) {
      const result = await panel.saveNumber(OWNER, { key: 'order.sla_days', value, seen: String(settings.values.get('order.sla_days')) }, 'ip');
      expect(result.ok, value).toBe(good);
      if (!good) expect(result).toMatchObject({ status: 400, error: 'invalid_setting' });
    }
  });

  it('سقف ساعتی کد پیامکی: ۱ تا ۱۰۰٬۰۰۰، با جداکنندهٔ هزارگان', async () => {
    const { panel, settings } = service();
    expect(await panel.saveNumber(OWNER, { key: 'otp.site_hourly_limit', value: '۱٬۰۰۰', seen: '300' }, 'ip')).toMatchObject({ ok: true });
    expect(settings.values.get('otp.site_hourly_limit')).toBe(1000);
    expect(await panel.saveNumber(OWNER, { key: 'otp.site_hourly_limit', value: '100000', seen: '1000' }, 'ip')).toMatchObject({ ok: true });
    expect(await panel.saveNumber(OWNER, { key: 'otp.site_hourly_limit', value: '100001', seen: '100000' }, 'ip')).toMatchObject({
      status: 400,
      error: 'invalid_setting',
    });
    expect(await panel.saveNumber(OWNER, { key: 'otp.site_hourly_limit', value: '0', seen: '100000' }, 'ip')).toMatchObject({ status: 400 });
  });

  it('روزهای نگهداری فایل‌های سفارش (۵٫۱، ADR-044): ۷ تا ۳۶۵، ارقام فارسی هم؛ بیرون از بازه هیچ', async () => {
    const { panel, settings } = service();
    settings.values.set('order.files_retention_days', 30);
    expect(await panel.saveNumber(OWNER, { key: 'order.files_retention_days', value: '۴۵', seen: '30' }, 'ip')).toEqual(
      ok({ key: 'order.files_retention_days', value: 45, written: true }),
    );
    expect(settings.events).toMatchObject([{ action: 'settings.update', detail: { key: 'order.files_retention_days', from: 30, to: 45 } }]);
    // کمتر از یک هفته فرصت چاپ دوبارهٔ بستهٔ گم‌شده را می‌برد؛ بیش از یک سال فقط دیسک است. مرزها صریح.
    for (const [value, good] of [['7', true], ['365', true], ['6', false], ['366', false], ['0', false]] as const) {
      const seen = String(settings.values.get('order.files_retention_days'));
      const result = await panel.saveNumber(OWNER, { key: 'order.files_retention_days', value, seen }, 'ip');
      expect(result.ok, value).toBe(good);
      if (!good) expect(result).toMatchObject({ status: 400, error: 'invalid_setting' });
    }
    // فقط مالک (`settings.edit`).
    expect(await panel.saveNumber(OPERATOR, { key: 'order.files_retention_days', value: '40', seen: '365' }, 'ip')).toMatchObject({
      status: 403,
    });
  });

  it('همان که دیده شد: زبانه‌ای که عدد کهنه را دید رونویسی نمی‌کند؛ تنظیم دیگر پیدا نمی‌شود', async () => {
    const { panel, settings } = service();
    settings.values.set('order.sla_days', 4);
    expect(await panel.saveNumber(OWNER, { key: 'order.sla_days', value: '3', seen: '2' }, 'ip')).toEqual(
      fail(409, 'setting_changed', { key: 'order.sla_days' }),
    );
    expect(settings.values.get('order.sla_days')).toBe(4);
    expect(settings.events).toEqual([]);
    for (const key of ['calendar.holidays', 'file.max_pages', '', undefined]) {
      expect(await panel.saveNumber(OWNER, { key, value: '3', seen: '2' }, 'ip'), String(key)).toMatchObject({ status: 404, error: 'setting_not_found' });
    }
  });
});

describe('تعطیلی‌ها', () => {
  it('افزودن: روز آینده با ارقام فارسی، به ترتیب تاریخ؛ رویداد با تاریخ و مناسبت', async () => {
    const { panel, settings } = service();
    expect(await panel.addHoliday(OWNER, { date: '۱۴۰۶/۴/۱', title: ' آزمایش ' }, 'ip')).toEqual(ok({ date: '1406/04/01', title: 'آزمایش' }));
    const list = settings.values.get('calendar.holidays') as { date: string }[];
    expect(list).toHaveLength(OFFICIAL_HOLIDAYS.length + 1);
    expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
    expect(list.findIndex((h) => h.date === '1406/04/01')).toBe(list.findIndex((h) => h.date === '1406/03/26') + 1);
    expect(settings.events).toMatchObject([{ action: 'settings.holiday_add', detail: { date: '1406/04/01', title: 'آزمایش' } }]);
  });

  it('تکراری با مناسبتش؛ گذشته، امروز، دورتر از سال بعد، یا تاریخی که در تقویم نیست: خطا با جایش، بی نوشتن', async () => {
    const { panel, settings } = service();
    expect(await panel.addHoliday(OWNER, { date: '1405/10/02', title: 'دوباره' }, 'ip')).toEqual(
      fail(409, 'holiday_exists', { date: '1405/10/02', title: 'ولادت امام علی (ع) / روز پدر' }),
    );
    expect(await panel.addHoliday(OWNER, { date: '1405/07/13', title: 'امروز' }, 'ip')).toMatchObject({ status: 400, errors: { date: 'holiday_past' } });
    expect(await panel.addHoliday(OWNER, { date: '1407/01/01', title: 'x' }, 'ip')).toMatchObject({ status: 400, errors: { date: 'holiday_too_far' } });
    expect(await panel.addHoliday(OWNER, { date: '1405/12/30', title: 'x' }, 'ip')).toMatchObject({ status: 400, errors: { date: 'holiday_date_invalid' } });
    expect(await panel.addHoliday(OWNER, { date: '1406/04/01', title: '' }, 'ip')).toMatchObject({ status: 400, errors: { title: 'holiday_title' } });
    expect(settings.values.get('calendar.holidays')).toEqual(OFFICIAL_HOLIDAYS);
    expect(settings.events).toEqual([]);
  });

  it('حذف، گذشته هم؛ روزی که دیگر نیست «همین حالا حذف شد»', async () => {
    const { panel, settings } = service();
    expect(await panel.removeHoliday(OWNER, { date: '1405/01/01' }, 'ip')).toEqual(ok({ date: '1405/01/01', title: 'عید سعید فطر / عید نوروز' }));
    expect(await panel.removeHoliday(OWNER, { date: '1405/10/02' }, 'ip')).toMatchObject({ ok: true });
    const list = settings.values.get('calendar.holidays') as { date: string }[];
    expect(list).toHaveLength(OFFICIAL_HOLIDAYS.length - 2);
    expect(list.some((h) => h.date === '1405/10/02')).toBe(false);
    expect(await panel.removeHoliday(OWNER, { date: '1405/10/02' }, 'ip')).toEqual(fail(409, 'holiday_missing', { date: '1405/10/02' }));
    expect(await panel.removeHoliday(OWNER, { date: '1405-10-02' }, 'ip')).toMatchObject({ status: 409, error: 'holiday_missing' });
    expect(settings.events.map((e) => [e.action, e.detail])).toEqual([
      ['settings.holiday_remove', { date: '1405/01/01', title: 'عید سعید فطر / عید نوروز' }],
      ['settings.holiday_remove', { date: '1405/10/02', title: 'ولادت امام علی (ع) / روز پدر' }],
    ]);
  });

  it('فهرست ذخیره‌شدهٔ خراب: افزودن روی پیش‌فرض، همان که سایت به کار می‌برد', async () => {
    const { panel, settings } = service();
    settings.values.set('calendar.holidays', [{ date: 'خراب' }]);
    expect(await panel.addHoliday(OWNER, { date: '1406/04/01', title: 'آزمایش' }, 'ip')).toMatchObject({ ok: true });
    expect(settings.values.get('calendar.holidays')).toHaveLength(OFFICIAL_HOLIDAYS.length + 1);
  });

  it('«با تقویم رسمی تطبیق دادم»: فقط سالی که در فهرست است؛ دوباره همان، موفق و بی رویداد', async () => {
    const { panel, settings } = service();
    expect(await panel.confirmOfficial(OWNER, { year: '1407' }, 'ip')).toMatchObject({ status: 400, error: 'invalid_setting' });
    expect(await panel.confirmOfficial(OWNER, { year: 'x' }, 'ip')).toMatchObject({ status: 400 });
    expect(await panel.confirmOfficial(OWNER, { year: '1406' }, 'ip')).toEqual(ok({ year: 1406 }));
    expect(settings.values.get('calendar.official_through')).toBe(1406);
    expect(await panel.confirmOfficial(OWNER, { year: '1406' }, 'ip')).toEqual(ok({ year: 1406 }));
    expect(await panel.confirmOfficial(OWNER, { year: '1405' }, 'ip')).toEqual(ok({ year: 1405 }));
    expect(settings.values.get('calendar.official_through')).toBe(1406);
    expect(settings.events).toMatchObject([{ action: 'settings.update', detail: { key: 'calendar.official_through', from: 1405, to: 1406 } }]);
  });
});

describe('کلیدها', () => {
  it('مقدار پنل با کد تازه: مهروموم در جای خودش، رویداد با نام و منبع قبلی؛ مقدار نه در رویداد، نه پاسخ، نه لاگ', async () => {
    const { panel, secrets, stepUp, logs } = service();
    const value = 'fresh-kavenegar-key-77aa';
    const result = await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: `  ${value}\n`, seen: 'none', code: '123456' }, '10.0.0.1');
    expect(result).toEqual(ok({ name: 'SMS_API_KEY' }));
    expect(stepUp).toHaveBeenCalledWith(OWNER, '123456', '10.0.0.1');
    const row = secrets.rows.get('SMS_API_KEY')!;
    expect(unseal(KEY, row.sealed, serviceKeyContext('SMS_API_KEY'))).toBe(value);
    expect(row.sealed).not.toContain(value);
    expect(() => unseal(KEY, row.sealed, serviceKeyContext('PAYMENT_MERCHANT_ID'))).toThrow();
    expect(secrets.events).toMatchObject([{ action: 'settings.key_set', targetId: 'SMS_API_KEY', detail: { name: 'SMS_API_KEY', from: 'env' } }]);
    expect(leaks(value, result, secrets.events, logs)).toBe(false);
    const view = await panel.overview(OWNER);
    expect(view.ok && view.value.keys[0]).toMatchObject({ source: 'panel', tail: '77aa', envTail: '3f9a' });
    expect(leaks(value, view)).toBe(false);
    // خالی پیش از این: «وارد شد».
    expect(await panel.setKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: 'jozveyar-otp', seen: 'none', code: '1' }, 'ip')).toMatchObject({ ok: true });
    expect(secrets.events[1]).toMatchObject({ detail: { name: 'SMS_OTP_TEMPLATE', from: 'empty' } });
  });

  it('پیش از کد: مقدار نادرست، کلید ناشناس، و کلیدی که همین حالا جای دیگری عوض شد؛ کد نه مصرف می‌شود نه «نادرست»', async () => {
    const { panel, secrets, stepUp } = service();
    for (const value of ['', 'دو کلمه', 'a b', 'x'.repeat(513)]) {
      expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value, seen: 'none', code: '123456' }, 'ip'), value).toMatchObject({
        status: 400,
        error: 'invalid_key_value',
      });
    }
    for (const name of ['CHECKOUT_MODE', 'SMS_PROVIDER', 'SECRETS_KEY', 'sms_api_key', undefined]) {
      expect(await panel.setKey(OWNER, { name, value: 'abcdefgh1234', seen: 'none', code: '1' }, 'ip'), String(name)).toMatchObject({
        status: 404,
        error: 'key_not_found',
      });
    }
    secrets.rows.set('PAYMENT_MERCHANT_ID', panelRow('PAYMENT_MERCHANT_ID', PANEL_VALUE));
    // صفحه «مقدار پنلی نیست» را دید؛ حالا هست.
    expect(await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value: 'abcdefgh1234', seen: 'none', code: '1' }, 'ip')).toEqual(
      fail(409, 'key_changed', { name: 'PAYMENT_MERCHANT_ID' }),
    );
    expect(await panel.revertKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', seen: 'panel:دیگری', code: '1' }, 'ip')).toMatchObject({ status: 409, error: 'key_changed' });
    // مقدار پنلی نیست: برگرداندن چیزی ندارد.
    expect(await panel.revertKey(OWNER, { name: 'SMS_API_KEY', seen: 'none', code: '1' }, 'ip')).toMatchObject({ status: 409, error: 'key_changed' });
    expect(stepUp).not.toHaveBeenCalled();
    expect(secrets.events).toEqual([]);
  });

  it('کد نادرست یا قفل: هیچ نوشته نمی‌شود، و همان خطای کد برمی‌گردد', async () => {
    for (const failure of [fail(400, 'wrong_code'), fail(400, 'code_used'), fail(423, 'account_locked', { lockedUntil: NOW })]) {
      const { panel, secrets } = service({ stepUp: failure });
      expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none', code: '000000' }, 'ip')).toEqual(failure);
      expect(secrets.rows.size).toBe(0);
      secrets.rows.set('PAYMENT_MERCHANT_ID', panelRow('PAYMENT_MERCHANT_ID', PANEL_VALUE));
      const seen = keySeenOf(secrets.rows.get('PAYMENT_MERCHANT_ID')!.sealed);
      expect(await panel.revertKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', seen, code: '000000' }, 'ip')).toEqual(failure);
      expect(secrets.rows.has('PAYMENT_MERCHANT_ID')).toBe(true);
      expect(secrets.events).toEqual([]);
    }
  });

  it('کلیدی که میان سنجش و نوشتن عوض شد: زیر قفل هم «همین حالا عوض شد»، نه رونویسی', async () => {
    const { panel, secrets } = service();
    secrets.hooks.before = () => secrets.rows.set('SMS_API_KEY', panelRow('SMS_API_KEY', 'another-tab-value-1234'));
    expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'mine-value-5678', seen: 'none', code: '1' }, 'ip')).toMatchObject({
      status: 409,
      error: 'key_changed',
    });
    expect(unseal(KEY, secrets.rows.get('SMS_API_KEY')!.sealed, serviceKeyContext('SMS_API_KEY'))).toBe('another-tab-value-1234');
  });

  it('برگرداندن به .env با کد تازه: مقدار پنل پاک، از این لحظه .env؛ رویداد با مقصد', async () => {
    const { panel, secrets, stepUp } = service();
    secrets.rows.set('PAYMENT_MERCHANT_ID', panelRow('PAYMENT_MERCHANT_ID', PANEL_VALUE));
    secrets.rows.set('SMS_OTP_TEMPLATE', panelRow('SMS_OTP_TEMPLATE', 'jozveyar-otp'));
    const seenOf = (name: ServiceKeyName) => keySeenOf(secrets.rows.get(name)!.sealed);
    expect(await panel.revertKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', seen: seenOf('PAYMENT_MERCHANT_ID'), code: '1' }, 'ip')).toEqual(
      ok({ name: 'PAYMENT_MERCHANT_ID' }),
    );
    expect(await panel.revertKey(OWNER, { name: 'SMS_OTP_TEMPLATE', seen: seenOf('SMS_OTP_TEMPLATE'), code: '2' }, 'ip')).toMatchObject({ ok: true });
    expect(stepUp).toHaveBeenCalledTimes(2);
    expect(secrets.events.map((e) => e.detail)).toEqual([
      { name: 'PAYMENT_MERCHANT_ID', to: 'env' },
      { name: 'SMS_OTP_TEMPLATE', to: 'empty' },
    ]);
    const view = await panel.overview(OWNER);
    expect(view.ok && view.value.keys.map((k) => k.source)).toEqual(['env', 'empty', 'env']);
  });
});
