import { describe, expect, it } from 'vitest';

import type { JozveView, SectionView } from '../jozveView';
import type { OrderConfig } from '../orderConfig';
import { orderGate, retryable } from './gate';

const config: OrderConfig = { colorMode: 'bw', sidesMode: 'double', paperSize: 'a5', bindingTypeId: 'spiral', paperTypeId: 'a4-80', copies: 2 };

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
/** یک جزوه با همان تنظیمات. */
const one = (jozve: JozveView) => [{ view: jozve, config }];

describe('orderGate', () => {
  it('همه روی سرور و شمرده: یک قلم با سندها به همان ترتیب جزوه و انتخاب‌های چاپ', () => {
    expect(orderGate(one(view(section('b'), section('a'))))).toEqual({
      kind: 'ready',
      items: [
        { documentIds: ['doc-b', 'doc-a'], colorMode: 'bw', paperTypeId: 'a4-80', sidesMode: 'double', paperSize: 'a5', bindingTypeId: 'spiral', copies: 2 },
      ],
    });
  });

  it('چند جزوه (۸٫۲): یک قلم برای هر جزوه، به ترتیب جزوه‌ها، هر کدام با تنظیمات خودش؛ یکی نرسیده، همه صبر', () => {
    const color: OrderConfig = { ...config, colorMode: 'color', copies: 1 };
    expect(orderGate([{ view: view(section('a'), section('b')), config }, { view: view(section('c')), config: color }])).toEqual({
      kind: 'ready',
      items: [
        { documentIds: ['doc-a', 'doc-b'], colorMode: 'bw', paperTypeId: 'a4-80', sidesMode: 'double', paperSize: 'a5', bindingTypeId: 'spiral', copies: 2 },
        { documentIds: ['doc-c'], colorMode: 'color', paperTypeId: 'a4-80', sidesMode: 'double', paperSize: 'a5', bindingTypeId: 'spiral', copies: 1 },
      ],
    });
    const failed = section('d', { serverReady: false, serverFailed: true });
    expect(orderGate([{ view: view(section('a')), config }, { view: view(section('c', { serverReady: false })), config }])).toEqual({
      kind: 'sending',
    });
    expect(orderGate([{ view: view(section('a')), config }, { view: view(failed), config }])).toEqual({ kind: 'stuck', sections: [failed] });
    // فایل خوانده‌نشده یا منتظر در جزوهٔ دوم هم «ادامه» را می‌بندد، نه فقط در جزوهٔ اول
    const second = view(section('c'));
    expect(orderGate([{ view: view(section('a')), config }, { view: { ...second, blocked: [section('x', { serverReady: false })] }, config }])).toEqual({
      kind: 'blocked',
    });
    expect(
      orderGate([{ view: view(section('a')), config }, { view: { ...second, waiting: [section('y', { serverReady: false, documentId: null })] }, config }]),
    ).toEqual({ kind: 'waiting' });
    expect(orderGate([{ view: view(section('a')), config }, { view: view(), config }])).toEqual({ kind: 'sending' });
    expect(orderGate([])).toEqual({ kind: 'sending' });
  });

  it('فایلی هنوز در راه سرور یا در بررسی سرور: صبر، نه سفارش با عدد مرورگر', () => {
    expect(orderGate(one(view(section('a'), section('b', { serverReady: false }))))).toEqual({ kind: 'sending' });
    expect(orderGate(one(view(section('a', { documentId: null, serverReady: false }))))).toEqual({ kind: 'sending' });
    expect(orderGate(one(view()))).toEqual({ kind: 'sending' });
  });

  it('فایلی که در قیمت نیست هم جزو جزوه است: هنوز شمرده‌نشده، خوانده‌نشده، یا منتظر انتخاب دوباره (۳د)', () => {
    const ready = view(section('a'));
    expect(orderGate(one({ ...ready, pending: [section('b', { serverReady: false, documentId: null })] }))).toEqual({ kind: 'sending' });
    expect(orderGate(one({ ...ready, blocked: [section('b', { serverReady: false })] }))).toEqual({ kind: 'blocked' });
    expect(orderGate(one({ ...ready, waiting: [section('b', { serverReady: false, documentId: null })] }))).toEqual({ kind: 'waiting' });
  });

  it('فایلی که نرسید یا سرور نخواندش: همان فایل‌ها، برای پیام و راه جلو', () => {
    const refused = section('b', { serverReady: false, uploadRefused: true, documentId: null });
    const failed = section('c', { serverReady: false, serverFailed: true });
    expect(orderGate(one(view(section('a'), refused, failed)))).toEqual({ kind: 'stuck', sections: [refused, failed] });
  });
});

describe('retryable', () => {
  const refusedFor = (reason: string) =>
    section('a', { uploadRefused: true, upload: { reason } as unknown as SectionView['upload'] });

  it('حجم و نوع فایل با تلاش دوباره عوض نمی‌شوند؛ بقیه می‌شوند', () => {
    expect(retryable(refusedFor('too_large'))).toBe(false);
    expect(retryable(refusedFor('unsupported_type'))).toBe(false);
    expect(retryable(refusedFor('format_off'))).toBe(false);
    expect(retryable(refusedFor('network'))).toBe(true);
    expect(retryable(section('a', { serverFailed: true }))).toBe(true);
  });
});
