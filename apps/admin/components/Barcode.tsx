import { barcodeGroups } from '../lib/shipments';

/**
 * کد رهگیری پست (کیت `jy-barcode`، طرح برش ۶): ۲۴ رقم در شش گروه چهارتایی برای خواندن. فاصله در CSS است، نه در متن، پس کپی همان
 * ۲۴ رقم پشت‌سرهم است و یک کلیک همه را انتخاب می‌کند.
 */
export function Barcode({ code, large = false }: { code: string; large?: boolean }) {
  return (
    <span className={`jy-barcode${large ? ' jy-barcode--lg' : ''}`} data-barcode={code}>
      {barcodeGroups(code).map((group, i) => (
        <span key={i}>{group}</span>
      ))}
    </span>
  );
}
