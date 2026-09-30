/**
 * پیامک، پشت آداپتور (ADR-008؛ مشترک وب و پنل از برش ۶٫۳، ADR-047؛ پنل واقعی sms.ir از برش ۷، ADR-049).
 *
 * - **آداپتور** (`SmsTransport`): فقط فرستادن. پیامک کنسولی (توسعه، CI، و پنل تا `SMS_PROVIDER=smsir`): یک خط لاگ، و ردیف
 *   `sms_messages` با متن کامل، تا پیامک بی پنل پیامک آزمودنی باشد. آداپتور sms.ir (`@jozveyar/sms/smsir`) قالب تأییدشده را با
 *   پارامترها می‌فرستد (`params`)، نه متن آزاد؛ متن هر سه قالب یک منبع دارد (`templates.ts`).
 * - **پیامک کد** (`loggedSms`): فرستادن، بعد ردیف `sms_messages`، همان رفتار برش ۳.
 * - **پیامک پرداخت و رهگیری** (`deliverQueued`): ردیف «منتظر» در همان تراکنش پرداخت یا مرسوله نوشته شده (`@jozveyar/db`)؛ اینجا بعد
 *   از commit فرستاده می‌شود: اول «در حال فرستادن» (فقط یک فرستنده برنده است)، بعد «رفت» یا «نرفت». هیچ پیامکی خودکار دوباره نمی‌رود.
 *
 * بی وابستگی: نوشتن و خواندن جدول مال `@jozveyar/db` است و اینجا فقط درگاهش (`SmsLog`، `SmsOutbox`).
 */

export {
  SMS_PARAM_MAX,
  SMS_TEMPLATES,
  isParamValue,
  orderPaidText,
  otpParams,
  otpText,
  paidParams,
  paramMark,
  smsSegments,
  templateSource,
  templateText,
  trackingParams,
  trackingText,
  type SmsTemplate,
  type SmsTemplateKey,
} from './templates';

export type SmsPurpose = 'otp' | 'order_paid' | 'tracking';

/** `logged` (کنسولی)، `sent` (پنل واقعی)، `failed`؛ و فقط برای پرداخت و رهگیری `pending` (منتظر) و `sending` (در حال فرستادن). */
export type SmsStatus = 'logged' | 'sent' | 'failed' | 'pending' | 'sending';

export interface SmsRecord {
  provider: string;
  toMobile: string;
  purpose: SmsPurpose;
  /** null برای پنل واقعی و کد پیامکی: کد زنده در پایگاه داده نمی‌نشیند (ADR-033). */
  body: string | null;
  status: 'logged' | 'sent' | 'failed';
  providerMessageId?: string | null;
  /** علت «نرفت» (`smsErrorTag`)، بی متن پاسخ. */
  error?: string | null;
  /** هزینه‌ای که پنل واقعی گفت، به واحد خودش (ADR-049). */
  cost?: number | null;
}

export interface SmsLog {
  insert(message: SmsRecord): Promise<void>;
}

export interface SmsMessage {
  to: string;
  purpose: SmsPurpose;
  /** متن کامل؛ همان که پیامک کنسولی نگه می‌دارد. */
  text: string;
  /** پارامترهای قالب، به ترتیب `SMS_TEMPLATES`؛ پنل واقعی فقط همین‌ها را می‌فرستد و متن را خودش از قالب می‌سازد. */
  params?: readonly string[];
}

/** نتیجهٔ فرستادن: کنسولی `logged`، پنل واقعی `sent` با شناسهٔ پیامک و هزینه‌اش. شکست پرتاب می‌شود (`SmsError`). */
export interface SmsSent {
  status: 'logged' | 'sent';
  providerMessageId: string | null;
  cost?: number | null;
}

export interface SmsTransport {
  /** همان که در `sms_messages.provider` می‌نشیند. */
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSent>;
}

/** فرستنده‌ای که ردیف `sms_messages` را خودش می‌نویسد (کد پیامکی و پرداخت). */
export interface SmsProvider {
  readonly name: string;
  /** شکستش پرتاب می‌شود؛ فرستنده تصمیم می‌گیرد چه کند. */
  send(message: SmsMessage): Promise<void>;
}

/**
 * علت «نرفت»، کوتاه و بی مقدار کلید: `unavailable` (پنل پیامک جواب نداد: شبکه، سقف زمان، ۴۲۹ یا ۵xx)، `rejected` (نپذیرفت)،
 * `interrupted` (نیمه‌کاره ماند)، `unconfigured` (کلید API یا شناسهٔ قالب خالی است یا خوانده نشد؛ برش ۷).
 */
export type SmsErrorCode = 'unavailable' | 'rejected' | 'interrupted' | 'unconfigured';

/** فقط عدد پاسخ پنل پیامک: کد HTTP و `status` بدنه؛ هرگز متن. */
export interface SmsErrorDetail {
  http?: number;
  status?: number;
}

export class SmsError extends Error {
  constructor(
    readonly code: SmsErrorCode,
    readonly detail: SmsErrorDetail = {},
  ) {
    super(code);
    this.name = 'SmsError';
  }
}

export const smsErrorCode = (error: unknown): SmsErrorCode => (error instanceof SmsError ? error.code : 'unavailable');

/** علت «نرفت» برای ستون `sms_messages.error`: کد، و عدد پاسخ پنل پیامک اگر بود (`rejected:401`)؛ `status` بدنه بر کد HTTP مقدم. */
export function smsErrorTag(error: unknown): string {
  const code = smsErrorCode(error);
  const number = error instanceof SmsError ? (error.detail.status ?? error.detail.http) : undefined;
  return number === undefined ? code : `${code}:${number}`;
}

/** برعکس `smsErrorTag`؛ برچسب ناشناس همان «جواب نداد». */
export function parseSmsErrorTag(tag: string | null | undefined): { code: SmsErrorCode; number: number | null } {
  const match = /^(unavailable|rejected|interrupted|unconfigured)(?::(-?\d{1,9}))?$/.exec(tag ?? '');
  if (!match) return { code: 'unavailable', number: null };
  return { code: match[1] as SmsErrorCode, number: match[2] === undefined ? null : Number(match[2]) };
}

/** پیامک کنسولی: فقط یک خط لاگ؛ ردیفش را فرستنده می‌نویسد. */
export function consoleTransport(print: (line: string) => void = console.info): SmsTransport {
  return {
    name: 'console',
    async send(message) {
      print(`✉ پیامک کنسولی به ${message.to} (${message.purpose}): ${message.text.replace(/\n/g, ' ⏎ ')}`);
      return { status: 'logged', providerMessageId: null };
    },
  };
}

/**
 * فرستادن و بعد ردیف `sms_messages` (کد پیامکی، برش ۳). پنل واقعی متن و پارامتر کد را نگه نمی‌دارد (ADR-033؛ CHECK
 * `sms_messages_otp_secret`)؛ شکست پنل واقعی ردیف `failed` می‌گذارد و پرتاب می‌شود.
 */
export function loggedSms(transport: SmsTransport, log: SmsLog): SmsProvider {
  const secret = (message: SmsMessage) => message.purpose === 'otp' && transport.name !== 'console';
  return {
    name: transport.name,
    async send(message) {
      let sent: SmsSent;
      try {
        sent = await transport.send(message);
      } catch (error) {
        if (transport.name !== 'console') {
          await log.insert({
            provider: transport.name,
            toMobile: message.to,
            purpose: message.purpose,
            body: secret(message) ? null : message.text,
            status: 'failed',
            error: smsErrorTag(error),
          });
        }
        throw error;
      }
      await log.insert({
        provider: transport.name,
        toMobile: message.to,
        purpose: message.purpose,
        body: secret(message) ? null : message.text,
        status: sent.status,
        providerMessageId: sent.providerMessageId,
        cost: sent.cost ?? null,
      });
    },
  };
}

/** پیامک کنسولی با ردیف `sms_messages` (کد پیامکی و پرداخت). */
export function consoleSms(log: SmsLog, print: (line: string) => void = console.info): SmsProvider {
  return loggedSms(consoleTransport(print), log);
}

/* ───────────────────────── پیامک از صف (پرداخت و رهگیری): حال و فرستادن ───────────────────────── */

/** ردیفی که بیش از این «منتظر» یا «در حال فرستادن» ماند، دیگر در راه نیست: پنل پیش از پایان افتاد (ADR-047، «اجرا در ۶٫۳»). */
export const SMS_STUCK_MS = 5 * 60_000;

/** حال پیامک پرداخت یا رهگیری برای پنل و صفحهٔ مشتری: رفت، در راه، نرفت، یا معلوم نیست رفت یا نه. */
export type SmsState = 'sent' | 'sending' | 'failed' | 'unknown';

export function smsState(row: { status: string; createdAt: Date; attemptedAt: Date | null }, now: Date): SmsState {
  switch (row.status) {
    case 'logged':
    case 'sent':
      return 'sent';
    case 'pending':
      // هنوز به پنل پیامک داده نشده؛ ماندنش یعنی فرستنده افتاد، پس قطعاً نرفت.
      return now.getTime() - row.createdAt.getTime() > SMS_STUCK_MS ? 'failed' : 'sending';
    case 'sending':
      // به پنل پیامک داده شد و جوابش نیامد: شاید رفته باشد.
      return now.getTime() - (row.attemptedAt ?? row.createdAt).getTime() > SMS_STUCK_MS ? 'unknown' : 'sending';
    default:
      return 'failed';
  }
}

/** «دوباره بفرست» فقط برای پیامکی که نرفت، یا معلوم نیست رفت. */
export const resendable = (state: SmsState) => state === 'failed' || state === 'unknown';

/** ردیف منتظری که فرستنده برداشت. */
export interface QueuedSms {
  id: number;
  to: string;
  purpose: SmsPurpose;
  body: string;
  params: readonly string[] | null;
}

export type SmsResult =
  | { ok: true; provider: string; status: 'logged' | 'sent'; providerMessageId: string | null; cost: number | null }
  /** `tag`: همان `smsErrorTag`، برای ستون `error`. */
  | { ok: false; provider: string; error: SmsErrorCode; tag: string };

/** درگاه ردیف‌های منتظر پرداخت و رهگیری (`@jozveyar/db`). */
export interface SmsOutbox {
  /**
   * «در حال فرستادن»، فقط یک بار: `queued` فقط ردیف منتظر؛ `retry` («دوباره بفرست») فقط نرفته یا معلوم‌نبوده. هر دو فقط اگر ردیف
   * هنوز زنده است: کد رهگیری‌اش کنار نرفته، و پیامک پرداخت به پرداخت موفقش وصل است. null یعنی برداشتنی نیست (کس دیگری برداشت،
   * رفته، یا کدش کنار رفت).
   */
  claim(id: number, at: Date, mode: 'queued' | 'retry'): Promise<QueuedSms | null>;
  finish(id: number, at: Date, result: SmsResult): Promise<void>;
}

export interface Delivery {
  id: number;
  /** `skipped`: برداشته نشد. */
  outcome: 'sent' | 'failed' | 'skipped';
  error?: SmsErrorCode;
  /** همان `smsErrorTag` شکست. */
  tag?: string;
}

/**
 * ردیف‌های منتظر را بعد از commit می‌فرستد (یا یکی را برای «دوباره بفرست»)، تا `concurrency` تا هم‌زمان. شکست یک پیامک بقیه را
 * نگه نمی‌دارد، و شکست ثبت نتیجه فقط لاگ می‌شود: ردیف «در حال فرستادن» می‌ماند و پس از `SMS_STUCK_MS` «معلوم نیست» است.
 */
export async function deliverQueued(
  deps: { outbox: SmsOutbox; transport: SmsTransport; now?: () => Date; log?: (message: string, error?: unknown) => void },
  ids: readonly number[],
  options: { mode?: 'queued' | 'retry'; concurrency?: number } = {},
): Promise<Delivery[]> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message, error) => console.error(message, error ?? ''));
  const mode = options.mode ?? 'queued';
  const results: Delivery[] = new Array(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      const id = ids[i]!;
      results[i] = await deliverOne(id);
    }
  };
  const deliverOne = async (id: number): Promise<Delivery> => {
    const queued = await deps.outbox.claim(id, now(), mode);
    if (!queued) return { id, outcome: 'skipped' };
    let result: SmsResult;
    try {
      const sent = await deps.transport.send({
        to: queued.to,
        purpose: queued.purpose,
        text: queued.body,
        ...(queued.params ? { params: queued.params } : {}),
      });
      result = { ok: true, provider: deps.transport.name, status: sent.status, providerMessageId: sent.providerMessageId, cost: sent.cost ?? null };
    } catch (error) {
      result = { ok: false, provider: deps.transport.name, error: smsErrorCode(error), tag: smsErrorTag(error) };
      log(`✗ پیامک ${id} (${queued.purpose}) نرفت:`, smsErrorTag(error));
    }
    try {
      await deps.outbox.finish(id, now(), result);
    } catch (error) {
      log(`✗ نتیجهٔ پیامک ${id} ثبت نشد:`, error);
    }
    return result.ok ? { id, outcome: 'sent' } : { id, outcome: 'failed', error: result.error, tag: result.tag };
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, ids.length)) }, worker));
  return results;
}
