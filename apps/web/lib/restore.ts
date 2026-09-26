/**
 * خواندن پیش‌نویس سفارش همین زبانه و برگرداندن جزوه (برش ۳د، ADR-036؛ نوشتنش در `lib/draft.ts`).
 *
 * فقط وقتی بار می‌شود که پیش‌نویسی هست (`components/Restore.tsx`)، نه با رابط پس از فایل: راه اولین قیمت سبک
 * می‌ماند.
 *
 * - **سنجش دست‌نویس، نه zod** (قاعدهٔ باندل، ADR-018). پیش‌نویسی که شکلش نمی‌خواند (نسخهٔ دیگر، بریده،
 *   دستکاری‌شده) یعنی «پیش‌نویسی نیست»، نه خطا؛ تکهٔ خراب مسیر خرید یا تنظیمات فقط همان تکه را کنار می‌گذارد.
 * - **عدد صفحه‌ها و رنگ از خود سرور** (`GET /api/uploads/<id>`، مالکیت با `jy_sid`)، که منبع حقیقت است (قاعدهٔ ۲).
 *
 * خالص، بی React: حافظه (`Storage`) و درخواست‌ها تزریقی‌اند و تست واحد دارند.
 */

import type { Place } from '@jozveyar/contracts/checkout';
import { MAX_SECTIONS_PER_ITEM } from '@jozveyar/contracts/constants';
import { fileKind } from './analysis-protocol';
import type { CheckoutDraft, Otp } from './checkout/store';
import { DRAFT_VERSION, type Draft, type DraftFile } from './draft';
import { DRAFT_KEY } from './draftKey';
import { INITIAL, type AnalysisState } from './fileAnalysis';
import type { RestoredSection } from './jozveController';
import type { OrderConfig } from './orderConfig';
import type { RecipientInput } from './recipient';
import type { ServerAnalysisView } from './server/uploads';

/* ─────────────────────────── خواندن ─────────────────────────── */

export function readDraft(storage: Pick<Storage, 'getItem'> | null): Draft | null {
  try {
    return parseDraft(storage?.getItem(DRAFT_KEY) ?? null);
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const isId = (value: unknown, min = 1): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** شناسهٔ سند و توکن سفارش، به همان شکلی که سرور می‌سازد و می‌پذیرد. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** سقف طول‌ها همان سقف اسکیمای سرور است (`@jozveyar/contracts/checkout`)؛ بیشتر یعنی پیش‌نویس ما نیست. */
const MAX = { fileName: 1000, name: 200, address: 2000, postal: 40, mobile: 40, payload: 20_000 } as const;
const OTP_CLOSED: ReadonlySet<unknown> = new Set([null, 'expired', 'locked', 'missing']);

function fileOf(value: unknown): DraftFile | null {
  if (!isObject(value)) return null;
  const { name, size, lastModified, documentId } = value;
  if (!isText(name, MAX.fileName) || name === '' || !isId(size, 0) || !isTime(lastModified)) return null;
  if (documentId !== null && !isUuid(documentId)) return null;
  return { name, size, lastModified, documentId };
}

function configOf(value: unknown): OrderConfig | null {
  if (!isObject(value)) return null;
  const { colorMode, sidesMode, bindingTypeId, paperTypeId, copies } = value;
  if (colorMode !== 'bw' && colorMode !== 'color') return null;
  if (sidesMode !== 'single' && sidesMode !== 'double') return null;
  if (!isText(bindingTypeId, 40) || !isText(paperTypeId, 40) || !isId(copies) || copies > 1000) return null;
  return { colorMode, sidesMode, bindingTypeId, paperTypeId, copies };
}

function placeOf(value: unknown): Place | null {
  if (!isObject(value)) return null;
  const { provinceId, cityId } = value;
  return isId(provinceId) && (cityId === null || isId(cityId)) ? { provinceId, cityId } : null;
}

function recipientOf(value: unknown): RecipientInput | null {
  if (!isObject(value)) return null;
  const { name, addressText, postalCode } = value;
  if (!isText(name, MAX.name) || !isText(addressText, MAX.address)) return null;
  if (postalCode !== null && !isText(postalCode, MAX.postal)) return null;
  return { name, addressText, postalCode };
}

function otpOf(value: unknown): Otp | null {
  if (!isObject(value)) return null;
  const { mobile, resendAt, expiresAt, closed } = value;
  if (!isText(mobile, MAX.mobile) || !isTime(resendAt) || !isTime(expiresAt) || !OTP_CLOSED.has(closed)) return null;
  return { mobile, resendAt, expiresAt, closed: closed as Otp['closed'] };
}

function checkoutOf(value: unknown): CheckoutDraft | null {
  if (!isObject(value)) return null;
  const place = value.place === null ? null : placeOf(value.place);
  const recipient = recipientOf(value.recipient);
  const otp = value.otp === null ? null : otpOf(value.otp);
  const pay = value.pay;
  const payOk = pay === null || (isObject(pay) && isText(pay.payload, MAX.payload) && isUuid(pay.key));
  if ((value.place !== null && !place) || !recipient || (value.otp !== null && !otp) || !payOk) return null;
  if (!isText(value.mobile, MAX.mobile) || (value.order !== null && !isUuid(value.order))) return null;
  return {
    place,
    recipient,
    mobile: value.mobile,
    otp,
    pay: pay === null ? null : { payload: (pay as Json).payload as string, key: (pay as Json).key as string },
    order: value.order,
  };
}

/** پیش‌نویس سنجیده، یا null. */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(value) || value.v !== DRAFT_VERSION || !Array.isArray(value.files)) return null;
  if (value.files.length === 0 || value.files.length > MAX_SECTIONS_PER_ITEM) return null;
  const files = value.files.map(fileOf);
  if (files.some((file) => file === null)) return null;
  return {
    v: DRAFT_VERSION,
    files: files as DraftFile[],
    config: value.config == null ? null : configOf(value.config),
    checkout: value.checkout == null ? null : checkoutOf(value.checkout),
  };
}

/* ─────────────────────────── برگشت ─────────────────────────── */

/** سرور دربارهٔ سند یک فایل برگشته چه می‌گوید. */
export type DocumentStatus =
  /** فایل روی سرور رسیده؛ بررسی سرور هر جا که هست (شاید هنوز در راه). */
  | { kind: 'arrived'; analysis: ServerAnalysisView }
  /** آپلودش نیمه‌کاره ماند؛ همان فایل از همان تکه ادامه می‌دهد (ADR-024). */
  | { kind: 'partial' }
  /** دیگر روی سرور نیست: پاک یا منقضی شده، یا مال نشست این مرورگر نیست (`jy_sid` رفته). */
  | { kind: 'gone' }
  /** سرور جواب روشنی نداد (شبکه، ۵۰۳). */
  | { kind: 'unknown' };

export interface StatusDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** هر تلاش حداکثر این‌قدر؛ صفحه تا جواب «در حال برگرداندن جزوه…» است، پس نباید بی‌پایان بماند. */
  timeoutMs?: number;
}

/** وضعیت یک سند، با همان مسیر ادامهٔ آپلود (`GET /api/uploads/<id>`، مالکیت با `jy_sid`). دو تلاش. */
export async function documentStatus(documentId: string, deps: StatusDeps): Promise<DocumentStatus> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (attempt > 1) await deps.sleep(1000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 6000);
    try {
      const response = await deps.fetch(`/api/uploads/${encodeURIComponent(documentId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 404) return { kind: 'gone' };
      if (response.ok) {
        const body = (await response.json()) as { status?: string; analysis?: ServerAnalysisView };
        if (body.status === 'uploaded' && body.analysis) return { kind: 'arrived', analysis: body.analysis };
        if (body.status === 'uploading') return { kind: 'partial' };
        if (body.status === 'failed') return { kind: 'gone' };
      }
    } catch {
      // شبکه یا مهلت؛ یک بار دیگر.
    } finally {
      clearTimeout(timer);
    }
  }
  return { kind: 'unknown' };
}

/**
 * یک فایل برگشته، برای صف جزوه (`jozve.restore`). فایلی که روی سرور است، عدد و رنگ و هشدارش را از سرور می‌گیرد،
 * مثل مسیر سرور (`needs_server`)؛ بقیه منتظر همان فایل‌اند (`awaitsFile`). سند نیمه‌کاره، یا سندی که سرور درباره‌اش
 * جواب نداد، می‌ماند تا همان فایل از همان تکه ادامه دهد یا با فایل دیگر پاک شود.
 */
export function restoredSection(file: DraftFile, status: DocumentStatus | null): RestoredSection {
  const { name, size, lastModified, documentId } = file;
  const analysis: AnalysisState = { ...INITIAL, fileName: name, fileSize: size };
  if (status?.kind === 'arrived' && documentId) {
    return {
      file: { name, size, lastModified, documentId },
      kind: fileKind(name),
      analysis: { ...analysis, phase: 'needs_server' },
      upload: { phase: 'done', documentId, sentBytes: size, totalBytes: size, analysis: status.analysis },
    };
  }
  const keep = status?.kind === 'partial' || status?.kind === 'unknown';
  return { file: { name, size, lastModified, documentId: keep ? documentId : null }, kind: fileKind(name), analysis, upload: null };
}

/**
 * فایل‌های پیش‌نویس، با وضعیت سندهایشان از سرور، هم‌زمان. null یعنی جزوه برنمی‌گردد: همهٔ فایل‌ها روی سرور بودند
 * و دیگر نیستند (نشست رفته، پاک‌شده) — صفحهٔ معمول، با یک خط که چرا.
 */
export async function restoredSections(
  files: readonly DraftFile[],
  status: (documentId: string) => Promise<DocumentStatus>,
): Promise<RestoredSection[] | null> {
  const statuses = await Promise.all(files.map((file) => (file.documentId ? status(file.documentId) : null)));
  if (statuses.every((s) => s?.kind === 'gone')) return null;
  return files.map((file, i) => restoredSection(file, statuses[i] ?? null));
}
