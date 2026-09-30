/**
 * پیامک، پشت آداپتور (ADR-008؛ مشترک وب و پنل از برش ۶٫۳، ADR-047؛ پنل واقعی sms.ir از ۷٫۱، ADR-049).
 *
 * - **آداپتور** (`SmsTransport`): فقط فرستادن. پیامک کنسولی (توسعه، CI، و مسیر خرید `mock`): یک خط لاگ، و ردیف `sms_messages` با متن
 *   کامل، تا پیامک بی پنل پیامک آزمودنی باشد. sms.ir (`smsIrTransport`): فقط قالب تأییدشده با پارامترها، نه متن آزاد.
 * - **قالب‌ها** (`SMS_TEMPLATES`): متن و نام پارامتر سه پیامک، یک منبع برای کد، پیامک کنسولی و پنل sms.ir.
 * - **پیامک کد** (`loggedSms`): فرستادن، بعد ردیف `sms_messages`، همان رفتار برش ۳.
 * - **پیامک از صف** (`deliverQueued`؛ رهگیری از ۶٫۳ و پرداخت از ۷٫۱): ردیف «منتظر» در همان تراکنش مرسوله یا پرداخت نوشته شده
 *   (`@jozveyar/db`)؛ اینجا بعد از commit فرستاده می‌شود: اول «در حال فرستادن» (فقط یک فرستنده برنده است)، بعد «رفت» یا «نرفت». هیچ
 *   پیامکی خودکار دوباره نمی‌رود.
 *
 * بی وابستگی: نوشتن و خواندن جدول مال `@jozveyar/db` است و اینجا فقط درگاهش (`SmsLog`، `SmsOutbox`).
 */

import type { SmsPurpose } from './templates.js';
import { describeSmsError, smsErrorCode, type SmsErrorCode, type SmsLog, type SmsProvider, type SmsSent, type SmsTransport } from './types.js';

export * from './templates.js';
export * from './types.js';
export * from './smsir.js';

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
 * فرستادن و بعد ردیف `sms_messages` (کد پیامکی، برش ۳؛ پیامک پرداخت از ۷٫۱ از صف است). پنل واقعی متن کد را نگه نمی‌دارد، و پارامترش
 * که خود کد است هرگز در ردیف نمی‌نشیند (ADR-033)؛ شکست پنل واقعی ردیف `failed` با علتش می‌گذارد و پرتاب می‌شود.
 */
export function loggedSms(transport: SmsTransport, log: SmsLog): SmsProvider {
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
            body: message.purpose === 'otp' ? null : message.text,
            status: 'failed',
            error: smsErrorCode(error),
          });
        }
        throw error;
      }
      await log.insert({
        provider: transport.name,
        toMobile: message.to,
        purpose: message.purpose,
        body: message.purpose === 'otp' && sent.status === 'sent' ? null : message.text,
        status: sent.status,
        providerMessageId: sent.providerMessageId,
        cost: sent.cost ?? null,
      });
    },
  };
}

/** پیامک کنسولی با ردیف `sms_messages` (کد پیامکی). */
export function consoleSms(log: SmsLog, print: (line: string) => void = console.info): SmsProvider {
  return loggedSms(consoleTransport(print), log);
}

/* ───────────────────────── پیامک از صف: حال و فرستادن ───────────────────────── */

/** ردیفی که بیش از این «منتظر» یا «در حال فرستادن» ماند، دیگر در راه نیست: پنل پیش از پایان افتاد (ADR-047، «اجرا در ۶٫۳»). */
export const SMS_STUCK_MS = 5 * 60_000;

/** حال پیامک از صف (رهگیری و پرداخت) برای پنل و صفحهٔ مشتری: رفت، در راه، نرفت، یا معلوم نیست رفت یا نه. */
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
  | { ok: true; provider: string; status: 'logged' | 'sent'; providerMessageId: string | null; cost?: number | null }
  | { ok: false; provider: string; error: SmsErrorCode };

/** درگاه ردیف‌های منتظر (`@jozveyar/db`). */
export interface SmsOutbox {
  /**
   * «در حال فرستادن»، فقط یک بار: `queued` فقط ردیف منتظر؛ `retry` («دوباره بفرست») فقط نرفته یا معلوم‌نبوده. هر دو فقط اگر پیامک هنوز
   * رفتنی است: رهگیری با کد رهگیری زنده، پرداخت با سفارشی که در صف یا در حال چاپ است. null یعنی برداشتنی نیست (کس دیگری برداشت، رفته،
   * کدش کنار رفت، یا سفارش گذشت).
   */
  claim(id: number, at: Date, mode: 'queued' | 'retry'): Promise<QueuedSms | null>;
  finish(id: number, at: Date, result: SmsResult): Promise<void>;
}

export interface Delivery {
  id: number;
  /** `skipped`: برداشته نشد. */
  outcome: 'sent' | 'failed' | 'skipped';
  error?: SmsErrorCode;
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
      result = {
        ok: true,
        provider: deps.transport.name,
        status: sent.status,
        providerMessageId: sent.providerMessageId,
        cost: sent.cost ?? null,
      };
    } catch (error) {
      result = { ok: false, provider: deps.transport.name, error: smsErrorCode(error) };
      // فقط علت و کدهای عددی؛ متن پاسخ و کلید هرگز (ADR-049).
      log(`✗ پیامک ${id} (${queued.purpose}) نرفت:`, describeSmsError(error));
    }
    try {
      await deps.outbox.finish(id, now(), result);
    } catch (error) {
      log(`✗ نتیجهٔ پیامک ${id} ثبت نشد:`, error);
    }
    return result.ok ? { id, outcome: 'sent' } : { id, outcome: 'failed', error: result.error };
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? 4, ids.length)) }, worker));
  return results;
}
