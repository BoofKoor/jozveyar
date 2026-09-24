'use client';

import { useRef, useState } from 'react';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { formatNumber } from '@jozveyar/text';
import { ACCEPT } from './DropZone';

interface Props {
  onFiles: (files: File[]) => void;
  /** چند فایل دیگر جا دارد؛ صفر یعنی سقف جزوه پر است. */
  room: number;
  /** جزوه الان چند فایل دارد. */
  count: number;
}

/**
 * «فایل دیگری به همین جزوه» — زیر کارت، هم دکمه و هم جای انداختن. فایل‌های تازه ته جزوه
 * می‌آیند؛ ترتیب را بعد با ↑↓ عوض می‌کنی.
 */
export function AddFiles({ onFiles, room, count }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (room <= 0) {
    return (
      <p className="rounded-card border border-hairline bg-card px-4 py-3 text-sm text-ink-2">
        جزوه به سقف {formatNumber(MAX_SECTIONS_PER_ITEM)} فایل رسید. اگر فایل دیگری هم هست، چند فایل را از برنامهٔ
        خودشان یک PDF کن و همان را جای آنها بگذار.
      </p>
    );
  }

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
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed px-4 py-3 transition-colors ${
        dragging ? 'border-sage-deep bg-chip' : 'border-sage-mid bg-card'
      }`}
    >
      <input
        ref={inputRef}
        id="jozve-add"
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : [];
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
      <p className="text-sm text-ink-2">
        {count === 1
          ? 'جزوه چند فایل است؟ بقیه را هم بینداز؛ پشت‌سرهم صحافی می‌شوند.'
          : 'فایل دیگری هم هست؟ بینداز؛ ته جزوه می‌آید.'}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="shrink-0 rounded-lg border border-sage-mid px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-sage-deep"
      >
        + افزودن فایل
      </button>
    </div>
  );
}
