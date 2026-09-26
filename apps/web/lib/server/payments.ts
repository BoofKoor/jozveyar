/**
 * درگاه پرداخت، پشت آداپتور (ADR-008).
 *
 * شکلش شکل زرین‌پال است، چون درگاه واقعی برش ۷ احتمالاً همان است: `start` یک Authority می‌دهد و نشانی
 * صفحهٔ پرداخت؛ بانک کاربر را با `Authority` و `Status` (`OK` یا `NOK`) به `/pay/callback` برمی‌گرداند؛
 * و `verify` سمت سرور می‌سنجد که پول واقعاً آمده. به `Status` نشانی هرگز اعتماد نمی‌شود: هر کسی
 * می‌تواند `Status=OK` تایپ کند.
 *
 * امروز فقط درگاه نمونه هست (ADR-035): صفحه‌اش (۳ج، `/pay/mock/<authority>`) پرداخت موفق، ناموفق یا
 * انصراف را در پایگاه داده ثبت می‌کند، و `verify` همان تصمیم ثبت‌شده را می‌خواند. درگاه نمونه فقط در
 * `CHECKOUT_MODE=mock` ساخته می‌شود و روی jozveyar.com هرگز (`checkoutMode.ts`).
 */

import { randomBytes, randomInt } from 'node:crypto';

export interface GatewayStart {
  orderNumber: number;
  amountRials: number;
  /** نشانی برگشت؛ درگاه واقعی نشانی کامل می‌خواهد (`PAYMENT_CALLBACK_URL`). */
  callbackUrl: string;
  mobile: string;
  description: string;
}

export interface GatewayVerify {
  authority: string;
  amountRials: number;
  /** پارامتر `Status` برگشت؛ فقط برای «کاربر برگشت و نپرداخت»، هرگز برای «پرداخت شد». */
  callbackStatus: string | null;
  /** `payments.raw` همین تلاش؛ درگاه نمونه تصمیم صفحه‌اش را اینجا دارد. */
  raw: unknown;
}

/** چرا پرداخت نشد؛ در `payments.failure_code` می‌نشیند. */
export type PaymentFailureCode = 'cancelled' | 'declined' | 'verify_failed' | 'amount_mismatch';

export type VerifyOutcome =
  | { ok: true; refId: string; cardMask: string | null; raw: unknown }
  | { ok: false; code: PaymentFailureCode; raw: unknown };

export interface PaymentGateway {
  /** همان که در `payments.provider` می‌نشیند؛ برگشت از درگاه فقط پرداخت‌های همین درگاه را پیدا می‌کند. */
  readonly name: string;
  start(input: GatewayStart): Promise<{ authority: string; redirectUrl: string; raw?: unknown }>;
  verify(input: GatewayVerify): Promise<VerifyOutcome>;
}

/** Authority درگاه نمونه: ۳۶ نویسه مثل زرین‌پال، ولی با پیشوندی که با هیچ درگاه واقعی قاطی نشود. */
export const MOCK_AUTHORITY = /^MOCK[0-9A-F]{32}$/;

export function mockGateway(options: { newRefId?: () => string } = {}): PaymentGateway {
  const newRefId = options.newRefId ?? (() => String(randomInt(100_000, 1_000_000)));
  return {
    name: 'mock',

    async start() {
      const authority = `MOCK${randomBytes(16).toString('hex').toUpperCase()}`;
      return { authority, redirectUrl: `/pay/mock/${authority}` };
    },

    async verify({ raw }) {
      const decision = (raw as { decision?: unknown } | null)?.decision;
      if (decision === 'success') {
        return { ok: true, refId: newRefId(), cardMask: null, raw };
      }
      // برگشت بی تصمیم (نشانی دست‌ساز، یا صفحه‌ای که بسته شد) یعنی پرداختی نشده: مثل انصراف.
      return { ok: false, code: decision === 'failure' ? 'declined' : 'cancelled', raw };
    },
  };
}
