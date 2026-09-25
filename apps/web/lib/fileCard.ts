/**
 * متن‌های کارت «جزوهٔ تو» و راهنمای «رنگ چاپ» — خالص، بی React (docs/UI.md، کارت «جزوهٔ تو»).
 *
 * عدد جدا از متن برمی‌گردد: رابط فقط خود عدد را در `.num` ایزوله می‌کند. `.num` روی متن فارسی
 * جهتش را چپ‌به‌راست می‌کند و ترتیب کلمه‌ها به هم می‌ریزد («کیلوبایت 14»).
 */

import { ptToMm } from '@jozveyar/analysis';

/** اندازهٔ بی‌نام، همان کلید `paperSizeName` در مرورگر و سرور: `482×680pt`. */
const POINTS = /^(\d+)×(\d+)pt$/;

/**
 * نام اندازهٔ کاغذ برای نمایش. اندازهٔ استاندارد با نام خودش (`A4`)، و اندازهٔ بی‌نام به
 * میلی‌متر، نه به پوینت: `482×680pt` ← `170×240` میلی‌متر. کلید خود (`paperSizeName`) دست
 * نمی‌خورد؛ سرور هم همان را می‌سازد و ذخیره می‌کند.
 */
export function paperSizeLabel(name: string): { name: string } | { mm: string } {
  const match = POINTS.exec(name);
  if (!match) return { name };
  const [w, h] = [match[1], match[2]].map((pt) => Math.round(ptToMm(Number(pt))));
  return { mm: `${w}×${h}` };
}

export interface ColorHintInput {
  /** صفحه‌های رنگی تا این لحظه؛ در سند نمونه‌برداری‌شده برآورد. */
  colorPages: number;
  /** رنگ هیچ فایلی هنوز معلوم نیست: فقط Word و عکس، پیش از بررسی روی سرور. */
  unknown: boolean;
  /** بررسی تمام نشده: صفحه‌هایی مانده، فایلی در صف یا روی سرور است، یا فایلی خوانده نشد. */
  pending: boolean;
  /** عدد از نمونه برآورد شده، نه از شمارش همهٔ صفحه‌ها. */
  estimated: boolean;
  /** جزوهٔ چندفایلی. */
  jozve: boolean;
}

/** یک جمله با شاید یک عدد: `lead` + عدد + `rest`. بی عدد، همهٔ جمله در `lead` است. */
export interface Sentence {
  lead: string;
  count: number | null;
  rest: string;
}

const plain = (text: string): Sentence => ({ lead: text, count: null, rest: '' });

/**
 * راهنمای «رنگ چاپ»: صفحه‌های رنگی فایل، و فقط وقتی همهٔ صفحه‌ها بررسی شده‌اند حکم قطعی.
 * وسط بررسی «تا اینجا» می‌گوید؛ فایلی که فقط ۶۰ صفحه از ۱۴۷ صفحه‌اش دیده شده «تماماً
 * سیاه‌سفید» نیست.
 */
export function colorHint({ colorPages, unknown, pending, estimated, jozve }: ColorHintInput): Sentence {
  if (unknown) return plain('رنگی بودن صفحه‌ها بعد از بررسی روی سرور معلوم می‌شود.');
  const found = ` صفحهٔ رنگی ${jozve ? 'در فایل‌های این جزوه' : 'در فایل'} پیدا شد.`;
  const about = estimated ? 'حدود ' : '';
  if (pending) {
    return colorPages > 0
      ? { lead: `تا اینجا ${about}`, count: colorPages, rest: found }
      : plain('تا اینجا صفحهٔ رنگی‌ای پیدا نشد.');
  }
  if (colorPages > 0) {
    return {
      lead: about,
      count: colorPages,
      rest: `${found} اگر سیاه‌سفید انتخاب کنی، این صفحه‌ها هم سیاه‌سفید چاپ می‌شوند.`,
    };
  }
  if (estimated) return plain('در صفحه‌هایی که بررسی شد صفحهٔ رنگی‌ای پیدا نشد.');
  return plain(jozve ? 'همهٔ فایل‌ها تماماً سیاه‌سفیدند.' : 'فایل تماماً سیاه‌سفید است.');
}
