'use client';

import { useActionState, useState } from 'react';

import type { SiteImageKind } from '@jozveyar/db';

import { uploadImageAction, type ImageUploadState } from '../app/[gate]/actions';
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES, UPLOAD_FIELDS } from '../lib/images';
import { messageOf } from '../lib/messages';

type FileField = 'main' | 'extra';

/**
 * بارگذاری لوگو یا بنر تازه (برش ۱۱٫۲، کیت `jy-add`): دو فایل، اصلی لازم و دومی اختیاری (نشان، یا تصویر گوشی)؛ هر برچسب ورودی فایل خودش است،
 * پس کلیک و کلید بی JS هم فایل‌گزین را باز می‌کنند، و «بارگذاری» فرم را می‌فرستد. با JS نام فایل انتخاب‌شده روی همان برچسب می‌آید، و فایل
 * بزرگ‌تر از ۱ مگابایت همین‌جا می‌ماند (بدنهٔ بزرگ‌تر از ۳ مگابایت را خود نکست رد می‌کرد، بی پیام ما). نوع و ابعاد را سرور و کارگر می‌سنجند.
 */
export function ImageUpload({ gate, kind }: { gate: string; kind: SiteImageKind }) {
  const [state, action, pending] = useActionState<ImageUploadState, FormData>(uploadImageAction, {});
  const [names, setNames] = useState<Record<FileField, string | null>>({ main: null, extra: null });
  const [local, setLocal] = useState<{ field: FileField; text: string } | null>(null);
  const fields = UPLOAD_FIELDS[kind];

  const errorOf = (field: FileField): string | null => {
    if (local) return local.field === field ? local.text : null;
    if (!state.error) return null;
    return (state.field ?? 'main') === field ? messageOf(state.error) : null;
  };

  return (
    <form
      action={action}
      className="ad-imgup"
      data-pending={pending ? '' : undefined}
      onSubmit={(event) => {
        const form = event.currentTarget;
        for (const field of ['main', 'extra'] as const) {
          const file = (form.elements.namedItem(field) as HTMLInputElement | null)?.files?.[0];
          if (file && file.size > IMAGE_MAX_BYTES) {
            setLocal({ field, text: messageOf('image_too_large') });
            event.preventDefault();
            return;
          }
        }
        setLocal(null);
      }}
    >
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="kind" value={kind} />
      {(['main', 'extra'] as const).map((field) => {
        const id = `img-${kind}-${field}`;
        const error = errorOf(field);
        const name = names[field];
        return (
          <div key={field} className="jy-field" data-field={field}>
            <span className="jy-label" id={`${id}-label`}>
              {fields[field].label}
              {field === 'extra' ? <span className="jy-optional"> (اختیاری)</span> : null}
            </span>
            <label className={`jy-add ad-imgup__pick${name ? ' is-picked' : ''}`}>
              <input
                id={id}
                type="file"
                name={field}
                accept={IMAGE_ACCEPT[kind]}
                required={field === 'main'}
                className="sr-only"
                aria-labelledby={`${id}-label ${id}-action`}
                aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setNames((current) => ({ ...current, [field]: file ? file.name : null }));
                  setLocal(file && file.size > IMAGE_MAX_BYTES ? { field, text: messageOf('image_too_large') } : null);
                }}
              />
              <span className="jy-icon jy-icon-upload" aria-hidden="true" />
              <span id={`${id}-action`} className="ad-imgup__name">
                {name ? <bdi>{name}</bdi> : `انتخاب ${fields[field].label}`}
              </span>
            </label>
            {error ? (
              <p id={`${id}-error`} className="jy-error" role="alert">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                {error}
              </p>
            ) : null}
            <p id={`${id}-hint`} className="jy-hint">
              {fields[field].hint}
            </p>
          </div>
        );
      })}
      <div className="ad-actions">
        <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
          {pending ? 'در حال بارگذاری…' : 'بارگذاری'}
        </button>
      </div>
      <p className="ad-hint">
        هر فایل تا <span className="num">1</span> مگابایت. تا «روی سایت بگذار» نزنی چیزی روی سایت عوض نمی‌شود، و بارگذاری‌ای که{' '}
        <span className="num">30</span> روز روی سایت نرود پاک می‌شود.
      </p>
    </form>
  );
}
