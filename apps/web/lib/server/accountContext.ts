/**
 * سیم‌کشی «سفارش‌های من» (برش ۱۲٫۱، ADR-068) به پایگاه داده و درخواست HTTP.
 *
 * پشت حالت مسیر خرید نیست (سؤال ۳۰۵): مثل صفحهٔ سفارش، پایگاه داده کافی است، به‌علاوهٔ `SESSION_SECRET` که کد پیامکی بی آن ساخته نمی‌شود.
 * سفارشی که پرداخت شد با `off` یا «متوقف» شدن خرید از فهرست مشتری گم نمی‌شود، و پاسخ پشتیبانی هم. بی هر دو، صفحه‌ها و مسیرها ۴۰۴اند،
 * مثل هر نشانی ناموجود.
 */

import type { NextRequest, NextResponse } from 'next/server';

import { createAccountStore, createSupportStore, getDb } from '@jozveyar/db';

import { createAccountService, type AccountService } from './account';
import type { AuthUser } from './auth';
import { accountAuthService, authTokenOf, notFound, sessionUserOf, unavailable } from './checkoutContext';
import { sessionSecretOf } from './checkoutMode';
import { liveText, loadPublished } from './content';

/** «سفارش‌های من» این سرور باز است: پایگاه داده و `SESSION_SECRET` (دست‌کم ۳۲ نویسه). */
export function accountOpen(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(env.DATABASE_URL) && sessionSecretOf(env.SESSION_SECRET) !== null;
}

let service: AccountService | undefined;

/** سرویس «سفارش‌های من»؛ `accountOpen` پیش از آن. */
export function accountService(): AccountService {
  if (service) return service;
  const db = getDb();
  service = createAccountService({
    account: createAccountStore(db),
    support: createSupportStore(db),
    // ساعت پاسخ‌گویی همان «تماس» (سؤال ۳۰۹)، از آخرین نسخهٔ «تماس و پاورقی».
    hours: async () => liveText('contact', await loadPublished()).content.hours || null,
  });
  return service;
}

export { accountAuthService, sessionUserOf };

/** کاربر نشست این درخواست، یا null. */
export const accountUserOf = (request: NextRequest): Promise<AuthUser | null> => sessionUserOf(authTokenOf(request));

/** یک مسیر «سفارش‌های من»: بی پایگاه داده یا رمز نشست ۴۰۴، و خطای پیش‌بینی‌نشده ۵۰۳ با لاگ. */
export async function withAccount(request: NextRequest, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  if (!accountOpen()) return notFound();
  try {
    return await handler();
  } catch (error) {
    console.error('✗ خطای «سفارش‌های من»:', error);
    return unavailable();
  }
}
