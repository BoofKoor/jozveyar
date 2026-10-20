import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { AccountMark, BackLink } from '../../../../components/account/AccountViews';
import { MessageForm } from '../../../../components/account/MessageForm';
import { Inline } from '../../../../components/Inline';
import { formatMobile } from '../../../../lib/checkout/format';
import { accountOpen, accountService, sessionUserOf } from '../../../../lib/server/accountContext';
import { AUTH_COOKIE, authTokenFrom } from '../../../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'پیام به پشتیبانی',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

/**
 * «پیام تازه» (برش ۱۲٫۱، طرح `account.html`، سؤال ۳۰۹): «دربارهٔ کدام سفارش؟» با سه سفارش آخر و «سؤال کلی»؛ از صفحهٔ سفارش (`?order=10027`)
 * همان سفارش از پیش انتخاب شده. بی نشست، ورود و برگشت به همین‌جا.
 */
export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  if (!accountOpen()) notFound();
  const { order } = await searchParams;
  const orderNumber = /^\d{1,9}$/.test(order ?? '') ? Number(order) : null;
  const user = await sessionUserOf(authTokenFrom((await cookies()).get(AUTH_COOKIE)?.value));
  if (!user) redirect(`/orders?next=${encodeURIComponent(`/orders/messages/new${orderNumber === null ? '' : `?order=${orderNumber}`}`)}`);
  const view = await accountService().newMessage(user, orderNumber);
  return (
    <main className="site-wrap ac-page">
      <AccountMark />
      {view.from ? (
        <BackLink href={`/order/${view.from.token}`}>
          سفارش <span className="num">{view.from.number}</span>
        </BackLink>
      ) : (
        <BackLink href="/orders">سفارش‌های من</BackLink>
      )}
      <section className="jy-card" aria-labelledby="ac-new-title">
        <h1 id="ac-new-title" className="jy-card__title">
          پیام به پشتیبانی
        </h1>
        <p className="ck-sub">
          پاسخ را در «سفارش‌های من» می‌بینی، و به <span className="num nw">{formatMobile(view.mobile)}</span> هم پیامک می‌کنیم.
        </p>
        <MessageForm mode="new" choices={view.choices} selected={view.selected} />
        {view.hours ? (
          <p className="ac-hours">
            <span className="jy-icon jy-icon-info" aria-hidden="true" />
            <span>
              پاسخ‌گویی <Inline text={view.hours} />؛ معمولاً همان روز.
            </span>
          </p>
        ) : null}
      </section>
    </main>
  );
}
