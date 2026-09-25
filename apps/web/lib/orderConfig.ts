import type { ColorMode, SidesMode } from '@jozveyar/contracts';

/**
 * انتخاب‌های چاپ جزوه. خود حالت در پوستهٔ فلوی سفارش (`OrderFlow`) می‌ماند، تا با «فایل دیگری
 * بینداز» گم نشود؛ پیش‌فرض‌ها از تعرفه‌اند و رابط پس از فایل آنها را می‌گذارد (`INITIAL_CONFIG` در
 * `components/OrderDesk.tsx`)، تا تعرفه به باندل اولیه نیاید.
 */
export interface OrderConfig {
  colorMode: ColorMode;
  sidesMode: SidesMode;
  bindingTypeId: string;
  paperTypeId: string;
  copies: number;
}
