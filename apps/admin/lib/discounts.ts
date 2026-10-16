/**
 * کد تخفیف به زبان پنل (برش ۱۱٫۴، ADR-062؛ سؤال‌های ۲۰۹ و ۲۹۸ تا ۳۰۲): فرم «کد تازه» و «ویرایش» و سنجشش، و متن فهرست و صفحهٔ هر کد.
 *
 * خالص، بی پایگاه داده و بی JSX: سرویس سرور (`lib/server/discounts.ts`) هر فرم را با همین می‌سنجد، و صفحه‌ها همین متن‌ها را نشان
 * می‌دهند. پول ورودی تومان است و ذخیره ریال (قاعدهٔ ۳)؛ روز شمسی است و ذخیره نیمه‌شب تهران، مثل تعطیلی چاپخانه (۱۰٫۱): روز اول شامل و
 * پایان انحصاری پس از روز آخر. شکل‌ها همان CHECKهای `discount_codes` است (0047)؛ اینجا پیش از آن و با جای دقیق.
 */

import type { DiscountCodeInput, DiscountCodeRow, DiscountCodeView } from '@jozveyar/db';
import { formatJalaliNumeric, formatJalaliWeekday, formatNumber, parseJalaliNumeric, rialsToTomans, tehranDayStart, toLatinDigits, tomansToRials } from '@jozveyar/text';
import { normalizeDiscountCode, tidyInputFa } from '@jozveyar/text/input';

import type { AdminErrorCode } from './server/result';
import type { Seg } from './orders';

/** بیشترین تومان یک فیلد پول کد (سقف، مبلغ، حداقل): همان سقف ویرایشگر تعرفه. */
export const DISCOUNT_TOMANS_MAX = 100_000_000;
/** بیشترین سقف کل استفاده و سقف هر مشتری. */
export const DISCOUNT_LIMIT_MAX = 1_000_000;
/** بلندترین یادداشت داخلی، همان CHECK `discount_codes_note`. */
export const DISCOUNT_NOTE_MAX = 200;

/** فیلدهای فرم، همان‌طور که تایپ شد؛ پول تومان و روز شمسی. */
export interface DiscountForm {
  /** متن کد؛ فقط در «کد تازه» (پس از ساختن عوض نمی‌شود). */
  discount: string;
  kind: string;
  percent: string;
  /** سقف تخفیف درصدی هر سفارش، تومان؛ خالی یعنی بی سقف. */
  max: string;
  /** مبلغ ثابت، تومان. */
  amount: string;
  /** حداقل جمع چاپ، کاغذ و صحافی، تومان؛ خالی یعنی هیچ. */
  minOrder: string;
  /** روز اول، شمسی؛ خالی یعنی از همین حالا. */
  from: string;
  /** روز آخر، شمسی؛ خالی یعنی بی پایان. */
  until: string;
  /** سقف کل استفاده؛ خالی یعنی بی سقف. */
  total: string;
  perCustomer: string;
  enabled: boolean;
  note: string;
}

export type DiscountField = Exclude<keyof DiscountForm, 'enabled'>;

export type DiscountFormCheck =
  | { ok: true; code: string | null; terms: DiscountCodeInput }
  | { ok: false; field: DiscountField; error: AdminErrorCode };

/** فرم از فیلدهای HTML (server action)؛ هر مقدار کوتاه‌شده. تیکی که نیامد خاموش است. */
export function discountFormOf(entries: Iterable<[string, unknown]>): DiscountForm {
  const form: DiscountForm = {
    discount: '',
    kind: '',
    percent: '',
    max: '',
    amount: '',
    minOrder: '',
    from: '',
    until: '',
    total: '',
    perCustomer: '',
    enabled: false,
    note: '',
  };
  for (const [key, raw] of entries) {
    if (typeof raw !== 'string') continue;
    const value = raw.slice(0, key === 'note' ? 1000 : 100);
    if (key === 'enabled') form.enabled = value !== '';
    else if (key in form && key !== 'enabled') form[key as DiscountField] = value;
  }
  return form;
}

/** فرم از روی یک کد: همان که «ویرایش» با آن باز می‌شود. */
export function discountFormFrom(row: DiscountCodeRow): DiscountForm {
  const tomans = (rials: number | null) => (rials === null ? '' : formatNumber(rialsToTomans(rials)));
  return {
    discount: row.code,
    kind: row.kind,
    percent: row.percent === null ? '' : String(row.percent),
    max: tomans(row.maxDiscountRials),
    amount: tomans(row.amountRials),
    minOrder: row.minOrderRials > 0 ? tomans(row.minOrderRials) : '',
    from: row.validFrom ? formatJalaliNumeric(row.validFrom) : '',
    until: row.validUntil ? lastDay(row.validUntil) : '',
    total: row.totalLimit === null ? '' : String(row.totalLimit),
    perCustomer: String(row.perCustomerLimit),
    enabled: row.enabled,
    note: row.note ?? '',
  };
}

/** روز آخر از پایان انحصاری (`1405/07/30`). */
const lastDay = (until: Date): string => formatJalaliNumeric(new Date(until.getTime() - 1));

/** عدد صحیح فرم: «1,700»، «۱۷۰۰»، «1 700»؛ null یعنی عدد نیست یا از سقف بیشتر است. */
function whole(text: string, max: number): number | null {
  const clean = toLatinDigits(text).replace(/[\s,٬،']/g, '');
  if (!/^\d+$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isSafeInteger(value) && value <= max ? value : null;
}

/**
 * سنجش فرم «کد تازه» (`creating`) یا «ویرایش» (`now` برای روز اولی که گذشته نیست): متن کد یکدست (`normalizeDiscountCode`، فقط «کد تازه»)،
 * درصد ۱ تا ۱۰۰ با سقف اختیاری، یا مبلغ ثابت؛ حداقل، روزها و سقف‌ها اختیاری؛ یادداشت یکدست تا ۲۰۰ نویسه. اولین خطا با جایش.
 */
export function readDiscountForm(form: DiscountForm, creating: boolean): DiscountFormCheck {
  const fail = (field: DiscountField, error: AdminErrorCode): DiscountFormCheck => ({ ok: false, field, error });
  let code: string | null = null;
  if (creating) {
    code = normalizeDiscountCode(form.discount);
    if (!code) return fail('discount', 'discount_code_invalid');
  }
  if (form.kind !== 'percent' && form.kind !== 'fixed') return fail('kind', 'discount_kind');
  const money = (text: string, min: number): number | null | undefined => {
    if (text.trim() === '') return undefined;
    const tomans = whole(text, DISCOUNT_TOMANS_MAX);
    return tomans === null || tomans < min ? null : tomansToRials(tomans);
  };
  let percent: number | null = null;
  let maxDiscountRials: number | null = null;
  let amountRials: number | null = null;
  if (form.kind === 'percent') {
    percent = whole(form.percent, 100);
    if (percent === null || percent < 1) return fail('percent', 'discount_percent');
    const max = money(form.max, 1);
    if (max === null) return fail('max', 'discount_max');
    maxDiscountRials = max ?? null;
  } else {
    const amount = money(form.amount, 1);
    if (amount === null || amount === undefined) return fail('amount', 'discount_amount');
    amountRials = amount;
  }
  const minOrder = money(form.minOrder, 0);
  if (minOrder === null) return fail('minOrder', 'discount_min_order');

  const fromText = form.from.trim();
  const from = fromText === '' ? null : parseJalaliNumeric(fromText);
  if (fromText !== '' && from === null) return fail('from', 'discount_from');
  const untilText = form.until.trim();
  const last = untilText === '' ? null : parseJalaliNumeric(untilText);
  if (untilText !== '' && last === null) return fail('until', 'discount_until');
  if (from && last && last.getTime() < from.getTime()) return fail('until', 'day_order');

  const total = form.total.trim() === '' ? null : whole(form.total, DISCOUNT_LIMIT_MAX);
  if (form.total.trim() !== '' && (total === null || total < 1)) return fail('total', 'discount_total_limit');
  const perCustomer = whole(form.perCustomer, DISCOUNT_LIMIT_MAX);
  if (perCustomer === null || perCustomer < 1) return fail('perCustomer', 'discount_per_customer');
  const note = tidyInputFa(form.note);
  if ([...note].length > DISCOUNT_NOTE_MAX) return fail('note', 'discount_note');

  return {
    ok: true,
    code,
    terms: {
      kind: form.kind,
      percent,
      maxDiscountRials,
      amountRials,
      minOrderRials: minOrder ?? 0,
      validFrom: from,
      validUntil: last ? tehranDayStart(last, 1) : null,
      totalLimit: total,
      perCustomerLimit: perCustomer,
      enabled: form.enabled,
      note: note || null,
    },
  };
}

/** فقط خاموش شد؟ «خاموش کردن» کد تازه نمی‌خواهد (سؤال ۳۰۲)؛ هر تغییر دیگری می‌خواهد. */
export function onlyDisables(current: DiscountCodeInput, next: DiscountCodeInput): boolean {
  const same = (key: keyof DiscountCodeInput) => {
    const a = current[key];
    const b = next[key];
    return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
  };
  return current.enabled && !next.enabled && (Object.keys(next) as (keyof DiscountCodeInput)[]).every((key) => key === 'enabled' || same(key));
}

/** شرط‌های جاری یک کد به شکل ورودی، برای مقایسه با فرم. */
export function termsOfRow(row: DiscountCodeRow): DiscountCodeInput {
  return {
    kind: row.kind,
    percent: row.percent,
    maxDiscountRials: row.maxDiscountRials,
    amountRials: row.amountRials,
    minOrderRials: row.minOrderRials,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    totalLimit: row.totalLimit,
    perCustomerLimit: row.perCustomerLimit,
    enabled: row.enabled,
    note: row.note,
  };
}

/* ───────────────────────── متن فهرست و صفحهٔ کد ───────────────────────── */

const num = (value: number): Seg => ({ num: formatNumber(value) });
const tomans = (rials: number): Seg => num(rialsToTomans(rials));

/** «10٪ تا 50,000 تومان»، «20٪»، یا «20,000 تومان»؛ و «از سفارش 300,000 تومان» اگر حداقل دارد. */
export function discountTermsText(row: Pick<DiscountCodeRow, 'kind' | 'percent' | 'maxDiscountRials' | 'amountRials' | 'minOrderRials'>): Seg[] {
  const value: Seg[] =
    row.kind === 'percent'
      ? [num(row.percent ?? 0), '٪', ...(row.maxDiscountRials !== null ? [' تا ', tomans(row.maxDiscountRials), ' تومان'] : [])]
      : [tomans(row.amountRials ?? 0), ' تومان'];
  return row.minOrderRials > 0 ? [...value, '، از سفارش ', tomans(row.minOrderRials), ' تومان'] : value;
}

/** «از سه‌شنبه 25 مهر تا پنجشنبه 30 مهر»، «تا …»، «از …»، یا «همیشه». */
export function discountWindowText(row: Pick<DiscountCodeRow, 'validFrom' | 'validUntil'>): Seg[] {
  const from = row.validFrom ? formatJalaliWeekday(row.validFrom) : null;
  const until = row.validUntil ? formatJalaliWeekday(new Date(row.validUntil.getTime() - 1)) : null;
  if (from && until) return ['از ', from, ' تا ', until];
  if (until) return ['تا ', until];
  if (from) return ['از ', from];
  return ['همیشه'];
}

/** «12 از 100»، یا «12» بی سقف کل؛ رزروهای زنده «و 1 در انتظار پرداخت». */
export function discountUseText(view: Pick<DiscountCodeView, 'used' | 'reserved' | 'totalLimit'>): Seg[] {
  const used: Seg[] = view.totalLimit === null ? [num(view.used)] : [num(view.used), ' از ', num(view.totalLimit)];
  return view.reserved > 0 ? [...used, '، و ', num(view.reserved), ' در انتظار پرداخت'] : used;
}

/** حال کد همین لحظه، برای نشان فهرست: روشن، خاموش، هنوز شروع نشده، تمام شده (روز)، یا پر. */
export type DiscountState = 'on' | 'off' | 'soon' | 'ended' | 'full';

export function discountState(view: Pick<DiscountCodeView, 'enabled' | 'validFrom' | 'validUntil' | 'used' | 'totalLimit'>, now: Date): DiscountState {
  if (!view.enabled) return 'off';
  if (view.validUntil && now.getTime() >= view.validUntil.getTime()) return 'ended';
  if (view.validFrom && now.getTime() < view.validFrom.getTime()) return 'soon';
  if (view.totalLimit !== null && view.used >= view.totalLimit) return 'full';
  return 'on';
}

export const DISCOUNT_STATE_LABEL: Record<DiscountState, string> = {
  on: 'روشن',
  off: 'خاموش',
  soon: 'هنوز شروع نشده',
  ended: 'تمام شده',
  full: 'ظرفیتش پر شد',
};
