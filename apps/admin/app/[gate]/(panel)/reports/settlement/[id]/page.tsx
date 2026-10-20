import type { Metadata } from 'next';
import Link from 'next/link';

import { formatJalaliNumeric, formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../components/Alert';
import { NoAccess } from '../../../../../../components/NoAccess';
import { ReportsNav } from '../../../../../../components/ReportsNav';
import { Segments } from '../../../../../../components/Segments';
import { StatusButton } from '../../../../../../components/StatusButton';
import { dayText } from '../../../../../../lib/format';
import { panelPath } from '../../../../../../lib/gate';
import { messageOf } from '../../../../../../lib/messages';
import { STATUS_LABELS } from '../../../../../../lib/orders';
import { searchOf } from '../../../../../../lib/production';
import { tomansText } from '../../../../../../lib/report';
import {
  SETTLEMENT_CHIPS,
  SETTLEMENT_CHIP_LABELS,
  balanceText,
  entryEffectRials,
  entryKindText,
  periodText,
  settlementParams,
  settlementRangeErrorText,
  settlementTotals,
  shareText,
  signedTomansText,
  type PanelSettlementOrder,
  type SettlementField,
} from '../../../../../../lib/settlement';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';
import type { SettlementView } from '../../../../../../lib/server/settlement';
import { requestReportPdfAction } from '../../../../actions';

export const metadata: Metadata = { title: 'صورت‌حساب تسویه' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

/** پیام پس از ثبت، فقط اگر ردیفش هنوز در صورت‌حساب است. */
const DONE: Record<string, string> = {
  payment: 'پرداخت ثبت شد؛ چاپخانه همین را در صورت‌حسابش می‌بیند.',
  adjustment: 'اصلاح ثبت شد.',
  void: 'ردیف باطل شد؛ با دلیلش در صورت‌حساب می‌ماند و در هیچ جمعی نیست.',
};

function Tile({ id, label, n, children }: { id: string; label: string; n: string; children?: React.ReactNode }) {
  return (
    <li>
      <div className="ad-tile" data-tile={id}>
        <span className="jy-badge jy-badge--neutral">{label}</span>
        <span className="ad-tile__n num">{n}</span>
        {children ? <span className="ad-tile__t">{children}</span> : null}
      </div>
    </li>
  );
}

/** بازه: «این ماه»، «ماه قبل»، و روز اول و آخر. */
function RangeCard({ gate, partnerId, view }: { gate: string; partnerId: string; view: SettlementView }) {
  const base = panelPath(gate, `/reports/settlement/${partnerId}`);
  const at = (field: SettlementField) => (view.error?.field === field ? settlementRangeErrorText(view.error.error) : null);
  const field = (id: string, name: SettlementField, label: string, placeholder: string) => {
    const error = at(name);
    return (
      <div className="jy-field">
        <label className="jy-label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          name={name}
          className="jy-input num"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          maxLength={40}
          placeholder={placeholder}
          defaultValue={view.form[name]}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? (
          <p id={`${id}-error`} className="jy-error">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>
    );
  };
  return (
    <section className="jy-card ad-gap" aria-labelledby="t-range" data-settlement="range">
      <h2 id="t-range" className="jy-card__title">
        بازه
      </h2>
      <nav className="ad-chips ad-gap" aria-label="ماه">
        {SETTLEMENT_CHIPS.map((chip) => (
          <Link key={chip} className="ad-chip" href={`${base}?d=${chip}`} aria-current={view.query?.chip === chip ? 'page' : undefined}>
            {SETTLEMENT_CHIP_LABELS[chip]}
          </Link>
        ))}
      </nav>
      <form className="ad-range__form" action={base} method="get" aria-label="بازهٔ روز" data-range="days">
        {field('s-from', 'from', 'از روز', '1405/07/01')}
        {field('s-to', 'to', 'تا روز', '1405/07/30')}
        <div className="ad-range__go">
          <button type="submit" className="jy-btn jy-btn--secondary">
            نشان بده
          </button>
        </div>
      </form>
      <p className="ad-hint ad-gap">
        سفارش‌ها به روز «تحویل پست شد»، و پرداخت و اصلاح به روزی که ثبت شده‌اند، به وقت تهران و هر دو سر شامل؛ یکی از دو تنها یعنی همان یک روز.
      </p>
    </section>
  );
}

function OrderLink({ gate, n }: { gate: string; n: number }) {
  return (
    <Link className="jy-link num" href={panelPath(gate, `/orders/${n}`)}>
      {n}
    </Link>
  );
}

const shareCell = (order: PanelSettlementOrder) => (order.shareBp === null ? 'بی سهم' : shareText(order.shareBp));

/**
 * صورت‌حساب تسویهٔ یک چاپخانه (برش ۱۰٫۳، ADR-069؛ سؤال‌های ۳۹۴ تا ۴۰۰): مانده پیش از بازه، سهم «تحویل پست شد»های بازه، پرداخت‌ها و اصلاح‌ها،
 * و مانده در پایان بازه؛ لغو پس از شروع چاپ و سفارش‌های در راه جدا، و دفتر با باطل‌شده‌ها. مالک و حسابدار هر چاپخانه، با «ثبت پرداخت»،
 * «ثبت اصلاح» و «باطل کن»؛ کاربر چاپخانه فقط خودش، بی پایهٔ سهم (مبلغ مشتری) و بی فرم. همه در نشانی، بی JS.
 */
export default async function StatementPage({ params, searchParams }: { params: Promise<{ gate: string; id: string }>; searchParams: Promise<Query> }) {
  const { gate, id } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'settlements.read')) return <NoAccess gate={gate} session={session} />;
  const result = await requirePanel(gate).settlement.view(session, id, { d: one(query, 'd'), from: one(query, 'from'), to: one(query, 'to') });
  if (!result.ok) {
    return (
      <>
        <ReportsNav gate={gate} session={session} current="settlement" />
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این چاپخانه پیدا نشد
          </h1>
          {session.partner ? null : (
            <div className="ad-actions">
              <Link href={panelPath(gate, '/reports/settlement')} className="jy-btn jy-btn--secondary">
                همهٔ چاپخانه‌ها
              </Link>
            </div>
          )}
        </section>
      </>
    );
  }
  const view = result.value;
  const { statement, query: range, money, canManage, canShare, now } = view;
  const { partner } = statement;
  const totals = settlementTotals(statement);
  const balance = balanceText(statement.balanceRials);
  const rangeParams = range ? settlementParams(range) : {};
  const base = panelPath(gate, `/reports/settlement/${partner.id}`);
  const done = one(query, 'done');
  const error = one(query, 'e');
  const doneText = done ? (DONE[done] ?? null) : null;

  return (
    <>
      <ReportsNav gate={gate} session={session} current="settlement" />
      {session.partner ? null : (
        <Link href={panelPath(gate, '/reports/settlement')} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          همهٔ چاپخانه‌ها
        </Link>
      )}
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">
            تسویهٔ {partner.name} · {partner.cityName}
          </h1>
          <p className="ad-sub" data-settlement="share">
            {partner.shareBp === null ? (
              'درصد سهم تعیین نشده: سفارش‌هایی که حالا سپرده شوند بی سهم‌اند.'
            ) : (
              <>
                درصد سهم امروز <span className="num">{shareText(partner.shareBp)}</span> از جمع چاپ، کاغذ و صحافی هر سفارش؛ سهم هر سفارش همان است که
                هنگام سپردن بود.
              </>
            )}{' '}
            {canShare ? (
              <Link className="jy-link" href={panelPath(gate, `/partners/${partner.id}/share`)}>
                {partner.shareBp === null ? 'تعیین درصد' : 'عوض کردن درصد'}
              </Link>
            ) : null}
          </p>
        </div>
      </div>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : doneText ? <Alert tone="success">{doneText}</Alert> : null}

      <ul className="ad-tiles ad-tiles--money" data-settlement="balance">
        <Tile id="balance" label="ماندهٔ امروز" n={balance.amount}>
          {balance.tone === 'settled' ? 'تسویه است' : `تومان، ${balance.text}`}
        </Tile>
        <Tile id="in-flight" label="در راه" n={tomansText(totals.inFlightRials)}>
          تومان، سهم <span className="num">{formatNumber(statement.inFlight.length)}</span> سفارش در صف و در حال چاپ
        </Tile>
      </ul>
      {canManage ? (
        <div className="ad-actions ad-gap" data-settlement="actions">
          <Link className="jy-btn jy-btn--primary" href={`${base}/payment${searchOf(rangeParams)}`}>
            ثبت پرداخت
          </Link>
          <Link className="jy-btn jy-btn--secondary" href={`${base}/adjustment${searchOf(rangeParams)}`}>
            ثبت اصلاح
          </Link>
        </div>
      ) : null}

      <RangeCard gate={gate} partnerId={partner.id} view={view} />

      {range ? (
        <>
          <h2 className="ad-h2 ad-gap" data-settlement="label">
            <Segments segs={range.label} />
          </h2>
          <ul className="ad-tiles ad-tiles--money ad-tiles--five" data-settlement="tiles">
            <Tile id="opening" label="مانده از پیش" n={signedTomansText(statement.openingRials)}>
              تومان، پیش از آغاز بازه
            </Tile>
            <Tile id="handed" label="سهم سفارش‌ها" n={tomansText(totals.handedRials)}>
              تومان، <span className="num">{formatNumber(totals.handed)}</span> سفارش تحویل‌شده
            </Tile>
            <Tile id="payments" label="پرداخت" n={tomansText(totals.paymentsRials)}>
              تومان، به چاپخانه
            </Tile>
            <Tile id="adjustments" label="اصلاح" n={signedTomansText(totals.adjustmentsRials)}>
              تومان
            </Tile>
            <Tile id="closing" label="مانده پایان بازه" n={signedTomansText(statement.closingRials)}>
              تومان
            </Tile>
          </ul>
          {totals.unshared > 0 ? (
            <p className="jy-note jy-note--warning ad-gap" data-settlement="unshared">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                <span className="num">{formatNumber(totals.unshared)}</span> سفارش تحویل‌شدهٔ این بازه بی سهم است و در هیچ جمعی نیست: وقتی سپرده شد، این
                چاپخانه درصد نداشت. اگر سهمی دارد، با «اصلاح» برای همان سفارش ثبت کن.
              </span>
            </p>
          ) : null}

          <div className="ad-cards ad-gap">
            <section className="jy-card" aria-labelledby="t-handed" data-settlement="handed">
              <h2 id="t-handed" className="jy-card__title">
                سفارش‌های تحویل‌شده
              </h2>
              {statement.handed.length === 0 ? (
                <p className="ad-lead">در این بازه سفارشی به پست تحویل نشده.</p>
              ) : (
                <table className="ad-table ad-table--margin">
                  <thead>
                    <tr>
                      <th scope="col">سفارش</th>
                      <th scope="col">تحویل پست</th>
                      {money ? <th scope="col">پایهٔ سهم</th> : null}
                      <th scope="col">درصد</th>
                      <th scope="col">سهم</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.handed.map((order) => (
                      <tr key={order.orderNumber} data-order={order.orderNumber}>
                        <th scope="row">
                          <OrderLink gate={gate} n={order.orderNumber} />
                        </th>
                        <td data-k="تحویل پست">{order.at ? <span className="num">{formatJalaliNumeric(order.at)}</span> : null}</td>
                        {money ? (
                          <td data-k="پایهٔ سهم">
                            <span className="num">{order.baseRials === null ? '' : tomansText(order.baseRials)}</span>
                          </td>
                        ) : null}
                        <td data-k="درصد">{order.shareBp === null ? 'بی سهم' : <span className="num">{shareCell(order)}</span>}</td>
                        <td data-k="سهم">{order.shareRials === null ? '—' : <span className="num">{tomansText(order.shareRials)}</span>}</td>
                      </tr>
                    ))}
                    <tr className="ad-total">
                      <th scope="row">جمع</th>
                      <td data-k="تحویل پست" />
                      {money ? <td data-k="پایهٔ سهم" /> : null}
                      <td data-k="درصد" />
                      <td data-k="سهم">
                        <span className="num">{tomansText(totals.handedRials)}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
              <p className="ad-hint ad-gap">مبلغ‌ها تومان. {money ? 'پایهٔ سهم: جمع چاپ، کاغذ و صحافی سفارش پیش از تخفیف.' : ''}</p>
            </section>

            {statement.cancelledAfterPrint.length > 0 ? (
              <section className="jy-card" aria-labelledby="t-cancelled" data-settlement="cancelled">
                <h2 id="t-cancelled" className="jy-card__title">
                  لغو پس از شروع چاپ
                </h2>
                <ul className="ad-people">
                  {statement.cancelledAfterPrint.map((order) => (
                    <li key={order.orderNumber} data-order={order.orderNumber}>
                      <span>
                        سفارش <OrderLink gate={gate} n={order.orderNumber} />
                        {order.at ? <>، لغو {dayText(order.at, now)}</> : null}، سهم{' '}
                        {order.shareRials === null ? 'نداشت' : <><span className="num">{tomansText(order.shareRials)}</span> تومان</>}
                      </span>
                      {canManage ? (
                        <Link className="jy-btn jy-btn--text" href={`${base}/adjustment${searchOf({ ...rangeParams, order: String(order.orderNumber) })}`}>
                          اصلاح برای این سفارش
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="ad-hint ad-gap">در مانده نیست؛ اگر بخشی از چاپ به چاپخانه می‌رسد، با «اصلاح» برای همان سفارش ثبت می‌شود.</p>
              </section>
            ) : null}

            {statement.inFlight.length > 0 ? (
              <section className="jy-card" aria-labelledby="t-flight" data-settlement="in-flight">
                <h2 id="t-flight" className="jy-card__title">
                  در راه
                </h2>
                <p className="ad-meta">
                  {statement.inFlight.map((order, i) => (
                    <span key={order.orderNumber}>
                      {i > 0 ? '، ' : null}
                      <OrderLink gate={gate} n={order.orderNumber} /> ({STATUS_LABELS[order.status]}
                      {order.shareRials === null ? '، بی سهم' : <>، <span className="num">{tomansText(order.shareRials)}</span></>})
                    </span>
                  ))}
                </p>
                <p className="ad-hint ad-gap">هنوز در مانده نیست؛ هر کدام با «تحویل پست شد» قطعی می‌شود.</p>
              </section>
            ) : null}

            <section className="jy-card" aria-labelledby="t-ledger" data-settlement="ledger">
              <h2 id="t-ledger" className="jy-card__title">
                پرداخت‌ها و اصلاح‌ها
              </h2>
              {statement.ledger.length === 0 ? (
                <p className="ad-lead">در این بازه پرداخت یا اصلاحی ثبت نشده.</p>
              ) : (
                <ul className="ad-people ad-ledger">
                  {statement.ledger.map((entry) => (
                    <li key={entry.id} data-entry={entry.id} data-voided={entry.voided ? '' : undefined}>
                      <div>
                        <p>
                          <b>{entryKindText(entry)}</b> · <span className="num">{signedTomansText(entryEffectRials(entry))}</span> تومان ·{' '}
                          <span className="num">{formatJalaliNumeric(entry.day)}</span>
                          {entry.voided ? <span className="jy-badge jy-badge--neutral">باطل</span> : null}
                        </p>
                        <p className="ad-people__meta">
                          {[
                            entry.period ? periodText(entry.period, now) : null,
                            entry.tracking ? `کد پیگیری ${entry.tracking}` : null,
                            entry.orderNumber !== null ? `سفارش ${entry.orderNumber}` : null,
                            entry.note,
                            `ثبت ${entry.createdByName ?? ''}`.trim(),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {entry.voided ? (
                          <p className="ad-people__meta">
                            باطل {dayText(entry.voided.at, now)}، {entry.voided.byName ?? ''}: {entry.voided.reason}
                          </p>
                        ) : null}
                      </div>
                      {canManage && !entry.voided ? (
                        <Link className="jy-btn jy-btn--text" href={`${base}/void/${entry.id}${searchOf(rangeParams)}`}>
                          باطل کن
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="ad-hint ad-gap">ردیف دفتر پاک یا عوض نمی‌شود؛ اشتباه را باطل کن و ردیف تازه بنویس.</p>
            </section>
          </div>

          <section className="jy-card ad-gap" aria-labelledby="t-export" data-settlement="export">
            <h2 id="t-export" className="jy-card__title">
              خروجی
            </h2>
            <p className="ad-lead">همین صورت‌حساب، با فهرست سفارش‌ها: اکسل همین حالا، و PDF چاپی چند ثانیه بعد.</p>
            <div className="ad-actions">
              <a className="jy-btn jy-btn--secondary" href={`${base}/xlsx${searchOf(rangeParams)}`} download data-export="xlsx">
                خروجی اکسل
              </a>
              <form action={requestReportPdfAction} data-export="pdf">
                <input type="hidden" name="gate" value={gate} />
                <input type="hidden" name="report" value="settlement" />
                <input type="hidden" name="p" value={partner.id} />
                {Object.entries(rangeParams).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <StatusButton className="jy-btn jy-btn--secondary">خروجی PDF</StatusButton>
              </form>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
