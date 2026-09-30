import type { Metadata } from 'next';
import Link from 'next/link';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { BandsForm } from '../../../../../components/BandsForm';
import { NoAccess } from '../../../../../components/NoAccess';
import { Segments } from '../../../../../components/Segments';
import { StatusButton } from '../../../../../components/StatusButton';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import {
  averageGrams,
  bandLabel,
  boundFieldCount,
  boundsText,
  inKilos,
  marginRials,
  monthKey,
  percentText,
  ratioText,
  signedTomans,
  tomansText,
  tookRials,
  type ReportGroup,
  type ReportSums,
  type WeightRow,
} from '../../../../../lib/report';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import type { ReportBandsView } from '../../../../../lib/server/report';
import { resetBandsAction } from '../../../actions';

export const metadata: Metadata = { title: 'گزارش ارسال' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

/** «11 · 12 بسته»، و حاشیه با درصدش؛ در گوشی هر خانه با برچسب خودش (`data-k`، طرح). */
function GroupRow({ group, total = false }: { group: ReportGroup | (ReportSums & { label: string; key: string }); total?: boolean }) {
  const margin = marginRials(group);
  const pct = percentText(margin, group.paidRials);
  return (
    <tr className={total ? 'ad-total' : undefined} data-group={group.key}>
      <th scope="row">{group.label}</th>
      <td data-k="سفارش">
        <span>
          <span className="num">{formatNumber(group.orders)}</span> · <span className="num">{formatNumber(group.parcels)}</span> بسته
        </span>
      </td>
      <td data-k="مشتری داد">
        <span className="num">{tomansText(group.paidRials)}</span>
      </td>
      <td data-k="پست گرفت">
        <span className="num">{tomansText(tookRials(group))}</span>
      </td>
      <td data-k="حاشیه">
        <span>
          {total ? <b className="num">{signedTomans(margin)}</b> : <span className="num">{signedTomans(margin)}</span>}
          {pct ? (
            <>
              {' '}
              <span className="ad-pct num">{pct}</span>
            </>
          ) : null}
        </span>
      </td>
    </tr>
  );
}

function GroupTable({ id, title, head, groups, total }: { id: string; title: string; head: string; groups: ReportGroup[]; total?: ReportSums }) {
  return (
    <section className="jy-card" aria-labelledby={id} data-report={id}>
      <h2 id={id} className="jy-card__title">
        {title}
      </h2>
      <table className="ad-table ad-table--margin">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">{head}</span>
            </th>
            <th scope="col">سفارش</th>
            <th scope="col">مشتری داد</th>
            <th scope="col">پست گرفت</th>
            <th scope="col">حاشیه</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <GroupRow key={group.key} group={group} />
          ))}
          {total ? <GroupRow group={{ ...total, key: 'all', label: 'همه' }} total /> : null}
        </tbody>
      </table>
    </section>
  );
}

/** «690 گرم»، یا «—» برای بازهٔ بی سفارش. */
function Grams({ value }: { value: string | null }) {
  return value === null ? (
    <>—</>
  ) : (
    <span>
      <span className="num">{value}</span> گرم
    </span>
  );
}

function WeightTable({ rows, bounds }: { rows: WeightRow[]; bounds: number[] }) {
  const kilos = inKilos(bounds);
  return (
    <table className="ad-table ad-table--margin">
      <thead>
        <tr>
          <th scope="col">بازهٔ برآورد</th>
          <th scope="col">سفارش</th>
          <th scope="col">برآورد، میانگین</th>
          <th scope="col">واقعی، میانگین</th>
          <th scope="col">واقعی ÷ برآورد</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const ratio = ratioText(row.actualGrams, row.estimateGrams);
          return (
            <tr key={row.band.min} data-band={row.band.min}>
              <th scope="row">
                {/* یک جزء: در گوشی سرِ ردیف `flex` است و تکه‌های برچسب («زیر»، «1»، «کیلو») را از هم دور می‌کرد (طرح هم همین را داشت). */}
                <span>
                  <Segments segs={bandLabel(row.band, kilos)} />
                </span>
              </th>
              <td data-k="سفارش">
                <span className="num">{formatNumber(row.orders)}</span>
              </td>
              <td data-k="برآورد">
                <Grams value={averageGrams(row.estimateGrams, row.orders)} />
              </td>
              <td data-k="واقعی">
                <Grams value={averageGrams(row.actualGrams, row.orders)} />
              </td>
              <td data-k="واقعی ÷ برآورد">{ratio === null ? '—' : <span className="num">{ratio}</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** منبع بازه‌ها، کنار «بازه‌ها را عوض کن». */
function BandsSource({ bands }: { bands: ReportBandsView }) {
  if (bands.source === 'tariff') {
    return bands.tariff ? (
      <>
        بازه‌ها همان بازه‌های کرایهٔ تعرفهٔ فعال‌اند (نسخهٔ <span className="num">{bands.tariff.version}</span>:{' '}
        <Segments segs={boundsText(bands.tariff.bounds)} />
        ).
      </>
    ) : (
      <>تعرفهٔ فعالی نیست؛ یک بازه برای همهٔ وزن‌ها.</>
    );
  }
  return (
    <>
      بازه‌ها را از همین گزارش گذاشته‌ای (<Segments segs={boundsText(bands.bounds)} />)
      {bands.tariff ? (
        <>
          ؛ کرایهٔ تعرفهٔ فعال: <Segments segs={boundsText(bands.tariff.bounds)} />
        </>
      ) : null}
      .
    </>
  );
}

/**
 * گزارش ارسال (۶٫۴، طرح پنل `m-ship-report`، ADR-048): کرایه‌ای که مشتری داد در برابر کرایه و مالیاتی که پست گرفت، ماه‌به‌ماه به
 * روز «تحویل پست شد»؛ کل، به تفکیک منطقه و چاپخانه، و وزن واقعی در برابر برآورد با بازه‌هایی که مالک همین‌جا عوض می‌کند. فقط مالک
 * (`reports.read`)، پیش از هر خواندن (تصمیم ۱۰۶). ماه در نشانی (`?month=1405-07`)، فرم بازه‌ها با `?bands=edit`، بی JS.
 */
export default async function ReportPage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { report } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'reports.read')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await report.view(session, { month: one(query, 'month') });
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const { months, month, report: sums, bands, canEditBands } = result.value;

  const base = panelPath(gate, '/shipments/report');
  const key = month ? monthKey(month) : '';
  const here = key ? `${base}?month=${key}` : base;
  const editing = canEditBands && one(query, 'bands') === 'edit';
  const error = one(query, 'e');
  // پیام پس از کار فقط اگر هنوز راست است (مثل «تنظیمات»): همین بازه‌ها امروز هم همان‌اند.
  const saved = one(query, 'done') === 'bands' && one(query, 'b') === bands.seen;

  return (
    <>
      <Link href={panelPath(gate, '/shipments')} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        ارسال
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">گزارش ارسال</h1>
          <p className="ad-sub">
            کرایه‌ای که مشتری داد، در برابر کرایه و مالیاتی که پست گرفت؛ سفارش‌هایی که کد رهگیری دارند، به روز «تحویل پست شد». مبلغ‌ها
            تومان.
          </p>
        </div>
      </div>
      {error === 'setting_changed' || error === 'forbidden' ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      {saved ? (
        <Alert tone="success">
          {bands.source === 'tariff' ? (
            <>بازه‌های وزن گزارش به بازه‌های کرایهٔ تعرفهٔ فعال برگشت؛ با هر نسخهٔ تازهٔ تعرفه همراه می‌شوند.</>
          ) : (
            <>
              بازه‌های وزن گزارش ذخیره شد: <Segments segs={boundsText(bands.bounds)} />. قیمت و تعرفه عوض نشد.
            </>
          )}
        </Alert>
      ) : null}

      {!month || !sums ? (
        <section className="jy-card ad-gap" aria-labelledby="t-empty" data-report="empty">
          <h2 id="t-empty" className="jy-card__title">
            هنوز سفارشی به پست نرسیده است
          </h2>
          <p className="ad-lead">گزارش با اولین «تحویل پست شد» می‌آید، ماه‌به‌ماه.</p>
        </section>
      ) : (
        <>
          <nav className="ad-chips" aria-label="ماه">
            {months.map((chip) => (
              <Link key={chip.key} className="ad-chip" href={`${base}?month=${chip.key}`} aria-current={chip.selected ? 'page' : undefined}>
                <Segments segs={chip.label} />
              </Link>
            ))}
          </nav>
          <ul className="ad-tiles ad-tiles--money" data-report="tiles">
            <li>
              <div className="ad-tile" data-tile="orders">
                <span className="jy-badge jy-badge--neutral">سفارش</span>
                <span className="ad-tile__n num">{formatNumber(sums.total.orders)}</span>
                <span className="ad-tile__t">
                  <span className="num">{formatNumber(sums.total.parcels)}</span> بسته، با کد رهگیری
                </span>
              </div>
            </li>
            <li>
              <div className="ad-tile" data-tile="paid">
                <span className="jy-badge jy-badge--neutral">مشتری داد</span>
                <span className="ad-tile__n num">{tomansText(sums.total.paidRials)}</span>
                <span className="ad-tile__t">کرایهٔ منجمد همین سفارش‌ها</span>
              </div>
            </li>
            <li>
              <div className="ad-tile" data-tile="took">
                <span className="jy-badge jy-badge--neutral">پست گرفت</span>
                <span className="ad-tile__n num">{tomansText(tookRials(sums.total))}</span>
                <span className="ad-tile__t">
                  کرایه <span className="num">{tomansText(sums.total.fareRials)}</span> + مالیات{' '}
                  <span className="num">{tomansText(sums.total.taxRials)}</span>
                </span>
              </div>
            </li>
            <li>
              <div className="ad-tile" data-tile="margin">
                <span className="jy-badge jy-badge--neutral">حاشیه</span>
                <span className="ad-tile__n num">{signedTomans(marginRials(sums.total))}</span>
                <span className="ad-tile__t">
                  {percentText(marginRials(sums.total), sums.total.paidRials) ? (
                    <>
                      <span className="num">{percentText(marginRials(sums.total), sums.total.paidRials)}</span> کرایهٔ مشتری
                    </>
                  ) : (
                    'کرایهٔ مشتری صفر است'
                  )}
                </span>
              </div>
            </li>
          </ul>
          <p className="ad-meta ad-gap" data-report="untracked">
            {sums.untracked > 0 ? (
              <>
                «بی کد رهگیری»:{' '}
                <Link className="jy-link" href={`${panelPath(gate, '/orders')}?untracked=${key}`}>
                  <span className="num">{formatNumber(sums.untracked)}</span> سفارش
                </Link>{' '}
                تحویل پست‌شدهٔ این ماه هنوز کد ندارند و در این جمع نیستند. لغوشده‌ها نه.
              </>
            ) : (
              <>همهٔ سفارش‌های تحویل پست‌شدهٔ این ماه کد رهگیری دارند. لغوشده‌ها نه.</>
            )}
          </p>
          <div className="ad-stack ad-gap">
            {sums.total.orders === 0 ? (
              <section className="jy-card" aria-labelledby="t-none" data-report="no-parcels">
                <h2 id="t-none" className="jy-card__title">
                  هنوز سفارشی با کد رهگیری در این ماه نیست
                </h2>
                <p className="ad-lead">جمع‌ها با اولین فایل پستی که کد رهگیری سفارش‌های این ماه را بیاورد می‌آیند.</p>
              </section>
            ) : (
              <>
                <GroupTable id="t-mz" title="به تفکیک منطقه" head="منطقه" groups={sums.zones} total={sums.total} />
                <GroupTable id="t-mp" title="به تفکیک چاپخانه" head="چاپخانه" groups={sums.partners} />
              </>
            )}
            <section className="jy-card" aria-labelledby="t-mw" id="weights" data-report="t-mw">
              <h2 id="t-mw" className="jy-card__title">
                وزن واقعی در برابر برآورد
              </h2>
              <WeightTable rows={sums.weights} bounds={bands.bounds} />
              <p className="ad-hint ad-gap">وزن واقعی جمع بسته‌های هر سفارش است؛ برای تنظیم وزن بسته‌بندی و بازه‌های وزن تعرفه.</p>
              {editing ? (
                <>
                  <BandsForm
                    gate={gate}
                    month={key}
                    seen={bands.seen}
                    fields={Array.from({ length: boundFieldCount(bands.bounds) }, (_, i) => (bands.bounds[i] === undefined ? '' : String(bands.bounds[i])))}
                    cancelHref={`${here}#weights`}
                  />
                  {bands.source === 'custom' ? (
                    <form action={resetBandsAction} className="ad-actions">
                      <input type="hidden" name="gate" value={gate} />
                      <input type="hidden" name="month" value={key} />
                      <input type="hidden" name="seen" value={bands.seen} />
                      <StatusButton className="jy-btn jy-btn--text">برگرداندن به بازه‌های تعرفه</StatusButton>
                    </form>
                  ) : null}
                </>
              ) : (
                <div className="ad-bands" data-bands={bands.source}>
                  <span className="ad-bands__text">
                    <BandsSource bands={bands} />
                  </span>
                  {canEditBands ? (
                    <Link href={`${here}${key ? '&' : '?'}bands=edit#weights`} className="jy-btn jy-btn--text">
                      بازه‌ها را عوض کن
                    </Link>
                  ) : null}
                </div>
              )}
            </section>
          </div>
          <p className="ad-hint ad-gap">فقط خواندن: قیمت و کرایهٔ سفارش‌ها منجمد است و این گزارش چیزی را عوض نمی‌کند.</p>
        </>
      )}
    </>
  );
}
