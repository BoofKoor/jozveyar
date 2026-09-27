/**
 * تعرفهٔ صفحهٔ اصلی روی سرور (برش ۴٫۴، ADR-040): در build و بی پایگاه داده تعرفهٔ پایه؛ با پایگاه داده همان تعرفهٔ فعال
 * و `order.sla_days` که مسیر خرید با آنها قیمت می‌دهد؛ و خطای پایگاه داده بالا می‌رود تا ISR صفحهٔ قبلی را نگه دارد.
 * پایگاه داده ساختگی است؛ خود `activePriceList` و `setting` در تست یکپارچگی `packages/db`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PriceList } from '@jozveyar/contracts';
import { DEFAULT_SETTINGS } from '@jozveyar/db';
import { SEED_PRICE_LIST } from '@jozveyar/pricing/seed';

import { SEED_TARIFF } from '../tariff';
import { loadTariff, siteTariff } from './tariff';

const V2: PriceList = { ...SEED_PRICE_LIST, version: 2, label: 'نسخهٔ دوم', clickRates: { color: 30_000, bw: 20_000 } };
const DB = 'postgresql://jozveyar@127.0.0.1:5432/jozveyar';

function source(settings: Record<string, unknown> = {}, list: PriceList | Error = V2) {
  return {
    activePriceList: vi.fn(async () => {
      if (list instanceof Error) throw list;
      return list;
    }),
    setting: vi.fn(async (key: string) => settings[key]),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('تعرفهٔ صفحهٔ اصلی', () => {
  it('روز کاری تعرفهٔ پایه همان پیش‌فرض order.sla_days است: ۲ (ADR-013)', () => {
    expect(DEFAULT_SETTINGS['order.sla_days']).toBe(2);
    expect(SEED_TARIFF.slaDays).toBe(DEFAULT_SETTINGS['order.sla_days']);
  });

  it('در build، حتی با DATABASE_URL، تعرفهٔ پایه، بی سراغ پایگاه داده', async () => {
    const db = source({ 'order.sla_days': 3 });
    expect(await siteTariff({ NEXT_PHASE: 'phase-production-build', DATABASE_URL: DB }, () => db)).toBe(SEED_TARIFF);
    expect(db.activePriceList).not.toHaveBeenCalled();
  });

  it('بی DATABASE_URL (سرتاسری بی سرویس) تعرفهٔ پایه', async () => {
    const db = source();
    expect(await siteTariff({}, () => db)).toBe(SEED_TARIFF);
    expect(await siteTariff({ DATABASE_URL: '' }, () => db)).toBe(SEED_TARIFF);
    expect(db.activePriceList).not.toHaveBeenCalled();
  });

  it('با پایگاه داده: تعرفهٔ فعال و روز کاری از settings', async () => {
    const db = source({ 'order.sla_days': 3 });
    expect(await siteTariff({ DATABASE_URL: DB, NEXT_PHASE: 'phase-production-server' }, () => db)).toEqual({ priceList: V2, slaDays: 3 });
    expect(db.setting).toHaveBeenCalledWith('order.sla_days');
  });

  it('روز کاری نبود: ۲؛ خراب: همان ۲، بلند در لاگ', async () => {
    expect(await loadTariff(source())).toEqual({ priceList: V2, slaDays: 2 });
    for (const broken of [0, 31, 2.5, '3', null]) {
      const log = vi.fn();
      const { slaDays } = await loadTariff(source({ 'order.sla_days': broken }), log);
      expect(slaDays, String(broken)).toBe(2);
      if (broken !== null) expect(log).toHaveBeenCalledWith(expect.stringContaining('order.sla_days'), expect.anything());
    }
  });

  it('خطای پایگاه داده بالا می‌رود، بلند در لاگ؛ تعرفهٔ پایه نه', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    await expect(siteTariff({ DATABASE_URL: DB }, () => source({}, down))).rejects.toBe(down);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('صفحهٔ اصلی'), down);
  });
});
