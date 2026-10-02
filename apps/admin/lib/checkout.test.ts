/**
 * مسیر خرید روی سایت در پنل (برش ۷٫۵، ADR-052)، خالص: فهرست آمادگی و یادداشت اولین تکهٔ کم با نامش (هرگز مقدار)، «از امروز 10:40،
 * سارا»، سطر وضعیت پیشخوان، متن رویدادها و خط لاگ بالا آمدن؛ همه با متن طرح (`ad-live`، `m-dash-alerts`، `m-events`).
 */

import { describe, expect, it } from 'vitest';

import { inEventKind, readinessOf, type AdminEventView, type AudienceChange } from '@jozveyar/db';

import { AUDIENCE_NAMES, cardState, firstGap, gapNote, gapSegs, liveAlert, needList, sinceSegs } from './checkout';
import { eventLines } from './events';
import type { Seg } from './orders';
import { describeCheckout } from './server/config';
import type { CheckoutCardView } from './server/settings';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const tehran = (text: string) => new Date(`${text.replace(' ', 'T')}:00+03:30`);

/** مقدارها فقط برای سنجش شکل؛ هیچ‌کدام نباید در هیچ متنی بیاید. */
const API_KEY = 'smsir-api-key-7f3c9a';
const MERCHANT = 'zibal-merchant-51e0';
const READY_ENV: Record<string, string> = {
  CHECKOUT_MODE: 'live',
  PAYMENT_PROVIDER: 'zibal',
  SMS_PROVIDER: 'smsir',
  PAYMENT_MERCHANT_ID: MERCHANT,
  SMS_API_KEY: API_KEY,
  SMS_OTP_TEMPLATE: '100001',
  SMS_PAID_TEMPLATE: '100002',
  SMS_TRACKING_TEMPLATE: '100003',
  PAYMENT_CALLBACK_URL: 'http://127.0.0.1:3102/pay/callback',
  DATABASE_URL: 'postgresql://x@127.0.0.1/x',
  SESSION_SECRET: 's'.repeat(64),
};
const ready = (over: Record<string, string | undefined> = {}, rows: [] | null = []) => readinessOf({ ...READY_ENV, ...over }, rows, null);
const view = (over: Partial<CheckoutCardView> = {}): CheckoutCardView => ({ mode: 'live', readiness: ready(), audience: 'preview', since: null, ...over });

/** متن تخت تکه‌ها، برای مقایسه با جملهٔ طرح. */
const flat = (segs: readonly Seg[] | null) =>
  (segs ?? []).map((seg) => (typeof seg === 'string' ? seg : 'num' in seg ? seg.num : 'ltr' in seg ? seg.ltr : seg.barcode)).join('');

const change = (over: Partial<AudienceChange> = {}): AudienceChange => ({
  at: tehran('2026-10-05 11:15'),
  by: 'سارا',
  from: 'everyone',
  to: 'paused',
  fresh: false,
  ...over,
});

describe('فهرست آمادگی و تکهٔ کم', () => {
  it('آماده: هشت تکهٔ طرح به ترتیب؛ پایگاه داده و رمز نشست فقط وقتی کم‌اند', () => {
    expect(needList(ready()).map((item) => [item.label, item.ok])).toEqual([
      ['درگاه زیبال', true],
      ['پیامک sms.ir', true],
      ['کد پذیرنده', true],
      ['کلید API', true],
      ['قالب کد تأیید', true],
      ['قالب پرداخت', true],
      ['قالب رهگیری', true],
      ['نشانی برگشت https', true],
    ]);
    const short = needList(ready({ SESSION_SECRET: 'کوتاه' }, null));
    expect(short.slice(-2).map((item) => [item.part, item.ok, item.state])).toEqual([
      ['DATABASE_URL', false, 'خالی'],
      ['SESSION_SECRET', false, 'شکل درستی ندارد'],
    ]);
    expect(needList(ready({ SMS_TRACKING_TEMPLATE: undefined })).find((item) => item.part === 'SMS_TRACKING_TEMPLATE')).toMatchObject({
      ok: false,
      state: 'خالی',
    });
  });

  it('هر تکه با نام کلید پنل یا نام .env، هر نام لاتین جدا؛ هرگز مقدار', () => {
    expect(gapSegs('SMS_TRACKING_TEMPLATE', 'empty')).toEqual(['«شناسهٔ قالب پیامک رهگیری» خالی است']);
    expect(gapSegs('SMS_API_KEY', 'unreadable')).toEqual(['«کلید API sms.ir» پنل با ', { ltr: 'SECRETS_KEY' }, ' امروز خوانده نشد']);
    expect(gapSegs('PAYMENT_MERCHANT_ID', 'malformed')).toEqual(['«کد پذیرندهٔ زیبال» شکل درستی ندارد']);
    expect(gapSegs('PAYMENT_PROVIDER', 'other')).toEqual([{ ltr: 'PAYMENT_PROVIDER' }, ' زیبال (', { ltr: 'zibal' }, ') نیست']);
    expect(gapSegs('SMS_PROVIDER', 'empty')).toEqual([{ ltr: 'SMS_PROVIDER' }, ' پیامک sms.ir (', { ltr: 'smsir' }, ') نیست']);
    expect(gapSegs('PAYMENT_CALLBACK_URL', 'empty')).toEqual([{ ltr: 'PAYMENT_CALLBACK_URL' }, ' خالی است']);
    expect(gapSegs('PAYMENT_CALLBACK_URL', 'malformed')).toEqual([
      { ltr: 'PAYMENT_CALLBACK_URL' },
      ' دقیقاً ',
      { ltr: 'https://jozveyar.com/pay/callback' },
      ' نیست',
    ]);
    expect(gapSegs('SESSION_SECRET', 'malformed')).toEqual([{ ltr: 'SESSION_SECRET' }, ' نیست یا کوتاه است']);
    expect(gapSegs('DATABASE_URL', 'empty')).toEqual(['پایگاه داده نیست']);
  });

  it('یادداشت کارت: کلید پنل «پایین‌تر واردش کن» با مخاطب امروز (طرح)؛ بقیه در .env؛ live خواسته نشده؛ آماده هیچ', () => {
    expect(flat(gapNote(ready({ SMS_TRACKING_TEMPLATE: '' }), 'preview'))).toBe(
      '«شناسهٔ قالب پیامک رهگیری» خالی است. پایین‌تر واردش کن و پیامک آزمایشی بگیر؛ مسیر خرید همان لحظه آماده می‌شود، با مخاطب «پیش‌نمایش مالک».',
    );
    expect(flat(gapNote(ready({ PAYMENT_MERCHANT_ID: '' }), 'paused'))).toBe(
      '«کد پذیرندهٔ زیبال» خالی است. پایین‌تر واردش کن و بیازما؛ مسیر خرید همان لحظه آماده می‌شود، با مخاطب «متوقف».',
    );
    const env = gapNote(ready({ PAYMENT_PROVIDER: 'mock' }), 'preview');
    expect(env).toEqual([
      { ltr: 'PAYMENT_PROVIDER' },
      ' زیبال (',
      { ltr: 'zibal' },
      ') نیست',
      '؛ در ',
      { ltr: '.env' },
      ' سرور درستش کن و بعد وب و پنل را دوباره بالا بیاور.',
    ]);
    expect(gapNote(ready({ CHECKOUT_MODE: 'off' }), 'preview')).toEqual([
      'مسیر خرید واقعی فقط با ',
      { ltr: 'CHECKOUT_MODE=live' },
      ' در ',
      { ltr: '.env' },
      ' سرور روشن می‌شود؛ تا آن موقع مخاطب اثری ندارد.',
    ]);
    expect(gapNote(ready(), 'everyone')).toBeNull();
    // اولین تکهٔ کم به ترتیب کارت، هر چند تکه کم باشد.
    expect(firstGap(ready({ SMS_PAID_TEMPLATE: 'x', SESSION_SECRET: '' }))).toEqual({ part: 'SMS_PAID_TEMPLATE', state: 'malformed' });
    // هیچ مقداری در هیچ متنی نیست.
    const all = JSON.stringify([gapNote(ready({ PAYMENT_CALLBACK_URL: 'https://evil.example/pay' }), 'preview'), needList(ready())]);
    for (const secret of [API_KEY, MERCHANT, 'evil.example', READY_ENV.SESSION_SECRET!]) expect(all).not.toContain(secret);
  });
});

describe('مخاطب امروز و آخرین تغییرش', () => {
  it('«از امروز 11:15، سارا»، و پلهٔ بالا «، با کد تازه»؛ پیش‌فرضی که هرگز عوض نشده؛ تغییری که مخاطب امروز را نگذاشت هیچ', () => {
    expect(flat(sinceSegs(change(), 'paused', NOW))).toBe('از امروز 11:15، سارا');
    expect(sinceSegs(change(), 'paused', NOW)).toEqual(['از امروز ', { num: '11:15' }, '، سارا', '']);
    expect(flat(sinceSegs(change({ from: 'preview', to: 'everyone', fresh: true, at: tehran('2026-10-05 11:02') }), 'everyone', NOW))).toBe(
      'از امروز 11:02، سارا، با کد تازه',
    );
    expect(flat(sinceSegs(change({ at: tehran('2026-10-04 18:30'), by: null }), 'paused', NOW))).toBe('از دیروز 18:30');
    expect(sinceSegs(null, 'preview', NOW)).toEqual(['پیش‌فرض پس از استقرار']);
    expect(sinceSegs(null, 'everyone', NOW)).toBeNull();
    expect(sinceSegs(change({ to: 'everyone' }), 'paused', NOW)).toBeNull();
    expect(AUDIENCE_NAMES).toEqual({ paused: 'متوقف', preview: 'پیش‌نمایش مالک', everyone: 'همه' });
  });

  it('حال کارت: آماده، درگاه نمونه، یا خاموش', () => {
    expect(cardState(view())).toBe('ready');
    expect(cardState(view({ mode: 'mock', readiness: ready({ CHECKOUT_MODE: 'mock' }) }))).toBe('mock');
    expect(cardState(view({ mode: 'off', readiness: ready({ CHECKOUT_MODE: 'off' }) }))).toBe('off');
    expect(cardState(view({ readiness: ready({ SMS_OTP_TEMPLATE: '' }) }))).toBe('off');
  });
});

describe('سطر وضعیت پیشخوان (سؤال ۱۴۰)', () => {
  it('یکی از سه، با متن طرح؛ و وقتی برای همه باز است یا live خواسته نشده هیچ', () => {
    expect(liveAlert(null, NOW)).toBeNull();
    expect(liveAlert(view({ mode: 'off', readiness: ready({ CHECKOUT_MODE: 'off' }) }), NOW)).toBeNull();
    expect(liveAlert(view({ mode: 'mock', readiness: ready({ CHECKOUT_MODE: 'mock' }) }), NOW)).toBeNull();
    expect(liveAlert(view({ audience: 'everyone' }), NOW)).toBeNull();

    const off = liveAlert(view({ readiness: ready({ SMS_TRACKING_TEMPLATE: '' }), audience: 'everyone' }), NOW)!;
    expect([off.kind, off.tone, off.link]).toEqual(['off', 'error', 'چه کم است']);
    expect(off.head + flat(off.text)).toBe('مسیر خرید خاموش است: در .env «live» خواسته شد، ولی «شناسهٔ قالب پیامک رهگیری» خالی است.');
    expect(off.text[1]).toEqual({ ltr: '.env' });

    const preview = liveAlert(view(), NOW)!;
    expect([preview.kind, preview.tone, preview.link]).toEqual(['preview', 'info', 'باز برای همه']);
    expect(preview.head + flat(preview.text)).toBe(
      'مسیر خرید: پیش‌نمایش مالک. فقط مرورگری که پیوند پیش‌نمایش را باز کرد سفارش می‌دهد؛ بقیه «ثبت سفارش آنلاین به‌زودی» می‌بینند.',
    );

    const paused = liveAlert(view({ audience: 'paused', since: change() }), NOW)!;
    expect([paused.kind, paused.tone, paused.link]).toEqual(['paused', 'warning', 'باز کردن']);
    expect(paused.head + flat(paused.text)).toBe(
      'مسیر خرید متوقف است از امروز 11:15، سارا: سفارش تازه نمی‌آید؛ برگشت از درگاه و استعلام کار می‌کنند.',
    );
    // متوقفی که بیرون از پنل گذاشته شد: بی «از …».
    expect(flat(liveAlert(view({ audience: 'paused', since: null }), NOW)!.text)).toBe(': سفارش تازه نمی‌آید؛ برگشت از درگاه و استعلام کار می‌کنند.');
  });
});

describe('رویدادها و خط لاگ (۷٫۵)', () => {
  const event = (action: string, detail: Record<string, unknown>, id: number): AdminEventView => ({
    id,
    at: tehran('2026-10-05 11:00'),
    adminUserId: 'u1',
    action,
    targetType: 'setting',
    targetId: 'checkout.audience',
    ipHash: null,
    detail,
    username: 'sara',
    displayName: 'سارا',
  });

  it('متن طرح: مخاطب از و به، «با کد تازه» فقط پلهٔ بالا؛ پیوند پیش‌نمایش فقط با زمان انقضا؛ هر دو زیر «تنظیمات و کلیدها»', () => {
    const lines = eventLines([
      event('settings.checkout_audience', { from: 'everyone', to: 'paused', fresh: false }, 3),
      event('settings.checkout_audience', { from: 'preview', to: 'everyone', fresh: true }, 2),
      event('settings.checkout_preview', { preview: '9c1f0d8e-0000-4000-8000-000000000001', until: '2026-10-05T07:26:00.000Z' }, 1),
    ]);
    expect(lines.map((line) => line.text)).toEqual([
      ['مسیر خرید روی سایت: همه ← متوقف'],
      ['مسیر خرید روی سایت: پیش‌نمایش مالک ← همه، با کد تازه'],
      ['پیوند پیش‌نمایش مسیر خرید ساخته شد', '، تا ', { ltr: '10:56' }],
    ]);
    expect(JSON.stringify(lines)).not.toContain('9c1f0d8e');
    for (const action of ['settings.checkout_audience', 'settings.checkout_preview']) {
      expect(inEventKind(action, 'settings')).toBe(true);
      expect(inEventKind(action, 'orders')).toBe(false);
    }
  });

  it('خط لاگ پنل: فقط با live؛ آماده با مخاطب امروز، یا خاموش و اولین تکهٔ کم با نامش، هرگز مقدار', () => {
    expect(describeCheckout(ready({ CHECKOUT_MODE: 'off' }), 'preview')).toBeNull();
    expect(describeCheckout(ready({ CHECKOUT_MODE: 'mock' }), 'preview')).toBeNull();
    expect(describeCheckout(ready(), 'preview')).toBe('✓ پنل ادمین: مسیر خرید روی سایت آماده؛ مخاطب «پیش‌نمایش مالک» (از «تنظیمات»)');
    expect(describeCheckout(ready(), 'everyone')).toBe('✓ پنل ادمین: مسیر خرید روی سایت آماده؛ مخاطب «همه» (از «تنظیمات»)');
    expect(describeCheckout(ready({ SMS_TRACKING_TEMPLATE: '' }), 'everyone')).toBe(
      '✗ پنل ادمین: مسیر خرید روی سایت خاموش — SMS_TRACKING_TEMPLATE خالی است',
    );
    const lines = [describeCheckout(ready(), 'preview'), describeCheckout(ready({ PAYMENT_MERCHANT_ID: 'x' }), 'preview')].join('\n');
    for (const secret of [API_KEY, MERCHANT, READY_ENV.SESSION_SECRET!]) expect(lines).not.toContain(secret);
  });
});
