import { inquireRefundAction } from '../app/[gate]/actions';

/**
 * «استعلام از درگاه» یک بازپرداخت «در حال برگشت» (برش ۷٫۳، طرح `m-refunding`؛ مالک و متصدی): فرم بی JS، برگشت به همان سفارش با
 * نتیجه. کد تازه نمی‌خواهد: فقط می‌پرسد، پولی جابه‌جا نمی‌کند.
 */
export function RefundInquiryForm({ gate, refundId, orderNumber }: { gate: string; refundId: string; orderNumber: number }) {
  return (
    <form action={inquireRefundAction}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="refund" value={refundId} />
      <input type="hidden" name="number" value={orderNumber} />
      <button type="submit" className="jy-btn jy-btn--secondary jy-btn--block" data-refund-inquire={refundId}>
        استعلام از درگاه
      </button>
    </form>
  );
}
