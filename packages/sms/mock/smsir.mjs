// @ts-check
/**
 * سرور ساختگی sms.ir (برش ۷، ADR-049، سؤال ۱۲۸): Node بی وابستگی، به شکل همان که بسته‌های رسمی sms.ir می‌فرستند و می‌خوانند
 * (`smsir-js` ۱٫۳٫۳، `sms-typescript` ۲٫۰٫۳، `IPE.SmsIr` ۱٫۲٫۷)، تا هیچ درخواستی از تست، CI یا محیط توسعه به sms.ir واقعی نرود.
 *
 * - `POST /v1/send/verify`: کلید (`X-API-KEY`)، شمارهٔ `09…`، شناسهٔ قالب و **نام** پارامترها (همان قالبی که ساخته شده) و مقدار هر
 *   پارامتر (۱ تا ۵۰ نویسه) را می‌سنجد؛ پاسخ `{ status: 1, message, data: { messageId, cost } }`، و هزینه از اعتبار کم می‌شود.
 * - `GET /v1/credit`: `{ status: 1, message, data: <اعتبار> }`.
 * - خطا با کد HTTP، مثل بسته‌های رسمی: ۴۰۱ کلید، ۴۰۰ شماره، قالب، پارامتر یا اعتبار کم؛ بدنه `{ status, message, data: null }`.
 *   `status` بدنه اینجا همان کد HTTP است: جدول کدهای خود sms.ir هنوز در مستندی دیده نشده.
 * - پیامک‌ها با پارامترهایشان در حافظه می‌مانند، کد تأیید هم، تا تست بخواندشان: ردیف `sms_messages` پنل واقعی کد را ندارد (ADR-033).
 * - فرمان تست (`/__mock/…`، فقط روی 127.0.0.1): پیکربندی (کلیدها، قالب‌ها، اعتبار، هزینه)، شکست N درخواست بعد با کد دلخواه، تأخیر
 *   (برای سقف زمان)، بریدن اتصال، و فهرست پیامک‌ها.
 *
 * اجرا: `node packages/sms/mock/smsir.mjs <پورت>`، با `SMSIR_MOCK_KEYS` (کلیدها، با ویرگول)، `SMSIR_MOCK_TEMPLATES` (JSON:
 * `{"100001":["CODE"]}`)، `SMSIR_MOCK_CREDIT` و `SMSIR_MOCK_COST`. هیچ کلیدی چاپ نمی‌شود.
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ name: string, value: string }} Parameter
 * @typedef {{ id: number, mobile: string, templateId: number, parameters: Parameter[], cost: number, at: string }} Message
 * @typedef {{ http: number, status?: number, times: number }} Failure
 * @typedef {{
 *   keys?: string[],
 *   templates?: Record<string, string[]>,
 *   credit?: number,
 *   cost?: number,
 *   fail?: Failure | null,
 *   delayMs?: number,
 *   drop?: number,
 * }} MockConfig
 */

/** @param {MockConfig} [initial] */
export function createSmsIrMock(initial = {}) {
  const state = {
    /** @type {Set<string>} */
    keys: new Set(),
    /** @type {Map<number, string[]>} */
    templates: new Map(),
    credit: 1_000_000,
    cost: 1,
    /** @type {Failure | null} */
    fail: null,
    delayMs: 0,
    drop: 0,
    /** @type {Message[]} */
    messages: [],
    nextId: 880_000_001,
  };

  /** @param {MockConfig} config */
  function configure(config) {
    if (Array.isArray(config.keys)) state.keys = new Set(config.keys.filter((key) => typeof key === 'string' && key));
    if (config.templates && typeof config.templates === 'object') {
      state.templates = new Map(
        Object.entries(config.templates)
          .filter(([, names]) => Array.isArray(names))
          .map(([id, names]) => [Number(id), names.map(String)]),
      );
    }
    if (typeof config.credit === 'number' && Number.isFinite(config.credit)) state.credit = config.credit;
    if (typeof config.cost === 'number' && Number.isFinite(config.cost)) state.cost = config.cost;
    if (config.fail !== undefined) state.fail = config.fail && Number.isInteger(config.fail.http) ? { ...config.fail, times: config.fail.times ?? 1 } : null;
    if (typeof config.delayMs === 'number') state.delayMs = Math.max(0, config.delayMs);
    if (typeof config.drop === 'number') state.drop = Math.max(0, Math.floor(config.drop));
  }
  configure(initial);

  /** @param {Record<string, unknown>} body @param {string} name */
  const field = (body, name) => {
    const key = Object.keys(body).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : body[key];
  };

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

  /** @param {import('node:http').ServerResponse} res @param {number} http @param {string} message */
  const refuse = (res, http, message) => send(res, http, { status: http, message, data: null });

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

  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} path
   */
  async function control(req, res, path) {
    if (req.method === 'POST' && path === '/__mock/config') {
      const body = json(await readBody(req));
      if (!body) return refuse(res, 400, 'bad config');
      configure(/** @type {MockConfig} */ (body));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && path === '/__mock/reset') {
      state.messages = [];
      state.fail = null;
      state.delayMs = 0;
      state.drop = 0;
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && path === '/__mock/messages') {
      return send(res, 200, { messages: state.messages, credit: state.credit });
    }
    return refuse(res, 404, 'not found');
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
    if (state.fail && state.fail.times > 0) {
      const { http, status } = state.fail;
      state.fail.times -= 1;
      if (state.fail.times <= 0) state.fail = null;
      return send(res, http, { status: status ?? http, message: 'mock failure', data: null });
    }

    const key = req.headers['x-api-key'];
    const known = typeof key === 'string' && state.keys.has(key);

    if (req.method === 'GET' && path === '/v1/credit') {
      if (!known) return refuse(res, 401, 'invalid api key');
      return send(res, 200, { status: 1, message: 'موفق', data: state.credit });
    }

    if (req.method === 'POST' && path === '/v1/send/verify') {
      if (!known) return refuse(res, 401, 'invalid api key');
      const body = json(await readBody(req));
      if (!body) return refuse(res, 400, 'bad request');
      const mobile = field(body, 'mobile');
      const templateId = Number(field(body, 'templateId'));
      const raw = field(body, 'parameters');
      if (typeof mobile !== 'string' || !/^09\d{9}$/.test(mobile)) return refuse(res, 400, 'invalid mobile');
      const names = state.templates.get(templateId);
      if (!names) return refuse(res, 400, 'template not found');
      if (!Array.isArray(raw)) return refuse(res, 400, 'invalid parameters');
      /** @type {Parameter[]} */
      const parameters = [];
      for (const item of raw) {
        const entry = item && typeof item === 'object' ? /** @type {Record<string, unknown>} */ (item) : null;
        const name = entry ? field(entry, 'name') : undefined;
        const value = entry ? field(entry, 'value') : undefined;
        if (typeof name !== 'string' || typeof value !== 'string' || value.length < 1 || value.length > 50) {
          return refuse(res, 400, 'invalid parameter');
        }
        parameters.push({ name, value });
      }
      const given = parameters.map((p) => p.name).sort();
      const wanted = [...names].sort();
      if (given.length !== wanted.length || given.some((name, i) => name !== wanted[i])) return refuse(res, 400, 'parameters do not match template');
      if (state.credit < state.cost) return refuse(res, 400, 'insufficient credit');
      state.credit -= state.cost;
      const message = { id: state.nextId++, mobile, templateId, parameters, cost: state.cost, at: new Date().toISOString() };
      state.messages.push(message);
      return send(res, 200, { status: 1, message: 'موفق', data: { messageId: message.id, cost: message.cost } });
    }

    return refuse(res, 404, 'not found');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) refuse(res, 500, 'mock error');
      else res.destroy();
    });
  });

  return {
    state,
    configure,
    server,
    /** @param {number} [port] @returns {Promise<string>} نشانی پایه، مثل `http://127.0.0.1:3300` */
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
  const port = Number(process.argv[2] ?? 3300);
  /** @type {MockConfig} */
  const config = {
    keys: (process.env.SMSIR_MOCK_KEYS ?? '').split(',').map((key) => key.trim()).filter(Boolean),
    templates: process.env.SMSIR_MOCK_TEMPLATES ? JSON.parse(process.env.SMSIR_MOCK_TEMPLATES) : {},
    ...(process.env.SMSIR_MOCK_CREDIT ? { credit: Number(process.env.SMSIR_MOCK_CREDIT) } : {}),
    ...(process.env.SMSIR_MOCK_COST ? { cost: Number(process.env.SMSIR_MOCK_COST) } : {}),
  };
  const mock = createSmsIrMock(config);
  const url = await mock.listen(port);
  console.log(`✓ sms.ir ساختگی روی ${url}: ${mock.state.keys.size} کلید، ${mock.state.templates.size} قالب`);
}
