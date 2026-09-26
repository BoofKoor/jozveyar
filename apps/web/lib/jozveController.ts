/**
 * صف جزوهٔ چندفایلی — کارگر تحلیل و آپلودگر را به نوبت اجرا می‌کند (ADR-030).
 *
 * تصمیم‌ها (کدام فایل نوبت کیست) خالص‌اند و در `jozve.ts`؛ این ماژول فقط اجرایشان می‌کند و
 * هر وابستگی به مرورگر (Worker، خواندن فایل، آپلودگر) را تزریقی می‌گیرد، تا کل صف بی
 * مرورگر تست شود. دو قاعدهٔ سخت:
 *  - **هر لحظه یک کار pdf.js:** یک کارگر برای کل صف، یک سند باز، یک فایل در حافظه.
 *  - **هر لحظه یک آپلود:** هم رم گوشی، هم سقف آپلود باز هر نشست.
 *
 * و قاعدهٔ محصول: هیچ شکستی صف را نمی‌ایستاند. فایلی که نشد پیامش را می‌گیرد و بقیه
 * ادامه می‌دهند.
 */

import type { DocumentAnalysis } from '@jozveyar/contracts';
import { DEFAULT_THRESHOLDS, MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import {
  ERROR_MESSAGES,
  MAX_PAGES_TO_ANALYZE,
  extensionOf,
  fileKind,
  type AnalyzeRequest,
  type WorkerResponse,
} from './analysis-protocol';
import { applyWorkerMessage, initialAnalysis, toServerPath, type AnalysisState } from './fileAnalysis';
import {
  moveSection,
  nextAnalysisJob,
  nextUpload,
  orderBatch,
  uploadActive,
  type RestoredFile,
  type Section,
} from './jozve';
import type { UploadHandle, UploadSnapshot } from './upload/client';

/** کارگر تحلیل از دید صف: فرستادن یک کار و بستن. */
export interface AnalysisWorkerPort {
  post(request: AnalyzeRequest): void;
  terminate(): void;
}

export interface JozveDeps {
  /** کارگر تازه؛ null یعنی ساخته نشد (مرورگر قدیمی، سیاست امنیتی) — بی‌صدا مسیر سرور. */
  createWorker(onMessage: (message: WorkerResponse) => void, onError: () => void): AnalysisWorkerPort | null;
  readFile(file: File): Promise<ArrayBuffer>;
  /** پیش‌فاکتور Word و پاورپوینت از فهرست zip؛ null یعنی «برآورد نداریم». */
  officePageCount(file: File, kind: 'docx' | 'pptx'): Promise<number | null>;
  startUpload(file: File, onChange: (snapshot: UploadSnapshot) => void): Promise<UploadHandle>;
  sendBrowserAnalysis(documentId: string, analysis: DocumentAnalysis): void;
  now(): number;
}

/**
 * سند فایلی که بعد از رفرش برگشت (۳د): بررسی سرورش تا نتیجه دنبال می‌شود، و `cancel({ discard })` آن را روی سرور
 * هم پاک می‌کند. دستگیره همین حالا برمی‌گردد، تا «حذف» پیش از رسیدن ماژول آپلودگر هم گم نشود. پیاده‌سازی‌اش با
 * خود برگشت می‌آید (`OrderDesk`)، نه در باندل اولیه.
 */
export type FollowDocument = (
  documentId: string,
  upload: UploadSnapshot | null,
  onChange: (snapshot: UploadSnapshot) => void,
) => Pick<UploadHandle, 'cancel'>;

/** فایل جزوه‌ای که بعد از رفرش برگشت (`restoredSection` در `lib/restore.ts`)، پیش از گرفتن کلید در صف. */
export type RestoredSection = Omit<Section, 'key' | 'file'> & { file: RestoredFile };

export interface JozveSnapshot {
  sections: readonly Section[];
  /** نام فایل‌هایی که از سقف جزوه بیشتر بودند و اضافه نشدند. */
  overflow: readonly string[];
}

export type Jozve = ReturnType<typeof createJozve>;

export function createJozve(deps: JozveDeps) {
  let snapshot: JozveSnapshot = { sections: [], overflow: [] };
  const listeners = new Set<() => void>();
  let keys = 0;
  let jobs = 0;
  let worker: AnalysisWorkerPort | null = null;
  /** کاری که الان در کارگر است — حداکثر یکی. */
  let inFlight: { job: number; key: string; startedAt: number } | null = null;
  const handles = new Map<string, Pick<UploadHandle, 'cancel'>>();
  const analysisSent = new Set<string>();
  let active = true;

  /* ── حالت ── */

  function commit(next: Partial<JozveSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }
  const find = (key: string) => snapshot.sections.find((s) => s.key === key);
  /** همان فایل هنوز همان‌جاست — نه حذف شده، نه جایگزین. */
  const current = (key: string, file: File | RestoredFile) => find(key)?.file === file;
  function patch(key: string, change: (section: Section) => Section) {
    commit({ sections: snapshot.sections.map((s) => (s.key === key ? change(s) : s)) });
  }
  const patchAnalysis = (key: string, change: (analysis: AnalysisState) => AnalysisState) =>
    patch(key, (s) => ({ ...s, analysis: change(s.analysis) }));

  function createSection(file: File): Section & { file: File } {
    keys += 1;
    return { key: `s${keys}`, file, kind: fileKind(file.name), analysis: initialAnalysis(file), upload: null };
  }

  /* ── تحلیل ── */

  function pumpAnalysis() {
    if (!active || inFlight) return;
    const next = nextAnalysisJob(snapshot.sections);
    if (!next) {
      // صف خالی: کارگر و هر چه pdf.js نگه داشته آزاد می‌شود.
      worker?.terminate();
      worker = null;
      return;
    }
    const { file } = find(next.key)!;
    // فقط فایلی که همین حالا دست مرورگر است در صف کارگر می‌آید؛ برگشته‌ها هرگز (`lib/restore.ts`).
    if (!(file instanceof File)) return;
    jobs += 1;
    const job = jobs;
    inFlight = { job, key: next.key, startedAt: deps.now() };
    // کارگر همین حالا، هم‌زمان با خواندن فایل، نه بعد از آن: بالا آمدنش (گرفتن اسکریپت و بار pdf.js)
    // طولانی‌ترین تکهٔ راه تا اولین قیمت است و به خود فایل بند نیست (docs/UI.md، ۴ب).
    worker ??= deps.createWorker(onWorkerMessage, onWorkerError);
    if (!worker) {
      finish(toServerPath);
      return;
    }
    if (!next.countOnly) patchAnalysis(next.key, (a) => ({ ...a, phase: 'reading' }));

    deps.readFile(file).then(
      (buffer) => {
        if (inFlight?.job !== job || !worker) return;
        worker.post({
          kind: 'analyze',
          job,
          countOnly: next.countOnly,
          buffer,
          thresholds: DEFAULT_THRESHOLDS,
          maxPagesToAnalyze: MAX_PAGES_TO_ANALYZE,
        });
      },
      () => {
        if (inFlight?.job === job) finish(toServerPath);
      },
    );
  }

  /** پایان کار جاری (با تغییر آخرش روی فایل) و نوبت بعدی. */
  function finish(change?: (analysis: AnalysisState) => AnalysisState) {
    const done = inFlight;
    inFlight = null;
    if (done && change) patchAnalysis(done.key, change);
    pump();
  }

  function onWorkerMessage(message: WorkerResponse) {
    if (!inFlight || message.job !== inFlight.job) return; // پاسخ دیررس کاری که لغو شد
    const { key, startedAt } = inFlight;
    patchAnalysis(key, (a) => applyWorkerMessage(a, message, deps.now() - startedAt));
    if (message.kind === 'done') sendAnalysis(key);
    if (message.kind === 'done' || message.kind === 'counted' || message.kind === 'error') finish();
    // صفحهٔ هشتم اولین قیمت این فایل است و آپلودش را آزاد می‌کند.
    else pumpUploads();
  }

  /** کارگر افتاد (خطای بیرون از کار): مرورگر کم آورد، پس بی‌صدا مسیر سرور. */
  function onWorkerError() {
    worker?.terminate();
    worker = null;
    finish((a) => ({ ...a, phase: 'error', error: { code: 'unknown', ...ERROR_MESSAGES.unknown } }));
  }

  /** کار این فایل اگر در کارگر است، همین حالا تمام می‌شود — کارگر با سندش بسته می‌شود. */
  function cancelAnalysis(key: string) {
    if (inFlight?.key !== key) return;
    inFlight = null;
    worker?.terminate();
    worker = null;
  }

  function estimateOffice(section: Section & { file: File }) {
    const ext = extensionOf(section.file.name);
    if (ext !== 'docx' && ext !== 'pptx') return; // doc و ppt قدیمی چنین فهرستی ندارند
    deps
      .officePageCount(section.file, ext)
      .then((pages) => {
        if (pages === null || !current(section.key, section.file)) return;
        patchAnalysis(section.key, (a) => ({ ...a, pageCount: pages, estimatedFrom: 'office' }));
        pump();
      })
      // بدون برآورد هم کار می‌کند: قیمت این فایل با عدد سرور می‌آید.
      .catch(() => undefined);
  }

  /* ── آپلود ── */

  function pumpUploads() {
    if (!active) return;
    const key = nextUpload(snapshot.sections);
    if (!key) return;
    const { file } = find(key)!;
    // برگشته‌ها (۳د) اینجا نمی‌رسند: مرورگر نخواندشان، پس نه قیمت مرورگر دارند و نه مسیر سرور.
    if (!(file instanceof File)) return;
    // «شروع شد» همین حالا ثبت می‌شود تا تا رسیدن ماژول آپلودگر، کس دیگری نوبت نگیرد.
    patch(key, (s) => ({ ...s, upload: { phase: 'starting', documentId: null, sentBytes: 0, totalBytes: file.size } }));

    deps
      .startUpload(file, (upload) => {
        if (!current(key, file)) return;
        patch(key, (s) => ({ ...s, upload }));
        sendAnalysis(key);
        if (!uploadActive(upload)) pumpUploads();
      })
      .then(
        (handle) => {
          if (active && current(key, file)) {
            handles.set(key, handle);
            return;
          }
          // فایل در همین فاصله کنار رفت: روی سرور هم پاک شود؛ رفتن از صفحه فقط متوقفش کند.
          void handle.cancel({ discard: active });
        },
        () => {
          // ماژول آپلودگر نیامد: مثل «در دسترس نیست» — بی‌صدا، و نوبت بعدی.
          if (current(key, file)) {
            patch(key, (s) => ({ ...s, upload: { ...s.upload!, phase: 'unavailable' } }));
          }
          pumpUploads();
        },
      );
  }

  /** فایل کنار رفت: آپلودش روی سرور هم لغو و دیسک آزاد می‌شود؛ `keep` فقط متوقفش می‌کند. */
  function discardUpload(key: string, keep?: boolean) {
    const handle = handles.get(key);
    handles.delete(key);
    if (handle) void handle.cancel({ discard: !keep });
  }


  /**
   * تحلیل مرورگر کنار تحلیل سرور ذخیره می‌شود (ADR-002) — یک بار، وقتی هم فایل رسیده و
   * هم تحلیل تمام شده، هر کدام اول تمام شود. برای سنجیدن اختلاف است، نه برای قیمت.
   */
  function sendAnalysis(key: string) {
    const section = find(key);
    const documentId = section?.upload?.phase === 'done' ? section.upload.documentId : null;
    const analysis = section?.analysis.analysis;
    if (!documentId || !analysis || analysisSent.has(documentId)) return;
    analysisSent.add(documentId);
    deps.sendBrowserAnalysis(documentId, analysis);
  }

  function pump() {
    pumpAnalysis();
    pumpUploads();
  }

  /* ── کارهای کاربر ── */

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * فایل‌های تازه ته جزوه، به ترتیب نام (`orderBatch`). بیش از سقف اضافه نمی‌شود و
     * نامشان در `overflow` می‌ماند تا کاربر بداند.
     */
    add(files: readonly File[]) {
      const room = Math.max(0, MAX_SECTIONS_PER_ITEM - snapshot.sections.length);
      const ordered = orderBatch(files);
      const fresh = ordered.slice(0, room).map(createSection);
      commit({
        sections: [...snapshot.sections, ...fresh],
        overflow: ordered.slice(room).map((file) => file.name),
      });
      fresh.forEach(estimateOffice);
      pump();
    },

    /** یکی بالاتر یا پایین‌تر. فقط ترتیب صحافی عوض می‌شود؛ قیمت همان است. */
    move(key: string, delta: -1 | 1) {
      commit({ sections: moveSection(snapshot.sections, key, delta) });
    },

    remove(key: string) {
      if (!find(key)) return;
      cancelAnalysis(key);
      discardUpload(key);
      commit({ sections: snapshot.sections.filter((s) => s.key !== key), overflow: [] });
      pump();
    },

    /**
     * فایل تازه همان‌جای جزوه — راه جلوی تقریباً هر شکست: «خروجی PDF بگیر و جایش بگذار». `keep`: همان فایلی که
     * جزوهٔ برگشته بعد از رفرش منتظرش بود (۳د)؛ سندش روی سرور می‌ماند تا آپلود از همان تکه ادامه دهد (ADR-024).
     */
    replace(key: string, file: File, keep?: boolean) {
      if (!find(key)) return;
      cancelAnalysis(key);
      discardUpload(key, keep);
      const fresh = createSection(file);
      commit({ sections: snapshot.sections.map((s) => (s.key === key ? fresh : s)) });
      estimateOffice(fresh);
      pump();
    },

    /**
     * جزوه‌ای که بعد از رفرش برگشت (۳د، ADR-036): همان فایل‌ها به همان ترتیب، هر کدام با آنچه سرور درباره‌اش
     * گفت (`lib/restore.ts`). هیچ‌کدام به کارگر تحلیل یا آپلودگر نمی‌رود: یا روی سرور است، یا منتظر همان فایل.
     */
    restore(restored: readonly RestoredSection[], follow: FollowDocument) {
      // کاربر در همین فاصله فایل تازه‌ای انداخت: جزوهٔ تازه‌اش می‌ماند.
      if (snapshot.sections.length > 0) return;
      const fresh = restored.map((section) => ({ ...section, key: `s${(keys += 1)}` }));
      commit({ sections: fresh, overflow: [] });
      // سند روی سرور، مثل آپلود زنده: پیگیری تا پایان بررسی سرور، و با «حذف» یا «از اول» پاک.
      for (const { key, file, upload } of fresh) {
        if (file.documentId) {
          handles.set(
            key,
            follow(file.documentId, upload, (next) => {
              if (current(key, file)) patch(key, (s) => ({ ...s, upload: next }));
            }),
          );
        }
      }
      pump();
    },

    /** همه کنار رفتند: کارگر بسته و آپلودها روی سرور هم پاک می‌شوند. */
    reset() {
      for (const section of snapshot.sections) {
        cancelAnalysis(section.key);
        discardUpload(section.key);
      }
      worker?.terminate();
      worker = null;
      commit({ sections: [], overflow: [] });
    },

    /** صفحه دوباره سوار شد (React در حالت سخت‌گیر دو بار سوار و پیاده می‌کند). */
    resume() {
      active = true;
      pump();
    },

    /**
     * رفتن از صفحه: کارگر بسته و آپلودها فقط متوقف می‌شوند — سند می‌ماند تا انداختن
     * دوبارهٔ همان فایل از همان تکه ادامه دهد.
     */
    dispose() {
      active = false;
      inFlight = null;
      worker?.terminate();
      worker = null;
      for (const handle of handles.values()) void handle.cancel();
      handles.clear();
    },
  };
}
