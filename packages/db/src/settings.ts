/**
 * تنظیم‌های `settings` در پنل ادمین (برش ۴٫۶، ADR-041): روز کاری تحویل به پست، سقف ساعتی کد پیامکی، تعطیلی‌ها و سالی که
 * تعطیلی‌ها تا آن با تقویم رسمی تطبیق داده شده‌اند.
 *
 * مثل بقیهٔ این پکیج فقط خواندن و نوشتن است؛ سنجش، متن‌ها و مجوز در سرویس تنظیمات پنل
 * (`apps/admin/lib/server/settings.ts`). آنچه اینجاست همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **یک قفل:** هر تغییر زیر یک قفل مشورتی و قفل ردیف. دو افزودن هم‌زمان تعطیلی هر دو می‌مانند؛ بی قفل، دومی فهرستی را
 *    می‌نوشت که اولی را نداشت.
 *  - **همان که دیده شد:** `decide` سرویس مقدار امروز را زیر قفل می‌بیند و خودش می‌گوید بنویسد، کاری نکند، یا رد کند (مقداری
 *    که ادمین دید دیگر نیست).
 *  - **یک تراکنش:** تغییر با رویداد ادمینش.
 *
 * هر خواندن از خود پایگاه داده است، بی کش در حافظه: سایت و پنل، روی هر چند نود، تغییر را با درخواست بعدی می‌بینند.
 */

import { eq, inArray, max, sql } from 'drizzle-orm';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { adminEvents, settings } from './schema.js';

/** کلید قفل مشورتی تغییر تنظیم‌ها: «sett» به عدد. */
const SETTINGS_LOCK = 0x73657474;

/** هدف رویدادهای تنظیم در `admin_events`؛ شناسهٔ هدف نام تنظیم است. */
export const SETTING_TARGET = 'setting';

/** کنندهٔ کار، برای رویداد. */
export interface SettingsActor {
  adminUserId: string;
  ipHash: string | null;
}

/** تصمیم سرویس دربارهٔ مقدار امروز: نوشتن با جزئیات رویداد، هیچ (همین حالا همان است)، یا رد با دلیل. */
export type SettingDecision =
  | { kind: 'write'; value: unknown; detail: Record<string, unknown> }
  | { kind: 'same' }
  | { kind: 'reject'; reason: string; detail?: Record<string, unknown> };

export type SettingChangeResult =
  | { ok: true; written: boolean }
  | { ok: false; reason: string; detail?: Record<string, unknown> };

export interface SettingsStore {
  /** مقدار خام یک تنظیم (jsonb)؛ undefined اگر نیست. شکلش را صدازننده با `readSetting` می‌سنجد. */
  read(key: string): Promise<unknown>;
  /**
   * یک تغییر، در یک تراکنش زیر قفل: مقدار امروز به `decide` می‌رود؛ «نوشتن» مقدار را با رویداد `action` می‌نشاند (ردیفی که
   * نیست ساخته می‌شود)، «همان» کاری نمی‌کند و رویدادی ندارد، و «رد» دلیلش را برمی‌گرداند.
   */
  change(input: {
    key: string;
    action: string;
    decide: (current: unknown) => SettingDecision;
    at: Date;
    actor: SettingsActor;
  }): Promise<SettingChangeResult>;
}

/**
 * آخرین تغییر این تنظیم‌ها (`updated_at`)، یا null اگر هیچ‌کدام ردیف ندارد (برش ۷٫۴). صفحه‌های قوانین و حریم خصوصی سایت روز
 * کاری تحویل به پست و نگهداری فایل‌ها را از `settings` می‌خوانند، پس «به‌روز شده»شان دیرترینِ این و تاریخ خود متن است. «همان» در
 * `change` نمی‌نویسد، پس ذخیرهٔ بی تغییر این تاریخ را جلو نمی‌برد.
 */
export async function settingsChangedAt({ db }: Database, keys: readonly string[]): Promise<Date | null> {
  if (keys.length === 0) return null;
  const [row] = await db
    .select({ at: max(settings.updatedAt) })
    .from(settings)
    .where(inArray(settings.key, [...keys]));
  return row?.at ?? null;
}

export function createSettingsStore({ db }: Database): SettingsStore {
  return {
    async read(key) {
      const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },

    async change(input) {
      return db.transaction(async (tx) => {
        // قفل مشورتی، چون ردیفی که هنوز نیست قفل ردیف ندارد؛ و قفل ردیف، برای هر نوشتنی بیرون از پنل.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETTINGS_LOCK})`);
        const [row] = await tx
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, input.key))
          .for('update');
        const decision = input.decide(row?.value);
        if (decision.kind === 'reject') {
          return { ok: false, reason: decision.reason, ...(decision.detail ? { detail: decision.detail } : {}) } as const;
        }
        if (decision.kind === 'same') return { ok: true, written: false } as const;
        await tx
          .insert(settings)
          .values({ key: input.key, value: decision.value, updatedAt: input.at })
          .onConflictDoUpdate({ target: settings.key, set: { value: decision.value, updatedAt: input.at } });
        await tx.insert(adminEvents).values(
          adminEventRow({
            adminUserId: input.actor.adminUserId,
            action: input.action,
            targetType: SETTING_TARGET,
            targetId: input.key,
            ipHash: input.actor.ipHash,
            detail: decision.detail,
            at: input.at,
          }),
        );
        return { ok: true, written: true } as const;
      });
    },
  };
}
