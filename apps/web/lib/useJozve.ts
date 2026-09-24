'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { WorkerResponse } from './analysis-protocol';
import { createJozve, type JozveDeps } from './jozveController';

/**
 * وابستگی‌های واقعی مرورگر برای صف جزوه.
 *
 * هیچ‌کدام موقع ساخته شدن اجرا نمی‌شوند (صفحه سمت سرور هم رندر می‌شود). pdf.js، آپلودگر و
 * خوانندهٔ فهرست zip هر سه با import پویا و فقط با اولین فایل می‌آیند، پس به باندل اولیه
 * نمی‌خورند (ADR-014؛ تست باندل در `tests/flow.spec.ts`).
 */
function browserDeps(): JozveDeps {
  return {
    createWorker(onMessage, onError) {
      try {
        const worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => onMessage(event.data);
        worker.onerror = () => onError();
        return {
          // بافر منتقل می‌شود نه کپی — برای فایل ۱۰۰ مگابایتی روی گوشی مهم است.
          post: (request) => worker.postMessage(request, [request.buffer]),
          terminate: () => worker.terminate(),
        };
      } catch {
        return null;
      }
    },
    readFile: (file) => file.arrayBuffer(),
    officePageCount: async (file, kind) => (await import('./office-meta')).officePageCount(file, kind),
    async startUpload(file, onChange) {
      const { startUpload, browserDeps: uploaderDeps } = await import('./upload/client');
      return startUpload(file, onChange, uploaderDeps());
    },
    sendBrowserAnalysis(documentId, analysis) {
      void import('./upload/client').then(({ sendBrowserAnalysis }) =>
        sendBrowserAnalysis(window.fetch.bind(window), documentId, analysis),
      );
    },
    now: () => Date.now(),
  };
}

/** جزوهٔ این صفحه: فهرست فایل‌ها و کارهای کاربر روی آن. */
export function useJozve() {
  const [jozve] = useState(() => createJozve(browserDeps()));
  const snapshot = useSyncExternalStore(jozve.subscribe, jozve.getSnapshot, jozve.getSnapshot);
  useEffect(() => {
    jozve.resume();
    return () => jozve.dispose();
  }, [jozve]);
  return {
    sections: snapshot.sections,
    overflow: snapshot.overflow,
    add: jozve.add,
    move: jozve.move,
    remove: jozve.remove,
    replace: jozve.replace,
    reset: jozve.reset,
  };
}
