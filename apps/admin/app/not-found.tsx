/**
 * ۴۰۴ پنل: بی لوگو و بی نام. همین برای نشانی درون دروازه‌ای که نیست، و برای مسیر نادرستی که از
 * `middleware.ts` گذشته باشد (دیوار دوم، `[gate]/layout.tsx`)؛ چیزی نمی‌گوید که اینجا پنل است.
 */
export default function NotFound() {
  return (
    <main className="ad-auth">
      <p className="ad-auth__in ad-meta">پیدا نشد.</p>
    </main>
  );
}
