/**
 * زمان در پنل، به وقت تهران و با ارقام لاتین: «امروز 10:02»، «دیروز 23:40»، «شنبه 11 مهر 09:15». خالص،
 * تا تست بی ساعت واقعی بسنجدش.
 */

import { formatJalali, formatJalaliNumeric, formatJalaliWeekday, formatTehranTime, jalaliYear } from '@jozveyar/text';

const DAY_MS = 86_400_000;

/** روز تهران یک لحظه، برای مقایسه: `1405/07/13`. */
export const tehranDay = (at: Date) => formatJalaliNumeric(at);

/**
 * نام روز نسبت به حالا: «امروز، دوشنبه 13 مهر»، «دیروز، یکشنبه 12 مهر»، «شنبه 11 مهر»، و از سال دیگر
 * «25 اسفند 1404».
 */
export function dayHeading(at: Date, now: Date): string {
  const day = tehranDay(at);
  if (day === tehranDay(now)) return `امروز، ${formatJalaliWeekday(at)}`;
  if (day === tehranDay(new Date(now.getTime() - DAY_MS))) return `دیروز، ${formatJalaliWeekday(at)}`;
  return jalaliYear(at) === jalaliYear(now) ? formatJalaliWeekday(at) : formatJalali(at);
}

/** «امروز 10:02»، «دیروز 23:40»، «شنبه 11 مهر 09:15». */
export function whenText(at: Date, now: Date): string {
  const day = tehranDay(at);
  const time = formatTehranTime(at);
  if (day === tehranDay(now)) return `امروز ${time}`;
  if (day === tehranDay(new Date(now.getTime() - DAY_MS))) return `دیروز ${time}`;
  return `${jalaliYear(at) === jalaliYear(now) ? formatJalaliWeekday(at) : formatJalali(at)} ${time}`;
}
