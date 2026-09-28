import type { Metadata } from 'next';
import Link from 'next/link';

import { formatTehranTime } from '@jozveyar/text';

import { NoAccess } from '../../../../components/NoAccess';
import { whenText } from '../../../../lib/format';
import { panelPath } from '../../../../lib/gate';
import { roleLabel } from '../../../../lib/messages';
import { can } from '../../../../lib/server/auth';
import { requirePanel, requireSession } from '../../../../lib/server/context';
import { revokeInviteAction } from '../../actions';

export const metadata: Metadata = { title: 'ادمین‌ها' };

/**
 * ادمین‌ها (طرح پنل): هر نفر با نقش و وضعیت؛ «کد ورود تازه» و «غیرفعال کن» به صفحهٔ کد تازه می‌روند،
 * «لغو دعوت» فقط دسترسی کم می‌کند و کد نمی‌خواهد. کد ورود خود مالک فقط با دستور روی سرور. کاربر چاپخانه (۵٫۳) با نام
 * چاپخانه‌اش («چاپخانه · چاپ نور») و «فقط سفارش‌های چاپ نور».
 */
export default async function AdminsPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  const { auth } = requirePanel(gate);
  const session = await requireSession(gate);
  if (!can(session, 'admins.manage')) return <NoAccess gate={gate} partner={session.partner} />;
  const result = await auth.listAdmins(session);
  if (!result.ok) return <NoAccess gate={gate} partner={session.partner} />;
  const now = new Date();
  const admins = result.value;

  return (
    <>
      <div className="ad-pagehead">
        <h1 className="ad-title">ادمین‌ها</h1>
        <Link href={panelPath(gate, '/admins/new')} className="jy-btn jy-btn--primary">
          <span className="jy-icon jy-icon-plus" aria-hidden="true" />
          افزودن ادمین
        </Link>
      </div>
      <section className="jy-card" aria-labelledby="t-people">
        <h2 id="t-people" className="jy-card__title">
          <span className="num">{admins.length}</span> نفر
        </h2>
        <ul className="ad-people">
          {admins.map(({ user, roles, partner, invite }) => {
            const self = user.id === session.userId;
            const status = user.disabledAt
              ? 'غیرفعال'
              : invite
                ? `دعوت شده؛ پیوند تا ${formatTehranTime(invite.expiresAt)}`
                : !user.passwordHash
                  ? 'هنوز ثبت نکرده؛ پیوندش گذشت'
                  : user.lastLoginAt
                    ? `آخرین ورود ${whenText(user.lastLoginAt, now)}`
                    : 'هنوز وارد نشده';
            const base = panelPath(gate, `/admins/${user.id}`);
            return (
              <li key={user.id} data-username={user.username}>
                <div>
                  <b>{user.displayName}</b> <span className="jy-badge jy-badge--neutral">{roleLabel(roles, partner, { withRole: true })}</span>
                  <p className="ad-people__meta">
                    <bdi className="ad-ltr">{user.username}</bdi> · {status}
                    {partner ? ` · فقط سفارش‌های ${partner.name}` : ''}
                    {self ? ' · تو' : ''}
                  </p>
                </div>
                {self ? null : (
                  <div className="ad-people__btns">
                    {user.disabledAt ? (
                      <Link href={`${base}/reset`} className="jy-btn jy-btn--text">
                        فعال کن با پیوند تازه
                      </Link>
                    ) : invite ? (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="gate" value={gate} />
                        <input type="hidden" name="userId" value={user.id} />
                        <button type="submit" className="jy-btn jy-btn--text">
                          لغو دعوت
                        </button>
                      </form>
                    ) : (
                      <>
                        <Link href={`${base}/reset`} className="jy-btn jy-btn--text">
                          {user.passwordHash ? 'کد ورود تازه' : 'پیوند تازه'}
                        </Link>
                        <Link href={`${base}/disable`} className="jy-btn jy-btn--text">
                          غیرفعال کن
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="ad-hint ad-gap">
          «کد ورود تازه» پیوند ثبت تازه می‌سازد، برای وقتی که گوشی کسی گم شد. کد ورود خود مالک با دستور روی سرور.
        </p>
      </section>
    </>
  );
}
