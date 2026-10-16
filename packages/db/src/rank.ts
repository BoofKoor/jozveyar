/**
 * قاعدهٔ تخصیص چاپخانه، خالص (برش ۱۰٫۱، ADR-060): ترتیب چاپخانه‌ها برای یک سفارش (`rankPartners`)، در دسترس بودن در یک لحظه، و
 * روزهایی که همه تعطیل‌اند. جدا از `assignment.ts`، که تراکنش پرداخت را دارد، تا هر جا بی پایگاه داده بخواندش: ذخیره‌گاه حافظه‌ای سایت،
 * فهرست پیشنهادی پنل، و تست سرتاسری پنل که سفارش پرداخت‌شده را با همان قاعده می‌نشاند (`@jozveyar/db/rank`؛ Playwright خود
 * `@jozveyar/db` را بار نمی‌کند).
 */

import { distanceKm, placePoint } from '@jozveyar/geo/coords';
import { formatJalaliNumeric, tehranDayStart } from '@jozveyar/text';

/**
 * قاعدهٔ تخصیص خودکار: هم‌شهر مشتری، هم‌استان، نزدیک‌ترین چاپخانه (۱۰٫۱)، یا اولین چاپخانه‌ای که باز می‌شود وقتی همه تعطیل‌اند (سؤال
 * ۲۶۵). `default` و `oldest` فقط در تخصیص‌های پیش از ۱۰٫۱ (همان شهر و استان، وگرنه پیش‌فرض یا قدیمی‌ترین)، که ردیفشان می‌ماند.
 */
export type AssignmentRule = 'city' | 'province' | 'nearest' | 'reopening' | 'default' | 'oldest';

/** در دسترس بودن ذخیره‌شدهٔ چاپخانه (برش ۱۰٫۱، سؤال ۲۰۰). */
export type PartnerAvailability = 'open' | 'busy' | 'closed';

/** آنچه از یک چاپخانه برای «امروز باز است؟» لازم است. */
export interface PartnerHours {
  availability: PartnerAvailability;
  /** آغاز اولین روز تعطیل، نیمه‌شب تهران؛ فقط با `closed`. */
  closedFrom: Date | null;
  /** آغاز روز باز شدن، نیمه‌شب تهران (پایان انحصاری)؛ فقط با `closed`. */
  closedUntil: Date | null;
}

export interface PartnerCandidate extends PartnerHours {
  id: string;
  cityId: number;
  provinceId: number;
  isDefault: boolean;
  createdAt: Date;
}

/**
 * در دسترس بودن در یک لحظه: «تعطیل» فقط از آغاز اولین روزش تا آغاز روز باز شدن؛ پیش از آن (تعطیلی آینده) و پس از آن (گذشته)
 * «باز» است. «شلوغ» تا ادمین عوضش کند.
 */
export function availabilityAt(partner: PartnerHours, at: Date): PartnerAvailability {
  if (partner.availability !== 'closed') return partner.availability;
  const t = at.getTime();
  return partner.closedFrom && partner.closedUntil && partner.closedFrom.getTime() <= t && t < partner.closedUntil.getTime() ? 'closed' : 'open';
}

/** یک چاپخانه در فهرست تخصیص: قاعده‌ای که با آن انتخاب می‌شد، حالش در همان لحظه، و فاصله‌اش تا شهر مشتری. */
export interface RankedPartner<T extends PartnerCandidate = PartnerCandidate> {
  partner: T;
  rule: 'city' | 'province' | 'nearest' | 'reopening';
  state: PartnerAvailability;
  /** کیلومتر، خط مستقیم میان دو شهر (شهری که مختصات ندارد با مرکز استانش، `placePoint`). */
  distanceKm: number;
}

/**
 * همهٔ چاپخانه‌های فعال به ترتیب تخصیص (سؤال‌های ۱۹۸، ۲۰۰ و ۲۶۳ تا ۲۶۵): اولی همان است که پرداخت می‌گیرد، و پنل همین ترتیب را برای
 * فهرست پیشنهادی حالت دستی نشان می‌دهد.
 *
 * 1. باز در همان شهر، 2. باز در همان استان؛
 * 3. شلوغ در همان شهر و 4. شلوغ در همان استان، فقط وقتی هیچ چاپخانهٔ بازی در استان مشتری نیست («شلوغ فقط وقتی سفارش می‌گیرد که
 *    چاپخانهٔ باز دیگری در همان استان نباشد»)؛
 * 5. باز در استان‌های دیگر، 6. بقیهٔ شلوغ‌ها؛
 * 7. تعطیل، به ترتیب روز باز شدن: وقتی هیچ چاپخانه‌ای باز یا شلوغ نیست، سفارش پیش اولین چاپخانه‌ای می‌ماند که باز می‌شود، نه
 *    بی چاپخانه (سؤال ۲۶۵).
 *
 * در هر سطح نزدیک‌ترین به شهر مشتری، بعد پیش‌فرض، بعد قدیمی‌ترین؛ در همان شهر فاصله صفر است، پس همان پیش‌فرض و قدیمی‌ترین ۵٫۲.
 * سفارشی که شهرش در فهرست نبود (`cityId` null) از سطح استان شروع می‌کند و با مرکز استانش سنجیده می‌شود.
 */
export function rankPartners<T extends PartnerCandidate>(
  candidates: readonly T[],
  place: { cityId: number | null; provinceId: number },
  at: Date,
): RankedPartner<T>[] {
  const from = placePoint(place);
  const states = candidates.map((partner) => availabilityAt(partner, at));
  const openInProvince = candidates.some((partner, i) => states[i] === 'open' && partner.provinceId === place.provinceId);
  const ranked = candidates.map((partner, i) => {
    const state = states[i]!;
    const city = place.cityId !== null && partner.cityId === place.cityId;
    const province = partner.provinceId === place.provinceId;
    const to = placePoint(partner);
    const distance = from && to ? distanceKm(from, to) : Number.POSITIVE_INFINITY;
    const [tier, rule]: [number, RankedPartner['rule']] =
      state === 'closed'
        ? [7, 'reopening']
        : state === 'open'
          ? city
            ? [1, 'city']
            : province
              ? [2, 'province']
              : [5, 'nearest']
          : !openInProvince && city
            ? [3, 'city']
            : !openInProvince && province
              ? [4, 'province']
              : [6, 'nearest'];
    return { tier, entry: { partner, rule, state, distanceKm: distance } };
  });
  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.tier === 7 ? (a.entry.partner.closedUntil?.getTime() ?? 0) - (b.entry.partner.closedUntil?.getTime() ?? 0) : 0) ||
      a.entry.distanceKm - b.entry.distanceKm ||
      Number(b.entry.partner.isDefault) - Number(a.entry.partner.isDefault) ||
      a.entry.partner.createdAt.getTime() - b.entry.partner.createdAt.getTime() ||
      (a.entry.partner.id < b.entry.partner.id ? -1 : a.entry.partner.id > b.entry.partner.id ? 1 : 0),
  );
  return ranked.map((item) => item.entry);
}

/** چاپخانهٔ سفارش از میان چاپخانه‌های فعال (`rankPartners`)؛ null یعنی هیچ چاپخانهٔ فعالی نیست. */
export function choosePartner(
  candidates: readonly PartnerCandidate[],
  place: { cityId: number | null; provinceId: number },
  at: Date,
): { partnerId: string; rule: RankedPartner['rule'] } | null {
  const first = rankPartners(candidates, place, at)[0];
  return first ? { partnerId: first.partner.id, rule: first.rule } : null;
}

/**
 * روزهایی که همهٔ چاپخانه‌های فعال تعطیل‌اند (سؤال ۲۶۵): اشتراک بازه‌های تعطیل، `[from, until)`؛ null اگر یکی تعطیلی ندارد یا
 * بازه‌ها هم را نمی‌پوشانند، یا اصلاً چاپخانهٔ فعالی نیست. این روزها در مهلت تحویل به پست روز کاری نیستند (`settleWith`)، و سایت تا
 * پایانشان نوار «چاپخانه‌ها تعطیل‌اند» نشان می‌دهد.
 */
export function allClosedWindow(partners: readonly PartnerHours[]): { from: Date; until: Date } | null {
  if (partners.length === 0) return null;
  let from = Number.NEGATIVE_INFINITY;
  let until = Number.POSITIVE_INFINITY;
  for (const partner of partners) {
    if (partner.availability !== 'closed' || !partner.closedFrom || !partner.closedUntil) return null;
    from = Math.max(from, partner.closedFrom.getTime());
    until = Math.min(until, partner.closedUntil.getTime());
  }
  return from < until ? { from: new Date(from), until: new Date(until) } : null;
}

/**
 * روزهای «همه تعطیل» به شکل تعطیلی‌های `calendar.holidays` (`1405/07/25`)، برای `postHandoffDue`: مهلت سفارشی که در این روزها یا پیش
 * از آن پرداخت شود این روزها را روز کاری نمی‌شمارد. بازه حداکثر یک سال است (`print_partners_closed`).
 */
export function closedDays(window: { from: Date; until: Date } | null): string[] {
  if (!window) return [];
  const days: string[] = [];
  for (let day = tehranDayStart(window.from); day.getTime() < window.until.getTime() && days.length <= 366; day = tehranDayStart(day, 1)) {
    days.push(formatJalaliNumeric(day));
  }
  return days;
}
