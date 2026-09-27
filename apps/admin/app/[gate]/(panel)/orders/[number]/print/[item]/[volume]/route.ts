import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../../../lib/gate';
import { requestIp, requirePanel, requireSession } from '../../../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../../../lib/server/download';

/** دانلود فایل چاپ یک جلد (برش ۵٫۱، ADR-043)، مثل PDF جزوه: مجوز، رویداد و شکست با پیام در سرویس. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gate: string; number: string; item: string; volume: string }> },
) {
  const { gate, number, item, volume } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.downloadVolume(session, number, item, volume, await requestIp());
  if (!result.ok) redirect(`${panelPath(gate, `/orders/${encodeURIComponent(number)}`)}?e=${result.error}`);
  return fileResponse(result.value, 'application/pdf', 'attachment');
}
