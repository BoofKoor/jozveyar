/**
 * سفارش‌ها به زبان پنل (`orders.ts`): جست‌وجو، مرز روز تهران، کاشی‌ها و کارت مهلت، ردیف، مشخصات و ریز قیمت
 * منجمد، پرداخت‌ها، PDF جزوه و رویدادها. عددهای تصمیم (حاشیهٔ یک ساعت، مهلت نیم ساعت) صریح‌اند، نه از ثابت کد.
 * «حالا» همان طرح پنل است: دوشنبه 13 مهر 1405، ساعت 11:20 تهران.
 */

import { describe, expect, it } from 'vitest';

import type { OrderRow, PanelOrderDetails, PanelOrderItem, PanelOrderLine, PanelStatusEvent, PaymentRow } from '@jozveyar/db';
import { quote } from '@jozveyar/pricing';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';
import { postHandoffDue } from '@jozveyar/text';

import {
  bucketOf,
  dayBounds,
  dueBadge,
  dueCard,
  dueKind,
  dueTiles,
  durationSegs,
  filesUntil,
  isRevert,
  jozveSegs,
  orderNumberOf,
  orderState,
  orderTimeline,
  pageOf,
  parseSearch,
  paymentView,
  pdfReady,
  pdfView,
  rowState,
  specFacts,
  staleSections,
  statsSegs,
  sumLines,
  timelineWhen,
  transitionOf,
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
const text = (segs: readonly Seg[]) => segs.map((s) => (typeof s === 'string' ? s : 'num' in s ? s.num : s.ltr)).join('');
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
    expect(texts(empty)).toEqual(['هیچ سفارشی دیر نشده', 'تا پایان امروز، دوشنبه', 'تا پایان سه‌شنبه 14 مهر', 'پس از فردا']);
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
    cancelledAt: null,
    pageCount: 120,
    itemCount: 1,
    fileCount: 1,
    copies: 1,
    colorModes: ['bw'],
    sidesModes: ['double'],
    pdfJob: 'done',
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
    statusEvents: [],
    pdfJob: { status: 'done', attempts: 1, maxAttempts: 3, lastError: null, createdAt: order.paidAt!, updatedAt: order.paidAt!, finishedAt: order.paidAt! },
    events: [],
    ...over.rest,
  };
}

/** یک تغییر وضعیت؛ ادمین فقط با `actor: 'admin'`. */
function statusEvent(over: Partial<PanelStatusEvent> & Pick<PanelStatusEvent, 'fromStatus' | 'toStatus'>): PanelStatusEvent {
  return { id: 1, orderId: 'o1', at: NOW, actor: 'admin', adminUserId: null, adminName: null, note: null, ...over };
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

  it('PDF جزوه: بعد از پرداخت، ساخته شده، در حال ساختن، یا ساخته نشد با دلیل', () => {
    expect(pdfView(details({ order: { status: 'awaiting_payment' } }), details().items[0]!, NOW)).toEqual({ kind: 'unpaid' });
    const ready = details({ item: { printPdfReadyAt: tehran('2026-10-03 14:06'), printPdfBytes: 40_265_318 } });
    expect(pdfView(ready, ready.items[0]!, NOW)).toEqual({
      kind: 'ready',
      fileName: 'jozve-10027-1.pdf',
      pages: 120,
      bytes: 40_265_318,
      readyAt: tehran('2026-10-03 14:06'),
    });
    const queued = details({ rest: { pdfJob: { ...details().pdfJob!, status: 'queued', attempts: 0 } } });
    expect(pdfView(queued, queued.items[0]!, NOW)).toEqual({ kind: 'building', retrying: false });
    const retrying = details({ rest: { pdfJob: { ...details().pdfJob!, status: 'queued', attempts: 1, lastError: "StorageError('x')" } } });
    expect(pdfView(retrying, retrying.items[0]!, NOW)).toEqual({ kind: 'building', retrying: true });
    const failedJob = { status: 'failed' as const, attempts: 3, maxAttempts: 3, lastError: "StorageError('GET → 503')", createdAt: tehran('2026-10-03 14:06'), updatedAt: NOW, finishedAt: tehran('2026-10-03 14:21') };
    const failed = details({ rest: { pdfJob: failedJob } });
    expect(pdfView(failed, failed.items[0]!, NOW)).toEqual({
      kind: 'failed',
      fileName: 'jozve-10027-1.pdf',
      attempts: 3,
      reason: 'استوریج یا پایگاه داده جواب نداد',
      from: tehran('2026-10-03 14:06'),
      to: tehran('2026-10-03 14:21'),
      filesUntil: new Date(NOW.getTime() + 2 * 24 * 60 * MINUTE),
    });
    const missing = details({ rest: { pdfJob: { ...failedJob, attempts: 1, lastError: 'file_missing: file_missing' } } });
    expect(pdfView(missing, missing.items[0]!, NOW)).toMatchObject({ reason: 'فایل مشتری روی استوریج پیدا نشد', attempts: 1 });
  });

  it('پرداخت‌ها: موفق با کد پیگیری، ناموفق با دلیل، بی برگشت بعد از نیم ساعت، و هنوز در درگاه', () => {
    const payment = (over: Partial<PaymentRow>): PaymentRow => ({
      id: 'p',
      orderId: 'o1',
      provider: 'zibal',
      amountRials: 3_747_500,
      status: 'pending',
      authority: 'a',
      refId: null,
      cardMask: null,
      failureCode: null,
      raw: null,
      createdAt: NOW,
      verifiedAt: null,
      ...over,
    });
    const view = (p: PaymentRow) => {
      const v = paymentView(p, NOW);
      return [v.kind, text(v.meta)];
    };
    expect(view(payment({ status: 'succeeded', refId: '803114', cardMask: '6037-99**-****-1234', verifiedAt: NOW }))).toEqual([
      'succeeded',
      'زیبال · کد پیگیری 803114 · کارت 6037-99**-****-1234',
    ]);
    expect(view(payment({ status: 'failed', failureCode: 'declined' }))).toEqual(['failed', 'زیبال · بانک پرداخت را نپذیرفت']);
    expect(view(payment({ status: 'failed', provider: 'mock', failureCode: 'cancelled' }))).toEqual([
      'failed',
      'درگاه نمونه · مشتری در درگاه انصراف داد',
    ]);
    // مرز همان برگشت سایت: تا خود نیم ساعت هنوز پذیرفته می‌شود، یک میلی‌ثانیه بعد «بی برگشت».
    expect(view(payment({ createdAt: new Date(NOW.getTime() - 30 * MINUTE) }))).toEqual([
      'pending',
      'زیبال · مشتری در درگاه است؛ برگشتش تا ساعت 11:20 پذیرفته می‌شود.',
    ]);
    expect(view(payment({ createdAt: new Date(NOW.getTime() - 30 * MINUTE - 1) }))[0]).toBe('unreturned');
    expect(view(payment({ createdAt: new Date(NOW.getTime() - 40 * MINUTE) }))).toEqual([
      'unreturned',
      'زیبال · مشتری به درگاه رفت و برنگشت. بعد از 30 دقیقه، برگشت دیرش هم پذیرفته نمی‌شود.',
    ]);
  });

  it('رویدادهای سفارش به ترتیب زمان: ساخته شد، پرداخت شد، PDF، و کار ادمین‌ها؛ روز فقط در اولین سطر هر روز', () => {
    const d = details({
      item: { printPdfReadyAt: tehran('2026-10-03 14:06') },
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
    expect(entries.map((e) => [text(e.text), e.who])).toEqual([
      ['سفارش ساخته شد', 'مشتری'],
      ['پرداخت شد', 'درگاه'],
      ['PDF جزوه ساخته شد', 'سیستم'],
      ['ساختن دوبارهٔ PDF جزوه', 'سارا'],
      ['PDF جزوه دانلود شد', 'علی'],
    ]);
    expect(timelineWhen(entries)).toEqual([
      { day: 'شنبه 11 مهر', time: '13:57' },
      { day: null, time: '14:05' },
      { day: null, time: '14:06' },
      { day: null, time: '16:00' },
      { day: 'دوشنبه 13 مهر', time: '09:40' },
    ]);
    const failed = orderTimeline(
      details({ rest: { pdfJob: { status: 'failed', attempts: 3, maxAttempts: 3, lastError: 'x', createdAt: NOW, updatedAt: NOW, finishedAt: NOW } } }),
    );
    expect(failed.map((e) => text(e.text))).toEqual(['ساختن PDF جزوه ناموفق ماند']);
    const expired = orderTimeline(
      details({
        rest: {
          pdfJob: null,
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

  it('PDF جزوه: ساخته‌شده در هر وضعیت پس از پرداخت دانلودی است؛ ساخته‌نشدهٔ سفارش بسته دیگر لازم نیست', () => {
    const readyAt = tehran('2026-10-03 14:06');
    for (const status of ['printing', 'handed_to_post', 'cancelled'] as const) {
      const ready = details({ order: { status }, item: { printPdfReadyAt: readyAt } });
      expect(pdfView(ready, ready.items[0]!, NOW)).toMatchObject({ kind: 'ready' });
    }
    const cancelled = details({ order: { status: 'cancelled' }, rest: { pdfJob: { ...details().pdfJob!, status: 'failed', lastError: 'order_closed: cancelled' } } });
    expect(pdfView(cancelled, cancelled.items[0]!, NOW)).toEqual({ kind: 'closed' });
    const printing = details({ order: { status: 'printing' }, rest: { pdfJob: { ...details().pdfJob!, status: 'queued', attempts: 0 } } });
    expect(pdfView(printing, printing.items[0]!, NOW)).toEqual({ kind: 'building', retrying: false });
    // کار شکستی که لغوش برگشت: دلیلش روشن، و «دوباره بساز» تا فایل‌ها هستند.
    const reopened = details({ rest: { pdfJob: { ...details().pdfJob!, status: 'failed', attempts: 1, lastError: 'order_closed: cancelled' } } });
    expect(pdfView(reopened, reopened.items[0]!, NOW)).toMatchObject({ kind: 'failed', reason: 'سفارش لغو شده بود' });
    // «شروع چاپ» فقط وقتی PDF همهٔ جزوه‌ها ساخته شده.
    expect(pdfReady(details())).toBe(false);
    expect(pdfReady(details({ item: { printPdfReadyAt: readyAt } }))).toBe(true);
    const two = details({ item: { printPdfReadyAt: readyAt } });
    expect(pdfReady({ ...two, items: [two.items[0]!, { ...two.items[0]!, id: 'i2', seq: 2, printPdfReadyAt: null }] })).toBe(false);
    expect(pdfReady({ ...two, items: [] })).toBe(false);
  });

  it('رویدادهای وضعیت با نام ادمین؛ برگرداندن با دلیلش؛ ویرایش گیرنده؛ رویداد ادمینِ وضعیت یک بار', () => {
    const at = (time: string) => tehran(`2026-10-05 ${time}`);
    const d = details({
      rest: {
        pdfJob: null,
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
      ['در صف چاپ ← در حال چاپ', 'سارا'],
      ['ویرایش گیرنده: نشانی، کد پستی', 'علی'],
      ['در حال چاپ ← تحویل پست شد', 'سارا'],
      ['برگرداندن: تحویل پست شد ← در حال چاپ؛ اشتباه زدم', 'مالک'],
      ['لغو شد', 'سارا'],
    ]);
  });
});
