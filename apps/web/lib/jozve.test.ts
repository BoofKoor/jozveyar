/**
 * مدل جزوهٔ چندفایلی: وضع هر فایل، جمع جزوه، نوبت‌ها و ترتیب (ADR-030).
 */

import { describe, expect, it } from 'vitest';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { INITIAL, type AnalysisState } from './fileAnalysis';
import {
  jozveCounted,
  jozveSpec,
  jozveView,
  moveSection,
  nextAnalysisJob,
  nextUpload,
  orderBatch,
  sectionView,
  type Section,
} from './jozve';
import type { UploadSnapshot } from './upload/client';

const CONFIG = {
  colorMode: 'bw' as const,
  sidesMode: 'double' as const,
  bindingTypeId: 'spiral_clear',
  paperTypeId: 'tahrir80',
  copies: 1,
};

let seq = 0;
function section(name: string, analysis: Partial<AnalysisState>, upload: UploadSnapshot | null = null): Section {
  seq += 1;
  const file = new File(['x'], name);
  const kind = name.endsWith('.pdf') ? 'pdf' : name.endsWith('.docx') ? 'word' : 'image';
  return { key: `k${seq}`, file, kind, analysis: { ...INITIAL, fileName: name, ...analysis }, upload };
}

const ready = (name: string, pageCount: number) =>
  section(name, { phase: 'ready', pageCount, analyzedCount: pageCount });
const queued = (name: string, pageCount = 0) => section(name, { phase: 'queued', pageCount });
const word = (name: string, pageCount: number) =>
  section(name, { phase: 'needs_server', pageCount, estimatedFrom: pageCount > 0 ? 'office' : null });
const done = (documentId: string, analysis?: UploadSnapshot['analysis']): UploadSnapshot => ({
  phase: 'done',
  documentId,
  sentBytes: 1,
  totalBytes: 1,
  ...(analysis ? { analysis } : {}),
});

describe('ترتیب فایل‌هایی که با هم انداخته شده‌اند', () => {
  it('نام با فهم عدد، ارقام فارسی مثل لاتین', () => {
    const names = ['جلسه 10.pdf', 'جلسه 2.pdf', 'جلسه ۱.pdf', 'فصل ۳.docx', 'جلسه 1-ب.pdf'];
    expect(orderBatch(names.map((name) => ({ name }))).map((f) => f.name)).toEqual([
      'جلسه ۱.pdf',
      'جلسه 1-ب.pdf',
      'جلسه 2.pdf',
      'جلسه 10.pdf',
      'فصل ۳.docx',
    ]);
  });

  it('جابه‌جایی با همسایه؛ لبهٔ فهرست بی‌اثر است', () => {
    const list = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    expect(moveSection(list, 'c', -1).map((s) => s.key)).toEqual(['a', 'c', 'b']);
    expect(moveSection(list, 'a', 1).map((s) => s.key)).toEqual(['b', 'a', 'c']);
    expect(moveSection(list, 'a', -1).map((s) => s.key)).toEqual(['a', 'b', 'c']);
    expect(moveSection(list, 'c', 1).map((s) => s.key)).toEqual(['a', 'b', 'c']);
  });
});

describe('وضع هر فایل', () => {
  it('عدد سرور جای پیش‌فاکتور Word می‌نشیند و اصلاح دیده می‌شود', () => {
    const view = sectionView({
      ...word('jozve.docx', 12),
      upload: done('d1', { state: 'ready', pageCount: 6, colorPageCount: 0 }),
    });
    expect(view).toMatchObject({ pageCount: 6, correctedFrom: 12, settled: true, blocked: null });
    expect(view.state.estimatedFrom).toBeNull();
  });

  it('خطای خود فایل از قیمت بیرون است، با پیام و راه جلو', () => {
    const view = sectionView(section('broken.pdf', { phase: 'error', error: { code: 'corrupt_file', title: 'این فایل خوانده نشد', hint: 'دوباره دانلود کنید' } }));
    expect(view.blocked?.title).toBe('این فایل خوانده نشد');
    expect(view.pending).toBe(false);
  });

  it('مرورگر کم آورد: مسیر سرور، نه خطا', () => {
    const view = sectionView(section('scan.pdf', { phase: 'error', pageCount: 40, error: { code: 'render_failed', title: '', hint: '' } }));
    expect(view).toMatchObject({ serverPath: true, blocked: null });
  });

  it('شکست تبدیل سرور پیش‌فاکتور را باطل می‌کند', () => {
    const view = sectionView({ ...word('j.docx', 12), upload: done('d1', { state: 'failed', failureReason: 'convert_failed' }) });
    expect(view.blocked?.title).toContain('Word');
  });

  it('آپلودِ ردشده: فایلی که فقط سرور می‌خواندش بیرون می‌ماند، پیش‌فاکتور و PDF مرورگر نه', () => {
    const refused: UploadSnapshot = { phase: 'unavailable', documentId: null, sentBytes: 0, totalBytes: 1, reason: 'storage_unavailable' };
    expect(sectionView({ ...word('old.doc', 0), upload: refused }).blocked).not.toBeNull();
    expect(sectionView({ ...word('new.docx', 9), upload: refused }).blocked).toBeNull();
    expect(sectionView({ ...ready('a.pdf', 10), upload: refused }).blocked).toBeNull();
  });
});

describe('جمع جزوه', () => {
  it('صفحه‌ها جمع می‌شوند؛ فایل خوانده‌نشده و شمرده‌نشده جدا گفته می‌شوند', () => {
    const view = jozveView([
      ready('a.pdf', 10),
      section('b.pdf', { phase: 'error', error: { code: 'password_protected', title: 'رمز', hint: '' } }),
      word('c.doc', 0),
      word('d.docx', 12),
    ]);
    expect(view.pageCount).toBe(22);
    expect(view.included.map((v) => v.name)).toEqual(['a.pdf', 'd.docx']);
    expect(view.blocked.map((v) => v.name)).toEqual(['b.pdf']);
    expect(view.pending.map((v) => v.name)).toEqual(['c.doc']);
    expect(view.provisional).toBe(true);
  });

  it('قیمت: یک قلم، بخش‌ها به همان ترتیب، یک صحافی', () => {
    const view = jozveView([ready('a.pdf', 10), ready('b.pdf', 6), ready('c.pdf', 10)]);
    const spec = jozveSpec(view, CONFIG)!;
    expect(spec.items).toHaveLength(1);
    expect(spec.items[0]!.sections.map((s) => s.pageCount)).toEqual([10, 6, 10]);
    expect(spec.items[0]!.rules[0]!.pageRanges).toEqual([[1, 26]]);
    // ۲۶ صفحه: ۴۱,۶۰۰ + صحافی ۴۵,۰۰۰ = ۸۶,۶۰۰ تومان — سه سفارش جدا ۱۷۶,۶۰۰ می‌شد.
    expect(quote(spec, SEED_PRICE_LIST).totalWithoutShippingRials).toBe(866_000);
    expect(view.provisional).toBe(false);
  });

  it('بی هیچ صفحهٔ شمرده‌شده، قیمتی نیست', () => {
    expect(jozveSpec(jozveView([queued('a.pdf')]), CONFIG)).toBeNull();
  });
});

describe('نوبت کارگر تحلیل', () => {
  it('تک‌فایل مستقیم بررسی کامل می‌شود — رفتار قبل', () => {
    const a = queued('a.pdf');
    expect(nextAnalysisJob([a])).toEqual({ key: a.key, countOnly: false });
  });

  it('چند فایل: اول شمارش همه، بعد بررسی به ترتیب فهرست', () => {
    const a = queued('a.pdf');
    const b = queued('b.pdf');
    expect(nextAnalysisJob([a, b])).toEqual({ key: a.key, countOnly: true });
    const aCounted = { ...a, analysis: { ...a.analysis, pageCount: 10 } };
    // b تنها شمرده‌نشده است ولی نوبت بررسی مال a است: اول b شمرده می‌شود.
    expect(nextAnalysisJob([aCounted, b])).toEqual({ key: b.key, countOnly: true });
    const bCounted = { ...b, analysis: { ...b.analysis, pageCount: 6 } };
    expect(nextAnalysisJob([aCounted, bCounted])).toEqual({ key: a.key, countOnly: false });
  });

  it('فایل تازه‌ای که تنها در صف است، مستقیم بررسی می‌شود', () => {
    const b = queued('b.pdf');
    expect(nextAnalysisJob([ready('a.pdf', 10), b])).toEqual({ key: b.key, countOnly: false });
  });
});

describe('نوبت آپلود', () => {
  const at8 = (name: string) => section(name, { phase: 'analyzing', pageCount: 40, analyzedCount: 8 });

  it('یکی در هر لحظه', () => {
    const uploading: UploadSnapshot = { phase: 'uploading', documentId: 'd', sentBytes: 0, totalBytes: 9 };
    expect(nextUpload([{ ...ready('a.pdf', 10), upload: uploading }, ready('b.pdf', 10)])).toBeNull();
    expect(nextUpload([{ ...ready('a.pdf', 10), upload: done('d') }, ready('b.pdf', 10)])).not.toBeNull();
  });

  it('مسیر سرور جلوتر، ولی بعد از شمارش همهٔ PDFها', () => {
    const pdf = ready('a.pdf', 10);
    const doc = word('b.docx', 12);
    expect(nextUpload([pdf, doc])).toBe(doc.key);
    expect(nextUpload([pdf, doc, queued('c.pdf')])).toBe(pdf.key);
  });

  it('PDF مسیر مرورگر بعد از اولین قیمت خودش', () => {
    expect(nextUpload([section('a.pdf', { phase: 'analyzing', pageCount: 40, analyzedCount: 7 })])).toBeNull();
    const a = at8('a.pdf');
    expect(nextUpload([a])).toBe(a.key);
  });

  it('فایل با خطای خودش آپلود نمی‌شود', () => {
    const broken = section('b.pdf', { phase: 'error', error: { code: 'corrupt_file', title: '', hint: '' } });
    expect(nextUpload([broken])).toBeNull();
    expect(jozveCounted([broken])).toBe(true);
  });
});
