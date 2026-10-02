import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatNumber } from '@jozveyar/text';

import { Alert } from '../../../../../components/Alert';
import { NoAccess } from '../../../../../components/NoAccess';
import { RaiseAudienceForm } from '../../../../../components/RaiseAudienceForm';
import { AUDIENCE_NAMES } from '../../../../../lib/checkout';
import { panelPath } from '../../../../../lib/gate';
import { messageOf } from '../../../../../lib/messages';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';
import { AUDIENCE_RANK } from '../../../../../lib/server/settings';

type Query = Record<string, string | string[] | undefined>;
type Target = 'preview' | 'everyone';
const targetOf = (query: Query): Target | null => (query.to === 'everyone' || query.to === 'preview' ? query.to : null);

const TITLES: Record<Target, string> = {
  everyone: 'باز کردن مسیر خرید برای همه',
  preview: 'برگرداندن مسیر خرید به پیش‌نمایش مالک',
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  const to = targetOf(await searchParams);
  return { title: to ? TITLES[to] : 'مسیر خرید روی سایت' };
}

/** خطاهایی که «باز کن» با برگشت به همین صفحه می‌گوید (`?e=`): وضعیت تازه از نو، با پیامش. */
const PAGE_ERRORS = new Set(['checkout_changed', 'checkout_not_ready', 'invalid_setting', 'forbidden']);

/** صفحهٔ اصلی سایت پیش از این پله، برای مشتری تازه. */
const HOME_BEFORE: Record<'paused' | 'preview', string> = {
  paused: '«ثبت سفارش موقتاً متوقف است»',
  preview: '«ثبت سفارش آنلاین به‌زودی»',
};

/**
 * پلهٔ بالای مخاطب مسیر خرید، صفحهٔ جدا با کد تازه (برش ۷٫۵، ADR-052، سؤال ۱۶۹؛ طرح `st-live-open`): «باز کردن برای همه» از پیش‌نمایش یا
 * متوقف، و «برگرداندن به پیش‌نمایش» از متوقف. چه عوض می‌شود، اثرش روی سایت، و کد برنامهٔ تأیید. فقط مالک، فقط وقتی سایت آماده است، و
 * فقط پلهٔ بالا؛ هر چیز دیگر به کارت «مسیر خرید روی سایت» برمی‌گردد. پلهٔ پایین این صفحه را ندارد: یک فرم بی کد در همان کارت.
 */
export default async function CheckoutAudiencePage({ params, searchParams }: { params: Promise<{ gate: string }>; searchParams: Promise<Query> }) {
  const { gate } = await params;
  const query = await searchParams;
  const { settings } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'settings.edit')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await settings.checkoutCard(session);
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const view = result.value;
  const home = panelPath(gate, '/settings');
  const back = `${home}#checkout`;
  const error = typeof query.e === 'string' && PAGE_ERRORS.has(query.e) ? query.e : null;
  if (!view.readiness.ready) redirect(`${home}?ce=checkout_not_ready#checkout`);
  const to = targetOf(query);
  const from = view.audience;
  // همین حالا همان مخاطب یا بالاتر است (دو کلیک، برگشت مرورگر، یا جای دیگری عوض شد): کارت همان را نشان می‌دهد.
  if (!to || from === 'everyone' || AUDIENCE_RANK[to] <= AUDIENCE_RANK[from]) redirect(error ? `${home}?ce=${error}#checkout` : back);

  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        تنظیمات
      </Link>
      <section className="jy-card ad-narrow" aria-labelledby="t-open" data-audience-from={from} data-audience-to={to}>
        <h1 id="t-open" className="jy-card__title">
          {TITLES[to]}
        </h1>
        {error ? <Alert tone="error">{messageOf(error)}</Alert> : null}
        <ul className="ad-changes ad-gap" data-changes="">
          <li>
            <span className="ad-changes__k">مخاطب</span>
            <span>
              {AUDIENCE_NAMES[from]} ← {AUDIENCE_NAMES[to]}
            </span>
          </li>
          <li>
            <span className="ad-changes__k">صفحهٔ اصلی</span>
            <span>
              {HOME_BEFORE[from]} ←{' '}
              {to === 'everyone' ? '«ادامه» و پرداخت با زیبال' : '«ثبت سفارش آنلاین به‌زودی»؛ مرورگر پیش‌نمایش «ادامه» می‌بیند'}
            </span>
          </li>
          <li>
            <span className="ad-changes__k">پیامک</span>
            <span>
              کد، پرداخت و رهگیری با sms.ir{to === 'preview' ? '، فقط برای مرورگر پیش‌نمایش' : ''}
              {view.credit !== null ? (
                <>
                  ؛ اعتبار <span className="num">{formatNumber(view.credit)}</span>
                </>
              ) : null}
            </span>
          </li>
        </ul>
        <p className="jy-note jy-note--info ad-gap">
          <span className="jy-icon jy-icon-info" aria-hidden="true" />
          <span>
            {to === 'everyone'
              ? 'از همین لحظه هر مشتری سفارش می‌دهد و پول واقعی جابه‌جا می‌شود. برای بستن، «توقف» در همین «تنظیمات» بی کد و همان لحظه است.'
              : 'از همین لحظه مرورگری که پیوند پیش‌نمایش را باز کند سفارش می‌دهد، با پول و پیامک واقعی؛ بقیه «ثبت سفارش آنلاین به‌زودی» می‌بینند. پیوند را بعد از این در «تنظیمات» بساز؛ «توقف» بی کد و همان لحظه است.'}
          </span>
        </p>
        {to === 'everyone' ? (
          <p className="ad-hint ad-gap">پیش از این: یک سفارش واقعی کوچک در پیش‌نمایش تا پیامک رهگیری، و یک سفارش تا لغو و بازپرداخت.</p>
        ) : null}
        <RaiseAudienceForm gate={gate} to={to} seen={from} submit={to === 'everyone' ? 'باز کن' : 'برگردان'} back={back} />
      </section>
    </>
  );
}
