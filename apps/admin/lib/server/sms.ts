/**
 * پیامک sms.ir در پنل (برش ۷٫۱، ADR-049؛ طرح `m-settings` و `m-dash7`): کارت «سقف کد پیامکی» و «اعتبار پیامک» در «تنظیمات»، و هشدارهای
 * پیشخوان «سقف روزانهٔ کد پیامکی پر شد» و «اعتبار پیامک کم است».
 *
 * - **اعتبار** از `GET /v1/credit` sms.ir، حداکثر هر ۱۵ دقیقه یک بار (سؤال ۱۴۰)، فقط وقتی پیامک پنل واقعی است (`SMS_PROVIDER=smsir`):
 *   پنل تا آن روز هیچ درخواستی خودش به sms.ir نمی‌فرستد، جز «آزمایش» که مالک می‌زند. آخرین خوانده در حافظهٔ همین پروسه است، نه قفل و
 *   نه منبع حقیقت؛ هر نود خودش می‌خواند. پیشخوان منتظر sms.ir نمی‌ماند (آخرین خوانده، و خواندن تازه در پس‌زمینه)؛ «تنظیمات» می‌ماند.
 * - **سقف کد** از شمردن همان `otp_requests` (ADR-033): کدهای این ساعت و امروز تهران، و کی سقف امروز پر شد.
 * - **مجوز در سرور:** کارت‌های «تنظیمات» با `settings.edit` (مالک)؛ هشدارهای پیشخوان با `orders.money` (مالک و متصدی؛ سؤال ۱۳۸)،
 *   چاپخانه هیچ‌کدام.
 */

import { readSetting, type SmsStatsStore } from '@jozveyar/db';
import { SmsError, type SmsErrorCode } from '@jozveyar/sms';
import { tehranDayStart } from '@jozveyar/text';

import { can, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

/** اعتبار حداکثر هر این‌قدر یک بار خوانده می‌شود (سؤال ۱۴۰). */
export const CREDIT_TTL_MS = 15 * 60_000;
/** «مصرف ۷ روز گذشته» کارت اعتبار. */
export const USAGE_WINDOW_MS = 7 * 86_400_000;

export type CreditState =
  /** پیامک پنل کنسولی است: اعتبار خوانده نمی‌شود. */
  | { kind: 'off' }
  /** هنوز خوانده نشده. */
  | { kind: 'unknown' }
  | { kind: 'ok'; credit: number; at: Date }
  | { kind: 'error'; code: SmsErrorCode; http: number | null; at: Date };

export interface CreditReader {
  /** `wait`: اگر کهنه است، منتظر خواندن تازه («تنظیمات»)؛ وگرنه آخرین خوانده و خواندن تازه در پس‌زمینه (پیشخوان). */
  current(options: { wait: boolean }): Promise<CreditState>;
}

/** خوانندهٔ اعتبار با حافظهٔ ۱۵ دقیقه‌ای؛ دو خواندن هم‌زمان یک درخواست. */
export function createCreditReader(deps: {
  enabled: boolean;
  read: () => Promise<number>;
  now?: () => Date;
  ttlMs?: number;
  log?: (message: string) => void;
}): CreditReader {
  const now = deps.now ?? (() => new Date());
  const ttl = deps.ttlMs ?? CREDIT_TTL_MS;
  let last: CreditState = { kind: 'unknown' };
  let inflight: Promise<CreditState> | null = null;
  const fresh = () => (last.kind === 'ok' || last.kind === 'error') && now().getTime() - last.at.getTime() < ttl;
  const refresh = () =>
    (inflight ??= (async () => {
      try {
        last = { kind: 'ok', credit: await deps.read(), at: now() };
      } catch (error) {
        const code: SmsErrorCode = error instanceof SmsError ? error.code : 'unavailable';
        last = { kind: 'error', code, http: error instanceof SmsError ? error.http : null, at: now() };
        deps.log?.(`✗ اعتبار sms.ir خوانده نشد: ${code}`);
      } finally {
        inflight = null;
      }
      return last;
    })());
  return {
    async current({ wait }) {
      if (!deps.enabled) return { kind: 'off' };
      if (fresh()) return last;
      if (wait) return refresh();
      void refresh();
      return last;
    },
  };
}

export interface PanelSmsDeps {
  stats: SmsStatsStore;
  setting: (key: string) => Promise<unknown>;
  credit: CreditReader;
  /** `SMS_PROVIDER` پنل. */
  provider: 'smsir' | 'console';
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

export interface SmsSettingsView {
  provider: 'smsir' | 'console';
  otp: { hourly: number; daily: number; hour: number; today: number };
  credit: CreditState;
  /** آستانهٔ هشدار (`sms.credit_alert`). */
  alert: number;
  /** پیامک‌های sms.ir هفت روز گذشته و جمع هزینه‌شان. */
  usage: { messages: number; cost: number };
}

export interface SmsAlertsView {
  /** سقف روزانهٔ کل سایت امروز پر شد: سقف و لحظه‌اش. */
  daily: { limit: number; at: Date } | null;
  /** سقف ساعتی کل سایت امروز پر شد. */
  hourly: { limit: number; at: Date } | null;
  /** اعتبار زیر آستانه. */
  credit: { credit: number; threshold: number } | null;
}

export function createPanelSms(deps: PanelSmsDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error ?? ''));
  const limits = () =>
    Promise.all([readSetting(deps.setting, 'otp.site_hourly_limit', log), readSetting(deps.setting, 'otp.site_daily_limit', log)]);

  return {
    /** کارت‌های «سقف کد پیامکی» و «اعتبار پیامک» (فقط مالک). */
    async overview(session: AdminSession): Promise<Result<SmsSettingsView>> {
      if (!can(session, 'settings.edit')) return fail(403, 'forbidden');
      const at = now();
      const [[hourly, daily], usage, credit, alert, spent] = await Promise.all([
        limits(),
        deps.stats.otpUsage(at, tehranDayStart(at)),
        deps.credit.current({ wait: true }),
        readSetting(deps.setting, 'sms.credit_alert', log),
        deps.stats.usage(new Date(at.getTime() - USAGE_WINDOW_MS), 'smsir'),
      ]);
      return ok({ provider: deps.provider, otp: { hourly, daily, hour: usage.hour, today: usage.today }, credit, alert, usage: spent });
    },

    /** هشدارهای پیشخوان (مالک و متصدی): منتظر sms.ir نمی‌ماند. */
    async alerts(session: AdminSession): Promise<SmsAlertsView> {
      const none: SmsAlertsView = { daily: null, hourly: null, credit: null };
      if (!can(session, 'orders.money')) return none;
      const at = now();
      const [[hourly, daily], credit, threshold] = await Promise.all([
        limits(),
        deps.credit.current({ wait: false }),
        readSetting(deps.setting, 'sms.credit_alert', log),
      ]);
      const hits = await deps.stats.otpCapHits(tehranDayStart(at), { hourly, daily });
      return {
        daily: hits.daily ? { limit: daily, at: hits.daily } : null,
        hourly: hits.hourly ? { limit: hourly, at: hits.hourly } : null,
        credit: credit.kind === 'ok' && threshold > 0 && credit.credit < threshold ? { credit: credit.credit, threshold } : null,
      };
    },
  };
}

export type PanelSms = ReturnType<typeof createPanelSms>;
