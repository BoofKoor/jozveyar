import { NextResponse, type NextRequest } from 'next/server';

import type { CheckoutPreviewStatus } from '@jozveyar/contracts/checkout';
import { newPreviewToken, PREVIEW_TOKEN, previewHash } from '@jozveyar/db';
import { formatJalaliWeekday, formatTehranTime } from '@jozveyar/text';

import {
  clearPreviewCookies,
  notFound,
  previewOpenable,
  previews,
  previewTokenOf,
  unavailable,
  withPreviewCookies,
} from '../../../../lib/server/checkoutContext';
import { noStore } from '../../../../lib/server/context';

export const dynamic = 'force-dynamic';

/** «تا سه‌شنبه 11:20» نوار: روز هفته و ساعت تهران؛ کوکی ۲۴ ساعت است، پس تاریخ لازم نیست. */
const until = (at: Date) => ({ until: at.toISOString(), untilDay: formatJalaliWeekday(at).split(' ')[0]!, untilTime: formatTehranTime(at) });

/**
 * باز کردن پیوند پیش‌نمایش مالک (برش ۷٫۵، ADR-052، سؤال ۱۶۷): فرم صفحهٔ `/preview/<توکن>`، با POST، نه GET، تا پیش‌نمایش پیوند در
 * پیام‌رسان یا مرورگر آن را نسوزاند. فقط در `live` آماده و مخاطب «پیش‌نمایش مالک»؛ یک بار، پیش از انقضای ۱۵ دقیقه، و فقط اگر بسته نشده.
 * کوکی تازه (`jy_preview` و نشانهٔ `jy_pv`) با عمر ۲۴ ساعت، و هدایت به صفحهٔ اصلی؛ پیوندی که دیگر باز نمی‌شود به همان صفحه برمی‌گردد
 * تا بگوید چرا. توکن هیچ‌جا لاگ نمی‌شود.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await previewOpenable())) return notFound();
    const form = await request.formData().catch(() => null);
    const token = form?.get('token');
    if (typeof token !== 'string' || !PREVIEW_TOKEN.test(token)) return notFound();
    const cookie = newPreviewToken();
    const opened = await previews().open({ tokenHash: previewHash(token), cookieHash: previewHash(cookie), at: new Date() });
    const response = new NextResponse(null, { status: 303, headers: { ...noStore, location: opened ? '/' : `/preview/${token}` } });
    return opened ? withPreviewCookies(response, request, cookie, opened.cookieExpiresAt) : response;
  } catch (error) {
    console.error('✗ خطای پیش‌نمایش مسیر خرید:', error);
    return unavailable();
  }
}

/**
 * نوار پیش‌نمایش (سؤال ۱۶۸): اسکریپت کوچک layout فقط با نشانهٔ `jy_pv` می‌پرسد. پیش‌نمایش زنده یعنی `live` آماده، مخاطب «پیش‌نمایش
 * مالک»، و کوکی بازشده، بسته‌نشده و نامنقضی؛ وگرنه هر دو کوکی پاک می‌شوند و نوار نمی‌آید. خطای پایگاه داده کوکی‌ها را پاک نمی‌کند.
 */
export async function GET(request: NextRequest) {
  const token = previewTokenOf(request);
  let status: CheckoutPreviewStatus = { active: false };
  try {
    if (token && (await previewOpenable())) {
      const session = await previews().session(previewHash(token), new Date());
      if (session) status = { active: true, ...until(session.cookieExpiresAt) };
    }
  } catch (error) {
    console.error('✗ خطای پیش‌نمایش مسیر خرید:', error);
    return unavailable();
  }
  const response = NextResponse.json(status, { headers: noStore });
  return status.active ? response : clearPreviewCookies(response, request);
}

/** «خروج از پیش‌نمایش» (سؤال ۱۶۷): ردیف همین کوکی در پایگاه داده هم بسته می‌شود، و هر دو کوکی پاک. در هر حالت، چون فقط دسترسی کم می‌کند. */
export async function DELETE(request: NextRequest) {
  const token = previewTokenOf(request);
  try {
    if (token && process.env.DATABASE_URL) await previews().close(previewHash(token), new Date());
  } catch (error) {
    console.error('✗ خطای پیش‌نمایش مسیر خرید:', error);
    return unavailable();
  }
  const closed: CheckoutPreviewStatus = { active: false };
  return clearPreviewCookies(NextResponse.json(closed, { headers: noStore }), request);
}
