/**
 * روشن کردن مسیر خرید روی سایت زنده (برش ۷٫۵، ADR-052): آمادگی `live`، پیش‌نمایش مالک، و «درگاه آماده نیست» (کد ۱۱۵).
 *
 *  - **آمادگی** (`checkoutReadiness`، سؤال ۱۶۱) جای ثابت `LIVE_ADAPTERS_READY` را می‌گیرد: `live` فقط با زیبال و sms.ir در `.env`،
 *    پایگاه داده و `SESSION_SECRET`، پنج کلید خواندنی و خوش‌شکل (پنل بر `.env` مقدم، ADR-041)، و نشانی برگشت درست (سؤال ۱۶۲). وب و پنل
 *    هر دو همین را می‌خوانند، با هر درخواست و بی کش؛ نبودِ هر تکه یعنی خاموش، و پیام فقط نام تکه را دارد، هرگز مقدار.
 *  - **پیش‌نمایش** (`checkout_previews`، سؤال‌های ۱۶۷ و ۱۷۰): پیوند یک‌بارهٔ ۱۵ دقیقه‌ای و کوکی ۲۴ ساعته، از هر دو فقط هش. ساختن زیر
 *    قفل تنظیم‌ها، فقط وقتی مخاطب «پیش‌نمایش مالک» است، با رویداد در همان تراکنش؛ پیوند تازه بازنشده‌های قبلی را می‌بندد.
 *  - **درگاه آماده نیست** (`gatewayRejection`، سؤال ۱۶۶): همان شرط و پنجرهٔ هشدار پیشخوان، یک جا؛ پیشخوان هشدار می‌دهد و سایت برای
 *    مشتری تازه «متوقف» می‌گوید.
 *
 * مثل بقیهٔ این پکیج فقط خواندن و نوشتن است؛ مجوز، کد تازه و متن‌ها در وب و پنل.
 */

import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isZibalMerchant } from '@jozveyar/payments/zibal';
import { isSmsIrApiKey, isSmsIrTemplateId } from '@jozveyar/sms/smsir';

import { adminEventRow } from './admin.js';
import type { Database } from './index.js';
import { GATEWAY_NOT_READY_RESULTS } from './orders.js';
import { CHECKOUT_AUDIENCE_SETTING, readSetting } from './reference.js';
import { adminEvents, adminUsers, checkoutPreviews, orders, payments, settings } from './schema.js';
import {
  resolveServiceKey,
  SERVICE_KEYS,
  type SecretStore,
  type ServiceKeyName,
  type ServiceKeyState,
  type ServiceSecretRow,
} from './secrets.js';
import { SETTINGS_LOCK, SETTING_TARGET, type SettingsActor } from './settings.js';

/* ────────────────────────── آمادگی ────────────────────────── */

/** نشانی برگشت سایت زنده (سؤال ۱۶۲): دقیقاً همین؛ http فقط روی `127.0.0.1` یا `localhost`، برای سرتاسری. */
export const LIVE_CALLBACK_URL = 'https://jozveyar.com/pay/callback';

/** `SESSION_SECRET` کوتاه‌تر از این کلید HMAC کد پیامکی نمی‌شود؛ `bootstrap.sh` ۶۴ رقم hex می‌سازد. */
export const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * نشانی برگشت پذیرفتنی برای `live` (سؤال ۱۶۲): دقیقاً `https://jozveyar.com/pay/callback`، یا برای سرتاسری
 * `http://127.0.0.1:<درگاه>/pay/callback` و `http://localhost:<درگاه>/pay/callback`. هیچ شکل دیگری (اسلش ته، پارامتر، زیردامنه، کاربر).
 */
export function callbackUrlOk(value: string | undefined): boolean {
  const text = value?.trim() ?? '';
  if (text === LIVE_CALLBACK_URL) return true;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
    text === `${url.origin}/pay/callback`
  );
}

/** تکه‌های آمادگی، به ترتیب کارت «مسیر خرید روی سایت» پنل؛ نام هر تکه همان نام `.env`. */
export const READINESS_PARTS = [
  'PAYMENT_PROVIDER',
  'SMS_PROVIDER',
  'PAYMENT_MERCHANT_ID',
  'SMS_API_KEY',
  'SMS_OTP_TEMPLATE',
  'SMS_PAID_TEMPLATE',
  'SMS_TRACKING_TEMPLATE',
  'PAYMENT_CALLBACK_URL',
  'DATABASE_URL',
  'SESSION_SECRET',
] as const;
export type ReadinessPart = (typeof READINESS_PARTS)[number];

/**
 * حال هر تکه: درست؛ نیست (خالی)؛ چیز دیگری خواسته شده (`PAYMENT_PROVIDER=mock`)؛ مقدار پنل که با `SECRETS_KEY` امروز باز نمی‌شود؛ یا
 * شکلش درست نیست (همان سنجش آداپتور، که با این مقدار درخواستی نمی‌فرستاد).
 */
export type ReadinessState = 'ok' | 'empty' | 'other' | 'unreadable' | 'malformed';

export interface CheckoutReadiness {
  /** `.env` سرور `CHECKOUT_MODE=live` می‌خواهد. */
  requested: boolean;
  /** همهٔ تکه‌ها درست‌اند؛ فقط آن‌وقت `live` روشن است. */
  ready: boolean;
  parts: readonly { part: ReadinessPart; state: ReadinessState }[];
}

/** هر کلید با همان سنجش آداپتورش (`isZibalMerchant`، `isSmsIrApiKey`، `isSmsIrTemplateId`). */
const KEY_SHAPE: Record<ServiceKeyName, (value: string) => boolean> = {
  SMS_API_KEY: isSmsIrApiKey,
  SMS_OTP_TEMPLATE: isSmsIrTemplateId,
  SMS_PAID_TEMPLATE: isSmsIrTemplateId,
  SMS_TRACKING_TEMPLATE: isSmsIrTemplateId,
  PAYMENT_MERCHANT_ID: isZibalMerchant,
};

const keyState = (name: ServiceKeyName, state: ServiceKeyState): ReadinessState => {
  if (state.source === 'unreadable') return 'unreadable';
  if (state.source === 'empty') return 'empty';
  return KEY_SHAPE[name](state.value) ? 'ok' : 'malformed';
};

const lowered = (value: string | undefined) => value?.trim().toLowerCase() ?? '';

/**
 * آمادگی `live` (سؤال ۱۶۱): خالص، روی `.env` و ردیف‌های کلید پنل (`null` یعنی پایگاه داده‌ای نیست). صفحهٔ قوانین (قفل با تست)، اعتبار
 * sms.ir و کد ۱۱۵ در فهرست نیستند. لاگ «خوانده نشد» کلیدها اینجا خاموش است: صدازننده خودش فقط با عوض شدن حال لاگ می‌کند.
 */
export function readinessOf(
  env: Readonly<Record<string, string | undefined>>,
  rows: readonly ServiceSecretRow[] | null,
  secretsKey: Buffer | null,
): CheckoutReadiness {
  const requested = lowered(env.CHECKOUT_MODE) === 'live';
  const provider = lowered(env.PAYMENT_PROVIDER);
  const sms = lowered(env.SMS_PROVIDER);
  const states: Record<ReadinessPart, ReadinessState> = {
    PAYMENT_PROVIDER: provider === 'zibal' ? 'ok' : provider ? 'other' : 'empty',
    SMS_PROVIDER: sms === 'smsir' ? 'ok' : sms ? 'other' : 'empty',
    PAYMENT_MERCHANT_ID: 'empty',
    SMS_API_KEY: 'empty',
    SMS_OTP_TEMPLATE: 'empty',
    SMS_PAID_TEMPLATE: 'empty',
    SMS_TRACKING_TEMPLATE: 'empty',
    PAYMENT_CALLBACK_URL: callbackUrlOk(env.PAYMENT_CALLBACK_URL) ? 'ok' : env.PAYMENT_CALLBACK_URL?.trim() ? 'malformed' : 'empty',
    DATABASE_URL: rows && env.DATABASE_URL?.trim() ? 'ok' : 'empty',
    SESSION_SECRET:
      (env.SESSION_SECRET?.length ?? 0) >= MIN_SESSION_SECRET_LENGTH ? 'ok' : env.SESSION_SECRET ? 'malformed' : 'empty',
  };
  for (const name of SERVICE_KEYS) {
    const row = rows?.find((candidate) => candidate.name === name) ?? null;
    states[name] = keyState(name, resolveServiceKey(name, row, env, secretsKey, () => {}));
  }
  const parts = READINESS_PARTS.map((part) => ({ part, state: states[part] }));
  return { requested, ready: requested && parts.every((part) => part.state === 'ok'), parts };
}

/**
 * آمادگی با ردیف‌های کلید همین حالا از پایگاه داده (هر درخواست، بی کش؛ یک پرس‌وجو برای هر پنج کلید). بی پایگاه داده (`store` null)،
 * تکهٔ `DATABASE_URL` خالی است.
 */
export async function checkoutReadiness(
  store: Pick<SecretStore, 'list'> | null,
  env: Readonly<Record<string, string | undefined>>,
  secretsKey: Buffer | null,
): Promise<CheckoutReadiness> {
  return readinessOf(env, store ? await store.list() : null, secretsKey);
}

/** چرا یک تکه درست نیست، با نام `.env`؛ هرگز مقدار. */
export function readinessReason(part: ReadinessPart, state: Exclude<ReadinessState, 'ok'>): string {
  if (part === 'PAYMENT_PROVIDER') return 'PAYMENT_PROVIDER زیبال (zibal) نیست';
  if (part === 'SMS_PROVIDER') return 'SMS_PROVIDER پیامک sms.ir (smsir) نیست';
  if (part === 'DATABASE_URL') return 'پایگاه داده نیست';
  if (part === 'SESSION_SECRET') return 'SESSION_SECRET نیست یا کوتاه است';
  if (part === 'PAYMENT_CALLBACK_URL') return state === 'empty' ? 'PAYMENT_CALLBACK_URL خالی است' : `PAYMENT_CALLBACK_URL دقیقاً ${LIVE_CALLBACK_URL} نیست`;
  if (state === 'unreadable') return `${part} پنل با SECRETS_KEY امروز خوانده نشد`;
  if (state === 'malformed') return `${part} شکل درستی ندارد`;
  return `${part} خالی است`;
}

/** اولین تکه‌ای که درست نیست. */
export function firstMissing(readiness: CheckoutReadiness): { part: ReadinessPart; state: Exclude<ReadinessState, 'ok'> } | null {
  const missing = readiness.parts.find((part) => part.state !== 'ok');
  return missing ? { part: missing.part, state: missing.state as Exclude<ReadinessState, 'ok'> } : null;
}

/**
 * خط لاگ وب (ADR-052): «✓ مسیر خرید: live — زیبال و sms.ir؛ مخاطب از پنل»، یا «✗ مسیر خرید: live خواسته شد ولی SMS_TRACKING_TEMPLATE
 * خالی است — خاموش». `deploy-bundle.sh` همین خط را نشان می‌دهد. null وقتی `live` خواسته نشده.
 */
export function describeReadiness(readiness: CheckoutReadiness): string | null {
  if (!readiness.requested) return null;
  const missing = firstMissing(readiness);
  if (!missing) return '✓ مسیر خرید: live — زیبال و sms.ir؛ مخاطب از پنل';
  return `✗ مسیر خرید: live خواسته شد ولی ${readinessReason(missing.part, missing.state)} — خاموش`;
}

/**
 * لاگ فقط با عوض شدن حال (سؤال ۱۶۱): آمادگی با هر درخواست سنجیده می‌شود، و هر نود حال قبلی خودش را در حافظه دارد. اولین سنجش
 * همیشه لاگ می‌شود.
 */
export function readinessLogger(
  describe: (readiness: CheckoutReadiness) => string | null = describeReadiness,
  log: (line: string) => void = console.log,
): (readiness: CheckoutReadiness) => void {
  let last: string | null | undefined;
  return (readiness) => {
    const line = describe(readiness);
    if (line === last) return;
    last = line;
    if (line) log(line);
  };
}

/* ────────────────────────── مخاطب ────────────────────────── */

/** مخاطب امروز، با پیش‌فرض و مقدار خراب مثل هر تنظیم دیگر (`readSetting`). */
export async function checkoutAudience({ db }: Pick<Database, 'db'>, log?: (message: string, error?: unknown) => void) {
  return readSetting(
    async (key) => {
      const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },
    CHECKOUT_AUDIENCE_SETTING,
    log,
  );
}

/* ────────────────────────── پیش‌نمایش ────────────────────────── */

/** پیوند پیش‌نمایش ۱۵ دقیقه کار می‌کند، و کوکی‌ای که با بازش می‌آید ۲۴ ساعت (سؤال ۱۷۰؛ همان CHECK ها در 0034). */
export const PREVIEW_LINK_TTL_MS = 15 * 60_000;
export const PREVIEW_COOKIE_TTL_MS = 24 * 60 * 60_000;

/** هدف رویداد پیوند پیش‌نمایش در `admin_events`، و نام رویدادهای ۷٫۵ (سؤال ۱۶۹، چیپ «تنظیمات و کلیدها»). */
export const CHECKOUT_AUDIENCE_EVENT = 'settings.checkout_audience';
export const CHECKOUT_PREVIEW_EVENT = 'settings.checkout_preview';

/** آخرین تغییر مخاطب (رویداد `settings.checkout_audience`، سؤال ۱۶۹): کی، کی کرد، از چه به چه، و با کد تازه یا نه. */
export interface AudienceChange {
  at: Date;
  /** نام ادمین؛ null اگر دستور روی سرور بود. */
  by: string | null;
  from: string | null;
  to: string | null;
  fresh: boolean;
}

/** کارت «مسیر خرید روی سایت» («از امروز 10:40، سارا») و سطر پیشخوان؛ null اگر مخاطب هرگز عوض نشده (پیش‌فرض پس از استقرار). */
export async function lastAudienceChange({ db }: Pick<Database, 'db'>): Promise<AudienceChange | null> {
  const [row] = await db
    .select({ at: adminEvents.at, detail: adminEvents.detail, by: adminUsers.displayName })
    .from(adminEvents)
    .leftJoin(adminUsers, eq(adminUsers.id, adminEvents.adminUserId))
    .where(
      and(
        eq(adminEvents.action, CHECKOUT_AUDIENCE_EVENT),
        eq(adminEvents.targetType, SETTING_TARGET),
        eq(adminEvents.targetId, CHECKOUT_AUDIENCE_SETTING),
      ),
    )
    .orderBy(desc(adminEvents.at), desc(adminEvents.id))
    .limit(1);
  if (!row) return null;
  const detail = (row.detail ?? {}) as { from?: unknown; to?: unknown; fresh?: unknown };
  return {
    at: row.at,
    by: row.by ?? null,
    from: typeof detail.from === 'string' ? detail.from : null,
    to: typeof detail.to === 'string' ? detail.to : null,
    fresh: detail.fresh === true,
  };
}

/** توکن پیوند یا کوکی پیش‌نمایش: ۳۲ بایت تصادفی، base64url (۴۳ نویسه). پنل پیوند را می‌سازد و وب کوکی را. */
export const newPreviewToken = (): string => randomBytes(32).toString('base64url');

/** شکل توکن پیوند و کوکی؛ هر چیز دیگر بی پرس‌وجو رد می‌شود. */
export const PREVIEW_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** هشی که `checkout_previews` نگه می‌دارد (sha256، ۶۴ رقم hex کوچک)؛ پنل و وب هر دو همین را می‌سازند. */
export const previewHash = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface CheckoutPreviewStore {
  /**
   * پیوند تازه (سؤال ۱۶۷)، در یک تراکنش زیر قفل تنظیم‌ها: فقط اگر مخاطب امروز «پیش‌نمایش مالک» است؛ بازنشده‌های قبلی بسته می‌شوند
   * (یک پیوند باز در هر زمان)، و رویداد `settings.checkout_preview` با زمان انقضا، بی هش.
   */
  create(input: { tokenHash: string; at: Date; actor: SettingsActor }): Promise<{ ok: true; linkExpiresAt: Date } | { ok: false; reason: 'audience' }>;
  /** پیوندی که هنوز باز می‌شود (صفحهٔ `/preview/<توکن>` با GET، بی مصرف)؛ null یعنی نیست، باز شده، بسته شده یا گذشته. */
  link(tokenHash: string, at: Date): Promise<{ linkExpiresAt: Date } | null>;
  /** باز کردن با POST: یک بار، فقط پیش از انقضا و فقط اگر بسته نشده؛ کوکی تازه با عمر ۲۴ ساعت. null یعنی این پیوند دیگر باز نمی‌شود. */
  open(input: { tokenHash: string; cookieHash: string; at: Date }): Promise<{ cookieExpiresAt: Date } | null>;
  /** کوکی پیش‌نمایش زنده: بازشده، بسته‌نشده و نامنقضی. */
  session(cookieHash: string, at: Date): Promise<{ cookieExpiresAt: Date } | null>;
  /** «خروج از پیش‌نمایش»: ردیف همین کوکی بسته می‌شود (یک بار). false یعنی چیزی برای بستن نبود. */
  close(cookieHash: string, at: Date): Promise<boolean>;
}

export function createCheckoutPreviewStore({ db }: Pick<Database, 'db'>): CheckoutPreviewStore {
  return {
    async create(input) {
      return db.transaction(async (tx) => {
        // همان قفل `change` تنظیم‌ها: پیوند و عوض شدن مخاطب پشت‌سرهم‌اند، پس پیوندی در مخاطب «همه» یا «متوقف» ساخته نمی‌شود.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETTINGS_LOCK})`);
        const [row] = await tx
          .select({ value: settings.value })
          .from(settings)
          .where(eq(settings.key, CHECKOUT_AUDIENCE_SETTING))
          .for('update');
        const audience = await readSetting(async () => row?.value, CHECKOUT_AUDIENCE_SETTING);
        if (audience !== 'preview') return { ok: false, reason: 'audience' } as const;
        await tx
          .update(checkoutPreviews)
          .set({ closedAt: input.at })
          .where(and(isNull(checkoutPreviews.openedAt), isNull(checkoutPreviews.closedAt)));
        const linkExpiresAt = new Date(input.at.getTime() + PREVIEW_LINK_TTL_MS);
        const [created] = await tx
          .insert(checkoutPreviews)
          .values({ tokenHash: input.tokenHash, createdBy: input.actor.adminUserId, createdAt: input.at, linkExpiresAt })
          .returning({ id: checkoutPreviews.id });
        await tx.insert(adminEvents).values(
          adminEventRow({
            adminUserId: input.actor.adminUserId,
            action: CHECKOUT_PREVIEW_EVENT,
            targetType: SETTING_TARGET,
            targetId: CHECKOUT_AUDIENCE_SETTING,
            ipHash: input.actor.ipHash,
            detail: { preview: created!.id, until: linkExpiresAt.toISOString() },
            at: input.at,
          }),
        );
        return { ok: true, linkExpiresAt } as const;
      });
    },

    async link(tokenHash, at) {
      const [row] = await db
        .select({ linkExpiresAt: checkoutPreviews.linkExpiresAt })
        .from(checkoutPreviews)
        .where(
          and(
            eq(checkoutPreviews.tokenHash, tokenHash),
            isNull(checkoutPreviews.openedAt),
            isNull(checkoutPreviews.closedAt),
            gt(checkoutPreviews.linkExpiresAt, at),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async open(input) {
      const cookieExpiresAt = new Date(input.at.getTime() + PREVIEW_COOKIE_TTL_MS);
      const [row] = await db
        .update(checkoutPreviews)
        .set({ openedAt: input.at, cookieHash: input.cookieHash, cookieExpiresAt })
        .where(
          and(
            eq(checkoutPreviews.tokenHash, input.tokenHash),
            isNull(checkoutPreviews.openedAt),
            isNull(checkoutPreviews.closedAt),
            gt(checkoutPreviews.linkExpiresAt, input.at),
          ),
        )
        .returning({ cookieExpiresAt: checkoutPreviews.cookieExpiresAt });
      return row?.cookieExpiresAt ? { cookieExpiresAt: row.cookieExpiresAt } : null;
    },

    async session(cookieHash, at) {
      const [row] = await db
        .select({ cookieExpiresAt: checkoutPreviews.cookieExpiresAt })
        .from(checkoutPreviews)
        .where(
          and(eq(checkoutPreviews.cookieHash, cookieHash), isNull(checkoutPreviews.closedAt), gt(checkoutPreviews.cookieExpiresAt, at)),
        )
        .limit(1);
      return row?.cookieExpiresAt ? { cookieExpiresAt: row.cookieExpiresAt } : null;
    },

    async close(cookieHash, at) {
      const closed = await db
        .update(checkoutPreviews)
        .set({ closedAt: at })
        .where(and(eq(checkoutPreviews.cookieHash, cookieHash), isNull(checkoutPreviews.closedAt)))
        .returning({ id: checkoutPreviews.id });
      return closed.length > 0;
    },
  };
}

/* ────────────────────────── درگاه آماده نیست ────────────────────────── */

/** آخرین ردِ «آماده نیست» درگاه (کد پذیرنده یا IP سرور، `GATEWAY_NOT_READY_RESULTS`) که هنوز رفع نشده. */
export interface GatewayRejection {
  at: Date;
  orderNumber: number | null;
  provider: string;
  result: number;
  /** در شروع پرداخت (رویداد `payments.gateway_rejected`) یا در استعلام (`payments.gateway_error`). */
  stage: 'start' | 'inquiry';
}

const ts = (at: Date) => sql`${at.toISOString()}::timestamptz`;

/**
 * «درگاه آماده نیست» (سؤال‌های ۱۳۹ و ۱۶۶)، یک شرط برای پیشخوان و سایت: تازه‌ترین ردِ ۱۰۲ تا ۱۰۴ یا ۱۱۵ از `since` به بعد، در شروع
 * پرداخت یا در استعلام، که پس از آن نه پرداختی از همان درگاه شروع شده و نه «آزمایش» کد پذیرنده درست بوده. پیشخوان `since` را از
 * پنجرهٔ هشدارهایش می‌دهد (`TRACKING_ALERT_DAYS`)، و سایت همان را.
 */
export async function gatewayRejection({ db }: Pick<Database, 'db'>, since: Date): Promise<GatewayRejection | null> {
  const after = ts(since);
  // پس از آن پرداختی از همان درگاه شروع شد، یا «آزمایش» کد پذیرنده درست بود (سؤال ۱۳۹): درگاه آماده است.
  const ready = (provider: SQL, at: SQL) => sql`(
    EXISTS (SELECT 1 FROM payments p WHERE p.provider = ${provider} AND p.created_at > ${at})
    OR EXISTS (SELECT 1 FROM admin_events k WHERE k.target_type = 'service_key' AND k.target_id = 'PAYMENT_MERCHANT_ID'
      AND k.at > ${at}
      AND ((k.action = 'settings.key_test' AND k.detail ->> 'outcome' = 'ok')
        OR (k.action = 'settings.key_set' AND k.detail ->> 'tested' = 'ok'))))`;
  const later = alias(payments, 'rejected_payment');
  const [rejected, inquired] = await Promise.all([
    db
      .select({ at: adminEvents.at, detail: adminEvents.detail, orderNumber: orders.orderNumber })
      .from(adminEvents)
      .leftJoin(orders, sql`${orders.id}::text = ${adminEvents.targetId}`)
      .where(
        and(
          eq(adminEvents.action, 'payments.gateway_rejected'),
          sql`${adminEvents.at} > ${after}`,
          sql`NOT ${ready(sql`${adminEvents.detail} ->> 'provider'`, sql`${adminEvents.at}`)}`,
        ),
      )
      .orderBy(desc(adminEvents.at))
      .limit(1),
    db
      .select({ at: later.gatewayCheckedAt, error: later.gatewayError, provider: later.provider, orderNumber: orders.orderNumber })
      .from(later)
      .innerJoin(orders, eq(orders.id, later.orderId))
      .where(
        and(
          sql`${later.gatewayError} ~ ${`^rejected:(${GATEWAY_NOT_READY_RESULTS.join('|')})$`}`,
          sql`${later.gatewayCheckedAt} > ${after}`,
          sql`NOT ${ready(sql`${later.provider}`, sql`${later.gatewayCheckedAt}`)}`,
        ),
      )
      .orderBy(desc(later.gatewayCheckedAt))
      .limit(1),
  ]);
  const last = rejected[0];
  const detail = (last?.detail ?? {}) as { provider?: unknown; result?: unknown };
  const fromStart: GatewayRejection | null =
    last && typeof detail.result === 'number'
      ? {
          at: last.at,
          orderNumber: last.orderNumber ?? null,
          provider: typeof detail.provider === 'string' ? detail.provider : '',
          result: detail.result,
          stage: 'start',
        }
      : null;
  const asked = inquired[0];
  const fromInquiry: GatewayRejection | null =
    asked?.at && asked.error
      ? { at: asked.at, orderNumber: asked.orderNumber, provider: asked.provider, result: Number(asked.error.split(':')[1]), stage: 'inquiry' }
      : null;
  // تازه‌ترین از هر دو.
  return fromStart && fromInquiry ? (fromInquiry.at.getTime() > fromStart.at.getTime() ? fromInquiry : fromStart) : (fromStart ?? fromInquiry);
}
