import { toLatinDigits } from '@jozveyar/text';

/**
 * متن فارسی با عدد و واژهٔ لاتین درونش، برای بخش‌های ثابت صفحه: عدد در `.num` خودش و واژهٔ لاتین
 * در `bdi`، تا «PDF، Word» کنار ویرگول فارسی برعکس دیده نشود. خود متن دست نمی‌خورد (همان متن در
 * JSON-LD هم هست)؛ فقط رقم فارسی لاتین می‌شود («تحریر ۸۰ گرم» تعرفه).
 */
export function Inline({ text }: { text: string }) {
  return toLatinDigits(text)
    .split(/([A-Za-z]+|\d+(?:[.,]\d+)*)/)
    .map((part, i) =>
      i % 2 === 0 ? (
        part
      ) : /\d/.test(part) ? (
        <span key={i} className="num">
          {part}
        </span>
      ) : (
        <bdi key={i}>{part}</bdi>
      ),
    );
}
