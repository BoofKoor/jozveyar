/**
 * گیرندهٔ سفارش: نرمال‌سازی و سنجش، یک جا برای سرور و مرورگر (برش ۳ج).
 *
 * سرور منبع حقیقت است و موقع «پرداخت» همین را دوباره می‌سنجد (`lib/server/checkout.ts`)؛ مرورگر همین را
 * موقع «ادامه — موبایل و پرداخت» صدا می‌زند تا غلط تایپی کد پستی همان‌جا گفته شود، نه سه قدم بعد. دو کد
 * جدا برای یک قاعده روزی از هم جدا می‌شدند.
 *
 * نرمال‌سازی «آ» و همزه را نگه می‌دارد (`tidyInputFa`): این متن روی برچسب پست چاپ می‌شود.
 */

import { toLatinDigits } from '@jozveyar/text';
import { tidyInputFa } from '@jozveyar/text/input';

export interface RecipientInput {
  name: string;
  addressText: string;
  postalCode: string | null;
}

export interface Recipient {
  name: string;
  addressText: string;
  /** ده رقم لاتین، یا null. */
  postalCode: string | null;
}

/** نام فیلدی که غلط است، به همان شکل `fields` پاسخ ۴۰۰ سرور. */
export type RecipientField = 'recipient.name' | 'recipient.addressText' | 'recipient.postalCode';

/** کمینه و بیشینهٔ طول، بعد از نرمال‌سازی. */
export const RECIPIENT_LIMITS = {
  name: { min: 2, max: 100 },
  addressText: { min: 10, max: 500 },
} as const;

/** گیرندهٔ نرمال‌شده، و فیلدهایی که قاعده را نمی‌خوانند؛ خالی یعنی پذیرفته. */
export function checkRecipient(input: RecipientInput): { value: Recipient; fields: RecipientField[] } {
  const fields: RecipientField[] = [];
  const name = tidyInputFa(input.name);
  if (name.length < RECIPIENT_LIMITS.name.min || name.length > RECIPIENT_LIMITS.name.max) fields.push('recipient.name');
  const addressText = tidyInputFa(input.addressText);
  if (addressText.length < RECIPIENT_LIMITS.addressText.min || addressText.length > RECIPIENT_LIMITS.addressText.max) {
    fields.push('recipient.addressText');
  }
  const digits = toLatinDigits(input.postalCode ?? '').replace(/[\s-]/g, '');
  const postalCode = digits === '' ? null : digits;
  if (postalCode !== null && !/^\d{10}$/.test(postalCode)) fields.push('recipient.postalCode');
  return { value: { name, addressText, postalCode }, fields };
}
