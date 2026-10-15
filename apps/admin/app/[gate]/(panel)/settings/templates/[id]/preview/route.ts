import { requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../../lib/server/download';

/**
 * PNG صفحهٔ `?page=` آخرین پیش‌نمایش درست یک نسخهٔ قالب (برش ۹٫۲)، برای `<img>` صفحهٔ نسخه؛ همان PNG که کارگر از PDF پیش‌نمایش ساخت.
 * شکست فقط وضعیت HTTP، چون تصویر است و صفحه نیست.
 */
export async function GET(request: Request, { params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { templates } = requirePanel(gate);
  const session = await requireSession(gate);
  const param = new URL(request.url).searchParams.get('page') ?? '1';
  const page = /^[1-9][0-9]{0,2}$/.test(param) ? Number(param) : 0;
  const result = await templates.previewFile(session, id, { page });
  if (!result.ok) return new Response(null, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  return fileResponse(result.value, 'image/png', 'inline');
}
