/**
 * کد پیامکی و نشست (ADR-033) با پایگاه دادهٔ حافظه‌ای و ساعت ساختگی.
 *
 * هر محافظ جدا سنجیده می‌شود: شکل کد، اعتبار ۲ دقیقه، ۳ فرصت، ارسال دوباره پس از ۹۰ ثانیه، سقف هر
 * شماره و هر IP و کل سایت، «فقط همان مرورگر»، و اینکه کد و IP هیچ‌جا خام نمی‌نشینند؛ از ۷٫۱ (ADR-049) دروازهٔ جزوه، سقف هر
 * مرورگر، هر شماره در ۲۴ ساعت و کل سایت در روز تهران، و کد فقط به شکل پارامتر قالب.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { SmsError, consoleSms, otpText, type SmsMessage, type SmsProvider } from '@jozveyar/sms';

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
/** لایه‌های ۷٫۱ (سؤال ۱۱۷). */
const PER_BROWSER = 5;
const PER_MOBILE_DAY = 10;

describe('کد پیامکی و نشست', () => {
  let clock: Date;
  let store: ReturnType<typeof memoryAuthStore>;
  let sms: ReturnType<typeof memorySmsLog>;
  let siteLimit: number;
  let siteDaily: number;
  let codes: string[];
  let service: ReturnType<typeof createAuthService>;
  const logs: string[] = [];

  function build(provider?: SmsProvider) {
    service = createAuthService({
      store,
      sms: provider ?? consoleSms(sms, () => undefined),
      secret: SECRET,
      siteHourlyLimit: async () => siteLimit,
      siteDailyLimit: async () => siteDaily,
      now: () => clock,
      log: (message, error) => logs.push(error === undefined ? message : `${message} ${String(error)}`),
      newCode: () => codes.shift() ?? '11111',
    });
  }

  beforeEach(() => {
    clock = new Date('2026-09-26T08:00:00Z');
    store = memoryAuthStore();
    sms = memorySmsLog();
    siteLimit = 300;
    siteDaily = 2000;
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
      // هر کد از مرورگر خودش: سقف هر مرورگر (۷٫۱) اینجا موضوع نیست.
      expect((await real.requestCode(`${i}`.padStart(64, 'c'), `10.0.0.${i}`, { mobile: `0912000${String(i).padStart(4, '0')}` })).ok).toBe(true);
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
    // هر کد از مرورگری دیگر: سقف هر مرورگر (۷٫۱) جدا سنجیده می‌شود.
    for (let i = 0; i < PER_MOBILE; i += 1) {
      expect((await sendCode(`1000${i}`, { session: `${i}`.padStart(64, 'c') })).ok).toBe(true);
      later(RESEND);
    }
    const refused = await sendCode('99999', { session: OTHER });
    expect(refused).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'mobile' });
    // قدیمی‌ترین کد ۴۵۰ ثانیه پیش بود؛ ساعتش تمام شود، جا باز می‌شود.
    expect(refused).toMatchObject({ retryAfterSeconds: (HOUR - PER_MOBILE * RESEND) / 1000 });
    // شمارهٔ دیگر گیر نمی‌افتد.
    expect((await sendCode('88888', { mobile: '09351234567' })).ok).toBe(true);
    later(HOUR - PER_MOBILE * RESEND);
    expect((await sendCode('77777', { session: OTHER })).ok).toBe(true);
  });

  it('سقف ۲۰ کد در ساعت برای هر IP، روی شماره‌های مختلف', async () => {
    for (let i = 0; i < PER_IP; i += 1) {
      expect((await sendCode('12345', { mobile: `091200000${String(i).padStart(2, '0')}`, session: `${i}`.padStart(64, 'c') })).ok).toBe(true);
    }
    expect(await sendCode('12345', { mobile: '09129999999', session: OTHER })).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'ip' });
    expect((await sendCode('12345', { mobile: '09129999999', session: OTHER, ip: '1.1.1.1' })).ok).toBe(true);
  });

  it('سقف ساعتی کل سایت، از تنظیم', async () => {
    siteLimit = 3;
    for (let i = 0; i < 3; i += 1) {
      expect((await sendCode('12345', { mobile: `0912000000${i}`, ip: `10.0.0.${i}`, session: `${i}`.padStart(64, 'c') })).ok).toBe(true);
    }
    expect(await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9', session: OTHER })).toMatchObject({
      status: 429,
      error: 'too_many_codes',
      scope: 'site',
    });
    expect(logs.some((line) => line.includes('سقف ساعتی کد پیامکی کل سایت'))).toBe(true);
  });

  it('دروازهٔ جزوه (۷٫۱): مرورگری که سند آماده و زنده روی سرور ندارد، ۴۰۹ و نه کد و نه پیامک', async () => {
    store.liveDocuments.set(ME, false);
    expect(await sendCode('48213')).toMatchObject({ status: 409, error: 'no_documents' });
    expect(store.otps).toHaveLength(0);
    expect(sms.messages).toHaveLength(0);
    // همان شماره از مرورگری که جزوه دارد.
    expect((await sendCode('48213', { session: OTHER })).ok).toBe(true);
  });

  it('سقف ۵ کد در ساعت برای هر مرورگر (۷٫۱)، روی شماره‌ها و اینترنت‌های مختلف', async () => {
    for (let i = 0; i < PER_BROWSER; i += 1) {
      expect((await sendCode('12345', { mobile: `0912000000${i}`, ip: `10.0.1.${i}` })).ok).toBe(true);
      later(60_000);
    }
    const refused = await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9' });
    expect(refused).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'browser' });
    // اولین کد این مرورگر پنج دقیقه پیش بود.
    expect(refused).toMatchObject({ retryAfterSeconds: (HOUR - PER_BROWSER * 60_000) / 1000 });
    expect((await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9', session: OTHER })).ok).toBe(true);
  });

  it('سقف ۱۰ کد در ۲۴ ساعت برای هر شماره (۷٫۱)', async () => {
    for (let i = 0; i < PER_MOBILE_DAY; i += 1) {
      expect((await sendCode(`1000${i % 10}`, { session: `${i}`.padStart(64, 'c'), ip: `10.0.2.${i}` })).ok).toBe(true);
      // دو کد در هر ساعت و نیم: سقف ساعتی (۵) هرگز پر نمی‌شود.
      later(90 * 60_000);
    }
    const refused = await sendCode('99999', { session: OTHER, ip: '10.9.9.9' });
    expect(refused).toMatchObject({ status: 429, error: 'too_many_codes', scope: 'mobile_day' });
    expect(refused).toMatchObject({ retryAfterSeconds: (24 * HOUR - PER_MOBILE_DAY * 90 * 60_000) / 1000 });
    later(24 * HOUR - PER_MOBILE_DAY * 90 * 60_000);
    expect((await sendCode('99999', { session: OTHER, ip: '10.9.9.9' })).ok).toBe(true);
  });

  it('سقف روزانهٔ کل سایت (۷٫۱): روز تقویمی تهران، «دوباره» از نیمه‌شب تهران', async () => {
    siteDaily = 3;
    siteLimit = 1000;
    // ۲۳:۰۰ تهران، ۱۹:۳۰ UTC.
    clock = new Date('2026-09-26T19:30:00Z');
    for (let i = 0; i < 3; i += 1) {
      expect((await sendCode('12345', { mobile: `0912000000${i}`, ip: `10.0.3.${i}`, session: `${i}`.padStart(64, 'c') })).ok).toBe(true);
    }
    const refused = await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9', session: OTHER });
    expect(refused).toMatchObject({
      status: 429,
      error: 'too_many_codes',
      scope: 'site_day',
      retryAfterSeconds: 3600,
      // نیمه‌شب تهران، دقیق.
      retryAt: '2026-09-26T20:30:00.000Z',
    });
    expect(logs.some((line) => line.includes('سقف روزانهٔ کد پیامکی کل سایت'))).toBe(true);
    // نیمه‌شب تهران روز تازه است، حتی اگر ۲۴ ساعت نگذشته.
    later(HOUR);
    expect((await sendCode('12345', { mobile: '09129999999', ip: '10.9.9.9', session: OTHER })).ok).toBe(true);
  });

  it('پنل واقعی: کد فقط پارامتر قالب است؛ لاگ خطا فقط علت و کد عددی', async () => {
    const sent: SmsMessage[] = [];
    build({
      name: 'smsir',
      send: async (message) => {
        sent.push(message);
      },
    });
    await sendCode('48213');
    expect(sent).toEqual([{ to: MOBILE, purpose: 'otp', text: otpText('48213'), params: ['48213'] }]);
    build({ name: 'smsir', send: async () => Promise.reject(new SmsError('rejected', 'sms.ir نپذیرفت', 400, 13)) });
    later(RESEND);
    expect(await sendCode('77777')).toMatchObject({ status: 503, error: 'sms_unavailable' });
    expect(logs.at(-1)).toContain('rejected (HTTP 400، کد 13)');
    expect(logs.join(' ')).not.toContain('77777');
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
