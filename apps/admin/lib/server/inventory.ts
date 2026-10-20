/**
 * موجودی کاغذ در پنل (برش ۱۰٫۴، ADR-070؛ سؤال ۲۰۴، پاسخ «همهٔ چاپخانه‌ها»، و اجرا ۴۰۴ تا ۴۲۰): نمای کلی، صفحهٔ هر چاپخانه و هر قلم، شروع
 * پیگیری کاغذ تازه، ورود و ضایعات و شمارش، آستانه، و هشدار پیشخوان.
 *
 * - **مجوز در سرور، پیش از هر خواندن** (سؤال ۴۱۵): دیدن با `inventory.read`، نوشتن با `inventory.manage`؛ مالک و متصدی همهٔ چاپخانه‌ها، کاربر
 *   چاپخانه فقط خودش، حسابدار هیچ. نشستی که ندارد ۴۰۳ می‌گیرد و ذخیره‌گاه صدا زده نمی‌شود.
 * - **محدوده** (ADR-042): چاپخانه و قلم دیگر برای کاربر چاپخانه همان «نیست» (۴۰۴)، در صفحه و در هر فرم؛ ذخیره‌گاه هم شرط را در کوئری دارد.
 * - **بی کد تازه** (سؤال ۴۱۵): کاغذ است، نه پول؛ هر فرم یک ردیف (`request`)، و همان فرم با چیز دیگر «فرم کهنه».
 * - **رویداد** `inventory.track`، `.purchase`، `.waste`، `.count` و `.threshold` در همان تراکنش (چیپ «موجودی کاغذ»)، بی یادداشت و دلیل.
 *
 * بی نکست؛ ذخیره‌گاه از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. قفل و محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import type {
  AdminEventInput,
  InventoryStore,
  StockAlert,
  StockItemView,
  StockPaperChoice,
  StockPartnerView,
} from '@jozveyar/db';

import { readMoveForm, readThresholdForm, readTrackForm } from '../inventory';
import { can, ipHashOf, scopeOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelInventoryDeps {
  store: InventoryStore;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

/** ردیف‌های هر صفحهٔ قلم (سؤال ۴۱۶). */
export const MOVES_PER_PAGE = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null);

/** فرم «کاغذ تازه»، همان نام فیلدهای HTML. */
export interface TrackFormInput {
  paper: unknown;
  counted: unknown;
  threshold: unknown;
  request: unknown;
}

/** فرم «ثبت» یک قلم. */
export interface MoveFormInput {
  kind: unknown;
  sheets: unknown;
  note: unknown;
  request: unknown;
}

export interface PartnerStockView {
  view: StockPartnerView;
  /** کاغذهای تعرفهٔ فعال که این چاپخانه هنوز پیگیری نمی‌کند، با اندازه‌هایشان. */
  papers: StockPaperChoice[];
  canManage: boolean;
}

export interface ItemStockView {
  now: Date;
  view: StockItemView;
  page: number;
  pages: number;
  canManage: boolean;
}

export function createPanelInventory(deps: PanelInventoryDeps) {
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const event = (session: AdminSession, action: string, partnerId: string, ip: string, at: Date): AdminEventInput => ({
    adminUserId: session.userId,
    action,
    targetType: 'partner',
    targetId: partnerId,
    ipHash: ipHashOf(deps.secret, ip),
    at,
  });

  /** چاپخانه‌ای که این نشست می‌بیند: شناسهٔ درست، و برای کاربر چاپخانه فقط خودش. */
  function visible(session: AdminSession, idParam: unknown): string | null {
    const id = idOf(idParam);
    if (!id || (session.partner !== null && session.partner.id !== id)) return null;
    return id;
  }

  /** قلم همین چاپخانه در محدودهٔ این نشست، با صفحه‌ای از ردیف‌هایش؛ قلم چاپخانهٔ دیگر همان «نیست». */
  async function itemIn(session: AdminSession, partnerParam: unknown, itemParam: unknown, page: number): Promise<StockItemView | null> {
    const partnerId = visible(session, partnerParam);
    const itemId = idOf(itemParam);
    if (!partnerId || !itemId) return null;
    const view = await store.item(scopeOf(session), itemId, { limit: MOVES_PER_PAGE, offset: (page - 1) * MOVES_PER_PAGE });
    return view && view.item.partnerId === partnerId ? view : null;
  }

  return {
    /** نمای کلی: چاپخانه‌ها با قلم‌هایشان؛ کاربر چاپخانه فقط خودش (صفحه به صفحهٔ چاپخانه‌اش می‌رود). */
    async overview(session: AdminSession): Promise<Result<{ now: Date; rows: StockPartnerView[]; canManage: boolean }>> {
      if (!can(session, 'inventory.read')) return fail(403, 'forbidden');
      return ok({ now: now(), rows: await store.overview(scopeOf(session)), canManage: can(session, 'inventory.manage') });
    },

    /** صفحهٔ یک چاپخانه: قلم‌ها، و برای فرم «کاغذ تازه» کاغذهای تعرفهٔ فعال که هنوز پیگیری نمی‌شوند. */
    async partner(session: AdminSession, idParam: string): Promise<Result<PartnerStockView>> {
      if (!can(session, 'inventory.read')) return fail(403, 'forbidden');
      const partnerId = visible(session, idParam);
      if (!partnerId) return fail(404, 'stock_partner_not_found');
      const [view, offered] = await Promise.all([store.partner(scopeOf(session), partnerId), store.papers()]);
      if (!view) return fail(404, 'stock_partner_not_found');
      const tracked = new Set(view.items.map((item) => `${item.paperTypeId}:${item.paperSize}`));
      const papers = offered
        .map((paper) => ({ ...paper, sizes: paper.sizes.filter((size) => !tracked.has(`${paper.id}:${size}`)) }))
        .filter((paper) => paper.sizes.length > 0);
      return ok({ view, papers, canManage: can(session, 'inventory.manage') });
    },

    /** صفحهٔ یک قلم با ردیف‌هایش، تازه‌ترین اول، ۵۰ در هر صفحه؛ صفحهٔ بیرون از بازه آخرین صفحه. */
    async item(session: AdminSession, partnerParam: string, itemParam: string, pageParam: unknown): Promise<Result<ItemStockView>> {
      if (!can(session, 'inventory.read')) return fail(403, 'forbidden');
      const asked = typeof pageParam === 'string' && /^\d{1,5}$/.test(pageParam) ? Math.max(1, Number(pageParam)) : 1;
      let view = await itemIn(session, partnerParam, itemParam, asked);
      if (!view) return fail(404, 'stock_item_not_found');
      const pages = Math.max(1, Math.ceil(view.total / MOVES_PER_PAGE));
      let page = asked;
      if (asked > pages) {
        page = pages;
        view = (await itemIn(session, partnerParam, itemParam, page))!;
      }
      return ok({ now: now(), view, page, pages, canManage: can(session, 'inventory.manage') });
    },

    /** «کاغذ تازه»: قلم با شمارش اول و آستانهٔ اختیاری؛ دو کلیک همان قلم. */
    async track(session: AdminSession, idParam: string, form: TrackFormInput, ip: string): Promise<Result<{ partnerId: string; itemId: string; duplicate: boolean }>> {
      if (!can(session, 'inventory.manage')) return fail(403, 'forbidden');
      const partnerId = visible(session, idParam);
      if (!partnerId) return fail(404, 'stock_partner_not_found');
      const requestId = idOf(form.request);
      if (!requestId) return fail(409, 'stock_form_used');
      const read = readTrackForm(form);
      if (!read.ok) return fail(400, read.error, { field: read.field });
      const at = now();
      const written = await store.track(scopeOf(session), {
        partnerId,
        ...read.value,
        requestId,
        at,
        event: event(session, 'inventory.track', partnerId, ip, at),
      });
      if (written.ok) return ok({ partnerId, itemId: written.item.id, duplicate: written.duplicate });
      if (written.reason === 'exists') return fail(409, 'stock_item_exists', { field: 'paper', itemId: written.itemId });
      if (written.reason === 'paper_not_found') return fail(400, 'stock_paper_not_found', { field: 'paper' });
      if (written.reason === 'conflict') return fail(409, 'stock_form_used');
      return fail(404, 'stock_partner_not_found');
    },

    /** «ثبت»: ورود، ضایعات یا شمارش؛ دو کلیک همان ردیف. */
    async record(
      session: AdminSession,
      partnerParam: string,
      itemParam: string,
      form: MoveFormInput,
      ip: string,
    ): Promise<Result<{ partnerId: string; itemId: string; moveId: number; duplicate: boolean }>> {
      if (!can(session, 'inventory.manage')) return fail(403, 'forbidden');
      const partnerId = visible(session, partnerParam);
      const itemId = idOf(itemParam);
      if (!partnerId || !itemId) return fail(404, 'stock_item_not_found');
      const requestId = idOf(form.request);
      if (!requestId) return fail(409, 'stock_form_used');
      const read = readMoveForm(form);
      if (!read.ok) return fail(400, read.error, { field: read.field });
      const owned = await itemIn(session, partnerId, itemId, 1);
      if (!owned) return fail(404, 'stock_item_not_found');
      const at = now();
      const written = await store.record(scopeOf(session), {
        itemId,
        ...read.value,
        requestId,
        at,
        event: event(session, `inventory.${read.value.kind}`, partnerId, ip, at),
      });
      if (written.ok) return ok({ partnerId, itemId, moveId: written.move.id, duplicate: written.duplicate });
      return written.reason === 'conflict' ? fail(409, 'stock_form_used') : fail(404, 'stock_item_not_found');
    },

    /** آستانه؛ همان آستانه بی رویداد. */
    async threshold(
      session: AdminSession,
      partnerParam: string,
      itemParam: string,
      form: { threshold: unknown },
      ip: string,
    ): Promise<Result<{ partnerId: string; itemId: string; changed: boolean }>> {
      if (!can(session, 'inventory.manage')) return fail(403, 'forbidden');
      const partnerId = visible(session, partnerParam);
      const itemId = idOf(itemParam);
      if (!partnerId || !itemId) return fail(404, 'stock_item_not_found');
      const read = readThresholdForm(form);
      if (!read.ok) return fail(400, read.error, { field: read.field });
      const owned = await itemIn(session, partnerId, itemId, 1);
      if (!owned) return fail(404, 'stock_item_not_found');
      const at = now();
      const written = await store.setThreshold(scopeOf(session), {
        itemId,
        thresholdSheets: read.value,
        at,
        event: event(session, 'inventory.threshold', partnerId, ip, at),
      });
      return written.ok ? ok({ partnerId, itemId, changed: written.changed }) : fail(404, 'stock_item_not_found');
    },

    /** قلم‌هایی که هشدار پیشخوان می‌خواهند، در محدوده؛ null برای کسی که موجودی را نمی‌بیند. */
    async alerts(session: AdminSession): Promise<StockAlert[] | null> {
      if (!can(session, 'inventory.read')) return null;
      return store.alerts(scopeOf(session));
    },
  };
}

export type PanelInventory = ReturnType<typeof createPanelInventory>;
