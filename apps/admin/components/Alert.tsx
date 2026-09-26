/**
 * یادداشت خطا، هشدار یا اطلاع با آیکون؛ رنگ وضعیت هیچ‌وقت بی آیکون و متن. نام کلاس‌ها کامل و ثابت‌اند:
 * Tailwind فقط آیکونی را می‌سازد که نامش عیناً در کد آمده باشد (`@utility` کیت)، نه نامی که ساخته شود.
 */
const TONES = {
  error: { note: 'jy-note jy-note--error ad-gap', icon: 'jy-icon jy-icon-error' },
  warning: { note: 'jy-note jy-note--warning ad-gap', icon: 'jy-icon jy-icon-warning' },
  info: { note: 'jy-note jy-note--info ad-gap', icon: 'jy-icon jy-icon-info' },
  success: { note: 'jy-note jy-note--success ad-gap', icon: 'jy-icon jy-icon-success' },
} as const;

export function Alert({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return (
    <p className={TONES[tone].note} role={tone === 'error' || tone === 'warning' ? 'alert' : undefined}>
      <span className={TONES[tone].icon} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
