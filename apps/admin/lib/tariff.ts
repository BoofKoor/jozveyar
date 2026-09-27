/**
 * تعرفه به زبان پنل (برش ۴٫۵، ADR-040؛ طرح پنل `m-tariff*`): فرم پیش‌نویس و سنجشش، پیش‌نمایش با همان `quote()` سایت،
 * فهرست تغییرها نسبت به نسخهٔ فعال، دوره‌های فعال بودن هر نسخه، و متن جدول‌های فقط‌خواندنی.
 *
 * خالص، بی پایگاه داده و بی JSX: ویرایشگر مرورگری (`components/TariffEditor.tsx`) همین را برای خطا و پیش‌نمایش زنده صدا
 * می‌زند، و سرویس سرور (`lib/server/tariff.ts`) هر ذخیره و فعال‌سازی را با همین دوباره می‌سنجد؛ سرور منبع حقیقت است.
 *
 * - **پول:** ورودی تومان است و `PriceList` ریال (قاعدهٔ ۳)؛ تبدیل فقط اینجا، در لایهٔ ورودی ادمین.
 * - **صحافی بر حسب برگ،** دوسرشامل، از ۱ تا سقف جلد (۸۰۰) بی شکاف و بی همپوشانی: موتور قیمت هر جلد ۱ تا ۸۰۰ برگی را با
 *   یک بازه قیمت می‌دهد (`splitSheets`)، پس برگی که بازه ندارد جزوه‌ای بی قیمت صحافی است، و برگی که دو بازه دارد دو قیمت.
 *   همپوشانی را پایگاه داده هم رد می‌کند (`EXCLUDE`، ADR-022)؛ اینجا پیش از آن و با جای دقیق.
 * - **هشدار، نه خطا:** عددی بیش از ده برابر همان عدد نسخهٔ فعال، «شاید ریال نوشته‌ای».
 */

import type { PriceList, ShippingRate } from '@jozveyar/contracts';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { formatJalali, formatJalaliNumeric, formatNumber, formatTehranTime, rialsToTomans, toLatinDigits, tomansToRials } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import type { Seg } from './orders';

/** بلندترین نام نسخه، پس از یکدست شدن. */
export const LABEL_MAX = 60;
/** بیشترین بازهٔ صحافی. */
export const BANDS_MAX = 20;
/** بزرگ‌ترین عدد تومانی فرم؛ بیشتر یعنی صفر اضافه. */
export const TOMANS_MAX = 100_000_000;
/** بزرگ‌ترین شمارهٔ برگ فرم؛ بیشتر یعنی اشتباه تایپی (سقف جلد خودش ۸۰۰ است). */
export const SHEETS_MAX = 100_000;
/** «شاید ریال نوشته‌ای»: عددی بیش از این چند برابر همان عدد نسخهٔ فعال. */
export const WARN_FACTOR = 10;

/**
 * منطقه‌های کرایه به ترتیب ستون‌ها، با نام کارت شهر. همان `SHIPPING_ZONES` بستهٔ `@jozveyar/geo`، که اینجا نمی‌آید: دادهٔ
 * ۱۳۲۳ شهرش ویرایشگر مرورگری را سنگین می‌کرد. تست برابری‌شان را قفل کرده.
 */
export const ZONES: readonly { id: string; name: string }[] = [
  { id: 'tehran', name: 'استان تهران' },
  { id: 'other', name: 'بقیهٔ کشور' },
];

const num = (value: number): Seg => ({ num: formatNumber(value) });
const tomans = (rials: number): Seg => num(rialsToTomans(rials));

/** «a»، «a و b»، «a، b و c». */
export function joinFa(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('، ')} و ${items.at(-1)}`;
}

/* ───────────────────────── فرم ───────────────────────── */

export interface BandInput {
  from: string;
  to: string;
  price: string;
}

/** فرم پیش‌نویس، همان که تایپ شد. پول تومان است؛ کرایه هر خانه با کلید `rateKey`. */
export interface DraftForm {
  label: string;
  bw: string;
  color: string;
  bands: BandInput[];
  ship: Record<string, string>;
}

/**
 * جای یک خطا یا هشدار: `label`، `bw`، `color`، `band.<ردیف>.from|to|price`، `bands` (کل بازه‌ها)، `ship.<کلید>`، و
 * `list` برای چیزی که فرم ندارد (کاغذ و روش ارسال پیش‌فرض).
 */
export interface DraftIssue {
  field: string;
  text: Seg[];
}

export interface DraftCheck {
  /** تعرفهٔ ساخته‌شده؛ null اگر خطایی هست. */
  list: PriceList | null;
  errors: DraftIssue[];
  warnings: DraftIssue[];
}

/** کلید خانهٔ کرایه: منطقه و آغاز بازهٔ وزن. */
export const rateKey = (rate: Pick<ShippingRate, 'zoneId' | 'minWeightGrams'>) => `${rate.zoneId}:${rate.minWeightGrams}`;

/** نمایش تومان در فیلد: «1,600». */
const tomansField = (rials: number) => formatNumber(rialsToTomans(rials));

/** فرم از روی یک نسخه: همان که ویرایشگر با آن باز می‌شود. */
export function draftFormOf(list: PriceList): DraftForm {
  const bands = list.bindingTypes[DEFAULT_BINDING_TYPE_ID]?.bands ?? [];
  const ship: Record<string, string> = {};
  for (const rate of postRates(list)) ship[rateKey(rate)] = tomansField(rate.priceRials);
  return {
    label: list.label,
    bw: tomansField(list.clickRates.bw ?? 0),
    color: tomansField(list.clickRates.color ?? 0),
    bands: bands.map((band) => ({ from: String(band.minSheets), to: String(band.maxSheets), price: tomansField(band.priceRials) })),
    ship,
  };
}

/**
 * فرم پیش‌نویس از فیلدهای فرم HTML (server action): `label`، `bw`، `color`، `band.<ردیف>.from|to|price` و
 * `ship.<منطقه>:<آغاز وزن>`. هر چیز دیگر نادیده؛ هر مقدار کوتاه‌شده، و ردیف‌ها به ترتیب شماره‌شان. سنجش با `readDraft`.
 */
export function draftFormFromEntries(entries: Iterable<[string, unknown]>): DraftForm {
  const form: DraftForm = { label: '', bw: '', color: '', bands: [], ship: {} };
  const bands = new Map<number, BandInput>();
  for (const [key, raw] of entries) {
    if (typeof raw !== 'string') continue;
    const value = raw.slice(0, 200);
    if (key === 'label' || key === 'bw' || key === 'color') {
      form[key] = value;
      continue;
    }
    const band = /^band\.(\d{1,3})\.(from|to|price)$/.exec(key);
    if (band) {
      const index = Number(band[1]);
      const row = bands.get(index) ?? { from: '', to: '', price: '' };
      row[band[2] as keyof BandInput] = value;
      bands.set(index, row);
      continue;
    }
    const ship = /^ship\.([a-z_]{1,20}:\d{1,9})$/.exec(key);
    if (ship) form.ship[ship[1]!] = value;
  }
  form.bands = [...bands.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
  return form;
}

type Whole = { ok: true; value: number } | { ok: false; error: 'empty' | 'invalid' | 'too_big' };

/**
 * عدد صحیح فرم: «1,700»، «۱۷۰۰»، «1 700» همه 1700. جداکنندهٔ هزارگان لاتین و فارسی و فاصله پذیرفته است؛ اعشار و واحد نه.
 */
export function parseWhole(text: string, max: number): Whole {
  const clean = toLatinDigits(text).replace(/[\s,٬،']/g, '');
  if (clean === '') return { ok: false, error: 'empty' };
  if (!/^\d+$/.test(clean)) return { ok: false, error: 'invalid' };
  const value = Number(clean);
  if (!Number.isSafeInteger(value) || value > max) return { ok: false, error: 'too_big' };
  return { ok: true, value };
}

const WHOLE_ERRORS: Record<'empty' | 'invalid', Seg[]> = {
  empty: ['عدد را بنویس.'],
  invalid: ['فقط رقم بنویس، بی اعشار و بی واحد.'],
};

/** کرایه‌های روش پیش‌فرض (پست پیشتاز)، به ترتیب منطقه‌ها و وزن. */
export function postRates(list: PriceList): ShippingRate[] {
  const order = (zone: string) => {
    const index = ZONES.findIndex((z) => z.id === zone);
    return index === -1 ? ZONES.length : index;
  };
  return list.shippingRates
    .filter((rate) => rate.methodId === DEFAULT_SHIPPING_METHOD_ID)
    .sort((a, b) => order(a.zoneId) - order(b.zoneId) || a.zoneId.localeCompare(b.zoneId) || a.minWeightGrams - b.minWeightGrams);
}

/* ───────────────────────── سنجش ───────────────────────── */

/** «برگ 301» یا «برگ‌های 301 تا 304». */
function sheetsRange(from: number, to: number): Seg[] {
  return from === to ? ['برگ ', num(from)] : ['برگ‌های ', num(from), ' تا ', num(to)];
}

/**
 * بازه‌های صحافی، دوسرشامل، باید برگ ۱ تا سقف جلد را درست یک بار بپوشانند. خطاها با اندیس همان آرایه‌ای که آمد (فرم
 * می‌تواند نامرتب باشد): جای «از» یا «تا»ی همان ردیف. پیام‌ها کار بعدی را می‌گویند (««از» را 301 کن»).
 */
export function bandIssues(bands: readonly { from: number; to: number }[], maxSheets: number): { index: number; part: 'from' | 'to'; text: Seg[] }[] {
  const issues: { index: number; part: 'from' | 'to'; text: Seg[] }[] = [];
  const order = bands.map((band, index) => ({ ...band, index })).sort((a, b) => a.from - b.from || a.to - b.to);
  /** نخستین برگی که هنوز بازه ندارد؛ و بازه‌ای که تا دورترین برگ رسیده (همان که «تا»یش آخر است). */
  let next = 1;
  let furthest: (typeof order)[number] | null = null;
  for (const band of order) {
    if (band.from > next) {
      const where: Seg[] = furthest ? ['بازهٔ قبلی تا ', num(next - 1), ' است'] : ['اولین بازه از ', num(band.from), ' است'];
      const one = next === band.from - 1;
      issues.push({
        index: band.index,
        part: 'from',
        text: [...sheetsRange(next, band.from - 1), one ? ' قیمت ندارد: ' : ' قیمت ندارند: ', ...where, '. «از» را ', num(next), ' کن.'],
      });
    } else if (band.from < next) {
      const end = Math.min(band.to, next - 1);
      issues.push({
        index: band.index,
        part: 'from',
        text: [...sheetsRange(band.from, end), band.from === end ? ' دو قیمت دارد: ' : ' دو قیمت دارند: ', 'بازهٔ قبلی تا ', num(next - 1), ' است. «از» را ', num(next), ' کن.'],
      });
    }
    if (!furthest || band.to >= furthest.to) furthest = band;
    next = Math.max(next, band.to + 1);
  }
  if (furthest && next - 1 < maxSheets) {
    issues.push({
      index: furthest.index,
      part: 'to',
      text: [...sheetsRange(next, maxSheets), next === maxSheets ? ' قیمت ندارد: ' : ' قیمت ندارند: ', 'آخرین بازه تا ', num(next - 1), ' است. «تا» را ', num(maxSheets), ' کن.'],
    });
  } else if (furthest && next - 1 > maxSheets) {
    issues.push({
      index: furthest.index,
      part: 'to',
      text: ['بالای ', num(maxSheets), ' برگ جلد تازه است: «تا»ی آخرین بازه ', num(maxSheets), ' باشد.'],
    });
  }
  return issues;
}

/**
 * آنچه موتور قیمت برای کار درست از یک نسخه لازم دارد، بیرون از فرم: کاغذ، صحافی و پست پیشتاز پیش‌فرض و روشن، نرخ چاپ
 * بیش از صفر، بازه‌های صحافی از ۱ تا سقف جلد، و کرایهٔ هر منطقه برای هر وزنی (از صفر تا بی سقف، پشت‌سرهم). پیش‌نویسی
 * که از فرم آمده این‌ها را دارد؛ این برای هر نسخه است، پیش از فعال شدن.
 */
export function checkPriceList(list: PriceList): Seg[][] {
  const problems: Seg[][] = [];
  const paper = list.paperTypes[DEFAULT_PAPER_TYPE_ID];
  if (!paper?.enabled) problems.push(['کاغذ پیش‌فرض (', { ltr: DEFAULT_PAPER_TYPE_ID }, ') در این نسخه نیست یا خاموش است.']);
  if (!((list.clickRates.bw ?? 0) > 0) || !((list.clickRates.color ?? 0) > 0)) problems.push(['نرخ چاپ سیاه‌سفید و رنگی هر دو بیش از صفر باشند.']);
  const binding = list.bindingTypes[DEFAULT_BINDING_TYPE_ID];
  if (!binding?.enabled) {
    problems.push(['صحافی پیش‌فرض (', { ltr: DEFAULT_BINDING_TYPE_ID }, ') در این نسخه نیست یا خاموش است.']);
  } else {
    const issues = bandIssues(
      binding.bands.map((band) => ({ from: band.minSheets, to: band.maxSheets })),
      binding.maxSheetsPerVolume,
    );
    if (binding.bands.length === 0) problems.push(['صحافی بازه ندارد.']);
    for (const issue of issues) problems.push(['صحافی: ', ...issue.text]);
  }
  if (!list.shippingMethods[DEFAULT_SHIPPING_METHOD_ID]?.enabled) {
    problems.push(['پست پیشتاز (', { ltr: DEFAULT_SHIPPING_METHOD_ID }, ') در این نسخه نیست یا خاموش است.']);
  } else {
    for (const zone of ZONES) {
      const rates = postRates(list).filter((rate) => rate.zoneId === zone.id);
      let next = 0;
      let open = false;
      for (const rate of rates) {
        if (rate.minWeightGrams !== next || open) {
          next = -1;
          break;
        }
        if (rate.maxWeightGrams === null) open = true;
        else next = rate.maxWeightGrams;
      }
      if (rates.length === 0 || next === -1 || !open) {
        problems.push(['کرایهٔ پست پیشتاز برای ', zone.name, ' همهٔ وزن‌ها را، از صفر و بی سقف، پشت‌سرهم نمی‌پوشاند.']);
      }
    }
  }
  return problems;
}

/** «17,000 تومان؟ بیش از ده برابر نسخهٔ فعال (1,600) است؛ شاید ریال نوشته‌ای.» */
function tenfold(rials: number, activeRials: number | undefined): Seg[] | null {
  if (activeRials === undefined || activeRials <= 0 || rials <= WARN_FACTOR * activeRials) return null;
  return [tomans(rials), ' تومان؟ بیش از ده برابر نسخهٔ فعال (', tomans(activeRials), ') است؛ شاید ریال نوشته‌ای.'];
}

/**
 * فرم پیش‌نویس به تعرفه: هر خطا با جایش، هشدارها جدا، و تعرفهٔ ساخته‌شده اگر خطایی نیست. هرچه فرم ندارد (کاغذ، روش‌های
 * ارسال، وزن‌ها، مالیات و …) از `base` می‌آید، یعنی همان پیش‌نویس ذخیره‌شده؛ `active` فقط برای هشدار ده برابر.
 */
export function readDraft(form: DraftForm, base: PriceList, active: PriceList | null): DraftCheck {
  const errors: DraftIssue[] = [];
  const warnings: DraftIssue[] = [];
  const error = (field: string, text: Seg[]) => errors.push({ field, text });
  const warn = (field: string, text: Seg[] | null) => {
    if (text) warnings.push({ field, text });
  };

  /** تومان به ریال؛ null اگر خطا دارد (و خطا نوشته شد). */
  const money = (field: string, text: string, min: number): number | null => {
    const parsed = parseWhole(text, TOMANS_MAX);
    if (!parsed.ok) {
      error(field, parsed.error === 'too_big' ? ['بیش از ', num(TOMANS_MAX), ' تومان است؛ شاید صفر اضافه دارد.'] : WHOLE_ERRORS[parsed.error]);
      return null;
    }
    if (parsed.value < min) {
      error(field, ['نرخ چاپ صفر نمی‌شود.']);
      return null;
    }
    return tomansToRials(parsed.value);
  };

  const label = tidyInputFa(form.label);
  if (!label) error('label', ['نام نسخه را بنویس.']);
  else if ([...label].length > LABEL_MAX) error('label', ['نام حداکثر ', num(LABEL_MAX), ' نویسه باشد.']);

  const bw = money('bw', form.bw, 1);
  const color = money('color', form.color, 1);
  if (bw !== null) warn('bw', tenfold(bw, active?.clickRates.bw));
  if (color !== null) warn('color', tenfold(color, active?.clickRates.color));

  // صحافی: ردیف تمام‌خالی نادیده است (ردیفی که «افزودن بازه» ساخت و پر نشد).
  const binding = base.bindingTypes[DEFAULT_BINDING_TYPE_ID];
  const activeBands = active?.bindingTypes[DEFAULT_BINDING_TYPE_ID]?.bands ?? [];
  const rows = form.bands
    .map((band, index) => ({ band, index }))
    .filter(({ band }) => `${band.from}${band.to}${band.price}`.trim() !== '');
  const bands: { index: number; from: number; to: number; priceRials: number }[] = [];
  let bandsOk = true;
  for (const { band, index } of rows) {
    const sheets = (part: 'from' | 'to', text: string) => {
      const parsed = parseWhole(text, SHEETS_MAX);
      if (parsed.ok && parsed.value >= 1) return parsed.value;
      error(`band.${index}.${part}`, parsed.ok ? ['برگ از 1 شروع می‌شود.'] : parsed.error === 'too_big' ? ['این شمارهٔ برگ زیادی بزرگ است.'] : WHOLE_ERRORS[parsed.error]);
      return null;
    };
    const from = sheets('from', band.from);
    const to = sheets('to', band.to);
    const priceRials = money(`band.${index}.price`, band.price, 0);
    if (from === null || to === null || priceRials === null) {
      bandsOk = false;
      continue;
    }
    if (from > to) {
      error(`band.${index}.to`, ['«تا» از «از» کمتر است.']);
      bandsOk = false;
      continue;
    }
    bands.push({ index, from, to, priceRials });
    const covering = activeBands.find((b) => from >= b.minSheets && from <= b.maxSheets);
    warn(`band.${index}.price`, tenfold(priceRials, covering?.priceRials));
  }
  if (rows.length === 0) error('bands', ['دست‌کم یک بازه لازم است.']);
  else if (rows.length > BANDS_MAX) error('bands', ['حداکثر ', num(BANDS_MAX), ' بازه.']);
  else if (bandsOk && binding) {
    for (const issue of bandIssues(bands, binding.maxSheetsPerVolume)) {
      error(`band.${bands[issue.index]!.index}.${issue.part}`, issue.text);
    }
  }

  // کرایه: همان خانه‌های پیش‌نویس؛ وزن‌ها و منطقه‌ها عوض نمی‌شوند.
  const activeRates = new Map((active ? postRates(active) : []).map((rate) => [rateKey(rate), rate.priceRials]));
  const shipRials = new Map<string, number>();
  for (const rate of postRates(base)) {
    const key = rateKey(rate);
    const rials = money(`ship.${key}`, form.ship[key] ?? '', 0);
    if (rials === null) continue;
    shipRials.set(key, rials);
    warn(`ship.${key}`, tenfold(rials, activeRates.get(key)));
  }

  if (errors.length > 0 || !binding) return { list: null, errors, warnings };
  const list: PriceList = {
    ...base,
    label,
    clickRates: { ...base.clickRates, bw: bw!, color: color! },
    bindingTypes: {
      ...base.bindingTypes,
      [DEFAULT_BINDING_TYPE_ID]: {
        ...binding,
        bands: bands
          .slice()
          .sort((a, b) => a.from - b.from)
          .map((band) => ({ minSheets: band.from, maxSheets: band.to, priceRials: band.priceRials })),
      },
    },
    shippingRates: base.shippingRates.map((rate) => {
      const rials = rate.methodId === DEFAULT_SHIPPING_METHOD_ID ? shipRials.get(rateKey(rate)) : undefined;
      return rials === undefined ? rate : { ...rate, priceRials: rials };
    }),
  };
  for (const problem of checkPriceList(list)) error('list', problem);
  return { list: errors.length > 0 ? null : list, errors, warnings };
}

/* ───────────────────────── پیش‌نمایش ───────────────────────── */

interface Sample {
  label: Seg[];
  /** صفحه‌های هر فایل جزوه. */
  sections: number[];
  colorMode: 'bw' | 'color';
  sidesMode: 'single' | 'double';
}

/** چهار جزوهٔ نمونهٔ طرح، هر کدام یک نسخه و بی کرایه. */
export const PREVIEW_SAMPLES: readonly Sample[] = [
  { label: [num(147), ' صفحه، سیاه‌سفید، دورو'], sections: [147], colorMode: 'bw', sidesMode: 'double' },
  { label: [num(120), ' صفحه، رنگی، دورو'], sections: [120], colorMode: 'color', sidesMode: 'double' },
  { label: [num(3), ' فایل، ', num(300), ' صفحه، یکرو'], sections: [120, 100, 80], colorMode: 'bw', sidesMode: 'single' },
  { label: [num(1650), ' صفحه، دو جلد'], sections: [1650], colorMode: 'bw', sidesMode: 'double' },
];

/** قیمت یک جزوهٔ نمونه بی کرایه، با همان `quote()` سایت. */
export function sampleRials(sample: Sample, list: PriceList): number {
  const pages = sample.sections.reduce((sum, n) => sum + n, 0);
  return quote(
    {
      items: [
        {
          sections: sample.sections.map((pageCount, i) => ({ documentId: `sample-${i + 1}`, pageCount })),
          rules: wholeDocumentRule(pages, sample.colorMode, DEFAULT_PAPER_TYPE_ID),
          copies: 1,
          sidesMode: sample.sidesMode,
          bindingTypeId: DEFAULT_BINDING_TYPE_ID,
        },
      ],
      shipping: null,
    },
    list,
  ).totalWithoutShippingRials;
}

export interface PreviewRow {
  label: Seg[];
  activeRials: number;
  draftRials: number;
  diffRials: number;
}

export function previewRows(active: PriceList, draft: PriceList): PreviewRow[] {
  return PREVIEW_SAMPLES.map((sample) => {
    const activeRials = sampleRials(sample, active);
    const draftRials = sampleRials(sample, draft);
    return { label: sample.label, activeRials, draftRials, diffRials: draftRials - activeRials };
  });
}

/** فرق به تومان با علامتش: «+14,700»، «−3,000»، «0». */
export function diffText(rials: number): string {
  if (rials === 0) return '0';
  return `${rials > 0 ? '+' : '−'}${formatNumber(rialsToTomans(Math.abs(rials)))}`;
}

/* ───────────────────────── نمایش فقط‌خواندنی ───────────────────────── */

/** «1»، «1.5»: گرم به کیلو. */
const kilos = (grams: number) => String(Math.round(grams / 100) / 10);

/**
 * نام بازهٔ وزن: «تا 1 کیلو»، «1 تا 3 کیلو»، «بالای 3 کیلو». کوتاه (جدول ویرایش، طرح): «کیلو» فقط در اولی.
 */
export function weightLabel(minGrams: number, maxGrams: number | null, short = false): Seg[] {
  const unit = short ? '' : ' کیلو';
  if (minGrams === 0 && maxGrams === null) return ['همهٔ وزن‌ها'];
  if (minGrams === 0 && maxGrams !== null) return ['تا ', { num: kilos(maxGrams) }, ' کیلو'];
  if (maxGrams === null) return ['بالای ', { num: kilos(minGrams) }, unit];
  return [{ num: kilos(minGrams) }, ' تا ', { num: kilos(maxGrams) }, unit];
}

export interface RateRow {
  minGrams: number;
  maxGrams: number | null;
  /** کرایهٔ هر منطقه (ستون‌های `ZONES`)؛ null اگر این منطقه این بازه را ندارد. */
  prices: (number | null)[];
}

/** جدول پست پیشتاز: هر بازهٔ وزن یک ردیف، هر منطقه یک ستون. */
export function rateRows(list: PriceList): RateRow[] {
  const rows = new Map<string, RateRow>();
  for (const rate of postRates(list)) {
    const key = `${rate.minWeightGrams}:${rate.maxWeightGrams ?? ''}`;
    const row = rows.get(key) ?? { minGrams: rate.minWeightGrams, maxGrams: rate.maxWeightGrams, prices: ZONES.map(() => null) };
    const column = ZONES.findIndex((zone) => zone.id === rate.zoneId);
    if (column !== -1) row.prices[column] = rate.priceRials;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.minGrams - b.minGrams);
}

/** کارت «بقیه»: مالیات، گرد کردن، حداقل سفارش، وزن بسته‌بندی. */
export function restRows(list: PriceList): { label: string; value: Seg[] }[] {
  const { settings } = list;
  return [
    { label: 'مالیات', value: [{ num: String(settings.vatPercent) }, '٪'] },
    { label: 'گرد کردن', value: settings.roundingStepRials > 0 ? ['به ', tomans(settings.roundingStepRials), ' تومان'] : ['ندارد'] },
    { label: 'حداقل سفارش', value: settings.minOrderRials > 0 ? [tomans(settings.minOrderRials), ' تومان'] : ['ندارد'] },
    { label: 'وزن بسته‌بندی', value: [num(settings.packagingWeightGrams), ' گرم'] },
  ];
}

/** نام پیش‌فرض پیش‌نویس تازه: «تعرفهٔ مهر 1405»، ماه و سال تهران. */
export function draftLabel(at: Date): string {
  return `تعرفهٔ ${formatJalali(at).replace(/^\d+ /, '')}`;
}

/* ───────────────────────── تغییرها ───────────────────────── */

export interface ChangeLine {
  key: Seg[];
  value: Seg[];
}

export interface TariffChanges {
  lines: ChangeLine[];
  /** گروه‌هایی که هیچ عددشان عوض نشده، به ترتیب: چاپ، صحافی، پست، بقیه. */
  unchanged: string[];
}

const GROUPS = ['چاپ', 'صحافی', 'پست', 'بقیه'] as const;
type Group = (typeof GROUPS)[number];

/** «1,600 ← 1,700 تومان». */
const moved = (a: number, b: number, unit: Seg[] = [' تومان']): Seg[] => [tomans(a), ' ← ', tomans(b), ...unit];

/**
 * JSON با کلیدهای مرتب، تا دو شیء هم‌محتوا یک متن بدهند، هر ترتیبی که ردیف‌ها از پایگاه داده آمده باشند. سرویس سرور از
 * همین اثر انگشت محتوای نسخه را می‌سازد («همان که دیده شد»).
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * تغییرهای `to` نسبت به `from` (نسخهٔ فعال)، همان که صفحهٔ فعال‌سازی نشان می‌دهد: نرخ چاپ، بازه‌های صحافی (هم‌بازه با
 * قیمت دیگر، تازه، یا برداشته)، کرایه‌ها، و مالیات و گرد کردن و حداقل سفارش و وزن بسته‌بندی. هرچه جز این‌ها فرق دارد
 * (نام کاغذ، وزن جلد، روش‌های خاموش…) یک خط «جزئیات دیگر» است، تا چیزی پنهان نماند. نام نسخه تغییر نیست.
 */
export function tariffChanges(from: PriceList, to: PriceList): TariffChanges {
  const lines: (ChangeLine & { group: Group })[] = [];
  const line = (group: Group, key: Seg[], value: Seg[]) => lines.push({ group, key, value });

  for (const [mode, name] of [
    ['bw', 'چاپ سیاه‌سفید، هر رو'],
    ['color', 'چاپ رنگی، هر رو'],
  ] as const) {
    const a = from.clickRates[mode] ?? 0;
    const b = to.clickRates[mode] ?? 0;
    if (a !== b) line('چاپ', [name], moved(a, b));
  }
  const paperA = from.paperTypes[DEFAULT_PAPER_TYPE_ID]?.ratePerSheetRials ?? 0;
  const paperB = to.paperTypes[DEFAULT_PAPER_TYPE_ID]?.ratePerSheetRials ?? 0;
  if (paperA !== paperB) line('چاپ', ['کاغذ، هر برگ'], moved(paperA, paperB));

  const bandsA = from.bindingTypes[DEFAULT_BINDING_TYPE_ID]?.bands ?? [];
  const bandsB = to.bindingTypes[DEFAULT_BINDING_TYPE_ID]?.bands ?? [];
  const sheetsKey = (band: { minSheets: number; maxSheets: number }): Seg[] => ['صحافی، ', num(band.minSheets), ' تا ', num(band.maxSheets), ' برگ'];
  const same = (x: { minSheets: number; maxSheets: number }, y: { minSheets: number; maxSheets: number }) =>
    x.minSheets === y.minSheets && x.maxSheets === y.maxSheets;
  for (const band of bandsB) {
    const old = bandsA.find((a) => same(a, band));
    if (!old) line('صحافی', sheetsKey(band), ['تازه: ', tomans(band.priceRials), ' تومان']);
    else if (old.priceRials !== band.priceRials) line('صحافی', sheetsKey(band), moved(old.priceRials, band.priceRials));
  }
  for (const band of bandsA) if (!bandsB.some((b) => same(b, band))) line('صحافی', sheetsKey(band), ['برداشته شد']);
  const maxA = from.bindingTypes[DEFAULT_BINDING_TYPE_ID]?.maxSheetsPerVolume;
  const maxB = to.bindingTypes[DEFAULT_BINDING_TYPE_ID]?.maxSheetsPerVolume;
  if (maxA !== undefined && maxB !== undefined && maxA !== maxB) line('صحافی', ['جلد تازه بالای'], [num(maxA), ' ← ', num(maxB), ' برگ']);

  const ratesA = postRates(from);
  const ratesB = postRates(to);
  const zoneName = (id: string) => ZONES.find((zone) => zone.id === id)?.name ?? id;
  const rateKeyOf = (rate: ShippingRate): Seg[] => ['پست پیشتاز، ', zoneName(rate.zoneId), '، ', ...weightLabel(rate.minWeightGrams, rate.maxWeightGrams)];
  const sameRate = (x: ShippingRate, y: ShippingRate) =>
    x.zoneId === y.zoneId && x.minWeightGrams === y.minWeightGrams && x.maxWeightGrams === y.maxWeightGrams;
  for (const rate of ratesB) {
    const old = ratesA.find((a) => sameRate(a, rate));
    if (!old) line('پست', rateKeyOf(rate), ['تازه: ', tomans(rate.priceRials), ' تومان']);
    else if (old.priceRials !== rate.priceRials) line('پست', rateKeyOf(rate), moved(old.priceRials, rate.priceRials));
  }
  for (const rate of ratesA) if (!ratesB.some((b) => sameRate(b, rate))) line('پست', rateKeyOf(rate), ['برداشته شد']);

  const restA = restRows(from);
  const restB = restRows(to);
  restB.forEach((row, i) => {
    if (canonicalJson(row.value) !== canonicalJson(restA[i]!.value)) line('بقیه', [row.label], [...restA[i]!.value, ' ← ', ...row.value]);
  });

  // هرچه بالا نیامد: کپی دو نسخه بی چیزهایی که خط خودشان را دارند، و بی نام و شماره.
  const rest = (list: PriceList) => {
    const binding = list.bindingTypes[DEFAULT_BINDING_TYPE_ID];
    const paper = list.paperTypes[DEFAULT_PAPER_TYPE_ID];
    return canonicalJson({
      ...list,
      version: 0,
      label: '',
      clickRates: { ...list.clickRates, bw: 0, color: 0 },
      paperTypes: { ...list.paperTypes, ...(paper ? { [DEFAULT_PAPER_TYPE_ID]: { ...paper, ratePerSheetRials: 0 } } : {}) },
      bindingTypes: { ...list.bindingTypes, ...(binding ? { [DEFAULT_BINDING_TYPE_ID]: { ...binding, bands: [], maxSheetsPerVolume: 0 } } : {}) },
      shippingRates: list.shippingRates.filter((rate) => rate.methodId !== DEFAULT_SHIPPING_METHOD_ID),
      settings: { ...list.settings, vatPercent: 0, roundingStepRials: 0, minOrderRials: 0, packagingWeightGrams: 0 },
    });
  };
  if (rest(from) !== rest(to)) line('بقیه', ['جزئیات دیگر'], ['عوض شد (کاغذ، وزن جلد یا روش‌های ارسال)']);

  const touched = new Set(lines.map((l) => l.group));
  return {
    lines: lines.map(({ key, value }) => ({ key, value })),
    unchanged: GROUPS.filter((group) => !touched.has(group)),
  };
}

/* ───────────────────────── دوره‌های فعال بودن ───────────────────────── */

export interface ActivePeriod {
  from: Date;
  /** null یعنی هنوز فعال است. */
  to: Date | null;
  by: string | null;
}

/**
 * هر فعال شدن تا فعال شدن بعدی (نسخهٔ دیگری) دوره‌ای است؛ آخری هنوز باز. ورودی به ترتیب زمان (`TariffStore.activations`).
 */
export function activePeriods(moments: readonly { version: number; at: Date; adminName: string | null }[]): Map<number, ActivePeriod[]> {
  const periods = new Map<number, ActivePeriod[]>();
  moments.forEach((moment, i) => {
    const next = moments[i + 1];
    const list = periods.get(moment.version) ?? [];
    list.push({ from: moment.at, to: next?.at ?? null, by: moment.adminName });
    periods.set(moment.version, list);
  });
  return periods;
}

/** «1405/06/20 تا 1405/07/05»؛ دوره‌ای که در یک روز باز و بسته شد با ساعت‌هایش: «1405/07/05، 10:48 تا 11:02». */
function spanText(period: ActivePeriod & { to: Date }): Seg[] {
  const from = formatJalaliNumeric(period.from);
  const to = formatJalaliNumeric(period.to);
  if (from !== to) return [{ num: from }, ' تا ', { num: to }];
  return [{ num: from }, '، ', { num: formatTehranTime(period.from) }, ' تا ', { num: formatTehranTime(period.to) }];
}

/**
 * دوره‌های فعال بودن یک نسخه در فهرست نسخه‌ها (طرح پنل `m-tariff`): «فعال از 1405/06/20» برای نسخهٔ فعال، «فعال بود
 * 1405/06/20 تا 1405/07/05» برای نسخهٔ قبل؛ نسخه‌ای که دوباره فعال شد دوره‌های پیش‌ترش را پس از «و پیش‌تر» دارد. ورودی
 * به ترتیب زمان (`activePeriods`)؛ تازه‌ترین دوره اول می‌آید.
 *
 * `active` همان `is_active` امروز است، و بر دوره‌ها مقدم: فعال کردنی که بیرون از پنل بوده (SQL دستی) رویداد ندارد، پس نسخهٔ
 * فعال «فعال» است حتی اگر آخرین دورهٔ ثبت‌شده‌اش بسته باشد، و نسخهٔ خاموش «فعال بود از …» اگر پایانش ثبت نشده.
 */
export function periodsText(periods: readonly ActivePeriod[], active: boolean): Seg[] {
  const spans = [...periods].reverse();
  const [latest] = spans;
  if (!latest) return active ? ['فعال'] : [];
  const date = (at: Date): Seg => ({ num: formatJalaliNumeric(at) });
  const closed = (period: ActivePeriod): Seg[] => (period.to ? spanText({ ...period, to: period.to }) : [date(period.from)]);
  const [head, earlier]: [Seg[], ActivePeriod[]] =
    latest.to === null
      ? [[active ? 'فعال از ' : 'فعال بود از ', date(latest.from)], spans.slice(1)]
      : active
        ? [['فعال'], spans]
        : [['فعال بود ', ...closed(latest)], spans.slice(1)];
  if (earlier.length === 0) return head;
  return [...head, '، و پیش‌تر ', ...earlier.flatMap((period, i) => [...(i ? ['، '] : []), ...closed(period)])];
}
