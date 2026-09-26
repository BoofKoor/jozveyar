/**
 * سرآیندهای امنیتی پنل (ADR-037). `middleware.ts` همه را روی هر پاسخ می‌گذارد، و `next.config.ts`
 * همان‌ها (جز CSP) را روی فایل‌های استاتیک.
 *
 * - **CSP با nonce هر درخواست:** فقط اسکریپت خود نکست با همان nonce (`strict-dynamic`)، سبک و قلم و
 *   تصویر فقط از خود پنل (و `data:` برای آیکون‌های کیت)، بی قاب (`frame-ancestors 'none'`)، و فرم فقط به
 *   خود پنل. هیچ منبع بیرونی، مثل سایت (قاعدهٔ ۸).
 * - **بی ارجاع:** مسیر محرمانه در `Referer` به هیچ‌جا نمی‌رود.
 * - **بی کش و بی نمایه:** `no-store` و `noindex`.
 */

export function contentSecurityPolicy(nonce: string, dev = false): string {
  return [
    "default-src 'none'",
    // نکست در حالت توسعه eval و سبک درون‌خطی می‌خواهد؛ build تولیدی نه.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

/** `ADMIN_ORIGIN` به شکل origin (`https://admin.jozveyar.com`)، یا null. */
export function originOf(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * درخواست نوشتنی فقط از خود پنل: `Origin` برابر `ADMIN_ORIGIN`، یا اگر آن تنظیم نیست، هم‌میزبان با
 * `Host`. بی `Origin` نه؛ مرورگرها روی POST همیشه می‌فرستندش. کنار کوکی `SameSite=Strict` و سنجش خود
 * نکست برای server actionها، دیوار سوم CSRF است.
 */
export function sameOrigin(origin: string | null, host: string | null, configured: string | null): boolean {
  if (!origin) return false;
  if (configured) return origin === configured;
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}
