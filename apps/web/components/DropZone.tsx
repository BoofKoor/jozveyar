'use client';

import { useCallback, useRef, useState } from 'react';
import { ACCEPTED_EXTENSIONS } from '../lib/analysis-protocol';

/** فرمت‌هایی که می‌پذیریم. PDF مسیر مرورگر، بقیه مسیر سرور (تبدیل، ADR-028). */
const ACCEPT = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

interface Props {
  onFile: (file: File) => void;
  busy: boolean;
}

export function DropZone({ onFile, busy }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        take(event.dataTransfer.files);
      }}
      className={`rounded-card border-2 border-dashed bg-card p-8 text-center transition-colors sm:p-14 ${
        dragging ? 'border-sage-deep bg-chip' : 'border-sage-mid'
      }`}
    >
      <input
        ref={inputRef}
        id="jozve-file"
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => take(event.target.files)}
      />

      <p className="text-xl font-semibold text-ink sm:text-2xl">جزوه‌ات را همین‌جا بینداز</p>
      <p className="mt-3 text-ink-2">
        قیمت را فوری می‌بینی. بدون ثبت‌نام، بدون پر کردن فرم.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-6 rounded-lg bg-sage-button px-7 py-3 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'در حال بررسی…' : 'انتخاب فایل'}
      </button>

      <p className="mt-6 text-sm text-ink-2">
        PDF، Word، پاورپوینت و عکس — PDF همین‌جا در مرورگر خوانده می‌شود، بقیه روی سرور به PDF
        تبدیل می‌شوند
      </p>
    </div>
  );
}
