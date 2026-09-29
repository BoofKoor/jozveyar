/**
 * ارسال در پنل (برش ۶٫۱، ADR-045، ADR-046): ذخیره‌گاه زبانهٔ «ارسال» — بارگذاری فایل پست، پیش‌نمایش، «ثبت»، «دور بینداز» و
 * برگرداندن. تفسیر جدول و حکم هر سطر خالص است و در `postfile.ts`؛ اینجا همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **همان فایل یک بار** (`shipment_imports_one_file`): فایلی که هنوز «در حال خواندن»، «خوانده شد» یا «ثبت شد» است ورود دوم
 *    نمی‌سازد؛ دو بارگذاری هم‌زمان یکی می‌شوند و دومی همان ورود اول را می‌بیند.
 *  - **«ثبت» همان که دیده شد** (مثل ۴٫۵ و ۴٫۶): ورود زیر قفل ردیف؛ سفارش‌های شماره‌های فایل زیر قفل، به ترتیب شناسه (دو «ثبت»
 *    هم‌زمان بن‌بست نمی‌سازند)؛ حکم‌ها دوباره با همان تابع؛ و فقط اگر اثر انگشتشان همان پیش‌نمایش است. فایل هم‌پوشانی که همین
 *    حالا ثبت شد، یا تغییر وضعیت هم‌زمان، حکم‌ها را عوض کرده و پیش‌نمایش تازه می‌خواهد (`changed`)؛ بارکدی که همین حالا برای
 *    سفارش دیگری نشست به ایندکس یکتای `shipments_live_barcode` می‌خورد، و همان `changed` است.
 *  - **یک تراکنش:** سطرها، مرسوله‌ها، «تحویل پست شد» سفارش‌های «در حال چاپ» با ردیف `order_status_events`، و رویداد ادمین.
 *  - **برگرداندن** (فقط `committed`، یک بار): مرسوله‌های ورود کنار می‌روند، نه پاک؛ و سفارش‌هایی که همین ورود «تحویل پست شد»
 *    کرده بود، اگر مرسولهٔ زندهٔ دیگری ندارند، به «در حال چاپ» برمی‌گردند. سفارشی که فایل‌هایش پاک شده (ADR-044) همان می‌ماند.
 *  - **محدوده** (ADR-042): هر تابع محدودهٔ نشست را آرگومان اول می‌گیرد، و ورود چاپخانه فقط در محدودهٔ همان چاپخانه دیده می‌شود.
 *    حکم‌ها، هر که ببیند، فقط سفارش‌های محدودهٔ واردکننده را می‌شناسند (`importScope`)، پس حکم به بیننده بسته نیست.
 */

import { createHash } from 'node:crypto';

import { and, asc, desc, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, SelectedFields } from 'drizzle-orm/pg-core';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { Database } from './index.js';
import { ALL_ORDERS, ordersInScope, type PanelScope } from './panel.js';
import {
  FIRST_ORDER_NUMBER,
  IRAN_POST,
  handedAtOf,
  judgeRows,
  judgedFingerprint,
  readPostSheet,
  type Judged,
  type LiveShipment,
  type OrderFacts,
  type PostRow,
  type PostSheet,
  type Verdict,
} from './postfile.js';
import {
  adminEvents,
  cities,
  jobs,
  orderStatusEvents,
  orders,
  printPartners,
  provinces,
  shipmentImportRows,
  shipmentImports,
  shipments,
} from './schema.js';

/** کار خواندن فایل پست در صف کارگر (ADR-045): بایت ← جدول رشته‌ها. */
export const READ_POST_FILE_JOB = 'read_post_file';

export const SHIPMENT_IMPORT_STATUSES = ['reading', 'read', 'unreadable', 'committed', 'discarded', 'reverted'] as const;
export type ShipmentImportStatus = (typeof SHIPMENT_IMPORT_STATUSES)[number];

/** حکم سطر ثبت‌شده: حکم‌های `judgeRows`، و ردیف «جمع کل». */
export type StoredVerdict = Verdict | 'total';

/** یک ورود، بی بایت خام و جدول‌ها، با نام کسانی که کاری کردند. */
export interface ShipmentImportView {
  id: string;
  carrier: string;
  filename: string;
  sizeBytes: number;
  status: ShipmentImportStatus;
  format: string | null;
  /** خوانده نشد: کد کارگر (`xls_binary`، `no_table`…) یا `read_failed` پس از آخرین تلاش. */
  errorCode: string | null;
  /** واردکنندهٔ چاپخانه (۶٫۲): محدودهٔ حکم‌ها. */
  partner: { id: string; name: string } | null;
  createdAt: Date;
  createdByName: string;
  readAt: Date | null;
  committedAt: Date | null;
  committedByName: string | null;
  discardedAt: Date | null;
  /** null با `discardedAt` یعنی کارگر: پیش‌نویسی که N روز ثبت نشد. */
  discardedByName: string | null;
  revertedAt: Date | null;
  revertedByName: string | null;
  revertReason: string | null;
  /** بایت خام و جدول‌ها پاک شد (دور انداختن، یا N روز پس از ورود). */
  purgedAt: Date | null;
  /** کار خواندن؛ «در حال خواندن» با شمار تلاش‌ها. */
  job: { status: 'queued' | 'running' | 'done' | 'failed'; attempts: number; maxAttempts: number } | null;
}

/** یک ورود در فهرست «ورودها»، با شمارهای سطرهای ثبت‌شده؛ ورود ثبت‌نشده شمار ندارد. */
export interface ShipmentImportLine extends ShipmentImportView {
  counts: Partial<Record<StoredVerdict, number>>;
  liveShipments: number;
  voidedShipments: number;
  /** سفارش‌هایی که همین ورود «تحویل پست شد» کرد. */
  handedOrders: number;
  /** روز «تاریخ ثبت» اولین و آخرین سطر ثبت‌شده. */
  firstPostDay: Date | null;
  lastPostDay: Date | null;
}

/** سفارشی که سطری به آن اشاره می‌کند، با آنچه حکم و پیام‌های پنل لازم دارند. */
export interface ShipmentOrderFacts extends OrderFacts {
  provinceName: string;
  cityName: string | null;
  handedToPostAt: Date | null;
  estWeightGrams: number;
}

/** مرسولهٔ دیگری با همین بارکد؛ جز بارکد، همه null اگر سفارشش بیرون از محدودهٔ واردکننده است. */
export interface ShipmentElsewhere {
  barcode: string;
  orderId: string | null;
  orderNumber: number | null;
  importId: string | null;
  filename: string | null;
  createdAt: Date | null;
  voidedAt: Date | null;
}

/** پیش‌نمایش ورود «خوانده شد»: جدول تفسیرشده، حکم هر سطر، و اثر انگشتی که «ثبت» با آن می‌آید. */
export interface ShipmentPreview {
  sheet: PostSheet;
  /** هم‌ترتیب `sheet.rows`؛ خالی اگر ستونی کم است. */
  judged: Judged[];
  orders: ShipmentOrderFacts[];
  /** مرسوله‌های زندهٔ بارکدهای همین فایل. */
  live: ShipmentElsewhere[];
  fingerprint: string;
}

export type StoredImportRow = typeof shipmentImportRows.$inferSelect;

/** مرسوله‌ای که از همین ورود ساخته شد. */
export interface ImportShipment {
  id: string;
  rowNo: number;
  orderId: string;
  barcode: string;
  handedOrder: boolean;
  voidedAt: Date | null;
  voidReason: string | null;
}

/** ورود ثبت‌شده یا برگشته: سطرها با حکم‌هایشان، سفارش‌ها و مرسوله‌ها. */
export interface CommittedImport {
  rows: StoredImportRow[];
  orders: ShipmentOrderFacts[];
  shipments: ImportShipment[];
  /** «تکراری»: مرسوله‌های همان بارکدها از ورودهای دیگر، قدیمی‌ترین اول. */
  elsewhere: ShipmentElsewhere[];
}

export type ShipmentImportPage =
  | { kind: 'plain'; import: ShipmentImportView }
  | { kind: 'preview'; import: ShipmentImportView; preview: ShipmentPreview }
  | { kind: 'committed'; import: ShipmentImportView; committed: CommittedImport };

export interface NewShipmentImport {
  filename: string;
  raw: Buffer;
  createdBy: string;
  at: Date;
  /** `shipments.upload`؛ هدف و نام فایل را ذخیره‌گاه می‌گذارد. */
  event: AdminEventInput;
}

export type ShipmentImportCreate =
  | { ok: true; id: string }
  /** همان فایل هنوز زنده است؛ `existing` null یعنی بیرون از محدودهٔ این نشست. */
  | { ok: false; reason: 'same_file'; existing: ShipmentImportView | null };

export interface ShipmentCommit {
  id: string;
  /** اثر انگشت حکم‌هایی که ادمین در پیش‌نمایش دید. */
  fingerprint: string;
  at: Date;
  adminUserId: string;
  /** `shipments.commit`؛ شمارها و سفارش‌ها را ذخیره‌گاه می‌افزاید. */
  event: AdminEventInput;
}

export type ShipmentCommitWrite =
  | { ok: true; counts: Partial<Record<Verdict, number>>; shipments: number; handed: number[] }
  | { ok: false; reason: 'not_found' | 'changed' }
  | { ok: false; reason: 'status'; status: ShipmentImportStatus };

export interface ShipmentRevert {
  id: string;
  reason: string;
  at: Date;
  adminUserId: string;
  /** `shipments.revert`؛ شمارها و سفارش‌ها را ذخیره‌گاه می‌افزاید. */
  event: AdminEventInput;
}

export type ShipmentRevertWrite =
  | {
      ok: true;
      voided: number;
      /** به «در حال چاپ» برگشتند. */
      reopened: number[];
      /** همین ورود «تحویل پست شد» کرده بود و همان ماند: مرسولهٔ زندهٔ دیگری دارد، یا فایل‌هایش پاک شده. */
      kept: number[];
    }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'status'; status: ShipmentImportStatus };

export type ShipmentDiscardWrite =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'status'; status: ShipmentImportStatus };

/**
 * ذخیره‌گاه زبانهٔ «ارسال». هر تابع محدودهٔ نشست (`PanelScope`) را آرگومان اول می‌گیرد؛ ورود بیرون از محدوده همان «نیست» است.
 */
export interface ShipmentStore {
  /**
   * بارگذاری: ورود تازه با بایت خام و sha256 آن، کار `read_post_file` و رویداد، در یک تراکنش. ورود نشست چاپخانه به همان
   * چاپخانه بسته است. همان فایل که هنوز زنده است: `same_file`.
   */
  createImport(scope: PanelScope, input: NewShipmentImport): Promise<ShipmentImportCreate>;
  /** ورودهای محدوده، تازه‌ترین اول. */
  listImports(scope: PanelScope, page: { limit: number; offset: number }): Promise<ShipmentImportLine[]>;
  /** یک ورود با آنچه صفحه‌اش لازم دارد: پیش‌نمایش برای «خوانده شد»، سطرها و مرسوله‌ها برای ثبت‌شده و برگشته. */
  importPage(scope: PanelScope, id: string, now: Date): Promise<ShipmentImportPage | null>;
  /** «ثبت»، فقط اگر حکم‌ها زیر قفل همان است که ادمین دید. */
  commit(scope: PanelScope, input: ShipmentCommit): Promise<ShipmentCommitWrite>;
  /** «دور بینداز»: ورودی که هنوز ثبت نشده، با پاک شدن بایت خام و جدول‌ها. */
  discard(scope: PanelScope, input: { id: string; at: Date; adminUserId: string; event: AdminEventInput }): Promise<ShipmentDiscardWrite>;
  /** برگرداندن کل یک ورود ثبت‌شده، یک بار، با دلیل. */
  revert(scope: PanelScope, input: ShipmentRevert): Promise<ShipmentRevertWrite>;
}

type PgError = { code?: string; constraint_name?: string; cause?: PgError };

/** نام محدودیتی که پستگرس رد کرد؛ drizzle خطای درایور را در `cause` می‌پیچد. */
function constraintOf(error: unknown): string | undefined {
  const pg = error as PgError;
  return pg?.cause?.constraint_name ?? pg?.constraint_name;
}

type Db = Database['db'];
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Reader = Pick<Db, 'select'>;

/** ورودهایی که نشست می‌بیند: همه، یا فقط ورودهای همان چاپخانه. */
function importsInScope(scope: PanelScope): SQL | undefined {
  return scope.kind === 'partner' ? eq(shipmentImports.printPartnerId, scope.partnerId) : undefined;
}

/** محدودهٔ حکم‌های یک ورود: محدودهٔ واردکننده، نه بیننده. */
export function importScope(printPartnerId: string | null): PanelScope {
  return printPartnerId === null ? ALL_ORDERS : { kind: 'partner', partnerId: printPartnerId };
}

/** ورودی که بایت خامش هنوز همان فایل است و «همان فایل» حساب می‌شود. */
const LIVE_FILE: ShipmentImportStatus[] = ['reading', 'read', 'committed'];

/** دسته‌های درج: هر سطر فایل تا ۱۶ پارامتر؛ پستگرس بیش از ۶۵٬۵۳۵ پارامتر در یک دستور نمی‌گیرد. */
const BATCH = 500;

const adminName = (column: AnyPgColumn) => sql<string | null>`(SELECT u.display_name FROM admin_users u WHERE u.id = ${column})`;

const viewFields = {
  id: shipmentImports.id,
  carrier: shipmentImports.carrier,
  filename: shipmentImports.filename,
  sizeBytes: shipmentImports.sizeBytes,
  status: shipmentImports.status,
  format: shipmentImports.format,
  errorCode: shipmentImports.errorCode,
  partnerId: shipmentImports.printPartnerId,
  partnerName: printPartners.name,
  createdAt: shipmentImports.createdAt,
  createdByName: adminName(shipmentImports.createdBy),
  readAt: shipmentImports.readAt,
  committedAt: shipmentImports.committedAt,
  committedByName: adminName(shipmentImports.committedBy),
  discardedAt: shipmentImports.discardedAt,
  discardedByName: adminName(shipmentImports.discardedBy),
  revertedAt: shipmentImports.revertedAt,
  revertedByName: adminName(shipmentImports.revertedBy),
  revertReason: shipmentImports.revertReason,
  purgedAt: shipmentImports.purgedAt,
  jobStatus: jobs.status,
  jobAttempts: jobs.attempts,
  jobMaxAttempts: jobs.maxAttempts,
};

function viewQuery<F extends SelectedFields>(q: Reader, extra: F) {
  return q
    .select({ ...viewFields, ...extra })
    .from(shipmentImports)
    .leftJoin(printPartners, eq(printPartners.id, shipmentImports.printPartnerId))
    .leftJoin(jobs, and(eq(jobs.shipmentImportId, shipmentImports.id), eq(jobs.kind, READ_POST_FILE_JOB)));
}

/** ردیف `viewFields`، همان‌طور که drizzle می‌دهد. */
interface ViewRow {
  id: string;
  carrier: string;
  filename: string;
  sizeBytes: number;
  status: string;
  format: string | null;
  errorCode: string | null;
  partnerId: string | null;
  partnerName: string | null;
  createdAt: Date;
  createdByName: string | null;
  readAt: Date | null;
  committedAt: Date | null;
  committedByName: string | null;
  discardedAt: Date | null;
  discardedByName: string | null;
  revertedAt: Date | null;
  revertedByName: string | null;
  revertReason: string | null;
  purgedAt: Date | null;
  jobStatus: 'queued' | 'running' | 'done' | 'failed' | null;
  jobAttempts: number | null;
  jobMaxAttempts: number | null;
}

function toView(v: ViewRow): ShipmentImportView {
  return {
    id: v.id,
    carrier: v.carrier,
    filename: v.filename,
    sizeBytes: v.sizeBytes,
    status: v.status as ShipmentImportStatus,
    format: v.format,
    errorCode: v.errorCode,
    partner: v.partnerId ? { id: v.partnerId, name: v.partnerName ?? '' } : null,
    createdAt: v.createdAt,
    createdByName: v.createdByName ?? '',
    readAt: v.readAt,
    committedAt: v.committedAt,
    committedByName: v.committedByName,
    discardedAt: v.discardedAt,
    discardedByName: v.discardedByName,
    revertedAt: v.revertedAt,
    revertedByName: v.revertedByName,
    revertReason: v.revertReason,
    purgedAt: v.purgedAt,
    job: v.jobStatus ? { status: v.jobStatus, attempts: v.jobAttempts ?? 0, maxAttempts: v.jobMaxAttempts ?? 0 } : null,
  };
}

/** سفارش‌های محدوده، با آنچه حکم و پیام‌ها لازم دارند؛ با `lock`، زیر قفل ردیف و به ترتیب شناسه. */
function factsQuery(q: Reader, scope: PanelScope, where: SQL, lock: boolean) {
  const query = q
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      recipientName: orders.recipientName,
      provinceId: orders.provinceId,
      cityId: orders.cityId,
      paidAt: orders.paidAt,
      provinceName: provinces.nameFa,
      cityName: cities.nameFa,
      handedToPostAt: orders.handedToPostAt,
      estWeightGrams: orders.estWeightGrams,
    })
    .from(orders)
    .innerJoin(provinces, eq(provinces.id, orders.provinceId))
    .leftJoin(cities, eq(cities.id, orders.cityId))
    .where(and(where, ordersInScope(scope)))
    .orderBy(asc(orders.id));
  // فقط ردیف سفارش؛ قفل استان و شهر درج هر سفارش تازه را پشت این نگه می‌داشت.
  return lock ? query.for('update', { of: orders }) : query;
}

/**
 * مرسوله‌های همین بارکدها؛ `live` فقط زنده‌ها. جز بارکد، هر چیز سفارشی بیرون از محدودهٔ واردکننده null است: وجودش به حکم
 * می‌رسد (صف تأیید)، نه شماره و فایلش.
 */
function elsewhereQuery(q: Reader, scope: PanelScope, barcodes: string[], where?: SQL) {
  const visible = scope.kind === 'all' ? sql`true` : sql`${orders.printPartnerId} = ${scope.partnerId}`;
  const shown = <T>(value: SQL) => sql<T | null>`CASE WHEN ${visible} THEN ${value} END`;
  return q
    .select({
      barcode: shipments.barcode,
      orderId: shown<string>(sql`${shipments.orderId}`),
      orderNumber: shown<number>(sql`${orders.orderNumber}`),
      importId: shown<string>(sql`${shipments.importId}`),
      filename: shown<string>(sql`${shipmentImports.filename}`),
      createdAt: shown<Date>(sql`${shipments.createdAt}`).mapWith(shipments.createdAt),
      voidedAt: shown<Date>(sql`${shipments.voidedAt}`).mapWith(shipments.voidedAt),
    })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .innerJoin(shipmentImports, eq(shipmentImports.id, shipments.importId))
    .where(and(inArray(shipments.barcode, barcodes), where))
    .orderBy(asc(shipments.createdAt), asc(shipments.id));
}

/** شماره‌های سفارش‌های سایت و بارکدهای درست یک فایل. */
function keysOf(rows: readonly PostRow[]) {
  const numbers = [...new Set(rows.flatMap((row) => (row.orderNumber !== null && row.orderNumber >= FIRST_ORDER_NUMBER ? [row.orderNumber] : [])))];
  const barcodes = [...new Set(rows.flatMap((row) => (row.barcode ? [row.barcode] : [])))];
  return { numbers, barcodes };
}

/** سفارش‌ها و مرسوله‌های زندهٔ یک فایل، و حکم‌هایش. */
async function judge(q: Reader, scope: PanelScope, rows: readonly PostRow[], now: Date, lock: boolean) {
  const { numbers, barcodes } = keysOf(rows);
  const [facts, live] = await Promise.all([
    numbers.length === 0 ? Promise.resolve([]) : factsQuery(q, scope, inArray(orders.orderNumber, numbers), lock),
    barcodes.length === 0 ? Promise.resolve([]) : elsewhereQuery(q, scope, barcodes, isNull(shipments.voidedAt)),
  ]);
  const judged = judgeRows(rows, {
    orders: new Map(facts.map((order) => [order.orderNumber, order])),
    live: new Map(live.map((s): [string, LiveShipment] => [s.barcode, { barcode: s.barcode, orderId: s.orderId }])),
    now,
  });
  return { facts: facts as ShipmentOrderFacts[], live: live as ShipmentElsewhere[], judged };
}

function countOf(verdicts: readonly Verdict[]): Partial<Record<Verdict, number>> {
  const counts: Partial<Record<Verdict, number>> = {};
  for (const verdict of verdicts) counts[verdict] = (counts[verdict] ?? 0) + 1;
  return counts;
}

export function createShipmentStore({ db }: Database): ShipmentStore {
  async function preview(tables: string[][][], scope: PanelScope, now: Date): Promise<ShipmentPreview> {
    const sheet = readPostSheet(tables);
    if (!sheet.ok) return { sheet, judged: [], orders: [], live: [], fingerprint: judgedFingerprint([]) };
    const { facts, live, judged } = await judge(db, scope, sheet.rows, now, false);
    return { sheet, judged, orders: facts, live, fingerprint: judgedFingerprint(judged) };
  }

  async function committed(importId: string, scope: PanelScope): Promise<CommittedImport> {
    const rows = await db
      .select()
      .from(shipmentImportRows)
      .where(eq(shipmentImportRows.importId, importId))
      .orderBy(asc(shipmentImportRows.rowNo));
    const orderIds = [...new Set(rows.flatMap((row) => (row.orderId ? [row.orderId] : [])))];
    const duplicates = [...new Set(rows.flatMap((row) => (row.verdict === 'duplicate' && row.barcode ? [row.barcode] : [])))];
    const [facts, made, elsewhere] = await Promise.all([
      orderIds.length === 0 ? Promise.resolve([]) : factsQuery(db, scope, inArray(orders.id, orderIds), false),
      db
        .select({
          id: shipments.id,
          rowNo: shipments.rowNo,
          orderId: shipments.orderId,
          barcode: shipments.barcode,
          handedOrder: shipments.handedOrder,
          voidedAt: shipments.voidedAt,
          voidReason: shipments.voidReason,
        })
        .from(shipments)
        .where(eq(shipments.importId, importId))
        .orderBy(asc(shipments.rowNo)),
      duplicates.length === 0 ? Promise.resolve([]) : elsewhereQuery(db, scope, duplicates, ne(shipments.importId, importId)),
    ]);
    return { rows, orders: facts as ShipmentOrderFacts[], shipments: made, elsewhere: elsewhere as ShipmentElsewhere[] };
  }

  return {
    async createImport(scope, input) {
      const sha256 = createHash('sha256').update(input.raw).digest('hex');
      return db.transaction(async (tx): Promise<ShipmentImportCreate> => {
        // همان فایل که هنوز زنده است به ایندکس یکتای جزئی می‌خورد و هیچ نمی‌سازد؛ بارگذاری هم‌زمانش پشت همین درج می‌ماند و
        // پس از commit آن، همان را می‌بیند.
        const [created] = await tx
          .insert(shipmentImports)
          .values({
            carrier: IRAN_POST.id,
            filename: input.filename,
            sizeBytes: input.raw.length,
            sha256,
            raw: input.raw,
            printPartnerId: scope.kind === 'partner' ? scope.partnerId : null,
            createdBy: input.createdBy,
            createdAt: input.at,
          })
          .onConflictDoNothing()
          .returning({ id: shipmentImports.id });
        if (!created) {
          const [existing] = await viewQuery(tx, {})
            .where(and(eq(shipmentImports.sha256, sha256), inArray(shipmentImports.status, LIVE_FILE), importsInScope(scope)))
            .limit(1);
          return { ok: false, reason: 'same_file', existing: existing ? toView(existing) : null };
        }
        await tx.insert(jobs).values({ kind: READ_POST_FILE_JOB, shipmentImportId: created.id });
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            targetType: 'shipment_import',
            targetId: created.id,
            detail: { ...(input.event.detail as Record<string, unknown> | undefined), filename: input.filename, sizeBytes: input.raw.length },
          }),
        );
        return { ok: true, id: created.id };
      });
    },

    async listImports(scope, { limit, offset }) {
      const rows = await viewQuery(db, {
        counts: sql<Partial<Record<StoredVerdict, number>>>`(SELECT coalesce(jsonb_object_agg(c.verdict, c.n), '{}'::jsonb)
          FROM (SELECT r.verdict, count(*)::int AS n FROM shipment_import_rows r
                 WHERE r.import_id = ${shipmentImports.id} GROUP BY r.verdict) c)`,
        liveShipments: sql<number>`(SELECT count(*)::int FROM shipments s
          WHERE s.import_id = ${shipmentImports.id} AND s.voided_at IS NULL)`,
        voidedShipments: sql<number>`(SELECT count(*)::int FROM shipments s
          WHERE s.import_id = ${shipmentImports.id} AND s.voided_at IS NOT NULL)`,
        handedOrders: sql<number>`(SELECT count(DISTINCT s.order_id)::int FROM shipments s
          WHERE s.import_id = ${shipmentImports.id} AND s.handed_order)`,
        firstPostDay: sql<Date | null>`(SELECT min(r.post_day) FROM shipment_import_rows r
          WHERE r.import_id = ${shipmentImports.id} AND r.verdict <> 'total')`.mapWith(shipmentImports.createdAt),
        lastPostDay: sql<Date | null>`(SELECT max(r.post_day) FROM shipment_import_rows r
          WHERE r.import_id = ${shipmentImports.id} AND r.verdict <> 'total')`.mapWith(shipmentImports.createdAt),
      })
        .where(importsInScope(scope))
        .orderBy(desc(shipmentImports.createdAt), desc(shipmentImports.id))
        .limit(limit)
        .offset(offset);
      return rows.map((row) => ({
        ...toView(row),
        counts: row.counts ?? {},
        liveShipments: row.liveShipments,
        voidedShipments: row.voidedShipments,
        handedOrders: row.handedOrders,
        firstPostDay: row.firstPostDay,
        lastPostDay: row.lastPostDay,
      }));
    },

    async importPage(scope, id, now) {
      const [row] = await viewQuery(db, { tables: shipmentImports.tables })
        .where(and(eq(shipmentImports.id, id), importsInScope(scope)))
        .limit(1);
      if (!row) return null;
      const view = toView(row);
      const judgeScope = importScope(view.partner?.id ?? null);
      if (view.status === 'read' && row.tables) {
        return { kind: 'preview', import: view, preview: await preview(row.tables, judgeScope, now) };
      }
      if (view.status === 'committed' || view.status === 'reverted') {
        return { kind: 'committed', import: view, committed: await committed(view.id, judgeScope) };
      }
      return { kind: 'plain', import: view };
    },

    async commit(scope, input) {
      try {
        return await db.transaction(async (tx): Promise<ShipmentCommitWrite> => {
          // دو «ثبت» هم‌زمان یک ورود: دومی پشت این قفل می‌ماند و بعد «ثبت شد» را می‌بیند.
          const [imp] = await tx
            .select({
              id: shipmentImports.id,
              status: shipmentImports.status,
              tables: shipmentImports.tables,
              filename: shipmentImports.filename,
              printPartnerId: shipmentImports.printPartnerId,
            })
            .from(shipmentImports)
            .where(and(eq(shipmentImports.id, input.id), importsInScope(scope)))
            .limit(1)
            .for('update');
          if (!imp) return { ok: false, reason: 'not_found' };
          if (imp.status !== 'read' || !imp.tables) return { ok: false, reason: 'status', status: imp.status as ShipmentImportStatus };
          const sheet = readPostSheet(imp.tables);
          // «ثبت» فقط از پیش‌نمایشی که سطر داشت؛ فایلی که ستونش کم است دکمهٔ ثبت ندارد.
          if (!sheet.ok) return { ok: false, reason: 'changed' };
          const judgeScope = importScope(imp.printPartnerId);
          const { facts, judged } = await judge(tx, judgeScope, sheet.rows, input.at, true);
          if (judgedFingerprint(judged) !== input.fingerprint) return { ok: false, reason: 'changed' };

          await tx
            .update(shipmentImports)
            .set({ status: 'committed', committedAt: input.at, committedBy: input.adminUserId })
            .where(eq(shipmentImports.id, imp.id));

          const stored: (typeof shipmentImportRows.$inferInsert)[] = sheet.rows.map((row, i) => ({
            importId: imp.id,
            rowNo: row.rowNo,
            cells: row.cells,
            barcode: row.barcode,
            orderNumber: row.orderNumber,
            nameG: row.nameG,
            destination: row.destination,
            weightGrams: row.weightGrams,
            fareRials: row.fareRials,
            taxRials: row.taxRials,
            postDay: row.postDay,
            postStatus: row.postStatus,
            verdict: judged[i]!.verdict,
            reason: judged[i]!.reason,
            orderId: judged[i]!.orderId,
          }));
          if (sheet.fileTotal) {
            const total = sheet.fileTotal;
            stored.push({
              importId: imp.id,
              rowNo: total.rowNo,
              cells: total.cells,
              barcode: null,
              orderNumber: null,
              nameG: null,
              destination: null,
              weightGrams: total.weightGrams,
              fareRials: total.fareRials,
              taxRials: total.taxRials,
              postDay: null,
              postStatus: null,
              verdict: 'total',
              reason: null,
              orderId: null,
            });
          }
          for (let i = 0; i < stored.length; i += BATCH) await tx.insert(shipmentImportRows).values(stored.slice(i, i + BATCH));

          // «در حال چاپ»ها «تحویل پست شد» می‌شوند، با زودترین روز بسته‌هایشان در همین فایل (سؤال ۵۲).
          const matched = sheet.rows.flatMap((row, i) => (judged[i]!.verdict === 'matched' ? [{ row, judged: judged[i]! }] : []));
          const handOver = new Map<string, Date>();
          for (const { row, judged: j } of matched) {
            if (!j.handOver) continue;
            const earliest = handOver.get(j.orderId!);
            if (!earliest || row.postDay! < earliest) handOver.set(j.orderId!, row.postDay!);
          }
          const numberOf = new Map(facts.map((order) => [order.id, order.orderNumber]));
          for (const [orderId, postDay] of handOver) {
            // ردیف زیر قفل همین تراکنش است و «در حال چاپ» سنجیده شد؛ شرط‌ها فقط دیوار دوم‌اند.
            const [moved] = await tx
              .update(orders)
              .set({ status: 'handed_to_post', handedToPostAt: handedAtOf(postDay, input.at) })
              .where(and(eq(orders.id, orderId), eq(orders.status, 'printing'), isNull(orders.filesDeletedAt), ordersInScope(judgeScope)))
              .returning({ id: orders.id });
            if (!moved) throw new Error(`سفارش ${numberOf.get(orderId)} زیر قفل «در حال چاپ» نماند`);
            await tx.insert(orderStatusEvents).values({
              orderId,
              fromStatus: 'printing',
              toStatus: 'handed_to_post',
              at: input.at,
              actor: 'admin',
              adminUserId: input.adminUserId,
              note: { source: 'post_file', importId: imp.id, filename: imp.filename, postDay: postDay.toISOString() },
            });
          }
          const made = matched.map(({ row, judged: j }) => ({
            orderId: j.orderId!,
            barcode: row.barcode!,
            importId: imp.id,
            rowNo: row.rowNo,
            weightGrams: row.weightGrams!,
            fareRials: row.fareRials!,
            taxRials: row.taxRials!,
            postDay: row.postDay!,
            matchedBy: 'rule',
            handedOrder: handOver.has(j.orderId!),
            adminUserId: input.adminUserId,
            createdAt: input.at,
          }));
          for (let i = 0; i < made.length; i += BATCH) await tx.insert(shipments).values(made.slice(i, i + BATCH));

          const counts = countOf(judged.map((j) => j.verdict));
          const handed = [...handOver.keys()].map((id) => numberOf.get(id)!).sort((a, b) => a - b);
          await tx.insert(adminEvents).values(
            adminEventRow({
              ...input.event,
              targetType: 'shipment_import',
              targetId: imp.id,
              detail: {
                ...(input.event.detail as Record<string, unknown> | undefined),
                filename: imp.filename,
                counts,
                shipments: made.length,
                handed,
              },
            }),
          );
          return { ok: true, counts, shipments: made.length, handed };
        });
      } catch (error) {
        // بارکدی که همین حالا با ورود دیگری برای سفارش دیگری نشست: حکمش دیگر «قطعی» نیست.
        if (constraintOf(error) === 'shipments_live_barcode') return { ok: false, reason: 'changed' };
        throw error;
      }
    },

    async discard(scope, input) {
      return db.transaction(async (tx): Promise<ShipmentDiscardWrite> => {
        const [done] = await tx
          .update(shipmentImports)
          .set({ status: 'discarded', discardedAt: input.at, discardedBy: input.adminUserId, raw: null, tables: null, purgedAt: input.at })
          .where(and(eq(shipmentImports.id, input.id), inArray(shipmentImports.status, ['reading', 'read']), importsInScope(scope)))
          .returning({ filename: shipmentImports.filename });
        if (!done) {
          const [current] = await tx
            .select({ status: shipmentImports.status })
            .from(shipmentImports)
            .where(and(eq(shipmentImports.id, input.id), importsInScope(scope)))
            .limit(1);
          return current ? { ok: false, reason: 'status', status: current.status as ShipmentImportStatus } : { ok: false, reason: 'not_found' };
        }
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            targetType: 'shipment_import',
            targetId: input.id,
            detail: { ...(input.event.detail as Record<string, unknown> | undefined), filename: done.filename },
          }),
        );
        return { ok: true };
      });
    },

    async revert(scope, input) {
      return db.transaction(async (tx): Promise<ShipmentRevertWrite> => {
        const [imp] = await tx
          .select({ id: shipmentImports.id, status: shipmentImports.status, filename: shipmentImports.filename })
          .from(shipmentImports)
          .where(and(eq(shipmentImports.id, input.id), importsInScope(scope)))
          .limit(1)
          .for('update');
        if (!imp) return { ok: false, reason: 'not_found' };
        if (imp.status !== 'committed') return { ok: false, reason: 'status', status: imp.status as ShipmentImportStatus };

        const live = await tx
          .select({ orderId: shipments.orderId, handedOrder: shipments.handedOrder })
          .from(shipments)
          .where(and(eq(shipments.importId, imp.id), isNull(shipments.voidedAt)));
        // سفارش‌هایی که همین ورود «تحویل پست شد» کرد، زیر قفل و به ترتیب شناسه، مثل «ثبت».
        const handedIds = [...new Set(live.filter((s) => s.handedOrder).map((s) => s.orderId))];
        const handed =
          handedIds.length === 0
            ? []
            : await tx
                .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, filesDeletedAt: orders.filesDeletedAt })
                .from(orders)
                .where(inArray(orders.id, handedIds))
                .orderBy(asc(orders.id))
                .for('update');

        await tx
          .update(shipments)
          .set({ voidedAt: input.at, voidedBy: input.adminUserId, voidReason: input.reason })
          .where(and(eq(shipments.importId, imp.id), isNull(shipments.voidedAt)));
        const stillLive =
          handedIds.length === 0
            ? new Set<string>()
            : new Set(
                (
                  await tx
                    .select({ orderId: shipments.orderId })
                    .from(shipments)
                    .where(and(inArray(shipments.orderId, handedIds), isNull(shipments.voidedAt)))
                ).map((s) => s.orderId),
              );
        const reopened: number[] = [];
        const kept: number[] = [];
        for (const order of handed) {
          if (order.status !== 'handed_to_post' || order.filesDeletedAt || stillLive.has(order.id)) {
            kept.push(order.orderNumber);
            continue;
          }
          await tx
            .update(orders)
            .set({ status: 'printing', handedToPostAt: null })
            .where(and(eq(orders.id, order.id), eq(orders.status, 'handed_to_post')));
          await tx.insert(orderStatusEvents).values({
            orderId: order.id,
            fromStatus: 'handed_to_post',
            toStatus: 'printing',
            at: input.at,
            actor: 'admin',
            adminUserId: input.adminUserId,
            note: { reason: input.reason, source: 'post_file_revert', importId: imp.id, filename: imp.filename },
          });
          reopened.push(order.orderNumber);
        }
        await tx
          .update(shipmentImports)
          .set({ status: 'reverted', revertedAt: input.at, revertedBy: input.adminUserId, revertReason: input.reason })
          .where(eq(shipmentImports.id, imp.id));
        reopened.sort((a, b) => a - b);
        kept.sort((a, b) => a - b);
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            targetType: 'shipment_import',
            targetId: imp.id,
            detail: {
              ...(input.event.detail as Record<string, unknown> | undefined),
              filename: imp.filename,
              voided: live.length,
              reopened,
              kept,
              reason: input.reason,
            },
          }),
        );
        return { ok: true, voided: live.length, reopened, kept };
      });
    },
  };
}
