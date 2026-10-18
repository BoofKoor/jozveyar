/**
 * صفحهٔ «تماس» از متن «تماس و پاورقی» (برش ۱۱٫۱، سؤال ۲۹۰؛ پیش از آن `CONTACT` در کد وب، مرحلهٔ آخر برش ۷): هر راهی که هست یک ردیف، به
 * ترتیب طرح. شماره و ایمیل پیوند `tel:` و `mailto:`، و تلگرام و اینستاگرام تنها پیوندهای بیرونی سایت، با نشانی‌ای که خود سایت از شناسه
 * می‌سازد. سایت و پیش‌نمایش پنل هر دو همین را رسم می‌کنند.
 */

import type { ContactContent } from './kinds.js';

/**
 * یک ردیف صفحهٔ تماس. شماره، ایمیل و شناسه چپ‌به‌راست و پیوند (با هدف لمسی ۴۴)؛ ساعت و نشانی متن، و کد پستی نشانی عدد جدا، تا فقط خود
 * عدد چپ‌به‌راست شود.
 */
export type ContactRow =
  | { label: string; kind: 'tel' | 'email' | 'social'; value: string; href: string }
  | { label: string; kind: 'text'; value: string; postalCode?: string };

/** شماره به نشانی `tel:` بین‌المللی: `09123456789` ← `tel:+989123456789`، `02166491234` ← `tel:+982166491234`. */
export function telHref(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `tel:${digits.startsWith('0') ? `+98${digits.slice(1)}` : `+${digits}`}`;
}

/** شمارهٔ یازده‌رقمی به شکل خواندنی: موبایل «0912 345 6789»، تلفن ثابت «021 6649 1234». */
export function phoneText(number: string): string {
  if (/^09\d{9}$/.test(number)) return `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}`;
  if (/^0\d{10}$/.test(number)) return `${number.slice(0, 3)} ${number.slice(3, 7)} ${number.slice(7)}`;
  return number;
}

/** راهی برای رسیدن به جزوه‌یار هست؟ بی آن صفحهٔ «تماس» و پیوندش در پاورقی و نقشهٔ سایت نیست. ساعت به‌تنهایی راه نیست. */
export function hasContact(contact: ContactContent): boolean {
  return Boolean(contact.mobile || contact.phone || contact.email || contact.telegram || contact.instagram || contact.address);
}

/**
 * زیرعنوان صفحهٔ تماس: با شماره «آماده داشته باش»؛ بی شماره، شمارهٔ سفارش در خود پیام یا ایمیل می‌آید (فقط ایمیل یعنی «در ایمیلت بنویس»).
 */
export function contactLead(contact: ContactContent): string {
  const where = 'در صفحهٔ سفارش و پیامک پرداخت هست.';
  if (!contact.mobile && !contact.phone) {
    if (contact.telegram || contact.instagram) return `شمارهٔ سفارشت را در پیامت بنویس؛ ${where}`;
    if (contact.email) return `شمارهٔ سفارشت را در ایمیلت بنویس؛ ${where}`;
  }
  return `شمارهٔ سفارشت را آماده داشته باش؛ ${where}`;
}

/** ردیف‌های صفحهٔ تماس، به ترتیب طرح (`content.html`، «تماس»)؛ فقط آنچه هست. */
export function contactRows(contact: ContactContent): ContactRow[] {
  const rows: ContactRow[] = [];
  if (contact.mobile) rows.push({ label: 'پیامک و تماس', kind: 'tel', value: phoneText(contact.mobile), href: telHref(contact.mobile) });
  if (contact.phone) rows.push({ label: 'تلفن', kind: 'tel', value: phoneText(contact.phone), href: telHref(contact.phone) });
  if (contact.email) rows.push({ label: 'ایمیل', kind: 'email', value: contact.email, href: `mailto:${contact.email}` });
  if (contact.telegram) rows.push({ label: 'تلگرام', kind: 'social', value: `@${contact.telegram}`, href: `https://t.me/${contact.telegram}` });
  if (contact.instagram) {
    rows.push({ label: 'اینستاگرام', kind: 'social', value: `@${contact.instagram}`, href: `https://instagram.com/${contact.instagram}` });
  }
  if (contact.hours) rows.push({ label: 'ساعت پاسخ‌گویی', kind: 'text', value: contact.hours });
  if (contact.address) {
    rows.push({ label: 'نشانی', kind: 'text', value: contact.address, ...(contact.postalCode ? { postalCode: contact.postalCode } : {}) });
  }
  return rows;
}
