/**
 * سرویس گزارش تولید و خروجی‌ها (`production.ts` و `exports.ts`، برش ۱۰٫۲) با ذخیره‌گاه ساختگی و ساعت ساختگی: مجوز پیش از هر خواندن،
 * محدوده و چاپخانهٔ انتخاب‌شده، مبلغ فقط با `orders.money`، سند خروجی، اکسل با رویداد، و دیوار دانلود PDF (خواهنده با همان دسترسی امروز).
 * کوئری‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { inflateRawSync } from 'node:zlib';

import { describe, expect, it, vi } from 'vitest';

import type {
  AdminEventInput,
  PanelScope,
  ProductionItem,
  ProductionOrder,
  ProductionPartner,
  ProductionRange,
  ProductionReportStore,
  ReportExportStore,
  ReportExportView,
  SettlementStore,
  ShippingReportStore,
} from '@jozveyar/db';

import { pdfContext } from '../reportDocument';
import type { AdminSession } from './auth';
import { createPanelExports, mayOpenExport } from './exports';
import { createPanelProduction } from './production';
import { createPanelReport } from './report';
import { ok } from './result';
import { createPanelSettlement } from './settlement';

const NOW = new Date('2026-10-14T07:50:00Z'); // چهارشنبه 22 مهر 1405، ساعت 11:20 تهران

function session(permissions: string[], over: Partial<AdminSession> = {}): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'elham',
    displayName: 'الهام فرجی',
    roles: ['owner'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner: null,
    ...over,
  };
}
const OWNER = session(['orders.read', 'orders.money', 'reports.read', 'reports.production']);
const ACCOUNTANT = session(['orders.read', 'orders.money', 'reports.read', 'reports.production'], { roles: ['accountant'] });
const OPERATOR = session(['orders.read', 'orders.money', 'shipments.import'], { roles: ['operator'] });
const NOOR_USER = session(['orders.read', 'orders.status', 'files.download', 'reports.production'], {
  userId: 'admin-2',
  displayName: 'حسن',
  roles: ['print_partner'],
  partner: { id: 'p-2', name: 'چاپ نور' },
});

const PARTNERS: ProductionPartner[] = [
  { id: 'p-1', name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران', active: true },
  { id: 'p-2', name: 'چاپ نور', cityName: 'مشهد', active: true },
  { id: 'p-3', name: 'چاپ آینده', cityName: 'تهران', active: false },
];

const item = (over: Partial<ProductionItem> = {}): ProductionItem => ({
  seq: 1,
  pageCount: 20,
  copies: 2,
  sidesMode: 'double',
  paperSize: 'a4',
  bindingTypeId: 'spiral_clear',
  bindingName: 'طلق و سیم',
  files: 1,
  colorSides: 0,
  bwSides: 20,
  sheets: 10,
  volumes: 1,
  papers: [{ id: 'tahrir80', name: 'تحریر ۸۰ گرم' }],
  ready: true,
  ...over,
});
const ORDERS: ProductionOrder[] = [
  { orderNumber: 10027, status: 'paid', paidAt: NOW, totalRials: 1_540_000n, partner: { id: 'p-1', name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران' }, shareRials: null, items: [item()] },
  { orderNumber: 10028, status: 'printing', paidAt: NOW, totalRials: 990_000n, partner: { id: 'p-2', name: 'چاپ نور', cityName: 'مشهد' }, shareRials: 594_000n, items: [item()] },
];

function productionStore(orders: ProductionOrder[] = ORDERS) {
  const calls: { scope: PanelScope; range: ProductionRange; partnerId: string | null }[] = [];
  const store: ProductionReportStore = {
    orders: vi.fn(async (scope: PanelScope, range: ProductionRange, partnerId: string | null) => {
      calls.push({ scope, range, partnerId });
      return orders.filter(
        (order) => (partnerId === null || order.partner?.id === partnerId) && (scope.kind === 'all' || order.partner?.id === scope.partnerId),
      );
    }),
    partners: vi.fn(async () => PARTNERS),
  };
  return { store, calls };
}

describe('گزارش تولید در پنل (برش ۱۰٫۲، سؤال‌های ۲۷۱ تا ۲۷۵)', () => {
  it('مجوز پیش از هر خواندن: متصدی ۴۰۳ و ذخیره‌گاه صدا زده نمی‌شود', async () => {
    const { store } = productionStore();
    const production = createPanelProduction({ store, now: () => NOW });
    expect(await production.view(OPERATOR, {})).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
    expect(await production.document(OPERATOR, {})).toMatchObject({ ok: false, status: 403 });
    expect(store.orders).not.toHaveBeenCalled();
    expect(store.partners).not.toHaveBeenCalled();
  });

  it('مالک و حسابدار: همهٔ چاپخانه‌ها با مبلغ، چیپ هر چاپخانه (غیرفعال هم)، و چاپخانهٔ نشانی فقط اگر در فهرست است', async () => {
    const { store, calls } = productionStore();
    const production = createPanelProduction({ store, now: () => NOW });
    const all = await production.view(ACCOUNTANT, {});
    expect(all.ok && all.value).toMatchObject({
      money: true,
      partnerId: null,
      partnerLabel: 'همهٔ چاپخانه‌ها',
      partners: [
        { id: 'p-1', label: 'چاپخانهٔ جزوه‌یار · تهران', selected: false },
        { id: 'p-2', label: 'چاپ نور · مشهد', selected: false },
        { id: 'p-3', label: 'چاپ آینده · تهران (غیرفعال)', selected: false },
      ],
      error: null,
      query: { chip: 'today' },
    });
    expect(all.ok && all.value.report?.totals.orders).toBe(2);
    expect(calls.at(-1)).toMatchObject({ scope: { kind: 'all' }, partnerId: null });

    const noor = await production.view(OWNER, { p: 'p-2' });
    expect(noor.ok && noor.value).toMatchObject({ partnerId: 'p-2', partnerLabel: 'چاپ نور · مشهد', form: { partner: 'p-2' } });
    expect(noor.ok && noor.value.partners?.find((p) => p.selected)?.id).toBe('p-2');
    expect(calls.at(-1)).toMatchObject({ scope: { kind: 'all' }, partnerId: 'p-2' });

    // شناسهٔ ناشناس یعنی همه، و صفحه همین را می‌گوید.
    const unknown = await production.view(OWNER, { p: 'p-404' });
    expect(unknown.ok && unknown.value).toMatchObject({ partnerId: null, partnerLabel: 'همهٔ چاپخانه‌ها' });
    expect(calls.at(-1)?.partnerId).toBeNull();
  });

  it('کاربر چاپخانه: محدودهٔ خودش در کوئری، بی چیپ و بی مبلغ، با نام و شهر خودش؛ چاپخانهٔ دیگر در نشانی نادیده', async () => {
    const { store, calls } = productionStore();
    const production = createPanelProduction({ store, now: () => NOW });
    const result = await production.view(NOOR_USER, { p: 'p-1' });
    expect(result.ok && result.value).toMatchObject({ money: false, partners: null, partnerId: null, partnerLabel: 'چاپ نور · مشهد' });
    expect(calls.at(-1)).toMatchObject({ scope: { kind: 'partner', partnerId: 'p-2' }, partnerId: null });
    expect(result.ok && result.value.report?.orders.map((o) => o.orderNumber)).toEqual([10028]);
    const doc = await production.document(NOOR_USER, {});
    expect(doc.ok && doc.value).toMatchObject({ money: false, printPartnerId: 'p-2' });
    expect(JSON.stringify(doc.ok && doc.value.document)).not.toContain('مبلغ');
  });

  it('فرم خطادار: خطا زیر فیلد، بی خواندن سفارش‌ها، و سند خروجی ۴۰۰', async () => {
    const { store } = productionStore();
    const production = createPanelProduction({ store, now: () => NOW });
    const result = await production.view(OWNER, { from: '1405/13/01', p: 'p-2' });
    expect(result.ok && result.value).toMatchObject({
      query: null,
      report: null,
      error: { field: 'from', error: 'invalid_day' },
      form: { from: '1405/13/01', partner: 'p-2' },
    });
    expect(store.orders).not.toHaveBeenCalled();
    expect(await production.document(OWNER, { from: '1405/13/01' })).toMatchObject({ ok: false, status: 400, error: 'invalid_report_range' });
  });

  it('سند خروجی مالک: با مبلغ و جدول چاپخانه‌ها، زمان ساختن و نام خواهنده، و بی محدوده', async () => {
    const { store } = productionStore();
    const production = createPanelProduction({ store, now: () => NOW });
    const result = await production.document(OWNER, { d: 'today' });
    if (!result.ok) throw new Error(result.error);
    const { document, money, printPartnerId } = result.value;
    expect([money, printPartnerId]).toEqual([true, null]);
    expect(document).toMatchObject({
      title: 'گزارش تولید',
      subtitle: 'پرداخت چهارشنبه 22 مهر · همهٔ چاپخانه‌ها',
      made: 'ساخته شده 22 مهر 1405، 11:20، الهام فرجی',
      fileBase: 'gozaresh-tolid-1405-07-22',
    });
    expect(document.stats.at(-2)).toEqual({ label: 'مبلغ (تومان)', value: 253_000 });
    // سهم چاپخانه (۱۰٫۳): فقط سفارش چاپ نور سهم دارد.
    expect(document.stats.at(-1)).toEqual({ label: 'سهم چاپخانه (تومان)', value: 59_400 });
    expect(document.tables.map((t) => t.title)).toEqual(['جزوه‌ها', 'صحافی', 'اندازه و کاغذ', 'چاپخانه‌ها']);
  });
});

/* ───────────────────────── خروجی‌ها ───────────────────────── */

const ID = '0b9d3c6e-1f2a-4b5c-8d7e-9f0a1b2c3d4e';

function exportStore(rows: Record<string, ReportExportView & { pdf?: Buffer }> = {}) {
  const created: Parameters<ReportExportStore['create']>[0][] = [];
  const store: ReportExportStore = {
    create: vi.fn(async (input) => {
      created.push(input);
      return ID;
    }),
    find: vi.fn(async (id: string) => {
      const row = rows[id];
      if (!row) return null;
      const { pdf: _pdf, ...view } = row;
      return view;
    }),
    file: vi.fn(async (id: string) => {
      const row = rows[id];
      return row?.pdf ? { pdf: row.pdf, report: row.report, fileName: row.fileName, money: row.money, printPartnerId: row.printPartnerId, requestedBy: row.requestedBy } : null;
    }),
  };
  return { store, created };
}

function shippingStore(): ShippingReportStore {
  return {
    handedSpan: vi.fn(async () => null),
    handedPerMonth: vi.fn(async () => []),
    handedOrders: vi.fn(async () => []),
    tariffBounds: vi.fn(async () => null),
    setting: vi.fn(async () => 'tariff'),
  };
}

function exportsOf(rows: Record<string, ReportExportView & { pdf?: Buffer }> = {}) {
  const events: AdminEventInput[] = [];
  const { store, created } = exportStore(rows);
  const production = createPanelProduction({ store: productionStore().store, now: () => NOW });
  const report = createPanelReport({ store: shippingStore(), now: () => NOW, log: () => undefined });
  // صورت‌حساب تسویه (۱۰٫۳) تست خودش را دارد (`settlement.test.ts`)؛ اینجا فقط «چاپخانه‌ای نیست».
  const settlement = createPanelSettlement({
    store: { statement: vi.fn(async () => null) } as unknown as SettlementStore,
    stepUp: async () => ok(true as const),
    secret: 's'.repeat(32),
    now: () => NOW,
  });
  const exports = createPanelExports({
    store,
    events: { logEvent: async (event) => void events.push(event) },
    production,
    report,
    settlement,
    secret: 's'.repeat(32),
    now: () => NOW,
  });
  return { exports, store, created, events, production };
}

const view = (over: Partial<ReportExportView> = {}): ReportExportView => ({
  id: ID,
  report: 'production',
  fileName: 'gozaresh-tolid-1405-07-22.pdf',
  subtitle: 'پرداخت چهارشنبه 22 مهر · همهٔ چاپخانه‌ها',
  money: true,
  printPartnerId: null,
  requestedBy: OWNER.userId,
  requestedAt: NOW,
  state: 'ready',
  finishedAt: NOW,
  pages: 3,
  sizeBytes: 12,
  error: null,
  retryError: null,
  ...over,
});

async function bytesOf(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(body).arrayBuffer());
}

describe('خروجی اکسل و PDF گزارش‌ها (برش ۱۰٫۲، سؤال‌های ۲۷۷ تا ۲۸۱)', () => {
  it('اکسل: همان سند گزارش، کتاب zip با برگهٔ «خلاصه»، نام فایل از بازه، و رویداد با بازه؛ بی مجوز ۴۰۳ و بی رویداد', async () => {
    const { exports, events } = exportsOf();
    const denied = await exports.xlsx(OPERATOR, 'production', {}, '10.0.0.1');
    expect(denied).toMatchObject({ ok: false, status: 403 });
    expect(events).toEqual([]);

    const result = await exports.xlsx(OWNER, 'production', { d: 'today' }, '10.0.0.1');
    if (!result.ok) throw new Error(result.error);
    expect(result.value.fileName).toBe('gozaresh-tolid-1405-07-22.xlsx');
    const bytes = await bytesOf(result.value.body);
    expect(bytes.length).toBe(result.value.sizeBytes);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    // برگهٔ اول: عنوان و زیرعنوان گزارش، از همان سند.
    const at = bytes.indexOf(Buffer.from('xl/worksheets/sheet1.xml'));
    expect(at).toBeGreaterThan(0);
    const packed = bytes.readUInt32LE(at - 30 + 18);
    const sheet = inflateRawSync(bytes.subarray(at + 'xl/worksheets/sheet1.xml'.length, at + 'xl/worksheets/sheet1.xml'.length + packed)).toString('utf8');
    expect(sheet).toContain('گزارش تولید');
    expect(sheet).toContain('پرداخت چهارشنبه 22 مهر · همهٔ چاپخانه‌ها');
    expect(events).toEqual([
      {
        adminUserId: OWNER.userId,
        action: 'reports.export',
        ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        detail: { report: 'production', format: 'xlsx', range: 'پرداخت چهارشنبه 22 مهر · همهٔ چاپخانه‌ها' },
        at: NOW,
      },
    ]);
  });

  it('صورت‌حساب تسویه با مجوز خودش (۱۰٫۳): `reports.production` تنها ۴۰۳ و بی رویداد، و PDF خواسته‌شده‌اش را باز نمی‌کند؛ `settlements.read` تنها تا سرویس تسویه می‌رسد', async () => {
    const { exports, events } = exportsOf();
    const partner = '1b0e6c8a-5d4f-4a2b-9c3d-7e8f9a0b1c2d';
    expect(await exports.xlsx({ ...OWNER, permissions: ['reports.production', 'orders.money'] }, 'settlement', { d: 'month', p: partner }, 'ip')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await exports.requestPdf({ ...OWNER, permissions: ['reports.production'] }, 'settlement', { d: 'month', p: partner }, 'ip')).toMatchObject({
      ok: false,
      status: 403,
    });
    // با `settlements.read` تنها، تا سرویس تسویه می‌رسد؛ اینجا چاپخانه‌ای نیست.
    expect(await exports.xlsx({ ...OWNER, permissions: ['settlements.read'] }, 'settlement', { d: 'month', p: partner }, 'ip')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(events).toEqual([]);
    // دانلود PDF صورت‌حساب همان مجوز صورت‌حساب را می‌خواهد، نه گزارش تولید.
    const row = { report: 'settlement' as const, money: false, printPartnerId: null, requestedBy: OWNER.userId };
    expect(mayOpenExport({ ...OWNER, permissions: ['settlements.read'] }, row)).toBe(true);
    expect(mayOpenExport({ ...OWNER, permissions: ['reports.production'] }, row)).toBe(false);
  });

  it('اکسل گزارش ارسال بی ماه داده‌دار ۴۰۴، و بی `reports.read` ۴۰۳ (کاربر چاپخانه گزارش ارسال ندارد)', async () => {
    const { exports, events } = exportsOf();
    expect(await exports.xlsx(OWNER, 'shipping', { month: '1405-07' }, 'ip')).toMatchObject({ ok: false, status: 404, error: 'report_empty' });
    expect(await exports.xlsx(NOOR_USER, 'shipping', {}, 'ip')).toMatchObject({ ok: false, status: 403 });
    expect(events).toEqual([]);
  });

  it('PDF: دادهٔ قالب همان سند (`pdfContext`)، نام فایل، دسترسی خواهنده و رویداد، با هم به ذخیره‌گاه', async () => {
    const { exports, created, production } = exportsOf();
    expect(await exports.requestPdf(OWNER, 'production', { d: 'today' }, 'ip')).toEqual({ ok: true, value: ID });
    const doc = await production.document(OWNER, { d: 'today' });
    if (!doc.ok) throw new Error(doc.error);
    expect(created).toEqual([
      {
        report: 'production',
        context: pdfContext(doc.value.document),
        fileName: 'gozaresh-tolid-1405-07-22.pdf',
        money: true,
        printPartnerId: null,
        requestedBy: OWNER.userId,
        event: {
          adminUserId: OWNER.userId,
          action: 'reports.export',
          ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          detail: { report: 'production', format: 'pdf', range: 'پرداخت چهارشنبه 22 مهر · همهٔ چاپخانه‌ها' },
          at: NOW,
        },
      },
    ]);
    // کاربر چاپخانه: بی مبلغ و با محدوده‌اش.
    await exports.requestPdf(NOOR_USER, 'production', {}, 'ip');
    expect(created.at(-1)).toMatchObject({ money: false, printPartnerId: 'p-2', requestedBy: NOOR_USER.userId });
    expect(JSON.stringify(created.at(-1)?.context)).not.toContain('مبلغ');
  });

  it('دانلود PDF فقط برای خواهنده، با همان مجوز، مبلغ و محدودهٔ امروز؛ هر چه نخواند ۴۰۴، و هنوز ساخته نشده ۴۰۹', async () => {
    const pdf = Buffer.from('%PDF-1.7 x');
    const { exports } = exportsOf({ [ID]: { ...view(), pdf } });
    const file = await exports.file(OWNER, ID);
    if (!file.ok) throw new Error(file.error);
    expect([file.value.fileName, file.value.sizeBytes]).toEqual(['gozaresh-tolid-1405-07-22.pdf', pdf.length]);
    expect(await bytesOf(file.value.body)).toEqual(pdf);
    // مالک دیگر (حسابدار با همان مجوزها) نه.
    expect(await exports.file({ ...ACCOUNTANT, userId: 'admin-9' }, ID)).toMatchObject({ ok: false, status: 404 });
    expect(await exports.view({ ...ACCOUNTANT, userId: 'admin-9' }, ID)).toMatchObject({ ok: false, status: 404 });
    // همان کاربر پس از عوض شدن نقش (۹٫۴): بی مجوز گزارش، یا بی مبلغ، یا با محدودهٔ چاپخانه، نه.
    expect(await exports.file({ ...OWNER, permissions: ['orders.read', 'orders.money'] }, ID)).toMatchObject({ ok: false, status: 404 });
    expect(await exports.file({ ...OWNER, permissions: ['reports.production'] }, ID)).toMatchObject({ ok: false, status: 404 });
    expect(await exports.file({ ...NOOR_USER, userId: OWNER.userId }, ID)).toMatchObject({ ok: false, status: 404 });
    expect(await exports.view(OWNER, 'not-a-uuid')).toMatchObject({ ok: false, status: 404 });
    expect(await exports.file(OWNER, 'a0b9d3c6-1f2a-4b5c-8d7e-9f0a1b2c3d4e')).toMatchObject({ ok: false, status: 404 });

    const building = exportsOf({ [ID]: view({ state: 'building', finishedAt: null, pages: null, sizeBytes: null }) }).exports;
    expect(await building.view(OWNER, ID)).toMatchObject({ ok: true, value: { state: 'building' } });
    expect(await building.file(OWNER, ID)).toMatchObject({ ok: false, status: 409, error: 'export_not_ready' });
  });

  it('`mayOpenExport`: خواهنده، مجوز همان گزارش، مبلغ و محدوده، هر کدام جدا', () => {
    const row = view();
    expect(mayOpenExport(OWNER, row)).toBe(true);
    expect(mayOpenExport(OWNER, { ...row, requestedBy: 'admin-9' })).toBe(false);
    expect(mayOpenExport({ ...OWNER, permissions: ['orders.money', 'reports.read'] }, row)).toBe(false);
    // گزارش ارسال با `reports.read`.
    expect(mayOpenExport({ ...OWNER, permissions: ['orders.money', 'reports.read'] }, { ...row, report: 'shipping' })).toBe(true);
    expect(mayOpenExport({ ...OWNER, permissions: ['reports.production'] }, row)).toBe(false);
    expect(mayOpenExport({ ...OWNER, permissions: ['reports.production'] }, { ...row, money: false })).toBe(true);
    const own = { ...row, money: false, printPartnerId: 'p-2', requestedBy: NOOR_USER.userId };
    expect(mayOpenExport(NOOR_USER, own)).toBe(true);
    expect(mayOpenExport(NOOR_USER, { ...own, printPartnerId: 'p-1' })).toBe(false);
    expect(mayOpenExport(NOOR_USER, { ...own, printPartnerId: null })).toBe(false);
    expect(mayOpenExport({ ...OWNER, userId: NOOR_USER.userId }, own)).toBe(false);
  });
});
