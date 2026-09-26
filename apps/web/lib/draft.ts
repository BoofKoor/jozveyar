/**
 * پیش‌نویس سفارش همین زبانه (برش ۳د، ADR-036): اگر گوشی صفحه را از نو بار کرد (رفرش، یا مرورگری که زبانه را
 * وقت رفتن به برنامهٔ پیامک بست)، همان جزوه، همان تنظیمات چاپ و همان قدم مسیر خرید برمی‌گردد.
 *
 * - **کجا:** sessionStorage همین زبانه (تصمیم ۱۴۰۵/۰۷/۰۴): با بستن زبانه پاک می‌شود، پس نام و نشانی روی رایانهٔ
 *   مشترک نمی‌ماند؛ و زبانهٔ تازه جزوهٔ تازه است. قدم در `history.state` است، که با رفرش می‌ماند (`OrderDesk`).
 * - **چه:** نشانی هر فایل (نام، حجم، تاریخ تغییر) و سندش روی سرور، به ترتیب صحافی؛ تنظیمات چاپ؛ و مسیر خرید
 *   (`CheckoutDraft`). عددی دربارهٔ صفحه یا رنگ نه: آن را سرور می‌گوید (`GET /api/uploads/<id>`)، که منبع حقیقت
 *   است (قاعدهٔ ۲).
 *
 * اینجا فقط نوشتن است، که با رابط پس از فایل می‌آید؛ خواندن و برگرداندن در `lib/restore.ts` است، تکه‌ای که فقط
 * وقتی پیش‌نویسی هست بار می‌شود، تا راه اولین قیمت سنگین‌تر نشود. خالص، بی React: حافظه (`Storage`) تزریقی است.
 */

import type { CheckoutDraft } from './checkout/store';
import { DRAFT_KEY } from './draftKey';
import type { Section } from './jozve';
import type { OrderConfig } from './orderConfig';

/** نسخهٔ شکل پیش‌نویس؛ شکل تازه نسخهٔ تازه می‌خواهد، و پیش‌نویس نسخهٔ دیگر نادیده گرفته می‌شود. */
export const DRAFT_VERSION = 1;

/** یک فایل جزوه در پیش‌نویس: همان اثر انگشت آپلودگر (ADR-024)، و سندش روی سرور اگر آپلودش شروع شده بود. */
export interface DraftFile {
  name: string;
  size: number;
  lastModified: number;
  documentId: string | null;
}

export interface Draft {
  v: typeof DRAFT_VERSION;
  /** به ترتیب صحافی؛ ۱ تا سقف جزوه. */
  files: DraftFile[];
  /** null: پیش‌فرض‌های تعرفه. */
  config: OrderConfig | null;
  /** null: کاربر هنوز به مسیر خرید نرسیده. */
  checkout: CheckoutDraft | null;
}

/* ─────────────────────────── نوشتن ─────────────────────────── */

/** پیش‌نویس همین حالِ جزوه؛ null یعنی جزوه خالی است و پیش‌نویسی نمی‌ماند. */
export function draftOf(sections: readonly Section[], config: OrderConfig | null, checkout: CheckoutDraft | null): Draft | null {
  if (sections.length === 0) return null;
  return {
    v: DRAFT_VERSION,
    files: sections.map(({ file, upload }) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      documentId: upload?.documentId ?? (file instanceof File ? null : file.documentId),
    })),
    config,
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
