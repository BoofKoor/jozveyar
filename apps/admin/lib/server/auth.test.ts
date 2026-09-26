/**
 * ورود پنل و ادمین‌ها (ADR-037، ADR-038) با پایگاه دادهٔ حافظه‌ای و ساعت ساختگی.
 *
 * هر محافظ جدا و با شاهد سنجیده می‌شود: پیوند ۱۵ دقیقه‌ای یک‌باره، رمز دست‌کم ۱۲ نویسه، یک پیام برای هر
 * شکست ورود، هر کد یک بار، قفل ۵ اشتباه برای ۱۵ دقیقه، ۳۰ تلاش در ساعت برای هر IP، نشست ۱۲ ساعت یا ۱ ساعت
 * بی‌کاری، کد تازه برای کار حساس، و اینکه رمز، کد و IP هیچ‌جا خام نمی‌نشینند.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { unseal } from '@jozveyar/db';
import { toPersianDigits } from '@jozveyar/text';

import { createAdminAuth, type AdminSession, userTotpContext } from './auth';
import { normalizePassword, type Passwords } from './password';
import { memoryAdminStore } from './testing';
import { base32Decode, totpAt } from './totp';

const KEY = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');
const OTHER_KEY = Buffer.from('ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100', 'hex');
const SECRET = 'k'.repeat(64);
const IP = '5.6.7.8';
const PASSWORD = 'یک جملهٔ کوتاه و امن';

/** عددهای تصمیم ۱۴۰۵/۰۷/۰۴ (ADR-037)، صریح و نه از ثابت‌های کد: تست باید با عوض شدن هر کدام بشکند. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const STEP = 30_000;
const MAX_FAILURES = 5;
const LOCK = 15 * MINUTE;
const IP_LIMIT = 30;
const SESSION = 12 * HOUR;
const IDLE = HOUR;
const INVITE = 15 * MINUTE;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 200;
const OPERATOR_PERMISSIONS = ['files.download', 'orders.address', 'orders.read', 'orders.status', 'tariff.read'];

/** argon2 جدا در `password.test.ts`؛ اینجا همان قرارداد، سریع، با شمارش صدازدن‌ها. */
function fakePasswords() {
  const calls = { hash: 0, verify: 0, dummy: 0 };
  const passwords: Passwords = {
    async hash(password) {
      calls.hash += 1;
      return `hashed:${normalizePassword(password)}`;
    },
    async verify(passwordHash, password) {
      calls.verify += 1;
      return passwordHash === `hashed:${normalizePassword(password)}`;
    },
    async dummyVerify() {
      calls.dummy += 1;
      return false;
    },
  };
  return { passwords, calls };
}

describe('ورود پنل و ادمین‌ها', () => {
  let clock: Date;
  let store: ReturnType<typeof memoryAdminStore>;
  let fake: ReturnType<typeof fakePasswords>;
  let auth: ReturnType<typeof createAdminAuth>;
  const logs: string[] = [];

  const build = (key = KEY) =>
    createAdminAuth({
      store,
      passwords: fake.passwords,
      secretsKey: key,
      secret: SECRET,
      now: () => clock,
      log: (message) => logs.push(message),
    });

  beforeEach(() => {
    clock = new Date('2026-10-05T07:50:00Z');
    store = memoryAdminStore();
    fake = fakePasswords();
    logs.length = 0;
    auth = build();
  });

  const later = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const codeOf = (secret: string) => totpAt(base32Decode(secret), clock);

  async function enroll(username: string, role?: 'owner' | 'operator') {
    const issued = await auth.serverInvite({ username, ...(role ? { role } : {}) });
    if (!issued.ok) throw new Error(issued.error);
    const info = await auth.inviteInfo(issued.value.token);
    if (!info.ok) throw new Error(info.error);
    const done = await auth.completeInvite(
      issued.value.token,
      { password: PASSWORD, confirm: PASSWORD, code: codeOf(info.value.secret) },
      IP,
    );
    if (!done.ok) throw new Error(done.error);
    const session = (await auth.authenticate(done.value.token)) as AdminSession;
    return { userId: issued.value.userId, secret: info.value.secret, token: done.value.token, session };
  }

  const login = (username: string, secret: string, over: { password?: string; code?: string; ip?: string } = {}) =>
    auth.login({ username, password: over.password ?? PASSWORD, code: over.code ?? codeOf(secret) }, over.ip ?? IP);

  describe('پیوند ثبت', () => {
    it('اولین ادمین با دستور سرور مالک است؛ پیوند ۱۵ دقیقه، رمز برنامهٔ تأیید مهروموم‌شده', async () => {
      const issued = await auth.serverInvite({ username: 'Sara', displayName: 'سارا رضایي' });
      expect(issued).toMatchObject({ ok: true, value: { username: 'sara', reset: false } });
      if (!issued.ok) return;
      expect(issued.value.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(issued.value.expiresAt).toEqual(new Date(clock.getTime() + INVITE));
      expect(store.roles.get(issued.value.userId)).toEqual(['owner']);
      expect(store.users.get(issued.value.userId)).toMatchObject({ displayName: 'سارا رضایی', passwordHash: null, createdBy: null });

      const info = await auth.inviteInfo(issued.value.token);
      expect(info).toMatchObject({ ok: true, value: { username: 'sara', role: 'owner', creatorName: null, reset: false } });
      if (!info.ok) return;
      expect(info.value.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(info.value.otpauth).toContain(`secret=${info.value.secret}`);
      // در پایگاه داده فقط مهروموم‌شده، و توکن فقط هش.
      const [row] = store.invites;
      expect(row!.totpSealed).toMatch(/^v1\./);
      expect(row!.totpSealed).not.toContain(info.value.secret);
      expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row!.tokenHash).not.toBe(issued.value.token);
    });

    it('پیوند تا ۱۵ دقیقه کار می‌کند و نه بعدش', async () => {
      const issued = await auth.serverInvite({ username: 'sara' });
      if (!issued.ok) throw new Error();
      later(INVITE - 1);
      expect((await auth.inviteInfo(issued.value.token)).ok).toBe(true);
      later(1);
      expect(await auth.inviteInfo(issued.value.token)).toMatchObject({ ok: false, status: 410, error: 'invite_invalid' });
      expect(await auth.inviteInfo('x'.repeat(43))).toMatchObject({ ok: false, error: 'invite_invalid' });
      expect(await auth.inviteInfo('not-a-token')).toMatchObject({ ok: false, error: 'invite_invalid' });
    });

    it('ثبت: رمز دست‌کم ۱۲ و حداکثر ۲۰۰ نویسه، تکرار برابر، نه خود نام کاربری، و کد برنامه', async () => {
      const issued = await auth.serverInvite({ username: 'administrator' });
      if (!issued.ok) throw new Error();
      const info = await auth.inviteInfo(issued.value.token);
      if (!info.ok) throw new Error();
      const complete = (password: string, over: { confirm?: string; code?: string } = {}) =>
        auth.completeInvite(
          issued.value.token,
          { password, confirm: over.confirm ?? password, code: over.code ?? codeOf(info.value.secret) },
          IP,
        );

      expect(await complete('a'.repeat(PASSWORD_MIN - 1))).toMatchObject({ ok: false, error: 'password_too_short' });
      expect(await complete('a'.repeat(PASSWORD_MAX + 1))).toMatchObject({ ok: false, error: 'password_too_long' });
      expect(await complete(PASSWORD, { confirm: `${PASSWORD}.` })).toMatchObject({ ok: false, error: 'password_mismatch' });
      expect(await complete('Administrator')).toMatchObject({ ok: false, error: 'password_is_username' });
      const wrong = codeOf(info.value.secret) === '000000' ? '111111' : '000000';
      expect(await complete(PASSWORD, { code: wrong })).toMatchObject({ ok: false, status: 400, error: 'wrong_code' });
      expect(fake.calls.hash).toBe(0);

      // مرزها پذیرفته‌اند (شاهد): ۲۰۰ نویسه، و ۱۲ نویسه با ارقام فارسی در کد.
      expect(await complete('a'.repeat(PASSWORD_MAX), { code: toPersianDigits(codeOf(info.value.secret)) })).toMatchObject({ ok: true });
      expect(fake.calls.hash).toBe(1);
      expect(await complete('b'.repeat(PASSWORD_MIN))).toMatchObject({ ok: false, error: 'invite_invalid' });
    });

    it('ثبت: رمز برنامه به ردیف ادمین می‌رود، با مهر خود او؛ نشست تازه ۱۲ ساعته؛ پیوند مصرف شد', async () => {
      const { userId, secret, token, session } = await enroll('sara');
      const user = store.users.get(userId)!;
      expect(user.passwordHash).toBe(`hashed:${PASSWORD}`);
      expect(unseal(KEY, user.totpSealed!, userTotpContext(userId))).toBe(secret);
      expect(() => unseal(KEY, user.totpSealed!, userTotpContext('other'))).toThrow();
      expect(session).toMatchObject({ username: 'sara', roles: ['owner'] });
      expect(session.expiresAt).toEqual(new Date(clock.getTime() + SESSION));
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(store.sessions[0]!.tokenHash).not.toBe(token);
      expect(store.invites[0]!.usedAt).toEqual(clock);
      expect(store.events.map((e) => e.action)).toEqual(['admins.invite', 'admins.enroll', 'auth.login']);
    });
  });

  describe('ورود', () => {
    it('نام، رمز و کد با هم؛ نام با حروف بزرگ و فاصله هم؛ نشست ۱۲ ساعته', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      const result = await login('  SARA ', secret);
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(result.value.expiresAt).toEqual(new Date(clock.getTime() + SESSION));
      expect(await auth.authenticate(result.value.token)).toMatchObject({ username: 'sara', roles: ['owner'] });
      expect(store.attempts.at(-1)).toMatchObject({ username: 'sara', ok: true });
      expect(store.events.at(-1)).toMatchObject({ action: 'auth.login' });
    });

    it('هر شکست یک پیام: رمز، کد، نام ناشناس، ادمین غیرفعال، و ادمینی که هنوز ثبت نکرده', async () => {
      const { secret } = await enroll('sara');
      await enroll('mina', 'owner');
      await auth.serverInvite({ username: 'reza', role: 'operator' });
      later(STEP);
      const generic = { ok: false, status: 401, error: 'invalid_credentials' };
      expect(await login('sara', secret, { password: `${PASSWORD}!` })).toEqual(generic);
      expect(await login('sara', secret, { code: codeOf(secret) === '123456' ? '654321' : '123456' })).toEqual(generic);
      expect(await login('nobody', secret)).toEqual(generic);
      expect(await login('reza', secret)).toEqual(generic);
      const mina = [...store.users.values()].find((u) => u.username === 'mina')!;
      mina.disabledAt = clock;
      expect(await login('mina', secret)).toEqual(generic);
      expect(await login('', secret)).toEqual(generic);

      // نام ناشناس و ادمین بی کد ورود هم یک سنجش argon2 می‌خورند، تا زمان پاسخ چیزی نگوید.
      expect(fake.calls.dummy).toBe(4);
      const reasons = store.events.filter((e) => e.action === 'auth.login_failed').map((e) => e.detail);
      expect(reasons).toEqual([
        { username: 'sara', reason: 'password' },
        { username: 'sara', reason: 'code' },
        { username: 'nobody', reason: 'unknown' },
        { username: 'reza', reason: 'not_enrolled' },
        { username: 'mina', reason: 'disabled' },
        { username: '', reason: 'unknown' },
      ]);
      expect(store.events.filter((e) => e.action === 'auth.login_failed').every((e) => e.adminUserId === null)).toBe(true);
      // شاهد: همان نام و رمز و کد درست وارد می‌شود.
      expect(await login('sara', secret)).toMatchObject({ ok: true });
    });

    it('هر کد یک بار: همان کد با رمز درست هم دوباره پذیرفته نیست؛ کد گام بعد هست', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      const first = await login('sara', secret);
      expect(first.ok).toBe(true);
      later(10_000);
      expect(await login('sara', secret, { code: totpAt(base32Decode(secret), new Date(clock.getTime() - 10_000)) })).toMatchObject({
        ok: false,
        error: 'invalid_credentials',
      });
      expect(store.events.at(-1)!.detail).toEqual({ username: 'sara', reason: 'replay' });
      later(STEP);
      expect(await login('sara', secret)).toMatchObject({ ok: true });
      // کد گام پیشین، هرچند در بازهٔ ±۳۰ ثانیه، بعد از گامی تازه‌تر پذیرفته نیست.
      later(STEP);
      expect(
        await login('sara', secret, { code: totpAt(base32Decode(secret), new Date(clock.getTime() - STEP)) }),
      ).toMatchObject({ ok: false, error: 'invalid_credentials' });
    });

    it('کد با ارقام فارسی و فاصله پذیرفته است', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      const code = codeOf(secret);
      expect(await login('sara', secret, { code: ` ${toPersianDigits(code.slice(0, 3))} ${code.slice(3)} ` })).toMatchObject({
        ok: true,
      });
    });

    it('پنج اشتباه پشت‌سرهم حساب را ۱۵ دقیقه می‌بندد، حتی برای رمز و کد درست', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      for (let i = 1; i < MAX_FAILURES; i += 1) {
        expect(await login('sara', secret, { password: 'wrong password!' })).toMatchObject({ ok: false, error: 'invalid_credentials' });
      }
      const locked = await login('sara', secret, { password: 'wrong password!' });
      expect(locked).toEqual({ ok: false, status: 423, error: 'account_locked', lockedUntil: new Date(clock.getTime() + LOCK) });
      const lockedUntil = new Date(clock.getTime() + LOCK);
      expect(store.events.at(-1)!.detail).toEqual({ username: 'sara', reason: 'password', locked: true });

      const verifies = fake.calls.verify;
      later(LOCK - 1);
      expect(await login('sara', secret)).toEqual({ ok: false, status: 423, error: 'account_locked', lockedUntil });
      expect(fake.calls.verify).toBe(verifies);
      later(1);
      expect(await login('sara', secret)).toMatchObject({ ok: true });
    });

    it('ورود درست شمار را صفر می‌کند: چهار اشتباه، ورود، چهار اشتباه دیگر، و هنوز باز (شاهد)', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      for (let i = 1; i < MAX_FAILURES; i += 1) await login('sara', secret, { password: 'wrong password!' });
      expect(await login('sara', secret)).toMatchObject({ ok: true });
      later(STEP);
      for (let i = 1; i < MAX_FAILURES; i += 1) {
        expect(await login('sara', secret, { password: 'wrong password!' })).toMatchObject({ error: 'invalid_credentials' });
      }
      expect(await login('sara', secret)).toMatchObject({ ok: true });
    });

    it('هر IP ۳۰ تلاش در ساعت؛ سی‌ویکمی حتی درست نه؛ IP دیگر و ساعت بعد آری', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      const start = clock.getTime();
      for (let i = 0; i < IP_LIMIT; i += 1) {
        expect(await login(`nobody${i}`, secret)).toMatchObject({ ok: false, error: 'invalid_credentials' });
      }
      expect(await login('sara', secret)).toEqual({ ok: false, status: 429, error: 'too_many_attempts' });
      expect(await login('sara', secret, { ip: '9.9.9.9' })).toMatchObject({ ok: true });
      clock = new Date(start + HOUR - 1);
      expect(await login('sara', secret)).toMatchObject({ ok: false, error: 'too_many_attempts' });
      clock = new Date(start + HOUR);
      expect(await login('sara', secret)).toMatchObject({ ok: true });
    });

    it('IP فقط HMAC است، و رمز و کد در هیچ ردیفی نیستند', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      const code = codeOf(secret);
      await login('sara', secret, { password: 'wrong password!' });
      await login('sara', secret, { code });
      const dump = JSON.stringify({ attempts: store.attempts, events: store.events, sessions: store.sessions, users: [...store.users.values()] });
      expect(store.attempts.every((a) => /^[0-9a-f]{64}$/.test(a.ipHash))).toBe(true);
      expect(dump).not.toContain(IP);
      expect(dump).not.toContain('wrong password!');
      expect(dump).not.toContain(code);
      expect(dump).not.toContain(secret);
    });

    it('SECRETS_KEY دیگر: ورود ۵۰۳ با پیام روشن در لاگ، نه ورود و نه «رمز اشتباه»', async () => {
      const { secret } = await enroll('sara');
      later(STEP);
      auth = build(OTHER_KEY);
      expect(await login('sara', secret)).toEqual({ ok: false, status: 503, error: 'unavailable' });
      expect(logs.join('\n')).toContain('SECRETS_KEY');
      auth = build(KEY);
      expect(await login('sara', secret)).toMatchObject({ ok: true });
    });
  });

  describe('نشست', () => {
    it('۱ ساعت بی‌کاری می‌بندد؛ ۵۹ دقیقه نه (شاهد)', async () => {
      const { token } = await enroll('sara');
      later(IDLE - 1);
      expect(await auth.authenticate(token)).not.toBeNull();
      later(IDLE - 1);
      expect(await auth.authenticate(token)).not.toBeNull();
      later(IDLE);
      expect(await auth.authenticate(token)).toBeNull();
    });

    it('۱۲ ساعت می‌بندد، حتی با کار پیوسته', async () => {
      const { token } = await enroll('sara');
      const start = clock.getTime();
      while (clock.getTime() + 50 * MINUTE < start + SESSION) {
        later(50 * MINUTE);
        expect(await auth.authenticate(token)).not.toBeNull();
      }
      clock = new Date(start + SESSION - 1);
      expect(await auth.authenticate(token)).not.toBeNull();
      clock = new Date(start + SESSION);
      expect(await auth.authenticate(token)).toBeNull();
    });

    it('«آخرین دیدن» حداکثر دقیقه‌ای یک بار نوشته می‌شود', async () => {
      const { token } = await enroll('sara');
      const created = store.sessions[0]!.lastSeenAt;
      later(MINUTE - 1);
      await auth.authenticate(token);
      expect(store.sessions[0]!.lastSeenAt).toEqual(created);
      later(1);
      await auth.authenticate(token);
      expect(store.sessions[0]!.lastSeenAt).toEqual(clock);
    });

    it('بیرون رفتن فقط همین نشست را می‌بندد، با رویداد', async () => {
      const { secret, token } = await enroll('sara');
      later(STEP);
      const other = await login('sara', secret);
      await auth.logout(token, IP);
      expect(await auth.authenticate(token)).toBeNull();
      expect(await auth.authenticate(other.ok ? other.value.token : '')).not.toBeNull();
      expect(store.events.at(-1)).toMatchObject({ action: 'auth.logout' });
      await auth.logout('bad', IP);
      await auth.logout(null, IP);
    });

    it('توکن بدشکل یا ناشناس هیچ است', async () => {
      await enroll('sara');
      expect(await auth.authenticate(undefined)).toBeNull();
      expect(await auth.authenticate('short')).toBeNull();
      expect(await auth.authenticate('x'.repeat(43))).toBeNull();
    });
  });

  describe('کار حساس و ادمین‌ها', () => {
    it('افزودن متصدی: کد تازه؛ پیوند یک‌باره با نام سازنده؛ متصدی فقط مجوزهای خودش', async () => {
      const sara = await enroll('sara');
      later(STEP);
      const invited = await auth.inviteAdmin(
        sara.session,
        { username: 'reza', displayName: ' رضا  کریمي ', role: 'operator', code: codeOf(sara.secret) },
        IP,
      );
      expect(invited).toMatchObject({ ok: true, value: { username: 'reza', reset: false } });
      if (!invited.ok) return;
      const info = await auth.inviteInfo(invited.value.token);
      expect(info).toMatchObject({ ok: true, value: { displayName: 'رضا کریمی', role: 'operator', creatorName: 'sara' } });
      if (!info.ok) return;
      const done = await auth.completeInvite(
        invited.value.token,
        { password: PASSWORD, confirm: PASSWORD, code: codeOf(info.value.secret) },
        IP,
      );
      if (!done.ok) throw new Error(done.error);
      const reza = await auth.authenticate(done.value.token);
      expect(reza).toMatchObject({ roles: ['operator'], permissions: OPERATOR_PERMISSIONS });

      later(STEP);
      expect(
        await auth.inviteAdmin(reza!, { username: 'ali', displayName: 'علی', role: 'operator', code: codeOf(info.value.secret) }, IP),
      ).toEqual({ ok: false, status: 403, error: 'forbidden' });
      expect(await auth.listAdmins(reza!)).toMatchObject({ ok: false, error: 'forbidden' });
      expect(await auth.listEvents(reza!, {})).toMatchObject({ ok: false, error: 'forbidden' });
    });

    it('فیلد نادرست و نام تکراری پیش از کد رد می‌شوند و کد را هدر نمی‌دهند', async () => {
      const sara = await enroll('sara');
      later(STEP);
      const code = codeOf(sara.secret);
      const form = { username: 'reza', displayName: 'رضا', role: 'operator', code };
      expect(await auth.inviteAdmin(sara.session, { ...form, username: 'Re' }, IP)).toMatchObject({ error: 'invalid_username' });
      expect(await auth.inviteAdmin(sara.session, { ...form, username: 'رضا' }, IP)).toMatchObject({ error: 'invalid_username' });
      expect(await auth.inviteAdmin(sara.session, { ...form, displayName: '  ' }, IP)).toMatchObject({ error: 'invalid_display_name' });
      expect(await auth.inviteAdmin(sara.session, { ...form, role: 'printer' }, IP)).toMatchObject({ error: 'invalid_role' });
      expect(await auth.inviteAdmin(sara.session, { ...form, username: 'sara' }, IP)).toMatchObject({ status: 409, error: 'username_taken' });
      expect(store.users.get(sara.userId)!.failedAttempts).toBe(0);
      expect(await auth.inviteAdmin(sara.session, form, IP)).toMatchObject({ ok: true });
    });

    it('کد ورود هم در کار حساس پذیرفته نیست (یک بار)؛ کد بعدی هست', async () => {
      const sara = await enroll('sara');
      const form = { username: 'reza', displayName: 'رضا', role: 'owner', code: codeOf(sara.secret) };
      expect(await auth.inviteAdmin(sara.session, form, IP)).toEqual({ ok: false, status: 400, error: 'code_used' });
      later(STEP);
      expect(await auth.inviteAdmin(sara.session, { ...form, code: codeOf(sara.secret) }, IP)).toMatchObject({ ok: true });
    });

    it('پنج کد اشتباه در کار حساس: نشست‌ها بسته و ورود ۱۵ دقیقه قفل', async () => {
      const sara = await enroll('sara');
      later(STEP);
      const wrong = codeOf(sara.secret) === '000000' ? '111111' : '000000';
      const form = { username: 'reza', displayName: 'رضا', role: 'operator', code: wrong };
      for (let i = 1; i < MAX_FAILURES; i += 1) {
        expect(await auth.inviteAdmin(sara.session, form, IP)).toEqual({ ok: false, status: 400, error: 'wrong_code' });
      }
      expect(await auth.authenticate(sara.token)).not.toBeNull();
      expect(await auth.inviteAdmin(sara.session, form, IP)).toMatchObject({ ok: false, status: 423, error: 'account_locked' });
      expect(await auth.authenticate(sara.token)).toBeNull();
      expect(store.events.filter((e) => e.action === 'auth.code_failed')).toHaveLength(MAX_FAILURES);
      later(LOCK - 1);
      expect(await login('sara', sara.secret)).toMatchObject({ ok: false, status: 423 });
      later(1);
      expect(await login('sara', sara.secret)).toMatchObject({ ok: true });
    });

    it('کد درست در کار حساس شمار را صفر می‌کند (شاهد: چهار اشتباه، یک درست، چهار اشتباه و هنوز باز)', async () => {
      const sara = await enroll('sara');
      later(STEP);
      const wrong = codeOf(sara.secret) === '000000' ? '111111' : '000000';
      const form = (code: string, username = 'reza') => ({ username, displayName: 'رضا', role: 'operator', code });
      for (let i = 1; i < MAX_FAILURES; i += 1) await auth.inviteAdmin(sara.session, form(wrong), IP);
      expect(await auth.inviteAdmin(sara.session, form(codeOf(sara.secret)), IP)).toMatchObject({ ok: true });
      later(STEP);
      for (let i = 1; i < MAX_FAILURES; i += 1) {
        expect(await auth.inviteAdmin(sara.session, form(wrong, 'ali'), IP)).toMatchObject({ error: 'wrong_code' });
      }
      expect(await auth.authenticate(sara.token)).not.toBeNull();
    });

    it('کد ورود تازه: رمز و برنامهٔ قبلی و نشست‌ها باطل؛ برای خود نه', async () => {
      const sara = await enroll('sara');
      const ali = await enroll('ali', 'operator');
      later(STEP);
      expect(await auth.resetAdmin(sara.session, { userId: sara.userId, code: codeOf(sara.secret) }, IP)).toMatchObject({
        error: 'self',
      });
      const reset = await auth.resetAdmin(sara.session, { userId: ali.userId, code: codeOf(sara.secret) }, IP);
      expect(reset).toMatchObject({ ok: true, value: { username: 'ali', reset: true } });
      expect(await auth.authenticate(ali.token)).toBeNull();
      later(STEP);
      expect(await login('ali', ali.secret)).toMatchObject({ ok: false, error: 'invalid_credentials' });
      if (!reset.ok) return;
      const info = await auth.inviteInfo(reset.value.token);
      expect(info).toMatchObject({ ok: true, value: { reset: true, role: 'operator', creatorName: 'sara' } });
      if (!info.ok) return;
      expect(info.value.secret).not.toBe(ali.secret);
      expect(store.roles.get(ali.userId)).toEqual(['operator']);
    });

    it('غیرفعال کردن با کد: نشست‌ها بسته، ورود نه؛ خود نه', async () => {
      const sara = await enroll('sara');
      const ali = await enroll('ali', 'operator');
      later(STEP);
      expect(await auth.disableAdmin(sara.session, { userId: sara.userId, code: codeOf(sara.secret) }, IP)).toMatchObject({
        error: 'self',
      });
      expect(await auth.disableAdmin(sara.session, { userId: ali.userId, code: codeOf(sara.secret) }, IP)).toEqual({
        ok: true,
        value: true,
      });
      expect(await auth.authenticate(ali.token)).toBeNull();
      later(STEP);
      expect(await login('ali', ali.secret)).toMatchObject({ ok: false, error: 'invalid_credentials' });
      expect(await auth.disableAdmin(sara.session, { userId: ali.userId, code: codeOf(sara.secret) }, IP)).toMatchObject({
        error: 'not_found',
      });
      expect(await auth.disableAdmin(sara.session, { userId: 'not-a-uuid', code: '' }, IP)).toMatchObject({ error: 'not_found' });
    });

    it('لغو دعوت بی کد: پیوند دیگر کار نمی‌کند و ادمینی که هرگز ثبت نکرد غیرفعال است', async () => {
      const sara = await enroll('sara');
      later(STEP);
      const invited = await auth.inviteAdmin(
        sara.session,
        { username: 'reza', displayName: 'رضا', role: 'operator', code: codeOf(sara.secret) },
        IP,
      );
      if (!invited.ok) throw new Error();
      expect(await auth.revokeInvite(sara.session, { userId: invited.value.userId }, IP)).toEqual({ ok: true, value: true });
      expect(await auth.inviteInfo(invited.value.token)).toMatchObject({ error: 'invite_invalid' });
      expect(store.users.get(invited.value.userId)!.disabledAt).toEqual(clock);
      expect(await auth.revokeInvite(sara.session, { userId: invited.value.userId }, IP)).toMatchObject({ error: 'not_found' });
    });

    it('فهرست ادمین‌ها و رویدادها برای مالک؛ رویدادها صفحه‌ای ۵۰ تا، با پیشوند', async () => {
      const sara = await enroll('sara');
      later(STEP);
      for (let i = 0; i < 60; i += 1) await login(`nobody${i}`, sara.secret, { ip: `10.0.0.${i}` });
      const admins = await auth.listAdmins(sara.session);
      expect(admins.ok && admins.value.map((a) => a.user.username)).toEqual(['sara']);
      const first = await auth.listEvents(sara.session, {});
      if (!first.ok) throw new Error();
      expect(first.value).toHaveLength(50);
      const next = await auth.listEvents(sara.session, { beforeId: first.value.at(-1)!.id });
      expect(next.ok && next.value).toHaveLength(63 - 50);
      const admin = await auth.listEvents(sara.session, { kind: 'admins' });
      expect(admin.ok && admin.value.map((e) => e.action)).toEqual(['admins.enroll', 'admins.invite']);
      const odd = await auth.listEvents(sara.session, { kind: "a'; --" });
      expect(odd.ok && odd.value).toHaveLength(50);
    });
  });

  describe('دستور سرور', () => {
    it('ادمین موجود: کد ورود تازه با همان نقش؛ ادمین تازه بی نقش صریح مالک؛ نقش نادرست نه', async () => {
      const ali = await enroll('ali', 'operator');
      const again = await auth.serverInvite({ username: 'ali' });
      expect(again).toMatchObject({ ok: true, value: { reset: true, userId: ali.userId } });
      expect(store.roles.get(ali.userId)).toEqual(['operator']);
      expect(await auth.authenticate(ali.token)).toBeNull();
      expect(await auth.serverInvite({ username: 'ali', role: 'owner' })).toMatchObject({ ok: true });
      expect(store.roles.get(ali.userId)).toEqual(['owner']);
      expect(await auth.serverInvite({ username: 'x' })).toMatchObject({ error: 'invalid_username' });
      expect(await auth.serverInvite({ username: 'mina', role: 'root' })).toMatchObject({ error: 'invalid_role' });
      expect(await auth.serverInvite({ username: 'mina', displayName: 'ن'.repeat(101) })).toMatchObject({ error: 'invalid_display_name' });
    });
  });
});
