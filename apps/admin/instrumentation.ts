/**
 * یک خط هنگام بالا آمدن پنل، که `deploy-bundle.sh` می‌جوید (تصمیم ۲۳): آماده یا بسته و چرا، و اگر هنوز هیچ
 * ادمینی ثبت نکرده، دستور ساختن اولی. مسیر محرمانه و هیچ مقدار دیگری از `.env` هرگز در لاگ نیست.
 *
 * مهاجرت و دادهٔ پایه (نقش‌ها و مجوزها) با وب است (`apps/web/instrumentation.ts`)؛ کانتینر پنل بعد از «وب
 * سالم» بالا می‌آید (compose). شکست اینجا پنل را نمی‌کشد، فقط بلند می‌گوید.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { adminConfig, describeConfig } = await import('./lib/server/config');
  console.log(describeConfig(process.env));
  const config = adminConfig(process.env);
  if (!config) return;

  const { createDb } = await import('@jozveyar/db');
  const conn = createDb(config.databaseUrl, { max: 1 });
  try {
    const [row] = await conn.client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM admin_users WHERE disabled_at IS NULL AND password_hash IS NOT NULL`;
    if ((row?.n ?? 0) === 0) {
      console.log('⚠ پنل ادمین: هنوز هیچ ادمینی ثبت نکرده؛ روی سرور ./infra/admin-invite.sh <نام کاربری> بزن.');
    }
  } catch (error) {
    console.error('✗ پنل ادمین: پایگاه داده جواب نداد:', error instanceof Error ? error.message : error);
  } finally {
    await conn.client.end();
  }
}
