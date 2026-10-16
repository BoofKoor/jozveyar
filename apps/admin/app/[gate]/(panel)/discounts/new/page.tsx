import type { Metadata } from 'next';
import Link from 'next/link';

import { DiscountForm } from '../../../../../components/DiscountForm';
import { NoAccess } from '../../../../../components/NoAccess';
import { panelPath } from '../../../../../lib/gate';
import { can } from '../../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../../lib/server/context';

export const metadata: Metadata = { title: 'کد تخفیف تازه' };

/** «کد تازه» (برش ۱۱٫۴، سؤال‌های ۲۹۸ و ۳۰۲): فقط مالک، با کد تازهٔ برنامهٔ تأیید. */
export default async function NewDiscountPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'discounts.manage')) return <NoAccess gate={gate} session={session} />;
  const back = panelPath(gate, '/discounts');
  return (
    <>
      <Link href={back} className="ad-back">
        <span className="jy-icon jy-icon-arrow" aria-hidden="true" />
        تخفیف‌ها
      </Link>
      <DiscountForm gate={gate} back={back} notice={null} />
    </>
  );
}
