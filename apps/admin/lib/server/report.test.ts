/**
 * سرویس گزارش ارسال (`report.ts`، برش ۶٫۴) با ذخیره‌گاه ساختگی و ساعت ساختگی: مجوز پیش از هر خواندن، ماه‌های داده‌دار تازه‌ترین
 * اول، ماه نشانی، ماه جاری «تا امروز»، و منبع بازه‌های وزن. کوئری‌ها روی پستگرس در تست یکپارچگی `packages/db`.
 */

import { describe, expect, it, vi } from 'vitest';

import type { PanelScope, ShippingReportOrder, ShippingReportStore } from '@jozveyar/db';

import type { AdminSession } from './auth';
import { createPanelReport } from './report';

/** «حالا»ی طرح پنل: دوشنبه 13 مهر 1405، ساعت 11:20 تهران. */
const NOW = new Date('2026-10-05T07:50:00Z');
const SHAHRIVAR = new Date('2026-08-22T20:30:00Z');
const MEHR = new Date('2026-09-22T20:30:00Z');

function session(permissions: string[], partner: AdminSession['partner'] = null): AdminSession {
  return {
    sessionId: 's1',
    userId: 'admin-1',
    username: 'sara',
    displayName: 'سارا',
    roles: ['owner'],
    permissions,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    partner,
  };
}
const OWNER = session(['orders.read', 'reports.read', 'settings.edit', 'shipments.import']);
const OPERATOR = session(['orders.read', 'orders.money', 'shipments.import', 'shipments.review', 'tariff.read']);

const order = (orderNumber: number, over: Partial<ShippingReportOrder> = {}): ShippingReportOrder => ({
  orderNumber,
  zoneId: 'tehran',
  zoneName: 'استان تهران',
  partner: { id: 'p-1', name: 'چاپخانهٔ جزوه‌یار', cityName: 'تهران' },
  shippingRials: 1_295_000n,
  estWeightGrams: 690,
  parcels: 1,
  fareRials: 1_295_000n,
  taxRials: 129_500n,
  weightGrams: 765,
  ...over,
});

/**
 * ذخیره‌گاه ساختگی: «تحویل پست شد»های هر ماه با لحظه‌شان، تنظیم بازه‌ها و مرزهای تعرفه. هر فراخوانی ثبت می‌شود، تا «پیش از هر
 * خواندن» سنجیده شود.
 */
function memoryStore(handed: { at: Date; row: ShippingReportOrder }[], options: { bands?: unknown; tariff?: { version: number; bounds: number[] } | null } = {}) {
  const calls: { name: string; scope?: PanelScope }[] = [];
  const store: ShippingReportStore = {
    handedSpan: vi.fn(async (scope: PanelScope) => {
      calls.push({ name: 'handedSpan', scope });
      if (handed.length === 0) return null;
      const times = handed.map((h) => h.at.getTime());
      return { first: new Date(Math.min(...times)), last: new Date(Math.max(...times)) };
    }),
    handedPerMonth: vi.fn(async (scope: PanelScope, starts: readonly Date[]) => {
      calls.push({ name: 'handedPerMonth', scope });
      return starts.map((start, i) => {
        const end = starts[i + 1]?.getTime() ?? Infinity;
        return handed.filter((h) => h.at.getTime() >= start.getTime() && h.at.getTime() < end).length;
      });
    }),
    handedOrders: vi.fn(async (scope: PanelScope, { from, to }: { from: Date; to: Date }) => {
      calls.push({ name: 'handedOrders', scope });
      return handed.filter((h) => h.at >= from && h.at < to).map((h) => h.row);
    }),
    tariffBounds: vi.fn(async () => {
      calls.push({ name: 'tariffBounds' });
      return options.tariff === undefined ? { version: 1, bounds: [1_000, 3_000] } : options.tariff;
    }),
    setting: vi.fn(async () => {
      calls.push({ name: 'setting' });
      return options.bands ?? 'tariff';
    }),
  };
  return { store, calls };
}

const service = (store: ShippingReportStore, log: string[] = []) =>
  createPanelReport({ store, now: () => NOW, log: (message) => log.push(message) });

describe('گزارش ارسال: مجوز', () => {
  it('بی `reports.read`، ۴۰۳ پیش از هر خواندن: متصدی و چاپخانه', async () => {
    for (const who of [OPERATOR, session(['orders.read', 'orders.status', 'shipments.import'], { id: 'p-2', name: 'چاپ نور' })]) {
      const { store, calls } = memoryStore([{ at: MEHR, row: order(10001) }]);
      expect(await service(store).view(who, {})).toMatchObject({ ok: false, status: 403, error: 'forbidden' });
      expect(calls).toEqual([]);
    }
  });

  it('محدودهٔ نشست به ذخیره‌گاه می‌رسد (مالک: همه)', async () => {
    const { store, calls } = memoryStore([{ at: MEHR, row: order(10001) }]);
    await service(store).view(OWNER, {});
    expect(calls.filter((c) => c.scope).map((c) => c.scope)).toEqual([{ kind: 'all' }, { kind: 'all' }, { kind: 'all' }]);
    const partnerOwner = session(['reports.read'], { id: 'p-2', name: 'چاپ نور' });
    const other = memoryStore([{ at: MEHR, row: order(10001) }]);
    await service(other.store).view(partnerOwner, {});
    expect(other.calls.filter((c) => c.scope).every((c) => c.scope?.kind === 'partner')).toBe(true);
  });
});

describe('گزارش ارسال: ماه‌ها', () => {
  const handed = [
    { at: new Date(SHAHRIVAR.getTime() + 86_400_000), row: order(10001) },
    { at: new Date(MEHR.getTime() - 1_000), row: order(10002, { parcels: 0, fareRials: 0n, taxRials: 0n, weightGrams: 0 }) },
    { at: MEHR, row: order(10003) },
    { at: new Date(NOW.getTime() - 3_600_000), row: order(10004, { zoneId: 'other', zoneName: 'بقیهٔ کشور' }) },
  ];

  it('هنوز هیچ «تحویل پست شد»: بی ماه و بی گزارش، و بی خواندن ماه', async () => {
    const { store, calls } = memoryStore([]);
    const view = await service(store).view(OWNER, {});
    expect(view.ok && view.value).toMatchObject({ months: [], month: null, current: false, report: null });
    expect(calls.map((c) => c.name)).not.toContain('handedOrders');
    expect(calls.map((c) => c.name)).not.toContain('handedPerMonth');
  });

  it('فقط ماه‌های داده‌دار، تازه‌ترین اول؛ ماه جاری «تا امروز» و انتخاب‌شده', async () => {
    const { store } = memoryStore([...handed, { at: new Date('2026-06-01T08:00:00Z'), row: order(10000) }]);
    const view = await service(store).view(OWNER, {});
    if (!view.ok) throw new Error('view');
    // تیر ۱۴۰۵ داده دارد و مرداد نه: مرداد در چیپ‌ها نیست.
    expect(view.value.months.map((m) => [m.key, m.selected])).toEqual([
      ['1405-07', true],
      ['1405-06', false],
      ['1405-03', false],
    ]);
    expect(view.value.months[0]!.label).toEqual(['مهر ', { num: '1405' }, '، تا امروز']);
    expect(view.value.months[1]!.label).toEqual(['شهریور ', { num: '1405' }]);
    expect(view.value).toMatchObject({ month: { year: 1405, month: 7 }, current: true });
    expect(view.value.report!.total.orders).toBe(2);
  });

  it('ماه نشانی؛ ماه بی داده یا بدشکل یعنی تازه‌ترین ماه', async () => {
    const { store } = memoryStore(handed);
    const shahrivar = await service(store).view(OWNER, { month: '1405-06' });
    if (!shahrivar.ok) throw new Error('view');
    expect(shahrivar.value).toMatchObject({ month: { year: 1405, month: 6 }, current: false });
    expect(shahrivar.value.months.map((m) => m.selected)).toEqual([false, true]);
    // مرز نیمه‌شب: سفارش ۲۳:۵۹:۵۹ روز ۳۱ شهریور در شهریور، بی کد رهگیری.
    expect(shahrivar.value.report).toMatchObject({ untracked: 1, total: { orders: 1 } });
    for (const month of ['1405-05', '1405-08', 'x', '1405-6']) {
      const view = await service(store).view(OWNER, { month });
      expect(view.ok && view.value.month).toEqual({ year: 1405, month: 7 });
    }
  });

  it('ماه جاری بی داده: چیپ «تا امروز» نیست، و تازه‌ترین ماه داده‌دار انتخاب می‌شود', async () => {
    const { store } = memoryStore(handed.slice(0, 2));
    const view = await service(store).view(OWNER, {});
    if (!view.ok) throw new Error('view');
    expect(view.value.months.map((m) => m.key)).toEqual(['1405-06']);
    expect(view.value).toMatchObject({ month: { year: 1405, month: 6 }, current: false });
  });
});

describe('گزارش ارسال: بازه‌های وزن', () => {
  it('پیش‌فرض «tariff»: مرزهای کرایهٔ تعرفهٔ فعال، با نسخه؛ بی تعرفهٔ فعال یک بازه', async () => {
    const view = await service(memoryStore([{ at: MEHR, row: order(10001) }]).store).view(OWNER, {});
    expect(view.ok && view.value.bands).toEqual({ source: 'tariff', bounds: [1_000, 3_000], seen: 'tariff', tariff: { version: 1, bounds: [1_000, 3_000] } });
    expect(view.ok && view.value.report!.weights).toHaveLength(3);
    const none = await service(memoryStore([{ at: MEHR, row: order(10001) }], { tariff: null }).store).view(OWNER, {});
    expect(none.ok && none.value.bands).toMatchObject({ source: 'tariff', bounds: [], tariff: null });
    expect(none.ok && none.value.report!.weights).toHaveLength(1);
  });

  it('مرزهایی که مالک گذاشت، با «همان که دیده شد»؛ مقدار خراب پیش‌فرض با لاگ', async () => {
    const custom = await service(memoryStore([{ at: MEHR, row: order(10001) }], { bands: [750, 1_500] }).store).view(OWNER, {});
    expect(custom.ok && custom.value.bands).toEqual({ source: 'custom', bounds: [750, 1_500], seen: '750,1500', tariff: { version: 1, bounds: [1_000, 3_000] } });
    const log: string[] = [];
    const broken = await service(memoryStore([{ at: MEHR, row: order(10001) }], { bands: [3_000, 1_000] }).store, log).view(OWNER, {});
    expect(broken.ok && broken.value.bands.source).toBe('tariff');
    expect(log.join()).toContain('report.weight_bands');
  });

  it('«بازه‌ها را عوض کن» فقط با `settings.edit`', async () => {
    const { store } = memoryStore([{ at: MEHR, row: order(10001) }]);
    const owner = await service(store).view(OWNER, {});
    expect(owner.ok && owner.value.canEditBands).toBe(true);
    const reader = await service(store).view(session(['reports.read']), {});
    expect(reader.ok && reader.value.canEditBands).toBe(false);
  });
});
