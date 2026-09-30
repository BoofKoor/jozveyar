/**
 * کد پیامکی و نشست (ADR-033) با پایگاه دادهٔ حافظه‌ای و ساعت ساختگی.
 *
 * هر محافظ جدا سنجیده می‌شود: شکل کد، اعتبار ۲ دقیقه، ۳ فرصت، ارسال دوباره پس از ۹۰ ثانیه، سقف هر
 * شماره و هر IP و کل سایت، «فقط همان مرورگر»، و اینکه کد و IP هیچ‌جا خام نمی‌نشینند. از برش ۷ (ADR-049): دروازهٔ جزوه،
 * سقف هر مرورگر، سقف ۲۴ ساعتهٔ هر شماره و کل سایت، و پارامتر قالب کد.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { consoleSms, type SmsMessage, type SmsProvider } from '@jozveyar/sms';

import { createAuthService, tokenHash } from './auth';
import { memoryAuthStore, memorySmsLog } from './testing';

const SECRET = 'k'.repeat(64);
const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const MOBILE = '09121234567';
/**
 * عددهای تصمیم ۱۴۰۵/۰۷/۰۴ (ADR-033)، صریح و نه از ثابت‌های کد: تست باید با عوض شدن هر کدام بشکند.
 */
const TWO_MINUTES = 2 * 60_000;
const RESEND = 90_000;
const HOUR = 60 * 60_000;
const PER_MOBILE = 5;
const PER_IP = 20;
const THIRTY_DAYS = 30 * 24 * HOUR;
/** برش ۷ (ADR-049، سؤال ۱۱۷): هر مرورگر ۵ در ساعت، هر شماره ۱۰ در ۲۴ ساعت، کل سایت ۲٬۰۰۰ در ۲۴ ساعت (پیش‌فرض). */
const PER_BROWSER = 5;
const PER_MOBILE_DAY = 10;
const DAY = 24 * HOUR;
/** نشست ناشناس شمارهٔ `i`، تا سقف هر مرورگر در تست‌هایی که چیز دیگری را می‌سنجند پر نشود. */
const browser = (i: number) => i.toString(16).padStart(64, 'c');

describe('کد پیامکی و نشست', () => {
  let clock: Date;
  let store: ReturnType<typeof memoryAuthStore>;
  let sms: ReturnType<typeof memorySmsLog>;
  let siteLimit: number;
  let siteDayLimit: number;
  let ready: boolean;
  let readyAsked: { session: string; until: Date }[];
  let codes: string[];
  let service: ReturnType<typeof createAuthService>;
  const logs: string[] = [];

  function build(provider?: SmsProvider) {
    service = createAuthService({
      store,
      sms: provider ?? consoleSms(sms, () => undefined),
      secret: SECRET,
      siteHourlyLimit: async () => siteLimit,
      siteDailyLimit: async () => siteDayLimit,
      now: () => clock,
      log: (message) => logs.push(message),
      newCode: () => codes.shift() ?? '11111',
    });
  }

  beforeEach(() => {
    clock = new Date('2026-09-26T08:00:00Z');
    ready = true;
    readyAsked = [];
    store = memoryAuthStore({
      ready: (session, until) => {
        readyAsked.push({ session, until });
        return ready;
      },
    });
    sms = memorySmsLog();
    siteLimit = 300;
    siteDayLimit = 2000;
    codes = [];
    logs.length = 0;
    build();
  });

  const later = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };

  async function sendCode(code: string, over: { mobile?: string; session?: string; ip?: string } = {}) {
    codes.push(code);
    return service.requestCode(over.session ?? ME, over.ip ?? '5.6.7.8', { mobile: over.mobile ?? MOBILE });
  }

  it('کد ۵ رقمی به شمارهٔ نرمال‌شده پیامک می‌شود؛ در پاسخ نیست و در پایگاه داده فقط هشش', async () => {
    codes.push('04821');
    const result = await service.requestCode(ME, '5.6.7.8', { mobile: '+98 912 ۱۲۳ ۴۵۶۷' });
    expect(result).toEqual({ ok: true, value: { mobile: MOBILE, expiresInSeconds: 120, resendInSeconds: 90 } });
    expect(JSON.stringify(result)).not.toContain('04821');
    expect(sms.messages).toEqual([
      expect.objectContaining({ provider: 'console', toMobile: MOBILE, purpose: 'otp', status: 'logged' }),
    ]);
    expect(sms.messages[0]!.body).toContain('04821');

    const [row] = store.otps;
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.codeHash).not.toContain('04821');
    // IP هم HMAC است، نه خام و نه SHA-256 بی‌کلید (که با شمردن فضای IPv4 برمی‌گشت).
    expect(row!.ipHash).not.toContain('5.6.7.8');
    expect(row!.ipHash).not.toBe(tokenHash('5.6.7.8'));
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(TWO_MINUTES);
  });

  it('کد تصادفی واقعی همیشه ۵ رقم است، با صفر اول هم', async () => {
    const real = createAuthService({
      store,
      sms: consoleSms(sms, () => undefined),
      secret: SECRET,
      siteHourlyLimit: async () => 1e5,
      siteDailyLimit: async () => 1e5,
    });
    for (let i = 0; i < 40; i += 1) {
      expect((await real.requestCode(browser(i), `10.0.0.${i}`, { mobile: `0912000${String(i).padStart(4, '0')}` })).ok).toBe(true);
    }
    expect(sms.messages).toHaveLength(40);
    for (const message of sms.messages) expect(message.body).toMatch(/: \d{5}\n/);
  });

  it('شمارهٔ نامعتبر و بدنهٔ نامعتبر رد می‌شوند', async () => {
    expect(await service.requestCode(ME, 'ip', { mobile: '0212345678' })).toMatchObject({ status: 400, error: 'invalid_mobile' });
    expect(await service.requestCode(ME, 'ip', { phone: MOBILE })).toMatchObject({ status: 400, error: 'invalid_request' });
    expect(sms.messages).toHaveLength(0);
  });

  it('ارسال دوباره فقط پس از ۹۰ ثانیه، با شمارش معکوس', async () => {
    expect((await sendCode('11111')).ok).toBe(true);
    later(30_000);
    expect(await sendCode('22222')).toMatchObject({ status: 429, error: 'resend_too_soon', retryAfterSeconds: 60 });
    // از مرورگر یا IP دیگر هم نه: یک شماره را نمی‌شود بمباران کرد.
    expect(await sendCode('22222', { session: OTHER, ip: '9.9.9.9' })).toMatchObject({ error: 'resend_too_soon' });
    later(RESEND - 30_000 - 1);
    expect(await sendCode('33333')).toMatchObject({ error: 'resend_too_soon', retryAfterSeconds: 1 });
    later(1);
    expect((await sendCode('33333')).ok).toBe(true);
  });

  it('سقف ۵ کد در ساعت برای هر شماره', async () => {
    // هر بار از مرورگری دیگر، تا سقف مرورگر (برش ۷) زودتر نرسد: همان شماره از هر جا.
    for (let i = 0; i < PER_MOBILE; i += 1) {
      expect((await sendCode(`1000${i}`, { session: browser(i) })).ok).toBe(true);
      later(RESEND);
    }
    const refused = await sendCode('99999', { session: browser(9) });
    expect(refused).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'mobile' });
    // قدیمی‌ترین کد ۴۵۰ ثانیه پیش بود؛ ساعتش تمام شود، جا باز می‌شود.
    expect(refused).toMatchObject({ retryAfterSeconds: (HOUR - PER_MOBILE * RESEND) / 1000 });
    // شمارهٔ دیگر گیر نمی‌افتد.
    expect((await sendCode('88888', { mobile: '09351234567' })).ok).toBe(true);
    later(HOUR - PER_MOBILE * RESEND);
    expect((await sendCode('77777', { session: browser(10) })).ok).toBe(true);
  });

  it('سقف ۲۰ کد در ساعت برای هر IP، روی شماره‌ها و مرورگرهای مختلف', async () => {
    for (let i = 0; i < PER_IP; i += 1) {
      expect((await sendCode('12345', { mobile: `091200000${String(i).padStart(2, '0')}`, session: browser(i) })).ok).toBe(true);
    }
    expect(await sendCode('12345', { mobile: '09129999999', session: browser(99) })).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'ip' });
    expect((await sendCode('12345', { mobile: '09129999999', session: browser(99), ip: '1.1.1.1' })).ok).toBe(true);
  });

  it('دروازهٔ جزوه (برش ۷): مرورگری که جزوهٔ آماده و زنده روی سرور ندارد کد نمی‌گیرد؛ نه پیامک، نه ردیف', async () => {
    ready = false;
    expect(await sendCode('48213')).toEqual({ ok: false, status: 409, error: 'otp_no_documents' });
    expect(sms.messages).toEqual([]);
    expect(store.otps).toEqual([]);
    // «زنده» یعنی دست‌کم یک ساعت دیگر، همان حاشیهٔ پرداخت؛ پرسش برای همین مرورگر است.
    expect(readyAsked).toEqual([{ session: ME, until: new Date(clock.getTime() + HOUR) }]);
    // شاهد: همان درخواست با جزوهٔ روی سرور.
    ready = true;
    expect((await sendCode('48213')).ok).toBe(true);
  });

  it('سقف ۵ کد در ساعت برای هر مرورگر (برش ۷)، روی شماره‌ها و IPهای مختلف', async () => {
    for (let i = 0; i < PER_BROWSER; i += 1) {
      expect((await sendCode('12345', { mobile: `091211111${String(i).padStart(2, '0')}`, ip: `10.1.1.${i}` })).ok).toBe(true);
      later(60_000);
    }
    const refused = await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9' });
    expect(refused).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'browser', retryAfterSeconds: (HOUR - PER_BROWSER * 60_000) / 1000 });
    // مرورگر دیگر گیر نمی‌افتد (شاهد).
    expect((await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9', session: OTHER })).ok).toBe(true);
  });

  it('سقف ۱۰ کد در ۲۴ ساعت برای هر شماره (برش ۷)، پنجرهٔ لغزان', async () => {
    let n = 0;
    const send = () => sendCode('12345', { session: browser(n), ip: `10.2.2.${n++}` });
    for (let hour = 0; hour < 2; hour += 1) {
      for (let i = 0; i < PER_MOBILE; i += 1) {
        expect((await send()).ok).toBe(true);
        later(RESEND);
      }
      later(HOUR);
    }
    const refused = await send();
    expect(refused).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'mobile_day' });
    // قدیمی‌ترین کد ۲۴ ساعت بعدش از پنجره بیرون می‌رود، نه نیمه‌شب.
    const waited = (refused as unknown as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(waited).toBe((DAY - 2 * (PER_MOBILE * RESEND + HOUR)) / 1000);
    later(waited * 1000);
    expect((await send()).ok).toBe(true);
  });

  it('سقف ۲۴ ساعتهٔ کل سایت (برش ۷)، از تنظیم، با لاگ', async () => {
    siteDayLimit = 4;
    for (let i = 0; i < 4; i += 1) {
      expect((await sendCode('12345', { mobile: `0912000000${i}`, ip: `10.3.0.${i}`, session: browser(i) })).ok).toBe(true);
      later(HOUR);
    }
    expect(await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9', session: OTHER })).toMatchObject({
      status: 429,
      error: 'too_many_codes',
      scope: 'site_day',
      retryAfterSeconds: (DAY - 4 * HOUR) / 1000,
    });
    expect(logs.some((line) => line.includes('۲۴ ساعتهٔ') && line.includes('کل سایت'))).toBe(true);
  });

  it('پیامک کد با پارامتر قالب (برش ۷): آداپتور sms.ir فقط همین را می‌فرستد', async () => {
    const seen: SmsMessage[] = [];
    build({ name: 'capture', send: async (message) => void seen.push(message) });
    await sendCode('04821');
    expect(seen).toEqual([{ to: MOBILE, purpose: 'otp', text: 'کد تأیید جزوه‌یار: 04821\nاین کد را به کسی نده.', params: ['04821'] }]);
  });

  it('سقف ساعتی کل سایت، از تنظیم', async () => {
    siteLimit = 3;
    for (let i = 0; i < 3; i += 1) {
      expect((await sendCode('12345', { mobile: `0912000000${i}`, ip: `10.0.0.${i}`, session: browser(i) })).ok).toBe(true);
    }
    expect(await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9', session: OTHER })).toMatchObject({
      status: 429,
      error: 'too_many_codes',
      scope: 'site',
    });
    expect(logs.some((line) => line.includes('کل سایت'))).toBe(true);
  });

  it('کد درست: نشست ۳۰ روزه با توکن تازه؛ فقط هش توکن ذخیره می‌شود', async () => {
    await sendCode('48213');
    const result = await service.verifyCode(ME, { mobile: '0912 123 4567', code: '۴۸۲۱۳' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mobile).toBe(MOBILE);
    expect(result.value.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.value.expiresAt.getTime() - clock.getTime()).toBe(THIRTY_DAYS);
    expect(store.sessions.has(result.value.token)).toBe(false);
    expect(store.sessions.has(tokenHash(result.value.token))).toBe(true);
    expect(await service.authenticate(result.value.token)).toMatchObject({ mobile: MOBILE });
    // کد مصرف شد: بار دوم پذیرفته نمی‌شود.
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '48213' })).toMatchObject({ status: 404, error: 'no_code' });
  });

  it('سه فرصت؛ بعدش حتی کد درست هم پذیرفته نمی‌شود', async () => {
    await sendCode('48213');
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '11111' })).toMatchObject({ error: 'wrong_code', attemptsLeft: 2 });
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '22222' })).toMatchObject({ error: 'wrong_code', attemptsLeft: 1 });
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '33333' })).toMatchObject({ error: 'wrong_code', attemptsLeft: 0 });
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '48213' })).toMatchObject({ status: 410, error: 'code_locked' });
  });

  it('کد بعد از ۲ دقیقه منقضی است', async () => {
    await sendCode('48213');
    later(TWO_MINUTES - 1);
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '11111' })).toMatchObject({ error: 'wrong_code' });
    later(1);
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '48213' })).toMatchObject({ status: 410, error: 'code_expired' });
  });

  it('کد فقط در همان مرورگری که خواستش، و فقط برای همان شماره', async () => {
    await sendCode('48213');
    expect(await service.verifyCode(OTHER, { mobile: MOBILE, code: '48213' })).toMatchObject({ status: 404, error: 'no_code' });
    expect(await service.verifyCode(ME, { mobile: '09351234567', code: '48213' })).toMatchObject({ error: 'no_code' });
    // و بعد از آن تلاش‌ها، همچنان در مرورگر خودش کار می‌کند.
    expect((await service.verifyCode(ME, { mobile: MOBILE, code: '48213' })).ok).toBe(true);
  });

  it('کد تازه کد قبلی را کنار می‌گذارد', async () => {
    await sendCode('11111');
    later(RESEND);
    await sendCode('22222');
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '11111' })).toMatchObject({ error: 'wrong_code' });
    expect((await service.verifyCode(ME, { mobile: MOBILE, code: '22222' })).ok).toBe(true);
  });

  it('کد با شکل نادرست فرصتی نمی‌سوزاند', async () => {
    await sendCode('48213');
    expect(await service.verifyCode(ME, { mobile: MOBILE, code: '123' })).toMatchObject({ status: 400, error: 'invalid_code' });
    expect(store.otps[0]!.attempts).toBe(0);
  });

  it('«عوض کن»: نشست باطل می‌شود و دیگر زنده نمی‌شود', async () => {
    await sendCode('48213');
    const result = await service.verifyCode(ME, { mobile: MOBILE, code: '48213' });
    if (!result.ok) throw new Error(result.error);
    await service.logout(result.value.token);
    expect(await service.authenticate(result.value.token)).toBeNull();
    expect(await service.authenticate(null)).toBeNull();
  });

  it('نشست بعد از ۳۰ روز تمام است', async () => {
    await sendCode('48213');
    const result = await service.verifyCode(ME, { mobile: MOBILE, code: '48213' });
    if (!result.ok) throw new Error(result.error);
    later(THIRTY_DAYS - 1);
    expect(await service.authenticate(result.value.token)).not.toBeNull();
    later(1);
    expect(await service.authenticate(result.value.token)).toBeNull();
  });

  it('پیامکی که نرفت: ۵۰۳ روشن، و کد در سقف شمرده می‌ماند', async () => {
    build({ name: 'broken', send: async () => Promise.reject(new Error('panel down')) });
    expect(await sendCode('48213')).toMatchObject({ status: 503, error: 'sms_unavailable' });
    expect(store.otps).toHaveLength(1);
    expect(await sendCode('48213')).toMatchObject({ error: 'resend_too_soon' });
  });

  it('کلید دیگر، هش دیگر: کد یک سرور در سرور دیگر پذیرفته نمی‌شود', async () => {
    await sendCode('48213');
    const other = createAuthService({
      store,
      sms: consoleSms(sms, () => undefined),
      secret: 'z'.repeat(64),
      siteHourlyLimit: async () => 300,
      siteDailyLimit: async () => 2000,
      now: () => clock,
    });
    expect(await other.verifyCode(ME, { mobile: MOBILE, code: '48213' })).toMatchObject({ error: 'wrong_code' });
  });
});
