/**
 * گزارش تولید (برش ۱۰٫۲، ADR-061، سؤال‌های ۲۰۱ و ۲۷۱ تا ۲۷۵): سفارش‌های پرداخت‌شدهٔ یک بازه با جمع‌ها و جدول‌ها، و سند خروجی اکسل و PDF.
 *
 * - **مجوز در سرور، پیش از هر خواندن** (سؤال ۲۷۱): `reports.production`، مالک و حسابدار (همهٔ چاپخانه‌ها) و کاربر چاپخانه (فقط خودش)؛
 *   متصدی نه. نشستی که ندارد ۴۰۳ می‌گیرد و ذخیره‌گاه صدا زده نمی‌شود.
 * - **محدوده** (ADR-042): آرگومان اول ذخیره‌گاه و در خود کوئری؛ کاربر چاپخانه انتخاب چاپخانه ندارد، و چاپخانه‌ای که در نشانی بنویسد
 *   نادیده است (محدوده‌اش همان خودش است).
 * - **مبلغ** فقط با `orders.money` (مالک و حسابدار)، در صفحه و سند هر دو؛ کاربر چاپخانه هرگز (`withoutMoney` ۵٫۳ همین را می‌گوید).
 * - **چاپخانه** (`?p=<شناسه>`): یکی از فهرست چاپخانه‌ها، غیرفعال هم (سفارش‌های گذشته‌اش در گزارش‌اند)؛ شناسهٔ ناشناس یعنی همه، و صفحه
 *   همان «همهٔ چاپخانه‌ها» را نشان می‌دهد.
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. کوئری روی پستگرس در تست یکپارچگی `packages/db`.
 */

import type { ProductionReportStore } from '@jozveyar/db';

import {
  aggregateProduction,
  productionDocument,
  readProductionQuery,
  type ProductionField,
  type ProductionForm,
  type ProductionInputError,
  type ProductionQuery,
  type ProductionReport,
} from '../production';
import type { ReportDocument } from '../reportDocument';
import { can, scopeOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelProductionDeps {
  store: ProductionReportStore;
  now?: () => Date;
}

/** پارامترهای نشانی گزارش. */
export type ProductionParams = { d?: string; from?: string; to?: string; nfrom?: string; nto?: string; p?: string };

/** یک چاپخانه در چیپ‌های گزارش. */
export interface ProductionPartnerChip {
  id: string;
  /** «چاپ نور · مشهد»، و غیرفعال «… (غیرفعال)». */
  label: string;
  selected: boolean;
}

export interface ProductionView {
  now: Date;
  /** بازهٔ خوانده‌شده؛ null یعنی فرم خطا دارد و گزارشی نیامد. */
  query: ProductionQuery | null;
  error: { field: ProductionField; error: ProductionInputError } | null;
  /** فرم همان‌طور که باید دوباره پر شود. */
  form: ProductionForm;
  /** چیپ‌های چاپخانه برای مالک و حسابدار؛ null برای کاربر چاپخانه، که فقط خودش را دارد. */
  partners: ProductionPartnerChip[] | null;
  /** چاپخانهٔ انتخاب‌شده؛ null یعنی همه (یا محدودهٔ خود کاربر چاپخانه). */
  partnerId: string | null;
  /** «همهٔ چاپخانه‌ها»، یا چاپخانهٔ انتخاب‌شده یا خود کاربر چاپخانه: «چاپ نور · مشهد». */
  partnerLabel: string;
  report: ProductionReport | null;
  /** مبلغ دیدنی است (`orders.money`). */
  money: boolean;
}

/** سند خروجی، با دسترسی‌ای که با آن ساخته شد (دانلود PDF همان را دوباره می‌خواهد). */
export interface ExportDocument {
  document: ReportDocument;
  money: boolean;
  /** محدودهٔ خواهنده: چاپخانهٔ کاربر چاپخانه، یا null. */
  printPartnerId: string | null;
}

export const ALL_PARTNERS_LABEL = 'همهٔ چاپخانه‌ها';

export function createPanelProduction(deps: PanelProductionDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  async function view(session: AdminSession, params: ProductionParams): Promise<Result<ProductionView>> {
    if (!can(session, 'reports.production')) return fail(403, 'forbidden');
    const at = now();
    const scope = scopeOf(session);
    const money = can(session, 'orders.money');
    const read = readProductionQuery(params, at);
    const all = await store.partners();
    const own = session.partner ? all.find((partner) => partner.id === session.partner!.id) : null;
    const asked = session.partner ? null : (all.find((partner) => partner.id === params.p) ?? null);
    const labelOf = (partner: { name: string; cityName: string }) => `${partner.name} · ${partner.cityName}`;
    const partners = session.partner
      ? null
      : all.map((partner) => ({
          id: partner.id,
          label: partner.active ? labelOf(partner) : `${labelOf(partner)} (غیرفعال)`,
          selected: partner.id === asked?.id,
        }));
    const partnerLabel = session.partner ? (own ? labelOf(own) : session.partner.name) : asked ? labelOf(asked) : ALL_PARTNERS_LABEL;
    const base = { now: at, partners, partnerId: asked?.id ?? null, partnerLabel, money };
    if (!read.ok) {
      return ok({ ...base, query: null, error: { field: read.field, error: read.error }, form: { ...read.form, partner: asked?.id ?? '' }, report: null });
    }
    const orders = await store.orders(scope, read.query.range, asked?.id ?? null);
    return ok({
      ...base,
      query: read.query,
      error: null,
      form: { ...read.query.form, partner: asked?.id ?? '' },
      report: aggregateProduction(orders),
    });
  }

  return {
    view,

    /** سند خروجی همان گزارشی که صفحه با همین نشانی نشان می‌دهد؛ فرم خطادار یعنی ۴۰۰، چون دکمهٔ خروجی فقط کنار گزارش است. */
    async document(session: AdminSession, params: ProductionParams): Promise<Result<ExportDocument>> {
      const result = await view(session, params);
      if (!result.ok) return result;
      const { query, report, partnerLabel, money, now: at } = result.value;
      if (!query || !report) return fail(400, 'invalid_report_range');
      return ok({
        document: productionDocument({ report, query, partnerLabel, money, made: { at, by: session.displayName } }),
        money,
        printPartnerId: session.partner?.id ?? null,
      });
    },
  };
}

export type PanelProduction = ReturnType<typeof createPanelProduction>;
