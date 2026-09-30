import { describe, expect, it } from 'vitest';

import {
  SMS_STUCK_MS,
  SmsError,
  consoleSms,
  deliverQueued,
  loggedSms,
  orderPaidText,
  otpText,
  resendable,
  smsState,
  trackingParams,
  trackingText,
  type QueuedSms,
  type SmsOutbox,
  type SmsRecord,
  type SmsResult,
  type SmsTransport,
} from './index';

const BARCODE = '118800000000000000000101';

describe('متن‌ها', () => {
  it('کد همان متن برش ۳؛ پرداخت متن کوتاه قالب ADR-049 (یک تکه)', () => {
    expect(otpText('12345')).toBe('کد تأیید جزوه‌یار: 12345\nاین کد را به کسی نده.');
    expect(orderPaidText(10001, 'دوشنبه 6 مهر')).toBe('جزوه‌یار: سفارش 10001 پرداخت شد؛ تحویل به پست تا دوشنبه 6 مهر');
  });

  it('رهگیری عیناً متن قالب ADR-049، فقط از دو پارامتر بی فاصله', () => {
    expect(trackingText(10027, BARCODE)).toBe('جزوه‌یار: سفارش 10027 به پست رسید. کد رهگیری 118800000000000000000101');
    expect(trackingParams(10027, BARCODE)).toEqual(['10027', BARCODE]);
    // متن جز همین دو پارامتر چیز متغیری ندارد: با پارامترهای دیگر فقط همان‌ها عوض می‌شوند.
    expect(trackingText(10028, '118811111111111111111111').replace('10028', '10027').replace('118811111111111111111111', BARCODE)).toBe(
      trackingText(10027, BARCODE),
    );
    for (const param of trackingParams(10027, BARCODE)) expect(param).not.toMatch(/\s/);
    // یک تکهٔ پیامک فارسی (۷۰ نویسه)، نه دو (متن ۶٫۳ نود نویسه بود).
    expect(trackingText(10027, BARCODE).length).toBeLessThanOrEqual(70);
  });

  it('بارکد نه ۲۴ رقم، یا با فاصله، متن نمی‌سازد', () => {
    expect(() => trackingText(10027, '1188 0000 0000 0000 0000 0101')).toThrow();
    expect(() => trackingText(10027, '1188')).toThrow();
    expect(() => trackingParams(-1, BARCODE)).toThrow();
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

  it('پنل واقعی: متن کد نمی‌ماند؛ شکست ردیف «failed» و پرتاب', async () => {
    const rows: SmsRecord[] = [];
    const ok: SmsTransport = { name: 'real', send: async () => ({ status: 'sent', providerMessageId: 'm1', cost: 1.05 }) };
    await loggedSms(ok, { insert: async (row) => void rows.push(row) }).send({ to: '09123456789', purpose: 'otp', text: 'x', params: ['80764'] });
    expect(rows[0]).toMatchObject({ body: null, status: 'sent', providerMessageId: 'm1', cost: 1.05 });
    // کد در هیچ ستونی نیست، پارامترش هم نه.
    expect(JSON.stringify(rows[0])).not.toContain('80764');
    const bad: SmsTransport = { name: 'real', send: async () => Promise.reject(new SmsError('rejected')) };
    await expect(loggedSms(bad, { insert: async (row) => void rows.push(row) }).send({ to: '09123456789', purpose: 'order_paid', text: 'y' })).rejects.toThrow();
    expect(rows[1]).toMatchObject({ status: 'failed', error: 'rejected', body: 'y' });
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
