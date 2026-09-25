/**
 * ساختن `src/data.ts` از دادهٔ عمومی شهرها — یک بار، نه در هر بیلد.
 *
 * از این به بعد منبع حقیقت خود `src/data.ts` است و شهر تازه همان‌جا اضافه می‌شود. این اسکریپت
 * فقط می‌گوید آن فایل از کجا و با چه اصلاح‌هایی آمد، تا هر کس بتواند دوباره بسازد و مقایسه کند.
 *
 *   mkdir x && cd x
 *   npm pack iran-cities-json@2.0.0 iran@1.0.2
 *   tar -xzf iran-cities-json-2.0.0.tgz && mv package jd
 *   tar -xzf iran-1.0.2.tgz && mv package ara
 *   node packages/geo/scripts/import-cities.mjs x
 *
 * منبع اصلی `iran-cities-json` است (MIT، ۲۰۲۰): ۳۱ استان و ۱۳۲۴ شهر، جدیدتر از بقیهٔ فهرست‌های
 * باز. چهار شهری که در آن نیست از `iran` آمده (MIT، فهرست وزارت کشور ۱۳۹۴). مجوزها در NOTICE.md.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('پوشهٔ بسته‌های بازشده را بدهید.');
  process.exit(1);
}

const ostan = JSON.parse(readFileSync(join(src, 'jd/ostan.json'), 'utf8'));
const shahr = JSON.parse(readFileSync(join(src, 'jd/shahr.json'), 'utf8'));

/** نام استان‌ها با «و» جدا، مثل نام رسمی. */
const PROVINCE_FIX = {
  'چهارمحال وبختیاری': 'چهارمحال و بختیاری',
  'سیستان وبلوچستان': 'سیستان و بلوچستان',
  'کهگیلویه وبویراحمد': 'کهگیلویه و بویراحمد',
};

/** مرکز هر استان — در جست‌وجو پیش از هم‌نام‌های کوچک‌تر می‌آید. */
const CAPITALS = {
  'آذربایجان شرقی': 'تبریز',
  'آذربایجان غربی': 'ارومیه',
  'اردبیل': 'اردبیل',
  'اصفهان': 'اصفهان',
  'البرز': 'کرج',
  'ایلام': 'ایلام',
  'بوشهر': 'بوشهر',
  'تهران': 'تهران',
  'چهارمحال و بختیاری': 'شهرکرد',
  'خراسان جنوبی': 'بیرجند',
  'خراسان رضوی': 'مشهد',
  'خراسان شمالی': 'بجنورد',
  'خوزستان': 'اهواز',
  'زنجان': 'زنجان',
  'سمنان': 'سمنان',
  'سیستان و بلوچستان': 'زاهدان',
  'فارس': 'شیراز',
  'قزوین': 'قزوین',
  'قم': 'قم',
  'کردستان': 'سنندج',
  'کرمان': 'کرمان',
  'کرمانشاه': 'کرمانشاه',
  'کهگیلویه و بویراحمد': 'یاسوج',
  'گلستان': 'گرگان',
  'گیلان': 'رشت',
  'لرستان': 'خرم‌آباد',
  'مازندران': 'ساری',
  'مرکزی': 'اراک',
  'هرمزگان': 'بندرعباس',
  'همدان': 'همدان',
  'یزد': 'یزد',
};

/**
 * اصلاح املای نام‌ها. فقط املا، نه نام: «آباد» بی مد، «و» چسبیده، و همزه‌ای که نام رسمی دارد.
 * «گناباد»، «مهاباد» و «بهاباد» درست‌اند و اینجا نیستند.
 */
const CITY_FIX = {
  'احمدابادصولت': 'احمدآباد صولت',
  'اسلام اباد': 'اسلام‌آباد',
  'حاجی اباد': 'حاجی‌آباد',
  'حسن اباد': 'حسن‌آباد',
  'حکم اباد': 'حکم‌آباد',
  'خاتون اباد': 'خاتون‌آباد',
  'شاهپوراباد': 'شاهپورآباد',
  'شهراباد': 'شهرآباد',
  'صادق اباد': 'صادق‌آباد',
  'عباس اباد': 'عباس‌آباد',
  'علی اباد': 'علی‌آباد',
  'فخراباد': 'فخرآباد',
  'فرون اباد': 'فرون‌آباد',
  'فیل اباد': 'فیل‌آباد',
  'قادراباد': 'قادرآباد',
  'مبارک آباددیز': 'مبارک‌آباد دیز',
  'آران وبیدگل': 'آران و بیدگل',
  'بویین ومیاندشت': 'بوئین و میاندشت',
  'کتالم وسادات شهر': 'کتالم و سادات‌شهر',
  'بویین زهرا': 'بوئین‌زهرا',
  'بویین سفلی': 'بوئین سفلی',
  'صایین قلعه': 'صائین‌قلعه',
  'قاین': 'قائن',
  'نایین': 'نائین',
  'کوراییم': 'کورائیم',
  'صفاییه': 'صفائیه',
  'قایم شهر': 'قائم‌شهر',
  'خداجو(خراجو)': 'خداجو (خراجو)',
  'کارزین (فتح آباد)': 'کارزین (فتح‌آباد)',
  'رباطکریم': 'رباط‌کریم',
  'ضیاآباد': 'ضیاءآباد',
};

/** ردیف‌هایی که شهر نیستند (منطقه‌های تبریز) یا تکراری‌اند (گلوگاه دوم در مازندران). */
const DROP_IDS = new Set(
  shahr.filter((c) => /^تبریز\d-$/.test(c.name)).map((c) => c.id).concat([1217]),
);

/**
 * شهرهایی که در فهرست اصلی نیستند و در فهرست وزارت کشور (بستهٔ `iran`) هستند. شناسه از ۲۰۰۱،
 * بیرون از بازهٔ منبع اصلی.
 */
const ADDITIONS = [
  { id: 2001, province: 'اصفهان', name: 'سگزی' },
  { id: 2002, province: 'هرمزگان', name: 'کوخرد' },
  { id: 2003, province: 'آذربایجان غربی', name: 'گردکشانه' },
  { id: 2004, province: 'اردبیل', name: 'تازه‌کند' },
];

/** هشت شهر پرتکرار، به ترتیب دکمه‌های طرح (docs/UI.md، بخش ۶). */
const POPULAR = [
  ['تهران', 'تهران'],
  ['مشهد', 'خراسان رضوی'],
  ['اصفهان', 'اصفهان'],
  ['کرج', 'البرز'],
  ['شیراز', 'فارس'],
  ['تبریز', 'آذربایجان شرقی'],
  ['قم', 'قم'],
  ['اهواز', 'خوزستان'],
];

/** حرف‌هایی که به بعدی نمی‌چسبند؛ پس از آنها «آباد» بی نیم‌فاصله می‌آید. */
const NON_JOINING = new Set(['ا', 'آ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'و']);
const ZWNJ = '‌';

/** «حسن آباد» ← «حسن‌آباد»، «نسیم شهر» ← «نسیم‌شهر»: یک واژه‌اند، فاصله اشتباه چاپی است. */
function tidySpacing(name) {
  let out = name.replace(/(\S) آباد/g, (_, ch) => `${ch}${NON_JOINING.has(ch) ? '' : ZWNJ}آباد`);
  const twoWords = /^(\S+) شهر$/.exec(out);
  if (twoWords) {
    const first = twoWords[1];
    out = `${first}${NON_JOINING.has(first.at(-1)) ? '' : ZWNJ}شهر`;
  }
  return out;
}

const provinces = ostan.map((p) => {
  const name = PROVINCE_FIX[p.name] ?? p.name;
  return { id: p.id, name, zone: name === 'تهران' ? 'tehran' : 'other' };
});
const provinceByName = new Map(provinces.map((p) => [p.name, p]));

const cities = shahr
  .filter((c) => !DROP_IDS.has(c.id))
  .map((c) => ({ id: c.id, provinceId: c.ostan, name: CITY_FIX[c.name] ?? tidySpacing(c.name) }))
  .concat(ADDITIONS.map((a) => ({ id: a.id, provinceId: provinceByName.get(a.province).id, name: a.name })));

const collator = new Intl.Collator('fa');
cities.sort((a, b) => a.provinceId - b.provinceId || collator.compare(a.name, b.name) || a.id - b.id);

const cityId = (name, province) => {
  const provinceId = provinceByName.get(province).id;
  const hit = cities.find((c) => c.name === name && c.provinceId === provinceId);
  if (!hit) throw new Error(`پیدا نشد: ${name} در ${province}`);
  return hit.id;
};

for (const p of provinces) p.capital = cityId(CAPITALS[p.name], p.name);
const popular = POPULAR.map(([name, province]) => cityId(name, province));

const lines = [
  '/**',
  ' * استان‌ها و شهرهای ایران — داده، نه کد. منبع حقیقت همین فایل است؛ شهر تازه همین‌جا اضافه',
  ' * می‌شود، با شناسهٔ تازه، و شناسهٔ هیچ شهری عوض یا دوباره استفاده نمی‌شود: سفارش به آن اشاره می‌کند.',
  ' *',
  ' * ساخته‌شده با `scripts/import-cities.mjs` از `iran-cities-json` ۲.۰.۰ (MIT، ۲۰۲۰) و چهار شهر از',
  ' * `iran` ۱.۰.۲ (MIT، فهرست وزارت کشور)؛ مجوزها در NOTICE.md. شهرهایی که بعد از ۱۳۹۹ شهر شده‌اند',
  ' * ممکن است نباشند؛ کاربرشان استان را انتخاب می‌کند و نام شهر را در نشانی می‌نویسد.',
  ' *',
  ' * منطقهٔ کرایه مال استان است (سؤال ۹، ۱۴۰۵/۰۷/۰۴): همهٔ شهرهای استان تهران `tehran`، بقیه `other`.',
  ' */',
  '',
  "export type ShippingZoneId = 'tehran' | 'other';",
  '',
  '/** [شناسه، نام، منطقهٔ کرایه، شناسهٔ شهر مرکز] */',
  'export const PROVINCE_ROWS: readonly (readonly [number, string, ShippingZoneId, number])[] = [',
  ...provinces.map((p) => `  [${p.id}, '${p.name}', '${p.zone}', ${p.capital}],`),
  '];',
  '',
  '/** [شناسه، شناسهٔ استان، نام] — به ترتیب استان و نام */',
  'export const CITY_ROWS: readonly (readonly [number, number, string])[] = [',
  ...cities.map((c) => `  [${c.id}, ${c.provinceId}, '${c.name}'],`),
  '];',
  '',
  '/** هشت شهر پرتکرار، به ترتیب دکمه‌ها (docs/UI.md، بخش ۶). */',
  `export const POPULAR_CITY_IDS: readonly number[] = [${popular.join(', ')}];`,
  '',
];

const out = join(dirname(fileURLToPath(import.meta.url)), '../src/data.ts');
writeFileSync(out, lines.join('\n'));
console.log(`✓ ${provinces.length} استان و ${cities.length} شهر در ${out}`);
