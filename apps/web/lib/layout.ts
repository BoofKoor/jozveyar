/**
 * چیدمان جزوه‌های سفارش — خالص، بی React (برش ۸٫۲، سؤال ۱۸۲؛ طرح میز، سؤال‌های ۲۱۵ تا ۲۱۹).
 *
 * صف (`jozveController.ts`) همهٔ فایل‌های سفارش را یک‌جا نگه می‌دارد: نوبت کارگر تحلیل و نوبت آپلود روی کل سفارش است،
 * هر لحظه یکی، و فایل نمی‌داند در کدام جزوه است. اینجا فقط همین: هر فایل در کدام جزوه، به چه ترتیبی، با کدام تنظیمات
 * چاپ؛ و پرسش «همه یک جزوه یا هر فایل جدا». با رابط پس از فایل می‌آید، نه در باندل اولیه.
 *
 * هر کار یک چیدمان تازه برمی‌گرداند و چیدمان قبلی دست نمی‌خورد. کلید فایل همان کلید صف است (`Section.key`)؛ صف کلید
 * را با «جایگزین کن» هم نگه می‌دارد، پس فایل جایگزین سر جای خودش در همان جزوه می‌ماند.
 */

import type { OrderConfig } from './orderConfig';

export interface JozveSlot {
  /** کلید محلی و پایدار جزوه؛ شمارهٔ «جزوهٔ N» از ترتیب می‌آید، نه از کلید. */
  key: string;
  /** کلید فایل‌ها در صف، به ترتیب صحافی؛ دست‌کم یکی. */
  sections: readonly string[];
  /** null: پیش‌فرض‌های تعرفه (`INITIAL_CONFIG`). */
  config: OrderConfig | null;
}

export interface DeskLayout {
  jozves: readonly JozveSlot[];
  /**
   * پرسش چیدمان بالای میز (۲۱۵، ۲۱۶): فقط پس از انداختن چند فایل با هم، تا وقتی چیدمان دقیقاً یکی از دو حالتش است
   * (`arrangement`). با اولین چیدمان دلخواه می‌رود و برنمی‌گردد.
   */
  asking: boolean;
  /** شمارندهٔ کلید جزوهٔ تازه. */
  next: number;
}

/** دو حالت پرسش: همه یک جزوه، یا هر فایل جزوهٔ جدا. */
export type Arrangement = 'together' | 'apart';

/** جزوهٔ تازه با کلید تازه. */
function slot(layout: DeskLayout, sections: readonly string[], config: OrderConfig | null): [JozveSlot, number] {
  return [{ key: `j${layout.next}`, sections, config }, layout.next + 1];
}

/** همهٔ فایل‌ها به ترتیب نمایش: جزوه به جزوه. */
export function layoutKeys(layout: DeskLayout): string[] {
  return layout.jozves.flatMap((jozve) => jozve.sections);
}

/**
 * پرسش هنوز معنا دارد؟ دست‌کم دو فایل، و چیدمان یا یک جزوه است یا هر فایل یک جزوه. پرسشی که رفت برنمی‌گردد، حتی اگر
 * چیدمان بعداً دوباره به یکی از آن دو شکل برسد.
 */
function settle(layout: DeskLayout): DeskLayout {
  return layout.asking && arrangement(layout) === null ? { ...layout, asking: false } : layout;
}

/** چیدمان امروز یکی از دو حالت پرسش است؟ null یعنی نه، یا کمتر از دو فایل. */
export function arrangement(layout: DeskLayout): Arrangement | null {
  if (layoutKeys(layout).length < 2) return null;
  if (layout.jozves.length === 1) return 'together';
  return layout.jozves.every((jozve) => jozve.sections.length === 1) ? 'apart' : null;
}

/**
 * چیدمان اولین فایل‌ها: همه در یک جزوه (پیش‌فرض ۲۱۵)، با تنظیمی که پوسته نگه داشته؛ پرسش فقط وقتی چند فایل با هم
 * انداخته شده‌اند.
 */
export function startLayout(keys: readonly string[], config: OrderConfig | null): DeskLayout {
  return { jozves: keys.length > 0 ? [{ key: 'j1', sections: [...keys], config }] : [], asking: keys.length > 1, next: 2 };
}

/**
 * چیدمان جزوهٔ برگشته بعد از رفرش (ADR-036): کلیدهای صف به ترتیب، و شمار فایل هر جزوه. null یعنی نمی‌خواند (کاربر در همین
 * فاصله فایل دیگری انداخت)، پس رابط از اول می‌چیند.
 */
export function restoredLayout(
  keys: readonly string[],
  jozves: readonly { files: number; config: OrderConfig | null }[],
  asking: boolean,
): DeskLayout | null {
  if (jozves.length === 0 || jozves.some((j) => !Number.isSafeInteger(j.files) || j.files < 1)) return null;
  if (jozves.reduce((sum, j) => sum + j.files, 0) !== keys.length) return null;
  let at = 0;
  const slots = jozves.map((jozve, i) => {
    const sections = keys.slice(at, at + jozve.files);
    at += jozve.files;
    return { key: `j${i + 1}`, sections, config: jozve.config };
  });
  return settle({ jozves: slots, asking, next: slots.length + 1 });
}

/**
 * چیدمان با فایل‌های امروز صف: فایلی که دیگر نیست از جزوه‌اش می‌رود و جزوهٔ خالی هم؛ فایلی که چیدمان نمی‌شناسد ته
 * جزوهٔ آخر می‌نشیند (کار رابط پیش از رسیدن جایش، `place`). همان چیدمان اگر چیزی عوض نشد، تا نمایش دوباره حساب نشود.
 */
export function reconcile(layout: DeskLayout, keys: readonly string[]): DeskLayout {
  const live = new Set(keys);
  const known = new Set(layoutKeys(layout));
  const stray = keys.filter((key) => !known.has(key));
  const gone = [...known].some((key) => !live.has(key));
  if (stray.length === 0 && !gone) return layout;
  const jozves = layout.jozves
    .map((jozve) => ({ ...jozve, sections: jozve.sections.filter((key) => live.has(key)) }))
    .filter((jozve) => jozve.sections.length > 0);
  if (stray.length === 0) return settle({ ...layout, jozves });
  if (jozves.length === 0) {
    const [fresh, next] = slot(layout, stray, null);
    return settle({ ...layout, jozves: [fresh], next });
  }
  const last = jozves[jozves.length - 1]!;
  return settle({ ...layout, jozves: [...jozves.slice(0, -1), { ...last, sections: [...last.sections, ...stray] }] });
}

/**
 * فایل‌های تازهٔ صف سر جایشان: ته همان جزوه («افزودن فایل به همین جزوه»)، یا یک جزوهٔ تازه با همهٔ آنها («جزوهٔ تازه»،
 * بی پرسش دوباره، ۲۱۶) و پیش‌فرض‌های تعرفه. فایلی که `reconcile` موقتاً جای دیگری نشانده بود، از آنجا برمی‌خیزد.
 */
export function place(layout: DeskLayout, keys: readonly string[], target: string | 'new'): DeskLayout {
  if (keys.length === 0) return layout;
  const moving = new Set(keys);
  const jozves = layout.jozves
    .map((jozve) => ({ ...jozve, sections: jozve.sections.filter((key) => !moving.has(key)) }))
    .filter((jozve) => jozve.sections.length > 0 || jozve.key === target);
  if (target === 'new' || !jozves.some((jozve) => jozve.key === target)) {
    const [fresh, next] = slot(layout, [...keys], null);
    return settle({ ...layout, jozves: [...jozves, fresh], next });
  }
  return settle({
    ...layout,
    jozves: jozves.map((jozve) => (jozve.key === target ? { ...jozve, sections: [...jozve.sections, ...keys] } : jozve)),
  });
}

/** یکی بالاتر یا پایین‌تر، درون همان جزوه؛ لبهٔ جزوه بی‌اثر است. فقط ترتیب صحافی عوض می‌شود؛ قیمت همان است. */
export function moveWithin(layout: DeskLayout, key: string, delta: -1 | 1): DeskLayout {
  return {
    ...layout,
    jozves: layout.jozves.map((jozve) => {
      const from = jozve.sections.indexOf(key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= jozve.sections.length) return jozve;
      const sections = [...jozve.sections];
      [sections[from], sections[to]] = [sections[to]!, sections[from]!];
      return { ...jozve, sections };
    }),
  };
}

/**
 * بردن یک فایل به جزوهٔ دیگر (ته همان)، یا به جزوهٔ تازه با تنظیمات جزوه‌ای که از آن آمد، ته فهرست (منوی ردیف، ۲۱۸).
 * جزوه‌ای که خالی شد می‌رود. چیدمان دلخواه است، پس پرسش هم می‌رود (۲۱۶).
 */
export function moveTo(layout: DeskLayout, key: string, target: string | 'new'): DeskLayout {
  const source = layout.jozves.find((jozve) => jozve.sections.includes(key));
  if (!source || source.key === target) return layout;
  const rest = layout.jozves
    .map((jozve) => (jozve === source ? { ...jozve, sections: jozve.sections.filter((k) => k !== key) } : jozve))
    .filter((jozve) => jozve.sections.length > 0);
  if (target === 'new') {
    const [fresh, next] = slot(layout, [key], source.config);
    return { ...layout, jozves: [...rest, fresh], next, asking: false };
  }
  if (!rest.some((jozve) => jozve.key === target)) return layout;
  return {
    ...layout,
    jozves: rest.map((jozve) => (jozve.key === target ? { ...jozve, sections: [...jozve.sections, key] } : jozve)),
    asking: false,
  };
}

/**
 * پاسخ پرسش (۲۱۶): «همه یک جزوه» همهٔ فایل‌ها را به همان ترتیب در جزوهٔ ۱ می‌گذارد، با تنظیمات جزوهٔ ۱؛ «هر فایل جدا»
 * هر فایل را جزوهٔ خودش می‌کند، هر کدام با تنظیمات همان جزوهٔ ۱. فقط تا وقتی پرسش هست.
 */
export function arrange(layout: DeskLayout, to: Arrangement): DeskLayout {
  const first = layout.jozves[0];
  if (!layout.asking || !first || arrangement(layout) === to) return layout;
  const keys = layoutKeys(layout);
  if (to === 'together') return { ...layout, jozves: [{ ...first, sections: keys }] };
  let next = layout.next;
  const jozves = keys.map((key, i) => (i === 0 ? { ...first, sections: [key] } : { key: `j${next++}`, sections: [key], config: first.config }));
  return { ...layout, jozves, next };
}

/** تنظیمات چاپ یک جزوه. */
export function configure(layout: DeskLayout, key: string, config: OrderConfig): DeskLayout {
  return { ...layout, jozves: layout.jozves.map((jozve) => (jozve.key === key ? { ...jozve, config } : jozve)) };
}
