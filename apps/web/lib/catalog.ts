/**
 * کاتالوگ چاپ در میز سفارش (برش ۸٫۳، سؤال‌های ۱۸۳ تا ۱۸۶ و ۲۲۰): کدام اندازه، کاغذ و صحافی برای این جزوه هست، و انتخابی که
 * دیگر نمی‌خورد جایش را به پیش‌فرض همان ردیف می‌دهد (سؤال ۲۲۴)؛ خالص، بی React.
 *
 * انتخاب خود جزوه (`OrderConfig` در چیدمان و پیش‌نویس) دست نمی‌خورد: «منگنه» جزوه‌ای که با فایل تازه ۵۷ برگ شد، تا وقتی ۵۷ برگ
 * است «طلق و سیم» قیمت می‌خورد، و با برداشتن همان فایل دوباره منگنه است. قیمت، دروازهٔ مسیر خرید و هر برچسبی همان تنظیمی را
 * می‌گیرد که این‌جا ساخته می‌شود (`effectiveConfig`)، پس سرور هرگز صحافی‌ای را نمی‌بیند که به جزوه نمی‌خورد.
 *
 * فقط تکهٔ رابط پس از فایل و تکه‌های بعدش می‌خوانندش: موتور قیمت در باندل اولیه نیست.
 */

import type { BindingType, PaperSize, PaperType, PriceList } from '@jozveyar/contracts';
import { bindingMisfit, DEFAULT_PAPER_SIZE, NONE_PAUSED, sheetsOf, type BindingMisfit, type PausedOptions } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID } from '@jozveyar/pricing/seed';

import type { OrderConfig } from './orderConfig';

/** ردیف خود جدول، نه نام‌های ارث‌رسیده («constructor» پیش‌نویس دستکاری‌شده). */
function own<T>(table: Readonly<Record<string, T>>, id: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
}

/** کاغذ این اندازه را دارد: روشن، و با نرخ همین اندازه. */
export function paperOffered(paper: PaperType | undefined, size: PaperSize): paper is PaperType {
  return paper !== undefined && paper.enabled && paper.sheetRates[size] !== undefined;
}

/** صحافی این اندازه را دارد: روشن، و با بازهٔ همین اندازه؛ اینکه به این جزوه می‌خورد یا نه `bindingMisfit` است. */
export function bindingOffered(binding: BindingType | undefined, size: PaperSize): binding is BindingType {
  return binding !== undefined && binding.enabled && (binding.bands[size]?.length ?? 0) > 0;
}

/** کمترین قیمت یک جلد این صحافی در این اندازه. */
export function bindingEntryRials(binding: BindingType, size: PaperSize): number {
  return Math.min(...(binding.bands[size] ?? []).map((band) => band.priceRials));
}

/**
 * کاغذهای این اندازه، ارزان‌تر اول (طرح میز، قدم ۱۱: «تحریر»، بعد «گلاسه»)، هم‌نرخ به ترتیب تعرفه؛ پس کاشی‌ها با کاغذی که
 * مالک بعداً می‌افزاید جای منطقی‌شان را دارند، و با صفحهٔ جزوه جابه‌جا نمی‌شوند.
 */
export function papersFor(list: PriceList, size: PaperSize): [string, PaperType][] {
  return Object.entries(list.paperTypes)
    .filter(([, paper]) => paperOffered(paper, size))
    .sort(([, a], [, b]) => a.sheetRates[size]! - b.sheetRates[size]!);
}

/**
 * صحافی‌های این اندازه، ارزان‌ترین جلد اول (طرح میز: «بی صحافی»، «منگنه»، «طلق و سیم»، «چسب گرم»)، هم‌قیمت به ترتیب تعرفه؛
 * آنها که به جزوه نمی‌خورند هم (کاشی خاموش با دلیل).
 */
export function bindingsFor(list: PriceList, size: PaperSize): [string, BindingType][] {
  return Object.entries(list.bindingTypes)
    .filter(([, binding]) => bindingOffered(binding, size))
    .sort(([, a], [, b]) => bindingEntryRials(a, size) - bindingEntryRials(b, size));
}

/**
 * انتخابی که جایش را به پیش‌فرض همان ردیف داد، و چرا. `paused`: گزینه هست ولی همین حالا موقتاً در دسترس نیست (برش ۸٫۴، سؤال
 * ۱۸۸)؛ با روشن شدن دوباره، انتخاب خود جزوه برمی‌گردد.
 */
export type Replacement =
  | { field: 'paperSize'; from: PaperSize; to: PaperSize; paused?: true }
  | { field: 'paperTypeId'; from: string; to: string; paused?: true }
  /** `misfit` null یعنی این صحافی دیگر نیست، خاموش است یا موقتاً در دسترس نیست؛ وگرنه به این جزوه نمی‌خورد. */
  | { field: 'bindingTypeId'; from: string; to: string; misfit: BindingMisfit | null; paused?: true };

/**
 * تنظیمی که این جزوه با آن قیمت می‌خورد: اندازه‌ای که تعرفه ندارد A4، کاغذی که این اندازه را ندارد کاغذ پیش‌فرض، و صحافی‌ای
 * که نیست یا به این جزوه نمی‌خورد (`bindingMisfit`) صحافی پیش‌فرض؛ گزینه‌ای که موقتاً در دسترس نیست (`paused`، برش ۸٫۴) هم
 * همین‌طور؛ هر کدام با دلیلش در `replaced`. پنل پیش‌فرض‌ها را خاموش
 * نمی‌کند و هر اندازهٔ ارائه‌شده را برایشان می‌خواهد، پس جای هر انتخاب همیشه هست. جزوه‌ای که هنوز صفحه‌ای ندارد صحافی‌اش
 * سنجیده نمی‌شود: قیمتی هم ندارد.
 */
export function effectiveConfig(
  config: OrderConfig,
  list: PriceList,
  pageCount: number,
  paused: PausedOptions = NONE_PAUSED,
): { config: OrderConfig; replaced: Replacement[] } {
  const replaced: Replacement[] = [];

  let paperSize = config.paperSize;
  if (list.printRates[paperSize] === undefined) {
    replaced.push({ field: 'paperSize', from: paperSize, to: DEFAULT_PAPER_SIZE });
    paperSize = DEFAULT_PAPER_SIZE;
  } else if (paused.sizes.has(paperSize)) {
    replaced.push({ field: 'paperSize', from: paperSize, to: DEFAULT_PAPER_SIZE, paused: true });
    paperSize = DEFAULT_PAPER_SIZE;
  }

  let paperTypeId = config.paperTypeId;
  if (!paperOffered(own(list.paperTypes, paperTypeId), paperSize)) {
    replaced.push({ field: 'paperTypeId', from: paperTypeId, to: DEFAULT_PAPER_TYPE_ID });
    paperTypeId = DEFAULT_PAPER_TYPE_ID;
  } else if (paused.papers.has(paperTypeId)) {
    replaced.push({ field: 'paperTypeId', from: paperTypeId, to: DEFAULT_PAPER_TYPE_ID, paused: true });
    paperTypeId = DEFAULT_PAPER_TYPE_ID;
  }

  let bindingTypeId = config.bindingTypeId;
  const binding = own(list.bindingTypes, bindingTypeId);
  if (!binding?.enabled) {
    replaced.push({ field: 'bindingTypeId', from: bindingTypeId, to: DEFAULT_BINDING_TYPE_ID, misfit: null });
    bindingTypeId = DEFAULT_BINDING_TYPE_ID;
  } else if (paused.bindings.has(bindingTypeId)) {
    replaced.push({ field: 'bindingTypeId', from: bindingTypeId, to: DEFAULT_BINDING_TYPE_ID, misfit: null, paused: true });
    bindingTypeId = DEFAULT_BINDING_TYPE_ID;
  } else {
    const misfit: BindingMisfit | null = !bindingOffered(binding, paperSize)
      ? { reason: 'size' }
      : pageCount > 0
        ? bindingMisfit(binding, paperSize, sheetsOf(pageCount, config.sidesMode))
        : null;
    if (misfit) {
      replaced.push({ field: 'bindingTypeId', from: bindingTypeId, to: DEFAULT_BINDING_TYPE_ID, misfit });
      bindingTypeId = DEFAULT_BINDING_TYPE_ID;
    }
  }

  if (replaced.length === 0) return { config, replaced };
  return { config: { ...config, paperSize, paperTypeId, bindingTypeId }, replaced };
}
