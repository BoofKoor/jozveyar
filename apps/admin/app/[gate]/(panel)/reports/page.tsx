import type { Metadata } from 'next';
import Link from 'next/link';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../components/Alert';
import { NoAccess } from '../../../../components/NoAccess';
import { ReportsNav } from '../../../../components/ReportsNav';
import { Segments } from '../../../../components/Segments';
import { StatusButton } from '../../../../components/StatusButton';
import { panelPath } from '../../../../lib/gate';
import { messageOf } from '../../../../lib/messages';
import { paperSizeText } from '../../../../lib/orders';
import {
  CHIP_LABELS,
  PRODUCTION_CHIPS,
  productionErrorText,
  productionParams,
  searchOf,
  stockPaperText,
  type ProductionField,
  type ProductionReport,
} from '../../../../lib/production';
import { tomansText } from '../../../../lib/report';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import type { ProductionView } from '../../../../lib/server/production';
import { requestReportPdfAction } from '../../actions';

export const metadata: Metadata = { title: 'گزارش تولید' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

/** پیوند سفارش‌ها در یادداشت‌ها: «10027، 10031»، هر شماره پیوند صفحهٔ همان سفارش. */
function OrderLinks({ gate, numbers }: { gate: string; numbers: readonly number[] }) {
  return (
    <>
      {numbers.map((n, i) => (
        <span key={n}>
          {i > 0 ? '، ' : null}
          <Link className="jy-link num" href={panelPath(gate, `/orders/${n}`)}>
            {n}
          </Link>
        </span>
      ))}
    </>
  );
}

/** یک فیلد بازه، با خطای خودش زیرش. */
function RangeField({
  id,
  name,
  label,
  value,
  placeholder,
  error,
}: {
  id: string;
  name: ProductionField;
  label: string;
  value: string;
  placeholder: string;
  error: string | null;
}) {
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
        defaultValue={value}
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
}

/** بازه: چیپ‌های امروز، دیروز و این ماه، فرم روز پرداخت و فرم شمارهٔ سفارش، و چیپ‌های چاپخانه برای مالک و حسابدار. */
function RangeCard({ gate, view }: { gate: string; view: ProductionView }) {
  const base = panelPath(gate, '/reports');
  const { form, error, query, partners, partnerId } = view;
  const at = (field: ProductionField) => (error?.field === field ? productionErrorText(error.error) : null);
  const partnerParam: Record<string, string> = partnerId ? { p: partnerId } : {};
  // چیپ چاپخانه همان بازهٔ امروز صفحه را نگه می‌دارد؛ با فرم خطادار، همان امروز.
  const rangeParams = query ? productionParams(query, null) : {};
  return (
    <section className="jy-card" aria-labelledby="t-range" data-production="range">
      <h2 id="t-range" className="jy-card__title">
        بازه
      </h2>
      <nav className="ad-chips ad-gap" aria-label="روز پرداخت">
        {PRODUCTION_CHIPS.map((chip) => (
          <Link
            key={chip}
            className="ad-chip"
            href={`${base}${searchOf({ d: chip, ...partnerParam })}`}
            aria-current={query?.chip === chip ? 'page' : undefined}
          >
            {CHIP_LABELS[chip]}
          </Link>
        ))}
      </nav>
      <div className="ad-range">
        <form className="ad-range__form" action={base} method="get" aria-label="بازهٔ روز پرداخت" data-range="paid">
          {partnerId ? <input type="hidden" name="p" value={partnerId} /> : null}
          <RangeField id="r-from" name="from" label="روز پرداخت، از" value={form.by === 'paid' ? form.from : ''} placeholder="1405/07/01" error={at('from')} />
          <RangeField id="r-to" name="to" label="تا" value={form.by === 'paid' ? form.to : ''} placeholder="1405/07/22" error={at('to')} />
          <div className="ad-range__go">
            <button type="submit" className="jy-btn jy-btn--secondary">
              نشان بده
            </button>
          </div>
        </form>
        <form className="ad-range__form" action={base} method="get" aria-label="بازهٔ شمارهٔ سفارش" data-range="number">
          {partnerId ? <input type="hidden" name="p" value={partnerId} /> : null}
          <RangeField
            id="r-nfrom"
            name="nfrom"
            label="شمارهٔ سفارش، از"
            value={form.by === 'number' ? form.nfrom : ''}
            placeholder="10027"
            error={at('nfrom')}
          />
          <RangeField id="r-nto" name="nto" label="تا" value={form.by === 'number' ? form.nto : ''} placeholder="10056" error={at('nto')} />
          <div className="ad-range__go">
            <button type="submit" className="jy-btn jy-btn--secondary">
              نشان بده
            </button>
          </div>
        </form>
      </div>
      <p className="ad-hint ad-gap">روز پرداخت به وقت تهران، هر دو سر شامل؛ یکی از دو تنها یعنی همان یک روز یا همان یک سفارش.</p>
      {partners && partners.length > 0 ? (
        <nav className="ad-chips ad-gap" aria-label="چاپخانه" data-production="partners">
          <Link className="ad-chip" href={`${base}${searchOf(rangeParams)}`} aria-current={partnerId === null ? 'page' : undefined}>
            همهٔ چاپخانه‌ها
          </Link>
          {partners.map((partner) => (
            <Link
              key={partner.id}
              className="ad-chip"
              href={`${base}${searchOf({ ...rangeParams, p: partner.id })}`}
              aria-current={partner.selected ? 'page' : undefined}
            >
              {partner.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

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

/** عدد در خانهٔ جدول، با برچسب ستون برای گوشی (`data-k`). */
function Num({ k, n }: { k: string; n: number }) {
  return (
    <td data-k={k}>
      <span className="num">{formatNumber(n)}</span>
    </td>
  );
}

function Tables({ report, money, partnerTable }: { report: ProductionReport; money: boolean; partnerTable: boolean }) {
  const kinds = [
    { key: 'color', label: 'رنگی', row: report.color },
    { key: 'bw', label: 'سیاه‌سفید', row: report.bw },
  ];
  return (
    <div className="ad-cards ad-gap">
      <section className="jy-card" aria-labelledby="t-kinds" data-production="kinds">
        <h2 id="t-kinds" className="jy-card__title">
          جزوه‌ها
        </h2>
        <table className="ad-table ad-table--margin">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">رنگ</span>
              </th>
              <th scope="col">جزوه</th>
              <th scope="col">فرد</th>
              <th scope="col">نسخه</th>
              <th scope="col">صفحه</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map(({ key, label, row }) => (
              <tr key={key} data-kind={key}>
                <th scope="row">{label}</th>
                <Num k="جزوه" n={row.jozves} />
                <Num k="فرد" n={row.odd} />
                <Num k="نسخه" n={row.copies} />
                <Num k="صفحه" n={row.pages} />
              </tr>
            ))}
            <tr className="ad-total" data-kind="all">
              <th scope="row">جمع</th>
              <Num k="جزوه" n={report.color.jozves + report.bw.jozves} />
              <Num k="فرد" n={report.color.odd + report.bw.odd} />
              <Num k="نسخه" n={report.color.copies + report.bw.copies} />
              <Num k="صفحه" n={report.color.pages + report.bw.pages} />
            </tr>
          </tbody>
        </table>
        <p className="ad-hint ad-gap">«رنگی»: دست‌کم یک روی رنگی. «فرد»: جزوه‌هایی که شمار صفحه‌شان فرد است. صفحه = رو × نسخه.</p>
      </section>
      <section className="jy-card" aria-labelledby="t-bindings" data-production="bindings">
        <h2 id="t-bindings" className="jy-card__title">
          صحافی
        </h2>
        <table className="ad-table ad-table--margin">
          <thead>
            <tr>
              <th scope="col">صحافی</th>
              <th scope="col">نسخه</th>
              <th scope="col">جلد</th>
            </tr>
          </thead>
          <tbody>
            {report.bindings.map((row) => (
              <tr key={row.id} data-binding={row.id}>
                <th scope="row">{row.name}</th>
                <Num k="نسخه" n={row.copies} />
                <Num k="جلد" n={row.volumes} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ad-hint ad-gap">جلد = جلدهای یک نسخه × نسخه.</p>
      </section>
      <section className="jy-card" aria-labelledby="t-stock" data-production="stock">
        <h2 id="t-stock" className="jy-card__title">
          اندازه و کاغذ
        </h2>
        <table className="ad-table ad-table--margin">
          <thead>
            <tr>
              <th scope="col">اندازه و کاغذ</th>
              <th scope="col">نسخه</th>
              <th scope="col">برگ</th>
            </tr>
          </thead>
          <tbody>
            {report.stock.map((row) => (
              <tr key={`${row.size}:${row.paper?.id ?? '*'}`} data-stock={`${row.size}:${row.paper?.id ?? '*'}`}>
                <th scope="row">
                  <span>
                    <span className="num">{paperSizeText(row.size)}</span> · {stockPaperText(row)}
                  </span>
                </th>
                <Num k="نسخه" n={row.copies} />
                <Num k="برگ" n={row.sheets} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ad-hint ad-gap">برگ = برگ یک نسخه × نسخه. «چند کاغذ»: جزوه‌ای با بیش از یک کاغذ.</p>
      </section>
      {partnerTable ? (
        <section className="jy-card" aria-labelledby="t-partners" data-production="partner-table">
          <h2 id="t-partners" className="jy-card__title">
            چاپخانه‌ها
          </h2>
          <table className="ad-table ad-table--margin">
            <thead>
              <tr>
                <th scope="col">چاپخانه</th>
                <th scope="col">سفارش</th>
                <th scope="col">نسخه</th>
                <th scope="col">صفحه</th>
                <th scope="col">برگ</th>
                {money ? <th scope="col">مبلغ</th> : null}
                {money ? <th scope="col">سهم چاپخانه</th> : null}
              </tr>
            </thead>
            <tbody>
              {report.partners.map((row) => (
                <tr key={row.key} data-partner={row.key}>
                  <th scope="row">{row.label}</th>
                  <Num k="سفارش" n={row.orders} />
                  <Num k="نسخه" n={row.copies} />
                  <Num k="صفحه" n={row.pages} />
                  <Num k="برگ" n={row.sheets} />
                  {money ? (
                    <td data-k="مبلغ">
                      <span className="num">{tomansText(row.amountRials)}</span>
                    </td>
                  ) : null}
                  {money ? (
                    <td data-k="سهم چاپخانه">
                      {row.key === 'none' ? (
                        '—'
                      ) : (
                        <span>
                          <span className="num">{tomansText(row.shareRials)}</span>
                          {row.unshared > 0 ? (
                            <span className="ad-pct">
                              {' '}
                              (<span className="num">{formatNumber(row.unshared)}</span> بی سهم)
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {money ? (
            <p className="ad-hint ad-gap">
              مبلغ: جمع پرداخت مشتری، تومان. سهم چاپخانه: سهم منجمد هر سفارش، همان که صورت‌حساب «تسویه» می‌شمارد؛ سفارش بی سهم در آن نیست.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * گزارش تولید (برش ۱۰٫۲، ADR-061، سؤال‌های ۲۰۱ و ۲۷۱ تا ۲۷۶): سفارش‌های پرداخت‌شدهٔ یک بازه (روز پرداخت به وقت تهران یا شمارهٔ سفارش)، با
 * احتساب نسخه‌ها؛ لغوشده‌ها جدا و «هنوز آماده نیست» با پیوند. مالک و حسابدار همهٔ چاپخانه‌ها و مبلغ، کاربر چاپخانه فقط خودش و بی مبلغ؛
 * متصدی نه (پیش از هر خواندن). همه در نشانی، بی JS؛ «خروجی اکسل» همان لحظه و «خروجی PDF» با کارگر، هر دو از همان گزارش.
 */
export default async function ProductionPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { production } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'reports.production')) return <NoAccess gate={gate} session={session} />;
  const result = await production.view(session, {
    d: one(query, 'd'),
    from: one(query, 'from'),
    to: one(query, 'to'),
    nfrom: one(query, 'nfrom'),
    nto: one(query, 'nto'),
    p: one(query, 'p'),
  });
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const view = result.value;
  const { query: range, report, money, partnerLabel, partnerId } = view;
  const error = one(query, 'e');
  const exportParams = range ? productionParams(range, partnerId) : null;
  const totals = report?.totals;
  const empty = !report || (report.totals.orders === 0 && report.cancelled.orders.length === 0);

  return (
    <>
      <ReportsNav gate={gate} session={session} current="production" />
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">گزارش تولید</h1>
          <p className="ad-sub">
            سفارش‌های پرداخت‌شده، با احتساب نسخه‌ها؛ لغوشده‌ها جدا و در هیچ جمعی نیستند.{session.partner ? ' فقط سفارش‌های همین چاپخانه.' : ''}
          </p>
        </div>
      </div>
      {error === 'invalid_report_range' || error === 'forbidden' ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      <RangeCard gate={gate} view={view} />

      {range && report && totals ? (
        <>
          <h2 className="ad-h2 ad-gap" data-production="label">
            <Segments segs={range.label} /> · {partnerLabel}
          </h2>
          {report.notReady.length > 0 ? (
            <p className="jy-note jy-note--warning ad-gap" data-production="not-ready">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                ⏳ <span className="num">{formatNumber(report.notReady.length)}</span> سفارش هنوز آماده نیست (فایل چاپ ساخته نشده):{' '}
                <OrderLinks gate={gate} numbers={report.notReady} />
              </span>
            </p>
          ) : null}
          {empty ? (
            <section className="jy-card ad-gap" aria-labelledby="t-empty" data-production="empty">
              <h2 id="t-empty" className="jy-card__title">
                در این بازه سفارش پرداخت‌شده‌ای نیست
              </h2>
              <p className="ad-lead">بازهٔ دیگری را از بالا انتخاب کن.</p>
            </section>
          ) : (
            <>
              <ul className={`ad-tiles ad-tiles--money${money ? ' ad-tiles--five' : ''}`} data-production="tiles">
                <Tile id="orders" label="سفارش" n={formatNumber(totals.orders)}>
                  <span className="num">{formatNumber(totals.jozves)}</span> جزوه، <span className="num">{formatNumber(totals.files)}</span> فایل
                </Tile>
                <Tile id="copies" label="نسخه" n={formatNumber(totals.copies)}>
                  جمع نسخه‌های همهٔ جزوه‌ها
                </Tile>
                <Tile id="pages" label="صفحه" n={formatNumber(totals.colorPages + totals.bwPages)}>
                  رنگی <span className="num">{formatNumber(totals.colorPages)}</span>، سیاه‌سفید{' '}
                  <span className="num">{formatNumber(totals.bwPages)}</span>
                </Tile>
                <Tile id="sheets" label="برگ" n={formatNumber(totals.sheets)}>
                  برگ مصرفی، با احتساب نسخه‌ها
                </Tile>
                {money ? (
                  <Tile id="amount" label="مبلغ" n={tomansText(report.amountRials)}>
                    جمع پرداخت مشتری، تومان؛ سهم چاپخانه{' '}
                    <span className="num">{tomansText(report.partners.reduce((sum, row) => sum + row.shareRials, 0n))}</span>
                  </Tile>
                ) : null}
              </ul>
              {report.cancelled.orders.length > 0 ? (
                <p className="ad-meta ad-gap" data-production="cancelled">
                  <span className="num">{formatNumber(report.cancelled.orders.length)}</span> سفارش لغوشده در بازه، در هیچ جمعی نیست:{' '}
                  <OrderLinks gate={gate} numbers={report.cancelled.orders} />
                  {money ? (
                    <>
                      {' '}
                      (پرداخت مشتری <span className="num">{tomansText(report.cancelled.amountRials)}</span> تومان)
                    </>
                  ) : null}
                  .
                </p>
              ) : null}
              {totals.orders > 0 ? <Tables report={report} money={money} partnerTable={view.partners !== null && report.partners.length > 1} /> : null}
              {exportParams ? (
                <section className="jy-card ad-gap" aria-labelledby="t-export" data-production="export">
                  <h2 id="t-export" className="jy-card__title">
                    خروجی
                  </h2>
                  <p className="ad-lead">همین گزارش، با فهرست همهٔ سفارش‌ها: اکسل همین حالا، و PDF چاپی چند ثانیه بعد.</p>
                  <div className="ad-actions">
                    <a className="jy-btn jy-btn--secondary" href={`${panelPath(gate, '/reports/xlsx')}${searchOf(exportParams)}`} download data-export="xlsx">
                      خروجی اکسل
                    </a>
                    <form action={requestReportPdfAction} data-export="pdf">
                      <input type="hidden" name="gate" value={gate} />
                      <input type="hidden" name="report" value="production" />
                      {Object.entries(exportParams).map(([name, value]) => (
                        <input key={name} type="hidden" name={name} value={value} />
                      ))}
                      <StatusButton className="jy-btn jy-btn--secondary">خروجی PDF</StatusButton>
                    </form>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : null}
      <p className="ad-hint ad-gap">فقط خواندن: عددها از دادهٔ منجمد هر سفارش‌اند و این گزارش چیزی را عوض نمی‌کند.</p>
    </>
  );
}
