import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatJalali, formatNumber, formatTehranTime } from '@jozveyar/text';

import { AutoRefresh } from '../../../../../../components/AutoRefresh';
import { panelPath } from '../../../../../../lib/gate';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'خروجی PDF' };

/** «8 کیلوبایت»، «1.4 مگابایت». */
function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${formatNumber(Math.max(1, Math.ceil(bytes / 1024)))} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

/**
 * خروجی PDF یک گزارش (برش ۱۰٫۲، ADR-061، سؤال ۲۷۸): در حال ساختن (صفحه هر دو ثانیه خودش را تازه می‌کند)، ساخته با دانلود، یا ساخته نشد با
 * راه دوباره خواستن. فقط خواهنده، با همان دسترسی امروز؛ هر چه نخواند «پیدا نشد». PDF را کارگر با همان موتور قالب برگه‌ها می‌سازد، پس نشانی
 * محرمانهٔ پنل در حاشیهٔ کاغذ نمی‌آید (چاپ مرورگر می‌آوردش).
 */
export default async function ExportPage({ params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { exports } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await exports.view(session, id);
  if (!result.ok) notFound();
  const row = result.value;
  const reportName = row.report === 'shipping' ? 'گزارش ارسال' : 'گزارش تولید';
  const back = panelPath(gate, row.report === 'shipping' ? '/shipments/report' : '/reports');
  const asked = (
    <>
      خواستی {formatJalali(row.requestedAt)}، ساعت <span className="num">{formatTehranTime(row.requestedAt)}</span>.
    </>
  );

  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        {reportName}
      </Link>
      <section className="jy-card ad-narrow" aria-labelledby="t-export" data-export-state={row.state}>
        <h1 id="t-export" className="jy-card__title">
          خروجی PDF {reportName}
        </h1>
        {row.subtitle ? <p className="ad-lead">{row.subtitle}</p> : null}
        {row.state === 'building' ? (
          <>
            <AutoRefresh everyMs={2000} />
            <p className="jy-note jy-note--info ad-gap" role="status">
              <span className="jy-icon jy-icon-info" aria-hidden="true" />
              <span>
                در حال ساختن PDF… معمولاً چند ثانیه؛ همین صفحه وقتی ساخته شد دکمهٔ دانلود را نشان می‌دهد.
                {row.retryError ? ' تلاش قبلی نشد و دوباره امتحان می‌شود.' : ''}
              </span>
            </p>
            <p className="ad-meta ad-gap">
              {asked}{' '}
              <Link className="jy-link" href={panelPath(gate, `/reports/exports/${row.id}`)}>
                دوباره نگاه کن
              </Link>
            </p>
          </>
        ) : row.state === 'ready' ? (
          <>
            <p className="jy-note jy-note--success ad-gap" role="status">
              <span className="jy-icon jy-icon-success" aria-hidden="true" />
              <span>
                PDF ساخته شد: <span className="num">{formatNumber(row.pages ?? 0)}</span> صفحه، {sizeText(row.sizeBytes ?? 0)}.
              </span>
            </p>
            <div className="ad-actions">
              <a className="jy-btn jy-btn--primary" href={panelPath(gate, `/reports/exports/${row.id}/pdf`)} download={row.fileName} data-export="download">
                دانلود PDF
              </a>
            </div>
            <p className="ad-meta ad-gap">{asked} فقط تو می‌توانی دانلودش کنی، و یک روز پس از خواستن پاک می‌شود.</p>
          </>
        ) : (
          <>
            <p className="jy-note jy-note--error ad-gap" role="alert">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                PDF ساخته نشد{row.error ? <> (<bdi dir="ltr">{row.error}</bdi>)</> : null}. از گزارش دوباره بخواه؛ اگر باز نشد، لاگ کارگر می‌گوید
                چرا. خروجی اکسل همان گزارش همیشه هست.
              </span>
            </p>
            <div className="ad-actions">
              <Link className="jy-btn jy-btn--secondary" href={back}>
                {reportName}
              </Link>
            </div>
            <p className="ad-meta ad-gap">{asked}</p>
          </>
        )}
      </section>
    </>
  );
}
