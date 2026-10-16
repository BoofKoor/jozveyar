/**
 * چاپخانه‌ها به زبان پنل (طرح پنل برش ۵، `m-partners`، `m-partner-edit`، `m-order` و `m-order-assign`؛ ADR-042): نام و شهر
 * چاپخانه در فرم، فهرست «چاپخانه‌ها»، کارت چاپخانهٔ سفارش و تاریخچهٔ تخصیص. خالص و بی JSX، مثل `orders.ts`: تست بی مرورگر
 * می‌سنجدش و صفحه فقط می‌چیندش.
 *
 * شهر همان فهرست شهرهای سایت است (`@jozveyar/geo`): فیلد شهر با `datalist` پیشنهاد می‌دهد («مشهد، خراسان رضوی»)، و سرور
 * متن را به یک شهر برمی‌گرداند؛ نام تنهای شهر هم پذیرفته است وقتی فقط یک شهر با آن نام هست، وگرنه چند پیشنهاد.
 */

import {
  availabilityAt,
  type AssignmentRule,
  type AvailabilityState,
  type PanelAssignment,
  type PanelOrderDetails,
  type PanelPartnerOption,
  type PartnerHours,
  type PartnerView,
  type RankedPartner,
} from '@jozveyar/db';
import { CITIES, findCity, findProvince, searchCities, searchKey, type City } from '@jozveyar/geo';
import { formatDeadlineDay, formatJalaliNumeric, formatJalaliWeekday, formatNumber, parseJalaliNumeric, tehranDayStart } from '@jozveyar/text';
import { normalizeIranMobile, tidyInputFa } from '@jozveyar/text/input';

import { phoneText } from './format';
import type { Seg } from './orders';

/** همان محدودیت `print_partners_name`. */
export const PARTNER_NAME_MAX = 100;

/** نام چاپخانه، فارسی‌نرمال؛ null اگر خالی یا بلندتر از سقف است. */
export function partnerNameOf(input: unknown): string | null {
  const name = tidyInputFa(typeof input === 'string' ? input.slice(0, 1000) : '');
  return name.length >= 1 && name.length <= PARTNER_NAME_MAX ? name : null;
}

/**
 * موبایل اعلان فرم (برش ۷٫۶، سؤال‌های ۱۲۶ و ۱۷۷): خالی یعنی بی پیامک (null)؛ وگرنه همان شکل‌های موبایل ایران سایت (ارقام فارسی،
 * `+98`، `0098`، فاصله و خط تیره) به `09…`. شمارهٔ ناموبایل `ok: false`.
 */
export function partnerMobileOf(input: unknown): { ok: true; mobile: string | null } | { ok: false } {
  const text = typeof input === 'string' ? input.slice(0, 100).trim() : '';
  if (!text) return { ok: true, mobile: null };
  const mobile = normalizeIranMobile(text);
  return mobile ? { ok: true, mobile } : { ok: false };
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

/**
 * قاعدهٔ تخصیص خودکار، همان متن طرح: «خودکار، هنگام پرداخت: هم‌شهر مشتری.» `default` و `oldest` فقط در تخصیص‌های پیش از ۱۰٫۱ می‌آیند،
 * و `nearest` و `reopening` از ۱۰٫۱ (سؤال‌های ۲۶۳ و ۲۶۵).
 */
export const RULE_TEXT: Record<AssignmentRule, string> = {
  city: 'هم‌شهر مشتری',
  province: 'هم‌استان مشتری',
  nearest: 'نزدیک‌ترین چاپخانه به شهر مشتری',
  reopening: 'همه تعطیل بودند؛ اولین چاپخانه‌ای که باز می‌شود',
  default: 'چاپخانهٔ پیش‌فرض',
  oldest: 'قدیمی‌ترین چاپخانهٔ فعال',
};

/* ───────────────────────── در دسترس بودن (برش ۱۰٫۱) ───────────────────────── */

/** حال یک چاپخانه در پنل: «باز»، «شلوغ»، «تعطیل تا …»، یا باز با تعطیلی آینده. */
export type AvailabilityTone = 'open' | 'busy' | 'closed' | 'scheduled';

/**
 * چیپ در دسترس بودن (سؤال ۲۶۷): «باز»، «شلوغ»، «تعطیل تا سه‌شنبه 28 مهر»، و تعطیلی آینده «از شنبه 2 آبان تا دوشنبه 4 آبان تعطیل». تعطیلی
 * گذشته همان «باز» است.
 */
export function availabilityView(hours: PartnerHours, at: Date): { tone: AvailabilityTone; text: string } {
  const state = availabilityAt(hours, at);
  if (state === 'closed') return { tone: 'closed', text: `تعطیل تا ${formatDeadlineDay(hours.closedUntil!)}` };
  if (state === 'busy') return { tone: 'busy', text: 'شلوغ' };
  if (hours.availability === 'closed' && hours.closedFrom && hours.closedUntil && hours.closedFrom.getTime() > at.getTime()) {
    return { tone: 'scheduled', text: `از ${formatJalaliWeekday(hours.closedFrom)} تا ${formatDeadlineDay(hours.closedUntil)} تعطیل` };
  }
  return { tone: 'open', text: 'باز' };
}

/** «همان که دیده شد» فرم در دسترس بودن: حال، روزها و یادداشت در یک رشته. */
export const availabilitySeen = (state: AvailabilityState): string =>
  [state.availability, state.closedFrom?.toISOString() ?? '', state.closedUntil?.toISOString() ?? '', state.note ?? ''].join('|');

/** حال ذخیره‌شدهٔ یک چاپخانه به شکل فرم. */
export const availabilityStateOf = (partner: PartnerHours & { availabilityNote: string | null }): AvailabilityState => ({
  availability: partner.availability,
  closedFrom: partner.closedFrom,
  closedUntil: partner.closedUntil,
  note: partner.availabilityNote,
});

/** یادداشت «شلوغ» و «تعطیل»: همان محدودیت `print_partners_availability_note`. */
export const AVAILABILITY_NOTE_MAX = 200;
/** «تا» حداکثر این‌قدر روز پس از امروز (سؤال ۲۶۶): تعطیلی بلندتر یعنی غیرفعال کردن. */
export const CLOSURE_MAX_DAYS = 90;

export type AvailabilityField = 'availability' | 'from' | 'until' | 'note';
export type AvailabilityError =
  | 'invalid_availability'
  | 'invalid_day'
  | 'invalid_last_day'
  | 'day_past'
  | 'day_order'
  | 'day_too_far'
  | 'availability_note_too_long';

/**
 * فرم در دسترس بودن (سؤال‌های ۲۶۶ و ۲۶۷): «باز»، «شلوغ» یا «تعطیل» با روز اول و روز آخر به تقویم شمسی (`1405/07/25`، ارقام فارسی هم)،
 * دوسرشامل، از امروز تا ۹۰ روز بعد؛ یادداشت فارسی‌نرمال، اختیاری، فقط برای شلوغ و تعطیل. روزها به آغاز روز اول و آغاز روز پس از روز آخر
 * (پایان انحصاری)، مثل ستون‌های `print_partners`. روز اولِ گذشته فقط همان تعطیلی‌ای است که همین حالا برقرار است (`current`): فرمش همان
 * روز را دارد، تا روز آخر یا یادداشتش بی جابه‌جا کردن آغازش عوض شود.
 */
export function availabilityOf(
  input: { availability: unknown; from: unknown; until: unknown; note: unknown },
  now: Date,
  current?: PartnerHours,
): { ok: true; state: AvailabilityState } | { ok: false; field: AvailabilityField; error: AvailabilityError } {
  const availability = input.availability;
  if (availability !== 'open' && availability !== 'busy' && availability !== 'closed') return { ok: false, field: 'availability', error: 'invalid_availability' };
  const noteText = tidyInputFa(typeof input.note === 'string' ? input.note.slice(0, 1000) : '');
  if (availability !== 'open' && noteText.length > AVAILABILITY_NOTE_MAX) return { ok: false, field: 'note', error: 'availability_note_too_long' };
  const note = availability === 'open' || !noteText ? null : noteText;
  if (availability !== 'closed') return { ok: true, state: { availability, closedFrom: null, closedUntil: null, note } };
  const from = typeof input.from === 'string' ? parseJalaliNumeric(input.from) : null;
  if (!from) return { ok: false, field: 'from', error: 'invalid_day' };
  const last = typeof input.until === 'string' ? parseJalaliNumeric(input.until) : null;
  if (!last) return { ok: false, field: 'until', error: 'invalid_last_day' };
  const today = tehranDayStart(now);
  const ongoing = current !== undefined && availabilityAt(current, now) === 'closed' && current.closedFrom?.getTime() === from.getTime();
  if (from.getTime() < today.getTime() && !ongoing) return { ok: false, field: 'from', error: 'day_past' };
  if (last.getTime() < from.getTime()) return { ok: false, field: 'until', error: 'day_order' };
  if (last.getTime() > tehranDayStart(now, CLOSURE_MAX_DAYS).getTime()) return { ok: false, field: 'until', error: 'day_too_far' };
  return { ok: true, state: { availability, closedFrom: from, closedUntil: tehranDayStart(last, 1), note } };
}

/** روز آخر تعطیل در فیلد «تا» (`1405/07/28`): روز پیش از پایان انحصاری. */
export const closedLastDay = (closedUntil: Date): string => formatJalaliNumeric(new Date(closedUntil.getTime() - 1));

/**
 * خط زیر نام هر گزینه در فهرست جابه‌جایی و سپردن (سؤال ۲۶۹): شهر، پیش‌فرض و سفارش‌های باز مثل ۵٫۲، و از ۱۰٫۱ چرا اینجای فهرست است:
 * «هم‌شهر مشتری»، «هم‌استان، 72 کیلومتر»، «320 کیلومتر»، با «شلوغ» یا «تعطیل تا …».
 */
export function optionNote(ranked: RankedPartner<PanelPartnerOption>, at: Date): Seg[] {
  const { partner, rule, state } = ranked;
  const km = Number.isFinite(ranked.distanceKm) ? Math.round(ranked.distanceKm) : null;
  const why: Seg[] =
    rule === 'city'
      ? ['هم‌شهر مشتری']
      : rule === 'province'
        ? ['هم‌استان مشتری', ...(km !== null ? ['، ', { num: formatNumber(km) }, ' کیلومتر'] : [])]
        : km !== null
          ? [{ num: formatNumber(km) }, ' کیلومتر']
          : [];
  const status: Seg[] = state === 'busy' ? [' · شلوغ'] : state === 'closed' ? [` · ${availabilityView(partner, at).text}`] : [];
  return [
    partner.cityName,
    ...(partner.isDefault ? [' · پیش‌فرض'] : []),
    ' · ',
    { num: formatNumber(partner.openOrders) },
    ' سفارش باز',
    ...(why.length ? [' · ', ...why] : []),
    ...status,
  ];
}

/** «کاربر: حسن نوری»، «کاربرها: حسن نوری، رضا کریمی»؛ چاپخانهٔ بی کاربر را همان مالک و متصدی می‌گردانند (برش ۵٫۳). */
function usersText(users: readonly string[]): string {
  if (users.length === 0) return 'کاربرها: همان مالک و متصدی';
  return `${users.length === 1 ? 'کاربر' : 'کاربرها'}: ${users.join('، ')}`;
}

/**
 * خط دوم فهرست «چاپخانه‌ها» (طرح): «تهران · 8 سفارش باز · کاربرها: همان مالک و متصدی»، «مشهد · 2 سفارش باز · کاربر: حسن نوری»،
 * و برای غیرفعال «اصفهان · از 1405/07/01 سفارش تازه نمی‌گیرد»؛ غیرفعالی که هنوز کاربر فعال دارد، نامشان را هم («· کاربر: …»)،
 * تا با پایان همکاری غیرفعال شوند (ADR-042). چاپخانهٔ فعال با موبایل اعلان «· پیامک سفارش تازه به 0915 123 4567» (برش ۷٫۶، سؤال
 * ۱۷۷: شمارهٔ کامل، چون فقط مالک این صفحه را می‌بیند)؛ غیرفعال سفارش تازه نمی‌گیرد، پس پیامکی هم ندارد.
 */
export function partnerMeta(partner: PartnerView): Seg[] {
  if (partner.deactivatedAt) {
    return [
      partner.cityName,
      ' · از ',
      { num: formatJalaliNumeric(partner.deactivatedAt) },
      ' سفارش تازه نمی‌گیرد',
      ...(partner.users.length > 0 ? [` · ${usersText(partner.users)}`] : []),
    ];
  }
  return [
    partner.cityName,
    ' · ',
    { num: formatNumber(partner.openOrders) },
    ` سفارش باز · ${usersText(partner.users)}`,
    ...(partner.notifyMobile ? [' · پیامک سفارش تازه به ', { num: phoneText(partner.notifyMobile) }] : []),
  ];
}

/**
 * خط زیر نام چاپخانه در کارت سفارش (طرح): از کجا آمد. تخصیص خودکار «خودکار، هنگام پرداخت: هم‌شهر مشتری.»، و جابه‌جایی «جابه‌جا
 * شد: …» با دلیلش؛ کی و که، کنارش در رویدادهای سفارش.
 */
export function assignmentNote(assignment: PanelAssignment | undefined): string | null {
  if (!assignment) return null;
  if (assignment.actor === 'system') return `خودکار، هنگام پرداخت: ${assignment.rule ? RULE_TEXT[assignment.rule] : 'قاعدهٔ تخصیص'}.`;
  // سپردن سفارش بی چاپخانه از ۱۰٫۱ دلیل نمی‌خواهد (سؤال ۱۹۹).
  const who = assignment.adminName ? `، ${assignment.adminName}` : '';
  return `${assignment.fromName ? 'جابه‌جا شد' : 'دستی سپرده شد'}${who}${assignment.reason ? `: ${assignment.reason}` : '.'}`;
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
