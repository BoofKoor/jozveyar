import Link from 'next/link';

import { whenText } from '../lib/format';
import { panelPath } from '../lib/gate';
import { candidatesText, fareText, orderLine, weightSegs, whyText, type ImportRowView } from '../lib/shipments';
import { smsRowNote } from '../lib/sms';
import { Barcode } from './Barcode';
import { ResendSmsForm } from './ResendSmsForm';
import { Segments } from './Segments';

/** «با تأیید، علی محمدی» یا «دستی، علی محمدی» کنار کدی که پس از «ثبت» نشست (۶٫۲)؛ چاپخانه نام ادمین جزوه‌یار را نمی‌بیند. */
function viaText(row: ImportRowView, partner: boolean): string | null {
  const shipment = row.shipment;
  if (!shipment || shipment.matchedBy === 'rule') return null;
  const via = shipment.matchedBy === 'review' ? 'با تأیید' : 'دستی';
  return partner ? `${via} جزوه‌یار` : `${via}${shipment.adminName ? `، ${shipment.adminName}` : ''}`;
}

/**
 * یک گروه سطرهای فایل پست (طرح `m-ship-preview` و `m-ship-done`): هر سطر با شماره، «نام گ» و مقصد فایل، کد رهگیری، سفارشی که نشست یا
 * دلیل حکم، و وزن با کرایه و مالیات. `money`: کرایه و مالیات فقط با `orders.money` (از ۶٫۲ چاپخانه بی مبلغ، طرح).
 *
 * از ۶٫۲ هر سطر ثبت‌شده حال امروزش را هم دارد: کدی که با تأیید یا دستی نشست، کدهای کنارگذاشته، و «هیچ‌کدام»؛ سطر صف با نامزدهایش و
 * «بررسی»، و «پیدا نشد» یا «هیچ‌کدام» با «به سفارشی بده» (هر دو فقط `canReview`، مالک و متصدی). چاپخانه صف را «در انتظار بررسی
 * جزوه‌یار» می‌بیند، بی نامزد و بی نام ادمین‌ها.
 */
export function ImportRows({
  gate,
  importId,
  id,
  title,
  sub,
  head,
  rows,
  committed,
  money,
  canReview,
  partner,
  now,
  smsBefore,
}: {
  gate: string;
  importId: string;
  id: string;
  title: string;
  sub: React.ReactNode;
  /** دکمهٔ سر کارت گروه (طرح: «صف تأیید»). */
  head?: React.ReactNode;
  rows: readonly ImportRowView[];
  committed: boolean;
  money: boolean;
  canReview: boolean;
  partner: boolean;
  now: Date;
  /** پیش‌نمایش (۶٫۳، سؤال ۶۷): سطرهایی که همین کد پیش‌تر برای همین سفارش پیامک شد؛ با «ثبت» پیامک دوباره نمی‌رود. */
  smsBefore?: ReadonlySet<number>;
}) {
  if (rows.length === 0) return null;
  const rowPage = (rowNo: number) => panelPath(gate, `/shipments/${importId}/rows/${rowNo}?from=import`);
  return (
    <section className="jy-card ad-list" id={`g-${id}`} aria-labelledby={`t-g-${id}`} data-group={id}>
      <div className="jy-card__head">
        <h2 id={`t-g-${id}`} className="jy-card__title">
          {title} <span className="num">{rows.length}</span>
        </h2>
        {head}
      </div>
      {sub ? <p className="ad-list__sub">{sub}</p> : null}
      <ol className="ad-rows">
        {rows.map((row) => {
          const live = row.shipment;
          // کدی که همین حالا نشسته، سفارشش جلوی سطر است و دلیل حکم دیگر لازم نیست؛ جز قطعی که «تحویل پست شد» را می‌گوید.
          const why = live && row.verdict !== 'matched' ? null : whyText(row, { committed, partner });
          const fare = money ? fareText(row) : null;
          const target = live ? row.shipmentOrder : row.verdict === 'matched' ? row.order : null;
          const via = viaText(row, partner);
          // «به سفارشی بده»: «پیدا نشد»ی که هرگز کدی نگرفت، یا «هیچ‌کدام»ی که شاید اشتباه بود (تصمیم ۷۹).
          const assignable = committed && canReview && !live && !row.queued && (row.dismissed !== null || (row.verdict === 'unmatched' && row.voided.length === 0));
          return (
            <li key={row.rowNo} className="ad-prow" data-row={row.rowNo} data-verdict={row.verdict} data-state={rowState(row, committed)}>
              <span className="ad-prow__n num">{row.rowNo}</span>
              <p className="ad-prow__file">
                {row.purged ? (
                  <span className="ad-meta">متن سطر پس از روزهای نگهداری پاک شد</span>
                ) : (
                  <>
                    <b>
                      {row.surname}
                      {row.orderNumber !== null ? (
                        <>
                          {row.surname ? ' ' : ''}
                          <span className="num">{row.orderNumber}</span>
                        </>
                      ) : null}
                    </b>{' '}
                    <span className="ad-row__city">{row.destination}</span>
                  </>
                )}
              </p>
              <p className="ad-prow__bc">
                {row.barcode ? (
                  <Barcode code={row.barcode} />
                ) : row.barcodeText ? (
                  <bdi className="ad-ltr">{row.barcodeText}</bdi>
                ) : (
                  'بی کد رهگیری'
                )}
              </p>
              <div className="ad-prow__match">
                {target && (live || !committed) ? (
                  <p className="ad-prow__to">
                    <span className="jy-icon jy-icon-check" aria-hidden="true" />
                    <span>
                      <Link className="jy-link" href={panelPath(gate, `/orders/${target.orderNumber}`)}>
                        <Segments segs={orderLine(target).slice(0, 2)} />
                      </Link>
                      <Segments segs={orderLine(target).slice(2)} />
                      {via ? ` · ${via}` : null}
                    </span>
                  </p>
                ) : null}
                {why ? (
                  <p className="ad-prow__why">
                    <Segments segs={why} />
                    {row.candidates && canReview && (row.queued || !committed) ? (
                      <>
                        {' '}
                        <Segments segs={candidatesText(row.candidates)} />
                      </>
                    ) : null}
                  </p>
                ) : null}
                {row.voided.map((shipment) => (
                  <p key={shipment.id} className="ad-prow__why" data-voided="">
                    کد برای سفارش <span className="num">{shipment.orderNumber}</span> کنار رفت
                    {partner
                      ? ''
                      : `${shipment.voidedByName ? ` با ${shipment.voidedByName}` : ''}${shipment.voidReason ? `: «${shipment.voidReason}»` : ''}`}
                    .
                  </p>
                ))}
                {row.dismissed ? (
                  <p className="ad-prow__why" data-dismissed="">
                    {partner
                      ? 'جزوه‌یار کنار گذاشت («هیچ‌کدام»).'
                      : `«هیچ‌کدام»${row.dismissed.byName ? `، ${row.dismissed.byName}` : ''}، ${whenText(row.dismissed.at, now)}.`}
                  </p>
                ) : null}
                {committed && row.queued && partner ? <p className="ad-prow__why">در انتظار بررسی جزوه‌یار.</p> : null}
                {live && committed
                  ? (() => {
                      // پیامک رهگیری همین کد (۶٫۳): نرفته با «دوباره بفرست» (مالک و متصدی؛ چاپخانه «جزوه‌یار دوباره می‌فرستد»).
                      const note = smsRowNote(live.sms, live.createdAt, now);
                      if (!note) return null;
                      return (
                        <p className={note.failed ? 'ad-prow__sms' : 'ad-prow__why'} data-sms-note="">
                          {note.failed ? <span className="jy-icon jy-icon-error" aria-hidden="true" /> : null}
                          <span>
                            {note.text}
                            {note.resendable && partner ? ' جزوه‌یار دوباره می‌فرستد.' : ''}
                          </span>
                          {note.resendable && canReview ? (
                            <ResendSmsForm gate={gate} shipmentId={live.id} orderNumber={live.orderNumber} importId={importId} />
                          ) : null}
                        </p>
                      );
                    })()
                  : null}
                {!committed && smsBefore?.has(row.rowNo) ? (
                  <p className="ad-prow__why" data-sms-before="">
                    همین کد پیش‌تر برای همین سفارش پیامک شد؛ با «ثبت» پیامک دوباره نمی‌رود.
                  </p>
                ) : null}
                {row.costMismatch ? (
                  <p className="ad-prow__why">کرایه و مالیات با «هزینه کل» این سطر نمی‌خوانند؛ کرایه و مالیات ثبت می‌شوند.</p>
                ) : null}
                {committed && row.queued && canReview ? (
                  <p className="ad-prow__act">
                    <Link className="jy-btn jy-btn--text" href={rowPage(row.rowNo)}>
                      بررسی
                    </Link>
                  </p>
                ) : assignable ? (
                  <p className="ad-prow__act">
                    <Link className="jy-btn jy-btn--text" href={rowPage(row.rowNo)}>
                      به سفارشی بده
                    </Link>
                  </p>
                ) : null}
              </div>
              <p className="ad-prow__w">{row.weightGrams ? <Segments segs={weightSegs(row.weightGrams)} /> : null}</p>
              {fare ? (
                <p className="ad-prow__fare">
                  <Segments segs={fare} />
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** حال امروز سطر برای تست و `data-state`: کد، صف، «هیچ‌کدام»، یا فقط حکم. */
function rowState(row: ImportRowView, committed: boolean): string {
  if (!committed) return 'preview';
  if (row.shipment) return `code-${row.shipment.matchedBy}`;
  if (row.queued) return 'queued';
  if (row.dismissed) return 'dismissed';
  return row.voided.length > 0 ? 'voided' : 'verdict';
}
