import Link from 'next/link';
import type { ReactNode } from 'react';

import type { CheckoutAudience } from '@jozveyar/contracts';

import { lowerAudienceAction } from '../app/[gate]/actions';
import { AUDIENCE_NAMES, cardState, gapNote, needList, sinceSegs } from '../lib/checkout';
import { panelPath } from '../lib/gate';
import type { CheckoutCardView } from '../lib/server/settings';
import { CheckoutPreviewActions } from './CheckoutActions';
import { Segments } from './Segments';

/** هر مخاطب در فهرست کارت (طرح `ad-live__aud`)، وقتی مخاطب امروز نیست. */
const ABOUT: Record<CheckoutAudience, string> = {
  paused: 'هیچ‌کس سفارش تازه نمی‌دهد؛ برگشت از درگاه و استعلام کار می‌کنند.',
  preview: 'فقط مرورگری که پیوند پیش‌نمایش را باز کرد.',
  everyone: 'همهٔ مشتری‌ها، با پول و پیامک واقعی.',
};

/** مخاطب امروز، کامل‌تر، و جداکنندهٔ «از امروز 10:40، سارا» پس از آن (طرح: «… می‌بینند. از امروز»، «همهٔ مشتری‌ها؛ از امروز»). */
const NOW: Record<CheckoutAudience, { text: string; join: string }> = {
  paused: { text: 'هیچ‌کس سفارش تازه نمی‌دهد؛ برگشت از درگاه و استعلام کار می‌کنند', join: '. ' },
  preview: { text: 'فقط مرورگری که پیوند پیش‌نمایش را باز کرد؛ بقیه «ثبت سفارش آنلاین به‌زودی» می‌بینند', join: '. ' },
  everyone: { text: 'همهٔ مشتری‌ها', join: '؛ ' },
};

const AUDIENCES: readonly CheckoutAudience[] = ['paused', 'preview', 'everyone'];

/** «پلهٔ پایین»: یک فرم، بی کد و همان لحظه (سؤال ۱۶۹). */
function Lower({ gate, seen, to, tone, children }: { gate: string; seen: string; to: CheckoutAudience; tone: 'secondary' | 'text'; children: ReactNode }) {
  return (
    <form action={lowerAudienceAction}>
      <input type="hidden" name="gate" value={gate} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="seen" value={seen} />
      <button type="submit" className={tone === 'secondary' ? 'jy-btn jy-btn--secondary' : 'jy-btn jy-btn--text'}>
        {children}
      </button>
    </form>
  );
}

/**
 * کارت «مسیر خرید روی سایت» (برش ۷٫۵، ADR-052؛ طرح پنل `ad-live`): اول «تنظیمات»، فقط مالک. `.env` توانایی را می‌گوید و این کارت
 * مخاطب را: آماده یا خاموش (و چه کم است، با نام، هرگز مقدار)، مخاطب امروز با «از امروز 10:40، سارا»، و کارهای همان مخاطب. هر پلهٔ
 * بالا صفحهٔ کد تازه است (`/settings/checkout`)، هر پلهٔ پایین یک فرم بی کد. تا آماده نشده، مخاطب عوض نمی‌شود؛ با درگاه نمونه
 * (`CHECKOUT_MODE=mock`) مسیر خرید آزمایشی باز است و مخاطب اثری ندارد.
 */
export function CheckoutCard({ gate, view, now, note }: { gate: string; view: CheckoutCardView; now: Date; note?: ReactNode }) {
  const { readiness, audience, since, mode } = view;
  const state = cardState(view);
  const raise = (to: CheckoutAudience) => `${panelPath(gate, '/settings/checkout')}?to=${to}`;
  const meta = mode === 'live' ? 'زیبال و sms.ir' : mode === 'mock' ? 'درگاه نمونه' : null;
  const sinceNow = sinceSegs(since, audience, now);
  const gap = gapNote(readiness, audience);

  return (
    <section id="checkout" className="jy-card ad-live" aria-labelledby="t-live" data-state={state} data-audience={audience}>
      <div className="jy-card__head">
        <h2 id="t-live" className="jy-card__title">
          مسیر خرید روی سایت
        </h2>
        <span className="jy-card__meta">
          <bdi className="ad-ltr">CHECKOUT_MODE={mode}</bdi>
          {meta ? ` · ${meta}` : null}
        </span>
      </div>
      {note}
      {state === 'ready' ? (
        <>
          <div className="ad-live__state">
            <span className="jy-badge jy-badge--success">
              <span className="jy-icon jy-icon-success" aria-hidden="true" />
              آماده
            </span>
            <span className="ad-live__who">کد پذیرنده، کلید API، سه قالب و نشانی برگشت سر جایشان‌اند.</span>
          </div>
          <ul className="ad-live__aud" aria-label="مخاطب">
            {AUDIENCES.map((item) =>
              item === audience ? (
                <li key={item} className="is-current" aria-current="true" data-audience={item}>
                  <b>
                    {AUDIENCE_NAMES[item]} <span className="jy-badge jy-badge--neutral">حالا</span>
                  </b>
                  <span>
                    {NOW[item].text}
                    {sinceNow ? (
                      <>
                        {NOW[item].join}
                        <Segments segs={sinceNow} />
                      </>
                    ) : null}
                    .
                  </span>
                </li>
              ) : (
                <li key={item} data-audience={item}>
                  <b>{AUDIENCE_NAMES[item]}</b>
                  <span>{ABOUT[item]}</span>
                </li>
              ),
            )}
          </ul>
          {audience === 'preview' ? (
            <CheckoutPreviewActions gate={gate} seen={audience} openHref={raise('everyone')} />
          ) : audience === 'everyone' ? (
            <>
              <div className="ad-actions">
                <Lower gate={gate} seen={audience} to="paused" tone="secondary">
                  توقف مسیر خرید
                </Lower>
                <Lower gate={gate} seen={audience} to="preview" tone="text">
                  برگرداندن به پیش‌نمایش
                </Lower>
              </div>
              <p className="ad-hint ad-gap">
                «توقف» همان لحظه و بی کد: مشتری تازه «ثبت سفارش موقتاً متوقف است» می‌بیند؛ پرداخت‌های در راه برمی‌گردند و بررسی می‌شوند. باز
                کردن دوباره با کد تازه.
              </p>
            </>
          ) : (
            <>
              <div className="ad-actions">
                <Link href={raise('preview')} className="jy-btn jy-btn--primary">
                  برگرداندن به پیش‌نمایش…
                </Link>
                <Link href={raise('everyone')} className="jy-btn jy-btn--secondary">
                  باز برای همه…
                </Link>
              </div>
              <p className="ad-hint ad-gap">
                مشتری تازه «ثبت سفارش موقتاً متوقف است» می‌بیند؛ برگشت از درگاه و استعلام کار می‌کنند. هر پلهٔ باز کردن کد تازه می‌خواهد.
              </p>
            </>
          )}
        </>
      ) : (
        <>
          {state === 'mock' ? (
            <div className="ad-live__state">
              <span className="jy-badge jy-badge--warning">
                <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                درگاه نمونه
              </span>
              <span className="ad-live__who">
                مسیر خرید فقط برای آزمایش باز است: پول و پیامک واقعی نیست، و روی <bdi className="ad-ltr">jozveyar.com</bdi> خاموش است.
              </span>
            </div>
          ) : (
            <div className="ad-live__state">
              <span className="jy-badge jy-badge--error">
                <span className="jy-icon jy-icon-error" aria-hidden="true" />
                خاموش
              </span>
              <span className="ad-live__who">مشتری «ثبت سفارش آنلاین به‌زودی» می‌بیند، هر مخاطبی که اینجا باشد.</span>
            </div>
          )}
          <ul className="ad-need" aria-label="آمادگی مسیر خرید">
            {needList(readiness).map((item) => (
              <li key={item.part} data-part={item.part} data-ok={item.ok ? 'yes' : 'no'}>
                <span className={item.ok ? 'jy-icon jy-icon-success' : 'jy-icon jy-icon-error'} aria-hidden="true" />
                {item.label}
                <span className="sr-only">، {item.state}</span>
              </li>
            ))}
          </ul>
          {gap ? (
            <p className="jy-note jy-note--warning ad-gap" data-gap="">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                <Segments segs={gap} />
              </span>
            </p>
          ) : null}
          <p className="ad-hint ad-gap">
            تا آماده نشده، مخاطب عوض نمی‌شود (امروز «{AUDIENCE_NAMES[audience]}»). درگاه، پیامک و خود live فقط در{' '}
            <bdi className="ad-ltr">.env</bdi> سرور عوض می‌شوند.
          </p>
        </>
      )}
    </section>
  );
}
