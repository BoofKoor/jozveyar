/**
 * سرویس تنظیمات و کلیدهای پنل (`settings.ts`، برش ۴٫۶) با ذخیره‌گاه حافظه‌ای و ساعت ساختگی: مجوز در سرور، سنجش با همان
 * `SETTING_SCHEMAS`، «همان که دیده شد»، کد تازه فقط پس از هر سنجشی که بی کد جواب دارد، و مقدار کلید هیچ‌جا جز مهروموم. قفل،
 * تراکنش و CHECKها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHECKOUT_AUDIENCE_EVENT,
  DEFAULT_SETTINGS,
  OFFICIAL_HOLIDAYS,
  PREVIEW_LINK_TTL_MS,
  PREVIEW_TOKEN,
  previewHash,
  seal,
  serviceKeyContext,
  unseal,
  type AdminEventInput,
  type AudienceChange,
  type CheckoutPreviewStore,
  type KeyCheck,
  type SecretStore,
  type ServiceKeyName,
  type ServiceSecretRow,
  type SettingsStore,
  type SmsStats,
} from '@jozveyar/db';
import { createZibalMock, type ZibalMock } from '@jozveyar/payments/mock';
import { zibalClient, type ZibalClient } from '@jozveyar/payments/zibal';
import { createSmsIrMock, type SmsIrMock } from '@jozveyar/sms/mock';
import { smsIrClient } from '@jozveyar/sms/smsir';

import type { AdminSession } from './auth';
import { fail, ok, type Result } from './result';
import { MERCHANT_TEST_RIALS, createPanelSettings, keySeenOf } from './settings';

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
    partner: null,
  };
}
const OWNER = session(['settings.edit', 'secrets.edit', 'tariff.read', 'orders.money']);
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
    // همان قرارداد پستگرس: شمار آزمایش‌های پنجره، و فقط زیر سقف `run` و رویداد (قفل و هم‌زمانی در تست یکپارچگی).
    async test(input) {
      const tested = events.filter((e) => e.action === 'settings.key_test' && e.at.getTime() > input.since.getTime()).length;
      if (tested >= input.limit) return { ok: false, reason: 'limited' };
      const result = await input.run();
      events.push({ adminUserId: input.actor.adminUserId, action: 'settings.key_test', targetType: 'service_key', targetId: input.name, detail: { ...input.detail(result), name: input.name }, at: input.at });
      return { ok: true, result };
    },
    async lastChecks() {
      const latest = new Map<string, KeyCheck>();
      for (const e of events) {
        const detail = (e.detail ?? {}) as Record<string, unknown>;
        if (e.action === 'settings.key_test' && detail.subject !== 'current') continue;
        latest.set(e.targetId!, { name: e.targetId as ServiceKeyName, action: e.action, at: e.at, adminName: 'سارا', detail });
      }
      return [...latest.values()];
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

function service(
  options: {
    stepUp?: Result<true>;
    secretsKey?: Buffer;
    env?: Record<string, string>;
    smsir?: ReturnType<typeof smsIrClient>;
    zibal?: { client: ZibalClient; callbackUrl: string | null };
    smsStats?: SmsStats;
    smsInUse?: boolean;
    now?: () => Date;
    /** مسیر خرید روی سایت (۷٫۵)؛ `false` یعنی پنلی بی آن. */
    checkout?: false;
  } = {},
) {
  const settings = memorySettings();
  const secrets = memorySecrets();
  const previews = memoryPreviews(settings);
  const logs: string[] = [];
  const stepUp = vi.fn(async (_session: AdminSession, _code: unknown, _ip: string): Promise<Result<true>> => options.stepUp ?? ok<true>(true));
  const panel = createPanelSettings({
    settings: settings.store,
    secrets: secrets.store,
    stepUp,
    secretsKey: options.secretsKey ?? KEY,
    env: options.env ?? { SMS_API_KEY: ENV_VALUE, PAYMENT_MERCHANT_ID: 'env-merchant-0000' },
    secret: SECRET,
    ...(options.smsir ? { smsir: options.smsir } : {}),
    ...(options.zibal ? { zibal: options.zibal } : {}),
    ...(options.smsStats ? { smsStats: options.smsStats } : {}),
    ...(options.smsInUse ? { smsInUse: options.smsInUse } : {}),
    ...(options.checkout === false ? {} : { checkout: { previews: previews.store, lastChange: async () => lastChangeOf(settings.events) } }),
    now: options.now ?? (() => NOW),
    log: (message, error) => logs.push(`${message} ${error ?? ''}`),
  });
  return { panel, settings, secrets, previews, stepUp, logs };
}

/**
 * پیوندهای پیش‌نمایش با همان قرارداد پستگرس (`createCheckoutPreviewStore.create`): فقط وقتی مخاطب «پیش‌نمایش مالک» است؛ قفل، بستن
 * بازنشده‌های قبلی و رویداد در تست یکپارچگی.
 */
function memoryPreviews(settings: ReturnType<typeof memorySettings>) {
  const created: Parameters<CheckoutPreviewStore['create']>[0][] = [];
  const store: Pick<CheckoutPreviewStore, 'create'> = {
    async create(input) {
      if (settings.values.get('checkout.audience') !== 'preview') return { ok: false, reason: 'audience' };
      created.push(input);
      return { ok: true, linkExpiresAt: new Date(input.at.getTime() + PREVIEW_LINK_TTL_MS) };
    },
  };
  return { store, created };
}

/** همان `lastAudienceChange`: تازه‌ترین رویداد مخاطب. */
function lastChangeOf(events: readonly AdminEventInput[]): AudienceChange | null {
  const last = events.filter((event) => event.action === CHECKOUT_AUDIENCE_EVENT).at(-1);
  if (!last) return null;
  const detail = (last.detail ?? {}) as { from?: string; to?: string; fresh?: boolean };
  return { at: last.at, by: 'سارا', from: detail.from ?? null, to: detail.to ?? null, fresh: detail.fresh === true };
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
    expect(view.keys.map((k) => [k.name, k.source, k.tail, k.updatedBy, k.envSet, k.envTail, k.value])).toEqual([
      ['SMS_API_KEY', 'env', '3f9a', null, true, '3f9a', null],
      ['SMS_OTP_TEMPLATE', 'empty', null, null, false, null, null],
      ['SMS_PAID_TEMPLATE', 'empty', null, null, false, null, null],
      ['SMS_TRACKING_TEMPLATE', 'empty', null, null, false, null, null],
      // ۷٫۶: قالب پیامک چاپخانه، پیش از کد پذیرنده (ترتیب `SERVICE_KEYS`).
      ['SMS_PARTNER_TEMPLATE', 'empty', null, null, false, null, null],
      ['PAYMENT_MERCHANT_ID', 'panel', 'c2d8', 'سارا', true, '0000', null],
    ]);
    expect(view.keys[5]!.seen).toBe(keySeenOf(secrets.rows.get('PAYMENT_MERCHANT_ID')!.sealed));
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
    expect(view.ok && view.value.keys.find((k) => k.name === 'PAYMENT_MERCHANT_ID')!.source).toBe('unreadable');
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
    // خالی پیش از این: «وارد شد». شناسهٔ قالب راز نیست و کامل دیده می‌شود (برش ۷٫۱).
    expect(await panel.setKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '482913', seen: 'none', code: '1' }, 'ip')).toMatchObject({ ok: true });
    expect(secrets.events[1]).toMatchObject({ detail: { name: 'SMS_OTP_TEMPLATE', from: 'empty' } });
    const templates = await panel.overview(OWNER);
    expect(templates.ok && templates.value.keys[1]).toMatchObject({ source: 'panel', value: '482913', tail: null });
  });

  it('پیش از کد: مقدار نادرست، کلید ناشناس، و کلیدی که همین حالا جای دیگری عوض شد؛ کد نه مصرف می‌شود نه «نادرست»', async () => {
    const { panel, secrets, stepUp } = service();
    for (const value of ['', 'دو کلمه', 'a b', 'x'.repeat(513)]) {
      expect(await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value, seen: 'none', code: '123456' }, 'ip'), value).toMatchObject({
        status: 400,
        error: 'invalid_key_value',
      });
    }
    // از ۷٫۱ هر کلید sms.ir شکل خودش را دارد: کلید API شکل سرآیند، شناسهٔ قالب عدد.
    for (const value of ['', 'دو کلمه', 'short', 'x'.repeat(513)]) {
      expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value, seen: 'none', code: '1' }, 'ip'), value).toMatchObject({ status: 400, error: 'invalid_api_key' });
    }
    for (const value of ['jozveyar-otp', '0123', '12ab', '12345678901']) {
      expect(await panel.setKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value, seen: 'none', code: '1' }, 'ip'), value).toMatchObject({
        status: 400,
        error: 'invalid_template_id',
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
    secrets.rows.set('SMS_OTP_TEMPLATE', panelRow('SMS_OTP_TEMPLATE', '482913'));
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
    expect(view.ok && view.value.keys.map((k) => k.source)).toEqual(['env', 'empty', 'empty', 'empty', 'empty', 'env']);
  });
});

/* ───────────────────────── آزمایش کلیدهای sms.ir و اعتبار (برش ۷٫۱، ADR-049) ───────────────────────── */

describe('آزمایش کلیدهای sms.ir (۷٫۱)، روی سرور ساختگی', () => {
  const API = 'mock-api-key-1234567890abcd';
  const OTHER_API = 'mock-api-key-other-000000ab';
  let mock: SmsIrMock;
  let client: ReturnType<typeof smsIrClient>;
  beforeAll(async () => {
    mock = createSmsIrMock();
    client = smsIrClient({ baseUrl: await mock.listen() });
  });
  afterAll(() => mock.close());
  beforeEach(() => {
    mock.configure({
      keys: [API, OTHER_API],
      templates: { '482913': ['CODE'], '731058': ['ORDER', 'DAY'], '731059': ['ORDER', 'BARCODE'] },
      credit: 184_200,
      cost: 1,
      fail: null,
      delayMs: 0,
      drop: 0,
    });
    mock.state.messages = [];
  });
  const tested = (options: Parameters<typeof service>[0] = {}) => service({ env: { SMS_API_KEY: API }, smsir: client, ...options });

  it('«آزمایش» کلید API امروز، بی کد: اعتبار از sms.ir؛ رویداد با نتیجه و اعتبار، بی مقدار؛ آخرین حال زیر نامش', async () => {
    const { panel, secrets, stepUp, logs } = tested();
    const result = await panel.testKey(OWNER, { name: 'SMS_API_KEY' }, 'ip');
    expect(result).toEqual(ok({ outcome: 'ok', http: null, status: null, credit: 184_200, name: 'SMS_API_KEY', subject: 'current', mobile: null, receipt: null }));
    expect(stepUp).not.toHaveBeenCalled();
    expect(mock.state.messages).toEqual([]);
    expect(secrets.events).toMatchObject([{ action: 'settings.key_test', targetId: 'SMS_API_KEY', detail: { subject: 'current', outcome: 'ok', credit: 184_200 } }]);
    const view = await panel.overview(OWNER);
    expect(view.ok && view.value.keys[0]!.check).toMatchObject({ action: 'settings.key_test', detail: { outcome: 'ok' } });
    // sms.ir در کار نیست: کارت اعتبار از همین آزمایش، نه درخواست تازه.
    expect(view.ok && view.value.credit).toMatchObject({ state: 'ok', credit: 184_200, live: false });
    expect(leaks(API, result, secrets.events, logs, view)).toBe(false);
  });

  it('کلید نادرست ۴۰۱ «رد شد»، sms.ir بی پاسخ «جواب نداد»؛ کلید خالی، و کد پذیرنده بی زیبال، آزمایش ندارند', async () => {
    const wrong = tested({ env: { SMS_API_KEY: 'mock-api-key-unknown-00000' } });
    expect(await wrong.panel.testKey(OWNER, { name: 'SMS_API_KEY' }, 'ip')).toMatchObject({ ok: true, value: { outcome: 'rejected', http: 401 } });
    mock.configure({ fail: { http: 503, times: 1 } });
    const down = tested();
    expect(await down.panel.testKey(OWNER, { name: 'SMS_API_KEY' }, 'ip')).toMatchObject({ ok: true, value: { outcome: 'unavailable', http: 503 } });
    expect(await tested({ env: {} }).panel.testKey(OWNER, { name: 'SMS_API_KEY' }, 'ip')).toMatchObject({ status: 409, error: 'key_empty' });
    expect(await tested().panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip')).toMatchObject({ status: 409, error: 'key_not_testable' });
    // بی sms.ir (پیکربندی) هم آزمایش نیست، نه شکست.
    expect(await service().panel.testKey(OWNER, { name: 'SMS_API_KEY' }, 'ip')).toMatchObject({ status: 409, error: 'key_not_testable' });
    // بی مجوز، پیش از هر درخواست.
    expect(await tested().panel.testKey(OPERATOR, { name: 'SMS_API_KEY' }, 'ip')).toMatchObject({ status: 403, error: 'forbidden' });
  });

  it('قالب دو قدم: پیامک آزمایشی با پارامترهای نمونه و رسید، بعد «ذخیره» با کد همان مقدار؛ مقدار دیگر، رسید کهنه یا «رد شد» نه', async () => {
    const clock = { now: NOW };
    const { panel, secrets, stepUp } = tested({ now: () => clock.now });
    // موبایل لازم است و فارسی‌نرمال می‌شود.
    expect(await panel.testKey(OWNER, { name: 'SMS_PAID_TEMPLATE', value: '731058', mobile: '' }, 'ip')).toMatchObject({ error: 'invalid_test_mobile' });
    expect(await panel.testKey(OWNER, { name: 'SMS_PAID_TEMPLATE', value: 'abc', mobile: '09123456789' }, 'ip')).toMatchObject({ error: 'invalid_template_id' });
    const test = await panel.testKey(OWNER, { name: 'SMS_PAID_TEMPLATE', value: '۷۳۱۰۵۸', mobile: '۰۹۱۲۳۴۵۶۷۸۹' }, 'ip');
    if (!test.ok) throw new Error(test.error);
    expect(test.value).toMatchObject({ outcome: 'ok', subject: 'new', mobile: '0912 ••• 6789' });
    expect(mock.state.messages.map((m) => [m.mobile, m.templateId, m.parameters])).toEqual([
      ['09123456789', 731058, [{ name: 'ORDER', value: '10001' }, { name: 'DAY', value: 'دوشنبه 6 مهر' }]],
    ]);
    // رویداد موبایل پوشیده دارد، نه شماره.
    expect(JSON.stringify(secrets.events)).not.toContain('09123456789');
    const receipt = test.value.receipt!;
    const save = (over: Record<string, unknown> = {}) =>
      panel.setKey(OWNER, { name: 'SMS_PAID_TEMPLATE', value: '731058', seen: 'none', code: '1', receipt: receipt.mac, testedAt: receipt.at, tested: receipt.outcome, ...over }, 'ip');
    // بی رسید، رسید مقدار دیگر، و رسید دست‌کاری‌شده: «اول پیامک آزمایشی»، بی کد.
    expect(await save({ receipt: undefined })).toMatchObject({ status: 409, error: 'key_untested' });
    expect(await save({ value: '731059' })).toMatchObject({ status: 409, error: 'key_untested' });
    expect(await save({ tested: 'unavailable' })).toMatchObject({ status: 409, error: 'key_untested' });
    // رسید مال همان ادمین است: مالک دیگری با همان رسید «ذخیره» نمی‌کند (شاهد: خود او پایین‌تر ذخیره می‌کند).
    const another: AdminSession = { ...OWNER, sessionId: 's2', userId: 'admin-2', username: 'reza', displayName: 'رضا' };
    expect(
      await panel.setKey(another, { name: 'SMS_PAID_TEMPLATE', value: '731058', seen: 'none', code: '1', receipt: receipt.mac, testedAt: receipt.at, tested: receipt.outcome }, 'ip'),
    ).toMatchObject({ status: 409, error: 'key_untested' });
    expect(stepUp).not.toHaveBeenCalled();
    // رسید کهنه (پس از ۱۵ دقیقه) نه؛ شاهد: همان رسید پیش از آن.
    clock.now = new Date(NOW.getTime() + 15 * 60_000 + 1);
    expect(await save()).toMatchObject({ status: 409, error: 'key_untested' });
    clock.now = new Date(NOW.getTime() + 15 * 60_000);
    expect(await save()).toEqual(ok({ name: 'SMS_PAID_TEMPLATE' }));
    expect(stepUp).toHaveBeenCalledTimes(1);
    expect(secrets.events.at(-1)).toMatchObject({ action: 'settings.key_set', detail: { name: 'SMS_PAID_TEMPLATE', from: 'empty', tested: 'ok' } });
    // قالبی که sms.ir نمی‌شناسد: «رد شد»، بی رسید، پس ذخیره‌شدنی نیست.
    const rejected = await panel.testKey(OWNER, { name: 'SMS_TRACKING_TEMPLATE', value: '999999', mobile: '09123456789' }, 'ip');
    expect(rejected).toMatchObject({ ok: true, value: { outcome: 'rejected', http: 400, receipt: null } });
  });

  it('قالب بی کلید API: «کلید API خالی است»، بی هیچ درخواست؛ پیامک آزمایشی با کلید API امروز', async () => {
    const { panel } = tested({ env: {} });
    expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '482913', mobile: '09123456789' }, 'ip')).toMatchObject({
      ok: true,
      value: { outcome: 'unconfigured' },
    });
    expect(mock.state.messages).toEqual([]);
  });

  it('کلید API «آزمایش و ذخیره»: رد شد ذخیره نمی‌شود و کد نمی‌خواهد؛ در دسترس نیست با رسید، و «بی آزمایش ذخیره کن» فقط با همان', async () => {
    const { panel, secrets, stepUp } = tested();
    const set = (value: string, over: Record<string, unknown> = {}) => panel.setKey(OWNER, { name: 'SMS_API_KEY', value, seen: 'none', code: '1', ...over }, 'ip');
    expect(await set('mock-api-key-unknown-00000')).toMatchObject({ status: 400, error: 'key_rejected', http: 401, serviceStatus: 401 });
    expect(stepUp).not.toHaveBeenCalled();
    expect(secrets.rows.size).toBe(0);
    mock.configure({ drop: 1 });
    const down = await set(OTHER_API);
    expect(down).toMatchObject({ status: 503, error: 'key_unavailable' });
    const receipt = (down as unknown as { receipt: { mac: string; at: string; outcome: string } }).receipt;
    expect(stepUp).not.toHaveBeenCalled();
    // «بی آزمایش ذخیره کن» بی رسید، یا با رسید کلید دیگر، نه.
    expect(await set(OTHER_API, { skipTest: '1' })).toMatchObject({ error: 'key_untested' });
    expect(await set(API, { skipTest: '1', receipt: receipt.mac, testedAt: receipt.at, tested: receipt.outcome })).toMatchObject({ error: 'key_untested' });
    // رسید «درست» همین کلید (از «آزمایش» مقدار تازه) هم «بی آزمایش» را باز نمی‌کند: فقط «در دسترس نیست».
    const tried = await panel.testKey(OWNER, { name: 'SMS_API_KEY', value: API }, 'ip');
    const good = tried.ok ? tried.value.receipt! : null;
    expect(good?.outcome).toBe('ok');
    expect(await set(API, { skipTest: '1', receipt: good!.mac, testedAt: good!.at, tested: good!.outcome })).toMatchObject({ status: 409, error: 'key_untested' });
    expect(stepUp).not.toHaveBeenCalled();
    expect(await set(OTHER_API, { skipTest: '1', receipt: receipt.mac, testedAt: receipt.at, tested: receipt.outcome })).toEqual(ok({ name: 'SMS_API_KEY' }));
    expect(secrets.events.at(-1)).toMatchObject({ action: 'settings.key_set', detail: { tested: 'skipped' } });
    // درست: آزموده، با اعتبار در رویداد، بعد کد.
    const seen = keySeenOf(secrets.rows.get('SMS_API_KEY')!.sealed);
    expect(await set(API, { seen })).toEqual(ok({ name: 'SMS_API_KEY' }));
    expect(secrets.events.at(-1)).toMatchObject({ action: 'settings.key_set', detail: { from: 'panel', tested: 'ok', credit: 184_200 } });
    expect(unseal(KEY, secrets.rows.get('SMS_API_KEY')!.sealed, serviceKeyContext('SMS_API_KEY'))).toBe(API);
    expect(leaks(API, secrets.events)).toBe(false);
    expect(leaks(OTHER_API, secrets.events)).toBe(false);
  });

  it('سقف ۱۰ آزمایش در ساعت: یازدهمی «سقف پر شد»، بی درخواست و بی پیامک', async () => {
    const { panel } = tested();
    for (let i = 0; i < 10; i += 1) {
      expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '482913', mobile: '09123456789' }, 'ip')).toMatchObject({ ok: true });
    }
    expect(mock.state.messages).toHaveLength(10);
    expect(await panel.testKey(OWNER, { name: 'SMS_OTP_TEMPLATE', value: '482913', mobile: '09123456789' }, 'ip')).toMatchObject({ status: 429, error: 'key_test_limited' });
    expect(await panel.setKey(OWNER, { name: 'SMS_API_KEY', value: API, seen: 'none', code: '1' }, 'ip')).toMatchObject({ error: 'key_test_limited' });
    expect(mock.state.messages).toHaveLength(10);
  });

  it('اعتبار وقتی sms.ir در کار است: همین حالا از sms.ir، پنج دقیقه همان؛ «برای حدود N روز» از هزینهٔ هفته؛ هشدار زیر آستانه', async () => {
    const stats: SmsStats = {
      otpUsage: async () => ({ hour: 18, day: 312, hourOldest: null, dayOldest: null }),
      otpCapReached: async () => ({ hourAt: null, dayAt: null }),
      smsCost: async () => ({ cost: 7 * 8_000, count: 7 * 74 }),
    };
    const clock = { now: NOW };
    const { panel } = tested({ smsInUse: true, smsStats: stats, now: () => clock.now });
    const first = await panel.overview(OWNER);
    expect(first.ok && first.value.credit).toEqual({ state: 'ok', credit: 184_200, at: NOW, live: true, days: 23, week: { cost: 56_000, count: 518 } });
    expect(first.ok && first.value.otpUsage).toEqual({ hour: 18, day: 312 });
    mock.configure({ credit: 1 });
    clock.now = new Date(NOW.getTime() + 60_000);
    const cached = await panel.overview(OWNER);
    expect(cached.ok && cached.value.credit).toMatchObject({ credit: 184_200 });
    expect((await panel.smsAlerts(OWNER)).lowCredit).toBeNull();
    // پس از ۵ دقیقه دوباره از sms.ir: کمتر از ۷ روز مصرف، هشدار.
    mock.configure({ credit: 40_000 });
    clock.now = new Date(NOW.getTime() + 5 * 60_000 + 1);
    expect((await panel.smsAlerts(OWNER)).lowCredit).toEqual({ credit: 40_000, days: 5, threshold: 7 });
    // چاپخانه و متصدیِ بی مبلغ هیچ.
    expect(await panel.smsAlerts(OPERATOR)).toEqual({ otpCap: null, lowCredit: null });
  });

  it('خواندن نمایشی اعتبار سقف ۳ ثانیه دارد؛ «آزمایش» همان سقف آداپتور', async () => {
    const limits: (number | undefined)[] = [];
    const watched: ReturnType<typeof smsIrClient> = {
      ...client,
      credit: (apiKey, timeoutMs) => {
        limits.push(timeoutMs);
        return client.credit(apiKey, timeoutMs);
      },
    };
    const { panel } = tested({ smsir: watched, smsInUse: true });
    const view = await panel.overview(OWNER);
    expect(view.ok && view.value.credit).toMatchObject({ state: 'ok', credit: 184_200, live: true });
    expect(await panel.testKey(OWNER, { name: 'SMS_API_KEY' }, 'ip')).toMatchObject({ ok: true, value: { outcome: 'ok' } });
    expect(limits).toEqual([3_000, undefined]);
  });

  it('سقف کد کل سایت که امروز پر شد: کدام، کی، و تا حدود کی (فقط اگر هنوز پر است)', async () => {
    const tenForty = new Date(NOW.getTime() - 40 * 60_000);
    const stats = (over: Partial<Awaited<ReturnType<SmsStats['otpUsage']>>>, reached: { hourAt: Date | null; dayAt: Date | null }): SmsStats => ({
      otpUsage: async () => ({ hour: 0, day: 0, hourOldest: null, dayOldest: null, ...over }),
      otpCapReached: async () => reached,
      smsCost: async () => ({ cost: 0, count: 0 }),
    });
    const dayOldest = new Date(NOW.getTime() - 22 * 3_600_000);
    const full = tested({ smsStats: stats({ day: 2000, dayOldest }, { hourAt: null, dayAt: tenForty }) });
    expect((await full.panel.smsAlerts(OWNER)).otpCap).toEqual({ kind: 'day', limit: 2000, at: tenForty, until: new Date(dayOldest.getTime() + 86_400_000) });
    const past = tested({ smsStats: stats({ hour: 10, hourOldest: NOW }, { hourAt: tenForty, dayAt: null }) });
    expect((await past.panel.smsAlerts(OWNER)).otpCap).toEqual({ kind: 'hour', limit: 300, at: tenForty, until: null });
    const none = tested({ smsStats: stats({}, { hourAt: null, dayAt: null }) });
    expect((await none.panel.smsAlerts(OWNER)).otpCap).toBeNull();
  });

  it('سقف کد پیامکی با یک «ذخیره»: ساعتی و ۲۴ ساعته با هم سنجیده؛ فقط آنکه عوض شد نوشته می‌شود', async () => {
    const { panel, settings } = tested();
    const OWNER_SETTINGS = session(['settings.edit', 'secrets.edit']);
    expect(
      await panel.saveNumbers(OWNER_SETTINGS, [
        { key: 'otp.site_hourly_limit', value: '300', seen: '300' },
        { key: 'otp.site_daily_limit', value: '0', seen: '2000' },
      ], 'ip'),
    ).toMatchObject({ status: 400, error: 'invalid_setting', keys: ['otp.site_daily_limit'] });
    expect(settings.events).toEqual([]);
    expect(
      await panel.saveNumbers(OWNER_SETTINGS, [
        { key: 'otp.site_hourly_limit', value: '300', seen: '300' },
        { key: 'otp.site_daily_limit', value: '۳,۰۰۰', seen: '2000' },
      ], 'ip'),
    ).toEqual(ok({ written: ['otp.site_daily_limit'] }));
    expect(settings.values.get('otp.site_daily_limit')).toBe(3000);
    expect(settings.events).toMatchObject([{ action: 'settings.update', detail: { key: 'otp.site_daily_limit', from: 2000, to: 3000 } }]);
  });
});

describe('آزمایش کد پذیرندهٔ زیبال (۷٫۲)، روی سرور ساختگی', () => {
  const MERCHANT = 'mock-merchant-settings-72';
  const OTHER = 'mock-merchant-settings-other';
  const CALLBACK = 'https://jozveyar.com/pay/callback';
  let mock: ZibalMock;
  let client: ZibalClient;
  beforeAll(async () => {
    mock = createZibalMock({ merchants: [MERCHANT, OTHER] });
    client = zibalClient({ baseUrl: await mock.listen() });
  });
  afterAll(() => mock.close());
  beforeEach(() => {
    mock.configure({ merchants: [MERCHANT, OTHER], ipRejected: false, fail: null, delayMs: 0, drop: 0 });
    mock.state.transactions.clear();
  });
  const tested = (options: Parameters<typeof service>[0] = {}) =>
    service({ env: { PAYMENT_MERCHANT_ID: MERCHANT }, zibal: { client, callbackUrl: CALLBACK }, ...options });

  it('«آزمایش» امروز، بی کد: یک درخواست پرداخت 1,000 تومانی با کلید برگشت تصادفی؛ رویداد با نتیجه، بی مقدار', async () => {
    const { panel, secrets, stepUp, logs } = tested();
    const result = await panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip');
    expect(result).toEqual(ok({ outcome: 'ok', http: null, status: null, credit: null, name: 'PAYMENT_MERCHANT_ID', subject: 'current', mobile: null, receipt: null }));
    expect(stepUp).not.toHaveBeenCalled();
    const [made] = [...mock.state.transactions.values()];
    expect(made).toMatchObject({ merchant: MERCHANT, amount: MERCHANT_TEST_RIALS, status: -1 });
    expect(made!.callbackUrl).toMatch(/^https:\/\/jozveyar\.com\/pay\/callback\/[0-9a-f]{32}$/);
    expect(made!.orderId).toMatch(/^test-[0-9a-f]{8}$/);
    expect(secrets.events).toMatchObject([{ action: 'settings.key_test', targetId: 'PAYMENT_MERCHANT_ID', detail: { subject: 'current', outcome: 'ok' } }]);
    expect(leaks(MERCHANT, result, secrets.events, logs)).toBe(false);
  });

  it('IP سرور (۱۱۵) و کد پذیرندهٔ ناشناس «رد شد» با کد زیبال؛ بی پاسخ «در دسترس نیست»؛ بی نشانی برگشت «آزموده نشد»', async () => {
    mock.configure({ ipRejected: true });
    expect(await tested().panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip')).toMatchObject({ ok: true, value: { outcome: 'rejected', status: 115 } });
    mock.configure({ ipRejected: false });
    expect(await tested({ env: { PAYMENT_MERCHANT_ID: 'mock-merchant-unknown' } }).panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip')).toMatchObject({
      ok: true,
      value: { outcome: 'rejected', status: 102 },
    });
    mock.configure({ fail: { http: 502, times: 1 } });
    expect(await tested().panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip')).toMatchObject({ ok: true, value: { outcome: 'unavailable', http: 502 } });
    const unconfigured = tested({ zibal: { client, callbackUrl: null } });
    expect(await unconfigured.panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip')).toMatchObject({ ok: true, value: { outcome: 'unconfigured' } });
    expect(mock.state.transactions.size).toBe(0);
    // بی زیبال (پیکربندی) آزمایش نیست، و کد پذیرندهٔ خالی «خالی».
    expect(await service().panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip')).toMatchObject({ status: 409, error: 'key_not_testable' });
    expect(await tested({ env: {} }).panel.testKey(OWNER, { name: 'PAYMENT_MERCHANT_ID' }, 'ip')).toMatchObject({ status: 409, error: 'key_empty' });
  });

  it('«آزمایش و ذخیره»: درست با کد تازه؛ ۱۱۵ و ناشناس بی کد و بی نوشتن؛ «در دسترس نیست» با رسید و «بی آزمایش ذخیره کن»', async () => {
    const { panel, secrets, stepUp } = tested();
    // شکل کد پذیرندهٔ زیبال پیش از هر درخواست: فاصله و نویسهٔ فارسی نه.
    expect(await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value: 'abc', seen: 'none', code: '1' }, 'ip')).toMatchObject({ error: 'invalid_key_value' });
    mock.configure({ ipRejected: true });
    expect(await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value: OTHER, seen: 'none', code: '1' }, 'ip')).toEqual(
      fail(400, 'key_rejected', { name: 'PAYMENT_MERCHANT_ID', http: null, serviceStatus: 115, unconfigured: false }),
    );
    mock.configure({ ipRejected: false });
    expect(await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value: 'mock-merchant-unknown', seen: 'none', code: '1' }, 'ip')).toMatchObject({
      error: 'key_rejected',
      serviceStatus: 102,
    });
    expect(stepUp).not.toHaveBeenCalled();
    expect(secrets.rows.has('PAYMENT_MERCHANT_ID')).toBe(false);
    expect(await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value: OTHER, seen: 'none', code: '123456' }, 'ip')).toEqual(ok({ name: 'PAYMENT_MERCHANT_ID' }));
    expect(unseal(KEY, secrets.rows.get('PAYMENT_MERCHANT_ID')!.sealed, serviceKeyContext('PAYMENT_MERCHANT_ID'))).toBe(OTHER);
    expect(secrets.events.at(-1)).toMatchObject({ action: 'settings.key_set', detail: { name: 'PAYMENT_MERCHANT_ID', from: 'env', tested: 'ok' } });

    mock.configure({ fail: { http: 503, times: 1 } });
    const seen = keySeenOf(secrets.rows.get('PAYMENT_MERCHANT_ID')!.sealed);
    const down = await panel.setKey(OWNER, { name: 'PAYMENT_MERCHANT_ID', value: MERCHANT, seen, code: '1' }, 'ip');
    expect(down).toMatchObject({ status: 503, error: 'key_unavailable' });
    const receipt = (down as unknown as { receipt: { outcome: string; at: string; mac: string } }).receipt;
    expect(
      await panel.setKey(
        OWNER,
        { name: 'PAYMENT_MERCHANT_ID', value: MERCHANT, seen, code: '1', skipTest: '1', tested: receipt.outcome, testedAt: receipt.at, receipt: receipt.mac },
        'ip',
      ),
    ).toEqual(ok({ name: 'PAYMENT_MERCHANT_ID' }));
    expect(secrets.events.at(-1)).toMatchObject({ action: 'settings.key_set', detail: { tested: 'skipped' } });
    expect(leaks(MERCHANT, secrets.events)).toBe(false);
    expect(leaks(OTHER, secrets.events)).toBe(false);
  });
});

describe('مسیر خرید روی سایت (۷٫۵، ADR-052)', () => {
  /** همان `.env` سایت زنده با `live`، و کلیدها از `.env`؛ نشانی برگشت سرتاسری. */
  const LIVE_ENV: Record<string, string> = {
    CHECKOUT_MODE: 'live',
    PAYMENT_PROVIDER: 'zibal',
    SMS_PROVIDER: 'smsir',
    PAYMENT_MERCHANT_ID: 'zibal-merchant-51e0',
    SMS_API_KEY: ENV_VALUE,
    SMS_OTP_TEMPLATE: '100001',
    SMS_PAID_TEMPLATE: '100002',
    SMS_TRACKING_TEMPLATE: '100003',
    PAYMENT_CALLBACK_URL: 'http://127.0.0.1:3102/pay/callback',
    DATABASE_URL: 'postgresql://x@127.0.0.1/x',
    SESSION_SECRET: 's'.repeat(64),
  };
  const live = (over: Record<string, string> = {}) => service({ env: { ...LIVE_ENV, ...over } });
  const audienceEvents = (events: readonly AdminEventInput[]) => events.filter((event) => event.action === CHECKOUT_AUDIENCE_EVENT);

  it('کارت فقط برای مالک (`settings.edit`) و فقط با مسیر خرید؛ آمادگی با همین .env و کلیدهای پنل، مخاطب پیش‌فرض «پیش‌نمایش مالک»', async () => {
    const { panel } = live();
    const owner = await panel.overview(OWNER);
    if (!owner.ok) throw new Error(owner.error);
    expect(owner.value.checkout).toMatchObject({ mode: 'live', audience: 'preview', since: null, readiness: { requested: true, ready: true } });
    const keysOnly = await panel.overview(session(['secrets.edit']));
    expect(keysOnly.ok && keysOnly.value.checkout).toBeNull();
    const without = await service({ env: LIVE_ENV, checkout: false }).panel.overview(OWNER);
    expect(without.ok && without.value.checkout).toBeNull();
    // یک کلید کم: خاموش، با همان تکه؛ کلید پنل بر .env مقدم (ADR-041) و پنل خواندنی‌اش را می‌سنجد.
    const missing = service({ env: { ...LIVE_ENV, SMS_TRACKING_TEMPLATE: '' } });
    const off = await missing.panel.overview(OWNER);
    expect(off.ok && off.value.checkout!.readiness.ready).toBe(false);
    missing.secrets.rows.set('SMS_TRACKING_TEMPLATE', panelRow('SMS_TRACKING_TEMPLATE', '100003'));
    const back = await missing.panel.overview(OWNER);
    expect(back.ok && back.value.checkout!.readiness.ready).toBe(true);
    // .env که live نمی‌خواهد: کارت هست، آماده نه.
    const offEnv = await service({ env: { ...LIVE_ENV, CHECKOUT_MODE: 'off' } }).panel.overview(OWNER);
    expect(offEnv.ok && offEnv.value.checkout).toMatchObject({ mode: 'off', readiness: { requested: false, ready: false } });
  });

  it('پلهٔ بالا با کد تازه، پلهٔ پایین بی کد؛ رویداد از، به و «با کد تازه» در همان نوشتن؛ «از امروز …» همان رویداد', async () => {
    const { panel, settings, stepUp } = live();
    const up = await panel.changeAudience(OWNER, { to: 'everyone', seen: 'preview', code: '123456' }, 'ip', 'up');
    expect(up).toEqual({ ok: true, value: { audience: 'everyone', written: true, fresh: true } });
    expect(stepUp).toHaveBeenCalledTimes(1);
    expect(stepUp.mock.calls[0]![1]).toBe('123456');
    expect(settings.values.get('checkout.audience')).toBe('everyone');

    const down = await panel.changeAudience(OWNER, { to: 'paused', seen: 'everyone' }, 'ip', 'down');
    expect(down).toEqual({ ok: true, value: { audience: 'paused', written: true, fresh: false } });
    expect(stepUp).toHaveBeenCalledTimes(1);

    // متوقف ← پیش‌نمایش هم پلهٔ بالاست (سؤال ۱۶۹).
    expect(await panel.changeAudience(OWNER, { to: 'preview', seen: 'paused', code: '654321' }, 'ip', 'up')).toMatchObject({
      ok: true,
      value: { audience: 'preview', fresh: true },
    });
    expect(stepUp).toHaveBeenCalledTimes(2);
    expect(audienceEvents(settings.events).map((event) => event.detail)).toEqual([
      { from: 'preview', to: 'everyone', fresh: true },
      { from: 'everyone', to: 'paused', fresh: false },
      { from: 'paused', to: 'preview', fresh: true },
    ]);
    expect(audienceEvents(settings.events).every((event) => event.targetId === 'checkout.audience' && event.adminUserId === 'admin-1')).toBe(true);
    const card = await panel.checkoutCard(OWNER);
    expect(card.ok && card.value.since).toMatchObject({ from: 'paused', to: 'preview', fresh: true, by: 'سارا' });
  });

  it('هر ردی پیش از کد: بی مجوز، مقصد ناشناس، آماده نیست، «همان که دیده شد»، و جهتی که با فرمش نخواند؛ مقصد یکسان موفق، بی کد و بی رویداد', async () => {
    const { panel, settings, stepUp } = live();
    expect(await panel.changeAudience(OPERATOR, { to: 'everyone', seen: 'preview', code: '1' }, 'ip', 'up')).toMatchObject({ status: 403, error: 'forbidden' });
    expect(await panel.changeAudience(session(['secrets.edit']), { to: 'paused', seen: 'preview' }, 'ip', 'down')).toMatchObject({ status: 403 });
    for (const to of ['all', 'PAUSED', '', null, 3]) {
      expect(await panel.changeAudience(OWNER, { to, seen: 'preview', code: '1' }, 'ip', 'up')).toMatchObject({ status: 400, error: 'invalid_setting' });
    }
    expect(await panel.changeAudience(OWNER, { to: 'everyone', seen: 'paused', code: '1' }, 'ip', 'up')).toMatchObject({ status: 409, error: 'checkout_changed' });
    // درخواست ساختگی: پلهٔ بالا از فرم پایین (بی کد) یا پایین از فرم بالا؛ پیش از کد، تا کد خالی «ورود ناموفق» نشمارد.
    expect(await panel.changeAudience(OWNER, { to: 'everyone', seen: 'preview' }, 'ip', 'down')).toMatchObject({ status: 400, error: 'invalid_setting' });
    expect(await panel.changeAudience(OWNER, { to: 'paused', seen: 'preview', code: '1' }, 'ip', 'up')).toMatchObject({ status: 400, error: 'invalid_setting' });
    expect(await panel.changeAudience(OWNER, { to: 'preview', seen: 'preview' }, 'ip', 'up')).toEqual({
      ok: true,
      value: { audience: 'preview', written: false, fresh: false },
    });
    expect(stepUp).not.toHaveBeenCalled();
    expect(settings.events).toEqual([]);

    const off = live({ SMS_PAID_TEMPLATE: '' });
    expect(await off.panel.changeAudience(OWNER, { to: 'paused', seen: 'preview' }, 'ip', 'down')).toMatchObject({ status: 409, error: 'checkout_not_ready' });
    expect(await off.panel.changeAudience(OWNER, { to: 'everyone', seen: 'preview', code: '1' }, 'ip', 'up')).toMatchObject({ status: 409, error: 'checkout_not_ready' });
    expect(off.stepUp).not.toHaveBeenCalled();
    expect(off.settings.values.get('checkout.audience')).toBe('preview');
  });

  it('کد نادرست یا قفل: همان خطای کد، بی نوشتن', async () => {
    const { panel, settings } = service({ env: LIVE_ENV, stepUp: fail(401, 'wrong_code') });
    expect(await panel.changeAudience(OWNER, { to: 'everyone', seen: 'preview', code: '000000' }, 'ip', 'up')).toMatchObject({ status: 401, error: 'wrong_code' });
    expect(settings.values.get('checkout.audience')).toBe('preview');
    expect(settings.events).toEqual([]);
  });

  it('زیر قفل دوباره «همان که دیده شد»: مخاطبی که میان کد و نوشتن جای دیگری عوض شد رونویسی نمی‌شود؛ همان مقصد موفق بی رویداد', async () => {
    const { panel, settings } = live();
    const change = settings.store.change.bind(settings.store);
    settings.store.change = async (input) => {
      settings.values.set('checkout.audience', 'paused');
      return change(input);
    };
    expect(await panel.changeAudience(OWNER, { to: 'everyone', seen: 'preview', code: '1' }, 'ip', 'up')).toMatchObject({ status: 409, error: 'checkout_changed' });
    expect(settings.values.get('checkout.audience')).toBe('paused');
    settings.store.change = async (input) => {
      settings.values.set('checkout.audience', 'everyone');
      return change(input);
    };
    settings.values.set('checkout.audience', 'preview');
    expect(await panel.changeAudience(OWNER, { to: 'everyone', seen: 'preview', code: '1' }, 'ip', 'up')).toEqual({
      ok: true,
      value: { audience: 'everyone', written: false, fresh: false },
    });
    expect(audienceEvents(settings.events)).toEqual([]);
  });

  it('پیوند پیش‌نمایش: بی کد، فقط در «پیش‌نمایش مالک» و فقط آماده؛ مبدأ از نشانی برگشت؛ از توکن فقط هش، و هیچ‌جای لاگ نیست', async () => {
    const { panel, previews, stepUp, settings, logs } = live();
    const result = await panel.createPreview(OWNER, 'ip');
    if (!result.ok) throw new Error(result.error);
    const match = /^http:\/\/127\.0\.0\.1:3102\/preview\/([A-Za-z0-9_-]+)$/.exec(result.value.url);
    expect(match).not.toBeNull();
    const token = match![1]!;
    expect(PREVIEW_TOKEN.test(token)).toBe(true);
    expect(previews.created).toHaveLength(1);
    expect(previews.created[0]).toMatchObject({ tokenHash: previewHash(token), at: NOW, actor: { adminUserId: 'admin-1' } });
    expect(JSON.stringify(previews.created)).not.toContain(token);
    expect(result.value.expiresAt).toEqual(new Date(NOW.getTime() + 15 * 60_000));
    expect(stepUp).not.toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain(token);
    // هر بار توکن تازه.
    const again = await panel.createPreview(OWNER, 'ip');
    expect(again.ok && again.value.url).not.toBe(result.value.url);

    expect(await panel.createPreview(OPERATOR, 'ip')).toMatchObject({ status: 403 });
    settings.values.set('checkout.audience', 'everyone');
    expect(await panel.createPreview(OWNER, 'ip')).toMatchObject({ status: 409, error: 'checkout_not_preview' });
    const off = live({ PAYMENT_CALLBACK_URL: 'https://jozveyar.com/pay/callbak' });
    expect(await off.panel.createPreview(OWNER, 'ip')).toMatchObject({ status: 409, error: 'checkout_not_ready' });
    expect(off.previews.created).toEqual([]);
    // سایت زنده: مبدأ همان jozveyar.com.
    const prod = live({ PAYMENT_CALLBACK_URL: 'https://jozveyar.com/pay/callback' });
    const link = await prod.panel.createPreview(OWNER, 'ip');
    expect(link.ok && link.value.url.startsWith('https://jozveyar.com/preview/')).toBe(true);
  });

  it('سطر پیشخوان: فقط با live، برای مالک و متصدی (`orders.money`)، نه چاپخانه', async () => {
    const { panel } = live();
    expect(await panel.checkoutStatus(OWNER)).toMatchObject({ mode: 'live', audience: 'preview', readiness: { ready: true } });
    expect(await panel.checkoutStatus(session(['orders.read', 'orders.money']))).toMatchObject({ audience: 'preview' });
    expect(await panel.checkoutStatus(session(['orders.read']))).toBeNull();
    expect(await service({ env: { ...LIVE_ENV, CHECKOUT_MODE: 'off' } }).panel.checkoutStatus(OWNER)).toBeNull();
    expect(await service({ env: { ...LIVE_ENV, CHECKOUT_MODE: 'mock' } }).panel.checkoutStatus(OWNER)).toBeNull();
    expect(await service({ env: LIVE_ENV, checkout: false }).panel.checkoutStatus(OWNER)).toBeNull();
    // آماده نیست هم سطر است (خاموش، با چرایش).
    expect(await live({ SMS_OTP_TEMPLATE: '' }).panel.checkoutStatus(OWNER)).toMatchObject({ readiness: { requested: true, ready: false } });
  });

  it('صفحهٔ «باز کردن»: کارت با اعتبار sms.ir اگر خوانده شد؛ فقط مالک', async () => {
    const { panel, secrets } = live();
    const card = await panel.checkoutCard(OWNER);
    expect(card).toMatchObject({ ok: true, value: { audience: 'preview', credit: null } });
    expect(await panel.checkoutCard(OPERATOR)).toMatchObject({ status: 403 });
    // همان خواندن کارت «اعتبار پیامک»: «آزمایش» درست کلید API با اعتبار، عددش روی کارت؛ «آزمایش» ردشدهٔ بعدی، دوباره هیچ.
    const keyTest = (detail: Record<string, unknown>, at: Date) =>
      secrets.events.push({ adminUserId: 'admin-1', action: 'settings.key_test', targetType: 'service_key', targetId: 'SMS_API_KEY', detail: { name: 'SMS_API_KEY', subject: 'current', ...detail }, at });
    keyTest({ outcome: 'ok', credit: 184_200 }, new Date(NOW.getTime() - 60_000));
    expect(await panel.checkoutCard(OWNER)).toMatchObject({ ok: true, value: { audience: 'preview', credit: 184_200 } });
    keyTest({ outcome: 'rejected', http: 401 }, NOW);
    expect(await panel.checkoutCard(OWNER)).toMatchObject({ ok: true, value: { credit: null } });
  });
});

describe('هشدار فرم چاپخانه (۷٫۶، سؤال ۱۷۵)', () => {
  const PARTNERS = session(['partners.manage']);

  it('شناسهٔ قالب پیامک چاپخانه گذاشته نشده و sms.ir در کار است: هشدار؛ با پیامک کنسولی یا بی `partners.manage` نه؛ هرگز مقدار', async () => {
    expect(await service({ smsInUse: true }).panel.partnerTemplateMissing(PARTNERS)).toBe(true);
    // پیامک کنسولی: قالب لازم نیست.
    expect(await service().panel.partnerTemplateMissing(PARTNERS)).toBe(false);
    // فقط مالک (همان که فرم چاپخانه را دارد).
    expect(await service({ smsInUse: true }).panel.partnerTemplateMissing(OPERATOR)).toBe(false);
    // از پنل یا .env، گذاشته شده: نه.
    const panelSet = service({ smsInUse: true });
    panelSet.secrets.rows.set('SMS_PARTNER_TEMPLATE', panelRow('SMS_PARTNER_TEMPLATE', '100004'));
    expect(await panelSet.panel.partnerTemplateMissing(PARTNERS)).toBe(false);
    expect(await service({ smsInUse: true, env: { SMS_PARTNER_TEMPLATE: '100004' } }).panel.partnerTemplateMissing(PARTNERS)).toBe(false);
    // بدشکل یا ناخوانا همان «گذاشته نشده».
    expect(await service({ smsInUse: true, env: { SMS_PARTNER_TEMPLATE: 'abc' } }).panel.partnerTemplateMissing(PARTNERS)).toBe(true);
    const unreadable = service({ smsInUse: true, secretsKey: Buffer.alloc(32, 7) });
    unreadable.secrets.rows.set('SMS_PARTNER_TEMPLATE', panelRow('SMS_PARTNER_TEMPLATE', '100004'));
    expect(await unreadable.panel.partnerTemplateMissing(PARTNERS)).toBe(true);
  });
});
