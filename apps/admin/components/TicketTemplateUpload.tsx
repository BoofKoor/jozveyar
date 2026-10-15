'use client';

import { useActionState, useRef, useState } from 'react';

import { uploadTemplateAction, type TemplateUploadState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { KIND_NAMES, type TicketTemplateKind } from '../lib/ticketTemplates';

/** سقف قالب (`TICKET_TEMPLATE_MAX_BYTES`)؛ این جزء مرورگری است و پکیج پایگاه داده را با خودش نمی‌آورد. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * بارگذاری نسخهٔ تازهٔ یک نوع قالب (۹٫۲، کیت `jy-add`): کل برچسب ورودی فایل است، پس کلیک و کلید بی JS هم فایل‌گزین را باز می‌کنند، و
 * «بارگذاری» فرم را بی JS می‌فرستد. با JS، انتخاب فایل خودش فرم را می‌فرستد، و فایل بزرگ‌تر از سقف همین‌جا می‌ماند (بدنهٔ بزرگ‌تر از ۳
 * مگابایت را خود نکست رد می‌کرد، بی پیام ما). پس از بارگذاری، صفحهٔ همان نسخه با پیش‌نمایش نمونه.
 */
export function TicketTemplateUpload({ gate, kind }: { gate: string; kind: TicketTemplateKind }) {
  const [state, action, pending] = useActionState<TemplateUploadState, FormData>(uploadTemplateAction, {});
  const [local, setLocal] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = `tpl-upload-${kind}`;
  const error = local ?? (state.error ? messageOf(state.error) : null);

  /** پیش از فرستادن: فایل بزرگ‌تر از سقف نمی‌رود. */
  const fits = () => {
    const file = input.current?.files?.[0];
    if (file && file.size > MAX_BYTES) {
      setLocal(messageOf('template_too_large'));
      return false;
    }
    setLocal(null);
    return true;
  };

  return (
    <form
      ref={form}
      action={action}
      className="ad-tpl-upload"
      data-pending={pending ? '' : undefined}
      onSubmit={(event) => {
        if (!fits()) event.preventDefault();
      }}
    >
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="kind" value={kind} />
      <label className="jy-add">
        <input
          ref={input}
          id={id}
          type="file"
          name="file"
          accept=".html,.htm,text/html"
          required
          className="sr-only"
          aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
          onChange={() => {
            if (fits() && input.current?.files?.length) form.current?.requestSubmit();
          }}
        />
        <span className="jy-icon jy-icon-upload" aria-hidden="true" />
        {pending ? 'در حال بارگذاری…' : `بارگذاری نسخهٔ تازهٔ ${KIND_NAMES[kind]}`}
      </label>
      <p id={`${id}-hint`} className="jy-hint">
        فایل HTML با UTF-8، تا <span className="num">2</span> مگابایت؛ عکس و فونت درون خود فایل (<bdi className="ad-ltr">data:</bdi>). تا فعالش
        نکنی هیچ برگه‌ای عوض نمی‌شود.
      </p>
      {error ? (
        <p id={`${id}-error`} className="jy-error" role="alert">
          <span className="jy-icon jy-icon-error" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <noscript>
        <button type="submit" className="jy-btn jy-btn--secondary">
          بارگذاری
        </button>
      </noscript>
    </form>
  );
}
