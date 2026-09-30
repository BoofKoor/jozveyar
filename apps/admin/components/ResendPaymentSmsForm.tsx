import { resendPaymentSmsAction } from '../app/[gate]/actions';

/**
 * «دوباره بفرست» پیامک پرداخت (۷٫۱، طرح `ad-paysms`؛ مالک و متصدی): فرم بی JS، برگشت به همان سفارش. فقط وقتی سفارش در صف چاپ یا در
 * حال چاپ است و پیامک نرفت یا معلوم نیست رفت.
 */
export function ResendPaymentSmsForm({ gate, paymentId, orderNumber }: { gate: string; paymentId: string; orderNumber: number }) {
  return (
    <form action={resendPaymentSmsAction} className="ad-inline-form">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="payment" value={paymentId} />
      <input type="hidden" name="number" value={orderNumber} />
      <button type="submit" className="jy-btn jy-btn--text" data-resend-paid={paymentId}>
        دوباره بفرست
      </button>
    </form>
  );
}
