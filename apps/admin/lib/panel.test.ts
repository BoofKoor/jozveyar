/**
 * تکه‌های خالص پنل: دروازه، سرآیندها، پیکربندی، کوکی، زمان، رویدادها، QR، و برابری قلم و نشانک با سایت.
 * سرویس ورود جدا در `server/auth.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { AdminEventView } from '@jozveyar/db';

import { byDay, EVENT_KINDS, eventLines } from './events';
import { dayHeading, dayText, whenText } from './format';
import { gateOf, panelPath } from './gate';
import { roleLabel } from './messages';
import { contentSecurityPolicy, originOf, sameOrigin } from './security';
import { adminConfig, configProblems, describeConfig, describePayments, panelMockGateway } from './server/config';
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

  it('درگاه‌های پنل (۷٫۲): زیبال همیشه؛ درگاه نمونه فقط با CHECKOUT_MODE=mock، همان دیوار وب؛ خط لاگ بی مقدار، با راه بازپرداخت (۷٫۳)', () => {
    expect(panelMockGateway({})).toBe(false);
    expect(panelMockGateway({ CHECKOUT_MODE: 'off' })).toBe(false);
    expect(panelMockGateway({ CHECKOUT_MODE: 'live' })).toBe(false);
    expect(panelMockGateway({ CHECKOUT_MODE: ' MOCK ' })).toBe(true);
    expect(describePayments({ PAYMENT_MERCHANT_ID: 'merchant-secret-value', PAYMENT_CALLBACK_URL: 'https://jozveyar.com/pay/callback' })).toBe(
      '✓ پنل ادمین: درگاه زیبال (نشانی پیش‌فرض زیبال) برای «استعلام از درگاه»؛ PAYMENT_CALLBACK_URL هست؛ بازپرداخت فقط ثبت دستی',
    );
    expect(describePayments({ CHECKOUT_MODE: 'mock', ZIBAL_API_URL: 'http://127.0.0.1:3400' })).toBe(
      '✓ پنل ادمین: درگاه زیبال (ZIBAL_API_URL) و درگاه نمونه برای «استعلام از درگاه»؛ PAYMENT_CALLBACK_URL نیست، پس «آزمایش» کد پذیرنده نه؛ بازپرداخت از درگاه نمونه، با استعلام خودکار',
    );
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
    // روز پستِ فایل پست ساعت ندارد (۶٫۱): پایان روز تهران فقط همان روز است.
    expect(dayText(tehran('2026-10-05 00:05'), NOW)).toBe('امروز');
    expect(dayText(tehran('2026-10-04 23:59'), NOW)).toBe('دیروز');
    expect(dayText(tehran('2026-10-03 23:59'), NOW)).toBe('شنبه 11 مهر');
    expect(dayText(tehran('2026-03-10 23:59'), NOW)).toBe('19 اسفند 1404');
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

  it('پیوند ثبت کاربر چاپخانه (۵٫۳) با نام چاپخانه، همان طرح: «(چاپخانه، چاپ نور)»؛ کار خودش با نام خودش', () => {
    const lines = eventLines([
      event('admins.invite', {
        detail: { username: 'hasan.noor', role: 'print_partner', partner: { id: 'p2', name: 'چاپ نور' }, reset: false },
      }),
      event('orders.status', {
        username: 'hasan.noor',
        displayName: 'حسن نوری',
        detail: { orderNumber: 10027, from: 'paid', to: 'printing' },
      }),
    ]);
    expect(lines.map((l) => [l.who, l.text])).toEqual([
      ['سارا', ['پیوند ثبت برای ', { ltr: 'hasan.noor' }, ' (چاپخانه، چاپ نور)', ' ساخته شد']],
      ['حسن نوری', ['سفارش ', { ltr: '10027' }, ': در صف چاپ ← در حال چاپ']],
    ]);
  });

  it('کار سفارش‌ها (۴٫۲، و از ۵٫۱ فایل چاپ و برگه) با شمارهٔ سفارش، جدا از جملهٔ فارسی؛ جزوهٔ دوم و جلد هم گفته می‌شوند', () => {
    const lines = eventLines([
      event('orders.pdf_download', { targetType: 'order', detail: { orderNumber: 10027, item: 1 } }),
      event('orders.pdf_rebuild', { targetType: 'order', detail: { orderNumber: 10031, previous: { attempts: 3, error: 'transient' } } }),
      event('orders.pdf_download', { targetType: 'order', detail: { orderNumber: 10040, item: 2 } }),
      event('orders.print_download', { targetType: 'order', detail: { orderNumber: 10040, item: 1, volume: 2, volumes: 2 } }),
      event('orders.print_download', { targetType: 'order', detail: { orderNumber: 10027, item: 1, volume: 1, volumes: 1 } }),
      event('orders.ticket_download', { targetType: 'order', detail: { orderNumber: 10027 } }),
      event('orders.ticket_rebuild', { targetType: 'order', detail: { orderNumber: 10027, previous: null } }),
    ]);
    expect(lines.map((l) => [l.who, l.text])).toEqual([
      ['سارا', ['PDF اصلی سفارش ', { ltr: '10027' }, ' دانلود شد']],
      ['سارا', ['ساختن دوبارهٔ فایل چاپ سفارش ', { ltr: '10031' }]],
      ['سارا', ['PDF اصلی سفارش ', { ltr: '10040' }, ' (جزوهٔ ', { ltr: '2' }, ')', ' دانلود شد']],
      ['سارا', ['فایل چاپ سفارش ', { ltr: '10040' }, ' جلد ', { ltr: '2' }, ' دانلود شد']],
      ['سارا', ['فایل چاپ سفارش ', { ltr: '10027' }, ' دانلود شد']],
      ['سارا', ['برگهٔ سفارش ', { ltr: '10027' }, ' دانلود شد']],
      ['سارا', ['ساختن دوبارهٔ برگهٔ سفارش ', { ltr: '10027' }]],
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

  it('تعرفه (۴٫۵): پیش‌نویس ساخته، ذخیره و پاک شد؛ فعال شدن و برگشت، با شمارهٔ نسخه جدا از جملهٔ فارسی', () => {
    const tariff = (action: string, detail: Record<string, unknown>) => event(action, { targetType: 'price_list', detail });
    const lines = eventLines([
      tariff('tariff.draft', { version: 2, from: 1 }),
      tariff('tariff.draft_save', { version: 2 }),
      tariff('tariff.activate', { version: 2, previous: 1, again: false }),
      tariff('tariff.activate', { version: 1, previous: 2, again: true }),
      tariff('tariff.draft_delete', { version: 3 }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      ['پیش‌نویس نسخهٔ ', { ltr: '2' }, ' تعرفه ساخته شد، از روی نسخهٔ ', { ltr: '1' }],
      ['پیش‌نویس نسخهٔ ', { ltr: '2' }, ' تعرفه ذخیره شد'],
      ['نسخهٔ ', { ltr: '2' }, ' تعرفه فعال شد', '، به جای نسخهٔ ', { ltr: '1' }],
      ['نسخهٔ ', { ltr: '1' }, ' تعرفه دوباره فعال شد', '، به جای نسخهٔ ', { ltr: '2' }],
      ['پیش‌نویس نسخهٔ ', { ltr: '3' }, ' تعرفه پاک شد'],
    ]);
  });

  it('تنظیمات و کلیدها (۴٫۶): عددها و تاریخ جدا از جملهٔ فارسی؛ کلید با نامش، هرگز مقدارش؛ چیپ به ترتیب طرح', () => {
    const setting = (action: string, detail: Record<string, unknown>) => event(action, { targetType: 'setting', detail });
    const key = (action: string, detail: Record<string, unknown>) => event(action, { targetType: 'service_key', detail });
    const lines = eventLines([
      setting('settings.update', { key: 'order.sla_days', from: 2, to: 3 }),
      setting('settings.update', { key: 'otp.site_hourly_limit', from: 300, to: 1500 }),
      setting('settings.update', { key: 'order.files_retention_days', from: 30, to: 45 }),
      setting('settings.update', { key: 'calendar.official_through', from: 1405, to: 1406 }),
      setting('settings.update', { key: 'report.weight_bands', from: 'tariff', to: [750, 1500, 3000] }),
      setting('settings.update', { key: 'report.weight_bands', from: [2000], to: 'tariff' }),
      setting('settings.holiday_add', { date: '1406/04/01', title: 'آزمایش' }),
      setting('settings.holiday_remove', { date: '1405/10/02', title: 'ولادت امام علی (ع) / روز پدر' }),
      key('settings.key_set', { name: 'PAYMENT_MERCHANT_ID', from: 'env' }),
      key('settings.key_set', { name: 'SMS_OTP_TEMPLATE', from: 'empty' }),
      key('settings.key_revert', { name: 'SMS_API_KEY', to: 'env' }),
      // ۷٫۱: آزمایش کلید و ذخیره با نتیجهٔ آزمایش؛ سقف ۲۴ ساعته و هشدار اعتبار.
      key('settings.key_test', { name: 'SMS_API_KEY', subject: 'current', outcome: 'ok', credit: 184_200 }),
      key('settings.key_test', { name: 'SMS_API_KEY', subject: 'new', outcome: 'rejected', http: 401 }),
      key('settings.key_test', { name: 'SMS_PAID_TEMPLATE', subject: 'new', outcome: 'ok', mobile: '0912 ••• 6789' }),
      key('settings.key_test', { name: 'SMS_TRACKING_TEMPLATE', subject: 'current', outcome: 'unavailable', mobile: '0912 ••• 6789' }),
      key('settings.key_set', { name: 'SMS_PAID_TEMPLATE', from: 'empty', tested: 'ok' }),
      key('settings.key_set', { name: 'SMS_API_KEY', from: 'env', tested: 'skipped' }),
      setting('settings.update', { key: 'otp.site_daily_limit', from: 2000, to: 3000 }),
      setting('settings.update', { key: 'sms.credit_alert_days', from: 7, to: 10 }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      ['روز کاری تحویل به پست: ', { ltr: '2' }, ' ← ', { ltr: '3' }],
      ['سقف ساعتی کد پیامکی کل سایت: ', { ltr: '300' }, ' ← ', { ltr: '1,500' }],
      ['روزهای نگهداری فایل‌های سفارش: ', { ltr: '30' }, ' ← ', { ltr: '45' }],
      ['تعطیلی‌های ', { ltr: '1406' }, ' با تقویم رسمی تطبیق داده شد'],
      [
        'بازه‌های وزن گزارش ارسال: ',
        'بازه‌های کرایهٔ تعرفه',
        ' ← ',
        { ltr: '750' },
        '، ',
        { ltr: '1,500' },
        ' و ',
        { ltr: '3,000' },
        ' گرم',
      ],
      ['بازه‌های وزن گزارش ارسال: ', { ltr: '2' }, ' کیلو', ' ← ', 'بازه‌های کرایهٔ تعرفه'],
      ['تعطیلی ', { ltr: '1406/04/01' }, ' افزوده شد: آزمایش'],
      ['تعطیلی ', { ltr: '1405/10/02' }, ' حذف شد: ولادت امام علی (ع) / روز پدر'],
      ['کلید «کد پذیرندهٔ زیبال» عوض شد'],
      ['کلید «شناسهٔ قالب کد تأیید» وارد شد'],
      ['کلید «کلید API sms.ir» به ', { ltr: '.env' }, ' برگشت'],
      ['کلید «کلید API sms.ir» آزمایش شد', ': ', 'درست'],
      ['کلید «کلید API sms.ir» (مقدار تازه) آزمایش شد', ': ', 'رد شد (کد ', { ltr: '401' }, ')'],
      ['کلید «شناسهٔ قالب پیامک پرداخت» (مقدار تازه) آزمایش شد', ' با پیامک به ', { ltr: '0912 ••• 6789' }, ': ', 'درست'],
      ['کلید «شناسهٔ قالب پیامک رهگیری» آزمایش شد', ' با پیامک به ', { ltr: '0912 ••• 6789' }, ': ', 'sms.ir جواب نداد'],
      ['کلید «شناسهٔ قالب پیامک پرداخت» پس از پیامک آزمایشی وارد شد'],
      ['کلید «کلید API sms.ir»، بی آزمایش عوض شد'],
      ['سقف کد پیامکی کل سایت در 24 ساعت: ', { ltr: '2,000' }, ' ← ', { ltr: '3,000' }],
      ['هشدار اعتبار پیامک (روز مصرف): ', { ltr: '7' }, ' ← ', { ltr: '10' }],
    ]);
    // هیچ سطری مقدار کلید ندارد: فقط نام، نتیجه و موبایل پوشیده.
    expect(JSON.stringify(lines)).not.toMatch(/09\d{9}/);
    expect(EVENT_KINDS.map((k) => k.label)).toEqual([
      'همه',
      'ورود',
      'سفارش',
      'پرداخت و بازپرداخت',
      'ارسال',
      'تعرفه',
      'تنظیمات و کلیدها',
      'چاپخانه‌ها',
      'ادمین‌ها',
    ]);
    expect(EVENT_KINDS.map((k) => k.kind)).toEqual(['', 'auth', 'orders', 'payments', 'shipments', 'tariff', 'settings', 'partners', 'admins']);
  });

  it('ارسال (۶٫۱): بارگذاری، ثبت با شمارها و سفارش‌هایی که تحویل پست شدند، دور انداختن، و برگرداندن با دلیل', () => {
    const imported = (action: string, detail: Record<string, unknown>) => event(action, { targetType: 'shipment_import', detail });
    const lines = eventLines([
      imported('shipments.upload', { filename: 'FileName-1981.xls', sizeBytes: 16_384 }),
      imported('shipments.commit', {
        filename: 'FileName-1981.xls',
        shipments: 9,
        counts: { matched: 9, review: 4, unmatched: 1, duplicate: 1 },
        handed: [10013, 10017],
      }),
      imported('shipments.commit', { filename: 'FileName-1982.xls', shipments: 0, counts: { unmatched: 2 }, handed: [] }),
      imported('shipments.discard', { filename: 'FileName-1983.xls' }),
      imported('shipments.revert', { filename: 'FileName-1966.xls', voided: 6, reopened: [10013], kept: [], reason: 'نسخهٔ ناقص فایل بود' }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      ['فایل پست ', { ltr: 'FileName-1981.xls' }, ' بارگذاری شد'],
      [
        'فایل پست ',
        { ltr: 'FileName-1981.xls' },
        ' ثبت شد: ',
        { ltr: '9' },
        ' کد رهگیری',
        '، ',
        { ltr: '4' },
        ' سطر در صف تأیید',
        '، ',
        { ltr: '1' },
        ' پیدا نشد',
        '، ',
        { ltr: '1' },
        ' تکراری',
        '؛ سفارش ',
        { ltr: '10013' },
        ' و ',
        { ltr: '10017' },
        ' تحویل پست شد',
      ],
      ['فایل پست ', { ltr: 'FileName-1982.xls' }, ' ثبت شد: ', { ltr: '0' }, ' کد رهگیری', '، ', { ltr: '2' }, ' پیدا نشد'],
      ['فایل پست ', { ltr: 'FileName-1983.xls' }, ' دور انداخته شد'],
      [
        'ورود ',
        { ltr: 'FileName-1966.xls' },
        ' برگشت: ',
        { ltr: '6' },
        ' کد رهگیری کنار رفت',
        '؛ سفارش ',
        { ltr: '10013' },
        ' به «در حال چاپ» برگشت',
        '؛ نسخهٔ ناقص فایل بود',
      ],
    ]);
  });

  it('صف تأیید و کنار گذاشتن یک کد (۶٫۲): «همین است»، دستی، «هیچ‌کدام» و کنار رفتن، با سطر و فایل و سفارش', () => {
    const lines = eventLines([
      event('shipments.approve', {
        targetType: 'order',
        detail: { orderNumber: 10014, importId: 'i', filename: 'FileName-1981.xls', rowNo: 6, from: 'printing', handed: true, score: 7 },
      }),
      event('shipments.approve', {
        targetType: 'order',
        detail: { orderNumber: 10019, filename: 'FileName-1981.xls', rowNo: 12, from: 'paid', handed: true },
      }),
      event('shipments.assign', { targetType: 'order', detail: { orderNumber: 10005, filename: 'FileName-1981.xls', rowNo: 13, from: 'handed_to_post', handed: false } }),
      event('shipments.dismiss', { targetType: 'shipment_import', detail: { filename: 'FileName-1977.xls', rowNo: 3, orderNumber: 10025 } }),
      event('shipments.void', { targetType: 'order', detail: { orderNumber: 10014, reason: 'کد مال سفارش دیگری بود', reopened: true } }),
      event('shipments.void', { targetType: 'order', detail: { orderNumber: 10006, reason: 'بستهٔ دوم نبود', reopened: false } }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      ['سطر ', { ltr: '6' }, ' فایل پست ', { ltr: 'FileName-1981.xls' }, ' با تأیید به سفارش ', { ltr: '10014' }, ' نشست', '؛ در حال چاپ ← تحویل پست شد'],
      ['سطر ', { ltr: '12' }, ' فایل پست ', { ltr: 'FileName-1981.xls' }, ' با تأیید به سفارش ', { ltr: '10019' }, ' نشست', '؛ در صف چاپ ← تحویل پست شد'],
      ['سطر ', { ltr: '13' }, ' فایل پست ', { ltr: 'FileName-1981.xls' }, ' دستی به سفارش ', { ltr: '10005' }, ' نشست'],
      ['سطر ', { ltr: '3' }, ' فایل پست ', { ltr: 'FileName-1977.xls' }, ' کنار گذاشته شد («هیچ‌کدام»)'],
      ['کد رهگیری سفارش ', { ltr: '10014' }, ' کنار رفت', '؛ سفارش به «در حال چاپ» برگشت', '؛ کد مال سفارش دیگری بود'],
      ['کد رهگیری سفارش ', { ltr: '10006' }, ' کنار رفت', '؛ بستهٔ دوم نبود'],
    ]);
  });

  it('چاپخانه‌ها (۵٫۲): افزودن، ویرایش با قبل و بعد، پیش‌فرض، غیرفعال و فعال؛ جابه‌جایی سفارش زیر «سفارش» با نام همان روز و دلیل', () => {
    const partner = (action: string, detail: Record<string, unknown>) => event(action, { targetType: 'partner', detail });
    const lines = eventLines([
      partner('partners.create', { name: 'چاپ نور', city: 'مشهد' }),
      partner('partners.update', { name: 'چاپ نور مشهد', city: 'نیشابور', changed: ['name', 'city'], previous: { name: 'چاپ نور', city: 'مشهد' } }),
      partner('partners.update', { name: 'چاپ نور', city: 'مشهد', changed: [], previous: { name: 'چاپ نور', city: 'مشهد' } }),
      partner('partners.default', { name: 'چاپ نور', previous: { name: 'چاپخانهٔ جزوه‌یار' } }),
      partner('partners.deactivate', { name: 'چاپ نور' }),
      partner('partners.activate', { name: 'چاپ نور' }),
      event('orders.assign', {
        targetType: 'order',
        detail: { orderNumber: 10027, from: { id: 'p1', name: 'چاپ نور' }, to: { id: 'p2', name: 'چاپخانهٔ جزوه‌یار' }, reason: 'دستگاه خراب است' },
      }),
      event('orders.assign', { targetType: 'order', detail: { orderNumber: 10037, from: null, to: { id: 'p1', name: 'چاپ نور' }, reason: 'تازه آمد' } }),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      ['چاپخانهٔ «چاپ نور» در مشهد افزوده شد'],
      ['چاپخانهٔ «چاپ نور مشهد» ویرایش شد: نام «چاپ نور» ← «چاپ نور مشهد»، شهر مشهد ← نیشابور'],
      ['چاپخانهٔ «چاپ نور» ویرایش شد'],
      ['چاپخانهٔ «چاپ نور» پیش‌فرض شد، به جای «چاپخانهٔ جزوه‌یار»'],
      ['چاپخانهٔ «چاپ نور» غیرفعال شد'],
      ['چاپخانهٔ «چاپ نور» دوباره فعال شد'],
      ['سفارش ', { ltr: '10027' }, ' از «چاپ نور» به «چاپخانهٔ جزوه‌یار» رفت؛ دستگاه خراب است'],
      ['سفارش ', { ltr: '10037' }, ' به «چاپ نور» سپرده شد؛ تازه آمد'],
    ]);
  });
});

describe('نقش در سربرگ و فهرست ادمین‌ها', () => {
  it('کاربر چاپخانه (۵٫۳) نام چاپخانه‌اش را دارد، همان طرح: «حسن · چاپ نور» و «چاپخانه · چاپ نور»؛ بقیه نام نقش', () => {
    const noor = { name: 'چاپ نور' };
    expect(roleLabel(['print_partner'], noor)).toBe('چاپ نور');
    expect(roleLabel(['print_partner'], noor, { withRole: true })).toBe('چاپخانه · چاپ نور');
    expect(roleLabel(['owner'], null)).toBe('مالک');
    expect(roleLabel(['operator'], null, { withRole: true })).toBe('متصدی');
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
