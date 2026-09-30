/**
 * گزارش ارسال (برش ۶٫۴، ADR-048؛ طرح پنل `m-ship-report`): ماه‌های داده‌دار، جمع‌های یک ماه، و بازه‌های وزن گزارش.
 *
 * - **مجوز در سرور، پیش از هر خواندن** (تصمیم‌های ۱۰۵ و ۱۰۶): `reports.read`، فقط مالک (نقش‌ها از کد، ADR-038)؛ نشستی که ندارد
 *   ۴۰۳ می‌گیرد و ذخیره‌گاه صدا زده نمی‌شود. محدودهٔ نشست (ADR-042) هم مثل هر کوئری سفارش پنل، هر چند امروز فقط مالک است.
 * - **ماه‌ها** (تصمیم ۹۹): فقط ماه‌هایی که «تحویل پست شد» دارند (با کد رهگیری یا بی آن)، تازه‌ترین اول؛ ماه جاری «تا امروز».
 *   ماه نشانی (`?month=1405-07`) اگر در فهرست نیست، تازه‌ترین ماه.
 * - **بازه‌های وزن** (تصمیم ۱۰۱): تنظیم `report.weight_bands`؛ `'tariff'` (پیش‌فرض) یعنی مرزهای کرایهٔ پست تعرفهٔ فعال. تغییرش با
 *   سرویس تنظیمات است (`saveReportBands`)، نه اینجا.
 * - **فقط خواندن:** کوئری زنده (`ShippingReportStore`)، بی جدول تازه؛ قیمت و کرایهٔ منجمد دست نمی‌خورند (قاعدهٔ ۶).
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. کوئری‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { REPORT_BANDS_SETTING, bandsSeen, readSetting, type ShippingReportStore } from '@jozveyar/db';
import { DEFAULT_SHIPPING_METHOD_ID } from '@jozveyar/pricing/seed';

import type { Seg } from '../orders';
import {
  aggregateReport,
  monthKey,
  monthLabel,
  monthOf,
  monthRange,
  monthStart,
  monthsBetween,
  parseMonthKey,
  sameMonth,
  type JalaliMonth,
  type ShippingReport,
} from '../report';
import { ZONES } from '../tariff';
import { can, scopeOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelReportDeps {
  store: ShippingReportStore;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** یک ماه در چیپ‌ها. */
export interface ReportMonthChip {
  key: string;
  label: Seg[];
  selected: boolean;
}

/** بازه‌های وزن گزارش، با منبعشان. */
export interface ReportBandsView {
  /** `tariff`: همان مرزهای کرایهٔ تعرفهٔ فعال؛ `custom`: مالک از گزارش گذاشته. */
  source: 'tariff' | 'custom';
  /** مرزهایی که جدول وزن با آن‌ها چیده شده. */
  bounds: number[];
  /** همان که صفحه نشان داد، برای «همان که دیده شد» فرم. */
  seen: string;
  /** مرزهای کرایهٔ تعرفهٔ فعال و شمارهٔ نسخه‌اش؛ null اگر تعرفهٔ فعالی نیست. */
  tariff: { version: number; bounds: number[] } | null;
}

export interface ReportView {
  now: Date;
  /** ماه‌های داده‌دار، تازه‌ترین اول. */
  months: ReportMonthChip[];
  /** ماهی که گزارشش آمده؛ null یعنی هنوز هیچ سفارشی به پست نرسیده. */
  month: JalaliMonth | null;
  /** ماه جاری تهران است («تا امروز»). */
  current: boolean;
  report: ShippingReport | null;
  bands: ReportBandsView;
  /** «بازه‌ها را عوض کن» (تنظیم است: `settings.edit`). */
  canEditBands: boolean;
}

export function createPanelReport(deps: PanelReportDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error ?? ''));
  const { store } = deps;

  return {
    async view(session: AdminSession, params: { month?: string }): Promise<Result<ReportView>> {
      if (!can(session, 'reports.read')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const at = now();
      const [span, setting, tariff] = await Promise.all([
        store.handedSpan(scope),
        readSetting((key) => store.setting(key), REPORT_BANDS_SETTING, log),
        store.tariffBounds(DEFAULT_SHIPPING_METHOD_ID),
      ]);
      const months = span ? monthsBetween(span.first, span.last) : [];
      const counts = months.length > 0 ? await store.handedPerMonth(scope, months.map(monthStart)) : [];
      const withData = months.filter((_, i) => (counts[i] ?? 0) > 0).reverse();
      const asked = parseMonthKey(params.month);
      const month = (asked && withData.find((m) => sameMonth(m, asked))) ?? withData[0] ?? null;
      const today = monthOf(at);
      const bands: ReportBandsView =
        setting === 'tariff'
          ? { source: 'tariff', bounds: tariff?.bounds ?? [], seen: bandsSeen(setting), tariff }
          : { source: 'custom', bounds: setting, seen: bandsSeen(setting), tariff };
      const rows = month ? await store.handedOrders(scope, monthRange(month)) : [];
      return ok({
        now: at,
        months: withData.map((m) => ({ key: monthKey(m), label: monthLabel(m, sameMonth(m, today)), selected: month !== null && sameMonth(m, month) })),
        month,
        current: month !== null && sameMonth(month, today),
        report: month
          ? aggregateReport(
              rows,
              bands.bounds,
              ZONES.map((zone) => zone.id),
            )
          : null,
        bands,
        canEditBands: can(session, 'settings.edit'),
      });
    },
  };
}

export type PanelReport = ReturnType<typeof createPanelReport>;
