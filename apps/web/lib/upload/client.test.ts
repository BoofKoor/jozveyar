/**
 * آپلودگر مرورگر در برابر همان سرویس سرور، با استوریج حافظه‌ای.
 *
 * fetch جعلی درخواست‌های `/api/uploads` را به خود `createUploadService` می‌دهد
 * و PUT تکه‌ها را به `MemoryDriver` — با همان قیدی که امضای واقعی دارد: بدنه
 * باید دقیقاً به اندازهٔ امضاشده باشد. پس اینجا کلاینت و سرور با هم سنجیده
 * می‌شوند؛ فقط شبکه و استوریج واقعی نیستند (آنها در تست یکپارچگی‌اند).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryDriver } from '@jozveyar/storage';

import { memoryStore } from '../server/testing';
import { createUploadService, type Result } from '../server/uploads';
import { startUpload, type UploaderDeps, type UploadFile, type UploadSnapshot } from './client';

const MiB = 1024 * 1024;
const SESSION = 'c'.repeat(64);

function makeFile(size: number, name = 'جزوه.pdf'): UploadFile {
  const blob = new Blob([new Uint8Array(size)], { type: 'application/pdf' });
  return { name, size, type: blob.type, lastModified: 1_700_000_000_000, slice: (a, b) => blob.slice(a, b) };
}

function memoryKv() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('آپلودگر مرورگر', () => {
  let storage: MemoryDriver;
  let service: ReturnType<typeof createUploadService> | null;
  let kv: ReturnType<typeof memoryKv>;
  let online: boolean;
  let puts: number[];
  /** قبل از هر PUT صدا زده می‌شود؛ می‌تواند شکست را شبیه‌سازی کند. */
  let beforePut: (part: number) => Response | void;
  let onlineWaiters: (() => void)[];

  const json = (result: Result<unknown>) =>
    result.ok
      ? Response.json(result.value)
      : Response.json({ error: result.error, missing: result.missing }, { status: result.status });

  const fakeFetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';

    if (url.startsWith('memory://')) {
      const q = new URL(url.replace('memory://', 'http://x/')).searchParams;
      const part = Number(q.get('partNumber'));
      const injected = beforePut(part);
      if (injected) return injected;
      if (!online) throw new TypeError('network down');
      const size = (init.body as Blob).size;
      // همان قید امضای واقعی: اندازهٔ دیگر یعنی ۴۰۳.
      if (size !== Number(q.get('size'))) return new Response('', { status: 403 });
      puts.push(part);
      storage.receivePart(q.get('uploadId')!, part, size);
      return new Response('', { status: 200 });
    }

    if (!service) return Response.json({ error: 'storage_unavailable' }, { status: 503 });
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const [, id, action] = /^\/api\/uploads(?:\/([^/]+))?(?:\/(\w+))?$/.exec(url) ?? [];
    if (!id && method === 'POST') return json(await service.create(SESSION, body));
    if (id && action === 'parts') return json(await service.presignParts(SESSION, id, body.partNumbers));
    if (id && action === 'complete') return json(await service.complete(SESSION, id));
    if (id && method === 'DELETE') return json(await service.abort(SESSION, id));
    if (id && method === 'GET') return json(await service.status(SESSION, id));
    return new Response('', { status: 404 });
  }) as typeof fetch;

  const deps = (): UploaderDeps => ({
    fetch: fakeFetch,
    storage: kv,
    isOnline: () => online,
    waitForOnline: () => new Promise((resolve) => onlineWaiters.push(resolve)),
    sleep: async () => undefined,
  });

  beforeEach(() => {
    storage = new MemoryDriver();
    const store = memoryStore();
    service = createUploadService({ store, storage, budgetBytes: 1024 * MiB, log: () => undefined });
    kv = memoryKv();
    online = true;
    puts = [];
    beforePut = () => undefined;
    onlineWaiters = [];
  });

  const finalPhase = async (file: UploadFile) => {
    const seen: UploadSnapshot[] = [];
    const result = await startUpload(file, (s) => seen.push(s), deps()).done;
    return { result, seen };
  };

  it('فایل کامل تکه‌تکه می‌رود و سند uploaded می‌شود', async () => {
    const { result, seen } = await finalPhase(makeFile(20 * MiB));
    expect(result.phase).toBe('done');
    expect(result.sentBytes).toBe(20 * MiB);
    expect(puts.sort()).toEqual([1, 2, 3]);
    expect([...storage.objects.values()][0]?.sizeBytes).toBe(20 * MiB);
    // پیشرفت یکنواخت بالا می‌رود.
    const sent = seen.map((s) => s.sentBytes);
    expect(sent).toEqual([...sent].sort((a, b) => a - b));
    // کار تمام شد؛ چیزی برای ادامه نمانده.
    expect(kv.map.size).toBe(0);
  });

  it('استوریج پیکربندی نشده: بی‌صدا کنار می‌کشد، بدون حتی یک PUT', async () => {
    service = null;
    const { result } = await finalPhase(makeFile(MiB));
    expect(result.phase).toBe('unavailable');
    expect(puts).toEqual([]);
  });

  it('قطع شبکه وسط کار: منتظر می‌ماند و از همان تکه ادامه می‌دهد', async () => {
    let dropped = false;
    beforePut = (part) => {
      if (part === 2 && !dropped) {
        dropped = true;
        online = false;
      }
    };
    const seen: UploadSnapshot[] = [];
    const handle = startUpload(makeFile(20 * MiB), (s) => seen.push(s), { ...deps(), concurrency: 1 });

    await expect.poll(() => onlineWaiters.length).toBe(1);
    expect(seen.at(-1)?.phase).toBe('offline');
    online = true;
    onlineWaiters.shift()!();

    const result = await handle.done;
    expect(result.phase).toBe('done');
    // هر تکه فقط یک بار با موفقیت رسید — چیزی دوباره فرستاده نشد.
    expect(puts).toEqual([1, 2, 3]);
  });

  it('بعد از رفرش، همان فایل فقط تکه‌های باقی‌مانده را می‌فرستد', async () => {
    const file = makeFile(20 * MiB);
    // دور اول: بعد از تکهٔ اول «صفحه بسته می‌شود».
    let handle: ReturnType<typeof startUpload> | undefined;
    beforePut = (part) => {
      if (part !== 1) {
        void handle?.cancel();
        return new Response('', { status: 499 });
      }
    };
    handle = startUpload(file, () => undefined, { ...deps(), concurrency: 1 });
    await handle.done;
    expect(puts).toEqual([1]);
    expect(kv.map.size).toBe(1);

    // دور دوم: همان فایل دوباره انداخته شد.
    beforePut = () => undefined;
    puts = [];
    const { result, seen } = await finalPhase(file);
    expect(result.phase).toBe('done');
    expect(puts.sort()).toEqual([2, 3]);
    // پیشرفت از جای قبلی شروع شد، نه از صفر.
    expect(seen.find((s) => s.phase === 'uploading')?.sentBytes).toBe(8 * MiB);
  });

  it('خطای گذرا دوباره تلاش می‌شود', async () => {
    let failures = 2;
    beforePut = () => (failures-- > 0 ? new Response('', { status: 500 }) : undefined);
    const { result } = await finalPhase(makeFile(MiB));
    expect(result.phase).toBe('done');
  });

  it('تکه‌ای که سرور گفت نرسیده، دوباره فرستاده می‌شود', async () => {
    // تکهٔ ۲ «می‌رسد» ولی استوریج گمش می‌کند؛ سرور در تکمیل می‌گوید missing: [2].
    let lost = false;
    const original = storage.receivePart.bind(storage);
    storage.receivePart = (id, n, size) => {
      if (n === 2 && !lost) {
        lost = true;
        return;
      }
      original(id, n, size);
    };
    const { result } = await finalPhase(makeFile(20 * MiB));
    expect(result.phase).toBe('done');
    expect(puts.filter((n) => n === 2)).toHaveLength(2);
  });

  it('خطای ماندگار با شبکهٔ وصل: failed، و سند برای ادامهٔ بعدی می‌ماند', async () => {
    beforePut = () => new Response('', { status: 500 });
    const { result } = await finalPhase(makeFile(MiB));
    expect(result.phase).toBe('failed');
    expect(kv.map.size).toBe(1);
  });

  it('کنار گذاشتن فایل: آپلود روی سرور لغو و دیسک آزاد می‌شود', async () => {
    beforePut = () => new Response('', { status: 500 });
    const handle = startUpload(makeFile(MiB), () => undefined, { ...deps(), sleep: () => new Promise(() => undefined) });
    await expect.poll(() => storage.uploads.size).toBe(1);
    await handle.cancel({ discard: true });
    expect(storage.uploads.size).toBe(0);
    expect(kv.map.size).toBe(0);
  });
});
