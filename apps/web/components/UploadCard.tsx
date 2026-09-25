/**
 * محتوای ثابت کارت بارگذاری، از طرح ز (docs/UI.md، ۴الف). کامپوننت سرور: جزیرهٔ سفارش آن را
 * داخل برچسب ورودی فایل (`DropZone`) می‌گذارد، پس متنش در HTML و داده‌های RSC هست و در باندل
 * اولیه نیست.
 *
 * برچسب فقط محتوای درون‌خطی می‌گیرد، پس همه span است. «انتخاب فایل» دکمه نیست، شکل دکمه است: کلیک
 * هر جای کارت فایل‌گزین را باز می‌کند. تصویر برگه‌ها فایل ایستاست، نه SVG درون JSX.
 */
export function UploadCard() {
  return (
    <>
      <span className="jy-drop">
        <img src="/img/pages.svg" alt="" width={160} height={112} className="home-art" />
        <span id="upload-title" className="jy-drop__title">
          جزوه‌ات را همین‌جا بینداز
        </span>
        <span className="jy-drop__sub">فایل را بکش و روی همین کادر رها کن.</span>
        {/* واژهٔ لاتین در bdi، مثل هر جای دیگر سایت کنار متن فارسی */}
        <span id="upload-formats" className="jy-drop__formats home-formats">
          <span className="jy-drop__format">
            <bdi>PDF</bdi>
          </span>
          <span className="jy-drop__format">
            <bdi>Word</bdi>
          </span>
          <span className="jy-drop__format">پاورپوینت</span>
          <span className="jy-drop__format">عکس</span>
        </span>
      </span>
      <span className="jy-upload__foot">
        <span id="upload-action" className="jy-btn jy-btn--primary jy-btn--lg jy-btn--block">
          <span className="jy-icon jy-icon-upload" aria-hidden="true" />
          انتخاب فایل
        </span>
        <span id="upload-hint" className="jy-upload__hint home-upload-hint">
          چند فایل هم می‌شود؛ پشت‌سرهم در یک جزوه صحافی می‌شوند.
        </span>
      </span>
    </>
  );
}
