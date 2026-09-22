'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadHandle, UploadSnapshot } from './upload/client';

/**
 * آپلود فایل در پس‌زمینه.
 *
 * `start` عمداً از بیرون می‌آید: OrderFlow آن را بعد از **نمایش اولین قیمت**
 * روشن می‌کند، تا آپلود با لحظهٔ جادو سر پردازنده و شبکه رقابت نکند.
 *
 * ماژول آپلودگر با import پویا می‌آید، پس به باندل اولیهٔ صفحه نمی‌خورد.
 */
export function useUpload(file: File | null, start: boolean) {
  const [snapshot, setSnapshot] = useState<UploadSnapshot | null>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const startedFor = useRef<File | null>(null);

  useEffect(() => {
    if (!file || !start || startedFor.current === file) return;
    startedFor.current = file;
    let cancelled = false;

    void import('./upload/client').then(({ startUpload, browserDeps }) => {
      if (cancelled) return;
      handleRef.current = startUpload(file, setSnapshot, browserDeps());
    });

    return () => {
      cancelled = true;
    };
  }, [file, start]);

  // رفتن از صفحه آپلود را فقط متوقف می‌کند؛ سند می‌ماند تا انداختن دوبارهٔ
  // همان فایل از همان تکه ادامه دهد.
  useEffect(() => () => void handleRef.current?.cancel(), []);

  /** کاربر فایل را کنار گذاشت: آپلود روی سرور هم لغو و دیسک آزاد می‌شود. */
  const discard = useCallback(() => {
    void handleRef.current?.cancel({ discard: true });
    handleRef.current = null;
    startedFor.current = null;
    setSnapshot(null);
  }, []);

  return { upload: snapshot, discard };
}
