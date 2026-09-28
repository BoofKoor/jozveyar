import type { DownloadFile } from './orders';

/**
 * پاسخ یک فایل سفارش (برش ۴٫۲ و ۵٫۱): جریانی از استوریج داخلی، از راه خود پنل (ADR-037). `X-Accel-Buffering: no` تا Nginx
 * جزوهٔ چندصدمگابایتی را روی دیسک خودش بافر نکند؛ `Range` پشتیبانی نمی‌شود؛ و هیچ نسخه‌ای در کش مرورگر نمی‌ماند.
 */
export function fileResponse(file: DownloadFile, type: 'application/pdf' | 'image/png', disposition: 'attachment' | 'inline') {
  return new Response(file.body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `${disposition}; filename="${file.fileName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'Accept-Ranges': 'none',
    },
  });
}
