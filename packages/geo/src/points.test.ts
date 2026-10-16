import { describe, expect, it } from 'vitest';

import { CITY_COORDS } from './coords.js';
import { CITIES, PROVINCES, findCity } from './index.js';
import { cityPoint, distanceKm, placePoint, type Point } from './points.js';

/** شهر با نام و استان؛ اگر نبود یا دوتا بود، تست همین‌جا می‌افتد. */
function cityId(name: string, provinceName: string): number {
  const province = PROVINCES.find((p) => p.name === provinceName);
  const hits = CITIES.filter((c) => c.name === name && c.provinceId === province?.id);
  expect(hits, `${name} در ${provinceName}`).toHaveLength(1);
  return hits[0]!.id;
}

const at = (name: string, provinceName: string): Point => cityPoint(cityId(name, provinceName))!;

describe('مختصات شهرها (برش ۱۰٫۱)', () => {
  it('هر ردیف شهری از فهرست است، یکتا و به ترتیب شناسه، با چهار رقم اعشار درون مرز تقریبی کشور', () => {
    const ids = CITY_COORDS.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    for (const [id, lat, lon] of CITY_COORDS) {
      expect(findCity(id), String(id)).toBeDefined();
      expect(lat >= 25 && lat <= 40 && lon >= 44 && lon <= 63.5, `${findCity(id)?.name}: ${lat}, ${lon}`).toBe(true);
      expect(Math.round(lat * 1e4) / 1e4).toBe(lat);
      expect(Math.round(lon * 1e4) / 1e4).toBe(lon);
    }
  });

  it('بیشتر شهرها مختصات خودشان را دارند، و مرکز هر ۳۱ استان همه', () => {
    expect(CITY_COORDS.length).toBeGreaterThanOrEqual(1100);
    for (const province of PROVINCES) expect(cityPoint(province.capitalId), province.name).toBeDefined();
  });

  it('هر شهر نزدیک مرکز استان خودش است: بزرگ‌ترین استان، سیستان و بلوچستان، هم زیر ۶۵۰ کیلومتر', () => {
    for (const [id, lat, lon] of CITY_COORDS) {
      const city = findCity(id)!;
      const capital = cityPoint(PROVINCES.find((p) => p.id === city.provinceId)!.capitalId)!;
      expect(distanceKm({ lat, lon }, capital), city.name).toBeLessThan(650);
    }
  });

  it('چند شهر شناخته، و تصمیم‌های دستی ناهمخوانی دو منبع', () => {
    // ساوه: منبع اول دو ردیف هم‌نام داشت و پرجمعیت‌تر اراک بود.
    expect(distanceKm(at('ساوه', 'مرکزی'), { lat: 35.0213, lon: 50.3566 })).toBeLessThan(2);
    // لطف‌آباد: شهر مرزی درگز، نه آبادی هم‌نام کنار نیشابور.
    expect(at('لطف‌آباد', 'خراسان رضوی').lat).toBeGreaterThan(37.4);
    // علی‌آباد گلستان: علی‌آباد کتول، نه «علی‌آباد کنارشهر».
    expect(distanceKm(at('علی‌آباد', 'گلستان'), { lat: 36.9101, lon: 54.8674 })).toBeLessThan(2);
  });
});

describe('فاصله', () => {
  it('تهران تا مشهد حدود ۷۴۰ کیلومتر، تهران تا تبریز حدود ۵۳۰، و هر جا تا خودش صفر', () => {
    const tehran = at('تهران', 'تهران');
    expect(distanceKm(tehran, at('مشهد', 'خراسان رضوی'))).toBeGreaterThan(720);
    expect(distanceKm(tehran, at('مشهد', 'خراسان رضوی'))).toBeLessThan(760);
    expect(distanceKm(tehran, at('تبریز', 'آذربایجان شرقی'))).toBeGreaterThan(510);
    expect(distanceKm(tehran, at('تبریز', 'آذربایجان شرقی'))).toBeLessThan(550);
    expect(distanceKm(tehran, tehran)).toBe(0);
  });

  it('متقارن است', () => {
    const a = at('اصفهان', 'اصفهان');
    const b = at('شیراز', 'فارس');
    expect(distanceKm(a, b)).toBe(distanceKm(b, a));
  });
});

describe('نقطهٔ یک جا', () => {
  it('شهری که مختصات دارد خودش', () => {
    const qom = PROVINCES.find((p) => p.name === 'قم')!;
    expect(placePoint({ provinceId: qom.id, cityId: qom.capitalId })).toEqual(cityPoint(qom.capitalId));
  });

  it('شهری که مختصات ندارد، و جایی که فقط استان دارد، مرکز استان (سؤال ۲۶۲)', () => {
    const missing = CITIES.find((c) => cityPoint(c.id) === undefined)!;
    expect(missing).toBeDefined();
    const capital = cityPoint(PROVINCES.find((p) => p.id === missing.provinceId)!.capitalId);
    expect(placePoint({ provinceId: missing.provinceId, cityId: missing.id })).toEqual(capital);
    expect(placePoint({ provinceId: missing.provinceId, cityId: null })).toEqual(capital);
  });

  it('استانی که نیست، یا شهری از استان دیگر: null', () => {
    expect(placePoint({ provinceId: 99, cityId: null })).toBeNull();
    const tehran = cityId('تهران', 'تهران');
    expect(placePoint({ provinceId: PROVINCES.find((p) => p.name === 'فارس')!.id, cityId: tehran })).toBeNull();
  });
});
