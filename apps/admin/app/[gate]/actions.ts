'use server';

/**
 * کارهای فرم‌های پنل (server actions). هر کار اول دروازه را دوباره می‌سنجد (فیلد پنهان `gate` باید همان
 * مسیر محرمانه باشد)، بعد نشست و مجوز را (در سرویس)، و فقط بعد کار را. پس کاری که از دیوار
 * `middleware.ts` هم گذشته باشد، بی مسیر محرمانه و بی نشست هیچ نمی‌کند.
 *
 * نتیجه حالت فرم است (`useActionState`)؛ پیوند ثبت فقط همین یک بار در پاسخ کار می‌آید و جایی نمی‌ماند.
 */

import { redirect } from 'next/navigation';

import { REPORT_BOUNDS_MAX } from '@jozveyar/contracts';
import { bandsSeen } from '@jozveyar/db';
import { findCity } from '@jozveyar/geo';
import { formatTehranTime } from '@jozveyar/text';

import { panelPath } from '../../lib/gate';
import { cityLabel } from '../../lib/partners';
import { parseWholeNumber } from '../../lib/settings';
import { boundErrorText, monthKey, parseMonthKey, type BoundError } from '../../lib/report';
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
  const values = {
    displayName: field(form, 'displayName'),
    username: field(form, 'username'),
    role: field(form, 'role'),
    partner: field(form, 'partner').slice(0, 64),
  };
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
 * «شروع چاپ» و «تحویل پست شد» (۴٫۳): دکمهٔ اصلی ستون کنار، از وضعیتی که ادمین دید (`from`)، و «شروع چاپ» از چاپخانه‌ای هم که
 * دید (`partner`، ۵٫۲). برگشت به همان سفارش با وضعیت تازه؛ شکست با پیامش (`?e=`). کد تازه نمی‌خواهد (چیزی پاک نمی‌کند و پولی
 * جابه‌جا نمی‌کند)؛ مجوز و رویدادش در سرویس.
 */
export async function advanceOrderAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const result = await orders.changeStatus(
    session,
    number,
    { action: field(form, 'action'), from: field(form, 'from'), partner: field(form, 'partner') },
    await requestIp(),
  );
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

/** رسید «آزمایش» مقدار تازه (۷٫۱): با فرم برمی‌گردد تا «ذخیره» یا «بی آزمایش ذخیره کن» همان مقدار را بپذیرد؛ خود مقدار در آن نیست. */
export interface KeyReceiptFields {
  outcome: 'ok' | 'unavailable';
  at: string;
  mac: string;
}

export interface KeyState extends FormState {
  /** «در دسترس نیست» کلید API (۷٫۱): رسید، برای «بی آزمایش ذخیره کن». */
  receipt?: KeyReceiptFields;
  /** «رد شد» (۷٫۱): عدد پاسخ sms.ir، کد بدنه یا HTTP؛ از ۷٫۲ `result` زیبال. */
  code?: number | null;
  /** کد پذیرنده آزموده نشد چون نشانی برگشت (`PAYMENT_CALLBACK_URL`) در `.env` نیست (۷٫۲). */
  unconfigured?: boolean;
}

const receiptFields = (value: unknown): KeyReceiptFields | undefined => {
  const receipt = value as Partial<KeyReceiptFields> | null | undefined;
  return receipt && (receipt.outcome === 'ok' || receipt.outcome === 'unavailable') && typeof receipt.at === 'string' && typeof receipt.mac === 'string'
    ? { outcome: receipt.outcome, at: receipt.at, mac: receipt.mac }
    : undefined;
};

const numberOr = (...values: unknown[]) => (values.find((value) => typeof value === 'number') as number | undefined) ?? null;

/** نشانی صفحهٔ «تنظیمات» با نشان کلید. */
const keyAnchor = (name: string) => (/^[A-Z_]{1,40}$/.test(name) ? `#key-${name}` : '');

/**
 * مقدار پنل یک کلید، یا «برگرداندن به .env»، با کد تازه (۴٫۶، کار حساس). مقدار کلید هرگز در حالت فرم برنمی‌گردد: خطای کد یا
 * مقدار همین‌جا، و فیلد خالی (فرم پس از هر پاسخ از نو). کلیدی که همین حالا جای دیگری عوض شد به صفحه با پیامش، با وضعیت تازه.
 * از ۷٫۱ کلید API «آزمایش و ذخیره» است (سؤال ۱۳۸): «رد شد» با عدد پاسخ، «در دسترس نیست» با رسید، و «بی آزمایش ذخیره کن» (`skip`)
 * فقط با همان رسید و همان کلید، که دوباره وارد می‌شود.
 */
export async function keyAction(_state: KeyState, form: FormData): Promise<KeyState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const name = field(form, 'name');
  const input = { name, seen: field(form, 'seen'), code: form.get('code') };
  const intent = field(form, 'intent');
  const revert = intent === 'revert';
  const skip =
    intent === 'skip' ? { skipTest: '1', tested: field(form, 'tested'), testedAt: field(form, 'testedAt'), receipt: field(form, 'receipt') } : {};
  const result = revert
    ? await settings.revertKey(session, input, await requestIp())
    : await settings.setKey(session, { ...input, value: form.get('value'), ...skip }, await requestIp());
  const home = panelPath(gate, '/settings');
  const anchor = keyAnchor(name);
  if (result.ok) redirect(`${home}?done=${revert ? 'key_revert' : 'key_set'}&k=${result.value.name}&${doneMark()}${anchor}`);
  if (result.error === 'key_changed' || result.error === 'key_not_found' || result.error === 'forbidden') {
    redirect(`${home}?e=${result.error}&${doneMark()}${anchor}`);
  }
  if (result.error === 'key_unavailable') return { error: result.error, receipt: receiptFields(result.receipt) };
  if (result.error === 'key_rejected') {
    return { error: result.error, code: numberOr(result.serviceStatus, result.http), ...(result.unconfigured === true ? { unconfigured: true } : {}) };
  }
  // «بی آزمایش ذخیره کن» با کد اشتباه: رسید همان می‌ماند تا بار دوم.
  if (intent === 'skip' && (result.error === 'wrong_code' || result.error === 'code_used' || result.error === 'invalid_api_key')) {
    return { ...failure(result), receipt: receiptFields({ outcome: field(form, 'tested'), at: field(form, 'testedAt'), mac: field(form, 'receipt') }) };
  }
  return failure(result);
}

/**
 * «آزمایش» مقدار امروز یک کلید sms.ir (۷٫۱، سؤال ۱۳۸)، بی کد: کلید API با اعتبار (دکمه، بی JS)، قالب با پیامک آزمایشی به موبایلی
 * که همین‌جا وارد می‌شود. نتیجه هر چه باشد رویداد است و کنار همان کلید دیده می‌شود؛ به صفحه با `done=key_test`. خطای موبایل همین‌جا.
 */
export async function testKeyAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const name = field(form, 'name');
  const mobile = field(form, 'mobile').slice(0, 40);
  const result = await settings.testKey(session, { name, ...(form.has('mobile') ? { mobile } : {}) }, await requestIp());
  const home = panelPath(gate, '/settings');
  const anchor = keyAnchor(name);
  if (result.ok) redirect(`${home}?done=key_test&k=${result.value.name}&${doneMark()}${anchor}`);
  if (result.error === 'invalid_test_mobile') return { error: result.error, values: { mobile } };
  redirect(`${home}?e=${result.error}&k=${encodeURIComponent(name.slice(0, 40))}&${doneMark()}${anchor}`);
}

export interface TemplateKeyState extends FormState {
  /** پیامک آزمایشی همین شناسه رفت (یا sms.ir جواب نداد): نتیجه و رسید، برای «ذخیره». */
  tested?: { outcome: 'ok' | 'rejected' | 'unavailable' | 'unconfigured'; code: number | null; mobile: string | null; receipt?: KeyReceiptFields };
}

/**
 * شناسهٔ قالب تازه (۷٫۱، طرح `m-key-tpl`، سؤال ۱۳۸): اول «پیامک آزمایشی بفرست» (`test`، بی کد)، بعد «ذخیره» با کد تازه، فقط با رسید
 * همان شناسه تا ۱۵ دقیقه. شناسهٔ قالب راز نیست، پس شناسه و موبایل در حالت فرم می‌مانند؛ رسید هم (HMAC همین ادمین و همین شناسه).
 */
export async function templateKeyAction(state: TemplateKeyState, form: FormData): Promise<TemplateKeyState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const name = field(form, 'name');
  const values = { value: field(form, 'value').slice(0, 40), mobile: field(form, 'mobile').slice(0, 40) };
  const home = panelPath(gate, '/settings');
  const anchor = keyAnchor(name);
  const away = (error: string) => redirect(`${home}?e=${error}&${doneMark()}${anchor}`);
  if (field(form, 'intent') === 'test') {
    const result = await settings.testKey(session, { name, value: values.value, mobile: values.mobile }, await requestIp());
    if (!result.ok) {
      if (result.error === 'key_not_found' || result.error === 'forbidden' || result.error === 'key_not_testable') away(result.error);
      return { error: result.error, values };
    }
    const { outcome, http, status, mobile, receipt } = result.value;
    return { values, tested: { outcome, code: numberOr(status, http), mobile, ...(receipt ? { receipt: receiptFields(receipt) } : {}) } };
  }
  const result = await settings.setKey(
    session,
    {
      name,
      value: values.value,
      seen: field(form, 'seen'),
      code: form.get('code'),
      tested: field(form, 'tested'),
      testedAt: field(form, 'testedAt'),
      receipt: field(form, 'receipt'),
    },
    await requestIp(),
  );
  if (result.ok) redirect(`${home}?done=key_set&k=${result.value.name}&${doneMark()}${anchor}`);
  if (result.error === 'key_changed' || result.error === 'key_not_found' || result.error === 'forbidden') away(result.error);
  // «اول پیامک آزمایشی»: رسید کهنه یا شناسهٔ دیگر؛ نتیجهٔ قبلی دیگر معتبر نیست.
  if (result.error === 'key_untested') return { error: result.error, values };
  return { ...failure(result, values), ...(state.tested ? { tested: state.tested } : {}) };
}

export interface OtpLimitsState {
  error?: AdminErrorCode;
  /** فیلدهایی که عدد درست نیستند. */
  invalid?: ('hour' | 'day')[];
  values?: { hour: string; day: string };
}

/**
 * کارت «سقف کد پیامکی» (۷٫۱): ساعتی و ۲۴ ساعتهٔ کل سایت با یک «ذخیره»، هر کدام «همان که دیده شد». خطای هر فیلد زیر خودش با
 * نوشته‌ها؛ «همین حالا جای دیگری عوض شد» به صفحه با پیامش.
 */
export async function saveOtpLimitsAction(_state: OtpLimitsState, form: FormData): Promise<OtpLimitsState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const values = { hour: field(form, 'hour').slice(0, 50), day: field(form, 'day').slice(0, 50) };
  const result = await settings.saveNumbers(
    session,
    [
      { key: 'otp.site_hourly_limit', value: values.hour, seen: field(form, 'seenHour') },
      { key: 'otp.site_daily_limit', value: values.day, seen: field(form, 'seenDay') },
    ],
    await requestIp(),
  );
  const home = panelPath(gate, '/settings');
  // عدد خوانده‌شده (ارقام فارسی و جداکننده یکدست)، تا صفحه پیام را فقط وقتی نشان دهد که هنوز راست است.
  if (result.ok) redirect(`${home}?done=otp_limits&h=${parseWholeNumber(values.hour)}&d=${parseWholeNumber(values.day)}&${doneMark()}#otp`);
  if (result.error === 'setting_changed') redirect(`${home}?e=setting_changed&${doneMark()}`);
  const keys = Array.isArray(result.keys) ? (result.keys as string[]) : [];
  const invalid = [
    ...(keys.includes('otp.site_hourly_limit') ? (['hour'] as const) : []),
    ...(keys.includes('otp.site_daily_limit') ? (['day'] as const) : []),
  ];
  return { error: result.error, invalid, values };
}

/* ───────────────────────── چاپخانه‌ها (۵٫۲) ───────────────────────── */

export interface AssignState {
  error?: AdminErrorCode;
  /** چاپخانه‌ای که انتخاب شد و دلیلی که نوشته شد، تا پس از خطا بمانند. */
  to?: string;
  reason?: string;
}

/**
 * جابه‌جایی چاپخانهٔ سفارش (۵٫۲، طرح `m-order-assign`): خطای انتخاب و دلیل همین‌جا با نوشته‌ها؛ چاپخانه‌ای که همین حالا غیرفعال
 * شد، به همان فرم با گزینه‌های تازه؛ بقیه (چاپخانه یا وضعیت همین حالا عوض شد، بی مجوز) به صفحهٔ سفارش با پیامش. کد تازه
 * نمی‌خواهد: برگشت‌پذیر است (ADR-042)؛ مجوز و رویدادش در سرویس.
 */
export async function assignPartnerAction(_state: AssignState, form: FormData): Promise<AssignState> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const values = { to: field(form, 'to').slice(0, 64), reason: field(form, 'reason').slice(0, 2000) };
  const result = await orders.assign(session, number, { from: field(form, 'from'), ...values }, await requestIp());
  const back = panelPath(gate, `/orders/${encodeURIComponent(number)}`);
  if (result.ok) redirect(back);
  if (result.error === 'partner_required' || result.error === 'reason_required' || result.error === 'reason_too_long') {
    return { error: result.error, ...values };
  }
  if (result.error === 'partner_inactive') redirect(`${back}?do=assign&e=partner_inactive`);
  redirect(`${back}?e=${result.error}`);
}

export interface PartnerState {
  error?: AdminErrorCode;
  /** فیلدی که خطا دارد. */
  field?: 'name' | 'city';
  /** شهرهایی که به متن فیلد می‌خورند («مشهد، خراسان رضوی»)، برای خطای شهر. */
  suggestions?: string[];
  values?: { name: string; city: string };
}

/**
 * افزودن و ویرایش چاپخانه (۵٫۲، طرح `m-partner-edit`): خطای نام یا شهر همین‌جا با نوشته‌ها و پیشنهادهای شهر؛ چاپخانه‌ای که همین
 * حالا جای دیگری عوض شد به همان فرم با نام و شهر تازه؛ موفق به فهرست با پیام. کد تازه نمی‌خواهد (سؤال ۳۵).
 */
export async function savePartnerAction(_state: PartnerState, form: FormData): Promise<PartnerState> {
  const gate = field(form, 'gate');
  const { partners } = requirePanel(gate);
  const session = await requireSession(gate);
  const id = field(form, 'id');
  const values = { name: field(form, 'name').slice(0, 400), city: field(form, 'city').slice(0, 400) };
  const result = id
    ? await partners.update(session, id, { ...values, seenName: field(form, 'seenName'), seenCity: field(form, 'seenCity') }, await requestIp())
    : await partners.create(session, values, await requestIp());
  const home = panelPath(gate, '/partners');
  if (result.ok) redirect(`${home}?done=${id ? 'update' : 'create'}&p=${encodeURIComponent(id || ('id' in result.value ? result.value.id : ''))}&${doneMark()}`);
  if (result.error === 'partner_changed') redirect(`${panelPath(gate, `/partners/${encodeURIComponent(id)}`)}?e=partner_changed`);
  if (result.error === 'partner_not_found' || result.error === 'forbidden') redirect(`${home}?e=${result.error}&${doneMark()}`);
  const suggestions = Array.isArray(result.suggestions)
    ? result.suggestions.flatMap((cityId) => {
        const city = typeof cityId === 'number' ? findCity(cityId) : undefined;
        return city ? [cityLabel(city)] : [];
      })
    : undefined;
  return {
    error: result.error,
    ...(result.field === 'name' || result.field === 'city' ? { field: result.field } : {}),
    ...(suggestions ? { suggestions } : {}),
    values,
  };
}

/**
 * «پیش‌فرض کن»، «غیرفعال کن» و «فعال کن» در فهرست چاپخانه‌ها (۵٫۲): بی پرسش، چون هر سه برگشت‌پذیرند؛ برگشت به فهرست با پیام،
 * یا با دلیل اینکه چرا نشد (سفارش باز، پیش‌فرض).
 */
export async function partnerStateAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { partners } = requirePanel(gate);
  const session = await requireSession(gate);
  const id = field(form, 'id');
  const intent = field(form, 'intent');
  const home = panelPath(gate, '/partners');
  if (intent !== 'default' && intent !== 'deactivate' && intent !== 'activate') redirect(home);
  const ip = await requestIp();
  const result =
    intent === 'default'
      ? await partners.setDefault(session, id, ip)
      : intent === 'deactivate'
        ? await partners.deactivate(session, id, ip)
        : await partners.activate(session, id, ip);
  const target = `p=${encodeURIComponent(id.slice(0, 64))}`;
  redirect(result.ok ? `${home}?done=${intent}&${target}&${doneMark()}` : `${home}?e=${result.error}&${target}&${doneMark()}`);
}

/* ───────────────────────── ارسال: ورود فایل پست (۶٫۱) ───────────────────────── */

export interface UploadState {
  error?: AdminErrorCode;
  /** همان فایل پیش‌تر وارد شده: ورود قبلی، اگر در محدودهٔ همین نشست است. */
  existing?: string | null;
}

/**
 * بارگذاری فایل پست (طرح `m-ship`): موفق به صفحهٔ همان ورود، که تا کارگر بخواندش «در حال خواندن» است؛ فایل بزرگ یا خالی همین‌جا؛
 * همان فایل که پیش‌تر وارد شده به صفحهٔ همان ورود (طرح `m-ship-dup`). کد تازه نمی‌خواهد: تا «ثبت» چیزی جز خود فایل نوشته نمی‌شود.
 * بدنهٔ کار حداکثر ۳ مگابایت است (`next.config.ts` و Nginx)، کمی بیش از سقف فایل.
 */
export async function uploadPostFileAction(_state: UploadState, form: FormData): Promise<UploadState> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const file = form.get('file');
  const picked = file instanceof File && file.size > 0 ? file : null;
  const result = await shipments.upload(
    session,
    picked ? { name: picked.name, bytes: Buffer.from(await picked.arrayBuffer()) } : null,
    await requestIp(),
  );
  if (result.ok) redirect(panelPath(gate, `/shipments/${result.value.id}`));
  const existing = typeof result.existing === 'string' ? result.existing : null;
  if (result.error === 'post_file_same' && existing) redirect(`${panelPath(gate, `/shipments/${existing}`)}?same=1`);
  return { error: result.error, existing };
}

/**
 * «ثبت» (طرح `m-ship-preview`): با اثر انگشت حکم‌هایی که صفحه نشان داد؛ برگشت به همان ورود، که حالا «ثبت شد» است، یا با پیامش
 * اگر حکم‌ها همین حالا عوض شد (پیش‌نمایش تازه). کد تازه نمی‌خواهد (ADR-046).
 */
export async function commitImportAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const id = field(form, 'id');
  const result = await shipments.commit(session, id, { fingerprint: field(form, 'fingerprint') }, await requestIp());
  const back = panelPath(gate, `/shipments/${encodeURIComponent(id)}`);
  redirect(result.ok ? back : `${back}?e=${result.error}&${doneMark()}`);
}

/** «دور بینداز»: پیش از «ثبت»؛ برگشت به فهرست ورودها با پیام. */
export async function discardImportAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const id = field(form, 'id');
  const result = await shipments.discard(session, id, await requestIp());
  if (result.ok) redirect(`${panelPath(gate, '/shipments')}?done=discard&${doneMark()}`);
  redirect(`${panelPath(gate, `/shipments/${encodeURIComponent(id)}`)}?e=${result.error}&${doneMark()}`);
}

/**
 * برگرداندن کل یک ورود (مالک، طرح `m-ship-revert`): خطای دلیل همین‌جا با متن نوشته‌شده؛ بقیه به صفحهٔ همان ورود با پیامش یا با
 * نتیجه. کد تازه نمی‌خواهد (ADR-046): برگشت‌پذیر است و پولی جابه‌جا نمی‌کند.
 */
export async function revertImportAction(_state: ReasonState, form: FormData): Promise<ReasonState> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const id = field(form, 'id');
  const reason = field(form, 'reason');
  const result = await shipments.revert(session, id, { reason }, await requestIp());
  const back = panelPath(gate, `/shipments/${encodeURIComponent(id)}`);
  if (result.ok) redirect(`${back}?done=revert`);
  if (result.error === 'reason_required' || result.error === 'reason_too_long') return { error: result.error, reason: reason.slice(0, 2000) };
  redirect(`${back}?e=${result.error}&${doneMark()}`);
}

/** برگشت کارهای صف تأیید (۶٫۲): به همان صفحهٔ صف، یا صفحهٔ ورود اگر ادمین از آنجا آمده بود؛ صفحهٔ صف فقط عدد. */
function reviewHome(gate: string, form: FormData): string {
  const page = /^[1-9]\d{0,3}$/.test(field(form, 'page')) ? field(form, 'page') : '1';
  const importId = field(form, 'import');
  return field(form, 'from') === 'import' && /^[0-9a-f-]{36}$/.test(importId)
    ? panelPath(gate, `/shipments/${importId}`)
    : `${panelPath(gate, '/shipments/review')}${page === '1' ? '' : `?page=${page}`}`;
}

const withQuery = (url: string, query: string) => `${url}${url.includes('?') ? '&' : '?'}${query}`;

/**
 * کارت صف تأیید (۶٫۲، طرح `m-ship-review`): «همین است» با نامزدی که ادمین انتخاب کرد و همان که از آن دید، یا «هیچ‌کدام». موفق به
 * صفحه‌ای که ادمین از آن آمد (صف، یا صفحهٔ ورود) با نتیجه؛ شکست به همان کارت با پیامش (`r`، و لنگر کارت). کد تازه نمی‌خواهد
 * (ADR-046): برگشت‌پذیر است و پولی جابه‌جا نمی‌کند.
 */
export async function reviewAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const importId = field(form, 'import');
  const rowNo = field(form, 'row');
  const ip = await requestIp();
  const home = reviewHome(gate, form);
  // شکست روی همان کارت: در صف با شناسهٔ کارت، در صفحهٔ سطر همان صفحه.
  const here =
    field(form, 'at') === 'row'
      ? `${panelPath(gate, `/shipments/${encodeURIComponent(importId)}/rows/${encodeURIComponent(rowNo)}`)}?from=${field(form, 'from') === 'import' ? 'import' : 'queue'}`
      : home;
  const card = `r=${encodeURIComponent(`${importId}.${rowNo}`)}`;
  if (field(form, 'do') === 'dismiss') {
    const result = await shipments.dismiss(session, { importId, rowNo }, ip);
    redirect(result.ok ? withQuery(home, `done=dismiss&${card}&${doneMark()}`) : `${withQuery(here, `e=${result.error}&${card}&${doneMark()}`)}#r-${importId}-${rowNo}`);
  }
  const result = await shipments.approve(session, { importId, rowNo, choice: field(form, 'choice') }, ip);
  if (result.ok) {
    redirect(withQuery(home, `done=approve&o=${result.value.orderNumber}&h=${result.value.handed ? 1 : 0}&${doneMark()}`));
  }
  redirect(`${withQuery(here, `e=${result.error}&${card}&${doneMark()}`)}#r-${importId}-${rowNo}`);
}

/**
 * دادن دستی (۶٫۲، قدم دوم، تصمیم ۸۳): «همین است» روی کارت سفارشی که ادمین با شماره‌اش آورد، از همان که از آن دید. موفق به صفحه‌ای
 * که ادمین از آن آمد؛ شکست به همان کارت سفارش با پیامش.
 */
export async function assignShipmentAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const importId = field(form, 'import');
  const rowNo = field(form, 'row');
  const result = await shipments.assign(
    session,
    { importId, rowNo, order: field(form, 'order'), seen: field(form, 'seen') },
    await requestIp(),
  );
  if (result.ok) {
    redirect(withQuery(reviewHome(gate, form), `done=assign&o=${result.value.orderNumber}&h=${result.value.handed ? 1 : 0}&${doneMark()}`));
  }
  const from = field(form, 'from') === 'import' ? 'import' : 'queue';
  const number = /^\d{1,9}$/.test(field(form, 'number')) ? field(form, 'number') : '';
  const page = /^[1-9]\d{0,3}$/.test(field(form, 'page')) ? `&page=${field(form, 'page')}` : '';
  redirect(
    `${panelPath(gate, `/shipments/${encodeURIComponent(importId)}/rows/${encodeURIComponent(rowNo)}`)}?order=${number}&from=${from}${page}&e=${result.error}&${doneMark()}`,
  );
}

/**
 * کنار گذاشتن یک کد رهگیری (۶٫۲، مالک، از کارت «بستهٔ پستی» سفارش): خطای دلیل همین‌جا با متن نوشته‌شده؛ بقیه به صفحهٔ سفارش با
 * پیامش یا با نتیجه. کد تازه نمی‌خواهد (ADR-046).
 */
export async function voidShipmentAction(_state: ReasonState, form: FormData): Promise<ReasonState> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const reason = field(form, 'reason');
  const result = await shipments.voidShipment(session, { shipment: field(form, 'shipment'), reason }, await requestIp());
  const back = panelPath(gate, `/orders/${encodeURIComponent(result.ok ? String(result.value.orderNumber) : number)}`);
  if (result.ok) redirect(`${back}?done=void&re=${result.value.reopened ? 1 : 0}`);
  if (result.error === 'reason_required' || result.error === 'reason_too_long') return { error: result.error, reason: reason.slice(0, 2000) };
  redirect(`${back}?e=${result.error}`);
}

/**
 * «دوباره بفرست» پیامک رهگیری (۶٫۳، سؤال ۶۹؛ مالک و متصدی): از کارت «بستهٔ پستی» سفارش یا سطر همان کد در صفحهٔ ورود؛ برگشت به
 * همان‌جا با نتیجه (`done=sms_resend&sent=1|0`) یا پیامش. کد تازه نمی‌خواهد: فقط پیامکی را دوباره می‌فرستد که نرفت.
 */
export async function resendSmsAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { shipments } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await shipments.resendSms(session, { shipment: field(form, 'shipment') }, await requestIp());
  const importId = field(form, 'import');
  const back =
    field(form, 'from') === 'import' && /^[0-9a-f-]{36}$/.test(importId)
      ? panelPath(gate, `/shipments/${importId}`)
      : panelPath(gate, `/orders/${encodeURIComponent(result.ok ? String(result.value.orderNumber) : field(form, 'number'))}`);
  redirect(
    result.ok
      ? withQuery(back, `done=sms_resend&sent=${result.value.outcome === 'sent' ? 1 : 0}&${doneMark()}`)
      : withQuery(back, `e=${result.error}&${doneMark()}`),
  );
}

/**
 * «دوباره بفرست» پیامک پرداخت (۷٫۱، طرح `ad-paysms`؛ مالک و متصدی): از کارت «پرداخت‌ها» سفارش؛ برگشت به همان سفارش با نتیجه
 * (`done=paid_sms_resend&sent=1|0`) یا پیامش. کد تازه نمی‌خواهد: فقط پیامکی را دوباره می‌فرستد که نرفت.
 */
export async function resendPaymentSmsAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.resendPaymentSms(session, { payment: field(form, 'payment') }, await requestIp());
  const number = result.ok ? String(result.value.orderNumber) : typeof result.orderNumber === 'number' ? String(result.orderNumber) : field(form, 'number');
  const back = panelPath(gate, `/orders/${encodeURIComponent(number.slice(0, 20))}`);
  redirect(
    result.ok
      ? withQuery(back, `done=paid_sms_resend&sent=${result.value.outcome === 'sent' ? 1 : 0}&${doneMark()}`)
      : withQuery(back, `e=${result.error}&${doneMark()}`),
  );
}

/**
 * «استعلام از درگاه» (۷٫۲، طرح `m-order-unpaid`؛ مالک و متصدی): از کارت «پرداخت‌ها» سفارش؛ برگشت به همان سفارش با نتیجه
 * (`done=inquiry&r=…`) یا پیامش.
 */
export async function inquirePaymentAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.inquirePayment(session, { payment: field(form, 'payment') }, await requestIp());
  const number = result.ok ? String(result.value.orderNumber) : typeof result.orderNumber === 'number' ? String(result.orderNumber) : field(form, 'number');
  const back = panelPath(gate, `/orders/${encodeURIComponent(number.slice(0, 20))}`);
  redirect(result.ok ? withQuery(back, `done=inquiry&r=${result.value.outcome}&${doneMark()}`) : withQuery(back, `e=${result.error}&${doneMark()}`));
}

/* ───────────────────────── بازپرداخت سفارش لغوشده (۷٫۳) ───────────────────────── */

/** خطاهایی که فرم بازپرداخت همین‌جا نشان می‌دهد؛ بقیه به صفحهٔ سفارش با پیامشان، که حالت تازهٔ کارت را نشان می‌دهد. */
const REFUND_FORM_ERRORS: readonly AdminErrorCode[] = ['wrong_code', 'code_used', 'account_locked', 'unavailable', 'refund_precheck_failed'];
const MANUAL_FIELD_ERRORS: readonly AdminErrorCode[] = [
  'refund_day_invalid',
  'refund_day_future',
  'refund_day_early',
  'refund_reference_invalid',
  'refund_note_too_long',
];

function refundBack(gate: string, result: { ok: boolean; orderNumber?: unknown }, number: string) {
  const known = typeof result.orderNumber === 'number' ? String(result.orderNumber) : number;
  return panelPath(gate, `/orders/${encodeURIComponent(known.slice(0, 20))}`);
}

/**
 * «X تومان را برگردان» (برش ۷٫۳، طرح `m-refund`؛ فقط مالک، کد تازه): موفق به صفحهٔ سفارش با نتیجه (`done=refund`)؛ خطای کد و
 * پیش‌استعلامی که جواب نداد همین‌جا؛ بقیه (همین حالا جای دیگری عوض شد، درگاه می‌گوید پولش برگشته) به صفحهٔ سفارش با پیامش.
 */
export async function refundGatewayAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const result = await orders.refundFromGateway(
    session,
    number,
    { payment: field(form, 'payment'), seen: field(form, 'seen'), code: form.get('code') },
    await requestIp(),
  );
  if (result.ok) redirect(withQuery(refundBack(gate, { ok: true, orderNumber: result.value.orderNumber }, number), `done=refund&r=${result.value.outcome}&${doneMark()}`));
  if (REFUND_FORM_ERRORS.includes(result.error)) return failure(result);
  redirect(withQuery(refundBack(gate, result, number), `e=${result.error}&${doneMark()}`));
}

/**
 * «ثبت بازپرداخت دستی» (برش ۷٫۳، طرح `m-refund-manual`؛ فقط مالک، کد تازه): خطای هر فیلد و کد همین‌جا با نوشته‌ها (هرگز کد)؛ موفق
 * به صفحهٔ سفارش با «برگشت داده شد».
 */
export async function refundManualAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const values = { day: field(form, 'day').slice(0, 40), reference: field(form, 'reference').slice(0, 80), note: field(form, 'note').slice(0, 400) };
  const result = await orders.refundManual(
    session,
    number,
    { payment: field(form, 'payment'), seen: field(form, 'seen'), code: form.get('code'), ...values },
    await requestIp(),
  );
  if (result.ok) redirect(withQuery(refundBack(gate, { ok: true, orderNumber: result.value.orderNumber }, number), `done=refund&r=refunded&${doneMark()}`));
  if (REFUND_FORM_ERRORS.includes(result.error) || MANUAL_FIELD_ERRORS.includes(result.error)) return failure(result, values);
  redirect(withQuery(refundBack(gate, result, number), `e=${result.error}&${doneMark()}`));
}

/** «استعلام از درگاه» یک بازپرداخت «در حال برگشت» (برش ۷٫۳؛ مالک و متصدی): برگشت به همان سفارش با نتیجه. */
export async function inquireRefundAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.inquireRefund(session, { refund: field(form, 'refund') }, await requestIp());
  const back = refundBack(gate, result.ok ? { ok: true, orderNumber: result.value.orderNumber } : result, field(form, 'number'));
  redirect(result.ok ? withQuery(back, `done=refund_inquiry&r=${result.value.outcome}&${doneMark()}`) : withQuery(back, `e=${result.error}&${doneMark()}`));
}

/* ───────────────────────── گزارش ارسال (۶٫۴) ───────────────────────── */

export interface BandsState {
  error?: AdminErrorCode;
  /** پیام خطای هر فیلد، به ترتیب فیلدها؛ null یعنی آن فیلد درست است. */
  errors?: (string | null)[];
  /** نوشته‌های فرم، تا پس از خطا بمانند. */
  values?: string[];
}

/** صفحهٔ گزارش همان ماه (`?month=`)، اگر شکلش درست است. */
function reportHome(gate: string, month: string) {
  const parsed = parseMonthKey(month);
  return panelPath(gate, `/shipments/report${parsed ? `?month=${monthKey(parsed)}` : ''}`);
}

/**
 * «بازه‌ها را عوض کن» (تصمیم‌های ۱۰۱ و ۱۱۰، طرح `m-ship-report`): هر فیلد یک مرز؛ خطای هر فیلد زیر خودش با نوشته‌ها؛ «همین حالا
 * جای دیگری عوض شد» به گزارش با پیامش و بازه‌های تازه؛ موفق به گزارش با پیام، فقط اگر هنوز راست است (`b`). کد تازه نمی‌خواهد:
 * فقط چیدن گزارش را عوض می‌کند، و رویدادش می‌ماند.
 */
export async function saveBandsAction(_state: BandsState, form: FormData): Promise<BandsState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const values = form
    .getAll('b')
    .slice(0, REPORT_BOUNDS_MAX)
    .map((value) => (typeof value === 'string' ? value.slice(0, 20) : ''));
  const result = await settings.saveReportBands(session, { values, seen: field(form, 'seen') }, await requestIp());
  const home = reportHome(gate, field(form, 'month'));
  if (result.ok) redirect(withQuery(home, `done=bands&b=${bandsSeen(result.value.bands)}&${doneMark()}#weights`));
  if (result.error === 'setting_changed') redirect(withQuery(home, `e=setting_changed&${doneMark()}#weights`));
  if (result.error === 'invalid_bands' && Array.isArray(result.errors)) {
    const errors = (result.errors as (BoundError | null)[]).map((error) => (error ? boundErrorText(error) : null));
    return { error: result.error, errors, values };
  }
  return { error: result.error, values };
}

/** «برگرداندن به بازه‌های تعرفه» (تصمیم ۱۰۹): به گزارش با پیام یا خطا، مثل ذخیره. */
export async function resetBandsAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await settings.resetReportBands(session, { seen: field(form, 'seen') }, await requestIp());
  const home = reportHome(gate, field(form, 'month'));
  redirect(withQuery(home, result.ok ? `done=bands&b=tariff&${doneMark()}#weights` : `e=${result.error}&${doneMark()}#weights`));
}

/* ───────────────────────── مسیر خرید روی سایت (۷٫۵) ───────────────────────── */

/**
 * پلهٔ پایین مخاطب (برش ۷٫۵، ADR-052، سؤال ۱۶۹): «توقف»، «توقف مسیر خرید» یا «برگرداندن به پیش‌نمایش»، بی کد و همان لحظه، چون فقط
 * دسترسی کم می‌کند. به «تنظیمات» با پیام یا خطایش. پلهٔ بالا از این راه نمی‌گذرد: سرویس جهت را با فرم می‌سنجد، پیش از هر کد.
 */
export async function lowerAudienceAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await settings.changeAudience(session, { to: field(form, 'to'), seen: field(form, 'seen') }, await requestIp(), 'down');
  const home = panelPath(gate, '/settings');
  // خطای کارت با `ce`، جدا از `e` بقیهٔ کارت‌ها، تا «این مقدار پذیرفته نیست» تعطیلی‌ها با درخواست ساختگی مسیر خرید نیاید.
  redirect(result.ok ? `${home}?done=audience&a=${result.value.audience}&${doneMark()}#checkout` : `${home}?ce=${result.error}&${doneMark()}#checkout`);
}

/** خطاهایی که صفحهٔ «باز کردن» با برگشت به خودش می‌گوید (`?e=`): وضعیت تازه از نو، با پیامش. */
const RAISE_PAGE_ERRORS: readonly AdminErrorCode[] = ['checkout_changed', 'checkout_not_ready', 'invalid_setting', 'forbidden'];

/**
 * پلهٔ بالا با کد تازهٔ برنامهٔ تأیید (صفحهٔ «باز کردن مسیر خرید»، سؤال ۱۶۹): متوقف ← پیش‌نمایش، یا ← همه. خطای کد همین‌جا؛ وضعیتی
 * که همین حالا عوض شد به همان صفحه با پیامش؛ موفق به «تنظیمات» با پیام.
 */
export async function raiseAudienceAction(_state: FormState, form: FormData): Promise<FormState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const to = field(form, 'to');
  const result = await settings.changeAudience(session, { to, seen: field(form, 'seen'), code: form.get('code') }, await requestIp(), 'up');
  if (result.ok) redirect(`${panelPath(gate, '/settings')}?done=audience&a=${result.value.audience}&${doneMark()}#checkout`);
  if (RAISE_PAGE_ERRORS.includes(result.error)) {
    redirect(`${panelPath(gate, '/settings/checkout')}?to=${encodeURIComponent(to)}&e=${result.error}`);
  }
  return failure(result);
}

export interface PreviewState extends FormState {
  /** پیوند پیش‌نمایش، فقط همین یک بار در پاسخ؛ نه در نشانی، نه در لاگ. */
  link?: { url: string; until: string };
}

/** «پیوند پیش‌نمایش بساز» (سؤال ۱۶۷): بی کد تازه؛ پیوند فقط در حالت فرم، مثل پیوند ثبت ادمین. */
export async function previewLinkAction(_state: PreviewState, form: FormData): Promise<PreviewState> {
  const gate = field(form, 'gate');
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await settings.createPreview(session, await requestIp());
  if (!result.ok) return { error: result.error };
  return { link: { url: result.value.url, until: formatTehranTime(result.value.expiresAt) } };
}
