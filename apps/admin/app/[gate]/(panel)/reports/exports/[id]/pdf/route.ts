import { notFound, redirect } from 'next/navigation';

import { panelPath } from '../../../../../../../lib/gate';
import { requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../../lib/server/download';

/** PDF یک خروجی گزارش (برش ۱۰٫۲، سؤال ۲۷۸): فقط خواهنده، با همان دسترسی امروز؛ هنوز ساخته نشده به صفحهٔ همان خروجی. */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { exports } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await exports.file(session, id);
  if (!result.ok) {
    if (result.status === 404) notFound();
    redirect(panelPath(gate, `/reports/exports/${encodeURIComponent(id)}`));
  }
  return fileResponse(result.value, 'application/pdf', 'attachment');
}
