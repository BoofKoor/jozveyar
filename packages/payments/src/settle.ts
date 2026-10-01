/**
 * حکم یک تلاش پرداخت (ADR-050، سؤال‌های ۱۴۴ تا ۱۴۷): برگشت از درگاه، استعلام خودکار و «استعلام از درگاه» پنل همه همین را زیر قفل ردیف پرداخت
 * و سفارش (`settlePayment`) صدا می‌زنند؛ نوشتنش مال `@jozveyar/db` است.
 *
 * - **استعلام پیش از `verify`، و فقط `status` استعلام تصمیم می‌گیرد** (۱۴۶). `verify` فقط برای «پرداخت‌شده، تأییدنشده» (۲)، فقط پیش از مهلت
 *   تلاش و فقط برای سفارشی که هنوز پرداختنی است؛ مبلغ و شناسهٔ سفارش اگر استعلام داد همان‌جا سنجیده می‌شوند، و همیشه دوباره از پاسخ خود
 *   `verify`، که رسمی است.
 * - **پاسخی که نیامد «ناموفق» نیست** (۱۴۷): شبکه، سقف زمان، ۵xx، پاسخ بدشکل، یا ردی که وضعیت پرداخت نیست (کد پذیرنده، `trackId` ناشناس،
 *   IP) تلاش را در انتظار نگه می‌دارد تا استعلام بعدی. فقط تلاشی که مهلتش گذشته یا سفارشش دیگر پرداختنی نیست بی جواب بسته می‌شود، آن هم
 *   فقط اگر هرگز `verify` نخورده: زیبال بی `verify` ما «تأییدشده» نمی‌گوید.
 * - **«تأییدشده» همیشه ثبت می‌شود** (۱): پول نهایی است، حتی پس از مهلت. اگر سفارش دیگر پرداختنی نیست (پرداخت دوم تأییدشده)، تلاش «ناموفق»
 *   می‌ماند با وضعیت ۱، و پیشخوان می‌گوید پول باید برگردد.
 */

import type { GatewayAttempt, GatewayInquiry, PaymentGateway } from './index';
import { paymentErrorTag } from './index';
import { STATUS_PAID, STATUS_VERIFIED, statusVerdict, type PaymentFailureCode } from './status';

/** تلاشی که حکمش خواسته می‌شود: همان که درگاه می‌شناسد، به‌علاوهٔ زمان ساختن و آخرین وضعیتی که درگاه گفت. */
export interface AttemptSnapshot extends GatewayAttempt {
  createdAt: Date;
  /** `payments.gateway_status`: ۲ یا ۱ یعنی شاید `verify` خورده باشد. */
  gatewayStatus: number | null;
}

/** آنچه این بار از درگاه دانستیم (`payments.gateway_*`): وضعیت (یا همان قبلی، اگر جوابی نیامد)، علت بی جوابی، و زمان. */
export interface GatewayCheck {
  status: number | null;
  error: string | null;
  at: Date;
}

export interface FailedVerdict {
  kind: 'failed';
  code: PaymentFailureCode;
  cardMask: string | null;
  /** مبلغی که `verify` نهایی کرد، فقط وقتی پول نهایی شد و با تلاش نخواند. */
  verifiedAmountRials: number | null;
  raw: unknown;
  check: GatewayCheck;
}

export type Verdict =
  | { kind: 'succeeded'; refId: string; cardMask: string | null; verifiedAmountRials: number; raw: unknown; check: GatewayCheck }
  | FailedVerdict
  | { kind: 'pending'; check: GatewayCheck };

export interface JudgeInput {
  gateway: PaymentGateway;
  attempt: AttemptSnapshot;
  /** سفارش هنوز «در انتظار پرداخت» است؛ وگرنه `verify` هرگز (پرداخت دوم). */
  payable: boolean;
  /** مهلت هر تلاش (`PAYMENT_ATTEMPT_TTL_MS`، سؤال ۱۴۴): کمتر از ۱۵ دقیقه‌ای که زیبال پول تأییدنشده را خودکار برمی‌گرداند. */
  ttlMs: number;
  now: () => Date;
}

type Asked<T> = { ok: true; value: T } | { ok: false; tag: string };

async function ask<T>(call: () => Promise<T>): Promise<Asked<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return { ok: false, tag: paymentErrorTag(error) };
  }
}

/** مبلغ و شناسهٔ سفارشی که درگاه گفت با همین تلاش می‌خواند؛ آنچه درگاه نگفت سنجیده نمی‌شود. */
function mismatch(attempt: GatewayAttempt, said: { amountRials: number | null; orderId: string | null }): boolean {
  if (said.amountRials !== null && said.amountRials !== attempt.amountRials) return true;
  return said.orderId !== null && attempt.orderId !== null && said.orderId !== attempt.orderId;
}

export async function judge({ gateway, attempt, payable, ttlMs, now }: JudgeInput): Promise<Verdict> {
  const late = now().getTime() - attempt.createdAt.getTime() > ttlMs;
  // پس از مهلت یا برای سفارشی که دیگر پرداختنی نیست `verify` هرگز؛ همین کد شکست.
  const closed: PaymentFailureCode | null = !payable ? 'order_not_payable' : late ? 'expired' : null;
  // شاید `verify` خورده باشد (پاسخش گم شد): بی جواب روشن بسته نمی‌شود.
  const mayBeVerified = attempt.gatewayStatus === STATUS_PAID || attempt.gatewayStatus === STATUS_VERIFIED;

  const check = (status: number | null, error: string | null = null): GatewayCheck => ({ status, error, at: now() });
  const fail = (code: PaymentFailureCode, seen: GatewayInquiry | null, error: string | null = null): FailedVerdict => ({
    kind: 'failed',
    code,
    cardMask: seen?.cardMask ?? null,
    verifiedAmountRials: null,
    raw: seen?.raw ?? attempt.raw,
    check: check(seen ? seen.status : attempt.gatewayStatus, error),
  });
  /** جوابی که تصمیم نمی‌سازد: تلاش باز می‌ماند، مگر بسته باشد و هرگز `verify` نخورده. */
  const unanswered = (status: number | null, tag: string): Verdict =>
    closed && !mayBeVerified
      ? { kind: 'failed', code: closed, cardMask: null, verifiedAmountRials: null, raw: attempt.raw, check: check(status, tag) }
      : { kind: 'pending', check: check(status, tag) };

  const asked = await ask(() => gateway.inquire(attempt));
  if (!asked.ok) return unanswered(attempt.gatewayStatus, asked.tag);
  const seen = asked.value;
  const verdict = statusVerdict(seen.status);

  switch (verdict.kind) {
    case 'verified': {
      // پول نهایی است؛ مبلغ را باید خود درگاه گفته باشد.
      if (seen.amountRials === null) return { kind: 'pending', check: check(seen.status, 'malformed') };
      if (mismatch(attempt, seen)) return { ...fail('amount_mismatch', seen), verifiedAmountRials: seen.amountRials };
      if (!payable) return fail('order_not_payable', seen);
      return {
        kind: 'succeeded',
        refId: seen.refId ?? attempt.authority,
        cardMask: seen.cardMask,
        verifiedAmountRials: seen.amountRials,
        raw: seen.raw,
        check: check(seen.status),
      };
    }
    case 'paid': {
      if (mismatch(attempt, seen)) return fail('amount_mismatch', seen);
      if (closed) return fail(closed, seen);
      return confirm(seen);
    }
    case 'waiting':
      return closed ? fail(closed, seen) : { kind: 'pending', check: check(seen.status) };
    case 'failed':
      return fail(verdict.code, seen);
    case 'unknown':
      return unanswered(seen.status, 'malformed');
  }

  /** «پرداخت‌شده، تأییدنشده» با مبلغ درست: `verify`، و سنجش دوباره با پاسخ خودش. */
  async function confirm(seen: GatewayInquiry): Promise<Verdict> {
    const verified = await ask(() => gateway.verify(attempt));
    // پاسخ گم شد: شاید پول نهایی شده باشد؛ وضعیت ۲ می‌ماند تا استعلام بعدی بگوید.
    if (!verified.ok) return { kind: 'pending', check: check(STATUS_PAID, verified.tag) };
    const result = verified.value;
    if (result.kind === 'already') {
      // `verify` قبلی ما رسیده بود و پاسخش نه (۲۰۱): جزئیات از استعلام دوباره.
      const again = await ask(() => gateway.inquire(attempt));
      if (!again.ok) return { kind: 'pending', check: check(STATUS_VERIFIED, again.tag) };
      const now2 = again.value;
      if (now2.status !== STATUS_VERIFIED || now2.amountRials === null) return { kind: 'pending', check: check(now2.status, 'malformed') };
      if (mismatch(attempt, now2)) return { ...fail('amount_mismatch', now2), verifiedAmountRials: now2.amountRials };
      return {
        kind: 'succeeded',
        refId: now2.refId ?? attempt.authority,
        cardMask: now2.cardMask ?? seen.cardMask,
        verifiedAmountRials: now2.amountRials,
        raw: now2.raw,
        check: check(STATUS_VERIFIED),
      };
    }
    if (mismatch(attempt, result)) {
      return {
        kind: 'failed',
        code: 'amount_mismatch',
        cardMask: result.cardMask ?? seen.cardMask,
        verifiedAmountRials: result.amountRials,
        raw: result.raw,
        check: check(STATUS_VERIFIED),
      };
    }
    return {
      kind: 'succeeded',
      refId: result.refId ?? seen.refId ?? attempt.authority,
      cardMask: result.cardMask ?? seen.cardMask,
      verifiedAmountRials: result.amountRials,
      raw: result.raw,
      check: check(STATUS_VERIFIED),
    };
  }
}
