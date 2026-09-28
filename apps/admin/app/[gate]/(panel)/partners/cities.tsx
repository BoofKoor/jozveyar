import { cityOptions } from '../../../../lib/partners';

/** شناسهٔ فهرست شهرهای فیلد شهر چاپخانه. */
export const CITIES_LIST = 'partner-cities';

/**
 * همهٔ شهرهای سایت برای فیلد شهر (`datalist`): «مشهد، خراسان رضوی». یک بار در صفحه، بیرون از فرم؛ مرورگر همان‌جا که تایپ
 * می‌شود پیشنهاد می‌دهد، و سرور متن را به یک شهر برمی‌گرداند (`pickCity`).
 */
export function CitiesList() {
  return (
    <datalist id={CITIES_LIST}>
      {cityOptions().map((label) => (
        <option key={label} value={label} />
      ))}
    </datalist>
  );
}
