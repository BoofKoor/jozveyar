/**
 * سرور ساختگی sms.ir (ADR-049، سؤال ۱۲۸): هیچ درخواستی از CI یا محیط توسعه به sms.ir واقعی نمی‌رود؛ آداپتور (`src/smsir.ts`) با
 * `SMSIR_API_URL` فقط همین را می‌بیند. Node بی وابستگی، به شکل بستهٔ رسمی خود sms.ir (یافتهٔ ۶):
 *
 *  - `POST /v1/send/verify` با سرآیند `X-API-KEY` و بدنهٔ `{ mobile, templateId, parameters: [{ name, value }] }`: کلید، قالب، نام
 *    پارامترها (همان‌ها، نه کمتر و نه بیشتر)، مقدار هر پارامتر (رشته، تا ۵۰ نویسه) و موبایل را می‌سنجد؛ پاسخ موفق
 *    `{ status: 1, message, data: { messageId, cost } }`، و هر پیامک با پارامترهایش نگه داشته می‌شود تا تست کد را از اینجا بخواند (ردیف
 *    پایگاه داده کد را ندارد).
 *  - `GET /v1/credit`: `{ status: 1, message, data: <عدد> }`؛ با هر پیامک به‌اندازهٔ هزینه‌اش کم می‌شود.
 *  - خطا با کد HTTP همان مستند: ۴۰۱ کلید نامعتبر، ۴۰۰ بدنه، قالب یا پارامتر نادرست، ۴۲۹ و ۵۰۰. `status` عددی بدنهٔ خطا اینجا
 *    ساختگی است (۱۱ تا ۱۷)؛ جدول واقعی sms.ir هنوز منتظر مستند است.
 *  - به فرمان تست (`/__fake/…`، فقط همین سرور ساختگی): پیامک‌ها، حالت (`ok`، `down` ۵۰۰ بی JSON، `limit` ۴۲۹، `hang` بی پاسخ تا سقف
 *    زمان آداپتور)، و از نو.
 *
 * فقط روی `127.0.0.1`. هیچ کلید، سرآیند یا بدنه‌ای چاپ نمی‌شود.
 *
 * خط فرمان (CI): `node packages/sms/fake/smsir.mjs` با `FAKE_SMSIR_PORT` (پیش‌فرض 3950)، `FAKE_SMSIR_KEYS` (کلیدهای پذیرفته، با `,`)،
 * `FAKE_SMSIR_TEMPLATES` (JSON، شناسهٔ قالب به نام پارامترها: `{"100001":["CODE"]}`) و `FAKE_SMSIR_CREDIT`.
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const PARAM_MAX = 50;

/** @param {import('./smsir.d.mts').FakeSmsIrOptions} [options] */
export function createFakeSmsIr(options = {}) {
  const state = {
    keys: new Set(),
    /** @type {Map<number, string[]>} */
    templates: new Map(),
    credit: 12480.25,
    cost: 1,
    /** @type {import('./smsir.d.mts').FakeMode} */
    mode: 'ok',
    /** @type {import('./smsir.d.mts').FakeMessage[]} */
    messages: [],
    requests: 0,
    nextId: 89545112,
  };
  const sockets = new Set();
  let address = '';

  function configure(next = {}) {
    if (next.keys) state.keys = new Set(next.keys.filter(Boolean));
    if (next.templates) state.templates = new Map(Object.entries(next.templates).map(([id, names]) => [Number(id), [...names]]));
    if (typeof next.credit === 'number') state.credit = next.credit;
    if (typeof next.cost === 'number') state.cost = next.cost;
  }
  configure(options);

  const json = (res, http, body) => {
    res.writeHead(http, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  const refuse = (res, http, status, message) => json(res, http, { status, message, data: null });

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 64 * 1024) return null;
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  }

  /** پاسخ کار واقعی sms.ir، یا null اگر حالت تست جایش را گرفت. */
  function unhealthy(res) {
    switch (state.mode) {
      case 'down':
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return true;
      case 'limit':
        refuse(res, 429, 16, 'درخواست زیاد');
        return true;
      case 'hang':
        // بی پاسخ: آداپتور با سقف زمان خودش می‌بُرد؛ `close` سوکت را می‌بندد.
        return true;
      default:
        return false;
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://fake');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // ── فرمان تست ──
    if (path === '/__fake/messages' && req.method === 'GET') return json(res, 200, { messages: state.messages, requests: state.requests, credit: state.credit });
    if (path === '/__fake/mode' && req.method === 'POST') {
      const body = await readBody(req);
      if (!['ok', 'down', 'limit', 'hang'].includes(body?.mode)) return json(res, 400, { error: 'mode' });
      state.mode = body.mode;
      return json(res, 200, { mode: state.mode });
    }
    if (path === '/__fake/reset' && req.method === 'POST') {
      state.mode = 'ok';
      state.messages = [];
      state.requests = 0;
      return json(res, 200, { ok: true });
    }

    // ── API ──
    if (path !== '/v1/send/verify' && path !== '/v1/credit') return refuse(res, 404, 12, 'نشانی نادرست');
    state.requests += 1;
    if (unhealthy(res)) return;
    const key = req.headers['x-api-key'];
    if (typeof key !== 'string' || !state.keys.has(key)) return refuse(res, 401, 11, 'کلید نامعتبر است');

    if (path === '/v1/credit') {
      if (req.method !== 'GET') return refuse(res, 405, 12, 'روش نادرست');
      return json(res, 200, { status: 1, message: 'موفق', data: state.credit });
    }

    if (req.method !== 'POST') return refuse(res, 405, 12, 'روش نادرست');
    const body = await readBody(req);
    if (!body || typeof body !== 'object') return refuse(res, 400, 12, 'بدنه نادرست');
    const { mobile, templateId, parameters } = body;
    if (typeof mobile !== 'string' || !/^09\d{9}$/.test(mobile)) return refuse(res, 400, 15, 'موبایل نادرست');
    const names = typeof templateId === 'number' ? state.templates.get(templateId) : undefined;
    if (!names) return refuse(res, 400, 13, 'قالب نیست یا تأیید نشده');
    const given = Array.isArray(parameters) ? parameters : [];
    const valid =
      given.length === names.length &&
      given.every((p) => p && typeof p.name === 'string' && typeof p.value === 'string' && p.value.length > 0 && p.value.length <= PARAM_MAX) &&
      names.every((name) => given.filter((p) => p.name === name).length === 1);
    if (!valid) return refuse(res, 400, 14, 'پارامترهای قالب نادرست');

    const id = state.nextId++;
    state.credit = Math.round((state.credit - state.cost) * 100) / 100;
    state.messages.push({
      id,
      mobile,
      templateId,
      parameters: given.map((p) => ({ name: p.name, value: p.value })),
      at: new Date().toISOString(),
    });
    return json(res, 200, { status: 1, message: 'موفق', data: { messageId: id, cost: state.cost } });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) refuse(res, 500, 17, 'خطای سرور ساختگی');
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  return {
    state,
    get url() {
      return address;
    },
    get messages() {
      return state.messages;
    },
    get requests() {
      return state.requests;
    },
    configure,
    setMode(mode) {
      state.mode = mode;
    },
    reset() {
      state.mode = 'ok';
      state.messages = [];
      state.requests = 0;
    },
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const info = server.address();
          address = `http://${host}:${typeof info === 'object' && info ? info.port : port}`;
          resolve(address);
        });
      });
    },
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// خط فرمان: فقط وقتی همین فایل اجرا شد، نه وقتی تست import کرد.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fake = createFakeSmsIr({
    keys: (process.env.FAKE_SMSIR_KEYS ?? '').split(',').map((key) => key.trim()),
    templates: JSON.parse(process.env.FAKE_SMSIR_TEMPLATES || '{}'),
    ...(process.env.FAKE_SMSIR_CREDIT ? { credit: Number(process.env.FAKE_SMSIR_CREDIT) } : {}),
  });
  const url = await fake.listen(Number(process.env.FAKE_SMSIR_PORT || 3950));
  console.info(`✓ sms.ir ساختگی: ${url} (${fake.state.keys.size} کلید، ${fake.state.templates.size} قالب)`);
  const stop = () => fake.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
