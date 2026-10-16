import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../lib/gate';
import { requestIp, requirePanel, requireSession } from '../../../../../../lib/server/context';
import { XLSX_TYPE, fileResponse } from '../../../../../../lib/server/download';

/**
 * خروجی اکسل گزارش ارسال (برش ۱۰٫۲، سؤال ۲۸۰): همان ماه صفحه (`?month=1405-07`)، با رویداد. شکست به همان گزارش با پیامش.
 */
export async function GET(request: Request, { params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { exports } = requirePanel(gate);
  const session = await requireSession(gate);
  const month = (new URL(request.url).searchParams.get('month') ?? '').slice(0, 20);
  const result = await exports.xlsx(session, 'shipping', month ? { month } : {}, await requestIp());
  if (!result.ok) {
    const back = new URLSearchParams({ ...(month ? { month } : {}), e: result.error });
    redirect(`${panelPath(gate, '/shipments/report')}?${back.toString()}`);
  }
  return fileResponse(result.value, XLSX_TYPE, 'attachment');
}
