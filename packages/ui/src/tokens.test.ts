/**
 * هم‌خوانی سیستم طراحی با برند: packages/ui آینهٔ docs/brand است، نه نسخهٔ دوم آن.
 *
 * docs/brand مرجع است و کد سایت از آن import نمی‌کند؛ بیلد به پوشهٔ سند بند نیست. پس هر چه از
 * آنجا به اینجا آمده (رنگ‌ها، توکن‌های کیت، آیکون‌ها، لوگو و نشان) همین‌جا با خود فایل برند
 * سنجیده می‌شود. برند که عوض شد، این تست می‌گوید کجای کد عقب مانده.
 *
 * آیکون تازه یا عوض‌شده: فایلش را در docs/brand/icons بگذار و `UPDATE_ICONS=1 pnpm test` بزن تا
 * icons.css از روی آن ساخته شود.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LOGO_BOX, MARK_BOX, PAGE_COLOR } from './tokens.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(join(REPO, path), 'utf8');

/** اعلان‌های `--نام: مقدار;` یک متن CSS، بی توضیح‌ها. اعلان تکراری: اولی. */
function declarations(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, name, value] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    if (!map.has(name!)) map.set(name!, value!.trim());
  }
  return map;
}

/** اولین بلوک `:root { … }` یک فایل. */
function rootBlock(css: string): string {
  const match = /:root\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  if (!match) throw new Error('بلوک :root پیدا نشد');
  return match[1]!;
}

/** `var(--x)` را تا مقدار نهایی باز می‌کند. */
function resolve(value: string, ...maps: Map<string, string>[]): string {
  for (let i = 0; i < 10; i++) {
    const ref = /^var\((--[\w-]+)\)$/.exec(value.trim());
    if (!ref) return value.trim();
    const next = maps.map((m) => m.get(ref[1]!)).find((v) => v !== undefined);
    if (next === undefined) return value.trim();
    value = next;
  }
  throw new Error(`ارجاع حلقوی: ${value}`);
}

const brand = declarations(read('docs/brand/jozveyar-colors.css'));
const kit = declarations(rootBlock(read('docs/brand/jozveyar-ui.css')));
const theme = declarations(read('packages/ui/src/theme.css'));
const base = declarations(rootBlock(read('packages/ui/src/base.css')));

/**
 * اختلاف رنگ‌های theme.css با فایل برند؛ خالی یعنی آینهٔ دقیق. `--jy-x` برند همان
 * `--color-x` اینجاست. هر رنگ theme یا کد برند است، یا ارجاع به رنگی از همین theme.
 */
function colorMismatches(brandColors: Map<string, string>, themeTokens: Map<string, string>): string[] {
  const problems: string[] = [];
  for (const [name, value] of brandColors) {
    const token = `--color-${name.replace(/^--jy-/, '')}`;
    const mine = themeTokens.get(token);
    if (mine === undefined) problems.push(`${token} نیست (برند ${value})`);
    else if (mine.toUpperCase() !== value.toUpperCase()) problems.push(`${token} ${mine} است، برند ${value}`);
  }
  for (const [name, value] of themeTokens) {
    if (!name.startsWith('--color-')) continue;
    if (value.startsWith('#')) {
      if (!brandColors.has(`--jy-${name.slice('--color-'.length)}`)) problems.push(`${name} (${value}) در فایل برند نیست`);
      continue;
    }
    const ref = /^var\((--color-[\w-]+)\)$/.exec(value);
    if (!ref || !themeTokens.has(ref[1]!)) problems.push(`${name}: «${value}» نه کد برند است، نه ارجاع به رنگ theme`);
  }
  return problems;
}

describe('رنگ‌ها: theme.css آینهٔ docs/brand/jozveyar-colors.css', () => {
  it('هر رنگ برند با همان نام و همان کد، و هیچ رنگ دیگری', () => {
    expect(brand.size).toBeGreaterThan(60);
    expect(colorMismatches(brand, theme)).toEqual([]);
  });

  it('شاهد: یک رقم عوض‌شده، رنگ جاافتاده و رنگ بیرون از برند، هر سه دیده می‌شوند', () => {
    const changed = new Map(theme).set('--color-green-600', '#6C795F');
    const missing = new Map(theme);
    missing.delete('--color-rose-900');
    const extra = new Map(theme).set('--color-sage-button', '#D0E5B8');
    expect(colorMismatches(brand, changed)).toEqual(['--color-green-600 #6C795F است، برند #6C795E']);
    expect(colorMismatches(brand, missing)).toEqual(['--color-rose-900 نیست (برند #392222)']);
    expect(colorMismatches(brand, extra)).toEqual(['--color-sage-button (#D0E5B8) در فایل برند نیست']);
  });

  it('نقش‌ها همان نگاشت پالت‌اند', () => {
    const role = (token: string) => resolve(theme.get(token)!, theme);
    expect(role('--color-page')).toBe(brand.get('--jy-green-50'));
    expect(role('--color-card')).toBe(brand.get('--jy-paper'));
    expect(role('--color-line')).toBe(resolve(kit.get('--jy-border-subtle')!, brand));
    expect(role('--color-control')).toBe(resolve(kit.get('--jy-border-control')!, brand));
    expect(role('--color-accent')).toBe(brand.get('--jy-green-600'));
    expect(role('--color-muted')).toBe(brand.get('--jy-green-700'));
  });

  it('themeColor همان زمینهٔ صفحه است', () => {
    expect(PAGE_COLOR).toBe(resolve(theme.get('--color-page')!, theme));
  });
});

describe('توکن‌های کیت: همان بلوک :root در docs/brand/jozveyar-ui.css', () => {
  const same = (a: string | undefined, b: string | undefined) => a?.replace(/\s+/g, '') === b?.replace(/\s+/g, '');

  it('گوشه، سایه، حرکت، ظرف و فوکوس', () => {
    const pairs: [string, string | undefined, string | undefined][] = [
      ['گوشهٔ کوچک', theme.get('--radius-sm'), kit.get('--jy-radius-sm')],
      ['گوشهٔ کنترل', theme.get('--radius-md'), kit.get('--jy-radius-md')],
      ['گوشهٔ کارت', theme.get('--radius-lg'), kit.get('--jy-radius-lg')],
      ['سایهٔ کوچک', theme.get('--shadow-sm'), kit.get('--jy-shadow-sm')],
      ['سایهٔ میانه', theme.get('--shadow-md'), kit.get('--jy-shadow-md')],
      ['زمان پیش‌فرض transition', theme.get('--default-transition-duration'), kit.get('--jy-dur-fast')],
      ['منحنی پیش‌فرض transition', theme.get('--default-transition-timing-function'), kit.get('--jy-ease')],
      ['زمان کوتاه', base.get('--jy-dur-fast'), kit.get('--jy-dur-fast')],
      ['زمان پایه', base.get('--jy-dur-base'), kit.get('--jy-dur-base')],
      ['منحنی', base.get('--jy-ease'), kit.get('--jy-ease')],
      ['ظرف', base.get('--jy-container'), kit.get('--jy-container')],
      ['حاشیهٔ کنار', base.get('--jy-gutter'), kit.get('--jy-gutter')],
      ['فوکوس درونی', resolve(base.get('--jy-focus-inner')!, theme), resolve(kit.get('--jy-focus-inner')!, brand)],
      ['فوکوس بیرونی', resolve(base.get('--jy-focus-outer')!, theme), resolve(kit.get('--jy-focus-outer')!, brand)],
    ];
    const problems = pairs.filter(([, mine, theirs]) => !same(mine, theirs)).map(([n, m, t]) => `${n}: ${m} به‌جای ${t}`);
    expect(problems).toEqual([]);
  });

  it('شاهد: گوشهٔ کارت ۱۲ به‌جای ۱۶ دیده می‌شود', () => {
    expect(same('12px', kit.get('--jy-radius-lg'))).toBe(false);
    expect(same(theme.get('--radius-lg'), kit.get('--jy-radius-lg'))).toBe(true);
  });
});

const ICONS_DIR = 'docs/brand/icons';
const ICONS_CSS = join(REPO, 'packages/ui/src/icons.css');
const DATA_PREFIX = 'data:image/svg+xml,';

/** SVG برای mask: گیومهٔ تکی، و فقط نویسه‌هایی که درون url() باید رمز شوند. */
function dataUri(svg: string): string {
  return DATA_PREFIX + svg.trim().replaceAll('"', "'").replace(/[%#<>]/g, (c) => encodeURIComponent(c));
}

function iconNames(): string[] {
  return readdirSync(join(REPO, ICONS_DIR))
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .sort();
}

function iconsCss(): string {
  const rules = iconNames().map(
    (name) => `@utility jy-icon-${name} {\n  --jy-icon: url("${dataUri(read(`${ICONS_DIR}/${name}.svg`))}");\n}\n`,
  );
  return `/*
 * آیکون‌های برند، ساخته‌شده از روی docs/brand/icons؛ دستی ویرایش نکنید.
 * آیکون تازه: فایلش را در docs/brand/icons بگذارید و \`UPDATE_ICONS=1 pnpm test\` بزنید.
 *
 * هر آیکون یک @utility است که فقط شکل را می‌دهد: <span class="jy-icon jy-icon-close" aria-hidden="true">.
 * Tailwind فقط آیکونی را در CSS خروجی می‌گذارد که در کد به کار رفته باشد.
 */

${rules.join('\n')}`;
}

describe('آیکون‌ها: icons.css از روی docs/brand/icons', () => {
  it('icons.css همان است که از فایل‌های برند ساخته می‌شود', () => {
    const expected = iconsCss();
    if (process.env.UPDATE_ICONS === '1' || !existsSync(ICONS_CSS)) writeFileSync(ICONS_CSS, expected);
    expect(readFileSync(ICONS_CSS, 'utf8')).toBe(expected);
  });

  it('رمزگذاری بی‌کاست است: mask دقیقاً همان فایل برند را می‌کشد', () => {
    for (const name of iconNames()) {
      const svg = read(`${ICONS_DIR}/${name}.svg`).trim();
      const decoded = decodeURIComponent(dataUri(svg).slice(DATA_PREFIX.length)).replaceAll("'", '"');
      expect(decoded, name).toBe(svg);
    }
  });

  it('هر jy-icon-* که کد به کار برده، فایلش در برند هست', () => {
    // Tailwind کلاس ناشناس را بی‌صدا نادیده می‌گیرد؛ نام غلط یعنی آیکون نامرئی.
    const known = new Set(iconNames());
    const used = new Set<string>();
    const scan = (dir: string) => {
      for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!['node_modules', '.next', 'tests'].includes(entry.name)) scan(`${dir}/${entry.name}`);
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
          for (const [, name] of read(`${dir}/${entry.name}`).matchAll(/\bjy-icon-([a-z][a-z0-9-]*)/g)) used.add(name!);
        }
      }
    };
    scan('apps/web');
    scan('packages/ui/src');
    expect([...used].filter((name) => !known.has(name))).toEqual([]);
  });
});

describe('لوگو و نشان: همان فایل‌های برند', () => {
  const FILES = ['jozveyar-logo-no-tagline.svg', 'jozveyar-mark.svg'];

  it('بایت‌به‌بایت یکی‌اند', () => {
    for (const file of FILES) expect(read(`packages/ui/assets/${file}`), file).toBe(read(`docs/brand/${file}`));
  });

  it('اندازهٔ ذاتی در کد همان viewBox فایل است', () => {
    const box = (file: string) => {
      const [, , width, height] = /viewBox="([^"]+)"/.exec(read(`docs/brand/${file}`))![1]!.split(/\s+/).map(Number);
      return { width, height };
    };
    expect(LOGO_BOX).toEqual(box('jozveyar-logo-no-tagline.svg'));
    expect(MARK_BOX).toEqual(box('jozveyar-mark.svg'));
  });
});
