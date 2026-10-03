/**
 * اطلاعات تماس جزوه‌یار (سؤال ۴ در `docs/UI.md`؛ از صاحب پروژه، مرحلهٔ آخر). اطلاعات ساختگی روی سایت زنده نمی‌رود: شمارهٔ
 * ساختگی مشتری واقعی را گمراه می‌کند. پس `CONTACT` فقط اطلاعات خود صاحب پروژه است، و صفحهٔ `/contact` و پیوندش در پاورقی و
 * نقشهٔ سایت فقط با آن‌اند (`lib/staticPages.ts`)؛ بی آن (`null`) صفحه ۴۰۴ است و پیوندها نمی‌آیند.
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

/**
 * از صاحب پروژه (۱۴۰۵/۰۷/۱۱): ایمیل، ساعت پاسخ‌گویی و نشانی. تلفن و موبایل فعلاً نه (خواست خود او)، و کد پستی ندارد. روزها
 * همان روزهای کاری سایت‌اند (شنبه تا چهارشنبه، `packages/text`).
 */
export const CONTACT: Contact | null = {
  email: 'jozveyar.com@gmail.com',
  hours: 'شنبه تا چهارشنبه، ساعت 9 تا 18، جز تعطیلی‌های رسمی',
  address:
    'تهران، میدان انقلاب، خیابان انقلاب، روبه‌روی سینما بهمن، بین خیابان منیری جاوید و خیابان 12 فروردین، پلاک 1354، پاساژ اندیشه، طبقهٔ منفی 2، انتهای راهرو، واحد D18',
};

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

/**
 * زیرعنوان صفحهٔ تماس. جملهٔ طرح («آماده داشته باش») برای تماس تلفنی است؛ وقتی راه تماس فقط ایمیل است، شمارهٔ سفارش در خود
 * ایمیل می‌آید.
 */
export function contactLead(contact: Contact): string {
  const where = 'در صفحهٔ سفارش و پیامک پرداخت هست.';
  if (!contact.mobile && !contact.phone && contact.email) return `شمارهٔ سفارشت را در ایمیلت بنویس؛ ${where}`;
  return `شمارهٔ سفارشت را آماده داشته باش؛ ${where}`;
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
