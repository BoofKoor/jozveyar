import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../../lib/gate';
import { requestIp, requirePanel, requireSession } from '../../../../../../../lib/server/context';

/**
 * دانلود PDF جزوه (ADR-037، برش ۴٫۲): جریانی از استوریج داخلی، از راه خود پنل؛ مسیر `/jozveyar/` Nginx همان «فقط
 * PUT» می‌ماند. مجوز `files.download` و رویداد دانلود در سرویس (`lib/server/orders.ts`). هر شکست به صفحهٔ همان
 * سفارش برمی‌گردد با پیام روشن (`?e=`)، نه صفحهٔ خطای خام.
 *
 * `X-Accel-Buffering: no` تا Nginx جزوهٔ چندصدمگابایتی را روی دیسک خودش بافر نکند؛ `Range` پشتیبانی نمی‌شود.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; number: string; item: string }> }) {
  const { gate, number, item } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.download(session, number, item, await requestIp());
  if (!result.ok) redirect(`${panelPath(gate, `/orders/${encodeURIComponent(number)}`)}?e=${result.error}`);
  const { body, sizeBytes, fileName } = result.value;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(sizeBytes),
      'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'Accept-Ranges': 'none',
    },
  });
}
