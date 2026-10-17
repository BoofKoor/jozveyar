/**
 * «کد برنامهٔ تأیید تو» برای کار حساس، با خطای خودش (سه نشانه: لبه، آیکون، پیام). راهنما پیش‌فرض همان کد تازه است؛ بازپرداخت (۷٫۳)
 * می‌گوید چرا: «پول جابه‌جا می‌شود». ویرایش کد تخفیف (۱۱٫۴) خالی‌اش را هم می‌فرستد، چون خاموش کردن تنها کد تازه نمی‌خواهد و سرور می‌سنجد.
 */
export function CodeField({ error, hint, required = true }: { error: string | null; hint?: string; required?: boolean }) {
  return (
    <div className="jy-field">
      <label className="jy-label" htmlFor="step-code">
        کد برنامهٔ تأیید تو
      </label>
      <input
        id="step-code"
        name="code"
        className="jy-input jy-input--code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'step-code-error step-code-hint' : 'step-code-hint'}
      />
      {error ? (
        <p id="step-code-error" className="jy-error">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <p id="step-code-hint" className="jy-hint">
        {hint ?? 'کار حساس کد تازه می‌خواهد؛ کدی که با آن وارد شدی دوباره پذیرفته نیست.'}
      </p>
    </div>
  );
}
