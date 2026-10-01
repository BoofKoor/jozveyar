/**
 * سفارش‌ها به زبان پنل (`orders.ts`): جست‌وجو، مرز روز تهران، کاشی‌ها و کارت مهلت، ردیف، مشخصات و ریز قیمت
 * منجمد، پرداخت‌ها، فایل چاپ و برگهٔ سفارش (۵٫۱) و رویدادها. عددهای تصمیم (حاشیهٔ یک ساعت، مهلت نیم ساعت) صریح‌اند، نه از
 * ثابت کد.
 * «حالا» همان طرح پنل است: دوشنبه 13 مهر 1405، ساعت 11:20 تهران.
 */

import { describe, expect, it } from 'vitest';

import type {
  OrderRow,
  PanelAssignment,
  PanelOrderDetails,
  PanelOrderItem,
  PanelOrderLine,
  PanelPayment,
  PanelPdfJob,
  PanelPrintVolume,
  PanelStatusEvent,
  PaymentRow,
} from '@jozveyar/db';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { postHandoffDue } from '@jozveyar/text';

import {
  bucketOf,
  bucketsOf,
  changesNote,
  dayBounds,
  dueBadge,
  dueCard,
  dueKind,
  dueTiles,
  durationSegs,
  filesUntil,
  isRevert,
  jozveSegs,
  linesWithoutMoney,
  orderNumberOf,
  orderState,
  orderTimeline,
  pageOf,
  parseSearch,
  partnerView,
  paymentView,
  pdfFileName,
  printReady,
  printView,
  purgedNote,
  rebuildable,
  rowState,
  specFacts,
  staleSections,
  statsSegs,
  sumLines,
  ticketView,
  timelineWhen,
  transitionOf,
  volumeFileName,
  volumesSegs,
  withoutMoney,
  type Seg,
} from './orders';

const NOW = new Date('2026-10-05T07:50:00Z');
const tehran = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:30`);
/** مهلت پایان انحصاری روز است: «تا پایان دوشنبه» یعنی نیمه‌شب آغاز سه‌شنبه. */
const END_SATURDAY = tehran('2026-10-04 00:00');
const END_SUNDAY = tehran('2026-10-05 00:00');
const END_MONDAY = tehran('2026-10-06 00:00');
const END_TUESDAY = tehran('2026-10-07 00:00');
const END_WEDNESDAY = tehran('2026-10-08 00:00');
const END_NEXT_SATURDAY = tehran('2026-10-11 00:00');
const MINUTE = 60_000;

/** تکه‌ها به متن، برای سنجیدن؛ و جای عددها. */
const text = (segs: readonly Seg[]) => segs.map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : 'ltr' in s ? s.ltr : s.barcode)).join('');
const nums = (segs: readonly Seg[]) => segs.filter((s): s is { num: string } => typeof s === 'object' && 'num' in s).map((s) => s.num);

describe('فهرست: پارامترهای نشانی و جست‌وجو', () => {
  it('جست‌وجو: شماره یا ته موبایل، موبایل کامل به هر شکل، یا نام فارسی‌نرمال', () => {
    expect(parseSearch(undefined)).toBeNull();
    expect(parseSearch('   ')).toBeNull();
    expect(parseSearch('10027')).toEqual({ kind: 'digits', orderNumber: 10027, phoneSuffix: '10027' });
    expect(parseSearch('۱۰۰۲۷')).toEqual({ kind: 'digits', orderNumber: 10027, phoneSuffix: '10027' });
    // از ۴ رقم ته موبایل هم هست؛ کمتر فقط شماره.
    expect(parseSearch('5678')).toEqual({ kind: 'digits', orderNumber: 5678, phoneSuffix: '5678' });
    expect(parseSearch('567')).toEqual({ kind: 'digits', orderNumber: 567, phoneSuffix: null });
    expect(parseSearch('234 5678')).toEqual({ kind: 'digits', orderNumber: 2345678, phoneSuffix: '2345678' });
    for (const mobile of ['09152345678', '0915 234 5678', '+98 915 234 5678', '۰۹۱۵۲۳۴۵۶۷۸', '9152345678']) {
      expect(parseSearch(mobile), mobile).toEqual({ kind: 'mobile', mobile: '09152345678' });
    }
    // بیش از ۹ رقم شمارهٔ سفارش نیست، و بیش از ۱۱ ته موبایل هم نه.
    expect(parseSearch('123456789012')).toEqual({ kind: 'digits', orderNumber: null, phoneSuffix: null });
    // ۲۴ رقم کد رهگیری پست است (۶٫۱)، با فاصلهٔ گروه‌های چهارتایی یا ارقام فارسی هم؛ ۲۳ رقم نه.
    for (const code of ['118800000000000000000101', '1188 0000 0000 0000 0000 0101', '۱۱۸۸۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۰۱۰۱']) {
      expect(parseSearch(code), code).toEqual({ kind: 'barcode', barcode: '118800000000000000000101' });
    }
    expect(parseSearch('11880000000000000000010')).toEqual({ kind: 'digits', orderNumber: null, phoneSuffix: null });
    expect(parseSearch('زهرا محمدي')).toEqual({ kind: 'name', text: 'زهرا محمدی' });
    expect(parseSearch('  مریم   کاظمی ')).toEqual({ kind: 'name', text: 'مریم کاظمی' });
    expect(parseSearch('x'.repeat(300))).toEqual({ kind: 'name', text: 'x'.repeat(100) });
  });

  it('چیپ: بی چیپ «باز»، با جست‌وجو «همه»؛ چیپ ناشناس هم همان', () => {
    expect(bucketOf(undefined, false)).toBe('open');
    expect(bucketOf(undefined, true)).toBe('all');
    expect(bucketOf('awaiting', true)).toBe('awaiting');
    expect(bucketOf('abandoned', false)).toBe('abandoned');
    expect(bucketOf('paid', false)).toBe('open');
    expect(bucketOf('constructor', true)).toBe('all');
  });

  it('چیپ‌های کاربر چاپخانه (۵٫۳): باز، تحویل پست شد، لغو شد و همه؛ چیپ مالک و متصدی که او ندارد یعنی «باز»', () => {
    const partner = bucketsOf({ kind: 'partner', partnerId: 'p2' });
    expect(partner).toEqual(['open', 'handed', 'cancelled', 'all']);
    expect(bucketsOf({ kind: 'all' })).toEqual(['open', 'handed', 'cancelled', 'awaiting', 'abandoned', 'all']);
    expect(bucketOf('awaiting', false, partner)).toBe('open');
    expect(bucketOf('abandoned', true, partner)).toBe('all');
    expect(bucketOf('cancelled', false, partner)).toBe('cancelled');
  });

  it('صفحه و شمارهٔ سفارش نشانی فقط عدد مثبت', () => {
    expect([undefined, '3', '0', '-1', 'abc', '99999', '2.5'].map(pageOf)).toEqual([1, 3, 1, 1, 1, 1, 1]);
    expect(['10027', '1', '0', '010027', '1e5', '1234567890', ' 10027'].map(orderNumberOf)).toEqual([
      10027,
      1,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('مهلت تحویل به پست، به روز تهران', () => {
  const bounds = dayBounds(NOW);

  it('مرزهای روز: نیمه‌شب تهران، نه UTC', () => {
    expect(bounds.todayStart).toEqual(END_SUNDAY);
    expect(bounds.tomorrowStart).toEqual(END_MONDAY);
    expect(bounds.dayAfterStart).toEqual(END_TUESDAY);
    // ۰۰:۱۰ سه‌شنبه به وقت تهران هنوز دوشنبه است به وقت UTC.
    expect(dayBounds(tehran('2026-10-06 00:10')).todayStart).toEqual(END_MONDAY);
  });

  it('سطل مهلت: گذشته، امروز تا خود آغاز فردا، فردا، بعدتر', () => {
    expect([END_SUNDAY, END_MONDAY, END_TUESDAY, END_WEDNESDAY].map((due) => dueKind(due, bounds))).toEqual([
      'overdue',
      'today',
      'tomorrow',
      'later',
    ]);
    // مهلتی که خودِ «حالا» است گذشته؛ یک میلی‌ثانیه پیش از پایان روز هنوز امروز (شاهد `<=`).
    expect(dueKind(END_MONDAY, dayBounds(END_MONDAY))).toBe('overdue');
    expect(dueKind(END_MONDAY, dayBounds(new Date(END_MONDAY.getTime() - 1)))).toBe('today');
    expect(dueBadge(END_WEDNESDAY, bounds)).toEqual({ kind: 'later', label: 'چهارشنبه 15 مهر' });
    expect(dueBadge(END_MONDAY, bounds)).toEqual({ kind: 'today', label: 'امروز' });
    expect(dueBadge(END_TUESDAY, bounds)).toEqual({ kind: 'tomorrow', label: 'فردا' });
    expect(dueBadge(END_SUNDAY, bounds)).toEqual({ kind: 'overdue', label: 'دیر شده' });
  });

  it('تعطیلی‌ها: مهلتی که سایت با روز کاری و تعطیلی ساخت، در کاشی به روز تقویم می‌نشیند', () => {
    // همان تابعی که هنگام پرداخت مهلت را می‌نویسد؛ ۲ روز کاری، پنجشنبه و جمعه تعطیل.
    const due = (paid: string, holidays: string[] = []) => postHandoffDue(tehran(paid), 2, new Set(holidays));
    const kind = (paid: string, holidays: string[] = []) => dueKind(due(paid, holidays), bounds);
    // پرداخت شنبه 11 مهر: یکشنبه و دوشنبه، پس «امروز»؛ اگر دوشنبه 13 مهر تعطیل باشد، سه‌شنبه و «فردا».
    expect(due('2026-10-03 10:00')).toEqual(END_MONDAY);
    expect(kind('2026-10-03 10:00')).toBe('today');
    expect(due('2026-10-03 10:00', ['1405/07/13'])).toEqual(END_TUESDAY);
    expect(kind('2026-10-03 10:00', ['1405/07/13'])).toBe('tomorrow');
    // پرداخت یکشنبه 12 مهر: «فردا»؛ اگر سه‌شنبه 14 مهر تعطیل باشد، چهارشنبه و «بعدتر».
    expect(kind('2026-10-04 18:30')).toBe('tomorrow');
    expect(dueBadge(due('2026-10-04 18:30', ['1405/07/14']), bounds)).toEqual({ kind: 'later', label: 'چهارشنبه 15 مهر' });
    // پرداخت چهارشنبه 8 مهر: پنجشنبه و جمعه شمرده نمی‌شوند؛ شنبه و یکشنبه، پس امروز دیر شده.
    expect(due('2026-09-30 21:00')).toEqual(END_SUNDAY);
    expect(kind('2026-09-30 21:00')).toBe('overdue');
    // «فردا» روز تقویم است، نه روز کاری: فردای تعطیل هم کاشی خودش را دارد، با صفر سفارش.
    const empty = { overdue: 0, today: 0, tomorrow: 0, later: 0, overdueRange: null, laterRange: null };
    expect(dueTiles(empty, bounds)[2]).toMatchObject({ kind: 'tomorrow', count: 0, text: 'تا پایان سه‌شنبه 14 مهر' });
  });

  it('کاشی‌ها، همان طرح: «مهلتش دیروز تمام شد»، «تا پایان امروز، دوشنبه»، «تا پایان سه‌شنبه 14 مهر»', () => {
    const tiles = dueTiles(
      {
        overdue: 1,
        today: 3,
        tomorrow: 4,
        later: 2,
        overdueRange: { earliest: END_SUNDAY, latest: END_SUNDAY },
        laterRange: { earliest: END_WEDNESDAY, latest: END_WEDNESDAY },
      },
      bounds,
    );
    expect(tiles.map((t) => [t.kind, t.label, t.count, t.text])).toEqual([
      ['overdue', 'دیر شده', 1, 'مهلتش دیروز تمام شد'],
      ['today', 'امروز', 3, 'تا پایان امروز، دوشنبه'],
      ['tomorrow', 'فردا', 4, 'تا پایان سه‌شنبه 14 مهر'],
      ['later', 'بعدتر', 2, 'تا پایان چهارشنبه 15 مهر'],
    ]);
  });

  it('کاشی‌ها با چند روز و بی سفارش', () => {
    const texts = (summary: Parameters<typeof dueTiles>[0]) => dueTiles(summary, bounds).map((t) => t.text);
    const empty = { overdue: 0, today: 0, tomorrow: 0, later: 0, overdueRange: null, laterRange: null };
    expect(texts(empty)).toEqual(['هیچ سفارشی دیر نشده', 'تا پایان امروز، دوشنبه', 'تا پایان سه‌شنبه 14 مهر', 'سفارشی نیست']);
    expect(
      texts({
        ...empty,
        overdue: 2,
        later: 3,
        overdueRange: { earliest: END_SATURDAY, latest: END_SUNDAY },
        laterRange: { earliest: END_WEDNESDAY, latest: END_NEXT_SATURDAY },
      }),
    ).toEqual(['مهلت قدیمی‌ترینشان شنبه 11 مهر تمام شد', 'تا پایان امروز، دوشنبه', 'تا پایان سه‌شنبه 14 مهر', 'چهارشنبه 15 مهر تا شنبه 18 مهر']);
    expect(texts({ ...empty, overdue: 2, overdueRange: { earliest: END_SUNDAY, latest: END_SUNDAY } })[0]).toBe('مهلتشان دیروز تمام شد');
    expect(texts({ ...empty, overdue: 1, overdueRange: { earliest: END_SATURDAY, latest: END_SATURDAY } })[0]).toBe('مهلتش شنبه 11 مهر تمام شد');
  });

  it('مدت با دو واحد کنار هم؛ و کارت مهلت طرح: «12 ساعت و 40 دقیقه مانده»', () => {
    expect(text(durationSegs(12 * 60 * MINUTE + 40 * MINUTE))).toBe('12 ساعت و 40 دقیقه');
    expect(text(durationSegs(27 * 60 * MINUTE))).toBe('1 روز و 3 ساعت');
    expect(text(durationSegs(24 * 60 * MINUTE + 40 * MINUTE))).toBe('1 روز');
    expect(text(durationSegs(-40 * MINUTE))).toBe('40 دقیقه');
    expect(text(durationSegs(30_000))).toBe('کمتر از یک دقیقه');
    expect(nums(durationSegs(12 * 60 * MINUTE + 40 * MINUTE))).toEqual(['12', '40']);

    const today = dueCard(END_MONDAY, bounds);
    expect({ ...today, left: text(today.left) }).toEqual({
      kind: 'today',
      title: 'تحویل به پست تا امروز',
      deadline: 'پایان دوشنبه 13 مهر',
      left: '12 ساعت و 40 دقیقه مانده',
    });
    const late = dueCard(END_SUNDAY, bounds);
    expect([late.title, text(late.left)]).toEqual(['مهلت تحویل به پست گذشت', '11 ساعت و 20 دقیقه دیر']);
    expect(dueCard(END_TUESDAY, bounds).title).toBe('تحویل به پست تا فردا');
    expect(dueCard(END_WEDNESDAY, bounds).title).toBe('تحویل به پست تا چهارشنبه 15 مهر');
  });
});

/** ردیف فهرست، با پیش‌فرض‌های سفارش پرداخت‌شدهٔ یک‌فایلی. */
function line(over: Partial<PanelOrderLine> = {}): PanelOrderLine {
  return {
    id: 'o1',
    orderNumber: 10027,
    status: 'paid',
    totalRials: 3_747_500,
    recipientName: 'مریم کاظمی',
    recipientPhone: '09152345678',
    provinceName: 'خراسان رضوی',
    cityName: 'مشهد',
    createdAt: NOW,
    paidAt: NOW,
    postHandoffDueAt: END_MONDAY,
    handedToPostAt: null,
    handedByFile: false,
    cancelledAt: null,
    pageCount: 120,
    itemCount: 1,
    fileCount: 1,
    copies: 1,
    colorModes: ['bw'],
    sidesModes: ['double'],
    pdfJob: 'done',
    printPartnerId: 'partner-noor',
    unreturnedPayments: 0,
    stale: false,
    filesExpireAt: null,
    ...over,
  };
}

describe('ردیف فهرست', () => {
  it('ستون جزوه، همان طرح: «3 فایل · 120 صفحه · سیاه‌سفید»، «230 صفحه · سیاه‌سفید، یکرو»', () => {
    expect(text(jozveSegs(line({ fileCount: 3 })))).toBe('3 فایل · 120 صفحه · سیاه‌سفید');
    expect(nums(jozveSegs(line({ fileCount: 3 })))).toEqual(['3', '120']);
    expect(text(jozveSegs(line({ pageCount: 230, sidesModes: ['single'] })))).toBe('230 صفحه · سیاه‌سفید، یکرو');
    expect(text(jozveSegs(line({ pageCount: 88, colorModes: ['color'] })))).toBe('88 صفحه · رنگی');
    expect(text(jozveSegs(line({ colorModes: ['bw', 'color'], copies: 2, itemCount: 2, fileCount: 4 })))).toBe(
      '2 جزوه · 4 فایل · 120 صفحه · رنگی و سیاه‌سفید · 2 نسخه',
    );
  });

  it('ستون وضعیت: در صف چاپ، PDF ساخته نشد، در انتظار پرداخت، پرداخت بی برگشت، رهاشده', () => {
    expect(rowState(line())).toEqual({ label: 'در صف چاپ', icon: null });
    expect(rowState(line({ pdfJob: 'failed' }))).toEqual({ label: 'PDF ساخته نشد', icon: 'error' });
    expect(rowState(line({ status: 'awaiting_payment', pdfJob: null }))).toEqual({ label: 'در انتظار پرداخت', icon: null });
    expect(rowState(line({ status: 'awaiting_payment', pdfJob: null, unreturnedPayments: 2 }))).toEqual({
      label: 'پرداخت بی برگشت',
      icon: 'info',
    });
    // رهاشده بی برگشتش را نمی‌گوید: دیگر پرداختنی نیست.
    expect(rowState(line({ status: 'awaiting_payment', pdfJob: null, stale: true, unreturnedPayments: 1 }))).toEqual({
      label: 'رهاشده',
      icon: null,
    });
    expect(rowState(line({ status: 'expired', pdfJob: null }))).toEqual({ label: 'رهاشده', icon: null });
    // بی چاپخانه (۵٫۲): فقط در صف چاپ؛ PDF ساخته‌نشده مهم‌تر است، چون چاپخانه را هم که انتخاب کنی، چیزی برای چاپ نیست.
    expect(rowState(line({ printPartnerId: null }))).toEqual({ label: 'بی چاپخانه', icon: 'warning' });
    expect(rowState(line({ printPartnerId: null, pdfJob: 'failed' }))).toEqual({ label: 'PDF ساخته نشد', icon: 'error' });
    expect(rowState(line({ status: 'cancelled', printPartnerId: null }))).toEqual({ label: 'لغو شد', icon: null });
    expect([orderState('paid', true), orderState('awaiting_payment', false), orderState('expired', false)]).toEqual([
      'queued',
      'awaiting',
      'abandoned',
    ]);
  });
});

/* ───────────── جزئیات: سفارش 10027 طرح، با قیمت از خود `quote()` ───────────── */

const SECTIONS = [
  { documentId: 'd1', pageCount: 48 },
  { documentId: 'd2', pageCount: 54 },
  { documentId: 'd3', pageCount: 18 },
];
const BREAKDOWN = quote(
  {
    items: [
      {
        sections: SECTIONS,
        rules: [{ pageRanges: [[1, 120]], colorMode: 'bw', paperTypeId: 'tahrir80' }],
        copies: 1,
        sidesMode: 'double',
        bindingTypeId: 'spiral_clear',
      },
    ],
    shipping: { methodId: 'post', zoneId: 'other' },
  },
  SEED_PRICE_LIST,
);

function details(over: { order?: Partial<OrderRow>; item?: Partial<PanelOrderItem>; rest?: Partial<PanelOrderDetails> } = {}): PanelOrderDetails {
  const live = new Date(NOW.getTime() + 2 * 24 * 60 * MINUTE);
  const item: PanelOrderItem = {
    id: 'i1',
    orderId: 'o1',
    seq: 1,
    pageCount: 120,
    copies: 1,
    sidesMode: 'double',
    bindingTypeId: 'spiral_clear',
    printPdfKey: null,
    printPdfBytes: null,
    printPdfSha256: null,
    printPdfReadyAt: null,
    printFiles: [],
    bindingName: 'طلق و سیم',
    sections: ['ریاضی ۲ - جلسه ۱.pdf', 'ریاضی ۲ - جلسه ۲.pdf', 'حل تمرین فصل ۱.docx'].map((name, i) => ({
      seq: i + 1,
      documentId: SECTIONS[i]!.documentId,
      pageCount: SECTIONS[i]!.pageCount,
      originalName: name,
      sourceKind: i === 2 ? 'docx' : 'pdf',
      fileExpiresAt: live,
      fileDeletedAt: null,
    })),
    rules: [{ seq: 1, pageRanges: [[1, 120]], colorMode: 'bw', paperTypeId: 'tahrir80', paperName: 'تحریر ۸۰ گرم' }],
    ...over.item,
  };
  const order = {
    id: 'o1',
    orderNumber: 10027,
    publicToken: 't',
    checkoutKey: 'k',
    userId: 'u',
    status: 'paid',
    priceListVersion: 1,
    priceBreakdown: BREAKDOWN,
    quoteSnapshot: null,
    subtotalRials: BREAKDOWN.subtotalRials,
    discountRials: 0,
    shippingRials: BREAKDOWN.shippingRials!,
    vatRials: 0,
    roundingRials: 0,
    totalRials: BREAKDOWN.totalRials,
    estWeightGrams: BREAKDOWN.estWeightGrams,
    slaDays: 2,
    paidAt: tehran('2026-10-03 14:05'),
    postHandoffDueAt: END_MONDAY,
    handedToPostAt: null,
    filesDeletedAt: null,
    printPartnerId: 'partner-noor',
    shippingMethodId: 'post',
    shippingZoneId: 'other',
    provinceId: 11,
    cityId: 1326,
    recipientName: 'مریم کاظمی',
    recipientPhone: '09152345678',
    addressText: 'بلوار سجاد، سجاد 18، پلاک 42، واحد 6',
    postalCode: '9187654321',
    createdAt: tehran('2026-10-03 13:57'),
    updatedAt: tehran('2026-10-03 14:05'),
    ...over.order,
  } as OrderRow;
  return {
    order,
    provinceName: 'خراسان رضوی',
    cityName: 'مشهد',
    zoneName: 'بقیهٔ کشور',
    shippingMethodName: 'پست پیشتاز',
    items: [item],
    payments: [],
    refunds: [],
    statusEvents: [],
    pdfJob: { status: 'done', attempts: 1, maxAttempts: 3, lastError: null, createdAt: order.paidAt!, updatedAt: order.paidAt!, finishedAt: order.paidAt! },
    ticketJob: null,
    ticket: null,
    events: [],
    partner: { id: 'partner-noor', name: 'چاپ نور', cityName: 'مشهد', provinceName: 'خراسان رضوی', active: true, isDefault: false },
    assignments: [
      {
        id: 1,
        at: tehran('2026-10-03 14:05'),
        fromName: null,
        toPartnerId: 'partner-noor',
        toName: 'چاپ نور',
        actor: 'system',
        adminName: null,
        rule: 'city',
        reason: null,
      },
    ],
    shipments: [],
    ...over.rest,
  };
}

/** یک تغییر وضعیت؛ ادمین فقط با `actor: 'admin'`. */
function statusEvent(over: Partial<PanelStatusEvent> & Pick<PanelStatusEvent, 'fromStatus' | 'toStatus'>): PanelStatusEvent {
  return { id: 1, orderId: 'o1', at: NOW, actor: 'admin', adminUserId: null, adminName: null, note: null, ...over };
}

/** فایل چاپ یک جلد، همان‌طور که کارگر می‌نویسد (۵٫۱). */
function volume(n: number, firstPage: number, lastPage: number, over: Partial<PanelPrintVolume> = {}): PanelPrintVolume {
  return {
    volume: n,
    firstPage,
    lastPage,
    storageKey: `orders/10027/print-1-${n}.pdf`,
    sizeBytes: 40_265_318,
    changes: null,
    createdAt: tehran('2026-10-03 14:06'),
    ...over,
  };
}

describe('جزئیات سفارش', () => {
  it('مشخصات چاپ، همان طرح: «سیاه‌سفید، دورو · تحریر ۸۰ گرم»، «طلق و سیم · 120 صفحه، 60 برگ، یک جلد»، «1 نسخه»', () => {
    const d = details();
    const facts = specFacts(d.items[0]!, BREAKDOWN.items[0]);
    expect(facts.map((f) => [f.label, text(f.value)])).toEqual([
      ['چاپ', 'سیاه‌سفید، دورو · تحریر ۸۰ گرم'],
      ['صحافی', 'طلق و سیم · 120 صفحه، 60 برگ، یک جلد'],
      ['تعداد', '1 نسخه'],
    ]);
  });

  it('ریز قیمت منجمد، همان طرح و همان `quote()`: 192,000 + 45,000 + 137,750 = 374,750 تومان', () => {
    const lines = sumLines(details());
    expect(lines.map((l) => [text(l.label), l.rials])).toEqual([
      ['چاپ سیاه‌سفید، دورو · 120 صفحه', 1_920_000],
      ['صحافی طلق و سیم · 60 برگ', 450_000],
      ['پست پیشتاز، بقیهٔ کشور', 1_377_500],
    ]);
    expect(lines.reduce((sum, l) => sum + l.rials, 0)).toBe(3_747_500);
    expect(BREAKDOWN.totalRials).toBe(3_747_500);
    // تخفیف، مالیات و گرد کردن فقط وقتی صفر نیستند؛ عددشان از ستون‌های منجمد سفارش.
    const taxed = sumLines(details({ order: { discountRials: 100_000, vatRials: 50_000, roundingRials: -500 } }));
    expect(taxed.slice(3).map((l) => [text(l.label), l.rials])).toEqual([
      ['تخفیف', -100_000],
      ['مالیات بر ارزش افزوده', 50_000],
      ['گرد کردن', -500],
    ]);
  });

  it('فایل‌های مشتری تا کی: زودترین پاک شدن؛ پاک‌شده یا گذشته یعنی دیگر نیست', () => {
    const d = details();
    expect(filesUntil(d.items, NOW)).toEqual(new Date(NOW.getTime() + 2 * 24 * 60 * MINUTE));
    const soon = new Date(NOW.getTime() + 59 * MINUTE);
    const withSoon = details({ item: { sections: [{ ...d.items[0]!.sections[0]!, fileExpiresAt: soon }, ...d.items[0]!.sections.slice(1)] } });
    expect(filesUntil(withSoon.items, NOW)).toEqual(soon);
    // سفارش در انتظاری با فایل ۵۹ دقیقه‌ای دیگر پرداختنی نیست (حاشیهٔ یک ساعت)؛ ۶۱ دقیقه‌ای هست.
    expect(staleSections(withSoon.items[0]!.sections, NOW)).toBe(true);
    expect(staleSections([{ ...d.items[0]!.sections[0]!, fileExpiresAt: new Date(NOW.getTime() + 61 * MINUTE) }], NOW)).toBe(false);
    const gone = details({ item: { sections: [{ ...d.items[0]!.sections[0]!, fileDeletedAt: NOW }] } });
    expect(filesUntil(gone.items, NOW)).toBeNull();
    expect(filesUntil(d.items, new Date(NOW.getTime() + 3 * 24 * 60 * MINUTE))).toBeNull();
  });

  it('فایل چاپ: بعد از پرداخت، ساخته شده، در حال ساختن، یا ساخته نشد با دلیل و «دوباره بساز» تا وقتی ممکن است', () => {
    expect(printView(details({ order: { status: 'awaiting_payment' } }), details().items[0]!, NOW)).toEqual({ kind: 'unpaid' });
    const built = tehran('2026-10-03 14:06');
    const ready = details({ item: { printPdfKey: 'orders/10027/jozve-1.pdf', printPdfReadyAt: built, printFiles: [volume(1, 1, 120, { storageKey: 'orders/10027/jozve-1.pdf' })] } });
    expect(printView(ready, ready.items[0]!, NOW)).toEqual({
      kind: 'ready',
      volumes: [{ volume: 1, fileName: 'jozve-10027-1.pdf', firstPage: 1, lastPage: 120, sheets: 60, bytes: 40_265_318, builtAt: built }],
      changed: false,
      note: ['همهٔ صفحه‌ها A4 عمودی بود؛ فایل چاپ همان PDF جزوه است.'],
    });
    const queued = details({ rest: { pdfJob: { ...details().pdfJob!, status: 'queued', attempts: 0 } } });
    expect(printView(queued, queued.items[0]!, NOW)).toEqual({ kind: 'building', retrying: false });
    const retrying = details({ rest: { pdfJob: { ...details().pdfJob!, status: 'queued', attempts: 1, lastError: "StorageError('x')" } } });
    expect(printView(retrying, retrying.items[0]!, NOW)).toEqual({ kind: 'building', retrying: true });
    const failedJob: PanelPdfJob = { status: 'failed', attempts: 3, maxAttempts: 3, lastError: "StorageError('GET → 503')", createdAt: tehran('2026-10-03 14:06'), updatedAt: NOW, finishedAt: tehran('2026-10-03 14:21') };
    const failed = details({ rest: { pdfJob: failedJob } });
    // PDF جزوه ساخته نشده: «دوباره بساز» تا فایل‌های مشتری هستند.
    expect(printView(failed, failed.items[0]!, NOW)).toEqual({
      kind: 'failed',
      attempts: 3,
      reason: 'استوریج یا پایگاه داده جواب نداد',
      from: tehran('2026-10-03 14:06'),
      to: tehran('2026-10-03 14:21'),
      rebuild: { until: new Date(NOW.getTime() + 2 * 24 * 60 * MINUTE) },
    });
    const missing = details({ rest: { pdfJob: { ...failedJob, attempts: 1, lastError: 'file_missing: file_missing' } } });
    expect(printView(missing, missing.items[0]!, NOW)).toMatchObject({ reason: 'فایل مشتری روی استوریج پیدا نشد', attempts: 1 });
    // PDF جزوه ساخته شد و فایل چاپ نه: از همان PDF، بی مهلت، حتی وقتی فایل‌های مشتری رفته‌اند.
    const gone = details({ item: { printPdfReadyAt: built, sections: details().items[0]!.sections.map((s) => ({ ...s, fileDeletedAt: NOW })) }, rest: { pdfJob: { ...failedJob, lastError: 'breakdown_mismatch: x' } } });
    expect(printView(gone, gone.items[0]!, NOW)).toMatchObject({ kind: 'failed', reason: 'جلدبندی ریز قیمت با صفحه‌های جزوه نخواند', rebuild: { until: null } });
    // هیچ‌کدام: فایل‌های مشتری رفته و PDF جزوه ساخته نشد.
    const dead = details({ item: { sections: gone.items[0]!.sections }, rest: { pdfJob: failedJob } });
    expect(printView(dead, dead.items[0]!, NOW)).toMatchObject({ kind: 'failed', rebuild: null });
    expect(rebuildable(dead.items, NOW)).toBeNull();
    // کار تمام شد ولی فایل چاپی نساخت (کارگر پیش از ۵٫۱، هنگام استقرار): همان «ساخته نشد»، با «دوباره بساز».
    expect(printView(details(), details().items[0]!, NOW)).toMatchObject({ kind: 'failed', reason: 'کارگر چیزی نساخت', from: null });
  });

  it('فایل چاپ چند جلدی: هر جلد با نامش، بازه و برگش؛ «تقسیم شد» وقتی صفحه‌ای عوض نشد', () => {
    const d = details({
      item: {
        printPdfKey: 'orders/10027/jozve-1.pdf',
        printPdfReadyAt: NOW,
        printFiles: [volume(1, 1, 60, { storageKey: 'orders/10027/print-1-1.pdf' }), volume(2, 61, 120, { storageKey: 'orders/10027/print-1-2.pdf' })],
      },
    });
    const view = printView(d, d.items[0]!, NOW);
    expect(view.kind === 'ready' && view.volumes.map((v) => [v.fileName, v.firstPage, v.lastPage])).toEqual([
      ['jozve-10027-1-jeld-1.pdf', 1, 60],
      ['jozve-10027-1-jeld-2.pdf', 61, 120],
    ]);
    // فقط تقسیم: بی «PDF اصلی جزوه» (طرح، سؤال ۳۹)؛ جلدها پشت‌سرهم همان PDF جزوه‌اند.
    expect(view.kind === 'ready' && [view.changed, text(view.note)]).toEqual([
      false,
      'همهٔ صفحه‌ها A4 عمودی بود؛ فقط به دو جلد تقسیم شد، همان‌طور که صحافی‌اش حساب شده.',
    ]);
    // صفحه‌ای عوض شد: با «PDF اصلی جزوه».
    const resized = details({ item: { ...d.items[0]!, printFiles: [volume(1, 1, 60, { changes: { resized: [[3, 3, 612, 792]] } }), volume(2, 61, 120)] } });
    const changed = printView(resized, resized.items[0]!, NOW);
    expect(changed.kind === 'ready' && changed.changed).toBe(true);
    // صحافی و سر کارت همان طرح: «دو جلد (413 و 412 برگ)»، و سه جلد با «و» پیش از آخری.
    const facts = (volumes: number, sheetsPerVolume: number[]) =>
      text(specFacts({ ...d.items[0]!, pageCount: 1650 }, { ...BREAKDOWN.items[0]!, sheets: 825, volumes, sheetsPerVolume })[1]!.value);
    expect(facts(2, [413, 412])).toBe('طلق و سیم · 1,650 صفحه، 825 برگ، دو جلد (413 و 412 برگ)');
    expect(facts(3, [275, 275, 275])).toBe('طلق و سیم · 1,650 صفحه، 825 برگ، سه جلد (275، 275 و 275 برگ)');
    expect(text(volumesSegs(7))).toBe('7 جلد');
    expect([volumeFileName(10040, 1, 1, 1), volumeFileName(10040, 1, 2, 2), pdfFileName(10040, 1)]).toEqual([
      'jozve-10040-1.pdf',
      'jozve-10040-1-jeld-2.pdf',
      'jozve-10040-1-asli.pdf',
    ]);
  });

  it('«چه عوض شد»، همان طرح: بازه با نام فایل مشتری، نام اندازه همان سایت، و «بقیه بی تغییر»', () => {
    const note = (changes: PanelPrintVolume['changes'][], pageCount = 120) =>
      text(
        changesNote(
          details({
            item: {
              pageCount,
              printFiles: changes.map((c, i) => volume(i + 1, i === 0 ? 1 : 61, changes.length === 1 ? 120 : i === 0 ? 60 : 120, { changes: c })),
            },
          }).items[0]!,
        ),
      );
    expect(note([{ resized: [[103, 120, 612, 792]] }])).toBe(
      'صفحهٔ 103 تا 120 (فایل حل تمرین فصل ۱.docx) اندازهٔ Letter داشت و روی A4 نشست؛ بقیه بی تغییر.',
    );
    // بازهٔ دو فایل، اندازهٔ بی‌نام به میلی‌متر، صفحهٔ تنها، چرخش و حاشیه‌نویسی.
    expect(note([{ resized: [[40, 50, 482, 680]], rotated: [[5, 5]], annotated: [[12, 12]] }])).toBe(
      'صفحهٔ 40 تا 50 (2 فایل) اندازهٔ 170×240 میلی‌متر داشت و روی A4 نشست؛ صفحهٔ 5 (فایل ریاضی ۲ - جلسه ۱.pdf) افقی بود و چرخید، بالایش لبهٔ چپ کاغذ؛ صفحهٔ 12 (فایل ریاضی ۲ - جلسه ۱.pdf) حاشیه‌نویسی داشت و جزو صفحه شد؛ بقیه بی تغییر.',
    );
    // بازه‌ای که از مرز دو جلد می‌گذرد یکی است؛ و با تقسیم.
    expect(note([{ rotated: [[55, 60]] }, { rotated: [[61, 64]] }])).toBe(
      'صفحهٔ 55 تا 64 (فایل ریاضی ۲ - جلسه ۲.pdf) افقی بود و چرخید، بالایش لبهٔ چپ کاغذ؛ بقیه بی تغییر؛ به دو جلد تقسیم شد، همان‌طور که صحافی‌اش حساب شده.',
    );
    // بیش از سه بازه از یک نوع: بقیه با شمارشان.
    expect(note([{ resized: [[1, 1, 420, 595], [3, 3, 420, 595], [5, 5, 420, 595], [7, 7, 420, 595], [9, 9, 420, 595]] }])).toBe(
      'صفحهٔ 1 (فایل ریاضی ۲ - جلسه ۱.pdf) اندازهٔ A5 داشت و روی A4 نشست؛ صفحهٔ 3 (فایل ریاضی ۲ - جلسه ۱.pdf) اندازهٔ A5 داشت و روی A4 نشست؛ صفحهٔ 5 (فایل ریاضی ۲ - جلسه ۱.pdf) اندازهٔ A5 داشت و روی A4 نشست؛ و 2 بازهٔ دیگر هم؛ بقیه بی تغییر.',
    );
    // همهٔ صفحه‌ها عوض شد: «بقیه» ندارد.
    expect(note([{ rotated: [[1, 120]] }])).toBe('صفحهٔ 1 تا 120 (3 فایل) افقی بود و چرخید، بالایش لبهٔ چپ کاغذ.');
  });

  it('برگهٔ سفارش: با دادهٔ امروز، در حال به‌روز شدن، در حال ساختن، یا ساخته نشد؛ برگهٔ کهنه هرگز', () => {
    const job = (status: PanelPdfJob['status'], over: Partial<PanelPdfJob> = {}): PanelPdfJob => ({
      status,
      attempts: 1,
      maxAttempts: 3,
      lastError: null,
      createdAt: NOW,
      updatedAt: NOW,
      finishedAt: status === 'done' || status === 'failed' ? NOW : null,
      ...over,
    });
    const view = (rest: Partial<PanelOrderDetails>, order: Partial<OrderRow> = {}) => ticketView(details({ order, rest }));
    const fresh = { sizeBytes: 38_000, builtAt: NOW, fresh: true };
    expect(view({ ticket: fresh, ticketJob: job('done') })).toEqual({ kind: 'ready', bytes: 38_000, builtAt: NOW });
    // در حال به‌روز شدن، با علت (۵٫۲): تازه‌ترین تغییر پس از ساختن برگه؛ نام تازهٔ خود چاپخانه یا تغییری که رویداد سفارش ندارد، «داده».
    const queued = { ticket: { ...fresh, fresh: false }, ticketJob: job('queued', { attempts: 0 }) };
    expect(view(queued)).toEqual({ kind: 'updating', cause: 'data' });
    const moved = { ...details().assignments[0]!, id: 2, at: new Date(NOW.getTime() + 60_000), fromName: 'چاپ نور', toName: 'چاپخانهٔ جزوه‌یار' };
    const edited = { id: 9, at: new Date(NOW.getTime() + 120_000), action: 'orders.recipient', adminName: 'سارا', detail: null };
    expect(view({ ...queued, assignments: [...details().assignments, moved] })).toEqual({ kind: 'updating', cause: 'partner' });
    expect(view({ ...queued, events: [edited] })).toEqual({ kind: 'updating', cause: 'recipient' });
    expect(view({ ...queued, assignments: [...details().assignments, moved], events: [edited] })).toEqual({ kind: 'updating', cause: 'recipient' });
    expect(view({ ...queued, assignments: [...details().assignments, { ...moved, at: new Date(NOW.getTime() + 180_000) }], events: [edited] })).toEqual({
      kind: 'updating',
      cause: 'partner',
    });
    // تغییری پیش از ساختن برگه علت نیست: برگه آن را دارد.
    expect(view({ ...queued, assignments: [...details().assignments, { ...moved, at: new Date(NOW.getTime() - 60_000) }] })).toEqual({
      kind: 'updating',
      cause: 'data',
    });
    expect(view({ ticket: null, ticketJob: job('running') })).toEqual({ kind: 'building', retrying: false });
    expect(view({ ticket: null, ticketJob: job('failed', { lastError: 'font_missing: x' }) })).toMatchObject({
      kind: 'failed',
      reason: 'قلم وزیرمتن روی کارگر پیدا نشد',
    });
    // برگهٔ کهنه‌ای که کارش در صف نیست (پیش از ۵٫۱ کاری نبود): «ساخته نشد»، نه برگهٔ کهنه.
    expect(view({ ticket: { ...fresh, fresh: false }, ticketJob: null })).toMatchObject({ kind: 'failed', reason: 'کارگر چیزی نساخت' });
    expect(view({ ticket: fresh }, { status: 'awaiting_payment' })).toEqual({ kind: 'unpaid' });
    expect(view({ ticket: fresh }, { status: 'handed_to_post', handedToPostAt: NOW })).toMatchObject({ kind: 'ready' });
    expect(view({ ticket: null, ticketJob: job('failed') }, { status: 'cancelled' })).toEqual({ kind: 'closed' });
    expect(view({ ticket: fresh }, { status: 'handed_to_post', handedToPostAt: NOW, filesDeletedAt: NOW })).toEqual({ kind: 'purged' });
  });

  it('فایل‌های پاک‌شده (ADR-044): پیام همان طرح با روزهای پس از پست یا لغو؛ نه فایل چاپ، نه «شروع چاپ»', () => {
    const handedAt = tehran('2026-09-05 16:40');
    const deletedAt = tehran('2026-10-05 17:10');
    const d = details({ order: { status: 'handed_to_post', handedToPostAt: handedAt, filesDeletedAt: deletedAt } });
    expect(text(purgedNote(d)!)).toBe(
      'فایل‌های این سفارش (PDF جزوه، فایل چاپ و برگه) دوشنبه 13 مهر پاک شد: 30 روز پس از تحویل پست. مشخصات، مبلغ و رویدادها می‌مانند.',
    );
    const cancelled = details({
      order: { status: 'cancelled', filesDeletedAt: deletedAt },
      rest: { statusEvents: [statusEvent({ fromStatus: 'paid', toStatus: 'cancelled', at: tehran('2026-09-27 10:00') })] },
    });
    expect(text(purgedNote(cancelled)!)).toContain(': 8 روز پس از لغو.');
    expect(purgedNote(details())).toBeNull();
    expect(printView(d, d.items[0]!, NOW)).toEqual({ kind: 'purged' });
    const printed = details({ item: { printFiles: [volume(1, 1, 120)] } });
    expect(printReady(printed)).toBe(true);
    expect(printReady({ ...printed, order: { ...printed.order, filesDeletedAt: NOW } })).toBe(false);
  });

  it('پرداخت‌ها (۷٫۲، طرح `m-order` و `m-order-unpaid`): شناسهٔ زیبال، کارت و کد پیگیری، وضعیت درگاه، علت هر ناموفق، و «استعلام از درگاه»', () => {
    const payment = (over: Partial<PaymentRow>): PaymentRow => ({
      id: 'p',
      orderId: 'o1',
      provider: 'zibal',
      amountRials: 3_747_500,
      status: 'pending',
      authority: '3715022987',
      gatewayOrderId: '10030-aaaaaaaa',
      returnKey: 'a'.repeat(32),
      refId: null,
      cardMask: null,
      failureCode: null,
      raw: null,
      createdAt: NOW,
      verifiedAt: null,
      verifiedAmountRials: null,
      gatewayStatus: null,
      gatewayError: null,
      gatewayCheckedAt: null,
      returnedAt: null,
      settledVia: null,
      smsMessageId: null,
      ...over,
    });
    const at = (hhmm: string) => tehran(`2026-10-05 ${hhmm}`);
    const view = (p: PaymentRow) => {
      const v = paymentView(p, NOW);
      return [v.kind, text(v.meta), v.inquirable];
    };
    const card = '6037\u00a099••\u00a0••••\u00a01234';
    expect(
      view(payment({ status: 'succeeded', authority: '3714562809', refId: '803114', cardMask: '603799******1234', gatewayStatus: 1, verifiedAt: NOW })),
    ).toEqual(['succeeded', `شناسهٔ زیبال 3714562809 · کارت ${card} · کد پیگیری 803114 · درگاه: پرداخت‌شده، تأییدشده`, false]);
    // علت کارت از خود زیبال؛ لغو با درگاه نمونه.
    expect(view(payment({ status: 'failed', authority: '3714559120', failureCode: 'declined', gatewayStatus: 5 }))).toEqual([
      'failed',
      'شناسهٔ زیبال 3714559120 · موجودی کارت کافی نبود',
      false,
    ]);
    expect(view(payment({ status: 'failed', provider: 'mock', failureCode: 'cancelled', gatewayStatus: 3 }))).toEqual([
      'failed',
      'درگاه نمونه · مشتری در درگاه انصراف داد',
      false,
    ]);
    // برنگشت و مهلت گذشت، با استعلام خودکار (طرح).
    expect(
      view(payment({ status: 'failed', authority: '3715020114', failureCode: 'expired', gatewayStatus: -1, gatewayCheckedAt: at('11:14'), settledVia: 'auto' })),
    ).toEqual([
      'failed',
      'شناسهٔ زیبال 3715020114 · مشتری به درگاه رفت و برنگشت؛ استعلام خودکار 11:14: پرداخت نشده (درگاه: در انتظار پرداخت)، و مهلت 10 دقیقه گذشته بود.',
      // پولی گرفته نشد: استعلام لازم نیست؛ همان بی پاسخ درگاه (`null`) چرا.
      false,
    ]);
    expect(view(payment({ status: 'failed', failureCode: 'expired', gatewayCheckedAt: at('11:14'), settledVia: 'auto' }))).toEqual([
      'failed',
      'شناسهٔ زیبال 3715022987 · مشتری به درگاه رفت و برنگشت؛ استعلام خودکار 11:14: زیبال جواب روشن نداد، و مهلت 10 دقیقه گذشته بود.',
      true,
    ]);
    // پرداخت دوم: پول نزد درگاه («استعلام از درگاه»)، و بعد «برگشت خورد».
    const second = { status: 'failed' as const, authority: '3714563311', failureCode: 'order_not_payable', cardMask: '603799******1234', settledVia: 'auto' };
    expect(view(payment({ ...second, gatewayStatus: 2, gatewayCheckedAt: at('11:10') }))).toEqual([
      'failed',
      `شناسهٔ زیبال 3714563311 · کارت ${card} · پرداخت دوم: سفارش پیش‌تر پرداخت شده بود، پس تأیید نشد؛ زیبال پولش را خودکار به کارت برمی‌گرداند (درگاه: پرداخت‌شده، تأییدنشده) · استعلام خودکار 11:10`,
      true,
    ]);
    expect(view(payment({ ...second, gatewayStatus: 18, gatewayCheckedAt: at('11:19') }))).toEqual([
      'returned',
      `شناسهٔ زیبال 3714563311 · کارت ${card} · پرداخت دوم: سفارش پیش‌تر پرداخت شده بود، پس تأیید نشد؛ زیبال پولش را به کارت برگرداند (درگاه: ریورس‌شده) · استعلام خودکار 11:19`,
      false,
    ]);
    // تأییدشده و بی‌استفاده: خودکار برنمی‌گردد.
    expect(text(paymentView(payment({ ...second, gatewayStatus: 1 }), NOW).meta)).toContain('زیبال آن را تأییدشده می‌گوید، پس پولش خودکار برنمی‌گردد: دستی برش گردان');
    // مبلغ ناهمخوان: آنچه استعلام پیش از `verify` گفت.
    expect(
      view(payment({ status: 'failed', failureCode: 'amount_mismatch', gatewayStatus: 2, raw: { amount: 374_750 }, settledVia: 'callback', gatewayCheckedAt: at('11:00') })),
    ).toEqual([
      'failed',
      'شناسهٔ زیبال 3715022987 · مبلغ با سفارش نخواند: زیبال 37,475 تومان گفت، نه 374,750؛ زیبال پولش را خودکار به کارت برمی‌گرداند (درگاه: پرداخت‌شده، تأییدنشده) · برگشت مشتری 11:00',
      true,
    ]);
    // در حال بررسی: مشتری برگشت و زیبال جواب نداد (طرح)، یا پرداخت‌شده و `verify` هنوز نه.
    const created = at('11:14');
    expect(view(payment({ createdAt: created, returnedAt: at('11:16'), gatewayError: 'unavailable', gatewayCheckedAt: at('11:18') }))).toEqual([
      'checking',
      'شناسهٔ زیبال 3715022987 · مشتری 11:16 برگشت ولی زیبال جواب نداد. استعلام خودکار هر دقیقه، آخرین 11:18؛ برگشتش تا 11:24 پذیرفته می‌شود.',
      true,
    ]);
    expect(view(payment({ createdAt: created, gatewayStatus: 2, gatewayError: 'unavailable:502', gatewayCheckedAt: at('11:18') }))[1]).toBe(
      'شناسهٔ زیبال 3715022987 · زیبال می‌گوید پرداخت شده، ولی تأییدش هنوز نهایی نشده؛ زیبال جواب نداد (HTTP 502). استعلام خودکار هر دقیقه، آخرین 11:18؛ برگشتش تا 11:24 پذیرفته می‌شود.',
    );
    expect(view(payment({ createdAt: created, returnedAt: at('11:16'), gatewayError: 'rejected:115', gatewayCheckedAt: at('11:18') }))[1]).toContain(
      'برگشت ولی زیبال IP سرور را نپذیرفت (کد 115).',
    );
    // مرز همان برگشت سایت: تا خود ده دقیقه هنوز پذیرفته می‌شود، یک میلی‌ثانیه بعد «بی برگشت».
    expect(view(payment({ createdAt: new Date(NOW.getTime() - 10 * MINUTE) }))).toEqual([
      'pending',
      'شناسهٔ زیبال 3715022987 · مشتری در درگاه است؛ برگشتش تا ساعت 11:20 پذیرفته می‌شود.',
      true,
    ]);
    expect(view(payment({ createdAt: new Date(NOW.getTime() - 10 * MINUTE - 1) }))).toEqual([
      'unreturned',
      'شناسهٔ زیبال 3715022987 · مشتری به درگاه رفت و برنگشت؛ هنوز از درگاه پرسیده نشده.',
      true,
    ]);
    expect(view(payment({ createdAt: new Date(NOW.getTime() - 40 * MINUTE), gatewayError: 'unavailable', gatewayCheckedAt: at('11:19') }))).toEqual([
      'unreturned',
      'شناسهٔ زیبال 3715022987 · مشتری به درگاه رفت و برنگشت، و زیبال جواب نداد. استعلام خودکار هر دقیقه دوباره می‌پرسد، آخرین 11:19.',
      true,
    ]);
    expect(view(payment({ provider: 'mock', createdAt: new Date(NOW.getTime() - 40 * MINUTE) }))[1]).toBe(
      'درگاه نمونه · مشتری به درگاه رفت و برنگشت؛ هنوز از درگاه پرسیده نشده.',
    );
  });

  it('رویدادهای سفارش به ترتیب زمان: ساخته شد، پرداخت شد، PDF و فایل چاپ، و کار ادمین‌ها؛ روز فقط در اولین سطر هر روز', () => {
    const d = details({
      item: { printPdfReadyAt: tehran('2026-10-03 14:06'), printFiles: [volume(1, 1, 120, { createdAt: tehran('2026-10-03 14:06') })] },
      rest: {
        statusEvents: [
          statusEvent({ id: 1, fromStatus: null, toStatus: 'awaiting_payment', at: tehran('2026-10-03 13:57'), actor: 'user' }),
          statusEvent({ id: 2, fromStatus: 'awaiting_payment', toStatus: 'paid', at: tehran('2026-10-03 14:05'), actor: 'gateway' }),
        ],
        events: [
          { id: 9, at: tehran('2026-10-05 09:40'), action: 'orders.pdf_download', detail: { orderNumber: 10027, item: 1 }, adminName: 'علی' },
          { id: 8, at: tehran('2026-10-03 16:00'), action: 'orders.pdf_rebuild', detail: { orderNumber: 10027 }, adminName: 'سارا' },
        ],
      },
    });
    const entries = orderTimeline(d);
    // تخصیص خودکار (۵٫۲) در همان تراکنش پرداخت و با همان زمان، پس درست پس از «پرداخت شد».
    expect(entries.map((e) => [text(e.text), e.who])).toEqual([
      ['سفارش ساخته شد', 'مشتری'],
      ['پرداخت شد', 'درگاه'],
      ['به چاپ نور سپرده شد، هم‌شهر مشتری', 'سیستم'],
      ['PDF جزوه و فایل چاپ ساخته شد', 'سیستم'],
      ['ساختن دوبارهٔ فایل چاپ', 'سارا'],
      ['PDF اصلی جزوه دانلود شد', 'علی'],
    ]);
    expect(timelineWhen(entries)).toEqual([
      { day: 'شنبه 11 مهر', time: '13:57' },
      { day: null, time: '14:05' },
      { day: null, time: '14:05' },
      { day: null, time: '14:06' },
      { day: null, time: '16:00' },
      { day: 'دوشنبه 13 مهر', time: '09:40' },
    ]);
    const failed = orderTimeline(
      details({
        rest: { assignments: [], pdfJob: { status: 'failed', attempts: 3, maxAttempts: 3, lastError: 'x', createdAt: NOW, updatedAt: NOW, finishedAt: NOW } },
      }),
    );
    expect(failed.map((e) => text(e.text))).toEqual(['ساختن فایل چاپ ناموفق ماند']);
    const expired = orderTimeline(
      details({
        rest: {
          pdfJob: null,
          assignments: [],
          statusEvents: [statusEvent({ id: 3, fromStatus: 'awaiting_payment', toStatus: 'expired', at: NOW, actor: 'system' })],
        },
      }),
    );
    expect(expired.map((e) => [text(e.text), e.who])).toEqual([['رها شد: فایل‌ها دیگر روی سرور نبود', 'سیستم']]);
  });
});

/* ───────────── وضعیت پس از پرداخت (۴٫۳) ───────────── */

describe('وضعیت پس از پرداخت (۴٫۳)', () => {
  it('وضعیت سفارش و ستون ردیف: در حال چاپ، تحویل پست شد، لغو شد؛ PDF ساخته‌نشدهٔ سفارش باز هم', () => {
    expect(['paid', 'printing', 'handed_to_post', 'cancelled'].map((status) => orderState(status as OrderRow['status'], true))).toEqual([
      'queued',
      'printing',
      'handed',
      'cancelled',
    ]);
    expect(rowState(line({ status: 'printing' }))).toEqual({ label: 'در حال چاپ', icon: null });
    expect(rowState(line({ status: 'printing', pdfJob: 'failed' }))).toEqual({ label: 'PDF ساخته نشد', icon: 'error' });
    expect(rowState(line({ status: 'handed_to_post', handedToPostAt: NOW }))).toEqual({ label: 'تحویل پست شد', icon: null });
    // سفارش بسته دیگر PDF لازم ندارد: کار شکست‌خورده‌اش کار بعدی کسی نیست.
    expect(rowState(line({ status: 'cancelled', pdfJob: 'failed' }))).toEqual({ label: 'لغو شد', icon: null });
  });

  it('گذار هر کار فقط از وضعیتی که ادمین دید؛ برگرداندن یک قدم، و لغو به همان وضعیتی که پیش از لغو داشت', () => {
    const none: PanelStatusEvent[] = [];
    expect(transitionOf('start_print', 'paid', none)).toBe('printing');
    expect(transitionOf('handed_to_post', 'printing', none)).toBe('handed_to_post');
    expect(transitionOf('cancel', 'paid', none)).toBe('cancelled');
    expect(transitionOf('cancel', 'printing', none)).toBe('cancelled');
    expect(transitionOf('revert', 'printing', none)).toBe('paid');
    expect(transitionOf('revert', 'handed_to_post', none)).toBe('printing');
    // از جای نادرست، هیچ: چاپِ چاپ‌شده، پستِ در صف، لغوِ رسیده به پست یا پرداخت‌نشده، و برگرداندنِ در صف.
    expect(transitionOf('start_print', 'printing', none)).toBeNull();
    expect(transitionOf('handed_to_post', 'paid', none)).toBeNull();
    expect(transitionOf('cancel', 'handed_to_post', none)).toBeNull();
    expect(transitionOf('cancel', 'awaiting_payment', none)).toBeNull();
    expect(transitionOf('cancel', 'cancelled', none)).toBeNull();
    expect(transitionOf('revert', 'paid', none)).toBeNull();
    expect(transitionOf('revert', 'awaiting_payment', none)).toBeNull();
    // لغو از «در حال چاپ» به همان برمی‌گردد؛ آخرین لغو حساب است، نه اولی.
    const cancelledFrom = (...froms: ('paid' | 'printing')[]) =>
      froms.map((fromStatus, i) => statusEvent({ id: i + 1, fromStatus, toStatus: 'cancelled' }));
    expect(transitionOf('revert', 'cancelled', cancelledFrom('printing'))).toBe('printing');
    expect(transitionOf('revert', 'cancelled', cancelledFrom('printing', 'paid'))).toBe('paid');
    expect(transitionOf('revert', 'cancelled', none)).toBeNull();
    expect([isRevert('printing', 'paid'), isRevert('handed_to_post', 'printing'), isRevert('cancelled', 'printing')]).toEqual([true, true, true]);
    expect([isRevert('paid', 'printing'), isRevert('printing', 'cancelled'), isRevert('awaiting_payment', 'paid')]).toEqual([false, false, false]);
  });

  it('سطر آمار پیشخوان، همان طرح؛ هر جمله فقط وقتی چیزی برای گفتن دارد', () => {
    const line = (open: number, printing: number, handed: number, onTime: number) => {
      const segs = statsSegs(open, { printing, handed, onTime });
      return segs && text(segs);
    };
    expect(line(10, 2, 42, 41)).toBe('از این 10 سفارش، 2 در حال چاپ است. هفتهٔ گذشته 41 از 42 سفارش به‌موقع به پست رسید.');
    expect(nums(statsSegs(10, { printing: 2, handed: 42, onTime: 41 })!)).toEqual(['10', '2', '41', '42']);
    expect(line(3, 0, 0, 0)).toBe('از این 3 سفارش، هنوز هیچ‌کدام در حال چاپ نیست.');
    expect(line(0, 0, 2, 0)).toBe('هفتهٔ گذشته 0 از 2 سفارش به‌موقع به پست رسید.');
    expect(line(0, 0, 0, 0)).toBeNull();
  });

  it('فایل چاپ: ساخته‌شده در هر وضعیت پس از پرداخت دانلودی است؛ ساخته‌نشدهٔ سفارش بسته دیگر لازم نیست', () => {
    const printFiles = [volume(1, 1, 120)];
    for (const status of ['printing', 'handed_to_post', 'cancelled'] as const) {
      const ready = details({ order: { status }, item: { printFiles } });
      expect(printView(ready, ready.items[0]!, NOW)).toMatchObject({ kind: 'ready' });
    }
    const cancelled = details({ order: { status: 'cancelled' }, rest: { pdfJob: { ...details().pdfJob!, status: 'failed', lastError: 'order_closed: cancelled' } } });
    expect(printView(cancelled, cancelled.items[0]!, NOW)).toEqual({ kind: 'closed' });
    const printing = details({ order: { status: 'printing' }, rest: { pdfJob: { ...details().pdfJob!, status: 'queued', attempts: 0 } } });
    expect(printView(printing, printing.items[0]!, NOW)).toEqual({ kind: 'building', retrying: false });
    // کار شکستی که لغوش برگشت: دلیلش روشن، و «دوباره بساز» تا فایل‌ها هستند.
    const reopened = details({ rest: { pdfJob: { ...details().pdfJob!, status: 'failed', attempts: 1, lastError: 'order_closed: cancelled' } } });
    expect(printView(reopened, reopened.items[0]!, NOW)).toMatchObject({ kind: 'failed', reason: 'سفارش لغو شده بود' });
    // «شروع چاپ» فقط وقتی فایل چاپ همهٔ جزوه‌ها ساخته شده؛ PDF جزوه به‌تنهایی نه (شاهد).
    expect(printReady(details())).toBe(false);
    expect(printReady(details({ item: { printPdfReadyAt: NOW } }))).toBe(false);
    expect(printReady(details({ item: { printFiles } }))).toBe(true);
    const two = details({ item: { printFiles } });
    expect(printReady({ ...two, items: [two.items[0]!, { ...two.items[0]!, id: 'i2', seq: 2, printFiles: [] }] })).toBe(false);
    expect(printReady({ ...two, items: [] })).toBe(false);
  });

  it('رویدادهای وضعیت با نام ادمین؛ برگرداندن با دلیلش؛ ویرایش گیرنده؛ جابه‌جایی چاپخانه (۵٫۲)؛ رویداد ادمینِ وضعیت و جابه‌جایی یک بار', () => {
    const at = (time: string) => tehran(`2026-10-05 ${time}`);
    const assignment = (over: Partial<PanelAssignment>): PanelAssignment => ({
      id: 1,
      at: tehran('2026-10-03 14:05'),
      fromName: null,
      toPartnerId: 'partner-noor',
      toName: 'چاپ نور',
      actor: 'system',
      adminName: null,
      rule: 'city',
      reason: null,
      ...over,
    });
    const d = details({
      rest: {
        pdfJob: null,
        assignments: [
          assignment({}),
          assignment({ id: 2, at: at('09:30'), fromName: 'چاپ نور', toName: 'چاپخانهٔ جزوه‌یار', actor: 'admin', adminName: 'علی', rule: null, reason: 'دستگاه خراب است' }),
        ],
        statusEvents: [
          statusEvent({ id: 1, fromStatus: 'paid', toStatus: 'printing', at: at('10:05'), adminName: 'سارا' }),
          statusEvent({ id: 2, fromStatus: 'printing', toStatus: 'handed_to_post', at: at('16:40'), adminName: 'سارا' }),
          statusEvent({
            id: 3,
            fromStatus: 'handed_to_post',
            toStatus: 'printing',
            at: at('16:45'),
            adminName: 'مالک',
            note: { reason: 'اشتباه زدم' },
          }),
          statusEvent({ id: 4, fromStatus: 'printing', toStatus: 'cancelled', at: at('17:00'), adminName: 'سارا', note: { reason: 'مشتری خواست' } }),
        ],
        events: [
          {
            id: 6,
            at: at('09:30'),
            action: 'orders.assign',
            detail: { orderNumber: 10027, from: { name: 'چاپ نور' }, to: { name: 'چاپخانهٔ جزوه‌یار' }, reason: 'دستگاه خراب است' },
            adminName: 'علی',
          },
          { id: 7, at: at('10:05'), action: 'orders.status', detail: { orderNumber: 10027, from: 'paid', to: 'printing' }, adminName: 'سارا' },
          {
            id: 8,
            at: at('11:00'),
            action: 'orders.recipient',
            detail: { orderNumber: 10027, changed: ['addressText', 'postalCode'], previous: {} },
            adminName: 'علی',
          },
        ],
      },
    });
    expect(orderTimeline(d).map((e) => [text(e.text), e.who])).toEqual([
      ['به چاپ نور سپرده شد، هم‌شهر مشتری', 'سیستم'],
      ['از «چاپ نور» به «چاپخانهٔ جزوه‌یار» رفت؛ دستگاه خراب است', 'علی'],
      ['در صف چاپ ← در حال چاپ', 'سارا'],
      ['ویرایش گیرنده: نشانی، کد پستی', 'علی'],
      ['در حال چاپ ← تحویل پست شد', 'سارا'],
      ['برگرداندن: تحویل پست شد ← در حال چاپ؛ اشتباه زدم', 'مالک'],
      ['لغو شد', 'سارا'],
    ]);
  });
});

describe('کد رهگیری در رویدادهای سفارش (۶٫۲)', () => {
  it('کد با تأیید یا دستی کنار خود سطرش؛ رویدادهای ادمین همان کارها دوباره نوشته نمی‌شوند؛ کنار رفتن با دلیل و برگشت وضعیت', () => {
    const at = (time: string) => tehran(`2026-10-05 ${time}`);
    const parcel = (over: Partial<PanelOrderDetails['shipments'][number]>) =>
      ({
        id: 's',
        barcode: '118800000000000000000101',
        importId: 'i',
        filename: 'FileName-1981.xls',
        rowNo: 6,
        weightGrams: 910,
        fareRials: 1_295_000,
        taxRials: 129_500,
        postDay: at('00:00'),
        handedOrder: true,
        matchedBy: 'rule',
        adminName: 'علی',
        createdAt: at('11:05'),
        voidedAt: null,
        voidedByName: null,
        voidReason: null,
        ...over,
      }) as PanelOrderDetails['shipments'][number];
    const d = details({
      order: { status: 'handed_to_post' },
      rest: {
        statusEvents: [
          statusEvent({ id: 1, fromStatus: 'printing', toStatus: 'handed_to_post', at: at('11:05'), adminName: 'علی', note: { source: 'post_file', via: 'review' } }),
          statusEvent({ id: 2, fromStatus: 'handed_to_post', toStatus: 'printing', at: at('12:00'), adminName: 'سارا', note: { source: 'shipment_void', reason: 'اشتباه' } }),
          statusEvent({ id: 3, fromStatus: 'printing', toStatus: 'handed_to_post', at: at('12:30'), adminName: 'علی', note: { source: 'post_file', via: 'manual' } }),
        ],
        shipments: [
          parcel({ id: 'a', matchedBy: 'review', voidedAt: at('12:00'), voidedByName: 'سارا', voidReason: 'اشتباه' }),
          parcel({ id: 'b', matchedBy: 'manual', barcode: '118800000000000000000202', createdAt: at('12:30'), rowNo: 7 }),
        ],
        assignments: [],
        events: [
          { id: 7, at: at('11:05'), action: 'shipments.approve', detail: { orderNumber: 10027 }, adminName: 'علی' },
          { id: 8, at: at('12:00'), action: 'shipments.void', detail: { orderNumber: 10027, reason: 'اشتباه' }, adminName: 'سارا' },
          { id: 9, at: at('12:30'), action: 'shipments.assign', detail: { orderNumber: 10027 }, adminName: 'علی' },
        ],
      },
    });
    expect(orderTimeline(d).map((e) => [text(e.text), e.who])).toEqual([
      ['در حال چاپ ← تحویل پست شد', 'علی، فایل پست'],
      ['کد رهگیری 118800000000000000000101 از FileName-1981.xls، با تأیید', 'علی'],
      ['برگرداندن: تحویل پست شد ← در حال چاپ؛ اشتباه', 'سارا'],
      ['کد رهگیری 118800000000000000000101 کنار رفت؛ اشتباه', 'سارا'],
      ['در حال چاپ ← تحویل پست شد', 'علی، فایل پست'],
      ['کد رهگیری 118800000000000000000202 از FileName-1981.xls، دستی', 'علی'],
    ]);
    // بی مبلغ: کرایه و مالیات پست هر بسته هم صفر (تصمیم ۸۱).
    const hidden = withoutMoney(d);
    expect(hidden.shipments.map((s) => [s.fareRials, s.taxRials, s.weightGrams])).toEqual([
      [0, 0, 910],
      [0, 0, 910],
    ]);
  });
});

/* ───────────────────────── بی مبلغ، و از چشم چاپخانه (۵٫۳) ───────────────────────── */

describe('بی مبلغ، و از چشم چاپخانه (۵٫۳)', () => {
  /** هر مقدار پولی که صفر نیست، در هر عمقی. */
  const money = (value: unknown): string[] =>
    [...JSON.stringify(value).matchAll(/"(\w*Rials)":(-?\d+)/g)].filter(([, , amount]) => amount !== '0').map(([, key]) => key!);

  it('بی مبلغ: هر مبلغ سفارش و ریز قیمت منجمدش صفر، پرداخت‌ها هیچ؛ مشخصات چاپ و تاریخ‌ها همان', () => {
    const paid = details({ rest: { payments: [{ id: 'pay', amountRials: BREAKDOWN.totalRials, sms: null } as PanelPayment] } });
    expect(money(paid).length).toBeGreaterThan(5);
    const hidden = withoutMoney(paid);
    expect(money(hidden)).toEqual([]);
    expect(hidden.payments).toEqual([]);
    expect(hidden.order.paidAt).toEqual(paid.order.paidAt);
    expect(hidden.order.paidAt).toBeInstanceOf(Date);
    // مشخصات چاپ از همان ریز قیمت (جلد و برگ) دست نخورده.
    const priced = (d: PanelOrderDetails) => (d.order.priceBreakdown as typeof BREAKDOWN).items[0]!;
    expect([priced(hidden).volumes, priced(hidden).sheets, priced(hidden).sheetsPerVolume]).toEqual([
      priced(paid).volumes,
      priced(paid).sheets,
      priced(paid).sheetsPerVolume,
    ]);
    expect(specFacts(hidden.items[0]!, priced(hidden))).toEqual(specFacts(paid.items[0]!, priced(paid)));
    // خود جزئیات دست نخورد (شاهد: همان مبلغ هنوز آنجاست).
    expect(paid.order.totalRials).toBe(BREAKDOWN.totalRials);
    const line = { orderNumber: 10027, totalRials: 3_747_500, pageCount: 120 } as PanelOrderLine;
    expect(linesWithoutMoney([line])).toEqual([{ orderNumber: 10027, totalRials: 0, pageCount: 120 }]);
  });

  it('بی مبلغ: رویدادهای پرداخت هم نه («دوباره بفرست» پیامک پرداخت، ۷٫۱)؛ بقیهٔ رویدادها همان', () => {
    const d = details({
      rest: {
        events: [
          { id: 8, at: tehran('2026-10-04 10:00'), action: 'orders.pdf_download', detail: { orderNumber: 10027, item: 1 }, adminName: 'حسن' },
          { id: 9, at: tehran('2026-10-04 10:05'), action: 'payments.sms_resend', detail: { orderNumber: 10027, outcome: 'sent' }, adminName: 'سارا' },
        ],
      },
    });
    expect(withoutMoney(d).events.map((e) => e.action)).toEqual(['orders.pdf_download']);
    expect(d.events.map((e) => e.action)).toEqual(['orders.pdf_download', 'payments.sms_resend']);
  });

  it('از چشم چاپخانه: بی دلیل، بی چاپخانهٔ دیگر، و رویدادهای سفارش فقط با آنچه سطرشان می‌گوید', () => {
    const d = details({
      order: { status: 'cancelled' },
      rest: {
        statusEvents: [
          statusEvent({ fromStatus: 'paid', toStatus: 'printing', adminName: 'حسن' }),
          statusEvent({ fromStatus: 'printing', toStatus: 'paid', adminName: 'سارا', note: { reason: 'اشتباه زد' } }),
          statusEvent({ fromStatus: 'paid', toStatus: 'cancelled', adminName: 'سارا', note: { reason: 'مشتری خواست؛ 374,750 تومان برگشت' } }),
        ],
        assignments: [
          { id: 1, at: tehran('2026-10-03 14:05'), fromName: null, toPartnerId: 'partner-aftab', toName: 'چاپ آفتاب', actor: 'system', adminName: null, rule: 'province', reason: null },
          { id: 2, at: tehran('2026-10-04 09:00'), fromName: 'چاپ آفتاب', toPartnerId: 'partner-noor', toName: 'چاپ نور', actor: 'admin', adminName: 'سارا', rule: null, reason: 'آفتاب کند است' },
        ],
        events: [
          { id: 7, at: tehran('2026-10-04 09:00'), action: 'orders.assign', detail: { reason: 'آفتاب کند است' }, adminName: 'سارا' },
          { id: 8, at: tehran('2026-10-04 10:00'), action: 'orders.pdf_download', detail: { orderNumber: 10027, item: 1 }, adminName: 'حسن' },
        ],
      },
    });
    const seen = partnerView(d, 'partner-noor');
    const lines = orderTimeline(seen).map((entry) => `${entry.text.join('')} · ${entry.who}`);
    // به ترتیب زمان: جابه‌جایی و دانلود دیروز، وضعیت‌ها امروز.
    expect(lines).toEqual([
      'به چاپ نور سپرده شد · سارا',
      'PDF اصلی جزوه دانلود شد · حسن',
      'در صف چاپ ← در حال چاپ · حسن',
      'برگرداندن: در حال چاپ ← در صف چاپ · سارا',
      'لغو شد · سارا',
    ]);
    for (const hidden of ['اشتباه زد', 'مشتری خواست', 'آفتاب']) expect(JSON.stringify(seen)).not.toContain(hidden);
    // شاهد: مالک و متصدی همه را دارند.
    const all = orderTimeline(d).map((entry) => entry.text.join(''));
    expect(all).toContain('برگرداندن: در حال چاپ ← در صف چاپ؛ اشتباه زد');
    expect(all).toContain('از «چاپ آفتاب» به «چاپ نور» رفت؛ آفتاب کند است');
  });
});
