import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../../lib/gate';
import { requestIp, requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../../lib/server/download';

/**
 * دانلود PDF اصلی جزوه (ADR-037، برش ۴٫۲؛ از ۵٫۱ «PDF اصلی جزوه» کنار فایل چاپ). مجوز `files.download` و رویداد دانلود در
 * سرویس (`lib/server/orders.ts`). هر شکست به صفحهٔ همان سفارش برمی‌گردد با پیام روشن (`?e=`)، نه صفحهٔ خطای خام.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; number: string; item: string }> }) {
  const { gate, number, item } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.download(session, number, item, await requestIp());
  if (!result.ok) redirect(`${panelPath(gate, `/orders/${encodeURIComponent(number)}`)}?e=${result.error}`);
  return fileResponse(result.value, 'application/pdf', 'attachment');
}
