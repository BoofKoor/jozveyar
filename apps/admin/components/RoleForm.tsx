'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { changeRoleAction, type FormState } from '../app/[gate]/actions';
import { messageOf } from '../lib/messages';
import { isRoleTile, type RoleTile } from '../lib/roles';
import type { AdminErrorCode } from '../lib/server/result';
import { Alert } from './Alert';
import { CodeField } from './CodeField';
import { ROLE_MESSAGES, RoleFields, type PartnerChoice } from './RoleFields';

const FIELD_ERRORS: Record<string, 'role' | 'partner' | 'code'> = {
  invalid_role: 'role',
  role_same: 'role',
  partner_required: 'partner',
  partner_inactive: 'partner',
  wrong_code: 'code',
  code_used: 'code',
};

interface Props {
  gate: string;
  userId: string;
  name: string;
  /** `roleSeen` نقش امروز: «همان که دیده شد». */
  seen: string;
  /** نقش امروز، اگر یکی از کاشی‌هاست. */
  current: RoleTile | null;
  /** چاپخانهٔ امروز کاربر چاپخانه. */
  currentPartner: string | null;
  lead: string;
  partners: readonly PartnerChoice[];
  partnersHref: string;
  back: string;
  /** صفحه پس از فرم کهنه دوباره ساخته شد (`?e=role_stale`)، حالا با نقش تازه. */
  notice: AdminErrorCode | null;
}

/**
 * «عوض کردن نقش» ادمین دیگر (برش ۹٫۴، سؤال ۱۹۷): همان کاشی‌های «افزودن ادمین» با نقش امروز از پیش، و کد تازه. نقش یکسان و کد نادرست
 * زیر فیلد خودشان؛ فرم کهنه صفحه را با نقش تازه دوباره می‌سازد (`changeRoleAction`)، و موفق به «ادمین‌ها» برمی‌گردد.
 */
export function RoleForm({ gate, userId, name, seen, current, currentPartner, lead, partners, partnersHref, back, notice }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeRoleAction, {});
  const error = state.error;
  const at = error ? FIELD_ERRORS[error] : undefined;
  const errorOf = (field: string) => (at === field ? (ROLE_MESSAGES[error!] ?? messageOf(error)) : null);
  const picked = state.values?.role;
  const role = isRoleTile(picked) ? picked : (current ?? 'operator');
  const partner = partners.find((p) => p.id === (state.values?.partner ?? currentPartner))?.id ?? partners[0]?.id;

  return (
    <section className="jy-card ad-narrow" aria-labelledby="t-role">
      <h1 id="t-role" className="jy-card__title">
        نقش {name}
      </h1>
      <p className="ad-lead">{lead}</p>
      {error === 'account_locked' ? (
        <Alert tone="warning">
          تلاش ناموفق زیاد شد و نشست‌ها بسته شدند. ورود تا ساعت <span className="num">{state.until}</span> بسته است.
        </Alert>
      ) : error && !at ? (
        <Alert tone="error">{messageOf(error)}</Alert>
      ) : !error && notice ? (
        <Alert tone="warning">{messageOf(notice)}</Alert>
      ) : null}
      <form action={action}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="seen" value={seen} />
        <div className="ad-form ad-roles-form">
          <RoleFields
            role={role}
            current={current}
            partners={partners}
            partner={partner}
            roleError={errorOf('role')}
            partnerError={errorOf('partner')}
            partnersHref={partnersHref}
          />
          <CodeField error={errorOf('code')} />
        </div>
        <div className="ad-actions">
          <button type="submit" className={`jy-btn jy-btn--primary${pending ? ' is-loading' : ''}`} disabled={pending}>
            نقش را عوض کن
          </button>
          <Link href={back} className="jy-btn jy-btn--text">
            انصراف
          </Link>
        </div>
      </form>
    </section>
  );
}
