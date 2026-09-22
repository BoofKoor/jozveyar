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

/** URL امضاشدهٔ چند تکه. بدنه: `{ partNumbers: number[] }` (حداکثر ۵۰). */
export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(async () => {
    const service = getUploadService();
    if (!service) return unavailable();
    const session = sessionOf(request);
    if (!session) return respond({ ok: false, status: 404, error: 'not_found' });
    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    return respond(await service.presignParts(session, (await params).id, body.partNumbers));
  });
}
