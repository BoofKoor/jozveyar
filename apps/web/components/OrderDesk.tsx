'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CheckoutStatus } from '@jozveyar/contracts/checkout';
import { quote } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID, SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import type { ApiFailure } from '../lib/checkout/api';
import { orderGate, retryable } from '../lib/checkout/gate';
import { isStep, type Step } from '../lib/checkout/steps';
import type { CheckoutDraft } from '../lib/checkout/store';
import { draftOf, tabStorage, writeDraft } from '../lib/draft';
import type { RestoredSection } from '../lib/jozveController';
import { RESTORING_ATTR } from '../lib/draftKey';
import { colorHint } from '../lib/fileCard';
import { jozveSpec, jozveView, matchAwaited } from '../lib/jozveView';
import type { OrderConfig } from '../lib/orderConfig';
import { serverFailureMessage, uploadRefusalMessage } from '../lib/serverMessages';
import type { JozveHandle } from '../lib/useJozve';
import { Names, Note, SingleFileCard } from './AnalysisCard';
import { ConfigPanel } from './ConfigPanel';
import { JozveFiles } from './JozveFiles';
import { OrderSummary, PriceDock, type DeskAction } from './OrderSummary';
import { FlowNav } from './checkout/parts';

/** انتخاب‌های پیش‌فرض، از تعرفه: سیاه‌سفید، دورو، یک نسخه. */
export const INITIAL_CONFIG: OrderConfig = {
  colorMode: 'bw',
  sidesMode: 'double',
  bindingTypeId: DEFAULT_BINDING_TYPE_ID,
  paperTypeId: DEFAULT_PAPER_TYPE_ID,
  copies: 1,
};

/** مسیر خرید (قدم‌های آدرس و پرداخت): تکهٔ جدای JS، با دادهٔ شهرها؛ فقط وقتی کسی سراغش می‌آید. */
type CheckoutModule = typeof import('./checkout/Checkout');
let checkoutModule: CheckoutModule | null = null;
let checkoutLoading: Promise<CheckoutModule> | null = null;

/**
 * مسیر خریدی که بعد از رفرش برگشت ولی تکه‌اش هنوز نیامده (۳د): جزوه در «جزوه و قیمت» برگشت، و «ادامه» همان
 * جا و نشانی و کلید «پرداخت» را می‌آورد. با آمدن تکه به حالت مسیر خرید می‌نشیند.
 */
let pendingCheckout: CheckoutDraft | null = null;

function loadCheckout(): Promise<CheckoutModule> {
  checkoutLoading ??= import('./checkout/Checkout').then(
    (module) => {
      if (pendingCheckout) module.restoreCheckout(pendingCheckout);
      pendingCheckout = null;
      return (checkoutModule = module);
    },
    (error: unknown) => {
      checkoutLoading = null;
      throw error;
    },
  );
  return checkoutLoading;
}

const preloadCheckout = () => void loadCheckout().catch(() => undefined);

/**
 * حالت مسیر خرید از سرور (ADR-035)، یک بار در هر بار صفحه: وقتی قیمت نهایی شد، نه در باندل اولیه و نه در راه
 * اولین قیمت. `off` یعنی «ثبت سفارش آنلاین به‌زودی»؛ `auth` یعنی همین گوشی موبایلش را تأیید کرده و قدم کد لازم
 * نیست.
 */
let statusCache: CheckoutStatus | null = null;
let statusLoading: Promise<CheckoutStatus | null> | null = null;

async function requestStatus(): Promise<CheckoutStatus | null> {
  try {
    const response = await fetch('/api/checkout', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return null;
    statusCache = (await response.json()) as CheckoutStatus;
    return statusCache;
  } catch {
    return null;
  }
}

/** یک درخواست در هر لحظه: «ادامه»ای که وسط درخواست زده شود، همان پاسخ را می‌گیرد. */
function fetchStatus(): Promise<CheckoutStatus | null> {
  if (!statusLoading) {
    statusLoading = requestStatus();
    void statusLoading.finally(() => {
      statusLoading = null;
    });
  }
  return statusLoading;
}

/** خانهٔ تاریخچهٔ مرورگر برای هر قدم؛ `desk` شمارهٔ همین بار سوار شدن است، تا خانه‌های کهنه گم نکنند. */
interface HistoryMark {
  step: Step;
  desk: string;
}

const markOf = (state: unknown): HistoryMark | null => {
  const mark = (state as { jy?: HistoryMark } | null)?.jy;
  return mark && isStep(mark.step) && typeof mark.desk === 'string' ? mark : null;
};

/* ─────────────── برگشت بعد از رفرش (۳د، ADR-036؛ پیش‌نویس در lib/draft.ts) ─────────────── */

/** پیش‌نویس مسیر خرید همین حالا: از حالت خودش، یا همانی که برگشت و هنوز تکه‌اش نیامده. */
const checkoutDraft = (): CheckoutDraft | null => (checkoutModule ? checkoutModule.checkoutStore().draft() : pendingCheckout);

/** قدمی که جزوهٔ برگشته با آن سوار می‌شود؛ `Restore` می‌گذارد و `OrderDesk` یک بار برمی‌دارد. */
let restoredMark: HistoryMark | null = null;

/** برگشت بعد از رفرش (`Restore.tsx`، تکهٔ خودش) پیش از سوار شدن رابط: قدم، و مسیر خریدی که برگشت. */
export function primeRestore(mark: HistoryMark | null, checkout: CheckoutDraft | null) {
  restoredMark = mark;
  pendingCheckout = checkout;
}

/**
 * برای برگشت بعد از رفرش: تنظیمی که تعرفهٔ امروز دارد (تعرفهٔ تازه یعنی پیش‌فرض)، و قلم جزوهٔ برگشته اگر همه روی
 * سرور و شمرده‌اند. اینجاست، نه در `Restore.tsx`، تا نما و دروازه و موتور قیمت در همین تکه بمانند.
 */
export function restoredOrder(sections: readonly RestoredSection[], config: OrderConfig | null) {
  const known = config && SEED_PRICE_LIST.bindingTypes[config.bindingTypeId] && SEED_PRICE_LIST.paperTypes[config.paperTypeId] ? config : null;
  const gate = orderGate(jozveView(sections.map((section, i) => ({ ...section, key: `r${i}` }))), known ?? INITIAL_CONFIG);
  return { config: known, items: gate.kind === 'ready' ? gate.items : null };
}

export { fetchStatus, loadCheckout, markOf, type HistoryMark };

export interface RestoreProps {
  state: 'restoring' | 'lost';
  jozve: JozveHandle;
  onConfig: (next: OrderConfig) => void;
  onDone: (state: 'lost' | null) => void;
}

/**
 * تکهٔ برگرداندن (`Restore.tsx`) فقط وقتی پیش‌نویسی هست، و از همان لحظه‌ای که این تکه بار شد در راه است؛ نه جزو این
 * تکه، تا راه اولین قیمت سنگین‌تر نشود.
 */
type RestoreModule = typeof import('./Restore');
let restoreModule: Promise<RestoreModule> | null =
  typeof document !== 'undefined' && document.documentElement.hasAttribute(RESTORING_ATTR) ? import('./Restore') : null;

/**
 * جزوه‌ای که بعد از رفرش برمی‌گردد (۳د): پوستهٔ فلوی سفارش این را بالای کارت بارگذاری سوار می‌کند، وقتی اسکریپت
 * درون HTML پیش‌نویس همین زبانه را دیده است. تکه‌اش نیامد (شبکه): صفحهٔ معمول؛ پیش‌نویس برای بار بعد می‌ماند.
 */
export function Restore(props: RestoreProps) {
  const [module, setModule] = useState<RestoreModule | null>(null);
  useEffect(() => {
    let live = true;
    restoreModule ??= import('./Restore');
    restoreModule.then(
      (loaded) => live && setModule(loaded),
      () => {
        restoreModule = null;
        if (!live) return;
        document.documentElement.removeAttribute(RESTORING_ATTR);
        props.onDone(null);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- یک بار
  }, []);
  return module ? <module.Restore {...props} /> : null;
}

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
 *
 * «ادامه» مسیر خرید را در همان صفحه باز می‌کند (ADR-034، برش ۳ج): قدم‌های آدرس و پرداخت در تکهٔ جدای
 * `checkout/Checkout`، هر کدام یک خانه در تاریخچهٔ مرورگر؛ جزوه، آپلود و کارگر تحلیل همین‌جا زنده می‌مانند.
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

  /*
   * ── حالت مسیر خرید، وقتی قیمت نهایی شد ──
   * تا بررسی تمام نشده «ادامه» به هر حال «در حال بررسی…» است، پس حالت زودتر لازم نیست؛ و زودترش در راه اولین
   * قیمت و قیمت کامل جزوه بود: خود `fetch` روی رشتهٔ اصلی وقت می‌گیرد (۴× کند، حدود ۵ میلی‌ثانیه) و پاسخش رابط
   * را یک بار دیگر می‌کشید. قیمتی که کارگر می‌رساند به‌روزرسانی هم‌گام است و React اثرهایش را پیش از رسم اجرا
   * می‌کند؛ پس درخواست بعد از رسم همان قیمت می‌رود.
   */
  const [status, setStatus] = useState<CheckoutStatus | 'error' | null>(statusCache);
  const settled = breakdown !== null && !view.provisional;
  useEffect(() => {
    if (!settled || status !== null) return;
    // درخواستی که رفته، اگر جزوه در همین حین دوباره در بررسی شد، باز هم پاسخش می‌نشیند
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => void fetchStatus().then((next) => setStatus(next ?? 'error')), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [settled, status]);

  /*
   * ── قدم‌ها و تاریخچهٔ مرورگر ──
   * هر بار سوار شدن از «جزوه و قیمت» شروع می‌شود و خانه‌های تاریخچهٔ بار قبل کنار می‌روند؛ جز جزوه‌ای که بعد از
   * رفرش برگشت (۳د): همان قدم، و همان نشان بار قبل، تا «برگشت» و «جلو»ی گوشی خانه‌های پیش از رفرش را هم بشناسند.
   */
  const [restored] = useState(() => restoredMark);
  const [mount] = useState(() => restored?.desk ?? Math.random().toString(36).slice(2));
  const [step, setStep] = useState<Step>(restored?.step ?? 'desk');
  const moved = useRef(restored !== null);
  // جزوهٔ برگشته روی صفحه آمد: حالت «برگرداندن» در همان رسم می‌رود، پیش از نقاشی؛ نه لحظه‌ای صفحهٔ اول، نه دو کارت.
  useLayoutEffect(() => document.documentElement.removeAttribute(RESTORING_ATTR), []);
  useEffect(() => {
    restoredMark = null;
    history.replaceState({ ...history.state, jy: { step: restored?.step ?? 'desk', desk: mount } satisfies HistoryMark }, '');
    const onPop = (event: PopStateEvent) => {
      const mark = markOf(event.state);
      moved.current = true;
      setStep(mark?.desk === mount ? mark.step : 'desk');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [mount, restored]);

  /*
   * ── پیش‌نویس همین زبانه (۳د، ADR-036) ──
   * وقتی صفحه پنهان می‌شود یا می‌رود (رفرش، رفتن به برنامهٔ پیامک، درگاه) و با هر قدم؛ هرگز در راه اولین قیمت.
   */
  const latest = useRef({ sections: jozve.sections, config });
  useEffect(() => {
    latest.current = { sections: jozve.sections, config };
  });
  const saveDraft = useCallback(() => {
    writeDraft(tabStorage(), draftOf(latest.current.sections, latest.current.config, checkoutDraft()));
  }, []);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') saveDraft();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveDraft);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveDraft);
    };
  }, [saveDraft]);
  /** «از اول» و «فایل دیگری بینداز»: جزوه و پیش‌نویسش با هم می‌روند. */
  const reset = () => {
    writeDraft(tabStorage(), null);
    jozve.reset();
  };
  /**
   * جزوه‌ای که بعد از رفرش برگشت (۳د): همان فایلی که بخشی منتظرش است سر جای خودش می‌نشیند و آپلودش از همان تکه
   * ادامه می‌دهد (`matchAwaited`)؛ فایل دیگر جایگزینی است، یا فایل تازه ته جزوه.
   */
  const replace = (key: string, file: File) =>
    jozve.replace(key, file, matchAwaited(jozve.sections, [file]).resumed[0]?.key === key);
  const add = (files: File[]) => {
    const { resumed, rest } = matchAwaited(jozve.sections, files);
    for (const { key, file } of resumed) jozve.replace(key, file, true);
    if (rest.length > 0) jozve.add(rest);
  };

  const go = useCallback(
    (next: Step, { replace = false }: { replace?: boolean } = {}) => {
      const state = { ...history.state, jy: { step: next, desk: mount } satisfies HistoryMark };
      if (replace) history.replaceState(state, '');
      else history.pushState(state, '');
      moved.current = true;
      setStep(next);
      saveDraft();
    },
    [mount, saveDraft],
  );

  // هر قدم از بالای صفحه؛ برگشت به «جزوه و قیمت» فوکوس را به کارت «جزوهٔ تو» می‌آورد.
  useEffect(() => {
    if (!moved.current) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (step === 'desk') document.getElementById('jozve-title')?.focus({ preventScroll: true });
  }, [step]);

  /* ── «ادامه» ── */
  const gate = useMemo(() => orderGate(view, current), [view, current]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const mode = status === null || status === 'error' ? null : status.mode;
  const open = mode === 'mock' || mode === 'live' || status === 'error';

  // ثبت سفارش باز است و فایل‌ها رسیده‌اند: کاربر احتمالاً ادامه می‌دهد، و رشتهٔ اصلی بیکار است.
  useEffect(() => {
    if (open && gate.kind === 'ready') preloadCheckout();
  }, [open, gate.kind]);

  const action: DeskAction =
    gate.kind === 'waiting'
      ? 'waiting'
      : view.provisional || status === null
      ? 'checking'
      : blocked.length > 0
        ? 'blocked'
        : mode === 'off'
          ? 'soon'
          : gate.kind === 'sending'
            ? 'sending'
            : gate.kind === 'stuck'
              ? 'stuck'
              : busy
                ? 'busy'
                : 'go';

  const onContinue = async () => {
    if (gate.kind !== 'ready' || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      if (status === 'error') {
        const fresh = await fetchStatus();
        setStatus(fresh ?? 'error');
        if (!fresh || fresh.mode === 'off') {
          if (!fresh) setFailure({ ok: false, status: 0, error: 'network', body: {} });
          return;
        }
      }
      const checkout = await loadCheckout();
      const started = await checkout.checkoutStore().start(gate.items);
      if (!started.ok) {
        setFailure(started);
        return;
      }
      go(checkout.checkoutStore().getState().place ? 'address' : 'city');
    } catch {
      setFailure({ ok: false, status: 0, error: 'network', body: {} });
    } finally {
      setBusy(false);
    }
  };

  const Checkout = checkoutModule?.Checkout;
  const inCheckout = step !== 'desk' && Checkout !== undefined && gate.kind === 'ready';
  // قدمی از تاریخچه که جزوه‌اش دیگر آماده نیست (فایل تازه در همین حین): برگشت به «جزوه و قیمت».
  useEffect(() => {
    if (step !== 'desk' && !inCheckout) go('desk', { replace: true });
  }, [step, inCheckout, go]);

  if (inCheckout) {
    return (
      <Checkout
        step={step}
        go={go}
        items={gate.items}
        view={view}
        config={current}
        priceList={SEED_PRICE_LIST}
        auth={status !== null && status !== 'error' ? status.auth : null}
        onAuth={(auth) => {
          if (statusCache) statusCache = { ...statusCache, auth };
          setStatus((previous) => (previous && previous !== 'error' ? { ...previous, auth } : previous));
        }}
        onRestart={() => {
          go('desk', { replace: true });
          reset();
        }}
      />
    );
  }

  const notes = (
    <>
      {action === 'stuck' && gate.kind === 'stuck' ? (
        <Note tone="error" testId="upload-stuck">
          <p className="font-semibold">
            <Names names={gate.sections.map((s) => s.name)} /> {gate.sections.length === 1 ? 'به سرور نرسید.' : 'به سرور نرسیدند.'}
          </p>
          <p className="mt-1">
            {gate.sections.length === 1 && !retryable(gate.sections[0]!)
              ? uploadRefusalMessage(gate.sections[0]!.upload?.reason)
              : gate.sections.length === 1 && gate.sections[0]!.serverFailed
                ? serverFailureMessage(gate.sections[0]!.upload?.analysis?.failureReason, gate.sections[0]!.kind).hint
                : 'سفارش با فایلی ساخته می‌شود که روی سرور است و همان‌جا شمرده شده. چند لحظهٔ دیگر «دوباره بفرست» را بزن.'}
          </p>
          {gate.sections.some(retryable) ? (
            <div className="mt-3">
              <button
                type="button"
                className="jy-btn jy-btn--secondary"
                onClick={() => {
                  for (const section of gate.sections.filter(retryable)) {
                    const original = jozve.sections.find((s) => s.key === section.key)?.file;
                    if (original instanceof File) jozve.replace(section.key, original);
                  }
                }}
              >
                دوباره بفرست
              </button>
            </div>
          ) : null}
        </Note>
      ) : null}
      {action === 'sending' ? (
        <Note tone="info" testId="upload-sending">
          فایل اول کامل به سرور می‌رسد و آنجا شمرده می‌شود؛ بعد نشانی را می‌پرسیم.
        </Note>
      ) : null}
      {failure ? (
        <Note tone="error" testId="continue-failed">
          {failure.error === 'files_expiring' || failure.error === 'documents_not_found' ? (
            <>
              فایل‌های این جزوه دیگر روی سرور نمی‌مانند. جزوه را دوباره بینداز تا با فایل تازه سفارش بدهی.
              <div className="mt-3">
                <button type="button" className="jy-btn jy-btn--secondary" onClick={reset}>
                  دوباره بینداز
                </button>
              </div>
            </>
          ) : failure.error === 'network' ? (
            'ارتباط با سرور برقرار نشد. اینترنت را ببین و دوباره «ادامه» را بزن.'
          ) : (
            'الان نشد؛ چند لحظهٔ دیگر دوباره «ادامه» را بزن.'
          )}
        </Note>
      ) : null}
    </>
  );

  return (
    <>
      <FlowNav current={1} />

      <div className="home-desk">
        {view.sections.length === 1 ? (
          <SingleFileCard section={view.sections[0]!} onAdd={add} onReplace={replace} onReset={reset} />
        ) : (
          <JozveFiles
            view={view}
            overflow={jozve.overflow}
            onAdd={add}
            onMove={jozve.move}
            onRemove={jozve.remove}
            onReplace={replace}
            onReset={reset}
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
              waiting={view.waiting.map((s) => s.name)}
              notes={notes}
              action={action}
              onContinue={onContinue}
              onIntent={open ? preloadCheckout : () => undefined}
            />
          </aside>
          <PriceDock
            breakdown={breakdown}
            provisional={view.provisional}
            action={action}
            onContinue={onContinue}
            onIntent={open ? preloadCheckout : () => undefined}
          />
        </>
      ) : null}
    </>
  );
}
