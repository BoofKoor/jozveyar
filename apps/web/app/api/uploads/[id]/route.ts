import type { NextRequest } from 'next/server';

import { getUploadService, guarded, respond, sessionOf, unavailable } from '../../../../lib/server/context';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** کدام تکه‌ها رسیده‌اند — برای ادامهٔ آپلود بعد از قطع یا رفرش. */
export function GET(request: NextRequest, { params }: Params) {
  return guarded(async () => {
    const service = getUploadService();
    if (!service) return unavailable();
    const session = sessionOf(request);
    if (!session) return respond({ ok: false, status: 404, error: 'not_found' });
    return respond(await service.status(session, (await params).id));
  });
}

/** لغو: کاربر فایل دیگری انداخت. دیسک همین حالا آزاد می‌شود. */
export function DELETE(request: NextRequest, { params }: Params) {
  return guarded(async () => {
    const service = getUploadService();
    if (!service) return unavailable();
    const session = sessionOf(request);
    if (!session) return respond({ ok: false, status: 404, error: 'not_found' });
    return respond(await service.abort(session, (await params).id));
  });
}
