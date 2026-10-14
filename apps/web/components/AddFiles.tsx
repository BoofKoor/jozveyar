'use client';

import { useState, type ReactNode } from 'react';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { formatNumber } from '@jozveyar/text';
import { ACCEPT } from './DropZone';

interface Props {
  onFiles: (files: File[]) => void;
  /** چند فایل دیگر جا دارد؛ صفر یعنی سقف فایل‌های سفارش پر است. */
  room: number;
  /** «افزودن فایل به همین جزوه» درون کارت جزوه، یا «جزوهٔ تازه» زیر کارت‌ها. */
  label: ReactNode;
  /** شناسهٔ ورودی فایل، یکتا در صفحه: کارت اول `jozve-add`، بقیه با شمارهٔ جزوه، و «جزوهٔ تازه» `jozve-new`. */
  id: string;
  /**
   * `dashed`: برچسب خط‌چین (`jy-add`)، برای «جزوهٔ تازه» و جزوهٔ تک‌فایلی؛ `text`: دکمهٔ متنی درون کارت چندفایلی (طرح میز،
   * سؤال ۲۱۹)، تا با چند جزوه چند کادر خط‌چین با هم رقابت نکنند.
   */
  variant?: 'dashed' | 'text';
  className?: string;
}

/**
 * ورودی فایل به شکل برچسب: کلیک و کلید فایل‌گزین را بی JS باز می‌کنند و فوکوس ورودی روی خود برچسب دیده می‌شود. فایل را روی
 * همین برچسب هم می‌شود انداخت. فایل‌های تازه ته همان جزوه می‌آیند، یا جزوهٔ تازه‌ای می‌شوند؛ ترتیب را بعد با منوی ردیف
 * عوض می‌کنی.
 */
export function AddFiles({ onFiles, room, label, id, variant = 'dashed', className = '' }: Props) {
  const [dragging, setDragging] = useState(false);

  if (room <= 0) {
    return (
      <p className={`jy-note jy-note--info ${className}`}>
        <span className="jy-icon jy-icon-info" aria-hidden="true" />
        <span>
          سفارش به سقف <span className="num">{formatNumber(MAX_SECTIONS_PER_ITEM)}</span> فایل رسید. اگر فایل دیگری هم
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
      className={`${variant === 'text' ? 'jy-btn jy-btn--text home-add' : 'jy-add'} ${dragging ? 'is-dragover ' : ''}${className}`}
    >
      <input
        id={id}
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
