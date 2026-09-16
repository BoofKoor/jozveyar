import { NextResponse } from 'next/server';

/**
 * سلامت سرویس — برای healthcheck داکر و پروکسی.
 *
 * عمداً چیزی جز وضعیت خودِ فرایند نمی‌گوید: نسخه، زمان بالا بودن، و بس.
 * هیچ اطلاعاتی از محیط یا پیکربندی بیرون نمی‌دهد.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    uptimeSeconds: Math.round(process.uptime()),
  });
}
