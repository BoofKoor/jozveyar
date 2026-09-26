/**
 * QR پیوند ثبت، روی سرور و به شکل یک مسیر SVG (`fill="currentColor"`)، مثل طرح: نه تصویر جدا، نه
 * canvas، نه اسکریپت. `qrcode` فقط ماتریس را می‌سازد؛ کشیدنش اینجاست. سطح تصحیح M، و حاشیهٔ آرام ۴ خانه
 * در `viewBox` (استاندارد QR).
 */

import QRCode from 'qrcode';

export const QR_QUIET_ZONE = 4;

export function qrPath(text: string): { size: number; d: string } {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  let d = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; ) {
      if (!data[y * size + x]) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run += 1;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { size, d };
}
