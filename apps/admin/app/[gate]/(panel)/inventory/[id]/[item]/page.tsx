import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../../components/Alert';
import { MoveForm, ThresholdForm } from '../../../../../../components/InventoryForms';
import { NoAccess } from '../../../../../../components/NoAccess';
import { whenText } from '../../../../../../lib/format';
import { panelPath } from '../../../../../../lib/gate';
import { deltaText, itemLabel, MOVE_KIND_LABELS, sheetsNumber, stockState } from '../../../../../../lib/inventory';
import { messageOf } from '../../../../../../lib/messages';
import { can } from '../../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../../lib/server/context';

export const metadata: Metadata = { title: 'موجودی یک کاغذ' };

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === 'string' ? (query[key] as string) : undefined);

/** پیام پس از ثبت. */
const DONE: Record<string, string> = {
  track: 'پیگیری شروع شد؛ از این به بعد «شروع چاپ» هر سفارش این چاپخانه از همین کاغذ کم می‌کند.',
  purchase: 'ورود ثبت شد.',
  waste: 'ضایعات ثبت شد.',
  count: 'شمارش ثبت شد؛ موجودی حالا همان است که شمردی.',
  threshold: 'آستانه ذخیره شد.',
  threshold_same: 'آستانه همان بود؛ چیزی عوض نشد.',
};

const TONE_BADGE = { error: 'jy-badge--error', warning: 'jy-badge--warning', ok: 'jy-badge--success' } as const;

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

/**
 * موجودی یک کاغذ یک چاپخانه (برش ۱۰٫۴، ADR-070؛ سؤال‌های ۴۰۶ تا ۴۱۴ و ۴۱۶): موجودی، نیاز صف و آستانه؛ «ثبت» (ورود، ضایعات، شمارش) و آستانه
 * برای کسی که ثبت می‌کند؛ و همهٔ ردیف‌ها، تازه‌ترین اول، با موجودی پس از هر کدام، ۵۰ در هر صفحه. ردیف چاپ و برگشت خودکارند، با پیوند سفارش.
 */
export default async function StockItemPage({ params, searchParams }: { params: Promise<{ gate: string; id: string; item: string }>; searchParams: Promise<Query> }) {
  const { gate, id, item: itemParam } = await params;
  const query = await searchParams;
  const session = await requireSession(gate);
  if (!can(session, 'inventory.read')) return <NoAccess gate={gate} session={session} />;
  const result = await requirePanel(gate).inventory.item(session, id, itemParam, one(query, 'page'));
  if (!result.ok) {
    return (
      <>
        <Link href={panelPath(gate, '/inventory')} className="ad-back">
          <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
          موجودی کاغذ
        </Link>
        <section className="jy-card ad-noaccess" aria-labelledby="t-missing">
          <h1 id="t-missing" className="jy-card__title">
            این کاغذ پیدا نشد
          </h1>
        </section>
      </>
    );
  }
  const { now, view, page, pages, canManage } = result.value;
  const { partner, item, moves, total } = view;
  const state = stockState(item);
  const base = panelPath(gate, `/inventory/${partner.id}/${item.id}`);
  const done = one(query, 'done');
  const error = one(query, 'e');
  const doneText = done ? (DONE[done] ?? null) : null;

  return (
    <>
      <Link href={panelPath(gate, `/inventory/${partner.id}`)} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        موجودی کاغذ {partner.name}
      </Link>
      <div className="ad-pagehead">
        <div>
          <h1 className="ad-title">
            {itemLabel(item)} · {partner.name}
          </h1>
          <p className="ad-sub">
            <span className={`jy-badge ${TONE_BADGE[state.tone]}`} data-stock="state">
              {state.text}
            </span>
            {item.inTariff ? null : ' این کاغذ در این اندازه در تعرفهٔ فعال نیست؛ سفارش تازه‌ای از آن نمی‌آید.'}
          </p>
        </div>
      </div>
      {error ? <Alert tone="error">{messageOf(error)}</Alert> : doneText ? <Alert tone="success">{doneText}</Alert> : null}

      <ul className="ad-tiles" data-stock="tiles">
        <Tile id="balance" label="موجودی" n={sheetsNumber(item.balanceSheets)}>
          برگ
        </Tile>
        <Tile id="queued" label="در صف" n={formatNumber(item.queued.sheets)}>
          برگ، <span className="num">{formatNumber(item.queued.orders)}</span> سفارش در صف چاپ
        </Tile>
        <Tile id="after" label="پس از صف" n={sheetsNumber(item.balanceSheets - item.queued.sheets)}>
          برگ
        </Tile>
        <Tile id="threshold" label="آستانه" n={item.thresholdSheets === null ? '—' : formatNumber(item.thresholdSheets)}>
          {item.thresholdSheets === null ? 'بی هشدار آستانه' : 'برگ'}
        </Tile>
      </ul>

      {canManage ? (
        <div className="ad-cards ad-gap">
          <MoveForm target={{ gate, partnerId: partner.id, request: randomUUID() }} itemId={item.id} balance={sheetsNumber(item.balanceSheets)} />
          <ThresholdForm
            target={{ gate, partnerId: partner.id }}
            itemId={item.id}
            threshold={item.thresholdSheets === null ? '' : String(item.thresholdSheets)}
          />
        </div>
      ) : null}

      <section className="jy-card ad-gap" aria-labelledby="t-moves" data-stock="moves">
        <h2 id="t-moves" className="jy-card__title">
          ردیف‌ها
        </h2>
        <p className="ad-hint">
          <span className="num">{formatNumber(total)}</span> ردیف، تازه‌ترین اول. ردیف‌ها پاک و عوض نمی‌شوند؛ «شروع چاپ» و «برگشت چاپ» خودکارند.
        </p>
        <table className="ad-table ad-table--margin">
          <thead>
            <tr>
              <th scope="col">کی</th>
              <th scope="col">نوع</th>
              <th scope="col">تغییر</th>
              <th scope="col">موجودی پس از آن</th>
              <th scope="col">سفارش یا دلیل</th>
              <th scope="col">کاربر</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move) => (
              <tr key={move.id} data-move={move.kind}>
                <th scope="row">
                  <span className="num">{whenText(move.createdAt, now)}</span>
                </th>
                <td data-k="نوع">
                  {MOVE_KIND_LABELS[move.kind]}
                  {move.undone ? <span className="jy-badge jy-badge--neutral">برگشت خورد</span> : null}
                </td>
                <td data-k="تغییر">
                  <span className="num">{deltaText(move.deltaSheets)}</span>
                  {move.countedSheets !== null ? (
                    <span className="ad-hint">
                      {' '}
                      (شمرده: <span className="num">{formatNumber(move.countedSheets)}</span>)
                    </span>
                  ) : null}
                </td>
                <td data-k="موجودی پس از آن">
                  <span className="num">{sheetsNumber(move.balanceSheets)}</span>
                </td>
                <td data-k="سفارش یا دلیل">
                  {move.orderNumber !== null ? (
                    <Link className="jy-link num" href={panelPath(gate, `/orders/${move.orderNumber}`)}>
                      {move.orderNumber}
                    </Link>
                  ) : (
                    (move.note ?? '—')
                  )}
                </td>
                <td data-k="کاربر">{move.createdBy === null ? 'خودکار' : (move.createdByName ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pages > 1 ? (
          <nav className="ad-actions ad-gap" aria-label="صفحه‌های ردیف‌ها">
            {page > 1 ? (
              <Link className="jy-btn jy-btn--secondary" href={`${base}?page=${page - 1}`}>
                تازه‌ترها
              </Link>
            ) : null}
            <span className="ad-hint">
              صفحهٔ <span className="num">{formatNumber(page)}</span> از <span className="num">{formatNumber(pages)}</span>
            </span>
            {page < pages ? (
              <Link className="jy-btn jy-btn--secondary" href={`${base}?page=${page + 1}`}>
                قدیمی‌ترها
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}
