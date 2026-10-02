/**
 * تعرفهٔ صفحهٔ اصلی روی سرور (برش ۴٫۴، ADR-040): تعرفهٔ فعال پایگاه داده و روز کاری تحویل به پست، از همان درگاهی
 * (`OrderStore`) که مسیر خرید با آن قیمت قطعی می‌دهد و سفارش می‌سازد. صفحه با ISR ۶۰ ثانیه ساخته می‌شود و این را هم به
 * HTML (جدول تعرفه، سؤال‌ها، «۲ روز کاری») می‌دهد و هم به JSON درون HTML برای `quote()` مرورگر (`lib/tariff.ts`).
 *
 * - **build:** تعرفهٔ پایه، حتی با `DATABASE_URL`: build به پایگاه داده بند نیست، و صفحهٔ build فقط تا اولین بازسازی است.
 * - **بی `DATABASE_URL`** (سرتاسری بی سرویس، توسعه): تعرفهٔ پایه، همان که پیش از ۴٫۴ بود.
 * - **پایگاه داده خطا داد:** بلند در لاگ، و خطا بالا می‌رود؛ ISR صفحهٔ قبلی را نگه می‌دارد و درخواست بعدی دوباره می‌سازد.
 *   تعرفهٔ پایه نه: پس از ویرایش تعرفه (۴٫۵) همان عددی نیست که سرور حساب می‌کند.
 */

import { createOrderStore, getDb, readSetting, type OrderStore } from '@jozveyar/db';

import { SEED_TARIFF, type SiteTariff } from '../tariff';

/** فاز build نکست؛ در کارگرهای build هم هست. صفحه‌های ثابت (`siteFacts.ts`) هم همین را می‌سنجند. */
export const BUILD_PHASE = 'phase-production-build';

type TariffSource = Pick<OrderStore, 'activePriceList' | 'setting'>;

/** تعرفهٔ فعال و `order.sla_days`؛ تنظیم خراب همان پیش‌فرض است، با لاگ (`readSetting`). */
export async function loadTariff(source: TariffSource, log?: (message: string, error?: unknown) => void): Promise<SiteTariff> {
  const [priceList, slaDays] = await Promise.all([
    source.activePriceList(),
    readSetting((key) => source.setting(key), 'order.sla_days', log),
  ]);
  return { priceList, slaDays };
}

let source: TariffSource | undefined;

export async function siteTariff(
  env: Readonly<Record<string, string | undefined>> = process.env,
  sourceOf: () => TariffSource = () => (source ??= createOrderStore(getDb())),
): Promise<SiteTariff> {
  if (env.NEXT_PHASE === BUILD_PHASE || !env.DATABASE_URL) return SEED_TARIFF;
  try {
    return await loadTariff(sourceOf());
  } catch (error) {
    console.error('✗ صفحهٔ اصلی: تعرفه از پایگاه داده خوانده نشد؛ نسخهٔ قبلی صفحه می‌ماند.', error);
    throw error;
  }
}
