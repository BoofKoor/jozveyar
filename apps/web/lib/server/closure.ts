/**
 * نوار «چاپخانه‌ها تعطیل‌اند» صفحهٔ اصلی (برش ۱۰٫۱، سؤال‌های ۲۰۰، ۲۶۵ و ۲۷۰): فقط وقتی همین حالا همهٔ چاپخانه‌های فعال تعطیل‌اند. مشتری
 * چاپخانه را انتخاب نمی‌کند، پس تعطیلی یک چاپخانه روی سایت معنایی ندارد؛ اثرش روی مشتری فقط وقتی است که هیچ‌کس چاپ نمی‌کند. سفارش
 * همچنان ثبت می‌شود: پیش اولین چاپخانه‌ای که باز می‌شود می‌رود، و مهلت تحویل به پستش این روزها را نمی‌شمارد (`settleWith`).
 *
 * همان درگاه (`OrderStore`) و همان حکم (`allClosedWindow`) که پرداخت با آن مهلت را حساب می‌کند. مثل تعرفه (`tariff.ts`): build و بی
 * پایگاه داده هیچ، و خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد. نوار عمومی اعلان (۱۱٫۳) بعداً جای همین را می‌گیرد.
 */

import { allClosedWindow, createOrderStore, getDb, readSetting, type OrderStore } from '@jozveyar/db';
import { formatDeadlineDay, formatJalaliWeekday, isWorkingDay, tehranDayStart } from '@jozveyar/text';

import { BUILD_PHASE } from './tariff';

/** روز آخر تعطیلی («سه‌شنبه 28 مهر») و اولین روز کاری پس از آن («شنبه 2 آبان»)، هر دو به تقویم تهران. */
export interface SiteClosure {
  lastDay: string;
  resumes: string;
}

type ClosureSource = Pick<OrderStore, 'partnerHours' | 'setting'>;

const HALF_DAY_MS = 12 * 3_600_000;

/** همه همین حالا تعطیل‌اند؟ روز آخر و روز کاری بعد؛ وگرنه null. */
export async function loadClosure(source: ClosureSource, now: Date, log?: (message: string, error?: unknown) => void): Promise<SiteClosure | null> {
  const window = allClosedWindow(await source.partnerHours());
  if (!window || now.getTime() < window.from.getTime() || now.getTime() >= window.until.getTime()) return null;
  const holidays = new Set((await readSetting((key) => source.setting(key), 'calendar.holidays', log)).map((day) => day.date));
  let resumes = window.until;
  // روز باز شدن، یا اولین روز کاری پس از آن (پنجشنبه، جمعه و تعطیلی رسمی نه)؛ هیچ ماهی این‌قدر تعطیل پشت‌سرهم ندارد.
  for (let guard = 0; guard < 60 && !isWorkingDay(new Date(resumes.getTime() + HALF_DAY_MS), holidays); guard += 1) {
    resumes = tehranDayStart(resumes, 1);
  }
  return { lastDay: formatDeadlineDay(window.until), resumes: formatJalaliWeekday(resumes) };
}

let source: ClosureSource | undefined;

export async function siteClosure(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => ClosureSource = () => (source ??= createOrderStore(getDb())),
  now: () => Date = () => new Date(),
): Promise<SiteClosure | null> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return null;
  try {
    return await loadClosure(sourceOf(), now());
  } catch (error) {
    console.error('✗ صفحهٔ اصلی: تعطیلی چاپخانه‌ها از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}
