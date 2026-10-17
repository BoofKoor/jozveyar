/**
 * مسدودی موبایل مشتری در پنل (برش ۱۲٫۲، ADR-063، سؤال ۲۱۲): مسدود کردن با دلیل از صفحهٔ سفارش یا از فهرست «شماره‌های مسدود»، رفع
 * مسدودی، و همان فهرست. اثرش در سایت است: کد پیامکی، سفارش تازه و تلاش پرداخت تازه نه؛ سفارش پرداخت‌شده همان‌طور چاپ و ارسال می‌شود.
 *
 * - **مجوز در سرور** (ADR-038): همه با `customers.block` (مالک و متصدی)، پیش از هر خواندن؛ کارت صفحهٔ سفارش بی این مجوز هیچ نمی‌بیند.
 * - **بی کد تازه** (سؤال ۳۱۸): برگشت‌پذیر است و پولی جابه‌جا نمی‌کند، مثل یادداشت و «شلوغ».
 * - **کدام شماره:** از صفحهٔ سفارش، موبایل تأییدشدهٔ صاحب سفارش در محدودهٔ همین نشست، نه چیزی که فرم می‌فرستد؛ از فهرست، شمارهٔ نوشته‌شده
 *   (نرمال، `normalizeIranMobile`)، برای شماره‌ای که سفارشی ندارد.
 * - **دلیل** یک خط، فارسی‌نرمال، ۱ تا ۵۰۰ نویسه، مثل دلیل لغو؛ فقط پنل می‌بیند.
 * - **رویداد** `customers.block` و `customers.unblock` در همان تراکنش، با موبایل پوشیده («0912 ••• 4567») و شمارهٔ سفارش، بی دلیل.
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه ساختگی تست می‌شود. محافظ‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import type { AdminEventInput, BlockStore, MobileBlockView } from '@jozveyar/db';
import { normalizeIranMobile, tidyInputFa } from '@jozveyar/text/input';

import { orderNumberOf, REASON_MAX } from '../orders';
import { maskMobile } from '../settings';
import { can, ipHashOf, scopeOf, type AdminSession } from './auth';
import { fail, ok, type Result } from './result';

export interface PanelBlocksDeps {
  store: BlockStore;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
}

/** مسدودی موبایل صاحب یک سفارش، برای کارت «ارسال به». */
export interface OrderBlock {
  mobile: string;
  live: MobileBlockView | null;
}

/** رفع‌شده‌های فهرست: تازه‌ترین رفع اول. */
export const BLOCKS_PAST_LIMIT = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function createPanelBlocks(deps: PanelBlocksDeps) {
  const now = deps.now ?? (() => new Date());
  const event = (session: AdminSession, action: string, ip: string, at: Date, mobile: string, orderNumber: number | null): AdminEventInput => ({
    adminUserId: session.userId,
    action,
    targetType: 'mobile_block',
    targetId: null,
    ipHash: ipHashOf(deps.secret, ip),
    at,
    detail: { mobile: maskMobile(mobile), ...(orderNumber === null ? {} : { orderNumber }) },
  });

  return {
    /** مسدودی موبایل صاحب این سفارش؛ null یعنی این نشست مجوزش را ندارد، یا سفارش در محدوده‌اش نیست. */
    async ofOrder(session: AdminSession, orderNumber: number): Promise<OrderBlock | null> {
      if (!can(session, 'customers.block')) return null;
      const owner = await deps.store.orderOwner(scopeOf(session), orderNumber);
      if (!owner) return null;
      return { mobile: owner.mobile, live: (await deps.store.live([owner.mobile])).get(owner.mobile) ?? null };
    },

    /** فهرست «شماره‌های مسدود»: همهٔ زنده‌ها، و آخرین رفع‌شده‌ها. */
    async list(session: AdminSession): Promise<Result<{ now: Date; live: MobileBlockView[]; past: MobileBlockView[] }>> {
      if (!can(session, 'customers.block')) return fail(403, 'forbidden');
      const { live, past } = await deps.store.list(BLOCKS_PAST_LIMIT);
      return ok({ now: now(), live, past });
    },

    /**
     * مسدود کردن: `number` از صفحهٔ سفارش، یا `mobile` از فهرست. دو کلیک همان مسدودی است (`already`)؛ شماره‌ای که کس دیگری یا با دلیل دیگری
     * مسدود کرده `mobile_already_blocked`، تا دلیل تازه بی‌صدا گم نشود.
     */
    async block(
      session: AdminSession,
      input: { number?: unknown; mobile?: unknown; reason: unknown },
      ip: string,
    ): Promise<Result<{ block: MobileBlockView; already: boolean }>> {
      if (!can(session, 'customers.block')) return fail(403, 'forbidden');
      const reason = tidyInputFa(text(input.reason));
      if (!reason) return fail(400, 'reason_required');
      if (reason.length > REASON_MAX) return fail(400, 'reason_too_long');
      let mobile: string;
      let orderNumber: number | null = null;
      if (input.number !== undefined) {
        const number = orderNumberOf(text(input.number));
        const owner = number === null ? null : await deps.store.orderOwner(scopeOf(session), number);
        if (!owner) return fail(404, 'order_not_found');
        mobile = owner.mobile;
        orderNumber = owner.orderNumber;
      } else {
        const normalized = normalizeIranMobile(text(input.mobile));
        if (!normalized) return fail(400, 'invalid_block_mobile');
        mobile = normalized;
      }
      const at = now();
      const result = await deps.store.block({ mobile, reason, orderNumber, event: event(session, 'customers.block', ip, at, mobile, orderNumber) });
      if (!result.ok) return fail(409, 'mobile_already_blocked');
      return ok({ block: result.block, already: result.already });
    },

    /** رفع همان مسدودی که ادمین دید؛ رفع‌شده از پیش (دو کلیک، یا کس دیگری همان لحظه) هم همان نتیجه است. */
    async unblock(session: AdminSession, id: unknown, ip: string): Promise<Result<{ block: MobileBlockView; already: boolean }>> {
      if (!can(session, 'customers.block')) return fail(403, 'forbidden');
      if (typeof id !== 'string' || !UUID.test(id)) return fail(404, 'block_not_found');
      const seen = await deps.store.get(id);
      if (!seen) return fail(404, 'block_not_found');
      const result = await deps.store.unblock({ id, event: event(session, 'customers.unblock', ip, now(), seen.mobile, seen.orderNumber) });
      if (!result.ok) return fail(404, 'block_not_found');
      return ok({ block: result.block, already: result.already });
    },
  };
}

export type PanelBlocks = ReturnType<typeof createPanelBlocks>;
