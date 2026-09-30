/**
 * پیامک sms.ir در پنل (`sms.ts`، برش ۷٫۱) با ذخیره‌گاه و ساعت ساختگی: اعتبار حداکثر هر ۱۵ دقیقه یک بار و فقط با پیامک واقعی، پیشخوان
 * منتظر sms.ir نمی‌ماند، و کارت‌ها و هشدارها با مجوز در سرور. شمردن `otp_requests` روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it } from 'vitest';

import type { SmsStatsStore } from '@jozveyar/db';
import { SmsError } from '@jozveyar/sms';

import type { AdminSession } from './auth';
import { CREDIT_TTL_MS, USAGE_WINDOW_MS, createCreditReader, createPanelSms, type CreditReader, type CreditState } from './sms';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
/** آغاز همان روز به وقت تهران. */
const DAY_START = new Date('2026-10-04T20:30:00Z');

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

/** خوانندهٔ اعتبار با sms.ir ساختگی: هر خواندن شمرده می‌شود و تا `release` منتظر می‌ماند اگر `hold` باشد. */
function reader(options: { enabled?: boolean; answers?: (number | Error)[]; hold?: boolean } = {}) {
  const clock = { now: NOW };
  const answers = [...(options.answers ?? [165.3])];
  const logs: string[] = [];
  let reads = 0;
  let release: () => void = () => {};
  const credit = createCreditReader({
    enabled: options.enabled ?? true,
    read: async () => {
      reads++;
      if (options.hold) await new Promise<void>((resolve) => (release = resolve));
      const answer = answers.length > 1 ? answers.shift()! : answers[0]!;
      if (answer instanceof Error) throw answer;
      return answer;
    },
    now: () => clock.now,
    log: (message) => logs.push(message),
  });
  return { credit, clock, logs, reads: () => reads, release: () => release() };
}

describe('اعتبار پیامک', () => {
  it('پیامک کنسولی: «خاموش»، و هیچ درخواستی به sms.ir', async () => {
    const off = reader({ enabled: false });
    expect(await off.credit.current({ wait: true })).toEqual({ kind: 'off' });
    expect(await off.credit.current({ wait: false })).toEqual({ kind: 'off' });
    expect(off.reads()).toBe(0);
  });

  it('حداکثر هر ۱۵ دقیقه یک بار (سؤال ۱۴۰): تا مرز همان خوانده، در مرز دوباره', async () => {
    const { credit, clock, reads } = reader({ answers: [165.3, 90] });
    expect(CREDIT_TTL_MS).toBe(15 * 60_000);
    expect(await credit.current({ wait: true })).toEqual({ kind: 'ok', credit: 165.3, at: NOW });
    clock.now = new Date(NOW.getTime() + CREDIT_TTL_MS - 1);
    expect(await credit.current({ wait: true })).toEqual({ kind: 'ok', credit: 165.3, at: NOW });
    expect(reads()).toBe(1);
    clock.now = new Date(NOW.getTime() + CREDIT_TTL_MS);
    expect(await credit.current({ wait: true })).toEqual({ kind: 'ok', credit: 90, at: clock.now });
    expect(reads()).toBe(2);
  });

  it('پیشخوان منتظر نمی‌ماند: آخرین خوانده (یا «نامعلوم»)، و خواندن تازه در پس‌زمینه؛ دو خواندن هم‌زمان یک درخواست', async () => {
    const { credit, reads, release } = reader({ hold: true });
    expect(await credit.current({ wait: false })).toEqual({ kind: 'unknown' });
    expect(reads()).toBe(1);
    // «تنظیمات» منتظر همان خواندن در راه می‌ماند، نه درخواست دوم.
    const waiting = credit.current({ wait: true });
    expect(await credit.current({ wait: false })).toEqual({ kind: 'unknown' });
    expect(reads()).toBe(1);
    release();
    expect(await waiting).toEqual({ kind: 'ok', credit: 165.3, at: NOW });
    expect(await credit.current({ wait: false })).toEqual({ kind: 'ok', credit: 165.3, at: NOW });
    expect(reads()).toBe(1);
  });

  it('خطا با علتش و کد HTTP، همان ۱۵ دقیقه نگه داشته (نه کوبیدن sms.ir)؛ لاگ فقط علت', async () => {
    const { credit, clock, reads, logs } = reader({ answers: [new SmsError('rejected', 'sms.ir: HTTP 401 key-like-text', 401, 0), 70] });
    expect(await credit.current({ wait: true })).toEqual({ kind: 'error', code: 'rejected', http: 401, at: NOW });
    expect(await credit.current({ wait: true })).toMatchObject({ kind: 'error' });
    expect(reads()).toBe(1);
    expect(logs).toEqual(['✗ اعتبار sms.ir خوانده نشد: rejected']);
    clock.now = new Date(NOW.getTime() + CREDIT_TTL_MS);
    expect(await credit.current({ wait: true })).toMatchObject({ kind: 'ok', credit: 70 });
    // خطای ناشناس «در دسترس نیست»؛ بی کلید API «خالی».
    const odd = reader({ answers: [new TypeError('fetch failed')] });
    expect(await odd.credit.current({ wait: true })).toEqual({ kind: 'error', code: 'unavailable', http: null, at: NOW });
    const unconfigured = reader({ answers: [new SmsError('unconfigured')] });
    expect(await unconfigured.credit.current({ wait: true })).toMatchObject({ kind: 'error', code: 'unconfigured' });
  });
});

describe('کارت‌ها و هشدارهای پیامک', () => {
  function panelSms(options: { credit?: CreditState; settings?: Record<string, unknown>; hits?: { hourly: Date | null; daily: Date | null } } = {}) {
    const calls: { method: string; args: unknown[] }[] = [];
    const waits: boolean[] = [];
    const stats: SmsStatsStore = {
      async otpUsage(...args) {
        calls.push({ method: 'otpUsage', args });
        return { hour: 41, today: 1_874 };
      },
      async otpCapHits(...args) {
        calls.push({ method: 'otpCapHits', args });
        return options.hits ?? { hourly: null, daily: null };
      },
      async usage(...args) {
        calls.push({ method: 'usage', args });
        return { messages: 312, cost: 343.2 };
      },
    };
    const credit: CreditReader = {
      async current({ wait }) {
        waits.push(wait);
        return options.credit ?? { kind: 'ok', credit: 165.3, at: NOW };
      },
    };
    const values: Record<string, unknown> = { 'otp.site_hourly_limit': 300, 'otp.site_daily_limit': 2_000, 'sms.credit_alert': 200, ...options.settings };
    const sms = createPanelSms({ stats, setting: async (key) => values[key], credit, provider: 'smsir', now: () => NOW, log: () => {} });
    return { sms, calls, waits };
  }

  it('«تنظیمات» فقط مالک (`settings.edit`)؛ سقف‌ها از تنظیم، کدهای این ساعت و امروز تهران، و مصرف ۷ روز sms.ir', async () => {
    const denied = panelSms();
    expect(await denied.sms.overview(session(['orders.read', 'orders.money']))).toEqual({ ok: false, status: 403, error: 'forbidden' });
    expect(denied.calls).toEqual([]);
    expect(denied.waits).toEqual([]);

    const { sms, calls, waits } = panelSms();
    expect(await sms.overview(session(['settings.edit']))).toEqual({
      ok: true,
      value: {
        provider: 'smsir',
        otp: { hourly: 300, daily: 2_000, hour: 41, today: 1_874 },
        credit: { kind: 'ok', credit: 165.3, at: NOW },
        alert: 200,
        usage: { messages: 312, cost: 343.2 },
      },
    });
    expect(calls).toEqual([
      { method: 'otpUsage', args: [NOW, DAY_START] },
      { method: 'usage', args: [new Date(NOW.getTime() - USAGE_WINDOW_MS), 'smsir'] },
    ]);
    expect(USAGE_WINDOW_MS).toBe(7 * 86_400_000);
    // «تنظیمات» منتظر اعتبار تازه می‌ماند.
    expect(waits).toEqual([true]);
  });

  it('پیشخوان: فقط مالک و متصدی (`orders.money`)، بی منتظر ماندن؛ سقف پرشدهٔ امروز با لحظه‌اش، و اعتبار زیر آستانه', async () => {
    const partner = panelSms();
    expect(await partner.sms.alerts(session(['orders.read', 'orders.status', 'files.download']))).toEqual({ daily: null, hourly: null, credit: null });
    expect(partner.calls).toEqual([]);

    const dailyAt = new Date('2026-10-05T06:12:00Z');
    const hourlyAt = new Date('2026-10-05T05:40:00Z');
    const { sms, calls, waits } = panelSms({ hits: { hourly: hourlyAt, daily: dailyAt }, credit: { kind: 'ok', credit: 150, at: NOW } });
    expect(await sms.alerts(session(['orders.read', 'orders.money']))).toEqual({
      daily: { limit: 2_000, at: dailyAt },
      hourly: { limit: 300, at: hourlyAt },
      credit: { credit: 150, threshold: 200 },
    });
    expect(calls).toEqual([{ method: 'otpCapHits', args: [DAY_START, { hourly: 300, daily: 2_000 }] }]);
    expect(waits).toEqual([false]);
  });

  it('اعتبار: درست روی آستانه هشدار نیست؛ آستانهٔ صفر خاموش؛ خطا، نامعلوم یا کنسولی هیچ', async () => {
    const alertOf = async (credit: CreditState, settings: Record<string, unknown> = {}) =>
      (await panelSms({ credit, settings }).sms.alerts(session(['orders.money']))).credit;
    expect(await alertOf({ kind: 'ok', credit: 200, at: NOW })).toBeNull();
    expect(await alertOf({ kind: 'ok', credit: 199.9, at: NOW })).toEqual({ credit: 199.9, threshold: 200 });
    expect(await alertOf({ kind: 'ok', credit: 5, at: NOW }, { 'sms.credit_alert': 0 })).toBeNull();
    // صفر یعنی هشدار نه، هر چه sms.ir بگوید.
    expect(await alertOf({ kind: 'ok', credit: -3, at: NOW }, { 'sms.credit_alert': 0 })).toBeNull();
    expect(await alertOf({ kind: 'error', code: 'unavailable', http: null, at: NOW })).toBeNull();
    expect(await alertOf({ kind: 'unknown' })).toBeNull();
    expect(await alertOf({ kind: 'off' })).toBeNull();
  });
});
