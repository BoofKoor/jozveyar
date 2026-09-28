/**
 * بردارهای هم‌ارزی تاریخ شمسی: برگهٔ سفارش را کارگر پایتون می‌سازد (برش ۵٫۱، ADR-043)، و تاریخ و ساعتش باید همان باشد که
 * پنل و سایت با `Intl` نشان می‌دهند. `services/docworker/docworker/jalali.py` حساب تقویم فارسی ICU را دارد؛ این فایل
 * خروجی دقیق تابع‌های `dates.ts` را برای چند صد لحظه در `parity/jalali.json` نگه می‌دارد، و تست پایتون
 * (`tests/test_jalali.py`) همان را از آن می‌خواهد.
 *
 * لحظه‌ها: هر یازده روز از ۱۴۰۴ تا ۱۴۱۰ (همهٔ روزهای هفته و جاهای ماه را می‌گردد)، هر روزِ دو هفتهٔ دور نوروز هر سال
 * (سال کبیسه و اسفند ۲۹ یا ۳۰ روزه)، و دو سوی نیمه‌شب تهران در همان روزها (روز در تهران عوض می‌شود، نه در UTC).
 *
 * تغییر عمدی قالب تاریخ: `UPDATE_PARITY=1 pnpm test` فایل را بازنویسی می‌کند، و بعد پایتون باید همراهش عوض شود.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { formatDeadlineDay, formatJalali, formatJalaliWeekday, formatTehranTime } from './dates.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'parity', 'jalali.json');
const DAY = 86_400_000;

interface JalaliVector {
  at: string;
  date: string;
  weekday: string;
  time: string;
  /** همان لحظه به‌عنوان مهلت انحصاری: روز پایانش، و تاریخ کامل همان روز (برای سال). */
  deadline: string;
  deadlineDate: string;
}

function instants(): Date[] {
  const out: Date[] = [];
  // هر یازده روز، ساعت ۱۱:۲۰ تهران.
  for (let t = Date.UTC(2025, 2, 1, 7, 50); t <= Date.UTC(2032, 2, 31, 7, 50); t += 11 * DAY) out.push(new Date(t));
  for (let year = 2025; year <= 2032; year += 1) {
    // دو هفتهٔ دور نوروز، هر روز ظهر تهران.
    for (let t = Date.UTC(year, 2, 12, 8, 30); t <= Date.UTC(year, 2, 27, 8, 30); t += DAY) out.push(new Date(t));
    // نیمه‌شب تهران (۲۰:۳۰ UTC روز قبل)، یک میلی‌ثانیه پیش و خودش.
    for (const day of [19, 20, 21]) {
      const midnight = Date.UTC(year, 2, day, 20, 30);
      out.push(new Date(midnight - 1), new Date(midnight));
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

function compute(): JalaliVector[] {
  return instants().map((at) => ({
    at: at.toISOString(),
    date: formatJalali(at),
    weekday: formatJalaliWeekday(at),
    time: formatTehranTime(at),
    deadline: formatDeadlineDay(at),
    deadlineDate: formatJalali(new Date(at.getTime() - 1)),
  }));
}

describe('بردارهای هم‌ارزی تاریخ شمسی با کارگر', () => {
  it('خروجی تابع‌های تاریخ با فایل مشترک دقیقاً یکی است', () => {
    const actual = compute();
    if (process.env.UPDATE_PARITY === '1' || !existsSync(FILE)) {
      mkdirSync(dirname(FILE), { recursive: true });
      writeFileSync(FILE, `[\n${actual.map((v) => JSON.stringify(v)).join(',\n')}\n]\n`);
    }
    expect(actual).toEqual(JSON.parse(readFileSync(FILE, 'utf8')) as JalaliVector[]);
  });

  it('بردارها همان مرزهایی را دارند که برگه به آنها بند است', () => {
    const byAt = new Map(compute().map((v) => [v.at, v]));
    // نوروز ۱۴۰۵ نیمه‌شب تهران آمد، ۲۰:۳۰ روز ۲۰ مارس به وقت UTC (همان `jalaliYear`).
    expect(byAt.get('2026-03-20T20:29:59.999Z')!.date).toBe('29 اسفند 1404');
    expect(byAt.get('2026-03-20T20:30:00.000Z')!.date).toBe('1 فروردین 1405');
    // مهلتی که درست نیمه‌شب است مال روز قبل است.
    expect(byAt.get('2026-03-20T20:30:00.000Z')!.deadline).toBe('جمعه 29 اسفند');
    // ظهر همان روز، با روز هفته و ساعت تهران.
    expect(byAt.get('2026-03-21T08:30:00.000Z')).toMatchObject({ weekday: 'شنبه 1 فروردین', time: '12:00' });
    expect(compute().length).toBeGreaterThan(400);
  });
});
