/**
 * چاپخانه‌ها به زبان پنل (`partners.ts`، برش ۵٫۲): نام و شهر فرم، خط دوم فهرست، کارت چاپخانهٔ سفارش و تاریخچهٔ تخصیص، همان
 * متن‌های طرح پنل (`m-partners`، `m-partner-edit`، `m-order`).
 */

import { describe, expect, it } from 'vitest';

import type { PanelAssignment, PanelOrderDetails, PartnerView } from '@jozveyar/db';
import { findCity } from '@jozveyar/geo';

import type { Seg } from './orders';
import { assignmentNote, assignmentText, cityLabel, partnerCard, partnerCityLabel, partnerMeta, partnerNameOf, pickCity } from './partners';

const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);
const text = (segs: readonly Seg[]) => segs.map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : s.barcode)).join('');
const nums = (segs: readonly Seg[]) => segs.filter((s): s is { num: string } => typeof s === 'object' && 'num' in s).map((s) => s.num);

describe('فرم چاپخانه', () => {
  it('نام فارسی‌نرمال، ۱ تا ۱۰۰ نویسه؛ خالی یا فقط فاصله نه', () => {
    expect(partnerNameOf('  چاپ   نور  ')).toBe('چاپ نور');
    expect(partnerNameOf('چاپ نور كرمان')).toBe('چاپ نور کرمان');
    expect(partnerNameOf('   ')).toBeNull();
    expect(partnerNameOf('')).toBeNull();
    expect(partnerNameOf(undefined)).toBeNull();
    expect(partnerNameOf(42)).toBeNull();
    expect(partnerNameOf('ن'.repeat(100))).toBe('ن'.repeat(100));
    expect(partnerNameOf('ن'.repeat(101))).toBeNull();
  });

  it('شهر: گزینهٔ فهرست «شهر، استان»، یا نام تنهای شهری که فقط یکی است؛ همان فهرست شهرهای سایت', () => {
    expect(pickCity('مشهد، خراسان رضوی')).toMatchObject({ ok: true, city: { id: 1326, provinceId: 11 } });
    expect(pickCity('مشهد')).toMatchObject({ ok: true, city: { id: 1326 } });
    // ویرگول لاتین، فاصله و ی و ک عربی: همان.
    expect(pickCity(' مشهد ,  خراسان رضوي ')).toMatchObject({ ok: true, city: { id: 1326 } });
    expect(pickCity('شیراز، فارس')).toMatchObject({ ok: true, city: { id: 911, provinceId: 17 } });
    // گزینه با برچسب همان تابعی که `datalist` می‌سازد، رفت و برگشت.
    expect(pickCity(cityLabel(findCity(1447)!))).toMatchObject({ ok: true, city: { id: 1447 } });
    expect(cityLabel(findCity(1326)!)).toBe('مشهد، خراسان رضوی');
    expect(partnerCityLabel({ cityId: 394 })).toBe('تهران، تهران');
    expect(partnerCityLabel({ cityId: 999_999 })).toBe('');
  });

  it('شهر مبهم یا ناشناس: پیشنهادها، نه حدس؛ خالی جدا', () => {
    // «مهاباد» هم در آذربایجان غربی است و هم در اصفهان.
    const ambiguous = pickCity('مهاباد');
    expect(ambiguous).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(ambiguous.ok ? [] : ambiguous.suggestions.map(cityLabel).sort()).toEqual(['مهاباد، آذربایجان غربی', 'مهاباد، اصفهان']);
    expect(pickCity('مهاباد، اصفهان')).toMatchObject({ ok: true, city: { id: 1363 } });
    // استانی که شهر در آن نیست: همان دو پیشنهاد.
    expect(pickCity('مهاباد، فارس')).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(pickCity('مشهد، فارس')).toMatchObject({ ok: false, reason: 'unknown' });
    const unknown = pickCity('مشهدناموجود');
    expect(unknown).toMatchObject({ ok: false, reason: 'unknown' });
    const near = pickCity('نیشا');
    expect(near.ok ? null : near.suggestions[0]?.name).toBe('نیشابور');
    expect(pickCity('   ')).toEqual({ ok: false, reason: 'empty', suggestions: [] });
    expect(pickCity(null)).toEqual({ ok: false, reason: 'empty', suggestions: [] });
  });
});

describe('فهرست «چاپخانه‌ها»', () => {
  const partner = (over: Partial<PartnerView> = {}): PartnerView => ({
    id: 'p1',
    name: 'چاپخانهٔ جزوه‌یار',
    provinceId: 8,
    cityId: 394,
    provinceName: 'تهران',
    cityName: 'تهران',
    isDefault: true,
    deactivatedAt: null,
    createdAt: tehran('2026-09-20 10:00'),
    openOrders: 8,
    users: [],
    ...over,
  });

  it('کاربرهای چاپخانه (۵٫۳)، همان طرح: «مشهد · 2 سفارش باز · کاربر: حسن نوری»؛ چند کاربر با «،»؛ غیرفعالی که کاربر فعال دارد نامشان را', () => {
    expect(text(partnerMeta(partner({ cityName: 'مشهد', openOrders: 2, isDefault: false, users: ['حسن نوری'] })))).toBe(
      'مشهد · 2 سفارش باز · کاربر: حسن نوری',
    );
    expect(text(partnerMeta(partner({ users: ['حسن نوری', 'رضا کریمی'] })))).toBe('تهران · 8 سفارش باز · کاربرها: حسن نوری، رضا کریمی');
    const inactive = partner({ cityName: 'اصفهان', deactivatedAt: tehran('2026-09-23 10:00'), openOrders: 0, users: ['مینا'] });
    expect(text(partnerMeta(inactive))).toBe('اصفهان · از 1405/07/01 سفارش تازه نمی‌گیرد · کاربر: مینا');
  });

  it('خط دوم، همان طرح: «تهران · 8 سفارش باز · کاربرها: همان مالک و متصدی»؛ غیرفعال «از 1405/07/01 سفارش تازه نمی‌گیرد»', () => {
    expect(text(partnerMeta(partner()))).toBe('تهران · 8 سفارش باز · کاربرها: همان مالک و متصدی');
    expect(nums(partnerMeta(partner({ openOrders: 1250 })))).toEqual(['1,250']);
    const inactive = partnerMeta(partner({ cityName: 'اصفهان', deactivatedAt: tehran('2026-09-23 10:00'), openOrders: 0 }));
    expect(text(inactive)).toBe('اصفهان · از 1405/07/01 سفارش تازه نمی‌گیرد');
    expect(nums(inactive)).toEqual(['1405/07/01']);
  });
});

describe('چاپخانهٔ سفارش', () => {
  const assignment = (over: Partial<PanelAssignment> = {}): PanelAssignment => ({
    id: 1,
    at: tehran('2026-10-03 14:05'),
    fromName: null,
    toPartnerId: 'partner-noor',
    toName: 'چاپ نور',
    actor: 'system',
    adminName: null,
    rule: 'city',
    reason: null,
    ...over,
  });
  const moved = assignment({ id: 2, fromName: 'چاپ نور', toName: 'چاپخانهٔ جزوه‌یار', actor: 'admin', adminName: 'سارا', rule: null, reason: 'دستگاه چاپ نور تا فردا خراب است' });

  it('خط زیر نام، همان طرح: «خودکار، هنگام پرداخت: هم‌شهر مشتری.»، و هر قاعدهٔ دیگر؛ جابه‌جایی با نام ادمین و دلیل', () => {
    expect(assignmentNote(assignment())).toBe('خودکار، هنگام پرداخت: هم‌شهر مشتری.');
    expect(assignmentNote(assignment({ rule: 'province' }))).toBe('خودکار، هنگام پرداخت: هم‌استان مشتری.');
    expect(assignmentNote(assignment({ rule: 'default' }))).toBe('خودکار، هنگام پرداخت: چاپخانهٔ پیش‌فرض.');
    expect(assignmentNote(assignment({ rule: 'oldest' }))).toBe('خودکار، هنگام پرداخت: قدیمی‌ترین چاپخانهٔ فعال.');
    expect(assignmentNote(moved)).toBe('جابه‌جا شد، سارا: دستگاه چاپ نور تا فردا خراب است');
    expect(assignmentNote(assignment({ fromName: null, actor: 'admin', adminName: 'علی', rule: null, reason: 'تازه آمد' }))).toBe(
      'دستی سپرده شد، علی: تازه آمد',
    );
    expect(assignmentNote(undefined)).toBeNull();
  });

  it('سطر رویدادهای سفارش، همان طرح: «به چاپ نور سپرده شد، هم‌شهر مشتری» و «از «چاپ نور» به «چاپخانهٔ جزوه‌یار» رفت؛ …»', () => {
    expect(text(assignmentText(assignment()))).toBe('به چاپ نور سپرده شد، هم‌شهر مشتری');
    expect(text(assignmentText(moved))).toBe('از «چاپ نور» به «چاپخانهٔ جزوه‌یار» رفت؛ دستگاه چاپ نور تا فردا خراب است');
    expect(text(assignmentText(assignment({ actor: 'admin', adminName: 'علی', rule: null, reason: 'تازه آمد' })))).toBe(
      'به چاپ نور سپرده شد؛ تازه آمد',
    );
  });

  it('کارت فقط برای سفارش پرداخت‌شده؛ یادداشت از آخرین تخصیص', () => {
    const details = (status: PanelOrderDetails['order']['status'], assignments: PanelAssignment[]) =>
      ({ order: { status }, assignments }) as unknown as PanelOrderDetails;
    expect(partnerCard(details('awaiting_payment', []))).toBeNull();
    expect(partnerCard(details('expired', []))).toBeNull();
    expect(partnerCard(details('paid', []))).toEqual({ note: null });
    expect(partnerCard(details('paid', [assignment(), moved]))).toEqual({ note: 'جابه‌جا شد، سارا: دستگاه چاپ نور تا فردا خراب است' });
    for (const status of ['printing', 'handed_to_post', 'cancelled'] as const) {
      expect(partnerCard(details(status, [assignment()]))).toEqual({ note: 'خودکار، هنگام پرداخت: هم‌شهر مشتری.' });
    }
  });
});
