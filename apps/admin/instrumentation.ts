/**
 * یک خط هنگام بالا آمدن پنل، که `deploy-bundle.sh` می‌جوید (تصمیم ۲۳): آماده یا بسته و چرا، و اگر هنوز هیچ
 * ادمینی ثبت نکرده، دستور ساختن اولی؛ از ۴٫۶ منبع هر کلید سرویس، از ۷٫۱ منبع پیامک پنل، از ۷٫۲ درگاه‌های پنل، و از ۷٫۳ راه بازپرداخت و
 * استعلام خودکارش. مسیر محرمانه و هیچ مقدار دیگری از
 * `.env` هرگز در لاگ نیست.
 *
 * مهاجرت و دادهٔ پایه (نقش‌ها و مجوزها) با وب است (`apps/web/instrumentation.ts`)؛ کانتینر پنل بعد از «وب
 * سالم» بالا می‌آید (compose). شکست اینجا پنل را نمی‌کشد، فقط بلند می‌گوید.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { adminConfig, describeConfig, describePayments, describeSms } = await import('./lib/server/config');
  console.log(describeConfig(process.env));
  const config = adminConfig(process.env);
  if (!config) return;
  // بی استوریج، پنل بالا می‌آید و فقط دانلود PDF جزوه (۴٫۲) بسته است؛ بلند، تا بعد از استقرار دیده شود.
  const { storageFromEnv } = await import('@jozveyar/storage');
  if (!storageFromEnv(process.env)) console.log('⚠ پنل ادمین: استوریج (S3_*) پیکربندی نشده؛ دانلود PDF جزوه بسته است.');
  // پیامک پنل (۷٫۱، ADR-049): کنسولی یا sms.ir با `SMS_PROVIDER`، بی مقدار کلید؛ و درگاه‌های پنل (۷٫۲، ADR-050).
  console.log(describeSms(process.env));
  console.log(describePayments(process.env));

  // استعلام خودکار بازپرداخت (۷٫۳): فقط وقتی درگاهی از این پنل بازپرداخت دارد.
  const { startRefundInquiry } = await import('./lib/server/context');
  startRefundInquiry();

  const { createDb } = await import('@jozveyar/db');
  const conn = createDb(config.databaseUrl, { max: 1 });
  try {
    const [row] = await conn.client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM admin_users WHERE disabled_at IS NULL AND password_hash IS NOT NULL`;
    if ((row?.n ?? 0) === 0) {
      console.log('⚠ پنل ادمین: هنوز هیچ ادمینی ثبت نکرده؛ روی سرور ./infra/admin-invite.sh <نام کاربری> بزن.');
    }
    const { isServiceKeyName } = await import('@jozveyar/db');
    const rows = await conn.client<{ name: string; sealed: string }[]>`SELECT name, sealed FROM service_secrets`;
    const secrets: SecretRow[] = rows.flatMap((row) =>
      isServiceKeyName(row.name) ? [{ name: row.name, sealed: row.sealed, updatedAt: new Date(0), updatedBy: null }] : [],
    );
    console.log(await keysLine(secrets, config.secretsKey));
    const checkout = await checkoutLine(conn.client, secrets, config.secretsKey);
    if (checkout) console.log(checkout);
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
async function keysLine(rows: readonly SecretRow[], secretsKey: Buffer): Promise<string> {
  const { SERVICE_KEYS, resolveServiceKey } = await import('@jozveyar/db');
  const names = { panel: 'از پنل', env: 'از .env', empty: 'خالی', unreadable: 'خوانده نشد' } as const;
  const states = SERVICE_KEYS.map((name) => {
    const row = rows.find((r) => r.name === name) ?? null;
    const state = resolveServiceKey(name, row, process.env, secretsKey, () => {});
    return { name, source: state.source };
  });
  const line = states.map(({ name, source }) => `${name} ${names[source]}`).join('، ');
  return states.some((s) => s.source === 'unreadable')
    ? `⚠ پنل ادمین: کلیدهای سرویس‌ها — ${line}؛ SECRETS_KEY عوض شده؟ کلید «خوانده نشد» را از پنل دوباره وارد کن.`
    : `✓ پنل ادمین: کلیدهای سرویس‌ها — ${line}`;
}

type SecretRow = import('@jozveyar/db').ServiceSecretRow;

/**
 * مسیر خرید روی سایت (۷٫۵، ADR-052)، فقط وقتی `.env` همین سرور `live` می‌خواهد: آماده و مخاطب امروز، یا خاموش و چرا؛ همان آمادگی
 * سایت با همین `.env` و همین کلیدها. پنل و وب یک `.env` دارند.
 */
async function checkoutLine(client: import('postgres').Sql, rows: readonly SecretRow[], secretsKey: Buffer): Promise<string | null> {
  const { CHECKOUT_AUDIENCE_SETTING, readSetting, readinessOf } = await import('@jozveyar/db');
  const { describeCheckout } = await import('./lib/server/config');
  const readiness = readinessOf(process.env, rows, secretsKey);
  if (!readiness.requested) return null;
  const [setting] = await client<{ value: unknown }[]>`SELECT value FROM settings WHERE key = ${CHECKOUT_AUDIENCE_SETTING}`;
  return describeCheckout(readiness, await readSetting(async () => setting?.value, CHECKOUT_AUDIENCE_SETTING));
}
