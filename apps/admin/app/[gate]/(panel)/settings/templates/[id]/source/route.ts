import { notFound } from 'next/navigation';

import { requirePanel, requireSession } from '../../../../../../../lib/server/context';

/**
 * دانلود متن یک نسخهٔ قالب، یا قالب پیش‌فرض (`default-<نوع>`)، برای ویرایش (برش ۹٫۲). قالب HTML ناشناس است، پس هرگز به شکل صفحه در
 * مبدأ پنل باز نمی‌شود: پیوست، نوع بایت خام و `nosniff`؛ و CSP همهٔ پاسخ‌های پنل (`middleware.ts`) اسکریپت بی nonce را هم نمی‌گذارد.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { templates } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await templates.source(session, id);
  if (!result.ok) {
    if (result.status === 404) notFound();
    return new Response(null, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  }
  const { fileName, html } = result.value;
  return new Response(html, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
