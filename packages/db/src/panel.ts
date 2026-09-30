/**
 * سفارش‌ها در پنل ادمین (برش ۴٫۲ و ۴٫۳؛ ADR-039): پیشخوان با ساعت تحویل به پست، فهرست با جست‌وجو و چیپ وضعیت،
 * جزئیات سفارش، فایل PDF جزوه برای دانلود، «دوباره بساز» آن، و از ۴٫۳ وضعیت سفارش (شروع چاپ، تحویل پست، لغو،
 * برگرداندن) و ویرایش گیرنده.
 *
 * مثل بقیهٔ این پکیج فقط خواندن و نوشتن است: روز تهران، متن‌ها، مجوز و اینکه کدام گذار مجاز است در سرویس سفارش
 * پنل (`apps/admin/lib/server/orders.ts`) گرفته می‌شوند و مرزها اینجا عدد می‌رسند. آنچه اینجاست همان است که
 * درستی‌اش فقط با پستگرس معلوم می‌شود:
 *
 *  - **سطل‌ها با یک شرط:** «باز» (در صف چاپ و در حال چاپ)، «تحویل پست شد»، «لغو شد»، «در انتظار پرداخت»، «رهاشده»
 *    و «همه»، هم برای فهرست و هم برای شمارش چیپ‌ها. رهاشده یعنی منقضی، یا در انتظاری که فایلی از جزوه‌اش پاک شده
 *    یا تا حاشیهٔ پرداخت پاک می‌شود: همان قاعدهٔ «دوباره پرداخت کن» سایت (ADR-034).
 *  - **مرز روز:** مهلت تحویل به پست پایان انحصاری روز است (`postHandoffDue`)، پس مهلتِ «امروز» خودِ آغاز فرداست.
 *    شمارش با مرزهایی است که سرویس از روز تهران می‌سازد.
 *  - **یک تراکنش:** «دوباره بساز» کار `prepare_order` یا `prepare_ticket` را با رویداد ادمین در همان تراکنش به صف
 *    برمی‌گرداند، زیر قفل ردیف کار؛ دو کلیک هم‌زمان یک بار. تغییر وضعیت هم: سفارش فقط اگر هنوز همان وضعیتی را دارد
 *    که ادمین دید، با ردیف `order_status_events` و رویداد ادمین در همان تراکنش؛ ویرایش گیرنده زیر قفل ردیف سفارش.
 *    کدام وضعیت به کدام می‌رود را تریگر `orders_status_flow` هم می‌سنجد (0011).
 *  - **برگهٔ امروز** (برش ۵٫۱، ADR-043): برگه‌ای که اثر انگشتش (`order_ticket_stamp`، 0016) با دادهٔ امروز سفارش نمی‌خواند
 *    تازه نیست؛ ویرایش گیرنده کار برگه را در همان تراکنش دوباره در صف می‌گذارد.
 *  - **فایل‌های پاک‌شده** (ADR-044): سفارشی که فایلش رفته وضعیتش عوض نمی‌شود؛ تغییر وضعیت شرطش را دارد، و تریگر
 *    `orders_files_deleted` هم.
 *  - **چاپخانهٔ سفارش** (برش ۵٫۲، ADR-042): جابه‌جایی فقط از چاپخانه‌ای که ادمین دید و فقط در «در صف چاپ»، با ردیف
 *    `order_assignments`، کار برگه و رویداد ادمین در همان تراکنش؛ «شروع چاپ» هم از چاپخانه‌ای که ادمین دید. پس جابه‌جایی و
 *    «شروع چاپ» هم‌زمان فقط یکی می‌شوند: هر دو ردیف سفارش را قفل می‌کنند و دومی شرطش را دیگر نمی‌یابد.
 *  - **بسته‌های پستی** (برش ۶٫۱، ADR-046): جزئیات سفارش مرسوله‌هایش را دارد، و جست‌وجو کد رهگیری را هم می‌شناسد؛ ورود فایل
 *    پست خودش در `shipments.ts` است.
 *  - **محدوده** (برش ۵٫۳، ADR-042): هر تابعی که سفارش می‌خواند یا می‌نویسد، محدوده را آرگومان اول و اجباری می‌گیرد (`PanelScope`:
 *    همه، یا یک چاپخانه) و در همان کوئری شرطش می‌کند، نه پس از آن؛ پس کوئری بی محدوده خطای تایپ است، و سفارش بیرون از محدوده
 *    همان «نیست» است. نوشتن‌ها شرط را زیر قفل ردیف سفارش دوباره می‌سنجند: سفارشی که همین حالا به چاپخانهٔ دیگری رفت، دیگر
 *    نوشتنی نیست.
 */

import { SMS_STUCK_MS } from '@jozveyar/sms';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { adminEventRow, type AdminEventInput } from './admin.js';
import type { AssignmentRule } from './assignment.js';
import type { Database } from './index.js';
import {
  PREPARE_ORDER_JOB,
  PREPARE_TICKET_JOB,
  requeueTicket,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
  type PaymentRow,
} from './orders.js';
import {
  adminEvents,
  adminUsers,
  bindingTypes,
  cities,
  documents,
  jobs,
  orderAssignments,
  orderItemSections,
  orderItems,
  orderPrintFiles,
  orderStatusEvents,
  orderTickets,
  orders,
  paperTypes,
  payments,
  printPartners,
  printRules,
  provinces,
  settings,
  shipmentImportRows,
  shipmentImports,
  shipments,
  shippingMethods,
  shippingZones,
  smsMessages,
} from './schema.js';
import { shipmentSmsFields, shipmentSmsOf, type ShipmentSms } from './sms.js';

/** دو کار سفارش پس از پرداخت: PDF جزوه و فایل چاپ، و برگهٔ سفارش. */
export type OrderJobKind = typeof PREPARE_ORDER_JOB | typeof PREPARE_TICKET_JOB;

/**
 * محدودهٔ سفارش‌های پنل (برش ۵٫۳، ADR-042): همهٔ سفارش‌ها (مالک و متصدی)، یا فقط سفارش‌هایی که امروز به یک چاپخانه سپرده شده‌اند
 * (نقش «چاپخانه»، `admin_user_roles.print_partner_id`). سفارش پرداخت‌نشده چاپخانه ندارد (`orders_partner_paid`)، پس در محدودهٔ
 * هیچ چاپخانه‌ای نیست؛ سفارشی که به چاپخانهٔ دیگری جابه‌جا شد، از همان لحظه بیرون است.
 */
export type PanelScope = { readonly kind: 'all' } | { readonly kind: 'partner'; readonly partnerId: string };

/** محدودهٔ مالک و متصدی: همهٔ سفارش‌ها. */
export const ALL_ORDERS: PanelScope = Object.freeze({ kind: 'all' });

/** شرط محدوده روی `orders`، در خود کوئری. */
function inScope(scope: PanelScope): SQL | undefined {
  switch (scope.kind) {
    case 'all':
      return undefined;
    case 'partner':
      return eq(orders.printPartnerId, scope.partnerId);
  }
}

/** همان شرط، برای ذخیره‌گاه‌های دیگری که سفارش می‌خوانند (ارسال، برش ۶٫۱). */
export const ordersInScope = inScope;

/** چیپ‌های فهرست سفارش‌ها، به ترتیب طرح پنل. */
export const PANEL_BUCKETS = ['open', 'handed', 'cancelled', 'awaiting', 'abandoned', 'all'] as const;
export type PanelBucket = (typeof PANEL_BUCKETS)[number];

/** «باز»: پرداخت‌شده و هنوز نه به پست رسیده، نه لغو شده. کاشی‌ها، صف تحویل و هشدار PDF فقط همین‌ها. */
export const OPEN_STATUSES = ['paid', 'printing'] as const satisfies readonly OrderStatus[];

/** گیرندهٔ سفارش، همان سه چیزی که پنل ویرایش می‌کند (نه موبایل، نه استان و شهر؛ ADR-034). */
export interface PanelRecipient {
  recipientName: string;
  addressText: string;
  postalCode: string | null;
}

/**
 * جست‌وجوی سفارش، تجزیه‌شده در سرویس: شماره (و ته شمارهٔ موبایل)، موبایل کامل، یا نام گیرنده.
 * `phoneSuffix` فقط رقم است؛ `text` فارسی‌نرمال‌شده.
 */
export type PanelSearch =
  | { kind: 'digits'; orderNumber: number | null; phoneSuffix: string | null }
  | { kind: 'mobile'; mobile: string }
  | { kind: 'name'; text: string }
  /** کد رهگیری ۲۴ رقمی (برش ۶٫۱): سفارشی که مرسوله‌ای با همین بارکد دارد، زنده یا کنارگذاشته. */
  | { kind: 'barcode'; barcode: string };

/** «حالا» و مرزهایی که با آن ساخته می‌شوند. */
export interface PanelClock {
  at: Date;
  /** فایلی که پیش از این لحظه پاک می‌شود، سفارش در انتظار را «رهاشده» می‌کند: `at` + حاشیهٔ پرداخت. */
  staleBefore: Date;
  /** تلاشی که پیش از این ساخته شده و هنوز در انتظار است «بی برگشت» است: `at` − مهلت هر تلاش پرداخت. */
  unreturnedBefore: Date;
  /** «کد رهگیری ندارد» فقط برای تحویل‌های پس از این لحظه (برش ۶٫۲): `at` − `TRACKING_ALERT_DAYS` روز. */
  untrackedSince: Date;
}

/**
 * هشدار «کد رهگیری ندارد» (برش ۶٫۲، ADR-047، تصمیم ۸۲): سفارش «تحویل پست شد» بی کد زنده، وقتی این چند روز کاری از روز تحویل
 * گذشته؛ فایل پست تا همین دو روز کاری می‌رسد (سؤال ۶۰). عدد در کد، نه تنظیم.
 */
export const TRACKING_GRACE_WORKDAYS = 2;
/** و فقط تحویل‌های این چند روز اخیر، همان پنجرهٔ نامزدهای صف (۴۵ روز)، تا هشدار همیشگی نشود. */
export const TRACKING_ALERT_DAYS = 45;

/**
 * سطر فایل پست در صف تأیید (برش ۶٫۲، ADR-046): ورودش «ثبت شد»، «هیچ‌کدام» نخورده، مرسولهٔ زنده ندارد، و حکمش صف تأیید است یا
 * کدی گرفته که کنار رفت. همان قاعدهٔ `queuedRow` در `shipments.ts`، به زبان پستگرس؛ و همان که تریگر «هیچ‌کدام» (0024) می‌سنجد.
 */
export function inReviewQueue(): SQL {
  const row = sql`s.import_id = ${shipmentImportRows.importId} AND s.row_no = ${shipmentImportRows.rowNo}`;
  return sql`(${shipmentImports.status} = 'committed' AND ${shipmentImportRows.dismissedAt} IS NULL
    AND NOT EXISTS (SELECT 1 FROM shipments s WHERE ${row} AND s.voided_at IS NULL)
    AND (${shipmentImportRows.verdict} = 'review' OR EXISTS (SELECT 1 FROM shipments s WHERE ${row})))`;
}

/** یک ردیف فهرست سفارش‌ها و صف تحویل. */
export interface PanelOrderLine {
  id: string;
  orderNumber: number;
  status: OrderRow['status'];
  totalRials: number;
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  cityName: string | null;
  createdAt: Date;
  paidAt: Date | null;
  postHandoffDueAt: Date | null;
  handedToPostAt: Date | null;
  /**
   * «تحویل پست شد» را «ثبت» فایل پست زد (برش ۶٫۱): فایل فقط روز پست را دارد، پس `handedToPostAt` پایان همان روز است و ساعتش
   * نشان داده نمی‌شود (سؤال ۷۰).
   */
  handedByFile: boolean;
  /** آخرین «لغو شد» (برش ۴٫۳)؛ فقط برای سفارشی که هنوز لغوشده است. */
  cancelledAt: Date | null;
  /** صفحه‌های جزوه‌ها، یک نسخه. */
  pageCount: number;
  itemCount: number;
  fileCount: number;
  /** بیشترین تعداد نسخهٔ یک جزوه. */
  copies: number;
  colorModes: string[];
  sidesModes: string[];
  /** کار `prepare_order`؛ null یعنی هنوز نیست (سفارش پرداخت‌نشده). */
  pdfJob: 'queued' | 'running' | 'done' | 'failed' | null;
  /** چاپخانهٔ سفارش (برش ۵٫۲)؛ null یعنی بی چاپخانه. */
  printPartnerId: string | null;
  /** تلاش‌های پرداختی که هنوز در انتظارند و از مهلتشان گذشته. */
  unreturnedPayments: number;
  /** فایلی از جزوه پاک شده، بی مهلت است، یا پیش از `staleBefore` پاک می‌شود. */
  stale: boolean;
  /** زودترین پاک شدن فایل‌های جزوه. */
  filesExpireAt: Date | null;
}

/** شمارش مهلت‌های سفارش‌های باز، با مرزهای روز تهران. */
export interface PanelDueSummary {
  overdue: number;
  today: number;
  tomorrow: number;
  later: number;
  /** زودترین و دیرترین مهلتِ دیرشده‌ها و «بعدتر»ها؛ متن کاشی‌ها با این‌ها. */
  overdueRange: { earliest: Date; latest: Date } | null;
  laterRange: { earliest: Date; latest: Date } | null;
}

/** سطر آمار پیشخوان (طرح پنل): چندتا از سفارش‌های باز در حال چاپ‌اند، و تحویل‌های پست از `since` تا «حالا». */
export interface PanelDashboardStats {
  printing: number;
  handed: number;
  /** به‌موقع: پیش از پایان مهلت (`handed_to_post_at < post_handoff_due_at`). */
  onTime: number;
}

export interface PanelAlerts {
  /** سفارش‌های باز (در صف چاپ یا در حال چاپ) که PDF جزوه‌شان ساخته نشد، به ترتیب مهلت. */
  failedPdf: number[];
  /** تلاش‌های بی برگشتِ سفارش‌هایی که هنوز پرداختنی‌اند، هر سفارش یک بار؛ تازه‌ترین سفارش اول. */
  unreturned: { orderNumber: number; attempts: number }[];
  /**
   * سفارش‌های «در صف چاپ» بی چاپخانه (برش ۵٫۲): هنگام پرداختشان هیچ چاپخانهٔ فعالی نبود، یا پیش از ۵٫۲ پرداخت شدند؛ به ترتیب
   * مهلت. «در حال چاپ» بی چاپخانه (پیش از ۵٫۲) نه: چاپخانه‌اش دیگر عوض نمی‌شود.
   */
  unassigned: number[];
  /**
   * سطرهای فایل پست که در صف تأییدند (برش ۶٫۲)، از ورودهای محدوده؛ پیشخوان فقط با `shipments.review` نشانش می‌دهد.
   */
  reviewRows: number;
  /**
   * سفارش‌های «تحویل پست شد» بی کد رهگیری زنده که پس از `untrackedSince` تحویل پست شدند، به ترتیب روز تحویل (برش ۶٫۲). اینکه دو
   * روز کاری از تحویل گذشته یا نه را سرویس با تعطیلی‌ها می‌سنجد (`TRACKING_GRACE_WORKDAYS`).
   */
  untracked: { orderNumber: number; handedToPostAt: Date }[];
  /**
   * سفارش‌هایی که پیامک رهگیری کد زنده‌شان نرفت، یا معلوم نیست رفت (برش ۶٫۳، ADR-047): همان حال «نرفت» و «معلوم نیست» پنل
   * (`smsState`، `SMS_STUCK_MS`)، فقط کدهای ثبت‌شده پس از `untrackedSince`؛ کوچک‌ترین شماره اول. پیشخوان فقط با `shipments.review`.
   */
  smsFailed: number[];
}

export interface PanelSection {
  seq: number;
  documentId: string;
  pageCount: number;
  originalName: string;
  sourceKind: string;
  fileExpiresAt: Date | null;
  fileDeletedAt: Date | null;
}

export interface PanelRule {
  seq: number;
  pageRanges: [number, number][];
  colorMode: 'color' | 'bw';
  paperTypeId: string;
  /** نام کاغذ در همان نسخهٔ تعرفهٔ سفارش. */
  paperName: string | null;
}

/** چه عوض شد در فایل چاپ یک جلد (ADR-043)؛ بازه‌ها به صفحهٔ سراسری جزوه، هر دو سر شامل. */
export interface PrintChanges {
  /** روی A4 نشست: `[first, last, widthPt, heightPt]`، با اندازه‌ای که صفحه پیش از چیدن داشت. */
  resized?: [number, number, number, number][];
  /** افقی بود و چرخید. */
  rotated?: [number, number][];
  /** حاشیه‌نویسی داشت و جزو صفحه شد. */
  annotated?: [number, number][];
}

/** فایل چاپ یک جلد (`order_print_files`). */
export interface PanelPrintVolume {
  volume: number;
  firstPage: number;
  lastPage: number;
  storageKey: string;
  sizeBytes: number;
  /** null یعنی هیچ صفحه‌ای عوض نشد. */
  changes: PrintChanges | null;
  createdAt: Date;
}

export interface PanelOrderItem extends OrderItemRow {
  /** نام صحافی در همان نسخهٔ تعرفهٔ سفارش. */
  bindingName: string | null;
  sections: PanelSection[];
  rules: PanelRule[];
  /** فایل‌های چاپ، به ترتیب جلد؛ خالی یعنی هنوز ساخته نشده. */
  printFiles: PanelPrintVolume[];
}

/** برگهٔ سفارش (`order_tickets`). */
export interface PanelTicket {
  sizeBytes: number;
  builtAt: Date;
  /** با دادهٔ امروز سفارش ساخته شده (`order_ticket_stamp`)؛ نه یعنی کهنه، تا کارگر دوباره بسازدش. */
  fresh: boolean;
}

export interface PanelPdfJob {
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
}

/** چاپخانهٔ امروز سفارش (برش ۵٫۲). */
export interface PanelPartnerRef {
  id: string;
  name: string;
  cityName: string;
  provinceName: string;
  /** غیرفعال شده، پس از تخصیص (مثلاً سفارش لغوشده‌ای که برگشت). */
  active: boolean;
  isDefault: boolean;
}

/** یک تخصیص چاپخانه (`order_assignments`)، با نام چاپخانه‌ها و ادمین. */
export interface PanelAssignment {
  id: number;
  at: Date;
  fromName: string | null;
  /** چاپخانه‌ای که سفارش به آن رفت؛ از چشم چاپخانه (۵٫۳) فقط ردیف‌هایی که به خودش رسید. */
  toPartnerId: string;
  toName: string;
  actor: 'system' | 'admin';
  adminName: string | null;
  rule: AssignmentRule | null;
  reason: string | null;
}

/** چاپخانهٔ فعالی که سفارش به آن جابه‌جا می‌شود: شهر و سفارش‌های بازش، مثل کاشی طرح. */
export interface PanelPartnerOption {
  id: string;
  name: string;
  cityName: string;
  isDefault: boolean;
  openOrders: number;
}

/**
 * یک بستهٔ پستی سفارش (برش ۶٫۱، ADR-045): کد رهگیری، وزن، کرایه و مالیات واقعی، و ورود فایل پستی که آورد؛ کنارگذاشته هم، با
 * دلیلش.
 */
export interface PanelShipment {
  id: string;
  barcode: string;
  weightGrams: number;
  fareRials: number;
  taxRials: number;
  postDay: Date;
  /** همین مرسوله سفارش را «تحویل پست شد» کرد. */
  handedOrder: boolean;
  /** `rule` (قطعی در «ثبت»)، `review` (تأیید صف) یا `manual` (دادن دستی)؛ برش ۶٫۲. */
  matchedBy: 'rule' | 'review' | 'manual';
  createdAt: Date;
  adminName: string | null;
  importId: string;
  filename: string;
  rowNo: number;
  voidedAt: Date | null;
  voidedByName: string | null;
  voidReason: string | null;
  /**
   * پیامک رهگیری همین کد (۶٫۳، ADR-047)؛ null برای مرسولهٔ پیش از ۶٫۳. ردیفی که پیش از خود مرسوله ساخته شده همان پیامکی است
   * که همین کد پیش‌تر برای همین سفارش گرفت (سؤال ۶۷).
   */
  sms: ShipmentSms | null;
}

/** یک تغییر وضعیت، با نام ادمینی که عوضش کرد (از ۴٫۳). */
export type PanelStatusEvent = typeof orderStatusEvents.$inferSelect & { adminName: string | null };

/** رویداد ادمینِ یک سفارش (دانلود، «دوباره بساز»)، با نام ادمین. */
export interface PanelOrderEvent {
  id: number;
  at: Date;
  action: string;
  detail: unknown;
  adminName: string | null;
}

export interface PanelOrderDetails {
  order: OrderRow;
  provinceName: string;
  cityName: string | null;
  zoneName: string;
  /** نام روش ارسال در همان نسخهٔ تعرفهٔ سفارش. */
  shippingMethodName: string | null;
  items: PanelOrderItem[];
  /** همهٔ تلاش‌های پرداخت، تازه‌ترین اول. */
  payments: PaymentRow[];
  /** تغییرهای وضعیت، به ترتیب زمان. */
  statusEvents: PanelStatusEvent[];
  /** کار `prepare_order`: PDF جزوه و فایل‌های چاپ. */
  pdfJob: PanelPdfJob | null;
  /** کار `prepare_ticket` و برگه‌ای که ساخت (برش ۵٫۱). */
  ticketJob: PanelPdfJob | null;
  ticket: PanelTicket | null;
  /** رویدادهای ادمینِ همین سفارش، به ترتیب زمان. */
  events: PanelOrderEvent[];
  /** چاپخانهٔ امروز سفارش (برش ۵٫۲)؛ null یعنی بی چاپخانه. */
  partner: PanelPartnerRef | null;
  /** تاریخچهٔ تخصیص، به ترتیب زمان. */
  assignments: PanelAssignment[];
  /** بسته‌های پستی (برش ۶٫۱)، به ترتیب ثبت. */
  shipments: PanelShipment[];
}

/** سفارشِ یک فایل: برای مجوز وضعیت و «پاک شد». */
interface PanelFileOwner {
  orderId: string;
  orderNumber: number;
  status: OrderRow['status'];
  filesDeletedAt: Date | null;
}

/** PDF یک جزوه برای دانلود. */
export interface PanelJozveFile extends PanelFileOwner {
  itemSeq: number;
  key: string | null;
  bytes: number | null;
  readyAt: Date | null;
}

/** فایل چاپ یک جلد برای دانلود؛ `key` null یعنی هنوز ساخته نشده. */
export interface PanelVolumeFile extends PanelFileOwner {
  itemSeq: number;
  volume: number;
  /** جلدهای ساخته‌شدهٔ همین جزوه؛ نام فایل یک‌جلدی «-jeld-» ندارد. */
  volumes: number;
  key: string | null;
  bytes: number | null;
}

/** برگهٔ سفارش برای دانلود و پیش‌نمایش؛ `key` null یعنی هنوز ساخته نشده. */
export interface PanelTicketFile extends PanelFileOwner {
  key: string | null;
  previewKey: string | null;
  bytes: number | null;
  fresh: boolean;
}

/**
 * تغییر وضعیت از پنل: از `from`، که ادمین دید، به `to`. `note` دلیل لغو یا برگرداندن است و فقط در پنل دیده می‌شود.
 * رویداد ادمین در همان تراکنش.
 */
export interface PanelStatusChange {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  /**
   * «شروع چاپ» (برش ۵٫۲): چاپخانه‌ای که ادمین دید. سفارشی که همین حالا به چاپخانهٔ دیگری رفت چاپش شروع نمی‌شود
   * (`partnerChanged`). نبودنش یعنی چاپخانه در این گذار سنجیده نمی‌شود.
   */
  partnerId?: string | null;
  at: Date;
  adminUserId: string;
  note: { reason: string } | null;
  event: AdminEventInput;
}

/**
 * نتیجهٔ تغییر وضعیت یا ویرایش: انجام شد، یا سفارش دیگر آن وضعیت را نداشت (`current`؛ null یعنی سفارشی نیست)، یا
 * فایل‌هایش همین حالا پاک شد (`filesDeleted`، ADR-044).
 */
export type PanelWrite =
  | { ok: true; order: OrderRow }
  | { ok: false; current: OrderStatus | null; filesDeleted?: boolean; partnerChanged?: boolean; hasShipment?: boolean };

/** جابه‌جایی چاپخانهٔ سفارش (برش ۵٫۲): از چاپخانه‌ای که ادمین دید (`from`؛ null یعنی سفارش بی چاپخانه بود)، با دلیل. */
export interface PanelAssign {
  orderId: string;
  from: string | null;
  to: string;
  at: Date;
  adminUserId: string;
  reason: string;
  event: AdminEventInput;
}

/**
 * نتیجهٔ جابه‌جایی: انجام شد؛ چاپخانهٔ تازه دیگر فعال نیست (`partner_inactive`)؛ یا سفارش دیگر «در صف چاپ» با همان چاپخانه نبود
 * (`changed`، با وضعیت و چاپخانهٔ امروز).
 */
export type PanelAssignWrite =
  | { ok: true; order: OrderRow }
  | { ok: false; reason: 'partner_inactive' }
  | { ok: false; reason: 'changed'; current: OrderStatus | null; partnerId: string | null };

/**
 * ذخیره‌گاه سفارش‌های پنل. هر تابعی که سفارش می‌خواند یا می‌نویسد، محدوده (`PanelScope`) را آرگومان اول می‌گیرد؛ سفارش بیرون از
 * محدوده همان «نیست» است (null، `not_found`، یا `current: null`). فقط `logEvent` (ردیف `admin_events`، پس از خواندنی که در محدوده
 * بود) و `setting` محدوده نمی‌خواهند: سفارشی نمی‌خوانند.
 */
export interface PanelOrderStore {
  dueSummary(scope: PanelScope, bounds: { at: Date; tomorrowStart: Date; dayAfterStart: Date }): Promise<PanelDueSummary>;
  /** در حال چاپ‌ها، و تحویل‌های پست از `since` تا `at`. */
  stats(scope: PanelScope, window: { since: Date; at: Date }): Promise<PanelDashboardStats>;
  alerts(scope: PanelScope, clock: PanelClock): Promise<PanelAlerts>;
  /** یک صفحه از یک سطل؛ «باز» به ترتیب مهلت، بقیه تازه‌ترین اول. */
  list(
    scope: PanelScope,
    query: { bucket: PanelBucket; search: PanelSearch | null; clock: PanelClock; limit: number; offset: number },
  ): Promise<PanelOrderLine[]>;
  /** شمارش هر سطل با همان جست‌وجو. */
  counts(scope: PanelScope, query: { search: PanelSearch | null; clock: PanelClock }): Promise<Record<PanelBucket, number>>;
  details(scope: PanelScope, orderNumber: number): Promise<PanelOrderDetails | null>;
  /** null یعنی چنین سفارش یا جزوه‌ای (در این محدوده) نیست. */
  jozveFile(scope: PanelScope, orderNumber: number, itemSeq: number): Promise<PanelJozveFile | null>;
  printVolume(scope: PanelScope, orderNumber: number, itemSeq: number, volume: number): Promise<PanelVolumeFile | null>;
  ticketFile(scope: PanelScope, orderNumber: number): Promise<PanelTicketFile | null>;
  /**
   * «دوباره بساز»: کار `prepare_order` یا `prepare_ticket` از نو در صف (یا تازه، اگر نبود)، با رویداد در همان تراکنش. کار
   * قبلی (تعداد تلاش و کد خطا، بی متن خام) در جزئیات رویداد می‌ماند، چون ردیف کار از نو می‌شود. `busy`: کار همین حالا
   * در صف است یا کارگر رویش است (دو کلیک: دومی). `not_found`: سفارش (دیگر) در محدوده نیست؛ ردیفش `FOR SHARE` قفل است، پس
   * جابه‌جایی هم‌زمان پیش یا پس از این است، نه وسطش. اینکه کی ساختن دوباره معنا دارد را سرویس می‌گوید.
   */
  requeue(scope: PanelScope, orderId: string, kind: OrderJobKind, event: AdminEventInput): Promise<'ok' | 'busy' | 'not_found'>;
  /**
   * تغییر وضعیت در یک تراکنش: `UPDATE … WHERE status = from` (دو کلیک هم‌زمان یک بار؛ دومی `ok: false` با وضعیت
   * تازه)، و فقط اگر فایل‌های سفارش پاک نشده (`filesDeleted`)؛ زمان تحویل به پست فقط در «تحویل پست شد»، یک ردیف
   * `order_status_events` با ادمین و یادداشت، و رویداد ادمین. سفارشی که کد رهگیری زنده دارد از «تحویل پست شد» بیرون نمی‌رود
   * (`hasShipment`، برش ۶٫۱): تریگر معوق `shipments_order_handed` در COMMIT ردش می‌کند.
   */
  changeStatus(scope: PanelScope, change: PanelStatusChange): Promise<PanelWrite>;
  /**
   * گیرندهٔ تازه، زیر قفل ردیف سفارش و فقط اگر وضعیت سفارش هنوز در `editable` است. رویداد ادمین با نام فیلدهای
   * عوض‌شده و مقدار پیشینشان (سابقه‌ای که بعداً بگوید پیش از ویرایش چه بود)؛ بی تغییر، بی رویداد. برگهٔ سفارش نام و
   * نشانی را دارد، پس کارش در همان تراکنش دوباره در صف می‌رود (برش ۵٫۱).
   */
  editRecipient(
    scope: PanelScope,
    input: {
      orderId: string;
      editable: readonly OrderStatus[];
      recipient: PanelRecipient;
      event: AdminEventInput;
    },
  ): Promise<PanelWrite & { changed?: (keyof PanelRecipient)[] }>;
  /**
   * چاپخانه‌های فعال برای جابه‌جایی: پیش‌فرض اول، بعد قدیمی‌ترین، هر کدام با سفارش‌های بازش؛ در محدودهٔ یک چاپخانه فقط همان
   * (چاپخانه‌های دیگر و سفارش‌هایشان بیرون از محدوده‌اند).
   */
  partnerOptions(scope: PanelScope): Promise<PanelPartnerOption[]>;
  /**
   * جابه‌جایی در یک تراکنش: چاپخانهٔ تازه `FOR SHARE` (فعال بماند)، `UPDATE … WHERE status = 'paid' AND چاپخانه = from`، ردیف
   * `order_assignments` با ادمین و دلیل، کار برگه دوباره در صف (نام و شهر چاپخانه روی برگه است)، و رویداد ادمین با نام هر دو
   * چاپخانه و دلیل. دو کلیک هم‌زمان یک بار؛ دومی `changed` با چاپخانهٔ تازه.
   */
  assignPartner(scope: PanelScope, input: PanelAssign): Promise<PanelAssignWrite>;
  logEvent(event: AdminEventInput): Promise<void>;
  /** مقدار خام یک کلید `settings`؛ undefined یعنی تنظیم نشده. */
  setting(key: string): Promise<unknown>;
}

/**
 * کد خطای کار از `last_error` کارگر: شکست قطعی «کد: پیام» است (`file_missing: …`)، و هر چیز دیگر خطای گذرا
 * (`StorageError(…)`) که کارگر دوباره امتحانش کرده بود.
 */
export function pdfErrorCode(lastError: string | null): string | null {
  if (!lastError) return null;
  return /^([a-z_]+):/.exec(lastError)?.[1] ?? 'transient';
}

const ts = (value: Date) => sql`${value.toISOString()}::timestamptz`;

type PgError = { code?: string; constraint_name?: string; cause?: PgError };

/** نام محدودیتی که پستگرس رد کرد؛ drizzle خطای درایور را در `cause` می‌پیچد. */
function constraintOf(error: unknown): string | undefined {
  const pg = error as PgError;
  return pg?.cause?.constraint_name ?? pg?.constraint_name;
}

/** یکی از فایل‌های جزوه پاک شده، بی مهلت است، یا پیش از `staleBefore` پاک می‌شود. */
function staleFiles(staleBefore: Date): SQL {
  return sql`EXISTS (
    SELECT 1 FROM order_items i
      JOIN order_item_sections s ON s.order_item_id = i.id
      JOIN documents d ON d.id = s.document_id
     WHERE i.order_id = ${orders.id}
       AND (d.file_deleted_at IS NOT NULL OR d.file_expires_at IS NULL OR d.file_expires_at < ${ts(staleBefore)}))`;
}

const openOrder = () => inArray(orders.status, [...OPEN_STATUSES]);

function bucketWhere(bucket: PanelBucket, staleBefore: Date): SQL | undefined {
  switch (bucket) {
    case 'open':
      return openOrder();
    case 'handed':
      return sql`${orders.status} = 'handed_to_post'`;
    case 'cancelled':
      return sql`${orders.status} = 'cancelled'`;
    case 'awaiting':
      return sql`(${orders.status} = 'awaiting_payment' AND NOT ${staleFiles(staleBefore)})`;
    case 'abandoned':
      return sql`(${orders.status} = 'expired' OR (${orders.status} = 'awaiting_payment' AND ${staleFiles(staleBefore)}))`;
    case 'all':
      return undefined;
  }
}

/** `%` و `_` و `\` در الگوی LIKE حرف‌اند، نه نویسهٔ عام. */
const likeText = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

function searchWhere(search: PanelSearch | null): SQL | undefined {
  if (!search) return undefined;
  switch (search.kind) {
    case 'mobile':
      return eq(orders.recipientPhone, search.mobile);
    case 'digits': {
      const parts = [
        search.orderNumber !== null ? eq(orders.orderNumber, search.orderNumber) : undefined,
        search.phoneSuffix ? sql`${orders.recipientPhone} LIKE ${`%${search.phoneSuffix}`}` : undefined,
      ].filter((part): part is SQL => part !== undefined);
      return parts.length > 0 ? or(...parts) : sql`false`;
    }
    case 'name':
      return sql`${orders.recipientName} ILIKE ${`%${likeText(search.text)}%`} ESCAPE '\\'`;
    case 'barcode':
      return sql`EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = ${orders.id} AND s.barcode = ${search.barcode})`;
  }
}

export function createPanelOrderStore({ db }: Database): PanelOrderStore {
  function lineFields(clock: PanelClock) {
    return {
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalRials: orders.totalRials,
      recipientName: orders.recipientName,
      recipientPhone: orders.recipientPhone,
      provinceName: provinces.nameFa,
      cityName: cities.nameFa,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      postHandoffDueAt: orders.postHandoffDueAt,
      handedToPostAt: orders.handedToPostAt,
      handedByFile: sql<boolean>`EXISTS (SELECT 1 FROM shipments s
        WHERE s.order_id = ${orders.id} AND s.handed_order AND s.voided_at IS NULL)`,
      cancelledAt: sql<Date | null>`CASE WHEN ${orders.status} = 'cancelled' THEN (SELECT max(e.at) FROM order_status_events e
        WHERE e.order_id = ${orders.id} AND e.to_status = 'cancelled') END`.mapWith(orders.createdAt),
      pageCount: sql<number>`(SELECT coalesce(sum(i.page_count), 0)::int FROM order_items i WHERE i.order_id = ${orders.id})`,
      itemCount: sql<number>`(SELECT count(*)::int FROM order_items i WHERE i.order_id = ${orders.id})`,
      fileCount: sql<number>`(SELECT count(*)::int FROM order_items i
        JOIN order_item_sections s ON s.order_item_id = i.id WHERE i.order_id = ${orders.id})`,
      copies: sql<number>`(SELECT coalesce(max(i.copies), 1)::int FROM order_items i WHERE i.order_id = ${orders.id})`,
      colorModes: sql<string[]>`(SELECT coalesce(array_agg(DISTINCT r.color_mode::text), '{}'::text[]) FROM order_items i
        JOIN print_rules r ON r.order_item_id = i.id WHERE i.order_id = ${orders.id})`,
      sidesModes: sql<string[]>`(SELECT coalesce(array_agg(DISTINCT i.sides_mode::text), '{}'::text[])
        FROM order_items i WHERE i.order_id = ${orders.id})`,
      pdfJob: jobs.status,
      printPartnerId: orders.printPartnerId,
      unreturnedPayments: sql<number>`(SELECT count(*)::int FROM payments p WHERE p.order_id = ${orders.id}
        AND p.status = 'pending' AND p.created_at < ${ts(clock.unreturnedBefore)})`,
      stale: sql<boolean>`${staleFiles(clock.staleBefore)}`,
      filesExpireAt: sql<Date | null>`(SELECT min(d.file_expires_at) FROM order_items i
        JOIN order_item_sections s ON s.order_item_id = i.id
        JOIN documents d ON d.id = s.document_id WHERE i.order_id = ${orders.id})`.mapWith(documents.fileExpiresAt),
    };
  }

  const pdfJobJoin = and(eq(jobs.orderId, orders.id), eq(jobs.kind, PREPARE_ORDER_JOB));

  return {
    async dueSummary(scope, { at, tomorrowStart, dayAfterStart }) {
      const due = orders.postHandoffDueAt;
      const overdue = sql`${due} <= ${ts(at)}`;
      const today = sql`${due} > ${ts(at)} AND ${due} <= ${ts(tomorrowStart)}`;
      const tomorrow = sql`${due} > ${ts(tomorrowStart)} AND ${due} <= ${ts(dayAfterStart)}`;
      const later = sql`${due} > ${ts(dayAfterStart)}`;
      const [row] = await db
        .select({
          overdue: sql<number>`count(*) FILTER (WHERE ${overdue})::int`,
          today: sql<number>`count(*) FILTER (WHERE ${today})::int`,
          tomorrow: sql<number>`count(*) FILTER (WHERE ${tomorrow})::int`,
          later: sql<number>`count(*) FILTER (WHERE ${later})::int`,
          overdueEarliest: sql<Date | null>`min(${due}) FILTER (WHERE ${overdue})`.mapWith(due),
          overdueLatest: sql<Date | null>`max(${due}) FILTER (WHERE ${overdue})`.mapWith(due),
          laterEarliest: sql<Date | null>`min(${due}) FILTER (WHERE ${later})`.mapWith(due),
          laterLatest: sql<Date | null>`max(${due}) FILTER (WHERE ${later})`.mapWith(due),
        })
        .from(orders)
        .where(and(openOrder(), inScope(scope)));
      const range = (earliest: Date | null, latest: Date | null) => (earliest && latest ? { earliest, latest } : null);
      return {
        overdue: row?.overdue ?? 0,
        today: row?.today ?? 0,
        tomorrow: row?.tomorrow ?? 0,
        later: row?.later ?? 0,
        overdueRange: range(row?.overdueEarliest ?? null, row?.overdueLatest ?? null),
        laterRange: range(row?.laterEarliest ?? null, row?.laterLatest ?? null),
      };
    },

    async stats(scope, { since, at }) {
      // «تحویل پست شد» همیشه زمانش را دارد و فقط همان (`orders_handed_at`)؛ برگشته از پست دیگر شمرده نمی‌شود.
      const handedIn = sql`(${orders.handedToPostAt} > ${ts(since)} AND ${orders.handedToPostAt} <= ${ts(at)})`;
      const printing = eq(orders.status, 'printing');
      const [row] = await db
        .select({
          printing: sql<number>`count(*) FILTER (WHERE ${printing})::int`,
          handed: sql<number>`count(*) FILTER (WHERE ${handedIn})::int`,
          onTime: sql<number>`count(*) FILTER (WHERE ${handedIn} AND ${orders.handedToPostAt} < ${orders.postHandoffDueAt})::int`,
        })
        .from(orders)
        .where(and(or(printing, handedIn), inScope(scope)));
      return { printing: row?.printing ?? 0, handed: row?.handed ?? 0, onTime: row?.onTime ?? 0 };
    },

    async alerts(scope, clock) {
      const stuck = ts(new Date(clock.at.getTime() - SMS_STUCK_MS));
      const [failed, unreturned, unassigned, review, untracked, smsFailed] = await Promise.all([
        db
          .select({ orderNumber: orders.orderNumber })
          .from(orders)
          .innerJoin(jobs, pdfJobJoin)
          .where(and(openOrder(), eq(jobs.status, 'failed'), inScope(scope)))
          .orderBy(asc(orders.postHandoffDueAt), asc(orders.orderNumber)),
        // پرداخت‌نشده چاپخانه ندارد، پس در محدودهٔ چاپخانه این دو همیشه خالی‌اند؛ شرط همان‌جاست تا هیچ کوئری‌ای بی آن نماند.
        db
          .select({ orderNumber: orders.orderNumber, attempts: sql<number>`count(*)::int` })
          .from(payments)
          .innerJoin(orders, eq(orders.id, payments.orderId))
          .where(
            and(
              eq(payments.status, 'pending'),
              lt(payments.createdAt, clock.unreturnedBefore),
              eq(orders.status, 'awaiting_payment'),
              sql`NOT ${staleFiles(clock.staleBefore)}`,
              inScope(scope),
            ),
          )
          .groupBy(orders.orderNumber)
          .orderBy(desc(orders.orderNumber)),
        db
          .select({ orderNumber: orders.orderNumber })
          .from(orders)
          .where(and(eq(orders.status, 'paid'), isNull(orders.printPartnerId), inScope(scope)))
          .orderBy(asc(orders.postHandoffDueAt), asc(orders.orderNumber)),
        // صف تأیید (۶٫۲): سطرهای ورودهای محدوده؛ ورود چاپخانه فقط در محدودهٔ همان چاپخانه.
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(shipmentImportRows)
          .innerJoin(shipmentImports, eq(shipmentImports.id, shipmentImportRows.importId))
          .where(and(inReviewQueue(), scope.kind === 'partner' ? eq(shipmentImports.printPartnerId, scope.partnerId) : undefined)),
        // «کد رهگیری ندارد» (۶٫۲): تحویل پست شده، بی کد زنده، در پنجرهٔ اخیر؛ دو روز کاری را سرویس با تعطیلی‌ها می‌سنجد. زمان
        // تحویل پست فقط در «تحویل پست شد» پر است (`orders_handed_at`)، پس همین شرط وضعیت هم هست.
        db
          .select({ orderNumber: orders.orderNumber, handedToPostAt: orders.handedToPostAt })
          .from(orders)
          .where(
            and(
              sql`${orders.handedToPostAt} > ${ts(clock.untrackedSince)}`,
              sql`NOT EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = ${orders.id} AND s.voided_at IS NULL)`,
              inScope(scope),
            ),
          )
          .orderBy(asc(orders.handedToPostAt), asc(orders.orderNumber)),
        // پیامک رهگیری که نرفت (۶٫۳): کد زنده، ثبت‌شده در همان پنجره، و ردیفش «نرفت»، یا «منتظر» و «در حال فرستادن»ی که ماند.
        db
          .selectDistinct({ orderNumber: orders.orderNumber })
          .from(shipments)
          .innerJoin(orders, eq(orders.id, shipments.orderId))
          .innerJoin(smsMessages, eq(smsMessages.id, shipments.smsMessageId))
          .where(
            and(
              isNull(shipments.voidedAt),
              sql`${shipments.createdAt} > ${ts(clock.untrackedSince)}`,
              sql`(${smsMessages.status} = 'failed'
                OR (${smsMessages.status} = 'pending' AND ${smsMessages.createdAt} < ${stuck})
                OR (${smsMessages.status} = 'sending' AND ${smsMessages.attemptedAt} < ${stuck}))`,
              inScope(scope),
            ),
          )
          .orderBy(asc(orders.orderNumber)),
      ]);
      return {
        failedPdf: failed.map((row) => row.orderNumber),
        unreturned,
        unassigned: unassigned.map((row) => row.orderNumber),
        reviewRows: review[0]?.n ?? 0,
        untracked: untracked.flatMap((row) => (row.handedToPostAt ? [{ orderNumber: row.orderNumber, handedToPostAt: row.handedToPostAt }] : [])),
        smsFailed: smsFailed.map((row) => row.orderNumber),
      };
    },

    async list(scope, { bucket, search, clock, limit, offset }) {
      const rows = await db
        .select(lineFields(clock))
        .from(orders)
        .innerJoin(provinces, eq(provinces.id, orders.provinceId))
        .leftJoin(cities, eq(cities.id, orders.cityId))
        .leftJoin(jobs, pdfJobJoin)
        .where(and(bucketWhere(bucket, clock.staleBefore), searchWhere(search), inScope(scope)))
        .orderBy(
          ...(bucket === 'open'
            ? [asc(orders.postHandoffDueAt), asc(orders.paidAt), asc(orders.orderNumber)]
            : [desc(orders.orderNumber)]),
        )
        .limit(limit)
        .offset(offset);
      return rows.map((row) => ({ ...row, pdfJob: row.pdfJob ?? null }));
    },

    async counts(scope, { search, clock }) {
      const staleBefore = clock.staleBefore;
      const filtered = (bucket: PanelBucket) => sql<number>`count(*) FILTER (WHERE ${bucketWhere(bucket, staleBefore)})::int`;
      const [row] = await db
        .select({
          open: filtered('open'),
          handed: filtered('handed'),
          cancelled: filtered('cancelled'),
          awaiting: filtered('awaiting'),
          abandoned: filtered('abandoned'),
          all: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(and(searchWhere(search), inScope(scope)));
      return {
        open: row?.open ?? 0,
        handed: row?.handed ?? 0,
        cancelled: row?.cancelled ?? 0,
        awaiting: row?.awaiting ?? 0,
        abandoned: row?.abandoned ?? 0,
        all: row?.all ?? 0,
      };
    },

    async details(scope, orderNumber) {
      const [head] = await db
        .select({
          order: orders,
          provinceName: provinces.nameFa,
          cityName: cities.nameFa,
          zoneName: shippingZones.nameFa,
          shippingMethodName: shippingMethods.nameFa,
        })
        .from(orders)
        .innerJoin(provinces, eq(provinces.id, orders.provinceId))
        .leftJoin(cities, eq(cities.id, orders.cityId))
        .innerJoin(shippingZones, eq(shippingZones.id, orders.shippingZoneId))
        .leftJoin(
          shippingMethods,
          and(eq(shippingMethods.priceListVersion, orders.priceListVersion), eq(shippingMethods.id, orders.shippingMethodId)),
        )
        .where(and(eq(orders.orderNumber, orderNumber), inScope(scope)))
        .limit(1);
      // بیرون از محدوده همان «نیست» است؛ بقیهٔ کوئری‌ها فقط با شناسهٔ همین سفارش.
      if (!head) return null;
      const { order } = head;

      const itemRows = await db
        .select({ item: orderItems, bindingName: bindingTypes.nameFa })
        .from(orderItems)
        .leftJoin(
          bindingTypes,
          and(eq(bindingTypes.priceListVersion, order.priceListVersion), eq(bindingTypes.id, orderItems.bindingTypeId)),
        )
        .where(eq(orderItems.orderId, order.id))
        .orderBy(orderItems.seq);
      const itemIds = itemRows.map((row) => row.item.id);

      const fromPartner = alias(printPartners, 'from_partner');
      const toPartner = alias(printPartners, 'to_partner');
      const [
        sectionRows,
        ruleRows,
        paymentRows,
        statusRows,
        jobRows,
        eventRows,
        printRows,
        ticketRows,
        partnerRows,
        assignmentRows,
        shipmentRows,
      ] = await Promise.all([
        itemIds.length === 0
          ? []
          : db
              .select({
                orderItemId: orderItemSections.orderItemId,
                seq: orderItemSections.seq,
                documentId: orderItemSections.documentId,
                pageCount: orderItemSections.pageCount,
                originalName: documents.originalName,
                sourceKind: documents.sourceKind,
                fileExpiresAt: documents.fileExpiresAt,
                fileDeletedAt: documents.fileDeletedAt,
              })
              .from(orderItemSections)
              .innerJoin(documents, eq(documents.id, orderItemSections.documentId))
              .where(inArray(orderItemSections.orderItemId, itemIds))
              .orderBy(orderItemSections.orderItemId, orderItemSections.seq),
        itemIds.length === 0
          ? []
          : db
              .select({ rule: printRules, paperName: paperTypes.nameFa })
              .from(printRules)
              .leftJoin(
                paperTypes,
                and(eq(paperTypes.priceListVersion, order.priceListVersion), eq(paperTypes.id, printRules.paperTypeId)),
              )
              .where(inArray(printRules.orderItemId, itemIds))
              .orderBy(printRules.orderItemId, printRules.seq),
        db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)),
        db
          .select({ event: orderStatusEvents, adminName: adminUsers.displayName })
          .from(orderStatusEvents)
          .leftJoin(adminUsers, eq(adminUsers.id, orderStatusEvents.adminUserId))
          .where(eq(orderStatusEvents.orderId, order.id))
          .orderBy(asc(orderStatusEvents.at), asc(orderStatusEvents.id)),
        db
          .select()
          .from(jobs)
          .where(and(eq(jobs.orderId, order.id), inArray(jobs.kind, [PREPARE_ORDER_JOB, PREPARE_TICKET_JOB]))),
        db
          .select({
            id: adminEvents.id,
            at: adminEvents.at,
            action: adminEvents.action,
            detail: adminEvents.detail,
            adminName: adminUsers.displayName,
          })
          .from(adminEvents)
          .leftJoin(adminUsers, eq(adminUsers.id, adminEvents.adminUserId))
          .where(and(eq(adminEvents.targetType, 'order'), eq(adminEvents.targetId, order.id)))
          .orderBy(asc(adminEvents.at), asc(adminEvents.id)),
        itemIds.length === 0
          ? []
          : db
              .select()
              .from(orderPrintFiles)
              .where(inArray(orderPrintFiles.orderItemId, itemIds))
              .orderBy(orderPrintFiles.orderItemId, orderPrintFiles.volume),
        db
          .select({
            sizeBytes: orderTickets.sizeBytes,
            builtAt: orderTickets.builtAt,
            fresh: sql<boolean>`${orderTickets.stamp} = order_ticket_stamp(${orders})`,
          })
          .from(orderTickets)
          .innerJoin(orders, eq(orders.id, orderTickets.orderId))
          .where(eq(orderTickets.orderId, order.id))
          .limit(1),
        order.printPartnerId === null
          ? []
          : db
              .select({
                id: printPartners.id,
                name: printPartners.name,
                cityName: cities.nameFa,
                provinceName: provinces.nameFa,
                active: sql<boolean>`${printPartners.deactivatedAt} IS NULL`,
                isDefault: printPartners.isDefault,
              })
              .from(printPartners)
              .innerJoin(cities, eq(cities.id, printPartners.cityId))
              .innerJoin(provinces, eq(provinces.id, printPartners.provinceId))
              .where(eq(printPartners.id, order.printPartnerId))
              .limit(1),
        db
          .select({
            id: orderAssignments.id,
            at: orderAssignments.at,
            fromName: fromPartner.name,
            toPartnerId: orderAssignments.toPartnerId,
            toName: toPartner.name,
            actor: orderAssignments.actor,
            adminName: adminUsers.displayName,
            rule: orderAssignments.rule,
            reason: orderAssignments.reason,
          })
          .from(orderAssignments)
          .innerJoin(toPartner, eq(toPartner.id, orderAssignments.toPartnerId))
          .leftJoin(fromPartner, eq(fromPartner.id, orderAssignments.fromPartnerId))
          .leftJoin(adminUsers, eq(adminUsers.id, orderAssignments.adminUserId))
          .where(eq(orderAssignments.orderId, order.id))
          .orderBy(asc(orderAssignments.id)),
        db
          .select({
            id: shipments.id,
            barcode: shipments.barcode,
            weightGrams: shipments.weightGrams,
            fareRials: shipments.fareRials,
            taxRials: shipments.taxRials,
            postDay: shipments.postDay,
            handedOrder: shipments.handedOrder,
            matchedBy: sql<PanelShipment['matchedBy']>`${shipments.matchedBy}`,
            createdAt: shipments.createdAt,
            adminName: adminUsers.displayName,
            importId: shipments.importId,
            filename: shipmentImports.filename,
            rowNo: shipments.rowNo,
            voidedAt: shipments.voidedAt,
            voidedByName: sql<string | null>`(SELECT u.display_name FROM admin_users u WHERE u.id = ${shipments.voidedBy})`,
            voidReason: shipments.voidReason,
            ...shipmentSmsFields,
          })
          .from(shipments)
          .innerJoin(shipmentImports, eq(shipmentImports.id, shipments.importId))
          .leftJoin(adminUsers, eq(adminUsers.id, shipments.adminUserId))
          .leftJoin(smsMessages, eq(smsMessages.id, shipments.smsMessageId))
          .where(eq(shipments.orderId, order.id))
          .orderBy(asc(shipments.createdAt), asc(shipments.rowNo)),
      ]);

      const jobOf = (kind: OrderJobKind): PanelPdfJob | null => {
        const job = jobRows.find((row) => row.kind === kind);
        return job
          ? {
              status: job.status,
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
              lastError: job.lastError,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              finishedAt: job.finishedAt,
            }
          : null;
      };
      return {
        order,
        provinceName: head.provinceName,
        cityName: head.cityName,
        zoneName: head.zoneName,
        shippingMethodName: head.shippingMethodName,
        items: itemRows.map(({ item, bindingName }) => ({
          ...item,
          bindingName,
          sections: sectionRows
            .filter((s) => s.orderItemId === item.id)
            .map(({ orderItemId: _item, ...section }) => section),
          rules: ruleRows
            .filter((r) => r.rule.orderItemId === item.id)
            .map(({ rule, paperName }) => ({
              seq: rule.seq,
              pageRanges: rule.pageRanges as [number, number][],
              colorMode: rule.colorMode,
              paperTypeId: rule.paperTypeId,
              paperName,
            })),
          printFiles: printRows
            .filter((row) => row.orderItemId === item.id)
            .map(({ orderItemId: _item, sha256: _sha, changes, ...file }) => ({ ...file, changes: changes as PrintChanges | null })),
        })),
        payments: paymentRows,
        statusEvents: statusRows.map(({ event, adminName }) => ({ ...event, adminName })),
        pdfJob: jobOf(PREPARE_ORDER_JOB),
        ticketJob: jobOf(PREPARE_TICKET_JOB),
        ticket: ticketRows[0] ?? null,
        events: eventRows,
        partner: partnerRows[0] ?? null,
        assignments: assignmentRows.map((row) => ({
          ...row,
          actor: row.actor === 'admin' ? ('admin' as const) : ('system' as const),
          rule: (row.rule as AssignmentRule | null) ?? null,
        })),
        shipments: shipmentRows.map((row) => {
          const { smsId, smsToMobile, smsStatus, smsError, smsAttempts, smsCreatedAt, smsAttemptedAt, smsSentAt, ...shipment } = row;
          return {
            ...shipment,
            sms: shipmentSmsOf({ smsId, smsToMobile, smsStatus, smsError, smsAttempts, smsCreatedAt, smsAttemptedAt, smsSentAt }),
          };
        }),
      };
    },

    async jozveFile(scope, orderNumber, itemSeq) {
      const [row] = await db
        .select({
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          filesDeletedAt: orders.filesDeletedAt,
          itemSeq: orderItems.seq,
          key: orderItems.printPdfKey,
          bytes: orderItems.printPdfBytes,
          readyAt: orderItems.printPdfReadyAt,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orders.orderNumber, orderNumber), eq(orderItems.seq, itemSeq), inScope(scope)))
        .limit(1);
      return row ?? null;
    },

    async printVolume(scope, orderNumber, itemSeq, volume) {
      const [row] = await db
        .select({
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          filesDeletedAt: orders.filesDeletedAt,
          itemSeq: orderItems.seq,
          volumes: sql<number>`(SELECT count(*)::int FROM order_print_files f WHERE f.order_item_id = ${orderItems.id})`,
          key: orderPrintFiles.storageKey,
          bytes: orderPrintFiles.sizeBytes,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .leftJoin(orderPrintFiles, and(eq(orderPrintFiles.orderItemId, orderItems.id), eq(orderPrintFiles.volume, volume)))
        .where(and(eq(orders.orderNumber, orderNumber), eq(orderItems.seq, itemSeq), inScope(scope)))
        .limit(1);
      return row ? { ...row, volume } : null;
    },

    async ticketFile(scope, orderNumber) {
      const [row] = await db
        .select({
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          filesDeletedAt: orders.filesDeletedAt,
          key: orderTickets.storageKey,
          previewKey: orderTickets.previewKey,
          bytes: orderTickets.sizeBytes,
          fresh: sql<boolean>`coalesce(${orderTickets.stamp} = order_ticket_stamp(${orders}), false)`,
        })
        .from(orders)
        .leftJoin(orderTickets, eq(orderTickets.orderId, orders.id))
        .where(and(eq(orders.orderNumber, orderNumber), inScope(scope)))
        .limit(1);
      return row ?? null;
    },

    async requeue(scope, orderId, kind, event) {
      return db.transaction(async (tx) => {
        // سفارش در محدوده، زیر قفل اشتراکی: جابه‌جایی هم‌زمان (که ردیف را قفل می‌کند) یا پیش از این commit شده و سفارش دیگر در
        // محدوده نیست، یا پشت این می‌ماند. ترتیب قفل‌ها همان کارگر و ویرایش گیرنده: اول سفارش، بعد کار.
        const [order] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.id, orderId), inScope(scope)))
          .limit(1)
          .for('share');
        if (!order) return 'not_found' as const;
        const [job] = await tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.orderId, orderId), eq(jobs.kind, kind)))
          .limit(1)
          .for('update');
        if (job && (job.status === 'queued' || job.status === 'running')) return 'busy' as const;
        if (job) {
          // `now()` پایگاه داده، مثل `queue_job` کارگر: کارگر کار را با ساعت پایگاه داده برمی‌دارد.
          await tx
            .update(jobs)
            .set({
              status: 'queued',
              attempts: 0,
              runAfter: sql`now()`,
              lockedBy: null,
              lockedUntil: null,
              lastError: null,
              finishedAt: null,
              updatedAt: sql`now()`,
            })
            .where(eq(jobs.id, job.id));
        } else {
          // کاری نبود (سفارش پیش از ۵٫۱): تازه. دو کلیک هم‌زمان به شاخص یکتای (سفارش، نوع) می‌خورند و دومی `busy` است.
          const inserted = await tx.insert(jobs).values({ kind, orderId }).onConflictDoNothing().returning({ id: jobs.id });
          if (inserted.length === 0) return 'busy' as const;
        }
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...event,
            detail: {
              ...(event.detail as Record<string, unknown> | undefined),
              previous: job ? { status: job.status, attempts: job.attempts, error: pdfErrorCode(job.lastError) } : null,
            },
          }),
        );
        return 'ok' as const;
      });
    },

    async changeStatus(scope, change) {
      try {
        return await db.transaction(async (tx): Promise<PanelWrite> => {
          // دو کلیک هم‌زمان: دومی پشت قفل ردیف می‌ماند و بعد شرط `status = from` را دوباره می‌سنجد، که دیگر نمی‌خواند.
          // کارگری که فایل‌ها را پاک می‌کند هم ردیف را قفل می‌کند (ADR-044): پس از او شرط فایل دیگر نمی‌خواند.
          // «شروع چاپ» از چاپخانه‌ای که ادمین دید: جابه‌جایی هم‌زمان همین ردیف را قفل می‌کند، پس یکی از دو کار شرطش را نمی‌یابد.
          // محدوده هم همین‌طور (۵٫۳): سفارشی که همین حالا به چاپخانهٔ دیگری رفت، شرط محدوده را دیگر نمی‌خواند.
          const partner =
            change.partnerId === undefined
              ? undefined
              : change.partnerId === null
                ? isNull(orders.printPartnerId)
                : eq(orders.printPartnerId, change.partnerId);
          const [order] = await tx
            .update(orders)
            .set({ status: change.to, handedToPostAt: change.to === 'handed_to_post' ? change.at : null })
            .where(
              and(eq(orders.id, change.orderId), eq(orders.status, change.from), isNull(orders.filesDeletedAt), partner, inScope(scope)),
            )
            .returning();
          if (!order) {
            // بیرون از محدوده «نیست» (`current: null`)، نه وضعیت امروزش.
            const [current] = await tx
              .select({ status: orders.status, filesDeletedAt: orders.filesDeletedAt, printPartnerId: orders.printPartnerId })
              .from(orders)
              .where(and(eq(orders.id, change.orderId), inScope(scope)))
              .limit(1);
            if (current?.filesDeletedAt) return { ok: false, current: current.status, filesDeleted: true };
            if (current && current.status === change.from && partner !== undefined && current.printPartnerId !== change.partnerId) {
              return { ok: false, current: current.status, partnerChanged: true };
            }
            return { ok: false, current: current?.status ?? null };
          }
          await tx.insert(orderStatusEvents).values({
            orderId: change.orderId,
            fromStatus: change.from,
            toStatus: change.to,
            at: change.at,
            actor: 'admin',
            adminUserId: change.adminUserId,
            note: change.note,
          });
          await tx.insert(adminEvents).values(adminEventRow(change.event));
          return { ok: true, order };
        });
      } catch (error) {
        // سفارشی که کد رهگیری زنده دارد از «تحویل پست شد» بیرون نمی‌رود (0022، در COMMIT): مرسوله‌ای که همین حالا نشست.
        if (constraintOf(error) === 'shipments_order_handed') return { ok: false, current: change.from, hasShipment: true };
        throw error;
      }
    },

    async editRecipient(scope, { orderId, editable, recipient, event }) {
      return db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, orderId), inScope(scope)))
          .limit(1)
          .for('update');
        if (!order) return { ok: false as const, current: null };
        if (!editable.includes(order.status)) return { ok: false as const, current: order.status };
        const changed = (['recipientName', 'addressText', 'postalCode'] as const).filter((key) => order[key] !== recipient[key]);
        if (changed.length === 0) return { ok: true as const, order, changed };
        const [updated] = await tx.update(orders).set(recipient).where(eq(orders.id, orderId)).returning();
        // برگه با نام و نشانی تازه: کار تمام‌شده یا شکست‌خورده دوباره در صف. کاری که کارگر رویش است، پیش از ثبت اثر
        // انگشت را زیر قفل همین ردیف دوباره می‌سنجد و با دادهٔ تازه از نو می‌سازد (`docworker/ticket.py`).
        await requeueTicket(tx, orderId);
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...event,
            detail: {
              ...(event.detail as Record<string, unknown> | undefined),
              changed,
              previous: Object.fromEntries(changed.map((key) => [key, order[key]])),
            },
          }),
        );
        return { ok: true as const, order: updated!, changed };
      });
    },

    async partnerOptions(scope) {
      return db
        .select({
          id: printPartners.id,
          name: printPartners.name,
          cityName: cities.nameFa,
          isDefault: printPartners.isDefault,
          openOrders: sql<number>`(SELECT count(*)::int FROM orders o
            WHERE o.print_partner_id = ${printPartners.id} AND o.status IN ('paid', 'printing'))`,
        })
        .from(printPartners)
        .innerJoin(cities, eq(cities.id, printPartners.cityId))
        .where(and(isNull(printPartners.deactivatedAt), scope.kind === 'partner' ? eq(printPartners.id, scope.partnerId) : undefined))
        .orderBy(desc(printPartners.isDefault), asc(printPartners.createdAt), asc(printPartners.id));
    },

    async assignPartner(scope, input) {
      return db.transaction(async (tx): Promise<PanelAssignWrite> => {
        // چاپخانهٔ تازه تا پایان تراکنش فعال می‌ماند: غیرفعال کردنش پشت این قفل منتظر می‌ماند و بعد سفارش باز را می‌بیند.
        const [target] = await tx
          .select({ id: printPartners.id, name: printPartners.name })
          .from(printPartners)
          .where(and(eq(printPartners.id, input.to), isNull(printPartners.deactivatedAt)))
          .limit(1)
          .for('share');
        if (!target) return { ok: false, reason: 'partner_inactive' };
        const [order] = await tx
          .update(orders)
          .set({ printPartnerId: input.to })
          .where(
            and(
              eq(orders.id, input.orderId),
              eq(orders.status, 'paid'),
              input.from === null ? isNull(orders.printPartnerId) : eq(orders.printPartnerId, input.from),
              inScope(scope),
            ),
          )
          .returning();
        if (!order) {
          const [current] = await tx
            .select({ status: orders.status, printPartnerId: orders.printPartnerId })
            .from(orders)
            .where(and(eq(orders.id, input.orderId), inScope(scope)))
            .limit(1);
          return { ok: false, reason: 'changed', current: current?.status ?? null, partnerId: current?.printPartnerId ?? null };
        }
        await tx.insert(orderAssignments).values({
          orderId: input.orderId,
          fromPartnerId: input.from,
          toPartnerId: input.to,
          at: input.at,
          actor: 'admin',
          adminUserId: input.adminUserId,
          reason: input.reason,
        });
        await requeueTicket(tx, input.orderId);
        const [from] =
          input.from === null
            ? [null]
            : await tx.select({ name: printPartners.name }).from(printPartners).where(eq(printPartners.id, input.from)).limit(1);
        await tx.insert(adminEvents).values(
          adminEventRow({
            ...input.event,
            detail: {
              ...(input.event.detail as Record<string, unknown> | undefined),
              from: input.from === null ? null : { id: input.from, name: from?.name ?? null },
              to: { id: target.id, name: target.name },
              reason: input.reason,
            },
          }),
        );
        return { ok: true, order };
      });
    },

    async logEvent(event) {
      await db.insert(adminEvents).values(adminEventRow(event));
    },

    async setting(key) {
      const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
      return row?.value;
    },
  };
}
