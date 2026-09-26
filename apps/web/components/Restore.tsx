'use client';

import { useEffect } from 'react';
import type { CheckoutItem } from '@jozveyar/contracts/checkout';
import { tabStorage, writeDraft } from '../lib/draft';
import { RESTORING_ATTR } from '../lib/draftKey';
import type { FollowDocument, RestoredSection } from '../lib/jozveController';
import type { OrderConfig } from '../lib/orderConfig';
import { documentStatus, readDraft, restoredSections } from '../lib/restore';
import {
  fetchStatus,
  loadCheckout,
  markOf,
  primeCheckout,
  primeStep,
  restoredOrder,
  type HistoryMark,
  type RestoreProps,
} from './OrderDesk';

/*
 * برگشت بعد از رفرش (برش ۳د، ADR-036): تکهٔ جدای JS، فقط وقتی پیش‌نویسی در این زبانه هست (اسکریپت درون HTML
 * `data-restoring` را گذاشته است)؛ نه با رابط پس از فایل، تا راه اولین قیمت سبک بماند. رابط پس از فایل همین را با
 * `Restore` خودش بار می‌کند و وضعش را نگه می‌دارد (`primeCheckout`، `primeStep`).
 */

/**
 * قدم مسیر خریدی که صفحه در آن از نو بار شد (`history.state`، که با رفرش می‌ماند)، اگر هنوز رسیدنی است: همهٔ
 * فایل‌ها روی سرور و شمرده، و ثبت سفارش باز. تکهٔ مسیر خرید و قیمت سرور همین حالا می‌آیند، تا قدم یک‌راست همان‌جا
 * سوار شود، نه اول «جزوه و قیمت». نشد، همان خانهٔ تاریخچه با «جزوه و قیمت».
 */
async function restoredStep(items: CheckoutItem[] | null): Promise<HistoryMark | null> {
  const mark = markOf(history.state);
  if (!mark || mark.step === 'desk') return mark;
  const desk: HistoryMark = { step: 'desk', desk: mark.desk };
  if (!items) return desk;
  try {
    const status = await fetchStatus();
    if (!status || status.mode === 'off') return desk;
    const started = await (await loadCheckout()).checkoutStore().start(items);
    return started.ok ? mark : desk;
  } catch {
    return desk;
  }
}

type Restored = { sections: RestoredSection[]; config: OrderConfig | null } | 'lost' | null;

/**
 * پیش‌نویس، وضعیت سندها از سرور، و قدم؛ یک بار در هر بار صفحه. پیش‌نویسی که برنگشت پاک می‌شود، تا دفعهٔ بعد
 * دوباره امتحان نشود؛ جزوه‌ای که برگشت، با پنهان شدن صفحه دوباره نوشته می‌شود.
 */
async function restoreDraft(): Promise<Restored> {
  const storage = tabStorage();
  const draft = readDraft(storage);
  if (!draft) {
    writeDraft(storage, null);
    return null;
  }
  const deps = { fetch: window.fetch.bind(window), sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
  const sections = await restoredSections(draft.files, (id) => documentStatus(id, deps));
  if (!sections) {
    writeDraft(storage, null);
    return 'lost';
  }
  const { config, items } = restoredOrder(sections, draft.config);
  // مسیر خرید پیش از قدم: قدم خرید تکهٔ مسیر خرید را می‌آورد و قیمت سرور را با همان جای برگشته می‌گیرد.
  primeCheckout(draft.checkout);
  primeStep(await restoredStep(items));
  return { sections, config };
}

let restoring: Promise<Restored> | null = null;

/** سند فایل برگشته: پیگیری و پاک کردن با آپلودگر، که تکهٔ خودش است. ماژولش نیامد (شبکه): قاعدهٔ نگهداری باکت پاکش می‌کند. */
const followDocument: FollowDocument = (documentId, upload, onChange) => {
  const handle = import('../lib/upload/client').then(
    ({ followUpload, browserDeps }) => followUpload(documentId, upload, onChange, browserDeps()),
    () => null,
  );
  return { cancel: async (options) => (await handle)?.cancel(options) };
};

/**
 * جزوه‌ای که بعد از رفرش برمی‌گردد. کارت بارگذاری تا آن موقع «در حال برگرداندن جزوه…» است. جزوه‌ای که برگشت، خود
 * رابط پس از فایل نشانه را برمی‌دارد (`OrderDesk`)؛ برنگشت، همین‌جا: صفحهٔ معمول، و اگر جزوه‌ای بود (`lost`)، یک خط
 * که چرا.
 */
export function Restore({ state, jozve, onConfig, onDone }: RestoreProps) {
  useEffect(() => {
    if (state !== 'restoring') return;
    let live = true;
    // یک بار، حتی اگر React در حالت سخت‌گیر اثر را دو بار اجرا کند. خطای پیش‌بینی‌نشده: صفحهٔ معمول، و پیش‌نویس
    // پاک، تا هر بار صفحه همان خطا نشود.
    restoring ??= restoreDraft().catch(() => {
      writeDraft(tabStorage(), null);
      return null;
    });
    void restoring.then((restored) => {
      if (!live) return;
      if (restored && restored !== 'lost') {
        if (restored.config) onConfig(restored.config);
        jozve.restore(restored.sections, followDocument);
        return;
      }
      document.documentElement.removeAttribute(RESTORING_ATTR);
      onDone(restored === 'lost' ? 'lost' : null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- یک بار در هر بار صفحه
  }, [state]);
  return state === 'lost' ? (
    <p className="jy-note jy-note--info home-lost" role="status" data-testid="jozve-lost">
      <span className="jy-icon jy-icon-info" aria-hidden="true" />
      <span>جزوهٔ قبلی دیگر روی سرور نیست؛ دوباره بینداز.</span>
    </p>
  ) : null;
}
