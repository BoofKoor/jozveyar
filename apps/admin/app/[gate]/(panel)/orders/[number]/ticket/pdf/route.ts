import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../../lib/gate';
import { requestIp, requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../../lib/server/download';

/** دانلود برگهٔ سفارش (برش ۵٫۱، ADR-043): فقط برگه‌ای که با دادهٔ امروز سفارش ساخته شده، با رویداد. */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; number: string }> }) {
  const { gate, number } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.downloadTicket(session, number, 'pdf', await requestIp());
  if (!result.ok) redirect(`${panelPath(gate, `/orders/${encodeURIComponent(number)}`)}?e=${result.error}`);
  return fileResponse(result.value, 'application/pdf', 'attachment');
}
