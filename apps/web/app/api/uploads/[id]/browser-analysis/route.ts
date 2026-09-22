import { NextResponse, type NextRequest } from 'next/server';

import {
  getUploadService,
  guarded,
  jsonBody,
  respond,
  sessionOf,
  unavailable,
} from '../../../../../lib/server/context';

export const dynamic = 'force-dynamic';

/**
 * تحلیلی که مرورگر دید. کنار تحلیل سرور ذخیره می‌شود تا اختلاف دو طرف قابل
 * سنجش باشد (ADR-002). قیمت هیچ‌وقت از این نمی‌آید — سرور منبع حقیقت است.
 */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(async () => {
    const service = getUploadService();
    if (!service) return unavailable();
    const session = sessionOf(request);
    if (!session) return respond({ ok: false, status: 404, error: 'not_found' });
    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    return respond(await service.saveBrowserAnalysis(session, (await params).id, body));
  });
}
