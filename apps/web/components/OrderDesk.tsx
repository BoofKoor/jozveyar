'use client';

import { useCallback, useMemo } from 'react';
import { quote } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { colorHint } from '../lib/fileCard';
import { jozveSpec, jozveView } from '../lib/jozveView';
import type { OrderConfig } from '../lib/orderConfig';
import type { JozveHandle } from '../lib/useJozve';
import { SingleFileCard } from './AnalysisCard';
import { ConfigPanel } from './ConfigPanel';
import { JozveFiles } from './JozveFiles';
import { OrderSummary, PriceDock } from './OrderSummary';

/** انتخاب‌های پیش‌فرض، از تعرفه: سیاه‌سفید، دورو، یک نسخه. */
export const INITIAL_CONFIG: OrderConfig = {
  colorMode: 'bw',
  sidesMode: 'double',
  bindingTypeId: DEFAULT_BINDING_TYPE_ID,
  paperTypeId: DEFAULT_PAPER_TYPE_ID,
  copies: 1,
};

interface Props {
  jozve: JozveHandle;
  /** null یعنی کاربر هنوز چیزی را عوض نکرده: پیش‌فرض‌ها. حالت در پوسته است، تا با «از اول» نرود. */
  config: OrderConfig | null;
  onConfig: (next: OrderConfig) => void;
}

/**
 * رابط پس از فایل (طرح ز، docs/UI.md ۴ب): قدم‌های سفارش، کارت «جزوهٔ تو»، «تنظیمات چاپ»، خلاصهٔ سفارش و
 * نوار قیمت موبایل. تکهٔ JS جداست و با اولین فایل بار می‌شود (`OrderFlow`)؛ پس `quote()`، تعرفه و همهٔ
 * متن‌های کارت‌ها در باندل اولیه نیستند.
 *
 * هر تکه یک خانهٔ شبکهٔ سفارش است (home.css): قدم‌ها بالای شبکه، کارت‌ها در ستون اصلی، خلاصه در
 * ستون کنار، و سؤال‌ها (از پوسته) زیر کارت‌ها. قیمت در هر دو حالت یک قلم است — صفحه‌های همهٔ فایل‌ها
 * جمع و یک صحافی (ADR-030) — با همان `quote()`.
 */
export function OrderDesk({ jozve, config, onConfig }: Props) {
  const current = config ?? INITIAL_CONFIG;
  const view = useMemo(() => jozveView(jozve.sections), [jozve.sections]);

  const quoteFor = useCallback(
    (next: OrderConfig) => {
      const spec = jozveSpec(view, next);
      return spec ? quote(spec, SEED_PRICE_LIST) : null;
    },
    [view],
  );
  const breakdown = useMemo(() => quoteFor(current), [quoteFor, current]);

  const pending = view.pending.filter((s) => s.serverPath).map((s) => s.name);
  const blocked = view.blocked.map((s) => s.name);

  return (
    <>
      <nav className="home-flow" aria-label="قدم‌های سفارش">
        <ol className="jy-flow">
          <li aria-current="step">
            <span className="jy-flow__n num">1</span>جزوه و قیمت
          </li>
          <li>
            <span className="jy-flow__n num">2</span>آدرس
          </li>
          <li>
            <span className="jy-flow__n num">3</span>پرداخت
          </li>
        </ol>
      </nav>

      <div className="home-desk">
        {view.sections.length === 1 ? (
          <SingleFileCard section={view.sections[0]!} onAdd={jozve.add} onReset={jozve.reset} />
        ) : (
          <JozveFiles
            view={view}
            overflow={jozve.overflow}
            onAdd={jozve.add}
            onMove={jozve.move}
            onRemove={jozve.remove}
            onReplace={jozve.replace}
            onReset={jozve.reset}
          />
        )}
        {breakdown ? (
          <ConfigPanel
            config={current}
            onChange={onConfig}
            priceList={SEED_PRICE_LIST}
            quoteFor={quoteFor}
            // صفحه‌های رنگی جای خودشان را دارند، کنار انتخاب رنگ؛ حکم «تماماً» فقط بعد از بررسی همه.
            colorHint={colorHint({
              colorPages: view.summary.colorPageCount,
              unknown: view.summary.colorUnknown,
              pending: view.provisional || view.blocked.length > 0,
              estimated: view.summary.estimated,
              jozve: view.sections.length > 1,
            })}
          />
        ) : null}
      </div>

      {breakdown ? (
        <>
          <aside className="home-side" aria-labelledby="summary-title">
            <OrderSummary
              breakdown={breakdown}
              config={current}
              priceList={SEED_PRICE_LIST}
              provisional={view.provisional}
              pending={pending}
              blocked={blocked}
            />
          </aside>
          <PriceDock breakdown={breakdown} provisional={view.provisional} blocked={blocked} />
        </>
      ) : null}
    </>
  );
}
