import { redirect } from 'next/navigation';

import { panelPath } from '../../../../../../../lib/gate';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../../lib/server/download';

/** PDF آخرین پیش‌نمایش درست یک نسخهٔ قالب (برش ۹٫۲)، برای چاپ آزمایشی؛ شکست با پیامش به صفحهٔ همان نسخه. */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { templates } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await templates.previewFile(session, id, 'pdf');
  if (!result.ok) redirect(`${panelPath(gate, `/settings/templates/${encodeURIComponent(id)}`)}?e=${result.error}`);
  return fileResponse(result.value, 'application/pdf', 'attachment');
}
