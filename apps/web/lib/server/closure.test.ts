/**
 * پیام «چاپخانه‌ها تعطیل‌اند» (برش ۱۰٫۱، سؤال ۲۷۰): فقط وقتی همین حالا همه تعطیل‌اند، با روز آخر و اولین روز کاری پس از آن. از ۱۱٫۳ بالای
 * سربرگ همهٔ صفحه‌هاست؛ build، بی پایگاه داده و خطای پایگاه داده در `bar.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { PartnerHours } from '@jozveyar/db';

import { loadClosure } from './closure';

/** آغاز شنبه ۴ مهر ۱۴۰۵ تهران. */
const DAY4 = new Date('2026-09-25T20:30:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(DAY4.getTime() + days * DAY);
const closed = (from: number, until: number): PartnerHours => ({ availability: 'closed', closedFrom: at(from), closedUntil: at(until) });

function source(hours: PartnerHours[], holidays: unknown = undefined) {
  return {
    partnerHours: async () => hours,
    setting: async (key: string) => (key === 'calendar.holidays' ? holidays : undefined),
  };
}

describe('نوار تعطیلی', () => {
  it('همه همین حالا تعطیل: روز آخر اشتراک و اولین روز کاری پس از آن (پنجشنبه و جمعه نه)', async () => {
    // جزوه‌یار ۴ تا ۵ مهر (باز از دوشنبه ۶)، چاپ نور ۴ تا ۷ مهر؛ اشتراک ۴ و ۵ مهر، باز شدن دوشنبه ۶ مهر.
    expect(await loadClosure(source([closed(0, 2), closed(0, 4)]), at(0.5))).toEqual({ lastDay: 'یکشنبه 5 مهر', resumes: 'دوشنبه 6 مهر' });
    // باز شدن پنجشنبه ۹ مهر: روز کاری بعد شنبه ۱۱ مهر.
    expect(await loadClosure(source([closed(0, 5)]), at(1))).toEqual({ lastDay: 'چهارشنبه 8 مهر', resumes: 'شنبه 11 مهر' });
    // و اگر شنبه تعطیل رسمی است، یکشنبه.
    expect(await loadClosure(source([closed(0, 5)], [{ date: '1405/07/11', title: 'تعطیل' }]), at(1))).toMatchObject({ resumes: 'یکشنبه 12 مهر' });
  });

  it('یکی باز، شلوغ، تعطیلی آینده یا گذشته، یا هیچ چاپخانه: هیچ', async () => {
    expect(await loadClosure(source([closed(0, 2), { availability: 'open', closedFrom: null, closedUntil: null }]), at(0.5))).toBeNull();
    expect(await loadClosure(source([closed(0, 2), { availability: 'busy', closedFrom: null, closedUntil: null }]), at(0.5))).toBeNull();
    expect(await loadClosure(source([closed(1, 3)]), at(0.5))).toBeNull();
    expect(await loadClosure(source([closed(0, 2)]), at(2))).toBeNull();
    expect(await loadClosure(source([]), at(0.5))).toBeNull();
  });
});
