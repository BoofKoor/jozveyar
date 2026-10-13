'use client';

import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { formatNumber } from '@jozveyar/text';
import type { Arrangement } from '../lib/layout';
import { AddFiles } from './AddFiles';
import { PriceDelta } from './ConfigPanel';

/*
 * تکه‌های میز چندجزوه (برش ۸٫۲؛ طرح `docs/ui/mockups/desk.html`، سؤال‌های ۲۱۵ تا ۲۱۹): پرسش چیدمان، منوی ردیف، تنظیمات هر
 * جزوه، و «جزوهٔ تازه» زیر کارت‌ها. همه در تکهٔ رابط پس از فایل‌اند، نه در باندل اولیه.
 */

/**
 * پرسش چیدمان بالای میز (۲۱۵، ۲۱۶): «همه یک جزوه، یک صحافی» از پیش انتخاب‌شده، و قیمت بی کلیک روی صفحه؛ گزینهٔ دیگر اثرش
 * را روی قیمت دارد. تا وقتی چیدمان یکی از همین دوتاست می‌ماند (`lib/layout.ts`).
 */
export function AskCard({
  files,
  arrangement,
  onArrange,
  deltaRials,
}: {
  files: number;
  arrangement: Arrangement;
  onArrange: (to: Arrangement) => void;
  /** قیمت سفارش با چیدمان دیگر، منهای قیمت امروز؛ null تا وقتی هنوز صفحه‌ای شمرده نشده. */
  deltaRials: number | null;
}) {
  const options: { value: Arrangement; title: string; note: ReactNode }[] = [
    {
      value: 'together',
      title: 'همه یک جزوه، یک صحافی',
      note:
        arrangement === 'apart' ? (
          <>
            با تنظیمات جزوهٔ <span className="num">1</span>، پشت‌سرهم
          </>
        ) : (
          'پشت‌سرهم، به همین ترتیب'
        ),
    },
    { value: 'apart', title: 'هر فایل جزوهٔ جدا', note: 'هر کدام صحافی و تنظیمات خودش' },
  ];
  return (
    <section data-testid="jozve-ask" className="jy-card" aria-labelledby="ask-title">
      <h2 id="ask-title" className="jy-card__title">
        <span className="num">{formatNumber(files)}</span> فایل انداختی؛ چطور صحافی شوند؟
      </h2>
      <div className="home-field">
        <fieldset className="min-w-0">
          <legend className="sr-only">چیدمان فایل‌ها</legend>
          <div className="jy-tiles home-tiles">
            {options.map((option) => {
              const selected = option.value === arrangement;
              return (
                <label key={option.value} className="jy-tile">
                  <input
                    type="radio"
                    name="jozve-arrange"
                    value={option.value}
                    checked={selected}
                    onChange={() => onArrange(option.value)}
                    className="jy-radio"
                  />
                  <span className="jy-tile__title">{option.title}</span>
                  <span className="jy-tile__note">{option.note}</span>
                  {!selected && deltaRials !== null ? (
                    <span className="jy-tile__delta">
                      <PriceDelta rials={deltaRials} />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <p className="home-field__hint">
            <span className="jy-icon jy-icon-info" aria-hidden="true" />
            <span>بعداً هم هر فایل را از منوی ردیفش به جزوهٔ دیگری می‌بری.</span>
          </p>
        </fieldset>
      </div>
    </section>
  );
}

/** یک کار منوی ردیف: «یکی بالاتر»، «به جزوهٔ 2» با نام فایل اولش، «جزوهٔ تازه با همین فایل». */
export interface MenuItem {
  label: ReactNode;
  /** خط دوم کم‌رنگ، مثل نام فایل اول جزوهٔ مقصد. */
  detail?: string;
  /** خط جداکننده پیش از این کار. */
  divided?: boolean;
  onSelect: () => void;
}

/**
 * منوی «جابه‌جایی» ردیف فایل (۲۱۸): یک دکمه با آیکون `chevron` کیت به جای دو دکمهٔ بالا و پایین، چون چهار دکمه در ردیفی ۳۲۰
 * پیکسلی جا نمی‌شود و بردن به جزوهٔ دیگر فهرست لازم دارد. بی کار، بی منو. با کلیک بیرون، Esc یا رفتن فوکوس بسته می‌شود؛
 * کلیدهای بالا و پایین میان کارها می‌روند.
 */
export function RowMenu({ name, items }: { name: string; items: readonly MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  if (items.length === 0) return null;
  const label = `جابه‌جایی «${name}»`;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
      return;
    }
    const all = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const to =
      event.key === 'ArrowDown' ? (at + 1) % all.length
      : event.key === 'ArrowUp' ? (at - 1 + all.length) % all.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? all.length - 1
      : null;
    if (to === null) return;
    event.preventDefault();
    all[to]?.focus();
  };

  return (
    <div
      ref={root}
      className="home-menu"
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((was) => !was)}
        className="jy-btn jy-btn--text jy-btn--icon"
      >
        <span className="jy-icon jy-icon-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div id={id} role="menu" aria-label={label} className="home-menu__list" onKeyDown={onKeyDown}>
          {items.map((item, i) => (
            <Fragment key={i}>
              {item.divided ? <hr role="separator" /> : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="home-menu__item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
                {item.detail ? <span dir="auto">{item.detail}</span> : null}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * «تنظیمات چاپ» درون کارت جزوه (۲۱۷). یک جزوه: همیشه باز، با سر خودش. چند جزوه: در هر لحظه یکی باز و بقیه یک خط
 * («سیاه‌سفید، دورو، طلق و سیم · 1 نسخه»)؛ باز و بسته با دکمه، نه `details` با `name`، تا یکی بودنش در هر مرورگری قطعی باشد
 * و فقط تنظیمات باز رسم شود.
 */
export function JozveSettings({
  multi,
  open,
  onToggle,
  line,
  id,
  children,
}: {
  multi: boolean;
  open: boolean;
  onToggle: () => void;
  /** خلاصهٔ یک‌خطی تنظیمات، وقتی بسته است. */
  line: ReactNode;
  /** شناسهٔ بدنهٔ تنظیمات، برای `aria-controls`. */
  id: string;
  children: ReactNode;
}) {
  if (!multi) {
    return (
      <div className="home-set home-set--fixed">
        <h3 id="print-title" className="home-set__title">
          تنظیمات چاپ
        </h3>
        {children}
      </div>
    );
  }
  return (
    <div className={`home-set${open ? ' is-open' : ''}`}>
      <button type="button" className="home-set__sum" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="home-set__label">تنظیمات چاپ</span>
        {open ? null : <span className="home-set__value">{line}</span>}
        <span className="jy-icon jy-icon-chevron home-set__chev" aria-hidden="true" />
      </button>
      {open ? (
        <div id={id} className="home-set__body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * زیر کارت‌ها (۲۱۹): تنها کادر خط‌چین «جزوهٔ تازه» (فایل‌هایش یک جزوهٔ تازه‌اند، بی پرسش دوباره)، کنار «از اول».
 */
export function NewJozve({ room, onFiles, onReset }: { room: number; onFiles: (files: File[]) => void; onReset: () => void }) {
  return (
    <div className="home-new">
      <AddFiles
        id="jozve-new"
        onFiles={onFiles}
        room={room}
        className="home-new__add"
        label={
          <span className="home-new__text">
            <b>جزوهٔ تازه</b>
            <small>فایل‌های دیگر، با صحافی و تنظیمات خودشان</small>
          </span>
        }
      />
      <button type="button" onClick={onReset} className="jy-btn jy-btn--text shrink-0">
        از اول
      </button>
    </div>
  );
}

/** فایل‌هایی که از سقف سفارش بیشتر بودند و اضافه نشدند (`overflow` صف). */
export function OverflowNote({ names, children }: { names: readonly string[]; children: ReactNode }) {
  if (names.length === 0) return null;
  return (
    <p data-testid="jozve-overflow" className="jy-note jy-note--warning">
      <span className="jy-icon jy-icon-warning" aria-hidden="true" />
      <span>
        سفارش بیش از <span className="num">{formatNumber(MAX_SECTIONS_PER_ITEM)}</span> فایل نمی‌گیرد؛ این‌ها اضافه نشدند:{' '}
        {children}. چند فایل را از برنامهٔ خودشان یک PDF کن و همان را بینداز.
      </span>
    </p>
  );
}
