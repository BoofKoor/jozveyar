import type { ColorMode, PaperSize, SidesMode } from '@jozveyar/contracts';
import { DEFAULT_PAPER_SIZE } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID } from '@jozveyar/pricing/seed';

/**
 * انتخاب‌های چاپ جزوه. خود حالت در پوستهٔ فلوی سفارش (`OrderFlow`) می‌ماند، تا با «فایل دیگری
 * بینداز» گم نشود؛ پیش‌فرض‌ها از تعرفه‌اند و رابط پس از فایل آنها را می‌گذارد (`INITIAL_CONFIG`
 * پایین)، تا تعرفه به باندل اولیه نیاید: پوسته از این ماژول فقط type می‌گیرد.
 */
export interface OrderConfig {
  colorMode: ColorMode;
  sidesMode: SidesMode;
  /** اندازهٔ کاغذ (برش ۸٫۳). */
  paperSize: PaperSize;
  bindingTypeId: string;
  paperTypeId: string;
  copies: number;
}

/**
 * انتخاب‌های پیش‌فرض، از تعرفه: سیاه‌سفید، دورو، A4، یک نسخه. میز سفارش، ماشین‌حساب «تعرفه» و پیش‌فرض صفحه‌های فرود (برش ۱۵٫۲) همین را
 * دارند.
 */
export const INITIAL_CONFIG: OrderConfig = {
  colorMode: 'bw',
  sidesMode: 'double',
  paperSize: DEFAULT_PAPER_SIZE,
  bindingTypeId: DEFAULT_BINDING_TYPE_ID,
  paperTypeId: DEFAULT_PAPER_TYPE_ID,
  copies: 1,
};
