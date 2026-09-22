import type { NextRequest } from 'next/server';

import { getUploadService, guarded, respond, sessionOf, unavailable } from '../../../../../lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * تکمیل. سرور خودش از استوریج می‌پرسد چه رسیده؛ اگر تکه‌ای کم باشد ۴۰۹ با
 * فهرست `missing` برمی‌گردد تا مرورگر همان‌ها را دوباره بفرستد.
 */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(async () => {
    const service = getUploadService();
    if (!service) return unavailable();
    const session = sessionOf(request);
    if (!session) return respond({ ok: false, status: 404, error: 'not_found' });
    return respond(await service.complete(session, (await params).id));
  });
}
