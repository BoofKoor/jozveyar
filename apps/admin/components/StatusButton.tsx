'use client';

import { useFormStatus } from 'react-dom';

/**
 * دکمهٔ اصلی وضعیت سفارش («شروع چاپ»، «تحویل پست شد»): تا پاسخ سرور بسته و با چرخنده، تا کلیک دوم درخواست دوم نفرستد.
 * سرور هم دو کلیک را یک بار انجام می‌دهد (`status = from`)؛ این فقط پیش از رسیدن پاسخ است.
 */
export function StatusButton({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${className}${pending ? ' is-loading' : ''}`} disabled={pending}>
      {children}
    </button>
  );
}
