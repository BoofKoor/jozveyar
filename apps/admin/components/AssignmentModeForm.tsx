import type { AssignmentMode } from '@jozveyar/contracts';

import { assignmentModeAction } from '../app/[gate]/actions';
import { StatusButton } from './StatusButton';

const MODES: readonly { value: AssignmentMode; title: string; note: string }[] = [
  { value: 'auto', title: 'خودکار', note: 'هنگام پرداخت: همان شهر، همان استان، بعد نزدیک‌ترین؛ «شلوغ» و «تعطیل» هم' },
  { value: 'manual', title: 'دستی', note: 'سفارش پرداخت‌شده منتظر می‌ماند تا متصدی بسپاردش؛ چاپخانهٔ پیشنهادی در فرمش از پیش انتخاب شده' },
];

/**
 * کارت «تخصیص چاپخانه» در «تنظیمات» (برش ۱۰٫۱، سؤال ۱۹۹): خودکار یا دستی، فقط مالک، بی کد تازه. فرم بی JS؛ «همان که دیده شد» در فیلد
 * پنهان، و سرور زیر قفل تنظیم‌ها دوباره می‌سنجد.
 */
export function AssignmentModeForm({ gate, mode }: { gate: string; mode: AssignmentMode }) {
  return (
    <section id="assignment" className="jy-card" aria-labelledby="t-assignment">
      <h2 id="t-assignment" className="jy-card__title">
        تخصیص چاپخانه
      </h2>
      <form action={assignmentModeAction}>
        <input type="hidden" name="gate" value={gate} />
        <input type="hidden" name="seen" value={mode} />
        <fieldset className="jy-field ad-gap">
          <legend className="jy-label">سفارش پرداخت‌شده</legend>
          <div className="jy-tiles ad-roles">
            {MODES.map((tile) => (
              <label key={tile.value} className="jy-tile">
                <input className="jy-radio" type="radio" name="mode" value={tile.value} defaultChecked={mode === tile.value} />
                <span className="jy-tile__title">{tile.title}</span>
                <span className="jy-tile__note">{tile.note}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="jy-hint ad-gap">سفارشی که پیش‌تر سپرده شد دست نمی‌خورد، و با رفتن به «خودکار» سفارش‌های منتظر خودکار سپرده نمی‌شوند.</p>
        <div className="ad-actions">
          <StatusButton className="jy-btn jy-btn--secondary">ذخیره</StatusButton>
        </div>
      </form>
    </section>
  );
}
