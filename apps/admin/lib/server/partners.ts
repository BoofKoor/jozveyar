/**
 * زبانهٔ «چاپخانه‌ها» (برش ۵٫۲، ADR-042؛ طرح `m-partners` و `m-partner-edit`): فهرست با شهر و سفارش‌های باز، افزودن و ویرایش
 * نام و شهر، «پیش‌فرض کن»، و غیرفعال یا دوباره فعال کردن.
 *
 * - **فقط مالک** (`partners.manage`)، و در سرور، نه فقط پنهان کردن زبانه (ADR-038). کد تازه نمی‌خواهد: چاپخانه به‌تنهایی به
 *   کسی دسترسی نمی‌دهد، و هر کار برگشت‌پذیر است (سؤال ۳۵).
 * - **نام و شهر** فارسی‌نرمال؛ شهر از همان فهرست شهرهای سایت (`pickCity`). ویرایش از همان نام و شهری که مالک دید: اگر همین
 *   حالا جای دیگری عوض شده، هیچ نوشته نمی‌شود.
 * - **غیرفعال کردن** فقط وقتی سفارش باز ندارد و پیش‌فرض نیست؛ پایگاه داده هم می‌سنجد (`print_partners_guard`).
 * - **رویداد:** هر کار یک ردیف `admin_events` با هدف `partner`، در همان تراکنش (چیپ «چاپخانه‌ها» در «رویدادها»).
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید (`PartnerStore`)، پس با ذخیره‌گاه ساختگی تست می‌شود. تراکنش‌ها و محافظ‌ها روی پستگرس در
 * تست یکپارچگی `packages/db`.
 */

import type { AdminEventInput, PartnerStore, PartnerView } from '@jozveyar/db';
import type { City } from '@jozveyar/geo';

import { partnerNameOf, pickCity } from '../partners';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelPartnersDeps {
  store: PartnerStore;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

/** فرم افزودن و ویرایش: نام و متن فیلد شهر؛ ویرایش نام و شهری را هم دارد که مالک دید. */
export interface PartnerForm {
  name: unknown;
  city: unknown;
  seenName?: unknown;
  seenCity?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);

/** خطای فرم با جای آن و پیشنهادهای شهر، تا فرم همان‌جا نشانش دهد. */
function formError(form: PartnerForm): Result<never> | { name: string; city: City } {
  const name = partnerNameOf(form.name);
  const city = pickCity(form.city);
  if (!name) return fail(400, 'invalid_partner_name', { field: 'name' });
  if (!city.ok) {
    return fail(400, city.reason === 'empty' ? 'city_required' : 'invalid_city', {
      field: 'city',
      suggestions: city.suggestions.map((c) => c.id),
    });
  }
  return { name, city: city.city };
}

export function createPanelPartners(deps: PanelPartnersDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const event = (session: AdminSession, action: string, ip: string, at: Date, targetId: string | null = null): AdminEventInput => ({
    adminUserId: session.userId,
    action,
    targetType: 'partner',
    targetId,
    ipHash: ipHashOf(deps.secret, ip),
    at,
  });

  return {
    async list(session: AdminSession): Promise<Result<PartnerView[]>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      return ok(await store.list());
    },

    async find(session: AdminSession, idParam: string): Promise<Result<PartnerView>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      const partner = id ? await store.find(id) : null;
      return partner ? ok(partner) : fail(404, 'partner_not_found');
    },

    /** چاپخانهٔ تازه: فعال، نه پیش‌فرض. */
    async create(session: AdminSession, form: PartnerForm, ip: string): Promise<Result<{ id: string }>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const checked = formError(form);
      if ('ok' in checked) return checked;
      const at = now();
      const written = await store.create({
        name: checked.name,
        provinceId: checked.city.provinceId,
        cityId: checked.city.id,
        at,
        createdBy: session.userId,
        event: event(session, 'partners.create', ip, at),
      });
      if (!written.ok) return fail(409, 'partner_name_taken', { field: 'name' });
      return ok({ id: written.partner.id });
    },

    /** نام و شهر، از همان که مالک دید. بی تغییر، بی رویداد. */
    async update(session: AdminSession, idParam: string, form: PartnerForm, ip: string): Promise<Result<{ changed: string[] }>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'partner_not_found');
      const checked = formError(form);
      if ('ok' in checked) return checked;
      const seenCity = Number(form.seenCity);
      if (typeof form.seenName !== 'string' || !Number.isInteger(seenCity)) return fail(409, 'partner_changed');
      const written = await store.update({
        id,
        seen: { name: form.seenName, cityId: seenCity },
        name: checked.name,
        provinceId: checked.city.provinceId,
        cityId: checked.city.id,
        event: event(session, 'partners.update', ip, now(), id),
      });
      if (written.ok) return ok({ changed: written.changed });
      if (written.reason === 'not_found') return fail(404, 'partner_not_found');
      if (written.reason === 'name_taken') return fail(409, 'partner_name_taken', { field: 'name' });
      return fail(409, 'partner_changed');
    },

    async setDefault(session: AdminSession, idParam: string, ip: string): Promise<Result<true>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'partner_not_found');
      const done = await store.setDefault({ id, event: event(session, 'partners.default', ip, now(), id) });
      if (done === 'not_found') return fail(404, 'partner_not_found');
      if (done === 'inactive') return fail(409, 'partner_inactive');
      return ok(true);
    },

    async deactivate(session: AdminSession, idParam: string, ip: string): Promise<Result<true>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'partner_not_found');
      const at = now();
      const done = await store.deactivate({ id, at, event: event(session, 'partners.deactivate', ip, at, id) });
      if (done === 'not_found') return fail(404, 'partner_not_found');
      if (done === 'default') return fail(409, 'partner_is_default');
      if (done === 'open_orders') return fail(409, 'partner_has_orders');
      return ok(true);
    },

    async activate(session: AdminSession, idParam: string, ip: string): Promise<Result<true>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'partner_not_found');
      const done = await store.activate({ id, event: event(session, 'partners.activate', ip, now(), id) });
      return done === 'not_found' ? fail(404, 'partner_not_found') : ok(true);
    },
  };
}

export type PanelPartners = ReturnType<typeof createPanelPartners>;
