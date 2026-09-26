/**
 * سفارش‌ها در پنل (برش ۴٫۲؛ ADR-039): پیشخوان، فهرست با جست‌وجو و چیپ وضعیت، جزئیات، دانلود PDF جزوه و «دوباره
 * بساز» آن. وضعیت فقط دیدنی است؛ «شروع چاپ»، «تحویل پست شد»، لغو و ویرایش نشانی با ۴٫۳.
 *
 * - **مجوز در سرور** (ADR-038)، نه فقط پنهان کردن دکمه: دیدن با `orders.read`، و دانلود و «دوباره بساز» با
 *   `files.download` (کسی که فایل را می‌گیرد، ساختن دوباره‌اش را هم می‌تواند بخواهد).
 * - **روز تهران:** مرزهای پیشخوان (آغاز فردا و پس‌فردا) از `tehranDayStart`؛ پایگاه داده فقط مقایسه می‌کند.
 * - **همان قاعده‌های سایت:** سفارش در انتظاری که فایلش پاک شده یا تا حاشیهٔ پرداخت (یک ساعت) پاک می‌شود
 *   «رهاشده» است، و تلاش پرداختی که از مهلتش (نیم ساعت) گذشته و هنوز در انتظار است «بی برگشت» (ADR-034).
 * - **رویداد:** دانلود و «دوباره بساز» هر کدام یک ردیف `admin_events` (کننده، هدف سفارش، هش IP؛ ADR-038).
 *   دیدن سفارش رویداد ندارد.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید (`PanelOrderStore`، `StorageDriver`)، پس با ساعت و ذخیره‌گاه ساختگی تست
 * می‌شود. کوئری‌ها و تراکنش «دوباره بساز» روی پستگرس در تست یکپارچگی `packages/db`.
 */

import {
  FILE_MARGIN_MS,
  PAYMENT_ATTEMPT_TTL_MS,
  readSetting,
  type PanelAlerts,
  type PanelBucket,
  type PanelClock,
  type PanelOrderDetails,
  type PanelOrderLine,
  type PanelOrderStore,
  type PanelSearch,
} from '@jozveyar/db';
import type { StorageDriver } from '@jozveyar/storage';

import {
  bucketOf,
  dayBounds,
  dueTiles,
  filesUntil,
  orderNumberOf,
  pageOf,
  parseSearch,
  pdfFileName,
  type DayBounds,
  type DueTile,
} from '../orders';
import { can, ipHashOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

/** ردیف‌های هر صفحهٔ فهرست. */
export const ORDERS_PAGE = 50;
/** صف تحویل پیشخوان: چند سفارش اول، به ترتیب مهلت. */
export const QUEUE_SIZE = 5;

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
}

export interface OrdersListView {
  bounds: DayBounds;
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
}

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
      const at = now();
      const bounds = dayBounds(at);
      const clock = clockOf(at);
      const [summary, alerts, queue, slaDays] = await Promise.all([
        store.dueSummary({ at, tomorrowStart: bounds.tomorrowStart, dayAfterStart: bounds.dayAfterStart }),
        store.alerts(clock),
        store.list({ bucket: 'open', search: null, clock, limit: QUEUE_SIZE, offset: 0 }),
        readSetting((key) => store.setting(key), 'order.sla_days', log),
      ]);
      return ok({
        bounds,
        tiles: dueTiles(summary, bounds),
        alerts,
        open: summary.overdue + summary.today + summary.tomorrow + summary.later,
        queue,
        slaDays,
      });
    },

    /** فهرست: چیپ (`status`)، جست‌وجو (`q`) و صفحه (`page`)، همه از نشانی و همه سنجیده. */
    async list(session: AdminSession, params: { status?: string; q?: string; page?: string }): Promise<Result<OrdersListView>> {
      if (!can(session, 'orders.read')) return fail(403, 'forbidden');
      const at = now();
      const clock = clockOf(at);
      const q = (params.q ?? '').slice(0, 100);
      const search = parseSearch(q);
      const bucket = bucketOf(params.status, search !== null);
      const counts = await store.counts({ search, clock });
      const pages = Math.max(1, Math.ceil(counts[bucket] / ORDERS_PAGE));
      const page = Math.min(pageOf(params.page), pages);
      const rows = await store.list({ bucket, search, clock, limit: ORDERS_PAGE, offset: (page - 1) * ORDERS_PAGE });
      return ok({ bounds: dayBounds(at), bucket, q: search ? q.trim() : '', search, counts, page, pages, rows });
    },

    async details(session: AdminSession, numberParam: string): Promise<Result<OrderDetailsView>> {
      if (!can(session, 'orders.read')) return fail(403, 'forbidden');
      const orderNumber = orderNumberOf(numberParam);
      const details = orderNumber === null ? null : await store.details(orderNumber);
      if (!details) return fail(404, 'order_not_found');
      return ok({ bounds: dayBounds(now()), details, canDownload: can(session, 'files.download') });
    },

    /**
     * «دوباره بساز»: فقط وقتی `prepare_order` شکست خورده و فایل‌های مشتری هنوز روی سرورند؛ وگرنه کارگر باز با
     * `file_missing` می‌افتاد. کار با رویداد در یک تراکنش در صف می‌رود.
     */
    async rebuild(session: AdminSession, numberParam: string, ip: string): Promise<Result<true>> {
      if (!can(session, 'files.download')) return fail(403, 'forbidden');
      const orderNumber = orderNumberOf(numberParam);
      const details = orderNumber === null ? null : await store.details(orderNumber);
      if (!details || details.order.status !== 'paid') return fail(404, 'order_not_found');
      if (details.pdfJob?.status !== 'failed') return fail(409, 'pdf_not_failed');
      const at = now();
      if (!filesUntil(details.items, at)) return fail(410, 'files_gone');
      const done = await store.rebuildPdf(details.order.id, {
        adminUserId: session.userId,
        action: 'orders.pdf_rebuild',
        targetType: 'order',
        targetId: details.order.id,
        ipHash: ipHashOf(deps.secret, ip),
        detail: { orderNumber: details.order.orderNumber },
        at,
      });
      return done === 'ok' ? ok(true) : fail(409, 'pdf_not_failed');
    },

    /**
     * PDF یک جزوه، جریانی از استوریج داخلی (ADR-037): مسیر `/jozveyar/` Nginx همان «فقط PUT» می‌ماند. رویداد
     * دانلود پیش از جریان نوشته می‌شود: درخواست فایل همان کار است، حتی اگر مرورگر نیمه‌راه ببُرد.
     */
    async download(
      session: AdminSession,
      numberParam: string,
      itemParam: string,
      ip: string,
    ): Promise<Result<{ body: ReadableStream<Uint8Array>; sizeBytes: number; fileName: string }>> {
      if (!can(session, 'files.download')) return fail(403, 'forbidden');
      const orderNumber = orderNumberOf(numberParam);
      const itemSeq = /^[1-9]\d{0,2}$/.test(itemParam) ? Number(itemParam) : null;
      const file = orderNumber === null || itemSeq === null ? null : await store.printFile(orderNumber, itemSeq);
      if (!file) return fail(404, 'order_not_found');
      if (file.status !== 'paid' || !file.key || !file.readyAt) return fail(409, 'pdf_not_ready');
      if (!deps.storage) return fail(503, 'storage_unavailable');
      let object: Awaited<ReturnType<StorageDriver['getObject']>>;
      try {
        object = await deps.storage.getObject(file.key);
      } catch (error) {
        log(`✗ PDF جزوهٔ سفارش ${file.orderNumber} از استوریج خوانده نشد:`, error);
        return fail(503, 'storage_unavailable');
      }
      if (!object) {
        log(`✗ PDF جزوهٔ سفارش ${file.orderNumber} (قلم ${file.itemSeq}) ساخته شده ولی در استوریج نیست.`);
        return fail(503, 'storage_unavailable');
      }
      try {
        await store.logEvent({
          adminUserId: session.userId,
          action: 'orders.pdf_download',
          targetType: 'order',
          targetId: file.orderId,
          ipHash: ipHashOf(deps.secret, ip),
          detail: { orderNumber: file.orderNumber, item: file.itemSeq },
          at: now(),
        });
      } catch (error) {
        // بی رویداد، بی فایل؛ و اتصال بازِ استوریج بسته می‌شود، نه اینکه تا جمع‌آوری زباله بماند.
        await object.body.cancel().catch(() => undefined);
        throw error;
      }
      return ok({ body: object.body, sizeBytes: object.sizeBytes, fileName: pdfFileName(file.orderNumber, file.itemSeq) });
    },
  };
}

export type PanelOrders = ReturnType<typeof createPanelOrders>;
