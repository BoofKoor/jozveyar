import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../lib/gate';
import { searchOf } from '../../../../../lib/production';
import { requestIp, requirePanel, requireSession } from '../../../../../lib/server/context';
import { XLSX_TYPE, fileResponse } from '../../../../../lib/server/download';

const PARAMS = ['d', 'from', 'to', 'nfrom', 'nto', 'p'] as const;

/**
 * خروجی اکسل گزارش تولید (برش ۱۰٫۲، سؤال ۲۷۷): همان پارامترهای صفحه، همان گزارش، با رویداد. پیوند ساده (`<a download>`)، نه `Link`
 * نکست، تا پیش‌واکشی رویداد نسازد. شکست به همان گزارش با پیامش.
 */
export async function GET(request: Request, { params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { exports } = requirePanel(gate);
  const session = await requireSession(gate);
  const url = new URL(request.url);
  const query = Object.fromEntries(
    PARAMS.map((name) => [name, (url.searchParams.get(name) ?? '').slice(0, 40)] as const).filter(([, value]) => value !== ''),
  );
  const result = await exports.xlsx(session, 'production', query, await requestIp());
  if (!result.ok) redirect(`${panelPath(gate, '/reports')}${searchOf({ ...query, e: result.error })}`);
  return fileResponse(result.value, XLSX_TYPE, 'attachment');
}
