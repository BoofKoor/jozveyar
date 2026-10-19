import type { DownloadFile } from './orders';

/** نوع کتاب اکسل (XLSX). */
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** نوع‌هایی که پنل می‌فرستد؛ از ۱۱٫۲ فایل‌های لوگو و بنر هم (JPEG بنر و ICO نشانک). */
export type DownloadType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/x-icon' | 'application/zip' | typeof XLSX_TYPE;

/**
 * پاسخ یک فایل سفارش (برش ۴٫۲ و ۵٫۱): جریانی از استوریج داخلی، از راه خود پنل (ADR-037). `X-Accel-Buffering: no` تا Nginx
 * جزوهٔ چندصدمگابایتی را روی دیسک خودش بافر نکند؛ `Range` پشتیبانی نمی‌شود؛ و هیچ نسخه‌ای در کش مرورگر نمی‌ماند. از ۱۰٫۲ خروجی
 * گزارش‌ها هم (`XLSX_TYPE` و PDF).
 */
export function fileResponse(file: DownloadFile, type: DownloadType, disposition: 'attachment' | 'inline') {
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
