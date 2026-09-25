/**
 * استان‌ها، شهرها، منطقهٔ کرایه و جست‌وجوی شهر — برای مسیر خرید (برش ۳).
 *
 * خالص و بی I/O. مرورگر در قدم شهر همین را می‌خواند (در تکهٔ تنبل مسیر خرید، نه باندل اولیه)،
 * سرور شهر سفارش را با همین می‌سنجد، و پایگاه داده جدول‌های `provinces` و `cities` را از همین پر
 * می‌کند (`seedReferenceData`) تا سفارش به شهر کلید خارجی داشته باشد.
 *
 * منطقهٔ کرایه مال **استان** است، نه شهر: «تهران» در تعرفه یعنی استان تهران، پس پردیس و قرچک
 * کرایهٔ تهران را دارند و کرج (البرز) کرایهٔ بقیهٔ کشور را (سؤال ۹، ۱۴۰۵/۰۷/۰۴).
 */

import { normalizeFa } from '@jozveyar/text';

import { CITY_ROWS, POPULAR_CITY_IDS, PROVINCE_ROWS, type ShippingZoneId } from './data.js';

export type { ShippingZoneId };

export interface ShippingZone {
  id: ShippingZoneId;
  /** نامی که کارت شهر کنار کرایه‌اش می‌نویسد. */
  name: string;
}

/** منطقه‌های کرایه، با همان شناسه‌های `shippingRates` تعرفه. */
export const SHIPPING_ZONES: readonly ShippingZone[] = [
  { id: 'tehran', name: 'استان تهران' },
  { id: 'other', name: 'بقیهٔ کشور' },
];

export interface Province {
  id: number;
  name: string;
  zone: ShippingZoneId;
  /** شهر مرکز استان؛ در جست‌وجو پیش از هم‌نام‌های کوچک‌تر می‌آید. */
  capitalId: number;
}

export interface City {
  id: number;
  provinceId: number;
  name: string;
}

export const PROVINCES: readonly Province[] = PROVINCE_ROWS.map(([id, name, zone, capitalId]) => ({
  id,
  name,
  zone,
  capitalId,
}));

export const CITIES: readonly City[] = CITY_ROWS.map(([id, provinceId, name]) => ({ id, provinceId, name }));

const provinceById = new Map(PROVINCES.map((p) => [p.id, p]));
const cityById = new Map(CITIES.map((c) => [c.id, c]));

export function findProvince(id: number): Province | undefined {
  return provinceById.get(id);
}

export function findCity(id: number): City | undefined {
  return cityById.get(id);
}

/** منطقهٔ کرایهٔ یک استان؛ null یعنی چنین استانی نیست. */
export function shippingZoneOf(provinceId: number): ShippingZoneId | null {
  return provinceById.get(provinceId)?.zone ?? null;
}

/**
 * جای ارسال معتبر است؟ استان همیشه لازم است؛ شهر نه، چون کاربری که شهرش در فهرست نیست استان را
 * انتخاب می‌کند و نام شهر یا روستا را در نشانی می‌نویسد. اگر شهر هست، باید مال همان استان باشد.
 */
export function placeIsValid(provinceId: number, cityId: number | null): boolean {
  if (!provinceById.has(provinceId)) return false;
  if (cityId === null) return true;
  return cityById.get(cityId)?.provinceId === provinceId;
}

/** هشت شهر پرتکرار، به ترتیب دکمه‌ها. */
export function popularCities(): City[] {
  return POPULAR_CITY_IDS.map((id) => cityById.get(id)!);
}

/* ───────────────────────────── جست‌وجو ───────────────────────────── */

/** فارسی‌نرمال، و همزه، پرانتز و فاصله بی‌اثر: «بندر عباس»، «بندرعباس» و «نایین»/«نائین» یکی‌اند. */
function searchWords(text: string): string[] {
  return normalizeFa(text)
    .replace(/ئ/g, 'ی')
    .replace(/ۀ/g, 'ه')
    .replace(/ء/g, '')
    .replace(/[()]/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** کلید مقایسهٔ یک نام: همان واژه‌ها، چسبیده. */
export function searchKey(text: string): string {
  return searchWords(text).join('');
}

interface Entry {
  city: City;
  key: string;
  words: string[];
  /** شهر پرتکرار زودتر، بعد مرکز استان، بعد بقیه. */
  weight: number;
}

let index: Entry[] | null = null;
const collator = new Intl.Collator('fa');

/** فقط با اولین جست‌وجو ساخته می‌شود. */
function entries(): Entry[] {
  if (index) return index;
  const capitals = new Set(PROVINCES.map((p) => p.capitalId));
  const popular = new Map(POPULAR_CITY_IDS.map((id, rank) => [id, rank]));
  index = CITIES.map((city) => {
    const words = searchWords(city.name);
    const rank = popular.get(city.id);
    return {
      city,
      key: words.join(''),
      words,
      weight: rank !== undefined ? rank : capitals.has(city.id) ? 100 : 200,
    };
  });
  return index;
}

/**
 * شهرها برای جست‌وجوی کاربر، بهترین اول: اول نام‌هایی که با همین شروع می‌شوند، بعد نام‌هایی که
 * یکی از واژه‌هایشان با این شروع می‌شود («آباد» ← «حسن‌آباد»)، بعد هر جای نام. در هر دسته شهر
 * پرتکرار و مرکز استان جلوترند و بعد نام کوتاه‌تر: «کرمان» پیش از «کرمانشاه».
 */
export function searchCities(query: string, limit = 8): City[] {
  const q = searchKey(query);
  if (!q) return [];
  const hits: { entry: Entry; match: number }[] = [];
  for (const entry of entries()) {
    const match = entry.key.startsWith(q) ? 0 : entry.words.some((w) => w.startsWith(q)) ? 1 : entry.key.includes(q) ? 2 : -1;
    if (match >= 0) hits.push({ entry, match });
  }
  hits.sort(
    (a, b) =>
      a.match - b.match ||
      a.entry.weight - b.entry.weight ||
      a.entry.key.length - b.entry.key.length ||
      collator.compare(a.entry.city.name, b.entry.city.name),
  );
  return hits.slice(0, limit).map((hit) => hit.entry.city);
}
