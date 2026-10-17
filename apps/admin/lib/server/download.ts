import type { DownloadFile } from './orders';

/** نوع کتاب اکسل (XLSX). */
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * پاسخ یک فایل سفارش (برش ۴٫۲ و ۵٫۱): جریانی از استوریج داخلی، از راه خود پنل (ADR-037). `X-Accel-Buffering: no` تا Nginx
 * جزوهٔ چندصدمگابایتی را روی دیسک خودش بافر نکند؛ `Range` پشتیبانی نمی‌شود؛ و هیچ نسخه‌ای در کش مرورگر نمی‌ماند. از ۱۰٫۲ خروجی
 * گزارش‌ها هم (`XLSX_TYPE` و PDF).
 */
export function fileResponse(file: DownloadFile, type: 'application/pdf' | 'image/png' | 'application/zip' | typeof XLSX_TYPE, disposition: 'attachment' | 'inline') {
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
