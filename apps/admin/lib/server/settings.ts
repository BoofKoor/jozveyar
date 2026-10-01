/**
 * تنظیمات و کلیدها در پنل (برش ۴٫۶، ADR-041؛ طرح پنل `m-settings` و `m-key-edit`): روز کاری تحویل به پست، سقف ساعتی کد
 * پیامکی کل سایت، تعطیلی‌ها، و کلیدهای سرویس‌های بیرونی؛ و از ۶٫۴ بازه‌های وزن گزارش ارسال، که فرمش در خود صفحهٔ گزارش است.
 * از ۷٫۱ (ADR-049، سؤال‌های ۱۳۷ و ۱۳۸): سقف ۲۴ ساعتهٔ کد، اعتبار پیامک sms.ir و آستانهٔ هشدارش، و «آزمایش» کلیدهای sms.ir با خود
 * sms.ir: کلید API با اعتبار (بی پیامک)، هر شناسهٔ قالب با یک پیامک آزمایشی؛ «رد شد» ذخیره نمی‌شود.
 *
 * - **مجوز در سرور** (ADR-038): تنظیم‌ها با `settings.edit` و کلیدها با `secrets.edit`، هر دو فقط مالک.
 * - **سرور منبع حقیقت است:** هر مقدار با همان `SETTING_SCHEMAS` سنجیده می‌شود که سایت با آن می‌خواند (`readSetting`)، و
 *   تعطیلی تازه روزی واقعی و آینده است.
 * - **همان که دیده شد:** فرم مقدار یا نسخه‌ای را که صفحه نشان داد می‌فرستد (`seen`)، و ذخیره‌گاه زیر قفل با امروز می‌سنجد؛
 *   نوشتنی که ادمین دیگری را بی‌صدا رونویسی کند نیست. مقصد یکسان (همین حالا همان است) موفق است، بی رویداد دوم. افزودن و حذف
 *   تعطیلی کار روی فهرست امروز است، نه رونویسی فهرستی که دیده شد: دو افزودن هم‌زمان هر دو می‌مانند.
 * - **کلیدها کار حساس‌اند:** کد تازهٔ برنامهٔ تأیید (`stepUp`)، فقط پس از هر سنجشی که بی کد جواب دارد (مقدار، «همان که دیده
 *   شد»، و از ۷٫۱ آزمایش با خود سرویس)، تا کد برای کاری که انجام‌شدنی نیست نه مصرف شود و نه «نادرست» شمرده شود. مقدار کلید هیچ‌جا
 *   نمی‌رود جز مهروموم در پایگاه داده: نه نما (فقط ۴ نویسهٔ آخر؛ شناسهٔ قالب راز نیست و کامل)، نه رویداد، نه لاگ، نه پاسخ.
 * - **آزمایش:** «آزمایش» مقدار امروز بی کد؛ مقدار تازهٔ کلید API «آزمایش و ذخیره» در یک کار؛ قالب دو قدم: پیامک آزمایشی، بعد «ذخیره» با
 *   کد. «بی آزمایش ذخیره کن» فقط پس از «در دسترس نیست» همان مقدار. آزمودن مقدار تازه رسیدی بی خود مقدار می‌دهد (HMAC با
 *   `SESSION_SECRET`، ۱۵ دقیقه)، تا «ذخیره» فقط همان مقدار آزموده را بپذیرد. سقف ۱۰ آزمایش در ساعت زیر قفل، و هر آزمایش رویداد
 *   `settings.key_test` با نتیجه و موبایل پوشیده، هرگز مقدار.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید (`SettingsStore`، `SecretStore`، `stepUp`، `.env`)، پس با ذخیره‌گاه و ساعت ساختگی تست
 * می‌شود. قفل و تراکنش روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { SETTING_SCHEMAS, type Holiday, type SettingKey, type SettingValue } from '@jozveyar/contracts';
import {
  DEFAULT_SETTINGS,
  REPORT_BANDS_SETTING,
  SERVICE_KEYS,
  bandsDecision,
  isServiceKeyName,
  readSetting,
  resolveServiceKey,
  seal,
  serviceKeyContext,
  type KeyCheck,
  type ReportBands,
  type SecretStore,
  type ServiceKeyName,
  type ServiceSecretRow,
  type SettingsStore,
  type SmsStats,
} from '@jozveyar/db';
import { PaymentError, paymentErrorCode } from '@jozveyar/payments';
import { isZibalMerchant, type ZibalClient } from '@jozveyar/payments/zibal';
import { SMS_TEMPLATES, SmsError, smsErrorCode } from '@jozveyar/sms';
import { isSmsIrApiKey, isSmsIrTemplateId, type SmsIrClient } from '@jozveyar/sms/smsir';
import { tehranDayStart } from '@jozveyar/text';
import { normalizeIranMobile } from '@jozveyar/text/input';

import { readBoundsInput, type BoundError } from '../report';
import {
  KEY_INFO,
  KEY_RECEIPT_MS,
  KEY_TESTS_PER_HOUR,
  TEMPLATE_SAMPLES,
  creditDays,
  isNumberSetting,
  keyTail,
  maskMobile,
  parseWholeNumber,
  readHolidayInput,
  readKeyValue,
  sortHolidays,
  type NumberSettingKey,
} from '../settings';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelSettingsDeps {
  settings: SettingsStore;
  secrets: SecretStore;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SECRETS_KEY`: مهروموم کلیدها. */
  secretsKey: Buffer;
  /** `.env` سرور (`process.env`): مقدار هر کلید وقتی مقدار پنلی نیست. */
  env: Readonly<Record<string, string | undefined>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود، و رسید آزمایش کلید. */
  secret: string;
  /** sms.ir (برش ۷٫۱): «آزمایش» کلیدها و اعتبار؛ نشانی پایه از `SMSIR_API_URL`. بی آن «آزمایش» نیست. */
  smsir?: SmsIrClient;
  /**
   * زیبال (برش ۷٫۲، ADR-050، سؤال ۱۳۸): «آزمایش» کد پذیرنده، یک `request` با نشانی برگشت `PAYMENT_CALLBACK_URL` (و کلید برگشتی که هیچ
   * تلاشی ندارد)؛ نشانی پایه از `ZIBAL_API_URL`. بی آن کد پذیرنده «آزمایش» ندارد.
   */
  zibal?: { client: ZibalClient; callbackUrl: string | null };
  /** شمار کد و هزینهٔ پیامک: کارت «سقف کد پیامکی» و «اعتبار پیامک»، و هشدارهای پیشخوان. */
  smsStats?: SmsStats;
  /**
   * sms.ir در کار است (`SMS_PROVIDER=smsir` یا `CHECKOUT_MODE=live` در `.env`): اعتبار با باز شدن «تنظیمات» و پیشخوان خوانده می‌شود.
   * وگرنه فقط با «آزمایش» کلید API، تا پنلی که پیامک واقعی ندارد بی‌دلیل به sms.ir درخواست ندهد.
   */
  smsInUse?: boolean;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** نتیجهٔ «آزمایش» یک کلید با خود sms.ir؛ فقط کد و عدد پاسخ، هرگز متن. */
export interface KeyTestOutcome {
  outcome: 'ok' | 'rejected' | 'unavailable' | 'unconfigured';
  http: number | null;
  status: number | null;
  /** اعتبار sms.ir در آزمایش کلید API درست. */
  credit: number | null;
}

/** «آزمایش» مقدار تازه: رسیدی که «ذخیره» یا «بی آزمایش ذخیره کن» همان مقدار را با آن می‌پذیرد. */
export interface KeyReceipt {
  outcome: KeyTestOutcome['outcome'];
  /** زمان آزمایش، ISO. */
  at: string;
  mac: string;
}

/** کارت «اعتبار پیامک» (سؤال ۱۳۷): عدد خود sms.ir، و «برای حدود N روز» از هزینهٔ هفت روز گذشته. */
export type CreditView =
  | {
      state: 'ok';
      credit: number | null;
      at: Date;
      /** همین حالا از sms.ir (sms.ir در کار است)، یا از آخرین «آزمایش» کلید API. */
      live: boolean;
      days: number | null;
      week: { cost: number; count: number };
    }
  | { state: 'rejected' | 'unavailable'; at: Date; live: boolean; http: number | null }
  /** کلید API خالی است یا خوانده نشد. */
  | { state: 'unconfigured' }
  /** sms.ir در کار نیست و کلید API هنوز آزموده نشده. */
  | { state: 'untested' };

/** هشدارهای پیامک پیشخوان (برش ۷٫۱، طرح `m-dash-alerts`): فقط مالک و متصدی. */
export interface SmsAlertsView {
  /** سقف کد کل سایت امروز پر شد: کدام، کی، و اگر هنوز پر است تا حدود کی. */
  otpCap: { kind: 'hour' | 'day'; limit: number; at: Date; until: Date | null } | null;
  /** اعتبار sms.ir زیر آستانه (روز مصرف)، فقط وقتی sms.ir در کار است. */
  lowCredit: { credit: number; days: number | null; threshold: number } | null;
}

/** اعتبار sms.ir که همین تازگی خوانده شد (هر نود جدا؛ فقط نمایش است، نه قفل): باز کردن پشت‌سرهم پیشخوان و «تنظیمات» یک درخواست. */
const CREDIT_CACHE_MS = 5 * 60_000;
/** سقف زمان خواندن نمایشی اعتبار: sms.ir کند پیشخوان و «تنظیمات» را بیش از این نگه نمی‌دارد. «آزمایش» همان ۱۰ ثانیهٔ آداپتور. */
const CREDIT_READ_TIMEOUT_MS = 3_000;

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
  /** شناسهٔ قالب امروز، کامل (راز نیست؛ برش ۷٫۱)؛ کلید راز همیشه null. */
  value: string | null;
  /** آخرین «آزمایش» مقدار امروز، یا گذاشتن و برگرداندنش (برش ۷٫۱). */
  check: KeyCheck | null;
}

export interface SettingsView {
  now: Date;
  canSettings: boolean;
  canSecrets: boolean;
  /** تنظیم‌ها، اگر `settings.edit`. */
  values: {
    slaDays: number;
    otpLimit: number;
    /** سقف ۲۴ ساعتهٔ کد کل سایت (برش ۷٫۱). */
    otpDailyLimit: number;
    retentionDays: number;
    holidays: Holiday[];
    officialThrough: number;
    /** آستانهٔ هشدار اعتبار پیامک، روز مصرف (برش ۷٫۱). */
    creditAlertDays: number;
  } | null;
  /** شمار کد ساعت و ۲۴ ساعت گذشته، کل سایت (برش ۷٫۱)؛ اگر `settings.edit`. */
  otpUsage: { hour: number; day: number } | null;
  /** کارت «اعتبار پیامک» (برش ۷٫۱)؛ اگر `settings.edit`. */
  credit: CreditView | null;
  /** کلیدها، اگر `secrets.edit`؛ به ترتیب `SERVICE_KEYS`. */
  keys: KeyView[];
}

/** نسخهٔ مقدار پنل یک کلید، بی خود مقدار: اثر انگشت مهروموم (که با هر ذخیره عوض می‌شود)، یا `none`. */
export const keySeenOf = (sealed: string | null) =>
  sealed === null ? 'none' : `panel:${createHash('sha256').update(sealed).digest('hex').slice(0, 32)}`;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** مقدار خام امروز به شکل قرارداد، یا پیش‌فرض؛ همان `readSetting`، زیر قفل و بی لاگ. */
function effective<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const parsed = raw === undefined || raw === null ? null : SETTING_SCHEMAS[key].safeParse(raw);
  return (parsed?.success ? parsed.data : DEFAULT_SETTINGS[key]) as SettingValue<K>;
}

/** مبلغ «آزمایش» کد پذیرنده (برش ۷٫۲، طرح `m-key-rejected`): ۱٬۰۰۰ تومان، بیش از کمینهٔ زیبال (۱٬۰۰۰ ریال). */
export const MERCHANT_TEST_RIALS = 10_000;

/** کد خطای مقدار نادرست هر کلید. */
const invalidValueOf = (name: ServiceKeyName) =>
  KEY_INFO[name].kind === 'template' ? 'invalid_template_id' : name === 'SMS_API_KEY' ? 'invalid_api_key' : 'invalid_key_value';

export function createPanelSettings(deps: PanelSettingsDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error ?? ''));
  const actor = (session: AdminSession, ip: string) => ({ adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) });
  const envOf = (name: ServiceKeyName) => deps.env[name]?.trim() || null;

  function keyView(name: ServiceKeyName, row: ServiceSecretRow | null, check: KeyCheck | null): KeyView {
    const state = resolveServiceKey(name, row, deps.env, deps.secretsKey, (message) => log(message));
    const fromEnv = envOf(name);
    const template = KEY_INFO[name].kind === 'template';
    return {
      name,
      source: state.source,
      tail: state.value === null || template ? null : keyTail(state.value),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy?.name ?? null,
      envSet: fromEnv !== null,
      envTail: fromEnv === null || template ? null : keyTail(fromEnv),
      seen: keySeenOf(row?.sealed ?? null),
      value: template ? state.value : null,
      check,
    };
  }

  /** مقدار امروز یک کلید (پنل بر `.env` مقدم)؛ null یعنی خالی یا «خوانده نشد». */
  const currentValue = async (name: ServiceKeyName) =>
    resolveServiceKey(name, await deps.secrets.read(name), deps.env, deps.secretsKey, (message) => log(message)).value;

  /** شکل مقدار تازهٔ هر کلید: شناسهٔ قالب عدد، کلید API شکل سرآیند، کد پذیرنده شکل زیبال؛ بقیه همان `readKeyValue`. */
  function readValueFor(name: ServiceKeyName, input: unknown): string | null {
    const value = readKeyValue(input);
    if (value === null) return null;
    if (KEY_INFO[name].kind === 'template') return isSmsIrTemplateId(value) ? value : null;
    if (name === 'SMS_API_KEY') return isSmsIrApiKey(value) ? value : null;
    if (name === 'PAYMENT_MERCHANT_ID') return isZibalMerchant(value) ? value : null;
    return value;
  }

  /** «آزمایش» این کلید ممکن است: کلیدی آزمودنی، و سرویسش در این پنل. */
  const testerFor = (name: ServiceKeyName) => KEY_INFO[name].testable && (KEY_INFO[name].service === 'zibal' ? Boolean(deps.zibal) : Boolean(deps.smsir));

  /**
   * آزمایش کد پذیرنده با خود زیبال (برش ۷٫۲): یک `request` با مبلغ آزمایش و کلید برگشت تصادفی که هیچ تلاشی ندارد؛ کسی به صفحه‌اش
   * نمی‌رود و زیبال تراکنش پرداخت‌نشده را خودش می‌بندد. ۱۰۰ درست؛ هر `result` دیگر «رد شد» با همان کد (۱۰۲ تا ۱۰۴ کد پذیرنده، ۱۰۶ و
   * ۱۴۰ نشانی برگشت، ۱۱۵ IP سرور)؛ شبکه، سقف زمان یا ۵xx «در دسترس نیست». نشانی برگشت که نیست «آزموده نشد».
   */
  async function runZibalTest(value: string): Promise<KeyTestOutcome> {
    const empty = { http: null, status: null, credit: null };
    const zibal = deps.zibal!;
    if (!zibal.callbackUrl) return { outcome: 'unconfigured', ...empty };
    try {
      await zibal.client.request({
        merchant: value,
        amountRials: MERCHANT_TEST_RIALS,
        callbackUrl: `${zibal.callbackUrl.replace(/\/+$/, '')}/${randomBytes(16).toString('hex')}`,
        orderId: `test-${randomBytes(4).toString('hex')}`,
        description: 'آزمایش کد پذیرندهٔ جزوه‌یار',
      });
      return { outcome: 'ok', ...empty };
    } catch (error) {
      const code = paymentErrorCode(error);
      const detail = error instanceof PaymentError ? error.detail : {};
      return {
        // شکل کد پذیرنده درست نیست (`unconfigured` آداپتور) هم «رد شد» است؛ پاسخ بدشکل «در دسترس نیست».
        outcome: code === 'rejected' || code === 'unconfigured' ? 'rejected' : 'unavailable',
        http: detail.http ?? null,
        status: detail.result ?? null,
        credit: null,
      };
    }
  }

  /** یک آزمایش با خود sms.ir، یا از ۷٫۲ زیبال؛ هر شکست فقط کد و عدد پاسخ. قالب با کلید API امروز و پارامترهای نمونه. */
  async function runTest(name: ServiceKeyName, value: string, mobile: string | null): Promise<KeyTestOutcome> {
    if (KEY_INFO[name].service === 'zibal') return runZibalTest(value);
    const empty = { http: null, status: null, credit: null };
    const client = deps.smsir!;
    try {
      if (name === 'SMS_API_KEY') return { outcome: 'ok', ...empty, credit: await client.credit(value) };
      const purpose = KEY_INFO[name].purpose!;
      const apiKey = await currentValue('SMS_API_KEY');
      if (!apiKey) return { outcome: 'unconfigured', ...empty };
      const samples = TEMPLATE_SAMPLES[purpose];
      await client.verify({
        apiKey,
        templateId: value,
        mobile: mobile!,
        parameters: SMS_TEMPLATES[purpose].params.map((param, i) => ({ name: param, value: samples[i]! })),
      });
      return { outcome: 'ok', ...empty };
    } catch (error) {
      const code = smsErrorCode(error);
      const detail = error instanceof SmsError ? error.detail : {};
      return {
        outcome: code === 'rejected' ? 'rejected' : code === 'unconfigured' ? 'unconfigured' : 'unavailable',
        http: detail.http ?? null,
        status: detail.status ?? null,
        credit: null,
      };
    }
  }

  /** جزئیات رویداد آزمایش: نتیجه و عدد پاسخ؛ هرگز مقدار. */
  const testDetail = (subject: 'current' | 'new', result: KeyTestOutcome, mobile: string | null) => ({
    subject,
    outcome: result.outcome,
    ...(result.http !== null ? { http: result.http } : {}),
    ...(result.status !== null ? { status: result.status } : {}),
    ...(result.credit !== null ? { credit: result.credit } : {}),
    ...(mobile ? { mobile: maskMobile(mobile) } : {}),
  });

  /** رسید آزمایش مقدار تازه: HMAC نام، مقدار، نتیجه، ادمین و زمان، با `SESSION_SECRET`؛ خود مقدار در آن نیست. */
  const macOf = (session: AdminSession, name: ServiceKeyName, value: string, outcome: string, at: string) =>
    createHmac('sha256', deps.secret).update(['key_receipt', name, value, outcome, session.userId, at].join('\0')).digest('hex');

  function receiptOf(session: AdminSession, name: ServiceKeyName, value: string, outcome: KeyTestOutcome['outcome'], at: Date): KeyReceipt {
    const iso = at.toISOString();
    return { outcome, at: iso, mac: macOf(session, name, value, outcome, iso) };
  }

  /** رسید همین مقدار، از همین ادمین، و هنوز تازه؛ null اگر نه. */
  function receiptFor(session: AdminSession, name: ServiceKeyName, value: string, input: { receipt?: unknown; testedAt?: unknown; tested?: unknown }) {
    const outcome = text(input.tested);
    const at = text(input.testedAt);
    const mac = text(input.receipt);
    if (!['ok', 'unavailable'].includes(outcome) || !/^[0-9a-f]{64}$/.test(mac)) return null;
    const when = Date.parse(at);
    if (!Number.isFinite(when) || new Date(when).toISOString() !== at) return null;
    const age = now().getTime() - when;
    if (age < 0 || age > KEY_RECEIPT_MS) return null;
    const want = Buffer.from(macOf(session, name, value, outcome, at), 'hex');
    const got = Buffer.from(mac, 'hex');
    return want.length === got.length && timingSafeEqual(want, got) ? { outcome: outcome as 'ok' | 'unavailable' } : null;
  }

  let creditCache: { at: number; key: string; view: CreditView } | null = null;

  /**
   * کارت «اعتبار پیامک»: وقتی sms.ir در کار است همین حالا از sms.ir (تا ۵ دقیقه همان خواندن)، وگرنه از آخرین «آزمایش» کلید API؛
   * و هزینهٔ هفت روز گذشته برای «برای حدود N روز».
   */
  async function creditView(checks: readonly KeyCheck[]): Promise<CreditView> {
    const at = now();
    const week = deps.smsStats ? await deps.smsStats.smsCost(new Date(at.getTime() - 7 * 86_400_000)) : { cost: 0, count: 0 };
    const ok = (credit: number | null, when: Date, live: boolean): CreditView => ({
      state: 'ok',
      credit,
      at: when,
      live,
      days: credit === null ? null : creditDays(credit, week.cost),
      week,
    });
    const apiKey = await currentValue('SMS_API_KEY');
    if (!apiKey) return { state: 'unconfigured' };
    if (deps.smsInUse && deps.smsir) {
      const key = createHash('sha256').update(apiKey).digest('hex');
      if (creditCache && creditCache.key === key && at.getTime() - creditCache.at < CREDIT_CACHE_MS) return creditCache.view;
      let view: CreditView;
      try {
        view = ok(await deps.smsir.credit(apiKey, CREDIT_READ_TIMEOUT_MS), at, true);
      } catch (error) {
        const detail = error instanceof SmsError ? error.detail : {};
        view = { state: smsErrorCode(error) === 'rejected' ? 'rejected' : 'unavailable', at, live: true, http: detail.http ?? null };
      }
      creditCache = { at: at.getTime(), key, view };
      return view;
    }
    const tested = checks.find((check) => check.name === 'SMS_API_KEY');
    if (!tested) return { state: 'untested' };
    const credit = typeof tested.detail.credit === 'number' ? tested.detail.credit : null;
    const outcome = tested.action === 'settings.key_set' ? tested.detail.tested : tested.detail.outcome;
    if (outcome === 'ok' && credit !== null) return ok(credit, tested.at, false);
    if (tested.action === 'settings.key_test' && (outcome === 'rejected' || outcome === 'unavailable')) {
      return { state: outcome, at: tested.at, live: false, http: typeof tested.detail.http === 'number' ? tested.detail.http : null };
    }
    return { state: 'untested' };
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
   * روز کاری تحویل به پست، سقف ساعتی کد پیامکی، یا روزهای نگهداری فایل‌های سفارش (۵٫۱). مقصد یکسان موفق است، بی رویداد؛
   * وگرنه فقط اگر امروز همان است که صفحه نشان داد (`seen`).
   */
  async function saveNumber(
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
  }

  return {
    async overview(session: AdminSession): Promise<Result<SettingsView>> {
      const canSettings = can(session, 'settings.edit');
      const canSecrets = can(session, 'secrets.edit');
      if (!canSettings && !canSecrets) return fail(403, 'forbidden');
      const read = (key: string) => deps.settings.read(key);
      const at = now();
      const [values, rows, checks, usage] = await Promise.all([
        canSettings
          ? Promise.all([
              readSetting(read, 'order.sla_days', log),
              readSetting(read, 'otp.site_hourly_limit', log),
              readSetting(read, 'calendar.holidays', log),
              readSetting(read, 'calendar.official_through', log),
              readSetting(read, 'order.files_retention_days', log),
              readSetting(read, 'otp.site_daily_limit', log),
              readSetting(read, 'sms.credit_alert_days', log),
            ])
          : null,
        canSecrets ? deps.secrets.list() : [],
        deps.secrets.lastChecks(),
        canSettings && deps.smsStats ? deps.smsStats.otpUsage(at) : null,
      ]);
      return ok({
        now: at,
        canSettings,
        canSecrets,
        values: values
          ? {
              slaDays: values[0],
              otpLimit: values[1],
              otpDailyLimit: values[5],
              retentionDays: values[4],
              holidays: sortHolidays(values[2]),
              officialThrough: values[3],
              creditAlertDays: values[6],
            }
          : null,
        otpUsage: usage ? { hour: usage.hour, day: usage.day } : null,
        credit: canSettings ? await creditView(checks) : null,
        keys: canSecrets
          ? SERVICE_KEYS.map((name) =>
              keyView(
                name,
                rows.find((row) => row.name === name) ?? null,
                checks.find((check) => check.name === name) ?? null,
              ),
            )
          : [],
      });
    },

    saveNumber,

    /**
     * چند تنظیم عددی با هم (کارت «سقف کد پیامکی»، برش ۷٫۱: ساعتی و ۲۴ ساعته با یک «ذخیره»): اول همه سنجیده می‌شوند، و فقط اگر همه
     * درست‌اند هر کدام که عوض شده جدا زیر قفل خودش نوشته می‌شود (`saveNumber`). خطای مقدار هر فیلد با نامش؛ «همین حالا جای دیگری عوض
     * شد» یکی کافی است.
     */
    async saveNumbers(
      session: AdminSession,
      entries: readonly { key: unknown; value: unknown; seen: unknown }[],
      ip: string,
    ): Promise<Result<{ written: NumberSettingKey[] }>> {
      if (!can(session, 'settings.edit')) return fail(403, 'forbidden');
      const invalid: string[] = [];
      for (const entry of entries) {
        if (!isNumberSetting(entry.key)) return fail(404, 'setting_not_found');
        const value = parseWholeNumber(entry.value);
        if (value === null || !SETTING_SCHEMAS[entry.key].safeParse(value).success) invalid.push(entry.key);
      }
      if (invalid.length > 0) return fail(400, 'invalid_setting', { keys: invalid });
      const written: NumberSettingKey[] = [];
      for (const entry of entries) {
        if (text(entry.seen) === String(parseWholeNumber(entry.value))) continue;
        const saved = await saveNumber(session, entry, ip);
        if (!saved.ok) return saved;
        if (saved.value.written) written.push(saved.value.key);
      }
      return ok({ written });
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
     * هشدارهای پیامک پیشخوان (برش ۷٫۱، طرح `m-dash-alerts`، سؤال ۱۴۰): سقف کد کل سایت که امروز پر شد، و اعتبار sms.ir کمتر از آستانه
     * (فقط وقتی sms.ir در کار است). فقط مالک و متصدی (`orders.money`)؛ چاپخانه هیچ.
     */
    async smsAlerts(session: AdminSession): Promise<SmsAlertsView> {
      const none: SmsAlertsView = { otpCap: null, lowCredit: null };
      if (!can(session, 'orders.money') || !deps.smsStats) return none;
      const read = (key: string) => deps.settings.read(key);
      const at = now();
      const [hourLimit, dayLimit, threshold, usage] = await Promise.all([
        readSetting(read, 'otp.site_hourly_limit', log),
        readSetting(read, 'otp.site_daily_limit', log),
        readSetting(read, 'sms.credit_alert_days', log),
        deps.smsStats.otpUsage(at),
      ]);
      const reached = await deps.smsStats.otpCapReached({ since: tehranDayStart(at, 0), hourLimit, dayLimit });
      const otpCap = reached.dayAt
        ? {
            kind: 'day' as const,
            limit: dayLimit,
            at: reached.dayAt,
            until: usage.day >= dayLimit && usage.dayOldest ? new Date(usage.dayOldest.getTime() + 86_400_000) : null,
          }
        : reached.hourAt
          ? {
              kind: 'hour' as const,
              limit: hourLimit,
              at: reached.hourAt,
              until: usage.hour >= hourLimit && usage.hourOldest ? new Date(usage.hourOldest.getTime() + 3_600_000) : null,
            }
          : null;
      let lowCredit: SmsAlertsView['lowCredit'] = null;
      if (deps.smsInUse) {
        const credit = await creditView([]);
        if (credit.state === 'ok' && credit.credit !== null && (credit.credit <= 0 || (credit.days !== null && credit.days < threshold))) {
          lowCredit = { credit: credit.credit, days: credit.days, threshold };
        }
      }
      return { otpCap, lowCredit };
    },

    /**
     * «آزمایش» یک کلید sms.ir (برش ۷٫۱، سؤال‌های ۱۱۹ و ۱۳۸)، بی کد: مقدار امروز (`value` خالی)، یا مقدار تازه پیش از ذخیره (قدم اول قالب).
     * کلید API با اعتبار، بی پیامک؛ قالب با یک پیامک آزمایشی با پارامترهای نمونه به `mobile`. سقف ۱۰ در ساعت زیر قفل، رویداد
     * `settings.key_test` بی مقدار. مقدار تازه رسید می‌گیرد، برای «ذخیره» همان.
     */
    async testKey(
      session: AdminSession,
      input: { name: unknown; value?: unknown; mobile?: unknown },
      ip: string,
    ): Promise<Result<KeyTestOutcome & { name: ServiceKeyName; subject: 'current' | 'new'; mobile: string | null; receipt: KeyReceipt | null }>> {
      if (!can(session, 'secrets.edit')) return fail(403, 'forbidden');
      if (!isServiceKeyName(input.name)) return fail(404, 'key_not_found');
      const name = input.name;
      const info = KEY_INFO[name];
      if (!testerFor(name)) return fail(409, 'key_not_testable', { name });
      const fresh = typeof input.value === 'string' && input.value.trim() !== '';
      const value = fresh ? readValueFor(name, input.value) : await currentValue(name);
      if (value === null) {
        return fresh ? fail(400, invalidValueOf(name), { name }) : fail(409, 'key_empty', { name });
      }
      const mobile = info.kind === 'template' ? normalizeIranMobile(text(input.mobile)) : null;
      if (info.kind === 'template' && !mobile) return fail(400, 'invalid_test_mobile', { name });
      const at = now();
      const subject = fresh ? 'new' : 'current';
      const done = await deps.secrets.test({
        name,
        at,
        actor: actor(session, ip),
        since: new Date(at.getTime() - 3_600_000),
        limit: KEY_TESTS_PER_HOUR,
        run: () => runTest(name, value, mobile),
        detail: (result) => testDetail(subject, result, mobile),
      });
      if (!done.ok) return fail(429, 'key_test_limited', { name });
      const result = done.result;
      const receipt = fresh && (result.outcome === 'ok' || result.outcome === 'unavailable') ? receiptOf(session, name, value, result.outcome, at) : null;
      return ok({ ...result, name, subject, mobile: mobile ? maskMobile(mobile) : null, receipt });
    },

    /**
     * مقدار پنل یک کلید، با کد تازه. پیش از کد: مجوز، نام، مقدار، اینکه کلید همان است که صفحه نشان داد، و از ۷٫۱ آزمایش با خود sms.ir
     * (سؤال ۱۳۸): کلید API «آزمایش و ذخیره» در همین کار (رد شد ذخیره نمی‌شود؛ در دسترس نیست با رسید، برای «بی آزمایش ذخیره کن»)، قالب
     * فقط با رسید پیامک آزمایشی همین مقدار. مقدار مهروموم می‌شود و جز همان جایی نمی‌رود؛ رویداد نام، منبع قبلی و نتیجهٔ آزمایش را
     * دارد.
     */
    async setKey(
      session: AdminSession,
      input: { name: unknown; value: unknown; seen: unknown; code: unknown; receipt?: unknown; testedAt?: unknown; tested?: unknown; skipTest?: unknown },
      ip: string,
    ): Promise<Result<{ name: ServiceKeyName }>> {
      if (!can(session, 'secrets.edit')) return fail(403, 'forbidden');
      if (!isServiceKeyName(input.name)) return fail(404, 'key_not_found');
      const name = input.name;
      const info = KEY_INFO[name];
      const value = readValueFor(name, input.value);
      if (value === null) return fail(400, invalidValueOf(name), { name });
      const target = await seenRow(name, input.seen);
      if (!target.ok) return target;
      const { row, seen } = target.value;

      let tested: { tested?: 'ok' | 'skipped'; credit?: number } = {};
      if (testerFor(name)) {
        if (info.kind === 'template' || text(input.skipTest) === '1') {
          const receipt = receiptFor(session, name, value, input);
          // «بی آزمایش ذخیره کن» کلید API فقط پس از «در دسترس نیست» همین مقدار.
          if (!receipt || (info.kind !== 'template' && receipt.outcome !== 'unavailable')) return fail(409, 'key_untested', { name });
          tested = { tested: receipt.outcome === 'ok' ? 'ok' : 'skipped' };
        } else {
          const at = now();
          const done = await deps.secrets.test({
            name,
            at,
            actor: actor(session, ip),
            since: new Date(at.getTime() - 3_600_000),
            limit: KEY_TESTS_PER_HOUR,
            run: () => runTest(name, value, null),
            detail: (result) => testDetail('new', result, null),
          });
          if (!done.ok) return fail(429, 'key_test_limited', { name });
          const result = done.result;
          if (result.outcome === 'rejected' || result.outcome === 'unconfigured') {
            // `status` خود Failure کد HTTP پنل است؛ کد بدنهٔ sms.ir یا `result` زیبال جدا.
            return fail(400, 'key_rejected', { name, http: result.http, serviceStatus: result.status, unconfigured: result.outcome === 'unconfigured' });
          }
          if (result.outcome === 'unavailable') return fail(503, 'key_unavailable', { name, receipt: receiptOf(session, name, value, 'unavailable', at) });
          tested = { tested: 'ok', ...(result.credit !== null ? { credit: result.credit } : {}) };
        }
      }

      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await deps.secrets.put({
        name,
        sealed: seal(deps.secretsKey, value, serviceKeyContext(name)),
        verify: (current) => keySeenOf(current) === seen,
        at: now(),
        actor: actor(session, ip),
        detail: { from: row ? 'panel' : envOf(name) ? 'env' : 'empty', ...tested },
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
