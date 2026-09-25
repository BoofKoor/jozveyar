/**
 * نگهبان رنگ: هر کد رنگی در apps/ و packages/ باید در فایل برند باشد (docs/brand/jozveyar-colors.css).
 *
 * قاعدهٔ «رنگ فقط از برند» تا امروز فقط در سند بود. Tailwind رنگ بیرون از برند را دیگر
 * نمی‌سازد (theme.css)، ولی کد رنگ نوشته‌شده در CSS، در `style` یا در یک رشتهٔ TS از آن
 * دیوار رد می‌شود. این تست همان را می‌گیرد: هگز، `rgb()`، `%23` درون data URI، و در CSS
 * رنگ نام‌دار. رنگ با شفافیت (`rgba(29,31,30,.06)` سایهٔ کیت) با رنگ پایه‌اش سنجیده می‌شود.
 *
 * `#FFFFFF` در analyze.worker.ts پر کردن بوم تحلیل است، نه رنگ رابط؛ همان کاغذ برند است و
 * بی استثنا رد می‌شود.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
/** این دو فایل عمداً رنگ غلط دارند: شاهدهای خود نگهبان و تست هم‌خوانی. */
const WITNESSES = new Set(['packages/ui/src/palette.test.ts', 'packages/ui/src/tokens.test.ts']);
const ROOTS = ['apps', 'packages'];
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage', 'fixtures', 'test-results', 'playwright-report']);
const TEXT = /\.(?:css|tsx?|mts|cts|jsx?|mjs|cjs|svg|html)$/;

/** پالت برش ۱ که مرحلهٔ طراحی رابط جایش را گرفت؛ `#FFFFFF` آن (کارت) همان کاغذ برند است. */
const OLD_PALETTE = ['#6E7A5E', '#A8BC95', '#D9E6C9', '#D0E5B8', '#E4EEDC', '#F4F4F1', '#E6E6E1', '#16181A', '#6B6F70'];

/** رنگ‌های نام‌دار CSS؛ transparent و currentColor رنگ نیستند. */
const NAMED = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen ' +
    'mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace ' +
    'olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred ' +
    'papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue ' +
    'saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey ' +
    'snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow ' +
    'yellowgreen'
  ).split(' '),
);

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** کد هگز کامل و بزرگ؛ شفافیت کنار می‌رود، چون رنگ پایه باید از برند باشد. */
function normalizeHex(digits: string): string {
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
  return `#${full.slice(0, 6)}`.toUpperCase();
}

/**
 * رنگ‌های یک متن، هر کدام به شکل `#RRGGBB`؛ رنگی که به هگز برنمی‌گردد (`hsl()`، نام‌دار) همان‌طور
 * که هست. entity (`&#1576;`) و لنگر (`href="#add"`، `url(#mark)`) رنگ نیستند.
 */
function colorsIn(text: string, isCss: boolean): string[] {
  const found: string[] = [];
  const code = isCss ? text.replace(/\/\*[\s\S]*?\*\//g, '') : text;
  const hexCode = /(?<![&\w])(?<!href=["'])(?<!url\()#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
  for (const [, digits] of code.matchAll(hexCode)) {
    found.push(normalizeHex(digits!));
  }
  for (const [, digits] of code.matchAll(/%23([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F])/g)) {
    found.push(normalizeHex(digits!));
  }
  for (const [call, fn, args] of code.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(([^)]*)\)/gi)) {
    const channels = args!.split(/[\s,/]+/).filter(Boolean);
    const rgb = channels.slice(0, 3).map(Number);
    found.push(fn!.toLowerCase().startsWith('rgb') && rgb.every((n) => Number.isFinite(n)) ? hex(rgb[0]!, rgb[1]!, rgb[2]!) : call!);
  }
  if (isCss) {
    for (const [, value] of code.matchAll(/(?:^|[;{\s])(?:--)?[\w-]+\s*:\s*([^;{}]+)/g)) {
      const words = value!.replace(/(?:var|url)\([^)]*\)/g, ' ').match(/(?<![\w-])[a-z]+(?![\w-])/gi) ?? [];
      for (const word of words) if (NAMED.has(word.toLowerCase())) found.push(word.toLowerCase());
    }
  }
  return found;
}

function brandColors(): Set<string> {
  const css = readFileSync(join(REPO, 'docs/brand/jozveyar-colors.css'), 'utf8');
  return new Set([...css.matchAll(/--jy-[\w-]+\s*:\s*(#[0-9a-fA-F]{3,8})/g)].map(([, c]) => normalizeHex(c!.slice(1))));
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(path);
      } else if (TEXT.test(entry.name)) {
        out.push(relative(REPO, path));
      }
    }
  };
  for (const root of ROOTS) walk(join(REPO, root));
  return out.filter((file) => !WITNESSES.has(file)).sort();
}

describe('نگهبان رنگ', () => {
  const files = sourceFiles();
  const colorsOf = (file: string) => colorsIn(readFileSync(join(REPO, file), 'utf8'), file.endsWith('.css'));

  it('کد را واقعاً می‌گردد: توکن‌ها و کارگر تحلیل در فهرست‌اند', () => {
    expect(files).toContain('packages/ui/src/theme.css');
    expect(files).toContain('apps/web/lib/analyze.worker.ts');
    expect(files).toContain('apps/web/app/layout.tsx');
    expect(colorsOf('packages/ui/src/theme.css').length).toBeGreaterThan(60);
  });

  it('هر رنگ در apps/ و packages/ در فایل برند هست', () => {
    const brand = brandColors();
    const offenders = files.flatMap((file) =>
      colorsOf(file)
        .filter((color) => !brand.has(color))
        .map((color) => `${file}: ${color}`),
    );
    expect(offenders).toEqual([]);
  });

  it('هیچ رنگی از پالت قدیم نمانده', () => {
    const old = new Set(OLD_PALETTE);
    const offenders = files.flatMap((file) =>
      colorsOf(file)
        .filter((color) => old.has(color))
        .map((color) => `${file}: ${color}`),
    );
    expect(offenders).toEqual([]);
  });

  it('شاهد: رنگ قدیم، rgb و %23 و رنگ نام‌دار بیرون از برند گرفته می‌شوند', () => {
    const brand = brandColors();
    const outside = (text: string, css = true) => colorsIn(text, css).filter((c) => !brand.has(c));
    expect(outside('.a { background: #d0e5b8; }')).toEqual(['#D0E5B8']);
    expect(outside("themeColor: '#F4F4F1',", false)).toEqual(['#F4F4F1']);
    expect(outside('.a { box-shadow: 0 1px 2px rgba(0, 0, 255, .1); }')).toEqual(['#0000FF']);
    expect(outside('.a { color: hsl(0 0% 50%); }')).toEqual(['hsl(0 0% 50%)']);
    expect(outside(`.a { --i: url("data:image/svg+xml,%3Cpath stroke='%23f00'/%3E"); }`)).toEqual(['#FF0000']);
    expect(outside('.a { color: white; border-color: Red }')).toEqual(['white', 'red']);
  });

  it('شاهد: رنگ برند، شفافیت روی رنگ برند، entity و لنگر رد نمی‌شوند', () => {
    const brand = brandColors();
    const outside = (text: string, css = true) => colorsIn(text, css).filter((c) => !brand.has(c));
    expect(outside('.a { color: #505d42; background: #FFF; box-shadow: 0 1px 2px rgba(29,31,30,.06); }')).toEqual([]);
    expect(outside("decodeXml('&quot;a&amp;b&quot; &#1576; &#x67E;')", false)).toEqual([]);
    expect(outside('<a href="#faq">سؤال‌ها</a> <a href="#add">', false)).toEqual([]);
    expect(outside('.a { background: var(--color-green-50); border: 1px solid transparent; color: currentColor; }')).toEqual([]);
  });
});

/*
 * قاعدهٔ رنگ (docs/UI.md، تصمیم ۱۴۰۵/۰۷/۰۳): سبزآبی، بنفش و رز در رابط فقط جایی می‌آیند که قاعدهٔ
 * رابط رنگ جدا می‌خواهد، نه برای تنوع؛ امروز فقط نوار پیشرفت. پس نامشان (کلاس Tailwind، متغیر CSS)
 * و کدشان فقط در theme.css است: در تعریف خودشان، و در نقش‌های پایین. جای تازه یعنی اول تصمیم صاحب
 * پروژه، بعد همین فهرست. تست‌ها حساب نیستند؛ رنگ را می‌سنجند، نه به کار می‌برند.
 */
const TETRAD_HOME = 'packages/ui/src/theme.css';
const TETRAD_ROLES = ['--color-progress', '--color-progress-track'];
const TETRAD_NAME = /\b(?:teal|purple|rose)-\d{2,3}\b|\bbrand-(?:teal|purple|rose)\b/g;

/** کد رنگ‌های سبزآبی، بنفش و رز (پایه و طیف)، از فایل برند. */
function tetradColors(): Set<string> {
  const css = readFileSync(join(REPO, 'docs/brand/jozveyar-colors.css'), 'utf8');
  return new Set(
    [...css.matchAll(/--jy-(?:brand-)?(?:teal|purple|rose)[\w-]*\s*:\s*#([0-9a-fA-F]{3,8})/g)].map(([, digits]) =>
      normalizeHex(digits!),
    ),
  );
}

/** نام و کد tetrad در یک متن؛ توضیح CSS حساب نیست. */
function tetradIn(text: string, isCss: boolean, tetrad: Set<string>): string[] {
  const code = isCss ? text.replace(/\/\*[\s\S]*?\*\//g, '') : text;
  return [...(code.match(TETRAD_NAME) ?? []), ...colorsIn(code, isCss).filter((color) => tetrad.has(color))];
}

/** نقش‌هایی از theme.css که به رنگ tetrad ارجاع می‌دهند. */
function tetradRoles(themeCss: string): string[] {
  const code = themeCss.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...code.matchAll(/(--[\w-]+)\s*:\s*var\(--color-(?:brand-)?(?:teal|purple|rose)\b[\w-]*\)/g)]
    .map(([, name]) => name!)
    .sort();
}

describe('قاعدهٔ رنگ: tetrad فقط جایی که قاعدهٔ رابط لازم دارد', () => {
  const tetrad = tetradColors();

  it('فایل برند را واقعاً می‌خواند: ۳۰ پله و دو رنگ پایهٔ جدا (سبزآبی پایه همان teal-500 است)', () => {
    expect(tetrad.size).toBe(32);
    expect(tetrad.has('#688484')).toBe(true);
    expect(tetrad.has('#766884')).toBe(true);
  });

  it('در کد رابط، بیرون از theme.css، نه نام سبزآبی و بنفش و رز هست، نه کدشان', () => {
    const offenders = sourceFiles()
      .filter((file) => file !== TETRAD_HOME && !/\.(?:test|spec)\.tsx?$/.test(file))
      .flatMap((file) =>
        tetradIn(readFileSync(join(REPO, file), 'utf8'), file.endsWith('.css'), tetrad).map((hit) => `${file}: ${hit}`),
      );
    expect(offenders).toEqual([]);
  });

  it('در theme.css، tetrad فقط در نقش نوار پیشرفت', () => {
    expect(tetradRoles(readFileSync(join(REPO, TETRAD_HOME), 'utf8'))).toEqual(TETRAD_ROLES);
  });

  it('شاهد: کلاس، متغیر، کد و نقش تازهٔ tetrad گرفته می‌شوند؛ سبز، نقش progress و توضیح نه', () => {
    expect(tetradIn('<b className="border-purple-600 bg-purple-50">', false, tetrad)).toEqual(['purple-600', 'purple-50']);
    expect(tetradIn('.a { background: var(--color-teal-100); }', true, tetrad)).toEqual(['teal-100']);
    expect(tetradIn('.a { color: var(--color-brand-rose); }', true, tetrad)).toEqual(['brand-rose']);
    expect(tetradIn('.a { color: #846868; }', true, tetrad)).toEqual(['#846868']);
    expect(tetradIn('<path stroke="#688484"/>', false, tetrad)).toEqual(['#688484']);
    expect(tetradIn('.a { background: var(--color-progress); color: var(--color-green-600); }', true, tetrad)).toEqual([]);
    expect(tetradIn('/* نوار پیشرفت teal-500 است */ .a { color: var(--color-muted); }', true, tetrad)).toEqual([]);
    expect(tetradRoles('--color-accent: var(--color-purple-600); --color-progress: var(--color-teal-500);')).toEqual([
      '--color-accent',
      '--color-progress',
    ]);
  });
});
