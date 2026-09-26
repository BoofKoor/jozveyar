import { NextResponse } from 'next/server';

/**
 * سلامت پنل، برای healthcheck داکر. مثل سایت فقط وضعیت خود فرایند؛ نه پیکربندی، نه مسیر محرمانه.
 * بیرون دروازه است (`middleware.ts`) ولی Nginx آن را بیرون نمی‌دهد.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'admin', uptimeSeconds: Math.round(process.uptime()) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
