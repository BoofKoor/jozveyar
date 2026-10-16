/**
 * «تخفیف‌ها»ی پنل (برش ۱۱٫۴، ADR-062؛ سؤال‌های ۲۰۹ و ۲۹۸ تا ۳۰۲): فهرست کدها با شمار استفاده و رزرو، صفحهٔ هر کد با سفارش‌هایش، و
 * ساختن و ویرایش.
 *
 * - **مجوز در سرور** (ADR-038): دیدن با `discounts.read` (مالک و حسابدار)، ساختن و عوض کردن با `discounts.manage` (فقط مالک).
 * - **کد تازه** (`stepUp`، سؤال ۳۰۲): ساختن و هر تغییر، جز «خاموش کردن» تنها، که کد تازه نمی‌خواهد؛ کد تازه پس از هر سنجشی که بی کد
 *   جواب دارد، تا کد هدر نرود؛ کد خالی `discount_code_required` بی `stepUp`. کد تخفیف پول است، و نشست دزدیده‌شده بی برنامهٔ تأیید کد
 *   صددرصدی نمی‌سازد.
 * - **همان که دیده شد:** ویرایش زمان آخرین تغییری را که مالک دید می‌فرستد (`seen`)، و ذخیره‌گاه زیر قفل ردیف می‌سنجدش.
 * - **رویداد** `discounts.create` و `discounts.update` در همان تراکنش، با متن کد، آنچه عوض شد و روشن یا خاموش، بی مبلغ.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. قفل و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { FROZEN_TERMS, type AdminEventInput, type DiscountCodeInput, type DiscountCodeView, type DiscountOrderView, type DiscountStore } from '@jozveyar/db';

import { discountFormOf, onlyDisables, readDiscountForm, termsOfRow, type DiscountField, type DiscountForm } from '../discounts';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelDiscountsDeps {
  store: DiscountStore;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

export interface DiscountPage {
  now: Date;
  code: DiscountCodeView;
  orders: DiscountOrderView[];
  /** فقط مالک ویرایش می‌کند. */
  canManage: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** فیلد فرم هر شرطی که از اولین سفارش منجمد است (`FROZEN_TERMS`). */
const FROZEN_FIELDS: Record<(typeof FROZEN_TERMS)[number], DiscountField> = {
  kind: 'kind',
  percent: 'percent',
  maxDiscountRials: 'max',
  amountRials: 'amount',
  minOrderRials: 'minOrder',
};

/** اولین شرط منجمدی که فرم عوض کرده، با فیلدش؛ null یعنی هیچ. */
function frozenChange(before: DiscountCodeInput, next: DiscountCodeInput): DiscountField | null {
  const key = FROZEN_TERMS.find((term) => before[term] !== next[term]);
  return key ? FROZEN_FIELDS[key] : null;
}

/** کد برنامهٔ تأیید خالی: بی `stepUp`، چون هر کد نادرست یک اشتباه از سقف قفل است و خالی اشتباه نیست، فراموش شده. */
const blank = (code: unknown) => typeof code !== 'string' || code.trim() === '';

/** کار ذخیره: فیلدهای فرم HTML، کد تازه، و برای ویرایش زمان آخرین تغییری که دیده شد (میلی‌ثانیه). */
export interface DiscountWriteInput {
  entries: Iterable<[string, unknown]>;
  code: unknown;
  seen?: unknown;
}

export function createPanelDiscounts(deps: PanelDiscountsDeps) {
  const now = deps.now ?? (() => new Date());
  const event = (session: AdminSession, action: string, ip: string, at: Date, detail: Record<string, unknown>): AdminEventInput => ({
    adminUserId: session.userId,
    action,
    targetType: 'discount',
    targetId: null,
    ipHash: ipHashOf(deps.secret, ip),
    at,
    detail,
  });
  const formFailure = (field: DiscountField, error: Parameters<typeof fail>[1]) => fail(400, error, { field });

  return {
    async list(session: AdminSession): Promise<Result<{ now: Date; codes: DiscountCodeView[]; canManage: boolean }>> {
      if (!can(session, 'discounts.read')) return fail(403, 'forbidden');
      return ok({ now: now(), codes: await deps.store.list(), canManage: can(session, 'discounts.manage') });
    },

    async page(session: AdminSession, idParam: string): Promise<Result<DiscountPage>> {
      if (!can(session, 'discounts.read')) return fail(403, 'forbidden');
      if (!UUID.test(idParam)) return fail(404, 'discount_not_found');
      const code = await deps.store.find(idParam);
      if (!code) return fail(404, 'discount_not_found');
      return ok({ now: now(), code, orders: await deps.store.ordersOf(code.id), canManage: can(session, 'discounts.manage') });
    },

    /** «کد تازه»: فرم سنجیده، بعد کد تازه، بعد ذخیره با رویداد. */
    async create(session: AdminSession, input: DiscountWriteInput, ip: string): Promise<Result<{ id: string }>> {
      if (!can(session, 'discounts.manage')) return fail(403, 'forbidden');
      const form: DiscountForm = discountFormOf(input.entries);
      const checked = readDiscountForm(form, true);
      if (!checked.ok) return formFailure(checked.field, checked.error);
      if (await deps.store.codeTaken(checked.code!)) return formFailure('discount', 'discount_code_taken');
      if (blank(input.code)) return fail(400, 'discount_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const at = now();
      const written = await deps.store.create({
        code: checked.code!,
        terms: checked.terms,
        createdBy: session.userId,
        event: event(session, 'discounts.create', ip, at, { code: checked.code }),
      });
      if (!written.ok) return formFailure('discount', 'discount_code_taken');
      return ok({ id: written.code.id });
    },

    /**
     * ویرایش، از همان که مالک دید (`seen`). «خاموش کردن» تنها کد تازه نمی‌خواهد؛ هر تغییر دیگر می‌خواهد. بی تغییر، بی رویداد. شرطی که از
     * اولین سفارش منجمد است `discount_terms_frozen`، با جای همان فیلد.
     */
    async update(session: AdminSession, idParam: string, input: DiscountWriteInput, ip: string): Promise<Result<{ changed: boolean }>> {
      if (!can(session, 'discounts.manage')) return fail(403, 'forbidden');
      if (!UUID.test(idParam)) return fail(404, 'discount_not_found');
      const current = await deps.store.find(idParam);
      if (!current) return fail(404, 'discount_not_found');
      const seen = Number(input.seen);
      if (!Number.isSafeInteger(seen) || seen !== current.updatedAt.getTime()) return fail(409, 'discount_changed');
      const checked = readDiscountForm(discountFormOf(input.entries), false);
      if (!checked.ok) return formFailure(checked.field, checked.error);
      const before = termsOfRow(current);
      // شرط منجمد پیش از کد تازه (سؤال ۳۰۲)، تا کد هدر نرود؛ ذخیره‌گاه زیر قفل دوباره می‌سنجد.
      const frozen = frozenChange(before, checked.terms);
      if (frozen && (await deps.store.ordersOf(current.id)).length > 0) return formFailure(frozen, 'discount_terms_frozen');
      if (!onlyDisables(before, checked.terms)) {
        if (blank(input.code)) return fail(400, 'discount_code_required', { field: 'code' });
        const stepped = await deps.stepUp(session, input.code, ip);
        if (!stepped.ok) return stepped;
      }
      const written = await deps.store.update({
        id: current.id,
        seenUpdatedAt: current.updatedAt,
        terms: checked.terms,
        event: event(session, 'discounts.update', ip, now(), { code: current.code, enabled: checked.terms.enabled }),
      });
      if (written.ok) return ok({ changed: written.code.updatedAt.getTime() !== current.updatedAt.getTime() });
      if (written.reason === 'terms_frozen') return formFailure(frozen ?? 'kind', 'discount_terms_frozen');
      if (written.reason === 'not_found') return fail(404, 'discount_not_found');
      return fail(409, 'discount_changed');
    },

    /** «خاموش کن» از فهرست یا صفحهٔ کد: همان ویرایش با همهٔ شرط‌های امروز و خاموش، بی کد تازه. */
    async disable(session: AdminSession, idParam: string, seenInput: unknown, ip: string): Promise<Result<{ changed: boolean }>> {
      if (!can(session, 'discounts.manage')) return fail(403, 'forbidden');
      if (!UUID.test(idParam)) return fail(404, 'discount_not_found');
      const current = await deps.store.find(idParam);
      if (!current) return fail(404, 'discount_not_found');
      const seen = Number(seenInput);
      if (!Number.isSafeInteger(seen) || seen !== current.updatedAt.getTime()) return fail(409, 'discount_changed');
      if (!current.enabled) return ok({ changed: false });
      const written = await deps.store.update({
        id: current.id,
        seenUpdatedAt: current.updatedAt,
        terms: { ...termsOfRow(current), enabled: false },
        event: event(session, 'discounts.update', ip, now(), { code: current.code, enabled: false }),
      });
      if (written.ok) return ok({ changed: true });
      return fail(written.reason === 'not_found' ? 404 : 409, written.reason === 'not_found' ? 'discount_not_found' : 'discount_changed');
    },
  };
}

export type PanelDiscounts = ReturnType<typeof createPanelDiscounts>;
