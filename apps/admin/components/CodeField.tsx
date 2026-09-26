/** «کد برنامهٔ تأیید تو» برای کار حساس، با خطای خودش (سه نشانه: لبه، آیکون، پیام). */
export function CodeField({ error }: { error: string | null }) {
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
        required
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
        کار حساس کد تازه می‌خواهد؛ کدی که با آن وارد شدی دوباره پذیرفته نیست.
      </p>
    </div>
  );
}
