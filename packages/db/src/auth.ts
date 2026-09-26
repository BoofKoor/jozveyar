/**
 * کد پیامکی و نشست در پایگاه داده (ADR-033).
 *
 * مثل `documents.ts` فقط کوئری است، بی تصمیم: سقف‌ها، اعتبار کد و فرصت‌ها در سرویس کد پیامکی وب
 * گرفته می‌شوند، تا با پیاده‌سازی حافظه‌ای هم تست شوند. آنچه اینجاست همان است که درستی‌اش فقط با
 * پستگرس معلوم می‌شود: شمردن و درج زیر یک قفل، و گرفتن فرصت کد به‌صورت اتمی.
 */

import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';

import type { Database } from './index.js';
import { otpRequests, sessions, users } from './schema.js';

/** کلید قفل مشورتی صدور کد پیامکی: «otp» به عدد. */
const OTP_LOCK = 0x6f7470;

export type OtpRow = typeof otpRequests.$inferSelect;

/** شمارش کدهای یک پنجرهٔ زمانی؛ `…Oldest` برای «چند ثانیهٔ دیگر». */
export interface OtpCounts {
  mobile: number;
  mobileOldest: Date | null;
  mobileLatest: Date | null;
  ip: number;
  ipOldest: Date | null;
  site: number;
  siteOldest: Date | null;
}

export interface NewOtp {
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthSession {
  id: string;
  userId: string;
  mobile: string;
}

export interface AuthStore {
  /**
   * صدور کد زیر یک قفل سراسری، در یک تراکنش: شمارش، تصمیم، درج. بی قفل، چند درخواست هم‌زمان همه از
   * شمارش رد می‌شدند و سقف فقط روی کاغذ بود — مثلاً پنجاه پیامک هم‌زمان به یک شماره. صدور کد کم‌تعداد
   * است (سقف سایت در ساعت)، پس قفل سراسری چند میلی‌ثانیه‌ای هزینه‌ای ندارد و هر سه سقف را دقیق می‌کند.
   *
   * `decide` با شمارش‌ها صدا زده می‌شود و کد تازه را برمی‌گرداند، یا null اگر سقفی پر است.
   */
  issueOtp(
    input: { mobile: string; ipHash: string; sessionHash: string; since: Date },
    decide: (counts: OtpCounts) => NewOtp | null,
  ): Promise<{ id: string } | null>;
  /** آخرین کد این شماره در همین مرورگر؛ کد تازه کد قبلی را کنار می‌گذارد. */
  latestOtp(sessionHash: string, mobile: string): Promise<OtpRow | null>;
  /**
   * یک فرصت کد، اتمی: شمار فرصت‌ها بالا می‌رود فقط اگر کد هنوز زنده و مصرف‌نشده است و فرصتش تمام
   * نشده. خروجی شمار فرصت‌ها بعد از این یکی، یا null. دو درخواست هم‌زمان هرگز بیش از `maxAttempts`
   * بار کد را نمی‌سنجند.
   */
  claimOtpAttempt(id: string, now: Date, maxAttempts: number): Promise<number | null>;
  /**
   * ورود، در یک تراکنش: کد مصرف می‌شود، کاربر (موبایل) ساخته یا پیدا می‌شود، و نشست تازه می‌نشیند.
   * null یعنی کد را درخواست هم‌زمان دیگری همین الان مصرف کرد.
   */
  login(input: {
    otpId: string;
    mobile: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<{ userId: string } | null>;
  /** نشست زنده (باطل‌نشده و منقضی‌نشده) با موبایلش. */
  findSession(tokenHash: string, now: Date): Promise<AuthSession | null>;
  /** «عوض کن»: نشست باطل می‌شود و دیگر زنده نمی‌شود. */
  revokeSession(tokenHash: string, now: Date): Promise<boolean>;
}

export function createAuthStore({ db }: Database): AuthStore {
  return {
    async issueOtp(input, decide) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${OTP_LOCK})`);
        const [row] = await tx
          .select({
            mobile: sql<number>`count(*) FILTER (WHERE ${otpRequests.mobile} = ${input.mobile})::int`,
            mobileOldest: sql<Date | null>`min(${otpRequests.createdAt}) FILTER (WHERE ${otpRequests.mobile} = ${input.mobile})`,
            mobileLatest: sql<Date | null>`max(${otpRequests.createdAt}) FILTER (WHERE ${otpRequests.mobile} = ${input.mobile})`,
            ip: sql<number>`count(*) FILTER (WHERE ${otpRequests.ipHash} = ${input.ipHash})::int`,
            ipOldest: sql<Date | null>`min(${otpRequests.createdAt}) FILTER (WHERE ${otpRequests.ipHash} = ${input.ipHash})`,
            site: sql<number>`count(*)::int`,
            siteOldest: sql<Date | null>`min(${otpRequests.createdAt})`,
          })
          .from(otpRequests)
          .where(gt(otpRequests.createdAt, input.since));
        const counts: OtpCounts = {
          mobile: row?.mobile ?? 0,
          mobileOldest: asDate(row?.mobileOldest),
          mobileLatest: asDate(row?.mobileLatest),
          ip: row?.ip ?? 0,
          ipOldest: asDate(row?.ipOldest),
          site: row?.site ?? 0,
          siteOldest: asDate(row?.siteOldest),
        };
        const otp = decide(counts);
        if (!otp) return null;
        const [inserted] = await tx
          .insert(otpRequests)
          .values({
            mobile: input.mobile,
            ipHash: input.ipHash,
            sessionHash: input.sessionHash,
            codeHash: otp.codeHash,
            createdAt: otp.createdAt,
            expiresAt: otp.expiresAt,
          })
          .returning({ id: otpRequests.id });
        return { id: inserted!.id };
      });
    },

    async latestOtp(sessionHash, mobile) {
      const [row] = await db
        .select()
        .from(otpRequests)
        .where(and(eq(otpRequests.mobile, mobile), eq(otpRequests.sessionHash, sessionHash)))
        .orderBy(desc(otpRequests.createdAt))
        .limit(1);
      return row ?? null;
    },

    async claimOtpAttempt(id, now, maxAttempts) {
      const [row] = await db
        .update(otpRequests)
        .set({ attempts: sql`${otpRequests.attempts} + 1` })
        .where(
          and(
            eq(otpRequests.id, id),
            isNull(otpRequests.consumedAt),
            gt(otpRequests.expiresAt, now),
            lt(otpRequests.attempts, maxAttempts),
          ),
        )
        .returning({ attempts: otpRequests.attempts });
      return row?.attempts ?? null;
    },

    async login(input) {
      return db.transaction(async (tx) => {
        const [consumed] = await tx
          .update(otpRequests)
          .set({ consumedAt: input.now })
          .where(and(eq(otpRequests.id, input.otpId), isNull(otpRequests.consumedAt)))
          .returning({ id: otpRequests.id });
        if (!consumed) return null;
        const [user] = await tx
          .insert(users)
          .values({ mobile: input.mobile, lastLoginAt: input.now })
          .onConflictDoUpdate({ target: users.mobile, set: { lastLoginAt: input.now } })
          .returning({ id: users.id });
        await tx.insert(sessions).values({
          tokenHash: input.tokenHash,
          userId: user!.id,
          createdAt: input.now,
          expiresAt: input.expiresAt,
          lastSeenAt: input.now,
        });
        return { userId: user!.id };
      });
    },

    async findSession(tokenHash, now) {
      const [row] = await db
        .select({ id: sessions.id, userId: sessions.userId, mobile: users.mobile })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
        .limit(1);
      return row ?? null;
    },

    async revokeSession(tokenHash, now) {
      const rows = await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      return rows.length > 0;
    },
  };
}

/** `min`/`max` خام در `sql<>` از درایور گاهی رشته برمی‌گردد، نه Date. */
function asDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}
