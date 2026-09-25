'use client';

import { useState } from 'react';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { formatNumber } from '@jozveyar/text';
import { ACCEPT } from './DropZone';

interface Props {
  onFiles: (files: File[]) => void;
  /** چند فایل دیگر جا دارد؛ صفر یعنی سقف جزوه پر است. */
  room: number;
  /** «افزودن فایل به همین جزوه» در جزوهٔ تک‌فایلی، «افزودن فایل» زیر فهرست. */
  label: string;
  className?: string;
}

/**
 * «افزودن فایل به همین جزوه»، داخل کارت «جزوهٔ تو»: برچسب خط‌چین ورودی فایل (`jy-add`). کلیک و
 * کلید فایل‌گزین را بی JS باز می‌کنند و فوکوس ورودی روی خود برچسب دیده می‌شود. فایل را روی همین
 * برچسب هم می‌شود انداخت. فایل‌های تازه ته جزوه می‌آیند؛ ترتیب را بعد با ↑↓ عوض می‌کنی.
 */
export function AddFiles({ onFiles, room, label, className = '' }: Props) {
  const [dragging, setDragging] = useState(false);

  if (room <= 0) {
    return (
      <p className={`jy-note jy-note--info ${className}`}>
        <span className="jy-icon jy-icon-info" aria-hidden="true" />
        <span>
          جزوه به سقف <span className="num">{formatNumber(MAX_SECTIONS_PER_ITEM)}</span> فایل رسید. اگر فایل دیگری هم
          هست، چند فایل را از برنامهٔ خودشان یک PDF کن و همان را جای آنها بگذار.
        </span>
      </p>
    );
  }

  return (
    <label
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
      className={`jy-add ${dragging ? 'is-dragover ' : ''}${className}`}
    >
      <input
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
      <span className="jy-icon jy-icon-plus" aria-hidden="true" />
      {label}
    </label>
  );
}
