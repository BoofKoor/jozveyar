/**
 * زبانهٔ «چاپخانه‌ها» (برش ۵٫۲، ADR-042؛ طرح `m-partners` و `m-partner-edit`): فهرست با شهر و سفارش‌های باز، افزودن و ویرایش
 * نام و شهر، «پیش‌فرض کن»، و غیرفعال یا دوباره فعال کردن.
 *
 * - **فقط مالک** (`partners.manage`)، و در سرور، نه فقط پنهان کردن زبانه (ADR-038). کد تازه نمی‌خواهد: چاپخانه به‌تنهایی به
 *   کسی دسترسی نمی‌دهد، و هر کار برگشت‌پذیر است (سؤال ۳۵).
 * - **نام و شهر** فارسی‌نرمال؛ شهر از همان فهرست شهرهای سایت (`pickCity`). ویرایش از همان نام و شهری که مالک دید: اگر همین
 *   حالا جای دیگری عوض شده، هیچ نوشته نمی‌شود.
 * - **موبایل اعلان** (برش ۷٫۶، سؤال‌های ۱۲۶ و ۱۷۷): اختیاری، در همان فرم و با همان «همان که دیدی». شمارهٔ تازه فقط برای سفارش‌های
 *   بعدی است؛ در رویداد پوشیده («0915 ••• 4567»)، چون رویدادها را متصدی هم می‌بیند.
 * - **غیرفعال کردن** فقط وقتی سفارش باز ندارد و پیش‌فرض نیست؛ پایگاه داده هم می‌سنجد (`print_partners_guard`).
 * - **رویداد:** هر کار یک ردیف `admin_events` با هدف `partner`، در همان تراکنش (چیپ «چاپخانه‌ها» در «رویدادها»).
 * - **در دسترس بودن** (برش ۱۰٫۱، سؤال‌های ۲۰۰ و ۲۶۶ تا ۲۶۸): «باز»، «شلوغ» یا «تعطیل از … تا …» با یادداشت. مجوز جدا
 *   (`partners.availability`): مالک و متصدی برای هر چاپخانه، و کاربر چاپخانه فقط برای خودش (چاپخانهٔ دیگر برایش همان «نیست» است، ۴۰۴).
 *   بی کد تازه، از همان که دیده شد، و فقط چاپخانهٔ فعال.
 * - **درصد سهم** (برش ۱۰٫۳، سؤال ۳۹۱): فقط مالک، و با کد تازه، چون عددی است که پول چاپخانه از آن درمی‌آید؛ کد پس از هر سنجش بی کد. فقط
 *   سپردن‌های بعدی را عوض می‌کند: سهم هر سفارش هنگام تخصیص منجمد است.
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید (`PartnerStore`)، پس با ذخیره‌گاه ساختگی تست می‌شود. تراکنش‌ها و محافظ‌ها روی پستگرس در
 * تست یکپارچگی `packages/db`.
 */

import { sameAvailability, type AdminEventInput, type AvailabilityState, type PartnerStore, type PartnerView } from '@jozveyar/db';
import type { City } from '@jozveyar/geo';

import { availabilityOf, availabilitySeen, availabilityStateOf, partnerMobileOf, partnerNameOf, pickCity } from '../partners';
import { maskMobile } from '../settings';
import { readSharePercent, shareSeenOf } from '../settlement';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelPartnersDeps {
  store: PartnerStore;
  /** کد تازهٔ برنامهٔ تأیید برای درصد سهم (۱۰٫۳)؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

/** فرم درصد سهم (۱۰٫۳): درصد تایپ‌شده، درصدی که مالک دید (`shareSeen`) و کد تازه. */
export interface ShareForm {
  share: unknown;
  seen: unknown;
  code: unknown;
}

/** فرم افزودن و ویرایش: نام، متن فیلد شهر و موبایل اعلان؛ ویرایش نام، شهر و موبایلی را هم دارد که مالک دید. */
export interface PartnerForm {
  name: unknown;
  city: unknown;
  /** موبایل اعلان (برش ۷٫۶)؛ خالی یعنی بی پیامک. */
  mobile?: unknown;
  seenName?: unknown;
  seenCity?: unknown;
  /** موبایل اعلانی که مالک دید؛ خالی یعنی نداشت. */
  seenMobile?: unknown;
}

/** فرم در دسترس بودن (برش ۱۰٫۱): حال، روز اول و آخر تعطیل، یادداشت، و حالی که ادمین دید (`availabilitySeen`). */
export interface AvailabilityForm {
  availability: unknown;
  from: unknown;
  until: unknown;
  note: unknown;
  seen: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);

/** خطای فرم با جای آن و پیشنهادهای شهر، تا فرم همان‌جا نشانش دهد. */
function formError(form: PartnerForm): Result<never> | { name: string; city: City; mobile: string | null } {
  const name = partnerNameOf(form.name);
  const city = pickCity(form.city);
  const mobile = partnerMobileOf(form.mobile);
  if (!name) return fail(400, 'invalid_partner_name', { field: 'name' });
  if (!city.ok) {
    return fail(400, city.reason === 'empty' ? 'city_required' : 'invalid_city', {
      field: 'city',
      suggestions: city.suggestions.map((c) => c.id),
    });
  }
  if (!mobile.ok) return fail(400, 'invalid_partner_mobile', { field: 'mobile' });
  return { name, city: city.city, mobile: mobile.mobile };
}

/**
 * موبایلی که مالک در فرم ویرایش دید: همان مقدار ذخیره‌شده (`09…`)، یا خالی. هر چیز دیگر یعنی فرم از جای دیگری آمد؛ `undefined` تا
 * ویرایش «عوض شد» بگوید. نبودن فیلد (فرم پیش از ۷٫۶) همان «نداشت» است، و اگر داشت، سنجش «همان که دیدی» در ذخیره‌گاه می‌گیردش.
 */
function seenMobileOf(value: unknown): string | null | undefined {
  if (value === undefined || value === '') return null;
  return typeof value === 'string' && /^09\d{9}$/.test(value) ? value : undefined;
}

/** کد برنامهٔ تأیید خالی: بی `stepUp`، چون هر کد نادرست یک اشتباه از سقف قفل است و خالی اشتباه نیست، فراموش شده. */
const blank = (code: unknown) => typeof code !== 'string' || code.trim() === '';

/** موبایل در رویداد: پوشیده («0915 ••• 4567»)، مثل موبایل پیامک آزمایشی (سؤال‌های ۱۴۱ و ۱۷۷). */
const maskedOrNull = (mobile: string | null) => (mobile ? maskMobile(mobile) : null);

export function createPanelPartners(deps: PanelPartnersDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const event = (
    session: AdminSession,
    action: string,
    ip: string,
    at: Date,
    targetId: string | null = null,
    detail?: Record<string, unknown>,
  ): AdminEventInput => ({
    adminUserId: session.userId,
    action,
    targetType: 'partner',
    targetId,
    ipHash: ipHashOf(deps.secret, ip),
    at,
    ...(detail ? { detail } : {}),
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

    /** چاپخانهٔ تازه: فعال، نه پیش‌فرض؛ با موبایل اعلان، رویداد شمارهٔ پوشیده را دارد. */
    async create(session: AdminSession, form: PartnerForm, ip: string): Promise<Result<{ id: string }>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const checked = formError(form);
      if ('ok' in checked) return checked;
      const at = now();
      const written = await store.create({
        name: checked.name,
        provinceId: checked.city.provinceId,
        cityId: checked.city.id,
        notifyMobile: checked.mobile,
        at,
        createdBy: session.userId,
        event: event(session, 'partners.create', ip, at, null, checked.mobile ? { mobile: maskMobile(checked.mobile) } : undefined),
      });
      if (!written.ok) return fail(409, 'partner_name_taken', { field: 'name' });
      return ok({ id: written.partner.id });
    },

    /**
     * نام، شهر و موبایل اعلان، از همان که مالک دید. بی تغییر، بی رویداد. موبایل عوض‌شده در رویداد با شمارهٔ قبلی، هر دو پوشیده؛ قبلی
     * همان دیده‌شده است، چون ذخیره‌گاه جز با همان نمی‌نویسد.
     */
    async update(session: AdminSession, idParam: string, form: PartnerForm, ip: string): Promise<Result<{ changed: string[] }>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id) return fail(404, 'partner_not_found');
      const checked = formError(form);
      if ('ok' in checked) return checked;
      const seenCity = Number(form.seenCity);
      const seenMobile = seenMobileOf(form.seenMobile);
      if (typeof form.seenName !== 'string' || !Number.isInteger(seenCity) || seenMobile === undefined) return fail(409, 'partner_changed');
      const written = await store.update({
        id,
        seen: { name: form.seenName, cityId: seenCity, notifyMobile: seenMobile },
        name: checked.name,
        provinceId: checked.city.provinceId,
        cityId: checked.city.id,
        notifyMobile: checked.mobile,
        event: event(
          session,
          'partners.update',
          ip,
          now(),
          id,
          seenMobile !== checked.mobile ? { mobile: maskedOrNull(checked.mobile), previousMobile: maskedOrNull(seenMobile) } : undefined,
        ),
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

    /**
     * چاپخانه‌ای که در دسترس بودنش عوض می‌شود: فعال، و برای کاربر چاپخانه فقط خودش؛ چاپخانهٔ دیگر یا غیرفعال همان «نیست» (۴۰۴)، تا
     * کاربر چاپخانه نام و حال چاپخانه‌های دیگر را نبیند.
     */
    async availability(session: AdminSession, idParam: string): Promise<Result<PartnerView>> {
      if (!can(session, 'partners.availability')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      if (!id || (session.partner !== null && session.partner.id !== id)) return fail(404, 'partner_not_found');
      const partner = await store.find(id);
      return partner && !partner.deactivatedAt ? ok(partner) : fail(404, 'partner_not_found');
    },

    /**
     * «باز»، «شلوغ» یا «تعطیل از … تا …» با یادداشت (سؤال‌های ۲۶۶ و ۲۶۷)، بی کد تازه. اول همان که دیده شد (حالی که همین حالا جای دیگری
     * عوض شد هیچ نمی‌نویسد، `partner_availability_changed`)، بعد فرم، بعد زیر قفل دوباره. بی تغییر موفق است، بی رویداد.
     */
    async setAvailability(
      session: AdminSession,
      idParam: string,
      form: AvailabilityForm,
      ip: string,
    ): Promise<Result<{ name: string; state: AvailabilityState; written: boolean }>> {
      const found = await this.availability(session, idParam);
      if (!found.ok) return found;
      const partner = found.value;
      const current = availabilityStateOf(partner);
      if (typeof form.seen !== 'string' || form.seen !== availabilitySeen(current)) return fail(409, 'partner_availability_changed');
      const at = now();
      const parsed = availabilityOf(form, at, partner);
      if (!parsed.ok) return fail(400, parsed.error, { field: parsed.field });
      if (sameAvailability(current, parsed.state)) return ok({ name: partner.name, state: parsed.state, written: false });
      const done = await store.setAvailability({
        id: partner.id,
        seen: current,
        next: parsed.state,
        event: event(session, 'partners.availability', ip, at, partner.id),
      });
      if (done === 'not_found' || done === 'inactive') return fail(404, 'partner_not_found');
      if (done === 'changed') return fail(409, 'partner_availability_changed');
      return ok({ name: partner.name, state: parsed.state, written: done === 'ok' });
    },

    /**
     * درصد سهم تازه (۱۰٫۳): اول همان که مالک دید (درصدی که همین حالا جای دیگری عوض شد هیچ نمی‌نویسد، `partner_share_changed`)، بعد درصد، و
     * درصد یکسان موفق است، بی کد و بی رویداد؛ بعد کد تازه، و زیر قفل دوباره. غیرفعال هم، چون دوباره فعال می‌شود.
     */
    async setShare(session: AdminSession, idParam: string, form: ShareForm, ip: string): Promise<Result<{ name: string; bp: number; written: boolean }>> {
      if (!can(session, 'partners.manage')) return fail(403, 'forbidden');
      const id = idOf(idParam);
      const partner = id ? await store.find(id) : null;
      if (!partner) return fail(404, 'partner_not_found');
      const seen = shareSeenOf(form.seen);
      if (seen === undefined || seen !== partner.shareBp) return fail(409, 'partner_share_changed');
      const bp = readSharePercent(form.share);
      if (bp === null) return fail(400, 'share_invalid', { field: 'share' });
      if (bp === partner.shareBp) return ok({ name: partner.name, bp, written: false });
      if (blank(form.code)) return fail(400, 'share_code_required', { field: 'code' });
      const stepped = await deps.stepUp(session, form.code, ip);
      if (!stepped.ok) return stepped;
      const done = await store.setShare({ id: partner.id, seen, next: bp, event: event(session, 'partners.share', ip, now(), partner.id) });
      if (done === 'not_found') return fail(404, 'partner_not_found');
      if (done === 'changed') return fail(409, 'partner_share_changed');
      return ok({ name: partner.name, bp, written: done === 'ok' });
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
