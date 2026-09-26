/**
 * پیامک، پشت آداپتور (ADR-008).
 *
 * امروز فقط پیامک کنسولی هست (توسعه و CI، `CHECKOUT_MODE=mock`): پیامک یک ردیف `sms_messages` با متن
 * کامل است و یک خط لاگ، تا کد پیامکی بی پنل پیامک آزمودنی باشد. پنل واقعی (برش ۷) همین اینترفیس را
 * پیاده می‌کند و متن کد را در پایگاه داده نمی‌گذارد (ADR-033).
 */

import type { SmsLog, SmsPurpose } from '@jozveyar/db';

export interface SmsMessage {
  to: string;
  purpose: SmsPurpose;
  text: string;
}

export interface SmsProvider {
  /** همان که در `sms_messages.provider` می‌نشیند. */
  readonly name: string;
  /** شکستش پرتاب می‌شود؛ فرستنده تصمیم می‌گیرد چه کند. */
  send(message: SmsMessage): Promise<void>;
}

export function consoleSms(log: SmsLog, print: (line: string) => void = console.info): SmsProvider {
  return {
    name: 'console',
    async send(message) {
      await log.insert({
        provider: 'console',
        toMobile: message.to,
        purpose: message.purpose,
        body: message.text,
        status: 'logged',
      });
      print(`✉ پیامک کنسولی به ${message.to} (${message.purpose}): ${message.text.replace(/\n/g, ' ⏎ ')}`);
    },
  };
}

/** متن کد پیامکی. کد اول می‌آید تا در اعلان گوشی دیده شود. */
export function otpText(code: string): string {
  return `کد تأیید جزوه‌یار: ${code}\nاین کد را به کسی نده.`;
}

/** متن پیامک بعد از پرداخت: شمارهٔ سفارش، و روز تحویل به پست (ADR-013). */
export function orderPaidText(orderNumber: number, handoffDay: string): string {
  return `جزوه‌یار: سفارش ${orderNumber} پرداخت شد. تحویل به پست تا ${handoffDay}؛ کد رهگیری پست را هم پیامک می‌کنیم.`;
}
