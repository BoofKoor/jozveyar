import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthShell } from '../../../components/AuthShell';
import { LoginForm } from '../../../components/LoginForm';
import { panelPath } from '../../../lib/gate';
import { currentSession, requirePanel } from '../../../lib/server/context';

export const metadata: Metadata = { title: 'ورود' };

export default async function LoginPage({ params }: { params: Promise<{ gate: string }> }) {
  const { gate } = await params;
  requirePanel(gate);
  if (await currentSession()) redirect(panelPath(gate));
  return (
    <AuthShell>
      <LoginForm gate={gate} />
      <p className="ad-meta">گوشی کد را گم کرده‌ای؟ از مالک پنل بخواه کد ورودت را از نو بسازد.</p>
    </AuthShell>
  );
}
