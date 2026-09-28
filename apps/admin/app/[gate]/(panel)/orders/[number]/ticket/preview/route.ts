import { requestIp, requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { fileResponse } from '../../../../../../../lib/server/download';

/**
 * پیش‌نمایش برگهٔ سفارش (برش ۵٫۱): PNG همان PDF، برای `<img>` صفحهٔ برگه. همان سنجش‌های دانلود، بی رویداد: همان داده‌های
 * صفحهٔ سفارش است. شکست فقط وضعیت HTTP، چون تصویر است و صفحه نیست.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; number: string }> }) {
  const { gate, number } = await params;
  const { orders } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await orders.downloadTicket(session, number, 'preview', await requestIp());
  if (!result.ok) return new Response(null, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  return fileResponse(result.value, 'image/png', 'inline');
}
