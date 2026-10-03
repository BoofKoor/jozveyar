import { describe, expect, it } from 'vitest';

import type { ShipmentSms } from '@jozveyar/db';
import { SMS_STUCK_MS } from '@jozveyar/sms';

import type { Seg } from './orders';
import { partnerSmsView, paymentSmsView, smsCounts, smsCountsText, smsReached, smsRowNote, smsView } from './sms';

/** «حالا»ی طرح: دوشنبه 13 مهر 1405، 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const AT = new Date('2026-10-05T07:40:00Z');
const text = (segs: readonly Seg[]) => segs.map((seg) => (typeof seg === 'string' ? seg : 'num' in seg ? seg.num : 'ltr' in seg ? seg.ltr : seg.barcode)).join('');
const sms = (over: Partial<ShipmentSms> = {}): ShipmentSms => ({
  id: 1,
  toMobile: '09152345678',
  status: 'logged',
  error: null,
  attempts: 1,
  createdAt: AT,
  attemptedAt: AT,
  sentAt: AT,
  ...over,
});

describe('پیامک رهگیری در پنل (۶٫۳)', () => {
  it('ردیف «پیامک»: رفت (کنسولی هم)، در راه، نرفت با علت، معلوم نیست، پیش‌تر، و بی پیامک', () => {
    expect(text(smsView(sms(), AT, NOW).text)).toBe('به 0915 234 5678 رفت، امروز 11:10');
    expect(smsView(sms({ status: 'sent' }), AT, NOW).state).toBe('sent');
    const fresh = new Date(NOW.getTime() - 60_000);
    expect(text(smsView(sms({ status: 'pending', createdAt: fresh, sentAt: null, attemptedAt: null }), fresh, NOW).text)).toBe(
      'در حال فرستادن به 0915 234 5678…',
    );
    const failed = smsView(sms({ status: 'failed', sentAt: null, error: 'unavailable' }), AT, NOW);
    expect([text(failed.text), failed.resendable]).toEqual(['به 0915 234 5678 نرفت: پنل پیامک جواب نداد.', true]);
    expect(text(smsView(sms({ status: 'failed', sentAt: null, error: 'rejected' }), AT, NOW).text)).toContain('نپذیرفت');
    const stuck = new Date(AT.getTime() + SMS_STUCK_MS + 1);
    expect(text(smsView(sms({ status: 'pending', sentAt: null, attemptedAt: null }), AT, stuck).text)).toContain('نیمه‌کاره ماند');
    const unknown = smsView(sms({ status: 'sending', sentAt: null }), AT, stuck);
    expect([unknown.state, unknown.resendable, text(unknown.text)]).toEqual(['unknown', true, 'معلوم نیست به 0915 234 5678 رفت یا نه: فرستادنش نیمه‌کاره ماند. شاید رفته باشد.']);
    const earlier = smsView(sms(), new Date(AT.getTime() + 60_000), NOW);
    expect([earlier.earlier, text(earlier.text).endsWith('(همین کد، پیش‌تر)')]).toEqual([true, true]);
    expect(smsView(null, AT, NOW)).toMatchObject({ state: 'none', resendable: false });
    expect(smsView(sms(), AT, NOW).resendable).toBe(false);
  });

  it('یادداشت سطر صفحهٔ ورود: رفته هیچ، نرفته با علت و دکمه، ۶۷ بی پیامک تازه', () => {
    expect(smsRowNote(sms(), AT, NOW)).toBeNull();
    expect(smsRowNote(sms({ status: 'failed', sentAt: null, error: 'unavailable' }), AT, NOW)).toEqual({
      text: 'پیامک نرفت: پنل پیامک جواب نداد.',
      failed: true,
      resendable: true,
    });
    expect(smsRowNote(sms(), new Date(AT.getTime() + 1), NOW)).toMatchObject({ failed: false, resendable: false });
    expect(smsRowNote(null, AT, NOW)).toBeNull();
  });

  it('شمار و پیامک‌گرفته‌ها: فقط کد زنده؛ کنارگذاشته نه', () => {
    const items = [
      { orderNumber: 10005, createdAt: AT, voidedAt: null, sms: sms() },
      { orderNumber: 10006, createdAt: AT, voidedAt: null, sms: sms() },
      { orderNumber: 10018, createdAt: AT, voidedAt: null, sms: sms({ status: 'failed', sentAt: null }) },
      { orderNumber: 10020, createdAt: AT, voidedAt: NOW, sms: sms() },
      { orderNumber: 10021, createdAt: AT, voidedAt: null, sms: null },
    ];
    expect(smsCounts(items, NOW)).toEqual({ sent: 2, failed: 1, sending: 0 });
    expect(text(smsCountsText(smsCounts(items, NOW)))).toBe('پیامک: 2 رفت، 1 نرفت.');
    expect(smsCountsText({ sent: 0, failed: 0, sending: 0 })).toEqual([]);
    expect(smsReached(items, NOW)).toEqual([10005, 10006]);
  });
});

describe('پیامک sms.ir در پنل (۷٫۱)', () => {
  it('علت «نرفت» با عدد پاسخ sms.ir و «کلید خالی»؛ هرگز متن پاسخ', () => {
    const failed = (error: string) => text(smsView(sms({ status: 'failed', sentAt: null, error }), AT, NOW).text);
    expect(failed('rejected:401')).toBe('به 0915 234 5678 نرفت: پنل پیامک نپذیرفت (کد 401).');
    expect(failed('unavailable:500')).toBe('به 0915 234 5678 نرفت: پنل پیامک جواب نداد (کد 500).');
    expect(failed('unconfigured')).toBe('به 0915 234 5678 نرفت: کلید API یا شناسهٔ قالب sms.ir خالی است یا خوانده نشد.');
    expect(failed('چیز ناشناس')).toBe('به 0915 234 5678 نرفت: پنل پیامک جواب نداد.');
    expect(smsRowNote(sms({ status: 'failed', sentAt: null, error: 'rejected:17' }), AT, NOW)).toMatchObject({ text: 'پیامک نرفت: پنل پیامک نپذیرفت (کد 17).' });
  });

  it('ردیف «پیامک پرداخت» کارت «پرداخت‌ها»: رفت، نرفت با «دوباره بفرست» فقط برای سفارش باز، و پرداخت پیش از ۷٫۱ هیچ', () => {
    expect(text(paymentSmsView(sms(), true, NOW)!.text)).toBe('به 0915 234 5678 رفت، امروز 11:10');
    expect(paymentSmsView(sms(), true, NOW)!.resendable).toBe(false);
    const failed = paymentSmsView(sms({ status: 'failed', sentAt: null, error: 'unavailable' }), true, NOW)!;
    expect([failed.state, failed.resendable, text(failed.text)]).toEqual(['failed', true, 'نرفت: پنل پیامک جواب نداد، امروز 11:10']);
    expect(paymentSmsView(sms({ status: 'failed', sentAt: null, error: 'unavailable' }), false, NOW)!.resendable).toBe(false);
    const stuck = new Date(AT.getTime() + SMS_STUCK_MS + 1);
    expect(paymentSmsView(sms({ status: 'sending', sentAt: null }), true, stuck)).toMatchObject({ state: 'unknown', resendable: true });
    expect(paymentSmsView(null, true, NOW)).toBeNull();
  });
});

describe('پیامک سفارش تازهٔ چاپخانه (۷٫۶)', () => {
  const partner = (over: Partial<ShipmentSms> = {}) => sms({ toMobile: '09151234567', ...over });
  const failed = (error: string) => partner({ status: 'failed', sentAt: null, error });

  it('ردیف کارت «چاپخانه» (سؤال ۱۷۲): رفت، نرفت با «دوباره بفرست» فقط تا وقتی همان تخصیص زنده است (۱۷۴)؛ بی موبایل اعلان هیچ', () => {
    expect(text(partnerSmsView(partner(), true, NOW)!.text)).toBe('به 0915 123 4567 رفت، امروز 11:10');
    expect(partnerSmsView(partner(), true, NOW)!.resendable).toBe(false);
    const down = partnerSmsView(failed('unavailable'), true, NOW)!;
    expect([down.state, down.resendable, text(down.text)]).toEqual(['failed', true, 'نرفت: پنل پیامک جواب نداد، امروز 11:10']);
    // جابه‌جا شد، چاپش شروع شد یا لغو شد: همان «نرفت»، بی «دوباره بفرست».
    expect(partnerSmsView(failed('unavailable'), false, NOW)).toMatchObject({ state: 'failed', resendable: false });
    const stuck = new Date(AT.getTime() + SMS_STUCK_MS + 1);
    expect(partnerSmsView(partner({ status: 'pending', sentAt: null, attemptedAt: null }), true, stuck)).toMatchObject({ state: 'failed', resendable: true });
    expect(partnerSmsView(partner({ status: 'sending', sentAt: null }), true, stuck)).toMatchObject({ state: 'unknown', resendable: true });
    expect(text(partnerSmsView(partner({ status: 'pending', sentAt: null, attemptedAt: null, createdAt: NOW }), true, NOW)!.text)).toBe(
      'در حال فرستادن به 0915 123 4567…',
    );
    expect(partnerSmsView(null, true, NOW)).toBeNull();
  });

  it('«کلید خالی» نام قالب چاپخانه را می‌برد (سؤال ۱۷۵)؛ پیامک‌های دیگر همان متن عمومی', () => {
    expect(text(partnerSmsView(failed('unconfigured'), true, NOW)!.text)).toBe(
      'نرفت: کلید API یا شناسهٔ قالب پیامک چاپخانه خالی است یا خوانده نشد، امروز 11:10',
    );
    expect(text(paymentSmsView(failed('unconfigured'), true, NOW)!.text)).toBe('نرفت: کلید API یا شناسهٔ قالب sms.ir خالی است یا خوانده نشد، امروز 11:10');
    expect(text(partnerSmsView(failed('rejected:401'), true, NOW)!.text)).toBe('نرفت: پنل پیامک نپذیرفت (کد 401)، امروز 11:10');
  });
});
