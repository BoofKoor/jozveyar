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
 * «دوباره بساز» PDF جزوه (۴٫۲): برگشت به همان سفارش، که حالا «در حال ساختن» است؛ شکست با پیامش (`?e=`). کار
 * حساس نیست (چیزی را برنمی‌گرداند و پولی جابه‌جا نمی‌کند)، پس کد تازه نمی‌خواهد؛ مجوز و رویدادش در سرویس.
 */
export async function rebuildPdfAction(form: FormData): Promise<void> {
  const gate = field(form, 'gate');
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const number = field(form, 'number');
  const result = await orders.rebuild(session, number, await requestIp());
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
