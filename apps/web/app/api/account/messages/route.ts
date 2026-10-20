import type { NextRequest } from 'next/server';

import { accountService, accountUserOf, withAccount } from '../../../../lib/server/accountContext';
import { jsonBody, respond } from '../../../../lib/server/context';
import { fail } from '../../../../lib/server/result';

export const dynamic = 'force-dynamic';

/**
 * پیام مشتری به پشتیبانی (برش ۱۲٫۱، ADR-068، سؤال‌های ۳۰۹ و ۳۱۰). بدنه: `supportMessageSchema`. فقط با نشست؛ گفت‌وگو اگر نیست ساخته
 * می‌شود، و پاسخ `{ threadId }` تا صفحه به همان گفت‌وگو برود. دو کلیک با یک فرم یک پیام است.
 */
export function POST(request: NextRequest) {
  return withAccount(request, async () => {
    const user = await accountUserOf(request);
    if (!user) return respond(fail(401, 'auth_required'));
    const body = await jsonBody(request);
    if (!body) return respond(fail(400, 'invalid_request'));
    return respond(await accountService().post(user, body));
  });
}
