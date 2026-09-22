import { NextResponse, type NextRequest } from 'next/server';

import {
  ensureSession,
  getUploadService,
  guarded,
  jsonBody,
  respond,
  unavailable,
  withSessionCookie,
} from '../../../lib/server/context';

/**
 * شروع آپلود: سند، آپلود چندتکه در استوریج، و برنامهٔ تکه‌ها.
 *
 * بدنه: `{ name, sizeBytes, mimeType? }`. بایتی اینجا نمی‌آید — مرورگر تکه‌ها
 * را با URL امضاشده مستقیم به استوریج می‌فرستد (ADR-024).
 */
export const dynamic = 'force-dynamic';

export function POST(request: NextRequest) {
  return guarded(async () => {
    const service = getUploadService();
    if (!service) return unavailable();

    const body = await jsonBody(request);
    if (!body) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

    const { sessionHash, newToken } = ensureSession(request);
    const result = await service.create(sessionHash, {
      name: String(body.name ?? ''),
      sizeBytes: Number(body.sizeBytes),
      mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
    });
    return withSessionCookie(respond(result), request, result.ok ? newToken : undefined);
  });
}
