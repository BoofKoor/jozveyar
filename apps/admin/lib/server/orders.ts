/**
 * سفارش‌ها در پنل (برش ۴٫۲ و ۴٫۳؛ ADR-039): پیشخوان، فهرست با جست‌وجو و چیپ وضعیت، جزئیات، دانلود PDF جزوه و «دوباره
 * بساز» آن، و از ۴٫۳ وضعیت سفارش («شروع چاپ»، «تحویل پست شد»، لغو، برگرداندن یک قدم) و ویرایش گیرنده. از ۵٫۱ (ADR-043 و
 * ۰۴۴): فایل چاپ هر جلد و برگهٔ سفارش با دانلود و «دوباره بساز» هر کدام، «شروع چاپ» فقط با فایل چاپ همهٔ جزوه‌ها، و سفارشی
 * که فایل‌هایش پاک شد نه دانلود دارد، نه برمی‌گردد. از ۵٫۲ (ADR-042): چاپخانهٔ سفارش و جابه‌جایی‌اش با دلیل (`orders.assign`)،
 * فقط در «در صف چاپ» و از چاپخانه‌ای که ادمین دید؛ و «شروع چاپ» فقط با چاپخانه، آن هم از همان که ادمین دید.
 *
 * - **مجوز در سرور** (ADR-038)، نه فقط پنهان کردن دکمه: دیدن با `orders.read`، و دانلود و «دوباره بساز» با
 *   `files.download` (کسی که فایل را می‌گیرد، ساختن دوباره‌اش را هم می‌تواند بخواهد). وضعیت با `orders.status`، لغو از ۵٫۳
 *   با `orders.cancel`، برگرداندن با `orders.revert` (فقط مالک)، گیرنده با `orders.address`، و مبلغ و پرداخت‌ها از ۵٫۳ با
 *   `orders.money`: بی آن، جزئیات بی مبلغ از سرویس بیرون می‌آید (`withoutMoney`)، نه فقط پنهان در صفحه.
 * - **محدوده** (برش ۵٫۳، ADR-042): هر فراخوانی ذخیره‌گاه محدودهٔ همین نشست را دارد (`scopeOf`)؛ کاربر چاپخانه فقط سفارش‌هایی
 *   را که امروز به چاپخانهٔ خودش سپرده شده‌اند می‌بیند و می‌نویسد. بیرون از محدوده ۴۰۴ است (`order_not_found`)، نه ۴۰۳:
 *   همان پاسخ شماره‌ای که نیست، پس وجودش لو نمی‌رود. کاری که نقش ندارد پیش از هر خواندنی ۴۰۳ است، برای هر سفارشی. از چشم
 *   چاپخانه یادداشت‌های درونی (دلیل لغو و برگرداندن و جابه‌جایی) و چاپخانه‌های دیگر نیستند (`partnerView`).
 * - **هر کار از وضعیتی که ادمین دید** (`from` فرم): اگر سفارش همین حالا جای دیگری رفته، کار انجام نمی‌شود و صفحه
 *   وضعیت تازه را نشان می‌دهد؛ دو کلیک هم‌زمان یک بار، و دو برگرداندن هم‌زمان یک قدم، نه دو قدم.
 * - **روز تهران:** مرزهای پیشخوان (آغاز فردا و پس‌فردا) از `tehranDayStart`؛ پایگاه داده فقط مقایسه می‌کند.
 * - **همان قاعده‌های سایت:** سفارش در انتظاری که فایلش پاک شده یا تا حاشیهٔ پرداخت (یک ساعت) پاک می‌شود
 *   «رهاشده» است، و تلاش پرداختی که از مهلتش (نیم ساعت) گذشته و هنوز در انتظار است «بی برگشت» (ADR-034).
 * - **رویداد:** دانلود و «دوباره بساز» هر کدام یک ردیف `admin_events` (کننده، هدف سفارش، هش IP؛ ADR-038).
 *   دیدن سفارش، و پیش‌نمایش برگه که همان داده‌های صفحهٔ سفارش است، رویداد ندارد.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید (`PanelOrderStore`، `StorageDriver`)، پس با ساعت و ذخیره‌گاه ساختگی تست
 * می‌شود. کوئری‌ها و تراکنش «دوباره بساز» روی پستگرس در تست یکپارچگی `packages/db`.
 */

import {
  FILE_MARGIN_MS,
  PAYMENT_ATTEMPT_TTL_MS,
  PREPARE_ORDER_JOB,
  PREPARE_TICKET_JOB,
  isPaidStatus,
  readSetting,
  type AdminEventInput,
  type AdminPermission,
  type OrderStatus,
  type PanelAlerts,
  type PanelBucket,
  type PanelClock,
  type PanelDashboardStats,
  type PanelOrderDetails,
  type PanelOrderLine,
  type PanelOrderStore,
  type PanelPartnerOption,
  type PanelSearch,
} from '@jozveyar/db';
import type { StorageDriver } from '@jozveyar/storage';
import { checkRecipient, tidyInputFa, type RecipientField } from '@jozveyar/text/input';

import {
  REASON_MAX,
  RECIPIENT_EDITABLE,
  bucketOf,
  bucketsOf,
  dayBounds,
  dueTiles,
  isOpen,
  isStatusAction,
  linesWithoutMoney,
  orderNumberOf,
  pageOf,
  parseSearch,
  partnerView,
  pdfFileName,
  printReady,
  printView,
  rebuildable,
  ticketFileName,
  ticketView,
  transitionOf,
  volumeFileName,
  withoutMoney,
  type DayBounds,
  type DueTile,
  type StatusAction,
} from '../orders';
import { can, ipHashOf, scopeOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

/** ردیف‌های هر صفحهٔ فهرست. */
export const ORDERS_PAGE = 50;
/** صف تحویل پیشخوان: چند سفارش اول، به ترتیب مهلت. */
export const QUEUE_SIZE = 5;
/** «هفتهٔ گذشته» سطر آمار پیشخوان: هفت روز تا همین حالا. */
export const STATS_WINDOW_MS = 7 * 86_400_000;

export interface PanelOrdersDeps {
  store: PanelOrderStore;
  /** null یعنی استوریج پیکربندی نشده: دانلود بسته، بقیه باز. */
  storage: StorageDriver | null;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

export interface DashboardView {
  bounds: DayBounds;
  tiles: DueTile[];
  alerts: PanelAlerts;
  /** سفارش‌های باز (پرداخت‌شده و هنوز نه به پست) و چند تای اولشان به ترتیب مهلت. */
  open: number;
  queue: PanelOrderLine[];
  /** روز کاری تعهد تحویل به پست، از `settings`. */
  slaDays: number;
  /** سطر آمار: در حال چاپ‌ها، و تحویل‌های پست هفتهٔ گذشته. */
  stats: PanelDashboardStats;
}

export interface OrdersListView {
  bounds: DayBounds;
  /** چیپ‌های این نشست، به ترتیب طرح: کاربر چاپخانه «در انتظار» و «رهاشده» ندارد (۵٫۳). */
  buckets: readonly PanelBucket[];
  bucket: PanelBucket;
  /** متن کادر جست‌وجو، همان که تایپ شد. */
  q: string;
  search: PanelSearch | null;
  counts: Record<PanelBucket, number>;
  page: number;
  pages: number;
  rows: PanelOrderLine[];
}

export interface OrderDetailsView {
  bounds: DayBounds;
  details: PanelOrderDetails;
  canDownload: boolean;
  /** «شروع چاپ» و «تحویل پست شد». */
  canStatus: boolean;
  /** لغو (از ۵٫۳ مجوز خودش، `orders.cancel`). */
  canCancel: boolean;
  /** برگرداندن یک قدم (فقط مالک)، و وضعیتی که سفارش به آن برمی‌گردد؛ null اگر از وضعیت امروز ممکن نیست. */
  canRevert: boolean;
  revertTo: OrderStatus | null;
  /**
   * «تحویل پست شد»ی که کد رهگیری زنده دارد برنمی‌گردد (برش ۶٫۱، ADR-046): اول ورود فایل پستش برمی‌گردد. ورود همان کد، برای
   * پیوند راه جلو؛ null یعنی مانعی نیست.
   */
  revertBlockedBy: { importId: string; filename: string } | null;
  /** ویرایش گیرنده: مجوزش، و فقط تا پیش از پست. */
  canEditRecipient: boolean;
  /** جابه‌جایی چاپخانه (۵٫۲): مجوزش، فقط «در صف چاپ»، و فقط وقتی چاپخانهٔ فعال دیگری هست. */
  canAssign: boolean;
  /** چاپخانه‌های فعالی که سفارش به آن‌ها می‌رود (جز چاپخانهٔ امروزش)؛ فقط با `canAssign`. */
  partnerOptions: PanelPartnerOption[];
  /** مبلغ و پرداخت‌ها (۵٫۳، `orders.money`)؛ بی آن، `details` بی مبلغ است. */
  canMoney: boolean;
  /** از چشم چاپخانه (۵٫۳): بی کارت چاپخانه و بی یادداشت‌های درونی؛ لغوشده «چاپ نمی‌شود» می‌گوید. */
  partnerView: boolean;
}

/** فرم لغو یا برگرداندن: کار، وضعیتی که ادمین دید، و دلیل. «شروع چاپ» چاپخانه‌ای را هم دارد که ادمین دید (۵٫۲). */
export interface StatusForm {
  action: unknown;
  from: unknown;
  reason?: unknown;
  partner?: unknown;
}

/** فرم جابه‌جایی چاپخانه (۵٫۲): چاپخانه‌ای که ادمین دید (خالی یعنی بی چاپخانه)، چاپخانهٔ تازه، و دلیل. */
export interface AssignForm {
  from: unknown;
  to: unknown;
  reason: unknown;
}

/** فرم ویرایش گیرنده. موبایل، استان و شهر اینجا نیستند: عوض نمی‌شوند (ADR-034). */
export interface RecipientForm {
  name: unknown;
  addressText: unknown;
  postalCode: unknown;
}

const STATUSES: readonly OrderStatus[] = ['awaiting_payment', 'paid', 'expired', 'printing', 'handed_to_post', 'cancelled'];
/** مجوز هر کار وضعیت: رو به جلو `orders.status`، لغو از ۵٫۳ `orders.cancel` (چاپخانه نه)، برگرداندن `orders.revert` (مالک). */
const ACTION_PERMISSION: Record<StatusAction, AdminPermission> = {
  start_print: 'orders.status',
  handed_to_post: 'orders.status',
  cancel: 'orders.cancel',
  revert: 'orders.revert',
};
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** شناسهٔ چاپخانه از فرم؛ خالی یا بدشکل null. */
const partnerIdOf = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);

export function createPanelOrders(deps: PanelOrdersDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message, error) => console.error(message, error ?? ''));
  const { store } = deps;

  const clockOf = (at: Date): PanelClock => ({
    at,
    staleBefore: new Date(at.getTime() + FILE_MARGIN_MS),
    unreturnedBefore: new Date(at.getTime() - PAYMENT_ATTEMPT_TTL_MS),
  });

  return {
    async dashboard(session: AdminSession): Promise<Result<DashboardView>> {
      if (!can(session, 'orders.read')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const at = now();
      const bounds = dayBounds(at);
      const clock = clockOf(at);
      const [summary, alerts, queue, slaDays, stats] = await Promise.all([
        store.dueSummary(scope, { at, tomorrowStart: bounds.tomorrowStart, dayAfterStart: bounds.dayAfterStart }),
        store.alerts(scope, clock),
        store.list(scope, { bucket: 'open', search: null, clock, limit: QUEUE_SIZE, offset: 0 }),
        readSetting((key) => store.setting(key), 'order.sla_days', log),
        store.stats(scope, { since: new Date(at.getTime() - STATS_WINDOW_MS), at }),
      ]);
      return ok({
        bounds,
        tiles: dueTiles(summary, bounds),
        alerts,
        open: summary.overdue + summary.today + summary.tomorrow + summary.later,
        queue: can(session, 'orders.money') ? queue : linesWithoutMoney(queue),
        slaDays,
        stats,
      });
    },

    /** فهرست: چیپ (`status`)، جست‌وجو (`q`) و صفحه (`page`)، همه از نشانی و همه سنجیده. */
    async list(session: AdminSession, params: { status?: string; q?: string; page?: string }): Promise<Result<OrdersListView>> {
      if (!can(session, 'orders.read')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const at = now();
      const clock = clockOf(at);
      const q = (params.q ?? '').slice(0, 100);
      const search = parseSearch(q);
      const buckets = bucketsOf(scope);
      const bucket = bucketOf(params.status, search !== null, buckets);
      const counts = await store.counts(scope, { search, clock });
      const pages = Math.max(1, Math.ceil(counts[bucket] / ORDERS_PAGE));
      const page = Math.min(pageOf(params.page), pages);
      const rows = await store.list(scope, { bucket, search, clock, limit: ORDERS_PAGE, offset: (page - 1) * ORDERS_PAGE });
      return ok({
        bounds: dayBounds(at),
        buckets,
        bucket,
        q: search ? q.trim() : '',
        search,
        counts,
        page,
        pages,
        rows: can(session, 'orders.money') ? rows : linesWithoutMoney(rows),
      });
    },

    async details(session: AdminSession, numberParam: string): Promise<Result<OrderDetailsView>> {
      if (!can(session, 'orders.read')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const orderNumber = orderNumberOf(numberParam);
      const found = orderNumber === null ? null : await store.details(scope, orderNumber);
      if (!found) return fail(404, 'order_not_found');
      const canMoney = can(session, 'orders.money');
      // بی مبلغ و از چشم چاپخانه همین‌جا، پیش از صفحه: آنچه صفحه نمی‌گیرد، هیچ‌جا نشان داده نمی‌شود.
      const unpriced = canMoney ? found : withoutMoney(found);
      const details = scope.kind === 'partner' ? partnerView(unpriced, scope.partnerId) : unpriced;
      const { status } = details.order;
      // سفارشی که فایل‌هایش پاک شد به صف چاپ برنمی‌گردد (ADR-044)؛ و «تحویل پست شد»ی که کد رهگیری زنده دارد، تا ورودش برنگشته.
      const revertTo = details.order.filesDeletedAt ? null : transitionOf('revert', status, details.statusEvents);
      const live = status === 'handed_to_post' ? details.shipments.find((shipment) => shipment.voidedAt === null) : undefined;
      const partnerOptions =
        can(session, 'orders.assign') && status === 'paid'
          ? (await store.partnerOptions(scope)).filter((partner) => partner.id !== details.order.printPartnerId)
          : [];
      return ok({
        bounds: dayBounds(now()),
        details,
        canDownload: can(session, 'files.download'),
        canStatus: can(session, 'orders.status'),
        canCancel: can(session, 'orders.cancel'),
        canRevert: can(session, 'orders.revert') && revertTo !== null && !live,
        revertTo,
        revertBlockedBy: can(session, 'orders.revert') && live && revertTo !== null ? { importId: live.importId, filename: live.filename } : null,
        canEditRecipient: can(session, 'orders.address') && (RECIPIENT_EDITABLE as readonly OrderStatus[]).includes(status),
        canAssign: partnerOptions.length > 0,
        partnerOptions,
        canMoney,
        partnerView: scope.kind === 'partner',
      });
    },

    /**
     * «شروع چاپ»، «تحویل پست شد»، لغو (با دلیل) یا برگرداندن یک قدم (مالک، با دلیل)، از وضعیتی که ادمین دید. «شروع
     * چاپ» فقط وقتی فایل چاپ همهٔ جزوه‌ها ساخته شده (طرح: «اول فایل چاپ ساخته شود»). سفارشی که همین حالا به همان جا رفته،
     * دوباره نمی‌رود: موفق، بی ردیف دوم (دو کلیک). وضعیت و رویداد ادمین در یک تراکنش؛ دلیل فقط در پنل.
     */
    async changeStatus(session: AdminSession, numberParam: string, form: StatusForm, ip: string): Promise<Result<{ status: OrderStatus }>> {
      const action: StatusAction | null = isStatusAction(form.action) ? form.action : null;
      if (!action) return fail(400, 'invalid_transition');
      if (!can(session, ACTION_PERMISSION[action])) return fail(403, 'forbidden');
      const from = STATUSES.find((status) => status === form.from);
      if (!from) return fail(400, 'invalid_transition');
      const scope = scopeOf(session);
      const orderNumber = orderNumberOf(numberParam);
      const details = orderNumber === null ? null : await store.details(scope, orderNumber);
      if (!details) return fail(404, 'order_not_found');
      const to = transitionOf(action, from, details.statusEvents);
      if (!to) return fail(400, 'invalid_transition');
      const current = details.order.status;
      if (current !== from) return current === to ? ok({ status: current }) : fail(409, 'status_changed', { current });

      let reason: string | null = null;
      if (action === 'cancel' || action === 'revert') {
        reason = tidyInputFa(text(form.reason));
        if (!reason) return fail(400, 'reason_required');
        if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');
      }
      if (details.order.filesDeletedAt) return fail(409, 'files_deleted');
      // کد رهگیری یعنی «تحویل پست شد» (ADR-046): تا ورودش برنگشته، سفارش برنمی‌گردد. پایگاه داده هم در COMMIT (`hasShipment`).
      if (action === 'revert' && details.shipments.some((shipment) => shipment.voidedAt === null)) return fail(409, 'order_has_shipment');
      // «شروع چاپ» فقط با چاپخانه (۵٫۲)، و از همان که ادمین دید: جابه‌جایی هم‌زمان و «شروع چاپ» فقط یکی می‌شوند.
      const partner = action === 'start_print' ? partnerIdOf(form.partner) : undefined;
      if (action === 'start_print' && !details.order.printPartnerId) return fail(409, 'print_needs_partner');
      if (action === 'start_print' && partner !== details.order.printPartnerId) return fail(409, 'order_partner_changed');
      if (action === 'start_print' && !printReady(details)) return fail(409, 'print_needs_pdf');

      const at = now();
      const written = await store.changeStatus(scope, {
        orderId: details.order.id,
        from,
        to,
        ...(partner !== undefined ? { partnerId: partner } : {}),
        at,
        adminUserId: session.userId,
        note: reason ? { reason } : null,
        event: {
          adminUserId: session.userId,
          action: 'orders.status',
          targetType: 'order',
          targetId: details.order.id,
          ipHash: ipHashOf(deps.secret, ip),
          detail: { orderNumber: details.order.orderNumber, from, to },
          at,
        },
      });
      if (written.ok) return ok({ status: to });
      // هم‌زمان: سفارش همین حالا به چاپخانهٔ دیگری رفت (دیگر در محدوده نیست)، کارگر فایل‌ها را پاک کرد، کلیک دیگری همین کار را
      // کرد، یا سفارش را جای دیگری برد.
      if (written.current === null) return fail(404, 'order_not_found');
      if (written.filesDeleted) return fail(409, 'files_deleted');
      if (written.partnerChanged) return fail(409, 'order_partner_changed');
      if (written.hasShipment) return fail(409, 'order_has_shipment');
      return written.current === to ? ok({ status: to }) : fail(409, 'status_changed', { current: written.current });
    },

    /**
     * جابه‌جایی چاپخانه (۵٫۲، ADR-042؛ طرح `m-order-assign`): مالک و متصدی (`orders.assign`)، فقط در «در صف چاپ»، به چاپخانهٔ
     * فعال، با دلیل ۱ تا ۵۰۰ نویسه، بی کد تازه (برگشت‌پذیر است). از چاپخانه‌ای که ادمین دید؛ سفارشی که همین حالا جای دیگری رفت
     * یا چاپش شروع شد، جابه‌جا نمی‌شود. سفارش، ردیف تخصیص، کار برگه و رویداد در یک تراکنش. کرایهٔ مشتری عوض نمی‌شود.
     */
    async assign(session: AdminSession, numberParam: string, form: AssignForm, ip: string): Promise<Result<{ to: string }>> {
      if (!can(session, 'orders.assign')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const orderNumber = orderNumberOf(numberParam);
      const details = orderNumber === null ? null : await store.details(scope, orderNumber);
      if (!details) return fail(404, 'order_not_found');
      const from = partnerIdOf(form.from);
      const to = partnerIdOf(form.to);
      if (from !== details.order.printPartnerId) return fail(409, 'order_partner_changed');
      if (details.order.status !== 'paid') return fail(409, 'assign_closed', { current: details.order.status });
      if (!to || to === from) return fail(400, 'partner_required');
      const reason = tidyInputFa(text(form.reason));
      if (!reason) return fail(400, 'reason_required');
      if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');

      const at = now();
      const written = await store.assignPartner(scope, {
        orderId: details.order.id,
        from,
        to,
        at,
        adminUserId: session.userId,
        reason,
        event: {
          adminUserId: session.userId,
          action: 'orders.assign',
          targetType: 'order',
          targetId: details.order.id,
          ipHash: ipHashOf(deps.secret, ip),
          detail: { orderNumber: details.order.orderNumber },
          at,
        },
      });
      if (written.ok) return ok({ to });
      if (written.reason === 'partner_inactive') return fail(409, 'partner_inactive');
      if (written.current === null) return fail(404, 'order_not_found');
      // دو کلیک هم‌زمان به یک مقصد: دومی همان را می‌بیند که خواست.
      if (written.current === 'paid' && written.partnerId === to) return ok({ to });
      return written.current === 'paid' ? fail(409, 'order_partner_changed') : fail(409, 'assign_closed', { current: written.current });
    },

    /**
     * نام، نشانی و کد پستی گیرنده، با همان قاعدهٔ مسیر خرید (`checkRecipient`)؛ فقط تا پیش از پست. موبایل، استان و
     * شهر نه: کرایه با استان منجمد است و موبایل همان تأییدشدهٔ پرداخت (ADR-034). رویداد با فیلدهای عوض‌شده.
     */
    async editRecipient(
      session: AdminSession,
      numberParam: string,
      form: RecipientForm,
      ip: string,
    ): Promise<Result<{ changed: string[] }>> {
      if (!can(session, 'orders.address')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const orderNumber = orderNumberOf(numberParam);
      const details = orderNumber === null ? null : await store.details(scope, orderNumber);
      if (!details) return fail(404, 'order_not_found');
      const checked = checkRecipient({
        name: text(form.name),
        addressText: text(form.addressText),
        postalCode: text(form.postalCode) || null,
      });
      if (checked.fields.length > 0) return fail(400, 'invalid_recipient', { fields: checked.fields satisfies RecipientField[] });
      const at = now();
      const written = await store.editRecipient(scope, {
        orderId: details.order.id,
        editable: RECIPIENT_EDITABLE,
        recipient: { recipientName: checked.value.name, addressText: checked.value.addressText, postalCode: checked.value.postalCode },
        event: {
          adminUserId: session.userId,
          action: 'orders.recipient',
          targetType: 'order',
          targetId: details.order.id,
          ipHash: ipHashOf(deps.secret, ip),
          detail: { orderNumber: details.order.orderNumber },
          at,
        },
      });
      if (!written.ok) return written.current === null ? fail(404, 'order_not_found') : fail(409, 'recipient_locked', { current: written.current });
      return ok({ changed: written.changed ?? [] });
    },

    /**
     * «دوباره بساز» فایل چاپ یا برگه، فقط وقتی همان که صفحه «ساخته نشد» می‌گوید (`printView`، `ticketView`) و کارش در صف
     * یا زیر دست کارگر نیست. فایل چاپ فایل‌های مشتری را فقط برای جزوه‌ای می‌خواهد که PDFش ساخته نشده؛ وگرنه کارگر باز با
     * `file_missing` می‌افتاد. کار با رویداد در یک تراکنش در صف می‌رود؛ دو کلیک هم‌زمان یک بار.
     */
    async rebuild(session: AdminSession, numberParam: string, kind: 'print' | 'ticket', ip: string): Promise<Result<true>> {
      if (!can(session, 'files.download')) return fail(403, 'forbidden');
      const scope = scopeOf(session);
      const orderNumber = orderNumberOf(numberParam);
      const details = orderNumber === null ? null : await store.details(scope, orderNumber);
      // فقط سفارش باز: لغوشده یا رسیده به پست دیگر جزوه‌ای برای چاپ ندارد.
      if (!details || !isOpen(details.order.status)) return fail(404, 'order_not_found');
      const at = now();
      const event = (action: string): AdminEventInput => ({
        adminUserId: session.userId,
        action,
        targetType: 'order',
        targetId: details.order.id,
        ipHash: ipHashOf(deps.secret, ip),
        detail: { orderNumber: details.order.orderNumber },
        at,
      });
      if (kind === 'ticket') {
        if (ticketView(details).kind !== 'failed') return fail(409, 'ticket_not_failed');
        const done = await store.requeue(scope, details.order.id, PREPARE_TICKET_JOB, event('orders.ticket_rebuild'));
        if (done === 'not_found') return fail(404, 'order_not_found');
        return done === 'ok' ? ok(true) : fail(409, 'ticket_not_failed');
      }
      if (!details.items.some((item) => printView(details, item, at).kind === 'failed')) return fail(409, 'pdf_not_failed');
      if (!rebuildable(details.items, at)) return fail(410, 'files_gone');
      const done = await store.requeue(scope, details.order.id, PREPARE_ORDER_JOB, event('orders.pdf_rebuild'));
      if (done === 'not_found') return fail(404, 'order_not_found');
      return done === 'ok' ? ok(true) : fail(409, 'pdf_not_failed');
    },

    /**
     * PDF اصلی یک جزوه، جریانی از استوریج داخلی (ADR-037): مسیر `/jozveyar/` Nginx همان «فقط PUT» می‌ماند. رویداد
     * دانلود پیش از جریان نوشته می‌شود: درخواست فایل همان کار است، حتی اگر مرورگر نیمه‌راه ببُرد.
     */
    async download(session: AdminSession, numberParam: string, itemParam: string, ip: string): Promise<Result<DownloadFile>> {
      if (!can(session, 'files.download')) return fail(403, 'forbidden');
      const orderNumber = orderNumberOf(numberParam);
      const itemSeq = smallOf(itemParam);
      const file = orderNumber === null || itemSeq === null ? null : await store.jozveFile(scopeOf(session), orderNumber, itemSeq);
      if (!file) return fail(404, 'order_not_found');
      if (file.filesDeletedAt) return fail(410, 'files_deleted');
      // PDF ساخته‌شده در هر وضعیت پس از پرداخت دانلودشدنی است، حتی لغوشده (سابقه).
      if (!isPaidStatus(file.status) || !file.key || !file.readyAt) return fail(409, 'pdf_not_ready');
      return streamed(session, file, file.key, pdfFileName(file.orderNumber, file.itemSeq), ip, {
        action: 'orders.pdf_download',
        detail: { orderNumber: file.orderNumber, item: file.itemSeq },
        what: `PDF جزوهٔ سفارش ${file.orderNumber} (قلم ${file.itemSeq})`,
      });
    },

    /** فایل چاپ یک جلد (برش ۵٫۱)، مثل PDF جزوه: جریانی، با رویداد. */
    async downloadVolume(
      session: AdminSession,
      numberParam: string,
      itemParam: string,
      volumeParam: string,
      ip: string,
    ): Promise<Result<DownloadFile>> {
      if (!can(session, 'files.download')) return fail(403, 'forbidden');
      const orderNumber = orderNumberOf(numberParam);
      const itemSeq = smallOf(itemParam);
      const volume = smallOf(volumeParam);
      if (orderNumber === null || itemSeq === null || volume === null) return fail(404, 'order_not_found');
      const file = await store.printVolume(scopeOf(session), orderNumber, itemSeq, volume);
      if (!file) return fail(404, 'order_not_found');
      if (file.filesDeletedAt) return fail(410, 'files_deleted');
      if (!isPaidStatus(file.status) || !file.key) return fail(409, 'pdf_not_ready');
      return streamed(session, file, file.key, volumeFileName(file.orderNumber, file.itemSeq, volume, file.volumes), ip, {
        action: 'orders.print_download',
        detail: { orderNumber: file.orderNumber, item: file.itemSeq, volume, volumes: file.volumes },
        what: `فایل چاپ سفارش ${file.orderNumber} (قلم ${file.itemSeq}، جلد ${volume})`,
      });
    },

    /**
     * برگهٔ سفارش (برش ۵٫۱): PDF با رویداد، یا پیش‌نمایش PNG بی رویداد (همان داده‌های صفحهٔ سفارش). فقط برگه‌ای که با
     * دادهٔ امروز سفارش ساخته شده؛ برگهٔ کهنه نه، حتی اگر فایلش هست.
     */
    async downloadTicket(
      session: AdminSession,
      numberParam: string,
      what: 'pdf' | 'preview',
      ip: string,
    ): Promise<Result<DownloadFile>> {
      if (!can(session, 'files.download')) return fail(403, 'forbidden');
      const orderNumber = orderNumberOf(numberParam);
      const file = orderNumber === null ? null : await store.ticketFile(scopeOf(session), orderNumber);
      if (!file) return fail(404, 'order_not_found');
      if (file.filesDeletedAt) return fail(410, 'files_deleted');
      if (!isPaidStatus(file.status) || !file.key || !file.previewKey || !file.fresh) return fail(409, 'ticket_not_ready');
      if (what === 'preview') return streamed(session, file, file.previewKey, `${ticketFileName(file.orderNumber)}.png`, ip, null);
      return streamed(session, file, file.key, `${ticketFileName(file.orderNumber)}.pdf`, ip, {
        action: 'orders.ticket_download',
        detail: { orderNumber: file.orderNumber },
        what: `برگهٔ سفارش ${file.orderNumber}`,
      });
    },
  };

  /**
   * یک فایل سفارش از استوریج، جریانی. رویداد (اگر هست) پیش از جریان؛ بی رویداد، بی فایل، و اتصال بازِ استوریج بسته می‌شود
   * نه اینکه تا جمع‌آوری زباله بماند.
   */
  async function streamed(
    session: AdminSession,
    owner: { orderId: string; orderNumber: number },
    key: string,
    fileName: string,
    ip: string,
    event: { action: string; detail: Record<string, unknown>; what: string } | null,
  ): Promise<Result<DownloadFile>> {
    if (!deps.storage) return fail(503, 'storage_unavailable');
    const what = event?.what ?? `فایل سفارش ${owner.orderNumber}`;
    let object: Awaited<ReturnType<StorageDriver['getObject']>>;
    try {
      object = await deps.storage.getObject(key);
    } catch (error) {
      log(`✗ ${what} از استوریج خوانده نشد:`, error);
      return fail(503, 'storage_unavailable');
    }
    if (!object) {
      log(`✗ ${what} ساخته شده ولی در استوریج نیست.`);
      return fail(503, 'storage_unavailable');
    }
    if (event) {
      try {
        await store.logEvent({
          adminUserId: session.userId,
          action: event.action,
          targetType: 'order',
          targetId: owner.orderId,
          ipHash: ipHashOf(deps.secret, ip),
          detail: event.detail,
          at: now(),
        });
      } catch (error) {
        await object.body.cancel().catch(() => undefined);
        throw error;
      }
    }
    return ok({ body: object.body, sizeBytes: object.sizeBytes, fileName });
  }
}

/** یک فایل برای پاسخ دانلود. */
export interface DownloadFile {
  body: ReadableStream<Uint8Array>;
  sizeBytes: number;
  fileName: string;
}

/** شمارهٔ قلم یا جلد در نشانی: ۱ تا ۹۹۹. */
const smallOf = (value: string) => (/^[1-9]\d{0,2}$/.test(value) ? Number(value) : null);

export type PanelOrders = ReturnType<typeof createPanelOrders>;
