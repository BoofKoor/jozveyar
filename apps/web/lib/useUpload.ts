'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentAnalysis } from '@jozveyar/contracts';
import type { UploadHandle, UploadSnapshot } from './upload/client';

/**
 * آپلود فایل در پس‌زمینه.
 *
 * `start` عمداً از بیرون می‌آید: OrderFlow آن را بعد از **نمایش اولین قیمت**
 * روشن می‌کند، تا آپلود با لحظهٔ جادو سر پردازنده و شبکه رقابت نکند.
 *
 * ماژول آپلودگر با import پویا می‌آید، پس به باندل اولیهٔ صفحه نمی‌خورد.
 */
export function useUpload(
  file: File | null,
  start: boolean,
  /** تحلیل مرورگر، وقتی تمام شد — کنار تحلیل سرور ذخیره می‌شود (ADR-002). */
  browserAnalysis: DocumentAnalysis | null = null,
) {
  const [snapshot, setSnapshot] = useState<UploadSnapshot | null>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const startedFor = useRef<File | null>(null);
  const analysisSentFor = useRef<string | null>(null);

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

  // تحلیل مرورگر یک بار، وقتی هم فایل رسیده و هم تحلیل تمام شده — هر کدام
  // اول تمام شود. برای سنجیدن اختلاف مرورگر و سرور است، نه برای قیمت.
  const documentId = snapshot?.phase === 'done' ? snapshot.documentId : null;
  useEffect(() => {
    if (!documentId || !browserAnalysis || analysisSentFor.current === documentId) return;
    analysisSentFor.current = documentId;
    void import('./upload/client').then(({ sendBrowserAnalysis }) =>
      sendBrowserAnalysis(window.fetch.bind(window), documentId, browserAnalysis),
    );
  }, [documentId, browserAnalysis]);

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
