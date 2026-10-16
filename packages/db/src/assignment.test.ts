import { describe, expect, it } from 'vitest';

import { allClosedWindow, availabilityAt, choosePartner, closedDays, rankPartners, type PartnerCandidate } from './assignment.js';

/** شنبه ۴ مهر ۱۴۰۵، ۱۱:۳۰ تهران؛ و نیمه‌شب آغاز همان روز. */
const NOW = new Date('2026-09-26T08:00:00Z');
const DAY4 = new Date('2026-09-25T20:30:00Z');
const DAY = 86_400_000;

const TEHRAN = { provinceId: 8, cityId: 394 };
const MASHHAD = { provinceId: 11, cityId: 1326 };
const NEYSHABUR = { provinceId: 11, cityId: 1447 };
const SABZEVAR = { provinceId: 11, cityId: 754 };
const SHIRAZ = { provinceId: 17, cityId: 911 };
const ISFAHAN = { provinceId: 4, cityId: 122 };
const KASHAN = { provinceId: 4, cityId: 1080 };
const QOM = { provinceId: 19, cityId: 1052 };
const SEMNAN = { provinceId: 15, cityId: 808 };
const SHAHROUD = { provinceId: 15, cityId: 862 };

let seq = 0;
function partner(id: string, place: { provinceId: number; cityId: number }, over: Partial<PartnerCandidate> = {}): PartnerCandidate {
  seq += 1;
  return {
    id,
    ...place,
    isDefault: false,
    createdAt: new Date(Date.UTC(2026, 0, 1) + seq * 1000),
    availability: 'open',
    closedFrom: null,
    closedUntil: null,
    ...over,
  };
}

const closed = (days: number, from = DAY4) => ({ availability: 'closed' as const, closedFrom: from, closedUntil: new Date(from.getTime() + days * DAY) });
const ids = (ranked: ReturnType<typeof rankPartners>) => ranked.map((r) => `${r.partner.id}:${r.rule}`);

describe('در دسترس بودن در یک لحظه', () => {
  it('تعطیل فقط از آغاز اولین روز تا آغاز روز باز شدن؛ آینده و گذشته باز، شلوغ همیشه شلوغ', () => {
    const hours = closed(2);
    expect(availabilityAt(hours, DAY4)).toBe('closed');
    expect(availabilityAt(hours, new Date(DAY4.getTime() + 2 * DAY - 1))).toBe('closed');
    expect(availabilityAt(hours, new Date(DAY4.getTime() + 2 * DAY))).toBe('open');
    expect(availabilityAt(hours, new Date(DAY4.getTime() - 1))).toBe('open');
    expect(availabilityAt({ availability: 'busy', closedFrom: null, closedUntil: null }, NOW)).toBe('busy');
  });
});

describe('ترتیب تخصیص (برش ۱۰٫۱)', () => {
  it('همان شهر، همان استان، بعد نزدیک‌ترین؛ «پیش‌فرض» فقط برای برابری', () => {
    const jozveyar = partner('jozveyar', TEHRAN, { isDefault: true });
    const noor = partner('noor', MASHHAD);
    const sahar = partner('sahar', SABZEVAR);
    const qom = partner('qom', QOM);
    const all = [jozveyar, noor, sahar, qom];
    expect(choosePartner(all, MASHHAD, NOW)).toEqual({ partnerId: 'noor', rule: 'city' });
    // نیشابور: هر دو چاپخانهٔ خراسان رضوی هم‌استان‌اند؛ مشهد (حدود ۷۰ کیلومتر) نزدیک‌تر از سبزوار (حدود ۱۰۰).
    expect(ids(rankPartners(all, NEYSHABUR, NOW)).slice(0, 2)).toEqual(['noor:province', 'sahar:province']);
    // اصفهان چاپخانه ندارد: قم (حدود ۲۴۰ کیلومتر) نزدیک‌تر از تهران (حدود ۳۴۰)، با اینکه تهران پیش‌فرض است.
    expect(choosePartner(all, ISFAHAN, NOW)).toEqual({ partnerId: 'qom', rule: 'nearest' });
    // شیراز: نزدیک‌ترین قم است، بعد تهران، بعد سبزوار و مشهد.
    expect(ids(rankPartners(all, SHIRAZ, NOW))).toEqual(['qom:nearest', 'jozveyar:nearest', 'sahar:nearest', 'noor:nearest']);
  });

  it('در همان شهر فاصله صفر است: پیش‌فرض، بعد قدیمی‌ترین (همان ۵٫۲)', () => {
    const older = partner('older', TEHRAN);
    const newer = partner('newer', TEHRAN);
    const fallback = partner('fallback', TEHRAN, { isDefault: true });
    expect(ids(rankPartners([newer, older], TEHRAN, NOW))).toEqual(['older:city', 'newer:city']);
    expect(choosePartner([newer, older, fallback], TEHRAN, NOW)?.partnerId).toBe('fallback');
  });

  it('سفارشی که شهرش در فهرست نیست از سطح استان شروع می‌کند و با مرکز استانش سنجیده می‌شود', () => {
    const kashan = partner('kashan', KASHAN);
    const qom = partner('qom', QOM);
    expect(choosePartner([qom, kashan], { provinceId: 4, cityId: null }, NOW)).toEqual({ partnerId: 'kashan', rule: 'province' });
    // سمنان بی شهر: مرکز استان سمنان؛ شاهرود هم‌استان است، پس پیش از قم.
    expect(choosePartner([qom, partner('shahroud', SHAHROUD)], { provinceId: 15, cityId: null }, NOW)?.rule).toBe('province');
  });

  it('شلوغ فقط وقتی سفارش می‌گیرد که چاپخانهٔ باز دیگری در استان مشتری نباشد (سؤال ۲۰۰)', () => {
    const noorBusy = partner('noor', MASHHAD, { availability: 'busy' });
    const sahar = partner('sahar', SABZEVAR);
    const jozveyar = partner('jozveyar', TEHRAN, { isDefault: true });
    // باز همان استان پیش از شلوغ همان شهر؛ و با بازی در استان، شلوغ همان شهر حتی پس از باز استان دیگر (فهرست پنل همین ترتیب را دارد).
    expect(choosePartner([noorBusy, sahar, jozveyar], MASHHAD, NOW)).toEqual({ partnerId: 'sahar', rule: 'province' });
    expect(ids(rankPartners([noorBusy, sahar, jozveyar], MASHHAD, NOW))).toEqual(['sahar:province', 'jozveyar:nearest', 'noor:nearest']);
    // استان باز دیگری ندارد: شلوغ همان شهر پیش از باز استان دیگر.
    expect(choosePartner([noorBusy, jozveyar], MASHHAD, NOW)).toEqual({ partnerId: 'noor', rule: 'city' });
    expect(choosePartner([noorBusy, jozveyar], NEYSHABUR, NOW)).toEqual({ partnerId: 'noor', rule: 'province' });
    // جای دیگر: باز پیش از شلوغ، حتی دورتر.
    expect(ids(rankPartners([noorBusy, jozveyar], SHIRAZ, NOW))).toEqual(['jozveyar:nearest', 'noor:nearest']);
    // همه شلوغ: نزدیک‌ترین.
    expect(choosePartner([noorBusy, partner('qom', QOM, { availability: 'busy' })], ISFAHAN, NOW)?.partnerId).toBe('qom');
  });

  it('تعطیل در تخصیص نیست؛ وقتی همه تعطیل‌اند، اولی که باز می‌شود (سؤال ۲۶۵)', () => {
    const noor = partner('noor', MASHHAD, closed(3));
    const jozveyar = partner('jozveyar', TEHRAN, { isDefault: true, ...closed(2) });
    const qom = partner('qom', QOM, { availability: 'busy' });
    expect(choosePartner([noor, jozveyar, qom], MASHHAD, NOW)).toEqual({ partnerId: 'qom', rule: 'nearest' });
    expect(ids(rankPartners([noor, jozveyar], MASHHAD, NOW))).toEqual(['jozveyar:reopening', 'noor:reopening']);
    // هم‌زمان باز شدن: نزدیک‌تر.
    expect(choosePartner([partner('a', TEHRAN, closed(2)), partner('b', MASHHAD, closed(2))], NEYSHABUR, NOW)?.partnerId).toBe('b');
    // تعطیلی آینده و گذشته در کار نیستند.
    const future = partner('future', MASHHAD, closed(2, new Date(DAY4.getTime() + DAY)));
    const past = partner('past', TEHRAN, closed(1, new Date(DAY4.getTime() - 3 * DAY)));
    expect(rankPartners([future, past], MASHHAD, NOW).map((r) => r.state)).toEqual(['open', 'open']);
  });

  it('هیچ چاپخانهٔ فعالی نیست: null', () => {
    expect(choosePartner([], TEHRAN, NOW)).toBeNull();
  });
});

describe('روزهای «همه تعطیل»', () => {
  it('اشتراک بازه‌ها؛ یکی بی تعطیلی، بازه‌های جدا، یا هیچ چاپخانه: هیچ', () => {
    const a = closed(3);
    const b = closed(2, new Date(DAY4.getTime() + DAY));
    expect(allClosedWindow([a, b])).toEqual({ from: new Date(DAY4.getTime() + DAY), until: new Date(DAY4.getTime() + 3 * DAY) });
    expect(allClosedWindow([a, { availability: 'busy', closedFrom: null, closedUntil: null }])).toBeNull();
    expect(allClosedWindow([closed(1), closed(1, new Date(DAY4.getTime() + 2 * DAY))])).toBeNull();
    expect(allClosedWindow([])).toBeNull();
  });

  it('به شکل تعطیلی‌های تقویم، هر روز یک بار', () => {
    expect(closedDays(allClosedWindow([closed(2)]))).toEqual(['1405/07/04', '1405/07/05']);
    expect(closedDays(null)).toEqual([]);
  });
});
