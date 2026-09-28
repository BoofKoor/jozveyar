/**
 * جدول فایل پست برای تست‌ها، به همان شکل فایل پست واقعی (سؤال ۵۹، `FileName-1954.xls`): همان ۲۲ سرستون و ترتیب، «بارکد » و
 * «تاریخ ثبت » با فاصلهٔ ته، بارکد با فاصلهٔ نشکن ته، خانهٔ خالی فاصلهٔ نشکن، و ردیف «جمع کل» با ردیف 0. همه ساختگی‌اند: دادهٔ
 * واقعی مشتری به مخزن نمی‌آید. کارگر پایتون همین شکل را در `services/docworker/tests/postfiles.py` دارد.
 */

export const POST_HEADERS = [
  'ردیف', 'عنوان مرسوله', 'بارکد ', 'مخزن', 'وضعیت', 'تاریخ ثبت ', 'خدمات ویژه', 'مقصد', 'شماره مرجع', 'نام ف', 'آدرس ف',
  'نام گ', 'آدرس گ', 'کاربر', 'وزن', 'مالیات', 'بیمه', 'کرایه پستی', 'هزینه کل', 'شماره ثبت', 'ک ق استانی', 'ک ق سراسری',
];

export type ParcelOverride = Partial<Record<'date' | 'status' | 'total' | 'tax', string>>;

/** یک بسته؛ مالیات ده درصد کرایه، گرد به بالا از نیم، مثل فایل واقعی. */
export function parcel(n: number, barcode: string, nameG: string, destination: string, grams: number, fareRials: number, over: ParcelOverride = {}) {
  const tax = Math.floor((fareRials + 5) / 10);
  return [
    String(n), 'پاکت جوف', `${barcode} `, 'نقش تمبر', over.status ?? 'فعال', over.date ?? '1405/07/12', 'پیشتاز SMS', destination,
    '162664', 'فرستنده نمونه', 'نشانی نمونه', nameG, '...', 'متصدی نمونه', String(grams), over.tax ?? String(tax), '100000',
    String(fareRials), over.total ?? String(fareRials + tax), '19921', '0', '0',
  ];
}

/** ردیف «جمع کل» سطرها. */
export function totalRow(rows: string[][]) {
  const sum = (i: number) => String(rows.reduce((s, r) => s + Number(r[i]), 0));
  const nb = ' ';
  return ['0', nb, 'جمع کل', nb, nb, nb, nb, nb, '0', nb, nb, nb, nb, nb, sum(14), sum(15), sum(16), sum(17), sum(18), '0', '0', '0'];
}

/** جدول کامل: سرستون، سطرها، و «جمع کل». */
export const postTable = (rows: string[][], total = true) => [POST_HEADERS, ...rows, ...(total ? [totalRow(rows)] : [])];

/** بارکد ۲۴ رقمی ساختگی با پیشوند فایل واقعی. */
export const barcodeOf = (n: number) => `1188${String(n).padStart(20, '0')}`;
