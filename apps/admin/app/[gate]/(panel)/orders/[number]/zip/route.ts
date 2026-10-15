import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../lib/gate';
import { requestIp, requirePanel, requireSession } from '../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../lib/server/download';

/** «همهٔ فایل‌ها (zip)» یک سفارش (برش ۹٫۱، ADR-056): مجوز، آمادگی، رویداد و شکست با پیام در سرویس، مثل فایل چاپ هر جلد. */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; number: string }> }) {
  const { gate, number } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.downloadZip(session, number, await requestIp());
  if (!result.ok) redirect(`${panelPath(gate, `/orders/${encodeURIComponent(number)}`)}?e=${result.error}`);
  return fileResponse(result.value, 'application/zip', 'attachment');
}
