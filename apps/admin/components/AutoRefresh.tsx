'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * «در حال خواندن فایل…» (طرح `m-ship-reading`): صفحه را هر چند ثانیه از سرور تازه می‌کند تا کارگر فایل را بخواند؛ صفحهٔ تازه دیگر
 * این را ندارد و خودش می‌ایستد. بی JS، پیوند «دوباره نگاه کن» همان صفحه.
 */
export function AutoRefresh({ everyMs = 1500 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), everyMs);
    return () => window.clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
