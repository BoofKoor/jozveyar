import { resendSmsAction } from '../app/[gate]/actions';

/**
 * «دوباره بفرست» پیامک رهگیری یک کد (۶٫۳، سؤال ۶۹؛ مالک و متصدی): فرم بی JS، برگشت به همان صفحه (سفارش، یا ورود با `importId`).
 * «معلوم نیست رفت» هشدار خودش را در همان سطر دارد.
 */
export function ResendSmsForm({
  gate,
  shipmentId,
  orderNumber,
  importId,
}: {
  gate: string;
  shipmentId: string;
  orderNumber: number;
  /** از صفحهٔ ورود: برگشت به همان ورود. */
  importId?: string;
}) {
  return (
    <form action={resendSmsAction} className="ad-inline-form">
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="shipment" value={shipmentId} />
      <input type="hidden" name="number" value={orderNumber} />
      {importId ? (
        <>
          <input type="hidden" name="from" value="import" />
          <input type="hidden" name="import" value={importId} />
        </>
      ) : null}
      <button type="submit" className="jy-btn jy-btn--text" data-resend={shipmentId}>
        دوباره بفرست
      </button>
    </form>
  );
}
