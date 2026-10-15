import Link from 'next/link';

import { ROLE_NAMES } from '../lib/messages';
import { ROLE_TILES, type RoleTile } from '../lib/roles';

/** همان کد خطای جابه‌جایی (`partner_required`)، ولی اینجا چاپخانهٔ خود کاربر است، نه «چاپخانهٔ تازه». */
export const ROLE_MESSAGES: Record<string, string> = { partner_required: 'چاپخانهٔ این کاربر را انتخاب کن.' };

/** چاپخانهٔ فعالی که کاربر چاپخانه به آن سپرده می‌شود. */
export interface PartnerChoice {
  id: string;
  name: string;
  cityName: string;
  isDefault: boolean;
}

/**
 * کاشی‌های نقش، و «کدام چاپخانه» که فقط با نقش «چاپخانه» دیده می‌شود (`:has()`، بی JS)؛ سرور هم فقط برای همان نقش می‌خواندش (برش ۵٫۳).
 * `current` نقش امروز ادمین در «عوض کردن نقش» است، با «· امروز» کنار نامش.
 */
export function RoleFields({
  role,
  current = null,
  partners,
  partner,
  roleError,
  partnerError,
  partnersHref,
}: {
  role: RoleTile;
  current?: RoleTile | null;
  partners: readonly PartnerChoice[];
  partner: string | undefined;
  roleError: string | null;
  partnerError: string | null;
  /** زبانهٔ «چاپخانه‌ها»، وقتی هیچ چاپخانهٔ فعالی نیست. */
  partnersHref: string;
}) {
  return (
    <>
      <fieldset className="jy-field" aria-describedby={roleError ? 'v-role-error' : undefined}>
        <legend className="jy-label">نقش</legend>
        <div className="jy-tiles ad-roles">
          {ROLE_TILES.map((tile) => (
            <label key={tile.role} className="jy-tile" data-role={tile.role}>
              <input
                className={tile.role === 'print_partner' ? 'jy-radio ad-role-partner' : 'jy-radio'}
                type="radio"
                name="role"
                value={tile.role}
                defaultChecked={role === tile.role}
              />
              <span className="jy-tile__title">
                {ROLE_NAMES[tile.role]}
                {current === tile.role ? ' · امروز' : ''}
              </span>
              <span className="jy-tile__note">{tile.note}</span>
            </label>
          ))}
        </div>
        {roleError ? (
          <p id="v-role-error" className="jy-error">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            {roleError}
          </p>
        ) : null}
      </fieldset>
      <fieldset className="jy-field ad-if-partner" aria-describedby={partnerError ? 'v-partner-error' : undefined}>
        <legend className="jy-label">کدام چاپخانه</legend>
        {partners.length > 0 ? (
          <div className="jy-tiles ad-roles">
            {partners.map((p) => (
              <label key={p.id} className="jy-tile">
                <input className="jy-radio" type="radio" name="partner" value={p.id} defaultChecked={p.id === partner} />
                <span className="jy-tile__title">{p.name}</span>
                <span className="jy-tile__note">{p.isDefault ? `${p.cityName} · پیش‌فرض` : p.cityName}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="jy-note">
            هیچ چاپخانهٔ فعالی نیست؛ اول از{' '}
            <Link className="jy-link" href={partnersHref}>
              «چاپخانه‌ها»
            </Link>{' '}
            یکی بیفزا یا فعال کن.
          </p>
        )}
        {partnerError ? (
          <p id="v-partner-error" className="jy-error">
            <span className="jy-icon jy-icon-error" aria-hidden="true" />
            {partnerError}
          </p>
        ) : null}
      </fieldset>
    </>
  );
}
