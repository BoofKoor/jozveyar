'use client';

import { useEffect } from 'react';
import { DRAFT_KEY } from '../../lib/draftKey';

/**
 * سفارش پرداخت شد (۳د، ADR-036): پیش‌نویسی که همین سفارش را ساخت، در این زبانه دیگر لازم نیست، و برگشت به صفحهٔ
 * اصلی جزوهٔ تازه است. فقط پیش‌نویس همین سفارش (`checkout.order`)، نه جزوهٔ دیگری که شاید در همین زبانه در کار است.
 */
export function ForgetDraft({ token }: { token: string }) {
  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as { checkout?: { order?: unknown } } | null;
      if (String(draft?.checkout?.order).toLowerCase() === token) sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // حافظهٔ بسته یا پیش‌نویس خراب: چیزی برای پاک کردن نیست.
    }
  }, [token]);
  return null;
}
