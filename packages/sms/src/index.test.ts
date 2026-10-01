import { describe, expect, it } from 'vitest';

import {
  SMS_PARAM_MAX,
  SMS_STUCK_MS,
  SMS_TEMPLATES,
  SmsError,
  consoleSms,
  deliverQueued,
  loggedSms,
  orderPaidText,
  otpParams,
  otpText,
  paidParams,
  parseSmsErrorTag,
  resendable,
  smsErrorTag,
  smsSegments,
  smsState,
  templateSource,
  templateText,
  trackingParams,
  trackingText,
  type QueuedSms,
  type SmsOutbox,
  type SmsRecord,
  type SmsResult,
  type SmsTransport,
} from './index';

const BARCODE = '118800000000000000000101';

describe('متن‌ها: یک منبع برای کد و قالب‌های sms.ir (ADR-049)', () => {
  it('سه متن عیناً جدول ADR-049', () => {
    expect(otpText('12345')).toBe('کد تأیید جزوه‌یار: 12345\nاین کد را به کسی نده.');
    expect(orderPaidText(10001, 'دوشنبه 6 مهر')).toBe('جزوه‌یار: سفارش 10001 پرداخت شد؛ تحویل به پست تا دوشنبه 6 مهر');
    expect(trackingText(10027, BARCODE)).toBe('جزوه‌یار: سفارش 10027 به پست رسید. کد رهگیری 118800000000000000000101');
  });

  it('متن قالب برای پنل sms.ir با جای پارامترها؛ نام و ترتیب پارامترها ثابت', () => {
    expect(templateSource('otp')).toBe('کد تأیید جزوه‌یار: #CODE#\nاین کد را به کسی نده.');
    expect(templateSource('order_paid')).toBe('جزوه‌یار: سفارش #ORDER# پرداخت شد؛ تحویل به پست تا #DAY#');
    expect(templateSource('tracking')).toBe('جزوه‌یار: سفارش #ORDER# به پست رسید. کد رهگیری #BARCODE#');
    expect(Object.values(SMS_TEMPLATES).map((t) => [t.purpose, t.key, t.params])).toEqual([
      ['otp', 'SMS_OTP_TEMPLATE', ['CODE']],
      ['order_paid', 'SMS_PAID_TEMPLATE', ['ORDER', 'DAY']],
      ['tracking', 'SMS_TRACKING_TEMPLATE', ['ORDER', 'BARCODE']],
    ]);
    // متن جز پارامترها چیز متغیری ندارد: قالب با همان پارامترها همان متن است.
    expect(templateText('tracking', trackingParams(10027, BARCODE))).toBe(trackingText(10027, BARCODE));
    expect(templateText('order_paid', paidParams(10001, 'دوشنبه 6 مهر'))).toBe(orderPaidText(10001, 'دوشنبه 6 مهر'));
    expect(templateText('otp', otpParams('12345'))).toBe(otpText('12345'));
  });

  it('هر پیامک یک تکه، حتی با شمارهٔ شش رقمی و بلندترین روز تحویل', () => {
    const longest = 'چهارشنبه 16 اردیبهشت';
    const texts = [otpText('12345'), orderPaidText(999999, longest), trackingText(999999, BARCODE)];
    expect(texts.map((text) => [...text].length)).toEqual([46, 70, 70]);
    for (const text of texts) expect(smsSegments(text)).toBe(1);
    // شاهد: متن‌های برش ۶٫۳ دو تکه بودند.
    expect(smsSegments('جزوه‌یار: سفارش 10027 تحویل پست شد. کد رهگیری: 118800000000000000000101 (tracking.post.ir)')).toBe(2);
    expect(smsSegments('x'.repeat(70))).toBe(1);
    expect(smsSegments('x'.repeat(71))).toBe(2);
    expect(smsSegments('x'.repeat(134))).toBe(2);
    expect(smsSegments('x'.repeat(135))).toBe(3);
  });

  it('پارامتر نادرست متن نمی‌سازد: بارکد نه ۲۴ رقم، شمارهٔ منفی، روز خالی یا بلندتر از ۵۰ نویسه، کد نه رقم', () => {
    expect(() => trackingText(10027, '1188 0000 0000 0000 0000 0101')).toThrow();
    expect(() => trackingText(10027, '1188')).toThrow();
    expect(() => trackingParams(-1, BARCODE)).toThrow();
    expect(() => paidParams(10001, '')).toThrow();
    expect(() => paidParams(10001, 'x'.repeat(SMS_PARAM_MAX + 1))).toThrow();
    expect(paidParams(10001, 'x'.repeat(SMS_PARAM_MAX))[1]).toHaveLength(50);
    expect(() => paidParams(10001, 'دوشنبه\n6 مهر')).toThrow();
    expect(() => otpText('12a45')).toThrow();
    expect(() => templateText('tracking', ['10027'])).toThrow();
    for (const param of trackingParams(10027, BARCODE)) expect(param).not.toMatch(/\s/);
  });
});

describe('علت «نرفت»: فقط کد و عدد پاسخ', () => {
  it('برچسب و برگشتش', () => {
    expect(smsErrorTag(new SmsError('rejected', { http: 400, status: 12 }))).toBe('rejected:12');
    expect(smsErrorTag(new SmsError('rejected', { http: 401 }))).toBe('rejected:401');
    expect(smsErrorTag(new SmsError('unconfigured'))).toBe('unconfigured');
    expect(smsErrorTag(new Error('کلید: secret-value'))).toBe('unavailable');
    expect(parseSmsErrorTag('rejected:401')).toEqual({ code: 'rejected', number: 401 });
    expect(parseSmsErrorTag('unconfigured')).toEqual({ code: 'unconfigured', number: null });
    expect(parseSmsErrorTag('rejected')).toEqual({ code: 'rejected', number: null });
    expect(parseSmsErrorTag('چیز دیگر')).toEqual({ code: 'unavailable', number: null });
    expect(parseSmsErrorTag(null)).toEqual({ code: 'unavailable', number: null });
    expect(new SmsError('rejected', { http: 401 }).message).toBe('rejected');
  });
});

describe('پیامک کد و پرداخت (`loggedSms`)', () => {
  it('کنسولی: ردیف با متن کامل و «logged»، و یک خط لاگ', async () => {
    const rows: SmsRecord[] = [];
    const lines: string[] = [];
    await consoleSms({ insert: async (row) => void rows.push(row) }, (line) => lines.push(line)).send({
      to: '09123456789',
      purpose: 'otp',
      text: otpText('12345'),
    });
    expect(rows).toEqual([
      { provider: 'console', toMobile: '09123456789', purpose: 'otp', body: otpText('12345'), status: 'logged', providerMessageId: null, cost: null },
    ]);
    expect(lines).toEqual(['✉ پیامک کنسولی به 09123456789 (otp): کد تأیید جزوه‌یار: 12345 ⏎ این کد را به کسی نده.']);
  });

  it('پنل واقعی: متن کد نمی‌ماند، هزینه می‌ماند؛ شکست ردیف «failed» با برچسب علت و پرتاب', async () => {
    const rows: SmsRecord[] = [];
    const ok: SmsTransport = { name: 'real', send: async () => ({ status: 'sent', providerMessageId: 'm1', cost: 1.5 }) };
    await loggedSms(ok, { insert: async (row) => void rows.push(row) }).send({ to: '09123456789', purpose: 'otp', text: 'x', params: ['12345'] });
    expect(rows[0]).toMatchObject({ body: null, status: 'sent', providerMessageId: 'm1', cost: 1.5 });
    const bad: SmsTransport = { name: 'real', send: async () => Promise.reject(new SmsError('rejected', { http: 400, status: 12 })) };
    await expect(loggedSms(bad, { insert: async (row) => void rows.push(row) }).send({ to: '09123456789', purpose: 'order_paid', text: 'y' })).rejects.toThrow();
    expect(rows[1]).toMatchObject({ status: 'failed', error: 'rejected:12', body: 'y' });
    await expect(loggedSms(bad, { insert: async (row) => void rows.push(row) }).send({ to: '09123456789', purpose: 'otp', text: 'z' })).rejects.toThrow();
    expect(rows[2]).toMatchObject({ status: 'failed', body: null });
  });
});

describe('حال پیامک رهگیری', () => {
  const at = new Date('2026-10-05T08:00:00Z');
  const ago = (ms: number) => new Date(at.getTime() - ms);

  it('رفت، در راه، نرفت، معلوم نیست؛ مرز ۵ دقیقه', () => {
    expect(smsState({ status: 'logged', createdAt: ago(0), attemptedAt: null }, at)).toBe('sent');
    expect(smsState({ status: 'sent', createdAt: ago(0), attemptedAt: null }, at)).toBe('sent');
    expect(smsState({ status: 'failed', createdAt: ago(0), attemptedAt: ago(0) }, at)).toBe('failed');
    expect(smsState({ status: 'pending', createdAt: ago(SMS_STUCK_MS), attemptedAt: null }, at)).toBe('sending');
    expect(smsState({ status: 'pending', createdAt: ago(SMS_STUCK_MS + 1), attemptedAt: null }, at)).toBe('failed');
    expect(smsState({ status: 'sending', createdAt: ago(SMS_STUCK_MS * 3), attemptedAt: ago(SMS_STUCK_MS) }, at)).toBe('sending');
    expect(smsState({ status: 'sending', createdAt: ago(SMS_STUCK_MS * 3), attemptedAt: ago(SMS_STUCK_MS + 1) }, at)).toBe('unknown');
    expect(SMS_STUCK_MS).toBe(300_000);
    expect(['sent', 'sending', 'failed', 'unknown'].filter((s) => resendable(s as never))).toEqual(['failed', 'unknown']);
  });
});

/** درگاه حافظه‌ای: «در حال فرستادن» فقط یک بار، مثل پایگاه داده. */
function memoryOutbox(rows: Map<number, { status: string; body: string }>) {
  const finished: [number, SmsResult][] = [];
  const outbox: SmsOutbox = {
    async claim(id, _at, mode) {
      const row = rows.get(id);
      if (!row) return null;
      if (mode === 'queued' ? row.status !== 'pending' : row.status !== 'failed') return null;
      row.status = 'sending';
      const queued: QueuedSms = { id, to: '09123456789', purpose: 'tracking', body: row.body, params: ['10027', BARCODE] };
      return queued;
    },
    async finish(id, _at, result) {
      finished.push([id, result]);
      rows.get(id)!.status = result.ok ? result.status : 'failed';
    },
  };
  return { outbox, finished };
}

describe('فرستادن ردیف‌های منتظر', () => {
  it('هر ردیف یک بار؛ شکست یکی بقیه را نگه نمی‌دارد؛ پارامترها به آداپتور می‌رسند', async () => {
    const rows = new Map([
      [1, { status: 'pending', body: 'a' }],
      [2, { status: 'pending', body: 'b' }],
      [3, { status: 'logged', body: 'c' }],
    ]);
    const { outbox, finished } = memoryOutbox(rows);
    const seen: string[] = [];
    const transport: SmsTransport = {
      name: 'console',
      async send(message) {
        seen.push(`${message.text}:${message.params?.join(',')}`);
        if (message.text === 'b') throw new SmsError('unavailable');
        return { status: 'logged', providerMessageId: null };
      },
    };
    const out = await deliverQueued({ outbox, transport, log: () => {} }, [1, 2, 3, 1]);
    expect(out.map((d) => d.outcome)).toEqual(['sent', 'failed', 'skipped', 'skipped']);
    expect(out[1]!.error).toBe('unavailable');
    expect(seen).toEqual([`a:10027,${BARCODE}`, `b:10027,${BARCODE}`]);
    expect(finished.map(([id, r]) => [id, r.ok])).toEqual([
      [1, true],
      [2, false],
    ]);
    // «دوباره بفرست» فقط نرفته را برمی‌دارد.
    const again = await deliverQueued({ outbox, transport: { name: 'console', send: async () => ({ status: 'logged', providerMessageId: null }) } }, [1, 2], { mode: 'retry' });
    expect(again.map((d) => d.outcome)).toEqual(['skipped', 'sent']);
  });

  it('هم‌زمانی محدود', async () => {
    const rows = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, { status: 'pending', body: String(i) }] as const));
    const { outbox } = memoryOutbox(new Map(rows));
    let live = 0;
    let peak = 0;
    const transport: SmsTransport = {
      name: 'console',
      async send() {
        live++;
        peak = Math.max(peak, live);
        await new Promise((resolve) => setTimeout(resolve, 5));
        live--;
        return { status: 'logged', providerMessageId: null };
      },
    };
    await deliverQueued({ outbox, transport }, [...rows.keys()], { concurrency: 4 });
    expect(peak).toBe(4);
  });
});
