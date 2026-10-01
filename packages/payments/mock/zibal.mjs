// @ts-check
/**
 * سرور ساختگی زیبال (برش ۷٫۲، ADR-050، سؤال ۱۲۸): Node بی وابستگی، به شکل همان که بستهٔ رسمی `zibal` می‌فرستد و می‌خواند، تا هیچ درخواستی از
 * تست، CI یا محیط توسعه به زیبال واقعی نرود.
 *
 * - `POST /v1/request`: کد پذیرنده، مبلغ (ریال، بیش از ۱٬۰۰۰ و تا سقف)، نشانی برگشت؛ پاسخ `{ result: 100, trackId, message }`. خطاها با `result`
 *   خود زیبال (`lib/messages.js` بستهٔ رسمی): ۱۰۲ پذیرنده یافت نشد، ۱۰۵ کمینه، ۱۰۶ نشانی برگشت، ۱۱۳ سقف، ۱۱۵ IP، ۱۴۰ بی نشانی برگشت.
 * - `GET /start/<trackId>`: صفحهٔ پرداخت، با Referer مثل زیبال («در هدایت مرورگر به paymentUrl، زیبال اکنون هدر Referer معتبر می‌خواهد»)؛
 *   سه دکمه (موفق، موجودی ناکافی، انصراف) که وضعیت را می‌نشانند و به نشانی برگشت با `trackId`، `success`، `status` و `orderId` برمی‌گردانند
 *   (README بستهٔ رسمی ۱٫۰٫۲).
 * - `POST /v1/inquiry` و `POST /v1/verify`: وضعیت با کدهای زیبال؛ `verify` فقط «پرداخت‌شده، تأییدنشده» (۲) را تأیید می‌کند، تأییدشده ۲۰۱ و
 *   بقیه ۲۰۲. فیلدهای پاسخ استعلام از دو بستهٔ غیررسمی‌اند (منتظر مستند)؛ فرمان تست می‌تواند هر کدام را بیندازد.
 * - برگشت خودکار پول تأییدنشده: «پرداخت‌شده، تأییدنشده» پس از `reverseAfterMs` «ریورس‌شده» (۱۸) می‌شود (وبلاگ زیبال: ۱۵ دقیقه).
 * - فرمان تست (`/__mock/…`، فقط روی 127.0.0.1): پیکربندی، شکست N درخواست بعد با کد HTTP یا `result` دلخواه، تأخیر (سقف زمان)، بریدن
 *   اتصال، پرداخت بی مرورگر، و فهرست تراکنش‌ها.
 *
 * اجرا: `node packages/payments/mock/zibal.mjs <پورت>`، با `ZIBAL_MOCK_MERCHANTS` (کدهای پذیرنده، با ویرگول) و `ZIBAL_MOCK_REFERER`
 * (میزبانی که Referer باید داشته باشد، مثل `127.0.0.1:3100`). هیچ کد پذیرنده‌ای چاپ نمی‌شود.
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{
 *   trackId: number, merchant: string, amount: number, orderId: string | null, description: string | null, callbackUrl: string,
 *   status: number, createdAt: string, paidAt: string | null, verifiedAt: string | null, refNumber: number | null, cardNumber: string | null,
 * }} Transaction
 * @typedef {{ http?: number, result?: number, times: number, path?: string }} Failure
 * @typedef {{
 *   merchants?: string[],
 *   maxAmount?: number,
 *   referer?: string | null,
 *   ipRejected?: boolean,
 *   omit?: string[],
 *   fail?: Failure | null,
 *   delayMs?: number,
 *   drop?: number,
 *   reverseAfterMs?: number | null,
 * }} MockConfig
 */

const CARD = '6037991234561234';

/** @param {MockConfig} [initial] */
export function createZibalMock(initial = {}) {
  const state = {
    /** @type {Set<string>} */
    merchants: new Set(),
    maxAmount: 500_000_000,
    /** @type {string | null} میزبانی که Referer صفحهٔ پرداخت باید داشته باشد؛ null یعنی هر Referer، ولی بی Referer نه. */
    referer: /** @type {string | null} */ (null),
    ipRejected: false,
    /** @type {string[]} */
    omit: [],
    /** @type {Failure | null} */
    fail: null,
    delayMs: 0,
    drop: 0,
    /** @type {number | null} */
    reverseAfterMs: null,
    /** @type {Map<number, Transaction>} */
    transactions: new Map(),
    nextTrackId: 3_714_560_001,
    nextRef: 803_101,
  };

  /** @param {MockConfig} config */
  function configure(config) {
    if (Array.isArray(config.merchants)) state.merchants = new Set(config.merchants.filter((m) => typeof m === 'string' && m));
    if (typeof config.maxAmount === 'number') state.maxAmount = config.maxAmount;
    if (config.referer !== undefined) state.referer = config.referer || null;
    if (typeof config.ipRejected === 'boolean') state.ipRejected = config.ipRejected;
    if (Array.isArray(config.omit)) state.omit = config.omit.map(String);
    if (config.fail !== undefined) state.fail = config.fail ? { ...config.fail, times: config.fail.times ?? 1 } : null;
    if (typeof config.delayMs === 'number') state.delayMs = Math.max(0, config.delayMs);
    if (typeof config.drop === 'number') state.drop = Math.max(0, Math.floor(config.drop));
    if (config.reverseAfterMs !== undefined) state.reverseAfterMs = config.reverseAfterMs;
  }
  configure(initial);

  /** برگشت خودکار پول تأییدنشده، هنگام خواندن. @param {Transaction} tx */
  function settle(tx) {
    if (tx.status === 2 && state.reverseAfterMs !== null && tx.paidAt && Date.now() - Date.parse(tx.paidAt) >= state.reverseAfterMs) {
      tx.status = 18;
    }
    return tx;
  }

  /**
   * @param {import('node:http').ServerResponse} res
   * @param {number} http
   * @param {unknown} body
   */
  function send(res, http, body) {
    const text = JSON.stringify(body);
    res.writeHead(http, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }

  /** @param {import('node:http').ServerResponse} res @param {number} result @param {string} message */
  const result = (res, result, message) => send(res, 200, { result, message });

  /** @param {unknown} value */
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  /** @param {import('node:http').ServerResponse} res @param {number} http @param {string} body */
  function html(res, http, body) {
    const text = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>زیبال ساختگی</title></head><body>${body}</body></html>`;
    res.writeHead(http, { 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }

  /** @param {import('node:http').IncomingMessage} req @returns {Promise<string>} */
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      /** @type {Buffer[]} */
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 64 * 1024) reject(new Error('too large'));
        else chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });

  /** @param {string} text @returns {Record<string, unknown> | null} */
  const json = (text) => {
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };

  /** @param {unknown} value */
  const trackIdOf = (value) => (typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);

  /** نشانی برگشت با پارامترهای زیبال، چه نشانی پرسش داشته باشد چه نه. @param {Transaction} tx */
  function returnUrl(tx) {
    const url = new URL(tx.callbackUrl);
    url.searchParams.set('trackId', String(tx.trackId));
    url.searchParams.set('success', tx.status === 2 || tx.status === 1 ? '1' : '0');
    url.searchParams.set('status', String(tx.status));
    if (tx.orderId !== null) url.searchParams.set('orderId', tx.orderId);
    return url.href;
  }

  /** @param {Transaction} tx @param {string} outcome */
  function pay(tx, outcome) {
    if (tx.status !== -1) return false;
    if (outcome === 'success') {
      tx.status = 2;
      tx.paidAt = new Date().toISOString();
      tx.refNumber = state.nextRef++;
      tx.cardNumber = `${CARD.slice(0, 6)}******${CARD.slice(-4)}`;
    } else if (outcome === 'declined') {
      tx.status = 5;
      tx.cardNumber = `${CARD.slice(0, 6)}******${CARD.slice(-4)}`;
    } else if (outcome === 'cancel') {
      tx.status = 3;
    } else {
      return false;
    }
    return true;
  }

  /** پاسخ استعلام، بی فیلدهایی که فرمان تست انداخته. @param {Transaction} tx */
  function inquiryBody(tx) {
    /** @type {Record<string, unknown>} */
    const body = {
      result: 100,
      message: 'success',
      status: tx.status,
      amount: tx.amount,
      orderId: tx.orderId,
      description: tx.description,
      createdAt: tx.createdAt,
      paidAt: tx.paidAt,
      verifiedAt: tx.verifiedAt,
      refNumber: tx.refNumber,
      cardNumber: tx.cardNumber,
      wage: 0,
      shaparakFee: 0,
    };
    for (const key of state.omit) delete body[key];
    return body;
  }

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} path
   */
  async function control(req, res, path) {
    if (req.method === 'POST' && path === '/__mock/config') {
      const body = json(await readBody(req));
      if (!body) return send(res, 400, { error: 'bad config' });
      configure(/** @type {MockConfig} */ (body));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && path === '/__mock/reset') {
      state.transactions.clear();
      state.fail = null;
      state.delayMs = 0;
      state.drop = 0;
      state.omit = [];
      state.ipRejected = false;
      state.reverseAfterMs = null;
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && path === '/__mock/transactions') {
      return send(res, 200, { transactions: [...state.transactions.values()].map((tx) => ({ ...settle(tx), merchant: undefined })) });
    }
    if (req.method === 'POST' && (path === '/__mock/pay' || path === '/__mock/status')) {
      const body = json(await readBody(req));
      const tx = body ? state.transactions.get(trackIdOf(body.trackId)) : undefined;
      if (!body || !tx) return send(res, 404, { error: 'not found' });
      if (path === '/__mock/pay') return send(res, pay(tx, String(body.outcome)) ? 200 : 409, { status: tx.status });
      if (typeof body.status !== 'number') return send(res, 400, { error: 'bad status' });
      tx.status = body.status;
      if ((body.status === 2 || body.status === 1) && !tx.paidAt) {
        tx.paidAt = new Date().toISOString();
        tx.refNumber = state.nextRef++;
        tx.cardNumber = `${CARD.slice(0, 6)}******${CARD.slice(-4)}`;
      }
      return send(res, 200, { status: tx.status });
    }
    return send(res, 404, { error: 'not found' });
  }

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {number} trackId */
  function startPage(req, res, trackId) {
    const tx = state.transactions.get(trackId);
    if (!tx) return html(res, 404, '<h1>تراکنش پیدا نشد</h1>');
    const referer = req.headers.referer;
    let host = null;
    try {
      host = referer ? new URL(referer).host : null;
    } catch {
      host = null;
    }
    if (!host || (state.referer !== null && host !== state.referer)) {
      return html(res, 403, '<h1>Referer نامعتبر</h1><p>نشانی سایت پذیرنده با دامنهٔ ثبت‌شده نمی‌خواند.</p>');
    }
    settle(tx);
    if (tx.status !== -1) return html(res, 409, `<h1>این تراکنش پیش‌تر انجام شده</h1><p><a href="${escape(returnUrl(tx))}">برگشت به سایت پذیرنده</a></p>`);
    /** @param {string} outcome @param {string} label */
    const button = (outcome, label) =>
      `<form method="post" action="/start/${tx.trackId}/pay"><input type="hidden" name="outcome" value="${outcome}"><button type="submit">${label}</button></form>`;
    return html(
      res,
      200,
      `<h1>درگاه پرداخت زیبال (ساختگی)</h1><p>مبلغ <span data-amount>${tx.amount}</span> ریال · سفارش <span data-order>${escape(tx.orderId ?? '')}</span></p>` +
        button('success', 'پرداخت موفق') +
        button('declined', 'موجودی ناکافی') +
        button('cancel', 'انصراف'),
    );
  }

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://mock');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path.startsWith('/__mock/')) return control(req, res, path);

    if (state.drop > 0) {
      state.drop -= 1;
      req.socket.destroy();
      return;
    }
    if (state.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    if (state.fail && state.fail.times > 0 && (!state.fail.path || state.fail.path === path)) {
      const { http, result: code } = state.fail;
      state.fail.times -= 1;
      if (state.fail.times <= 0) state.fail = null;
      if (http) return send(res, http, { result: code ?? -1, message: 'mock failure' });
      return result(res, code ?? -1, 'mock failure');
    }

    const start = /^\/start\/(\d+)(\/pay)?$/.exec(path);
    if (start) {
      const trackId = Number(start[1]);
      if (req.method === 'GET' && !start[2]) return startPage(req, res, trackId);
      if (req.method === 'POST' && start[2]) {
        const tx = state.transactions.get(trackId);
        if (!tx) return html(res, 404, '<h1>تراکنش پیدا نشد</h1>');
        const outcome = new URLSearchParams(await readBody(req)).get('outcome') ?? '';
        if (!pay(tx, outcome)) return html(res, 409, '<h1>این تراکنش پیش‌تر انجام شده</h1>');
        res.writeHead(302, { location: returnUrl(tx) });
        res.end();
        return;
      }
      return html(res, 405, '<h1>روش نادرست</h1>');
    }

    if (req.method !== 'POST' || !['/v1/request', '/v1/inquiry', '/v1/verify'].includes(path)) return send(res, 404, { result: -1, message: 'not found' });
    const body = json(await readBody(req));
    if (!body) return result(res, -1, 'bad request');
    const merchant = body.merchant;
    if (typeof merchant !== 'string' || !state.merchants.has(merchant)) return result(res, 102, 'merchant یافت نشد.');
    if (state.ipRejected) return result(res, 115, 'IP درخواست‌دهنده در پنل کاربری ثبت نشده است.');

    if (path === '/v1/request') {
      const amount = body.amount;
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 1000) return result(res, 105, 'مبلغ باید از حداقل مجاز بیشتر باشد.');
      if (amount > state.maxAmount) return result(res, 113, 'مبلغ از حداکثر مجاز بیشتر است.');
      if (body.callbackUrl === undefined || body.callbackUrl === null || body.callbackUrl === '') return result(res, 140, 'callbackUrl ارسال نشده.');
      let callback;
      try {
        callback = new URL(String(body.callbackUrl));
      } catch {
        callback = null;
      }
      if (!callback || (callback.protocol !== 'https:' && callback.protocol !== 'http:')) return result(res, 106, 'callbackUrl نامعتبر است.');
      const trackId = state.nextTrackId++;
      /** @type {Transaction} */
      const tx = {
        trackId,
        merchant,
        amount,
        orderId: typeof body.orderId === 'string' || typeof body.orderId === 'number' ? String(body.orderId) : null,
        description: typeof body.description === 'string' ? body.description : null,
        callbackUrl: callback.href,
        status: -1,
        createdAt: new Date().toISOString(),
        paidAt: null,
        verifiedAt: null,
        refNumber: null,
        cardNumber: null,
      };
      state.transactions.set(trackId, tx);
      return send(res, 200, { result: 100, trackId, message: 'success' });
    }

    const tx = state.transactions.get(trackIdOf(body.trackId));
    if (!tx || tx.merchant !== merchant) return result(res, 203, 'trackId نامعتبر است.');
    settle(tx);
    if (path === '/v1/inquiry') return send(res, 200, inquiryBody(tx));
    // verify
    if (tx.status === 1) return result(res, 201, 'قبلاً تایید شده.');
    if (tx.status !== 2) return result(res, 202, 'سفارش پرداخت نشده یا ناموفق بوده است.');
    tx.status = 1;
    tx.verifiedAt = new Date().toISOString();
    return send(res, 200, {
      result: 100,
      message: 'success',
      status: 1,
      amount: tx.amount,
      orderId: tx.orderId,
      description: tx.description,
      paidAt: tx.paidAt,
      refNumber: tx.refNumber,
      cardNumber: tx.cardNumber,
    });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { result: -1, message: 'mock error' });
      else res.destroy();
    });
  });

  return {
    state,
    configure,
    server,
    /** @param {number} [port] @returns {Promise<string>} نشانی پایه، مثل `http://127.0.0.1:3400` */
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          const address = server.address();
          resolve(`http://127.0.0.1:${address && typeof address === 'object' ? address.port : port}`);
        });
      });
    },
    /** @returns {Promise<void>} */
    close() {
      return new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] ?? 3400);
  const mock = createZibalMock({
    merchants: (process.env.ZIBAL_MOCK_MERCHANTS ?? '').split(',').map((m) => m.trim()).filter(Boolean),
    referer: process.env.ZIBAL_MOCK_REFERER || null,
  });
  const url = await mock.listen(port);
  console.log(`✓ زیبال ساختگی روی ${url}: ${mock.state.merchants.size} کد پذیرنده`);
}
