import { requirePanel } from '../../lib/server/context';

/**
 * دیوار دوم دروازه (پس از `middleware.ts`): مسیر نادرست یا پنلی که پیکربندی‌اش کامل نیست، ۴۰۴.
 */
export default async function GateLayout({ children, params }: { children: React.ReactNode; params: Promise<{ gate: string }> }) {
  requirePanel((await params).gate);
  return children;
}
