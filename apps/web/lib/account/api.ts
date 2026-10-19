/**
 * درخواست‌های «سفارش‌های من» از مرورگر (برش ۱۲٫۱، ADR-068): کد ورود، تأییدش، و پیام به پشتیبانی. همان `call` مسیر خرید: هر شکست، از جمله
 * قطع شبکه، یک نتیجه است نه پرتاب. پشت حالت مسیر خرید نیست (`accountContext.ts`).
 */

import type { SupportMessageRequest } from '@jozveyar/contracts/checkout';

import { call, type Fetch } from '../checkout/api';

export function accountApi(fetchImpl: Fetch) {
  return {
    /** کد ورود؛ پاسخ برای هر شماره‌ای که از سقف‌ها گذشت یکی است (سؤال ۳۰۶). */
    requestCode: (mobile: string) =>
      call<{ mobile: string; expiresInSeconds: number; resendInSeconds: number }>(fetchImpl, '/api/account/otp', 'POST', { mobile }),
    verifyCode: (mobile: string, code: string) => call<{ mobile: string }>(fetchImpl, '/api/account/otp/verify', 'POST', { mobile, code }),
    message: (body: SupportMessageRequest) => call<{ threadId: number; duplicate: boolean }>(fetchImpl, '/api/account/messages', 'POST', body),
  };
}
