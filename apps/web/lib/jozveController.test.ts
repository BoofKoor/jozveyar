/**
 * صف جزوه با کارگر و آپلودگر ساختگی: هر لحظه یک کار pdf.js و یک آپلود، شمارش پیش از
 * بررسی، مسیر سرور جلوتر، و هیچ شکستی صف را نمی‌ایستاند (ADR-030).
 */

import { describe, expect, it } from 'vitest';
import type { DocumentAnalysis, PageAnalysis } from '@jozveyar/contracts';
import { DEFAULT_THRESHOLDS } from '@jozveyar/contracts/constants';

import type { WorkerResponse } from './analysis-protocol';
import { orderGate } from './checkout/gate';
import type { DraftFile } from './draft';
import { restoredSection, type DocumentStatus } from './restore';
import { jozveView, matchAwaited } from './jozveView';
import { createJozve, type FollowDocument, type JozveDeps } from './jozveController';
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

/** پیگیری سند فایلی که بعد از رفرش برگشت (۳د): تست خودش پایان بررسی سرور را می‌رساند. */
class FakeFollow {
  cancelled: { discard: boolean } | null = null;
  constructor(
    readonly documentId: string,
    readonly upload: UploadSnapshot | null,
    private readonly onChange: (s: UploadSnapshot) => void,
  ) {}
  readonly handle = {
    cancel: async (options?: { discard?: boolean }) => {
      this.cancelled = { discard: Boolean(options?.discard) };
    },
  };
  ready(pageCount: number) {
    this.onChange({ ...this.upload!, analysis: { state: 'ready', pageCount } });
  }
}

function harness(outcomes: Record<string, Outcome>, options: { office?: Record<string, number>; noWorker?: boolean } = {}) {
  const log: string[] = [];
  const uploads: FakeUpload[] = [];
  const follows: FakeFollow[] = [];
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
  const follow: FollowDocument = (documentId, upload, onChange) => {
    const fake = new FakeFollow(documentId, upload, onChange);
    follows.push(fake);
    log.push(`follow ${documentId}`);
    return fake.handle;
  };
  return {
    restore: (sections: Parameters<typeof jozve.restore>[0]) => jozve.restore(sections, follow),
    jozve,
    log,
    uploads,
    follows,
    sent,
    upload: (name: string) => uploads.find((u) => u.file.name === name)!,
    follow: (documentId: string) => follows.find((f) => f.documentId === documentId)!,
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

describe('جزوهٔ برگشته بعد از رفرش (۳د)', () => {
  /** همان فایلی که کاربر پیش از رفرش انداخته بود: نام، حجم و تاریخ تغییرش همان است. */
  const disk = (name: string, lastModified = 1_700_000_000_000) => new File(['%PDF'], name, { lastModified });
  const DOC = { a: 'a0000000-0000-4000-8000-000000000001', b: 'b0000000-0000-4000-8000-000000000002', c: 'c0000000-0000-4000-8000-000000000003' };
  const draftFile = (name: string, documentId: string | null): DraftFile => ({ name, size: 4, lastModified: 1_700_000_000_000, documentId });
  const arrived = (pageCount?: number): DocumentStatus => ({
    kind: 'arrived',
    analysis: pageCount ? { state: 'ready', pageCount } : { state: 'running' },
  });
  const onServer = (name: string, id: string, pageCount?: number) => restoredSection(draftFile(name, id), arrived(pageCount));
  const partial = (name: string, id: string) => restoredSection(draftFile(name, id), { kind: 'partial' });
  const never = (name: string) => restoredSection(draftFile(name, null), null);
  const INITIAL = { colorMode: 'bw', sidesMode: 'double', bindingTypeId: 'spiral_clear', paperTypeId: 'tahrir80', copies: 1 } as const;

  it('فایل روی سرور: عدد از سرور، بی کارگر تحلیل و بی آپلود؛ بررسی نیمه‌کارهٔ سرور تا نتیجه دنبال می‌شود', async () => {
    const h = harness({});
    h.restore([onServer('a.pdf', DOC.a, 10), onServer('b.docx', DOC.b)]);
    await settle();
    expect(h.log).toEqual([`follow ${DOC.a}`, `follow ${DOC.b}`]);
    expect(h.stats.workersCreated).toBe(0);
    expect(h.view()).toMatchObject({ pageCount: 10, provisional: true, waiting: [] });
    expect(h.view().pending.map((v) => v.name)).toEqual(['b.docx']);
    expect(orderGate(h.view(), INITIAL).kind).toBe('sending');

    h.follow(DOC.b).ready(6);
    await settle();
    expect(h.view()).toMatchObject({ pageCount: 16, provisional: false });
    const gate = orderGate(h.view(), INITIAL);
    expect(gate.kind === 'ready' && gate.items[0]!.documentIds).toEqual([DOC.a, DOC.b]);
  });

  it('فایلی که نرسیده بود منتظر همان فایل است: نه قیمت، نه سفارش، نه کارگر، نه آپلود', async () => {
    const h = harness({ 'b.pdf': 6 });
    h.restore([onServer('a.pdf', DOC.a, 10), never('b.pdf')]);
    await settle();
    const view = h.view();
    expect(view.waiting.map((v) => v.name)).toEqual(['b.pdf']);
    expect(view).toMatchObject({ pageCount: 10, provisional: true, blocked: [], pending: [] });
    expect(orderGate(view, INITIAL).kind).toBe('waiting');
    expect(h.log).toEqual([`follow ${DOC.a}`]);
  });

  it('همان فایل: سند نیمه‌کاره روی سرور می‌ماند تا آپلود از همان تکه ادامه دهد، و قیمت مرورگر فوری برمی‌گردد', async () => {
    const h = harness({ 'a.pdf': 10 });
    h.restore([partial('a.pdf', DOC.a)]);
    await settle();
    const [a] = h.jozve.getSnapshot().sections;
    const { resumed } = matchAwaited(h.jozve.getSnapshot().sections, [disk('a.pdf')]);
    expect(resumed.map((r) => r.key)).toEqual([a!.key]);
    h.jozve.replace(a!.key, resumed[0]!.file, true);
    await settle();
    expect(h.follow(DOC.a).cancelled).toEqual({ discard: false });
    expect(h.log).toEqual([`follow ${DOC.a}`, 'full a.pdf', 'upload a.pdf']);
    expect(h.view()).toMatchObject({ pageCount: 10, waiting: [] });
  });

  it('فایل دیگر به جای فایل منتظر: جایگزینی، و سند نیمه‌کارهٔ قبلی روی سرور پاک می‌شود', async () => {
    const h = harness({ 'a.pdf': 10 });
    h.restore([partial('a.pdf', DOC.a)]);
    await settle();
    const [a] = h.jozve.getSnapshot().sections;
    // همان نام، تاریخ تغییر دیگر: فایل دیگری است
    const other = disk('a.pdf', 1_700_000_999_999);
    expect(matchAwaited(h.jozve.getSnapshot().sections, [other]).resumed).toEqual([]);
    h.jozve.replace(a!.key, other);
    await settle();
    expect(h.follow(DOC.a).cancelled).toEqual({ discard: true });
  });

  it('همهٔ فایل‌ها یک‌جا با «افزودن فایل»: هر کدام سر جای خودش، و فایل تازه ته جزوه', async () => {
    const h = harness({ 'a.pdf': 10, 'c.pdf': 6, 'x.pdf': 2 });
    h.restore([never('a.pdf'), onServer('b.pdf', DOC.b, 4), never('c.pdf')]);
    await settle();
    // همان کاری که «افزودن فایل» رابط می‌کند (`OrderDesk`)
    const { resumed, rest } = matchAwaited(h.jozve.getSnapshot().sections, [disk('x.pdf'), disk('c.pdf'), disk('a.pdf')]);
    expect(rest.map((f) => f.name)).toEqual(['x.pdf']);
    for (const { key, file } of resumed) h.jozve.replace(key, file, true);
    h.jozve.add(rest);
    await settle();
    expect(h.names()).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'x.pdf']);
    expect(h.view()).toMatchObject({ pageCount: 22, waiting: [] });
  });

  it('حذف و «از اول» سند روی سرور را هم پاک می‌کنند؛ رفتن از صفحه فقط پیگیری را می‌ایستاند', async () => {
    const h = harness({});
    h.restore([onServer('a.pdf', DOC.a, 10), partial('b.pdf', DOC.b), onServer('c.pdf', DOC.c)]);
    await settle();
    h.jozve.remove(h.jozve.getSnapshot().sections[0]!.key);
    await settle();
    expect(h.follow(DOC.a).cancelled).toEqual({ discard: true });
    h.jozve.dispose();
    expect(h.follow(DOC.c).cancelled).toEqual({ discard: false });
    h.jozve.resume();
    h.jozve.reset();
    await settle();
    // `dispose` دستگیره‌ها را رها کرده بود؛ «از اول» بعدش چیزی دو بار پاک نمی‌کند.
    expect(h.follow(DOC.b).cancelled).toEqual({ discard: false });
  });

  it('فایل تازه‌ای که پیش از رسیدن جزوهٔ برگشته انداخته شد می‌ماند', async () => {
    const h = harness({ 'n.pdf': 3 });
    h.jozve.add([disk('n.pdf')]);
    h.restore([onServer('a.pdf', DOC.a, 10)]);
    await settle();
    expect(h.names()).toEqual(['n.pdf']);
    expect(h.follows).toEqual([]);
  });
});
