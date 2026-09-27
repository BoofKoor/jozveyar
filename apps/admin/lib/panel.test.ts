/**
 * تکه‌های خالص پنل: دروازه، سرآیندها، پیکربندی، کوکی، زمان، رویدادها، QR، و برابری قلم و نشانک با سایت.
 * سرویس ورود جدا در `server/auth.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AdminEventView } from '@jozveyar/db';

import { byDay, eventLines } from './events';
import { dayHeading, whenText } from './format';
import { gateOf, panelPath } from './gate';
import { contentSecurityPolicy, originOf, sameOrigin } from './security';
import { adminConfig, configProblems, describeConfig } from './server/config';
import { clientIpOf, cookieName, isSecureRequest, sessionCookieOptions } from './server/cookie';
import { qrPath } from './server/qr';
import { newTotpSecret, otpauthUri } from './server/totp';

const GATE = '/3f9a0c1d2e4b5a69';
const ENV = {
  DATABASE_URL: 'postgresql://x@127.0.0.1/x',
  SESSION_SECRET: 's'.repeat(64),
  SECRETS_KEY: 'ab'.repeat(32),
  ADMIN_BASE_PATH: GATE,
  ADMIN_ORIGIN: 'https://admin.jozveyar.com/',
};
/** «حالا»ی طرح: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);

describe('دروازه', () => {
  it('مسیر محرمانه: دست‌کم ۱۶ نویسهٔ امن، با `/` اول؛ جای‌نگهدار نمونه نه', () => {
    expect(gateOf(GATE)).toBe('3f9a0c1d2e4b5a69');
    expect(gateOf(` ${GATE}\n`)).toBe('3f9a0c1d2e4b5a69');
    expect(gateOf('/abc_DEF-1234567890')).toBe('abc_DEF-1234567890');
    expect(gateOf('/3f9a0c1d2e4b5a6')).toBeNull();
    expect(gateOf('3f9a0c1d2e4b5a69')).toBeNull();
    expect(gateOf('/3f9a0c1d2e4b5a69/')).toBeNull();
    expect(gateOf('/3f9a0c1d/2e4b5a69xx')).toBeNull();
    expect(gateOf('/change-this-secret-path')).toBeNull();
    expect(gateOf(undefined)).toBeNull();
    expect(gateOf('')).toBeNull();
  });

  it('نشانی درون پنل', () => {
    expect(panelPath('g'.repeat(16))).toBe(`/${'g'.repeat(16)}`);
    expect(panelPath('g'.repeat(16), '/admins')).toBe(`/${'g'.repeat(16)}/admins`);
  });
});

describe('سرآیندها', () => {
  it('CSP: فقط اسکریپت با nonce، بی منبع بیرونی، بی قاب؛ build تولیدی بی eval و سبک درون‌خطی', () => {
    const csp = contentSecurityPolicy('abc123');
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toMatch(/unsafe-(eval|inline)/);
    expect(csp).not.toMatch(/https?:/);
    expect(contentSecurityPolicy('x', true)).toContain("'unsafe-eval'");
  });

  it('نوشتن فقط از خود پنل', () => {
    const origin = originOf(ENV.ADMIN_ORIGIN);
    expect(origin).toBe('https://admin.jozveyar.com');
    expect(sameOrigin('https://admin.jozveyar.com', 'x', origin)).toBe(true);
    expect(sameOrigin('https://jozveyar.com', 'admin.jozveyar.com', origin)).toBe(false);
    expect(sameOrigin('http://admin.jozveyar.com', 'admin.jozveyar.com', origin)).toBe(false);
    expect(sameOrigin(null, 'admin.jozveyar.com', origin)).toBe(false);
    // بی ADMIN_ORIGIN: هم‌میزبان با Host.
    expect(sameOrigin('http://127.0.0.1:3200', '127.0.0.1:3200', null)).toBe(true);
    expect(sameOrigin('http://127.0.0.1:3100', '127.0.0.1:3200', null)).toBe(false);
    expect(sameOrigin('null', '127.0.0.1:3200', null)).toBe(false);
    expect(originOf('ftp://x')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });
});

describe('پیکربندی', () => {
  it('کامل: آماده، و خط لاگ مسیر محرمانه را نمی‌گوید', () => {
    expect(configProblems(ENV)).toEqual([]);
    expect(adminConfig(ENV)).toMatchObject({ gate: '3f9a0c1d2e4b5a69', origin: 'https://admin.jozveyar.com' });
    const line = describeConfig(ENV);
    expect(line).toBe('✓ پنل ادمین: آماده روی admin.jozveyar.com');
    expect(line).not.toContain('3f9a0c1d2e4b5a69');
  });

  it('هر کمبود نامش را می‌گوید، نه مقدارش؛ و پنل بسته است', () => {
    const broken = { ...ENV, SESSION_SECRET: 'short', SECRETS_KEY: 'zz', ADMIN_BASE_PATH: '/change-this-secret-path' };
    expect(configProblems(broken)).toHaveLength(3);
    expect(adminConfig(broken)).toBeNull();
    const line = describeConfig(broken);
    expect(line).toMatch(/^✗ پنل ادمین: بسته — /);
    expect(line).toContain('SECRETS_KEY');
    expect(line).not.toContain('short');
    expect(configProblems({})).toHaveLength(4);
    expect(adminConfig({ ...ENV, ADMIN_ORIGIN: undefined })).toMatchObject({ origin: null });
  });
});

describe('کوکی نشست', () => {
  it('روی https `__Host-` با Secure و Path=/ و بی Domain؛ بی https نام ساده', () => {
    const expires = new Date('2026-10-05T19:50:00Z');
    expect(cookieName(true)).toBe('__Host-jy_admin');
    expect(cookieName(false)).toBe('jy_admin');
    expect(sessionCookieOptions(true, expires)).toEqual({ httpOnly: true, secure: true, sameSite: 'strict', path: '/', expires });
    expect(sessionCookieOptions(true, expires)).not.toHaveProperty('domain');
    expect(isSecureRequest(new Headers({ 'x-forwarded-proto': 'https' }))).toBe(true);
    expect(isSecureRequest(new Headers({ 'x-forwarded-proto': 'http' }))).toBe(false);
    expect(isSecureRequest(new Headers())).toBe(false);
  });

  it('IP از X-Real-IP، وگرنه آخرین حلقهٔ X-Forwarded-For', () => {
    expect(clientIpOf(new Headers({ 'x-real-ip': '5.6.7.8', 'x-forwarded-for': '1.1.1.1' }))).toBe('5.6.7.8');
    expect(clientIpOf(new Headers({ 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIpOf(new Headers())).toBe('unknown');
  });
});

describe('زمان پنل', () => {
  it('امروز، دیروز، این سال و سال دیگر، به وقت تهران', () => {
    expect(whenText(tehran('2026-10-05 10:02'), NOW)).toBe('امروز 10:02');
    expect(whenText(tehran('2026-10-04 23:40'), NOW)).toBe('دیروز 23:40');
    expect(whenText(tehran('2026-10-03 09:15'), NOW)).toBe('شنبه 11 مهر 09:15');
    expect(whenText(tehran('2026-03-10 09:15'), NOW)).toBe('19 اسفند 1404 09:15');
    // نیمه‌شب تهران روز را عوض می‌کند، نه نیمه‌شب UTC.
    expect(whenText(tehran('2026-10-05 00:05'), NOW)).toBe('امروز 00:05');
    expect(dayHeading(tehran('2026-10-05 00:05'), NOW)).toBe('امروز، دوشنبه 13 مهر');
    expect(dayHeading(tehran('2026-10-04 12:00'), NOW)).toBe('دیروز، یکشنبه 12 مهر');
    expect(dayHeading(tehran('2026-10-03 12:00'), NOW)).toBe('شنبه 11 مهر');
  });
});

describe('رویدادها', () => {
  let id = 100;
  const event = (action: string, over: Partial<AdminEventView> = {}): AdminEventView => ({
    id: id--,
    at: tehran('2026-10-05 11:00'),
    adminUserId: 'u1',
    action,
    targetType: null,
    targetId: null,
    ipHash: null,
    detail: null,
    username: 'sara',
    displayName: 'سارا',
    ...over,
  });
  const failed = (username: string, reason: string, at = '2026-10-05 03:47', locked = false) =>
    event('auth.login_failed', {
      adminUserId: null,
      username: null,
      displayName: null,
      at: tehran(at),
      detail: { username, reason, ...(locked ? { locked } : {}) },
    });

  it('ورود ناموفق پشت‌سرهم و یکسان یک سطر با شمار؛ دلیل دیگر یا روز دیگر سطر جدا', () => {
    const lines = eventLines([
      event('auth.login'),
      failed('admin', 'unknown'),
      failed('admin', 'unknown'),
      failed('admin', 'unknown'),
      failed('sara', 'code'),
      failed('admin', 'unknown', '2026-10-04 23:00'),
    ]);
    expect(lines.map((l) => [l.badge, l.count, l.who])).toEqual([
      [null, 1, 'سارا'],
      ['login_failed', 3, null],
      ['login_failed', 1, null],
      ['login_failed', 1, null],
    ]);
    expect(lines[1]!.text).toEqual(['با نام کاربری ', { ltr: 'admin' }, '، که چنین کاربری نیست']);
    expect(lines[2]!.text).toEqual(['با نام کاربری ', { ltr: 'sara' }, '؛ رمز درست بود، کد نه']);
    expect(byDay(lines).map((d) => d.lines.length)).toEqual([3, 1]);
  });

  it('کار ادمین‌ها با نام هدف؛ دستور سرور «سرور»', () => {
    const lines = eventLines([
      event('admins.invite', { adminUserId: null, username: null, displayName: null, detail: { username: 'sara', role: 'owner', reset: false } }),
      event('admins.invite', { detail: { username: 'ali', role: null, reset: true } }),
      event('admins.disable', { detail: { username: 'ali' } }),
      event('admins.invite_revoked', { detail: { username: 'reza' } }),
      event('auth.code_failed', { detail: { reason: 'code', locked: true } }),
    ]);
    expect(lines.map((l) => [l.who, l.text])).toEqual([
      ['سرور', ['پیوند ثبت برای ', { ltr: 'sara' }, ' (مالک)', ' ساخته شد']],
      ['سارا', ['کد ورود تازه برای ', { ltr: 'ali' }, ' ساخته شد']],
      ['سارا', [{ ltr: 'ali' }, ' غیرفعال شد']],
      ['سارا', ['دعوت ', { ltr: 'reza' }, ' لغو شد']],
      ['سارا', ['کد نادرست در کار حساس', '؛ حساب قفل و نشست‌ها بسته شد']],
    ]);
  });

  it('کار سفارش‌ها (۴٫۲) با شمارهٔ سفارش، جدا از جملهٔ فارسی؛ جزوهٔ دوم هم گفته می‌شود', () => {
    const lines = eventLines([
      event('orders.pdf_download', { targetType: 'order', detail: { orderNumber: 10027, item: 1 } }),
      event('orders.pdf_rebuild', { targetType: 'order', detail: { orderNumber: 10031, previous: { attempts: 3, error: 'transient' } } }),
      event('orders.pdf_download', { targetType: 'order', detail: { orderNumber: 10040, item: 2 } }),
    ]);
    expect(lines.map((l) => [l.who, l.text])).toEqual([
      ['سارا', ['PDF سفارش ', { ltr: '10027' }, ' دانلود شد']],
      ['سارا', ['ساختن دوبارهٔ PDF سفارش ', { ltr: '10031' }]],
      ['سارا', ['PDF سفارش ', { ltr: '10040' }, ' (جزوهٔ ', { ltr: '2' }, ')', ' دانلود شد']],
    ]);
  });

  it('وضعیت سفارش و گیرنده (۴٫۳): گذار با نام وضعیت‌ها، لغو، و فیلدهای ویرایش‌شده؛ دلیل و نشانی نه', () => {
    const lines = eventLines([
      event('orders.status', { targetType: 'order', detail: { orderNumber: 10027, from: 'paid', to: 'printing' } }),
      event('orders.status', { targetType: 'order', detail: { orderNumber: 10027, from: 'handed_to_post', to: 'printing' } }),
      event('orders.status', { targetType: 'order', detail: { orderNumber: 10031, from: 'printing', to: 'cancelled' } }),
      event('orders.recipient', {
        targetType: 'order',
        detail: { orderNumber: 10027, changed: ['addressText', 'postalCode'], previous: { addressText: 'پلاک 12', postalCode: null } },
      }),
    ]);
    expect(lines.map((l) => [l.who, l.text])).toEqual([
      ['سارا', ['سفارش ', { ltr: '10027' }, ': در صف چاپ ← در حال چاپ']],
      ['سارا', ['سفارش ', { ltr: '10027' }, ': تحویل پست شد ← در حال چاپ']],
      ['سارا', ['سفارش ', { ltr: '10031' }, ' لغو شد']],
      ['سارا', ['گیرندهٔ سفارش ', { ltr: '10027' }, ' ویرایش شد: نشانی، کد پستی']],
    ]);
    expect(JSON.stringify(lines)).not.toContain('پلاک 12');
  });
});

describe('QR', () => {
  it('اندازه: نام کوتاه ۴۱ خانه یا کمتر، مثل طرح؛ بلندترین نام ممکن (۳۲ نویسه) ۴۵', () => {
    expect(qrPath(otpauthUri(newTotpSecret(), 'sara')).size).toBeLessThanOrEqual(41);
    expect(qrPath(otpauthUri(newTotpSecret(), `a${'b'.repeat(31)}`)).size).toBeLessThanOrEqual(45);
  });

  it('هر خانهٔ تیره دقیقاً یک بار کشیده می‌شود؛ الگوهای یافتن گوشه سر جایشان‌اند', () => {
    const { size, d } = qrPath(otpauthUri('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'sara'));
    const runs = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)];
    expect(runs.map((r) => r[0]).join('')).toBe(d);
    // ردیف اول با الگوی یافتن ۷ خانه‌ای شروع و تمام می‌شود.
    expect(d.startsWith('M0 0h7v1h-7z')).toBe(true);
    expect(runs.filter((r) => r[2] === '0').at(-1)![0]).toBe(`M${size - 7} 0h7v1h-7z`);
    // خانه‌ها روی هم نمی‌افتند و از ماتریس بیرون نمی‌زنند.
    const cells = new Set<string>();
    for (const [, x, y, n] of runs) {
      for (let i = 0; i < Number(n); i += 1) {
        const cell = `${Number(x) + i},${y}`;
        expect(cells.has(cell)).toBe(false);
        cells.add(cell);
        expect(Number(x) + i).toBeLessThan(size);
      }
    }
  });
});

describe('دارایی‌ها', () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)));

  it('قلم پنل همان قلم سایت است، و نشانک همان favicon برند', () => {
    for (const file of ['Vazirmatn-Regular.woff2', 'Vazirmatn-SemiBold.woff2', 'Vazirmatn-OFL.txt']) {
      expect(read(`../public/fonts/${file}`).equals(read(`../../web/public/fonts/${file}`))).toBe(true);
    }
    expect(read('../public/icon.svg').equals(read('../../../docs/brand/jozveyar-favicon.svg'))).toBe(true);
  });
});
