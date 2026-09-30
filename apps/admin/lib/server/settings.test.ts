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

import { SmsError } from '@jozveyar/sms';

import type { AdminSession } from './auth';
import { fail, ok, type Result } from './result';
import { KEY_TESTS_PER_HOUR, KEY_TEST_TTL_MS, createPanelSettings, keySeenOf, type SmsKeyTester } from './settings';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const SECRET = 's'.repeat(64);
const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
const ENV_VALUE = 'env-smsir-key-00003f9a';
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
    partner: null,
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

/**
 * ذخیره‌گاه کلیدها؛ `before` پیش از هر نوشتن اجرا می‌شود، برای کلیدی که «همین حالا» جای دیگری عوض شد. رویدادهای «آزمایش» (۷٫۱) جدا در
 * `tests`، با همان قرارداد نسخهٔ پستگرس: سقف روی آزمایش‌های ساعت گذشته، و رویداد پس از نتیجه.
 */
function memorySecrets() {
  const rows = new Map<ServiceKeyName, ServiceSecretRow>();
  const events: AdminEventInput[] = [];
  const tests: AdminEventInput[] = [];
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
    async runTest(input, run) {
      const since = input.at.getTime() - 3_600_000;
      if (tests.filter((e) => e.at.getTime() > since).length >= input.limit) return null;
      const { value, detail } = await run();
      tests.push({ adminUserId: input.actor.adminUserId, action: 'settings.key_test', targetType: 'service_key', targetId: input.name, ipHash: input.actor.ipHash, detail: { ...detail, name: input.name }, at: input.at });
      return value;
    },
    async lastTests() {
      const last = new Map<ServiceKeyName, { at: Date; detail: Record<string, unknown> }>();
      for (const e of tests) last.set(e.targetId as ServiceKeyName, { at: e.at, detail: e.detail as Record<string, unknown> });
      return last;
    },
  };
  return { store, rows, events, tests, hooks };
}

/** sms.ir ساختگی برای «آزمایش»: هر درخواست با مقدارش ثبت می‌شود (فقط در همین تست)؛ پاسخ پیش‌فرض موفق، یا همان که تست می‌دهد. */
function fakeTester(over: Partial<SmsKeyTester>) {
  const calls: Record<string, unknown>[] = [];
  const tester: SmsKeyTester = {
    async credit(apiKey) {
      calls.push({ kind: 'credit', apiKey });
      return over.credit ? over.credit(apiKey) : 165.3;
    },
    async send(input) {
      calls.push({ kind: 'send', ...input });
      return over.send ? over.send(input) : { messageId: '872364912', cost: 1.1 };
    },
  };
  return { tester, calls };
}

const panelRow = (name: ServiceKeyName, value: string, key = KEY, context = serviceKeyContext(name)): ServiceSecretRow => ({
  name,
  sealed: seal(key, value, context),
  updatedAt: new Date('2026-10-04T08:00:00Z'),
  updatedBy: { id: 'admin-1', name: 'سارا' },
});

function service(
  options: { stepUp?: Result<true>; secretsKey?: Buffer; env?: Record<string, string>; tester?: Partial<SmsKeyTester> | null } = {},
) {
  const settings = memorySettings();
  const secrets = memorySecrets();
  const sms = fakeTester(options.tester ?? {});
  const clock = { now: NOW };
  const logs: string[] = [];
  const stepUp = vi.fn(async (_session: AdminSession, _code: unknown, _ip: string): Promise<Result<true>> => options.stepUp ?? ok<true>(true));
  const panel = createPanelSettings({
    settings: settings.store,
    secrets: secrets.store,
    ...(options.tester === null ? {} : { smsTester: sms.tester }),
    stepUp,
    secretsKey: options.secretsKey ?? KEY,
    env: options.env ?? { SMS_API_KEY: ENV_VALUE, PAYMENT_MERCHANT_ID: 'env-merchant-0000' },
    secret: SECRET,
    now: () => clock.now,
    log: (message, error) => logs.push(`${message} ${error ?? ''}`),
  });
  return { panel, settings, secrets, stepUp, logs, sms, clock };
}

/** «آزمایش» یک کلید sms.ir با مالک، همان راه فرم؛ نشانی ذخیره‌اش. */
async function testedToken(panel: ReturnType<typeof service>['panel'], name: ServiceKeyName, value: string, seen = 'none') {
  const result = await panel.testKey(OWNER, { name, value, seen, mobile: '09123456789' }, 'ip');
  if (!result.ok || !result.value.token) throw new Error(result.ok ? result.value.outcome : result.error);
  return result.value.token;
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
      ['SMS_PAID_TEMPLATE', 'empty', null, null, false, null],
      ['SMS_TRACKING_TEMPLATE', 'empty', null, null, false, null],
      ['PAYMENT_MERCHANT_ID', 'panel', 'c2d8', 'سارا', true, '0000'],
    ]);
    expect(view.keys[4]!.seen).toBe(keySeenOf(secrets.rows.get('PAYMENT_MERCHANT_ID')!.sealed));
    expect(view.keys[0]!.seen).toBe('none');
    // هنوز هیچ «آزمایش»ی (۷٫۱).
    expect(view.keys.map((k) => k.lastTest)).toEqual([null, null, null, null, null]);
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
    expect(view.ok && view.value.keys[4]!.source).toBe('unreadable');
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

describe('بازه‌های وزن گزارش ارسال (۶٫۴)', () => {
  const OWNER_REPORTS = session(['settings.edit', 'secrets.edit', 'tariff.read', 'reports.read']);
  const fields = (...values: string[]) => values;

  it('فقط مالک: تنظیم است (`settings.edit`) و فقط برای گزارش (`reports.read`)؛ بی مجوز پیش از هر سنجش', async () => {
    const { panel, settings } = service();
    for (const who of [OPERATOR, OWNER, session(['reports.read'])]) {
      expect(await panel.saveReportBands(who, { values: fields('bad'), seen: 'tariff' }, 'ip')).toMatchObject({ status: 403, error: 'forbidden' });
      expect(await panel.resetReportBands(who, { seen: 'tariff' }, 'ip')).toMatchObject({ status: 403 });
    }
    expect(settings.events).toEqual([]);
  });

  it('مرزها با ارقام فارسی؛ رویداد `settings.update` با از و به؛ مقصد یکسان بی رویداد دوم', async () => {
    const { panel, settings } = service();
    expect(settings.values.get('report.weight_bands')).toBe('tariff');
    expect(await panel.saveReportBands(OWNER_REPORTS, { values: fields('۷۵۰', '1,500', '', '3000'), seen: 'tariff' }, 'ip')).toEqual({
      ok: true,
      value: { bands: [750, 1_500, 3_000], written: true },
    });
    expect(settings.values.get('report.weight_bands')).toEqual([750, 1_500, 3_000]);
    expect(settings.events).toEqual([
      expect.objectContaining({
        action: 'settings.update',
        targetType: 'setting',
        targetId: 'report.weight_bands',
        detail: { key: 'report.weight_bands', from: 'tariff', to: [750, 1_500, 3_000] },
      }),
    ]);
    expect(await panel.saveReportBands(OWNER_REPORTS, { values: fields('750', '1500', '3000'), seen: 'tariff' }, 'ip')).toEqual({
      ok: true,
      value: { bands: [750, 1_500, 3_000], written: false },
    });
    expect(settings.events).toHaveLength(1);
  });

  it('خطای هر فیلد با جایش، بی نوشتن', async () => {
    const { panel, settings } = service();
    expect(await panel.saveReportBands(OWNER_REPORTS, { values: fields('1000', '500', 'x'), seen: 'tariff' }, 'ip')).toMatchObject({
      ok: false,
      status: 400,
      error: 'invalid_bands',
      errors: [null, { code: 'order', after: 1_000 }, { code: 'number' }],
    });
    expect(await panel.saveReportBands(OWNER_REPORTS, { values: fields('', ''), seen: 'tariff' }, 'ip')).toMatchObject({
      error: 'invalid_bands',
      errors: [{ code: 'empty' }, null],
    });
    expect(settings.values.get('report.weight_bands')).toBe('tariff');
    expect(settings.events).toEqual([]);
  });

  it('همان که دیده شد: صفحه‌ای که بازه‌های کهنه را دید رونویسی نمی‌کند؛ برگرداندن به بازه‌های تعرفه (تصمیم ۱۰۹)', async () => {
    const { panel, settings } = service();
    settings.values.set('report.weight_bands', [2_000]);
    expect(await panel.saveReportBands(OWNER_REPORTS, { values: fields('1000'), seen: 'tariff' }, 'ip')).toMatchObject({
      ok: false,
      status: 409,
      error: 'setting_changed',
    });
    expect(await panel.resetReportBands(OWNER_REPORTS, { seen: 'tariff' }, 'ip')).toMatchObject({ error: 'setting_changed' });
    expect(settings.values.get('report.weight_bands')).toEqual([2_000]);
    expect(await panel.resetReportBands(OWNER_REPORTS, { seen: '2000' }, 'ip')).toEqual({ ok: true, value: { bands: 'tariff', written: true } });
    expect(settings.values.get('report.weight_bands')).toBe('tariff');
    expect(settings.events.map((e) => e.detail)).toEqual([{ key: 'report.weight_bands', from: [2_000], to: 'tariff' }]);
    // دوباره برگرداندن (دو کلیک): موفق، بی رویداد.
    expect(await panel.resetReportBands(OWNER_REPORTS, { seen: '2000' }, 'ip')).toEqual({ ok: true, value: { bands: 'tariff', written: false } });
    expect(settings.events).toHaveLength(1);
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
  it('مقدار پنل با کد تازه: مهروموم در جای خودش، رویداد با نام، منبع قبلی و نتیجهٔ آزمایش؛ مقدار نه در رویداد، نه پاسخ، نه لاگ', async () => {
    const { panel, secrets, stepUp, logs } = service();
    const value = 'fresh-smsir-key-77aa';
    const test = await testedToken(panel, 'SMS_API_KEY', value);
    const result = await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: `  ${value}\n`, seen: 'none', code: '123456', test }, '10.0.0.1');
    expect(result).toEqual(ok({ name: 'SMS_API_KEY' }));
    expect(stepUp).toHaveBeenCalledWith(OWNER, '123456', '10.0.0.1');
    const row = secrets.rows.get('SMS_API_KEY')!;
    expect(unseal(KEY, row.sealed, serviceKeyContext('SMS_API_KEY'))).toBe(value);
    expect(row.sealed).not.toContain(value);
    expect(() => unseal(KEY, row.sealed, serviceKeyContext('PAYMENT_MERCHANT_ID'))).toThrow();
    expect(secrets.events).toEqual([
      expect.objectContaining({ action: 'settings.key_set', targetId: 'SMS_API_KEY', detail: { name: 'SMS_API_KEY', from: 'env', tested: 'ok' } }),
    ]);
    expect(leaks(value, result, secrets.events, secrets.tests, logs)).toBe(false);
    const view = await panel.overview(OWNER);
    expect(view.ok && view.value.keys[0]).toMatchObject({ source: 'panel', tail: '77aa', envTail: '3f9a' });
    expect(leaks(value, view)).toBe(false);
    // خالی پیش از این: «وارد شد»؛ شناسهٔ قالب عدد است (۷٫۱)، با ارقام فارسی هم، و ۴ رقم آخرش راز نیست.
    const otp = await testedToken(panel, 'SMS_OTP_TEMPLATE', '872716');
    expect(await panel.setKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '۸۷۲۷۱۶', seen: 'none', code: '1', test: otp }, 'ip')).toMatchObject({ ok: true });
    expect(secrets.events[1]).toMatchObject({ detail: { name: 'SMS_OTP_TEMPLATE', from: 'empty', tested: 'ok' } });
    const after = await panel.overview(OWNER);
    expect(after.ok && after.value.keys[1]).toMatchObject({ source: 'panel', tail: '2716' });
    // کد پذیرندهٔ زیبال آزمایش ندارد (با درگاه، ۷٫۲): مثل ۴٫۶، بی نشانی.
    expect(await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value: 'merchant-new-9f1e', seen: 'none', code: '2' }, 'ip')).toMatchObject({ ok: true });
    expect(secrets.events[2]!.detail).toEqual({ name: 'PAYMENT_MERCHANT_ID', from: 'env' });
  });

  it('پیش از کد: مقدار نادرست، کلید ناشناس، و کلیدی که همین حالا جای دیگری عوض شد؛ کد نه مصرف می‌شود نه «نادرست»', async () => {
    const { panel, secrets, stepUp } = service();
    for (const value of ['', 'دو کلمه', 'a b', 'x'.repeat(513)]) {
      expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value, seen: 'none', code: '123456' }, 'ip'), value).toMatchObject({
        status: 400,
        error: 'invalid_key_value',
      });
    }
    // شناسهٔ قالب (۷٫۱): عدد مثبت تا ۹ رقم، بی صفر اول.
    for (const value of ['', 'jozveyar-otp', '0', '0123', '1234567890', '12.5', '-5']) {
      expect(await panel.setKey(OWNER, { name: 'SMS_PAID_TEMPLATE', value, seen: 'none', code: '123456' }, 'ip'), value).toMatchObject({
        status: 400,
        error: 'invalid_template_id',
      });
    }
    // کلید sms.ir بی آزمایشی که همین مقدار را ذخیره‌شدنی گفت، یا با نشانی ساختگی (۷٫۱).
    for (const test of [undefined, '', '99999999999999.ok.' + 'A'.repeat(43), 'not-a-token']) {
      expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none', code: '1', test }, 'ip'), String(test)).toEqual(
        fail(409, 'key_untested', { name: 'SMS_API_KEY' }),
      );
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
      const test = await testedToken(panel, 'SMS_API_KEY', 'abcdefgh1234');
      expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none', code: '000000', test }, 'ip')).toEqual(failure);
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
    const test = await testedToken(panel, 'SMS_API_KEY', 'mine-value-5678');
    secrets.hooks.before = () => secrets.rows.set('SMS_API_KEY', panelRow('SMS_API_KEY', 'another-tab-value-1234'));
    expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'mine-value-5678', seen: 'none', code: '1', test }, 'ip')).toMatchObject({
      status: 409,
      error: 'key_changed',
    });
    expect(unseal(KEY, secrets.rows.get('SMS_API_KEY')!.sealed, serviceKeyContext('SMS_API_KEY'))).toBe('another-tab-value-1234');
  });

  it('برگرداندن به .env با کد تازه: مقدار پنل پاک، از این لحظه .env؛ رویداد با مقصد', async () => {
    const { panel, secrets, stepUp } = service();
    secrets.rows.set('PAYMENT_MERCHANT_ID', panelRow('PAYMENT_MERCHANT_ID', PANEL_VALUE));
    secrets.rows.set('SMS_OTP_TEMPLATE', panelRow('SMS_OTP_TEMPLATE', '872716'));
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
    expect(view.ok && view.value.keys.map((k) => k.source)).toEqual(['env', 'empty', 'empty', 'empty', 'env']);
  });
});

describe('«آزمایش» کلیدهای sms.ir (۷٫۱)', () => {
  it('کلید API: اعتبار حساب با همان مقدار تازه، بی پیامک؛ رویداد با نتیجه و اعتبار، بی مقدار؛ «آزموده» زیر نامش', async () => {
    const { panel, secrets, sms, logs } = service();
    const value = 'fresh-smsir-key-77aa';
    const result = await panel.testKey(OWNER, { name: 'SMS_API_KEY', value: ` ${value} `, seen: 'none' }, 'ip');
    expect(result).toMatchObject({
      ok: true,
      value: { name: 'SMS_API_KEY', outcome: 'ok', credit: 165.3, http: null, status: null, messageId: null, cost: null, mobile: null },
    });
    expect(result.ok && result.value.token).toMatch(/^\d+\.ok\.[\w-]{43}$/);
    expect(sms.calls).toEqual([{ kind: 'credit', apiKey: value }]);
    expect(secrets.tests).toEqual([
      expect.objectContaining({
        action: 'settings.key_test',
        targetType: 'service_key',
        targetId: 'SMS_API_KEY',
        detail: { name: 'SMS_API_KEY', result: 'ok', credit: 165.3 },
      }),
    ]);
    expect(leaks(value, result, secrets.tests, logs)).toBe(false);
    // آزمایش ذخیره نیست.
    expect(secrets.rows.size).toBe(0);
    expect(secrets.events).toEqual([]);
    const view = await panel.overview(OWNER);
    expect(view.ok && view.value.keys[0]!.lastTest).toEqual({ at: NOW, outcome: 'ok', http: null, status: null, credit: 165.3 });
  });

  it('قالب: یک پیامک آزمایشی با پارامترهای نمونه به شمارهٔ مالک، با کلید API امروز (پنل مقدم)؛ شماره در رویداد نیست', async () => {
    const { panel, secrets, sms } = service();
    const result = await panel.testKey(OWNER, { name: 'SMS_PAID_TEMPLATE', value: '۵۵۱۲۰۰', seen: 'none', mobile: '۰۹۱۲ ۳۴۵ ۶۷۸۹' }, 'ip');
    expect(result).toMatchObject({ ok: true, value: { outcome: 'ok', messageId: '872364912', cost: 1.1, mobile: '09123456789', credit: null } });
    expect(sms.calls).toEqual([
      {
        kind: 'send',
        apiKey: ENV_VALUE,
        templateId: 551200,
        mobile: '09123456789',
        parameters: [
          { name: 'ORDER', value: '10027' },
          { name: 'DAY', value: 'دوشنبه 6 مهر' },
        ],
      },
    ]);
    expect(secrets.tests[0]!.detail).toEqual({ name: 'SMS_PAID_TEMPLATE', result: 'ok', messageId: '872364912', cost: 1.1 });
    expect(JSON.stringify(secrets.tests)).not.toContain('9123456789');
    // کلید API پنل بر .env مقدم است، همان که پیامک واقعی با آن می‌رود.
    secrets.rows.set('SMS_API_KEY', panelRow('SMS_API_KEY', PANEL_VALUE));
    expect((await panel.testKey(OWNER, { name: 'SMS_TRACKING_TEMPLATE', value: '551300', seen: 'none', mobile: '09123456789' }, 'ip')).ok).toBe(true);
    expect(sms.calls[1]).toMatchObject({
      apiKey: PANEL_VALUE,
      templateId: 551300,
      parameters: [
        { name: 'ORDER', value: '10027' },
        { name: 'BARCODE', value: '118800000000000000000101' },
      ],
    });
    await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '551100', seen: 'none', mobile: '09123456789' }, 'ip');
    expect(sms.calls[2]).toMatchObject({ templateId: 551100, parameters: [{ name: 'CODE', value: '12345' }] });
  });

  it('پیش از درخواست: مجوز، کلید بی آزمایش، مقدار و شمارهٔ نادرست، و کلیدی که همین حالا عوض شد؛ نه درخواستی به sms.ir، نه رویدادی', async () => {
    const { panel, secrets, sms } = service();
    expect(await panel.testKey(OPERATOR, { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none' }, 'ip')).toMatchObject({ status: 403 });
    expect(await panel.testKey(session(['settings.edit']), { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none' }, 'ip')).toMatchObject({
      status: 403,
    });
    for (const name of ['PAYMENT_MERCHANT_ID', 'SECRETS_KEY', 'SMS_PROVIDER', undefined]) {
      expect(await panel.testKey(OWNER, { name, value: 'abcdefgh1234', seen: 'none' }, 'ip'), String(name)).toMatchObject({
        status: 404,
        error: 'key_not_found',
      });
    }
    expect(await panel.testKey(OWNER, { name: 'SMS_API_KEY', value: 'a b', seen: 'none' }, 'ip')).toMatchObject({ status: 400, error: 'invalid_key_value' });
    for (const value of ['', 'abc', '0', '012', '1234567890', '12.5']) {
      expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value, seen: 'none', mobile: '09123456789' }, 'ip'), value).toMatchObject({
        status: 400,
        error: 'invalid_template_id',
      });
    }
    for (const mobile of [undefined, '', '0912345678', '02112345678', 'x']) {
      expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '100200', seen: 'none', mobile }, 'ip'), String(mobile)).toMatchObject({
        status: 400,
        error: 'invalid_mobile',
      });
    }
    secrets.rows.set('SMS_OTP_TEMPLATE', panelRow('SMS_OTP_TEMPLATE', '100200'));
    expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '100300', seen: 'none', mobile: '09123456789' }, 'ip')).toEqual(
      fail(409, 'key_changed', { name: 'SMS_OTP_TEMPLATE' }),
    );
    expect(sms.calls).toEqual([]);
    expect(secrets.tests).toEqual([]);
    // بی آزمایشگر نه آزمایش و نه ذخیرهٔ کلید پیامک؛ کد پذیرنده همان ۴٫۶.
    const bare = service({ tester: null });
    expect(await bare.panel.testKey(OWNER, { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none' }, 'ip')).toMatchObject({ status: 404 });
    expect(await bare.panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'abcdefgh1234', seen: 'none', code: '1' }, 'ip')).toMatchObject({
      status: 409,
      error: 'key_untested',
    });
    expect(bare.stepUp).not.toHaveBeenCalled();
  });

  it('«رد شد» ذخیره نمی‌شود؛ «در دسترس نیست» و «آزموده نشد» (بی کلید API) ذخیره‌شدنی‌اند، با نتیجه در رویداد', async () => {
    const rejected = service({
      tester: {
        credit: async () => {
          throw new SmsError('rejected', 'sms.ir: HTTP 401', 401, 0);
        },
      },
    });
    const denied = await rejected.panel.testKey(OWNER, { name: 'SMS_API_KEY', value: 'bad-key-12345678', seen: 'none' }, 'ip');
    expect(denied).toEqual(
      ok({ name: 'SMS_API_KEY', outcome: 'rejected', http: 401, status: 0, credit: null, messageId: null, cost: null, mobile: null, token: null }),
    );
    expect(rejected.secrets.tests[0]!.detail).toEqual({ name: 'SMS_API_KEY', result: 'rejected', http: 401, status: 0 });
    const lastRejected = await rejected.panel.overview(OWNER);
    expect(lastRejected.ok && lastRejected.value.keys[0]!.lastTest).toEqual({ at: NOW, outcome: 'rejected', http: 401, status: 0, credit: null });

    const down = service({
      tester: {
        credit: async () => {
          throw new SmsError('unavailable', 'sms.ir: timeout', null, null);
        },
      },
    });
    const maybe = await down.panel.testKey(OWNER, { name: 'SMS_API_KEY', value: 'maybe-key-12345678', seen: 'none' }, 'ip');
    expect(maybe).toMatchObject({ ok: true, value: { outcome: 'unavailable', http: null, status: null } });
    const token = maybe.ok ? maybe.value.token : null;
    expect(token).toMatch(/^\d+\.unavailable\./);
    // «در دسترس نیست» به «موفق» دست‌کاری‌شده: امضا نمی‌خواند.
    expect(
      await down.panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'maybe-key-12345678', seen: 'none', code: '1', test: token!.replace('.unavailable.', '.ok.') }, 'ip'),
    ).toEqual(fail(409, 'key_untested', { name: 'SMS_API_KEY' }));
    expect(down.stepUp).not.toHaveBeenCalled();
    expect(await down.panel.setKey(OWNER, { name: 'SMS_API_KEY', value: 'maybe-key-12345678', seen: 'none', code: '1', test: token }, 'ip')).toEqual(
      ok({ name: 'SMS_API_KEY' }),
    );
    expect(down.secrets.events[0]!.detail).toEqual({ name: 'SMS_API_KEY', from: 'env', tested: 'unavailable' });

    // خطای ناشناس (نه SmsError): «در دسترس نیست»، و لاگ فقط نام خطا، نه متنش.
    const odd = service({
      tester: {
        credit: async () => {
          throw new TypeError('odd-detail maybe-key-12345678');
        },
      },
    });
    expect(await odd.panel.testKey(OWNER, { name: 'SMS_API_KEY', value: 'maybe-key-12345678', seen: 'none' }, 'ip')).toMatchObject({
      value: { outcome: 'unavailable' },
    });
    expect(odd.logs.join('\n')).toContain('TypeError');
    expect(odd.logs.join('\n')).not.toContain('maybe-key');

    // قالب بی کلید API (نه پنل، نه .env): درخواستی نمی‌رود، «آزموده نشد»، ذخیره‌شدنی.
    const empty = service({ env: {} });
    const unconfigured = await empty.panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '100200', seen: 'none', mobile: '09123456789' }, 'ip');
    expect(unconfigured).toMatchObject({ ok: true, value: { outcome: 'unconfigured', messageId: null } });
    expect(empty.sms.calls).toEqual([]);
    const saved = await empty.panel.setKey(
      OWNER,
      { name: 'SMS_OTP_TEMPLATE', value: '100200', seen: 'none', code: '1', test: unconfigured.ok ? unconfigured.value.token : null },
      'ip',
    );
    expect(saved).toEqual(ok({ name: 'SMS_OTP_TEMPLATE' }));
    expect(empty.secrets.events[0]!.detail).toEqual({ name: 'SMS_OTP_TEMPLATE', from: 'empty', tested: 'unconfigured' });
  });

  it('«آزموده» از رویداد: نتیجهٔ ناشناس «در دسترس نیست»، هرگز «درست»؛ عدد خراب هیچ', async () => {
    const { panel, secrets } = service();
    secrets.tests.push({
      adminUserId: 'admin-1',
      action: 'settings.key_test',
      targetType: 'service_key',
      targetId: 'SMS_API_KEY',
      detail: { name: 'SMS_API_KEY', result: 'عجیب', http: '401', credit: Number.NaN },
      at: NOW,
    });
    const view = await panel.overview(OWNER);
    expect(view.ok && view.value.keys[0]!.lastTest).toEqual({ at: NOW, outcome: 'unavailable', http: null, status: null, credit: null });
  });

  it('قالبی که sms.ir نپذیرفت (شناسه یا پارامتر): «رد شد» با کد پاسخ؛ پیامکی نرفت', async () => {
    const { panel, secrets } = service({
      tester: {
        send: async () => {
          throw new SmsError('rejected', 'sms.ir: status 0', 400, 0);
        },
      },
    });
    const result = await panel.testKey(OWNER, { name: 'SMS_TRACKING_TEMPLATE', value: '551300', seen: 'none', mobile: '09123456789' }, 'ip');
    expect(result).toMatchObject({ ok: true, value: { outcome: 'rejected', http: 400, status: 0, messageId: null, token: null } });
    expect(secrets.tests[0]!.detail).toEqual({ name: 'SMS_TRACKING_TEMPLATE', result: 'rejected', http: 400, status: 0 });
  });

  it('نشانی آزمایش فقط همین مقدار، همین کلید، همین ادمین، همین نسخه، و کمتر از ده دقیقه', async () => {
    const { panel, secrets, stepUp, clock } = service();
    const value = 'tested-key-12345678';
    const token = await testedToken(panel, 'SMS_API_KEY', value);
    const save = (over: Record<string, unknown> = {}, who = OWNER) =>
      panel.setKey(who, { name: 'SMS_API_KEY', value, seen: 'none', code: '1', test: token, ...over }, 'ip');
    const untested = fail(409, 'key_untested', { name: 'SMS_API_KEY' });
    expect(await save({ value: 'other-key-12345678' })).toEqual(untested);
    expect(await panel.setKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '100200', seen: 'none', code: '1', test: token }, 'ip')).toMatchObject({
      error: 'key_untested',
    });
    expect(await save({}, { ...OWNER, userId: 'admin-2' })).toEqual(untested);
    // قالب دیگر با همان شناسه: آزمایش مال همان کلید است.
    const otp = await testedToken(panel, 'SMS_OTP_TEMPLATE', '551200');
    expect(await panel.setKey(OWNER, { name: 'SMS_PAID_TEMPLATE', value: '551200', seen: 'none', code: '1', test: otp }, 'ip')).toEqual(
      fail(409, 'key_untested', { name: 'SMS_PAID_TEMPLATE' }),
    );
    const [until, ...rest] = token.split('.');
    expect(await save({ test: [String(Number(until) + 60_000), ...rest].join('.') })).toEqual(untested);
    // زبانهٔ دیگری میان آزمایش و ذخیره مقدار پنلی گذاشت: صفحهٔ تازه نسخهٔ تازه را دارد، ولی آزمایش مال نسخهٔ قبل است.
    secrets.rows.set('SMS_API_KEY', panelRow('SMS_API_KEY', 'another-tab-value-1234'));
    expect(await save({ seen: keySeenOf(secrets.rows.get('SMS_API_KEY')!.sealed) })).toEqual(untested);
    secrets.rows.delete('SMS_API_KEY');
    // ده دقیقه: درست پیش از مرز پذیرفته، در مرز نه.
    expect(KEY_TEST_TTL_MS).toBe(10 * 60_000);
    clock.now = new Date(NOW.getTime() + KEY_TEST_TTL_MS);
    expect(await save()).toEqual(untested);
    expect(stepUp).not.toHaveBeenCalled();
    clock.now = new Date(NOW.getTime() + KEY_TEST_TTL_MS - 1);
    expect(await save()).toEqual(ok({ name: 'SMS_API_KEY' }));
    expect(stepUp).toHaveBeenCalledTimes(1);
  });

  it('سقف ۱۰ آزمایش در ساعت برای کل پنل (هر آزمایش قالب یک پیامک است)؛ یازدهمی بی درخواست، و ساعت بعد دوباره', async () => {
    const { panel, sms, secrets, clock } = service();
    expect(KEY_TESTS_PER_HOUR).toBe(10);
    for (let i = 0; i < 10; i++) {
      clock.now = new Date(NOW.getTime() + i * 60_000);
      expect((await panel.testKey(OWNER, { name: 'SMS_API_KEY', value: `key-number-${i}-abcdef`, seen: 'none' }, 'ip')).ok).toBe(true);
    }
    expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '100200', seen: 'none', mobile: '09123456789' }, 'ip')).toEqual(
      fail(429, 'key_test_limit', { name: 'SMS_OTP_TEMPLATE' }),
    );
    expect(sms.calls).toHaveLength(10);
    expect(secrets.tests).toHaveLength(10);
    // یک ساعت پس از اولی، یک جا باز می‌شود.
    clock.now = new Date(NOW.getTime() + 3_600_000);
    expect((await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '100200', seen: 'none', mobile: '09123456789' }, 'ip')).ok).toBe(true);
    expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '100200', seen: 'none', mobile: '09123456789' }, 'ip')).toMatchObject({
      status: 429,
    });
  });
});
