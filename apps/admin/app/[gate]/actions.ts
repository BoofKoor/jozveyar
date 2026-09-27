'use server';

/**
 * کارهای فرم‌های پنل (server actions). هر کار اول دروازه را دوباره می‌سنجد (فیلد پنهان `gate` باید همان
 * مسیر محرمانه باشد)، بعد نشست و مجوز را (در سرویس)، و فقط بعد کار را. پس کاری که از دیوار
 * `middleware.ts` هم گذشته باشد، بی مسیر محرمانه و بی نشست هیچ نمی‌کند.
 *
 * نتیجه حالت فرم است (`useActionState`)؛ پیوند ثبت فقط همین یک بار در پاسخ کار می‌آید و جایی نمی‌ماند.
 */

import { redirect } from 'next/navigation';

import { formatTehranTime } from '@jozveyar/text';

import { panelPath } from '../../lib/gate';
import { draftFormFromEntries, type DraftIssue } from '../../lib/tariff';
import type { IssuedInvite } from '../../lib/server/auth';
import {
  clearSessionCookie,
  publicOrigin,
  requestIp,
  requirePanel,
  requireSession,
  sessionToken,
  setSessionCookie,
} from '../../lib/server/context';
import type { AdminErrorCode, Failure } from '../../lib/server/result';

export interface FormState {
  error?: AdminErrorCode;
  /** پایان قفل، «11:35». */
  until?: string;
  /** مقدارهایی که فرم پس از خطا نگه می‌دارد؛ هرگز رمز یا کد. */
  values?: Record<string, string>;
}

export interface InviteLink {
  url: string;
  /** «11:35» */
  until: string;
  displayName: string;
  reset: boolean;
}

export interface LinkState extends FormState {
  link?: InviteLink;
}

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

function failure(result: Failure, values?: Record<string, string>): FormState {
  const until = result.lockedUntil instanceof Date ? formatTehranTime(result.lockedUntil) : undefined;
  return { error: result.error, ...(until ? { until } : {}), ...(values ? { values } : {}) };
}

async function linkOf(gate: string, issued: IssuedInvite): Promise<InviteLink> {
  const { config } = requirePanel(gate);
  return {
    url: `${await publicOrigin(config)}${panelPath(gate, `/invite/${issued.token}`)}`,
    until: formatTehranTime(issued.expiresAt),
    displayName: issued.displayName,
    reset: issued.reset,
  };
}

export async function loginAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { auth } = requirePanel(gate);
  const result = await auth.login(
    { username: form.get('username'), password: form.get('password'), code: form.get('code') },
    await requestIp(),
  );
  if (!result.ok) return failure(result, { username: field(form, 'username').slice(0, 64) });
  await setSessionCookie(result.value.token, result.value.expiresAt);
  redirect(panelPath(gate));
}

export async function completeInviteAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { auth } = requirePanel(gate);
  const result = await auth.completeInvite(
    field(form, 'token'),
    { password: form.get('password'), confirm: form.get('confirm'), code: form.get('code') },
    await requestIp(),
  );
  if (!result.ok) return failure(result);
  await setSessionCookie(result.value.token, result.value.expiresAt);
  redirect(panelPath(gate));
}

export async function logoutAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { auth } = requirePanel(gate);
  await auth.logout(await sessionToken(), await requestIp());
  await clearSessionCookie();
  redirect(panelPath(gate, '/login'));
}

export async function inviteAdminAction(_state: LinkState, form: FormData): Promise<LinkState> {
  const gate = field(form, 'gate');
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  const values = { displayName: field(form, 'displayName'), username: field(form, 'username'), role: field(form, 'role') };
  const result = await auth.inviteAdmin(session, { ...values, code: form.get('code') }, await requestIp());
  if (!result.ok) return failure(result, values);
  return { link: await linkOf(gate, result.value) };
}

export async function resetAdminAction(_state: LinkState, form: FormData): Promise<LinkState> {
  const gate = field(form, 'gate');
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await auth.resetAdmin(session, { userId: field(form, 'userId'), code: form.get('code') }, await requestIp());
  if (!result.ok) return failure(result);
  return { link: await linkOf(gate, result.value) };
}

export async function disableAdminAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await auth.disableAdmin(session, { userId: field(form, 'userId'), code: form.get('code') }, await requestIp());
  if (!result.ok) return failure(result);
  redirect(panelPath(gate, '/admins'));
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  await auth.revokeInvite(session, { userId: field(form, 'userId') }, await requestIp());
  redirect(panelPath(gate, '/admins'));
}

/**
 * «دوباره بساز» فایل چاپ (۴٫۲، از ۵٫۱ با فایل چاپ) یا برگهٔ سفارش (۵٫۱، `kind=ticket`): برگشت به همان سفارش، که حالا «در
 * حال ساختن» است؛ شکست با پیامش (`?e=`). کار حساس نیست (چیزی را برنمی‌گرداند و پولی جابه‌جا نمی‌کند)، پس کد تازه نمی‌خواهد؛
 * مجوز و رویدادش در سرویس.
 */
export async function rebuildPdfAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const kind = field(form, 'kind') === 'ticket' ? 'ticket' : 'print';
  const result = await orders.rebuild(session, number, kind, await requestIp());
  const back = panelPath(gate, `/orders/${encodeURIComponent(number)}`);
  redirect(result.ok ? back : `${back}?e=${result.error}`);
}

/**
 * «شروع چاپ» و «تحویل پست شد» (۴٫۳): دکمهٔ اصلی ستون کنار، از وضعیتی که ادمین دید (`from`). برگشت به همان سفارش با
 * وضعیت تازه؛ شکست با پیامش (`?e=`). کد تازه نمی‌خواهد (چیزی پاک نمی‌کند و پولی جابه‌جا نمی‌کند)؛ مجوز و رویدادش در سرویس.
 */
export async function advanceOrderAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const result = await orders.changeStatus(session, number, { action: field(form, 'action'), from: field(form, 'from') }, await requestIp());
  const back = panelPath(gate, `/orders/${encodeURIComponent(number)}`);
  redirect(result.ok ? back : `${back}?e=${result.error}`);
}

export interface ReasonState {
  error?: AdminErrorCode;
  /** متنی که نوشته شد، تا پس از خطا بماند. */
  reason?: string;
}

/**
 * لغو سفارش و برگرداندن وضعیت (۴٫۳)، با دلیل. خطای دلیل همین‌جا می‌ماند و متن نوشته‌شده با آن؛ بقیه (وضعیت همین حالا عوض
 * شد، بی مجوز) به صفحهٔ سفارش با پیامش، که وضعیت تازه را نشان می‌دهد.
 */
export async function orderReasonAction(_state: ReasonState, form: FormData): Promise<ReasonState> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const reason = field(form, 'reason');
  const result = await orders.changeStatus(
    session,
    number,
    { action: field(form, 'action'), from: field(form, 'from'), reason },
    await requestIp(),
  );
  const back = panelPath(gate, `/orders/${encodeURIComponent(number)}`);
  if (result.ok) redirect(back);
  if (result.error === 'reason_required' || result.error === 'reason_too_long') return { error: result.error, reason: reason.slice(0, 2000) };
  redirect(`${back}?e=${result.error}`);
}

export interface RecipientState {
  error?: AdminErrorCode;
  /** فیلدهایی که قاعده را نمی‌خوانند، به شکل `checkRecipient`. */
  fields?: string[];
  values?: { name: string; addressText: string; postalCode: string };
}

/** ویرایش نام، نشانی و کد پستی گیرنده (۴٫۳): خطای فیلد همین‌جا با مقدارهای نوشته‌شده؛ بقیه به صفحهٔ سفارش با پیامش. */
export async function editRecipientAction(_state: RecipientState, form: FormData): Promise<RecipientState> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const values = {
    name: field(form, 'name').slice(0, 1000),
    addressText: field(form, 'addressText').slice(0, 5000),
    postalCode: field(form, 'postalCode').slice(0, 100),
  };
  const result = await orders.editRecipient(session, number, values, await requestIp());
  const back = panelPath(gate, `/orders/${encodeURIComponent(number)}`);
  if (result.ok) redirect(back);
  if (result.error === 'invalid_recipient') {
    return { error: result.error, fields: Array.isArray(result.fields) ? (result.fields as string[]) : [], values };
  }
  redirect(`${back}?e=${result.error}`);
}

/**
 * «نسخهٔ تازه»ی تعرفه (۴٫۵): پیش‌نویسی که هست، یا تازه از روی نسخهٔ فعال؛ بعد ویرایشگرش. کد تازه نمی‌خواهد: پیش‌نویس
 * روی سایت اثری ندارد. مجوز و رویدادش در سرویس.
 */
export async function newDraftAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { tariff } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await tariff.createDraft(session, await requestIp());
  redirect(result.ok ? panelPath(gate, `/tariff/${result.value.version}`) : `${panelPath(gate, '/tariff')}?e=${result.error}`);
}

export interface DraftState {
  error?: AdminErrorCode;
  /** خطاهای سنجش سرور، با جایشان؛ همان که ویرایشگر مرورگر هم نشان می‌دهد. */
  issues?: DraftIssue[];
}

/**
 * ذخیرهٔ پیش‌نویس (۴٫۵)؛ «فعال کن…» پس از ذخیره به صفحهٔ فعال‌سازی می‌رود، و «ذخیرهٔ پیش‌نویس» به همان ویرایشگر. هر شکست
 * همین‌جا برمی‌گردد و فرم نوشته‌شده در ویرایشگر می‌ماند.
 */
export async function saveDraftAction(_state: DraftState, form: FormData): Promise<DraftState> {
  const gate = field(form, 'gate');
  const { tariff } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await tariff.saveDraft(
    session,
    field(form, 'version'),
    { form: draftFormFromEntries(form.entries()), fingerprint: field(form, 'fingerprint') },
    await requestIp(),
  );
  if (result.ok) {
    const version = result.value.version;
    redirect(panelPath(gate, field(form, 'intent') === 'activate' ? `/tariff/${version}/activate` : `/tariff/${version}?saved=1`));
  }
  return { error: result.error, ...(Array.isArray(result.issues) ? { issues: result.issues as DraftIssue[] } : {}) };
}

/** پاک کردن پیش‌نویس (۴٫۵)، پس از «پاک شود؟» ویرایشگر. */
export async function deleteDraftAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { tariff } = requirePanel(gate);
  const session = await requireSession(gate);
  const version = field(form, 'version');
  const result = await tariff.deleteDraft(session, version, await requestIp());
  redirect(
    result.ok
      ? `${panelPath(gate, '/tariff')}?deleted=${encodeURIComponent(version)}`
      : `${panelPath(gate, `/tariff/${encodeURIComponent(version)}`)}?e=${result.error}`,
  );
}

/**
 * فعال کردن یک نسخهٔ تعرفه با کد تازه (۴٫۵، کار حساس): پیش‌نویس، یا نسخهٔ قبل برای برگشت. خطای کد همین‌جا؛ تعرفه‌ای که
 * همین حالا عوض شد به همان صفحه با پیامش، که تغییرها را از نو نشان می‌دهد.
 */
export async function activateTariffAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { tariff } = requirePanel(gate);
  const session = await requireSession(gate);
  const version = field(form, 'version');
  const result = await tariff.activate(
    session,
    version,
    { active: field(form, 'active'), fingerprint: field(form, 'fingerprint'), code: form.get('code') },
    await requestIp(),
  );
  if (result.ok) redirect(`${panelPath(gate, '/tariff')}?done=${result.value.version}`);
  if (['tariff_changed', 'tariff_not_found', 'invalid_draft', 'forbidden'].includes(result.error)) {
    redirect(`${panelPath(gate, `/tariff/${encodeURIComponent(version)}/activate`)}?e=${result.error}`);
  }
  return failure(result);
}

/* ───────────────────────── تنظیمات و کلیدها (۴٫۶) ───────────────────────── */

/** نشان هر ذخیرهٔ موفق در نشانی: فرم صفحه با آن از نو سوار می‌شود، پس خطای قبلی (حالت فرم) با کار موفق بعدی نمی‌ماند. */
const doneMark = () => `n=${Date.now().toString(36)}`;

export interface SettingState {
  error?: AdminErrorCode;
  /** عددی که نوشته شد، تا پس از خطا بماند (راز نیست). */
  value?: string;
}

/**
 * روز کاری تحویل به پست و سقف ساعتی کد پیامکی (۴٫۶). خطای مقدار همین‌جا با عدد نوشته‌شده؛ «همین حالا جای دیگری عوض شد» به
 * صفحه با پیامش، که مقدار تازه را نشان می‌دهد؛ موفق به صفحه با پیام، فقط اگر هنوز راست است (`v`). کد تازه نمی‌خواهد: چیزی
 * پاک نمی‌کند و پولی جابه‌جا نمی‌کند، و رویدادش می‌ماند.
 */
export async function saveSettingAction(_state: SettingState, form: FormData): Promise<SettingState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const value = field(form, 'value').slice(0, 50);
  const result = await settings.saveNumber(session, { key: field(form, 'key'), value, seen: field(form, 'seen') }, await requestIp());
  const home = panelPath(gate, '/settings');
  if (result.ok) redirect(`${home}?done=${encodeURIComponent(result.value.key)}&v=${result.value.value}&${doneMark()}`);
  if (result.error === 'setting_changed') redirect(`${home}?e=setting_changed&${doneMark()}`);
  return { error: result.error, value };
}

export interface HolidayState {
  error?: AdminErrorCode;
  /** خطای هر فیلد، و مناسبت روزی که همین حالا در فهرست است. */
  errors?: { date?: string; title?: string };
  exists?: { date: string; title: string };
  values?: { date: string; title: string };
}

/** تعطیلی تازه (۴٫۶): خطای هر فیلد همین‌جا با نوشته‌ها؛ موفق به صفحه با پیام. */
export async function addHolidayAction(_state: HolidayState, form: FormData): Promise<HolidayState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const values = { date: field(form, 'date').slice(0, 40), title: field(form, 'title').slice(0, 400) };
  const result = await settings.addHoliday(session, values, await requestIp());
  if (result.ok) redirect(`${panelPath(gate, '/settings')}?done=holiday_add&d=${encodeURIComponent(result.value.date)}&${doneMark()}#holidays`);
  if (result.error === 'holiday_exists') {
    return { error: result.error, exists: { date: String(result.date ?? ''), title: String(result.title ?? '') }, values };
  }
  const errors = result.errors && typeof result.errors === 'object' ? (result.errors as HolidayState['errors']) : undefined;
  return { error: result.error, ...(errors ? { errors } : {}), values };
}

/** حذف یک تعطیلی (۴٫۶)، بی پرسش: برگشت‌پذیر است (دوباره افزودن)، و مهلت سفارش‌های ثبت‌شده عوض نمی‌شود. */
export async function removeHolidayAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await settings.removeHoliday(session, { date: field(form, 'date') }, await requestIp());
  const home = panelPath(gate, '/settings');
  const date = encodeURIComponent(field(form, 'date').slice(0, 20));
  redirect(result.ok ? `${home}?done=holiday_remove&d=${date}&${doneMark()}#holidays` : `${home}?e=${result.error}&d=${date}&${doneMark()}#holidays`);
}

/** «با تقویم رسمی تطبیق دادم» (۴٫۶). */
export async function confirmHolidaysAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await settings.confirmOfficial(session, { year: field(form, 'year') }, await requestIp());
  const home = panelPath(gate, '/settings');
  redirect(result.ok ? `${home}?done=official&y=${result.value.year}&${doneMark()}#holidays` : `${home}?e=${result.error}&${doneMark()}#holidays`);
}

/**
 * مقدار پنل یک کلید، یا «برگرداندن به .env»، با کد تازه (۴٫۶، کار حساس). مقدار کلید هرگز در حالت فرم برنمی‌گردد: خطای کد یا
 * مقدار همین‌جا، و فیلد خالی (فرم پس از هر پاسخ از نو). کلیدی که همین حالا جای دیگری عوض شد به صفحه با پیامش، با وضعیت تازه.
 */
export async function keyAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const name = field(form, 'name');
  const input = { name, seen: field(form, 'seen'), code: form.get('code') };
  const revert = field(form, 'intent') === 'revert';
  const result = revert
    ? await settings.revertKey(session, input, await requestIp())
    : await settings.setKey(session, { ...input, value: form.get('value') }, await requestIp());
  const home = panelPath(gate, '/settings');
  const anchor = /^[A-Z_]{1,40}$/.test(name) ? `#key-${name}` : '';
  if (result.ok) redirect(`${home}?done=${revert ? 'key_revert' : 'key_set'}&k=${result.value.name}&${doneMark()}${anchor}`);
  if (result.error === 'key_changed' || result.error === 'key_not_found' || result.error === 'forbidden') {
    redirect(`${home}?e=${result.error}&${doneMark()}${anchor}`);
  }
  return failure(result);
}
