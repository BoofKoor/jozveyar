/**
 * نقطهٔ جغرافیایی یک جا و فاصلهٔ خط مستقیم (برش ۱۰٫۱، ADR-060): تخصیص چاپخانه با فاصله، فقط در سرور. زیرمسیر جدا
 * (`@jozveyar/geo/coords`)، چون دادهٔ مختصات حدود ۳۲ کیلوبایت است و مرورگر لازمش ندارد: تکهٔ مسیر خرید فقط `@jozveyar/geo` را
 * می‌خواند (جست‌وجوی شهر)، نه این را.
 *
 * شهری که مختصات ندارد (کوچک‌ترین شهرها، که در GeoNames پیدا نشدند؛ `scripts/import-coords.py`) و سفارشی که فقط استان دارد
 * (شهرش در فهرست نبود) با مرکز همان استان سنجیده می‌شوند: مرکز استان درون همان استان است، پس تقریبش از «همیشه پیش‌فرض» بهتر است
 * (سؤال ۲۶۲). مرکز هر ۳۱ استان مختصات خودش را دارد و تست همین را قفل کرده.
 */

import { CITY_COORDS } from './coords.js';
import { findCity, findProvince } from './index.js';

export interface Point {
  lat: number;
  lon: number;
}

const byCity = new Map<number, Point>(CITY_COORDS.map(([id, lat, lon]) => [id, { lat, lon }]));

/** مختصات خود شهر؛ undefined اگر این شهر مختصات ندارد. */
export function cityPoint(cityId: number): Point | undefined {
  return byCity.get(cityId);
}

/**
 * نقطهٔ یک جا: خود شهر، وگرنه مرکز استان (شهری که مختصات ندارد، یا جایی که فقط استان دارد). null فقط برای استانی که نیست، یا
 * شهری که مال این استان نیست؛ هیچ‌کدام از سفارش یا چاپخانهٔ پایگاه داده نمی‌آید (کلید خارجی دوستونی شهر و استان).
 */
export function placePoint(place: { provinceId: number; cityId: number | null }): Point | null {
  const province = findProvince(place.provinceId);
  if (!province) return null;
  if (place.cityId !== null) {
    if (findCity(place.cityId)?.provinceId !== province.id) return null;
    const own = byCity.get(place.cityId);
    if (own) return own;
  }
  return byCity.get(province.capitalId) ?? null;
}

/** شعاع میانگین زمین، کیلومتر. */
const EARTH_KM = 6371;

/** فاصلهٔ خط مستقیم دو نقطه (کمان دایرهٔ بزرگ، فرمول هاورساین)، کیلومتر. */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
