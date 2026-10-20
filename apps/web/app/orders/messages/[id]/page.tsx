import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { AccountMark, BackLink, ThreadCard } from '../../../../components/account/AccountViews';
import { MessageForm } from '../../../../components/account/MessageForm';
import { accountOpen, accountService, sessionUserOf } from '../../../../lib/server/accountContext';
import { AUTH_COOKIE, authTokenFrom } from '../../../../lib/server/checkoutContext';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'پیام به پشتیبانی',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

/**
 * یک گفت‌وگو (`/orders/messages/<شناسه>`، برش ۱۲٫۱، طرح `account.html`، سؤال‌های ۳۱۱ و ۳۱۴): پیام‌ها زیر هم، پاسخ با نام «پشتیبانی جزوه‌یار»،
 * و فرم پیام؛ گفت‌وگوی بسته با «بنویس؛ دوباره باز می‌شود». دیدن صفحه «دیده شد» را جلو می‌برد. گفت‌وگوی مشتری دیگر همان ۴۰۴.
 */
export default async function ThreadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  if (!accountOpen()) notFound();
  const { id } = await params;
  if (!/^\d{1,15}$/.test(id)) notFound();
  const user = await sessionUserOf(authTokenFrom((await cookies()).get(AUTH_COOKIE)?.value));
  if (!user) redirect(`/orders?next=${encodeURIComponent(`/orders/messages/${id}`)}`);
  const result = await accountService().thread(user, Number(id));
  if (!result.ok) notFound();
  const view = result.value;
  return (
    <main className="site-wrap ac-page">
      <AccountMark />
      <BackLink href="/orders">سفارش‌های من</BackLink>
      <ThreadCard
        view={view}
        sent={(await searchParams).sent === '1'}
        compose={<MessageForm mode="thread" threadId={view.id} status={view.status} />}
      />
    </main>
  );
}
