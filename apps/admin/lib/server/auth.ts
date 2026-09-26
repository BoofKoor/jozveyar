/**
 * ورود پنل و ادمین‌ها (ADR-037 و ADR-038). ثبت‌نام ندارد: هر ادمین با پیوند یک‌باره رمز و برنامهٔ تأیید
 * گوشی را خودش می‌گذارد، و ورود هر سه را با هم می‌خواهد: نام کاربری، رمز و کد.
 *
 * - **ورود:** یک پیام برای هر شکست («نام کاربری، رمز یا کد درست نیست»)؛ نامی که نیست هم یک سنجش کامل
 *   argon2 می‌خورد تا زمان پاسخ چیزی نگوید. هر کد فقط یک بار (`totp_last_step`).
 * - **سقف‌ها:** ۵ اشتباه پشت‌سرهم حساب را ۱۵ دقیقه می‌بندد، و هر IP ۳۰ تلاش در ساعت. هر دو پیش از سنجش
 *   شمرده می‌شوند (`claimAttempt`، `recordAttempt`)، پس درخواست‌های هم‌زمان هم از سقف نمی‌گذرند. پیام قفل
 *   می‌گوید چنین حسابی هست؛ پذیرفته، چون سقف IP شمردن نام‌ها را کند می‌کند و بی آن ادمین نمی‌داند چرا
 *   وارد نمی‌شود.
 * - **نشست:** توکن ۲۵۶ بیتی در کوکی، فقط هشش در پایگاه داده؛ ۱۲ ساعت، یا ۱ ساعت بی‌کاری.
 * - **کار حساس** (ساختن و بستن ادمین؛ از ۴٫۵ و ۴٫۶ تعرفه و کلیدها) کد تازهٔ برنامهٔ تأیید می‌خواهد؛ همان
 *   سقف ۵ اشتباه، و قفلش نشست‌های باز را هم می‌بندد: کوکی دزدیده‌شده بی گوشی کار حساسی نمی‌کند.
 * - **پیوند ثبت:** ۱۵ دقیقه، یک بار. رمز برنامهٔ تأیید از ساختن پیوند ثابت است (QR با بار دوبارهٔ صفحه
 *   همان می‌ماند) و با ثبت به ردیف ادمین می‌رود. «کد ورود تازه» (گوشی گم شد) همین پیوند است برای ادمین موجود.
 *
 * رمز برنامهٔ تأیید مهروموم‌شده با `SECRETS_KEY` می‌نشیند (`@jozveyar/db` → `sealed.ts`)، و IP فقط HMAC با
 * `SESSION_SECRET`، همان HMAC مسیر خرید، تا یک IP در دو جدول یکی دیده شود. هر وابستگی از درگاه می‌آید، پس کل
 * منطق با پیاده‌سازی حافظه‌ای (`testing.ts`) تست می‌شود؛ اتمی بودن و قفل‌ها در تست یکپارچگی `packages/db`.
 */

import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import {
  isAdminRole,
  seal,
  unseal,
  type AdminEventView,
  type AdminListItem,
  type AdminPermission,
  type AdminRole,
  type AdminStore,
  type AdminUserRow,
} from '@jozveyar/db';
import { toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import type { Passwords } from './password';
import { normalizePassword } from './passwordText';
import { fail, ok, type Failure, type Result } from './result';
import { base32Decode, matchTotp, newTotpSecret, otpauthUri } from './totp';

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60_000;
export const LOGIN_IP_LIMIT = 30;
export const LOGIN_IP_WINDOW_MS = 60 * 60_000;
export const SESSION_TTL_MS = 12 * 60 * 60_000;
export const SESSION_IDLE_MS = 60 * 60_000;
/** «آخرین دیدن» نشست حداکثر دقیقه‌ای یک بار نوشته می‌شود، نه با هر صفحه. */
export const SESSION_TOUCH_MS = 60_000;
export const INVITE_TTL_MS = 15 * 60_000;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;
export const DISPLAY_NAME_MAX = 100;
export const EVENTS_PAGE = 50;

/** همان محدودیت `admin_users_username` در پایگاه داده. */
const USERNAME = /^[a-z][a-z0-9_.-]{2,31}$/;
/** توکن کوکی و پیوند: ۳۲ بایت base64url. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface AdminSession {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  expiresAt: Date;
}

export const can = (session: AdminSession, permission: AdminPermission) => session.permissions.includes(permission);

export interface AdminAuthDeps {
  store: AdminStore;
  passwords: Passwords;
  /** `SECRETS_KEY`: رمز برنامهٔ تأیید را مهروموم می‌کند. */
  secretsKey: Buffer;
  /** `SESSION_SECRET`: کلید HMAC IP. */
  secret: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
  /** فقط تست جای اینها را می‌گیرد. */
  newToken?: () => string;
  newTotpSecret?: () => string;
  newId?: () => string;
}

/** IP فقط HMAC با `SESSION_SECRET`، همان HMAC مسیر خرید، تا یک IP در دو جدول یکی دیده شود. */
export const ipHashOf = (secret: string, ip: string) =>
  createHmac('sha256', secret).update(`ip\0${ip || 'unknown'}`).digest('hex');

/** هش توکن کوکی و پیوند. توکن ۲۵۶ بیت تصادفی است، پس SHA-256 بی‌کلید کافی است (مثل `jy_auth`). */
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

/** جای مهروموم رمز برنامهٔ تأیید (AAD): مقدار یک ردیف در ردیف دیگر باز نمی‌شود. */
export const userTotpContext = (userId: string) => `admin_users.totp:${userId}`;
export const inviteTotpContext = (inviteId: string) => `admin_invites.totp:${inviteId}`;

/** نام کاربری تایپ‌شده، کوچک و با ارقام لاتین؛ null اگر شکلش درست نیست. */
export function normalizeUsername(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = toLatinDigits(input).trim().toLowerCase();
  return USERNAME.test(value) ? value : null;
}

const text = (input: unknown) => (typeof input === 'string' ? input : '');
const normalizeCode = (input: unknown) => toLatinDigits(text(input)).replace(/\s/g, '');
const later = (at: Date, ms: number) => new Date(at.getTime() + ms);

export interface IssuedInvite {
  token: string;
  expiresAt: Date;
  userId: string;
  username: string;
  displayName: string;
  /** ادمین موجود بود (کد ورود تازه). */
  reset: boolean;
}

export interface InviteInfo {
  username: string;
  displayName: string;
  role: AdminRole | null;
  /** چه کسی پیوند را ساخت؛ null یعنی دستور روی سرور. */
  creatorName: string | null;
  /** ادمینی که قبلاً وارد شده بود (کد ورود تازه). */
  reset: boolean;
  secret: string;
  otpauth: string;
  expiresAt: Date;
}

export function createAdminAuth(deps: AdminAuthDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message, error) => console.error(message, error ?? ''));
  const newToken = deps.newToken ?? (() => randomBytes(32).toString('base64url'));
  const makeSecret = deps.newTotpSecret ?? newTotpSecret;
  const newId = deps.newId ?? randomUUID;
  const { store } = deps;

  const ipHash = (ip: string) => ipHashOf(deps.secret, ip);

  /** رمز برنامهٔ تأیید؛ null یعنی باز نشد (`SECRETS_KEY` عوض شده) و در لاگ آمده است. */
  function open(sealed: string, context: string): Buffer | null {
    try {
      return base32Decode(unseal(deps.secretsKey, sealed, context));
    } catch (error) {
      log('✗ رمز برنامهٔ تأیید باز نشد؛ SECRETS_KEY عوض شده؟', error);
      return null;
    }
  }

  const lockFailure = (lockedUntil: Date | null) => fail(423, 'account_locked', { lockedUntil });

  /**
   * کد تازه برای کار حساس. اشتباه در همان سقف ورود شمرده می‌شود و قفلش همهٔ نشست‌های ادمین را می‌بندد.
   * کدی که یک بار به کار رفته (مثلاً همان کد ورود) پذیرفته نیست، ولی نشست ثابت شده، پس پیامش جداست.
   */
  async function stepUp(session: AdminSession, codeInput: unknown, ip: string): Promise<Result<true>> {
    const at = now();
    const user = await store.findUser(session.userId);
    if (!user?.totpSealed || user.disabledAt) return fail(403, 'forbidden');
    const claim = await store.claimAttempt(user.id, LOGIN_MAX_FAILURES, at, later(at, LOGIN_LOCK_MS));
    const locked = async (lockedUntil: Date | null) => {
      await store.revokeUserSessions(user.id, at);
      return lockFailure(lockedUntil);
    };
    if (!claim.allowed) return locked(claim.lockedUntil);
    const secret = open(user.totpSealed, userTotpContext(user.id));
    if (!secret) return fail(503, 'unavailable');
    const step = matchTotp(secret, normalizeCode(codeInput), at);
    const used = step !== null && !(await store.claimTotpStep(user.id, step));
    if (step === null || used) {
      await store.logEvent({
        adminUserId: user.id,
        action: 'auth.code_failed',
        targetType: 'admin',
        targetId: user.id,
        ipHash: ipHash(ip),
        detail: { reason: used ? 'replay' : 'code', locked: claim.lockedUntil !== null },
        at,
      });
      if (claim.lockedUntil) return locked(claim.lockedUntil);
      return fail(400, used ? 'code_used' : 'wrong_code');
    }
    await store.clearFailures(user.id);
    return ok(true);
  }

  async function issueInvite(input: {
    username: string;
    displayName: string;
    role: AdminRole | null;
    createdBy: string | null;
    allowExisting: boolean;
    ip: string | null;
  }): Promise<Result<IssuedInvite>> {
    const at = now();
    const inviteId = newId();
    const token = newToken();
    const created = await store.createInvite({
      inviteId,
      newUserId: newId(),
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      tokenHash: tokenHash(token),
      totpSealed: seal(deps.secretsKey, makeSecret(), inviteTotpContext(inviteId)),
      at,
      expiresAt: later(at, INVITE_TTL_MS),
      createdBy: input.createdBy,
      allowExisting: input.allowExisting,
      event: {
        adminUserId: input.createdBy,
        action: 'admins.invite',
        targetType: 'admin',
        ipHash: input.ip === null ? null : ipHash(input.ip),
        detail: { username: input.username, role: input.role },
      },
    });
    if (!created.ok) return fail(409, created.reason === 'username_taken' ? 'username_taken' : 'invalid_role');
    return ok({
      token,
      expiresAt: later(at, INVITE_TTL_MS),
      userId: created.userId,
      username: input.username,
      displayName: input.displayName,
      reset: created.reset,
    });
  }

  /** پیوند زنده با ادمینش، یا شکست «این پیوند دیگر کار نمی‌کند». */
  async function liveInvite(token: string) {
    if (!TOKEN.test(token)) return null;
    const row = await store.findInvite(tokenHash(token));
    const at = now();
    if (!row || row.invite.usedAt || row.invite.revokedAt || row.user.disabledAt) return null;
    if (row.invite.expiresAt.getTime() <= at.getTime()) return null;
    return row;
  }

  function requirePermission(session: AdminSession, permission: AdminPermission): Failure | null {
    return can(session, permission) ? null : fail(403, 'forbidden');
  }

  return {
    async login(
      input: { username: unknown; password: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ token: string; expiresAt: Date }>> {
      const at = now();
      const ipH = ipHash(ip);
      const typed = toLatinDigits(text(input.username)).trim().toLowerCase().slice(0, 64);
      const username = normalizeUsername(typed);
      const password = text(input.password);
      const user = username ? await store.findUserByUsername(username) : null;

      const attemptId = await store.recordAttempt({ username: typed, adminUserId: user?.id ?? null, ipHash: ipH, at });
      if ((await store.countAttempts(ipH, later(at, -LOGIN_IP_WINDOW_MS))) > LOGIN_IP_LIMIT) {
        return fail(429, 'too_many_attempts');
      }

      const refuse = async (reason: string, failure: Failure, locked = false) => {
        await store.logEvent({
          adminUserId: null,
          action: 'auth.login_failed',
          targetType: user ? 'admin' : null,
          targetId: user?.id ?? null,
          ipHash: ipH,
          detail: { username: typed, reason, ...(locked ? { locked } : {}) },
          at,
        });
        return failure;
      };
      const generic = fail(401, 'invalid_credentials');

      if (!user || user.disabledAt || !user.passwordHash || !user.totpSealed) {
        await deps.passwords.dummyVerify(password);
        return refuse(!user ? 'unknown' : user.disabledAt ? 'disabled' : 'not_enrolled', generic);
      }
      const claim = await store.claimAttempt(user.id, LOGIN_MAX_FAILURES, at, later(at, LOGIN_LOCK_MS));
      if (!claim.allowed) return refuse('locked', lockFailure(claim.lockedUntil));

      const secret = open(user.totpSealed, userTotpContext(user.id));
      if (!secret) return fail(503, 'unavailable');
      const passwordOk = await deps.passwords.verify(user.passwordHash, password);
      const step = matchTotp(secret, normalizeCode(input.code), at);
      const reason = !passwordOk
        ? 'password'
        : step === null
          ? 'code'
          : (await store.claimTotpStep(user.id, step))
            ? null
            : 'replay';
      if (reason) {
        const lockedNow = claim.lockedUntil !== null;
        return refuse(reason, lockedNow ? lockFailure(claim.lockedUntil) : generic, lockedNow);
      }

      const token = newToken();
      const expiresAt = later(at, SESSION_TTL_MS);
      await store.startSession({
        userId: user.id,
        tokenHash: tokenHash(token),
        at,
        expiresAt,
        attemptId,
        event: { adminUserId: user.id, action: 'auth.login', ipHash: ipH, at },
      });
      return ok({ token, expiresAt });
    },

    /** ادمین این کوکی، یا null: نشست باطل، کهنه، بی‌کار، یا ادمین غیرفعال و بی کد ورود. */
    async authenticate(token: string | null | undefined): Promise<AdminSession | null> {
      if (!token || !TOKEN.test(token)) return null;
      const view = await store.findSession(tokenHash(token));
      if (!view) return null;
      const at = now().getTime();
      if (view.revokedAt || view.expiresAt.getTime() <= at) return null;
      if (view.lastSeenAt.getTime() + SESSION_IDLE_MS <= at) return null;
      if (view.user.disabledAt || !view.user.passwordHash) return null;
      if (at - view.lastSeenAt.getTime() >= SESSION_TOUCH_MS) await store.touchSession(view.sessionId, new Date(at));
      return {
        sessionId: view.sessionId,
        userId: view.user.id,
        username: view.user.username,
        displayName: view.user.displayName,
        roles: view.roles,
        permissions: view.permissions,
        expiresAt: view.expiresAt,
      };
    },

    async logout(token: string | null | undefined, ip: string): Promise<void> {
      if (!token || !TOKEN.test(token)) return;
      const at = now();
      const revoked = await store.revokeSession(tokenHash(token), at);
      if (revoked) await store.logEvent({ adminUserId: revoked.adminUserId, action: 'auth.logout', ipHash: ipHash(ip), at });
    },

    stepUp,

    /**
     * دستور روی سرور (`infra/admin-invite.sh`): اولین ادمین، یا کد ورود تازهٔ هر ادمین (مالکی که گوشی‌اش
     * گم شد). ادمین تازه بی نقش صریح مالک است؛ ادمین موجود نقش و نامش را نگه می‌دارد مگر نقش صریح بیاید.
     */
    async serverInvite(input: { username: string; displayName?: string; role?: string }): Promise<Result<IssuedInvite>> {
      const username = normalizeUsername(input.username);
      if (!username) return fail(400, 'invalid_username');
      if (input.role !== undefined && !isAdminRole(input.role)) return fail(400, 'invalid_role');
      const displayName = tidyInputFa(input.displayName ?? username);
      if (!displayName || displayName.length > DISPLAY_NAME_MAX) return fail(400, 'invalid_display_name');
      const existing = await store.findUserByUsername(username);
      return issueInvite({
        username,
        displayName: existing?.displayName ?? displayName,
        role: (input.role as AdminRole | undefined) ?? (existing ? null : 'owner'),
        createdBy: null,
        allowExisting: true,
        ip: null,
      });
    },

    /** «افزودن متصدی» (یا مالک) از پنل، با کد تازهٔ برنامهٔ تأیید. */
    async inviteAdmin(
      session: AdminSession,
      form: { username: unknown; displayName: unknown; role: unknown; code: unknown },
      ip: string,
    ): Promise<Result<IssuedInvite>> {
      const denied = requirePermission(session, 'admins.manage');
      if (denied) return denied;
      const displayName = tidyInputFa(text(form.displayName));
      if (!displayName || displayName.length > DISPLAY_NAME_MAX) return fail(400, 'invalid_display_name');
      const username = normalizeUsername(form.username);
      if (!username) return fail(400, 'invalid_username');
      if (!isAdminRole(form.role)) return fail(400, 'invalid_role');
      // پیش از کد: نام تکراری کد را هدر نمی‌دهد (مسابقه را خود `createInvite` زیر قفل می‌گیرد).
      if (await store.findUserByUsername(username)) return fail(409, 'username_taken');
      const stepped = await stepUp(session, form.code, ip);
      if (!stepped.ok) return stepped;
      return issueInvite({ username, displayName, role: form.role, createdBy: session.userId, allowExisting: false, ip });
    },

    /** «کد ورود تازه»: پیوند ثبت تازه برای ادمین دیگر؛ رمز و برنامهٔ تأیید قبلی و نشست‌هایش باطل. */
    async resetAdmin(session: AdminSession, form: { userId: unknown; code: unknown }, ip: string): Promise<Result<IssuedInvite>> {
      const denied = requirePermission(session, 'admins.manage');
      if (denied) return denied;
      const target = await findTarget(form.userId);
      if (!target) return fail(404, 'not_found');
      if (target.id === session.userId) return fail(400, 'self');
      const stepped = await stepUp(session, form.code, ip);
      if (!stepped.ok) return stepped;
      return issueInvite({
        username: target.username,
        displayName: target.displayName,
        role: null,
        createdBy: session.userId,
        allowExisting: true,
        ip,
      });
    },

    async disableAdmin(session: AdminSession, form: { userId: unknown; code: unknown }, ip: string): Promise<Result<true>> {
      const denied = requirePermission(session, 'admins.manage');
      if (denied) return denied;
      const target = await findTarget(form.userId);
      if (!target || target.disabledAt) return fail(404, 'not_found');
      if (target.id === session.userId) return fail(400, 'self');
      const stepped = await stepUp(session, form.code, ip);
      if (!stepped.ok) return stepped;
      const at = now();
      const done = await store.disableUser(target.id, at, {
        adminUserId: session.userId,
        action: 'admins.disable',
        targetType: 'admin',
        targetId: target.id,
        ipHash: ipHash(ip),
        detail: { username: target.username },
        at,
      });
      if (done === 'last_owner') return fail(409, 'last_owner');
      if (done === 'not_found') return fail(404, 'not_found');
      return ok(true);
    },

    /** «لغو دعوت»: فقط دسترسی کم می‌کند، پس کد نمی‌خواهد. */
    async revokeInvite(session: AdminSession, form: { userId: unknown }, ip: string): Promise<Result<true>> {
      const denied = requirePermission(session, 'admins.manage');
      if (denied) return denied;
      const target = await findTarget(form.userId);
      if (!target) return fail(404, 'not_found');
      const at = now();
      const revoked = await store.revokeInvites(target.id, at, {
        adminUserId: session.userId,
        action: 'admins.invite_revoked',
        targetType: 'admin',
        targetId: target.id,
        ipHash: ipHash(ip),
        detail: { username: target.username },
        at,
      });
      return revoked > 0 ? ok(true) : fail(404, 'not_found');
    },

    /** صفحهٔ پیوند ثبت: چه کسی، با چه نقشی، و QR. */
    async inviteInfo(token: string): Promise<Result<InviteInfo>> {
      const row = await liveInvite(token);
      if (!row) return fail(410, 'invite_invalid');
      let secret: string;
      try {
        secret = unseal(deps.secretsKey, row.invite.totpSealed, inviteTotpContext(row.invite.id));
      } catch (error) {
        log('✗ رمز برنامهٔ تأیید پیوند باز نشد؛ SECRETS_KEY عوض شده؟', error);
        return fail(503, 'unavailable');
      }
      const creator = row.invite.createdBy ? await store.findUser(row.invite.createdBy) : null;
      const role = row.roles.find(isAdminRole) ?? null;
      return ok({
        username: row.user.username,
        displayName: row.user.displayName,
        role,
        creatorName: creator?.displayName ?? null,
        reset: row.user.lastLoginAt !== null,
        secret,
        otpauth: otpauthUri(secret, row.user.username),
        expiresAt: row.invite.expiresAt,
      });
    },

    /** ثبت با پیوند: رمز، و کدی که برنامهٔ تأیید تازه نشان می‌دهد. نشست تازه برمی‌گردد. */
    async completeInvite(
      token: string,
      form: { password: unknown; confirm: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ token: string; expiresAt: Date }>> {
      const row = await liveInvite(token);
      if (!row) return fail(410, 'invite_invalid');
      const password = normalizePassword(text(form.password));
      const length = [...password].length;
      if (length < PASSWORD_MIN) return fail(400, 'password_too_short');
      if (length > PASSWORD_MAX) return fail(400, 'password_too_long');
      if (password !== normalizePassword(text(form.confirm))) return fail(400, 'password_mismatch');
      if (password.trim().toLowerCase() === row.user.username) return fail(400, 'password_is_username');

      let secret: string;
      try {
        secret = unseal(deps.secretsKey, row.invite.totpSealed, inviteTotpContext(row.invite.id));
      } catch (error) {
        log('✗ رمز برنامهٔ تأیید پیوند باز نشد؛ SECRETS_KEY عوض شده؟', error);
        return fail(503, 'unavailable');
      }
      const at = now();
      const step = matchTotp(base32Decode(secret), normalizeCode(form.code), at);
      if (step === null) return fail(400, 'wrong_code');

      const session = newToken();
      const expiresAt = later(at, SESSION_TTL_MS);
      const done = await store.completeInvite({
        inviteId: row.invite.id,
        userId: row.user.id,
        passwordHash: await deps.passwords.hash(password),
        totpSealed: seal(deps.secretsKey, secret, userTotpContext(row.user.id)),
        totpStep: step,
        at,
        session: { tokenHash: tokenHash(session), expiresAt },
        ipHash: ipHash(ip),
      });
      if (!done) return fail(410, 'invite_invalid');
      return ok({ token: session, expiresAt });
    },

    async listAdmins(session: AdminSession): Promise<Result<AdminListItem[]>> {
      const denied = requirePermission(session, 'admins.manage');
      if (denied) return denied;
      return ok(await store.listAdmins(now()));
    },

    /** رویدادها، تازه‌ترین اول، صفحه‌ای ۵۰ تا؛ `kind` پیشوند کار (`auth`، `admins`…). */
    async listEvents(
      session: AdminSession,
      query: { beforeId?: number; kind?: string },
    ): Promise<Result<AdminEventView[]>> {
      const denied = requirePermission(session, 'events.read');
      if (denied) return denied;
      const kind = query.kind && /^[a-z]+$/.test(query.kind) ? query.kind : undefined;
      const beforeId = query.beforeId && Number.isSafeInteger(query.beforeId) && query.beforeId > 0 ? query.beforeId : undefined;
      return ok(await store.listEvents({ limit: EVENTS_PAGE, beforeId, actionPrefix: kind }));
    },
  };

  async function findTarget(userId: unknown): Promise<AdminUserRow | null> {
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/.test(userId)) return null;
    return store.findUser(userId);
  }
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
