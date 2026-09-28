import type { Metadata } from 'next';

import { formatTehranTime } from '@jozveyar/text';

import { AuthShell } from '../../../../components/AuthShell';
import { InviteForm } from '../../../../components/InviteForm';
import { ROLE_NAMES } from '../../../../lib/messages';
import { requirePanel } from '../../../../lib/server/context';
import { qrPath, QR_QUIET_ZONE } from '../../../../lib/server/qr';
import { groupedSecret } from '../../../../lib/server/totp';

export const metadata: Metadata = { title: 'ثبت در پنل' };

/**
 * پیوند ثبت یک‌باره (ADR-037): رمز، و برنامهٔ تأیید گوشی با QR. دیدن صفحه پیوند را مصرف نمی‌کند (پیش‌نمایش
 * پیوند در پیام‌رسان هم)؛ فقط ثبت با رمز و کد درست. QR و کلید همین‌جا روی سرور کشیده می‌شوند.
 */
export default async function InvitePage({ params }: { params: Promise<{ gate: string; token: string }> }) {
  const { gate, token } = await params;
  const { auth } = requirePanel(gate);
  const info = await auth.inviteInfo(token);

  if (!info.ok) {
    return (
      <AuthShell>
        <section className="jy-card" aria-labelledby="t-expired">
          <span className="jy-icon jy-icon-warning ad-done__icon ad-done__icon--warning" aria-hidden="true" />
          <h1 id="t-expired" className="ad-done__title">
            {info.error === 'unavailable' ? 'پنل الان این پیوند را باز نمی‌کند' : 'این پیوند دیگر کار نمی‌کند'}
          </h1>
          <p className="ad-lead">
            پیوند ثبت فقط یک بار و تا <span className="num">15</span> دقیقه کار می‌کند. از مالک پنل پیوند تازه بخواه.
          </p>
          <p className="jy-note ad-gap">مالک پنل هستی؟ همان دستور ساختن ادمین را روی سرور دوباره بزن تا پیوند تازه بدهد.</p>
        </section>
      </AuthShell>
    );
  }

  const { value } = info;
  // کاربر چاپخانه (۵٫۳) با نام چاپخانه‌اش: «سارا تو را کاربر چاپ نور در پنل جزوه‌یار کرده است.»
  const role = value.partnerName ? `کاربر ${value.partnerName} در` : value.role ? ROLE_NAMES[value.role] : 'ادمین';
  const lead = value.reset
    ? 'کد ورودت از نو ساخته شد. رمز تازه بگذار و برنامهٔ تأیید گوشی را دوباره وصل کن؛ حساب قبلی برنامه دیگر کار نمی‌کند.'
    : value.creatorName
      ? `${value.creatorName} تو را ${role} پنل جزوه‌یار کرده است. رمز بگذار و برنامهٔ تأیید گوشی را وصل کن.`
      : `تو ${role} پنل جزوه‌یار هستی. رمز بگذار و برنامهٔ تأیید گوشی را وصل کن.`;
  const qr = qrPath(value.otpauth);
  const box = qr.size + 2 * QR_QUIET_ZONE;

  return (
    <AuthShell>
      <InviteForm
        gate={gate}
        token={token}
        displayName={value.displayName}
        username={value.username}
        lead={lead}
        until={formatTehranTime(value.expiresAt)}
        secret={groupedSecret(value.secret)}
        qr={
          <svg
            viewBox={`${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${box} ${box}`}
            shapeRendering="crispEdges"
            role="img"
            aria-label="کد QR برنامهٔ تأیید"
          >
            <path fill="currentColor" d={qr.d} />
          </svg>
        }
      />
    </AuthShell>
  );
}
