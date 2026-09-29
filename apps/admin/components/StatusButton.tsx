'use client';

import { useFormStatus } from 'react-dom';

/**
 * دکمهٔ اصلی وضعیت سفارش («شروع چاپ»، «تحویل پست شد»): تا پاسخ سرور بسته و با چرخنده، تا کلیک دوم درخواست دوم نفرستد.
 * سرور هم دو کلیک را یک بار انجام می‌دهد (`status = from`)؛ این فقط پیش از رسیدن پاسخ است. کارت صف تأیید (۶٫۲) دو دکمه در یک
 * فرم دارد («همین است» و «هیچ‌کدام»)، پس نام و مقدار دکمه هم؛ «هیچ‌کدام» بی سنجش انتخاب (`formNoValidate`).
 */
export function StatusButton({
  className,
  children,
  name,
  value,
  formNoValidate,
}: {
  className: string;
  children: React.ReactNode;
  name?: string;
  value?: string;
  formNoValidate?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`${className}${pending ? ' is-loading' : ''}`}
      disabled={pending}
      name={name}
      value={value}
      formNoValidate={formNoValidate}
    >
      {children}
    </button>
  );
}
