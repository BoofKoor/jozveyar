/**
 * نقش‌هایی که مالک به ادمین می‌دهد، به ترتیب کاشی‌ها و با کار هر کدام در یک خط: فرم «افزودن ادمین» (طرح `m-admin-invite`) و از ۹٫۴ «عوض
 * کردن نقش». مجوز هر نقش در کد است (`ADMIN_ROLES`، «نقش‌ساز نه» ADR-038)؛ این فقط متن انتخاب است، و تست می‌سنجد که هر نقش کاشی دارد.
 */
export const ROLE_TILES = [
  { role: 'operator', note: 'همهٔ سفارش‌ها، وضعیت، لغو، نشانی، جابه‌جایی چاپخانه و دانلود' },
  { role: 'accountant', note: 'همهٔ سفارش‌ها با مبلغ، پرداخت‌ها، بازپرداخت و گزارش‌ها؛ بی وضعیت و دانلود' },
  { role: 'print_partner', note: 'فقط سفارش‌های یک چاپخانه: دانلود، شروع چاپ، تحویل پست و گزارش تولید؛ بی مبلغ' },
  { role: 'owner', note: 'همه‌چیز، با تعرفه، کلیدها، چاپخانه‌ها و ادمین‌ها' },
] as const;

export type RoleTile = (typeof ROLE_TILES)[number]['role'];

export const isRoleTile = (value: unknown): value is RoleTile => ROLE_TILES.some((tile) => tile.role === value);
