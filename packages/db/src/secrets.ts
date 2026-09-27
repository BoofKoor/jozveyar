/**
 * کلیدهای سرویس‌های بیرونی (برش ۴٫۶، ADR-041): کلید API کاوه‌نگار، قالب کد پیامکی و کد پذیرندهٔ زیبال. امروز در `.env`
 * سرورند؛ مالک از پنل هم می‌گذاردشان، مهروموم‌شده با `SECRETS_KEY`، و مقدار پنل بر `.env` مقدم است.
 *
 *  - **فقط این سه نام** (`SERVICE_KEYS`؛ همان CHECK `service_secrets_name`): نه `CHECKOUT_MODE`، نه `SMS_PROVIDER` و
 *    `PAYMENT_PROVIDER`، نه رمزهای خود سرور.
 *  - **مهروموم به جای ردیف** (AAD `service_secrets:<نام>`): مقدار یک کلید در ردیف کلید دیگر باز نمی‌شود.
 *  - **خواندن با هر استفاده** (`readServiceKey`)، بی کش در حافظه: کلیدی که از پنل عوض شد بی ری‌استارت و روی هر نود همان
 *    است. آداپتورهای پیامک و درگاه واقعی (برش ۷) همین را می‌خوانند؛ امروز فقط پنل، برای نشان دادن منبع و ۴ نویسهٔ آخر.
 *  - **«خوانده نشد»، نه خالی بی‌صدا:** مقدار پنلی که با `SECRETS_KEY` امروز باز نمی‌شود نه به `.env` برمی‌گردد و نه خالی
 *    می‌شود؛ بلند در لاگ (فقط نام کلید، هرگز مقدار).
 *
 * ذخیره‌گاه مثل بقیهٔ این پکیج فقط خواندن و نوشتن است؛ مجوز، کد تازه و سنجش مقدار در سرویس تنظیمات پنل. نوشتن و پاک کردن
 * زیر قفل، با `verify` («همان که دیده شد») و رویداد در همان تراکنش؛ رویداد نام کلید را دارد، نه مقدارش.
 */

import { eq, sql } from 'drizzle-orm';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { adminEvents, adminUsers, serviceSecrets } from './schema.js';
import { unseal } from './sealed.js';

/** کلید قفل مشورتی کلیدهای سرویس‌ها: «keys» به عدد. */
const SECRETS_LOCK = 0x6b657973;

/** کلیدهایی که پنل نگه می‌دارد، به ترتیب صفحهٔ تنظیمات؛ همان نام‌های `.env`. */
export const SERVICE_KEYS = ['SMS_API_KEY', 'SMS_OTP_TEMPLATE', 'PAYMENT_MERCHANT_ID'] as const;
export type ServiceKeyName = (typeof SERVICE_KEYS)[number];

export const isServiceKeyName = (value: unknown): value is ServiceKeyName =>
  typeof value === 'string' && (SERVICE_KEYS as readonly string[]).includes(value);

/** جای مهروموم هر کلید (AAD). */
export const serviceKeyContext = (name: ServiceKeyName) => `service_secrets:${name}`;

/** هدف رویدادهای کلید در `admin_events`؛ شناسهٔ هدف نام کلید است. */
export const SERVICE_KEY_TARGET = 'service_key';

export interface ServiceSecretRow {
  name: ServiceKeyName;
  sealed: string;
  updatedAt: Date;
  /** ادمینی که گذاشت. */
  updatedBy: { id: string; name: string } | null;
}

/** کنندهٔ کار، برای رویداد. */
export interface SecretActor {
  adminUserId: string;
  ipHash: string | null;
}

export interface SecretStore {
  /** مقدارهای پنل، مهروموم‌شده. */
  list(): Promise<ServiceSecretRow[]>;
  read(name: ServiceKeyName): Promise<ServiceSecretRow | null>;
  /**
   * مقدار پنل یک کلید، در یک تراکنش زیر قفل: فقط اگر `verify` مقدار امروز (مهروموم‌شده، یا null اگر مقدار پنلی نیست) را
   * می‌پذیرد؛ با رویداد `settings.key_set` و `detail` سرویس، بی مقدار.
   */
  put(input: {
    name: ServiceKeyName;
    sealed: string;
    verify: (current: string | null) => boolean;
    at: Date;
    actor: SecretActor;
    detail: Record<string, unknown>;
  }): Promise<'ok' | 'changed'>;
  /** «برگرداندن به .env»: مقدار پنل پاک، با رویداد `settings.key_revert`؛ فقط اگر `verify` مقدار امروز را می‌پذیرد. */
  remove(input: {
    name: ServiceKeyName;
    verify: (current: string | null) => boolean;
    at: Date;
    actor: SecretActor;
    detail: Record<string, unknown>;
  }): Promise<'ok' | 'changed'>;
}

export function createSecretStore({ db }: Database): SecretStore {
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const rowsOf = async (where?: ReturnType<typeof eq>) => {
    const rows = await db
      .select({ secret: serviceSecrets, adminName: adminUsers.displayName })
      .from(serviceSecrets)
      .leftJoin(adminUsers, eq(adminUsers.id, serviceSecrets.updatedBy))
      .where(where);
    return rows.flatMap(({ secret, adminName }): ServiceSecretRow[] =>
      isServiceKeyName(secret.name)
        ? [
            {
              name: secret.name,
              sealed: secret.sealed,
              updatedAt: secret.updatedAt,
              updatedBy: secret.updatedBy ? { id: secret.updatedBy, name: adminName ?? '' } : null,
            },
          ]
        : [],
    );
  };

  /** مقدار امروز زیر قفل؛ null یعنی مقدار پنلی نیست. */
  async function lockedCurrent(tx: Tx, name: ServiceKeyName): Promise<string | null> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SECRETS_LOCK})`);
    const [row] = await tx
      .select({ sealed: serviceSecrets.sealed })
      .from(serviceSecrets)
      .where(eq(serviceSecrets.name, name))
      .for('update');
    return row?.sealed ?? null;
  }

  const event = (action: string, name: ServiceKeyName, at: Date, actor: SecretActor, detail: Record<string, unknown>) =>
    adminEventRow({
      adminUserId: actor.adminUserId,
      action,
      targetType: SERVICE_KEY_TARGET,
      targetId: name,
      ipHash: actor.ipHash,
      detail: { ...detail, name },
      at,
    });

  return {
    list: () => rowsOf(),

    async read(name) {
      return (await rowsOf(eq(serviceSecrets.name, name)))[0] ?? null;
    },

    async put(input) {
      return db.transaction(async (tx) => {
        if (!input.verify(await lockedCurrent(tx, input.name))) return 'changed' as const;
        await tx
          .insert(serviceSecrets)
          .values({ name: input.name, sealed: input.sealed, updatedAt: input.at, updatedBy: input.actor.adminUserId })
          .onConflictDoUpdate({
            target: serviceSecrets.name,
            set: { sealed: input.sealed, updatedAt: input.at, updatedBy: input.actor.adminUserId },
          });
        await tx.insert(adminEvents).values(event('settings.key_set', input.name, input.at, input.actor, input.detail));
        return 'ok' as const;
      });
    },

    async remove(input) {
      return db.transaction(async (tx) => {
        const current = await lockedCurrent(tx, input.name);
        if (current === null || !input.verify(current)) return 'changed' as const;
        await tx.delete(serviceSecrets).where(eq(serviceSecrets.name, input.name));
        await tx.insert(adminEvents).values(event('settings.key_revert', input.name, input.at, input.actor, input.detail));
        return 'ok' as const;
      });
    },
  };
}

/** منبع مقداری که یک کلید امروز دارد. */
export type ServiceKeyState =
  | { source: 'panel'; value: string; row: ServiceSecretRow }
  /** مقدار پنل هست ولی با `SECRETS_KEY` امروز باز نمی‌شود (نیست، عوض شده، یا ردیف دستکاری شده). */
  | { source: 'unreadable'; value: null; row: ServiceSecretRow }
  | { source: 'env'; value: string }
  | { source: 'empty'; value: null };

/**
 * مقدار یک کلید: پنل بر `.env` مقدم (ADR-041). مقدار پنلی که باز نمی‌شود «خوانده نشد» است، نه `.env` و نه خالی: کلیدی که
 * مالک عمداً عوض کرده بی‌صدا به کلید کهنه برنمی‌گردد. لاگ فقط نام کلید را دارد. مقدار `.env` بی فاصلهٔ دو سر؛ خالی یعنی نیست.
 */
export function resolveServiceKey(
  name: ServiceKeyName,
  row: ServiceSecretRow | null,
  env: Readonly<Record<string, string | undefined>>,
  secretsKey: Buffer | null,
  log: (message: string) => void = console.error,
): ServiceKeyState {
  if (row) {
    if (!secretsKey) {
      log(`✗ کلید ${name} پنل خوانده نشد: SECRETS_KEY نیست یا ۶۴ رقم hex نیست.`);
      return { source: 'unreadable', value: null, row };
    }
    try {
      return { source: 'panel', value: unseal(secretsKey, row.sealed, serviceKeyContext(name)), row };
    } catch {
      log(`✗ کلید ${name} پنل با SECRETS_KEY امروز باز نشد؛ SECRETS_KEY عوض شده؟`);
      return { source: 'unreadable', value: null, row };
    }
  }
  const fromEnv = env[name]?.trim() ?? '';
  return fromEnv ? { source: 'env', value: fromEnv } : { source: 'empty', value: null };
}

/** همان `resolveServiceKey`، با خواندن ردیف همین حالا از پایگاه داده (هر استفاده، بی کش). */
export async function readServiceKey(
  store: Pick<SecretStore, 'read'>,
  name: ServiceKeyName,
  env: Readonly<Record<string, string | undefined>>,
  secretsKey: Buffer | null,
  log?: (message: string) => void,
): Promise<ServiceKeyState> {
  return resolveServiceKey(name, await store.read(name), env, secretsKey, log);
}
