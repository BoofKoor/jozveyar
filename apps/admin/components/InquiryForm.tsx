import { inquirePaymentAction } from '../app/[gate]/actions';

/**
 * «استعلام از درگاه» (برش ۷٫۲، طرح `m-order-unpaid`؛ مالک و متصدی): فرم بی JS روی تلاشی که هنوز نهایی نیست یا پولش نزد درگاه است؛
 * برگشت به همان سفارش با نتیجه. کد تازه نمی‌خواهد: پولی جابه‌جا نمی‌کند جز همان که درگاه گفته.
 */
export function InquiryForm({ gate, paymentId, orderNumber }: { gate: string; paymentId: string; orderNumber: number }) {
  return (
    <form action={inquirePaymentAction} className="ad-inline-form">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="payment" value={paymentId} />
      <input type="hidden" name="number" value={orderNumber} />
      <button type="submit" className="jy-btn jy-btn--text" data-inquire={paymentId}>
        استعلام از درگاه
      </button>
    </form>
  );
}
