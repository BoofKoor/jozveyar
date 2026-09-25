import { describe, expect, it } from 'vitest';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import {
  CITIES,
  PROVINCES,
  SHIPPING_ZONES,
  findCity,
  placeIsValid,
  popularCities,
  searchCities,
  searchKey,
  shippingZoneOf,
  type City,
} from './index.js';

/** شهر با نام و استان؛ اگر نبود یا دوتا بود، تست همین‌جا می‌افتد نه با پیام گنگ پایین‌تر. */
function place(name: string, provinceName: string): City {
  const province = PROVINCES.find((p) => p.name === provinceName);
  const hits = CITIES.filter((c) => c.name === name && c.provinceId === province?.id);
  expect(hits, `${name} در ${provinceName}`).toHaveLength(1);
  return hits[0]!;
}

const names = (cities: readonly City[]) => cities.map((c) => c.name);

describe('داده', () => {
  it('۳۱ استان، شناسه و نام یکتا', () => {
    expect(PROVINCES).toHaveLength(31);
    expect(new Set(PROVINCES.map((p) => p.id)).size).toBe(31);
    expect(new Set(PROVINCES.map((p) => p.name)).size).toBe(31);
  });

  it('هر شهر استانی دارد، شناسه‌ها یکتا، و در یک استان دو شهر هم‌کلید نیست', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(1300);
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    for (const city of CITIES) expect(PROVINCES.some((p) => p.id === city.provinceId), city.name).toBe(true);
    const keys = new Set<string>();
    for (const city of CITIES) {
      const key = `${city.provinceId}|${searchKey(city.name)}`;
      expect(keys.has(key), `تکراری: ${city.name}`).toBe(false);
      keys.add(key);
    }
  });

  it('نام‌ها تمیزند: بی حرف عربی، رقم، حرف لاتین یا فاصلهٔ اضافه', () => {
    for (const { name } of [...CITIES, ...PROVINCES]) {
      expect(name, name).not.toMatch(/[يكة0-9A-Za-z]|^\s|\s$|\s{2}/);
      expect(name, name).not.toMatch(/(^|\s)اباد/);
    }
  });

  it('مرکز هر استان شهری از همان استان است', () => {
    for (const province of PROVINCES) {
      expect(findCity(province.capitalId)?.provinceId, province.name).toBe(province.id);
    }
    const capital = (name: string) => findCity(PROVINCES.find((p) => p.name === name)!.capitalId)?.name;
    expect(capital('تهران')).toBe('تهران');
    expect(capital('البرز')).toBe('کرج');
    expect(capital('هرمزگان')).toBe('بندرعباس');
    expect(capital('چهارمحال و بختیاری')).toBe('شهرکرد');
  });

  it('هشت شهر پرتکرار به ترتیب دکمه‌های طرح، هر کدام در استان خودش', () => {
    expect(names(popularCities())).toEqual(['تهران', 'مشهد', 'اصفهان', 'کرج', 'شیراز', 'تبریز', 'قم', 'اهواز']);
    expect(popularCities()[1]).toEqual(place('مشهد', 'خراسان رضوی'));
    expect(popularCities()[3]).toEqual(place('کرج', 'البرز'));
  });
});

describe('منطقهٔ کرایه: استان تهران، نه شهر تهران (سؤال ۹)', () => {
  it('فقط استان تهران منطقهٔ tehran است', () => {
    expect(PROVINCES.filter((p) => p.zone === 'tehran').map((p) => p.name)).toEqual(['تهران']);
  });

  it('پردیس، قرچک، اسلامشهر و ورامین کرایهٔ تهران؛ کرج، هشتگرد و مشهد کرایهٔ بقیهٔ کشور', () => {
    for (const name of ['تهران', 'پردیس', 'قرچک', 'اسلامشهر', 'ورامین']) {
      expect(shippingZoneOf(place(name, 'تهران').provinceId), name).toBe('tehran');
    }
    expect(shippingZoneOf(place('کرج', 'البرز').provinceId)).toBe('other');
    expect(shippingZoneOf(place('هشتگرد', 'البرز').provinceId)).toBe('other');
    expect(shippingZoneOf(place('مشهد', 'خراسان رضوی').provinceId)).toBe('other');
    expect(shippingZoneOf(99)).toBeNull();
  });

  it('هر منطقه در تعرفه برای هر وزنی کرایه دارد', () => {
    const zones = new Set(PROVINCES.map((p) => p.zone));
    expect([...zones].sort()).toEqual(SHIPPING_ZONES.map((z) => z.id).sort());
    for (const zone of zones) {
      for (const pageCount of [2, 1500]) {
        const breakdown = quote(
          {
            items: [
              {
                sections: [{ documentId: 'd', pageCount }],
                rules: [{ pageRanges: [[1, pageCount]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
                copies: pageCount === 2 ? 1 : 10,
                sidesMode: 'double',
                bindingTypeId: 'spiral_clear',
              },
            ],
            shipping: { methodId: 'post', zoneId: zone },
          },
          SEED_PRICE_LIST,
        );
        expect(breakdown.shippingRials, `${zone}، ${pageCount} صفحه`).not.toBeNull();
      }
    }
  });
});

describe('جای ارسال', () => {
  it('شهر باید مال همان استان باشد؛ بی شهر، فقط استان', () => {
    const pardis = place('پردیس', 'تهران');
    expect(placeIsValid(pardis.provinceId, pardis.id)).toBe(true);
    expect(placeIsValid(place('کرج', 'البرز').provinceId, pardis.id)).toBe(false);
    expect(placeIsValid(pardis.provinceId, null)).toBe(true);
    expect(placeIsValid(99, null)).toBe(false);
    expect(placeIsValid(pardis.provinceId, 999_999)).toBe(false);
  });
});

describe('جست‌وجوی شهر', () => {
  it('فاصله، نیم‌فاصله، همزه، مد و حرف عربی در کلید اثری ندارند', () => {
    expect(searchKey('بندر عباس')).toBe(searchKey('بندرعباس'));
    expect(searchKey('حسن‌آباد')).toBe(searchKey('حسن آباد'));
    expect(searchKey('حسن‌آباد')).toBe(searchKey('حسناباد'));
    expect(searchKey('نائین')).toBe(searchKey('نایین'));
    expect(searchKey('كرج')).toBe(searchKey('کرج'));
    expect(searchKey('  ')).toBe('');
  });

  it('نام‌هایی که با همین شروع می‌شوند اول، و مرکز استان پیش از بقیه', () => {
    const bandar = searchCities('بندر');
    expect(bandar[0]?.name).toBe('بندرعباس');
    expect(bandar).toHaveLength(8);
    for (const city of bandar) expect(searchKey(city.name).startsWith('بندر'), city.name).toBe(true);
  });

  it('نام کوتاه‌تر پیش از بلندتر، و پرتکرار پیش از همه', () => {
    expect(names(searchCities('کرمان')).slice(0, 2)).toEqual(['کرمان', 'کرمانشاه']);
    expect(searchCities('مشهد')[0]?.name).toBe('مشهد');
    expect(searchCities('ت')[0]?.name).toBe('تهران');
  });

  it('با حرف عربی و فاصلهٔ اضافه هم پیدا می‌کند', () => {
    expect(searchCities('كرج')[0]?.name).toBe('کرج');
    expect(searchCities('  بندر   عباس ')[0]?.name).toBe('بندرعباس');
  });

  it('واژهٔ وسط نام پیدا می‌شود، ولی پس از نام‌هایی که با آن شروع می‌شوند', () => {
    const found = names(searchCities('آباد', 50));
    expect(found.length).toBeGreaterThan(10);
    const firstWordStart = found.findIndex((n) => !searchKey(n).startsWith('اباد'));
    expect(found.slice(firstWordStart).every((n) => !searchKey(n).startsWith('اباد'))).toBe(true);
    expect(found).toContain('حسن‌آباد');
  });

  it('جست‌وجوی خالی یا بی‌نتیجه چیزی نمی‌دهد، و سقف رعایت می‌شود', () => {
    expect(searchCities('')).toEqual([]);
    expect(searchCities('zzz')).toEqual([]);
    expect(searchCities('ا', 3)).toHaveLength(3);
  });
});
