import { setAvailabilityAction } from '../app/[gate]/actions';
import { availabilityName, type AvailabilityItem } from '../lib/tariff';
import { Segments } from './Segments';
import { StatusButton } from './StatusButton';

/**
 * کارت «در دسترس بودن» صفحهٔ تعرفه (برش ۸٫۴، سؤال ۱۸۸): هر گزینهٔ خاموش‌شدنی نسخهٔ فعال (اندازه جز A4، کاغذ و صحافی جز پیش‌فرض‌ها) با
 * حالش، و برای مالک و متصدی «موقتاً خاموش کن» یا «دوباره روشن کن». قیمت و نسخه دست نمی‌خورند؛ حالی که صفحه نشان داد با فرم می‌رود.
 */
export function AvailabilityCard({ gate, items, canPause, note }: { gate: string; items: AvailabilityItem[]; canPause: boolean; note?: React.ReactNode }) {
  return (
    <section id="availability" className="jy-card" aria-labelledby="t-avail" data-tariff="availability">
      <h2 id="t-avail" className="jy-card__title">
        در دسترس بودن
      </h2>
      <p className="ad-hint">
        گزینه‌ای که موقتاً خاموش است در سایت «موقتاً در دسترس نیست» دیده می‌شود و سفارش نمی‌شود؛ جزوه‌ای که آن را داشت پیش‌فرض همان ردیف
        را می‌گیرد، با یادداشت. قیمت‌ها و نسخهٔ تعرفه عوض نمی‌شوند. صفحهٔ اصلی سایت تا یک دقیقه، و ثبت سفارش همان لحظه.
      </p>
      {note}
      {items.length === 0 ? (
        <p className="jy-note ad-gap">این نسخه گزینه‌ای جز پیش‌فرض‌ها ندارد؛ A4، کاغذ و صحافی پیش‌فرض خاموش نمی‌شوند.</p>
      ) : (
        <ul className="ad-versions ad-avail">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`} data-option={`${item.kind}:${item.id}`}>
              <span className="ad-versions__name">
                <Segments segs={availabilityName(item)} />
              </span>
              {item.paused ? (
                <span className="jy-badge jy-badge--warning">
                  <span className="jy-icon jy-icon-warning" aria-hidden="true" />
                  موقتاً در دسترس نیست
                </span>
              ) : (
                <span className="jy-badge jy-badge--success">
                  <span className="jy-icon jy-icon-success" aria-hidden="true" />
                  در دسترس
                </span>
              )}
              {canPause ? (
                <form action={setAvailabilityAction}>
                  <input type="hidden" name="gate" value={gate} />
                  <input type="hidden" name="kind" value={item.kind} />
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="seen" value={item.paused ? '1' : '0'} />
                  <input type="hidden" name="paused" value={item.paused ? '0' : '1'} />
                  <StatusButton className={item.paused ? 'jy-btn jy-btn--secondary' : 'jy-btn jy-btn--text'}>
                    {item.paused ? 'دوباره روشن کن' : 'موقتاً خاموش کن'}
                  </StatusButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
