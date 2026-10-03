import { resendPartnerSmsAction } from '../app/[gate]/actions';

/**
 * «دوباره بفرست» پیامک سفارش تازهٔ چاپخانه (۷٫۶، سؤال ۱۷۲؛ مالک و متصدی): فرم بی JS، برگشت به همان سفارش. فقط وقتی همان تخصیص زنده
 * است (سفارش در صف چاپ و هنوز پیش همان چاپخانه، سؤال ۱۷۴) و پیامک نرفت یا معلوم نیست رفت؛ به همان شماره‌ای که با آن ساخته شد.
 */
export function ResendPartnerSmsForm({ gate, assignmentId, orderNumber }: { gate: string; assignmentId: number; orderNumber: number }) {
  return (
    <form action={resendPartnerSmsAction} className="ad-inline-form">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="assignment" value={assignmentId} />
      <input type="hidden" name="number" value={orderNumber} />
      <button type="submit" className="jy-btn jy-btn--text" data-resend-partner={assignmentId}>
        دوباره بفرست
      </button>
    </form>
  );
}
