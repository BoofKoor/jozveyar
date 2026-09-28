import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminActionForm } from '../../../../../../components/AdminActionForm';
import { NoAccess } from '../../../../../../components/NoAccess';
import { adminTarget } from '../target';

export const metadata: Metadata = { title: 'غیرفعال کردن ادمین' };

export default async function DisableAdminPage({ params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { session, target, back } = await adminTarget(gate, id);
  if (!target) return <NoAccess gate={gate} partner={session.partner} />;
  if (target.user.disabledAt) notFound();
  const name = target.user.displayName;
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        ادمین‌ها
      </Link>
      <AdminActionForm
        kind="disable"
        gate={gate}
        userId={target.user.id}
        title={`غیرفعال کردن ${name}`}
        lead={`${name} دیگر وارد پنل نمی‌شود و نشست‌های بازش همین حالا بسته می‌شوند. سابقهٔ کارهایش در رویدادها می‌ماند؛ برگرداندنش با «فعال کن با پیوند تازه».`}
        submit={`${name} را غیرفعال کن`}
        back={back}
      />
    </>
  );
}
