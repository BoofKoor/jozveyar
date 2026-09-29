/**
 * بارکد ۲۴ رقمی پست در شش گروه چهارتایی برای خواندن (طرح `jy-barcode`)؛ فاصله در CSS است، پس کپی همان ۲۴ رقم است. ماژول جدا و بی
 * وابستگی: `Barcode` از راه `Segments` در ویرایشگر تعرفه هم هست، که جزء مرورگری است، و نباید `@jozveyar/db` را به مرورگر بکشد.
 */
export const barcodeGroups = (barcode: string): string[] => barcode.match(/.{1,4}/g) ?? [barcode];
