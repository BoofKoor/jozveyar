/**
 * ارسال در پنل (برش ۶٫۱ و ۶٫۲، ADR-045، ADR-046): ذخیره‌گاه زبانهٔ «ارسال» — بارگذاری فایل پست، پیش‌نمایش، «ثبت»، «دور
 * بینداز» و برگرداندن؛ و از ۶٫۲ صف تأیید: «همین است»، «هیچ‌کدام»، دادن دستی، و کنار گذاشتن یک کد. تفسیر جدول، حکم هر سطر و
 * نامزدها خالص‌اند و در `postfile.ts` و `candidates.ts`؛ اینجا همان است که درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **همان فایل یک بار** (`shipment_imports_one_file`): فایلی که هنوز «در حال خواندن»، «خوانده شد» یا «ثبت شد» است ورود دوم
 *    نمی‌سازد؛ دو بارگذاری هم‌زمان یکی می‌شوند و دومی همان ورود اول را می‌بیند.
 *  - **«ثبت» همان که دیده شد** (مثل ۴٫۵ و ۴٫۶): ورود زیر قفل ردیف؛ سفارش‌های شماره‌های فایل زیر قفل، به ترتیب شناسه (دو «ثبت»
 *    هم‌زمان بن‌بست نمی‌سازند)؛ حکم‌ها دوباره با همان تابع؛ و فقط اگر اثر انگشتشان همان پیش‌نمایش است. فایل هم‌پوشانی که همین
 *    حالا ثبت شد، یا تغییر وضعیت هم‌زمان، حکم‌ها را عوض کرده و پیش‌نمایش تازه می‌خواهد (`changed`)؛ بارکدی که همین حالا برای
 *    سفارش دیگری نشست به ایندکس یکتای `shipments_live_barcode` می‌خورد، و همان `changed` است. از ۶٫۲ سطر بی شماره‌ای که همان لحظه
 *    نامزد دارد به صف تأیید می‌رود؛ نامزدها (پنجرهٔ ۴۵ روزه) قفل نمی‌شوند: صف یا «پیدا نشد»، هیچ‌کدام کدی نمی‌سازد.
 *  - **یک تراکنش:** سطرها، مرسوله‌ها، «تحویل پست شد» سفارش‌های «در حال چاپ» با ردیف `order_status_events`، و رویداد ادمین.
 *  - **برگرداندن** (فقط `committed`، یک بار): مرسوله‌های ورود کنار می‌روند، نه پاک، از تأیید و دستی هم؛ و سفارش‌هایی که همین ورود
 *    «تحویل پست شد» کرده بود، اگر مرسولهٔ زندهٔ دیگری ندارند، به «در حال چاپ» برمی‌گردند. سفارشی که فایل‌هایش پاک شده (ADR-044)
 *    همان می‌ماند. سطرهایش از صف بیرون می‌روند.
 *  - **صف تأیید** (۶٫۲): نامزدها هر بار از نو، در محدودهٔ واردکننده. «همین است» و دادن دستی ورود را قفل اشتراکی می‌کنند (برگرداندن
 *    هم‌زمان پیش یا پس از آن است)، سطر و سفارش را قفل کامل، و از همان که ادمین دید (وضعیت سفارش و شمار کد زنده‌اش): اگر همین حالا
 *    عوض شد، هیچ (`changed`). «در صف چاپ» فقط با دروازه‌های «شروع چاپ»، و در همان تراکنش «در حال چاپ» و «تحویل پست شد»؛ لغوشده و
 *    پرداخت‌نشده هرگز. «هیچ‌کدام» یک بار. کنار گذاشتن یک کد سفارشی را که همان کد «تحویل پست شد» کرده بود به «در حال چاپ» برمی‌گرداند
 *    (اگر کد زندهٔ دیگری ندارد و فایل‌هایش پاک نشده)، و سطرش را به صف.
 *  - **محدوده** (ADR-042): هر تابع محدودهٔ نشست را آرگومان اول می‌گیرد، و ورود چاپخانه فقط در محدودهٔ همان چاپخانه دیده می‌شود.
 *    حکم‌ها و نامزدها، هر که ببیند، فقط سفارش‌های محدودهٔ واردکننده را می‌شناسند (`importScope`)، پس به بیننده بسته نیستند.
 */

import { createHash } from 'node:crypto';

import { recipientSurname, tehranDayStart } from '@jozveyar/text';
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, SelectedFields } from 'drizzle-orm/pg-core';

import { adminEventRow, type AdminEventInput } from './admin.js';
import {
  CANDIDATE_WINDOW_DAYS,
  blockOf,
  candidatesFor,
  criteriaOf,
  isNumberedCandidate,
  isPoolCandidate,
  scoreOf,
  type CandidateBlock,
  type CandidateList,
  type CandidateRow,
} from './candidates.js';
import type { Database } from './index.js';
import { ALL_ORDERS, inReviewQueue, ordersInScope, type PanelScope } from './panel.js';
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
  smsMessages,
} from './schema.js';
import { queuedTrackingSms, shipmentSmsFields, shipmentSmsOf, type ShipmentSms } from './sms.js';

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
  /** سطرهای همین ورود که همین حالا در صف تأییدند (۶٫۲). */
  queuedRows: number;
  /** «هیچ‌کدام» خورده و بی کد زنده (۶٫۲). */
  dismissedRows: number;
  /** «پیدا نشد»ی که هرگز کدی نگرفت (دادن دستی نخورده، ۶٫۲). */
  unmatchedRows: number;
}

/**
 * سفارشی که سطری به آن اشاره می‌کند، یا نامزد صف است، با آنچه حکم، نامزدها، پیام‌های پنل و دروازه‌های «همین است» لازم دارند؛
 * همان شکل `CandidateOrder` (۶٫۲).
 */
export interface ShipmentOrderFacts extends OrderFacts {
  provinceName: string;
  cityName: string | null;
  handedToPostAt: Date | null;
  /** مهلت تحویل به پست، برای «در مهلت» کنار «همین است» سفارش «در صف چاپ». */
  postHandoffDueAt: Date | null;
  estWeightGrams: number;
  /** مرسوله‌های زندهٔ همین حالا. */
  liveShipments: number;
  /** فایل چاپ همهٔ جزوه‌ها ساخته شده و فایل‌ها پاک نشده (دروازهٔ «شروع چاپ»، ADR-043). */
  printReady: boolean;
  /** چاپخانه دارد (دروازهٔ «شروع چاپ»، ADR-042). */
  hasPartner: boolean;
}

/** نامزدهای یک سطر صف تأیید، با سفارش‌هایشان. */
export type ReviewCandidates = CandidateList<ShipmentOrderFacts>;

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
  /** نامزدهای هر سطر صف تأیید (شمارهٔ سطر ← فهرست)؛ خالی اگر خواسته نشد (چاپخانه نامزدها را نمی‌بیند). */
  candidates: Record<number, ReviewCandidates>;
  /**
   * سطرهای قطعی‌ای که همین کد پیش‌تر برای همین سفارش پیامک شد و رفت (۶٫۳، سؤال ۶۷): با «ثبت» کد می‌نشیند ولی پیامک دوباره نمی‌رود.
   */
  smsBefore: number[];
}

export type StoredImportRow = typeof shipmentImportRows.$inferSelect;

/** سطر ورود ثبت‌شده، با نام کسی که «هیچ‌کدام» زد، و اینکه همین حالا در صف تأیید است (۶٫۲). */
export interface CommittedImportRow extends StoredImportRow {
  dismissedByName: string | null;
  queued: boolean;
}

/** مرسوله‌ای که از همین ورود ساخته شد: قطعی، تأیید یا دستی؛ زنده یا کنارگذاشته. */
export interface ImportShipment {
  id: string;
  rowNo: number;
  orderId: string;
  orderNumber: number;
  barcode: string;
  handedOrder: boolean;
  matchedBy: 'rule' | 'review' | 'manual';
  adminName: string | null;
  createdAt: Date;
  voidedAt: Date | null;
  voidedByName: string | null;
  voidReason: string | null;
  /** پیامک رهگیری همین کد (۶٫۳)؛ null برای مرسولهٔ پیش از ۶٫۳. */
  sms: ShipmentSms | null;
}

/** ورود ثبت‌شده یا برگشته: سطرها با حکم‌هایشان، سفارش‌ها و مرسوله‌ها. */
export interface CommittedImport {
  rows: CommittedImportRow[];
  orders: ShipmentOrderFacts[];
  /** همهٔ مرسوله‌های همین ورود، به ترتیب سطر و ساختن. */
  shipments: ImportShipment[];
  /** «تکراری»: مرسوله‌های همان بارکدها از ورودهای دیگر، قدیمی‌ترین اول. */
  elsewhere: ShipmentElsewhere[];
  /** نامزدهای سطرهایی که در صف‌اند؛ خالی اگر خواسته نشد. */
  candidates: Record<number, ReviewCandidates>;
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
  | {
      ok: true;
      counts: Partial<Record<Verdict, number>>;
      shipments: number;
      handed: number[];
      /** ردیف‌های «منتظر» پیامک رهگیری که همین «ثبت» ساخت؛ بعد از commit فرستاده می‌شوند (۶٫۳). */
      sms: number[];
    }
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
      /** سطرهایی که در صف تأیید بودند و بیرون رفتند (۶٫۲). */
      unqueued: number;
    }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'status'; status: ShipmentImportStatus };

export type ShipmentDiscardWrite =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'status'; status: ShipmentImportStatus };

/** ورودی که سطری از آن در صف است. */
export interface ReviewImportRef {
  id: string;
  filename: string;
  status: ShipmentImportStatus;
  createdAt: Date;
  createdByName: string;
  committedAt: Date | null;
  partner: { id: string; name: string } | null;
}

/**
 * یک سطر صف تأیید (یا سطری که دستی به سفارشی داده می‌شود)، با آنچه کارتش لازم دارد: چرا اینجاست، کدهای کنارگذاشته‌اش، کدی که
 * همین حالا با همین بارکد مال سفارش دیگری است، سفارش همان شمارهٔ «نام گ» (حتی اگر نامزد نیست)، و نامزدها.
 */
export interface ReviewRow {
  import: ReviewImportRef;
  row: StoredImportRow & { dismissedByName: string | null };
  /** همهٔ مرسوله‌های همین سطر (کنارگذاشته، و اگر هست زنده)، به ترتیب ساختن. */
  shipments: ImportShipment[];
  /** همین حالا در صف تأیید است. */
  queued: boolean;
  /** دادن دستی باز است: ورود «ثبت شد»، قطعی، صف تأیید یا پیدا نشد، بی کد زنده (ردشده هم). */
  assignable: boolean;
  /** همین بارکد، زنده، برای سفارش دیگری. */
  elsewhere: ShipmentElsewhere | null;
  numbered: ShipmentOrderFacts | null;
  candidates: ReviewCandidates;
}

/** «همین است» (`review`، نامزد) یا دادن دستی (`manual`، شمارهٔ سفارش)، از همان که ادمین از سفارش دید. */
export interface ReviewDecision {
  importId: string;
  rowNo: number;
  orderId: string;
  via: 'review' | 'manual';
  seen: { status: OrderFacts['status']; liveShipments: number };
  at: Date;
  adminUserId: string;
  /** `shipments.approve` یا `shipments.assign`؛ هدف و جزئیات را ذخیره‌گاه می‌گذارد. */
  event: AdminEventInput;
}

/** چرا «همین است» یا دادن دستی بسته است: دروازه‌های نامزد، و همین بارکد زنده برای سفارش دیگر. */
export type ReviewBlock = CandidateBlock | 'barcode_elsewhere';

export type ReviewWrite =
  | {
      ok: true;
      orderNumber: number;
      from: OrderFacts['status'];
      handed: boolean;
      /** ردیف «منتظر» پیامک رهگیری؛ null اگر همین کد پیش‌تر برای همین سفارش پیامک شد (سؤال ۶۷). */
      sms: number | null;
    }
  /** ورود یا سطر (در محدوده) نیست. */
  | { ok: false; reason: 'not_found' }
  /** سطر دیگر در صف نیست (یا برای دادن دستی باز نیست): «هیچ‌کدام» خورد، کد گرفت، یا ورود برگشت. */
  | { ok: false; reason: 'row_closed' }
  /** سفارش در محدودهٔ واردکننده نیست، یا پرداخت نشده. */
  | { ok: false; reason: 'order_not_found' }
  /** سفارش همین حالا عوض شد (وضعیت یا کد زنده)، یا دیگر نامزد این سطر نیست. */
  | { ok: false; reason: 'changed' }
  | { ok: false; reason: 'blocked'; block: ReviewBlock };

export type DismissWrite = { ok: true } | { ok: false; reason: 'not_found' | 'row_closed' };

export interface ShipmentVoid {
  shipmentId: string;
  reason: string;
  at: Date;
  adminUserId: string;
  /** `shipments.void`؛ هدف و جزئیات را ذخیره‌گاه می‌گذارد. */
  event: AdminEventInput;
}

/** چرا سفارش پس از کنار رفتن کدش «تحویل پست شد» ماند. */
export type VoidKept = 'other_code' | 'files_deleted' | 'handed_before';

/**
 * پس از کنار رفتن یک کد، سفارش «تحویل پست شد» می‌ماند یا نه (تصمیم ۸۰): فقط سفارشی که همین کد «تحویل پست شد» کرده بود، کد زندهٔ
 * دیگری ندارد و فایل‌هایش پاک نشده (ADR-044) یک قدم به «در حال چاپ» برمی‌گردد. همان که ذخیره‌گاه زیر قفل می‌کند و صفحهٔ سفارش پیش
 * از کار می‌گوید.
 */
export function voidKept(shipment: { handedOrder: boolean }, otherLive: boolean, filesDeleted: boolean): VoidKept | null {
  if (!shipment.handedOrder) return 'handed_before';
  if (otherLive) return 'other_code';
  return filesDeleted ? 'files_deleted' : null;
}

export type VoidWrite =
  | { ok: true; orderNumber: number; reopened: boolean; kept: VoidKept | null }
  | { ok: false; reason: 'not_found' | 'already_voided' };

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
  /**
   * یک ورود با آنچه صفحه‌اش لازم دارد: پیش‌نمایش برای «خوانده شد»، سطرها و مرسوله‌ها برای ثبت‌شده و برگشته. `candidates`: نامزدهای
   * سطرهای صف هم (مالک و متصدی؛ چاپخانه نه).
   */
  importPage(scope: PanelScope, id: string, now: Date, options?: { candidates?: boolean }): Promise<ShipmentImportPage | null>;
  /** «ثبت»، فقط اگر حکم‌ها زیر قفل همان است که ادمین دید. */
  commit(scope: PanelScope, input: ShipmentCommit): Promise<ShipmentCommitWrite>;
  /** «دور بینداز»: ورودی که هنوز ثبت نشده، با پاک شدن بایت خام و جدول‌ها. */
  discard(scope: PanelScope, input: { id: string; at: Date; adminUserId: string; event: AdminEventInput }): Promise<ShipmentDiscardWrite>;
  /** برگرداندن کل یک ورود ثبت‌شده، یک بار، با دلیل. */
  revert(scope: PanelScope, input: ShipmentRevert): Promise<ShipmentRevertWrite>;
  /** صف تأیید (۶٫۲): سطرهای ورودهای محدوده، قدیمی‌ترین «ثبت» اول و بعد شمارهٔ سطر، هر کدام با نامزدهایش؛ و شمار همه. */
  reviewQueue(scope: PanelScope, page: { limit: number; offset: number }): Promise<{ rows: ReviewRow[]; total: number }>;
  /** یک سطر صف یا دادن دستی، با نامزدهایش؛ null اگر ورود یا سطر در محدوده نیست. */
  reviewRow(scope: PanelScope, importId: string, rowNo: number): Promise<ReviewRow | null>;
  /** سفارشی با این شماره در محدودهٔ واردکنندهٔ همین ورود، برای کارت دادن دستی؛ null اگر نیست یا بیرون است. */
  orderForRow(scope: PanelScope, importId: string, orderNumber: number): Promise<ShipmentOrderFacts | null>;
  /** «همین است» یا دادن دستی، در یک تراکنش: مرسوله، «تحویل پست شد» اگر هنوز نخورده، و رویداد. */
  decide(scope: PanelScope, input: ReviewDecision): Promise<ReviewWrite>;
  /** «هیچ‌کدام»: سطر از صف بیرون می‌رود، یک بار، با رویداد. */
  dismiss(scope: PanelScope, input: { importId: string; rowNo: number; at: Date; adminUserId: string; event: AdminEventInput }): Promise<DismissWrite>;
  /** کنار گذاشتن یک کد رهگیری (مالک، با دلیل): سطرش به صف برمی‌گردد، و سفارشی که همین کد «تحویل پست شد» کرده بود به «در حال چاپ». */
  voidShipment(scope: PanelScope, input: ShipmentVoid): Promise<VoidWrite>;
  /** یک مرسوله و پیامک رهگیری‌اش، برای «دوباره بفرست» (۶٫۳)؛ null بیرون از محدوده. */
  shipmentSms(scope: PanelScope, shipmentId: string): Promise<ShipmentSmsRef | null>;
  /** رویداد «دوباره بفرست» (`shipments.sms_resend`) با هدف سفارش و نتیجه‌اش. */
  recordSmsResend(input: { orderId: string; event: AdminEventInput; detail: Record<string, unknown> }): Promise<void>;
}

/** مرسوله‌ای که «دوباره بفرست» رویش زده شد. */
export interface ShipmentSmsRef {
  shipmentId: string;
  orderId: string;
  orderNumber: number;
  barcode: string;
  voided: boolean;
  sms: ShipmentSms | null;
}

/**
 * پیامک رهگیری مرسوله‌های تازه، در همان تراکنش (۶٫۳، ADR-047): برای هر (سفارش، بارکد) یا همان ردیفی که همین کد پیش‌تر برای همین
 * سفارش گرفت و «رفت» (سؤال ۶۷: پیامک دوباره نه)، یا ردیف تازهٔ «منتظر» به موبایل همان سفارش. همان قاعدهٔ تریگر `shipments_sms`
 * (0026). سفارش‌ها پیش‌تر در همین تراکنش زیر قفل‌اند.
 */
async function trackingSmsFor(
  tx: Pick<Db, 'select' | 'insert'>,
  list: readonly { orderId: string; orderNumber: number; barcode: string }[],
  at: Date,
): Promise<{ ids: number[]; fresh: number[] }> {
  if (list.length === 0) return { ids: [], fresh: [] };
  const orderIds = [...new Set(list.map((s) => s.orderId))];
  const [phones, earlier] = await Promise.all([
    tx.select({ id: orders.id, phone: orders.recipientPhone }).from(orders).where(inArray(orders.id, orderIds)),
    tx
      .select({ orderId: shipments.orderId, barcode: shipments.barcode, smsId: shipments.smsMessageId })
      .from(shipments)
      .innerJoin(smsMessages, eq(smsMessages.id, shipments.smsMessageId))
      .where(and(inArray(shipments.orderId, orderIds), inArray(smsMessages.status, ['logged', 'sent'])))
      .orderBy(desc(shipments.createdAt)),
  ]);
  const phoneOf = new Map(phones.map((row) => [row.id, row.phone]));
  const sent = new Map<string, number>();
  for (const row of earlier) if (row.smsId !== null && !sent.has(`${row.orderId}/${row.barcode}`)) sent.set(`${row.orderId}/${row.barcode}`, row.smsId);
  const ids: number[] = [];
  const fresh: number[] = [];
  for (const item of list) {
    const reused = sent.get(`${item.orderId}/${item.barcode}`);
    if (reused !== undefined) {
      ids.push(reused);
      continue;
    }
    const id = await queuedTrackingSms(tx, { toMobile: phoneOf.get(item.orderId)!, orderNumber: item.orderNumber, barcode: item.barcode, at });
    ids.push(id);
    fresh.push(id);
  }
  return { ids, fresh };
}

/** سطرهای قطعی که همین کد پیش‌تر برای همین سفارش پیامک شد و رفت (سؤال ۶۷)؛ برای پیش‌نمایش. */
async function smsBeforeOf(q: Reader, rows: readonly PostRow[], judged: readonly Judged[]): Promise<number[]> {
  const matched = rows.flatMap((row, i) => (judged[i]!.verdict === 'matched' && row.barcode ? [{ rowNo: row.rowNo, orderId: judged[i]!.orderId!, barcode: row.barcode }] : []));
  if (matched.length === 0) return [];
  const found = await q
    .select({ orderId: shipments.orderId, barcode: shipments.barcode })
    .from(shipments)
    .innerJoin(smsMessages, eq(smsMessages.id, shipments.smsMessageId))
    .where(and(inArray(shipments.barcode, matched.map((m) => m.barcode)), inArray(smsMessages.status, ['logged', 'sent'])));
  const sent = new Set(found.map((row) => `${row.orderId}/${row.barcode}`));
  return matched.filter((m) => sent.has(`${m.orderId}/${m.barcode}`)).map((m) => m.rowNo);
}

type PgError = { code?: string; constraint_name?: string; cause?: PgError };

/** نام محدودیتی که پستگرس رد کرد؛ drizzle خطای درایور را در `cause` می‌پیچد. */
function constraintOf(error: unknown): string | undefined {
  const pg = error as PgError;
  return pg?.cause?.constraint_name ?? pg?.constraint_name;
}

type Db = Database['db'];
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

/** حکم‌هایی که کد سفارش ما می‌شوند (قطعی) یا می‌توانستند بشوند (صف تأیید، پیدا نشد). */
const DECIDABLE: readonly string[] = ['matched', 'review', 'unmatched'];

/**
 * سطر در صف تأیید است (۶٫۲، ADR-046): ورود «ثبت شد»، «هیچ‌کدام» نخورده، مرسولهٔ زنده ندارد، و حکمش صف تأیید است یا کدی گرفته
 * که کنار رفت. همان `inReviewQueue` پنل به زبان پستگرس، و همان که تریگر «هیچ‌کدام» (0024) می‌سنجد.
 */
export function queuedRow(
  row: Pick<StoredImportRow, 'verdict' | 'dismissedAt'>,
  importStatus: string,
  rowShipments: readonly { voidedAt: Date | null }[],
): boolean {
  if (importStatus !== 'committed' || row.dismissedAt !== null) return false;
  if (rowShipments.some((s) => s.voidedAt === null)) return false;
  // مرسوله فقط از قطعی، صف تأیید یا پیدا نشد ساخته می‌شود (تریگر `shipments_insert`)، پس «کدی گرفته» یعنی یکی از این سه.
  return row.verdict === 'review' || rowShipments.length > 0;
}

/**
 * دادن دستی باز است: ورود «ثبت شد»، قطعی، صف تأیید یا پیدا نشد، بی کد زنده؛ «هیچ‌کدام» خورده هم (راه اشتباهش). این سه حکم همیشه
 * بارکد درست دارند: بارکد خراب پیش از همه «خوانده نشد» است (`judgeRows`).
 */
export function assignableRow(
  row: Pick<StoredImportRow, 'verdict'>,
  importStatus: string,
  rowShipments: readonly { voidedAt: Date | null }[],
): boolean {
  return importStatus === 'committed' && DECIDABLE.includes(row.verdict) && !rowShipments.some((s) => s.voidedAt === null);
}

/** سطر ثبت‌شده به شکلی که نامزدها لازم دارند. */
export function storedCandidateRow(row: Pick<StoredImportRow, 'orderNumber' | 'nameG' | 'destination' | 'weightGrams' | 'postDay'>): CandidateRow {
  return {
    orderNumber: row.orderNumber,
    surname: row.nameG ? recipientSurname(row.nameG) : '',
    destination: row.destination ?? '',
    weightGrams: row.weightGrams,
    postDay: row.postDay,
  };
}

const postCandidateRow = (row: PostRow): CandidateRow => ({
  orderNumber: row.orderNumber,
  surname: row.surname,
  destination: row.destination,
  weightGrams: row.weightGrams,
  postDay: row.postDay,
});

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

/** آنچه از هر سفارش خوانده می‌شود: حکم، نامزدها، پیام‌ها و دروازه‌های «همین است». */
const factsFields = {
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
  postHandoffDueAt: orders.postHandoffDueAt,
  estWeightGrams: orders.estWeightGrams,
  liveShipments: sql<number>`(SELECT count(*)::int FROM shipments s WHERE s.order_id = ${orders.id} AND s.voided_at IS NULL)`,
  // همان `printReady` صفحهٔ سفارش برای «در صف چاپ»: هر جزوه دست‌کم یک جلد فایل چاپ. سفارش بی جزوه نیست (مسیر خرید)، و فایل‌های
  // سفارشِ هنوز باز پاک نمی‌شوند (`orders_files_deleted_closed`)، پس این دو شرط صفحهٔ سفارش اینجا چیزی نمی‌گیرند.
  printReady: sql<boolean>`(NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = ${orders.id}
                     AND NOT EXISTS (SELECT 1 FROM order_print_files f WHERE f.order_item_id = i.id)))`,
  hasPartner: sql<boolean>`(${orders.printPartnerId} IS NOT NULL)`,
};

/** سفارش‌های محدوده، با آنچه حکم و پیام‌ها لازم دارند؛ با `lock`، زیر قفل ردیف و به ترتیب شناسه. */
function factsQuery(q: Reader, scope: PanelScope, where: SQL, lock: boolean) {
  const query = q
    .select(factsFields)
    .from(orders)
    .innerJoin(provinces, eq(provinces.id, orders.provinceId))
    .leftJoin(cities, eq(cities.id, orders.cityId))
    .where(and(where, ordersInScope(scope)))
    .orderBy(asc(orders.id));
  // فقط ردیف سفارش؛ قفل استان و شهر درج هر سفارش تازه را پشت این نگه می‌داشت.
  return lock ? query.for('update', { of: orders }) : query;
}

/**
 * پنجرهٔ نامزدها (۶٫۲): سفارش‌های «در حال چاپ» یا «تحویل پست شد» بی کد زنده در محدوده، که در ۴۵ روز پیش از اولین روز پست تا پایان
 * آخرین روز پست این سطرها پرداخت شده‌اند. نام خانوادگی و مرز هر سطر را `candidatesFor` می‌سنجد؛ اینجا فقط بازهٔ همهٔ سطرها.
 */
function poolQuery(q: Reader, scope: PanelScope, postDays: readonly Date[]) {
  const first = new Date(Math.min(...postDays.map((d) => d.getTime())));
  const last = new Date(Math.max(...postDays.map((d) => d.getTime())));
  return q
    .select(factsFields)
    .from(orders)
    .innerJoin(provinces, eq(provinces.id, orders.provinceId))
    .leftJoin(cities, eq(cities.id, orders.cityId))
    .where(
      and(
        inArray(orders.status, ['printing', 'handed_to_post']),
        gte(orders.paidAt, tehranDayStart(first, -CANDIDATE_WINDOW_DAYS)),
        lt(orders.paidAt, tehranDayStart(last, 1)),
        sql`NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = ${orders.id} AND s.voided_at IS NULL)`,
        ordersInScope(scope),
      ),
    )
    .orderBy(asc(orders.id));
}

/**
 * سفارش‌هایی که نامزد سطرهای یک ورود می‌توانند باشند، همه در محدودهٔ واردکننده: سفارش‌های شماره‌های «نام گ» (در هر وضعیتی؛
 * `candidatesFor` می‌گوید کدام نامزد است) و پنجرهٔ روز پست.
 */
async function candidateOrders(q: Reader, scope: PanelScope, rows: readonly CandidateRow[]): Promise<ShipmentOrderFacts[]> {
  const numbers = [...new Set(rows.flatMap((row) => (row.orderNumber !== null && row.orderNumber >= FIRST_ORDER_NUMBER ? [row.orderNumber] : [])))];
  const days = rows.flatMap((row) => (row.postDay && row.surname ? [row.postDay] : []));
  const [numbered, pool] = await Promise.all([
    numbers.length === 0 ? Promise.resolve([]) : factsQuery(q, scope, inArray(orders.orderNumber, numbers), false),
    days.length === 0 ? Promise.resolve([]) : poolQuery(q, scope, days),
  ]);
  return [...(numbered as ShipmentOrderFacts[]), ...(pool as ShipmentOrderFacts[])];
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

/** مرسوله‌های چند ورود (همه، کنارگذاشته هم)، با شمارهٔ سفارش و نام کسانی که ساختند یا کنار گذاشتند. */
function importShipmentsQuery(q: Reader, importIds: string[]) {
  return q
    .select({
      id: shipments.id,
      importId: shipments.importId,
      rowNo: shipments.rowNo,
      orderId: shipments.orderId,
      orderNumber: orders.orderNumber,
      barcode: shipments.barcode,
      handedOrder: shipments.handedOrder,
      matchedBy: sql<ImportShipment['matchedBy']>`${shipments.matchedBy}`,
      adminName: adminName(shipments.adminUserId),
      createdAt: shipments.createdAt,
      voidedAt: shipments.voidedAt,
      voidedByName: adminName(shipments.voidedBy),
      voidReason: shipments.voidReason,
      ...shipmentSmsFields,
    })
    .from(shipments)
    .innerJoin(orders, eq(orders.id, shipments.orderId))
    .leftJoin(smsMessages, eq(smsMessages.id, shipments.smsMessageId))
    .where(inArray(shipments.importId, importIds))
    .orderBy(asc(shipments.rowNo), asc(shipments.createdAt), asc(shipments.id));
}

/** مرسوله‌های چند ورود با پیامک رهگیری هر کدام (۶٫۳). */
async function importShipmentsOf(q: Reader, importIds: string[]): Promise<(ImportShipment & { importId: string })[]> {
  const rows = await importShipmentsQuery(q, importIds);
  return rows.map(({ smsId, smsToMobile, smsStatus, smsError, smsAttempts, smsCreatedAt, smsAttemptedAt, smsSentAt, ...shipment }) => ({
    ...shipment,
    sms: shipmentSmsOf({ smsId, smsToMobile, smsStatus, smsError, smsAttempts, smsCreatedAt, smsAttemptedAt, smsSentAt }),
  }));
}

/** شماره‌های سفارش‌های سایت و بارکدهای درست یک فایل. */
function keysOf(rows: readonly PostRow[]) {
  const numbers = [...new Set(rows.flatMap((row) => (row.orderNumber !== null && row.orderNumber >= FIRST_ORDER_NUMBER ? [row.orderNumber] : [])))];
  const barcodes = [...new Set(rows.flatMap((row) => (row.barcode ? [row.barcode] : [])))];
  return { numbers, barcodes };
}

/**
 * سفارش‌ها و مرسوله‌های زندهٔ یک فایل، و حکم‌هایش. سطر بی شماره‌ای که نامزد دارد به صف می‌رود (۶٫۲)، پس پنجرهٔ نامزدها هم
 * خوانده می‌شود، بی قفل: صف یا «پیدا نشد»، هیچ‌کدام کد نمی‌سازد. `candidates`: نامزدهای سطرهای صف، برای پیش‌نمایش.
 */
async function judge(q: Reader, scope: PanelScope, rows: readonly PostRow[], now: Date, lock: boolean) {
  const { numbers, barcodes } = keysOf(rows);
  const valid = rows.filter((row) => row.problem === null && row.postDay !== null && row.surname);
  const [facts, live, pool] = await Promise.all([
    numbers.length === 0 ? Promise.resolve([]) : factsQuery(q, scope, inArray(orders.orderNumber, numbers), lock),
    barcodes.length === 0 ? Promise.resolve([]) : elsewhereQuery(q, scope, barcodes, isNull(shipments.voidedAt)),
    valid.length === 0 ? Promise.resolve([]) : poolQuery(q, scope, valid.map((row) => row.postDay!)),
  ]);
  const known = [...(facts as ShipmentOrderFacts[]), ...(pool as ShipmentOrderFacts[])];
  const candidateRows = new Set(
    valid.filter((row) => row.orderNumber === null && candidatesFor(postCandidateRow(row), known).candidates.length > 0).map((row) => row.rowNo),
  );
  const judged = judgeRows(rows, {
    orders: new Map(facts.map((order) => [order.orderNumber, order])),
    live: new Map(live.map((s): [string, LiveShipment] => [s.barcode, { barcode: s.barcode, orderId: s.orderId }])),
    now,
    candidateRows,
  });
  const candidates: Record<number, ReviewCandidates> = {};
  rows.forEach((row, i) => {
    if (judged[i]!.verdict === 'review') candidates[row.rowNo] = candidatesFor(postCandidateRow(row), known);
  });
  return { facts: facts as ShipmentOrderFacts[], live: live as ShipmentElsewhere[], judged, candidates };
}

function countOf(verdicts: readonly Verdict[]): Partial<Record<Verdict, number>> {
  const counts: Partial<Record<Verdict, number>> = {};
  for (const verdict of verdicts) counts[verdict] = (counts[verdict] ?? 0) + 1;
  return counts;
}

const rowFields = {
  row: shipmentImportRows,
  dismissedByName: adminName(shipmentImportRows.dismissedBy),
};

/** کارت‌های صف یا دادن دستی برای سطرهای یک یا چند ورود: مرسوله‌ها، بارکد زندهٔ جای دیگر، سفارش همان شماره، و نامزدها. */
async function reviewRowsOf(
  q: Reader,
  found: { row: StoredImportRow; dismissedByName: string | null; import: ReviewImportRef }[],
): Promise<ReviewRow[]> {
  if (found.length === 0) return [];
  const importIds = [...new Set(found.map((f) => f.import.id))];
  const made = await importShipmentsOf(q, importIds);
  const byScope = new Map<string, typeof found>();
  for (const f of found) {
    const key = f.import.partner?.id ?? '';
    byScope.set(key, [...(byScope.get(key) ?? []), f]);
  }
  const out = new Map<string, ReviewRow>();
  for (const [key, group] of byScope) {
    const scope = importScope(key || null);
    const candidateRows = group.map((f) => storedCandidateRow(f.row));
    const barcodes = [...new Set(group.flatMap((f) => (f.row.barcode ? [f.row.barcode] : [])))];
    const [known, live] = await Promise.all([
      candidateOrders(q, scope, candidateRows),
      barcodes.length === 0 ? Promise.resolve([]) : elsewhereQuery(q, scope, barcodes, isNull(shipments.voidedAt)),
    ]);
    const byNumber = new Map(known.map((order) => [order.orderNumber, order]));
    for (const f of group) {
      const rowShipments = made.filter((s) => s.importId === f.import.id && s.rowNo === f.row.rowNo);
      const voided = new Set(rowShipments.filter((s) => s.voidedAt !== null).map((s) => s.orderId));
      const liveHere = rowShipments.find((s) => s.voidedAt === null);
      const elsewhere = (live as ShipmentElsewhere[]).find((s) => s.barcode === f.row.barcode && (!liveHere || s.orderId !== liveHere.orderId)) ?? null;
      out.set(`${f.import.id}/${f.row.rowNo}`, {
        import: f.import,
        row: { ...f.row, dismissedByName: f.dismissedByName },
        shipments: rowShipments.map(({ importId: _import, ...s }) => s),
        queued: queuedRow(f.row, f.import.status, rowShipments),
        assignable: assignableRow(f.row, f.import.status, rowShipments),
        elsewhere: liveHere ? null : elsewhere,
        numbered: f.row.orderNumber !== null ? (byNumber.get(f.row.orderNumber) ?? null) : null,
        candidates: candidatesFor(storedCandidateRow(f.row), known, voided),
      });
    }
  }
  return found.map((f) => out.get(`${f.import.id}/${f.row.rowNo}`)!);
}

const importRefFields = {
  id: shipmentImports.id,
  filename: shipmentImports.filename,
  status: shipmentImports.status,
  createdAt: shipmentImports.createdAt,
  createdByName: adminName(shipmentImports.createdBy),
  committedAt: shipmentImports.committedAt,
  partnerId: shipmentImports.printPartnerId,
  partnerName: printPartners.name,
};

const importRefOf = (r: {
  id: string;
  filename: string;
  status: string;
  createdAt: Date;
  createdByName: string | null;
  committedAt: Date | null;
  partnerId: string | null;
  partnerName: string | null;
}): ReviewImportRef => ({
  id: r.id,
  filename: r.filename,
  status: r.status as ShipmentImportStatus,
  createdAt: r.createdAt,
  createdByName: r.createdByName ?? '',
  committedAt: r.committedAt,
  partner: r.partnerId ? { id: r.partnerId, name: r.partnerName ?? '' } : null,
});

export function createShipmentStore({ db }: Database): ShipmentStore {
  async function preview(tables: string[][][], scope: PanelScope, now: Date, withCandidates: boolean): Promise<ShipmentPreview> {
    const sheet = readPostSheet(tables);
    if (!sheet.ok) return { sheet, judged: [], orders: [], live: [], fingerprint: judgedFingerprint([]), candidates: {}, smsBefore: [] };
    const { facts, live, judged, candidates } = await judge(db, scope, sheet.rows, now, false);
    const smsBefore = await smsBeforeOf(db, sheet.rows, judged);
    return { sheet, judged, orders: facts, live, fingerprint: judgedFingerprint(judged), candidates: withCandidates ? candidates : {}, smsBefore };
  }

  async function committed(view: ShipmentImportView, scope: PanelScope, withCandidates: boolean): Promise<CommittedImport> {
    const found = await db
      .select(rowFields)
      .from(shipmentImportRows)
      .where(eq(shipmentImportRows.importId, view.id))
      .orderBy(asc(shipmentImportRows.rowNo));
    const duplicates = [...new Set(found.flatMap(({ row }) => (row.verdict === 'duplicate' && row.barcode ? [row.barcode] : [])))];
    const [made, elsewhere] = await Promise.all([
      importShipmentsOf(db, [view.id]),
      duplicates.length === 0 ? Promise.resolve([]) : elsewhereQuery(db, scope, duplicates, ne(shipments.importId, view.id)),
    ]);
    // سفارش حکم هر سطر، و سفارش هر کد (کد «همین است» و دستی می‌تواند مال سفارش دیگری باشد، ۶٫۲).
    const orderIds = [...new Set([...found.flatMap(({ row }) => (row.orderId ? [row.orderId] : [])), ...made.map((s) => s.orderId)])];
    const facts = orderIds.length === 0 ? [] : await factsQuery(db, scope, inArray(orders.id, orderIds), false);
    const shipmentsOf = (rowNo: number) => made.filter((s) => s.rowNo === rowNo);
    const rows: CommittedImportRow[] = found.map(({ row, dismissedByName }) => ({
      ...row,
      dismissedByName,
      queued: queuedRow(row, view.status, shipmentsOf(row.rowNo)),
    }));
    const candidates: Record<number, ReviewCandidates> = {};
    const queued = rows.filter((row) => row.queued);
    if (withCandidates && queued.length > 0) {
      const known = await candidateOrders(db, scope, queued.map(storedCandidateRow));
      for (const row of queued) {
        const voided = new Set(shipmentsOf(row.rowNo).map((s) => s.orderId));
        candidates[row.rowNo] = candidatesFor(storedCandidateRow(row), known, voided);
      }
    }
    return {
      rows,
      orders: facts as ShipmentOrderFacts[],
      shipments: made.map(({ importId: _import, ...s }) => s),
      elsewhere: elsewhere as ShipmentElsewhere[],
      candidates,
    };
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
        // همان `inReviewQueue` صف، برای سطرهای همین ورود (زیرپرسش همبسته: `shipment_import_rows` جدول درونی است و ورود بیرونی).
        queuedRows: sql<number>`(SELECT count(*)::int FROM shipment_import_rows
          WHERE ${shipmentImportRows.importId} = ${shipmentImports.id} AND ${inReviewQueue()})`,
        dismissedRows: sql<number>`(SELECT count(*)::int FROM shipment_import_rows r
          WHERE r.import_id = ${shipmentImports.id} AND r.dismissed_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.import_id = r.import_id AND s.row_no = r.row_no AND s.voided_at IS NULL))`,
        unmatchedRows: sql<number>`(SELECT count(*)::int FROM shipment_import_rows r
          WHERE r.import_id = ${shipmentImports.id} AND r.verdict = 'unmatched'
            AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.import_id = r.import_id AND s.row_no = r.row_no))`,
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
        queuedRows: row.queuedRows,
        dismissedRows: row.dismissedRows,
        unmatchedRows: row.unmatchedRows,
      }));
    },

    async importPage(scope, id, now, options = {}) {
      const withCandidates = options.candidates ?? true;
      const [row] = await viewQuery(db, { tables: shipmentImports.tables })
        .where(and(eq(shipmentImports.id, id), importsInScope(scope)))
        .limit(1);
      if (!row) return null;
      const view = toView(row);
      const judgeScope = importScope(view.partner?.id ?? null);
      if (view.status === 'read' && row.tables) {
        return { kind: 'preview', import: view, preview: await preview(row.tables, judgeScope, now, withCandidates) };
      }
      if (view.status === 'committed' || view.status === 'reverted') {
        return { kind: 'committed', import: view, committed: await committed(view, judgeScope, withCandidates) };
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
          // پیامک رهگیری هر کد، در همین تراکنش (۶٫۳): «منتظر»، یا همان پیامک قبلی همین کد برای همین سفارش (سؤال ۶۷).
          const sms = await trackingSmsFor(
            tx,
            matched.map(({ row, judged: j }) => ({ orderId: j.orderId!, orderNumber: numberOf.get(j.orderId!)!, barcode: row.barcode! })),
            input.at,
          );
          const made = matched.map(({ row, judged: j }, i) => ({
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
            smsMessageId: sms.ids[i]!,
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
                sms: sms.fresh.length,
              },
            }),
          );
          return { ok: true, counts, shipments: made.length, handed, sms: sms.fresh };
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

        // سطرهایی که همین حالا در صف‌اند، پیش از کنار رفتن کدها (کد کنارگذاشته سطر را به صف می‌برد، ولی ورود برگشته صف ندارد).
        const [queued] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(shipmentImportRows)
          .innerJoin(shipmentImports, eq(shipmentImports.id, shipmentImportRows.importId))
          .where(and(eq(shipmentImportRows.importId, imp.id), inReviewQueue()));
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
        const unqueued = queued?.n ?? 0;
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
              unqueued,
              reason: input.reason,
            },
          }),
        );
        return { ok: true, voided: live.length, reopened, kept, unqueued };
      });
    },

    async reviewQueue(scope, { limit, offset }) {
      const where = and(inReviewQueue(), importsInScope(scope));
      const [found, [total]] = await Promise.all([
        db
          .select({ ...rowFields, import: importRefFields })
          .from(shipmentImportRows)
          .innerJoin(shipmentImports, eq(shipmentImports.id, shipmentImportRows.importId))
          .leftJoin(printPartners, eq(printPartners.id, shipmentImports.printPartnerId))
          .where(where)
          // «قدیمی‌ترین اول» (تصمیم ۷۸): زمان «ثبت» ورود، بعد شمارهٔ سطر؛ سطری که با کنار رفتن کدش برگشت جای خودش را دارد.
          .orderBy(asc(shipmentImports.committedAt), asc(shipmentImports.id), asc(shipmentImportRows.rowNo))
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(shipmentImportRows)
          .innerJoin(shipmentImports, eq(shipmentImports.id, shipmentImportRows.importId))
          .where(where),
      ]);
      const rows = await reviewRowsOf(
        db,
        found.map((f) => ({ row: f.row, dismissedByName: f.dismissedByName, import: importRefOf(f.import) })),
      );
      return { rows, total: total?.n ?? 0 };
    },

    async reviewRow(scope, importId, rowNo) {
      const [found] = await db
        .select({ ...rowFields, import: importRefFields })
        .from(shipmentImportRows)
        .innerJoin(shipmentImports, eq(shipmentImports.id, shipmentImportRows.importId))
        .leftJoin(printPartners, eq(printPartners.id, shipmentImports.printPartnerId))
        .where(and(eq(shipmentImportRows.importId, importId), eq(shipmentImportRows.rowNo, rowNo), importsInScope(scope)))
        .limit(1);
      if (!found) return null;
      const [row] = await reviewRowsOf(db, [{ row: found.row, dismissedByName: found.dismissedByName, import: importRefOf(found.import) }]);
      return row ?? null;
    },

    async orderForRow(scope, importId, orderNumber) {
      const [imp] = await db
        .select({ printPartnerId: shipmentImports.printPartnerId })
        .from(shipmentImports)
        .where(and(eq(shipmentImports.id, importId), importsInScope(scope)))
        .limit(1);
      if (!imp) return null;
      const [order] = await factsQuery(db, importScope(imp.printPartnerId), eq(orders.orderNumber, orderNumber), false);
      return (order as ShipmentOrderFacts | undefined) ?? null;
    },

    async decide(scope, input) {
      try {
        return await db.transaction(async (tx): Promise<ReviewWrite> => {
          // ورود زیر قفل اشتراکی: برگرداندن هم‌زمانش (FOR UPDATE) پیش یا پس از این است، نه وسطش.
          const [imp] = await tx
            .select({ id: shipmentImports.id, status: shipmentImports.status, filename: shipmentImports.filename, printPartnerId: shipmentImports.printPartnerId })
            .from(shipmentImports)
            .where(and(eq(shipmentImports.id, input.importId), importsInScope(scope)))
            .limit(1)
            .for('share');
          if (!imp) return { ok: false, reason: 'not_found' };
          // دو تصمیم هم‌زمان روی یک سطر: دومی پشت این قفل می‌ماند و بعد کد زندهٔ اولی را می‌بیند.
          const [row] = await tx
            .select()
            .from(shipmentImportRows)
            .where(and(eq(shipmentImportRows.importId, imp.id), eq(shipmentImportRows.rowNo, input.rowNo)))
            .limit(1)
            .for('update');
          if (!row) return { ok: false, reason: 'not_found' };
          const rowShipments = await tx
            .select({ voidedAt: shipments.voidedAt })
            .from(shipments)
            .where(and(eq(shipments.importId, imp.id), eq(shipments.rowNo, row.rowNo)));
          const open = input.via === 'review' ? queuedRow(row, imp.status, rowShipments) : assignableRow(row, imp.status, rowShipments);
          if (!open) return { ok: false, reason: 'row_closed' };

          const judgeScope = importScope(imp.printPartnerId);
          const [found] = await factsQuery(tx, judgeScope, eq(orders.id, input.orderId), true);
          const order = found as ShipmentOrderFacts | undefined;
          if (!order || order.status === 'awaiting_payment' || order.status === 'expired') return { ok: false, reason: 'order_not_found' };
          if (order.status !== input.seen.status || order.liveShipments !== input.seen.liveShipments) return { ok: false, reason: 'changed' };
          const candidateRow = storedCandidateRow(row);
          if (input.via === 'review' && !isNumberedCandidate(candidateRow, order) && !isPoolCandidate(candidateRow, order)) {
            return { ok: false, reason: 'changed' };
          }
          const block = blockOf(candidateRow, order);
          if (block) return { ok: false, reason: 'blocked', block };
          // همین بارکد زنده برای سفارش دیگر: درج مرسوله به `shipments_live_barcode` می‌خورد و همه برمی‌گردد (پایین).

          // «در صف چاپ»: «شروع چاپ» و «تحویل پست شد» با هم؛ «در حال چاپ»: «تحویل پست شد»؛ «تحویل پست شد»: فقط کد (ADR-046).
          const from = order.status;
          const note = {
            source: 'post_file',
            via: input.via,
            importId: imp.id,
            filename: imp.filename,
            rowNo: row.rowNo,
            postDay: row.postDay!.toISOString(),
          };
          const step = async (fromStatus: 'paid' | 'printing', toStatus: 'printing' | 'handed_to_post') => {
            const [moved] = await tx
              .update(orders)
              .set({ status: toStatus, handedToPostAt: toStatus === 'handed_to_post' ? handedAtOf(row.postDay!, input.at) : null })
              .where(and(eq(orders.id, order.id), eq(orders.status, fromStatus), isNull(orders.filesDeletedAt)))
              .returning({ id: orders.id });
            // ردیف زیر قفل همین تراکنش است؛ شرط فقط دیوار دوم است.
            if (!moved) throw new Error(`سفارش ${order.orderNumber} زیر قفل «${fromStatus}» نماند`);
            await tx.insert(orderStatusEvents).values({
              orderId: order.id,
              fromStatus,
              toStatus,
              at: input.at,
              actor: 'admin',
              adminUserId: input.adminUserId,
              note,
            });
          };
          if (from === 'paid') await step('paid', 'printing');
          if (from === 'paid' || from === 'printing') await step('printing', 'handed_to_post');
          const handed = from !== 'handed_to_post';
          const sms = await trackingSmsFor(tx, [{ orderId: order.id, orderNumber: order.orderNumber, barcode: row.barcode! }], input.at);
          await tx.insert(shipments).values({
            orderId: order.id,
            barcode: row.barcode!,
            importId: imp.id,
            rowNo: row.rowNo,
            weightGrams: row.weightGrams!,
            fareRials: row.fareRials!,
            taxRials: row.taxRials!,
            postDay: row.postDay!,
            matchedBy: input.via,
            handedOrder: handed,
            adminUserId: input.adminUserId,
            createdAt: input.at,
            smsMessageId: sms.ids[0]!,
          });
          const criteria = criteriaOf(candidateRow, order);
          await tx.insert(adminEvents).values(
            adminEventRow({
              ...input.event,
              targetType: 'order',
              targetId: order.id,
              detail: {
                ...(input.event.detail as Record<string, unknown> | undefined),
                orderNumber: order.orderNumber,
                importId: imp.id,
                filename: imp.filename,
                rowNo: row.rowNo,
                barcode: row.barcode,
                from,
                handed,
                // آنچه ادمین کنار سفارش دید، برای سابقه: کدام معیار خواند و نمره.
                criteria,
                score: scoreOf(criteria),
              },
            }),
          );
          return { ok: true, orderNumber: order.orderNumber, from, handed, sms: sms.fresh[0] ?? null };
        });
      } catch (error) {
        // همین بارکد همین حالا جای دیگری زنده شد (ورود دیگری ثبت شد).
        if (constraintOf(error) === 'shipments_live_barcode') return { ok: false, reason: 'blocked', block: 'barcode_elsewhere' };
        throw error;
      }
    },

    async dismiss(scope, input) {
      return db.transaction(async (tx): Promise<DismissWrite> => {
        const [imp] = await tx
          .select({ id: shipmentImports.id, status: shipmentImports.status, filename: shipmentImports.filename })
          .from(shipmentImports)
          .where(and(eq(shipmentImports.id, input.importId), importsInScope(scope)))
          .limit(1)
          .for('share');
        if (!imp) return { ok: false, reason: 'not_found' };
        const [row] = await tx
          .select()
          .from(shipmentImportRows)
          .where(and(eq(shipmentImportRows.importId, imp.id), eq(shipmentImportRows.rowNo, input.rowNo)))
          .limit(1)
          .for('update');
        if (!row) return { ok: false, reason: 'not_found' };
        const rowShipments = await tx
          .select({ voidedAt: shipments.voidedAt })
          .from(shipments)
          .where(and(eq(shipments.importId, imp.id), eq(shipments.rowNo, row.rowNo)));
        if (!queuedRow(row, imp.status, rowShipments)) return { ok: false, reason: 'row_closed' };
        await tx
          .update(shipmentImportRows)
          .set({ dismissedAt: input.at, dismissedBy: input.adminUserId })
          .where(and(eq(shipmentImportRows.importId, imp.id), eq(shipmentImportRows.rowNo, row.rowNo)));
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            targetType: 'shipment_import',
            targetId: imp.id,
            detail: {
              ...(input.event.detail as Record<string, unknown> | undefined),
              filename: imp.filename,
              rowNo: row.rowNo,
              barcode: row.barcode,
              orderNumber: row.orderNumber,
            },
          }),
        );
        return { ok: true };
      });
    },

    async voidShipment(scope, input) {
      return db.transaction(async (tx): Promise<VoidWrite> => {
        const [found] = await tx
          .select({ id: shipments.id, importId: shipments.importId })
          .from(shipments)
          .innerJoin(orders, eq(orders.id, shipments.orderId))
          .where(and(eq(shipments.id, input.shipmentId), ordersInScope(scope)))
          .limit(1);
        if (!found) return { ok: false, reason: 'not_found' };
        // ترتیب قفل‌ها همان برگرداندن و «همین است»: ورود، بعد مرسوله، بعد سفارش.
        const [imp] = await tx
          .select({ id: shipmentImports.id, filename: shipmentImports.filename })
          .from(shipmentImports)
          .where(eq(shipmentImports.id, found.importId))
          .limit(1)
          .for('share');
        const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, found.id)).limit(1).for('update');
        if (!shipment || !imp) return { ok: false, reason: 'not_found' };
        if (shipment.voidedAt) return { ok: false, reason: 'already_voided' };
        // محدوده بالا سنجیده شد و کد هنوز زنده است، پس سفارشش «تحویل پست شد» است و چاپخانه‌اش عوض نشده (فقط در «در صف چاپ»، ADR-042).
        const [order] = await tx
          .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, filesDeletedAt: orders.filesDeletedAt })
          .from(orders)
          .where(eq(orders.id, shipment.orderId))
          .limit(1)
          .for('update');
        if (!order) return { ok: false, reason: 'not_found' };
        await tx
          .update(shipments)
          .set({ voidedAt: input.at, voidedBy: input.adminUserId, voidReason: input.reason })
          .where(and(eq(shipments.id, shipment.id), isNull(shipments.voidedAt)));
        const [other] = await tx
          .select({ id: shipments.id })
          .from(shipments)
          .where(and(eq(shipments.orderId, order.id), isNull(shipments.voidedAt)))
          .limit(1);
        // سفارشی که همین کد «تحویل پست شد» کرده بود، یک قدم به «در حال چاپ» (تصمیم ۸۰)، مثل برگرداندن ورود؛ کد دیگر، فایل‌های پاک‌شده
        // (ADR-044) یا «تحویل پست شد»ی که پیش از این کد خورده بود، سفارش را همان می‌گذارد.
        const kept = voidKept(shipment, Boolean(other), order.filesDeletedAt !== null);
        const reopened = kept === null && order.status === 'handed_to_post';
        if (reopened) {
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
            note: { reason: input.reason, source: 'shipment_void', importId: imp.id, filename: imp.filename, barcode: shipment.barcode },
          });
        }
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            targetType: 'order',
            targetId: order.id,
            detail: {
              ...(input.event.detail as Record<string, unknown> | undefined),
              orderNumber: order.orderNumber,
              barcode: shipment.barcode,
              importId: imp.id,
              filename: imp.filename,
              rowNo: shipment.rowNo,
              reason: input.reason,
              reopened,
            },
          }),
        );
        return { ok: true, orderNumber: order.orderNumber, reopened, kept };
      });
    },

    async shipmentSms(scope, shipmentId) {
      const [row] = await db
        .select({
          shipmentId: shipments.id,
          orderId: shipments.orderId,
          orderNumber: orders.orderNumber,
          barcode: shipments.barcode,
          voidedAt: shipments.voidedAt,
          ...shipmentSmsFields,
        })
        .from(shipments)
        .innerJoin(orders, eq(orders.id, shipments.orderId))
        .leftJoin(smsMessages, eq(smsMessages.id, shipments.smsMessageId))
        .where(and(eq(shipments.id, shipmentId), ordersInScope(scope)))
        .limit(1);
      if (!row) return null;
      const { smsId, smsToMobile, smsStatus, smsError, smsAttempts, smsCreatedAt, smsAttemptedAt, smsSentAt } = row;
      return {
        shipmentId: row.shipmentId,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        barcode: row.barcode,
        voided: row.voidedAt !== null,
        sms: shipmentSmsOf({ smsId, smsToMobile, smsStatus, smsError, smsAttempts, smsCreatedAt, smsAttemptedAt, smsSentAt }),
      };
    },

    async recordSmsResend(input) {
      await db.insert(adminEvents).values(
        adminEventRow({
          ...input.event,
          targetType: 'order',
          targetId: input.orderId,
          detail: { ...(input.event.detail as Record<string, unknown> | undefined), ...input.detail },
        }),
      );
    },
  };
}
