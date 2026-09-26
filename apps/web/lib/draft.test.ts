/**
 * پیش‌نویس سفارش همین زبانه (۳د، ADR-036): نوشتن از حال جزوه (`draft.ts`)، و خواندن با سنجش دست‌نویس و برگرداندن
 * فایل‌ها با آنچه سرور درباره‌شان می‌گوید (`restore.ts`). بی مرورگر: حافظه و درخواست‌ها ساختگی‌اند.
 */

import { describe, expect, it } from 'vitest';

import type { CheckoutDraft } from './checkout/store';
import { draftOf, writeDraft, type Draft, type DraftFile } from './draft';
import { documentStatus, parseDraft, readDraft, restoredSection, restoredSections, type DocumentStatus } from './restore';
import { initialAnalysis } from './fileAnalysis';
import type { Section } from './jozve';
import { jozveView } from './jozveView';

const DOC = 'a0000000-0000-4000-8000-000000000001';
const ORDER = 'f0000000-0000-4000-8000-00000000000f';
const KEY = '0b9f7a5e-3d1c-4b8a-9e2f-6a7b8c9d0e1f';

const CHECKOUT: CheckoutDraft = {
  place: { provinceId: 11, cityId: 1326 },
  recipient: { name: 'سارا احمدی', addressText: 'مشهد، بلوار وکیل‌آباد ۱۲', postalCode: '' },
  mobile: '0912 345 6789',
  otp: { mobile: '09123456789', resendAt: 1_000, expiresAt: 2_000, closed: null },
  pay: { payload: '[[],{},{},1]', key: KEY },
  order: ORDER,
};

const FILE: DraftFile = { name: 'جلسه 1.pdf', size: 1234, lastModified: 1_700_000_000_000, documentId: DOC };
const DRAFT: Draft = {
  v: 1,
  files: [FILE, { ...FILE, name: 'جلسه 2.pdf', documentId: null }],
  config: { colorMode: 'color', sidesMode: 'single', bindingTypeId: 'spiral_clear', paperTypeId: 'tahrir80', copies: 3 },
  checkout: CHECKOUT,
};

/** حافظهٔ ساختگی، مثل sessionStorage؛ `broken` یعنی مرورگر اجازه نمی‌دهد. */
function memory(broken = false) {
  const items = new Map<string, string>();
  const guard = () => {
    if (broken) throw new DOMException('blocked', 'SecurityError');
  };
  return {
    items,
    getItem: (key: string) => (guard(), items.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void items.set(key, value)),
    removeItem: (key: string) => (guard(), void items.delete(key)),
  };
}

describe('نوشتن', () => {
  it('از حال جزوه: هر فایل با اثر انگشتش و سندش، به ترتیب صحافی؛ تنظیمات و مسیر خرید کنارش', () => {
    const live = new File(['%PDF'], 'b.pdf', { lastModified: 42 });
    const sections: Section[] = [
      {
        key: 's1',
        file: live,
        kind: 'pdf',
        analysis: initialAnalysis(live),
        upload: { phase: 'uploading', documentId: DOC, sentBytes: 1, totalBytes: 4 },
      },
      // برگشته و هنوز منتظر: سند نیمه‌کاره‌اش از خود نشانی فایل
      { key: 's2', file: { ...FILE, name: 'a.pdf' }, kind: 'pdf', analysis: initialAnalysis(FILE), upload: null },
    ];
    expect(draftOf(sections, null, CHECKOUT)).toEqual({
      v: 1,
      files: [
        { name: 'b.pdf', size: 4, lastModified: 42, documentId: DOC },
        { name: 'a.pdf', size: 1234, lastModified: 1_700_000_000_000, documentId: DOC },
      ],
      config: null,
      checkout: CHECKOUT,
    });
    expect(draftOf([], null, CHECKOUT)).toBeNull();
  });

  it('رفت و برگشت از حافظه همان است؛ جزوهٔ خالی پیش‌نویس را پاک می‌کند', () => {
    const storage = memory();
    writeDraft(storage, DRAFT);
    expect(storage.items.has('jy.draft')).toBe(true);
    expect(readDraft(storage)).toEqual(DRAFT);
    writeDraft(storage, null);
    expect(storage.items.size).toBe(0);
  });

  it('حافظهٔ بستهٔ سایت: نه خطا، نه پیش‌نویس', () => {
    const storage = memory(true);
    expect(() => writeDraft(storage, DRAFT)).not.toThrow();
    expect(readDraft(storage)).toBeNull();
    expect(readDraft(null)).toBeNull();
  });
});

describe('سنجش', () => {
  const raw = (draft: unknown) => JSON.stringify(draft);
  const withFile = (patch: Partial<Record<keyof DraftFile, unknown>>) => raw({ ...DRAFT, files: [{ ...FILE, ...patch }] });

  it('شکل ناجور یعنی پیش‌نویسی نیست، نه خطا', () => {
    for (const text of [null, '', '{', '[]', 'null', raw({ ...DRAFT, v: 2 }), raw({ ...DRAFT, files: [] }), raw({ ...DRAFT, files: 'x' })]) {
      expect(parseDraft(text), String(text)).toBeNull();
    }
    // سقف جزوه ۳۰ فایل است
    expect(parseDraft(raw({ ...DRAFT, files: Array.from({ length: 31 }, () => FILE) }))).toBeNull();
    expect(parseDraft(raw({ ...DRAFT, files: Array.from({ length: 30 }, () => FILE) }))?.files).toHaveLength(30);
  });

  it('هر فایل: نام، حجم، تاریخ تغییر، و شناسهٔ سند به شکل سرور یا null', () => {
    expect(parseDraft(withFile({}))?.files).toEqual([FILE]);
    for (const bad of [
      { name: '' },
      { name: 7 },
      { size: -1 },
      { size: 1.5 },
      { lastModified: 'دیروز' },
      { documentId: 'doc-1' },
      { documentId: `${DOC}/../x` },
    ]) {
      expect(parseDraft(withFile(bad)), JSON.stringify(bad)).toBeNull();
    }
  });

  it('تنظیمات یا مسیر خرید ناجور فقط همان تکه را کنار می‌گذارد', () => {
    const config = (patch: object) => parseDraft(raw({ ...DRAFT, config: { ...DRAFT.config, ...patch } }))!;
    expect(config({}).config).toEqual(DRAFT.config);
    expect(config({ colorMode: 'mixed' })).toMatchObject({ config: null, files: DRAFT.files });
    expect(config({ copies: 0 }).config).toBeNull();
    expect(config({ copies: 1001 }).config).toBeNull();

    const checkout = (patch: object) => parseDraft(raw({ ...DRAFT, checkout: { ...CHECKOUT, ...patch } }))!.checkout;
    expect(checkout({})).toEqual(CHECKOUT);
    expect(checkout({ place: null, otp: null, pay: null, order: null })).toMatchObject({ place: null, otp: null, pay: null, order: null });
    for (const bad of [
      { place: { provinceId: 0, cityId: null } },
      { recipient: { name: 'x'.repeat(201), addressText: '', postalCode: null } },
      { otp: { ...CHECKOUT.otp, closed: 'open' } },
      { pay: { payload: '[]', key: 'کلید' } },
      { order: 'not-a-token' },
      { mobile: 9123456789 },
    ]) {
      expect(checkout(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('برگشت', () => {
  const ready: DocumentStatus = { kind: 'arrived', analysis: { state: 'ready', pageCount: 12, colorPageCount: 2 } };

  it('فایل روی سرور: عدد و رنگ از سرور، مثل مسیر سرور؛ بقیه منتظر همان فایل', () => {
    const [a, b, c, d] = [
      restoredSection(FILE, ready),
      restoredSection(FILE, { kind: 'partial' }),
      restoredSection(FILE, { kind: 'gone' }),
      restoredSection({ ...FILE, documentId: null }, null),
    ];
    expect(a).toMatchObject({ kind: 'pdf', upload: { phase: 'done', documentId: DOC, analysis: { pageCount: 12 } } });
    expect(a.analysis.phase).toBe('needs_server');
    // نیمه‌کاره: سند می‌ماند تا همان فایل ادامه دهد؛ پاک‌شده: چیزی برای ادامه نیست
    expect(b).toMatchObject({ upload: null, file: { documentId: DOC } });
    expect(c).toMatchObject({ upload: null, file: { documentId: null } });
    expect(d).toMatchObject({ upload: null, file: { documentId: null } });

    const view = jozveView([a, b].map((section, i) => ({ ...section, key: `k${i}` })));
    expect(view).toMatchObject({ pageCount: 12, provisional: true });
    expect(view.summary.colorPageCount).toBe(2);
    expect(view.waiting.map((v) => v.name)).toEqual([FILE.name]);
  });

  it('همه روی سرور بودند و دیگر نیستند: جزوه برنمی‌گردد؛ فایلی که هرگز نرسیده بود هنوز برمی‌گردد', async () => {
    const gone = async (): Promise<DocumentStatus> => ({ kind: 'gone' });
    expect(await restoredSections([FILE, FILE], gone)).toBeNull();
    const back = await restoredSections([FILE, { ...FILE, documentId: null }], gone);
    expect(back?.map((s) => s.upload)).toEqual([null, null]);
    // فایل بی سند از سرور پرسیده نمی‌شود
    const asked: string[] = [];
    await restoredSections([{ ...FILE, documentId: null }], async (id) => (asked.push(id), ready));
    expect(asked).toEqual([]);
  });

  it('وضعیت سند از همان مسیر ادامهٔ آپلود؛ ۴۰۴ یعنی رفته، و شبکه یک بار دیگر', async () => {
    const replies: (Response | Error)[] = [];
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(url);
      const reply = replies.shift()!;
      if (reply instanceof Error) throw reply;
      return reply;
    }) as unknown as typeof globalThis.fetch;
    const deps = { fetch, sleep: async () => undefined };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

    replies.push(json({ status: 'uploaded', analysis: { state: 'running' } }));
    expect(await documentStatus(DOC, deps)).toEqual({ kind: 'arrived', analysis: { state: 'running' } });
    expect(urls).toEqual([`/api/uploads/${DOC}`]);

    replies.push(json({ status: 'uploading', receivedParts: [1] }));
    expect(await documentStatus(DOC, deps)).toEqual({ kind: 'partial' });
    replies.push(json({ error: 'not_found' }, 404));
    expect(await documentStatus(DOC, deps)).toEqual({ kind: 'gone' });
    replies.push(json({ status: 'failed' }));
    expect(await documentStatus(DOC, deps)).toEqual({ kind: 'gone' });

    replies.push(new TypeError('network'), json({ status: 'uploading' }));
    expect(await documentStatus(DOC, deps)).toEqual({ kind: 'partial' });
    replies.push(json({ error: 'storage_unavailable' }, 503), new TypeError('network'));
    expect(await documentStatus(DOC, deps)).toEqual({ kind: 'unknown' });
  });
});
