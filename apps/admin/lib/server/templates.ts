/**
 * قالب برگه‌ها در پنل (برش ۹٫۲، ADR-057؛ سؤال‌های ۱۹۳ و ۱۹۴): نسخه‌های قالب HTML بیجک و برگهٔ اول، بارگذاری نسخهٔ تازه، پیش‌نمایش با
 * دادهٔ نمونه یا یک سفارش، و فعال کردن یک نسخه یا برگشت به قالب پیش‌فرض با کد تازهٔ برنامهٔ تأیید.
 *
 * - **مجوز در سرور** (ADR-038): همه با `templates.manage`، فقط مالک. فعال کردن کار حساس است: کد تازه (`stepUp`)، پس از هر سنجشی که بی
 *   کد جواب دارد، تا کد هدر نرود. بارگذاری و پیش‌نمایش کد نمی‌خواهند: تا فعال کردن هیچ برگه‌ای عوض نمی‌شود.
 * - **سرور منبع حقیقت است:** فایل اینجا سنجیده می‌شود (HTML، تا ۲ مگابایت، UTF-8)، و خود پایگاه داده هم سقف و شکل را دارد (0040). قالب
 *   ناشناس است و فقط کارگر، در پردازهٔ مهارشده، آن را می‌سازد (`ticket_render.py`)؛ پنل هرگز آن را به شکل HTML به مرورگر نمی‌دهد.
 * - **همان که دیده شد:** صفحهٔ فعال کردن نسخهٔ فعالی که دید و متن و زمان پیش‌نمایش نسخه را می‌فرستد (`activationSeen`)، و ذخیره‌گاه زیر
 *   قفل با امروز می‌سنجدشان.
 * - **رویداد** هر کار در همان تراکنش خودش است (ذخیره‌گاه، `@jozveyar/db` → `templates.ts`).
 *
 * بی نکست؛ هر وابستگی از درگاه می‌آید، پس با ذخیره‌گاه و استوریج ساختگی تست می‌شود. قفل، تراکنش و محافظ‌ها روی پستگرس در تست یکپارچگی
 * `packages/db`.
 */

import { createHash } from 'node:crypto';

import {
  TICKET_TEMPLATE_MAX_BYTES,
  isPaidStatus,
  type TemplateActor,
  type TicketTemplateStore,
  type TicketTemplateVersion,
} from '@jozveyar/db';
import type { StorageDriver } from '@jozveyar/storage';
import { toLatinDigits } from '@jozveyar/text';

import { orderNumberOf } from '../orders';
import {
  TICKET_TEMPLATE_KINDS,
  activationSeen,
  isTemplateKind,
  previewFileName,
  previewKeyOf,
  templateFileName,
  templateRefOf,
  type TicketTemplateKind,
} from '../ticketTemplates';
import { DEFAULT_TICKET_TEMPLATES } from '../ticketTemplates.generated';
import { can, ipHashOf, type AdminSession } from './auth';
import type { DownloadFile } from './orders';
import { fail, ok, type Result } from './result';

export interface PanelTemplatesDeps {
  store: TicketTemplateStore;
  /** فایل‌های پیش‌نمایش که کارگر ساخت؛ بی استوریج فقط تصویر و PDF پیش‌نمایش بسته است. */
  storage: StorageDriver | null;
  /** کد تازهٔ برنامهٔ تأیید برای کار حساس؛ همان `AdminAuth.stepUp`، با سقف اشتباه و قفلش. */
  stepUp: (session: AdminSession, code: unknown, ip: string) => Promise<Result<true>>;
  /** `SESSION_SECRET`: کلید HMAC IP، مثل ورود. */
  secret: string;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
}

/** نسخه‌های هر نوع و نسخهٔ فعالش؛ null یعنی قالب پیش‌فرض. */
export interface KindView {
  kind: TicketTemplateKind;
  active: TicketTemplateVersion | null;
  versions: TicketTemplateVersion[];
}

export interface TemplatesOverview {
  now: Date;
  kinds: KindView[];
}

export interface TemplateVersionView {
  now: Date;
  version: TicketTemplateVersion;
  /** نسخهٔ فعال همان نوع؛ null یعنی قالب پیش‌فرض. */
  active: TicketTemplateVersion | null;
}

export interface TemplateActivationView {
  now: Date;
  kind: TicketTemplateKind;
  /** نسخه‌ای که فعال می‌شود؛ null یعنی برگشت به قالب پیش‌فرض. */
  target: TicketTemplateVersion | null;
  active: TicketTemplateVersion | null;
  /** سفارش‌های «در صف چاپ» که برگه‌شان با قالب تازه از نو ساخته می‌شود. */
  queuedOrders: number;
  /** «همان که دیده شد» برای فرم (`activationSeen`)؛ برگشت به پیش‌فرض متنی ندارد. */
  seen: string;
}

/** فایل بارگذاری‌شده: نام (فقط برای نمایش) و بایت‌ها. */
export interface TemplateFile {
  name: string;
  bytes: Uint8Array;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** نام فایل برای نمایش: بی پوشه، بی نویسهٔ کنترلی، و تا ۲۰۰ نویسه (`ticket_templates_file_name`). */
function displayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return [...clean].slice(0, 200).join('') || 'template.html';
}

/** متن قالب از فایل: HTML، تا سقف، و UTF-8 درست (BOM کنار می‌رود)؛ نویسهٔ صفر را پستگرس در متن نمی‌پذیرد. */
export function readTemplateFile(file: TemplateFile | null): Result<{ html: string; fileName: string }> {
  if (!file || file.bytes.byteLength === 0) return fail(400, 'template_file_required');
  if (!/\.html?$/i.test(file.name.trim())) return fail(400, 'template_not_html');
  if (file.bytes.byteLength > TICKET_TEMPLATE_MAX_BYTES) return fail(413, 'template_too_large');
  let html: string;
  try {
    html = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  } catch {
    return fail(400, 'template_not_utf8');
  }
  if (html.includes('\u0000')) return fail(400, 'template_not_utf8');
  if (!html.trim()) return fail(400, 'template_file_required');
  return ok({ html, fileName: displayName(file.name) });
}

export const templateSha256 = (html: string) => createHash('sha256').update(html, 'utf8').digest('hex');

export function createPanelTemplates(deps: PanelTemplatesDeps) {
  const { store } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error ?? ''));
  const actor = (session: AdminSession, ip: string): TemplateActor => ({ adminUserId: session.userId, ipHash: ipHashOf(deps.secret, ip) });

  async function kinds(): Promise<KindView[]> {
    const versions = await store.versions();
    return TICKET_TEMPLATE_KINDS.map((kind) => {
      const own = versions.filter((v) => v.kind === kind);
      return { kind, active: own.find((v) => v.isActive) ?? null, versions: own };
    });
  }

  /** یک نسخه و نسخهٔ فعال همان نوع؛ null یعنی نسخه نیست. */
  async function find(id: number): Promise<{ version: TicketTemplateVersion; active: TicketTemplateVersion | null } | null> {
    const all = await kinds();
    for (const view of all) {
      const version = view.versions.find((v) => v.id === id);
      if (version) return { version, active: view.active };
    }
    return null;
  }

  /** فایل پیش‌نمایش از استوریج، مثل دانلودهای سفارش (`orders.ts`، `streamed`). */
  async function stored(key: string, fileName: string, what: string): Promise<Result<DownloadFile>> {
    if (!deps.storage) return fail(503, 'storage_unavailable');
    try {
      const object = await deps.storage.getObject(key);
      if (!object) {
        log(`✗ ${what} ساخته شده ولی در استوریج نیست.`);
        return fail(503, 'storage_unavailable');
      }
      return ok({ body: object.body, sizeBytes: object.sizeBytes, fileName });
    } catch (error) {
      log(`✗ ${what} از استوریج خوانده نشد:`, error);
      return fail(503, 'storage_unavailable');
    }
  }

  return {
    /** هر دو نوع با نسخه‌ها و نسخهٔ فعال. */
    async overview(session: AdminSession): Promise<Result<TemplatesOverview>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      return ok({ now: now(), kinds: await kinds() });
    },

    async version(session: AdminSession, param: string): Promise<Result<TemplateVersionView>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      const ref = templateRefOf(param);
      const found = ref?.id ? await find(ref.id) : null;
      if (!found) return fail(404, 'template_not_found');
      return ok({ now: now(), ...found });
    },

    /** نسخهٔ تازه از فایل، و پیش‌نمایش با دادهٔ نمونه همان لحظه (ذخیره‌گاه). */
    async upload(session: AdminSession, input: { kind: unknown; file: TemplateFile | null }, ip: string): Promise<Result<TicketTemplateVersion>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      if (!isTemplateKind(input.kind)) return fail(400, 'invalid_template_kind');
      const read = readTemplateFile(input.file);
      if (!read.ok) return read;
      const { html, fileName } = read.value;
      return ok(await store.upload({ kind: input.kind, html, sha256: templateSha256(html), fileName, actor: actor(session, ip), at: now() }));
    },

    /**
     * پیش‌نمایش دوباره، با دادهٔ نمونه (`order` خالی) یا یک سفارش پرداخت‌شده که فایل‌هایش هنوز هست؛ پیش‌نمایشی که در حال ساختن است دوباره
     * در صف نمی‌رود. کارگر همین‌ها را دوباره می‌سنجد.
     */
    async preview(session: AdminSession, param: string, input: { order: unknown }, ip: string): Promise<Result<{ id: number }>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      const ref = templateRefOf(param);
      if (!ref?.id) return fail(404, 'template_not_found');
      const raw = toLatinDigits(text(input.order)).trim();
      let orderNumber: number | null = null;
      if (raw) {
        orderNumber = orderNumberOf(raw);
        if (orderNumber === null) return fail(400, 'order_number_invalid');
        const order = await store.previewOrder(orderNumber);
        if (!order) return fail(404, 'order_not_found');
        if (!isPaidStatus(order.status)) return fail(409, 'preview_order_unpaid');
        if (order.filesDeleted) return fail(410, 'preview_files_deleted');
      }
      const done = await store.requestPreview({ id: ref.id, orderNumber, actor: actor(session, ip), at: now() });
      if (done === 'not_found') return fail(404, 'template_not_found');
      if (done === 'busy') return fail(409, 'preview_busy');
      return ok({ id: ref.id });
    },

    /** صفحهٔ فعال کردن یک نسخه، یا برگشت به قالب پیش‌فرض (`default-<نوع>`). */
    async activation(session: AdminSession, param: string): Promise<Result<TemplateActivationView>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      const ref = templateRefOf(param);
      if (!ref) return fail(404, 'template_not_found');
      const all = await kinds();
      let kind: TicketTemplateKind;
      let target: TicketTemplateVersion | null = null;
      if (ref.id !== null) {
        const view = all.find((k) => k.versions.some((v) => v.id === ref.id));
        if (!view) return fail(404, 'template_not_found');
        kind = view.kind;
        target = view.versions.find((v) => v.id === ref.id)!;
      } else {
        kind = ref.kind;
      }
      const active = all.find((k) => k.kind === kind)!.active;
      if ((target?.id ?? null) === (active?.id ?? null)) return fail(409, 'already_active');
      return ok({ now: now(), kind, target, active, queuedOrders: await store.queuedOrders(), seen: target ? activationSeen(target) : '' });
    },

    /**
     * فعال کردن با کد تازه. پیش از کد: نسخه هست، نسخهٔ فعال همان است که صفحه دید، و نسخه پیش‌نمایش درستی دارد که همان است که دیده
     * شد؛ پس کد برای کاری که انجام‌شدنی نیست هدر نمی‌رود. همین‌ها را ذخیره‌گاه زیر قفل دوباره می‌سنجد. نسخه‌ای که همین حالا فعال است
     * موفق است، بی کد و بی کار دوباره (دو کلیک).
     */
    async activate(
      session: AdminSession,
      param: string,
      input: { active: unknown; seen: unknown; code: unknown },
      ip: string,
    ): Promise<Result<{ kind: TicketTemplateKind; version: number | null; requeued: number }>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      const ref = templateRefOf(param);
      if (!ref) return fail(404, 'template_not_found');
      const all = await kinds();
      const view = ref.id !== null ? all.find((k) => k.versions.some((v) => v.id === ref.id)) : all.find((k) => k.kind === ref.kind);
      if (!view) return fail(404, 'template_not_found');
      const target = ref.id !== null ? view.versions.find((v) => v.id === ref.id)! : null;
      const activeId = view.active?.id ?? null;
      if ((target?.id ?? null) === activeId) return ok({ kind: view.kind, version: target?.version ?? null, requeued: 0 });
      const seenActive = text(input.active);
      const expectedActive = seenActive === '' ? null : /^[1-9][0-9]{0,8}$/.test(seenActive) ? Number(seenActive) : undefined;
      if (expectedActive !== activeId) return fail(409, 'template_changed');
      const seen = text(input.seen);
      if (target) {
        if (!target.preview.at || target.preview.error !== null) return fail(409, 'template_no_preview');
        if (activationSeen(target) !== seen) return fail(409, 'template_changed');
      }

      const stepped = await deps.stepUp(session, input.code, ip);
      if (!stepped.ok) return stepped;
      const done = await store.activate({
        kind: view.kind,
        id: target?.id ?? null,
        expectedActive: activeId,
        verify: (row) => activationSeen({ sha256: row.sha256, preview: { at: row.previewAt } }) === seen,
        actor: actor(session, ip),
        at: now(),
      });
      if (done.ok) return ok({ kind: view.kind, version: target?.version ?? null, requeued: done.requeued });
      if (done.reason === 'not_found') return fail(404, 'template_not_found');
      return fail(409, done.reason === 'no_preview' ? 'template_no_preview' : 'template_changed');
    },

    /** متن یک نسخه، یا قالب پیش‌فرض (`default-<نوع>`)، برای دانلود. */
    async source(session: AdminSession, param: string): Promise<Result<{ fileName: string; html: string }>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      const ref = templateRefOf(param);
      if (!ref) return fail(404, 'template_not_found');
      if (ref.id === null) return ok({ fileName: templateFileName(ref.kind, null), html: DEFAULT_TICKET_TEMPLATES[ref.kind] });
      const row = await store.source(ref.id);
      if (!row) return fail(404, 'template_not_found');
      return ok({ fileName: templateFileName(row.kind, row.version), html: row.html });
    },

    /** PDF پیش‌نمایش یا PNG صفحهٔ `page` آن، از آخرین پیش‌نمایش درست نسخه. */
    async previewFile(session: AdminSession, param: string, what: 'pdf' | { page: number }): Promise<Result<DownloadFile>> {
      if (!can(session, 'templates.manage')) return fail(403, 'forbidden');
      const ref = templateRefOf(param);
      const found = ref?.id ? await find(ref.id) : null;
      if (!found) return fail(404, 'template_not_found');
      const { version } = found;
      const { preview } = version;
      if (!preview.pdfKey || !preview.pngKey || !preview.pages) return fail(409, 'template_no_preview');
      if (preview.gone) return fail(410, 'preview_files_deleted');
      const label = `پیش‌نمایش نسخهٔ ${version.version} قالب ${version.kind}`;
      if (what === 'pdf') return stored(preview.pdfKey, previewFileName(version.kind, version.version), label);
      if (!Number.isInteger(what.page) || what.page < 1 || what.page > preview.pages) return fail(404, 'template_not_found');
      return stored(previewKeyOf(preview.pngKey, what.page), `pishnamayesh-${version.id}-${what.page}.png`, label);
    },
  };
}

export type PanelTemplates = ReturnType<typeof createPanelTemplates>;
