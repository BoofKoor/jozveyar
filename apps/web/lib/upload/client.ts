/**
 * آپلودگر مرورگر — تکه‌تکه، مستقیم به استوریج، قابل ادامه (ADR-024).
 *
 * این ماژول فقط با اولین فایل بارگذاری می‌شود (import پویا)، پس به باندل
 * اولیه نمی‌خورد. هر وابستگی به محیط مرورگر (fetch، localStorage، رویداد
 * online) تزریق می‌شود تا کل منطق صف و تلاش دوباره بدون مرورگر تست شود.
 *
 * قاعدهٔ محصول اینجا هم برقرار است: **بن‌بست نداریم.** آپلود هیچ‌وقت جلوی
 * قیمت را نمی‌گیرد. اگر سرور بگوید استوریج نیست، آپلودگر بی‌صدا کنار می‌کشد.
 */

import { partRange, partSize, planParts, type PartPlan } from '@jozveyar/storage/multipart';
import type { ServerAnalysisView } from '../server/uploads';

export type UploadPhase =
  | 'starting'
  | 'uploading'
  /** شبکه قطع است؛ با برگشتنش از همان تکه ادامه می‌دهد. */
  | 'offline'
  | 'done'
  /** سرور آپلود نمی‌پذیرد (پیکربندی نشده، دیسک پر). بی‌صدا. */
  | 'unavailable'
  | 'failed';

export interface UploadSnapshot {
  phase: UploadPhase;
  documentId: string | null;
  sentBytes: number;
  totalBytes: number;
  /**
   * تحلیل سرور بعد از رسیدن فایل (برای Word و عکس: اول تبدیل). آپلودگر تا
   * `ready` یا `failed` دنبالش می‌کند؛ سرور منبع حقیقت قیمت است.
   */
  analysis?: ServerAnalysisView;
  /** چرا `unavailable`: کد خطای API، مثلاً `too_large` یا `unsupported_type`. */
  reason?: string;
}

export interface UploadFile {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  slice(start: number, end: number): Blob;
}

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface UploaderDeps {
  fetch: typeof fetch;
  /** برای ادامه بعد از رفرش. null یعنی بدون ادامه (حالت خصوصی مرورگر). */
  storage: KeyValueStore | null;
  isOnline: () => boolean;
  /** وقتی شبکه برگردد resolve می‌شود. */
  waitForOnline: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  /** تکه‌های هم‌زمان. سه، چون روی لینک موبایل بیشتر فقط سهم هر کدام را نازک می‌کند. */
  concurrency?: number;
  /** تلاش هر تکه قبل از دست کشیدن، وقتی شبکه وصل است. */
  maxAttempts?: number;
  /** فاصلهٔ پرسیدن وضعیت تحلیل سرور. */
  analysisPollMs?: number;
  /** چقدر دنبال تحلیل سرور بماند. پیش‌فرض ۲۵ دقیقه؛ صفر یعنی دنبال نکن. */
  analysisWatchMs?: number;
}

interface ServerStatus {
  documentId: string;
  status: 'uploading' | 'uploaded' | 'failed';
  partSizeBytes: number;
  partCount: number;
  receivedParts: number[];
  analysis?: ServerAnalysisView;
}

/** بیش از این دنبال تحلیل سرور نمی‌گردد — سقف زمانی کارگر: تبدیل دو بار ۵ دقیقه، تحلیل ۲۰. */
const ANALYSIS_WATCH_MS = 35 * 60 * 1000;

const API = '/api/uploads';
const RESUME_PREFIX = 'jy.upload.';
/** URL امضاشده‌ای که کمتر از این مانده، تازه می‌شود. */
const URL_REFRESH_MARGIN_MS = 60_000;
const URL_BATCH = 20;

/**
 * اثر انگشت فایل برای ادامه بعد از رفرش. مرورگر اجازه نمی‌دهد صفحه خودش
 * فایل را دوباره باز کند؛ وقتی کاربر همان فایل را دوباره انداخت، از همین
 * اثر شناخته می‌شود.
 */
export function fingerprint(file: UploadFile): string {
  return `${RESUME_PREFIX}${file.size}:${file.lastModified}:${file.name}`;
}

class Stopped extends Error {}

export interface UploadHandle {
  done: Promise<UploadSnapshot>;
  /** توقف. با `discard` سند و تکه‌ها روی سرور هم پاک می‌شوند. */
  cancel(options?: { discard?: boolean }): Promise<void>;
}

export function startUpload(
  file: UploadFile,
  onChange: (snapshot: UploadSnapshot) => void,
  deps: UploaderDeps,
): UploadHandle {
  const concurrency = deps.concurrency ?? 3;
  const maxAttempts = deps.maxAttempts ?? 8;
  const controller = new AbortController();
  const key = fingerprint(file);

  const snapshot: UploadSnapshot = {
    phase: 'starting',
    documentId: null,
    sentBytes: 0,
    totalBytes: file.size,
  };
  const emit = (patch: Partial<UploadSnapshot>) => {
    Object.assign(snapshot, patch);
    onChange({ ...snapshot });
  };

  const api = async (path: string, init: RequestInit = {}) => {
    if (controller.signal.aborted) throw new Stopped();
    return deps.fetch(`${API}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      signal: controller.signal,
    });
  };

  const remember = (id: string) => {
    try {
      deps.storage?.setItem(key, id);
    } catch {
      // بدون ادامه هم کار می‌کند.
    }
  };
  const forget = () => {
    try {
      deps.storage?.removeItem(key);
    } catch {
      // همان.
    }
  };

  /** کد خطای آخرین درخواستی که سرور نپذیرفت. */
  let refusal: string | undefined;

  async function resumeOrCreate(): Promise<ServerStatus | null> {
    let previous: string | null = null;
    try {
      previous = deps.storage?.getItem(key) ?? null;
    } catch {
      previous = null;
    }
    if (previous) {
      const response = await api(`/${encodeURIComponent(previous)}`);
      if (response.ok) {
        const status = (await response.json()) as ServerStatus;
        if (status.status !== 'failed') return status;
      }
      forget();
    }

    const response = await api('', {
      method: 'POST',
      body: JSON.stringify({ name: file.name, sizeBytes: file.size, mimeType: file.type }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      refusal = body.error;
      return null;
    }
    const created = (await response.json()) as ServerStatus;
    remember(created.documentId);
    return created;
  }

  /** یک دور فرستادن تکه‌های `pending` با چند کارگر هم‌زمان. */
  async function sendParts(id: string, plan: PartPlan, pending: number[]) {
    const urls = new Map<number, { url: string; expiresAt: number }>();
    const queue = [...pending];

    async function urlFor(n: number): Promise<string> {
      const cached = urls.get(n);
      if (cached && cached.expiresAt - Date.now() > URL_REFRESH_MARGIN_MS) return cached.url;
      // دسته‌ای: همین تکه به‌علاوهٔ چند تکهٔ بعدی صف.
      const batch = [n, ...queue.filter((m) => !urls.has(m)).slice(0, URL_BATCH - 1)];
      const response = await api(`/${id}/parts`, {
        method: 'POST',
        body: JSON.stringify({ partNumbers: batch }),
      });
      if (!response.ok) throw new Error(`parts ${response.status}`);
      const body = (await response.json()) as {
        urls: { partNumber: number; url: string }[];
        expiresInSeconds: number;
      };
      const expiresAt = Date.now() + body.expiresInSeconds * 1000;
      for (const u of body.urls) urls.set(u.partNumber, { url: u.url, expiresAt });
      return urls.get(n)!.url;
    }

    async function sendOne(n: number) {
      const { start, end } = partRange(plan, n);
      for (let attempt = 1; ; attempt += 1) {
        if (controller.signal.aborted) throw new Stopped();
        if (!deps.isOnline()) {
          emit({ phase: 'offline' });
          await deps.waitForOnline();
          emit({ phase: 'uploading' });
        }
        try {
          const response = await deps.fetch(await urlFor(n), {
            method: 'PUT',
            body: file.slice(start, end),
            signal: controller.signal,
          });
          // بدنهٔ پاسخ خوانده می‌شود تا اتصال برای تکهٔ بعد آزاد شود؛ بدنهٔ
          // نخوانده را مرورگر قطع می‌کند و اتصال دوباره‌کاری نمی‌شود.
          await response.arrayBuffer().catch(() => undefined);
          if (response.ok) {
            emit({ sentBytes: snapshot.sentBytes + (end - start) });
            return;
          }
          // ۴۰۳ یعنی معمولاً URL کهنه؛ تلاش بعدی URL تازه می‌گیرد.
          if (response.status === 403) urls.delete(n);
          throw new Error(`put ${response.status}`);
        } catch (error) {
          if (controller.signal.aborted) throw new Stopped();
          // قطع شبکه تلاش نمی‌سوزاند؛ فقط خطای «با شبکهٔ وصل» شمرده می‌شود.
          if (!deps.isOnline()) continue;
          if (attempt >= maxAttempts) throw error;
          await deps.sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        for (let n = queue.shift(); n !== undefined; n = queue.shift()) await sendOne(n);
      }),
    );
  }

  /**
   * بعد از رسیدن فایل، وضعیت تحلیل سرور تا نتیجه. پشت done نیست: قیمت
   * مرورگر همان لحظه معتبر است و این فقط هم‌ترازش می‌کند.
   */
  async function watchAnalysis(id: string, first?: ServerAnalysisView) {
    if (first) emit({ analysis: first });
    const pollMs = deps.analysisPollMs ?? 2000;
    const deadline = Date.now() + (deps.analysisWatchMs ?? ANALYSIS_WATCH_MS);
    let state = first?.state;
    while (state !== 'ready' && state !== 'failed' && Date.now() < deadline) {
      await deps.sleep(pollMs);
      if (controller.signal.aborted) return;
      try {
        const response = await api(`/${id}`);
        if (!response.ok) continue;
        const status = (await response.json()) as ServerStatus;
        if (!status.analysis) return; // فایل دیگر روی سرور نیست (انصراف یا انقضا)
        state = status.analysis.state;
        emit({ analysis: status.analysis });
      } catch (error) {
        if (error instanceof Stopped || controller.signal.aborted) return;
        // شبکه لحظه‌ای افتاد؛ دور بعد دوباره.
      }
    }
  }

  async function run(): Promise<UploadSnapshot> {
    const status = await resumeOrCreate();
    if (!status) {
      emit({ phase: 'unavailable', reason: refusal });
      return { ...snapshot };
    }
    const plan = planParts(file.size, status.partSizeBytes);
    const received = new Set(status.receivedParts);
    const alreadySent = [...received].reduce((sum, n) => sum + partSize(plan, n), 0);
    emit({ documentId: status.documentId, phase: 'uploading', sentBytes: alreadySent });

    if (status.status === 'uploaded') {
      forget();
      emit({ phase: 'done', sentBytes: file.size });
      void watchAnalysis(status.documentId, status.analysis);
      return { ...snapshot };
    }

    let pending = Array.from({ length: plan.partCount }, (_, i) => i + 1).filter((n) => !received.has(n));
    // دو دور کافی است: دور دوم فقط تکه‌هایی است که سرور گفت نرسیده‌اند.
    for (let round = 0; round < 3; round += 1) {
      await sendParts(status.documentId, plan, pending);
      const response = await api(`/${status.documentId}/complete`, { method: 'POST' });
      if (response.ok) {
        forget();
        emit({ phase: 'done', sentBytes: file.size });
        const completed = (await response.json().catch(() => null)) as ServerStatus | null;
        void watchAnalysis(status.documentId, completed?.analysis ?? { state: 'pending' });
        return { ...snapshot };
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string; missing?: number[] };
      if (response.status !== 409 || body.error !== 'incomplete' || !body.missing?.length) break;
      pending = body.missing;
      emit({ sentBytes: file.size - pending.reduce((sum, n) => sum + partSize(plan, n), 0) });
    }
    throw new Error('complete failed');
  }

  const done = run().catch((error: unknown) => {
    if (!(error instanceof Stopped) && !controller.signal.aborted) emit({ phase: 'failed' });
    return { ...snapshot };
  });

  return {
    done,
    async cancel({ discard = false } = {}) {
      controller.abort();
      if (!discard) return;
      forget();
      const id = snapshot.documentId;
      if (id) {
        await deps
          .fetch(`${API}/${id}`, { method: 'DELETE', credentials: 'same-origin', keepalive: true })
          .catch(() => undefined);
      }
    },
  };
}

/**
 * تحلیل مرورگر برای سنجیدن اختلاف با سرور. یک بار، بی‌صدا: شکستش هیچ اثری
 * روی کاربر ندارد.
 */
export async function sendBrowserAnalysis(
  fetchImpl: typeof fetch,
  documentId: string,
  analysis: unknown,
): Promise<void> {
  await fetchImpl(`${API}/${documentId}/browser-analysis`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(analysis),
  }).catch(() => undefined);
}

/** وابستگی‌های واقعی مرورگر. */
export function browserDeps(): UploaderDeps {
  let storage: KeyValueStore | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    fetch: window.fetch.bind(window),
    storage,
    isOnline: () => navigator.onLine,
    waitForOnline: () =>
      new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true })),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
