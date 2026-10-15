'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PriceList } from '@jozveyar/contracts';
import type { CheckoutStatus } from '@jozveyar/contracts/checkout';
import { MAX_SECTIONS_PER_ITEM, type FileRules } from '@jozveyar/contracts/constants';
import { DEFAULT_PAPER_SIZE, minOrderGapRials, pausedOf, quote, type PausedOptions } from '@jozveyar/pricing';
import { DEFAULT_BINDING_TYPE_ID, DEFAULT_PAPER_TYPE_ID } from '@jozveyar/pricing/seed';
import { effectiveConfig, type Replacement } from '../lib/catalog';
import { formatNumber, formatTomans } from '@jozveyar/text';
import type { ApiFailure } from '../lib/checkout/api';
import { orderGate, retryable } from '../lib/checkout/gate';
import { isStep, type Step } from '../lib/checkout/steps';
import type { CheckoutDraft } from '../lib/checkout/store';
import { draftOf, tabStorage, writeDraft, type DraftLayout } from '../lib/draft';
import type { Section } from '../lib/jozve';
import type { RestoredSection } from '../lib/jozveController';
import { RESTORING_ATTR } from '../lib/draftKey';
import { colorHint } from '../lib/fileCard';
import { jozveView, matchAwaited, orderSpec, type JozvePart } from '../lib/jozveView';
import {
  arrange,
  arrangement,
  configure,
  moveTo,
  moveWithin,
  place,
  reconcile,
  restoredLayout,
  startLayout,
  type Arrangement,
  type DeskLayout,
  type JozveSlot,
} from '../lib/layout';
import type { OrderConfig } from '../lib/orderConfig';
import { serverFailureMessage, uploadRefusalMessage } from '../lib/serverMessages';
import { pageTariff, pausedLists } from '../lib/tariff';
import type { JozveHandle } from '../lib/useJozve';
import { Names, Note, SingleFileCard, jozveTitleId } from './AnalysisCard';
import { ConfigPanel, type ConfigQuote } from './ConfigPanel';
import { AskLater, JozveSettings, NewJozve, OverflowNote, type MenuItem } from './DeskParts';
import { DeskFilesContext } from './DeskFiles';
import { JozveFiles } from './JozveFiles';
import { OrderSummary, PriceDock, roundUpToToman, type DeskAction } from './OrderSummary';
import { FlowNav, jozveSpecLabel, type JozveLine } from './checkout/parts';

/** انتخاب‌های پیش‌فرض، از تعرفه: سیاه‌سفید، دورو، A4، یک نسخه. */
export const INITIAL_CONFIG: OrderConfig = {
  colorMode: 'bw',
  sidesMode: 'double',
  paperSize: DEFAULT_PAPER_SIZE,
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

/**
 * مسیر خریدی که بعد از رفرش برگشت (`Restore.tsx`، تکهٔ خودش): با آمدن تکه‌اش در حالتش می‌نشیند (`loadCheckout`)،
 * یا همین حالا اگر آمده است. پیش از قدم (`primeStep`)، چون قدم خرید همان تکه را می‌آورد و قیمت سرور را با همین جا
 * می‌گیرد.
 */
export function primeCheckout(checkout: CheckoutDraft | null) {
  if (checkout && checkoutModule) checkoutModule.restoreCheckout(checkout);
  else pendingCheckout = checkout;
}

/** قدمی که جزوهٔ برگشته با آن سوار می‌شود (`Restore.tsx`)، پیش از سوار شدن رابط. */
export function primeStep(mark: HistoryMark | null) {
  restoredMark = mark;
}

/**
 * چیدمان جزوهٔ برگشته (`Restore.tsx`، ۸٫۲): شمار فایل هر جزوه به ترتیب، تنظیماتش، و پرسش چیدمان؛ `OrderDesk` با سوار شدن
 * برمی‌دارد، مثل قدم (`primeStep`).
 */
let restoredJozves: DraftLayout | null = null;

/** چیدمان جزوهٔ برگشته، پیش از سوار شدن رابط. */
export function primeLayout(layout: DraftLayout | null) {
  restoredJozves = layout;
}

/**
 * برای برگشت بعد از رفرش: تنظیم هر جزوه همان‌طور که بود، و قلم‌های جزوه‌های برگشته اگر همه روی سرور و شمرده‌اند. گزینه‌ای که
 * تعرفهٔ امروز ندارد یا به جزوه نمی‌خورد، در قلم جایش را به پیش‌فرض همان ردیف می‌دهد (`effectiveConfig`، سؤال ۲۲۴)، و میز
 * همان را با یادداشتش نشان می‌دهد؛ تنظیم خود جزوه می‌ماند. اینجاست، نه در `Restore.tsx`، تا نما و دروازه و موتور قیمت در همین
 * تکه بمانند.
 */
export function restoredOrder(
  jozves: readonly { sections: readonly RestoredSection[]; config: OrderConfig | null }[],
  rules: FileRules,
) {
  const { priceList, paused } = pageTariff();
  const live = pausedOf(priceList, paused);
  const configs = jozves.map((jozve) => jozve.config);
  let at = 0;
  const parts = jozves.map((jozve, i) => {
    const view = jozveView(
      jozve.sections.map((section) => ({ ...section, key: `r${(at += 1)}` })),
      rules,
    );
    return { view, config: effectiveConfig(configs[i] ?? INITIAL_CONFIG, priceList, view.pageCount, live).config };
  });
  const gate = orderGate(parts);
  // حداقل سفارش (برش ۸٫۴): جزوه‌ای که به آن نمی‌رسد به «جزوه و قیمت» برمی‌گردد، نه به قدم خرید.
  const order = gate.kind === 'ready' ? orderSpec(parts) : null;
  const short = order !== null && minOrderGapRials(quote(order.spec, priceList), priceList) > 0;
  return { configs, items: gate.kind === 'ready' && !short ? gate.items : null };
}

export { fetchStatus, loadCheckout, markOf, type HistoryMark };

export interface RestoreProps {
  state: 'restoring' | 'lost';
  jozve: JozveHandle;
  /** قاعده‌های فایل همین صفحه (برش ۸٫۴). */
  rules: FileRules;
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
  /** قاعده‌های فایل همین صفحه (برش ۸٫۴)، و `accept` فایل‌گزین‌ها؛ از پوسته. */
  rules: FileRules;
  accept: string;
  /**
   * تنظیم جزوهٔ اول که پوسته نگه می‌دارد، تا با «از اول» نرود؛ null یعنی پیش‌فرض‌ها. جزوه‌های دیگر تنظیمشان را در چیدمان
   * همین‌جا دارند (`lib/layout.ts`).
   */
  config: OrderConfig | null;
  onConfig: (next: OrderConfig) => void;
}

/**
 * یک جزوهٔ میز: جایش در چیدمان، نمای فایل‌هایش، و تنظیمات چاپش. `config` همان است که قیمت می‌خورد و به مسیر خرید می‌رود
 * (`effectiveConfig`، ۸٫۳)؛ `chosen` انتخاب خود جزوه، که می‌ماند؛ و `replaced` هر انتخابی که جایش را به پیش‌فرض داد.
 */
interface DeskJozve extends JozvePart {
  slot: JozveSlot;
  chosen: OrderConfig;
  replaced: Replacement[];
}

function jozvesOf(
  layout: DeskLayout,
  byKey: ReadonlyMap<string, Section>,
  priceList: PriceList,
  rules: FileRules,
  paused: PausedOptions,
): DeskJozve[] {
  return layout.jozves.map((slot) => {
    const view = jozveView(
      slot.sections.map((key) => byKey.get(key)!),
      rules,
    );
    const chosen = slot.config ?? INITIAL_CONFIG;
    const { config, replaced } = effectiveConfig(chosen, priceList, view.pageCount, paused);
    return { slot, view, chosen, config, replaced };
  });
}

/**
 * ریز قیمت سفارش با همان `quote()`، و قلم هر جزوه در آن (null تا وقتی صفحه‌ای ندارد): یک قلم برای هر جزوه، کرایه یک بار با
 * وزن همه، و جمع یکی (سؤال ۱۸۲).
 */
function priceOf(parts: readonly JozvePart[], priceList: PriceList) {
  const order = orderSpec(parts);
  if (!order) return null;
  const breakdown = quote(order.spec, priceList);
  return { breakdown, items: order.index.map((at) => (at === null ? null : breakdown.items[at]!)) };
}

/**
 * رابط پس از فایل (طرح ز، docs/UI.md ۴ب؛ میز چندجزوه، قدم ۱۱ و برش ۸٫۲): قدم‌های سفارش، پرسش چیدمان، یک کارت برای هر
 * جزوه با فایل‌ها و «تنظیمات چاپ» خودش، «جزوهٔ تازه»، خلاصهٔ سفارش و نوار قیمت موبایل. تکهٔ JS جداست و با اولین فایل بار
 * می‌شود (`OrderFlow`)؛ پس `quote()`، تعرفه و همهٔ متن‌های کارت‌ها در باندل اولیه نیستند.
 *
 * هر تکه یک خانهٔ شبکهٔ سفارش است (home.css): قدم‌ها بالای شبکه، کارت‌ها در ستون اصلی، خلاصه در ستون کنار، و سؤال‌ها
 * (از پوسته) زیر کارت‌ها. صف همهٔ فایل‌های سفارش را یک‌جا دارد (نوبت کارگر تحلیل و آپلود روی کل سفارش)؛ اینکه هر فایل در
 * کدام جزوه است در چیدمان همین تکه است. قیمت یک قلم برای هر جزوه است، صفحه‌های فایل‌هایش جمع و یک صحافی (ADR-030)، با همان
 * `quote()`.
 *
 * «ادامه» مسیر خرید را در همان صفحه باز می‌کند (ADR-034، برش ۳ج): قدم‌های آدرس و پرداخت در تکهٔ جدای
 * `checkout/Checkout`، هر کدام یک خانه در تاریخچهٔ مرورگر؛ جزوه، آپلود و کارگر تحلیل همین‌جا زنده می‌مانند.
 *
 * تعرفه همان تعرفهٔ فعال پایگاه داده است که سرور با آن قیمت قطعی می‌دهد، از JSON درون HTML صفحه (برش ۴٫۴، `lib/tariff.ts`)؛
 * یک بار در هر بار سوار شدن خوانده می‌شود.
 */
export function OrderDesk({ jozve, rules: pageRules, accept, config, onConfig }: Props) {
  const [{ priceList, slaDays, paused: pagePaused }] = useState(pageTariff);
  /**
   * گزینه‌های موقتاً خاموش (برش ۸٫۴، سؤال ۱۸۸): از JSON همین صفحه، و تازه‌تر از پاسخ ۴۰۹ `option_unavailable` سرور، که فهرست همین
   * لحظه را دارد؛ گزینه‌ای که وسط خرید خاموش شد همین‌جا جایش را به پیش‌فرض می‌دهد، با یادداشت.
   */
  const [pausedNow, setPausedNow] = useState(pagePaused);
  const paused = useMemo(() => pausedOf(priceList, pausedNow), [priceList, pausedNow]);
  /** سقف صفحه‌ای که سرور با ۴۲۲ `too_many_pages` گفت (تنظیمی که پس از بار صفحه کم شد)؛ فایل همان لحظه «پذیرفته نشد» می‌شود. */
  const [serverMaxPages, setServerMaxPages] = useState<number | null>(null);
  const rules = useMemo(
    () => (serverMaxPages === null ? pageRules : { ...pageRules, maxPages: Math.min(pageRules.maxPages, serverMaxPages) }),
    [pageRules, serverMaxPages],
  );

  /*
   * ── چیدمان جزوه‌ها (۸٫۲، `lib/layout.ts`) ──
   * همیشه با فایل‌های امروز صف همگام (`reconcile`)، هم در نمایش و هم پیش از هر کار؛ جزوهٔ برگشته بعد از رفرش با چیدمان خودش.
   */
  const keys = useMemo(() => jozve.sections.map((section) => section.key), [jozve.sections]);
  const keysRef = useRef(keys);
  useLayoutEffect(() => {
    keysRef.current = keys;
  }, [keys]);
  const [primed] = useState(() => restoredJozves);
  const [layout, setLayout] = useState<DeskLayout>(
    () => (primed && restoredLayout(keys, primed.jozves, primed.asking)) || startLayout(keys, config),
  );
  const synced = useMemo(() => reconcile(layout, keys), [layout, keys]);
  const update = useCallback((change: (layout: DeskLayout) => DeskLayout) => {
    setLayout((current) => change(reconcile(current, keysRef.current)));
  }, []);
  const byKey = useMemo(() => new Map(jozve.sections.map((section) => [section.key, section])), [jozve.sections]);
  const jozves = useMemo(() => jozvesOf(synced, byKey, priceList, rules, paused), [synced, byKey, priceList, rules, paused]);
  const deskFiles = useMemo(() => ({ rules, accept }), [rules, accept]);
  const multi = jozves.length > 1;
  const priced = useMemo(() => priceOf(jozves, priceList), [jozves, priceList]);
  const breakdown = priced?.breakdown ?? null;

  const sections = useMemo(() => jozves.flatMap((j) => j.view.sections), [jozves]);
  const provisional = jozves.some((j) => j.view.provisional);
  const pending = sections.filter((s) => s.pending && s.serverPath).map((s) => s.name);
  const blocked = sections.filter((s) => s.blocked !== null).map((s) => s.name);
  /** آنهایی که پذیرفته نشدند (قاعده‌های فایل یا نوع ناشناس، برش ۸٫۴). */
  const refused = sections.filter((s) => s.blocked?.refused).map((s) => s.name);
  /** مانده تا حداقل سفارش، ریال (برش ۸٫۴، سؤال ۱۹۰)؛ صفر یعنی رسیده یا حداقلی نیست. */
  const gapRials = breakdown ? minOrderGapRials(breakdown, priceList) : 0;
  const waiting = sections.filter((s) => s.waiting).map((s) => s.name);

  /**
   * قیمت سفارش وقتی جزوهٔ `index` انتخاب دیگری دارد (`ConfigPanel`): اثر هر گزینه روی جمع، و برگ‌های همان جزوه. انتخاب دیگر
   * هم همان قاعدهٔ «نمی‌خورد، پیش‌فرض» را دارد (`effectiveConfig`): اثر «یکرو» روی جزوه‌ای که منگنه‌اش در یکرو نمی‌خورد، قیمت
   * طلق و سیم را هم دارد.
   */
  const quoteFor = useCallback(
    (index: number) =>
      (next: OrderConfig): ConfigQuote | null => {
        const order = orderSpec(
          jozves.map((j, i) => (i === index ? { ...j, config: effectiveConfig(next, priceList, j.view.pageCount, paused).config } : j)),
        );
        if (!order) return null;
        const other = quote(order.spec, priceList);
        const at = order.index[index];
        return { totalRials: other.totalWithoutShippingRials, sheets: at == null ? 0 : other.items[at]!.sheets };
      },
    [jozves, priceList, paused],
  );

  /*
   * پرسش چیدمان (۲۱۵، ۲۱۶): حالت امروز، و قیمت حالت دیگر منهای قیمت امروز. هر دو در راه اولین قیمت جزوهٔ چندفایلی‌اند، پس
   * کارت پرسش در رسم کم‌اولویت بعدی می‌آید (`AskLater`)، و قیمت حالت دیگر فقط وقتی دوباره حساب می‌شود که صفحه‌های شمرده یا
   * تنظیمات عوض شوند (`askKey`)، نه با هر صفحه‌ای که بررسی رنگش تمام شد.
   */
  const asked = synced.asking ? arrangement(synced) : null;
  const askKey =
    asked && breakdown ? JSON.stringify([asked, jozves.map((j) => [j.chosen, j.view.included.map((s) => [s.key, s.pageCount])])]) : null;
  const askDelta = () => {
    if (!asked || !breakdown) return null;
    const other = priceOf(
      jozvesOf(arrange(synced, asked === 'together' ? 'apart' : 'together'), byKey, priceList, rules, paused),
      priceList,
    );
    return other ? other.breakdown.totalWithoutShippingRials - breakdown.totalWithoutShippingRials : null;
  };

  /*
   * ── تنظیمات باز (۲۱۷) ──
   * چند جزوه: در هر لحظه یکی باز؛ پیش‌فرض جزوهٔ اول، جزوهٔ تازه همان که تازه ساخته شد، و «بستن» همه را می‌بندد.
   */
  const [open, setOpen] = useState<{ key: string | null } | null>(null);
  const openKey = !multi
    ? null
    : open?.key === null
      ? null
      : open && jozves.some((j) => j.slot.key === open.key)
        ? open.key
        : // جزوه‌ای که انتخابی از آن جایش را به پیش‌فرض داد، تنظیماتش باز (سؤال ۲۲۴)؛ وگرنه جزوهٔ اول.
          (jozves.find((j) => j.replaced.length > 0) ?? jozves[0]!).slot.key;
  /** کلید جزوه‌ای که کار بعدی چیدمان می‌سازد. */
  const freshKey = `j${synced.next}`;
  /** فایلی که با منوی ردیف به جزوهٔ دیگر رفت: فوکوس به سر همان جزوه، نه گم شدن با ردیفی که از جایش رفت. */
  const focusAfter = useRef<string | null>(null);
  useEffect(() => {
    const key = focusAfter.current;
    if (!key) return;
    focusAfter.current = null;
    const index = jozves.findIndex((j) => j.slot.sections.includes(key));
    if (index >= 0) document.getElementById(jozveTitleId(index))?.focus();
  }, [jozves]);

  /*
   * ── حالت مسیر خرید، وقتی قیمت نهایی شد ──
   * تا بررسی تمام نشده «ادامه» به هر حال «در حال بررسی…» است، پس حالت زودتر لازم نیست؛ و زودترش در راه اولین
   * قیمت و قیمت کامل جزوه بود: خود `fetch` روی رشتهٔ اصلی وقت می‌گیرد (۴× کند، حدود ۵ میلی‌ثانیه) و پاسخش رابط
   * را یک بار دیگر می‌کشید. قیمتی که کارگر می‌رساند به‌روزرسانی هم‌گام است و React اثرهایش را پیش از رسم اجرا
   * می‌کند؛ پس درخواست بعد از رسم همان قیمت می‌رود.
   */
  const [status, setStatus] = useState<CheckoutStatus | 'error' | null>(statusCache);
  const settled = breakdown !== null && !provisional;
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
    restoredJozves = null;
    history.replaceState({ ...history.state, jy: { step: restored?.step ?? 'desk', desk: mount } satisfies HistoryMark }, '');
    const onPop = (event: PopStateEvent) => {
      const mark = markOf(event.state);
      moved.current = true;
      if (mark?.desk === mount) {
        setStep(mark.step);
        return;
      }
      // خانه‌ای از بار قبل یا جزوهٔ قبلی: «جزوه و قیمت»، و همین خانه مال این جزوه می‌شود تا رفرش قدم آن را نیاورد (۳د).
      history.replaceState({ ...event.state, jy: { step: 'desk', desk: mount } satisfies HistoryMark }, '');
      setStep('desk');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [mount, restored]);

  /*
   * ── پیش‌نویس همین زبانه (۳د، ADR-036؛ چیدمان از ۸٫۲) ──
   * وقتی صفحه پنهان می‌شود یا می‌رود (رفرش، رفتن به برنامهٔ پیامک، درگاه) و با هر قدم؛ هرگز در راه اولین قیمت.
   */
  const latest = useRef({ sections: jozve.sections, layout: synced });
  useEffect(() => {
    latest.current = { sections: jozve.sections, layout: synced };
  });
  const saveDraft = useCallback(() => {
    writeDraft(tabStorage(), draftOf(latest.current.sections, latest.current.layout, checkoutDraft()));
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
  /** «از اول» و «فایل دیگری بینداز»: جزوه‌ها و پیش‌نویسشان با هم می‌روند. */
  const reset = () => {
    writeDraft(tabStorage(), null);
    jozve.reset();
  };

  /* ── کارهای کاربر روی فایل‌ها و جزوه‌ها ── */

  /**
   * فایل‌های تازه: هر فایلی که بخشی از جزوهٔ برگشته منتظرش است سر جای خودش (`matchAwaited`؛ آپلودش از همان تکه ادامه
   * می‌دهد)، و بقیه ته همان جزوه، یا یک جزوهٔ تازه با تنظیمات خودش (۲۱۹).
   */
  const addTo = (target: string | 'new') => (files: File[]) => {
    const { resumed, rest } = matchAwaited(jozve.sections, files);
    for (const { key, file } of resumed) jozve.replace(key, file, true);
    if (rest.length === 0) return;
    if (target === 'new') setOpen({ key: freshKey });
    const fresh = jozve.add(rest);
    update((current) => place(current, fresh, target));
  };
  /** همان فایلی که بخشی منتظرش است سر جای خودش و آپلودش از همان تکه؛ فایل دیگر جایگزینی است. */
  const replace = (key: string, file: File) =>
    jozve.replace(key, file, matchAwaited(jozve.sections, [file]).resumed[0]?.key === key);
  /** یک فایل‌گزین برای «جایگزین کن» و «همان فایل را انتخاب کن» همهٔ کارت‌ها، تا شناسه‌اش در صفحه یکتا بماند. */
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const pick = useCallback((key: string) => {
    replaceTarget.current = key;
    replaceInput.current?.click();
  }, []);
  const arrangeAs = useCallback(
    (to: Arrangement) => {
      setOpen(null);
      update((current) => arrange(current, to));
    },
    [update],
  );
  const configureAt = (index: number, next: OrderConfig) => {
    update((current) => configure(current, jozves[index]!.slot.key, next));
    // جزوهٔ اول: پوسته هم نگهش می‌دارد، تا با «از اول» نرود.
    if (index === 0) onConfig(next);
  };

  /**
   * کارهای منوی ردیف (۲۱۸)، وقتی منو باز می‌شود: درون همان جزوه، به جزوه‌های دیگر با نام فایل اولشان، و جزوهٔ تازه. از چیدمان
   * همین حالا (`latest`)، نه از رسمی که ردیف با آن کشیده شد: ردیف فقط وقتی دوباره رسم می‌شود که فایل خودش عوض شود
   * (`JozveFiles`). ردیف کارت جزوه همیشه دست‌کم یک کار دارد: چند فایل در جزوه یعنی بالا یا پایین، و چند جزوه یعنی جزوهٔ دیگر.
   */
  const menuOf = useCallback(
    (key: string): MenuItem[] => {
      const { layout, sections } = latest.current;
      const index = layout.jozves.findIndex((j) => j.sections.includes(key));
      const own = layout.jozves[index];
      if (!own) return [];
      const row = own.sections.indexOf(key);
      const items: MenuItem[] = [];
      if (row > 0) items.push({ label: 'یکی بالاتر', onSelect: () => update((current) => moveWithin(current, key, -1)) });
      if (row < own.sections.length - 1) {
        items.push({ label: 'یکی پایین‌تر', onSelect: () => update((current) => moveWithin(current, key, 1)) });
      }
      const within = items.length;
      layout.jozves.forEach((other, i) => {
        if (i === index) return;
        items.push({
          label: (
            <>
              به جزوهٔ <span className="num">{formatNumber(i + 1)}</span>
            </>
          ),
          detail: sections.find((section) => section.key === other.sections[0])?.file.name,
          divided: within > 0 && items.length === within,
          onSelect: () => {
            focusAfter.current = key;
            update((current) => moveTo(current, key, other.key));
          },
        });
      });
      if (own.sections.length > 1) {
        items.push({
          label: 'جزوهٔ تازه با همین فایل',
          divided: within > 0 && items.length === within,
          onSelect: () => {
            setOpen({ key: `j${layout.next}` });
            focusAfter.current = key;
            update((current) => moveTo(current, key, 'new'));
          },
        });
      }
      return items;
    },
    [update],
  );

  // کاری که در راه بود (قیمت سرور پس از «ادامه») بعد از «از اول» می‌رسد: رابطی که رفت، نه قدم می‌رود و نه پیش‌نویس جزوهٔ رفته را
  // دوباره می‌نویسد.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const go = useCallback(
    (next: Step, { replace = false }: { replace?: boolean } = {}) => {
      if (!alive.current) return;
      const state = { ...history.state, jy: { step: next, desk: mount } satisfies HistoryMark };
      if (replace) history.replaceState(state, '');
      else history.pushState(state, '');
      moved.current = true;
      setStep(next);
      saveDraft();
    },
    [mount, saveDraft],
  );

  // هر قدم از بالای صفحه؛ برگشت به «جزوه و قیمت» فوکوس را به سر اولین کارت جزوه می‌آورد.
  useEffect(() => {
    if (!moved.current) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (step === 'desk') document.getElementById('jozve-title')?.focus({ preventScroll: true });
  }, [step]);

  /* ── «ادامه» ── */
  const gate = useMemo(() => orderGate(jozves), [jozves]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const mode = status === null || status === 'error' ? null : status.mode;
  const isOpen = mode === 'mock' || mode === 'live' || status === 'error';

  // ثبت سفارش باز است و فایل‌ها رسیده‌اند: کاربر احتمالاً ادامه می‌دهد، و رشتهٔ اصلی بیکار است.
  useEffect(() => {
    if (isOpen && gate.kind === 'ready') preloadCheckout();
  }, [isOpen, gate.kind]);

  const action: DeskAction =
    gate.kind === 'waiting'
      ? 'waiting'
      : provisional || status === null
      ? 'checking'
      : blocked.length > 0
        ? 'blocked'
        : mode === 'off'
          ? 'soon'
          : mode === 'paused'
            ? 'paused'
            : gapRials > 0
            ? 'short'
            : gate.kind === 'sending'
            ? 'sending'
            : gate.kind === 'stuck'
              ? 'stuck'
              : busy
                ? 'busy'
                : 'go';

  /** «ادامه» با عدد یا شمار (برش ۸٫۴): مانده تا حداقل سفارش، و فایل‌هایی که پذیرفته نشدند. */
  const gap = formatTomans(roundUpToToman(gapRials), false);
  const blockedLabel =
    refused.length === blocked.length ? `اول تکلیف ${refused.length > 1 ? 'فایل‌های پذیرفته‌نشده' : 'فایل پذیرفته‌نشده'} را روشن کن` : null;
  const detail =
    action === 'short'
      ? { label: `تا حداقل سفارش ${gap} تومان مانده`, name: `ادامه — تا حداقل سفارش ${gap} تومان مانده` }
      : action === 'blocked' && blockedLabel
        ? { label: blockedLabel, name: `ادامه — ${blockedLabel}` }
        : undefined;

  /**
   * شکستی که جوابش در «جزوه و قیمت» است (برش ۸٫۴): گزینه‌ای که همین حالا خاموش شد (۴۰۹ `option_unavailable`، با فهرست همین لحظه)
   * جایش را به پیش‌فرض می‌دهد، و فایلی که از سقف صفحهٔ امروز بیشتر است (۴۲۲ `too_many_pages`) «پذیرفته نشد» می‌شود؛ یادداشتش زیر
   * خلاصه.
   */
  const deskFailure = useCallback((failed: ApiFailure) => {
    if (failed.error === 'option_unavailable') setPausedNow(pausedLists(failed.body.paused));
    if (failed.error === 'too_many_pages' && Number.isInteger(failed.body.maxPages)) setServerMaxPages(Number(failed.body.maxPages));
    setFailure(failed);
  }, []);

  const onContinue = async () => {
    if (gate.kind !== 'ready' || busy || gapRials > 0) return;
    setBusy(true);
    setFailure(null);
    try {
      if (status === 'error') {
        const fresh = await fetchStatus();
        setStatus(fresh ?? 'error');
        if (!fresh || fresh.mode === 'off' || fresh.mode === 'paused') {
          if (!fresh) setFailure({ ok: false, status: 0, error: 'network', body: {} });
          return;
        }
      }
      const checkout = await loadCheckout();
      const started = await checkout.checkoutStore().start(gate.items);
      if (!started.ok) {
        // مالک همین حالا «متوقف» کرد (برش ۷٫۵، سؤال ۱۶۵): «ادامه» همان دکمهٔ «ثبت سفارش موقتاً متوقف است» می‌شود.
        if (started.error === 'checkout_paused') {
          if (statusCache) statusCache = { ...statusCache, mode: 'paused' };
          setStatus((previous) => (previous && previous !== 'error' ? { ...previous, mode: 'paused' } : { mode: 'paused', auth: null }));
          return;
        }
        deskFailure(started);
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
        jozves={jozves}
        priceList={priceList}
        slaDays={slaDays}
        auth={status !== null && status !== 'error' ? status.auth : null}
        onAuth={(auth) => {
          if (statusCache) statusCache = { ...statusCache, auth };
          setStatus((previous) => (previous && previous !== 'error' ? { ...previous, auth } : previous));
        }}
        onRestart={() => {
          go('desk', { replace: true });
          reset();
        }}
        onDeskFailure={(failed) => {
          deskFailure(failed);
          go('desk');
        }}
        // درگاه نمونه فقط در `mock` (ADR-035)؛ هر چه نامعلوم، نام زیبال.
        gateway={mode === 'mock' ? 'mock' : 'zibal'}
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
              ? uploadRefusalMessage(gate.sections[0]!.upload?.reason, gate.sections[0]!.kind)
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
          ) : failure.error === 'option_unavailable' ? (
            'گزینه‌ای از چاپ این سفارش همین حالا موقتاً در دسترس نیست؛ جایش گزینهٔ پیش‌فرض آمد. قیمت تازه را ببین و دوباره «ادامه» را بزن.'
          ) : failure.error === 'too_many_pages' ? (
            'فایلی از سقف صفحهٔ هر فایل بیشتر است؛ تکلیفش را روشن کن و دوباره «ادامه» را بزن.'
          ) : failure.error === 'quote_warnings' ? (
            'گزینه‌ای از چاپ این سفارش دیگر به جزوه نمی‌خورد. تنظیمات چاپ را ببین و دوباره «ادامه» را بزن.'
          ) : (
            'الان نشد؛ چند لحظهٔ دیگر دوباره «ادامه» را بزن.'
          )}
        </Note>
      ) : null}
    </>
  );

  const room = MAX_SECTIONS_PER_ITEM - jozve.sections.length;
  /** «سیاه‌سفید، دورو، A4، طلق و سیم» یک جزوه. */
  const specOf = ({ colorMode, sidesMode, paperSize, bindingTypeId, paperTypeId }: OrderConfig) =>
    jozveSpecLabel(
      colorMode,
      sidesMode,
      paperSize,
      priceList.bindingTypes[bindingTypeId]?.nameFa ?? '',
      paperTypeId === DEFAULT_PAPER_TYPE_ID ? null : (priceList.paperTypes[paperTypeId]?.nameFa ?? null),
    );
  /** خلاصهٔ سفارش چندجزوه (۲۲۵): فقط جزوه‌هایی که قیمت دارند، هر کدام با شمارهٔ خودش. */
  const lines: JozveLine[] | null = multi
    ? jozves.flatMap((j, i) => {
        const item = priced?.items[i];
        return item ? [{ n: i + 1, spec: specOf(j.config), pageCount: item.pageCount, copies: item.copies, totalRials: item.totalRials }] : [];
      })
    : null;

  return (
    <DeskFilesContext.Provider value={deskFiles}>
      <FlowNav current={1} />

      <div className="home-desk">
        {asked ? (
          <AskLater files={sections.length} arrangement={asked} onArrange={arrangeAs} deltaKey={askKey} deltaOf={askDelta} />
        ) : null}
        {jozves.map((j, index) => {
          const item = priced?.items[index] ?? null;
          const settings = item ? (
            <JozveSettings
              multi={multi}
              open={openKey === j.slot.key}
              onToggle={() => setOpen({ key: openKey === j.slot.key ? null : j.slot.key })}
              line={
                multi ? (
                  <>
                    {specOf(j.config)} · <span className="num">{formatNumber(j.config.copies)}</span> نسخه
                  </>
                ) : null
              }
              id={`jozve-set-${index + 1}`}
            >
              <ConfigPanel
                config={j.chosen}
                effective={j.config}
                replaced={j.replaced}
                pageCount={j.view.pageCount}
                onChange={(next) => configureAt(index, next)}
                priceList={priceList}
                quoteFor={quoteFor(index)}
                paused={paused}
                // صفحه‌های رنگی جای خودشان را دارند، کنار انتخاب رنگ؛ حکم «تماماً» فقط بعد از بررسی همه.
                colorHint={colorHint({
                  colorPages: j.view.summary.colorPageCount,
                  unknown: j.view.summary.colorUnknown,
                  pending: j.view.provisional || j.view.blocked.length > 0,
                  estimated: j.view.summary.estimated,
                  jozve: j.view.sections.length > 1,
                })}
              />
            </JozveSettings>
          ) : null;
          return !multi && j.view.sections.length === 1 ? (
            <SingleFileCard
              key={j.slot.key}
              section={j.view.sections[0]!}
              onAdd={addTo(j.slot.key)}
              room={room}
              onPick={pick}
              onReset={reset}
              settings={settings}
            />
          ) : (
            <JozveFiles
              key={j.slot.key}
              index={index}
              multi={multi}
              view={j.view}
              priceRials={item?.totalRials ?? null}
              menuOf={menuOf}
              room={room}
              onAdd={addTo(j.slot.key)}
              onRemove={jozve.remove}
              onPick={pick}
              settings={settings}
            />
          );
        })}
        <OverflowNote names={jozve.overflow}>
          <Names names={jozve.overflow} />
        </OverflowNote>
        <NewJozve room={room} onFiles={addTo('new')} onReset={reset} />
        <input
          ref={replaceInput}
          id="jozve-replace"
          type="file"
          accept={accept}
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            const target = replaceTarget.current;
            replaceTarget.current = null;
            if (!file) return;
            // بی دکمهٔ ردیف (فایل‌گزینی که خود مرورگر دوباره باز کرد): همان فایلی که بخشی منتظرش است، وگرنه تنها فایل سفارش.
            const key =
              target ?? matchAwaited(jozve.sections, [file]).resumed[0]?.key ?? (jozve.sections.length === 1 ? jozve.sections[0]!.key : null);
            if (key) replace(key, file);
          }}
        />
      </div>

      {breakdown ? (
        <>
          <aside className="home-side" aria-labelledby="summary-title">
            <OrderSummary
              breakdown={breakdown}
              config={jozves[0]!.config}
              priceList={priceList}
              provisional={provisional}
              pending={pending}
              blocked={blocked}
              refused={refused}
              waiting={waiting}
              jozves={lines}
              notes={notes}
              action={action}
              detail={detail}
              onContinue={onContinue}
              onIntent={isOpen ? preloadCheckout : () => undefined}
            />
          </aside>
          <PriceDock
            breakdown={breakdown}
            provisional={provisional}
            jozves={multi ? jozves.length : null}
            gapRials={gapRials}
            action={action}
            detail={detail}
            onContinue={onContinue}
            onIntent={isOpen ? preloadCheckout : () => undefined}
          />
        </>
      ) : null}
    </DeskFilesContext.Provider>
  );
}
