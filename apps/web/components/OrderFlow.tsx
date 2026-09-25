'use client';

import { startTransition, useCallback, useDeferredValue, useEffect, useState, type ReactNode } from 'react';
import type { OrderConfig } from '../lib/orderConfig';
import { useJozve } from '../lib/useJozve';
import { DropZone } from './DropZone';

/** رابط پس از فایل: تکهٔ جدای JS، بیرون از باندل اولیه (docs/UI.md، ۴ب). */
type DeskModule = typeof import('./OrderDesk');
let deskModule: DeskModule | null = null;
let deskLoading: Promise<DeskModule> | null = null;

/**
 * رابط پس از فایل را بار می‌کند، یک بار: با اولین فایل، و زودتر با نشانهٔ قصد کاربر روی کارت
 * بارگذاری (اشاره‌گر، لمس، فوکوس یا کشیدن فایل)، تا وقتی فایل‌گزین بسته می‌شود تکه رسیده باشد. در
 * زمان بیکاری بار نمی‌شود: کسی که فایلی نمی‌اندازد، آن را نمی‌گیرد. بار ناموفق (شبکه) قفل نمی‌ماند؛
 * بار بعدی دوباره می‌خواهد.
 */
function loadDesk(): Promise<DeskModule> {
  deskLoading ??= import('./OrderDesk').then(
    (module) => (deskModule = module),
    (error: unknown) => {
      deskLoading = null;
      throw error;
    },
  );
  return deskLoading;
}

const preloadDesk = () => void loadDesk().catch(() => undefined);

interface Props {
  /** تیتر و متن قهرمان (کامپوننت سرور). */
  hero: ReactNode;
  /** محتوای ثابت کارت بارگذاری (`UploadCard`، کامپوننت سرور). */
  upload: ReactNode;
  /** سه نکتهٔ اطمینان قهرمان (کامپوننت سرور). */
  trust: ReactNode;
  /** «سه قدم» و «تعرفه» (کامپوننت سرور). */
  more: ReactNode;
  /** سؤال‌ها (کامپوننت سرور): پس از فایل در همان شبکهٔ خلاصهٔ سفارش، تا خلاصهٔ چسبان تا ته صفحه بماند. */
  children: ReactNode;
}

/**
 * فلوی سفارش: یک جزوه از یک یا چند فایل (ADR-030)، و چیدمان صفحهٔ اصلی دور آن (طرح ز، home.css).
 *
 * پوسته است و در باندل اولیه: صف جزوه (`useJozve`)، کارت بارگذاری، انتخاب‌های چاپ و بار کردن رابط
 * پس از فایل (`OrderDesk`). محتوای ثابت صفحه کامپوننت سرور است و از props می‌آید، پس متنش در HTML
 * است و در باندل نیست.
 *
 * پیش از فایل: قهرمان با کارت بارگذاری، و زیرش سه قدم، تعرفه و سؤال‌ها. پس از فایل نشانهٔ
 * `data-jozve` می‌آید و CSS با `:has()` قهرمان و بخش‌ها را کنار می‌برد و `home-more` را شبکهٔ
 * سفارش می‌کند؛ رابط پس از فایل و سؤال‌ها در همان شبکه‌اند. سؤال‌ها و بخش‌ها جای خودشان در DOM
 * می‌مانند و React دوباره نمی‌سازدشان. نشانه با خود رابط پس از فایل می‌آید: اگر تکه هنوز نرسیده،
 * کارت بارگذاری تا رسیدنش سر جایش است، نه صفحه‌ای نیمه‌خالی.
 */
export function OrderFlow({ hero, upload, trust, more, children }: Props) {
  const jozve = useJozve();
  // پیش‌فرض‌ها از تعرفه‌اند و رابط پس از فایل می‌گذاردشان؛ حالت اینجاست تا با «از اول» نرود.
  const [config, setConfig] = useState<OrderConfig | null>(null);
  const [loaded, setLoaded] = useState<DeskModule | null>(null);
  const [failed, setFailed] = useState(false);
  const ordering = jozve.sections.length > 0;
  // تکه‌ای که پیش از فایل (با نشانهٔ قصد) رسیده، همان لحظهٔ انداختن فایل رسم می‌شود.
  const desk = loaded ?? deskModule;

  // بار ناموفق کارت خطای خودش را نشان می‌دهد تا «دوباره تلاش کن» بار بعدی را بخواهد.
  const requestDesk = useCallback(() => {
    loadDesk().then(
      (module) => startTransition(() => setLoaded(module)),
      () => setFailed(true),
    );
  }, []);

  useEffect(() => {
    if (ordering && !desk) requestDesk();
  }, [ordering, desk, requestDesk]);

  // فایلی که به پنجره کشیده شد، قصد است؛ روی خود کارت هم DropZone همین را می‌گوید.
  useEffect(() => {
    window.addEventListener('dragenter', preloadDesk, { once: true });
    return () => window.removeEventListener('dragenter', preloadDesk);
  }, []);

  /*
   * رابط پس از فایل در رسم کم‌اولویت (transition) می‌آید، نه در همان کار انداختن فایل: رسمش چند تکه
   * می‌شود و بینش مرورگر کار کارگر تحلیل را راه می‌اندازد، که همان لحظه ساخته شده و تا اولین قیمت
   * طولانی‌ترین راه است (docs/UI.md، ۴ب). برگشت («از اول») فوری است.
   */
  const deskReady = ordering && (desk !== null || failed);
  const showDesk = useDeferredValue(deskReady) && deskReady;

  return (
    <>
      <div className="home-top">
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="site-wrap home-hero__grid">
            {hero}
            {showDesk ? null : (
              <div className="home-hero__order">
                <DropZone
                  onFiles={(files) => {
                    preloadDesk();
                    jozve.add(files);
                  }}
                  onIntent={preloadDesk}
                >
                  {upload}
                </DropZone>
              </div>
            )}
            {trust}
          </div>
        </section>
      </div>

      <div className="site-wrap home-more">
        {/*
          نشانهٔ حالت سفارش: سربرگ بی ناوبری و لوگوی بی پیوند می‌شود، تا جزوه با یک کلیک پاک نشود، و
          صفحه چیدمان سفارش را می‌گیرد. سربرگ کامپوننت سرور است و JS ندارد؛ حالت را CSS با :has() از
          همین نشانه می‌خواند (globals.css و home.css).
        */}
        {showDesk ? <span hidden data-jozve="" /> : null}
        {showDesk ? (
          desk ? (
            <desk.OrderDesk jozve={jozve} config={config} onConfig={setConfig} />
          ) : (
            <div className="home-desk">
              <div className="jy-card">
                <p className="jy-note jy-note--error">
                  <span className="jy-icon jy-icon-error" aria-hidden="true" />
                  <span>بخش سفارش کامل بار نشد. اینترنت را ببین و دوباره تلاش کن؛ فایلت همین‌جا مانده.</span>
                </p>
                <button type="button" onClick={requestDesk} className="jy-btn jy-btn--primary mt-4">
                  دوباره تلاش کن
                </button>
              </div>
            </div>
          )
        ) : null}
        {more}
        {children}
      </div>
    </>
  );
}
