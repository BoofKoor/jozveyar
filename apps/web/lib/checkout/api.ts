/**
 * درخواست‌های مسیر خرید از مرورگر (۳ج؛ مسیرها در docs/ARCHITECTURE.md، بخش ۸، «۳ب»).
 *
 * از `@jozveyar/contracts/checkout` فقط type می‌آید (قاعدهٔ باندل، ADR-018)؛ سرور هر بدنه را خودش با zod
 * می‌سنجد. هر شکست، از جمله قطع شبکه، یک نتیجه است نه پرتاب: رابط برای هر کد پیام و راه جلو دارد.
 */

import type {
  CheckoutErrorCode,
  CheckoutItem,
  CheckoutQuote,
  CheckoutStatus,
  MockDecision,
  Place,
  PlacedOrder,
} from '@jozveyar/contracts/checkout';

/** شکست یک درخواست: کد سرور و بقیهٔ بدنه (`retryAfterSeconds`، `attemptsLeft`، `fields`…). */
export interface ApiFailure {
  ok: false;
  /** وضعیت HTTP؛ صفر یعنی پاسخی نرسید. */
  status: number;
  error: CheckoutErrorCode | 'network';
  body: Record<string, unknown>;
}

export type ApiResult<T> = { ok: true; value: T } | ApiFailure;

export type Fetch = typeof fetch;

async function call<T>(fetchImpl: Fetch, path: string, method = 'GET', body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetchImpl(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: 'network', body: {} };
  }
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return { ok: true, value: parsed as T };
  const error = typeof parsed.error === 'string' ? (parsed.error as CheckoutErrorCode) : 'unavailable';
  return { ok: false, status: response.status, error, body: parsed };
}

export interface PlaceOrderBody {
  items: CheckoutItem[];
  place: Place;
  recipient: { name: string; addressText: string; postalCode: string | null };
  checkoutKey: string;
  expectedTotalRials: number;
  quoteSnapshot: unknown;
}

export function checkoutApi(fetchImpl: Fetch) {
  return {
    status: () => call<CheckoutStatus>(fetchImpl, '/api/checkout'),
    quote: (items: CheckoutItem[], place: Place | null) =>
      call<CheckoutQuote>(fetchImpl, '/api/checkout/quote', 'POST', { items, place }),
    requestCode: (mobile: string) =>
      call<{ mobile: string; expiresInSeconds: number; resendInSeconds: number }>(fetchImpl, '/api/checkout/otp', 'POST', {
        mobile,
      }),
    verifyCode: (mobile: string, code: string) =>
      call<{ mobile: string }>(fetchImpl, '/api/checkout/otp/verify', 'POST', { mobile, code }),
    logout: () => call<{ loggedOut: boolean }>(fetchImpl, '/api/checkout/auth', 'DELETE'),
    placeOrder: (body: PlaceOrderBody) => call<PlacedOrder>(fetchImpl, '/api/checkout/orders', 'POST', body),
    payAgain: (token: string) => call<PlacedOrder>(fetchImpl, `/api/checkout/orders/${encodeURIComponent(token)}/pay`, 'POST'),
    mockDecision: (authority: string, decision: MockDecision) =>
      call<{ redirectUrl: string }>(fetchImpl, `/api/checkout/mock-gateway/${encodeURIComponent(authority)}`, 'POST', {
        decision,
      }),
  };
}

export type CheckoutApi = ReturnType<typeof checkoutApi>;
