import { requirePanel, requireSession } from '../../../../../../../lib/server/context';
import { fileResponse, type DownloadType } from '../../../../../../../lib/server/download';

/**
 * یک فایل ساختهٔ کارگر از یک بارگذاری لوگو یا بنر (برش ۱۱٫۲)، برای `<img>` پیش‌نمایش پنل: لوگو، نشانک، آیکون گوشی، تصویر اشتراک، یا بنر دسکتاپ و
 * گوشی؛ مجوز همان نوع بارگذاری. فایل‌ها را کارگر از نو ساخته، پس بایت خود مدیر نیست. شکست فقط وضعیت HTTP، چون تصویر است و صفحه نیست.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ gate: string; id: string; name: string }> }) {
  const { gate, id, name } = await params;
  const { images } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await images.file(session, id, name);
  if (!result.ok) return new Response(null, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  const { body, sizeBytes, fileName, contentType } = result.value;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
  return fileResponse({ body: stream, sizeBytes, fileName }, contentType as DownloadType, 'inline');
}
