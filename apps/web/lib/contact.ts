/**
 * اطلاعات تماس جزوه‌یار (سؤال باز ۴ در `docs/UI.md`). اطلاعات ساختگی روی سایت زنده نمی‌رود: شمارهٔ ساختگی مشتری واقعی را
 * گمراه می‌کند. پس تا اطلاعات واقعی نرسیده `CONTACT` خالی است، و صفحهٔ `/contact` ۴۰۴ است و در پاورقی و نقشهٔ سایت نیست
 * (`lib/staticPages.ts`). با رسیدنش همین‌جا پر می‌شود و صفحه و پیوندها خودشان می‌آیند.
 */

export interface Contact {
  /** موبایل پشتیبانی، برای پیامک و تماس: `09…`. */
  mobile?: string;
  /** تلفن ثابت با پیش‌شماره: `021…`. */
  phone?: string;
  email?: string;
  /** روزها و ساعت پاسخ‌گویی، همان‌طور که روی صفحه می‌آید. */
  hours?: string;
  /** نشانی، و کد پستی ده‌رقمی. */
  address?: string;
  postalCode?: string;
}

/** تا اطلاعات تماس واقعی برسد: null. */
export const CONTACT: Contact | null = null;

/**
 * یک ردیف صفحهٔ تماس. شماره و ایمیل چپ‌به‌راست و پیوند (`tel:`، `mailto:`، با هدف لمسی ۴۴)؛ ساعت و نشانی متن، و کد پستی
 * نشانی عدد جدا، تا فقط خود عدد چپ‌به‌راست شود.
 */
export type ContactRow =
  | { label: string; kind: 'tel' | 'email'; value: string; href: string }
  | { label: string; kind: 'text'; value: string; postalCode?: string };

/** شماره به نشانی `tel:` بین‌المللی: `0912 345 6789` ← `tel:+989123456789`، `021-12345678` ← `tel:+982112345678`. */
export function telHref(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `tel:${digits.startsWith('0') ? `+98${digits.slice(1)}` : `+${digits}`}`;
}

/** ردیف‌های صفحهٔ تماس، به ترتیب طرح (`checkout.html`، قدم ۵)؛ فقط آنچه هست. */
export function contactRows(contact: Contact): ContactRow[] {
  const rows: ContactRow[] = [];
  if (contact.mobile) rows.push({ label: 'پیامک و تماس', kind: 'tel', value: contact.mobile, href: telHref(contact.mobile) });
  if (contact.phone) rows.push({ label: 'تلفن', kind: 'tel', value: contact.phone, href: telHref(contact.phone) });
  if (contact.email) rows.push({ label: 'ایمیل', kind: 'email', value: contact.email, href: `mailto:${contact.email}` });
  if (contact.hours) rows.push({ label: 'ساعت پاسخ‌گویی', kind: 'text', value: contact.hours });
  if (contact.address) {
    rows.push({ label: 'نشانی', kind: 'text', value: contact.address, ...(contact.postalCode ? { postalCode: contact.postalCode } : {}) });
  }
  return rows;
}
