/**
 * دستور سرور پنل (ADR-037، تصمیم ۱۶): اولین ادمین، و کد ورود تازهٔ هر ادمین (مالکی که گوشی‌اش گم شد).
 * پنل ثبت‌نام ندارد و بازیابی با پیامک یا کد پشتیبان هم نه: هر که به سرور دسترسی دارد، صاحب پنل است.
 *
 *   node apps/admin/dist/cli.mjs invite <نام کاربری> [--owner | --operator] [--name "نام"]
 *
 * روی سرور از راه `./infra/admin-invite.sh`، درون کانتینر پنل و با همان `.env`. ادمین تازه بی نقش صریح
 * مالک است؛ ادمین موجود نقش و نامش را نگه می‌دارد (رمز و برنامهٔ تأیید و نشست‌هایش باطل می‌شوند). خروجی
 * پیوند یک‌باره است، فقط در همین ترمینال: نه لاگ کانتینر، نه پایگاه داده (آنجا فقط هشش).
 *
 * با esbuild در `dist/cli.mjs` بسته می‌شود (`pnpm build:cli`)؛ ایمیج اجرا tsx ندارد. argon2 را بار نمی‌کند:
 * ساختن پیوند رمزی نمی‌سنجد.
 */

import { createAdminStore, createDb } from '@jozveyar/db';
import { formatTehranTime } from '@jozveyar/text';

import { panelPath } from '../lib/gate';
import { messageOf, ROLE_NAMES } from '../lib/messages';
import { createAdminAuth } from '../lib/server/auth';
import { adminConfig, configProblems } from '../lib/server/config';
import type { Passwords } from '../lib/server/password';

const USAGE = `دستور: invite <نام کاربری> [--owner | --operator] [--name "نام"]

  ادمین تازه: پیوند ثبت یک‌باره؛ بی نقش صریح، مالک.
  ادمین موجود: کد ورود تازه؛ رمز و برنامهٔ تأیید قبلی و نشست‌هایش باطل می‌شوند.`;

/** ساختن پیوند رمزی نمی‌سنجد و نمی‌سازد. */
const NO_PASSWORDS: Passwords = {
  hash: () => Promise.reject(new Error('دستور سرور رمز نمی‌سازد.')),
  verify: () => Promise.reject(new Error('دستور سرور رمز نمی‌سنجد.')),
  dummyVerify: () => Promise.reject(new Error('دستور سرور رمز نمی‌سنجد.')),
};

async function main(argv: string[]): Promise<number> {
  const [command, username, ...rest] = argv;
  if (command !== 'invite' || !username || username.startsWith('-')) {
    console.error(USAGE);
    return 2;
  }
  let role: string | undefined;
  let name: string | undefined;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--owner' || arg === '--operator') role = arg.slice(2);
    else if (arg === '--name' && rest[i + 1] !== undefined) name = rest[++i];
    else {
      console.error(USAGE);
      return 2;
    }
  }

  const problems = configProblems(process.env);
  if (problems.length > 0) {
    console.error(`✗ پنل پیکربندی کامل ندارد: ${problems.join('؛ ')}`);
    return 1;
  }
  const config = adminConfig(process.env)!;
  if (!config.origin) {
    console.error('✗ ADMIN_ORIGIN در .env نیست (مثلاً https://admin.jozveyar.com)؛ پیوند بی آن ساخته نمی‌شود.');
    return 1;
  }

  const conn = createDb(config.databaseUrl, { max: 1 });
  try {
    const auth = createAdminAuth({
      store: createAdminStore(conn),
      passwords: NO_PASSWORDS,
      secretsKey: config.secretsKey,
      secret: config.secret,
    });
    const result = await auth.serverInvite({ username, ...(name ? { displayName: name } : {}), ...(role ? { role } : {}) });
    if (!result.ok) {
      console.error(`✗ ${messageOf(result.error)}`);
      return 1;
    }
    const { value } = result;
    const roles = await createAdminStore(conn).rolesOf(value.userId);
    const roleText = roles.map((r) => ROLE_NAMES[r] ?? r).join('، ');
    console.log(
      value.reset
        ? `✓ کد ورود تازه برای ${value.username} (${roleText}) ساخته شد؛ رمز و برنامهٔ تأیید قبلی و نشست‌هایش باطل شد.`
        : `✓ پیوند ثبت برای ${value.username} (${roleText}) ساخته شد.`,
    );
    console.log(`فقط یک بار و تا ساعت ${formatTehranTime(value.expiresAt)} (به وقت تهران) کار می‌کند:\n`);
    console.log(`${config.origin}${panelPath(config.gate, `/invite/${value.token}`)}\n`);
    console.log('در مرورگر خودت بازش کن، یا از راهی خصوصی بفرست؛ نه در گروه.');
    return 0;
  } finally {
    await conn.client.end();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error('✗ دستور شکست خورد:', error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
