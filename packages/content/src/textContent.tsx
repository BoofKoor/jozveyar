/**
 * متن فارسی با عدد و واژهٔ لاتین درونش (برش ۱۱٫۱): عدد در `.num` خودش و واژهٔ لاتین در `bdi`؛ واژه‌ای با نقطه یا @ (`sms.ir`، ایمیل، `A4`) یک
 * تکه است، وگرنه در متن راست‌به‌چپ برعکس دیده می‌شد. جدا از `render.tsx`، تا بلوک‌های زنده (`blocksRender.tsx`) هم بی چرخهٔ import داشته باشندش.
 */

import type { ReactNode } from 'react';

import { toLatinDigits } from '@jozveyar/text';

/** واژهٔ لاتین (با نقطه، @، خط تیره و رقم درونش) یا عدد؛ چند واژهٔ لاتین با یک فاصله یک تکه‌اند («Save As»). */
const TOKEN = /([A-Za-z][A-Za-z0-9]*(?:[.@_\-/:+]+[A-Za-z0-9]+)*(?: [A-Za-z][A-Za-z0-9]*(?:[.@_\-/:+]+[A-Za-z0-9]+)*)*|\d+(?:[.,]\d+)*)/;

/** متن فارسی با عدد و واژهٔ لاتین درونش. */
export function TextContent({ text }: { text: string }): ReactNode {
  return text.split(TOKEN).map((part, i) =>
    i % 2 === 0 ? (
      part
    ) : /^\d/.test(part) ? (
      <span key={i} className="num">
        {part}
      </span>
    ) : (
      <bdi key={i}>{part}</bdi>
    ),
  );
}

/** نام کاغذ یا صحافی از تعرفه، با رقم لاتین («تحریر ۸۰ گرم» تعرفهٔ پایه)، مثل `Inline` سایت. */
export function NameText({ text }: { text: string }): ReactNode {
  return <TextContent text={toLatinDigits(text)} />;
}
