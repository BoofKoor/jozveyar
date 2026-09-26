/**
 * کارهای یک‌باره هنگام بالا آمدن سرور: مهاجرت پایگاه داده، و بعد دادهٔ پایه.
 *
 * چرا اینجا و نه یک مرحلهٔ جدا در استقرار: بستهٔ تولیدی در CI ساخته می‌شود
 * (ADR-019) و روی سرور نه node هست نه pnpm، جز داخل همین کانتینر. مهاجرت‌گر
 * drizzle از مسیر import در باندل می‌آید و فایل‌های SQL کنار بسته‌اند؛
 * `deploy-bundle.sh` بعد از بالا آمدن، خط «✓ مهاجرت» را در لاگ می‌جوید.
 *
 * دادهٔ پایه (استان‌ها و شهرها، تعرفهٔ پایه اگر هیچ تعرفه‌ای نیست، پیش‌فرض‌های `settings`) در کد
 * تعریف شده و اینجا به پایگاه داده می‌رسد؛ idempotent است (`seedReferenceData`، برش ۳).
 *
 * پیش از همه، یک خط حالت مسیر خرید (`CHECKOUT_MODE`، ADR-035)، حتی بی پایگاه داده.
 *
 * شکست هیچ‌کدام سرور را نمی‌کشد: قیمت مرورگر بدون پایگاه داده هم کار می‌کند و
 * آپلود فقط ۵۰۳ می‌دهد (بی‌صدا). ولی بلند لاگ می‌شود.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // حالت مسیر خرید (ADR-035)، یک خط: صاحب پروژه بعد از استقرار «مسیر خرید: off» را می‌بیند.
  const { configuredMode, describeMode, sessionSecretOf } = await import('./lib/server/checkoutMode');
  console.log(describeMode(configuredMode(process.env.CHECKOUT_MODE), sessionSecretOf(process.env.SESSION_SECRET) !== null));

  const url = process.env.DATABASE_URL;
  if (!url) return;

  const { resolve } = await import('node:path');
  const { existsSync } = await import('node:fs');
  // نقطهٔ ورود standalone پیش از اجرا به پوشهٔ خودش (apps/web) می‌رود.
  const folder = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), '../../packages/db/migrations');
  if (!existsSync(folder)) {
    console.error(`✗ مهاجرت: پوشهٔ ${folder} پیدا نشد — پایگاه داده به‌روز نشد.`);
    return;
  }

  try {
    const { runMigrations } = await import('@jozveyar/db');
    await runMigrations(url, folder);
    console.log('✓ مهاجرت‌ها اعمال شدند.');
  } catch (error) {
    console.error('✗ مهاجرت شکست خورد:', error);
    return;
  }

  // یک اتصال، جدا از استخر اپ، مثل مهاجرت‌گر: کار یک‌باره است.
  const { createDb, seedReferenceData } = await import('@jozveyar/db');
  const { SEED_PRICE_LIST } = await import('@jozveyar/pricing/seed');
  const conn = createDb(url, { max: 1 });
  try {
    const seeded = await seedReferenceData(conn, { priceList: SEED_PRICE_LIST });
    const extra = [
      seeded.priceListInserted !== null ? `تعرفهٔ ${seeded.priceListInserted} درج شد` : null,
      seeded.settingsInserted.length > 0 ? `تنظیم‌های تازه: ${seeded.settingsInserted.join('، ')}` : null,
    ].filter(Boolean);
    console.log(`✓ دادهٔ پایه: ${seeded.provinces} استان و ${seeded.cities} شهر${extra.length ? `؛ ${extra.join('؛ ')}` : ''}.`);
  } catch (error) {
    console.error('✗ دادهٔ پایه نوشته نشد:', error);
  } finally {
    await conn.client.end();
  }
}
