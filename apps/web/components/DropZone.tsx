'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ACCEPTED_EXTENSIONS } from '../lib/analysis-protocol';

/** فرمت‌هایی که می‌پذیریم. PDF مسیر مرورگر، بقیه مسیر سرور (تبدیل، ADR-028). */
export const ACCEPT = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

interface Props {
  /** یک یا چند فایل؛ چند فایل به ترتیب نام، بخش‌های یک جزوه می‌شوند (ADR-030). */
  onFiles: (files: File[]) => void;
  /**
   * نشانهٔ قصد: اشاره‌گر روی کارت، لمس، فوکوس یا کشیدن فایل. رابط پس از فایل از همین لحظه بار
   * می‌شود، تا وقتی فایل‌گزین بسته می‌شود رسیده باشد (docs/UI.md، ۴ب).
   */
  onIntent: () => void;
  /**
   * محتوای ثابت کارت (تصویر، تیتر، نوع فایل‌ها، «انتخاب فایل» و راهنما): کامپوننت سرور
   * `UploadCard`، تا متنش در باندل اولیه نیاید. نام ورودی از `upload-title` و `upload-action`
   * آن است و توضیحش از `upload-formats` و `upload-hint`.
   */
  children: ReactNode;
}

/**
 * کارت بارگذاری (`jy-upload`، طرح ز): کل کارت برچسب ورودی فایل است، پس کلیک و کلید بی JS
 * فایل‌گزین را باز می‌کنند و فوکوس ورودی روی خود کارت دیده می‌شود. اینجا فقط انداختن فایل
 * است: `is-dragover` وقتی فایلی رویش کشیده شده.
 */
export function DropZone({ onFiles, onIntent, children }: Props) {
  const [dragging, setDragging] = useState(false);

  const take = useCallback(
    (files: FileList | null) => {
      const list = files ? Array.from(files) : [];
      if (list.length > 0) onFiles(list);
    },
    [onFiles],
  );

  return (
    <label
      onPointerEnter={onIntent}
      onPointerDown={onIntent}
      onFocus={onIntent}
      onDragEnter={onIntent}
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
      className={`jy-upload${dragging ? ' is-dragover' : ''}`}
    >
      <input
        id="jozve-file"
        type="file"
        multiple
        accept={ACCEPT}
        aria-labelledby="upload-title upload-action"
        aria-describedby="upload-formats upload-hint"
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          // همان فایل دوباره هم انتخاب‌شدنی بماند.
          event.target.value = '';
        }}
      />
      {children}
    </label>
  );
}
