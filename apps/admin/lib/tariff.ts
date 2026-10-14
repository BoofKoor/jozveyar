/**
 * تعرفه به زبان پنل (برش ۴٫۵، ADR-040؛ طرح پنل `m-tariff*`؛ کاتالوگ کامل از ۸٫۳): فرم پیش‌نویس و سنجشش، پیش‌نمایش با همان
 * `quote()` سایت، فهرست تغییرها نسبت به نسخهٔ فعال، دوره‌های فعال بودن هر نسخه، و متن جدول‌های فقط‌خواندنی.
 *
 * خالص، بی پایگاه داده و بی JSX: ویرایشگر مرورگری (`components/TariffEditor.tsx`) همین را برای خطا و پیش‌نمایش زنده صدا
 * می‌زند، و سرویس سرور (`lib/server/tariff.ts`) هر ذخیره و فعال‌سازی را با همین دوباره می‌سنجد؛ سرور منبع حقیقت است.
 *
 * - **کاتالوگ (۸٫۳، سؤال‌های ۱۸۳ تا ۱۸۹):** نرخ هر رو برای هر اندازه × یکرو یا دورو × رنگ (A4 همیشه، A5 و A3 با تیک)؛ کاغذها
 *   با گرماژ و نرخ هر برگ هر اندازه؛ صحافی‌ها با کمینه و بیشینهٔ برگ، «بالای سقف چند جلد یا نمی‌خورد»، وزن، و بازه‌های هر
 *   اندازه. کاغذ و صحافی تازه را مالک می‌افزاید و غیرپیش‌فرض را حذف می‌کند؛ پیش‌فرض‌ها (`tahrir80`، `spiral_clear`) خاموش و
 *   حذف نمی‌شوند و هر اندازهٔ ارائه‌شده را دارند، تا هر جزوه‌ای کاغذ و صحافی‌ای داشته باشد (`effectiveConfig` سایت).
 * - **پول:** ورودی تومان است و `PriceList` ریال (قاعدهٔ ۳)؛ تبدیل فقط اینجا، در لایهٔ ورودی ادمین.
 * - **صحافی بر حسب برگ،** دوسرشامل، از کمینه تا سقف جلد بی شکاف و بی همپوشانی، برای هر اندازه: موتور قیمت هر جلد را با یک
 *   بازه قیمت می‌دهد، پس برگی که بازه ندارد جزوه‌ای بی قیمت صحافی است، و برگی که دو بازه دارد دو قیمت. همپوشانی را پایگاه داده
 *   هم رد می‌کند (`EXCLUDE`، ADR-022)؛ اینجا پیش از آن و با جای دقیق.
 * - **هشدار، نه خطا:** عددی بیش از ده برابر همان عدد نسخهٔ فعال، «شاید ریال نوشته‌ای».
 */

import type { BindingBand, BindingType, PaperSize, PaperType, PriceList, PrintRate, ShippingRate } from '@jozveyar/contracts';
import { PAPER_SIZES, PAPER_SIZE_ORDER, offeredSizes, quote, wholeDocumentRule } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { formatJalali, formatJalaliNumeric, formatNumber, formatTehranTime, rialsToTomans, toLatinDigits, tomansToRials } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

import type { Seg } from './orders';

/** بلندترین نام نسخه، پس از یکدست شدن. */
export const LABEL_MAX = 60;
/** بلندترین نام کاغذ یا صحافی. */
export const NAME_MAX = 40;
/** بیشترین بازهٔ صحافی در هر اندازه. */
export const BANDS_MAX = 20;
/** بیشترین کاغذ، و بیشترین صحافی، یک نسخه. */
export const OPTIONS_MAX = 20;
/** بزرگ‌ترین عدد تومانی فرم؛ بیشتر یعنی صفر اضافه. */
export const TOMANS_MAX = 100_000_000;
/** بزرگ‌ترین شمارهٔ برگ فرم؛ بیشتر یعنی اشتباه تایپی (سقف جلد طلق و سیم ۸۰۰ است). */
export const SHEETS_MAX = 100_000;
/** بزرگ‌ترین گرماژ کاغذ. */
export const GSM_MAX = 1_000;
/** بزرگ‌ترین وزن یک جلد صحافی، گرم. */
export const WEIGHT_MAX = 10_000;
/** «شاید ریال نوشته‌ای»: عددی بیش از این چند برابر همان عدد نسخهٔ فعال. */
export const WARN_FACTOR = 10;
/** شناسهٔ کاغذ و صحافی: لاتین کوچک، رقم و زیرخط، از حرف؛ همان که ستون‌های `id` و پیش‌نویس سایت نگه می‌دارند. */
export const OPTION_ID = /^[a-z][a-z0-9_]{1,39}$/;

const SIDES = ['double', 'single'] as const;
const COLORS = ['bw', 'color'] as const;
const SIDE_NAME = { double: 'دورو', single: 'یکرو' } as const;
const COLOR_NAME = { bw: 'سیاه‌سفید', color: 'رنگی' } as const;

/** «A4»، چپ‌به‌راست. */
export const sizeSeg = (size: PaperSize): Seg => ({ ltr: PAPER_SIZES[size].label });

/** یک مقدار برای هر اندازه، به ترتیب نمایش. */
function bySize<T>(make: (size: PaperSize) => T): Record<PaperSize, T> {
  return { a4: make('a4'), a5: make('a5'), a3: make('a3') };
}

/**
 * شناسهٔ کاغذ یا صحافی تازه: «paper_…» یا «binding_…» با زمان و تصادف، پس دو گزینهٔ تازه یا گزینه‌ای که حذف و دوباره افزوده شد
 * شناسهٔ هم را نمی‌گیرند (پیش‌نویس سایت شناسه را نگه می‌دارد، سؤال ۲۲۴).
 */
export function newOptionId(kind: 'paper' | 'binding', at = Date.now(), random = Math.random()): string {
  return `${kind}_${at.toString(36)}${Math.floor(random * 36 ** 4).toString(36).padStart(4, '0')}`;
}

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

/** نرخ هر رو یک اندازه، تومان: یکرو و دورو، هر کدام سیاه‌سفید و رنگی. */
export type SizeRatesInput = Record<'single' | 'double', Record<'bw' | 'color', string>>;

export interface PaperInput {
  id: string;
  name: string;
  gsm: string;
  enabled: boolean;
  /** تومان هر برگ؛ خالی یعنی این کاغذ این اندازه را ندارد. */
  rates: Record<PaperSize, string>;
}

export interface BindingInput {
  id: string;
  name: string;
  enabled: boolean;
  /** کمینه و بیشینهٔ برگ یک جلد. */
  min: string;
  max: string;
  /** بالای بیشینه: چند جلد (true) یا «نمی‌خورد». */
  splits: boolean;
  /** وزن یک جلد، گرم. */
  weight: string;
  /** بازه‌های هر اندازه؛ بی بازه یعنی این صحافی این اندازه را ندارد. */
  bands: Record<PaperSize, BandInput[]>;
}

/** فرم پیش‌نویس، همان که تایپ شد. پول تومان است؛ کرایه هر خانه با کلید `rateKey`. */
export interface DraftForm {
  label: string;
  /** اندازه‌های ارائه‌شده؛ A4 همیشه. */
  sizes: Record<PaperSize, boolean>;
  print: Record<PaperSize, SizeRatesInput>;
  papers: PaperInput[];
  bindings: BindingInput[];
  ship: Record<string, string>;
}

/**
 * جای یک خطا یا هشدار: `label`؛ `print.<اندازه>.<یکرو|دورو>.<رنگ>`؛ `paper.<ردیف>.name|gsm|enabled|rate.<اندازه>`؛
 * `binding.<ردیف>.name|enabled|min|max|splits|weight|bands.<اندازه>` و `binding.<ردیف>.band.<اندازه>.<ردیف بازه>.from|to|price`؛
 * `papers` و `bindings` (کل فهرست)؛ `ship.<کلید>`؛ و `list` برای چیزی که فرم ندارد (روش ارسال پیش‌فرض).
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

const emptyRates = (): SizeRatesInput => ({ single: { bw: '', color: '' }, double: { bw: '', color: '' } });
const bandsField = (bands: readonly BindingBand[] | undefined): BandInput[] =>
  (bands ?? []).map((band) => ({ from: String(band.minSheets), to: String(band.maxSheets), price: tomansField(band.priceRials) }));

/** پیش‌فرض اول، بقیه به همان ترتیب نسخه. */
function defaultFirst<T>(table: Readonly<Record<string, T>>, defaultId: string): [string, T][] {
  const entries = Object.entries(table);
  return [...entries.filter(([id]) => id === defaultId), ...entries.filter(([id]) => id !== defaultId)];
}

/** فرم از روی یک نسخه: همان که ویرایشگر با آن باز می‌شود. */
export function draftFormOf(list: PriceList): DraftForm {
  const ship: Record<string, string> = {};
  for (const rate of postRates(list)) ship[rateKey(rate)] = tomansField(rate.priceRials);
  return {
    label: list.label,
    sizes: bySize((size) => list.printRates[size] !== undefined),
    print: bySize((size) => {
      const rate = list.printRates[size];
      if (!rate) return emptyRates();
      return {
        single: { bw: tomansField(rate.single.bw), color: tomansField(rate.single.color) },
        double: { bw: tomansField(rate.double.bw), color: tomansField(rate.double.color) },
      };
    }),
    papers: defaultFirst(list.paperTypes, DEFAULT_PAPER_TYPE_ID).map(([id, paper]) => ({
      id,
      name: paper.nameFa,
      gsm: String(paper.gsm),
      enabled: paper.enabled,
      rates: bySize((size) => (paper.sheetRates[size] === undefined ? '' : tomansField(paper.sheetRates[size]!))),
    })),
    bindings: defaultFirst(list.bindingTypes, DEFAULT_BINDING_TYPE_ID).map(([id, binding]) => ({
      id,
      name: binding.nameFa,
      enabled: binding.enabled,
      min: String(binding.minSheets),
      max: String(binding.maxSheetsPerVolume),
      splits: binding.splitsVolumes,
      weight: String(binding.weightPerVolumeGrams),
      bands: bySize((size) => bandsField(binding.bands[size])),
    })),
    ship,
  };
}

/** کاغذ تازه: روشن، نرخ صفر برای هر اندازهٔ ارائه‌شده (مالک عوضش می‌کند). */
export function newPaper(sizes: Record<PaperSize, boolean>, at?: number, random?: number): PaperInput {
  return {
    id: newOptionId('paper', at, random),
    name: '',
    gsm: '80',
    enabled: true,
    rates: bySize((size) => (size === 'a4' || sizes[size] ? '0' : '')),
  };
}

/** صحافی تازه: روشن، یک جلد تا ۵۰ برگ («نمی‌خورد» بالاتر)، و یک ردیف بازهٔ خالی برای A4. */
export function newBinding(at?: number, random?: number): BindingInput {
  return {
    id: newOptionId('binding', at, random),
    name: '',
    enabled: true,
    min: '1',
    max: '50',
    splits: false,
    weight: '10',
    bands: { a4: [{ from: '1', to: '50', price: '' }], a5: [], a3: [] },
  };
}

/**
 * فرم پیش‌نویس از فیلدهای فرم HTML (server action)، به نام‌های `DraftIssue`: `label`؛ `size.a5|a3` (تیک)؛
 * `print.<اندازه>.<یکرو|دورو>.<رنگ>`؛ `paper.<ردیف>.id|name|gsm|enabled|rate.<اندازه>`؛
 * `binding.<ردیف>.id|name|enabled|min|max|splits|weight` و `binding.<ردیف>.band.<اندازه>.<ردیف>.from|to|price`؛ و
 * `ship.<منطقه>:<آغاز وزن>`. تیکی که نیامد خاموش است؛ ردیف بی شناسه نادیده؛ هر چیز دیگر نادیده؛ هر مقدار کوتاه‌شده، و ردیف‌ها به
 * ترتیب شماره‌شان. سنجش با `readDraft`.
 */
export function draftFormFromEntries(entries: Iterable<[string, unknown]>): DraftForm {
  const form: DraftForm = {
    label: '',
    sizes: { a4: true, a5: false, a3: false },
    print: bySize(emptyRates),
    papers: [],
    bindings: [],
    ship: {},
  };
  const papers = new Map<number, PaperInput>();
  const bindings = new Map<number, { row: BindingInput; bands: Record<PaperSize, Map<number, BandInput>> }>();
  const paperAt = (index: number) => {
    let row = papers.get(index);
    if (!row) papers.set(index, (row = { id: '', name: '', gsm: '', enabled: false, rates: bySize(() => '') }));
    return row;
  };
  const bindingAt = (index: number) => {
    let entry = bindings.get(index);
    if (!entry) {
      entry = {
        row: { id: '', name: '', enabled: false, min: '', max: '', splits: false, weight: '', bands: bySize(() => []) },
        bands: bySize(() => new Map<number, BandInput>()),
      };
      bindings.set(index, entry);
    }
    return entry;
  };
  for (const [key, raw] of entries) {
    if (typeof raw !== 'string') continue;
    const value = raw.slice(0, 200);
    let m: RegExpExecArray | null;
    if (key === 'label') form.label = value;
    else if ((m = /^size\.(a5|a3)$/.exec(key))) form.sizes[m[1] as PaperSize] = value !== '';
    else if ((m = /^print\.(a4|a5|a3)\.(single|double)\.(bw|color)$/.exec(key))) {
      form.print[m[1] as PaperSize][m[2] as 'single' | 'double'][m[3] as 'bw' | 'color'] = value;
    } else if ((m = /^paper\.(\d{1,2})\.(id|name|gsm|enabled)$/.exec(key))) {
      const row = paperAt(Number(m[1]));
      if (m[2] === 'enabled') row.enabled = value !== '';
      else row[m[2] as 'id' | 'name' | 'gsm'] = value;
    } else if ((m = /^paper\.(\d{1,2})\.rate\.(a4|a5|a3)$/.exec(key))) {
      paperAt(Number(m[1])).rates[m[2] as PaperSize] = value;
    } else if ((m = /^binding\.(\d{1,2})\.(id|name|enabled|min|max|splits|weight)$/.exec(key))) {
      const { row } = bindingAt(Number(m[1]));
      if (m[2] === 'enabled') row.enabled = value !== '';
      else if (m[2] === 'splits') row.splits = value === '1';
      else row[m[2] as 'id' | 'name' | 'min' | 'max' | 'weight'] = value;
    } else if ((m = /^binding\.(\d{1,2})\.band\.(a4|a5|a3)\.(\d{1,3})\.(from|to|price)$/.exec(key))) {
      const rows = bindingAt(Number(m[1])).bands[m[2] as PaperSize];
      const index = Number(m[3]);
      const band = rows.get(index) ?? { from: '', to: '', price: '' };
      band[m[4] as keyof BandInput] = value;
      rows.set(index, band);
    } else if ((m = /^ship\.([a-z_]{1,20}:\d{1,9})$/.exec(key))) form.ship[m[1]!] = value;
  }
  const ordered = <T>(map: Map<number, T>) => [...map.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
  form.papers = ordered(papers).filter((row) => row.id !== '');
  form.bindings = ordered(bindings)
    .map(({ row, bands }) => ({ ...row, bands: bySize((size) => ordered(bands[size])) }))
    .filter((row) => row.id !== '');
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

/** بیشترین کمینهٔ صحافی‌ای که چند جلد می‌شود: جزوهٔ «سقف + ۱» برگی دو جلد با همین شمار برگ و یکی بیشتر است. */
export const splitFloor = (maxSheets: number) => Math.floor((maxSheets + 1) / 2);

/**
 * بازه‌های صحافی یک اندازه، دوسرشامل، باید برگ کمینه تا سقف جلد را درست یک بار بپوشانند. خطاها با اندیس همان آرایه‌ای که آمد
 * (فرم می‌تواند نامرتب باشد): جای «از» یا «تا»ی همان ردیف. پیام‌ها کار بعدی را می‌گویند (««از» را 301 کن»).
 */
export function bandIssues(
  bands: readonly { from: number; to: number }[],
  maxSheets: number,
  minSheets = 1,
): { index: number; part: 'from' | 'to'; text: Seg[] }[] {
  const issues: { index: number; part: 'from' | 'to'; text: Seg[] }[] = [];
  const order = bands.map((band, index) => ({ ...band, index })).sort((a, b) => a.from - b.from || a.to - b.to);
  /** نخستین برگی که هنوز بازه ندارد؛ و بازه‌ای که تا دورترین برگ رسیده (همان که «تا»یش آخر است). */
  let next = minSheets;
  let furthest: (typeof order)[number] | null = null;
  for (const band of order) {
    if (!furthest && band.from < minSheets) {
      issues.push({ index: band.index, part: 'from', text: ['کمینهٔ برگ ', num(minSheets), ' است: «از» را ', num(minSheets), ' کن.'] });
    } else if (band.from > next) {
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
      text: ['بالای ', num(maxSheets), ' برگ سقف جلد است: «تا»ی آخرین بازه ', num(maxSheets), ' باشد.'],
    });
  }
  return issues;
}

/** نام گزینه برای پیام‌های کل نسخه: «صحافی «منگنه»». */
const optionName = (kind: string, name: string): Seg[] => [kind, ' «', { name }, '»'];

/**
 * آنچه موتور قیمت و سایت برای کار درست از یک نسخه لازم دارند، بیرون از فرم: نرخ چاپ A4؛ کاغذ و صحافی پیش‌فرض روشن و با هر
 * اندازهٔ ارائه‌شده (صحافی پیش‌فرض چند جلد می‌شود و از برگ ۱)، تا هر جزوه‌ای کاغذ و صحافی داشته باشد؛ بازه‌های هر صحافی در
 * هر اندازه از کمینه تا سقف جلد؛ کمینهٔ صحافی‌ای که چند جلد می‌شود تا نصف سقف؛ و کرایهٔ هر منطقه برای هر وزنی (از صفر تا بی
 * سقف، پشت‌سرهم). پیش‌نویسی که از فرم آمده این‌ها را دارد؛ این برای هر نسخه است، پیش از فعال شدن.
 */
export function checkPriceList(list: PriceList): Seg[][] {
  const problems: Seg[][] = [];
  const sizes = offeredSizes(list);
  if (!list.printRates.a4) problems.push(['نرخ چاپ ', sizeSeg('a4'), ' لازم است.']);
  const paper = list.paperTypes[DEFAULT_PAPER_TYPE_ID];
  if (!paper?.enabled) problems.push(['کاغذ پیش‌فرض (', { ltr: DEFAULT_PAPER_TYPE_ID }, ') در این نسخه نیست یا خاموش است.']);
  else {
    for (const size of sizes) {
      if (paper.sheetRates[size] === undefined) problems.push(['کاغذ پیش‌فرض نرخ ', sizeSeg(size), ' ندارد.']);
    }
  }
  const binding = list.bindingTypes[DEFAULT_BINDING_TYPE_ID];
  if (!binding?.enabled) problems.push(['صحافی پیش‌فرض (', { ltr: DEFAULT_BINDING_TYPE_ID }, ') در این نسخه نیست یا خاموش است.']);
  else {
    if (!binding.splitsVolumes || binding.minSheets !== 1) problems.push(['صحافی پیش‌فرض از برگ ', num(1), ' است و بالای سقف چند جلد می‌شود.']);
    for (const size of sizes) {
      if (!binding.bands[size]?.length) problems.push(['صحافی پیش‌فرض بازه‌های ', sizeSeg(size), ' را ندارد.']);
    }
  }
  for (const [id, row] of Object.entries(list.bindingTypes)) {
    const name = optionName('صحافی', row.nameFa || id);
    if (row.splitsVolumes && row.minSheets > splitFloor(row.maxSheetsPerVolume)) {
      problems.push([...name, ': کمینهٔ برگ بیش از نصف سقف است.']);
    }
    for (const size of PAPER_SIZE_ORDER) {
      const bands = row.bands[size];
      if (!bands?.length) continue;
      const issues = bandIssues(
        bands.map((band) => ({ from: band.minSheets, to: band.maxSheets })),
        row.maxSheetsPerVolume,
        row.minSheets,
      );
      for (const issue of issues) problems.push([...name, '، ', sizeSeg(size), ': ', ...issue.text]);
    }
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
 * فرم پیش‌نویس به تعرفه: هر خطا با جایش، هشدارها جدا، و تعرفهٔ ساخته‌شده اگر خطایی نیست. هرچه فرم ندارد (روش‌های ارسال، وزن‌ها،
 * مالیات و …) از `base` می‌آید، یعنی همان پیش‌نویس ذخیره‌شده؛ `active` فقط برای هشدار ده برابر. نرخ کاغذ و بازهٔ صحافی اندازه‌ای
 * که ارائه نمی‌شود ذخیره نمی‌شود.
 */
export function readDraft(form: DraftForm, base: PriceList, active: PriceList | null): DraftCheck {
  const errors: DraftIssue[] = [];
  const warnings: DraftIssue[] = [];
  const error = (field: string, text: Seg[]) => errors.push({ field, text });
  const warn = (field: string, text: Seg[] | null) => {
    if (text) warnings.push({ field, text });
  };
  const failed = (prefix: string) => errors.some((issue) => issue.field === prefix || issue.field.startsWith(`${prefix}.`));

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
  /** عدد صحیح از `min` تا `max`؛ null با پیام همان فیلد. */
  const whole = (field: string, text: string, min: number, max: number, range: Seg[]): number | null => {
    const parsed = parseWhole(text, max);
    if (parsed.ok && parsed.value >= min) return parsed.value;
    error(field, parsed.ok || parsed.error === 'too_big' ? range : WHOLE_ERRORS[parsed.error]);
    return null;
  };
  /**
   * نام گزینه: یکدست، نه خالی، نه بلند، نه تکراری. نامی که یکدستش همان نام ذخیره‌شده است همان املا می‌ماند («تحریر ۸۰ گرم»
   * پایه با ارقام فارسی)، تا نامی که دست نخورده در «چه عوض می‌شود» «نام: …» نگیرد.
   */
  const nameOf = (field: string, text: string, seen: Set<string>, empty: string, stored: string | undefined): string => {
    const name = tidyInputFa(text);
    if (!name) error(field, [empty]);
    else if ([...name].length > NAME_MAX) error(field, ['نام حداکثر ', num(NAME_MAX), ' نویسه باشد.']);
    else if (seen.has(name)) error(field, ['این نام را گزینهٔ دیگری هم دارد.']);
    seen.add(name);
    return stored !== undefined && tidyInputFa(stored) === name ? stored : name;
  };

  const label = tidyInputFa(form.label);
  if (!label) error('label', ['نام نسخه را بنویس.']);
  else if ([...label].length > LABEL_MAX) error('label', ['نام حداکثر ', num(LABEL_MAX), ' نویسه باشد.']);

  // ── نرخ چاپ هر اندازه ──
  const sizes = PAPER_SIZE_ORDER.filter((size) => size === 'a4' || form.sizes[size]);
  const printRates: Partial<Record<PaperSize, PrintRate>> = {};
  for (const size of sizes) {
    const rate: PrintRate = { single: { bw: 0, color: 0 }, double: { bw: 0, color: 0 } };
    let complete = true;
    for (const sides of SIDES) {
      for (const color of COLORS) {
        const field = `print.${size}.${sides}.${color}`;
        const rials = money(field, form.print[size][sides][color], 1);
        if (rials === null) {
          complete = false;
          continue;
        }
        rate[sides][color] = rials;
        warn(field, tenfold(rials, active?.printRates[size]?.[sides][color]));
      }
    }
    if (complete) printRates[size] = rate;
  }

  // ── کاغذها ──
  const paperTypes: Record<string, PaperType> = {};
  const paperIds = new Set<string>();
  const paperNames = new Set<string>();
  if (form.papers.length > OPTIONS_MAX) error('papers', ['حداکثر ', num(OPTIONS_MAX), ' کاغذ.']);
  form.papers.forEach((row, i) => {
    const at = (part: string) => `paper.${i}.${part}`;
    if (!OPTION_ID.test(row.id) || paperIds.has(row.id)) {
      error(at('name'), ['شناسهٔ این کاغذ درست نیست؛ صفحه را دوباره باز کن.']);
      return;
    }
    paperIds.add(row.id);
    const isDefault = row.id === DEFAULT_PAPER_TYPE_ID;
    const name = nameOf(at('name'), row.name, paperNames, 'نام کاغذ را بنویس.', base.paperTypes[row.id]?.nameFa);
    const gsm = whole(at('gsm'), row.gsm, 1, GSM_MAX, ['گرماژ عددی از ', num(1), ' تا ', num(GSM_MAX), ' است.']);
    if (isDefault && !row.enabled) error(at('enabled'), ['کاغذ پیش‌فرض خاموش نمی‌شود.']);
    const sheetRates: Partial<Record<PaperSize, number>> = {};
    for (const size of sizes) {
      const field = at(`rate.${size}`);
      const text = row.rates[size] ?? '';
      if (text.trim() === '') {
        if (isDefault) error(field, ['کاغذ پیش‌فرض نرخ هر اندازه را دارد؛ صفر هم می‌شود.']);
        continue;
      }
      const rials = money(field, text, 0);
      if (rials === null) continue;
      sheetRates[size] = rials;
      warn(field, tenfold(rials, active?.paperTypes[row.id]?.sheetRates[size]));
    }
    if (row.enabled && !isDefault && Object.keys(sheetRates).length === 0 && !failed(`paper.${i}`)) {
      warn(at('name'), ['این کاغذ در هیچ اندازه‌ای نرخ ندارد، پس در سایت دیده نمی‌شود.']);
    }
    paperTypes[row.id] = { nameFa: name, gsm: gsm ?? 0, enabled: row.enabled, sheetRates };
  });
  if (!paperIds.has(DEFAULT_PAPER_TYPE_ID)) error('papers', ['کاغذ پیش‌فرض (', { ltr: DEFAULT_PAPER_TYPE_ID }, ') حذف نمی‌شود.']);

  // ── صحافی‌ها ──
  const bindingTypes: Record<string, BindingType> = {};
  const bindingIds = new Set<string>();
  const bindingNames = new Set<string>();
  if (form.bindings.length > OPTIONS_MAX) error('bindings', ['حداکثر ', num(OPTIONS_MAX), ' صحافی.']);
  form.bindings.forEach((row, i) => {
    const at = (part: string) => `binding.${i}.${part}`;
    if (!OPTION_ID.test(row.id) || bindingIds.has(row.id)) {
      error(at('name'), ['شناسهٔ این صحافی درست نیست؛ صفحه را دوباره باز کن.']);
      return;
    }
    bindingIds.add(row.id);
    const isDefault = row.id === DEFAULT_BINDING_TYPE_ID;
    const name = nameOf(at('name'), row.name, bindingNames, 'نام صحافی را بنویس.', base.bindingTypes[row.id]?.nameFa);
    const min = whole(at('min'), row.min, 1, SHEETS_MAX, ['کمینهٔ برگ از ', num(1), ' است.']);
    const max = whole(at('max'), row.max, 1, SHEETS_MAX, ['سقف برگ هر جلد از ', num(1), ' تا ', num(SHEETS_MAX), ' است.']);
    const weight = whole(at('weight'), row.weight, 0, WEIGHT_MAX, ['وزن جلد از ', num(0), ' تا ', num(WEIGHT_MAX), ' گرم است.']);
    if (min !== null && max !== null && max < min) error(at('max'), ['سقف برگ هر جلد از کمینه کمتر است.']);
    else if (min !== null && max !== null && row.splits && min > splitFloor(max)) {
      error(at('min'), [
        'صحافی‌ای که چند جلد می‌شود کمینه‌ای بیش از ',
        num(splitFloor(max)),
        ' برگ ندارد: جزوهٔ ',
        num(max + 1),
        ' برگی دو جلد ',
        num(splitFloor(max)),
        ' و ',
        num(max + 1 - splitFloor(max)),
        ' برگی است.',
      ]);
    }
    if (isDefault) {
      if (!row.enabled) error(at('enabled'), ['صحافی پیش‌فرض خاموش نمی‌شود.']);
      if (!row.splits) error(at('splits'), ['صحافی پیش‌فرض بالای سقف چند جلد می‌شود، تا هر جزوه‌ای صحافی داشته باشد.']);
      if (min !== null && min !== 1) error(at('min'), ['کمینهٔ برگ صحافی پیش‌فرض ', num(1), ' است، تا هر جزوه‌ای صحافی داشته باشد.']);
    }
    const sized: Partial<Record<PaperSize, BindingBand[]>> = {};
    const activeBinding = active?.bindingTypes[row.id];
    for (const size of sizes) {
      // ردیف تمام‌خالی نادیده است (ردیفی که «افزودن بازه» ساخت و پر نشد).
      const rows = (row.bands[size] ?? [])
        .map((band, index) => ({ band, index }))
        .filter(({ band }) => `${band.from}${band.to}${band.price}`.trim() !== '');
      if (rows.length === 0) {
        if (isDefault) error(at(`bands.${size}`), ['صحافی پیش‌فرض بازه‌های هر اندازه را دارد.']);
        continue;
      }
      if (rows.length > BANDS_MAX) {
        error(at(`bands.${size}`), ['حداکثر ', num(BANDS_MAX), ' بازه.']);
        continue;
      }
      const bands: { index: number; from: number; to: number; priceRials: number }[] = [];
      let bandsOk = true;
      for (const { band, index } of rows) {
        const field = (part: string) => at(`band.${size}.${index}.${part}`);
        const sheets = (part: 'from' | 'to', text: string) => whole(field(part), text, 1, SHEETS_MAX, ['این شمارهٔ برگ درست نیست.']);
        const from = sheets('from', band.from);
        const to = sheets('to', band.to);
        const priceRials = money(field('price'), band.price, 0);
        if (from === null || to === null || priceRials === null) {
          bandsOk = false;
          continue;
        }
        if (from > to) {
          error(field('to'), ['«تا» از «از» کمتر است.']);
          bandsOk = false;
          continue;
        }
        bands.push({ index, from, to, priceRials });
        const covering = activeBinding?.bands[size]?.find((b) => from >= b.minSheets && from <= b.maxSheets);
        warn(field('price'), tenfold(priceRials, covering?.priceRials));
      }
      if (bandsOk && min !== null && max !== null && max >= min) {
        for (const issue of bandIssues(bands, max, min)) error(at(`band.${size}.${bands[issue.index]!.index}.${issue.part}`), issue.text);
      }
      sized[size] = bands
        .slice()
        .sort((a, b) => a.from - b.from)
        .map((band) => ({ minSheets: band.from, maxSheets: band.to, priceRials: band.priceRials }));
    }
    if (row.enabled && !isDefault && Object.keys(sized).length === 0 && !failed(`binding.${i}`)) {
      warn(at('name'), ['این صحافی در هیچ اندازه‌ای بازه ندارد، پس در سایت دیده نمی‌شود.']);
    }
    bindingTypes[row.id] = {
      nameFa: name,
      enabled: row.enabled,
      minSheets: min ?? 1,
      maxSheetsPerVolume: max ?? 1,
      splitsVolumes: row.splits,
      weightPerVolumeGrams: weight ?? 0,
      bands: sized,
    };
  });
  if (!bindingIds.has(DEFAULT_BINDING_TYPE_ID)) error('bindings', ['صحافی پیش‌فرض (', { ltr: DEFAULT_BINDING_TYPE_ID }, ') حذف نمی‌شود.']);

  // ── کرایه: همان خانه‌های پیش‌نویس؛ وزن‌ها و منطقه‌ها عوض نمی‌شوند ──
  const activeRates = new Map((active ? postRates(active) : []).map((rate) => [rateKey(rate), rate.priceRials]));
  const shipRials = new Map<string, number>();
  for (const rate of postRates(base)) {
    const key = rateKey(rate);
    const rials = money(`ship.${key}`, form.ship[key] ?? '', 0);
    if (rials === null) continue;
    shipRials.set(key, rials);
    warn(`ship.${key}`, tenfold(rials, activeRates.get(key)));
  }

  if (errors.length > 0) return { list: null, errors, warnings };
  const list: PriceList = {
    ...base,
    label,
    printRates,
    paperTypes,
    bindingTypes,
    shippingRates: base.shippingRates.map((rate) => {
      const rials = rate.methodId === DEFAULT_SHIPPING_METHOD_ID ? shipRials.get(rateKey(rate)) : undefined;
      return rials === undefined ? rate : { ...rate, priceRials: rials };
    }),
  };
  for (const problem of checkPriceList(list)) error('list', problem);
  return { list: errors.length > 0 ? null : list, errors, warnings };
}

/* ───────────────────────── پیش‌نمایش ───────────────────────── */

export interface Sample {
  label: Seg[];
  /** صفحه‌های هر فایل جزوه. */
  sections: number[];
  colorMode: 'bw' | 'color';
  sidesMode: 'single' | 'double';
  paperSize: PaperSize;
  paperTypeId: string;
  bindingTypeId: string;
}

const standard = { paperSize: 'a4', paperTypeId: DEFAULT_PAPER_TYPE_ID, bindingTypeId: DEFAULT_BINDING_TYPE_ID } as const;

/** چهار جزوهٔ نمونهٔ طرح (A4، کاغذ و صحافی پیش‌فرض)، هر کدام یک نسخه و بی کرایه. */
export const PREVIEW_SAMPLES: readonly Sample[] = [
  { label: [num(147), ' صفحه، سیاه‌سفید، دورو'], sections: [147], colorMode: 'bw', sidesMode: 'double', ...standard },
  { label: [num(120), ' صفحه، رنگی، دورو'], sections: [120], colorMode: 'color', sidesMode: 'double', ...standard },
  { label: [num(3), ' فایل، ', num(300), ' صفحه، یکرو'], sections: [120, 100, 80], colorMode: 'bw', sidesMode: 'single', ...standard },
  { label: [num(1650), ' صفحه، دو جلد'], sections: [1650], colorMode: 'bw', sidesMode: 'double', ...standard },
];

/**
 * نمونه‌های پیش‌نمایش یک پیش‌نویس (۸٫۳): چهار نمونهٔ ثابت، و برای هر اندازهٔ دیگر، هر کاغذ روشن دیگر و هر صحافی روشن دیگرِ
 * پیش‌نویس یک جزوهٔ نمونه، تا هر عدد تازه دست‌کم یک بار در پیش‌نمایش بیاید. صحافی با جزوه‌ای که به آن می‌خورد (۷۴ برگ، یا
 * نزدیک‌ترین به آن میان کمینه و سقف).
 */
export function previewSamples(draft: PriceList): Sample[] {
  const samples: Sample[] = [...PREVIEW_SAMPLES];
  const sizes = offeredSizes(draft);
  for (const size of sizes.filter((s) => s !== 'a4')) {
    samples.push({ ...PREVIEW_SAMPLES[0]!, label: [num(147), ' صفحه، سیاه‌سفید، دورو، ', sizeSeg(size)], paperSize: size });
  }
  for (const [id, paper] of Object.entries(draft.paperTypes)) {
    if (id === DEFAULT_PAPER_TYPE_ID || !paper.enabled) continue;
    const size = sizes.find((s) => paper.sheetRates[s] !== undefined);
    if (!size) continue;
    samples.push({
      ...PREVIEW_SAMPLES[1]!,
      label: [num(120), ' صفحه، رنگی، دورو، ', { name: paper.nameFa }, ...(size === 'a4' ? [] : ['، ', sizeSeg(size)])],
      paperSize: size,
      paperTypeId: id,
    });
  }
  for (const [id, binding] of Object.entries(draft.bindingTypes)) {
    if (id === DEFAULT_BINDING_TYPE_ID || !binding.enabled) continue;
    const size = sizes.find((s) => binding.bands[s]?.length);
    if (!size) continue;
    const sheets = Math.min(Math.max(74, binding.minSheets), binding.maxSheetsPerVolume);
    samples.push({
      ...PREVIEW_SAMPLES[0]!,
      label: [num(sheets * 2), ' صفحه، دورو، ', { name: binding.nameFa }, ...(size === 'a4' ? [] : ['، ', sizeSeg(size)])],
      sections: [sheets * 2],
      paperSize: size,
      bindingTypeId: id,
    });
  }
  return samples;
}

/**
 * قیمت یک جزوهٔ نمونه بی کرایه، با همان `quote()` سایت؛ null اگر این نسخه آن اندازه یا گزینه را ندارد یا به جزوه نمی‌خورد.
 * «زیر حداقل سفارش» قیمت را عوض نمی‌کند، پس همان عدد.
 */
export function sampleRials(sample: Sample, list: PriceList): number | null {
  const pages = sample.sections.reduce((sum, n) => sum + n, 0);
  const breakdown = quote(
    {
      items: [
        {
          sections: sample.sections.map((pageCount, i) => ({ documentId: `sample-${i + 1}`, pageCount })),
          rules: wholeDocumentRule(pages, sample.colorMode, sample.paperTypeId),
          copies: 1,
          sidesMode: sample.sidesMode,
          paperSize: sample.paperSize,
          bindingTypeId: sample.bindingTypeId,
        },
      ],
      shipping: null,
    },
    list,
  );
  return breakdown.warnings.some((warning) => warning !== 'below_min_order') ? null : breakdown.totalWithoutShippingRials;
}

export interface PreviewRow {
  label: Seg[];
  /** null یعنی نسخهٔ فعال این گزینه را ندارد. */
  activeRials: number | null;
  draftRials: number | null;
  diffRials: number | null;
}

export function previewRows(active: PriceList, draft: PriceList): PreviewRow[] {
  return previewSamples(draft).map((sample) => {
    const activeRials = sampleRials(sample, active);
    const draftRials = sampleRials(sample, draft);
    const diffRials = activeRials === null || draftRials === null ? null : draftRials - activeRials;
    return { label: sample.label, activeRials, draftRials, diffRials };
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
  /** گروه‌هایی که هیچ عددشان عوض نشده، به ترتیب: چاپ، کاغذ، صحافی، پست، بقیه. */
  unchanged: string[];
}

const GROUPS = ['چاپ', 'کاغذ', 'صحافی', 'پست', 'بقیه'] as const;
type Group = (typeof GROUPS)[number];

/** «1,600 ← 1,700 تومان». */
const moved = (a: number, b: number, unit: Seg[] = [' تومان']): Seg[] => [tomans(a), ' ← ', tomans(b), ...unit];
/** «12 ← 20 برگ»: عدد بی تومان. */
const movedNum = (a: number, b: number, unit: string): Seg[] => [num(a), ' ← ', num(b), unit];

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

/** بازه‌های صحافی یک اندازه: هم‌بازه با قیمت دیگر، تازه، یا برداشته. */
function bandChanges(
  key: (band: BindingBand) => Seg[],
  from: readonly BindingBand[],
  to: readonly BindingBand[],
  line: (key: Seg[], value: Seg[]) => void,
) {
  const same = (x: BindingBand, y: BindingBand) => x.minSheets === y.minSheets && x.maxSheets === y.maxSheets;
  for (const band of to) {
    const old = from.find((a) => same(a, band));
    if (!old) line(key(band), ['تازه: ', tomans(band.priceRials), ' تومان']);
    else if (old.priceRials !== band.priceRials) line(key(band), moved(old.priceRials, band.priceRials));
  }
  for (const band of from) if (!to.some((b) => same(b, band))) line(key(band), ['برداشته شد']);
}

/** «روشن شد»/«خاموش شد». */
const switched = (enabled: boolean): Seg[] => [enabled ? 'روشن شد' : 'خاموش شد'];

/**
 * تغییرهای `to` نسبت به `from` (نسخهٔ فعال)، همان که صفحهٔ فعال‌سازی نشان می‌دهد (۸٫۳): نرخ هر رو هر اندازه (و اندازهٔ تازه یا
 * برداشته)؛ کاغذهای تازه، برداشته، و نام، گرماژ، روشن و خاموش و نرخ هر اندازهٔ کاغذهای مانده؛ همین برای صحافی‌ها با کمینه، سقف،
 * «بالای سقف»، وزن جلد و بازه‌های هر اندازه؛ کرایه‌ها؛ و مالیات و گرد کردن و حداقل سفارش و وزن بسته‌بندی. هرچه جز این‌ها فرق
 * دارد (روش‌های خاموش ارسال…) یک خط «جزئیات دیگر» است، تا چیزی پنهان نماند. نام نسخه تغییر نیست.
 */
export function tariffChanges(from: PriceList, to: PriceList): TariffChanges {
  const lines: (ChangeLine & { group: Group })[] = [];
  const line = (group: Group, key: Seg[], value: Seg[]) => lines.push({ group, key, value });

  // ── چاپ ──
  for (const size of PAPER_SIZE_ORDER) {
    const a = from.printRates[size];
    const b = to.printRates[size];
    if (!a && !b) continue;
    if (!a) line('چاپ', ['اندازهٔ ', sizeSeg(size)], ['تازه']);
    else if (!b) line('چاپ', ['اندازهٔ ', sizeSeg(size)], ['برداشته شد']);
    for (const color of COLORS) {
      for (const sides of SIDES) {
        const was = a?.[sides][color];
        const now = b?.[sides][color];
        if (was === now) continue;
        const key: Seg[] = ['چاپ ', COLOR_NAME[color], '، ', SIDE_NAME[sides], '، ', sizeSeg(size), '، هر رو'];
        if (was === undefined) line('چاپ', key, ['تازه: ', tomans(now!), ' تومان']);
        else if (now !== undefined) line('چاپ', key, moved(was, now));
      }
    }
  }

  // ── کاغذ: پیش‌فرض اول، بقیه به ترتیب نسخه (شناسه، پس گزینهٔ تازه به ترتیب ساختن)، مثل ویرایشگر و کارت‌ها ──
  for (const [id, paper] of defaultFirst(to.paperTypes, DEFAULT_PAPER_TYPE_ID)) {
    const old = from.paperTypes[id];
    const name = optionName('کاغذ', paper.nameFa);
    if (!old) {
      line('کاغذ', name, ['تازه']);
      continue;
    }
    if (old.nameFa !== paper.nameFa) line('کاغذ', optionName('کاغذ', old.nameFa), ['نام: ', { name: paper.nameFa }]);
    if (old.enabled !== paper.enabled) line('کاغذ', name, switched(paper.enabled));
    if (old.gsm !== paper.gsm) line('کاغذ', [...name, '، گرماژ'], movedNum(old.gsm, paper.gsm, ' گرم'));
    for (const size of PAPER_SIZE_ORDER) {
      const was = old.sheetRates[size];
      const now = paper.sheetRates[size];
      if (was === now) continue;
      const key: Seg[] = [...name, '، ', sizeSeg(size), '، هر برگ'];
      line('کاغذ', key, was === undefined ? ['تازه: ', tomans(now!), ' تومان'] : now === undefined ? ['برداشته شد'] : moved(was, now));
    }
  }
  for (const [id, paper] of Object.entries(from.paperTypes)) {
    if (!to.paperTypes[id]) line('کاغذ', optionName('کاغذ', paper.nameFa), ['برداشته شد']);
  }

  // ── صحافی ──
  for (const [id, binding] of defaultFirst(to.bindingTypes, DEFAULT_BINDING_TYPE_ID)) {
    const old = from.bindingTypes[id];
    const name = optionName('صحافی', binding.nameFa);
    if (!old) {
      line('صحافی', name, ['تازه']);
      continue;
    }
    if (old.nameFa !== binding.nameFa) line('صحافی', optionName('صحافی', old.nameFa), ['نام: ', { name: binding.nameFa }]);
    if (old.enabled !== binding.enabled) line('صحافی', name, switched(binding.enabled));
    if (old.minSheets !== binding.minSheets) line('صحافی', [...name, '، کمینهٔ برگ'], movedNum(old.minSheets, binding.minSheets, ' برگ'));
    if (old.maxSheetsPerVolume !== binding.maxSheetsPerVolume) {
      line('صحافی', [...name, '، سقف برگ هر جلد'], movedNum(old.maxSheetsPerVolume, binding.maxSheetsPerVolume, ' برگ'));
    }
    if (old.splitsVolumes !== binding.splitsVolumes) {
      line('صحافی', [...name, '، بالای سقف'], [binding.splitsVolumes ? 'چند جلد می‌شود' : 'نمی‌خورد']);
    }
    if (old.weightPerVolumeGrams !== binding.weightPerVolumeGrams) {
      line('صحافی', [...name, '، وزن هر جلد'], movedNum(old.weightPerVolumeGrams, binding.weightPerVolumeGrams, ' گرم'));
    }
    for (const size of PAPER_SIZE_ORDER) {
      const was = old.bands[size] ?? [];
      const now = binding.bands[size] ?? [];
      if (was.length === 0 && now.length > 0) line('صحافی', [...name, '، ', sizeSeg(size)], ['تازه']);
      else if (was.length > 0 && now.length === 0) line('صحافی', [...name, '، ', sizeSeg(size)], ['برداشته شد']);
      else {
        bandChanges(
          (band) => [...name, '، ', sizeSeg(size), '، ', num(band.minSheets), ' تا ', num(band.maxSheets), ' برگ'],
          was,
          now,
          (key, value) => line('صحافی', key, value),
        );
      }
    }
  }
  for (const [id, binding] of Object.entries(from.bindingTypes)) {
    if (!to.bindingTypes[id]) line('صحافی', optionName('صحافی', binding.nameFa), ['برداشته شد']);
  }

  // ── پست ──
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

  // ── بقیه ──
  const restA = restRows(from);
  const restB = restRows(to);
  restB.forEach((row, i) => {
    if (canonicalJson(row.value) !== canonicalJson(restA[i]!.value)) line('بقیه', [row.label], [...restA[i]!.value, ' ← ', ...row.value]);
  });

  // هرچه بالا نیامد: کپی دو نسخه بی چیزهایی که خط خودشان را دارند، و بی نام و شماره.
  const rest = (list: PriceList) =>
    canonicalJson({
      ...list,
      version: 0,
      label: '',
      printRates: {},
      paperTypes: {},
      bindingTypes: {},
      shippingRates: list.shippingRates.filter((rate) => rate.methodId !== DEFAULT_SHIPPING_METHOD_ID),
      settings: { ...list.settings, vatPercent: 0, roundingStepRials: 0, minOrderRials: 0, packagingWeightGrams: 0 },
    });
  if (rest(from) !== rest(to)) line('بقیه', ['جزئیات دیگر'], ['عوض شد (روش‌های ارسال)']);

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
