/**
 * کارهای یک‌باره هنگام بالا آمدن سرور — فعلاً فقط مهاجرت پایگاه داده.
 *
 * چرا اینجا و نه یک مرحلهٔ جدا در استقرار: بستهٔ تولیدی در CI ساخته می‌شود
 * (ADR-019) و روی سرور نه node هست نه pnpm، جز داخل همین کانتینر. مهاجرت‌گر
 * drizzle از مسیر import در باندل می‌آید و فایل‌های SQL کنار بسته‌اند؛
 * `deploy-bundle.sh` بعد از بالا آمدن، خط «✓ مهاجرت» را در لاگ می‌جوید.
 *
 * شکست مهاجرت سرور را نمی‌کشد: قیمت مرورگر بدون پایگاه داده هم کار می‌کند و
 * آپلود فقط ۵۰۳ می‌دهد (بی‌صدا). ولی بلند لاگ می‌شود.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
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
  }
}
