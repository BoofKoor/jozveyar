/**
 * کد پیامکی و نشست (ADR-033): هویت فقط موقع پرداخت، بی رمز و ثبت‌نام.
 *
 * - **کد:** ۵ رقم، ۲ دقیقه اعتبار، ۳ فرصت، ارسال دوباره پس از ۹۰ ثانیه.
 * - **سقف ارسال، لایه‌لایه** (ADR-033؛ از ۷٫۱ ADR-049، سؤال ۱۱۷): کد فقط برای مرورگری که دست‌کم یک سند آماده و زنده روی سرور دارد
 *   (دروازهٔ جزوه، همان شرط «ادامه»؛ وگرنه ۴۰۹ `no_documents`)؛ ۵ کد در ساعت برای هر مرورگر (`jy_sid`)، ۵ در ساعت و ۱۰ در ۲۴ ساعت
 *   برای هر شماره، ۲۰ در ساعت برای هر IP؛ و ترمز آخر کل سایت، ساعتی و روز تقویمی تهران (`settings`، پیش‌فرض ۳۰۰ و ۲٬۰۰۰). شمارش از
 *   ردیف‌های `otp_requests`، زیر یک قفل پستگرس، نه Redis. مشتری واقعی همیشه جزوهٔ روی سرور دارد، پس دروازه و سقف مرورگر فقط ربات را
 *   می‌گیرند. هر رد زمان «دوباره» را دارد (`retryAfterSeconds`).
 * - **هش، نه متن:** `code_hash` و `ip_hash` هر دو HMAC با `SESSION_SECRET`اند؛ نشت پایگاه داده نه کد
 *   زنده‌ای لو می‌دهد و نه IP (فضای IPv4 کوچک است و هش بی‌کلید با شمردن برمی‌گشت).
 * - **همان مرورگر:** کد فقط در نشست ناشناسی (`jy_sid`) پذیرفته می‌شود که خواستش، و فقط آخرین کد آن
 *   شماره؛ کد تازه کد قبلی را کنار می‌گذارد.
 * - **نشست:** بعد از تأیید، توکن تازهٔ `jy_auth` (کوکی جدا، ۳۰ روز)، با هشش در `sessions`. `jy_sid`
 *   کنارش می‌ماند و مالک فایل‌هاست؛ توکن تازه با خود ورود ساخته می‌شود، پس کسی که `jy_sid` را پیش از
 *   ورود کاشته، نشست را ندارد (session fixation).
 *
 * هر وابستگی بیرونی از درگاه می‌آید (`AuthStore`، `SmsProvider`)، پس کل منطق با پیاده‌سازی حافظه‌ای
 * تست می‌شود؛ درستی کوئری‌ها و قفل در تست یکپارچگی `packages/db`.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { otpRequestSchema, otpVerifySchema, type OtpLimitScope } from '@jozveyar/contracts/checkout';
import type { AuthStore, OtpCounts, OtpRow } from '@jozveyar/db';
import { describeSmsError, otpParams, otpText, type SmsProvider } from '@jozveyar/sms';
import { tehranDayStart, toLatinDigits } from '@jozveyar/text';
import { normalizeIranMobile } from '@jozveyar/text/input';

import { fail, ok, type Failure, type Result } from './result';

export const OTP_DIGITS = 5;
export const OTP_TTL_MS = 2 * 60_000;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RESEND_MS = 90_000;
export const OTP_WINDOW_MS = 60 * 60_000;
export const OTP_PER_MOBILE = 5;
export const OTP_PER_IP = 20;
/** هر مرورگر (`jy_sid`) در ساعت (۷٫۱، ADR-049). */
export const OTP_PER_BROWSER = 5;
/** هر شماره در ۲۴ ساعت (۷٫۱، ADR-049). */
export const OTP_PER_MOBILE_DAY = 10;
export const OTP_DAY_WINDOW_MS = 24 * 60 * 60_000;
/** نشست بعد از کد: همان گوشی تا ۳۰ روز کد نمی‌خواهد. */
export const AUTH_TTL_MS = 30 * 24 * 60 * 60_000;

export interface AuthUser {
  userId: string;
  mobile: string;
}

export interface AuthServiceDeps {
  store: AuthStore;
  sms: SmsProvider;
  /** `SESSION_SECRET`؛ کلید HMAC کد و IP. */
  secret: string;
  /** سقف کد در ساعت برای کل سایت (`otp.site_hourly_limit`). */
  siteHourlyLimit: () => Promise<number>;
  /** سقف کد در روز تهران برای کل سایت (`otp.site_daily_limit`، ۷٫۱). */
  siteDailyLimit: () => Promise<number>;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
  /** کد تصادفی؛ فقط تست جایش را می‌گیرد. */
  newCode?: () => string;
}

/** هش توکن کوکی. توکن ۲۵۶ بیت تصادفی است، پس SHA-256 بی‌کلید کافی است (مثل `jy_sid`). */
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createAuthService(deps: AuthServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message, error) => console.error(message, error ?? ''));
  const newCode = deps.newCode ?? (() => String(randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0'));

  const hmac = (label: string, value: string) =>
    createHmac('sha256', deps.secret).update(`${label}\0${value}`).digest('hex');
  /** شماره داخل هش است: هش یک کد برای شمارهٔ دیگر به کار نمی‌آید. */
  const codeHash = (mobile: string, code: string) => hmac('otp', `${mobile}\0${code}`);
  const ipHash = (ip: string) => hmac('ip', ip);

  const sameHash = (a: string, b: string) => {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && timingSafeEqual(x, y);
  };

  /**
   * سقف پرشده، یا null: اول سقف‌های خود مشتری (ارسال دوباره، مرورگر، شماره)، بعد اینترنت، بعد ترمز آخر کل سایت. «چند ثانیهٔ دیگر» تا
   * بیرون رفتن قدیمی‌ترین کد همان پنجره، و برای سقف روزانه تا آغاز فردای تهران.
   */
  function limitHit(counts: OtpCounts, at: Date, limits: { hourly: number; daily: number }): Failure | null {
    const seconds = (until: Date) => Math.max(1, Math.ceil((until.getTime() - at.getTime()) / 1000));
    const end = (from: Date | null, span: number) => new Date((from ?? at).getTime() + span);
    // `retryAt` لحظهٔ دقیق «دوباره»، تا رابط ساعتش را بی لغزش پاسخ بگوید (نیمه‌شب تهران «00:00»، نه «00:01»).
    const tooMany = (scope: OtpLimitScope, until: Date) =>
      fail(429, 'too_many_codes', { scope, retryAfterSeconds: seconds(until), retryAt: until.toISOString() });
    if (counts.mobileLatest && at.getTime() - counts.mobileLatest.getTime() < OTP_RESEND_MS) {
      return fail(429, 'resend_too_soon', { retryAfterSeconds: seconds(end(counts.mobileLatest, OTP_RESEND_MS)) });
    }
    if (counts.session >= OTP_PER_BROWSER) return tooMany('browser', end(counts.sessionOldest, OTP_WINDOW_MS));
    if (counts.mobile >= OTP_PER_MOBILE) return tooMany('mobile', end(counts.mobileOldest, OTP_WINDOW_MS));
    if (counts.mobileDay >= OTP_PER_MOBILE_DAY) return tooMany('mobile_day', end(counts.mobileDayOldest, OTP_DAY_WINDOW_MS));
    if (counts.ip >= OTP_PER_IP) return tooMany('ip', end(counts.ipOldest, OTP_WINDOW_MS));
    if (counts.site >= limits.hourly) {
      log(`✗ سقف ساعتی کد پیامکی کل سایت (${limits.hourly}) پر شد.`);
      return tooMany('site', end(counts.siteOldest, OTP_WINDOW_MS));
    }
    if (counts.siteDay >= limits.daily) {
      log(`✗ سقف روزانهٔ کد پیامکی کل سایت (${limits.daily}) پر شد.`);
      return tooMany('site_day', tehranDayStart(at, 1));
    }
    return null;
  }

  /** چرا کد این شماره دیگر پذیرفته نمی‌شود؛ null یعنی هنوز می‌شود. */
  function closedReason(otp: OtpRow | null, at: Date): Failure | null {
    if (!otp || otp.consumedAt) return fail(404, 'no_code');
    if (otp.expiresAt.getTime() <= at.getTime()) return fail(410, 'code_expired');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return fail(410, 'code_locked');
    return null;
  }

  return {
    /** کد تازه به این شماره، برای همین مرورگر. */
    async requestCode(
      sessionHash: string,
      ip: string,
      body: unknown,
    ): Promise<Result<{ mobile: string; expiresInSeconds: number; resendInSeconds: number }>> {
      const parsed = otpRequestSchema.safeParse(body);
      if (!parsed.success) return fail(400, 'invalid_request');
      const mobile = normalizeIranMobile(parsed.data.mobile);
      if (!mobile) return fail(400, 'invalid_mobile');

      const at = now();
      // دروازهٔ جزوه (۷٫۱): کد فقط برای مرورگری که جزوه‌ای روی سرور دارد. ربات بی جزوه اینجا می‌ماند، پیش از شمردن و پیامک.
      if (!(await deps.store.hasLiveDocument(sessionHash, at))) return fail(409, 'no_documents');
      const [hourly, daily] = await Promise.all([deps.siteHourlyLimit(), deps.siteDailyLimit()]);
      const code = newCode();
      const verdict: { refused: Failure | null } = { refused: null };
      const issued = await deps.store.issueOtp(
        {
          mobile,
          ipHash: ipHash(ip || 'unknown'),
          sessionHash,
          since: new Date(at.getTime() - OTP_WINDOW_MS),
          sinceDay: new Date(at.getTime() - OTP_DAY_WINDOW_MS),
          dayStart: tehranDayStart(at),
        },
        (counts) => {
          verdict.refused = limitHit(counts, at, { hourly, daily });
          if (verdict.refused) return null;
          return { codeHash: codeHash(mobile, code), createdAt: at, expiresAt: new Date(at.getTime() + OTP_TTL_MS) };
        },
      );
      if (!issued) return verdict.refused ?? fail(503, 'unavailable');

      // بعد از درج، نه در همان تراکنش: پنل واقعی درخواست HTTP است. کدی که پیامکش نرسید در سقف
      // شمرده می‌ماند؛ ربات با پنل از کار افتاده هم نمی‌تواند بی‌حساب درخواست بفرستد. پنل واقعی فقط قالب و
      // پارامتر می‌گیرد (ADR-049)؛ لاگ فقط علت و کدهای عددی، نه کد و نه کلید.
      try {
        await deps.sms.send({ to: mobile, purpose: 'otp', text: otpText(code), params: otpParams(code) });
      } catch (error) {
        log('✗ پیامک کد فرستاده نشد:', describeSmsError(error));
        return fail(503, 'sms_unavailable');
      }
      return ok({ mobile, expiresInSeconds: OTP_TTL_MS / 1000, resendInSeconds: OTP_RESEND_MS / 1000 });
    },

    /** کد درست: نشست تازه. توکن فقط همین یک بار برمی‌گردد و در کوکی می‌نشیند. */
    async verifyCode(
      sessionHash: string,
      body: unknown,
    ): Promise<Result<{ token: string; mobile: string; expiresAt: Date }>> {
      const parsed = otpVerifySchema.safeParse(body);
      if (!parsed.success) return fail(400, 'invalid_request');
      const mobile = normalizeIranMobile(parsed.data.mobile);
      if (!mobile) return fail(400, 'invalid_mobile');
      const code = toLatinDigits(parsed.data.code).replace(/\s/g, '');
      if (!new RegExp(`^\\d{${OTP_DIGITS}}$`).test(code)) return fail(400, 'invalid_code');

      const at = now();
      const otp = await deps.store.latestOtp(sessionHash, mobile);
      const closed = closedReason(otp, at);
      if (closed) return closed;

      // اول فرصت گرفته می‌شود، بعد سنجش: دو درخواست هم‌زمان هرگز بیش از سه بار کد را نمی‌سنجند.
      const attempts = await deps.store.claimOtpAttempt(otp!.id, at, OTP_MAX_ATTEMPTS);
      if (attempts === null) {
        return closedReason(await deps.store.latestOtp(sessionHash, mobile), at) ?? fail(410, 'code_locked');
      }
      if (!sameHash(codeHash(mobile, code), otp!.codeHash)) {
        return fail(400, 'wrong_code', { attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attempts) });
      }

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(at.getTime() + AUTH_TTL_MS);
      const login = await deps.store.login({ otpId: otp!.id, mobile, tokenHash: tokenHash(token), now: at, expiresAt });
      if (!login) return fail(404, 'no_code');
      return ok({ token, mobile, expiresAt });
    },

    /** کاربر نشست `jy_auth`، یا null. */
    async authenticate(token: string | null): Promise<AuthUser | null> {
      if (!token) return null;
      const session = await deps.store.findSession(tokenHash(token), now());
      return session ? { userId: session.userId, mobile: session.mobile } : null;
    },

    /** «عوض کن» در مرور: نشست باطل می‌شود. */
    async logout(token: string | null): Promise<void> {
      if (token) await deps.store.revokeSession(tokenHash(token), now());
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
