import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminActionForm } from '../../../../../../components/AdminActionForm';
import { NoAccess } from '../../../../../../components/NoAccess';
import { adminTarget } from '../target';

export const metadata: Metadata = { title: 'کد ورود تازه' };

export default async function ResetAdminPage({ params }: { params: Promise<{ gate: string; id: string }> }) {
  const { gate, id } = await params;
  const { session, target, back } = await adminTarget(gate, id);
  if (!target) return <NoAccess gate={gate} partner={session.partner} />;
  const name = target.user.displayName;
  const disabled = target.user.disabledAt !== null;
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        ادمین‌ها
      </Link>
      <AdminActionForm
        kind="reset"
        gate={gate}
        userId={target.user.id}
        title={disabled ? `فعال کردن دوبارهٔ ${name}` : `کد ورود تازه برای ${name}`}
        lead={
          disabled
            ? `${name} با پیوند ثبت تازه دوباره فعال می‌شود و رمز و برنامهٔ تأیید تازه می‌گذارد؛ نقشش همان می‌ماند.`
            : `رمز و برنامهٔ تأیید فعلی ${name} باطل و نشست‌های بازش بسته می‌شود. پیوند ثبت تازه می‌سازی و برایش می‌فرستی.`
        }
        submit="ساختن پیوند"
        back={back}
      />
    </>
  );
}
