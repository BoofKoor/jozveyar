import { Logo } from '@jozveyar/ui';

/** ورود و ثبت، بیرون از پوستهٔ پنل: لوگو و کارت وسط صفحهٔ green-50 (طرح پنل). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="ad-auth">
      <div className="ad-auth__in">
        <div className="ad-auth__logo">
          <Logo height={64} />
        </div>
        {children}
      </div>
    </main>
  );
}
