/**
 * تنظیمات و کلیدها در پنل (برش ۴٫۶، ADR-041؛ طرح پنل `m-settings` و `m-key-edit`): روز کاری تحویل به پست، سقف ساعتی کد
 * پیامکی کل سایت، تعطیلی‌ها، و کلیدهای سرویس‌های بیرونی؛ و از ۶٫۴ بازه‌های وزن گزارش ارسال، که فرمش در خود صفحهٔ گزارش است.
 *
 * - **مجوز در سرور** (ADR-038): تنظیم‌ها با `settings.edit` و کلیدها با `secrets.edit`، هر دو فقط مالک.
 * - **سرور منبع حقیقت است:** هر مقدار با همان `SETTING_SCHEMAS` سنجیده می‌شود که سایت با آن می‌خواند (`readSetting`)، و
 *   تعطیلی تازه روزی واقعی و آینده است.
 * - **همان که دیده شد:** فرم مقدار یا نسخه‌ای را که صفحه نشان داد می‌فرستد (`seen`)، و ذخیره‌گاه زیر قفل با امروز می‌سنجد؛
 *   نوشتنی که ادمین دیگری را بی‌صدا رونویسی کند نیست. مقصد یکسان (همین حالا همان است) موفق است، بی رویداد دوم. افزودن و حذف
 *   تعطیلی کار روی فهرست امروز است، نه رونویسی فهرستی که دیده شد: دو افزودن هم‌زمان هر دو می‌مانند.
 * - **کلیدها کار حساس‌اند:** کد تازهٔ برنامهٔ تأیید (`stepUp`)، فقط پس از هر سنجشی که بی کد جواب دارد (مقدار، و «همان که دیده
 *   شد»)، تا کد برای کاری که انجام‌شدنی نیست نه مصرف شود و نه «نادرست» شمرده شود. مقدار کلید هیچ‌جا نمی‌رود جز مهروموم در
 *   پایگاه داده: نه نما (فقط ۴ نویسهٔ آخر)، نه رویداد، نه لاگ، نه پاسخ.
 * - **آزمایش پیش از ذخیره** (۷٫۱، ADR-049، سؤال‌های ۱۱۹ و ۱۳۹): کلیدهای sms.ir پیش از کد تازه با مقدار تازه از خود sms.ir آزموده
 *   می‌شوند: کلید API با اعتبار حساب (بی پیامک)، هر قالب با یک پیامک آزمایشی با پارامترهای نمونه به شماره‌ای که مالک می‌نویسد. «رد
 *   شد» ذخیره نمی‌شود؛ «در دسترس نیست» و «آزموده نشد» (کلید API خالی) با هشدار ذخیره‌شدنی‌اند. نتیجه با نشانی امضاشده (`testToken`،
 *   HMAC با `SESSION_SECRET`: نام، هش مقدار، نسخهٔ دیده‌شده، ادمین، نتیجه و ده دقیقه) به فرم برمی‌گردد، و ذخیره بی همان نشانی نیست؛
 *   پس کلید آزموده‌نشده از راه فرم دست‌ساز هم نمی‌نشیند. سقف ۱۰ آزمایش در ساعت برای کل پنل (هر آزمایش قالب پیامک است)، و رویداد
 *   `settings.key_test` با نام و نتیجه، هرگز مقدار و شمارهٔ آزمایش.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید (`SettingsStore`، `SecretStore`، `stepUp`، `.env`)، پس با ذخیره‌گاه و ساعت ساختگی تست
 * می‌شود. قفل و تراکنش روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { SETTING_SCHEMAS, type Holiday, type SettingKey, type SettingValue } from '@jozveyar/contracts';
import { SMS_TEMPLATES, SmsError, templateIdOf, type SmsErrorCode, type SmsIrSent } from '@jozveyar/sms';
import { normalizeIranMobile } from '@jozveyar/text/input';
import {
  DEFAULT_SETTINGS,
  REPORT_BANDS_SETTING,
  SERVICE_KEYS,
  bandsDecision,
  isServiceKeyName,
  readServiceKey,
  readSetting,
  resolveServiceKey,
  seal,
  serviceKeyContext,
  type ReportBands,
  type SecretStore,
  type ServiceKeyName,
  type ServiceSecretRow,
  type SettingsStore,
} from '@jozveyar/db';

import { readBoundsInput, type BoundError } from '../report';
import {
  KEY_TESTS,
  isNumberSetting,
  keyTail,
  parseWholeNumber,
  readHolidayInput,
  readKeyValue,
  sortHolidays,
  type NumberSettingKey,
} from '../settings';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

/** درخواست‌های «آزمایش» به sms.ir (۷٫۱)؛ واقعی همان `smsIrCredit` و `smsIrSendVerify` آداپتور، با `SMSIR_API_URL`. */
export interface SmsKeyTester {
  credit(apiKey: string): Promise<number>;
  send(input: { apiKey: string; templateId: number; mobile: string; parameters: { name: string; value: string }[] }): Promise<SmsIrSent>;
}

/** سقف «آزمایش» کلید در ساعت، برای کل پنل (ADR-049). */
export const KEY_TESTS_PER_HOUR = 10;
/** نشانی آزمایش تا این مدت ذخیره را باز نگه می‌دارد. */
export const KEY_TEST_TTL_MS = 10 * 60_000;

export type KeyTestOutcome = 'ok' | 'rejected' | 'unavailable' | 'unconfigured';

/** نتیجهٔ «آزمایش» برای فرم؛ مقدار هرگز. */
export interface KeyTestView {
  name: ServiceKeyName;
  outcome: KeyTestOutcome;
  /** پاسخ sms.ir: کد HTTP و `status` بدنه، اگر پاسخی آمد. */
  http: number | null;
  status: number | null;
  /** کلید API: اعتبار حساب. */
  credit: number | null;
  /** قالب: شناسه و هزینهٔ پیامک آزمایشی، و شماره‌ای که به آن رفت. */
  messageId: string | null;
  cost: number | null;
  mobile: string | null;
  /** ذخیره با همین نتیجه؛ «رد شد» ندارد. */
  token: string | null;
}

/** آخرین آزمایش یک کلید، زیر نامش در صفحه (سؤال ۱۳۹). */
export interface KeyLastTest {
  at: Date;
  outcome: KeyTestOutcome;
  http: number | null;
  status: number | null;
  credit: number | null;
}

export interface PanelSettingsDeps {
  settings: SettingsStore;
  secrets: SecretStore;
  /** «آزمایش» کلیدهای sms.ir (۷٫۱)؛ بی آن، کلیدهای پیامک ذخیره‌شدنی نیستند. */
  smsTester?: SmsKeyTester;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SECRETS_KEY`: مهروموم کلیدها. */
  secretsKey: Buffer;
  /** `.env` سرور (`process.env`): مقدار هر کلید وقتی مقدار پنلی نیست. */
  env: Readonly<Record<string, string | undefined>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** یک کلید در صفحه؛ مقدارش هرگز، فقط منبع و ۴ نویسهٔ آخر. */
export interface KeyView {
  name: ServiceKeyName;
  source: 'panel' | 'env' | 'empty' | 'unreadable';
  /** ۴ نویسهٔ آخر مقداری که امروز به کار می‌رود (پنل یا `.env`)؛ null برای خالی، خوانده‌نشده یا کلید کوتاه. */
  tail: string | null;
  /** مقدار پنل: کی و چه کسی. */
  updatedAt: Date | null;
  updatedBy: string | null;
  /** `.env` این کلید را دارد؛ و ۴ نویسهٔ آخرش، برای متن «برگرداندن به .env». */
  envSet: boolean;
  envTail: string | null;
  /** نسخه‌ای که صفحه نشان داد، برای «همان که دیده شد». */
  seen: string;
  /** آخرین «آزمایش» (۷٫۱)؛ null یعنی هرگز. */
  lastTest: KeyLastTest | null;
}

export interface SettingsView {
  now: Date;
  canSettings: boolean;
  canSecrets: boolean;
  /** تنظیم‌ها، اگر `settings.edit`؛ از ۷٫۱ سقف روزانهٔ کد و آستانهٔ هشدار اعتبار. */
  values: {
    slaDays: number;
    otpLimit: number;
    otpDaily: number;
    creditAlert: number;
    retentionDays: number;
    holidays: Holiday[];
    officialThrough: number;
  } | null;
  /** کلیدها، اگر `secrets.edit`؛ به ترتیب `SERVICE_KEYS`. */
  keys: KeyView[];
}

/** نسخهٔ مقدار پنل یک کلید، بی خود مقدار: اثر انگشت مهروموم (که با هر ذخیره عوض می‌شود)، یا `none`. */
export const keySeenOf = (sealed: string | null) =>
  sealed === null ? 'none' : `panel:${createHash('sha256').update(sealed).digest('hex').slice(0, 32)}`;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const numberOr = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** رویداد `settings.key_test` به «آزموده: …» (۷٫۱)؛ رویداد نتیجهٔ ناشناس «در دسترس نیست» است. */
function lastTestOf(last: { at: Date; detail: Record<string, unknown> }): KeyLastTest {
  const result = last.detail.result;
  return {
    at: last.at,
    outcome: result === 'ok' || result === 'rejected' || result === 'unconfigured' ? result : 'unavailable',
    http: numberOr(last.detail.http),
    status: numberOr(last.detail.status),
    credit: numberOr(last.detail.credit),
  };
}

/** مقدار خام امروز به شکل قرارداد، یا پیش‌فرض؛ همان `readSetting`، زیر قفل و بی لاگ. */
function effective<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const parsed = raw === undefined || raw === null ? null : SETTING_SCHEMAS[key].safeParse(raw);
  return (parsed?.success ? parsed.data : DEFAULT_SETTINGS[key]) as SettingValue<K>;
}

export function createPanelSettings(deps: PanelSettingsDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error ?? ''));
  const actor = (session: AdminSession, ip: string) => ({ adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) });
  const envOf = (name: ServiceKeyName) => deps.env[name]?.trim() || null;

  function keyView(name: ServiceKeyName, row: ServiceSecretRow | null, last: { at: Date; detail: Record<string, unknown> } | undefined): KeyView {
    const state = resolveServiceKey(name, row, deps.env, deps.secretsKey, (message) => log(message));
    const fromEnv = envOf(name);
    return {
      lastTest: last ? lastTestOf(last) : null,
      name,
      source: state.source,
      tail: state.value === null ? null : keyTail(state.value, name),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy?.name ?? null,
      envSet: fromEnv !== null,
      envTail: fromEnv === null ? null : keyTail(fromEnv, name),
      seen: keySeenOf(row?.sealed ?? null),
    };
  }

  /** بازه‌های گزارش زیر قفل تنظیم‌ها، با رویداد `settings.update` (کلید، از و به). */
  async function changeBands(session: AdminSession, bands: ReportBands, seen: unknown, ip: string) {
    const result = await deps.settings.change({
      key: REPORT_BANDS_SETTING,
      action: 'settings.update',
      at: now(),
      actor: actor(session, ip),
      decide: bandsDecision(bands, text(seen)),
    });
    if (!result.ok) return fail(result.reason === 'invalid' ? 400 : 409, result.reason === 'invalid' ? 'invalid_bands' : 'setting_changed', { key: REPORT_BANDS_SETTING });
    return ok({ bands, written: result.written });
  }

  /** پیش از کد تازه: کلید همان است که صفحه نشان داد («همان که دیده شد»)؛ جوابش بی کد است. */
  async function seenRow(name: ServiceKeyName, seenInput: unknown) {
    const row = await deps.secrets.read(name);
    const seen = text(seenInput);
    if (keySeenOf(row?.sealed ?? null) !== seen) return fail(409, 'key_changed', { name });
    return ok({ row, seen });
  }

  /**
   * نشانی «آزمایش»: `<پایان>.<نتیجه>.<HMAC>` روی نام، هش مقدار، نسخهٔ دیده‌شده، ادمین، نتیجه و پایان. مقدار در آن نیست؛ فرم مقدار را
   * خودش دوباره می‌فرستد و سرور با همین هش می‌سنجد.
   */
  function testSignature(name: ServiceKeyName, value: string, seen: string, userId: string, outcome: KeyTestOutcome, until: number) {
    const valueHash = createHash('sha256').update(value).digest('hex');
    return createHmac('sha256', deps.secret).update(['key_test', name, valueHash, seen, userId, outcome, String(until)].join('\0')).digest('base64url');
  }

  function testToken(name: ServiceKeyName, value: string, seen: string, userId: string, outcome: KeyTestOutcome): string {
    const until = now().getTime() + KEY_TEST_TTL_MS;
    return `${until}.${outcome}.${testSignature(name, value, seen, userId, outcome, until)}`;
  }

  /** نتیجهٔ آزمایشی که همین مقدار را برای همین ادمین و همین نسخه، کمتر از ده دقیقه پیش، ذخیره‌شدنی گفت؛ وگرنه null. */
  function passedTest(name: ServiceKeyName, value: string, seen: string, userId: string, token: unknown): KeyTestOutcome | null {
    const match = /^(\d{1,16})\.(ok|unavailable|unconfigured)\.([A-Za-z0-9_-]{43})$/.exec(text(token));
    if (!match) return null;
    const until = Number(match[1]);
    const outcome = match[2] as KeyTestOutcome;
    if (until <= now().getTime()) return null;
    const expected = Buffer.from(testSignature(name, value, seen, userId, outcome, until));
    const given = Buffer.from(match[3]!);
    return expected.length === given.length && timingSafeEqual(expected, given) ? outcome : null;
  }

  return {
    async overview(session: AdminSession): Promise<Result<SettingsView>> {
      const canSettings = can(session, 'settings.edit');
      const canSecrets = can(session, 'secrets.edit');
      if (!canSettings && !canSecrets) return fail(403, 'forbidden');
      const read = (key: string) => deps.settings.read(key);
      const [values, rows, tests] = await Promise.all([
        canSettings
          ? Promise.all([
              readSetting(read, 'order.sla_days', log),
              readSetting(read, 'otp.site_hourly_limit', log),
              readSetting(read, 'calendar.holidays', log),
              readSetting(read, 'calendar.official_through', log),
              readSetting(read, 'order.files_retention_days', log),
              readSetting(read, 'otp.site_daily_limit', log),
              readSetting(read, 'sms.credit_alert', log),
            ])
          : null,
        canSecrets ? deps.secrets.list() : [],
        canSecrets ? deps.secrets.lastTests() : new Map<ServiceKeyName, { at: Date; detail: Record<string, unknown> }>(),
      ]);
      return ok({
        now: now(),
        canSettings,
        canSecrets,
        values: values
          ? {
              slaDays: values[0],
              otpLimit: values[1],
              otpDaily: values[5],
              creditAlert: values[6],
              retentionDays: values[4],
              holidays: sortHolidays(values[2]),
              officialThrough: values[3],
            }
          : null,
        keys: canSecrets
          ? SERVICE_KEYS.map((name) => keyView(name, rows.find((row) => row.name === name) ?? null, tests.get(name)))
          : [],
      });
    },

    /**
     * «آزمایش» مقدار تازهٔ یک کلید sms.ir (۷٫۱، سؤال ۱۱۹)، پیش از کد تازه: مجوز، نام، مقدار، «همان که دیده شد» و برای قالب شمارهٔ
     * پیامک آزمایشی؛ بعد زیر سقف ساعتی، درخواست به خود sms.ir با همین مقدار تازه (مقدار فقط در حافظهٔ همین درخواست). نتیجه با نشانی
     * ذخیره، جز «رد شد».
     */
    async testKey(
      session: AdminSession,
      input: { name: unknown; value: unknown; seen: unknown; mobile?: unknown },
      ip: string,
    ): Promise<Result<KeyTestView>> {
      if (!can(session, 'secrets.edit')) return fail(403, 'forbidden');
      if (!isServiceKeyName(input.name) || !KEY_TESTS[input.name] || !deps.smsTester) return fail(404, 'key_not_found');
      const name = input.name;
      const kind = KEY_TESTS[name]!;
      const tester = deps.smsTester;
      const value = readKeyValue(input.value, name);
      if (value === null) return fail(400, kind === 'credit' ? 'invalid_key_value' : 'invalid_template_id', { name });
      const mobile = kind === 'credit' ? null : normalizeIranMobile(text(input.mobile));
      if (kind !== 'credit' && !mobile) return fail(400, 'invalid_mobile', { name });
      const target = await seenRow(name, input.seen);
      if (!target.ok) return target;
      const { seen } = target.value;

      const view = await deps.secrets.runTest(
        { name, at: now(), actor: actor(session, ip), limit: KEY_TESTS_PER_HOUR },
        async () => {
          const result: KeyTestView = { name, outcome: 'ok', http: null, status: null, credit: null, messageId: null, cost: null, mobile, token: null };
          try {
            if (kind === 'credit') {
              result.credit = await tester.credit(value);
            } else {
              // قالب با کلید API امروز (پنل یا .env)؛ بی آن آزموده نمی‌شود، و درخواستی نمی‌رود.
              const apiKey = (await readServiceKey(deps.secrets, 'SMS_API_KEY', deps.env, deps.secretsKey, (message) => log(message))).value;
              if (!apiKey) {
                result.outcome = 'unconfigured';
              } else {
                const template = SMS_TEMPLATES[kind];
                const sent = await tester.send({
                  apiKey,
                  templateId: templateIdOf(value)!,
                  mobile: mobile!,
                  parameters: template.params.map((param, i) => ({ name: param, value: template.sample[i]! })),
                });
                result.messageId = sent.messageId;
                result.cost = sent.cost;
              }
            }
          } catch (error) {
            const code: SmsErrorCode = error instanceof SmsError ? error.code : 'unavailable';
            result.outcome = code === 'rejected' ? 'rejected' : code === 'unconfigured' ? 'unconfigured' : 'unavailable';
            result.http = error instanceof SmsError ? error.http : null;
            result.status = error instanceof SmsError ? error.status : null;
            if (!(error instanceof SmsError)) log(`✗ آزمایش ${name} شکست خورد`, error instanceof Error ? error.name : 'error');
          }
          const detail: Record<string, unknown> = { result: result.outcome };
          if (result.http !== null) detail.http = result.http;
          if (result.status !== null) detail.status = result.status;
          if (result.credit !== null) detail.credit = result.credit;
          if (result.messageId !== null) detail.messageId = result.messageId;
          if (result.cost !== null) detail.cost = result.cost;
          return { value: result, detail };
        },
      );
      if (!view) return fail(429, 'key_test_limit', { name });
      if (view.outcome !== 'rejected') view.token = testToken(name, value, seen, session.userId, view.outcome);
      return ok(view);
    },

    /**
     * روز کاری تحویل به پست، سقف ساعتی کد پیامکی، یا روزهای نگهداری فایل‌های سفارش (۵٫۱). مقصد یکسان موفق است، بی رویداد؛
     * وگرنه فقط اگر امروز همان است که صفحه نشان داد (`seen`).
     */
    async saveNumber(
      session: AdminSession,
      input: { key: unknown; value: unknown; seen: unknown },
      ip: string,
    ): Promise<Result<{ key: NumberSettingKey; value: number; written: boolean }>> {
      if (!can(session, 'settings.edit')) return fail(403, 'forbidden');
      if (!isNumberSetting(input.key)) return fail(404, 'setting_not_found');
      const key = input.key;
      const value = parseWholeNumber(input.value);
      if (value === null || !SETTING_SCHEMAS[key].safeParse(value).success) return fail(400, 'invalid_setting', { key });
      const seen = text(input.seen);
      const result = await deps.settings.change({
        key,
        action: 'settings.update',
        at: now(),
        actor: actor(session, ip),
        decide: (raw) => {
          const current = effective(key, raw);
          if (current === value) return { kind: 'same' };
          if (String(current) !== seen) return { kind: 'reject', reason: 'changed' };
          return { kind: 'write', value, detail: { key, from: current, to: value } };
        },
      });
      if (!result.ok) return fail(409, 'setting_changed', { key });
      return ok({ key, value, written: result.written });
    },

    /** تعطیلی تازه، روی فهرست امروز: روز واقعی و آینده، بی تکرار، مرتب. */
    async addHoliday(session: AdminSession, input: { date: unknown; title: unknown }, ip: string): Promise<Result<Holiday>> {
      if (!can(session, 'settings.edit')) return fail(403, 'forbidden');
      const at = now();
      const read = readHolidayInput(input, at);
      if ('errors' in read) return fail(400, 'invalid_holiday', { errors: read.errors });
      const holiday = read.value;
      const result = await deps.settings.change({
        key: 'calendar.holidays',
        action: 'settings.holiday_add',
        at,
        actor: actor(session, ip),
        decide: (raw) => {
          const list = effective('calendar.holidays', raw);
          const existing = list.find((day) => day.date === holiday.date);
          if (existing) return { kind: 'reject', reason: 'exists', detail: { title: existing.title } };
          const next = sortHolidays([...list, holiday]);
          if (!SETTING_SCHEMAS['calendar.holidays'].safeParse(next).success) return { kind: 'reject', reason: 'invalid' };
          return { kind: 'write', value: next, detail: { date: holiday.date, title: holiday.title } };
        },
      });
      if (!result.ok) {
        return result.reason === 'exists'
          ? fail(409, 'holiday_exists', { date: holiday.date, title: text(result.detail?.title) })
          : fail(400, 'invalid_holiday', { errors: {} });
      }
      return ok(holiday);
    },

    /**
     * حذف یک تعطیلی از فهرست امروز؛ گذشته هم. مهلت سفارش‌های ثبت‌شده عوض نمی‌شود: هنگام پرداخت حساب و ذخیره شده است
     * (`post_handoff_due_at`، ADR-013).
     */
    async removeHoliday(session: AdminSession, input: { date: unknown }, ip: string): Promise<Result<Holiday>> {
      if (!can(session, 'settings.edit')) return fail(403, 'forbidden');
      const date = text(input.date);
      if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) return fail(409, 'holiday_missing', { date: '' });
      const removed: { day?: Holiday } = {};
      const result = await deps.settings.change({
        key: 'calendar.holidays',
        action: 'settings.holiday_remove',
        at: now(),
        actor: actor(session, ip),
        decide: (raw) => {
          const list = effective('calendar.holidays', raw);
          const found = list.find((day) => day.date === date);
          if (!found) return { kind: 'reject', reason: 'missing' };
          removed.day = found;
          return { kind: 'write', value: list.filter((day) => day.date !== date), detail: { date, title: found.title } };
        },
      });
      if (!result.ok || !removed.day) return fail(409, 'holiday_missing', { date });
      return ok(removed.day);
    },

    /**
     * «با تقویم رسمی تطبیق دادم»: تعطیلی‌های تا پایان این سال با تقویم رسمی منتشرشده یکی‌اند و هشدار پیش‌بینی برای آن نمی‌آید.
     * فقط سالی بعد از «تطبیق‌داده‌شده تا» امروز که در فهرست روزی دارد؛ همان سال دوباره موفق است، بی رویداد.
     */
    async confirmOfficial(session: AdminSession, input: { year: unknown }, ip: string): Promise<Result<{ year: number }>> {
      if (!can(session, 'settings.edit')) return fail(403, 'forbidden');
      const year = /^\d{4}$/.test(text(input.year)) ? Number(input.year) : null;
      const holidays = await readSetting((key) => deps.settings.read(key), 'calendar.holidays', log);
      if (year === null || !holidays.some((day) => day.date.startsWith(`${year}/`))) return fail(400, 'invalid_setting');
      const result = await deps.settings.change({
        key: 'calendar.official_through',
        action: 'settings.update',
        at: now(),
        actor: actor(session, ip),
        decide: (raw) => {
          const current = effective('calendar.official_through', raw);
          if (current >= year) return { kind: 'same' };
          if (!SETTING_SCHEMAS['calendar.official_through'].safeParse(year).success) return { kind: 'reject', reason: 'invalid' };
          return { kind: 'write', value: year, detail: { key: 'calendar.official_through', from: current, to: year } };
        },
      });
      return result.ok ? ok({ year }) : fail(400, 'invalid_setting');
    },

    /**
     * بازه‌های وزن گزارش ارسال (برش ۶٫۴، تصمیم‌های ۱۰۱ و ۱۱۰)، از خود صفحهٔ گزارش: مرزها، هر فیلد یک مرز (خالی یعنی نیست)؛ خطای
     * هر فیلد با جایش. فقط مالک: تنظیم است (`settings.edit`) و فقط برای گزارش (`reports.read`). مقصد یکسان موفق است، بی رویداد؛
     * وگرنه فقط اگر امروز همان است که صفحه نشان داد (`seen`)، زیر قفل (`bandsDecision`). روی قیمت و تعرفه اثری ندارد.
     */
    async saveReportBands(
      session: AdminSession,
      input: { values: readonly unknown[]; seen: unknown },
      ip: string,
    ): Promise<Result<{ bands: ReportBands; written: boolean }>> {
      if (!can(session, 'settings.edit') || !can(session, 'reports.read')) return fail(403, 'forbidden');
      const read = readBoundsInput(input.values);
      if ('errors' in read) return fail(400, 'invalid_bands', { errors: read.errors satisfies (BoundError | null)[] });
      return changeBands(session, read.bounds, input.seen, ip);
    },

    /** «برگرداندن به بازه‌های تعرفه» (تصمیم ۱۰۹): از این لحظه گزارش با بازه‌های کرایهٔ تعرفهٔ فعال همراه می‌شود. */
    async resetReportBands(session: AdminSession, input: { seen: unknown }, ip: string): Promise<Result<{ bands: ReportBands; written: boolean }>> {
      if (!can(session, 'settings.edit') || !can(session, 'reports.read')) return fail(403, 'forbidden');
      return changeBands(session, 'tariff', input.seen, ip);
    },

    /**
     * مقدار پنل یک کلید، با کد تازه. پیش از کد: مجوز، نام، مقدار، و اینکه کلید همان است که صفحه نشان داد. مقدار مهروموم
     * می‌شود و جز همان جایی نمی‌رود؛ رویداد فقط نام و منبع قبلی را دارد.
     */
    async setKey(
      session: AdminSession,
      input: { name: unknown; value: unknown; seen: unknown; code: unknown; test?: unknown },
      ip: string,
    ): Promise<Result<{ name: ServiceKeyName }>> {
      if (!can(session, 'secrets.edit')) return fail(403, 'forbidden');
      if (!isServiceKeyName(input.name)) return fail(404, 'key_not_found');
      const name = input.name;
      const tested = KEY_TESTS[name] !== undefined;
      const value = readKeyValue(input.value, name);
      if (value === null) return fail(400, !tested || KEY_TESTS[name] === 'credit' ? 'invalid_key_value' : 'invalid_template_id', { name });
      const target = await seenRow(name, input.seen);
      if (!target.ok) return target;
      const { row, seen } = target.value;
      // کلید sms.ir فقط با آزمایشی که همین مقدار را ذخیره‌شدنی گفت (۷٫۱)؛ پیش از کد، تا کد برای کار ناشدنی نسوزد.
      const outcome = tested ? passedTest(name, value, seen, session.userId, input.test) : null;
      if (tested && !outcome) return fail(409, 'key_untested', { name });

      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await deps.secrets.put({
        name,
        sealed: seal(deps.secretsKey, value, serviceKeyContext(name)),
        verify: (current) => keySeenOf(current) === seen,
        at: now(),
        actor: actor(session, ip),
        detail: { from: row ? 'panel' : envOf(name) ? 'env' : 'empty', ...(outcome ? { tested: outcome } : {}) },
      });
      return done === 'ok' ? ok({ name }) : fail(409, 'key_changed', { name });
    },

    /** «برگرداندن به .env»: مقدار پنل پاک، با کد تازه؛ از این لحظه `.env` (یا هیچ، اگر `.env` ندارد). */
    async revertKey(
      session: AdminSession,
      input: { name: unknown; seen: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ name: ServiceKeyName }>> {
      if (!can(session, 'secrets.edit')) return fail(403, 'forbidden');
      if (!isServiceKeyName(input.name)) return fail(404, 'key_not_found');
      const name = input.name;
      const target = await seenRow(name, input.seen);
      if (!target.ok) return target;
      const { row, seen } = target.value;
      if (!row) return fail(409, 'key_changed', { name });

      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await deps.secrets.remove({
        name,
        verify: (current) => keySeenOf(current) === seen,
        at: now(),
        actor: actor(session, ip),
        detail: { to: envOf(name) ? 'env' : 'empty' },
      });
      return done === 'ok' ? ok({ name }) : fail(409, 'key_changed', { name });
    },
  };
}

export type PanelSettings = ReturnType<typeof createPanelSettings>;
