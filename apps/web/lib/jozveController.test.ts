/**
 * صف جزوه با کارگر و آپلودگر ساختگی: هر لحظه یک کار pdf.js و یک آپلود، شمارش پیش از
 * بررسی، مسیر سرور جلوتر، و هیچ شکستی صف را نمی‌ایستاند (ADR-030).
 */

import { describe, expect, it } from 'vitest';
import type { DocumentAnalysis, PageAnalysis } from '@jozveyar/contracts';
import { DEFAULT_THRESHOLDS } from '@jozveyar/contracts/constants';

import type { WorkerResponse } from './analysis-protocol';
import { jozveView } from './jozveView';
import { createJozve, type JozveDeps } from './jozveController';
import type { UploadHandle, UploadSnapshot } from './upload/client';

type Outcome = number | 'corrupt' | 'hang';

function page(n: number): PageAnalysis {
  return {
    n, widthPt: 595, heightPt: 842, rotation: 0, color: false, colorRatio: 0, coloredInkRatio: 0,
    chromaP95: 0, paperCast: [255, 255, 255], inkRatio: 0.1, blank: false, estimatedDpi: null,
    minMarginMm: 20, warnings: [],
  };
}

function analysis(pageCount: number): DocumentAnalysis {
  return {
    engine: 'test', thresholds: DEFAULT_THRESHOLDS, pageCount, pages: Array.from({ length: pageCount }, (_, i) => page(i + 1)),
    sampled: false, sampleStride: 1, elapsedMs: 1,
  };
}

class FakeUpload {
  cancelled: { discard: boolean } | null = null;
  readonly id: string;
  constructor(readonly file: File, private readonly onChange: (s: UploadSnapshot) => void) {
    this.id = `doc-${file.name}`;
  }
  readonly handle: UploadHandle = {
    done: new Promise(() => undefined),
    cancel: async (options) => {
      this.cancelled = { discard: Boolean(options?.discard) };
    },
  };
  finish(serverPages?: number) {
    this.onChange({
      phase: 'done', documentId: this.id, sentBytes: this.file.size, totalBytes: this.file.size,
      ...(serverPages ? { analysis: { state: 'ready' as const, pageCount: serverPages } } : {}),
    });
  }
  refuse() {
    this.onChange({ phase: 'unavailable', documentId: null, sentBytes: 0, totalBytes: this.file.size, reason: 'storage_unavailable' });
  }
}

function harness(outcomes: Record<string, Outcome>, options: { office?: Record<string, number>; noWorker?: boolean } = {}) {
  const log: string[] = [];
  const uploads: FakeUpload[] = [];
  const sent: string[] = [];
  const names = new WeakMap<ArrayBuffer, string>();
  let open = 0;
  let maxOpen = 0;
  let alive = 0;
  let maxAlive = 0;
  let workersCreated = 0;
  let activeUploads = 0;
  let maxActiveUploads = 0;

  const deps: JozveDeps = {
    createWorker(onMessage: (m: WorkerResponse) => void) {
      if (options.noWorker) return null;
      workersCreated += 1;
      alive += 1;
      maxAlive = Math.max(maxAlive, alive);
      let dead = false;
      return {
        post(request) {
          open += 1;
          maxOpen = Math.max(maxOpen, open);
          const name = names.get(request.buffer)!;
          log.push(`${request.countOnly ? 'count' : 'full'} ${name}`);
          const outcome = outcomes[name] ?? 1;
          if (outcome === 'hang') return;
          // مثل کارگر واقعی، پاسخ در نوبت بعدی حلقهٔ رویداد: کار واقعاً «در راه» می‌ماند.
          setTimeout(() => {
            if (dead) return;
            const { job } = request;
            if (outcome === 'corrupt') {
              open -= 1;
              onMessage({ kind: 'error', job, code: 'corrupt_file', message: '' });
            } else if (request.countOnly) {
              open -= 1;
              onMessage({ kind: 'counted', job, pageCount: outcome });
            } else {
              onMessage({ kind: 'meta', job, pageCount: outcome, sampleStride: 1 });
              for (let n = 1; n <= outcome; n += 1) onMessage({ kind: 'page', job, page: page(n), analyzedCount: n });
              open -= 1;
              onMessage({ kind: 'done', job, analysis: analysis(outcome) });
            }
          }, 0);
        },
        terminate() {
          if (dead) return;
          dead = true;
          alive -= 1;
          open = 0;
        },
      };
    },
    async readFile(file) {
      const buffer = new ArrayBuffer(1);
      names.set(buffer, file.name);
      return buffer;
    },
    officePageCount: async (file) => options.office?.[file.name] ?? null,
    async startUpload(file, onChange) {
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      const upload = new FakeUpload(file, (snapshot) => {
        if (snapshot.phase === 'done' || snapshot.phase === 'unavailable' || snapshot.phase === 'failed') activeUploads -= 1;
        onChange(snapshot);
      });
      uploads.push(upload);
      log.push(`upload ${file.name}`);
      return upload.handle;
    },
    sendBrowserAnalysis: (documentId) => sent.push(documentId),
    now: () => 0,
  };

  const jozve = createJozve(deps);
  return {
    jozve,
    log,
    uploads,
    sent,
    upload: (name: string) => uploads.find((u) => u.file.name === name)!,
    get stats() {
      return { maxOpen, alive, maxAlive, workersCreated, maxActiveUploads };
    },
    view: () => jozveView(jozve.getSnapshot().sections),
    names: () => jozve.getSnapshot().sections.map((s) => s.file.name),
  };
}

const files = (...names: string[]) => names.map((name) => new File(['%PDF'], name));

/** همهٔ کارهای ریز (خواندن فایل، پاسخ کارگر، import) تا آرام شدن صف. */
async function settle() {
  for (let i = 0; i < 60; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('صف کارگر تحلیل', () => {
  it('تک‌فایل: مستقیم بررسی کامل، و کارگر بعدش بسته می‌شود', async () => {
    const h = harness({ 'a.pdf': 10 });
    h.jozve.add(files('a.pdf'));
    await settle();
    expect(h.log).toEqual(['full a.pdf', 'upload a.pdf']);
    expect(h.view().pageCount).toBe(10);
    expect(h.stats.alive).toBe(0);
  });

  it('سه PDF: اول سه شمارش، بعد سه بررسی — هرگز دو کار با هم، یک کارگر برای کل صف', async () => {
    // پیش‌فاکتور Word وسط صف می‌رسد و صف را دوباره تکان می‌دهد؛ ترتیب کارها همان می‌ماند.
    // (نگهبان «یک کار در هر لحظه» را دو تست فایلِ گیرکرده پایین‌تر می‌سنجند.)
    const h = harness({ 'a.pdf': 10, 'b.pdf': 6, 'c.pdf': 10 }, { office: { 'd.docx': 5 } });
    h.jozve.add([...files('c.pdf', 'a.pdf', 'b.pdf'), new File(['PK'], 'd.docx')]);
    await settle();
    expect(h.log.filter((l) => !l.startsWith('upload'))).toEqual([
      'count a.pdf', 'count b.pdf', 'count c.pdf', 'full a.pdf', 'full b.pdf', 'full c.pdf',
    ]);
    expect(h.stats).toMatchObject({ maxOpen: 1, maxAlive: 1, workersCreated: 1, alive: 0 });
    expect(h.view()).toMatchObject({ pageCount: 31 });
    expect(h.names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'd.docx']);
  });

  it('PDF خراب وسط دو فایل: بقیه ادامه می‌دهند، و خودش نه قیمت دارد نه آپلود', async () => {
    const h = harness({ 'a.pdf': 10, 'b.pdf': 'corrupt', 'c.pdf': 6 });
    h.jozve.add(files('a.pdf', 'b.pdf', 'c.pdf'));
    await settle();
    const view = h.view();
    expect(view.pageCount).toBe(16);
    expect(view.blocked.map((v) => v.name)).toEqual(['b.pdf']);
    expect(h.log.filter((l) => l.startsWith('upload'))).toEqual(['upload a.pdf']);
    h.upload('a.pdf').finish();
    await settle();
    expect(h.log.filter((l) => l.startsWith('upload'))).toEqual(['upload a.pdf', 'upload c.pdf']);
  });

  it('حذف فایلی که الان در کارگر است: کارگر با سندش بسته می‌شود و صف ادامه می‌دهد', async () => {
    const h = harness({ 'a.pdf': 'hang', 'b.pdf': 6 });
    h.jozve.add(files('a.pdf'));
    await settle();
    h.jozve.add(files('b.pdf'));
    await settle();
    expect(h.log).toEqual(['full a.pdf']);
    const a = h.jozve.getSnapshot().sections[0]!;
    h.jozve.remove(a.key);
    await settle();
    expect(h.log).toEqual(['full a.pdf', 'full b.pdf', 'upload b.pdf']);
    expect(h.names()).toEqual(['b.pdf']);
    expect(h.stats).toMatchObject({ maxAlive: 1, workersCreated: 2, alive: 0 });
  });

  it('کارگر ساخته نشد: بی‌صدا مسیر سرور، نه بن‌بست', async () => {
    const h = harness({ 'a.pdf': 10 }, { noWorker: true });
    h.jozve.add(files('a.pdf'));
    await settle();
    const [a] = h.view().sections;
    expect(a).toMatchObject({ serverPath: true, blocked: null });
    expect(h.log).toEqual(['upload a.pdf']);
  });
});

describe('صف آپلود', () => {
  it('پشت‌سرهم، و فایلی که قیمت قطعی‌اش به سرور بند است جلوتر', async () => {
    const h = harness({ 'a.pdf': 10, 'c.pdf': 10 }, { office: { 'b.docx': 12 } });
    h.jozve.add([...files('a.pdf'), new File(['PK'], 'b.docx'), ...files('c.pdf')]);
    await settle();
    expect(h.log.filter((l) => l.startsWith('upload'))).toEqual(['upload b.docx']);
    expect(h.view().pageCount).toBe(32);

    h.upload('b.docx').finish(6);
    await settle();
    h.upload('a.pdf').finish();
    await settle();
    h.upload('c.pdf').finish();
    await settle();
    expect(h.log.filter((l) => l.startsWith('upload'))).toEqual(['upload b.docx', 'upload a.pdf', 'upload c.pdf']);
    expect(h.stats.maxActiveUploads).toBe(1);
    // سرور منبع حقیقت است: Word شش صفحه شد، جزوه ۲۶.
    expect(h.view()).toMatchObject({ pageCount: 26, provisional: false });
  });

  it('آپلود ردشده صف را نمی‌ایستاند', async () => {
    const h = harness({ 'a.pdf': 10, 'b.pdf': 6 });
    h.jozve.add(files('a.pdf', 'b.pdf'));
    await settle();
    h.upload('a.pdf').refuse();
    await settle();
    expect(h.log.filter((l) => l.startsWith('upload'))).toEqual(['upload a.pdf', 'upload b.pdf']);
    // قیمت PDF از مرورگر است؛ رد آپلود بی‌صداست.
    expect(h.view()).toMatchObject({ pageCount: 16, blocked: [] });
  });

  it('تحلیل مرورگر برای هر سند یک بار فرستاده می‌شود', async () => {
    const h = harness({ 'a.pdf': 10 });
    h.jozve.add(files('a.pdf'));
    await settle();
    h.upload('a.pdf').finish();
    h.upload('a.pdf').finish(10);
    await settle();
    expect(h.sent).toEqual(['doc-a.pdf']);
  });
});

describe('کارهای کاربر', () => {
  it('جایگزینی همان‌جای جزوه می‌نشیند و آپلود قبلی روی سرور هم پاک می‌شود', async () => {
    const h = harness({ 'a.pdf': 10, 'b.pdf': 'corrupt', 'c.pdf': 6, 'd.pdf': 4 });
    h.jozve.add(files('a.pdf', 'b.pdf', 'c.pdf'));
    await settle();
    const b = h.jozve.getSnapshot().sections[1]!;
    const a = h.jozve.getSnapshot().sections[0]!;
    h.jozve.replace(b.key, files('d.pdf')[0]!);
    h.jozve.replace(a.key, files('a.pdf')[0]!);
    await settle();
    expect(h.names()).toEqual(['a.pdf', 'd.pdf', 'c.pdf']);
    expect(h.view()).toMatchObject({ pageCount: 20, blocked: [] });
    expect(h.uploads[0]!.cancelled).toEqual({ discard: true });
  });

  it('جابه‌جایی فقط ترتیب است، قیمت همان', async () => {
    const h = harness({ 'a.pdf': 10, 'b.pdf': 6 });
    h.jozve.add(files('a.pdf', 'b.pdf'));
    await settle();
    const [, b] = h.jozve.getSnapshot().sections;
    h.jozve.move(b!.key, -1);
    expect(h.names()).toEqual(['b.pdf', 'a.pdf']);
    expect(h.view().pageCount).toBe(16);
  });

  it('بیش از سی فایل اضافه نمی‌شود، و نام بقیه گفته می‌شود', () => {
    const h = harness({});
    h.jozve.add(files(...Array.from({ length: 31 }, (_, i) => `f${String(i + 1).padStart(2, '0')}.pdf`)));
    expect(h.jozve.getSnapshot().sections).toHaveLength(30);
    expect(h.jozve.getSnapshot().overflow).toEqual(['f31.pdf']);
  });

  it('از اول: آپلودها روی سرور هم پاک و کارگر بسته می‌شود', async () => {
    const h = harness({ 'a.pdf': 'hang', 'b.docx': 1 }, { office: { 'b.docx': 3 } });
    h.jozve.add([...files('a.pdf'), new File(['PK'], 'b.docx')]);
    await settle();
    h.jozve.reset();
    expect(h.jozve.getSnapshot().sections).toEqual([]);
    expect(h.stats.alive).toBe(0);
  });
});
