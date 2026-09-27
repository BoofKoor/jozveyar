/**
 * نوشتن و خواندن تعرفه در پایگاه داده.
 *
 * نوشتن **idempotent** است: اگر همان نسخه از قبل باشد، دست نمی‌خورد. دلیلش
 * قاعدهٔ «قیمت سفارش منجمد است» است — سفارش ثبت‌شده `price_list_version` را
 * نگه می‌دارد، پس بازنویسی یک نسخهٔ موجود یعنی عوض کردن قیمت سفارش‌های گذشته.
 * تعرفهٔ جدید = نسخهٔ جدید، همیشه. از برش ۴٫۵ خود پایگاه داده هم نسخهٔ فعال‌شده را
 * تغییرناپذیر نگه می‌دارد (0013)، و پیش‌نویس و فعال کردن از پنل در `tariff.ts` است.
 */

import { asc, eq } from 'drizzle-orm';

import type { Database } from './index.js';
import { priceListToRows, rowsToPriceList, type PriceListRows } from './price-list.js';
import {
  bindingRateBands,
  bindingTypes,
  paperTypes,
  priceLists,
  shippingMethods,
  shippingRates,
} from './schema.js';
import type { PriceList } from '@jozveyar/contracts';

export interface SeedResult {
  version: number;
  /** false یعنی این نسخه از قبل بود و چیزی نوشته نشد. */
  inserted: boolean;
}

/** پایگاه داده یا تراکنشی از آن؛ هر دو همان کوئری‌ها را دارند. */
type Db = Database['db'];

/** ردیف‌های یک نسخه، پس از سرش. ترتیب درج همان ترتیب کلیدهای خارجی است. */
export async function insertPriceListRows(db: Db, rows: PriceListRows): Promise<void> {
  if (rows.paperTypes.length > 0) await db.insert(paperTypes).values(rows.paperTypes);
  if (rows.bindingTypes.length > 0) await db.insert(bindingTypes).values(rows.bindingTypes);
  if (rows.bindingRateBands.length > 0) await db.insert(bindingRateBands).values(rows.bindingRateBands);
  if (rows.shippingMethods.length > 0) await db.insert(shippingMethods).values(rows.shippingMethods);
  if (rows.shippingRates.length > 0) await db.insert(shippingRates).values(rows.shippingRates);
}

export async function seedPriceList(
  { db }: Database,
  list: PriceList,
  options: { activate?: boolean } = {},
): Promise<SeedResult> {
  const activate = options.activate ?? true;
  // سرِ نسخه اول غیرفعال: ردیف فقط به پیش‌نویس می‌رسد (تریگر `price_list_rows_frozen`، 0013)، و فعال شدن آخرِ همین
  // تراکنش است. تریگر `price_lists_frozen` زمان فعال شدن را هم همان‌جا می‌نویسد.
  const rows = priceListToRows(list, false);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ version: priceLists.version })
      .from(priceLists)
      .where(eq(priceLists.version, list.version))
      .limit(1);

    if (existing.length > 0) {
      return { version: list.version, inserted: false };
    }

    await tx.insert(priceLists).values(rows.priceList);
    await insertPriceListRows(tx as unknown as Db, rows);

    // فقط یک تعرفه می‌تواند فعال باشد و پایگاه داده این را اجبار می‌کند، پس
    // قبلی باید در همین تراکنش خاموش شود وگرنه روشن کردن این یکی می‌شکند.
    if (activate) {
      await tx.update(priceLists).set({ isActive: false }).where(eq(priceLists.isActive, true));
      await tx.update(priceLists).set({ isActive: true }).where(eq(priceLists.version, list.version));
    }

    return { version: list.version, inserted: true };
  });
}

/** تعرفهٔ فعال. اگر هیچ تعرفه‌ای فعال نباشد خطا می‌دهد — سکوت اینجا خطرناک است. */
export async function loadActivePriceList({ db }: Database): Promise<PriceList> {
  const [head] = await db.select().from(priceLists).where(eq(priceLists.isActive, true)).limit(1);
  if (!head) throw new Error('هیچ تعرفهٔ فعالی در پایگاه داده نیست.');
  return loadPriceList({ db } as Database, head.version);
}

export async function loadPriceList({ db }: Database, version: number): Promise<PriceList> {
  const list = await readPriceList(db, version);
  if (!list) throw new Error(`تعرفهٔ نسخهٔ ${version} پیدا نشد.`);
  return list;
}

/**
 * یک نسخه، یا null اگر نیست؛ درون تراکنش هم (پنل زیر قفل می‌خواندش، `tariff.ts`). ردیف‌ها به ترتیب شناسه، تا دو
 * بار خواندن یک نسخه یک شیء بدهد.
 */
export async function readPriceList(db: Db, version: number): Promise<PriceList | null> {
  const [head] = await db.select().from(priceLists).where(eq(priceLists.version, version)).limit(1);
  if (!head) return null;

  const byVersion = <T extends { priceListVersion: unknown }>(t: T) =>
    eq(t.priceListVersion as never, version);

  const [papers, bindings, bands, methods, rates] = await Promise.all([
    db.select().from(paperTypes).where(byVersion(paperTypes)).orderBy(asc(paperTypes.id)),
    db.select().from(bindingTypes).where(byVersion(bindingTypes)).orderBy(asc(bindingTypes.id)),
    db.select().from(bindingRateBands).where(byVersion(bindingRateBands)),
    db.select().from(shippingMethods).where(byVersion(shippingMethods)).orderBy(asc(shippingMethods.id)),
    db.select().from(shippingRates).where(byVersion(shippingRates)),
  ]);

  return rowsToPriceList({
    priceList: head,
    paperTypes: papers,
    bindingTypes: bindings,
    bindingRateBands: bands,
    shippingMethods: methods,
    shippingRates: rates,
  });
}

/** نسخهٔ فعال را عوض می‌کند. هر دو تغییر در یک تراکنش، وگرنه محدودیت می‌شکند. */
export async function activatePriceList({ db }: Database, version: number): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ version: priceLists.version })
      .from(priceLists)
      .where(eq(priceLists.version, version))
      .limit(1);
    if (!target) throw new Error(`تعرفهٔ نسخهٔ ${version} پیدا نشد.`);

    await tx.update(priceLists).set({ isActive: false }).where(eq(priceLists.isActive, true));
    await tx.update(priceLists).set({ isActive: true }).where(eq(priceLists.version, version));
  });
}
