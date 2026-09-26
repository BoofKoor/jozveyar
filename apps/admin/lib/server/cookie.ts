/**
 * کوکی نشست پنل (ADR-037). روی https نامش `__Host-jy_admin` است: مرورگر فقط با `Secure`، `Path=/` و بی
 * `Domain` می‌پذیردش، پس نه زیردامنهٔ دیگری (حتی خود سایت) می‌تواند جایش کوکی بکارد و نه کوکی به زیردامنهٔ
 * دیگری می‌رود. `SameSite=Strict`: از هیچ سایت دیگری، حتی با پیوند، همراه درخواست نمی‌آید.
 *
 * پشت Nginx درخواست به کانتینر http است؛ `X-Forwarded-Proto` را خود Nginx می‌گذارد و کانتینر پورتی بیرون
 * باز نکرده. بی https (توسعه و CI روی 127.0.0.1) نام بی پیشوند و بی `Secure`، و فقط همان نام خوانده می‌شود:
 * روی https کوکی بی پیشوند هرگز پذیرفته نیست.
 */

export const SESSION_COOKIE = 'jy_admin';

export const cookieName = (secure: boolean) => (secure ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE);

export const isSecureRequest = (headers: Pick<Headers, 'get'>) => headers.get('x-forwarded-proto') === 'https';

export function sessionCookieOptions(secure: boolean, expires: Date) {
  return { httpOnly: true, secure, sameSite: 'strict' as const, path: '/', expires };
}

/**
 * IP کاربر برای سقف ورود. پشت Nginx از `X-Real-IP`، که Nginx خودش می‌گذارد و مقدار کاربر را بازنویسی
 * می‌کند؛ بی Nginx (توسعه و CI) آخرین حلقهٔ `X-Forwarded-For`، و اگر نبود `unknown`. همان قاعدهٔ سایت.
 */
export function clientIpOf(headers: Pick<Headers, 'get'>): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? 'unknown';
}
