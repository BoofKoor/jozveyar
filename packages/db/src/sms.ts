/**
 * سابقهٔ پیامک (`sms_messages`، ADR-008 و ADR-033).
 *
 * پیامک کنسولی (توسعه و CI، تا برش ۷) فقط همین ردیف است، با متن کامل، تا کد پیامکی بی پنل پیامک هم
 * آزمودنی باشد: تست سرتاسری ۳ج کد را از همین جدول می‌خواند. پنل واقعی متن کد را نگه نمی‌دارد.
 */

import type { Database } from './index.js';
import { smsMessages } from './schema.js';

export type SmsPurpose = 'otp' | 'order_paid';

export interface SmsRecord {
  provider: string;
  toMobile: string;
  purpose: SmsPurpose;
  /** null برای پنل واقعی و کد پیامکی: کد زنده در پایگاه داده نمی‌نشیند. */
  body: string | null;
  /** `logged` (کنسولی)، `sent` یا `failed`. */
  status: 'logged' | 'sent' | 'failed';
  providerMessageId?: string | null;
  error?: string | null;
}

export interface SmsLog {
  insert(message: SmsRecord): Promise<void>;
}

export function createSmsLog({ db }: Database): SmsLog {
  return {
    async insert(message) {
      await db.insert(smsMessages).values({
        provider: message.provider,
        toMobile: message.toMobile,
        purpose: message.purpose,
        body: message.body,
        status: message.status,
        providerMessageId: message.providerMessageId ?? null,
        error: message.error ?? null,
      });
    },
  };
}
