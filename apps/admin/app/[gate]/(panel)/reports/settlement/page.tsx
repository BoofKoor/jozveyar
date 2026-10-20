import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { NoAccess } from '../../../../../components/NoAccess';
import { ReportsNav } from '../../../../../components/ReportsNav';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { tomansText } from '../../../../../lib/report';
import { balanceText, shareText } from '../../../../../lib/settlement';
import { dayText } from '../../../../../lib/format';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { Alert } from '../../../../../components/Alert';

export const metadata: Metadata = { title: 'تسویهٔ چاپخانه‌ها' };

/**
 * تسویهٔ چاپخانه‌ها (برش ۱۰٫۳، ADR-069، سؤال ۳۹۸): هر چاپخانه با درصد سهم، ماندهٔ امروز، سهم سفارش‌های در راه و آخرین پرداخت؛ مالک و
 * حسابدار. کاربر چاپخانه یکراست به صورت‌حساب خودش می‌رود. متصدی نه (پیش از هر خواندن).
 */
export default async function SettlementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ gate: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gate } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'settlements.read')) return <NoAccess gate={gate} session={session} />;
  if (session.partner) redirect(panelPath(gate, `/reports/settlement/${session.partner.id}`));
  const result = await requirePanel(gate).settlement.overview(session);
  if (!result.ok) return <NoAccess gate={gate} session={session} />;
  const { rows, now, canShare } = result.value;
  const error = typeof query.e === 'string' ? query.e : null;
  const unshared = rows.reduce((sum, row) => sum + row.unshared, 0);

  return (
    <>
      <ReportsNav gate={gate} session={session} current="settlement" />
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">تسویهٔ چاپخانه‌ها</h1>
          <p className="ad-sub">
            سهم هر چاپخانه درصدی از جمع چاپ، کاغذ و صحافی هر سفارش است و با «تحویل پست شد» قطعی می‌شود. مانده = سهم سفارش‌های تحویل‌شده +
            اصلاح‌ها − پرداخت‌ها.
          </p>
        </div>
      </div>
      {error === 'partner_not_found' ? <Alert tone="error">{messageOf(error)}</Alert> : null}
      <section className="jy-card" aria-labelledby="t-settlements" data-settlement="overview">
        <h2 id="t-settlements" className="jy-card__title">
          <span className="num">{formatNumber(rows.length)}</span> چاپخانه
        </h2>
        <table className="ad-table ad-table--margin">
          <thead>
            <tr>
              <th scope="col">چاپخانه</th>
              <th scope="col">درصد سهم</th>
              <th scope="col">ماندهٔ امروز</th>
              <th scope="col">در راه</th>
              <th scope="col">آخرین پرداخت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const balance = balanceText(row.balanceRials);
              return (
                <tr key={row.id} data-partner={row.name}>
                  <th scope="row">
                    <span>
                      <Link className="jy-link" href={panelPath(gate, `/reports/settlement/${row.id}`)}>
                        {row.name}
                      </Link>{' '}
                      · {row.cityName}
                      {row.active ? null : <span className="jy-badge jy-badge--neutral">غیرفعال</span>}
                    </span>
                  </th>
                  <td data-k="درصد سهم">
                    {row.shareBp === null ? (
                      canShare ? (
                        <Link className="jy-link" href={panelPath(gate, `/partners/${row.id}/share`)}>
                          تعیین نشده
                        </Link>
                      ) : (
                        'تعیین نشده'
                      )
                    ) : (
                      <span className="num">{shareText(row.shareBp)}</span>
                    )}
                  </td>
                  <td data-k="ماندهٔ امروز" data-balance={balance.tone}>
                    <span>
                      <span className="num">{balance.amount}</span> {balance.tone === 'settled' ? '' : 'تومان، '}
                      {balance.text}
                    </span>
                  </td>
                  <td data-k="در راه">
                    {row.inFlight.orders === 0 ? (
                      '—'
                    ) : (
                      <span>
                        <span className="num">{formatNumber(row.inFlight.orders)}</span> سفارش،{' '}
                        <span className="num">{tomansText(row.inFlight.shareRials)}</span> تومان
                      </span>
                    )}
                  </td>
                  <td data-k="آخرین پرداخت">
                    {row.lastPayment ? (
                      <span>
                        <span className="num">{tomansText(row.lastPayment.amountRials)}</span> تومان، {dayText(row.lastPayment.day, now)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="ad-hint ad-gap">
          «در راه»: سفارش‌های در صف چاپ و در حال چاپ، که سهمشان هنوز در مانده نیست. ماندهٔ منفی یعنی بیش از سهم پرداخت شده.
          {unshared > 0 ? (
            <>
              {' '}
              <span className="num">{formatNumber(unshared)}</span> سفارش تحویل‌شده بی سهم است: وقتی سپرده شد چاپخانه‌اش درصد نداشت؛ اگر سهمی دارد،
              با «اصلاح» برای همان سفارش ثبت کن.
            </>
          ) : null}
        </p>
      </section>
    </>
  );
}
