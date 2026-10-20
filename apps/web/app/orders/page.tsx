import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AccountLogin } from '../../components/account/AccountLogin';
import { AccountMark, OrdersList } from '../../components/account/AccountViews';
import { safeNext } from '../../lib/account';
import { accountOpen, accountService, sessionUserOf } from '../../lib/server/accountContext';
import { AUTH_COOKIE, authTokenFrom } from '../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

// صفحهٔ خصوصی هر مشتری: نه در نتیجهٔ جست‌وجو، نه canonical صفحهٔ اصلی.
export const metadata: Metadata = {
  title: 'سفارش‌های من',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  referrer: 'strict-origin',
};

/**
 * «سفارش‌های من» (`/orders`، برش ۱۲٫۱، ADR-068؛ طرح `account.html`، سؤال‌های ۳۰۵ تا ۳۰۸): بی نشست ورود با کد پیامکی، و با نشست فهرست
 * سفارش‌ها (۲۰ در هر صفحه، `?page=`) و «پیام‌ها». `next` مقصد پس از ورود است، فقط صفحهٔ سفارش یا صفحه‌های همین بخش (`safeNext`). پشت حالت
 * مسیر خرید نیست.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string; next?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  // بی پایگاه داده یا رمز نشست (build، سرتاسری بی پایگاه داده) همان صفحهٔ ورود، که کدش «الان نشد» می‌گوید؛ پیوند سربرگ هرگز ۴۰۴ نیست.
  const user = accountOpen() ? await sessionUserOf(authTokenFrom((await cookies()).get(AUTH_COOKIE)?.value)) : null;
  if (!user) {
    return (
      <main className="site-wrap ac-solo">
        <AccountMark />
        <AccountLogin next={next} />
        <p className="ac-aside">
          هنوز سفارشی نداری؟{' '}
          <a className="jy-link" href="/">
            جزوه‌ات را بینداز
          </a>{' '}
          و قیمتش را همان لحظه ببین.
        </p>
      </main>
    );
  }
  if (next) redirect(next);
  const page = /^\d{1,6}$/.test(params.page ?? '') ? Number(params.page) : 1;
  return <OrdersList view={await accountService().orders(user, page)} />;
}
