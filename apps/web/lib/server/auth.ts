/**
 * کد پیامکی و نشست (ADR-033): هویت فقط موقع پرداخت، بی رمز و ثبت‌نام.
 *
 * - **کد:** ۵ رقم، ۲ دقیقه اعتبار، ۳ فرصت، ارسال دوباره پس از ۹۰ ثانیه.
 * - **شمارهٔ مسدود** (برش ۱۲٫۲، ADR-063، سؤال ۲۱۲): کد نمی‌گیرد، با ۴۰۳ `mobile_blocked` و پیام «تماس».
 * - **«سفارش‌های من»** (برش ۱۲٫۱، ADR-068، سؤال ۳۰۶): دروازه به جای جزوه «سفارشی با همین شماره» است، و پاسخ برای هر شماره یکی، پس
 *   از سایت معلوم نمی‌شود چه کسی سفارش داده. شمارهٔ بی سفارش یا مسدود کدی می‌گیرد که هرگز درست نیست (هش پیش‌تصویر تصادفی، نه ۵ رقم)،
 *   با همان سقف‌ها و همان شمارش و بی پیامک؛ و پیامک شمارهٔ واقعی پس از پاسخ می‌رود، نه پیش از آن، تا زمان پاسخ هم چیزی نگوید.
 * - **سقف ارسال، لایه‌لایه** (برش ۷، ADR-049، سؤال ۱۱۷): کد فقط برای مرورگری که جزوهٔ آماده و زنده روی سرور دارد (دروازهٔ جزوه، همان
 *   شرط «ادامه»)؛ ۵ کد در ساعت برای هر مرورگر؛ ۵ در ساعت و ۱۰ در ۲۴ ساعت برای هر شماره؛ ۲۰ در ساعت برای هر IP؛ و ترمز آخر کل
 *   سایت، ساعتی و ۲۴ ساعته (`settings`، پیش‌فرض ۳۰۰ و ۲٬۰۰۰). پنجره‌ها لغزان‌اند (سؤال ۱۳۳). شمارش از ردیف‌های `otp_requests`، زیر یک
 *   قفل پستگرس، نه Redis. مشتری واقعی همیشه جزوهٔ روی سرور دارد، پس دروازه و سقف مرورگر فقط ربات را می‌گیرند.
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

import { otpRequestSchema, otpVerifySchema } from '@jozveyar/contracts/checkout';
import { FILE_MARGIN_MS, OTP_FIXED_LIMITS, type AuthStore, type OtpCounts, type OtpGate, type OtpRow } from '@jozveyar/db';
import { otpParams, otpText, type SmsProvider } from '@jozveyar/sms';
import { toLatinDigits } from '@jozveyar/text';
import { normalizeIranMobile } from '@jozveyar/text/input';

import { fail, ok, type Failure, type Result } from './result';

export const OTP_DIGITS = 5;
export const OTP_TTL_MS = 2 * 60_000;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RESEND_MS = 90_000;
export const OTP_WINDOW_MS = 60 * 60_000;
/** پنجرهٔ ۲۴ ساعتهٔ لغزان (برش ۷، سؤال ۱۳۳). */
export const OTP_DAY_MS = 24 * 60 * 60_000;
/** سقف‌های ثابت، یک منبع با «تنظیمات» پنل (`OTP_FIXED_LIMITS`): هر شماره در ساعت و از برش ۷ در ۲۴ ساعت، هر مرورگر (`jy_sid`) و هر IP. */
export const OTP_PER_MOBILE = OTP_FIXED_LIMITS.mobileHour;
export const OTP_PER_MOBILE_DAY = OTP_FIXED_LIMITS.mobileDay;
export const OTP_PER_BROWSER = OTP_FIXED_LIMITS.browserHour;
export const OTP_PER_IP = OTP_FIXED_LIMITS.ipHour;
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
  /** سقف کد در ۲۴ ساعت برای کل سایت (`otp.site_daily_limit`، برش ۷). */
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
   * سقف پرشده، یا null: لایه‌ها از تنگ به گشاد، و ترمز کل سایت آخر. «چند ثانیهٔ دیگر» تا بیرون رفتن قدیمی‌ترین کد همان پنجره. مسیر خرید
   * و «سفارش‌های من» هر دو همین را دارند، با همان شمارنده‌ها (سؤال ۳۰۶).
   */
  function capHit(counts: OtpCounts, at: Date, siteLimit: number, siteDayLimit: number): Failure | null {
    const wait = (from: Date | null, span: number) =>
      Math.max(1, Math.ceil(((from ?? at).getTime() + span - at.getTime()) / 1000));
    const tooMany = (scope: string, from: Date | null, span: number) =>
      fail(429, 'too_many_codes', { scope, retryAfterSeconds: wait(from, span) });
    if (counts.mobileLatest && at.getTime() - counts.mobileLatest.getTime() < OTP_RESEND_MS) {
      return fail(429, 'resend_too_soon', { retryAfterSeconds: wait(counts.mobileLatest, OTP_RESEND_MS) });
    }
    if (counts.session >= OTP_PER_BROWSER) return tooMany('browser', counts.sessionOldest, OTP_WINDOW_MS);
    if (counts.mobile >= OTP_PER_MOBILE) return tooMany('mobile', counts.mobileOldest, OTP_WINDOW_MS);
    if (counts.mobileDay >= OTP_PER_MOBILE_DAY) return tooMany('mobile_day', counts.mobileDayOldest, OTP_DAY_MS);
    if (counts.ip >= OTP_PER_IP) return tooMany('ip', counts.ipOldest, OTP_WINDOW_MS);
    if (counts.site >= siteLimit) {
      log(`✗ سقف ساعتی کد پیامکی کل سایت (${siteLimit}) پر شد.`);
      return tooMany('site', counts.siteOldest, OTP_WINDOW_MS);
    }
    if (counts.siteDay >= siteDayLimit) {
      log(`✗ سقف ۲۴ ساعتهٔ کد پیامکی کل سایت (${siteDayLimit}) پر شد.`);
      return tooMany('site_day', counts.siteDayOldest, OTP_DAY_MS);
    }
    return null;
  }

  /**
   * مسیر خرید: اول دروازهٔ جزوه (کد برای مرورگری که جزوه‌ای روی سرور ندارد اصلاً معنا ندارد)، بعد شمارهٔ مسدود (برش ۱۲٫۲، ADR-063:
   * پیامکی نمی‌رود و چیزی شمرده نمی‌شود، و «چند ثانیهٔ دیگر» به شماره‌ای که هرگز کد نمی‌گیرد معنا ندارد)، بعد سقف‌ها. دروازهٔ جزوه پیش
   * از مسدودی است، تا رباتی بی جزوه نتواند شماره‌ها را بپرسد.
   */
  function limitHit(counts: OtpCounts, at: Date, siteLimit: number, siteDayLimit: number): Failure | null {
    if (!counts.ready) return fail(409, 'otp_no_documents');
    if (counts.blocked) return fail(403, 'mobile_blocked');
    return capHit(counts, at, siteLimit, siteDayLimit);
  }

  /** چرا کد این شماره دیگر پذیرفته نمی‌شود؛ null یعنی هنوز می‌شود. */
  function closedReason(otp: OtpRow | null, at: Date): Failure | null {
    if (!otp || otp.consumedAt) return fail(404, 'no_code');
    if (otp.expiresAt.getTime() <= at.getTime()) return fail(410, 'code_expired');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) return fail(410, 'code_locked');
    return null;
  }

  type Issued = Result<{ mobile: string; expiresInSeconds: number; resendInSeconds: number }>;

  /**
   * کد تازه: مسیر خرید با دروازهٔ جزوه، و «سفارش‌های من» با دروازهٔ سفارش. پاسخ «سفارش‌های من» برای هر شماره‌ای که از سقف‌ها گذشت یکی
   * است؛ کدِ بی سفارش یا مسدود هیچ‌وقت درست نیست، و پیامک فقط برای کد واقعی، بی منتظر ماندن.
   */
  async function issue(sessionHash: string, ip: string, body: unknown, path: 'checkout' | 'account'): Promise<Issued> {
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'invalid_request');
    const mobile = normalizeIranMobile(parsed.data.mobile);
    if (!mobile) return fail(400, 'invalid_mobile');

    const at = now();
    const [siteLimit, siteDayLimit] = await Promise.all([deps.siteHourlyLimit(), deps.siteDailyLimit()]);
    const code = newCode();
    // همان حاشیهٔ پرداخت: جزوه‌ای که تا یک ساعت دیگر پاک می‌شود سفارش نمی‌شود، پس کد هم نمی‌گیرد.
    const gate: OtpGate = path === 'checkout' ? { kind: 'documents', readyUntil: new Date(at.getTime() + FILE_MARGIN_MS) } : { kind: 'orders' };
    const verdict: { refused: Failure | null; real: boolean } = { refused: null, real: false };
    const issued = await deps.store.issueOtp(
      {
        mobile,
        ipHash: ipHash(ip || 'unknown'),
        sessionHash,
        hourSince: new Date(at.getTime() - OTP_WINDOW_MS),
        daySince: new Date(at.getTime() - OTP_DAY_MS),
        gate,
      },
      (counts) => {
        verdict.refused = path === 'checkout' ? limitHit(counts, at, siteLimit, siteDayLimit) : capHit(counts, at, siteLimit, siteDayLimit);
        if (verdict.refused) return null;
        verdict.real = path === 'checkout' || (counts.ready && !counts.blocked);
        // پیش‌تصویر ۳۲ نویسهٔ هگز هرگز کد ۵ رقمی نیست: کدی که در سقف شمرده می‌شود ولی هیچ ورودی‌ای با آن درست نمی‌شود.
        const preimage = verdict.real ? code : randomBytes(16).toString('hex');
        return { codeHash: codeHash(mobile, preimage), createdAt: at, expiresAt: new Date(at.getTime() + OTP_TTL_MS) };
      },
    );
    if (!issued) return verdict.refused ?? fail(503, 'unavailable');
    const done = ok({ mobile, expiresInSeconds: OTP_TTL_MS / 1000, resendInSeconds: OTP_RESEND_MS / 1000 });
    const message = { to: mobile, purpose: 'otp' as const, text: otpText(code), params: otpParams(code) };

    if (path === 'account') {
      // پیامکی که نرفت همان «پیامک نرسید؟» است؛ ۵۰۳ فقط برای شمارهٔ واقعی می‌گفت این شماره سفارش دارد.
      if (verdict.real) void deps.sms.send(message).catch((error: unknown) => log('✗ پیامک کد «سفارش‌های من» فرستاده نشد:', error));
      return done;
    }
    // بعد از درج، نه در همان تراکنش: پنل واقعی درخواست HTTP است. کدی که پیامکش نرسید در سقف
    // شمرده می‌ماند؛ ربات با پنل از کار افتاده هم نمی‌تواند بی‌حساب درخواست بفرستد.
    try {
      await deps.sms.send(message);
    } catch (error) {
      log('✗ پیامک کد فرستاده نشد:', error);
      return fail(503, 'sms_unavailable');
    }
    return done;
  }

  return {
    /** کد تازه به این شماره، برای همین مرورگر (مسیر خرید، دروازهٔ جزوه). */
    requestCode: (sessionHash: string, ip: string, body: unknown) => issue(sessionHash, ip, body, 'checkout'),

    /** کد ورود «سفارش‌های من» (برش ۱۲٫۱، سؤال ۳۰۶): فقط شماره‌ای که سفارشی دارد کد واقعی می‌گیرد، و پاسخ برای همه یکی است. */
    requestAccountCode: (sessionHash: string, ip: string, body: unknown) => issue(sessionHash, ip, body, 'account'),

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
