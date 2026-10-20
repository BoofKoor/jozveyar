import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../../lib/gate';
import { searchOf } from '../../../../../../../lib/production';
import { requestIp, requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { XLSX_TYPE, fileResponse } from '../../../../../../../lib/server/download';

const PARAMS = ['d', 'from', 'to'] as const;

/**
 * خروجی اکسل صورت‌حساب تسویه (برش ۱۰٫۳، سؤال ۴۰۰): همان بازهٔ صفحه، همان صورت‌حساب، با رویداد. پیوند ساده (`<a download>`)، نه `Link`
 * نکست، تا پیش‌واکشی رویداد نسازد. شکست به همان صورت‌حساب با پیامش.
 */
export async function GET(request: Request, { params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { exports } = requirePanel(gate);
  const session = await requireSession(gate);
  const url = new URL(request.url);
  const query = Object.fromEntries(
    PARAMS.map((name) => [name, (url.searchParams.get(name) ?? '').slice(0, 40)] as const).filter(([, value]) => value !== ''),
  );
  const result = await exports.xlsx(session, 'settlement', { ...query, p: id }, await requestIp());
  if (!result.ok) redirect(`${panelPath(gate, `/reports/settlement/${id}`)}${searchOf({ ...query, e: result.error })}`);
  return fileResponse(result.value, XLSX_TYPE, 'attachment');
}
