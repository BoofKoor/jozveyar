/**
 * چاپخانه‌ها به زبان پنل (طرح پنل برش ۵، `m-partners`، `m-partner-edit`، `m-order` و `m-order-assign`؛ ADR-042): نام و شهر
 * چاپخانه در فرم، فهرست «چاپخانه‌ها»، کارت چاپخانهٔ سفارش و تاریخچهٔ تخصیص. خالص و بی JSX، مثل `orders.ts`: تست بی مرورگر
 * می‌سنجدش و صفحه فقط می‌چیندش.
 *
 * شهر همان فهرست شهرهای سایت است (`@jozveyar/geo`): فیلد شهر با `datalist` پیشنهاد می‌دهد («مشهد، خراسان رضوی»)، و سرور
 * متن را به یک شهر برمی‌گرداند؛ نام تنهای شهر هم پذیرفته است وقتی فقط یک شهر با آن نام هست، وگرنه چند پیشنهاد.
 */

import type { AssignmentRule, PanelAssignment, PanelOrderDetails, PartnerView } from '@jozveyar/db';
import { CITIES, findCity, findProvince, searchCities, searchKey, type City } from '@jozveyar/geo';
import { formatJalaliNumeric, formatNumber } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import type { Seg } from './orders';

/** همان محدودیت `print_partners_name`. */
export const PARTNER_NAME_MAX = 100;

/** نام چاپخانه، فارسی‌نرمال؛ null اگر خالی یا بلندتر از سقف است. */
export function partnerNameOf(input: unknown): string | null {
  const name = tidyInputFa(typeof input === 'string' ? input.slice(0, 1000) : '');
  return name.length >= 1 && name.length <= PARTNER_NAME_MAX ? name : null;
}

/** «مشهد، خراسان رضوی»: شهر با استانش، همان گزینهٔ فیلد شهر. */
export function cityLabel(city: City): string {
  return `${city.name}، ${findProvince(city.provinceId)?.name ?? ''}`;
}

/** همهٔ شهرها برای `datalist` فیلد شهر، به ترتیب فهرست سایت. */
export const cityOptions = (): string[] => CITIES.map(cityLabel);

export type CityPick = { ok: true; city: City } | { ok: false; reason: 'empty' | 'unknown' | 'ambiguous'; suggestions: City[] };

/**
 * متن فیلد شهر به یک شهر: گزینهٔ فهرست («مشهد، خراسان رضوی»)، یا نام تنهای شهری که فقط یکی است («مشهد»). نام مشترک دو استان
 * چند پیشنهاد می‌گیرد، و متنی که شهر نیست پیشنهادهای جست‌وجوی سایت را.
 */
export function pickCity(input: unknown): CityPick {
  const text = tidyInputFa(typeof input === 'string' ? input.slice(0, 200) : '');
  if (!text) return { ok: false, reason: 'empty', suggestions: [] };
  const parts = text.split(/[،,]/);
  const [name, province] = parts.map((part) => searchKey(part));
  const named = CITIES.filter((city) => searchKey(city.name) === name);
  if (province !== undefined) {
    const exact = named.filter((city) => searchKey(findProvince(city.provinceId)?.name ?? '') === province);
    if (exact.length === 1) return { ok: true, city: exact[0]! };
  } else if (named.length === 1) {
    return { ok: true, city: named[0]! };
  }
  if (named.length > 1) return { ok: false, reason: 'ambiguous', suggestions: named.slice(0, 8) };
  return { ok: false, reason: 'unknown', suggestions: searchCities(parts[0] ?? text, 8) };
}

/** قاعدهٔ تخصیص خودکار، همان متن طرح: «خودکار، هنگام پرداخت: هم‌شهر مشتری.» */
export const RULE_TEXT: Record<AssignmentRule, string> = {
  city: 'هم‌شهر مشتری',
  province: 'هم‌استان مشتری',
  default: 'چاپخانهٔ پیش‌فرض',
  oldest: 'قدیمی‌ترین چاپخانهٔ فعال',
};

/**
 * خط دوم فهرست «چاپخانه‌ها» (طرح): «تهران · 8 سفارش باز · کاربرها: همان مالک و متصدی»، و برای غیرفعال «اصفهان · از
 * 1405/07/01 سفارش تازه نمی‌گیرد». تا ۵٫۳ (نقش چاپخانه) هر چاپخانه را همان مالک و متصدی می‌گردانند.
 */
export function partnerMeta(partner: PartnerView): Seg[] {
  if (partner.deactivatedAt) {
    return [partner.cityName, ' · از ', { num: formatJalaliNumeric(partner.deactivatedAt) }, ' سفارش تازه نمی‌گیرد'];
  }
  return [partner.cityName, ' · ', { num: formatNumber(partner.openOrders) }, ' سفارش باز · کاربرها: همان مالک و متصدی'];
}

/**
 * خط زیر نام چاپخانه در کارت سفارش (طرح): از کجا آمد. تخصیص خودکار «خودکار، هنگام پرداخت: هم‌شهر مشتری.»، و جابه‌جایی «جابه‌جا
 * شد: …» با دلیلش؛ کی و که، کنارش در رویدادهای سفارش.
 */
export function assignmentNote(assignment: PanelAssignment | undefined): string | null {
  if (!assignment) return null;
  if (assignment.actor === 'system') return `خودکار، هنگام پرداخت: ${assignment.rule ? RULE_TEXT[assignment.rule] : 'قاعدهٔ تخصیص'}.`;
  return `${assignment.fromName ? 'جابه‌جا شد' : 'دستی سپرده شد'}${assignment.adminName ? `، ${assignment.adminName}` : ''}: ${assignment.reason ?? ''}`;
}

/**
 * سطر تاریخچهٔ تخصیص در رویدادهای سفارش (طرح): «به چاپ نور سپرده شد، هم‌شهر مشتری» (سیستم)، «از «چاپ نور» به «چاپخانهٔ
 * جزوه‌یار» رفت؛ دستگاه چاپ نور تا فردا خراب است» (ادمین)، و برای سفارشی که چاپخانه نداشت «به … سپرده شد؛ …».
 */
export function assignmentText(assignment: PanelAssignment): Seg[] {
  if (assignment.actor === 'system') {
    return [`به ${assignment.toName} سپرده شد${assignment.rule ? `، ${RULE_TEXT[assignment.rule]}` : ''}`];
  }
  const why = assignment.reason ? `؛ ${assignment.reason}` : '';
  return assignment.fromName
    ? [`از «${assignment.fromName}» به «${assignment.toName}» رفت${why}`]
    : [`به ${assignment.toName} سپرده شد${why}`];
}

/** چاپخانه در کارت سفارش: فقط برای سفارش پرداخت‌شده؛ پرداخت‌نشده هنوز چاپخانه ندارد. */
export function partnerCard(details: PanelOrderDetails): { note: string | null } | null {
  const paid = ['paid', 'printing', 'handed_to_post', 'cancelled'].includes(details.order.status);
  if (!paid) return null;
  return { note: assignmentNote(details.assignments.at(-1)) };
}

/** شهر چاپخانه‌ای که در فرم هست، برای مقدار اولیهٔ فیلد. */
export const partnerCityLabel = (partner: Pick<PartnerView, 'cityId'>): string => {
  const city = findCity(partner.cityId);
  return city ? cityLabel(city) : '';
};
