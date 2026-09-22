/**
 * نوشتن و خواندن تعرفه در پایگاه داده.
 *
 * نوشتن **idempotent** است: اگر همان نسخه از قبل باشد، دست نمی‌خورد. دلیلش
 * قاعدهٔ «قیمت سفارش منجمد است» است — سفارش ثبت‌شده `price_list_version` را
 * نگه می‌دارد، پس بازنویسی یک نسخهٔ موجود یعنی عوض کردن قیمت سفارش‌های گذشته.
 * تعرفهٔ جدید = نسخهٔ جدید، همیشه.
 */

import { eq } from 'drizzle-orm';

import type { Database } from './index.js';
import { priceListToRows, rowsToPriceList } from './price-list.js';
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

export async function seedPriceList(
  { db }: Database,
  list: PriceList,
  options: { activate?: boolean } = {},
): Promise<SeedResult> {
  const activate = options.activate ?? true;
  const rows = priceListToRows(list, activate);

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ version: priceLists.version })
      .from(priceLists)
      .where(eq(priceLists.version, list.version))
      .limit(1);

    if (existing.length > 0) {
      return { version: list.version, inserted: false };
    }

    // فقط یک تعرفه می‌تواند فعال باشد و پایگاه داده این را اجبار می‌کند، پس
    // قبلی باید در همین تراکنش خاموش شود وگرنه درج می‌شکند.
    if (activate) {
      await tx.update(priceLists).set({ isActive: false }).where(eq(priceLists.isActive, true));
    }

    await tx.insert(priceLists).values(rows.priceList);
    await tx.insert(paperTypes).values(rows.paperTypes);
    await tx.insert(bindingTypes).values(rows.bindingTypes);
    await tx.insert(bindingRateBands).values(rows.bindingRateBands);
    await tx.insert(shippingMethods).values(rows.shippingMethods);
    await tx.insert(shippingRates).values(rows.shippingRates);

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
  const [head] = await db.select().from(priceLists).where(eq(priceLists.version, version)).limit(1);
  if (!head) throw new Error(`تعرفهٔ نسخهٔ ${version} پیدا نشد.`);

  const byVersion = <T extends { priceListVersion: unknown }>(t: T) =>
    eq(t.priceListVersion as never, version);

  const [papers, bindings, bands, methods, rates] = await Promise.all([
    db.select().from(paperTypes).where(byVersion(paperTypes)),
    db.select().from(bindingTypes).where(byVersion(bindingTypes)),
    db.select().from(bindingRateBands).where(byVersion(bindingRateBands)),
    db.select().from(shippingMethods).where(byVersion(shippingMethods)),
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
