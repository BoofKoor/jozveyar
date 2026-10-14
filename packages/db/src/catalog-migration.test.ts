/**
 * مهاجرت کاتالوگ چاپ (برش ۸٫۳، 0037 تا 0039) روی داده‌ای به شکل پیش از آن: تنها مهاجرتی تا امروز که دادهٔ تعرفهٔ سایت زنده را از
 * یک شکل به شکل دیگر می‌برد، پس با پستگرس واقعی و از همان شکل قدیم سنجیده می‌شود، نه فقط روی پایگاه دادهٔ تازه.
 *
 * پایگاه دادهٔ جدای خودش را می‌سازد (کنار `DATABASE_URL`، با پسوند `_m83`)، مهاجرت‌ها را تا 0036 اجرا می‌کند، نسخه‌های تعرفه را با
 * ستون‌های قدیم می‌نشاند، بقیهٔ مهاجرت‌ها را اجرا می‌کند و در پایان پاکش می‌کند. بی `DATABASE_URL` خودش را رد می‌کند.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { quote, wholeDocumentRule } from '@jozveyar/pricing';

import { createDb, type Database } from './index.js';
import { MIGRATIONS_FOLDER, runMigrations } from './migrate.js';
import { readPriceList } from './seed.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** آخرین مهاجرت پیش از ۸٫۳. */
const BEFORE_CATALOG = 36;

describe.skipIf(!DATABASE_URL)('مهاجرت کاتالوگ چاپ روی دادهٔ پیش از ۸٫۳', () => {
  const url = new URL(DATABASE_URL!);
  const name = `${url.pathname.slice(1)}_m83`;
  const target = Object.assign(new URL(url.href), { pathname: `/${name}` }).href;
  const admin = Object.assign(new URL(url.href), { pathname: '/postgres' }).href;
  let partial: string;
  let conn: Database;
  let sql: postgres.Sql;

  beforeAll(async () => {
    const server = postgres(admin, { max: 1, onnotice: () => {} });
    await server.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await server.unsafe(`CREATE DATABASE "${name}"`);
    await server.end();

    // پوشهٔ مهاجرت‌ها تا 0036: همان فایل‌ها، با دفتری که فقط تا همان را می‌شناسد.
    partial = mkdtempSync(join(tmpdir(), 'jy-m83-'));
    cpSync(MIGRATIONS_FOLDER, partial, { recursive: true });
    const journalPath = join(partial, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx <= BEFORE_CATALOG);
    writeFileSync(journalPath, JSON.stringify(journal));
    await runMigrations(target, partial);

    // دو نسخه به شکل پیش از ۸٫۳: ۱ فعال‌شده (تحریر، طلق و سیم)، ۲ پیش‌نویس با نرخ دیگر و کاغذ گلاسه. سرِ نسخه اول غیرفعال، چون
    // ردیف فقط به پیش‌نویس می‌رسد (0013)؛ فعال شدن آخر.
    sql = postgres(target, { max: 1, onnotice: () => {} });
    const settings = { minOrderRials: 0, roundingStepRials: 0, vatPercent: 0, packagingWeightGrams: 100, sheetAreaM2: 0.06237 };
    for (const [version, color, bw] of [
      [1, 20_000, 16_000],
      [2, 22_000, 17_000],
    ] as const) {
      await sql`INSERT INTO price_lists (version, label, click_rate_color_rials, click_rate_bw_rials, settings, is_active)
                VALUES (${version}, ${`نسخهٔ ${version}`}, ${color}, ${bw}, ${sql.json(settings)}, false)`;
      await sql`INSERT INTO paper_types (price_list_version, id, name_fa, gsm, enabled, rate_per_sheet_rials)
                VALUES (${version}, 'tahrir80', 'تحریر ۸۰ گرم', 80, true, 0)`;
      await sql`INSERT INTO binding_types (price_list_version, id, name_fa, enabled, max_sheets_per_volume, weight_per_volume_grams)
                VALUES (${version}, 'spiral_clear', 'طلق و سیم', true, 800, 60)`;
      await sql`INSERT INTO binding_rate_bands (price_list_version, binding_type_id, min_sheets, max_sheets, price_rials)
                VALUES (${version}, 'spiral_clear', 1, 150, 450000), (${version}, 'spiral_clear', 151, 800, 500000)`;
    }
    await sql`INSERT INTO paper_types (price_list_version, id, name_fa, gsm, enabled, rate_per_sheet_rials)
              VALUES (2, 'glossy', 'گلاسه', 135, true, 15000)`;
    await sql`UPDATE price_lists SET is_active = true WHERE version = 1`;

    // بقیهٔ مهاجرت‌ها، همان که استقرار بعدی روی سایت زنده می‌کند.
    await runMigrations(target);
    conn = createDb(target);
  });

  afterAll(async () => {
    await sql?.end();
    await conn?.client.end();
    if (partial) rmSync(partial, { recursive: true, force: true });
    const server = postgres(admin, { max: 1, onnotice: () => {} });
    await server.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await server.end();
  });

  it('هر نسخه نرخ هر رو A4 را با همان دو نرخ برای یکرو و دورو می‌گیرد، و هر کاغذ نرخ هر برگ A4 را', async () => {
    const rates = await sql`SELECT price_list_version AS v, sides_mode AS sides, color_mode AS color, rate_rials::int AS rate
                            FROM print_rates WHERE paper_size = 'a4' ORDER BY 1, 2, 3`;
    expect(rates.map((r) => [r.v, r.sides, r.color, r.rate])).toEqual([
      [1, 'single', 'color', 20_000],
      [1, 'single', 'bw', 16_000],
      [1, 'double', 'color', 20_000],
      [1, 'double', 'bw', 16_000],
      [2, 'single', 'color', 22_000],
      [2, 'single', 'bw', 17_000],
      [2, 'double', 'color', 22_000],
      [2, 'double', 'bw', 17_000],
    ]);
    expect((await sql`SELECT count(*)::int AS n FROM print_rates WHERE paper_size <> 'a4'`)[0]!.n).toBe(0);
    const papers = await sql`SELECT price_list_version AS v, paper_type_id AS id, paper_size AS size, rate_rials::int AS rate
                             FROM paper_rates ORDER BY 1, 2`;
    expect(papers.map((r) => [r.v, r.id, r.size, r.rate])).toEqual([
      [1, 'tahrir80', 'a4', 0],
      [2, 'glossy', 'a4', 15_000],
      [2, 'tahrir80', 'a4', 0],
    ]);
    const bands = await sql`SELECT DISTINCT paper_size FROM binding_rate_bands`;
    expect(bands.map((r) => r.paper_size)).toEqual(['a4']);
    const bindings = await sql`SELECT DISTINCT min_sheets, splits_volumes FROM binding_types`;
    expect(bindings).toEqual([{ min_sheets: 1, splits_volumes: true }]);
  });

  it('نسخهٔ فعال همان قیمت پیش از مهاجرت را می‌دهد: ۱۴۷ صفحهٔ دورو سیاه‌سفید، ۲۳۵,۲۰۰ + ۴۵,۰۰۰ تومان', async () => {
    const list = (await readPriceList(conn.db, 1))!;
    expect(list.printRates).toEqual({ a4: { single: { color: 20_000, bw: 16_000 }, double: { color: 20_000, bw: 16_000 } } });
    expect(list.settings).not.toHaveProperty('sheetAreaM2');
    const breakdown = quote(
      {
        items: [
          {
            sections: [{ documentId: 'd', pageCount: 147 }],
            rules: wholeDocumentRule(147, 'bw', 'tahrir80'),
            copies: 1,
            sidesMode: 'double',
            paperSize: 'a4',
            bindingTypeId: 'spiral_clear',
          },
        ],
        shipping: null,
      },
      list,
    );
    expect(breakdown.warnings).toEqual([]);
    expect(breakdown.totalRials).toBe(2_802_000);
    expect((await readPriceList(conn.db, 2))!.paperTypes.glossy).toEqual({
      nameFa: 'گلاسه',
      gsm: 135,
      enabled: true,
      sheetRates: { a4: 15_000 },
    });
  });

  it('ستون‌های پیشین رفته‌اند و اندازه دیگر پیش‌فرض ندارد', async () => {
    const columns = await sql`SELECT table_name, column_name FROM information_schema.columns
                              WHERE (table_name = 'price_lists' AND column_name LIKE 'click_rate%')
                                 OR (table_name = 'paper_types' AND column_name = 'rate_per_sheet_rials')`;
    expect(columns).toEqual([]);
    const defaults = await sql`SELECT table_name, column_default FROM information_schema.columns
                               WHERE column_name = 'paper_size' AND table_name IN ('binding_rate_bands', 'order_items')
                               ORDER BY 1`;
    expect(defaults.map((r) => [r.table_name, r.column_default])).toEqual([
      ['binding_rate_bands', null],
      ['order_items', null],
    ]);
  });

  it('نسخهٔ فعال‌شده با نرخ‌های تازه‌اش هم منجمد است؛ پیش‌نویس نه', async () => {
    const constraintOf = async (query: Promise<unknown>) => {
      try {
        await query;
        return undefined;
      } catch (error) {
        return (error as { constraint_name?: string }).constraint_name;
      }
    };
    expect(await constraintOf(sql`UPDATE print_rates SET rate_rials = 1 WHERE price_list_version = 1`)).toBe('price_list_rows_frozen');
    expect(await constraintOf(sql`UPDATE paper_rates SET rate_rials = 1 WHERE price_list_version = 1`)).toBe('price_list_rows_frozen');
    expect(await constraintOf(sql`UPDATE price_lists SET label = 'دیگر' WHERE version = 1`)).toBe('price_lists_frozen');
    await sql`UPDATE print_rates SET rate_rials = 18000 WHERE price_list_version = 2 AND sides_mode = 'single' AND color_mode = 'bw'`;
    expect((await readPriceList(conn.db, 2))!.printRates.a4!.single.bw).toBe(18_000);
  });
});
