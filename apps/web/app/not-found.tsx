import type { Metadata } from 'next';

// نه robots «index» و نه canonical صفحهٔ اصلی از layout به ۴۰۴ نرسد؛ Next خودش هم noindex می‌گذارد.
export const metadata: Metadata = {
  title: 'صفحه پیدا نشد',
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

/**
 * صفحهٔ ۴۰۴، فارسی و با همان سربرگ و پاورقی (layout). پیش‌فرض Next انگلیسی بود و زمینهٔ سفید
 * خودش را داشت. کد وضعیت واقعاً ۴۰۴ است و Next خودش `noindex` را می‌گذارد. کامپوننت سرور، بی JS.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 pb-16 pt-8 sm:pt-16">
      <p className="text-sm font-semibold text-muted">
        خطای <span className="num">404</span>
      </p>
      <h1 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl">این صفحه پیدا نشد</h1>
      <p className="text-lg leading-relaxed text-muted">
        شاید نشانی را اشتباه نوشته‌ای، یا این صفحه دیگر نیست. از صفحهٔ اصلی جزوه‌ات را بینداز و قیمتش
        را همان لحظه ببین.
      </p>
      <a className="jy-btn jy-btn--primary jy-btn--lg mt-4" href="/">
        برگشت به صفحهٔ اصلی
      </a>
    </main>
  );
}
