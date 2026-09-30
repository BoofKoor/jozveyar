/**
 * تکه‌های کوچک و خالص مسیر خرید (۳ج): شکل نمایش موبایل و شمارش معکوس، کلید «پرداخت»، و اینکه قیمت
 * چرا عوض شد. بی React، پس تست واحد دارند.
 */

import type { Breakdown } from '@jozveyar/contracts';

/** «0912 345 6789»: موبایل نرمال‌شده (`09123456789`) در سه تکه، مثل طرح. هر شکل دیگر همان‌طور می‌ماند. */
export function formatMobile(mobile: string): string {
  return /^09\d{9}$/.test(mobile) ? `${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}` : mobile;
}

/** «1:24»: ثانیه‌های مانده به دقیقه و ثانیه؛ کسر ثانیه به بالا، تا «0:00» فقط وقتی واقعاً تمام شده. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** «حدود 12 دقیقه»: برای سقف ساعتی کد پیامکی، که تا یک ساعت است. کمتر از یک دقیقه، یک دقیقه. */
export function minutesFrom(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** بیش از این انتظار، مشتری ساعت را می‌بیند نه شمار دقیقه (سؤال ۱۳۳): ساعت را می‌شود به خاطر سپرد. */
export const CLOCK_AFTER_MS = 15 * 60_000;

let tehranClock: Intl.DateTimeFormat | undefined;

/**
 * «11:40» و اینکه فرداست یا نه، به وقت تهران: زمان «دوباره» سقف کد پیامکی (۷٫۱). `Intl` همین‌جا ساخته می‌شود، نه از `@jozveyar/text`،
 * چون آن ماژول در باندل اولیه است و هر خروجی تازه‌اش آنجا هم می‌نشست (قاعدهٔ باندل، ADR-018).
 */
export function retryClock(at: number, now: number): { time: string; tomorrow: boolean } {
  tehranClock ??= new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = (ms: number) => {
    const out: Record<string, string> = {};
    for (const part of tehranClock!.formatToParts(ms)) out[part.type] = part.value;
    return out;
  };
  // دقیقه به بالا: «دوباره» هرگز پیش از زمانی که سرور گفت نیست.
  const target = parts(Math.ceil(at / 60_000) * 60_000);
  const today = parts(now);
  return {
    time: `${target.hour}:${target.minute}`,
    tomorrow: `${target.year}${target.month}${target.day}` !== `${today.year}${today.month}${today.day}`,
  };
}

/**
 * کلید یکتای «پرداخت» (ADR-034). `randomUUID` فقط در زمینهٔ امن (https یا localhost) هست؛ بیرون از آن،
 * همان UUID نسخهٔ ۴ از `getRandomValues`.
 */
export function newCheckoutKey(random: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = crypto): string {
  if (typeof random.randomUUID === 'function') return random.randomUUID();
  const bytes = random.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * چرا عددی که سرور موقع «پرداخت» حساب کرد با عدد روی دکمه نخواند (۴۰۹ `price_changed`)، از دو ریز قیمت:
 * آنکه مرورگر نشان داده بود و آنکه سرور حالا حساب کرد. سرور منبع حقیقت است؛ این فقط دلیل را می‌گوید.
 */
export type PriceChange =
  | { kind: 'pages'; before: number; after: number }
  | { kind: 'shipping' }
  | { kind: 'tariff' }
  | { kind: 'other' };

const pagesOf = (breakdown: Breakdown) => breakdown.items.reduce((sum, item) => sum + item.pageCount, 0);

export function priceChange(before: Breakdown, after: Breakdown): PriceChange {
  const [was, now] = [pagesOf(before), pagesOf(after)];
  if (was !== now) return { kind: 'pages', before: was, after: now };
  if (before.shippingRials !== after.shippingRials) return { kind: 'shipping' };
  if (before.priceListVersion !== after.priceListVersion) return { kind: 'tariff' };
  return { kind: 'other' };
}
