import type { Metadata } from 'next';
import Link from 'next/link';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../components/Alert';
import { AutoRefresh } from '../../../../../../components/AutoRefresh';
import { NoAccess } from '../../../../../../components/NoAccess';
import { whenText } from '../../../../../../lib/format';
import { panelPath } from '../../../../../../lib/gate';
import { messageOf } from '../../../../../../lib/messages';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';
import { KIND_NAMES, defaultRef, previewJobErrorText, templateErrorOf } from '../../../../../../lib/ticketTemplates';
import { previewTemplateAction } from '../../../../actions';

export const metadata: Metadata = { title: 'نسخهٔ قالب برگه' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : '');

/** خطاهای «پیش‌نمایش دوباره» که با برگشت به همین صفحه می‌آیند (`?e=`). */
const PREVIEW_ERRORS = new Set([
  'order_number_invalid',
  'order_not_found',
  'preview_order_unpaid',
  'preview_files_deleted',
  'preview_busy',
  'template_not_found',
]);

/**
 * یک نسخهٔ قالب (برش ۹٫۲، ADR-057): پیش‌نمایش آخرش (صفحه‌ها با همان PNG کارگر، نشانی‌های ردشده، یا خطای قالب با خط)، «پیش‌نمایش
 * دوباره» با دادهٔ نمونه یا یک سفارش، دانلود قالب و PDF پیش‌نمایش، و راه فعال کردن. تا کارگر پیش‌نمایش را بسازد، صفحه خودش تازه می‌شود.
 */
export default async function TemplateVersionPage({ params, searchParams }: { params: Promise<{ gate: string; id: string }>; searchParams: Promise<Query> }) {
  const { gate, id } = await params;
  const query = await searchParams;
  const { templates } = requirePanel(gate);
  const session = await requireSession(gate);
  const result = await templates.version(session, id);
  const home = panelPath(gate, '/settings/templates');
  const back = (
    <Link href={home} className="ad-back">
      <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
      قالب برگه‌ها
    </Link>
  );
  if (!result.ok) {
    if (result.error === 'forbidden') return <NoAccess gate={gate} session={session} />;
    return (
      <>
        {back}
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این نسخه پیدا نشد
          </h1>
          <p className="ad-lead">نسخه‌ها را در «قالب برگه‌ها» ببین.</p>
        </section>
      </>
    );
  }
  const { now, version, active } = result.value;
  const { preview } = version;
  const self = panelPath(gate, `/settings/templates/${version.id}`);
  const kind = KIND_NAMES[version.kind];
  const busy = preview.job === 'busy';
  const ready = !busy && preview.at !== null && preview.error === null && preview.pages !== null;
  const templateError = !busy && preview.error ? templateErrorOf(preview.error) : null;
  const error = PREVIEW_ERRORS.has(one(query, 'e')) ? one(query, 'e') : null;
  const typed = /^[0-9۰-۹]{1,20}$/.test(one(query, 'o')) ? one(query, 'o') : '';
  const pages = ready ? Array.from({ length: preview.pages! }, (_, i) => i + 1) : [];

  return (
    <>
      {back}
      {busy ? <AutoRefresh everyMs={2000} /> : null}
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">
            {kind}، نسخهٔ <span className="num">{version.version}</span>
            {version.isActive ? (
              <span className="jy-badge jy-badge--success">
                <span className="jy-icon jy-icon-success" aria-hidden="true" />
                فعال
              </span>
            ) : null}
          </h1>
          <p className="ad-sub">
            <bdi>{version.fileName}</bdi> · <span className="num">{formatNumber(Math.max(1, Math.round(version.sizeBytes / 1024)))}</span> کیلوبایت ·
            بارگذاری {version.createdBy}، {whenText(version.createdAt, now)} ·{' '}
            <a href={`${self}/source`} download className="jy-link">
              دانلود قالب
            </a>
          </p>
        </div>
        {version.isActive ? null : ready ? (
          <Link href={`${self}/activate`} className="jy-btn jy-btn--primary">
            فعال کردن…
          </Link>
        ) : null}
      </div>
      {one(query, 'done') === 'upload' ? (
        <div className="ad-flash">
          <Alert tone="success">
            نسخهٔ <span className="num">{version.version}</span> {kind} بارگذاری شد. پیش‌نمایشش را با دادهٔ نمونه ببین؛ تا فعالش نکنی هیچ برگه‌ای
            عوض نمی‌شود.
          </Alert>
        </div>
      ) : null}
      <div className="ad-stack">
        <section className="jy-card" aria-labelledby="t-preview" data-preview={busy ? 'busy' : ready ? 'ready' : templateError ? 'error' : 'none'}>
          <div className="jy-card__head">
            <h2 id="t-preview" className="jy-card__title">
              پیش‌نمایش
            </h2>
            {ready && preview.at ? (
              <span className="jy-card__meta">
                {preview.orderNumber === null ? (
                  'با دادهٔ نمونه'
                ) : (
                  <>
                    با سفارش <span className="num">{preview.orderNumber}</span>
                  </>
                )}
                ، {whenText(preview.at, now)} · <span className="num">{preview.pages}</span> صفحه
              </span>
            ) : null}
          </div>
          {error ? <Alert tone={error === 'preview_busy' ? 'info' : 'error'}>{messageOf(error)}</Alert> : null}
          {busy ? (
            <p className="ad-lead" role="status">
              کارگر پیش‌نمایش را می‌سازد؛ چند ثانیهٔ دیگر همین‌جا می‌آید.
            </p>
          ) : null}
          {!busy && preview.job === 'failed' ? <Alert tone="error">{previewJobErrorText(preview.jobError)}</Alert> : null}
          {templateError ? (
            <div className="jy-note jy-note--error" data-template-error="">
              <span className="jy-icon jy-icon-error" aria-hidden="true" />
              <span>
                قالب ساخته نشد
                {templateError.line !== null ? (
                  <>
                    ، خط <span className="num">{templateError.line}</span>
                  </>
                ) : null}
                : <bdi className="ad-ltr">{templateError.message}</bdi>. فایل را درست کن و نسخهٔ تازه بارگذاری کن؛ این نسخه فعال‌شدنی نیست.
              </span>
            </div>
          ) : null}
          {ready && preview.blocked.length ? (
            <div className="jy-note jy-note--warning" data-blocked="">
              <span className="jy-icon jy-icon-warning" aria-hidden="true" />
              <span>
                این نشانی‌ها بار نشدند؛ فقط عکس و فونتی که درون خود قالب است (<bdi className="ad-ltr">data:</bdi>) چاپ می‌شود:{' '}
                {preview.blocked.map((url, i) => (
                  <span key={url}>
                    {i ? '، ' : ''}
                    <bdi className="ad-ltr">{url}</bdi>
                  </span>
                ))}
              </span>
            </div>
          ) : null}
          {ready && preview.gone ? (
            <p className="jy-note jy-note--info" data-preview-gone="">
              <span className="jy-icon jy-icon-info" aria-hidden="true" />
              <span>
                فایل‌های این پیش‌نمایش با فایل‌های سفارش <span className="num">{preview.orderNumber}</span> پس از روزهای نگهداری پاک شد؛ برای دیدن
                دوباره، پیش‌نمایش را با دادهٔ نمونه یا سفارش دیگری بساز.
              </span>
            </p>
          ) : ready ? (
            <>
              <div className="ad-sheet-wrap">
                {pages.map((page) => (
                  <article key={page} className="ad-sheet" aria-label={`پیش‌نمایش ${kind}، صفحهٔ ${page} از ${preview.pages}`}>
                    <img src={`${self}/preview?page=${page}`} alt={`پیش‌نمایش ${kind}، صفحهٔ ${page}`} width={1241} height={1754} loading={page === 1 ? undefined : 'lazy'} />
                  </article>
                ))}
              </div>
              <p className="ad-hint">
                <a href={`${self}/pdf`} download className="jy-link">
                  PDF پیش‌نمایش
                </a>{' '}
                برای چاپ آزمایشی روی کاغذ.
              </p>
            </>
          ) : null}
          <form action={previewTemplateAction} className="ad-form ad-tpl-preview">
            <input type="hidden" name="gate" value={gate} />
            <input type="hidden" name="id" value={version.id} />
            <div className="jy-field">
              <label className="jy-label" htmlFor="tpl-order">
                پیش‌نمایش با سفارش <span className="jy-optional">(اختیاری)</span>
              </label>
              <input
                id="tpl-order"
                name="order"
                className="jy-input jy-input--ltr num"
                inputMode="numeric"
                defaultValue={typed}
                placeholder="10027"
                aria-describedby="tpl-order-hint"
              />
              <p id="tpl-order-hint" className="jy-hint">
                شمارهٔ یک سفارش پرداخت‌شده، تا برگه را با دادهٔ واقعی‌اش ببینی؛ خالی یعنی دادهٔ نمونه (دو جزوه). پیش‌نمایش با سفارش کنار فایل‌های همان
                سفارش می‌ماند و با آنها پاک می‌شود.
              </p>
            </div>
            <div className="ad-actions">
              <button type="submit" className="jy-btn jy-btn--secondary" disabled={busy}>
                پیش‌نمایش دوباره
              </button>
            </div>
          </form>
        </section>
        <section className="jy-card" aria-labelledby="t-use">
          <h2 id="t-use" className="jy-card__title">
            به کار بردن
          </h2>
          {version.isActive ? (
            <p className="ad-lead">
              این نسخه فعال است: برگهٔ سفارش‌های تازه با همین ساخته می‌شود. برای برگشت، نسخهٔ دیگری را فعال کن یا{' '}
              <Link href={panelPath(gate, `/settings/templates/${defaultRef(version.kind)}/activate`)} className="jy-link">
                به قالب پیش‌فرض برگرد
              </Link>
              .
            </p>
          ) : ready ? (
            <p className="ad-lead">
              فعال کردن با کد تازه است و برگهٔ سفارش‌های «در صف چاپ» را هم با این نسخه از نو می‌سازد. امروز{' '}
              {active ? (
                <>
                  نسخهٔ <span className="num">{active.version}</span>
                </>
              ) : (
                'قالب پیش‌فرض'
              )}{' '}
              فعال است.
            </p>
          ) : (
            <p className="ad-lead">تا پیش‌نمایش درستی نیامده، این نسخه فعال‌شدنی نیست.</p>
          )}
        </section>
      </div>
    </>
  );
}
