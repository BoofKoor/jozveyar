'use client';

import { useActionState, useRef, useState } from 'react';

import { uploadPostFileAction, type UploadState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';

/** پسوندهای فایل پست (ADR-045): جدول HTML با پسوند `.xls`، و CSV و XLSX. فرمت را کارگر از محتوا می‌شناسد، نه از پسوند. */
const ACCEPT = '.xls,.htm,.html,.csv,.xlsx';

/**
 * بارگذاری فایل پست (طرح `m-ship`، کیت `jy-upload`): کل کارت برچسب ورودی فایل است، پس کلیک و کلید بی JS هم فایل‌گزین را باز
 * می‌کنند، و دکمهٔ «بارگذاری» فرم را بی JS می‌فرستد. با JS، انتخاب یا انداختن فایل خودش فرم را می‌فرستد. پس از بارگذاری، صفحهٔ
 * همان ورود «در حال خواندن» است تا کارگر بخواندش.
 */
export function PostFileUpload({ gate, maxMb, partner }: { gate: string; maxMb: number; partner?: string | null }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadPostFileAction, {});
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const error = state.error ? messageOf(state.error) : null;

  const send = (files: FileList | null) => {
    if (!files?.length || !input.current) return;
    if (input.current.files !== files) input.current.files = files;
    form.current?.requestSubmit();
  };

  return (
    <form ref={form} action={action} className="ad-upload-form" data-pending={pending ? '' : undefined}>
      <input type="hidden" name="gate" value={gate} />
      <label
        className={`jy-upload ad-upload${dragging ? ' is-dragover' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          send(event.dataTransfer.files);
        }}
      >
        <input
          ref={input}
          type="file"
          name="file"
          accept={ACCEPT}
          required
          className="sr-only"
          aria-labelledby="ship-drop-title ship-drop-action"
          aria-describedby={error ? 'ship-drop-error ship-drop-hint' : 'ship-drop-hint'}
          onChange={(event) => send(event.target.files)}
        />
        <span className="jy-drop">
          <span id="ship-drop-title" className="jy-drop__title">
            فایل پست را اینجا بینداز
          </span>
          <span className="jy-drop__sub">همان فایلی که از پست گرفتی، دست‌نخورده؛ پیش از ثبت، هر سطر را با حکمش می‌بینی.</span>
          <span className="jy-drop__formats">
            {['.xls', '.html', '.csv', '.xlsx'].map((ext) => (
              <span key={ext} className="jy-drop__format" dir="ltr">
                {ext}
              </span>
            ))}
          </span>
        </span>
        <span className="jy-upload__foot">
          <span id="ship-drop-action" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`}>
            <span className="jy-icon jy-icon-upload" aria-hidden="true" />
            {pending ? 'در حال بارگذاری…' : 'انتخاب فایل'}
          </span>
          <span id="ship-drop-hint" className="jy-upload__hint">
            تا <span className="num">{maxMb}</span> مگابایت.{partner ? ` فقط بسته‌های سفارش‌های ${partner} ثبت می‌شوند.` : ''}
          </span>
        </span>
      </label>
      {error ? (
        <p id="ship-drop-error" className="jy-error" role="alert">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {/* بی JS: فایل انتخاب شد، حالا بفرست. با JS همان انتخاب فرم را می‌فرستد و این دکمه لازم نیست. */}
      <noscript>
        <button type="submit" className="jy-btn jy-btn--secondary">
          بارگذاری
        </button>
      </noscript>
    </form>
  );
}
