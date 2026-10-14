/**
 * پیش‌نویس سفارش همین زبانه (برش ۳د، ADR-036): اگر گوشی صفحه را از نو بار کرد (رفرش، یا مرورگری که زبانه را
 * وقت رفتن به برنامهٔ پیامک بست)، همان جزوه، همان تنظیمات چاپ و همان قدم مسیر خرید برمی‌گردد.
 *
 * - **کجا:** sessionStorage همین زبانه (تصمیم ۱۴۰۵/۰۷/۰۴): با بستن زبانه پاک می‌شود، پس نام و نشانی روی رایانهٔ
 *   مشترک نمی‌ماند؛ و زبانهٔ تازه جزوهٔ تازه است. قدم در `history.state` است، که با رفرش می‌ماند (`OrderDesk`).
 * - **چه:** نشانی هر فایل (نام، حجم، تاریخ تغییر) و سندش روی سرور، جزوه به جزوه و به ترتیب صحافی؛ چیدمان جزوه‌ها
 *   با تنظیمات چاپ هر کدام (از نسخهٔ ۲، برش ۸٫۲)؛ و مسیر خرید (`CheckoutDraft`). عددی دربارهٔ صفحه یا رنگ نه: آن را سرور
 *   می‌گوید (`GET /api/uploads/<id>`)، که منبع حقیقت است (قاعدهٔ ۲).
 *
 * اینجا فقط نوشتن است، که با رابط پس از فایل می‌آید؛ خواندن و برگرداندن در `lib/restore.ts` است، تکه‌ای که فقط
 * وقتی پیش‌نویسی هست بار می‌شود، تا راه اولین قیمت سنگین‌تر نشود. خالص، بی React: حافظه (`Storage`) تزریقی است.
 */

import type { CheckoutDraft } from './checkout/store';
import { DRAFT_KEY } from './draftKey';
import type { Section } from './jozve';
import type { DeskLayout } from './layout';
import type { OrderConfig } from './orderConfig';

/**
 * نسخهٔ شکل پیش‌نویس؛ شکل تازه نسخهٔ تازه می‌خواهد. نسخهٔ ۲ (برش ۸٫۲) چیدمان جزوه‌ها را دارد؛ خواندن نسخهٔ ۱ را هم می‌خواند،
 * یک جزوه با همان تنظیمات (`lib/restore.ts`)، تا زبانه‌ای که پیش از استقرار باز بود جزوه‌اش را گم نکند.
 */
export const DRAFT_VERSION = 2;

/** یک فایل جزوه در پیش‌نویس: همان اثر انگشت آپلودگر (ADR-024)، و سندش روی سرور اگر آپلودش شروع شده بود. */
export interface DraftFile {
  name: string;
  size: number;
  lastModified: number;
  documentId: string | null;
}

/**
 * چیدمان جزوه‌ها در پیش‌نویس (۸٫۲): شمار فایل هر جزوه به ترتیب، که فایل‌هایش پشت‌سرهم در `files` آمده‌اند، با تنظیمات چاپش؛
 * و اینکه پرسش چیدمان هنوز بالای میز است.
 */
export interface DraftLayout {
  jozves: { files: number; config: OrderConfig | null }[];
  asking: boolean;
}

export interface Draft {
  v: typeof DRAFT_VERSION;
  /** همهٔ فایل‌های سفارش، جزوه به جزوه و به ترتیب صحافی؛ ۱ تا سقف فایل‌های سفارش. */
  files: DraftFile[];
  /** شمار فایل‌های جزوه‌هایش روی هم همان `files` است. تنظیم null: پیش‌فرض‌های تعرفه. */
  layout: DraftLayout;
  /** null: کاربر هنوز به مسیر خرید نرسیده. */
  checkout: CheckoutDraft | null;
}

/* ─────────────────────────── نوشتن ─────────────────────────── */

/**
 * پیش‌نویس همین حالِ سفارش: فایل‌ها به ترتیب چیدمان (همگام با صف، `reconcile`)؛ null یعنی سفارش خالی است و پیش‌نویسی
 * نمی‌ماند.
 */
export function draftOf(sections: readonly Section[], layout: DeskLayout, checkout: CheckoutDraft | null): Draft | null {
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const jozves = layout.jozves
    .map((jozve) => ({ files: jozve.sections.flatMap((key) => byKey.get(key) ?? []), config: jozve.config }))
    .filter((jozve) => jozve.files.length > 0);
  if (jozves.length === 0) return null;
  return {
    v: DRAFT_VERSION,
    files: jozves.flatMap((jozve) =>
      jozve.files.map(({ file, upload }) => ({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        documentId: upload?.documentId ?? (file instanceof File ? null : file.documentId),
      })),
    ),
    layout: { jozves: jozves.map((jozve) => ({ files: jozve.files.length, config: jozve.config })), asking: layout.asking },
    checkout,
  };
}

/** sessionStorage همین زبانه؛ null وقتی مرورگر اجازه نمی‌دهد (حافظهٔ سایت بسته). */
export function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** نوشتن یا پاک کردن (`null`). شکستش بی‌صداست: بی پیش‌نویس هم همه‌چیز کار می‌کند، فقط رفرش جزوه را نمی‌آورد. */
export function writeDraft(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, draft: Draft | null) {
  try {
    if (draft) storage?.setItem(DRAFT_KEY, JSON.stringify(draft));
    else storage?.removeItem(DRAFT_KEY);
  } catch {
    // حالت خصوصی یا سهمیهٔ پر.
  }
}
