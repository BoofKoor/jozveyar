/**
 * یک خط هنگام بالا آمدن پنل، که `deploy-bundle.sh` می‌جوید (تصمیم ۲۳): آماده یا بسته و چرا، و اگر هنوز هیچ
 * ادمینی ثبت نکرده، دستور ساختن اولی؛ و از ۴٫۶ منبع هر کلید سرویس. مسیر محرمانه و هیچ مقدار دیگری از `.env` هرگز در لاگ
 * نیست.
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
  // بی استوریج، پنل بالا می‌آید و فقط دانلود PDF جزوه (۴٫۲) بسته است؛ بلند، تا بعد از استقرار دیده شود.
  const { storageFromEnv } = await import('@jozveyar/storage');
  if (!storageFromEnv(process.env)) console.log('⚠ پنل ادمین: استوریج (S3_*) پیکربندی نشده؛ دانلود PDF جزوه بسته است.');
  // پیامک رهگیری (۶٫۳، ADR-047): تا برش ۷ فقط کنسولی، هر چه `.env` بگوید.
  console.log('✓ پنل ادمین: پیامک رهگیری کنسولی (در sms_messages)، تا برش ۷');

  const { createDb } = await import('@jozveyar/db');
  const conn = createDb(config.databaseUrl, { max: 1 });
  try {
    const [row] = await conn.client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM admin_users WHERE disabled_at IS NULL AND password_hash IS NOT NULL`;
    if ((row?.n ?? 0) === 0) {
      console.log('⚠ پنل ادمین: هنوز هیچ ادمینی ثبت نکرده؛ روی سرور ./infra/admin-invite.sh <نام کاربری> بزن.');
    }
    console.log(await keysLine(conn.client, config.secretsKey));
  } catch (error) {
    console.error('✗ پنل ادمین: پایگاه داده جواب نداد:', error instanceof Error ? error.message : error);
  } finally {
    await conn.client.end();
  }
}

/**
 * منبع هر کلید سرویس (۴٫۶، ADR-041): از پنل، از `.env`، خالی، یا «خوانده نشد» (مقدار پنلی که با `SECRETS_KEY` امروز باز
 * نمی‌شود؛ مثلاً `.env` بی پشتیبان از نو ساخته شد). فقط نام‌ها، هرگز مقدار یا بخشی از آن؛ `deploy-bundle.sh` همین را نشان می‌دهد.
 */
async function keysLine(client: import('postgres').Sql, secretsKey: Buffer): Promise<string> {
  const { SERVICE_KEYS, resolveServiceKey } = await import('@jozveyar/db');
  const rows = await client<{ name: string; sealed: string }[]>`SELECT name, sealed FROM service_secrets`;
  const names = { panel: 'از پنل', env: 'از .env', empty: 'خالی', unreadable: 'خوانده نشد' } as const;
  const states = SERVICE_KEYS.map((name) => {
    const row = rows.find((r) => r.name === name);
    const state = resolveServiceKey(name, row ? { name, sealed: row.sealed, updatedAt: new Date(0), updatedBy: null } : null, process.env, secretsKey, () => {});
    return { name, source: state.source };
  });
  const line = states.map(({ name, source }) => `${name} ${names[source]}`).join('، ');
  return states.some((s) => s.source === 'unreadable')
    ? `⚠ پنل ادمین: کلیدهای سرویس‌ها — ${line}؛ SECRETS_KEY عوض شده؟ کلید «خوانده نشد» را از پنل دوباره وارد کن.`
    : `✓ پنل ادمین: کلیدهای سرویس‌ها — ${line}`;
}
