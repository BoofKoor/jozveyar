'use client';

import { useCallback, useRef, useState } from 'react';
import { ACCEPTED_EXTENSIONS } from '../lib/analysis-protocol';

/** فرمت‌هایی که می‌پذیریم. PDF مسیر مرورگر، بقیه مسیر سرور (تبدیل، ADR-028). */
export const ACCEPT = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

interface Props {
  /** یک یا چند فایل؛ چند فایل به ترتیب نام، بخش‌های یک جزوه می‌شوند (ADR-030). */
  onFiles: (files: File[]) => void;
  busy: boolean;
}

export function DropZone({ onFiles, busy }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (files: FileList | null) => {
      const list = files ? Array.from(files) : [];
      if (list.length > 0) onFiles(list);
    },
    [onFiles],
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
      className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors sm:p-14 ${
        dragging ? 'border-solid border-accent bg-green-100' : 'border-control bg-card'
      }`}
    >
      {/* ورودی فقط هدف دکمه و انداختن است؛ در ترتیب Tab نیست تا فوکوس روی چیزی نامرئی نیفتد. */}
      <input
        ref={inputRef}
        id="jozve-file"
        type="file"
        multiple
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          // همان فایل دوباره هم انتخاب‌شدنی بماند.
          event.target.value = '';
        }}
      />

      <p className="text-xl font-semibold text-ink sm:text-2xl">جزوه‌ات را همین‌جا بینداز</p>
      <p className="mt-3 text-muted">
        قیمت را فوری می‌بینی. بدون ثبت‌نام، بدون پر کردن فرم.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="jy-btn jy-btn--primary jy-btn--lg mt-6"
      >
        <span className="jy-icon jy-icon-upload" aria-hidden="true" />
        {busy ? 'در حال بررسی…' : 'انتخاب فایل'}
      </button>

      {/* واژهٔ لاتین کنار ویرگول فارسی در bdi؛ بی آن «PDF، Word» برعکس دیده می‌شود. */}
      <p className="mt-6 text-sm text-muted">
        <bdi>PDF</bdi>، <bdi>Word</bdi>، پاورپوینت و عکس — PDF همین‌جا در مرورگر خوانده می‌شود، بقیه روی
        سرور به PDF تبدیل می‌شوند. چند فایل هم می‌شود: پشت‌سرهم در یک جزوه صحافی می‌شوند.
      </p>
    </div>
  );
}
