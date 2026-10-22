/**
 * بلوک‌های زنده (برش ۱۵٫۲، ADR-071؛ سؤال‌های ۴۳۳ و ۴۶۳): هر چه با تعرفه خاموش‌شدنی است (A5 و A3، صحافی‌ها و کاغذهای دیگر، پله‌های تخفیف) در
 * متن صفحه‌ها جای‌نگهدار نیست، بلوکی یک‌خطی است که سرور با تعرفهٔ فعال و همان `quote()` میز سفارش رسمش می‌کند (قاعدهٔ ۱):
 *
 *  - `[[تعرفه]]`: چاپ هر رو، هر اندازه و رنگ.
 *  - `[[صحافی]]`: بازه‌های هر صحافی روشن.
 *  - `[[ارسال]]`: کرایهٔ هر منطقه و وزن.
 *  - `[[تخفیف]]`: پله‌های تخفیف سفارش بزرگ؛ بی پله، هیچ.
 *  - `[[قیمت: 200 صفحه، سیاه‌سفید، دورو، طلق و سیم]]`: یک جزوهٔ نمونه، با واژه‌های خود میز و «،»؛ هر چه نگویی پیش‌فرض میز است.
 *
 * واژهٔ ناشناس یا عدد بیرون از سقف خطای انتشار است؛ گزینه‌ای که امروز در تعرفه نیست یا خاموش است هشدار، و روی سایت «فعلاً ارائه نمی‌شود»،
 * تا روزی که دوباره روشن شود. پس بلوکی که یک بار منتشر شد هرگز عددی بی‌صاحب نمی‌گوید. خالص، بی React؛ رسم در `render.tsx`.
 */

import type { BindingType, Breakdown, ColorMode, DiscountTier, PaperSize, PriceList, SidesMode } from '@jozveyar/contracts';
import {
  DEFAULT_PAPER_SIZE,
  NONE_PAUSED,
  PAPER_SIZES,
  PAPER_SIZE_ORDER,
  bindingMisfit,
  quote,
  sheetsOf,
  wholeDocumentRule,
  type BindingMisfit,
  type PausedOptions,
} from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';
import { tidyInputFa } from '@jozveyar/text/input';

/** سقف نسخهٔ نمونه، همان سقف میز (`itemSpecSchema`). */
export const SAMPLE_MAX_COPIES = 1000;

export type BlockKind = 'tariff' | 'binding' | 'shipping' | 'discount' | 'price';

/** نام هر بلوک در متن، به نوعش. */
export const BLOCK_NAMES: Readonly<Record<Exclude<BlockKind, 'price'>, string>> = {
  tariff: 'تعرفه',
  binding: 'صحافی',
  shipping: 'ارسال',
  discount: 'تخفیف',
};

/** یک جزوهٔ نمونه، همان‌طور که در متن نوشته شد؛ null یعنی پیش‌فرض میز. نام صحافی و کاغذ یکدست‌شده، و با تعرفهٔ امروز پیدا می‌شود. */
export interface SampleSpec {
  pages: number;
  copies: number;
  color: ColorMode | null;
  sides: SidesMode | null;
  size: PaperSize | null;
  binding: string | null;
  paper: string | null;
}

export type ParsedBlock = { kind: Exclude<BlockKind, 'price'> } | { kind: 'price'; spec: SampleSpec };

export type BlockIssueCode =
  /** نام بلوک ناشناس: «[[قیمت‌ها]]». */
  | 'block_unknown'
  /** واژه‌ای در «قیمت:» که نه عدد صفحه و نسخه است، نه رنگ، رو، اندازه، و نه نام صحافی یا کاغذی در تعرفه. */
  | 'block_word'
  /** یک ردیف دو بار: «رنگی، سیاه‌سفید». */
  | 'block_twice'
  /** «قیمت:» بی شمار صفحه. */
  | 'block_pages'
  /** صفحه یا نسخه بیرون از سقف. */
  | 'block_range';

export interface BlockIssue {
  code: BlockIssueCode;
  detail?: string;
  /** سقف، برای `block_range`. */
  max?: number;
}

/** نام صحافی و کاغذ برای پیدا کردن: بی فاصله و نیم‌فاصله، ارقام لاتین، «ي» و «ك» فارسی. */
const folded = (name: string) => tidyInputFa(name).replace(/[\s‌]+/g, '');

const COLOR_WORDS: Readonly<Record<string, ColorMode>> = { سیاهسفید: 'bw', سیاهوسفید: 'bw', رنگی: 'color' };
const SIDES_WORDS: Readonly<Record<string, SidesMode>> = { یکرو: 'single', دورو: 'double' };

/** واژه‌های «قیمت:» که از تعرفه‌اند: نام هر صحافی و کاغذ، روشن یا خاموش (خاموش هشدار است، ناشناس خطا). */
export interface BlockVocabulary {
  bindings: readonly string[];
  papers: readonly string[];
}

export function vocabularyOf(list: PriceList): BlockVocabulary {
  return {
    bindings: Object.values(list.bindingTypes).map((binding) => binding.nameFa),
    papers: Object.values(list.paperTypes).map((paper) => paper.nameFa),
  };
}

/** متن درون `[[…]]`: نوع بلوک، یا خطاهایش. `maxPages` سقف صفحهٔ هر فایل است (`file.max_pages`)، که همان سقف جزوهٔ نمونه است. */
export function parseBlock(raw: string, vocabulary: BlockVocabulary, maxPages: number): { block: ParsedBlock | null; issues: BlockIssue[] } {
  const text = tidyInputFa(raw);
  const named = (Object.entries(BLOCK_NAMES) as [Exclude<BlockKind, 'price'>, string][]).find(([, name]) => name === text);
  if (named) return { block: { kind: named[0] }, issues: [] };
  const price = /^قیمت\s*[:：]\s*(.*)$/.exec(text);
  if (!price) return { block: null, issues: [{ code: 'block_unknown', detail: text.slice(0, 40) }] };

  const issues: BlockIssue[] = [];
  const spec: SampleSpec = { pages: 0, copies: 1, color: null, sides: null, size: null, binding: null, paper: null };
  const seen = new Set<string>();
  const once = (row: string, word: string): boolean => {
    if (seen.has(row)) {
      issues.push({ code: 'block_twice', detail: word });
      return false;
    }
    seen.add(row);
    return true;
  };
  const bindings = new Map(vocabulary.bindings.map((name) => [folded(name), name]));
  const papers = new Map(vocabulary.papers.map((name) => [folded(name), name]));

  for (const part of price[1]!.split(/[،,]/)) {
    const word = part.trim();
    if (!word) continue;
    const key = folded(word);
    const pages = /^(\d{1,6})\s*صفحه(?:\s*ای|‌ای)?$/.exec(word);
    const copies = /^(\d{1,6})\s*نسخه$/.exec(word);
    if (pages) {
      if (!once('pages', word)) continue;
      const count = Number(pages[1]);
      if (count < 1 || count > maxPages) issues.push({ code: 'block_range', detail: word, max: maxPages });
      else spec.pages = count;
    } else if (copies) {
      if (!once('copies', word)) continue;
      const count = Number(copies[1]);
      if (count < 1 || count > SAMPLE_MAX_COPIES) issues.push({ code: 'block_range', detail: word, max: SAMPLE_MAX_COPIES });
      else spec.copies = count;
    } else if (COLOR_WORDS[key]) {
      if (once('color', word)) spec.color = COLOR_WORDS[key]!;
    } else if (SIDES_WORDS[key]) {
      if (once('sides', word)) spec.sides = SIDES_WORDS[key]!;
    } else if (/^a[345]$/i.test(key)) {
      if (once('size', word)) spec.size = key.toLowerCase() as PaperSize;
    } else if (bindings.has(key)) {
      if (once('binding', word)) spec.binding = bindings.get(key)!;
    } else if (papers.has(key)) {
      if (once('paper', word)) spec.paper = papers.get(key)!;
    } else {
      issues.push({ code: 'block_word', detail: word.slice(0, 40) });
    }
  }
  if (!seen.has('pages')) issues.push({ code: 'block_pages' });
  return issues.length > 0 ? { block: null, issues } : { block: { kind: 'price', spec }, issues };
}

/* ───────────────────────── قیمت نمونه ───────────────────────── */

/** چرا جزوهٔ نمونه امروز قیمت ندارد: هر کدام هشدار پنل است و روی سایت «فعلاً ارائه نمی‌شود». */
export type SampleOff =
  | { reason: 'size'; size: PaperSize }
  | { reason: 'binding'; name: string }
  | { reason: 'paper'; name: string }
  | { reason: 'misfit'; name: string; misfit: BindingMisfit };

export interface SampleQuote {
  spec: SampleSpec;
  color: ColorMode;
  sides: SidesMode;
  size: PaperSize;
  bindingName: string;
  paperName: string;
  breakdown: Breakdown;
  /** با ارسال به هر منطقهٔ پست پیشتاز، ریال؛ null یعنی کرایه‌ای برای این وزن نیست. */
  shipping: { zoneId: string; totalRials: number | null }[];
}

export type SampleResult = { ok: true; quote: SampleQuote } | { ok: false; off: SampleOff };

function byName<T extends { nameFa: string }>(table: Readonly<Record<string, T>>, name: string): [string, T] | undefined {
  const key = folded(name);
  return Object.entries(table).find(([, row]) => folded(row.nameFa) === key);
}

/** منطقه‌های کرایهٔ روش پیش‌فرض، به ترتیب تعرفه (تهران، بعد شهرهای دیگر). */
export function shippingZones(list: PriceList): string[] {
  return [...new Set(list.shippingRates.filter((rate) => rate.methodId === DEFAULT_SHIPPING_METHOD_ID).map((rate) => rate.zoneId))];
}

/**
 * قیمت جزوهٔ نمونه با تعرفهٔ امروز و همان `quote()` (قاعدهٔ ۱): پیش‌فرض‌ها همان میز (سیاه‌سفید، دورو، A4، کاغذ و صحافی پیش‌فرض، یک نسخه)؛ گزینه‌ای
 * که این تعرفه ندارد، خاموش یا موقتاً در دسترس نیست، یا صحافی‌ای که به این شمار برگ نمی‌خورد، قیمت نمی‌دهد.
 */
export function sampleQuote(spec: SampleSpec, list: PriceList, paused: PausedOptions = NONE_PAUSED): SampleResult {
  const size = spec.size ?? DEFAULT_PAPER_SIZE;
  if (list.printRates[size] === undefined || paused.sizes.has(size)) return { ok: false, off: { reason: 'size', size } };

  const paper = spec.paper ? byName(list.paperTypes, spec.paper) : ([DEFAULT_PAPER_TYPE_ID, list.paperTypes[DEFAULT_PAPER_TYPE_ID]] as const);
  if (!paper || !paper[1] || !paper[1].enabled || paused.papers.has(paper[0]) || paper[1].sheetRates[size] === undefined) {
    return { ok: false, off: { reason: 'paper', name: spec.paper ?? paper?.[1]?.nameFa ?? '' } };
  }

  const binding: readonly [string, BindingType | undefined] | undefined = spec.binding
    ? byName(list.bindingTypes, spec.binding)
    : [DEFAULT_BINDING_TYPE_ID, list.bindingTypes[DEFAULT_BINDING_TYPE_ID]];
  if (!binding || !binding[1] || !binding[1].enabled || paused.bindings.has(binding[0]) || !binding[1].bands[size]?.length) {
    return { ok: false, off: { reason: 'binding', name: spec.binding ?? binding?.[1]?.nameFa ?? '' } };
  }
  const sides = spec.sides ?? 'double';
  const misfit = bindingMisfit(binding[1], size, sheetsOf(spec.pages, sides));
  if (misfit) return { ok: false, off: { reason: 'misfit', name: binding[1].nameFa, misfit } };

  const color = spec.color ?? 'bw';
  const item = {
    sections: [{ documentId: 'sample', pageCount: spec.pages }],
    rules: wholeDocumentRule(spec.pages, color, paper[0]),
    copies: spec.copies,
    sidesMode: sides,
    paperSize: size,
    bindingTypeId: binding[0],
  };
  const breakdown = quote({ items: [item], shipping: null }, list);
  const shipping = shippingZones(list).map((zoneId) => {
    const withShipping = quote({ items: [item], shipping: { methodId: DEFAULT_SHIPPING_METHOD_ID, zoneId } }, list);
    return { zoneId, totalRials: withShipping.shippingRials === null ? null : withShipping.totalRials };
  });
  return {
    ok: true,
    quote: { spec, color, sides, size, bindingName: binding[1].nameFa, paperName: paper[1].nameFa, breakdown, shipping },
  };
}

/* ───────────────────────── جدول‌ها ───────────────────────── */

export interface PrintTable {
  size: PaperSize;
  /** «A4». */
  label: string;
  /** ریال هر رو. */
  rows: { color: ColorMode; single: number; double: number }[];
}

/** نرخ چاپ هر اندازهٔ ارائه‌شده، به ترتیب نمایش؛ اندازه‌ای که موقتاً در دسترس نیست نه. */
export function printTables(list: PriceList, paused: PausedOptions = NONE_PAUSED): PrintTable[] {
  return PAPER_SIZE_ORDER.flatMap((size): PrintTable[] => {
    const rates = list.printRates[size];
    if (!rates || paused.sizes.has(size)) return [];
    return [
      {
        size,
        label: PAPER_SIZES[size].label,
        rows: (['bw', 'color'] as const).map((color) => ({ color, single: rates.single[color], double: rates.double[color] })),
      },
    ];
  });
}

export interface PaperNote {
  name: string;
  /** ریال هر برگ هر اندازه؛ صفر یعنی بی هزینهٔ جدا. */
  rates: { size: PaperSize; label: string; rials: number }[];
}

/** کاغذهای روشن و در دسترس، با نرخ هر برگشان در اندازه‌های ارائه‌شده. */
export function paperNotes(list: PriceList, paused: PausedOptions = NONE_PAUSED): PaperNote[] {
  const sizes = printTables(list, paused).map((table) => table.size);
  return Object.entries(list.paperTypes).flatMap(([id, paper]): PaperNote[] => {
    if (!paper.enabled || paused.papers.has(id)) return [];
    const rates = sizes.flatMap((size) =>
      paper.sheetRates[size] === undefined ? [] : [{ size, label: PAPER_SIZES[size].label, rials: paper.sheetRates[size]! }],
    );
    return rates.length > 0 ? [{ name: paper.nameFa, rates }] : [];
  });
}

export interface BindingTable {
  id: string;
  name: string;
  size: PaperSize;
  label: string;
  bands: { minSheets: number; maxSheets: number; priceRials: number }[];
  maxSheetsPerVolume: number;
  splitsVolumes: boolean;
}

/** بازه‌های هر صحافی روشن و در دسترس، برای هر اندازه‌ای که دارد؛ صحافی پیش‌فرض اول، بقیه به ترتیب تعرفه. */
export function bindingTables(list: PriceList, paused: PausedOptions = NONE_PAUSED): BindingTable[] {
  const sizes = printTables(list, paused).map((table) => table.size);
  const entries = Object.entries(list.bindingTypes).sort(([a], [b]) => Number(b === DEFAULT_BINDING_TYPE_ID) - Number(a === DEFAULT_BINDING_TYPE_ID));
  return entries.flatMap(([id, binding]): BindingTable[] => {
    if (!binding.enabled || paused.bindings.has(id)) return [];
    return sizes.flatMap((size): BindingTable[] => {
      const bands = binding.bands[size];
      if (!bands?.length) return [];
      return [
        {
          id,
          name: binding.nameFa,
          size,
          label: PAPER_SIZES[size].label,
          bands: [...bands].sort((a, b) => a.minSheets - b.minSheets),
          maxSheetsPerVolume: binding.maxSheetsPerVolume,
          splitsVolumes: binding.splitsVolumes,
        },
      ];
    });
  });
}

export interface ShippingTable {
  zones: string[];
  /** بازه‌های وزن روش پیش‌فرض، به ترتیب؛ ریال هر منطقه، null یعنی آن منطقه این بازه را ندارد. */
  rows: { minGrams: number; maxGrams: number | null; rials: (number | null)[] }[];
}

export function shippingTable(list: PriceList): ShippingTable {
  const rates = list.shippingRates.filter((rate) => rate.methodId === DEFAULT_SHIPPING_METHOD_ID);
  const zones = shippingZones(list);
  const bands = [...new Map(rates.map((rate) => [`${rate.minWeightGrams}:${rate.maxWeightGrams}`, rate])).values()].sort(
    (a, b) => a.minWeightGrams - b.minWeightGrams,
  );
  return {
    zones,
    rows: bands.map((band) => ({
      minGrams: band.minWeightGrams,
      maxGrams: band.maxWeightGrams,
      rials: zones.map(
        (zoneId) =>
          rates.find((rate) => rate.zoneId === zoneId && rate.minWeightGrams === band.minWeightGrams && rate.maxWeightGrams === band.maxWeightGrams)
            ?.priceRials ?? null,
      ),
    })),
  };
}

/** پله‌های تخفیف سفارش بزرگ، به ترتیب آستانه. */
export function discountTiers(list: PriceList): DiscountTier[] {
  return [...(list.discountTiers ?? [])].sort((a, b) => a.fromRials - b.fromRials);
}

/** نام منطقهٔ کرایه در جمله و جدول؛ «تهران» یعنی استان تهران (سؤال ۹). */
export function zoneName(zoneId: string): string {
  return zoneId === 'tehran' ? 'تهران' : zoneId === 'other' ? 'شهرهای دیگر' : zoneId;
}
