import { describe, expect, it } from 'vitest';

import type { JozveView, SectionView } from '../jozveView';
import type { OrderConfig } from '../orderConfig';
import { orderGate, retryable } from './gate';

const config: OrderConfig = { colorMode: 'bw', sidesMode: 'double', bindingTypeId: 'spiral', paperTypeId: 'a4-80', copies: 2 };

/** فقط همان‌چه `orderGate` می‌خواند؛ بقیهٔ نمای فایل اینجا بی‌اثر است. */
function section(key: string, over: Partial<SectionView> = {}): SectionView {
  return {
    key,
    name: `${key}.pdf`,
    documentId: `doc-${key}`,
    serverReady: true,
    serverFailed: false,
    uploadRefused: false,
    upload: null,
    ...over,
  } as SectionView;
}
const view = (...included: SectionView[]) => ({ included, pending: [], blocked: [], waiting: [] }) as unknown as JozveView;

describe('orderGate', () => {
  it('همه روی سرور و شمرده: یک قلم با سندها به همان ترتیب جزوه و انتخاب‌های چاپ', () => {
    expect(orderGate(view(section('b'), section('a')), config)).toEqual({
      kind: 'ready',
      items: [
        { documentIds: ['doc-b', 'doc-a'], colorMode: 'bw', paperTypeId: 'a4-80', sidesMode: 'double', bindingTypeId: 'spiral', copies: 2 },
      ],
    });
  });

  it('فایلی هنوز در راه سرور یا در بررسی سرور: صبر، نه سفارش با عدد مرورگر', () => {
    expect(orderGate(view(section('a'), section('b', { serverReady: false })), config)).toEqual({ kind: 'sending' });
    expect(orderGate(view(section('a', { documentId: null, serverReady: false })), config)).toEqual({ kind: 'sending' });
    expect(orderGate(view(), config)).toEqual({ kind: 'sending' });
  });

  it('فایلی که در قیمت نیست هم جزو جزوه است: هنوز شمرده‌نشده، خوانده‌نشده، یا منتظر انتخاب دوباره (۳د)', () => {
    const ready = view(section('a'));
    expect(orderGate({ ...ready, pending: [section('b', { serverReady: false, documentId: null })] }, config)).toEqual({ kind: 'sending' });
    expect(orderGate({ ...ready, blocked: [section('b', { serverReady: false })] }, config)).toEqual({ kind: 'blocked' });
    expect(orderGate({ ...ready, waiting: [section('b', { serverReady: false, documentId: null })] }, config)).toEqual({ kind: 'waiting' });
  });

  it('فایلی که نرسید یا سرور نخواندش: همان فایل‌ها، برای پیام و راه جلو', () => {
    const refused = section('b', { serverReady: false, uploadRefused: true, documentId: null });
    const failed = section('c', { serverReady: false, serverFailed: true });
    expect(orderGate(view(section('a'), refused, failed), config)).toEqual({ kind: 'stuck', sections: [refused, failed] });
  });
});

describe('retryable', () => {
  const refusedFor = (reason: string) =>
    section('a', { uploadRefused: true, upload: { reason } as unknown as SectionView['upload'] });

  it('حجم و نوع فایل با تلاش دوباره عوض نمی‌شوند؛ بقیه می‌شوند', () => {
    expect(retryable(refusedFor('too_large'))).toBe(false);
    expect(retryable(refusedFor('unsupported_type'))).toBe(false);
    expect(retryable(refusedFor('network'))).toBe(true);
    expect(retryable(section('a', { serverFailed: true }))).toBe(true);
  });
});
