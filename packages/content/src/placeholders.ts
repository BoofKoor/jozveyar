/**
 * جای‌نگهدارها (برش ۱۱٫۱، سؤال ۲۸۵): عددهایی که در متن منتشرشده خودشان به‌روز می‌مانند، تا متن هرگز با «تنظیمات» و تعرفهٔ فعال نجنگد.
 * فقط آنچه همیشه هست: نرخ A4 و صحافی پیش‌فرض خاموش‌شدنی نیستند، ولی A5 و A3 هستند و متن منتشرشده عددی بی‌صاحب می‌گرفت.
 *
 * مقدار هر جای‌نگهدار متن است («1,600»، «PDF، Word، پاورپوینت یا عکس»)، نه عدد: واحد («تومان»، «روز») در خود متن مالک است.
 */

/** نام‌ها، به ترتیب جدول «جای‌نگهدارها»ی ویرایشگر. */
export const PLACEHOLDERS = [
  'روز_کاری',
  'روزهای_فایل',
  'روزهای_فایل_سفارش',
  'فرمت‌ها',
  'نرخ_سیاه_سفید',
  'نرخ_سیاه_سفید_یکرو',
  'نرخ_رنگی',
  'نرخ_رنگی_یکرو',
  'صحافی_از',
  'کرایه_از',
] as const;

export type PlaceholderName = (typeof PLACEHOLDERS)[number];

export type PlaceholderValues = Readonly<Record<PlaceholderName, string>>;

export const isPlaceholder = (name: string): name is PlaceholderName => (PLACEHOLDERS as readonly string[]).includes(name);

/**
 * منبع هر جای‌نگهدار، برای ستون «از کجا»ی ویرایشگر و برای «به‌روز شده در» قوانین و حریم خصوصی: تنظیمی که عوضش متن را عوض می‌کند. نرخ‌ها،
 * صحافی و کرایه از تعرفهٔ فعال‌اند (`setting` ندارند).
 */
export const PLACEHOLDER_SOURCES: Readonly<Record<PlaceholderName, { source: string; setting: string | null }>> = {
  روز_کاری: { source: 'روز کاری تحویل به پست، «تنظیمات»', setting: 'order.sla_days' },
  روزهای_فایل: { source: 'ماندن فایل آپلود، «تنظیمات»', setting: 'file.retention_days' },
  روزهای_فایل_سفارش: { source: 'ماندن فایل‌های سفارش، «تنظیمات»', setting: 'order.files_retention_days' },
  'فرمت‌ها': { source: '«فایل‌ها»ی «تنظیمات»', setting: 'file.formats' },
  نرخ_سیاه_سفید: { source: 'هر روی A4 سیاه‌سفید دورو، تعرفهٔ فعال', setting: null },
  نرخ_سیاه_سفید_یکرو: { source: 'همان، یکرو', setting: null },
  نرخ_رنگی: { source: 'هر روی A4 رنگی دورو', setting: null },
  نرخ_رنگی_یکرو: { source: 'همان، یکرو', setting: null },
  صحافی_از: { source: 'کمترین قیمت صحافی پیش‌فرض (طلق و سیم)', setting: null },
  کرایه_از: { source: 'کمترین کرایهٔ پست', setting: null },
};

/** شکل یکدست برای مقایسه: فاصله، نیم‌فاصله، خط تیره و زیرخط همه یک «_». */
const folded = (name: string) => name.replace(/[\s\u200c_-]+/g, '_').replace(/^_|_$/g, '');

function distance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[y.length]!;
}

/**
 * جای‌نگهداری که منظور نوشته‌ای ناشناس بوده: همان نام با فاصله یا نیم‌فاصلهٔ دیگر؛ وگرنه نزدیک‌ترین نامی که واژه‌ای از آن را دارد
 * («{روزهای_نگهداری}» ← «{روزهای_فایل}»)؛ وگرنه نامی با دست‌بالا سه نویسه فرق. null یعنی حدسی نیست.
 */
export function suggestPlaceholder(written: string): PlaceholderName | null {
  const name = folded(written);
  if (!name) return null;
  const exact = PLACEHOLDERS.find((candidate) => folded(candidate) === name);
  if (exact) return exact;
  const words = new Set(name.split('_'));
  const ranked = PLACEHOLDERS.map((candidate) => ({
    candidate,
    shared: folded(candidate)
      .split('_')
      .filter((word) => words.has(word)).length,
    distance: distance(folded(candidate), name),
  }));
  const sharing = ranked.filter((row) => row.shared > 0).sort((a, b) => b.shared - a.shared || a.distance - b.distance);
  if (sharing[0]) return sharing[0].candidate;
  const near = ranked.filter((row) => row.distance <= 3).sort((a, b) => a.distance - b.distance);
  return near[0]?.candidate ?? null;
}
